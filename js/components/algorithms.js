'use strict';

import { escapeHtml, linkify } from '../utils/html.js';
import { getStepContentAsText, getSectionName, formatExampleForTextarea, deepEqual } from '../utils/helpers.js';
import { State } from '../app/state.js';
import { renderMainAlgorithm } from './main-algorithm.js';

// ============================================================================
// КОМПОНЕНТ РАБОТЫ С АЛГОРИТМАМИ
// ============================================================================

// Глобальные переменные состояния редактирования
let initialEditState = null;
let initialAddState = null;

// Эти функции будут определены в главном файле или других модулях
// Пока используем глобальные ссылки для совместимости
let algorithms = null;
let isFavorite = null;
let getFavoriteButtonHTML = null;
let showAlgorithmDetail = null;
let copyToClipboard = null;
let applyCurrentView = null;
let loadMainAlgoCollapseState = null;
let saveMainAlgoCollapseState = null;

// Дополнительные зависимости для редактирования
let showNotification = null;
let attachStepDeleteHandler = null;
let attachScreenshotHandlers = null;
let updateStepNumbers = null;
let toggleStepCollapse = null;
let Sortable = null;

// Дополнительные зависимости для showAlgorithmDetail
let ExportService = null;
let renderScreenshotIcon = null;
let handleViewScreenshotClick = null;
let openAnimatedModal = null;

/**
 * Устанавливает зависимости для компонента алгоритмов
 */
export function setAlgorithmsDependencies(deps) {
    algorithms = deps.algorithms;
    isFavorite = deps.isFavorite;
    getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    showAlgorithmDetail = deps.showAlgorithmDetail;
    copyToClipboard = deps.copyToClipboard;
    applyCurrentView = deps.applyCurrentView;
    loadMainAlgoCollapseState = deps.loadMainAlgoCollapseState;
    saveMainAlgoCollapseState = deps.saveMainAlgoCollapseState;
    // Дополнительные зависимости для редактирования
    if (deps.showNotification) showNotification = deps.showNotification;
    if (deps.attachStepDeleteHandler) attachStepDeleteHandler = deps.attachStepDeleteHandler;
    if (deps.attachScreenshotHandlers) attachScreenshotHandlers = deps.attachScreenshotHandlers;
    if (deps.updateStepNumbers) updateStepNumbers = deps.updateStepNumbers;
    if (deps.toggleStepCollapse) toggleStepCollapse = deps.toggleStepCollapse;
    if (deps.Sortable) Sortable = deps.Sortable;
}

/**
 * Рендерит карточки алгоритмов для секции
 */
