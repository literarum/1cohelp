'use strict';

import { SEDO_CONFIG_KEY } from './constants.js';

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
    { id: 'telefony', name: 'Телефоны', icon: 'fa-phone-alt' },
    { id: 'shablony', name: 'Шаблоны', icon: 'fa-file-invoice' },
    { id: 'sedoTypes', name: 'Типы сообщений СЭДО', icon: 'fa-comments' },
    {
        id: 'blacklistedClients',
        name: 'Черный список жаб',
        icon: 'fa-user-secret',
        isSpecial: true,
    },
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

export const SAVE_BUTTON_SELECTORS =
    'button[type="submit"], #saveAlgorithmBtn, #createAlgorithmBtn, #saveCibLinkBtn, #saveBookmarkBtn, #saveExtLinkBtn';

// ============================================================================
// КОНФИГУРАЦИЯ UI КЛАССОВ
// ============================================================================
export const CARD_CONTAINER_CLASSES = ['grid', 'gap-4'];
export const LIST_CONTAINER_CLASSES = ['flex', 'flex-col'];
export const CARD_ITEM_BASE_CLASSES = [
    'p-4',
    'rounded-lg',
    'shadow-sm',
    'hover:shadow-md',
    'bg-white',
    'dark:bg-gray-700',
];
export const LIST_ITEM_BASE_CLASSES = [
    'p-3',
    'border-b',
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

// ============================================================================
// НАСТРОЙКИ UI ПО УМОЛЧАНИЮ
// ============================================================================
export function getDefaultUISettings(allPanelIdsForDefault) {
    return {
        primaryColor: '#9333EA',
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
