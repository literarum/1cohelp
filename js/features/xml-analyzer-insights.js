'use strict';

/**
 * Аналитика поверх XmlDoc: ключевые реквизиты, быстрые выводы, таблицы повторяющихся элементов,
 * сравнение двух документов, экспорт (CSV/JSON/текст для тикета).
 */

import { NODE_KIND, decodeXmlEntities } from './xml-analyzer-model.js';
import {
    REQUISITE_LABELS,
    checkRequisite,
    isPlaceholderValue,
    parseAmount,
    parseDateValue,
    requisiteKindByName,
    validateEmail,
    validateSnils,
} from './xml-analyzer-ids.js';
import { certValidityState } from './xml-analyzer-crypto.js';

const REQUIRED_KINDS = new Set(['inn', 'snils', 'ogrn', 'kpp', 'regNumber', 'bik', 'account']);

// ---------------------------------------------------------------------------
// Ключевые реквизиты
// ---------------------------------------------------------------------------

/**
 * Собирает реквизиты (ИНН, КПП, ОГРН, СНИЛС, БИК, счета, даты, суммы, рег. номера…) по именам тегов/атрибутов
 * и проверяет контрольные суммы.
 * @returns {{items:Array, empty:Array, bik:string|null, amountTotal:number|null, amountCount:number}}
 */
export function collectRequisites(doc, { perKind = 10, selfScanLimit = 200000 } = {}) {
    const nameKind = doc.names.map((n) => requisiteKindByName(n));
    const groups = new Map(); // kind|value -> item
    const countByKind = new Map();
    const empties = new Map(); // name -> {kind, count, node}
    let amountTotal = 0;
    let amountCount = 0;
    const bikSet = new Set();

    const add = (kind, value, node, attr) => {
        const key = kind + '\u0001' + value;
        let it = groups.get(key);
        if (it) {
            it.count++;
            return;
        }
        const total = countByKind.get(kind) || 0;
        countByKind.set(kind, total + 1);
        if (total >= perKind * 3 && kind !== 'inn' && kind !== 'snils' && kind !== 'ogrn' && kind !== 'kpp') return;
        it = { kind, label: REQUISITE_LABELS[kind] || kind, value, node, attr: attr || null, count: 1 };
        groups.set(key, it);
        if (kind === 'bik' && /^\d{9}$/.test(value)) bikSet.add(value);
    };

    const n = doc.n;
    for (let i = 1; i < n; i++) {
        if (doc.kind[i] !== NODE_KIND.ELEMENT) continue;
        const nk = nameKind[doc.nameId[i]];
        if (nk && doc.first[i] < 0) {
            const v = doc.ownText(i);
            if (!v || (REQUIRED_KINDS.has(nk) && isPlaceholderValue(v))) {
                if (REQUIRED_KINDS.has(nk) || nk === 'org') {
                    const nm = doc.name(i);
                    const e = empties.get(nm);
                    if (e) e.count++;
                    else if (empties.size < 30) empties.set(nm, { kind: nk, name: nm, count: 1, node: i, value: v });
                }
                if (!v) continue;
            }
            if (nk === 'amount') {
                const a = parseAmount(v);
                if (a !== null) {
                    amountTotal += a;
                    amountCount++;
                }
            }
            add(nk, v, i, null);
        }
        const c = doc.aCnt[i];
        if (c) {
            const s = doc.aStart[i];
            for (let a = 0; a < c; a++) {
                const k = nameKind[doc.aName[s + a]];
                if (!k) continue;
                const v = decodeXmlEntities(doc.src.slice(doc.aVs[s + a], doc.aVe[s + a])).trim();
                if (!v) continue;
                if (k === 'amount') {
                    const am = parseAmount(v);
                    if (am !== null) {
                        amountTotal += am;
                        amountCount++;
                    }
                }
                add(k, v, i, doc.names[doc.aName[s + a]]);
            }
        } else if (i < selfScanLimit && doc.first[i] < 0 && !nk) {
            // самоидентифицирующиеся значения: СНИЛС «123-456-789 01» и email
            const ts = doc.ts[i];
            if (ts >= 0) {
                const len = doc.te[i] - ts;
                if (len === 14) {
                    const v = doc.ownText(i);
                    if (/^\d{3}-\d{3}-\d{3} \d{2}$/.test(v)) add('snils', v, i, null);
                } else if (len > 5 && len < 80) {
                    const v = doc.ownText(i);
                    if (v.includes('@') && validateEmail(v).ok) add('email', v, i, null);
                }
            }
        }
    }

    const bik = bikSet.size === 1 ? [...bikSet][0] : null;
    const items = [...groups.values()];
    for (const it of items) {
        const chk = checkRequisite(it.kind, it.value, { bik });
        it.status = chk.status;
        it.note = chk.note;
    }
    const order = ['inn', 'kpp', 'ogrn', 'snils', 'regNumber', 'bik', 'account', 'corrAccount', 'oktmo', 'kbk', 'org', 'email', 'phone', 'guid', 'date', 'amount'];
    items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    // ограничиваем «шумные» виды
    const shown = new Map();
    const limited = items.filter((it) => {
        const c = (shown.get(it.kind) || 0) + 1;
        shown.set(it.kind, c);
        return it.status === 'error' || c <= perKind;
    });
    return {
        items: limited,
        hiddenCount: items.length - limited.length,
        empty: [...empties.values()],
        bik,
        amountTotal: amountCount ? amountTotal : null,
        amountCount,
    };
}

