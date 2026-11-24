'use strict';

/**
 * Связка «База клиентов» ↔ чёрный список («жабы»).
 *
 * Сопоставление записи обращения с записью ЧС — по доказательствам разной силы:
 *   inn        — ИНН обращения = ИНН жабы (сильное);
 *   inn-text   — ИНН жабы встречается в тексте обращения как второй ИНН (сильное);
 *   phone      — телефон обращения = телефон жабы (сильное, но телефон может быть общим у бухфирмы);
 *   notes      — ИНН / телефон / e-mail, найденные в ПРИМЕЧАНИИ к жабе, есть в обращении (сильное);
 *   name       — название организации жабы упомянуто в тексте обращения (слабое: только подсказка).
 * Уровень записи — максимальный уровень среди сильных совпадений; «name» уровень не присваивает.
 *
 * Аналитика: покрытие списка, сравнение жаб с остальными клиентами (U-тест Манна — Уитни,
 * z-тест долей, отношения шансов по темам с ДИ, G² по словам), градиент по уровню (Спирмен),
 * обращения до/после внесения в ЧС, соседи по общим контактам, гигиена самого списка
 * и модель «похожести на жабу» (логистическая регрессия, AUC на 5-кратной перекрёстной проверке).
 */

import {
    describe,
    wilson,
    mannWhitneyU,
    spearman,
    twoProportionZ,
    oddsRatio,
    logLikelihoodG2,
    trainLogistic,
    crossValidatedAuc,
    mean,
    applyFdr,
    pFromG2,
} from './client-analytics-math.js';
import {
    normalizeRussianPhone,
    extractPhoneCandidates,
    extractEmailCandidates,
    findInnOccurrences,
    innConfidence,
} from './client-analytics-parse.js';
import { activeTopics, TOPIC_LABELS, normalizeForAnalysis } from './client-analytics-text.js';

export const FROG_VIA_LABELS = {
    inn: 'ИНН',
    'inn-text': 'ИНН в тексте',
    phone: 'телефон',
    notes: 'данные из примечания',
    name: 'название в тексте',
};
export const FROG_LEVEL_LABELS = { 1: 'Жаба · ур. 1', 2: 'Жаба · ур. 2', 3: 'Гипержава' };
const STRONG = new Set(['inn', 'inn-text', 'phone', 'notes']);

const LEGAL_FORMS =
    /(?<![\p{L}])(?:ооо|оао|зао|пао|ао|нао|ип|инд\.?\s*предприниматель|индивидуальный предприниматель|общество с ограниченной ответственностью|акционерное общество|публичное акционерное общество|нко|ано|фгуп|гуп|муп|гбу|мбу|фгбу|гку|мку|снт|тсж|кфх|пк|ук)(?![\p{L}])/giu;