export async function renderAlgorithmCards(section) {
    if (!algorithms) {
        console.error('[renderAlgorithmCards] algorithms не инициализирован');
        return;
    }

    const sectionAlgorithms = algorithms?.[section];
    const containerId = section + 'Algorithms';
    const container = document.getElementById(containerId);

    if (!container) {
        console.error(
            `[renderAlgorithmCards v8.1 - Capture Fix] Контейнер #${containerId} не найден.`,
        );
        return;
    }
    container.innerHTML = '';

    if (!sectionAlgorithms || !Array.isArray(sectionAlgorithms) || sectionAlgorithms.length === 0) {
        const sectionName = getSectionName(section) || `Раздел ${section}`;
        container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center col-span-full mb-2">В разделе "${sectionName}" пока нет алгоритмов.</p>`;
        if (typeof applyCurrentView === 'function') applyCurrentView(containerId);
        return;
    }

    const fragment = document.createDocumentFragment();
    const safeEscapeHtml = typeof escapeHtml === 'function' ? escapeHtml : (text) => text;

    for (const algorithm of sectionAlgorithms) {
        if (!algorithm || typeof algorithm !== 'object' || !algorithm.id) {
            console.warn(
                `[renderAlgorithmCards v8.1] Пропуск невалидного объекта алгоритма в секции ${section}:`,
                algorithm,
            );
            continue;
        }

        const card = document.createElement('div');
        card.className =
            'algorithm-card js-algorithm-card-style-target view-item transition cursor-pointer h-full flex flex-col bg-white dark:bg-gray-700 shadow-sm hover:shadow-md rounded-lg p-4';
        card.dataset.id = algorithm.id;

        const titleText = algorithm.title || 'Без заголовка';

        let descriptionText = algorithm.description;
        if (!descriptionText && algorithm.steps && algorithm.steps.length > 0) {
            descriptionText = algorithm.steps[0].description || algorithm.steps[0].title || '';
        }

        const descriptionHTML = descriptionText
            ? `<p class="text-gray-600 dark:text-gray-400 text-sm mt-1 line-clamp-2 flex-grow">${safeEscapeHtml(
                  descriptionText,
              )}</p>`
            : '';

        const isFav = isFavorite && typeof isFavorite === 'function'
            ? isFavorite('algorithm', String(algorithm.id))
            : false;
        const favButtonHTML = getFavoriteButtonHTML && typeof getFavoriteButtonHTML === 'function'
            ? getFavoriteButtonHTML(
                  algorithm.id,
                  'algorithm',
                  section,
                  titleText,
                  descriptionText || '',
                  isFav,
              )
            : '';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-900 dark:text-gray-100 truncate flex-grow pr-2" title="${safeEscapeHtml(
                    titleText,
                )}">${safeEscapeHtml(titleText)}</h3>
                <div class="flex-shrink-0">${favButtonHTML}</div>
            </div>
            ${descriptionHTML}
        `;

        card.addEventListener('click', (event) => {
            if (event.target.closest('.toggle-favorite-btn')) {
                return;
            }
            if (typeof showAlgorithmDetail === 'function') {
                showAlgorithmDetail(algorithm, section);
            } else {
                console.error(
                    '[renderAlgorithmCards v8.1] Функция showAlgorithmDetail не определена.',
                );
            }
        });
        fragment.appendChild(card);
    }

    container.appendChild(fragment);

    if (typeof applyCurrentView === 'function') {
        applyCurrentView(containerId);
    }
    console.log(
        `[renderAlgorithmCards v8.1] Рендеринг для секции ${section} завершен с кнопками 'В избранное' и явной проверкой клика.`,
    );
}

/**
 * Получает текстовое представление алгоритма для поиска
 */
export function getAlgorithmText(algoData) {
    const texts = {};
    if (!algoData || typeof algoData !== 'object') {
        return texts;
    }
    
    const cleanHtml = (text) =>
        typeof text === 'string'
            ? text
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
            : '';

    if (algoData.title && typeof algoData.title === 'string') {
        const cleanedTitle = cleanHtml(algoData.title);
        if (cleanedTitle) texts.title = cleanedTitle;
    }

    let descriptionText = '';
    if (algoData.description && typeof algoData.description === 'string') {
        descriptionText = cleanHtml(algoData.description);
    }

    if (algoData.section && typeof getSectionName === 'function') {
        const sectionNameText = getSectionName(algoData.section);
        if (
            sectionNameText &&
            sectionNameText !== 'Основной' &&
            (!descriptionText ||
                !descriptionText.toLowerCase().includes(sectionNameText.toLowerCase()))
        ) {
            if (descriptionText) {
                descriptionText += ` ${sectionNameText}`;
            } else {
                descriptionText = sectionNameText;
            }
            texts.sectionNameForAlgo = sectionNameText;
        }
        if (algoData.section !== 'main') {
            texts.sectionIdForAlgo = algoData.section;
        }
    }

    if (descriptionText) {
        texts.description = descriptionText;
    }

    const stepsTextParts = [];
    if (algoData.steps && Array.isArray(algoData.steps)) {
        algoData.steps.forEach((step) => {
            if (!step || typeof step !== 'object') return;

            if (step.title && typeof step.title === 'string') {
                const cleanedStepTitle = cleanHtml(step.title);
                if (cleanedStepTitle) stepsTextParts.push(cleanedStepTitle);
            }

            if (step.description) {
                if (typeof step.description === 'string') {
                    const cleanedStepDesc = cleanHtml(step.description);
                    if (cleanedStepDesc) stepsTextParts.push(cleanedStepDesc);
                } else if (
                    typeof step.description === 'object' &&
                    step.description.type === 'list'
                ) {
                    if (step.description.intro && typeof step.description.intro === 'string') {
                        const cleanedIntro = cleanHtml(step.description.intro);
                        if (cleanedIntro) stepsTextParts.push(cleanedIntro);
                    }
                    if (Array.isArray(step.description.items)) {
                        step.description.items.forEach((item) => {
                            let itemText = '';
                            if (typeof item === 'string') {
                                itemText = cleanHtml(item);
                            } else if (item && typeof item.text === 'string') {
                                itemText = cleanHtml(item.text);
                            } else if (item && typeof item === 'object') {
                                try {
                                    itemText = cleanHtml(JSON.stringify(item));
                                } catch (e) {}
                            }
                            if (itemText) stepsTextParts.push(itemText);
                        });
                    }
                }
            }

            if (step.example) {
                const exampleAsText = formatExampleForTextarea(step.example);
                if (exampleAsText && typeof exampleAsText === 'string') {
                    const cleanedExample = cleanHtml(exampleAsText);
                    if (cleanedExample) stepsTextParts.push(cleanedExample);
                }
            }

            if (step.additionalInfoText && typeof step.additionalInfoText === 'string') {
                const cleanedAddInfo = cleanHtml(step.additionalInfoText);
                if (cleanedAddInfo) stepsTextParts.push(cleanedAddInfo);
            }
        });
    }
    const aggregatedStepsText = stepsTextParts.filter((part) => part && part.length > 0).join(' ');
    if (aggregatedStepsText) {
        texts.steps = aggregatedStepsText;
    }

    for (const key in algoData) {
        if (
            Object.prototype.hasOwnProperty.call(algoData, key) &&
            typeof algoData[key] === 'string'
        ) {
            const excludedKeys = [
                'id',
                'title',
                'description',
                'section',
                'dateAdded',
                'dateUpdated',
                'type',
                'aggregated_steps_content',
            ];
            if (!excludedKeys.includes(key) && texts[key] === undefined && !key.startsWith('_')) {
                const cleanedValue = cleanHtml(algoData[key]);
                if (cleanedValue) {
                    texts[key] = cleanedValue;
                }
            }
        }
    }
    return texts;
}

/**
 * Рендерит все алгоритмы
 */
export function renderAllAlgorithms() {
    // Используем импортированную функцию вместо window.renderMainAlgorithm
    renderMainAlgorithm();
    renderAlgorithmCards('program');
    renderAlgorithmCards('skzi');
    renderAlgorithmCards('webReg');
    renderAlgorithmCards('lk1c');
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РЕДАКТИРОВАНИЯ
// ============================================================================

/**
 * Создает HTML для элемента шага в форме редактирования
 */
export function createStepElementHTML(stepNumber, isMainAlgorithm, includeScreenshotsField) {
    const commonInputClasses =
        'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
    const commonTextareaClasses = `${commonInputClasses} resize-y`;

    const exampleInputHTML = isMainAlgorithm
        ? `
    <div class="mt-2">
        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Пример / Список (опционально)</label>
        <textarea class="step-example ${commonTextareaClasses}" rows="4" placeholder="Пример: Текст примера...\nИЛИ\n- Элемент списка 1\n- Элемент списка 2"></textarea>
        <p class="text-xs text-gray-500 mt-1">Для списка используйте дефис (-) или звездочку (*) в начале каждой строки. Первая строка без дефиса/звездочки будет вступлением.</p>
    </div>
`
        : '';

    const additionalInfoHTML = `
        <div class="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Дополнительная информация (опционально)</label>
            <textarea class="step-additional-info ${commonTextareaClasses}" rows="3" placeholder="Введите дополнительную информацию..."></textarea>
            <div class="mt-2 flex items-center space-x-4">
                <label class="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" class="step-additional-info-pos-top form-checkbox h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded">
                    <span class="ml-2">Разместить вверху</span>
                </label>
                <label class="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" class="step-additional-info-pos-bottom form-checkbox h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded">
                    <span class="ml-2">Разместить внизу</span>
                </label>
            </div>
        </div>
    `;

    const screenshotHTML = includeScreenshotsField
        ? `
        <div class="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Скриншоты (опционально)</label>
             <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Добавляйте изображения кнопкой или вставкой из буфера.</p>
            <div id="screenshotThumbnailsContainer" class="flex flex-wrap gap-2 mb-2 min-h-[3rem]">
            </div>
            <div class="flex items-center gap-3">
                <button type="button" class="add-screenshot-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition">
                    <i class="fas fa-camera mr-1"></i> Загрузить/Добавить
                </button>
            </div>
            <input type="file" class="screenshot-input hidden" accept="image/png, image/jpeg, image/gif, image/webp" multiple>
        </div>
    `
        : '';

    const isCopyableCheckboxHTML = isMainAlgorithm
        ? `
        <div class="mt-2">
            <label class="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" class="step-is-copyable form-checkbox h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded">
                <span class="ml-2">Копировать содержимое шага по клику</span>
            </label>
        </div>
    `
        : '';

    const isCollapsibleCheckboxHTML = isMainAlgorithm
        ? `
        <div class="mt-2">
            <label class="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" class="step-is-collapsible form-checkbox h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded">
                <span class="ml-2">Сворачиваемый</span>
            </label>
        </div>
    `
        : '';

    const noInnHelpCheckboxHTML = isMainAlgorithm
        ? `
        <div class="mt-2">
            <label class="flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" class="step-no-inn-help-checkbox form-checkbox h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded">
                <span class="ml-2">Отображать "Что делать, если клиент не может назвать ИНН?"</span>
            </label>
        </div>
    `
        : '';

    return `
        <div class="step-header flex justify-between items-center mb-2 cursor-pointer bg-gray-100 dark:bg-gray-700/50 p-2 -m-2 rounded-t-lg">
            <div class="flex items-center flex-grow min-w-0">
                <i class="fas fa-grip-lines step-drag-handle text-gray-400 dark:text-gray-500 mr-3 cursor-grab" title="Перетащить шаг"></i>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 step-number-label mr-2">Шаг ${stepNumber}</label>
                <span class="step-title-preview text-sm text-gray-800 dark:text-gray-200 truncate font-medium"></span>
            </div>
            <div class="flex items-center flex-shrink-0">
                <button type="button" class="delete-step text-red-500 hover:text-red-700 transition-colors duration-150 p-1 ml-2" aria-label="Удалить шаг ${stepNumber}">
                    <i class="fas fa-trash fa-fw" aria-hidden="true"></i>
                </button>
                <i class="fas fa-chevron-down step-toggle-icon ml-2 text-gray-500 dark:text-gray-400 transition-transform"></i>
            </div>
        </div>
        <div class="step-body pt-2">
            <div class="mb-2">
                <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Заголовок шага</label>
                <input type="text" class="step-title ${commonInputClasses}" placeholder="Введите заголовок...">
            </div>
            <div>
                <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Описание</label>
                <textarea class="step-desc ${commonTextareaClasses}" rows="3" placeholder="Введите описание шага..."></textarea>
            </div>
            ${exampleInputHTML}
            ${isCopyableCheckboxHTML}
            ${isCollapsibleCheckboxHTML}
            ${noInnHelpCheckboxHTML}
            ${additionalInfoHTML}
            ${screenshotHTML}
        </div>
    `;
}

/**
 * Нормализует массив шагов алгоритма
 */
export function normalizeAlgorithmSteps(stepsArray) {
    if (!Array.isArray(stepsArray)) {
        console.warn(
            'normalizeAlgorithmSteps: Передан не массив, возвращен пустой массив.',
            stepsArray,
        );
        return [];
    }
    return stepsArray.map((step) => {
        if (!step || typeof step !== 'object') {
            console.warn(
                'normalizeAlgorithmSteps: Обнаружен невалидный шаг, будет заменен заглушкой.',
                step,
            );
            return {
                title: 'Некорректный шаг',
                description: 'Данные шага повреждены или отсутствуют.',
                example: undefined,
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
                showNoInnHelp: false,
            };
        }

        const newStep = {
            title: step.title || '',
            description: step.description || '',
            example: step.example,
            isCopyable: typeof step.isCopyable === 'boolean' ? step.isCopyable : false,
            additionalInfoText: step.additionalInfoText || '',
            additionalInfoShowTop:
                typeof step.additionalInfoShowTop === 'boolean'
                    ? step.additionalInfoShowTop
                    : false,
            additionalInfoShowBottom:
                typeof step.additionalInfoShowBottom === 'boolean'
                    ? step.additionalInfoShowBottom
                    : false,
            showNoInnHelp: typeof step.showNoInnHelp === 'boolean' ? step.showNoInnHelp : false,
        };

        if (step.type === 'inn_step') {
            newStep.showNoInnHelp = true;
        }
        if (step.type && step.type !== 'inn_step') {
            newStep.type = step.type;
        } else if (!step.type && newStep.hasOwnProperty('type') && step.type !== 'inn_step') {
            delete newStep.type;
        }
        return newStep;
    });
}

// ============================================================================
// ФУНКЦИИ РЕДАКТИРОВАНИЯ АЛГОРИТМОВ
// ============================================================================

/**
 * Инициализирует сортировку шагов через Sortable.js
 * @param {HTMLElement} containerElement - контейнер с шагами
 */
export function initStepSorting(containerElement) {
    if (!containerElement) {
        console.error('initStepSorting: Контейнер для сортировки не предоставлен.');
        return;
    }
    if (!Sortable && typeof window.Sortable === 'undefined') {
        console.error('SortableJS не найден. Функционал перетаскивания не будет работать.');
        if (showNotification) showNotification('Ошибка: Библиотека для сортировки не загружена.', 'error');
        return;
    }
    
    const SortableLib = Sortable || window.Sortable;

    if (containerElement.sortableInstance) {
        try {
            containerElement.sortableInstance.destroy();
        } catch (e) {
            console.warn('Ошибка при уничтожении предыдущего экземпляра SortableJS:', e);
        }
    }

    containerElement.sortableInstance = new SortableLib(containerElement, {
        animation: 150,
        handle: '.step-drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',

        onEnd: function (evt) {
            if (updateStepNumbers) {
                updateStepNumbers(containerElement);
            } else if (typeof window.updateStepNumbers === 'function') {
                window.updateStepNumbers(containerElement);
            } else {
                console.error('Функция updateStepNumbers не найдена!');
            }
            const modal = containerElement.closest('#editModal, #addModal');
            if (modal) {
                if (modal.id === 'editModal') {
                    State.isUISettingsDirty = true;
                } else if (modal.id === 'addModal') {
                    if (hasChanges('add')) {
                        console.log('Изменения в окне добавления после перетаскивания.');
                    }
                }
            }
        },
    });

    console.log(`SortableJS инициализирован для контейнера #${containerElement.id}`);
}

/**
 * Добавляет новый шаг в форму редактирования
 */
export function addEditStep() {
    const containerId = 'editSteps';
    const editStepsContainer = document.getElementById(containerId);
    if (!editStepsContainer) {
        console.error('Контейнер #editSteps не найден для добавления шага.');
        if (showNotification) showNotification('Ошибка: Не удалось найти контейнер шагов.', 'error');
        return;
    }
    const editModal = document.getElementById('editModal');
    if (!editModal) {
        console.error('Модальное окно редактирования #editModal не найдено.');
        if (showNotification) showNotification('Ошибка: Не найдено окно редактирования.', 'error');
        return;
    }

    const section = editModal.dataset.section;
    if (!section) {
        console.error('Не удалось определить секцию в addEditStep (dataset.section отсутствует).');
        if (showNotification) showNotification('Ошибка: Не удалось определить раздел для добавления шага.', 'error');
        return;
    }

    const isMainAlgorithm = section === 'main';
    console.log(
        `addEditStep: Добавление шага в секцию ${section} (isMainAlgorithm: ${isMainAlgorithm})`,
    );

    const stepCount = editStepsContainer.children.length;
    const stepDiv = document.createElement('div');
    stepDiv.className =
        'edit-step p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm mb-4';
    stepDiv.dataset.stepIndex = stepCount;

    stepDiv.innerHTML = createStepElementHTML(stepCount + 1, isMainAlgorithm, !isMainAlgorithm);

    const deleteBtn = stepDiv.querySelector('.delete-step');
    if (deleteBtn) {
        const deleteHandler = attachStepDeleteHandler || window.attachStepDeleteHandler;
        if (typeof deleteHandler === 'function') {
            deleteHandler(
                deleteBtn,
                stepDiv,
                editStepsContainer,
                section,
                'edit',
                isMainAlgorithm,
            );
        } else {
            console.error('Функция attachStepDeleteHandler не найдена в addEditStep!');
            deleteBtn.disabled = true;
            deleteBtn.title = 'Функция удаления недоступна';
        }
    } else {
        console.warn('Не удалось найти кнопку удаления для нового шага в addEditStep.');
    }

    if (!isMainAlgorithm) {
        const screenshotHandler = attachScreenshotHandlers || window.attachScreenshotHandlers;
        if (typeof screenshotHandler === 'function') {
            screenshotHandler(stepDiv);
        } else {
            console.error('Функция attachScreenshotHandlers не найдена в addEditStep!');
        }
    } else {
        console.log(
            'Скриншоты для главного алгоритма не используются, attachScreenshotHandlers не вызывается.',
        );
    }

    const placeholder = editStepsContainer.querySelector('p.text-gray-500');
    if (placeholder) {
        placeholder.remove();
    }

    editStepsContainer.appendChild(stepDiv);

    const stepNumbersHandler = updateStepNumbers || window.updateStepNumbers;
    if (typeof stepNumbersHandler === 'function') {
        stepNumbersHandler(editStepsContainer);
    } else {
        console.error('Функция updateStepNumbers не найдена в addEditStep!');
    }

    stepDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const newTitleInput = stepDiv.querySelector('.step-title');
    if (newTitleInput) {
        setTimeout(() => newTitleInput.focus(), 100);
    }
    console.log(
        "Шаг добавлен в форму редактирования. Отслеживание изменений через hasChanges('edit').",
    );
}

/**
 * Извлекает данные шагов из формы редактирования
 * @param {HTMLElement} containerElement - контейнер с шагами
 * @param {boolean} isMainAlgorithm - главный ли это алгоритм
 * @returns {Object} объект с данными шагов и операциями со скриншотами
 */
export function extractStepsDataFromEditForm(containerElement, isMainAlgorithm = false) {
    const parseExample = (val) => {
        if (!val) return undefined;
        const lines = val
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l);
        if (lines.length === 0) return undefined;

        const startsWithMarker = /^\s*[-*+•]/.test(lines[0]);
        const isListStrict = lines.length > 1 && lines.slice(1).every((l) => /^\s*[-*+•]/.test(l));
        const potentialIntro = lines.length > 0 && !startsWithMarker ? lines[0] : null;
        const isListLikely = startsWithMarker || (potentialIntro && isListStrict);

        if (isListLikely) {
            const items = (potentialIntro ? lines.slice(1) : lines)
                .map((l) => l.replace(/^\s*[-*+•]\s*/, '').trim())
                .filter((item) => item);

            if (items.length > 0) {
                const listExample = { type: 'list', items: items };
                if (potentialIntro) {
                    listExample.intro = potentialIntro;
                }
                return listExample;
            } else if (potentialIntro) {
                return potentialIntro;
            } else {
                return undefined;
            }
        }
        return val;
    };

    const stepsData = {
        steps: [],
        screenshotOps: [],
        isValid: true,
    };

    if (!containerElement) {
        console.error('extractStepsDataFromEditForm: Контейнер не передан.');
        stepsData.isValid = false;
        return stepsData;
    }

    const stepDivs = containerElement.querySelectorAll('.edit-step');

    stepDivs.forEach((stepDiv, formIndex) => {
        const titleInput = stepDiv.querySelector('.step-title');
        const descInput = stepDiv.querySelector('.step-desc');
        const exampleInput = stepDiv.querySelector('.step-example');
        const additionalInfoInput = stepDiv.querySelector('.step-additional-info');
        const additionalInfoPosTopCheckbox = stepDiv.querySelector('.step-additional-info-pos-top');
        const additionalInfoPosBottomCheckbox = stepDiv.querySelector(
            '.step-additional-info-pos-bottom',
        );
        const isCopyableCheckbox = isMainAlgorithm
            ? stepDiv.querySelector('.step-is-copyable')
            : null;
        const isCollapsibleCheckbox = isMainAlgorithm
            ? stepDiv.querySelector('.step-is-collapsible')
            : null;
        const noInnHelpCheckbox = isMainAlgorithm
            ? stepDiv.querySelector('.step-no-inn-help-checkbox')
            : null;

        const title = titleInput ? titleInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const additionalInfoText = additionalInfoInput ? additionalInfoInput.value.trim() : '';
        const additionalInfoShowTop = additionalInfoPosTopCheckbox
            ? additionalInfoPosTopCheckbox.checked
            : false;
        const additionalInfoShowBottom = additionalInfoPosBottomCheckbox
            ? additionalInfoPosBottomCheckbox.checked
            : false;
        const isCopyable =
            isMainAlgorithm && isCopyableCheckbox ? isCopyableCheckbox.checked : undefined;
        const isCollapsible =
            isMainAlgorithm && isCollapsibleCheckbox ? isCollapsibleCheckbox.checked : undefined;
        const showNoInnHelp =
            isMainAlgorithm && noInnHelpCheckbox ? noInnHelpCheckbox.checked : undefined;

        if (!isMainAlgorithm && !title && !description && !additionalInfoText) {
            const hasTempScreenshots =
                stepDiv._tempScreenshotBlobs &&
                Array.isArray(stepDiv._tempScreenshotBlobs) &&
                stepDiv._tempScreenshotBlobs.length > 0;
            const hasExistingScreenshots =
                stepDiv.dataset.existingScreenshotIds &&
                stepDiv.dataset.existingScreenshotIds.split(',').filter(Boolean).length > 0;
            const hasPendingDeletions =
                stepDiv.dataset.screenshotsToDelete &&
                stepDiv.dataset.screenshotsToDelete.split(',').filter(Boolean).length > 0;

            if (!hasTempScreenshots && !hasExistingScreenshots && !hasPendingDeletions) {
                console.warn(
                    `Пропуск полностью пустого шага (индекс в форме ${
                        formIndex + 1
                    }) для не-главного алгоритма.`,
                );
                return;
            }
        }

        const stepIndexForOps = stepsData.steps.length;

        const step = {
            title,
            description,
            additionalInfoText,
            additionalInfoShowTop,
            additionalInfoShowBottom,
        };

        if (isMainAlgorithm) {
            if (isCopyable !== undefined) step.isCopyable = isCopyable;
            if (isCollapsible !== undefined) step.isCollapsible = isCollapsible;
            if (showNoInnHelp !== undefined) step.showNoInnHelp = showNoInnHelp;
        }

        if (isMainAlgorithm && exampleInput) {
            const exampleValue = exampleInput.value.trim();
            const parsedExample = parseExample(exampleValue);
            if (parsedExample !== undefined) {
                step.example = parsedExample;
            }
        } else if (!isMainAlgorithm) {
            delete step.example;
        }

        if (stepDiv.dataset.stepType) {
            step.type = stepDiv.dataset.stepType;
        }

        if (!isMainAlgorithm) {
            if (stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs)) {
                stepDiv._tempScreenshotBlobs.forEach((blobInfo, blobIndex) => {
                    if (blobInfo instanceof Blob) {
                        stepsData.screenshotOps.push({
                            stepIndex: stepIndexForOps,
                            action: 'add',
                            blob: blobInfo,
                            oldScreenshotId: null,
                        });
                    } else {
                        console.warn(
                            `Обнаружен не-Blob элемент в _tempScreenshotBlobs шага ${formIndex}, blobIndex ${blobIndex}:`,
                            blobInfo,
                        );
                    }
                });
            }

            const idsToDeleteStr = stepDiv.dataset.screenshotsToDelete;
            if (idsToDeleteStr) {
                const idsToDelete = idsToDeleteStr
                    .split(',')
                    .map((idStr) => parseInt(idStr.trim(), 10))
                    .filter((idNum) => !isNaN(idNum));

                idsToDelete.forEach((idToDelete) => {
                    stepsData.screenshotOps.push({
                        stepIndex: stepIndexForOps,
                        action: 'delete',
                        blob: null,
                        oldScreenshotId: idToDelete,
                    });
                });
            }
        }
        stepsData.steps.push(step);
    });

    if (!isMainAlgorithm && stepsData.steps.length === 0) {
        stepsData.isValid = false;
    }
    return stepsData;
}