// ---------------------------------------------------------------------------
// Быстрые выводы
// ---------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {import('./xml-analyzer-model.js').XmlDoc} p.doc
 * @param {object} p.requisites результат collectRequisites
 * @param {object} p.sign результат findSignatures
 * @param {object} [p.meta] {encodingUsed, fileName, size, truncatedByApp}
 * @returns {Array<{level:'error'|'warn'|'info'|'ok', text:string, node?:number}>}
 */
export function buildFindings({ doc, requisites, sign, meta = {}, now = new Date() }) {
    const out = [];
    const push = (level, text, node) => out.push({ level, text, node });

    if (doc) {
        if (doc.errors.length) {
            const e = doc.errors[0];
            const lc = doc.lineCol(e.offset);
            const extra = doc.errors.length + (doc.errorsSuppressed || 0) - 1;
            push(
                'error',
                `XML содержит ошибки структуры (${doc.errors.length + (doc.errorsSuppressed || 0)}): ${e.message} — строка ${lc.line}, позиция ${lc.col}${extra > 0 ? `; ещё ошибок: ${extra}` : ''}. Показано всё, что удалось разобрать.`,
            );
        }
        if (doc.truncated === 'depth') push('error', 'Документ слишком глубоко вложен — разбор остановлен на предельной глубине.');
        if (doc.truncated === 'nodes') push('error', 'Документ слишком велик — загружена только его начальная часть.');
        for (const w of doc.warnings) push('warn', w);
        if (meta.encodingNote) push('warn', meta.encodingNote);
        if (doc.decl && doc.decl.encoding && meta.encodingUsed && !sameEncoding(doc.decl.encoding, meta.encodingUsed)) {
            push(
                'warn',
                `Кодировка в XML-декларации (${doc.decl.encoding}) отличается от фактически определённой (${meta.encodingUsed}) — возможны искажённые символы.`,
            );
        }
        if (/�/.test(doc.src.slice(0, 200000))) {
            push('warn', 'В тексте есть символы замены «�» — файл, вероятно, прочитан в неверной кодировке.');
        }

    }

    const inns = new Set();
    for (const it of requisites.items) {
        if (it.kind === 'inn') inns.add(it.value);
        if (it.status === 'error') {
            const where = it.attr ? `атрибут ${it.attr}` : `<${doc.name(it.node)}>`;
            push('error', `${it.label} «${it.value}» (${where}): ${it.note}`, it.node);
        }
    }
    for (const e of requisites.empty) {
        push(
            'warn',
            `Не заполнен обязательный реквизит <${e.name}> (${REQUISITE_LABELS[e.kind] || e.kind})${e.count > 1 ? ` — ${e.count} раз` : ''}${e.value ? `, значение «${e.value}»` : ''}`,
            e.node,
        );
    }

    const certs = sign.certificates || [];
    for (const c of certs) {
        const st = certValidityState(c.validity, now);
        const who = c.ownerFio && c.ownerFio !== 'Не удалось извлечь' ? c.ownerFio : c.thumbprint;
        if (st.state === 'expired') push('error', `Сертификат «${who}» ${st.label}.`, c.node);
        else if (st.state === 'notyet') push('error', `Сертификат «${who}» ${st.label}.`, c.node);
        else if (st.state === 'soon') push('warn', `Сертификат «${who}» ${st.label}.`, c.node);
        else if (st.state === 'unknown') push('warn', `Сертификат «${who}»: срок действия не определён.`, c.node);
        const certInn = c.subject && (c.subject.INN || c.subject.INNLE);
        if (certInn && inns.size) {
            const cleaned = String(certInn).replace(/^0+(?=\d{10,})/, '');
            const matches = [...inns].some((x) => x === certInn || x === cleaned || x.padStart(12, '0') === certInn);
            if (!matches) {
                push('warn', `ИНН в сертификате «${who}» (${certInn}) не совпадает с ИНН в документе (${[...inns].join(', ')}).`, c.node);
            }
        }
        const sn = c.subject && c.subject.SNILS;
        if (sn && !validateSnils(sn).ok) push('warn', `СНИЛС в сертификате «${who}» (${sn}) не проходит проверку контрольного числа.`, c.node);
        if (c.selfSigned) push('info', `Сертификат «${who}» самоподписанный.`, c.node);
    }
    for (const sig of sign.signatures || []) {
        const real = sig.certs.filter((c) => !c.error);
        if (!sig.certs.length) push('warn', 'Подпись XMLDSig не содержит сертификата (X509Certificate) — проверить подписанта нельзя.', sig.node);
        for (const bad of sig.certs.filter((c) => c.error)) {
            push('error', `Сертификат в подписи не разобран: ${bad.error}`, bad.node);
        }
        if (sig.signingTime && real.length) {
            const t = new Date(sig.signingTime);
            const v = real[0].validity;
            if (!Number.isNaN(t.getTime()) && v && v.notAfter && v.notBefore && (t > v.notAfter || t < v.notBefore)) {
                push('error', `Подпись создана ${t.toLocaleString('ru-RU')} вне срока действия сертификата.`, sig.node);
            }
        }
    }
    for (const cms of sign.cms || []) {
        for (const s of cms.signers) {
            const real = cms.certs.filter((c) => !c.error)[0];
            if (s.signingTime && real && real.validity && real.validity.notAfter) {
                if (s.signingTime > real.validity.notAfter || s.signingTime < real.validity.notBefore) {
                    push('error', `CMS-подпись создана ${s.signingTime.toLocaleString('ru-RU')} вне срока действия сертификата.`, cms.node);
                }
            }
        }
        if (cms.detached) push('info', 'Подпись CMS отсоединённая (подписываемые данные хранятся отдельно).', cms.node);
    }
    if (!certs.length && !(sign.signatures || []).length && !(sign.cms || []).length) {
        push('info', 'Электронная подпись и сертификаты в документе не найдены.');
    }
    for (const i of sign.issues || []) push('warn', i);

    if (!out.some((f) => f.level === 'error' || f.level === 'warn')) {
        out.push({ level: 'ok', text: 'Явных проблем не обнаружено: структура корректна, реквизиты и сертификаты в порядке.' });
    }
    const rank = { error: 0, warn: 1, info: 2, ok: 3 };
    out.sort((a, b) => rank[a.level] - rank[b.level]);
    return out;
}

