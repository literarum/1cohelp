'use strict';

import { DB_NAME, DB_VERSION } from '../constants.js';
import { storeConfigs } from './stores.js';
import { State } from '../app/state.js';

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ============================================================================

/**
 * Инициализирует базу данных IndexedDB
 */
export function initDB() {
    if (typeof State.db !== 'undefined' && State.db && typeof State.db.close === 'function') {
        try {
            console.log(
                `[initDB] Обнаружено существующее соединение с БД (статус: ${
                    State.db.connections ? 'есть информация о соединениях' : 'нет информации'
                }). Попытка закрыть...`,
            );
            State.db.close();
            console.log('[initDB] Существующее соединение с БД закрыто перед новым открытием.');
            State.db = null;
        } catch (e) {
            console.warn('[initDB] Ошибка при попытке закрыть существующее соединение:', e);
        }
    }

    return new Promise((resolve, reject) => {
        console.log(
            `[initDB] Попытка открытия/создания базы данных ${DB_NAME} версии ${DB_VERSION}`,
        );
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onblocked = (e) => {
            console.error(
                `[initDB] Открытие IndexedDB ЗАБЛОКИРОВАНО. Old version: ${e.oldVersion}, New version: ${e.newVersion}. Event:`,
                e,
            );
            const errorMessage = `Открытие базы данных ${DB_NAME} (v${DB_VERSION}) заблокировано. Это обычно происходит, если в другой вкладке открыта более старая версия базы данных. Пожалуйста, закройте все остальные вкладки с этим приложением и обновите эту страницу.`;
            if (typeof window.showNotification === 'function') {
                window.showNotification(errorMessage, 'error', 30000);
            }

            reject(new Error(errorMessage));
        };

        request.onerror = (e) => {
            console.error('[initDB] Ошибка IndexedDB при открытии:', e.target.error, 'Event:', e);
            reject(
                `Не удалось открыть базу данных: ${
                    e.target.error?.message || 'Неизвестная ошибка'
                }. Используется резервное хранилище.`,
            );
        };

        request.onsuccess = (e) => {
            const dbInstance = e.target.result;

            State.db = dbInstance;
            console.log("[initDB] База данных успешно открыта и глобальная 'db' обновлена.");

            dbInstance.onerror = (ev) => {
                console.error(
                    '[initDB] Ошибка базы данных (db.onerror):',
                    ev.target.error,
                    'Event:',
                    ev,
                );
            };

            dbInstance.onversionchange = (event) => {
                console.warn(
                    `[DB onversionchange] Обнаружено изменение версии БД (old: ${event.oldVersion}, new: ${event.newVersion}). Закрытие текущего соединения...`,
                );
                if (State.db) {
                    State.db.close();
                    State.db = null;
                    console.warn(
                        '[DB onversionchange] Соединение закрыто. Пожалуйста, перезагрузите страницу или повторите операцию.',
                    );
                    if (typeof window.showNotification === 'function') {
                        window.showNotification(
                            'Структура базы данных изменилась в другой вкладке. Соединение было закрыто. Пожалуйста, перезагрузите страницу.',
                            'warning',
                            10000,
                        );
                    }
                } else {
                    console.warn(
                        "[DB onversionchange] Событие получено, но 'db' уже null. Ничего не делаем.",
                    );
                }
            };

            console.log('[initDB] Процесс initDB завершен успешно, база данных готова.');
            resolve(dbInstance);
        };

        request.onupgradeneeded = (e) => {
            const currentDb = e.target.result;
            const transaction = e.target.transaction;
            console.log(
                `[initDB - onupgradeneeded] Обновление базы данных с версии ${e.oldVersion} до ${e.newVersion}`,
            );

            try {
                sessionStorage.setItem('dbJustUpgraded', 'true');
                console.log(
                    "[initDB - onupgradeneeded] Установлен флаг 'dbJustUpgraded' в sessionStorage.",
                );
            } catch (storageError) {
                console.error(
                    '[initDB - onupgradeneeded] Не удалось установить флаг в sessionStorage:',
                    storageError,
                );
            }

            if (!transaction) {
                console.error(
                    '[initDB - onupgradeneeded] КРИТИЧЕСКАЯ ОШИБКА: транзакция (e.target.transaction) недоступна!',
                );

                if (typeof reject === 'function') {
                    reject(new Error('Внутренняя ошибка: транзакция обновления БД недоступна.'));
                }
                return;
            }

            transaction.oncomplete = () => {
                console.log(
                    `[initDB - onupgradeneeded] Транзакция обновления для версии ${e.newVersion} успешно ЗАВЕРШЕНА.`,
                );
            };

            transaction.onerror = (event) => {
                console.error(
                    '[initDB - onupgradeneeded] Ошибка транзакции обновления базы данных:',
                    event.target.error,
                    'Event:',
                    event,
                );
            };
            transaction.onabort = (event) => {
                console.warn(
                    '[initDB - onupgradeneeded] Транзакция обновления базы данных прервана:',
                    event.target.error,
                    'Event:',
                    event,
                );
            };

            storeConfigs.forEach((config) => {
                if (!currentDb.objectStoreNames.contains(config.name)) {
                    console.log(`[onupgradeneeded] Создание хранилища объектов: ${config.name}`);
                    try {
                        const store = currentDb.createObjectStore(config.name, config.options);
                        config.indexes?.forEach((index) => {
                            console.log(
                                `[onupgradeneeded] Создание индекса '${index.name}' в хранилище '${config.name}'`,
                            );
                            store.createIndex(index.name, index.keyPath, index.options || {});
                        });
                    } catch (createStoreError) {
                        console.error(
                            `[onupgradeneeded] Ошибка при создании хранилища ${config.name} или его индексов:`,
                            createStoreError,
                        );
                    }
                } else {
                    console.log(
                        `[onupgradeneeded] Хранилище объектов '${config.name}' уже существует. Попытка обновить индексы...`,
                    );

                    const store = transaction.objectStore(config.name);
                    if (config.indexes) {
                        config.indexes.forEach((index) => {
                            if (!store.indexNames.contains(index.name)) {
                                console.log(
                                    `[onupgradeneeded] Создание отсутствующего индекса '${index.name}' в существующем хранилище '${config.name}'`,
                                );
                                try {
                                    store.createIndex(
                                        index.name,
                                        index.keyPath,
                                        index.options || {},
                                    );
                                } catch (createIndexError) {
                                    console.error(
                                        `[onupgradeneeded] Не удалось создать индекс '${index.name}' в '${config.name}':`,
                                        createIndexError,
                                    );
                                }
                            }
                        });
                    }

                    if (config.name === 'screenshots' && e.oldVersion < 4) {
                        console.log(
                            `[onupgradeneeded] Обновление хранилища 'screenshots' с v${e.oldVersion} до v${DB_VERSION}.`,
                        );
                        const screenshotsStore = transaction.objectStore('screenshots');
                        if (screenshotsStore.indexNames.contains('algorithmId')) {
                            console.log(
                                `[onupgradeneeded] Удаление старого индекса 'algorithmId' из 'screenshots'.`,
                            );
                            try {
                                screenshotsStore.deleteIndex('algorithmId');
                            } catch (deleteIndexError) {
                                console.warn(
                                    "[onupgradeneeded] Не удалось удалить индекс 'algorithmId' (возможно, уже удален):",
                                    deleteIndexError,
                                );
                            }
                        }
                        if (!screenshotsStore.indexNames.contains('parentId')) {
                            console.log(
                                `[onupgradeneeded] Создание нового индекса 'parentId' в 'screenshots'.`,
                            );
                            try {
                                screenshotsStore.createIndex('parentId', 'parentId', {
                                    unique: false,
                                });
                            } catch (createParentIdIndexError) {
                                console.error(
                                    "[onupgradeneeded] Не удалось создать индекс 'parentId' в 'screenshots':",
                                    createParentIdIndexError,
                                );
                            }
                        }
                        if (!screenshotsStore.indexNames.contains('parentType')) {
                            console.log(
                                `[onupgradeneeded] Создание нового индекса 'parentType' в 'screenshots'.`,
                            );
                            try {
                                screenshotsStore.createIndex('parentType', 'parentType', {
                                    unique: false,
                                });
                            } catch (createParentTypeIndexError) {
                                console.error(
                                    "[onupgradeneeded] Не удалось создать индекс 'parentType' в 'screenshots':",
                                    createParentTypeIndexError,
                                );
                            }
                        }
                    }
                }
            });

            if (e.oldVersion < 5) {
                if (currentDb.objectStoreNames.contains('searchIndex')) {
                    console.log(
                        `[onupgradeneeded] Удаление существующего хранилища 'searchIndex' для перестроения из-за изменений в токенизации (oldVersion: ${e.oldVersion}, newVersion: ${e.newVersion}).`,
                    );
                    try {
                        currentDb.deleteObjectStore('searchIndex');
                        console.log("[onupgradeneeded] Хранилище 'searchIndex' успешно удалено.");
                        const searchIndexConfig = storeConfigs.find(
                            (sc) => sc.name === 'searchIndex',
                        );
                        if (
                            searchIndexConfig &&
                            !currentDb.objectStoreNames.contains('searchIndex')
                        ) {
                            console.log(
                                `[onupgradeneeded] Повторное создание хранилища 'searchIndex' после удаления.`,
                            );
                            const store = currentDb.createObjectStore(
                                searchIndexConfig.name,
                                searchIndexConfig.options,
                            );
                            searchIndexConfig.indexes?.forEach((index) => {
                                store.createIndex(index.name, index.keyPath, index.options || {});
                            });
                        }
                    } catch (deleteSearchIndexError) {
                        console.error(
                            "[onupgradeneeded] Ошибка при удалении/пересоздании хранилища 'searchIndex':",
                            deleteSearchIndexError,
                        );
                    }
                } else {
                    console.log(
                        "[onupgradeneeded] Хранилище 'searchIndex' не найдено, удаление не требуется (возможно, первая установка или уже было удалено).",
                    );
                }
            }
            console.log(
                '[initDB - onupgradeneeded] Обновление структуры базы данных (onupgradeneeded) завершено на этом шаге.',
            );
        };
    });
}

