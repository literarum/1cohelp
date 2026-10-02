'use strict';

/**
 * Ядро самодиагностики: слои приложения, нормализация проблем, база знаний «симптом → гипотезы → шаги»,
 * ранжирование гипотез с оценкой вероятности, текстовые отчёты для техподдержки.
 * Модуль не зависит от DOM (кроме защищённого чтения окружения) и покрыт unit-тестами.
 */

// ============================================================================
// СЛОИ
// ============================================================================

/** @type {Record<string, { id: string, label: string, short: string, icon: string, order: number, hint: string }>} */
export const DIAGNOSTIC_LAYERS = {
    network: {
        id: 'network',
        label: 'Сеть и среда',
        short: 'Сеть',
        icon: 'fa-wifi',
        order: 1,
        hint: 'Подключение устройства, контекст страницы, возможности браузера.',
    },
    external: {
        id: 'external',
        label: 'Внешние сервисы',
        short: 'Внешние сервисы',
        icon: 'fa-cloud',
        order: 2,
        hint: 'Google Docs («Шаблоны») и другие облачные источники.',
    },
    storage: {
        id: 'storage',
        label: 'Хранилище',
        short: 'Хранилище',
        icon: 'fa-database',
        order: 3,
        hint: 'IndexedDB, localStorage, квота и persistence.',
    },
    pwa: {
        id: 'pwa',
        label: 'Service Worker и кэш',
        short: 'SW / кэш',
        icon: 'fa-layer-group',
        order: 4,
        hint: 'Офлайн-режим, версия приложения, кэш оболочки.',
    },
    data: {
        id: 'data',
        label: 'Данные и резервные копии',
        short: 'Данные',
        icon: 'fa-file-shield',
        order: 5,
        hint: 'Целостность записей, экспорт, импорт, слияние баз, автосохранение.',
    },
    search: {
        id: 'search',
        label: 'Поиск и индекс',
        short: 'Поиск',
        icon: 'fa-magnifying-glass',
        order: 6,
        hint: 'Поисковый индекс и выдача.',
    },
    ui: {
        id: 'ui',
        label: 'Интерфейс',
        short: 'Интерфейс',
        icon: 'fa-window-maximize',
        order: 7,
        hint: 'DOM, вёрстка, кнопки, тема, буфер обмена, уведомления.',
    },
    runtime: {
        id: 'runtime',
        label: 'Выполнение приложения',
        short: 'Выполнение',
        icon: 'fa-microchip',
        order: 8,
        hint: 'Необработанные ошибки JavaScript, память, watchdog, телеметрия.',
    },
};

export const DIAGNOSTIC_LAYER_ORDER = Object.values(DIAGNOSTIC_LAYERS)
    .sort((a, b) => a.order - b.order)
    .map((l) => l.id);

/**
 * Определяет слой записи отчёта здоровья (по системе и заголовку).
 * @param {{ system?: string, title?: string, message?: string, layer?: string }} entry
 * @returns {string} id слоя
 */
export function inferLayer(entry) {
    if (entry && entry.layer && DIAGNOSTIC_LAYERS[entry.layer]) return entry.layer;
    const system = String(entry?.system || '');
    const title = String(entry?.title || '');
    const t = `${title}`;

    if (system === 'external' || /google|гугл|внешн\w* сервис|apps script/i.test(t)) return 'external';
    if (/^(?:Watchdog \/ )?Сеть|NetworkInformation|офлайн/i.test(t)) return 'network';
    if (/Безопасный контекст|Cross-origin/i.test(t)) return 'network';
    if (/localStorage|sessionStorage/i.test(t)) return 'storage';

    switch (system) {
        case 'storage_idb':
        case 'storage_quota':
            return 'storage';
        case 'tab_pwa':
            return 'pwa';
        case 'search':
            return 'search';
        case 'ui':
        case 'ui_surface':
        case 'notifications':
        case 'clipboard':
            return 'ui';
        case 'data_content':
        case 'data_integrity':
        case 'export_import':
        case 'merge':
        case 'autosave':
            return 'data';
        case 'runtime_errors':
        case 'memory':
        case 'telemetry':
        case 'watchdog':
        case 'observability':
        case 'app_init':
            return 'runtime';
        case 'runtime':
            return /Сеть|сеть/.test(t) ? 'network' : 'runtime';
        default:
            break;
    }
    if (/IndexedDB|Хранилищ|квот/i.test(t)) return 'storage';
    if (/Service Worker|Вкладка/i.test(t)) return 'pwa';
    if (/Поиск|индекс/i.test(t)) return 'search';
    return 'runtime';
}

// ============================================================================
// ОКРУЖЕНИЕ
// ============================================================================

/**
 * Синхронный снимок окружения, влияющий на выбор гипотез.
 */
export function collectDiagnosticEnvironment() {
    const env = {
        at: Date.now(),
        atIso: new Date().toISOString(),
        online: null,
        protocol: null,
        origin: null,
        secureContext: null,
        visibility: null,
        serviceWorkerSupported: false,
        serviceWorkerController: false,
        connection: null,
        saveData: null,
        language: null,
        userAgent: null,
        viewport: null,
    };
    try {
        if (typeof navigator !== 'undefined') {
            env.online = navigator.onLine;
            env.serviceWorkerSupported = 'serviceWorker' in navigator;
            env.serviceWorkerController = Boolean(navigator.serviceWorker?.controller);
            env.language = navigator.language || null;
            env.userAgent = String(navigator.userAgent || '').slice(0, 220);
            const c = navigator.connection;
            if (c) {
                env.connection = `${c.effectiveType || '?'} / ${c.downlink ?? '?'} Мбит/с / RTT ${c.rtt ?? '?'} мс`;
                env.saveData = Boolean(c.saveData);
            }
        }
        if (typeof location !== 'undefined') {
            env.protocol = location.protocol;
            env.origin = location.origin;
        }
        if (typeof window !== 'undefined') {
            env.secureContext = Boolean(window.isSecureContext);
            env.viewport = `${window.innerWidth}×${window.innerHeight}`;
        }
        if (typeof document !== 'undefined') env.visibility = document.visibilityState;
    } catch {
        /* окружение собирается по возможности */
    }
    return env;
}