/** Ключ названия организации: без формы собственности, кавычек и пунктуации. */
export function orgNameKey(name) {
    return normalizeForAnalysis(name || '')
        .replace(/[«»"'“”„`]/g, ' ')
        .replace(LEGAL_FORMS, ' ')
        .replace(/[^\p{L}\d]+/gu, ' ')
        .trim();
}

/** 8-800 — горячие линии (часто самой поддержки): по ним нельзя отождествлять клиентов. */
export function isSharedServiceNumber(p) {
    return /^7800\d{7}$/.test(String(p || ''));
}

function phonesFrom(text) {
    const out = new Set(extractPhoneCandidates(String(text || '')));
    const direct = normalizeRussianPhone(String(text || ''));
    if (direct) out.add(direct);
    return [...out].filter((p) => !isSharedServiceNumber(p));
}

/**
 * Нормализованные записи ЧС.
 * @param {object[]} entries blacklistedClients
 */
export function normalizeFrogEntries(entries) {
    return (entries || [])
        .filter((e) => e && e.id != null)
        .map((e) => {
            const innRaw = String(e.inn || '').replace(/\D/g, '');
            const inn = innRaw.length === 10 || innRaw.length === 12 ? innRaw : '';
            let level = Number(e.level);
            if (!Number.isFinite(level) || level < 1) level = 1;
            if (level > 3) level = 3;
            const notes = String(e.notes || '');
            const notesInns = findInnOccurrences(notes)
                .map((o) => o.digits)
                .filter((d) => d !== inn && innConfidence(d) === 'high');
            const phones = phonesFrom(e.phone);
            const notesPhones = phonesFrom(notes).filter((p) => !phones.includes(p));
            const key = orgNameKey(e.organizationName);
            return {
                id: e.id,
                name: String(e.organizationName || ''),
                nameKey: key.length >= 6 && /\p{L}{3}/u.test(key) ? key : '',
                level,
                inn,
                innRaw: String(e.inn || ''),
                innValid: inn ? innConfidence(inn) === 'high' : false,
                phones,
                phoneRaw: String(e.phone || ''),
                notesInns: [...new Set(notesInns)],
                notesPhones,
                notesEmails: extractEmailCandidates(notes).map((x) => x.toLowerCase()),
                dateAdded: e.dateAdded || null,
                notes,
            };
        });
}

/** Индексы для быстрого сопоставления. */
export function buildFrogIndex(entries) {
    const frogs = Array.isArray(entries) && entries.length && entries[0] && 'nameKey' in entries[0] ? entries : normalizeFrogEntries(entries);
    const byInn = new Map();
    const byPhone = new Map();
    const byNotes = new Map();
    const byNameFirst = new Map();
    const add = (map, key, f) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(f);
    };
    for (const f of frogs) {
        add(byInn, f.inn, f);
        for (const p of f.phones) add(byPhone, p, f);
        for (const x of f.notesInns) add(byNotes, `i:${x}`, f);
        for (const x of f.notesPhones) add(byNotes, `p:${x}`, f);
        for (const x of f.notesEmails) add(byNotes, `e:${x}`, f);
        if (f.nameKey) add(byNameFirst, f.nameKey.split(' ')[0], f);
    }
    return { frogs, byInn, byPhone, byNotes, byNameFirst, byId: new Map(frogs.map((f) => [f.id, f])) };
}

/**
 * Совпадения записи обращения с жабами.
 * @returns {{ level: number, weakLevel: number, via: string[], entries: number[] }}
 */
export function matchRecordToFrogs(rec, index) {
    const res = { level: 0, weakLevel: 0, via: [], entries: [] };
    if (!index || !index.frogs.length || !rec) return res;
    const hit = (f, via) => {
        if (!res.via.includes(via)) res.via.push(via);
        if (!res.entries.includes(f.id)) res.entries.push(f.id);
        if (STRONG.has(via)) res.level = Math.max(res.level, f.level);
        else res.weakLevel = Math.max(res.weakLevel, f.level);
    };
    const inn = String(rec.inn || '').replace(/\D/g, '');
    for (const f of index.byInn.get(inn) || []) hit(f, 'inn');
    for (const f of index.byNotes.get(`i:${inn}`) || []) hit(f, 'notes');
    for (const x of rec.inns || []) {
        if (x === inn) continue;
        for (const f of index.byInn.get(x) || []) hit(f, 'inn-text');
        for (const f of index.byNotes.get(`i:${x}`) || []) hit(f, 'notes');
    }
    for (const p of rec.phones || []) {
        for (const f of index.byPhone.get(p) || []) hit(f, 'phone');
        for (const f of index.byNotes.get(`p:${p}`) || []) hit(f, 'notes');
    }
    for (const e of rec.emails || []) for (const f of index.byNotes.get(`e:${String(e).toLowerCase()}`) || []) hit(f, 'notes');
    if (index.byNameFirst.size) {
        const words = orgNameKey(`${rec.question || ''} ${String(rec.sourceText || '').slice(0, 3000)}`).split(' ');
        const joined = ` ${words.join(' ')} `;
        const seenFirst = new Set();
        for (const w of words) {
            if (seenFirst.has(w)) continue;
            seenFirst.add(w);
            for (const f of index.byNameFirst.get(w) || []) {
                if (!res.entries.includes(f.id) && joined.includes(` ${f.nameKey} `)) hit(f, 'name');
            }
        }
    }
    return res;
}

// ---------------------------------------------------------------------------
// Аналитика
// ---------------------------------------------------------------------------
const DAY = 86400000;

function dayNumOfIso(iso) {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? Math.floor(t / DAY) : null;
}

function ymd(dn) {
    return new Date(dn * DAY).toISOString().slice(0, 10);
}

/**
 * @param {object[]} list записи обращений
 * @param {object[]} recInfo признаки записей из computeInsights (day, topics, intent, urgency, negativity, caps)
 * @param {object[]} rawEntries записи ЧС
 * @param {{ docTokens: string[][], displayForm: (s:string)=>string, now?: number }} ctx
 */
export function computeFrogInsights(list, recInfo, rawEntries, ctx) {
    const index = buildFrogIndex(rawEntries || []);
    const frogs = index.frogs;
    const n = list.length;
    const out = {
        insufficient: !frogs.length,
        entries: { total: frogs.length, byLevel: { 1: 0, 2: 0, 3: 0 }, withInn: 0, withPhone: 0, unmatchable: 0, matched: 0, silent: 0 },
        perRecord: new Array(n),
        index: { all: [], l1: [], l2: [], l3: [], inn: [], 'inn-text': [], phone: [], notes: [], name: [], neighbors: [] },
        entryIds: {},
    };
    for (const f of frogs) {
        out.entries.byLevel[f.level]++;
        if (f.inn) out.entries.withInn++;
        if (f.phones.length) out.entries.withPhone++;
        if (!f.inn && !f.phones.length && !f.notesInns.length && !f.notesPhones.length && !f.notesEmails.length) out.entries.unmatchable++;
    }

    // --- сопоставление записей
    const entryRecs = new Map(frogs.map((f) => [f.id, []]));
    const clientLevel = new Map(); // ИНН клиента → уровень (по сильным совпадениям любой его записи)
    for (let i = 0; i < n; i++) {
        const r = list[i];
        const m = matchRecordToFrogs(r, index);
        out.perRecord[i] = m;
        if (!m.entries.length) continue;
        for (const id of m.entries) entryRecs.get(id).push(i);
        for (const v of m.via) out.index[v].push(r.id);
        if (m.level) {
            out.index.all.push(r.id);
            out.index[`l${m.level}`].push(r.id);
            const inn = String(r.inn || '').replace(/\D/g, '');
            if (inn) clientLevel.set(inn, Math.max(clientLevel.get(inn) || 0, m.level));
        }
    }
    if (!frogs.length) return out;

    const frogAppeals = out.index.all.length;
    const wAppeals = wilson(frogAppeals, n);
    const byVia = Object.fromEntries(Object.keys(FROG_VIA_LABELS).map((v) => [v, out.index[v].length]));

    // --- по каждой жабе
    const entryRows = frogs.map((f) => {
        const idxs = entryRecs.get(f.id) || [];
        const strong = idxs.filter((i) => out.perRecord[i].level > 0 && out.perRecord[i].entries.includes(f.id) && out.perRecord[i].via.some((v) => STRONG.has(v)));
        const days = strong.map((i) => recInfo[i].day).filter((d) => d != null).sort((a, b) => a - b);
        const added = dayNumOfIso(f.dateAdded);
        const after = added != null ? days.filter((d) => d > added).length : null;
        const vias = new Set();
        for (const i of idxs) for (const v of out.perRecord[i].via) vias.add(v);
        return {
            id: f.id,
            name: f.name,
            level: f.level,
            inn: f.inn || f.innRaw,
            innValid: f.innValid,
            phones: f.phones,
            appeals: strong.length,
            mentions: idxs.length - strong.length,
            first: days.length ? ymd(days[0]) : null,
            last: days.length ? ymd(days[days.length - 1]) : null,
            dateAdded: f.dateAdded ? f.dateAdded.slice(0, 10) : null,
            afterAdded: after,
            via: [...vias],
        };
    });
    for (const row of entryRows) {
        if (row.appeals) out.entries.matched++;
        else out.entries.silent++;
        out.entryIds[row.id] = (entryRecs.get(row.id) || []).map((i) => list[i].id);
    }

    // --- клиенты: жабы против остальных
    const clientRecs = new Map();
    for (let i = 0; i < n; i++) {
        const inn = String(list[i].inn || '').replace(/\D/g, '');
        if (inn.length !== 10 && inn.length !== 12) continue;
        if (!clientRecs.has(inn)) clientRecs.set(inn, []);
        clientRecs.get(inn).push(i);
    }
    const clientFeat = (idxs) => {
        const k = idxs.length;
        let neg = 0;
        let urg = 0;
        let compl = 0;
        let caps = 0;
        for (const i of idxs) {
            const x = recInfo[i];
            if (x.negativity >= 2) neg++;
            if (x.urgency >= 2) urg++;
            if (x.intent === 'complaint') compl++;
            if (x.caps > 0.6) caps++;
        }
        const ds = idxs.map((i) => recInfo[i].day).filter((d) => d != null).sort((a, b) => a - b);
        let rep7 = 0;
        for (let t = 1; t < ds.length; t++) if (ds[t] - ds[t - 1] <= 7) rep7++;
        return { k, neg: neg / k, urg: urg / k, compl: compl / k, caps: caps / k, rep7: ds.length > 1 ? rep7 / (ds.length - 1) : 0 };
    };
    const feats = new Map();
    for (const [inn, idxs] of clientRecs) feats.set(inn, clientFeat(idxs));
    const frogInns = [...clientRecs.keys()].filter((x) => clientLevel.get(x));
    const otherInns = [...clientRecs.keys()].filter((x) => !clientLevel.get(x));
    const pick = (inns, key) => inns.map((x) => feats.get(x)[key]);
    const compare = [
        ['k', 'Обращений на клиента'],
        ['neg', 'Доля негативных обращений'],
        ['urg', 'Доля срочных обращений'],
        ['compl', 'Доля жалоб'],
        ['rep7', 'Доля повторов в течение 7 дней'],
        ['caps', 'Доля текстов ЗАГЛАВНЫМИ'],
    ].map(([key, label]) => {
        const a = pick(frogInns, key);
        const b = pick(otherInns, key);
        const mw = mannWhitneyU(a, b);
        return { key, label, frogMean: mean(a), otherMean: mean(b), frogMedian: describe(a).median, otherMedian: describe(b).median, ...mw };
    });
    applyFdr(compare, { guard: (r) => !r.insufficient });

    // --- обращения: доли признаков
    const isFrogRec = (i) => out.perRecord[i].level > 0;
    let fN = 0;
    for (let i = 0; i < n; i++) if (isFrogRec(i)) fN++;
    const oN = n - fN;
    const propRow = (label, pred) => {
        let a = 0;
        let c = 0;
        for (let i = 0; i < n; i++) {
            if (!pred(i)) continue;
            if (isFrogRec(i)) a++;
            else c++;
        }
        const z = twoProportionZ(a, fN, c, oN);
        // признак не встретился ни разу — сравнивать нечего (поправка Холдейна дала бы ложное OR)
        if (a + c === 0) return { label, frog: 0, other: 0, ...z, or: null, significant: false, empty: true };
        return { label, frog: a, other: c, ...z, or: oddsRatio(a, fN - a, c, oN - c) };
    };
    const proportions = [
        propRow('Срочные (≥ 2 баллов)', (i) => recInfo[i].urgency >= 2),
        propRow('Негативная окраска', (i) => recInfo[i].negativity >= 2),
        propRow('Жалобы / претензии', (i) => recInfo[i].intent === 'complaint'),
        propRow('Проблема / ошибка', (i) => recInfo[i].intent === 'problem'),
        propRow('Оплата / продление', (i) => recInfo[i].intent === 'billing'),
        propRow('Текст ЗАГЛАВНЫМИ', (i) => recInfo[i].caps > 0.6),
    ];
    applyFdr(proportions, { guard: (r) => !r.empty && fN >= 5 });
    const topics = activeTopics().map((t) => {
        let a = 0;
        let c = 0;
        for (let i = 0; i < n; i++) {
            if (!recInfo[i].topics.includes(t.id)) continue;
            if (isFrogRec(i)) a++;
            else c++;
        }
        if (a + c === 0) return { id: t.id, label: TOPIC_LABELS[t.id], frog: 0, other: 0, frogShare: 0, otherShare: 0, lift: null, or: null, lo: null, hi: null, significant: false, empty: true };
        const or = oddsRatio(a, fN - a, c, oN - c);
        const z = twoProportionZ(a, fN, c, oN);
        return { id: t.id, label: TOPIC_LABELS[t.id], frog: a, other: c, frogShare: fN ? a / fN : 0, otherShare: oN ? c / oN : 0, lift: oN && c ? a / fN / (c / oN) : null, ...or, p: z.p };
    }).sort((x, y) => (y.empty ? -1e9 : Math.log(y.or)) - (x.empty ? -1e9 : Math.log(x.or)));
    applyFdr(topics, { guard: (t) => !t.empty && fN >= 5 });

    // --- характерная лексика жаб (G²)
    const fa = new Map();
    const fb = new Map();
    let ta = 0;
    let tb = 0;
    for (let i = 0; i < n; i++) {
        const tgt = isFrogRec(i) ? fa : fb;
        for (const st of ctx.docTokens[i]) tgt.set(st, (tgt.get(st) || 0) + 1);
        if (isFrogRec(i)) ta += ctx.docTokens[i].length;
        else tb += ctx.docTokens[i].length;
    }
    const words = [];
    if (ta >= 30 && tb >= 30) {
        for (const [st, a] of fa) {
            const b = fb.get(st) || 0;
            if (a < 3) continue;
            const g = logLikelihoodG2(a, b, ta, tb);
            words.push({ stem: st, word: ctx.displayForm(st), frog: a, other: b, g2: g, p: pFromG2(g) });
        }
        applyFdr(words, { alpha: 0.01 });
        const kept = words.filter((w) => w.significant && w.g2 > 6.63);
        words.length = 0;
        words.push(...kept);
        words.sort((x, y) => y.g2 - x.g2);
    }

    // --- градиент по уровню: 0 (не жаба) … 3 (гипержаба)
    const allInns = [...clientRecs.keys()];
    const lv = allInns.map((x) => clientLevel.get(x) || 0);
    const gradient = [
        ['k', 'обращений на клиента'],
        ['neg', 'доля негатива'],
        ['urg', 'доля срочных'],
        ['rep7', 'повторы ≤ 7 дней'],
    ].map(([key, label]) => ({ key, label, ...spearman(lv, allInns.map((x) => feats.get(x)[key])) }));
    const byLevel = [0, 1, 2, 3].map((L) => {
        const inns = allInns.filter((x) => (clientLevel.get(x) || 0) === L);
        return { level: L, clients: inns.length, appealsPerClient: mean(pick(inns, 'k')), neg: mean(pick(inns, 'neg')), urg: mean(pick(inns, 'urg')) };
    });

    // --- до и после внесения в ЧС (темп обращений в день)
    let beforeN = 0;
    let afterN = 0;
    let beforeDays = 0;
    let afterDays = 0;
    let continued = 0;
    let eligible = 0;
    const allDays = recInfo.map((x) => x.day).filter((d) => d != null);
    const dataFrom = allDays.length ? Math.min(...allDays) : null;
    const dataTo = allDays.length ? Math.max(...allDays) : null;
    for (const f of frogs) {
        const added = dayNumOfIso(f.dateAdded);
        if (added == null || dataFrom == null || added <= dataFrom || added >= dataTo) continue;
        const ds = (entryRecs.get(f.id) || []).filter((i) => out.perRecord[i].level > 0).map((i) => recInfo[i].day).filter((d) => d != null);
        if (!ds.length) continue;
        eligible++;
        const b = ds.filter((d) => d <= added).length;
        const a = ds.filter((d) => d > added).length;
        beforeN += b;
        afterN += a;
        beforeDays += added - dataFrom + 1;
        afterDays += dataTo - added;
        if (a > 0) continued++;
    }
    const beforeAfter = {
        eligible,
        beforeRate: beforeDays ? (beforeN / beforeDays) * 30 : 0,
        afterRate: afterDays ? (afterN / afterDays) * 30 : 0,
        beforeN,
        afterN,
        continued,
        continuedShare: eligible ? continued / eligible : 0,
        insufficient: eligible < 3,
    };

    // --- месячная доля обращений жаб
    const months = new Map();
    for (let i = 0; i < n; i++) {
        const d = recInfo[i].day;
        if (d == null) continue;
        const m = ymd(d).slice(0, 7);
        const cur = months.get(m) || { total: 0, frog: 0 };
        cur.total++;
        if (isFrogRec(i)) cur.frog++;
        months.set(m, cur);
    }
    const monthly = [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, v]) => ({ month, ...v, share: v.total ? v.frog / v.total : 0 }));

    // --- соседи жаб: другие ИНН с тем же телефоном/почтой в обращениях
    const contactOwners = new Map();
    for (let i = 0; i < n; i++) {
        const r = list[i];
        const inn = String(r.inn || '').replace(/\D/g, '');
        if (!clientRecs.has(inn)) continue;
        const keys = [...(r.phones || []).filter((p) => !isSharedServiceNumber(p)).map((p) => `т:${p}`), ...(r.emails || []).map((e) => `e:${String(e).toLowerCase()}`)];
        for (const k of keys) {
            if (!contactOwners.has(k)) contactOwners.set(k, new Set());
            contactOwners.get(k).add(inn);
        }
    }
    const neighbors = new Map();
    for (const [k, owners] of contactOwners) {
        if (owners.size < 2 || owners.size >= 30) continue;
        const frogOwners = [...owners].filter((x) => clientLevel.get(x));
        if (!frogOwners.length) continue;
        for (const x of owners) {
            if (clientLevel.get(x)) continue;
            const cur = neighbors.get(x) || { inn: x, via: new Set(), frogs: new Set(), maxLevel: 0 };
            cur.via.add(k.slice(2));
            for (const fo of frogOwners) {
                cur.frogs.add(fo);
                cur.maxLevel = Math.max(cur.maxLevel, clientLevel.get(fo));
            }
            neighbors.set(x, cur);
        }
    }
    const neighborList = [...neighbors.values()]
        .map((v) => ({ inn: v.inn, via: [...v.via], frogs: [...v.frogs], maxLevel: v.maxLevel, appeals: clientRecs.get(v.inn).length }))
        .sort((a, b) => b.maxLevel - a.maxLevel || b.appeals - a.appeals);
    const neighborSet = new Set(neighborList.map((v) => v.inn));
    for (let i = 0; i < n; i++) if (neighborSet.has(String(list[i].inn || '').replace(/\D/g, ''))) out.index.neighbors.push(list[i].id);

    // --- модель похожести на жабу (только поведенческие признаки, без лексики — нет утечки метки)
    const FEATURES = [
        ['logK', 'число обращений (log)'],
        ['neg', 'доля негатива'],
        ['urg', 'доля срочных'],
        ['compl', 'доля жалоб'],
        ['rep7', 'повторы ≤ 7 дней'],
        ['caps', 'доля ЗАГЛАВНЫХ'],
        ['nb', 'общий контакт с жабой'],
        ['ip', 'ФЛ/ИП (12-значный ИНН)'],
    ];
    const vec = (inn) => {
        const f = feats.get(inn);
        return [Math.log1p(f.k), f.neg, f.urg, f.compl, f.rep7, f.caps, neighborSet.has(inn) ? 1 : 0, inn.length === 12 ? 1 : 0];
    };
    let model = { insufficient: true, positives: frogInns.length, negatives: otherInns.length, features: FEATURES.map((f) => f[1]) };
    if (frogInns.length >= 8 && otherInns.length >= 30) {
        // для скорости обучения отрицательные примеры прореживаются детерминированно (≤ 6000)
        const step = Math.max(1, Math.ceil(otherInns.length / 6000));
        const negSample = otherInns.filter((_, i) => i % step === 0);
        const X = [...frogInns.map(vec), ...negSample.map(vec)];
        const y = [...frogInns.map(() => 1), ...negSample.map(() => 0)];
        const auc = crossValidatedAuc(X, y, 5, { iters: 250 });
        const m = trainLogistic(X, y, { iters: 300 });
        const candidates = otherInns
            .map((inn) => {
                const x = vec(inn);
                const contrib = m.contributions(x);
                const top = contrib
                    .map((c, j) => ({ label: FEATURES[j][1], c }))
                    .filter((t) => t.c > 0.15)
                    .sort((a, b) => b.c - a.c)
                    .slice(0, 3)
                    .map((t) => t.label);
                return { inn, p: m.predict(x), appeals: feats.get(inn).k, reasons: top };
            })
            .sort((a, b) => b.p - a.p)
            .slice(0, 30);
        model = {
            insufficient: false,
            positives: frogInns.length,
            negatives: otherInns.length,
            trainedOn: X.length,
            auc,
            quality: !Number.isFinite(auc) ? 'не оценено' : auc >= 0.8 ? 'сильная' : auc >= 0.7 ? 'умеренная' : auc >= 0.6 ? 'слабая' : 'не лучше случайной',
            weights: FEATURES.map((f, j) => ({ label: f[1], w: m.w[j] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)),
            candidates: Number.isFinite(auc) && auc >= 0.6 ? candidates : [],
        };
    }

    // --- гигиена списка жаб
    const innCount = new Map();
    for (const f of frogs) if (f.inn) innCount.set(f.inn, [...(innCount.get(f.inn) || []), f]);
    const hygiene = [];
    const push = (key, label, level, ids, hint) => hygiene.push({ key, label, level, count: ids.length, ids, hint });
    push('invalidInn', 'ИНН с неверной контрольной суммой', 'serious', frogs.filter((f) => f.inn && !f.innValid).map((f) => f.id), 'Опечатка в ИНН — совпадения в базе не найдутся.');
    push('badInnFormat', 'ИНН не из 10/12 цифр', 'serious', frogs.filter((f) => f.innRaw && !f.inn).map((f) => f.id), 'Поле ИНН заполнено, но это не ИНН.');
    push('dupInn', 'Один ИНН в нескольких записях', 'warning', [...innCount.values()].filter((g) => g.length > 1).flat().map((f) => f.id), 'Уровни могут противоречить друг другу; учитывается максимальный.');
    push('noKeys', 'Нет ни ИНН, ни телефона', 'warning', frogs.filter((f) => !f.inn && !f.phones.length && !f.notesInns.length && !f.notesPhones.length && !f.notesEmails.length).map((f) => f.id), 'Запись невозможно сопоставить с обращениями.');
    push('badPhone', 'Телефон не распознан', 'info', frogs.filter((f) => f.phoneRaw && !f.phones.length).map((f) => f.id), 'Совпадение по телефону невозможно.');
    push('silent', 'Нет обращений в базе', 'info', entryRows.filter((r) => !r.appeals).map((r) => r.id), 'Жаба не обращалась (или данные в базе неполные).');
    push('phoneElsewhere', 'Телефон жабы встречается у другого ИНН', 'warning', entryRows.filter((r) => {
        const f = index.byId.get(r.id);
        if (!f.inn || !f.phones.length) return false;
        return (entryRecs.get(r.id) || []).some((i) => out.perRecord[i].via.includes('phone') && String(list[i].inn || '') && String(list[i].inn) !== f.inn);
    }).map((r) => r.id), 'Возможно, бухгалтер обслуживает несколько организаций — проверьте связь.');

    out.insufficient = false;
    out.summary = {
        appeals: frogAppeals,
        appealsShare: wAppeals.p,
        appealsLo: wAppeals.lo,
        appealsHi: wAppeals.hi,
        clients: frogInns.length,
        clientsShare: clientRecs.size ? frogInns.length / clientRecs.size : 0,
        weakOnly: (() => {
            const strongSet = new Set(out.index.all);
            return out.index.name.filter((id) => !strongSet.has(id)).length;
        })(),
        byVia,
        byLevelAppeals: { 1: out.index.l1.length, 2: out.index.l2.length, 3: out.index.l3.length },
    };
    out.entryRows = entryRows.sort((a, b) => b.level - a.level || b.appeals - a.appeals);
    out.compare = compare;
    out.proportions = proportions;
    out.topics = topics;
    out.words = words.slice(0, 30);
    out.gradient = gradient;
    out.byLevel = byLevel;
    out.beforeAfter = beforeAfter;
    out.monthly = monthly;
    out.neighbors = neighborList.slice(0, 40);
    out.neighborsTotal = neighborList.length;
    out.model = model;
    out.hygiene = hygiene;
    out.clientLevels = Object.fromEntries(clientLevel);
    return out;
}

