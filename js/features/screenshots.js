'use strict';

/**
 * Модуль системы скриншотов
 * Содержит функции для просмотра, рендеринга и управления скриншотами
 */

import { State } from '../app/state.js';
import { getAllFromIndex, getFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setScreenshotsDependencies)
// ============================================================================

let deps = {
    showNotification: null,
    openLightbox: null,
    getVisibleModals: null,
    removeEscapeHandler: null,
    algorithms: null, // Глобальный объект algorithms
};

/**
 * Устанавливает зависимости для модуля Screenshots
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setScreenshotsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[Screenshots] Зависимости установлены');
}

// ============================================================================
// ПРОСМОТР СКРИНШОТОВ - МОДАЛЬНОЕ ОКНО
// ============================================================================

export async function showScreenshotViewerModal(screenshots, algorithmId, algorithmTitle) {
    const modalId = 'screenshotViewerModal';
    let modal = document.getElementById(modalId);
    let isNewModal = false;
    let modalState = {};

    const cleanupModalState = (state) => {
        console.log(`[Cleanup for ${modalId}] Cleaning up state and listeners.`);

        if (state.gridBtnClickHandler) {
            state.gridBtn?.removeEventListener('click', state.gridBtnClickHandler);
        }
        if (state.listBtnClickHandler) {
            state.listBtn?.removeEventListener('click', state.listBtnClickHandler);
        }
        if (state.closeButtonXClickHandler) {
            state.closeButtonX?.removeEventListener('click', state.closeButtonXClickHandler);
        }
        if (state.closeButtonCancelClickHandler) {
            state.closeButtonCancel?.removeEventListener(
                'click',
                state.closeButtonCancelClickHandler,
            );
        }
        if (state.overlayClickHandler) {
            state.overlayElement?.removeEventListener('click', state.overlayClickHandler);
        }

        const images = state.contentArea?.querySelectorAll('img[data-object-url]');
        images?.forEach((img) => {
            if (img.dataset.objectUrl) {
                try {
                    URL.revokeObjectURL(img.dataset.objectUrl);
                } catch (revokeError) {
                    console.warn(`Error revoking URL ${img.dataset.objectUrl}:`, revokeError);
                }
                delete img.dataset.objectUrl;
            }
        });
        Object.keys(state).forEach((key) => delete state[key]);
    };

    const closeModalFunction = () => {
        const currentModal = document.getElementById(modalId);
        if (currentModal && !currentModal.classList.contains('hidden')) {
            currentModal.classList.add('hidden');

            if (deps.getVisibleModals?.().length === 0) {
                document.body.classList.remove('overflow-hidden');
            }

            const state = currentModal._modalState || {};
            cleanupModalState(state);
            delete currentModal._modalState;

            const contentAreaForClearOnClose = currentModal.querySelector('#screenshotContentArea');
            if (contentAreaForClearOnClose) {
                contentAreaForClearOnClose.innerHTML = '';
            }
            deps.removeEscapeHandler?.(currentModal);
        }
    };

    if (modal && modal._modalState) {
        cleanupModalState(modal._modalState);
        const contentAreaForClear = modal.querySelector('#screenshotContentArea');
        if (contentAreaForClear) contentAreaForClear.innerHTML = '';
    }

    if (!modal) {
        isNewModal = true;
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className =
            'fixed inset-0 bg-black bg-opacity-75 hidden z-[80] p-4 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-center">
                        <h2 id="screenshotViewerTitle" class="text-xl font-bold text-gray-900 dark:text-gray-100 truncate pr-4">Скриншоты</h2>
                        <div class="flex items-center flex-shrink-0">
                             <div class="mr-4 hidden sm:inline-flex rounded-md shadow-sm" role="group">
                                 <button type="button" id="screenshotViewToggleGrid" class="px-3 py-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-l-lg hover:bg-gray-100 hover:text-primary focus:z-10 focus:ring-2 focus:ring-primary focus:text-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-primary dark:focus:text-white" title="Вид сеткой">
                                     <i class="fas fa-th-large"></i>
                                 </button>
                                 <button type="button" id="screenshotViewToggleList" class="px-3 py-1.5 text-sm font-medium text-gray-900 bg-white border-t border-b border-r border-gray-200 rounded-r-lg hover:bg-gray-100 hover:text-primary focus:z-10 focus:ring-2 focus:ring-primary focus:text-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-primary dark:focus:text-white" title="Вид списком">
                                     <i class="fas fa-list"></i>
                                 </button>
                             </div>
                            <button type="button" id="screenshotViewerCloseXBtn" class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Закрыть (Esc)">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div id="screenshotContentArea" class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-700">
                    <p class="text-center text-gray-500 dark:text-gray-400 p-6">Загрузка скриншотов...</p>
                </div>
                <div class="flex-shrink-0 px-6 py-4 bg-gray-100 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end">
                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition text-sm font-medium">
                        Закрыть
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    modalState = {};
    modal._modalState = modalState;
    modalState.closeModalFunction = closeModalFunction;

    modalState.titleEl = modal.querySelector('#screenshotViewerTitle');
    modalState.contentArea = modal.querySelector('#screenshotContentArea');
    modalState.gridBtn = modal.querySelector('#screenshotViewToggleGrid');
    modalState.listBtn = modal.querySelector('#screenshotViewToggleList');
    modalState.closeButtonX = modal.querySelector('#screenshotViewerCloseXBtn');
    modalState.closeButtonCancel = modal.querySelector('.cancel-modal');
    modalState.overlayElement = modal;

    if (
        !modalState.titleEl ||
        !modalState.contentArea ||
        !modalState.gridBtn ||
        !modalState.listBtn ||
        !modalState.closeButtonX ||
        !modalState.closeButtonCancel
    ) {
        return;
    }

    if (!isNewModal) {
        modalState.closeButtonX?.removeEventListener('click', modalState.closeButtonXClickHandler);
        modalState.closeButtonCancel?.removeEventListener(
            'click',
            modalState.closeButtonCancelClickHandler,
        );
        modalState.overlayElement?.removeEventListener('click', modalState.overlayClickHandler);
    }
    modalState.closeButtonXClickHandler = closeModalFunction;
    modalState.closeButtonCancelClickHandler = closeModalFunction;
    modalState.overlayClickHandler = (e) => {
        if (e.target === modalState.overlayElement) {
            closeModalFunction();
        }
    };

    modalState.closeButtonX.addEventListener('click', modalState.closeButtonXClickHandler);
    modalState.closeButtonCancel.addEventListener(
        'click',
        modalState.closeButtonCancelClickHandler,
    );
    modalState.overlayElement.addEventListener('click', modalState.overlayClickHandler);

    const defaultTitle = `Скриншоты для ${algorithmId}`;
    modalState.titleEl.textContent = `${algorithmTitle || defaultTitle}`;
    modalState.titleEl.title = modalState.titleEl.textContent;
    modalState.contentArea.innerHTML =
        '<p class="text-center text-gray-500 dark:text-gray-400 p-6">Загрузка...</p>';
    document.body.classList.add('overflow-hidden');
    modal.classList.remove('hidden');

    let currentView = 'grid';

    const updateViewButtons = () => {
        if (!modalState.gridBtn || !modalState.listBtn) return;
        const isGrid = currentView === 'grid';
        modalState.gridBtn.classList.toggle('bg-primary', isGrid);
        modalState.gridBtn.classList.toggle('text-white', isGrid);
        modalState.gridBtn.classList.toggle('bg-white', !isGrid);
        modalState.gridBtn.classList.toggle('dark:bg-gray-700', !isGrid);
        modalState.gridBtn.classList.toggle('text-gray-900', !isGrid);
        modalState.gridBtn.classList.toggle('dark:text-white', !isGrid);

        modalState.listBtn.classList.toggle('bg-primary', !isGrid);
        modalState.listBtn.classList.toggle('text-white', !isGrid);
        modalState.listBtn.classList.toggle('bg-white', isGrid);
        modalState.listBtn.classList.toggle('dark:bg-gray-700', isGrid);
        modalState.listBtn.classList.toggle('text-gray-900', isGrid);
        modalState.listBtn.classList.toggle('dark:text-white', isGrid);
    };

    const renderContent = () => {
        if (!modalState.contentArea) {
            return;
        }
        const existingImages = modalState.contentArea.querySelectorAll('img[data-object-url]');
        existingImages.forEach((img) => {
            if (img.dataset.objectUrl) {
                try {
                    URL.revokeObjectURL(img.dataset.objectUrl);
                } catch (e) {
                    console.warn('Error revoking URL in renderContent', e);
                }
                delete img.dataset.objectUrl;
            }
        });
        modalState.contentArea.innerHTML = '';

        if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
            modalState.contentArea.innerHTML =
                '<p class="text-center text-gray-500 dark:text-gray-400 p-6">Нет скриншотов для отображения.</p>';
            return;
        }
        const sortedScreenshots = [...screenshots].sort((a, b) => (a.id || 0) - (b.id || 0));
        const openLightboxHandler = (blobs, index) => {
            if (deps.openLightbox) {
                deps.openLightbox(blobs, index);
            } else {
                deps.showNotification?.(
                    'Ошибка: Функция просмотра изображений (лайтбокс) недоступна.',
                    'error',
                );
            }
        };
        if (currentView === 'grid') {
            renderScreenshotThumbnails(
                    modalState.contentArea,
                    sortedScreenshots,
                    openLightboxHandler,
                    modalState,
                );
            } else {
                modalState.contentArea.innerHTML =
                    '<p class="text-center text-red-500 dark:text-red-400 p-6">Ошибка: Функция отображения миниатюр недоступна.</p>';
            }
        } else {
            renderScreenshotList(
                    modalState.contentArea,
                    sortedScreenshots,
                    openLightboxHandler,
                    null,
                    modalState,
                );
            } else {
                modalState.contentArea.innerHTML =
                    '<p class="text-center text-red-500 dark:text-red-400 p-6">Ошибка: Функция отображения списка недоступна.</p>';
            }
        }
    };

    if (!isNewModal && modalState.gridBtn && modalState.gridBtnClickHandler) {
        modalState.gridBtn.removeEventListener('click', modalState.gridBtnClickHandler);
    }
    if (!isNewModal && modalState.listBtn && modalState.listBtnClickHandler) {
        modalState.listBtn.removeEventListener('click', modalState.listBtnClickHandler);
    }

    modalState.gridBtnClickHandler = () => {
        if (currentView !== 'grid') {
            currentView = 'grid';
            updateViewButtons();
            renderContent();
        }
    };
    modalState.listBtnClickHandler = () => {
        if (currentView !== 'list') {
            currentView = 'list';
            updateViewButtons();
            renderContent();
        }
    };

    modalState.gridBtn.addEventListener('click', modalState.gridBtnClickHandler);
    modalState.listBtn.addEventListener('click', modalState.listBtnClickHandler);

    updateViewButtons();
    renderContent();
}

export function renderScreenshotThumbnails(container, screenshots, onOpenLightbox, modalState = null) {
    if (!container) {
        console.error('[renderScreenshotThumbnails] Контейнер не предоставлен.');
        return [];
    }
    if (!Array.isArray(screenshots)) {
        console.error("[renderScreenshotThumbnails] 'screenshots' должен быть массивом.");
        return [];
    }
    if (typeof onOpenLightbox !== 'function') {
        console.error("[renderScreenshotThumbnails] 'onOpenLightbox' должен быть функцией.");
    }

    const createdObjectUrls = [];

    const existingImagesThumbs = container.querySelectorAll('img[data-object-url]');
    existingImagesThumbs.forEach((img) => {
        if (img.dataset.objectUrl) {
            console.log(
                '[renderScreenshotThumbnails] Освобождаем существующий Объектный URL перед рендерингом:',
                img.dataset.objectUrl,
            );
            try {
                URL.revokeObjectURL(img.dataset.objectUrl);
            } catch (e) {
                console.warn(
                    'Ошибка освобождения URL в renderScreenshotThumbnails (pre-render cleanup)',
                    e,
                );
            }
            delete img.dataset.objectUrl;
        }
    });

    container.innerHTML = '';
    container.className =
        'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4';

    const fragment = document.createDocumentFragment();
    const allBlobs = screenshots.map((s) => s?.blob).filter((blob) => blob instanceof Blob);

    screenshots.forEach((screenshot, index) => {
        if (
            !screenshot ||
            !(screenshot.blob instanceof Blob) ||
            typeof screenshot.id === 'undefined'
        ) {
            console.warn(
                `[renderScreenshotThumbnails] Пропуск невалидного элемента скриншота на индексе ${index}:`,
                screenshot,
            );
            return;
        }

        const item = document.createElement('div');
        item.className =
            'group relative aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow hover:shadow-md transition cursor-pointer border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900';
        item.tabIndex = 0;
        item.title = `Скриншот ${screenshot.id || index + 1}`;

        const img = document.createElement('img');
        img.className = 'w-full h-full object-contain';
        img.alt = `Миниатюра скриншота ${screenshot.id || index + 1}`;
        img.loading = 'lazy';

        let objectURL = null;
        try {
            objectURL = URL.createObjectURL(screenshot.blob);
            createdObjectUrls.push(objectURL);
            img.dataset.objectUrl = objectURL;
            img.src = objectURL;

            img.onload = () => {
                console.log(`Миниатюра ${screenshot.id} загружена.`);
            };

            img.onerror = () => {
                console.error(`Ошибка загрузки миниатюры ${screenshot.id}`);
                if (img.dataset.objectUrl) {
                    try {
                        URL.revokeObjectURL(img.dataset.objectUrl);
                        console.log(
                            `[renderScreenshotThumbnails] Освобожден URL из-за ошибки загрузки: ${img.dataset.objectUrl}`,
                        );
                        const urlIndex = createdObjectUrls.indexOf(img.dataset.objectUrl);
                        if (urlIndex > -1) {
                            createdObjectUrls.splice(urlIndex, 1);
                        }
                    } catch (e) {
                        console.warn('Ошибка освобождения URL при onerror:', e);
                    }
                    delete img.dataset.objectUrl;
                }
                item.innerHTML = `<div class="flex items-center justify-center w-full h-full text-center text-red-500 text-xs p-1">Ошибка<br>загрузки</div>`;
                item.classList.add('bg-red-100', 'border-red-500');
                if (item._clickHandler) item.removeEventListener('click', item._clickHandler);
                if (item._keydownHandler) item.removeEventListener('keydown', item._keydownHandler);
                item._clickHandler = null;
                item._keydownHandler = null;
            };
        } catch (e) {
            console.error(`Ошибка создания Object URL для скриншота ${screenshot.id}:`, e);
            item.innerHTML = `<div class="flex items-center justify-center w-full h-full text-center text-red-500 text-xs p-1">Ошибка<br>создания URL</div>`;
            item.classList.add('bg-red-100', 'border-red-500');
        }

        const caption = document.createElement('div');
        caption.className =
            'absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate hidden group-hover:block';
        caption.textContent = `ID: ${screenshot.id}`;

        if (objectURL && !item.querySelector('div.text-red-500')) {
            item.appendChild(img);
            item.appendChild(caption);

            const currentBlobIndex = allBlobs.findIndex((b) => b === screenshot.blob);

            if (item._clickHandler) item.removeEventListener('click', item._clickHandler);
            item._clickHandler = () => {
                if (typeof onOpenLightbox === 'function') {
                    if (currentBlobIndex !== -1) {
                        onOpenLightbox(allBlobs, currentBlobIndex);
                    } else {
                        console.error(
                            `[renderScreenshotThumbnails] Не удалось найти Blob в массиве 'allBlobs' для скриншота ${screenshot.id}. Лайтбокс не будет открыт.`,
                        );
                    }
                } else {
                    console.warn(
                        "[renderScreenshotThumbnails] Функция 'onOpenLightbox' не предоставлена или не является функцией.",
                    );
                }
            };
            item.addEventListener('click', item._clickHandler);

            if (item._keydownHandler) item.removeEventListener('keydown', item._keydownHandler);
            item._keydownHandler = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (typeof onOpenLightbox === 'function') {
                        if (currentBlobIndex !== -1) {
                            onOpenLightbox(allBlobs, currentBlobIndex);
                        } else {
                            console.error(
                                `[renderScreenshotThumbnails] Не удалось найти Blob в массиве 'allBlobs' для скриншота ${screenshot.id} при нажатии клавиши. Лайтбокс не будет открыт.`,
                            );
                        }
                    } else {
                        console.warn(
                            "[renderScreenshotThumbnails] Функция 'onOpenLightbox' не предоставлена или не является функцией.",
                        );
                    }
                }
            };
            item.addEventListener('keydown', item._keydownHandler);
        }

        fragment.appendChild(item);
    });

    container.appendChild(fragment);

    console.log(
        `[renderScreenshotThumbnails] Рендеринг миниатюр завершен. Добавлено: ${fragment.childElementCount} элементов. Создано URL: ${createdObjectUrls.length}`,
    );
}

export function renderScreenshotList(
    container,
    screenshots,
    onOpenLightbox,
    onItemClick = null,
    modalState = null,
) {
    if (!container) {
        console.error('[renderScreenshotList] Контейнер не предоставлен.');
        return;
    }
    if (!Array.isArray(screenshots)) {
        console.error("[renderScreenshotList] 'screenshots' должен быть массивом.");
        container.innerHTML =
            '<div class="p-4 text-red-600 dark:text-red-400">Ошибка: Данные скриншотов не являются массивом.</div>';
        return;
    }
    if (typeof onOpenLightbox !== 'function') {
        console.error("[renderScreenshotList] 'onOpenLightbox' должен быть функцией.");
    }

    container.innerHTML = '';
    container.className = 'flex flex-col space-y-1 p-4';
    console.log(
        `[renderScreenshotList] Начало рендеринга. Передано скриншотов: ${screenshots.length}.`,
    );

    if (screenshots.length === 0) {
        container.innerHTML =
            '<div class="p-4 text-gray-500 dark:text-gray-400 text-center">Список скриншотов пуст.</div>';
        console.log('[renderScreenshotList] Список скриншотов пуст.');
        return;
    }

    const fragment = document.createDocumentFragment();
    const validBlobsForLightbox = screenshots
        .map((s) => (s && s.blob instanceof Blob ? s.blob : null))
        .filter((blob) => blob !== null);
    let renderedCount = 0;

    screenshots.forEach((screenshot, index) => {
        if (
            !screenshot ||
            typeof screenshot.id === 'undefined' ||
            !(screenshot.blob instanceof Blob)
        ) {
            console.warn(
                `[renderScreenshotList] Пропуск невалидного элемента скриншота на индексе ${index}:`,
                screenshot,
            );
            return;
        }

        const item = document.createElement('div');
        item.dataset.screenshotId = screenshot.id;
        item.className =
            'group flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 rounded transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 dark:focus:ring-offset-gray-900';
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', `Информация о скриншоте ${screenshot.id}`);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'flex flex-col text-sm';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-medium text-gray-900 dark:text-gray-100';
        nameSpan.textContent = screenshot.name || `Скриншот ${screenshot.id}`;
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'text-gray-500 dark:text-gray-400';
        sizeSpan.textContent = screenshot.blob.size
            ? `${(screenshot.blob.size / 1024).toFixed(1)} KB`
            : 'Размер неизвестен';
        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(sizeSpan);

        const viewButton = document.createElement('button');
        viewButton.type = 'button';
        viewButton.className =
            'ml-4 px-3 py-1 bg-primary text-white text-xs font-medium rounded shadow-sm hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition';
        viewButton.textContent = 'Просмотр';
        viewButton.setAttribute('aria-label', `Просмотреть скриншот ${screenshot.id}`);

        const blobIndexForLightbox = validBlobsForLightbox.findIndex((b) => b === screenshot.blob);

        const itemClickHandler = (e) => {
            if (e.target === viewButton || viewButton.contains(e.target)) {
                return;
            }
            console.log(`[renderScreenshotList] Клик по элементу списка ID: ${screenshot.id}`);
            if (typeof onItemClick === 'function') {
                onItemClick(screenshot, index);
            } else {
                if (typeof onOpenLightbox === 'function' && blobIndexForLightbox !== -1) {
                    onOpenLightbox(validBlobsForLightbox, blobIndexForLightbox);
                } else if (blobIndexForLightbox === -1) {
                    console.error(
                        `[renderScreenshotList] Не удалось найти Blob для ID ${screenshot.id} в массиве 'validBlobsForLightbox' при клике на элемент.`,
                    );
                }
            }
        };
        if (item._itemClickHandler) item.removeEventListener('click', item._itemClickHandler);
        item.addEventListener('click', itemClickHandler);
        item._itemClickHandler = itemClickHandler;

        const itemKeydownHandler = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                itemClickHandler(e);
            }
        };
        if (item._itemKeydownHandler) item.removeEventListener('keydown', item._itemKeydownHandler);
        item.addEventListener('keydown', itemKeydownHandler);
        item._itemKeydownHandler = itemKeydownHandler;

        const buttonClickHandler = (e) => {
            e.stopPropagation();
            console.log(
                `[renderScreenshotList] Клик по кнопке "Просмотр" для ID: ${screenshot.id}`,
            );
            if (typeof onOpenLightbox === 'function') {
                if (blobIndexForLightbox !== -1) {
                    onOpenLightbox(validBlobsForLightbox, blobIndexForLightbox);
                } else {
                    console.error(
                        `[renderScreenshotList] Не удалось найти Blob для ID ${screenshot.id} в массиве 'validBlobsForLightbox' при клике на кнопку.`,
                    );
                }
            } else {
                console.warn(
                    "[renderScreenshotList] Функция 'onOpenLightbox' не предоставлена или не является функцией.",
                );
            }
        };
        if (viewButton._buttonClickHandler)
            viewButton.removeEventListener('click', viewButton._buttonClickHandler);
        viewButton.addEventListener('click', buttonClickHandler);
        viewButton._buttonClickHandler = buttonClickHandler;

        item.appendChild(infoDiv);
        item.appendChild(viewButton);
        fragment.appendChild(item);
        renderedCount++;
    });

    container.appendChild(fragment);
    console.log(
        `[renderScreenshotList] Рендеринг списка завершен. Добавлено: ${renderedCount} элементов.`
    );
}

// ============================================================================
// ОБРАБОТЧИК КЛИКА ПО КНОПКЕ ПРОСМОТРА СКРИНШОТОВ
// ============================================================================

/**
 * Обработчик клика по кнопке просмотра скриншотов
 */