/**
 * Добавляет новый шаг в форму добавления алгоритма
 * @param {boolean} isFirstStep - первый ли это шаг
 */
export function addNewStep(isFirstStep = false) {
    const containerId = 'newSteps';
    const newStepsContainer = document.getElementById(containerId);
    if (!newStepsContainer) {
        console.error('Контейнер #newSteps не найден для добавления шага.');
        return;
    }
    const addModal = document.getElementById('addModal');
    const section = addModal?.dataset.section;
    if (!section) {
        console.error('Не удалось определить секцию в addNewStep.');
        return;
    }

    const stepCount = newStepsContainer.children.length;

    const placeholder = newStepsContainer.querySelector('p.text-gray-500');
    if (placeholder) {
        placeholder.remove();
    }

    const stepDiv = document.createElement('div');
    stepDiv.className =
        'edit-step p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4';
    stepDiv.innerHTML = createStepElementHTML(stepCount + 1, false, true);
    stepDiv.dataset.stepIndex = stepCount;

    const header = stepDiv.querySelector('.step-header');
    if (header) {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.delete-step, .step-drag-handle')) return;
            const collapseHandler = toggleStepCollapse || window.toggleStepCollapse;
            if (typeof collapseHandler === 'function') {
                collapseHandler(stepDiv);
            }
        });
    }

    const titleInput = stepDiv.querySelector('.step-title');
    const titlePreview = stepDiv.querySelector('.step-title-preview');
    if (titleInput && titlePreview) {
        titlePreview.textContent = 'Новый шаг';
        titleInput.addEventListener('input', () => {
            titlePreview.textContent = titleInput.value || 'Новый шаг';
        });
    }

    const deleteBtn = stepDiv.querySelector('.delete-step');
    if (deleteBtn) {
        const deleteHandler = attachStepDeleteHandler || window.attachStepDeleteHandler;
        if (typeof deleteHandler === 'function') {
            deleteHandler(deleteBtn, stepDiv, newStepsContainer, section, 'add', false);
        }
    }

    const screenshotHandler = attachScreenshotHandlers || window.attachScreenshotHandlers;
    if (typeof screenshotHandler === 'function') {
        screenshotHandler(stepDiv);
    }

    const collapseHandler = toggleStepCollapse || window.toggleStepCollapse;
    if (typeof collapseHandler === 'function') {
        if (!isFirstStep) {
            collapseHandler(stepDiv, true);
        } else {
            collapseHandler(stepDiv, false);
        }
    }

    newStepsContainer.appendChild(stepDiv);

    const stepNumbersHandler = updateStepNumbers || window.updateStepNumbers;
    if (typeof stepNumbersHandler === 'function') {
        stepNumbersHandler(newStepsContainer);
    }

    if (!isFirstStep) {
        stepDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (titleInput) {
        titleInput.focus();
    }

    console.log(`addNewStep (v2): Добавлен шаг ${stepCount + 1} в секцию ${section}.`);
}

