'use strict';

import { rankItems } from '../features/smart-search.js';
import { renderSearchHint } from '../features/search-hint.js';
import { escapeHtml, linkify, truncateText } from '../utils/html.js';
import {
    getAllFromIndexedDB,
    getAllFromIndexWithKeyVariants,
    getFromIndexedDB,
    saveToIndexedDB,
    forEachBatchInStore,
    countInIndexedDB,
    maxKeyInIndexedDB,
    getStoreVersion,
} from '../db/indexeddb.js';
import { createVirtualGrid, decorateCardForView } from '../utils/virtual-grid.js';
import {
    BOOKMARK_ACTION_FOCUS_VISIBLE_CLASS,
    BOOKMARK_CARD_ICON_BUTTON_CLASS,
    BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS,
    CARD_CONTAINER_CLASSES,
    LIST_CONTAINER_CLASSES,
    SECTION_GRID_COLS,
} from '../config.js';
import { ARCHIVE_FOLDER_ID, ARCHIVE_FOLDER_NAME } from '../constants.js';
import { SEED_FLAG, setSeedFlag, shouldSeedDefaults } from '../db/seed-flags.js';
import {
    updateSearchIndex,
    removeManyFromSearchIndex,
    bulkAddToSearchIndex,
} from '../features/search.js';
import { initBookmarksTools } from '../features/bookmarks-tools-ui.js';
import {
    bulkDeleteBookmarks,
    bulkSetBookmarksArchived,
} from '../features/bookmarks-bulk.js';
import { addRecentlyDeletedRecord } from '../features/recently-deleted.js';
import { State as GlobalState } from '../app/state.js';
import { recordStoreEntityHistoryAfterSave } from '../history/store-record-history.js';
import { refreshModalEntityHistoryToolbar } from '../history/modal-entity-history.js';
import {
    coerceTagsArray,
    parseSearchQueryTagsAndText,
    itemMatchesAllTags,
} from '../features/global-tags.js';
import {
    folderColorStyle,
    folderColorSortIndex,
    FOLDER_COLOR_SORT_ORDER,
    renderFolderColorPicker,
    setFolderColorInPicker,
    DEFAULT_FOLDER_COLOR,
} from '../utils/folder-colors.js';
import {
    attachModalBackdropWheelScroll,
    syncBodyScrollLockAfterModalClose,
} from '../ui/modals-manager.js';

// Цвета папок: палитра + произвольный #rrggbb (js/utils/folder-colors.js), отрисовка через --fc
function getFolderBadgeStyle(colorName) {
    return folderColorStyle(colorName);
}
function getFolderDotStyle(colorName) {
    return folderColorStyle(colorName);
}
const getFolderColorSortIndex = folderColorSortIndex;

// ============================================================================
// КОМПОНЕНТ РАБОТЫ С ЗАКЛАДКАМИ
// ============================================================================

// Зависимости будут установлены через setBookmarksDependencies
let isFavorite = null;
let getFavoriteButtonHTML = null;
let showAddBookmarkModal = null;
let _showBookmarkDetail = null;
let _showOrganizeFoldersModalDep = null;
let showNotification = null;
let debounce = null;
let setupClearButton = null;
let loadFoldersList = null;
let removeEscapeHandler = null;
let addEscapeHandler = null;
let handleSaveFolderSubmitDep = null;
let getAllFromIndex = null;
let State = null;
let showEditBookmarkModal = null;
let deleteBookmarkDep = null;
let showBookmarkDetailModal = null;
let _handleViewBookmarkScreenshotsDep = null;
let NotificationService = null;
let showScreenshotViewerModal = null;
let showAppConfirm = null;

/**
 * Устанавливает зависимости для компонента закладок
 */
export function setBookmarksDependencies(deps) {
    isFavorite = deps.isFavorite;
    getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    showAddBookmarkModal = deps.showAddBookmarkModal;
    _showBookmarkDetail = deps.showBookmarkDetail;
    _showOrganizeFoldersModalDep = deps.showOrganizeFoldersModal;
    showNotification = deps.showNotification;
    debounce = deps.debounce;
    setupClearButton = deps.setupClearButton;
    loadFoldersList = deps.loadFoldersList;
    removeEscapeHandler = deps.removeEscapeHandler;
    addEscapeHandler = deps.addEscapeHandler;
    handleSaveFolderSubmitDep = deps.handleSaveFolderSubmit;
    getAllFromIndex = deps.getAllFromIndex;
    State = deps.State;
    showEditBookmarkModal = deps.showEditBookmarkModal;
    deleteBookmarkDep = deps.deleteBookmark;
    showBookmarkDetailModal = deps.showBookmarkDetailModal;
    _handleViewBookmarkScreenshotsDep = deps.handleViewBookmarkScreenshots;
    NotificationService = deps.NotificationService;
    showScreenshotViewerModal = deps.showScreenshotViewerModal;
    // Не затирать showAppConfirm, если ключ не передан (entry.js / частичные deps).
    if (deps.showAppConfirm !== undefined) {
        showAppConfirm = deps.showAppConfirm;
    }
}

// ============================================================================
// КЭШ СПИСКА ЗАКЛАДОК, ВИРТУАЛИЗАЦИЯ И ВЫДЕЛЕНИЕ (большие базы: 20 000+)
// ============================================================================

const bmCache = {
    key: null,
    all: null,
    folders: null,
    folderMap: null,
    loading: null,
    loadingKey: null,
    scope: null,
    result: null,
};

/** Выделение (режим массовых операций). */
const bmSelection = { active: false, ids: new Set() };
/** @type {ReturnType<typeof createVirtualGrid> | null} */
let bmGrid = null;
let bmHadItems = false;
let bmFilterSeq = 0;
/** Текущий отрисованный (отфильтрованный) список — для «выбрать все». */
let bmCurrentList = [];

const bmCollator = new Intl.Collator('ru');
const bmSearchBlobCache = new WeakMap();
function bookmarkSearchFields(bm) {
    let f = bmSearchBlobCache.get(bm);
    if (!f) {
        f = {
            title: bm.title ? String(bm.title).toLowerCase() : '',
            desc: bm.description ? String(bm.description).toLowerCase() : '',
            url: bm.url ? String(bm.url).toLowerCase() : '',
        };
        bmSearchBlobCache.set(bm, f);
    }
    return f;
}

/** Сбросить кэш списка закладок (после внешних изменений). */
export function invalidateBookmarksCache() {
    bmCache.key = null;
    bmCache.all = null;
    bmCache.scope = null;
    bmCache.result = null;
}

/**
 * Снимок закладок и папок. Валидность — по версии записи хранилищ (performDBOperation)
 * и сигнатуре count+maxKey (ловит удаления/импорт в обход performDBOperation).
 */