export async function handleViewScreenshotClick(event) {
    const button = event.currentTarget;
    const algorithmId = button.dataset.algorithmId;
    const stepIndexStr = button.dataset.stepIndex;

    console.log(
        `[handleViewScreenshotClick v2] Нажата кнопка просмотра. Algorithm ID: ${algorithmId}, Step Index: ${stepIndexStr}`
    );

    if (!algorithmId || algorithmId === 'unknown') {
        console.error('Не найден корректный ID алгоритма (data-algorithm-id) на кнопке:', button);
        deps.showNotification?.('Не удалось определить алгоритм для скриншотов', 'error');
        return;
    }
    const stepIndex =
        stepIndexStr !== undefined &&
        stepIndexStr !== 'unknown' &&
        !isNaN(parseInt(stepIndexStr, 10))
            ? parseInt(stepIndexStr, 10)
            : null;

    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Загрузка...';

    try {
        console.log(
            `[handleViewScreenshotClick v2] Запрос скриншотов из индекса 'parentId' со значением: ${algorithmId}`
        );
        const allParentScreenshots = await getAllFromIndex('screenshots', 'parentId', algorithmId);
        const algorithmScreenshots = allParentScreenshots.filter(
            (s) => s.parentType === 'algorithm'
        );
        console.log(
            `[handleViewScreenshotClick v2] Получено ${
                algorithmScreenshots?.length ?? 0
            } скриншотов для algorithmId=${algorithmId}.`
        );

        if (!Array.isArray(algorithmScreenshots)) {
            console.error(
                '[handleViewScreenshotClick v2] Ошибка: getAllFromIndex или фильтрация вернули не массив!',
                algorithmScreenshots
            );
            throw new Error('Не удалось получить список скриншотов');
        }

        let screenshotsToShow = [];
        let stepTitleSuffix = '';

        if (stepIndex !== null) {
            screenshotsToShow = algorithmScreenshots.filter((s) => s.stepIndex === stepIndex);
            stepTitleSuffix = ` (Шаг ${stepIndex + 1})`;
            console.log(
                `[handleViewScreenshotClick v2] Отфильтровано ${screenshotsToShow.length} скриншотов для шага ${stepIndex}.`
            );
            if (screenshotsToShow.length === 0) {
                deps.showNotification?.('Для этого шага нет скриншотов.', 'info');
                return;
            }
        } else {
            screenshotsToShow = algorithmScreenshots;
            console.log(
                `[handleViewScreenshotClick v2] Индекс шага не указан, показываем все ${screenshotsToShow.length} скриншотов для алгоритма ${algorithmId}.`
            );
            if (screenshotsToShow.length === 0) {
                deps.showNotification?.('Для этого алгоритма нет скриншотов.', 'info');
                return;
            }
        }

        let algorithmTitle = algorithmId;
        try {
            if (algorithmId === 'main') {
                algorithmTitle = deps.algorithms?.main?.title || 'Главная';
            } else {
                const sections = ['program', 'skzi', 'lk1c', 'webReg'];
                let found = false;
                for (const section of sections) {
                    if (deps.algorithms && Array.isArray(deps.algorithms[section])) {
                        const foundAlgo = deps.algorithms[section].find(
                            (a) => String(a?.id) === String(algorithmId)
                        );
                        if (foundAlgo) {
                            algorithmTitle = foundAlgo.title || algorithmId;
                            found = true;
                            break;
                        }
                    }
                }
                if (!found) {
                    console.warn(
                        `[handleViewScreenshotClick v2] Алгоритм с ID ${algorithmId} не найден ни в одной секции для получения заголовка.`
                    );
                }
            }
        } catch (titleError) {
            console.warn(
                '[handleViewScreenshotClick v2] Не удалось получить название алгоритма:',
                titleError
            );
        }

        const finalModalTitle = `${algorithmTitle}${stepTitleSuffix}`;
        console.log(
            `[handleViewScreenshotClick v2] Вызов showScreenshotViewerModal с ${screenshotsToShow.length} скриншотами. Title: "${finalModalTitle}"`
        );
        await showScreenshotViewerModal(screenshotsToShow, algorithmId, finalModalTitle);
    } catch (error) {
        console.error(
            `[handleViewScreenshotClick v2] Ошибка при загрузке или отображении скриншотов для алгоритма ID ${algorithmId}:`,
            error
        );
        deps.showNotification?.(
            `Ошибка загрузки скриншотов: ${error.message || 'Неизвестная ошибка'}`,
            'error'
        );
    } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
        console.log('[handleViewScreenshotClick v2] Кнопка восстановлена.');
    }
}

