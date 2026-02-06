'use strict';

/**
 * Модуль операций с алгоритмами (редактирование, добавление)
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let algorithms = null;
let showNotification = null;
let createStepElementHTML = null;
let formatExampleForTextarea = null;
let toggleStepCollapse = null;
let attachStepDeleteHandler = null;
let updateStepNumbers = null;
let initStepSorting = null;
let captureInitialEditState = null;
let captureInitialAddState = null;
let openAnimatedModal = null;
let attachScreenshotHandlers = null;
let renderExistingThumbnail = null;
let addNewStep = null;
let getSectionName = null;

export function setAlgorithmsOperationsDependencies(deps) {
    if (deps.algorithms !== undefined) algorithms = deps.algorithms;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.createStepElementHTML !== undefined) createStepElementHTML = deps.createStepElementHTML;
    if (deps.formatExampleForTextarea !== undefined) formatExampleForTextarea = deps.formatExampleForTextarea;
    if (deps.toggleStepCollapse !== undefined) toggleStepCollapse = deps.toggleStepCollapse;
    if (deps.attachStepDeleteHandler !== undefined) attachStepDeleteHandler = deps.attachStepDeleteHandler;
    if (deps.updateStepNumbers !== undefined) updateStepNumbers = deps.updateStepNumbers;
    if (deps.initStepSorting !== undefined) initStepSorting = deps.initStepSorting;
    if (deps.captureInitialEditState !== undefined) captureInitialEditState = deps.captureInitialEditState;
    if (deps.captureInitialAddState !== undefined) captureInitialAddState = deps.captureInitialAddState;
    if (deps.openAnimatedModal !== undefined) openAnimatedModal = deps.openAnimatedModal;
    if (deps.attachScreenshotHandlers !== undefined) attachScreenshotHandlers = deps.attachScreenshotHandlers;
    if (deps.renderExistingThumbnail !== undefined) renderExistingThumbnail = deps.renderExistingThumbnail;
    if (deps.addNewStep !== undefined) addNewStep = deps.addNewStep;
    if (deps.getSectionName !== undefined) getSectionName = deps.getSectionName;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ ОПЕРАЦИЙ
// ============================================================================

/**
 * Редактирует алгоритм
 * @param {string|number} algorithmId - ID алгоритма
 * @param {string} section - секция алгоритма ('main' или другая)
 */