async function getBookmarksSnapshot({ force = false } = {}) {
    const [c, m] = await Promise.all([
        countInIndexedDB('bookmarks'),
        maxKeyInIndexedDB('bookmarks'),
    ]);
    const key = `${getStoreVersion('bookmarks')}|${getStoreVersion('bookmarkFolders')}|${c}|${m}`;
    if (!force && bmCache.all && bmCache.key === key) return bmCache;
    if (!force && bmCache.loading && bmCache.loadingKey === key) return bmCache.loading;
    const p = (async () => {
        const all = [];
        await forEachBatchInStore(
            'bookmarks',
            (rows) => {
                for (const r of rows) all.push(r);
            },
            { batchSize: 5000 },
        );
        const folders = (await getAllFromIndexedDB('bookmarkFolders')) || [];
        const folderMap = {};
        for (const folder of folders) {
            if (folder && typeof folder.id !== 'undefined') folderMap[folder.id] = folder;
        }
        bmCache.all = all;
        bmCache.folders = folders;
        bmCache.folderMap = folderMap;
        bmCache.key = key;
        bmCache.scope = null;
        bmCache.result = null;
        return bmCache;
    })();
    bmCache.loading = p;
    bmCache.loadingKey = key;
    try {
        return await p;
    } finally {
        if (bmCache.loading === p) {
            bmCache.loading = null;
            bmCache.loadingKey = null;
        }
    }
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
        folderBadgeHTML = `
            <span class="folder-badge folder-chip inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap" style="${getFolderBadgeStyle(folder.color)}" title="Папка: ${escapeHtml(
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
    let fixedUrl = '';

    const listRow = viewMode !== 'cards';
    const listIconBtnClass = BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS;
    const listIconBtnFocusedClass = `${BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS} ${BOOKMARK_ACTION_FOCUS_VISIBLE_CLASS}`;
    const cardIconBtnClass = BOOKMARK_CARD_ICON_BUTTON_CLASS;

    if (bookmark.url) {
        fixedUrl = String(bookmark.url)
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
                   class="${listRow ? listIconBtnClass : cardIconBtnClass}"
                   title="Открыть ссылку"
                   aria-label="Открыть ссылку в новой вкладке">
                    <i class="fas fa-external-link-alt text-sm" aria-hidden="true"></i>
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
    if (cardClickOpensUrl && fixedUrl) {
        bookmarkElement.dataset.url = fixedUrl;
    }

    const screenshotIds = Array.isArray(bookmark.screenshotIds) ? bookmark.screenshotIds : [];
    const hasScreenshots = screenshotIds.length > 0;
    const shotCount = screenshotIds.length;
    const screenshotButtonHTML = hasScreenshots
        ? listRow
            ? `
        <button type="button" data-action="view-screenshots" class="${listIconBtnFocusedClass}" title="Изображения (${shotCount})" aria-label="Просмотреть изображения закладки, ${shotCount} шт.">
            <span class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400" aria-hidden="true"><i class="far fa-images text-xs"></i></span>
        </button>`
            : `
        <button type="button" data-action="view-screenshots" class="inline-flex h-9 min-w-[2.25rem] items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-2 text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/90 dark:hover:text-gray-100" title="Просмотреть изображения (${shotCount})" aria-label="Просмотреть изображения закладки, ${shotCount} шт.">
            <span class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400" aria-hidden="true"><i class="far fa-images text-xs"></i></span>
            <span class="hidden sm:inline text-xs font-medium tabular-nums">${shotCount}</span>
        </button>`
        : '';

    let archiveButtonHTML = '';
    if (bookmark.folder === ARCHIVE_FOLDER_ID) {
        archiveButtonHTML = `
            <button type="button" data-action="restore-from-archive" class="${
                listRow ? listIconBtnClass : cardIconBtnClass
            }" title="Восстановить из архива" aria-label="Восстановить из архива">
                <i class="fas fa-box-open text-sm" aria-hidden="true"></i>
            </button>`;
    } else {
        archiveButtonHTML = `
            <button type="button" data-action="move-to-archive" class="${
                listRow ? listIconBtnClass : cardIconBtnClass
            }" title="Переместить в архив" aria-label="Переместить в архив">
                <i class="fas fa-archive text-sm" aria-hidden="true"></i>
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
                  listRow ? 'bookmark-list' : 'default',
                  bookmark.url ? fixedUrl : '',
              )
            : '';

    const editDeleteClass = listRow ? listIconBtnFocusedClass : cardIconBtnClass;

    const actionsHTML = `
        <div class="bookmark-actions flex items-center ${listRow ? 'gap-1' : 'gap-0.5'} ${
            viewMode === 'cards'
                ? 'absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200'
                : 'flex-shrink-0 ml-auto pl-2'
        }">
            ${!listRow ? '' : folderBadgeHTML}
            ${favButtonHTML}
            ${screenshotButtonHTML}
            ${externalLinkIconHTML}
            ${archiveButtonHTML}
            <button type="button" data-action="edit" class="edit-bookmark ${editDeleteClass}" title="Редактировать" aria-label="Редактировать закладку">
                <i class="fas fa-edit text-sm" aria-hidden="true"></i>
            </button>
            <button type="button" data-action="delete" class="delete-bookmark ${editDeleteClass}" title="Удалить" aria-label="Удалить закладку">
                <i class="fas fa-trash text-sm" aria-hidden="true"></i>
            </button>
        </div>`;

    const safeTitle = escapeHtml(bookmark.title || 'Без названия');
    const safeDescription = escapeHtml(bookmark.description || '');
    const descriptionLinked = linkify(bookmark.description || '');
    const tagList = coerceTagsArray(bookmark.tags);
    const tagsChipsHtml =
        tagList.length > 0
            ? `<div class="bookmark-tags flex flex-wrap gap-1 mt-1.5" aria-label="Теги">${tagList
                  .map(
                      (t) =>
                          `<span class="inline-flex items-center rounded-full bg-primary/10 text-primary dark:bg-primary/20 px-2 py-0.5 text-[11px] font-medium">${escapeHtml(t)}</span>`,
                  )
                  .join('')}</div>`
            : '';

    if (viewMode === 'cards') {
        bookmarkElement.className =
            'bookmark-item view-item group relative cursor-pointer bg-white dark:bg-gray-700 transition-shadow duration-200 rounded-lg border border-gray-200 dark:border-gray-700 p-4';

        const descriptionHTML = descriptionLinked
            ? `<p class="bookmark-description text-gray-600 dark:text-gray-300 text-sm line-clamp-3" title="${safeDescription}">${descriptionLinked}</p>`
            : bookmark.url
              ? '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Нет описания</p>'
              : '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Текстовая заметка</p>';

        const mainContentHTML = `
            <div class="flex-grow min-w-0 mb-3 pt-10">
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 hover:text-primary dark:hover:text-primary transition-colors duration-200 truncate w-full" title="${safeTitle}">
                    ${safeTitle}
                </h3>
                ${descriptionHTML}
                ${tagsChipsHtml}
                <div class="bookmark-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2">
                    ${folderBadgeHTML}
                    <span class="text-gray-500 dark:text-gray-400" title="Добавлено: ${new Date(
                        bookmark.dateAdded || Date.now(),
                    ).toLocaleString('ru-RU')}">
                        <i class="far fa-clock mr-1 opacity-75"></i>${new Date(
                            bookmark.dateAdded || Date.now(),
                        ).toLocaleDateString('ru-RU')}
                    </span>
                    ${urlHostnameHTML}
                </div>
            </div>`;
        bookmarkElement.innerHTML = mainContentHTML + actionsHTML;
    } else {
        bookmarkElement.className =
            'bookmark-item view-item group relative cursor-pointer flex items-center p-content-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';

        const listIconHTML = bookmark.url
            ? `<span class="mr-3 flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200/90 bg-gray-50 text-gray-500 shadow-sm dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-400" aria-hidden="true" title="Закладка со ссылкой"><i class="fas fa-link text-xs"></i></span>`
            : `<span class="mr-3 flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-50/80 text-amber-700 shadow-sm dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400" aria-hidden="true" title="Текстовая заметка"><i class="fas fa-sticky-note text-xs"></i></span>`;

        const listDescContent = safeDescription
            ? linkify(truncateText(bookmark.description || '', 70))
            : bookmark.url
              ? (() => {
                    const u = String(bookmark.url).trim();
                    if (/^https?:\/\//i.test(u)) {
                        const safeHref = u.replace(/"/g, '&quot;');
                        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline truncate inline-block max-w-full" onclick="event.stopPropagation()">${escapeHtml(u)}</a>`;
                    }
                    return escapeHtml(u);
                })()
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
                    }">${listDescContent}</p>
                    ${tagsChipsHtml ? `<div class="mt-0.5">${tagsChipsHtml}</div>` : ''}
                </div>
            </div>`;
        bookmarkElement.innerHTML = mainContentHTML + actionsHTML;
    }
    return bookmarkElement;
}

/** Подсветка кнопок сортировки по текущему состоянию GlobalState.currentBookmarksSort. */
export function updateBookmarksSortButtons() {
    const baseClass =
        'h-9 px-3.5 leading-5 text-sm font-medium rounded-md transition inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm border';
    const inactiveClass = `${baseClass} border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600`;
    const activeClass = `${baseClass} border-transparent bg-primary text-white hover:bg-secondary`;
    const sortState = GlobalState.currentBookmarksSort || {
        criteria: 'date',
        direction: 'asc',
    };
    const criteriaToBtnId = {
        date: 'sortBookmarksByDate',
        title: 'sortBookmarksByTitle',
        folder: 'sortBookmarksByFolder',
    };
    ['date', 'title', 'folder'].forEach((criteria) => {
        const btn = document.getElementById(criteriaToBtnId[criteria]);
        if (!btn) return;
        btn.className = sortState.criteria === criteria ? activeClass : inactiveClass;
        const icon = btn.querySelector('.sort-icon');
        if (icon) {
            icon.className =
                sortState.criteria === criteria
                    ? `sort-icon fas ${sortState.direction === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up'} ml-1 w-3 opacity-100`
                    : 'sort-icon fas ml-1 w-3 opacity-0';
        }
    });
}

