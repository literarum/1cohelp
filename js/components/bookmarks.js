'use strict';

import { escapeHtml, truncateText } from '../utils/html.js';
import { getAllFromIndexedDB, getFromIndexedDB, saveToIndexedDB, getAllFromIndex as getAllFromIndexDB } from '../db/indexeddb.js';
import { CARD_CONTAINER_CLASSES, LIST_CONTAINER_CLASSES, SECTION_GRID_COLS } from '../config.js';
import { ARCHIVE_FOLDER_ID, ARCHIVE_FOLDER_NAME } from '../constants.js';
import { updateSearchIndex } from '../features/search.js';

// ============================================================================
// КОМПОНЕНТ РАБОТЫ С ЗАКЛАДКАМИ
// ============================================================================

// Зависимости будут установлены через setBookmarksDependencies
let isFavorite = null;
let getFavoriteButtonHTML = null;
let showAddBookmarkModal = null;
let showBookmarkDetail = null;
let showOrganizeFoldersModalDep = null;
let showNotification = null;
let debounce = null;
let setupClearButton = null;
let loadFoldersList = null;
let removeEscapeHandler = null;
let getVisibleModals = null;
let addEscapeHandler = null;
let handleSaveFolderSubmitDep = null;
let getAllFromIndex = null;
let State = null;
let showEditBookmarkModal = null;
let deleteBookmarkDep = null;
let showBookmarkDetailModal = null;
let handleViewBookmarkScreenshotsDep = null;
let NotificationService = null;
let showScreenshotViewerModal = null;

/**
 * Устанавливает зависимости для компонента закладок
 */
export function setBookmarksDependencies(deps) {
    isFavorite = deps.isFavorite;
    getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    showAddBookmarkModal = deps.showAddBookmarkModal;
    showBookmarkDetail = deps.showBookmarkDetail;
    showOrganizeFoldersModalDep = deps.showOrganizeFoldersModal;
    showNotification = deps.showNotification;
    debounce = deps.debounce;
    setupClearButton = deps.setupClearButton;
    loadFoldersList = deps.loadFoldersList;
    removeEscapeHandler = deps.removeEscapeHandler;
    getVisibleModals = deps.getVisibleModals;
    addEscapeHandler = deps.addEscapeHandler;
    handleSaveFolderSubmitDep = deps.handleSaveFolderSubmit;
    getAllFromIndex = deps.getAllFromIndex;
    State = deps.State;
    showEditBookmarkModal = deps.showEditBookmarkModal;
    deleteBookmarkDep = deps.deleteBookmark;
    showBookmarkDetailModal = deps.showBookmarkDetailModal;
    handleViewBookmarkScreenshotsDep = deps.handleViewBookmarkScreenshots;
    NotificationService = deps.NotificationService;
    showScreenshotViewerModal = deps.showScreenshotViewerModal;
}

/**
 * Создает элемент закладки
 */
