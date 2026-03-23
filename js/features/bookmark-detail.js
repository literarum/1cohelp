'use strict';

import { linkify } from '../utils/html.js';
import { getAllFromIndexWithKeyVariants } from '../db/indexeddb.js';

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
                    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                        <div class="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700/80 flex-shrink-0">
                            <div class="flex justify-between items-center gap-3 min-h-[2.25rem]">
                                <h2 class="text-lg font-semibold leading-tight tracking-tight text-gray-900 dark:text-gray-100 min-w-0 flex items-center self-center" id="bookmarkDetailTitle">Детали закладки</h2>
                                <div class="flex items-center flex-shrink-0 gap-0.5 h-9 self-center">
                                    <div class="fav-btn-placeholder-modal-bookmark mr-1 flex items-center justify-center h-9"></div>
                                    <button id="${deps.bookmarkDetailModalConfig?.buttonId || 'toggleFullscreenBookmarkDetailBtn'}" type="button" class="inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Развернуть на весь экран">
                                        <i class="fas fa-expand text-sm"></i>
                                    </button>
                                    <button type="button" class="close-modal inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Закрыть (Esc)">
                                        <i class="fas fa-times text-base"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="pt-5 px-5 sm:px-6 pb-4 overflow-y-auto flex-1" id="bookmarkDetailOuterContent">
                            <div class="prose dark:prose-invert max-w-none prose-p:leading-relaxed mb-8" id="bookmarkDetailTextContent">
                                <p>Загрузка...</p>
                            </div>
                            <section id="bookmarkDetailScreenshotsContainer" class="bookmark-detail-shots mt-8 pt-8 border-t border-gray-100 dark:border-gray-700/80 hidden" aria-labelledby="bookmarkDetailScreenshotsHeading">
                                <div class="flex items-baseline justify-between gap-3 mb-4">
                                    <h3 id="bookmarkDetailScreenshotsHeading" class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Изображения</h3>
                                    <span id="bookmarkDetailScreenshotsBadge" class="hidden text-xs font-medium tabular-nums text-gray-400 dark:text-gray-500" aria-hidden="true"></span>
                                </div>
                                <div id="bookmarkDetailScreenshotsGrid"></div>
                            </section>
                            <div id="bookmarkDetailPdfContainer" class="mt-0"></div>
                        </div>
                        <div class="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-700/80 flex-shrink-0 flex flex-wrap justify-end gap-2 bg-gray-50/80 dark:bg-gray-900/25">
                            <button type="button" id="editBookmarkFromDetailBtn" title="Редактировать эту закладку" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium shadow-sm hover:opacity-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                                <i class="fas fa-edit text-xs opacity-90"></i> Редактировать
                            </button>
                            <button type="button" id="exportBookmarkToPdfBtn" title="Сохранить детали закладки в PDF-файл" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-medium hover:bg-emerald-100/90 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">
                                <i class="far fa-file-pdf text-sm"></i> Экспорт в PDF
                            </button>
                            <button type="button" title="Закрыть окно (Esc)" class="cancel-modal inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition">
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
    const shotsBadgeInit = modal.querySelector('#bookmarkDetailScreenshotsBadge');
    if (shotsBadgeInit) {
        shotsBadgeInit.textContent = '';
        shotsBadgeInit.classList.add('hidden');
    }
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
                    '<p class="col-span-full text-center text-sm text-gray-400 dark:text-gray-500 py-6">Загрузка изображений…</p>';

                try {
                    const allParentScreenshots = await getAllFromIndexWithKeyVariants(
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
                            null,
                            { embeddedInDetail: true },
                        );
                        const badge = modal.querySelector('#bookmarkDetailScreenshotsBadge');
                        if (badge) {
                            const n = bookmarkScreenshots.length;
                            badge.textContent = n === 1 ? '1 файл' : `${n} файлов`;
                            badge.classList.remove('hidden');
                        }
                    } else {
                        screenshotsGridEl.innerHTML = '';
                        screenshotsContainer.classList.add('hidden');
                        const b = modal.querySelector('#bookmarkDetailScreenshotsBadge');
                        if (b) {
                            b.textContent = '';
                            b.classList.add('hidden');
                        }
                    }
                } catch (screenshotError) {
                    console.error(
                        'Ошибка загрузки скриншотов для деталей закладки:',
                        screenshotError,
                    );
                    screenshotsGridEl.innerHTML =
                        '<p class="col-span-full text-center text-sm text-red-600 dark:text-red-400 py-6">Не удалось загрузить изображения.</p>';
                    screenshotsContainer.classList.remove('hidden');
                }
            } else {
                screenshotsGridEl.innerHTML = '';
                screenshotsContainer.classList.add('hidden');
                const b0 = modal.querySelector('#bookmarkDetailScreenshotsBadge');
                if (b0) {
                    b0.textContent = '';
                    b0.classList.add('hidden');
                }
            }
        } else {
            titleEl.textContent = 'Ошибка';
            textContentEl.innerHTML = `<p class="text-red-500">Не удалось загрузить данные закладки (ID: ${bookmarkId}). Возможно, она была удалена.</p>`;
            deps.showNotification?.('Закладка не найдена', 'error');
            editButton.classList.add('hidden');
            exportButton.classList.add('hidden');
            screenshotsContainer.classList.add('hidden');
            const b1 = modal.querySelector('#bookmarkDetailScreenshotsBadge');
            if (b1) {
                b1.textContent = '';
                b1.classList.add('hidden');
            }
            if (pdfHost) deps.removePdfSectionsFromContainer?.(pdfHost);
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
        const b2 = modal.querySelector('#bookmarkDetailScreenshotsBadge');
        if (b2) {
            b2.textContent = '';
            b2.classList.add('hidden');
        }
        if (pdfHost) deps.removePdfSectionsFromContainer?.(pdfHost);
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
