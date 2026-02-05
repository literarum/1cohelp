'use strict';

/**
 * Модуль системы импорта/экспорта данных
 * Содержит логику экспорта БД в JSON и импорта из JSON файлов
 */

import { State } from '../app/state.js';
import {
    initDB,
    getAllFromIndexedDB,
    saveToIndexedDB,
    clearIndexedDBStore,
} from '../db/indexeddb.js';
import { CURRENT_SCHEMA_VERSION, DIALOG_WATCHDOG_TIMEOUT_NEW } from '../constants.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setImportExportDependencies)
// ============================================================================

let deps = {
    NotificationService: null,
    loadingOverlayManager: null,
    showNotification: null,
    setActiveTab: null,
    setTheme: null,
    renderAllAlgorithms: null,
    loadBookmarks: null,
    loadExtLinks: null,
    loadCibLinks: null,
    renderReglamentCategories: null,
    showReglamentsForCategory: null,
    initSearchSystem: null,
    buildInitialSearchIndex: null,
    updateSearchIndex: null,
    loadSedoData: null,
    applyPreviewSettings: null,
    applyThemeOverrides: null,
    importFileInput: null,
};

/**
 * Устанавливает зависимости для модуля Import/Export
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setImportExportDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[ImportExport] Зависимости установлены');
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Очищает временные миниатюры из контейнера
 */
export function clearTemporaryThumbnailsFromContainer(container) {
    if (!container) return;
    const tempThumbs = container.querySelectorAll(
        '.screenshot-thumbnail.temporary img[data-object-url]'
    );
    tempThumbs.forEach((img) => {
        if (img.dataset.objectUrl && img.dataset.objectUrlRevoked !== 'true') {
            try {
                URL.revokeObjectURL(img.dataset.objectUrl);
                console.log(
                    `[clearTemporaryThumbnails] Освобожден временный URL: ${img.dataset.objectUrl}`
                );
                img.dataset.objectUrlRevoked = 'true';
            } catch (e) {
                console.warn('Ошибка освобождения временного URL при очистке:', e);
            }
            delete img.dataset.objectUrl;
        }
    });

    const stepOrFormElement = container.closest('.edit-step, form');
    if (stepOrFormElement && stepOrFormElement._tempScreenshotBlobs) {
        delete stepOrFormElement._tempScreenshotBlobs;
        console.log('[clearTemporaryThumbnails] Очищен массив _tempScreenshotBlobs.');
    }
    container.innerHTML = '';
}

/**
 * Импортирует закладки в БД
 */
export async function importBookmarks(bookmarks) {
    if (!State.db || !Array.isArray(bookmarks)) return false;

    try {
        await clearIndexedDBStore('bookmarks');
        await Promise.all(bookmarks.map((bookmark) => saveToIndexedDB('bookmarks', bookmark)));
        return true;
    } catch (error) {
        console.error('Error importing bookmarks:', error);
        return false;
    }
}

/**
 * Импортирует регламенты в БД
 */
export async function importReglaments(reglaments) {
    if (!State.db || !Array.isArray(reglaments)) {
        console.error(
            'База данных не готова или предоставлены неверные данные для импорта регламентов.'
        );
        return false;
    }

    console.log(`Начало импорта ${reglaments.length} регламентов...`);
    try {
        await clearIndexedDBStore('reglaments');
        console.log("Хранилище 'reglaments' очищено.");

        const savePromises = reglaments.map((reglament) => {
            const { id, ...reglamentData } = reglament;
            return saveToIndexedDB('reglaments', reglamentData);
        });

        const savedIds = await Promise.all(savePromises);
        console.log(`Сохранено ${savedIds.length} регламентов в IndexedDB.`);

        if (deps.updateSearchIndex) {
            console.log('Начало обновления поискового индекса для импортированных регламентов...');
            const indexPromises = reglaments.map((reglament, index) => {
                const newId = savedIds[index];
                if (newId === undefined || newId === null) {
                    console.warn(
                        `Не удалось получить ID для регламента при импорте: ${
                            reglament.title || 'Без заголовка'
                        }. Пропуск индексации.`
                    );
                    return Promise.resolve();
                }
                const reglamentWithId = { ...reglament, id: newId };
                return deps.updateSearchIndex('reglaments', newId, reglamentWithId, 'add').catch((err) =>
                    console.error(
                        `Ошибка индексации импортированного регламента ID ${newId}:`,
                        err
                    )
                );
            });
            await Promise.all(indexPromises);
            console.log('Поисковый индекс обновлен для импортированных регламентов.');
        } else {
            console.warn(
                'Функция updateSearchIndex недоступна. Поисковый индекс не обновлен после импорта.'
            );
            deps.showNotification?.('Импорт завершен, но поисковый индекс не обновлен.', 'warning');
        }

        console.log('Импорт регламентов успешно завершен.');
        await deps.renderReglamentCategories?.();
        
        const reglamentsListDiv = document.getElementById('reglamentsList');
        const currentCategoryId = reglamentsListDiv?.dataset.currentCategory;
        if (
            currentCategoryId &&
            reglamentsListDiv &&
            !reglamentsListDiv.classList.contains('hidden')
        ) {
            await deps.showReglamentsForCategory?.(currentCategoryId);
        }

        return true;
    } catch (error) {
        console.error('Ошибка во время импорта регламентов:', error);
        deps.showNotification?.('Ошибка при импорте регламентов. См. консоль.', 'error');
        return false;
    }
}

// ============================================================================
// РЕЗЕРВНОЕ КОПИРОВАНИЕ
// ============================================================================

/**
 * Выполняет принудительное резервное копирование перед импортом
 */
export async function performForcedBackup() {
    const userAgreesToBackup = window.confirm(
        'Создать резервную копию текущей базы данных перед импортом?\n\n' +
            'ОТКАЗ ОТ РЕЗЕРВНОГО КОПИРОВАНИЯ МОЖЕТ ПРИВЕСТИ К ПОЛНОЙ И НЕОБРАТИМОЙ ПОТЕРЕ ДАННЫХ.\n\n' +
            "Нажмите 'ОК', чтобы создать резервную копию (рекомендуется).\n" +
            "Нажмите 'Отмена', чтобы продолжить импорт без резервной копии (на свой страх и риск)."
    );

    deps.NotificationService?.dismissImportant('critical-backup-warning-prompt');

    if (userAgreesToBackup) {
        console.log('[performForcedBackup] Пользователь согласился на бэкап.');
        try {
            const exportOutcome = await exportAllData({ isForcedBackupMode: true });

            if (
                typeof exportOutcome === 'object' &&
                exportOutcome.errorType === 'UserGestureRequired'
            ) {
                deps.NotificationService?.add(
                    'Автоматическое резервное копирование не удалось из-за ограничений безопасности браузера. ' +
                        'Импорт прерван. Попробуйте сначала экспортировать данные вручную.',
                    'error',
                    { important: true, duration: 0, id: 'backup-gesture-error-critical-pfb' }
                );
                return false;
            } else if (exportOutcome === true) {
                deps.NotificationService?.add('Резервное копирование успешно завершено.', 'success', {
                    duration: 5000,
                    id: 'forced-backup-success-pfb',
                });
                return true;
            } else {
                deps.NotificationService?.add(
                    'Резервное копирование было отменено или не удалось. Импорт прерван.',
                    'error',
                    { important: true, duration: 7000, id: 'forced-backup-failed-pfb' }
                );
                return false;
            }
        } catch (error) {
            console.error(
                'Критическая ошибка во время принудительного резервного копирования (внутри performForcedBackup):',
                error
            );
            deps.NotificationService?.add(
                'Критическая ошибка при резервном копировании: ' +
                    (error.message || 'Неизвестная ошибка'),
                'error',
                { important: true, duration: 0, id: 'forced-backup-critical-error-pfb' }
            );
            return false;
        }
    } else {
        console.log('[performForcedBackup] Пользователь отказался от бэкапа.');
        return 'skipped_by_user';
    }
}

// ============================================================================
// ОБРАБОТКА ИМПОРТА - ГЛАВНАЯ ФУНКЦИЯ
// ============================================================================

/**
 * Обработчик клика по кнопке импорта
 */