// ============================================================================
// ФУНКЦИИ ОТСЛЕЖИВАНИЯ ИЗМЕНЕНИЙ
// ============================================================================

/**
 * Получает текущее состояние формы редактирования
 * @returns {Object|null} текущее состояние или null при ошибке
 */
export function getCurrentEditState() {
    const editModal = document.getElementById('editModal');
    const algorithmTitleInput = document.getElementById('algorithmTitle');
    const algorithmDescriptionInput = document.getElementById('algorithmDescription');
    const editStepsContainer = document.getElementById('editSteps');

    if (!editModal || !algorithmTitleInput || !editStepsContainer) {
        console.error(
            'getCurrentEditState: Не найдены элементы формы редактирования или модальное окно.',
        );
        return null;
    }

    const section = editModal.dataset.section;
    const isMainAlgorithm = section === 'main';

    const currentTitle = algorithmTitleInput.value.trim();
    const currentDescription =
        !isMainAlgorithm && algorithmDescriptionInput
            ? algorithmDescriptionInput.value.trim()
            : undefined;

    const currentSteps = [];
    const stepDivs = editStepsContainer.querySelectorAll('.edit-step');

    stepDivs.forEach((stepDiv) => {
        const titleInput = stepDiv.querySelector('.step-title');
        const descInput = stepDiv.querySelector('.step-desc');
        const exampleInput = stepDiv.querySelector('.step-example');
        const additionalInfoTextarea = stepDiv.querySelector('.step-additional-info');
        const additionalInfoPosTopCheckbox = stepDiv.querySelector('.step-additional-info-pos-top');
        const additionalInfoPosBottomCheckbox = stepDiv.querySelector(
            '.step-additional-info-pos-bottom',
        );
        const isCopyableCheckbox = isMainAlgorithm
            ? stepDiv.querySelector('.step-is-copyable')
            : null;
        const noInnHelpCheckbox = isMainAlgorithm
            ? stepDiv.querySelector('.step-no-inn-help-checkbox')
            : null;

        const currentStepData = {
            title: titleInput ? titleInput.value.trim() : '',
            description: descInput ? descInput.value.trim() : '',
            example:
                isMainAlgorithm && exampleInput
                    ? exampleInput.value.trim()
                    : isMainAlgorithm
                    ? ''
                    : undefined,
            additionalInfoText: additionalInfoTextarea ? additionalInfoTextarea.value.trim() : '',
            additionalInfoShowTop: additionalInfoPosTopCheckbox
                ? additionalInfoPosTopCheckbox.checked
                : false,
            additionalInfoShowBottom: additionalInfoPosBottomCheckbox
                ? additionalInfoPosBottomCheckbox.checked
                : false,
        };

        if (isMainAlgorithm) {
            if (isCopyableCheckbox) {
                currentStepData.isCopyable = isCopyableCheckbox.checked;
            } else {
                currentStepData.isCopyable = false;
            }
            if (noInnHelpCheckbox) {
                currentStepData.showNoInnHelp = noInnHelpCheckbox.checked;
            } else {
                currentStepData.showNoInnHelp = false;
            }
        }

        if (stepDiv.dataset.stepType) {
            currentStepData.type = stepDiv.dataset.stepType;
        }

        if (!isMainAlgorithm) {
            const existingIdsStr = stepDiv.dataset.existingScreenshotIds || '';
            const deletedIdsStr = stepDiv.dataset.screenshotsToDelete || '';
            const deletedIdsSet = new Set(
                deletedIdsStr
                    .split(',')
                    .filter(Boolean)
                    .map((s) => String(s.trim())),
            );

            currentStepData.existingScreenshotIds = existingIdsStr
                .split(',')
                .filter(Boolean)
                .map((s) => String(s.trim()))
                .filter((id) => !deletedIdsSet.has(id))
                .join(',');
            currentStepData.tempScreenshotsCount =
                stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs)
                    ? stepDiv._tempScreenshotBlobs.length
                    : 0;
            currentStepData.deletedScreenshotIds = deletedIdsStr;
        } else {
            delete currentStepData.existingScreenshotIds;
            delete currentStepData.tempScreenshotsCount;
            delete currentStepData.deletedScreenshotIds;
        }
        currentSteps.push(currentStepData);
    });

    const currentState = {
        title: currentTitle,
    };
    if (!isMainAlgorithm) {
        currentState.description = currentDescription !== undefined ? currentDescription : '';
    }
    currentState.steps = Array.isArray(currentSteps) ? currentSteps : [];

    console.log(
        'Получено ТЕКУЩЕЕ состояние для сравнения (editModal):',
        JSON.parse(JSON.stringify(currentState)),
    );
    return currentState;
}

