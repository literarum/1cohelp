'use strict';

import { linkify, createBookmarkDetailUrlSectionElement } from '../utils/html.js';
import { getAllFromIndexWithKeyVariants } from '../db/indexeddb.js';
import {
    mountAttachmentAbsentParagraph,
    removePdfSectionsFromContainer,
    renderPdfAttachmentsSection,
} from './pdf-attachments.js';

/** Solid borders (no /opacity) — dark: variants with alpha often fail in generated CSS; inline fallback below. */
const BOOKMARK_MODAL_DIVIDER_CLASSES = 'border-gray-200 dark:border-gray-600';

function parseRgbFromCssColor(color) {
    const m = String(color || '').match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(',').map((s) => Number.parseFloat(s.trim()));
    if (p.length < 3 || p.some((v, i) => i < 3 && Number.isNaN(v))) return null;
    return [p[0], p[1], p[2]];
}

function isBookmarkModalDarkContext(contextEl) {
    const hasDarkClass =
        document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark') ||
        Boolean(contextEl?.closest?.('.dark'));
    if (hasDarkClass) return true;
    const probe = contextEl?.closest?.('#bookmarkDetailModal > div') || contextEl;
    if (!probe) return false;
    const rgb = parseRgbFromCssColor(window.getComputedStyle(probe).backgroundColor);
    if (!rgb) return false;
    const [r, g, b] = rgb;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < 140;
}

function ensureBookmarkDetailAttachmentSections(modal, dividerClasses) {
    const outer = modal?.querySelector('#bookmarkDetailOuterContent');
    if (!outer || outer.querySelector('#bookmarkDetailPdfContainer')) return;
    outer.insertAdjacentHTML(
        'beforeend',
        `
                            <section id="bookmarkDetailImagesSection" class="bookmark-detail-shots mt-8 pt-8 border-t ${dividerClasses} hidden" aria-labelledby="bookmarkDetailScreenshotsHeading">
                                <h3 id="bookmarkDetailScreenshotsHeading" class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Изображения</h3>
                                <div id="bookmarkDetailScreenshotsGrid" class="min-h-[1rem]"></div>
                            </section>
                            <section id="bookmarkDetailPdfSection" class="bookmark-detail-pdf mt-8 pt-8 border-t ${dividerClasses} hidden" aria-labelledby="bookmarkDetailPdfHeading">
                                <h3 id="bookmarkDetailPdfHeading" class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">PDF-документы</h3>
                                <div id="bookmarkDetailPdfContainer"></div>
                            </section>
                        `,
    );
}

/**
 * Ensures header/footer dividers are not light gray on dark backgrounds
 * when Tailwind dark: utilities are missing or overridden.
 */
function syncBookmarkModalChromeBorders(modal) {
    if (!modal) return;
    const innerCard = modal.querySelector(':scope > div');
    const header = modal.querySelector('.bookmark-detail-modal-header');
    const footer = modal.querySelector('.bookmark-detail-modal-footer');
    const imagesSec = modal.querySelector('#bookmarkDetailImagesSection');
    const pdfSec = modal.querySelector('#bookmarkDetailPdfSection');
    const isDark = isBookmarkModalDarkContext(innerCard || modal);
    const border = isDark ? 'rgba(75, 85, 99, 0.95)' : 'rgb(229, 231, 235)';
    if (header) header.style.borderBottomColor = border;
    if (footer) footer.style.borderTopColor = border;
    if (imagesSec) imagesSec.style.borderTopColor = border;
    if (pdfSec) pdfSec.style.borderTopColor = border;
}