export async function handleImportButtonClick() {
    console.log(
        "[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Кнопка 'Импорт данных' нажата."
    );

    if (State.isExportOperationInProgress && deps.loadingOverlayManager?.overlayElement) {
        console.warn(
            '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Экспорт/Импорт уже выполняется. Выход.'
        );
        deps.NotificationService?.add('Операция импорта или экспорта уже выполняется.', 'warning');
        return;
    }
    if (State.isExpectingFileDialog) {
        console.warn(
            '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Диалог выбора файла уже ожидается. Предотвращение повторного вызова.'
        );
        deps.NotificationService?.add('Пожалуйста, завершите предыдущую операцию выбора файла.', 'info');
        return;
    }

    State.importDialogInteractionComplete = false;
    State.isExpectingFileDialog = false;

    deps.loadingOverlayManager?.createAndShow();
    deps.loadingOverlayManager?.updateProgress(1);

    let backupOutcome;
    const skipBackupSetting =
        State.userPreferences && State.userPreferences.disableForcedBackupOnImport === true;

    const IMPORT_WITHOUT_BACKUP_WARNING_ID = 'import-without-backup-warning-permanent';
    const SELECT_IMPORT_FILE_PROMPT_ID = 'select-import-file-prompt-permanent';

    try {
        deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);
        deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
        deps.NotificationService?.dismissImportant('backup-skipped-by-setting');
        deps.NotificationService?.dismissImportant('critical-backup-warning-prompt');
        deps.NotificationService?.dismissImportant('forced-backup-success-pfb');
        deps.NotificationService?.dismissImportant('forced-backup-failed-pfb');
        deps.NotificationService?.dismissImportant('backup-gesture-error-critical-pfb');
        deps.NotificationService?.dismissImportant('import-file-input-missing-critical');
        deps.NotificationService?.dismissImportant('import-cancelled-no-file');
        deps.NotificationService?.dismissImportant('import-cancelled-timeout');
        deps.NotificationService?.dismissImportant('import-cancelled-by-user-focus');
        deps.NotificationService?.dismissImportant('import-cancelled-by-user-fixed');
        deps.NotificationService?.dismissImportant('import-cancelled-by-user-async-hide');
        deps.NotificationService?.dismissImportant('import-init-global-error');

        await new Promise((resolve) =>
            setTimeout(resolve, (deps.NotificationService?.FADE_DURATION_MS || 300) + 100)
        );

        if (skipBackupSetting) {
            console.log(
                '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Принудительный бэкап отключен настройкой.'
            );
            deps.NotificationService?.add(
                'Принудительное резервное копирование отключено в настройках. Импорт начнется без бэкапа.',
                'warning',
                { important: true, duration: 7000, id: 'backup-skipped-by-setting-temp' }
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
            backupOutcome = 'skipped_by_setting';
        } else {
            backupOutcome = await performForcedBackup();
        }

        if (
            backupOutcome === true ||
            backupOutcome === 'skipped_by_user' ||
            backupOutcome === 'skipped_by_setting'
        ) {
            console.log(
                `[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Статус бэкапа: ${backupOutcome}. Запрос файла для импорта.`
            );

            deps.NotificationService?.dismissImportant('critical-backup-warning-prompt');
            deps.NotificationService?.dismissImportant('forced-backup-success-pfb');
            deps.NotificationService?.dismissImportant('forced-backup-failed-pfb');
            deps.NotificationService?.dismissImportant('backup-gesture-error-critical-pfb');
            await new Promise((resolve) =>
                setTimeout(resolve, (deps.NotificationService?.FADE_DURATION_MS || 300) + 50)
            );

            if (!deps.importFileInput) {
                console.error(
                    '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Элемент importFileInput не найден! Импорт невозможен.'
                );
                deps.NotificationService?.add(
                    'Ошибка импорта: не найден элемент для выбора файла. Обратитесь к разработчику.',
                    'error',
                    { important: true, duration: 10000, id: 'import-file-input-missing-critical' }
                );
                throw new Error('importFileInput missing');
            }

            deps.importFileInput.value = '';

            if (backupOutcome === 'skipped_by_user') {
                deps.NotificationService?.add(
                    'ВЫ ОТКАЗАЛИСЬ ОТ РЕЗЕРВНОГО КОПИРОВАНИЯ. Продолжение импорта может привести к потере данных.',
                    'error',
                    { important: true, duration: 0, id: IMPORT_WITHOUT_BACKUP_WARNING_ID }
                );
            }
            deps.NotificationService?.add('Выберите файл базы данных (.json) для импорта.', 'info', {
                important: true,
                duration: 0,
                id: SELECT_IMPORT_FILE_PROMPT_ID,
            });

            const watchdogTimerId = setTimeout(async () => {
                if (deps.importFileInput && deps.importFileInput._watchdogTimerId === watchdogTimerId) {
                    delete deps.importFileInput._watchdogTimerId;
                    if (!State.importDialogInteractionComplete) {
                        console.warn(
                            '[Import Watchdog Timer FOCUS_HANDLER_FINAL_FULL] Взаимодействие с диалогом НЕ завершено. Принудительная очистка UI.'
                        );
                        deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
                        deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);
                        if (deps.loadingOverlayManager?.overlayElement) {
                            deps.loadingOverlayManager.updateProgress(100);
                            await deps.loadingOverlayManager.hideAndDestroy();
                        }
                        deps.NotificationService?.add(
                            'Импорт был отменен (превышено время ожидания выбора файла).',
                            'info',
                            { duration: 7000, id: 'import-cancelled-timeout' }
                        );
                        if (deps.importFileInput) deps.importFileInput.value = '';

                        State.isExpectingFileDialog = false;
                        if (State.windowFocusHandlerInstance) {
                            window.removeEventListener('focus', State.windowFocusHandlerInstance);
                            State.windowFocusHandlerInstance = null;
                        }
                        if (deps.setActiveTab) deps.setActiveTab('main');
                    }
                }
            }, DIALOG_WATCHDOG_TIMEOUT_NEW);
            if (deps.importFileInput) deps.importFileInput._watchdogTimerId = watchdogTimerId;

            if (State.windowFocusHandlerInstance) {
                window.removeEventListener('focus', State.windowFocusHandlerInstance);
                State.windowFocusHandlerInstance = null;
            }
            State.windowFocusHandlerInstance = async () => {
                console.log('[WindowFocusHandler FOR IMPORT] Окно получило фокус.');
                const self = State.windowFocusHandlerInstance;

                if (self) {
                    window.removeEventListener('focus', self);
                    State.windowFocusHandlerInstance = null;
                    console.log(
                        '[WindowFocusHandler FOR IMPORT] Обработчик window.focus удален (сработал).'
                    );
                }

                await new Promise((resolve) => setTimeout(resolve, 150));

                if (State.isExpectingFileDialog && !State.importDialogInteractionComplete) {
                    console.log(
                        '[WindowFocusHandler FOR IMPORT] State.isExpectingFileDialog=true, State.importDialogInteractionComplete=false.'
                    );
                    if (!deps.importFileInput || deps.importFileInput.files.length === 0) {
                        console.log(
                            '[WindowFocusHandler FOR IMPORT] Файл НЕ выбран. Обработка отмены.'
                        );
                        State.importDialogInteractionComplete = true;
                        State.isExpectingFileDialog = false;

                        if (deps.importFileInput && deps.importFileInput._watchdogTimerId) {
                            clearTimeout(deps.importFileInput._watchdogTimerId);
                            delete deps.importFileInput._watchdogTimerId;
                        }

                        deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
                        deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);

                        if (deps.loadingOverlayManager?.overlayElement) {
                            deps.loadingOverlayManager.updateProgress(100);
                            await deps.loadingOverlayManager.hideAndDestroy();
                        }
                        deps.NotificationService?.add('Импорт отменен пользователем.', 'info', {
                            duration: 5000,
                            id: 'import-cancelled-by-user-focus',
                        });
                        if (deps.importFileInput) deps.importFileInput.value = '';

                        if (deps.setActiveTab) {
                            deps.setActiveTab('main');
                        }
                    } else {
                        console.log(
                            '[WindowFocusHandler FOR IMPORT] Файл выбран, ожидаем `handleImportFileChange`.'
                        );
                    }
                } else {
                    console.log(
                        `[WindowFocusHandler FOR IMPORT] Условия не выполнены: State.isExpectingFileDialog=${State.isExpectingFileDialog}, State.importDialogInteractionComplete=${State.importDialogInteractionComplete}.`
                    );
                }
            };
            window.addEventListener('focus', State.windowFocusHandlerInstance);
            State.isExpectingFileDialog = true;

            requestAnimationFrame(async () => {
                if (
                    deps.importFileInput &&
                    document.body.contains(deps.importFileInput) &&
                    (deps.importFileInput.offsetWidth > 0 ||
                        deps.importFileInput.offsetHeight > 0 ||
                        deps.importFileInput.getClientRects().length > 0 ||
                        deps.importFileInput.type === 'file')
                ) {
                    console.log(
                        '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Попытка вызвать importFileInput.click() через rAF.'
                    );
                    try {
                        deps.importFileInput.click();
                        console.log(
                            '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] importFileInput.click() был вызван.'
                        );
                    } catch (clickError) {
                        console.error(
                            '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Ошибка при вызове importFileInput.click():',
                            clickError
                        );
                        clearTimeout(watchdogTimerId);
                        if (deps.importFileInput) delete deps.importFileInput._watchdogTimerId;
                        deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
                        deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);

                        State.isExpectingFileDialog = false;
                        if (State.windowFocusHandlerInstance) {
                            window.removeEventListener('focus', State.windowFocusHandlerInstance);
                            State.windowFocusHandlerInstance = null;
                        }
                        if (deps.loadingOverlayManager?.overlayElement) {
                            deps.loadingOverlayManager.updateProgress(100);
                            await deps.loadingOverlayManager.hideAndDestroy();
                        }
                        deps.NotificationService?.add(
                            'Критическая ошибка: не удалось открыть диалог выбора файла.',
                            'error',
                            { important: true, duration: 0 }
                        );
                        State.importDialogInteractionComplete = true;
                    }
                } else {
                    console.error(
                        '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] importFileInput не готов к .click() (не найден, не в DOM или не видим).'
                    );
                    clearTimeout(watchdogTimerId);
                    if (deps.importFileInput) delete deps.importFileInput._watchdogTimerId;
                    deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
                    deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);

                    State.isExpectingFileDialog = false;
                    if (State.windowFocusHandlerInstance) {
                        window.removeEventListener('focus', State.windowFocusHandlerInstance);
                        State.windowFocusHandlerInstance = null;
                    }
                    if (deps.loadingOverlayManager?.overlayElement) {
                        deps.loadingOverlayManager.updateProgress(100);
                        await deps.loadingOverlayManager.hideAndDestroy();
                    }
                    deps.NotificationService?.add(
                        'Ошибка: не удалось инициировать выбор файла импорта.',
                        'error',
                        { important: true, duration: 7000 }
                    );
                    State.importDialogInteractionComplete = true;
                }
            });
        } else {
            console.log(
                '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Бэкап не удался. Импорт прерван.'
            );
            State.isExpectingFileDialog = false;
            if (State.windowFocusHandlerInstance) {
                window.removeEventListener('focus', State.windowFocusHandlerInstance);
                State.windowFocusHandlerInstance = null;
            }
            if (deps.loadingOverlayManager?.overlayElement) {
                deps.loadingOverlayManager.updateProgress(100);
                await deps.loadingOverlayManager.hideAndDestroy();
            }
            if (deps.importFileInput) deps.importFileInput.value = '';
        }
    } catch (error) {
        console.error(
            '[handleImportButtonClick v_FOCUS_HANDLER_FINAL_FULL] Глобальная ошибка в процессе инициации импорта:',
            error
        );
        deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
        deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);
        deps.NotificationService?.add(
            `Ошибка инициации импорта: ${error.message || 'Неизвестная ошибка'}.`,
            'error',
            { important: true, duration: 10000, id: 'import-init-global-error' }
        );

        State.isExpectingFileDialog = false;
        if (State.windowFocusHandlerInstance) {
            window.removeEventListener('focus', State.windowFocusHandlerInstance);
            State.windowFocusHandlerInstance = null;
        }
        if (deps.importFileInput && deps.importFileInput._watchdogTimerId) {
            clearTimeout(deps.importFileInput._watchdogTimerId);
            delete deps.importFileInput._watchdogTimerId;
        }
        if (deps.loadingOverlayManager?.overlayElement) {
            deps.loadingOverlayManager.updateProgress(100);
            await deps.loadingOverlayManager.hideAndDestroy();
        }
        if (deps.importFileInput) {
            deps.importFileInput.value = '';
        }
        State.importDialogInteractionComplete = true;
    }
}

