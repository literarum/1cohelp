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
    SHABLONY_DOC_ID,
    EXT_LINKS_MIGRATION_KEY,
    MAIN_ALGO_COLLAPSE_KEY,
    TIMER_STATE_KEY,
    DIALOG_WATCHDOG_TIMEOUT_NEW,
    CACHE_TTL,
    FIELD_WEIGHTS,
    DEFAULT_WELCOME_CLIENT_NOTES_TEXT,
} from './js/constants.js';

import {
    categoryDisplayInfo as categoryDisplayInfoImported,
    tabsConfig,
    allPanelIdsForDefault,
    defaultPanelOrder,
    getDefaultUISettings,
    SECTION_GRID_COLS,
    CARD_CONTAINER_CLASSES,
    LIST_CONTAINER_CLASSES,
    CARD_ITEM_BASE_CLASSES,
    LIST_ITEM_BASE_CLASSES,
    ALGO_BOOKMARK_CARD_CLASSES,
    LINK_REGLAMENT_CARD_CLASSES,
    LIST_HOVER_TRANSITION_CLASSES,
    DEFAULT_CIB_LINKS,
    FULLSCREEN_MODAL_CONFIGS,
} from './js/config.js';

// Настройки UI по умолчанию (используются в loadUserPreferences, applyUISettings и др.)
const DEFAULT_UI_SETTINGS = getDefaultUISettings(defaultPanelOrder);

// Создаём мутабельную копию categoryDisplayInfo для совместимости со старым кодом
let categoryDisplayInfo = { ...categoryDisplayInfoImported };

import {
    escapeHtml,
    escapeHTML,
    normalizeBrokenEntities,
    decodeBasicEntitiesOnce,
    truncateText,
    highlightText,
    highlightTextInString,
    highlightElement,
    highlightTextInElement,
    linkify as linkifyModule,
} from './js/utils/html.js';

import {
    escapeRegExp,
    base64ToBlob,
    formatExampleForTextarea,
    getSectionName,
    getStepContentAsText,
    debounce,
    deepEqual as deepEqualModule,
    setupClearButton as setupClearButtonModule,
} from './js/utils/helpers.js';

import {
    setClipboardDependencies,
    copyToClipboard as copyToClipboardModule,
} from './js/utils/clipboard.js';

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
    getAllFromIndex,
} from './js/db/indexeddb.js';

import { storeConfigs } from './js/db/stores.js';

import {
    addToFavoritesDB,
    removeFromFavoritesDB,
    isFavoriteDB,
    getAllFavoritesDB,
    clearAllFavoritesDB,
    loadInitialFavoritesCache,
} from './js/db/favorites.js';

import { NotificationService, showNotification } from './js/services/notification.js';

import { ExportService, setLoadingOverlayManager } from './js/services/export.js';

import { loadingOverlayManager } from './js/ui/loading-overlay-manager.js';

import { State } from './js/app/state.js';

import { setAppInitDependencies, appInit as appInitModule } from './js/app/app-init.js';

import { setOnloadHandlerDependencies, registerOnloadHandler } from './js/app/onload-handler.js';

import {
    setDataLoaderDependencies,
    loadFromIndexedDB as loadFromIndexedDBModule,
    saveDataToIndexedDB as saveDataToIndexedDBModule,
} from './js/app/data-loader.js';

// User Preferences (extracted from script.js)
import {
    setUserPreferencesDependencies,
    loadUserPreferences as loadUserPreferencesModule,
    saveUserPreferences as saveUserPreferencesModule,
} from './js/app/user-preferences.js';

// Data Clear (extracted from script.js)
import {
    setDataClearDependencies,
    clearAllApplicationData as clearAllApplicationDataModule,
} from './js/app/data-clear.js';

import {
    setTheme as setThemeModule,
    migrateLegacyThemeVars as migrateLegacyThemeVarsModule,
    applyThemeOverrides as applyThemeOverridesModule,
    applyThemeClass,
    onSystemThemeChange,
} from './js/components/theme.js';

// Timer System
import {
    initTimerSystem,
    toggleTimer,
    resetTimer,
    adjustTimerDuration,
    showAppNotification,
    requestAppNotificationPermission,
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
    attachBookmarkPdfHandlers,
} from './js/features/pdf-attachments.js';

// Google Docs Integration
import {
    initGoogleDocSections,
    loadAndRenderGoogleDoc,
    renderGoogleDocContent,
    fetchGoogleDocs,
    handleShablonySearch,
    parseShablonyContent,
} from './js/features/google-docs.js';

// Background Health Tests
import {
    setBackgroundHealthTestsDependencies,
    initBackgroundHealthTestsSystem,
} from './js/features/background-health-tests.js';

// Algorithms PDF Export (PR11)
import {
    setAlgorithmsPdfExportDependencies,
    initAlgorithmsPdfExportSystem,
} from './js/features/algorithms-pdf-export.js';

// FNS Certificate Revocation (PR11)
import { initFNSCertificateRevocationSystem } from './js/features/fns-cert-revocation.js';

// XMLизатор
import { initXmlAnalyzer } from './js/features/xml-analyzer.js';

// UI Customization (PR11)
import {
    setUICustomizationDependencies,
    initUICustomization as initUICustomizationModule,
} from './js/ui/ui-customization.js';

// UI Settings Modal Init (PR11)
import {
    setUISettingsModalInitDependencies,
    initUISettingsModalHandlers as initUISettingsModalHandlersModule,
} from './js/ui/ui-settings-modal-init.js';

// Background Status HUD
import { initBackgroundStatusHUD } from './js/ui/background-status-hud.js';

// UI modules from PR11
import {
    setEscapeHandlerDependencies,
    addEscapeHandler as addEscapeHandlerModule,
    removeEscapeHandler as removeEscapeHandlerModule,
} from './js/ui/escape-handler.js';
import {
    setUnsavedConfirmModalDependencies,
    showUnsavedConfirmModal as showUnsavedConfirmModalModule,
} from './js/ui/unsaved-confirm-modal.js';
import {
    registerModalDirtyCheck,
    shouldConfirmBeforeClose,
} from './js/ui/unsaved-changes-registry.js';
import {
    setAppConfirmModalDependencies,
    showAppConfirm as showAppConfirmModule,
    showAppAlert as showAppAlertModule,
} from './js/ui/app-confirm-modal.js';
import {
    setHeaderButtonsDependencies,
    initHeaderButtons as initHeaderButtonsModule,
} from './js/ui/header-buttons.js';
import {
    setThemeToggleDependencies,
    initThemeToggle as initThemeToggleModule,
} from './js/ui/theme-toggle.js';
import {
    setModalOverlayHandlerDependencies,
    initModalOverlayHandler as initModalOverlayHandlerModule,
} from './js/ui/modal-overlay-handler.js';
import {
    setAlgorithmModalControlDependencies,
    initAlgorithmModalControls as initAlgorithmModalControlsModule,
} from './js/ui/algorithm-modal-controls.js';

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
    highlightAndScrollSedoItem,
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
    ensureSearchIndexIsBuilt,
} from './js/features/search.js';

// Algorithm Components
import {
    setAlgorithmsDependencies,
    createStepElementHTML,
    normalizeAlgorithmSteps,
    renderAllAlgorithms as renderAllAlgorithmsModule,
    renderAlgorithmCards as renderAlgorithmCardsModule,
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

// Algorithms Operations (extracted from script.js)
import {
    setAlgorithmsOperationsDependencies,
    editAlgorithm as editAlgorithmModule,
    showAddModal as showAddModalModule,
} from './js/components/algorithms-operations.js';

// Algorithms Save (extracted from script.js)
import {
    setAlgorithmsSaveDependencies,
    saveNewAlgorithm as saveNewAlgorithmModule,
    saveAlgorithm as saveAlgorithmModule,
    deleteAlgorithm as deleteAlgorithmModule,
} from './js/components/algorithms-save.js';

// Main Algorithm Component
import {
    setMainAlgorithmDependencies,
    renderMainAlgorithm as renderMainAlgorithmModule,
    loadMainAlgoCollapseState as loadMainAlgoCollapseStateModule,
    saveMainAlgoCollapseState as saveMainAlgoCollapseStateModule,
} from './js/components/main-algorithm.js';

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
    loadCategoryInfo,
    saveCategoryInfo,
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

// Bookmarks Delete (extracted from script.js)
import {
    setBookmarksDeleteDependencies,
    deleteBookmark as deleteBookmarkModule,
} from './js/features/bookmarks-delete.js';

// Bookmarks Modal (extracted from script.js)
import {
    setBookmarksModalDependencies,
    ensureBookmarkModal as ensureBookmarkModalModule,
    showAddBookmarkModal as showAddBookmarkModalModule,
    showEditBookmarkModal as showEditBookmarkModalModule,
} from './js/features/bookmarks-modal.js';

// Bookmarks Form Submit (extracted from script.js)
import {
    setBookmarksFormDependencies,
    handleBookmarkFormSubmit as handleBookmarkFormSubmitModule,
} from './js/features/bookmarks-form.js';

// Bookmarks DOM Operations (extracted from script.js)
import {
    setBookmarksDomDependencies,
    addBookmarkToDOM as addBookmarkToDOMModule,
    updateBookmarkInDOM as updateBookmarkInDOMModule,
    removeBookmarkFromDOM as removeBookmarkFromDOMModule,
} from './js/features/bookmarks-dom.js';

// External Links Components
import {
    getAllExtLinks,
    loadExtLinks as loadExtLinksModule,
    createExtLinkElement as createExtLinkElementModule,
    renderExtLinks as renderExtLinksModule,
    setExtLinksDependencies,
} from './js/components/ext-links.js';

// Ext Links Form Submit (extracted from script.js)
import {
    setExtLinksFormDependencies,
    handleExtLinkFormSubmit as handleExtLinkFormSubmitModule,
} from './js/features/ext-links-form.js';

// Ext Links Modal (extracted from script.js)
import {
    setExtLinksModalDependencies,
    ensureExtLinkModal as ensureExtLinkModalModule,
    showAddExtLinkModal as showAddExtLinkModalModule,
    showEditExtLinkModal as showEditExtLinkModalModule,
    showAddEditExtLinkModal as showAddEditExtLinkModalModule,
} from './js/features/ext-links-modal.js';

// Ext Links Categories (extracted from script.js)
import {
    setExtLinksCategoriesDependencies,
    showOrganizeExtLinkCategoriesModal as showOrganizeExtLinkCategoriesModalModule,
    handleSaveExtLinkCategorySubmit as handleSaveExtLinkCategorySubmitModule,
    handleDeleteExtLinkCategoryClick as handleDeleteExtLinkCategoryClickModule,
    populateExtLinkCategoryFilter as populateExtLinkCategoryFilterModule,
} from './js/features/ext-links-categories.js';

// Ext Links Actions (extracted from script.js)
import {
    setExtLinksActionsDependencies,
    filterExtLinks as filterExtLinksModule,
    handleExtLinkAction as handleExtLinkActionModule,
} from './js/features/ext-links-actions.js';

// Ext Links Init (extracted from script.js)
import {
    setExtLinksInitDependencies,
    initExternalLinksSystem as initExternalLinksSystemModule,
} from './js/features/ext-links-init.js';

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

// Алиас для глобального использования в appInit и при экспорте в window
const handleFavoriteActionClick = handleFavoriteActionClickModule;

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
    filterLinks as filterLinksModule,
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
    setActiveTab as setActiveTabModule,
    applyPanelOrderAndVisibility as applyPanelOrderAndVisibilityModule,
    initTabClickDelegation,
} from './js/components/tabs.js';

