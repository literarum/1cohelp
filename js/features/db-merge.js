'use strict';

/**
 * Модуль слияния баз данных (IndexedDB).
 *
 * Основные этапы:
 *  1) Чтение экспортного JSON (формат exportAllData) и валидация schemaVersion.
 *  2) Загрузка «локальных» данных из IndexedDB для content‑store'ов.
 *  3) Анализ дублей/конфликтов по естественным ключам (identityKey).
 *  4) Построение MergePlan с учётом пользовательских решений.
 *  5) Применение MergePlan с ремаппингом ID и обновлением UI/поиска.
 */

import { State } from '../app/state.js';
import { CURRENT_SCHEMA_VERSION } from '../constants.js';
import { clearIndexedDBStore, getAllFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { escapeHtml } from '../utils/html.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setDbMergeDependencies)
// ============================================================================

let deps = {
    NotificationService: null,
    loadingOverlayManager: null,
    showNotification: null,
    showAppConfirm: null,
    storeConfigs: null,
    /** Полный экспорт БД (резервная копия). Обязателен перед слиянием. */
    exportAllData: null,
    // Функции для обновления UI/поиска после merge:
    loadBookmarks: null,
    loadExtLinks: null,
    loadCibLinks: null,
    renderReglamentCategories: null,
    showReglamentsForCategory: null,
    initSearchSystem: null,
    buildInitialSearchIndex: null,
    updateSearchIndex: null,
    initDraggableVerticalSplitters: null,
};

/**
 * Устанавливает зависимости для модуля слияния БД.
 * @param {Object} dependencies
 */
export function setDbMergeDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[DbMerge] Зависимости установлены');
}

// ============================================================================
// КОНСТАНТЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

// Store'ы, входящие в content‑scope по умолчанию
export const CONTENT_STORES = [
    'algorithms',
    'bookmarkFolders',
    'bookmarks',
    'reglaments',
    'extLinks',
    'extLinkCategories',
    'favorites',
    'pdfFiles',
    'screenshots',
];

const MERGE_SCOPE_TO_STORES = {
    algorithms: ['algorithms'],
    bookmarks: ['bookmarkFolders', 'bookmarks'],
    reglaments: ['reglaments'],
    extLinks: ['extLinkCategories', 'extLinks'],
    favorites: ['favorites'],
    attachments: ['pdfFiles', 'screenshots'],
};

function resolveStoresFromSelectedScopes(selectedScopeValues) {
    if (!Array.isArray(selectedScopeValues)) return [];
    const seenStores = new Set();
    const stores = [];
    selectedScopeValues.forEach((scopeValue) => {
        const normalizedScope = String(scopeValue || '').trim();
        if (!normalizedScope) return;
        const mappedStores = MERGE_SCOPE_TO_STORES[normalizedScope];
        if (!Array.isArray(mappedStores)) return;
        mappedStores.forEach((storeName) => {
            if (!CONTENT_STORES.includes(storeName)) return;
            if (seenStores.has(storeName)) return;
            seenStores.add(storeName);
            stores.push(storeName);
        });
    });
    return stores;
}

function buildScopeSelectionSummary(selectedScopeValues) {
    const normalizedScopes = Array.isArray(selectedScopeValues)
        ? selectedScopeValues.map((scope) => String(scope || '').trim()).filter(Boolean)
        : [];
    const uniqueScopes = [...new Set(normalizedScopes)].filter((scope) =>
        Object.prototype.hasOwnProperty.call(MERGE_SCOPE_TO_STORES, scope),
    );
    const stores = resolveStoresFromSelectedScopes(uniqueScopes);
    return {
        scopeCount: uniqueScopes.length,
        storeCount: stores.length,
        stores,
    };
}

/**
 * Нормализует строку (для identityKey / дедупликации).
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
    if (!value) return '';
    return String(value).trim().toLowerCase();
}

/**
 * Очень грубая нормализация URL – домен + путь без протокола и слеша в конце.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
    if (!url) return '';
    let value = String(url).trim();
    try {
        if (!/^https?:\/\//i.test(value)) {
            value = `https://${value}`;
        }
        const urlObj = new URL(value);
        let path = urlObj.pathname || '/';
        if (path !== '/' && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        return `${urlObj.hostname}${path}`.toLowerCase();
    } catch {
        return normalizeText(value);
    }
}

/**
 * Конфигурация «естественных ключей» для content‑store'ов.
 * identityKey(record, ctx) должен возвращать строку, по которой можно
 * надёжно сравнивать «один и тот же» объект из разных баз.
 */
const MERGE_IDENTITY_CONFIG = {
    bookmarkFolders: {
        identityKey: (record) => `bookmarkFolder|${normalizeText(record?.name)}`,
    },
    bookmarks: {
        identityKey: (record, ctx) => {
            const urlKey = normalizeUrl(record?.url || record?.url_original || '');
            const folderName =
                ctx?.bookmarkFolderIdToName?.get(record?.folder) ??
                normalizeText(String(record?.folder ?? ''));
            const titleKey = normalizeText(record?.title);
            return `bookmark|${folderName}|${urlKey}|${titleKey}`;
        },
    },
    reglaments: {
        identityKey: (record, ctx) => {
            // Категория может быть либо ID, либо названием – используем оба варианта.
            const categoryId = record?.category;
            const categoryName =
                ctx?.reglamentCategoryIdToName?.get(categoryId) ??
                normalizeText(record?.categoryName || '');
            const titleKey = normalizeText(record?.title);
            return `reglament|${categoryName}|${titleKey}`;
        },
    },
    extLinkCategories: {
        identityKey: (record) => `extLinkCategory|${normalizeText(record?.name)}`,
    },
    extLinks: {
        identityKey: (record, ctx) => {
            const categoryName =
                ctx?.extLinkCategoryIdToName?.get(record?.category) ??
                normalizeText(record?.categoryName || '');
            const urlKey = normalizeUrl(record?.url_full || record?.url || '');
            const titleKey = normalizeText(record?.title);
            return `extLink|${categoryName}|${urlKey}|${titleKey}`;
        },
    },
    favorites: {
        identityKey: (record) => {
            // В избранном уникальность уже обеспечивается index ['itemType', 'originalItemId']
            return `favorite|${normalizeText(record?.itemType)}|${String(
                record?.originalItemId ?? '',
            )}`;
        },
    },
    pdfFiles: {
        identityKey: (record) =>
            `pdf|${normalizeText(record?.parentType)}|${String(
                record?.parentId ?? '',
            )}|${normalizeText(record?.filename)}`,
    },
    screenshots: {
        identityKey: (record) =>
            `screenshot|${normalizeText(record?.parentType)}|${String(record?.parentId ?? '')}|${
                record?.id ?? ''
            }`,
    },
};

const LEGACY_EXT_LINK_CATEGORY_KEY_TO_DEFAULT_NAME = {
    docs: 'Документация',
    gov: 'Гос. сайты',
    gos: 'Гос. сайты',
    tools: 'Инструменты',
    other: 'Прочее',
};

function normalizeCategoryName(value) {
    return normalizeText(String(value || '').replace(/\s+/g, ' '));
}

