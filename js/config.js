'use strict';

// ============================================================================
// API ПРОВЕРКИ ОТЗЫВА СЕРТИФИКАТОВ (Yandex Cloud Functions / любой внешний backend)
// ============================================================================
// Пустая строка = тот же origin (если API проксируется через тот же домен).
// API Gateway crl-api (обязательно для path /api/health и /api/revocation/check). Без завершающего слэша.
export const REVOCATION_API_BASE_URL =
    'https://d5do82fppanabn9naecn.kf69zffa.apigw.yandexcloud.net';

// ============================================================================
// КОНФИГУРАЦИЯ ВКЛАДОК
// ============================================================================
export const tabsConfig = [
    { id: 'main', name: 'Главная', icon: 'fa-home' },
    { id: 'program', name: 'Программа 1С', icon: 'fa-desktop' },
    { id: 'links', name: 'Ссылки 1С', icon: 'fa-link' },
    { id: 'extLinks', name: 'Внешние ресурсы', icon: 'fa-globe' },
    { id: 'skzi', name: 'СКЗИ', icon: 'fa-key' },
    { id: 'lk1c', name: '1СО ЛК', icon: 'fa-user-circle' },
    { id: 'webReg', name: 'Веб-Регистратор', icon: 'fa-plug' },
    { id: 'reglaments', name: 'Регламенты', icon: 'fa-clipboard-list' },
    { id: 'bookmarks', name: 'Закладки', icon: 'fa-bookmark' },
    {
        id: 'clientAnalytics',
        name: 'База клиентов и аналитика',
        icon: 'fa-database',
    },
    { id: 'training', name: 'Обучение', icon: 'fa-graduation-cap' },
    { id: 'shablony', name: 'Шаблоны', icon: 'fa-file-invoice' },
    { id: 'sedoTypes', name: 'Типы сообщений СЭДО', icon: 'fa-comments' },
    {
        id: 'blacklistedClients',
        name: 'Черный список жаб',
        icon: 'fa-user-secret',
        isSpecial: true,
    },
    { id: 'fnsCert', name: 'Проверка сертификата на отзыв', icon: 'fa-certificate' },
    { id: 'xmlAnalyzer', name: 'Анализатор XML', icon: 'fa-file-code' },
];

export const allPanelIdsForDefault = tabsConfig.map((t) => t.id);
export const defaultPanelOrder = tabsConfig.map((t) => t.id);

// ============================================================================
// КОНФИГУРАЦИЯ КАТЕГОРИЙ РЕГЛАМЕНТОВ
// ============================================================================
export const categoryDisplayInfo = {
    'difficult-client': {
        title: 'Работа с трудным клиентом',
        icon: 'fa-user-shield',
        color: 'red',
    },
    'tech-support': { title: 'Общий регламент', icon: 'fa-headset', color: 'blue' },
    emergency: { title: 'Чрезвычайные ситуации', icon: 'fa-exclamation-triangle', color: 'orange' },
};

