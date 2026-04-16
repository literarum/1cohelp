'use strict';

/**
 * Команды открытия модальных окон из палитры: основной вызов (window.*) и резерв — клик по кнопке в DOM.
 */

import { NavigationSource } from '../contextual-back-navigation.js';

const NAV_FROM_PALETTE = { navigationSource: NavigationSource.PROGRAMMATIC };

function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} name
 * @param {...*} args
 * @returns {boolean}
 */
function tryWindowFn(name, ...args) {
    if (typeof window === 'undefined' || typeof window[name] !== 'function') return false;
    try {
        const r = window[name](...args);
        if (r && typeof r.then === 'function') {
            r.catch((err) => console.warn(`[command-palette/modal] ${name} rejected:`, err));
        }
        return true;
    } catch (err) {
        console.warn(`[command-palette/modal] ${name} failed:`, err);
        return false;
    }
}

/**
 * @param {string[]} ids
 * @returns {boolean}
 */
function tryClickIds(ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && typeof el.click === 'function') {
            try {
                el.click();
                return true;
            } catch (err) {
                console.warn(`[command-palette/modal] click #${id} failed:`, err);
            }
        }
    }
    return false;
}

/**
 * @param {object} deps
 * @param {function(string): void} [deps.setActiveTab]
 */
function openXmlCertManagerArea(deps) {
    if (typeof deps.setActiveTab === 'function') {
        deps.setActiveTab('xmlAnalyzer', false, NAV_FROM_PALETTE);
    }
    requestAnimationFrame(() => {
        document.getElementById('xmlAnalyzerCertManagerWrapper')?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    });
    return true;
}

/**
 * @returns {Promise<boolean>}
 */
async function openHealthReportFlow() {
    if (
        typeof window.runManualFullDiagnostic === 'function' &&
        typeof window.showHealthReportModal === 'function'
    ) {
        try {
            const report = await window.runManualFullDiagnostic();
            window.showHealthReportModal(report);
            return true;
        } catch (err) {
            window.showHealthReportModal({
                errors: [{ title: 'Ошибка', message: err?.message || String(err) }],
                warnings: [],
                checks: [],
                startedAt: new Date().toLocaleString('ru-RU'),
                finishedAt: new Date().toLocaleString('ru-RU'),
                success: false,
                error: err?.message || String(err),
            });
            return true;
        }
    }
    return tryClickIds(['runManualHealthCheckBtn']);
}

