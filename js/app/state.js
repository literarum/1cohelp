'use strict';

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================

export const State = {
    // База данных
    db: null,

    // Настройки пользователя
    userPreferences: {
        theme: 'auto',
        showBlacklistUsageWarning: true,
    },

    // UI состояние
    originalUISettings: {},
    currentPreviewSettings: {},
    isUISettingsDirty: false,
    uiModalState: {},

    // Состояние клиентских заметок
    clientNotesInputHandler: null,
    clientNotesKeydownHandler: null,
    clientNotesSaveTimeout: null,
    clientNotesCtrlClickHandler: null,
    clientNotesCtrlKeyDownHandler: null,
    clientNotesCtrlKeyUpHandler: null,
    clientNotesBlurHandler: null,

    // Состояние вкладок
    isTabsOverflowCheckRunning: false,
    tabsOverflowCheckCount: 0,
    updateVisibleTabsRetryCount: 0,
    tabsResizeTimeout: null,

    // Состояние СЭДО
    sedoFullscreenEscapeHandler: null,

    // Состояние черного списка
    blacklistEntryModalInstance: null,
    currentBlacklistWarningOverlay: null,
    allBlacklistEntriesCache: [],
    currentBlacklistSearchQuery: '',
    currentBlacklistSort: { criteria: 'level', direction: 'desc' },

    // Состояние экспорта/импорта
    isExportOperationInProgress: false,
    isExpectingExportFileDialog: false,
    exportDialogInteractionComplete: false,
    exportWatchdogTimerId: null,
    exportWindowFocusHandlerInstance: null,
    importDialogInteractionComplete: false,

    // Состояние редактирования
    activeEditingUnitElement: null,
    timerElements: {},
    initialBookmarkFormState: null,

    // Состояние файловых диалогов
    isExpectingFileDialog: false,
    windowFocusHandlerInstance: null,

    // Кэши и данные
    lastKnownInnCounts: new Map(),
    activeToadNotifications: new Map(),
    extLinkCategoryInfo: {},
    currentFavoritesCache: [],
    googleDocTimestamps: new Map(),
    timestampUpdateInterval: null,

    // Текущая секция и алгоритм
    currentSection: 'main',
    currentAlgorithm: null,
    editMode: false,
    viewPreferences: {},

    // Lightbox состояние
    lightboxCloseButtonClickListener: null,
    lightboxOverlayClickListener: null,
};
