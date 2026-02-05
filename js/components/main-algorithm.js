'use strict';

import { escapeHtml } from '../utils/html.js';
import { getStepContentAsText } from '../utils/helpers.js';
import { MAIN_ALGO_COLLAPSE_KEY } from '../constants.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import * as State from '../app/state.js';

// ============================================================================
// КОМПОНЕНТ ГЛАВНОГО АЛГОРИТМА
// ============================================================================

// Зависимости будут установлены через setMainAlgorithmDependencies
let algorithms = null;
let copyToClipboard = null;
let DEFAULT_MAIN_ALGORITHM = null;

/**
 * Устанавливает зависимости для главного алгоритма
 */
export function setMainAlgorithmDependencies(deps) {
    algorithms = deps.algorithms;
    copyToClipboard = deps.copyToClipboard;
    DEFAULT_MAIN_ALGORITHM = deps.DEFAULT_MAIN_ALGORITHM;
}

/**
 * Загружает состояние свернутости главного алгоритма
 */
export async function loadMainAlgoCollapseState() {
    try {
        const saved = await getFromIndexedDB('preferences', MAIN_ALGO_COLLAPSE_KEY);
        if (saved && saved.data && typeof saved.data === 'object') {
            return saved.data;
        }
    } catch (error) {
        console.warn('[loadMainAlgoCollapseState] Ошибка загрузки состояния:', error);
    }
    return null;
}

/**
 * Сохраняет состояние свернутости главного алгоритма
 */
export async function saveMainAlgoCollapseState(state) {
    try {
        await saveToIndexedDB('preferences', {
            id: MAIN_ALGO_COLLAPSE_KEY,
            data: state,
        });
    } catch (error) {
        console.error('[saveMainAlgoCollapseState] Ошибка сохранения состояния:', error);
    }
}

/**
 * Рендерит главный алгоритм
 */
