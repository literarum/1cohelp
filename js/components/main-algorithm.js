'use strict';

import { escapeHtml } from '../utils/html.js';
import { getStepContentAsText } from '../utils/helpers.js';
import {
    MAIN_ALGO_COLLAPSE_KEY,
    MAIN_ALGO_COLLAPSE_LOCAL_MIRROR_KEY,
    MAIN_ALGO_HEADERS_ONLY_KEY,
    MAIN_ALGO_DENSITY_KEY,
    MAIN_ALGO_HEADERS_EXPANDED_KEY,
    MAIN_ALGO_GROUPS_OPEN_KEY,
} from '../constants.js';
import {
    collectCollapsedMainAlgoIndicesFromDom,
    isMainStepCollapsibleInView,
} from './main-algo-collapse-persist.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

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
function parseCollapseStatePayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const stepsCount = raw.stepsCount;
    const collapsedIndices = raw.collapsedIndices;
    if (!Number.isInteger(stepsCount) || stepsCount < 0 || !Array.isArray(collapsedIndices)) {
        return null;
    }
    return { stepsCount, collapsedIndices };
}

/**
 * Читает зеркало из localStorage (резервный контур, если IndexedDB недоступен или пуст).
 */
function loadMainAlgoCollapseStateFromLocalMirror() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(MAIN_ALGO_COLLAPSE_LOCAL_MIRROR_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parseCollapseStatePayload(parsed);
    } catch (e) {
        console.warn('[loadMainAlgoCollapseState] Ошибка чтения зеркала localStorage:', e);
        return null;
    }
}

export async function loadMainAlgoCollapseState() {
    let fromDb = null;
    try {
        const saved = await getFromIndexedDB('preferences', MAIN_ALGO_COLLAPSE_KEY);
        if (saved && saved.data && typeof saved.data === 'object') {
            fromDb = parseCollapseStatePayload(saved.data);
        }
    } catch (error) {
        console.warn('[loadMainAlgoCollapseState] Ошибка загрузки состояния:', error);
    }
    if (fromDb) {
        return fromDb;
    }
    return loadMainAlgoCollapseStateFromLocalMirror();
}

/**
 * Сохраняет состояние свернутости главного алгоритма
 */
export async function saveMainAlgoCollapseState(state) {
    const normalized = parseCollapseStatePayload(state);
    if (!normalized) {
        console.warn('[saveMainAlgoCollapseState] Пропуск: невалидное состояние', state);
        return;
    }
    try {
        await saveToIndexedDB('preferences', {
            id: MAIN_ALGO_COLLAPSE_KEY,
            data: normalized,
        });
    } catch (error) {
        console.error('[saveMainAlgoCollapseState] Ошибка сохранения в IndexedDB:', error);
    }
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(
                MAIN_ALGO_COLLAPSE_LOCAL_MIRROR_KEY,
                JSON.stringify(normalized),
            );
        }
    } catch (e) {
        console.warn('[saveMainAlgoCollapseState] Ошибка зеркала localStorage:', e);
    }
}

/**
 * Загружает настройки отображения главного алгоритма (режим «только заголовки», плотность)
 */
export async function loadMainAlgoViewPreference() {
    const defaults = {
        headersOnly: false,
        density: 'normal',
        headersExpandedIndices: [],
        openGroupIds: [],
    };
    try {
        const headersOnly = await getFromIndexedDB('preferences', MAIN_ALGO_HEADERS_ONLY_KEY);
        const density = await getFromIndexedDB('preferences', MAIN_ALGO_DENSITY_KEY);
        const headersExpanded = await getFromIndexedDB(
            'preferences',
            MAIN_ALGO_HEADERS_EXPANDED_KEY,
        );
        const groupsOpen = await getFromIndexedDB('preferences', MAIN_ALGO_GROUPS_OPEN_KEY);
        return {
            headersOnly:
                headersOnly && typeof headersOnly.data === 'boolean'
                    ? headersOnly.data
                    : defaults.headersOnly,
            density:
                density &&
                typeof density.data === 'string' &&
                (density.data === 'compact' || density.data === 'normal')
                    ? density.data
                    : defaults.density,
            headersExpandedIndices:
                headersExpanded && Array.isArray(headersExpanded.data)
                    ? headersExpanded.data
                    : defaults.headersExpandedIndices,
            openGroupIds:
                groupsOpen && Array.isArray(groupsOpen.data)
                    ? groupsOpen.data
                    : defaults.openGroupIds,
        };
    } catch (error) {
        console.warn('[loadMainAlgoViewPreference] Ошибка загрузки:', error);
        return defaults;
    }
}