function sameEncoding(a, b) {
    const n = (x) =>
        String(x)
            .toLowerCase()
            .replace(/^cp1251$/, 'windows-1251')
            .replace(/^utf8$/, 'utf-8')
            .replace(/^utf-16(le|be)$/, 'utf-16');
    return n(a) === n(b);
}

// ---------------------------------------------------------------------------
// Таблицы повторяющихся элементов
// ---------------------------------------------------------------------------

/** Структура документа: уникальные пути с числом элементов. */
export function structureRows(doc) {
    const rows = [];
    for (let p = 1; p < doc.pathName.length; p++) {
        const attrs = doc.pathAttrs[p] ? [...doc.pathAttrs[p]] : [];
        let depth = 0;
        for (let q = p; q > 0; q = doc.pathParent[q]) depth++;
        rows.push({
            pathId: p,
            path: doc.pathString(p),
            name: doc.names[doc.pathName[p]],
            depth,
            count: doc.pathCount[p],
            withText: doc.pathText[p],
            withChildren: doc.pathKids[p],
            attrs,
        });
    }
    return rows;
}

/** Все элементы с данным структурным путём. */
export function nodesOfPath(doc, pathId, limit = 200000) {
    const out = [];
    for (let i = 1; i < doc.n && out.length < limit; i++) {
        if (doc.pathId[i] === pathId && doc.kind[i] === NODE_KIND.ELEMENT) out.push(i);
    }
    return out;
}

