'use strict';

/**
 * Модальное окно подтверждения выхода без сохранения (в стиле приложения).
 * Возвращает Promise<boolean>: true — пользователь выбрал «Выйти», false — «Отмена».
 */

import {
    activateModalFocus,
    deactivateModalFocus,
    enhanceModalAccessibility,
} from './modals-manager.js';

let addEscapeHandler = null;
let removeEscapeHandler = null;
let getVisibleModals = null;

export function setUnsavedConfirmModalDependencies(deps) {
    if (deps.addEscapeHandler !== undefined) addEscapeHandler = deps.addEscapeHandler;
    if (deps.removeEscapeHandler !== undefined) removeEscapeHandler = deps.removeEscapeHandler;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
}

/**
 * Показывает модальное окно «Выйти без сохранения?» в стиле приложения.
 * @param {string} [message] — текст сообщения (по умолчанию стандартный).
 * @returns {Promise<boolean>} true — выйти без сохранения, false — отмена.
 */
export function showUnsavedConfirmModal(message) {
    const modal = document.getElementById('unsavedConfirmModal');
    const messageEl = document.getElementById('unsavedConfirmModalMessage');
    const cancelBtn = document.getElementById('unsavedConfirmCancelBtn');
    const leaveBtn = document.getElementById('unsavedConfirmLeaveBtn');

    if (!modal || !cancelBtn || !leaveBtn) {
        return Promise.resolve(
            typeof window !== 'undefined' && window.confirm
                ? window.confirm(message || 'Изменения не сохранены. Закрыть без сохранения?')
                : true,
        );
    }

    if (messageEl && message) {
        messageEl.textContent = message;
    } else if (messageEl) {
        messageEl.textContent =
            'Изменения не сохранены. Вы действительно хотите выйти без сохранения?';
    }
    enhanceModalAccessibility(modal, {
        labelledBy: 'unsavedConfirmModalTitle',
        describedBy: 'unsavedConfirmModalMessage',
    });

    if (modal._unsavedCancelClickHandler) {
        cancelBtn.removeEventListener('click', modal._unsavedCancelClickHandler);
        delete modal._unsavedCancelClickHandler;
    }
    if (modal._unsavedLeaveClickHandler) {
        leaveBtn.removeEventListener('click', modal._unsavedLeaveClickHandler);
        delete modal._unsavedLeaveClickHandler;
    }
    if (modal._unsavedEscapeKeyHandler) {
        document.removeEventListener('keydown', modal._unsavedEscapeKeyHandler, true);
        delete modal._unsavedEscapeKeyHandler;
    }

    // куда вернуть фокус после «Отмена» (поле формы, в котором нажали Esc)
    const prevFocus = typeof document !== 'undefined' ? document.activeElement : null;

    return new Promise((resolve) => {
        let settled = false;
        const onEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                finish(false);
            }
        };
        const onCancel = () => finish(false);
        const onLeave = () => finish(true);

        function finish(leave) {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onEscape, true);
            cancelBtn.removeEventListener('click', onCancel);
            leaveBtn.removeEventListener('click', onLeave);
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            const visible = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
            if (visible.filter((m) => m && m.id !== 'unsavedConfirmModal').length === 0) {
                document.body.classList.remove('overflow-hidden', 'modal-open');
            }
            deactivateModalFocus(modal);
            if (!leave && prevFocus && prevFocus !== document.body && prevFocus.isConnected) {
                const restore = () => {
                    try {
                        prevFocus.focus({ preventScroll: true });
                    } catch {
                        /* элемент мог стать нефокусируемым */
                    }
                };
                restore();
                setTimeout(restore, 0);
            }
            resolve(leave);
        }

        modal._unsavedCancelClickHandler = onCancel;
        modal._unsavedLeaveClickHandler = onLeave;
        modal._unsavedEscapeKeyHandler = onEscape;

        cancelBtn.addEventListener('click', onCancel);
        leaveBtn.addEventListener('click', onLeave);
        document.addEventListener('keydown', onEscape, true); // capture: раньше глобальных обработчиков Esc

        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden', 'modal-open');
        activateModalFocus(modal);
        // Esc обрабатывает onEscape выше: общий обработчик закрывал окно, не разрешая Promise,
        // из-за чего терялся фокус, а ожидающий код «висел».
        void addEscapeHandler;
    });
}