export async function editAlgorithm(algorithmId, section = 'main') {
    let algorithm = null;

    const isMainAlgorithm = section === 'main';
    console.log(
        `[editAlgorithm v9 - Collapse Feature] Попытка редактирования: ID=${algorithmId}, Секция=${section}`,
    );

    try {
        if (isMainAlgorithm) {
            algorithm = algorithms.main;
        } else {
            if (algorithms[section] && Array.isArray(algorithms[section])) {
                algorithm = algorithms[section].find((a) => String(a?.id) === String(algorithmId));
            }
        }
        if (!algorithm) {
            throw new Error(`Алгоритм с ID ${algorithmId} не найден в секции ${section}.`);
        }
        algorithm = JSON.parse(JSON.stringify(algorithm));
        algorithm.steps = algorithm.steps?.map((step) => ({ ...step })) || [];
    } catch (error) {
        console.error(`[editAlgorithm v9] Ошибка при получении данных алгоритма:`, error);
        if (typeof showNotification === 'function') {
            showNotification(`Ошибка при поиске данных алгоритма: ${error.message}`, 'error');
        }
        return;
    }

    const editModal = document.getElementById('editModal');
    const editModalTitle = document.getElementById('editModalTitle');
    const algorithmTitleInput = document.getElementById('algorithmTitle');
    const descriptionContainer = document.getElementById('algorithmDescriptionContainer');
    const algorithmDescriptionInput = document.getElementById('algorithmDescription');
    const editStepsContainerElement = document.getElementById('editSteps');
    const saveAlgorithmBtn = document.getElementById('saveAlgorithmBtn');

    if (
        !editModal ||
        !editModalTitle ||
        !algorithmTitleInput ||
        !editStepsContainerElement ||
        !saveAlgorithmBtn ||
        !descriptionContainer ||
        !algorithmDescriptionInput
    ) {
        console.error(
            '[editAlgorithm v9] КРИТИЧЕСКАЯ ОШИБКА: Не найдены ОБЯЗАТЕЛЬНЫЕ элементы модального окна.',
        );
        return;
    }

    const actionsContainer = editModal.querySelector('.flex.justify-end.items-center');
    if (actionsContainer && !actionsContainer.querySelector('.collapse-all-btn')) {
        const collapseControls = document.createElement('div');
        collapseControls.className = 'mr-auto';
        collapseControls.innerHTML = `
            <button type="button" class="collapse-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100">Свернуть все</button>
            <button type="button" class="expand-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 ml-1">Развернуть все</button>
        `;
        actionsContainer.insertBefore(collapseControls, actionsContainer.firstChild);

        actionsContainer.querySelector('.collapse-all-btn').addEventListener('click', () => {
            editStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => {
                    if (typeof toggleStepCollapse === 'function') {
                        toggleStepCollapse(step, true);
                    }
                });
        });
        actionsContainer.querySelector('.expand-all-btn').addEventListener('click', () => {
            editStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => {
                    if (typeof toggleStepCollapse === 'function') {
                        toggleStepCollapse(step, false);
                    }
                });
        });
    }

    try {
        descriptionContainer.style.display = isMainAlgorithm ? 'none' : 'block';
        editModalTitle.textContent = `Редактирование: ${algorithm.title ?? 'Без названия'}`;
        algorithmTitleInput.value = algorithm.title ?? '';
        if (!isMainAlgorithm) {
            algorithmDescriptionInput.value = algorithm.description ?? '';
        }
        editStepsContainerElement.innerHTML = '';

        if (!Array.isArray(algorithm.steps) || algorithm.steps.length === 0) {
            const message = isMainAlgorithm
                ? 'В главном алгоритме пока нет шагов. Добавьте первый шаг.'
                : 'У этого алгоритма еще нет шагов. Добавьте первый шаг.';
            editStepsContainerElement.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center p-4">${message}</p>`;
        } else {
            const fragment = document.createDocumentFragment();
            const stepPromises = algorithm.steps.map(async (step, index) => {
                if (!step || typeof step !== 'object') {
                    console.warn(
                        `Пропуск невалидного шага на индексе ${index} при заполнении формы.`,
                    );
                    return null;
                }
                const stepDiv = document.createElement('div');
                stepDiv.className =
                    'edit-step p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm mb-4';
                stepDiv.dataset.stepIndex = index;
                if (step.type) {
                    stepDiv.dataset.stepType = step.type;
                }

                if (typeof createStepElementHTML === 'function') {
                    stepDiv.innerHTML = createStepElementHTML(
                        index + 1,
                        isMainAlgorithm,
                        !isMainAlgorithm,
                    );
                } else {
                    console.error('createStepElementHTML не найдена');
                    return null;
                }

                const titleInput = stepDiv.querySelector('.step-title');
                const titlePreview = stepDiv.querySelector('.step-title-preview');
                const descInput = stepDiv.querySelector('.step-desc');
                const exampleTextarea = stepDiv.querySelector('.step-example');
                const additionalInfoTextarea = stepDiv.querySelector('.step-additional-info');
                const additionalInfoPosTopCheckbox = stepDiv.querySelector(
                    '.step-additional-info-pos-top',
                );
                const additionalInfoPosBottomCheckbox = stepDiv.querySelector(
                    '.step-additional-info-pos-bottom',
                );
                const isCopyableCheckbox = stepDiv.querySelector('.step-is-copyable');
                const isCollapsibleCheckbox = stepDiv.querySelector('.step-is-collapsible');
                const noInnHelpCheckbox = stepDiv.querySelector('.step-no-inn-help-checkbox');

                if (titleInput) {
                    titleInput.value = step.title ?? '';
                    if (titlePreview) {
                        const previewText = step.title || 'Без заголовка';
                        titlePreview.textContent = previewText;
                    }
                    titleInput.addEventListener('input', () => {
                        if (titlePreview) {
                            const previewText = titleInput.value || `Шаг ${index + 1}`;
                            titlePreview.textContent = previewText;
                        }
                    });
                }
                if (descInput) {
                    descInput.value = step.description ?? '';
                }
                if (exampleTextarea && typeof formatExampleForTextarea === 'function') {
                    exampleTextarea.value = formatExampleForTextarea(step.example);
                }
                if (additionalInfoTextarea) {
                    additionalInfoTextarea.value = step.additionalInfoText || '';
                }
                if (additionalInfoPosTopCheckbox) {
                    additionalInfoPosTopCheckbox.checked = step.additionalInfoShowTop || false;
                }
                if (additionalInfoPosBottomCheckbox) {
                    additionalInfoPosBottomCheckbox.checked =
                        step.additionalInfoShowBottom || false;
                }
                if (isMainAlgorithm && isCopyableCheckbox) {
                    isCopyableCheckbox.checked = step.isCopyable || false;
                }
                if (isMainAlgorithm && isCollapsibleCheckbox) {
                    isCollapsibleCheckbox.checked = step.isCollapsible || false;
                }

                if (isMainAlgorithm && noInnHelpCheckbox) {
                    noInnHelpCheckbox.checked = step.showNoInnHelp || false;
                }

                if (!isMainAlgorithm) {
                    const thumbsContainer = stepDiv.querySelector('#screenshotThumbnailsContainer');
                    if (thumbsContainer) {
                        const existingIds = Array.isArray(step.screenshotIds)
                            ? step.screenshotIds.filter((id) => id !== null && id !== undefined)
                            : [];
                        stepDiv.dataset.existingScreenshotIds = existingIds.join(',');

                        if (
                            existingIds.length > 0 &&
                            typeof renderExistingThumbnail === 'function'
                        ) {
                            const renderPromises = existingIds.map((screenshotId) =>
                                renderExistingThumbnail(
                                    screenshotId,
                                    thumbsContainer,
                                    stepDiv,
                                ).catch((err) =>
                                    console.error(
                                        `[editAlgorithm v9] Ошибка рендеринга миниатюры ID ${screenshotId}:`,
                                        err,
                                    ),
                                ),
                            );
                            await Promise.allSettled(renderPromises);
                        }
                        stepDiv._tempScreenshotBlobs = [];
                        stepDiv.dataset.screenshotsToDelete = '';
                        if (typeof attachScreenshotHandlers === 'function') {
                            attachScreenshotHandlers(stepDiv);
                        }
                    }
                }

                const deleteStepBtn = stepDiv.querySelector('.delete-step');
                if (deleteStepBtn && typeof attachStepDeleteHandler === 'function') {
                    attachStepDeleteHandler(
                        deleteStepBtn,
                        stepDiv,
                        editStepsContainerElement,
                        section,
                        'edit',
                    );
                }

                if (index > 0 && typeof toggleStepCollapse === 'function') {
                    toggleStepCollapse(stepDiv, true);
                }
                return stepDiv;
            });
            const stepDivs = (await Promise.all(stepPromises)).filter(Boolean);
            stepDivs.forEach((div) => fragment.appendChild(div));

            editStepsContainerElement.appendChild(fragment);
            if (typeof updateStepNumbers === 'function') {
                updateStepNumbers(editStepsContainerElement);
            }
        }

        editStepsContainerElement.querySelectorAll('.step-header').forEach((header) => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.delete-step, .step-drag-handle')) return;
                if (typeof toggleStepCollapse === 'function') {
                    toggleStepCollapse(header.closest('.edit-step'));
                }
            });
        });

        if (typeof initStepSorting === 'function') {
            initStepSorting(editStepsContainerElement);
        }

        editModal.dataset.algorithmId = String(algorithm.id);
        editModal.dataset.section = section;
        if (typeof captureInitialEditState === 'function') {
            captureInitialEditState(algorithm, section);
        }
    } catch (error) {
        console.error('[editAlgorithm v9] Ошибка при заполнении формы:', error);
        if (typeof showNotification === 'function') {
            showNotification('Произошла ошибка при подготовке формы редактирования.', 'error');
        }
        if (editStepsContainerElement)
            editStepsContainerElement.innerHTML =
                '<p class="text-red-500 p-4 text-center">Ошибка загрузки данных в форму.</p>';
        if (saveAlgorithmBtn) saveAlgorithmBtn.disabled = true;
        return;
    }

    const algorithmModalView = document.getElementById('algorithmModal');
    if (algorithmModalView) {
        algorithmModalView.classList.add('hidden');
    }
    if (typeof openAnimatedModal === 'function') {
        openAnimatedModal(editModal);
    }
    setTimeout(() => algorithmTitleInput.focus(), 50);
}

