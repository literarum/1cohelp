'use strict';

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Экранирует специальные символы для регулярных выражений
 */
export function escapeRegExp(string) {
    if (typeof string !== 'string') return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Конвертирует Base64 строку в Blob
 */
export function base64ToBlob(base64, mimeType = '') {
    if (!base64 || typeof base64 !== 'string') {
        console.error(`Ошибка конвертации Base64 в Blob: Передана невалидная строка Base64.`);
        return null;
    }
    try {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        if (!base64Data) {
            console.error(
                `Ошибка конвертации Base64 в Blob: Строка Base64 пуста после удаления префикса.`,
            );
            return null;
        }
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    } catch (error) {
        console.error(
            `Ошибка конвертации Base64 в Blob (MIME: ${mimeType}, Base64 начало: ${base64.substring(
                0,
                30,
            )}...):`,
            error,
        );
        if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
            console.error('   > Вероятно, строка Base64 содержит невалидные символы.');
        }
        return null;
    }
}

/**
 * Форматирует данные примера для textarea
 */
export function formatExampleForTextarea(exampleData) {
    if (!exampleData) {
        return '';
    }

    if (typeof exampleData === 'object' && exampleData !== null && exampleData.type === 'list') {
        const intro = exampleData.intro ? String(exampleData.intro).trim() + '\n' : '';
        const items = Array.isArray(exampleData.items)
            ? exampleData.items
                  .map(
                      (item) =>
                          `- ${String(item)
                              .replace(/<[^>]*>/g, '')
                              .trim()}`,
                  )
                  .join('\n')
            : '';
        return (intro + items).trim();
    }

    if (typeof exampleData === 'string') {
        return exampleData.trim();
    }

    try {
        return JSON.stringify(exampleData, null, 2).trim();
    } catch {
        return '[Невалидные данные примера]';
    }
}

/**
 * Получает название секции по её ID
 */
export function getSectionName(section) {
    switch (section) {
        case 'program':
            return 'Программа 1С/УП';
        case 'skzi':
            return 'СКЗИ';
        case 'lk1c':
            return '1СО ЛК';
        case 'webReg':
            return 'Веб-Регистратор';
        default:
            return 'Основной';
    }
}

/**
 * Получает текстовое содержимое шага алгоритма
 */
export function getStepContentAsText(step) {
    let textParts = [];

    if (step.description) {
        let descriptionText = '';
        if (typeof step.description === 'string') {
            descriptionText = step.description;
        } else if (typeof step.description === 'object' && step.description.type === 'list') {
            let descListText = step.description.intro || '';
            if (Array.isArray(step.description.items)) {
                step.description.items.forEach((item) => {
                    descListText +=
                        (descListText ? '\n' : '') +
                        '- ' +
                        (typeof item === 'string' ? item : JSON.stringify(item));
                });
            }
            descriptionText = descListText;
        } else if (typeof step.description === 'object') {
            try {
                descriptionText = JSON.stringify(step.description);
            } catch (e) {
                descriptionText = '[не удалось преобразовать описание в текст]';
            }
        }
        if (descriptionText.trim()) {
            textParts.push(descriptionText.trim());
        }
    }

    if (step.example) {
        let examplePrefix = 'Пример:';
        let exampleContent = '';
        if (typeof step.example === 'string') {
            exampleContent = step.example;
        } else if (typeof step.example === 'object' && step.example.type === 'list') {
            if (step.example.intro) {
                exampleContent = step.example.intro.trim();
            }
            if (Array.isArray(step.example.items)) {
                step.example.items.forEach((item) => {
                    const itemText = typeof item === 'string' ? item : JSON.stringify(item);
                    exampleContent += (exampleContent ? '\n' : '') + '- ' + itemText;
                });
            }
            if (step.example.intro) {
                examplePrefix = '';
            }
        } else if (typeof step.example === 'object') {
            try {
                examplePrefix = 'Пример (данные):';
                exampleContent = JSON.stringify(step.example, null, 2);
            } catch (e) {
                exampleContent = '[не удалось преобразовать пример в текст]';
            }
        }

        if (exampleContent.trim()) {
            if (examplePrefix) {
                textParts.push(examplePrefix + '\n' + exampleContent.trim());
            } else {
                textParts.push(exampleContent.trim());
            }
        }
    }

    if (textParts.length > 1) {
        return textParts.join('\n\n').trim();
    } else if (textParts.length === 1) {
        return textParts[0].trim();
    } else {
        return '';
    }
}

