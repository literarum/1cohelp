'use strict';

import { escapeHtml } from '../utils/html.js';

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
    if (deps.createStepElementHTML !== undefined)
        createStepElementHTML = deps.createStepElementHTML;
    if (deps.formatExampleForTextarea !== undefined)
        formatExampleForTextarea = deps.formatExampleForTextarea;
    if (deps.toggleStepCollapse !== undefined) toggleStepCollapse = deps.toggleStepCollapse;
    if (deps.attachStepDeleteHandler !== undefined)
        attachStepDeleteHandler = deps.attachStepDeleteHandler;
    if (deps.updateStepNumbers !== undefined) updateStepNumbers = deps.updateStepNumbers;
    if (deps.initStepSorting !== undefined) initStepSorting = deps.initStepSorting;
    if (deps.captureInitialEditState !== undefined)
        captureInitialEditState = deps.captureInitialEditState;
    if (deps.captureInitialAddState !== undefined)
        captureInitialAddState = deps.captureInitialAddState;
    if (deps.openAnimatedModal !== undefined) openAnimatedModal = deps.openAnimatedModal;
    if (deps.attachScreenshotHandlers !== undefined)
        attachScreenshotHandlers = deps.attachScreenshotHandlers;
    if (deps.renderExistingThumbnail !== undefined)
        renderExistingThumbnail = deps.renderExistingThumbnail;
    if (deps.addNewStep !== undefined) addNewStep = deps.addNewStep;
    if (deps.getSectionName !== undefined) getSectionName = deps.getSectionName;
}

// ============================================================================
// ТЕЛЕФОННЫЕ НОМЕРА (ГЛАВНЫЙ АЛГОРИТМ)
// ============================================================================

const stepPhoneInputClasses =
    'step-phone-number-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';

/**
 * Создаёт DOM-элемент одной строки номера (поле + кнопка удаления)
 * @returns {HTMLDivElement}
 */
function createPhoneNumberRow(value = '') {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML = `
        <input type="text" class="${stepPhoneInputClasses}" placeholder="+7 (999) 123-45-67" value="${escapeHtml(value)}">
        <button type="button" class="step-phone-remove p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded shrink-0" aria-label="Удалить номер">
            <i class="fas fa-times"></i>
        </button>
    `;
    const removeBtn = row.querySelector('.step-phone-remove');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => row.remove());
    }
    return row;
}

/**
 * Вешает делегацию на контейнер шагов для кнопки «Добавить номер»
 * @param {HTMLElement} editStepsContainer
 */
function attachPhoneNumbersDelegate(editStepsContainer) {
    if (editStepsContainer._phoneNumbersDelegateAttached) return;
    editStepsContainer._phoneNumbersDelegateAttached = true;
    editStepsContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.step-add-phone-btn');
        if (addBtn) {
            const stepDiv = addBtn.closest('.edit-step');
            const list = stepDiv?.querySelector('.step-phone-numbers-list');
            if (list) list.appendChild(createPhoneNumberRow());
        }
    });
}

/**
 * Вешает делегацию для переключателя «Режим номеров»: скрывает/показывает блоки step-numbers-mode-hide и step-phone-numbers-block (в т.ч. для шагов, добавленных через «Добавить шаг»).
 * @param {HTMLElement} editStepsContainer
 */
function attachNumbersModeVisibilityDelegate(editStepsContainer) {
    if (editStepsContainer._numbersModeVisibilityDelegateAttached) return;
    editStepsContainer._numbersModeVisibilityDelegateAttached = true;
    editStepsContainer.addEventListener('change', (e) => {
        const input = e.target.closest('.step-numbers-mode-input');
        if (!input) return;
        const stepDiv = input.closest('.edit-step');
        if (!stepDiv) return;
        const phoneBlock = stepDiv.querySelector('.step-phone-numbers-block');
        const hideBlocks = stepDiv.querySelectorAll('.step-numbers-mode-hide');
        if (phoneBlock) phoneBlock.classList.toggle('hidden', !input.checked);
        hideBlocks.forEach((el) => el.classList.toggle('hidden', input.checked));
    });
}