let deps = {
    getVisibleModals: null,
    getFromIndexedDB: null,
    showNotification: null,
    isFavorite: null,
    getFavoriteButtonHTML: null,
    showEditBookmarkModal: null,
    toggleModalFullscreen: null,
    bookmarkDetailModalConfig: null,
    wireBookmarkDetailModalCloseHandler: null,
    exportSingleBookmarkToPdf: null,
    renderScreenshotThumbnails: null,
    openLightbox: null,
    openReminderModal: null,
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
                        <div class="bookmark-detail-modal-header p-4 sm:p-5 border-b ${BOOKMARK_MODAL_DIVIDER_CLASSES} flex-shrink-0">
                            <div class="flex justify-between items-center gap-3 min-h-[2.25rem]">
                                <h2 class="text-lg font-semibold leading-tight tracking-tight text-gray-900 dark:text-gray-100 min-w-0 flex items-center self-center" id="bookmarkDetailTitle">Детали закладки</h2>
                                <div class="bookmark-detail-header-actions flex items-center flex-shrink-0 gap-1 h-9 self-center" role="toolbar" aria-label="Действия в шапке">
                                    <div class="fav-btn-placeholder-modal-bookmark flex h-9 w-9 flex-shrink-0 items-center justify-center"></div>
                                    <button type="button" id="bookmarkDetailReminderBtn" title="Напоминание по этой закладке (локально)" aria-label="Напоминание по этой закладке (локально)" class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-gray-500 hover:text-amber-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-amber-400 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors">
                                        <i class="fas fa-bell text-sm" aria-hidden="true"></i>
                                    </button>
                                    <button id="${deps.bookmarkDetailModalConfig?.buttonId || 'toggleFullscreenBookmarkDetailBtn'}" type="button" class="inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Развернуть на весь экран">
                                        <i class="fas fa-expand text-sm" aria-hidden="true"></i>
                                    </button>
                                    <button type="button" class="close-modal inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Закрыть (Esc)">
                                        <i class="fas fa-times text-base" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="pt-5 px-5 sm:px-6 pb-4 overflow-y-auto flex-1" id="bookmarkDetailOuterContent">
                            <div class="prose dark:prose-invert max-w-none prose-p:leading-relaxed pt-2 mb-8" id="bookmarkDetailTextContent">
                                <p>Загрузка...</p>
                            </div>
                            <section id="bookmarkDetailImagesSection" class="bookmark-detail-shots mt-8 pt-8 border-t ${BOOKMARK_MODAL_DIVIDER_CLASSES} hidden" aria-labelledby="bookmarkDetailScreenshotsHeading">
                                <h3 id="bookmarkDetailScreenshotsHeading" class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Изображения</h3>
                                <div id="bookmarkDetailScreenshotsGrid" class="min-h-[1rem]"></div>
                            </section>
                            <section id="bookmarkDetailPdfSection" class="bookmark-detail-pdf mt-8 pt-8 border-t ${BOOKMARK_MODAL_DIVIDER_CLASSES} hidden" aria-labelledby="bookmarkDetailPdfHeading">
                                <h3 id="bookmarkDetailPdfHeading" class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">PDF-документы</h3>
                                <div id="bookmarkDetailPdfContainer"></div>
                            </section>
                        </div>
                        <div class="bookmark-detail-modal-footer p-4 sm:p-5 border-t ${BOOKMARK_MODAL_DIVIDER_CLASSES} flex-shrink-0 flex flex-wrap justify-end gap-2 bg-gray-50/80 dark:bg-gray-900/25">
                            <button type="button" id="editBookmarkFromDetailBtn" title="Редактировать эту закладку" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium shadow-sm hover:opacity-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                                <i class="fas fa-edit text-xs opacity-90"></i> Редактировать
                            </button>
                            <button type="button" id="exportBookmarkToPdfBtn" title="Сохранить детали закладки в PDF-файл" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-emerald-50 text-emerald-800 text-sm font-medium hover:bg-emerald-100/90 dark:border-gray-600 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">
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

                const imgs = currentModal.querySelectorAll(
                    '#bookmarkDetailScreenshotsGrid img[data-object-url]',
                );
                imgs.forEach((img) => {
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
            } else if (e.target.closest('#bookmarkDetailReminderBtn')) {
                const currentId = parseInt(currentModal.dataset.currentBookmarkId, 10);
                const titleEl = currentModal.querySelector('#bookmarkDetailTitle');
                const t = (titleEl?.textContent || '').trim() || 'Закладка';
                if (!Number.isNaN(currentId) && typeof deps.openReminderModal === 'function') {
                    deps.openReminderModal({
                        contextType: 'bookmark',
                        contextId: String(currentId),
                        contextLabel: t,
                        title: `Вернуться к закладке: ${t}`,
                        intent: 'return_to',
                        daysFromNow: 7,
                    });
                } else if (Number.isNaN(currentId)) {
                    deps.showNotification?.(
                        'Не удалось определить закладку для напоминания.',
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
    const editButton = modal.querySelector('#editBookmarkFromDetailBtn');
    const exportButton = modal.querySelector('#exportBookmarkToPdfBtn');
    const favoriteButtonContainer = modal.querySelector('.fav-btn-placeholder-modal-bookmark');

    if (!titleEl || !textContentEl || !editButton || !exportButton || !favoriteButtonContainer) {
        console.error('Не найдены необходимые элементы в модальном окне деталей закладки.');
        if (modal) modal.classList.add('hidden');
        return;
    }

    ensureBookmarkDetailAttachmentSections(modal, BOOKMARK_MODAL_DIVIDER_CLASSES);

    const imagesSection = modal.querySelector('#bookmarkDetailImagesSection');
    const pdfSectionEl = modal.querySelector('#bookmarkDetailPdfSection');
    const screenshotsGridEl = modal.querySelector('#bookmarkDetailScreenshotsGrid');
    const pdfHost = modal.querySelector('#bookmarkDetailPdfContainer');

    deps.wireBookmarkDetailModalCloseHandler?.('bookmarkDetailModal');
    modal.dataset.currentBookmarkId = String(bookmarkId);

    const goToBookmarkEditFromDetail = () => {
        const currentId = parseInt(modal.dataset.currentBookmarkId, 10);
        if (Number.isNaN(currentId)) {
            deps.showNotification?.('Не удалось определить закладку для редактирования.', 'error');
            return;
        }
        modal.classList.add('hidden');
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
            deps.showNotification?.('Редактирование закладки недоступно.', 'error');
        }
    };

    titleEl.textContent = 'Загрузка...';
    textContentEl.innerHTML = '<p>Загрузка...</p>';
    editButton.classList.add('hidden');
    exportButton.classList.add('hidden');
    favoriteButtonContainer.innerHTML = '';
    if (imagesSection) imagesSection.classList.add('hidden');
    if (pdfSectionEl) pdfSectionEl.classList.add('hidden');
    if (pdfHost) removePdfSectionsFromContainer(pdfHost);
    if (screenshotsGridEl) screenshotsGridEl.innerHTML = '';

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.body.classList.add('modal-open');
    syncBookmarkModalChromeBorders(modal);
    requestAnimationFrame(() => syncBookmarkModalChromeBorders(modal));

    try {
        const bookmark = await deps.getFromIndexedDB?.('bookmarks', bookmarkId);

        if (bookmark) {
            titleEl.textContent = bookmark.title || 'Без названия';
            textContentEl.innerHTML = '';
            const urlSection = createBookmarkDetailUrlSectionElement(bookmark.url);
            if (urlSection) {
                textContentEl.appendChild(urlSection);
            }
            const descWrap = document.createElement('div');
            descWrap.className = 'whitespace-pre-wrap break-words text-sm font-sans mt-0';
            descWrap.style.fontSize = '102%';
            descWrap.innerHTML = linkify(bookmark.description || 'Нет описания.');
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
                'modal-header',
                bookmark.url || '',
            );
            favoriteButtonContainer.innerHTML = favButtonHTML ?? '';

            if (imagesSection) imagesSection.classList.remove('hidden');
            if (pdfSectionEl) pdfSectionEl.classList.remove('hidden');

            if (screenshotsGridEl) {
                const showImagesEmpty = () => {
                    mountAttachmentAbsentParagraph(
                        screenshotsGridEl,
                        'Изображения',
                        goToBookmarkEditFromDetail,
                    );
                };

                if (bookmark.screenshotIds && bookmark.screenshotIds.length > 0) {
                    screenshotsGridEl.innerHTML =
                        '<p class="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Загрузка изображений…</p>';
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
                            screenshotsGridEl.innerHTML = '';
                            deps.renderScreenshotThumbnails(
                                screenshotsGridEl,
                                bookmarkScreenshots,
                                deps.openLightbox,
                                null,
                                { embeddedInDetail: true },
                            );
                        } else {
                            showImagesEmpty();
                        }
                    } catch (screenshotError) {
                        console.error(
                            'Ошибка загрузки скриншотов для деталей закладки:',
                            screenshotError,
                        );
                        screenshotsGridEl.innerHTML =
                            '<p class="text-center text-sm text-red-600 dark:text-red-400 py-4">Не удалось загрузить изображения.</p>';
                    }
                } else {
                    showImagesEmpty();
                }
            }

            if (pdfHost) {
                removePdfSectionsFromContainer(pdfHost);
                renderPdfAttachmentsSection(pdfHost, 'bookmark', String(bookmark.id), {
                    readOnly: true,
                    readOnlyEmptyLink: {
                        leadLabel: 'PDF-файлы',
                        onActivate: goToBookmarkEditFromDetail,
                    },
                });
            }
        } else {
            titleEl.textContent = 'Ошибка';
            textContentEl.innerHTML = `<p class="text-red-500">Не удалось загрузить данные закладки (ID: ${bookmarkId}). Возможно, она была удалена.</p>`;
            deps.showNotification?.('Закладка не найдена', 'error');
            editButton.classList.add('hidden');
            exportButton.classList.add('hidden');
            if (imagesSection) imagesSection.classList.add('hidden');
            if (pdfSectionEl) pdfSectionEl.classList.add('hidden');
            if (pdfHost) removePdfSectionsFromContainer(pdfHost);
        }
    } catch (error) {
        console.error('Ошибка при загрузке деталей закладки:', error);
        titleEl.textContent = 'Ошибка загрузки';
        textContentEl.innerHTML =
            '<p class="text-red-500">Произошла ошибка при загрузке данных.</p>';
        deps.showNotification?.('Ошибка загрузки деталей закладки', 'error');
        editButton.classList.add('hidden');
        exportButton.classList.add('hidden');
        if (imagesSection) imagesSection.classList.add('hidden');
        if (pdfSectionEl) pdfSectionEl.classList.add('hidden');
        if (pdfHost) removePdfSectionsFromContainer(pdfHost);
    }

    requestAnimationFrame(() => syncBookmarkModalChromeBorders(modal));

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
