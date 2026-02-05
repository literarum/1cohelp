'use strict';

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================

// База данных
export let db = null;

// Настройки пользователя
export let userPreferences = {
    theme: 'auto',
    showBlacklistUsageWarning: true,
};

// UI состояние
export let originalUISettings = {};
export let currentPreviewSettings = {};
export let isUISettingsDirty = false;
export let uiModalState = {};

// Состояние клиентских заметок
export let clientNotesInputHandler = null;
export let clientNotesKeydownHandler = null;
export let clientNotesSaveTimeout = null;
export let clientNotesCtrlClickHandler = null;
export let clientNotesCtrlKeyDownHandler = null;
export let clientNotesCtrlKeyUpHandler = null;
export let clientNotesBlurHandler = null;

// Состояние вкладок
export let isTabsOverflowCheckRunning = false;
export let tabsOverflowCheckCount = 0;
export let updateVisibleTabsRetryCount = 0;
export let tabsResizeTimeout = null;

// Состояние СЭДО
export let sedoFullscreenEscapeHandler = null;

// Состояние черного списка
export let blacklistEntryModalInstance = null;
export let currentBlacklistWarningOverlay = null;
export let allBlacklistEntriesCache = [];
export let currentBlacklistSearchQuery = '';
export let currentBlacklistSort = { criteria: 'level', direction: 'desc' };

// Состояние экспорта/импорта
export let isExportOperationInProgress = false;
export let isExpectingExportFileDialog = false;
export let exportDialogInteractionComplete = false;
export let exportWatchdogTimerId = null;
export let exportWindowFocusHandlerInstance = null;
export let importDialogInteractionComplete = false;

// Состояние редактирования
export let activeEditingUnitElement = null;
export let timerElements = {};
export let initialBookmarkFormState = null;

// Состояние файловых диалогов
export let isExpectingFileDialog = false;
export let windowFocusHandlerInstance = null;

// Кэши и данные
export let lastKnownInnCounts = new Map();
export let activeToadNotifications = new Map();
export let extLinkCategoryInfo = {};
export let currentFavoritesCache = [];
export let googleDocTimestamps = new Map();
export let timestampUpdateInterval = null;

// Текущая секция и алгоритм
export let currentSection = 'main';
export let currentAlgorithm = null;
export let editMode = false;
export let viewPreferences = {};

// Lightbox состояние
export let lightboxCloseButtonClickListener = null;
export let lightboxOverlayClickListener = null;
