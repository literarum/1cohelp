'use strict';

/**
 * Модуль поисковой системы
 * Содержит всю логику полнотекстового поиска, индексации и обработки результатов
 */

import { 
    DB_VERSION,
    SEDO_CONFIG_KEY,
    ARCHIVE_FOLDER_ID,
    MAX_REFS_PER_WORD,
    MIN_TOKEN_LEN_FOR_INDEX,
    CACHE_TTL,
    FIELD_WEIGHTS,
    SHABLONY_DOC_ID,
    CATEGORY_INFO_KEY,
} from '../constants.js';

import { tabsConfig, categoryDisplayInfo as categoryDisplayInfoImported } from '../config.js';

import { escapeHtml, truncateText, highlightTextInString, highlightElement } from '../utils/html.js';

import { formatExampleForTextarea, getSectionName } from '../utils/helpers.js';

import { State } from '../app/state.js';

import { storeConfigs } from '../db/stores.js';

import {
    getAllFromIndexedDB,
    getFromIndexedDB,
    saveToIndexedDB,
    clearIndexedDBStore,
    performDBOperation,
} from '../db/indexeddb.js';

import { 
    fetchGoogleDocs, 
    parseShablonyContent, 
    getOriginalShablonyData 
} from './google-docs.js';

// ============================================================================
// СОСТОЯНИЕ МОДУЛЯ
// ============================================================================

// Кэш результатов поиска
const searchCache = new Map();

// Таймаут для debounced поиска
let searchTimeout;

// Мутабельная копия categoryDisplayInfo
let categoryDisplayInfo = { ...categoryDisplayInfoImported };

// Глобальные зависимости (устанавливаются через setSearchDependencies)
let algorithms = null;
let showNotification = null;
let setActiveTab = null;
let showAlgorithmDetail = null;
let showBookmarkDetailModal = null;
let showReglamentDetail = null;
let showReglamentsForCategory = null;
let loadingOverlayManager = null;
let debounce = null;

// ============================================================================
// УСТАНОВКА ЗАВИСИМОСТЕЙ
// ============================================================================

/**
 * Устанавливает зависимости для модуля поиска
 */
export function setSearchDependencies(deps) {
    if (deps.algorithms !== undefined) algorithms = deps.algorithms;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.setActiveTab !== undefined) setActiveTab = deps.setActiveTab;
    if (deps.showAlgorithmDetail !== undefined) showAlgorithmDetail = deps.showAlgorithmDetail;
    if (deps.showBookmarkDetailModal !== undefined) showBookmarkDetailModal = deps.showBookmarkDetailModal;
    if (deps.showReglamentDetail !== undefined) showReglamentDetail = deps.showReglamentDetail;
    if (deps.showReglamentsForCategory !== undefined) showReglamentsForCategory = deps.showReglamentsForCategory;
    if (deps.loadingOverlayManager !== undefined) loadingOverlayManager = deps.loadingOverlayManager;
    if (deps.debounce !== undefined) debounce = deps.debounce;
    if (deps.categoryDisplayInfo !== undefined) categoryDisplayInfo = deps.categoryDisplayInfo;
    if (deps.highlightAndScrollSedoItem !== undefined) {
        // Сохраняем ссылку на функцию из SEDO модуля
        window._highlightAndScrollSedoItem = deps.highlightAndScrollSedoItem;
    }
}

// ============================================================================
// ТОКЕНИЗАЦИЯ
// ============================================================================

/**
 * Токенизирует текст для поиска
 */
export function tokenize(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const normalizedText = text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9\s]/g, (c) => (c === '-' || c === '_' ? c : ' '))
        .replace(/\s+/g, ' ')
        .trim();

    const words = normalizedText.split(/\s+/).filter((word) => word.length > 0);
    const tokens = new Set();
    const MIN_TOKEN_LEN = 2;
    const MIN_PREFIX_LEN = 2;
    const MAX_PREFIX_LEN_FOR_TOKEN = 8;

    function addPrefixes(str, tokenSet) {
        if (!str || str.length < MIN_PREFIX_LEN) return;
        const maxPrefixLen = Math.min(str.length, MAX_PREFIX_LEN_FOR_TOKEN);
        for (let i = MIN_PREFIX_LEN; i <= maxPrefixLen; i++) {
            tokenSet.add(str.substring(0, i));
        }
    }

    words.forEach((word) => {
        if (word.length >= MIN_TOKEN_LEN) {
            tokens.add(word);
            addPrefixes(word, tokens);
        }

        const partsByHyphenOrUnderscore = word.split(/[-_]/);
        if (partsByHyphenOrUnderscore.length > 1) {
            partsByHyphenOrUnderscore.forEach((part) => {
                if (part.length >= MIN_TOKEN_LEN) {
                    tokens.add(part);
                    addPrefixes(part, tokens);
                }
            });
        }
    });

    return Array.from(tokens);
}

/**
 * Проверяет, является ли токен исключением для коротких токенов
 */
export function isExceptionShortToken(token) {
    const exceptions = new Set(['1с', '1c', 'сф', 'фн', 'фс']);
    return exceptions.has(token);
}

// ============================================================================
// УТИЛИТЫ ЗАПРОСА
// ============================================================================

/**
 * Санитизирует поисковый запрос
 */
