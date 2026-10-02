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
        { type: 'item', id: 'command-palette', label: 'Палитра команд', hint: 'Ctrl+K' },
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

    const contextItems = buildContextItems(state.context);
    return [
        ...contextItems,
        { type: 'item', id: 'home', label: 'Главная' },
        { type: 'item', id: 'favorites', label: 'Избранное' },
        { type: 'sep' },
        { type: 'item', id: 'timer-toggle', label: timerLabel, hint: 'Ctrl+Alt+T' },
        { type: 'item', id: 'timer-reset', label: 'Сбросить таймер', hint: 'Ctrl+Alt+R' },
        { type: 'item', id: 'extension', label: 'Показать добавочный' },
        { type: 'sep' },
        ...tail,
    ];
}

/**
 * Контекстные пункты (карточка / выделенный текст). Пустой массив, если контекста нет.
 * @param {{ card?: { open?: boolean; copyUrl?: boolean; edit?: boolean; favorite?: boolean; remove?: boolean; label?: string }; selection?: string } | undefined} ctx
 */
export function buildContextItems(ctx) {
    if (!ctx) return [];
    const out = [];
    const c = ctx.card;
    if (c) {
        if (c.open) out.push({ type: 'item', id: 'ctx-open', label: 'Открыть' });
        if (c.copyUrl) out.push({ type: 'item', id: 'ctx-copy-url', label: 'Копировать ссылку' });
        if (c.edit) out.push({ type: 'item', id: 'ctx-edit', label: 'Редактировать' });
        if (c.favorite) out.push({ type: 'item', id: 'ctx-favorite', label: 'В избранное / из избранного' });
        if (c.duplicate) out.push({ type: 'item', id: 'ctx-duplicate', label: 'Дублировать запись' });
        if (c.remove) out.push({ type: 'item', id: 'ctx-delete', label: 'Удалить', danger: true });
    }
    const sel = (ctx.selection || '').trim();
    if (sel) {
        if (out.length) out.push({ type: 'sep' });
        out.push({ type: 'item', id: 'ctx-copy-selection', label: 'Копировать выделенное', hint: 'Ctrl+C' });
        out.push({ type: 'item', id: 'ctx-search-selection', label: 'Искать выделенное в приложении' });
        if (looksLikeRequisites(sel)) {
            out.push({ type: 'item', id: 'ctx-check-requisites', label: 'Проверить реквизиты' });
        }
        const innDigits = extractInnCandidate(sel);
        if (innDigits) {
            out.push({
                type: 'item',
                id: 'ctx-blacklist-inn',
                label: `В чёрный список: ИНН ${innDigits}`,
            });
        }
    }
    if (out.length) out.push({ type: 'sep' });
    return out;
}

/**
 * Выделение стоит проверять как реквизиты: есть длинная цифровая последовательность (9+ цифр, допускаются
 * пробелы и дефисы) или e-mail. Дёшево: только регулярки, без валидации.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeRequisites(text) {
    const t = String(text ?? '');
    if (t.length < 9 || t.length > 5000) return false;
    return /\d[\d\s-]{7,}\d/.test(t) && t.replace(/\D/g, '').length >= 9;
}

/**
 * Если выделение — ИНН (10 или 12 цифр, допускаются пробелы/дефисы между цифрами), вернуть только цифры.
 * @param {string} text
 * @returns {string}
 */
export function extractInnCandidate(text) {
    const t = String(text ?? '').trim();
    if (!/^[\d][\d\s\-]*[\d]$/.test(t)) return '';
    const digits = t.replace(/[\s\-]/g, '');
    return digits.length === 10 || digits.length === 12 ? digits : '';
}