/**
 * Сводка обращений по одной записи ЧС (для окна жабы в разделе «Чёрный список»).
 * @param {object} entry запись ЧС
 * @param {object[]} records все обращения
 */
export function summarizeAppealsForFrogEntry(entry, records) {
    const index = buildFrogIndex([entry]);
    const hits = [];
    for (const r of records || []) {
        const m = matchRecordToFrogs(r, index);
        if (m.entries.length) hits.push({ r, m });
    }
    const strong = hits.filter((h) => h.m.level > 0);
    const dates = strong
        .map((h) => (h.r.appealDate ? h.r.appealDate : String(h.r.uploadedAt || '').slice(0, 10)))
        .filter(Boolean)
        .sort();
    const inns = [...new Set(strong.map((h) => String(h.r.inn || '')).filter(Boolean))];
    const via = {};
    for (const h of hits) for (const v of h.m.via) via[v] = (via[v] || 0) + 1;
    const added = entry && entry.dateAdded ? String(entry.dateAdded).slice(0, 10) : null;
    return {
        count: strong.length,
        mentions: hits.length - strong.length,
        first: dates[0] || null,
        last: dates[dates.length - 1] || null,
        afterAdded: added ? dates.filter((d) => d > added).length : null,
        inns,
        via,
        recent: strong
            .slice()
            .sort((a, b) => String(b.r.appealDate || b.r.uploadedAt).localeCompare(String(a.r.appealDate || a.r.uploadedAt)))
            .slice(0, 5)
            .map((h) => ({ id: h.r.id, date: h.r.appealDate || String(h.r.uploadedAt || '').slice(0, 10), time: h.r.appealTime || null, inn: h.r.inn, question: h.r.question, via: h.m.via })),
    };
}

/** Карта «телефон → уровень жабы» для значков на карточках (совпадение без ИНН). */
export function buildFrogPhoneLevelMap(entries) {
    const map = new Map();
    for (const f of normalizeFrogEntries(entries)) {
        for (const p of [...f.phones, ...f.notesPhones]) map.set(p, Math.max(map.get(p) || 0, f.level));
    }
    return map;
}
