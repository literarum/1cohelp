'use strict';

/**
 * Сквозная клавиатурная доступность (делегирование на document, без привязки к модулям):
 * - стрелки/Home/End в любом [role="tablist"] переводят фокус и активируют вкладку;
 * - Enter/Пробел на label[data-file-trigger] (или label[role="button"] с input[type=file]) открывают выбор файла.
 */

const TAB_SELECTOR = '[role="tab"]:not([disabled]):not([aria-disabled="true"])';

function isVisible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

/**
 * @param {KeyboardEvent} e
 * @returns {boolean} обработано
 */
export function handleTablistKeydown(e) {
    const tab = e.target instanceof Element ? e.target.closest('[role="tab"]') : null;
    if (!tab) return false;
    const list = tab.closest('[role="tablist"]');
    if (!list) return false;
    const vertical = list.getAttribute('aria-orientation') === 'vertical';
    const prevKeys = vertical ? ['ArrowUp'] : ['ArrowLeft'];
    const nextKeys = vertical ? ['ArrowDown'] : ['ArrowRight'];
    const tabs = Array.from(list.querySelectorAll(TAB_SELECTOR)).filter(
        (t) => t.closest('[role="tablist"]') === list && isVisible(t),
    );
    if (tabs.length === 0) return false;
    const idx = tabs.indexOf(tab);
    let nextIdx = -1;
    if (prevKeys.includes(e.key)) nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (nextKeys.includes(e.key)) nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    else return false;
    e.preventDefault();
    const target = tabs[nextIdx];
    const targetId = target.id || null;
    target.click();
    // Обработчик клика может перерисовать список: ищем «ту же» вкладку заново.
    const refocus =
        (targetId && document.getElementById(targetId)) ||
        (target.isConnected
            ? target
            : list.isConnected
              ? list.querySelectorAll(TAB_SELECTOR)[nextIdx]
              : null);
    const fallback = document.querySelectorAll('[role="tablist"] [aria-selected="true"]');
    (refocus || fallback[0])?.focus?.();
    if (targetId) {
        // Асинхронная перерисовка (данные из IndexedDB) заменит узел позже — вернём фокус на новую вкладку.
        const restore = () => {
            const fresh = document.getElementById(targetId);
            if (fresh && document.activeElement !== fresh) {
                const active = document.activeElement;
                if (!active || active === document.body || !active.isConnected) fresh.focus();
            }
        };
        setTimeout(restore, 60);
        setTimeout(restore, 300);
    }
    return true;
}

/**
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
export function handleFileTriggerKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return false;
    const label = e.target instanceof Element ? e.target.closest('label') : null;
    if (!label || e.target !== label) return false;
    if (!label.hasAttribute('data-file-trigger') && label.getAttribute('role') !== 'button') {
        return false;
    }
    const input =
        label.querySelector('input[type="file"]') ||
        (label.htmlFor ? document.getElementById(label.htmlFor) : null);
    if (!input) return false;
    e.preventDefault();
    input.click();
    return true;
}

let installed = false;

export function initA11yKeyboard() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        if (handleTablistKeydown(e)) return;
        handleFileTriggerKeydown(e);
    });
}