// ============================================================================
// РЕДАКТИРОВАНИЕ СКРИНШОТОВ - ОБРАБОТЧИКИ ДЛЯ ШАГОВ АЛГОРИТМОВ
// ============================================================================

/**
 * Привязывает обработчики событий для управления скриншотами к шагу алгоритма
 * @param {HTMLElement} stepElement - DOM-элемент шага алгоритма
 */
export function attachScreenshotHandlers(stepElement) {
    const addBtn = stepElement.querySelector('.add-screenshot-btn');
    const fileInput = stepElement.querySelector('.screenshot-input');
    const thumbnailsContainer = stepElement.querySelector('#screenshotThumbnailsContainer');

    if (!addBtn || !fileInput || !thumbnailsContainer) {
        console.warn(
            'attachScreenshotHandlers: Не удалось найти все элементы для управления скриншотами в шаге:',
            stepElement,
        );
        return;
    }

    if (!stepElement._tempScreenshotBlobs) {
        stepElement._tempScreenshotBlobs = [];
    }
    if (stepElement.dataset.screenshotsToDelete === undefined) {
        stepElement.dataset.screenshotsToDelete = '';
    }

    const addBlobToStep = async (blob) => {
        if (!Array.isArray(stepElement._tempScreenshotBlobs)) {
            stepElement._tempScreenshotBlobs = [];
        }
        try {
            const processedBlob = await processImageFile(blob);
            if (!processedBlob) throw new Error('Обработка изображения не удалась.');

            const tempIndex = stepElement._tempScreenshotBlobs.length;
            stepElement._tempScreenshotBlobs.push(processedBlob);

            renderTemporaryThumbnail(processedBlob, tempIndex, thumbnailsContainer, stepElement);

            console.log(`Временный Blob (индекс ${tempIndex}) добавлен и отрисована миниатюра.`);
            if (typeof State.isUISettingsDirty !== 'undefined') {
                State.isUISettingsDirty = true;
            } else {
                console.warn(
                    'Не удалось установить флаг изменений (State.isUISettingsDirty не найден).',
                );
            }
        } catch (error) {
            console.error('Ошибка обработки или добавления Blob в addBlobToStep:', error);
            deps.showNotification?.(
                `Ошибка обработки изображения: ${error.message || 'Неизвестная ошибка'}`,
                'error',
            );
        }
    };

    if (!addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => {
            fileInput.click();
        });
        addBtn.dataset.listenerAttached = 'true';
    }
    if (!fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', (event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
                Array.from(files).forEach((file) => {
                    handleImageFileForStepProcessing(file, addBlobToStep, addBtn);
                });
            }
            event.target.value = null;
        });
        fileInput.dataset.listenerAttached = 'true';
    }
    if (!stepElement.dataset.pasteListenerAttached) {
        stepElement.addEventListener('paste', (event) => {
            const items = event.clipboardData?.items;
            if (!items) return;
            let imageFile = null;
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                    imageFile = items[i].getAsFile();
                    break;
                }
            }
            if (imageFile) {
                event.preventDefault();
                handleImageFileForStepProcessing(imageFile, addBlobToStep, addBtn);
            }
        });
        stepElement.dataset.pasteListenerAttached = 'true';
    }

    console.log(
        `Обработчики событий для *новых* скриншотов настроены для шага (контейнер: #${
            thumbnailsContainer?.id || '?'
        }). Drag&Drop отключен.`,
    );
}