// ============================================================================
// БАЗА ЗНАНИЙ
// ============================================================================

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   weight: number,
 *   detail?: string,
 *   steps: string[],
 *   adjust?: (ctx: DiagnosticContext) => ({ delta?: number, evidence?: string } | null | undefined),
 * }} HypothesisTemplate
 *
 * @typedef {{
 *   issue: NormalizedIssue,
 *   text: string,
 *   env: ReturnType<typeof collectDiagnosticEnvironment>,
 *   probes: Record<string, any>,
 * }} DiagnosticContext
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   message: string,
 *   level: 'error'|'warn'|'info',
 *   system: string,
 *   layer: string,
 *   source: string,
 *   ts: number,
 *   errorInfo: any,
 *   details: any,
 * }} NormalizedIssue
 */

const UNIVERSAL_STEPS = [
    'Повторите действие и проверку через минуту — часть сбоев временные.',
    'Если проблема сохраняется — нажмите «Копировать отчёт» и отправьте его в техподдержку.',
];

const GDOCS_PROBE_NOTE =
    'Сравнение «локальный сервер отвечает / внешний недоступен» помогает отличить блокировку Google от общей потери сети.';

/** Гипотезы по типу ошибки связи с Google Docs (errorInfo.kind). */
const GDOCS_KIND_HYPOTHESES = {
    offline: [
        {
            id: 'device-offline',
            title: 'У устройства нет подключения к сети',
            weight: 90,
            detail: 'Браузер сообщает navigator.onLine = false: запрос даже не отправлялся.',
            steps: [
                'Проверьте Wi‑Fi или сетевой кабель, отключите режим «в самолёте».',
                'Откройте любой другой сайт в соседней вкладке — загружается ли он.',
                'После восстановления сети данные обновятся автоматически (приложение само повторит опрос), либо нажмите «Обновить».',
            ],
        },
        {
            id: 'false-offline',
            title: 'Браузер ошибочно считает устройство офлайн (VPN, виртуальный адаптер)',
            weight: 8,
            steps: [
                'Временно отключите VPN или виртуальные сетевые адаптеры.',
                'Перезапустите браузер и повторите проверку.',
            ],
        },
    ],
    network: [
        {
            id: 'external-blocked',
            title: 'Доступ к script.google.com заблокирован на уровне сети (файрвол, прокси, DNS-фильтр)',
            weight: 38,
            detail: 'Запрос завершился сетевой ошибкой до получения HTTP-ответа.',
            steps: [
                'Откройте https://script.google.com в соседней вкладке: если не открывается — домен блокируется сетью.',
                'Попросите администратора добавить script.google.com и *.googleusercontent.com в список разрешённых.',
                'Проверьте настройки прокси и DNS (попробуйте 8.8.8.8 или 1.1.1.1).',
                'Если вы за корпоративной сетью — переключитесь на другую сеть (например, мобильную точку доступа) для проверки.',
            ],
            adjust: (ctx) => {
                const p = ctx.probes;
                if (p?.sameOrigin?.ok === true && p?.external?.ok === false) {
                    return {
                        delta: 38,
                        evidence: `Локальный сервер приложения отвечает, а внешний хост нет. ${GDOCS_PROBE_NOTE}`,
                    };
                }
                if (p?.sameOrigin?.ok === false) return { delta: -20 };
                return null;
            },
        },
        {
            id: 'internet-down',
            title: 'У сети или провайдера нет доступа в интернет',
            weight: 26,
            steps: [
                'Откройте любой публичный сайт: если он тоже не открывается — проблема в подключении к интернету.',
                'Перезагрузите роутер, проверьте тариф/оплату у провайдера.',
                'Подождите: приложение повторит опрос автоматически (раз в 5 минут и сразу при возврате сети).',
            ],
            adjust: (ctx) => {
                const p = ctx.probes;
                if (p?.sameOrigin?.ok === false && p?.external?.ok === false) {
                    return { delta: 30, evidence: 'Не отвечают ни локальный, ни внешний хост.' };
                }
                if (ctx.env.connection && /slow-2g|2g/.test(ctx.env.connection)) {
                    return { delta: 10, evidence: `Очень медленное соединение: ${ctx.env.connection}.` };
                }
                return null;
            },
        },
        {
            id: 'extension-block',
            title: 'Расширение браузера (блокировщик рекламы/приватности) блокирует запрос',
            weight: 14,
            steps: [
                'Откройте приложение в окне инкогнито (расширения обычно отключены) и повторите.',
                'Добавьте адрес приложения в исключения блокировщика (uBlock, AdGuard, Privacy Badger).',
            ],
        },
        {
            id: 'tls-inspect',
            title: 'Корпоративный прокси/антивирус подменяет сертификат (SSL-инспекция) или требует вход (captive portal)',
            weight: 12,
            steps: [
                'Откройте любой HTTPS-сайт: нет ли страницы входа Wi‑Fi или предупреждения о сертификате.',
                'Обратитесь к администратору: нужен доверенный корневой сертификат прокси.',
            ],
        },
        {
            id: 'insecure-origin',
            title: 'Приложение открыто как локальный файл (file://) или с небезопасного адреса',
            weight: 3,
            steps: [
                'Откройте приложение по его https-адресу или через локальный веб-сервер, а не двойным кликом по index.html.',
            ],
            adjust: (ctx) =>
                ctx.env.protocol === 'file:'
                    ? { delta: 70, evidence: 'Адрес страницы начинается с file://.' }
                    : null,
        },
        {
            id: 'negative-cache',
            title: 'Повторный запрос отложен из-за недавнего сбоя (защита от лавины запросов, 30 с)',
            weight: 2,
            steps: ['Нажмите «Повторить»/«Обновить» — ручной запрос игнорирует отсрочку.'],
            adjust: (ctx) =>
                /отложен/i.test(ctx.text) ? { delta: 60, evidence: 'В тексте ошибки: «повторный запрос отложен».' } : null,
        },
    ],
    timeout: [
        {
            id: 'slow-link',
            title: 'Медленное или нестабильное соединение — ответ не успел прийти за 12 секунд',
            weight: 48,
            steps: [
                'Проверьте скорость и стабильность подключения (Wi‑Fi сигнал, перегрузка канала).',
                'Повторите попытку: приложение делает до 4 попыток с нарастающей паузой.',
            ],
        },
        {
            id: 'gas-cold-start',
            title: 'Скрипт Google Apps Script «просыпается» или перегружен (долгий холодный старт)',
            weight: 38,
            steps: [
                'Подождите 1–2 минуты и нажмите «Обновить» — второй запрос обычно быстрее.',
                'Если повторяется постоянно — проверьте квоты и время выполнения скрипта в консоли Apps Script.',
            ],
        },
        {
            id: 'proxy-stall',
            title: 'Прокси или антивирус задерживает ответ',
            weight: 14,
            steps: ['Попробуйте другую сеть или временно отключите прокси для проверки.'],
        },
    ],
    http: [
        {
            id: 'access-denied',
            title: 'Развёртывание Apps Script или документ недоступны без входа (права доступа)',
            weight: 20,
            steps: [
                'В Apps Script: Развернуть → Управление развёртываниями → доступ «Все» (Anyone).',
                'Убедитесь, что документ с шаблонами открыт для чтения владельцем скрипта.',
            ],
            adjust: (ctx) => {
                const s = ctx.issue.errorInfo?.status;
                return s === 401 || s === 403
                    ? { delta: 55, evidence: `HTTP ${s}: доступ запрещён.` }
                    : null;
            },
        },
        {
            id: 'wrong-deployment',
            title: 'Адрес развёртывания устарел или удалён (HTTP 404/410)',
            weight: 10,
            steps: [
                'Проверьте актуальность URL развёртывания Apps Script в настройках приложения (константа BASE_URL).',
                'Создайте новое развёртывание и обновите ссылку.',
            ],
            adjust: (ctx) => {
                const s = ctx.issue.errorInfo?.status;
                return s === 404 || s === 410
                    ? { delta: 60, evidence: `HTTP ${s}: адрес не найден.` }
                    : null;
            },
        },
        {
            id: 'quota',
            title: 'Превышены квоты Google Apps Script (запросы/время выполнения за сутки)',
            weight: 8,
            steps: [
                'Подождите — суточные квоты сбрасываются автоматически.',
                'Проверьте квоты в консоли Apps Script (раздел «Выполнения»).',
            ],
            adjust: (ctx) => {
                const s = ctx.issue.errorInfo?.status;
                return s === 429 ? { delta: 65, evidence: 'HTTP 429: слишком много запросов.' } : null;
            },
        },
        {
            id: 'google-5xx',
            title: 'Сбой на стороне Google или ошибка выполнения скрипта (HTTP 5xx)',
            weight: 12,
            steps: [
                'Откройте консоль Apps Script и посмотрите журнал выполнений на ошибки.',
                'Если ошибки нет — повторите позже: сбой на стороне Google обычно кратковременный.',
            ],
            adjust: (ctx) => {
                const s = ctx.issue.errorInfo?.status;
                return typeof s === 'number' && s >= 500
                    ? { delta: 62, evidence: `HTTP ${s}: ошибка сервера.` }
                    : null;
            },
        },
    ],
    parse: [
        {
            id: 'html-instead-json',
            title: 'Вместо JSON пришла HTML-страница (вход в аккаунт, страница ошибки Google или перехват прокси)',
            weight: 55,
            steps: [
                'Откройте адрес развёртывания в соседней вкладке: если просит войти — выдайте доступ «Все».',
                'Проверьте, что скрипт возвращает ContentService с MimeType.JSON.',
            ],
        },
        {
            id: 'captive-portal',
            title: 'Страница входа в публичный Wi‑Fi подменяет ответ',
            weight: 22,
            steps: ['Откройте любой http-сайт и пройдите авторизацию в Wi‑Fi сети.'],
        },
        {
            id: 'truncated',
            title: 'Ответ оборван на полпути (нестабильное соединение)',
            weight: 18,
            steps: ['Повторите запрос; при повторении проверьте качество соединения.'],
        },
    ],
    server: [
        {
            id: 'script-error',
            title: 'Скрипт Apps Script вернул ошибку (документ недоступен, неверный ID или исключение в коде)',
            weight: 70,
            steps: [
                'Проверьте идентификатор документа и права владельца скрипта на чтение.',
                'Откройте журнал выполнений Apps Script и найдите исключение по времени запроса.',
            ],
        },
        {
            id: 'doc-missing',
            title: 'Документ удалён или недоступен аккаунту, от имени которого работает скрипт',
            weight: 25,
            steps: ['Убедитесь, что документ существует и у аккаунта скрипта есть доступ.'],
        },
    ],
    format: [
        {
            id: 'format-changed',
            title: 'Формат ответа скрипта изменился (приложение не понимает структуру)',
            weight: 65,
            steps: [
                'Сравните ответ скрипта с ожидаемым форматом ([{status, content:{data:[…]}}]).',
                'Откройте вкладку «Шаблоны» и обновите приложение до последней версии.',
            ],
        },
        {
            id: 'doc-empty',
            title: 'Документ пуст или содержит только служебное форматирование',
            weight: 30,
            steps: ['Откройте исходный документ и проверьте, что в нём есть заголовки и текст.'],
        },
    ],
    unknown: [
        {
            id: 'unknown-gdocs',
            title: 'Причина не определена по тексту ошибки',
            weight: 50,
            steps: [
                'Нажмите «Проверить связь сейчас» — результаты зондов уточнят слой, на котором возникает сбой.',
                'Скопируйте технические детали и передайте в техподдержку.',
            ],
        },
        {
            id: 'external-blocked-generic',
            title: 'Внешний сервис временно недоступен или заблокирован сетью',
            weight: 30,
            steps: ['Проверьте доступность script.google.com из другой сети.'],
        },
    ],
};

