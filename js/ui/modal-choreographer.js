'use strict';

/**
 * Хореограф модальных окон: единый UX-слой для всех окон `div[role=dialog].fixed.inset-0`,
 * независимо от того, чем они открываются (openAnimatedModal или прямое переключение класса hidden).
 *
 *  1. Фокус: при открытии — ловушка Tab и перевод фокуса внутрь, при закрытии — возврат на кнопку-источник.
 *     Окна, у которых ловушку уже включил собственный код, не трогаем.
 *  2. Клик по затемнению закрывает только окна «для чтения» (список BACKDROP_CLOSABLE_IDS):
 *     закрытие делается нажатием штатной кнопки закрытия, чтобы отработали все проверки модуля.
 *     У окон с формами клик по затемнению по-прежнему не закрывает (защита от потери ввода).
 *  3. Подсказка прокрутки: у длинного контента появляется тень сверху/снизу, пока есть что прокручивать.
 *  4. Блокировка прокрутки страницы синхронизируется с реально открытыми окнами.
 */

import {
    activateModalFocus,
    deactivateModalFocus,
    getVisibleModals,
    getTopmostModal,
    syncBodyScrollLockAfterModalClose,
} from './modals-manager.js';

export const BACKDROP_CLOSABLE_IDS = Object.freeze([
    'algorithmModal',
    'bookmarkDetailModal',
    'reglamentDetailModal',
    'hotkeysModal',
    'healthReportModal',
]);

const CLOSE_SELECTORS = [
    '[data-modal-close]',
    'button[id^="close"][id$="Btn"]',
    'button[id$="CloseBtn"]',
    'button[id*="lose" i]',
    'button[aria-label*="акрыть" i]',
];

export function isBackdropClosable(modal) {
    return !!modal && BACKDROP_CLOSABLE_IDS.includes(modal.id);
}

export function findCloseButton(modal) {
    if (!modal) return null;
    for (const sel of CLOSE_SELECTORS) {
        const el = modal.querySelector(sel);
        if (el && !el.disabled) return el;
    }
    return null;
}

/** Закрыть окно по клику на затемнение; true, если закрытие запрошено. */
export function requestBackdropClose(modal, target) {
    if (!isBackdropClosable(modal)) return false;
    if (target !== modal && !target?.hasAttribute?.('data-modal-backdrop')) return false;
    const btn = findCloseButton(modal);
    if (!btn) return false;
    btn.click();
    return true;
}

function isDialogOverlay(el) {
    return (
        el instanceof HTMLElement &&
        el.getAttribute('role') === 'dialog' &&
        el.classList.contains('fixed') &&
        el.classList.contains('inset-0')
    );
}

function updateScrollCue(scroller) {
    const max = scroller.scrollHeight - scroller.clientHeight;
    const more = max > 4;
    scroller.classList.toggle('has-more-above', more && scroller.scrollTop > 4);
    scroller.classList.toggle('has-more-below', more && scroller.scrollTop < max - 4);
}

function attachScrollCue(modal) {
    const scrollers = new Set();
    if (modal.classList.contains('overflow-y-auto')) scrollers.add(modal);
    modal.querySelectorAll('.overflow-y-auto').forEach((el) => scrollers.add(el));
    scrollers.forEach((el) => {
        el.classList.add('modal-scroll-cue');
        if (!el._modalCueBound) {
            el._modalCueBound = true;
            el.addEventListener('scroll', () => updateScrollCue(el), { passive: true });
        }
        updateScrollCue(el);
    });
}

/** В окнах с формой фокус — в первое видимое поле ввода, а не на кнопку «развернуть». */
export function findPreferredField(modal) {
    const fields = modal.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );
    for (const el of fields) {
        if (el.offsetParent !== null && !el.readOnly) return el;
    }
    return null;
}

function announceVisibility(modal, shown) {
    try {
        document.dispatchEvent(new CustomEvent('app:modal-visibility', { detail: { modal, shown } }));
    } catch {
        /* ignore */
    }
}

const MOBILE_MQ = '(max-width: 767px), (pointer: coarse) and (max-height: 500px)';
const isMobileNow = () => {
    try {
        return !!window.matchMedia && window.matchMedia(MOBILE_MQ).matches;
    } catch {
        return false;
    }
};