// Раннее определение setActiveTab для передачи в setUIInitDependencies и initUI
const setActiveTab = async (tabId, warningJustAccepted = false) =>
    setActiveTabModule(tabId, warningJustAccepted);

// Client Data System
import {
    setClientDataDependencies,
    saveClientData as saveClientDataModule,
    getClientData as getClientDataModule,
    exportClientDataToTxt as exportClientDataToTxtModule,
    loadClientData as loadClientDataModule,
    clearClientData as clearClientDataModule,
    applyClientNotesFontSize as applyClientNotesFontSizeModule,
    createClientNotesInnPreview as createClientNotesInnPreviewModule,
} from './js/features/client-data.js';

import {
    initClientDataSystem,
    ensureInnPreviewStyles,
    setClientDataInitDependencies,
} from './js/features/client-data-init.js';

import {
    setTextareaHeightsDependencies,
    initTextareaHeightsPersistence as initTextareaHeightsPersistenceModule,
} from './js/features/textarea-heights-persistence.js';

import {
    setClientNotesWindowDependencies,
    openClientNotesWindow as openClientNotesWindowModule,
    openClientNotesPopupWindow as openClientNotesPopupWindowModule,
    highlightClientNotesWindow as highlightClientNotesWindowModule,
    isClientNotesWindowOpen as isClientNotesWindowOpenModule,
} from './js/features/client-notes-window.js';

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

// UI Modules
import {
    getVisibleModals as getVisibleModalsModule,
    getTopmostModal as getTopmostModalModule,
    hasBlockingModalsOpen as hasBlockingModalsOpenModule,
    toggleModalFullscreen as toggleModalFullscreenModule,
    initFullscreenToggles as initFullscreenTogglesModule,
    initBeforeUnloadHandler as initBeforeUnloadHandlerModule,
    showNoInnModal as showNoInnModalModule,
    UNIFIED_FULLSCREEN_MODAL_CLASSES,
} from './js/ui/modals-manager.js';

import {
    setHotkeysDependencies,
    setupHotkeys as setupHotkeysModule,
    handleNoInnLinkEvent as handleNoInnLinkEventModule,
    handleNoInnLinkClick as handleNoInnLinkClickModule,
    navigateBackWithinApp as navigateBackWithinAppModule,
    handleGlobalHotkey as handleGlobalHotkeyModule,
} from './js/ui/hotkeys-handler.js';

import {
    applyView as applyViewModule,
    applyCurrentView as applyCurrentViewModule,
    initViewToggles as initViewTogglesModule,
    handleViewToggleClick as handleViewToggleClickModule,
    applyDefaultViews as applyDefaultViewsModule,
    toggleActiveSectionView as toggleActiveSectionViewModule,
    loadViewPreferences as loadViewPreferencesModule,
    saveViewPreference as saveViewPreferenceModule,
} from './js/ui/view-manager.js';

// UI Init (extracted from script.js)
import {
    setUIInitDependencies,
    initUI as initUIModule,
    initStepInteractions as initStepInteractionsModule,
    initCollapseAllButtons as initCollapseAllButtonsModule,
    initHotkeysModal as initHotkeysModalModule,
} from './js/ui/init.js';

// Systems Init (extracted from script.js)
import {
    setSystemsInitDependencies,
    initClearDataFunctionality as initClearDataFunctionalityModule,
    initBackgroundSystems as initBackgroundSystemsModule,
} from './js/ui/systems-init.js';

// UI Settings Modal (extracted from script.js)
import {
    setUISettingsModalDependencies,
    populateModalControls as populateModalControlsModule,
    handleModalVisibilityToggle as handleModalVisibilityToggleModule,
    getSettingsFromModal as getSettingsFromModalModule,
    updatePreviewSettingsFromModal as updatePreviewSettingsFromModalModule,
    resetUISettingsInModal as resetUISettingsInModalModule,
    revertUISettingsOnDiscard as revertUISettingsOnDiscardModule,
    createPanelItemElement as createPanelItemElementModule,
} from './js/ui/ui-settings-modal.js';

// UI Settings (extracted from script.js)
import {
    setUISettingsDependencies,
    applyUISettings as applyUISettingsModule,
    applyInitialUISettings as applyInitialUISettingsModule,
    loadUISettings,
    saveUISettings,
} from './js/ui/ui-settings.js';

// Preview Settings (extracted from script.js)
import {
    setPreviewSettingsDependencies,
    applyPreviewSettings as applyPreviewSettingsModule,
} from './js/ui/preview-settings.js';

// Color Picker (настройка цветов в модалке UI)
import {
    setColorPickerDependencies,
    setColorPickerStateFromHex as setColorPickerStateFromHexModule,
    initColorPicker as initColorPickerModule,
} from './js/ui/color-picker.js';

// Algorithms Renderer
import {
    setAlgorithmsRendererDependencies,
    showAlgorithmDetail as showAlgorithmDetailModule,
} from './js/components/algorithms-renderer.js';

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

// NotificationService и showNotification импортируются из services/notification.js
// Дубликат кода NotificationService был удален (было ~440 строк дублирующего кода)
// Весь функционал доступен через импортированный модуль из services/notification.js

// ExportService теперь импортируется из services/export.js
// Оставляем вызов init() для инициализации
ExportService.init();

// UNIFIED_FULLSCREEN_MODAL_CLASSES теперь импортируется из js/ui/modals-manager.js
// Используем импортированную константу напрямую

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
            innerContainer: ['max-w-6xl', 'max-h-[85vh]', 'rounded-lg', 'shadow-xl'],
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

// getVisibleModals теперь импортируется из js/ui/modals-manager.js
const getVisibleModals = getVisibleModalsModule;

const SAVE_BUTTON_SELECTORS =
    'button[type="submit"], #saveAlgorithmBtn, #createAlgorithmBtn, #saveCibLinkBtn, #saveBookmarkBtn, #saveExtLinkBtn';

// hasBlockingModalsOpen, getTopmostModal теперь импортируются из js/ui/modals-manager.js
const hasBlockingModalsOpen = hasBlockingModalsOpenModule;
const getTopmostModal = getTopmostModalModule;

// Escape handlers для модальных окон
function addEscapeHandler(modalElement) {
    if (!modalElement || modalElement._escapeHandlerInstance) return;

    const handleEscape = (event) => {
        if (event.key === 'Escape') {
            const visibleModals = getVisibleModals();
            const topmost = getTopmostModal(visibleModals);
            if (topmost && topmost.id === modalElement.id) {
                modalElement.classList.add('hidden');
                removeEscapeHandler(modalElement);
                event.stopPropagation();
            }
        }
    };

    modalElement._escapeHandlerInstance = handleEscape;
    document.addEventListener('keydown', handleEscape);
}

function removeEscapeHandler(modalElement) {
    if (!modalElement || !modalElement._escapeHandlerInstance) return;
    document.removeEventListener('keydown', modalElement._escapeHandlerInstance);
    delete modalElement._escapeHandlerInstance;
}

/**
 * Подключает обработчик Escape для закрытия модального окна деталей закладки.
 * @param {string} modalId - ID элемента модального окна
 */
function wireBookmarkDetailModalCloseHandler(modalId) {
    const modal = document.getElementById(modalId);
    if (modal && typeof addEscapeHandler === 'function') {
        addEscapeHandler(modal);
    }
}

// debounce и setupClearButton импортируются из js/utils/helpers.js
// debounce уже импортирован напрямую, setupClearButton нужно создать алиас
// Примечание: debounce уже доступен напрямую из импорта, не нужно создавать константу
const setupClearButton = setupClearButtonModule;

// Алиасы для функций модальных окон закладок
const showEditBookmarkModal = showEditBookmarkModalModule;

// Алиас для утилиты буфера обмена
const copyToClipboard = copyToClipboardModule;

// Инициализируем обработчик beforeunload
initBeforeUnloadHandlerModule();

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

// loadingOverlayManager теперь импортируется из js/ui/loading-overlay-manager.js

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
    // Не скрываем #appContent: приложение должно рендериться за оверлеем, чтобы при снятии оверлея интерфейс уже был загружен.
    // Оверлей (z-index 99999) остаётся поверх до hideAndDestroy.

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

// appInit теперь импортируется из js/app/app-init.js
async function appInit(context = 'normal') {
    return appInitModule(context);
}

// showAlgorithmDetail теперь импортируется из js/components/algorithms-renderer.js
const showAlgorithmDetail = showAlgorithmDetailModule;

// showReglamentDetail и showReglamentsForCategory теперь импортируются из js/components/reglaments.js
const showReglamentDetail = showReglamentDetailModule;
const showReglamentsForCategory = showReglamentsForCategoryModule;

// debounce теперь импортируется из js/utils/helpers.js
// (уже импортирован выше, используем напрямую)

// Функции инициализации систем - определяем константы для использования в зависимостях
// initSearchSystem импортируется напрямую из js/features/search.js (строка 189)
// initTimerSystem импортируется напрямую из js/features/timer.js (строка 142)
// initSedoTypesSystem импортируется напрямую из js/features/sedo.js (строка 177)
const initCibLinkSystem = initCibLinkSystemModule;
const initReglamentsSystem = initReglamentsSystemModule;
const initBookmarkSystem = initBookmarkSystemModule;
const initExternalLinksSystem = initExternalLinksSystemModule;
const initBlacklistSystem = initBlacklistSystemModule;
const initReloadButton = initReloadButtonModule;

// setActiveTab уже определена выше (после импорта tabs.js)
const initFullscreenToggles = initFullscreenTogglesModule;
const initHeaderButtons = initHeaderButtonsModule;
const initThemeToggle = initThemeToggleModule;
const initModalOverlayHandler = initModalOverlayHandlerModule;
const initAlgorithmModalControls = initAlgorithmModalControlsModule;
const setupHotkeys = setupHotkeysModule;
const initUI = initUIModule;
const initHotkeysModal = initHotkeysModalModule;
const initClearDataFunctionality = initClearDataFunctionalityModule;
const applyInitialUISettings = applyInitialUISettingsModule;

// initViewToggles теперь импортируется из js/ui/view-manager.js
const initViewToggles = initViewTogglesModule;

// initClientDataSystem определяется ниже на строке 3123 как function declaration (hoisting работает)
// initUICustomization из PR11 модуля ui-customization.js
const initUICustomization = initUICustomizationModule;