// ============================================================================
// КОНФИГУРАЦИЯ МОДАЛЬНЫХ ОКОН
// ============================================================================
export const UNIFIED_FULLSCREEN_MODAL_CLASSES = {
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

export const algorithmDetailModalConfig = {
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

export const bookmarkModalConfigGlobal = {
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

export const editAlgorithmModalConfig = {
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

export const addAlgorithmModalConfig = {
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

export const reglamentDetailModalConfig = {
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

export const reglamentModalConfigGlobal = {
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

export const bookmarkDetailModalConfigGlobal = {
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

export const hotkeysModalConfig = {
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

/** Модальное окно напоминания — тот же паттерн, что hotkeys (центрирование + fullscreen) */
export const reminderModalConfig = {
    modalId: 'reminderModal',
    buttonId: 'toggleFullscreenReminderBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4', 'overflow-y-auto'],
            innerContainer: [
                'max-w-2xl',
                'max-h-[90vh]',
                'rounded-lg',
                'shadow-xl',
                'w-full',
                'flex',
                'flex-col',
            ],
            contentArea: ['flex', 'flex-col', 'overflow-y-auto', 'flex-1', 'min-h-0'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
                'flex',
                'flex-col',
                'min-h-0',
            ],
            contentArea: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
                'flex',
                'flex-col',
                'overflow-y-auto',
                'min-h-0',
            ],
        },
    },
    innerContainerSelector: '#reminderModalInner',
    contentAreaSelector: '#reminderModalBody',
};

export const healthReportModalConfig = {
    modalId: 'healthReportModal',
    buttonId: 'toggleFullscreenHealthReportBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: [
                'max-w-4xl',
                'w-full',
                'h-[90vh]',
                'max-h-[90vh]',
                'flex',
                'flex-col',
                'overflow-hidden',
                'my-8',
                'rounded-lg',
                'shadow-xl',
            ],
            contentArea: ['p-4', 'overflow-y-auto', 'flex-1', 'min-h-0', 'text-sm'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
                'flex',
                'flex-col',
                'min-h-0',
            ],
            contentArea: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
                'overflow-y-auto',
                'flex-1',
                'min-h-0',
            ],
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#healthReportModalBody',
};

export const dbMergeModalConfig = {
    modalId: 'dbMergeModal',
    buttonId: 'toggleFullscreenDbMergeBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: [],
            contentArea: [],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: ['h-full', 'max-h-full'],
        },
    },
    innerContainerSelector: '.db-merge-dialog',
    contentAreaSelector: '#dbMergeStepContainer',
};

export const engineeringCockpitModalConfig = {
    modalId: 'engineeringCockpitModal',
    buttonId: 'toggleFullscreenEngineeringCockpitBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: [
                'rounded-xl',
                'border',
                'shadow-2xl',
                'w-full',
                'max-w-7xl',
                'max-h-[92vh]',
                'overflow-hidden',
                'flex',
                'flex-col',
            ],
            contentArea: ['flex', 'flex-col', 'flex-1', 'min-h-0', 'overflow-hidden'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
                'flex',
                'flex-col',
                'min-h-0',
                'overflow-hidden',
            ],
        },
    },
    innerContainerSelector: '.engineering-cockpit-shell',
    contentAreaSelector: '#engineeringCockpitWorkspace',
};

/** Массив конфигов модалок для initFullscreenToggles (избегаем предупреждения "No modal configs provided") */
export const FULLSCREEN_MODAL_CONFIGS = [
    algorithmDetailModalConfig,
    bookmarkModalConfigGlobal,
    editAlgorithmModalConfig,
    addAlgorithmModalConfig,
    reglamentDetailModalConfig,
    reglamentModalConfigGlobal,
    bookmarkDetailModalConfigGlobal,
    hotkeysModalConfig,
    reminderModalConfig,
    healthReportModalConfig,
    dbMergeModalConfig,
    engineeringCockpitModalConfig,
];

export const SAVE_BUTTON_SELECTORS =
    'button[type="submit"], #saveAlgorithmBtn, #createAlgorithmBtn, #saveCibLinkBtn, #saveBookmarkBtn, #saveExtLinkBtn';

// ============================================================================
// КОНФИГУРАЦИЯ UI КЛАССОВ
// ============================================================================
export const CARD_CONTAINER_CLASSES = ['grid', 'gap-4'];
export const LIST_CONTAINER_CLASSES = ['flex', 'flex-col', 'gap-content-sm'];
export const CARD_ITEM_BASE_CLASSES = [
    'p-4',
    'rounded-lg',
    'shadow-sm',
    'bg-white',
    'dark:bg-gray-700',
];
export const LIST_ITEM_BASE_CLASSES = [
    'p-content-sm',
    'rounded-lg',
    'border',
    'border-gray-200',
    'dark:border-gray-600',
    'hover:bg-gray-50',
    'dark:hover:bg-gray-700',
    'flex',
    'justify-between',
    'items-center',
    'bg-white',
    'dark:bg-gray-700',
];
export const ALGO_BOOKMARK_CARD_CLASSES = ['cursor-pointer', 'items-start'];
export const LINK_REGLAMENT_CARD_CLASSES = ['items-start'];
export const LIST_HOVER_TRANSITION_CLASSES = ['transition-colors'];