function normalizeImportedRecordForStore(storeName, record, ctx) {
    if (!record || typeof record !== 'object') return record;
    const normalized = { ...record };

    if (storeName === 'bookmarks') {
        if (
            typeof normalized.folder === 'undefined' &&
            typeof normalized.folderId !== 'undefined'
        ) {
            normalized.folder = normalized.folderId;
        }
        delete normalized.folderId;
    }

    if (storeName === 'reglaments') {
        if (
            typeof normalized.category === 'undefined' &&
            typeof normalized.categoryId !== 'undefined'
        ) {
            normalized.category = normalized.categoryId;
        }
        delete normalized.categoryId;
    }

    if (storeName === 'extLinks') {
        if (typeof normalized.category === 'string') {
            const raw = normalizeText(normalized.category);
            const legacyName = LEGACY_EXT_LINK_CATEGORY_KEY_TO_DEFAULT_NAME[raw] || raw;
            const normalizedName = normalizeCategoryName(legacyName);
            const mappedId = ctx.extLinkCategoryNameToId?.get(normalizedName);
            if (typeof mappedId !== 'undefined') {
                normalized.category = mappedId;
            } else {
                normalized.categoryName = legacyName;
                normalized.category = null;
            }
        }
    }

    if (storeName === 'favorites' && typeof normalized.originalItemId !== 'undefined') {
        normalized.originalItemId = String(normalized.originalItemId);
    }

    if (storeName === 'pdfFiles' && typeof normalized.parentId !== 'undefined') {
        normalized.parentId = String(normalized.parentId);
        if (typeof normalized.parentType !== 'undefined') {
            normalized.parentKey = `${normalized.parentType}:${normalized.parentId}`;
        }
    }

    if (storeName === 'screenshots') {
        if (
            typeof normalized.parentId === 'undefined' &&
            typeof normalized.algorithmId !== 'undefined'
        ) {
            normalized.parentId = String(normalized.algorithmId);
            normalized.parentType = 'algorithm';
        } else if (typeof normalized.parentId !== 'undefined') {
            normalized.parentId = String(normalized.parentId);
        }
        delete normalized.algorithmId;
    }

    return normalized;
}

function normalizeImportDataForMerge(importDataRaw, stores) {
    const importData = {};
    stores.forEach((storeName) => {
        importData[storeName] = Array.isArray(importDataRaw?.[storeName])
            ? importDataRaw[storeName]
            : [];
    });

    const extLinkCategoryNameToId = new Map();
    (importData.extLinkCategories || []).forEach((category) => {
        if (typeof category?.id === 'undefined') return;
        const name = normalizeCategoryName(category?.name);
        if (!name) return;
        extLinkCategoryNameToId.set(name, category.id);
    });

    const normalizationContext = {
        extLinkCategoryNameToId,
    };

    stores.forEach((storeName) => {
        importData[storeName] = (importData[storeName] || []).map((record) =>
            normalizeImportedRecordForStore(storeName, record, normalizationContext),
        );
    });

    return importData;
}

/**
 * Типы конфликтов при анализе:
 *  - identical: записи эквивалентны, можно пропустить.
 *  - conflict: есть различия, нужно решение пользователя.
 */
export const CONFLICT_KIND = {
    IDENTICAL: 'identical',
    CONFLICT: 'conflict',
};

/**
 * Мягкое сравнение двух записей: игнорируем поля id и служебные таймстемпы.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function areRecordsSemanticallyEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const stableNormalize = (value) => {
        if (Array.isArray(value)) {
            return value.map((item) => stableNormalize(item));
        }
        if (value && typeof value === 'object') {
            const normalized = {};
            Object.keys(value)
                .sort()
                .forEach((key) => {
                    normalized[key] = stableNormalize(value[key]);
                });
            return normalized;
        }
        return value;
    };
    const strip = (obj) => {
        const clone = {};
        Object.keys(obj || {})
            .sort()
            .forEach((key) => {
                if (key === 'id' || key === '_id') return;
                if (key === 'dateAdded' || key === 'createdAt' || key === 'updatedAt') return;
                clone[key] = stableNormalize(obj[key]);
            });
        return clone;
    };
    const sa = JSON.stringify(strip(a));
    const sb = JSON.stringify(strip(b));
    return sa === sb;
}

function clonePlain(value) {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

function normalizeAlgorithmsMergePolicy(policy) {
    if (policy === 'import' || policy === 'preferImport') return 'preferImport';
    if (policy === 'both' || policy === 'keepBoth') return 'keepBoth';
    return 'keepLocal';
}

function extractAlgorithmsContainerRecord(record) {
    if (!record || typeof record !== 'object') return null;

    if (record.section === 'all' && record.data && typeof record.data === 'object') {
        return {
            section: 'all',
            data: clonePlain(record.data),
        };
    }

    if (record.data && typeof record.data === 'object') {
        return {
            section: 'all',
            data: clonePlain(record.data),
        };
    }

    const looksLikeAlgorithmsPayload = Object.keys(record).some((key) => key === 'main');
    if (looksLikeAlgorithmsPayload) {
        return {
            section: 'all',
            data: clonePlain(record),
        };
    }

    return null;
}

function generateAlgorithmImportCopyId(baseId, usedIds) {
    const normalizedBase =
        typeof baseId === 'undefined' || baseId === null || String(baseId).trim() === ''
            ? 'imported-algorithm'
            : String(baseId);

    let candidate = `${normalizedBase}__importCopy`;
    let counter = 1;
    while (usedIds.has(candidate)) {
        candidate = `${normalizedBase}__importCopy${counter}`;
        counter += 1;
    }
    return candidate;
}

function mergeMainAlgorithm(localMain, incomingMain, policy) {
    if (!localMain && !incomingMain) return null;
    if (!localMain && incomingMain) {
        return {
            id: 'main',
            ...clonePlain(incomingMain),
        };
    }
    if (localMain && !incomingMain) {
        return {
            id: 'main',
            ...clonePlain(localMain),
        };
    }

    if (areRecordsSemanticallyEqual(localMain, incomingMain)) {
        return {
            id: 'main',
            ...clonePlain(localMain),
        };
    }

    if (policy === 'preferImport' || policy === 'keepBoth') {
        return {
            id: 'main',
            ...clonePlain(incomingMain),
        };
    }

    return {
        id: 'main',
        ...clonePlain(localMain),
    };
}

function mergeAlgorithmSectionArray(
    sectionName,
    localArray,
    incomingArray,
    policy,
    algorithmIdMap,
) {
    const result = Array.isArray(localArray)
        ? localArray
              .filter((item) => item && typeof item === 'object')
              .map((item) => clonePlain(item))
        : [];

    const usedIds = new Set(
        result
            .map((item) =>
                typeof item?.id === 'undefined' || item?.id === null ? null : String(item.id),
            )
            .filter(Boolean),
    );
    const localIndexById = new Map();
    result.forEach((item, index) => {
        if (typeof item?.id !== 'undefined' && item?.id !== null) {
            localIndexById.set(String(item.id), index);
        }
    });

    const incomingItems = Array.isArray(incomingArray) ? incomingArray : [];

    incomingItems.forEach((incomingRaw) => {
        if (!incomingRaw || typeof incomingRaw !== 'object') return;
        const incoming = clonePlain(incomingRaw);
        const incomingId =
            typeof incoming.id === 'undefined' || incoming.id === null
                ? generateAlgorithmImportCopyId(sectionName, usedIds)
                : incoming.id;
        const incomingIdKey = String(incomingId);
        const existingIndex = localIndexById.get(incomingIdKey);

        if (typeof existingIndex === 'undefined') {
            incoming.id = incomingId;
            result.push(incoming);
            usedIds.add(incomingIdKey);
            localIndexById.set(incomingIdKey, result.length - 1);
            algorithmIdMap.set(incomingIdKey, incoming.id);
            return;
        }

        const localItem = result[existingIndex];
        if (areRecordsSemanticallyEqual(localItem, incoming)) {
            algorithmIdMap.set(incomingIdKey, localItem.id);
            return;
        }

        if (policy === 'preferImport') {
            incoming.id = localItem.id;
            result[existingIndex] = incoming;
            algorithmIdMap.set(incomingIdKey, localItem.id);
            return;
        }

        if (policy === 'keepBoth') {
            const generatedId = generateAlgorithmImportCopyId(incomingIdKey, usedIds);
            incoming.id = generatedId;
            result.push(incoming);
            usedIds.add(generatedId);
            localIndexById.set(generatedId, result.length - 1);
            algorithmIdMap.set(incomingIdKey, generatedId);
            return;
        }

        algorithmIdMap.set(incomingIdKey, localItem.id);
    });

    return result;
}

function mergeAlgorithmsData(localDataRaw, importDataRaw, mergePolicy) {
    const localData = localDataRaw && typeof localDataRaw === 'object' ? localDataRaw : {};
    const importData = importDataRaw && typeof importDataRaw === 'object' ? importDataRaw : {};
    const policy = normalizeAlgorithmsMergePolicy(mergePolicy);

    const mergedData = {};
    const algorithmIdMap = new Map();

    const mergedMain = mergeMainAlgorithm(localData.main, importData.main, policy);
    if (mergedMain) {
        mergedData.main = mergedMain;
    }

    const sectionNames = new Set([
        ...Object.keys(localData || {}).filter((name) => name !== 'main'),
        ...Object.keys(importData || {}).filter((name) => name !== 'main'),
    ]);

    sectionNames.forEach((sectionName) => {
        const mergedSection = mergeAlgorithmSectionArray(
            sectionName,
            localData[sectionName],
            importData[sectionName],
            policy,
            algorithmIdMap,
        );
        mergedData[sectionName] = mergedSection;
    });

    return {
        mergedData,
        algorithmIdMap,
    };
}

// ============================================================================
// АНАЛИЗ ДАННЫХ ДЛЯ СЛИЯНИЯ
// ============================================================================

/**
 * Загружает «локальные» данные из IndexedDB по указанным store'ам.
 * @param {string[]} stores
 * @returns {Promise<Record<string, any[]>>}
 */