export function sanitizeQuery(query) {
    if (typeof query !== 'string') {
        console.warn(
            `[sanitizeQuery] Ожидалась строка, получен ${typeof query}. Возвращена пустая строка.`,
        );
        return '';
    }

    let sanitized = query.replace(/[<>\"'&]/g, '').trim();
    sanitized = sanitized.toLowerCase().replace(/ё/g, 'е');

    const MAX_QUERY_LENGTH = 200;
    if (sanitized.length > MAX_QUERY_LENGTH) {
        console.warn(
            `[sanitizeQuery] Запрос "${sanitized.substring(0, 50)}..." (${
                sanitized.length
            } символов) был усечен до ${MAX_QUERY_LENGTH} символов.`,
        );
        sanitized = sanitized.substring(0, MAX_QUERY_LENGTH);
    }
    return sanitized;
}

/**
 * Определяет контекст поиска
 */
export function determineSearchContext(normalizedQuery) {
    const FNS_KEYWORDS = new Set([
        'фнс', 'налог', 'ифнс', 'егрюл', 'егрип', 'егрн', 'кнд', 'декларац',
    ]);
    const SEDO_KEYWORDS = new Set(['сэдо', 'пвсо', 'сфр', 'фсс', 'извещение', 'элн', 'сообщение']);
    const PFR_KEYWORDS = new Set(['пфр', 'пенсион', 'снилс', 'сзв', 'опс']);
    const SKZI_KEYWORDS = new Set([
        'скзи', 'крипто', 'шифр', 'эцп', 'электронная подпись', 'сертификат',
    ]);

    if (FNS_KEYWORDS.has(normalizedQuery)) return 'fns';
    if (SEDO_KEYWORDS.has(normalizedQuery)) return 'sedo';
    if (PFR_KEYWORDS.has(normalizedQuery)) return 'pfr';
    if (SKZI_KEYWORDS.has(normalizedQuery)) return 'skzi';

    const queryWords = normalizedQuery.split(/\s+/);
    for (const word of queryWords) {
        if (FNS_KEYWORDS.has(word)) return 'fns';
        if (SEDO_KEYWORDS.has(word)) return 'sedo';
        if (PFR_KEYWORDS.has(word)) return 'pfr';
        if (SKZI_KEYWORDS.has(word)) return 'skzi';
    }
    return 'general';
}

/**
 * Проверяет, является ли запрос регулярным выражением
 */
export function isRegexQuery(query) {
    return query.startsWith('/') && query.endsWith('/');
}

// ============================================================================
// КЭШИРОВАНИЕ
// ============================================================================

/**
 * Получает кэшированные результаты
 */
export function getCachedResults(query) {
    const cached = searchCache.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.results;
    }
    return null;
}

/**
 * Кэширует результаты поиска
 */
export function cacheResults(query, results) {
    searchCache.set(query, {
        results: results,
        timestamp: Date.now(),
    });

    if (searchCache.size > 100) {
        const entries = Array.from(searchCache.entries());
        const toDelete = entries
            .filter(([, data]) => Date.now() - data.timestamp > CACHE_TTL)
            .slice(0, 50);
        toDelete.forEach(([key]) => searchCache.delete(key));
    }
}

// ============================================================================
// ИЗВЛЕЧЕНИЕ ТЕКСТА ДЛЯ ИНДЕКСАЦИИ
// ============================================================================

/**
 * Получает текстовое представление алгоритма для поиска
 */
export function getAlgorithmText(algoData) {
    const texts = {};
    if (!algoData || typeof algoData !== 'object') {
        return texts;
    }
    
    const cleanHtml = (text) =>
        typeof text === 'string'
            ? text
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
            : '';

    if (algoData.title && typeof algoData.title === 'string') {
        const cleanedTitle = cleanHtml(algoData.title);
        if (cleanedTitle) texts.title = cleanedTitle;
    }

    let descriptionText = '';
    if (algoData.description && typeof algoData.description === 'string') {
        descriptionText = cleanHtml(algoData.description);
    }

    if (algoData.section && typeof getSectionName === 'function') {
        const sectionNameText = getSectionName(algoData.section);
        if (
            sectionNameText &&
            sectionNameText !== 'Основной' &&
            (!descriptionText ||
                !descriptionText.toLowerCase().includes(sectionNameText.toLowerCase()))
        ) {
            if (descriptionText) {
                descriptionText += ` ${sectionNameText}`;
            } else {
                descriptionText = sectionNameText;
            }
            texts.sectionNameForAlgo = sectionNameText;
        }
        if (algoData.section !== 'main') {
            texts.sectionIdForAlgo = algoData.section;
        }
    }

    if (descriptionText) {
        texts.description = descriptionText;
    }

    const stepsTextParts = [];
    if (algoData.steps && Array.isArray(algoData.steps)) {
        algoData.steps.forEach((step) => {
            if (!step || typeof step !== 'object') return;

            if (step.title && typeof step.title === 'string') {
                const cleanedStepTitle = cleanHtml(step.title);
                if (cleanedStepTitle) stepsTextParts.push(cleanedStepTitle);
            }

            if (step.description) {
                if (typeof step.description === 'string') {
                    const cleanedStepDesc = cleanHtml(step.description);
                    if (cleanedStepDesc) stepsTextParts.push(cleanedStepDesc);
                } else if (
                    typeof step.description === 'object' &&
                    step.description.type === 'list'
                ) {
                    if (step.description.intro && typeof step.description.intro === 'string') {
                        const cleanedIntro = cleanHtml(step.description.intro);
                        if (cleanedIntro) stepsTextParts.push(cleanedIntro);
                    }
                    if (Array.isArray(step.description.items)) {
                        step.description.items.forEach((item) => {
                            let itemText = '';
                            if (typeof item === 'string') {
                                itemText = cleanHtml(item);
                            } else if (item && typeof item.text === 'string') {
                                itemText = cleanHtml(item.text);
                            } else if (item && typeof item === 'object') {
                                try {
                                    itemText = cleanHtml(JSON.stringify(item));
                                } catch (e) {}
                            }
                            if (itemText) stepsTextParts.push(itemText);
                        });
                    }
                }
            }

            if (step.example) {
                const exampleAsText = formatExampleForTextarea(step.example);
                if (exampleAsText && typeof exampleAsText === 'string') {
                    const cleanedExample = cleanHtml(exampleAsText);
                    if (cleanedExample) stepsTextParts.push(cleanedExample);
                }
            }

            if (step.additionalInfoText && typeof step.additionalInfoText === 'string') {
                const cleanedAddInfo = cleanHtml(step.additionalInfoText);
                if (cleanedAddInfo) stepsTextParts.push(cleanedAddInfo);
            }
        });
    }
    const aggregatedStepsText = stepsTextParts.filter((part) => part && part.length > 0).join(' ');
    if (aggregatedStepsText) {
        texts.steps = aggregatedStepsText;
    }

    for (const key in algoData) {
        if (
            Object.prototype.hasOwnProperty.call(algoData, key) &&
            typeof algoData[key] === 'string'
        ) {
            const excludedKeys = [
                'id', 'title', 'description', 'section', 'dateAdded', 
                'dateUpdated', 'type', 'aggregated_steps_content',
            ];
            if (!excludedKeys.includes(key) && texts[key] === undefined && !key.startsWith('_')) {
                const cleanedValue = cleanHtml(algoData[key]);
                if (cleanedValue) {
                    texts[key] = cleanedValue;
                }
            }
        }
    }
    return texts;
}

/**
 * Извлекает текст из элемента для индексации
 */
export function getTextForItem(storeName, itemData) {
    if (!itemData || typeof itemData !== 'object') {
        return {};
    }
    let textsByField = {};
    const MAIN_SEDO_GLOBAL_CONTENT_FIELD = 'mainSedoGlobalContent';

    const cleanHtml = (text) => {
        if (typeof text !== 'string') return '';
        return text
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    switch (storeName) {
        case 'shablony':
            if (itemData.title) {
                textsByField[`h${itemData.level || 3}`] = itemData.title;
            }
            if (itemData.content) {
                textsByField.content = itemData.content;
            }
            break;

        case 'algorithms':
            textsByField = getAlgorithmText(itemData);
            break;

        case 'links':
            if (itemData.title) textsByField.title = cleanHtml(itemData.title);
            if (itemData.link) textsByField.link_path = itemData.link;
            if (itemData.description) textsByField.description = cleanHtml(itemData.description);
            break;

        case 'bookmarks':
            if (itemData.title) textsByField.title = cleanHtml(itemData.title);
            if (itemData.description) textsByField.description = cleanHtml(itemData.description);

            if (itemData.url) {
                textsByField.url_original = itemData.url;
                try {
                    let fullUrl = itemData.url;
                    if (!fullUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && fullUrl.includes('.')) {
                        if (!fullUrl.startsWith('//')) {
                            fullUrl = 'https://' + fullUrl;
                        } else {
                            fullUrl = 'https:' + fullUrl;
                        }
                    } else if (
                        !fullUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) &&
                        !fullUrl.includes('.')
                    ) {
                        textsByField.url_fallback_text = fullUrl.replace(/[.:/?=&#%@_]/g, ' ');
                    }

                    const urlObj = new URL(fullUrl);
                    if (urlObj.hostname) {
                        textsByField.url_hostname = urlObj.hostname.replace(/^www\./, '');
                    }
                    if (urlObj.pathname && urlObj.pathname !== '/') {
                        const pathParts = urlObj.pathname
                            .split(/[\/\-_.]+/)
                            .filter((p) => p && p.length > 2);
                        pathParts.forEach((part, i) => {
                            textsByField[`url_path_${i}`] = part;
                        });
                    }
                    if (urlObj.search) {
                        const searchParamsText = Array.from(urlObj.searchParams.entries())
                            .map(([key, value]) => `${key} ${value}`)
                            .join(' ');
                        if (searchParamsText.trim()) {
                            textsByField.url_query_params = searchParamsText.replace(
                                /[=&#%_]/g,
                                ' ',
                            );
                        }
                    }
                } catch (e) {
                    textsByField.url_fallback_text = itemData.url.replace(/[.:/?=&#%@_]/g, ' ');
                }
            }
            if (itemData._folderNameForIndex) {
                textsByField.folderName = cleanHtml(itemData._folderNameForIndex);
            }
            break;

        case 'reglaments':
            if (itemData.title) textsByField.title = cleanHtml(itemData.title);
            if (itemData.content) textsByField.content = cleanHtml(itemData.content);
            if (
                itemData.category &&
                typeof categoryDisplayInfo === 'object' &&
                categoryDisplayInfo[itemData.category]
            ) {
                textsByField.categoryName = cleanHtml(categoryDisplayInfo[itemData.category].title);
            } else if (itemData.category) {
                textsByField.categoryName = cleanHtml(itemData.category);
            }
            break;

        case 'extLinks':
            if (itemData.title) textsByField.title = cleanHtml(itemData.title);
            if (itemData.url) textsByField.url_full = itemData.url;
            try {
                let fullUrlExt = itemData.url;
                if (!fullUrlExt.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && fullUrlExt.includes('.')) {
                    if (!fullUrlExt.startsWith('//')) {
                        fullUrlExt = 'https://' + fullUrlExt;
                    } else {
                        fullUrlExt = 'https:' + fullUrlExt;
                    }
                }
                const urlObjExt = new URL(fullUrlExt);
                if (urlObjExt.hostname) {
                    textsByField.url_hostname = urlObjExt.hostname.replace(/^www\./, '');
                }
            } catch (e) {
                textsByField.url_fallback_text = itemData.url.replace(/[.:/?=&#%@_]/g, ' ');
            }
            if (itemData.description) textsByField.description = cleanHtml(itemData.description);
            if (
                itemData.category &&
                typeof State.extLinkCategoryInfo === 'object' &&
                State.extLinkCategoryInfo[itemData.category]
            ) {
                textsByField.categoryName = cleanHtml(State.extLinkCategoryInfo[itemData.category].name);
            }
            break;

        case 'clientData':
            if (itemData.notes) {
                textsByField.notes = cleanHtml(itemData.notes);
            }
            break;

        case 'bookmarkFolders':
            if (itemData.name) textsByField.name = cleanHtml(itemData.name);
            break;

        case 'preferences':
            const sedoKey = SEDO_CONFIG_KEY;
            if (itemData.id === sedoKey) {
                textsByField.name = 'Типы сообщений СЭДО СФР ФСС';
                let allSedoTextParts = [
                    'типы сообщений сэдо', 'сфр', 'фсс', 'пвсо', 'извещение', 'элн',
                    'уведомление', 'запрос', 'ответ', 'результат', 'регистрация',
                    'проактивное назначение пособий', 'прямые выплаты',
                    'электронный документооборот', 'социальный фонд', 'входящие', 'исходящие',
                ];

                if (itemData.articleLinks && Array.isArray(itemData.articleLinks)) {
                    itemData.articleLinks.forEach((linkItem) => {
                        if (linkItem && typeof linkItem === 'object') {
                            if (linkItem.url && typeof linkItem.url === 'string' && linkItem.url.trim()) {
                                allSedoTextParts.push(
                                    linkItem.url.trim().toLowerCase().replace(/[.:/?=&#%@_]/g, ' '),
                                );
                            }
                            if (linkItem.text && typeof linkItem.text === 'string' && linkItem.text.trim()) {
                                allSedoTextParts.push(linkItem.text.trim().toLowerCase());
                            }
                        } else if (typeof linkItem === 'string' && linkItem.trim()) {
                            allSedoTextParts.push(
                                linkItem.trim().toLowerCase().replace(/[.:/?=&#%@_]/g, ' '),
                            );
                        }
                    });
                }

                if (itemData.tables && Array.isArray(itemData.tables)) {
                    itemData.tables.forEach((table, tableIndex) => {
                        if (table.title) {
                            textsByField[`tableTitle_t${tableIndex}`] = table.title.toLowerCase();
                        }
                        if (Array.isArray(table.columns)) {
                            allSedoTextParts.push(
                                ...table.columns.map((c) => String(c).toLowerCase()),
                            );
                        }
                        if (Array.isArray(table.items)) {
                            table.items.forEach((rowItem, rowIndex) => {
                                if (table.isStaticList && typeof rowItem === 'string') {
                                    textsByField[`staticListItem_t${tableIndex}_r${rowIndex}`] =
                                        rowItem.toLowerCase();
                                } else if (typeof rowItem === 'object' && rowItem !== null) {
                                    Object.entries(rowItem).forEach(([key, cellValue]) => {
                                        if (
                                            cellValue !== null &&
                                            cellValue !== undefined &&
                                            String(cellValue).trim() !== ''
                                        ) {
                                            textsByField[
                                                `tableCell_t${tableIndex}_r${rowIndex}_f${key}`
                                            ] = String(cellValue).toLowerCase();
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
                const uniqueLowercaseParts = Array.from(
                    new Set(
                        allSedoTextParts
                            .map((part) => String(part).trim())
                            .filter((part) => part.length > 0),
                    ),
                );
                textsByField[MAIN_SEDO_GLOBAL_CONTENT_FIELD] = uniqueLowercaseParts.join(' ');
            } else if (itemData.id === 'uiSettings') {
                textsByField.name =
                    'Настройки интерфейса кастомизация тема цвет размер шрифт панели';
            } else if (itemData.id === CATEGORY_INFO_KEY) {
                textsByField.name = 'Настройки категорий регламентов';
                if (itemData.data && typeof itemData.data === 'object') {
                    Object.values(itemData.data).forEach((catInfo) => {
                        if (catInfo && catInfo.title) {
                            textsByField[
                                `category_title_${catInfo.title.toLowerCase().replace(/\s/g, '_')}`
                            ] = catInfo.title;
                        }
                    });
                }
            }
            break;

        default:
            Object.keys(itemData).forEach((key) => {
                const excludedKeys = [
                    'id', 'category', 'section', 'color', 'icon', 'link', 'url',
                    '_originalStore', '_sectionKey', 'blob', 'parentId', 'parentType',
                    'stepIndex', 'screenshotIds', 'folder',
                ];
                if (
                    typeof itemData[key] === 'string' &&
                    !excludedKeys.includes(key) &&
                    !key.toLowerCase().includes('date') &&
                    !key.toLowerCase().includes('timestamp')
                ) {
                    const cleanedValue = cleanHtml(itemData[key]);
                    if (cleanedValue && textsByField[key] === undefined) {
                        textsByField[key] = cleanedValue;
                    }
                }
            });
            if (itemData.title && textsByField.title === undefined)
                textsByField.title = cleanHtml(itemData.title);
            if (itemData.name && textsByField.name === undefined)
                textsByField.name = cleanHtml(itemData.name);
            if (itemData.description && textsByField.description === undefined)
                textsByField.description = cleanHtml(itemData.description);
            if (itemData.content && textsByField.content === undefined)
                textsByField.content = cleanHtml(itemData.content);
            break;
    }
    return textsByField;
}

// ============================================================================
// ОПЕРАЦИИ С ИНДЕКСОМ
// ============================================================================

/**
 * Добавляет слово в поисковый индекс
 */
export async function addToSearchIndex(word, type, id, field, weight = 1, originalRefDetails = null) {
    if (!State.db) {
        console.warn(`[addToSearchIndex V2] DB not ready. Word: ${word}, Type: ${type}, ID: ${id}`);
        return Promise.resolve();
    }

    if (!word || typeof word !== 'string' || word.trim() === '') {
        return Promise.resolve();
    }

    if (!type || typeof type !== 'string') {
        console.error(
            `[addToSearchIndex V2] Invalid type provided: ${type} (for word "${word}", id "${id}"). Skipping.`,
        );
        return Promise.resolve();
    }

    if (id === undefined || id === null) {
        console.error(
            `[addToSearchIndex V2] Invalid ID provided: ${id} (for word "${word}", type "${type}"). Skipping.`,
        );
        return Promise.resolve();
    }

    const normalizedWord = word.toLowerCase().replace(/ё/g, 'е');

    if (normalizedWord.length > 50) {
        console.warn(
            `[addToSearchIndex V2] Token too long, skipping: "${normalizedWord.substring(0, 20)}..." (length: ${normalizedWord.length})`,
        );
        return Promise.resolve();
    }

    if (normalizedWord.length < MIN_TOKEN_LEN_FOR_INDEX && !isExceptionShortToken(normalizedWord)) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let transaction;
        try {
            if (!State.db || typeof State.db.transaction !== 'function') {
                console.error(
                    `[addToSearchIndex V2] DB object is invalid or transaction method is missing. Word: "${normalizedWord}"`,
                );
                return reject(new Error('DB object invalid for transaction'));
            }
            transaction = State.db.transaction(['searchIndex'], 'readwrite');
        } catch (txError) {
            console.error(
                `[addToSearchIndex V2] Error creating transaction for word "${normalizedWord}":`,
                txError,
            );
            return reject(txError);
        }

        const store = transaction.objectStore('searchIndex');

        transaction.onerror = (event) => {
            console.error(
                `[addToSearchIndex V2] Transaction error for word "${normalizedWord}". Error: ${event.target.error?.name} - ${event.target.error?.message}.`,
            );
            reject(event.target.error || new Error('Transaction error in addToSearchIndex'));
        };
        transaction.onabort = (event) => {
            console.warn(
                `[addToSearchIndex V2] Transaction aborted for word "${normalizedWord}". Error: ${event.target.error?.name} - ${event.target.error?.message}.`,
            );
            reject(event.target.error || new Error('Transaction aborted in addToSearchIndex'));
        };

        const getRequest = store.get(normalizedWord);

        getRequest.onerror = (e_get) => {
            console.error(
                `[addToSearchIndex V2] Error getting entry for word "${normalizedWord}":`,
                e_get.target.error,
            );
            reject(e_get.target.error || new Error('Failed to get entry from searchIndex'));
        };

        getRequest.onsuccess = (e_get) => {
            try {
                const existingEntry = e_get.target.result;
                const newRefData = {
                    type: type,
                    id: String(id),
                    field: field || 'unknown',
                    weight: Math.max(0.1, Math.min(10, parseFloat(weight) || 1)),
                    store: type,
                };

                if (originalRefDetails && typeof originalRefDetails === 'object') {
                    if (typeof originalRefDetails.tableIndex === 'number')
                        newRefData.tableIndex = originalRefDetails.tableIndex;
                    if (typeof originalRefDetails.rowIndex === 'number')
                        newRefData.rowIndex = originalRefDetails.rowIndex;
                    if (typeof originalRefDetails.stepIndex === 'number')
                        newRefData.stepIndex = originalRefDetails.stepIndex;
                    if (originalRefDetails.blockIndex !== undefined)
                        newRefData.blockIndex = originalRefDetails.blockIndex;
                    if (originalRefDetails.title) newRefData.title = originalRefDetails.title;
                    if (originalRefDetails.description)
                        newRefData.description = originalRefDetails.description;
                    if (originalRefDetails.field) newRefData.field = originalRefDetails.field;
                }

                let putRequest;
                if (existingEntry) {
                    const refExists = existingEntry.refs.some(
                        (existingRef) =>
                            existingRef.id === newRefData.id &&
                            existingRef.type === newRefData.type &&
                            existingRef.field === newRefData.field &&
                            existingRef.tableIndex === newRefData.tableIndex &&
                            existingRef.rowIndex === newRefData.rowIndex &&
                            existingRef.stepIndex === newRefData.stepIndex &&
                            existingRef.blockIndex === newRefData.blockIndex,
                    );

                    if (!refExists) {
                        if (existingEntry.refs.length < MAX_REFS_PER_WORD) {
                            existingEntry.refs.push(newRefData);
                            putRequest = store.put(existingEntry);
                        } else {
                            resolve();
                            return;
                        }
                    } else {
                        resolve();
                        return;
                    }
                } else {
                    putRequest = store.put({ word: normalizedWord, refs: [newRefData] });
                }

                if (putRequest) {
                    putRequest.onerror = (e_put) => {
                        console.error(
                            `[addToSearchIndex V2] Error putting entry for word "${normalizedWord}":`,
                            e_put.target.error,
                        );
                        reject(
                            e_put.target.error || new Error('Failed to put entry into searchIndex'),
                        );
                    };
                    putRequest.onsuccess = () => {
                        resolve();
                    };
                }
            } catch (processingError) {
                console.error(
                    `[addToSearchIndex V2] Error processing entry for word "${normalizedWord}":`,
                    processingError,
                );
                reject(processingError);
            }
        };
    });
}

/**
 * Удаляет элемент из поискового индекса
 */
export async function removeFromSearchIndex(itemId, itemType) {
    if (!State.db) {
        return;
    }

    const stringItemId = String(itemId);

    try {
        const transaction = State.db.transaction('searchIndex', 'readwrite');
        const store = transaction.objectStore('searchIndex');
        const request = store.openCursor();
        const updates = [];

        await new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const entry = cursor.value;
                    const initialRefCount = entry.refs.length;
                    entry.refs = entry.refs.filter(
                        (ref) => !(String(ref.id) === stringItemId && ref.type === itemType),
                    );

                    if (entry.refs.length === 0) {
                        updates.push({ operation: 'delete', key: cursor.key });
                    } else if (entry.refs.length < initialRefCount) {
                        updates.push({ operation: 'put', data: entry });
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = (event) => reject(event.target.error);
        });

        if (updates.length > 0) {
            const updateTransaction = State.db.transaction('searchIndex', 'readwrite');
            const updateStore = updateTransaction.objectStore('searchIndex');
            updates.forEach((update) => {
                if (update.operation === 'delete') {
                    updateStore.delete(update.key);
                } else if (update.operation === 'put') {
                    updateStore.put(update.data);
                }
            });
            await new Promise((resolve, reject) => {
                updateTransaction.oncomplete = resolve;
                updateTransaction.onerror = (e) => reject(e.target.error);
                updateTransaction.onabort = (e) =>
                    reject(e.target.error || new Error('Transaction aborted'));
            });
        }
    } catch (error) {
        console.error(`[removeFromSearchIndex V6] Error for ${itemType}-${stringItemId}:`, error);
    }
}

/**
 * Обновляет поисковый индекс для элемента
 */
export async function updateSearchIndex(storeName, itemId, newItemData, operation, oldItemData = null) {
    const LOG_PREFIX_USI = `[updateSearchIndex V4 - Google Docs Logic]`;

    if (storeName === 'shablony') {
        const docId = itemId;
        console.log(
            `${LOG_PREFIX_USI} Начало индексации для Google Doc: ${storeName} (ID: ${docId})`,
        );

        await removeFromSearchIndex(docId, storeName);
        console.log(`${LOG_PREFIX_USI} Старые записи для ${docId} удалены из индекса.`);

        if (operation !== 'delete' && Array.isArray(newItemData)) {
            if (storeName === 'shablony') {
                const blocks = newItemData;
                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    await updateSearchIndexForItem(
                        { ...block, _internal_block_index: block.originalIndex },
                        'shablony',
                        docId,
                    );
                }
            }
        }
        console.log(`${LOG_PREFIX_USI} Индексация для ${storeName} (ID: ${docId}) завершена.`);
        return;
    }

    if (storeName === 'blacklistedClients') {
        console.log(
            `${LOG_PREFIX_USI} Indexing of 'blacklistedClients' is disabled. Skipping operation for ${storeName}:${itemId}.`,
        );
        return;
    }

    if (!State.db) {
        console.warn(
            `${LOG_PREFIX_USI} DB not ready. Index for ${storeName}:${itemId} (op: ${operation}) not updated.`,
        );
        return;
    }
    if (storeName === 'searchIndex') {
        console.log(`${LOG_PREFIX_USI} Attempt to index 'searchIndex' store. Skipping.`);
        return;
    }

    console.log(
        `${LOG_PREFIX_USI} Operation: ${operation}, Store: ${storeName}, ItemID: ${itemId}`,
    );

    if ((operation === 'add' || operation === 'update') && !newItemData) {
        console.error(
            `${LOG_PREFIX_USI} newItemData is required for '${operation}' operation on ${storeName}:${itemId}. Index not updated.`,
        );
        return;
    }

    let refItemId;
    if (storeName === 'clientData') {
        refItemId = 'current';
    } else if (storeName === 'preferences' && itemId === SEDO_CONFIG_KEY) {
        refItemId = SEDO_CONFIG_KEY;
    } else if (itemId === undefined || itemId === null) {
        if (newItemData && newItemData.id !== undefined) {
            refItemId = String(newItemData.id);
        } else {
            console.error(
                `${LOG_PREFIX_USI} itemId is undefined/null and newItemData.id is also undefined for store '${storeName}'. Operation: ${operation}. Index not updated.`,
            );
            return;
        }
    } else {
        const storeConfig = storeConfigs.find((sc) => sc.name === storeName);
        if (storeConfig && storeConfig.options && storeConfig.options.autoIncrement) {
            refItemId = Number(itemId);
            if (isNaN(refItemId)) {
                console.error(
                    `${LOG_PREFIX_USI} Cannot convert itemId '${itemId}' to number for autoIncrement store '${storeName}'.`,
                );
                return;
            }
        } else {
            refItemId = String(itemId);
        }
    }

    try {
        if (operation === 'delete') {
            await removeFromSearchIndex(refItemId, storeName);
            console.log(`${LOG_PREFIX_USI} Index entries removed for ${storeName}:${refItemId}`);
        } else if (operation === 'add' || operation === 'update') {
            let dataForIndexing = { ...newItemData };
            if (dataForIndexing.id === undefined && refItemId !== undefined) {
                dataForIndexing.id = refItemId;
            }

            if (
                storeName === 'bookmarks' &&
                dataForIndexing.folder &&
                dataForIndexing.folder !== ARCHIVE_FOLDER_ID
            ) {
                try {
                    const folderIdToFetch = parseInt(dataForIndexing.folder, 10);
                    if (!isNaN(folderIdToFetch)) {
                        const folderData = await getFromIndexedDB(
                            'bookmarkFolders',
                            folderIdToFetch,
                        );
                        if (folderData && folderData.name) {
                            dataForIndexing._folderNameForIndex = folderData.name;
                        }
                    }
                } catch (e) {
                    console.warn(
                        `${LOG_PREFIX_USI} Could not fetch folder name for bookmark ${refItemId}: ${e.message}`,
                    );
                }
            }

            if (storeName === 'bookmarks') {
                const isNewItemArchived =
                    dataForIndexing && dataForIndexing.folder === ARCHIVE_FOLDER_ID;
                const isOldItemArchived = oldItemData && oldItemData.folder === ARCHIVE_FOLDER_ID;

                if (operation === 'add') {
                    if (!isNewItemArchived) {
                        await updateSearchIndexForItem(dataForIndexing, storeName);
                    }
                } else if (operation === 'update') {
                    if (!isNewItemArchived && oldItemData) {
                        await removeFromSearchIndex(refItemId, storeName);
                    }

                    if (isNewItemArchived && !isOldItemArchived) {
                        await removeFromSearchIndex(refItemId, storeName);
                    } else if (!isNewItemArchived && isOldItemArchived) {
                        await updateSearchIndexForItem(dataForIndexing, storeName);
                    } else if (!isNewItemArchived && !isOldItemArchived) {
                        await updateSearchIndexForItem(dataForIndexing, storeName);
                    } else {
                        await removeFromSearchIndex(refItemId, storeName);
                    }
                }
            } else {
                if (operation === 'update' && oldItemData) {
                    await removeFromSearchIndex(refItemId, storeName);
                }
                await updateSearchIndexForItem(dataForIndexing, storeName);
            }
            console.log(
                `${LOG_PREFIX_USI} Index processing finished for ${storeName}:${refItemId}`,
            );
        } else {
            console.warn(
                `${LOG_PREFIX_USI} Unknown operation type: ${operation}. Index not updated for ${storeName}:${itemId}.`,
            );
        }
    } catch (error) {
        console.error(
            `${LOG_PREFIX_USI} Error during index operation '${operation}' for ${storeName}:${refItemId}:`,
            error,
        );
        if (showNotification) {
            showNotification(`Ошибка обновления поискового индекса для ${storeName}.`, 'error');
        }
    }
}

/**
 * Обновляет поисковый индекс для конкретного элемента
 */
export async function updateSearchIndexForItem(itemData, storeName, docId = null) {
    const LOG_PREFIX_USI_ITEM = `[updateSearchIndexForItem V6 - Google Docs Logic]`;

    if (!itemData || typeof itemData !== 'object') {
        console.warn(
            `${LOG_PREFIX_USI_ITEM} Получены невалидные itemData для ${storeName}. Пропуск индексации.`,
            itemData,
        );
        return;
    }

    if (storeName === 'shablony') {
        const textsByField = getTextForItem(storeName, itemData);
        if (Object.keys(textsByField).length === 0) return;

        const blockOrRowIndex =
            itemData.originalIndex ??
            itemData._internal_row_index ??
            itemData._internal_block_index;

        if (blockOrRowIndex === undefined) {
            console.error(
                `${LOG_PREFIX_USI_ITEM} Отсутствует индекс блока/строки для ${storeName}`,
                itemData,
            );
            return;
        }

        if (!docId) {
            console.error(
                `${LOG_PREFIX_USI_ITEM} Отсутствует docId для ${storeName}. Индексация невозможна.`,
            );
            return;
        }

        const promises = [];
        for (const [fieldKey, textContent] of Object.entries(textsByField)) {
            if (!textContent || typeof textContent !== 'string' || textContent.trim() === '')
                continue;

            const tokens = tokenize(textContent);
            const weights = FIELD_WEIGHTS[storeName] || FIELD_WEIGHTS.default;
            const fieldWeight = weights[fieldKey] || 1.0;

            const refDetails = {
                field: fieldKey,
                ...(storeName === 'shablony' && {
                    blockIndex: blockOrRowIndex,
                    title: itemData.title,
                    description: truncateText(itemData.content, 150),
                }),
            };

            for (const token of tokens) {
                promises.push(
                    addToSearchIndex(token, storeName, docId, fieldKey, fieldWeight, refDetails),
                );
            }
        }
        await Promise.all(promises);
        return;
    }

    const textsByField = getTextForItem(storeName, itemData);

    if (Object.keys(textsByField).length === 0) {
        return;
    }

    let indexableId;
    if (storeName === 'clientData' && itemData.id === 'current') {
        indexableId = 'current';
    } else if (storeName === 'algorithms' && itemData.id === 'main') {
        indexableId = 'main';
    } else if (itemData.id !== undefined && itemData.id !== null) {
        indexableId = String(itemData.id);
    } else {
        console.warn(
            `${LOG_PREFIX_USI_ITEM} Не удалось определить indexableId для ${storeName}, itemData:`,
            itemData,
        );
        return;
    }

    const promises = [];

    for (const [fieldKeyFromGetText, textContent] of Object.entries(textsByField)) {
        if (!textContent || typeof textContent !== 'string' || textContent.trim() === '') {
            continue;
        }

        const tokens = tokenize(textContent);
        const storeFieldWeightsConfig = FIELD_WEIGHTS[storeName] || FIELD_WEIGHTS.default;

        let baseFieldForWeightLookup = fieldKeyFromGetText;
        let originalFieldKeyForWeight = null;

        if (fieldKeyFromGetText.startsWith('tableCell_')) {
            baseFieldForWeightLookup = 'tableCell';
            const fieldNamePart = fieldKeyFromGetText.split('_f')[1];
            if (fieldNamePart) originalFieldKeyForWeight = fieldNamePart;
        } else if (fieldKeyFromGetText.startsWith('tableTitle_')) {
            baseFieldForWeightLookup = 'tableTitle';
        } else if (fieldKeyFromGetText.startsWith('staticListItem_')) {
            baseFieldForWeightLookup = 'staticListItem';
        } else if (storeName === 'algorithms' && fieldKeyFromGetText.startsWith('step_')) {
            const stepPart = fieldKeyFromGetText.substring(
                fieldKeyFromGetText.lastIndexOf('_') + 1,
            );
            if (storeFieldWeightsConfig && storeFieldWeightsConfig[stepPart] !== undefined) {
                baseFieldForWeightLookup = stepPart;
            }
        } else if (fieldKeyFromGetText === 'mainSedoGlobalContent' && storeName === 'preferences') {
            baseFieldForWeightLookup = 'mainSedoGlobalContent';
        }

        let fieldWeight = 1.0;
        if (
            originalFieldKeyForWeight &&
            storeFieldWeightsConfig &&
            storeFieldWeightsConfig[originalFieldKeyForWeight] !== undefined
        ) {
            fieldWeight = storeFieldWeightsConfig[originalFieldKeyForWeight];
        } else if (
            storeFieldWeightsConfig &&
            storeFieldWeightsConfig[baseFieldForWeightLookup] !== undefined
        ) {
            fieldWeight = storeFieldWeightsConfig[baseFieldForWeightLookup];
        } else if (
            FIELD_WEIGHTS.default &&
            FIELD_WEIGHTS.default[baseFieldForWeightLookup] !== undefined
        ) {
            fieldWeight = FIELD_WEIGHTS.default[baseFieldForWeightLookup];
        } else {
            if (
                storeFieldWeightsConfig &&
                storeFieldWeightsConfig[fieldKeyFromGetText] !== undefined
            ) {
                fieldWeight = storeFieldWeightsConfig[fieldKeyFromGetText];
            } else if (
                FIELD_WEIGHTS.default &&
                FIELD_WEIGHTS.default[fieldKeyFromGetText] !== undefined
            ) {
                fieldWeight = FIELD_WEIGHTS.default[fieldKeyFromGetText];
            }
        }

        let refDetails = { field: fieldKeyFromGetText };

        if (storeName === 'preferences' && itemData.id === SEDO_CONFIG_KEY) {
            const parts = fieldKeyFromGetText.split('_');
            if (parts[0] === 'tableTitle' && parts[1]?.startsWith('t')) {
                refDetails.tableIndex = parseInt(parts[1].substring(1), 10);
                refDetails.field = 'tableTitle';
            } else if (
                parts[0] === 'tableCell' &&
                parts[1]?.startsWith('t') &&
                parts[2]?.startsWith('r')
            ) {
                refDetails.tableIndex = parseInt(parts[1].substring(1), 10);
                refDetails.rowIndex = parseInt(parts[2].substring(1), 10);
                refDetails.field = parts[3]?.startsWith('f')
                    ? parts[3].substring(1)
                    : parts[3] || fieldKeyFromGetText;
            } else if (
                parts[0] === 'staticListItem' &&
                parts[1]?.startsWith('t') &&
                parts[2]?.startsWith('r')
            ) {
                refDetails.tableIndex = parseInt(parts[1].substring(1), 10);
                refDetails.rowIndex = parseInt(parts[2].substring(1), 10);
                refDetails.field = 'staticListItem';
            } else if (fieldKeyFromGetText === 'mainSedoGlobalContent') {
                refDetails.field = 'mainSedoGlobalContent';
            } else {
                refDetails.field = fieldKeyFromGetText;
            }
        } else if (storeName === 'algorithms' && fieldKeyFromGetText.startsWith('step_')) {
            const parts = fieldKeyFromGetText.split('_');
            if (parts.length === 3 && !isNaN(parseInt(parts[1]))) {
                refDetails.stepIndex = parseInt(parts[1]);
                refDetails.field = parts[2];
            } else if (fieldKeyFromGetText === 'steps') {
                refDetails.field = 'steps';
            } else {
                const stepIndexMatch = fieldKeyFromGetText.match(/step_(\d+)/);
                if (stepIndexMatch && stepIndexMatch[1]) {
                    refDetails.stepIndex = parseInt(stepIndexMatch[1], 10);
                }
                refDetails.field = fieldKeyFromGetText;
            }
        } else {
            refDetails.field = fieldKeyFromGetText;
        }

        if (typeof refDetails.tableIndex === 'number') {
            try {
                refDetails.tableTitle =
                    Array.isArray(itemData.tables) && itemData.tables[refDetails.tableIndex]
                        ? itemData.tables[refDetails.tableIndex].title || null
                        : null;
            } catch (_) {
                refDetails.tableTitle = null;
            }
        }

        for (const token of tokens) {
            promises.push(
                addToSearchIndex(
                    token,
                    storeName,
                    indexableId,
                    refDetails.field,
                    fieldWeight,
                    refDetails,
                ),
            );
        }
    }

    try {
        await Promise.all(promises);
    } catch (error) {
        console.error(
            `${LOG_PREFIX_USI_ITEM} Ошибка при массовом добавлении токенов для ${storeName} ID: ${indexableId}:`,
            error,
        );
    }
}

// ============================================================================
// ПОСТРОЕНИЕ ИНДЕКСА
// ============================================================================

/**
 * Очищает и перестраивает поисковый индекс
 */
export async function cleanAndRebuildSearchIndex() {
    console.log('[cleanAndRebuildSearchIndex] Начало очистки и перестроения индекса...');
    try {
        await clearIndexedDBStore('searchIndex');
        console.log('[cleanAndRebuildSearchIndex] Индекс очищен.');
        await saveToIndexedDB('preferences', {
            id: 'searchIndexStatus',
            built: false,
            version: DB_VERSION,
            timestamp: Date.now(),
        });

        await checkAndBuildIndex(true);
        console.log('[cleanAndRebuildSearchIndex] Индекс успешно перестроен.');
    } catch (error) {
        console.error('[cleanAndRebuildSearchIndex] Ошибка при перестроении индекса:', error);
        if (showNotification) {
            showNotification('Ошибка при перестроении поискового индекса.', 'error');
        }
    }
}

/**
 * Проверяет и при необходимости строит поисковый индекс
 */
export async function checkAndBuildIndex(
    forceRebuild = false,
    externalProgressCallback = null,
    context = 'normal',
) {
    if (!State.db) {
        console.warn('checkAndBuildIndex: DB not initialized.');
        if (externalProgressCallback) externalProgressCallback(0, 0, true);
        return;
    }
    console.log(`checkAndBuildIndex: Проверка состояния поискового индекса. Контекст: ${context}`);

    const REINDEX_MESSAGE =
        'Выполняется обновление приложения, для загрузки и индексации может требоваться время, это нормально';

    try {
        const indexStatus = await getFromIndexedDB('preferences', 'searchIndexStatus');
        const needsRebuild =
            !indexStatus ||
            !indexStatus.built ||
            indexStatus.version !== DB_VERSION ||
            indexStatus.error ||
            forceRebuild;

        if (needsRebuild) {
            const dbJustUpgraded = sessionStorage.getItem('dbJustUpgraded') === 'true';

            if (context === 'import') {
                console.log(
                    "[checkAndBuildIndex] Контекст 'import'. Отображается специальное сообщение.",
                );
                if (loadingOverlayManager && loadingOverlayManager.updateProgress) {
                    loadingOverlayManager.updateProgress(
                        loadingOverlayManager.currentProgressValue || 45,
                        REINDEX_MESSAGE,
                    );
                }
            } else if (dbJustUpgraded) {
                console.log(
                    '[checkAndBuildIndex] Обнаружен флаг обновления БД. Отображается специальное сообщение.',
                );
                if (loadingOverlayManager && loadingOverlayManager.updateProgress) {
                    loadingOverlayManager.updateProgress(
                        loadingOverlayManager.currentProgressValue || 45,
                        REINDEX_MESSAGE,
                    );
                }
                sessionStorage.removeItem('dbJustUpgraded');
            }

            const searchProgressEl = !externalProgressCallback
                ? document.getElementById('search-index-progress')
                : null;
            const searchProgressTextEl = !externalProgressCallback
                ? document.getElementById('search-index-progress-text')
                : null;

            if (searchProgressEl && searchProgressTextEl) {
                searchProgressEl.style.display = 'inline-block';
                searchProgressTextEl.style.display = 'inline';
                searchProgressEl.value = 0;
                searchProgressTextEl.textContent = 'Построение индекса: 0%';
            }

            const defaultUiProgress = (processed, total, error) => {
                if (!searchProgressEl || !searchProgressTextEl) return;
                if (error) {
                    searchProgressTextEl.textContent = 'Ошибка индексации!';
                    searchProgressEl.value = 100;
                    return;
                }
                if (total > 0) {
                    const percentage = Math.round((processed / total) * 100);
                    searchProgressTextEl.textContent = `Построение индекса: ${percentage}% (${processed}/${total})`;
                    searchProgressEl.value = percentage;
                    searchProgressEl.max = 100;
                } else if (processed === 0 && total === 0) {
                    searchProgressTextEl.textContent = 'Нет данных для индексации.';
                    searchProgressEl.value = 100;
                }
            };

            const actualProgressCallback = (processed, total, error) => {
                if (
                    window.BackgroundStatusHUD &&
                    typeof window.BackgroundStatusHUD.reportIndexProgress === 'function'
                ) {
                    window.BackgroundStatusHUD.reportIndexProgress(processed, total, error);
                }
                if (externalProgressCallback) externalProgressCallback(processed, total, error);
                else defaultUiProgress(processed, total, error);
            };

            let _buildError = null;
            try {
                if (
                    window.BackgroundStatusHUD &&
                    typeof window.BackgroundStatusHUD.startTask === 'function'
                ) {
                    window.BackgroundStatusHUD.startTask('search-index-build', 'Индексация контента', {
                        weight: 0.6,
                        total: 100,
                    });
                }
                await buildInitialSearchIndex(actualProgressCallback);
            } catch (e) {
                _buildError = e;
                throw e;
            } finally {
                if (
                    window.BackgroundStatusHUD &&
                    typeof window.BackgroundStatusHUD.finishTask === 'function'
                ) {
                    window.BackgroundStatusHUD.finishTask('search-index-build', !_buildError);
                }
            }
            if (searchProgressEl && searchProgressTextEl) {
                setTimeout(() => {
                    if (searchProgressEl) searchProgressEl.style.display = 'none';
                    if (searchProgressTextEl) searchProgressTextEl.style.display = 'none';
                }, 3000);
            }
        } else {
            console.log('Поисковый индекс актуален и не требует перестроения.');
            if (externalProgressCallback) externalProgressCallback(1, 1, false);
        }
    } catch (error) {
        console.error('Ошибка при проверке или построении поискового индекса:', error);
        if (showNotification) {
            showNotification('Критическая ошибка при работе с поисковым индексом.', 'error', 10000);
        }
        if (externalProgressCallback) externalProgressCallback(0, 0, true);
    }
}

/**
 * Строит начальный поисковый индекс
 */
export async function buildInitialSearchIndex(progressCallback) {
    const LOG_PREFIX_BUILD = '[SearchIndexBuild V13 - Batch Optimized]';
    if (!State.db) {
        console.error(`${LOG_PREFIX_BUILD} Cannot build search index: DB not initialized.`);
        if (showNotification)
            showNotification(
                'Ошибка построения поискового индекса: База данных недоступна.',
                'error',
            );
        try {
            await saveToIndexedDB('preferences', {
                id: 'searchIndexStatus',
                built: false,
                error: 'DB not initialized',
                version: DB_VERSION,
                timestamp: Date.now(),
            });
        } catch (e) {
            console.error(`${LOG_PREFIX_BUILD} Error saving failed searchIndexStatus:`, e);
        }
        if (progressCallback) progressCallback(0, 0, true);
        return;
    }
    console.log(`${LOG_PREFIX_BUILD} Starting to build initial search index with BATCHING...`);

    let overallSuccess = true;
    let processedItems = 0;
    let totalItemsToEstimate = 0;
    const indexData = new Map();

    try {
        console.log(`${LOG_PREFIX_BUILD} Clearing existing search index...`);
        await clearIndexedDBStore('searchIndex');
        console.log(`${LOG_PREFIX_BUILD} Existing search index cleared.`);

        const sourcesToProcess = [
            { name: 'algorithms', type: 'algorithms' },
            { name: 'reglaments', type: 'reglaments' },
            { name: 'links', type: 'links' },
            { name: 'extLinks', type: 'extLinks' },
            { name: 'bookmarks', type: 'bookmarks' },
            { name: 'bookmarkFolders', type: 'bookmarkFolders' },
            { name: 'clientData', type: 'clientData' },
            {
                name: 'preferences',
                type: 'preferences',
                keyForSpecificItem: SEDO_CONFIG_KEY,
            },
        ];

        for (const source of sourcesToProcess) {
            try {
                if (source.name === 'algorithms') {
                    const algoContainer = await getFromIndexedDB('algorithms', 'all');
                    if (algoContainer && algoContainer.data) {
                        if (algoContainer.data.main) totalItemsToEstimate++;
                        Object.keys(algoContainer.data).forEach((key) => {
                            if (key !== 'main' && Array.isArray(algoContainer.data[key])) {
                                totalItemsToEstimate += algoContainer.data[key].length;
                            }
                        });
                    }
                } else if (
                    source.keyForSpecificItem &&
                    source.name === 'preferences' &&
                    source.keyForSpecificItem
                ) {
                    const specificItem = await getFromIndexedDB(
                        source.name,
                        source.keyForSpecificItem,
                    );
                    if (specificItem) totalItemsToEstimate++;
                } else {
                    const count = await performDBOperation(source.name, 'readonly', (store) =>
                        store.count(),
                    );
                    totalItemsToEstimate += count;
                }
            } catch (e) {
                console.warn(
                    `${LOG_PREFIX_BUILD} Could not count items in ${source.name}: ${e.message}`,
                );
            }
        }
        totalItemsToEstimate += 2;
        console.log(
            `${LOG_PREFIX_BUILD} Estimated total items for indexing: ${totalItemsToEstimate}`,
        );
        if (progressCallback) progressCallback(processedItems, totalItemsToEstimate, false);

        let bookmarkFoldersMap = new Map();
        try {
            const folders = await getAllFromIndexedDB('bookmarkFolders');
            folders.forEach((folder) => bookmarkFoldersMap.set(String(folder.id), folder.name));
        } catch (e) {
            console.warn(
                `${LOG_PREFIX_BUILD} Could not pre-fetch bookmark folder names: ${e.message}`,
            );
        }

        const processItemInMemory = (itemData, storeName) => {
            const textsByField = getTextForItem(storeName, itemData);
            let indexableId = itemData.id;
            if (storeName === 'clientData') indexableId = 'current';
            if (storeName === 'algorithms' && itemData.id === 'main') indexableId = 'main';

            if (Object.keys(textsByField).length === 0) return;

            for (const [fieldKey, textContent] of Object.entries(textsByField)) {
                if (!textContent || typeof textContent !== 'string' || textContent.trim() === '')
                    continue;

                const tokens = tokenize(textContent);
                const storeWeights = FIELD_WEIGHTS[storeName] || FIELD_WEIGHTS.default;
                const fieldWeight = storeWeights[fieldKey] || 1.0;

                const refDetails = {
                    store: storeName,
                    type: storeName,
                    id: String(indexableId),
                    field: fieldKey,
                    weight: fieldWeight,
                };

                if (storeName === 'preferences' && itemData.id === SEDO_CONFIG_KEY) {
                    const parts = fieldKey.split('_');
                    if (parts.length >= 3) {
                        if (parts[0] === 'tableCell') {
                            refDetails.tableIndex = parseInt(parts[1].substring(1));
                            refDetails.rowIndex = parseInt(parts[2].substring(1));
                            refDetails.field = parts[3]?.substring(1) || fieldKey;
                        } else if (parts[0] === 'staticListItem') {
                            refDetails.tableIndex = parseInt(parts[1].substring(1));
                            refDetails.rowIndex = parseInt(parts[2].substring(1));
                            refDetails.field = 'staticListItem';
                        }
                    }
                }

                for (const token of tokens) {
                    if (token.length < MIN_TOKEN_LEN_FOR_INDEX && !isExceptionShortToken(token))
                        continue;
                    if (!indexData.has(token)) indexData.set(token, []);
                    const refs = indexData.get(token);
                    if (refs.length < MAX_REFS_PER_WORD) {
                        refs.push(refDetails);
                    }
                }
            }
        };

        for (const source of sourcesToProcess) {
            console.log(`${LOG_PREFIX_BUILD} Processing source: ${source.name}`);
            if (source.name === 'algorithms') {
                const algoContainer = await getFromIndexedDB('algorithms', 'all');
                if (algoContainer && algoContainer.data) {
                    if (algoContainer.data.main) {
                        processItemInMemory(algoContainer.data.main, 'algorithms');
                        processedItems++;
                        if (progressCallback)
                            progressCallback(processedItems, totalItemsToEstimate, false);
                    }
                    for (const sectionKey in algoContainer.data) {
                        if (
                            sectionKey !== 'main' &&
                            Array.isArray(algoContainer.data[sectionKey])
                        ) {
                            for (const item of algoContainer.data[sectionKey]) {
                                if (item && typeof item.id !== 'undefined') {
                                    processItemInMemory(item, 'algorithms');
                                    processedItems++;
                                    if (progressCallback)
                                        progressCallback(
                                            processedItems,
                                            totalItemsToEstimate,
                                            false,
                                        );
                                }
                            }
                        }
                    }
                }
            } else if (
                source.keyForSpecificItem &&
                source.name === 'preferences' &&
                source.keyForSpecificItem
            ) {
                const specificItem = await getFromIndexedDB(source.name, source.keyForSpecificItem);
                if (specificItem) {
                    processItemInMemory(specificItem, 'preferences');
                    processedItems++;
                    if (progressCallback)
                        progressCallback(processedItems, totalItemsToEstimate, false);
                }
            } else {
                const items = await getAllFromIndexedDB(source.name);
                for (const item of items) {
                    if (item && (item.id !== undefined || source.name === 'clientData')) {
                        if (source.name === 'bookmarks') {
                            if (item.folder === ARCHIVE_FOLDER_ID) {
                                processedItems++;
                                if (progressCallback)
                                    progressCallback(processedItems, totalItemsToEstimate, false);
                                continue;
                            }
                            if (item.folder && bookmarkFoldersMap.has(String(item.folder))) {
                                item._folderNameForIndex = bookmarkFoldersMap.get(
                                    String(item.folder),
                                );
                            }
                        }
                        processItemInMemory(item, source.type);
                        processedItems++;
                        if (progressCallback)
                            progressCallback(processedItems, totalItemsToEstimate, false);
                    }
                }
            }
        }

        try {
            const results = await fetchGoogleDocs([SHABLONY_DOC_ID], false);
            const data = results?.[0]?.data || results?.[0]?.content?.data || [];
            const blocks = parseShablonyContent(data);
            blocks.forEach((block) =>
                processItemInMemory(
                    { ...block, _internal_block_index: block.originalIndex },
                    'shablony',
                ),
            );
            processedItems++;
            if (progressCallback) progressCallback(processedItems, totalItemsToEstimate, false);
        } catch (error) {
            console.error(
                `${LOG_PREFIX_BUILD} Error processing Google Doc shablony:`,
                error,
            );
            overallSuccess = false;
            processedItems++;
            if (progressCallback) progressCallback(processedItems, totalItemsToEstimate, false);
        }

        console.log(
            `${LOG_PREFIX_BUILD} In-memory index created with ${indexData.size} unique tokens. Starting batch write to IndexedDB.`,
        );
        const transaction = State.db.transaction(['searchIndex'], 'readwrite');
        const store = transaction.objectStore('searchIndex');
        let writePromises = [];

        for (const [word, refs] of indexData.entries()) {
            const request = store.put({ word, refs });
            writePromises.push(
                new Promise((resolve, reject) => {
                    request.onsuccess = resolve;
                    request.onerror = (e) =>
                        reject(`Failed to put word '${word}': ${e.target.error}`);
                }),
            );
        }

        await Promise.all(writePromises);
        console.log(`${LOG_PREFIX_BUILD} All put requests have been sent within the transaction.`);

        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = (e) => reject(`Transaction failed: ${e.target.error}`);
            transaction.onabort = (e) => reject(`Transaction aborted: ${e.target.error}`);
        });

        if (!overallSuccess) {
            await saveToIndexedDB('preferences', {
                id: 'searchIndexStatus',
                built: false,
                error: 'One or more items failed to index',
                version: DB_VERSION,
                timestamp: Date.now(),
            });
            console.error(
                `${LOG_PREFIX_BUILD} One or more items failed during in-memory processing.`,
            );
        } else {
            await saveToIndexedDB('preferences', {
                id: 'searchIndexStatus',
                built: true,
                version: DB_VERSION,
                timestamp: Date.now(),
                error: null,
            });
            console.log(`${LOG_PREFIX_BUILD} Initial search index built successfully.`);
        }

        if (progressCallback)
            progressCallback(totalItemsToEstimate, totalItemsToEstimate, !overallSuccess);
    } catch (error) {
        console.error(`${LOG_PREFIX_BUILD} Critical error building initial search index:`, error);
        if (showNotification) {
            showNotification(
                `Критическая ошибка при построении поискового индекса: ${
                    error.message || String(error)
                }`,
                'error',
                10000,
            );
        }
        try {
            await saveToIndexedDB('preferences', {
                id: 'searchIndexStatus',
                built: false,
                error: String(error.message || error),
                version: DB_VERSION,
                timestamp: Date.now(),
            });
        } catch (e) {
            console.error(
                `${LOG_PREFIX_BUILD} Error saving failed searchIndexStatus after build error:`,
                e,
            );
        }
        if (progressCallback) progressCallback(processedItems, totalItemsToEstimate, true);
    }
}

// ============================================================================
// ВЫПОЛНЕНИЕ ПОИСКА
// ============================================================================

/**
 * Выполняет поиск
 */
export async function performSearch(query) {
    const searchResultsContainer = document.getElementById('searchResults');
    const MIN_SEARCH_LENGTH = 1;
    const loadingIndicatorHTML =
        '<div class="p-3 text-center text-gray-500 dark:text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Идет поиск...</div>';

    const noResultsHTML = (q) =>
        `<div class="p-3 text-center text-gray-500 dark:text-gray-400">По запросу "${escapeHtml(
            q,
        )}" ничего не найдено.</div>`;
    const errorHTML = '<div class="p-3 text-center text-red-500">Ошибка во время поиска.</div>';
    const dbErrorHTML =
        '<div class="p-3 text-center text-red-500">Ошибка: База данных не доступна.</div>';

    const startTime = performance.now();

    if (!State.db) {
        console.error('[performSearch] DB not ready');
        if (searchResultsContainer) searchResultsContainer.innerHTML = dbErrorHTML;
        return;
    }
    if (!searchResultsContainer) {
        console.error('[performSearch] searchResultsContainer not found');
        return;
    }

    if (!query) {
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.classList.add('hidden');
        return;
    }

    if (query.length < MIN_SEARCH_LENGTH) {
        const minLengthHTML = `<div class="p-3 text-center text-gray-500 dark:text-gray-400">Введите минимум ${MIN_SEARCH_LENGTH} символ...</div>`;
        searchResultsContainer.innerHTML = minLengthHTML;
        searchResultsContainer.classList.remove('hidden');
        return;
    }

    searchResultsContainer.innerHTML = loadingIndicatorHTML;
    searchResultsContainer.classList.remove('hidden');
    console.log(`[performSearch] Начало поиска по запросу: "${query}"`);

    try {
        const searchContext = determineSearchContext(query);
        const queryTokens = tokenize(query).filter((word) => word.length >= 2);
        const sectionMatches = findSectionMatches(query);

        if (queryTokens.length === 0) {
            renderSearchResults(sectionMatches, query);
            if (sectionMatches.length === 0) {
                searchResultsContainer.innerHTML = noResultsHTML(query);
            }
            return;
        }

        let candidateDocs = await searchCandidates(queryTokens, searchContext, query);

        const filteredCandidateDocs = new Map();
        for (const [key, value] of candidateDocs.entries()) {
            if (value.ref.store !== 'blacklistedClients') {
                filteredCandidateDocs.set(key, value);
            }
        }
        candidateDocs = filteredCandidateDocs;

        const finalResults = await processSearchResults(candidateDocs, query, query);

        const combinedResults = [...sectionMatches, ...finalResults];
        const sortedResults = sortSearchResults(combinedResults);
        const limitedResults = sortedResults.slice(0, 15);
        const endTime = performance.now();
        const executionTime = endTime - startTime;

        trackSearchMetrics(query, limitedResults.length, executionTime, searchContext);

        console.log(
            `[performSearch] Поиск завершен за ${executionTime.toFixed(2)}ms, найдено ${
                limitedResults.length
            } результатов`,
        );

        if (limitedResults.length === 0) {
            searchResultsContainer.innerHTML = noResultsHTML(query);
        } else {
            renderSearchResults(limitedResults, query);
        }
    } catch (error) {
        console.error('[performSearch] Ошибка поиска:', error);
        searchResultsContainer.innerHTML = errorHTML;

        if (showNotification) {
            showNotification(`Ошибка поиска: ${error.message}`, 'error');
        }
    }
}

/**
 * Выполняет поиск (обёртка)
 */
export async function executeSearch(query) {
    console.log(`[executeSearch] Начало поиска по запросу: "${query}"`);
    try {
        await performSearch(query);
        console.log(
            `[executeSearch] Поиск для запроса "${query}" успешно выполнен (или инициирован).`,
        );
    } catch (error) {
        console.error(`script.js:6135 Search failed: ${error.name}: ${error.message}`);
        if (showNotification) {
            showNotification(`Ошибка во время поиска: ${error.message}`, 'error');
        }
    }
}

/**
 * Debounced поиск
 */
export function debouncedSearch(query, delay = 300) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch(query);
    }, delay);
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ПОИСКА
// ============================================================================

/**
 * Ищет кандидатов в индексе
 */
async function searchCandidates(queryTokens, searchContext, normalizedQuery) {
    const candidateDocs = new Map();
    try {
        const transaction = State.db.transaction(['searchIndex'], 'readonly');
        const indexStore = transaction.objectStore('searchIndex');

        for (const queryToken of queryTokens) {
            const range = IDBKeyRange.bound(queryToken, queryToken + '\uffff');

            await new Promise((resolve, reject) => {
                const request = indexStore.openCursor(range);
                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const indexEntry = cursor.value;
                        const actualToken = indexEntry.word;

                        if (indexEntry.refs && Array.isArray(indexEntry.refs)) {
                            indexEntry.refs.forEach((ref) => {
                                if (!ref.store || !ref.id) return;

                                if (!isRelevantForContext(ref, searchContext, actualToken)) {
                                    return;
                                }

                                const docKey = generateDocKey(ref);
                                if (!candidateDocs.has(docKey)) {
                                    candidateDocs.set(docKey, {
                                        ref: ref,
                                        score: 0,
                                        matchedTokens: new Set(),
                                        context: searchContext,
                                    });
                                }

                                const candidate = candidateDocs.get(docKey);
                                candidate.score += calculateTokenScore(
                                    actualToken,
                                    queryToken,
                                    ref,
                                );
                                candidate.matchedTokens.add(queryToken);
                            });
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = (e) => reject(e.target.error);
            });
        }
    } catch (error) {
        console.error('[searchCandidates] Ошибка поиска кандидатов:', error);
        throw error;
    }

    return candidateDocs;
}

/**
 * Проверяет релевантность для контекста
 */
function isRelevantForContext(ref, searchContext, actualToken) {
    if (searchContext === 'general') {
        return true;
    }

    switch (searchContext) {
        case 'skzi':
            if (
                ref.store === 'algorithms' &&
                ref.id &&
                typeof ref.id === 'string' &&
                ref.id.startsWith('skzi')
            ) {
                return true;
            }
            return false;

        case 'sedo':
            if (ref.store === 'preferences' && String(ref.id) === SEDO_CONFIG_KEY) {
                return true;
            }
            return false;

        case 'fns':
            return false;

        case 'pfr':
            return false;

        default:
            console.warn(`isRelevantForContext: Неизвестный searchContext "${searchContext}"`);
            return false;
    }
}

/**
 * Генерирует ключ документа
 */
function generateDocKey(ref) {
    let docKey = `${ref.store}:${ref.id}`;
    if (ref.tableIndex !== undefined) docKey += `#t${ref.tableIndex}`;
    if (ref.rowIndex !== undefined) docKey += `#r${ref.rowIndex}`;
    if (ref.blockIndex !== undefined) docKey += `#b${ref.blockIndex}`;

    if (ref.field) docKey += `#f${String(ref.field).replace(/[:#]/g, '_')}`;
    return docKey;
}

/**
 * Вычисляет score для токена
 */
function calculateTokenScore(actualToken, queryToken, ref) {
    let score = 1.0 + Math.pow(actualToken.length, 0.6);

    if (actualToken === queryToken) {
        score += 100 * queryToken.length;
    } else if (actualToken.startsWith(queryToken)) {
        score += 15 * queryToken.length;
    }

    const fieldWeight = ref.weight || 1;
    score *= fieldWeight;

    return score;
}

/**
 * Сортирует результаты поиска
 */
function sortSearchResults(results) {
    return results.sort((a, b) => {
        if (a.type === 'section_link' && b.type !== 'section_link') return -1;
        if (a.type !== 'section_link' && b.type === 'section_link') return 1;
        if (a.type === 'section_link' && b.type === 'section_link') {
            if (
                a.score !== undefined &&
                b.score !== undefined &&
                Math.abs(b.score - a.score) > 0.01
            )
                return b.score - a.score;
            return (a.title || '').localeCompare(b.title || '');
        }
        if (a.isDirectPvsoOrCodeMatch && !b.isDirectPvsoOrCodeMatch) return -1;
        if (!a.isDirectPvsoOrCodeMatch && b.isDirectPvsoOrCodeMatch) return 1;
        if (a.isExactTitleMatch && !b.isExactTitleMatch) return -1;
        if (!a.isExactTitleMatch && b.isExactTitleMatch) return 1;
        if (Math.abs(b.score - a.score) > 0.01) {
            return b.score - a.score;
        }

        const aIsAlgo = a.type === 'algorithm' || a.type === 'main';
        const bIsAlgo = b.type === 'algorithm' || b.type === 'main';
        if (aIsAlgo && !bIsAlgo) return -1;
        if (!aIsAlgo && bIsAlgo) return 1;

        return (a.title || '').localeCompare(b.title || '');
    });
}

/**
 * Находит совпадения с разделами
 */
function findSectionMatches(normalizedQuery) {
    const sectionMatches = [];
    if (typeof tabsConfig === 'undefined' || !Array.isArray(tabsConfig)) {
        console.warn(
            '[findSectionMatches] tabsConfig is not defined or not an array. Cannot find section matches.',
        );
        return sectionMatches;
    }

    tabsConfig.forEach((tab) => {
        const tabNameLower = (tab.name || '').toLowerCase().replace(/ё/g, 'е');
        const tabIdLower = (tab.id || '').toLowerCase();
        const queryFoundInId = tabIdLower.includes(normalizedQuery);
        const queryFoundInName = tabNameLower.includes(normalizedQuery);

        if (queryFoundInId || queryFoundInName) {
            let sectionScore = 10000;
            if (tabIdLower === normalizedQuery || tabNameLower === normalizedQuery) {
                sectionScore += 5000;
            }

            sectionMatches.push({
                section: tab.id,
                type: 'section_link',
                id: `section-${tab.id}`,
                title: `Перейти в раздел "${tab.name}"`,
                description: `Открыть вкладку ${tab.name}`,
                score: sectionScore,
            });
        }
    });
    return sectionMatches;
}

/**
 * Применяет фильтры полей
 */
function applyFieldFilters(docEntries) {
    const searchFieldCheckboxes = document.querySelectorAll('.search-field-filter:checked');
    if (searchFieldCheckboxes.length === 0 || searchFieldCheckboxes.length >= 3) {
        return docEntries;
    }

    const selectedFields = new Set(Array.from(searchFieldCheckboxes).map((cb) => cb.value));

    return docEntries.filter((entry) => {
        const ref = entry.ref;

        for (const field of selectedFields) {
            if (isFieldMatch(ref, field)) {
                return true;
            }
        }
        return false;
    });
}

/**
 * Проверяет соответствие поля
 */
function isFieldMatch(ref, selectedField) {
    const fieldMapping = {
        title: ['title', 'name', 'tableTitle'],
        description: ['description', 'notes', 'content'],
        steps: ['steps', 'stepTitle'],
    };

    const matchingFields = fieldMapping[selectedField] || [selectedField];
    return matchingFields.some((field) => ref.field === field || ref.field?.includes(field));
}

/**
 * Загружает полные данные для результатов
 */
async function loadFullDataForResults(docEntries) {
    const storeGroups = new Map();

    docEntries.forEach((entry) => {
        const storeName = entry.ref.store;
        if (!storeGroups.has(storeName)) {
            storeGroups.set(storeName, new Set());
        }
        storeGroups.get(storeName).add(entry.ref.id);
    });

    const loadedData = new Map();

    for (const [storeName, ids] of storeGroups.entries()) {
        const storeData = new Map();
        loadedData.set(storeName, storeData);

        try {
            if (storeName === 'shablony') {
                ids.forEach((id) => {
                    storeData.set(String(id), { id: id, _isPlaceholder: true });
                });
                continue;
            }

            if (storeName === 'algorithms') {
                const algoContainer = await getFromIndexedDB('algorithms', 'all');
                if (algoContainer?.data) {
                    if (algoContainer.data.main) {
                        storeData.set('main', algoContainer.data.main);
                    }

                    Object.keys(algoContainer.data).forEach((sectionKey) => {
                        if (
                            sectionKey !== 'main' &&
                            Array.isArray(algoContainer.data[sectionKey])
                        ) {
                            algoContainer.data[sectionKey].forEach((algo) => {
                                if (algo?.id) {
                                    storeData.set(String(algo.id), algo);
                                }
                            });
                        }
                    });
                }
            } else if (storeName === 'clientData') {
                const clientData = await getFromIndexedDB('clientData', 'current');
                if (clientData) {
                    storeData.set('current', clientData);
                }
            } else {
                const items = await getAllFromIndexedDB(storeName);
                items.forEach((item) => {
                    if (item?.id !== undefined) {
                        storeData.set(String(item.id), item);
                    }
                });
            }
        } catch (error) {
            console.error(`[loadFullDataForResults] Ошибка загрузки ${storeName}:`, error);
        }
    }

    const resultsWithData = [];

    docEntries.forEach((entry) => {
        const storeData = loadedData.get(entry.ref.store);
        if (storeData) {
            const itemData = storeData.get(String(entry.ref.id));
            if (itemData) {
                resultsWithData.push({
                    ...entry,
                    itemData: itemData,
                });
            }
        }
    });

    return resultsWithData;
}

/**
 * Обрабатывает результаты поиска
 */
async function processSearchResults(candidateDocs, normalizedQuery, originalQuery) {
    const startTime = performance.now();
    console.log(
        `[processSearchResults V4] Начало обработки ${candidateDocs.size} кандидатов для запроса "${originalQuery}"`,
    );

    const finalDocEntries = Array.from(candidateDocs.values()).filter(
        (candidate) => candidate.matchedTokens.size > 0,
    );

    const filteredEntries = applyFieldFilters(finalDocEntries);

    const fullResults = await loadFullDataForResults(filteredEntries);

    const groupedByActualItem = new Map();
    fullResults.forEach((entry) => {
        if (!entry || !entry.ref || !entry.itemData || entry.ref.id === undefined) {
            return;
        }

        let groupKey;
        const ref = entry.ref;
        const itemData = entry.itemData;

        if (ref.store === 'shablony' && ref.blockIndex !== undefined) {
            groupKey = `shablony:${ref.id}:${ref.blockIndex}`;
        } else {
            let actualItemIdValue;
            if (ref.store === 'clientData') {
                actualItemIdValue = 'current';
            } else if (ref.store === 'algorithms' && itemData.id === 'main') {
                actualItemIdValue = 'main';
            } else {
                actualItemIdValue = String(itemData.id || ref.id);
            }
            groupKey = `${ref.store}:${actualItemIdValue}`;
        }

        if (!groupedByActualItem.has(groupKey)) {
            groupedByActualItem.set(groupKey, {
                itemData: entry.itemData,
                totalScore: 0,
                matchedTokensUnion: new Set(),
                context: entry.context,
                refsForConversion: [],
            });
        }
        const group = groupedByActualItem.get(groupKey);
        group.refsForConversion.push(entry.ref);
        group.totalScore += entry.score;
        entry.matchedTokens.forEach((token) => group.matchedTokensUnion.add(token));
    });

    const searchResults = [];
    for (const [groupKey, group] of groupedByActualItem.entries()) {
        if (!group.refsForConversion || group.refsForConversion.length === 0) {
            continue;
        }

        const representativeRef = group.refsForConversion[0];
        const result = convertItemToSearchResult(
            representativeRef,
            group.itemData,
            group.totalScore,
        );

        if (result) {
            result.highlightTerm = normalizedQuery;
            result.query = originalQuery;

            const lowerOriginalQuery = originalQuery.toLowerCase();

            if (
                group.itemData &&
                group.itemData.id === SEDO_CONFIG_KEY &&
                representativeRef.store === 'preferences'
            ) {
                let sedoCodeMatchFound = false;
                if (group.itemData.tables && Array.isArray(group.itemData.tables)) {
                    for (const table of group.itemData.tables) {
                        if (table.items && Array.isArray(table.items) && table.codeField) {
                            for (const rowItem of table.items) {
                                if (rowItem && typeof rowItem === 'object') {
                                    const codeFieldValue = String(
                                        rowItem[table.codeField] || '',
                                    ).toLowerCase();
                                    if (codeFieldValue === lowerOriginalQuery) {
                                        sedoCodeMatchFound = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (sedoCodeMatchFound) break;
                        if (
                            !table.codeField &&
                            table.items &&
                            Array.isArray(table.items) &&
                            table.columns &&
                            table.columns[0]
                        ) {
                            const firstColNameLower = table.columns[0].toLowerCase();
                            if (
                                firstColNameLower.includes('код') ||
                                firstColNameLower.includes('тип')
                            ) {
                                for (const rowItem of table.items) {
                                    if (rowItem && typeof rowItem === 'object') {
                                        const keys = Object.keys(rowItem);
                                        if (keys.length > 0) {
                                            const firstColValue = String(
                                                rowItem[keys[0]] || '',
                                            ).toLowerCase();
                                            if (firstColValue === lowerOriginalQuery) {
                                                sedoCodeMatchFound = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (sedoCodeMatchFound) break;
                    }
                }
                if (sedoCodeMatchFound) {
                    result.isDirectPvsoOrCodeMatch = true;
                    result.score = (result.score || 0) + 100000;
                }
            } else {
                let itemTitleOrName = result.title || '';

                if (itemTitleOrName.toLowerCase() === lowerOriginalQuery) {
                    result.isExactTitleMatch = true;
                    result.score = (result.score || 0) + 50000;
                }
            }
            searchResults.push(result);
        }
    }
    const endTime = performance.now();
    console.log(
        `[processSearchResults V4] Обработка кандидатов завершена за ${(
            endTime - startTime
        ).toFixed(2)}ms. Финальных результатов: ${searchResults.length}.`,
    );
    return searchResults;
}

/**
 * Конвертирует элемент в результат поиска
 */
function convertItemToSearchResult(ref, itemData, score) {
    const storeName = ref.store;
    const itemIdFromRef = ref.id;

    if (storeName === 'shablony') {
        const docId = itemIdFromRef;
        const blockIndex = ref.blockIndex;

        if (typeof blockIndex !== 'number') {
            return null;
        }
        const allBlocks = parseShablonyContent(getOriginalShablonyData() || []);
        const blockData = allBlocks.find((b) => b.originalIndex === blockIndex);

        if (blockData) {
            return {
                section: 'shablony',
                type: 'shablony_block',
                id: `${docId}_block_${blockIndex}`,
                title: blockData.title,
                description: truncateText(blockData.content, 150),
                score: score || 0,
                blockIndex: blockIndex,
            };
        }
        return null;
    }

    if (!itemData) {
        return null;
    }

    let finalItemId = itemIdFromRef;
    let finalSection = storeName;

    const algoSectionsFromTabs =
        typeof tabsConfig !== 'undefined' && Array.isArray(tabsConfig)
            ? tabsConfig
                  .filter(
                      (t) =>
                          t.id !== 'main' &&
                          t.id !== 'links' &&
                          t.id !== 'extLinks' &&
                          t.id !== 'reglaments' &&
                          t.id !== 'bookmarks' &&
                          t.id !== 'sedoTypes' &&
                          t.id !== 'uiSettingsControl',
                  )
                  .map((t) => t.id)
            : ['program', 'skzi', 'webReg', 'lk1c'];

    if (storeName === 'algorithms') {
        if (itemIdFromRef === 'main') {
            finalSection = 'main';
            finalItemId = 'main';
        } else {
            let determinedSection =
                itemData.section && algoSectionsFromTabs.includes(itemData.section)
                    ? itemData.section
                    : algoSectionsFromTabs.find((prefix) =>
                          String(itemData.id || itemIdFromRef)
                              .toLowerCase()
                              .startsWith(prefix.toLowerCase()),
                      );

            if (determinedSection) {
                finalSection = determinedSection;
            } else {
                finalSection = 'program';
            }
            finalItemId = itemData.id || itemIdFromRef;
        }
        if (itemData) {
            if (!itemData.id || String(itemData.id) !== String(finalItemId))
                itemData.id = finalItemId;
            if (!itemData.section || itemData.section !== finalSection)
                itemData.section = finalSection;
        }
    } else if (storeName === 'clientData') {
        finalItemId = 'current';
        finalSection = 'main';
    } else if (storeName === 'bookmarkFolders') {
        finalItemId = String(itemData.id || itemIdFromRef);
        finalSection = 'bookmarks';
    } else if (storeName === 'preferences') {
        if (itemIdFromRef === SEDO_CONFIG_KEY) {
            finalSection = 'sedoTypes';
        } else if (itemIdFromRef === 'uiSettings') {
            finalSection = 'uiSettingsControl';
            finalItemId = 'customizeUIBtn';
        } else {
            finalSection = 'preferences';
        }
    } else if (storeName === 'blacklistedClients') {
        finalSection = 'blacklistedClients';
        finalItemId = String(itemData.id || itemIdFromRef);
    } else {
        finalSection = storeName;
        finalItemId = String(itemData.id || itemIdFromRef);
    }

    let result = {
        section: finalSection,
        type: '',
        id: finalItemId,
        title: itemData.title || itemData.name || '',
        description: itemData.description || '',
        score: score || 0,
    };

    switch (storeName) {
        case 'algorithms':
            result.type = finalItemId === 'main' ? 'main' : 'algorithm';
            result.title =
                itemData.title || (finalItemId === 'main' ? 'Главная' : `Алгоритм ${finalItemId}`);
            result.description =
                itemData.description ||
                itemData.steps?.[0]?.description ||
                itemData.steps?.[0]?.title ||
                '';
            if (
                result.type === 'algorithm' &&
                itemData.section &&
                typeof getSectionName === 'function'
            ) {
                result.description = `[${getSectionName(itemData.section)}] ${result.description}`;
            }
            break;
        case 'links':
            result.type = 'link';
            break;
        case 'bookmarks':
            result.type = itemData.url ? 'bookmark' : 'bookmark_note';
            break;
        case 'reglaments':
            result.type = 'reglament';
            result.description =
                `Категория: ${
                    itemData.category
                        ? categoryDisplayInfo[itemData.category]?.title || itemData.category
                        : 'Без категории'
                }. ` +
                (itemData.content || '').substring(0, 100) +
                '...';
            break;
        case 'extLinks':
            result.type = 'extLink';
            break;
        case 'clientData':
            result.type = 'clientNote';
            result.title = 'Заметки по клиенту';
            result.description = (itemData.notes || '').substring(0, 100) + '...';
            break;
        case 'bookmarkFolders':
            result.type = 'bookmarkFolder';
            result.title = `Папка: ${itemData.name}`;
            break;
        case 'blacklistedClients':
            result.type = 'blacklistedClient';
            result.title = itemData.organizationName || `Запись ЧС #${finalItemId}`;
            result.description = `ИНН: ${itemData.inn || '-'}, Тел: ${itemData.phone || '-'}`;
            break;
        case 'preferences':
            if (itemIdFromRef === SEDO_CONFIG_KEY) {
                const table = itemData.tables?.[ref.tableIndex];
                result.type = 'sedoInfoItem';
                result.sedoTableIndex = ref.tableIndex;
                result.sedoRowIndex = ref.rowIndex;
                result.sedoHighlightField = ref.field;
                if (ref.tableTitle) result.sedoTableTitle = ref.tableTitle;
                if (table) {
                    const row = table.items?.[ref.rowIndex];
                    if (row) {
                        result.title = row.name || row.code || row.type || table.title;
                        result.description =
                            `В поле "${ref.field}": ` + truncateText(String(row[ref.field]), 100);
                    } else if (ref.field === 'tableTitle') {
                        result.title = table.title;
                        result.description = 'Найдено в заголовке таблицы';
                    } else {
                        result.title = table.title || 'Элемент СЭДО';
                        result.description = 'Найдено совпадение в таблице СЭДО';
                    }
                }
            } else if (itemIdFromRef === 'uiSettings') {
                result.type = 'uiSetting';
                result.title = 'Настройки интерфейса';
            } else {
                result.type = 'preference';
            }
            break;
        default:
            result.type = storeName;
            break;
    }

    if (result.description) {
        result.description = result.description
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (!result.title) {
        result.title = `(${result.type} ${result.id})`;
    }
    return result;
}

// ============================================================================
// РЕНДЕРИНГ РЕЗУЛЬТАТОВ
// ============================================================================

/**
 * Рендерит результаты поиска
 */
export function renderSearchResults(results, query) {
    console.log(
        `[renderSearchResults V3] Отображение ${
            results?.length ?? 0
        } результатов для запроса "${query}"`,
    );
    const searchResultsContainer = document.getElementById('searchResults');

    if (!searchResultsContainer) {
        console.warn('[renderSearchResults V3] Контейнер для результатов поиска не найден.');
        if (showNotification) {
            showNotification(
                'Ошибка: не найден контейнер для отображения результатов поиска.',
                'error',
            );
        }
        return;
    }

    searchResultsContainer.innerHTML = '';

    if (!results || results.length === 0) {
        const noResultsMessage = document.createElement('div');
        noResultsMessage.className = 'p-3 text-center text-gray-500 dark:text-gray-400';
        noResultsMessage.textContent = `По запросу "${escapeHtml(query)}" ничего не найдено.`;
        searchResultsContainer.appendChild(noResultsMessage);
        searchResultsContainer.classList.remove('hidden');
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'divide-y divide-gray-200 dark:divide-gray-600';

    results.forEach((result) => {
        if (!result || typeof result !== 'object') {
            return;
        }

        const li = document.createElement('li');
        li.className =
            'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer search-result-item';
        li.tabIndex = 0;

        let iconClass = 'fa-question-circle';
        let typeText = result.type || 'Запись';
        let resultSectionForDataset = result.section;

        switch (result.type) {
            case 'algorithm':
                iconClass = 'fa-sitemap';
                typeText = 'Алгоритм';
                break;
            case 'main':
                iconClass = 'fa-sitemap';
                typeText = 'Главная';
                resultSectionForDataset = 'main';
                break;
            case 'link':
                iconClass = 'fa-link';
                typeText = 'Ссылка 1С';
                break;
            case 'bookmark':
                iconClass = 'fa-bookmark';
                typeText = 'Закладка (URL)';
                break;
            case 'bookmark_note':
                iconClass = 'fa-sticky-note';
                typeText = 'Заметка';
                break;
            case 'reglament':
                iconClass = 'fa-file-alt';
                typeText = 'Регламент';
                break;
            case 'extLink':
                iconClass = 'fa-external-link-square-alt';
                typeText = 'Внешний ресурс';
                break;
            case 'clientNote':
                iconClass = 'fa-user-edit';
                typeText = 'Заметки клиента';
                break;
            case 'bookmarkFolder':
                iconClass = 'fa-folder-open';
                typeText = 'Папка закладок';
                break;
            case 'sedoInfoItem':
                iconClass = 'fa-info-circle';
                typeText = 'Инфо СЭДО';
                resultSectionForDataset = 'sedoTypes';
                break;
            case 'sedoInfo':
                iconClass = 'fa-info-circle';
                typeText = 'Инфо СЭДО (раздел)';
                resultSectionForDataset = 'sedoTypes';
                break;
            case 'uiSetting':
                iconClass = 'fa-palette';
                typeText = 'Настройка UI';
                resultSectionForDataset = 'uiSettingsControl';
                break;
            case 'section_link':
                iconClass = 'fa-columns';
                typeText = 'Раздел';
                break;
            case 'shablony_block':
                iconClass = 'fa-file-invoice';
                typeText = 'Шаблоны';
                break;
        }

        const titleContainer = document.createElement('div');
        titleContainer.className = 'flex items-center';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'font-medium text-gray-900 dark:text-gray-100';

        const titleText = result.title || 'Без заголовка';
        const highlightTerm = result.highlightTerm || query;

        if (highlightTerm && titleText.toLowerCase().includes(highlightTerm.toLowerCase())) {
            titleSpan.innerHTML = highlightTextInString(titleText, highlightTerm);
        } else {
            titleSpan.textContent = titleText;
        }
        titleContainer.appendChild(titleSpan);

        if (result.isDirectPvsoOrCodeMatch || result.isExactTitleMatch) {
            li.classList.add('exact-match-highlight', 'dark:exact-match-highlight-dark');

            const exactMatchBadge = document.createElement('span');
            exactMatchBadge.className = 'ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full';
            if (result.isDirectPvsoOrCodeMatch) {
                exactMatchBadge.classList.add(
                    'bg-green-100', 'text-green-700', 'dark:bg-green-700', 'dark:text-green-100',
                );
                exactMatchBadge.textContent = 'Совпадение';
            } else {
                exactMatchBadge.classList.add(
                    'bg-blue-100', 'text-blue-700', 'dark:bg-blue-700', 'dark:text-blue-100',
                );
                exactMatchBadge.textContent = 'Совпадение';
            }
            titleContainer.appendChild(exactMatchBadge);
        }

        const typeSpan = document.createElement('span');
        typeSpan.className = 'text-xs text-gray-500 dark:text-gray-400 ml-2';
        typeSpan.innerHTML = `<i class="fas ${iconClass} mr-1 opacity-75"></i>${typeText}`;
        titleContainer.appendChild(typeSpan);

        const descriptionSpan = document.createElement('p');
        descriptionSpan.className = 'text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate';

        const descriptionText = result.description || '';
        if (highlightTerm && descriptionText.toLowerCase().includes(highlightTerm.toLowerCase())) {
            descriptionSpan.innerHTML = highlightTextInString(descriptionText, highlightTerm);
        } else {
            descriptionSpan.textContent = descriptionText;
        }
        descriptionSpan.title = descriptionText;

        li.appendChild(titleContainer);
        if (result.description) {
            li.appendChild(descriptionSpan);
        }

        if (result.id) {
            li.dataset.id = result.id;
        }
        li.dataset.type = result.type;
        if (resultSectionForDataset) {
            li.dataset.section = resultSectionForDataset;
        }
        li.dataset.highlightTerm = highlightTerm;

        const handleResultClickLocal = () => {
            handleSearchResultClick(result);
        };

        li.addEventListener('click', handleResultClickLocal);
        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleResultClickLocal();
            }
        });

        ul.appendChild(li);
    });

    searchResultsContainer.appendChild(ul);
    searchResultsContainer.classList.remove('hidden');
}

// ============================================================================
// ОБРАБОТКА КЛИКА ПО РЕЗУЛЬТАТУ
// ============================================================================

/**
 * Обрабатывает клик по результату поиска
 */
export async function handleSearchResultClick(result) {
    console.log(
        '[handleSearchResultClick V11 - Google Docs] Clicked on result:',
        JSON.parse(JSON.stringify(result)),
    );
    const searchInput = document.getElementById('searchInput');
    const searchResultsContainer = document.getElementById('searchResults');

    if (searchInput) searchInput.value = '';
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');

    async function tryScrollAndHighlight(tabId, itemSelector, highlightTerm) {
        if (typeof setActiveTab === 'function' && State.currentSection !== tabId) {
            setActiveTab(tabId);
            await new Promise((resolve) => setTimeout(resolve, 350));
        }
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const element = document.querySelector(itemSelector);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (typeof highlightElement === 'function')
                        highlightElement(element, highlightTerm);
                    resolve({ success: true, elementFound: true });
                } else {
                    console.warn(`[tryScrollAndHighlight] Element ${itemSelector} not found.`);
                    resolve({ success: false, elementFound: false });
                }
            });
        });
    }

    try {
        let tabId, itemSelector;
        switch (result.type) {
            case 'shablony_block':
                tabId = 'shablony';
                itemSelector = `#doc-content-shablony div[data-block-index="${result.blockIndex}"]`;
                await tryScrollAndHighlight(
                    tabId,
                    itemSelector,
                    result.highlightTerm || result.title,
                );
                break;
            case 'algorithm':
            case 'main':
                const algoId = result.type === 'main' ? 'main' : result.id;
                const algoSection = result.section;
                if (algoId !== 'main') {
                    await tryScrollAndHighlight(
                        algoSection,
                        `#${algoSection}Algorithms .algorithm-card[data-id="${algoId}"]`,
                        result.highlightTerm || result.title,
                    );
                }
                const algoData =
                    algoId === 'main'
                        ? algorithms?.main
                        : algorithms?.[algoSection]?.find((a) => String(a.id) === String(algoId));
                if (algoData && showAlgorithmDetail) showAlgorithmDetail(algoData, algoSection);
                break;
            case 'bookmark':
            case 'bookmark_note':
                await tryScrollAndHighlight(
                    'bookmarks',
                    `.bookmark-item[data-id="${result.id}"]`,
                    result.highlightTerm || result.title,
                );
                if (showBookmarkDetailModal) showBookmarkDetailModal(parseInt(result.id, 10));
                break;
            case 'reglament':
                const reglamentData = await getFromIndexedDB('reglaments', parseInt(result.id, 10));
                if (reglamentData && reglamentData.category) {
                    if (setActiveTab) await setActiveTab('reglaments');
                    if (showReglamentsForCategory) await showReglamentsForCategory(reglamentData.category);
                    await tryScrollAndHighlight(
                        null,
                        `.reglament-item[data-id="${result.id}"]`,
                        result.highlightTerm || result.title,
                    );
                }
                if (showReglamentDetail) showReglamentDetail(parseInt(result.id, 10));
                break;
            case 'sedoInfoItem':
                if (setActiveTab) await setActiveTab('sedoTypes');
                if (window._highlightAndScrollSedoItem) {
                    await window._highlightAndScrollSedoItem(
                        result.sedoTableIndex,
                        result.sedoRowIndex,
                        result.sedoHighlightField,
                        result.highlightTerm || result.title,
                    );
                }
                break;
            case 'clientNote':
                if (setActiveTab) await setActiveTab('main');
                const textarea = document.getElementById('clientNotes');
                if (textarea) {
                    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    textarea.focus();
                    highlightElement(textarea, result.highlightTerm);
                }
                break;
            case 'section_link':
                if (result.section && setActiveTab) {
                    setActiveTab(result.section);
                }
                break;
            default:
                if (result.section) {
                    await tryScrollAndHighlight(
                        result.section,
                        `[data-id="${result.id}"]`,
                        result.highlightTerm || result.title,
                    );
                } else if (showNotification) {
                    showNotification(
                        `Действие для типа "${result.type}" не определено.`,
                        'warning',
                    );
                }
        }
    } catch (error) {
        console.error('Ошибка при обработке клика по результату поиска:', error);
        if (showNotification) {
            showNotification('Произошла ошибка при переходе к результату.', 'error');
        }
    }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПОИСКОВОЙ СИСТЕМЫ
// ============================================================================

/**
 * Инициализирует поисковую систему
 */
export function initSearchSystem() {
    const searchInput = document.getElementById('searchInput');
    const searchResultsContainer = document.getElementById('searchResults');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchFieldFilters = document.querySelectorAll('.search-field-filter');

    if (!searchInput) {
        console.error(
            '[initSearchSystem] Search input #searchInput not found. Search system not fully initialized.',
        );
        return;
    }
    if (!searchResultsContainer) {
        console.warn(
            '[initSearchSystem] Search results container #searchResults not found. Results display might be affected.',
        );
    }

    const debouncedSearchHandler = debounce 
        ? debounce(async () => {
            try {
                if (!searchInput) {
                    return;
                }

                const searchQueryValue = sanitizeQuery(searchInput.value);

                console.log(`[initSearchSystem] Executing search for query: "${searchQueryValue}"`);

                if (searchQueryValue.length >= 1) {
                    await performSearch(searchQueryValue);
                } else if (searchResultsContainer) {
                    searchResultsContainer.innerHTML = '';
                    searchResultsContainer.classList.add('hidden');
                }
            } catch (error) {
                console.error('[initSearchSystem] Ошибка при выполнении поиска:', error);
                if (searchResultsContainer) {
                    searchResultsContainer.innerHTML =
                        '<div class="p-3 text-center text-red-500">Ошибка при поиске.</div>';
                    searchResultsContainer.classList.remove('hidden');
                }
            }
        }, 300)
        : async () => {
            const searchQueryValue = sanitizeQuery(searchInput.value);
            if (searchQueryValue.length >= 1) {
                await performSearch(searchQueryValue);
            }
        };

    const handleInput = () => {
        debouncedSearchHandler();
        if (clearSearchBtn) {
            clearSearchBtn.classList.toggle('hidden', searchInput.value.length === 0);
        }
    };

    const handleClickOutside = (event) => {
        if (
            searchResultsContainer &&
            !searchResultsContainer.classList.contains('hidden') &&
            searchInput
        ) {
            const isClickInsideSearchInput = searchInput.contains(event.target);
            const isClickInsideSearchResults = searchResultsContainer.contains(event.target);
            const isClickInsideFilters = Array.from(searchFieldFilters).some(
                (filter) =>
                    filter.contains(event.target) || filter.labels?.[0]?.contains(event.target),
            );

            if (!isClickInsideSearchInput && !isClickInsideSearchResults && !isClickInsideFilters) {
                searchResultsContainer.classList.add('hidden');
            }
        }
    };

    const handleClearSearch = () => {
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        if (searchResultsContainer) {
            searchResultsContainer.innerHTML = '';
            searchResultsContainer.classList.add('hidden');
        }
        if (clearSearchBtn) {
            clearSearchBtn.classList.add('hidden');
        }
    };

    searchInput.addEventListener('input', handleInput);
    document.addEventListener('click', handleClickOutside);

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', handleClearSearch);
        if (searchInput) {
            clearSearchBtn.classList.toggle('hidden', searchInput.value.length === 0);
        } else {
            clearSearchBtn.classList.add('hidden');
        }
    }

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'k') {
            event.preventDefault();
            if (searchInput) searchInput.focus();
        }
    });

    console.log(
        '[initSearchSystem] Search system initialized (v5.2 - query variable fix verified, Esc handler removed).',
    );
}

// ============================================================================
// МЕТРИКИ И АНАЛИТИКА
// ============================================================================

/**
 * Отслеживает метрики поиска
 */
function trackSearchMetrics(query, resultsCount, executionTime, context) {
    const metrics = {
        query: query,
        resultsCount: resultsCount,
        executionTime: Math.round(executionTime),
        context: context,
        timestamp: new Date().toISOString(),
    };

    console.log('[Search Metrics]', metrics);

    try {
        const searchHistory = JSON.parse(localStorage.getItem('searchMetrics') || '[]');
        searchHistory.push(metrics);

        if (searchHistory.length > 1000) {
            searchHistory.splice(0, 100);
        }

        localStorage.setItem('searchMetrics', JSON.stringify(searchHistory));
    } catch (error) {
        console.warn('[trackSearchMetrics] Ошибка сохранения метрик:', error);
    }
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Синонимы для расширения поиска
 */
const synonyms = {
    сэдо: ['пвсо', 'сфр', 'фсс'],
    элн: ['электронный листок', 'больничный'],
    уведомление: ['извещение', 'сообщение'],
};

/**
 * Расширяет запрос синонимами
 */
export function expandQueryWithSynonyms(query) {
    const words = query.toLowerCase().split(/\s+/);
    const expanded = new Set(words);

    words.forEach((word) => {
        if (synonyms[word]) {
            synonyms[word].forEach((syn) => expanded.add(syn));
        }

        for (const [key, syns] of Object.entries(synonyms)) {
            if (syns.includes(word)) {
                expanded.add(key);
            }
        }
    });
    return Array.from(expanded);
}

/**
 * Поиск с регулярным выражением
 */
export async function searchWithRegex(regexStr) {
    const regex = new RegExp(regexStr.slice(1, -1), 'i');
    const results = [];
    const stores = ['algorithms', 'links', 'bookmarks', 'reglaments', 'extLinks'];

    for (const storeName of stores) {
        const items = await getAllFromIndexedDB(storeName);
        items.forEach((item) => {
            const texts = getTextForItem(storeName, item);
            for (const text of Object.values(texts)) {
                if (regex.test(text)) {
                    results.push({
                        ...item,
                        originalType: storeName,
                        matchType: 'regex',
                    });
                    break;
                }
            }
        });
    }
    return results;
}

/**
 * Отладочная функция проверки индекса
 */
export async function debug_checkIndex(token) {
    if (!State.db) {
        console.log('DB not ready');
        return;
    }
    if (!token || typeof token !== 'string') {
        console.log('Please provide a token (string) to check.');
        return;
    }
    const normalizedToken = token.toLowerCase().replace(/ё/g, 'е');
    console.log(`Checking index for token: "${normalizedToken}"`);
    try {
        const transaction = State.db.transaction(['searchIndex'], 'readonly');
        const store = transaction.objectStore('searchIndex');
        const request = store.get(normalizedToken);

        await new Promise((resolve, reject) => {
            request.onerror = (e) => {
                console.error('Error getting token:', e.target.error);
                reject(e.target.error);
            };
            request.onsuccess = (e) => {
                const result = e.target.result;
                if (result) {
                    console.log(
                        `Found entry for token "${normalizedToken}":`,
                        JSON.parse(JSON.stringify(result)),
                    );
                    console.log(
                        `  References (${result.refs?.length || 0}):`,
                        JSON.parse(JSON.stringify(result.refs)),
                    );
                } else {
                    console.log(`Token "${normalizedToken}" NOT found in index.`);
                }
                resolve();
            };
        });
    } catch (error) {
        console.error('Error checking index:', error);
    }
}

console.log('[Search Module] Модуль поисковой системы загружен.');