// ============================================================================
// БАЗОВЫЕ ОПЕРАЦИИ С БАЗОЙ ДАННЫХ
// ============================================================================

/**
 * Выполняет операцию с базой данных
 */
export function performDBOperation(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
        if (!State.db) {
            console.error(
                `performDBOperation: База данных (db) не инициализирована! Store: ${storeName}, Mode: ${mode}`,
            );
            return reject(new Error('База данных не инициализирована'));
        }
        try {
            if (!State.db.objectStoreNames.contains(storeName)) {
                const errorMsg = `Хранилище объектов '${storeName}' не найдено в базе данных. Доступные: ${Array.from(
                    State.db.objectStoreNames,
                ).join(', ')}`;
                console.error(`performDBOperation: ${errorMsg}`);
                return reject(new Error(errorMsg));
            }

            const transaction = State.db.transaction(storeName, mode);

            transaction.oncomplete = () => {};
            transaction.onerror = (e) => {
                const error = e.target.error;
                const errorDetails = error
                    ? `${error.name}: ${error.message}`
                    : 'Неизвестная ошибка транзакции';
                console.error(
                    `performDBOperation: Ошибка транзакции для '${storeName}' (mode: ${mode}). Детали: ${errorDetails}`,
                    error,
                );

                reject(error || new Error(`Ошибка транзакции для ${storeName}: ${errorDetails}`));
            };
            transaction.onabort = (e) => {
                const error = e.target.error;
                const errorDetails = error
                    ? `${error.name}: ${error.message}`
                    : 'Транзакция прервана без явной ошибки';
                console.warn(
                    `performDBOperation: Транзакция для '${storeName}' (mode: ${mode}) ПРЕРВАНА. Детали: ${errorDetails}`,
                    error,
                );
                reject(error || new Error(`Транзакция для ${storeName} прервана: ${errorDetails}`));
            };

            const store = transaction.objectStore(storeName);
            const request = operation(store);

            if (!(request instanceof IDBRequest)) {
                console.error(
                    `performDBOperation: Колбэк 'operation' не вернул IDBRequest для ${storeName}. Вернул:`,
                    request,
                );
                return reject(
                    new Error(`Внутренняя ошибка: операция для ${storeName} не вернула запрос.`),
                );
            }

            request.onsuccess = (e) => {
                resolve(e.target.result);
            };
            request.onerror = (e) => {
                const error = e.target.error;
                const errorDetails = error
                    ? `${error.name}: ${error.message}`
                    : 'Неизвестная ошибка запроса';
                console.error(
                    `performDBOperation: Ошибка запроса к хранилищу '${storeName}' (mode: ${mode}). Детали: ${errorDetails}`,
                    error,
                );
                reject(error || new Error(`Ошибка запроса к ${storeName}: ${errorDetails}`));
            };
        } catch (error) {
            console.error(
                `performDBOperation: Исключение при попытке выполнить операцию для '${storeName}' (mode: ${mode}).`,
                error,
            );
            reject(error);
        }
    });
}