/**
 * Рендерит временную миниатюру скриншота (для новых, ещё не сохранённых)
 * @param {Blob} blob - Blob изображения
 * @param {number} tempIndex - Индекс во временном массиве
 * @param {HTMLElement} container - Контейнер для миниатюр
 * @param {HTMLElement} stepEl - Элемент шага
 */
export function renderTemporaryThumbnail(blob, tempIndex, container, stepEl) {
    if (!container || !stepEl) {
        console.error(
            '[renderTemporaryThumbnail] Контейнер или родительский элемент (stepEl) не предоставлены.',
        );
        return;
    }
    const thumbDiv = document.createElement('div');
    thumbDiv.className =
        'relative w-16 h-12 group border-2 border-dashed border-green-500 dark:border-green-400 rounded overflow-hidden shadow-sm screenshot-thumbnail temporary';
    thumbDiv.dataset.tempIndex = tempIndex;
    const img = document.createElement('img');
    img.className = 'w-full h-full object-contain bg-gray-200 dark:bg-gray-600';
    img.alt = `Новый скриншот ${tempIndex + 1}`;
    let objectURL = null;

    try {
        objectURL = URL.createObjectURL(blob);
        img.dataset.objectUrl = objectURL;
        console.log(
            `[renderTemporaryThumbnail] Создан Object URL для temp ${tempIndex}: ${objectURL}`,
        );

        img.onload = () => {
            console.log(`[renderTemporaryThumbnail] Изображение (temp ${tempIndex}) загружено.`);
            img.dataset.objectUrlRevoked = 'false';
        };

        img.onerror = () => {
            console.error(
                `[renderTemporaryThumbnail] Ошибка загрузки изображения (temp ${tempIndex}). URL: ${objectURL}`,
            );
            img.alt = 'Ошибка';
            if (img.dataset.objectUrl && img.dataset.objectUrlRevoked !== 'true') {
                try {
                    URL.revokeObjectURL(img.dataset.objectUrl);
                    console.log(
                        `[renderTemporaryThumbnail] Освобожден URL из-за ошибки загрузки: ${img.dataset.objectUrl}`,
                    );
                    img.dataset.objectUrlRevoked = 'true';
                } catch (e) {
                    console.warn('Ошибка освобождения URL при onerror:', e);
                }
                delete img.dataset.objectUrl;
            }
        };
        img.src = objectURL;
    } catch (e) {
        console.error(
            `[renderTemporaryThumbnail] Ошибка создания Object URL для temp ${tempIndex}:`,
            e,
        );
        img.alt = 'Ошибка URL';
        if (objectURL) {
            try {
                URL.revokeObjectURL(objectURL);
            } catch (revokeError) {
                console.warn('Ошибка освобождения URL при catch:', revokeError);
            }
            objectURL = null;
        }
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
        'absolute top-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-1 z-10 focus:outline-none focus:ring-1 focus:ring-white delete-temp-screenshot-btn';
    deleteBtn.title = 'Удалить этот новый скриншот';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';

    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        const indexToRemove = parseInt(thumbDiv.dataset.tempIndex, 10);
        if (
            !isNaN(indexToRemove) &&
            stepEl._tempScreenshotBlobs &&
            stepEl._tempScreenshotBlobs[indexToRemove] !== undefined
        ) {
            stepEl._tempScreenshotBlobs.splice(indexToRemove, 1);
            console.log(`Удален временный скриншот с tempIndex ${indexToRemove} из массива.`);

            const urlToRevoke = img.dataset.objectUrl;
            if (urlToRevoke && img.dataset.objectUrlRevoked !== 'true') {
                try {
                    URL.revokeObjectURL(urlToRevoke);
                    console.log(
                        `[renderTemporaryThumbnail - deleteBtn] Освобожден URL ${urlToRevoke}`,
                    );
                } catch (revokeError) {
                    console.warn(
                        'Ошибка освобождения URL при удалении временной миниатюры:',
                        revokeError,
                    );
                }
            }

            thumbDiv.remove();

            container
                .querySelectorAll('div.temporary[data-temp-index]')
                .forEach((remainingThumb, newIndex) => {
                    remainingThumb.dataset.tempIndex = newIndex;
                });

            if (typeof State.isUISettingsDirty !== 'undefined') {
                State.isUISettingsDirty = true;
            }
        } else {
            console.warn(
                `Не удалось удалить временный скриншот, индекс ${indexToRemove} некорректен или элемент уже удален.`,
            );
            if (thumbDiv.parentNode === container) {
                thumbDiv.remove();
            }
        }
    };
    thumbDiv.appendChild(img);
    thumbDiv.appendChild(deleteBtn);
    container.appendChild(thumbDiv);
}

