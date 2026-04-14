'use strict';

/**
 * Модуль для работы с модальными окнами
 * Содержит функции для анимированного открытия и закрытия модальных окон
 */

import {
    activateModalFocus,
    deactivateModalFocus,
    enhanceModalAccessibility,
} from '../ui/modals-manager.js';

/**
 * Снимает «висящее» закрытие: transitionend + fallback setTimeout из closeAnimatedModal.
 * Нужно при повторном open до завершения анимации закрытия — иначе старый transitionend
 * снова выставит .hidden и модалка «мигнёт» (типичный случай: Кастомизация поверх полноэкранных настроек).
 *
 * @param {HTMLElement} modalElement
 */
function clearAnimatedClosePending(modalElement) {
    if (!modalElement) return;
    const handler = modalElement._animatedModalCloseOnTransitionEnd;
    if (handler) {
        modalElement.removeEventListener('transitionend', handler);
        delete modalElement._animatedModalCloseOnTransitionEnd;
    }
    const tid = modalElement._animatedModalCloseFallbackTimer;
    if (tid != null) {
        clearTimeout(tid);
        delete modalElement._animatedModalCloseFallbackTimer;
    }
    if (modalElement.style.pointerEvents === 'none') {
        modalElement.style.pointerEvents = '';
    }
}

let deps = {
    addEscapeHandler: null,
    removeEscapeHandler: null,
    onModalClose: null, // Callback для дополнительной логики при закрытии
};

/**
 * Устанавливает зависимости модуля
 */
export function setModalDependencies(dependencies) {
    if (dependencies.addEscapeHandler) deps.addEscapeHandler = dependencies.addEscapeHandler;
    if (dependencies.removeEscapeHandler)
        deps.removeEscapeHandler = dependencies.removeEscapeHandler;
    if (dependencies.onModalClose) deps.onModalClose = dependencies.onModalClose;
    console.log('[modal.js] Зависимости установлены');
}

/**
 * Открывает модальное окно с анимацией
 * @param {HTMLElement} modalElement - элемент модального окна
 */
export function openAnimatedModal(modalElement) {
    if (!modalElement) return;

    clearAnimatedClosePending(modalElement);

    const titleId = modalElement.querySelector('h1[id],h2[id],h3[id]')?.id || null;
    enhanceModalAccessibility(modalElement, { labelledBy: titleId });

    modalElement.classList.add('modal-transition');
    modalElement.classList.remove('modal-visible');
    modalElement.classList.remove('hidden');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modalElement.classList.add('modal-visible');
            document.body.classList.add('modal-open');
            activateModalFocus(modalElement);
            console.log(`[openAnimatedModal] Opened modal #${modalElement.id}`);
        });
    });

    if (
        deps.addEscapeHandler &&
        typeof deps.addEscapeHandler === 'function' &&
        !modalElement._escapeHandler
    ) {
        deps.addEscapeHandler(modalElement);
    }
}

/**
 * Закрывает модальное окно с анимацией
 * @param {HTMLElement} modalElement - элемент модального окна
 */
export function closeAnimatedModal(modalElement) {
    if (!modalElement || modalElement.classList.contains('hidden')) return;

    clearAnimatedClosePending(modalElement);

    modalElement.classList.add('modal-transition');
    modalElement.classList.remove('modal-visible');
    modalElement.style.pointerEvents = 'none';

    if (deps.removeEscapeHandler && typeof deps.removeEscapeHandler === 'function') {
        deps.removeEscapeHandler(modalElement);
    }

    const handleTransitionEnd = (event) => {
        if (event.target === modalElement && event.propertyName === 'opacity') {
            const tid = modalElement._animatedModalCloseFallbackTimer;
            if (tid != null) {
                clearTimeout(tid);
                delete modalElement._animatedModalCloseFallbackTimer;
            }
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
            delete modalElement._animatedModalCloseOnTransitionEnd;

            modalElement.classList.add('hidden');
            modalElement.style.pointerEvents = '';
            document.body.classList.remove('modal-open');
            deactivateModalFocus(modalElement);
            console.log(`[closeAnimatedModal] Closed modal #${modalElement.id}`);

            // Вызываем callback для дополнительной логики очистки
            if (deps.onModalClose && typeof deps.onModalClose === 'function') {
                deps.onModalClose(modalElement);
            }

            // Специфическая логика для bookmarkModal
            if (modalElement.id === 'bookmarkModal') {
                const form = modalElement.querySelector('#bookmarkForm');
                if (form) {
                    form.reset();
                    const idInput = form.querySelector('#bookmarkId');
                    if (idInput) idInput.value = '';
                    const modalTitleEl = modalElement.querySelector('#bookmarkModalTitle');
                    if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                    const saveButton = modalElement.querySelector('#saveBookmarkBtn');
                    if (saveButton)
                        saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
                    delete form._tempScreenshotBlobs;
                    delete form.dataset.screenshotsToDelete;
                    const thumbsContainer = form.querySelector(
                        '#bookmarkScreenshotThumbnailsContainer',
                    );
                    if (thumbsContainer) thumbsContainer.innerHTML = '';
                    console.log(`[closeAnimatedModal] Cleaned up bookmarkModal form.`);
                }
            }
        }
    };

    modalElement._animatedModalCloseOnTransitionEnd = handleTransitionEnd;
    modalElement.addEventListener('transitionend', handleTransitionEnd);

    modalElement._animatedModalCloseFallbackTimer = setTimeout(() => {
        modalElement._animatedModalCloseFallbackTimer = null;
        if (!modalElement.classList.contains('hidden')) {
            console.warn(
                `[closeAnimatedModal] Transitionend fallback triggered for #${modalElement.id}`,
            );
            modalElement.classList.add('hidden');
            modalElement.style.pointerEvents = '';
            document.body.classList.remove('modal-open');
            deactivateModalFocus(modalElement);
            if (modalElement._animatedModalCloseOnTransitionEnd) {
                modalElement.removeEventListener(
                    'transitionend',
                    modalElement._animatedModalCloseOnTransitionEnd,
                );
                delete modalElement._animatedModalCloseOnTransitionEnd;
            }
        }
    }, 300);
}