export const SECTION_GRID_COLS = {
    bookmarksContainer: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
    clientAnalyticsContainer: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
    extLinksContainer: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
    linksContainer: ['grid-cols-1', 'md:grid-cols-2'],
    reglamentsContainer: ['grid-cols-1', 'md:grid-cols-2'],
    reglamentCategoryGrid: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
    programAlgorithms: ['grid-cols-1', 'md:grid-cols-2'],
    skziAlgorithms: ['grid-cols-1', 'md:grid-cols-2'],
    webRegAlgorithms: ['grid-cols-1', 'md:grid-cols-2'],
    lk1cAlgorithms: ['grid-cols-1', 'md:grid-cols-2'],
    favoritesContainer: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
    default: ['grid-cols-1', 'md:grid-cols-2'],
};

// ---------------------------------------------------------------------------
// Закладки: панель действий (карточка / список) — полные строки Tailwind JIT
// ---------------------------------------------------------------------------
/** Focus ring для клавиатуры на компактных кнопках списка. */
export const BOOKMARK_ACTION_FOCUS_VISIBLE_CLASS =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';

/** Кнопка 32×32 в строке списка закладок. */
export const BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS =
    'inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-500 shadow-sm hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-100 transition-colors';

/** Круглая иконка на карточке закладки (ссылка, архив, правка, удаление). */
export const BOOKMARK_CARD_ICON_BUTTON_CLASS =
    'p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

/** «Звезда» избранного на карточке (не список). */
export const BOOKMARK_CARD_FAVORITE_TOGGLE_CLASS =
    'toggle-favorite-btn p-1.5 text-gray-500 hover:text-yellow-500 dark:text-gray-400 dark:hover:text-yellow-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-primary dark:focus:ring-offset-gray-800 transition-colors';

/** «Звезда» избранного в строке списка закладок. */
export const BOOKMARK_LIST_FAVORITE_TOGGLE_CLASS = [
    'toggle-favorite-btn inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl',
    'border border-gray-200/90 bg-white text-gray-500 shadow-sm',
    'hover:border-amber-200/80 hover:bg-amber-50/50 hover:text-yellow-600',
    'dark:border-gray-600 dark:bg-gray-800',
    'dark:hover:border-amber-700/50 dark:hover:bg-gray-700 dark:hover:text-yellow-300',
    'transition-colors',
    BOOKMARK_ACTION_FOCUS_VISIBLE_CLASS,
].join(' ');

// ============================================================================
// КОНСТАНТЫ ТЕМЫ (единственный источник для JS; значения синхронизированы с css/theme/variables.css)
// ============================================================================
export const THEME_DEFAULTS = Object.freeze({
    initialBg: '#030308',
    primary: '#9933ff',
    secondary: '#7b2fdf',
    backgroundDark: '#030308',
    backgroundLight: '#f8fafc',
    primaryDark: '#8a2be2',
    primaryLight: '#4f46e5',
    secondaryDark: '#a020f0',
    secondaryLight: '#06b6d4',
});

// ============================================================================
// НАСТРОЙКИ UI ПО УМОЛЧАНИЮ
// ============================================================================
export function getDefaultUISettings(allPanelIdsForDefault) {
    return {
        primaryColor: THEME_DEFAULTS.primary,
        fontSize: 80,
        borderRadius: 2,
        contentDensity: 3,
        themeMode: 'dark',
        mainLayout: 'horizontal',
        panelOrder:
            typeof allPanelIdsForDefault !== 'undefined' && Array.isArray(allPanelIdsForDefault)
                ? [...allPanelIdsForDefault]
                : [],
        panelVisibility:
            typeof allPanelIdsForDefault !== 'undefined' && Array.isArray(allPanelIdsForDefault)
                ? allPanelIdsForDefault.map(
                      (id) => !(id === 'sedoTypes' || id === 'blacklistedClients'),
                  )
                : [],
        disableForcedBackupOnImport: false,
        staticHeader: false,
    };
}