/**
 * Правила разбора записей отчёта здоровья. Первое подходящее правило (по порядку) формирует гипотезы.
 * @type {Array<{ id: string, test: (ctx: DiagnosticContext) => boolean, layer?: string, cause: string, hypotheses: HypothesisTemplate[] }>}
 */
const RULES = [
    {
        id: 'idb-quota',
        test: (c) => /quota|квот|QuotaExceeded|нехватк\w* места/i.test(c.text) && /indexeddb|хранилищ|storage|запис/i.test(c.text),
        layer: 'storage',
        cause: 'Не хватает места для записи в хранилище браузера.',
        hypotheses: [
            {
                id: 'quota-full',
                title: 'Квота хранилища исчерпана (много вложений PDF/скриншотов)',
                weight: 70,
                steps: [
                    'Сделайте резервную копию (Настройки → Экспорт).',
                    'Удалите ненужные вложения и очистите «Недавно удалённое».',
                    'Освободите место на диске устройства и перезапустите браузер.',
                ],
            },
            {
                id: 'private-mode',
                title: 'Приватный режим браузера ограничивает объём хранилища',
                weight: 18,
                steps: ['Откройте приложение в обычном окне (не в приватном).'],
            },
            {
                id: 'no-persist',
                title: 'Хранилище не защищено от автоочистки (persistence не предоставлена)',
                weight: 12,
                steps: ['Установите приложение как PWA — браузер реже очищает данные установленных приложений.'],
            },
        ],
    },
    {
        id: 'idb-blocked',
        test: (c) => /indexeddb|базa данных|базы данных|idb/i.test(c.text) && /blocked|заблок|versionerror|invalidstate|unknownerror|не инициализир|connection is closing|database.*closed/i.test(c.text),
        layer: 'storage',
        cause: 'Соединение с IndexedDB недоступно или повреждено.',
        hypotheses: [
            {
                id: 'idb-other-tab',
                title: 'Другая вкладка с приложением держит старую версию базы и блокирует обновление',
                weight: 38,
                steps: ['Закройте остальные вкладки приложения и перезагрузите страницу (Ctrl+F5).'],
            },
            {
                id: 'idb-closed',
                title: 'Браузер закрыл соединение (нехватка памяти, выгрузка вкладки, обновление браузера)',
                weight: 30,
                steps: ['Перезагрузите страницу.', 'Перезапустите браузер.'],
            },
            {
                id: 'idb-corrupt',
                title: 'Профиль браузера или база IndexedDB повреждены',
                weight: 20,
                steps: [
                    'Сначала экспортируйте данные, если приложение открывается.',
                    'Попробуйте другой профиль/браузер и восстановите данные из резервной копии.',
                ],
            },
            {
                id: 'idb-disabled',
                title: 'IndexedDB отключена политикой браузера или режимом приватности',
                weight: 12,
                steps: ['Проверьте настройки браузера: «Cookies и данные сайтов» должны быть разрешены.'],
            },
        ],
    },
    {
        id: 'idb-roundtrip',
        test: (c) => /indexeddb/i.test(c.text) && /(запис[ьи] не найден|второй контур|расхождение|отсутств\w+ хранилищ)/i.test(c.text),
        layer: 'storage',
        cause: 'Данные записываются и читаются неодинаково — признак нарушения схемы или повреждения хранилища.',
        hypotheses: [
            {
                id: 'schema-mismatch',
                title: 'Схема базы не обновлена (не хватает хранилищ после обновления приложения)',
                weight: 45,
                steps: [
                    'Полностью перезагрузите страницу (Ctrl+F5), чтобы применить миграцию схемы.',
                    'Закройте другие вкладки приложения.',
                ],
            },
            {
                id: 'idb-corrupt',
                title: 'Хранилище повреждено',
                weight: 30,
                steps: ['Сделайте экспорт данных и восстановите их после очистки сайта.'],
            },
            {
                id: 'race',
                title: 'Гонка записи/чтения во время диагностики',
                weight: 20,
                steps: ['Повторите проверку, когда приложение не выполняет импорт/индексацию.'],
            },
        ],
    },
    {
        id: 'ls-fail',
        test: (c) => /localstorage|sessionstorage/i.test(c.text) && c.issue.level !== 'info',
        layer: 'storage',
        cause: 'Web Storage недоступно для записи.',
        hypotheses: [
            {
                id: 'ls-blocked',
                title: 'Браузер блокирует хранилище сайта (запрет cookies/данных сайтов, приватный режим)',
                weight: 55,
                steps: ['Разрешите хранение данных для адреса приложения в настройках сайта.'],
            },
            {
                id: 'ls-full',
                title: 'Хранилище localStorage переполнено (лимит около 5–10 МБ)',
                weight: 30,
                steps: ['Очистите данные сайта кроме приложения или удалите кэш Google Docs.'],
            },
            {
                id: 'ls-iframe',
                title: 'Приложение встроено в iframe с ограничениями',
                weight: 8,
                steps: ['Откройте приложение в отдельной вкладке.'],
            },
        ],
    },
    {
        id: 'storage-quota-warn',
        test: (c) => /занято\s*~?\d+%|persistent storage|persistence/i.test(c.text) && c.issue.level !== 'info',
        layer: 'storage',
        cause: 'Хранилище браузера почти заполнено.',
        hypotheses: [
            {
                id: 'quota-near',
                title: 'Свободного места на диске или в квоте браузера осталось мало',
                weight: 80,
                steps: [
                    'Сделайте резервную копию данных.',
                    'Удалите ненужные PDF/скриншоты и очистите «Недавно удалённое».',
                    'Освободите место на диске.',
                ],
            },
        ],
    },
    {
        id: 'sw',
        test: (c) => /service worker|serviceworker|вкладка \(восстановление\)|кэш оболочки|precache/i.test(c.text),
        layer: 'pwa',
        cause: 'Проблема в слое Service Worker/кэша.',
        hypotheses: [
            {
                id: 'sw-stale',
                title: 'Установлена устаревшая версия приложения (ожидающее обновление не применено)',
                weight: 45,
                steps: [
                    'Нажмите «Обновить» в панели «Доступна новая версия» или перезагрузите страницу (Ctrl+F5).',
                    'Закройте все вкладки приложения и откройте заново.',
                ],
            },
            {
                id: 'sw-unsupported',
                title: 'Service Worker не поддерживается или отключён (приватный режим, небезопасный адрес)',
                weight: 25,
                steps: ['Откройте приложение по https в обычном окне.'],
                adjust: (ctx) =>
                    ctx.env.serviceWorkerSupported === false || ctx.env.secureContext === false
                        ? { delta: 40, evidence: 'API Service Worker недоступен в текущем контексте.' }
                        : null,
            },
            {
                id: 'sw-cache-broken',
                title: 'Кэш приложения повреждён',
                weight: 20,
                steps: [
                    'DevTools → Application → Storage → «Clear site data» (после резервной копии).',
                    'Перезагрузите страницу.',
                ],
            },
        ],
    },
    {
        id: 'search',
        test: (c) => /поиск|индекс|searchindex/i.test(c.text) && c.issue.level !== 'info',
        layer: 'search',
        cause: 'Поисковый индекс неполон или построен с ошибкой.',
        hypotheses: [
            {
                id: 'index-missing',
                title: 'Индекс не построен или прерван (закрыли вкладку во время индексации)',
                weight: 50,
                steps: ['Настройки → «Перестроить поисковый индекс» и дождитесь завершения.'],
            },
            {
                id: 'index-stale',
                title: 'Индекс устарел после импорта или изменения данных',
                weight: 30,
                steps: ['Перестройте индекс из настроек.'],
            },
            {
                id: 'index-corrupt',
                title: 'Записи индекса повреждены',
                weight: 20,
                steps: ['Перестройте индекс; если не помогло — экспорт данных и проверка хранилища.'],
            },
        ],
    },
    {
        id: 'export-import',
        test: (c) => /экспорт|импорт|резервн|слиян|merge|file system/i.test(c.text) && c.issue.level !== 'info',
        layer: 'data',
        cause: 'Сбой цепочки экспорта/импорта данных.',
        hypotheses: [
            {
                id: 'export-big',
                title: 'Слишком большие вложения (PDF/скриншоты) — не хватило времени или памяти',
                weight: 38,
                steps: ['Уменьшите число вложений или экспортируйте частями.', 'Закройте лишние вкладки и повторите.'],
            },
            {
                id: 'export-data-corrupt',
                title: 'В базе есть повреждённые записи, которые не сериализуются',
                weight: 32,
                steps: ['Запустите проверку целостности данных и исправьте записи из отчёта.'],
            },
            {
                id: 'export-fs',
                title: 'Браузер отклонил запись файла (нет разрешения, отмена диалога)',
                weight: 18,
                steps: ['Разрешите сохранение файлов и повторите экспорт.'],
            },
        ],
    },
    {
        id: 'data-integrity',
        test: (c) => /целостност|некорректн\w+ запис|сирот|orphan|закладк|screenshotids/i.test(c.text) && c.issue.level !== 'info',
        layer: 'data',
        cause: 'Нарушена целостность данных приложения.',
        hypotheses: [
            {
                id: 'broken-links',
                title: 'Есть записи со ссылками на удалённые вложения или неверным форматом полей',
                weight: 55,
                steps: [
                    'Откройте записи, перечисленные в сообщении, и пересохраните их.',
                    'Если записей много — выполните импорт из последней резервной копии.',
                ],
            },
            {
                id: 'old-import',
                title: 'Данные пришли из старой версии/импорта без миграции',
                weight: 28,
                steps: ['Повторите импорт на актуальной версии приложения.'],
            },
            {
                id: 'interrupted',
                title: 'Операция была прервана (закрытие вкладки, сбой питания)',
                weight: 17,
                steps: ['Проверьте, нет ли «Недавно удалённого» с нужными записями.'],
            },
        ],
    },
    {
        id: 'autosave',
        test: (c) => /автосохран|несохранённ|обработчик input/i.test(c.text) && c.issue.level !== 'info',
        layer: 'data',
        cause: 'Автосохранение заметок не успевает или не подключено.',
        hypotheses: [
            {
                id: 'save-slow',
                title: 'Запись в IndexedDB задерживается (большая база, нагрузка)',
                weight: 50,
                steps: ['Подождите 30–60 секунд и повторите проверку.', 'Не закрывайте вкладку до сохранения.'],
            },
            {
                id: 'handler-missing',
                title: 'Обработчик ввода не привязан после сбоя инициализации',
                weight: 35,
                steps: ['Перезагрузите страницу; заметки сохранены в последнем состоянии записи.'],
            },
            {
                id: 'storage-error',
                title: 'Хранилище недоступно для записи',
                weight: 15,
                steps: ['Проверьте слой «Хранилище» в этом отчёте.'],
            },
        ],
    },
    {
        id: 'resource-load',
        test: (c) => /не удалось загрузить|ошибка загрузки (или выполнения )?скрипта|таблицы стилей|failed to load resource|chunk|dynamically imported module/i.test(c.text),
        layer: 'network',
        cause: 'Не загрузился ресурс приложения (скрипт, стили, изображение).',
        hypotheses: [
            {
                id: 'cache-mismatch',
                title: 'Кэш браузера/Service Worker содержит файлы разных версий',
                weight: 45,
                steps: ['Полностью перезагрузите страницу (Ctrl+F5).', 'Нажмите «Обновить» в панели новой версии.'],
            },
            {
                id: 'network-cut',
                title: 'Сеть оборвалась во время загрузки файла',
                weight: 30,
                steps: ['Проверьте подключение и перезагрузите страницу.'],
            },
            {
                id: 'server-missing',
                title: 'Файл отсутствует на сервере (неполное развёртывание)',
                weight: 20,
                steps: ['Проверьте журнал сети в DevTools (вкладка Network, статус 404).'],
            },
        ],
    },
    {
        id: 'js-runtime',
        test: (c) => /typeerror|referenceerror|rangeerror|syntaxerror|cannot read|is not a function|is not defined|unhandledrejection|window\.error|unhandled/i.test(c.text),
        layer: 'runtime',
        cause: 'Необработанная ошибка JavaScript.',
        hypotheses: [
            {
                id: 'code-defect',
                title: 'Дефект кода или непредвиденные данные (требуется анализ стека)',
                weight: 50,
                steps: [
                    'Откройте режим инженера → «Ошибки» и найдите запись по времени.',
                    'Скопируйте отчёт (стек ошибки включён) и передайте разработчику.',
                ],
            },
            {
                id: 'stale-assets',
                title: 'Смешались файлы разных версий (устаревший кэш)',
                weight: 30,
                steps: ['Перезагрузите страницу (Ctrl+F5) и примените обновление.'],
            },
            {
                id: 'extension-interference',
                title: 'Расширение браузера вмешивается в страницу',
                weight: 20,
                steps: ['Откройте приложение в окне инкогнито и повторите действие.'],
            },
        ],
    },
    {
        id: 'memory',
        test: (c) => /heap|памят|ram/i.test(c.text) && c.issue.level !== 'info',
        layer: 'runtime',
        cause: 'Высокое потребление памяти вкладкой.',
        hypotheses: [
            {
                id: 'mem-large',
                title: 'Открыта большая база/много вложений, вкладка работает долго',
                weight: 60,
                steps: ['Перезагрузите вкладку.', 'Закройте тяжёлые вкладки и приложения.'],
            },
            {
                id: 'mem-leak',
                title: 'Утечка памяти в приложении',
                weight: 25,
                steps: ['Зафиксируйте шаги и передайте отчёт разработчику.'],
            },
            {
                id: 'mem-device',
                title: 'На устройстве мало оперативной памяти',
                weight: 15,
                steps: ['Закройте лишние программы.'],
            },
        ],
    },
    {
        id: 'ui-surface',
        test: (c) => /поверхность ui|dom|вёрстк|кнопк|ресайз|resizeobserver|a11y|доступн\w+ имя/i.test(c.text) && c.issue.level !== 'info',
        layer: 'ui',
        cause: 'Нарушена структура или вёрстка интерфейса.',
        hypotheses: [
            {
                id: 'ui-stale',
                title: 'Устаревший HTML/CSS из кэша не соответствует скриптам',
                weight: 45,
                steps: ['Перезагрузите страницу (Ctrl+F5).'],
            },
            {
                id: 'ui-custom',
                title: 'Пользовательская кастомизация или расширение изменило DOM',
                weight: 30,
                steps: ['Сбросьте пользовательские стили/настройки интерфейса и повторите проверку.'],
            },
            {
                id: 'ui-viewport',
                title: 'Нестандартный размер окна или масштаб страницы',
                weight: 25,
                steps: ['Верните масштаб 100% и стандартный размер окна.'],
            },
        ],
    },
    {
        id: 'clipboard',
        test: (c) => /clipboard|буфер обмена/i.test(c.text) && c.issue.level !== 'info',
        layer: 'ui',
        cause: 'Буфер обмена недоступен.',
        hypotheses: [
            {
                id: 'clip-permission',
                title: 'Браузер не разрешил доступ к буферу обмена',
                weight: 55,
                steps: ['Разрешите доступ к буферу обмена для сайта (значок замка в адресной строке).'],
            },
            {
                id: 'clip-insecure',
                title: 'Страница открыта не по https',
                weight: 35,
                steps: ['Откройте приложение по https или localhost.'],
            },
        ],
    },
    {
        id: 'init',
        test: (c) => /инициализац|app-init|подсистем/i.test(c.text),
        layer: 'runtime',
        cause: 'Одна из подсистем не завершила инициализацию.',
        hypotheses: [
            {
                id: 'init-storage',
                title: 'Не открылась база данных (слой «Хранилище»)',
                weight: 40,
                steps: ['Проверьте слой «Хранилище» в этом отчёте.', 'Закройте другие вкладки и перезагрузите страницу.'],
            },
            {
                id: 'init-stale',
                title: 'Конфликт версий файлов (кэш)',
                weight: 35,
                steps: ['Перезагрузите страницу (Ctrl+F5).'],
            },
            {
                id: 'init-defect',
                title: 'Дефект кода — см. журнал в режиме инженера',
                weight: 25,
                steps: ['Откройте режим инженера → «Ошибки» и «Логи».'],
            },
        ],
    },
];