// ============================================================================
// ОБРАБОТКА ИМПОРТА ФАЙЛОВ
// ============================================================================

/**
 * Обработчик события change для input файла импорта
 */
export async function handleImportFileChange(e) {
    console.log(
        '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Функция вызвана (файл выбран).'
    );

    State.isExpectingFileDialog = false;
    if (State.windowFocusHandlerInstance) {
        window.removeEventListener('focus', State.windowFocusHandlerInstance);
        State.windowFocusHandlerInstance = null;
        console.log(
            '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Обработчик window.focus удален.'
        );
    }

    State.importDialogInteractionComplete = true;

    if (deps.importFileInput && deps.importFileInput._watchdogTimerId) {
        clearTimeout(deps.importFileInput._watchdogTimerId);
        delete deps.importFileInput._watchdogTimerId;
        console.log(
            '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Сторожевой таймер импорта очищен.'
        );
    }

    const IMPORT_WITHOUT_BACKUP_WARNING_ID = 'import-without-backup-warning-permanent';
    const SELECT_IMPORT_FILE_PROMPT_ID = 'select-import-file-prompt-permanent';

    deps.NotificationService?.dismissImportant(SELECT_IMPORT_FILE_PROMPT_ID);
    deps.NotificationService?.dismissImportant(IMPORT_WITHOUT_BACKUP_WARNING_ID);

    const file = e.target.files?.[0];

    if (!file) {
        console.error(
            "[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Файл НЕ найден, хотя событие 'change' сработало! Это крайне неожиданно. Обработка как отмена."
        );
        if (deps.importFileInput) deps.importFileInput.value = '';

        if (deps.loadingOverlayManager?.overlayElement) {
            deps.loadingOverlayManager.updateProgress(100);
            await deps.loadingOverlayManager.hideAndDestroy();
        }
        deps.NotificationService?.add("Импорт был отменен (ошибка события 'change').", 'warning', {
            duration: 7000,
        });

        if (deps.setActiveTab) {
            deps.setActiveTab('main');
        }
        return;
    }

    console.log(
        `[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Файл "${file.name}" выбран. Начало чтения.`
    );

    const reader = new FileReader();
    reader.onload = async (event) => {
        let importResult = {
            success: false,
            message: 'Произошла неизвестная ошибка во время импорта.',
        };
        try {
            importResult = await _processActualImport(event.target.result);
        } catch (error) {
            console.error(
                '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Ошибка из _processActualImport:',
                error
            );
            importResult = {
                success: false,
                message: `Критическая ошибка импорта: ${error.message || 'Неизвестная ошибка'}`,
            };
        } finally {
            if (importResult.success) {
                console.log(
                    '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Импорт успешен.'
                );
            } else {
                const errorNotificationId = 'import-failed-in-handler-focus-final';
                const existingErrorNotification =
                    deps.NotificationService?.activeImportantNotifications?.has(errorNotificationId) ||
                    document.querySelector(
                        `.notification-item.notification-type-error[data-id^="import-"]`
                    );
                if (!existingErrorNotification) {
                    deps.NotificationService?.add(
                        importResult.message || 'Импорт данных не удался. Проверьте консоль.',
                        'error',
                        { important: true, duration: 10000, id: errorNotificationId }
                    );
                }
                console.log(
                    '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Импорт не удался.'
                );
            }

            if (deps.loadingOverlayManager?.overlayElement) {
                console.warn(
                    '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Оверлей все еще активен после _processActualImport. Принудительное скрытие.'
                );
                deps.loadingOverlayManager.updateProgress(100);
                await deps.loadingOverlayManager.hideAndDestroy();
            }
            if (deps.importFileInput) deps.importFileInput.value = '';
        }
    };
    reader.onerror = async () => {
        console.error(
            '[handleImportFileChange v_FOCUS_HANDLER_AWARE_FINAL_FULL] Ошибка чтения файла FileReader.error'
        );
        deps.NotificationService?.add('Ошибка чтения файла.', 'error', {
            important: true,
            id: 'file-read-error-focus-final',
        });
        if (deps.loadingOverlayManager?.overlayElement) {
            deps.loadingOverlayManager.updateProgress(100);
            await deps.loadingOverlayManager.hideAndDestroy();
        }
        if (deps.importFileInput) deps.importFileInput.value = '';
    };
    reader.readAsText(file);
}

// ============================================================================
// ОБРАБОТКА ИМПОРТА - ФАКТИЧЕСКИЙ ИМПОРТ
// ============================================================================


