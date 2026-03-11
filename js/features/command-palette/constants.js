'use strict';

/** Лимит результатов в палитре команд */
export const MAX_RESULTS = 20;

/** Минимальный score для показа результата глобального поиска в палитре (отсекает слабые совпадения) */
export const MIN_GLOBAL_SCORE = 20;

/** Префикс фильтра по типу (в начале запроса, например @действие или @вкладка) */
export const FILTER_PREFIX = '@';

/** Соответствие ключевых слов фильтра типам результатов (для парсинга после @) */
export const TYPE_FILTER_MAP = {
    action: 'action',
    действие: 'action',
    действия: 'action',
    tab: 'tab',
    вкладка: 'tab',
    вкладки: 'tab',
    algorithm: 'algorithm',
    алгоритм: 'algorithm',
    алгоритмы: 'algorithm',
    error: 'error',
    ошибка: 'error',
    ошибки: 'error',
    xml: 'xml_report',
    xml_report: 'xml_report',
};

/** Подписи типов результатов для бейджей (палитра + глобальный поиск) */
export const TYPE_LABELS = {
    algorithm: 'Алгоритм',
    main: 'Главная',
    xml_report: 'XML‑отчёт',
    error: 'Ошибка',
    action: 'Действие',
    tab: 'Вкладка',
    link: 'Ссылка 1С',
    bookmark: 'Закладка',
    bookmark_note: 'Заметка',
    reglament: 'Регламент',
    extLink: 'Внешний ресурс',
    extLinkCategory: 'Категория',
    clientNote: 'Заметки клиента',
    bookmarkFolder: 'Папка закладок',
    blacklistedClient: 'Чёрный список',
    sedoInfoItem: 'СЭДО',
    sedoInfo: 'СЭДО',
    uiSetting: 'Настройка UI',
    section_link: 'Раздел',
    shablony_block: 'Шаблоны',
    preference: 'Настройка',
    record: 'Запись',
};

/** Доменные синонимы 1С/ФНС/СФР для расширения запроса */
export const DOMAIN_SYNONYMS = {
    fns: ['фнс', 'ифнс', 'налоговая', 'федеральная налоговая', 'fns', 'налог'],
    sfr: ['сфр', 'пфр', 'фсс', 'социальный фонд', 'пенсионный', 'sfr', 'pfr', 'fss'],
    rosstat: ['росстат', 'фсгс', 'статистика', 'rosstat'],
    rarp: ['рарп', 'фсрар', 'алкоголь', 'rarp'],
    rpn: ['рпн', 'росприроднадзор', 'природнадзор', 'rpn'],
};

/** Вкладки приложения для навигации через палитру (tabId, label, synonyms для поиска) */
export const TABS = [
    { tabId: 'main', label: 'Главная', synonyms: ['главная', 'главн', 'main', 'дом'] },
    { tabId: 'program', label: 'Программа 1С/УП', synonyms: ['программа', '1с', 'уп', 'program'] },
    { tabId: 'links', label: 'Ссылки 1С', synonyms: ['ссылки', 'ссылок', 'links', 'циб'] },
    { tabId: 'extLinks', label: 'Внешние ресурсы', synonyms: ['внешние', 'ресурсы', 'внешн', 'ext'] },
    { tabId: 'skzi', label: 'СКЗИ', synonyms: ['скзи', 'skzi', 'крипто'] },
    { tabId: 'lk1c', label: '1СО ЛК', synonyms: ['лк', 'личный кабинет', 'lk1c', '1со'] },
    { tabId: 'webReg', label: 'Веб-Регистратор', synonyms: ['веб', 'регистратор', 'webreg'] },
    { tabId: 'reglaments', label: 'Регламенты', synonyms: ['регламент', 'регламенты'] },
    { tabId: 'bookmarks', label: 'Закладки', synonyms: ['закладки', 'закладк', 'bookmarks'] },
    { tabId: 'sedoTypes', label: 'Типы СЭДО', synonyms: ['седо', 'сэдо', 'типы', 'sedo'] },
    { tabId: 'blacklistedClients', label: 'Чёрный список', synonyms: ['черный', 'чёрный', 'список', 'blacklist', 'жаб'] },
    { tabId: 'fnsCert', label: 'Проверка сертификата на отзыв', synonyms: ['сертификат', 'отзыв', 'фнс', 'revocation'] },
    { tabId: 'xmlAnalyzer', label: 'Анализатор XML', synonyms: ['xml', 'анализатор', 'анализ'] },
    { tabId: 'favorites', label: 'Избранное', synonyms: ['избранное', 'избранн', 'favorites'] },
];

/** Контролирующие органы для поиска по XML‑отчётам */
export const CONTROLLING_AUTHORITIES = [
    { key: 'FNS', label: 'Федеральная налоговая служба (ФНС)' },
    { key: 'PFR', label: 'Социальный фонд России (СФР, бывш. ПФР)' },
    { key: 'FSS', label: 'Социальный фонд России (СФР, бывш. ФСС)' },
    { key: 'ROSSTAT', label: 'Росстат' },
    { key: 'RARP', label: 'Росалкогольрегулирование' },
    { key: 'RPN', label: 'Росприроднадзор' },
];