/**
 * Создаёт debounce-версию функции
 * @param {Function} func - функция для debounce
 * @param {number} wait - задержка в миллисекундах
 * @param {boolean} immediate - вызвать сразу при первом вызове
 * @returns {Function} - debounce-версия функции
 */
export function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

/**
 * Настройка кнопки очистки поля ввода
 * @param {string} inputId - ID поля ввода
 * @param {string} buttonId - ID кнопки очистки
 * @param {Function} [actionCallback] - callback при очистке
 */
export function setupClearButton(inputId, buttonId, actionCallback) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);

    if (!input || !button) {
        console.warn(
            `Не удалось настроить кнопку очистки: поле ввода (${inputId}) или кнопка (${buttonId}) не найдены.`,
        );
        return;
    }

    const toggleButtonVisibility = () => {
        if (input && document.body.contains(input)) {
            button.classList.toggle('hidden', input.value.length === 0);
        } else {
            button.classList.add('hidden');
            console.warn(
                `Поле ввода ${inputId} больше не существует в DOM. Кнопка очистки ${buttonId} скрыта.`,
            );
        }
    };

    if (input._clearButtonInputHandler) {
        input.removeEventListener('input', input._clearButtonInputHandler);
    }
    if (button._clearButtonClickHandler) {
        button.removeEventListener('click', button._clearButtonClickHandler);
    }

    input._clearButtonInputHandler = toggleButtonVisibility;
    input.addEventListener('input', toggleButtonVisibility);

    toggleButtonVisibility();

    button._clearButtonClickHandler = () => {
        if (input && document.body.contains(input)) {
            input.value = '';
            button.classList.add('hidden');
            input.focus();

            if (typeof actionCallback === 'function') {
                try {
                    actionCallback();
                } catch (error) {
                    console.error(
                        `Ошибка при вызове actionCallback для кнопки очистки поля ${inputId}:`,
                        error,
                    );
                }
            }

            const event = new Event('input', { bubbles: true, cancelable: true });
            input.dispatchEvent(event);
        } else {
            console.warn(
                `Попытка очистить несуществующее поле ввода ${inputId} через кнопку ${buttonId}.`,
            );
        }
    };
    button.addEventListener('click', button._clearButtonClickHandler);

    console.log(
        `Кнопка очистки успешно настроена для поля ввода '${inputId}' и кнопки '${buttonId}'.`,
    );
}

/**
 * Глубокое сравнение двух объектов
 * @param {any} obj1 - первый объект
 * @param {any} obj2 - второй объект
 * @returns {boolean} - true если объекты равны
 */
export function deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
        return true;
    }

    if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') {
        if (Number.isNaN(obj1) && Number.isNaN(obj2)) {
            return true;
        }
        return false;
    }

    if (obj1 instanceof Date && obj2 instanceof Date) {
        return obj1.getTime() === obj2.getTime();
    }
    if (obj1 instanceof RegExp && obj2 instanceof RegExp) {
        return obj1.toString() === obj2.toString();
    }

    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            return false;
        }
        for (let i = 0; i < obj1.length; i++) {
            if (!deepEqual(obj1[i], obj2[i])) {
                return false;
            }
        }
        return true;
    }

    if (Array.isArray(obj1) || Array.isArray(obj2)) {
        return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (!Object.prototype.hasOwnProperty.call(obj2, key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}
