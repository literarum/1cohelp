'use strict';

/**
 * «Умный» поиск для списков в памяти (закладки, база клиентов, избранное) и для запросов
 * глобального поиска. Работает полностью офлайн и без внешних моделей:
 *   1. нормализация + стемминг (общий с глобальным индексом — search-normalize.js);
 *   2. смысловая близость через тезаурус предметной области (ЭЦП ≈ подпись ≈ сертификат,
 *      ошибка ≈ сбой ≈ не работает и т.д.) — «семантика» здесь словарная, а не нейросетевая;
 *   3. исправление раскладки («cthnbabrfn» → «сертификат»);
 *   4. устойчивость к опечаткам (расстояние Дамерау — Левенштейна);
 *   5. ранжирование: точное слово > начало слова > основа > синоним > опечатка;
 *      заголовок весит больше описания.
 * Если по всем словам запроса ничего не нашлось, берётся мягкий режим «совпала часть слов».
 */

import { stemWord, normalizeTextForIndex } from './search-normalize.js';

import { getSemanticIndex, SemanticIndex } from './semantic-engine.js';
export { relatedStems } from './domain-thesaurus.js';
import { relatedStems } from './domain-thesaurus.js';

export { fixKeyboardLayout, editDistance, prepareText } from './search-text-utils.js';
import { fixKeyboardLayout, editDistance, prepareText } from './search-text-utils.js';

const Q = { EXACT: 1, PREFIX: 0.92, STEM: 0.85, SYNONYM: 0.62, FUZZY: 0.5 };

function termVsText(term, prepared) {
    if (!prepared.norm) return 0;
    const { norm, words, stems, stemSet } = prepared;
    let best = 0;
    if (words.includes(term.word)) return Q.EXACT;
    if (norm.includes(term.word)) best = term.word.length >= 3 ? Q.PREFIX : 0.7;
    if (best >= Q.PREFIX) return best;
    if (term.stem.length >= 2) {
        if (stemSet.has(term.stem)) best = Math.max(best, Q.STEM);
        else if (term.stem.length >= 3 && stems.some((s) => s.startsWith(term.stem))) {
            best = Math.max(best, Q.STEM - 0.03);
        }
    }
    if (best >= Q.STEM - 0.03) return best;
    for (const rs of term.related) {
        if (stemSet.has(rs)) {
            best = Math.max(best, Q.SYNONYM);
            break;
        }
    }
    if (best >= Q.SYNONYM) return best;
    if (term.word.length >= 4) {
        const maxD = term.word.length >= 8 ? 2 : 1;
        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            if (Math.abs(w.length - term.word.length) > maxD) continue;
            if (editDistance(term.word, w, maxD) <= maxD) return Math.max(best, Q.FUZZY);
            const st = stems[i];
            if (st.length >= 4 && editDistance(term.stem, st, 1) <= 1) return Math.max(best, Q.FUZZY);
        }
    }
    return best;
}

function buildTerms(query) {
    const norm = normalizeTextForIndex(query);
    if (!norm) return [];
    return norm
        .split(/[\s]+/)
        .filter(Boolean)
        .map((word) => {
            const stem = stemWord(word);
            return { word, stem, related: relatedStems(stem) };
        });
}

/**
 * Матчер запроса.
 * @param {string} query
 * @returns {{ empty: boolean, terms: object[], score: (fields: Array<string|{text:string,weight?:number}>) => number }}
 *  score() — 0, если не найдено, иначе положительное число (больше — релевантнее).
 *  Режим: 'all' (все слова) либо 'some' (хотя бы половина) — см. rank().
 */
export function createMatcher(query) {
    const q = typeof query === 'string' ? query.trim() : '';
    const variants = [q];
    const fixed = fixKeyboardLayout(q);
    if (fixed) variants.push(fixed);
    const termSets = variants.map(buildTerms).filter((t) => t.length > 0);

    function scoreOneSet(terms, fields, mode) {
        const prepared = fields.map((f) =>
            typeof f === 'string' ? { p: prepareText(f), w: 1 } : { p: prepareText(f.text), w: f.weight ?? 1 },
        );
        let total = 0;
        let matched = 0;
        for (const term of terms) {
            let best = 0;
            for (const f of prepared) {
                const m = termVsText(term, f.p) * f.w;
                if (m > best) best = m;
            }
            if (best > 0) {
                matched++;
                total += best;
            }
        }
        if (mode === 'all') return matched === terms.length ? total : 0;
        const need = Math.max(1, Math.ceil(terms.length / 2));
        return matched >= need ? total * 0.6 : 0;
    }

    function score(fields, mode = 'all') {
        let best = 0;
        for (const terms of termSets) {
            const s = scoreOneSet(terms, fields, mode);
            if (s > best) best = s;
        }
        return best;
    }

    return { empty: termSets.length === 0, terms: termSets[0] || [], score, variants };
}

/**
 * Фильтрует и ранжирует список семантическим движком (BM25F + тезаурус + выученные
 * ассоциации + опечатки + раскладка + фразы + исключения). Без запроса возвращает исходный порядок.
 * @template T
 * @param {T[]} items
 * @param {string} query
 * @param {(item:T)=>Array<string|{text:string,weight?:number}>} getFields
 * @param {{ cacheKey?: string, limit?: number }} [opts] cacheKey — имя корпуса для кэша индекса
 * @returns {{ items: T[], soft: boolean, suggestion: string|null, why: Map<T,string[]>, exactCount: number }}
 */
export function rankItems(items, query, getFields, opts = {}) {
    const empty = { items, soft: false, suggestion: null, why: new Map(), exactCount: items.length };
    if (!query || !String(query).trim()) return empty;
    try {
        const docs = items.map((it, i) => ({ id: i, fields: getFields(it) }));
        const index = opts.cacheKey ? getSemanticIndex(opts.cacheKey, docs) : new SemanticIndex(docs);
        const res = index.search(query, { limit: opts.limit || Math.max(items.length, 1) });
        const why = new Map();
        let exactCount = 0;
        const out = res.hits.map((h) => {
            const it = items[h.id];
            if (h.why.length) why.set(it, h.why);
            if (h.exact) exactCount++;
            return it;
        });
        return { items: out, soft: res.soft, suggestion: res.suggestion || null, why, exactCount };
    } catch (e) {
        console.error('rankItems: семантический поиск недоступен, используется простой', e);
        const m = createMatcher(query);
        if (m.empty) return empty;
        const kept = items.filter((it) => m.score(getFields(it), 'all') > 0);
        return { items: kept, soft: false, suggestion: null, why: new Map(), exactCount: kept.length };
    }
}

/**
 * Дополнительные токены-стеммы для расширения запроса глобального поиска
 * (синонимы по тезаурусу + стеммы запроса в исправленной раскладке).
 * @param {string[]} stems стеммы запроса
 * @returns {string[]} только новые стеммы, пригодные для обращения к индексу (длина ≥ 4 или 3 для аббревиатур)
 */
export function expandStemsSemantically(stems) {
    const out = new Set();
    for (const st of stems) {
        for (const r of relatedStems(st)) if (r.length >= 3) out.add(r);
    }
    return Array.from(out).filter((s) => !stems.includes(s));
}