export function createBookmarkElement(bookmark, folderMap = {}, viewMode = 'cards') {
    if (!bookmark || typeof bookmark.id === 'undefined') {
        console.error('createBookmarkElement: Неверные данные закладки', bookmark);
        return null;
    }

    const bookmarkElement = document.createElement('div');
    bookmarkElement.dataset.id = String(bookmark.id);

    const folder = bookmark.folder ? folderMap[bookmark.folder] : null;

    if (bookmark.folder) {
        bookmarkElement.dataset.folder = String(bookmark.folder);
    }

    let folderBadgeHTML = '';
    if (bookmark.folder === ARCHIVE_FOLDER_ID) {
        folderBadgeHTML = `
            <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" title="Папка: ${escapeHtml(
                ARCHIVE_FOLDER_NAME,
            )}">
                <i class="fas fa-archive mr-1 opacity-75"></i>${escapeHtml(ARCHIVE_FOLDER_NAME)}
            </span>`;
    } else if (folder) {
        const colorName = folder.color || 'gray';
        folderBadgeHTML = `
            <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-${colorName}-100 text-${colorName}-800 dark:bg-${colorName}-900 dark:text-${colorName}-200" title="Папка: ${escapeHtml(
            folder.name,
        )}">
                <i class="fas fa-folder mr-1 opacity-75"></i>${escapeHtml(folder.name)}
            </span>`;
    } else if (bookmark.folder) {
        folderBadgeHTML = `
            <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-800 text-gray-200 dark:bg-gray-700 dark:text-gray-300" title="Папка с ID: ${bookmark.folder} не найдена">
                <i class="fas fa-question-circle mr-1 opacity-75"></i>Неизв. папка
            </span>`;
    }

    let externalLinkIconHTML = '';
    let urlHostnameHTML = '';
    let cardClickOpensUrl = false;

    if (bookmark.url) {
        let fixedUrl = String(bookmark.url)
            .trim()
            .replace(/[\u200B-\u200D\uFEFF]/g, '');
        if (fixedUrl && !fixedUrl.match(/^https?:\/\//i)) {
            fixedUrl = 'https://' + fixedUrl;
        }
        try {
            const url = new URL(fixedUrl);
            cardClickOpensUrl = true;
            externalLinkIconHTML = `
                <a href="${url.href}" data-action="open-link-icon" target="_blank" rel="noopener noreferrer"
                   class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                   title="Открыть ссылку">
                    <i class="fas fa-external-link-alt fa-fw"></i>
                </a>`;
            urlHostnameHTML = `
                <a href="${url.href}" data-action="open-link-hostname" target="_blank" rel="noopener noreferrer"
                   class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 underline-offset-2 hover:underline"
                   title="${url.href}">
                    <i class="fas fa-link mr-1 opacity-75"></i>${url.hostname}
                </a>`;
        } catch (e) {
            console.warn('Некорректный URL закладки:', fixedUrl, e);
            cardClickOpensUrl = false;
        }
    }

    bookmarkElement.dataset.opensUrl = String(viewMode === 'cards' && cardClickOpensUrl);

    const hasScreenshots =
        bookmark.screenshotIds &&
        Array.isArray(bookmark.screenshotIds) &&
        bookmark.screenshotIds.length > 0;
    const screenshotButtonHTML = hasScreenshots
        ? `
        <button data-action="view-screenshots" class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Просмотреть скриншоты (${bookmark.screenshotIds.length})">
            <i class="fas fa-images fa-fw"></i>
        </button>`
        : '';

    let archiveButtonHTML = '';
    if (bookmark.folder === ARCHIVE_FOLDER_ID) {
        archiveButtonHTML = `
            <button data-action="restore-from-archive" class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Восстановить из архива">
                <i class="fas fa-box-open fa-fw"></i>
            </button>`;
    } else {
        archiveButtonHTML = `
            <button data-action="move-to-archive" class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Переместить в архив">
                <i class="fas fa-archive fa-fw"></i>
            </button>`;
    }

    const itemTypeForFavorite = bookmark.url ? 'bookmark' : 'bookmark_note';
    const isFav =
        isFavorite && typeof isFavorite === 'function'
            ? isFavorite(itemTypeForFavorite, String(bookmark.id))
            : false;
    const favButtonHTML =
        getFavoriteButtonHTML && typeof getFavoriteButtonHTML === 'function'
            ? getFavoriteButtonHTML(
                  bookmark.id,
                  itemTypeForFavorite,
                  'bookmarks',
                  bookmark.title,
                  bookmark.description,
                  isFav,
              )
            : '';

    const actionsHTML = `
        <div class="bookmark-actions flex items-center gap-0.5 ${
            viewMode === 'cards'
                ? 'absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200'
                : 'flex-shrink-0 ml-auto pl-2'
        }">
            ${viewMode !== 'cards' ? folderBadgeHTML : ''}
            ${favButtonHTML}
            ${screenshotButtonHTML}
            ${externalLinkIconHTML}
            ${archiveButtonHTML}
            <button data-action="edit" class="edit-bookmark p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Редактировать">
                <i class="fas fa-edit fa-fw"></i>
            </button>
            <button data-action="delete" class="delete-bookmark p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Удалить">
                <i class="fas fa-trash fa-fw"></i>
            </button>
        </div>`;

    const safeTitle = escapeHtml(bookmark.title || 'Без названия');
    const safeDescription = escapeHtml(bookmark.description || '');

    if (viewMode === 'cards') {
        bookmarkElement.className =
            'bookmark-item view-item group relative cursor-pointer bg-white dark:bg-gray-700 hover:shadow-md transition-shadow duration-200 rounded-lg border border-gray-200 dark:border-gray-700 p-4';

        const descriptionHTML = safeDescription
            ? `<p class="bookmark-description text-gray-600 dark:text-gray-300 text-sm line-clamp-3" title="${safeDescription}">${safeDescription}</p>`
            : bookmark.url
            ? '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Нет описания</p>'
            : '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Текстовая заметка</p>';

        const mainContentHTML = `
            <div class="flex-grow min-w-0 mb-3">
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 hover:text-primary dark:hover:text-primary transition-colors duration-200 truncate pr-10 sm:pr-24" title="${safeTitle}">
                    ${safeTitle}
                </h3>
                ${descriptionHTML}
                <div class="bookmark-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2">
                    ${folderBadgeHTML}
                    <span class="text-gray-500 dark:text-gray-400" title="Добавлено: ${new Date(
                        bookmark.dateAdded || Date.now(),
                    ).toLocaleString()}">
                        <i class="far fa-clock mr-1 opacity-75"></i>${new Date(
                            bookmark.dateAdded || Date.now(),
                        ).toLocaleDateString()}
                    </span>
                    ${urlHostnameHTML}
                </div>
            </div>`;
        bookmarkElement.innerHTML = mainContentHTML + actionsHTML;
    } else {
        bookmarkElement.className =
            'bookmark-item view-item group relative cursor-pointer flex items-center p-3 border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';

        const listIconHTML = bookmark.url
            ? '<i class="fas fa-link text-gray-400 dark:text-gray-500 mr-3 text-sm"></i>'
            : '<i class="fas fa-sticky-note text-gray-400 dark:text-gray-500 mr-3 text-sm"></i>';

        const listDescText = safeDescription
            ? truncateText(safeDescription, 70)
            : bookmark.url
            ? escapeHtml(bookmark.url)
            : 'Текстовая заметка';

        const mainContentHTML = `
            <div class="flex items-center w-full min-w-0">
                ${listIconHTML}
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 min-w-0">
                        <h3 class="text-base font-medium text-gray-900 dark:text-gray-100 truncate" title="${safeTitle}">${safeTitle}</h3>
                    </div>
                    <p class="bookmark-description text-sm text-gray-500 dark:text-gray-400 truncate" title="${
                        safeDescription || (bookmark.url ? escapeHtml(bookmark.url) : '')
                    }">${listDescText}</p>
                </div>
            </div>`;
        bookmarkElement.innerHTML = mainContentHTML + actionsHTML;
    }
    return bookmarkElement;
}

/**
 * Инициализирует систему закладок
 */
export function initBookmarkSystem() {
    console.log('Вызвана функция initBookmarkSystem.');
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const organizeBookmarksBtn = document.getElementById('organizeBookmarksBtn');
    const bookmarkSearchInput = document.getElementById('bookmarkSearchInput');
    const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');

    if (addBookmarkBtn && !addBookmarkBtn.dataset.listenerAttached) {
        addBookmarkBtn.addEventListener('click', () => {
            if (typeof showAddBookmarkModal === 'function') {
                showAddBookmarkModal();
            }
        });
        addBookmarkBtn.dataset.listenerAttached = 'true';
        console.log('Обработчик для addBookmarkBtn добавлен в initBookmarkSystem.');
    }

    if (organizeBookmarksBtn && !organizeBookmarksBtn.dataset.listenerAttached) {
        organizeBookmarksBtn.addEventListener('click', () => {
            if (typeof showOrganizeFoldersModal === 'function') {
                showOrganizeFoldersModal();
            } else {
                console.error('Функция showOrganizeFoldersModal не найдена!');
                if (typeof showNotification === 'function') {
                    showNotification('Функция управления папками недоступна.', 'error');
                }
            }
        });
        organizeBookmarksBtn.dataset.listenerAttached = 'true';
        console.log('Обработчик для organizeBookmarksBtn добавлен в initBookmarkSystem.');
    }

    if (bookmarkSearchInput && !bookmarkSearchInput.dataset.listenerAttached) {
        const debouncedFilter =
            debounce && typeof debounce === 'function'
                ? debounce(filterBookmarks, 250)
                : filterBookmarks;
        bookmarkSearchInput.addEventListener('input', debouncedFilter);
        bookmarkSearchInput.dataset.listenerAttached = 'true';
        console.log('Обработчик для bookmarkSearchInput добавлен в initBookmarkSystem.');
        if (setupClearButton && typeof setupClearButton === 'function') {
            setupClearButton('bookmarkSearchInput', 'clearBookmarkSearchBtn', filterBookmarks);
        }
    }

    if (bookmarkFolderFilter && !bookmarkFolderFilter.dataset.listenerAttached) {
        bookmarkFolderFilter.addEventListener('change', filterBookmarks);
        bookmarkFolderFilter.dataset.listenerAttached = 'true';
        console.log('Обработчик для bookmarkFolderFilter добавлен в initBookmarkSystem.');
    }
    populateBookmarkFolders();
    loadBookmarks();
}

/**
 * Загружает все закладки из базы данных
 */
export async function getAllBookmarks() {
    try {
        const bookmarks = await getAllFromIndexedDB('bookmarks');
        return bookmarks || [];
    } catch (error) {
        console.error('[getAllBookmarks] Ошибка загрузки закладок:', error);
        return [];
    }
}

/**
 * Загружает и отображает закладки
 */
export async function loadBookmarks() {
    const container = document.getElementById('bookmarksContainer');
    if (!container) {
        console.error('[loadBookmarks] Контейнер #bookmarksContainer не найден.');
        return;
    }

    try {
        const bookmarks = await getAllBookmarks();
        const folders = await getAllFromIndexedDB('bookmarkFolders');
        const folderMap = {};
        if (folders && Array.isArray(folders)) {
            folders.forEach((folder) => {
                folderMap[folder.id] = folder;
            });
        }

        await renderBookmarks(bookmarks, folderMap);
    } catch (error) {
        console.error('[loadBookmarks] Ошибка загрузки закладок:', error);
        container.innerHTML =
            '<p class="text-red-500 dark:text-red-400 text-center p-4">Ошибка загрузки закладок.</p>';
    }
}

/**
 * Рендерит закладки в контейнере
 */
export async function renderBookmarks(bookmarks, folderMap = {}) {
    const container = document.getElementById('bookmarksContainer');
    if (!container) {
        console.error('[renderBookmarks] Контейнер #bookmarksContainer не найден.');
        return;
    }

    container.innerHTML = '';

    if (!bookmarks || bookmarks.length === 0) {
        container.innerHTML =
            '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full mb-2">Закладок пока нет.</p>';
        return;
    }

    // Определение режима отображения (будет получено из настроек)
    const viewMode = 'cards'; // По умолчанию карточки

    // Применение классов контейнера
    container.className = viewMode === 'cards' ? CARD_CONTAINER_CLASSES.join(' ') : LIST_CONTAINER_CLASSES.join(' ');
    if (viewMode === 'cards') {
        SECTION_GRID_COLS.bookmarksContainer.forEach((cls) => container.classList.add(cls));
    }

    const fragment = document.createDocumentFragment();
    for (const bookmark of bookmarks) {
        if (!bookmark || typeof bookmark !== 'object' || !bookmark.id) {
            console.warn('[renderBookmarks] Пропуск невалидной закладки:', bookmark);
            continue;
        }
        const bookmarkElement = createBookmarkElement(bookmark, folderMap, viewMode);
        fragment.appendChild(bookmarkElement);
    }

    container.appendChild(fragment);

    // Применение текущего вида (если функция доступна)
    if (typeof window.applyCurrentView === 'function') {
        window.applyCurrentView('bookmarksContainer');
    }

    console.log(`[renderBookmarks] Отображено ${bookmarks.length} закладок.`);
}

// ============================================================================
// ФУНКЦИИ АРХИВАЦИИ ЗАКЛАДОК
// ============================================================================

/**
 * Восстанавливает закладку из архива
 */
export async function restoreBookmarkFromArchive(bookmarkId) {
    if (typeof bookmarkId !== 'number' || isNaN(bookmarkId)) {
        console.error('restoreBookmarkFromArchive: Неверный ID закладки.', bookmarkId);
        if (typeof showNotification === 'function')
            showNotification('Ошибка: Неверный ID для восстановления.', 'error');
        return;
    }
    console.log(`[restoreBookmarkFromArchive] Восстановление закладки ID ${bookmarkId} из архива.`);
    try {
        const bookmark = await getFromIndexedDB('bookmarks', bookmarkId);
        if (!bookmark) {
            if (typeof showNotification === 'function')
                showNotification('Закладка для восстановления не найдена.', 'error');
            return;
        }

        if (bookmark.folder !== ARCHIVE_FOLDER_ID) {
            if (typeof showNotification === 'function')
                showNotification('Эта закладка не находится в архиве.', 'info');
            return;
        }

        bookmark.folder = null;
        bookmark.dateUpdated = new Date().toISOString();

        await saveToIndexedDB('bookmarks', bookmark);

        if (typeof updateSearchIndex === 'function') {
            const oldDataForIndex = { ...bookmark, folder: ARCHIVE_FOLDER_ID };
            await updateSearchIndex('bookmarks', bookmarkId, bookmark, 'update', oldDataForIndex);
            console.log(`Индекс обновлен для закладки ${bookmarkId} (восстановлена из архива).`);
        } else {
            console.warn(
                'updateSearchIndex не найдена, индекс для восстановленной закладки может быть не обновлен.',
            );
        }

        if (typeof showNotification === 'function')
            showNotification(
                `Закладка "${bookmark.title || 'ID: ' + bookmarkId}" восстановлена из архива.`,
                'success',
            );

        const folderFilter = document.getElementById('bookmarkFolderFilter');
        if (folderFilter && folderFilter.value === ARCHIVE_FOLDER_ID) {
            const bookmarkItemElement = document.querySelector(
                `.bookmark-item[data-id="${bookmarkId}"]`,
            );
            if (bookmarkItemElement) {
                bookmarkItemElement.remove();
                const bookmarksContainer = document.getElementById('bookmarksContainer');
                if (bookmarksContainer && !bookmarksContainer.querySelector('.bookmark-item')) {
                    bookmarksContainer.innerHTML =
                        '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Архив пуст.</div>';
                }
            } else {
                if (typeof filterBookmarks === 'function') filterBookmarks();
                else loadBookmarks();
            }
        } else {
            if (typeof filterBookmarks === 'function') filterBookmarks();
            else loadBookmarks();
        }
    } catch (error) {
        console.error(`Ошибка при восстановлении закладки ID ${bookmarkId} из архива:`, error);
        if (typeof showNotification === 'function')
            showNotification('Ошибка восстановления закладки.', 'error');
    }
}

/**
 * Перемещает закладку в архив
 */
export async function moveBookmarkToArchive(bookmarkId) {
    if (typeof bookmarkId !== 'number' || isNaN(bookmarkId)) {
        console.error('moveBookmarkToArchive: Неверный ID закладки.', bookmarkId);
        if (typeof showNotification === 'function')
            showNotification('Ошибка: Неверный ID для архивации.', 'error');
        return;
    }
    console.log(`[moveBookmarkToArchive] Перемещение закладки ID ${bookmarkId} в архив.`);
    try {
        const bookmark = await getFromIndexedDB('bookmarks', bookmarkId);
        if (!bookmark) {
            if (typeof showNotification === 'function')
                showNotification('Закладка для архивации не найдена.', 'error');
            return;
        }

        const oldFolder = bookmark.folder;
        bookmark.folder = ARCHIVE_FOLDER_ID;
        bookmark.dateUpdated = new Date().toISOString();

        await saveToIndexedDB('bookmarks', bookmark);

        if (typeof updateSearchIndex === 'function') {
            const oldDataForIndex = { ...bookmark, folder: oldFolder };
            await updateSearchIndex('bookmarks', bookmarkId, bookmark, 'update', oldDataForIndex);
            console.log(`Индекс обновлен для закладки ${bookmarkId} (перемещена в архив).`);
        } else {
            console.warn(
                'updateSearchIndex не найдена, индекс для архивированной закладки может быть не обновлен.',
            );
        }

        if (typeof showNotification === 'function')
            showNotification(
                `Закладка "${bookmark.title || 'ID: ' + bookmarkId}" перемещена в архив.`,
                'success',
            );

        const bookmarkItemElement = document.querySelector(
            `.bookmark-item[data-id="${bookmarkId}"]`,
        );
        if (bookmarkItemElement) {
            const folderFilter = document.getElementById('bookmarkFolderFilter');
            if (
                folderFilter &&
                folderFilter.value !== ARCHIVE_FOLDER_ID &&
                folderFilter.value !== ''
            ) {
                bookmarkItemElement.remove();
                const bookmarksContainer = document.getElementById('bookmarksContainer');
                if (bookmarksContainer && !bookmarksContainer.querySelector('.bookmark-item')) {
                    bookmarksContainer.innerHTML =
                        '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных закладок</div>';
                }
            } else if (
                folderFilter &&
                (folderFilter.value === ARCHIVE_FOLDER_ID || folderFilter.value === '')
            ) {
                if (typeof filterBookmarks === 'function') filterBookmarks();
                else loadBookmarks();
            }
        } else {
            if (typeof filterBookmarks === 'function') filterBookmarks();
            else loadBookmarks();
        }
    } catch (error) {
        console.error(`Ошибка при перемещении закладки ID ${bookmarkId} в архив:`, error);
        if (typeof showNotification === 'function')
            showNotification('Ошибка архивации закладки.', 'error');
    }
}

/**
 * Получает текущее состояние формы закладки
 */
export function getCurrentBookmarkFormState(form) {
    if (!form) return null;
    return {
        id: form.elements.bookmarkId.value,
        title: form.elements.bookmarkTitle.value.trim(),
        url: form.elements.bookmarkUrl.value.trim(),
        description: form.elements.bookmarkDescription.value.trim(),
        folder: form.elements.bookmarkFolder.value,
        existingScreenshotIds: (form.dataset.existingScreenshotIds || '')
            .split(',')
            .filter(Boolean)
            .map((s) => String(s.trim()))
            .filter(
                (id) =>
                    !(form.dataset.screenshotsToDelete || '')
                        .split(',')
                        .filter(Boolean)
                        .map((sDel) => String(sDel.trim()))
                        .includes(id),
            )
            .join(','),
        tempScreenshotsCount: (form._tempScreenshotBlobs || []).length,
        deletedScreenshotIds: form.dataset.screenshotsToDelete || '',
    };
}

// ============================================================================
// ФУНКЦИИ ФИЛЬТРАЦИИ И ПАПОК
// ============================================================================

/**
 * Фильтрует и отображает закладки по поисковому запросу и папке
 */
export async function filterBookmarks() {
    const searchInput = document.getElementById('bookmarkSearchInput');
    const folderFilter = document.getElementById('bookmarkFolderFilter');

    if (!searchInput || !folderFilter) {
        console.error('filterBookmarks: Search input or folder filter not found.');
        renderBookmarks([], {});
        return;
    }

    const searchValue = searchInput.value.trim().toLowerCase();
    const selectedFolderValue = folderFilter.value;

    try {
        const allBookmarks = await getAllBookmarks();
        const folders = await getAllFromIndexedDB('bookmarkFolders');
        const folderMap = (folders || []).reduce((map, folder) => {
            if (folder && typeof folder.id !== 'undefined') {
                map[folder.id] = folder;
            }
            return map;
        }, {});

        let bookmarksToDisplay = [];

        if (selectedFolderValue === '') {
            bookmarksToDisplay = allBookmarks.filter((bm) => bm.folder !== ARCHIVE_FOLDER_ID);
        } else if (selectedFolderValue === ARCHIVE_FOLDER_ID) {
            bookmarksToDisplay = allBookmarks.filter((bm) => bm.folder === ARCHIVE_FOLDER_ID);
        } else {
            const numericFolderId = parseInt(selectedFolderValue, 10);
            if (!isNaN(numericFolderId)) {
                bookmarksToDisplay = allBookmarks.filter((bm) => bm.folder === numericFolderId);
            } else {
                console.warn(
                    `filterBookmarks: Некорректный ID папки '${selectedFolderValue}'. Показываем неархивированные.`,
                );
                bookmarksToDisplay = allBookmarks.filter((bm) => bm.folder !== ARCHIVE_FOLDER_ID);
            }
        }

        if (searchValue) {
            bookmarksToDisplay = bookmarksToDisplay.filter((bm) => {
                const titleMatch = bm.title && bm.title.toLowerCase().includes(searchValue);
                const descMatch =
                    bm.description && bm.description.toLowerCase().includes(searchValue);
                const urlMatch = bm.url && bm.url.toLowerCase().includes(searchValue);
                return titleMatch || descMatch || urlMatch;
            });
        }

        renderBookmarks(bookmarksToDisplay, folderMap);

        if (typeof window.ensureBookmarksScroll === 'function') {
            window.ensureBookmarksScroll();
        }
    } catch (error) {
        console.error('Ошибка при фильтрации закладок:', error);
        if (typeof showNotification === 'function')
            showNotification('Ошибка фильтрации закладок', 'error');
        renderBookmarks([], {});
    }
}

/**
 * Заполняет выпадающий список папок закладок
 */
export async function populateBookmarkFolders(folderSelectElement) {
    const folderSelect = folderSelectElement || document.getElementById('bookmarkFolder');
    if (!folderSelect) return;

    folderSelect.innerHTML = '<option value="">Выберите папку</option>';

    try {
        const folders = await getAllFromIndexedDB('bookmarkFolders');

        if (folders?.length > 0) {
            const fragment = document.createDocumentFragment();
            folders.forEach((folder) => {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.name;
                fragment.appendChild(option);
            });
            folderSelect.appendChild(fragment);
        }
    } catch (error) {
        console.error('Error loading folders for dropdown:', error);
    }
}

/**
 * Рендерит папки в фильтре закладок
 */
export async function renderBookmarkFolders(folders) {
    const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');
    if (!bookmarkFolderFilter) {
        console.warn('renderBookmarkFolders: Элемент #bookmarkFolderFilter не найден.');
        return;
    }

    const currentValue = bookmarkFolderFilter.value;

    while (bookmarkFolderFilter.options.length > 1) {
        bookmarkFolderFilter.remove(1);
    }

    const fragment = document.createDocumentFragment();

    const archiveOption = document.createElement('option');
    archiveOption.value = ARCHIVE_FOLDER_ID;
    archiveOption.textContent = ARCHIVE_FOLDER_NAME;
    fragment.appendChild(archiveOption);

    if (folders && folders.length > 0) {
        const sortedFolders = [...folders].sort((a, b) =>
            (a.name || '').localeCompare(b.name || ''),
        );
        sortedFolders.forEach((folder) => {
            if (folder && typeof folder.id !== 'undefined' && folder.name) {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.name;
                fragment.appendChild(option);
            } else {
                console.warn('renderBookmarkFolders: Пропущена невалидная папка:', folder);
            }
        });
    }

    bookmarkFolderFilter.appendChild(fragment);

    if (
        currentValue &&
        Array.from(bookmarkFolderFilter.options).some((opt) => opt.value === currentValue)
    ) {
        bookmarkFolderFilter.value = currentValue;
    } else if (bookmarkFolderFilter.options.length > 0 && currentValue !== ARCHIVE_FOLDER_ID) {
        if (bookmarkFolderFilter.value !== ARCHIVE_FOLDER_ID && bookmarkFolderFilter.value !== '') {
        }
    }
    console.log("renderBookmarkFolders: Список папок в фильтре обновлен, включая 'Архив'.");
}

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ ПАПКАМИ
// ============================================================================

/**
 * Обрабатывает сохранение папки закладок (добавление или редактирование)
 */
export async function handleSaveFolderSubmit(event) {
    event.preventDefault();
    const folderForm = event.target;
    const saveButton = folderForm.querySelector('#folderSubmitBtn');
    if (!folderForm || !saveButton) {
        console.error('Не удалось найти форму или кнопку сохранения папки.');
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const nameInput = folderForm.elements.folderName;
    const name = nameInput.value.trim();
    const colorInput = folderForm.querySelector('input[name="folderColor"]:checked');
    const color = colorInput?.value ?? 'blue';

    if (!name) {
        if (typeof showNotification === 'function') {
            showNotification('Пожалуйста, введите название папки', 'error');
        }
        saveButton.disabled = false;
        saveButton.innerHTML = folderForm.dataset.editingId
            ? 'Сохранить изменения'
            : 'Добавить папку';
        nameInput.focus();
        return;
    }

    const isEditing = folderForm.dataset.editingId;
    const folderData = {
        name,
        color,
    };

    let oldData = null;
    let finalId = null;
    const timestamp = new Date().toISOString();

    try {
        if (isEditing) {
            folderData.id = parseInt(isEditing);
            finalId = folderData.id;
            try {
                oldData = await getFromIndexedDB('bookmarkFolders', finalId);
                folderData.dateAdded = oldData?.dateAdded || timestamp;
            } catch (fetchError) {
                console.warn(
                    `Не удалось получить старые данные папки закладок (${finalId}):`,
                    fetchError,
                );
                folderData.dateAdded = timestamp;
            }
            folderData.dateUpdated = timestamp;
            console.log('Редактирование папки:', folderData);
        } else {
            folderData.dateAdded = timestamp;
            console.log('Добавление новой папки:', folderData);
        }

        const savedResult = await saveToIndexedDB('bookmarkFolders', folderData);
        if (!isEditing) {
            finalId = savedResult;
            folderData.id = finalId;
        }

        if (typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex(
                    'bookmarkFolders',
                    finalId,
                    folderData,
                    isEditing ? 'update' : 'add',
                    oldData,
                );
                console.log(`Поисковый индекс обновлен для папки ID: ${finalId}`);
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса для папки ${finalId}:`,
                    indexError,
                );
                if (typeof showNotification === 'function') {
                    showNotification('Ошибка обновления поискового индекса для папки.', 'warning');
                }
            }
        } else {
            console.warn('Функция updateSearchIndex недоступна для папки.');
        }

        const foldersList = document.getElementById('foldersList');
        if (foldersList && typeof loadFoldersList === 'function') {
            await loadFoldersList(foldersList);
        }

        await populateBookmarkFolders();
        await loadBookmarks();

        if (typeof showNotification === 'function') {
            showNotification(isEditing ? 'Папка обновлена' : 'Папка добавлена');
        }

        folderForm.reset();
        delete folderForm.dataset.editingId;
        const submitButton = folderForm.querySelector('#folderSubmitBtn');
        if (submitButton) submitButton.textContent = 'Добавить папку';
        const defaultColorInput = folderForm.querySelector(
            'input[name="folderColor"][value="blue"]',
        );
        if (defaultColorInput) defaultColorInput.checked = true;

        const modal = document.getElementById('foldersModal');
        if (modal) {
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            if (typeof getVisibleModals === 'function' && getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        }
    } catch (error) {
        console.error('Ошибка при сохранении папки:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при сохранении папки: ' + (error.message || error), 'error');
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = folderForm.dataset.editingId
            ? 'Сохранить изменения'
            : 'Добавить папку';
    }
}

/**
 * Показывает модальное окно управления папками закладок
 */
export function showOrganizeFoldersModal() {
    let modal = document.getElementById('foldersModal');
    let isNewModal = false;

    if (!modal) {
        isNewModal = true;
        modal = document.createElement('div');
        modal.id = 'foldersModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold">Управление папками</h2>
                            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        <div id="foldersList" class="max-h-60 overflow-y-auto mb-4">
                            <div class="text-center py-4 text-gray-500">Загрузка папок...</div>
                        </div>
                        
                        <form id="folderForm" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <input type="hidden" name="editingFolderId">
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="folderName">Название папки</label>
                                <input type="text" id="folderName" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1">Цвет</label>
                                <div class="flex gap-2 flex-wrap">
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="gray" class="form-radio text-gray-600 focus:ring-gray-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-gray-500 border border-gray-300"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="red" class="form-radio text-red-600 focus:ring-red-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-red-600"></span>
                                    </label>
                                     <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="orange" class="form-radio text-orange-600 focus:ring-orange-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-orange-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="yellow" class="form-radio text-yellow-500 focus:ring-yellow-400">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-yellow-400"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="green" class="form-radio text-green-600 focus:ring-green-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-green-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="teal" class="form-radio text-teal-600 focus:ring-teal-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-teal-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="blue" checked class="form-radio text-blue-600 focus:ring-blue-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-blue-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="indigo" class="form-radio text-indigo-600 focus:ring-indigo-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-indigo-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="purple" class="form-radio text-purple-600 focus:ring-purple-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-purple-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="pink" class="form-radio text-pink-600 focus:ring-pink-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-pink-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="rose" class="form-radio text-rose-600 focus:ring-rose-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-rose-500"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="flex justify-end">
                                <button type="submit" id="folderSubmitBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                    Добавить папку
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target.closest('.close-modal')) {
                modal.classList.add('hidden');
                if (typeof removeEscapeHandler === 'function') {
                    removeEscapeHandler(modal);
                }
                if (typeof getVisibleModals === 'function' && getVisibleModals().length === 0) {
                    document.body.classList.remove('modal-open');
                }

                const form = modal.querySelector('#folderForm');
                if (form && form.dataset.editingId) {
                    form.reset();
                    delete form.dataset.editingId;
                    const submitButton = form.querySelector('#folderSubmitBtn');
                    if (submitButton) submitButton.textContent = 'Добавить папку';
                    const defaultColorInput = form.querySelector(
                        'input[name="folderColor"][value="blue"]',
                    );
                    if (defaultColorInput) defaultColorInput.checked = true;
                }
            }
        });

        const form = modal.querySelector('#folderForm');
        if (!form.dataset.submitListenerAttached) {
            if (typeof handleSaveFolderSubmitDep === 'function') {
                form.addEventListener('submit', handleSaveFolderSubmitDep);
                form.dataset.submitListenerAttached = 'true';
            } else {
                // Fallback to local handleSaveFolderSubmit if dependency not set
                form.addEventListener('submit', handleSaveFolderSubmit);
                form.dataset.submitListenerAttached = 'true';
            }
        }
    }

    const form = modal.querySelector('#folderForm');
    if (form) {
        form.reset();
        delete form.dataset.editingId;
        const submitButton = form.querySelector('#folderSubmitBtn');
        if (submitButton) submitButton.textContent = 'Добавить папку';
        const defaultColorInput = form.querySelector('input[name="folderColor"][value="blue"]');
        if (defaultColorInput) defaultColorInput.checked = true;
    }

    const foldersListElement = modal.querySelector('#foldersList');
    if (foldersListElement && typeof loadFoldersList === 'function') {
        loadFoldersList(foldersListElement);
    } else {
        console.error('Не найден элемент #foldersList в модальном окне папок или loadFoldersList недоступна.');
    }

    if (modal && typeof addEscapeHandler === 'function') {
        addEscapeHandler(modal);
    } else if (modal) {
        console.warn('[showOrganizeFoldersModal] addEscapeHandler function not found.');
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Обрабатывает удаление папки закладок
 */
export async function handleDeleteBookmarkFolderClick(folderId, folderItem) {
    try {
        if (typeof getAllFromIndex !== 'function') {
            console.error('Функция getAllFromIndex не определена при попытке удаления папки!');
            if (typeof showNotification === 'function') {
                showNotification('Ошибка: Невозможно проверить содержимое папки.', 'error');
            }
            return;
        }

        const bookmarksInFolder = await getAllFromIndex('bookmarks', 'folder', folderId);
        const folderToDelete = await getFromIndexedDB('bookmarkFolders', folderId);

        let confirmationMessage = `Вы уверены, что хотите удалить папку "${
            folderToDelete?.name || 'ID ' + folderId
        }"?`;
        let shouldDeleteBookmarks = false;
        let screenshotIdsToDelete = [];

        if (bookmarksInFolder && bookmarksInFolder.length > 0) {
            confirmationMessage += `\n\nВ этой папке находит${
                bookmarksInFolder.length === 1 ? 'ся' : 'ся'
            } ${bookmarksInFolder.length} заклад${
                bookmarksInFolder.length === 1 ? 'ка' : bookmarksInFolder.length < 5 ? 'ки' : 'ок'
            }. Они также будут УДАЛЕНЫ вместе со связанными скриншотами!`;
            shouldDeleteBookmarks = true;
            bookmarksInFolder.forEach((bm) => {
                if (Array.isArray(bm.screenshotIds) && bm.screenshotIds.length > 0) {
                    screenshotIdsToDelete.push(...bm.screenshotIds);
                }
            });
            screenshotIdsToDelete = [...new Set(screenshotIdsToDelete)];
            console.log(
                `К удалению запланировано ${bookmarksInFolder.length} закладок и ${screenshotIdsToDelete.length} скриншотов.`,
            );
        }

        if (!confirm(confirmationMessage)) {
            console.log('Удаление папки отменено.');
            return;
        }

        console.log(
            `Начало удаления папки ID: ${folderId}. Удаление закладок: ${shouldDeleteBookmarks}. Удаление скриншотов: ${
                screenshotIdsToDelete.length > 0
            }`,
        );

        const indexUpdatePromises = [];
        if (folderToDelete && typeof updateSearchIndex === 'function') {
            indexUpdatePromises.push(
                updateSearchIndex('bookmarkFolders', folderId, folderToDelete, 'delete').catch(
                    (err) => console.error(`Ошибка индексации (удаление папки ${folderId}):`, err),
                ),
            );
            if (shouldDeleteBookmarks) {
                bookmarksInFolder.forEach((bm) => {
                    indexUpdatePromises.push(
                        updateSearchIndex('bookmarks', bm.id, bm, 'delete').catch((err) =>
                            console.error(`Ошибка индексации (удаление закладки ${bm.id}):`, err),
                        ),
                    );
                });
            }
        } else {
            console.warn(
                'Не удалось обновить поисковый индекс при удалении папки: папка не найдена или функция updateSearchIndex недоступна.',
            );
        }
        await Promise.allSettled(indexUpdatePromises);
        console.log('Обновление поискового индекса (удаление) завершено.');

        let transaction;
        try {
            const stores = ['bookmarkFolders'];
            if (shouldDeleteBookmarks) stores.push('bookmarks');
            if (screenshotIdsToDelete.length > 0) stores.push('screenshots');

            if (!State || !State.db) {
                throw new Error('State.db не инициализирован');
            }

            transaction = State.db.transaction(stores, 'readwrite');
            const folderStore = transaction.objectStore('bookmarkFolders');
            const bookmarkStore = stores.includes('bookmarks')
                ? transaction.objectStore('bookmarks')
                : null;
            const screenshotStore = stores.includes('screenshots')
                ? transaction.objectStore('screenshots')
                : null;

            const deleteRequests = [];

            deleteRequests.push(
                new Promise((resolve, reject) => {
                    const req = folderStore.delete(folderId);
                    req.onsuccess = resolve;
                    req.onerror = (e) =>
                        reject(e.target.error || new Error(`Ошибка удаления папки ${folderId}`));
                }),
            );

            if (bookmarkStore && shouldDeleteBookmarks) {
                bookmarksInFolder.forEach((bm) => {
                    deleteRequests.push(
                        new Promise((resolve, reject) => {
                            const req = bookmarkStore.delete(bm.id);
                            req.onsuccess = resolve;
                            req.onerror = (e) =>
                                reject(
                                    e.target.error ||
                                        new Error(`Ошибка удаления закладки ${bm.id}`),
                                );
                        }),
                    );
                });
            }

            if (screenshotStore && screenshotIdsToDelete.length > 0) {
                screenshotIdsToDelete.forEach((screenshotId) => {
                    deleteRequests.push(
                        new Promise((resolve, reject) => {
                            const req = screenshotStore.delete(screenshotId);
                            req.onsuccess = resolve;
                            req.onerror = (e) =>
                                reject(
                                    e.target.error ||
                                        new Error(`Ошибка удаления скриншота ${screenshotId}`),
                                );
                        }),
                    );
                });
            }

            await Promise.all(deleteRequests);

            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = (e) =>
                    reject(e.target.error || new Error('Ошибка транзакции удаления'));
                transaction.onabort = (e) =>
                    reject(e.target.error || new Error('Транзакция удаления прервана'));
            });

            console.log(
                `Папка ${folderId}, ${bookmarksInFolder.length} закладок и ${screenshotIdsToDelete.length} скриншотов успешно удалены из БД.`,
            );

            if (folderItem && folderItem.parentNode) folderItem.remove();
            else console.warn(`Элемент папки ${folderId} не найден или уже удален из DOM.`);

            await populateBookmarkFolders();
            await loadBookmarks();

            if (typeof showNotification === 'function') {
                showNotification('Папка и ее содержимое удалены');
            }

            const foldersList = document.getElementById('foldersList');
            if (foldersList && !foldersList.querySelector('.folder-item')) {
                foldersList.innerHTML =
                    '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
            }
        } catch (error) {
            console.error('Ошибка при удалении папки/закладок/скриншотов в транзакции:', error);
            if (typeof showNotification === 'function') {
                showNotification('Ошибка при удалении папки: ' + (error.message || error), 'error');
            }
            if (transaction && transaction.readyState !== 'done' && transaction.abort) {
                try {
                    transaction.abort();
                } catch (abortErr) {
                    console.error('Ошибка отмены транзакции при ошибке:', abortErr);
                }
            }
            await loadBookmarks();
            const foldersList = document.getElementById('foldersList');
            if (foldersList && typeof loadFoldersList === 'function') {
                await loadFoldersList(foldersList);
            }
        }
    } catch (error) {
        console.error('Общая ошибка при удалении папки закладок (вне транзакции):', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при удалении папки: ' + (error.message || error), 'error');
        }
    }
}