// ============================================================================
// ГРУППЫ ГЛАВНОГО АЛГОРИТМА
// ============================================================================

/**
 * Рендерит панель «Управление группами» и обновляет селекты групп в шагах
 * @param {HTMLElement} container - контейнер для панели
 * @param {Object} algorithm - копия алгоритма (algorithm.groups)
 * @param {HTMLElement} editStepsContainer - контейнер с .edit-step
 */
function renderMainAlgoGroupsPanel(container, algorithm, editStepsContainer) {
    const groups = Array.isArray(algorithm.groups) ? algorithm.groups : [];
    container.innerHTML = `
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-3 bg-white dark:bg-gray-700/50">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Управление группами</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Группы позволяют свернуть шаги в блоки на главном экране. Назначьте группу шагу в списке ниже.</p>
            <div id="editMainAlgoGroupsList" class="space-y-2 mb-2"></div>
            <button type="button" class="add-main-algo-group-btn px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
                <i class="fas fa-plus mr-1"></i>Добавить группу
            </button>
        </div>
    `;
    const listEl = container.querySelector('#editMainAlgoGroupsList');
    if (!listEl) return;

    groups.forEach((g, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        row.dataset.groupId = g.id;
        const isNewOrDirty = !!g.isNew;
        row.innerHTML = `
            <input type="text" class="main-algo-group-title flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" value="${typeof g.title === 'string' ? g.title.replace(/"/g, '&quot;') : g.id}" placeholder="Название группы">
            <button type="button" class="main-algo-group-save p-1.5 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-green-600 dark:text-green-400 shrink-0" title="Сохранить" aria-label="Сохранить" ${isNewOrDirty ? '' : 'style="display:none"'}>${isNewOrDirty ? '<i class="fas fa-check text-xs"></i>' : ''}</button>
            <button type="button" class="main-algo-group-delete px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Удалить группу" aria-label="Удалить группу"><i class="fas fa-trash"></i></button>
        `;
        const input = row.querySelector('.main-algo-group-title');
        const saveBtn = row.querySelector('.main-algo-group-save');
        const deleteBtn = row.querySelector('.main-algo-group-delete');

        const syncTitleToSelects = (newTitle) => {
            if (algorithm.groups[idx]) {
                algorithm.groups[idx].title = newTitle;
                editStepsContainer?.querySelectorAll('.step-group-id').forEach((sel) => {
                    const opt = Array.from(sel.options).find((o) => o.value === g.id);
                    if (opt) opt.textContent = newTitle;
                });
            }
        };

        const showSaveBtn = () => {
            saveBtn.style.display = '';
            saveBtn.innerHTML = '<i class="fas fa-check text-xs"></i>';
        };
        const hideSaveBtn = () => {
            saveBtn.style.display = 'none';
            saveBtn.innerHTML = '';
        };

        let savedTitle = (input.value || '').trim() || g.id;

        const confirmGroup = () => {
            if (algorithm.groups[idx]) {
                const newTitle = input.value.trim() || algorithm.groups[idx].id;
                algorithm.groups[idx].title = newTitle;
                syncTitleToSelects(newTitle);
                delete algorithm.groups[idx].isNew;
                savedTitle = newTitle;
                hideSaveBtn();
            }
        };

        input.addEventListener('input', () => {
            const newTitle = input.value.trim() || algorithm.groups[idx]?.id;
            syncTitleToSelects(newTitle);
            if (newTitle !== savedTitle) showSaveBtn();
            else hideSaveBtn();
        });

        input.addEventListener('focus', () => {
            const currentTitle = (input.value || '').trim() || g.id;
            if (currentTitle !== savedTitle) showSaveBtn();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmGroup();
                input.blur();
            } else if (e.key === 'Escape' && g.isNew) {
                e.preventDefault();
                algorithm.groups.splice(idx, 1);
                renderMainAlgoGroupsPanel(container, algorithm, editStepsContainer);
            }
        });

        saveBtn.addEventListener('click', () => {
            confirmGroup();
            input.blur();
        });

        deleteBtn.addEventListener('click', () => {
            algorithm.groups.splice(idx, 1);
            renderMainAlgoGroupsPanel(container, algorithm, editStepsContainer);
        });
        listEl.appendChild(row);
    });

    container.querySelector('.add-main-algo-group-btn').addEventListener('click', () => {
        const id = `gr-${Date.now()}`;
        algorithm.groups.push({ id, title: 'Новая группа', isNew: true });
        renderMainAlgoGroupsPanel(container, algorithm, editStepsContainer);
        const list = container.querySelector('#editMainAlgoGroupsList');
        const inputs = list?.querySelectorAll('.main-algo-group-title');
        const lastInput = inputs?.length ? inputs[inputs.length - 1] : null;
        if (lastInput) {
            lastInput.focus();
            lastInput.select();
        }
    });

    editStepsContainer?.querySelectorAll('.edit-step').forEach((stepDiv) => {
        const sel = stepDiv.querySelector('.step-group-id');
        if (!sel) return;
        const currentVal = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        groups.forEach((g) => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.title || g.id;
            sel.appendChild(opt);
        });
        if (currentVal && groups.some((g) => g.id === currentVal)) sel.value = currentVal;
    });
}

