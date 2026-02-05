'use strict';

import { escapeHtml, truncateText } from '../utils/html.js';
import { getAllFromIndexedDB } from '../db/indexeddb.js';
import { CARD_CONTAINER_CLASSES, LIST_CONTAINER_CLASSES, SECTION_GRID_COLS } from '../config.js';
import { ARCHIVE_FOLDER_ID, ARCHIVE_FOLDER_NAME } from '../constants.js';

// ============================================================================
// КОМПОНЕНТ РАБОТЫ С ЗАКЛАДКАМИ
// ============================================================================

// Зависимости будут установлены через setBookmarksDependencies
let isFavorite = null;
let getFavoriteButtonHTML = null;
let showAddBookmarkModal = null;
let showBookmarkDetail = null;
let showOrganizeFoldersModal = null;
let filterBookmarks = null;
let populateBookmarkFolders = null;
let showNotification = null;
let debounce = null;
let setupClearButton = null;

/**
 * Устанавливает зависимости для компонента закладок
 */
export function setBookmarksDependencies(deps) {
    isFavorite = deps.isFavorite;
    getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    showAddBookmarkModal = deps.showAddBookmarkModal;
    showBookmarkDetail = deps.showBookmarkDetail;
    showOrganizeFoldersModal = deps.showOrganizeFoldersModal;
    filterBookmarks = deps.filterBookmarks;
    populateBookmarkFolders = deps.populateBookmarkFolders;
    showNotification = deps.showNotification;
    debounce = deps.debounce;
    setupClearButton = deps.setupClearButton;
}

/**
 * Создает элемент закладки
 */
export function createBookmarkElement(bookmark, folderMap = {}, viewMode = 'cards') {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.dataset.id = bookmark.id;
    bookmarkElement.dataset.folder = bookmark.folder || '';

    // Обработчик клика для открытия деталей
    bookmarkElement.addEventListener('click', (e) => {
        if (e.target.closest('.bookmark-actions')) return;
        if (typeof showBookmarkDetail === 'function') {
            showBookmarkDetail(bookmark);
        }
    });

    // Обработчики действий
    bookmarkElement.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        switch (action) {
            case 'edit':
                e.stopPropagation();
                if (typeof showAddBookmarkModal === 'function') {
                    showAddBookmarkModal(bookmark.id);
                }
                break;
            case 'delete':
                e.stopPropagation();
                // Удаление будет обработано в главном файле
                if (typeof window.deleteBookmark === 'function') {
                    window.deleteBookmark(bookmark.id);
                }
                break;
            case 'move-to-archive':
            case 'restore-from-archive':
                e.stopPropagation();
                // Архивация будет обработана в главном файле
                if (typeof window.toggleBookmarkArchive === 'function') {
                    window.toggleBookmarkArchive(bookmark.id);
                }
                break;
            case 'view-screenshots':
                e.stopPropagation();
                // Просмотр скриншотов будет обработан в главном файле
                if (typeof window.showBookmarkScreenshots === 'function') {
                    window.showBookmarkScreenshots(bookmark.id);
                }
                break;
        }
    });

    const folderName = folderMap[bookmark.folder]?.name || 'Без папки';
    const folderBadgeHTML = bookmark.folder
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" title="Папка: ${escapeHtml(folderName)}">
            <i class="fas fa-folder mr-1 text-xs"></i>${escapeHtml(folderName)}
        </span>`
        : '';

    const urlHostnameHTML = bookmark.url
        ? `<span class="text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title="${escapeHtml(bookmark.url)}">
            <i class="fas fa-globe mr-1 opacity-75"></i>${escapeHtml(new URL(bookmark.url).hostname)}
        </span>`
        : '';

    const screenshotButtonHTML =
        bookmark.screenshotIds && bookmark.screenshotIds.length > 0
            ? `<button data-action="view-screenshots" class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Просмотреть скриншоты (${bookmark.screenshotIds.length})">
                <i class="fas fa-image fa-fw"></i>
            </button>`
            : '';

    const externalLinkIconHTML = bookmark.url
        ? `<a href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer" class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Открыть ссылку" onclick="event.stopPropagation()">
            <i class="fas fa-external-link-alt fa-fw"></i>
        </a>`
        : '';

    const isArchived = bookmark.folder === '__archive__';
    let archiveButtonHTML = '';
    if (isArchived) {
        archiveButtonHTML = `
            <button data-action="restore-from-archive" class="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Восстановить из архива">
                <i class="fas fa-undo fa-fw"></i>
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
    if (populateBookmarkFolders && typeof populateBookmarkFolders === 'function') {
        populateBookmarkFolders();
    }
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
