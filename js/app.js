'use strict';

// ============================================================================
// ГЛАВНЫЙ ФАЙЛ ПРИЛОЖЕНИЯ
// ============================================================================
// Этот файл инициализирует приложение и связывает все модули вместе

// Импорты констант и конфигурации
import * as Constants from './constants.js';
import * as Config from './config.js';

// Импорты состояния
import * as State from './app/state.js';

// Импорты базы данных
import { initDB } from './db/indexeddb.js';
import * as FavoritesDB from './db/favorites.js';

// Импорты сервисов
import { NotificationService } from './services/notification.js';
import { ExportService, setLoadingOverlayManager } from './services/export.js';

// Импорты компонентов
import * as Modals from './components/modals.js';
import * as Tabs from './components/tabs.js';
import * as Algorithms from './components/algorithms.js';
import * as MainAlgorithm from './components/main-algorithm.js';
import * as Bookmarks from './components/bookmarks.js';
import * as ExtLinks from './components/ext-links.js';
import * as Reglaments from './components/reglaments.js';
import * as Sedo from './components/sedo.js';
import * as ClientData from './components/client-data.js';
import * as Theme from './components/theme.js';

// Импорты утилит
import { escapeHtml } from './utils/html.js';
import * as Helpers from './utils/helpers.js';

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (будут инициализированы позже)
// ============================================================================

// Эти переменные будут определены в оригинальном script.js
// и подключены через window объект для совместимости
let algorithms = null;
let isFavorite = null;
let getFavoriteButtonHTML = null;
let showAlgorithmDetail = null;
let copyToClipboard = null;
let applyCurrentView = null;
let showNotification = null;
let debounce = null;
let setupClearButton = null;
let showAddBookmarkModal = null;
let showBookmarkDetail = null;
let showOrganizeFoldersModal = null;
let filterBookmarks = null;
let populateBookmarkFolders = null;
let loadingOverlayManager = null;

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

/**
 * Инициализирует все модули приложения
 */
export async function initApp() {
    console.log('[App Init] Начало инициализации приложения...');

    try {
        // 1. Инициализация базы данных
        console.log('[App Init] Инициализация базы данных...');
        State.db = await initDB();
        console.log('[App Init] База данных инициализирована.');

        // 2. Инициализация сервисов
        console.log('[App Init] Инициализация сервисов...');
        NotificationService.init();
        ExportService.init();
        console.log('[App Init] Сервисы инициализированы.');

        // 3. Инициализация компонентов
        console.log('[App Init] Инициализация компонентов...');
        Tabs.setupTabsOverflow();
        console.log('[App Init] Компоненты инициализированы.');

        // 4. Загрузка данных
        console.log('[App Init] Загрузка данных...');
        await FavoritesDB.loadInitialFavoritesCache();
        console.log('[App Init] Данные загружены.');

        console.log('[App Init] Приложение успешно инициализировано.');
        return true;
    } catch (error) {
        console.error('[App Init] Ошибка инициализации приложения:', error);
        NotificationService.add(
            'Ошибка инициализации приложения. Проверьте консоль для деталей.',
            'error',
            { important: true },
        );
        return false;
    }
}

/**
 * Устанавливает зависимости для компонентов
 */
export function setDependencies(deps) {
    // Зависимости для алгоритмов
    Algorithms.setAlgorithmsDependencies({
        algorithms: deps.algorithms,
        isFavorite: deps.isFavorite,
        getFavoriteButtonHTML: deps.getFavoriteButtonHTML,
        showAlgorithmDetail: deps.showAlgorithmDetail,
        copyToClipboard: deps.copyToClipboard,
        applyCurrentView: deps.applyCurrentView,
        loadMainAlgoCollapseState: MainAlgorithm.loadMainAlgoCollapseState,
        saveMainAlgoCollapseState: MainAlgorithm.saveMainAlgoCollapseState,
    });

    // Зависимости для главного алгоритма
    MainAlgorithm.setMainAlgorithmDependencies({
        algorithms: deps.algorithms,
        copyToClipboard: deps.copyToClipboard,
        DEFAULT_MAIN_ALGORITHM: deps.DEFAULT_MAIN_ALGORITHM,
    });

    // Зависимости для закладок
    Bookmarks.setBookmarksDependencies({
        isFavorite: deps.isFavorite,
        getFavoriteButtonHTML: deps.getFavoriteButtonHTML,
        showAddBookmarkModal: deps.showAddBookmarkModal,
        showBookmarkDetail: deps.showBookmarkDetail,
        showOrganizeFoldersModal: deps.showOrganizeFoldersModal,
        filterBookmarks: deps.filterBookmarks,
        populateBookmarkFolders: deps.populateBookmarkFolders,
        showNotification: deps.showNotification,
        debounce: deps.debounce,
        setupClearButton: deps.setupClearButton,
    });

    // Установка loadingOverlayManager для ExportService
    if (deps.loadingOverlayManager) {
        setLoadingOverlayManager(deps.loadingOverlayManager);
    }
}

// ============================================================================
// ЭКСПОРТ ДЛЯ ГЛОБАЛЬНОГО ИСПОЛЬЗОВАНИЯ
// ============================================================================

// Экспортируем основные функции для использования в оригинальном script.js
window.CopilotApp = {
    init: initApp,
    setDependencies: setDependencies,
    Constants: Constants,
    Config: Config,
    State: State,
    DB: {
        init: initDB,
        favorites: FavoritesDB,
    },
    Services: {
        notification: NotificationService,
        export: ExportService,
    },
    Components: {
        modals: Modals,
        tabs: Tabs,
        algorithms: Algorithms,
        mainAlgorithm: MainAlgorithm,
        bookmarks: Bookmarks,
        extLinks: ExtLinks,
        reglaments: Reglaments,
        sedo: Sedo,
        clientData: ClientData,
        theme: Theme,
    },
    Utils: {
        html: { escapeHtml },
        helpers: Helpers,
    },
};

// Автоматическая инициализация при загрузке модуля (опционально)
// Раскомментируйте, если хотите автоматическую инициализацию:
// if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', initApp);
// } else {
//     initApp();
// }

console.log('[App] Модуль приложения загружен. Используйте window.CopilotApp.init() для инициализации.');
