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
    };

    setDependencies(deps);
    console.log('[entry.js] Модули связаны с глобальными зависимостями.');
})();
