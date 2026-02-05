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
