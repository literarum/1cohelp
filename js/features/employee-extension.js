'use strict';

/**
 * Модуль управления добавочным номером сотрудника
 */

import { State } from '../app/state.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

let deps = {
    showNotification: null,
    saveUserPreferences: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setEmployeeExtensionDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    if (dependencies.saveUserPreferences) deps.saveUserPreferences = dependencies.saveUserPreferences;
    console.log('[employee-extension.js] Зависимости установлены');
}

/**
 * Обновляет отображение добавочного номера
 * @param {string} extensionValue - значение номера
 */
export function updateExtensionDisplay(extensionValue) {
    const displaySpan = document.getElementById('employeeExtensionDisplay');
    if (!displaySpan) return;

    if (extensionValue) {
        displaySpan.textContent = extensionValue;
        displaySpan.classList.remove('italic', 'text-gray-500', 'dark:text-gray-400');
    } else {
        displaySpan.textContent = 'Введите свой добавочный';
        displaySpan.classList.add('italic', 'text-gray-500', 'dark:text-gray-400');
    }
}

/**
 * Загружает добавочный номер из хранилища
 */
export async function loadEmployeeExtension() {
    const displaySpan = document.getElementById('employeeExtensionDisplay');
    if (!displaySpan) return;

    let extension = '';
    try {
        if (State.db) {
            const pref = await getFromIndexedDB('preferences', 'employeeExtension');
            extension = pref?.value || '';
        } else {
            extension = localStorage.getItem('employeeExtension') || '';
            console.warn('Загрузка добавочного номера из localStorage (DB недоступна)');
        }
    } catch (error) {
        console.error('Ошибка при загрузке добавочного номера:', error);
        extension = localStorage.getItem('employeeExtension') || '';
    }
    updateExtensionDisplay(extension);
}

/**
 * Сохраняет добавочный номер
 * @param {string} extensionValue - значение номера
 * @returns {Promise<boolean>} результат операции
 */
export async function saveEmployeeExtension(extensionValue) {
    const valueToSave = extensionValue.trim().replace(/\D/g, '');

    try {
        if (State.db) {
            await saveToIndexedDB('preferences', { id: 'employeeExtension', value: valueToSave });
            console.log('Добавочный номер сохранен в IndexedDB:', valueToSave);
        } else {
            localStorage.setItem('employeeExtension', valueToSave);
            console.warn('Сохранение добавочного номера в localStorage (DB недоступна)');
        }
        updateExtensionDisplay(valueToSave);
        return true;
    } catch (error) {
        console.error('Ошибка при сохранении добавочного номера:', error);
        if (deps.showNotification) {
            deps.showNotification('Не удалось сохранить добавочный номер', 'error');
        }
        return false;
    }
}

/**
 * Настраивает обработчики событий для поля добавочного номера
 */
export function setupExtensionFieldListeners() {
    const displaySpan = document.getElementById('employeeExtensionDisplay');
    const inputField = document.getElementById('employeeExtensionInput');

    if (!(displaySpan instanceof HTMLElement) || !(inputField instanceof HTMLInputElement)) {
        if (deps.showNotification) {
            deps.showNotification(
                'Ошибка инициализации поля доб. номера (элементы не найдены).',
                'error',
                { important: true },
            );
        }
        return;
    }

    const removeListenerSafe = (element, eventName, handlerRefName) => {
        if (element && element[handlerRefName]) {
            element.removeEventListener(eventName, element[handlerRefName]);
            delete element[handlerRefName];
        }
    };

    removeListenerSafe(displaySpan, 'click', '_clickHandlerInstance');
    removeListenerSafe(inputField, 'blur', '_blurHandlerInstance');
    removeListenerSafe(inputField, 'keydown', '_keydownHandlerInstance');
    removeListenerSafe(inputField, 'input', '_inputHandlerInstance');

    const updateDisplayFromGlobalState = () => {
        const extensionValue = State.userPreferences?.employeeExtension || '';
        updateExtensionDisplay(extensionValue);
    };

    const clickHandler = () => {
        if (!displaySpan || !inputField) return;
        inputField.value = State.userPreferences?.employeeExtension || '';
        displaySpan.classList.add('hidden');
        inputField.classList.remove('hidden');
        requestAnimationFrame(() => {
            inputField.focus();
            inputField.select();
        });
    };
    displaySpan.addEventListener('click', clickHandler);
    displaySpan._clickHandlerInstance = clickHandler;

    const finishEditing = async (saveChanges = true) => {
        if (!(inputField instanceof HTMLInputElement) || inputField.classList.contains('hidden'))
            return;

        if (saveChanges) {
            const newValue = inputField.value.trim().replace(/\D/g, '');
            State.userPreferences.employeeExtension = newValue;
            if (deps.saveUserPreferences) {
                await deps.saveUserPreferences();
            }
        }

        updateDisplayFromGlobalState();
        inputField.classList.add('hidden');
        if (displaySpan instanceof HTMLElement) {
            displaySpan.classList.remove('hidden');
        }
    };

    const blurHandler = () => {
        setTimeout(async () => {
            if (
                inputField instanceof HTMLInputElement &&
                !inputField.classList.contains('hidden') &&
                document.activeElement !== inputField
            ) {
                await finishEditing(true);
            }
        }, 150);
    };
    inputField.addEventListener('blur', blurHandler);
    inputField._blurHandlerInstance = blurHandler;

    const keydownHandler = async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            await finishEditing(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            await finishEditing(false);
        }
    };
    inputField.addEventListener('keydown', keydownHandler);
    inputField._keydownHandlerInstance = keydownHandler;

    const inputHandler = () => {
        const originalValue = inputField.value;
        const numericValue = originalValue.replace(/\D/g, '');
        if (originalValue !== numericValue) {
            inputField.value = numericValue;
        }
    };
    inputField.addEventListener('input', inputHandler);
    inputField._inputHandlerInstance = inputHandler;

    updateDisplayFromGlobalState();
}