/**
 * Инициализирует систему закладок
 */
export function initBookmarkSystem() {
    console.log('Вызвана функция initBookmarkSystem.');
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const organizeBookmarksBtn = document.getElementById('organizeBookmarksBtn');
    const exportAllBookmarksBtn = document.getElementById('exportAllBookmarksToPdfBtn');
    const bookmarkSearchInput = document.getElementById('bookmarkSearchInput');
    const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');
    const bookmarksContainer = document.getElementById('bookmarksContainer');

    if (bookmarksContainer && !bookmarksContainer.dataset.clickHandlerAttached) {
        bookmarksContainer.addEventListener('click', handleBookmarkAction);
        bookmarksContainer.dataset.clickHandlerAttached = 'true';
        console.log(
            'Делегированный обработчик кликов для закладок привязан к #bookmarksContainer.',
        );
    }

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

    if (exportAllBookmarksBtn && !exportAllBookmarksBtn.dataset.listenerAttached) {
        exportAllBookmarksBtn.addEventListener('click', () => {
            if (typeof window.exportAllBookmarksToPdf === 'function') {
                window.exportAllBookmarksToPdf();
            } else if (typeof showNotification === 'function') {
                showNotification('Экспорт всех закладок в PDF недоступен.', 'error');
            }
        });
        exportAllBookmarksBtn.dataset.listenerAttached = 'true';
        console.log('Обработчик для exportAllBookmarksToPdfBtn добавлен в initBookmarkSystem.');
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

    const sortControls = document.getElementById('bookmarksSortControls');
    if (sortControls && !sortControls.dataset.sortHandlersAttached) {
        const updateBookmarksSortButtonsUI = updateBookmarksSortButtons;

        const handleBookmarksSortClick = (criteria) => {
            if (!GlobalState.currentBookmarksSort) {
                GlobalState.currentBookmarksSort = { criteria: 'date', direction: 'asc' };
            }
            if (GlobalState.currentBookmarksSort.criteria === criteria) {
                GlobalState.currentBookmarksSort.direction =
                    GlobalState.currentBookmarksSort.direction === 'desc' ? 'asc' : 'desc';
            } else {
                GlobalState.currentBookmarksSort.criteria = criteria;
                GlobalState.currentBookmarksSort.direction = 'asc';
            }
            updateBookmarksSortButtonsUI();
            if (typeof filterBookmarks === 'function') filterBookmarks();
        };

        const dateBtn = document.getElementById('sortBookmarksByDate');
        const titleBtn = document.getElementById('sortBookmarksByTitle');
        const folderBtn = document.getElementById('sortBookmarksByFolder');
        if (dateBtn) {
            dateBtn.addEventListener('click', () => handleBookmarksSortClick('date'));
        }
        if (titleBtn) {
            titleBtn.addEventListener('click', () => handleBookmarksSortClick('title'));
        }
        if (folderBtn) {
            folderBtn.addEventListener('click', () => handleBookmarksSortClick('folder'));
        }
        updateBookmarksSortButtonsUI();
        sortControls.dataset.sortHandlersAttached = 'true';
        console.log('Кнопки сортировки закладок инициализированы в initBookmarkSystem.');
    }

    initBookmarksTools({
        getSnapshot: getBookmarksToolsSnapshot,
        refresh: refreshBookmarksList,
        setSelectionMode: setBookmarksSelectionMode,
        isSelectionMode: isBookmarksSelectionMode,
        updateSortButtons: updateBookmarksSortButtons,
        removeFromIndex: removeManyFromSearchIndex,
        updateIndex: updateSearchIndex,
        reindexAfterMerge: async (removedIds, keepers) => {
            try {
                await removeManyFromSearchIndex('bookmarks', [
                    ...removedIds,
                    ...keepers.map((k) => k.id),
                ]);
                const snap = await getBookmarksToolsSnapshot();
                await bulkAddToSearchIndex(
                    'bookmarks',
                    keepers.filter((k) => k.folder !== ARCHIVE_FOLDER_ID),
                    (k) => {
                        const f = k.folder != null ? snap.folderMap[k.folder] : null;
                        return f && f.name ? { ...k, _folderNameForIndex: f.name } : k;
                    },
                );
            } catch (e) {
                console.warn('[bookmarks] переиндексация после слияния не удалась:', e);
            }
        },
        notify: (m, t) => typeof showNotification === 'function' && showNotification(m, t),
        confirm: (o) =>
            typeof showAppConfirm === 'function'
                ? showAppConfirm(o)
                : typeof window !== 'undefined' && typeof window.showAppConfirm === 'function'
                  ? window.showAppConfirm(o)
                  : Promise.resolve(confirm(o.message)),
    });

    populateBookmarkFolders();
    if (State && State.db) {
        loadBookmarks();
    } else {
        console.debug(
            '[initBookmarkSystem] БД ещё не готова, вызов loadBookmarks отложен (закладки подгрузятся после инициализации БД).',
        );
    }
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
 * Создает папки по умолчанию и примеры закладок, если их нет
 */
export async function loadBookmarks() {
    if (!GlobalState || !GlobalState.db) {
        console.debug(
            'loadBookmarks: База данных ещё не инициализирована. Загрузка закладок будет выполнена после готовности БД.',
        );
        await renderBookmarkFolders([]);
        await renderBookmarks([]);
        return false;
    }

    let folders = [];
    let bookmarks = [];
    let instructionsFolderId = null;
    let firstFolderId = null;

    try {
        folders = await getAllFromIndexedDB('bookmarkFolders');
        console.log(`loadBookmarks: Найдено ${folders?.length || 0} существующих папок.`);

        if (await shouldSeedDefaults(SEED_FLAG.BOOKMARK_FOLDERS, folders?.length || 0)) {
            console.log('Папки не найдены, создаем папки по умолчанию...');
            const defaultFoldersData = [
                { name: 'Общие', color: 'blue', dateAdded: new Date().toISOString() },
                { name: 'Важное', color: 'red', dateAdded: new Date().toISOString() },
                { name: 'Инструкции', color: 'green', dateAdded: new Date().toISOString() },
            ];

            const savedFolderIds = await Promise.all(
                defaultFoldersData.map((folder) => saveToIndexedDB('bookmarkFolders', folder)),
            );

            const createdFoldersWithIds = defaultFoldersData.map((folder, index) => ({
                ...folder,
                id: savedFolderIds[index],
            }));
            console.log('Папки по умолчанию созданы:', createdFoldersWithIds);

            if (typeof updateSearchIndex === 'function') {
                await Promise.all(
                    createdFoldersWithIds.map((folder) =>
                        updateSearchIndex('bookmarkFolders', folder.id, folder, 'add', null).catch(
                            (err) =>
                                console.error(
                                    `Ошибка индексации папки по умолчанию ${folder.id} ('${folder.name}'):`,
                                    err,
                                ),
                        ),
                    ),
                );
            }
            folders = createdFoldersWithIds;
            await setSeedFlag(SEED_FLAG.BOOKMARK_FOLDERS);
        }

        await renderBookmarkFolders(folders || []);

        if (folders && folders.length > 0) {
            const instructionsFolder = folders.find((f) => f.name === 'Инструкции');
            if (instructionsFolder) {
                instructionsFolderId = instructionsFolder.id;
            }
            firstFolderId = folders[0]?.id;
        }

        bookmarks = (await getBookmarksSnapshot({ force: true })).all;
        console.log(`loadBookmarks: Найдено ${bookmarks?.length || 0} существующих закладок.`);

        if (
            folders &&
            folders.length > 0 &&
            (await shouldSeedDefaults(SEED_FLAG.BOOKMARKS, bookmarks?.length || 0))
        ) {
            console.log('Закладки не найдены, создаем примеры закладок...');
            if (firstFolderId === null && folders.length > 0) {
                firstFolderId = folders[0].id;
            }

            const targetFolderIdForKB = instructionsFolderId ?? firstFolderId;

            const sampleBookmarksData = [
                {
                    title: 'База знаний КриптоПро',
                    url: 'https://support.cryptopro.ru/index.php?/Knowledgebase/List',
                    description: 'Официальная база знаний КриптоПро.',
                    folder: targetFolderIdForKB,
                    dateAdded: new Date().toISOString(),
                },
                {
                    title: 'База знаний Рутокен',
                    url: 'https://dev.rutoken.ru/',
                    description: 'Официальная база знаний Рутокен.',
                    folder: targetFolderIdForKB,
                    dateAdded: new Date().toISOString(),
                },
            ];

            const savedBookmarkIds = await Promise.all(
                sampleBookmarksData.map((bookmark) => saveToIndexedDB('bookmarks', bookmark)),
            );
            const bookmarksWithIds = sampleBookmarksData.map((bookmark, index) => ({
                ...bookmark,
                id: savedBookmarkIds[index],
            }));
            console.log('Примеры закладок созданы:', bookmarksWithIds);

            if (typeof updateSearchIndex === 'function') {
                await Promise.all(
                    bookmarksWithIds.map((bookmark) => {
                        if (bookmark.folder !== ARCHIVE_FOLDER_ID) {
                            return updateSearchIndex(
                                'bookmarks',
                                bookmark.id,
                                bookmark,
                                'add',
                                null,
                            ).catch((err) =>
                                console.error(
                                    `Ошибка индексации примера закладки ${bookmark.id} ('${bookmark.title}'):`,
                                    err,
                                ),
                            );
                        }
                        return Promise.resolve();
                    }),
                );
            }
            bookmarks = bookmarksWithIds;
            await setSeedFlag(SEED_FLAG.BOOKMARKS);
        }

        // Единый конвейер с фильтрацией: учитывает поиск, теги, папку и сортировку, не сбрасывая их
        const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');
        const bookmarkSearchInputEl = document.getElementById('bookmarkSearchInput');
        let initialBookmarksToRender = [];
        if (bookmarkFolderFilter && bookmarkSearchInputEl) {
            await filterBookmarks();
            initialBookmarksToRender = bmCurrentList;
        } else {
            const folderMap = (folders || []).reduce((map, folder) => {
                if (folder && typeof folder.id !== 'undefined') {
                    map[folder.id] = folder;
                }
                return map;
            }, {});
            initialBookmarksToRender = sortBookmarksList(
                (bookmarks || []).filter((bm) => bm.folder !== ARCHIVE_FOLDER_ID),
                folderMap,
                GlobalState.currentBookmarksSort || { criteria: 'date', direction: 'asc' },
            );
            await renderBookmarks(initialBookmarksToRender, folderMap);
        }

        console.log(
            `Загрузка закладок завершена. Загружено ${folders?.length || 0} папок и ${
                bookmarks?.length || 0
            } закладок (показано ${initialBookmarksToRender.length}).`,
        );
        return true;
    } catch (error) {
        console.error('Критическая ошибка при загрузке закладок или папок:', error);
        await renderBookmarkFolders([]);
        await renderBookmarks([]);
        if (typeof showNotification === 'function')
            showNotification('Критическая ошибка загрузки данных закладок.', 'error');
        return false;
    }
}

/**
 * Сортирует массив закладок по текущим настройкам (без мутации исходного массива).
 * @param {Array} bookmarks - массив закладок
 * @param {Object} folderMap - объект id папки -> { color, name, ... }
 * @param {{ criteria: string, direction: string }} sortState - currentBookmarksSort из State
 * @returns {Array} новый отсортированный массив
 */
/** Единая нормализация метки времени для сортировки (устойчиво к невалидным датам и типам). */
const bmTsCache = new WeakMap();
function bookmarkSortTimestamp(bookmark) {
    if (!bookmark || typeof bookmark !== 'object') return 0;
    // метка времени кэшируется на объекте: сортировка 20 000 записей не должна парсить даты на каждом сравнении
    let ts = bmTsCache.get(bookmark);
    if (ts === undefined) {
        const raw = bookmark.dateAdded ?? bookmark.dateUpdated ?? 0;
        const ms = new Date(raw).getTime();
        ts = Number.isFinite(ms) ? ms : 0;
        bmTsCache.set(bookmark, ts);
    }
    return ts;
}

const bmTitleKeyCache = new WeakMap();
function bookmarkTitleSortKey(b) {
    let k = bmTitleKeyCache.get(b);
    if (k === undefined) {
        k = (b.title || '').trim().toLowerCase();
        bmTitleKeyCache.set(b, k);
    }
    return k;
}

function sortBookmarksList(bookmarks, folderMap = {}, sortState = {}) {
    if (!bookmarks || bookmarks.length === 0) return [...(bookmarks || [])];
    const criteria = sortState.criteria || 'date';
    const direction = sortState.direction || 'asc';
    const mult = direction === 'desc' ? -1 : 1;

    const list = bookmarks.filter((b) => b && typeof b === 'object');
    return [...list].sort((a, b) => {
        if (criteria === 'date') {
            const tsA = bookmarkSortTimestamp(a);
            const tsB = bookmarkSortTimestamp(b);
            if (tsA !== tsB) return (tsA - tsB) * mult;
            return (a.id || 0) - (b.id || 0);
        }
        if (criteria === 'title') {
            const titleA = bookmarkTitleSortKey(a);
            const titleB = bookmarkTitleSortKey(b);
            const cmp = bmCollator.compare(titleA, titleB);
            if (cmp !== 0) return cmp * mult;
            return (a.id || 0) - (b.id || 0);
        }
        if (criteria === 'folder') {
            const folderA = a.folder != null ? folderMap[a.folder] : null;
            const folderB = b.folder != null ? folderMap[b.folder] : null;
            const colorA =
                folderA && folderA.color
                    ? getFolderColorSortIndex(folderA.color)
                    : FOLDER_COLOR_SORT_ORDER.length;
            const colorB =
                folderB && folderB.color
                    ? getFolderColorSortIndex(folderB.color)
                    : FOLDER_COLOR_SORT_ORDER.length;
            if (colorA !== colorB) return (colorA - colorB) * mult;
            const nameA = (folderA && folderA.name) || '';
            const nameB = (folderB && folderB.name) || '';
            const cmp = bmCollator.compare(nameA, nameB);
            if (cmp !== 0) return cmp * mult;
            return (a.id || 0) - (b.id || 0);
        }
        return 0;
    });
}

function ensureBookmarksStatusEl(container) {
    let el = document.getElementById('bookmarksListStatus');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bookmarksListStatus';
        el.className = 'vg-status';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.hidden = true;
        container.parentNode.insertBefore(el, container);
    }
    return el;
}

function setBookmarksStatus(container, shown, total, filtered) {
    const el = ensureBookmarksStatusEl(container);
    if (!shown) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = '';
    const nf = (n) => n.toLocaleString('ru-RU');
    const txt = document.createElement('span');
    txt.textContent =
        filtered && total > shown
            ? `Показано ${nf(shown)} из ${nf(total)} закладок`
            : `Закладок: ${nf(shown)}`;
    el.appendChild(txt);
    if (filtered && total > shown) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Сбросить фильтры';
        b.addEventListener('click', () => {
            const si = document.getElementById('bookmarkSearchInput');
            const ff = document.getElementById('bookmarkFolderFilter');
            if (si) si.value = '';
            if (ff) ff.value = '';
            document.getElementById('clearBookmarkSearchBtn')?.classList.add('hidden');
            void filterBookmarks();
        });
        el.appendChild(b);
    }
}

