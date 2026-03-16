'use strict';

/**
 * Провайдер глобальных действий приложения.
 * При пустом запросе возвращает фиксированный список по умолчанию.
 * При непустом — поиск по ключевым словам.
 */

/** Порядок по умолчанию при открытии палитры (пустой запрос) */
const DEFAULT_ACTIONS = [
    {
        id: 'action:openSettings',
        type: 'action',
        label: 'Настройки',
        subtitle: 'Открыть настройки интерфейса и кастомизацию',
        score: 1,
        payload: { action: 'openSettings' },
    },
    {
        id: 'action:openHotkeys',
        type: 'action',
        label: 'Горячие клавиши и управление',
        subtitle: 'Открыть окно горячих клавиш Copilot',
        score: 1,
        payload: { action: 'openHotkeys' },
    },
    {
        id: 'action:runHealthDiagnostic',
        type: 'action',
        label: 'Ручной прогон здоровья приложения',
        subtitle: 'Запустить диагностику и проверить доступность сервисов',
        score: 1,
        payload: { action: 'runHealthDiagnostic' },
    },
    {
        id: 'action:exportDatabase',
        type: 'action',
        label: 'Экспорт базы данных',
        subtitle: 'Скачать резервную копию данных в файл',
        score: 1,
        payload: { action: 'exportDatabase' },
    },
    {
        id: 'action:importDatabase',
        type: 'action',
        label: 'Импорт базы данных',
        subtitle: 'Загрузить данные из файла',
        score: 1,
        payload: { action: 'importDatabase' },
    },
    {
        id: 'action:toggleTheme',
        type: 'action',
        label: 'Переключение темы (тёмная/светлая)',
        subtitle: 'Переключить тёмную или светлую тему',
        score: 1,
        payload: { action: 'toggleTheme' },
    },
    {
        id: 'action:forceReload',
        type: 'action',
        label: 'Жёсткая перезагрузка приложения',
        subtitle: 'Перезагрузка с обходом кэша (как Ctrl/Cmd+Shift+R)',
        score: 0.99,
        payload: { action: 'forceReload' },
    },
];