/**
 * Выполняет фактический импорт данных из JSON строки
 * @param {string} jsonString - JSON строка с данными для импорта
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function _processActualImport(jsonString) {
    console.log(
        '[_processActualImport V8 - Context-Aware] Начало фактической обработки импортируемых данных...',
    );

    const STAGE_WEIGHTS_ACTUAL_IMPORT = {
        PARSE_JSON: 5,
        VALIDATE_SCHEMA: 5,
        DB_CHECK_REINIT: 5,
        CLEAR_STORES: 20,
        IMPORT_DATA: 35,
        APP_RE_INIT: 20,
        RENDER_ACTIVE_REGLAMENTS: 5,
    };
    let currentImportProgress = 0;
    let notificationMessageOnError = 'Произошла ошибка во время импорта.';

    const updateTotalImportProgress = (stageWeightCompleted, stageName) => {
        currentImportProgress += stageWeightCompleted;
        const displayProgress = Math.min(
            currentImportProgress,
            stageName === 'FinalizeImportSuccess' ? 100 : 99,
        );
        if (deps.loadingOverlayManager?.updateProgress) {
            deps.loadingOverlayManager?.updateProgress(displayProgress);
        }
        console.log(
            `Прогресс импорта (${stageName}): ${displayProgress.toFixed(
                1,
            )}% (добавлено ${stageWeightCompleted.toFixed(
                1,
            )}%, всего ${currentImportProgress.toFixed(1)}%)`,
        );
    };

    const updateFineGrainedProgressForImport = (
        baseProgress,
        stageWeight,
        current,
        total,
        operationName = 'Операция',
    ) => {
        if (total === 0 && current === 0) return;
        const stageProgressFraction = total > 0 ? current / total : 1;
        const currentStageProgressContribution = stageProgressFraction * stageWeight;
        const newOverallProgress = baseProgress + currentStageProgressContribution;
        const displayProgress = Math.min(newOverallProgress, 99);
        if (deps.loadingOverlayManager?.updateProgress) {
            deps.loadingOverlayManager?.updateProgress(
                displayProgress,
                `${operationName}: ${Math.round(stageProgressFraction * 100)}%`,
            );
        }
    };

    if (typeof loadingOverlayManager !== 'undefined' && !deps.loadingOverlayManager?.overlayElement) {
        console.warn('[_processActualImport V7] Оверлей не был показан. Показываем сейчас.');
        if (typeof loadingOverlayManager.createAndShow === 'function')
            loadingOverlayManager.createAndShow();
    }
    currentImportProgress = 0;
    if (deps.loadingOverlayManager?.updateProgress) {
        deps.loadingOverlayManager?.updateProgress(1, 'Начало импорта...');
    }

    if (deps.NotificationService?.add) {
        deps.NotificationService?.add('Началась обработка и загрузка новой базы данных...', 'info', {
            duration: 4000,
            id: 'import-processing-started',
        });
    }

    const errorsOccurred = [];
    let skippedPuts = 0;
    let storesToImport = [];

    try {
        if (
            !State.db ||
            typeof State.db.objectStoreNames === 'undefined' ||
            (State.db.connections !== undefined && State.db.connections === 0) ||
            State.db.objectStoreNames.length === 0
        ) {
            console.warn(
                '[_processActualImport V7] DB is null, closed, or in an invalid state. Attempting re-initialization...',
            );
            await initDB();
            if (!State.db || !State.db.objectStoreNames || State.db.objectStoreNames.length === 0) {
                console.error(
                    '[_processActualImport V7] База данных не доступна или пуста после повторной попытки инициализации.',
                );
                throw new Error(
                    'База данных не доступна или пуста после повторной попытки инициализации.',
                );
            }
            console.log('[_processActualImport V7] DB re-initialized successfully.');
        } else {
            console.log('[_processActualImport V7] DB connection seems active and valid.');
        }
        updateTotalImportProgress(STAGE_WEIGHTS_ACTUAL_IMPORT.DB_CHECK_REINIT, 'Проверка БД');

        if (typeof jsonString !== 'string' || jsonString.trim() === '') {
            throw new Error('Файл пуст или не содержит текстовых данных.');
        }
        let importData;
        try {
            importData = JSON.parse(jsonString);
            console.log('[_processActualImport V7] JSON успешно распарсен.');
            updateTotalImportProgress(STAGE_WEIGHTS_ACTUAL_IMPORT.PARSE_JSON, 'Парсинг JSON');
        } catch (error) {
            throw new Error('Некорректный формат JSON файла.');
        }

        if (!importData || typeof importData.data !== 'object' || !importData.schemaVersion) {
            throw new Error(
                'Некорректный формат файла импорта (отсутствует data или schemaVersion)',
            );
        }
        console.log(
            `[_processActualImport V7] Импорт данных версии схемы файла: ${importData.schemaVersion}. Ожидаемая версия приложения: ${CURRENT_SCHEMA_VERSION}`,
        );
        const [fileMajorStr, fileMinorStr] = importData.schemaVersion.split('.');
        const [appMajorStr, appMinorStr] = CURRENT_SCHEMA_VERSION.split('.');
        const fileMajor = parseInt(fileMajorStr, 10);
        const fileMinor = parseInt(fileMinorStr, 10);
        const appMajor = parseInt(appMajorStr, 10);
        const appMinor = parseInt(appMinorStr, 10);

        if (isNaN(fileMajor) || isNaN(fileMinor) || isNaN(appMajor) || isNaN(appMinor)) {
            throw new Error('Некорректный формат версии схемы в файле или приложении.');
        }
        if (fileMajor !== appMajor) {
            throw new Error(
                `Импорт невозможен: версия схемы файла (${importData.schemaVersion}) несовместима с версией приложения (${CURRENT_SCHEMA_VERSION}). Требуется мажорная версия ${appMajor}.x.`,
            );
        }
        if (fileMinor > appMinor) {
            throw new Error(
                `Импорт невозможен: версия схемы файла (${importData.schemaVersion}) новее, чем версия приложения (${CURRENT_SCHEMA_VERSION}). Обновите приложение до более новой версии.`,
            );
        }
        if (
            fileMinor < appMinor &&
            typeof NotificationService !== 'undefined' &&
            NotificationService.add
        ) {
            deps.NotificationService?.add(
                `ВНИМАНИЕ: Версия импортируемого файла (${importData.schemaVersion}) старше текущей версии приложения (${CURRENT_SCHEMA_VERSION}). Некоторые данные могут не перенестись корректно или будут утеряны. Рекомендуется обновить файл экспорта.`,
                'warning',
                { important: true, id: 'old-schema-import-warning', isDismissible: true },
            );
        }
        updateTotalImportProgress(STAGE_WEIGHTS_ACTUAL_IMPORT.VALIDATE_SCHEMA, 'Валидация схемы');

        if (
            importData.data.extLinks &&
            Array.isArray(importData.data.extLinks) &&
            importData.data.extLinks.some((link) => typeof link.category === 'string') &&
            importData.data.extLinkCategories
        ) {
            console.log(
                '[_processActualImport V7] Обнаружены extLinks со строковыми категориями. Запуск надежной миграции категорий на лету.',
            );

            const legacyCategoryKeyToDefaultName = {
                docs: 'Документация',
                gov: 'Гос. сайты',
                tools: 'Инструменты',
                other: 'Прочее',
            };

            const oldKeyToNewIdMap = new Map();

            if (Array.isArray(importData.data.extLinkCategories)) {
                const defaultNameToNewId = new Map();
                importData.data.extLinkCategories.forEach((cat) => {
                    if (cat && cat.name && cat.id !== undefined) {
                        for (const key in legacyCategoryKeyToDefaultName) {
                            if (legacyCategoryKeyToDefaultName[key] === cat.name) {
                                defaultNameToNewId.set(cat.name, cat.id);
                                break;
                            }
                        }
                    }
                });

                for (const oldKey in legacyCategoryKeyToDefaultName) {
                    const defaultName = legacyCategoryKeyToDefaultName[oldKey];
                    if (defaultNameToNewId.has(defaultName)) {
                        oldKeyToNewIdMap.set(oldKey, defaultNameToNewId.get(defaultName));
                    }
                }
            }

            console.log(
                "[_processActualImport V7] Карта миграции 'Старый ключ -> Новый ID':",
                oldKeyToNewIdMap,
            );

            let migrationCount = 0;
            importData.data.extLinks.forEach((link) => {
                if (link && typeof link.category === 'string') {
                    const oldCatKey = link.category;
                    if (oldKeyToNewIdMap.has(oldCatKey)) {
                        const newId = oldKeyToNewIdMap.get(oldCatKey);
                        console.log(
                            `[Migration] Замена категории для ссылки "${
                                link.title || 'Без названия'
                            }": с ключа '${oldCatKey}' на новый ID '${newId}'`,
                        );
                        link.category = newId;
                        migrationCount++;
                    } else {
                        console.warn(
                            `[Migration] Не удалось найти новый ID для старого ключа категории '${oldCatKey}'. Ссылка "${
                                link.title || 'Без названия'
                            }" останется без категории.`,
                        );
                        link.category = null;
                    }
                }
            });

            if (migrationCount > 0) {
                console.log(
                    `[_processActualImport V7] Миграция категорий на лету завершена. Обновлено ${migrationCount} ссылок.`,
                );
            } else {
                console.log(
                    `[_processActualImport V7] Миграция категорий на лету не потребовалась (ссылки уже в новом формате или не найдено соответствий).`,
                );
            }
        }

        storesToImport = Object.keys(importData.data).filter((storeName) => {
            if (!State.db.objectStoreNames.contains(storeName)) {
                console.warn(
                    `[_processActualImport V7] Хранилище '${storeName}' из файла импорта не найдено в текущей схеме БД. Пропускается.`,
                );
                return false;
            }
            if (storeName === 'searchIndex') {
                console.log(
                    `[_processActualImport V7] Хранилище 'searchIndex' будет пропущено при импорте данных, оно перестраивается отдельно.`,
                );
                return false;
            }
            return true;
        });
        if (storesToImport.length === 0) {
            throw new Error(
                'Нет данных для импорта в текущую структуру БД (после фильтрации по существующим хранилищам).',
            );
        }
        console.log('[_processActualImport V7] Хранилища для импорта:', storesToImport);

        let importTransactionSuccessful = false;
        try {
            console.log('[_processActualImport V7] Попытка начать основную транзакцию импорта...');
            importTransactionSuccessful = await new Promise(
                async (resolvePromise, rejectPromise) => {
                    let transaction;
                    try {
                        transaction = State.db.transaction(storesToImport, 'readwrite');
                        if (!transaction) throw new Error('State.db.transaction вернула null/undefined.');
                    } catch (txError) {
                        errorsOccurred.push({
                            storeName: storesToImport.join(', '),
                            error: `Ошибка создания транзакции: ${txError.message}`,
                            item: null,
                        });
                        return rejectPromise(txError);
                    }

                    transaction.oncomplete = () => {
                        console.log(
                            '[_processActualImport V7] Транзакция импорта успешно завершена (oncomplete).',
                        );
                        resolvePromise(true);
                    };
                    transaction.onerror = (e) => {
                        const errorMsg = `Критическая ошибка транзакции: ${
                            e.target.error?.message || e.target.error || 'Неизвестно'
                        }`;
                        console.error(
                            `[_processActualImport V7] Transaction error:`,
                            e.target.error,
                        );
                        errorsOccurred.push({
                            storeName: storesToImport.join(', '),
                            error: errorMsg,
                            item: null,
                        });
                        rejectPromise(e.target.error || new Error(errorMsg));
                    };
                    transaction.onabort = (e) => {
                        const errorMsg = `Транзакция прервана: ${
                            e.target.error?.message || e.target.error || 'Неизвестно'
                        }`;
                        console.warn(
                            `[_processActualImport V7] Transaction aborted:`,
                            e.target.error,
                        );
                        errorsOccurred.push({
                            storeName: storesToImport.join(', '),
                            error: errorMsg,
                            item: null,
                        });
                        rejectPromise(e.target.error || new Error(errorMsg));
                    };

                    const clearPromises = [];
                    const baseProgressForClear = currentImportProgress;
                    console.log(
                        `[_processActualImport V7] Начало очистки ${storesToImport.length} хранилищ...`,
                    );
                    for (let i = 0; i < storesToImport.length; i++) {
                        const storeName = storesToImport[i];
                        clearPromises.push(
                            new Promise((resolveClear, rejectClear) => {
                                try {
                                    const store = transaction.objectStore(storeName);
                                    const clearRequest = store.clear();
                                    clearRequest.onsuccess = () => {
                                        console.log(
                                            `[_processActualImport V7] Хранилище ${storeName} успешно очищено.`,
                                        );
                                        updateFineGrainedProgressForImport(
                                            baseProgressForClear,
                                            STAGE_WEIGHTS_ACTUAL_IMPORT.CLEAR_STORES,
                                            i + 1,
                                            storesToImport.length,
                                            'Очистка хранилищ',
                                        );
                                        resolveClear();
                                    };
                                    clearRequest.onerror = (e_clear) => {
                                        const errorMsg_clear = `Ошибка очистки ${storeName}: ${
                                            e_clear.target.error?.message || 'Неизвестно'
                                        }`;
                                        console.error(errorMsg_clear, e_clear.target.error);
                                        errorsOccurred.push({
                                            storeName,
                                            error: errorMsg_clear,
                                            item: null,
                                        });
                                        rejectClear(new Error(errorMsg_clear));
                                    };
                                } catch (storeError) {
                                    errorsOccurred.push({
                                        storeName,
                                        error: `Ошибка доступа к ${storeName} для очистки: ${storeError.message}`,
                                        item: null,
                                    });
                                    rejectClear(storeError);
                                }
                            }),
                        );
                    }
                    try {
                        await Promise.all(clearPromises);
                        currentImportProgress = Math.max(
                            currentImportProgress,
                            baseProgressForClear + STAGE_WEIGHTS_ACTUAL_IMPORT.CLEAR_STORES,
                        );
                        if (
                            typeof loadingOverlayManager !== 'undefined' &&
                            loadingOverlayManager.updateProgress
                        )
                            deps.loadingOverlayManager?.updateProgress(
                                Math.min(currentImportProgress, 99),
                                'Очистка завершена',
                            );
                        console.log('[_processActualImport V7] Все хранилища успешно очищены.');
                    } catch (clearAllError) {
                        console.error(
                            '[_processActualImport V7] Ошибка во время очистки хранилищ:',
                            clearAllError,
                        );
                        return rejectPromise(
                            new Error(
                                `Не удалось очистить хранилища: ${
                                    clearAllError.message || clearAllError
                                }`,
                            ),
                        );
                    }

                    let putPromises = [];
                    let totalItemsToPut = 0;
                    storesToImport.forEach((storeName) => {
                        totalItemsToPut += (importData.data[storeName] || []).length;
                    });
                    let processedItemsPut = 0;
                    const baseProgressForImportData = currentImportProgress;
                    console.log(
                        `[_processActualImport V7] Начало записи ${totalItemsToPut} элементов...`,
                    );
                    for (const storeName of storesToImport) {
                        let itemsToImportOriginal = importData.data[storeName];
                        if (!Array.isArray(itemsToImportOriginal)) {
                            errorsOccurred.push({
                                storeName,
                                error: 'Данные не являются массивом',
                                item: null,
                            });
                            if (totalItemsToPut > 0) {
                                totalItemsToPut = Math.max(
                                    0,
                                    totalItemsToPut - (importData.data[storeName]?.length || 0),
                                );
                            }
                            continue;
                        }
                        const storeConfigFound = storeConfigs.find((sc) => sc.name === storeName);
                        if (!storeConfigFound) {
                            errorsOccurred.push({
                                storeName,
                                error: `Внутренняя ошибка: нет конфигурации для ${storeName}`,
                                item: null,
                            });
                            if (transaction && transaction.abort) transaction.abort();
                            return rejectPromise(new Error(`Missing storeConfig for ${storeName}`));
                        }
                        const keyPathFromConfig = storeConfigFound.options?.keyPath;
                        const autoIncrementFromConfig =
                            storeConfigFound.options?.autoIncrement || false;
                        let validItemsForStore = [];
                        for (const item of itemsToImportOriginal) {
                            if (typeof item !== 'object' || item === null) {
                                errorsOccurred.push({
                                    storeName,
                                    error: 'Элемент не является объектом или null',
                                    item: JSON.stringify(item)?.substring(0, 100),
                                });
                                skippedPuts++;
                                continue;
                            }
                            if (!autoIncrementFromConfig && keyPathFromConfig) {
                                let hasKey = false;
                                if (typeof keyPathFromConfig === 'string')
                                    hasKey =
                                        item.hasOwnProperty(keyPathFromConfig) &&
                                        item[keyPathFromConfig] !== undefined &&
                                        item[keyPathFromConfig] !== null;
                                else if (Array.isArray(keyPathFromConfig))
                                    hasKey = keyPathFromConfig.every(
                                        (kp) =>
                                            item.hasOwnProperty(kp) &&
                                            item[kp] !== undefined &&
                                            item[kp] !== null,
                                    );
                                if (!hasKey) {
                                    errorsOccurred.push({
                                        storeName,
                                        error: `Отсутствует или null/undefined ключ '${keyPathFromConfig}'`,
                                        item: JSON.stringify(item).substring(0, 100),
                                    });
                                    skippedPuts++;
                                    continue;
                                }
                            }
                            if (
                                !autoIncrementFromConfig &&
                                keyPathFromConfig &&
                                typeof item === 'object' &&
                                item !== null
                            ) {
                                const itemKeys = Object.keys(item);
                                let isOnlyKeyPath = false;
                                if (typeof keyPathFromConfig === 'string')
                                    isOnlyKeyPath =
                                        itemKeys.length === 1 && itemKeys[0] === keyPathFromConfig;
                                else if (Array.isArray(keyPathFromConfig))
                                    isOnlyKeyPath =
                                        itemKeys.length === keyPathFromConfig.length &&
                                        keyPathFromConfig.every((k) => itemKeys.includes(k));
                                if (
                                    isOnlyKeyPath &&
                                    Object.keys(item).every(
                                        (k) =>
                                            item[k] === null ||
                                            item[k] === undefined ||
                                            (typeof item[k] === 'string' && item[k].trim() === ''),
                                    )
                                ) {
                                    errorsOccurred.push({
                                        storeName,
                                        error: `Элемент содержит только ключ(и) '${keyPathFromConfig}' с пустыми значениями`,
                                        item: JSON.stringify(item).substring(0, 100),
                                    });
                                    skippedPuts++;
                                    continue;
                                }
                            }
                            validItemsForStore.push(item);
                        }
                        let itemsToImport = validItemsForStore;

                        if (storeName === 'screenshots') {
                            itemsToImport = itemsToImport
                                .map((item) => {
                                    if (item && item.hasOwnProperty('blob')) {
                                        const blobData = item.blob;
                                        if (
                                            typeof blobData === 'object' &&
                                            blobData !== null &&
                                            typeof blobData.base64 === 'string' &&
                                            typeof blobData.type === 'string'
                                        ) {
                                            const convertedBlob = base64ToBlob(
                                                blobData.base64,
                                                blobData.type,
                                            );
                                            if (convertedBlob instanceof Blob) {
                                                item.blob = convertedBlob;
                                            } else {
                                                errorsOccurred.push({
                                                    storeName,
                                                    error: `Ошибка конвертации Base64->Blob для скриншота ID: ${
                                                        item.id || 'N/A'
                                                    }`,
                                                    item: `(данные blob: ${JSON.stringify(
                                                        blobData,
                                                    )?.substring(0, 50)}...)`,
                                                });
                                                delete item.blob;
                                            }
                                        } else if (blobData === null) {
                                            delete item.blob;
                                        } else if (!(blobData instanceof Blob)) {
                                            errorsOccurred.push({
                                                storeName,
                                                error: `Некорректный тип данных в поле blob для ID: ${
                                                    item.id || 'N/A'
                                                }`,
                                                item: `(тип blob: ${typeof blobData})`,
                                            });
                                            delete item.blob;
                                        }
                                    }
                                    return item;
                                })
                                .filter(
                                    (item) =>
                                        !(item.hasOwnProperty('blob') && item.blob === undefined),
                                );
                        } else if (storeName === 'pdfFiles') {
                            itemsToImport = itemsToImport
                                .map((item) => {
                                    if (item && item.hasOwnProperty('blob')) {
                                        const blobData = item.blob;
                                        if (
                                            typeof blobData === 'object' &&
                                            blobData !== null &&
                                            typeof blobData.base64 === 'string' &&
                                            typeof blobData.type === 'string'
                                        ) {
                                            const convertedBlob = base64ToBlob(
                                                blobData.base64,
                                                blobData.type,
                                            );
                                            if (convertedBlob instanceof Blob) {
                                                item.blob = convertedBlob;
                                            } else {
                                                errorsOccurred.push({
                                                    storeName,
                                                    error: `Ошибка конвертации Base64->Blob для PDF ID: ${
                                                        item.id || 'N/A'
                                                    }`,
                                                    item: `(данные blob: ${JSON.stringify(
                                                        blobData,
                                                    )?.substring(0, 50)}.)`,
                                                });
                                                delete item.blob;
                                            }
                                        } else if (blobData === null) {
                                            delete item.blob;
                                        } else if (!(blobData instanceof Blob)) {
                                            errorsOccurred.push({
                                                storeName,
                                                error: `Некорректный тип данных в поле blob для PDF ID: ${
                                                    item.id || 'N/A'
                                                }`,
                                                item: `(тип blob: ${typeof blobData})`,
                                            });
                                            delete item.blob;
                                        }
                                    }
                                    return item;
                                })
                                .filter(
                                    (item) =>
                                        !(item.hasOwnProperty('blob') && item.blob === undefined),
                                );
                        }

                        if (itemsToImport.length > 0) {
                            let store = null;
                            try {
                                store = transaction.objectStore(storeName);
                            } catch (storeError) {
                                errorsOccurred.push({
                                    storeName,
                                    error: `Ошибка доступа к ${storeName} для добавления: ${storeError.message}`,
                                    item: null,
                                });
                                totalItemsToPut = Math.max(
                                    0,
                                    totalItemsToPut - itemsToImport.length,
                                );
                                continue;
                            }
                            for (const item of itemsToImport) {
                                putPromises.push(
                                    new Promise((resolveReq, rejectReq) => {
                                        try {
                                            const putRequest = store.put(item);
                                            putRequest.onsuccess = () => {
                                                processedItemsPut++;
                                                updateFineGrainedProgressForImport(
                                                    baseProgressForImportData,
                                                    STAGE_WEIGHTS_ACTUAL_IMPORT.IMPORT_DATA,
                                                    processedItemsPut,
                                                    totalItemsToPut,
                                                    'Запись данных',
                                                );
                                                resolveReq({
                                                    storeName,
                                                    operation: 'put',
                                                    success: true,
                                                });
                                            };
                                            putRequest.onerror = (e_put) => {
                                                processedItemsPut++;
                                                updateFineGrainedProgressForImport(
                                                    baseProgressForImportData,
                                                    STAGE_WEIGHTS_ACTUAL_IMPORT.IMPORT_DATA,
                                                    processedItemsPut,
                                                    totalItemsToPut,
                                                    'Запись данных',
                                                );
                                                const errorMsg_put =
                                                    e_put.target.error?.message ||
                                                    'Put request failed';
                                                errorsOccurred.push({
                                                    storeName,
                                                    error: `Ошибка записи: ${errorMsg_put}`,
                                                    item: JSON.stringify(item)?.substring(0, 100),
                                                });
                                                rejectReq(
                                                    e_put.target.error || new Error(errorMsg_put),
                                                );
                                            };
                                        } catch (putError) {
                                            processedItemsPut++;
                                            updateFineGrainedProgressForImport(
                                                baseProgressForImportData,
                                                STAGE_WEIGHTS_ACTUAL_IMPORT.IMPORT_DATA,
                                                processedItemsPut,
                                                totalItemsToPut,
                                                'Запись данных',
                                            );
                                            errorsOccurred.push({
                                                storeName,
                                                error: `Исключение при записи: ${putError.message}`,
                                                item: JSON.stringify(item).substring(0, 100),
                                            });
                                            rejectReq(putError);
                                        }
                                    }),
                                );
                            }
                        }
                    }

                    Promise.all(putPromises)
                        .then((putResults) => {
                            currentImportProgress = Math.max(
                                currentImportProgress,
                                baseProgressForImportData + STAGE_WEIGHTS_ACTUAL_IMPORT.IMPORT_DATA,
                            );
                            if (
                                typeof loadingOverlayManager !== 'undefined' &&
                                loadingOverlayManager.updateProgress
                            )
                                deps.loadingOverlayManager?.updateProgress(
                                    Math.min(currentImportProgress, 99),
                                    'Запись данных завершена',
                                );
                            console.log('[_processActualImport V7] Все элементы успешно записаны.');
                        })
                        .catch((promiseAllError) => {
                            console.error(
                                '[_processActualImport V7] Ошибка в Promise.all(putPromises), одна или несколько записей не удались:',
                                promiseAllError,
                            );
                            if (transaction.abort) {
                                console.log(
                                    '[_processActualImport V7] Отмена транзакции из-за ошибки записи.',
                                );
                                transaction.abort();
                            } else {
                                rejectPromise(promiseAllError);
                            }
                        });
                },
            );
        } catch (transactionError) {
            console.error(
                '[_processActualImport V7] Ошибка на уровне транзакции импорта:',
                transactionError,
            );
            notificationMessageOnError = `Ошибка транзакции при импорте: ${
                transactionError.message || transactionError
            }. Данные не были изменены.`;
            throw transactionError;
        }

        if (importTransactionSuccessful) {
            const reglamentsWereImportedFromFile = storesToImport.includes('reglaments');
            const preferencesWereInFile = Object.keys(importData.data).includes('preferences');
            let categoryInfoWasInImportedPreferences = false;
            if (
                preferencesWereInFile &&
                importData.data.preferences &&
                Array.isArray(importData.data.preferences)
            ) {
                categoryInfoWasInImportedPreferences = importData.data.preferences.some(
                    (p) => p.id === CATEGORY_INFO_KEY,
                );
            }

            if (
                reglamentsWereImportedFromFile &&
                (!preferencesWereInFile || !categoryInfoWasInImportedPreferences)
            ) {
                console.warn(
                    `[_processActualImport V7] Регламенты импортированы, но ${CATEGORY_INFO_KEY} отсутствует в импортированных preferences или preferences не импортировались. Удаление старой ${CATEGORY_INFO_KEY} из БД...`,
                );
                try {
                    await deleteFromIndexedDB('preferences', CATEGORY_INFO_KEY);
                    console.log(
                        `[_processActualImport V7] Старая запись ${CATEGORY_INFO_KEY} удалена из 'preferences'.`,
                    );
                } catch (deleteError) {
                    console.error(
                        `[_processActualImport V7] Ошибка при удалении ${CATEGORY_INFO_KEY} из 'preferences':`,
                        deleteError,
                    );
                    errorsOccurred.push({
                        storeName: 'preferences',
                        error: `Ошибка очистки старых категорий (${CATEGORY_INFO_KEY}): ${deleteError.message}`,
                        item: CATEGORY_INFO_KEY,
                    });
                }
            }
        }

        if (importTransactionSuccessful) {
            console.log(
                '[_processActualImport V8] Импорт данных в IndexedDB завершен. Обновление приложения...',
            );

            console.log('[FIX] Принудительный сброс кэшей в памяти перед реинициализацией...');
            if (typeof algorithms !== 'undefined') {
                algorithms = { main: {}, program: [], skzi: [], lk1c: [], webReg: [] };
                console.log("[FIX] Кэш 'algorithms' сброшен.");
            }
            if (typeof State.extLinkCategoryInfo !== 'undefined') {
                State.extLinkCategoryInfo = {};
                console.log("[FIX] Кэш 'State.extLinkCategoryInfo' сброшен.");
            }

            if (
                typeof loadingOverlayManager !== 'undefined' &&
                loadingOverlayManager.updateProgress
            ) {
                deps.loadingOverlayManager?.updateProgress(
                    Math.min(currentImportProgress + 1, 99),
                    'Инициализация приложения',
                );
            }
            try {
                const dbReadyAfterImport = await appInit('import');
                if (!dbReadyAfterImport && State.db === null) {
                    throw new Error(
                        'Не удалось переинициализировать приложение после импорта (БД стала null).',
                    );
                }
                if (
                    storesToImport.includes('preferences') &&
                    importData.data.preferences?.some((p) => p.id === 'uiSettings')
                ) {
                    await loadUISettings();
                }

                updateTotalImportProgress(
                    STAGE_WEIGHTS_ACTUAL_IMPORT.APP_RE_INIT,
                    'Инициализация приложения',
                );

                const reglamentsListDiv = document.getElementById('reglamentsList');
                const categoryGrid = document.getElementById('reglamentCategoryGrid');

                if (
                    State.currentSection === 'reglaments' &&
                    reglamentsListDiv &&
                    !reglamentsListDiv.classList.contains('hidden') &&
                    categoryGrid &&
                    categoryGrid.classList.contains('hidden')
                ) {
                    const currentCategoryId = reglamentsListDiv.dataset.currentCategory;
                    if (currentCategoryId) {
                        console.log(
                            `[_processActualImport V7 - FIX] Обновление отображения регламентов для активной категории: ${currentCategoryId}`,
                        );
                        if (typeof showReglamentsForCategory === 'function') {
                            try {
                                await deps.showReglamentsForCategory?.(currentCategoryId);
                                console.log(
                                    `[_processActualImport V7 - FIX] showReglamentsForCategory для ${currentCategoryId} вызвана после импорта.`,
                                );
                                updateTotalImportProgress(
                                    STAGE_WEIGHTS_ACTUAL_IMPORT.RENDER_ACTIVE_REGLAMENTS,
                                    'Обновление регламентов',
                                );
                            } catch (e) {
                                console.error(
                                    `[_processActualImport V7 - FIX] Ошибка при вызове showReglamentsForCategory для категории ${currentCategoryId}:`,
                                    e,
                                );
                                if (
                                    typeof NotificationService !== 'undefined' &&
                                    NotificationService.add
                                ) {
                                    deps.NotificationService?.add(
                                        `Ошибка обновления списка регламентов для категории. Попробуйте выбрать категорию заново.`,
                                        'warning',
                                    );
                                }
                                if (categoryGrid && reglamentsListDiv) {
                                    reglamentsListDiv.classList.add('hidden');
                                    categoryGrid.classList.remove('hidden');
                                    const currentCategoryTitleEl =
                                        document.getElementById('currentCategoryTitle');
                                    if (currentCategoryTitleEl)
                                        currentCategoryTitleEl.textContent = '';
                                    if (typeof renderReglamentCategories === 'function')
                                        renderReglamentCategories();
                                }
                            }
                        } else {
                            console.warn(
                                '[_processActualImport V7 - FIX] Функция showReglamentsForCategory не найдена для обновления UI регламентов.',
                            );
                            if (
                                typeof NotificationService !== 'undefined' &&
                                NotificationService.add
                            ) {
                                deps.NotificationService?.add(
                                    'Ошибка: не удалось обновить список регламентов (функция не найдена).',
                                    'error',
                                );
                            }
                        }
                    } else {
                        console.warn(
                            '[_processActualImport V7 - FIX] reglamentsListDiv активен, но currentCategory не найден в dataset. Не удалось обновить список регламентов.',
                        );
                        if (deps.NotificationService?.add) {
                            deps.NotificationService?.add(
                                'Не удалось определить активную категорию регламентов для обновления.',
                                'warning',
                            );
                        }
                    }
                } else {
                    updateTotalImportProgress(
                        STAGE_WEIGHTS_ACTUAL_IMPORT.RENDER_ACTIVE_REGLAMENTS || 0,
                        'Обновление регламентов (пропущено)',
                    );
                }

                if (
                    typeof loadingOverlayManager !== 'undefined' &&
                    loadingOverlayManager.updateProgress
                ) {
                    deps.loadingOverlayManager?.updateProgress(100, 'FinalizeImportSuccess');
                }
                console.log(
                    '[_processActualImport V7] Финальный прогресс импорта установлен на 100%.',
                );

                const nonFatalErrors = errorsOccurred.filter(
                    (e) =>
                        !e.error.includes('Критическая ошибка транзакции') &&
                        !e.error.includes('Транзакция прервана'),
                );
                if (nonFatalErrors.length > 0 || skippedPuts > 0) {
                    let errorSummary = nonFatalErrors
                        .map(
                            (e) =>
                                `  - ${e.storeName}: ${e.error}${
                                    e.item ? ` (Элемент: ${e.item})` : ''
                                }`,
                        )
                        .join('\n');
                    if (skippedPuts > 0) {
                        const skippedMsg = `\n  - Пропущено при валидации (до записи): ${skippedPuts} записей.`;
                        errorSummary =
                            nonFatalErrors.length > 0
                                ? errorSummary + skippedMsg
                                : skippedMsg.trimStart();
                    }
                    if (errorSummary.length > 500)
                        errorSummary =
                            errorSummary.substring(0, 500) +
                            '...\n(Полный список ошибок в консоли)';
                    const importWarningMessage = `Импорт завершен с ${
                        nonFatalErrors.length + skippedPuts
                    } предупреждениями/пропусками. Детали в консоли.`;
                    if (deps.NotificationService?.add)
                        deps.NotificationService?.add(importWarningMessage, 'warning', {
                            important: true,
                            duration: 15000,
                        });
                    console.warn(
                        `Предупреждения/ошибки/пропуски при импорте (всего ${
                            nonFatalErrors.length + skippedPuts
                        }):`,
                        nonFatalErrors,
                        `Skipped Validating: ${skippedPuts}`,
                    );
                    return { success: true, message: importWarningMessage };
                } else {
                    if (deps.NotificationService?.add)
                        deps.NotificationService?.add(
                            'Импорт данных успешно завершен. Приложение обновлено!',
                            'success',
                            { duration: 7000 },
                        );
                    return { success: true };
                }
            } catch (postImportError) {
                console.error(
                    '[_processActualImport V8] Критическая ошибка во время обновления приложения после импорта:',
                    postImportError,
                );
                notificationMessageOnError = `Критическая ошибка после импорта: ${postImportError.message}. Пожалуйста, обновите страницу (F5).`;
                throw postImportError;
            }
        } else {
            console.error(
                '[_processActualImport V7] Транзакция импорта НЕ УДАЛАСЬ (importTransactionSuccessful is false).',
            );
            if (
                !errorsOccurred.some(
                    (e) =>
                        e.error.includes('Критическая ошибка транзакции') ||
                        e.error.includes('Транзакция прервана'),
                )
            ) {
                notificationMessageOnError =
                    'Импорт данных не удался из-за ошибок при записи или очистке. Данные не были изменены.';
            } else if (errorsOccurred.length > 0) {
                notificationMessageOnError =
                    errorsOccurred.find(
                        (e) =>
                            e.error.includes('Критическая ошибка транзакции') ||
                            e.error.includes('Транзакция прервана'),
                    )?.error || 'Импорт данных не удался из-за ошибки транзакции.';
            } else {
                notificationMessageOnError =
                    'Импорт данных не удался по неизвестной причине в транзакции.';
            }
            throw new Error(notificationMessageOnError);
        }
    } catch (error) {
        console.error('[_processActualImport V7] Общая ошибка выполнения импорта:', error);
        if (
            notificationMessageOnError === 'Произошла ошибка во время импорта.' ||
            (error.message && !notificationMessageOnError.includes(error.message))
        ) {
            notificationMessageOnError = `Ошибка импорта: ${error.message || 'Неизвестная ошибка'}`;
        }
        if (
            typeof loadingOverlayManager !== 'undefined' &&
            deps.loadingOverlayManager?.overlayElement &&
            loadingOverlayManager.updateProgress
        ) {
            deps.loadingOverlayManager?.updateProgress(100, 'Ошибка импорта');
        }
        if (deps.NotificationService?.add)
            deps.NotificationService?.add(notificationMessageOnError, 'error', {
                important: true,
                duration: 0,
            });
        return { success: false, message: notificationMessageOnError };
    }
}

// ============================================================================
// ЭКСПОРТ ДАННЫХ
// ============================================================================

/**
 * Экспортирует все данные из IndexedDB в JSON файл
 * @param {Object} options - Опции экспорта
 * @param {boolean} options.isForcedBackupMode - Режим принудительного бэкапа
 * @returns {Promise<boolean>} - Результат экспорта
 */