/**
 * Сохраняет настройку «только заголовки»
 */
export async function saveMainAlgoHeadersOnly(value) {
    try {
        await saveToIndexedDB('preferences', { id: MAIN_ALGO_HEADERS_ONLY_KEY, data: !!value });
    } catch (error) {
        console.error('[saveMainAlgoHeadersOnly] Ошибка сохранения:', error);
    }
}

/**
 * Сохраняет плотность отображения (compact | normal)
 */
export async function saveMainAlgoDensity(value) {
    try {
        await saveToIndexedDB('preferences', {
            id: MAIN_ALGO_DENSITY_KEY,
            data: value === 'compact' ? 'compact' : 'normal',
        });
    } catch (error) {
        console.error('[saveMainAlgoDensity] Ошибка сохранения:', error);
    }
}

/**
 * Сохраняет индексы развёрнутых шагов в режиме «только заголовки»
 */
export async function saveMainAlgoHeadersExpanded(indices) {
    try {
        await saveToIndexedDB('preferences', {
            id: MAIN_ALGO_HEADERS_EXPANDED_KEY,
            data: Array.isArray(indices) ? indices : [],
        });
    } catch (error) {
        console.error('[saveMainAlgoHeadersExpanded] Ошибка сохранения:', error);
    }
}

/**
 * Стабильный #noInnLink после динамического рендера (DOM health, палитра команд, модалка «нет ИНН»).
 * @param {ParentNode | null | undefined} collapsibleBody
 * @param {object} step
 */
function appendNoInnHelpLink(collapsibleBody, step) {
    const needs =
        step && (step.showNoInnHelp === true || step.type === 'inn_step');
    if (!needs || !collapsibleBody) return;
    const p = document.createElement('p');
    p.className = 'text-sm text-gray-500 dark:text-gray-400 mt-1 italic';
    const a = document.createElement('a');
    a.href = '#';
    a.id = 'noInnLink';
    a.className = 'text-primary hover:underline';
    a.textContent = 'Что делать, если клиент не может назвать ИНН?';
    p.appendChild(a);
    collapsibleBody.appendChild(p);
}

/**
 * Сохраняет список id открытых групп
 */
