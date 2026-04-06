'use strict';

/**
 * SM-2 (упрощённо, детерминированно) + масштаб интервалов из настроек пользователя.
 * Резервный контур: при сбое сохранения карточки повторный расчёт даёт тот же результат при тех же входах.
 */

/** @typedef {'again' | 'hard' | 'good' | 'easy'} SrsGrade */

/**
 * @param {SrsGrade} grade
 * @returns {number} quality 0..5 для SM-2
 */
export function gradeToQuality(grade) {
    switch (grade) {
        case 'again':
            return 2;
        case 'hard':
            return 3;
        case 'good':
            return 4;
        case 'easy':
            return 5;
        default:
            return 3;
    }
}

/**
 * Классический SM-2: quality < 3 сбрасывает повторения.
 * @param {number} quality 0..5
 * @param {number} repetitions
 * @param {number} easeFactor >= 1.3
 * @param {number} intervalDays
 * @returns {{ repetitions: number, easeFactor: number, intervalDays: number }}
 */
export function sm2Schedule(quality, repetitions, easeFactor, intervalDays) {
    let ef = Number(easeFactor);
    if (!Number.isFinite(ef) || ef < 1.3) ef = 2.5;
    const reps = Math.max(0, Math.floor(repetitions || 0));
    const prevInterval = Math.max(0, Math.floor(intervalDays || 0));

    const q = Math.max(0, Math.min(5, quality));
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;

    if (q < 3) {
        return { repetitions: 0, easeFactor: ef, intervalDays: 1 };
    }

    let interval;
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.max(1, Math.round(prevInterval * ef));

    return { repetitions: reps + 1, easeFactor: ef, intervalDays: interval };
}

/**
 * @param {number} intervalDays
 * @param {number} scale положительный множитель (например 0.5..2)
 * @returns {number}
 */
export function scaleInterval(intervalDays, scale) {
    const s = Number(scale);
    if (!Number.isFinite(s) || s <= 0) return Math.max(1, intervalDays);
    return Math.max(1, Math.round(intervalDays * s));
}

/**
 * @param {number} dueAtMs
 * @param {number} intervalDays
 * @returns {number}
 */
export function nextDueFromInterval(dueAtMs, intervalDays) {
    const base = Number.isFinite(dueAtMs) ? dueAtMs : Date.now();
    const days = Math.max(1, Math.floor(intervalDays || 1));
    return base + days * 86400000;
}

/**
 * Пресеты: множитель к интервалу (не дни напрямую — гибче для «мягко/интенсивно»).
 */
export const SRS_PRESETS = Object.freeze({
    gentle: { id: 'gentle', label: 'Мягче', intervalScale: 1.35 },
    balanced: { id: 'balanced', label: 'Сбалансировано', intervalScale: 1 },
    intensive: { id: 'intensive', label: 'Интенсивнее', intervalScale: 0.65 },
});

/**
 * @param {string} presetId
 * @returns {number}
 */
export function intervalScaleFromPreset(presetId) {
    const p = SRS_PRESETS[presetId];
    return p && typeof p.intervalScale === 'number' ? p.intervalScale : SRS_PRESETS.balanced.intervalScale;
}
