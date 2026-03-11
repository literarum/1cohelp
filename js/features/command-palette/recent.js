'use strict';

const RECENT_STORAGE_KEY = 'copilot1co_command_palette_recent';
const MAX_RECENT = 10;

/**
 * Возвращает список id недавно выбранных результатов (новые первыми).
 * @returns {string[]}
 */
export function getRecentIds() {
    try {
        const raw = localStorage.getItem(RECENT_STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
    } catch {
        return [];
    }
}

/**
 * Добавляет id выбранного результата в начало списка недавних и сохраняет в localStorage.
 * @param {string} id - id результата (например 'action:openSettings', 'tab:main')
 */
export function addRecentId(id) {
    if (!id || typeof id !== 'string') return;
    const ids = getRecentIds();
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, MAX_RECENT);
    try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // ignore quota or other storage errors
    }
}

/**
 * Признак результата из палитры (действия, вкладки, алгоритмы и т.д.), а не из глобального поиска.
 * @param {object} r - элемент результата
 * @returns {boolean}
 */
function isFromPalette(r) {
    return !r.payload?.fullResult;
}

/**
 * Переупорядочивает результаты: палитра всегда выше глобальной выдачи; внутри каждой группы
 * сначала недавно выбранные (по id), затем остальные по score.
 * @param {Array<{ id: string, score: number, payload?: object }>} results - массив результатов
 * @param {string[]} recentIds - id недавних (порядок = приоритет)
 * @returns {Array} тот же массив, переупорядоченный
 */
export function reorderByRecent(results, recentIds) {
    const palette = results.filter(isFromPalette);
    const global = results.filter((r) => !isFromPalette(r));
    const byScore = (a, b) => (b.score ?? 0) - (a.score ?? 0);
    const reorderGroup = (group) => {
        if (!recentIds.length) {
            group.sort(byScore);
            return group;
        }
        const recentSet = new Set(recentIds);
        const withRecent = group.filter((r) => recentSet.has(r.id));
        const rest = group.filter((r) => !recentSet.has(r.id));
        const order = (a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id);
        withRecent.sort(order);
        rest.sort(byScore);
        return [...withRecent, ...rest];
    };
    return [...reorderGroup(palette), ...reorderGroup(global)];
}
