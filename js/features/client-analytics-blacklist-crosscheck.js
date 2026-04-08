'use strict';

/**
 * Перекрёстная сверка ИНН записей «База клиентов» с чёрным списком (жабы).
 * Чистые функции: одна точка нормализации и агрегации уровня для тестов и рендера.
 */

/**
 * @param {unknown} inn
 * @returns {string} ключ 10 или 12 цифр либо '' если не распознано
 */
export function normalizeInnForBlacklistLookup(inn) {
    if (inn == null) return '';
    const s = String(inn).trim();
    if (!s) return '';
    const compact = s.replace(/\D/g, '');
    if (compact.length === 10 || compact.length === 12) return compact;
    const m = s.match(/\b(\d{10}|\d{12})\b/);
    return m ? m[1] : '';
}

/**
 * По всем записям ЧС строит Map: нормализованный ИНН → максимальный уровень (1…3).
 * Несколько записей с одним ИНН — берётся max(level), как наихудший случай.
 *
 * @param {Array<{ inn?: string|null, level?: number }>|null|undefined} entries
 * @returns {Map<string, number>}
 */
export function buildMaxBlacklistLevelByInnMap(entries) {
    const map = new Map();
    if (!entries || !entries.length) return map;
    for (const e of entries) {
        if (!e || e.inn == null) continue;
        const key = normalizeInnForBlacklistLookup(e.inn);
        if (!key) continue;
        let lvl = Number(e.level);
        if (!Number.isFinite(lvl) || lvl < 1) lvl = 1;
        if (lvl > 3) lvl = 3;
        const prev = map.get(key) || 0;
        if (lvl > prev) map.set(key, lvl);
    }
    return map;
}

/**
 * @param {unknown} recordInn
 * @param {Map<string, number>} levelByInn
 * @returns {number} 0 — нет в ЧС, иначе 1|2|3
 */
export function getBlacklistLevelForClientInn(recordInn, levelByInn) {
    if (!levelByInn || levelByInn.size === 0) return 0;
    const key = normalizeInnForBlacklistLookup(recordInn);
    if (!key) return 0;
    return levelByInn.get(key) || 0;
}

/**
 * Подпись бейджа и фрагмент для aria (дублирование цвета текстом — WCAG).
 * @param {number} level 1|2|3
 */
export function frogBadgeLabelsForLevel(level) {
    switch (level) {
        case 3:
            return { short: 'Гипержава', aria: 'ИНН в чёрном списке, уровень высокий (гипержава)' };
        case 2:
            return { short: 'Жаба · ур. 2', aria: 'ИНН в чёрном списке, средний уровень' };
        case 1:
            return { short: 'Жаба · ур. 1', aria: 'ИНН в чёрном списке, низкий уровень' };
        default:
            return { short: '', aria: '' };
    }
}
