'use strict';

// ============================================================================
// ИМПОРТЫ ИЗ МОДУЛЕЙ
// ============================================================================
import {
    DB_NAME,
    DB_VERSION,
    CURRENT_SCHEMA_VERSION,
    CATEGORY_INFO_KEY,
    SEDO_CONFIG_KEY,
    BLACKLIST_WARNING_ACCEPTED_KEY,
    USER_PREFERENCES_KEY,
    ARCHIVE_FOLDER_ID,
    ARCHIVE_FOLDER_NAME,
    MAX_REFS_PER_WORD,
    MAX_UPDATE_VISIBLE_TABS_RETRIES,
    MIN_TOKEN_LEN_FOR_INDEX,
    FAVORITES_STORE_NAME,
    CLIENT_NOTES_MIN_FONT_SIZE,
    CLIENT_NOTES_MAX_FONT_SIZE,
    CLIENT_NOTES_FONT_SIZE_STEP,
    TELEFONY_DOC_ID,
    SHABLONY_DOC_ID,
    EXT_LINKS_MIGRATION_KEY,
    MAIN_ALGO_COLLAPSE_KEY,
    TIMER_STATE_KEY,
    DIALOG_WATCHDOG_TIMEOUT_NEW,
    CACHE_TTL,
    FIELD_WEIGHTS,
    DEFAULT_WELCOME_CLIENT_NOTES_TEXT,
} from './js/constants.js';

import { categoryDisplayInfo as categoryDisplayInfoImported, tabsConfig, allPanelIdsForDefault, defaultPanelOrder } from './js/config.js';

// Создаём мутабельную копию categoryDisplayInfo для совместимости со старым кодом
let categoryDisplayInfo = { ...categoryDisplayInfoImported };

import { escapeHtml, escapeHTML, normalizeBrokenEntities, decodeBasicEntitiesOnce, truncateText, highlightText, highlightTextInString, highlightElement, highlightTextInElement, linkify as linkifyModule } from './js/utils/html.js';

import { escapeRegExp, base64ToBlob, formatExampleForTextarea, getSectionName, getStepContentAsText, debounce, deepEqual as deepEqualModule, setupClearButton as setupClearButtonModule } from './js/utils/helpers.js';

import { setClipboardDependencies, copyToClipboard as copyToClipboardModule } from './js/utils/clipboard.js';

import {
    hexToRgb as hexToRgbModule,
    rgbToHex as rgbToHexModule,
    rgbToHsb as rgbToHsbModule,
    hsbToRgb as hsbToRgbModule,
    hexToHsl as hexToHslModule,
    hslToHex as hslToHexModule,
    getLuminance as getLuminanceModule,
    adjustHsl as adjustHslModule,
    calculateSecondaryColor as calculateSecondaryColorModule,
} from './js/utils/color.js';

import {
    setModalDependencies,
    openAnimatedModal as openAnimatedModalModule,
    closeAnimatedModal as closeAnimatedModalModule,
} from './js/utils/modal.js';

import { 
    initDB, 
    getAllFromIndexedDB, 
    performDBOperation, 
    saveToIndexedDB, 
    getFromIndexedDB, 
    deleteFromIndexedDB, 
    clearIndexedDBStore, 
    getAllFromIndex 
} from './js/db/indexeddb.js';

import { storeConfigs } from './js/db/stores.js';

import { 
    addToFavoritesDB, 
    removeFromFavoritesDB, 
    isFavoriteDB, 
    getAllFavoritesDB, 
    clearAllFavoritesDB, 
    loadInitialFavoritesCache 
} from './js/db/favorites.js';

import { NotificationService } from './js/services/notification.js';

import { ExportService, setLoadingOverlayManager } from './js/services/export.js';

import { State } from './js/app/state.js';

import {
    setTheme as setThemeModule,
    migrateLegacyThemeVars as migrateLegacyThemeVarsModule,
    applyThemeOverrides as applyThemeOverridesModule,
} from './js/components/theme.js';

// Timer System
import {
    initTimerSystem,
    toggleTimer,
    resetTimer,
    adjustTimerDuration,
    showAppNotification,
    requestAppNotificationPermission
} from './js/features/timer.js';

// PDF Attachment System
import {
    isPdfFile,
    setupPdfDragAndDrop,
    addPdfRecords,
    getPdfsForParent,
    downloadPdfBlob,
    mountPdfSection,
    renderPdfAttachmentsSection,
    initPdfAttachmentSystem,
    attachAlgorithmAddPdfHandlers,
    attachBookmarkPdfHandlers
} from './js/features/pdf-attachments.js';

// Google Docs Integration
import {
    initGoogleDocSections,
    loadAndRenderGoogleDoc,
    renderGoogleDocContent,
    fetchGoogleDocs,
    handleTelefonySearch,
    handleShablonySearch,
    parseShablonyContent,
    renderPhoneDirectoryTable
} from './js/features/google-docs.js';

// SEDO System
import {
    DEFAULT_SEDO_DATA,
    initSedoTypesSystem,
    toggleSedoEditMode,
    renderSedoTypesContent,
    saveSedoChanges,
    loadSedoData,
    filterSedoData,
    handleSedoSearch,
    highlightAndScrollSedoItem
} from './js/features/sedo.js';

// Search System
import {
    initSearchSystem,
    performSearch,
    executeSearch,
    renderSearchResults,
    handleSearchResultClick,
    tokenize,
    sanitizeQuery,
    getAlgorithmText,
    getTextForItem,
    addToSearchIndex,
    removeFromSearchIndex,
    updateSearchIndex,
    updateSearchIndexForItem,
    checkAndBuildIndex,
    buildInitialSearchIndex,
    cleanAndRebuildSearchIndex,
    setSearchDependencies,
    debouncedSearch,
    getCachedResults,
    cacheResults,
    expandQueryWithSynonyms,
    searchWithRegex,
    debug_checkIndex,
} from './js/features/search.js';

// Algorithm Components
import {
    setAlgorithmsDependencies,
    createStepElementHTML,
    normalizeAlgorithmSteps,
    initStepSorting as initStepSortingModule,
    addEditStep as addEditStepModule,
    extractStepsDataFromEditForm as extractStepsDataFromEditFormModule,
    addNewStep as addNewStepModule,
    getCurrentEditState as getCurrentEditStateModule,
    getCurrentAddState as getCurrentAddStateModule,
    hasChanges as hasChangesModule,
    captureInitialEditState as captureInitialEditStateModule,
    captureInitialAddState as captureInitialAddStateModule,
    resetInitialEditState,
    resetInitialAddState,
} from './js/components/algorithms.js';

// Reglaments Components
import {
    setReglamentsDependencies,
    populateReglamentCategoryDropdowns as populateReglamentCategoryDropdownsModule,
    loadReglaments as loadReglamentsModule,
    getAllReglaments as getAllReglamentsModule,
    getReglamentsByCategory as getReglamentsByCategoryModule,
    createCategoryElement as createCategoryElementModule,
    renderReglamentCategories as renderReglamentCategoriesModule,
    showReglamentsForCategory as showReglamentsForCategoryModule,
    handleReglamentAction as handleReglamentActionModule,
    deleteReglamentFromList as deleteReglamentFromListModule,
    showReglamentDetail as showReglamentDetailModule,
    showAddReglamentModal as showAddReglamentModalModule,
    editReglament as editReglamentModule,
    initReglamentsSystem as initReglamentsSystemModule,
} from './js/components/reglaments.js';

// Bookmark Components
import {
    restoreBookmarkFromArchive,
    moveBookmarkToArchive,
    getCurrentBookmarkFormState,
    setBookmarksDependencies,
    filterBookmarks as filterBookmarksModule,
    populateBookmarkFolders as populateBookmarkFoldersModule,
    initBookmarkSystem as initBookmarkSystemModule,
    getAllBookmarks as getAllBookmarksModule,
    loadBookmarks as loadBookmarksModule,
    renderBookmarks as renderBookmarksModule,
    createBookmarkElement as createBookmarkElementModule,
    renderBookmarkFolders as renderBookmarkFoldersModule,
    handleSaveFolderSubmit as handleSaveFolderSubmitModule,
    showOrganizeFoldersModal as showOrganizeFoldersModalModule,
    handleDeleteBookmarkFolderClick as handleDeleteBookmarkFolderClickModule,
    loadFoldersListInContainer as loadFoldersListModule,
    handleBookmarkAction as handleBookmarkActionModule,
    handleViewBookmarkScreenshots as handleViewBookmarkScreenshotsModule,
} from './js/components/bookmarks.js';

// External Links Components
import {
    getAllExtLinks,
    createExtLinkElement as createExtLinkElementModule,
    renderExtLinks as renderExtLinksModule,
    setExtLinksDependencies,
} from './js/components/ext-links.js';

// Favorites System
import {
    setFavoritesDependencies,
    initFavoritesSystem,
    toggleFavorite as toggleFavoriteModule,
    updateFavoriteStatusUI as updateFavoriteStatusUIModule,
    renderFavoritesPage as renderFavoritesPageModule,
    getFavoriteButtonHTML as getFavoriteButtonHTMLModule,
    handleFavoriteContainerClick as handleFavoriteContainerClickModule,
    handleFavoriteActionClick as handleFavoriteActionClickModule,
    isFavorite as isFavoriteModule,
    refreshAllFavoritableSectionsUI as refreshAllFavoritableSectionsUIModule,
} from './js/features/favorites.js';

// CIB Links System
import {
    setCibLinksDependencies,
    initCibLinkSystem as initCibLinkSystemModule,
    initCibLinkModal as initCibLinkModalModule,
    showAddEditCibLinkModal as showAddEditCibLinkModalModule,
    handleLinkActionClick as handleLinkActionClickModule,
    loadCibLinks as loadCibLinksModule,
    getAllCibLinks as getAllCibLinksModule,
    renderCibLinks as renderCibLinksModule,
    handleCibLinkSubmit as handleCibLinkSubmitModule,
    deleteCibLink as deleteCibLinkModule,
} from './js/features/cib-links.js';

// Blacklist System
import {
    setBlacklistDependencies,
    initBlacklistSystem as initBlacklistSystemModule,
    loadBlacklistedClients as loadBlacklistedClientsModule,
    handleBlacklistSearchInput as handleBlacklistSearchInputModule,
    renderBlacklistTable as renderBlacklistTableModule,
    sortAndRenderBlacklist as sortAndRenderBlacklistModule,
    exportBlacklistToExcel as exportBlacklistToExcelModule,
    handleBlacklistActionClick as handleBlacklistActionClickModule,
    showBlacklistDetailModal as showBlacklistDetailModalModule,
    showBlacklistEntryModal as showBlacklistEntryModalModule,
    handleSaveBlacklistEntry as handleSaveBlacklistEntryModule,
    deleteBlacklistEntry as deleteBlacklistEntryModule,
    showBlacklistWarning as showBlacklistWarningModule,
    addBlacklistEntryDB as addBlacklistEntryDBModule,
    getBlacklistEntryDB as getBlacklistEntryDBModule,
    updateBlacklistEntryDB as updateBlacklistEntryDBModule,
    deleteBlacklistEntryDB as deleteBlacklistEntryDBModule,
    getAllBlacklistEntriesDB as getAllBlacklistEntriesDBModule,
    getBlacklistEntriesByInn as getBlacklistEntriesByInnModule,
    isInnBlacklisted as isInnBlacklistedModule,
    checkForBlacklistedInn as checkForBlacklistedInnModule,
} from './js/features/blacklist.js';

// Import/Export System
import {
    setImportExportDependencies,
    clearTemporaryThumbnailsFromContainer as clearTemporaryThumbnailsFromContainerModule,
    importBookmarks as importBookmarksModule,
    importReglaments as importReglamentsModule,
    performForcedBackup as performForcedBackupModule,
    handleImportFileChange as handleImportFileChangeModule,
    handleImportButtonClick as handleImportButtonClickModule,
    exportAllData as exportAllDataModule,
    _processActualImport as _processActualImportModule,
} from './js/features/import-export.js';

// Screenshots System
import {
    setScreenshotsDependencies,
    showScreenshotViewerModal as showScreenshotViewerModalModule,
    renderScreenshotThumbnails as renderScreenshotThumbnailsModule,
    renderScreenshotList as renderScreenshotListModule,
    handleViewScreenshotClick as handleViewScreenshotClickModule,
    attachScreenshotHandlers as attachScreenshotHandlersModule,
    renderTemporaryThumbnail as renderTemporaryThumbnailModule,
    handleImageFileForStepProcessing as handleImageFileForStepProcessingModule,
    renderScreenshotIcon as renderScreenshotIconModule,
    processImageFile as processImageFileModule,
    attachBookmarkScreenshotHandlers as attachBookmarkScreenshotHandlersModule,
    renderExistingThumbnail as renderExistingThumbnailModule,
} from './js/features/screenshots.js';

// Lightbox System
import {
    setLightboxDependencies,
    showImageAtIndex as showImageAtIndexModule,
    openLightbox as openLightboxModule,
} from './js/features/lightbox.js';

// Tabs Overflow System
import {
    setTabsOverflowDependencies,
    updateVisibleTabs as updateVisibleTabsModule,
    setupTabsOverflow as setupTabsOverflowModule,
    handleMoreTabsBtnClick as handleMoreTabsBtnClickModule,
    clickOutsideTabsHandler as clickOutsideTabsHandlerModule,
    handleTabsResize as handleTabsResizeModule,
} from './js/features/tabs-overflow.js';

// Tabs UI Components
import {
    setTabsDependencies,
    createTabButtonElement as createTabButtonElementModule,
    ensureTabPresent as ensureTabPresentModule,
} from './js/components/tabs.js';

// Client Data System
import {
    setClientDataDependencies,
    saveClientData as saveClientDataModule,
    getClientData as getClientDataModule,
    exportClientDataToTxt as exportClientDataToTxtModule,
    loadClientData as loadClientDataModule,
    clearClientData as clearClientDataModule,
} from './js/features/client-data.js';

// Step Management System
import {
    setStepManagementDependencies,
    toggleStepCollapse as toggleStepCollapseModule,
    updateStepNumbers as updateStepNumbersModule,
    attachStepDeleteHandler as attachStepDeleteHandlerModule,
} from './js/features/step-management.js';

// App Reload System
import {
    setAppReloadDependencies,
    forceReloadApp as forceReloadAppModule,
    initReloadButton as initReloadButtonModule,
} from './js/features/app-reload.js';

// Employee Extension System
import {
    setEmployeeExtensionDependencies,
    loadEmployeeExtension as loadEmployeeExtensionModule,
    saveEmployeeExtension as saveEmployeeExtensionModule,
    updateExtensionDisplay as updateExtensionDisplayModule,
    setupExtensionFieldListeners as setupExtensionFieldListenersModule,
} from './js/features/employee-extension.js';

import {
    setBackgroundImageDependencies,
    applyCustomBackgroundImage as applyCustomBackgroundImageModule,
    removeCustomBackgroundImage as removeCustomBackgroundImageModule,
    setupBackgroundImageControls as setupBackgroundImageControlsModule,
} from './js/features/background-image.js';

// ============================================================================
// ЭКСПОРТ СЕРВИСОВ В WINDOW (для совместимости со старым кодом)
// ============================================================================
// Экспортируем сервисы в window для глобального доступа
window.NotificationService = NotificationService;
window.ExportService = ExportService;

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================
// db теперь в State.db - используем State.db напрямую
// userPreferences теперь в State.userPreferences - используем State.userPreferences напрямую
// Все глобальные переменные теперь в State - используем State.* напрямую

const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
if (showFavoritesHeaderButton && !showFavoritesHeaderButton.dataset.listenerAttached) {
    showFavoritesHeaderButton.addEventListener('click', () => setActiveTab('favorites'));
    showFavoritesHeaderButton.dataset.listenerAttached = 'true';
}

// Все эти переменные теперь в State - используем State.* напрямую
// originalUISettings, State.currentPreviewSettings, State.isUISettingsDirty, State.uiModalState
// State.clientNotesInputHandler, State.clientNotesKeydownHandler, State.clientNotesSaveTimeout
// State.clientNotesCtrlClickHandler, State.clientNotesCtrlKeyDownHandler, State.clientNotesCtrlKeyUpHandler, State.clientNotesBlurHandler
// State.isTabsOverflowCheckRunning, State.tabsOverflowCheckCount, State.updateVisibleTabsRetryCount, State.tabsResizeTimeout
// State.sedoFullscreenEscapeHandler
// State.blacklistEntryModalInstance, State.currentBlacklistWarningOverlay, State.allBlacklistEntriesCache, State.currentBlacklistSearchQuery, State.currentBlacklistSort
// State.isExportOperationInProgress, State.isExpectingExportFileDialog, State.exportDialogInteractionComplete, State.exportWatchdogTimerId, State.exportWindowFocusHandlerInstance
// State.importDialogInteractionComplete
// State.activeEditingUnitElement, State.timerElements, State.initialBookmarkFormState
// State.isExpectingFileDialog, State.windowFocusHandlerInstance
// State.lastKnownInnCounts, State.activeToadNotifications, State.extLinkCategoryInfo

// currentFavoritesCache теперь в State.currentFavoritesCache
// Используем State.currentFavoritesCache напрямую - заменяем все присваивания на State.currentFavoritesCache

// State.googleDocTimestamps и State.timestampUpdateInterval теперь в State

// FIELD_WEIGHTS и DEFAULT_WELCOME_CLIENT_NOTES_TEXT теперь импортируются из constants.js

// ensureNotificationIconlessStyles теперь в NotificationService (services/notification.js)
// Оставляем функцию для совместимости
function ensureNotificationIconlessStyles() {
    // Функция теперь в NotificationService, но оставляем заглушку для совместимости
    // Импортированный NotificationService уже содержит эту логику
}

// NotificationService теперь импортируется из services/notification.js
// Дубликат кода NotificationService был удален (было ~440 строк дублирующего кода)
// Весь функционал доступен через импортированный модуль из services/notification.js

// ExportService теперь импортируется из services/export.js
// Оставляем вызов init() для инициализации
ExportService.init();

const UNIFIED_FULLSCREEN_MODAL_CLASSES = {
    modal: ['p-0'],
    innerContainer: [
        'w-screen',
        'h-screen',
        'max-w-none',
        'max-h-none',
        'rounded-none',
        'shadow-none',
    ],
    contentArea: ['h-full', 'max-h-full', 'p-6'],
};

const algorithmDetailModalConfig = {
    modalId: 'algorithmModal',
    buttonId: 'toggleFullscreenViewBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4', 'sm:p-6', 'md:p-8'],
            innerContainer: ['max-w-7xl', 'rounded-lg', 'shadow-xl'],
            contentArea: ['max-h-[calc(90vh-150px)]', 'p-content'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#algorithmSteps',
};

const bookmarkModalConfigGlobal = {
    modalId: 'bookmarkModal',
    buttonId: 'toggleFullscreenBookmarkBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-2xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-content', 'overflow-y-auto', 'flex-1', 'min-h-0'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea, 'flex', 'flex-col'],
        },
    },
    innerContainerSelector: '.modal-inner-container',
    contentAreaSelector: '.modal-content-area',
};

const editAlgorithmModalConfig = {
    modalId: 'editModal',
    buttonId: 'toggleFullscreenEditBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-5xl', 'max-h-[95vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-content'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea, 'flex', 'flex-col'],
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '.p-content.overflow-y-auto.flex-1',
};

const addAlgorithmModalConfig = {
    modalId: 'addModal',
    buttonId: 'toggleFullscreenAddBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-content', 'bg-gray-100', 'dark:bg-gray-700'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
                'flex',
                'flex-col',
                'bg-gray-100',
                'dark:bg-gray-700',
            ],
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '.p-content.overflow-y-auto.flex-1',
};

const reglamentDetailModalConfig = {
    modalId: 'reglamentDetailModal',
    buttonId: 'toggleFullscreenReglamentDetailBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['w-[95%]', 'max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: UNIFIED_FULLSCREEN_MODAL_CLASSES,
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#reglamentDetailContent',
};

const reglamentModalConfigGlobal = {
    modalId: 'reglamentModal',
    buttonId: 'toggleFullscreenReglamentBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['w-[95%]', 'max-w-5xl', 'h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea, 'flex', 'flex-col'],
        },
    },
    innerContainerSelector: '.modal-inner-container',
    contentAreaSelector: '.modal-content-area',
};

const bookmarkDetailModalConfigGlobal = {
    modalId: 'bookmarkDetailModal',
    buttonId: 'toggleFullscreenBookmarkDetailBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-3xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#bookmarkDetailOuterContent',
};

const hotkeysModalConfig = {
    modalId: 'hotkeysModal',
    buttonId: 'toggleFullscreenHotkeysBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-3xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '.p-6.overflow-y-auto.flex-1',
};

const getVisibleModals = () =>
    Array.from(document.querySelectorAll('div.fixed.inset-0.bg-black.bg-opacity-50:not(.hidden)'));

const SAVE_BUTTON_SELECTORS =
    'button[type="submit"], #saveAlgorithmBtn, #createAlgorithmBtn, #saveCibLinkBtn, #saveBookmarkBtn, #saveExtLinkBtn';

function hasBlockingModalsOpen() {
    const modals = getVisibleModals();
    return modals.some((modal) => {
        try {
            if (modal.classList.contains('hidden')) return false;
            const hasFormWithSubmit = !!modal.querySelector('form button[type="submit"]');
            const hasKnownSaveButton = !!modal.querySelector(SAVE_BUTTON_SELECTORS);
            const explicitlyProtected = modal.dataset.protectUnload === 'true';
            return hasFormWithSubmit || hasKnownSaveButton || explicitlyProtected;
        } catch (e) {
            console.warn('beforeunload: ошибка проверки модального окна:', e);
            return false;
        }
    });
}

window.addEventListener('beforeunload', (event) => {
    if (hasBlockingModalsOpen()) {
        event.preventDefault();
        event.returnValue = '';
    }
});

const getTopmostModal = (modals) => {
    if (!modals || modals.length === 0) return null;
    return modals.reduce((top, current) => {
        if (!top) return current;
        const topZ = parseInt(window.getComputedStyle(top).zIndex, 10) || 0;
        const currentZ = parseInt(window.getComputedStyle(current).zIndex, 10) || 0;
        return currentZ >= topZ ? current : top;
    }, modals[0]);
};

// storeConfigs теперь импортируется из db/stores.js

let algorithms = {
    main: {
        id: 'main',
        title: 'Главный алгоритм работы (значения можно редактировать под ваши нужды)',
        steps: [
            {
                title: 'Приветствие',
                description:
                    'Обозначьте клиенту, куда он дозвонился, представьтесь, поприветствуйте клиента.',
                example:
                    'Техническая поддержка сервиса 1С-Отчетность, меня зовут Сиреневый_Турбобульбулькиватель. Здравствуйте!',
                isCopyable: true,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
            {
                title: 'Уточнение ИНН',
                description:
                    'Запросите ИНН организации для идентификации клиента в системе и дальнейшей работы.',
                example: 'Назовите, пожалуйста, ИНН организации.',
                type: 'inn_step',
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
            {
                title: 'Идентификация проблемы',
                description:
                    'Выясните суть проблемы, задавая уточняющие вопросы. Важно выяснить как можно больше деталей для составления полной картины.',
                example: {
                    type: 'list',
                    intro: 'Примеры вопросов:',
                    items: [
                        'Уточните, пожалуйста, полный текст ошибки.',
                        'При каких действиях возникает ошибка?',
                    ],
                },
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
            {
                title: 'Решение проблемы',
                description:
                    'Четко для себя определите категорию (направление) проблемы и перейдите к соответствующему разделу в помощнике (либо статье на track.astral.ru) с инструкциями по решению.',
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
        ],
    },
    program: [],
    skzi: [],
    lk1c: [],
    webReg: [],
};

const loadingOverlayManager = {
    overlayElement: null,
    styleElement: null,
    animationRunner: null,
    isSpawning: false,
    spawnProgress: 0,
    spawnDuration: 1500,
    spawnStartTime: 0,
    fadeOutDuration: 500,
    currentProgressValue: 0,

    createAndShow() {
        // Пытаемся использовать существующий оверлей из HTML
        const existingOverlay = document.getElementById('custom-loading-overlay');
        const existingStyles = document.getElementById('custom-loading-overlay-styles');
        
        if (existingOverlay) {
            this.overlayElement = existingOverlay;
            this.styleElement = existingStyles;
            console.log('Using existing overlay from HTML.');
            this.updateProgress(0, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
        } else if (this.overlayElement && document.body.contains(this.overlayElement)) {
            console.log('Custom loading overlay already exists. Resetting progress and text.');
            this.updateProgress(0, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
            if (this.animationRunner && !this.animationRunner.isRunning) {
                this.animationRunner.start();
            }
            return;
        } else {
            // Создаём новый оверлей если не найден
            console.log('Creating new overlay dynamically.');
            
            const overlayHTML = `
            <canvas id="loadingCanvas"></canvas>
            <div class="loading-text" id="loadingText">Загрузка<span id="animated-dots"></span></div>
            <div class="progress-indicator-container">
                <div class="progress-bar-line-track">
                    <div class="progress-bar-line" id="progressBarLine"></div>
                </div>
                <div class="progress-percentage-text" id="progressPercentageText">0%</div>
            </div>
            `;

            this.overlayElement = document.createElement('div');
            this.overlayElement.id = 'custom-loading-overlay';
            this.overlayElement.innerHTML = overlayHTML;

            this.overlayElement.style.position = 'fixed';
            this.overlayElement.style.top = '0';
            this.overlayElement.style.left = '0';
            this.overlayElement.style.width = '100%';
            this.overlayElement.style.height = '100%';
            this.overlayElement.style.zIndex = '99999';
            this.overlayElement.style.backgroundColor = '#0a0a1a';
            this.overlayElement.style.display = 'flex';
            this.overlayElement.style.justifyContent = 'center';
            this.overlayElement.style.alignItems = 'center';

            document.body.appendChild(this.overlayElement);
        }

        this.isSpawning = true;
        this.spawnStartTime = performance.now();
        this.spawnProgress = 0;

        const canvas = this.overlayElement.querySelector('#loadingCanvas');
        if (canvas) {
            const { startAnimation, stopAnimation, resizeHandler } =
                this._encapsulateAnimationScript(canvas, this);
            this.animationRunner = {
                start: startAnimation,
                stop: stopAnimation,
                resize: resizeHandler,
                isRunning: false,
            };
            this.animationRunner.start();
            this.animationRunner.isRunning = true;
            window.addEventListener('resize', this.animationRunner.resize);
        } else {
            console.error('Canvas элемент #loadingCanvas не найден в созданном оверлее!');
        }

        this.updateProgress(0, 'Загрузка');
        console.log(
            'Custom loading overlay with progress bar (re-positioned loading text) created and shown.',
        );
    },

    async hideAndDestroy() {
        console.log(
            '[loadingOverlayManager.hideAndDestroy ASYNC V3] Начало скрытия и уничтожения.',
        );
        if (this.animationRunner) {
            if (typeof this.animationRunner.stop === 'function') {
                this.animationRunner.stop();
            }
            if (typeof this.animationRunner.resize === 'function') {
                window.removeEventListener('resize', this.animationRunner.resize);
            }
            this.animationRunner.isRunning = false;
            console.log(
                '[loadingOverlayManager.hideAndDestroy ASYNC V3] Анимация остановлена, слушатель resize удален.',
            );
        }

        const overlayPromise = new Promise((resolve) => {
            if (this.overlayElement && document.body.contains(this.overlayElement)) {
                this.overlayElement.style.opacity = '0';
                console.log(
                    '[loadingOverlayManager.hideAndDestroy ASYNC V3] Установлена прозрачность 0, ожидание анимации.',
                );

                const currentOverlayElement = this.overlayElement;

                setTimeout(() => {
                    if (document.body.contains(currentOverlayElement)) {
                        currentOverlayElement.remove();
                        console.log(
                            '[loadingOverlayManager.hideAndDestroy ASYNC V3] Элемент оверлея удален из DOM.',
                        );
                    }
                    if (this.overlayElement === currentOverlayElement) {
                        this.overlayElement = null;
                    }
                    resolve();
                }, this.fadeOutDuration);
            } else {
                console.log(
                    '[loadingOverlayManager.hideAndDestroy ASYNC V3] Оверлей не существует или не в DOM, разрешаем промис немедленно.',
                );
                if (this.overlayElement) this.overlayElement = null;
                resolve();
            }
        });

        if (this.styleElement && document.head.contains(this.styleElement)) {
            this.styleElement.remove();
            this.styleElement = null;
            console.log('[loadingOverlayManager.hideAndDestroy ASYNC V3] Элемент стилей удален.');
        }

        this.animationRunner = null;
        this.isSpawning = false;
        this.spawnProgress = 0;
        this.currentProgressValue = 0;

        await overlayPromise;
        console.log('[loadingOverlayManager.hideAndDestroy ASYNC V3] Процесс полностью завершен.');
    },

    updateProgress(percentage, message = null) {
        if (!this.overlayElement) {
            return;
        }

        const progressBarLine = this.overlayElement.querySelector('#progressBarLine');
        const progressPercentageText = this.overlayElement.querySelector('#progressPercentageText');
        const loadingTextElement = this.overlayElement.querySelector('#loadingText');

        const p = Math.max(0, Math.min(100, parseFloat(percentage) || 0));
        this.currentProgressValue = p;

        if (progressBarLine) {
            progressBarLine.style.width = `${p}%`;
        }
        if (progressPercentageText) {
            progressPercentageText.textContent = `${Math.round(p)}%`;
        }

        if (message && loadingTextElement) {
            const animatedDotsSpan = loadingTextElement.querySelector('#animated-dots');
            if (
                loadingTextElement.firstChild &&
                loadingTextElement.firstChild.nodeType === Node.TEXT_NODE
            ) {
                loadingTextElement.firstChild.nodeValue = message;
            } else {
                const textNode = document.createTextNode(message);
                if (animatedDotsSpan) {
                    loadingTextElement.insertBefore(textNode, animatedDotsSpan);
                } else {
                    loadingTextElement.textContent = '';
                    loadingTextElement.appendChild(textNode);
                }
            }
            if (animatedDotsSpan && !loadingTextElement.contains(animatedDotsSpan)) {
                loadingTextElement.appendChild(animatedDotsSpan);
            }
        }
    },

    _encapsulateAnimationScript(canvasElement, manager) {
        let localAnimationFrameId = null;
        const ctx = canvasElement.getContext('2d');
        let width_anim, height_anim, centerX_anim, centerY_anim;
        let particles_anim = [];
        let globalTime_anim = 0;
        let rotationX_anim = 0;
        let rotationY_anim = 0;

        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const config_anim = {
            particleCount: 2000,
            sphereBaseRadius: 4,
            focalLength: 250,
            rotationSpeedX: 0.0003,
            rotationSpeedY: 0.002,
            breathAmplitude: 0.09,
            breathSpeed: 0.01,
            petalCount: 15,
            petalStrength: 0.2,
            baseParticleMinSize: 0.5,
            baseParticleMaxSize: 1,
            colorPalette: [
                [140, 70, 200, 1],
                [170, 90, 220, 0.9],
                [110, 50, 180, 0.9],
                [190, 100, 230, 0.95],
                [100, 100, 230, 1],
                [70, 70, 190, 0.95],
                [220, 150, 240, 0.85],
            ],
            backgroundColor: 'rgba(0, 0, 0, 0)',
            spawnIndigoColor: [75, 0, 130],
            spawnGlowBaseIntensity: 0.8,
            spawnGlowRadiusFactorBase: 2.0,
            spawnGlowRadiusFactorExtra: 3.0,
        };

        class Particle_anim {
            constructor() {
                const u = Math.random();
                const v = Math.random();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                this.baseR_factor = 0.75 + Math.random() * 0.25;
                const petalModulation =
                    1 +
                    config_anim.petalStrength *
                        Math.sin(phi) *
                        Math.cos(
                            config_anim.petalCount * theta +
                                Math.PI / (Math.random() > 0.5 ? 2 : 1),
                        );
                const effectiveR_factor = this.baseR_factor * petalModulation;
                this.x0 = effectiveR_factor * Math.sin(phi) * Math.cos(theta);
                this.y0 = effectiveR_factor * Math.sin(phi) * Math.sin(theta);
                this.z0 = effectiveR_factor * Math.cos(phi);
                const colorData =
                    config_anim.colorPalette[
                        Math.floor(Math.random() * config_anim.colorPalette.length)
                    ];
                this.color_r = colorData[0];
                this.color_g = colorData[1];
                this.color_b = colorData[2];
                this.baseAlphaMultiplier = colorData[3];
                this.baseSize =
                    config_anim.baseParticleMinSize +
                    Math.random() *
                        (config_anim.baseParticleMaxSize - config_anim.baseParticleMinSize);
                this.noiseAmp = 0.03 + Math.random() * 0.04;
                this.noiseFreq = 0.005 + Math.random() * 0.01;
                this.noisePhaseX = Math.random() * Math.PI * 2;
                this.noisePhaseY = Math.random() * Math.PI * 2;
                this.noisePhaseZ = Math.random() * Math.PI * 2;
                this.screenX = 0;
                this.screenY = 0;
                this.projectedSize = 0;
                this.alphaFactor = 0;
                this.depth = 0;
                this.currentDisplaySize = 0;
            }

            projectAndTransform(currentSphereRadius, breathPulse, spawnProgress) {
                const timeBasedNoisePhase = globalTime_anim * this.noiseFreq;
                const dX = Math.sin(this.noisePhaseX + timeBasedNoisePhase) * this.noiseAmp;
                const dY = Math.cos(this.noisePhaseY + timeBasedNoisePhase) * this.noiseAmp;
                const dZ = Math.sin(this.noisePhaseZ + timeBasedNoisePhase) * this.noiseAmp;
                let x = this.x0 + dX;
                let y = this.y0 + dY;
                let z = this.z0 + dZ;
                let tempX_rotY = x * Math.cos(rotationY_anim) - z * Math.sin(rotationY_anim);
                let tempZ_rotY = x * Math.sin(rotationY_anim) + z * Math.cos(rotationY_anim);
                x = tempX_rotY;
                z = tempZ_rotY;
                let tempY_rotX = y * Math.cos(rotationX_anim) - z * Math.sin(rotationX_anim);
                let tempZ_rotX = y * Math.sin(rotationX_anim) + z * Math.cos(rotationX_anim);
                y = tempY_rotX;
                z = tempZ_rotX;
                const dynamicSphereRadius =
                    currentSphereRadius * (1 + breathPulse * config_anim.breathAmplitude);
                const perspectiveFactor =
                    config_anim.focalLength /
                    (config_anim.focalLength - z * dynamicSphereRadius * 0.8);
                this.screenX = centerX_anim + x * dynamicSphereRadius * perspectiveFactor;
                this.screenY = centerY_anim + y * dynamicSphereRadius * perspectiveFactor;
                const normalizedDepth = z;
                this.projectedSize = Math.max(
                    0.1,
                    this.baseSize * perspectiveFactor * ((normalizedDepth + 1.2) / 2.2),
                );
                this.alphaFactor = Math.max(
                    0.1,
                    Math.min(1, ((normalizedDepth + 1.5) / 2.5) * this.baseAlphaMultiplier),
                );
                this.depth = z;
                const easedSpawnProgress = easeOutCubic(spawnProgress);
                this.currentDisplaySize = this.projectedSize * easedSpawnProgress;
            }

            draw(spawnProgress) {
                const easedSpawnProgress = easeOutCubic(spawnProgress);
                if (this.currentDisplaySize <= 0.15) return;
                const mainAlpha = this.alphaFactor * easedSpawnProgress;
                if (mainAlpha <= 0.02) return;
                const mainSize = this.currentDisplaySize;

                const haloLayers = [
                    { sizeFactor: 3.5, alphaFactor: 0.15, innerStop: 0.1, outerStop: 0.75 },
                    { sizeFactor: 2.2, alphaFactor: 0.25, innerStop: 0.15, outerStop: 0.85 },
                ];
                for (const layer of haloLayers) {
                    const haloSize = mainSize * layer.sizeFactor;
                    const haloAlpha = mainAlpha * layer.alphaFactor;
                    if (haloAlpha <= 0.01 || haloSize <= 0.2) continue;
                    const gradient = ctx.createRadialGradient(
                        this.screenX,
                        this.screenY,
                        haloSize * layer.innerStop,
                        this.screenX,
                        this.screenY,
                        haloSize,
                    );
                    gradient.addColorStop(
                        0,
                        `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${haloAlpha})`,
                    );
                    gradient.addColorStop(
                        layer.outerStop,
                        `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${
                            haloAlpha * 0.5
                        })`,
                    );
                    gradient.addColorStop(
                        1,
                        `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, 0)`,
                    );
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(this.screenX, this.screenY, haloSize, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (spawnProgress < 1.0) {
                    const indigoGlowIntensity =
                        (1 - easedSpawnProgress) * config_anim.spawnGlowBaseIntensity;
                    if (indigoGlowIntensity > 0.01) {
                        const indigoGlowRadius =
                            mainSize *
                            (config_anim.spawnGlowRadiusFactorBase +
                                (1 - easedSpawnProgress) * config_anim.spawnGlowRadiusFactorExtra);
                        const [ir, ig, ib] = config_anim.spawnIndigoColor;
                        const indigoGradient = ctx.createRadialGradient(
                            this.screenX,
                            this.screenY,
                            indigoGlowRadius * 0.1,
                            this.screenX,
                            this.screenY,
                            indigoGlowRadius,
                        );
                        indigoGradient.addColorStop(
                            0,
                            `rgba(${ir}, ${ig}, ${ib}, ${indigoGlowIntensity})`,
                        );
                        indigoGradient.addColorStop(
                            0.6,
                            `rgba(${ir}, ${ig}, ${ib}, ${indigoGlowIntensity * 0.3})`,
                        );
                        indigoGradient.addColorStop(1, `rgba(${ir}, ${ig}, ${ib}, 0)`);
                        ctx.fillStyle = indigoGradient;
                        ctx.beginPath();
                        ctx.arc(this.screenX, this.screenY, indigoGlowRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                ctx.fillStyle = `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${mainAlpha})`;
                ctx.beginPath();
                ctx.arc(this.screenX, this.screenY, mainSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const setupCanvas_anim = () => {
            const dpr = window.devicePixelRatio || 1;
            width_anim = window.innerWidth;
            height_anim = window.innerHeight;
            canvasElement.width = width_anim * dpr;
            canvasElement.height = height_anim * dpr;
            ctx.resetTransform();
            ctx.scale(dpr, dpr);
            centerX_anim = width_anim / 2;
            centerY_anim = height_anim / 2;
            config_anim.sphereBaseRadius = Math.min(width_anim, height_anim) * 0.22;
        };

        const init_anim = () => {
            setupCanvas_anim();
            particles_anim = [];
            for (let i = 0; i < config_anim.particleCount; i++) {
                particles_anim.push(new Particle_anim());
            }
        };

        const animate_anim = () => {
            globalTime_anim++;
            rotationX_anim += config_anim.rotationSpeedX;
            rotationY_anim += config_anim.rotationSpeedY;
            ctx.fillStyle = config_anim.backgroundColor;
            ctx.clearRect(0, 0, width_anim, height_anim);

            if (manager.isSpawning && manager.spawnProgress < 1) {
                const elapsedTime = performance.now() - manager.spawnStartTime;
                manager.spawnProgress = Math.min(1, elapsedTime / manager.spawnDuration);
            } else if (manager.spawnProgress >= 1 && manager.isSpawning) {
                manager.isSpawning = false;
            }
            const currentEffectiveSpawnProgress = manager.isSpawning ? manager.spawnProgress : 1.0;

            const breathPulse = Math.sin(globalTime_anim * config_anim.breathSpeed);
            particles_anim.forEach((particle) => {
                particle.projectAndTransform(
                    config_anim.sphereBaseRadius,
                    breathPulse,
                    currentEffectiveSpawnProgress,
                );
            });

            particles_anim.forEach((particle) => {
                particle.draw(currentEffectiveSpawnProgress);
            });
            localAnimationFrameId = requestAnimationFrame(animate_anim);
        };

        const resizeHandler_anim = () => {
            if (localAnimationFrameId) {
                cancelAnimationFrame(localAnimationFrameId);
                localAnimationFrameId = null;
            }
            init_anim();
            if (
                !localAnimationFrameId &&
                manager.animationRunner &&
                manager.animationRunner.isRunning
            ) {
                localAnimationFrameId = requestAnimationFrame(animate_anim);
            }
        };

        return {
            startAnimation: () => {
                init_anim();
                if (!localAnimationFrameId) {
                    localAnimationFrameId = requestAnimationFrame(animate_anim);
                }
            },
            stopAnimation: () => {
                if (localAnimationFrameId) {
                    cancelAnimationFrame(localAnimationFrameId);
                    localAnimationFrameId = null;
                }
            },
            resizeHandler: resizeHandler_anim,
        };
    },
};

// Устанавливаем loadingOverlayManager для ExportService
setLoadingOverlayManager(loadingOverlayManager);

function showOverlayForFixedDuration(duration = 2000) {
    if (loadingOverlayManager.overlayElement) {
        loadingOverlayManager.hideAndDestroy();
    }
    loadingOverlayManager.createAndShow();

    setTimeout(() => {
        if (loadingOverlayManager.overlayElement) {
            loadingOverlayManager.hideAndDestroy();
        }
    }, duration);
}

(function earlyAppSetup() {
    const isReloadingAfterClear = localStorage.getItem('copilotIsReloadingAfterClear') === 'true';
    const appContentEarly = document.getElementById('appContent');

    if (appContentEarly) {
        appContentEarly.classList.add('hidden');
    } else {
        const tempStyle = document.createElement('style');
        tempStyle.id = 'temp-hide-appcontent-style';
        tempStyle.textContent = '#appContent { display: none !important; }';
        document.head.appendChild(tempStyle);
    }

    if (isReloadingAfterClear) {
        console.log('[EarlySetup] Reloading after data clear. Showing overlay and removing flag.');
        if (typeof loadingOverlayManager !== 'undefined' && loadingOverlayManager.createAndShow) {
            loadingOverlayManager.createAndShow();
            loadingOverlayManager.updateProgress(1, 'Инициализация после очистки...');
        }
        try {
            localStorage.removeItem('copilotIsReloadingAfterClear');
            console.log("[EarlySetup] Flag 'copilotIsReloadingAfterClear' removed.");
        } catch (e) {
            console.error("[EarlySetup] Failed to remove 'copilotIsReloadingAfterClear' flag:", e);
        }
    } else {
        console.log('[EarlySetup] Standard load. Attempting to show overlay...');
        if (typeof loadingOverlayManager !== 'undefined' && loadingOverlayManager.createAndShow) {
            loadingOverlayManager.createAndShow();
        }
    }
})();

async function appInit(context = 'normal') {
    console.log(`[appInit V5 - Context-Aware: '${context}'] Начало инициализации приложения...`);

    let currentAppInitProgress = 0;

    const updateTotalAppInitProgress = (stageWeightCompleted, stageName) => {
        currentAppInitProgress += stageWeightCompleted;
        const displayProgress = Math.min(currentAppInitProgress, 99);
        loadingOverlayManager.updateProgress(displayProgress);
        console.log(
            `[appInit Progress] ${stageName}: ${displayProgress.toFixed(
                1,
            )}% (добавлено ${stageWeightCompleted.toFixed(
                1,
            )}%, всего ${currentAppInitProgress.toFixed(1)}%)`,
        );
    };

    const updateFineGrainedProgress = (baseProgress, stageWeight, current, total) => {
        if (total === 0) {
            const displayProgress = Math.min(baseProgress, 99);
            loadingOverlayManager.updateProgress(displayProgress);
            console.log(
                `[appInit FineGrainedProgress] Стадия с 0 элементами (${current}/${total}). Базовый прогресс: ${baseProgress.toFixed(
                    1,
                )}%, отображаемый: ${displayProgress.toFixed(1)}%`,
            );
            return;
        }
        const stageProgressFraction = current / total;
        const currentStageProgressContribution = stageProgressFraction * stageWeight;
        const newOverallProgressForDisplay = baseProgress + currentStageProgressContribution;
        const displayProgress = Math.min(newOverallProgressForDisplay, 99);

        loadingOverlayManager.updateProgress(displayProgress);
        console.log(
            `[appInit FineGrainedProgress] ${current}/${total} (вклад стадии: +${currentStageProgressContribution.toFixed(
                1,
            )}% к базе ${baseProgress.toFixed(
                1,
            )}%). Отображаемый прогресс: ${displayProgress.toFixed(1)}%`,
        );
    };

    const STAGE_WEIGHTS_APP_INIT = {
        NOTIFICATION_SERVICE: 2,
        DB_INIT: 15,
        USER_PREFS: 8,
        DATA_LOAD: 25,
        INDEX_BUILD: 25,
        UI_SYSTEMS: 20,
        FINAL_UI: 5,
    };

    if (
        typeof NotificationService !== 'undefined' &&
        typeof NotificationService.init === 'function'
    ) {
        try {
            NotificationService.init();
        } catch (e) {
            console.error('Failed to initialize NotificationService:', e);
        }
    } else {
        console.error('NotificationService is not defined or init method is missing!');
    }
    updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.NOTIFICATION_SERVICE, 'NotificationService');

    let dbInitialized = false;

    return new Promise(async (resolve, reject) => {
        try {
            if (typeof initDB === 'function') {
                await initDB();
                dbInitialized = true;
                console.log('[appInit V3] База данных успешно инициализирована.');
            } else {
                console.error('[appInit V3] Функция initDB не найдена!');
                throw new Error('initDB function not found');
            }
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.DB_INIT, 'DBInit');

            if (dbInitialized && typeof loadInitialFavoritesCache === 'function') {
                await loadInitialFavoritesCache();
                console.log('[appInit - Favorites] loadInitialFavoritesCache выполнена.');
            } else if (!dbInitialized) {
                console.warn(
                    '[appInit - Favorites] DB not initialized, skipping favorites cache load.',
                );
            } else {
                console.warn('[appInit - Favorites] loadInitialFavoritesCache function not found.');
            }

            if (typeof handleFavoriteActionClick === 'function') {
                if (document.body._favoriteActionClickHandlerAttached) {
                    document.removeEventListener('click', handleFavoriteActionClick, false);
                    delete document.body._favoriteActionClickHandlerAttached;
                    console.log(
                        '[appInit - Favorites] Старый обработчик handleFavoriteActionClick (BUBBLING), если был, удален.',
                    );
                }
                if (document.body._favoriteActionClickHandlerAttachedCapture) {
                    document.removeEventListener('click', handleFavoriteActionClick, true);
                    delete document.body._favoriteActionClickHandlerAttachedCapture;
                    console.log(
                        '[appInit - Favorites] Предыдущий обработчик handleFavoriteActionClick (CAPTURING) удален для перерегистрации.',
                    );
                }

                document.addEventListener('click', handleFavoriteActionClick, true);
                document.body._favoriteActionClickHandlerAttachedCapture = true;
                console.log(
                    '[appInit - Favorites] Глобальный обработчик handleFavoriteActionClick (CAPTURING) добавлен/перерегистрирован.',
                );
            } else {
                console.error(
                    '[appInit - Favorites] Функция handleFavoriteActionClick не определена!',
                );
            }

            const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
            if (showFavoritesHeaderButton) {
                if (showFavoritesHeaderButton._clickHandlerInstance) {
                    showFavoritesHeaderButton.removeEventListener(
                        'click',
                        showFavoritesHeaderButton._clickHandlerInstance,
                    );
                }
                showFavoritesHeaderButton._clickHandlerInstance = () => setActiveTab('favorites');
                showFavoritesHeaderButton.addEventListener(
                    'click',
                    showFavoritesHeaderButton._clickHandlerInstance,
                );
                console.log(
                    "[appInit - Favorites] Обработчик для кнопки 'Избранное' в шапке (#showFavoritesHeaderBtn) инициализирован/обновлен.",
                );
            } else {
                console.warn(
                    "[appInit - Favorites] Кнопка 'Избранное' в шапке (#showFavoritesHeaderBtn) не найдена.",
                );
            }

            if (typeof loadUserPreferences === 'function') {
                await loadUserPreferences();
            } else {
                console.warn('[appInit V3] Функция loadUserPreferences не найдена.');
            }
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.USER_PREFS, 'UserPrefs');

            const dataLoadPromises = [];
            if (dbInitialized) {
                if (typeof loadCategoryInfo === 'function')
                    dataLoadPromises.push(
                        loadCategoryInfo().catch((err) => {
                            console.error('[appInit V3] Ошибка loadCategoryInfo:', err);
                            return null;
                        }),
                    );
                if (typeof loadFromIndexedDB === 'function')
                    dataLoadPromises.push(
                        loadFromIndexedDB().catch((err) => {
                            console.error('[appInit V3] Ошибка loadFromIndexedDB:', err);
                            return null;
                        }),
                    );
                else {
                    console.warn('[appInit V3] Функция loadFromIndexedDB не найдена.');
                }
            } else {
                console.warn(
                    '[appInit V3] База данных не инициализирована, пропускаем dataLoadPromises.',
                );
            }

            const dataResults = await Promise.allSettled(dataLoadPromises);
            console.log(
                '[appInit V3] Загрузка данных завершена. Результаты:',
                dataResults.map((r) => r.status),
            );
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.DATA_LOAD, 'DataLoad');

            const baseProgressForIndex = currentAppInitProgress;
            if (dbInitialized && typeof ensureSearchIndexIsBuilt === 'function') {
                try {
                    console.log('[appInit V3] Начало построения/проверки поискового индекса...');
                    const indexProgressCallback = (processed, total, error) => {
                        if (error) {
                            console.warn(
                                '[appInit V3 - IndexProgress] Ошибка во время коллбэка индексации:',
                                error,
                            );
                            return;
                        }
                        if (total > 0) {
                            const indexStageProgress =
                                (processed / total) * STAGE_WEIGHTS_APP_INIT.INDEX_BUILD;
                            const displayProgress = Math.min(
                                baseProgressForIndex + indexStageProgress,
                                baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD,
                                99,
                            );
                            loadingOverlayManager.updateProgress(displayProgress);
                        } else if (processed === 0 && total === 0) {
                            loadingOverlayManager.updateProgress(
                                Math.min(
                                    baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD,
                                    99,
                                ),
                            );
                        }
                    };

                    if (typeof checkAndBuildIndex === 'function') {
                        await checkAndBuildIndex(false, indexProgressCallback, context);
                    } else {
                        console.warn(
                            '[appInit V3] Функция checkAndBuildIndex не найдена, вызываем ensureSearchIndexIsBuilt.',
                        );
                        await ensureSearchIndexIsBuilt();
                        loadingOverlayManager.updateProgress(
                            Math.min(baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD, 99),
                        );
                    }
                    console.log('[appInit V3] Поисковый индекс построен/проверен успешно.');
                } catch (indexError) {
                    console.error('[appInit V3] Ошибка построения поискового индекса:', indexError);
                }
            } else {
                if (!dbInitialized)
                    console.warn(
                        '[appInit V3] База данных не инициализирована, построение поискового индекса пропущено.',
                    );
                else
                    console.warn(
                        '[appInit V3] Функция ensureSearchIndexIsBuilt не найдена, построение поискового индекса пропущено.',
                    );
            }
            currentAppInitProgress = baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD;
            loadingOverlayManager.updateProgress(Math.min(currentAppInitProgress, 99));

            // Устанавливаем зависимости для модуля поиска
            if (typeof setSearchDependencies === 'function') {
                setSearchDependencies({
                    algorithms: algorithms,
                    showNotification: showNotification,
                    setActiveTab: setActiveTab,
                    showAlgorithmDetail: showAlgorithmDetail,
                    showBookmarkDetailModal: showBookmarkDetailModal,
                    showReglamentDetail: showReglamentDetail,
                    showReglamentsForCategory: showReglamentsForCategory,
                    loadingOverlayManager: loadingOverlayManager,
                    debounce: debounce,
                    categoryDisplayInfo: categoryDisplayInfo
                });
                console.log('[appInit] Search dependencies установлены');
            }

            console.log('[appInit V3] Начало инициализации подсистем UI...');
            const initSystems = [
                {
                    name: 'initSearchSystem',
                    func:
                        typeof initSearchSystem === 'function'
                            ? initSearchSystem
                            : () => console.warn('initSearchSystem not defined'),
                    critical: true,
                },
                {
                    name: 'initBookmarkSystem',
                    func:
                        typeof initBookmarkSystem === 'function'
                            ? initBookmarkSystem
                            : () => console.warn('initBookmarkSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initCibLinkSystem',
                    func:
                        typeof initCibLinkSystem === 'function'
                            ? initCibLinkSystem
                            : () => console.warn('initCibLinkSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initViewToggles',
                    func:
                        typeof initViewToggles === 'function'
                            ? initViewToggles
                            : () => console.warn('initViewToggles not defined'),
                    critical: false,
                },
                {
                    name: 'initReglamentsSystem',
                    func:
                        typeof initReglamentsSystem === 'function'
                            ? initReglamentsSystem
                            : () => console.warn('initReglamentsSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initClientDataSystem',
                    func:
                        typeof initClientDataSystem === 'function'
                            ? initClientDataSystem
                            : () => console.warn('initClientDataSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initExternalLinksSystem',
                    func:
                        typeof initExternalLinksSystem === 'function'
                            ? initExternalLinksSystem
                            : () => console.warn('initExternalLinksSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initTimerSystem',
                    func:
                        typeof initTimerSystem === 'function'
                            ? initTimerSystem
                            : () => console.warn('initTimerSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initSedoTypesSystem',
                    func:
                        typeof initSedoTypesSystem === 'function'
                            ? initSedoTypesSystem
                            : () => console.warn('initSedoTypesSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initBlacklistSystem',
                    func:
                        typeof initBlacklistSystem === 'function'
                            ? initBlacklistSystem
                            : () => console.warn('initBlacklistSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initReloadButton',
                    func:
                        typeof initReloadButton === 'function'
                            ? initReloadButton
                            : () => console.warn('initReloadButton not defined'),
                    critical: false,
                },
                {
                    name: 'initClearDataFunctionality',
                    func:
                        typeof initClearDataFunctionality === 'function'
                            ? initClearDataFunctionality
                            : () => console.warn('initClearDataFunctionality not defined'),
                    critical: false,
                },
                {
                    name: 'initUICustomization',
                    func:
                        typeof initUICustomization === 'function'
                            ? initUICustomization
                            : () => console.warn('initUICustomization not defined'),
                    critical: false,
                },
                {
                    name: 'initHotkeysModal',
                    func:
                        typeof initHotkeysModal === 'function'
                            ? initHotkeysModal
                            : () => console.warn('initHotkeysModal not defined'),
                    critical: false,
                },
                {
                    name: 'setupHotkeys',
                    func:
                        typeof setupHotkeys === 'function'
                            ? setupHotkeys
                            : () => console.warn('setupHotkeys not defined'),
                    critical: false,
                },
                {
                    name: 'initFullscreenToggles',
                    func:
                        typeof initFullscreenToggles === 'function'
                            ? initFullscreenToggles
                            : () => console.warn('initFullscreenToggles not defined'),
                    critical: false,
                },
            ];
            let successCount = 0;
            let errorCount = 0;
            const baseProgressForUISystems = currentAppInitProgress;
            let processedUISystems = 0;

            for (const system of initSystems) {
                try {
                    if (typeof system.func === 'function') {
                        await Promise.resolve(system.func());
                        console.log(`[appInit V3] ✓ ${system.name} инициализирована успешно.`);
                        successCount++;
                    } else {
                        console.warn(
                            `[appInit V3] ⚠ ${system.name} не найдена или не является функцией (неожиданно, т.к. должна быть заглушка).`,
                        );
                        if (system.critical)
                            throw new Error(`Critical system ${system.name} not found`);
                    }
                } catch (error) {
                    console.error(`[appInit V3] ✗ Ошибка инициализации ${system.name}:`, error);
                    errorCount++;
                    if (system.critical)
                        throw new Error(`Critical system ${system.name} failed: ${error.message}`);
                }
                processedUISystems++;
                updateFineGrainedProgress(
                    baseProgressForUISystems,
                    STAGE_WEIGHTS_APP_INIT.UI_SYSTEMS,
                    processedUISystems,
                    initSystems.length,
                );
            }
            currentAppInitProgress = baseProgressForUISystems + STAGE_WEIGHTS_APP_INIT.UI_SYSTEMS;
            loadingOverlayManager.updateProgress(Math.min(currentAppInitProgress, 99));
            console.log(
                `[appInit V3] Инициализация подсистем UI завершена: ${successCount} успешно, ${errorCount} с ошибками.`,
            );

            try {
                if (typeof applyInitialUISettings === 'function') {
                    await applyInitialUISettings();
                } else {
                    console.warn('[appInit V3] Функция applyInitialUISettings не найдена.');
                }
            } catch (uiSettingsError) {
                console.error('[appInit V3] ✗ Ошибка применения UI настроек:', uiSettingsError);
            }

            try {
                if (typeof initUI === 'function') {
                    await Promise.resolve(initUI());
                } else {
                    console.warn('[appInit V3] ⚠ Функция initUI не найдена.');
                }
            } catch (finalUIError) {
                console.error('[appInit V3] ✗ Ошибка в финальной инициализации UI:', finalUIError);
            }
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.FINAL_UI, 'FinalUI');

            console.log(
                '[appInit V3] Все логические операции и вызовы рендеринга завершены. Ожидание отрисовки DOM браузером...',
            );
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            console.log('[appInit V3] Отрисовка DOM браузером должна была произойти.');

            loadingOverlayManager.updateProgress(100);
            console.log('[appInit V3] ✓ Инициализация приложения завершена успешно.');
            resolve(dbInitialized);
        } catch (criticalError) {
            console.error('[appInit V3] ✗ КРИТИЧЕСКАЯ ОШИБКА инициализации:', criticalError);
            loadingOverlayManager.updateProgress(100);
            if (typeof NotificationService !== 'undefined' && NotificationService.add) {
                NotificationService.add(
                    `Критическая ошибка инициализации: ${criticalError.message}. Приложение может работать некорректно.`,
                    'error',
                    { important: true, duration: 0 },
                );
            } else {
                alert(
                    `Критическая ошибка инициализации: ${criticalError.message}. Приложение может работать некорректно.`,
                );
            }
            reject(criticalError);
        }
    });
}

window.onload = async () => {
    console.log('window.onload: Страница полностью загружена.');
    const appContent = document.getElementById('appContent');

    const tempHideStyle = document.getElementById('temp-hide-appcontent-style');
    if (tempHideStyle) {
        tempHideStyle.remove();
        console.log('[window.onload] Removed temporary appContent hiding style.');
    }

    if (typeof NotificationService !== 'undefined' && NotificationService.init) {
        NotificationService.init();
    } else {
        console.error('NotificationService не определен в window.onload!');
    }

    if (typeof loadingOverlayManager !== 'undefined' && loadingOverlayManager.createAndShow) {
        if (!loadingOverlayManager.overlayElement) {
            console.log('[window.onload] Overlay not shown by earlyAppSetup, creating it now.');
            loadingOverlayManager.createAndShow();
        } else {
            console.log('[window.onload] Overlay already exists (presumably shown by earlyAppSetup).');
        }
    }

    const minDisplayTime = 3000;
    const minDisplayTimePromise = new Promise((resolve) => setTimeout(resolve, minDisplayTime));
    let appInitSuccessfully = false;

    const appLoadPromise = appInit()
        .then((dbReady) => {
            appInitSuccessfully = dbReady;
            console.log(`[window.onload] appInit завершен. Статус готовности БД: ${dbReady}`);
        })
        .catch((err) => {
            console.error('appInit rejected in window.onload wrapper:', err);
            appInitSuccessfully = false;
        });

    Promise.all([minDisplayTimePromise, appLoadPromise])
        .then(async () => {
            console.log('[window.onload Promise.all.then] appInit и минимальное время отображения оверлея завершены.');

            if (
                loadingOverlayManager &&
                typeof loadingOverlayManager.updateProgress === 'function' &&
                loadingOverlayManager.overlayElement
            ) {
                if (loadingOverlayManager.currentProgressValue < 100) {
                    loadingOverlayManager.updateProgress(100);
                }
            }
            await new Promise((r) => setTimeout(r, 200));

            if (
                loadingOverlayManager &&
                typeof loadingOverlayManager.hideAndDestroy === 'function'
            ) {
                await loadingOverlayManager.hideAndDestroy();
                console.log('[window.onload Promise.all.then] Оверлей скрыт.');
            }

            // Убираем inline background style с body
            document.body.style.backgroundColor = '';

            if (appContent) {
                appContent.classList.remove('hidden');
                appContent.classList.add('content-fading-in');
                console.log(
                    '[window.onload Promise.all.then] appContent показан с fade-in эффектом.',
                );

                await new Promise((resolve) => requestAnimationFrame(resolve));

                if (appInitSuccessfully) {
                    if (typeof initGoogleDocSections === 'function') {
                        initGoogleDocSections();
                    } else {
                        console.error('Функция initGoogleDocSections не найдена в window.onload!');
                    }
                }

                requestAnimationFrame(() => {
                    if (typeof setupTabsOverflow === 'function') {
                        console.log(
                            'window.onload (FIXED): Вызов setupTabsOverflow для инициализации обработчиков.',
                        );
                        setupTabsOverflow();
                    } else {
                        console.warn(
                            'window.onload (FIXED): Функция setupTabsOverflow не найдена.',
                        );
                    }

                    if (typeof updateVisibleTabs === 'function') {
                        console.log(
                            'window.onload (FIXED): Вызов updateVisibleTabs для первоначального расчета.',
                        );
                        updateVisibleTabs();
                    } else {
                        console.warn(
                            'window.onload (FIXED): Функция updateVisibleTabs не найдена.',
                        );
                    }
                });
            } else {
                console.warn(
                    '[window.onload Promise.all.then] appContent не найден после appInit. UI может быть сломан.',
                );
            }
        })
        .catch(async (error) => {
            console.error('Критическая ошибка в Promise.all (window.onload):', error);
            if (
                loadingOverlayManager &&
                typeof loadingOverlayManager.hideAndDestroy === 'function'
            ) {
                await loadingOverlayManager.hideAndDestroy();
            }
            // Убираем inline background style с body
            document.body.style.backgroundColor = '';
            if (appContent) {
                appContent.classList.remove('hidden');
            }
            const errorMessageText = error instanceof Error ? error.message : String(error);
            if (typeof NotificationService !== 'undefined' && NotificationService.add) {
                NotificationService.add(
                    `Произошла ошибка при загрузке приложения: ${errorMessageText}.`,
                    'error',
                    { important: true, duration: 10000 },
                );
            }
        });
};

async function loadUserPreferences() {
    const LOG_PREFIX = '[loadUserPreferences V2 - Unified]';
    console.log(`${LOG_PREFIX} Запуск единой функции загрузки и миграции настроек.`);

    const defaultPreferences = {
        theme: DEFAULT_UI_SETTINGS.themeMode,
        primaryColor: DEFAULT_UI_SETTINGS.primaryColor,
        fontSize: DEFAULT_UI_SETTINGS.fontSize,
        borderRadius: DEFAULT_UI_SETTINGS.borderRadius,
        contentDensity: DEFAULT_UI_SETTINGS.contentDensity,
        mainLayout: DEFAULT_UI_SETTINGS.mainLayout,
        panelOrder: [...defaultPanelOrder],
        panelVisibility: defaultPanelOrder.map(
            (id) => !(id === 'sedoTypes' || id === 'blacklistedClients'),
        ),
        showBlacklistUsageWarning: true,
        disableForcedBackupOnImport: false,
        welcomeTextShownInitially: false,
        clientNotesFontSize: 100,
        employeeExtension: '',
    };

    if (!State.db) {
        console.warn(
            `${LOG_PREFIX} База данных не инициализирована. Используются дефолтные State.userPreferences.`,
        );
        State.userPreferences = { ...defaultPreferences };
        return;
    }

    try {
        let finalSettings;
        const savedPrefsContainer = await getFromIndexedDB('preferences', USER_PREFERENCES_KEY);

        if (savedPrefsContainer && typeof savedPrefsContainer.data === 'object') {
            console.log(
                `${LOG_PREFIX} Найдены настройки в основном хранилище ('${USER_PREFERENCES_KEY}').`,
            );
            finalSettings = { ...defaultPreferences, ...savedPrefsContainer.data };
        } else {
            console.log(
                `${LOG_PREFIX} Настройки в основном хранилище не найдены. Попытка миграции со старых ключей...`,
            );
            finalSettings = { ...defaultPreferences };

            const legacyUiSettings = await getFromIndexedDB('preferences', 'uiSettings');
            const legacyExtension = await getFromIndexedDB('preferences', 'employeeExtension');

            let migrated = false;
            if (legacyUiSettings && typeof legacyUiSettings === 'object') {
                console.log(
                    `${LOG_PREFIX} Найдены устаревшие настройки UI ('uiSettings'). Миграция...`,
                );
                delete legacyUiSettings.id;
                delete legacyUiSettings.themeMode;
                delete legacyUiSettings.showBlacklistUsageWarning;
                delete legacyUiSettings.disableForcedBackupOnImport;
                finalSettings = { ...finalSettings, ...legacyUiSettings };
                migrated = true;
            }
            if (legacyExtension && typeof legacyExtension.value === 'string') {
                console.log(
                    `${LOG_PREFIX} Найден устаревший добавочный номер ('${legacyExtension.value}'). Миграция...`,
                );
                finalSettings.employeeExtension = legacyExtension.value;
                migrated = true;
            }

            if (migrated) {
                console.log(`${LOG_PREFIX} Миграция завершена. Удаление устаревших ключей...`);
                await deleteFromIndexedDB('preferences', 'uiSettings').catch((e) =>
                    console.warn("Не удалось удалить 'uiSettings'", e),
                );
                await deleteFromIndexedDB('preferences', 'employeeExtension').catch((e) =>
                    console.warn("Не удалось удалить 'employeeExtension'", e),
                );
                console.log(`${LOG_PREFIX} Устаревшие ключи удалены.`);
            }
        }

        const currentPanelIds = tabsConfig.map((t) => t.id);
        const knownPanelIds = new Set(currentPanelIds);
        const actualDefaultPanelVisibility = currentPanelIds.map(
            (id) => !(id === 'sedoTypes' || id === 'blacklistedClients'),
        );

        let savedOrder = finalSettings.panelOrder || [];
        let savedVisibility = finalSettings.panelVisibility || [];

        let effectiveOrder = [];
        let effectiveVisibility = [];
        const processedIds = new Set();

        savedOrder.forEach((panelId, index) => {
            if (knownPanelIds.has(panelId)) {
                effectiveOrder.push(panelId);
                effectiveVisibility.push(
                    typeof savedVisibility[index] === 'boolean' ? savedVisibility[index] : true,
                );
                processedIds.add(panelId);
            }
        });

        currentPanelIds.forEach((panelId, index) => {
            if (!processedIds.has(panelId)) {
                effectiveOrder.push(panelId);
                effectiveVisibility.push(actualDefaultPanelVisibility[index]);
                console.log(
                    `${LOG_PREFIX} Добавлена новая панель "${panelId}" с видимостью по умолчанию.`,
                );
            }
        });

        finalSettings.panelOrder = effectiveOrder;
        finalSettings.panelVisibility = effectiveVisibility;

        State.userPreferences = { ...finalSettings };
        await saveUserPreferences();

        console.log(
            `${LOG_PREFIX} Загрузка и синхронизация пользовательских настроек завершена. Итоговые userPreferences:`,
            State.userPreferences,
        );
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке/миграции настроек:`, error);
        State.userPreferences = { ...defaultPreferences };
    }
}

async function saveUserPreferences() {
    const LOG_PREFIX = '[saveUserPreferences V2 - Unified]';
    if (!State.db) {
        console.error(
            `${LOG_PREFIX} База данных не инициализирована. Настройки не могут быть сохранены.`,
        );
        if (typeof showNotification === 'function') {
            showNotification('Ошибка: Не удалось сохранить настройки (БД недоступна).', 'error');
        }
        return false;
    }
    try {
        const fields = [
            'theme',
            'primaryColor',
            'fontSize',
            'borderRadius',
            'contentDensity',
            'mainLayout',
            'panelOrder',
            'panelVisibility',
            'showBlacklistUsageWarning',
            'disableForcedBackupOnImport',
            'welcomeTextShownInitially',
            'clientNotesFontSize',
            'employeeExtension',
        ];
        fields.forEach((field) => {
            if (typeof State.userPreferences[field] === 'undefined') {
                console.warn(
                    `${LOG_PREFIX} Поле '${field}' отсутствует в State.userPreferences. Устанавливается пустая строка или false.`,
                );
                State.userPreferences[field] = typeof State.userPreferences[field] === 'boolean' ? false : '';
            }
        });

        const dataToSave = {
            id: USER_PREFERENCES_KEY,
            data: State.userPreferences,
        };
        await saveToIndexedDB('preferences', dataToSave);
        console.log(`${LOG_PREFIX} Единые настройки успешно сохранены в IndexedDB:`, dataToSave);
        return true;
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при сохранении настроек в IndexedDB:`, error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при сохранении настроек.', 'error');
        }
        return false;
    }
}

// initDB теперь импортируется из db/indexeddb.js
// Локальная функция удалена - используем импортированную версию

async function ensureSearchIndexIsBuilt() {
    console.log('Вызов ensureSearchIndexIsBuilt для проверки и построения поискового индекса.');
    if (!State.db) {
        console.warn(
            'ensureSearchIndexIsBuilt: База данных не инициализирована. Проверка индекса невозможна.',
        );
        return;
    }
    try {
        await checkAndBuildIndex();
        console.log(
            'ensureSearchIndexIsBuilt: Проверка и построение индекса завершены (или не требовались).',
        );
    } catch (error) {
        console.error(
            'ensureSearchIndexIsBuilt: Ошибка во время проверки/построения поискового индекса:',
            error,
        );
    }
}

async function loadCategoryInfo() {
    if (!State.db) {
        console.warn('DB not ready, using default categories.');
        return;
    }
    try {
        const savedInfo = await getFromIndexedDB('preferences', CATEGORY_INFO_KEY);
        if (savedInfo && typeof savedInfo.data === 'object') {
            categoryDisplayInfo = { ...categoryDisplayInfo, ...savedInfo.data };
        }
    } catch (error) {
        console.error('Error loading reglament category info:', error);
    }
}

async function saveCategoryInfo() {
    if (!State.db) {
        console.error('Cannot save category info: DB not ready.');
        showNotification('Ошибка сохранения настроек категорий: База данных недоступна', 'error');
        return false;
    }
    try {
        await saveToIndexedDB('preferences', { id: CATEGORY_INFO_KEY, data: categoryDisplayInfo });
        populateReglamentCategoryDropdowns();
        console.log('Reglament category info saved successfully.');

        showNotification('Настройки категорий регламентов сохранены.', 'success');

        return true;
    } catch (error) {
        console.error('Error saving reglament category info:', error);
        showNotification('Ошибка сохранения настроек категорий', 'error');
        return false;
    }
}

// Wrapper для модуля reglaments.js
function populateReglamentCategoryDropdowns() {
    return populateReglamentCategoryDropdownsModule();
}

// Все функции БД и favorites теперь импортируются из модулей db/
// Обёртки удалены - используем импортированные функции напрямую

// Wrapper для модуля theme.js
function setTheme(mode) {
    return setThemeModule(mode);
}

function renderAllAlgorithms() {
    renderMainAlgorithm();
    renderAlgorithmCards('program');
    renderAlgorithmCards('skzi');
    renderAlgorithmCards('webReg');
    renderAlgorithmCards('lk1c');
}

async function loadFromIndexedDB() {
    console.log('Запуск loadFromIndexedDB (v2, без clientData логики)...');

    const mainTitleElement = document.querySelector('#mainContent h2');
    if (mainTitleElement) {
        mainTitleElement.textContent = DEFAULT_MAIN_ALGORITHM.title;
    } else {
        console.warn(
            '[loadFromIndexedDB] Не найден элемент #mainContent h2 для установки начального заголовка.',
        );
    }

    if (!State.db) {
        console.warn(
            'База данных не инициализирована. Используются только дефолтные данные для алгоритмов.',
        );
        algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
        Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
            algorithms[section] = JSON.parse(JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []));
        });
        if (mainTitleElement) {
            mainTitleElement.textContent = algorithms.main.title;
        }
        if (typeof renderAllAlgorithms === 'function') renderAllAlgorithms();
        return false;
    }

    let loadedDataUsed = false;
    try {
        const savedAlgorithmsContainer = await getFromIndexedDB('algorithms', 'all');
        let loadedAlgoData = null;
        if (savedAlgorithmsContainer?.data && typeof savedAlgorithmsContainer.data === 'object') {
            loadedAlgoData = savedAlgorithmsContainer.data;
            loadedDataUsed = true;
            console.log('[loadFromIndexedDB] Данные алгоритмов загружены из БД.');
        } else {
            console.log(
                '[loadFromIndexedDB] Данные алгоритмов не найдены в БД, инициализация дефолтами.',
            );
            algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
            Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
                algorithms[section] = JSON.parse(
                    JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []),
                );
            });
            loadedAlgoData = JSON.parse(JSON.stringify(algorithms));
            loadedDataUsed = false;
        }

        if (
            loadedAlgoData &&
            typeof loadedAlgoData.main === 'object' &&
            loadedAlgoData.main !== null
        ) {
            const mainHasContent =
                loadedAlgoData.main.title ||
                (loadedAlgoData.main.steps && loadedAlgoData.main.steps.length > 0);
            if (mainHasContent || loadedDataUsed) {
                algorithms.main = loadedAlgoData.main;
                if (!algorithms.main.id) algorithms.main.id = 'main';
                if (Array.isArray(algorithms.main.steps)) {
                    algorithms.main.steps = algorithms.main.steps.map((step) => {
                        if (!step || typeof step !== 'object') {
                            console.warn(
                                '[loadFromIndexedDB] Обнаружен невалидный шаг в main.steps:',
                                step,
                            );
                            return {
                                title: 'Ошибка: шаг невалиден',
                                description: '',
                                isCopyable: false,
                                additionalInfoText: '',
                                additionalInfoShowTop: false,
                                additionalInfoShowBottom: false,
                            };
                        }
                        const newStep = {
                            additionalInfoText: step.additionalInfoText || '',
                            additionalInfoShowTop:
                                typeof step.additionalInfoShowTop === 'boolean'
                                    ? step.additionalInfoShowTop
                                    : false,
                            additionalInfoShowBottom:
                                typeof step.additionalInfoShowBottom === 'boolean'
                                    ? step.additionalInfoShowBottom
                                    : false,
                            isCopyable:
                                typeof step.isCopyable === 'boolean' ? step.isCopyable : false,
                            showNoInnHelp:
                                typeof step.showNoInnHelp === 'boolean'
                                    ? step.showNoInnHelp
                                    : false,
                            ...step,
                        };
                        if (step.type === 'inn_step') {
                            newStep.showNoInnHelp = true;
                            delete newStep.type;
                        }
                        return newStep;
                    });
                } else {
                    algorithms.main.steps = [];
                }
            } else {
                console.warn(
                    "[loadFromIndexedDB] 'main' из БД пуст и не используется (т.к. loadedDataUsed=false). Используется DEFAULT_MAIN_ALGORITHM.",
                );
                algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
            }
        } else {
            console.warn(
                '[loadFromIndexedDB] loadedAlgoData.main невалиден. Используется DEFAULT_MAIN_ALGORITHM.',
            );
            algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
        }

        if (mainTitleElement) {
            mainTitleElement.textContent = algorithms.main.title || DEFAULT_MAIN_ALGORITHM.title;
        }

        Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
            if (
                loadedAlgoData &&
                loadedAlgoData.hasOwnProperty(section) &&
                Array.isArray(loadedAlgoData[section])
            ) {
                algorithms[section] = loadedAlgoData[section]
                    .map((item) => {
                        if (item && typeof item === 'object') {
                            if (typeof item.id === 'undefined' && item.title) {
                                item.id = `${section}-${Date.now()}-${Math.random()
                                    .toString(36)
                                    .substring(2, 9)}`;
                            }
                            if (item.steps && Array.isArray(item.steps)) {
                                item.steps = item.steps.map((step) => {
                                    if (!step || typeof step !== 'object') {
                                        console.warn(
                                            `[loadFromIndexedDB] Обнаружен невалидный шаг в ${section}/${item.id}:`,
                                            step,
                                        );
                                        return { title: 'Ошибка: шаг невалиден', description: '' };
                                    }
                                    return {
                                        additionalInfoText: step.additionalInfoText || '',
                                        additionalInfoShowTop:
                                            typeof step.additionalInfoShowTop === 'boolean'
                                                ? step.additionalInfoShowTop
                                                : false,
                                        additionalInfoShowBottom:
                                            typeof step.additionalInfoShowBottom === 'boolean'
                                                ? step.additionalInfoShowBottom
                                                : false,
                                        ...step,
                                    };
                                });
                            } else if (item.steps === undefined) {
                                item.steps = [];
                            }
                            return item;
                        }
                        console.warn(
                            `[loadFromIndexedDB] Обнаружен невалидный элемент в секции ${section}:`,
                            item,
                        );
                        return null;
                    })
                    .filter((item) => item && typeof item.id !== 'undefined');
            } else {
                algorithms[section] = JSON.parse(
                    JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []),
                );
                if (!Array.isArray(algorithms[section])) algorithms[section] = [];
            }
        });

        if (!loadedDataUsed) {
            console.log(
                '[loadFromIndexedDB] Сохранение данных алгоритмов по умолчанию в IndexedDB (т.к. loadedDataUsed=false)...',
            );
            try {
                await saveToIndexedDB('algorithms', {
                    section: 'all',
                    data: JSON.parse(JSON.stringify(algorithms)),
                });
            } catch (saveError) {
                console.error(
                    '[loadFromIndexedDB] Ошибка при сохранении дефолтных алгоритмов:',
                    saveError,
                );
            }
        }

        if (typeof renderAllAlgorithms === 'function') renderAllAlgorithms();

        const results = await Promise.allSettled([
            typeof loadBookmarks === 'function' ? loadBookmarks() : Promise.resolve(),
            typeof loadReglaments === 'function' ? loadReglaments() : Promise.resolve(),
            typeof loadCibLinks === 'function' ? loadCibLinks() : Promise.resolve(),
            typeof loadExtLinks === 'function' ? loadExtLinks() : Promise.resolve(),
        ]);
        const functionNames = ['bookmarks', 'reglaments', 'links', 'extLinks'];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Ошибка при загрузке ${functionNames[index]}:`, result.reason);
            }
        });

        if (
            !algorithms.main ||
            !algorithms.main.title ||
            !Array.isArray(algorithms.main.steps) ||
            (algorithms.main.steps.length === 0 && !loadedDataUsed)
        ) {
            console.warn(
                '[loadFromIndexedDB - Final Check] algorithms.main все еще невалиден. Восстановление из DEFAULT_MAIN_ALGORITHM.',
            );
            algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
            if (mainTitleElement) mainTitleElement.textContent = algorithms.main.title;
            if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
        }

        console.log(
            'Загрузка данных из IndexedDB (loadFromIndexedDB) успешно завершена (алгоритмы и связанные данные).',
        );
        return true;
    } catch (error) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА в loadFromIndexedDB:', error);
        algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
        Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
            algorithms[section] = JSON.parse(JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []));
        });
        if (mainTitleElement) mainTitleElement.textContent = algorithms.main.title;
        if (typeof renderAllAlgorithms === 'function') renderAllAlgorithms();
        return false;
    }
}

async function saveDataToIndexedDB() {
    if (!State.db) {
        console.error('Cannot save data: Database not initialized.');
        showNotification('Ошибка сохранения: База данных недоступна', 'error');
        return false;
    }

    try {
        const clientDataToSave = getClientData();
        const algorithmsToSave = { section: 'all', data: algorithms };

        return await new Promise((resolve, reject) => {
            const transaction = State.db.transaction(['algorithms', 'clientData'], 'readwrite');
            const algoStore = transaction.objectStore('algorithms');
            const clientStore = transaction.objectStore('clientData');
            let opsCompleted = 0;
            const totalOps = 2;

            const checkCompletion = () => {
                opsCompleted++;
                if (opsCompleted === totalOps) {
                }
            };

            const req1 = algoStore.put(algorithmsToSave);
            req1.onsuccess = checkCompletion;
            req1.onerror = (e) => {
                console.error('Error saving algorithms:', e.target.error);
            };

            const req2 = clientStore.put(clientDataToSave);
            req2.onsuccess = checkCompletion;
            req2.onerror = (e) => {
                console.error('Error saving clientData:', e.target.error);
            };

            transaction.oncomplete = () => {
                console.log('Algorithms and clientData saved successfully in one transaction.');
                resolve(true);
            };

            transaction.onerror = (e) => {
                console.error(
                    'Error during save transaction for algorithms/clientData:',
                    e.target.error,
                );
                reject(e.target.error);
            };

            transaction.onabort = (e) => {
                console.warn('Save transaction for algorithms/clientData aborted:', e.target.error);
                if (!e.target.error) {
                    reject(new Error('Save transaction aborted'));
                }
            };
        });
    } catch (error) {
        console.error('Failed to execute save transaction:', error);
        showNotification('Ошибка сохранения данных', 'error');
        return false;
    }
}

// tabsConfig, allPanelIdsForDefault, defaultPanelOrder теперь импортируются из config.js

async function loadUISettings() {
    console.log('loadUISettings V2 (Unified): Загрузка настроек для модального окна...');

    if (typeof State.userPreferences !== 'object' || Object.keys(State.userPreferences).length === 0) {
        console.error(
            'loadUISettings: Глобальные настройки (State.userPreferences) не загружены. Попытка аварийной загрузки.',
        );
        await loadUserPreferences();
    }

    State.originalUISettings = JSON.parse(JSON.stringify(State.userPreferences));
    State.currentPreviewSettings = JSON.parse(JSON.stringify(State.userPreferences));

    if (typeof applyPreviewSettings === 'function') {
        await applyPreviewSettings(State.currentPreviewSettings);
    } else {
        console.warn(
            '[loadUISettings] Функция applyPreviewSettings не найдена. Предпросмотр не будет применен.',
        );
    }

    console.log(
        'loadUISettings: Настройки для модального окна подготовлены:',
        State.currentPreviewSettings,
    );
    return State.currentPreviewSettings;
}

async function saveUISettings() {
    console.log('Saving UI settings (Unified Logic V3 - Fixed Checkboxes)...');

    const newSettings = getSettingsFromModal();
    if (!newSettings) {
        showNotification('Ошибка: Не удалось получить настройки из модального окна.', 'error');
        return false;
    }

    State.userPreferences = { ...State.userPreferences, ...newSettings };

    try {
        if (typeof saveUserPreferences === 'function') {
            await saveUserPreferences();
            console.log('Единые настройки пользователя сохранены через saveUserPreferences().');
        } else {
            throw new Error('saveUserPreferences function not found.');
        }

        State.originalUISettings = JSON.parse(JSON.stringify(State.userPreferences));
        State.currentPreviewSettings = JSON.parse(JSON.stringify(State.userPreferences));
        State.isUISettingsDirty = false;

        if (typeof applyPreviewSettings === 'function') {
            await applyPreviewSettings(State.userPreferences);
            console.log('UI settings applied immediately after saving.');
        } else {
            throw new Error(
                'applyPreviewSettings function not found! UI might not update after save.',
            );
        }

        const fallbackOrder =
            Array.isArray(defaultPanelOrder) && defaultPanelOrder.length
                ? [...defaultPanelOrder]
                : Array.isArray(tabsConfig)
                ? tabsConfig.map((t) => t.id)
                : [];
        const order =
            Array.isArray(State.userPreferences?.panelOrder) && State.userPreferences.panelOrder.length
                ? [...State.userPreferences.panelOrder]
                : fallbackOrder;
        const visibility =
            Array.isArray(State.userPreferences?.panelVisibility) &&
            State.userPreferences.panelVisibility.length === order.length
                ? [...State.userPreferences.panelVisibility]
                : order.map((id) => !(id === 'sedoTypes' || id === 'blacklistedClients'));
        if (typeof applyPanelOrderAndVisibility === 'function') {
            applyPanelOrderAndVisibility(order, visibility);
        } else {
            console.warn(
                'applyPanelOrderAndVisibility not found; tabs order may not update immediately after save.',
            );
        }

        showNotification('Настройки успешно сохранены.', 'success');
        return true;
    } catch (error) {
        console.error('Error saving unified UI settings:', error);
        showNotification(`Ошибка при сохранении настроек: ${error.message}`, 'error');
        State.userPreferences = JSON.parse(JSON.stringify(State.originalUISettings));
        return false;
    }
}

// ============================================================================
// SEDO SYSTEM - MIGRATED to js/features/sedo.js
// ============================================================================
// All SEDO-related functions are now imported from the sedo module.
// See: js/features/sedo.js

// DIALOG_WATCHDOG_TIMEOUT_NEW теперь импортируется из constants.js (строка 28)

// Wrapper для модуля Import/Export
async function handleImportButtonClick() {
    return handleImportButtonClickModule();
}

// Wrapper для модуля Import/Export
async function handleImportFileChange(e) {
    return handleImportFileChangeModule(e);
}

// Wrapper для модуля Import/Export
async function exportAllData(options = {}) {
    return exportAllDataModule(options);
}

// Wrapper для модуля Import/Export
function clearTemporaryThumbnailsFromContainer(container) {
    return clearTemporaryThumbnailsFromContainerModule(container);
}

// base64ToBlob теперь импортируется из utils/helpers.js

const importFileInput = document.getElementById('importFileInput');
const importDataBtn = document.getElementById('importDataBtn');

if (importDataBtn && importFileInput) {
    if (importDataBtn._clickHandlerInstance) {
        importDataBtn.removeEventListener('click', importDataBtn._clickHandlerInstance);
        console.log('[Import Init] Предыдущий обработчик click для importDataBtn удален.');
    }
    importDataBtn.addEventListener('click', handleImportButtonClick);
    importDataBtn._clickHandlerInstance = handleImportButtonClick;
    console.log('[Import Init] Обработчик click для importDataBtn установлен.');

    if (importFileInput._changeHandlerInstance) {
        importFileInput.removeEventListener('change', importFileInput._changeHandlerInstance);
        console.log('[Import Init] Предыдущий обработчик change для importFileInput удален.');
    }
    importFileInput.addEventListener('change', handleImportFileChange);
    importFileInput._changeHandlerInstance = handleImportFileChange;
    console.log('[Import Init] Обработчик change для importFileInput установлен.');
} else {
    console.error(
        '[Import Init] Не найдены элементы importDataBtn или importFileInput. Флоу импорта не будет работать.',
    );
}

// Wrapper для модуля Import/Export
async function _processActualImport(jsonString) {
    return _processActualImportModule(jsonString);
}

// Wrapper для модуля Import/Export
async function performForcedBackup() {
    return performForcedBackupModule();
}

function showNotification(message, type = 'success', duration = 5000) {
    ensureNotificationIconlessStyles();
    console.log(
        `[SHOW_NOTIFICATION_CALL_V5.2_INLINE_STYLE] Message: "${message}", Type: "${type}", Duration: ${duration}, Timestamp: ${new Date().toISOString()}`,
    );
    let callStackInfo = 'N/A';
    try {
        const err = new Error();
        if (err.stack) {
            const stackLines = err.stack.split('\n');
            callStackInfo = stackLines
                .slice(2, 5)
                .map((line) => line.trim())
                .join(' -> ');
        }
    } catch (e) {}
    console.log(`[SHOW_NOTIFICATION_CALL_STACK_V5.2_INLINE_STYLE] Called from: ${callStackInfo}`);

    if (!message || typeof message !== 'string' || message.trim() === '') {
        console.warn(
            '[ShowNotification_V5.2_INLINE_STYLE] Вызван с пустым или невалидным сообщением. Уведомление не будет показано.',
            { messageContent: message, type, duration },
        );
        return;
    }

    const FADE_DURATION_MS = 300;
    const NOTIFICATION_ID = 'notification';

    let notificationElement = document.getElementById(NOTIFICATION_ID);
    let isNewNotification = !notificationElement;

    if (notificationElement) {
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Найдено существующее уведомление (ID: ${NOTIFICATION_ID}). Обновление...`,
        );
        cancelAnimationFrame(Number(notificationElement.dataset.animationFrameId || 0));
        clearTimeout(Number(notificationElement.dataset.hideTimeoutId || 0));
        clearTimeout(Number(notificationElement.dataset.removeTimeoutId || 0));
        notificationElement.style.transform = 'translateX(0)';
        notificationElement.style.opacity = '1';
    } else {
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Существующее уведомление не найдено. Создание нового (ID: ${NOTIFICATION_ID}).`,
        );
        notificationElement = document.createElement('div');
        notificationElement.id = NOTIFICATION_ID;
        notificationElement.setAttribute('role', 'alert');
        notificationElement.style.willChange = 'transform, opacity';
        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
    }

    let bgColorClass = 'bg-green-500 dark:bg-green-600';
    let iconClass = 'fa-check-circle';

    switch (type) {
        case 'error':
            bgColorClass = 'bg-red-600 dark:bg-red-700';
            iconClass = 'fa-times-circle';
            break;
        case 'warning':
            bgColorClass = 'bg-yellow-500 dark:bg-yellow-600';
            iconClass = 'fa-exclamation-triangle';
            break;
        case 'info':
            bgColorClass = 'bg-blue-500 dark:bg-blue-600';
            iconClass = 'fa-info-circle';
            break;
    }

    const colorClassesToRemove = [
        'bg-green-500',
        'dark:bg-green-600',
        'bg-red-600',
        'dark:bg-red-700',
        'bg-yellow-500',
        'dark:bg-yellow-600',
        'bg-blue-500',
        'dark:bg-blue-600',
    ];
    notificationElement.classList.remove(...colorClassesToRemove);

    notificationElement.className = `fixed p-4 rounded-lg shadow-xl text-white text-sm font-medium transform transition-all duration-${FADE_DURATION_MS} ease-out max-w-sm sm:max-w-md ${bgColorClass}`;

    notificationElement.style.top = '20px';
    notificationElement.style.right = '20px';
    notificationElement.style.bottom = 'auto';
    notificationElement.style.left = 'auto';

    notificationElement.style.zIndex = '200000';

    let closeButton = notificationElement.querySelector('.notification-close-btn');
    let messageSpan = notificationElement.querySelector('.notification-message-span');
    let iconElement = notificationElement.querySelector('.notification-icon-i');

    if (!closeButton || !messageSpan || !iconElement) {
        notificationElement.innerHTML = '';

        const iconContainer = document.createElement('div');
        iconContainer.className = 'flex items-center';

        iconElement = document.createElement('i');
        try {
            iconElement.style.color = 'var(--color-primary)';
        } catch (e) {}

        messageSpan = document.createElement('span');
        messageSpan.className = 'flex-1 notification-message-span';

        iconContainer.appendChild(iconElement);
        iconContainer.appendChild(messageSpan);

        closeButton = document.createElement('button');
        closeButton.setAttribute('type', 'button');
        closeButton.setAttribute('aria-label', 'Закрыть уведомление');
        closeButton.className =
            'ml-4 p-1 text-current opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-white rounded-full flex items-center justify-center w-6 h-6 leading-none notification-close-btn';
        closeButton.innerHTML = '<i class="fas fa-times fa-sm"></i>';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'flex items-center justify-between w-full';
        contentWrapper.appendChild(iconContainer);
        contentWrapper.appendChild(closeButton);

        notificationElement.appendChild(contentWrapper);
    }

    messageSpan.textContent = message;

    const closeAndRemove = () => {
        if (!document.body.contains(notificationElement)) {
            console.log(
                `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Элемент (msg: "${messageSpan.textContent}") уже удален, выход.`,
            );
            return;
        }
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Запуск закрытия для (msg: "${messageSpan.textContent}").`,
        );

        clearTimeout(Number(notificationElement.dataset.hideTimeoutId));
        clearTimeout(Number(notificationElement.dataset.removeTimeoutId));

        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Анимация скрытия для (msg: "${messageSpan.textContent}") запущена.`,
        );

        const currentRemoveId = setTimeout(() => {
            if (document.body.contains(notificationElement)) {
                notificationElement.remove();
                console.log(
                    `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Элемент (msg: "${messageSpan.textContent}") удален из DOM по таймеру.`,
                );
            }
        }, FADE_DURATION_MS);
        notificationElement.dataset.removeTimeoutId = currentRemoveId.toString();
    };

    if (closeButton._clickHandler) {
        closeButton.removeEventListener('click', closeButton._clickHandler);
    }
    closeButton._clickHandler = (e) => {
        e.stopPropagation();
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Клик по крестику для (msg: "${messageSpan.textContent}").`,
        );
        closeAndRemove();
    };
    closeButton.addEventListener('click', closeButton._clickHandler);

    if (isNewNotification) {
        document.body.appendChild(notificationElement);
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Новое уведомление (msg: "${message}") добавлено в DOM.`,
        );
    }

    if (!isNewNotification) {
        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
    }

    notificationElement.dataset.animationFrameId = requestAnimationFrame(() => {
        if (document.body.contains(notificationElement)) {
            notificationElement.style.transform = 'translateX(0)';
            notificationElement.style.opacity = '1';
            console.log(
                `[ShowNotification_V5.2_INLINE_STYLE] Анимация появления/обновления для (msg: "${message}") запущена.`,
            );
        }
    }).toString();

    if (duration > 0) {
        const hideTimeoutId = setTimeout(closeAndRemove, duration);
        notificationElement.dataset.hideTimeoutId = hideTimeoutId.toString();
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Установлен hideTimeoutId: ${hideTimeoutId} на ${duration}ms для (msg: "${message}").`,
        );
    } else if (duration === 0) {
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Duration is 0 для (msg: "${message}"). Автоматическое закрытие НЕ будет установлено.`,
        );
    }
}

const DEFAULT_MAIN_ALGORITHM = JSON.parse(JSON.stringify(algorithms.main));

const DEFAULT_OTHER_SECTIONS = {};
for (const sectionKey in algorithms) {
    if (sectionKey !== 'main' && Object.prototype.hasOwnProperty.call(algorithms, sectionKey)) {
        DEFAULT_OTHER_SECTIONS[sectionKey] = JSON.parse(JSON.stringify(algorithms[sectionKey]));
    }
}

// Wrapper для модуля Tabs Overflow
function updateVisibleTabs() {
    return updateVisibleTabsModule();
}

// Wrapper для модуля Tabs Overflow
function setupTabsOverflow() {
    return setupTabsOverflowModule();
}

// Wrapper для модуля Tabs Overflow
function handleMoreTabsBtnClick(e) {
    return handleMoreTabsBtnClickModule(e);
}

// Wrapper для модуля Tabs Overflow
function clickOutsideTabsHandler(e) {
    return clickOutsideTabsHandlerModule(e);
}

// Wrapper для модуля Tabs Overflow
function handleTabsResize() {
    return handleTabsResizeModule();
}


async function saveNewAlgorithm() {
    const addModal = document.getElementById('addModal');
    const section = addModal?.dataset.section;
    const newAlgorithmTitleInput = document.getElementById('newAlgorithmTitle');
    const newAlgorithmDescInput = document.getElementById('newAlgorithmDesc');
    const newStepsContainer = document.getElementById('newSteps');
    const saveButton = document.getElementById('saveNewAlgorithmBtn');

    if (
        !addModal ||
        !section ||
        !newAlgorithmTitleInput ||
        !newAlgorithmDescInput ||
        !newStepsContainer ||
        !saveButton
    ) {
        console.error('saveNewAlgorithm: Отсутствуют необходимые элементы DOM.');
        showNotification(
            'Ошибка: Не найдены элементы формы для сохранения нового алгоритма.',
            'error',
        );
        return;
    }

    console.log(`[Save New Algorithm] Start. Section: ${section}`);

    const finalTitle = newAlgorithmTitleInput.value.trim();
    const newDescription = newAlgorithmDescInput.value.trim();

    if (!finalTitle) {
        showNotification('Заголовок нового алгоритма не может быть пустым.', 'warning');
        newAlgorithmTitleInput.focus();
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const {
        steps: newStepsBase,
        screenshotOps,
        isValid,
    } = extractStepsDataFromEditForm(newStepsContainer, false);

    if (!isValid || newStepsBase.length === 0) {
        showNotification('Новый алгоритм должен содержать хотя бы один непустой шаг.', 'warning');
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
        return;
    }

    console.log(
        `[Save New Algorithm] Извлечено: ${newStepsBase.length} шагов, ${screenshotOps.length} операций со скриншотами.`,
    );

    let transaction;
    let saveSuccessful = false;
    let newAlgorithmData = null;
    const newAlgorithmId = `${section}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    let finalSteps = JSON.parse(JSON.stringify(newStepsBase));

    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
        const screenshotsStore = transaction.objectStore('screenshots');
        const algorithmsStore = transaction.objectStore('algorithms');
        console.log('[Save New Algorithm TX] Транзакция начата.');

        const addScreenshotPromises = [];
        const newScreenshotIdsMap = {};

        screenshotOps
            .filter((op) => op.action === 'add')
            .forEach((op) => {
                const { stepIndex, blob } = op;
                if (
                    !(blob instanceof Blob) ||
                    typeof stepIndex !== 'number' ||
                    stepIndex < 0 ||
                    !finalSteps[stepIndex]
                ) {
                    console.warn(
                        `[Save New Algorithm TX] Пропуск невалидной операции добавления скриншота:`,
                        op,
                    );
                    return;
                }

                addScreenshotPromises.push(
                    new Promise((resolve, reject) => {
                        const tempName = `${finalTitle || 'Новый алгоритм'}, изобр. ${
                            Date.now() + Math.random()
                        }`;
                        const record = {
                            blob,
                            parentId: newAlgorithmId,
                            parentType: 'algorithm',
                            stepIndex,
                            name: tempName,
                            uploadedAt: new Date().toISOString(),
                        };
                        const request = screenshotsStore.add(record);
                        request.onsuccess = (e) => {
                            const newId = e.target.result;
                            console.log(
                                `[Save New Algorithm TX] Добавлен скриншот, новый ID: ${newId} для шага ${stepIndex}`,
                            );
                            if (!newScreenshotIdsMap[stepIndex])
                                newScreenshotIdsMap[stepIndex] = [];
                            newScreenshotIdsMap[stepIndex].push(newId);
                            resolve();
                        };
                        request.onerror = (e) => {
                            console.error(
                                `[Save New Algorithm TX] Ошибка добавления скриншота для шага ${stepIndex}:`,
                                e.target.error,
                            );
                            reject(e.target.error || new Error('Ошибка добавления скриншота'));
                        };
                    }),
                );
            });

        if (addScreenshotPromises.length > 0) {
            await Promise.all(addScreenshotPromises);
            console.log('[Save New Algorithm TX] Операции добавления скриншотов завершены.');
        }

        finalSteps = finalSteps.map((step, index) => {
            const newlyAddedIds = newScreenshotIdsMap[index] || [];
            if (newlyAddedIds.length > 0) {
                step.screenshotIds = [...newlyAddedIds];
            } else {
                delete step.screenshotIds;
            }
            delete step._tempScreenshotBlobs;
            delete step._screenshotsToDelete;
            delete step.existingScreenshotIds;
            delete step.tempScreenshotsCount;
            delete step.deletedScreenshotIds;
            return step;
        });
        console.log('[Save New Algorithm TX] Финальный массив шагов подготовлен с ID скриншотов.');

        const timestamp = new Date().toISOString();
        newAlgorithmData = {
            id: newAlgorithmId,
            title: finalTitle,
            description: newDescription,
            steps: finalSteps,
            section: section,
            dateAdded: timestamp,
            dateUpdated: timestamp,
        };

        if (!algorithms[section]) {
            algorithms[section] = [];
        }
        algorithms[section].push(newAlgorithmData);
        console.log(
            `[Save New Algorithm TX] Новый алгоритм ${newAlgorithmId} добавлен в память [${section}].`,
        );

        const algorithmContainerToSave = { section: 'all', data: algorithms };
        console.log("[Save New Algorithm TX] Запрос put для всего контейнера 'algorithms'...");
        const putAlgoReq = algorithmsStore.put(algorithmContainerToSave);

        await new Promise((resolve, reject) => {
            putAlgoReq.onerror = (e) =>
                reject(e.target.error || new Error('Ошибка сохранения контейнера algorithms'));
            transaction.oncomplete = () => {
                console.log('[Save New Algorithm TX] Транзакция успешно завершена (oncomplete).');
                saveSuccessful = true;
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    '[Save New Algorithm TX] ОШИБКА ТРАНЗАКЦИИ (onerror):',
                    e.target.error,
                );
                saveSuccessful = false;
                reject(e.target.error || new Error('Ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn(
                    '[Save New Algorithm TX] Транзакция ПРЕРВАНА (onabort):',
                    e.target.error,
                );
                saveSuccessful = false;
                reject(e.target.error || new Error('Транзакция прервана'));
            };
        });
    } catch (error) {
        console.error(
            `[Save New Algorithm] КРИТИЧЕСКАЯ ОШИБКА сохранения для нового алгоритма в секции ${section}:`,
            error,
        );
        if (transaction && transaction.readyState !== 'done' && transaction.abort) {
            try {
                transaction.abort();
                console.log('[Save New Algorithm] Транзакция отменена в catch.');
            } catch (e) {
                console.error('[Save New Algorithm] Ошибка при отмене транзакции в catch:', e);
            }
        }
        saveSuccessful = false;
        if (algorithms[section] && newAlgorithmData) {
            const indexToRemove = algorithms[section].findIndex(
                (a) => a.id === newAlgorithmData.id,
            );
            if (indexToRemove !== -1) {
                algorithms[section].splice(indexToRemove, 1);
                console.warn(
                    `[Save New Algorithm] Новый алгоритм ${newAlgorithmData.id} удален из памяти из-за ошибки сохранения.`,
                );
            }
        }
        showNotification(
            `Произошла критическая ошибка при сохранении нового алгоритма: ${
                error.message || error
            }`,
            'error',
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
        }
    }

    if (saveSuccessful && newAlgorithmData) {
        console.log(`[Save New Algorithm] Алгоритм ${newAlgorithmData.id} успешно сохранен.`);
        if (typeof updateSearchIndex === 'function') {
            updateSearchIndex('algorithms', newAlgorithmData.id, newAlgorithmData, 'add', null)
                .then(() =>
                    console.log(
                        `[Save New Algorithm] Индекс обновлен для нового алгоритма ${newAlgorithmData.id}.`,
                    ),
                )
                .catch((indexError) =>
                    console.error(
                        `[Save New Algorithm] Ошибка обновления индекса для нового алгоритма ${newAlgorithmData.id}:`,
                        indexError,
                    ),
                );
        } else {
            console.warn(
                `[Save New Algorithm] Не удалось обновить индекс для нового алгоритма (функция не найдена).`,
            );
        }

        if (typeof renderAlgorithmCards === 'function') {
            renderAlgorithmCards(section);
        } else {
            console.warn(
                '[Save New Algorithm] Функция renderAlgorithmCards не найдена, UI может не обновиться.',
            );
        }

        try {
            const draftPdfs = Array.from(addModal._tempPdfFiles || []);
            if (draftPdfs.length > 0) {
                await addPdfRecords(draftPdfs, 'algorithm', newAlgorithmData.id);
                console.log(
                    `[Save New Algorithm] Добавлено PDF: ${draftPdfs.length} для algorithm:${newAlgorithmData.id}`,
                );
            }
        } catch (pdfErr) {
            console.error(
                '[Save New Algorithm] Ошибка сохранения PDF-файлов для нового алгоритма:',
                pdfErr,
            );
            if (typeof showNotification === 'function')
                showNotification('PDF не удалось сохранить для нового алгоритма.', 'warning');
        } finally {
            delete addModal._tempPdfFiles;
            addModal.dataset.pdfDraftWired = '0';
            const draftList = addModal.querySelector('.pdf-draft-list');
            if (draftList) draftList.innerHTML = '';
        }

        showNotification('Новый алгоритм успешно добавлен.');
        initialAddState = null;
        addModal.classList.add('hidden');
        requestAnimationFrame(() => {
            if (getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        });
        newAlgorithmTitleInput.value = '';
        newAlgorithmDescInput.value = '';
        newStepsContainer.innerHTML = '';
        const firstStepDiv = newStepsContainer.querySelector('.edit-step');
        if (firstStepDiv) {
            const thumbsContainer = firstStepDiv.querySelector('#screenshotThumbnailsContainer');
            if (thumbsContainer) {
                clearTemporaryThumbnailsFromContainer(thumbsContainer);
            }
            delete firstStepDiv._tempScreenshotBlobs;
            delete firstStepDiv.dataset.screenshotsToDelete;
        }
    } else if (!newAlgorithmData && saveSuccessful) {
        console.error(
            '[Save New Algorithm] Сохранение успешно, но newAlgorithmData отсутствует. Это неожиданно.',
        );
    } else {
        console.error(
            `[Save New Algorithm] Сохранение нового алгоритма в секции ${section} НЕ УДАЛОСЬ.`,
        );
    }
}

function initUI() {
    setActiveTab('main');
}

async function setActiveTab(tabId, warningJustAccepted = false) {
    const targetTabId = tabId + 'Tab';
    const targetContentId = tabId + 'Content';

    const allTabButtons = document.querySelectorAll('.tab-btn');
    const allTabContents = document.querySelectorAll('.tab-content');
    const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');

    const FADE_DURATION = 150;

    console.log(`[setActiveTab v.Corrected] Активация вкладки: ${tabId}`);

    if (
        tabId === 'blacklistedClients' &&
        State.userPreferences.showBlacklistUsageWarning &&
        !warningJustAccepted
    ) {
        if (typeof showBlacklistWarning === 'function') {
            showBlacklistWarning();
        } else {
            console.error('Функция showBlacklistWarning не найдена!');
        }
        return;
    }

    if (showFavoritesHeaderButton) {
        showFavoritesHeaderButton.classList.toggle('text-primary', tabId === 'favorites');
    }

    allTabButtons.forEach((button) => {
        const isActive = button.id === targetTabId && tabId !== 'favorites';
        if (isActive) {
            button.classList.add('tab-active');
            button.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        } else {
            button.classList.remove('tab-active');
            button.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        }
    });

    if (State.currentSection === tabId && !warningJustAccepted) {
        console.log(`[setActiveTab v.Corrected] Вкладка ${tabId} уже активна. Выход.`);
        return;
    }

    const previousSection = State.currentSection;
    State.currentSection = tabId;
    localStorage.setItem('lastActiveTabCopilot1CO', tabId);

    const targetContent = document.getElementById(targetContentId);
    let currentActiveContent = null;

    allTabContents.forEach((content) => {
        if (!content.classList.contains('hidden')) {
            currentActiveContent = content;
        }
    });

    if (currentActiveContent && currentActiveContent !== targetContent) {
        currentActiveContent.classList.add('is-hiding');

        setTimeout(() => {
            currentActiveContent.classList.add('hidden');
            currentActiveContent.classList.remove('is-hiding');

            if (targetContent) {
                targetContent.classList.add('is-hiding');
                targetContent.classList.remove('hidden');

                requestAnimationFrame(() => {
                    targetContent.classList.remove('is-hiding');
                });
            }
        }, FADE_DURATION);
    } else if (targetContent) {
        targetContent.classList.add('is-hiding');
        targetContent.classList.remove('hidden');
        requestAnimationFrame(() => {
            targetContent.classList.remove('is-hiding');
        });
    }

    if (targetContent && tabId === 'favorites') {
        if (typeof renderFavoritesPage === 'function') {
            await renderFavoritesPage();
        } else {
            console.error('setActiveTab: Функция renderFavoritesPage не найдена!');
        }
    }

    if (typeof updateVisibleTabs === 'function') {
        requestAnimationFrame(updateVisibleTabs);
    }

    console.log(`[setActiveTab v.Corrected] Вкладка ${tabId} успешно активирована с анимацией.`);
    requestAnimationFrame(() => {
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('overflow-hidden');
        }
    });
}

async function renderAlgorithmCards(section) {
    const sectionAlgorithms = algorithms?.[section];
    const containerId = section + 'Algorithms';
    const container = document.getElementById(containerId);

    if (!container) {
        console.error(
            `[renderAlgorithmCards v8.1 - Capture Fix] Контейнер #${containerId} не найден.`,
        );
        return;
    }
    container.innerHTML = '';

    if (!sectionAlgorithms || !Array.isArray(sectionAlgorithms) || sectionAlgorithms.length === 0) {
        const sectionName = getSectionName(section) || `Раздел ${section}`;
        container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center col-span-full mb-2">В разделе "${sectionName}" пока нет алгоритмов.</p>`;
        if (typeof applyCurrentView === 'function') applyCurrentView(containerId);
        return;
    }

    const fragment = document.createDocumentFragment();
    const safeEscapeHtml = typeof escapeHtml === 'function' ? escapeHtml : (text) => text;

    for (const algorithm of sectionAlgorithms) {
        if (!algorithm || typeof algorithm !== 'object' || !algorithm.id) {
            console.warn(
                `[renderAlgorithmCards v8.1] Пропуск невалидного объекта алгоритма в секции ${section}:`,
                algorithm,
            );
            continue;
        }

        const card = document.createElement('div');
        card.className =
            'algorithm-card js-algorithm-card-style-target view-item transition cursor-pointer h-full flex flex-col bg-white dark:bg-gray-700 shadow-sm hover:shadow-md rounded-lg p-4';
        card.dataset.id = algorithm.id;

        const titleText = algorithm.title || 'Без заголовка';

        let descriptionText = algorithm.description;
        if (!descriptionText && algorithm.steps && algorithm.steps.length > 0) {
            descriptionText = algorithm.steps[0].description || algorithm.steps[0].title || '';
        }

        const descriptionHTML = descriptionText
            ? `<p class="text-gray-600 dark:text-gray-400 text-sm mt-1 line-clamp-2 flex-grow">${safeEscapeHtml(
                  descriptionText,
              )}</p>`
            : '';

        const isFav = isFavorite('algorithm', String(algorithm.id));
        const favButtonHTML = getFavoriteButtonHTML(
            algorithm.id,
            'algorithm',
            section,
            titleText,
            descriptionText || '',
            isFav,
        );

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-900 dark:text-gray-100 truncate flex-grow pr-2" title="${safeEscapeHtml(
                    titleText,
                )}">${safeEscapeHtml(titleText)}</h3>
                <div class="flex-shrink-0">${favButtonHTML}</div>
            </div>
            ${descriptionHTML}
        `;

        card.addEventListener('click', (event) => {
            if (event.target.closest('.toggle-favorite-btn')) {
                return;
            }
            if (typeof showAlgorithmDetail === 'function') {
                showAlgorithmDetail(algorithm, section);
            } else {
                console.error(
                    '[renderAlgorithmCards v8.1] Функция showAlgorithmDetail не определена.',
                );
            }
        });
        fragment.appendChild(card);
    }

    container.appendChild(fragment);

    if (typeof applyCurrentView === 'function') {
        applyCurrentView(containerId);
    }
    console.log(
        `[renderAlgorithmCards v8.1] Рендеринг для секции ${section} завершен с кнопками 'В избранное' и явной проверкой клика.`,
    );
}

function handleNoInnLinkClick(event) {
    event.preventDefault();
    if (typeof showNoInnModal === 'function') {
        showNoInnModal();
    } else {
        console.error('Функция showNoInnModal не определена!');
        if (typeof showNotification === 'function') {
            showNotification('Функция для обработки этого действия не найдена.', 'error');
        }
    }
}

async function renderMainAlgorithm() {
    console.log('[renderMainAlgorithm v9 - Favorites Removed for Main] Вызвана.');
    const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
    if (!mainAlgorithmContainer) {
        console.error('[renderMainAlgorithm v9] Контейнер #mainAlgorithm не найден.');
        return;
    }

    mainAlgorithmContainer.innerHTML = '';

    if (
        !algorithms ||
        typeof algorithms !== 'object' ||
        !algorithms.main ||
        typeof algorithms.main !== 'object' ||
        !Array.isArray(algorithms.main.steps)
    ) {
        console.error(
            '[renderMainAlgorithm v9] Данные главного алгоритма (algorithms.main.steps) отсутствуют или невалидны:',
            algorithms?.main,
        );
        const errorP = document.createElement('p');
        errorP.className = 'text-red-500 dark:text-red-400 p-4 text-center font-medium';
        errorP.textContent = 'Ошибка: Не удалось загрузить шаги главного алгоритма.';
        mainAlgorithmContainer.appendChild(errorP);
        const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
        if (mainTitleElement) mainTitleElement.textContent = 'Главный алгоритм работы';
        return;
    }

    const mainSteps = algorithms.main.steps;

    const savedCollapse = await loadMainAlgoCollapseState();
    const validIndices =
        savedCollapse && savedCollapse.stepsCount === mainSteps.length
            ? savedCollapse.collapsedIndices.filter(
                  (i) => Number.isInteger(i) && i >= 0 && i < mainSteps.length,
              )
            : [];
    const collapsedSet = new Set(validIndices);

    if (mainSteps.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.className = 'text-gray-500 dark:text-gray-400 p-4 text-center';
        emptyP.textContent = 'В главном алгоритме пока нет шагов.';
        mainAlgorithmContainer.appendChild(emptyP);
        const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
        if (mainTitleElement) {
            mainTitleElement.textContent = algorithms.main.title || DEFAULT_MAIN_ALGORITHM.title;
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    mainSteps.forEach((step, index) => {
        if (!step || typeof step !== 'object') {
            console.warn('[renderMainAlgorithm v9] Пропуск невалидного объекта шага:', step);
            const errorDiv = document.createElement('div');
            errorDiv.className =
                'algorithm-step bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 mb-3 rounded-lg shadow-sm text-red-700 dark:text-red-300';
            errorDiv.textContent = `Ошибка: Некорректные данные для шага ${index + 1}.`;
            fragment.appendChild(errorDiv);
            return;
        }

        const stepDiv = document.createElement('div');
        stepDiv.className =
            'algorithm-step bg-white dark:bg-gray-700 p-content-sm rounded-lg shadow-sm mb-3';

        if (step.isCopyable) {
            stepDiv.classList.add('copyable-step-active');
            stepDiv.title = 'Нажмите, чтобы скопировать содержимое шага';
            stepDiv.style.cursor = 'pointer';
        } else {
            stepDiv.classList.remove('copyable-step-active');
            stepDiv.title = '';
            stepDiv.style.cursor = 'default';
        }

        stepDiv.addEventListener('click', (e) => {
            if (e.target.closest('h3')) return;
            if (e.target.tagName === 'A' || e.target.closest('A')) return;

            const currentStepData = algorithms.main.steps[index];
            if (currentStepData && currentStepData.isCopyable) {
                const textToCopy = getStepContentAsText(currentStepData);
                copyToClipboard(textToCopy, 'Содержимое шага скопировано!');
            }
        });

        if (step.additionalInfoText && step.additionalInfoShowTop) {
            const additionalInfoTopDiv = document.createElement('div');
            additionalInfoTopDiv.className =
                'additional-info-top mb-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words';
            additionalInfoTopDiv.innerHTML =
                typeof linkify === 'function'
                    ? linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            stepDiv.appendChild(additionalInfoTopDiv);
        }

        const titleH3 = document.createElement('h3');
        titleH3.className = 'font-bold text-base mb-1 text-gray-900 dark:text-gray-100';
        titleH3.textContent = step.title || 'Без заголовка';
        stepDiv.appendChild(titleH3);

        let contentTarget = stepDiv;
        if (step.isCollapsible) {
            stepDiv.classList.add('collapsible');
            const body = document.createElement('div');
            body.className = 'collapsible-body pt-1';
            stepDiv.appendChild(body);
            contentTarget = body;
            titleH3.style.cursor = 'pointer';

            if (collapsedSet.has(index)) {
                stepDiv.classList.add('is-collapsed');
            }

            titleH3.addEventListener('click', async (e) => {
                e.stopPropagation();
                stepDiv.classList.toggle('is-collapsed');
                const nowCollapsed = stepDiv.classList.contains('is-collapsed');
                if (nowCollapsed) collapsedSet.add(index);
                else collapsedSet.delete(index);
                await saveMainAlgoCollapseState({
                    stepsCount: mainSteps.length,
                    collapsedIndices: Array.from(collapsedSet),
                });
            });
        }

        const descriptionP = document.createElement('p');
        descriptionP.className = 'text-sm text-gray-700 dark:text-gray-300 mt-1 break-words';
        descriptionP.innerHTML =
            typeof linkify === 'function'
                ? linkify(step.description || 'Нет описания')
                : escapeHtml(step.description || 'Нет описания');
        stepDiv.appendChild(descriptionP);
        contentTarget.appendChild(descriptionP);

        if (step.example) {
            const exampleContainer = document.createElement('div');
            exampleContainer.className =
                'example-container mt-2 text-sm text-gray-600 dark:text-gray-400 break-words';
            const exampleLabel = document.createElement('strong');
            exampleLabel.className = 'block mb-1';
            exampleContainer.appendChild(exampleLabel);

            if (
                typeof step.example === 'object' &&
                step.example.type === 'list' &&
                Array.isArray(step.example.items)
            ) {
                exampleLabel.textContent = step.example.intro ? '' : 'Пример (список):';
                if (step.example.intro) {
                    const introP = document.createElement('p');
                    introP.className = 'italic mb-1';
                    introP.innerHTML =
                        typeof linkify === 'function'
                            ? linkify(step.example.intro)
                            : escapeHtml(step.example.intro);
                    exampleContainer.appendChild(introP);
                }
                const ul = document.createElement('ul');
                ul.className = 'list-disc list-inside pl-5 space-y-0.5';
                step.example.items.forEach((item) => {
                    const li = document.createElement('li');
                    li.innerHTML =
                        typeof linkify === 'function'
                            ? linkify(String(item))
                            : escapeHtml(String(item));
                    ul.appendChild(li);
                });
                exampleContainer.appendChild(ul);
            } else if (typeof step.example === 'string') {
                exampleLabel.textContent = 'Пример:';
                const exampleP = document.createElement('p');
                exampleP.innerHTML =
                    typeof linkify === 'function'
                        ? linkify(step.example)
                        : escapeHtml(step.example);
                exampleContainer.appendChild(exampleP);
            } else {
                exampleLabel.textContent = 'Пример (данные):';
                try {
                    const pre = document.createElement('pre');
                    pre.className =
                        'text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded mt-1 overflow-x-auto font-mono whitespace-pre-wrap';
                    const code = document.createElement('code');
                    code.textContent = JSON.stringify(step.example, null, 2);
                    pre.appendChild(code);
                    exampleContainer.appendChild(pre);
                } catch (e) {
                    const errorP = document.createElement('p');
                    errorP.className = 'text-xs text-red-500 mt-1';
                    errorP.textContent = '[Неподдерживаемый формат примера]';
                    exampleContainer.appendChild(errorP);
                }
            }
            stepDiv.appendChild(exampleContainer);
            contentTarget.appendChild(exampleContainer);
        }

        if (step.showNoInnHelp === true) {
            const innP = document.createElement('p');
            innP.className = 'text-sm text-gray-500 dark:text-gray-400 mt-3';
            const innLink = document.createElement('a');
            innLink.href = '#';
            innLink.id = `noInnLink_main_${index}`;
            innLink.className = 'text-primary hover:underline';
            innLink.textContent = 'Что делать, если клиент не может назвать ИНН?';

            if (innLink._clickHandler) innLink.removeEventListener('click', innLink._clickHandler);
            innLink.addEventListener('click', handleNoInnLinkClick);
            innLink._clickHandler = handleNoInnLinkClick;

            innP.appendChild(innLink);
            stepDiv.appendChild(innP);
        }

        if (step.additionalInfoText && step.additionalInfoShowBottom) {
            const additionalInfoBottomDiv = document.createElement('div');
            additionalInfoBottomDiv.className =
                'additional-info-bottom mt-3 p-2 border-t border-gray-200 dark:border-gray-600 pt-3 text-sm text-gray-700 dark:text-gray-300 rounded bg-gray-50 dark:bg-gray-700/50 break-words';
            additionalInfoBottomDiv.innerHTML =
                typeof linkify === 'function'
                    ? linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            stepDiv.appendChild(additionalInfoBottomDiv);
            contentTarget.appendChild(additionalInfoBottomDiv);
        }

        fragment.appendChild(stepDiv);
    });

    mainAlgorithmContainer.appendChild(fragment);
    await saveMainAlgoCollapseState({
        stepsCount: mainSteps.length,
        collapsedIndices: Array.from(collapsedSet),
    });

    const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
    if (mainTitleElement) {
        mainTitleElement.textContent = algorithms.main.title || DEFAULT_MAIN_ALGORITHM.title;
    }
    console.log(
        `[renderMainAlgorithm v9] Рендеринг ${mainSteps.length} шагов завершен. Кнопка "В избранное" для главного алгоритма удалена.`,
    );
}

async function loadMainAlgoCollapseState() {
    try {
        const raw = localStorage.getItem(MAIN_ALGO_COLLAPSE_KEY);
        if (!raw) return { stepsCount: 0, collapsedIndices: [] };
        const parsed = JSON.parse(raw);
        const stepsCount =
            parsed && typeof parsed.stepsCount === 'number' && parsed.stepsCount >= 0
                ? parsed.stepsCount
                : 0;
        const collapsedIndices = Array.isArray(parsed?.collapsedIndices)
            ? parsed.collapsedIndices.filter((i) => Number.isInteger(i) && i >= 0)
            : [];
        return { stepsCount, collapsedIndices };
    } catch (e) {
        console.warn('[MainAlgoCollapseState] Invalid JSON in localStorage:', e);
        return { stepsCount: 0, collapsedIndices: [] };
    }
}

async function saveMainAlgoCollapseState(state) {
    try {
        const stepsCount =
            state && typeof state.stepsCount === 'number' && state.stepsCount >= 0
                ? state.stepsCount
                : 0;
        const uniqueValid = Array.isArray(state?.collapsedIndices)
            ? Array.from(
                  new Set(state.collapsedIndices.filter((i) => Number.isInteger(i) && i >= 0)),
              )
            : [];
        const payload = { stepsCount, collapsedIndices: uniqueValid };
        localStorage.setItem(MAIN_ALGO_COLLAPSE_KEY, JSON.stringify(payload));
        return true;
    } catch (e) {
        console.error('[MainAlgoCollapseState] Save failed:', e);
        return false;
    }
}

// Wrapper для модуля Screenshots
async function showScreenshotViewerModal(screenshots, algorithmId, algorithmTitle) {
    return showScreenshotViewerModalModule(screenshots, algorithmId, algorithmTitle);
}

// Wrapper для модуля Screenshots
function renderScreenshotThumbnails(container, screenshots, onOpenLightbox, modalState = null) {
    return renderScreenshotThumbnailsModule(container, screenshots, onOpenLightbox, modalState);
}

// Wrapper для модуля Screenshots
function renderScreenshotList(container, screenshots, onOpenLightbox, onItemClick = null, modalState = null) {
    return renderScreenshotListModule(container, screenshots, onOpenLightbox, onItemClick, modalState);
}

// escapeHtml, normalizeBrokenEntities, decodeBasicEntitiesOnce импортируются из utils/html.js

async function showAlgorithmDetail(algorithm, section) {
    console.log(
        `[showAlgorithmDetail v11 - PDF Export Fix] Вызвана. Алгоритм ID: ${algorithm?.id}, Секция: ${section}`,
    );

    const algorithmModal = document.getElementById('algorithmModal');
    const modalTitleElement = document.getElementById('modalTitle');
    const algorithmStepsContainer = document.getElementById('algorithmSteps');
    const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');
    const editAlgorithmBtnModal = document.getElementById('editAlgorithmBtn');

    if (!algorithmModal || !modalTitleElement || !algorithmStepsContainer) {
        console.error(
            '[showAlgorithmDetail v11 Error] Не найдены основные элементы модального окна.',
        );
        showNotification(
            'Критическая ошибка интерфейса: не найдены элементы окна деталей.',
            'error',
        );
        return;
    }
    if (!algorithm || typeof algorithm !== 'object') {
        console.error(
            '[showAlgorithmDetail v11 Error] Передан некорректный объект алгоритма:',
            algorithm,
        );
        showNotification('Ошибка: Некорректные данные алгоритма.', 'error');
        return;
    }
    const currentAlgorithmId =
        section === 'main' || algorithm.id === 'main' ? 'main' : algorithm.id || null;
    if (currentAlgorithmId === null) {
        console.error(`[showAlgorithmDetail v11 Error] Не удалось определить ID алгоритма.`);
        showNotification('Ошибка: Не удалось определить ID алгоритма.', 'error');
        return;
    }

    algorithmModal.dataset.currentAlgorithmId = String(currentAlgorithmId);
    algorithmModal.dataset.currentSection = section;
    if (currentAlgorithmId !== 'main') {
        const host = algorithmStepsContainer.parentElement || algorithmStepsContainer;
        if (host)
            window.renderPdfAttachmentsSection?.(host, 'algorithm', String(currentAlgorithmId));
    }

    modalTitleElement.textContent = algorithm.title ?? 'Детали алгоритма';
    algorithmStepsContainer.innerHTML =
        '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Загрузка шагов...</p>';

    if (deleteAlgorithmBtn) deleteAlgorithmBtn.style.display = section === 'main' ? 'none' : '';
    if (editAlgorithmBtnModal) editAlgorithmBtnModal.style.display = '';

    const headerControlsContainer = modalTitleElement.parentElement.querySelector(
        '.flex.flex-wrap.gap-2.justify-end',
    );
    if (headerControlsContainer) {
        let exportButtonContainer = headerControlsContainer.querySelector(
            '.export-btn-placeholder-modal',
        );
        if (!exportButtonContainer) {
            exportButtonContainer = document.createElement('div');
            exportButtonContainer.className = 'export-btn-placeholder-modal';
            const exportButton = document.createElement('button');
            exportButton.id = 'exportAlgorithmToPdfBtn';
            exportButton.type = 'button';
            exportButton.className =
                'inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle';
            exportButton.title = 'Экспорт в PDF';
            exportButton.innerHTML = '<i class="fas fa-file-pdf"></i>';
            exportButtonContainer.appendChild(exportButton);
            if (editAlgorithmBtnModal) {
                editAlgorithmBtnModal.insertAdjacentElement('beforebegin', exportButtonContainer);
            } else if (deleteAlgorithmBtn) {
                deleteAlgorithmBtn.insertAdjacentElement('beforebegin', exportButtonContainer);
            } else {
                headerControlsContainer.insertBefore(
                    exportButtonContainer,
                    headerControlsContainer.firstChild,
                );
            }
        }
        const exportBtn = headerControlsContainer.querySelector('#exportAlgorithmToPdfBtn');
        if (exportBtn) {
            if (exportBtn._clickHandler) {
                exportBtn.removeEventListener('click', exportBtn._clickHandler);
            }
            exportBtn._clickHandler = () => {
                const content = document.getElementById('algorithmSteps');
                const title = document.getElementById('modalTitle').textContent;
                ExportService.exportElementToPdf(content, title, {
                    type: 'algorithm',
                    data: algorithm,
                });
            };
            exportBtn.addEventListener('click', exportBtn._clickHandler);
        }

        let favButtonContainer = headerControlsContainer.querySelector(
            '.fav-btn-placeholder-modal',
        );
        if (!favButtonContainer) {
            favButtonContainer = document.createElement('div');
            favButtonContainer.className = 'fav-btn-placeholder-modal';
            if (editAlgorithmBtnModal) {
                editAlgorithmBtnModal.insertAdjacentElement('beforebegin', favButtonContainer);
            } else if (deleteAlgorithmBtn) {
                deleteAlgorithmBtn.insertAdjacentElement('beforebegin', favButtonContainer);
            } else {
                headerControlsContainer.insertBefore(
                    favButtonContainer,
                    headerControlsContainer.firstChild,
                );
            }
        }

        if (section === 'main' || currentAlgorithmId === 'main') {
            favButtonContainer.innerHTML = '';
            console.log(
                "[showAlgorithmDetail v11] Кнопка 'В избранное' скрыта для главного алгоритма в модальном окне.",
            );
        } else {
            const itemType = 'algorithm';
            const itemId = currentAlgorithmId;
            const itemSection = section;
            const itemTitle = algorithm.title;
            const itemDesc =
                algorithm.steps?.[0]?.description ||
                algorithm.steps?.[0]?.title ||
                algorithm.description ||
                '';
            const isFav = isFavorite(itemType, itemId);
            favButtonContainer.innerHTML = getFavoriteButtonHTML(
                itemId,
                itemType,
                itemSection,
                itemTitle,
                itemDesc,
                isFav,
            );
            console.log(
                `[showAlgorithmDetail v11] Кнопка 'В избранное' отображена для алгоритма ID ${itemId} в модальном окне.`,
            );
        }
    } else {
        console.warn(
            '[showAlgorithmDetail v11] Контейнер для кнопок управления в шапке модалки не найден.',
        );
    }

    const isMainAlgorithm = section === 'main';

    try {
        if (!algorithm.steps || !Array.isArray(algorithm.steps)) {
            throw new Error('Данные шагов отсутствуют или некорректны.');
        }

        const stepHtmlPromises = algorithm.steps.map(async (step, index) => {
            if (!step || typeof step !== 'object') {
                console.warn(
                    `[showAlgorithmDetail v11 Step Render Warn] Пропуск невалидного объекта шага на индексе ${index}:`,
                    step,
                );
                return `<div class="algorithm-step bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-3 rounded shadow-sm text-red-700 dark:text-red-300">Ошибка: Некорректные данные для шага ${
                    index + 1
                }.</div>`;
            }

            let additionalInfoTopHTML = '';
            if (step.additionalInfoText && step.additionalInfoShowTop) {
                additionalInfoTopHTML = `
                    <div class="additional-info-top mb-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words">
                        ${
                            typeof linkify === 'function'
                                ? linkify(step.additionalInfoText)
                                : escapeHtml(step.additionalInfoText)
                        }
                    </div>`;
            }

            let screenshotIconHtml = '';
            let iconContainerHtml = '';
            if (!isMainAlgorithm) {
                const hasSavedScreenshotIds =
                    Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0;
                if (typeof renderScreenshotIcon === 'function') {
                    screenshotIconHtml = renderScreenshotIcon(
                        currentAlgorithmId,
                        index,
                        hasSavedScreenshotIds,
                    );
                    if (screenshotIconHtml) {
                        iconContainerHtml = `<div class="inline-block ml-2 align-middle">${screenshotIconHtml}</div>`;
                    }
                }
            }

            const descriptionHtml = `<p class="mt-1 text-base ${
                iconContainerHtml ? 'clear-both' : ''
            } break-words">${
                typeof linkify === 'function'
                    ? linkify(step.description ?? 'Нет описания.')
                    : escapeHtml(step.description ?? 'Нет описания.')
            }</p>`;
            let exampleHtml = '';
            if (step.example) {
                exampleHtml = `<div class="example-container mt-2 text-sm prose dark:prose-invert max-w-none break-words">`;
                if (
                    typeof step.example === 'object' &&
                    step.example.type === 'list' &&
                    Array.isArray(step.example.items)
                ) {
                    if (step.example.intro)
                        exampleHtml += `<p class="italic mb-1">${
                            typeof linkify === 'function'
                                ? linkify(step.example.intro)
                                : escapeHtml(step.example.intro)
                        }</p>`;
                    exampleHtml += `<ul class="list-disc list-inside pl-5 space-y-0.5">`;
                    step.example.items.forEach(
                        (item) =>
                            (exampleHtml += `<li>${
                                typeof linkify === 'function'
                                    ? linkify(String(item))
                                    : escapeHtml(String(item))
                            }</li>`),
                    );
                    exampleHtml += `</ul>`;
                } else if (typeof step.example === 'string') {
                    exampleHtml += `<strong>Пример:</strong><p class="mt-1">${
                        typeof linkify === 'function'
                            ? linkify(step.example)
                            : escapeHtml(step.example)
                    }</p>`;
                } else {
                    try {
                        exampleHtml += `<strong>Пример (данные):</strong><pre class="text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded mt-1 overflow-x-auto font-mono whitespace-pre-wrap"><code>${escapeHtml(
                            JSON.stringify(step.example, null, 2),
                        )}</code></pre>`;
                    } catch (e) {
                        exampleHtml += `<div class="text-xs text-red-500 mt-1">[Ошибка формата примера]</div>`;
                    }
                }
                exampleHtml += `</div>`;
            }

            let additionalInfoBottomHTML = '';
            if (step.additionalInfoText && step.additionalInfoShowBottom) {
                additionalInfoBottomHTML = `
                    <div class="additional-info-bottom mt-3 p-2 border-t border-gray-200 dark:border-gray-600 pt-3 text-sm text-gray-700 dark:text-gray-300 rounded bg-gray-50 dark:bg-gray-700/50 break-words">
                       ${
                           typeof linkify === 'function'
                               ? linkify(step.additionalInfoText)
                               : escapeHtml(step.additionalInfoText)
                       }
                    </div>`;
            }

            const stepTitle = escapeHtml(step.title ?? `Шаг ${index + 1}`);
            const stepHTML = `
                 <div class="algorithm-step bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-sm border-l-4 border-primary mb-3 relative">
                     ${additionalInfoTopHTML}
                     <h3 class="font-bold text-lg ${
                         iconContainerHtml ? 'inline' : ''
                     }" title="${stepTitle}">${stepTitle}</h3>
                     ${iconContainerHtml}
                     ${descriptionHtml}
                     ${exampleHtml}
                     ${additionalInfoBottomHTML}
                 </div>`;
            return stepHTML;
        });

        const stepsHtmlArray = await Promise.all(stepHtmlPromises);
        algorithmStepsContainer.innerHTML = stepsHtmlArray.join('');

        if (!isMainAlgorithm) {
            const newButtons = algorithmStepsContainer.querySelectorAll('.view-screenshot-btn');
            if (newButtons.length > 0) {
                newButtons.forEach((button) => {
                    if (typeof handleViewScreenshotClick === 'function') {
                        button.removeEventListener('click', handleViewScreenshotClick);
                        button.addEventListener('click', handleViewScreenshotClick);
                    }
                });
            }
        }
    } catch (error) {
        console.error('[showAlgorithmDetail v11 Step Render Error]', error);
        algorithmStepsContainer.innerHTML = `<p class="text-red-500 p-4 text-center">Ошибка при отображении шагов: ${error.message}</p>`;
    }

    algorithmModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    console.log(`[showAlgorithmDetail v11 Info] Модальное окно #${algorithmModal.id} показано.`);
}

function initStepInteractions(stepElement) {
    const header = stepElement.querySelector('.step-header');
    const titleInput = stepElement.querySelector('.step-title');
    const titlePreview = stepElement.querySelector('.step-title-preview');

    if (!header || !titleInput || !titlePreview) {
        console.warn(
            'initStepInteractions: Не найдены все необходимые элементы в шаге для инициализации.',
            stepElement,
        );
        return;
    }

    const updateTitlePreview = () => {
        titlePreview.value =
            titleInput.value ||
            `Шаг ${stepElement
                .querySelector('.step-number-label')
                .textContent.replace('Шаг ', '')}`;
    };

    titleInput.addEventListener('input', updateTitlePreview);
    updateTitlePreview();

    header.addEventListener('click', (event) => {
        if (event.target.closest('.step-drag-handle, .delete-step')) {
            return;
        }
        stepElement.classList.toggle('is-collapsed');
    });
}

function initCollapseAllButtons(container, stepsContainerSelector) {
    const titleElement = container.querySelector('.text-xl.font-bold');
    if (!titleElement) return;

    let controlsContainer = titleElement.parentElement.querySelector('.collapse-controls');
    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'collapse-controls flex items-center gap-2 ml-4';
        titleElement.parentElement.insertBefore(controlsContainer, titleElement.nextSibling);
    }

    controlsContainer.innerHTML = `
        <button type="button" class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300" data-action="collapse-all">Свернуть все</button>
        <button type="button" class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300" data-action="expand-all">Развернуть все</button>
    `;

    controlsContainer.addEventListener('click', (event) => {
        const action = event.target.dataset.action;
        if (action === 'collapse-all' || action === 'expand-all') {
            const stepsContainer = container.querySelector(stepsContainerSelector);
            if (stepsContainer) {
                const steps = stepsContainer.querySelectorAll('.edit-step');
                steps.forEach((step) => {
                    step.classList.toggle('is-collapsed', action === 'collapse-all');
                });
            }
        }
    });
}

function initViewToggles() {
    if (!window.__viewToggleDelegatedBound) {
        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.view-toggle') : null;
            if (!btn) return;
            handleViewToggleClick(e);
        });
        window.__viewToggleDelegatedBound = true;
    }

    document.querySelectorAll('.view-toggle').forEach((button) => {
        if (!button.__viewToggleDirectBound) {
            button.addEventListener('click', handleViewToggleClick);
            button.__viewToggleDirectBound = true;
        }
    });

    loadViewPreferences();
}

async function loadViewPreferences() {
    try {
        const prefs = await getFromIndexedDB('preferences', 'viewPreferences');
        State.viewPreferences = prefs?.views || {};
        document.querySelectorAll('[data-section-id]').forEach((container) => {
            const sectionId = container.dataset.sectionId;
            const defaultView = container.dataset.defaultView || 'cards';
            applyView(container, State.viewPreferences[sectionId] || defaultView);
        });
    } catch (error) {
        console.error('Error loading view preferences:', error);
        applyDefaultViews();
    }
}

function applyDefaultViews() {
    document.querySelectorAll('[data-section-id]').forEach((container) => {
        applyView(container, container.dataset.defaultView || 'cards');
    });
}

async function saveViewPreference(sectionId, view) {
    State.viewPreferences[sectionId] = view;
    try {
        await saveToIndexedDB('preferences', { id: 'viewPreferences', views: State.viewPreferences });
    } catch (error) {
        console.error('Error saving view preference:', error);
    }
}

function handleViewToggleClick(event) {
    const clickedButton =
        event && event.target && event.target.closest
            ? event.target.closest('.view-toggle')
            : event.currentTarget;
    if (!clickedButton) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    const desiredView = clickedButton.dataset.view;
    if (!desiredView) {
        console.warn('[handleViewToggleClick] data-view не задан у кнопки.');
        return;
    }

    const sectionRoot = clickedButton.closest('.tab-content') || document;

    let targetContainer = null;
    if (State.currentSection === 'reglaments') {
        const regList = sectionRoot.querySelector('#reglamentsList');
        const listVisible = regList && !regList.classList.contains('hidden');
        targetContainer = sectionRoot.querySelector(
            listVisible ? '#reglamentsContainer' : '#reglamentCategoryGrid',
        );
    }

    if (!targetContainer) {
        const visibleContainers = Array.from(
            sectionRoot.querySelectorAll('[data-section-id]'),
        ).filter((el) => {
            const style = window.getComputedStyle(el);
            return (
                !el.classList.contains('hidden') &&
                style.display !== 'none' &&
                !el.closest('.hidden')
            );
        });

        if (visibleContainers.length === 1) {
            targetContainer = visibleContainers[0];
        } else if (visibleContainers.length > 1) {
            const controlsBlock =
                clickedButton.closest(
                    '.actions-bar-container, .flex.items-center.gap-2, .flex.items-center.space-x-1.border, .flex.items-center.space-x-2, #globalReglamentActionsBar',
                ) || clickedButton.parentElement;

            let sib = controlsBlock ? controlsBlock.nextElementSibling : null;
            while (sib && !sib.matches('[data-section-id]')) {
                sib = sib.nextElementSibling;
            }
            targetContainer = sib || visibleContainers[0];
        }
    }

    if (!targetContainer) {
        targetContainer = clickedButton.closest('[data-section-id]');
    }

    if (!targetContainer) {
        let fallbackId = State.currentSection + 'Container';
        if (['program', 'skzi', 'webReg', 'lk1c'].includes(State.currentSection)) {
            fallbackId = State.currentSection + 'Algorithms';
        } else if (State.currentSection === 'reglaments') {
            fallbackId = 'reglamentCategoryGrid';
        }
        targetContainer =
            document.getElementById(fallbackId) ||
            document.querySelector(`[data-section-id="${fallbackId}"]`);
    }

    if (!targetContainer) {
        showNotification('Не удалось определить область для переключения вида.', 'error');
        return;
    }

    const sectionIdForPrefs =
        targetContainer.dataset.sectionId || targetContainer.getAttribute('id') || 'unknown';
    applyView(targetContainer, desiredView);
    saveViewPreference(sectionIdForPrefs, desiredView);
}

function applyView(container, view) {
    if (!container) {
        console.warn(`[applyView v8] Контейнер не предоставлен.`);
        return;
    }

    const sectionId = container.dataset.sectionId;
    let viewControlsContainer = null;

    if (sectionId === 'reglamentsContainer' || sectionId === 'reglamentCategoryGrid') {
        viewControlsContainer = document.getElementById('globalReglamentActionsBar');
    } else {
        const firstViewToggleButtonInSection = container
            .closest('.tab-content')
            ?.querySelector(`.view-toggle[data-view]`);
        if (firstViewToggleButtonInSection) {
            viewControlsContainer = firstViewToggleButtonInSection.closest(
                '.flex.items-center.gap-2, .flex.items-center.space-x-1.border, .flex.items-center.space-x-2, #globalReglamentActionsBar',
            );
            if (!viewControlsContainer) {
                const sectionWrapper = container.closest(
                    '.bg-gray-100.dark\\:bg-gray-800.p-content',
                );
                if (sectionWrapper) {
                    viewControlsContainer = sectionWrapper.querySelector(
                        '.flex.items-center.gap-2, .flex.items-center.space-x-1.border, .flex.items-center.space-x-2',
                    );
                }
            }
        }
    }

    const buttons = viewControlsContainer
        ? viewControlsContainer.querySelectorAll(`.view-toggle`)
        : document.querySelectorAll(`.view-toggle[data-view]`);
    let sectionSpecificButtons = [];
    if (buttons && buttons.length > 0) {
        const sectionRoot = container.closest('.tab-content');
        if (sectionRoot) {
            const buttonsWithinSection = sectionRoot.querySelectorAll('.view-toggle');
            sectionSpecificButtons =
                buttonsWithinSection.length > 0
                    ? Array.from(buttonsWithinSection)
                    : Array.from(buttons);
        } else {
            sectionSpecificButtons = Array.from(buttons);
        }
    }

    let items;
    if (sectionId === 'reglamentCategoryGrid') {
        items = container.querySelectorAll('.view-item, .reglament-category, .reglament-item');
    } else {
        items = container.querySelectorAll(
            '.view-item, .algorithm-card, .bookmark-item, .ext-link-item, .cib-link-item, .favorite-item, .reglament-item',
        );
    }

    if (sectionSpecificButtons.length > 0) {
        sectionSpecificButtons.forEach((btn) => {
            const isTargetView = btn.dataset.view === view;
            btn.classList.toggle('bg-primary', isTargetView);
            btn.classList.toggle('text-white', isTargetView);
            const isGlobalReglamentBarButton = btn.closest('#globalReglamentActionsBar');
            if (isGlobalReglamentBarButton) {
                btn.classList.toggle('bg-white', !isTargetView);
                btn.classList.toggle('dark:bg-gray-700', !isTargetView);
                btn.classList.toggle('text-gray-900', !isTargetView);
                btn.classList.toggle('dark:text-white', !isTargetView);
            } else {
                btn.classList.toggle('bg-white', !isTargetView);
                btn.classList.toggle('dark:bg-gray-700', !isTargetView);
                btn.classList.toggle('text-gray-900', !isTargetView);
                btn.classList.toggle('dark:text-gray-300', !isTargetView);
            }
        });
    }

    const gridColsClassesBase = SECTION_GRID_COLS[sectionId] || SECTION_GRID_COLS.default;
    const gridColsClassesForCategoryGrid = SECTION_GRID_COLS.reglamentCategoryGrid || [
        'grid-cols-1',
        'md:grid-cols-2',
        'lg:grid-cols-3',
    ];

    container.classList.remove(
        ...CARD_CONTAINER_CLASSES,
        ...gridColsClassesBase,
        ...gridColsClassesForCategoryGrid,
        ...LIST_CONTAINER_CLASSES,
        'auto-rows-fr',
        'gap-1',
        'gap-2',
        'gap-3',
        'gap-4',
        'gap-content',
    );

    if (view === 'cards') {
        container.classList.add(...CARD_CONTAINER_CLASSES);
        container.classList.add('auto-rows-fr');
        if (sectionId === 'reglamentCategoryGrid') {
            container.classList.add(...gridColsClassesForCategoryGrid);
        } else {
            container.classList.add(...gridColsClassesBase);
        }
        if (['bookmarksContainer', 'extLinksContainer', 'linksContainer'].includes(sectionId)) {
            container.classList.add('gap-4');
        } else if (sectionId === 'reglamentCategoryGrid') {
            container.classList.add('gap-content');
        }
    } else {
        if (sectionId === 'reglamentCategoryGrid') {
            container.classList.remove(
                ...gridColsClassesForCategoryGrid,
                ...gridColsClassesBase,
                'auto-rows-fr',
            );
            container.classList.add('grid');
            container.classList.add('grid-cols-1');
        } else {
            container.classList.add(...LIST_CONTAINER_CLASSES);
            if (sectionId === 'linksContainer') {
                container.classList.add('gap-2');
            }
        }
    }

    items.forEach((item) => {
        item.classList.remove(
            ...CARD_ITEM_BASE_CLASSES,
            ...ALGO_BOOKMARK_CARD_CLASSES,
            ...LINK_REGLAMENT_CARD_CLASSES,
            'bg-white',
            'dark:bg-[#374151]',
            'border',
            'border-gray-200',
            'dark:border-gray-700',
            'h-full',
            'flex-col',
            'justify-between',
            ...LIST_ITEM_BASE_CLASSES,
            ...LIST_HOVER_TRANSITION_CLASSES,
            'py-3',
            'pl-5',
            'pr-3',
            'mb-1',
            'text-center',
            'md:items-start',
            'md:text-left',
        );
        item.style.borderColor = '';

        if (view === 'cards') {
            item.classList.add(...CARD_ITEM_BASE_CLASSES);
            item.classList.add('h-full');

            if (item.classList.contains('bookmark-item')) {
                const title = item.querySelector('.bookmark-title, .item-title, h3, h4');
                if (title) {
                    title.classList.remove('font-medium', 'text-sm');
                    title.classList.add('font-semibold', 'text-base');
                }
                const actions = item.querySelector('.bookmark-actions, [data-role="actions"]');
                if (actions) {
                    actions.classList.add(
                        'opacity-0',
                        'pointer-events-none',
                        'group-hover:opacity-100',
                        'group-hover:pointer-events-auto',
                        'transition-opacity',
                    );
                }
            }

            if (item.classList.contains('algorithm-card')) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
            } else if (item.classList.contains('reglament-category')) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
                item.classList.remove('bg-white', 'dark:bg-gray-700');
            } else if (
                item.classList.contains('bookmark-item') ||
                item.classList.contains('ext-link-item') ||
                item.classList.contains('cib-link-item')
            ) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
            }
        } else {
            item.classList.add(...LIST_ITEM_BASE_CLASSES, ...LIST_HOVER_TRANSITION_CLASSES);
            item.classList.remove('h-full');
            if (item.classList.contains('reglament-category')) {
                item.classList.remove('border-l-4');
            }
            if (item.classList.contains('algorithm-card')) {
                item.classList.remove('flex', 'justify-between', 'items-center');
                item.classList.add('block');
            }
            if (item.classList.contains('bookmark-item')) {
                const title = item.querySelector('.bookmark-title, .item-title, h3, h4');
                if (title) {
                    title.classList.remove('font-semibold', 'text-base');
                    title.classList.add('font-medium', 'text-sm');
                }
                const actions = item.querySelector('.bookmark-actions, [data-role="actions"]');
                if (actions) {
                    actions.classList.add(
                        'opacity-0',
                        'pointer-events-none',
                        'group-hover:opacity-100',
                        'group-hover:pointer-events-auto',
                        'transition-opacity',
                    );
                }
            }
        }
    });

    console.log(
        `[applyView v8] Вид '${view}' применён к ${items.length} элементам в контейнере ${
            sectionId || container.id
        }.`,
    );
}

function applyCurrentView(sectionId) {
    const container = document.getElementById(sectionId);
    if (container) {
        const currentView = State.viewPreferences[sectionId] || container.dataset.defaultView || 'cards';
        applyView(container, currentView);
    }
}

// ============================================================================
// createStepElementHTML - MIGRATED to js/components/algorithms.js
// ============================================================================
// createStepElementHTML - imported from algorithms.js module

async function editAlgorithm(algorithmId, section = 'main') {
    let algorithm = null;
    initialEditState = null;

    const isMainAlgorithm = section === 'main';
    console.log(
        `[editAlgorithm v9 - Collapse Feature] Попытка редактирования: ID=${algorithmId}, Секция=${section}`,
    );

    try {
        if (isMainAlgorithm) {
            algorithm = algorithms.main;
        } else {
            if (algorithms[section] && Array.isArray(algorithms[section])) {
                algorithm = algorithms[section].find((a) => String(a?.id) === String(algorithmId));
            }
        }
        if (!algorithm) {
            throw new Error(`Алгоритм с ID ${algorithmId} не найден в секции ${section}.`);
        }
        algorithm = JSON.parse(JSON.stringify(algorithm));
        algorithm.steps = algorithm.steps?.map((step) => ({ ...step })) || [];
    } catch (error) {
        console.error(`[editAlgorithm v9] Ошибка при получении данных алгоритма:`, error);
        showNotification(`Ошибка при поиске данных алгоритма: ${error.message}`, 'error');
        return;
    }

    const editModal = document.getElementById('editModal');
    const editModalTitle = document.getElementById('editModalTitle');
    const algorithmTitleInput = document.getElementById('algorithmTitle');
    const descriptionContainer = document.getElementById('algorithmDescriptionContainer');
    const algorithmDescriptionInput = document.getElementById('algorithmDescription');
    const editStepsContainerElement = document.getElementById('editSteps');
    const saveAlgorithmBtn = document.getElementById('saveAlgorithmBtn');

    if (
        !editModal ||
        !editModalTitle ||
        !algorithmTitleInput ||
        !editStepsContainerElement ||
        !saveAlgorithmBtn ||
        !descriptionContainer ||
        !algorithmDescriptionInput
    ) {
        console.error(
            '[editAlgorithm v9] КРИТИЧЕСКАЯ ОШИБКА: Не найдены ОБЯЗАТЕЛЬНЫЕ элементы модального окна.',
        );
        return;
    }

    const actionsContainer = editModal.querySelector('.flex.justify-end.items-center');
    if (actionsContainer && !actionsContainer.querySelector('.collapse-all-btn')) {
        const collapseControls = document.createElement('div');
        collapseControls.className = 'mr-auto';
        collapseControls.innerHTML = `
            <button type="button" class="collapse-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300">Свернуть все</button>
            <button type="button" class="expand-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 ml-1">Развернуть все</button>
        `;
        actionsContainer.insertBefore(collapseControls, actionsContainer.firstChild);

        actionsContainer.querySelector('.collapse-all-btn').addEventListener('click', () => {
            editStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => toggleStepCollapse(step, true));
        });
        actionsContainer.querySelector('.expand-all-btn').addEventListener('click', () => {
            editStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => toggleStepCollapse(step, false));
        });
    }

    try {
        descriptionContainer.style.display = isMainAlgorithm ? 'none' : 'block';
        editModalTitle.textContent = `Редактирование: ${algorithm.title ?? 'Без названия'}`;
        algorithmTitleInput.value = algorithm.title ?? '';
        if (!isMainAlgorithm) {
            algorithmDescriptionInput.value = algorithm.description ?? '';
        }
        editStepsContainerElement.innerHTML = '';

        if (!Array.isArray(algorithm.steps) || algorithm.steps.length === 0) {
            const message = isMainAlgorithm
                ? 'В главном алгоритме пока нет шагов. Добавьте первый шаг.'
                : 'У этого алгоритма еще нет шагов. Добавьте первый шаг.';
            editStepsContainerElement.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center p-4">${message}</p>`;
        } else {
            const fragment = document.createDocumentFragment();
            const stepPromises = algorithm.steps.map(async (step, index) => {
                if (!step || typeof step !== 'object') {
                    console.warn(
                        `Пропуск невалидного шага на индексе ${index} при заполнении формы.`,
                    );
                    return null;
                }
                const stepDiv = document.createElement('div');
                stepDiv.className =
                    'edit-step p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm mb-4';
                stepDiv.dataset.stepIndex = index;
                if (step.type) {
                    stepDiv.dataset.stepType = step.type;
                }

                stepDiv.innerHTML = createStepElementHTML(
                    index + 1,
                    isMainAlgorithm,
                    !isMainAlgorithm,
                );

                const titleInput = stepDiv.querySelector('.step-title');
                const titlePreview = stepDiv.querySelector('.step-title-preview');
                const descInput = stepDiv.querySelector('.step-desc');
                const exampleTextarea = stepDiv.querySelector('.step-example');
                const additionalInfoTextarea = stepDiv.querySelector('.step-additional-info');
                const additionalInfoPosTopCheckbox = stepDiv.querySelector(
                    '.step-additional-info-pos-top',
                );
                const additionalInfoPosBottomCheckbox = stepDiv.querySelector(
                    '.step-additional-info-pos-bottom',
                );
                const isCopyableCheckbox = stepDiv.querySelector('.step-is-copyable');
                const isCollapsibleCheckbox = stepDiv.querySelector('.step-is-collapsible');
                const noInnHelpCheckbox = stepDiv.querySelector('.step-no-inn-help-checkbox');

                if (titleInput) {
                    titleInput.value = step.title ?? '';
                    if (titlePreview) {
                        const previewText = step.title || 'Без заголовка';
                        titlePreview.textContent = previewText;
                    }
                    titleInput.addEventListener('input', () => {
                        if (titlePreview) {
                            const previewText = titleInput.value || `Шаг ${index + 1}`;
                            titlePreview.textContent = previewText;
                        }
                    });
                }
                if (descInput) {
                    descInput.value = step.description ?? '';
                }
                if (exampleTextarea) {
                    exampleTextarea.value = formatExampleForTextarea(step.example);
                }
                if (additionalInfoTextarea) {
                    additionalInfoTextarea.value = step.additionalInfoText || '';
                }
                if (additionalInfoPosTopCheckbox) {
                    additionalInfoPosTopCheckbox.checked = step.additionalInfoShowTop || false;
                }
                if (additionalInfoPosBottomCheckbox) {
                    additionalInfoPosBottomCheckbox.checked =
                        step.additionalInfoShowBottom || false;
                }
                if (isMainAlgorithm && isCopyableCheckbox) {
                    isCopyableCheckbox.checked = step.isCopyable || false;
                }
                if (isMainAlgorithm && isCollapsibleCheckbox) {
                    isCollapsibleCheckbox.checked = step.isCollapsible || false;
                }

                if (isMainAlgorithm && noInnHelpCheckbox) {
                    noInnHelpCheckbox.checked = step.showNoInnHelp || false;
                }

                if (!isMainAlgorithm) {
                    const thumbsContainer = stepDiv.querySelector('#screenshotThumbnailsContainer');
                    if (thumbsContainer) {
                        const existingIds = Array.isArray(step.screenshotIds)
                            ? step.screenshotIds.filter((id) => id !== null && id !== undefined)
                            : [];
                        stepDiv.dataset.existingScreenshotIds = existingIds.join(',');

                        if (
                            existingIds.length > 0 &&
                            typeof renderExistingThumbnail === 'function'
                        ) {
                            const renderPromises = existingIds.map((screenshotId) =>
                                renderExistingThumbnail(
                                    screenshotId,
                                    thumbsContainer,
                                    stepDiv,
                                ).catch((err) =>
                                    console.error(
                                        `[editAlgorithm v9] Ошибка рендеринга миниатюры ID ${screenshotId}:`,
                                        err,
                                    ),
                                ),
                            );
                            await Promise.allSettled(renderPromises);
                        }
                        stepDiv._tempScreenshotBlobs = [];
                        stepDiv.dataset.screenshotsToDelete = '';
                        if (typeof attachScreenshotHandlers === 'function') {
                            attachScreenshotHandlers(stepDiv);
                        }
                    }
                }

                const deleteStepBtn = stepDiv.querySelector('.delete-step');
                if (deleteStepBtn && typeof attachStepDeleteHandler === 'function') {
                    attachStepDeleteHandler(
                        deleteStepBtn,
                        stepDiv,
                        editStepsContainerElement,
                        section,
                        'edit',
                        isMainAlgorithm,
                    );
                }

                if (index > 0) {
                    toggleStepCollapse(stepDiv, true);
                }
                return stepDiv;
            });
            const stepDivs = (await Promise.all(stepPromises)).filter(Boolean);
            stepDivs.forEach((div) => fragment.appendChild(div));

            editStepsContainerElement.appendChild(fragment);
            updateStepNumbers(editStepsContainerElement);
        }

        editStepsContainerElement.querySelectorAll('.step-header').forEach((header) => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.delete-step, .step-drag-handle')) return;
                toggleStepCollapse(header.closest('.edit-step'));
            });
        });

        initStepSorting(editStepsContainerElement);

        editModal.dataset.algorithmId = String(algorithm.id);
        editModal.dataset.section = section;
        captureInitialEditState(algorithm, section);
    } catch (error) {
        console.error('[editAlgorithm v9] Ошибка при заполнении формы:', error);
        showNotification('Произошла ошибка при подготовке формы редактирования.', 'error');
        if (editStepsContainerElement)
            editStepsContainerElement.innerHTML =
                '<p class="text-red-500 p-4 text-center">Ошибка загрузки данных в форму.</p>';
        if (saveAlgorithmBtn) saveAlgorithmBtn.disabled = true;
        initialEditState = null;
        return;
    }

    const algorithmModalView = document.getElementById('algorithmModal');
    if (algorithmModalView) {
        algorithmModalView.classList.add('hidden');
    }
    openAnimatedModal(editModal);
    setTimeout(() => algorithmTitleInput.focus(), 50);
}

// Wrapper для модуля algorithms.js
function initStepSorting(containerElement) {
    return initStepSortingModule(containerElement);
}

// Wrapper для модуля algorithms.js
function addEditStep() {
    return addEditStepModule();
}

async function saveAlgorithm() {
    const editModal = document.getElementById('editModal');
    const algorithmIdStr = editModal?.dataset.algorithmId;
    const section = editModal?.dataset.section;
    const algorithmTitleInput = document.getElementById('algorithmTitle');
    const algorithmDescriptionInput = document.getElementById('algorithmDescription');
    const editStepsContainer = document.getElementById('editSteps');
    const saveButton = document.getElementById('saveAlgorithmBtn');

    if (
        !editModal ||
        !algorithmIdStr ||
        !section ||
        !algorithmTitleInput ||
        !editStepsContainer ||
        !saveButton
    ) {
        console.error('saveAlgorithm v7 (TX Fix): Missing required elements.');
        showNotification('Ошибка: Не найдены элементы формы.', 'error');
        return;
    }
    const isMainAlgo = section === 'main';
    if (!isMainAlgo && !algorithmDescriptionInput) {
        console.error('saveAlgorithm v7 (TX Fix): Missing description input for non-main.');
        showNotification('Ошибка: Не найдено поле описания.', 'error');
        return;
    }
    console.log(`[Save Algorithm v7 (TX Fix)] Start. ID: ${algorithmIdStr}, Section: ${section}`);

    const finalTitle = algorithmTitleInput.value.trim();
    const newDescription =
        !isMainAlgo && algorithmDescriptionInput
            ? algorithmDescriptionInput.value.trim()
            : undefined;
    if (!finalTitle) {
        showNotification('Заголовок не может быть пустым.', 'warning');
        algorithmTitleInput.focus();
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const {
        steps: newStepsBase,
        screenshotOps,
        isValid,
    } = extractStepsDataFromEditForm(editStepsContainer, isMainAlgo);

    if (!isValid) {
        if (
            isMainAlgo &&
            newStepsBase.length === 0 &&
            editStepsContainer.querySelectorAll('.edit-step').length > 0
        ) {
            showNotification(
                'Главный алгоритм содержит только пустые шаги. Заполните их или удалите.',
                'warning',
            );
        } else if (!isMainAlgo) {
            showNotification('Алгоритм должен содержать хотя бы один непустой шаг.', 'warning');
        } else {
            console.log(
                'Сохранение главного алгоритма без шагов (допустимо, если форма изначально пуста или все удалено корректно).',
            );
        }
        if (
            !isMainAlgo ||
            (isMainAlgo &&
                newStepsBase.length === 0 &&
                editStepsContainer.querySelectorAll('.edit-step').length > 0 &&
                isValid === false)
        ) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
            return;
        }
    }
    console.log(
        `[Save Algorithm v7] Извлечено: ${newStepsBase.length} шагов, ${screenshotOps.length} скриншот-операций.`,
    );

    let transaction;
    let updateSuccessful = false;
    let oldAlgorithmData = null;
    let finalAlgorithmData = null;
    const algorithmIdForRefs = isMainAlgo ? 'main' : algorithmIdStr;
    let finalSteps = JSON.parse(JSON.stringify(newStepsBase));

    try {
        if (isMainAlgo) {
            oldAlgorithmData = algorithms?.main
                ? JSON.parse(JSON.stringify(algorithms.main))
                : null;
        } else if (algorithms?.[section]) {
            oldAlgorithmData =
                algorithms[section].find((a) => String(a?.id) === String(algorithmIdStr)) || null;
            if (oldAlgorithmData) oldAlgorithmData = JSON.parse(JSON.stringify(oldAlgorithmData));
        }
        if (oldAlgorithmData)
            console.log('[Save Algorithm v7] Старые данные для индекса получены.');
        else
            console.warn(
                `[Save Algorithm v7] Не найдены старые данные для ${section}/${algorithmIdStr}.`,
            );
    } catch (e) {
        console.error('[Save Algorithm v7] Ошибка получения старых данных:', e);
    }

    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
        const screenshotsStore = transaction.objectStore('screenshots');
        const algorithmsStore = transaction.objectStore('algorithms');
        console.log('[Save Algorithm v7 TX] Транзакция начата.');

        const screenshotOpPromises = [];

        if (!isMainAlgo) {
            screenshotOps.forEach((op) => {
                screenshotOpPromises.push(
                    new Promise((resolve, reject) => {
                        try {
                            if (
                                op.action === 'delete' &&
                                op.oldScreenshotId !== null &&
                                op.oldScreenshotId !== undefined
                            ) {
                                const request = screenshotsStore.delete(op.oldScreenshotId);
                                request.onsuccess = () => {
                                    console.log(
                                        `[Save Algorithm v7 TX] Deleted screenshot ID: ${op.oldScreenshotId}`,
                                    );
                                    resolve({
                                        success: true,
                                        action: 'delete',
                                        oldId: op.oldScreenshotId,
                                        stepIndex: op.stepIndex,
                                    });
                                };
                                request.onerror = (e) => {
                                    const error =
                                        e.target.error || new Error('Delete screenshot failed');
                                    console.error(
                                        `[Save Algorithm v7 TX] Error deleting screenshot ID ${op.oldScreenshotId}:`,
                                        error,
                                    );
                                    reject({
                                        success: false,
                                        action: 'delete',
                                        oldId: op.oldScreenshotId,
                                        stepIndex: op.stepIndex,
                                        error,
                                    });
                                };
                            } else if (
                                op.action === 'add' &&
                                op.blob instanceof Blob &&
                                typeof op.stepIndex === 'number' &&
                                finalSteps[op.stepIndex]
                            ) {
                                const tempName = `${finalTitle}, изобр. ${
                                    Date.now() + Math.random()
                                }`;
                                const record = {
                                    blob: op.blob,
                                    parentId: algorithmIdForRefs,
                                    parentType: 'algorithm',
                                    stepIndex: op.stepIndex,
                                    name: tempName,
                                    uploadedAt: new Date().toISOString(),
                                };
                                const request = screenshotsStore.add(record);
                                request.onsuccess = (e_add) => {
                                    const newId = e_add.target.result;
                                    console.log(
                                        `[Save Algorithm v7 TX] Added screenshot, new ID: ${newId} for step ${op.stepIndex}`,
                                    );
                                    if (!finalSteps[op.stepIndex].screenshotIds)
                                        finalSteps[op.stepIndex].screenshotIds = [];
                                    finalSteps[op.stepIndex].screenshotIds.push(newId);
                                    resolve({
                                        success: true,
                                        action: 'add',
                                        newId,
                                        stepIndex: op.stepIndex,
                                    });
                                };
                                request.onerror = (e_add_err) => {
                                    const error =
                                        e_add_err.target.error ||
                                        new Error('Add screenshot failed');
                                    console.error(
                                        `[Save Algorithm v7 TX] Error adding screenshot for step ${op.stepIndex}:`,
                                        error,
                                    );
                                    reject({
                                        success: false,
                                        action: 'add',
                                        stepIndex: op.stepIndex,
                                        error,
                                    });
                                };
                            } else {
                                console.warn(
                                    `[Save Algorithm v7 TX] Пропуск невалидной операции со скриншотом:`,
                                    op,
                                );
                                resolve({
                                    success: true,
                                    action: 'skip',
                                    message: 'Invalid operation data',
                                });
                            }
                        } catch (opError) {
                            console.error(
                                `[Save Algorithm v7 TX] Исключение в операции со скриншотом:`,
                                opError,
                            );
                            reject({ success: false, action: op.action, error: opError });
                        }
                    }),
                );
            });

            if (screenshotOpPromises.length > 0) {
                const screenshotResults = await Promise.all(screenshotOpPromises);
                const failedScreenshotOps = screenshotResults.filter((r) => !r.success);
                if (failedScreenshotOps.length > 0) {
                    console.error(
                        `[Save Algorithm v7 TX] Ошибки при операциях со скриншотами (${failedScreenshotOps.length} шт.). Первая ошибка:`,
                        failedScreenshotOps[0].error,
                    );
                    throw new Error(
                        `Не удалось обработать скриншоты: ${
                            failedScreenshotOps[0].error.message || 'Ошибка операции со скриншотом'
                        }`,
                    );
                }
                console.log(
                    '[Save Algorithm v7 TX] Все операции со скриншотами завершены успешно.',
                );
            }
        }

        if (!isMainAlgo) {
            let existingIdsToKeepMap = {};
            if (oldAlgorithmData?.steps) {
                const deletedIdsFromOps = new Set(
                    screenshotOps
                        .filter((op) => op.action === 'delete')
                        .map((op) => op.oldScreenshotId),
                );
                oldAlgorithmData.steps.forEach((step, index) => {
                    if (Array.isArray(step.screenshotIds)) {
                        existingIdsToKeepMap[index] = step.screenshotIds.filter(
                            (id) => !deletedIdsFromOps.has(id),
                        );
                    }
                });
            }

            finalSteps = finalSteps.map((step, index) => {
                const existingKeptIds = existingIdsToKeepMap[index] || [];
                const newlyAddedIds = (step.screenshotIds || []).filter(
                    (id) => typeof id === 'number',
                );

                const finalIds = [...new Set([...existingKeptIds, ...newlyAddedIds])];

                if (finalIds.length > 0) {
                    step.screenshotIds = finalIds;
                } else {
                    delete step.screenshotIds;
                }
                delete step._tempScreenshotBlobs;
                delete step._screenshotsToDelete;
                delete step.existingScreenshotIds;
                delete step.tempScreenshotsCount;
                delete step.deletedScreenshotIds;
                return step;
            });
        }
        console.log('[Save Algorithm v7 TX] Финальный массив шагов подготовлен.');

        let targetAlgorithmObject;
        const timestamp = new Date().toISOString();
        if (isMainAlgo) {
            if (!algorithms.main) algorithms.main = { id: 'main' };
            algorithms.main.title = finalTitle;
            algorithms.main.steps = finalSteps;
            algorithms.main.dateUpdated = timestamp;
            if (!algorithms.main.dateAdded) algorithms.main.dateAdded = timestamp;
            targetAlgorithmObject = algorithms.main;
            const mainTitleElement = document.querySelector('#mainContent h2');
            if (mainTitleElement) mainTitleElement.textContent = finalTitle;
        } else {
            if (!algorithms[section]) algorithms[section] = [];
            const algorithmIndex = algorithms[section].findIndex(
                (a) => String(a?.id) === String(algorithmIdStr),
            );

            const algoDataBase = {
                id: algorithmIdForRefs,
                title: finalTitle,
                description: newDescription,
                steps: finalSteps,
                section: section,
                dateUpdated: timestamp,
            };

            if (algorithmIndex !== -1) {
                algorithms[section][algorithmIndex] = {
                    ...(algorithms[section][algorithmIndex] || {}),
                    ...algoDataBase,
                    dateAdded:
                        algorithms[section][algorithmIndex]?.dateAdded ||
                        oldAlgorithmData?.dateAdded ||
                        timestamp,
                };
                targetAlgorithmObject = algorithms[section][algorithmIndex];
            } else {
                console.warn(
                    `[Save Algorithm v7 TX] Алгоритм ${algorithmIdStr} не найден в памяти ${section} во время редактирования. Создание нового (неожиданно).`,
                );
                targetAlgorithmObject = { ...algoDataBase, dateAdded: timestamp };
                algorithms[section].push(targetAlgorithmObject);
            }
        }
        finalAlgorithmData = JSON.parse(JSON.stringify(targetAlgorithmObject));
        console.log(`[Save Algorithm v7 TX] Объект алгоритма ${algorithmIdStr} обновлен в памяти.`);

        const algorithmContainerToSave = { section: 'all', data: algorithms };
        console.log("[Save Algorithm v7 TX] Запрос put для всего контейнера 'algorithms'...");
        const putAlgoReq = algorithmsStore.put(algorithmContainerToSave);

        await new Promise((resolve, reject) => {
            putAlgoReq.onerror = (e) =>
                reject(e.target.error || new Error('Ошибка сохранения контейнера algorithms'));
            transaction.oncomplete = () => {
                console.log('[Save Algorithm v7 TX] Транзакция успешно завершена (oncomplete).');
                updateSuccessful = true;
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    '[Save Algorithm v7 TX] ОШИБКА ТРАНЗАКЦИИ (onerror):',
                    e.target.error,
                );
                updateSuccessful = false;
                reject(e.target.error || new Error('Ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn(
                    '[Save Algorithm v7 TX] Транзакция ПРЕРВАНА (onabort):',
                    e.target.error,
                );
                updateSuccessful = false;
                reject(e.target.error || new Error('Транзакция прервана'));
            };
        });
    } catch (error) {
        console.error(
            `[Save Algorithm v7 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА сохранения для ${algorithmIdStr}:`,
            error,
        );
        if (
            transaction &&
            transaction.readyState !== 'done' &&
            transaction.abort &&
            !transaction.error
        ) {
            try {
                transaction.abort();
                console.log('[Save Algorithm v7] Транзакция отменена в catch.');
            } catch (e) {
                console.error('[Save Algorithm v7] Ошибка при отмене транзакции в catch:', e);
            }
        }
        updateSuccessful = false;
        if (oldAlgorithmData && typeof algorithms === 'object' && algorithms !== null) {
            console.warn(
                "[Save Algorithm v7] Восстановление состояния 'algorithms' в памяти из-за ошибки...",
            );
            if (isMainAlgo) {
                algorithms.main = oldAlgorithmData;
            } else if (algorithms[section]) {
                const indexToRestore = algorithms[section].findIndex(
                    (a) => String(a?.id) === String(algorithmIdStr),
                );
                if (indexToRestore !== -1) {
                    algorithms[section][indexToRestore] = oldAlgorithmData;
                } else if (oldAlgorithmData.id) {
                    algorithms[section].push(oldAlgorithmData);
                    console.warn(
                        `[Save Algorithm v7] Старый алгоритм ${algorithmIdStr} добавлен обратно в память, т.к. не был найден для восстановления.`,
                    );
                }
            }
            console.log(
                "[Save Algorithm v7] Состояние 'algorithms' в памяти восстановлено (попытка).",
            );
        }
        showNotification(
            `Произошла критическая ошибка при сохранении: ${error.message || error}`,
            'error',
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        }
    }

    if (updateSuccessful) {
        console.log(`[Save Algorithm v7 (Robust TX)] Алгоритм ${algorithmIdStr} успешно сохранен.`);
        if (typeof updateSearchIndex === 'function' && finalAlgorithmData?.id) {
            const indexId = isMainAlgo ? 'main' : finalAlgorithmData.id;
            updateSearchIndex('algorithms', indexId, finalAlgorithmData, 'update', oldAlgorithmData)
                .then(() => console.log(`[Save Algorithm v7] Индекс обновлен для ${indexId}.`))
                .catch((indexError) =>
                    console.error(
                        `[Save Algorithm v7] Ошибка обновления индекса для ${indexId}:`,
                        indexError,
                    ),
                );
        } else {
            console.warn(
                `[Save Algorithm v7] Не удалось обновить индекс для ${algorithmIdStr} (функция или ID отсутствуют).`,
            );
        }
        try {
            if (isMainAlgo && typeof renderMainAlgorithm === 'function') {
                await renderMainAlgorithm();
            } else if (!isMainAlgo && typeof renderAlgorithmCards === 'function') {
                renderAlgorithmCards(section);
            }
        } catch (renderError) {
            console.error(
                '[Save Algorithm v7] Ошибка обновления UI после сохранения:',
                renderError,
            );
        }
        showNotification('Алгоритм успешно сохранен.');
        initialEditState = null;
        if (editModal) editModal.classList.add('hidden');
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
        }
    } else {
        console.error(
            `[Save Algorithm v7 (Robust TX)] Сохранение алгоритма ${algorithmIdStr} НЕ УДАЛОСЬ.`,
        );
    }
}

// Wrapper для модуля algorithms.js
function extractStepsDataFromEditForm(containerElement, isMainAlgorithm = false) {
    return extractStepsDataFromEditFormModule(containerElement, isMainAlgorithm);
}

// Wrapper для модуля algorithms.js
function addNewStep(isFirstStep = false) {
    return addNewStepModule(isFirstStep);
}

// Wrapper для модуля step-management.js
function toggleStepCollapse(stepElement, forceCollapse) {
    return toggleStepCollapseModule(stepElement, forceCollapse);
}

// Wrapper для модуля Screenshots
function attachScreenshotHandlers(stepElement) {
    return attachScreenshotHandlersModule(stepElement);
}

// Wrapper для модуля Screenshots
function renderTemporaryThumbnail(blob, tempIndex, container, stepEl) {
    return renderTemporaryThumbnailModule(blob, tempIndex, container, stepEl);
}

// Wrapper для модуля Screenshots
async function handleImageFileForStepProcessing(fileOrBlob, addCallback, buttonElement = null) {
    return handleImageFileForStepProcessingModule(fileOrBlob, addCallback, buttonElement);
}

// Wrapper для модуля Screenshots
function renderScreenshotIcon(algorithmId, stepIndex, hasScreenshots = false) {
    return renderScreenshotIconModule(algorithmId, stepIndex, hasScreenshots);
}

// ============================================================================
// TIMER SYSTEM - MIGRATED to js/features/timer.js
// ============================================================================
// All timer-related functions are now imported from the timer module.
// See: js/features/timer.js

// ============================================================================
// SEARCH SYSTEM - MIGRATED to js/features/search.js
// ============================================================================
// All search-related functions are now imported from the search module.
// See: js/features/search.js
// Functions migrated:
// - initSearchSystem, performSearch, executeSearch, renderSearchResults
// - handleSearchResultClick, tokenize, sanitizeQuery
// - getAlgorithmText, getTextForItem
// - addToSearchIndex, removeFromSearchIndex, updateSearchIndex, updateSearchIndexForItem
// - checkAndBuildIndex, buildInitialSearchIndex, cleanAndRebuildSearchIndex
// - debouncedSearch, getCachedResults, cacheResults
// - expandQueryWithSynonyms, searchWithRegex, debug_checkIndex
// ============================================================================

/* LEGACY SEARCH CODE REMOVED - See js/features/search.js */


// Wrapper для модуля Client Data
async function saveClientData() {
    return saveClientDataModule();
}

// Wrapper для модуля Client Data
function getClientData() {
    return getClientDataModule();
}

// Wrapper для модуля Client Data
async function exportClientDataToTxt() {
    return exportClientDataToTxtModule();
}

// Wrapper для модуля Client Data
function loadClientData(data) {
    return loadClientDataModule(data);
}

// Wrapper для модуля Client Data
function clearClientData() {
    return clearClientDataModule();
}

const themeToggleBtn = document.getElementById('themeToggle');
themeToggleBtn?.addEventListener('click', async () => {
    if (!State.userPreferences) {
        console.error('State.userPreferences не инициализирован. Невозможно переключить тему.');
        showNotification('Ошибка: Не удалось загрузить настройки пользователя.', 'error');
        return;
    }

    const currentAppTheme =
        document.documentElement.dataset.theme ||
        State.userPreferences.theme ||
        DEFAULT_UI_SETTINGS.themeMode;
    let nextTheme;

    if (currentAppTheme === 'dark') {
        nextTheme = 'light';
    } else if (currentAppTheme === 'light') {
        nextTheme = 'auto';
    } else {
        nextTheme = 'dark';
    }

    if (typeof setTheme === 'function') {
        setTheme(nextTheme);
    } else {
        console.error('Функция setTheme не найдена!');
        showNotification('Ошибка: Не удалось применить тему.', 'error');
        return;
    }

    let prefsSaved = false;
    if (typeof saveUserPreferences === 'function') {
        prefsSaved = await saveUserPreferences();
    } else {
        console.error('Функция saveUserPreferences не найдена!');
        showNotification('Ошибка: Не удалось сохранить настройки пользователя.', 'error');
        if (typeof setTheme === 'function') setTheme(currentAppTheme);
        return;
    }

    if (prefsSaved) {
        const themeName =
            nextTheme === 'dark' ? 'темная' : nextTheme === 'light' ? 'светлая' : 'автоматическая';

        const customizeUIModal = document.getElementById('customizeUIModal');
        if (customizeUIModal && !customizeUIModal.classList.contains('hidden')) {
            const nextThemeRadio = customizeUIModal.querySelector(
                `input[name="themeMode"][value="${nextTheme}"]`,
            );
            if (nextThemeRadio) {
                nextThemeRadio.checked = true;
            }

            if (typeof State.currentPreviewSettings === 'object' && State.currentPreviewSettings !== null) {
                State.currentPreviewSettings.themeMode = nextTheme;
            }
            if (typeof State.originalUISettings === 'object' && State.originalUISettings !== null) {
                State.originalUISettings.themeMode = nextTheme;
            }

            if (typeof getSettingsFromModal === 'function' && typeof deepEqual === 'function') {
                State.isUISettingsDirty = !deepEqual(State.originalUISettings, getSettingsFromModal());
            }
        }
    } else {
        showNotification('Ошибка сохранения темы', 'error');
        if (typeof setTheme === 'function') {
            setTheme(currentAppTheme);
        }
    }
});

// Wrapper для модуля theme.js
function migrateLegacyThemeVars() {
    return migrateLegacyThemeVarsModule();
}
// Wrapper для модуля theme.js
function applyThemeOverrides(map = {}) {
    return applyThemeOverridesModule(map);
}

document.addEventListener('DOMContentLoaded', migrateLegacyThemeVars, { once: true });

const exportDataBtn = document.getElementById('exportDataBtn');
exportDataBtn?.addEventListener('click', exportAllData);

// Wrapper для модуля tabs.js
function createTabButtonElement(tabConfig) {
    return createTabButtonElementModule(tabConfig);
}
// Wrapper для модуля tabs.js
function ensureTabPresent(panelId, visible = true) {
    return ensureTabPresentModule(panelId, visible);
}

// Wrapper для модуля bookmarks
function createBookmarkElement(bookmark, folderMap = {}, viewMode = 'cards') {
    return createBookmarkElementModule(bookmark, folderMap, viewMode);
}

// Wrapper для модуля bookmarks
function initBookmarkSystem() {
    return initBookmarkSystemModule();
}

async function ensureBookmarkModal() {
    const modalId = bookmarkModalConfigGlobal.modalId;
    let modal = document.getElementById(modalId);
    let mustRebuildContent = false;
    const LOG_PREFIX = '[ensureBookmarkModal_V2]';

    if (modal) {
        const formInModal = modal.querySelector('#bookmarkForm');
        if (!formInModal) {
            console.warn(
                `${LOG_PREFIX} Модальное окно #${modalId} найдено, но не содержит #bookmarkForm. Пересоздание содержимого.`,
            );
            mustRebuildContent = true;
        }
    }

    if (!modal || mustRebuildContent) {
        if (modal && mustRebuildContent) {
            const innerModalContainer = modal.querySelector(
                bookmarkModalConfigGlobal.innerContainerSelector,
            );
            if (innerModalContainer) innerModalContainer.innerHTML = '';
            else modal.innerHTML = '';
            console.log(
                `${LOG_PREFIX} Содержимое существующего #${modalId} очищено для пересоздания.`,
            );
        } else if (!modal) {
            console.log(`${LOG_PREFIX} Модальное окно #${modalId} не найдено, создаем новое.`);
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className =
                'fixed inset-0 bg-black bg-opacity-50 hidden z-[90] p-4 flex items-center justify-center';
            document.body.appendChild(modal);
        }

        const normalModalClasses = bookmarkModalConfigGlobal.classToggleConfig.normal.modal || [];
        if (normalModalClasses.length > 0) {
            modal.classList.remove(...normalModalClasses);
            modal.classList.add(...normalModalClasses);
        }

        modal.innerHTML = `
            <div class="modal-inner-container bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div class="p-content border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 flex-grow mr-4 truncate" id="bookmarkModalTitle">
                            Заголовок окна закладки
                        </h2>
                        <div class="flex items-center flex-shrink-0">
                            <button id="${bookmarkModalConfigGlobal.buttonId}" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                                <i class="fas fa-expand"></i>
                            </button>
                            <button type="button" class="close-modal-btn-hook inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle ml-1" title="Закрыть (Esc)">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="modal-content-area p-content overflow-y-auto flex-1 min-h-0">
                    <form id="bookmarkForm" novalidate>
                        <input type="hidden" id="bookmarkId" name="bookmarkId">
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkTitle">Название <span class="text-red-500">*</span></label>
                            <input type="text" id="bookmarkTitle" name="bookmarkTitle" required
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkUrl">URL (опционально)</label>
                            <input type="url" id="bookmarkUrl" name="bookmarkUrl" placeholder="https://example.com"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkDescription">Описание <span class="text-red-500" id="bookmarkDescriptionRequiredIndicator" style="display:none;">*</span></label>
                            <textarea id="bookmarkDescription" name="bookmarkDescription" rows="4"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"
                                placeholder="Краткое описание закладки или текст заметки"></textarea>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkFolder">Папка (опционально)</label>
                            <select id="bookmarkFolder" name="bookmarkFolder"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                <option value="">Без папки</option>
                            </select>
                        </div>
                        <div class="mb-4">
                             <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Скриншоты (опционально)</label>
                             <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Добавляйте изображения кнопкой или вставкой из буфера (Ctrl+V) в эту область.</p>
                             <div id="bookmarkScreenshotThumbnailsContainer" class="flex flex-wrap gap-2 mb-2 min-h-[3rem] p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/30">
                             </div>
                             <div class="flex items-center gap-3">
                                 <button type="button" class="add-bookmark-screenshot-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition">
                                     <i class="fas fa-camera mr-1"></i> Загрузить/Добавить
                                 </button>
                             </div>
                             <input type="file" class="bookmark-screenshot-input hidden" accept="image/png, image/jpeg, image/gif, image/webp" multiple>
                         </div>
                    </form>
                </div>
                <div class="p-content border-t border-gray-200 dark:border-gray-700 mt-auto flex-shrink-0">
                    <div class="flex justify-end gap-2">
                        <button type="button" class="cancel-modal-btn-hook px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition">
                            Отмена
                        </button>
                        <button type="submit" form="bookmarkForm" id="saveBookmarkBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                            <i class="fas fa-save mr-1"></i> Сохранить
                        </button>
                    </div>
                </div>
            </div>
        `;
        console.log(`${LOG_PREFIX} HTML-структура для #${modalId} создана/пересоздана.`);

        const innerContainer = modal.querySelector(
            bookmarkModalConfigGlobal.innerContainerSelector,
        );
        const contentArea = modal.querySelector(bookmarkModalConfigGlobal.contentAreaSelector);

        const normalInnerClasses =
            bookmarkModalConfigGlobal.classToggleConfig.normal.innerContainer || [];
        const normalContentClasses =
            bookmarkModalConfigGlobal.classToggleConfig.normal.contentArea || [];
        if (innerContainer && normalInnerClasses.length > 0)
            innerContainer.classList.add(...normalInnerClasses);
        if (contentArea && normalContentClasses.length > 0)
            contentArea.classList.add(...normalContentClasses);

        const handleCloseActions = (targetModal) => {
            const form = targetModal.querySelector('#bookmarkForm');
            let doClose = true;
            if (
                form &&
                typeof getCurrentBookmarkFormState === 'function' &&
                typeof deepEqual === 'function'
            ) {
                if (State.initialBookmarkFormState) {
                    const currentState = getCurrentBookmarkFormState(form);
                    if (!deepEqual(State.initialBookmarkFormState, currentState)) {
                        if (!confirm('Изменения не сохранены. Закрыть без сохранения?')) {
                            doClose = false;
                        }
                    }
                }
            }

            if (doClose) {
                targetModal.classList.add('hidden');
                if (form) {
                    form.reset();
                    const idInput = form.querySelector('#bookmarkId');
                    if (idInput) idInput.value = '';
                    const modalTitleEl = targetModal.querySelector('#bookmarkModalTitle');
                    if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                    const saveButton = targetModal.querySelector('#saveBookmarkBtn');
                    if (saveButton)
                        saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
                    const thumbsContainer = form.querySelector(
                        '#bookmarkScreenshotThumbnailsContainer',
                    );
                    if (
                        thumbsContainer &&
                        typeof clearTemporaryThumbnailsFromContainer === 'function'
                    )
                        clearTemporaryThumbnailsFromContainer(thumbsContainer);
                    delete form._tempScreenshotBlobs;
                    delete form.dataset.screenshotsToDelete;
                    State.initialBookmarkFormState = null;
                }
                if (typeof removeEscapeHandler === 'function') removeEscapeHandler(targetModal);

                requestAnimationFrame(() => {
                    if (getVisibleModals().length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                        console.log(
                            'Body overflow и modal-open сняты после закрытия окна закладки.',
                        );
                    }
                });
            }
        };

        modal.querySelectorAll('.close-modal-btn-hook, .cancel-modal-btn-hook').forEach((btn) => {
            if (btn._specificClickHandler)
                btn.removeEventListener('click', btn._specificClickHandler);
            btn._specificClickHandler = (e) => {
                e.stopPropagation();
                handleCloseActions(modal);
            };
            btn.addEventListener('click', btn._specificClickHandler);
        });

        const fullscreenBtn = modal.querySelector('#' + bookmarkModalConfigGlobal.buttonId);
        if (fullscreenBtn) {
            if (fullscreenBtn._fullscreenToggleHandler)
                fullscreenBtn.removeEventListener('click', fullscreenBtn._fullscreenToggleHandler);
            fullscreenBtn._fullscreenToggleHandler = () => {
                if (typeof toggleModalFullscreen === 'function') {
                    toggleModalFullscreen(
                        bookmarkModalConfigGlobal.modalId,
                        bookmarkModalConfigGlobal.buttonId,
                        bookmarkModalConfigGlobal.classToggleConfig,
                        bookmarkModalConfigGlobal.innerContainerSelector,
                        bookmarkModalConfigGlobal.contentAreaSelector,
                    );
                } else console.error('Функция toggleModalFullscreen не найдена!');
            };
            fullscreenBtn.addEventListener('click', fullscreenBtn._fullscreenToggleHandler);
            console.log(
                `${LOG_PREFIX} Fullscreen listener attached to ${bookmarkModalConfigGlobal.buttonId}`,
            );
        } else
            console.error(
                `${LOG_PREFIX} Кнопка #${bookmarkModalConfigGlobal.buttonId} не найдена!`,
            );

        const formElement = modal.querySelector('#bookmarkForm');
        if (formElement) {
            if (formElement._submitHandler)
                formElement.removeEventListener('submit', formElement._submitHandler);
            if (typeof handleBookmarkFormSubmit === 'function') {
                formElement._submitHandler = handleBookmarkFormSubmit;
                formElement.addEventListener('submit', formElement._submitHandler);
                console.log(`${LOG_PREFIX} Новый обработчик submit добавлен к #bookmarkForm.`);
            } else
                console.error(`${LOG_PREFIX} Ошибка: Функция handleBookmarkFormSubmit не найдена!`);

            if (typeof attachBookmarkScreenshotHandlers === 'function') {
                attachBookmarkScreenshotHandlers(formElement);
            } else
                console.error(
                    `${LOG_PREFIX} Ошибка: Функция attachBookmarkScreenshotHandlers не найдена!`,
                );
            if (typeof attachBookmarkPdfHandlers === 'function') {
                attachBookmarkPdfHandlers(formElement);
            } else {
                console.error(
                    `${LOG_PREFIX} Ошибка: Функция attachBookmarkPdfHandlers не найдена!`,
                );
            }
        } else
            console.error(
                `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: Не удалось найти форму #bookmarkForm ПОСЛЕ создания модального окна!`,
            );
    }

    if (typeof addEscapeHandler === 'function') addEscapeHandler(modal);
    else console.warn(`${LOG_PREFIX} addEscapeHandler function not found.`);

    const elements = {
        modal,
        form: modal.querySelector('#bookmarkForm'),
        modalTitle: modal.querySelector('#bookmarkModalTitle'),
        submitButton: modal.querySelector('#saveBookmarkBtn'),
        idInput: modal.querySelector('#bookmarkId'),
        titleInput: modal.querySelector('#bookmarkTitle'),
        urlInput: modal.querySelector('#bookmarkUrl'),
        descriptionInput: modal.querySelector('#bookmarkDescription'),
        folderSelect: modal.querySelector('#bookmarkFolder'),
        thumbsContainer: modal.querySelector('#bookmarkScreenshotThumbnailsContainer'),
    };

    for (const key in elements) {
        if (!elements[key]) {
            console.error(
                `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: Элемент '${key}' не найден ПОСЛЕ ensureBookmarkModal!`,
            );
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
            return null;
        }
    }

    if (elements.form && elements.thumbsContainer) {
        delete elements.form._tempScreenshotBlobs;
        delete elements.form.dataset.screenshotsToDelete;
        delete elements.form.dataset.existingScreenshotIds;
        elements.thumbsContainer.innerHTML = '';
        if (typeof attachBookmarkScreenshotHandlers === 'function') {
            attachBookmarkScreenshotHandlers(elements.form);
        }
    }

    console.log(`${LOG_PREFIX} Модальное окно для закладок успешно подготовлено/найдено.`);
    return elements;
}

async function showAddBookmarkModal(bookmarkToEditId = null) {
    const LOG_PREFIX = '[showAddBookmarkModal_V2]';
    console.log(
        `${LOG_PREFIX} Вызов для ID: ${bookmarkToEditId === null ? 'нового' : bookmarkToEditId}`,
    );

    const modalElements = await ensureBookmarkModal();
    if (!modalElements) {
        if (typeof showNotification === 'function') {
            showNotification(
                'Критическая ошибка: Не удалось инициализировать окно закладки',
                'error',
            );
        }
        console.error(
            `${LOG_PREFIX} Не удалось получить элементы модального окна из ensureBookmarkModal.`,
        );
        return;
    }

    const {
        modal,
        form,
        modalTitle,
        submitButton,
        idInput,
        titleInput,
        urlInput,
        descriptionInput,
        folderSelect,
        thumbsContainer,
    } = modalElements;

    form.reset();
    idInput.value = '';
    if (thumbsContainer) thumbsContainer.innerHTML = '';
    delete form._tempScreenshotBlobs;
    delete form.dataset.screenshotsToDelete;
    form.dataset.existingScreenshotIds = '';
    form.dataset.existingRendered = 'false';

    delete modal.dataset.currentBookmarkId;
    if (modal.hasAttribute('data-bookmark-id')) modal.removeAttribute('data-bookmark-id');
    modal.querySelectorAll('.pdf-attachments-section').forEach((n) => n.remove());

    const descRequiredIndicator = form.querySelector('#bookmarkDescriptionRequiredIndicator');
    if (descRequiredIndicator) descRequiredIndicator.style.display = 'none';

    if (typeof populateBookmarkFolders === 'function') {
        await populateBookmarkFolders(folderSelect);
    } else {
        console.warn(`${LOG_PREFIX} Функция populateBookmarkFolders не найдена.`);
    }
    submitButton.disabled = false;

    if (bookmarkToEditId !== null) {
        modalTitle.textContent = 'Редактировать закладку';
        submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        try {
            const bookmark = await getFromIndexedDB('bookmarks', parseInt(bookmarkToEditId, 10));
            if (!bookmark) {
                if (typeof showNotification === 'function')
                    showNotification('Закладка не найдена', 'error');
                modal.classList.add('hidden');
                return;
            }
            idInput.value = bookmark.id;
            titleInput.value = bookmark.title || '';
            urlInput.value = bookmark.url || '';
            descriptionInput.value = bookmark.description || '';
            folderSelect.value = bookmark.folder || '';

            if (!bookmark.url && descRequiredIndicator) {
                descRequiredIndicator.style.display = 'inline';
            }

            const existingIds = bookmark.screenshotIds || [];
            form.dataset.existingScreenshotIds = existingIds.join(',');
            if (existingIds.length > 0 && typeof renderExistingThumbnail === 'function') {
                const renderPromises = existingIds.map((screenshotId) =>
                    renderExistingThumbnail(screenshotId, thumbsContainer, form),
                );
                await Promise.all(renderPromises);
            }
            form.dataset.existingRendered = 'true';
            console.log(
                `${LOG_PREFIX} Форма заполнена для редактирования закладки ID: ${bookmark.id}`,
            );
        } catch (error) {
            console.error(`${LOG_PREFIX} Ошибка при загрузке закладки для редактирования:`, error);
            if (typeof showNotification === 'function')
                showNotification('Ошибка загрузки закладки', 'error');
            modal.classList.add('hidden');
            return;
        }
    } else {
        modalTitle.textContent = 'Добавить закладку';
        submitButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
        console.log(`${LOG_PREFIX} Форма подготовлена для добавления новой закладки.`);
    }

    if (typeof getCurrentBookmarkFormState === 'function') {
        State.initialBookmarkFormState = getCurrentBookmarkFormState(form);
        console.log(
            `${LOG_PREFIX} Начальное состояние формы захвачено:`,
            JSON.parse(JSON.stringify(State.initialBookmarkFormState)),
        );
    } else {
        console.warn(
            `${LOG_PREFIX} Функция getCurrentBookmarkFormState не найдена, отслеживание изменений может не работать.`,
        );
        State.initialBookmarkFormState = null;
    }

    if (urlInput && descriptionInput && descRequiredIndicator) {
        const updateDescRequirement = () => {
            const urlIsEmpty = !urlInput.value.trim();
            descRequiredIndicator.style.display = urlIsEmpty ? 'inline' : 'none';
            descriptionInput.required = urlIsEmpty;
        };
        urlInput.removeEventListener('input', updateDescRequirement);
        urlInput.addEventListener('input', updateDescRequirement);
        updateDescRequirement();
    }

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    if (titleInput) {
        setTimeout(() => {
            try {
                titleInput.focus();
            } catch (focusError) {
                console.warn(`${LOG_PREFIX} Не удалось установить фокус:`, focusError);
            }
        }, 50);
    }
}

// Wrapper для модуля Screenshots
function attachBookmarkScreenshotHandlers(formElement) {
    return attachBookmarkScreenshotHandlersModule(formElement);
}

// Wrapper для модуля Screenshots
async function renderExistingThumbnail(screenshotId, container, parentElement) {
    return renderExistingThumbnailModule(screenshotId, container, parentElement);
}

// Wrapper для модуля Screenshots
async function processImageFile(fileOrBlob) {
    return processImageFileModule(fileOrBlob);
}

async function handleBookmarkFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const modal = form.closest('#bookmarkModal');
    const saveButton = modal?.querySelector('#saveBookmarkBtn');

    console.log('[handleBookmarkFormSubmit v6 - Archive Logic] Function start.');

    if (!form) {
        console.error('handleBookmarkFormSubmit v6: CRITICAL - event.target is not the form!');
        if (typeof showNotification === 'function')
            showNotification('Критическая ошибка: форма не найдена.', 'error');
        return;
    }
    if (!modal) {
        console.error(
            'handleBookmarkFormSubmit v6: CRITICAL - Could not find parent modal #bookmarkModal.',
        );
        if (typeof showNotification === 'function')
            showNotification('Критическая ошибка интерфейса: не найдено модальное окно.', 'error');
        if (saveButton) saveButton.disabled = false;
        return;
    }
    if (!saveButton) {
        console.error(
            'handleBookmarkFormSubmit v6: CRITICAL - Could not find save button #saveBookmarkBtn within modal.',
        );
        if (typeof showNotification === 'function')
            showNotification(
                'Критическая ошибка интерфейса: не найдена кнопка сохранения.',
                'error',
            );
        const potentialSaveButton = document.getElementById('saveBookmarkBtn');
        if (potentialSaveButton) potentialSaveButton.disabled = false;
        return;
    }

    console.log('[handleBookmarkFormSubmit v6] Modal, form, and save button found. Proceeding...');

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const id = form.elements.bookmarkId.value;
    const title = form.elements.bookmarkTitle.value.trim();
    const url = form.elements.bookmarkUrl.value.trim();
    const description = form.elements.bookmarkDescription.value.trim();

    const folderValue = form.elements.bookmarkFolder.value;
    let folder;
    if (folderValue === ARCHIVE_FOLDER_ID) {
        folder = ARCHIVE_FOLDER_ID;
        console.log("[handleBookmarkFormSubmit v6] Выбрана папка 'Архив'.");
    } else if (folderValue === '') {
        folder = null;
        console.log('[handleBookmarkFormSubmit v6] Папка не выбрана (Без папки).');
    } else {
        const parsedFolderId = parseInt(folderValue, 10);
        if (!isNaN(parsedFolderId)) {
            folder = parsedFolderId;
            console.log(`[handleBookmarkFormSubmit v6] Выбрана обычная папка с ID: ${folder}.`);
        } else {
            folder = null;
            console.warn(
                `[handleBookmarkFormSubmit v6] Некорректный ID папки '${folderValue}'. Установлено 'Без папки'.`,
            );
        }
    }

    if (!title) {
        if (typeof showNotification === 'function')
            showNotification("Заполните поле 'Название'", 'error');
        saveButton.disabled = false;
        saveButton.innerHTML = id
            ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
            : '<i class="fas fa-plus mr-1"></i> Добавить';
        form.elements.bookmarkTitle.focus();
        return;
    }
    if (!url && !description) {
        if (typeof showNotification === 'function')
            showNotification("Заполните 'Описание', т.к. URL не указан", 'error');
        saveButton.disabled = false;
        saveButton.innerHTML = id
            ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
            : '<i class="fas fa-plus mr-1"></i> Добавить';
        form.elements.bookmarkDescription.focus();
        return;
    }
    if (url) {
        try {
            let testUrl = url;
            if (!testUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && testUrl.includes('.')) {
                if (!testUrl.startsWith('//')) {
                    testUrl = 'https://' + testUrl;
                }
            }
            new URL(testUrl);
        } catch (_) {
            if (typeof showNotification === 'function')
                showNotification('Введите корректный URL (например, https://example.com)', 'error');
            saveButton.disabled = false;
            saveButton.innerHTML = id
                ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
                : '<i class="fas fa-plus mr-1"></i> Добавить';
            form.elements.bookmarkUrl.focus();
            return;
        }
    }

    const screenshotOps = [];
    const newScreenshotBlobs = form._tempScreenshotBlobs || [];
    const idsToDeleteStr = form.dataset.screenshotsToDelete || '';

    newScreenshotBlobs.forEach((blob) => {
        if (blob instanceof Blob) screenshotOps.push({ action: 'add', blob });
    });
    idsToDeleteStr
        .split(',')
        .map((idStr) => parseInt(idStr.trim(), 10))
        .filter((idNum) => !isNaN(idNum) && idNum > 0)
        .forEach((idToDelete) =>
            screenshotOps.push({ action: 'delete', oldScreenshotId: idToDelete }),
        );
    console.log(
        `[Save Bookmark v6 TX] Запланировано ${screenshotOps.length} операций со скриншотами.`,
    );

    const isEditing = !!id;
    let finalId = isEditing ? parseInt(id, 10) : null;
    let oldData = null;
    let existingIdsToKeep = [];
    const newDataBase = {
        title,
        url: url || null,
        description: description || null,
        folder: folder,
    };

    let transaction;
    let saveSuccessful = false;

    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['bookmarks', 'screenshots'], 'readwrite');
        const bookmarksStore = transaction.objectStore('bookmarks');
        const screenshotsStore = transaction.objectStore('screenshots');
        console.log('[Save Bookmark v6 TX] Транзакция начата.');

        const timestamp = new Date().toISOString();
        let bookmarkReadyPromise;

        if (isEditing) {
            newDataBase.id = finalId;
            console.log(`[Save Bookmark v6 TX] Редактирование закладки ID: ${finalId}`);
            bookmarkReadyPromise = new Promise(async (resolve, reject) => {
                try {
                    const request = bookmarksStore.get(finalId);
                    request.onsuccess = (e) => {
                        oldData = e.target.result;
                        if (oldData) {
                            newDataBase.dateAdded = oldData.dateAdded || timestamp;
                            const deletedIdsSet = new Set(
                                screenshotOps
                                    .filter((op) => op.action === 'delete')
                                    .map((op) => op.oldScreenshotId),
                            );
                            existingIdsToKeep = (oldData.screenshotIds || []).filter(
                                (existingId) => !deletedIdsSet.has(existingId),
                            );
                        } else {
                            newDataBase.dateAdded = timestamp;
                        }
                        resolve();
                    };
                    request.onerror = (e) =>
                        reject(
                            e.target.error ||
                                new Error(`Не удалось получить старые данные для ID ${finalId}`),
                        );
                } catch (fetchError) {
                    reject(fetchError);
                }
            });
            newDataBase.dateUpdated = timestamp;
        } else {
            newDataBase.dateAdded = timestamp;
            delete newDataBase.id;
            console.log('[Save Bookmark v6 TX] Добавление новой закладки...');
            bookmarkReadyPromise = new Promise((resolve, reject) => {
                const request = bookmarksStore.add(newDataBase);
                request.onsuccess = (e) => {
                    finalId = e.target.result;
                    newDataBase.id = finalId;
                    resolve();
                };
                request.onerror = (e) =>
                    reject(e.target.error || new Error('Ошибка добавления закладки'));
            });
        }

        await bookmarkReadyPromise;

        if (finalId === null || finalId === undefined)
            throw new Error('Не удалось определить ID закладки.');
        console.log(`[Save Bookmark v6 TX] ID закладки определен: ${finalId}`);

        const screenshotOpResults = [];
        const screenshotPromises = [];
        const newScreenshotIds = [];

        if (screenshotOps.length > 0) {
            console.log(
                `[Save Bookmark v6 TX ${finalId}] Обработка ${screenshotOps.length} операций со скриншотами...`,
            );
            screenshotOps.forEach((op) => {
                const { action, blob, oldScreenshotId } = op;
                screenshotPromises.push(
                    new Promise(async (resolve) => {
                        try {
                            if (action === 'delete' && oldScreenshotId) {
                                const request = screenshotsStore.delete(oldScreenshotId);
                                request.onsuccess = () => {
                                    screenshotOpResults.push({
                                        success: true,
                                        action: 'delete',
                                        oldId: oldScreenshotId,
                                    });
                                    resolve();
                                };
                                request.onerror = (e) => {
                                    screenshotOpResults.push({
                                        success: false,
                                        action: 'delete',
                                        oldId: oldScreenshotId,
                                        error: e.target.error || new Error('Delete failed'),
                                    });
                                    resolve();
                                };
                            } else if (action === 'add' && blob instanceof Blob) {
                                const tempName = `${newDataBase.title || 'Закладка'}-${Date.now()}`;
                                const record = {
                                    blob,
                                    parentId: finalId,
                                    parentType: 'bookmark',
                                    name: tempName,
                                    uploadedAt: new Date().toISOString(),
                                };
                                const request = screenshotsStore.add(record);
                                request.onsuccess = (e_add) => {
                                    const newId = e_add.target.result;
                                    screenshotOpResults.push({
                                        success: true,
                                        action: 'add',
                                        newId,
                                    });
                                    newScreenshotIds.push(newId);
                                    resolve();
                                };
                                request.onerror = (e_add_err) => {
                                    screenshotOpResults.push({
                                        success: false,
                                        action: 'add',
                                        error: e_add_err.target.error || new Error('Add failed'),
                                    });
                                    resolve();
                                };
                            } else {
                                screenshotOpResults.push({
                                    success: false,
                                    action: op.action || 'unknown',
                                    error: new Error('Invalid op'),
                                });
                                resolve();
                            }
                        } catch (opError) {
                            screenshotOpResults.push({
                                success: false,
                                action: action,
                                error: opError,
                            });
                            resolve();
                        }
                    }),
                );
            });
            await Promise.all(screenshotPromises);
            console.log(`[Save Bookmark v6 TX ${finalId}] Операции со скриншотами завершены.`);

            const failedOps = screenshotOpResults.filter((r) => !r.success);
            if (failedOps.length > 0)
                throw new Error(
                    `Ошибка операции со скриншотом: ${
                        failedOps[0].error?.message || 'Unknown error'
                    }`,
                );
        }

        newDataBase.screenshotIds = [...new Set([...existingIdsToKeep, ...newScreenshotIds])];
        if (newDataBase.screenshotIds.length === 0) delete newDataBase.screenshotIds;

        console.log(
            `[Save Bookmark v6 TX ${finalId}] Финальный объект закладки для put:`,
            JSON.parse(JSON.stringify(newDataBase)),
        );

        const putBookmarkReq = bookmarksStore.put(newDataBase);

        await new Promise((resolve, reject) => {
            putBookmarkReq.onerror = (e) =>
                reject(e.target.error || new Error(`Ошибка сохранения закладки ${finalId}`));
            transaction.oncomplete = () => {
                saveSuccessful = true;
                resolve();
            };
            transaction.onerror = (e) => reject(e.target.error || new Error('Ошибка транзакции'));
            transaction.onabort = (e) => reject(e.target.error || new Error('Транзакция прервана'));
        });

        try {
            const pdfTemp = Array.isArray(form._tempPdfFiles) ? form._tempPdfFiles : [];
            if (pdfTemp.length > 0) {
                console.log(
                    `[Save Bookmark] Сохранение \${pdfTemp.length} PDF для закладки \${finalId}`,
                );
                await addPdfRecords(pdfTemp, 'bookmark', finalId);
            }
        } catch (pdfErr) {
            console.error('[handleBookmarkFormSubmit] Ошибка сохранения PDF-файлов:', pdfErr);
        }
    } catch (saveError) {
        console.error(
            `[Save Bookmark v6 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА при сохранении закладки ${
                finalId || '(новый)'
            }:`,
            saveError,
        );
        if (transaction && transaction.abort && transaction.readyState !== 'done') {
            try {
                transaction.abort();
                console.log('[Save Bookmark v6] Транзакция отменена в catch.');
            } catch (e) {
                console.error('[Save Bookmark v6] Ошибка отмены транзакции:', e);
            }
        }
        saveSuccessful = false;
        if (typeof showNotification === 'function')
            showNotification(
                'Ошибка при сохранении закладки: ' + (saveError.message || saveError),
                'error',
            );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = id
                ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
                : '<i class="fas fa-plus mr-1"></i> Добавить';
        }
    }

    if (saveSuccessful) {
        console.log(`[Save Bookmark v6 (Robust TX)] Успешно завершено для ID: ${finalId}`);
        const finalDataForIndex = { ...newDataBase };

        if (typeof updateSearchIndex === 'function') {
            updateSearchIndex(
                'bookmarks',
                finalId,
                finalDataForIndex,
                isEditing ? 'update' : 'add',
                oldData,
            )
                .then(() => console.log(`Индекс обновлен для закладки ${finalId}.`))
                .catch((indexError) =>
                    console.error(`Ошибка обновления индекса для закладки ${finalId}:`, indexError),
                );
        } else {
            console.warn('updateSearchIndex не найдена.');
        }

        try {
            const newPdfFiles = Array.from(form._tempPdfFiles || []);
            if (newPdfFiles.length > 0) {
                await addPdfRecords(newPdfFiles, 'bookmark', finalId);
                console.log(
                    `[Save Bookmark] Добавлено PDF файлов: ${newPdfFiles.length} для bookmark:${finalId}`,
                );
            }
        } catch (pdfErr) {
            console.error('Ошибка сохранения PDF-файлов для закладки:', pdfErr);
            if (typeof showNotification === 'function')
                showNotification('PDF не удалось сохранить для закладки.', 'warning');
        } finally {
            delete form._tempPdfFiles;
        }

        if (typeof showNotification === 'function')
            showNotification(isEditing ? 'Закладка обновлена' : 'Закладка добавлена');
        modal.classList.add('hidden');
        form.reset();
        const bookmarkIdInput = form.querySelector('#bookmarkId');
        if (bookmarkIdInput) bookmarkIdInput.value = '';
        const modalTitleEl = modal.querySelector('#bookmarkModalTitle');
        if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
        delete form._tempScreenshotBlobs;
        delete form.dataset.screenshotsToDelete;
        form.dataset.pdfDraftWired = '0';
        const draftPdfList = form.querySelector('.pdf-draft-list');
        if (draftPdfList) draftPdfList.innerHTML = '';
        const thumbsContainer = form.querySelector('#bookmarkScreenshotThumbnailsContainer');
        if (thumbsContainer) thumbsContainer.innerHTML = '';
        delete form._tempPdfFiles;
        const pdfListEl = form.querySelector('#bookmarkPdfList');
        if (pdfListEl) pdfListEl.innerHTML = '<li class="text-gray-500">Нет файлов</li>';
        State.initialBookmarkFormState = null;

        if (typeof loadBookmarks === 'function') loadBookmarks();

        if (typeof getVisibleModals === 'function') {
            const visibleModals = getVisibleModals().filter(
                (m) => m.id !== modal.id && !m.classList.contains('hidden'),
            );
            if (visibleModals.length === 0) {
                document.body.classList.remove('overflow-hidden');
                document.body.classList.remove('modal-open');
            }
        } else {
            document.body.classList.remove('overflow-hidden');
            document.body.classList.remove('modal-open');
        }
    } else {
        console.error(
            `[Save Bookmark v6 (Robust TX)] Сохранение закладки ${
                finalId || '(новый)'
            } НЕ удалось.`,
        );
    }
}

async function loadBookmarks() {
    if (!State.db) {
        console.error('База данных не инициализирована. Загрузка закладок невозможна.');
        if (typeof showNotification === 'function')
            showNotification('Ошибка: База данных недоступна.', 'error');
        await renderBookmarkFolders([]);
        renderBookmarks([]);
        return false;
    }

    let folders = [];
    let bookmarks = [];
    let instructionsFolderId = null;
    let firstFolderId = null;

    try {
        folders = await getAllFromIndexedDB('bookmarkFolders');
        console.log(`loadBookmarks: Найдено ${folders?.length || 0} существующих папок.`);

        if (!folders || folders.length === 0) {
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
        }

        await renderBookmarkFolders(folders || []);

        if (folders && folders.length > 0) {
            const instructionsFolder = folders.find((f) => f.name === 'Инструкции');
            if (instructionsFolder) {
                instructionsFolderId = instructionsFolder.id;
            }
            firstFolderId = folders[0]?.id;
        }

        bookmarks = await getAllFromIndexedDB('bookmarks');
        console.log(`loadBookmarks: Найдено ${bookmarks?.length || 0} существующих закладок.`);

        if ((!bookmarks || bookmarks.length === 0) && folders && folders.length > 0) {
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
        }

        const folderMap = (folders || []).reduce((map, folder) => {
            if (folder && typeof folder.id !== 'undefined') {
                map[folder.id] = folder;
            }
            return map;
        }, {});

        const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');
        let initialBookmarksToRender;
        if (bookmarkFolderFilter && bookmarkFolderFilter.value === ARCHIVE_FOLDER_ID) {
            initialBookmarksToRender = (bookmarks || []).filter(
                (bm) => bm.folder === ARCHIVE_FOLDER_ID,
            );
        } else if (bookmarkFolderFilter && bookmarkFolderFilter.value !== '') {
            initialBookmarksToRender = (bookmarks || []).filter(
                (bm) =>
                    String(bm.folder) === String(bookmarkFolderFilter.value) &&
                    bm.folder !== ARCHIVE_FOLDER_ID,
            );
        } else {
            initialBookmarksToRender = (bookmarks || []).filter(
                (bm) => bm.folder !== ARCHIVE_FOLDER_ID,
            );
        }

        renderBookmarks(initialBookmarksToRender, folderMap);

        console.log(
            `Загрузка закладок завершена. Загружено ${folders?.length || 0} папок и ${
                bookmarks?.length || 0
            } закладок (показано ${initialBookmarksToRender.length}).`,
        );
        return true;
    } catch (error) {
        console.error('Критическая ошибка при загрузке закладок или папок:', error);
        await renderBookmarkFolders([]);
        renderBookmarks([]);
        if (typeof showNotification === 'function')
            showNotification('Критическая ошибка загрузки данных закладок.', 'error');
        return false;
    }
}

// Wrapper для модуля bookmarks
async function getAllBookmarks() {
    return getAllBookmarksModule();
}

async function initExternalLinksSystem() {
    const LOG_PREFIX = '[initExternalLinksSystem v2.1_FINAL]';
    console.log(`${LOG_PREFIX} --- START ---`);

    // Ждем, пока DOM будет готов
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    const panel = document.getElementById('extLinksContent');
    if (!panel) {
        console.error(
            `${LOG_PREFIX} CRITICAL FAILURE: Панель #extLinksContent отсутствует в HTML.`,
        );
        return;
    }
    
    console.log(`${LOG_PREFIX} Панель #extLinksContent найдена, текущий innerHTML длина: ${panel.innerHTML.length}`);

    const structureHTML = `
        <div class="bg-gray-100 dark:bg-gray-800 p-content rounded-lg shadow-md">
            <div class="flex flex-wrap gap-x-4 gap-y-2 justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Внешние ресурсы</h2>
                <div class="flex items-center gap-2">
                    <div class="flex items-center space-x-1 border border-gray-300 dark:border-gray-600 rounded-md p-0.5">
                            <button class="view-toggle p-1.5 rounded bg-primary text-white" data-view="cards" title="Вид карточек"> <i class="fas fa-th-large"></i> </button>
                            <button class="view-toggle p-1.5 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-300" data-view="list" title="Вид списка"> <i class="fas fa-list"></i> </button>
                        </div>
                    <button
                        id="addExtLinkBtn"
                        class="h-9 px-3.5 bg-primary hover:bg-secondary text-white rounded-md shadow-sm transition inline-flex items-center gap-2"
                    >
                        <i class="fas fa-plus mr-1"></i>Добавить
                    </button>
                    <button id="organizeExtLinkCategoriesBtn" class="px-3 py-2 bg-primary hover:bg-secondary text-white dark:text-gray-200 rounded-md transition text-sm font-medium flex items-center">
                        <i class="fas fa-folder-open mr-2"></i>Категории
                    </button>
                </div>
            </div>
            <div class="flex items-center gap-4 mb-4 flex-shrink-0">
                <div class="relative flex-grow">
                    <input type="text" id="extLinkSearchInput" placeholder="Поиск по ресурсам..." class="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100">
                    <button id="clearExtLinkSearchBtn" class="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white-700 hidden" title="Очистить поиск">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <select id="extLinkCategoryFilter" class="w-auto py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100">
                    <option value="">Все категории</option>
                </select>
            </div>
            <div id="extLinksContainer" class="flex-grow min-h-0 overflow-y-auto custom-scrollbar -mr-content-sm pr-content-sm view-section" data-section-id="extLinksContainer" data-default-view="cards">
            </div>
        </div>
    `;
    // Очищаем панель перед вставкой нового HTML
    panel.innerHTML = '';
    panel.innerHTML = structureHTML;

    // Используем requestAnimationFrame для гарантии, что DOM обновился
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const addBtn = panel.querySelector('#addExtLinkBtn');
    const organizeBtn = panel.querySelector('#organizeExtLinkCategoriesBtn');
    const searchInput = panel.querySelector('#extLinkSearchInput');
    const categoryFilter = panel.querySelector('#extLinkCategoryFilter');
    const clearSearchBtn = panel.querySelector('#clearExtLinkSearchBtn');
    const viewToggles = panel.querySelectorAll('.view-toggle');
    const contentContainer = panel.querySelector('#extLinksContainer');

    // Детальное логирование для отладки
    if (!addBtn) console.error(`${LOG_PREFIX} Не найден: #addExtLinkBtn`);
    if (!organizeBtn) console.error(`${LOG_PREFIX} Не найден: #organizeExtLinkCategoriesBtn`);
    if (!searchInput) console.error(`${LOG_PREFIX} Не найден: #extLinkSearchInput`);
    if (!categoryFilter) console.error(`${LOG_PREFIX} Не найден: #extLinkCategoryFilter`);
    if (!clearSearchBtn) console.error(`${LOG_PREFIX} Не найден: #clearExtLinkSearchBtn`);
    if (!contentContainer) console.error(`${LOG_PREFIX} Не найден: #extLinksContainer`);
    if (!viewToggles || viewToggles.length === 0) console.error(`${LOG_PREFIX} Не найдены: .view-toggle`);

    if (
        !addBtn ||
        !organizeBtn ||
        !searchInput ||
        !categoryFilter ||
        !clearSearchBtn ||
        !contentContainer
    ) {
        console.error(
            `${LOG_PREFIX} CRITICAL: Не удалось найти все элементы управления после рендеринга HTML.`,
        );
        console.error(`${LOG_PREFIX} HTML структура:`, panel.innerHTML.substring(0, 500));
        return;
    }

    addBtn.addEventListener('click', () => showAddEditExtLinkModal());
    organizeBtn.addEventListener('click', () => showOrganizeExtLinkCategoriesModal());

    const debouncedFilter = debounce(filterExtLinks, 250);
    searchInput.addEventListener('input', debouncedFilter);
    setupClearButton('extLinkSearchInput', 'clearExtLinkSearchBtn', filterExtLinks);

    categoryFilter.addEventListener('change', filterExtLinks);
    contentContainer.addEventListener('click', handleExtLinkAction);

    viewToggles.forEach((button) => button.addEventListener('click', handleViewToggleClick));

    await loadExtLinks();
    const allLinks = await getAllExtLinks();
    renderExtLinks(allLinks, State.extLinkCategoryInfo);

    console.log(`${LOG_PREFIX} --- END --- Система внешних ресурсов успешно инициализирована.`);
}

// ============================================================================
// createExtLinkElement - MIGRATED to js/components/ext-links.js
// ============================================================================
// Now imported from ext-links.js module as createExtLinkElementModule.
// Use createExtLinkElementModule or the wrapper function below.

function createExtLinkElement(link, categoryMap = {}, viewMode = 'cards') {
    // Wrapper function that calls the module version
    return createExtLinkElementModule(link, categoryMap, viewMode);
}

// createExtLinkElement_OLD - migrated to js/components/ext-links.js

// Wrapper для модуля ext-links
async function renderExtLinks(links, categoryInfoMap = {}) {
    return renderExtLinksModule(links, categoryInfoMap);
}

async function showAddEditExtLinkModal(id = null, categoryId = null) {
    const {
        modal,
        form,
        titleEl,
        idInput,
        titleInput,
        urlInput,
        descriptionInput,
        categoryInput,
        saveButton,
    } = ensureExtLinkModal();
    if (!modal) return;

    form.reset();
    idInput.value = id ? id : '';

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');
        categoryInput.innerHTML = '<option value="">Без категории</option>';
        if (categories && categories.length > 0) {
            const fragment = document.createDocumentFragment();
            categories
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach((cat) => {
                    const option = document.createElement('option');
                    option.value = cat.id;
                    option.textContent = cat.name;
                    fragment.appendChild(option);
                });
            categoryInput.appendChild(fragment);
        }
    } catch (e) {
        console.error('Не удалось загрузить категории для модального окна', e);
    }

    if (id !== null) {
        titleEl.textContent = 'Редактировать ресурс';
        saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        try {
            const link = await getFromIndexedDB('extLinks', id);
            if (link) {
                titleInput.value = link.title || '';
                urlInput.value = link.url || '';
                descriptionInput.value = link.description || '';
                categoryInput.value = link.category || '';
            } else {
                showNotification('Ресурс не найден', 'error');
                modal.classList.add('hidden');
                return;
            }
        } catch (error) {
            showNotification('Ошибка загрузки ресурса', 'error');
            modal.classList.add('hidden');
            return;
        }
    } else {
        titleEl.textContent = 'Добавить внешний ресурс';
        saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
        if (categoryId) {
            categoryInput.value = categoryId;
        }
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    titleInput.focus();
}

function showOrganizeExtLinkCategoriesModal() {
    let modal = document.getElementById('extLinkCategoriesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'extLinkCategoriesModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold">Управление папками</h2>
                            <button class="close-modal bg-transparent text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded transition-colors"><i class="fas fa-times text-xl"></i></button>
                        </div>
                        <div id="extLinkCategoriesList" class="max-h-60 overflow-y-auto mb-4 border-y border-gray-200 dark:border-gray-700 -mx-6 px-6"></div>
                        <form id="extLinkCategoryForm" class="border-t border-gray-200 dark:border-gray-700 pt-4 -mx-6 px-6">
                            <h3 class="text-lg font-semibold mb-2" id="extLinkCategoryFormTitle">Добавить новую папку</h3>
                            <input type="hidden" name="editingCategoryId">
                            <div class="mb-4">
                                <label for="extLinkCategoryName" class="block text-sm font-medium mb-1">Название <span class="text-red-500">*</span></label>
                                <input type="text" id="extLinkCategoryName" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1">Цвет</label>
                                <div class="flex gap-2 flex-wrap" id="extLinkCategoryColorPicker">
                                </div>
                            </div>
                            <div class="flex justify-end gap-2">
                                <button type="button" id="cancelEditExtLinkCategoryBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 rounded-md hidden">Отмена</button>
                                <button type="submit" id="extLinkCategorySubmitBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md">Добавить папку</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal
            .querySelector('#extLinkCategoryForm')
            .addEventListener('submit', handleSaveExtLinkCategorySubmit);
        modal.querySelectorAll('.close-modal').forEach((btn) =>
            btn.addEventListener('click', () => {
                modal.classList.add('hidden');
                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('modal-open');
                    document.body.classList.remove('overflow-hidden');
                }
            }),
        );
        modal.querySelector('#cancelEditExtLinkCategoryBtn').addEventListener('click', () => {
            const form = modal.querySelector('#extLinkCategoryForm');
            form.reset();
            form.elements.editingCategoryId.value = '';
            modal.querySelector('#extLinkCategorySubmitBtn').textContent = 'Добавить папку';
            modal.querySelector('#extLinkCategoryFormTitle').textContent = 'Добавить новую папку';
            modal.querySelector('#cancelEditExtLinkCategoryBtn').classList.add('hidden');
            const defaultColor = form.querySelector(
                'input[name="extLinkCategoryColor"][value="blue"]',
            );
            if (defaultColor) defaultColor.checked = true;
        });

        const colors = [
            'gray',
            'red',
            'orange',
            'yellow',
            'green',
            'teal',
            'blue',
            'indigo',
            'purple',
            'pink',
            'rose',
        ];
        const colorPickerContainer = modal.querySelector('#extLinkCategoryColorPicker');
        colorPickerContainer.innerHTML = colors
            .map(
                (color, index) => `
            <label class="inline-flex items-center">
                <input type="radio" name="extLinkCategoryColor" value="${color}" class="form-radio text-${color}-600 focus:ring-${color}-500" ${
                    index === 6 ? 'checked' : ''
                }>
                <span class="ml-2 w-5 h-5 rounded-full bg-${color}-${
                    color === 'gray' ? 500 : 600
                } border border-gray-300 dark:border-gray-600"></span>
            </label>
        `,
            )
            .join('');
    }

    const listEl = modal.querySelector('#extLinkCategoriesList');
    listEl.innerHTML = '<p class="p-4 text-center text-gray-500">Загрузка...</p>';
    getAllFromIndexedDB('extLinkCategories').then((categories) => {
        listEl.innerHTML = '';
        if (!categories || categories.length === 0) {
            listEl.innerHTML = '<p class="p-4 text-center text-gray-500">Нет созданных папок.</p>';
            return;
        }
        categories
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((cat) => {
                const colorClass = cat.color
                    ? `bg-${cat.color}-${cat.color === 'gray' ? 500 : 600}`
                    : 'bg-gray-500';
                const item = document.createElement('div');
                item.className =
                    'flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0';
                item.innerHTML = `
  <div class="flex items-center">
    <span class="w-4 h-4 rounded-full ${colorClass} mr-3 flex-shrink-0"></span>
    <span class="truncate" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
  </div>
<div>
                    <button data-id="${
                        cat.id
                    }" class="edit-cat-btn p-1 bg-transparent rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><i class="fas fa-edit"></i></button>
                    <button data-id="${
                        cat.id
                    }" class="delete-cat-btn p-1 bg-transparent rounded ml-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><i class="fas fa-trash"></i></button>
                </div>`;
                listEl.appendChild(item);
            });
    });

    listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;

        if (btn.classList.contains('delete-cat-btn')) {
            handleDeleteExtLinkCategoryClick(id);
        } else if (btn.classList.contains('edit-cat-btn')) {
            const form = modal.querySelector('#extLinkCategoryForm');
            const category = State.extLinkCategoryInfo[id];
            if (category) {
                form.elements.editingCategoryId.value = id;
                form.elements.extLinkCategoryName.value = category.name;
                const colorInput = form.querySelector(
                    `input[name="extLinkCategoryColor"][value="${category.color || 'blue'}"]`,
                );
                if (colorInput) colorInput.checked = true;

                modal.querySelector('#extLinkCategorySubmitBtn').textContent = 'Сохранить';
                modal.querySelector('#extLinkCategoryFormTitle').textContent =
                    'Редактировать папку';
                modal.querySelector('#cancelEditExtLinkCategoryBtn').classList.remove('hidden');
            }
        }
    });

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

async function handleSaveExtLinkCategorySubmit(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.extLinkCategoryName.value.trim();
    const editingId = form.elements.editingCategoryId.value;

    if (!name) {
        showNotification('Название папки не может быть пустым.', 'error');
        return;
    }

    const colorInput = form.querySelector('input[name="extLinkCategoryColor"]:checked');
    const categoryData = {
        name,
        color: colorInput ? colorInput.value : 'blue',
    };

    try {
        if (editingId) {
            categoryData.id = parseInt(editingId, 10);
            await saveToIndexedDB('extLinkCategories', categoryData);
        } else {
            await saveToIndexedDB('extLinkCategories', categoryData);
        }

        showNotification('Папка сохранена.');
        form.reset();
        form.elements.editingCategoryId.value = '';
        document.getElementById('extLinkCategorySubmitBtn').textContent = 'Добавить папку';
        document.getElementById('extLinkCategoryFormTitle').textContent = 'Добавить новую папку';
        document.getElementById('cancelEditExtLinkCategoryBtn').classList.add('hidden');
        const defaultColor = form.querySelector('input[name="extLinkCategoryColor"][value="blue"]');
        if (defaultColor) defaultColor.checked = true;

        await loadExtLinks();
        showOrganizeExtLinkCategoriesModal();
    } catch (e) {
        showNotification('Ошибка сохранения папки.', 'error');
        console.error('Ошибка сохранения папки:', e);
    }
}

async function handleDeleteExtLinkCategoryClick(categoryId) {
    if (isNaN(categoryId)) return;

    const linksInCategory = await getAllFromIndex('extLinks', 'category', categoryId);
    const categoryInfo = State.extLinkCategoryInfo[categoryId];
    const categoryName = categoryInfo ? categoryInfo.name : `ID ${categoryId}`;

    if (linksInCategory.length > 0) {
        showNotification(
            `Нельзя удалить категорию "${categoryName}", так как она используется в ${linksInCategory.length} ссылках.`,
            'error',
        );
        return;
    }

    if (confirm(`Вы уверены, что хотите удалить категорию "${categoryName}"?`)) {
        try {
            await deleteFromIndexedDB('extLinkCategories', categoryId);
            showNotification('Категория удалена.');

            await loadExtLinks();
            showOrganizeExtLinkCategoriesModal();
        } catch (e) {
            showNotification('Ошибка удаления категории.', 'error');
            console.error('Ошибка удаления категории:', e);
        }
    }
}

// Wrapper для модуля bookmarks
async function renderBookmarkFolders(folders) {
    return renderBookmarkFoldersModule(folders);
}

// loadFoldersList - wrapper для модуля bookmarks.js
async function loadFoldersList(foldersListElement) {
    return loadFoldersListModule(foldersListElement);
}

// renderBookmarks - wrapper для модуля bookmarks.js
async function renderBookmarks(bookmarks, folderMap = {}) {
    return renderBookmarksModule(bookmarks, folderMap);
}

// handleBookmarkAction - wrapper для модуля bookmarks.js
async function handleBookmarkAction(event) {
    return handleBookmarkActionModule(event);
}

// restoreBookmarkFromArchive, moveBookmarkToArchive - imported from bookmarks.js module

// handleViewBookmarkScreenshots - wrapper для модуля bookmarks.js
async function handleViewBookmarkScreenshots(bookmarkId) {
    return handleViewBookmarkScreenshotsModule(bookmarkId);
}

async function deleteBookmark(id) {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        console.error('deleteBookmark: Передан невалидный ID:', id);
        showNotification('Ошибка: Неверный ID закладки для удаления.', 'error');
        return;
    }

    let bookmarkToDelete = null;
    let screenshotIdsToDelete = [];
    let transaction;

    try {
        try {
            bookmarkToDelete = await getFromIndexedDB('bookmarks', numericId);
            if (!bookmarkToDelete) {
                console.warn(
                    `Закладка с ID ${numericId} не найдена в базе данных. Возможно, уже удалена.`,
                );
                removeBookmarkFromDOM(numericId);
                showNotification('Закладка не найдена (возможно, уже удалена).', 'warning');
                return;
            }
            if (
                Array.isArray(bookmarkToDelete.screenshotIds) &&
                bookmarkToDelete.screenshotIds.length > 0
            ) {
                screenshotIdsToDelete = [...bookmarkToDelete.screenshotIds];
                console.log(
                    `Найдены ID скриншотов [${screenshotIdsToDelete.join(
                        ',',
                    )}] для удаления вместе с закладкой ${numericId}.`,
                );
            } else {
                console.log(`Скриншоты для закладки ${numericId} не найдены или отсутствуют.`);
            }
        } catch (fetchError) {
            console.error(
                `Ошибка при получении данных закладки ${numericId} перед удалением:`,
                fetchError,
            );
            showNotification(
                'Не удалось получить данные скриншотов, но будет предпринята попытка удалить закладку.',
                'warning',
            );
        }

        if (bookmarkToDelete && typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex('bookmarks', numericId, null, 'delete', bookmarkToDelete);
                console.log(
                    `Обновление индекса (delete) для закладки ID: ${numericId} инициировано.`,
                );
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса при удалении закладки ${numericId}:`,
                    indexError,
                );
                showNotification('Ошибка обновления поискового индекса.', 'warning');
            }
        } else {
            console.warn(
                `Обновление индекса для закладки ${numericId} пропущено (данные не получены или функция недоступна).`,
            );
        }

        const stores = ['bookmarks'];
        if (screenshotIdsToDelete.length > 0) stores.push('screenshots');

        transaction = State.db.transaction(stores, 'readwrite');
        const bookmarkStore = transaction.objectStore('bookmarks');
        const screenshotStore = stores.includes('screenshots')
            ? transaction.objectStore('screenshots')
            : null;

        const deletePromises = [];

        deletePromises.push(
            new Promise((resolve, reject) => {
                const req = bookmarkStore.delete(numericId);
                req.onsuccess = () => {
                    console.log(`Запрос на удаление закладки ${numericId} успешен.`);
                    resolve();
                };
                req.onerror = (e) => {
                    console.error(
                        `Ошибка запроса на удаление закладки ${numericId}:`,
                        e.target.error,
                    );
                    reject(e.target.error);
                };
            }),
        );

        if (screenshotStore && screenshotIdsToDelete.length > 0) {
            screenshotIdsToDelete.forEach((screenshotId) => {
                deletePromises.push(
                    new Promise((resolve, reject) => {
                        const req = screenshotStore.delete(screenshotId);
                        req.onsuccess = () => {
                            console.log(`Запрос на удаление скриншота ${screenshotId} успешен.`);
                            resolve();
                        };
                        req.onerror = (e) => {
                            console.error(
                                `Ошибка запроса на удаление скриншота ${screenshotId}:`,
                                e.target.error,
                            );
                            reject(e.target.error);
                        };
                    }),
                );
            });
        }

        await Promise.all(deletePromises);
        console.log('Все запросы на удаление (закладка + скриншоты) успешно инициированы.');

        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log(
                    `Транзакция удаления закладки ${numericId} и скриншотов успешно завершена.`,
                );
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    `Ошибка ТРАНЗАКЦИИ при удалении закладки ${numericId}:`,
                    e.target.error,
                );
                reject(e.target.error || new Error('Неизвестная ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn(`Транзакция удаления закладки ${numericId} прервана:`, e.target.error);
                reject(e.target.error || new Error('Транзакция прервана'));
            };
        });

        try {
            const removedBookmark = await removeFromFavoritesDB('bookmark', numericId);
            const removedNote = await removeFromFavoritesDB('bookmark_note', numericId);
            if (removedBookmark || removedNote) {
                if (Array.isArray(State.currentFavoritesCache)) {
                    State.currentFavoritesCache = State.currentFavoritesCache.filter(
                        (f) =>
                            !(
                                String(f.originalItemId) === String(numericId) &&
                                (f.itemType === 'bookmark' || f.itemType === 'bookmark_note')
                            ),
                    );
                }
                if (typeof updateFavoriteStatusUI === 'function') {
                    await updateFavoriteStatusUI(numericId, 'bookmark', false);
                    await updateFavoriteStatusUI(numericId, 'bookmark_note', false);
                }
                if (typeof State.currentSection !== 'undefined' && State.currentSection === 'favorites') {
                    if (typeof renderFavoritesPage === 'function') {
                        await renderFavoritesPage();
                    }
                } else {
                    const selector = `.favorite-item[data-original-item-id="${String(
                        numericId,
                    )}"][data-item-type="bookmark"], .favorite-item[data-original-item-id="${String(
                        numericId,
                    )}"][data-item-type="bookmark_note"]`;
                    document.querySelectorAll(selector).forEach((el) => el.remove());
                    const favContainer = document.getElementById('favoritesContainer');
                    if (favContainer && !favContainer.querySelector('.favorite-item')) {
                        favContainer.innerHTML =
                            '<p class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">В избранном пока ничего нет.</p>';
                    }
                }
            }
        } catch (favErr) {
            console.warn('deleteBookmark: ошибка синхронизации с избранным:', favErr);
        }

        removeBookmarkFromDOM(numericId);
        showNotification('Закладка и связанные скриншоты удалены');
    } catch (error) {
        console.error(`Критическая ошибка при удалении закладки ID ${numericId}:`, error);
        showNotification('Ошибка при удалении закладки: ' + (error.message || error), 'error');
        if (transaction && transaction.abort && transaction.readyState !== 'done') {
            try {
                transaction.abort();
            } catch (abortErr) {
                console.error('Ошибка отмены транзакции в catch:', abortErr);
            }
        }
        await loadBookmarks();
    }
}

async function showEditBookmarkModal(id) {
    const modalElements = await ensureBookmarkModal();
    if (!modalElements || !modalElements.form) {
        showNotification(
            'Критическая ошибка: Не удалось инициализировать окно редактирования закладки',
            'error',
        );
        console.error(
            'Не удалось получить элементы модального окна из ensureBookmarkModal в showEditBookmarkModal.',
        );
        return;
    }
    const {
        modal,
        form,
        modalTitle,
        submitButton,
        idInput,
        titleInput,
        urlInput,
        descriptionInput,
        folderSelect,
        thumbsContainer,
    } = modalElements;

    if (thumbsContainer) thumbsContainer.innerHTML = '';
    delete form._tempScreenshotBlobs;
    delete form.dataset.screenshotsToDelete;
    form.dataset.existingScreenshotIds = '';
    form.dataset.existingRendered = 'false';

    try {
        const bookmark = await getFromIndexedDB('bookmarks', id);
        if (!bookmark) {
            showNotification('Закладка не найдена', 'error');
            modal.classList.add('hidden');
            return;
        }

        form.reset();

        const draftList = form.querySelector('.pdf-draft-list');
        if (draftList) {
            const draftBlock =
                draftList.closest('.mb-4') || draftList.closest('details') || draftList;
            draftBlock.remove();
            form.dataset.pdfDraftWired = '0';
        }

        idInput.value = bookmark.id;
        titleInput.value = bookmark.title || '';
        urlInput.value = bookmark.url || '';
        descriptionInput.value = bookmark.description || '';

        if (typeof populateBookmarkFolders === 'function') {
            await populateBookmarkFolders(folderSelect);
            folderSelect.value = bookmark.folder || '';
        } else {
            console.warn('populateBookmarkFolders не найдена в showEditBookmarkModal.');
        }

        modalTitle.textContent = 'Редактировать закладку';
        submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        submitButton.disabled = false;

        const existingIds = bookmark.screenshotIds || [];
        form.dataset.existingScreenshotIds = existingIds.join(',');
        if (existingIds.length > 0 && typeof renderExistingThumbnail === 'function') {
            const renderPromises = existingIds.map((screenshotId) =>
                renderExistingThumbnail(screenshotId, thumbsContainer, form),
            );
            await Promise.all(renderPromises);
        }
        form.dataset.existingRendered = 'true';

        form._initialState = getCurrentBookmarkFormState(form);
        console.log(
            'Захвачено начальное состояние для EDIT bookmarkModal:',
            JSON.parse(JSON.stringify(form._initialState)),
        );

        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        if (typeof addEscapeHandler === 'function') addEscapeHandler(modal);

        if (titleInput) {
            setTimeout(() => {
                try {
                    titleInput.focus();
                } catch (focusError) {
                    console.warn('Не удалось установить фокус (edit bookmark):', focusError);
                }
            }, 50);
        }
    } catch (error) {
        console.error('Ошибка при загрузке закладки для редактирования:', error);
        showNotification('Ошибка загрузки закладки', 'error');
        modal.classList.add('hidden');
    }
}

function renderLinks(links) {
    const linksContainer = document.getElementById('linksContainer');
    if (!linksContainer) return;

    linksContainer.innerHTML = '';

    if (!links?.length) {
        linksContainer.innerHTML =
            '<div class="text-center py-6 text-gray-500">Нет сохраненных ссылок</div>';
        if (typeof applyCurrentView === 'function') {
            applyCurrentView('linksContainer');
        } else {
            console.warn(
                'Функция applyCurrentView не найдена, состояние вида может быть некорректным.',
            );
        }
        return;
    }

    const categoryStyles = {
        common: {
            name: 'Общие',
            classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
        },
        reports: {
            name: 'Отчеты',
            classes: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
        },
        settings: {
            name: 'Настройки',
            classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200',
        },
        help: {
            name: 'Справка',
            classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
        },
        default: {
            name: '',
            classes: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300',
        },
    };

    const fragment = document.createDocumentFragment();
    links.forEach((link) => {
        const linkElement = document.createElement('div');
        let categoryBadgeHTML = '';
        if (link.category) {
            const style = categoryStyles[link.category] || {
                ...categoryStyles.default,
                name: link.category,
            };
            categoryBadgeHTML = `<span class="link-category-badge inline-block px-2 py-0.5 rounded text-xs ${style.classes} whitespace-nowrap">${style.name}</span>`;
        }

        linkElement.className =
            'cib-link-item view-item flex items-start p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition duration-150 ease-in-out';
        linkElement.dataset.id = link.id;
        if (link.category) linkElement.dataset.category = link.category;

        linkElement.innerHTML = `
            <div class="flex-grow min-w-0 mr-3">
                <h3 class="font-bold truncate text-gray-900 dark:text-gray-100" title="${
                    link.title
                }">${link.title}</h3>
                <p class="link-description text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">${
                    link.description || ''
                }</p>
                <div class="link-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    ${categoryBadgeHTML}
                    <a href="${
                        link.url
                    }" target="_blank" rel="noopener noreferrer" class="link-url text-primary hover:underline text-sm inline-flex items-center">
                        <i class="fas fa-external-link-alt mr-1 text-xs"></i>Открыть
                    </a>
                </div>
                <div class="link-code-container mt-2">
                    <code class="text-xs bg-gray-100 dark:bg-gray-700 p-1 rounded inline-block break-all">${
                        link.url
                    }</code>
                </div>
            </div>
            <div class="flex flex-shrink-0 items-center space-x-1">
                <button data-action="edit" class="edit-link p-1 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary" title="Редактировать">
                    <i class="fas fa-edit fa-fw"></i>
                </button>
                <button data-action="delete" class="delete-link p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500" title="Удалить">
                    <i class="fas fa-trash fa-fw"></i>
                </button>
            </div>`;
        fragment.appendChild(linkElement);
    });

    linksContainer.appendChild(fragment);

    if (typeof applyCurrentView === 'function') {
        applyCurrentView('linksContainer');
    } else {
        console.warn(
            'Функция applyCurrentView не найдена, состояние вида может быть некорректным после рендеринга ссылок.',
        );
    }
}

function handleLinkAction(event) {
    const target = event.target;
    const button = target.closest('button[data-action]');
    const linkItem = target.closest('.link-item');

    if (!linkItem || !button) return;

    const linkId = parseInt(linkItem.dataset.id, 10);
    const action = button.dataset.action;

    event.stopPropagation();

    if (action === 'edit') {
        showEditLinkModal(linkId);
    } else if (action === 'delete') {
        deleteLink(linkId);
    }
}

async function deleteLink(linkId) {
    if (!confirm('Вы уверены, что хотите удалить эту ссылку?')) return;

    try {
        await deleteFromIndexedDB('links', parseInt(linkId, 10));
        const links = await getAllFromIndexedDB('links');
        renderLinks(links);
        showNotification('Ссылка успешно удалена.');
    } catch (error) {
        console.error('Error deleting link:', error);
        showNotification('Ошибка при удалении ссылки.', 'error');
    }
}

function filterItems(options) {
    const {
        containerSelector,
        itemSelector,
        searchInputSelector,
        filterSelectSelector,
        dataAttribute,
        textSelectors,
    } = options;

    const searchInput = document.getElementById(searchInputSelector);
    const filterSelect = filterSelectSelector
        ? document.getElementById(filterSelectSelector)
        : null;
    const container = document.querySelector(containerSelector);

    if (!searchInput) {
        console.error(`filterItems: Search input #${searchInputSelector} not found.`);
        return;
    }
    if (!container) {
        console.error(`filterItems: Container ${containerSelector} not found.`);
        return;
    }

    const items = container.querySelectorAll(itemSelector);

    if (!items.length && container.textContent.includes('Загрузка')) {
        console.log('filterItems: Items not found, likely still loading.');
        return;
    }

    const searchValue = searchInput.value.trim().toLowerCase();
    const filterValue = filterSelect ? filterSelect.value : '';

    let visibleCount = 0;

    items.forEach((item) => {
        const itemFilterValue =
            filterSelect && dataAttribute ? item.dataset[dataAttribute] || '' : '';
        const matchesFilter = !filterValue || itemFilterValue === filterValue;

        let matchesSearch = !searchValue;
        if (searchValue) {
            matchesSearch = textSelectors.some((selector) => {
                const element = item.querySelector(selector);
                const elementText = element?.textContent?.toLowerCase() || '';
                const isMatch = elementText.includes(searchValue);
                return isMatch;
            });
        }

        const shouldHide = !(matchesSearch && matchesFilter);
        item.classList.toggle('hidden', shouldHide);
        if (!shouldHide) visibleCount++;
    });
}

// Wrapper для модуля bookmarks
async function filterBookmarks() {
    return filterBookmarksModule();
}

function filterLinks() {
    filterItems({
        containerSelector: '#linksContainer',
        itemSelector: '.cib-link-item',
        searchInputSelector: '#linkSearchInput',
        textSelectors: ['h3', 'code', 'p'],
    });
}

document
    .getElementById('bookmarkSearchInput')
    ?.addEventListener('input', debounce(filterBookmarks, 250));
document.getElementById('linkSearchInput')?.addEventListener('input', debounce(filterLinks, 250));
document.getElementById('bookmarkFolderFilter')?.addEventListener('change', filterBookmarks);

// Wrapper для модуля Import/Export
async function importBookmarks(bookmarks) {
    return importBookmarksModule(bookmarks);
}

function getRequiredElements(ids) {
    const elements = {};
    for (const id of ids) {
        elements[id] = document.getElementById(id);
        if (!elements[id]) {
            console.error(`Required element with ID "${id}" not found.`);
            return null;
        }
    }
    return elements;
}

// Wrapper для модуля bookmarks
async function populateBookmarkFolders(folderSelectElement) {
    return populateBookmarkFoldersModule(folderSelectElement);
}

// showOrganizeFoldersModal - wrapper для модуля bookmarks.js
function showOrganizeFoldersModal() {
    return showOrganizeFoldersModalModule();
}

// handleDeleteBookmarkFolderClick - wrapper для модуля bookmarks.js
async function handleDeleteBookmarkFolderClick(folderId, folderItem) {
    return handleDeleteBookmarkFolderClickModule(folderId, folderItem);
}

// ============================================================================
// CIB LINKS SYSTEM - MIGRATED to js/features/cib-links.js
// ============================================================================
// All CIB Links functions are now imported from the cib-links module.
// See: js/features/cib-links.js
// Functions migrated:
// - initCibLinkSystem, initCibLinkModal, showAddEditCibLinkModal
// - handleLinkActionClick, loadCibLinks, getAllCibLinks, renderCibLinks
// - handleCibLinkSubmit, deleteCibLink

// Wrapper functions for backward compatibility
function initCibLinkSystem() {
    return initCibLinkSystemModule();
}

function initCibLinkModal() {
    return initCibLinkModalModule();
}

async function showAddEditCibLinkModal(linkId = null) {
    return showAddEditCibLinkModalModule(linkId);
}

function handleLinkActionClick(event) {
    return handleLinkActionClickModule(event);
}

async function loadCibLinks() {
    return loadCibLinksModule();
}

async function getAllCibLinks() {
    return getAllCibLinksModule();
}

async function renderCibLinks(links) {
    return renderCibLinksModule(links);
}

async function handleCibLinkSubmit(event) {
    return handleCibLinkSubmitModule(event);
}

async function deleteCibLink(linkId, linkTitle) {
    return deleteCibLinkModule(linkId, linkTitle);
}



let __copyLockUntil = 0;
function __acquireCopyLock(windowMs = 250) {
    const now = Date.now();
    if (now < __copyLockUntil) return false;
    __copyLockUntil = now + windowMs;
    setTimeout(() => {
        if (Date.now() >= __copyLockUntil) __copyLockUntil = 0;
    }, windowMs + 10);
    return true;
}

// Wrapper для модуля clipboard.js
async function copyToClipboard(text, successMessage = 'Скопировано!', opts = {}) {
    return copyToClipboardModule(text, successMessage, opts);
}

// Wrapper для модуля reglaments.js
function initReglamentsSystem() {
    return initReglamentsSystemModule();
}

// Wrapper для модуля reglaments.js
async function showReglamentDetail(reglamentId) {
    return showReglamentDetailModule(reglamentId);
}

// Wrapper для модуля reglaments.js
function renderReglamentCategories() {
    return renderReglamentCategoriesModule();
}

// Wrapper для модуля reglaments.js
function createCategoryElement(categoryId, title, iconClass = 'fa-folder', color = 'gray') {
    return createCategoryElementModule(categoryId, title, iconClass, color);
}

// handleSaveFolderSubmit - wrapper для модуля bookmarks.js
async function handleSaveFolderSubmit(event) {
    return handleSaveFolderSubmitModule(event);
}

async function handleDeleteCategoryClick(event) {
    const deleteButton = event.target.closest('.delete-category-btn');
    if (!deleteButton) return;

    event.stopPropagation();

    const categoryElement = deleteButton.closest('.reglament-category');
    const categoryId = categoryElement?.dataset.category;
    const categoryTitle =
        categoryElement?.querySelector('h4')?.textContent || 'Выбранная категория';

    if (!categoryId) {
        console.error('Could not determine category ID for deletion.');
        return;
    }

    const protectedCategories = ['difficult-client', 'tech-support', 'emergency'];
    if (protectedCategories.includes(categoryId)) {
        showNotification(`Категорию "${categoryTitle}" нельзя удалить (системная).`, 'warning');
        return;
    }

    try {
        const regulations = await getReglamentsByCategory(categoryId);
        if (regulations && regulations.length > 0) {
            showNotification(
                `Нельзя удалить категорию "${categoryTitle}", т.к. она содержит ${regulations.length} регламент(ов). Сначала удалите или переместите регламенты.`,
                'error',
                5000,
            );
            return;
        }

        if (
            confirm(
                `Вы уверены, что хотите удалить категорию "${categoryTitle}"? Это действие необратимо.`,
            )
        ) {
            if (categoryDisplayInfo[categoryId]) {
                delete categoryDisplayInfo[categoryId];
                const success = await saveCategoryInfo();
                if (success) {
                    renderReglamentCategories();
                    populateReglamentCategoryDropdowns();
                    showNotification(`Категория "${categoryTitle}" удалена.`);
                } else {
                    showNotification('Ошибка при сохранении удаления категории.', 'error');
                }
            } else {
                showNotification('Ошибка: Категория для удаления не найдена в данных.', 'error');
                if (categoryElement && categoryElement.parentNode) {
                    categoryElement.remove();
                }
                renderReglamentCategories();
            }
        }
    } catch (error) {
        console.error('Error checking/deleting category:', error);
        showNotification('Ошибка при удалении категории.', 'error');
    }
}

// Wrapper для модуля reglaments.js
async function loadReglaments() {
    return loadReglamentsModule();
}

// Wrapper для модуля reglaments.js
async function getAllReglaments() {
    return getAllReglamentsModule();
}

// Wrapper для модуля Import/Export
async function importReglaments(reglaments) {
    return importReglamentsModule(reglaments);
}

// Wrapper для модуля reglaments.js
async function showReglamentsForCategory(categoryId) {
    return showReglamentsForCategoryModule(categoryId);
}

// Wrapper для модуля reglaments.js
function handleReglamentAction(event) {
    return handleReglamentActionModule(event);
}

async function handleExtLinkFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const modalElements = ensureExtLinkModal();

    if (
        !modalElements ||
        !modalElements.modal ||
        !modalElements.form ||
        !modalElements.saveButton
    ) {
        console.error(
            'handleExtLinkFormSubmit: Не удалось получить элементы модального окна для внешних ссылок.',
        );
        showNotification('Ошибка интерфейса при сохранении внешнего ресурса.', 'error');
        return;
    }

    const { modal, idInput, titleInput, urlInput, descriptionInput, categoryInput, saveButton } =
        modalElements;

    if (modal) {
        modal.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') {
            removeEscapeHandler(modal);
        }
    }
    requestAnimationFrame(() => {
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('overflow-hidden');
        }
    });

    if (saveButton) saveButton.disabled = true;

    const id = idInput.value;
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    const description = descriptionInput.value.trim() || null;

    const categoryValue = categoryInput.value;
    let category = null;
    if (categoryValue && !isNaN(parseInt(categoryValue, 10))) {
        category = parseInt(categoryValue, 10);
    }

    if (!title || !url) {
        showNotification("Пожалуйста, заполните поля 'Название' и 'URL'", 'error');
        if (saveButton) saveButton.disabled = false;
        return;
    }
    try {
        let testUrl = url;
        if (!testUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && testUrl.includes('.')) {
            if (!testUrl.startsWith('//')) {
                testUrl = 'https://' + testUrl;
            }
        }
        new URL(testUrl);
    } catch (_) {
        showNotification(
            'Пожалуйста, введите корректный URL (например, https://example.com)',
            'error',
        );
        if (saveButton) saveButton.disabled = false;
        return;
    }

    const newData = {
        title,
        url,
        description,
        category,
    };

    const isEditing = !!id;
    let oldData = null;
    let finalId = null;

    try {
        const timestamp = new Date().toISOString();
        if (isEditing) {
            newData.id = parseInt(id, 10);
            finalId = newData.id;

            try {
                oldData = await getFromIndexedDB('extLinks', newData.id);
                newData.dateAdded = oldData?.dateAdded || timestamp;
            } catch (fetchError) {
                console.warn(
                    `Не удалось получить старые данные внешнего ресурса (${newData.id}):`,
                    fetchError,
                );
                newData.dateAdded = timestamp;
            }
            newData.dateUpdated = timestamp;
        } else {
            newData.dateAdded = timestamp;
        }

        const savedResult = await saveToIndexedDB('extLinks', newData);
        if (!isEditing) {
            finalId = savedResult;
            newData.id = finalId;
        }

        if (typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex(
                    'extLinks',
                    finalId,
                    newData,
                    isEditing ? 'update' : 'add',
                    oldData,
                );
                const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                console.log(
                    `Обновление индекса для внешнего ресурса (${finalId}) инициировано ${oldDataStatus}.`,
                );
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса для внешнего ресурса ${finalId}:`,
                    indexError,
                );
                showNotification('Ошибка обновления поискового индекса для ресурса.', 'warning');
            }
        } else {
            console.warn('Функция updateSearchIndex недоступна.');
        }

        const updatedLinks = await getAllExtLinks();
        renderExtLinks(updatedLinks, State.extLinkCategoryInfo);
        showNotification(isEditing ? 'Ресурс обновлен' : 'Ресурс добавлен');
        modal.classList.add('hidden');
    } catch (error) {
        console.error('Ошибка при сохранении внешнего ресурса:', error);
        showNotification('Ошибка при сохранении', 'error');
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}

// Wrapper для модуля reglaments.js
async function deleteReglamentFromList(reglamentId, reglamentItemElement) {
    return deleteReglamentFromListModule(reglamentId, reglamentItemElement);
}

// Wrapper для модуля reglaments.js
function getReglamentsByCategory(category) {
    return getReglamentsByCategoryModule(category);
}

const getOrCreateModal = (id, baseClassName, innerHTML, setupCallback) => {
    let modal = document.getElementById(id);
    let isNew = false;

    if (!modal) {
        isNew = true;
        modal = document.createElement('div');
        modal.id = id;
        modal.className = baseClassName;
        if (!baseClassName.includes('flex')) {
            modal.classList.add('flex', 'items-center', 'justify-center');
        }
        modal.innerHTML = innerHTML;

        if (!document.body) {
            console.error(
                `[getOrCreateModal] document.body не доступно при создании #${id}. Невозможно добавить модальное окно в DOM.`,
            );
            throw new Error(`document.body не доступно при создании модального окна #${id}`);
        }
        document.body.appendChild(modal);
        console.log(`[getOrCreateModal] Created new modal #${id}.`);

        if (modal._overlayClickHandler) {
            modal.removeEventListener('click', modal._overlayClickHandler);
        }

        const overlayClickHandler = (event) => {
            const currentModal = document.getElementById(id);
            if (!currentModal || currentModal.classList.contains('hidden')) return;

            if (event.target.closest('.close-modal, .cancel-modal, .close-detail-modal')) {
                console.log(`[Click Close for ${id}] Closing modal via button.`);
                currentModal.classList.add('hidden');
                removeEscapeHandler(currentModal);
                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('modal-open');
                }
            }
        };

        modal.addEventListener('click', overlayClickHandler);
        modal._overlayClickHandler = overlayClickHandler;
        modal.dataset.baseListenersAdded = 'true';
        console.log(
            `[getOrCreateModal] Attached NEW overlay click handler (buttons only) for #${id}.`,
        );
    } else {
        console.log(`[getOrCreateModal] Modal #${id} already exists.`);

        if (!modal.dataset.baseListenersAdded) {
            if (modal._overlayClickHandler) {
                modal.removeEventListener('click', modal._overlayClickHandler);
            }
            const overlayClickHandler = (event) => {
                const currentModal = document.getElementById(id);
                if (!currentModal || currentModal.classList.contains('hidden')) return;
                if (event.target.closest('.close-modal, .cancel-modal, .close-detail-modal')) {
                    currentModal.classList.add('hidden');
                    removeEscapeHandler(currentModal);
                    if (getVisibleModals().length === 0) {
                        document.body.classList.remove('modal-open');
                    }
                }
            };
            modal.addEventListener('click', overlayClickHandler);
            modal._overlayClickHandler = overlayClickHandler;
            modal.dataset.baseListenersAdded = 'true';
            console.log(
                `[getOrCreateModal] Attached NEW overlay click handler (buttons only) for EXISTING #${id}.`,
            );
        }
    }

    if (typeof setupCallback === 'function' && (!modal.dataset.setupComplete || isNew)) {
        const modalForSetup = document.getElementById(id);
        if (modalForSetup) {
            try {
                setupCallback(modalForSetup, isNew);
                modalForSetup.dataset.setupComplete = 'true';
                console.log(
                    `[getOrCreateModal] Setup callback executed for #${id} (isNew=${isNew}).`,
                );
            } catch (error) {
                console.error(
                    `[getOrCreateModal] Ошибка выполнения setupCallback для #${id} (isNew=${isNew}):`,
                    error,
                );
                modalForSetup.classList.add('hidden');
                removeEscapeHandler(modalForSetup);
                if (typeof showNotification === 'function') {
                    showNotification(`Ошибка настройки окна ${id}`, 'error');
                }
                throw new Error(`Ошибка настройки модального окна #${id}: ${error.message}`);
            }
        } else {
            console.error(
                `[getOrCreateModal] Не удалось найти модальное окно #${id} в DOM перед вызовом setupCallback.`,
            );
            throw new Error(`Модальное окно #${id} не найдено для setupCallback.`);
        }
    }
    return document.getElementById(id);
};

const addEscapeHandler = (modalElement) => {
    if (!modalElement) return;
    console.log(
        `[addEscapeHandler STUB] Вызвана для #${modalElement.id}, но ничего не делает (обработка Escape централизована).`,
    );
};

function requestCloseModal(modalElement) {
    if (!modalElement) return false;

    const modalId = modalElement.id;
    let modalType = null;
    let needsCleanupForScreenshots = false;

    if (modalId === 'editModal') {
        modalType = 'edit';
        needsCleanupForScreenshots = true;
    } else if (modalId === 'addModal') {
        modalType = 'add';
        needsCleanupForScreenshots = true;
    } else if (modalId === 'customizeUIModal') {
        modalType = 'customizeUI';
    } else if (modalId === 'reglamentModal') {
        modalType = 'reglament';
    } else if (modalId === 'bookmarkModal') {
        modalType = 'bookmark';
    } else {
        console.warn(
            'requestCloseModal: Вызвано для окна без специальной логики проверки изменений:',
            modalId,
        );
        modalElement.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') {
            removeEscapeHandler(modalElement);
        }
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('overflow-hidden');
        }
        return true;
    }

    let changesDetected = false;

    if (modalType === 'edit' || modalType === 'add') {
        changesDetected = hasChanges(modalType);
    } else if (modalType === 'customizeUI') {
        changesDetected = State.isUISettingsDirty;
    }

    let performClose = true;

    if (changesDetected) {
        if (!confirm('Вы не сохранили изменения. Закрыть без сохранения?')) {
            console.log(`Закрытие окна ${modalId} отменено пользователем.`);
            performClose = false;
        } else {
            console.log(`Закрытие окна ${modalId} подтверждено пользователем (с изменениями).`);
            if (modalType === 'customizeUI') {
                if (
                    typeof applyPreviewSettings === 'function' &&
                    typeof State.originalUISettings !== 'undefined'
                ) {
                    applyPreviewSettings(State.originalUISettings);
                    State.isUISettingsDirty = false;
                    console.log('Предпросмотр настроек UI откачен к оригинальным.');
                }
                const inputField = document.getElementById('employeeExtensionInput');
                if (inputField && !inputField.classList.contains('hidden')) {
                    const displaySpan = document.getElementById('employeeExtensionDisplay');
                    inputField.classList.add('hidden');
                    if (displaySpan) displaySpan.classList.remove('hidden');
                    if (typeof loadEmployeeExtension === 'function') loadEmployeeExtension();
                }
            }
        }
    } else {
        console.log(`Закрытие окна ${modalId} (без изменений).`);
    }

    if (performClose) {
        if (needsCleanupForScreenshots) {
            const stepsContainerSelector = modalType === 'edit' ? '#editSteps' : '#newSteps';
            const stepsContainer = modalElement.querySelector(stepsContainerSelector);
            if (stepsContainer) {
                const stepDivs = stepsContainer.querySelectorAll('.edit-step');
                stepDivs.forEach((stepDiv) => {
                    const thumbsContainer = stepDiv.querySelector('#screenshotThumbnailsContainer');
                    if (
                        thumbsContainer &&
                        typeof clearTemporaryThumbnailsFromContainer === 'function'
                    ) {
                        clearTemporaryThumbnailsFromContainer(thumbsContainer);
                    } else if (thumbsContainer) {
                        const tempThumbs = thumbsContainer.querySelectorAll(
                            '.screenshot-thumbnail.temporary img[data-object-url]',
                        );
                        tempThumbs.forEach((img) => {
                            if (img.dataset.objectUrl && img.dataset.objectUrlRevoked !== 'true') {
                                try {
                                    URL.revokeObjectURL(img.dataset.objectUrl);
                                } catch (e) {}
                            }
                        });
                        thumbsContainer.innerHTML = '';
                        console.warn(
                            'clearTemporaryThumbnailsFromContainer не найдена или ошибка, временные миниатюры очищены вручную в requestCloseModal.',
                        );
                    }
                    delete stepDiv._tempScreenshotBlobs;
                    delete stepDiv.dataset.screenshotsToDelete;
                    delete stepDiv.dataset.existingScreenshotIds;
                });
                if (stepsContainer.children.length === 0 && modalType === 'add') {
                    stepsContainer.innerHTML =
                        '<p class="text-gray-500 dark:text-gray-400 text-center">Добавьте шаги для нового алгоритма.</p>';
                }
            }
        }

        modalElement.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') {
            removeEscapeHandler(modalElement);
        }

        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('overflow-hidden');
        }

        if (modalType === 'edit') {
            initialEditState = null;
        } else if (modalType === 'add') {
            initialAddState = null;
        } else if (modalType === 'customizeUI') {
            State.isUISettingsDirty = false;
        }
    }
    return performClose;
}

const removeEscapeHandler = (modalElement) => {
    if (modalElement?._escapeHandler) {
        document.removeEventListener('keydown', modalElement._escapeHandler);
        delete modalElement._escapeHandler;
        console.log(`[removeEscapeHandler] Removed Escape handler for #${modalElement.id}`);
    }
};

// Wrapper для модуля reglaments.js
async function showAddReglamentModal(currentCategoryId = null) {
    return showAddReglamentModalModule(currentCategoryId);
}

// Wrapper для модуля reglaments.js
async function editReglament(id) {
    return editReglamentModule(id);
}

async function loadExtLinks() {
    const LOG_PREFIX = '[loadExtLinks V.Fix with data correction]';
    console.log(`${LOG_PREFIX} Запуск...`);
    try {
        const migrationStatus = await getFromIndexedDB('preferences', EXT_LINKS_MIGRATION_KEY);
        if (State.db && (!migrationStatus || !migrationStatus.done)) {
            console.log(
                `${LOG_PREFIX} ЗАПУСК МИГРАЦИИ: Категории для внешних ссылок будут проверены и, при необходимости, перенесены в новую структуру.`,
            );

            const defaultCategoriesRaw = {
                docs: { name: 'Документация', color: 'blue', icon: 'fa-file-alt' },
                gov: { name: 'Гос. сайты', color: 'red', icon: 'fa-landmark' },
                tools: { name: 'Инструменты', color: 'green', icon: 'fa-tools' },
                other: { name: 'Прочее', color: 'yellow', icon: 'fa-link' },
            };

            const existingCategories = await getAllFromIndexedDB('extLinkCategories');
            const existingCategoryNames = new Set(existingCategories.map((cat) => cat.name));
            console.log(`${LOG_PREFIX} Найдено существующих категорий:`, existingCategoryNames);

            const oldToNewIdMap = {};
            existingCategories.forEach((cat) => {
                for (const [legacyKey, legacyData] of Object.entries(defaultCategoriesRaw)) {
                    if (legacyData.name === cat.name) {
                        oldToNewIdMap[legacyKey] = cat.id;
                    }
                }
            });

            for (const [key, catData] of Object.entries(defaultCategoriesRaw)) {
                if (!existingCategoryNames.has(catData.name)) {
                    console.log(
                        `${LOG_PREFIX} Добавление новой категории по умолчанию: "${catData.name}"`,
                    );
                    const newId = await saveToIndexedDB('extLinkCategories', catData);
                    oldToNewIdMap[key] = newId;
                } else {
                    console.log(
                        `${LOG_PREFIX} Категория "${catData.name}" уже существует, пропуск добавления.`,
                    );
                }
            }

            const allLinksForMigration = await getAllExtLinks();
            if (allLinksForMigration.length > 0) {
                const updatePromises = allLinksForMigration.map((link) => {
                    if (
                        link.category &&
                        typeof link.category === 'string' &&
                        oldToNewIdMap[link.category]
                    ) {
                        console.log(
                            `${LOG_PREFIX} Миграция ссылки "${link.title}" со старой категории "${
                                link.category
                            }" на новый ID ${oldToNewIdMap[link.category]}`,
                        );
                        link.category = oldToNewIdMap[link.category];
                        return saveToIndexedDB('extLinks', link);
                    }
                    return Promise.resolve();
                });
                await Promise.all(updatePromises);
            }

            await saveToIndexedDB('preferences', { id: EXT_LINKS_MIGRATION_KEY, done: true });
            console.log(`${LOG_PREFIX} МИГРАЦИЯ ЗАВЕРШЕНА. Флаг установлен.`);
        }

        const allLinks = await getAllExtLinks();
        const linksToFix = allLinks.filter(
            (link) => typeof link.category === 'string' && !isNaN(parseInt(link.category, 10)),
        );
        if (linksToFix.length > 0) {
            console.warn(
                `${LOG_PREFIX} Найдено ${linksToFix.length} ссылок с ID категории в виде строки. Запускаю исправление.`,
            );
            const fixPromises = linksToFix.map((link) => {
                const numericId = parseInt(link.category, 10);
                console.log(
                    `   - Исправление ссылки "${link.title}": категория "${link.category}" -> ${numericId}`,
                );
                link.category = numericId;
                return saveToIndexedDB('extLinks', link);
            });
            await Promise.all(fixPromises);
            showNotification('База данных внешних ресурсов была автоматически обновлена.', 'info');
        }
    } catch (migrationError) {
        console.error(
            `${LOG_PREFIX} Критическая ошибка во время миграции или исправления данных:`,
            migrationError,
        );
        if (typeof showNotification === 'function') {
            showNotification(
                `Критическая ошибка обновления данных: ${migrationError.message}`,
                'error',
            );
        }
    }

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');
        State.extLinkCategoryInfo = categories.reduce((acc, cat) => {
            if (cat && cat.id !== undefined) {
                acc[cat.id] = cat;
            }
            return acc;
        }, {});
        console.log(`${LOG_PREFIX} Кэш 'State.extLinkCategoryInfo' успешно обновлен.`);

        await populateExtLinkCategoryFilter();
        console.log(`${LOG_PREFIX} Фильтр категорий внешних ссылок заполнен актуальными данными.`);
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке категорий внешних ресурсов:`, error);
        State.extLinkCategoryInfo = {};
        if (typeof showNotification === 'function') {
            showNotification('Не удалось загрузить категории для внешних ресурсов.', 'error');
        }
    }
}

async function populateExtLinkCategoryFilter() {
    const filterSelect = document.getElementById('extLinkCategoryFilter');
    if (!filterSelect) {
        console.error(
            'Не найден select для фильтра категорий внешних ссылок (#extLinkCategoryFilter)',
        );
        return;
    }

    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Все категории</option>';

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');
        if (categories && categories.length > 0) {
            const fragment = document.createDocumentFragment();
            const sortedCategories = categories.sort((a, b) => a.name.localeCompare(b.name));

            sortedCategories.forEach((cat) => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                fragment.appendChild(option);
            });
            filterSelect.appendChild(fragment);
        }

        if (currentValue && filterSelect.querySelector(`option[value="${currentValue}"]`)) {
            filterSelect.value = currentValue;
        } else {
            filterSelect.value = '';
        }
        console.log('Фильтр категорий внешних ресурсов обновлен из БД.');
    } catch (error) {
        console.error('Ошибка при заполнении фильтра категорий внешних ресурсов:', error);
    }
}

async function handleExtLinkContainerClick(event) {
    const target = event.target;

    if (target.closest('.toggle-favorite-btn')) {
        console.log(
            '[handleExtLinkContainerClick] Click on favorite button detected, returning early.',
        );
        return;
    }

    const clickedCard = target.closest('.ext-link-item');
    if (!clickedCard) {
        return;
    }

    const isActionClick = target.closest(
        'button.edit-ext-link, button.delete-ext-link, a.ext-link-url',
    );
    if (isActionClick) {
        console.log(
            'Клик по кнопке действия или иконке ссылки внутри карточки внешнего ресурса, а не по самой карточке.',
        );
        return;
    }

    const linkElement = clickedCard.querySelector('a.ext-link-url');
    const url = linkElement?.href;

    if (url) {
        try {
            new URL(url);
            console.log(`Открытие URL по клику на карточку внешнего ресурса: ${url}`);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            console.error(
                `Некорректный URL у внешнего ресурса ${clickedCard.dataset.id}: ${url}`,
                e,
            );
            if (typeof showNotification === 'function') {
                showNotification('Некорректный URL у этого ресурса.', 'error');
            }
        }
    } else {
        console.warn(`URL не найден для карточки внешнего ресурса ${clickedCard.dataset.id}`);
        if (typeof showNotification === 'function') {
            showNotification('URL для этого ресурса не найден.', 'warning');
        }
    }
}

async function handleExtLinkAction(event) {
    const target = event.target;
    const linkItem = target.closest('.ext-link-item[data-id]');
    if (!linkItem) return;

    const linkId = parseInt(linkItem.dataset.id, 10);
    if (isNaN(linkId)) {
        console.error('Невалидный ID внешнего ресурса:', linkItem.dataset.id);
        return;
    }

    const actionButton = target.closest('button[data-action]');
    const action = actionButton
        ? actionButton.dataset.action
        : target.closest('[data-action="open-link"]')
        ? 'open-link'
        : null;

    if (!action) return;

    event.stopPropagation();

    switch (action) {
        case 'open-link':
            const urlToOpen = linkItem.dataset.url;
            if (urlToOpen) {
                window.open(urlToOpen, '_blank', 'noopener,noreferrer');
            } else {
                showNotification('Некорректный или отсутствующий URL.', 'warning');
            }
            break;
        case 'edit':
            showAddEditExtLinkModal(linkId);
            break;
        case 'delete':
            const title = linkItem.querySelector('h3')?.title || `ресурс ID ${linkId}`;
            if (confirm(`Вы уверены, что хотите удалить "${title}"?`)) {
                deleteExtLink(linkId);
            }
            break;
    }
}

function filterExtLinks() {
    const container = document.getElementById('extLinksContainer');
    const searchInput = document.getElementById('extLinkSearchInput');
    const categoryFilter = document.getElementById('extLinkCategoryFilter');

    if (!container || !searchInput || !categoryFilter) {
        console.error('filterExtLinks: один из элементов (контейнер, поиск или фильтр) не найден.');
        return;
    }

    const items = container.querySelectorAll('.ext-link-item');
    const searchValue = searchInput.value.trim().toLowerCase();
    const categoryValue = categoryFilter.value;

    items.forEach((item) => {
        const title = item.querySelector('h3')?.textContent?.toLowerCase() || '';
        const description =
            item.querySelector('p.ext-link-description')?.textContent?.toLowerCase() || '';
        const itemCategory = item.dataset.category || '';

        const matchesSearch =
            !searchValue || title.includes(searchValue) || description.includes(searchValue);
        const matchesCategory = !categoryValue || itemCategory === categoryValue;

        if (matchesSearch && matchesCategory) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}

function ensureExtLinkModal() {
    const modalId = 'extLinkModal';
    let modal = document.getElementById(modalId);

    if (!modal) {
        console.log(`Модальное окно #${modalId} не найдено, создаем новое.`);
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
        modal.innerHTML = `
                                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                                    <div class="p-6">
                                    <div class="flex justify-between items-center mb-4">
                                    <h2 class="text-xl font-bold" id="extLinkModalTitle">Заголовок окна</h2>
                                    <button class="close-modal bg-transparent p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors" title="Закрыть">
                                    <i class="fas fa-times text-xl"></i>
                                    </button>
                                    </div>
                                    <form id="extLinkForm" novalidate>
                                    <input type="hidden" id="extLinkId">
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkTitle">Название</label>
                                    <input type="text" id="extLinkTitle" name="extLinkTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    </div>
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkUrl">URL</label>
                                    <input type="url" id="extLinkUrl" name="extLinkUrl" required placeholder="https://example.com" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    </div>
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkDescription">Описание (опционально)</label>
                                    <textarea id="extLinkDescription" name="extLinkDescription" rows="3" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
                                    </div>
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkCategory">Категория</label>
                                    <select id="extLinkCategory" name="extLinkCategory" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    <option value="">Без категории</option>
                                    </select>
                                    </div>
                                    <div class="flex justify-end mt-6">
                                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition mr-2">Отмена</button>
                                    <button type="submit" id="saveExtLinkBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">Сохранить</button>
                                    </div>
                                    </form>
                                    </div>
                                    </div>`;
        document.body.appendChild(modal);
        const closeModal = () => {
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            if (getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        };
        modal
            .querySelectorAll('.close-modal, .cancel-modal')
            .forEach((btn) => btn.addEventListener('click', closeModal));

        const form = modal.querySelector('#extLinkForm');
        if (form) {
            if (typeof handleExtLinkFormSubmit === 'function') {
                if (!form.dataset.listenerAttached) {
                    form.addEventListener('submit', handleExtLinkFormSubmit);
                    form.dataset.listenerAttached = 'true';
                    console.log(
                        'Обработчик handleExtLinkFormSubmit прикреплен к форме #extLinkForm.',
                    );
                }
            } else {
                console.error(
                    'Ошибка: Глобальная функция handleExtLinkFormSubmit не найдена при создании модального окна!',
                );
            }
        } else {
            console.error('Форма #extLinkForm не найдена внутри созданного модального окна!');
        }
    }

    const elements = {
        modal: modal,
        form: modal.querySelector('#extLinkForm'),
        titleEl: modal.querySelector('#extLinkModalTitle'),
        idInput: modal.querySelector('#extLinkId'),
        titleInput: modal.querySelector('#extLinkTitle'),
        urlInput: modal.querySelector('#extLinkUrl'),
        descriptionInput: modal.querySelector('#extLinkDescription'),
        categoryInput: modal.querySelector('#extLinkCategory'),
        saveButton: modal.querySelector('#saveExtLinkBtn'),
    };

    for (const key in elements) {
        if (!elements[key]) {
            console.warn(
                `[ensureExtLinkModal] Элемент '${key}' не был найден в модальном окне #${modalId}!`,
            );
        }
    }

    if (elements.modal && typeof addEscapeHandler === 'function') {
        addEscapeHandler(elements.modal);
    } else if (elements.modal) {
        console.warn('[ensureExtLinkModal] addEscapeHandler function not found.');
    }

    const categorySelect = elements.categoryInput;
    if (categorySelect && !categorySelect.dataset.populated) {
        while (categorySelect.options.length > 1) {
            categorySelect.remove(1);
        }
        const fragment = document.createDocumentFragment();
        Object.entries(State.extLinkCategoryInfo).forEach(([key, info]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = info.name;
            fragment.appendChild(option);
        });
        categorySelect.appendChild(fragment);
        categorySelect.dataset.populated = 'true';
        console.log('Категории в модальном окне внешних ссылок обновлены.');
    }

    return elements;
}

function showAddExtLinkModal() {
    const { modal, form, titleEl, idInput } = ensureExtLinkModal();
    if (!form) {
        console.error('Не удалось получить форму из ensureExtLinkModal');
        return;
    }
    form.reset();
    idInput.value = '';
    titleEl.textContent = 'Добавить внешний ресурс';
    modal.classList.remove('hidden');
    form.elements.extLinkTitle?.focus();
}

async function showEditExtLinkModal(id) {
    const { modal, form, titleEl, idInput, titleInput, urlInput, descriptionInput, categoryInput } =
        ensureExtLinkModal();

    if (!form) {
        console.error('Не удалось получить форму из ensureExtLinkModal для редактирования');
        if (typeof showNotification === 'function') {
            showNotification('Ошибка интерфейса: не удалось открыть окно редактирования.', 'error');
        }
        return;
    }

    try {
        const link = await getFromIndexedDB('extLinks', id);
        if (!link) {
            if (typeof showNotification === 'function') {
                showNotification('Внешний ресурс не найден', 'error');
            }
            console.warn(`Внешний ресурс с ID ${id} не найден для редактирования.`);
            return;
        }

        form.reset();
        idInput.value = link.id;
        titleInput.value = link.title || '';
        urlInput.value = link.url || '';
        descriptionInput.value = link.description || '';
        categoryInput.value = link.category || '';
        titleEl.textContent = 'Редактировать ресурс';

        modal.classList.remove('hidden');
        titleInput.focus();
    } catch (error) {
        console.error('Ошибка при загрузке внешнего ресурса для редактирования:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при загрузке ресурса для редактирования', 'error');
        }
        if (modal) {
            modal.classList.add('hidden');
        }
    }
}

async function deleteExtLink(id) {
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
        console.error('Попытка удаления внешнего ресурса с невалидным ID:', id);
        showNotification('Ошибка: Неверный ID для удаления.', 'error');
        return;
    }

    try {
        const linkToDelete = await getFromIndexedDB('extLinks', numericId);
        if (!linkToDelete) {
            console.warn(`Внешний ресурс с ID ${numericId} не найден для удаления из индекса.`);
        }

        if (linkToDelete && typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex('extLinks', numericId, linkToDelete, 'delete');
                console.log(`Search index updated (delete) for external link ID: ${numericId}`);
            } catch (indexError) {
                console.error(
                    `Error updating search index for external link deletion ${numericId}:`,
                    indexError,
                );
            }
        } else if (!linkToDelete) {
        } else {
            console.warn('updateSearchIndex function is not available for external link deletion.');
        }

        await deleteFromIndexedDB('extLinks', numericId);
        const links = await getAllExtLinks();
        renderExtLinks(links, State.extLinkCategoryInfo);
        showNotification('Внешний ресурс удален');
    } catch (error) {
        console.error('Ошибка при удалении внешнего ресурса:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

function initUICustomization() {
    injectCustomizationStyles();

    const getElem = (id) => document.getElementById(id);

    const customizeUIBtn = getElem('customizeUIBtn');
    const customizeUIModal = getElem('customizeUIModal');
    if (!customizeUIBtn || !customizeUIModal) {
        console.warn(
            'initUICustomization: Кнопка или модальное окно настроек не найдены. Инициализация прервана.',
        );
        return;
    }
    if (!customizeUIModal.dataset.themeRealtimeAttached) {
        customizeUIModal.addEventListener('change', (e) => {
            const target = e.target;
            if (target && target.matches('input[name="themeMode"]')) {
                if (typeof setTheme === 'function') setTheme(target.value);
                if (typeof State.currentPreviewSettings === 'object' && State.currentPreviewSettings) {
                    State.currentPreviewSettings.themeMode = target.value;
                }
            }
        });
        customizeUIModal.dataset.themeRealtimeAttached = 'true';
    }
    const closeCustomizeUIModalBtn = getElem('closeCustomizeUIModalBtn');
    const saveUISettingsBtn = getElem('saveUISettingsBtn');
    const cancelUISettingsBtn = getElem('cancelUISettingsBtn');
    const resetUiBtn = getElem('resetUiBtn');

    const colorTargetSelector = getElem('colorTargetSelector');

    const colorPickerState = { h: 0, s: 80, b: 88 };
    const colorPreview = getElem('color-preview-swatch');
    const saturationSliderGradient = getElem('saturation-slider-gradient');
    const brightnessSliderGradient = getElem('brightness-slider-gradient');
    const hueSlider = getElem('hue-slider');
    const hueHandle = getElem('hue-handle');
    const saturationSlider = getElem('saturation-slider');
    const saturationHandle = getElem('saturation-handle');
    const brightnessSlider = getElem('brightness-slider');
    const brightnessHandle = getElem('brightness-handle');
    const hueValueInput = getElem('hue-value');
    const saturationValueInput = getElem('saturation-value');
    const brightnessValueInput = getElem('brightness-value');

    const decreaseFontBtn = getElem('decreaseFontBtn');
    const increaseFontBtn = getElem('increaseFontBtn');
    const resetFontBtn = getElem('resetFontBtn');
    const fontSizeLabel = getElem('fontSizeLabel');
    const borderRadiusSlider = getElem('borderRadiusSlider');
    const densitySlider = getElem('densitySlider');

    const genericChangeHandler = async (updateFn) => {
        if (typeof State.currentPreviewSettings !== 'object' || State.currentPreviewSettings === null) {
            State.currentPreviewSettings = JSON.parse(
                JSON.stringify(State.originalUISettings || DEFAULT_UI_SETTINGS),
            );
        }
        updateFn();
        if (typeof applyPreviewSettings === 'function') {
            await applyPreviewSettings(State.currentPreviewSettings);
        }
        State.isUISettingsDirty = !deepEqual(State.originalUISettings, getSettingsFromModal());
    };

    const setColorPickerStateFromHex = (hex) => {
        const rgb = hexToRgb(hex);
        if (rgb) {
            const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);
            Object.assign(colorPickerState, hsb);
            _updatePickerVisualsWithoutTriggeringChange();
        }
    };

    const _updatePickerVisualsWithoutTriggeringChange = () => {
        if (
            !saturationSliderGradient ||
            !brightnessSliderGradient ||
            !hueHandle ||
            !saturationHandle ||
            !brightnessHandle ||
            !colorPreview ||
            !hueValueInput ||
            !saturationValueInput ||
            !brightnessValueInput
        ) {
            return;
        }
        const { h, s, b } = colorPickerState;

        const pureHueRgb = hsbToRgb(h, 100, 100);
        const pureHueHex = rgbToHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b);
        saturationSliderGradient.style.background = `linear-gradient(to right, rgb(128,128,128), ${pureHueHex})`;
        brightnessSliderGradient.style.background = `linear-gradient(to right, #000, ${pureHueHex})`;

        const huePercentFraction = h / 360;
        hueHandle.style.left = `calc(${huePercentFraction * 99}% - ${huePercentFraction}rem)`;

        const saturationPercentFraction = s / 100;
        saturationHandle.style.left = `calc(${
            saturationPercentFraction * 99
        }% - ${saturationPercentFraction}rem)`;

        const brightnessPercentFraction = b / 100;
        brightnessHandle.style.left = `calc(${
            brightnessPercentFraction * 99
        }% - ${brightnessPercentFraction}rem)`;

        const currentRgb = hsbToRgb(h, s, b);
        const currentHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);
        colorPreview.style.backgroundColor = currentHex;

        hueValueInput.value = `${Math.round(h)}°`;
        saturationValueInput.value = `${Math.round(s)}%`;
        brightnessValueInput.value = `${Math.round(b)}%`;
    };

    const updatePickerUI = () => {
        _updatePickerVisualsWithoutTriggeringChange();
        const currentRgb = hsbToRgb(colorPickerState.h, colorPickerState.s, colorPickerState.b);
        const currentHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);

        genericChangeHandler(() => {
            if (!State.currentPreviewSettings) return;
            if (State.uiModalState.currentColorTarget === 'elements') {
                State.currentPreviewSettings.primaryColor = currentHex;
            } else if (State.uiModalState.currentColorTarget === 'background') {
                State.currentPreviewSettings.backgroundColor = currentHex;
                State.currentPreviewSettings.isBackgroundCustom = true;
            } else if (State.uiModalState.currentColorTarget === 'text') {
                State.currentPreviewSettings.customTextColor = currentHex;
                State.currentPreviewSettings.isTextCustom = true;
            }
        });
    };

    const setupDraggable = (element, onDrag) => {
        const handler = (e_down) => {
            if (!element) return;
            e_down.preventDefault();
            const rect = element.getBoundingClientRect();
            const moveHandler = (e_move) => {
                const moveEvent = e_move.touches ? e_move.touches[0] : e_move;
                onDrag(moveEvent, rect);
            };
            const upHandler = () => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
                document.removeEventListener('touchmove', moveHandler);
                document.removeEventListener('touchend', upHandler);
            };
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
            document.addEventListener('touchmove', moveHandler, { passive: false });
            document.addEventListener('touchend', upHandler);
            const downEvent = e_down.touches ? e_down.touches[0] : e_down;
            onDrag(downEvent, rect);
        };
        element.addEventListener('mousedown', handler);
        element.addEventListener('touchstart', handler, { passive: false });
    };

    if (hueSlider)
        setupDraggable(hueSlider, (e, rect) => {
            let percent = ((e.clientX - rect.left) / rect.width) * 100;
            colorPickerState.h = Math.max(0, Math.min(359.9, percent * 3.6));
            updatePickerUI();
        });
    if (saturationSlider)
        setupDraggable(saturationSlider, (e, rect) => {
            let percent = ((e.clientX - rect.left) / rect.width) * 100;
            colorPickerState.s = Math.max(0, Math.min(100, percent));
            updatePickerUI();
        });
    if (brightnessSlider)
        setupDraggable(brightnessSlider, (e, rect) => {
            let percent = ((e.clientX - rect.left) / rect.width) * 100;
            colorPickerState.b = Math.max(0, Math.min(100, percent));
            updatePickerUI();
        });

    if (colorTargetSelector) {
        colorTargetSelector.addEventListener('change', (event) => {
            const target = event.target.value;
            if (['elements', 'background', 'text'].includes(target)) {
                State.uiModalState.currentColorTarget = target;
                let colorToSet;

                if (target === 'elements') {
                    colorToSet = State.currentPreviewSettings.primaryColor;
                } else if (target === 'background') {
                    if (State.currentPreviewSettings.isBackgroundCustom) {
                        colorToSet = State.currentPreviewSettings.backgroundColor;
                    } else {
                        const computedBg = getComputedStyle(document.body).backgroundColor;
                        const match = /rgb\((\d+), (\d+), (\d+)\)/.exec(computedBg);
                        if (match) {
                            colorToSet = rgbToHex(
                                parseInt(match[1]),
                                parseInt(match[2]),
                                parseInt(match[3]),
                            );
                        } else {
                            colorToSet = document.documentElement.classList.contains('dark')
                                ? '#111827'
                                : '#F9FAFB';
                        }
                    }
                } else if (target === 'text') {
                    if (State.currentPreviewSettings.isTextCustom) {
                        colorToSet = State.currentPreviewSettings.customTextColor;
                    } else {
                        const computedText = getComputedStyle(document.body).color;
                        const match = /rgb\((\d+), (\d+), (\d+)\)/.exec(computedText);
                        if (match) {
                            colorToSet = rgbToHex(
                                parseInt(match[1]),
                                parseInt(match[2]),
                                parseInt(match[3]),
                            );
                        } else {
                            colorToSet = document.documentElement.classList.contains('dark')
                                ? '#f9fafb'
                                : '#111827';
                        }
                    }
                }
                setColorPickerStateFromHex(colorToSet);
            }
        });
    }

    const openModal = async () => {
        await loadUISettings();
        State.uiModalState.currentColorTarget = 'elements';
        const elementsRadio = colorTargetSelector.querySelector('input[value="elements"]');
        if (elementsRadio) elementsRadio.checked = true;
        const initialColor =
            State.currentPreviewSettings.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
        setColorPickerStateFromHex(initialColor);
        populateModalControls(State.currentPreviewSettings);
        customizeUIModal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        requestAnimationFrame(() => _updatePickerVisualsWithoutTriggeringChange());
        State.isUISettingsDirty = false;
    };

    customizeUIBtn.addEventListener('click', openModal);

    const handleCloseRequest = async () => {
        try {
            if (
                State.isUISettingsDirty &&
                State.originalUISettings &&
                typeof applyPreviewSettings === 'function'
            ) {
                State.currentPreviewSettings = JSON.parse(JSON.stringify(State.originalUISettings));
                await applyPreviewSettings(State.currentPreviewSettings);
            }
        } finally {
            if (typeof requestCloseModal === 'function') {
                requestCloseModal(customizeUIModal);
            } else {
                customizeUIModal.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
            }
            State.isUISettingsDirty = false;
        }
    };

    if (closeCustomizeUIModalBtn)
        closeCustomizeUIModalBtn.addEventListener('click', handleCloseRequest);
    if (cancelUISettingsBtn) cancelUISettingsBtn.addEventListener('click', handleCloseRequest);
    if (saveUISettingsBtn)
        saveUISettingsBtn.addEventListener('click', async () => {
            updatePreviewSettingsFromModal();
            if (await saveUISettings()) {
                customizeUIModal.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
                State.isUISettingsDirty = false;
            }
        });

    if (resetUiBtn) {
        resetUiBtn.addEventListener('click', () => {
            if (confirm('Сбросить настройки к значениям по умолчанию?')) {
                resetUISettingsInModal();
            }
        });
    }

    const FONT_SIZE_STEP = 5,
        MIN_FONT_SIZE = 50,
        MAX_FONT_SIZE = 150;
    const updateFontSizeUIAndSettings = (newSize) => {
        const clampedSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, newSize));
        if (fontSizeLabel) fontSizeLabel.textContent = clampedSize + '%';
        if (State.currentPreviewSettings) State.currentPreviewSettings.fontSize = clampedSize;
    };
    if (decreaseFontBtn)
        decreaseFontBtn.addEventListener('click', () =>
            genericChangeHandler(() =>
                updateFontSizeUIAndSettings(parseInt(fontSizeLabel.textContent) - FONT_SIZE_STEP),
            ),
        );
    if (increaseFontBtn)
        increaseFontBtn.addEventListener('click', () =>
            genericChangeHandler(() =>
                updateFontSizeUIAndSettings(parseInt(fontSizeLabel.textContent) + FONT_SIZE_STEP),
            ),
        );
    if (resetFontBtn)
        resetFontBtn.addEventListener('click', () =>
            genericChangeHandler(() => updateFontSizeUIAndSettings(100)),
        );
    if (borderRadiusSlider)
        borderRadiusSlider.addEventListener('input', () =>
            genericChangeHandler(
                () => (State.currentPreviewSettings.borderRadius = parseInt(borderRadiusSlider.value)),
            ),
        );
    if (densitySlider)
        densitySlider.addEventListener('input', () =>
            genericChangeHandler(
                () => (State.currentPreviewSettings.contentDensity = parseInt(densitySlider.value)),
            ),
        );

    document
        .querySelectorAll('input[name="themeMode"], input[name="mainLayout"]')
        .forEach((radio) => {
            radio.addEventListener('change', () => {
                if (radio.name === 'themeMode' && typeof setTheme === 'function') {
                    setTheme(radio.value);
                }
                genericChangeHandler(() => {
                    if (radio.name === 'themeMode') State.currentPreviewSettings.themeMode = radio.value;
                    if (radio.name === 'mainLayout')
                        State.currentPreviewSettings.mainLayout = radio.value;
                });
            });
        });

    const panelSortContainer = getElem('panelSortContainer');
    if (panelSortContainer && typeof Sortable !== 'undefined') {
        new Sortable(panelSortContainer, {
            animation: 150,
            handle: '.fa-grip-lines',
            ghostClass: 'my-sortable-ghost',
            onEnd: () => genericChangeHandler(updatePreviewSettingsFromModal),
        });
    }
    if (typeof setupExtensionFieldListeners === 'function') {
        setupExtensionFieldListeners();
    }
    if (typeof setupBackgroundImageControls === 'function') {
        setupBackgroundImageControls();
    } else {
        console.error('Функция setupBackgroundImageControls не найдена!');
    }
}

// Wrapper для модуля color.js
function hexToRgb(hex) {
    return hexToRgbModule(hex);
}

// Wrapper для модуля color.js
function rgbToHex(r, g, b) {
    return rgbToHexModule(r, g, b);
}

// Wrapper для модуля color.js
function rgbToHsb(r, g, b) {
    return rgbToHsbModule(r, g, b);
}

// Wrapper для модуля color.js
function hsbToRgb(h, s, b) {
    return hsbToRgbModule(h, s, b);
}

function injectCustomizationStyles() {
    const styleId = 'ui-customization-fixes';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* Отключаем интерактивность для полей со значениями процентов цвета */
        #hue-value, #saturation-value, #brightness-value {
            pointer-events: none;
            cursor: default;
            user-select: none;
        }
    `;
    document.head.appendChild(style);
    console.log('Стили для исправления UI настроек успешно добавлены.');
}

function populateModalControls(settings) {
    const modal = document.getElementById('customizeUIModal');
    if (!modal) return;

    if (typeof settings !== 'object' || settings === null) {
        settings = { ...DEFAULT_UI_SETTINGS, themeMode: State.userPreferences.theme };
    }

    const layoutRadio = modal.querySelector(
        `input[name="mainLayout"][value="${settings.mainLayout || 'horizontal'}"]`,
    );
    if (layoutRadio) layoutRadio.checked = true;

    const themeRadio = modal.querySelector(
        `input[name="themeMode"][value="${settings.theme || settings.themeMode || 'auto'}"]`,
    );
    if (themeRadio) themeRadio.checked = true;

    const showBlacklistWarningToggle = modal.querySelector('#toggleBlacklistWarning');
    if (showBlacklistWarningToggle) {
        showBlacklistWarningToggle.checked = settings.showBlacklistUsageWarning ?? false;
    }

    const disableForcedBackupToggle = modal.querySelector('#disableForcedBackupOnImportToggle');
    if (disableForcedBackupToggle) {
        disableForcedBackupToggle.checked = settings.disableForcedBackupOnImport ?? false;
    }

    const fontSizeLabel = modal.querySelector('#fontSizeLabel');
    if (fontSizeLabel) fontSizeLabel.textContent = (settings.fontSize ?? 100) + '%';

    const borderRadiusSlider = modal.querySelector('#borderRadiusSlider');
    if (borderRadiusSlider) borderRadiusSlider.value = settings.borderRadius ?? 8;

    const densitySlider = modal.querySelector('#densitySlider');
    if (densitySlider) densitySlider.value = settings.contentDensity ?? 3;

    const panelSortContainer = document.getElementById('panelSortContainer');
    if (panelSortContainer) {
        panelSortContainer.innerHTML = '';
        const idToConfigMap = tabsConfig.reduce((map, tab) => ((map[tab.id] = tab), map), {});

        const order = settings.panelOrder || defaultPanelOrder;
        const visibility = settings.panelVisibility || defaultPanelVisibility;

        order.forEach((panelId, index) => {
            const config = idToConfigMap[panelId];
            if (config) {
                const isVisible = visibility[index] ?? true;
                const panelItem = createPanelItemElement(config.id, config.name, isVisible);
                panelSortContainer.appendChild(panelItem);
            }
        });

        panelSortContainer.querySelectorAll('.toggle-visibility').forEach((button) => {
            button.addEventListener('click', handleModalVisibilityToggle);
        });
    }
}

if (typeof applyUISettings === 'undefined') {
    window.applyUISettings = async () => {
        console.warn('applyUISettings (ЗАГЛУШКА) вызвана. Реальная функция не найдена.');

        if (typeof DEFAULT_UI_SETTINGS === 'object' && typeof applyPreviewSettings === 'function') {
            try {
                await applyPreviewSettings(DEFAULT_UI_SETTINGS);
                console.log('applyUISettings (ЗАГЛУШКА): Применены настройки UI по умолчанию.');
            } catch (e) {
                console.error(
                    'applyUISettings (ЗАГЛУШКА): Ошибка применения настроек по умолчанию.',
                    e,
                );
            }
        }
        return Promise.resolve();
    };
}

async function applyUISettings() {
    console.log(
        'applyUISettings: Применение глобальных UI настроек (обычно при старте приложения)...',
    );

    let settingsToApply = { ...DEFAULT_UI_SETTINGS };
    const currentPanelIds = tabsConfig.map((t) => t.id);
    const knownPanelIds = new Set(currentPanelIds);

    const actualDefaultPanelOrder =
        typeof defaultPanelOrder !== 'undefined' &&
        Array.isArray(defaultPanelOrder) &&
        defaultPanelOrder.length > 0
            ? defaultPanelOrder
            : currentPanelIds;

    const actualDefaultPanelVisibility =
        typeof defaultPanelVisibility !== 'undefined' &&
        Array.isArray(defaultPanelVisibility) &&
        defaultPanelVisibility.length === actualDefaultPanelOrder.length
            ? defaultPanelVisibility
            : currentPanelIds.map((id) => !(id === 'sedoTypes' || id === 'blacklistedClients'));

    if (
        !DEFAULT_UI_SETTINGS.panelOrder ||
        DEFAULT_UI_SETTINGS.panelOrder.length !== actualDefaultPanelOrder.length
    ) {
        DEFAULT_UI_SETTINGS.panelOrder = [...actualDefaultPanelOrder];
    }
    if (
        !DEFAULT_UI_SETTINGS.panelVisibility ||
        DEFAULT_UI_SETTINGS.panelVisibility.length !== actualDefaultPanelVisibility.length
    ) {
        DEFAULT_UI_SETTINGS.panelVisibility = [...actualDefaultPanelVisibility];
    }
    settingsToApply.panelOrder = [...actualDefaultPanelOrder];
    settingsToApply.panelVisibility = [...actualDefaultPanelVisibility];

    if (!State.db) {
        console.warn(
            'applyUISettings: База данных недоступна. Применяются настройки по умолчанию.',
        );
    } else {
        try {
            const loadedSettings = await getFromIndexedDB('preferences', 'uiSettings');
            if (loadedSettings && typeof loadedSettings === 'object') {
                console.log(
                    'applyUISettings: Настройки UI загружены из БД. Слияние и корректировка...',
                );
                settingsToApply = { ...DEFAULT_UI_SETTINGS, ...loadedSettings, id: 'uiSettings' };
                let savedOrder = settingsToApply.panelOrder || [];
                let savedVisibility = settingsToApply.panelVisibility || [];
                if (!Array.isArray(savedOrder) || savedOrder.length === 0)
                    savedOrder = [...actualDefaultPanelOrder];
                if (
                    !Array.isArray(savedVisibility) ||
                    savedVisibility.length !== savedOrder.length
                ) {
                    savedVisibility = savedOrder.map((id) => {
                        const defaultIndex = actualDefaultPanelOrder.indexOf(id);
                        return defaultIndex !== -1
                            ? actualDefaultPanelVisibility[defaultIndex]
                            : id !== 'sedoTypes';
                    });
                }
                let effectiveOrder = [];
                let effectiveVisibility = [];
                const processedIds = new Set();
                savedOrder.forEach((panelId, index) => {
                    if (knownPanelIds.has(panelId)) {
                        effectiveOrder.push(panelId);
                        effectiveVisibility.push(
                            typeof savedVisibility[index] === 'boolean'
                                ? savedVisibility[index]
                                : panelId !== 'sedoTypes',
                        );
                        processedIds.add(panelId);
                    } else {
                        console.warn(
                            `applyUISettings (DB Load): Сохраненный ID панели "${panelId}" больше не существует. Игнорируется.`,
                        );
                    }
                });
                currentPanelIds.forEach((panelId) => {
                    if (!processedIds.has(panelId)) {
                        console.log(
                            `applyUISettings (DB Load): Добавление новой панели "${panelId}" в порядок/видимость.`,
                        );
                        effectiveOrder.push(panelId);
                        effectiveVisibility.push(panelId !== 'sedoTypes');
                    }
                });
                settingsToApply.panelOrder = effectiveOrder;
                settingsToApply.panelVisibility = effectiveVisibility;
                console.log('applyUISettings: Слияние и корректировка настроек из БД завершены.');
            } else {
                console.log(
                    'applyUISettings: Нет сохраненных настроек UI в БД или формат неверный. Используются настройки по умолчанию (с актуальным порядком/видимостью).',
                );
            }
        } catch (error) {
            console.error(
                'applyUISettings: Ошибка при загрузке настроек UI из БД, используются настройки по умолчанию:',
                error,
            );
        }
    }

    if (typeof State.originalUISettings !== 'object' || Object.keys(State.originalUISettings).length === 0) {
        State.originalUISettings = JSON.parse(JSON.stringify(settingsToApply));
        console.log('applyUISettings: State.originalUISettings инициализированы.');
    }
    State.currentPreviewSettings = JSON.parse(JSON.stringify(settingsToApply));
    console.log('applyUISettings: State.currentPreviewSettings синхронизированы.');

    try {
        if (typeof applyPreviewSettings !== 'function') {
            console.error(
                'applyUISettings: Функция applyPreviewSettings не найдена! Невозможно применить настройки.',
            );
            throw new Error('Функция applyPreviewSettings не определена.');
        }
        await applyPreviewSettings(settingsToApply);
        console.log(
            'applyUISettings: Глобальные настройки UI применены:',
            JSON.parse(JSON.stringify(settingsToApply)),
        );
        return Promise.resolve(true);
    } catch (applyError) {
        console.error(
            'applyUISettings: КРИТИЧЕСКАЯ ОШИБКА при вызове applyPreviewSettings:',
            applyError,
        );
        if (typeof applyPreviewSettings === 'function' && typeof DEFAULT_UI_SETTINGS === 'object') {
            try {
                await applyPreviewSettings(DEFAULT_UI_SETTINGS);
                console.warn(
                    'applyUISettings: Применены АБСОЛЮТНЫЕ ДЕФОЛТЫ из-за ошибки применения загруженных/скорректированных настроек.',
                );
            } catch (emergencyError) {
                console.error(
                    'applyUISettings: КРИТИЧЕСКАЯ ОШИБКА даже при применении АБСОЛЮТНЫХ ДЕФОЛТОВ:',
                    emergencyError,
                );
            }
        }
        if (typeof showNotification === 'function') {
            showNotification(
                'Критическая ошибка применения настроек интерфейса. Сброшено к базовым.',
                'error',
            );
        }
        return Promise.reject(applyError);
    }
}

// Wrapper для модуля color.js
function calculateSecondaryColor(hex, percent = 15) {
    return calculateSecondaryColorModule(hex, percent);
}

if (typeof loadUISettings === 'undefined') {
    window.loadUISettings = () => console.log('loadUISettings called');
}
if (typeof saveUISettings === 'undefined') {
    window.saveUISettings = () => console.log('saveUISettings called');
}
if (typeof applyUISettings === 'undefined') {
    window.applyUISettings = () => console.log('applyUISettings called');
}
if (typeof resetUISettings === 'undefined') {
    window.resetUISettings = () => console.log('resetUISettings called');
}
if (typeof showNotification === 'undefined') {
    window.showNotification = (msg) => console.log('Notification:', msg);
}

async function resetUISettingsInModal() {
    console.log('Resetting UI settings in modal preview...');

    State.currentPreviewSettings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
    State.currentPreviewSettings.id = 'uiSettings';
    State.currentPreviewSettings.isBackgroundCustom = false;
    delete State.currentPreviewSettings.backgroundColor;
    State.currentPreviewSettings.isTextCustom = false;
    delete State.currentPreviewSettings.customTextColor;

    document.body.classList.remove('custom-background-active');

    try {
        await deleteFromIndexedDB('preferences', 'customBackgroundImage');
        removeCustomBackgroundImage();
    } catch (err) {
        console.error('Не удалось удалить фон при сбросе настроек:', err);
    }

    State.isUISettingsDirty = true;

    try {
        populateModalControls(State.currentPreviewSettings);

        State.uiModalState.currentColorTarget = 'elements';

        const colorTargetSelector = document.getElementById('colorTargetSelector');
        const elementsRadio = colorTargetSelector?.querySelector('input[value="elements"]');
        if (elementsRadio) elementsRadio.checked = true;

        if (typeof setColorPickerStateFromHex === 'function') {
            setColorPickerStateFromHex(State.currentPreviewSettings.primaryColor);
        }

        await applyPreviewSettings(State.currentPreviewSettings);
        console.log('UI settings reset preview applied.');
        showNotification(
            "Настройки сброшены для предпросмотра. Нажмите 'Сохранить', чтобы применить.",
            'info',
        );
        return true;
    } catch (error) {
        console.error('Error resetting UI settings preview:', error);
        showNotification('Ошибка при сбросе настроек для предпросмотра', 'error');
        State.currentPreviewSettings = JSON.parse(JSON.stringify(State.originalUISettings));
        State.isUISettingsDirty = false;
        populateModalControls(State.currentPreviewSettings);
        await applyPreviewSettings(State.currentPreviewSettings);
        return false;
    }
}

async function applyInitialUISettings() {
    console.log('applyInitialUISettings V2: Применение начальных UI настроек (единая логика)...');

    if (typeof State.userPreferences !== 'object' || Object.keys(State.userPreferences).length === 0) {
        console.error(
            'applyInitialUISettings: State.userPreferences не инициализирован! Это не должно происходить.',
        );
        await loadUserPreferences();
    }

    State.originalUISettings = JSON.parse(JSON.stringify(State.userPreferences));
    State.currentPreviewSettings = JSON.parse(JSON.stringify(State.userPreferences));
    console.log(
        'applyInitialUISettings: originalUISettings и State.currentPreviewSettings инициализированы.',
    );

    try {
        if (typeof applyPreviewSettings !== 'function') {
            throw new Error('Функция applyPreviewSettings не определена.');
        }
        await applyPreviewSettings(State.userPreferences);
        try {
            const order =
                Array.isArray(State.userPreferences?.panelOrder) && State.userPreferences.panelOrder.length
                    ? [...State.userPreferences.panelOrder]
                    : Array.isArray(defaultPanelOrder) && defaultPanelOrder.length
                    ? [...defaultPanelOrder]
                    : Array.isArray(tabsConfig)
                    ? tabsConfig.map((t) => t.id)
                    : [];
            const visArr =
                Array.isArray(State.userPreferences?.panelVisibility) &&
                State.userPreferences.panelVisibility.length === order.length
                    ? [...State.userPreferences.panelVisibility]
                    : order.map((id) => id !== 'sedoTypes');
            if (typeof applyPanelOrderAndVisibility === 'function') {
                applyPanelOrderAndVisibility(order, visArr);
            } else {
                console.warn('applyPanelOrderAndVisibility not found; tabs order restore skipped.');
            }
            const visMap = order.reduce((m, id, i) => ((m[id] = !!visArr[i]), m), {});
            ensureTabPresent('telefony', visMap.telefony !== false);
            ensureTabPresent('shablony', visMap.shablony !== false);
            if (typeof setupTabsOverflow === 'function') setupTabsOverflow();
            if (typeof updateVisibleTabs === 'function') updateVisibleTabs();
        } catch (e) {
            console.warn(
                'applyInitialUISettings: не удалось досоздать вкладки Телефоны/Шаблоны:',
                e,
            );
        }
        console.log('applyInitialUISettings: Начальные UI настройки успешно применены.');
    } catch (applyError) {
        console.error(
            'applyInitialUISettings: КРИТИЧЕСКАЯ ОШИБКА при применении настроек:',
            applyError,
        );
        try {
            await applyPreviewSettings(DEFAULT_UI_SETTINGS);
        } catch (emergencyError) {
            console.error(
                'applyInitialUISettings: КРИТИЧЕСКАЯ ОШИБКА даже при применении АБСОЛЮТНЫХ ДЕФОЛТОВ:',
                emergencyError,
            );
        }
        if (typeof showNotification === 'function') {
            showNotification('Критическая ошибка применения настроек интерфейса.', 'error');
        }
    }
}

function initClearDataFunctionality() {
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    const confirmClearDataModal = document.getElementById('confirmClearDataModal');
    const cancelClearDataBtn = document.getElementById('cancelClearDataBtn');
    const confirmAndClearDataBtn = document.getElementById('confirmAndClearDataBtn');
    const closeConfirmClearModalBtns = confirmClearDataModal?.querySelectorAll(
        '.close-confirm-clear-modal',
    );
    const exportBeforeClearBtn = document.getElementById('exportBeforeClearBtn');

    if (
        !clearAllDataBtn ||
        !confirmClearDataModal ||
        !cancelClearDataBtn ||
        !confirmAndClearDataBtn
    ) {
        console.warn(
            'Clear Data Functionality: One or more required elements not found. Feature disabled.',
        );
        return;
    }

    clearAllDataBtn.addEventListener('click', () => {
        confirmClearDataModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (typeof addEscapeHandler === 'function') {
            addEscapeHandler(confirmClearDataModal);
        } else {
            console.warn(
                '[initClearDataFunctionality] addEscapeHandler function not found for confirmClearDataModal.',
            );
        }
    });

    const closeConfirmModal = () => {
        confirmClearDataModal.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') {
            removeEscapeHandler(confirmClearDataModal);
        }
        if (
            typeof getVisibleModals === 'function' &&
            getVisibleModals().filter((modal) => modal.id !== confirmClearDataModal.id).length === 0
        ) {
            document.body.classList.remove('modal-open');
        } else if (typeof getVisibleModals !== 'function') {
            document.body.classList.remove('modal-open');
        }
    };

    cancelClearDataBtn.addEventListener('click', closeConfirmModal);
    closeConfirmClearModalBtns?.forEach((btn) => {
        btn.addEventListener('click', closeConfirmModal);
    });

    confirmAndClearDataBtn.addEventListener('click', async () => {
        console.log('Attempting to clear all application data...');
        closeConfirmModal();

        try {
            localStorage.setItem('copilotIsReloadingAfterClear', 'true');
            console.log("Flag 'copilotIsReloadingAfterClear' set in localStorage.");
        } catch (e) {
            console.error("Failed to set 'copilotIsReloadingAfterClear' flag in localStorage:", e);
            if (typeof NotificationService !== 'undefined' && NotificationService.add) {
                NotificationService.add(
                    'Ошибка установки флага перезагрузки. Очистка может пройти некорректно.',
                    'error',
                    { important: true },
                );
            }
        }

        try {
            console.log('Data clearing starting...');
            await clearAllApplicationData((percentage, message) => {
                console.log(`[ClearData Progress (no overlay visible): ${percentage}%] ${message}`);
            });

            console.log('Data clearing process finished successfully in handler.');
            console.log('Data cleared. Reloading page now...');
            window.location.reload();
        } catch (error) {
            console.error('Error during clearAllApplicationData or subsequent logic:', error);
            const errorMsg = error ? error.message || 'Неизвестная ошибка' : 'Произошла ошибка.';

            if (loadingOverlayManager.overlayElement) {
                loadingOverlayManager.updateProgress(
                    100,
                    `Ошибка: ${errorMsg.substring(0, 50)}...`,
                );
            }

            if (typeof NotificationService !== 'undefined' && NotificationService.add) {
                NotificationService.add(
                    `Ошибка при очистке данных: ${errorMsg}. Пожалуйста, проверьте консоль и попробуйте снова.`,
                    'error',
                    { important: true, duration: 15000 },
                );
            } else if (typeof showNotification === 'function') {
                showNotification(
                    `Ошибка при очистке данных: ${errorMsg}. Пожалуйста, проверьте консоль и попробуйте снова.`,
                    'error',
                    15000,
                );
            }
        }
    });

    exportBeforeClearBtn?.addEventListener('click', () => {
        if (typeof exportAllData === 'function') {
            exportAllData();
        } else {
            if (typeof showNotification === 'function') {
                showNotification('Функция экспорта не найдена!', 'error');
            }
        }
    });
    console.log(
        'Функционал очистки данных инициализирован с исправленной логикой флага и оверлея.',
    );
}

async function clearAllApplicationData(progressCallback) {
    console.log('Starting data clearing process with progress callback...');
    let currentProgress = 0;

    const updateAndReportProgress = (increment, message) => {
        currentProgress += increment;
        currentProgress = Math.min(currentProgress, 95);
        if (progressCallback) {
            progressCallback(currentProgress, message);
        }
        console.log(`[ClearData Progress: ${currentProgress}%] ${message}`);
    };

    updateAndReportProgress(0, 'Начало очистки...');

    try {
        updateAndReportProgress(5, 'Очистка локального хранилища...');
        const localStorageKeys = [
            'clientData',
            'employeeExtension',
            'viewPreferences',
            TIMER_STATE_KEY,
            'uiSettingsModalOrder',
            'lastActiveTabCopilot1CO',
            BLACKLIST_WARNING_ACCEPTED_KEY,
            USER_PREFERENCES_KEY,
            CATEGORY_INFO_KEY,
            SEDO_CONFIG_KEY,
            'copilotIsReloadingAfterClear',
        ];
        localStorageKeys.forEach((key) => {
            if (localStorage.getItem(key) !== null) {
                localStorage.removeItem(key);
                console.log(`Removed key from LocalStorage: ${key}`);
            } else {
                console.log(`Key not found in LocalStorage, skipping removal: ${key}`);
            }
        });

        const appPrefix = 'Copilot1CO_';
        const keysToRemoveWithPrefix = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(appPrefix)) {
                keysToRemoveWithPrefix.push(key);
            }
        }
        keysToRemoveWithPrefix.forEach((key) => {
            localStorage.removeItem(key);
            console.log(`Removed prefixed key from LocalStorage: ${key}`);
        });
        console.log('LocalStorage очищен.');
    } catch (error) {
        console.error('Error clearing LocalStorage:', error);
        if (progressCallback)
            progressCallback(currentProgress, 'Ошибка очистки локального хранилища!');
        throw error;
    }

    try {
        updateAndReportProgress(5, 'Подготовка базы данных к удалению...');
        if (State.db) {
            State.db.close();
            State.db = null;
            console.log('IndexedDB connection closed.');
        } else {
            console.log('IndexedDB connection was not open.');
        }
    } catch (error) {
        console.error('Error closing IndexedDB connection:', error);
        if (progressCallback) progressCallback(currentProgress, 'Ошибка закрытия базы данных!');
        throw error;
    }

    try {
        updateAndReportProgress(5, 'Удаление базы данных...');
        await new Promise((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            deleteRequest.onsuccess = () => {
                console.log(`IndexedDB database "${DB_NAME}" deleted successfully.`);
                updateAndReportProgress(80, 'База данных успешно удалена.');
                resolve();
            };
            deleteRequest.onerror = (event) => {
                console.error(`Error deleting database "${DB_NAME}":`, event.target.error);
                if (progressCallback)
                    progressCallback(currentProgress, 'Ошибка удаления базы данных!');
                reject(event.target.error || new Error('Unknown DB deletion error'));
            };
            deleteRequest.onblocked = (event) => {
                const errorMsg = `Удаление БД "${DB_NAME}" заблокировано. Закройте другие вкладки с приложением.`;
                console.warn(errorMsg, event);
                if (progressCallback)
                    progressCallback(currentProgress, 'Удаление базы данных заблокировано!');
                reject(new Error(errorMsg));
            };
        });
    } catch (error) {
        console.error('Error deleting IndexedDB database:', error);
        throw error;
    }
    console.log('Data clearing process finished.');
}

function createPanelItemElement(id, name, isVisible = true) {
    const item = document.createElement('div');
    item.className =
        'panel-item flex items-center p-2 bg-gray-100 dark:bg-gray-700 rounded cursor-move mb-2';
    item.setAttribute('data-section', id);
    const eyeClass = isVisible ? 'fa-eye' : 'fa-eye-slash';
    const titleText = isVisible ? 'Скрыть раздел' : 'Показать раздел';
    item.innerHTML = `
                                <i class="fas fa-grip-lines mr-2 text-gray-400"></i>
                                <span class="flex-grow">${name}</span>
                                <div class="ml-auto flex items-center flex-shrink-0">
                                    <button class="toggle-visibility p-1 text-gray-500 hover:text-primary mr-1" title="${titleText}">
                                        <i class="fas ${eyeClass}"></i>
                                    </button>
                                </div>`;
    return item;
}

let _themeMql = null;
function _applyThemeClass(isDark) {
    const root = document.documentElement;
    root.classList.toggle('dark', !!isDark);
    root.dataset.theme = isDark ? 'dark' : 'light';
    const style = root.style;
    style.setProperty(
        '--color-background',
        `var(--override-background-${isDark ? 'dark' : 'light'}, var(--override-background-base))`,
    );
    const body = document.body;
    if (body.classList.contains('custom-bg-image-active')) {
        body.classList.toggle('theme-dark-text', !!isDark);
        body.classList.toggle('theme-light-text', !isDark);
    }
}
function _onSystemThemeChange(e) {
    _applyThemeClass(e.matches);
}

async function applyPreviewSettings(settings) {
    if (typeof settings !== 'object' || settings === null) {
        settings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
    }
    const root = document.documentElement;
    const { style } = root;
    const body = document.body;

    const primary = settings?.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
    style.setProperty('--color-primary', primary);
    style.setProperty('--color-secondary', calculateSecondaryColor(primary));

    const bgHex =
        settings?.isBackgroundCustom && settings?.backgroundColor ? settings.backgroundColor : null;
    const isTextCustom = !!settings?.isTextCustom && !!settings?.customTextColor;
    const customText = isTextCustom ? settings.customTextColor : null;

    const darkRelFactor = 0.75;
    const lightRelFactor = 0.2;

    const buildPalette = (isDark) => {
        if (!bgHex) return null;
        const hsl = hexToHsl(bgHex);
        if (!hsl) return null;
        const darkBoost = Math.round(hsl.l * darkRelFactor);
        const lightBoost = Math.round((100 - hsl.l) * lightRelFactor);

        let textP = customText
            ? customText
            : hslToHex(...Object.values(adjustHsl(hsl, isDark ? 85 : -85, -30)));
        let textS = customText
            ? customText
            : hslToHex(...Object.values(adjustHsl(hsl, isDark ? 60 : -60, -15)));

        const dimPoints = Math.max(0, Math.min(30, Number(settings?.darkTextDimPoints ?? 12)));
        const MIN_DARK_TEXT_L = 58;
        if (isDark && !customText) {
            const tp = hexToHsl(textP);
            const ts = hexToHsl(textS);
            const tpL = Math.max(MIN_DARK_TEXT_L, tp.l - dimPoints);
            const tsL = Math.max(MIN_DARK_TEXT_L - 6, ts.l - Math.max(6, dimPoints - 4));
            textP = hslToHex(tp.h, tp.s, tpL);
            textS = hslToHex(ts.h, ts.s, tsL);
        }

        const surf1 = hslToHex(
            ...Object.values(adjustHsl(hsl, isDark ? -(6 + darkBoost) : 6 + lightBoost, -5)),
        );
        const surf2 = hslToHex(
            ...Object.values(adjustHsl(hsl, isDark ? -(10 + darkBoost) : 10 + lightBoost, -8)),
        );
        const border = hslToHex(...Object.values(adjustHsl(hsl, isDark ? 12 : -12, -10)));
        const input = hslToHex(...Object.values(adjustHsl(hsl, isDark ? 3 : -3, -5)));
        const hover = hslToHex(
            ...Object.values(adjustHsl(hexToHsl(surf1), isDark ? 6 : -6, isDark ? -6 : 6)),
        );

        return { textP, textS, surf1, surf2, border, input, hover };
    };

    const palLight = buildPalette(false);
    const palDark = buildPalette(true);

    if (bgHex && palLight && palDark) {
        body.classList.add('custom-background-active');

        const baseHsl = hexToHsl(bgHex);
        const bgLight = baseHsl
            ? hslToHex(
                  ...Object.values(
                      adjustHsl(baseHsl, Math.round((100 - baseHsl.l) * lightRelFactor), 0),
                  ),
              )
            : bgHex;
        const bgDark = baseHsl
            ? hslToHex(
                  ...Object.values(adjustHsl(baseHsl, -Math.round(baseHsl.l * darkRelFactor), 0)),
              )
            : bgHex;
        style.setProperty('--override-background-light', bgLight);
        style.setProperty('--override-background-dark', bgDark);

        style.setProperty('--override-text-primary-light', palLight.textP);
        style.setProperty('--override-text-secondary-light', palLight.textS);
        style.setProperty('--override-surface-1-light', palLight.surf1);
        style.setProperty('--override-surface-2-light', palLight.surf2);
        style.setProperty('--override-border-light', palLight.border);
        style.setProperty('--override-input-bg-light', palLight.input);
        style.setProperty('--override-hover-light', palLight.hover);
        style.setProperty('--override-scrollbar-track-light', palLight.surf2);
        style.setProperty('--override-scrollbar-thumb-light', palLight.border);

        style.setProperty('--override-text-primary-dark', palDark.textP);
        style.setProperty('--override-text-secondary-dark', palDark.textS);
        style.setProperty('--override-surface-1-dark', palDark.surf1);
        style.setProperty('--override-surface-2-dark', palDark.surf2);
        style.setProperty('--override-border-dark', palDark.border);
        style.setProperty('--override-input-bg-dark', palDark.input);
        style.setProperty('--override-hover-dark', palDark.hover);
        style.setProperty('--override-scrollbar-track-dark', palDark.surf2);
        style.setProperty('--override-scrollbar-thumb-dark', palDark.border);
    } else {
        body.classList.remove('custom-background-active');
        [
            '--override-background-light',
            '--override-background-dark',
            '--override-text-primary-light',
            '--override-text-secondary-light',
            '--override-surface-1-light',
            '--override-surface-2-light',
            '--override-border-light',
            '--override-input-bg-light',
            '--override-hover-light',
            '--override-scrollbar-track-light',
            '--override-scrollbar-thumb-light',
            '--override-text-primary-dark',
            '--override-text-secondary-dark',
            '--override-surface-1-dark',
            '--override-surface-2-dark',
            '--override-border-dark',
            '--override-input-bg-dark',
            '--override-hover-dark',
            '--override-scrollbar-track-dark',
            '--override-scrollbar-thumb-dark',
        ].forEach((v) => style.removeProperty(v));
    }

    setTheme(settings?.theme || settings?.themeMode || DEFAULT_UI_SETTINGS.themeMode);

    const fontSizePercent = Number.isFinite(settings?.fontSize) ? settings.fontSize : 80;
    root.style.setProperty('--root-font-size', `${fontSizePercent}%`);
    root.style.fontSize = `${fontSizePercent}%`;

    const radiusRaw = settings?.borderRadius;
    const hasUnit = typeof radiusRaw === 'string' && /[a-z%]+$/i.test(radiusRaw.trim());
    const radiusValue = hasUnit
        ? radiusRaw.trim()
        : `${Number.isFinite(radiusRaw) ? radiusRaw : 8}px`;
    root.style.setProperty('--border-radius', radiusValue);

    const density = Number.isFinite(settings?.contentDensity) ? settings.contentDensity : 3;
    root.style.setProperty('--content-spacing', `${density * 0.25}rem`);
}

// Wrapper для модуля color.js
function hexToHsl(hex) {
    return hexToHslModule(hex);
}

// Wrapper для модуля color.js
function hslToHex(h, s, l) {
    return hslToHexModule(h, s, l);
}

// Wrapper для модуля color.js
function getLuminance(hex) {
    return getLuminanceModule(hex);
}

// Wrapper для модуля color.js
function adjustHsl(hsl, l_adjust = 0, s_adjust = 0) {
    return adjustHslModule(hsl, l_adjust, s_adjust);
}

function applyPanelOrderAndVisibility(order, visibility) {
    const tabNav = document.querySelector('header + .border-b nav.flex');
    if (!tabNav) {
        console.error(
            '[applyPanelOrderAndVisibility v5 - State Restore] Tab navigation container not found.',
        );
        return;
    }

    const moreTabsBtnParent = document.getElementById('moreTabsBtn')?.parentNode;
    const idToConfigMap = tabsConfig.reduce((map, tab) => {
        map[tab.id] = tab;
        return map;
    }, {});

    const currentTabButtons = tabNav.querySelectorAll('.tab-btn:not(#moreTabsBtn)');
    currentTabButtons.forEach((btn) => btn.remove());

    const fragment = document.createDocumentFragment();
    const visibilityMap = order.reduce((map, panelId, index) => {
        map[panelId] = visibility[index] ?? true;
        return map;
    }, {});

    order.forEach((panelId) => {
        const config = idToConfigMap[panelId];
        if (config) {
            const tabBtn = createTabButtonElement(config);
            if (!visibilityMap[panelId]) {
                tabBtn.classList.add('hidden');
            }
            fragment.appendChild(tabBtn);
        } else {
            console.warn(
                `[applyPanelOrderAndVisibility v5] Config not found for panel ID: ${panelId}`,
            );
        }
    });

    if (moreTabsBtnParent) {
        tabNav.insertBefore(fragment, moreTabsBtnParent);
    } else {
        tabNav.appendChild(fragment);
    }

    if (State.currentSection) {
        const activeTabId = State.currentSection + 'Tab';
        const activeTabButton = tabNav.querySelector(`#${activeTabId}`);

        if (activeTabButton) {
            activeTabButton.classList.add('tab-active');
            activeTabButton.classList.remove(
                'text-gray-500',
                'dark:text-gray-400',
                'border-transparent',
            );
            console.log(
                `[applyPanelOrderAndVisibility v5] Active state restored for #${activeTabId}`,
            );
        } else {
            console.warn(
                `[applyPanelOrderAndVisibility v5] Could not re-apply active state. Button with ID #${activeTabId} not found after rebuild.`,
            );
        }
    }

    console.log(
        '[applyPanelOrderAndVisibility v5] Panel order and visibility applied, active state restored.',
    );

    if (typeof updateVisibleTabs === 'function') {
        requestAnimationFrame(updateVisibleTabs);
    }
}

function handleModalVisibilityToggle(event) {
    const button = event.currentTarget;
    const icon = button.querySelector('i');
    if (!icon) return;

    const isCurrentlyVisible = icon.classList.contains('fa-eye');
    const shouldBeHidden = isCurrentlyVisible;

    icon.classList.toggle('fa-eye', !shouldBeHidden);
    icon.classList.toggle('fa-eye-slash', shouldBeHidden);
    button.setAttribute('title', shouldBeHidden ? 'Показать раздел' : 'Скрыть раздел');

    updatePreviewSettingsFromModal();
    if (State.currentPreviewSettings) {
        applyPreviewSettings(State.currentPreviewSettings);
        State.isUISettingsDirty = true;
    }
}

function getSettingsFromModal() {
    const modal = document.getElementById('customizeUIModal');
    if (!modal) return null;

    const showBlacklistWarningToggle = modal.querySelector('#toggleBlacklistWarning');
    const disableForcedBackupToggle = modal.querySelector('#disableForcedBackupOnImportToggle');

    const primaryColor = State.currentPreviewSettings.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
    const backgroundColor = State.currentPreviewSettings.backgroundColor;
    const isBackgroundCustom = State.currentPreviewSettings.isBackgroundCustom || false;
    const customTextColor = State.currentPreviewSettings.customTextColor;
    const isTextCustom = State.currentPreviewSettings.isTextCustom || false;

    const panelItems = Array.from(modal.querySelectorAll('#panelSortContainer .panel-item'));
    const panelOrder = panelItems.map((item) => item.getAttribute('data-section'));
    const panelVisibility = panelItems.map(
        (item) => item.querySelector('.toggle-visibility i')?.classList.contains('fa-eye') ?? true,
    );

    return {
        mainLayout: modal.querySelector('input[name="mainLayout"]:checked')?.value || 'horizontal',
        theme: modal.querySelector('input[name="themeMode"]:checked')?.value || 'auto',
        primaryColor: primaryColor,
        backgroundColor: backgroundColor,
        isBackgroundCustom: isBackgroundCustom,
        customTextColor: customTextColor,
        isTextCustom: isTextCustom,
        fontSize: parseInt(modal.querySelector('#fontSizeLabel')?.textContent) || 100,
        borderRadius: parseInt(modal.querySelector('#borderRadiusSlider')?.value) || 8,
        contentDensity: parseInt(modal.querySelector('#densitySlider')?.value) || 3,
        panelOrder: panelOrder,
        panelVisibility: panelVisibility,
        showBlacklistUsageWarning: showBlacklistWarningToggle
            ? showBlacklistWarningToggle.checked
            : false,
        disableForcedBackupOnImport: disableForcedBackupToggle
            ? disableForcedBackupToggle.checked
            : false,
    };
}

function updatePreviewSettingsFromModal() {
    const settings = getSettingsFromModal();
    if (settings) {
        State.currentPreviewSettings = { ...settings };
        console.log('Updated State.currentPreviewSettings from modal:', State.currentPreviewSettings);
    }
}

async function deleteAlgorithm(algorithmId, section) {
    if (section === 'main') {
        console.warn("Попытка удалить 'main' алгоритм через функцию deleteAlgorithm.");
        showNotification('Главный алгоритм не может быть удален.', 'warning');
        return Promise.resolve();
    }

    if (!algorithms || !algorithms[section] || !Array.isArray(algorithms[section])) {
        console.error(
            `deleteAlgorithm: Секция ${section} не найдена или не является массивом в 'algorithms'.`,
        );
        showNotification(
            `Ошибка: Не удалось найти раздел "${getSectionName(section)}" для удаления алгоритма.`,
            'error',
        );
        return Promise.reject(new Error(`Неверная секция или данные алгоритмов: ${section}`));
    }

    const indexToDelete = algorithms[section].findIndex(
        (a) => String(a?.id) === String(algorithmId),
    );

    if (indexToDelete === -1) {
        console.error(
            `deleteAlgorithm: Алгоритм с ID ${algorithmId} не найден в секции ${section}.`,
        );
        const algoCard = document.querySelector(
            `#${section}Algorithms .algorithm-card[data-id="${algorithmId}"]`,
        );
        if (algoCard) {
            algoCard.remove();
            console.log(
                `Удалена карточка алгоритма ${algorithmId} из DOM, т.к. он не найден в данных.`,
            );
        }
        showNotification('Ошибка: Алгоритм уже удален или не найден.', 'warning');
        return Promise.resolve();
    }

    const algorithmToDelete = JSON.parse(JSON.stringify(algorithms[section][indexToDelete]));
    if (!algorithmToDelete.id) algorithmToDelete.id = algorithmId;

    console.log(`Начало удаления алгоритма ID: ${algorithmId}, Секция: ${section}`);

    let transaction;
    let deleteSuccessful = false;
    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
        const screenshotsStore = transaction.objectStore('screenshots');
        const algorithmsStore = transaction.objectStore('algorithms');

        console.log(
            `[TX Delete] Поиск скриншотов по parentId: ${algorithmId}, parentType: 'algorithm'`,
        );
        const screenshotsToDelete = await new Promise((resolve, reject) => {
            if (!screenshotsStore.indexNames.contains('parentId')) {
                console.error(
                    "[TX Delete] Ошибка: Индекс 'parentId' не найден в хранилище 'screenshots'.",
                );
                return reject(new Error("Индекс 'parentId' отсутствует."));
            }
            const index = screenshotsStore.index('parentId');
            let keyToSearch = algorithmId;

            const request = index.getAll(keyToSearch);

            request.onsuccess = (e) => {
                const allParentScreenshots = e.target.result || [];
                const algorithmScreenshots = allParentScreenshots.filter(
                    (s) => s.parentType === 'algorithm',
                );
                resolve(algorithmScreenshots);
            };
            request.onerror = (e) => {
                console.error(
                    `[TX Delete] Ошибка получения скриншотов по индексу parentId=${keyToSearch}:`,
                    e.target.error,
                );
                reject(new Error(`Ошибка поиска скриншотов: ${e.target.error?.message}`));
            };
        });

        console.log(
            `[TX Delete] Найдено ${screenshotsToDelete.length} скриншотов типа 'algorithm' для удаления (parentId: ${algorithmId}).`,
        );

        if (screenshotsToDelete.length > 0) {
            const deleteScreenshotPromises = screenshotsToDelete.map((screenshot) => {
                return new Promise((resolve) => {
                    if (screenshot && screenshot.id !== undefined) {
                        console.log(
                            `[TX Delete] Запрос на удаление скриншота ID: ${screenshot.id}`,
                        );
                        const delReq = screenshotsStore.delete(screenshot.id);
                        delReq.onsuccess = () => {
                            console.log(`[TX Delete] Успешно удален скриншот ID: ${screenshot.id}`);
                            resolve();
                        };
                        delReq.onerror = (e) => {
                            console.error(
                                `[TX Delete] Ошибка удаления скриншота ID: ${screenshot.id}`,
                                e.target.error,
                            );
                            resolve();
                        };
                    } else {
                        console.warn(
                            '[TX Delete] Пропуск удаления невалидной записи скриншота:',
                            screenshot,
                        );
                        resolve();
                    }
                });
            });
            await Promise.all(deleteScreenshotPromises);
            console.log('[TX Delete] Запросы на удаление скриншотов завершены.');
        } else {
            console.log('[TX Delete] Связанных скриншотов для удаления не найдено.');
        }

        algorithms[section].splice(indexToDelete, 1);
        console.log(`Алгоритм ${algorithmId} удален из массива в памяти [${section}].`);

        const algorithmContainerToSave = { section: 'all', data: algorithms };
        console.log("[TX Delete] Запрос на сохранение обновленного контейнера 'algorithms'.");
        await new Promise((resolve, reject) => {
            const putReq = algorithmsStore.put(algorithmContainerToSave);
            putReq.onsuccess = resolve;
            putReq.onerror = (e) => {
                console.error("[TX Delete] Ошибка сохранения 'algorithms':", e.target.error);
                reject(
                    new Error(
                        `Ошибка сохранения algorithms после удаления ${algorithmId}: ${e.target.error?.message}`,
                    ),
                );
            };
        });
        console.log(
            `Обновленные данные algorithms сохранены в IndexedDB после удаления ${algorithmId}.`,
        );

        deleteSuccessful = true;

        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('Транзакция удаления алгоритма и скриншотов успешно завершена.');
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    'ОШИБКА ТРАНЗАКЦИИ при удалении алгоритма/скриншотов:',
                    e.target.error,
                );
                reject(e.target.error || new Error('Неизвестная ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn('Транзакция удаления алгоритма/скриншотов ПРЕРВАНА:', e.target.error);
                if (!deleteSuccessful) resolve();
                else reject(e.target.error || new Error('Транзакция прервана'));
            };
        });
    } catch (error) {
        console.error(
            `КРИТИЧЕСКАЯ ОШИБКА при удалении алгоритма ${algorithmId} из секции ${section}:`,
            error,
        );
        if (transaction && transaction.readyState !== 'done' && transaction.abort) {
            try {
                console.log('Попытка явно отменить транзакцию...');
                transaction.abort();
            } catch (e) {
                console.error('Ошибка при явной отмене транзакции:', e);
            }
        }
        deleteSuccessful = false;
        if (
            algorithmToDelete &&
            algorithms?.[section] &&
            !algorithms[section].find((a) => String(a?.id) === String(algorithmId))
        ) {
            algorithms[section].splice(indexToDelete, 0, algorithmToDelete);
            console.warn(`Восстановлен алгоритм ${algorithmId} в памяти из-за ошибки удаления.`);
            if (typeof renderAlgorithmCards === 'function') {
                renderAlgorithmCards(section);
            }
        }
        showNotification(
            `Произошла ошибка при удалении алгоритма: ${error.message || error}`,
            'error',
        );
        return Promise.reject(error);
    }

    if (deleteSuccessful) {
        if (typeof updateSearchIndex === 'function' && algorithmToDelete?.id) {
            console.log(
                `Запуск обновления поискового индекса (delete) для ID: ${algorithmToDelete.id}`,
            );
            updateSearchIndex('algorithms', algorithmToDelete.id, algorithmToDelete, 'delete')
                .then(() =>
                    console.log(
                        `Обновление поискового индекса (удаление) инициировано для ${algorithmToDelete.id}`,
                    ),
                )
                .catch((indexError) =>
                    console.error(
                        `Ошибка фонового обновления индекса при удалении алгоритма ${algorithmToDelete.id}:`,
                        indexError,
                    ),
                );
        } else {
            console.warn(
                'Не удалось обновить индекс для удаленного алгоритма - функция или ID отсутствуют.',
            );
        }

        if (typeof renderAlgorithmCards === 'function') {
            console.log(`Перерисовка карточек алгоритмов для секции ${section}...`);
            renderAlgorithmCards(section);
        } else {
            console.warn('Функция renderAlgorithmCards не найдена, UI может не обновиться.');
        }

        showNotification('Алгоритм успешно удален.');
        return Promise.resolve();
    } else {
        console.error(
            `Удаление алгоритма ${algorithmId} завершилось без успеха, но и без явной ошибки транзакции.`,
        );
        return Promise.reject(new Error('Удаление завершилось с неопределенным статусом'));
    }
}

const newClickHandler = async (event) => {
    const button = event.currentTarget;
    const algorithmModal = button.closest('#algorithmModal');

    if (!algorithmModal) {
        console.error(
            'handleDeleteAlgorithmClick: Не удалось найти родительское модальное окно #algorithmModal.',
        );
        showNotification('Ошибка: Не удалось определить контекст для удаления.', 'error');
        return;
    }

    const algorithmIdToDelete = algorithmModal.dataset.currentAlgorithmId;
    const sectionToDelete = algorithmModal.dataset.currentSection;

    if (!algorithmIdToDelete || !sectionToDelete) {
        console.error(
            'handleDeleteAlgorithmClick: Не удалось определить algorithmId или section из data-атрибутов.',
        );
        showNotification('Ошибка: Не удалось определить алгоритм для удаления.', 'error');
        return;
    }

    if (sectionToDelete === 'main') {
        showNotification('Главный алгоритм удалить нельзя.', 'warning');
        return;
    }

    const modalTitleElement = document.getElementById('modalTitle');
    const algorithmTitle = modalTitleElement
        ? modalTitleElement.textContent
        : `алгоритм с ID ${algorithmIdToDelete}`;

    if (
        confirm(
            `Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`,
        )
    ) {
        algorithmModal.classList.add('hidden');
        console.log(
            `[newClickHandler] Modal #${algorithmModal.id} скрыто сразу после подтверждения.`,
        );

        console.log(
            `Запуск удаления алгоритма ID: ${algorithmIdToDelete} из секции: ${sectionToDelete}`,
        );
        try {
            if (typeof deleteAlgorithm === 'function') {
                await deleteAlgorithm(algorithmIdToDelete, sectionToDelete);
            } else {
                console.error('handleDeleteAlgorithmClick: Функция deleteAlgorithm не найдена!');
                throw new Error('Функция удаления недоступна.');
            }
        } catch (error) {
            console.error(`Ошибка при вызове deleteAlgorithm из обработчика кнопки:`, error);
            showNotification('Произошла ошибка при попытке удаления алгоритма.', 'error');
        }
    } else {
        console.log('Удаление алгоритма отменено пользователем.');
    }
};

deleteAlgorithmBtn.addEventListener('click', newClickHandler);
deleteAlgorithmBtn._clickHandler = newClickHandler;
console.log('Обработчик клика для deleteAlgorithmBtn настроен для использования data-атрибутов.');

const triggerSelectors = [
    '#editMainBtn',
    '#editAlgorithmBtn',
    '#deleteAlgorithmBtn',
    '#addProgramAlgorithmBtn',
    '#addSkziAlgorithmBtn',
    '#addWebRegAlgorithmBtn',
    '#customizeUIBtn',
    '#addBookmarkBtn',
    '#addLinkBtn',
    '#addReglamentBtn',
    '#addExtLinkBtn',
    '#organizeBookmarksBtn',
    '#exportDataBtn',
    '#importDataBtn',
    '#themeToggle',
    '#noInnLink',
    '.algorithm-card',
    '.reglament-category',
    '.edit-bookmark',
    '.delete-bookmark',
    '.edit-link',
    '.delete-link',
    '.edit-ext-link',
    '.delete-ext-link',
    '#editReglamentBtn',
    '#deleteReglamentBtn',
    'button[id*="ModalBtn"]',
    'button[class*="edit-"]',
    'button[class*="delete-"]',
    'button[data-action]',
    '#addStepBtn',
    '#saveAlgorithmBtn',
    '#addNewStepBtn',
    '#saveNewAlgorithmBtn',
    '#folderForm button[type="submit"]',
    '#bookmarkForm button[type="submit"]',
    '#linkForm button[type="submit"]',
    '#reglamentForm button[type="submit"]',
    '#extLinkForm button[type="submit"]',
    '#editReglamentForm button[type="submit"]',
].join(', ');

document.addEventListener('click', (event) => {
    const visibleModals = getVisibleModals();
    if (!visibleModals.length) {
        return;
    }

    const topmostModal = getTopmostModal(visibleModals);
    if (!topmostModal) {
        return;
    }

    if (event.target === topmostModal) {
        const nonClosableModals = [
            'customizeUIModal',
            'bookmarkModal',
            'extLinkModal',
            'foldersModal',
            'bookmarkDetailModal',
            'reglamentModal',
            'blacklistEntryModal',
            'blacklistDetailModal',
        ];

        if (nonClosableModals.includes(topmostModal.id)) {
            console.log(
                `[Global Click Handler] Click on overlay for modal "${topmostModal.id}" detected. Closing is PREVENTED for this modal type.`,
            );

            const innerContainer = topmostModal.querySelector(
                '.modal-inner-container, .bg-white.dark\\:bg-gray-800',
            );
            if (innerContainer) {
                innerContainer.classList.add('shake-animation');
                setTimeout(() => innerContainer.classList.remove('shake-animation'), 500);
            }
            return;
        }

        console.log(
            `[Global Click Handler] Closing modal "${topmostModal.id}" due to click on overlay.`,
        );

        if (topmostModal.id === 'editModal' || topmostModal.id === 'addModal') {
            if (typeof requestCloseModal === 'function') {
                requestCloseModal(topmostModal);
            } else {
                console.warn('requestCloseModal function not found, hiding modal directly.');
                topmostModal.classList.add('hidden');
                if (typeof removeEscapeHandler === 'function') {
                    removeEscapeHandler(topmostModal);
                }
            }
        } else if (
            topmostModal.id === 'reglamentDetailModal' ||
            topmostModal.id === 'screenshotViewerModal' ||
            topmostModal.id === 'noInnModal' ||
            topmostModal.id === 'hotkeysModal' ||
            topmostModal.id === 'confirmClearDataModal' ||
            topmostModal.id === 'cibLinkModal'
        ) {
            topmostModal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(topmostModal);
            }
            if (topmostModal.id === 'screenshotViewerModal') {
                const state = topmostModal._modalState || {};
                const images = state.contentArea?.querySelectorAll('img[data-object-url]');
                images?.forEach((img) => {
                    if (img.dataset.objectUrl) {
                        try {
                            URL.revokeObjectURL(img.dataset.objectUrl);
                        } catch (revokeError) {
                            console.warn(
                                `Error revoking URL on overlay close for ${topmostModal.id}:`,
                                revokeError,
                            );
                        }
                        delete img.dataset.objectUrl;
                    }
                });
            }
        } else {
            console.warn(
                `[Global Click Handler] Closing unhandled modal "${topmostModal.id}" on overlay click.`,
            );
            topmostModal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(topmostModal);
            }
        }

        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
            if (!document.querySelector('div.fixed.inset-0.bg-black.bg-opacity-50:not(.hidden)')) {
                document.body.classList.remove('overflow-hidden');
            }
        }
    }
});

// Wrapper для модуля html.js
function linkify(text) {
    return linkifyModule(text);
}

function initFullscreenToggles() {
    console.log('[initFullscreenToggles] Initializing fullscreen toggles for static modals...');

    const attachHandler = (config) => {
        const button = document.getElementById(config.buttonId);
        const modal = document.getElementById(config.modalId);

        if (button && modal) {
            if (button._fullscreenToggleHandler) {
                button.removeEventListener('click', button._fullscreenToggleHandler);
            }

            button._fullscreenToggleHandler = () => {
                if (typeof toggleModalFullscreen === 'function') {
                    toggleModalFullscreen(
                        config.modalId,
                        config.buttonId,
                        config.classToggleConfig,
                        config.innerContainerSelector,
                        config.contentAreaSelector,
                    );
                } else {
                    console.error(
                        `toggleModalFullscreen function not found for button ${config.buttonId}`,
                    );
                    if (typeof showNotification === 'function') {
                        showNotification(
                            'Ошибка: Функция переключения полноэкранного режима недоступна.',
                            'error',
                        );
                    }
                }
            };
            button.addEventListener('click', button._fullscreenToggleHandler);
            console.log(
                `Fullscreen toggle handler attached to #${config.buttonId} for #${config.modalId}.`,
            );
        } else {
            if (!button)
                console.warn(`[initFullscreenToggles] Button #${config.buttonId} not found.`);
            if (!modal)
                console.warn(
                    `[initFullscreenToggles] Modal #${config.modalId} not found for button #${config.buttonId}.`,
                );
        }
    };

    attachHandler(algorithmDetailModalConfig);
    attachHandler(editAlgorithmModalConfig);
    attachHandler(addAlgorithmModalConfig);

    console.log('[initFullscreenToggles] Finished attaching handlers for static modals.');
}

function toggleModalFullscreen(
    modalId,
    buttonId,
    classToggleConfig,
    innerContainerSelector,
    contentAreaSelector,
) {
    const modalElement = document.getElementById(modalId);
    const buttonElement = document.getElementById(buttonId);

    if (!modalElement || !buttonElement) {
        console.error(
            `[toggleModalFullscreen] Error: Elements not found for modalId: ${modalId} or buttonId: ${buttonId}`,
        );
        return;
    }

    const innerContainer = modalElement.querySelector(innerContainerSelector);
    const contentArea = contentAreaSelector
        ? modalElement.querySelector(contentAreaSelector)
        : null;

    if (!innerContainer) {
        console.error(
            `[toggleModalFullscreen] Error: innerContainer not found using selector: "${innerContainerSelector}" within #${modalId}`,
        );
        return;
    }
    if (contentAreaSelector && !contentArea) {
        console.warn(
            `[toggleModalFullscreen] Warning: contentArea not found using selector: "${contentAreaSelector}" within #${modalId}. Proceeding without it.`,
        );
    }

    const icon = buttonElement.querySelector('i');
    const isCurrentlyFullscreen = modalElement.classList.contains('is-fullscreen');
    const shouldBeFullscreen = !isCurrentlyFullscreen;

    console.log(`Toggling fullscreen for ${modalId}. Should be fullscreen: ${shouldBeFullscreen}`);

    const classesToRemoveConfig = isCurrentlyFullscreen
        ? classToggleConfig.fullscreen
        : classToggleConfig.normal;
    const classesToAddConfig = shouldBeFullscreen
        ? classToggleConfig.fullscreen
        : classToggleConfig.normal;

    Object.entries(classesToRemoveConfig).forEach(([part, classes]) => {
        const element =
            part === 'modal'
                ? modalElement
                : part === 'innerContainer'
                ? innerContainer
                : contentArea;
        if (element && classes && classes.length > 0) {
            element.classList.remove(...classes);
        }
    });

    Object.entries(classesToAddConfig).forEach(([part, classes]) => {
        const element =
            part === 'modal'
                ? modalElement
                : part === 'innerContainer'
                ? innerContainer
                : contentArea;
        if (element && classes && classes.length > 0) {
            element.classList.add(...classes);
        }
    });

    modalElement.classList.toggle('is-fullscreen', shouldBeFullscreen);

    if (icon) {
        icon.classList.remove('fa-expand', 'fa-compress');
        icon.classList.add(shouldBeFullscreen ? 'fa-compress' : 'fa-expand');
    }
    buttonElement.setAttribute(
        'title',
        shouldBeFullscreen ? 'Свернуть' : 'Развернуть на весь экран',
    );

    console.log(`Fullscreen toggle complete for ${modalId}. Is fullscreen: ${shouldBeFullscreen}`);
}

// getAllExtLinks - imported from ext-links.js module

async function getAllFromIndexedDBWhere(storeName, indexName, indexValue) {
    console.log(
        `[getAllFromIndexedDBWhere] Вызов обертки для ${storeName} по индексу ${indexName} = ${indexValue}`,
    );
    try {
        if (typeof getAllFromIndex !== 'function') {
            console.error('getAllFromIndexedDBWhere: Базовая функция getAllFromIndex не найдена!');
            throw new Error('Зависимость getAllFromIndex отсутствует');
        }
        return await getAllFromIndex(storeName, indexName, indexValue);
    } catch (error) {
        console.error(
            `[getAllFromIndexedDBWhere] Ошибка при вызове getAllFromIndex для ${storeName}/${indexName}/${indexValue}:`,
            error,
        );
        throw error;
    }
}

// debounce - imported from helpers.js module

// Wrapper для модуля app-reload.js
function forceReloadApp() {
    return forceReloadAppModule();
}

// Wrapper для модуля app-reload.js
function initReloadButton() {
    return initReloadButtonModule();
}

// Wrapper-ы для модуля algorithms.js (Algorithm Editing State)
function getCurrentEditState() {
    return getCurrentEditStateModule();
}
function getCurrentAddState() {
    return getCurrentAddStateModule();
}
function hasChanges(modalType) {
    return hasChangesModule(modalType);
}
function captureInitialEditState(algorithm, section) {
    return captureInitialEditStateModule(algorithm, section);
}
function captureInitialAddState() {
    return captureInitialAddStateModule();
}

function showNoInnModal() {
    let modal = document.getElementById('noInnModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'noInnModal';
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 z-[60] p-4 flex items-center justify-center hidden';
        modal.innerHTML = `
             <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                 <div class="p-6">
                     <div class="flex justify-between items-center mb-4">
                         <h2 class="text-xl font-bold">Клиент не знает ИНН</h2>
                         <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" aria-label="Закрыть"><i class="fas fa-times text-xl"></i></button>
                     </div>
                     <div class="space-y-3 text-sm">
                         <p>Альтернативные способы идентификации:</p>
                         <ol class="list-decimal ml-5 space-y-1.5">
                             <li>Полное наименование организации</li>
                             <li>Юридический адрес</li>
                             <li>КПП или ОГРН</li>
                             <li>ФИО руководителя</li>
                             <li>Проверить данные через <a href="https://egrul.nalog.ru/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">сервис ФНС</a></li>
                         </ol>
                         <p class="mt-3 text-xs italic text-gray-600 dark:text-gray-400">Тщательно проверяйте данные при идентификации без ИНН.</p>
                     </div>
                     <div class="mt-6 flex justify-end">
                         <button class="close-modal px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">Понятно</button>
                     </div>
                 </div>
             </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('.close-modal')) {
                modal.classList.add('hidden');
                removeEscapeHandler(modal);
                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('overflow-hidden');
                }
            }
        });
    }
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    addEscapeHandler(modal);
}

// Wrapper для модуля employee-extension.js
async function loadEmployeeExtension() {
    return loadEmployeeExtensionModule();
}

// Wrapper для модуля employee-extension.js
async function saveEmployeeExtension(extensionValue) {
    return saveEmployeeExtensionModule(extensionValue);
}

// Wrapper для модуля employee-extension.js
function updateExtensionDisplay(extensionValue) {
    return updateExtensionDisplayModule(extensionValue);
}

// Wrapper для модуля employee-extension.js
function setupExtensionFieldListeners() {
    return setupExtensionFieldListenersModule();
}

// Wrapper для модуля helpers.js
function setupClearButton(inputId, buttonId, actionCallback) {
    return setupClearButtonModule(inputId, buttonId, actionCallback);
}

let searchEscClearHandler = null;
let altRReloadHandler = null;
function setupHotkeys() {
    document.removeEventListener('keydown', handleGlobalHotkey, true);
    document.removeEventListener('keydown', handleGlobalHotkey, false);

    document.addEventListener('keydown', handleGlobalHotkey, false);
    if (searchEscClearHandler) {
        document.removeEventListener('keydown', searchEscClearHandler, true);
    }
    searchEscClearHandler = (event) => {
        if (event.key !== 'Escape') return;
        const ae = document.activeElement;
        if (!ae || ae.tagName !== 'INPUT') return;
        const id = ae.id || '';
        if (!/search/i.test(id)) return;
        event.preventDefault();
        event.stopPropagation();
        const clearMap = {
            searchInput: 'clearSearchBtn',
            linkSearchInput: 'clearLinkSearchInputBtn',
            extLinkSearchInput: 'clearExtLinkSearchBtn',
            bookmarkSearchInput: 'clearBookmarkSearchBtn',
            blacklistSearchInput: 'clearBlacklistSearchBtn',
            sedoSearchInput: 'clearSedoSearchBtn',
            'shablony-search-input': 'shablony-search-clear-btn',
            'telefony-search-input': 'telefony-search-clear-btn',
        };
        const btnId = clearMap[id];
        const btn = btnId ? document.getElementById(btnId) : null;
        if (btn) {
            btn.click();
        } else {
            ae.value = '';
            ae.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    };
    document.addEventListener('keydown', searchEscClearHandler, true);

    // Alt + R — принудительная перезагрузка
    if (altRReloadHandler) {
        document.removeEventListener('keydown', altRReloadHandler, false);
    }
    altRReloadHandler = (event) => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.code !== 'KeyR') return;
        const ae = document.activeElement;
        const isInputFocused =
            ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
        if (isInputFocused) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof forceReloadApp === 'function') {
            forceReloadApp();
        } else {
            window.location.reload();
        }
    };
    document.addEventListener('keydown', altRReloadHandler, false);

    console.log('Глобальные хоткеи и дополнительные перехватчики инициализированы.');
}

function toggleActiveSectionView() {
    if (typeof State.currentSection === 'undefined' || !State.currentSection) {
        console.warn('toggleActiveSectionView: Переменная State.currentSection не определена или пуста.');
        showNotification('Не удалось определить активную секцию для переключения вида.', 'warning');
        return;
    }

    let containerId;
    let sectionIdentifierForPrefs;

    switch (State.currentSection) {
        case 'main':
            showNotification('Главный алгоритм не имеет переключения вида.', 'info');
            return;
        case 'program':
            containerId = 'programAlgorithms';
            break;
        case 'skzi':
            containerId = 'skziAlgorithms';
            break;
        case 'webReg':
            containerId = 'webRegAlgorithms';
            break;
        case 'lk1c':
            containerId = 'lk1cAlgorithms';
            break;
        case 'links':
            containerId = 'linksContainer';
            break;
        case 'extLinks':
            containerId = 'extLinksContainer';
            break;
        case 'reglaments':
            const reglamentsListDiv = document.getElementById('reglamentsList');
            if (!reglamentsListDiv || reglamentsListDiv.classList.contains('hidden')) {
                showNotification('Сначала выберите категорию регламентов.', 'info');
                return;
            }
            containerId = 'reglamentsContainer';
            break;
        case 'bookmarks':
            containerId = 'bookmarksContainer';
            break;
        default:
            console.warn(`toggleActiveSectionView: Неизвестная секция '${State.currentSection}'.`);
            showNotification('Переключение вида для текущей секции не поддерживается.', 'warning');
            return;
    }
    sectionIdentifierForPrefs = containerId;

    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(
            `toggleActiveSectionView: Контейнер #${containerId} не найден для секции ${State.currentSection}.`,
        );
        showNotification('Не удалось найти контейнер для переключения вида.', 'error');
        return;
    }

    const currentView =
        State.viewPreferences[sectionIdentifierForPrefs] || container.dataset.defaultView || 'cards';
    const nextView = currentView === 'cards' ? 'list' : 'cards';

    console.log(
        `Переключение вида для ${sectionIdentifierForPrefs} с ${currentView} на ${nextView}`,
    );

    if (typeof applyView === 'function' && typeof saveViewPreference === 'function') {
        applyView(container, nextView);
        saveViewPreference(sectionIdentifierForPrefs, nextView);
        showNotification(
            `Вид переключен на: ${nextView === 'list' ? 'Список' : 'Плитки'}`,
            'info',
            1500,
        );
    } else {
        console.error(
            'toggleActiveSectionView: Функции applyView или saveViewPreference не найдены.',
        );
        showNotification('Ошибка: Функция переключения вида недоступна.', 'error');
    }
}

function handleNoInnLinkEvent(event) {
    const link = event.target.closest('a[id^="noInnLink_"]');
    if (link) {
        event.preventDefault();
        if (typeof showNoInnModal === 'function') {
            showNoInnModal();
        } else {
            console.error('Функция showNoInnModal не определена');
        }
    }
}

function navigateBackWithinApp() {
    console.log('[App Navigate Back] Попытка навигации назад внутри приложения...');

    const reglamentsListDiv = document.getElementById('reglamentsList');
    const categoryGrid = document.getElementById('reglamentCategoryGrid');
    const backToCategoriesBtn = document.getElementById('backToCategories');

    if (
        reglamentsListDiv &&
        !reglamentsListDiv.classList.contains('hidden') &&
        backToCategoriesBtn
    ) {
        console.log(
            "[App Navigate Back]   > Обнаружен активный список регламентов. Имитация клика 'Назад к категориям'.",
        );
        backToCategoriesBtn.click();
        return true;
    }

    console.log('[App Navigate Back]   > Не найдено подходящего состояния для навигации назад.');
    showNotification("Нет действия 'назад' для текущего экрана.", 'info');
    return false;
}

function handleGlobalHotkey(event) {
    const code = event.code;
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    const activeElement = document.activeElement;
    const isInputFocused =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable);

    const clientNotes = document.getElementById('clientNotes');
    const isClientNotesVisible = clientNotes && clientNotes.offsetParent !== null;

    if (
        alt &&
        !ctrlOrMeta &&
        !shift &&
        isClientNotesVisible &&
        (event.key === '=' ||
            event.key === '+' ||
            event.key === '-' ||
            event.code === 'NumpadAdd' ||
            event.code === 'NumpadSubtract')
    ) {
        event.preventDefault();
        event.stopPropagation();

        if (!State.userPreferences) {
            console.warn('[Hotkey] State.userPreferences не доступны для изменения размера шрифта.');
            return;
        }

        const isIncrease = event.key === '=' || event.key === '+' || event.code === 'NumpadAdd';
        const currentSize = State.userPreferences.clientNotesFontSize || 100;
        let newSize;

        if (isIncrease) {
            newSize = Math.min(
                CLIENT_NOTES_MAX_FONT_SIZE,
                currentSize + CLIENT_NOTES_FONT_SIZE_STEP,
            );
        } else {
            newSize = Math.max(
                CLIENT_NOTES_MIN_FONT_SIZE,
                currentSize - CLIENT_NOTES_FONT_SIZE_STEP,
            );
        }

        if (newSize !== currentSize) {
            State.userPreferences.clientNotesFontSize = newSize;
            applyClientNotesFontSize();
            saveUserPreferences().catch((err) =>
                console.error('Не удалось сохранить настройку размера шрифта:', err),
            );
        }
        return;
    }

    if (alt && !ctrlOrMeta && !shift) {
        switch (event.code) {
            case 'KeyS': // Alt + S
                console.log('[Hotkey] Обнаружена комбинация Alt + S (Сохранить)');
                event.preventDefault();
                event.stopPropagation();
                const topModalForSave = getTopmostModal(getVisibleModals());
                if (topModalForSave) {
                    console.log(
                        `[Hotkey Alt+S] Найдено верхнее модальное окно: #${topModalForSave.id}`,
                    );
                    const SAVE_BUTTON_SELECTORS = [
                        '#saveAlgorithmBtn',
                        '#saveNewAlgorithmBtn',
                        '#saveBookmarkBtn',
                        '#saveCibLinkBtn',
                        '#saveReglamentBtn',
                        '#saveUISettingsBtn',
                        '#saveExtLinkBtn',
                        '#saveBlacklistEntryBtn',
                    ];

                    for (const selector of SAVE_BUTTON_SELECTORS) {
                        const saveBtn = topModalForSave.querySelector(selector);
                        if (
                            saveBtn &&
                            !saveBtn.disabled &&
                            (saveBtn.offsetWidth > 0 ||
                                saveBtn.offsetHeight > 0 ||
                                saveBtn.getClientRects().length > 0)
                        ) {
                            console.log(
                                `[Hotkey Alt+S] Найдена активная кнопка сохранения: ${selector}. Вызов click().`,
                            );
                            saveBtn.click();
                            return;
                        }
                    }
                    console.log(
                        `[Hotkey Alt+S] В окне #${topModalForSave.id} не найдено активных кнопок сохранения.`,
                    );
                } else {
                    console.log(
                        `[Hotkey Alt+S] Не найдено активных модальных окон для сохранения.`,
                    );
                }
                return;

            case 'KeyK': // Alt + K
                console.log('[Hotkey] Обнаружена комбинация Alt + K (В избранное)');
                event.preventDefault();
                event.stopPropagation();
                const topModalForFavorite = getTopmostModal(getVisibleModals());
                if (topModalForFavorite) {
                    const favButton = topModalForFavorite.querySelector('.toggle-favorite-btn');
                    if (
                        favButton &&
                        (favButton.offsetWidth > 0 ||
                            favButton.offsetHeight > 0 ||
                            favButton.getClientRects().length > 0)
                    ) {
                        console.log(
                            `[Hotkey Alt+K] Найдена кнопка "В избранное" в окне #${topModalForFavorite.id}. Вызов click().`,
                        );
                        favButton.click();
                        return;
                    } else {
                        console.log(
                            `[Hotkey Alt+K] Кнопка "В избранное" не найдена или невидима в окне #${topModalForFavorite.id}.`,
                        );
                    }
                } else {
                    console.log(
                        `[Hotkey Alt+K] Не найдено активных модальных окон для добавления в избранное.`,
                    );
                }
                return;
        }
    }

    if (event.key === 'Escape') {
        const activeSearchInputIds = new Set([
            'searchInput',
            'bookmarkSearchInput',
            'linkSearchInput',
            'extLinkSearchInput',
            'blacklistSearchInput',
        ]);

        if (activeElement && activeSearchInputIds.has(activeElement.id)) {
            console.log(
                `[GlobalHotkey Esc] Обработка Escape для поискового поля: ${activeElement.id}`,
            );
            activeElement.value = '';
            activeElement.blur();
            activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log(
                `[GlobalHotkey Esc] Для поля ${activeElement.id} значение очищено, фокус убран, событие 'input' вызвано. Обработка Esc завершена.`,
            );
            return;
        }
    }

    const lightbox = document.getElementById('screenshotLightbox');
    const viewerModal = document.getElementById('screenshotViewerModal');
    const algorithmModal = document.getElementById('algorithmModal');
    const bookmarkDetailModal = document.getElementById('bookmarkDetailModal');
    const reglamentDetailModal = document.getElementById('reglamentDetailModal');
    const reglamentsListDiv = document.getElementById('reglamentsList');
    const backToCategoriesBtn = document.getElementById('backToCategories');

    if (lightbox && !lightbox.classList.contains('hidden') && !isInputFocused) {
        console.log(`[GlobalHotkey] Лайтбокс активен, перехват клавиши: ${event.key}`);
        switch (event.key) {
            case 'Escape':
                console.log('[GlobalHotkey Esc] Лайтбокс: Закрытие всей цепочки.');
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (lightbox._closeLightboxFunction) lightbox._closeLightboxFunction();

                if (viewerModal && !viewerModal.classList.contains('hidden')) {
                    if (viewerModal._modalState?.closeModalFunction)
                        viewerModal._modalState.closeModalFunction();
                    else {
                        viewerModal.classList.add('hidden');
                    }
                }
                if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
                    algorithmModal.classList.add('hidden');
                }
                if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
                    bookmarkDetailModal.classList.add('hidden');
                }
                if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
                    reglamentDetailModal.classList.add('hidden');
                }

                requestAnimationFrame(() => {
                    if (getVisibleModals().length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                    }
                });
                return;
            case 'Backspace':
                console.log('[GlobalHotkey Backspace] Лайтбокс: Закрытие лайтбокса.');
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (lightbox._closeLightboxFunction) lightbox._closeLightboxFunction();

                requestAnimationFrame(() => {
                    const visibleModalsAfterLightboxClose = getVisibleModals().filter(
                        (m) => m.id !== 'screenshotLightbox',
                    );
                    if (visibleModalsAfterLightboxClose.length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                    }
                });
                return;
            case 'ArrowLeft':
                console.log('[GlobalHotkey ArrowLeft] Лайтбокс: Предыдущее изображение.');
                event.preventDefault();
                event.stopPropagation();
                if (lightbox._navigateImageFunction) lightbox._navigateImageFunction('prev');
                return;
            case 'ArrowRight':
                console.log('[GlobalHotkey ArrowRight] Лайтбокс: Следующее изображение.');
                event.preventDefault();
                event.stopPropagation();
                if (lightbox._navigateImageFunction) lightbox._navigateImageFunction('next');
                return;
            case 'Tab':
                const focusableElements = Array.from(
                    lightbox.querySelectorAll('button:not([disabled]), [href]:not([disabled])'),
                ).filter(
                    (el) =>
                        el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0,
                );
                if (focusableElements.length === 0) {
                    event.preventDefault();
                    return;
                }
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                if (event.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        event.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        event.preventDefault();
                    }
                }
                event.stopPropagation();
                return;
        }
    }

    if (code === 'Escape' && !isInputFocused) {
        console.log(
            '[GlobalHotkey Esc] (Лайтбокс неактивен или Escape не для него, и не для поля поиска)',
        );
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        let closedSomethingInChain = false;

        if (viewerModal && !viewerModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Цепочка: Вьювер -> Детали');
            if (viewerModal._modalState?.closeModalFunction)
                viewerModal._modalState.closeModalFunction();
            else {
                viewerModal.classList.add('hidden');
            }

            if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
                algorithmModal.classList.add('hidden');
            }
            if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
                bookmarkDetailModal.classList.add('hidden');
            }
            if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
                reglamentDetailModal.classList.add('hidden');
            }
            closedSomethingInChain = true;
        } else if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Закрытие окна деталей алгоритма');
            algorithmModal.classList.add('hidden');
            closedSomethingInChain = true;
        } else if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Закрытие окна деталей закладки');
            bookmarkDetailModal.classList.add('hidden');
            closedSomethingInChain = true;
        } else if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Закрытие окна деталей регламента');
            reglamentDetailModal.classList.add('hidden');
            closedSomethingInChain = true;
        }

        if (!closedSomethingInChain) {
            const visibleModals = getVisibleModals();
            if (visibleModals.length > 0) {
                const topmost = getTopmostModal(visibleModals);
                if (topmost) {
                    console.log(
                        `[GlobalHotkey Esc] Закрытие общего самого верхнего модального окна: ${topmost.id}`,
                    );

                    if (
                        typeof requestCloseModal === 'function' &&
                        (topmost.id === 'editModal' ||
                            topmost.id === 'addModal' ||
                            topmost.id === 'customizeUIModal' ||
                            topmost.id === 'bookmarkModal')
                    ) {
                        if (!requestCloseModal(topmost)) {
                            return;
                        }
                    } else {
                        topmost.classList.add('hidden');
                    }
                } else {
                    console.log(
                        '[GlobalHotkey Esc] Нет самого верхнего модального окна для закрытия (getTopmostModal вернул null).',
                    );
                }
            } else {
                console.log('[GlobalHotkey Esc] Нет активных модальных окон для закрытия.');
            }
        }

        requestAnimationFrame(() => {
            if (getVisibleModals().length === 0) {
                document.body.classList.remove('overflow-hidden');
                document.body.classList.remove('modal-open');
                console.log(
                    `[GlobalHotkey Esc] overflow-hidden и modal-open сняты с body (после rAF).`,
                );
            } else {
                console.log(
                    `[GlobalHotkey Esc] overflow-hidden и modal-open НЕ сняты, т.к. есть другие видимые модальные окна (после rAF). Count: ${
                        getVisibleModals().length
                    }, Modals:`,
                    getVisibleModals().map((m) => m.id),
                );
            }
        });
        return;
    }

    if (code === 'Backspace' && !isInputFocused) {
        console.log('[GlobalHotkey Backspace] (Лайтбокс неактивен или Backspace не для него)');
        event.preventDefault();
        event.stopPropagation();

        let handledByBackspace = false;

        if (viewerModal && !viewerModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие вьювера скриншотов');
            if (viewerModal._modalState?.closeModalFunction)
                viewerModal._modalState.closeModalFunction();
            else {
                viewerModal.classList.add('hidden');
            }
            handledByBackspace = true;
        } else if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие окна деталей алгоритма');
            algorithmModal.classList.add('hidden');
            handledByBackspace = true;
        } else if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие окна деталей закладки');
            bookmarkDetailModal.classList.add('hidden');
            handledByBackspace = true;
        } else if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие окна деталей регламента');
            reglamentDetailModal.classList.add('hidden');
            handledByBackspace = true;
        } else if (
            reglamentsListDiv &&
            !reglamentsListDiv.classList.contains('hidden') &&
            backToCategoriesBtn
        ) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Возврат к категориям регламентов');
            backToCategoriesBtn.click();
            handledByBackspace = true;
        }

        if (handledByBackspace) {
            requestAnimationFrame(() => {
                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('overflow-hidden');
                    document.body.classList.remove('modal-open');
                    console.log(
                        `[GlobalHotkey Backspace] overflow-hidden и modal-open сняты с body (после rAF).`,
                    );
                } else {
                    console.log(
                        `[GlobalHotkey Backspace] overflow-hidden и modal-open НЕ сняты, т.к. есть другие видимые модальные окна (после rAF). Count: ${
                            getVisibleModals().length
                        }`,
                    );
                }
            });
        }

        if (!handledByBackspace) {
            console.log(
                "[GlobalHotkey Backspace] Нет подходящего действия 'шаг назад' для текущего состояния.",
            );
        }
        return;
    }

    if (alt && !ctrlOrMeta && !isInputFocused) {
        switch (code) {
            case 'KeyH': // Alt + H
                console.log('[Hotkey] Обнаружена комбинация Alt + KeyH (Главная)');
                event.preventDefault();
                setActiveTab('main');
                return;
            case 'KeyL': // Alt + L
                console.log('[Hotkey] Обнаружена комбинация Alt + KeyL (Избранное)');
                event.preventDefault();
                setActiveTab('favorites');
                return;
            case 'KeyN': // Alt + N
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyN');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log(
                        `[Hotkey]   > Выполнение действия: добавить элемент для секции '${State.currentSection}'`,
                    );
                    let addFunctionN = null,
                        functionArgN = null,
                        functionNameN = '';
                    switch (State.currentSection) {
                        case 'program':
                        case 'skzi':
                        case 'webReg':
                        case 'lk1c':
                            addFunctionN = showAddModal;
                            functionArgN = State.currentSection;
                            functionNameN = 'showAddModal';
                            break;
                        case 'links':
                            addFunctionN = showAddEditCibLinkModal;
                            functionNameN = 'showAddEditCibLinkModal';
                            break;
                        case 'extLinks':
                            addFunctionN = showAddExtLinkModal;
                            functionNameN = 'showAddExtLinkModal';
                            break;
                        case 'reglaments':
                            addFunctionN = showAddReglamentModal;
                            functionNameN = 'showAddReglamentModal';
                            break;
                        case 'bookmarks':
                            addFunctionN = showAddBookmarkModal;
                            functionNameN = 'showAddBookmarkModal';
                            break;
                        case 'main':
                            showNotification(
                                'Добавление элементов в главный алгоритм не предусмотрено.',
                                'info',
                            );
                            break;
                        default:
                            console.warn(
                                `Alt+N: Неизвестная или неподдерживаемая секция '${State.currentSection}'.`,
                            );
                            showNotification(
                                'Добавление для текущей секции не поддерживается.',
                                'warning',
                            );
                    }
                    if (addFunctionN) {
                        if (typeof addFunctionN === 'function') {
                            console.log(
                                `[Hotkey Alt+N] Вызов функции ${functionNameN} с аргументом:`,
                                functionArgN,
                            );
                            addFunctionN(functionArgN);
                        } else {
                            console.error(`Alt+N: Функция ${functionNameN} не найдена!`);
                            showNotification(
                                `Ошибка: Функция добавления для секции ${State.currentSection} недоступна.`,
                                'error',
                            );
                        }
                    }
                    return;
                }
                break;

            case 'KeyT': // Alt + T
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyT');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: смена темы');
                    const themeToggleBtn = document.getElementById('themeToggle');
                    if (themeToggleBtn) {
                        themeToggleBtn.click();
                    } else {
                        console.warn('Alt+T: Кнопка темы не найдена.');
                        showNotification('Кнопка темы не найдена', 'error');
                    }
                    return;
                }
                break;

            case 'KeyS': // Alt + Shift + S (Экспорт)
                if (shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + Shift + KeyS (Экспорт)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log(
                        '[Hotkey]   > Выполнение действия: экспорт данных (отложенный вызов)',
                    );
                    if (typeof exportAllData === 'function') {
                        console.log(
                            '[Hotkey]     -> Планирование вызова exportAllData() через setTimeout(0)...',
                        );
                        setTimeout(() => {
                            console.log(
                                '[Hotkey]     -> Выполняется exportAllData() из setTimeout.',
                            );
                            try {
                                exportAllData();
                            } catch (exportError) {
                                console.error(
                                    '!!! Ошибка ВНУТРИ exportAllData() при вызове из хоткея:',
                                    exportError,
                                );
                                showNotification('Произошла ошибка во время экспорта.', 'error');
                            }
                        }, 0);
                    } else {
                        console.warn('Alt+Shift+S: Функция exportAllData не найдена.');
                        showNotification('Функция экспорта недоступна.', 'error');
                    }
                    return;
                }
                break;

            case 'KeyO': // Alt + Shift + O (Импорт)
                if (shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + Shift + KeyO (Импорт)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: импорт данных');
                    const importFileInput = document.getElementById('importFileInput');
                    if (importFileInput) {
                        importFileInput.click();
                    } else {
                        console.warn('Alt+Shift+O: Поле импорта #importFileInput не найдено.');
                        showNotification('Функция импорта недоступна.', 'error');
                    }
                    return;
                }
                break;
            case 'KeyF': // Alt + F (Фокус на поиск)
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyF (вне поля ввода)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: фокус на поиск');
                    const searchInput = document.getElementById('searchInput');
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    } else {
                        console.warn('Alt+F: Поле поиска не найдено.');
                        showNotification('Поле поиска не найдено', 'warning');
                    }
                    return;
                }
                break;
            case 'KeyI': // Alt + I (Открыть настройки UI)
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyI (вне поля ввода)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: открыть настройки');
                    const customizeUIBtn = document.getElementById('customizeUIBtn');
                    if (customizeUIBtn) {
                        const customizeUIModal = document.getElementById('customizeUIModal');
                        if (customizeUIModal && customizeUIModal.classList.contains('hidden')) {
                            customizeUIBtn.click();
                        } else if (!customizeUIModal) {
                            console.warn('Alt+I: Модальное окно настроек не найдено.');
                            showNotification('Окно настроек не найдено.', 'error');
                        } else {
                            console.log('Alt+I: Окно настроек уже открыто.');
                        }
                    } else {
                        console.warn('Alt+I: Кнопка настроек не найдена.');
                        showNotification('Кнопка настроек не найдена.', 'error');
                    }
                    return;
                }
                break;
            case 'KeyV': // Alt + V (Переключить вид)
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyV (вне поля ввода)');
                    event.preventDefault();
                    event.stopPropagation();

                    const screenshotModalForViewToggle =
                        document.getElementById('screenshotViewerModal');
                    if (
                        screenshotModalForViewToggle &&
                        !screenshotModalForViewToggle.classList.contains('hidden')
                    ) {
                        console.log(
                            '[Hotkey Alt+V]   > Окно просмотра скриншотов активно. Переключаем вид в нем.',
                        );
                        const gridBtn = screenshotModalForViewToggle.querySelector(
                            '#screenshotViewToggleGrid',
                        );
                        const listBtn = screenshotModalForViewToggle.querySelector(
                            '#screenshotViewToggleList',
                        );

                        if (gridBtn && listBtn) {
                            const isGridActive = gridBtn.classList.contains('bg-primary');
                            const buttonToClick = isGridActive ? listBtn : gridBtn;
                            if (buttonToClick) {
                                buttonToClick.click();
                                console.log(
                                    `[Hotkey Alt+V] Имитирован клик по кнопке '${buttonToClick.id}' в окне скриншотов.`,
                                );
                            } else {
                                console.warn(
                                    'Alt+V (Screenshot): Не удалось определить неактивную кнопку для клика.',
                                );
                            }
                        } else {
                            console.warn(
                                'Alt+V (Screenshot): Не найдены кнопки переключения вида в модальном окне.',
                            );
                            showNotification(
                                'Ошибка: Не найдены кнопки вида в окне скриншотов.',
                                'error',
                            );
                        }
                    } else {
                        console.log(
                            '[Hotkey Alt+V]   > Выполнение стандартного действия: переключить вид активной секции',
                        );
                        if (typeof toggleActiveSectionView === 'function') {
                            toggleActiveSectionView();
                        } else {
                            console.warn('Alt+V: Функция toggleActiveSectionView не найдена.');
                            showNotification('Функция переключения вида недоступна.', 'error');
                        }
                    }
                    return;
                }
                break;
        }
    }

    if (ctrlOrMeta && shift && !alt && !isInputFocused) {
        switch (code) {
            case 'KeyD': // Ctrl + Shift + D
                console.log('[Hotkey] Обнаружена комбинация Ctrl + Shift + KeyD');
                event.preventDefault();
                event.stopPropagation();
                console.log('[Hotkey]   > Выполнение действия: сохранить заметки в txt');
                if (typeof exportClientDataToTxt === 'function') {
                    exportClientDataToTxt();
                } else {
                    console.warn('Ctrl+Shift+D: Функция exportClientDataToTxt не найдена.');
                    showNotification('Функция сохранения заметок недоступна.', 'error');
                }
                return;
            case 'Backspace': // Ctrl + Shift + Backspace
                console.log('[Hotkey] Обнаружена комбинация Ctrl + Shift + Backspace');
                event.preventDefault();
                event.stopPropagation();
                console.log('[Hotkey]   > Выполнение действия: очистка заметок клиента');
                const clientNotes = document.getElementById('clientNotes');
                if (clientNotes && clientNotes.value.trim() !== '') {
                    if (confirm('Вы уверены, что хотите очистить поле данных по обращению?')) {
                        if (typeof clearClientData === 'function') {
                            clearClientData();
                        } else {
                            console.warn(
                                'Ctrl+Shift+Backspace: Функция clearClientData не найдена.',
                            );
                            clientNotes.value = '';
                            showNotification(
                                'Поле очищено, но не удалось вызвать стандартную функцию.',
                                'warning',
                            );
                        }
                    }
                } else if (clientNotes) {
                    showNotification('Поле данных по обращению уже пусто.', 'info');
                } else {
                    console.warn('Ctrl+Shift+Backspace: Поле #clientNotes не найдено.');
                }
                return;
            case 'KeyH': // Ctrl + Shift + H
                console.log('[Hotkey] Обнаружена комбинация Ctrl + Shift + KeyH');
                event.preventDefault();
                event.stopPropagation();
                console.log('[Hotkey]   > Выполнение действия: показать окно горячих клавиш');
                const showHotkeysBtn = document.getElementById('showHotkeysBtn');
                if (showHotkeysBtn) {
                    showHotkeysBtn.click();
                } else {
                    console.warn('Ctrl+Shift+H: Кнопка #showHotkeysBtn не найдена.');
                    showNotification(
                        'Не удалось найти кнопку для отображения горячих клавиш.',
                        'error',
                    );
                }
                return;
        }
    }
}

async function showBookmarkDetailModal(bookmarkId) {
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
                                    <button id="${bookmarkDetailModalConfigGlobal.buttonId}" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
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
                    console.log('[bookmarkDetailModal] Close suppressed: file dialog is open');
                    return;
                }
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
                    const otherVisibleModals = getVisibleModals().filter((m) => m.id !== modalId);
                    if (otherVisibleModals.length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                        console.log(
                            `[bookmarkDetailModal Close - BUTTON] overflow-hidden и modal-open сняты с body (через rAF).`,
                        );
                    } else {
                        console.log(
                            `[bookmarkDetailModal Close - BUTTON] overflow-hidden и modal-open НЕ сняты, т.к. есть другие видимые модальные окна (через rAF). Count: ${otherVisibleModals.length}, Other modals:`,
                            otherVisibleModals.map((m) => m.id),
                        );
                    }
                });
            } else if (e.target.closest('#editBookmarkFromDetailBtn')) {
                const currentId = parseInt(currentModal.dataset.currentBookmarkId, 10);
                if (!isNaN(currentId)) {
                    currentModal.classList.add('hidden');

                    requestAnimationFrame(() => {
                        const otherVisibleModals = getVisibleModals().filter(
                            (m) => m.id !== modalId,
                        );
                        if (otherVisibleModals.length === 0) {
                            document.body.classList.remove('overflow-hidden');
                            document.body.classList.remove('modal-open');
                        }
                    });

                    if (typeof showEditBookmarkModal === 'function') {
                        showEditBookmarkModal(currentId);
                    } else {
                        console.error('Функция showEditBookmarkModal не определена!');
                        showNotification('Ошибка: функция редактирования недоступна.', 'error');
                    }
                } else {
                    console.error('Не удалось получить ID закладки для редактирования из dataset');
                    showNotification(
                        'Ошибка: не удалось определить ID для редактирования',
                        'error',
                    );
                }
            }
        });
    }

    const fullscreenBtn = modal.querySelector('#' + bookmarkDetailModalConfigGlobal.buttonId);
    if (fullscreenBtn) {
        if (!fullscreenBtn.dataset.fullscreenListenerAttached) {
            fullscreenBtn.addEventListener('click', () => {
                if (typeof toggleModalFullscreen === 'function') {
                    toggleModalFullscreen(
                        bookmarkDetailModalConfigGlobal.modalId,
                        bookmarkDetailModalConfigGlobal.buttonId,
                        bookmarkDetailModalConfigGlobal.classToggleConfig,
                        bookmarkDetailModalConfigGlobal.innerContainerSelector,
                        bookmarkDetailModalConfigGlobal.contentAreaSelector,
                    );
                } else {
                    console.error('Функция toggleModalFullscreen не найдена!');
                    showNotification(
                        'Ошибка: Функция переключения полноэкранного режима недоступна.',
                        'error',
                    );
                }
            });
            fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
            console.log(
                `Fullscreen listener attached to ${
                    bookmarkDetailModalConfigGlobal.buttonId
                } (modal: ${isNewModal ? 'new' : 'existing'})`,
            );
        }
    } else {
        console.error(
            'Кнопка #' +
                bookmarkDetailModalConfigGlobal.buttonId +
                ' не найдена в модальном окне деталей закладки!',
        );
    }

    const titleEl = modal.querySelector('#bookmarkDetailTitle');
    const textContentEl = modal.querySelector('#bookmarkDetailTextContent');
    const screenshotsContainer = modal.querySelector('#bookmarkDetailScreenshotsContainer');
    const screenshotsGridEl = modal.querySelector('#bookmarkDetailScreenshotsGrid');
    const editButton = modal.querySelector('#editBookmarkFromDetailBtn');
    const favoriteButtonContainer = modal.querySelector('.fav-btn-placeholder-modal-bookmark');

    if (
        !titleEl ||
        !textContentEl ||
        !screenshotsContainer ||
        !screenshotsGridEl ||
        !editButton ||
        !favoriteButtonContainer
    ) {
        console.error('Не найдены необходимые элементы в модальном окне деталей закладки.');
        if (modal) modal.classList.add('hidden');
        return;
    }

    wireBookmarkDetailModalCloseHandler('bookmarkDetailModal');
    modal.dataset.currentBookmarkId = String(bookmarkId);

    const pdfHost =
        modal.querySelector('#bookmarkDetailOuterContent') ||
        modal.querySelector('.flex-1.overflow-y-auto');
    if (pdfHost) {
        window.renderPdfAttachmentsSection?.(pdfHost, 'bookmark', String(bookmarkId));
    }
    titleEl.textContent = 'Загрузка...';
    textContentEl.innerHTML = '<p>Загрузка...</p>';
    screenshotsGridEl.innerHTML = '';
    screenshotsContainer.classList.add('hidden');
    editButton.classList.add('hidden');
    favoriteButtonContainer.innerHTML = '';

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.body.classList.add('modal-open');

    try {
        const bookmark = await getFromIndexedDB('bookmarks', bookmarkId);

        if (bookmark) {
            titleEl.textContent = bookmark.title || 'Без названия';
            const preElement = document.createElement('pre');
            preElement.className = 'whitespace-pre-wrap break-words text-sm font-sans';
            preElement.style.fontSize = '102%';
            preElement.textContent = bookmark.description || 'Нет описания.';
            textContentEl.innerHTML = '';
            textContentEl.appendChild(preElement);

            editButton.classList.remove('hidden');

            const itemType = bookmark.url ? 'bookmark' : 'bookmark_note';
            const isFav = isFavorite(itemType, String(bookmark.id));
            const favButtonHTML = getFavoriteButtonHTML(
                bookmark.id,
                itemType,
                'bookmarks',
                bookmark.title,
                bookmark.description,
                isFav,
            );
            favoriteButtonContainer.innerHTML = favButtonHTML;

            if (bookmark.screenshotIds && bookmark.screenshotIds.length > 0) {
                console.log(
                    `Загрузка ${bookmark.screenshotIds.length} скриншотов для деталей закладки ${bookmarkId}...`,
                );
                screenshotsContainer.classList.remove('hidden');
                screenshotsGridEl.innerHTML =
                    '<p class="col-span-full text-xs text-gray-500">Загрузка скриншотов...</p>';

                try {
                    const allParentScreenshots = await getAllFromIndex(
                        'screenshots',
                        'parentId',
                        bookmarkId,
                    );
                    const bookmarkScreenshots = allParentScreenshots.filter(
                        (s) => s.parentType === 'bookmark',
                    );

                    if (bookmarkScreenshots.length > 0) {
                        if (typeof renderScreenshotThumbnails === 'function') {
                            renderScreenshotThumbnails(
                                screenshotsGridEl,
                                bookmarkScreenshots,
                                openLightbox,
                            );
                            console.log(
                                `Отрисовано ${bookmarkScreenshots.length} миниатюр в деталях закладки.`,
                            );
                        } else {
                            console.error('Функция renderScreenshotThumbnails не найдена!');
                            screenshotsGridEl.innerHTML =
                                '<p class="col-span-full text-red-500 text-xs">Ошибка рендеринга скриншотов.</p>';
                        }
                    } else {
                        screenshotsGridEl.innerHTML = '';
                        screenshotsContainer.classList.add('hidden');
                        console.log(
                            "Скриншоты не найдены в БД (по parentType='bookmark'), хотя ID были в закладке.",
                        );
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
                console.log('Скриншоты для деталей закладки отсутствуют.');
            }
        } else {
            titleEl.textContent = 'Ошибка';
            textContentEl.innerHTML = `<p class="text-red-500">Не удалось загрузить данные закладки (ID: ${bookmarkId}). Возможно, она была удалена.</p>`;
            showNotification('Закладка не найдена', 'error');
            editButton.classList.add('hidden');
            screenshotsContainer.classList.add('hidden');
        }
    } catch (error) {
        console.error('Ошибка при загрузке деталей закладки:', error);
        titleEl.textContent = 'Ошибка загрузки';
        textContentEl.innerHTML =
            '<p class="text-red-500">Произошла ошибка при загрузке данных.</p>';
        showNotification('Ошибка загрузки деталей закладки', 'error');
        editButton.classList.add('hidden');
        screenshotsContainer.classList.add('hidden');
    }
}

// getCurrentBookmarkFormState - imported from js/components/bookmarks.js

function initHotkeysModal() {
    const showHotkeysBtn = document.getElementById('showHotkeysBtn');
    const hotkeysModal = document.getElementById('hotkeysModal');
    const closeHotkeysModalBtn = document.getElementById('closeHotkeysModalBtn');
    const okHotkeysModalBtn = document.getElementById('okHotkeysModalBtn');
    const fullscreenBtn = document.getElementById('toggleFullscreenHotkeysBtn');

    if (
        !showHotkeysBtn ||
        !hotkeysModal ||
        !closeHotkeysModalBtn ||
        !okHotkeysModalBtn ||
        !fullscreenBtn
    ) {
        console.warn(
            'Не найдены все элементы для модального окна горячих клавиш ' +
                '(#showHotkeysBtn, #hotkeysModal, #closeHotkeysModalBtn, #okHotkeysModalBtn, #toggleFullscreenHotkeysBtn). ' +
                'Функциональность может быть нарушена.',
        );
        return;
    }

    if (hotkeysModal._escapeHandlerInstance) {
        document.removeEventListener('keydown', hotkeysModal._escapeHandlerInstance);
        delete hotkeysModal._escapeHandlerInstance;
    }

    const handleEscapeKeyInternal = (event) => {
        if (event.key === 'Escape') {
            if (hotkeysModal && !hotkeysModal.classList.contains('hidden')) {
                const visibleModals = getVisibleModals();
                const topmostModal =
                    visibleModals.length > 0 ? getTopmostModal(visibleModals) : null;
                if (topmostModal && topmostModal.id !== hotkeysModal.id) {
                    console.log(
                        `[HotkeysModal Escape] Event not handled, topmost is ${topmostModal.id}`,
                    );
                    return;
                }

                closeModalInternal();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        }
    };

    const openModal = () => {
        if (!hotkeysModal) return;
        hotkeysModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (hotkeysModal._escapeHandlerInstance) {
            document.removeEventListener('keydown', hotkeysModal._escapeHandlerInstance);
        }
        hotkeysModal._escapeHandlerInstance = handleEscapeKeyInternal;
        document.addEventListener('keydown', hotkeysModal._escapeHandlerInstance);
        console.log('Hotkey modal opened, Escape listener added.');
    };

    const closeModalInternal = () => {
        if (!hotkeysModal) return;
        hotkeysModal.classList.add('hidden');
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('overflow-hidden');
        }
        if (hotkeysModal._escapeHandlerInstance) {
            document.removeEventListener('keydown', hotkeysModal._escapeHandlerInstance);
            delete hotkeysModal._escapeHandlerInstance;
        }
        console.log('Hotkey modal closed, Escape listener removed.');
    };

    if (!showHotkeysBtn.dataset.listenerAttached) {
        showHotkeysBtn.addEventListener('click', openModal);
        showHotkeysBtn.dataset.listenerAttached = 'true';
    }

    if (!closeHotkeysModalBtn.dataset.listenerAttached) {
        closeHotkeysModalBtn.addEventListener('click', closeModalInternal);
        closeHotkeysModalBtn.dataset.listenerAttached = 'true';
    }
    if (!okHotkeysModalBtn.dataset.listenerAttached) {
        okHotkeysModalBtn.addEventListener('click', closeModalInternal);
        okHotkeysModalBtn.dataset.listenerAttached = 'true';
    }

    if (!hotkeysModal.dataset.overlayListenerAttached) {
        hotkeysModal.addEventListener('click', (event) => {
            if (event.target === hotkeysModal) {
                closeModalInternal();
            }
        });
        hotkeysModal.dataset.overlayListenerAttached = 'true';
    }

    if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
        fullscreenBtn.addEventListener('click', () => {
            if (typeof toggleModalFullscreen === 'function') {
                toggleModalFullscreen(
                    hotkeysModalConfig.modalId,
                    hotkeysModalConfig.buttonId,
                    hotkeysModalConfig.classToggleConfig,
                    hotkeysModalConfig.innerContainerSelector,
                    hotkeysModalConfig.contentAreaSelector,
                );
            } else {
                console.error('Функция toggleModalFullscreen не найдена!');
                showNotification(
                    'Ошибка: Функция переключения полноэкранного режима недоступна.',
                    'error',
                );
            }
        });
        fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
        console.log(`Fullscreen listener attached to ${hotkeysModalConfig.buttonId}`);
    }

    console.log('Модальное окно горячих клавиш инициализировано.');
}

// Wrapper для модуля Lightbox
function showImageAtIndex(index, blobs, stateManager, elements) {
    return showImageAtIndexModule(index, blobs, stateManager, elements);
}

// Wrapper для модуля Lightbox
function openLightbox(blobs, initialIndex) {
    return openLightboxModule(blobs, initialIndex);
}


// Wrapper для модуля Screenshots
async function handleViewScreenshotClick(event) {
    return handleViewScreenshotClickModule(event);
}

async function addBookmarkToDOM(bookmarkData) {
    const bookmarksContainer = document.getElementById('bookmarksContainer');
    if (!bookmarksContainer) {
        console.error('addBookmarkToDOM: Контейнер #bookmarksContainer не найден.');
        return;
    }

    const noBookmarksMsg = bookmarksContainer.querySelector('.col-span-full.text-center');
    if (noBookmarksMsg) {
        noBookmarksMsg.remove();
        if (bookmarksContainer.classList.contains('flex-col')) {
            bookmarksContainer.classList.remove('flex', 'flex-col');
            if (!bookmarksContainer.classList.contains('grid')) {
                const gridColsClasses =
                    SECTION_GRID_COLS.bookmarksContainer || SECTION_GRID_COLS.default;
                bookmarksContainer.classList.add(...CARD_CONTAINER_CLASSES, ...gridColsClasses);
                console.log("Восстановлены классы grid после удаления сообщения 'нет закладок'");
            }
        }
    }

    const newElement = await createBookmarkElement(bookmarkData);
    if (!newElement) {
        console.error(
            'addBookmarkToDOM: Не удалось создать DOM-элемент для закладки:',
            bookmarkData,
        );
        return;
    }

    bookmarksContainer.appendChild(newElement);
    console.log(`Закладка ID ${bookmarkData.id} добавлена в DOM.`);

    applyCurrentView('bookmarksContainer');
}

const closeModalOnEscapeWithPropagationStop = (event, modalIdToClose) => {
    const modalElement = document.getElementById(modalIdToClose);
    if (!modalElement || modalElement.classList.contains('hidden')) {
        return;
    }

    if (event.key === 'Escape') {
        const visibleModals = getVisibleModals();
        const topmostModal = visibleModals.length > 0 ? getTopmostModal(visibleModals) : null;

        if (topmostModal && topmostModal.id !== modalIdToClose) {
            console.log(
                `[closeModalOnEscapeWPS] Escape для #${modalIdToClose}, но активное окно #${topmostModal.id}. Не закрываем.`,
            );
            return;
        }

        console.log(
            `[closeModalOnEscapeWPS] Закрытие модального окна #${modalIdToClose} по Escape.`,
        );
        modalElement.classList.add('hidden');

        if (modalElement._escapeHandler) {
            document.removeEventListener('keydown', modalElement._escapeHandler);
            delete modalElement._escapeHandler;
        }

        if (modalIdToClose === 'bookmarkDetailModal') {
            const images = modalElement.querySelectorAll(
                '#bookmarkDetailScreenshotsGrid img[data-object-url]',
            );
            images.forEach((img) => {
                if (img.dataset.objectUrl) {
                    try {
                        URL.revokeObjectURL(img.dataset.objectUrl);
                    } catch (revokeError) {
                        console.warn(
                            `Ошибка отзыва URL при закрытии ${modalIdToClose}:`,
                            revokeError,
                        );
                    }
                    delete img.dataset.objectUrl;
                }
            });
        }

        if (getVisibleModals().length === 0) {
            document.body.classList.remove('overflow-hidden');
        }

        event.stopPropagation();
        event.stopImmediatePropagation();
    }
};

async function updateBookmarkInDOM(bookmarkData) {
    const bookmarksContainer = document.getElementById('bookmarksContainer');
    if (!bookmarksContainer || !bookmarkData || typeof bookmarkData.id === 'undefined') {
        console.error('updateBookmarkInDOM: Неверные аргументы или контейнер не найден.');
        return;
    }

    const existingElement = bookmarksContainer.querySelector(
        `.bookmark-item[data-id="${bookmarkData.id}"]`,
    );
    if (!existingElement) {
        console.warn(
            `updateBookmarkInDOM: Не найден элемент закладки с ID ${bookmarkData.id} для обновления в DOM.`,
        );
        await addBookmarkToDOM(bookmarkData);
        return;
    }

    const newElement = await createBookmarkElement(bookmarkData);
    if (!newElement) {
        console.error(
            `updateBookmarkInDOM: Не удалось создать обновленный элемент для закладки ID ${bookmarkData.id}.`,
        );
        return;
    }

    existingElement.replaceWith(newElement);
    console.log(`Закладка ID ${bookmarkData.id} обновлена в DOM.`);

    applyCurrentView('bookmarksContainer');
}

async function removeBookmarkFromDOM(bookmarkId) {
    const bookmarksContainer = document.getElementById('bookmarksContainer');
    if (!bookmarksContainer) {
        console.error('removeBookmarkFromDOM: Контейнер #bookmarksContainer не найден.');
        try {
            const removed = await removeFromFavoritesDB('bookmark', bookmarkId);
            if (removed) {
                if (Array.isArray(State.currentFavoritesCache)) {
                    State.currentFavoritesCache = State.currentFavoritesCache.filter(
                        (f) =>
                            !(
                                f.itemType === 'bookmark' &&
                                String(f.originalItemId) === String(bookmarkId)
                            ),
                    );
                }
                if (typeof updateFavoriteStatusUI === 'function') {
                    await updateFavoriteStatusUI(bookmarkId, 'bookmark', false);
                }
                if (typeof State.currentSection !== 'undefined' && State.currentSection === 'favorites') {
                    if (typeof renderFavoritesPage === 'function') {
                        await renderFavoritesPage();
                    }
                } else {
                    const favCard = document.querySelector(
                        `.favorite-item[data-item-type="bookmark"][data-original-item-id="${String(
                            bookmarkId,
                        )}"]`,
                    );
                    if (favCard) favCard.remove();
                    const favContainer = document.getElementById('favoritesContainer');
                    if (favContainer && !favContainer.querySelector('.favorite-item')) {
                        favContainer.innerHTML =
                            '<p class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">В избранном пока ничего нет.</p>';
                    }
                }
            }
        } catch (e) {
            console.warn('removeBookmarkFromDOM: ошибка синхронизации с избранным:', e);
        }
        return;
    }

    const itemToRemove = bookmarksContainer.querySelector(
        `.bookmark-item[data-id="${bookmarkId}"]`,
    );
    if (itemToRemove) {
        itemToRemove.remove();
        console.log(`Удален элемент закладки ${bookmarkId} из DOM.`);

        if (!bookmarksContainer.querySelector('.bookmark-item')) {
            bookmarksContainer.innerHTML =
                '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных закладок</div>';
            console.log('Контейнер закладок пуст, добавлено сообщение.');
        }
        applyCurrentView('bookmarksContainer');
    } else {
        console.warn(
            `removeBookmarkFromDOM: Элемент закладки ${bookmarkId} не найден в DOM для удаления.`,
        );
    }
    try {
        const removed = await removeFromFavoritesDB('bookmark', bookmarkId);
        if (removed) {
            if (Array.isArray(State.currentFavoritesCache)) {
                State.currentFavoritesCache = State.currentFavoritesCache.filter(
                    (f) =>
                        !(
                            f.itemType === 'bookmark' &&
                            String(f.originalItemId) === String(bookmarkId)
                        ),
                );
            }
            if (typeof updateFavoriteStatusUI === 'function') {
                await updateFavoriteStatusUI(bookmarkId, 'bookmark', false);
            }
            if (typeof State.currentSection !== 'undefined' && State.currentSection === 'favorites') {
                if (typeof renderFavoritesPage === 'function') {
                    await renderFavoritesPage();
                }
            } else {
                const favCard = document.querySelector(
                    `.favorite-item[data-item-type="bookmark"][data-original-item-id="${String(
                        bookmarkId,
                    )}"]`,
                );
                if (favCard) favCard.remove();
                const favContainer = document.getElementById('favoritesContainer');
                if (favContainer && !favContainer.querySelector('.favorite-item')) {
                    favContainer.innerHTML =
                        '<p class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">В избранном пока ничего нет.</p>';
                }
            }
        }
    } catch (e) {
        console.warn('removeBookmarkFromDOM: ошибка синхронизации с избранным:', e);
    }
}

// Wrapper для модуля step-management.js
function attachStepDeleteHandler(
    deleteButton,
    stepElement,
    containerElement,
    section,
    mode = 'edit',
) {
    return attachStepDeleteHandlerModule(deleteButton, stepElement, containerElement, section, mode);
}

// Wrapper для модуля step-management.js
function updateStepNumbers(containerElement) {
    return updateStepNumbersModule(containerElement);
}

// Wrapper для модуля helpers.js
function deepEqual(obj1, obj2) {
    return deepEqualModule(obj1, obj2);
}

// Wrapper для модуля modal.js
function openAnimatedModal(modalElement) {
    return openAnimatedModalModule(modalElement);
}

// Wrapper для модуля modal.js
function closeAnimatedModal(modalElement) {
    return closeAnimatedModalModule(modalElement);
}

closeModalBtn?.addEventListener('click', () => closeAnimatedModal(algorithmModal));

editMainBtn?.addEventListener('click', async () => {
    if (typeof editAlgorithm === 'function') {
        await editAlgorithm('main');
    } else {
        console.error('Функция editAlgorithm не найдена для кнопки editMainBtn');
    }
});

const exportMainBtn = document.getElementById('exportMainBtn');
if (exportMainBtn) {
    exportMainBtn.addEventListener('click', () => {
        const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
        const mainTitleElement = document.querySelector('#mainContent h2');
        const title = mainTitleElement ? mainTitleElement.textContent : 'Главная';
        ExportService.exportElementToPdf(mainAlgorithmContainer, title);
    });
}

async function showAddModal(section) {
    initialAddState = null;

    const addModal = document.getElementById('addModal');
    const addModalTitle = document.getElementById('addModalTitle');
    const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
    const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
    const newStepsContainerElement = document.getElementById('newSteps');
    const saveButton = document.getElementById('saveNewAlgorithmBtn');

    if (
        !addModal ||
        !addModalTitle ||
        !newAlgorithmTitle ||
        !newAlgorithmDesc ||
        !newStepsContainerElement ||
        !saveButton
    ) {
        console.error('showAddModal (v2 - Collapse): Отсутствуют необходимые элементы.');
        return;
    }

    const actionsContainer = addModal.querySelector('.flex.justify-end.items-center');
    if (actionsContainer && !actionsContainer.querySelector('.collapse-all-btn')) {
        const collapseControls = document.createElement('div');
        collapseControls.className = 'mr-auto';
        collapseControls.innerHTML = `
            <button type="button" class="collapse-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300">Свернуть все</button>
            <button type="button" class="expand-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 ml-1">Развернуть все</button>
        `;
        actionsContainer.insertBefore(collapseControls, actionsContainer.firstChild);

        actionsContainer.querySelector('.collapse-all-btn').addEventListener('click', () => {
            newStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => toggleStepCollapse(step, true));
        });
        actionsContainer.querySelector('.expand-all-btn').addEventListener('click', () => {
            newStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => toggleStepCollapse(step, false));
        });
    }

    addModalTitle.textContent = 'Новый алгоритм для раздела: ' + getSectionName(section);
    newAlgorithmTitle.value = '';
    newAlgorithmDesc.value = '';
    newStepsContainerElement.innerHTML = '';

    addNewStep(true);

    addModal.dataset.section = section;
    saveButton.disabled = false;
    saveButton.innerHTML = 'Сохранить';

    initStepSorting(newStepsContainerElement);
    captureInitialAddState();
    openAnimatedModal(addModal);

    setTimeout(() => newAlgorithmTitle.focus(), 50);
    console.log(`showAddModal (v2 - Collapse): Окно для секции '${section}' открыто.`);
}

// ============================================================================
// BLACKLIST SYSTEM - MIGRATED to js/features/blacklist.js
// ============================================================================
// All blacklist-related functions are now imported from the blacklist module.
// See: js/features/blacklist.js
// Wrapper functions below maintain backward compatibility.

function initBlacklistSystem() {
    return initBlacklistSystemModule();
}

async function exportBlacklistToExcel() {
    return exportBlacklistToExcelModule();
}

async function loadBlacklistedClients() {
    return loadBlacklistedClientsModule();
}

async function handleBlacklistSearchInput() {
    return handleBlacklistSearchInputModule();
}

function renderBlacklistTable(entries) {
    return renderBlacklistTableModule(entries);
}

async function getBlacklistEntriesByInn(inn) {
    return getBlacklistEntriesByInnModule(inn);
}

function handleBlacklistActionClick(event) {
    return handleBlacklistActionClickModule(event);
}

async function showBlacklistDetailModal(entryId) {
    return showBlacklistDetailModalModule(entryId);
}

async function showBlacklistEntryModal(entryId = null) {
    return showBlacklistEntryModalModule(entryId);
}

async function handleSaveBlacklistEntry(event) {
    return handleSaveBlacklistEntryModule(event);
}

async function deleteBlacklistEntry(entryId) {
    return deleteBlacklistEntryModule(entryId);
}

async function addBlacklistEntryDB(entry) {
    return addBlacklistEntryDBModule(entry);
}

async function getBlacklistEntryDB(id) {
    return getBlacklistEntryDBModule(id);
}

async function updateBlacklistEntryDB(entry) {
    return updateBlacklistEntryDBModule(entry);
}

async function deleteBlacklistEntryDB(id) {
    return deleteBlacklistEntryDBModule(id);
}

async function getAllBlacklistEntriesDB() {
    return getAllBlacklistEntriesDBModule();
}

function showBlacklistWarning() {
    return showBlacklistWarningModule();
}


function applyClientNotesFontSize() {
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes && State.userPreferences && typeof State.userPreferences.clientNotesFontSize === 'number') {
        const fontSize = State.userPreferences.clientNotesFontSize;
        clientNotes.style.fontSize = `${fontSize}%`;
        console.log(`[applyClientNotesFontSize] Font size for client notes set to ${fontSize}%.`);
    } else {
        if (!clientNotes)
            console.warn(
                '[applyClientNotesFontSize] Could not apply font size: #clientNotes element not found.',
            );
        if (!State.userPreferences || typeof State.userPreferences.clientNotesFontSize !== 'number') {
            console.warn(
                '[applyClientNotesFontSize] Could not apply font size: State.userPreferences.clientNotesFontSize is missing or invalid.',
            );
        }
    }
}

async function initClientDataSystem() {
    ensureInnPreviewStyles();
    const LOG_PREFIX = '[ClientDataSystem]';
    console.log(`${LOG_PREFIX} Запуск инициализации...`);

    const clientNotes = document.getElementById('clientNotes');
    if (!clientNotes) {
        console.error(
            `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: поле для заметок #clientNotes не найдено. Система не будет работать.`,
        );
        return;
    }
    console.log(`${LOG_PREFIX} Поле #clientNotes успешно найдено.`);

    const clearClientDataBtn = document.getElementById('clearClientDataBtn');
    if (!clearClientDataBtn) {
        console.warn(`${LOG_PREFIX} Кнопка #clearClientDataBtn не найдена.`);
    }

    const buttonContainer = clearClientDataBtn?.parentNode;
    if (!buttonContainer) {
        console.warn(
            `${LOG_PREFIX} Родительский контейнер для кнопок управления данными клиента не найден.`,
        );
    }

    if (State.clientNotesInputHandler) {
        clientNotes.removeEventListener('input', State.clientNotesInputHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'input' удален.`);
    }
    if (State.clientNotesKeydownHandler) {
        clientNotes.removeEventListener('keydown', State.clientNotesKeydownHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keydown' удален.`);
    }

    if (State.clientNotesCtrlClickHandler) {
        clientNotes.removeEventListener('mousedown', State.clientNotesCtrlClickHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'click' (Ctrl+Click INN) удален.`);
    }
    if (State.clientNotesBlurHandler) {
        clientNotes.removeEventListener('blur', State.clientNotesBlurHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'blur' (сброс курсора) удален.`);
    }
    if (State.clientNotesCtrlKeyDownHandler) {
        document.removeEventListener('keydown', State.clientNotesCtrlKeyDownHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keydown' (Ctrl cursor) удален.`);
    }
    if (State.clientNotesCtrlKeyUpHandler) {
        document.removeEventListener('keyup', State.clientNotesCtrlKeyUpHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keyup' (Ctrl cursor) удален.`);
    }

    if (window.__clientNotesInnPreviewInputHandler) {
        clientNotes.removeEventListener('input', window.__clientNotesInnPreviewInputHandler);
        window.__clientNotesInnPreviewInputHandler = null;
        console.log(`${LOG_PREFIX} Старый обработчик 'input' (ИНН-превью) удален.`);
    }
    if (
        window.__clientNotesInnPreview &&
        typeof window.__clientNotesInnPreview.destroy === 'function'
    ) {
        window.__clientNotesInnPreview.destroy();
        window.__clientNotesInnPreview = null;
        console.log(`${LOG_PREFIX} Старое ИНН-превью уничтожено.`);
    }

    State.clientNotesInputHandler = debounce(async () => {
        try {
            console.log(`${LOG_PREFIX} Debounce-таймер сработал. Выполняем действия...`);
            const currentText = clientNotes.value;

            console.log(`${LOG_PREFIX}   -> Вызов await saveClientData()`);
            await saveClientData();

            console.log(`${LOG_PREFIX}   -> Вызов await checkForBlacklistedInn()`);
            await checkForBlacklistedInn(currentText);
        } catch (error) {
            console.error(`${LOG_PREFIX} Ошибка внутри debounced-обработчика:`, error);
        }
    }, 750);

    clientNotes.addEventListener('input', State.clientNotesInputHandler);
    console.log(`${LOG_PREFIX} Новый обработчик 'input' с debounce и await успешно привязан.`);

    State.clientNotesKeydownHandler = (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            const textarea = event.target;
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const textBeforeCursor = value.substring(0, start);
            const regex = /(?:^|\n)\s*(\d+)([).])\s/g;
            let lastNum = 0;
            let delimiter = ')';
            let match;
            while ((match = regex.exec(textBeforeCursor)) !== null) {
                const currentNum = parseInt(match[1], 10);
                if (currentNum >= lastNum) {
                    lastNum = currentNum;
                    delimiter = match[2];
                }
            }
            const nextNum = lastNum + 1;
            let prefix = '\n\n';
            if (start === 0) {
                prefix = '';
            } else {
                const charBefore = value.substring(start - 1, start);
                if (charBefore === '\n') {
                    if (start >= 2 && value.substring(start - 2, start) === '\n\n') {
                        prefix = '';
                    } else {
                        prefix = '\n';
                    }
                }
            }
            const insertionText = prefix + nextNum + delimiter + ' ';
            textarea.value = value.substring(0, start) + insertionText + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + insertionText.length;
            textarea.scrollTop = textarea.scrollHeight;
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    };
    clientNotes.addEventListener('keydown', State.clientNotesKeydownHandler);
    console.log(`${LOG_PREFIX} Обработчик 'keydown' (Ctrl+Enter) успешно привязан.`);

    function getInnAtCursor(ta) {
        const text = ta.value || '';
        const n = text.length;
        const isDigit = (ch) => ch >= '0' && ch <= '9';
        const basePos = ta.selectionStart ?? 0;
        console.log(`[getInnAtCursor] Base position (selectionStart): ${basePos}`);
        const candidates = [basePos, basePos - 1, basePos + 1, basePos - 2, basePos + 2];
        for (const p of candidates) {
            if (p < 0 || p >= n) continue;
            if (!isDigit(text[p])) continue;
            let l = p,
                r = p + 1;
            while (l > 0 && isDigit(text[l - 1])) l--;
            while (r < n && isDigit(text[r])) r++;
            const token = text.slice(l, r);
            if (token.length === 10 || token.length === 12) {
                console.log(`[getInnAtCursor] Found valid INN: "${token}" at [${l}, ${r}]`);
                return { inn: token, start: l, end: r };
            }
        }
        console.log(`[getInnAtCursor] No INN found at position ${basePos}.`);
        return null;
    }

    const clientNotesCtrlMouseDownHandler = async (event) => {
        console.log(
            `[ClientNotes Handler] Event triggered: ${event.type}. Ctrl/Meta: ${
                event.ctrlKey || event.metaKey
            }`,
        );
        if (!(event.ctrlKey || event.metaKey)) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        if (!__acquireCopyLock(250)) return;

        await new Promise((resolve) => setTimeout(resolve, 0));

        console.log(
            `[ClientNotes Handler] Before getInnAtCursor: selectionStart=${clientNotes.selectionStart}, selectionEnd=${clientNotes.selectionEnd}`,
        );
        const hit = getInnAtCursor(clientNotes);

        if (!hit) {
            console.log('[ClientNotes Handler] INN not found, handler exits without action.');
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        try {
            clientNotes.setSelectionRange(hit.start, hit.end);
            await copyToClipboard(hit.inn, `ИНН ${hit.inn} скопирован!`);
        } catch (e) {
            console.error('[ClientDataSystem] Ошибка копирования ИНН по Ctrl+MouseDown:', e);
        }
    };

    clientNotes.addEventListener('mousedown', clientNotesCtrlMouseDownHandler);
    State.clientNotesCtrlClickHandler = clientNotesCtrlMouseDownHandler;
    console.log(`${LOG_PREFIX} Обработчик 'mousedown' (Ctrl+Click INN→copy) привязан.`);

    State.clientNotesCtrlKeyDownHandler = (e) => {
        const isClientNotesFocused = document.activeElement === clientNotes;
        const ctrlOrMeta = e.ctrlKey || e.metaKey;
        if (ctrlOrMeta && isClientNotesFocused) {
            ensureInnPreviewStyles();
            if (!window.__clientNotesInnPreview) {
                window.__clientNotesInnPreview = createClientNotesInnPreview(clientNotes);
            }
            const p = window.__clientNotesInnPreview;
            p.show();
            p.update();
            if (!window.__clientNotesInnPreviewInputHandler) {
                window.__clientNotesInnPreviewInputHandler = () => {
                    if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.update();
                };
                clientNotes.addEventListener('input', window.__clientNotesInnPreviewInputHandler);
            }
        }
    };
    State.clientNotesCtrlKeyUpHandler = (e) => {
        if (!e.ctrlKey && !e.metaKey) {
            clientNotes.style.cursor = '';
            if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.hide();
        }
    };
    State.clientNotesBlurHandler = () => {
        clientNotes.style.cursor = '';
        if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.hide();
    };
    document.addEventListener('keydown', State.clientNotesCtrlKeyDownHandler);
    document.addEventListener('keyup', State.clientNotesCtrlKeyUpHandler);
    clientNotes.addEventListener('blur', State.clientNotesBlurHandler);
    console.log(`${LOG_PREFIX} Индикация курсора при Ctrl/Meta активирована.`);

    if (clearClientDataBtn) {
        clearClientDataBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите очистить все данные по обращению?')) {
                clearClientData();
            }
        });
    }

    if (buttonContainer) {
        const existingExportBtn = document.getElementById('exportTextBtn');
        if (!existingExportBtn) {
            const exportTextBtn = document.createElement('button');
            exportTextBtn.id = 'exportTextBtn';
            exportTextBtn.innerHTML = `<i class="fas fa-file-download"></i><span class="hidden lg:inline lg:ml-1">Сохранить .txt</span>`;
            exportTextBtn.className = `p-2 lg:px-3 lg:py-1.5 text-white rounded-md transition text-sm flex items-center border-b`;
            exportTextBtn.title = 'Сохранить заметки как .txt файл';
            exportTextBtn.addEventListener('click', exportClientDataToTxt);
            buttonContainer.appendChild(exportTextBtn);
        }
    }

    try {
        console.log(`${LOG_PREFIX} Загрузка начальных данных для clientNotes...`);
        let clientDataNotesValue = '';
        if (State.db) {
            const clientDataFromDB = await getFromIndexedDB('clientData', 'current');
            if (clientDataFromDB && clientDataFromDB.notes) {
                clientDataNotesValue = clientDataFromDB.notes;
            }
        } else {
            const localData = localStorage.getItem('clientData');
            if (localData) {
                try {
                    clientDataNotesValue = JSON.parse(localData).notes || '';
                } catch (e) {
                    console.warn(
                        '[initClientDataSystem] Ошибка парсинга clientData из localStorage:',
                        e,
                    );
                }
            }
        }
        clientNotes.value = clientDataNotesValue;
        console.log(`${LOG_PREFIX} Данные загружены. clientNotes.value установлен.`);

        applyClientNotesFontSize();
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке данных клиента:`, error);
    }

    console.log(`${LOG_PREFIX} Инициализация системы данных клиента полностью завершена.`);
    ensureBodyScrollUnlocked();
}

function ensureInnPreviewStyles() {
    if (document.getElementById('innPreviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'innPreviewStyles';
    style.textContent = `
    .client-notes-preview{
        position: absolute;
        --inn-offset-x: -0.4px;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: transparent;
        pointer-events: none;
        z-index: 2;
    }
    .client-notes-preview::-webkit-scrollbar{
        width: 0; height: 0; display: none;
    }
        .client-notes-preview__inner{
        position: relative;
        will-change: transform;
    }
    .client-notes-preview .inn-highlight{
        color: var(--color-primary, #7aa2ff) !important;
        text-decoration: underline;
        text-decoration-color: var(--color-primary);
        text-decoration-thickness: .1em;
        text-underline-offset: .12em;
        text-decoration-skip-ink: auto;
        /* НИЧЕГО, что меняет метрики инлайна */
        display: inline;
        padding: 0;
        margin: 0;
    }
 
  `;
    document.head.appendChild(style);
}

function createClientNotesInnPreview(textarea) {
    const wrapper = textarea.parentElement;
    try {
        const ws = getComputedStyle(wrapper);
        if (ws.position === 'static') wrapper.style.position = 'relative';
    } catch (_) {}

    const preview = document.createElement('div');
    preview.className = 'client-notes-preview';
    preview.style.display = 'none';
    const inner = document.createElement('div');
    inner.className = 'client-notes-preview__inner';
    preview.appendChild(inner);
    wrapper.appendChild(preview);

    const posOverlay = () => {
        const tr = textarea.getBoundingClientRect();
        const wr = wrapper.getBoundingClientRect();
        const left = tr.left - wr.left + wrapper.scrollLeft;
        const top = tr.top - wr.top + wrapper.scrollTop;
        preview.style.left = `${left}px`;
        preview.style.top = `${top}px`;
        preview.style.width = `${textarea.clientWidth}px`;
        preview.style.height = `${textarea.clientHeight}px`;
    };

    const getOffsetX = () => {
        const v = getComputedStyle(preview).getPropertyValue('--inn-offset-x').trim();
        return v ? parseFloat(v) : 0;
    };

    const computeUsedLineHeightPx = () => {
        const cs = getComputedStyle(textarea);
        if (cs.lineHeight && cs.lineHeight !== 'normal') return cs.lineHeight;
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'pre-wrap';
        probe.style.font =
            cs.font ||
            `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.ontFamily}`;
        probe.style.letterSpacing = cs.letterSpacing;
        probe.textContent = 'A\nA';
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height / 2;
        document.body.removeChild(probe);
        return `${h}px`;
    };

    const syncMetrics = () => {
        const cs = getComputedStyle(textarea);
        preview.style.font = cs.font;
        preview.style.lineHeight = computeUsedLineHeightPx();
        preview.style.lineHeight = cs.lineHeight;
        preview.style.letterSpacing = cs.letterSpacing;
        preview.style.textAlign = cs.textAlign;
        preview.style.borderRadius = cs.borderRadius;
        preview.style.boxSizing = cs.boxSizing;
        preview.style.color = 'transparent';
        preview.style.paddingTop = cs.paddingTop;
        preview.style.paddingRight = cs.paddingRight;
        preview.style.paddingBottom = cs.paddingBottom;
        preview.style.paddingLeft = cs.paddingLeft;
        posOverlay();
    };

    const update = () => {
        const text = textarea.value || '';
        const escaped =
            typeof escapeHtml === 'function'
                ? escapeHtml(text)
                : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const rx = /(^|\D)(\d{10}|\d{12})(?!\d)/g;
        inner.innerHTML = escaped.replace(rx, '$1<span class="inn-highlight">$2</span>');
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
        posOverlay();
    };

    const onScroll = () => {
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
    };
    textarea.addEventListener('scroll', onScroll);
    window.addEventListener('resize', () => {
        syncMetrics();
    });
    syncMetrics();

    return {
        show() {
            textarea.style.cursor = 'pointer';
            preview.style.display = '';
            syncMetrics();
            ensureBodyScrollUnlocked();
        },
        hide() {
            textarea.style.cursor = '';
            preview.style.display = 'none';
            ensureBodyScrollUnlocked();
        },
        update,
        destroy() {
            textarea.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', syncMetrics);
            preview.remove();
        },
    };
}

function ensureBodyScrollUnlocked() {
    try {
        const hasVisibleModals =
            typeof getVisibleModals === 'function' && getVisibleModals().length > 0;
        if (!hasVisibleModals) {
            document.body.classList.remove('modal-open', 'overflow-hidden');
            if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
            if (document.documentElement.style.overflow === 'hidden')
                document.documentElement.style.overflow = '';
        }
    } catch (_) {}
}

async function checkAndSetWelcomeText() {
    console.log(
        '[checkAndSetWelcomeText] Проверка условий для отображения приветственного текста...',
    );
    const clientNotesTextarea = document.getElementById('clientNotes');

    if (!clientNotesTextarea) {
        console.error(
            '[checkAndSetWelcomeText] Textarea #clientNotes не найдена. Приветственный текст не будет установлен.',
        );
        return;
    }

    if (!State.userPreferences || typeof State.userPreferences.welcomeTextShownInitially === 'undefined') {
        console.error(
            '[checkAndSetWelcomeText] State.userPreferences не загружены или не содержат флага welcomeTextShownInitially. Выход.',
        );
        return;
    }

    if (State.userPreferences.welcomeTextShownInitially === true) {
        console.log(
            '[checkAndSetWelcomeText] Приветственный текст не будет показан, так как флаг welcomeTextShownInitially уже установлен.',
        );
        return;
    }

    const notesAreEmpty = !clientNotesTextarea.value || clientNotesTextarea.value.trim() === '';

    if (
        !algorithms ||
        typeof algorithms !== 'object' ||
        !algorithms.main ||
        typeof DEFAULT_MAIN_ALGORITHM !== 'object' ||
        DEFAULT_MAIN_ALGORITHM === null
    ) {
        console.error(
            "[checkAndSetWelcomeText] Глобальные переменные 'algorithms.main' или 'DEFAULT_MAIN_ALGORITHM' не определены или некорректны!",
        );
        return;
    }

    const currentMainAlgoStepsNormalized = normalizeAlgorithmSteps(algorithms.main.steps || []);
    const defaultMainAlgoStepsNormalized = normalizeAlgorithmSteps(
        DEFAULT_MAIN_ALGORITHM.steps || [],
    );

    const currentMainAlgoCore = { ...algorithms.main };
    delete currentMainAlgoCore.steps;
    const defaultMainAlgoCore = { ...DEFAULT_MAIN_ALGORITHM };
    delete defaultMainAlgoCore.steps;

    const coreFieldsMatch = deepEqual(currentMainAlgoCore, defaultMainAlgoCore);
    const stepsMatch = deepEqual(currentMainAlgoStepsNormalized, defaultMainAlgoStepsNormalized);
    const isMainAlgorithmDefault = coreFieldsMatch && stepsMatch;

    console.log(
        `[checkAndSetWelcomeText - Условия] notesAreEmpty: ${notesAreEmpty}, isMainAlgorithmDefault: ${isMainAlgorithmDefault} (coreFieldsMatch: ${coreFieldsMatch}, stepsMatch: ${stepsMatch}), welcomeTextShownInitially: ${State.userPreferences.welcomeTextShownInitially}`,
    );

    if (notesAreEmpty && isMainAlgorithmDefault) {
        clientNotesTextarea.value = DEFAULT_WELCOME_CLIENT_NOTES_TEXT;
        console.log(
            '[checkAndSetWelcomeText] Приветственный текст успешно установлен в #clientNotes.',
        );

        State.userPreferences.welcomeTextShownInitially = true;
        if (typeof saveUserPreferences === 'function') {
            try {
                await saveUserPreferences();
                console.log(
                    '[checkAndSetWelcomeText] Флаг welcomeTextShownInitially установлен и настройки пользователя сохранены.',
                );
            } catch (error) {
                console.error(
                    '[checkAndSetWelcomeText] Ошибка при сохранении userPreferences после установки флага:',
                    error,
                );
            }
        } else {
            console.warn(
                '[checkAndSetWelcomeText] Функция saveUserPreferences не найдена. Флаг welcomeTextShownInitially может не сохраниться.',
            );
        }

        if (typeof saveClientData === 'function') {
            setTimeout(() => {
                saveClientData();
                console.log(
                    '[checkAndSetWelcomeText] Данные клиента (с приветственным текстом) сохранены.',
                );
            }, 100);
        } else {
            console.warn(
                '[checkAndSetWelcomeText] Функция saveClientData не найдена, приветственный текст может не сохраниться автоматически в clientData.',
            );
        }
    } else {
        if (!notesAreEmpty) {
            console.log(
                '[checkAndSetWelcomeText] Приветственный текст не установлен: поле заметок не пусто.',
            );
        }
        if (!isMainAlgorithmDefault) {
            console.log(
                '[checkAndSetWelcomeText] Приветственный текст не установлен: главный алгоритм был изменен или не соответствует дефолтному.',
            );
            if (!coreFieldsMatch) console.log('   - Основные поля алгоритма не совпадают.');
            if (!stepsMatch) console.log('   - Шаги алгоритма не совпадают.');
        }
    }
}

// normalizeAlgorithmSteps - imported from algorithms.js module

// ============================================================================
// FAVORITES SYSTEM - MIGRATED to js/features/favorites.js
// ============================================================================
// All favorites-related functions are now imported from the favorites module.
// See: js/features/favorites.js
// Functions migrated:
// - toggleFavorite, updateFavoriteStatusUI, renderFavoritesPage
// - getFavoriteButtonHTML, handleFavoriteContainerClick, handleFavoriteActionClick
// - isFavorite, refreshAllFavoritableSectionsUI, initFavoritesSystem

// Wrapper functions for backward compatibility
async function toggleFavorite(originalItemId, itemType, originalItemSection, title, description, buttonElement) {
    return toggleFavoriteModule(originalItemId, itemType, originalItemSection, title, description, buttonElement);
}

async function updateFavoriteStatusUI(originalItemId, itemType, isFavoriteStatus) {
    return updateFavoriteStatusUIModule(originalItemId, itemType, isFavoriteStatus);
}

async function renderFavoritesPage() {
    return renderFavoritesPageModule();
}

function getFavoriteButtonHTML(originalItemId, itemType, originalItemSection, title, description, isCurrentlyFavorite) {
    return getFavoriteButtonHTMLModule(originalItemId, itemType, originalItemSection, title, description, isCurrentlyFavorite);
}

function isFavorite(itemType, originalItemId) {
    return isFavoriteModule(itemType, originalItemId);
}

async function refreshAllFavoritableSectionsUI() {
    return refreshAllFavoritableSectionsUIModule();
}



async function isInnBlacklisted(inn) {
    return isInnBlacklistedModule(inn);
}

async function checkForBlacklistedInn(text) {
    return checkForBlacklistedInnModule(text);
}

function sortAndRenderBlacklist() {
    return sortAndRenderBlacklistModule();
}

function renderBlacklistEntries(entries) {
    // Legacy function - uses renderBlacklistTable from module
    return renderBlacklistTableModule(entries);
}

// GOOGLE DOCS INTEGRATION - MIGRATED to js/features/google-docs.js
// ============================================================================
// All Google Docs functions are now imported from the google-docs module.
// See: js/features/google-docs.js

// Wrapper для модуля background-image.js
function applyCustomBackgroundImage(dataUrl) {
    return applyCustomBackgroundImageModule(dataUrl);
}
// Wrapper для модуля background-image.js
function removeCustomBackgroundImage() {
    return removeCustomBackgroundImageModule();
}
// Wrapper для модуля background-image.js
function setupBackgroundImageControls() {
    return setupBackgroundImageControlsModule();
}

// ============================================================================
// PDF ATTACHMENT SYSTEM - MIGRATED to js/features/pdf-attachments.js
// ============================================================================
// All PDF-related functions are now imported from the pdf-attachments module.
// See: js/features/pdf-attachments.js

(function () {
    const STATE = {
        tasks: new Map(),
        container: null,
        barEl: null,
        titleEl: null,
        percentEl: null,
        hasShownCompletion: false,
        rafId: null,
        lastVisualPercent: 0,
        autoHideTimeoutId: null,
    };
    
    // Максимальное время показа HUD (30 секунд) - защита от зависания
    const MAX_HUD_DISPLAY_TIME = 30000;

    function ensureStyles() {
        if (document.getElementById('bg-status-hud-styles')) return;
        const css = `
    #bg-status-hud {
      position: fixed; right: 16px; top: 16px; z-index: 9998;
      width: 320px; max-width: calc(100vw - 32px);
      font-family: inherit;
      color: var(--color-text-primary, #111);
    }
    #bg-status-hud .hud-card{
      background: var(--color-surface-2, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px 14px; backdrop-filter: saturate(1.1) blur(2px);
      position: relative;
    }
    #bg-status-hud .hud-title { display:flex; align-items:center; gap:8px;
      font-weight:600; font-size:14px; margin-bottom:8px; }
    #bg-status-hud .hud-title .dot { width:8px; height:8px; border-radius:9999px;
      background: var(--color-primary, #2563eb); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-primary, #2563eb) 30%, transparent); }
    #bg-status-hud .hud-sub { font-size:12px; opacity:.8; margin-bottom:8px; }
    #bg-status-hud .hud-progress { width:100%; height:10px; border-radius:9999px;
      background: color-mix(in srgb, var(--color-surface-2, #fff) 60%, var(--color-text-primary, #111) 10%);
      overflow:hidden; border:1px solid var(--color-border, rgba(0,0,0,.12));
    }
    #bg-status-hud .hud-bar {
      height:100%; width:0%;
      background: linear-gradient(90deg,
        color-mix(in srgb, var(--color-primary, #2563eb) 95%, #fff 5%),
        color-mix(in srgb, var(--color-primary, #2563eb) 80%, #fff 20%)
      );
      transition: width .28s ease;
      background-size: 24px 24px;
      animation: hud-stripes 2.2s linear infinite;
    }
    #bg-status-hud .hud-footer { display:flex; justify-content:flex-start; align-items:center; margin-top:8px; font-size:12px; opacity:.9; gap:8px; }
    #bg-status-hud .hud-close {
      position: absolute; top: 8px; right: 8px;
      width: 28px; height: 28px; border-radius: 8px;
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      background: color-mix(in srgb, var(--color-surface-2, #fff) 85%, var(--color-text-primary, #111) 5%);
      color: var(--color-text-primary, #111);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; opacity: .75;
    }
    #bg-status-hud .hud-close:hover { opacity: 1; }
    #bg-status-hud .hud-close:focus { outline: 2px solid color-mix(in srgb, var(--color-primary, #2563eb) 60%, transparent); outline-offset: 2px; }
    #bg-status-hud #bg-hud-percent { display: none !important; }
    @media (prefers-reduced-motion: reduce){ #bg-status-hud .hud-bar{ animation: none; } }
    @keyframes hud-stripes{ 0%{ background-position: 0 0; } 100%{ background-position: 24px 0; } }
  `;
        const style = document.createElement('style');
        style.id = 'bg-status-hud-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function ensureContainer() {
        if (STATE.container) return;
        ensureStyles();
        const root = document.createElement('div');
        root.id = 'bg-status-hud';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.style.display = 'none';
        root.innerHTML = `
    <div class="hud-card">
      <button type="button" id="bg-hud-close" class="hud-close" aria-label="Скрыть">✕</button>
      <div class="hud-title"><span class="dot"></span><span>Фоновая инициализация...</span></div>
      <div class="hud-sub" id="bg-hud-title">Подготовка…</div>
      <div class="hud-progress"><div class="hud-bar" id="bg-hud-bar"></div></div>
      <div class="hud-footer"></div>
    </div>`;
        document.body.appendChild(root);
        STATE.container = root;
        STATE.barEl = root.querySelector('#bg-hud-bar');
        STATE.titleEl = root.querySelector('#bg-hud-title');
        STATE.percentEl = root.querySelector('#bg-hud-percent');
        root.querySelector('#bg-hud-close').addEventListener('click', () => hide());
    }

    function computeTopOffset() {
        let top = 16;
        const imp = document.getElementById('important-notifications-container');
        if (imp && imp.children.length > 0) {
            const s = parseInt(getComputedStyle(imp).top || '0', 10);
            top = Math.max(top, s + imp.offsetHeight + 8);
        }
        const toast = document.getElementById('notification-container');
        if (toast && toast.children.length > 0) {
            top = Math.max(top, 90);
        }
        STATE.container.style.top = `${top}px`;
    }

    function aggregatePercent() {
        let totalWeight = 0,
            acc = 0;
        for (const t of STATE.tasks.values()) {
            if (!t.total || t.total <= 0) continue;
            const w = t.weight ?? 1;
            totalWeight += w;
            acc += w * Math.min(1, t.processed / t.total);
        }
        if (totalWeight === 0) return 0;
        return (acc / totalWeight) * 100;
    }

    function tick() {
        const target = aggregatePercent();
        const next =
            STATE.lastVisualPercent +
            Math.min(2.5, Math.max(0.4, (target - STATE.lastVisualPercent) * 0.2));
        STATE.lastVisualPercent = Math.min(100, Math.max(0, next));
        if (STATE.barEl) STATE.barEl.style.width = `${STATE.lastVisualPercent.toFixed(1)}%`;
        if (STATE.percentEl)
            STATE.percentEl.textContent = `${Math.round(STATE.lastVisualPercent)}%`;
        if (STATE.tasks.size > 0) STATE.rafId = requestAnimationFrame(tick);
    }

    function show() {
        ensureContainer();
        computeTopOffset();
        STATE.container.style.display = '';
        if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
        
        // Запускаем защитный таймаут для автоматического скрытия
        if (STATE.autoHideTimeoutId) {
            clearTimeout(STATE.autoHideTimeoutId);
        }
        STATE.autoHideTimeoutId = setTimeout(() => {
            console.warn('[BackgroundStatusHUD] Принудительное скрытие по таймауту. Незавершённые задачи:', [...STATE.tasks.keys()]);
            STATE.tasks.clear();
            hide();
        }, MAX_HUD_DISPLAY_TIME);
    }
    function hide() {
        if (!STATE.container) return;
        STATE.container.style.display = 'none';
        if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
        STATE.rafId = null;
        STATE.lastVisualPercent = 0;
        
        // Очищаем защитный таймаут
        if (STATE.autoHideTimeoutId) {
            clearTimeout(STATE.autoHideTimeoutId);
            STATE.autoHideTimeoutId = null;
        }
    }
    function updateTitle() {
        const active = [...STATE.tasks.values()];
        if (active.length === 0) return;
        const main = active[0];
        const others = Math.max(0, active.length - 1);
        STATE.titleEl.textContent =
            others > 0
                ? `Индексируется: ${main.label} + ещё ${others}`
                : `Индексируется: ${main.label}`;
    }
    function maybeFinishAll() {
        if (STATE.tasks.size === 0) {
            if (
                !STATE.hasShownCompletion &&
                typeof NotificationService !== 'undefined' &&
                NotificationService.add
            ) {
                STATE.hasShownCompletion = true;
                NotificationService.add('Приложение полностью загружено', 'success', {
                    duration: 5000,
                });
            }
            setTimeout(hide, 900);
        }
    }

    const API = {
        startTask(id, label, opts = {}) {
            console.log(`[BackgroundStatusHUD] startTask: ${id} (${label})`);
            ensureContainer();
            STATE.tasks.set(id, {
                label,
                weight: typeof opts.weight === 'number' ? opts.weight : 1,
                processed: 0,
                total: Math.max(1, opts.total ?? 100),
            });
            updateTitle();
            show();
        },
        updateTask(id, processed, total) {
            const t = STATE.tasks.get(id);
            if (!t) return;
            if (typeof total === 'number' && total > 0) t.total = total;
            if (typeof processed === 'number')
                t.processed = Math.min(total ?? t.total, Math.max(0, processed));
            computeTopOffset();
            updateTitle();
        },
        finishTask(id, success = true) {
            console.log(`[BackgroundStatusHUD] finishTask: ${id} (success: ${success}). Оставшиеся задачи: ${STATE.tasks.size - 1}`);
            STATE.tasks.delete(id);
            updateTitle();
            maybeFinishAll();
        },
        reportIndexProgress(processed, total, error) {
            const id = 'search-index-build';
            if (!STATE.tasks.has(id))
                API.startTask(id, 'Индексация контента', {
                    weight: 0.6,
                    total: Math.max(1, total || 100),
                });
            if (error) {
                API.finishTask(id, false);
            } else {
                API.updateTask(id, processed, total);
                if (total && processed >= total) API.finishTask(id, true);
            }
        },
    };
    window.BackgroundStatusHUD = API;
})();

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ЗАВИСИМОСТЕЙ МОДУЛЕЙ
// ============================================================================
// Устанавливаем зависимости для модулей, которые их требуют

// Bookmarks System Dependencies
setBookmarksDependencies({
    isFavorite,
    getFavoriteButtonHTML,
    showAddBookmarkModal,
    showBookmarkDetail,
    showOrganizeFoldersModal,
    showNotification,
    debounce,
    setupClearButton,
    loadFoldersList,
    removeEscapeHandler,
    getVisibleModals,
    addEscapeHandler,
    handleSaveFolderSubmit,
    getAllFromIndex,
    State,
    showEditBookmarkModal,
    deleteBookmark,
    showBookmarkDetailModal,
    handleViewBookmarkScreenshots,
    NotificationService,
    showScreenshotViewerModal,
});
console.log('[script.js] Зависимости модуля Bookmarks установлены');

// Favorites System Dependencies
setFavoritesDependencies({
    showNotification,
    setActiveTab,
    algorithms,
    showAlgorithmDetail,
    showBookmarkDetailModal,
    showReglamentDetail,
    showReglamentsForCategory,
    copyToClipboard,
    filterBookmarks,
    applyCurrentView,
    loadingOverlayManager,
    renderAllAlgorithms,
    loadBookmarks,
    loadExtLinks,
    renderReglamentCategories,
});
console.log('[script.js] Зависимости модуля Favorites установлены');

// CIB Links System Dependencies
setCibLinksDependencies({
    showNotification,
    debounce,
    filterLinks,
    setupClearButton,
    copyToClipboard,
    handleViewToggleClick,
    applyCurrentView,
    applyView,
    updateSearchIndex,
    getVisibleModals,
    addEscapeHandler,
    removeEscapeHandler,
    getRequiredElements,
    DEFAULT_CIB_LINKS,
});
console.log('[script.js] Зависимости модуля CIB Links установлены');

// Blacklist System Dependencies
setBlacklistDependencies({
    showNotification,
    debounce,
    escapeHtml,
    escapeRegExp,
    getVisibleModals,
    setActiveTab,
    updateSearchIndex,
    NotificationService,
    XLSX: window.XLSX,
});
console.log('[script.js] Зависимости модуля Blacklist установлены');

// Import/Export System Dependencies
setImportExportDependencies({
    NotificationService,
    loadingOverlayManager,
    showNotification,
    setActiveTab,
    setTheme,
    renderAllAlgorithms,
    loadBookmarks,
    loadExtLinks,
    loadCibLinks,
    renderReglamentCategories,
    showReglamentsForCategory,
    initSearchSystem,
    buildInitialSearchIndex,
    updateSearchIndex,
    loadSedoData,
    applyPreviewSettings,
    applyThemeOverrides,
    importFileInput,
});
console.log('[script.js] Зависимости модуля Import/Export установлены');

// Screenshots System Dependencies
setScreenshotsDependencies({
    showNotification,
    openLightbox,
    getVisibleModals,
    removeEscapeHandler,
    algorithms,
});
console.log('[script.js] Зависимости модуля Screenshots установлены');

// Lightbox System Dependencies
setLightboxDependencies({
    getVisibleModals,
});
console.log('[script.js] Зависимости модуля Lightbox установлены');

// Tabs Overflow System Dependencies
setTabsOverflowDependencies({
    setActiveTab,
});
console.log('[script.js] Зависимости модуля Tabs Overflow установлены');

// Tabs UI Dependencies
setTabsDependencies({
    setActiveTab,
});
console.log('[script.js] Зависимости модуля Tabs UI установлены');

// Algorithm Editing Dependencies
setAlgorithmsDependencies({
    algorithms,
    isFavorite,
    getFavoriteButtonHTML,
    showAlgorithmDetail,
    copyToClipboard,
    applyCurrentView,
    loadMainAlgoCollapseState,
    saveMainAlgoCollapseState,
    showNotification,
    attachStepDeleteHandler,
    attachScreenshotHandlers,
    updateStepNumbers,
    toggleStepCollapse,
    Sortable: typeof Sortable !== 'undefined' ? Sortable : null,
});
console.log('[script.js] Зависимости модуля Algorithm Editing установлены');

// Reglaments System Dependencies
setReglamentsDependencies({
    State,
    categoryDisplayInfo,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
    getAllFromIndexedDB,
    showNotification,
    applyCurrentView,
    isFavorite,
    getFavoriteButtonHTML,
    updateSearchIndex,
    getOrCreateModal,
    removeEscapeHandler,
    addEscapeHandler,
    toggleModalFullscreen,
    getVisibleModals,
    ExportService,
    reglamentDetailModalConfig,
    reglamentModalConfigGlobal,
    handleViewToggleClick,
});
console.log('[script.js] Зависимости модуля Reglaments установлены');

// Clipboard System Dependencies
setClipboardDependencies({
    NotificationService,
    showNotification,
});
console.log('[script.js] Зависимости модуля Clipboard установлены');

// Client Data System Dependencies
setClientDataDependencies({
    showNotification,
    NotificationService,
    updateSearchIndex,
});
console.log('[script.js] Зависимости модуля Client Data установлены');

// Modal System Dependencies
setModalDependencies({
    addEscapeHandler,
    removeEscapeHandler,
});
console.log('[script.js] Зависимости модуля Modal установлены');

// Step Management System Dependencies
setStepManagementDependencies({
    showNotification,
});
console.log('[script.js] Зависимости модуля Step Management установлены');

// App Reload System Dependencies
setAppReloadDependencies({
    showNotification,
});
console.log('[script.js] Зависимости модуля App Reload установлены');

// Employee Extension System Dependencies
setEmployeeExtensionDependencies({
    showNotification,
    saveUserPreferences,
});
console.log('[script.js] Зависимости модуля Employee Extension установлены');

// Background Image System Dependencies
setBackgroundImageDependencies({
    showNotification,
    saveToIndexedDB,
    deleteFromIndexedDB,
    processImageFile,
});
console.log('[script.js] Зависимости модуля Background Image установлены');

// ============================================================================
// ЭКСПОРТ ФУНКЦИЙ В WINDOW (для совместимости с модулями и старым кодом)
// ============================================================================
// Экспортируем функции в window для глобального доступа
// Это необходимо, так как script.js теперь ES-модуль и функции не попадают в глобальную область автоматически
if (typeof showNotification === 'function') window.showNotification = showNotification;
if (typeof algorithms !== 'undefined') window.algorithms = algorithms;
if (typeof isFavorite === 'function') window.isFavorite = isFavorite;
if (typeof loadingOverlayManager !== 'undefined') window.loadingOverlayManager = loadingOverlayManager;
if (typeof showAlgorithmDetail === 'function') window.showAlgorithmDetail = showAlgorithmDetail;
if (typeof copyToClipboard === 'function') window.copyToClipboard = copyToClipboard;
if (typeof applyCurrentView === 'function') window.applyCurrentView = applyCurrentView;
if (typeof debounce === 'function') window.debounce = debounce;
if (typeof setupClearButton === 'function') window.setupClearButton = setupClearButton;
if (typeof showAddBookmarkModal === 'function') window.showAddBookmarkModal = showAddBookmarkModal;
if (typeof showBookmarkDetail === 'function') window.showBookmarkDetail = showBookmarkDetail;
if (typeof showOrganizeFoldersModal === 'function') window.showOrganizeFoldersModal = showOrganizeFoldersModal;
if (typeof filterBookmarks === 'function') window.filterBookmarks = filterBookmarks;
if (typeof populateBookmarkFolders === 'function') window.populateBookmarkFolders = populateBookmarkFolders;
if (typeof getFavoriteButtonHTML === 'function') window.getFavoriteButtonHTML = getFavoriteButtonHTML;
if (typeof DEFAULT_MAIN_ALGORITHM !== 'undefined') window.DEFAULT_MAIN_ALGORITHM = DEFAULT_MAIN_ALGORITHM;
if (typeof loadFoldersList === 'function') window.loadFoldersList = loadFoldersList;
if (typeof removeEscapeHandler === 'function') window.removeEscapeHandler = removeEscapeHandler;
if (typeof getVisibleModals === 'function') window.getVisibleModals = getVisibleModals;