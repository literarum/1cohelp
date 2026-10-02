'use strict';

/**
 * Единый UX форм добавления/редактирования записей без правки каждой модалки:
 * при первом открытии модалки из реестра применяется form-modal-kit (шапка с иконкой и подсказкой,
 * пометки обязательных полей, Ctrl+Enter, защита от потери несохранённых изменений),
 * а при каждом открытии «чистое» состояние формы запоминается заново.
 *
 * Модалки создаются и статически (index.html), и динамически, поэтому используется
 * один MutationObserver на изменения класса `hidden` — с проверкой по id (O(1)).
 */

import {
    enhanceFormModal,
    captureFormBaseline,
    clearFormBaseline,
    isFormDirty,
    closeWithConfirm,
} from './form-modal-kit.js';

/** @type {Record<string, import('./form-modal-kit.js').FormModalOptions | Record<string, unknown>>} */
export const FORM_MODAL_REGISTRY = {
    bookmarkModal: { titleId: 'bookmarkModalTitle', icon: 'fa-bookmark', counters: { bookmarkTitle: 200 } },
    extLinkModal: { titleId: 'extLinkModalTitle', icon: 'fa-link' },
    cibLinkModal: { titleId: 'cibLinkModalTitle', icon: 'fa-key' },
    reglamentModal: { titleId: 'reglamentModalTitle', icon: 'fa-file-alt' },
    blacklistEntryModal: { titleId: 'blacklistEntryModalTitle', icon: 'fa-user-slash' },
    // Напоминание: иконка уже есть в заголовке, формы <form> нет — Ctrl+Enter нажимает кнопку сохранения
    // Менеджеры папок/категорий: список + встроенная форма. Режим правки включается атрибутом формы,
    // поэтому «чистое» состояние перезапоминается при смене data-editing-id (см. rebaselineAttr).
    foldersModal: { icon: 'fa-folder-open', rebaselineAttr: 'data-editing-id' },
    extLinkCategoriesModal: { icon: 'fa-tags', rebaselineAttr: 'data-editing-id' },
    reminderModal: { titleId: 'reminderModalTitle', header: false, submitBtnId: 'reminderFormSubmitBtn' },
};

/** Задержка перед снимком «чистого» состояния: формы заполняются асинхронно (из IndexedDB). */
const BASELINE_DELAY_MS = 450;

function isVisible(el) {
    return !el.classList.contains('hidden') && !el.hasAttribute('hidden');
}

function handleOpened(modal) {
    const opts = FORM_MODAL_REGISTRY[modal.id];
    if (!opts) return;
    try {
        const form = modal.querySelector('form');
        enhanceFormModal(modal, form, opts);
        if (opts.submitBtnId && !form && !modal._kitSubmitBound) {
            modal._kitSubmitBound = true;
            modal.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
                const btn = modal.querySelector('#' + opts.submitBtnId);
                if (btn instanceof HTMLButtonElement && !btn.disabled) {
                    e.preventDefault();
                    btn.click();
                }
            });
        }
    } catch (err) {
        console.warn('[form-modal-autoenhance] enhance failed for', modal.id, err);
        return;
    }
    clearTimeout(modal._kitBaselineTimer);
    modal._kitBaselineTimer = setTimeout(() => {
        if (isVisible(modal)) captureFormBaseline(modal);
    }, BASELINE_DELAY_MS);
    bindRebaseline(modal, opts);
}

/** Перезапоминает «чистое» состояние, когда форма внутри модалки переключается (добавление ↔ правка). */
function bindRebaseline(modal, opts) {
    if (!opts.rebaselineAttr || modal._kitRebaselineMo) return;
    const form = modal.querySelector('form');
    if (!form || typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => {
        clearTimeout(modal._kitRebaselineTimer);
        // ждём, пока обработчик правки заполнит поля
        modal._kitRebaselineTimer = setTimeout(() => {
            if (isVisible(modal)) captureFormBaseline(modal);
        }, 60);
    });
    mo.observe(form, { attributes: true, attributeFilter: [opts.rebaselineAttr] });
    modal._kitRebaselineMo = mo;
}

function handleClosed(modal) {
    clearTimeout(modal._kitBaselineTimer);
    clearFormBaseline(modal);
}

let started = false;

/** Кнопки закрытия/отмены внутри формы-модалки. */
const CLOSE_SEL =
    '.close-modal, [data-close-modal], button[id$="CancelBtn"], button[id$="cancelBtn"], button[id$="CloseBtn"]';

/** Перехват закрытия с несохранёнными изменениями: подтверждение «Выйти без сохранения». */
function onCloseClickCapture(e) {
    const btn = e.target instanceof Element ? e.target.closest(CLOSE_SEL) : null;
    if (!btn) return;
    let modal = btn.parentElement;
    while (modal && !FORM_MODAL_REGISTRY[modal.id]) modal = modal.parentElement;
    if (!modal || !isFormDirty(modal)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void closeWithConfirm(modal, () => btn.click());
}

function onEscapeCapture(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const confirmEl = document.getElementById('unsavedConfirmModal');
    if (confirmEl && !confirmEl.classList.contains('hidden')) return; // Esc обрабатывает само подтверждение
    const open = Object.keys(FORM_MODAL_REGISTRY)
        .map((id) => document.getElementById(id))
        .filter((m) => m && isVisible(m) && isFormDirty(m));
    if (open.length === 0) return;
    const modal = open[open.length - 1];
    const closeBtn = modal.querySelector('.close-modal, button[id$="CloseBtn"]');
    if (!closeBtn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void closeWithConfirm(modal, () => closeBtn.click());
}

export function initFormModalAutoEnhance() {
    if (started || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    started = true;
    const state = new WeakMap();
    const check = (el) => {
        if (!(el instanceof HTMLElement) || !FORM_MODAL_REGISTRY[el.id]) return;
        const vis = isVisible(el);
        if (state.get(el) === vis) return;
        state.set(el, vis);
        if (vis) handleOpened(el);
        else handleClosed(el);
    };
    const mo = new MutationObserver((records) => {
        for (const r of records) {
            if (r.type === 'attributes') check(r.target);
            else r.addedNodes.forEach((n) => n instanceof HTMLElement && check(n));
        }
    });
    mo.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden'],
    });
    document.addEventListener('click', onCloseClickCapture, true);
    document.addEventListener('keydown', onEscapeCapture, true);
    Object.keys(FORM_MODAL_REGISTRY).forEach((id) => check(document.getElementById(id)));
}