async function loadLocalDataForStores(stores) {
    const result = {};
    for (const storeName of stores) {
        try {
            result[storeName] = await getAllFromIndexedDB(storeName);
        } catch (e) {
            console.error(`[DbMerge] Ошибка чтения из хранилища ${storeName}:`, e);
            result[storeName] = [];
        }
    }
    return result;
}

/**
 * Строит «контекст имён» для identityKey (например, id папок -> имя папки).
 * @param {Record<string, any[]>} localData
 * @param {Record<string, any[]>} importData
 */
function buildIdentityContext(localData, importData) {
    const ctx = {
        bookmarkFolderIdToName: new Map(),
        extLinkCategoryIdToName: new Map(),
        reglamentCategoryIdToName: new Map(),
    };

    const allBookmarkFolders = [
        ...(localData.bookmarkFolders || []),
        ...(importData.bookmarkFolders || []),
    ];
    allBookmarkFolders.forEach((f) => {
        if (f && typeof f.id !== 'undefined') {
            ctx.bookmarkFolderIdToName.set(f.id, normalizeText(f.name));
        }
    });

    const allExtLinkCategories = [
        ...(localData.extLinkCategories || []),
        ...(importData.extLinkCategories || []),
    ];
    allExtLinkCategories.forEach((c) => {
        if (c && typeof c.id !== 'undefined') {
            ctx.extLinkCategoryIdToName.set(c.id, normalizeText(c.name));
        }
    });

    const allReglaments = [...(localData.reglaments || []), ...(importData.reglaments || [])];
    allReglaments.forEach((r) => {
        if (r && typeof r.category !== 'undefined') {
            ctx.reglamentCategoryIdToName.set(r.category, normalizeText(r.categoryName || ''));
        }
    });

    return ctx;
}

/**
 * Строит словарь identityKey -> запись для заданного store.
 * @param {string} storeName
 * @param {any[]} records
 * @param {Object} ctx
 */
function buildIdentityMap(storeName, records, ctx) {
    const config = MERGE_IDENTITY_CONFIG[storeName];
    const map = new Map();
    if (!config || !Array.isArray(records)) return map;
    const { identityKey } = config;
    records.forEach((record) => {
        try {
            const key = identityKey(record, ctx);
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, record);
            }
        } catch (e) {
            console.warn(`[DbMerge] Не удалось посчитать identityKey для ${storeName}:`, e, record);
        }
    });
    return map;
}

/**
 * Анализирует различия между локальными и импортируемыми данными по store.
 * @param {string} storeName
 * @param {any[]} localRecords
 * @param {any[]} importRecords
 * @param {Object} ctx
 */
function analyzeStoreDiff(storeName, localRecords, importRecords, ctx) {
    const identityConfig = MERGE_IDENTITY_CONFIG[storeName];
    if (!identityConfig) {
        return {
            storeName,
            localOnly: localRecords || [],
            importOnly: importRecords || [],
            identical: [],
            conflicts: [],
        };
    }

    const localMap = buildIdentityMap(storeName, localRecords || [], ctx);
    const importMap = buildIdentityMap(storeName, importRecords || [], ctx);

    const localOnly = [];
    const importOnly = [];
    const identical = [];
    const conflicts = [];

    const allKeys = new Set([...localMap.keys(), ...importMap.keys()]);

    allKeys.forEach((key) => {
        const localRec = localMap.get(key);
        const importRec = importMap.get(key);
        if (localRec && !importRec) {
            localOnly.push(localRec);
        } else if (!localRec && importRec) {
            importOnly.push(importRec);
        } else if (localRec && importRec) {
            if (areRecordsSemanticallyEqual(localRec, importRec)) {
                identical.push({
                    local: localRec,
                    incoming: importRec,
                    kind: CONFLICT_KIND.IDENTICAL,
                });
            } else {
                conflicts.push({
                    local: localRec,
                    incoming: importRec,
                    kind: CONFLICT_KIND.CONFLICT,
                });
            }
        }
    });

    return {
        storeName,
        localOnly,
        importOnly,
        identical,
        conflicts,
    };
}

/**
 * Результат анализа merge‑операции:
 *  - per-store диффы,
 *  - версия схемы файла,
 *  - список затронутых store'ов.
 */
export async function analyzeMergeData(importJsonString, options = {}) {
    const { stores = CONTENT_STORES } = options;

    let parsed;
    try {
        parsed = JSON.parse(importJsonString);
    } catch {
        throw new Error('Некорректный JSON файла слияния.');
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.data || !parsed.schemaVersion) {
        throw new Error('Некорректный формат файла слияния: ожидаются поля schemaVersion и data.');
    }

    const fileSchemaVersion = String(parsed.schemaVersion);
    if (fileSchemaVersion !== CURRENT_SCHEMA_VERSION) {
        console.warn(
            `[DbMerge] Версия схемы файла (${fileSchemaVersion}) отличается от версии приложения (${CURRENT_SCHEMA_VERSION}).`,
        );
        // Жёстко не запрещаем, так как import/export уже проверяют совместимость,
        // но помечаем в анализе.
    }

    const importDataRaw = parsed.data || {};

    const localData = await loadLocalDataForStores(stores);

    const importData = normalizeImportDataForMerge(importDataRaw, stores);

    const identityCtx = buildIdentityContext(localData, importData);

    const storeDiffs = stores.map((storeName) =>
        analyzeStoreDiff(storeName, localData[storeName], importData[storeName], identityCtx),
    );

    return {
        schemaVersion: fileSchemaVersion,
        expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
        storesAnalyzed: stores,
        storeDiffs,
    };
}

// ============================================================================
// ПРИМЕНЕНИЕ MERGE-ПЛАНА И РЕМАППИНГ ID
// ============================================================================

/**
 * Порядок применения с учётом зависимостей:
 *  - Сначала «родительские» сущности (папки и категории),
 *  - затем основные сущности (bookmarks, reglaments, extLinks),
 *  - затем favorites, pdfFiles, screenshots, которые ссылаются на них.
 */
const MERGE_APPLICATION_ORDER = [
    'algorithms',
    'bookmarkFolders',
    'extLinkCategories',
    'reglaments',
    'extLinks',
    'bookmarks',
    'favorites',
    'pdfFiles',
    'screenshots',
];