/**
 * Модель таблицы по списку одноимённых элементов.
 */
export function buildTable(doc, nodes, { maxColumns = 40, sample = 300 } = {}) {
    const columns = [];
    const seen = new Set();
    let hasText = false;
    const take = Math.min(nodes.length, sample);
    for (let k = 0; k < take; k++) {
        const n = nodes[k];
        for (const a of doc.attrs(n)) {
            const key = '@' + a.name;
            if (!seen.has(key) && columns.length < maxColumns) {
                seen.add(key);
                columns.push({ key, label: a.name, type: 'attr', nameId: doc.nameMap.get(a.name) });
            }
        }
        for (let c = doc.first[n]; c >= 0; c = doc.next[c]) {
            if (doc.kind[c] !== NODE_KIND.ELEMENT) continue;
            const key = '<' + doc.nameId[c];
            if (!seen.has(key) && columns.length < maxColumns) {
                seen.add(key);
                columns.push({ key, label: doc.name(c), type: 'child', nameId: doc.nameId[c] });
            }
        }
        if (doc.hasOwnText(n)) hasText = true;
    }
    if (hasText && columns.length < maxColumns + 1) columns.push({ key: '#text', label: '(текст)', type: 'text' });
    const cell = (n, col) => {
        if (col.type === 'attr') return doc.attr(n, col.label) ?? '';
        if (col.type === 'text') return doc.ownText(n);
        for (let c = doc.first[n]; c >= 0; c = doc.next[c]) {
            if (doc.nameId[c] === col.nameId && doc.kind[c] === NODE_KIND.ELEMENT) {
                return doc.first[c] < 0 ? doc.ownText(c) : doc.textContent(c, 300).replace(/\s+/g, ' ').trim();
            }
        }
        return '';
    };
    return { columns, nodes, cell };
}

