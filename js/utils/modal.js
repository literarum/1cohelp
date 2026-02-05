'use strict';

/**
 * Модуль для работы с модальными окнами
 * Содержит функции для анимированного открытия и закрытия модальных окон
 */

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
    if (dependencies.removeEscapeHandler) deps.removeEscapeHandler = dependencies.removeEscapeHandler;
    if (dependencies.onModalClose) deps.onModalClose = dependencies.onModalClose;
    console.log('[modal.js] Зависимости установлены');
}

/**
 * Открывает модальное окно с анимацией
 * @param {HTMLElement} modalElement - элемент модального окна
 */
export function openAnimatedModal(modalElement) {
    if (!modalElement) return;

    modalElement.classList.add('modal-transition');
    modalElement.classList.remove('modal-visible');
    modalElement.classList.remove('hidden');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modalElement.classList.add('modal-visible');
            document.body.classList.add('modal-open');
            console.log(`[openAnimatedModal] Opened modal #${modalElement.id}`);
        });
    });

    if (deps.addEscapeHandler && typeof deps.addEscapeHandler === 'function' && !modalElement._escapeHandler) {
        deps.addEscapeHandler(modalElement);
    }
}

/**
 * Закрывает модальное окно с анимацией
 * @param {HTMLElement} modalElement - элемент модального окна
 */
export function closeAnimatedModal(modalElement) {
    if (!modalElement || modalElement.classList.contains('hidden')) return;

    modalElement.classList.add('modal-transition');
    modalElement.classList.remove('modal-visible');

    if (deps.removeEscapeHandler && typeof deps.removeEscapeHandler === 'function') {
        deps.removeEscapeHandler(modalElement);
    }

    const handleTransitionEnd = (event) => {
        if (event.target === modalElement && event.propertyName === 'opacity') {
            modalElement.classList.add('hidden');
            document.body.classList.remove('modal-open');
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
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

    modalElement.addEventListener('transitionend', handleTransitionEnd);

    setTimeout(() => {
        if (!modalElement.classList.contains('hidden')) {
            console.warn(
                `[closeAnimatedModal] Transitionend fallback triggered for #${modalElement.id}`,
            );
            modalElement.classList.add('hidden');
            document.body.classList.remove('modal-open');
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
        }
    }, 300);
}