function cloneRecordForRollback(record) {
    return clonePlain(record);
}

async function createRollbackSnapshot(storeNames) {
    const snapshot = {};
    for (const storeName of storeNames) {
        snapshot[storeName] = await getAllFromIndexedDB(storeName);
    }
    return snapshot;
}

async function restoreRollbackSnapshot(snapshot, storeNames) {
    for (const storeName of storeNames) {
        await clearIndexedDBStore(storeName);
        const records = Array.isArray(snapshot[storeName]) ? snapshot[storeName] : [];
        for (const record of records) {
            await saveToIndexedDB(storeName, cloneRecordForRollback(record));
        }
    }
}

/**
 * Строит начальную структуру MergePlan из результата анализа и пользовательских
 * решений по конфликтам.
 *
 * userResolutions:
 *  - perStorePolicy: { [storeName]: 'keepLocal' | 'preferImport' | 'keepBoth' }
 *  - conflicts: { [storeName]: Array<{ localId, incomingId, resolution: 'local' | 'import' | 'both' }> }
 */
export function buildMergePlan(analysisResult, userResolutions) {
    const { storeDiffs } = analysisResult;
    const plan = {
        perStore: {},
    };

    const perStorePolicy = userResolutions?.perStorePolicy || {};
    const conflictChoices = userResolutions?.conflicts || {};

    storeDiffs.forEach((diff) => {
        const { storeName, localOnly, importOnly, conflicts } = diff;
        const storePolicy = perStorePolicy[storeName] || 'ask'; // 'ask' = только точечные решения
        const conflictResolutionList = conflictChoices[storeName] || [];
        const conflictResolutionByPair = new Map();

        conflictResolutionList.forEach((entry) => {
            const key = `${entry.localId}::${entry.incomingId}`;
            conflictResolutionByPair.set(key, entry.resolution);
        });

        const toInsert = [];
        const toUpdate = [];

        if (storeName === 'algorithms') {
            const firstConflict =
                Array.isArray(conflicts) && conflicts.length > 0 ? conflicts[0] : null;
            const localContainer = firstConflict?.local || localOnly?.[0] || null;
            const importContainer = firstConflict?.incoming || importOnly?.[0] || null;

            plan.perStore[storeName] = {
                storeName,
                localOnly,
                toInsert,
                toUpdate,
                mergeMode: storePolicy,
                localContainer,
                importContainer,
            };
            return;
        }

        // importOnly — всегда кандидаты на вставку
        importOnly.forEach((rec) => {
            toInsert.push({ record: rec });
        });

        // конфликты — в зависимости от глобальной/локальной политики и точечного выбора
        conflicts.forEach(({ local, incoming }) => {
            const compositeKey = `${local.id}::${incoming.id}`;
            const explicit = conflictResolutionByPair.get(compositeKey);
            const effectiveResolution = explicit || storePolicy;

            if (effectiveResolution === 'local' || effectiveResolution === 'keepLocal') {
                // Ничего не делаем – локальная запись остаётся как есть.
                return;
            }
            if (effectiveResolution === 'import' || effectiveResolution === 'preferImport') {
                toUpdate.push({ local, incoming });
                return;
            }
            if (effectiveResolution === 'both' || effectiveResolution === 'keepBoth') {
                // Сохраняем локальную и добавляем ещё одну копию как новую запись.
                toInsert.push({ record: incoming });
                return;
            }

            // По умолчанию — «спрашивать»: до тех пор, пока UI не примет решение,
            // конфликт остаётся нерешённым; для безопасности ничего не трогаем.
        });

        plan.perStore[storeName] = {
            storeName,
            localOnly,
            toInsert,
            toUpdate,
        };
    });

    return plan;
}

/**
 * Применяет MergePlan к IndexedDB с учётом зависимостей и ремаппинга ID.
 * Ожидается, что перед вызовом выполнен анализ и пользователь подтвердил
 * решения по конфликтам.
 *
 * Возвращает true при успешном завершении.
 */
