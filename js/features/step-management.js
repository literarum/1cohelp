'use strict';

/**
 * Модуль управления шагами алгоритмов
 * Содержит функции для работы со сворачиванием, удалением и нумерацией шагов
 */

import { State } from '../app/state.js';

let deps = {
    showNotification: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setStepManagementDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    console.log('[step-management.js] Зависимости установлены');
}

/**
 * Переключает состояние сворачивания шага
 * @param {HTMLElement} stepElement - элемент шага
 * @param {boolean} [forceCollapse] - принудительное состояние (true - свернуть, false - развернуть)
 */
export function toggleStepCollapse(stepElement, forceCollapse) {
    if (!stepElement) {
        console.warn('toggleStepCollapse: stepElement не предоставлен.');
        return;
    }
    if (typeof forceCollapse === 'boolean') {
        stepElement.classList.toggle('is-collapsed', forceCollapse);
    } else {
        stepElement.classList.toggle('is-collapsed');
    }
}

/**
 * Обновляет номера шагов в контейнере
 * @param {HTMLElement} containerElement - контейнер с шагами
 */
export function updateStepNumbers(containerElement) {
    if (!containerElement) return;
    const steps = containerElement.querySelectorAll('.edit-step');
    steps.forEach((step, index) => {
        const numberLabel = step.querySelector('.step-number-label');
        if (numberLabel) {
            numberLabel.textContent = `Шаг ${index + 1}`;
        }
        const deleteButton = step.querySelector('.delete-step');
        if (deleteButton) {
            deleteButton.setAttribute('aria-label', `Удалить шаг ${index + 1}`);
        }
    });
    console.log(`Номера шагов обновлены в контейнере ${containerElement.id}`);
}

/**
 * Прикрепляет обработчик удаления к кнопке удаления шага
 * @param {HTMLElement} deleteButton - кнопка удаления
 * @param {HTMLElement} stepElement - элемент шага
 * @param {HTMLElement} containerElement - контейнер с шагами
 * @param {string} section - секция алгоритма
 * @param {string} [mode='edit'] - режим (edit или add)
 */
export function attachStepDeleteHandler(
    deleteButton,
    stepElement,
    containerElement,
    section,
    mode = 'edit',
) {
    if (!deleteButton || !stepElement || !containerElement) {
        console.error('attachStepDeleteHandler: Не переданы необходимые элементы.');
        return;
    }

    const oldHandler = deleteButton._deleteHandler;
    if (oldHandler) {
        deleteButton.removeEventListener('click', oldHandler);
    }

    const newHandler = () => {
        const isMainSection = section === 'main';
        const canDelete =
            (mode === 'add' && containerElement.children.length > 0) ||
            (mode === 'edit' && (containerElement.children.length > 1 || !isMainSection));

        if (canDelete) {
            console.log(
                `Удаление шага ${
                    stepElement.dataset.stepIndex || '(новый)'
                } в режиме ${mode}, секция ${section}`,
            );
            const previewImg = stepElement.querySelector('.screenshot-preview');
            const objectUrl = previewImg?.dataset.objectUrl;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                console.log('Освобожден Object URL при удалении шага:', objectUrl);
                delete previewImg.dataset.objectUrl;
            }
            const currentId = stepElement.dataset.currentScreenshotId;
            if (currentId && !stepElement._tempScreenshotBlob) {
                stepElement.dataset.deleteScreenshot = 'true';
                console.log(
                    `Шаг удаляется, существующий скриншот ${currentId} помечен для удаления при сохранении.`,
                );
            } else if (stepElement._tempScreenshotBlob) {
                delete stepElement._tempScreenshotBlob;
                console.log('Шаг удаляется, временный Blob (_tempScreenshotBlob) очищен.');
            }

            stepElement.remove();

            updateStepNumbers(containerElement);

            if (mode === 'edit') {
                State.isUISettingsDirty = true;
                console.log(
                    'Установлен флаг изменений после удаления шага в режиме редактирования.',
                );
            } else if (mode === 'add' && containerElement.children.length === 0) {
                containerElement.innerHTML =
                    '<p class="text-gray-500 dark:text-gray-400 text-center">Добавьте шаги для нового алгоритма.</p>';
            }
        } else if (isMainSection && mode === 'edit') {
            if (deps.showNotification) {
                deps.showNotification('Главный алгоритм должен содержать хотя бы один шаг.', 'warning');
            }
        } else {
            console.log('Попытка удалить единственный шаг - проигнорировано.');
        }
    };

    deleteButton.addEventListener('click', newHandler);
    deleteButton._deleteHandler = newHandler;
}