/**
 * Обрабатывает файл изображения для добавления к шагу
 * @param {File|Blob} fileOrBlob - Файл или Blob изображения
 * @param {Function} addCallback - Функция для добавления обработанного Blob
 * @param {HTMLElement|null} buttonElement - Элемент кнопки для блокировки во время обработки
 */
export async function handleImageFileForStepProcessing(fileOrBlob, addCallback, buttonElement = null) {
    if (!(fileOrBlob instanceof Blob)) {
        console.error(
            'handleImageFileForStepProcessing: Предоставленные данные не являются файлом или Blob.',
        );
        deps.showNotification?.('Ошибка: Некорректный формат файла.', 'error');
        return;
    }
    if (typeof addCallback !== 'function') {
        console.error(
            'handleImageFileForStepProcessing: Не передан или не является функцией обязательный addCallback.',
        );
        deps.showNotification?.('Внутренняя ошибка: Не задан обработчик добавления файла.', 'error');
        return;
    }
    if (!fileOrBlob.type.startsWith('image/')) {
        console.warn(
            `handleImageFileForStepProcessing: Тип файла '${fileOrBlob.type}' не является изображением. Попытка обработки может не удасться.`,
        );
        deps.showNotification?.('Выбранный файл не является изображением.', 'warning');
    }

    let originalButtonHTML = null;
    let wasButtonDisabled = false;

    if (buttonElement instanceof HTMLElement) {
        originalButtonHTML = buttonElement.innerHTML;
        wasButtonDisabled = buttonElement.disabled;
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Обработка...';
        console.log(
            `[handleImageFileProcessing] Кнопка ${buttonElement.className} заблокирована, показан спиннер.`,
        );
    }

    try {
        console.log('[handleImageFileProcessing] Вызов addCallback...');
        await addCallback(fileOrBlob);
        console.log('[handleImageFileProcessing] addCallback успешно выполнен.');
    } catch (error) {
        console.error('Ошибка внутри addCallback при обработке изображения:', error);
        deps.showNotification?.(
            `Ошибка обработки изображения: ${error.message || 'Неизвестная ошибка'}`,
            'error',
        );
    } finally {
        if (buttonElement instanceof HTMLElement) {
            buttonElement.disabled = wasButtonDisabled;
            buttonElement.innerHTML = originalButtonHTML;
            console.log(
                `[handleImageFileProcessing] Кнопка ${buttonElement.className} разблокирована, HTML восстановлен.`,
            );
        }
    }
}

