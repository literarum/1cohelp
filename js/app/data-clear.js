'use strict';

/**
 * Модуль очистки всех данных приложения
 * Вынесено из script.js
 */

import {
    DB_NAME,
    TIMER_STATE_KEY,
    BLACKLIST_WARNING_ACCEPTED_KEY,
    USER_PREFERENCES_KEY,
    CATEGORY_INFO_KEY,
    SEDO_CONFIG_KEY,
} from '../constants.js';

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;

export function setDataClearDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Очищает все данные приложения (localStorage и IndexedDB)
 * @param {Function} progressCallback - Функция обратного вызова для отчета о прогрессе
 */
export async function clearAllApplicationData(progressCallback) {
    console.log('Starting data clearing process with progress callback...');
    let currentProgress = 0;

    const updateAndReportProgress = (increment, message) => {
        currentProgress += increment;
        currentProgress = Math.min(currentProgress, 95);
        if (progressCallback) {
            progressCallback(currentProgress, message);
        }
        console.log(`[ClearData Progress: ${currentProgress}%] ${message}`);
    };

    updateAndReportProgress(0, 'Начало очистки...');

    try {
        updateAndReportProgress(5, 'Очистка локального хранилища...');
        const localStorageKeys = [
            'clientData',
            'employeeExtension',
            'viewPreferences',
            TIMER_STATE_KEY,
            'uiSettingsModalOrder',
            'lastActiveTabCopilot1CO',
            BLACKLIST_WARNING_ACCEPTED_KEY,
            USER_PREFERENCES_KEY,
            CATEGORY_INFO_KEY,
            SEDO_CONFIG_KEY,
            'copilotIsReloadingAfterClear',
        ];
        localStorageKeys.forEach((key) => {
            if (localStorage.getItem(key) !== null) {
                localStorage.removeItem(key);
                console.log(`Removed key from LocalStorage: ${key}`);
            } else {
                console.log(`Key not found in LocalStorage, skipping removal: ${key}`);
            }
        });

        const appPrefix = 'Copilot1CO_';
        const keysToRemoveWithPrefix = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(appPrefix)) {
                keysToRemoveWithPrefix.push(key);
            }
        }
        keysToRemoveWithPrefix.forEach((key) => {
            localStorage.removeItem(key);
            console.log(`Removed prefixed key from LocalStorage: ${key}`);
        });
        console.log('LocalStorage очищен.');
    } catch (error) {
        console.error('Error clearing LocalStorage:', error);
        if (progressCallback)
            progressCallback(currentProgress, 'Ошибка очистки локального хранилища!');
        throw error;
    }

    try {
        updateAndReportProgress(5, 'Подготовка базы данных к удалению...');
        if (State && State.db) {
            State.db.close();
            State.db = null;
            console.log('IndexedDB connection closed.');
        } else {
            console.log('IndexedDB connection was not open.');
        }
    } catch (error) {
        console.error('Error closing IndexedDB connection:', error);
        if (progressCallback) progressCallback(currentProgress, 'Ошибка закрытия базы данных!');
        throw error;
    }

    try {
        updateAndReportProgress(5, 'Удаление базы данных...');
        await new Promise((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            deleteRequest.onsuccess = () => {
                console.log(`IndexedDB database "${DB_NAME}" deleted successfully.`);
                updateAndReportProgress(80, 'База данных успешно удалена.');
                resolve();
            };
            deleteRequest.onerror = (event) => {
                console.error(`Error deleting database "${DB_NAME}":`, event.target.error);
                if (progressCallback)
                    progressCallback(currentProgress, 'Ошибка удаления базы данных!');
                reject(event.target.error || new Error('Unknown DB deletion error'));
            };
            deleteRequest.onblocked = (event) => {
                const errorMsg = `Удаление БД "${DB_NAME}" заблокировано. Закройте другие вкладки с приложением.`;
                console.warn(errorMsg, event);
                if (progressCallback)
                    progressCallback(currentProgress, 'Удаление базы данных заблокировано!');
                reject(new Error(errorMsg));
            };
        });
    } catch (error) {
        console.error('Error deleting IndexedDB database:', error);
        throw error;
    }
    console.log('Data clearing process finished.');
}