/** Ручка «шторки» вверху панели: за неё окно тянется вниз на телефонах (CSS показывает её только <=640px). */
function ensureSheetHandle(modal) {
    const panel = modal.querySelector(
        '.modal-inner-container, .engineering-cockpit-shell, .app-customization-panel, .db-merge-shell, .bg-white.dark\\:bg-gray-800.rounded-lg',
    );
    if (!panel || panel.querySelector(':scope > .modal-sheet-handle')) return;
    const h = document.createElement('div');
    h.className = 'modal-sheet-handle';
    h.setAttribute('aria-hidden', 'true');
    panel.insertBefore(h, panel.firstChild);
}

// Жест/кнопка «Назад» на телефоне закрывает верхнее окно, а не уходит со страницы.
const backStack = [];
let backBound = false;
let ignorePop = 0;

function bindBackGesture() {
    if (backBound || typeof window === 'undefined') return;
    backBound = true;
    window.addEventListener('popstate', () => {
        if (ignorePop > 0) {
            ignorePop -= 1;
            return;
        }
        const modal = backStack.pop();
        if (!modal || modal.classList.contains('hidden')) return;
        modal._closedByBack = true;
        const btn = findCloseButton(modal);
        if (btn) btn.click();
    });
}

function pushBackEntry(modal) {
    if (!isMobileNow() || backStack.includes(modal)) return;
    bindBackGesture();
    try {
        history.pushState({ appModal: modal.id || true }, '');
        backStack.push(modal);
    } catch {
        /* ignore */
    }
}

function popBackEntry(modal) {
    const i = backStack.indexOf(modal);
    if (i < 0) return;
    backStack.splice(i, 1);
    if (modal._closedByBack) {
        modal._closedByBack = false;
        return;
    }
    // закрыто крестиком: убираем лишнюю запись истории
    ignorePop += 1;
    try {
        history.back();
    } catch {
        ignorePop -= 1;
    }
}

function onShown(modal) {
    announceVisibility(modal, true);
    ensureSheetHandle(modal);
    pushBackEntry(modal);
    if (modal.id === 'appCustomizationModal') return; // у студии свой режим (док справа)
    if (!modal._focusTrapActive) {
        modal._autoFocusTrap = true;
        const before = document.activeElement;
        activateModalFocus(modal);
        // Код окна мог уже поставить фокус на нужное поле — не перебиваем его.
        const alreadyInside = before && before !== modal && modal.contains(before) && before.focus;
        const target = alreadyInside ? before : findPreferredField(modal);
        if (target) {
            try {
                target.focus({ preventScroll: true });
            } catch {
                /* ignore */
            }
        }
    }
    requestAnimationFrame(() => attachScrollCue(modal));
}

function onHidden(modal) {
    popBackEntry(modal);
    announceVisibility(modal, false);
    if (modal._autoFocusTrap) {
        modal._autoFocusTrap = false;
        if (modal._focusTrapActive) deactivateModalFocus(modal);
    }
    syncBodyScrollLockAfterModalClose();
}

let started = false;

export function initModalChoreographer() {
    if (started || typeof document === 'undefined') return;
    started = true;

    const wasHidden = new WeakMap();
    const check = (el) => {
        const hidden = el.classList.contains('hidden');
        const prev = wasHidden.get(el);
        wasHidden.set(el, hidden);
        if (prev === undefined) return;
        if (prev && !hidden) onShown(el);
        else if (!prev && hidden) onHidden(el);
    };

    document.querySelectorAll('div[role="dialog"]').forEach((el) => {
        if (isDialogOverlay(el)) wasHidden.set(el, el.classList.contains('hidden'));
    });

    const mo = new MutationObserver((records) => {
        for (const r of records) {
            if (r.type === 'attributes' && isDialogOverlay(r.target)) check(r.target);
            else if (r.type === 'childList') {
                r.addedNodes.forEach((n) => {
                    if (isDialogOverlay(n) && !wasHidden.has(n)) {
                        wasHidden.set(n, n.classList.contains('hidden'));
                        if (!n.classList.contains('hidden')) onShown(n);
                    }
                });
            }
        }
    });
    mo.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    document.addEventListener('click', (event) => {
        const visible = getVisibleModals();
        if (!visible.length) return;
        const top = getTopmostModal(visible);
        if (top && event.target === top) requestBackdropClose(top, event.target);
    });
}
