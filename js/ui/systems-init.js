'use strict';

/**
 * Модуль инициализации систем приложения
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let DB_NAME = null;
let TIMER_STATE_KEY = null;
let BLACKLIST_WARNING_ACCEPTED_KEY = null;
let USER_PREFERENCES_KEY = null;
let CATEGORY_INFO_KEY = null;
let SEDO_CONFIG_KEY = null;
let addEscapeHandler = null;
let removeEscapeHandler = null;
let getVisibleModals = null;
let clearAllApplicationData = null;
let exportAllData = null;
let loadingOverlayManager = null;
let NotificationService = null;
let showNotification = null;

export function setSystemsInitDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.DB_NAME !== undefined) DB_NAME = deps.DB_NAME;
    if (deps.TIMER_STATE_KEY !== undefined) TIMER_STATE_KEY = deps.TIMER_STATE_KEY;
    if (deps.BLACKLIST_WARNING_ACCEPTED_KEY !== undefined) BLACKLIST_WARNING_ACCEPTED_KEY = deps.BLACKLIST_WARNING_ACCEPTED_KEY;
    if (deps.USER_PREFERENCES_KEY !== undefined) USER_PREFERENCES_KEY = deps.USER_PREFERENCES_KEY;
    if (deps.CATEGORY_INFO_KEY !== undefined) CATEGORY_INFO_KEY = deps.CATEGORY_INFO_KEY;
    if (deps.SEDO_CONFIG_KEY !== undefined) SEDO_CONFIG_KEY = deps.SEDO_CONFIG_KEY;
    if (deps.addEscapeHandler !== undefined) addEscapeHandler = deps.addEscapeHandler;
    if (deps.removeEscapeHandler !== undefined) removeEscapeHandler = deps.removeEscapeHandler;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
    if (deps.clearAllApplicationData !== undefined) clearAllApplicationData = deps.clearAllApplicationData;
    if (deps.exportAllData !== undefined) exportAllData = deps.exportAllData;
    if (deps.loadingOverlayManager !== undefined) loadingOverlayManager = deps.loadingOverlayManager;
    if (deps.NotificationService !== undefined) NotificationService = deps.NotificationService;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
}

// ============================================================================
// ФУНКЦИИ ИНИЦИАЛИЗАЦИИ СИСТЕМ
// ============================================================================

/**
 * Инициализирует функционал очистки данных приложения
 */
export function initClearDataFunctionality() {
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    const confirmClearDataModal = document.getElementById('confirmClearDataModal');
    const cancelClearDataBtn = document.getElementById('cancelClearDataBtn');
    const confirmAndClearDataBtn = document.getElementById('confirmAndClearDataBtn');
    const closeConfirmClearModalBtns = confirmClearDataModal?.querySelectorAll(
        '.close-confirm-clear-modal',
    );
    const exportBeforeClearBtn = document.getElementById('exportBeforeClearBtn');

    if (
        !clearAllDataBtn ||
        !confirmClearDataModal ||
        !cancelClearDataBtn ||
        !confirmAndClearDataBtn
    ) {
        console.warn(
            'Clear Data Functionality: One or more required elements not found. Feature disabled.',
        );
        return;
    }

    clearAllDataBtn.addEventListener('click', () => {
        confirmClearDataModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (typeof addEscapeHandler === 'function') {
            addEscapeHandler(confirmClearDataModal);
        } else {
            console.warn(
                '[initClearDataFunctionality] addEscapeHandler function not found for confirmClearDataModal.',
            );
        }
    });

    const closeConfirmModal = () => {
        confirmClearDataModal.classList.add('hidden');
        if (typeof removeEscapeHandler === 'function') {
            removeEscapeHandler(confirmClearDataModal);
        }
        const visibleModals = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
        if (
            visibleModals.filter((modal) => modal.id !== confirmClearDataModal.id).length === 0
        ) {
            document.body.classList.remove('modal-open');
        } else if (typeof getVisibleModals !== 'function') {
            document.body.classList.remove('modal-open');
        }
    };

    cancelClearDataBtn.addEventListener('click', closeConfirmModal);
    closeConfirmClearModalBtns?.forEach((btn) => {
        btn.addEventListener('click', closeConfirmModal);
    });

    confirmAndClearDataBtn.addEventListener('click', async () => {
        console.log('Attempting to clear all application data...');
        closeConfirmModal();

        try {
            localStorage.setItem('copilotIsReloadingAfterClear', 'true');
            console.log("Flag 'copilotIsReloadingAfterClear' set in localStorage.");
        } catch (e) {
            console.error("Failed to set 'copilotIsReloadingAfterClear' flag in localStorage:", e);
            if (NotificationService && NotificationService.add) {
                NotificationService.add(
                    'Ошибка установки флага перезагрузки. Очистка может пройти некорректно.',
                    'error',
                    { important: true },
                );
            }
        }

        try {
            console.log('Data clearing starting...');
            if (typeof clearAllApplicationData === 'function') {
                await clearAllApplicationData((percentage, message) => {
                    console.log(`[ClearData Progress (no overlay visible): ${percentage}%] ${message}`);
                });
            } else {
                throw new Error('Функция clearAllApplicationData не найдена');
            }

            console.log('Data clearing process finished successfully in handler.');
            console.log('Data cleared. Reloading page now...');
            window.location.reload();
        } catch (error) {
            console.error('Error during clearAllApplicationData or subsequent logic:', error);
            const errorMsg = error ? error.message || 'Неизвестная ошибка' : 'Произошла ошибка.';

            if (loadingOverlayManager && loadingOverlayManager.overlayElement) {
                loadingOverlayManager.updateProgress(
                    100,
                    `Ошибка: ${errorMsg.substring(0, 50)}...`,
                );
            }

            if (NotificationService && NotificationService.add) {
                NotificationService.add(
                    `Ошибка при очистке данных: ${errorMsg}. Пожалуйста, проверьте консоль и попробуйте снова.`,
                    'error',
                    { important: true, duration: 15000 },
                );
            } else if (typeof showNotification === 'function') {
                showNotification(
                    `Ошибка при очистке данных: ${errorMsg}. Пожалуйста, проверьте консоль и попробуйте снова.`,
                    'error',
                    15000,
                );
            }
        }
    });

    exportBeforeClearBtn?.addEventListener('click', () => {
        if (typeof exportAllData === 'function') {
            exportAllData();
        } else {
            if (typeof showNotification === 'function') {
                showNotification('Функция экспорта не найдена!', 'error');
            }
        }
    });
    console.log(
        'Функционал очистки данных инициализирован с исправленной логикой флага и оверлея.',
    );
}