function destroyBookmarksGrid() {
    if (bmGrid) {
        bmGrid.destroy();
        bmGrid = null;
    }
}

function buildBookmarkNode(bookmark, folderMap, mode) {
    const el = createBookmarkElement(bookmark, folderMap, mode);
    if (!el) return null;
    decorateCardForView(el, mode);
    if (bmSelection.active) {
        const selected = bmSelection.ids.has(bookmark.id);
        el.classList.toggle('vg-selected', selected);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'vg-select-box';
        cb.checked = selected;
        cb.dataset.action = 'toggle-select';
        cb.setAttribute('aria-label', `Выбрать закладку «${bookmark.title || 'без названия'}»`);
        el.appendChild(cb);
    }
    return el;
}

/**
 * Рендерит закладки в контейнере (виртуализированно: в DOM только видимые карточки).
 * @param {object[]} bookmarks
 * @param {Object} folderMap
 * @param {{ keepScroll?: boolean, total?: number, filtered?: boolean }} [ropts]
 */
export async function renderBookmarks(bookmarks, folderMap = {}, ropts = {}) {
    let container = document.getElementById('bookmarksContainer');
    if (!container) {
        await new Promise((r) => requestAnimationFrame(r));
        container = document.getElementById('bookmarksContainer');
    }
    if (!container) {
        console.error('[renderBookmarks] Контейнер #bookmarksContainer не найден.');
        return;
    }

    if (!bookmarks || bookmarks.length === 0) {
        destroyBookmarksGrid();
        bmCurrentList = [];
        bmHadItems = false;
        container.innerHTML = ropts.filtered
            ? '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full mb-2">По вашему запросу закладок не найдено.</p>'
            : '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full mb-2">Закладок пока нет.</p>';
        setBookmarksStatus(container, 0, 0, false);
        updateBookmarksBulkBar();
        return;
    }

    // Режим отображения из сохранённых настроек, чтобы не было рассинхрона (список выбран — отображаются карточки)
    const viewMode =
        (State && State.viewPreferences && State.viewPreferences['bookmarksContainer']) ||
        container.dataset.defaultView ||
        'cards';

    // Применение классов контейнера в соответствии с выбранным видом
    container.className =
        viewMode === 'cards' ? CARD_CONTAINER_CLASSES.join(' ') : LIST_CONTAINER_CLASSES.join(' ');
    if (viewMode === 'cards') {
        const gridCols = SECTION_GRID_COLS.bookmarksContainer || SECTION_GRID_COLS.default;
        if (gridCols && gridCols.length) gridCols.forEach((cls) => container.classList.add(cls));
    }
    container.dataset.view = viewMode === 'list' ? 'list' : 'cards';

    const valid = [];
    for (const bookmark of bookmarks) {
        if (!bookmark || typeof bookmark !== 'object' || bookmark.id == null) {
            console.warn('[renderBookmarks] Пропуск невалидной закладки:', bookmark);
            continue;
        }
        valid.push(bookmark);
    }
    bmCurrentList = valid;

    destroyBookmarksGrid();
    container.textContent = '';
    bmGrid = createVirtualGrid({
        container,
        renderItem: (bm, _i, mode) => buildBookmarkNode(bm, folderMap, mode),
        getViewMode: () => (container.dataset.view === 'list' ? 'list' : 'cards'),
        estimateRowHeight: (m) => (m === 'list' ? 84 : 200),
    });
    bmGrid.setItems(valid, { keepScroll: !!ropts.keepScroll, animate: !bmHadItems });
    bmHadItems = true;

    // Применение текущего вида (если функция доступна) — кнопки переключателя и классы контейнера
    if (typeof window.applyCurrentView === 'function') {
        window.applyCurrentView('bookmarksContainer');
    }
    setBookmarksStatus(
        container,
        valid.length,
        ropts.total ?? valid.length,
        !!ropts.filtered,
    );
    updateBookmarksBulkBar();
}