/**
 * Получает все записи из хранилища
 */
export function getAllFromIndexedDB(storeName) {
    console.log(`[getAllFromIndexedDB V3] Запрос всех данных из хранилища: ${storeName}`);
    return performDBOperation(storeName, 'readonly', (store) => store.getAll())
        .then((results) => {
            console.log(
                `[getAllFromIndexedDB V3] Успешно получено ${
                    results?.length ?? 0
                } записей из ${storeName}.`,
            );
            if (results && results.length > 0) {
                const firstItemPreview = { ...results[0] };
                if (firstItemPreview.content)
                    firstItemPreview.content = firstItemPreview.content.substring(0, 50) + '...';
                if (firstItemPreview.steps && Array.isArray(firstItemPreview.steps))
                    firstItemPreview.steps = `[${firstItemPreview.steps.length} steps]`;
                if (firstItemPreview.notes)
                    firstItemPreview.notes = firstItemPreview.notes.substring(0, 50) + '...';
                console.log(
                    `[getAllFromIndexedDB V3 DEBUG] Первый элемент из ${storeName}:`,
                    JSON.parse(JSON.stringify(firstItemPreview)),
                );
            }
            return results || [];
        })
        .catch((error) => {
            console.error(
                `[getAllFromIndexedDB V3] Ошибка при получении данных из ${storeName}:`,
                error,
            );
            throw error;
        });
}