export async function saveMainAlgoGroupsOpen(groupIds) {
    try {
        await saveToIndexedDB('preferences', {
            id: MAIN_ALGO_GROUPS_OPEN_KEY,
            data: Array.isArray(groupIds) ? groupIds : [],
        });
    } catch (error) {
        console.error('[saveMainAlgoGroupsOpen] Ошибка сохранения:', error);
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
    const viewPref = await loadMainAlgoViewPreference();

    const mainAlgoCard = document.getElementById('mainAlgoCard');
    if (mainAlgoCard) {
        if (viewPref.density === 'compact') {
            mainAlgoCard.classList.add('main-algo-density-compact');
        } else {
            mainAlgoCard.classList.remove('main-algo-density-compact');
        }
    }

    const savedCollapse = await loadMainAlgoCollapseState();
    const validIndices =
        savedCollapse && savedCollapse.stepsCount === mainSteps.length
            ? savedCollapse.collapsedIndices.filter(
                  (i) =>
                      Number.isInteger(i) &&
                      i >= 0 &&
                      i < mainSteps.length &&
                      isMainStepCollapsibleInView(mainSteps[i]),
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
            mainTitleElement.textContent =
                algorithms.main.title || DEFAULT_MAIN_ALGORITHM?.title || 'Главный алгоритм';
        }
        initMainAlgoToolbar(viewPref);
        return;
    }

    const fragment = document.createDocumentFragment();
    const headersExpandedSet = new Set(
        (viewPref.headersExpandedIndices || []).filter(
            (i) => Number.isInteger(i) && i >= 0 && i < mainSteps.length,
        ),
    );
    const groups = Array.isArray(algorithms.main.groups) ? algorithms.main.groups : [];
    const openGroupIdsSet = new Set(viewPref.openGroupIds || []);
    const groupMetaById = new Map(groups.map((g) => [g.id, g]));

    function buildStepElement(step, index) {
        if (!step || typeof step !== 'object') {
            const errorDiv = document.createElement('div');
            errorDiv.className =
                'algorithm-step bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 mb-3 rounded-lg';
            errorDiv.textContent = `Ошибка: шаг ${index + 1}.`;
            return errorDiv;
        }
        if (step.phoneNumbersEnabled) {
            return buildStepElementNumbersOnly(step, index);
        }
        if (viewPref.headersOnly) {
            return buildStepElementHeadersOnly(step, index);
        }
        return buildStepElementFull(step, index);
    }

    function buildStepElementNumbersOnly(step, _index) {
        const stepDiv = document.createElement('div');
        stepDiv.className =
            'algorithm-step bg-white dark:bg-gray-700 p-content-sm rounded-lg shadow-sm mb-3';
        const titleH3 = document.createElement('h3');
        titleH3.className = 'font-semibold text-gray-900 dark:text-gray-100 mb-2';
        titleH3.textContent = 'Телефоны';
        stepDiv.appendChild(titleH3);
        const phonesDiv = document.createElement('div');
        phonesDiv.className = 'text-gray-700 dark:text-gray-300';
        if (Array.isArray(step.phoneNumbers) && step.phoneNumbers.length > 0) {
            phonesDiv.innerHTML =
                '<ul class="list-disc list-inside space-y-1">' +
                step.phoneNumbers
                    .filter((s) => typeof s === 'string' && s.trim())
                    .map((s) => `<li>${escapeHtml(s.trim())}</li>`)
                    .join('') +
                '</ul>';
        } else {
            phonesDiv.textContent = 'Нет номеров';
        }
        stepDiv.appendChild(phonesDiv);
        return stepDiv;
    }

    function buildStepElementHeadersOnly(step, index) {
        const stepDiv = document.createElement('div');
        stepDiv.className =
            'algorithm-step bg-white dark:bg-gray-700 p-content-sm rounded-lg shadow-sm mb-3 headers-only-step';
        if (headersExpandedSet.has(index)) stepDiv.classList.add('is-expanded');

        if (step.additionalInfoText && step.additionalInfoShowTop) {
            const topDiv = document.createElement('div');
            topDiv.className =
                'additional-info-top mb-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words';
            topDiv.innerHTML =
                typeof window.linkify === 'function'
                    ? window.linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            stepDiv.appendChild(topDiv);
        }
        const titleH3 = document.createElement('h3');
        titleH3.className = 'font-semibold text-gray-900 dark:text-gray-100 mb-2';
        titleH3.textContent = step.title || `Шаг ${index + 1}`;
        stepDiv.appendChild(titleH3);
        const collapsibleBody = document.createElement('div');
        collapsibleBody.className = 'collapsible-body';
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
                if (step.description.intro)
                    listHTML += `<p class="mb-2">${escapeHtml(step.description.intro)}</p>`;
                if (Array.isArray(step.description.items)) {
                    listHTML += '<ul class="list-disc list-inside space-y-1">';
                    step.description.items.forEach((item) => {
                        listHTML += `<li>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</li>`;
                    });
                    listHTML += '</ul>';
                }
                descDiv.innerHTML = listHTML;
            }
            collapsibleBody.appendChild(descDiv);
        }
        if (step.example) {
            const exampleDiv = document.createElement('div');
            exampleDiv.className = 'mt-2 p-2';
            if (typeof step.example === 'string') {
                exampleDiv.innerHTML = `<strong>Пример:</strong><br>${escapeHtml(step.example)}`;
            } else if (typeof step.example === 'object' && step.example.type === 'list') {
                let ex = '';
                if (step.example.intro)
                    ex += `<p class="mb-2">${escapeHtml(step.example.intro)}</p>`;
                if (Array.isArray(step.example.items)) {
                    ex += '<ul class="list-disc list-inside space-y-1">';
                    step.example.items.forEach((item) => {
                        ex += `<li>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</li>`;
                    });
                    ex += '</ul>';
                }
                exampleDiv.innerHTML = ex;
            }
            collapsibleBody.appendChild(exampleDiv);
        }
        appendNoInnHelpLink(collapsibleBody, step);
        if (Array.isArray(step.phoneNumbers) && step.phoneNumbers.length > 0) {
            const phonesDiv = document.createElement('div');
            phonesDiv.className = 'mt-2 p-2';
            phonesDiv.innerHTML =
                '<strong>Телефоны:</strong><ul class="list-disc list-inside space-y-1 mt-1">' +
                step.phoneNumbers
                    .filter((s) => typeof s === 'string' && s.trim())
                    .map((s) => `<li>${escapeHtml(s.trim())}</li>`)
                    .join('') +
                '</ul>';
            collapsibleBody.appendChild(phonesDiv);
        }
        if (step.additionalInfoText && step.additionalInfoShowBottom) {
            const bottomDiv = document.createElement('div');
            bottomDiv.className =
                'additional-info-bottom mt-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words';
            bottomDiv.innerHTML =
                typeof window.linkify === 'function'
                    ? window.linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            collapsibleBody.appendChild(bottomDiv);
        }
        stepDiv.appendChild(collapsibleBody);
        titleH3.addEventListener('click', async () => {
            stepDiv.classList.toggle('is-expanded');
            const list = Array.from(
                mainAlgorithmContainer.querySelectorAll('.algorithm-step.headers-only-step'),
            );
            const indices = list
                .map((el, i) => (el.classList.contains('is-expanded') ? i : -1))
                .filter((i) => i >= 0);
            await saveMainAlgoHeadersExpanded(indices);
        });
        if (step.isCopyable && typeof copyToClipboard === 'function') {
            stepDiv.classList.add('copyable-step-active');
            stepDiv.title = 'Нажмите, чтобы скопировать содержимое шага';
            stepDiv.style.cursor = 'pointer';
            stepDiv.addEventListener('click', (e) => {
                if (e.target.closest('h3')) return;
                if (e.target.closest('a')) return;
                const data = algorithms.main.steps[index];
                if (data) {
                    const text = getStepContentAsText(data);
                    if (text && text.trim()) copyToClipboard(text, 'Содержимое шага скопировано!');
                }
            });
        }
        return stepDiv;
    }

    function buildStepElementFull(step, index) {
        const stepDiv = document.createElement('div');
        const isCollapsible = isMainStepCollapsibleInView(step);
        stepDiv.className =
            'algorithm-step bg-white dark:bg-gray-700 p-content-sm rounded-lg shadow-sm mb-3';
        if (isCollapsible) {
            stepDiv.classList.add('collapsible');
            stepDiv.setAttribute('data-main-algo-step-index', String(index));
            if (collapsedSet.has(index)) stepDiv.classList.add('is-collapsed');
        }
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
            if (
                e.target.closest('a') ||
                e.target.closest('button') ||
                e.target.closest('[role="button"]')
            )
                return;
            const currentStepData = algorithms.main.steps[index];
            if (
                currentStepData &&
                currentStepData.isCopyable &&
                typeof copyToClipboard === 'function'
            ) {
                const textToCopy = getStepContentAsText(currentStepData);
                if (textToCopy && textToCopy.trim()) {
                    copyToClipboard(textToCopy, 'Содержимое шага скопировано!');
                }
            }
        });
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
        const titleH3 = document.createElement('h3');
        titleH3.className = 'font-semibold text-gray-900 dark:text-gray-100 mb-2';
        titleH3.textContent = step.title || `Шаг ${index + 1}`;
        stepDiv.appendChild(titleH3);
        const collapsibleBody = document.createElement('div');
        collapsibleBody.className = 'collapsible-body';
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
                if (step.description.intro)
                    listHTML += `<p class="mb-2">${escapeHtml(step.description.intro)}</p>`;
                if (Array.isArray(step.description.items)) {
                    listHTML += '<ul class="list-disc list-inside space-y-1">';
                    step.description.items.forEach((item) => {
                        listHTML += `<li>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</li>`;
                    });
                    listHTML += '</ul>';
                }
                descDiv.innerHTML = listHTML;
            }
            collapsibleBody.appendChild(descDiv);
        }
        if (step.example) {
            const exampleDiv = document.createElement('div');
            exampleDiv.className = 'mt-2 p-2';
            if (typeof step.example === 'string') {
                exampleDiv.innerHTML = `<strong>Пример:</strong><br>${escapeHtml(step.example)}`;
            } else if (typeof step.example === 'object' && step.example.type === 'list') {
                let exampleHTML = '';
                if (step.example.intro)
                    exampleHTML += `<p class="mb-2">${escapeHtml(step.example.intro)}</p>`;
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
            collapsibleBody.appendChild(exampleDiv);
        }
        appendNoInnHelpLink(collapsibleBody, step);
        if (Array.isArray(step.phoneNumbers) && step.phoneNumbers.length > 0) {
            const phonesDiv = document.createElement('div');
            phonesDiv.className = 'mt-2 p-2';
            phonesDiv.innerHTML =
                '<strong>Телефоны:</strong><ul class="list-disc list-inside space-y-1 mt-1">' +
                step.phoneNumbers
                    .filter((s) => typeof s === 'string' && s.trim())
                    .map((s) => `<li>${escapeHtml(s.trim())}</li>`)
                    .join('') +
                '</ul>';
            collapsibleBody.appendChild(phonesDiv);
        }
        if (step.additionalInfoText && step.additionalInfoShowBottom) {
            const additionalInfoBottomDiv = document.createElement('div');
            additionalInfoBottomDiv.className =
                'additional-info-bottom mt-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words';
            additionalInfoBottomDiv.innerHTML =
                typeof window.linkify === 'function'
                    ? window.linkify(step.additionalInfoText)
                    : escapeHtml(step.additionalInfoText);
            collapsibleBody.appendChild(additionalInfoBottomDiv);
        }
        stepDiv.appendChild(collapsibleBody);
        if (isCollapsible) {
            titleH3.addEventListener('click', async () => {
                stepDiv.classList.toggle('is-collapsed');
                const indices = collectCollapsedMainAlgoIndicesFromDom(mainAlgorithmContainer);
                await saveMainAlgoCollapseState({
                    stepsCount: mainSteps.length,
                    collapsedIndices: indices,
                });
            });
        }
        return stepDiv;
    }

    if (groups.length === 0) {
        mainSteps.forEach((step, index) => {
            fragment.appendChild(buildStepElement(step, index));
        });
    } else {
        // Рендерим шаги и группы строго в порядке массива steps:
        // одиночные шаги идут как есть, а подряд идущие шаги с одинаковым groupId
        // объединяем в один блок группы.
        let i = 0;
        const total = mainSteps.length;

        while (i < total) {
            const step = mainSteps[i];
            const groupId = step && step.groupId ? step.groupId : null;

            // Нет валидной группы — рендерим шаг как обычный.
            if (!groupId || !groupMetaById.has(groupId)) {
                fragment.appendChild(buildStepElement(step, i));
                i += 1;
                continue;
            }

            // Есть валидная группа — собираем подряд идущие шаги с этим groupId.
            const group = groupMetaById.get(groupId);
            const groupIndices = [];
            let j = i;
            while (j < total && mainSteps[j] && mainSteps[j].groupId === groupId) {
                groupIndices.push(j);
                j += 1;
            }

            if (groupIndices.length === 0) {
                fragment.appendChild(buildStepElement(step, i));
                i += 1;
                continue;
            }

            const groupDiv = document.createElement('div');
            groupDiv.className =
                'main-algo-group view-item rounded-lg' +
                (openGroupIdsSet.has(group.id) ? '' : ' is-closed');
            groupDiv.dataset.groupId = group.id;

            const header = document.createElement('div');
            header.className = 'main-algo-group-header';
            header.innerHTML = `${escapeHtml(group.title || group.id)} <i class="fas fa-chevron-down"></i>`;
            header.addEventListener('click', async () => {
                groupDiv.classList.toggle('is-closed');
                const openIds = Array.from(
                    mainAlgorithmContainer.querySelectorAll('.main-algo-group:not(.is-closed)'),
                )
                    .map((el) => el.dataset.groupId)
                    .filter(Boolean);
                await saveMainAlgoGroupsOpen(openIds);
            });
            groupDiv.appendChild(header);

            const body = document.createElement('div');
            body.className = 'main-algo-group-body';
            groupIndices.forEach((idx) => {
                body.appendChild(buildStepElement(mainSteps[idx], idx));
            });
            groupDiv.appendChild(body);
            fragment.appendChild(groupDiv);

            // Переходим к следующему шагу за пределами текущей группы.
            i = j;
        }
    }

    mainAlgorithmContainer.appendChild(fragment);

    // Обновление заголовка
    const mainTitleElement = document.querySelector('#mainContent > div > div:nth-child(1) h2');
    if (mainTitleElement) {
        mainTitleElement.textContent =
            algorithms.main.title || DEFAULT_MAIN_ALGORITHM?.title || 'Главный алгоритм работы';
    }

    initMainAlgoToolbar(viewPref);
    console.log('[renderMainAlgorithm v9] Рендеринг главного алгоритма завершен.');
}

