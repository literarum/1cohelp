'use strict';

/**
 * Планирование повторений и очередь SRS: чистые функции без DOM и БД (покрыты тестами).
 *
 * Принципы:
 *  - даты считаются по ЛОКАЛЬНОМУ календарю пользователя (переход на летнее время и смена пояса
 *    не сдвигают «день»); интервал в днях == «сколько календарных дней пропустить»;
 *  - в карточке хранится НЕмасштабированный SM-2 интервал; пользовательский масштаб применяется
 *    только к дате показа (иначе множитель копился бы от повторения к повторению);
 *  - «Заново» возвращает карточку в очередь через 10 минут, а не через сутки.
 */

import { gradeToQuality, sm2Schedule, scaleInterval } from './training-srs.js';

export const MINUTE_MS = 60000;
export const AGAIN_DELAY_MS = 10 * MINUTE_MS;
export const DEFAULT_NEW_PER_DAY = 10;
export const MAX_NEW_PER_DAY = 200;
export const MATURE_INTERVAL_DAYS = 21;

/**
 * @param {number} ts
 * @returns {string} YYYY-MM-DD в локальном часовом поясе
 */
export function localDayKey(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * @param {number} ts
 * @returns {number} локальная полночь
 */
export function startOfLocalDay(ts) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Локальная полночь через n календарных дней (корректно через границы DST).
 * @param {number} ts
 * @param {number} n
 * @returns {number}
 */
export function addLocalDays(ts, n) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/**
 * @param {unknown} v
 * @param {number} dflt
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampInt(v, dflt, min, max) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
}

/**
 * @param {unknown} v
 * @returns {number}
 */
export function normalizeNewPerDay(v) {
    return clampInt(v, DEFAULT_NEW_PER_DAY, 0, MAX_NEW_PER_DAY);
}

/**
 * Новая карточка: ещё ни разу не оценивалась (старые записи без lastReviewedAt и с repetitions=0 — тоже новые).
 * @param {{ repetitions?: number, lastReviewedAt?: number|string|null }} card
 */
export function isNewCard(card) {
    return !card.lastReviewedAt && !(Number(card.repetitions) > 0);
}

/**
 * @param {{ repetitions?: number, intervalDays?: number, lastReviewedAt?: unknown }} card
 * @returns {'new'|'learning'|'young'|'mature'}
 */
export function cardMaturity(card) {
    if (isNewCard(card)) return 'new';
    if (!(Number(card.repetitions) > 0)) return 'learning';
    return Number(card.intervalDays) >= MATURE_INTERVAL_DAYS ? 'mature' : 'young';
}

/**
 * Следующее состояние карточки после оценки. Детерминировано при одинаковых входах.
 * @param {object} card
 * @param {'again'|'hard'|'good'|'easy'} grade
 * @param {number} scale множитель интервала (0.5..2)
 * @param {number} now
 * @returns {{ repetitions: number, easeFactor: number, intervalDays: number, dueAt: number, lastReviewedAt: number, lapses: number, reviewCount: number }}
 */
export function scheduleReview(card, grade, scale, now) {
    const wasKnown = Number(card.repetitions) > 0;
    const next = sm2Schedule(
        gradeToQuality(grade),
        card.repetitions || 0,
        card.easeFactor || 2.5,
        card.intervalDays || 0,
    );
    let interval = next.intervalDays;
    // Градации «Сложно»/«Легко» различаются по интервалу (в SM-2 они отличаются только ease)
    if ((card.repetitions || 0) >= 2) {
        if (grade === 'hard') interval = Math.max(1, Math.round(interval * 0.8));
        else if (grade === 'easy') interval = Math.max(interval + 1, Math.round(interval * 1.3));
    } else if (grade === 'easy' && (card.repetitions || 0) === 0) {
        interval = 3;
    }
    const lapses = (Number(card.lapses) || 0) + (grade === 'again' && wasKnown ? 1 : 0);
    const shown = grade === 'again' ? 1 : scaleInterval(interval, scale);
    const dueAt = grade === 'again' ? now + AGAIN_DELAY_MS : addLocalDays(now, shown);
    return {
        repetitions: next.repetitions,
        easeFactor: next.easeFactor,
        intervalDays: interval,
        dueAt,
        lastReviewedAt: now,
        lapses,
        reviewCount: (Number(card.reviewCount) || 0) + 1,
    };
}

/**
 * @param {number} days
 * @returns {string}
 */
export function formatIntervalDays(days) {
    const d = Math.max(0, Math.round(days));
    if (d <= 0) return '<10 мин';
    if (d === 1) return '1 д';
    if (d < 30) return `${d} д`;
    if (d < 365) {
        const m = Math.round(d / 30);
        return `${m} мес`;
    }
    const y = Math.round((d / 365) * 10) / 10;
    return `${String(y).replace('.', ',')} г`;
}

/**
 * Подписи интервалов для кнопок оценки.
 * @param {object} card
 * @param {number} scale
 * @param {number} now
 * @returns {Record<'again'|'hard'|'good'|'easy', string>}
 */
export function previewIntervals(card, scale, now) {
    /** @type {any} */
    const out = {};
    for (const g of /** @type {const} */ (['again', 'hard', 'good', 'easy'])) {
        if (g === 'again') {
            out[g] = '<10 мин';
            continue;
        }
        const r = scheduleReview(card, g, scale, now);
        const days = Math.round((startOfLocalDay(r.dueAt) - startOfLocalDay(now)) / 86400000);
        out[g] = formatIntervalDays(days);
    }
    return out;
}

/**
 * Приоритет повторения: просроченность, сбои, низкая лёгкость, карточки из «слабых мест».
 * @param {object} card
 * @param {number} now
 * @returns {number}
 */
export function reviewPriority(card, now) {
    const overdueDays = Math.max(0, Math.min(30, (now - (Number(card.dueAt) || now)) / 86400000));
    const lapses = Math.min(10, Number(card.lapses) || 0);
    const lowEase = Number(card.easeFactor) > 0 && Number(card.easeFactor) < 2 ? 2 : 0;
    const weak = card.sourceType === 'weak' ? 3 : 0;
    return overdueDays + lapses * 2 + lowEase + weak;
}

/**
 * Умная очередь: сначала повторения по приоритету, затем новые карточки в пределах дневного лимита.
 * @param {object} p
 * @param {object[]} p.cards
 * @param {number} p.now
 * @param {number} p.newPerDay
 * @param {number} p.newIntroducedToday
 * @param {number} [p.maxReviews]
 * @returns {{ queue: object[], reviews: object[], news: object[], dueReviews: number, dueNew: number, blockedNew: number, laterToday: number }}
 */
export function buildReviewQueue({ cards, now, newPerDay, newIntroducedToday, maxReviews = 300 }) {
    const reviews = [];
    const newCards = [];
    let laterToday = 0;
    const endToday = addLocalDays(now, 1);
    for (const c of cards || []) {
        if (!c || typeof c !== 'object') continue;
        const due = Number(c.dueAt);
        if (!Number.isFinite(due)) continue;
        if (isNewCard(c)) {
            newCards.push(c);
            continue;
        }
        if (due <= now) reviews.push(c);
        else if (due < endToday) laterToday++;
    }
    reviews.sort((a, b) => {
        const d = reviewPriority(b, now) - reviewPriority(a, now);
        return d !== 0 ? d : (a.dueAt || 0) - (b.dueAt || 0);
    });
    newCards.sort((a, b) => {
        const d = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        return d !== 0 ? d : (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    const allowance = Math.max(0, normalizeNewPerDay(newPerDay) - Math.max(0, newIntroducedToday || 0));
    const news = newCards.slice(0, allowance);
    const reviewsCut = reviews.slice(0, maxReviews);
    return {
        queue: [...reviewsCut, ...news],
        reviews: reviewsCut,
        news,
        dueReviews: reviews.length,
        dueNew: news.length,
        blockedNew: Math.max(0, newCards.length - news.length),
        laterToday,
    };
}

/**
 * Прогноз: сколько повторений придётся на ближайшие дни (0 = сейчас и просроченные).
 * @param {object[]} cards
 * @param {number} now
 * @param {number} [days]
 * @returns {number[]}
 */
export function forecastDue(cards, now, days = 7) {
    const out = new Array(days).fill(0);
    const today = startOfLocalDay(now);
    for (const c of cards || []) {
        if (!c || isNewCard(c)) continue;
        const due = Number(c.dueAt);
        if (!Number.isFinite(due)) continue;
        const idx = Math.round((startOfLocalDay(due) - today) / 86400000);
        const i = Math.max(0, idx);
        if (i < days) out[i]++;
    }
    return out;
}

/**
 * Сводка по колоде.
 * @param {object[]} cards
 * @param {number} now
 */
export function summarizeDeck(cards, now) {
    const s = { total: 0, new: 0, learning: 0, young: 0, mature: 0, due: 0 };
    for (const c of cards || []) {
        if (!c || typeof c !== 'object') continue;
        s.total++;
        s[cardMaturity(c)]++;
        if (!isNewCard(c) && Number(c.dueAt) <= now) s.due++;
    }
    return s;
}

/**
 * Ключ для поиска дубликатов карточек: одна и та же сущность-источник либо тот же вопрос.
 * @param {{ sourceType?: string, sourceId?: unknown, front?: string }} card
 * @returns {string[]}
 */
export function cardDedupeKeys(card) {
    const keys = [];
    const st = String(card.sourceType || '');
    if (card.sourceId != null && card.sourceId !== '' && st && st !== 'manual') {
        keys.push(`src:${st}:${String(card.sourceId)}`);
    }
    const front = String(card.front || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    if (front) keys.push(`front:${front}`);
    return keys;
}

/**
 * @param {object[]} existing
 * @param {object} candidate
 * @param {number|string|null} [ignoreId] id редактируемой карточки
 * @returns {object | null}
 */
export function findDuplicateCard(existing, candidate, ignoreId = null) {
    const want = new Set(cardDedupeKeys(candidate));
    if (!want.size) return null;
    for (const c of existing || []) {
        if (!c || (ignoreId != null && String(c.id) === String(ignoreId))) continue;
        if (cardDedupeKeys(c).some((k) => want.has(k))) return c;
    }
    return null;
}

/**
 * Сколько новых карточек уже впервые показано сегодня (по локальному календарю):
 * первая оценка = reviewCount 1 и lastReviewedAt сегодня.
 * @param {object[]} cards
 * @param {number} now
 * @returns {number}
 */
export function countIntroducedToday(cards, now) {
    const today = localDayKey(now);
    let n = 0;
    for (const c of cards || []) {
        if (!c || typeof c !== 'object') continue;
        if (Number(c.reviewCount) !== 1) continue;
        const ts = typeof c.lastReviewedAt === 'number' ? c.lastReviewedAt : Date.parse(String(c.lastReviewedAt || ''));
        if (Number.isFinite(ts) && localDayKey(ts) === today) n++;
    }
    return n;
}