/**
 * Получает текущее состояние формы добавления
 * @returns {Object|null} текущее состояние или null при ошибке
 */
export function getCurrentAddState() {
    const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
    const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
    const newStepsContainer = document.getElementById('newSteps');

    if (!newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer) {
        console.error('getCurrentAddState: Не найдены элементы формы добавления.');
        return null;
    }

    const currentTitle = newAlgorithmTitle.value.trim();
    const currentDescription = newAlgorithmDesc.value.trim();
    const currentSteps = [];

    const stepDivs = newStepsContainer.querySelectorAll('.edit-step');

    stepDivs.forEach((stepDiv) => {
        const titleInput = stepDiv.querySelector('.step-title');
        const descInput = stepDiv.querySelector('.step-desc');
        const additionalInfoTextarea = stepDiv.querySelector('.step-additional-info');
        const additionalInfoPosTopCheckbox = stepDiv.querySelector('.step-additional-info-pos-top');
        const additionalInfoPosBottomCheckbox = stepDiv.querySelector(
            '.step-additional-info-pos-bottom',
        );

        const stepData = {
            title: titleInput ? titleInput.value.trim() : '',
            description: descInput ? descInput.value.trim() : '',
            additionalInfoText: additionalInfoTextarea ? additionalInfoTextarea.value.trim() : '',
            additionalInfoShowTop: additionalInfoPosTopCheckbox
                ? additionalInfoPosTopCheckbox.checked
                : false,
            additionalInfoShowBottom: additionalInfoPosBottomCheckbox
                ? additionalInfoPosBottomCheckbox.checked
                : false,
            existingScreenshotIds: stepDiv.dataset.existingScreenshotIds || '',
            tempScreenshotsCount:
                stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs)
                    ? stepDiv._tempScreenshotBlobs.length
                    : 0,
            deletedScreenshotIds: stepDiv.dataset.screenshotsToDelete || '',
            ...(stepDiv.dataset.stepType && { type: stepDiv.dataset.stepType }),
        };
        currentSteps.push(stepData);
    });

    const currentState = {
        title: currentTitle,
        description: currentDescription,
        steps: currentSteps,
    };
    console.log(
        'Получено ТЕКУЩЕЕ состояние для сравнения (addModal):',
        JSON.parse(JSON.stringify(currentState)),
    );
    return currentState;
}

