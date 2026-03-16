'use strict';

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
];

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
        selectors: ['#commandPaletteModal', '#commandPaletteInput'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Управление данными',
        description:
            'Здесь экспорт, слияние, импорт и принудительная перезагрузка данных. Используйте блок для резервирования и переноса базы.',
        selectors: ['#exportDataBtn', '#mergeDataBtn', '#importDataBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Горячие клавиши и настройки',
        description:
            'Отсюда открываются справка по горячим клавишам и модальное окно настройки интерфейса.',
        selectors: ['#showHotkeysBtn', '#customizeUIBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Горячие клавиши (модальное окно)',
        description:
            'Справка по горячим клавишам помогает быстрее работать без мыши в повседневных сценариях.',
        openSelectors: ['#showHotkeysBtn'],
        selectors: ['#hotkeysModal', '#closeHotkeysModalBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Настройка интерфейса (модальное окно)',
        description:
            'В этом окне можно менять тему, плотность, шрифт, поведение импорта, запускать диагностику и повторно запускать тур.',
        openSelectors: ['#customizeUIBtn'],
        selectors: ['#customizeUIModal', '#runManualHealthCheckBtn', '#restartOnboardingTourBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Недавно удаленные',
        description:
            'Из окна настроек доступна корзина: отсюда можно восстановить удаленные записи или очистить их окончательно.',
        openSelectors: ['#customizeUIBtn', '#openRecentlyDeletedBtn'],
        selectors: ['#recentlyDeletedModal', '#recentlyDeletedList'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Таймер и тема',
        description:
            'Рабочий таймер и быстрый переключатель темы всегда под рукой в шапке приложения.',
        selectors: ['#appTimer', '#themeToggle'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Панель вкладок',
        description:
            'Основные разделы приложения собраны в панели вкладок. Если вкладок много, часть будет скрыта в меню "Еще".',
        selectors: ['#mainTab', '#moreTabsBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Главная',
        description: 'На главной вкладке расположен основной алгоритм и быстрые действия по клиенту.',
        tabId: 'main',
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
            'Ведите рабочие заметки в панели, открывайте отдельное окно или всплывающую форму для быстрого доступа.',
        tabId: 'main',
        selectors: ['#clientNotes', '#openClientNotesWindowBtn', '#openClientNotesPopupBtn'],
        side: 'left',
        align: 'center',
    },
    {
        title: 'Программа 1С',
        description:
            'Раздел с алгоритмами по сценариям работы в программе 1С: добавление, редактирование и хранение инструкций.',
        tabId: 'program',
        selectors: ['#programTab', '#programAlgorithms', '#addProgramAlgorithmBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'СКЗИ',
        description: 'Алгоритмы по работе с криптосредствами и сертификатами собраны на этой вкладке.',
        tabId: 'skzi',
        selectors: ['#skziTab', '#skziAlgorithms', '#addSkziAlgorithmBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'ЛК 1С',
        description:
            'Здесь инструкции для сценариев личного кабинета 1С с отдельной базой алгоритмов.',
        tabId: 'lk1c',
        selectors: ['#lk1cTab', '#lk1cAlgorithms', '#addLk1cAlgorithmBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Web-регламенты',
        description:
            'Вкладка для веб-регламентов и соответствующих алгоритмов по внешним рабочим процессам.',
        tabId: 'webReg',
        selectors: ['#webRegTab', '#webRegAlgorithms', '#addWebRegAlgorithmBtn'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Ссылки ЦИБ',
        description:
            'Каталог внутренних ссылок ЦИБ с поиском и быстрым добавлением карточек ссылок.',
        tabId: 'links',
        selectors: ['#linksTab', '#linksContainer', '#addLinkBtn', '#linkSearchInput'],
        side: 'bottom',
        align: 'center',
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
        title: 'Закладки',
        description:
            'Персональные закладки с папками, сортировкой, фильтрами и экспортом в PDF.',
        tabId: 'bookmarks',
        selectors: ['#bookmarksTab', '#bookmarksContainer', '#addBookmarkBtn', '#bookmarkSearchInput'],
        side: 'bottom',
        align: 'center',
    },
    {
        title: 'Мастер слияния баз данных',
        description:
            'Пошаговый мастер слияния помогает безопасно объединять базы и управлять конфликтами записей.',
        openSelectors: ['#mergeDataBtn'],
        selectors: ['#dbMergeModal', '#dbMergeModalTitle'],
        side: 'left',
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
            'Раздел для фиксации проблемных кейсов с поиском и управлением записями.',
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
        if (el) return el;
    }
    return null;
}

function clickElementBySelector(selector) {
    if (!selector) return false;
    const el = document.querySelector(selector);
    if (!el || typeof el.click !== 'function') return false;
    el.click();
    return true;
}

function clickSelectorsInOrder(selectors) {
    if (!Array.isArray(selectors)) return;
    selectors.forEach((selector) => {
        clickElementBySelector(selector);
    });
}

function hideElementBySelector(selector) {
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    if (el.classList && typeof el.classList.add === 'function') {
        el.classList.add('hidden');
    }
    if (el.style) {
        el.style.display = 'none';
    }
}

function closeTransientModalsForTour() {
    if (typeof window.closeRecentlyDeletedModal === 'function') {
        try {
            window.closeRecentlyDeletedModal();
        } catch (error) {
            console.warn('[onboarding-tour] Не удалось закрыть recentlyDeleted modal:', error);
        }
    }
    TRANSIENT_MODAL_SELECTORS.forEach(hideElementBySelector);
    document.body.classList.remove('modal-open', 'overflow-hidden');
}

function activateTourTab(tabId) {
    if (!tabId || typeof deps.setActiveTab !== 'function') return;
    const bypassWarning = TAB_WARNING_BYPASS.has(tabId);
    Promise.resolve(deps.setActiveTab(tabId, bypassWarning)).catch((error) => {
        console.warn('[onboarding-tour] Не удалось переключить вкладку для шага тура:', tabId, error);
    });
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
                closeTransientModalsForTour();
                if (blueprint.tabId) activateTourTab(blueprint.tabId);
                clickSelectorsInOrder(blueprint.openSelectors);
                return resolveFirstAvailableElement(blueprint.selectors);
            };
        }

        return step;
    });
}

async function markTourCompleted() {
    if (!deps.State || !deps.State.userPreferences) return;

    deps.State.userPreferences.onboardingTourCompleted = true;
    if (typeof deps.saveUserPreferences === 'function') {
        try {
            await deps.saveUserPreferences();
        } catch (error) {
            console.warn('[onboarding-tour] Не удалось сохранить настройки после тура:', error);
        }
    }
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
    return !(
        deps.State &&
        deps.State.userPreferences &&
        deps.State.userPreferences.onboardingTourCompleted
    );
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
            },
            onHighlightStarted: (_element, step) => {
                if (step?.tabId) {
                    activateTourTab(step.tabId);
                }
            },
            onDestroyed: () => {
                void markTourCompleted();
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
};