let _mainAlgoToolbarInited = false;

/**
 * Инициализирует панель переключателей главного алгоритма (только заголовки, плотность)
 * @param {Object} viewPref - результат loadMainAlgoViewPreference()
 */
function initMainAlgoToolbar(viewPref) {
    const toolbar = document.getElementById('mainAlgoToolbar');
    const headersOnlyCheckbox = document.getElementById('mainAlgoHeadersOnly');
    const densityNormalBtn = document.getElementById('mainAlgoDensityNormal');
    const densityCompactBtn = document.getElementById('mainAlgoDensityCompact');
    const mainAlgoCard = document.getElementById('mainAlgoCard');

    if (!toolbar || !headersOnlyCheckbox) return;

    headersOnlyCheckbox.checked = !!viewPref.headersOnly;
    if (densityNormalBtn && densityCompactBtn) {
        densityNormalBtn.classList.toggle('bg-primary', viewPref.density === 'normal');
        densityNormalBtn.classList.toggle('text-white', viewPref.density === 'normal');
        densityCompactBtn.classList.toggle('bg-primary', viewPref.density === 'compact');
        densityCompactBtn.classList.toggle('text-white', viewPref.density === 'compact');
    }

    if (_mainAlgoToolbarInited) return;
    _mainAlgoToolbarInited = true;

    headersOnlyCheckbox.addEventListener('change', async () => {
        await saveMainAlgoHeadersOnly(headersOnlyCheckbox.checked);
        await renderMainAlgorithm();
    });

    if (densityNormalBtn) {
        densityNormalBtn.addEventListener('click', async () => {
            await saveMainAlgoDensity('normal');
            if (mainAlgoCard) mainAlgoCard.classList.remove('main-algo-density-compact');
            if (densityNormalBtn) {
                densityNormalBtn.classList.add('bg-primary', 'text-white');
            }
            if (densityCompactBtn) {
                densityCompactBtn.classList.remove('bg-primary', 'text-white');
            }
        });
    }
    if (densityCompactBtn) {
        densityCompactBtn.addEventListener('click', async () => {
            await saveMainAlgoDensity('compact');
            if (mainAlgoCard) mainAlgoCard.classList.add('main-algo-density-compact');
            if (densityNormalBtn) {
                densityNormalBtn.classList.remove('bg-primary', 'text-white');
            }
            if (densityCompactBtn) {
                densityCompactBtn.classList.add('bg-primary', 'text-white');
            }
        });
    }
}
