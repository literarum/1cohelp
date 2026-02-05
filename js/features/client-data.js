'use strict';

/**
 * Модуль управления данными клиента
 * Содержит функции для сохранения, загрузки, экспорта и очистки данных клиента
 */

import { State } from '../app/state.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

let deps = {
    showNotification: null,
    NotificationService: null,
    updateSearchIndex: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setClientDataDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    if (dependencies.NotificationService) deps.NotificationService = dependencies.NotificationService;
    if (dependencies.updateSearchIndex) deps.updateSearchIndex = dependencies.updateSearchIndex;
    console.log('[client-data.js] Зависимости установлены');
}

/**
 * Получает данные клиента из DOM
 * @returns {Object} объект с данными клиента
 */
export function getClientData() {
    const notesValue = document.getElementById('clientNotes')?.value ?? '';
    return {
        id: 'current',
        notes: notesValue,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Сохраняет данные клиента в IndexedDB или localStorage
 */
export async function saveClientData() {
    const clientDataToSave = getClientData();
    let oldData = null;
    let savedToDB = false;

    if (State.db) {
        try {
            oldData = await getFromIndexedDB('clientData', clientDataToSave.id);
            await saveToIndexedDB('clientData', clientDataToSave);
            console.log('Client data saved to IndexedDB');
            savedToDB = true;

            if (deps.updateSearchIndex && typeof deps.updateSearchIndex === 'function') {
                await deps.updateSearchIndex(
                    'clientData',
                    clientDataToSave.id,
                    clientDataToSave,
                    'update',
                    oldData,
                );
                console.log(
                    `Обновление индекса для clientData (${clientDataToSave.id}) инициировано.`,
                );
            }
        } catch (error) {
            console.error('Ошибка сохранения данных клиента в IndexedDB:', error);
            if (deps.showNotification) {
                deps.showNotification('Ошибка сохранения данных клиента', 'error');
            }
        }
    }

    if (!savedToDB) {
        try {
            localStorage.setItem('clientData', JSON.stringify(clientDataToSave));
            console.warn(
                'Данные клиента сохранены в localStorage (БД недоступна или ошибка сохранения в БД).',
            );

            if (State.db && deps.showNotification) {
                deps.showNotification(
                    'Данные клиента сохранены локально (резервное хранилище), но не в базу данных.',
                    'warning',
                );
            }
        } catch (lsError) {
            console.error(
                'Критическая ошибка: Не удалось сохранить данные клиента ни в БД, ни в localStorage!',
                lsError,
            );
            if (deps.showNotification) {
                deps.showNotification('Критическая ошибка: Не удалось сохранить данные клиента.', 'error');
            }
        }
    }
}

/**
 * Экспортирует данные клиента в TXT файл
 */
export async function exportClientDataToTxt() {
    const notes = document.getElementById('clientNotes')?.value ?? '';
    if (!notes.trim()) {
        if (deps.showNotification) {
            deps.showNotification('Нет данных для сохранения', 'error');
        }
        return;
    }

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const filename = `Обращение_1С_${timestamp}.txt`;
    const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: 'Текстовые файлы',
                        accept: { 'text/plain': ['.txt'] },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            if (deps.showNotification) {
                deps.showNotification('Файл успешно сохранен');
            }
            console.log('Экспорт текста клиента через File System Access API завершен успешно.');
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Сохранение файла отменено пользователем.');
                if (deps.showNotification) {
                    deps.showNotification('Сохранение файла отменено', 'info');
                }
            } else {
                console.error(
                    'Ошибка сохранения через File System Access API, используем fallback:',
                    err,
                );
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                if (deps.showNotification) {
                    deps.showNotification('Файл успешно сохранен (fallback)');
                }
                console.log('Экспорт текста клиента через data URI (fallback) завершен успешно.');
            }
        }
    } else {
        console.log('File System Access API не поддерживается, используем fallback.');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        if (deps.showNotification) {
            deps.showNotification('Файл успешно сохранен');
        }
        console.log('Экспорт текста клиента через data URI завершен успешно.');
    }
}

/**
 * Загружает данные клиента в DOM
 * @param {Object} data - объект с данными клиента
 */
export function loadClientData(data) {
    if (!data) return;
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes) {
        clientNotes.value = data.notes ?? '';
    }
}

/**
 * Очищает данные клиента
 */
export function clearClientData() {
    const LOG_PREFIX = '[ClearClientData V2]';
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes) {
        clientNotes.value = '';
        saveClientData();
        if (deps.showNotification) {
            deps.showNotification('Данные очищены');
        }

        console.log(`${LOG_PREFIX} Очистка состояний черного списка...`);

        if (deps.NotificationService && State.activeToadNotifications) {
            for (const notificationId of State.activeToadNotifications.values()) {
                deps.NotificationService.dismissImportant(notificationId);
            }
        }

        if (State.lastKnownInnCounts) {
            State.lastKnownInnCounts.clear();
        }
        if (State.activeToadNotifications) {
            State.activeToadNotifications.clear();
        }

        console.log(
            `${LOG_PREFIX} Состояния 'State.lastKnownInnCounts' и 'State.activeToadNotifications' очищены.`,
        );
    }
}