export async function exportAllData(options = {}) {
    console.log(
        `[exportAllData v_FIXED_LOGIC_FINAL] Начало экспорта. Options:`,
        JSON.parse(JSON.stringify(options || {}))
    );

    if (State.isExportOperationInProgress) {
        console.warn('[exportAllData] Экспорт уже выполняется. Повторный вызов заблокирован.');
        if (!(options && options.isForcedBackupMode)) {
            deps.NotificationService?.add(
                'Операция экспорта уже выполняется. Пожалуйста, подождите.',
                'warning',
                { duration: 4000 }
            );
        }
        return false;
    }

    State.isExportOperationInProgress = true;
    let functionResult = false;
    const { isForcedBackupMode = false } = options;

    deps.NotificationService?.dismissImportant('export-cancelled-timeout');
    deps.NotificationService?.dismissImportant('export-cancelled-by-user-focus');
    deps.NotificationService?.dismissImportant('export-save-file-picker-failed');
    deps.NotificationService?.dismissImportant('export-data-prep-failed');
    deps.NotificationService?.dismissImportant('export-generic-error');
    await new Promise((resolve) =>
        setTimeout(resolve, (deps.NotificationService?.FADE_DURATION_MS || 300) + 50)
    );

    try {
        if (!isForcedBackupMode) {
            deps.NotificationService?.add('Подготовка данных для экспорта.', 'info', {
                duration: 3000,
                id: 'export-data-prep-started',
            });
        }

        if (!State.db) {
            console.error(
                '[exportAllData] Export failed: Database (db variable) is not initialized.'
            );
            if (!isForcedBackupMode) {
                deps.NotificationService?.add('Ошибка экспорта: База данных не доступна', 'error', {
                    important: true,
                    id: 'export-db-not-ready',
                });
            }
            throw new Error('База данных не доступна');
        }

        const allStoreNames = Array.from(State.db.objectStoreNames);
        const storesToRead = allStoreNames.filter((storeName) => storeName !== 'searchIndex');

        if (storesToRead.length === 0) {
            console.warn('[exportAllData] Нет хранилищ для экспорта (кроме searchIndex).');
            if (!isForcedBackupMode)
                deps.NotificationService?.add('Нет данных для экспорта.', 'warning', {
                    id: 'export-no-data',
                });
            return isForcedBackupMode ? true : false;
        }

        const exportData = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            exportDate: new Date().toISOString(),
            data: {},
        };

        const blobToBase64 = (blob) =>
            new Promise((resolve, reject) => {
                if (!(blob instanceof Blob)) return resolve(null);
                const reader = new FileReader();
                reader.onerror = (e) => reject(e.target.error);
                reader.onload = () =>
                    resolve({ base64: reader.result.split(',')[1], type: blob.type });
                reader.readAsDataURL(blob);
            });

        let transaction;
        try {
            transaction = State.db.transaction(storesToRead, 'readonly');
            const dataPromises = storesToRead.map(
                (storeName) =>
                    new Promise((resolve, reject) => {
                        const request = transaction.objectStore(storeName).getAll();
                        request.onsuccess = (e) => resolve({ storeName, data: e.target.result });
                        request.onerror = (e) =>
                            reject(
                                new Error(
                                    `Ошибка чтения из ${storeName}: ${e.target.error?.message}`
                                )
                            );
                    })
            );
            const results = await Promise.all(dataPromises);

            const screenshotData = results.find((r) => r.storeName === 'screenshots');
            if (
                screenshotData &&
                Array.isArray(screenshotData.data) &&
                screenshotData.data.length > 0
            ) {
                if (!isForcedBackupMode)
                    deps.NotificationService?.add(
                        `Обработка ${screenshotData.data.length} скриншотов.`,
                        'info',
                        { duration: 2000, id: 'export-screenshot-processing' }
                    );
                const conversionPromises = screenshotData.data.map(async (item) => {
                    if (item && item.blob instanceof Blob) {
                        try {
                            const base64Data = await blobToBase64(item.blob);
                            if (base64Data) return { ...item, blob: base64Data };
                        } catch (convErr) {
                            return { ...item, blob: undefined, conversionError: convErr.message };
                        }
                    }
                    return item;
                });
                screenshotData.data = await Promise.all(conversionPromises);
            }

            const pdfData = results.find((r) => r.storeName === 'pdfFiles');
            if (pdfData && Array.isArray(pdfData.data) && pdfData.data.length > 0) {
                const convertiblePdfCount = pdfData.data.filter(
                    (item) => item && item.blob instanceof Blob
                ).length;
                if (!isForcedBackupMode)
                    deps.NotificationService?.add(
                        `Обработка ${convertiblePdfCount} PDF-файлов.`,
                        'info',
                        { duration: 2000, id: 'export-pdf-processing' }
                    );
                const pdfConversionPromises = pdfData.data.map(async (item) => {
                    if (item && item.blob instanceof Blob) {
                        try {
                            const base64Data = await blobToBase64(item.blob);
                            if (base64Data) return { ...item, blob: base64Data };
                        } catch (convErr) {
                            return { ...item, blob: undefined, conversionError: convErr.message };
                        }
                    }
                    return item;
                });
                pdfData.data = await Promise.all(pdfConversionPromises);
            }

            results.forEach((result) => {
                exportData.data[result.storeName] = Array.isArray(result.data) ? result.data : [];
            });
        } catch (dataPrepError) {
            console.error(
                '[exportAllData] Ошибка при подготовке данных для экспорта:',
                dataPrepError
            );
            if (!isForcedBackupMode)
                deps.NotificationService?.add(
                    `Критическая ошибка при подготовке экспорта: ${dataPrepError.message}`,
                    'error',
                    {
                        important: true,
                        id: 'export-data-prep-failed',
                    }
                );
            if (transaction && typeof transaction.abort === 'function')
                try {
                    transaction.abort();
                } catch (e) {}
            throw dataPrepError;
        }

        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
        const exportFileName = `${
            isForcedBackupMode ? '1C_Support_Guide_Backup_' : '1C_Support_Guide_Export_'
        }${timestamp}.json`;
        const dataBlob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json;charset=utf-8',
        });

        State.isExpectingExportFileDialog = true;
        State.exportDialogInteractionComplete = false;

        State.exportWatchdogTimerId = setTimeout(() => {
            if (
                State.exportWatchdogTimerId &&
                State.isExpectingExportFileDialog &&
                !State.exportDialogInteractionComplete
            ) {
                console.warn('[Export Watchdog] Сработал таймаут ожидания диалога сохранения.');
                deps.NotificationService?.add('Экспорт отменен: превышено время ожидания.', 'warning', {
                    duration: 7000,
                    id: 'export-cancelled-timeout',
                });
                functionResult = false;
                State.isExpectingExportFileDialog = false;
                if (State.exportWindowFocusHandlerInstance) {
                    window.removeEventListener('focus', State.exportWindowFocusHandlerInstance);
                    State.exportWindowFocusHandlerInstance = null;
                }
            }
        }, DIALOG_WATCHDOG_TIMEOUT_NEW);

        try {
            if (window.showSaveFilePicker) {
                console.log('[exportAllData] Используется File System Access API.');
                if (State.exportWindowFocusHandlerInstance) {
                    window.removeEventListener('focus', State.exportWindowFocusHandlerInstance);
                    State.exportWindowFocusHandlerInstance = null;
                }
                const handle = await window.showSaveFilePicker({
                    suggestedName: exportFileName,
                    types: [
                        { description: 'JSON Files', accept: { 'application/json': ['.json'] } },
                    ],
                });
                State.exportDialogInteractionComplete = true;
                const writable = await handle.createWritable();
                await writable.write(dataBlob);
                await writable.close();
                if (!isForcedBackupMode)
                    deps.NotificationService?.add('Данные успешно сохранены в файл.', 'success', {
                        id: 'export-success-fsapi',
                    });
                functionResult = true;
            } else {
                console.log(
                    '[exportAllData] File System Access API не поддерживается, используется резервный метод.'
                );
                if (State.exportWindowFocusHandlerInstance)
                    window.removeEventListener('focus', State.exportWindowFocusHandlerInstance);
                State.exportWindowFocusHandlerInstance = () => {
                    if (State.isExpectingExportFileDialog && !State.exportDialogInteractionComplete) {
                        console.log(
                            '[Export Focus Handler] Диалог ожидался, но взаимодействие не завершено. Считаем отменой.'
                        );
                        if (!isForcedBackupMode)
                            deps.NotificationService?.add('Экспорт отменен пользователем.', 'info', {
                                duration: 5000,
                                id: 'export-cancelled-by-user-focus',
                            });
                        functionResult = false;
                    }
                    if (State.exportWindowFocusHandlerInstance) {
                        window.removeEventListener('focus', State.exportWindowFocusHandlerInstance);
                        State.exportWindowFocusHandlerInstance = null;
                    }
                };
                window.addEventListener('focus', State.exportWindowFocusHandlerInstance);
                const dataUri = URL.createObjectURL(dataBlob);
                const linkElement = document.createElement('a');
                linkElement.href = dataUri;
                linkElement.download = exportFileName;
                document.body.appendChild(linkElement);
                linkElement.click();
                document.body.removeChild(linkElement);
                setTimeout(() => {
                    if (!State.exportDialogInteractionComplete) {
                        State.exportDialogInteractionComplete = true;
                        if (functionResult !== false) {
                            functionResult = true;
                            if (!isForcedBackupMode)
                                deps.NotificationService?.add('Экспорт данных инициирован.', 'success');
                        }
                    }
                    URL.revokeObjectURL(dataUri);
                }, 1000);
            }
        } catch (err) {
            State.exportDialogInteractionComplete = true;
            if (err.name === 'AbortError') {
                console.log(
                    '[exportAllData] Экспорт отменен пользователем (File System Access API).'
                );
                if (!isForcedBackupMode)
                    deps.NotificationService?.add('Экспорт отменен пользователем.', 'info', {
                        id: 'export-cancelled-user-fsapi',
                    });
                functionResult = false;
            } else {
                console.error('[exportAllData] Ошибка сохранения файла:', err);
                if (!isForcedBackupMode)
                    deps.NotificationService?.add(`Ошибка сохранения файла: ${err.message}.`, 'error', {
                        important: true,
                        id: 'export-save-file-picker-failed',
                    });
                functionResult = false;
            }
        }
    } catch (error) {
        console.error('[exportAllData] Критическая ошибка в процессе экспорта:', error);
        functionResult = false;
        if (!isForcedBackupMode) {
            deps.NotificationService?.add(
                `Критическая ошибка экспорта: ${error.message || 'Неизвестная ошибка'}`,
                'error',
                { important: true, id: 'export-generic-error' }
            );
        }
    } finally {
        if (State.exportWatchdogTimerId) clearTimeout(State.exportWatchdogTimerId);
        if (State.exportWindowFocusHandlerInstance)
            window.removeEventListener('focus', State.exportWindowFocusHandlerInstance);
        State.isExportOperationInProgress = false;
        State.isExpectingExportFileDialog = false;
        State.exportWindowFocusHandlerInstance = null;
        State.exportWatchdogTimerId = null;
        console.log(
            `[exportAllData FINALLY] Процесс экспорта завершен. Возвращаемое значение будет: ${functionResult}`
        );
    }

    return functionResult;
}