/**
 * Реорганизует шаги главного алгоритма в визуальные группы и инициализирует перетаскивание
 * @param {HTMLElement} editStepsContainer - контейнер #editSteps
 * @param {Array<HTMLElement>} stepDivs - массив элементов .edit-step
 * @param {Object} algorithm - копия алгоритма с groups
 * @param {Function} initStepSortingFn - функция инициализации Sortable
 * @param {Function} updateStepNumbersFn - функция обновления нумерации
 */
function reorganizeMainAlgoStepsIntoGroups(
    editStepsContainer,
    stepDivs,
    algorithm,
    initStepSortingFn,
    updateStepNumbersFn,
) {
    const groups = Array.isArray(algorithm.groups) ? algorithm.groups : [];
    const steps = Array.isArray(algorithm.steps) ? algorithm.steps : [];
    const groupMetaById = new Map(groups.map((g) => [g.id, g]));

    editStepsContainer.innerHTML = '';

    let currentGroupId = null;
    let currentGroupBody = null;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepDiv = stepDivs[i];
        if (!stepDiv) continue;

        const gid = step && step.groupId ? step.groupId : null;
        const hasValidGroup = gid && groupMetaById.has(gid);

        if (!hasValidGroup) {
            currentGroupId = null;
            currentGroupBody = null;
            editStepsContainer.appendChild(stepDiv);
            continue;
        }

        if (gid !== currentGroupId) {
            currentGroupId = gid;
            const group = groupMetaById.get(gid);

            const block = document.createElement('div');
            block.className =
                'edit-main-algo-group-block edit-main-algo-group-block-closed mb-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50';
            block.dataset.groupId = group.id;

            const header = document.createElement('div');
            header.className =
                'edit-main-algo-group-header flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 cursor-grab border-b border-gray-200 dark:border-gray-600';
            header.innerHTML = `
            <i class="fas fa-grip-vertical main-algo-group-drag-handle text-gray-400 dark:text-gray-500 shrink-0" title="Перетащить группу"></i>
            <button type="button" class="edit-main-algo-group-toggle p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 shrink-0" aria-label="Развернуть группу" title="Развернуть"><i class="fas fa-chevron-down edit-main-algo-group-chevron transition-transform"></i></button>
            <span class="font-medium text-gray-800 dark:text-gray-200 flex-1">${escapeHtml(group.title || group.id)}</span>
        `;

            const body = document.createElement('div');
            body.className = 'edit-main-algo-group-steps p-2 space-y-2';

            const toggleGroup = () => {
                block.classList.toggle('edit-main-algo-group-block-closed');
                const closed = block.classList.contains('edit-main-algo-group-block-closed');
                const toggleBtn = block.querySelector('.edit-main-algo-group-toggle');
                if (toggleBtn) {
                    toggleBtn.setAttribute('aria-label', closed ? 'Развернуть группу' : 'Свернуть группу');
                    toggleBtn.setAttribute('title', closed ? 'Развернуть' : 'Свернуть');
                }
                const chevron = block.querySelector('.edit-main-algo-group-chevron');
                if (chevron) chevron.style.transform = closed ? 'rotate(-90deg)' : '';
            };

            const chevron = block.querySelector('.edit-main-algo-group-chevron');
            if (chevron) chevron.style.transform = 'rotate(-90deg)';

            header.querySelector('.edit-main-algo-group-toggle')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleGroup();
            });
            header.addEventListener('click', (e) => {
                if (e.target.closest('.main-algo-group-drag-handle')) return;
                if (e.target.closest('.edit-main-algo-group-toggle')) return;
                toggleGroup();
            });

            block.appendChild(header);
            block.appendChild(body);
            editStepsContainer.appendChild(block);

            currentGroupBody = body;
        }

        if (currentGroupBody) {
            currentGroupBody.appendChild(stepDiv);
        } else {
            editStepsContainer.appendChild(stepDiv);
        }
    }

    const moveStepToGroup = (stepDiv, groupId) => {
        const sel = stepDiv.querySelector('.step-group-id');
        if (sel) sel.value = groupId || '';

        if (!groupId) {
            const firstBlock = editStepsContainer.querySelector('.edit-main-algo-group-block');
            if (firstBlock) {
                editStepsContainer.insertBefore(stepDiv, firstBlock);
            } else {
                editStepsContainer.appendChild(stepDiv);
            }
        } else {
            const targetBody = editStepsContainer.querySelector(
                `.edit-main-algo-group-block[data-group-id="${groupId}"] .edit-main-algo-group-steps`,
            );
            if (targetBody) targetBody.appendChild(stepDiv);
        }
        if (typeof updateStepNumbersFn === 'function') updateStepNumbersFn(editStepsContainer);
    };

    editStepsContainer.querySelectorAll('.edit-step').forEach((stepDiv) => {
        const sel = stepDiv.querySelector('.step-group-id');
        if (!sel) return;
        sel.addEventListener('change', () => {
            moveStepToGroup(stepDiv, sel.value.trim() || null);
        });
    });

    if (typeof initStepSortingFn === 'function') {
        initStepSortingFn(editStepsContainer, true);
    }
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
            <button type="button" class="collapse-all-btn px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition">Свернуть все</button>
            <button type="button" class="expand-all-btn px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition ml-2">Развернуть все</button>
        `;
        actionsContainer.insertBefore(collapseControls, actionsContainer.firstChild);

        actionsContainer.querySelector('.collapse-all-btn').addEventListener('click', () => {
            editStepsContainerElement.querySelectorAll('.edit-step').forEach((step) => {
                if (typeof toggleStepCollapse === 'function') {
                    toggleStepCollapse(step, true);
                }
            });
        });
        actionsContainer.querySelector('.expand-all-btn').addEventListener('click', () => {
            editStepsContainerElement.querySelectorAll('.edit-step').forEach((step) => {
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

        if (isMainAlgorithm) {
            if (!Array.isArray(algorithm.groups)) algorithm.groups = [];
            let groupsContainer = document.getElementById('editMainAlgoGroups');
            if (!groupsContainer) {
                groupsContainer = document.createElement('div');
                groupsContainer.id = 'editMainAlgoGroups';
                groupsContainer.className = 'mb-4';
                editStepsContainerElement.parentNode.insertBefore(
                    groupsContainer,
                    editStepsContainerElement,
                );
            }
            groupsContainer.style.display = 'block';
            renderMainAlgoGroupsPanel(groupsContainer, algorithm, editStepsContainerElement);
        } else {
            const groupsContainer = document.getElementById('editMainAlgoGroups');
            if (groupsContainer) groupsContainer.style.display = 'none';
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

                if (isMainAlgorithm) {
                    const phoneList = stepDiv.querySelector('.step-phone-numbers-list');
                    if (phoneList) {
                        const numbers = Array.isArray(step.phoneNumbers) ? step.phoneNumbers : [];
                        numbers.forEach((val) => phoneList.appendChild(createPhoneNumberRow(val)));
                    }
                    const numbersModeInput = stepDiv.querySelector('.step-numbers-mode-input');
                    const phoneBlock = stepDiv.querySelector('.step-phone-numbers-block');
                    const stepNumbersEnabled =
                        step.phoneNumbersEnabled ??
                        (Array.isArray(step.phoneNumbers) && step.phoneNumbers.length > 0);
                    if (numbersModeInput) {
                        numbersModeInput.checked = !!stepNumbersEnabled;
                        numbersModeInput.addEventListener('change', () => {
                            if (phoneBlock) {
                                phoneBlock.classList.toggle('hidden', !numbersModeInput.checked);
                            }
                            stepDiv.querySelectorAll('.step-numbers-mode-hide').forEach((el) => {
                                el.classList.toggle('hidden', numbersModeInput.checked);
                            });
                        });
                    }
                    if (phoneBlock) {
                        phoneBlock.classList.toggle('hidden', !stepNumbersEnabled);
                    }
                    stepDiv.querySelectorAll('.step-numbers-mode-hide').forEach((el) => {
                        el.classList.toggle('hidden', !!stepNumbersEnabled);
                    });
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
                if (isMainAlgorithm) {
                    const groupSelect = stepDiv.querySelector('.step-group-id');
                    if (groupSelect && Array.isArray(algorithm.groups)) {
                        algorithm.groups.forEach((g) => {
                            const opt = document.createElement('option');
                            opt.value = g.id;
                            opt.textContent = g.title || g.id;
                            groupSelect.appendChild(opt);
                        });
                        if (step.groupId && algorithm.groups.some((g) => g.id === step.groupId)) {
                            groupSelect.value = step.groupId;
                        }
                    }
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

                if (typeof toggleStepCollapse === 'function') {
                    toggleStepCollapse(stepDiv, true);
                }
                return stepDiv;
            });
            const stepDivs = (await Promise.all(stepPromises)).filter(Boolean);

            if (isMainAlgorithm && Array.isArray(algorithm.groups) && algorithm.groups.length > 0) {
                reorganizeMainAlgoStepsIntoGroups(
                    editStepsContainerElement,
                    stepDivs,
                    algorithm,
                    initStepSorting,
                    updateStepNumbers,
                );
            } else {
                stepDivs.forEach((div) => fragment.appendChild(div));
                editStepsContainerElement.appendChild(fragment);
                if (typeof updateStepNumbers === 'function') {
                    updateStepNumbers(editStepsContainerElement);
                }
                if (typeof initStepSorting === 'function') {
                    initStepSorting(editStepsContainerElement);
                }
            }
            if (isMainAlgorithm) {
                const groupsContainerAfter = document.getElementById('editMainAlgoGroups');
                if (groupsContainerAfter) {
                    renderMainAlgoGroupsPanel(
                        groupsContainerAfter,
                        algorithm,
                        editStepsContainerElement,
                    );
                }
                attachPhoneNumbersDelegate(editStepsContainerElement);
                attachNumbersModeVisibilityDelegate(editStepsContainerElement);
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

        if (!isMainAlgorithm || !Array.isArray(algorithm.groups) || algorithm.groups.length === 0) {
            if (typeof initStepSorting === 'function') {
                initStepSorting(editStepsContainerElement);
            }
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
            <button type="button" class="collapse-all-btn px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition">Свернуть все</button>
            <button type="button" class="expand-all-btn px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition ml-2">Развернуть все</button>
        `;
        actionsContainer.insertBefore(collapseControls, actionsContainer.firstChild);

        actionsContainer.querySelector('.collapse-all-btn').addEventListener('click', () => {
            newStepsContainerElement.querySelectorAll('.edit-step').forEach((step) => {
                if (typeof toggleStepCollapse === 'function') {
                    toggleStepCollapse(step, true);
                }
            });
        });
        actionsContainer.querySelector('.expand-all-btn').addEventListener('click', () => {
            newStepsContainerElement.querySelectorAll('.edit-step').forEach((step) => {
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

    // ВАЖНО: сначала задаём секцию модальному окну, затем вызываем addNewStep,
    // чтобы внутри addNewStep всегда был доступен корректный addModal.dataset.section.
    addModal.dataset.section = section;

    if (typeof addNewStep === 'function') {
        addNewStep(true);
    } else {
        console.error('showAddModal: Функция addNewStep не найдена');
    }
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