/**
 * Рендерит иконку/кнопку для просмотра скриншотов шага алгоритма
 * @param {string|number} algorithmId - ID алгоритма
 * @param {number} stepIndex - Индекс шага
 * @param {boolean} hasScreenshots - Есть ли сохранённые скриншоты
 * @returns {string} HTML-строка кнопки
 */
export function renderScreenshotIcon(algorithmId, stepIndex, hasScreenshots = false) {
    const safeAlgorithmId =
        typeof algorithmId === 'string' || typeof algorithmId === 'number'
            ? String(algorithmId).replace(/"/g, '')
            : 'unknown';
    const safeStepIndex =
        typeof stepIndex === 'number' ? String(stepIndex).replace(/"/g, '') : 'unknown';

    if (safeAlgorithmId === 'unknown' || safeStepIndex === 'unknown') {
        console.warn(
            `renderScreenshotIcon: Получены невалидные ID алгоритма (${algorithmId}) или индекс шага (${stepIndex}). Кнопка не будет работать корректно.`,
        );
        return '';
    }

    const isDisabled = !hasScreenshots;
    const titleAttributeText = isDisabled
        ? 'Нет изображений для этого шага'
        : 'Просмотреть изображения для этого алгоритма';
    const iconHtml = '<i class="fas fa-images mr-1"></i>';
    const buttonText = 'Визуальные шаги';
    const disabledClasses = isDisabled
        ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600'
        : 'hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700';

    const buttonClasses = `
                                    view-screenshot-btn
                                    ml-2 px-2 py-1
                                    text-sm font-medium
                                    rounded-md border
                                    transition-colors duration-150 ease-in-out
                                    inline-flex items-center align-middle
                                    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500
                                    ${disabledClasses}
                                `;

    return `
                    <button type="button"
                            class="${buttonClasses.replace(/\s+/g, ' ').trim()}"
                            data-algorithm-id="${safeAlgorithmId}"
                            data-step-index="${safeStepIndex}"
                            title="${titleAttributeText}"
                            ${isDisabled ? 'disabled' : ''}>
                        ${iconHtml}
                        <span>${buttonText}</span>
                    </button>
                `;
}

// ============================================================================
// ОБРАБОТКА ИЗОБРАЖЕНИЙ
// ============================================================================

/**
 * Обрабатывает и сжимает изображение
 * @param {File|Blob} fileOrBlob - Исходный файл или Blob изображения
 * @returns {Promise<Blob>} - Обработанный и сжатый Blob
 */
export async function processImageFile(fileOrBlob) {
    return new Promise((resolve, reject) => {
        if (!(fileOrBlob instanceof Blob)) {
            return reject(new Error('Предоставленные данные не являются файлом или Blob.'));
        }
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e_reader) => {
            if (!e_reader.target || typeof e_reader.target.result !== 'string') {
                return reject(new Error('Не удалось прочитать данные файла изображения.'));
            }
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1280,
                    MAX_HEIGHT = 1024;
                let width = img.naturalWidth || img.width,
                    height = img.naturalHeight || img.height;
                if (width === 0 || height === 0) {
                    return reject(new Error('Не удалось определить размеры изображения.'));
                }
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
                canvas.width = Math.round(width);
                canvas.height = Math.round(height);
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Не удалось получить 2D контекст Canvas.'));
                }
                try {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                } catch (drawError) {
                    console.error('Ошибка отрисовки на Canvas:', drawError);
                    return reject(new Error('Ошибка отрисовки изображения.'));
                }
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            console.log(
                                `Изображение обработано и сжато в WebP. Размер: ${(
                                    blob.size / 1024
                                ).toFixed(1)} KB`,
                            );
                            resolve(blob);
                        } else {
                            canvas.toBlob(
                                (jpegBlob) => {
                                    if (jpegBlob) {
                                        console.log(
                                            `Изображение обработано и сжато в JPEG. Размер: ${(
                                                jpegBlob.size / 1024
                                            ).toFixed(1)} KB`,
                                        );
                                        resolve(jpegBlob);
                                    } else {
                                        reject(
                                            new Error(
                                                'Не удалось создать Blob из Canvas (ни WebP, ни JPEG)',
                                            ),
                                        );
                                    }
                                },
                                'image/jpeg',
                                0.85,
                            );
                        }
                    },
                    'image/webp',
                    0.8,
                );
            };
            img.onerror = (err) =>
                reject(new Error('Не удалось загрузить данные изображения в Image объект.'));
            img.src = e_reader.target.result;
        };
        reader.onerror = (err) => reject(new Error('Не удалось прочитать файл изображения.'));
        reader.readAsDataURL(fileOrBlob);
    });
}

