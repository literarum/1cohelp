'use strict';

/**
 * «Проверка реквизитов»: находит в произвольном тексте ИНН, КПП, ОГРН/ОГРНИП, СНИЛС, БИК, счета и e-mail
 * и проверяет контрольные суммы теми же валидаторами, что и XML-анализатор. Чистая логика, без DOM.
 */

import {
    validateInn,
    validateSnils,
    validateOgrn,
    validateKpp,
    validateBik,
    validateAccount,
    validateEmail,
} from './xml-analyzer-ids.js';

export const REQUISITE_KIND_LABELS = {
    inn: 'ИНН',
    kpp: 'КПП',
    ogrn: 'ОГРН',
    snils: 'СНИЛС',
    bik: 'БИК',
    account: 'Расчётный счёт',
    corrAccount: 'Корр. счёт',
    email: 'E-mail',
};

const LABEL_RE =
    /(ИНН|КПП|ОГРНИП|ОГРН|БИК|СНИЛС|р\/с|р\.\s?с\.|расч[её]тн\w*\s+сч[её]т|к\/с|к\.\s?с\.|корр?\.?\s*сч[её]т|корреспондентск\w*\s+сч[её]т)\s*[:№#=\-–—]?\s*(\d[\d \-]{6,28}\d|[0-9A-Z]{9})(?![0-9A-Za-z])/gi;

const LABEL_KIND = (label) => {
    const l = label.toLowerCase().replace(/ё/g, 'е');
    if (l === 'инн') return 'inn';
    if (l === 'кпп') return 'kpp';
    if (l.startsWith('огрн')) return 'ogrn';
    if (l === 'бик') return 'bik';
    if (l === 'снилс') return 'snils';
    if (l.startsWith('к/с') || l.startsWith('к.') || l.startsWith('корр') ) return 'corrAccount';
    return 'account';
};

function checkValue(kind, value, ctx) {
    switch (kind) {
        case 'inn': {
            const r = validateInn(value);
            return r.ok
                ? { status: 'ok', note: `контрольная сумма сошлась (${r.kind})` }
                : { status: 'error', note: r.reason };
        }
        case 'kpp': {
            const r = validateKpp(value);
            return r.ok ? { status: 'ok', note: 'формат верный' } : { status: 'error', note: r.reason };
        }
        case 'ogrn': {
            const r = validateOgrn(value);
            return r.ok
                ? { status: 'ok', note: `контрольная цифра сошлась (${r.kind})` }
                : { status: 'error', note: r.reason };
        }
        case 'snils': {
            const r = validateSnils(value);
            return r.ok
                ? { status: 'ok', note: r.note || 'контрольное число сошлось' }
                : { status: 'error', note: r.reason };
        }
        case 'bik': {
            const r = validateBik(value);
            return r.ok ? { status: 'ok', note: 'формат верный' } : { status: 'error', note: r.reason };
        }
        case 'account':
        case 'corrAccount': {
            const r = validateAccount(value, ctx.bik || null, kind === 'corrAccount');
            return r.ok
                ? { status: ctx.bik ? 'ok' : 'info', note: r.note || 'формат верный' }
                : { status: 'error', note: r.reason };
        }
        case 'email': {
            const r = validateEmail(value);
            return r.ok ? { status: 'ok', note: 'формат верный' } : { status: 'error', note: r.reason };
        }
        default:
            return { status: 'info', note: '' };
    }
}

/** Классификация «голой» последовательности цифр по длине. null — не реквизит. */
function classifyBare(digits) {
    switch (digits.length) {
        case 9:
            return digits.startsWith('04') ? 'bik' : 'kpp';
        case 10:
        case 12:
            return 'inn';
        case 13:
        case 15:
            return 'ogrn';
        case 11:
            // 11 цифр без разделителей часто телефон: считаем СНИЛС только при верном контрольном числе
            return !/^[78]/.test(digits) && validateSnils(digits).ok ? 'snils' : null;
        case 20:
            return digits.startsWith('301') ? 'corrAccount' : 'account';
        default:
            return null;
    }
}

/**
 * @param {string} text
 * @returns {Array<{kind:string,label:string,value:string,status:'ok'|'error'|'info',note:string,index:number,labeled:boolean}>}
 */
export function scanRequisites(text) {
    const src = String(text ?? '').slice(0, 200000);
    const found = [];
    const taken = [];
    const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
    const take = (s, e) => taken.push([s, e]);

    // 1) значения с подписью (ИНН: 7707083893)
    LABEL_RE.lastIndex = 0;
    let m;
    while ((m = LABEL_RE.exec(src))) {
        const kind = LABEL_KIND(m[1]);
        let raw = m[2].trim();
        let value = raw;
        if (kind !== 'kpp') value = raw.replace(/[\s-]/g, '');
        else value = raw.replace(/\s/g, '').toUpperCase();
        if (kind === 'snils') {
            const d = raw.replace(/[\s-]/g, '');
            value = d;
        }
        // берём ровно столько знаков, сколько допустимо: подпись может «захватить» хвост следующего слова
        const maxLen = { inn: 12, kpp: 9, ogrn: 15, snils: 11, bik: 9, account: 20, corrAccount: 20 }[kind];
        if (value.length > maxLen && kind !== 'snils') {
            // «ИНН 7707083893 770701001»: берём первое слово, если оно подходит по длине
            const first = raw.split(/\s+/)[0].replace(/-/g, '');
            if (first && first.length <= maxLen && first.length >= 9) value = first;
        }
        if (value.length > maxLen) {
            const lens = { inn: [12, 10], ogrn: [15, 13] }[kind] || [maxLen];
            const fit = lens.find((l) => value.length >= l && /^\d+$/.test(value.slice(0, l)));
            value = value.slice(0, fit || maxLen);
        }
        const start = m.index;
        const end = m.index + m[0].length;
        take(start, end);
        found.push({ kind, value, index: start, labeled: true });
    }

    // 2) СНИЛС с разделителями 123-456-789 01
    const snilsRe = /(?<![\d-])\d{3}[- ]\d{3}[- ]\d{3}[- ]\d{2}(?![\d-])/g;
    while ((m = snilsRe.exec(src))) {
        if (overlaps(m.index, m.index + m[0].length)) continue;
        take(m.index, m.index + m[0].length);
        found.push({ kind: 'snils', value: m[0].replace(/[\s-]/g, ''), index: m.index, labeled: false });
    }

    // 3) e-mail
    const mailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    while ((m = mailRe.exec(src))) {
        if (overlaps(m.index, m.index + m[0].length)) continue;
        take(m.index, m.index + m[0].length);
        found.push({ kind: 'email', value: m[0], index: m.index, labeled: false });
    }

    // 4) «голые» числа
    const bareRe = /(?<![\d+])(?<!\d[ -])\d{9,20}(?![\d])/g;
    while ((m = bareRe.exec(src))) {
        const end = m.index + m[0].length;
        if (overlaps(m.index, end)) continue;
        const kind = classifyBare(m[0]);
        if (!kind) continue;
        take(m.index, end);
        found.push({ kind, value: m[0], index: m.index, labeled: false });
    }

    found.sort((a, b) => a.index - b.index);

    // БИК для проверки ключей счетов — первый корректный БИК в тексте
    const bikItem = found.find((f) => f.kind === 'bik' && validateBik(f.value).ok);
    const ctx = { bik: bikItem ? bikItem.value : null };

    const seen = new Set();
    const out = [];
    for (const f of found) {
        const key = `${f.kind}:${f.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = checkValue(f.kind, f.value, ctx);
        out.push({
            kind: f.kind,
            label: REQUISITE_KIND_LABELS[f.kind] || f.kind,
            value: f.value,
            status: r.status,
            note: r.note,
            index: f.index,
            labeled: f.labeled,
        });
    }
    return out;
}

/** Сводка для заголовка: «Найдено 5: верных 4, с ошибкой 1». */
export function summarizeScan(items) {
    const list = Array.isArray(items) ? items : [];
    const ok = list.filter((i) => i.status === 'ok').length;
    const bad = list.filter((i) => i.status === 'error').length;
    return { total: list.length, ok, bad, info: list.length - ok - bad };
}

/** Текстовый отчёт для копирования. */
export function buildScanReportText(items) {
    const mark = { ok: '✔', error: '✘', info: '•' };
    return (Array.isArray(items) ? items : [])
        .map((i) => `${mark[i.status] || '•'} ${i.label}: ${i.value}${i.note ? ` — ${i.note}` : ''}`)
        .join('\n');
}