// Адаптивное расширение полей ввода (textarea), кроме #clientNotes — размер окна заметок фиксирован (rows), растягивание только вручную (resize-y)
function initAutoExpandTextareas() {
    const expand = (el) => {
        if (!el || el.tagName !== 'TEXTAREA' || el.id === 'clientNotes') return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 600) + 'px';
    };
    document.addEventListener('input', (e) => {
        if (e.target && e.target.tagName === 'TEXTAREA' && e.target.id !== 'clientNotes')
            expand(e.target);
    });
    document.addEventListener(
        'focus',
        (e) => {
            if (e.target && e.target.tagName === 'TEXTAREA' && e.target.id !== 'clientNotes')
                expand(e.target);
        },
        true,
    );
    document.querySelectorAll('textarea:not(#clientNotes)').forEach(expand);
}

// Кнопки прокрутки вверх/вниз — показываются только если контент не помещается на экране; клик — в начало/конец страницы
// Учитывает скролл как в document, так и во вложенном main (создаётся initGoogleDocSections)
function initScrollNavButtons() {
    const container = document.getElementById('scrollNavButtons');
    const scrollUpBtn = document.getElementById('scrollUpBtn');
    const scrollDownBtn = document.getElementById('scrollDownBtn');
    if (!container || !scrollUpBtn || !scrollDownBtn) return;

    const getScrollContainer = () => {
        const appContent = document.getElementById('appContent');
        const main = appContent?.querySelector('main');
        const MIN_OVERFLOW = 1;
        let best = { el: null, isDocument: true };
        let bestDelta = 0;

        const docDelta = document.documentElement.scrollHeight - window.innerHeight;
        if (docDelta > bestDelta && docDelta > MIN_OVERFLOW) {
            bestDelta = docDelta;
            best = { el: null, isDocument: true };
        }

        if (main) {
            const style = window.getComputedStyle(main);
            const overflowY = style.overflowY || style.overflow;
            if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
                const delta = main.scrollHeight - main.clientHeight;
                if (delta > bestDelta && delta > MIN_OVERFLOW) {
                    bestDelta = delta;
                    best = { el: main, isDocument: false };
                }
            }
        }

        const visibleTab = appContent?.querySelector('.tab-content:not(.hidden)');
        if (visibleTab) {
            const scrollables = visibleTab.querySelectorAll(
                '[id^="doc-content-"], #extLinksContainer, .view-section.overflow-y-auto, [class*="overflow-y-auto"]',
            );
            for (const el of scrollables) {
                const style = window.getComputedStyle(el);
                const overflowY = style.overflowY || style.overflow;
                if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
                    const delta = el.scrollHeight - el.clientHeight;
                    if (delta > bestDelta && delta > MIN_OVERFLOW) {
                        bestDelta = delta;
                        best = { el, isDocument: false };
                    }
                }
            }
        }

        return best;
    };

    const SCROLL_THRESHOLD = 2;

    const updateVisibility = () => {
        const modalEls = document.querySelectorAll('[id$="Modal"]');
        const hasOpenModal = [...modalEls].some(
            (m) => !m.classList.contains('hidden') && !m.closest('.hidden'),
        );
        const { el: scrollEl, isDocument } = getScrollContainer();
        let scrollHeight, clientHeight, scrollTop;
        if (isDocument) {
            scrollHeight = document.documentElement.scrollHeight;
            clientHeight = window.innerHeight;
            scrollTop = window.scrollY ?? document.documentElement.scrollTop ?? 0;
        } else {
            scrollHeight = scrollEl.scrollHeight;
            clientHeight = scrollEl.clientHeight;
            scrollTop = scrollEl.scrollTop ?? 0;
        }
        const overflowDelta = scrollHeight - clientHeight;
        const show = !hasOpenModal && overflowDelta > 1;
        const canScrollUp = scrollTop > SCROLL_THRESHOLD;
        const canScrollDown = scrollTop + clientHeight < scrollHeight - SCROLL_THRESHOLD;

        container.classList.toggle('opacity-0', !show);
        container.classList.toggle('pointer-events-none', !show);
        container.setAttribute('aria-hidden', show ? 'false' : 'true');

        scrollUpBtn.disabled = !show || !canScrollUp;
        scrollDownBtn.disabled = !show || !canScrollDown;
    };

    const scrollToTop = () => {
        const { el: scrollEl, isDocument } = getScrollContainer();
        if (isDocument) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const scrollToBottom = () => {
        const { el: scrollEl, isDocument } = getScrollContainer();
        if (isDocument) {
            window.scrollTo({
                top: document.documentElement.scrollHeight - window.innerHeight,
                behavior: 'smooth',
            });
        } else {
            scrollEl.scrollTo({
                top: scrollEl.scrollHeight - scrollEl.clientHeight,
                behavior: 'smooth',
            });
        }
    };

    scrollUpBtn.addEventListener('click', scrollToTop);
    scrollDownBtn.addEventListener('click', scrollToBottom);

    const onScroll = () => requestAnimationFrame(updateVisibility);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateVisibility);
    const attachMainScrollListener = () => {
        const m = document.getElementById('appContent')?.querySelector('main');
        if (m && !m.dataset.scrollNavListener) {
            m.dataset.scrollNavListener = '1';
            m.addEventListener('scroll', onScroll, { passive: true });
        }
    };
    const attachNestedScrollListeners = () => {
        const { el, isDocument } = getScrollContainer();
        if (!isDocument && el) {
            const main = document.getElementById('appContent')?.querySelector('main');
            if (el !== main && !el.dataset.scrollNavListener) {
                el.dataset.scrollNavListener = '1';
                el.addEventListener('scroll', onScroll, { passive: true });
            }
        }
    };
    attachMainScrollListener();
    attachNestedScrollListeners();
    document.addEventListener('click', (e) => {
        if (e.target.closest('.tab-btn') || e.target.closest('[data-action]')) {
            requestAnimationFrame(updateVisibility);
            setTimeout(updateVisibility, 220);
        }
    });
    const observer = new MutationObserver(() => {
        requestAnimationFrame(updateVisibility);
        attachMainScrollListener();
        attachNestedScrollListeners();
    });
    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class'],
    });

    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => requestAnimationFrame(updateVisibility));
        const appContent = document.getElementById('appContent');
        if (appContent) ro.observe(appContent);
        if (document.body) ro.observe(document.body);
    }

    updateVisibility();
    [100, 300, 500, 1000].forEach((ms) => setTimeout(updateVisibility, ms));
    window.updateScrollNavVisibility = updateVisibility;

    // Отладка: в консоли вызовите window.debugScrollNav() для проверки состояния
    window.debugScrollNav = () => {
        const appContent = document.getElementById('appContent');
        const main = appContent?.querySelector('main');
        const visibleTab = appContent?.querySelector('.tab-content:not(.hidden)');
        const modalEls = document.querySelectorAll('[id$="Modal"]');
        const hasOpenModal = [...modalEls].some(
            (m) => !m.classList.contains('hidden') && !m.closest('.hidden'),
        );
        const docDelta = document.documentElement.scrollHeight - window.innerHeight;
        const mainDelta = main ? main.scrollHeight - main.clientHeight : null;
        const { el, isDocument } = getScrollContainer();
        const overflowDelta = isDocument
            ? docDelta
            : (el?.scrollHeight ?? 0) - (el?.clientHeight ?? 0);
        return {
            hasOpenModal,
            docDelta,
            mainDelta,
            scrollContainer: isDocument ? 'document' : el?.id || el?.className || 'element',
            overflowDelta,
            show: !hasOpenModal && overflowDelta > 1,
            visibleTab: visibleTab?.id,
        };
    };
}

// showNotification и showBookmarkDetailModal определены ниже как function declarations
// Благодаря hoisting они доступны здесь, но мы не можем их переопределить
// Поэтому используем их напрямую в зависимостях

// App Init Dependencies
setAppInitDependencies({
    loadingOverlayManager,
    NotificationService,
    initDB,
    loadInitialFavoritesCache,
    handleFavoriteActionClick,
    setActiveTab,
    loadUserPreferences,
    loadCategoryInfo,
    loadFromIndexedDB,
    ensureSearchIndexIsBuilt,
    checkAndBuildIndex,
    setSearchDependencies,
    algorithms,
    showNotification,
    showAlgorithmDetail,
    showBookmarkDetailModal,
    showReglamentDetail,
    showReglamentsForCategory,
    debounce,
    categoryDisplayInfo,
    initSearchSystem,
    initBookmarkSystem,
    initCibLinkSystem,
    initViewToggles,
    initReglamentsSystem,
    initClientDataSystem,
    initExternalLinksSystem,
    initTimerSystem,
    initSedoTypesSystem,
    initBlacklistSystem,
    initFNSCertificateRevocationSystem,
    initAlgorithmsPdfExportSystem,
    initBackgroundHealthTestsSystem,
    initReloadButton,
    initClearDataFunctionality,
    initUICustomization,
    initHotkeysModal,
    setupHotkeys,
    initFullscreenToggles,
    fullscreenModalConfigs: FULLSCREEN_MODAL_CONFIGS,
    initHeaderButtons,
    initThemeToggle,
    initModalOverlayHandler,
    initAlgorithmModalControls,
    applyInitialUISettings,
    initUI,
    initScrollNavButtons,
    initAutoExpandTextareas,
    highlightClientNotesWindow: highlightClientNotesWindowModule,
    isClientNotesWindowOpen: isClientNotesWindowOpenModule,
});
console.log('[script.js] Зависимости модуля appInit установлены');

// ============================================================================
// УСТАНОВКА ЗАВИСИМОСТЕЙ ДЛЯ МОДУЛЕЙ (ДО window.onload)
// ============================================================================
// Важно: все зависимости должны быть установлены ДО вызова appInit в window.onload

// Data Loader Dependencies - устанавливаются НИЖЕ, после определения DEFAULT_MAIN_ALGORITHM и DEFAULT_OTHER_SECTIONS (см. строку ~1776)

// Ext Links Init Dependencies - устанавливаем ДО вызова initExternalLinksSystem
// ВАЖНО: Используем модули напрямую, так как wrapper функции определены позже
setExtLinksInitDependencies({
    State,
    showAddEditExtLinkModal: showAddEditExtLinkModalModule,
    showOrganizeExtLinkCategoriesModal: showOrganizeExtLinkCategoriesModalModule,
    filterExtLinks: filterExtLinksModule, // Используем модуль, так как wrapper определен позже
    handleExtLinkAction: handleExtLinkActionModule,
    handleViewToggleClick: handleViewToggleClickModule,
    loadExtLinks: loadExtLinksModule, // Используем модуль, так как wrapper определен позже
    populateExtLinkCategoryFilter: populateExtLinkCategoryFilterModule, // Используем модуль, так как wrapper определен позже
    getAllExtLinks,
    renderExtLinks: renderExtLinksModule,
    debounce,
    setupClearButton,
});
console.log('[script.js] Зависимости модуля Ext Links Init установлены');

