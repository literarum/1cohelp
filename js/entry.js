'use strict';

/**
 * Точка входа для модульной структуры.
 * Загружается после script.js — все глобальные функции уже в window.
 * Связывает новые модули с глобальными зависимостями, без повторной инициализации БД.
 */
import { setDependencies } from './app.js';

(function connectModules() {
    const deps = {
        algorithms: window.algorithms,
        isFavorite: window.isFavorite,
        getFavoriteButtonHTML: window.getFavoriteButtonHTML,
        showAlgorithmDetail: window.showAlgorithmDetail,
        copyToClipboard: window.copyToClipboard,
        applyCurrentView: window.applyCurrentView,
        Sortable: typeof window.Sortable !== 'undefined' ? window.Sortable : undefined,
        showNotification: window.showNotification,
        debounce: window.debounce,
        setupClearButton: window.setupClearButton,
        showAddBookmarkModal: window.showAddBookmarkModal,
        showBookmarkDetail: window.showBookmarkDetail,
        showOrganizeFoldersModal: window.showOrganizeFoldersModal,
        filterBookmarks: window.filterBookmarks,
        populateBookmarkFolders: window.populateBookmarkFolders,
        loadingOverlayManager: window.loadingOverlayManager,
        DEFAULT_MAIN_ALGORITHM: window.DEFAULT_MAIN_ALGORITHM,
        loadFoldersList: window.loadFoldersList,
        removeEscapeHandler: window.removeEscapeHandler,
        getVisibleModals: window.getVisibleModals,
        addEscapeHandler: window.addEscapeHandler,
        handleSaveFolderSubmit: window.handleSaveFolderSubmit,
        getAllFromIndex: window.getAllFromIndex,
        State: window.State,
        showEditBookmarkModal: window.showEditBookmarkModal,
        deleteBookmark: window.deleteBookmark,
        showBookmarkDetailModal: window.showBookmarkDetailModal,
        handleViewBookmarkScreenshots: window.handleViewBookmarkScreenshots,
        NotificationService: window.NotificationService,
        showScreenshotViewerModal: window.showScreenshotViewerModal,
        showAppConfirm:
            typeof window.showAppConfirm === 'function' ? window.showAppConfirm : undefined,
    };

    setDependencies(deps);
    console.log('[entry.js] Модули связаны с глобальными зависимостями.');
})();