/**
 * Сохраняет данные в хранилище
 */
export function saveToIndexedDB(storeName, data, key = null) {
    return performDBOperation(storeName, 'readwrite', (store) =>
        store.put(data, ...(key !== null ? [key] : [])),
    );
}

/**
 * Получает одну запись из хранилища по ключу
 */
export function getFromIndexedDB(storeName, key) {
    const storeConfig = storeConfigs.find((sc) => sc.name === storeName);
    let keyToUse = key;

    if (storeConfig && storeConfig.options && storeConfig.options.autoIncrement) {
        if (typeof key === 'string') {
            const parsedKey = parseInt(key, 10);

            if (!isNaN(parsedKey) && String(parsedKey) === key) {
                keyToUse = parsedKey;
            }
        }
    }
    return performDBOperation(storeName, 'readonly', (store) => store.get(keyToUse));
}

/**
 * Удаляет запись из хранилища по ключу
 */
export function deleteFromIndexedDB(storeName, key) {
    const storeConfig = storeConfigs.find((sc) => sc.name === storeName);
    let keyToUse = key;
    if (storeConfig && storeConfig.options && storeConfig.options.autoIncrement) {
        if (typeof key === 'string') {
            const parsedKey = parseInt(key, 10);
            if (!isNaN(parsedKey) && String(parsedKey) === key) {
                keyToUse = parsedKey;
            }
        }
    }
    return performDBOperation(storeName, 'readwrite', (store) => store.delete(keyToUse));
}

/**
 * Очищает всё хранилище
 */
export function clearIndexedDBStore(storeName) {
    return performDBOperation(storeName, 'readwrite', (store) => store.clear());
}

/**
 * Получает записи из хранилища по индексу
 */
export async function getAllFromIndex(storeName, indexName, indexValue) {
    return performDBOperation(storeName, 'readonly', (store) => {
        const index = store.index(indexName);
        return index.getAll(indexValue);
    });
}
