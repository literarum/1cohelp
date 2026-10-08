'use strict';

/**
 * Общие текстовые утилиты поиска: исправление раскладки, расстояние Дамерау — Левенштейна,
 * подготовка текста (нормализация + стеммы, с кэшем). Без зависимостей от DOM.
 */

import { stemWord, normalizeTextForIndex } from './search-normalize.js';

// ---------------------------------------------------------------------------
// Раскладка
// ---------------------------------------------------------------------------
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';

/**
 * Если строка набрана в латинской раскладке вместо русской — возвращает русский вариант,
 * иначе пустую строку. Работает только для «похожих на опечатку раскладки» запросов.
 */
export function fixKeyboardLayout(str) {
    if (typeof str !== 'string') return '';
    const s = str.toLowerCase();
    if (!/[a-z\[\];',.`]/.test(s) || /[а-яё]/.test(s)) return '';
    let letters = 0;
    let out = '';
    for (const ch of s) {
        const i = EN.indexOf(ch);
        if (i >= 0) {
            out += RU[i];
            if (/[a-z]/.test(ch)) letters++;
        } else {
            out += ch;
        }
    }
    // Только если латиницы достаточно и результат — «слова», а не цифры/ИНН/URL.
    if (letters < 3 || /https?:|www\.|@|\d{4,}/.test(s)) return '';
    return out === s ? '' : out;
}

// ---------------------------------------------------------------------------
// Опечатки
// ---------------------------------------------------------------------------
/** Расстояние Дамерау — Левенштейна с отсечкой по maxDist (возвращает maxDist+1 при превышении). */
export function editDistance(a, b, maxDist = 2) {
    if (a === b) return 0;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > maxDist) return maxDist + 1;
    let prev2 = null;
    let prev = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
        const cur = new Array(lb + 1);
        cur[0] = i;
        let rowMin = cur[0];
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                v = Math.min(v, prev2[j - 2] + 1);
            }
            cur[j] = v;
            if (v < rowMin) rowMin = v;
        }
        if (rowMin > maxDist) return maxDist + 1;
        prev2 = prev;
        prev = cur;
    }
    return prev[lb];
}

// ---------------------------------------------------------------------------
// Подготовка текста и сопоставление
// ---------------------------------------------------------------------------
const prepCache = new Map();
const PREP_CACHE_LIMIT = 60000;

/** Разбор строки на слова/стеммы (кэшируется — тексты закладок и клиентов повторяются). */
export function prepareText(text) {
    const raw = typeof text === 'string' ? text : '';
    const hit = prepCache.get(raw);
    if (hit) return hit;
    const norm = normalizeTextForIndex(raw);
    const words = norm ? norm.split(/[\s\-_]+/).filter(Boolean) : [];
    const stems = words.map((w) => stemWord(w));
    const prepared = { norm, words, stems, stemSet: new Set(stems) };
    if (prepCache.size >= PREP_CACHE_LIMIT) prepCache.clear();
    prepCache.set(raw, prepared);
    return prepared;
}