// ============================================================================
// ССЫЛКИ 1С ПО УМОЛЧАНИЮ
// ============================================================================
export const DEFAULT_CIB_LINKS = [
    {
        title: 'Учетные записи документооборота',
        link: 'e1cib/list/Справочник.УчетныеЗаписиДокументооборота',
        description: 'Все УЗ в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Дополнительные реквизиты УЗ',
        link: 'e1cib/list/РегистрСведений.ДополнительныеРеквизитыУчетнойЗаписи',
        description: 'Дополнительные параметры',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Налоговые органы',
        link: 'e1cib/list/Справочник.НалоговыеОрганы',
        description: 'Список всех НО в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Регистрации в налоговом органе',
        link: 'e1cib/list/Справочник.РегистрацииВНалоговомОргане',
        description: 'Список всех НО с регистрацией в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Органы ПФР',
        link: 'e1cib/list/Справочник.ОрганыПФР',
        description: 'Список всех органов ПФР в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Органы ФСГС',
        link: 'e1cib/list/Справочник.ОрганыФСГС',
        description: 'Органы Росстата в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Отправки ФСС',
        link: 'e1cib/list/Справочник.ОтправкиФСС',
        description: 'Список отправок в ФСС',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Список организаций',
        link: 'e1cib/list/Справочник.Организации',
        description: 'Перейти к списку всех организаций в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Физические лица',
        link: 'e1cib/list/Справочник.ФизическиеЛица',
        description: 'Список всех физ.лиц в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Ответственные лица организации',
        link: 'e1cib/list/РегистрСведений.ОтветственныеЛицаОрганизаций',
        description: 'Список всех ролей по организации',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Виды отправляемых документов',
        link: 'e1cib/list/Справочник.ВидыОтправляемыхДокументов',
        description: 'Список всех доступных для отправки документов',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Тома хранения файлов',
        link: 'e1cib/list/Справочник.ТомаХраненияФайлов',
        description: 'Франчовское, но может быть полезным',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Свойства транспортных сообщений',
        link: 'e1cib/list/РегистрСведений.СвойстваТранспортныхСообщений',
        description: '',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Транспортные контейнеры',
        link: 'e1cib/list/РегистрСведений.ТранспортныеКонтейнеры',
        description: 'Органы Росстата в базе',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Групповое изменение реквизитов',
        link: 'e1cib/app/Обработка.ГрупповоеИзменениеРеквизитов',
        description: 'Очень мощный инструмент редактирования реквизитов орги',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Транспортное сообщение',
        link: 'e1cib/list/Документ.ТранспортноеСообщение',
        description: 'Список всех транспортных сообщений',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Входящие сообщения СЭДО ФСС',
        link: 'e1cib/list/РегистрСведений.ВходящиеСообщенияСЭДОФСС',
        description: 'Все входящии по СЭДО',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Дата запрета изменений данных',
        link: 'e1cib/command/РегистрСведений.ДатыЗапретаИзменения.Команда.ДатыЗапретаИзмененияДанных',
        description: 'Применяется для решения ошибок при сохранении данных в карте орги',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Периоды обновления данных ЕНС',
        link: 'e1cib/list/РегистрСведений.ПериодыОбновленияДанныхЕНС',
        description: 'ЧИстить при ошибках ЕНС',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Данные ЛК ЕНС',
        link: 'e1cib/list/РегистрСведений.ДанныеЛичногоКабинетаЕНС',
        description: 'Чистить при ошибках ЕНС',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Журнал загрузки ЕНС',
        link: 'e1cib/list/РегистрСведений.ЖурналЗагрузкиЕНС',
        description: 'Чистить при ошибках с ЕНС',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Активные пользователи',
        link: 'e1cib/app/Обработка.АктивныеПользователи',
        description: 'Текущие активные пользователи 1С',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Пользователи',
        link: 'e1cib/list/Справочник.Пользователи',
        description: 'Все пользователи',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Настройки электронной подписи и шифрования',
        link: 'e1cib/app/ОбщаяФорма.НастройкиЭлектроннойПодписиИШифрования',
        description: 'Настройки ЭП средствами 1С',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Журнал регистрации',
        link: 'e1cib/app/Обработка.ЖурналРегистрации',
        description: 'Сбор всех сообщений внутри 1С',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Журнал запросов к серверам ФСС',
        link: 'e1cib/list/РегистрСведений.ЖурналЗапросовКСерверамФСС',
        description: '',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Журнал отправок в КО',
        link: 'e1cib/list/РегистрСведений.ЖурналОтправокВКонтролирующиеОрганы',
        description: '',
        dateAdded: new Date().toISOString(),
    },
    {
        title: 'Список заявлений на изменение/подключение',
        link: 'e1cib/list/Документ.ЗаявлениеАбонентаСпецоператораСвязи',
        description: 'Список всех отправленных заявлений',
        dateAdded: new Date().toISOString(),
    },
];
