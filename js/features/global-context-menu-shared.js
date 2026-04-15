'use strict';

/**
 * Чистые функции контекстного меню (без зависимостей от DOM приложения) — для тестов и повторного использования.
 */

/**
 * @param {MouseEvent & { shiftKey?: boolean }} event
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function shouldDeferToNativeContextMenu(event, target) {
    if (event && event.shiftKey) return true;
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    if (el.closest(`[data-allow-native-contextmenu="true"]`)) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el instanceof HTMLElement && el.isContentEditable) return true;
    return false;
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} menuW
 * @param {number} menuH
 * @param {number} vw
 * @param {number} vh
 */
export function clampMenuPosition(clientX, clientY, menuW, menuH, vw, vh) {
    const pad = 8;
    let left = Math.min(clientX, vw - menuW - pad);
    let top = Math.min(clientY, vh - menuH - pad);
    left = Math.max(pad, left);
    top = Math.max(pad, top);
    return { left, top };
}

/**
 * @param {{
 *   timerRunning: boolean;
 *   viewToggle: { disabled: boolean; label: string; hiddenInMenu?: boolean };
 * }} state
 * @returns {Array<
 *   | { type: 'item'; id: string; label: string; disabled?: boolean }
 *   | { type: 'sep' }
 * >}
 */
export function buildMenuItemDescriptors(state) {
    const timerLabel = state.timerRunning ? 'Остановить таймер' : 'Запустить таймер';
    const tail = [
        { type: 'item', id: 'search', label: 'Поиск' },
        { type: 'item', id: 'command-palette', label: 'Палитра команд' },
        { type: 'item', id: 'hotkeys', label: 'Шорткаты' },
    ];
    if (!state.viewToggle.hiddenInMenu) {
        tail.push({
            type: 'item',
            id: 'view-toggle',
            label: state.viewToggle.label,
            disabled: state.viewToggle.disabled,
        });
    }
    tail.push({ type: 'sep' }, { type: 'item', id: 'settings', label: 'Настройки' });

    return [
        { type: 'item', id: 'home', label: 'Главная' },
        { type: 'item', id: 'favorites', label: 'Избранное' },
        { type: 'sep' },
        { type: 'item', id: 'timer-toggle', label: timerLabel },
        { type: 'item', id: 'timer-reset', label: 'Сбросить таймер' },
        { type: 'item', id: 'extension', label: 'Показать добавочный' },
        { type: 'sep' },
        ...tail,
    ];
}