// ============================================================================
// ОБРАБОТЧИКИ СКРИНШОТОВ ДЛЯ ЗАКЛАДОК
// ============================================================================

/**
 * Привязывает обработчики событий для управления скриншотами в форме закладки
 * @param {HTMLFormElement} formElement - Элемент формы закладки
 */
export function attachBookmarkScreenshotHandlers(formElement) {
    if (!formElement || formElement.tagName !== 'FORM') {
        console.error('attachBookmarkScreenshotHandlers: Требуется элемент FORM.');
        return;
    }

    const addBtn = formElement.querySelector('.add-bookmark-screenshot-btn');
    const fileInput = formElement.querySelector('.bookmark-screenshot-input');
    const thumbnailsContainer = formElement.querySelector('#bookmarkScreenshotThumbnailsContainer');

    if (!addBtn || !fileInput || !thumbnailsContainer) {
        console.warn(
            'attachBookmarkScreenshotHandlers: Не удалось найти все элементы для управления скриншотами в форме закладки:',
            formElement.id,
        );
        return;
    }

    if (!formElement._tempScreenshotBlobs) {
        formElement._tempScreenshotBlobs = [];
    }
    if (formElement.dataset.screenshotsToDelete === undefined) {
        formElement.dataset.screenshotsToDelete = '';
    }

    const addBlobToBookmarkForm = async (blob) => {
        if (!Array.isArray(formElement._tempScreenshotBlobs)) {
            formElement._tempScreenshotBlobs = [];
        }
        try {
            const processedBlob = await processImageFile(blob);
            if (!processedBlob) throw new Error('Обработка изображения не удалась.');

            const tempIndex = formElement._tempScreenshotBlobs.length;
            formElement._tempScreenshotBlobs.push(processedBlob);

            renderTemporaryThumbnail(processedBlob, tempIndex, thumbnailsContainer, formElement);

            console.log(
                `Временный Blob для закладки (индекс ${tempIndex}) добавлен и отрисована миниатюра.`,
            );
            if (typeof State.isUISettingsDirty !== 'undefined') {
                State.isUISettingsDirty = true;
            }
        } catch (error) {
            console.error('Ошибка обработки или добавления Blob в addBlobToBookmarkForm:', error);
            deps.showNotification?.(
                `Ошибка обработки изображения: ${error.message || 'Неизвестная ошибка'}`,
                'error',
            );
        }
    };

    async function handleImageFileForBookmarkProcessing(fileOrBlob, addCallback, buttonElement) {
        if (!fileOrBlob || !(fileOrBlob instanceof Blob) || typeof addCallback !== 'function') {
            console.error('handleImageFileForBookmarkProcessing: Некорректные аргументы.');
            return;
        }
        const originalButtonHTML = buttonElement ? buttonElement.innerHTML : '';
        const wasButtonDisabled = buttonElement ? buttonElement.disabled : false;
        if (buttonElement) {
            buttonElement.disabled = true;
            buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Обработка...';
        }
        try {
            await addCallback(fileOrBlob);
        } catch (error) {
            console.error(
                'Ошибка при вызове колбэка в handleImageFileForBookmarkProcessing:',
                error,
            );
        } finally {
            if (buttonElement) {
                buttonElement.disabled = wasButtonDisabled;
                buttonElement.innerHTML = originalButtonHTML;
            }
        }
    }

    if (!addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => {
            fileInput.click();
        });
        addBtn.dataset.listenerAttached = 'true';
    }
    if (!fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', (event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
                Array.from(files).forEach((file) => {
                    handleImageFileForBookmarkProcessing(file, addBlobToBookmarkForm, addBtn);
                });
            }
            event.target.value = null;
        });
        fileInput.dataset.listenerAttached = 'true';
    }
    if (!formElement.dataset.pasteListenerAttached) {
        formElement.addEventListener('paste', (event) => {
            const items = event.clipboardData?.items;
            if (!items) return;
            let imageFile = null;
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                    imageFile = items[i].getAsFile();
                    break;
                }
            }
            if (imageFile) {
                event.preventDefault();
                handleImageFileForBookmarkProcessing(imageFile, addBlobToBookmarkForm, addBtn);
            }
        });
        formElement.dataset.pasteListenerAttached = 'true';
    }

    console.log(
        'Обработчики событий для *новых* скриншотов настроены для формы закладки. Drag&Drop отключен.',
    );
}

