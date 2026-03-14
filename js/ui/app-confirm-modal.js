'use strict';

/**
 * Универсальное модальное окно подтверждения/алерта в стилистике приложения.
 * Замена стандартных window.confirm() и window.alert().
 */

import {
    activateModalFocus,
    deactivateModalFocus,
    enhanceModalAccessibility,
} from './modals-manager.js';

let addEscapeHandler = null;
let removeEscapeHandler = null;

export function setAppConfirmModalDependencies(deps) {
    if (deps.addEscapeHandler !== undefined) addEscapeHandler = deps.addEscapeHandler;
    if (deps.removeEscapeHandler !== undefined) removeEscapeHandler = deps.removeEscapeHandler;
}

/**
 * Показывает модальное окно подтверждения (две кнопки).
 * @param {Object} options
 * @param {string} [options.title='Подтверждение']
 * @param {string} options.message
 * @param {string} [options.confirmText='Да']
 * @param {string} [options.cancelText='Отмена']
 * @param {string} [options.confirmClass='bg-primary hover:bg-secondary text-white']
 * @param {boolean} [options.messageIsHtml=false] — если true, message вставляется как HTML (innerHTML).
 * @param {boolean} [options.returnAction=false] — если true, возвращает действие:
 *   'confirm' | 'cancel' | 'dismiss' (крестик/Esc/клик по фону).
 * @returns {Promise<boolean|string>}
 */
export function showAppConfirm(options = {}) {
    const {
        title = 'Подтверждение',
        message = '',
        confirmText = 'Да',
        cancelText = 'Отмена',
        confirmClass = 'bg-primary hover:bg-secondary text-white',
        messageIsHtml = false,
        returnAction = false,
    } = options;

    const modal = document.getElementById('appConfirmModal');
    if (!modal) {
        return Promise.resolve(
            typeof window !== 'undefined' && window.confirm
                ? window.confirm(message || title)
                : false,
        );
    }

    const titleEl = modal.querySelector('#appConfirmModalTitle');
    const messageEl = modal.querySelector('#appConfirmModalMessage');
    const buttonsWrap = modal.querySelector('#appConfirmModalButtons');
    const closeBtn = modal.querySelector('#appConfirmModalCloseBtn');
    if (!buttonsWrap || !messageEl) {
        return Promise.resolve(window.confirm ? window.confirm(message || title) : false);
    }

    if (titleEl) titleEl.textContent = title;
    if (messageIsHtml) {
        messageEl.innerHTML = message;
    } else {
        messageEl.textContent = message;
    }
    enhanceModalAccessibility(modal, {
        labelledBy: 'appConfirmModalTitle',
        describedBy: 'appConfirmModalMessage',
    });

    buttonsWrap.innerHTML = '';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className =
        'px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-md transition font-medium app-confirm-cancel';
    cancelBtn.textContent = cancelText;
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `px-4 py-2 rounded-md transition font-medium app-confirm-ok ${confirmClass}`;
    confirmBtn.textContent = confirmText;

    return new Promise((resolve) => {
        let settled = false;
        let onOverlayClick = null;
        let onCloseClick = null;
        const finish = (result, action) => {
            if (settled) return;
            settled = true;
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden', 'modal-open');
            if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
            document.removeEventListener('keydown', onEscape);
            if (onOverlayClick) modal.removeEventListener('click', onOverlayClick);
            if (closeBtn && onCloseClick) closeBtn.removeEventListener('click', onCloseClick);
            deactivateModalFocus(modal);
            resolve(returnAction ? action : result);
        };
        const onEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false, 'dismiss');
            }
        };
        cancelBtn.addEventListener('click', () => finish(false, 'cancel'));
        confirmBtn.addEventListener('click', () => finish(true, 'confirm'));
        onOverlayClick = (e) => {
            if (e.target === modal) finish(false, 'dismiss');
        };
        modal.addEventListener('click', onOverlayClick);
        onCloseClick = () => finish(false, 'dismiss');
        if (closeBtn) closeBtn.addEventListener('click', onCloseClick);

        buttonsWrap.appendChild(cancelBtn);
        buttonsWrap.appendChild(confirmBtn);
        document.addEventListener('keydown', onEscape);
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden', 'modal-open');
        activateModalFocus(modal);
        if (typeof addEscapeHandler === 'function') addEscapeHandler(modal);
    });
}

/**
 * Показывает модальное окно-алерт (одна кнопка OK).
 * @param {Object} options
 * @param {string} [options.title='Уведомление']
 * @param {string} options.message
 * @returns {Promise<void>}
 */
export function showAppAlert(options = {}) {
    const { title = 'Уведомление', message = '' } = options;

    const modal = document.getElementById('appConfirmModal');
    if (!modal) {
        if (typeof window !== 'undefined' && window.alert) window.alert(message || title);
        return Promise.resolve();
    }

    const titleEl = modal.querySelector('#appConfirmModalTitle');
    const messageEl = modal.querySelector('#appConfirmModalMessage');
    const buttonsWrap = modal.querySelector('#appConfirmModalButtons');
    const closeBtn = modal.querySelector('#appConfirmModalCloseBtn');
    if (!buttonsWrap || !messageEl) {
        if (window.alert) window.alert(message || title);
        return Promise.resolve();
    }

    if (titleEl) titleEl.textContent = title;
    messageEl.textContent = message;
    enhanceModalAccessibility(modal, {
        labelledBy: 'appConfirmModalTitle',
        describedBy: 'appConfirmModalMessage',
    });

    buttonsWrap.innerHTML = '';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className =
        'px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition font-medium';
    okBtn.textContent = 'OK';

    return new Promise((resolve) => {
        let settled = false;
        let onOverlayClick = null;
        let onCloseClick = null;
        const finish = () => {
            if (settled) return;
            settled = true;
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden', 'modal-open');
            if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
            document.removeEventListener('keydown', onEscape);
            if (onOverlayClick) modal.removeEventListener('click', onOverlayClick);
            if (closeBtn && onCloseClick) closeBtn.removeEventListener('click', onCloseClick);
            deactivateModalFocus(modal);
            resolve();
        };
        const onEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish();
            }
        };
        okBtn.addEventListener('click', finish);
        onOverlayClick = (e) => {
            if (e.target === modal) finish();
        };
        modal.addEventListener('click', onOverlayClick);
        onCloseClick = () => finish();
        if (closeBtn) closeBtn.addEventListener('click', onCloseClick);

        buttonsWrap.appendChild(okBtn);
        document.addEventListener('keydown', onEscape);
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden', 'modal-open');
        activateModalFocus(modal);
        if (typeof addEscapeHandler === 'function') addEscapeHandler(modal);
    });
}