const LAYER_FALLBACK = {
    network: [
        {
            id: 'net-generic',
            title: 'Нестабильное подключение или ограничения сети',
            weight: 60,
            steps: ['Проверьте подключение к интернету и повторите.', 'Попробуйте другую сеть.'],
        },
    ],
    external: GDOCS_KIND_HYPOTHESES.unknown,
    storage: [
        {
            id: 'storage-generic',
            title: 'Ограничение или сбой хранилища браузера',
            weight: 60,
            steps: ['Перезагрузите страницу.', 'Сделайте резервную копию и проверьте квоту хранилища.'],
        },
    ],
    pwa: [
        {
            id: 'pwa-generic',
            title: 'Состояние Service Worker/кэша не соответствует ожидаемому',
            weight: 60,
            steps: ['Перезагрузите страницу (Ctrl+F5) и примените обновление.'],
        },
    ],
    data: [
        {
            id: 'data-generic',
            title: 'Данные приложения требуют проверки',
            weight: 60,
            steps: ['Запустите полную проверку и исправьте записи из отчёта.'],
        },
    ],
    search: [
        {
            id: 'search-generic',
            title: 'Поисковый индекс требует перестроения',
            weight: 60,
            steps: ['Настройки → «Перестроить поисковый индекс».'],
        },
    ],
    ui: [
        {
            id: 'ui-generic',
            title: 'Нарушена работа интерфейса',
            weight: 60,
            steps: ['Перезагрузите страницу (Ctrl+F5).'],
        },
    ],
    runtime: [
        {
            id: 'runtime-generic',
            title: 'Внутренняя ошибка выполнения',
            weight: 60,
            steps: ['Откройте режим инженера → «Ошибки» и передайте отчёт разработчику.'],
        },
    ],
};