/**
 * Рендерит миниатюру существующего (сохранённого) скриншота
 * @param {number} screenshotId - ID скриншота в IndexedDB
 * @param {HTMLElement} container - Контейнер для миниатюр
 * @param {HTMLElement} parentElement - Родительский элемент (форма или шаг)
 */
export async function renderExistingThumbnail(screenshotId, container, parentElement) {
    if (!container || !parentElement) {
        console.error(
            'renderExistingThumbnail: Контейнер или родительский элемент не предоставлены.',
        );
        return;
    }

    if (typeof screenshotId !== 'number' || isNaN(screenshotId)) {
        console.error('renderExistingThumbnail: Некорректный screenshotId:', screenshotId);
        return;
    }

    let screenshotData = null;
    try {
        screenshotData = await getFromIndexedDB('screenshots', screenshotId);
    } catch (fetchError) {
        console.error(`Ошибка загрузки данных для скриншота ID ${screenshotId}:`, fetchError);
    }

    const thumbDiv = document.createElement('div');
    thumbDiv.className =
        'relative w-16 h-12 group border border-gray-300 dark:border-gray-500 rounded overflow-hidden shadow-sm screenshot-thumbnail existing';
    thumbDiv.dataset.existingId = screenshotId;

    if (!screenshotData || !(screenshotData.blob instanceof Blob)) {
        console.warn(`Данные для скриншота ID ${screenshotId} не найдены или некорректны.`);
        thumbDiv.classList.remove('border-gray-300', 'dark:border-gray-500');
        thumbDiv.classList.add(
            'border-red-500',
            'dark:border-red-400',
            'bg-red-100',
            'dark:bg-red-900/30',
            'flex',
            'items-center',
            'justify-center',
            'text-red-600',
            'text-xs',
            'p-1',
        );
        thumbDiv.textContent = `Ошибка ID:${screenshotId}`;
        container.appendChild(thumbDiv);
        return;
    }

    const currentToDelete = (parentElement.dataset.screenshotsToDelete || '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10));
    const isMarkedForDeletion = currentToDelete.includes(screenshotId);
    if (isMarkedForDeletion) {
        thumbDiv.classList.add('opacity-50', 'border-dashed', 'border-red-500');
        console.log(`Миниатюра для ID ${screenshotId} рендерится как помеченная к удалению.`);
    }

    const img = document.createElement('img');
    img.className = 'w-full h-full object-contain bg-gray-200 dark:bg-gray-600';
    img.alt = `Скриншот ${screenshotId}`;
    img.loading = 'lazy';

    let objectURL = null;
    try {
        objectURL = URL.createObjectURL(screenshotData.blob);
        img.src = objectURL;
        img.onload = () => {
            console.log(`Существующая миниатюра ${screenshotId} загружена.`);
            URL.revokeObjectURL(objectURL);
        };
        img.onerror = () => {
            console.error(`Ошибка загрузки существующей миниатюры ${screenshotId}.`);
            URL.revokeObjectURL(objectURL);
            img.alt = 'Ошибка';
        };
    } catch (e) {
        console.error(`Ошибка создания URL для Blob ${screenshotId}:`, e);
        img.alt = 'Ошибка URL';
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
        'absolute top-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-1 z-10 focus:outline-none focus:ring-1 focus:ring-white delete-existing-screenshot-btn';
    deleteBtn.title = 'Пометить к удалению';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.disabled = isMarkedForDeletion;

    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        const idToDelete = parseInt(thumbDiv.dataset.existingId, 10);
        if (!isNaN(idToDelete)) {
            const currentToDeleteRaw = parentElement.dataset.screenshotsToDelete || '';
            const currentToDeleteArray = currentToDeleteRaw
                .split(',')
                .filter(Boolean)
                .map((s) => parseInt(s.trim(), 10));

            if (!currentToDeleteArray.includes(idToDelete)) {
                currentToDeleteArray.push(idToDelete);
                parentElement.dataset.screenshotsToDelete = currentToDeleteArray.join(',');
                thumbDiv.classList.add('opacity-50', 'border-dashed', 'border-red-500');
                deleteBtn.disabled = true;
                console.log(
                    `Скриншот ID ${idToDelete} помечен к удалению. Список: ${parentElement.dataset.screenshotsToDelete}`,
                );

                if (typeof State.isUISettingsDirty !== 'undefined') {
                    State.isUISettingsDirty = true;
                }
            }
        }
    };

    thumbDiv.appendChild(img);
    thumbDiv.appendChild(deleteBtn);
    container.appendChild(thumbDiv);
}