/**
 * Проверяет наличие изменений в форме
 * @param {string} modalType - тип модального окна ('edit' или 'add')
 * @returns {boolean} true если есть изменения
 */
export function hasChanges(modalType) {
    let initialState;
    let currentState;

    if (modalType === 'edit') {
        initialState = initialEditState;
        currentState = getCurrentEditState();
    } else if (modalType === 'add') {
        initialState = initialAddState;
        currentState = getCurrentAddState();
    } else {
        console.warn('hasChanges: Неизвестный тип модального окна:', modalType);
        return false;
    }

    if (initialState === null) {
        console.error(
            `hasChanges (${modalType}): НАЧАЛЬНОЕ состояние (initialState) равно null! Невозможно сравнить. Возможно, произошла ошибка при открытии окна. Предполагаем наличие изменений для безопасности.`,
        );
        console.log(
            `hasChanges (${modalType}): Текущее состояние (currentState):`,
            currentState ? JSON.parse(JSON.stringify(currentState)) : currentState,
        );
        return true;
    }
    if (currentState === null) {
        console.error(
            `hasChanges (${modalType}): ТЕКУЩЕЕ состояние (currentState) равно null! Невозможно сравнить. Возможно, произошла ошибка при получении данных из формы. Предполагаем наличие изменений для безопасности.`,
        );
        console.log(
            `hasChanges (${modalType}): Начальное состояние (initialState):`,
            JSON.parse(JSON.stringify(initialState)),
        );
        return true;
    }

    const areEquivalent = deepEqual(initialState, currentState);

    const changed = !areEquivalent;

    if (changed) {
        console.log(`hasChanges (${modalType}): Обнаружены изменения через deepEqual.`);
        console.log('Initial State:', JSON.stringify(initialState, null, 2));
        console.log('Current State:', JSON.stringify(currentState, null, 2));
    } else {
        console.log(`hasChanges (${modalType}): Изменения НЕ обнаружены через deepEqual.`);
    }

    return changed;
}

