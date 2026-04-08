'use strict';

let deps = {
    getVisibleModals: null,
    getTopmostModal: null,
    requestCloseModal: null,
    removeEscapeHandler: null,
};

let isHandlerAttached = false;

export function setModalOverlayHandlerDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initModalOverlayHandler() {
    if (isHandlerAttached) return;
    isHandlerAttached = true;

    document.addEventListener('click', (event) => {
        const visibleModals = deps.getVisibleModals?.() ?? [];
        if (!visibleModals.length) {
            return;
        }

        const topmostModal = deps.getTopmostModal?.(visibleModals);
        if (!topmostModal) {
            return;
        }

        if (event.target === topmostModal) {
            /* Закрытие по клику на оверлей отключено: только явные кнопки, крестик или Esc. */
            const innerContainer = topmostModal.querySelector(
                '.modal-inner-container, .engineering-cockpit-shell, .bg-white.dark\\:bg-gray-800',
            );
            if (innerContainer) {
                innerContainer.classList.add('shake-animation');
                setTimeout(() => innerContainer.classList.remove('shake-animation'), 500);
            }
        }
    });
}