/** Самая частая повторяющаяся группа дочерних элементов узла. */
export function repeatedChildren(doc, n) {
    const counts = new Map();
    for (let c = doc.first[n]; c >= 0; c = doc.next[c]) {
        if (doc.kind[c] !== NODE_KIND.ELEMENT) continue;
        const id = doc.nameId[c];
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    let best = -1;
    let bestN = 1;
    for (const [id, c] of counts) {
        if (c > bestN) {
            best = id;
            bestN = c;
        }
    }
    if (best < 0) return [];
    const out = [];
    for (let c = doc.first[n]; c >= 0; c = doc.next[c]) {
        if (doc.nameId[c] === best && doc.kind[c] === NODE_KIND.ELEMENT) out.push(c);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Экспорт
// ---------------------------------------------------------------------------

function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV для Excel (разделитель «;», BOM добавляет вызывающий). */
export function toCsv(rows) {
    return rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function tableToCsvRows(table, nodes = table.nodes) {
    const rows = [table.columns.map((c) => c.label)];
    for (const n of nodes) rows.push(table.columns.map((c) => table.cell(n, c)));
    return rows;
}

export function requisitesToCsvRows(requisites) {
    const rows = [['Тип', 'Значение', 'Проверка', 'Комментарий', 'Повторов']];
    for (const it of requisites.items) {
        rows.push([it.label, it.value, it.status === 'ok' ? 'корректно' : it.status === 'error' ? 'ошибка' : '', it.note, it.count]);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Текстовый отчёт для тикета
// ---------------------------------------------------------------------------

const LEVEL_MARK = { error: '[ОШИБКА]', warn: '[ВНИМАНИЕ]', info: '[инфо]', ok: '[ОК]' };

function fmtBytes(b) {
    if (b < 1024) return b + ' Б';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' КБ';
    return (b / 1048576).toFixed(1) + ' МБ';
}

export function buildTextReport({ doc, requisites, sign, findings, meta = {}, now = new Date() }) {
    const st = doc.stats();
    const L = [];
    L.push('ОТЧЁТ АНАЛИЗА XML');
    L.push(`Дата анализа: ${now.toLocaleString('ru-RU')}`);
    if (meta.fileName) L.push(`Файл: ${meta.fileName}`);
    L.push(`Размер: ${fmtBytes(meta.size ?? doc.src.length)}; узлов: ${st.nodes.toLocaleString('ru-RU')}; глубина: ${st.maxDepth}`);
    L.push(`Корневой элемент: ${st.rootName || '—'}${st.rootNamespace ? ` (пространство имён ${st.rootNamespace})` : ''}`);
    if (meta.encodingUsed || (doc.decl && doc.decl.encoding)) {
        L.push(`Кодировка: ${meta.encodingUsed || '—'}${doc.decl && doc.decl.encoding ? ` (в декларации: ${doc.decl.encoding})` : ''}`);
    }
    if (meta.reportType) L.push(`Тип документа: ${meta.reportType}`);
    const ver = formatVersionOf(doc);
    if (ver) L.push(`Версия/схема формата: ${ver}`);
    L.push('');
    L.push('БЫСТРЫЕ ВЫВОДЫ');
    for (const f of findings) L.push(`${LEVEL_MARK[f.level]} ${f.text}`);
    if (requisites.items.length) {
        L.push('');
        L.push('КЛЮЧЕВЫЕ РЕКВИЗИТЫ');
        for (const it of requisites.items) {
            const mark = it.status === 'ok' ? 'корректно' : it.status === 'error' ? 'ОШИБКА' : '';
            L.push(`- ${it.label}: ${it.value}${mark ? ` — ${mark}` : ''}${it.note && it.status !== 'ok' ? ` (${it.note})` : ''}`);
        }
    }
    if (sign.certificates.length) {
        L.push('');
        L.push('СЕРТИФИКАТЫ');
        for (const c of sign.certificates) {
            const v = certValidityState(c.validity, now);
            L.push(`- ${c.ownerFio}${c.subject && c.subject.O ? `, ${c.subject.O}` : ''}`);
            L.push(`  Отпечаток SHA-1: ${c.thumbprint}`);
            L.push(`  Серийный номер: ${c.serialNumber}`);
            L.push(`  Издатель: ${(c.issuer && (c.issuer.CN || c.issuer.O)) || '—'}`);
            L.push(`  Срок: ${fmtDate(c.validity.notBefore)} — ${fmtDate(c.validity.notAfter)} (${v.label})`);
        }
    }
    L.push('');
    L.push('Сформировано анализатором XML «Copilot 1СО».');
    return L.join('\n');
}

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString('ru-RU') : '—';
}

/** Версия/схема формата по типичным атрибутам корня. */
export function formatVersionOf(doc) {
    const r = doc.rootElement;
    if (r < 0) return '';
    const parts = [];
    for (const a of doc.attrs(r)) {
        const nm = a.name.includes(':') ? a.name.slice(a.name.indexOf(':') + 1) : a.name;
        if (/верс|version|формат|schema|xsd|схем/i.test(nm) && !/^xmlns/.test(a.name)) parts.push(`${a.name}=${a.value}`);
    }
    const sl = doc.attrs(r).find((a) => /schemaLocation$/i.test(a.name));
    if (sl) parts.push(`schemaLocation=${sl.value.slice(0, 200)}`);
    const ns = doc.namespaceUri(r);
    if (ns && !parts.length) parts.push(`xmlns=${ns}`);
    return parts.join('; ');
}

// ---------------------------------------------------------------------------
// Сравнение двух документов
// ---------------------------------------------------------------------------

const KEY_NAMES = ['id', 'ид', 'идентификатор', 'guid', 'uid', 'uuid', 'код', 'номер', 'наименование', 'имя', 'name', 'key', 'отпечаток', 'ключ'];

function keyOfElement(doc, n) {
    for (const a of doc.attrs(n)) {
        const ln = (a.name.includes(':') ? a.name.slice(a.name.indexOf(':') + 1) : a.name).toLowerCase();
        if (KEY_NAMES.includes(ln) && a.value) return `${a.name}=${a.value}`;
    }
    for (let c = doc.first[n]; c >= 0; c = doc.next[c]) {
        if (doc.kind[c] !== NODE_KIND.ELEMENT || doc.first[c] >= 0) continue;
        const ln = doc.localName(c).toLowerCase();
        if (KEY_NAMES.includes(ln)) {
            const v = doc.ownText(c);
            if (v) return `${doc.name(c)}=${v.slice(0, 60)}`;
        }
    }
    return null;
}

/** Плоское представление документа для сравнения: Map<путь, {value, attrs}> */
export function flattenForDiff(doc, cap = 300000) {
    const map = new Map();
    const paths = new Map();
    let count = 0;
    let capped = false;
    const segFor = (parent) => {
        const kids = [];
        const groups = new Map();
        for (let c = doc.first[parent]; c >= 0; c = doc.next[c]) {
            if (doc.kind[c] !== NODE_KIND.ELEMENT) continue;
            kids.push(c);
            const g = groups.get(doc.nameId[c]);
            if (g) g.push(c);
            else groups.set(doc.nameId[c], [c]);
        }
        const res = new Map();
        for (const [, list] of groups) {
            if (list.length === 1) {
                res.set(list[0], doc.name(list[0]));
                continue;
            }
            const keys = list.map((c) => keyOfElement(doc, c));
            const uniq = keys.every((k) => k !== null) && new Set(keys).size === keys.length;
            list.forEach((c, i) => {
                res.set(c, uniq ? `${doc.name(c)}[@${keys[i]}]` : `${doc.name(c)}[${i + 1}]`);
            });
        }
        return res;
    };
    // обход в порядке документа: путь ребёнка выдаёт родитель
    const rootSegs = segFor(0);
    for (const [c, seg] of rootSegs) paths.set(c, '/' + seg);
    for (let i = 1; i < doc.n; i++) {
        if (doc.kind[i] !== NODE_KIND.ELEMENT) continue;
        const path = paths.get(i);
        if (path === undefined) continue;
        if (++count > cap) {
            capped = true;
            break;
        }
        const attrs = doc.attrs(i)
            .filter((a) => !/^xmlns(:|$)/.test(a.name))
            .map((a) => `${a.name}=${a.value}`)
            .sort()
            .join(' | ');
        map.set(path, { value: doc.ownText(i), attrs, node: i });
        if (doc.first[i] >= 0) {
            for (const [c, seg] of segFor(i)) paths.set(c, path + '/' + seg);
        }
        paths.delete(i);
    }
    return { map, capped };
}

/**
 * Сравнивает два документа по структуре и значениям.
 * @returns {{added:Array, removed:Array, changed:Array, same:number, capped:boolean}}
 */
export function diffDocs(a, b, { cap = 300000, maxItems = 5000 } = {}) {
    const fa = flattenForDiff(a, cap);
    const fb = flattenForDiff(b, cap);
    const added = [];
    const removed = [];
    const changed = [];
    let same = 0;
    let addedTotal = 0;
    let removedTotal = 0;
    let changedTotal = 0;
    for (const [path, va] of fa.map) {
        const vb = fb.map.get(path);
        if (!vb) {
            removedTotal++;
            if (removed.length < maxItems) removed.push({ path, a: va.value, aAttrs: va.attrs, nodeA: va.node });
        } else if (va.value !== vb.value || va.attrs !== vb.attrs) {
            changedTotal++;
            if (changed.length < maxItems) {
                changed.push({ path, a: va.value, b: vb.value, aAttrs: va.attrs, bAttrs: vb.attrs, nodeA: va.node, nodeB: vb.node });
            }
        } else same++;
    }
    for (const [path, vb] of fb.map) {
        if (!fa.map.has(path)) {
            addedTotal++;
            if (added.length < maxItems) added.push({ path, b: vb.value, bAttrs: vb.attrs, nodeB: vb.node });
        }
    }
    return { added, removed, changed, same, addedTotal, removedTotal, changedTotal, capped: fa.capped || fb.capped };
}

export function diffToCsvRows(diff) {
    const rows = [['Тип', 'Путь', 'Было', 'Стало', 'Атрибуты было', 'Атрибуты стало']];
    for (const r of diff.removed) rows.push(['удалено', r.path, r.a, '', r.aAttrs, '']);
    for (const r of diff.added) rows.push(['добавлено', r.path, '', r.b, '', r.bAttrs]);
    for (const r of diff.changed) rows.push(['изменено', r.path, r.a, r.b, r.aAttrs, r.bAttrs]);
    return rows;
}

export { parseDateValue };