export async function renderMainAlgorithm() {
    console.log('[renderMainAlgorithm v9 - Favorites Removed for Main] Вызвана.');
    const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
    if (!mainAlgorithmContainer) {
        console.error('[renderMainAlgorithm v9] Контейнер #mainAlgorithm не найден.');
        return;
    }

    if (!algorithms) {
        console.error('[renderMainAlgorithm] algorithms не инициализирован');
        return;
    }

    mainAlgorithmContainer.innerHTML = '';

    if (
        !algorithms ||
        typeof algorithms !== 'object' ||
        !algorithms.main ||
        typeof algorithms.main !== 'object' ||
        !Array.isArray(algorithms.main.steps)
    ) {
        console.error(
            '[renderMainAlgorithm v9] Данные главного алгоритма (algorithms.main.steps) отсутствуют или невалидны:',
            algorithms?.main,
        );
        const errorP = document.createElement('p');
        errorP.className = 'text-red-500 dark:text-red-400 p-4 text-center font-medium';
        errorP.textContent = 'Ошибка: Не удалось загрузить шаги главного алгоритма.';
        mainAlgorithmContainer.appendChild(errorP);
        const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
        if (mainTitleElement) mainTitleElement.textContent = 'Главный алгоритм работы';
        return;
    }

    const mainSteps = algorithms.main.steps;

    const savedCollapse = await loadMainAlgoCollapseState();
    const validIndices =
        savedCollapse && savedCollapse.stepsCount === mainSteps.length
            ? savedCollapse.collapsedIndices.filter(
                  (i) => Number.isInteger(i) && i >= 0 && i < mainSteps.length,
              )
            : [];
    const collapsedSet = new Set(validIndices);

    if (mainSteps.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.className = 'text-gray-500 dark:text-gray-400 p-4 text-center';
        emptyP.textContent = 'В главном алгоритме пока нет шагов.';
        mainAlgorithmContainer.appendChild(emptyP);
        const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
        if (mainTitleElement) {
            mainTitleElement.textContent = algorithms.main.title || DEFAULT_MAIN_ALGORITHM?.title || 'Главный алгоритм';
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    mainSteps.forEach((step, index) => {
        if (!step || typeof step !== 'object') {
            console.warn('[renderMainAlgorithm v9] Пропуск невалидного объекта шага:', step);
            const errorDiv = document.createElement('div');
            errorDiv.className =
                'algorithm-step bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 mb-3 rounded-lg shadow-sm text-red-700 dark:text-red-300';
            errorDiv.textContent = `Ошибка: Некорректные данные для шага ${index + 1}.`;
            fragment.appendChild(errorDiv);
            return;
        }

        const stepDiv = document.createElement('div');
        stepDiv.className =
            'algorithm-step bg-white dark:bg-gray-700 p-content-sm rounded-lg shadow-sm mb-3';

        if (step.isCopyable) {
            stepDiv.classList.add('copyable-step-active');
            stepDiv.title = 'Нажмите, чтобы скопировать содержимое шага';
            stepDiv.style.cursor = 'pointer';
        } else {
            stepDiv.classList.remove('copyable-step-active');
            stepDiv.title = '';
            stepDiv.style.cursor = 'default';
        }

        stepDiv.addEventListener('click', (e) => {
            if (e.target.closest('h3')) return;
            if (e.target.tagName === 'A' || e.target.closest('A')) return;

            const currentStepData = algorithms.main.steps[index];
            if (currentStepData && currentStepData.isCopyable && copyToClipboard) {
                const textToCopy = getStepContentAsText(currentStepData);
                copyToClipboard(textToCopy, 'Содержимое шага скопировано!');
            }
        });

        // Добавление дополнительной информации сверху, если есть
        if (step.additionalInfoText && step.additionalInfoShowTop) {
            const additionalInfoTopDiv = document.createElement('div');
            additionalInfoTopDiv.className =
                'additional-info-top mb-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words';
            additionalInfoTopDiv.innerHTML =
                typeof window.linkify === 'function'
                    ? window.linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            stepDiv.appendChild(additionalInfoTopDiv);
        }

        // Заголовок шага
        const titleH3 = document.createElement('h3');
        titleH3.className = 'font-semibold text-gray-900 dark:text-gray-100 mb-2';
        titleH3.textContent = step.title || `Шаг ${index + 1}`;
        stepDiv.appendChild(titleH3);

        // Описание шага
        if (step.description) {
            const descDiv = document.createElement('div');
            descDiv.className = 'text-gray-700 dark:text-gray-300 mb-2';

            if (typeof step.description === 'string') {
                descDiv.innerHTML =
                    typeof window.linkify === 'function'
                        ? window.linkify(step.description)
                        : escapeHtml(step.description);
            } else if (typeof step.description === 'object' && step.description.type === 'list') {
                let listHTML = '';
                if (step.description.intro) {
                    listHTML += `<p class="mb-2">${escapeHtml(step.description.intro)}</p>`;
                }
                if (Array.isArray(step.description.items)) {
                    listHTML += '<ul class="list-disc list-inside space-y-1">';
                    step.description.items.forEach((item) => {
                        const itemText = typeof item === 'string' ? item : JSON.stringify(item);
                        listHTML += `<li>${escapeHtml(itemText)}</li>`;
                    });
                    listHTML += '</ul>';
                }
                descDiv.innerHTML = listHTML;
            }

            stepDiv.appendChild(descDiv);
        }

        // Пример для шага
        if (step.example) {
            const exampleDiv = document.createElement('div');
            exampleDiv.className =
                'mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-4 border-gray-400';

            if (typeof step.example === 'string') {
                exampleDiv.innerHTML = `<strong>Пример:</strong><br>${escapeHtml(step.example)}`;
            } else if (typeof step.example === 'object' && step.example.type === 'list') {
                let exampleHTML = '';
                if (step.example.intro) {
                    exampleHTML += `<p class="mb-2">${escapeHtml(step.example.intro)}</p>`;
                }
                if (Array.isArray(step.example.items)) {
                    exampleHTML += '<ul class="list-disc list-inside space-y-1">';
                    step.example.items.forEach((item) => {
                        const itemText = typeof item === 'string' ? item : JSON.stringify(item);
                        exampleHTML += `<li>${escapeHtml(itemText)}</li>`;
                    });
                    exampleHTML += '</ul>';
                }
                exampleDiv.innerHTML = exampleHTML;
            }

            stepDiv.appendChild(exampleDiv);
        }

        // Дополнительная информация снизу, если есть
        if (step.additionalInfoText && step.additionalInfoShowBottom) {
            const additionalInfoBottomDiv = document.createElement('div');
            additionalInfoBottomDiv.className =
                'additional-info-bottom mt-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words';
            additionalInfoBottomDiv.innerHTML =
                typeof window.linkify === 'function'
                    ? window.linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            stepDiv.appendChild(additionalInfoBottomDiv);
        }

        fragment.appendChild(stepDiv);
    });

    mainAlgorithmContainer.appendChild(fragment);

    // Обновление заголовка
    const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
    if (mainTitleElement) {
        mainTitleElement.textContent = algorithms.main.title || DEFAULT_MAIN_ALGORITHM?.title || 'Главный алгоритм работы';
    }

    console.log('[renderMainAlgorithm v9] Рендеринг главного алгоритма завершен.');
}