/**
 * Загружает и отображает список папок в указанном контейнере
 */
export async function loadFoldersListInContainer(foldersListElement) {
    if (!foldersListElement) {
        console.error('loadFoldersListInContainer: Контейнер для списка папок не передан.');
        return;
    }

    foldersListElement.innerHTML =
        '<div class="text-center py-4 text-gray-500">Загрузка папок...</div>';

    try {
        const folders = await getAllFromIndexedDB('bookmarkFolders');

        if (!folders || folders.length === 0) {
            foldersListElement.innerHTML =
                '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
            return;
        }

        foldersListElement.innerHTML = '';
        const fragment = document.createDocumentFragment();

        folders.forEach((folder) => {
            const folderItem = document.createElement('div');
            folderItem.className =
                'folder-item flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0';
            folderItem.dataset.folderId = folder.id;

            const colorName = folder.color || 'gray';
            const colorClass = `bg-${colorName}-500`;

            folderItem.innerHTML = `
                <div class="flex items-center flex-grow min-w-0 mr-2">
                    <span class="w-4 h-4 rounded-full ${colorClass} mr-2 flex-shrink-0"></span>
                    <span class="truncate" title="${folder.name}">${folder.name}</span>
                </div>
                <div class="flex-shrink-0">
                    <button class="edit-folder-btn p-1 text-gray-500 hover:text-primary" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-folder-btn p-1 text-gray-500 hover:text-red-500 ml-1" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            const deleteBtn = folderItem.querySelector('.delete-folder-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (
                        confirm(
                            `Вы уверены, что хотите удалить папку "${folder.name}"? Закладки в ней не будут удалены, но потеряют привязку к папке.`,
                        )
                    ) {
                        handleDeleteBookmarkFolderClick(folder.id, folderItem);
                    }
                });
            }

            const editBtn = folderItem.querySelector('.edit-folder-btn');
            if (editBtn) {
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const modal = document.getElementById('foldersModal');
                    if (!modal) return;

                    const form = modal.querySelector('#folderForm');
                    if (!form) return;

                    try {
                        const folderData = await getFromIndexedDB('bookmarkFolders', folder.id);
                        if (folderData) {
                            form.elements.folderName.value = folderData.name;
                            const colorInput = form.querySelector(
                                `input[name="folderColor"][value="${folderData.color || 'blue'}"]`,
                            );
                            if (colorInput) colorInput.checked = true;
                            form.dataset.editingId = folder.id;
                            const submitButton = form.querySelector('button[type="submit"]');
                            if (submitButton) submitButton.textContent = 'Сохранить изменения';
                            form.elements.folderName.focus();
                        } else {
                            if (typeof showNotification === 'function') {
                                showNotification(
                                    'Не удалось загрузить данные папки для редактирования',
                                    'error',
                                );
                            }
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки папки для редактирования:', error);
                        if (typeof showNotification === 'function') {
                            showNotification('Ошибка загрузки папки', 'error');
                        }
                    }
                });
            }

            fragment.appendChild(folderItem);
        });

        foldersListElement.appendChild(fragment);
    } catch (error) {
        console.error('Ошибка при загрузке списка папок:', error);
        foldersListElement.innerHTML =
            '<div class="text-center py-4 text-red-500">Не удалось загрузить папки</div>';
        if (typeof showNotification === 'function') {
            showNotification('Ошибка загрузки списка папок', 'error');
        }
    }
}

/**
 * Обрабатывает действия над закладками (делегирование событий)
 */
export async function handleBookmarkAction(event) {
    const target = event.target;
    const bookmarksContainer = document.getElementById('bookmarksContainer');

    if (target.closest('.toggle-favorite-btn')) {
        return;
    }

    const bookmarkItem = target.closest('.bookmark-item[data-id]');
    if (!bookmarkItem) return;

    const bookmarkId = parseInt(bookmarkItem.dataset.id, 10);
    if (isNaN(bookmarkId)) {
        console.error('Невалидный ID закладки:', bookmarkItem.dataset.id);
        return;
    }

    const button = target.closest('button[data-action], a[data-action]');
    const actionTarget = button || target;
    let action = button ? button.dataset.action : null;

    if (!action && actionTarget.closest('.bookmark-item')) {
        const currentView =
            (bookmarksContainer && State?.viewPreferences?.['bookmarksContainer']) ||
            bookmarksContainer?.dataset.defaultView ||
            'cards';
        if (currentView === 'cards') {
            const opensUrl = bookmarkItem.dataset.opensUrl === 'true';
            if (opensUrl) {
                action = 'open-card-url';
            } else {
                action = 'view-details';
            }
        } else {
            action = 'view-details';
        }
    }

    if (!action) {
        console.log('Действие не определено для клика по закладке ID:', bookmarkId);
        return;
    }

    console.log(`Действие '${action}' для закладки ID: ${bookmarkId}`);

    if (
        button &&
        (button.tagName === 'A' || button.type === 'button') &&
        action !== 'open-card-url'
    ) {
        event.preventDefault();
    }

    if (action === 'move-to-archive') {
        if (typeof moveBookmarkToArchive === 'function') {
            await moveBookmarkToArchive(bookmarkId);
        } else {
            console.error('Функция moveBookmarkToArchive не определена.');
            if (typeof showNotification === 'function')
                showNotification('Функция архивирования недоступна.', 'error');
        }
    } else if (action === 'restore-from-archive') {
        if (typeof restoreBookmarkFromArchive === 'function') {
            await restoreBookmarkFromArchive(bookmarkId);
        } else {
            console.error('Функция restoreBookmarkFromArchive не определена.');
            if (typeof showNotification === 'function')
                showNotification('Функция восстановления из архива недоступна.', 'error');
        }
    } else if (action === 'edit') {
        if (typeof showEditBookmarkModal === 'function') {
            showEditBookmarkModal(bookmarkId);
        } else {
            console.error('Функция showEditBookmarkModal (для редактирования) не определена.');
            if (NotificationService?.add) {
                NotificationService.add('Функция редактирования недоступна.', 'error');
            }
        }
    } else if (action === 'delete') {
        const title = bookmarkItem.querySelector('h3')?.title || `закладку с ID ${bookmarkId}`;
        if (confirm(`Вы уверены, что хотите удалить закладку "${title}"?`)) {
            if (typeof deleteBookmarkDep === 'function') {
                deleteBookmarkDep(bookmarkId);
            } else {
                console.error('Функция deleteBookmark не определена.');
                if (NotificationService?.add) {
                    NotificationService.add('Функция удаления недоступна.', 'error');
                }
            }
        }
    } else if (
        action === 'open-link-icon' ||
        action === 'open-link-hostname' ||
        action === 'open-card-url'
    ) {
        const urlToOpen =
            action === 'open-card-url'
                ? bookmarkItem.querySelector('a.bookmark-url')?.href
                : (button || actionTarget)?.href;

        if (urlToOpen) {
            try {
                new URL(urlToOpen);
                window.open(urlToOpen, '_blank', 'noopener,noreferrer');
            } catch (e) {
                console.error(`Некорректный URL у внешнего ресурса ${bookmarkId}: ${urlToOpen}`, e);
                if (NotificationService?.add) {
                    NotificationService.add('Некорректный URL у этого ресурса.', 'error');
                }
            }
        } else {
            console.warn(`Нет URL для действия '${action}' у закладки ID: ${bookmarkId}.`);
            if (action === 'open-card-url') {
                if (typeof showBookmarkDetailModal === 'function') {
                    showBookmarkDetailModal(bookmarkId);
                }
            } else {
                if (NotificationService?.add) {
                    NotificationService.add('URL для этого действия не найден.', 'error');
                }
            }
        }
    } else if (action === 'view-screenshots') {
        await handleViewBookmarkScreenshots(bookmarkId);
    } else if (action === 'view-details') {
        if (typeof showBookmarkDetailModal === 'function') {
            showBookmarkDetailModal(bookmarkId);
        } else {
            console.warn('Функция showBookmarkDetailModal не определена.');
            if (NotificationService?.add) {
                NotificationService.add('Невозможно отобразить детали этой заметки.', 'info');
            }
        }
    }
}

/**
 * Обрабатывает просмотр скриншотов закладки
 */
export async function handleViewBookmarkScreenshots(bookmarkId) {
    console.log(`[handleViewBookmarkScreenshots] Запрос скриншотов для закладки ID: ${bookmarkId}`);
    const button = document.querySelector(
        `.bookmark-item[data-id="${bookmarkId}"] button[data-action="view-screenshots"]`,
    );
    let originalContent, iconElement, originalIconClass;

    if (button) {
        originalContent = button.innerHTML;
        iconElement = button.querySelector('i');
        originalIconClass = iconElement ? iconElement.className : null;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        if (typeof getAllFromIndex !== 'function') {
            console.error('getAllFromIndex не доступна');
            if (typeof showNotification === 'function') {
                showNotification('Ошибка: функция получения скриншотов недоступна.', 'error');
            }
            return;
        }

        const allParentScreenshots = await getAllFromIndex('screenshots', 'parentId', bookmarkId);

        const bookmarkScreenshots = allParentScreenshots.filter((s) => s.parentType === 'bookmark');
        console.log(
            `[handleViewBookmarkScreenshots] Найдено и отфильтровано ${bookmarkScreenshots.length} скриншотов.`,
        );

        if (bookmarkScreenshots.length === 0) {
            if (typeof showNotification === 'function') {
                showNotification('Для этой закладки нет скриншотов.', 'info');
            }
            return;
        }

        let bookmarkTitle = `Закладка ID ${bookmarkId}`;
        try {
            const bookmarkData = await getFromIndexedDB('bookmarks', bookmarkId);
            if (bookmarkData && bookmarkData.title) {
                bookmarkTitle = bookmarkData.title;
            }
        } catch (titleError) {
            console.warn(`Не удалось получить название закладки ${bookmarkId}:`, titleError);
        }

        if (typeof showScreenshotViewerModal === 'function') {
            await showScreenshotViewerModal(bookmarkScreenshots, bookmarkId, bookmarkTitle);
        } else {
            console.error('Функция showScreenshotViewerModal не определена!');
            if (typeof showNotification === 'function') {
                showNotification('Ошибка: Функция просмотра скриншотов недоступна.', 'error');
            }
        }
    } catch (error) {
        console.error(`Ошибка при загрузке скриншотов для закладки ID ${bookmarkId}:`, error);
        if (typeof showNotification === 'function') {
            showNotification(
                `Ошибка загрузки скриншотов: ${error.message || 'Неизвестная ошибка'}`,
                'error',
            );
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalContent;
        }
    }
}
