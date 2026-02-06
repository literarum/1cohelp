'use strict';

/**
 * Модуль загрузки и сохранения данных приложения.
 * Вынесен из script.js для уменьшения мегафайла и улучшения модульности.
 */

import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { State } from './state.js';

let dependencies = {};

/**
 * Устанавливает зависимости для модуля data-loader
 */
export function setDataLoaderDependencies(deps) {
    dependencies = { ...deps };
    console.log('[data-loader.js] Зависимости модуля data-loader установлены');
}

/**
 * Загружает данные из IndexedDB
 * @returns {Promise<boolean>} Promise, который разрешается с флагом успешной загрузки
 */
export async function loadFromIndexedDB() {
    const {
        DEFAULT_MAIN_ALGORITHM,
        DEFAULT_OTHER_SECTIONS,
        algorithms,
        renderAllAlgorithms,
        loadBookmarks,
        loadReglaments,
        loadCibLinks,
        loadExtLinks,
        renderMainAlgorithm,
    } = dependencies;

    console.log('Запуск loadFromIndexedDB (v2, без clientData логики)...');

    const mainTitleElement = document.querySelector('#mainContent h2');
    if (mainTitleElement) {
        mainTitleElement.textContent = DEFAULT_MAIN_ALGORITHM.title;
    } else {
        console.warn(
            '[loadFromIndexedDB] Не найден элемент #mainContent h2 для установки начального заголовка.',
        );
    }

    if (!State.db) {
        console.warn(
            'База данных не инициализирована. Используются только дефолтные данные для алгоритмов.',
        );
        algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
        Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
            algorithms[section] = JSON.parse(JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []));
        });
        if (mainTitleElement) {
            mainTitleElement.textContent = algorithms.main.title;
        }
        if (typeof renderAllAlgorithms === 'function') renderAllAlgorithms();
        return false;
    }

    let loadedDataUsed = false;
    try {
        const savedAlgorithmsContainer = await getFromIndexedDB('algorithms', 'all');
        let loadedAlgoData = null;
        if (savedAlgorithmsContainer?.data && typeof savedAlgorithmsContainer.data === 'object') {
            loadedAlgoData = savedAlgorithmsContainer.data;
            loadedDataUsed = true;
            console.log('[loadFromIndexedDB] Данные алгоритмов загружены из БД.');
        } else {
            console.log(
                '[loadFromIndexedDB] Данные алгоритмов не найдены в БД, инициализация дефолтами.',
            );
            algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
            Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
                algorithms[section] = JSON.parse(
                    JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []),
                );
            });
            loadedAlgoData = JSON.parse(JSON.stringify(algorithms));
            loadedDataUsed = false;
        }

        if (
            loadedAlgoData &&
            typeof loadedAlgoData.main === 'object' &&
            loadedAlgoData.main !== null
        ) {
            const mainHasContent =
                loadedAlgoData.main.title ||
                (loadedAlgoData.main.steps && loadedAlgoData.main.steps.length > 0);
            if (mainHasContent || loadedDataUsed) {
                algorithms.main = loadedAlgoData.main;
                if (!algorithms.main.id) algorithms.main.id = 'main';
                if (Array.isArray(algorithms.main.steps)) {
                    algorithms.main.steps = algorithms.main.steps.map((step) => {
                        if (!step || typeof step !== 'object') {
                            console.warn(
                                '[loadFromIndexedDB] Обнаружен невалидный шаг в main.steps:',
                                step,
                            );
                            return {
                                title: 'Ошибка: шаг невалиден',
                                description: '',
                                isCopyable: false,
                                additionalInfoText: '',
                                additionalInfoShowTop: false,
                                additionalInfoShowBottom: false,
                            };
                        }
                        const newStep = {
                            additionalInfoText: step.additionalInfoText || '',
                            additionalInfoShowTop:
                                typeof step.additionalInfoShowTop === 'boolean'
                                    ? step.additionalInfoShowTop
                                    : false,
                            additionalInfoShowBottom:
                                typeof step.additionalInfoShowBottom === 'boolean'
                                    ? step.additionalInfoShowBottom
                                    : false,
                            isCopyable:
                                typeof step.isCopyable === 'boolean' ? step.isCopyable : false,
                            showNoInnHelp:
                                typeof step.showNoInnHelp === 'boolean'
                                    ? step.showNoInnHelp
                                    : false,
                            ...step,
                        };
                        if (step.type === 'inn_step') {
                            newStep.showNoInnHelp = true;
                            delete newStep.type;
                        }
                        return newStep;
                    });
                } else {
                    algorithms.main.steps = [];
                }
            } else {
                console.warn(
                    "[loadFromIndexedDB] 'main' из БД пуст и не используется (т.к. loadedDataUsed=false). Используется DEFAULT_MAIN_ALGORITHM.",
                );
                algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
            }
        } else {
            console.warn(
                '[loadFromIndexedDB] loadedAlgoData.main невалиден. Используется DEFAULT_MAIN_ALGORITHM.',
            );
            algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
        }

        if (mainTitleElement) {
            mainTitleElement.textContent = algorithms.main.title || DEFAULT_MAIN_ALGORITHM.title;
        }

        Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
            if (
                loadedAlgoData &&
                loadedAlgoData.hasOwnProperty(section) &&
                Array.isArray(loadedAlgoData[section])
            ) {
                algorithms[section] = loadedAlgoData[section]
                    .map((item) => {
                        if (item && typeof item === 'object') {
                            if (typeof item.id === 'undefined' && item.title) {
                                item.id = `${section}-${Date.now()}-${Math.random()
                                    .toString(36)
                                    .substring(2, 9)}`;
                            }
                            if (item.steps && Array.isArray(item.steps)) {
                                item.steps = item.steps.map((step) => {
                                    if (!step || typeof step !== 'object') {
                                        console.warn(
                                            `[loadFromIndexedDB] Обнаружен невалидный шаг в ${section}/${item.id}:`,
                                            step,
                                        );
                                        return { title: 'Ошибка: шаг невалиден', description: '' };
                                    }
                                    return {
                                        additionalInfoText: step.additionalInfoText || '',
                                        additionalInfoShowTop:
                                            typeof step.additionalInfoShowTop === 'boolean'
                                                ? step.additionalInfoShowTop
                                                : false,
                                        additionalInfoShowBottom:
                                            typeof step.additionalInfoShowBottom === 'boolean'
                                                ? step.additionalInfoShowBottom
                                                : false,
                                        ...step,
                                    };
                                });
                            } else if (item.steps === undefined) {
                                item.steps = [];
                            }
                            return item;
                        }
                        console.warn(
                            `[loadFromIndexedDB] Обнаружен невалидный элемент в секции ${section}:`,
                            item,
                        );
                        return null;
                    })
                    .filter((item) => item && typeof item.id !== 'undefined');
            } else {
                algorithms[section] = JSON.parse(
                    JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []),
                );
                if (!Array.isArray(algorithms[section])) algorithms[section] = [];
            }
        });

        if (!loadedDataUsed) {
            console.log(
                '[loadFromIndexedDB] Сохранение данных алгоритмов по умолчанию в IndexedDB (т.к. loadedDataUsed=false)...',
            );
            try {
                await saveToIndexedDB('algorithms', {
                    section: 'all',
                    data: JSON.parse(JSON.stringify(algorithms)),
                });
            } catch (saveError) {
                console.error(
                    '[loadFromIndexedDB] Ошибка при сохранении дефолтных алгоритмов:',
                    saveError,
                );
            }
        }

        if (typeof renderAllAlgorithms === 'function') renderAllAlgorithms();

        const results = await Promise.allSettled([
            typeof loadBookmarks === 'function' ? loadBookmarks() : Promise.resolve(),
            typeof loadReglaments === 'function' ? loadReglaments() : Promise.resolve(),
            typeof loadCibLinks === 'function' ? loadCibLinks() : Promise.resolve(),
            typeof loadExtLinks === 'function' ? loadExtLinks() : Promise.resolve(),
        ]);
        const functionNames = ['bookmarks', 'reglaments', 'links', 'extLinks'];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Ошибка при загрузке ${functionNames[index]}:`, result.reason);
            }
        });

        if (
            !algorithms.main ||
            !algorithms.main.title ||
            !Array.isArray(algorithms.main.steps) ||
            (algorithms.main.steps.length === 0 && !loadedDataUsed)
        ) {
            console.warn(
                '[loadFromIndexedDB - Final Check] algorithms.main все еще невалиден. Восстановление из DEFAULT_MAIN_ALGORITHM.',
            );
            algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
            if (mainTitleElement) mainTitleElement.textContent = algorithms.main.title;
            if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
        }

        console.log(
            'Загрузка данных из IndexedDB (loadFromIndexedDB) успешно завершена (алгоритмы и связанные данные).',
        );
        return true;
    } catch (error) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА в loadFromIndexedDB:', error);
        algorithms.main = JSON.parse(JSON.stringify(DEFAULT_MAIN_ALGORITHM));
        Object.keys(DEFAULT_OTHER_SECTIONS).forEach((section) => {
            algorithms[section] = JSON.parse(JSON.stringify(DEFAULT_OTHER_SECTIONS[section] || []));
        });
        if (mainTitleElement) mainTitleElement.textContent = algorithms.main.title;
        if (typeof renderAllAlgorithms === 'function') renderAllAlgorithms();
        return false;
    }
}

/**
 * Сохраняет данные в IndexedDB
 * @returns {Promise<boolean>} Promise, который разрешается с флагом успешного сохранения
 */
export async function saveDataToIndexedDB() {
    const { algorithms, getClientData, showNotification } = dependencies;

    if (!State.db) {
        console.error('Cannot save data: Database not initialized.');
        if (typeof showNotification === 'function') {
            showNotification('Ошибка сохранения: База данных недоступна', 'error');
        }
        return false;
    }

    try {
        const clientDataToSave = getClientData();
        const algorithmsToSave = { section: 'all', data: algorithms };

        return await new Promise((resolve, reject) => {
            const transaction = State.db.transaction(['algorithms', 'clientData'], 'readwrite');
            const algoStore = transaction.objectStore('algorithms');
            const clientStore = transaction.objectStore('clientData');
            let opsCompleted = 0;
            const totalOps = 2;

            const checkCompletion = () => {
                opsCompleted++;
                if (opsCompleted === totalOps) {
                }
            };

            const req1 = algoStore.put(algorithmsToSave);
            req1.onsuccess = checkCompletion;
            req1.onerror = (e) => {
                console.error('Error saving algorithms:', e.target.error);
            };

            const req2 = clientStore.put(clientDataToSave);
            req2.onsuccess = checkCompletion;
            req2.onerror = (e) => {
                console.error('Error saving clientData:', e.target.error);
            };

            transaction.oncomplete = () => {
                console.log('Algorithms and clientData saved successfully in one transaction.');
                resolve(true);
            };

            transaction.onerror = (e) => {
                console.error(
                    'Error during save transaction for algorithms/clientData:',
                    e.target.error,
                );
                reject(e.target.error);
            };

            transaction.onabort = (e) => {
                console.warn('Save transaction for algorithms/clientData aborted:', e.target.error);
                if (!e.target.error) {
                    reject(new Error('Save transaction aborted'));
                }
            };
        });
    } catch (error) {
        console.error('Failed to execute save transaction:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка сохранения данных', 'error');
        }
        return false;
    }
}