// ============================================================================
// МАССОВЫЕ ОПЕРАЦИИ (выделение, удаление/архив пачкой)
// ============================================================================

function ensureBookmarksBulkBar() {
    const container = document.getElementById('bookmarksContainer');
    if (!container || !container.parentNode) return null;
    let bar = document.getElementById('bookmarksBulkBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'bookmarksBulkBar';
        bar.className = 'vg-bulkbar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Массовые операции с закладками');
        bar.hidden = true;
        bar.innerHTML =
            '<span class="vg-bulk-count" aria-live="polite"></span>' +
            '<button type="button" data-bulk="all">Выбрать все</button>' +
            '<button type="button" data-bulk="none">Снять выбор</button>' +
            '<button type="button" data-bulk="archive">В архив</button>' +
            '<button type="button" data-bulk="delete" class="vg-danger">Удалить</button>' +
            '<button type="button" data-bulk="done">Готово</button>';
        bar.addEventListener('click', (ev) => {
            const b = ev.target.closest('button[data-bulk]');
            if (b) void handleBookmarksBulkAction(b.dataset.bulk);
        });
        const status = document.getElementById('bookmarksListStatus');
        container.parentNode.insertBefore(bar, status || container);
    }
    return bar;
}

function updateBookmarksBulkBar() {
    const bar = ensureBookmarksBulkBar();
    if (!bar) return;
    bar.hidden = !bmSelection.active;
    if (!bmSelection.active) return;
    const n = bmSelection.ids.size;
    const cnt = bar.querySelector('.vg-bulk-count');
    if (cnt) {
        cnt.textContent = n
            ? `Выбрано: ${n.toLocaleString('ru-RU')} из ${bmCurrentList.length.toLocaleString('ru-RU')}`
            : 'Нажмите на карточки, чтобы выбрать';
    }
    bar.querySelectorAll('[data-bulk="delete"],[data-bulk="archive"],[data-bulk="none"]').forEach(
        (b) => {
            b.disabled = n === 0;
            b.style.opacity = n === 0 ? '0.5' : '';
        },
    );
}