// ============================================================================
// НОРМАЛИЗАЦИЯ
// ============================================================================

/**
 * @param {object} raw
 * @returns {NormalizedIssue}
 */
export function normalizeIssue(raw = {}) {
    const title = String(raw.title || '').trim();
    const rawMessage = String(raw.message || '').trim();
    const chainMatch = rawMessage.match(/\[chain=(.*)\]\s*$/);
    const message = rawMessage.replace(/\s*\[chain=.*\]\s*$/, '');
    const level = raw.level === 'warn' || raw.level === 'info' ? raw.level : 'error';
    const layer = inferLayer({
        system: raw.system,
        title: title || message.slice(0, 60),
        layer: raw.layer,
    });
    return {
        id: String(raw.id || `${layer}:${(title || message).slice(0, 80)}`),
        title: title || 'Ошибка',
        message,
        level,
        system: String(raw.system || ''),
        layer,
        source: String(raw.source || ''),
        ts: Number(raw.ts) || Date.now(),
        errorInfo: raw.errorInfo || raw.details?.errorInfo || (chainMatch ? { chain: chainMatch[1] } : null),
        details: raw.details || null,
    };
}

/**
 * Тип ошибки связи Google Docs по тексту (если структурированного errorInfo нет).
 * @param {string} text
 */
