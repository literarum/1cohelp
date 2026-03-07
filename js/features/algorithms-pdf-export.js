'use strict';

import { getFromIndexedDB, getAllFromIndex } from '../db/indexeddb.js';
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

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) return reject(new Error('Not a Blob'));
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('FileReader failed'));
        r.readAsDataURL(blob);
    });
}

async function buildAlgorithmSectionExport(sectionKey) {
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

    for (let index = 0; index < sectionAlgorithms.length; index++) {
        const algorithm = sectionAlgorithms[index];
        if (!algorithm) continue;

        const algorithmTitle = document.createElement('h2');
        algorithmTitle.className = 'text-lg font-semibold';
        algorithmTitle.textContent = algorithm.title || `Алгоритм ${index + 1}`;
        wrapper.appendChild(algorithmTitle);

        const description =
            algorithm.description ||
            algorithm.steps?.[0]?.description ||
            algorithm.steps?.[0]?.title ||
            '';
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = 'text-sm text-gray-700';
            descEl.innerHTML = linkify(formatMultiline(description));
            wrapper.appendChild(descEl);
        }

        if (Array.isArray(algorithm.steps) && algorithm.steps.length > 0) {
            for (let stepIndex = 0; stepIndex < algorithm.steps.length; stepIndex++) {
                const step = algorithm.steps[stepIndex];
                if (!step) continue;
                const stepCard = document.createElement('div');
                stepCard.className = 'algorithm-step';

                const stepTitleEl = document.createElement('h3');
                stepTitleEl.textContent = step.title || `Шаг ${stepIndex + 1}`;
                stepCard.appendChild(stepTitleEl);

                const descriptionText =
                    typeof step.description === 'string'
                        ? step.description
                        : formatExampleForTextarea(step.description);
                const exampleText = formatExampleForTextarea(step.example);
                const parts = [];
                if (descriptionText) parts.push(descriptionText);
                if (exampleText) parts.push(exampleText);
                if (parts.length > 0) {
                    const body = document.createElement('div');
                    body.textContent = parts.join('\n\n');
                    stepCard.appendChild(body);
                }
                if (step.additionalInfoText) {
                    const caption = document.createElement('div');
                    caption.className = 'pdf-caption';
                    caption.textContent = step.additionalInfoText;
                    stepCard.appendChild(caption);
                }
                let screenshots = [];
                if (Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0) {
                    try {
                        screenshots = (
                            await Promise.all(step.screenshotIds.map((id) => getFromIndexedDB('screenshots', id)))
                        ).filter(Boolean);
                    } catch (_) {}
                }
                if (screenshots.length === 0 && algorithm.id != null) {
                    try {
                        const parentKey = String(algorithm.id);
                        const byParent = await getAllFromIndex('screenshots', 'parentId', parentKey);
                        screenshots = (byParent || []).filter(
                            (s) => s && s.stepIndex === stepIndex && s.parentType === 'algorithm',
                        );
                    } catch (_) {}
                }
                if (screenshots.length > 0) {
                    const container = document.createElement('div');
                    container.className = 'export-pdf-image-container';
                    for (const sc of screenshots) {
                        if (sc.blob instanceof Blob) {
                            try {
                                const dataUrl = await blobToDataUrl(sc.blob);
                                const img = document.createElement('img');
                                img.src = dataUrl;
                                img.alt = '';
                                container.appendChild(img);
                            } catch (_) {}
                        }
                    }
                    if (container.children.length) stepCard.appendChild(container);
                }
                wrapper.appendChild(stepCard);
            }
        }
    }

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
        button._pdfExportHandler = async () => {
            if (!ExportService) {
                showNotification?.('Сервис экспорта PDF недоступен.', 'error');
                return;
            }
            const content = await buildAlgorithmSectionExport(sectionKey);
            if (!content) {
                showNotification?.('В разделе нет алгоритмов для экспорта.', 'warning');
                return;
            }
            const filename = `Алгоритмы_${getSectionName(sectionKey)}`;
            const sectionAlgorithms = algorithms?.[sectionKey] ?? [];
            ExportService.exportElementToPdf(content, filename, {
                type: 'algorithm-section',
                section: sectionKey,
                algorithms: sectionAlgorithms,
            });
        };
        button.addEventListener('click', button._pdfExportHandler);
    });
}

window.initAlgorithmsPdfExportSystem = initAlgorithmsPdfExportSystem;