const MODAL_REGISTRY = [
    {
        key: 'customizeUI',
        label: 'Настройки интерфейса (модальное окно)',
        subtitle: 'Окно кастомизации UI и темы',
        score: 0.92,
        keywords: [
            'настройки',
            'интерфейс',
            'ui',
            'кастомизация',
            'customize',
            'шестерёнк',
            'шестеренк',
        ],
        run: () => tryClickIds(['customizeUIBtn']),
    },
    {
        key: 'appCustomization',
        label: 'Кастомизация приложения',
        subtitle: 'Шрифты, фон и внешний вид',
        score: 0.91,
        keywords: ['кастомизация приложения', 'шрифт', 'фон', 'внешний вид', 'app customization'],
        run: () => tryClickIds(['openAppCustomizationModalBtn']),
    },
    {
        key: 'hotkeys',
        label: 'Горячие клавиши (окно)',
        subtitle: 'Справочник сочетаний Copilot',
        score: 0.92,
        keywords: ['горячие', 'клавиши', 'hotkeys', 'справочник', 'сочетания'],
        run: () => tryClickIds(['showHotkeysBtn']),
    },
    {
        key: 'healthReport',
        label: 'Отчёт о здоровье приложения',
        subtitle: 'Ручной прогон диагностики и отчёт',
        score: 0.9,
        keywords: ['здоров', 'диагностик', 'health', 'прогон', 'отчёт', 'отчет'],
        runAsync: openHealthReportFlow,
    },
    {
        key: 'dbMerge',
        label: 'Слияние баз данных',
        subtitle: 'Окно импорта и слияния БД',
        score: 0.92,
        keywords: ['слиян', 'merge', 'баз', 'импорт', 'db', 'объедин'],
        run: () => tryWindowFn('openDbMergeModal') || tryClickIds(['mergeDataBtn']),
    },
    {
        key: 'engineeringCockpit',
        label: 'Машинное отделение (инженерный режим)',
        subtitle: 'Скрытая диагностика приложения',
        score: 0.88,
        keywords: ['машин', 'инженер', 'cockpit', 'debug', '05213587'],
        run: () => tryWindowFn('openEngineeringCockpit'),
    },
    {
        key: 'addAlgorithm',
        label: 'Новый алгоритм (окно добавления)',
        subtitle: 'Модальное окно создания алгоритма (раздел по умолчанию)',
        score: 0.9,
        keywords: ['новый алгоритм', 'добавить алгоритм', 'создать алгоритм', 'add algorithm'],
        run: () => tryWindowFn('showAddModal', 'main') || tryClickIds(['addProgramAlgorithmBtn']),
    },
    {
        key: 'bookmarkModal',
        label: 'Новая закладка',
        subtitle: 'Модальное окно добавления закладки',
        score: 0.9,
        keywords: ['закладка', 'bookmark', 'новая закладка'],
        run: () => tryWindowFn('showAddBookmarkModal') || tryClickIds(['addBookmarkBtn']),
    },
    {
        key: 'foldersModal',
        label: 'Организация папок закладок',
        subtitle: 'Модальное окно папок',
        score: 0.89,
        keywords: ['папки', 'организовать закладки', 'folders', 'структура закладок'],
        run: () => tryWindowFn('showOrganizeFoldersModal') || tryClickIds(['organizeBookmarksBtn']),
    },
    {
        key: 'extLinkModal',
        label: 'Новый внешний ресурс',
        subtitle: 'Модальное окно внешней ссылки',
        score: 0.9,
        keywords: ['внешн', 'ресурс', 'ext link', 'ссылка внеш'],
        run: () => tryWindowFn('showAddExtLinkModal') || tryClickIds(['addExtLinkBtn']),
    },
    {
        key: 'extLinkCategoriesModal',
        label: 'Категории внешних ссылок',
        subtitle: 'Организация категорий внешних ресурсов',
        score: 0.88,
        keywords: ['категории внеш', 'организация категорий', 'ext categories'],
        run: () =>
            tryWindowFn('showOrganizeExtLinkCategoriesModal') ||
            tryClickIds(['organizeExtLinkCategoriesBtn']),
    },
    {
        key: 'cibLinkModal',
        label: 'Новая ссылка 1С / ЦИБ',
        subtitle: 'Модальное окно ссылки на ИБ',
        score: 0.9,
        keywords: ['ссылка 1с', 'циб', 'cib', 'информационная база'],
        run: () => tryWindowFn('showAddEditCibLinkModal') || tryClickIds(['addLinkBtn']),
    },
    {
        key: 'reglamentModal',
        label: 'Новый регламент',
        subtitle: 'Модальное окно регламента',
        score: 0.9,
        keywords: ['регламент', 'новый регламент', 'добавить регламент'],
        run: () => tryWindowFn('showAddReglamentModal') || tryClickIds(['addReglamentBtn']),
    },
    {
        key: 'blacklistEntryModal',
        label: 'Чёрный список: новая запись',
        subtitle: 'Модальное окно добавления в ЧС',
        score: 0.88,
        keywords: ['чёрный список', 'черный список', 'blacklist', 'жаб', 'запись чс'],
        run: () => tryWindowFn('showBlacklistEntryModal') || tryClickIds(['addBlacklistEntryBtn']),
    },
    {
        key: 'recentlyDeletedModal',
        label: 'Недавно удалённые',
        subtitle: 'Корзина удалённых материалов',
        score: 0.9,
        keywords: ['недавно удал', 'корзин', 'trash', 'восстановить'],
        run: () =>
            tryWindowFn('openRecentlyDeletedModal') || tryClickIds(['openRecentlyDeletedBtn']),
    },
    {
        key: 'favoritesPanel',
        label: 'Избранное (панель)',
        subtitle: 'Открыть боковую панель избранного',
        score: 0.85,
        keywords: ['избранное', 'избранн', 'favorites', 'звёзд'],
        run: () => tryClickIds(['showFavoritesHeaderBtn']),
    },
    {
        key: 'sedoTypesEditor',
        label: 'Редактор типов СЭДО',
        subtitle: 'Модальное редактирование типов СЭДО',
        score: 0.87,
        keywords: ['седо', 'сэдо', 'типы седо', 'редактор седо'],
        run: () => tryClickIds(['editSedoTypesBtn']),
    },
    {
        key: 'xmlCertManager',
        label: 'Менеджер сертификатов XML',
        subtitle: 'Вкладка анализатора XML — блок сертификатов',
        score: 0.86,
        keywords: ['сертификат', 'xml', 'анализатор', 'менеджер сертификатов', 'cert'],
        run: (deps) => openXmlCertManagerArea(deps),
    },
    {
        key: 'confirmClearData',
        label: 'Подтверждение очистки данных',
        subtitle: 'Окно подтверждения полной очистки (осторожно)',
        score: 0.75,
        keywords: ['очистка данных', 'удалить всё', 'clear data', 'полная очистка'],
        run: () => tryClickIds(['clearAllDataBtn']),
    },
];

function entryMatchesQuery(entry, qWords) {
    if (qWords.length === 0) return true;
    const blob = normalizeText(
        [entry.label, entry.subtitle, ...(entry.keywords || []), entry.key].join(' '),
    );
    return qWords.every((w) => blob.includes(w));
}

/**
 * @param {string} query
 * @param {string|null} typeFilter
 * @param {number} maxResults
 * @param {object} [deps]
 * @returns {Array<object>}
 */
export function getModalPaletteResults(query, typeFilter, maxResults, _deps = {}) {
    const q = normalizeText(query);
    const qWords = q ? q.split(/\s+/).filter(Boolean) : [];

    if (typeFilter !== 'modal' && qWords.length === 0) {
        return [];
    }

    const list = MODAL_REGISTRY.filter((e) => entryMatchesQuery(e, qWords)).map((e) => ({
        id: `modal:${e.key}`,
        type: 'modal',
        label: e.label,
        subtitle: e.subtitle,
        score: e.score,
        payload: { modalKey: e.key },
    }));

    if (typeFilter === 'modal' && !q) {
        list.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
        return list.slice(0, Math.max(maxResults, 60));
    }

    return list.slice(0, maxResults);
}

/**
 * @param {string} key
 * @param {object} [deps]
 * @param {function(string): void} [deps.setActiveTab]
 * @returns {Promise<boolean>}
 */
export async function executeModalPaletteCommand(key, deps = {}) {
    const entry = MODAL_REGISTRY.find((e) => e.key === key);
    if (!entry) {
        console.warn('[command-palette/modal] Unknown modal key:', key);
        return false;
    }
    if (typeof entry.runAsync === 'function') {
        try {
            return await entry.runAsync();
        } catch (err) {
            console.warn('[command-palette/modal] runAsync failed:', err);
            return false;
        }
    }
    if (typeof entry.run === 'function') {
        try {
            const ok = entry.run(deps);
            return !!ok;
        } catch (err) {
            console.warn('[command-palette/modal] run failed:', err);
            return false;
        }
    }
    return false;
}
