'use strict';

import { ONBOARDING_AUTO_OFFER_STORAGE_KEY } from '../constants.js';

const DRIVER_VENDOR_VERSION = '1.4.0';
const DRIVER_SCRIPT_SRC = `vendor/driver.js/${DRIVER_VENDOR_VERSION}/driver.js.iife.js`;
const DRIVER_STYLES_SRC = `vendor/driver.js/${DRIVER_VENDOR_VERSION}/driver.css`;
const DRIVER_SCRIPT_ID = 'driverjs-local-script';
const DRIVER_STYLES_ID = 'driverjs-local-style';

let deps = {
    State: null,
    setActiveTab: null,
    saveUserPreferences: null,
    showAppConfirm: null,
    showNotification: null,
};

let driverFactoryPromise = null;
let activeTour = null;
const TAB_WARNING_BYPASS = new Set(['blacklistedClients']);
const TRANSIENT_MODAL_SELECTORS = [
    '#commandPaletteModal',
    '#customizeUIModal',
    '#hotkeysModal',
    '#dbMergeModal',
    '#recentlyDeletedModal',
    '#appCustomizationModal',
];
const TOUR_MODAL_ID_HINT = 'Modal';
const TOUR_HIGHLIGHT_PROXY_ID = 'onboardingTourHighlightProxy';