// Bookmarks Dependencies - устанавливаем ДО вызова initBookmarkSystem
// Используем *Module-импорты для функций, определённых ниже (избегаем TDZ)
setBookmarksDependencies({
    isFavorite,
    getFavoriteButtonHTML,
    showAddBookmarkModal: showAddBookmarkModalModule,
    showBookmarkDetail: showBookmarkDetailModal,
    showOrganizeFoldersModal: showOrganizeFoldersModalModule,
    showNotification,
    debounce,
    setupClearButton,
    loadFoldersList: loadFoldersListModule,
    removeEscapeHandler,
    getVisibleModals,
    addEscapeHandler,
    handleSaveFolderSubmit: handleSaveFolderSubmitModule,
    getAllFromIndex,
    State,
    showEditBookmarkModal,
    deleteBookmark: deleteBookmarkModule,
    showBookmarkDetailModal,
    handleViewBookmarkScreenshots: handleViewBookmarkScreenshotsModule,
    NotificationService,
    showScreenshotViewerModal,
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Bookmarks установлены');

// UI Init Dependencies - устанавливаем ДО вызова initUI
setUIInitDependencies({
    State,
    setActiveTab,
    getVisibleModals,
    getTopmostModal,
    toggleModalFullscreen: toggleModalFullscreenModule,
    showNotification,
    renderFavoritesPage,
    updateVisibleTabs,
    showBlacklistWarning,
    hotkeysModalConfig,
});
console.log('[script.js] Зависимости модуля UI Init установлены');

// Initialize BackgroundStatusHUD early so it's available for app-init
if (typeof initBackgroundStatusHUD === 'function' && !window.BackgroundStatusHUD) {
    try {
        window.BackgroundStatusHUD = initBackgroundStatusHUD();
        console.log('[script.js] BackgroundStatusHUD инициализирован до window.onload');
    } catch (e) {
        console.error('[script.js] Ошибка ранней инициализации BackgroundStatusHUD:', e);
    }
}

// PR11: window.onload вынесен в js/app/onload-handler.js
setOnloadHandlerDependencies({
    NotificationService,
    loadingOverlayManager,
    appInit,
    initGoogleDocSections,
    setupTabsOverflow,
    initTabClickDelegation,
    updateVisibleTabs,
    initUISettingsModalHandlers:
        typeof initUISettingsModalHandlersModule === 'function'
            ? initUISettingsModalHandlersModule
            : null,
    backgroundStatusHUD: window.BackgroundStatusHUD || null,
    afterInitCallbacks: [
        () => {
            setAlgorithmsPdfExportDependencies({ algorithms, ExportService, showNotification, getFromIndexedDB });
            if (typeof initAlgorithmsPdfExportSystem === 'function')
                initAlgorithmsPdfExportSystem();
        },
        () => {
            if (typeof initFNSCertificateRevocationSystem === 'function')
                initFNSCertificateRevocationSystem();
        },
        () => {
            setTimeout(() => {
                if (typeof loadBookmarksModule === 'function') loadBookmarksModule();
            }, 150);
        },
        () => {
            const onTabShown = (e) => {
                if (e?.detail?.tabId === 'xmlAnalyzer') {
                    const root = document.getElementById('xmlAnalyzerContent');
                    if (root && typeof initXmlAnalyzer === 'function') initXmlAnalyzer(root);
                    document.removeEventListener('copilot1co:tabShown', onTabShown);
                }
            };
            document.addEventListener('copilot1co:tabShown', onTabShown);
        },
    ],
});
registerOnloadHandler();

// loadUserPreferences и saveUserPreferences теперь импортируются из js/app/user-preferences.js
async function loadUserPreferences() {
    return loadUserPreferencesModule();
}

async function saveUserPreferences() {
    return saveUserPreferencesModule();
}

// initDB теперь импортируется из db/indexeddb.js
// ensureSearchIndexIsBuilt импортируется из js/features/search.js

async function rebuildSearchIndexNow() {
    if (!State.db) {
        showNotification(
            'База данных не инициализирована. Пересборка индекса недоступна.',
            'warning',
        );
        return false;
    }
    try {
        showNotification('Запущена полная пересборка поискового индекса...', 'info', 3500);
        await cleanAndRebuildSearchIndex();
        showNotification('Поисковый индекс успешно пересобран.', 'success', 3500);
        return true;
    } catch (error) {
        console.error('[rebuildSearchIndexNow] Ошибка пересборки индекса:', error);
        showNotification('Ошибка пересборки поискового индекса.', 'error');
        return false;
    }
}

// loadCategoryInfo и saveCategoryInfo импортируются из js/components/reglaments.js

// Wrapper для модуля reglaments.js
// Reglaments operations functions теперь импортируются из js/components/reglaments.js
const handleReglamentAction = handleReglamentActionModule;
const populateReglamentCategoryDropdowns = populateReglamentCategoryDropdownsModule;

// ============================================================================
// populateReglamentCategoryDropdowns - MIGRATED to js/components/reglaments.js
// ============================================================================
// populateReglamentCategoryDropdowns - imported from reglaments.js module

// Все функции БД и favorites теперь импортируются из модулей db/
// Обёртки удалены - используем импортированные функции напрямую

// Wrapper для модуля theme.js
function setTheme(mode) {
    return setThemeModule(mode);
}

// renderAllAlgorithms теперь импортируется из js/components/algorithms.js
const renderAllAlgorithms = renderAllAlgorithmsModule;

// renderAlgorithmCards теперь импортируется из js/components/algorithms.js
const renderAlgorithmCards = renderAlgorithmCardsModule;

// renderMainAlgorithm теперь импортируется из js/components/main-algorithm.js
const renderMainAlgorithm = renderMainAlgorithmModule;

// loadMainAlgoCollapseState и saveMainAlgoCollapseState теперь импортируются из js/components/main-algorithm.js
const loadMainAlgoCollapseState = loadMainAlgoCollapseStateModule;
const saveMainAlgoCollapseState = saveMainAlgoCollapseStateModule;

// loadFromIndexedDB и saveDataToIndexedDB теперь импортируются из js/app/data-loader.js
async function loadFromIndexedDB() {
    return loadFromIndexedDBModule();
}

async function saveDataToIndexedDB() {
    return saveDataToIndexedDBModule();
}

// tabsConfig, allPanelIdsForDefault, defaultPanelOrder теперь импортируются из config.js

// loadUISettings и saveUISettings импортируются из js/ui/ui-settings.js

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

const DEFAULT_MAIN_ALGORITHM = JSON.parse(JSON.stringify(algorithms.main));

const DEFAULT_OTHER_SECTIONS = {};
for (const sectionKey in algorithms) {
    if (sectionKey !== 'main' && Object.prototype.hasOwnProperty.call(algorithms, sectionKey)) {
        DEFAULT_OTHER_SECTIONS[sectionKey] = JSON.parse(JSON.stringify(algorithms[sectionKey]));
    }
}

// Data Loader Dependencies - устанавливаем здесь, после определения DEFAULT_MAIN_ALGORITHM и DEFAULT_OTHER_SECTIONS
setDataLoaderDependencies({
    DEFAULT_MAIN_ALGORITHM,
    DEFAULT_OTHER_SECTIONS,
    algorithms,
    renderAllAlgorithms,
    renderMainAlgorithm,
    loadBookmarks: typeof loadBookmarksModule !== 'undefined' ? loadBookmarksModule : loadBookmarks,
    loadReglaments: typeof loadReglamentsModule !== 'undefined' ? loadReglamentsModule : null,
    loadCibLinks: typeof loadCibLinksModule !== 'undefined' ? loadCibLinksModule : null,
    loadExtLinks,
    getClientData,
    showNotification,
});
console.log('[script.js] Зависимости модуля Data Loader установлены');

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

// saveNewAlgorithm теперь импортируется из js/components/algorithms-save.js
async function saveNewAlgorithm() {
    return saveNewAlgorithmModule();
}

// initUI уже определена выше на строке 967

// setActiveTab уже определена выше на строке 1000

// renderAlgorithmCards теперь импортируется из js/components/algorithms.js

// handleNoInnLinkClick теперь импортируется из js/ui/hotkeys-handler.js
function handleNoInnLinkClick(event) {
    return handleNoInnLinkClickModule(event);
}

// ============================================================================
// handleNoInnLinkClick - MIGRATED to js/ui/hotkeys-handler.js
// ============================================================================
// handleNoInnLinkClick - imported from hotkeys-handler.js module

// renderMainAlgorithm, loadMainAlgoCollapseState и saveMainAlgoCollapseState теперь импортируются из js/components/main-algorithm.js

// Wrapper для модуля Screenshots
async function showScreenshotViewerModal(screenshots, algorithmId, algorithmTitle) {
    return showScreenshotViewerModalModule(screenshots, algorithmId, algorithmTitle);
}

// Wrapper для модуля Screenshots
function renderScreenshotThumbnails(container, screenshots, onOpenLightbox, modalState = null) {
    return renderScreenshotThumbnailsModule(container, screenshots, onOpenLightbox, modalState);
}

// Wrapper для модуля Screenshots
function renderScreenshotList(
    container,
    screenshots,
    onOpenLightbox,
    onItemClick = null,
    modalState = null,
) {
    return renderScreenshotListModule(
        container,
        screenshots,
        onOpenLightbox,
        onItemClick,
        modalState,
    );
}

// escapeHtml, normalizeBrokenEntities, decodeBasicEntitiesOnce импортируются из utils/html.js

// showAlgorithmDetail теперь импортируется из js/components/algorithms-renderer.js

// initStepInteractions теперь импортируется из js/ui/init.js
const initStepInteractions = initStepInteractionsModule;

// initCollapseAllButtons теперь импортируется из js/ui/init.js
const initCollapseAllButtons = initCollapseAllButtonsModule;

// Функции работы с видами отображения теперь импортируются из js/ui/view-manager.js
// initViewToggles уже определена выше на строке 973
const loadViewPreferences = loadViewPreferencesModule;
const applyDefaultViews = applyDefaultViewsModule;
const saveViewPreference = saveViewPreferenceModule;
const handleViewToggleClick = handleViewToggleClickModule;

// handleViewToggleClick теперь импортируется из js/ui/view-manager.js
// Старая функция полностью удалена - используется импортированная версия

// applyView теперь импортируется из js/ui/view-manager.js
const applyView = applyViewModule;

// applyCurrentView теперь импортируется из js/ui/view-manager.js
const applyCurrentView = applyCurrentViewModule;

// ============================================================================
// createStepElementHTML - MIGRATED to js/components/algorithms.js
// ============================================================================
// createStepElementHTML - imported from algorithms.js module

// editAlgorithm теперь импортируется из js/components/algorithms-operations.js
const editAlgorithm = editAlgorithmModule;

// ============================================================================
// editAlgorithm - MIGRATED to js/components/algorithms-operations.js
// ============================================================================
// editAlgorithm - imported from algorithms-operations.js module

// Wrapper для модуля algorithms.js
function initStepSorting(containerElement) {
    return initStepSortingModule(containerElement);
}

// Wrapper для модуля algorithms.js
function addEditStep() {
    return addEditStepModule();
}

// saveAlgorithm теперь импортируется из js/components/algorithms-save.js
async function saveAlgorithm() {
    return saveAlgorithmModule();
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

// Переключение темы: обработчик вешается в initThemeToggle (theme-toggle.js), вызываемом из initUI.

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

// initBookmarkSystem уже определена выше на строке 961

// Bookmarks modal functions теперь импортируются из js/features/bookmarks-modal.js
const ensureBookmarkModal = ensureBookmarkModalModule;
const showAddBookmarkModal = showAddBookmarkModalModule;

// Bookmarks operations functions теперь импортируются из js/components/bookmarks.js
const showOrganizeFoldersModal = showOrganizeFoldersModalModule;
const filterBookmarks = filterBookmarksModule;
const populateBookmarkFolders = populateBookmarkFoldersModule;
const loadFoldersList = loadFoldersListModule;
const handleSaveFolderSubmit = handleSaveFolderSubmitModule;

// getAllFromIndex импортируется напрямую из js/db/indexeddb.js (строка 88)
// Используем напрямую

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

// Bookmarks form submit function теперь импортируется из js/features/bookmarks-form.js
const handleBookmarkFormSubmit = handleBookmarkFormSubmitModule;

// loadBookmarks теперь импортируется из js/components/bookmarks.js
async function loadBookmarks() {
    return loadBookmarksModule();
}

// Wrapper для модуля bookmarks
async function getAllBookmarks() {
    return getAllBookmarksModule();
}

// initExternalLinksSystem уже определена выше на строке 962

// loadExtLinks теперь импортируется из js/components/ext-links.js
async function loadExtLinks() {
    return loadExtLinksModule();
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

// Ext Links functions теперь импортируются из js/features/ext-links-form.js и ext-links-modal.js
const handleExtLinkFormSubmit = handleExtLinkFormSubmitModule;
const ensureExtLinkModal = ensureExtLinkModalModule;
const showAddExtLinkModal = showAddExtLinkModalModule;
const showEditExtLinkModal = showEditExtLinkModalModule;
const showAddEditExtLinkModal = showAddEditExtLinkModalModule;

// Ext Links Categories functions теперь импортируются из js/features/ext-links-categories.js
const showOrganizeExtLinkCategoriesModal = showOrganizeExtLinkCategoriesModalModule;
const handleSaveExtLinkCategorySubmit = handleSaveExtLinkCategorySubmitModule;
const handleDeleteExtLinkCategoryClick = handleDeleteExtLinkCategoryClickModule;
const populateExtLinkCategoryFilter = populateExtLinkCategoryFilterModule;

// Ext Links Actions functions теперь импортируются из js/features/ext-links-actions.js
const filterExtLinks = filterExtLinksModule;
const handleExtLinkAction = handleExtLinkActionModule;

// populateModalControls теперь импортируется из js/ui/ui-settings-modal.js
function populateModalControls(settings) {
    return populateModalControlsModule(settings);
}

// ============================================================================
// populateModalControls - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// populateModalControls - imported from ui-settings-modal.js module

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

// applyUISettings теперь импортируется из js/ui/ui-settings.js
async function applyUISettings() {
    return applyUISettingsModule();
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

// resetUISettingsInModal теперь импортируется из js/ui/ui-settings-modal.js
async function resetUISettingsInModal() {
    return resetUISettingsInModalModule();
}

// ============================================================================
// resetUISettingsInModal - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// resetUISettingsInModal - imported from ui-settings-modal.js module

// applyInitialUISettings уже определена выше на строке 970

// initClearDataFunctionality уже определена выше на строке 969

// clearAllApplicationData теперь импортируется из js/app/data-clear.js
async function clearAllApplicationData(progressCallback) {
    return clearAllApplicationDataModule(progressCallback);
}

// createPanelItemElement теперь импортируется из js/ui/ui-settings-modal.js
function createPanelItemElement(id, name, isVisible = true) {
    return createPanelItemElementModule(id, name, isVisible);
}

// ============================================================================
// createPanelItemElement - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// createPanelItemElement - imported from ui-settings-modal.js module

// applyThemeClass и onSystemThemeChange импортируются из js/components/theme.js

// applyPreviewSettings теперь импортируется из js/ui/preview-settings.js
async function applyPreviewSettings(settings) {
    return applyPreviewSettingsModule(settings);
}

// User Preferences Dependencies - устанавливаем ДО использования в appInit
setUserPreferencesDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    defaultPanelOrder,
    tabsConfig,
    showNotification,
});
console.log('[script.js] Зависимости модуля User Preferences установлены');

// Preview Settings Dependencies
setPreviewSettingsDependencies({
    DEFAULT_UI_SETTINGS,
    calculateSecondaryColor: calculateSecondaryColorModule,
    hexToHsl: hexToHslModule,
    hslToHex: hslToHexModule,
    adjustHsl: adjustHslModule,
    setTheme: typeof setThemeModule !== 'undefined' ? setThemeModule : setTheme,
});
console.log('[script.js] Зависимости модуля Preview Settings установлены');

// UI Settings Modal Dependencies
// defaultPanelVisibility вычисляется динамически, поэтому передаем null и используем fallback в модуле
setUISettingsModalDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    tabsConfig,
    defaultPanelOrder,
    defaultPanelVisibility: null, // Вычисляется динамически в script.js, в модуле используется fallback
    showNotification,
    deleteFromIndexedDB,
    removeCustomBackgroundImage: removeCustomBackgroundImageModule,
    applyPreviewSettings: applyPreviewSettingsModule,
    setColorPickerStateFromHex: setColorPickerStateFromHexModule,
    handleModalVisibilityToggle: handleModalVisibilityToggleModule,
});
console.log('[script.js] Зависимости модуля UI Settings Modal установлены');

// UI Settings Dependencies
// defaultPanelVisibility вычисляется динамически на основе defaultPanelOrder
const defaultPanelVisibility = defaultPanelOrder.map(
    (id) => !(id === 'sedoTypes' || id === 'blacklistedClients'),
);

setUISettingsDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    tabsConfig,
    defaultPanelOrder,
    defaultPanelVisibility,
    applyPreviewSettings: applyPreviewSettingsModule,
    showNotification,
    loadUserPreferences:
        typeof loadUserPreferencesModule !== 'undefined'
            ? loadUserPreferencesModule
            : loadUserPreferences,
    saveUserPreferences:
        typeof saveUserPreferencesModule !== 'undefined'
            ? saveUserPreferencesModule
            : saveUserPreferences,
    getSettingsFromModal: getSettingsFromModalModule,
    applyPanelOrderAndVisibility: applyPanelOrderAndVisibilityModule,
    ensureTabPresent:
        typeof ensureTabPresentModule !== 'undefined' ? ensureTabPresentModule : ensureTabPresent,
    setupTabsOverflow:
        typeof setupTabsOverflowModule !== 'undefined'
            ? setupTabsOverflowModule
            : setupTabsOverflow,
    updateVisibleTabs:
        typeof updateVisibleTabsModule !== 'undefined'
            ? updateVisibleTabsModule
            : updateVisibleTabs,
});
console.log('[script.js] Зависимости модуля UI Settings установлены');