/** Включить/выключить режим выделения закладок. */
export function setBookmarksSelectionMode(on) {
    bmSelection.active = !!on;
    if (!on) bmSelection.ids.clear();
    const btn = document.getElementById('bookmarksSelectModeBtn');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    void filterBookmarks({ keepScroll: true });
}

export function isBookmarksSelectionMode() {
    return bmSelection.active;
}

async function handleBookmarksBulkAction(kind) {
    if (kind === 'all') {
        for (const b of bmCurrentList) bmSelection.ids.add(b.id);
        void filterBookmarks({ keepScroll: true });
        return;
    }
    if (kind === 'none') {
        bmSelection.ids.clear();
        void filterBookmarks({ keepScroll: true });
        return;
    }
    if (kind === 'done') {
        setBookmarksSelectionMode(false);
        return;
    }
    const ids = Array.from(bmSelection.ids);
    if (!ids.length) return;
    const confirmModal =
        typeof showAppConfirm === 'function'
            ? showAppConfirm
            : typeof window !== 'undefined' && typeof window.showAppConfirm === 'function'
              ? window.showAppConfirm
              : null;
    try {
        if (kind === 'delete') {
            const message = `Удалить выбранные закладки (${ids.length.toLocaleString('ru-RU')})? Они будут перемещены в «Недавно удалённые» — оттуда их можно восстановить. Скриншоты закладок сохранятся для восстановления.`;
            const ok = confirmModal
                ? await confirmModal({
                      title: 'Удаление закладок',
                      message,
                      confirmText: 'Удалить',
                      cancelText: 'Отмена',
                      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
                  })
                : confirm(message);
            if (!ok) return;
            const res = await bulkDeleteBookmarks(ids, {
                removeFromIndex: removeManyFromSearchIndex,
            });
            bmSelection.ids.clear();
            invalidateBookmarksCache();
            if (typeof showNotification === 'function') {
                showNotification(
                    `Удалено закладок: ${res.deleted.toLocaleString('ru-RU')}. Восстановить можно в «Недавно удалённые».`,
                    res.failed ? 'warning' : 'success',
                );
            }
        } else if (kind === 'archive') {
            const res = await bulkSetBookmarksArchived(ids, true, {
                updateIndex: updateSearchIndex,
                removeFromIndex: removeManyFromSearchIndex,
            });
            bmSelection.ids.clear();
            invalidateBookmarksCache();
            if (typeof showNotification === 'function') {
                showNotification(`В архив перемещено: ${res.changed.toLocaleString('ru-RU')}`, 'success');
            }
        }
    } catch (e) {
        console.error('[bookmarks bulk] ошибка массовой операции:', e);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка массовой операции: ' + (e?.message || e), 'error');
        }
    }
    await filterBookmarks({ keepScroll: true, force: true });
}