/**
 * Захватывает начальное состояние для редактирования
 * @param {Object} algorithm - данные алгоритма
 * @param {string} section - секция алгоритма
 */
export function captureInitialEditState(algorithm, section) {
    if (!algorithm || !section) {
        initialEditState = null;
        console.warn('captureInitialEditState: Алгоритм или секция не предоставлены.');
        return;
    }

    try {
        const isMainAlgorithm = section === 'main';
        const algorithmCopy = algorithm;

        const initialData = {
            title: algorithmCopy.title || '',
        };

        if (!isMainAlgorithm) {
            initialData.description = algorithmCopy.description || '';
        }

        if (Array.isArray(algorithmCopy.steps)) {
            initialData.steps = algorithmCopy.steps
                .map((step) => {
                    if (!step) return null;

                    const initialStep = {
                        title: step.title || '',
                        description: step.description || '',
                        example: formatExampleForTextarea(step.example),
                        additionalInfoText: step.additionalInfoText || '',
                        additionalInfoShowTop: step.additionalInfoShowTop || false,
                        additionalInfoShowBottom: step.additionalInfoShowBottom || false,
                        ...(step.type && { type: step.type }),
                    };

                    if (isMainAlgorithm) {
                        initialStep.isCopyable = step.isCopyable || false;
                        initialStep.showNoInnHelp = step.showNoInnHelp || false;
                    }

                    if (!isMainAlgorithm) {
                        initialStep.existingScreenshotIds = Array.isArray(step.screenshotIds)
                            ? step.screenshotIds
                                  .filter((id) => id !== null && id !== undefined)
                                  .join(',')
                            : '';
                        initialStep.tempScreenshotsCount = 0;
                        initialStep.deletedScreenshotIds = '';
                    }
                    return initialStep;
                })
                .filter((step) => step !== null);
        } else {
            console.warn(
                `captureInitialEditState: Поле steps у алгоритма ${algorithm.id} не является массивом. Будет использован пустой массив.`,
            );
            initialData.steps = [];
        }

        initialEditState = JSON.parse(JSON.stringify(initialData));
        console.log(
            'Захвачено НАЧАЛЬНОЕ состояние для редактирования (с учетом скриншотов):',
            JSON.parse(JSON.stringify(initialEditState)),
        );
    } catch (error) {
        console.error('Ошибка при захвате начального состояния редактирования:', error);
        initialEditState = null;
    }
}