export function guessGoogleDocsErrorKind(text) {
    const t = String(text || '');
    if (/нет подключения к интернету|navigator\.onLine|офлайн/i.test(t)) return 'offline';
    if (/превышено время|timed out|timeout|ontimeout/i.test(t)) return 'timeout';
    if (/статус\s*(\d{3})/i.test(t)) return 'http';
    if (/разбора json|unexpected token|json/i.test(t)) return 'parse';
    if (/ошибка от сервера/i.test(t)) return 'server';
    if (/неверный формат|не найден в ответе|формат ответа/i.test(t)) return 'format';
    if (/сеть|network|fetch|failed|err_|интернет|socket|connection/i.test(t)) return 'network';
    return 'unknown';
}

// ============================================================================
// ДИАГНОЗ
// ============================================================================

/**
 * @param {HypothesisTemplate[]} templates
 * @param {DiagnosticContext} ctx
 */
function scoreHypotheses(templates, ctx) {
    const scored = templates.map((tpl) => {
        let w = tpl.weight;
        const evidence = [];
        if (tpl.detail) evidence.push(tpl.detail);
        if (typeof tpl.adjust === 'function') {
            try {
                const adj = tpl.adjust(ctx);
                if (adj) {
                    if (typeof adj.delta === 'number') w += adj.delta;
                    if (adj.evidence) evidence.push(adj.evidence);
                }
            } catch {
                /* корректировка не критична */
            }
        }
        return { tpl, w: Math.max(1, w), evidence };
    });
    const total = scored.reduce((s, x) => s + x.w, 0) || 1;
    const out = scored.map((x) => ({
        id: x.tpl.id,
        title: x.tpl.title,
        probability: Math.max(1, Math.round((x.w / total) * 100)),
        evidence: x.evidence,
        steps: [...x.tpl.steps],
    }));
    out.sort((a, b) => b.probability - a.probability);
    return out;
}

