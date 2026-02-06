'use strict';

/**
 * Модуль рендеринга алгоритмов
 * Содержит функции для отображения деталей алгоритмов
 */

import { escapeHtml, linkify } from '../utils/html.js';
import { State } from '../app/state.js';

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let algorithms = null;
let isFavorite = null;
let getFavoriteButtonHTML = null;
let showNotification = null;
let ExportService = null;
let renderScreenshotIcon = null;
let handleViewScreenshotClick = null;
let openAnimatedModal = null;

/**
 * Устанавливает зависимости для модуля рендеринга
 */
export function setAlgorithmsRendererDependencies(deps) {
    algorithms = deps.algorithms;
    isFavorite = deps.isFavorite;
    getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    showNotification = deps.showNotification;
    ExportService = deps.ExportService;
    renderScreenshotIcon = deps.renderScreenshotIcon;
    handleViewScreenshotClick = deps.handleViewScreenshotClick;
    openAnimatedModal = deps.openAnimatedModal;
}

/**
 * Показывает детали алгоритма в модальном окне
 * @param {Object} algorithm - Объект алгоритма
 * @param {string} section - Секция алгоритма
 */
export async function showAlgorithmDetail(algorithm, section) {
    console.log(
        `[showAlgorithmDetail v11 - PDF Export Fix] Вызвана. Алгоритм ID: ${algorithm?.id}, Секция: ${section}`,
    );

    const algorithmModal = document.getElementById('algorithmModal');
    const modalTitleElement = document.getElementById('modalTitle');
    const algorithmStepsContainer = document.getElementById('algorithmSteps');
    const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');
    const editAlgorithmBtnModal = document.getElementById('editAlgorithmBtn');

    if (!algorithmModal || !modalTitleElement || !algorithmStepsContainer) {
        console.error(
            '[showAlgorithmDetail v11 Error] Не найдены основные элементы модального окна.',
        );
        if (showNotification) {
            showNotification(
                'Критическая ошибка интерфейса: не найдены элементы окна деталей.',
                'error',
            );
        }
        return;
    }
    if (!algorithm || typeof algorithm !== 'object') {
        console.error(
            '[showAlgorithmDetail v11 Error] Передан некорректный объект алгоритма:',
            algorithm,
        );
        if (showNotification) {
            showNotification('Ошибка: Некорректные данные алгоритма.', 'error');
        }
        return;
    }
    const currentAlgorithmId =
        section === 'main' || algorithm.id === 'main' ? 'main' : algorithm.id || null;
    if (currentAlgorithmId === null) {
        console.error(`[showAlgorithmDetail v11 Error] Не удалось определить ID алгоритма.`);
        if (showNotification) {
            showNotification('Ошибка: Не удалось определить ID алгоритма.', 'error');
        }
        return;
    }

    algorithmModal.dataset.currentAlgorithmId = String(currentAlgorithmId);
    algorithmModal.dataset.currentSection = section;
    if (currentAlgorithmId !== 'main') {
        const host = algorithmStepsContainer.parentElement || algorithmStepsContainer;
        if (host && typeof window.renderPdfAttachmentsSection === 'function') {
            window.renderPdfAttachmentsSection(host, 'algorithm', String(currentAlgorithmId));
        }
    }

    modalTitleElement.textContent = algorithm.title ?? 'Детали алгоритма';
    algorithmStepsContainer.innerHTML =
        '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Загрузка шагов...</p>';

    if (deleteAlgorithmBtn) deleteAlgorithmBtn.style.display = section === 'main' ? 'none' : '';
    if (editAlgorithmBtnModal) editAlgorithmBtnModal.style.display = '';

    const headerControlsContainer = modalTitleElement.parentElement.querySelector(
        '.flex.flex-wrap.gap-2.justify-end',
    );
    if (headerControlsContainer) {
        let exportButtonContainer = headerControlsContainer.querySelector(
            '.export-btn-placeholder-modal',
        );
        if (!exportButtonContainer) {
            exportButtonContainer = document.createElement('div');
            exportButtonContainer.className = 'export-btn-placeholder-modal';
            const exportButton = document.createElement('button');
            exportButton.id = 'exportAlgorithmToPdfBtn';
            exportButton.type = 'button';
            exportButton.className =
                'inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle';
            exportButton.title = 'Экспорт в PDF';
            exportButton.innerHTML = '<i class="fas fa-file-pdf"></i>';
            exportButtonContainer.appendChild(exportButton);
            if (editAlgorithmBtnModal) {
                editAlgorithmBtnModal.insertAdjacentElement('beforebegin', exportButtonContainer);
            } else if (deleteAlgorithmBtn) {
                deleteAlgorithmBtn.insertAdjacentElement('beforebegin', exportButtonContainer);
            } else {
                headerControlsContainer.insertBefore(
                    exportButtonContainer,
                    headerControlsContainer.firstChild,
                );
            }
        }
        const exportBtn = headerControlsContainer.querySelector('#exportAlgorithmToPdfBtn');
        if (exportBtn && ExportService) {
            if (exportBtn._clickHandler) {
                exportBtn.removeEventListener('click', exportBtn._clickHandler);
            }
            exportBtn._clickHandler = () => {
                const content = document.getElementById('algorithmSteps');
                const title = document.getElementById('modalTitle').textContent;
                ExportService.exportElementToPdf(content, title, {
                    type: 'algorithm',
                    data: algorithm,
                });
            };
            exportBtn.addEventListener('click', exportBtn._clickHandler);
        }

        let favButtonContainer = headerControlsContainer.querySelector(
            '.fav-btn-placeholder-modal',
        );
        if (!favButtonContainer) {
            favButtonContainer = document.createElement('div');
            favButtonContainer.className = 'fav-btn-placeholder-modal';
            if (editAlgorithmBtnModal) {
                editAlgorithmBtnModal.insertAdjacentElement('beforebegin', favButtonContainer);
            } else if (deleteAlgorithmBtn) {
                deleteAlgorithmBtn.insertAdjacentElement('beforebegin', favButtonContainer);
            } else {
                headerControlsContainer.insertBefore(
                    favButtonContainer,
                    headerControlsContainer.firstChild,
                );
            }
        }

        if (section === 'main' || currentAlgorithmId === 'main') {
            favButtonContainer.innerHTML = '';
            console.log(
                "[showAlgorithmDetail v11] Кнопка 'В избранное' скрыта для главного алгоритма в модальном окне.",
            );
        } else {
            const itemType = 'algorithm';
            const itemId = currentAlgorithmId;
            const itemSection = section;
            const itemTitle = algorithm.title;
            const itemDesc =
                algorithm.steps?.[0]?.description ||
                algorithm.steps?.[0]?.title ||
                algorithm.description ||
                '';
            const isFav = isFavorite ? isFavorite(itemType, itemId) : false;
            if (getFavoriteButtonHTML) {
                favButtonContainer.innerHTML = getFavoriteButtonHTML(
                    itemId,
                    itemType,
                    itemSection,
                    itemTitle,
                    itemDesc,
                    isFav,
                );
                console.log(
                    `[showAlgorithmDetail v11] Кнопка 'В избранное' отображена для алгоритма ID ${itemId} в модальном окне.`,
                );
            }
        }
    } else {
        console.warn(
            '[showAlgorithmDetail v11] Контейнер для кнопок управления в шапке модалки не найден.',
        );
    }

    const isMainAlgorithm = section === 'main';

    try {
        if (!algorithm.steps || !Array.isArray(algorithm.steps)) {
            throw new Error('Данные шагов отсутствуют или некорректны.');
        }

        const stepHtmlPromises = algorithm.steps.map(async (step, index) => {
            if (!step || typeof step !== 'object') {
                console.warn(
                    `[showAlgorithmDetail v11 Step Render Warn] Пропуск невалидного объекта шага на индексе ${index}:`,
                    step,
                );
                return `<div class="algorithm-step bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-3 rounded shadow-sm text-red-700 dark:text-red-300">Ошибка: Некорректные данные для шага ${
                    index + 1
                }.</div>`;
            }

            let additionalInfoTopHTML = '';
            if (step.additionalInfoText && step.additionalInfoShowTop) {
                additionalInfoTopHTML = `
                    <div class="additional-info-top mb-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-300 rounded break-words">
                        ${linkify(step.additionalInfoText)}
                    </div>`;
            }

            let screenshotIconHtml = '';
            let iconContainerHtml = '';
            if (!isMainAlgorithm) {
                const hasSavedScreenshotIds =
                    Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0;
                if (renderScreenshotIcon) {
                    screenshotIconHtml = renderScreenshotIcon(
                        currentAlgorithmId,
                        index,
                        hasSavedScreenshotIds,
                    );
                    if (screenshotIconHtml) {
                        iconContainerHtml = `<div class="inline-block ml-2 align-middle">${screenshotIconHtml}</div>`;
                    }
                }
            }

            const descriptionHtml = `<p class="mt-1 text-base ${
                iconContainerHtml ? 'clear-both' : ''
            } break-words">${linkify(step.description ?? 'Нет описания.')}</p>`;
            let exampleHtml = '';
            if (step.example) {
                exampleHtml = `<div class="example-container mt-2 text-sm prose dark:prose-invert max-w-none break-words">`;
                if (
                    typeof step.example === 'object' &&
                    step.example.type === 'list' &&
                    Array.isArray(step.example.items)
                ) {
                    if (step.example.intro)
                        exampleHtml += `<p class="italic mb-1">${linkify(step.example.intro)}</p>`;
                    exampleHtml += `<ul class="list-disc list-inside pl-5 space-y-0.5">`;
                    step.example.items.forEach(
                        (item) => (exampleHtml += `<li>${linkify(String(item))}</li>`),
                    );
                    exampleHtml += `</ul>`;
                } else if (typeof step.example === 'string') {
                    exampleHtml += `<strong>Пример:</strong><p class="mt-1">${linkify(step.example)}</p>`;
                } else {
                    try {
                        exampleHtml += `<strong>Пример (данные):</strong><pre class="text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded mt-1 overflow-x-auto font-mono whitespace-pre-wrap"><code>${escapeHtml(
                            JSON.stringify(step.example, null, 2),
                        )}</code></pre>`;
                    } catch (e) {
                        exampleHtml += `<div class="text-xs text-red-500 mt-1">[Ошибка формата примера]</div>`;
                    }
                }
                exampleHtml += `</div>`;
            }

            let additionalInfoBottomHTML = '';
            if (step.additionalInfoText && step.additionalInfoShowBottom) {
                additionalInfoBottomHTML = `
                    <div class="additional-info-bottom mt-3 p-2 border-t border-gray-200 dark:border-gray-600 pt-3 text-sm text-gray-700 dark:text-gray-300 rounded bg-gray-50 dark:bg-gray-700/50 break-words">
                       ${linkify(step.additionalInfoText)}
                    </div>`;
            }

            const stepTitle = escapeHtml(step.title ?? `Шаг ${index + 1}`);
            const stepHTML = `
                 <div class="algorithm-step bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-sm border-l-4 border-primary mb-3 relative">
                     ${additionalInfoTopHTML}
                     <h3 class="font-bold text-lg ${
                         iconContainerHtml ? 'inline' : ''
                     }" title="${stepTitle}">${stepTitle}</h3>
                     ${iconContainerHtml}
                     ${descriptionHtml}
                     ${exampleHtml}
                     ${additionalInfoBottomHTML}
                 </div>`;
            return stepHTML;
        });

        const stepsHtmlArray = await Promise.all(stepHtmlPromises);
        algorithmStepsContainer.innerHTML = stepsHtmlArray.join('');

        if (!isMainAlgorithm && handleViewScreenshotClick) {
            const newButtons = algorithmStepsContainer.querySelectorAll('.view-screenshot-btn');
            if (newButtons.length > 0) {
                newButtons.forEach((button) => {
                    button.removeEventListener('click', handleViewScreenshotClick);
                    button.addEventListener('click', handleViewScreenshotClick);
                });
            }
        }
    } catch (error) {
        console.error('[showAlgorithmDetail v11 Step Render Error]', error);
        algorithmStepsContainer.innerHTML = `<p class="text-red-500 p-4 text-center">Ошибка при отображении шагов: ${error.message}</p>`;
    }

    if (openAnimatedModal) {
        openAnimatedModal(algorithmModal);
    } else {
        algorithmModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }
    console.log(`[showAlgorithmDetail v11 Info] Модальное окно #${algorithmModal.id} показано.`);
}