/** Дополнительные действия (поиск по ключевым словам, не в дефолтном списке) */
const EXTRA_ACTIONS = [
    {
        id: 'action:openFavorites',
        type: 'action',
        label: 'Открыть избранное',
        subtitle: 'Перейти в раздел избранного',
        score: 0.95,
        payload: { action: 'openFavorites' },
    },
    {
        id: 'action:openClientNotesWindow',
        type: 'action',
        label: 'Окно заметок клиента',
        subtitle: 'Открыть заметки в отдельном окне',
        score: 0.95,
        payload: { action: 'openClientNotesWindow' },
    },
    {
        id: 'action:openClientNotesPopup',
        type: 'action',
        label: 'Попап заметок клиента',
        subtitle: 'Открыть заметки во всплывающем окне',
        score: 0.95,
        payload: { action: 'openClientNotesPopup' },
    },
    {
        id: 'action:addBookmark',
        type: 'action',
        label: 'Добавить закладку',
        subtitle: 'Создать новую закладку',
        score: 0.95,
        payload: { action: 'addBookmark' },
    },
    {
        id: 'action:addReglament',
        type: 'action',
        label: 'Добавить регламент',
        subtitle: 'Создать новый регламент',
        score: 0.95,
        payload: { action: 'addReglament' },
    },
    {
        id: 'action:addCibLink',
        type: 'action',
        label: 'Добавить ссылку 1С',
        subtitle: 'Добавить ссылку ЦИБ/1С',
        score: 0.95,
        payload: { action: 'addCibLink' },
    },
    {
        id: 'action:addExtLink',
        type: 'action',
        label: 'Добавить внешнюю ссылку',
        subtitle: 'Добавить внешний ресурс',
        score: 0.95,
        payload: { action: 'addExtLink' },
    },
    {
        id: 'action:clearClientData',
        type: 'action',
        label: 'Очистить данные клиента',
        subtitle: 'Сбросить введённые данные клиента',
        score: 0.95,
        payload: { action: 'clearClientData' },
    },
    {
        id: 'action:exportClientDataToTxt',
        type: 'action',
        label: 'Экспорт заметок в TXT',
        subtitle: 'Сохранить заметки клиента в файл',
        score: 0.95,
        payload: { action: 'exportClientDataToTxt' },
    },
    {
        id: 'action:timerToggle',
        type: 'action',
        label: 'Таймер: старт/стоп',
        subtitle: 'Запустить или остановить таймер',
        score: 0.95,
        payload: { action: 'timerToggle' },
    },
    {
        id: 'action:timerReset',
        type: 'action',
        label: 'Таймер: сброс',
        subtitle: 'Сбросить таймер',
        score: 0.95,
        payload: { action: 'timerReset' },
    },
    {
        id: 'action:showNoInnModal',
        type: 'action',
        label: 'Клиент не знает ИНН',
        subtitle: 'Открыть подсказку по отсутствующему ИНН',
        score: 0.95,
        payload: { action: 'showNoInnModal' },
    },
    {
        id: 'action:clearRecent',
        type: 'action',
        label: 'Очистить недавние (палитра)',
        subtitle: 'Сбросить список недавно выбранных пунктов в палитре',
        score: 0.95,
        payload: { action: 'clearRecent' },
    },
    {
        id: 'action:organizeBookmarks',
        type: 'action',
        label: 'Организовать закладки',
        subtitle: 'Открыть окно организации папок закладок',
        score: 0.95,
        payload: { action: 'organizeBookmarks' },
    },
    {
        id: 'action:clearFavorites',
        type: 'action',
        label: 'Очистить избранное',
        subtitle: 'Очистить список избранных элементов',
        score: 0.95,
        payload: { action: 'clearFavorites' },
    },
    {
        id: 'action:openRecentlyDeleted',
        type: 'action',
        label: 'Открыть недавно удаленные',
        subtitle: 'Открыть корзину удаленных материалов',
        score: 0.95,
        payload: { action: 'openRecentlyDeleted' },
    },
    {
        id: 'action:openEngineeringCockpit',
        type: 'action',
        label: 'Машинное отделение (инженерный режим)',
        subtitle: 'Открыть скрытую инженерную диагностику приложения',
        score: 0.95,
        payload: { action: 'openEngineeringCockpit' },
    },
];

const ACTION_KEYWORDS = {
    openSettings: ['настройки', 'настройка', 'settings', 'кастомизация', 'интерфейс', 'шестеренк'],
    openHotkeys: ['горячие', 'клавиши', 'hotkeys', 'hotkey', 'сочетания', 'управление', 'copilot'],
    runHealthDiagnostic: ['здоров', 'прогон', 'диагностик', 'health', 'проверк'],
    exportDatabase: ['экспорт', 'export', 'баз', 'бд', 'резерв', 'скачать'],
    importDatabase: ['импорт', 'import', 'загруз', 'файл'],
    toggleTheme: ['тема', 'темн', 'светл', 'theme', 'dark', 'light'],
    forceReload: ['перезагруз', 'reload', 'обнов', 'кэш', 'cache', 'жёстк', 'жестк'],
    openFavorites: ['избранн', 'favorites', 'избранное'],
    openClientNotesWindow: ['заметки', 'окно', 'notes', 'клиент'],
    openClientNotesPopup: ['заметки', 'попап', 'popup', 'всплыва'],
    addBookmark: ['закладк', 'bookmark', 'добавить закладку'],
    addReglament: ['регламент', 'добавить регламент'],
    addCibLink: ['ссылка', 'циб', '1с', 'добавить ссылку'],
    addExtLink: ['внешн', 'ресурс', 'добавить внешн'],
    clearClientData: ['очист', 'сброс', 'данные клиента', 'clear'],
    exportClientDataToTxt: ['экспорт заметок', 'txt', 'сохранить заметки'],
    timerToggle: ['таймер', 'старт', 'стоп', 'timer', 'запуст'],
    timerReset: ['таймер', 'сброс', 'timer reset'],
    showNoInnModal: ['инн', 'не знает', 'noinn', 'клиент не знает'],
    clearRecent: ['недавн', 'очист', 'сброс недавн', 'recent', 'clear recent'],
    organizeBookmarks: ['организовать', 'закладки', 'папки', 'organize', 'bookmarks'],
    clearFavorites: ['очист избранн', 'избранное очист', 'clear favorites', 'очистить избранное'],
    openRecentlyDeleted: ['корзин', 'удален', 'recently deleted', 'trash', 'восстановить'],
    openEngineeringCockpit: [
        'машин',
        'инженер',
        'debug',
        'diagnostic',
        'cockpit',
        'engine room',
        '05213587',
    ],
};