/** Подпись уровня вероятности. */
export function probabilityLabel(p) {
    if (p >= 70) return 'Очень вероятно';
    if (p >= 45) return 'Вероятно';
    if (p >= 20) return 'Возможно';
    return 'Маловероятно';
}

/**
 * Основная функция: формирует диагноз для проблемы.
 * @param {object} rawIssue — запись отчёта здоровья или контекст ошибки из тоста
 * @param {{ env?: object, probes?: Record<string, any> }} [opts]
 */
export function diagnoseIssue(rawIssue, opts = {}) {
    const issue = normalizeIssue(rawIssue);
    const env = opts.env || collectDiagnosticEnvironment();
    const probes = opts.probes || {};
    const text = `${issue.title}\n${issue.message}`.toLowerCase();
    const ctx = { issue, text, env, probes };

    let layer = issue.layer;
    let cause = '';
    let templates = null;
    let ruleId = null;

    // 1) Google Docs / внешние сервисы
    const looksLikeGdocs =
        layer === 'external' ||
        issue.errorInfo?.service === 'google-docs' ||
        /google[\s-]?docs|google-док|гугл|apps script|script\.google/i.test(`${issue.title} ${issue.message}`);
    if (looksLikeGdocs) {
        layer = 'external';
        const kind = issue.errorInfo?.kind || guessGoogleDocsErrorKind(`${issue.title} ${issue.message}`);
        templates = GDOCS_KIND_HYPOTHESES[kind] || GDOCS_KIND_HYPOTHESES.unknown;
        ruleId = `gdocs:${kind}`;
        cause = {
            offline: 'Нет подключения к интернету — облачный документ недоступен.',
            network: 'Не удалось установить соединение с Google Apps Script.',
            timeout: 'Сервис Google не ответил за отведённое время.',
            http: `Сервис Google ответил ошибкой${issue.errorInfo?.status ? ` HTTP ${issue.errorInfo.status}` : ''}.`,
            parse: 'Ответ сервиса не является корректными данными JSON.',
            server: 'Скрипт Google Apps Script вернул ошибку.',
            format: 'Ответ сервиса имеет неожиданную структуру.',
            unknown: 'Не удалось получить документ из Google Docs.',
        }[kind];
    } else {
        // 2) Остальные правила
        const rule = RULES.find((r) => {
            try {
                return r.test(ctx);
            } catch {
                return false;
            }
        });
        if (rule) {
            templates = rule.hypotheses;
            ruleId = rule.id;
            cause = rule.cause;
            if (rule.layer) layer = rule.layer;
        } else {
            templates = LAYER_FALLBACK[layer] || LAYER_FALLBACK.runtime;
            ruleId = `fallback:${layer}`;
            cause = 'Тип сбоя не распознан по тексту — ниже наиболее вероятные направления поиска.';
        }
    }

    const hypotheses = scoreHypotheses(templates, ctx);
    const top = hypotheses[0];
    const obvious = Boolean(top && top.probability >= 75);

    const steps = [];
    const seen = new Set();
    for (const h of hypotheses.slice(0, obvious ? 1 : 2)) {
        for (const s of h.steps) {
            if (!seen.has(s)) {
                seen.add(s);
                steps.push(s);
            }
        }
    }
    for (const s of UNIVERSAL_STEPS) if (!seen.has(s)) steps.push(s);

    const layerInfo = DIAGNOSTIC_LAYERS[layer] || DIAGNOSTIC_LAYERS.runtime;
    return {
        id: issue.id,
        ruleId,
        level: issue.level,
        title: issue.title,
        message: issue.message,
        layer,
        layerLabel: layerInfo.label,
        cause,
        obvious,
        hypotheses,
        steps,
        technical: buildTechnicalDetails(issue, env, probes),
        ts: issue.ts,
    };
}

/**
 * @param {NormalizedIssue} issue
 * @param {object} env
 * @param {Record<string, any>} probes
 */
