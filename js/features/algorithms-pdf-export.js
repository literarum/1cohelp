'use strict';

import { escapeHtml, linkify } from '../utils/html.js';
import { formatExampleForTextarea, getSectionName } from '../utils/helpers.js';

let algorithms = null;
let ExportService = null;
let showNotification = null;

export function setAlgorithmsPdfExportDependencies(deps) {
    algorithms = deps.algorithms;
    ExportService = deps.ExportService;
    showNotification = deps.showNotification;
}

/** Удаляет все HTML-теги (включая самозакрывающиеся вроде <br />), чтобы в PDF не попадал сырой HTML. Переносы строк сохраняются. */
function stripHtmlForPdf(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]*\/?>/g, ' ')
        .replace(/<[^>]*$/g, ' ')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
}

function formatMultiline(text) {
    if (!text) return '';
    const plainText = stripHtmlForPdf(text);
    const escaped = escapeHtml(plainText);
    return escaped.replace(/\n/g, '<br>');
}

function buildAlgorithmSectionExport(sectionKey) {
    const sectionAlgorithms = algorithms?.[sectionKey];
    if (!Array.isArray(sectionAlgorithms) || sectionAlgorithms.length === 0) {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-6';

    const title = document.createElement('h1');
    title.className = 'text-2xl font-bold';
    title.textContent = `Алгоритмы: ${getSectionName(sectionKey)}`;
    wrapper.appendChild(title);

    sectionAlgorithms.forEach((algorithm, index) => {
        if (!algorithm) return;
        const card = document.createElement('div');
        card.className = 'algorithm-step bg-white border border-gray-200 rounded-lg p-4 space-y-3';

        const heading = document.createElement('div');
        heading.className = 'flex items-center gap-2';
        const headingTitle = document.createElement('h2');
        headingTitle.className = 'text-lg font-semibold';
        headingTitle.textContent = algorithm.title || `Алгоритм ${index + 1}`;
        heading.appendChild(headingTitle);
        card.appendChild(heading);

        const description =
            algorithm.description ||
            algorithm.steps?.[0]?.description ||
            algorithm.steps?.[0]?.title ||
            '';
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = 'text-sm text-gray-700';
            descEl.innerHTML = linkify(formatMultiline(description));
            card.appendChild(descEl);
        }

        if (Array.isArray(algorithm.steps) && algorithm.steps.length > 0) {
            const list = document.createElement('ol');
            list.className = 'space-y-3 text-sm';
            algorithm.steps.forEach((step, stepIndex) => {
                if (!step) return;
                const item = document.createElement('li');
                item.className = 'border-l-4 border-primary/60 pl-3 py-2 bg-gray-50 rounded-md';

                const stepTitle = escapeHtml(step.title || `Шаг ${stepIndex + 1}`);
                const descriptionText =
                    typeof step.description === 'string'
                        ? step.description
                        : formatExampleForTextarea(step.description);
                const exampleText = formatExampleForTextarea(step.example);

                let html = `<div class="font-semibold">${stepTitle}</div>`;
                if (descriptionText) {
                    html += `<div class="text-gray-700 mt-1">${formatMultiline(
                        descriptionText,
                    )}</div>`;
                }
                if (step.additionalInfoText) {
                    html += `<div class="text-gray-600 mt-1">${formatMultiline(
                        step.additionalInfoText,
                    )}</div>`;
                }
                if (exampleText) {
                    html += `<div class="text-gray-500 mt-2">${formatMultiline(exampleText)}</div>`;
                }
                // Здесь уже готовая безопасная HTML-разметка; повторный linkify на whole HTML давал артефакты в PDF.
                item.innerHTML = html;
                list.appendChild(item);
            });
            card.appendChild(list);
        }

        wrapper.appendChild(card);
    });

    return wrapper;
}

export function initAlgorithmsPdfExportSystem() {
    const buttons = document.querySelectorAll('[data-algorithm-export]');
    if (!buttons.length) {
        return;
    }

    buttons.forEach((button) => {
        const sectionDomId = button.dataset.algorithmExport;
        if (!sectionDomId) return;

        // data-algorithm-export хранит ID контейнера (например, "programAlgorithms"),
        // а данные алгоритмов лежат в объекте algorithms по ключу секции ("program").
        // Приводим DOM-ID к ключу секции, убирая суффикс "Algorithms".
        const sectionKey = sectionDomId.replace(/Algorithms$/, '') || sectionDomId;
        if (button._pdfExportHandler) {
            button.removeEventListener('click', button._pdfExportHandler);
        }
        button._pdfExportHandler = () => {
            if (!ExportService) {
                showNotification?.('Сервис экспорта PDF недоступен.', 'error');
                return;
            }
            const content = buildAlgorithmSectionExport(sectionKey);
            if (!content) {
                showNotification?.('В разделе нет алгоритмов для экспорта.', 'warning');
                return;
            }
            const filename = `Алгоритмы_${getSectionName(sectionKey)}`;
            ExportService.exportElementToPdf(content, filename, {
                type: 'algorithm-section',
                section: sectionKey,
            });
        };
        button.addEventListener('click', button._pdfExportHandler);
    });
}

window.initAlgorithmsPdfExportSystem = initAlgorithmsPdfExportSystem;