function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Возвращает результаты типа action.
 * При пустом запросе — фиксированный список из 7 действий по умолчанию.
 * При непустом — только те действия, которые совпали по ключевым словам.
 * @param {string} query - строка запроса
 * @returns {Array} массив результатов { id, type: 'action', label, subtitle, score, payload }
 */
export function getActionResults(query) {
    const q = normalizeText(query).trim();
    if (!q) {
        return [...DEFAULT_ACTIONS];
    }

    const words = q.split(/\s+/).filter(Boolean);
    const results = [];
    const added = new Set();

    const tryAdd = (key, action) => {
        if (!added.has(key)) {
            results.push(action);
            added.add(key);
        }
    };

    for (const word of words) {
        if (ACTION_KEYWORDS.openSettings.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('openSettings', DEFAULT_ACTIONS[0]);
        if (ACTION_KEYWORDS.openHotkeys.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('openHotkeys', DEFAULT_ACTIONS[1]);
        if (ACTION_KEYWORDS.runHealthDiagnostic.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('runHealthDiagnostic', DEFAULT_ACTIONS[2]);
        if (ACTION_KEYWORDS.exportDatabase.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('exportDatabase', DEFAULT_ACTIONS[3]);
        if (ACTION_KEYWORDS.importDatabase.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('importDatabase', DEFAULT_ACTIONS[4]);
        if (ACTION_KEYWORDS.toggleTheme.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('toggleTheme', DEFAULT_ACTIONS[5]);
        if (ACTION_KEYWORDS.forceReload.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('forceReload', DEFAULT_ACTIONS[6]);
        if (ACTION_KEYWORDS.openFavorites.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('openFavorites', EXTRA_ACTIONS[0]);
        if (ACTION_KEYWORDS.openClientNotesWindow.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('openClientNotesWindow', EXTRA_ACTIONS[1]);
        if (ACTION_KEYWORDS.openClientNotesPopup.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('openClientNotesPopup', EXTRA_ACTIONS[2]);
        if (ACTION_KEYWORDS.addBookmark.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('addBookmark', EXTRA_ACTIONS[3]);
        if (ACTION_KEYWORDS.addReglament.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('addReglament', EXTRA_ACTIONS[4]);
        if (ACTION_KEYWORDS.addCibLink.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('addCibLink', EXTRA_ACTIONS[5]);
        if (ACTION_KEYWORDS.addExtLink.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('addExtLink', EXTRA_ACTIONS[6]);
        if (ACTION_KEYWORDS.clearClientData.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('clearClientData', EXTRA_ACTIONS[7]);
        if (ACTION_KEYWORDS.exportClientDataToTxt.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('exportClientDataToTxt', EXTRA_ACTIONS[8]);
        if (ACTION_KEYWORDS.timerToggle.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('timerToggle', EXTRA_ACTIONS[9]);
        if (ACTION_KEYWORDS.timerReset.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('timerReset', EXTRA_ACTIONS[10]);
        if (ACTION_KEYWORDS.showNoInnModal.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('showNoInnModal', EXTRA_ACTIONS[11]);
        if (ACTION_KEYWORDS.clearRecent.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('clearRecent', EXTRA_ACTIONS[12]);
        if (ACTION_KEYWORDS.organizeBookmarks.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('organizeBookmarks', EXTRA_ACTIONS[13]);
        if (ACTION_KEYWORDS.clearFavorites.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('clearFavorites', EXTRA_ACTIONS[14]);
        if (ACTION_KEYWORDS.openRecentlyDeleted.some((k) => word.includes(k) || k.includes(word)))
            tryAdd('openRecentlyDeleted', EXTRA_ACTIONS[15]);
        if (
            ACTION_KEYWORDS.openEngineeringCockpit.some((k) => word.includes(k) || k.includes(word))
        ) {
            tryAdd('openEngineeringCockpit', EXTRA_ACTIONS[16]);
        }
    }

    return results;
}