// Wrapper для модуля color.js
function hexToHsl(hex) {
    return hexToHslModule(hex);
}

// Wrapper для модуля color.js
function hslToHex(h, s, l) {
    return hslToHexModule(h, s, l);
}

// Color Picker Dependencies (после hexToHsl/hslToHex)
setColorPickerDependencies({
    State,
    applyPreviewSettings: applyPreviewSettingsModule,
    updatePreviewSettingsFromModal: updatePreviewSettingsFromModalModule,
    hexToHsl,
    hslToHex,
    DEFAULT_UI_SETTINGS,
});
console.log('[script.js] Зависимости модуля Color Picker установлены');

// Wrapper для модуля color.js
function getLuminance(hex) {
    return getLuminanceModule(hex);
}

// Wrapper для модуля color.js
function adjustHsl(hsl, l_adjust = 0, s_adjust = 0) {
    return adjustHslModule(hsl, l_adjust, s_adjust);
}

// applyPanelOrderAndVisibility теперь импортируется из js/components/tabs.js
function applyPanelOrderAndVisibility(order, visibility) {
    return applyPanelOrderAndVisibilityModule(order, visibility);
}

// handleModalVisibilityToggle теперь импортируется из js/ui/ui-settings-modal.js
function handleModalVisibilityToggle(event) {
    return handleModalVisibilityToggleModule(event);
}

// getSettingsFromModal теперь импортируется из js/ui/ui-settings-modal.js
function getSettingsFromModal() {
    return getSettingsFromModalModule();
}

// updatePreviewSettingsFromModal теперь импортируется из js/ui/ui-settings-modal.js
function updatePreviewSettingsFromModal() {
    return updatePreviewSettingsFromModalModule();
}

// ============================================================================
// handleModalVisibilityToggle, getSettingsFromModal, updatePreviewSettingsFromModal - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// Эти функции импортированы из ui-settings-modal.js module

// deleteAlgorithm теперь импортируется из js/components/algorithms-save.js
async function deleteAlgorithm(algorithmId, section) {
    return deleteAlgorithmModule(algorithmId, section);
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

    const confirmed =
        typeof showAppConfirmModule === 'function'
            ? await showAppConfirmModule({
                  title: 'Удаление алгоритма',
                  message: `Вы уверены, что хотите удалить алгоритм «${algorithmTitle}»? Это действие необратимо.`,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : confirm(
                  `Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`,
              );
    if (confirmed) {
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
    '#addLk1cAlgorithmBtn',
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

// Обработчик клика по кнопкам «Сохранить» в модалках редактирования/добавления алгоритма
document.addEventListener('click', (event) => {
    const saveEditBtn = event.target.closest('#saveAlgorithmBtn');
    const saveNewBtn = event.target.closest('#saveNewAlgorithmBtn');
    if (saveEditBtn) {
        const editModal = document.getElementById('editModal');
        if (editModal && !editModal.classList.contains('hidden')) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof saveAlgorithm === 'function') saveAlgorithm();
        }
        return;
    }
    if (saveNewBtn) {
        const addModal = document.getElementById('addModal');
        if (addModal && !addModal.classList.contains('hidden')) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof saveNewAlgorithm === 'function') saveNewAlgorithm();
        }
        return;
    }
});