export async function applyMergePlan(mergePlan) {
    if (!State.db) {
        throw new Error('База данных не инициализирована, слияние невозможно.');
    }
    if (!mergePlan || typeof mergePlan !== 'object') {
        throw new Error('Некорректный mergePlan.');
    }

    const idMapping = {
        algorithms: new Map(),
        bookmarkFolders: new Map(),
        extLinkCategories: new Map(),
        reglaments: new Map(),
        extLinks: new Map(),
        bookmarks: new Map(),
    };

    const withOverlay = async (fn, label) => {
        try {
            if (deps.loadingOverlayManager?.show) {
                deps.loadingOverlayManager.show(`Слияние данных: ${label || ''}`);
            }
            return await fn();
        } finally {
            if (deps.loadingOverlayManager?.hide) {
                deps.loadingOverlayManager.hide();
            }
        }
    };

    const storesWithChanges = MERGE_APPLICATION_ORDER.filter((storeName) => {
        const plan = mergePlan.perStore?.[storeName];
        if (!plan) return false;
        if (storeName === 'algorithms') {
            return !!(plan.localContainer || plan.importContainer);
        }
        return (plan.toInsert?.length || 0) > 0 || (plan.toUpdate?.length || 0) > 0;
    });
    const canCreateRollbackSnapshot =
        State.db &&
        State.db.objectStoreNames &&
        typeof State.db.objectStoreNames.contains === 'function';
    const rollbackSnapshot = canCreateRollbackSnapshot
        ? await createRollbackSnapshot(storesWithChanges)
        : {};

    const applyForStore = async (storeName, storePlan) => {
        if (!storePlan) return;

        const getMappedValue = (mapping, originalValue) => {
            if (typeof originalValue === 'undefined' || originalValue === null) return undefined;
            if (mapping.has(originalValue)) {
                return mapping.get(originalValue);
            }
            const asString = String(originalValue);
            if (mapping.has(asString)) {
                return mapping.get(asString);
            }
            return undefined;
        };

        const mapParentEntityId = (parentType, parentId) => {
            const normalizedType = normalizeText(parentType);
            if (normalizedType === 'algorithm') {
                return getMappedValue(idMapping.algorithms, parentId) ?? parentId;
            }
            return (
                getMappedValue(idMapping.bookmarks, parentId) ??
                getMappedValue(idMapping.extLinks, parentId) ??
                getMappedValue(idMapping.reglaments, parentId) ??
                parentId
            );
        };

        if (storeName === 'algorithms') {
            const localContainer = extractAlgorithmsContainerRecord(storePlan.localContainer);
            const importContainer = extractAlgorithmsContainerRecord(storePlan.importContainer);

            if (!importContainer && !localContainer) {
                return;
            }

            if (!localContainer && importContainer) {
                await saveToIndexedDB('algorithms', importContainer);
                return;
            }

            if (localContainer && !importContainer) {
                return;
            }

            const { mergedData, algorithmIdMap } = mergeAlgorithmsData(
                localContainer?.data,
                importContainer?.data,
                storePlan.mergeMode,
            );
            algorithmIdMap.forEach((mappedId, originalId) => {
                idMapping.algorithms.set(String(originalId), mappedId);
            });

            await saveToIndexedDB('algorithms', {
                section: 'all',
                data: mergedData,
            });
            return;
        }

        // Родительские store'ы – сначала создаём/обновляем их, собирая mapping.
        if (storeName === 'bookmarkFolders' || storeName === 'extLinkCategories') {
            for (const op of storePlan.toInsert) {
                const insertRecord = { ...op.record };
                delete insertRecord.id;
                delete insertRecord._id;
                const newId = await saveToIndexedDB(storeName, insertRecord);
                if (typeof op.record.id !== 'undefined') {
                    idMapping[storeName].set(op.record.id, newId);
                }
            }
            for (const op of storePlan.toUpdate) {
                const { local, incoming } = op;
                const updated = { ...incoming, id: local.id };
                await saveToIndexedDB(storeName, updated);
                if (typeof incoming.id !== 'undefined') {
                    idMapping[storeName].set(incoming.id, local.id);
                }
            }
            return;
        }

        if (storeName === 'reglaments' || storeName === 'extLinks' || storeName === 'bookmarks') {
            for (const op of storePlan.toInsert) {
                const incoming = { ...op.record };

                if (storeName === 'bookmarks' && typeof incoming.folder !== 'undefined') {
                    const mappedFolderId =
                        idMapping.bookmarkFolders.get(incoming.folder) ?? incoming.folder;
                    incoming.folder = mappedFolderId;
                }
                if (storeName === 'extLinks' && typeof incoming.category !== 'undefined') {
                    const mappedCategoryId =
                        idMapping.extLinkCategories.get(incoming.category) ?? incoming.category;
                    incoming.category = mappedCategoryId;
                }

                const originalId = incoming.id;
                delete incoming.id;
                const newId = await saveToIndexedDB(storeName, incoming);
                if (typeof originalId !== 'undefined') {
                    idMapping[storeName].set(originalId, newId);
                }
            }

            for (const op of storePlan.toUpdate) {
                const { local, incoming } = op;
                const updated = { ...incoming, id: local.id };

                if (storeName === 'bookmarks' && typeof updated.folder !== 'undefined') {
                    const mappedFolderId =
                        idMapping.bookmarkFolders.get(updated.folder) ?? updated.folder;
                    updated.folder = mappedFolderId;
                }
                if (storeName === 'extLinks' && typeof updated.category !== 'undefined') {
                    const mappedCategoryId =
                        idMapping.extLinkCategories.get(updated.category) ?? updated.category;
                    updated.category = mappedCategoryId;
                }

                await saveToIndexedDB(storeName, updated);
                if (typeof incoming.id !== 'undefined') {
                    idMapping[storeName].set(incoming.id, local.id);
                }
            }
            return;
        }

        if (storeName === 'favorites') {
            for (const op of storePlan.toInsert) {
                const incoming = { ...op.record };
                const mappedOriginalId =
                    getMappedValue(idMapping.algorithms, incoming.originalItemId) ??
                    getMappedValue(idMapping.bookmarks, incoming.originalItemId) ??
                    getMappedValue(idMapping.extLinks, incoming.originalItemId) ??
                    getMappedValue(idMapping.reglaments, incoming.originalItemId) ??
                    incoming.originalItemId;
                incoming.originalItemId = String(mappedOriginalId);
                delete incoming.id;
                await saveToIndexedDB('favorites', incoming);
            }

            for (const op of storePlan.toUpdate) {
                const { local, incoming } = op;
                const updated = { ...incoming, id: local.id };
                const mappedOriginalId =
                    getMappedValue(idMapping.algorithms, updated.originalItemId) ??
                    getMappedValue(idMapping.bookmarks, updated.originalItemId) ??
                    getMappedValue(idMapping.extLinks, updated.originalItemId) ??
                    getMappedValue(idMapping.reglaments, updated.originalItemId) ??
                    updated.originalItemId;
                updated.originalItemId = String(mappedOriginalId);
                await saveToIndexedDB('favorites', updated);
            }
            return;
        }

        if (storeName === 'pdfFiles') {
            for (const op of storePlan.toInsert) {
                const incoming = { ...op.record };
                const mappedParentId = mapParentEntityId(incoming.parentType, incoming.parentId);
                incoming.parentId = String(mappedParentId);
                delete incoming.id;
                await saveToIndexedDB('pdfFiles', incoming);
            }
            return;
        }

        if (storeName === 'screenshots') {
            // Для скриншотов просто переносим записи с ремаппингом parentId там, где это возможно.
            for (const op of storePlan.toInsert) {
                const incoming = { ...op.record };
                const mappedParentId = mapParentEntityId(incoming.parentType, incoming.parentId);
                incoming.parentId = mappedParentId;
                delete incoming.id;
                await saveToIndexedDB('screenshots', incoming);
            }
        }
    };

    try {
        await withOverlay(async () => {
            for (const storeName of MERGE_APPLICATION_ORDER) {
                await applyForStore(storeName, mergePlan.perStore[storeName]);
            }
        }, 'применение плана');
    } catch (applyError) {
        console.error('[DbMerge] Ошибка применения плана. Запуск аварийного отката...', applyError);
        if (canCreateRollbackSnapshot) {
            try {
                await withOverlay(async () => {
                    await restoreRollbackSnapshot(rollbackSnapshot, storesWithChanges);
                }, 'аварийное восстановление');
                deps.showNotification?.(
                    'Слияние прервано, данные восстановлены из предслияльного снимка.',
                    'warning',
                );
            } catch (rollbackError) {
                console.error(
                    '[DbMerge] Ошибка аварийного отката после сбоя merge:',
                    rollbackError,
                );
                deps.showNotification?.(
                    'Слияние завершилось ошибкой, и откат не удался. Восстановите базу из резервной копии.',
                    'error',
                );
            }
        }
        throw applyError;
    }

    // Обновление UI и поиска после успешного применения
    try {
        await Promise.all([
            deps.loadBookmarks?.(),
            deps.loadExtLinks?.(),
            deps.loadCibLinks?.(),
            deps.renderReglamentCategories?.(),
        ]);
        if (deps.buildInitialSearchIndex) {
            await deps.buildInitialSearchIndex();
        } else if (deps.initSearchSystem) {
            await deps.initSearchSystem();
        }
        deps.showNotification?.('Слияние баз данных успешно завершено.', 'success');
    } catch (e) {
        console.error('[DbMerge] Ошибка при обновлении UI/поиска после merge:', e);
        deps.showNotification?.(
            'Слияние выполнено, но обновление интерфейса завершилось с ошибкой. Проверьте консоль.',
            'warning',
        );
    }

    return true;
}

const CONFLICT_DIFF_IGNORED_FIELDS = new Set(['id', '_id', 'dateAdded', 'createdAt', 'updatedAt']);

function stableNormalizeValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => stableNormalizeValue(item));
    }
    if (value && typeof value === 'object') {
        const normalized = {};
        Object.keys(value)
            .sort()
            .forEach((key) => {
                normalized[key] = stableNormalizeValue(value[key]);
            });
        return normalized;
    }
    return value;
}

function areFieldValuesEqual(leftValue, rightValue) {
    return (
        JSON.stringify(stableNormalizeValue(leftValue)) ===
        JSON.stringify(stableNormalizeValue(rightValue))
    );
}

function truncateForConflictUi(text, maxLength = 220) {
    const value = String(text ?? '');
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
}

function formatConflictValueForUi(value, depth = 0) {
    if (value === null || typeof value === 'undefined') return '—';
    if (typeof value === 'string') {
        const compact = value.trim().replace(/\s+/g, ' ');
        return compact || '—';
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return 'Пустой список';
        if (depth >= 1) return `${value.length} элемент(ов)`;
        const formatted = value
            .slice(0, 4)
            .map((item) => formatConflictValueForUi(item, depth + 1))
            .join(' | ');
        const suffix = value.length > 4 ? ` | … (+${value.length - 4})` : '';
        return `${formatted}${suffix}`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return 'Пустой объект';
        if (depth >= 1) return `${entries.length} полей`;
        const formatted = entries
            .slice(0, 5)
            .map(
                ([key, nestedValue]) =>
                    `${key}: ${formatConflictValueForUi(nestedValue, depth + 1)}`,
            )
            .join('; ');
        const suffix = entries.length > 5 ? `; … (+${entries.length - 5})` : '';
        return `${formatted}${suffix}`;
    }
    return String(value);
}