const TOUR_STEP_BLUEPRINTS = [
    {
        title: 'Добро пожаловать в Copilot 1СО',
        description:
            'Полный тур проведет по основным инструментам и вкладкам приложения. Его можно пропустить и позже запустить снова из настроек.',
        side: 'over',
        align: 'center',
    },
    {
        title: 'Поиск',
        description:
            'Быстрый поиск по алгоритмам, регламентам, закладкам и разделам. Начните вводить запрос, чтобы увидеть результаты.',
        selectors: ['#searchInput'],
        side: 'bottom',
        align: 'start',
    },
    {
        title: 'Расширенный поиск',
        description:
            'Кнопка открывает фильтры и расширенные параметры поиска, если нужно сузить выборку.',
        selectors: ['#toggleAdvancedSearch', '#advancedSearchOptions'],
        side: 'bottom',
        align: 'start',
    },
    {
        title: 'Палитра команд',
        description:
            'Центральный быстрый доступ к действиям и навигации по приложению. Открывается кнопкой или сочетанием Ctrl/Cmd+K.',
        selectors: ['#openCommandPaletteBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Палитра команд (панель)',
        description:
            'В верхней панели палитры можно выполнять действия и перемещаться по разделам без ручного поиска.',
        openSelectors: ['#openCommandPaletteBtn'],
        selectors: ['#commandPaletteModal', '#commandPaletteInput', '#openCommandPaletteBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Управление данными',
        description:
            'Здесь экспорт, слияние, импорт и принудительная перезагрузка данных. Используйте блок для резервирования и переноса базы.',
        selectors: ['#dataTransferControls', '#exportDataBtn', '#mergeDataBtn', '#importDataBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Экспорт базы (как использовать)',
        description: 'Кнопка экспорта создает резервную копию базы данных.',
        selectors: ['#exportDataBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Импорт базы (как использовать)',
        description: 'Кнопка импорта загружает файл резервной копии.',
        selectors: ['#importDataBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Кнопка слияния баз',
        description:
            'Кнопка открывает мастер слияния баз данных. Следующим шагом будет показано само окно мастера.',
        selectors: ['#mergeDataBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Мастер слияния баз данных',
        description:
            'Пошаговый мастер слияния помогает безопасно объединять базы и управлять конфликтами записей.',
        openSelectors: ['#mergeDataBtn'],
        selectors: ['#dbMergeModal', '#dbMergeModalTitle', '#mergeDataBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Горячие клавиши',
        description:
            'Отсюда открывается справка по горячим клавишам.',
        selectors: ['#showHotkeysBtn', '#customizeUIBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Горячие клавиши (окно)',
        description:
            'Справка по горячим клавишам помогает быстрее работать без мыши в повседневных сценариях.',
        openSelectors: ['#showHotkeysBtn'],
        selectors: ['#hotkeysModal', '#closeHotkeysModalBtn', '#showHotkeysBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Кнопка настроек приложения',
        description:
            'Отсюда открывается окно настроек: тема, плотность, шрифт, порядок вкладок и другие параметры. Следующим шагом будет показано само окно.',
        selectors: ['#customizeUIBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Настройки приложения',
        description:
            'В этом окне можно менять тему, плотность, шрифт, поведение импорта. Ниже — блоки «Включение и порядок разделов», корзина и кастомизация.',
        openSelectors: ['#customizeUIBtn'],
        skipOpenSelectorsWhenVisible: { '#customizeUIBtn': '#customizeUIModal' },
        selectors: ['#customizeUIModal', '#customizeUIBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Проверка здоровья приложения',
        description:
            'Кнопка «Запустить проверку систем» запускает диагностику: проверяет доступность ключевых модулей и данных приложения.',
        preserveModals: ['#customizeUIModal'],
        selectors: ['#runManualHealthCheckBtn', '#customizeUIModal'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Повторный тур',
        description:
            'Кнопка «Повторить онбординг-тур» снова запускает этот пошаговый тур по интерфейсу. Удобно, если нужно освежить подсказки.',
        preserveModals: ['#customizeUIModal'],
        selectors: ['#restartOnboardingTourBtn', '#customizeUIModal'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Включение и порядок разделов',
        description:
            'При первом запуске часть разделов может быть скрыта. Здесь можно включить все вкладки, поменять порядок и сразу увидеть, где они находятся.',
        preserveModals: ['#customizeUIModal'],
        openSelectors: ['#customizeUIBtn'],
        skipOpenSelectorsWhenVisible: { '#customizeUIBtn': '#customizeUIModal' },
        selectors: ['#panelSortContainer', '#customizeUIModal', '#customizeUIBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Кнопка «Недавно удаленные»',
        description:
            'В окне настроек эта кнопка открывает корзину удаленных записей. Следующим шагом будет показано само окно корзины.',
        preserveModals: ['#customizeUIModal'],
        selectors: ['#openRecentlyDeletedBtn', '#customizeUIModal'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Недавно удаленные',
        description:
            'Из окна настроек доступна корзина: отсюда можно восстановить удаленные записи или очистить их окончательно.',
        preserveModals: ['#customizeUIModal'],
        openSelectors: ['#customizeUIBtn', '#openRecentlyDeletedBtn'],
        skipOpenSelectorsWhenVisible: { '#customizeUIBtn': '#customizeUIModal' },
        selectors: [
            '#recentlyDeletedModal',
            '#recentlyDeletedList',
            '#openRecentlyDeletedBtn',
            '#customizeUIBtn',
        ],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Кнопка «Кастомизация»',
        description:
            'Открывает окно кастомизации: тема, цвета, скругление, отступы, фон. Следующим шагом будет показано само окно.',
        preserveModals: ['#customizeUIModal'],
        selectors: ['#openAppCustomizationModalBtn', '#customizeUIModal'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Окно кастомизации',
        description:
            'Здесь настраиваются тема, цвета, скругление, отступы и фон интерфейса. Изменения можно сразу оценить в превью.',
        preserveModals: ['#customizeUIModal'],
        openSelectors: ['#openAppCustomizationModalBtn'],
        skipOpenSelectorsWhenVisible: { '#openAppCustomizationModalBtn': '#appCustomizationModal' },
        selectors: [
            '#appCustomizationModal',
            '#appCustomizationModalTitle',
            '#closeAppCustomizationModalBtn',
            '#openAppCustomizationModalBtn',
        ],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Таймер: запуск и пауза',
        description:
            'Кнопка запускает и ставит на паузу отсчет таймера. Управляется также сочетанием клавиш из палитры команд.',
        selectors: ['#appTimer', '#timerToggleButton'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Таймер: сброс',
        description:
            'Сброс возвращает таймер к значению по умолчанию (01:50). Удобно начать новый интервал без ручного ввода.',
        selectors: ['#timerResetButton'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Таймер: поле отображения и ввода',
        description:
            'Здесь отображается текущее время. Можно кликнуть и ввести значение вручную в формате ММ:СС (например 05:00).',
        selectors: ['#timerDisplay'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Таймер: прибавить и убавить',
        description:
            'Кнопки увеличивают и уменьшают время на 1 минуту. Управляются также шорткатами из справки по горячим клавишам.',
        highlightGroupSelectors: ['#timerDecreaseButton', '#timerIncreaseButton'],
        selectors: ['#timerDecreaseButton', '#timerIncreaseButton'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Переключение темы',
        description:
            'Кнопка мгновенно переключает светлую и темную тему без перехода в настройки.',
        selectors: ['#themeToggle'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Панель вкладок',
        description:
            'Основные разделы приложения собраны в панели вкладок. Переключайтесь между разделами одним кликом.',
        selectors: ['header + .border-b nav.flex.flex-wrap', '#moreTabsBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Скрытые вкладки и меню «Еще»',
        description:
            'Если вкладок много, часть будет скрыта в меню «Еще». Там доступны дополнительные вкладки и быстрый переход к ним.',
        selectors: ['#moreTabsBtn', '#moreTabsDropdown'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Главная',
        description: 'На главной вкладке расположен основной алгоритм и быстрые действия по клиенту.',
        tabId: 'main',
        tabNavHighlightTabId: 'main',
        selectors: ['#mainTab'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Главный алгоритм',
        description:
            'Карточка с ключевым алгоритмом и режимами просмотра. Отсюда начинается большинство рабочих сценариев.',
        tabId: 'main',
        selectors: ['#mainAlgoCard', '#mainAlgorithm'],
        side: 'right',
        align: 'start',
    },
    {
        title: 'Заметки по клиенту',
        description:
            'Здесь основная панель заметок: отдельное окно, закрепляемое окно, очистка и сохранение заметок в файл.',
        tabId: 'main',
        selectors: [
            '#clientNotesPanel',
            '#clientNotesActions',
            '#clientNotes',
            '#openClientNotesWindowBtn',
            '#openClientNotesPopupBtn',
            '#clearClientDataBtn',
            '#exportTextBtn',
        ],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Раздел «Программа 1С/УП»',
        description:
            'Раздел с алгоритмами по сценариям работы в программе 1С: добавление, редактирование и хранение инструкций.',
        tabId: 'program',
        tabNavHighlightTabId: 'program',
        selectors: ['#programTab'],
        side: 'right',
        align: 'start',
    },
    {
        title: 'СКЗИ',
        description: 'Алгоритмы по работе с криптосредствами и сертификатами собраны на этой вкладке.',
        tabId: 'skzi',
        tabNavHighlightTabId: 'skzi',
        selectors: ['#skziTab'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'ЛК 1СО',
        description:
            'Здесь инструкции для сценариев личного кабинета 1С-Отчетность с отдельной базой алгоритмов.',
        tabId: 'lk1c',
        tabNavHighlightTabId: 'lk1c',
        selectors: ['#lk1cTab'],
        side: 'right',
        align: 'start',
    },
    {
        title: 'Web-регистратор',
        description:
            'Вкладка для алгоритмов по работе с веб-регистратором.',
        tabId: 'webReg',
        tabNavHighlightTabId: 'webReg',
        selectors: ['#webRegTab'],
        side: 'right',
        align: 'start',
    },
    {
        title: 'Ссылки 1С',
        description:
            'Каталог рабочих ссылок 1С с поиском и быстрым добавлением карточек.',
        tabId: 'links',
        scrollToTop: true,
        selectors: ['#linksContainer', '#addLinkBtn', '#linkSearchInput', '#linksTab'],
        side: 'right',
        align: 'start',
    },
    {
        title: 'Внешние ресурсы',
        description:
            'Отдельный каталог внешних ресурсов: категории, фильтры и поиск по материалам.',
        tabId: 'extLinks',
        selectors: ['#extLinksTab', '#extLinksContainer', '#addExtLinkBtn', '#extLinkSearchInput'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Регламенты',
        description:
            'Центральный раздел регламентов с категориями, карточками и переходом к списку документов.',
        tabId: 'reglaments',
        selectors: ['#reglamentsTab', '#reglamentCategoryGrid', '#addReglamentBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Вкладка «Закладки»',
        description:
            'Раздел персональных закладок: папки, сортировка, фильтры и экспорт в PDF. Перейдите на вкладку, чтобы увидеть элементы ниже.',
        tabId: 'bookmarks',
        selectors: ['#bookmarksTab'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Закладки: экспорт и добавление',
        description:
            'Кнопки «Экспорт всех» (в PDF) и «Добавить» для создания новой закладки. Действия доступны в контексте раздела.',
        tabId: 'bookmarks',
        selectors: ['#exportAllBookmarksToPdfBtn', '#addBookmarkBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Закладки: поиск и фильтр по папкам',
        description:
            'Поле поиска по закладкам и выпадающий фильтр по папкам. Помогают быстро найти нужную запись.',
        tabId: 'bookmarks',
        selectors: ['#bookmarkSearchInput', '#bookmarkFolderFilter'],
        side: 'bottom',
        align: 'start',
    },
    {
        title: 'Закладки: сортировка',
        description:
            'Сортировка по дате добавления, по названию или по папке. Переключайте режим по клику на кнопку.',
        tabId: 'bookmarks',
        selectors: ['#bookmarksSortControls', '#sortBookmarksByDate', '#sortBookmarksByTitle', '#sortBookmarksByFolder'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Закладки: список и карточки',
        description:
            'Здесь отображаются закладки в виде карточек или списка. Клик по карточке открывает детали и действия.',
        tabId: 'bookmarks',
        selectors: ['#bookmarksContainer'],
        side: 'top',
        align: 'center',
    },
    {
        title: 'Типы сообщений СЭДО',
        description:
            'Справочник типов сообщений СЭДО с режимом редактирования и сохранением изменений.',
        tabId: 'sedoTypes',
        selectors: ['#sedoTypesTab', '#sedoTypesInfoContainer', '#editSedoTypesBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Черный список',
        description:
            'Раздел для фиксации… кхм… жабных кейсов, чтобы потом делать им установку на понос.',
        tabId: 'blacklistedClients',
        selectors: ['#blacklistedClientsTab', '#blacklistTableContainer', '#addBlacklistEntryBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Проверка сертификата',
        description:
            'Модуль проверки сертификатов: загрузка файла, анализ статуса и безопасная локальная обработка.',
        tabId: 'fnsCert',
        selectors: ['#fnsCertTab', '#fnsCertDropZone', '#fnsCertResetBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'XMLизатор',
        description:
            'Инструмент анализа XML/JSON: загрузка данных, парсинг, результаты и экспорт сертификатов.',
        tabId: 'xmlAnalyzer',
        selectors: ['#xmlAnalyzerTab', '#xmlAnalyzerDropZone', '#xmlAnalyzerAnalyzeBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Вкладка «Обучение»',
        description:
            'Раздел обучения: учебные модули по шагам, карточки интервального повторения (SRS), учёт слабых мест и статистика. Откройте вкладку, чтобы увидеть инструменты ниже.',
        tabId: 'training',
        selectors: ['#trainingTab'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Обучение: режимы',
        description:
            'Переключайте режимы: учебник, карточки SRS, слабые места и статистика. В каждом режиме свой сценарий закрепления материала.',
        tabId: 'training',
        selectors: [
            'nav[aria-label="Разделы обучения"]',
            '#trainingMount .training-hero',
            '#trainingMount',
        ],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Обучение: модули и редактор',
        description:
            'Создавайте учебные модули под свои задачи. В режиме «Учебник» кнопка «Новый модуль» открывает редактор шагов и мини-квизов; при необходимости импортируйте материалы от наставника.',
        tabId: 'training',
        selectors: [
            '[data-training-user-new-module]',
            '.training-user-toolbar',
            '#trainingMount .training-body',
            '#trainingMount',
        ],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Обучение: содержимое раздела',
        description:
            'Здесь отображаются карточки модулей, шаги, мини-квизы и отметки о прочтении.',
        tabId: 'training',
        tabNavHighlightTabId: 'training',
        selectors: ['#trainingMount .training-body', '#trainingMount', '#trainingTab'],
        side: 'top',
        align: 'center',
    },
    {
        title: 'Избранное',
        description:
            'Кнопка-звезда открывает избранное: это быстрый доступ к часто используемым материалам.',
        selectors: ['#showFavoritesHeaderBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Готово',
        description:
            'Тур завершен. Вы прошли по всем ключевым зонам приложения и можете вернуться к любому шагу через настройки.',
        side: 'over',
        align: 'center',
    },
];

export function setOnboardingTourDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

function ensureStylesheet(href, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function ensureScript(src, id) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    script.defer = false;
    document.head.appendChild(script);
    return script;
}

/** IIFE build exposes factory as window.driver.js.driver, not window.driver.js */
function getDriverFactory() {
    if (typeof window.driver?.js === 'function') return window.driver.js;
    if (typeof window.driver?.js?.driver === 'function') return window.driver.js.driver;
    return null;
}

async function ensureDriverFactory() {
    const factory = getDriverFactory();
    if (factory) return factory;
    if (driverFactoryPromise) return driverFactoryPromise;

    ensureStylesheet(DRIVER_STYLES_SRC, DRIVER_STYLES_ID);
    const script = ensureScript(DRIVER_SCRIPT_SRC, DRIVER_SCRIPT_ID);

    driverFactoryPromise = new Promise((resolve, reject) => {
        const checkReady = () => {
            const fn = getDriverFactory();
            if (fn) {
                resolve(fn);
            } else {
                reject(new Error('Driver.js загружен, но фабрика window.driver.js не найдена.'));
            }
        };

        if (script.dataset.loaded === 'true') {
            checkReady();
            return;
        }

        script.addEventListener(
            'load',
            () => {
                script.dataset.loaded = 'true';
                checkReady();
            },
            { once: true },
        );

        script.addEventListener(
            'error',
            () => {
                reject(
                    new Error(
                        `Не удалось загрузить локальный файл Driver.js: ${DRIVER_SCRIPT_SRC}`,
                    ),
                );
            },
            { once: true },
        );
    });

    return driverFactoryPromise;
}

function resolveFirstAvailableElement(selectors) {
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        if (typeof el.getClientRects !== 'function') return el;
        if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) return el;
    }
    return null;
}

/**
 * Кнопка вкладки в горизонтальной панели или «⋯», если вкладка ушла в переполнение.
 * Исключает ложное попадание на запасной fallback (#mainTab) в туре.
 * @param {string} panelId — без суффикса Tab (например main, training).
 * @returns {HTMLElement | null}
 */
function resolveVisibleTabNavTarget(panelId) {
    if (!panelId || typeof document.getElementById !== 'function') return null;
    const tabEl = document.getElementById(`${panelId}Tab`);
    if (
        tabEl &&
        typeof tabEl.getClientRects === 'function' &&
        tabEl.getClientRects().length > 0
    ) {
        return tabEl;
    }
    const moreBtn = document.getElementById('moreTabsBtn');
    const moreWrap = moreBtn?.parentElement;
    if (
        moreBtn &&
        moreWrap &&
        !moreWrap.classList.contains('hidden') &&
        typeof moreBtn.getClientRects === 'function' &&
        moreBtn.getClientRects().length > 0
    ) {
        return moreBtn;
    }
    return null;
}

function clickElementBySelector(selector) {
    if (!selector) return false;
    const el = document.querySelector(selector);
    if (!el || typeof el.click !== 'function') return false;
    if (el.classList?.contains('hidden')) {
        el.classList.remove('hidden');
    }
    if (el.style?.display === 'none') {
        el.style.display = '';
    }
    el.click();
    return true;
}

function clickSelectorsInOrder(selectors) {
    if (!Array.isArray(selectors)) return;
    selectors.forEach((selector) => {
        clickElementBySelector(selector);
    });
}

function forceShowElementForTour(el) {
    if (!el) return;
    if (el.classList?.contains('hidden')) {
        el.classList.remove('hidden');
    }
    if (el.style?.display === 'none') {
        el.style.display = '';
    }
}

function isModalSelector(selector) {
    return typeof selector === 'string' && selector.includes(TOUR_MODAL_ID_HINT);
}

function forceShowTabContent(tabId) {
    if (!tabId || typeof document.getElementById !== 'function') return;
    const content = document.getElementById(`${tabId}Content`);
    if (!content) return;
    content.classList.remove('hidden', 'is-hiding');
    content.style.opacity = '1';
    content.style.visibility = 'visible';
    content.style.pointerEvents = 'auto';
}

function removeTourHighlightProxy() {
    if (typeof document.getElementById !== 'function') return;
    const existing = document.getElementById(TOUR_HIGHLIGHT_PROXY_ID);
    existing?.remove();
}

function buildHighlightProxyForSelectors(selectors, padding = 6) {
    if (
        typeof document.querySelector !== 'function' ||
        typeof document.getElementById !== 'function' ||
        typeof document.createElement !== 'function' ||
        !document.body
    ) {
        return null;
    }
    if (!Array.isArray(selectors) || selectors.length === 0) return null;
    const rects = selectors
        .map((selector) => document.querySelector(selector))
        .filter(Boolean)
        .map((el) => (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null))
        .filter((rect) => rect && rect.width > 0 && rect.height > 0);

    if (rects.length === 0) return null;

    const minLeft = Math.min(...rects.map((rect) => rect.left)) - padding;
    const minTop = Math.min(...rects.map((rect) => rect.top)) - padding;
    const maxRight = Math.max(...rects.map((rect) => rect.right)) + padding;
    const maxBottom = Math.max(...rects.map((rect) => rect.bottom)) + padding;

    let proxy = document.getElementById(TOUR_HIGHLIGHT_PROXY_ID);
    if (!proxy) {
        proxy = document.createElement('div');
        proxy.id = TOUR_HIGHLIGHT_PROXY_ID;
        proxy.setAttribute('aria-hidden', 'true');
        document.body.appendChild(proxy);
    }

    proxy.style.position = 'fixed';
    proxy.style.pointerEvents = 'none';
    proxy.style.opacity = '0';
    proxy.style.left = `${Math.max(minLeft, 0)}px`;
    proxy.style.top = `${Math.max(minTop, 0)}px`;
    proxy.style.width = `${Math.max(maxRight - minLeft, 1)}px`;
    proxy.style.height = `${Math.max(maxBottom - minTop, 1)}px`;

    return proxy;
}

function ensureBlueprintTargetsVisible(blueprint) {
    if (blueprint.tabId) {
        forceShowTabContent(blueprint.tabId);
    }

    const selectorList = Array.isArray(blueprint.selectors) ? blueprint.selectors : [];
    selectorList.forEach((selector) => {
        if (!isModalSelector(selector)) return;
        const modal = document.querySelector(selector);
        forceShowElementForTour(modal);
    });
}

function hideElementBySelector(selector) {
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    if (el.classList && typeof el.classList.add === 'function') {
        el.classList.add('hidden');
    }
}

/**
 * Закрывает модальные окна тура, кроме переданного списка селекторов (для шагов внутри уже открытой модалки).
 * @param {string[]} [preserveSelectors] — селекторы модалок, которые не закрывать (например ['#customizeUIModal']).
 */
function closeTransientModalsForTour(preserveSelectors = []) {
    const preserveSet = new Set(Array.isArray(preserveSelectors) ? preserveSelectors : []);
    if (typeof window.closeRecentlyDeletedModal === 'function' && !preserveSet.has('#recentlyDeletedModal')) {
        try {
            window.closeRecentlyDeletedModal();
        } catch (error) {
            console.warn('[onboarding-tour] Не удалось закрыть recentlyDeleted modal:', error);
        }
    }
    TRANSIENT_MODAL_SELECTORS.forEach((sel) => {
        if (preserveSet.has(sel)) return;
        hideElementBySelector(sel);
    });
    if (preserveSet.size === 0) {
        document.body.classList.remove('modal-open', 'overflow-hidden');
    }
}

function activateTourTab(tabId) {
    if (!tabId || typeof deps.setActiveTab !== 'function') return;
    const bypassWarning = TAB_WARNING_BYPASS.has(tabId);
    Promise.resolve(deps.setActiveTab(tabId, bypassWarning)).catch((error) => {
        console.warn('[onboarding-tour] Не удалось переключить вкладку для шага тура:', tabId, error);
    });

    if (tabId === 'links') {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                } catch {
                    window.scrollTo(0, 0);
                }
                const linksContent = document.getElementById('linksContent');
                const linksContainer = document.getElementById('linksContainer');
                if (linksContent) linksContent.scrollTop = 0;
                if (linksContainer) linksContainer.scrollTop = 0;
            });
        });
    }
}

function buildTourSteps() {
    return TOUR_STEP_BLUEPRINTS.map((blueprint) => {
        const step = {
            popover: {
                title: blueprint.title,
                description: blueprint.description,
                side: blueprint.side || 'bottom',
                align: blueprint.align || 'center',
            },
        };

        if (blueprint.tabId) {
            step.tabId = blueprint.tabId;
        }

        if (Array.isArray(blueprint.selectors) && blueprint.selectors.length > 0) {
            step.element = () => {
                removeTourHighlightProxy();
                const preserveModals = blueprint.preserveModals || [];
                closeTransientModalsForTour(preserveModals);
                if (blueprint.tabId) activateTourTab(blueprint.tabId);

                const openSelectors = blueprint.openSelectors || [];
                if (blueprint.skipOpenSelectorsWhenVisible && typeof blueprint.skipOpenSelectorsWhenVisible === 'object') {
                    const toOpen = openSelectors.filter((sel) => {
                        const modalSel = blueprint.skipOpenSelectorsWhenVisible[sel];
                        if (!modalSel) return true;
                        const modal = document.querySelector(modalSel);
                        return !modal || modal.classList.contains('hidden');
                    });
                    clickSelectorsInOrder(toOpen);
                } else {
                    clickSelectorsInOrder(openSelectors);
                }
                ensureBlueprintTargetsVisible(blueprint);

                if (blueprint.scrollToTop) {
                    try {
                        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    } catch {
                        window.scrollTo(0, 0);
                    }
                }

                if (blueprint.tabNavHighlightTabId) {
                    const navTarget = resolveVisibleTabNavTarget(blueprint.tabNavHighlightTabId);
                    if (navTarget) return navTarget;
                }

                const highlightGroupTarget = buildHighlightProxyForSelectors(
                    blueprint.highlightGroupSelectors,
                );
                if (highlightGroupTarget) return highlightGroupTarget;

                const target = resolveFirstAvailableElement(blueprint.selectors);
                if (target) return target;

                const openTrigger = resolveFirstAvailableElement(openSelectors);
                if (openTrigger) return openTrigger;

                return resolveFirstAvailableElement(['#mainTab', '#searchInput', '#openCommandPaletteBtn']);
            };
        }

        return step;
    });
}

function setOnboardingAutoOfferInStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(ONBOARDING_AUTO_OFFER_STORAGE_KEY, '1');
        }
    } catch {
        /* ignore */
    }
}

async function persistOnboardingAutoPromptConsumed() {
    if (!deps.State?.userPreferences) return;
    deps.State.userPreferences.onboardingTourAutoPromptConsumed = true;
    setOnboardingAutoOfferInStorage();
    if (typeof deps.saveUserPreferences === 'function') {
        try {
            await deps.saveUserPreferences();
        } catch (error) {
            console.warn('[onboarding-tour] Не удалось сохранить флаг автопоказа онбординга:', error);
        }
    }
}

async function markTourCompleted() {
    if (!deps.State || !deps.State.userPreferences) return;

    deps.State.userPreferences.onboardingTourCompleted = true;
    deps.State.userPreferences.onboardingTourAutoPromptConsumed = true;
    setOnboardingAutoOfferInStorage();
    if (typeof deps.saveUserPreferences === 'function') {
        try {
            await deps.saveUserPreferences();
        } catch (error) {
            console.warn('[onboarding-tour] Не удалось сохранить настройки после тура:', error);
        }
    }
}

/** Размер стрелки (бордер 5px × 2). Совпадает с driver.css. */
const POPOVER_ARROW_SIZE = 10;
/** Минимальный отступ стрелки от края поповера при кастомном выравнивании. */
const POPOVER_ARROW_EDGE_PADDING = 15;
/** Длительность пост-стабилизации стрелки после highlight (гонки с smoothScroll/resize). */
const POPOVER_ARROW_STABILIZE_MS = 500;

/**
 * Синхронизирует стрелку поповера с подсвеченным элементом: определяет фактическую
 * сторону поповера относительно элемента и позиционирует стрелку так, чтобы она
 * указывала на центр элемента. Устраняет рассинхрон из-за автокоррекции Driver.js
 * (viewport) и фиксированных align start/center/end.
 */
function detectPopoverSide(elementRect, popoverRect) {
    if (popoverRect.bottom <= elementRect.top) return 'top';
    if (popoverRect.top >= elementRect.bottom) return 'bottom';
    if (popoverRect.right <= elementRect.left) return 'left';
    if (popoverRect.left >= elementRect.right) return 'right';

    const elementCenterX = elementRect.left + elementRect.width / 2;
    const elementCenterY = elementRect.top + elementRect.height / 2;
    const popoverCenterX = popoverRect.left + popoverRect.width / 2;
    const popoverCenterY = popoverRect.top + popoverRect.height / 2;
    const deltaX = popoverCenterX - elementCenterX;
    const deltaY = popoverCenterY - elementCenterY;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return deltaX >= 0 ? 'right' : 'left';
    }
    return deltaY >= 0 ? 'bottom' : 'top';
}

function syncPopoverArrowToElement(highlightedElement = null) {
    const element =
        highlightedElement && typeof highlightedElement.getBoundingClientRect === 'function'
            ? highlightedElement
            : document.querySelector('.driver-active-element');
    const popoverEl = document.querySelector('.driver-popover.onboarding-tour-popover') || document.querySelector('.driver-popover');
    if (!element || !popoverEl) return;
    const wrapper = popoverEl;
    const arrow = popoverEl.querySelector('.driver-popover-arrow');
    if (!wrapper || !arrow) return;

    const er = element.getBoundingClientRect();
    const wr = wrapper.getBoundingClientRect();
    const ecx = er.left + er.width / 2;
    const ecy = er.top + er.height / 2;
    const side = detectPopoverSide(er, wr);

    arrow.className = 'driver-popover-arrow';
    arrow.classList.add(`driver-popover-arrow-side-${side}`);
    arrow.classList.add('driver-popover-arrow-align-custom');

    const pad = POPOVER_ARROW_EDGE_PADDING;
    const size = POPOVER_ARROW_SIZE;
    arrow.removeAttribute('style');

    if (side === 'top' || side === 'bottom') {
        const leftPx = ecx - wr.left - size / 2;
        const clamped = Math.max(pad, Math.min(wr.width - pad - size, leftPx));
        arrow.style.left = `${clamped}px`;
        arrow.style.right = 'auto';
        arrow.style.marginLeft = '0';
    } else {
        const topPx = ecy - wr.top - size / 2;
        const clamped = Math.max(pad, Math.min(wr.height - pad - size, topPx));
        arrow.style.top = `${clamped}px`;
        arrow.style.bottom = 'auto';
        arrow.style.marginTop = '0';
    }

    popoverEl.classList?.remove('onboarding-arrow-pending');
}

function stabilizePopoverArrow(highlightedElement) {
    const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = () => {
        const nowTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const popoverEl =
            document.querySelector('.driver-popover.onboarding-tour-popover') ||
            document.querySelector('.driver-popover');
        if (!popoverEl) return;

        syncPopoverArrowToElement(highlightedElement);

        if (nowTs - startTs < POPOVER_ARROW_STABILIZE_MS) {
            requestAnimationFrame(tick);
        }
    };

    requestAnimationFrame(tick);
}

function applyPopoverAccessibility(popover) {
    if (!popover) return;
    popover.wrapper?.setAttribute('aria-label', 'Пошаговый тур по интерфейсу');
    popover.nextButton?.setAttribute('title', 'Следующий шаг');
    popover.nextButton?.setAttribute('aria-label', 'Следующий шаг');
    popover.previousButton?.setAttribute('title', 'Предыдущий шаг');
    popover.previousButton?.setAttribute('aria-label', 'Предыдущий шаг');
    popover.closeButton?.setAttribute('title', 'Пропустить тур');
    popover.closeButton?.setAttribute('aria-label', 'Пропустить тур');
}

export function shouldShowOnboardingAfterInit() {
    if (!deps.State?.userPreferences) return false;
    const p = deps.State.userPreferences;
    if (p.onboardingTourCompleted === true) return false;
    if (p.onboardingTourAutoPromptConsumed === true) return false;
    try {
        if (
            typeof localStorage !== 'undefined' &&
            localStorage.getItem(ONBOARDING_AUTO_OFFER_STORAGE_KEY) === '1'
        ) {
            return false;
        }
    } catch {
        /* ignore */
    }
    return true;
}

export async function startOnboardingTour() {
    const previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

    try {
        if (typeof deps.setActiveTab === 'function') {
            await deps.setActiveTab('main');
        }

        const driverFactory = await ensureDriverFactory();
        const tourSteps = buildTourSteps();

        if (activeTour && typeof activeTour.isActive === 'function' && activeTour.isActive()) {
            activeTour.destroy();
        }

        activeTour = driverFactory({
            animate: true,
            smoothScroll: true,
            allowKeyboardControl: true,
            showProgress: true,
            progressText: '{{current}} / {{total}}',
            showButtons: ['previous', 'next', 'close'],
            prevBtnText: 'Назад',
            nextBtnText: 'Далее',
            doneBtnText: 'Готово',
            overlayClickBehavior: 'close',
            stagePadding: 8,
            stageRadius: 12,
            popoverClass: 'onboarding-tour-popover',
            onPopoverRender: (popover) => {
                applyPopoverAccessibility(popover);
                popover.wrapper?.classList.add('onboarding-arrow-pending');
            },
            onHighlightStarted: (_element, step) => {
                if (step?.tabId) {
                    activateTourTab(step.tabId);
                }
            },
            onHighlighted: (highlightedElement, step) => {
                const side = step?.popover?.side;
                if (!highlightedElement || side === 'over') return;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        stabilizePopoverArrow(highlightedElement);
                    });
                });
            },
            onDestroyed: () => {
                removeTourHighlightProxy();
                void markTourCompleted();
                if (typeof deps.setActiveTab === 'function') {
                    void Promise.resolve(deps.setActiveTab('main')).catch((error) => {
                        console.warn('[onboarding-tour] Не удалось перейти на вкладку «Главная» после тура:', error);
                    });
                }
                if (previouslyFocused && document.contains(previouslyFocused)) {
                    previouslyFocused.focus();
                }
            },
            steps: tourSteps,
        });

        activeTour.drive();
        return true;
    } catch (error) {
        console.error('[onboarding-tour] Ошибка запуска тура:', error);
        if (typeof deps.showNotification === 'function') {
            deps.showNotification('Не удалось запустить онбординг-тур.', 'error');
        }
        return false;
    }
}

export async function promptAndStartOnboardingTour() {
    await persistOnboardingAutoPromptConsumed();

    if (typeof deps.showAppConfirm !== 'function') {
        return startOnboardingTour();
    }

    const confirmed = await deps.showAppConfirm({
        title: 'Познакомиться с приложением?',
        message:
            'Показать короткий тур по интерфейсу Copilot 1СО? Его можно пропустить и позже запустить снова из настроек.',
        confirmText: 'Начать тур',
        cancelText: 'Позже',
        confirmClass: 'bg-primary hover:bg-secondary text-white',
    });

    if (!confirmed) return false;
    return startOnboardingTour();
}

export const __onboardingTourInternals = {
    TOUR_STEP_BLUEPRINTS,
    buildTourSteps,
    activateTourTab,
    detectPopoverSide,
    stabilizePopoverArrow,
    syncPopoverArrowToElement,
    resolveVisibleTabNavTarget,
};