// Обработчик клика по кнопкам «Добавить шаг» в модалках редактирования и создания алгоритма
document.addEventListener('click', (event) => {
    const addNewStepBtn = event.target.closest('#addNewStepBtn');
    const addStepBtn = event.target.closest('#addStepBtn');
    if (addNewStepBtn) {
        const addModal = document.getElementById('addModal');
        if (addModal && !addModal.classList.contains('hidden')) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof addNewStep === 'function') addNewStep(false);
        }
        return;
    }
    if (addStepBtn) {
        const editModal = document.getElementById('editModal');
        if (editModal && !editModal.classList.contains('hidden')) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof addEditStep === 'function') addEditStep();
        }
        return;
    }
});

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

        if (
            topmostModal.id === 'editModal' ||
            topmostModal.id === 'addModal' ||
            topmostModal.id === 'customizeUIModal'
        ) {
            if (typeof requestCloseModal === 'function') {
                if (requestCloseModal(topmostModal) !== false) {
                    topmostModal.classList.add('hidden');
                    if (typeof removeEscapeHandler === 'function')
                        removeEscapeHandler(topmostModal);
                }
            } else {
                topmostModal.classList.add('hidden');
                if (typeof removeEscapeHandler === 'function') removeEscapeHandler(topmostModal);
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

// initFullscreenToggles уже определена выше на строке 965
// Вызываем её с конфигами модальных окон при необходимости
// (используется напрямую из модуля, обертка не нужна)

// toggleModalFullscreen теперь импортируется из js/ui/modals-manager.js
const toggleModalFullscreen = toggleModalFullscreenModule;

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
// initReloadButton уже определена выше на строке 964

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

// showNoInnModal теперь импортируется из js/ui/modals-manager.js
function showNoInnModal() {
    return showNoInnModalModule(addEscapeHandler, removeEscapeHandler, getVisibleModals);
}

// ============================================================================
// showNoInnModal - MIGRATED to js/ui/modals-manager.js
// ============================================================================
// showNoInnModal - imported from modals-manager.js module

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

// setupHotkeys уже определена выше на строке 966

// toggleActiveSectionView теперь импортируется из js/ui/view-manager.js
const toggleActiveSectionView = toggleActiveSectionViewModule;

function toggleActiveSectionViewOriginal() {
    if (typeof State.currentSection === 'undefined' || !State.currentSection) {
        console.warn(
            'toggleActiveSectionView: Переменная State.currentSection не определена или пуста.',
        );
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
        State.viewPreferences[sectionIdentifierForPrefs] ||
        container.dataset.defaultView ||
        'cards';
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

// handleNoInnLinkEvent и navigateBackWithinApp теперь импортируются из js/ui/hotkeys-handler.js
function handleNoInnLinkEvent(event) {
    return handleNoInnLinkEventModule(event);
}

function navigateBackWithinApp() {
    return navigateBackWithinAppModule();
}

// handleGlobalHotkey теперь импортируется из js/ui/hotkeys-handler.js
function handleGlobalHotkey(event) {
    return handleGlobalHotkeyModule(event);
}

// ============================================================================
// handleGlobalHotkey - MIGRATED to js/ui/hotkeys-handler.js
// ============================================================================
// Оригинальная функция handleGlobalHotkey была здесь, но теперь мигрирована в модуль
// Старая версия функции handleGlobalHotkey была удалена после миграции в js/ui/hotkeys-handler.js

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

// initHotkeysModal уже определена выше на строке 968

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

// Bookmarks DOM operations теперь импортируются из js/features/bookmarks-dom.js
const addBookmarkToDOM = addBookmarkToDOMModule;
const updateBookmarkInDOM = updateBookmarkInDOMModule;
const removeBookmarkFromDOM = removeBookmarkFromDOMModule;

// Wrapper для модуля step-management.js
function attachStepDeleteHandler(
    deleteButton,
    stepElement,
    containerElement,
    section,
    mode = 'edit',
) {
    return attachStepDeleteHandlerModule(
        deleteButton,
        stepElement,
        containerElement,
        section,
        mode,
    );
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

/**
 * Запрос на закрытие модалки (Escape / клик по оверлею).
 * Централизованная проверка: предупреждение «Выйти без сохранения» показывается только при наличии несохранённых изменений (реестр unsaved-changes-registry).
 * @param {HTMLElement} modal - модальное окно
 * @returns {boolean} false — закрытие отменено (показан диалог); true — можно закрыть (закрытие выполняет вызывающий код или closeModalNow)
 */
function requestCloseModal(modal) {
    if (!modal) return true;
    const closeModalNow = () => {
        modal.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open', 'overflow-hidden');
        }
    };

    const confirmAndClose = () => {
        if (typeof showUnsavedConfirmModalModule === 'function') {
            showUnsavedConfirmModalModule().then((leave) => {
                if (leave) closeModalNow();
            });
            return false;
        }
        return true;
    };

    if (shouldConfirmBeforeClose(modal)) {
        return confirmAndClose();
    }
    return true;
}

// Регистрация проверок несохранённых изменений для модалок (централизованная система)
function initUnsavedChangesRegistry() {
    registerModalDirtyCheck('editModal', () =>
        typeof hasChanges === 'function' ? hasChanges('edit') : false,
    );
    registerModalDirtyCheck('addModal', () =>
        typeof hasChanges === 'function' ? hasChanges('add') : false,
    );
    registerModalDirtyCheck('customizeUIModal', () => Boolean(State && State.isUISettingsDirty));
    registerModalDirtyCheck('bookmarkModal', (modal) => {
        try {
            const form = modal.querySelector('#bookmarkForm');
            if (
                !form ||
                !State.initialBookmarkFormState ||
                typeof getCurrentBookmarkFormState !== 'function' ||
                typeof deepEqual !== 'function'
            )
                return false;
            const currentState = getCurrentBookmarkFormState(form);
            return !deepEqual(State.initialBookmarkFormState, currentState);
        } catch (e) {
            console.warn('[unsaved-changes-registry] bookmarkModal check failed:', e);
            return false;
        }
    });
    registerModalDirtyCheck('extLinkModal', (modal) => {
        try {
            const form = modal.querySelector('#extLinkForm');
            const initialRaw = modal.dataset.initialFormState || '';
            if (!form || !initialRaw || typeof deepEqual !== 'function') return false;
            const initialState = JSON.parse(initialRaw);
            const currentState = {
                title: form.elements?.extLinkTitle?.value || '',
                url: form.elements?.extLinkUrl?.value || '',
                description: form.elements?.extLinkDescription?.value || '',
                category: form.elements?.extLinkCategory?.value || '',
            };
            return !deepEqual(initialState, currentState);
        } catch (e) {
            console.warn('[unsaved-changes-registry] extLinkModal check failed:', e);
            return false;
        }
    });
}
initUnsavedChangesRegistry();

// Отмена и крестик в модалках редактирования/добавления алгоритма — через requestCloseModal (проверка несохранённых)
document.addEventListener('click', (e) => {
    const cancelEdit = e.target.closest('#cancelEditBtn');
    const cancelAdd = e.target.closest('#cancelAddBtn');
    const closeEdit = e.target.closest('#closeEditModalBtn');
    const closeAdd = e.target.closest('#closeAddModalBtn');
    const modal =
        cancelEdit || closeEdit
            ? document.getElementById('editModal')
            : cancelAdd || closeAdd
              ? document.getElementById('addModal')
              : null;
    if (!modal || modal.classList.contains('hidden')) return;
    if (!cancelEdit && !cancelAdd && !closeEdit && !closeAdd) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof requestCloseModal !== 'function') {
        modal.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
        if (getVisibleModals().length === 0)
            document.body.classList.remove('modal-open', 'overflow-hidden');
        return;
    }
    if (requestCloseModal(modal) !== false) {
        modal.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
        if (getVisibleModals().length === 0)
            document.body.classList.remove('modal-open', 'overflow-hidden');
    }
});

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

// showAddModal теперь импортируется из js/components/algorithms-operations.js
const showAddModal = showAddModalModule;

// ============================================================================
// showAddModal - MIGRATED to js/components/algorithms-operations.js
// ============================================================================
// showAddModal - imported from algorithms-operations.js module

// ============================================================================
// BLACKLIST SYSTEM - MIGRATED to js/features/blacklist.js
// ============================================================================
// All blacklist-related functions are now imported from the blacklist module.
// See: js/features/blacklist.js
// Wrapper functions below maintain backward compatibility.

// initBlacklistSystem уже определена выше на строке 963

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

// applyClientNotesFontSize теперь импортируется из js/features/client-data.js
function applyClientNotesFontSize() {
    return applyClientNotesFontSizeModule();
}

// ============================================================================
// applyClientNotesFontSize - MIGRATED to js/features/client-data.js
// ============================================================================
// applyClientNotesFontSize - imported from client-data.js module

// createClientNotesInnPreview теперь импортируется из js/features/client-data.js
function createClientNotesInnPreview(textarea) {
    return createClientNotesInnPreviewModule(textarea, escapeHtml, getVisibleModals);
}

// initClientDataSystem и ensureInnPreviewStyles импортируются из js/features/client-data-init.js
setTextareaHeightsDependencies({
    State,
    saveUserPreferences: saveUserPreferencesModule,
    debounce,
});
setClientDataInitDependencies({
    State,
    debounce,
    saveClientData,
    checkForBlacklistedInn,
    createClientNotesInnPreview,
    copyToClipboard: copyToClipboardModule,
    getFromIndexedDB,
    applyClientNotesFontSize,
    clearClientData,
    exportClientDataToTxt,
    getVisibleModals,
    showAppConfirm: showAppConfirmModule,
    openClientNotesWindow: openClientNotesWindowModule,
    openClientNotesPopupWindow: openClientNotesPopupWindowModule,
    initTextareaHeightsPersistence: initTextareaHeightsPersistenceModule,
});
console.log('[script.js] Зависимости client-data-init установлены.');

// ============================================================================
// createClientNotesInnPreview - MIGRATED to js/features/client-data.js
// ============================================================================
// createClientNotesInnPreview - imported from client-data.js module

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

    if (
        !State.userPreferences ||
        typeof State.userPreferences.welcomeTextShownInitially === 'undefined'
    ) {
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
async function toggleFavorite(
    originalItemId,
    itemType,
    originalItemSection,
    title,
    description,
    buttonElement,
) {
    return toggleFavoriteModule(
        originalItemId,
        itemType,
        originalItemSection,
        title,
        description,
        buttonElement,
    );
}

async function updateFavoriteStatusUI(originalItemId, itemType, isFavoriteStatus) {
    return updateFavoriteStatusUIModule(originalItemId, itemType, isFavoriteStatus);
}

async function renderFavoritesPage() {
    return renderFavoritesPageModule();
}

function getFavoriteButtonHTML(
    originalItemId,
    itemType,
    originalItemSection,
    title,
    description,
    isCurrentlyFavorite,
) {
    return getFavoriteButtonHTMLModule(
        originalItemId,
        itemType,
        originalItemSection,
        title,
        description,
        isCurrentlyFavorite,
    );
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
// BackgroundStatusHUD инициализируется в initBackgroundStatusHUD (background-status-hud.js) до window.onload

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ЗАВИСИМОСТЕЙ МОДУЛЕЙ
// ============================================================================
// Устанавливаем зависимости для модулей, которые их требуют

// Алиас: в приложении используется showBookmarkDetailModal для просмотра закладки
const showBookmarkDetail = showBookmarkDetailModal;
const deleteBookmark = deleteBookmarkModule;
const handleViewBookmarkScreenshots = handleViewBookmarkScreenshotsModule;

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
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Bookmarks установлены');

// App confirm/alert modal (универсальная замена confirm/alert)
setAppConfirmModalDependencies({
    addEscapeHandler,
    removeEscapeHandler,
    getVisibleModals,
});
console.log('[script.js] Зависимости модуля App Confirm Modal установлены');

// Unsaved confirm modal (для выхода из модалок без сохранения)
setUnsavedConfirmModalDependencies({
    addEscapeHandler,
    removeEscapeHandler,
    getVisibleModals,
});

// Bookmarks Modal Dependencies
setBookmarksModalDependencies({
    bookmarkModalConfigGlobal,
    State,
    getCurrentBookmarkFormState,
    deepEqual,
    showNotification,
    getVisibleModals,
    addEscapeHandler,
    removeEscapeHandler,
    toggleModalFullscreen,
    clearTemporaryThumbnailsFromContainer,
    attachBookmarkScreenshotHandlers,
    attachBookmarkPdfHandlers,
    handleBookmarkFormSubmit: handleBookmarkFormSubmitModule,
    populateBookmarkFolders,
    getFromIndexedDB,
    renderExistingThumbnail,
    showUnsavedConfirmModal: showUnsavedConfirmModalModule,
    shouldConfirmBeforeClose,
});
console.log('[script.js] Зависимости модуля Bookmarks Modal установлены');

// Bookmarks Delete Dependencies
setBookmarksDeleteDependencies({
    State,
    getFromIndexedDB,
    showNotification,
    updateSearchIndex,
    removeBookmarkFromDOM: removeBookmarkFromDOMModule,
    loadBookmarks,
    removeFromFavoritesDB,
    updateFavoriteStatusUI,
    renderFavoritesPage,
});
console.log('[script.js] Зависимости модуля Bookmarks Delete установлены');

// Bookmarks Form Submit Dependencies
setBookmarksFormDependencies({
    State,
    ARCHIVE_FOLDER_ID,
    showNotification,
    addPdfRecords,
    updateSearchIndex,
    loadBookmarks,
    getVisibleModals,
});
console.log('[script.js] Зависимости модуля Bookmarks Form установлены');

// Bookmarks DOM Operations Dependencies
setBookmarksDomDependencies({
    createBookmarkElement: createBookmarkElementModule,
    applyCurrentView,
    removeFromFavoritesDB,
    updateFavoriteStatusUI,
    renderFavoritesPage,
    State,
    SECTION_GRID_COLS,
    CARD_CONTAINER_CLASSES,
});
console.log('[script.js] Зависимости модуля Bookmarks DOM установлены');

// Ext Links Form Submit Dependencies
setExtLinksFormDependencies({
    State,
    showNotification,
    ensureExtLinkModal: ensureExtLinkModalModule,
    getFromIndexedDB,
    saveToIndexedDB,
    updateSearchIndex,
    getAllExtLinks,
    renderExtLinks: renderExtLinksModule,
    getVisibleModals,
    removeEscapeHandler,
});
console.log('[script.js] Зависимости модуля Ext Links Form установлены');

// Ext Links Modal Dependencies
setExtLinksModalDependencies({
    State,
    showNotification,
    getFromIndexedDB,
    getAllFromIndexedDB,
    removeEscapeHandler,
    addEscapeHandler,
    getVisibleModals,
    handleExtLinkFormSubmit: handleExtLinkFormSubmitModule,
    showUnsavedConfirmModal: showUnsavedConfirmModalModule,
    deepEqual,
    shouldConfirmBeforeClose,
});
console.log('[script.js] Зависимости модуля Ext Links Modal установлены');

// Ext Links Categories Dependencies
setExtLinksCategoriesDependencies({
    State,
    showNotification,
    getFromIndexedDB,
    getAllFromIndexedDB,
    getAllFromIndex,
    saveToIndexedDB,
    deleteFromIndexedDB,
    updateSearchIndex,
    removeEscapeHandler,
    addEscapeHandler,
    getVisibleModals,
    renderExtLinks: renderExtLinksModule,
    getAllExtLinks,
    populateExtLinkCategoryFilter: populateExtLinkCategoryFilterModule,
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Ext Links Categories установлены');

// Ext Links Actions Dependencies
setExtLinksActionsDependencies({
    State,
    showNotification,
    getAllExtLinks,
    renderExtLinks: renderExtLinksModule,
    showEditExtLinkModal: showEditExtLinkModalModule,
    deleteFromIndexedDB,
    updateSearchIndex,
    escapeHtml,
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Ext Links Actions установлены');

// Ext Links Init Dependencies уже установлены выше перед window.onload

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
    renderReglamentCategories: renderReglamentCategoriesModule,
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Favorites установлены');

/**
 * Возвращает объект с элементами по переданным id или null, если хотя бы один не найден.
 * @param {string[]} ids - массив id элементов
 * @returns {{ [key: string]: HTMLElement } | null}
 */
function getRequiredElementsHelper(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const result = {};
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) return null;
        result[id] = el;
    }
    return result;
}

// CIB Links System Dependencies
setCibLinksDependencies({
    showNotification,
    debounce,
    filterLinks: filterLinksModule,
    setupClearButton,
    copyToClipboard,
    handleViewToggleClick,
    applyCurrentView,
    applyView,
    updateSearchIndex,
    getVisibleModals,
    addEscapeHandler,
    removeEscapeHandler,
    getRequiredElements: getRequiredElementsHelper,
    DEFAULT_CIB_LINKS,
    showAppConfirm: showAppConfirmModule,
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
    showAppConfirm: showAppConfirmModule,
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
    loadCibLinks: loadCibLinksModule,
    renderReglamentCategories: renderReglamentCategoriesModule,
    showReglamentsForCategory,
    initSearchSystem,
    buildInitialSearchIndex,
    updateSearchIndex,
    loadSedoData,
    applyPreviewSettings,
    applyThemeOverrides,
    importFileInput,
    storeConfigs,
    loadUISettings: typeof loadUISettings !== 'undefined' ? loadUISettings : null,
    showAppConfirm: showAppConfirmModule,
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
    setActiveTab: setActiveTabModule,
    showBlacklistWarning:
        typeof showBlacklistWarningModule !== 'undefined'
            ? showBlacklistWarningModule
            : showBlacklistWarning,
    renderFavoritesPage:
        typeof renderFavoritesPageModule !== 'undefined'
            ? renderFavoritesPageModule
            : renderFavoritesPage,
    updateVisibleTabs:
        typeof updateVisibleTabsModule !== 'undefined'
            ? updateVisibleTabsModule
            : updateVisibleTabs,
    getVisibleModals:
        typeof getVisibleModalsModule !== 'undefined' ? getVisibleModalsModule : getVisibleModals,
    loadBookmarks: typeof loadBookmarksModule !== 'undefined' ? loadBookmarksModule : loadBookmarks,
});
console.log('[script.js] Зависимости модуля Tabs UI установлены');

// Делегированный обработчик кликов по вкладкам (для кнопок из HTML, созданных не через createTabButtonElement)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn || btn.id === 'moreTabsBtn') return;
    const tabId = (btn.id || '').replace(/Tab$/, '');
    if (tabId && typeof setActiveTabModule === 'function') {
        setActiveTabModule(tabId);
    }
});

// UI Init Dependencies
setUIInitDependencies({
    State,
    setActiveTab,
    getVisibleModals,
    getTopmostModal,
    toggleModalFullscreen: toggleModalFullscreenModule,
    showNotification,
    renderFavoritesPage,
    updateVisibleTabs,
    showBlacklistWarning,
    hotkeysModalConfig,
    initBackgroundSystems: initBackgroundSystemsModule,
});
console.log('[script.js] Зависимости модуля UI Init установлены');

// Systems Init Dependencies
setSystemsInitDependencies({
    State,
    DB_NAME,
    TIMER_STATE_KEY,
    BLACKLIST_WARNING_ACCEPTED_KEY,
    USER_PREFERENCES_KEY,
    CATEGORY_INFO_KEY,
    SEDO_CONFIG_KEY,
    addEscapeHandler,
    removeEscapeHandler,
    getVisibleModals,
    clearAllApplicationData,
    exportAllData,
    loadingOverlayManager,
    NotificationService,
    showNotification,
    initBackgroundHealthTestsSystem,
    setBackgroundHealthTestsDependencies,
    BackgroundStatusHUDFactory: initBackgroundStatusHUD,
});
console.log('[script.js] Зависимости модуля Systems Init установлены');

// Background Health Tests Dependencies (IndexedDB API)
setBackgroundHealthTestsDependencies({
    State,
    saveToIndexedDB,
    getFromIndexedDB,
    deleteFromIndexedDB,
    performDBOperation,
});
console.log('[script.js] Зависимости фоновых health-тестов установлены');

// Hotkeys Handler Dependencies
setHotkeysDependencies({
    showNoInnModal,
    showNotification,
    handleGlobalHotkey: handleGlobalHotkeyModule, // Теперь импортируется из модуля
    forceReloadApp,
    hasBlockingModalsOpen: hasBlockingModalsOpenModule,
    // Dependencies for handleGlobalHotkey
    State,
    CLIENT_NOTES_MAX_FONT_SIZE,
    CLIENT_NOTES_MIN_FONT_SIZE,
    CLIENT_NOTES_FONT_SIZE_STEP,
    applyClientNotesFontSize: applyClientNotesFontSizeModule,
    saveUserPreferences,
    getTopmostModal: getTopmostModalModule,
    getVisibleModals: getVisibleModalsModule,
    requestCloseModal: typeof requestCloseModal !== 'undefined' ? requestCloseModal : null,
    removeEscapeHandler,
    showAddModal: showAddModalModule,
    showAddEditCibLinkModal: showAddEditCibLinkModalModule,
    showAddExtLinkModal: showAddExtLinkModalModule,
    showAddReglamentModal: showAddReglamentModalModule,
    showAddBookmarkModal: showAddBookmarkModalModule,
    setActiveTab,
    exportAllData: exportAllDataModule,
    exportClientDataToTxt: exportClientDataToTxtModule,
    clearClientData: clearClientDataModule,
    toggleActiveSectionView: toggleActiveSectionViewModule,
    toggleTimer,
    resetTimer,
    adjustTimerDuration,
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Hotkeys Handler установлены');

// Escape Handler Dependencies (PR11)
setEscapeHandlerDependencies({ getVisibleModals, getTopmostModal, requestCloseModal });

// Header Buttons Dependencies (PR11)
setHeaderButtonsDependencies({ setActiveTab });

// Theme Toggle Dependencies (PR11)
setThemeToggleDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    setTheme,
    showNotification,
    saveUserPreferences,
    getSettingsFromModal: getSettingsFromModalModule,
    deepEqual: deepEqualModule,
});

// Modal Overlay Handler Dependencies (PR11)
setModalOverlayHandlerDependencies({
    getVisibleModals,
    getTopmostModal,
    requestCloseModal: typeof requestCloseModal !== 'undefined' ? requestCloseModal : null,
    removeEscapeHandler,
});

// Algorithm Modal Controls Dependencies (PR11)
setAlgorithmModalControlDependencies({
    deleteAlgorithm: deleteAlgorithmModule,
    showNotification,
    editAlgorithm: editAlgorithmModule,
    ExportService,
    closeAnimatedModal: closeAnimatedModalModule,
    showAppConfirm: showAppConfirmModule,
    showAddModal: showAddModalModule,
});

// Algorithms PDF Export Dependencies (PR11) — algorithms, ExportService, showNotification задаются после загрузки данных
// setAlgorithmsPdfExportDependencies вызывается в onload-handler (afterInitCallbacks) после appInit

// UI Customization Dependencies (PR11)
setUICustomizationDependencies({
    getFromIndexedDB,
    applyCustomBackgroundImage,
    setupBackgroundImageControls,
    showNotification,
});

// UI Settings Modal Init Dependencies (PR11) — часть полей задаётся ниже (applyPreviewSettings и др.)
setUISettingsModalInitDependencies({
    State,
    loadUISettings: typeof loadUISettings !== 'undefined' ? loadUISettings : null,
    populateModalControls: populateModalControlsModule,
    setColorPickerStateFromHex: setColorPickerStateFromHexModule,
    addEscapeHandler,
    openAnimatedModal: openAnimatedModalModule,
    closeAnimatedModal: closeAnimatedModalModule,
    saveUISettings: typeof saveUISettings !== 'undefined' ? saveUISettings : null,
    resetUISettingsInModal: resetUISettingsInModalModule,
    revertUISettingsOnDiscard: revertUISettingsOnDiscardModule,
    updatePreviewSettingsFromModal: updatePreviewSettingsFromModalModule,
    applyPreviewSettings: typeof applyPreviewSettings !== 'undefined' ? applyPreviewSettings : null,
    initColorPicker: initColorPickerModule,
    showUnsavedConfirmModal: showUnsavedConfirmModalModule,
    shouldConfirmBeforeClose,
    setupExtensionFieldListeners:
        typeof setupExtensionFieldListeners === 'function' ? setupExtensionFieldListeners : null,
    loadEmployeeExtension:
        typeof loadEmployeeExtension === 'function' ? loadEmployeeExtension : null,
});

// UI Settings Modal Dependencies (applyPreviewSettings определена ниже, но доступна благодаря hoisting)
// setUISettingsModalDependencies вызывается после определения applyPreviewSettings - см. после функции applyPreviewSettings

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

// Algorithms Operations Dependencies
setAlgorithmsOperationsDependencies({
    algorithms,
    showNotification,
    createStepElementHTML,
    formatExampleForTextarea,
    toggleStepCollapse,
    attachStepDeleteHandler,
    updateStepNumbers,
    initStepSorting: initStepSortingModule,
    captureInitialEditState: captureInitialEditStateModule,
    captureInitialAddState: captureInitialAddStateModule,
    openAnimatedModal: openAnimatedModalModule,
    attachScreenshotHandlers: attachScreenshotHandlersModule,
    renderExistingThumbnail: renderExistingThumbnailModule,
    addNewStep: addNewStepModule,
    getSectionName,
});
console.log('[script.js] Зависимости модуля Algorithms Operations установлены');

// Algorithms Save Dependencies
setAlgorithmsSaveDependencies({
    State,
    algorithms,
    extractStepsDataFromEditForm: extractStepsDataFromEditFormModule,
    showNotification,
    updateSearchIndex,
    renderAlgorithmCards: renderAlgorithmCardsModule,
    renderMainAlgorithm: renderMainAlgorithmModule,
    clearTemporaryThumbnailsFromContainer: clearTemporaryThumbnailsFromContainerModule,
    getVisibleModals: getVisibleModalsModule,
    addPdfRecords,
    resetInitialAddState,
    resetInitialEditState,
    getSectionName,
});
console.log('[script.js] Зависимости модуля Algorithms Save установлены');

/**
 * Возвращает существующий модальный элемент по id или создаёт новый (div с id, классом, HTML и опциональной настройкой).
 * @param {string} modalId - id элемента
 * @param {string} modalClassName - классы
 * @param {string} modalHTML - innerHTML
 * @param {function(HTMLElement)=} setupCallback - вызывается после создания с элементом модалки
 * @returns {HTMLElement}
 */
function getOrCreateModal(modalId, modalClassName, modalHTML, setupCallback) {
    let modal = document.getElementById(modalId);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = modalClassName || '';
    modal.innerHTML = modalHTML || '';
    document.body.appendChild(modal);
    if (typeof setupCallback === 'function') setupCallback(modal);
    return modal;
}

// Reglaments System Dependencies
setReglamentsDependencies({
    State,
    categoryDisplayInfo,
    CATEGORY_INFO_KEY,
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
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Reglaments установлены');

// Clipboard System Dependencies
setClipboardDependencies({
    NotificationService,
    showNotification,
});
console.log('[script.js] Зависимости модуля Clipboard установлены');

// Client Data System Dependencies
setClientNotesWindowDependencies({ highlightElement });

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
    showAppConfirm: showAppConfirmModule,
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
    showAppConfirm: showAppConfirmModule,
});
console.log('[script.js] Зависимости модуля Background Image установлены');

// Main Algorithm Dependencies
setMainAlgorithmDependencies({
    algorithms,
    copyToClipboard,
    DEFAULT_MAIN_ALGORITHM,
});
console.log('[script.js] Зависимости модуля Main Algorithm установлены');

// Algorithms Renderer Dependencies
setAlgorithmsRendererDependencies({
    algorithms,
    isFavorite,
    getFavoriteButtonHTML,
    showNotification,
    ExportService,
    renderScreenshotIcon: renderScreenshotIconModule,
    handleViewScreenshotClick: handleViewScreenshotClickModule,
    openAnimatedModal: openAnimatedModalModule,
    copyToClipboard,
});
console.log('[script.js] Зависимости модуля Algorithms Renderer установлены');

// Data Loader Dependencies уже установлены выше перед window.onload

// User Preferences Dependencies уже установлены выше на строке 2157

// Data Clear Dependencies
setDataClearDependencies({
    State,
});
console.log('[script.js] Зависимости модуля Data Clear установлены');

// ============================================================================
// ЭКСПОРТ ФУНКЦИЙ В WINDOW (для совместимости с модулями и старым кодом)
// ============================================================================
// Экспортируем функции в window для глобального доступа
// Это необходимо, так как script.js теперь ES-модуль и функции не попадают в глобальную область автоматически
if (typeof showNotification === 'function') window.showNotification = showNotification;
if (typeof algorithms !== 'undefined') window.algorithms = algorithms;
if (typeof isFavorite === 'function') window.isFavorite = isFavorite;
if (typeof loadingOverlayManager !== 'undefined')
    window.loadingOverlayManager = loadingOverlayManager;
if (typeof showAlgorithmDetail === 'function') window.showAlgorithmDetail = showAlgorithmDetail;
if (typeof copyToClipboard === 'function') window.copyToClipboard = copyToClipboard;
if (typeof applyCurrentView === 'function') window.applyCurrentView = applyCurrentView;
if (typeof debounce === 'function') window.debounce = debounce;
if (typeof setupClearButton === 'function') window.setupClearButton = setupClearButton;

// Закладки: глобальные функции, которые используются модульной системой (entry.js) и обработчиками кликов
if (typeof showAddBookmarkModal === 'function') window.showAddBookmarkModal = showAddBookmarkModal;
if (typeof showBookmarkDetail === 'function') window.showBookmarkDetail = showBookmarkDetail;
if (typeof showOrganizeFoldersModal === 'function')
    window.showOrganizeFoldersModal = showOrganizeFoldersModal;
if (typeof filterBookmarks === 'function') window.filterBookmarks = filterBookmarks;
if (typeof populateBookmarkFolders === 'function')
    window.populateBookmarkFolders = populateBookmarkFolders;
if (typeof loadFoldersList === 'function') window.loadFoldersList = loadFoldersList;
if (typeof showEditBookmarkModal === 'function')
    window.showEditBookmarkModal = showEditBookmarkModal;
if (typeof deleteBookmark === 'function') window.deleteBookmark = deleteBookmark;
if (typeof showBookmarkDetailModal === 'function')
    window.showBookmarkDetailModal = showBookmarkDetailModal;
if (typeof handleViewBookmarkScreenshots === 'function')
    window.handleViewBookmarkScreenshots = handleViewBookmarkScreenshots;
if (typeof showScreenshotViewerModal === 'function')
    window.showScreenshotViewerModal = showScreenshotViewerModal;
if (typeof showAppConfirmModule === 'function') window.showAppConfirm = showAppConfirmModule;

// Внешние ссылки и регламенты
if (typeof loadExtLinks === 'function') window.loadExtLinks = loadExtLinks;
if (typeof filterExtLinks === 'function') window.filterExtLinks = filterExtLinks;
if (typeof handleExtLinkAction === 'function') window.handleExtLinkAction = handleExtLinkAction;
if (typeof showOrganizeExtLinkCategoriesModal === 'function')
    window.showOrganizeExtLinkCategoriesModal = showOrganizeExtLinkCategoriesModal;
if (typeof populateExtLinkCategoryFilter === 'function')
    window.populateExtLinkCategoryFilter = populateExtLinkCategoryFilter;
if (typeof editAlgorithm === 'function') window.editAlgorithm = editAlgorithm;
if (typeof showAddModal === 'function') window.showAddModal = showAddModal;
if (typeof handleReglamentAction === 'function')
    window.handleReglamentAction = handleReglamentAction;
if (typeof populateReglamentCategoryDropdowns === 'function')
    window.populateReglamentCategoryDropdowns = populateReglamentCategoryDropdowns;

// Прочие общие зависимости
if (typeof getAllFromIndex === 'function') window.getAllFromIndex = getAllFromIndex;
if (typeof getFavoriteButtonHTML === 'function')
    window.getFavoriteButtonHTML = getFavoriteButtonHTML;
if (typeof DEFAULT_MAIN_ALGORITHM !== 'undefined')
    window.DEFAULT_MAIN_ALGORITHM = DEFAULT_MAIN_ALGORITHM;
if (typeof removeEscapeHandler === 'function') window.removeEscapeHandler = removeEscapeHandler;
if (typeof addEscapeHandler === 'function') window.addEscapeHandler = addEscapeHandler;
if (typeof getVisibleModals === 'function') window.getVisibleModals = getVisibleModals;
if (typeof initUI === 'function') window.initUI = initUI;
if (typeof initStepInteractions === 'function') window.initStepInteractions = initStepInteractions;
if (typeof initCollapseAllButtons === 'function')
    window.initCollapseAllButtons = initCollapseAllButtons;
if (typeof initHotkeysModal === 'function') window.initHotkeysModal = initHotkeysModal;
if (typeof initClearDataFunctionality === 'function')
    window.initClearDataFunctionality = initClearDataFunctionality;
if (typeof showNoInnModal === 'function') window.showNoInnModal = showNoInnModal;
window.rebuildSearchIndexNow = rebuildSearchIndexNow;
