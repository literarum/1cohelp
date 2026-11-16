'use strict';

/**
 * Поиск внутри алгоритма: какой шаг лучше всего совпадает с запросом.
 * Позволяет в результатах показать «Шаг 2 · Уточнение ИНН» вместо первого шага алгоритма
 * и по клику прокрутить к нужному шагу.
 */

import { getStepContentAsText } from '../utils/helpers.js';

const norm = (s) =>
    String(s ?? '')
        .replace(/<[^>]*>/g, ' ')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();

/** Слова запроса без #тегов и служебных символов. */
export function queryWords(query) {
    return norm(query)
        .replace(/#[^\s]+/g, ' ')
        .split(/[^a-zа-я0-9]+/i)
        .filter((w) => w.length >= 2);
}

function stepText(step) {
    try {
        return norm(getStepContentAsText(step));
    } catch {
        return norm(typeof step?.description === 'string' ? step.description : '');
    }
}

/**
 * @param {Array<object>} steps
 * @param {string} query
 * @returns {{index:number, title:string, snippet:string}|null}
 */
export function findBestMatchingStep(steps, query) {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    const words = queryWords(query);
    if (words.length === 0) return null;
    let best = null;
    steps.forEach((step, index) => {
        if (!step || typeof step !== 'object') return;
        const title = norm(step.title);
        const body = stepText(step);
        let score = 0;
        for (const w of words) {
            // Совпадение по началу слова (поиск префиксный, как и индекс).
            const re = new RegExp(`(^|[^a-zа-я0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
            if (re.test(title)) score += 3;
            else if (re.test(body)) score += 1;
        }
        if (score > 0 && (!best || score > best.score)) best = { index, score, step, body };
    });
    if (!best) return null;
    const rawTitle = String(best.step.title || '').replace(/<[^>]*>/g, '').trim();
    const firstWord = queryWords(query)[0];
    let snippet = best.body;
    const pos = firstWord ? snippet.indexOf(firstWord) : -1;
    if (pos > 60) snippet = `…${snippet.slice(pos - 40)}`;
    if (snippet.length > 160) snippet = `${snippet.slice(0, 157)}…`;
    // Возвращаем исходный регистр, если сниппет — начало текста.
    const original = (() => {
        try {
            return String(getStepContentAsText(best.step) || '').replace(/\s+/g, ' ').trim();
        } catch {
            return '';
        }
    })();
    if (pos <= 60 && original) snippet = original.length > 160 ? `${original.slice(0, 157)}…` : original;
    return { index: best.index, title: rawTitle, snippet };
}

/** Подпись для результата поиска. */
export function formatStepLabel(match) {
    if (!match) return '';
    return `Шаг ${match.index + 1}${match.title ? ` · ${match.title}` : ''}`;
}
