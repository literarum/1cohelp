'use strict';

/**
 * Глобальные теги/метки: нормализация, разбор запроса поиска (#тег), проверка совпадений.
 * Дублирование данных намеренно минимально: массив `tags` на сущности + индексация объединённой строки в поиске.
 */

const MAX_TAG_LEN = 64;
const MAX_TAGS_PER_ITEM = 50;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeTagToken(raw) {
    if (typeof raw !== 'string') return '';
    let s = raw.trim().replace(/[ёЁ]/g, 'е').replace(/\s+/g, ' ');
    if (!s) return '';
    s = s.toLowerCase();
    if (s.length > MAX_TAG_LEN) s = s.slice(0, MAX_TAG_LEN);
    return s;
}

/**
 * Нормализованный массив тегов из произвольного ввода (строка с запятыми/переносами).
 * @param {string} input
 * @returns {string[]}
 */
export function parseTagsFromUserString(input) {
    if (!input || typeof input !== 'string') return [];
    const parts = input
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        const n = normalizeTagToken(p);
        if (n.length < 1) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
        if (out.length >= MAX_TAGS_PER_ITEM) break;
    }
    return out;
}

/**
 * @param {unknown} v
 * @returns {string[]}
 */
export function coerceTagsArray(v) {
    if (!Array.isArray(v)) return [];
    const seen = new Set();
    const out = [];
    for (const x of v) {
        if (typeof x !== 'string') continue;
        const n = normalizeTagToken(x);
        if (!n) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
        if (out.length >= MAX_TAGS_PER_ITEM) break;
    }
    return out;
}

/**
 * Для отображения в поле ввода (сохранённые нормализованные теги через запятую).
 * @param {unknown} tags
 * @returns {string}
 */
export function formatTagsForInput(tags) {
    const arr = coerceTagsArray(tags);
    return arr.join(', ');
}

/**
 * Из запроса извлекает `#тег` (несколько подряд) и оставшуюся текстовую часть для полнотекстового поиска.
 * @param {string} rawQuery
 * @returns {{ textQuery: string, tagFilters: string[] }}
 */
export function parseSearchQueryTagsAndText(rawQuery) {
    if (typeof rawQuery !== 'string') {
        return { textQuery: '', tagFilters: [] };
    }
    const q = rawQuery;
    const tagFilters = [];
    const seen = new Set();
    const re = /(?:^|[\s])#([^\s#]+)/g;
    let m;
    while ((m = re.exec(q)) !== null) {
        const nt = normalizeTagToken(m[1]);
        if (nt && !seen.has(nt)) {
            seen.add(nt);
            tagFilters.push(nt);
        }
    }
    let textQuery = q.replace(/(?:^|[\s])#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { textQuery, tagFilters };
}

/**
 * Элемент должен содержать все перечисленные теги (AND).
 * @param {object|null|undefined} itemData
 * @param {string[]} normalizedRequiredTags
 * @returns {boolean}
 */
export function itemMatchesAllTags(itemData, normalizedRequiredTags) {
    if (!normalizedRequiredTags || normalizedRequiredTags.length === 0) return true;
    const itemTags = coerceTagsArray(itemData?.tags);
    if (itemTags.length === 0) return false;
    const set = new Set(itemTags);
    return normalizedRequiredTags.every((t) => set.has(t));
}

/**
 * Краткая строка тегов для сниппета в результатах поиска.
 * @param {object|null|undefined} itemData
 * @returns {string}
 */
export function formatTagsForSearchSnippet(itemData) {
    const t = coerceTagsArray(itemData?.tags);
    if (!t.length) return '';
    if (t.length <= 8) return t.join(', ');
    return `${t.slice(0, 8).join(', ')}…`;
}