/** Перерисовать список (после внешних изменений закладок) с сохранением прокрутки. */
export function refreshBookmarksList(opts = {}) {
    if (opts.force) invalidateBookmarksCache();
    return filterBookmarks({ keepScroll: opts.keepScroll !== false, force: !!opts.force });
}

/** Данные для инструментов закладок (дубликаты, сохранённые фильтры). */
export async function getBookmarksToolsSnapshot() {
    const snap = await getBookmarksSnapshot();
    return { all: snap.all, folders: snap.folders, folderMap: snap.folderMap };
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
        tags: form.elements.bookmarkTags ? form.elements.bookmarkTags.value.trim() : '',
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
 * Фильтрует и отображает закладки по поисковому запросу и папке.
 * Данные берутся из кэша; запрос, продолжающий предыдущий, сужает прежний результат;
 * устаревшие вызовы отбрасываются.
 * @param {Event|{keepScroll?: boolean, force?: boolean}} [arg]
 */
export async function filterBookmarks(arg) {
    const opts = arg && typeof arg === 'object' && !('target' in arg) ? arg : {};
    const searchInput = document.getElementById('bookmarkSearchInput');
    const folderFilter = document.getElementById('bookmarkFolderFilter');

    if (!searchInput || !folderFilter) {
        console.error('filterBookmarks: Search input or folder filter not found.');
        renderBookmarks([], {});
        return;
    }
    const seq = ++bmFilterSeq;

    const rawSearch = searchInput.value.trim();
    const { textQuery, tagFilters } = parseSearchQueryTagsAndText(rawSearch);
    const searchValue = textQuery.toLowerCase();
    const selectedFolderValue = folderFilter.value;
    const sortState = GlobalState.currentBookmarksSort || {
        criteria: 'date',
        direction: 'asc',
    };

    try {
        const snap = await getBookmarksSnapshot({ force: !!opts.force });
        if (seq !== bmFilterSeq) return;
        const { all: allBookmarks, folderMap } = snap;

        // Область (папка) — кэшируется на версию снимка
        const scopeKey = `${snap.key}|${selectedFolderValue}`;
        let scopeList;
        if (bmCache.scope && bmCache.scope.key === scopeKey) {
            scopeList = bmCache.scope.list;
        } else {
            if (selectedFolderValue === '') {
                scopeList = allBookmarks.filter((bm) => bm.folder !== ARCHIVE_FOLDER_ID);
            } else if (selectedFolderValue === ARCHIVE_FOLDER_ID) {
                scopeList = allBookmarks.filter((bm) => bm.folder === ARCHIVE_FOLDER_ID);
            } else {
                // Должно совпадать с loadBookmarks: id папки в БД может быть числом или строкой (импорт),
                // value у <option> всегда строка — строгое сравнение с parseInt давало пустой список.
                scopeList = allBookmarks.filter(
                    (bm) =>
                        String(bm.folder) === String(selectedFolderValue) &&
                        bm.folder !== ARCHIVE_FOLDER_ID,
                );
            }
            bmCache.scope = { key: scopeKey, list: scopeList };
        }

        const sortKey = `${sortState.criteria || 'date'}:${sortState.direction || 'asc'}`;
        const baseKey = `${scopeKey}|${JSON.stringify(tagFilters)}|${sortKey}`;
        let sortedToDisplay;
        let searchInfo = null;
        const prev = bmCache.result;
        if (prev && prev.baseKey === baseKey && prev.search === searchValue) {
            sortedToDisplay = prev.list;
        } else {
            let source = scopeList;
            if (tagFilters.length > 0) {
                source = source.filter((bm) => itemMatchesAllTags(bm, tagFilters));
            }
            let list = source;
            if (searchValue) {
                // «Умный» поиск: словоформы, синонимы предметной области, опечатки, неверная раскладка.
                // Порядок (сортировка) остаётся пользовательским; релевантность отбирает кандидатов.
                const ranked = rankItems(
                    source,
                    searchValue,
                    (bm) => {
                        const f = bookmarkSearchFields(bm);
                        return [{ text: f.title, weight: 3 }, { text: f.desc, weight: 1.5 }, f.url];
                    },
                    { cacheKey: 'bookmarks' },
                );
                // при поиске порядок — по релевантности (точные совпадения выше «близких по смыслу»)
                list = ranked.items;
                searchInfo = {
                    suggestion: ranked.suggestion,
                    semantic: Math.max(0, ranked.items.length - ranked.exactCount),
                    total: ranked.items.length,
                };
            }
            sortedToDisplay = searchValue ? list : sortBookmarksList(list, folderMap, sortState);
            bmCache.result = { baseKey, search: searchValue, list: sortedToDisplay, info: searchInfo };
        }
        if (prev && prev.baseKey === baseKey && prev.search === searchValue) searchInfo = prev.info || null;
        renderSearchHint(
            'bookmarkSearchHint',
            document.getElementById('bookmarksContainer'),
            document.getElementById('bookmarkSearchInput'),
            searchValue ? searchInfo : null,
        );

        if (seq !== bmFilterSeq) return;
        const filtered = !!searchValue || tagFilters.length > 0 || selectedFolderValue !== '';
        await renderBookmarks(sortedToDisplay, folderMap, {
            keepScroll: !!opts.keepScroll,
            total: allBookmarks.filter((bm) => bm.folder !== ARCHIVE_FOLDER_ID).length,
            filtered,
        });

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
    const color = colorInput?.value ?? DEFAULT_FOLDER_COLOR;

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

        if (isEditing && oldData) {
            try {
                const newFromDb = await getFromIndexedDB('bookmarkFolders', finalId);
                await recordStoreEntityHistoryAfterSave({
                    storeName: 'bookmarkFolders',
                    recordId: finalId,
                    oldRecord: oldData,
                    newRecord: newFromDb,
                });
            } catch (histErr) {
                console.warn('[bookmarks folder] entity history:', histErr);
            }
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
        setFolderColorInPicker(folderForm, 'folderColor', DEFAULT_FOLDER_COLOR);

        const modal = document.getElementById('foldersModal');
        if (modal) {
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            syncBodyScrollLockAfterModalClose();
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

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'foldersModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[min(90vh,720px)] flex flex-col overflow-hidden">
                    <div class="folders-modal-body p-6 overflow-y-auto min-h-0 overscroll-y-contain flex-1">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold">Управление папками</h2>
                            <div class="flex items-center gap-1">
                            <button type="button" id="foldersModalUndoBtn" disabled class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Предыдущая сохранённая версия (Ctrl+Shift+U)" aria-label="Откат к предыдущей сохранённой версии"><i class="fas fa-undo" aria-hidden="true"></i></button>
                            <button type="button" id="foldersModalRedoBtn" disabled class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Следующая сохранённая версия (Ctrl+Shift+R)" aria-label="Повтор отменённой версии"><i class="fas fa-redo" aria-hidden="true"></i></button>
                            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                            </div>
                        </div>
                        
                        <div id="foldersList" class="mb-4">
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
                                ${renderFolderColorPicker('folderColor', DEFAULT_FOLDER_COLOR)}
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
        attachModalBackdropWheelScroll(modal, '.folders-modal-body');

        modal.addEventListener('click', (e) => {
            if (e.target.closest('.close-modal')) {
                e.preventDefault();
                e.stopPropagation();
                modal.classList.add('hidden');
                if (typeof removeEscapeHandler === 'function') {
                    removeEscapeHandler(modal);
                }
                syncBodyScrollLockAfterModalClose();

                const form = modal.querySelector('#folderForm');
                if (form && form.dataset.editingId) {
                    form.reset();
                    delete form.dataset.editingId;
                    const submitButton = form.querySelector('#folderSubmitBtn');
                    if (submitButton) submitButton.textContent = 'Добавить папку';
                    setFolderColorInPicker(form, 'folderColor', DEFAULT_FOLDER_COLOR);
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
        setFolderColorInPicker(form, 'folderColor', DEFAULT_FOLDER_COLOR);
    }

    const foldersListElement = modal.querySelector('#foldersList');
    if (foldersListElement && typeof loadFoldersList === 'function') {
        loadFoldersList(foldersListElement);
    } else {
        console.error(
            'Не найден элемент #foldersList в модальном окне папок или loadFoldersList недоступна.',
        );
    }

    if (modal && typeof addEscapeHandler === 'function') {
        addEscapeHandler(modal);
    } else if (modal) {
        console.warn('[showOrganizeFoldersModal] addEscapeHandler function not found.');
    }

    attachModalBackdropWheelScroll(modal, '.folders-modal-body');

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    refreshModalEntityHistoryToolbar('foldersModal').catch(() => {});
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

        const confirmedFolderDelete = showAppConfirm
            ? await showAppConfirm({
                  title: 'Удаление папки',
                  message: confirmationMessage,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : confirm(confirmationMessage);
        if (!confirmedFolderDelete) {
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

        if (folderToDelete) {
            await addRecentlyDeletedRecord({
                storeName: 'bookmarkFolders',
                entityId: folderId,
                payload: folderToDelete,
                reason: shouldDeleteBookmarks ? 'delete_folder_with_content' : 'delete_folder',
            });
        }
        if (
            shouldDeleteBookmarks &&
            Array.isArray(bookmarksInFolder) &&
            bookmarksInFolder.length > 0
        ) {
            await Promise.all(
                bookmarksInFolder.map((bookmark) =>
                    addRecentlyDeletedRecord({
                        storeName: 'bookmarks',
                        entityId: bookmark.id,
                        payload: bookmark,
                        reason: 'delete_by_folder_remove',
                        context: { folderId },
                    }),
                ),
            );
        }

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

            const dotStyle = getFolderDotStyle(folder.color);

            folderItem.innerHTML = `
                <div class="flex items-center flex-grow min-w-0 mr-2">
                    <span class="folder-dot w-4 h-4 rounded-full mr-2 flex-shrink-0" style="${dotStyle}"></span>
                    <span class="truncate" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</span>
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
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const simpleDeleteMessage = `Вы уверены, что хотите удалить папку "${folder.name}"? Закладки в ней не будут удалены, но потеряют привязку к папке.`;
                    const allowDelete = showAppConfirm
                        ? await showAppConfirm({
                              title: 'Удаление папки',
                              message: simpleDeleteMessage,
                              confirmText: 'Удалить',
                              cancelText: 'Отмена',
                              confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
                          })
                        : confirm(simpleDeleteMessage);
                    if (allowDelete) {
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
                            setFolderColorInPicker(form, 'folderColor', folderData.color);
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

    // Режим выделения: клик по карточке/чекбоксу переключает выбор, действия карточки не выполняются
    if (bmSelection.active && !target.closest('button[data-action], a[data-action]')) {
        const selId = parseInt(bookmarkItem.dataset.id, 10);
        if (!isNaN(selId)) {
            const cb = bookmarkItem.querySelector('.vg-select-box');
            const isCb = target.classList && target.classList.contains('vg-select-box');
            const want = isCb ? target.checked : !bmSelection.ids.has(selId);
            if (want) bmSelection.ids.add(selId);
            else bmSelection.ids.delete(selId);
            bookmarkItem.classList.toggle('vg-selected', want);
            if (cb) cb.checked = want;
            if (!isCb) event.preventDefault();
            updateBookmarksBulkBar();
        }
        return;
    }

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
        const titleEl = bookmarkItem.querySelector('h3');
        const title =
            (titleEl?.textContent || titleEl?.title || '').trim() || `закладку с ID ${bookmarkId}`;
        const confirmModal =
            typeof showAppConfirm === 'function'
                ? showAppConfirm
                : typeof window !== 'undefined' && typeof window.showAppConfirm === 'function'
                  ? window.showAppConfirm
                  : null;
        const confirmed = confirmModal
            ? await confirmModal({
                  title: 'Удаление закладки',
                  message: `Вы уверены, что хотите удалить закладку «${title}»? Связанные скриншоты будут удалены вместе с ней. Восстановить запись можно через раздел «Недавно удалённые».`,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : confirm(
                  `Вы уверены, что хотите удалить закладку "${title}"? Связанные скриншоты также будут удалены.`,
              );
        if (confirmed) {
            if (typeof deleteBookmarkDep === 'function') {
                await deleteBookmarkDep(bookmarkId);
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
                ? bookmarkItem.dataset.url || bookmarkItem.querySelector('a[href^="http"]')?.href
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
    let originalContent;

    if (button) {
        originalContent = button.innerHTML;
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

        const allParentScreenshots = await getAllFromIndexWithKeyVariants(
            'screenshots',
            'parentId',
            bookmarkId,
        );

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
