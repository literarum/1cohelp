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
            const nonClosableModals = [
                'bookmarkModal',
                'extLinkModal',
                'foldersModal',
                'bookmarkDetailModal',
                'reglamentModal',
                'blacklistEntryModal',
                'blacklistDetailModal',
            ];

            if (nonClosableModals.includes(topmostModal.id)) {
                const innerContainer = topmostModal.querySelector(
                    '.modal-inner-container, .bg-white.dark\\:bg-gray-800',
                );
                if (innerContainer) {
                    innerContainer.classList.add('shake-animation');
                    setTimeout(() => innerContainer.classList.remove('shake-animation'), 500);
                }
                return;
            }

            if (
                topmostModal.id === 'editModal' ||
                topmostModal.id === 'addModal' ||
                topmostModal.id === 'customizeUIModal'
            ) {
                if (typeof deps.requestCloseModal === 'function') {
                    if (deps.requestCloseModal(topmostModal) !== false) {
                        topmostModal.classList.add('hidden');
                        deps.removeEscapeHandler?.(topmostModal);
                    }
                } else {
                    topmostModal.classList.add('hidden');
                    deps.removeEscapeHandler?.(topmostModal);
                }
            } else if (
                topmostModal.id === 'reglamentDetailModal' ||
                topmostModal.id === 'screenshotViewerModal' ||
                topmostModal.id === 'noInnModal' ||
                topmostModal.id === 'hotkeysModal' ||
                topmostModal.id === 'engineeringCockpitModal' ||
                topmostModal.id === 'confirmClearDataModal' ||
                topmostModal.id === 'cibLinkModal'
            ) {
                topmostModal.classList.add('hidden');
                deps.removeEscapeHandler?.(topmostModal);
                if (topmostModal.id === 'screenshotViewerModal') {
                    const state = topmostModal._modalState || {};
                    const images = state.contentArea?.querySelectorAll('img[data-object-url]');
                    images?.forEach((img) => {
                        if (img.dataset.objectUrl) {
                            try {
                                URL.revokeObjectURL(img.dataset.objectUrl);
                            } catch (revokeError) {
                                console.warn('Error revoking URL on overlay close:', revokeError);
                            }
                            delete img.dataset.objectUrl;
                        }
                    });
                }
            } else {
                topmostModal.classList.add('hidden');
                deps.removeEscapeHandler?.(topmostModal);
            }

            if ((deps.getVisibleModals?.() ?? []).length === 0) {
                document.body.classList.remove('modal-open');
                if (
                    !document.querySelector('div.fixed.inset-0.bg-black.bg-opacity-50:not(.hidden)')
                ) {
                    document.body.classList.remove('overflow-hidden');
                }
            }
        }
    });
}