/**
 * Показывает модальное окно добавления нового алгоритма
 * @param {string} section - секция для нового алгоритма
 */
export async function showAddModal(section) {
    const addModal = document.getElementById('addModal');
    const addModalTitle = document.getElementById('addModalTitle');
    const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
    const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
    const newStepsContainerElement = document.getElementById('newSteps');
    const saveButton = document.getElementById('saveNewAlgorithmBtn');

    if (
        !addModal ||
        !addModalTitle ||
        !newAlgorithmTitle ||
        !newAlgorithmDesc ||
        !newStepsContainerElement ||
        !saveButton
    ) {
        console.error('showAddModal (v2 - Collapse): Отсутствуют необходимые элементы.');
        return;
    }

    const actionsContainer = addModal.querySelector('.flex.justify-end.items-center');
    if (actionsContainer && !actionsContainer.querySelector('.collapse-all-btn')) {
        const collapseControls = document.createElement('div');
        collapseControls.className = 'mr-auto';
        collapseControls.innerHTML = `
            <button type="button" class="collapse-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100">Свернуть все</button>
            <button type="button" class="expand-all-btn px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100 ml-1">Развернуть все</button>
        `;
        actionsContainer.insertBefore(collapseControls, actionsContainer.firstChild);

        actionsContainer.querySelector('.collapse-all-btn').addEventListener('click', () => {
            newStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => {
                    if (typeof toggleStepCollapse === 'function') {
                        toggleStepCollapse(step, true);
                    }
                });
        });
        actionsContainer.querySelector('.expand-all-btn').addEventListener('click', () => {
            newStepsContainerElement
                .querySelectorAll('.edit-step')
                .forEach((step) => {
                    if (typeof toggleStepCollapse === 'function') {
                        toggleStepCollapse(step, false);
                    }
                });
        });
    }

    const sectionName = typeof getSectionName === 'function' ? getSectionName(section) : section;
    addModalTitle.textContent = 'Новый алгоритм для раздела: ' + sectionName;
    newAlgorithmTitle.value = '';
    newAlgorithmDesc.value = '';
    newStepsContainerElement.innerHTML = '';

    if (typeof addNewStep === 'function') {
        addNewStep(true);
    } else {
        console.error('showAddModal: Функция addNewStep не найдена');
    }

    addModal.dataset.section = section;
    saveButton.disabled = false;
    saveButton.innerHTML = 'Сохранить';

    if (typeof initStepSorting === 'function') {
        initStepSorting(newStepsContainerElement);
    }
    if (typeof captureInitialAddState === 'function') {
        captureInitialAddState();
    }
    if (typeof openAnimatedModal === 'function') {
        openAnimatedModal(addModal);
    }

    setTimeout(() => newAlgorithmTitle.focus(), 50);
    console.log(`showAddModal (v2 - Collapse): Окно для секции '${section}' открыто.`);
}
