'use strict';

import { NotificationService } from './notification.js';
import { getFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// СЕРВИС ЭКСПОРТА В PDF
// ============================================================================

// loadingOverlayManager будет импортирован позже или определен глобально
let loadingOverlayManager = null;

export function setLoadingOverlayManager(manager) {
    loadingOverlayManager = manager;
}

export const ExportService = {
    isExporting: false,
    styleElement: null,

    init() {
        if (this.styleElement) return;

        this.styleElement = document.createElement('style');
        this.styleElement.id = 'export-pdf-styles';
        this.styleElement.textContent = `
        @media print {
            .export-to-pdf-content, .export-to-pdf-content * {
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
        }
        body > .export-pdf-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 210mm;
            background-color: #ffffff;
            opacity: 0;
            pointer-events: none;
            z-index: -1;
        }
        .export-to-pdf-content {
            color: #111827;
            background-color: #ffffff;
            font-family: 'Times New Roman', serif;
            padding: 0;
            box-sizing: border-box;
        }
        .export-to-pdf-content .dark, .export-to-pdf-content .dark\\:bg-gray-800 {
             background-color: #ffffff;
        }
        .export-to-pdf-content h1, .export-to-pdf-content h2, .export-to-pdf-content h3, .export-to-pdf-content h4 {
            color: #000000 !important;
            page-break-after: avoid;
        }
        .export-to-pdf-content p, .export-to-pdf-content li, .export-to-pdf-content span, .export-to-pdf-content div {
             color: #111827 !important;
        }
        .export-to-pdf-content a {
            color: #5858da !important;
            text-decoration: underline !important;
        }
        .export-to-pdf-content .algorithm-step, .export-to-pdf-content .reglament-item {
            page-break-inside: avoid;
            border: 1px solid #e5e7eb;
            box-shadow: none;
            background-color: #f9fafb;
        }
        .export-to-pdf-content code, .export-to-pdf-content pre {
             background-color: #f3f4f6 !important;
             border: 1px solid #d1d5db !important;
             color: #1f2937 !important;
        }
        .export-to-pdf-content button,
        .export-to-pdf-content .fav-btn-placeholder-modal-reglament,
        .export-to-pdf-content .toggle-favorite-btn,
        .export-to-pdf-content .view-screenshot-btn,
        .export-to-pdf-content #noInnLink_main_1,
        .export-to-pdf-content .copyable-step-active {
            display: none !important;
        }
        .export-pdf-image-container {
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px dashed #d1d5db;
            page-break-inside: avoid;
        }
        .export-pdf-image-container img {
            max-width: 100%;
            height: auto;
            display: block;
            margin-top: 0.5rem;
            border: 1px solid #d1d5db;
        }
    `;
        document.head.appendChild(this.styleElement);
        console.log('ExportService initialized with print styles (FIXED).');
    },

    async exportElementToPdf(element, filename = 'document', context = {}) {
        if (this.isExporting) {
            NotificationService.add('Экспорт уже выполняется.', 'warning');
            return;
        }
        if (!element) {
            NotificationService.add('Ошибка: элемент для экспорта не найден.', 'error');
            console.error("exportElementToPdf: 'element' is null or undefined.");
            return;
        }
        if (typeof html2pdf === 'undefined') {
            NotificationService.add(
                'Ошибка: Библиотека для экспорта в PDF не загружена.',
                'error',
                { important: true },
            );
            console.error('html2pdf library is not available.');
            return;
        }

        this.isExporting = true;
        if (loadingOverlayManager) {
            loadingOverlayManager.createAndShow();
            loadingOverlayManager.updateProgress(10, 'Подготовка документа к экспорту...');
        }

        const cleanFilename = filename.replace(/[^a-zа-я0-9\s-_]/gi, '').trim() || 'export';
        const finalFilename = `${cleanFilename}.pdf`;

        const container = document.createElement('div');
        container.className = 'export-pdf-container';

        const clone = element.cloneNode(true);
        clone.classList.add('export-to-pdf-content');

        clone.style.maxHeight = 'none';
        clone.style.height = 'auto';
        clone.style.overflow = 'visible';

        try {
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (loadingOverlayManager) {
                loadingOverlayManager.updateProgress(20, 'Обработка изображений...');
            }

            if (context.type === 'algorithm' && context.data && Array.isArray(context.data.steps)) {
                const algorithmData = context.data;
                const stepsInClone = clone.querySelectorAll('.algorithm-step');

                const allImageLoadPromises = [];

                const blobToBase64 = (blob) =>
                    new Promise((resolve, reject) => {
                        if (!blob || !(blob instanceof Blob)) {
                            return reject(new Error('Input is not a valid Blob object.'));
                        }
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () =>
                            reject(new Error('FileReader failed to read the blob.'));
                        reader.readAsDataURL(blob);
                    });

                for (let i = 0; i < algorithmData.steps.length; i++) {
                    const stepData = algorithmData.steps[i];
                    const stepElementInClone = stepsInClone[i];

                    if (
                        stepElementInClone &&
                        Array.isArray(stepData.screenshotIds) &&
                        stepData.screenshotIds.length > 0
                    ) {
                        const screenshotPromises = stepData.screenshotIds.map((id) =>
                            getFromIndexedDB('screenshots', id),
                        );
                        const screenshots = (await Promise.all(screenshotPromises)).filter(Boolean);

                        if (screenshots.length > 0) {
                            const imageContainer = document.createElement('div');
                            imageContainer.className = 'export-pdf-image-container';

                            for (const screenshot of screenshots) {
                                if (screenshot.blob instanceof Blob) {
                                    const imageLoadPromise = new Promise(
                                        async (resolve, reject) => {
                                            try {
                                                const base64Data = await blobToBase64(
                                                    screenshot.blob,
                                                );
                                                const img = document.createElement('img');
                                                img.alt = `Скриншот для шага ${i + 1}`;

                                                img.onload = () => {
                                                    console.log(
                                                        `[PDF Export] Изображение для шага ${i} успешно загружено в DOM.`,
                                                    );
                                                    resolve();
                                                };
                                                img.onerror = () => {
                                                    console.error(
                                                        `[PDF Export] Ошибка загрузки изображения для шага ${i}.`,
                                                    );
                                                    reject(
                                                        new Error(
                                                            `Image loading failed for step ${i}`,
                                                        ),
                                                    );
                                                };

                                                img.src = base64Data;
                                                imageContainer.appendChild(img);
                                            } catch (error) {
                                                console.error(
                                                    `Ошибка конвертации Blob для скриншота ${screenshot.id}:`,
                                                    error,
                                                );
                                                reject(error);
                                            }
                                        },
                                    );
                                    allImageLoadPromises.push(imageLoadPromise);
                                }
                            }
                            stepElementInClone.appendChild(imageContainer);
                        }
                    }
                }

                if (allImageLoadPromises.length > 0) {
                    console.log(
                        `[PDF Export] Ожидание загрузки ${allImageLoadPromises.length} изображений...`,
                    );
                    await Promise.all(allImageLoadPromises);
                    console.log(`[PDF Export] Все изображения успешно загружены.`);
                }
            }

            if (loadingOverlayManager) {
                loadingOverlayManager.updateProgress(50, 'Генерация PDF...');
            }
            document.body.appendChild(container);
            container.appendChild(clone);

            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            console.log('[PDF Export] Render frame has passed, proceeding to generate PDF.');

            const opt = {
                margin: [10, 7, 10, 7],
                filename: finalFilename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    scrollY: 0,
                    backgroundColor: '#ffffff',
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'avoid-all'], before: '.page-break-before' },
            };

            await html2pdf().from(clone).set(opt).save();

            if (loadingOverlayManager) {
                loadingOverlayManager.updateProgress(90, 'Экспорт завершен.');
            }
            NotificationService.add('Документ успешно экспортирован в PDF.', 'success');
        } catch (error) {
            console.error('Ошибка при экспорте в PDF:', error);
            NotificationService.add(
                `Произошла ошибка при экспорте в PDF: ${error.message}`,
                'error',
                { important: true },
            );
        } finally {
            if (document.body.contains(container)) {
                document.body.removeChild(container);
            }
            if (loadingOverlayManager) {
                loadingOverlayManager.updateProgress(100);
                await loadingOverlayManager.hideAndDestroy();
            }
            this.isExporting = false;
        }
    },
};

// Автоинициализация при загрузке модуля
ExportService.init();