export function buildTechnicalDetails(issue, env, probes) {
    /** @type {Array<[string, string]>} */
    const rows = [];
    rows.push(['Время', new Date(issue.ts).toISOString()]);
    rows.push(['Слой', issue.layer]);
    if (issue.system) rows.push(['Подсистема', issue.system]);
    if (issue.source) rows.push(['Источник', issue.source]);
    rows.push(['Заголовок', issue.title]);
    if (issue.message) rows.push(['Сообщение', issue.message]);
    const ei = issue.errorInfo;
    if (ei) {
        if (ei.kind) rows.push(['Тип ошибки', String(ei.kind)]);
        if (ei.status != null) rows.push(['HTTP статус', String(ei.status)]);
        if (ei.attempts != null) rows.push(['Попыток', String(ei.attempts)]);
        if (ei.url) rows.push(['URL', String(ei.url)]);
        if (ei.chain) rows.push(['Цепочка попыток', String(ei.chain)]);
        if (ei.durationMs != null) rows.push(['Длительность, мс', String(Math.round(ei.durationMs))]);
    }
    if (issue.details && typeof issue.details === 'object') {
        for (const [k, v] of Object.entries(issue.details)) {
            if (k === 'errorInfo' || v == null) continue;
            rows.push([k, typeof v === 'string' ? v : safeJson(v)]);
        }
    }
    if (env) {
        rows.push(['Онлайн (navigator.onLine)', String(env.online)]);
        rows.push(['Протокол / origin', `${env.protocol || '?'} ${env.origin || ''}`.trim()]);
        rows.push(['Безопасный контекст', String(env.secureContext)]);
        rows.push(['Service Worker', env.serviceWorkerSupported ? (env.serviceWorkerController ? 'активен' : 'не управляет страницей') : 'не поддерживается']);
        if (env.connection) rows.push(['Соединение', env.connection]);
        rows.push(['Видимость вкладки', String(env.visibility)]);
        rows.push(['Окно', String(env.viewport)]);
        rows.push(['Язык', String(env.language)]);
        rows.push(['User-Agent', String(env.userAgent)]);
    }
    for (const [name, p] of Object.entries(probes || {})) {
        if (!p) continue;
        rows.push([
            `Зонд: ${p.label || name}`,
            `${p.ok === true ? 'OK' : p.ok === false ? 'сбой' : '—'}${p.ms != null ? ` (${Math.round(p.ms)} мс)` : ''}${p.error ? ` — ${p.error}` : ''}`,
        ]);
    }
    return rows;
}

function safeJson(v) {
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

// ============================================================================
// ОТЧЁТЫ
// ============================================================================

/**
 * Группирует диагнозы по слоям (порядок — DIAGNOSTIC_LAYER_ORDER).
 * @param {Array<{ layer: string }>} items
 */
export function groupByLayer(items) {
    /** @type {Record<string, any[]>} */
    const map = {};
    for (const it of items) {
        const id = it.layer && DIAGNOSTIC_LAYERS[it.layer] ? it.layer : 'runtime';
        (map[id] ||= []).push(it);
    }
    return DIAGNOSTIC_LAYER_ORDER.filter((id) => map[id]?.length).map((id) => ({
        layer: DIAGNOSTIC_LAYERS[id],
        items: map[id],
    }));
}

/** Текст одного диагноза (для буфера обмена). */
export function formatDiagnosisAsText(d) {
    const lines = [];
    lines.push(`[${d.level === 'error' ? 'ОШИБКА' : d.level === 'warn' ? 'ПРЕДУПРЕЖДЕНИЕ' : 'OK'}] ${d.title}`);
    lines.push(`Слой: ${d.layerLabel}`);
    if (d.message) lines.push(`Сообщение: ${d.message}`);
    lines.push(`${d.obvious ? 'Причина' : 'Предварительная оценка'}: ${d.cause}`);
    if (d.hypotheses?.length) {
        lines.push('Гипотезы:');
        d.hypotheses.forEach((h, i) => {
            lines.push(`  ${i + 1}. (${h.probability}%) ${h.title}`);
            for (const ev of h.evidence || []) lines.push(`     · ${ev}`);
        });
    }
    if (d.steps?.length) {
        lines.push('Что сделать:');
        d.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }
    if (d.technical?.length) {
        lines.push('Технические детали:');
        for (const [k, v] of d.technical) lines.push(`  ${k}: ${v}`);
    }
    return lines.join('\n');
}

/**
 * Текст полного отчёта для техподдержки.
 * @param {{ success?: boolean, startedAt?: string, finishedAt?: string, errors?: any[], warnings?: any[], checks?: any[] }} report
 * @param {ReturnType<typeof diagnoseIssue>[]} diagnoses — диагнозы ошибок и предупреждений
 * @param {{ appVersion?: string, env?: object, extra?: string[] }} [meta]
 */
export function formatReportAsText(report, diagnoses, meta = {}) {
    const env = meta.env || collectDiagnosticEnvironment();
    const errs = (report.errors || []).length;
    const warns = (report.warnings || []).length;
    const lines = [];
    lines.push('=== Copilot 1СО — отчёт самодиагностики ===');
    lines.push(`Сформирован: ${new Date().toLocaleString('ru-RU')}`);
    if (report.startedAt) lines.push(`Начало: ${report.startedAt}`);
    if (report.finishedAt) lines.push(`Окончание: ${report.finishedAt}`);
    if (meta.appVersion) lines.push(`Версия приложения: ${meta.appVersion}`);
    lines.push(
        `Итог: ${errs > 0 ? 'ОБНАРУЖЕНЫ ОШИБКИ' : warns > 0 ? 'есть предупреждения' : 'всё в порядке'} (ошибок: ${errs}, предупреждений: ${warns}, проверок: ${(report.checks || []).length})`,
    );
    lines.push(
        `Среда: онлайн=${env.online}, ${env.protocol || '?'}, secure=${env.secureContext}, SW=${env.serviceWorkerController ? 'активен' : 'нет'}, окно ${env.viewport}`,
    );
    lines.push(`UA: ${env.userAgent}`);
    for (const e of meta.extra || []) lines.push(e);
    lines.push('');
    for (const grp of groupByLayer(diagnoses)) {
        lines.push(`--- ${grp.layer.label} ---`);
        for (const d of grp.items) {
            lines.push(formatDiagnosisAsText(d));
            lines.push('');
        }
    }
    if (!diagnoses.length) lines.push('Ошибок и предупреждений нет.');
    return lines.join('\n');
}

/**
 * Сравнение двух наборов проблем (история диагностик).
 * @param {Array<{key:string}>} prev
 * @param {Array<{key:string}>} next
 */
export function compareIssueSets(prev, next) {
    const a = new Map((prev || []).map((x) => [x.key, x]));
    const b = new Map((next || []).map((x) => [x.key, x]));
    const added = [];
    const fixed = [];
    const same = [];
    for (const [k, v] of b) (a.has(k) ? same : added).push(v);
    for (const [k, v] of a) if (!b.has(k)) fixed.push(v);
    return { added, fixed, same };
}

/** Устойчивый ключ проблемы для истории/сравнения (без изменчивых чисел и времени). */
export function issueKey(entry) {
    const t = String(entry?.title || '').trim();
    const m = String(entry?.message || '')
        .replace(/\d+/g, '#')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
    return `${t}|${m}`;
}