function buildConflictDiffView(localRecord, incomingRecord) {
    const allKeys = new Set([
        ...Object.keys(localRecord || {}),
        ...Object.keys(incomingRecord || {}),
    ]);
    const sameFields = [];
    const differentFields = [];

    [...allKeys].sort().forEach((key) => {
        if (CONFLICT_DIFF_IGNORED_FIELDS.has(key)) return;
        const localValue = localRecord ? localRecord[key] : undefined;
        const incomingValue = incomingRecord ? incomingRecord[key] : undefined;
        const localUi = truncateForConflictUi(formatConflictValueForUi(localValue));
        const incomingUi = truncateForConflictUi(formatConflictValueForUi(incomingValue));
        const item = {
            key,
            localUi,
            incomingUi,
        };
        if (areFieldValuesEqual(localValue, incomingValue)) {
            sameFields.push(item);
        } else {
            differentFields.push(item);
        }
    });

    return {
        sameFields,
        differentFields,
    };
}

function getConflictRecordLabel(storeName, localRecord, incomingRecord) {
    const candidates = [
        localRecord?.title,
        incomingRecord?.title,
        localRecord?.name,
        incomingRecord?.name,
        localRecord?.filename,
        incomingRecord?.filename,
        localRecord?.url,
        incomingRecord?.url,
    ];
    const firstFilled = candidates.find((value) => typeof value === 'string' && value.trim());
    if (firstFilled) return truncateForConflictUi(firstFilled, 120);

    const localId =
        typeof localRecord?.id !== 'undefined' && localRecord?.id !== null
            ? `L#${localRecord.id}`
            : 'L#?';
    const incomingId =
        typeof incomingRecord?.id !== 'undefined' && incomingRecord?.id !== null
            ? `I#${incomingRecord.id}`
            : 'I#?';
    return `${storeName}: ${localId} / ${incomingId}`;
}

export const __dbMergeConflictUiInternals = {
    formatConflictValueForUi,
    buildConflictDiffView,
    getConflictRecordLabel,
};

export const __dbMergeScopeInternals = {
    resolveStoresFromSelectedScopes,
    buildScopeSelectionSummary,
};

function shouldShowFooterActions({ hasSelectedFileForAnalysis }) {
    return Boolean(hasSelectedFileForAnalysis);
}

export const __dbMergeUiInternals = {
    shouldShowFooterActions,
};

// ============================================================================
// ПУБЛИЧНЫЙ API ДЛЯ UI-МОДАЛКИ
// ============================================================================

/**
 * Открывает (или инициализирует) модальное окно слияния БД.
 * Конкретная верстка и логика шагов будут добавлены в следующих задачах.
 */
