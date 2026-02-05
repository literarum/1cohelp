'use strict';

import { escapeHtml } from '../utils/html.js';
import { getStepContentAsText, getSectionName, formatExampleForTextarea } from '../utils/helpers.js';
import * as State from '../app/state.js';

// ============================================================================
// КОМПОНЕНТ РАБОТЫ С АЛГОРИТМАМИ
// ============================================================================

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
    if (typeof window.renderMainAlgorithm === 'function') {
        window.renderMainAlgorithm();
    }
    renderAlgorithmCards('program');
    renderAlgorithmCards('skzi');
    renderAlgorithmCards('webReg');
    renderAlgorithmCards('lk1c');
}
