'use strict';

import { linkify } from '../utils/html.js';

let deps = {
    getVisibleModals: null,
    getFromIndexedDB: null,
    showNotification: null,
    getAllFromIndex: null,
    renderScreenshotThumbnails: null,
    openLightbox: null,
    isFavorite: null,
    getFavoriteButtonHTML: null,
    showEditBookmarkModal: null,
    toggleModalFullscreen: null,
    bookmarkDetailModalConfig: null,
    wireBookmarkDetailModalCloseHandler: null,
    renderPdfAttachmentsSection: null,
    removePdfSectionsFromContainer: null,
    exportSingleBookmarkToPdf: null,
};

export function setBookmarkDetailDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export async function showBookmarkDetailModal(bookmarkId) {
    const modalId = 'bookmarkDetailModal';
    let modal = document.getElementById(modalId);
    const isNewModal = !modal;

    if (isNewModal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 hidden z-[60] p-4 flex items-center justify-center';
        modal.innerHTML = `
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
                        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                            <div class="flex justify-between items-center">
                                <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100" id="bookmarkDetailTitle">Детали закладки</h2>
                                <div class="flex items-center flex-shrink-0">
                                    <div class="fav-btn-placeholder-modal-bookmark mr-1"></div>
                                    <button id="${deps.bookmarkDetailModalConfig?.buttonId || 'toggleFullscreenBookmarkDetailBtn'}" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                                        <i class="fas fa-expand"></i>
                                    </button>
                                    <button type="button" class="close-modal ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Закрыть (Esc)">
                                        <i class="fas fa-times text-xl"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="pt-6 pl-6 pr-6 pb-2 overflow-y-auto flex-1" id="bookmarkDetailOuterContent">
                            <div class="prose dark:prose-invert max-w-none mb-6" id="bookmarkDetailTextContent">
                                <p>Загрузка...</p>
                            </div>
                            <div id="bookmarkDetailScreenshotsContainer" class="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                                <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">Скриншоты:</h4>
                                <div id="bookmarkDetailScreenshotsGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                </div>
                                <div id="bookmarkDetailPdfContainer" class="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4"></div>
                            </div>
                        </div>
                        <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                            <button type="button" id="editBookmarkFromDetailBtn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">
                                <i class="fas fa-edit mr-1"></i> Редактировать
                            </button>
                            <button type="button" id="exportBookmarkToPdfBtn" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition">
                                <i class="far fa-file-pdf mr-1"></i> Экспорт в PDF
                            </button>
                            <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition">
                                Закрыть
                            </button>
                        </div>
                    </div>
                `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            const currentModal = document.getElementById(modalId);
            if (!currentModal || currentModal.classList.contains('hidden')) return;

            if (e.target.closest('.close-modal, .cancel-modal')) {
                if (currentModal.dataset.fileDialogOpen === '1') {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                currentModal.classList.add('hidden');

                const images = currentModal.querySelectorAll(
                    '#bookmarkDetailScreenshotsGrid img[data-object-url]',
                );
                images.forEach((img) => {
                    if (img.dataset.objectUrl) {
                        try {
                            URL.revokeObjectURL(img.dataset.objectUrl);
                        } catch (revokeError) {
                            console.warn('Error revoking URL on close:', revokeError);
                        }
                        delete img.dataset.objectUrl;
                    }
                });

                requestAnimationFrame(() => {
                    const otherVisibleModals =
                        deps.getVisibleModals?.().filter((m) => m.id !== modalId) || [];
                    if (otherVisibleModals.length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                    }
                });
            } else if (e.target.closest('#editBookmarkFromDetailBtn')) {
                const currentId = parseInt(currentModal.dataset.currentBookmarkId, 10);
                if (!isNaN(currentId)) {
                    currentModal.classList.add('hidden');

                    requestAnimationFrame(() => {
                        const otherVisibleModals =
                            deps.getVisibleModals?.().filter((m) => m.id !== modalId) || [];
                        if (otherVisibleModals.length === 0) {
                            document.body.classList.remove('overflow-hidden');
                            document.body.classList.remove('modal-open');
                        }
                    });

                    if (typeof deps.showEditBookmarkModal === 'function') {
                        deps.showEditBookmarkModal(currentId);
                    } else {
                        console.error('Функция showEditBookmarkModal не определена!');
                        deps.showNotification?.(
                            'Ошибка: функция редактирования недоступна.',
                            'error',
                        );
                    }
                } else {
                    console.error('Не удалось получить ID закладки для редактирования из dataset');
                    deps.showNotification?.(
                        'Ошибка: не удалось определить ID для редактирования',
                        'error',
                    );
                }
            }
        });
    }

    const config = deps.bookmarkDetailModalConfig || {
        buttonId: 'toggleFullscreenBookmarkDetailBtn',
        modalId: 'bookmarkDetailModal',
        classToggleConfig: {},
        innerContainerSelector: '',
        contentAreaSelector: '',
    };
    const fullscreenBtn = modal.querySelector('#' + config.buttonId);
    if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
        fullscreenBtn.addEventListener('click', () => {
            if (typeof deps.toggleModalFullscreen === 'function') {
                deps.toggleModalFullscreen(
                    config.modalId,
                    config.buttonId,
                    config.classToggleConfig,
                    config.innerContainerSelector,
                    config.contentAreaSelector,
                );
            } else {
                deps.showNotification?.(
                    'Ошибка: Функция переключения полноэкранного режима недоступна.',
                    'error',
                );
            }
        });
        fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
    }

    const titleEl = modal.querySelector('#bookmarkDetailTitle');
    const textContentEl = modal.querySelector('#bookmarkDetailTextContent');
    const screenshotsContainer = modal.querySelector('#bookmarkDetailScreenshotsContainer');
    const screenshotsGridEl = modal.querySelector('#bookmarkDetailScreenshotsGrid');
    const editButton = modal.querySelector('#editBookmarkFromDetailBtn');
    const exportButton = modal.querySelector('#exportBookmarkToPdfBtn');
    const favoriteButtonContainer = modal.querySelector('.fav-btn-placeholder-modal-bookmark');

    if (
        !titleEl ||
        !textContentEl ||
        !screenshotsContainer ||
        !screenshotsGridEl ||
        !editButton ||
        !exportButton ||
        !favoriteButtonContainer
    ) {
        console.error('Не найдены необходимые элементы в модальном окне деталей закладки.');
        if (modal) modal.classList.add('hidden');
        return;
    }

    deps.wireBookmarkDetailModalCloseHandler?.('bookmarkDetailModal');
    modal.dataset.currentBookmarkId = String(bookmarkId);

    const pdfHost = modal.querySelector('#bookmarkDetailPdfContainer');
    if (pdfHost && typeof deps.renderPdfAttachmentsSection === 'function') {
        if (typeof deps.removePdfSectionsFromContainer === 'function') {
            deps.removePdfSectionsFromContainer(pdfHost);
        }
        deps.renderPdfAttachmentsSection(pdfHost, 'bookmark', String(bookmarkId));
    }
    titleEl.textContent = 'Загрузка...';
    textContentEl.innerHTML = '<p>Загрузка...</p>';
    screenshotsGridEl.innerHTML = '';
    screenshotsContainer.classList.add('hidden');
    editButton.classList.add('hidden');
    exportButton.classList.add('hidden');
    favoriteButtonContainer.innerHTML = '';

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.body.classList.add('modal-open');

    try {
        const bookmark = await deps.getFromIndexedDB?.('bookmarks', bookmarkId);

        if (bookmark) {
            titleEl.textContent = bookmark.title || 'Без названия';
            const descWrap = document.createElement('div');
            descWrap.className = 'whitespace-pre-wrap break-words text-sm font-sans';
            descWrap.style.fontSize = '102%';
            descWrap.innerHTML = linkify(bookmark.description || 'Нет описания.');
            textContentEl.innerHTML = '';
            textContentEl.appendChild(descWrap);

            editButton.classList.remove('hidden');
            exportButton.classList.remove('hidden');

            const itemType = bookmark.url ? 'bookmark' : 'bookmark_note';
            const isFav = deps.isFavorite?.(itemType, String(bookmark.id));
            const favButtonHTML = deps.getFavoriteButtonHTML?.(
                bookmark.id,
                itemType,
                'bookmarks',
                bookmark.title,
                bookmark.description,
                isFav,
            );
            favoriteButtonContainer.innerHTML = favButtonHTML ?? '';

            if (bookmark.screenshotIds && bookmark.screenshotIds.length > 0) {
                screenshotsContainer.classList.remove('hidden');
                screenshotsGridEl.innerHTML =
                    '<p class="col-span-full text-xs text-gray-500">Загрузка скриншотов...</p>';

                try {
                    const allParentScreenshots = await deps.getAllFromIndex?.(
                        'screenshots',
                        'parentId',
                        bookmarkId,
                    );
                    const bookmarkScreenshots = (allParentScreenshots || []).filter(
                        (s) => s.parentType === 'bookmark',
                    );

                    if (
                        bookmarkScreenshots.length > 0 &&
                        typeof deps.renderScreenshotThumbnails === 'function'
                    ) {
                        deps.renderScreenshotThumbnails(
                            screenshotsGridEl,
                            bookmarkScreenshots,
                            deps.openLightbox,
                        );
                    } else {
                        screenshotsGridEl.innerHTML = '';
                        screenshotsContainer.classList.add('hidden');
                    }
                } catch (screenshotError) {
                    console.error(
                        'Ошибка загрузки скриншотов для деталей закладки:',
                        screenshotError,
                    );
                    screenshotsGridEl.innerHTML =
                        '<p class="col-span-full text-red-500 text-xs">Ошибка загрузки скриншотов.</p>';
                    screenshotsContainer.classList.remove('hidden');
                }
            } else {
                screenshotsGridEl.innerHTML = '';
                screenshotsContainer.classList.add('hidden');
            }
        } else {
            titleEl.textContent = 'Ошибка';
            textContentEl.innerHTML = `<p class="text-red-500">Не удалось загрузить данные закладки (ID: ${bookmarkId}). Возможно, она была удалена.</p>`;
            deps.showNotification?.('Закладка не найдена', 'error');
            editButton.classList.add('hidden');
            exportButton.classList.add('hidden');
            screenshotsContainer.classList.add('hidden');
        }
    } catch (error) {
        console.error('Ошибка при загрузке деталей закладки:', error);
        titleEl.textContent = 'Ошибка загрузки';
        textContentEl.innerHTML =
            '<p class="text-red-500">Произошла ошибка при загрузке данных.</p>';
        deps.showNotification?.('Ошибка загрузки деталей закладки', 'error');
        editButton.classList.add('hidden');
        exportButton.classList.add('hidden');
        screenshotsContainer.classList.add('hidden');
    }

    if (exportButton && !exportButton.dataset.wired) {
        exportButton.dataset.wired = '1';
        exportButton.addEventListener('click', async () => {
            const currentId = parseInt(modal.dataset.currentBookmarkId, 10);
            if (Number.isNaN(currentId)) {
                deps.showNotification?.('Не удалось определить ID закладки для экспорта.', 'error');
                return;
            }
            if (typeof deps.exportSingleBookmarkToPdf === 'function') {
                await deps.exportSingleBookmarkToPdf(currentId);
            } else {
                deps.showNotification?.(
                    'Ошибка: экспорт закладки в PDF недоступен (функция не настроена).',
                    'error',
                );
            }
        });
    }
}