/**
 * Захватывает начальное состояние для добавления
 */
export function captureInitialAddState() {
    const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
    const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
    const newStepsContainer = document.getElementById('newSteps');
    const initialTitle = newAlgorithmTitle ? newAlgorithmTitle.value.trim() : '';
    const initialDescription = newAlgorithmDesc ? newAlgorithmDesc.value.trim() : '';
    const initialSteps = [];

    const stepDivs = newStepsContainer ? newStepsContainer.querySelectorAll('.edit-step') : [];
    stepDivs.forEach((stepDiv) => {
        const titleInput = stepDiv.querySelector('.step-title');
        const descInput = stepDiv.querySelector('.step-desc');
        const additionalInfoTextarea = stepDiv.querySelector('.step-additional-info');
        const additionalInfoPosTopCheckbox = stepDiv.querySelector('.step-additional-info-pos-top');
        const additionalInfoPosBottomCheckbox = stepDiv.querySelector(
            '.step-additional-info-pos-bottom',
        );

        const stepData = {
            title: titleInput ? titleInput.value.trim() : '',
            description: descInput ? descInput.value.trim() : '',
            additionalInfoText: additionalInfoTextarea ? additionalInfoTextarea.value.trim() : '',
            additionalInfoShowTop: additionalInfoPosTopCheckbox
                ? additionalInfoPosTopCheckbox.checked
                : false,
            additionalInfoShowBottom: additionalInfoPosBottomCheckbox
                ? additionalInfoPosBottomCheckbox.checked
                : false,
            existingScreenshotIds: '',
            tempScreenshotsCount:
                stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs)
                    ? stepDiv._tempScreenshotBlobs.length
                    : 0,
            deletedScreenshotIds: '',
            ...(stepDiv.dataset.stepType && { type: stepDiv.dataset.stepType }),
        };
        initialSteps.push(stepData);
    });

    initialAddState = {
        title: initialTitle,
        description: initialDescription,
        steps: initialSteps,
    };
    console.log(
        'Захвачено НАЧАЛЬНОЕ состояние для добавления (addModal):',
        JSON.parse(JSON.stringify(initialAddState)),
    );
}

/**
 * Сбрасывает начальное состояние редактирования
 */
export function resetInitialEditState() {
    initialEditState = null;
}

/**
 * Сбрасывает начальное состояние добавления
 */
export function resetInitialAddState() {
    initialAddState = null;
}