export function openDbMergeModal() {
    const existing = document.getElementById('dbMergeModal');
    if (!existing) {
        console.error(
            '[DbMerge] Модальное окно слияния (#dbMergeModal) не найдено. Проверьте разметку index.html.',
        );
        if (deps.showNotification) {
            deps.showNotification(
                'Не найдено окно слияния базы данных. Пожалуйста, обновите интерфейс.',
                'error',
            );
        }
        return;
    }
    if (!existing.classList.contains('hidden')) {
        return;
    }

    const closeButtons = existing.querySelectorAll('.db-merge-close-btn');
    closeButtons.forEach((btn) => {
        if (!btn._dbMergeCloseHandler) {
            btn._dbMergeCloseHandler = () => {
                existing.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
            };
            btn.addEventListener('click', btn._dbMergeCloseHandler);
        }
    });

    const fileInput = document.getElementById('dbMergeFileInput');
    const selectFileBtn = document.getElementById('dbMergeSelectFileBtn');
    const fileInfoEl = document.getElementById('dbMergeFileInfo');
    const analysisPlaceholder = document.getElementById('dbMergeAnalysisPlaceholder');
    const storesSummaryEl = document.getElementById('dbMergeStoresSummary');
    const overallStatsEl = document.getElementById('dbMergeOverallStats');
    const conflictsContainer = document.getElementById('dbMergeConflictsContainer');
    const progressBar = document.getElementById('dbMergeProgressBar');
    const progressText = document.getElementById('dbMergeProgressText');
    const cancelBtn = document.getElementById('dbMergeCancelBtn');
    const startBtn = document.getElementById('dbMergeStartBtn');
    const footerEl = existing.querySelector('.db-merge-footer');
    const stepBadges = document.querySelectorAll('#dbMergeStepBadges [data-step]');
    const scopeCheckboxes = existing.querySelectorAll('.db-merge-scope-checkbox');
    const scopeSummaryEl = document.getElementById('dbMergeScopeSummary');
    const stepSelect = document.getElementById('dbMergeStepSelect');
    const stepAnalyze = document.getElementById('dbMergeStepAnalyze');
    const stepResolve = document.getElementById('dbMergeStepResolve');
    const stepApply = document.getElementById('dbMergeStepApply');
    const globalPolicySelect = document.getElementById('dbMergeGlobalConflictPolicy');
    const FOOTER_MODE = {
        DEFAULT: 'default',
        COMPLETED: 'completed',
    };
    const initSplitters = () => {
        if (typeof deps.initDraggableVerticalSplitters === 'function') {
            deps.initDraggableVerticalSplitters(existing);
        }
    };

    const setStep = (step) => {
        stepBadges.forEach((badge) => {
            const badgeStep = badge.getAttribute('data-step');
            badge.classList.toggle('is-active', badgeStep === step);
        });
        stepSelect.classList.toggle('hidden', step !== 'select');
        stepAnalyze.classList.toggle('hidden', step !== 'analyze');
        stepResolve.classList.toggle('hidden', step !== 'resolve');
        stepApply.classList.toggle('hidden', step !== 'apply');
    };

    let lastAnalysis = null;
    let currentMergePlan = null;
    let footerMode = FOOTER_MODE.DEFAULT;
    let hasSelectedFileForAnalysis = false;

    const closeModal = () => {
        existing.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    };

    const setFooterMode = (mode) => {
        footerMode = mode;
        if (!startBtn || !cancelBtn) return;

        if (mode === FOOTER_MODE.COMPLETED) {
            cancelBtn.textContent = 'Новое слияние';
            startBtn.textContent = 'Закрыть';
            startBtn.disabled = false;
            return;
        }

        cancelBtn.textContent = 'Отмена';
        startBtn.textContent = 'Запустить слияние';
        startBtn.disabled = !lastAnalysis;
    };

    const syncFooterVisibility = () => {
        if (!footerEl) return;
        footerEl.classList.toggle(
            'hidden',
            !shouldShowFooterActions({ hasSelectedFileForAnalysis }),
        );
    };

    const renderStoresSummary = (analysis) => {
        if (!storesSummaryEl || !overallStatsEl) return;
        storesSummaryEl.innerHTML = '';
        let totalLocal = 0;
        let totalImport = 0;
        let totalConflicts = 0;

        analysis.storeDiffs.forEach((diff) => {
            const { storeName, localOnly, importOnly, conflicts, identical } = diff;
            const card = document.createElement('div');
            card.className = 'db-merge-store-card';
            card.innerHTML = `
                <div class="db-merge-store-card-head">
                    <span class="db-merge-store-name">${escapeHtml(storeName)}</span>
                    <div class="db-merge-store-badges">
                        <span class="db-merge-store-badge added">+${importOnly.length}</span>
                        <span class="db-merge-store-badge same">=${identical.length}</span>
                        <span class="db-merge-store-badge conflict">!${conflicts.length}</span>
                    </div>
                </div>
                <div class="db-merge-store-meta">
                    <span>Локальные: ${localOnly.length}</span>
                    <span class="db-merge-store-meta-sep"></span>
                    <span>Импорт: ${importOnly.length}</span>
                    <span class="db-merge-store-meta-sep"></span>
                    <span>Конфликтов: ${conflicts.length}</span>
                </div>
            `;
            storesSummaryEl.appendChild(card);

            totalLocal += localOnly.length;
            totalImport += importOnly.length;
            totalConflicts += conflicts.length;
        });

        overallStatsEl.textContent = `Локальных: ${totalLocal} · Новых из файла: ${totalImport} · Конфликтов: ${totalConflicts}`;
    };

    const renderConflicts = (analysis) => {
        if (!conflictsContainer) return;
        conflictsContainer.innerHTML = '';

        analysis.storeDiffs.forEach((diff) => {
            if (!diff.conflicts || diff.conflicts.length === 0) return;
            const wrapper = document.createElement('details');
            wrapper.className = 'db-merge-conflict-group';
            wrapper.open = true;
            const summary = document.createElement('summary');
            summary.innerHTML = `
                <span><i class="fas fa-exchange-alt mr-1" aria-hidden="true"></i>${escapeHtml(diff.storeName)}</span>
                <span class="db-merge-conflict-group-count">${diff.conflicts.length} конфликт(ов)</span>
            `;
            wrapper.appendChild(summary);

            const list = document.createElement('div');
            list.className = 'db-merge-conflict-list';

            diff.conflicts.forEach(({ local, incoming }) => {
                const diffView = buildConflictDiffView(local, incoming);
                const duplicateFieldsHtml =
                    diffView.sameFields.length > 0
                        ? diffView.sameFields
                              .slice(0, 8)
                              .map(
                                  ({ key }) =>
                                      `<span class="db-merge-duplicate-chip">${escapeHtml(key)}</span>`,
                              )
                              .join('')
                        : '<span class="db-merge-duplicate-chip is-empty">Нет совпадающих полей</span>';

                const localDiffRowsHtml =
                    diffView.differentFields.length > 0
                        ? diffView.differentFields
                              .map(
                                  ({ key, localUi }) => `
                                    <div class="db-merge-conflict-field-row is-different">
                                        <div class="db-merge-conflict-field-name">${escapeHtml(key)}</div>
                                        <div class="db-merge-conflict-field-value">${escapeHtml(localUi)}</div>
                                    </div>
                                `,
                              )
                              .join('')
                        : '<div class="db-merge-conflict-field-row is-empty"><div class="db-merge-conflict-field-value">Нет различий</div></div>';

                const incomingDiffRowsHtml =
                    diffView.differentFields.length > 0
                        ? diffView.differentFields
                              .map(
                                  ({ key, incomingUi }) => `
                                    <div class="db-merge-conflict-field-row is-different">
                                        <div class="db-merge-conflict-field-name">${escapeHtml(key)}</div>
                                        <div class="db-merge-conflict-field-value">${escapeHtml(incomingUi)}</div>
                                    </div>
                                `,
                              )
                              .join('')
                        : '<div class="db-merge-conflict-field-row is-empty"><div class="db-merge-conflict-field-value">Нет различий</div></div>';

                const conflictLabel = getConflictRecordLabel(diff.storeName, local, incoming);
                const row = document.createElement('div');
                row.className = 'db-merge-conflict-row';
                row.dataset.storeName = diff.storeName;
                row.dataset.localId = local.id;
                row.dataset.incomingId = incoming.id;
                row.innerHTML = `
                    <div class="db-merge-conflict-row-head">
                        <span class="db-merge-conflict-row-title">Конфликт дубликата: ${escapeHtml(conflictLabel)}</span>
                        <div class="db-merge-choice-btns">
                            <button type="button" class="db-merge-choice-btn db-merge-choice-btn-local" data-choice="local">Локальная</button>
                            <button type="button" class="db-merge-choice-btn db-merge-choice-btn-import" data-choice="import">Импорт</button>
                            <button type="button" class="db-merge-choice-btn db-merge-choice-btn-both" data-choice="both">Обе</button>
                        </div>
                    </div>
                    <div class="db-merge-conflict-duplicate-block">
                        <div class="db-merge-conflict-duplicate-title">
                            <i class="fas fa-clone" aria-hidden="true"></i>
                            Что дублируется
                        </div>
                        <div class="db-merge-conflict-duplicate-fields">${duplicateFieldsHtml}</div>
                    </div>
                    <div
                        class="db-merge-conflict-panes db-merge-split-layout js-draggable-split"
                        data-split-min-left="220"
                        data-split-min-right="220"
                    >
                        <div class="db-merge-conflict-pane local" data-split-pane="left">
                            <div class="db-merge-conflict-pane-label">
                                Локальная версия
                                <span class="db-merge-conflict-diff-count">Отличий: ${diffView.differentFields.length}</span>
                            </div>
                            <div class="db-merge-conflict-field-list">${localDiffRowsHtml}</div>
                        </div>
                        <div
                            class="db-merge-vertical-splitter db-merge-vertical-splitter--inner js-draggable-splitter"
                            role="separator"
                            aria-label="Изменить ширину сравнения"
                            aria-orientation="vertical"
                            tabindex="0"
                        ></div>
                        <div class="db-merge-conflict-pane import" data-split-pane="right">
                            <div class="db-merge-conflict-pane-label">
                                Импортируемая версия
                                <span class="db-merge-conflict-diff-count">Отличий: ${diffView.differentFields.length}</span>
                            </div>
                            <div class="db-merge-conflict-field-list">${incomingDiffRowsHtml}</div>
                        </div>
                    </div>
                `;
                const buttons = row.querySelectorAll('.db-merge-choice-btn');
                buttons.forEach((btn) => {
                    btn.addEventListener('click', () => {
                        buttons.forEach((b) => b.classList.remove('is-selected'));
                        btn.classList.add('is-selected');
                        row.dataset.resolution = btn.getAttribute('data-choice');
                    });
                });
                list.appendChild(row);
            });

            wrapper.appendChild(list);
            conflictsContainer.appendChild(wrapper);
        });

        initSplitters();
    };

    const collectUserResolutions = () => {
        const perStorePolicy = {};
        const conflicts = {};

        const globalPolicy = globalPolicySelect?.value || 'ask';
        if (lastAnalysis) {
            lastAnalysis.storeDiffs.forEach((diff) => {
                perStorePolicy[diff.storeName] = globalPolicy;
            });
        }

        if (conflictsContainer) {
            const rows = conflictsContainer.querySelectorAll('[data-store-name]');
            rows.forEach((row) => {
                const storeName = row.dataset.storeName;
                const localId = row.dataset.localId;
                const incomingId = row.dataset.incomingId;
                const resolution = row.dataset.resolution;
                if (!resolution) return;
                if (!conflicts[storeName]) conflicts[storeName] = [];
                conflicts[storeName].push({ localId, incomingId, resolution });
            });
        }

        return { perStorePolicy, conflicts };
    };

    const animateProgress = (targetPercent, label) => {
        if (!progressBar || !progressText) return;
        const clamped = Math.max(0, Math.min(100, targetPercent));
        progressBar.style.width = `${clamped}%`;
        progressBar.style.transition = 'width 220ms ease-out';
        progressText.textContent = label || `Прогресс: ${clamped.toFixed(0)}%`;
    };

    const getSelectedScopeValues = () =>
        Array.from(scopeCheckboxes)
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => String(checkbox.value || '').trim())
            .filter(Boolean);

    const getSelectedStores = () => resolveStoresFromSelectedScopes(getSelectedScopeValues());

    const renderScopeSummary = () => {
        if (!scopeSummaryEl) return;
        const summary = buildScopeSelectionSummary(getSelectedScopeValues());
        if (summary.scopeCount === 0 || summary.storeCount === 0) {
            scopeSummaryEl.textContent = 'Разделы не выбраны: анализ и слияние недоступны.';
            scopeSummaryEl.classList.add('text-amber-600', 'dark:text-amber-300');
            return;
        }
        scopeSummaryEl.textContent = `Выбрано разделов: ${summary.scopeCount} · хранилищ: ${summary.storeCount}`;
        scopeSummaryEl.classList.remove('text-amber-600', 'dark:text-amber-300');
    };

    const clearAnalysisArtifacts = () => {
        if (storesSummaryEl) storesSummaryEl.innerHTML = '';
        if (overallStatsEl) overallStatsEl.textContent = '';
        if (conflictsContainer) conflictsContainer.innerHTML = '';
    };

    const invalidateAnalysisByScopeChange = () => {
        lastAnalysis = null;
        currentMergePlan = null;
        hasSelectedFileForAnalysis = false;
        clearAnalysisArtifacts();
        if (analysisPlaceholder) {
            analysisPlaceholder.textContent =
                'Параметры слияния изменены. Запустите анализ файла заново.';
        }
        setStep('select');
        animateProgress(0, 'Параметры изменены. Готово к повторному анализу.');
        setFooterMode(FOOTER_MODE.DEFAULT);
        syncFooterVisibility();
    };

    const resetMergeFlow = () => {
        lastAnalysis = null;
        currentMergePlan = null;
        hasSelectedFileForAnalysis = false;
        if (fileInput) fileInput.value = '';
        if (fileInfoEl) {
            fileInfoEl.classList.add('hidden');
            fileInfoEl.textContent = '';
        }
        if (analysisPlaceholder) {
            analysisPlaceholder.textContent =
                'После выбора файла будет выполнен предварительный анализ отличий по разделам.';
        }
        clearAnalysisArtifacts();
        if (globalPolicySelect) globalPolicySelect.value = 'ask';
        renderScopeSummary();

        setStep('select');
        animateProgress(0, 'Готово к выбору файла для слияния.');
        setFooterMode(FOOTER_MODE.DEFAULT);
        syncFooterVisibility();
    };

    const runAnalysis = async (file) => {
        if (!fileInfoEl || !analysisPlaceholder) return;
        fileInfoEl.classList.remove('hidden');
        fileInfoEl.textContent = `Файл: ${file.name} (${(file.size / 1024).toFixed(1)} КБ)`;
        analysisPlaceholder.textContent = 'Выполняется анализ структуры и дублей…';

        const text = await file.text();
        const selectedStores = getSelectedStores();
        if (selectedStores.length === 0) {
            throw new Error('DbMergeScopeEmpty');
        }
        const analysis = await analyzeMergeData(text, { stores: selectedStores });
        lastAnalysis = analysis;
        renderStoresSummary(analysis);
        renderConflicts(analysis);
        analysisPlaceholder.textContent =
            'Анализ выполнен. Проверьте сводку по разделам и конфликты.';
        setStep('analyze');

        const anyConflicts = analysis.storeDiffs.some(
            (d) => Array.isArray(d.conflicts) && d.conflicts.length > 0,
        );
        if (anyConflicts) {
            setStep('resolve');
        } else {
            setStep('apply');
        }

        setFooterMode(FOOTER_MODE.DEFAULT);
        animateProgress(0, 'Готово к запуску слияния.');
    };

    if (selectFileBtn && fileInput && !selectFileBtn._dbMergeFileHandler) {
        selectFileBtn._dbMergeFileHandler = () => {
            fileInput.value = '';
            fileInput.click();
        };
        selectFileBtn.addEventListener('click', selectFileBtn._dbMergeFileHandler);
    }

    if (fileInput && !fileInput._dbMergeChangeHandler) {
        fileInput._dbMergeChangeHandler = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            hasSelectedFileForAnalysis = true;
            setStep('select');
            setFooterMode(FOOTER_MODE.DEFAULT);
            syncFooterVisibility();
            conflictsContainer && (conflictsContainer.innerHTML = '');
            storesSummaryEl && (storesSummaryEl.innerHTML = '');
            overallStatsEl && (overallStatsEl.textContent = '');
            animateProgress(0, 'Подготовка к анализу…');
            runAnalysis(file).catch((err) => {
                console.error('[DbMerge] Ошибка анализа файла слияния:', err);
                if (deps.showNotification) {
                    if (err?.message === 'DbMergeScopeEmpty') {
                        deps.showNotification(
                            'Выберите хотя бы один раздел для слияния перед анализом.',
                            'warning',
                        );
                        animateProgress(0, 'Выберите разделы для анализа.');
                        setFooterMode(FOOTER_MODE.DEFAULT);
                        return;
                    }
                    deps.showNotification(
                        'Ошибка при анализе файла слияния. Проверьте формат файла.',
                        'error',
                    );
                }
                animateProgress(0, 'Ошибка анализа файла.');
                setFooterMode(FOOTER_MODE.DEFAULT);
            });
        };
        fileInput.addEventListener('change', fileInput._dbMergeChangeHandler);
    }

    scopeCheckboxes.forEach((checkbox) => {
        if (checkbox._dbMergeScopeChangeHandler) return;
        checkbox._dbMergeScopeChangeHandler = () => {
            renderScopeSummary();
            invalidateAnalysisByScopeChange();
        };
        checkbox.addEventListener('change', checkbox._dbMergeScopeChangeHandler);
    });

    if (cancelBtn && !cancelBtn._dbMergeFooterCancelHandler) {
        cancelBtn._dbMergeFooterCancelHandler = () => {
            if (footerMode === FOOTER_MODE.COMPLETED) {
                resetMergeFlow();
                return;
            }
            closeModal();
        };
        cancelBtn.addEventListener('click', cancelBtn._dbMergeFooterCancelHandler);
    }

    if (startBtn && !startBtn._dbMergeStartHandler) {
        startBtn._dbMergeStartHandler = async () => {
            if (footerMode === FOOTER_MODE.COMPLETED) {
                closeModal();
                return;
            }
            if (!lastAnalysis) return;
            if (typeof deps.exportAllData !== 'function') {
                deps.showNotification?.('Экспорт данных не доступен. Слияние отключено.', 'error');
                return;
            }
            setStep('apply');
            animateProgress(5, 'Создание резервной копии текущей базы…');
            let backupOk = false;
            try {
                const exportOutcome = await deps.exportAllData({ isForcedBackupMode: true });
                if (
                    typeof exportOutcome === 'object' &&
                    exportOutcome &&
                    exportOutcome.errorType === 'UserGestureRequired'
                ) {
                    deps.showNotification?.(
                        'Сохраните резервную копию вручную (Экспорт данных), затем повторите слияние.',
                        'error',
                    );
                    animateProgress(0, 'Требуется ручной экспорт.');
                    return;
                }
                backupOk = exportOutcome === true;
            } catch (e) {
                console.error('[DbMerge] Ошибка при создании бэкапа:', e);
                deps.showNotification?.(
                    'Не удалось создать резервную копию. Слияние отменено.',
                    'error',
                );
                animateProgress(0, 'Ошибка резервного копирования.');
                return;
            }
            if (!backupOk) {
                deps.showNotification?.(
                    'Резервная копия не создана или отменена. Слияние невозможно.',
                    'error',
                );
                animateProgress(0, 'Слияние отменено: нет бэкапа.');
                return;
            }
            const resolutions = collectUserResolutions();
            currentMergePlan = buildMergePlan(lastAnalysis, resolutions);
            animateProgress(10, 'Подготовка плана слияния…');
            try {
                await applyMergePlan(currentMergePlan);
                animateProgress(100, 'Слияние успешно завершено.');
                setFooterMode(FOOTER_MODE.COMPLETED);
            } catch (e) {
                console.error('[DbMerge] Ошибка при применении плана слияния:', e);
                deps.showNotification?.('Ошибка при слиянии. Подробности в консоли.', 'error');
                animateProgress(0, 'Ошибка слияния.');
                setFooterMode(FOOTER_MODE.DEFAULT);
            }
        };
        startBtn.addEventListener('click', startBtn._dbMergeStartHandler);
    }

    resetMergeFlow();
    existing.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    initSplitters();
}
