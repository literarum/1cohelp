'use strict';

import { NotificationService } from './notification.js';
import { getFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// СЕРВИС ЭКСПОРТА В PDF (pdf-lib — текст копируемый, без контейнера)
// ============================================================================

let loadingOverlayManager = null;

export function setLoadingOverlayManager(manager) {
    loadingOverlayManager = manager;
}

// A4 в пунктах (1 mm ≈ 2.83465 pt). Стиль в духе Apple: воздух, мягкая типографика, чёткая иерархия.
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_MM = 25;
const MARGIN_PT = MARGIN_MM * 2.83465;
const CONTENT_WIDTH_PT = A4_WIDTH_PT - 2 * MARGIN_PT;
const BODY_FONT_SIZE = 11;
const LINE_HEIGHT_RATIO = 1.5;
const HEADING_SIZES = { 1: 18, 2: 16, 3: 14, 4: 12 };
const BLOCK_SPACING_PT = 6;
const HEADING_BOTTOM_SPACING_PT = 10;
const STEP_INDENT_PT = 12;
const SEPARATOR_LINE_THICKNESS_PT = 0.35;
const SEPARATOR_GAP_PT = 6;
const ALGORITHM_CARD_GAP_PT = 18;
const DESC_FONT_SIZE = 10;
const CAPTION_FONT_SIZE = 9;

const HIDDEN_SELECTORS =
    'button, script, .fav-btn-placeholder-modal-reglament, .toggle-favorite-btn, ' +
    '.view-screenshot-btn, .copyable-step-active, [id="noInnLink_main_1"]';

/**
 * Удаляет HTML-теги из строки и заменяет <br> на перенос строки, чтобы в PDF не попадал сырой HTML.
 * Не трогает символы < > вне тегов (например "a < b" остаётся как есть для последовательностей не как тег).
 * @param {string} text
 * @returns {string}
 */
function sanitizeTextForPdf(text) {
    if (!text || typeof text !== 'string') return '';
    let s = String(text)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
    return s;
}

/**
 * Извлекает из DOM плоский список блоков для PDF: заголовки, параграфы, списки, шаги (с изображениями).
 * @param {Element} root
 * @returns {{ type: string, level?: number, text: string, images?: string[] }[]}
 */
function extractPdfContent(root) {
    const blocks = [];
    if (!root || !root.querySelector) return blocks;

    const hiddenSet = new Set();
    root.querySelectorAll(HIDDEN_SELECTORS).forEach((el) => hiddenSet.add(el));

    function walk(el) {
        if (!el || hiddenSet.has(el)) return;
        if (el.nodeType !== Node.ELEMENT_NODE) return;

        const tag = el.tagName.toLowerCase();
        const isStep = el.classList?.contains('algorithm-step') || el.classList?.contains('reglament-item');

        if (isStep) {
            const fullText = (el.innerText || '').trim();
            const imgs = Array.from(el.querySelectorAll('img'))
                .map((img) => img.src)
                .filter((src) => src && (src.startsWith('data:') || src.startsWith('http')));
            const stepHeading = el.querySelector('h2, h3, h4');
            const headingText = stepHeading?.textContent?.trim();
            if (headingText && fullText) {
                const restText = fullText.startsWith(headingText)
                    ? fullText.slice(headingText.length).trim()
                    : fullText;
                const headingLevel = stepHeading.tagName.toLowerCase() === 'h2' ? 2 : 4;
                blocks.push({ type: 'heading', level: headingLevel, text: headingText });
                if (restText || (imgs && imgs.length > 0)) {
                    blocks.push({ type: 'block', text: restText || '', images: imgs.length ? imgs : undefined });
                }
            } else {
                blocks.push({ type: 'block', text: fullText, images: imgs.length ? imgs : undefined });
            }
            return;
        }

        if (el.classList?.contains('pdf-caption')) {
            const text = (el.textContent || '').trim();
            if (text) blocks.push({ type: 'caption', text });
            return;
        }

        if (['h1', 'h2', 'h3', 'h4'].includes(tag) && !el.closest('.algorithm-step, .reglament-item')) {
            const level = parseInt(tag.charAt(1), 10);
            const text = (el.textContent || '').trim();
            if (text) blocks.push({ type: 'heading', level, text });
            return;
        }

        if ((tag === 'p' || tag === 'pre') && !el.closest('.algorithm-step, .reglament-item')) {
            const text = (el.textContent || '').trim();
            if (!text) return;
            if (tag === 'pre' && (text.includes('\n\n') || /Шаг\s*\d+[\s:]/i.test(text))) {
                const segments = text.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
                for (let segIndex = 0; segIndex < segments.length; segIndex++) {
                    const seg = segments[segIndex];
                    const lines = seg.split('\n').map((s) => s.trim()).filter(Boolean);
                    const firstLine = lines[0] || '';
                    const restLines = lines.slice(1);
                    const rest = restLines.join('\n').trim();
                    const isSingleLine = restLines.length === 0;
                    const looksLikeList = /^[\s•\-*]\s/.test(firstLine) || /^\d+[.)]\s/.test(firstLine);
                    const firstShort =
                        !looksLikeList && firstLine.length <= (segIndex === 0 ? 100 : 90);
                    if (/^Шаг\s*\d+[\s:]/i.test(firstLine)) {
                        blocks.push({ type: 'heading', level: 4, text: firstLine });
                        if (rest) blocks.push({ type: 'paragraph', text: rest });
                    } else if (isSingleLine && firstShort) {
                        blocks.push({ type: 'heading', level: segIndex === 0 ? 2 : 3, text: firstLine });
                    } else if (
                        firstShort &&
                        restLines.length === 1 &&
                        restLines[0].length <= 90 &&
                        !/^[\s•\-*]\s/.test(restLines[0]) &&
                        !/^\d+[.)]\s/.test(restLines[0])
                    ) {
                        blocks.push({ type: 'heading', level: segIndex === 0 ? 2 : 3, text: firstLine });
                        blocks.push({ type: 'heading', level: 3, text: restLines[0] });
                    } else if (firstShort && rest) {
                        blocks.push({ type: 'heading', level: segIndex === 0 ? 2 : 3, text: firstLine });
                        blocks.push({ type: 'paragraph', text: rest });
                    } else {
                        blocks.push({ type: 'paragraph', text: seg });
                    }
                }
            } else {
                blocks.push({ type: 'paragraph', text });
            }
            return;
        }

        if (tag === 'li') {
            const text = (el.textContent || '').trim();
            if (text) blocks.push({ type: 'list', text });
            return;
        }

        for (let i = 0; i < el.children.length; i++) {
            walk(el.children[i]);
        }
    }

    walk(root);
    return blocks;
}

/**
 * Разбивает текст на строки по maxWidth (в пунктах) с учётом ширины шрифта.
 * @param {string} text
 * @param {object} font - pdf-lib PDFFont
 * @param {number} fontSize
 * @param {number} maxWidthPt
 * @returns {string[]}
 */
function wrapText(text, font, fontSize, maxWidthPt) {
    if (!text || !font) return [];
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const candidate = current ? current + ' ' + word : word;
        const w = font.widthOfTextAtSize(candidate, fontSize);
        if (w <= maxWidthPt) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            const wordW = font.widthOfTextAtSize(word, fontSize);
            if (wordW <= maxWidthPt) {
                current = word;
            } else {
                let rest = word;
                while (rest) {
                    let chunk = '';
                    for (let j = 0; j < rest.length; j++) {
                        const c = chunk + rest[j];
                        if (font.widthOfTextAtSize(c, fontSize) <= maxWidthPt) chunk = c;
                        else break;
                    }
                    if (chunk) {
                        lines.push(chunk);
                        rest = rest.slice(chunk.length);
                    } else {
                        lines.push(rest);
                        rest = '';
                    }
                }
                current = '';
            }
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * Строит PDF из блоков контента: реальный текст (копируемый), без визуального контейнера.
 * @param {object} contentBlocks - массив из extractPdfContent
 * @param {object} opts - { fontBytes: ArrayBuffer, getImageBytes?, isJpg? }
 * @returns {Promise<Uint8Array>}
 */
async function buildPdfFromContent(contentBlocks, opts) {
    const PDFLib = typeof window !== 'undefined' ? window.PDFLib : null;
    const fontkit = typeof window !== 'undefined' ? window.fontkit : null;
    if (!PDFLib || !fontkit) {
        throw new Error('pdf-lib или fontkit не загружены');
    }

    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    let font;
    try {
        font = await pdfDoc.embedFont(opts.fontBytes);
    } catch (embedErr) {
        throw new Error(
            'Шрифт PT Serif не удалось встроить в PDF. Откройте приложение с веб-сервера (не через file://).',
        );
    }
    const rgb = PDFLib.rgb || PDFLib.RGB || ((r, g, b) => ({ type: 'RGB', red: r, green: g, blue: b }));

    let page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    let y = A4_HEIGHT_PT - MARGIN_PT;
    const bottomLimit = MARGIN_PT;
    const maxWidthPt = CONTENT_WIDTH_PT;

    function ensureSpace(neededPt) {
        if (y - neededPt < bottomLimit) {
            page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
            y = A4_HEIGHT_PT - MARGIN_PT;
        }
    }

    const blocks = contentBlocks.length ? contentBlocks : [{ type: 'paragraph', text: 'Нет контента для экспорта.' }];

    let prevBlock = null;

    for (const block of blocks) {
        if (block.type === 'heading') {
            if (block.level === 2 && prevBlock !== null) {
                y -= ALGORITHM_CARD_GAP_PT;
            }
            const text = sanitizeTextForPdf(block.text);
            const fontSize = HEADING_SIZES[block.level] || 16;
            const lineHeight = fontSize * LINE_HEIGHT_RATIO;
            const lines = wrapText(text, font, fontSize, maxWidthPt);
            const headingBlockHeight =
                lines.length * lineHeight +
                HEADING_BOTTOM_SPACING_PT +
                SEPARATOR_LINE_THICKNESS_PT +
                SEPARATOR_GAP_PT;
            ensureSpace(headingBlockHeight);
            for (const line of lines) {
                page.drawText(line, {
                    x: MARGIN_PT,
                    y: y - fontSize,
                    size: fontSize,
                    font,
                    color: rgb(0.08, 0.08, 0.1),
                });
                y -= fontSize * LINE_HEIGHT_RATIO;
            }
            y -= HEADING_BOTTOM_SPACING_PT;
            const lineY = y;
            page.drawLine({
                start: { x: MARGIN_PT, y: lineY },
                end: { x: MARGIN_PT + CONTENT_WIDTH_PT, y: lineY },
                thickness: SEPARATOR_LINE_THICKNESS_PT,
                color: rgb(0.18, 0.18, 0.22),
            });
            y = lineY - SEPARATOR_GAP_PT;
            prevBlock = block;
            continue;
        }

        if (block.type === 'paragraph' || block.type === 'list') {
            const isDescription =
                block.type === 'paragraph' &&
                prevBlock?.type === 'heading' &&
                prevBlock?.level === 2;
            const fontSize = isDescription ? DESC_FONT_SIZE : BODY_FONT_SIZE;
            const textColor = isDescription ? rgb(0.35, 0.35, 0.4) : rgb(0.18, 0.18, 0.22);
            const indent = block.type === 'list' ? STEP_INDENT_PT : 0;
            const raw = sanitizeTextForPdf(block.text);
            const segments = raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
            const lines = [];
            for (const seg of segments) {
                const text = block.type === 'list' ? '• ' + seg : seg;
                lines.push(...wrapText(text, font, fontSize, maxWidthPt - indent));
            }
            const lineHeight = fontSize * LINE_HEIGHT_RATIO;
            ensureSpace(lines.length * lineHeight + BLOCK_SPACING_PT);
            for (const line of lines) {
                page.drawText(line, {
                    x: MARGIN_PT + indent,
                    y: y - fontSize,
                    size: fontSize,
                    font,
                    color: textColor,
                });
                y -= lineHeight;
            }
            y -= BLOCK_SPACING_PT;
            prevBlock = block;
            continue;
        }

        if (block.type === 'caption') {
            const raw = sanitizeTextForPdf(block.text);
            const lines = wrapText(raw, font, CAPTION_FONT_SIZE, maxWidthPt - STEP_INDENT_PT);
            const lineHeight = CAPTION_FONT_SIZE * LINE_HEIGHT_RATIO;
            ensureSpace(lines.length * lineHeight + BLOCK_SPACING_PT * 0.5);
            for (const line of lines) {
                page.drawText(line, {
                    x: MARGIN_PT + STEP_INDENT_PT,
                    y: y - CAPTION_FONT_SIZE,
                    size: CAPTION_FONT_SIZE,
                    font,
                    color: rgb(0.45, 0.45, 0.5),
                });
                y -= lineHeight;
            }
            y -= BLOCK_SPACING_PT * 0.5;
            prevBlock = block;
            continue;
        }

        if (block.type === 'block') {
            const blockText = sanitizeTextForPdf(block.text);
            if (blockText) {
                const segments = blockText.split(/\n/).map((s) => s.trim()).filter(Boolean);
                const lines = [];
                for (const seg of segments) lines.push(...wrapText(seg, font, BODY_FONT_SIZE, maxWidthPt - STEP_INDENT_PT));
                const lineHeight = BODY_FONT_SIZE * LINE_HEIGHT_RATIO;
                ensureSpace(lines.length * lineHeight + BLOCK_SPACING_PT);
                for (const line of lines) {
                    page.drawText(line, {
                        x: MARGIN_PT + STEP_INDENT_PT,
                        y: y - BODY_FONT_SIZE,
                        size: BODY_FONT_SIZE,
                        font,
                        color: rgb(0.18, 0.18, 0.22),
                    });
                    y -= lineHeight;
                }
                y -= BLOCK_SPACING_PT;
            }
            if (block.images && block.images.length && opts.getImageBytes) {
                for (const dataUrl of block.images) {
                    try {
                        const bytes = await opts.getImageBytes(dataUrl);
                        if (!bytes || bytes.length === 0) continue;
                        const isJpg = opts.isJpg ? opts.isJpg(dataUrl) : /^data:image\/jpe?g/i.test(dataUrl);
                        const img = isJpg
                            ? await pdfDoc.embedJpg(bytes)
                            : await pdfDoc.embedPng(bytes);
                        const dims = img.scale(1);
                        const maxImgWidth = CONTENT_WIDTH_PT;
                        const scale = dims.width > maxImgWidth ? maxImgWidth / dims.width : 1;
                        const drawWidth = dims.width * scale;
                        const drawHeight = dims.height * scale;
                        ensureSpace(drawHeight + BLOCK_SPACING_PT);
                        page.drawImage(img, {
                            x: MARGIN_PT,
                            y: y - drawHeight,
                            width: drawWidth,
                            height: drawHeight,
                        });
                        y -= drawHeight + BLOCK_SPACING_PT;
                    } catch (e) {
                        console.warn('[PDF Export] Не удалось встроить изображение:', e);
                    }
                }
            }
            prevBlock = block;
        }
    }

    return pdfDoc.save();
}

const FONT_FILENAME = 'PT_Serif-Web-Regular.ttf';

/**
 * Загружает байты шрифта для pdf-lib (кириллица). Пробует путь относительно модуля, затем относительно документа.
 */
async function loadPdfFontBytes() {
    const candidates = [];
    if (typeof window !== 'undefined' && (document.baseURI || window.location.href)) {
        try {
            const base = document.baseURI || window.location.href;
            candidates.push(new URL('fonts/' + FONT_FILENAME, base).href);
        } catch (_) {}
    }
    try {
        candidates.push(new URL('../../fonts/' + FONT_FILENAME, import.meta.url).href);
    } catch (_) {}
    if (typeof window !== 'undefined' && window.location) {
        const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
        candidates.push(base + '/fonts/' + FONT_FILENAME);
        candidates.push(base + '/site/fonts/' + FONT_FILENAME);
    }
    for (const fontUrl of candidates) {
        try {
            const res = await fetch(fontUrl);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            if (buf && buf.byteLength > 0) {
                console.log('[PDF Export] Шрифт PT Serif загружен:', fontUrl);
                return buf;
            }
        } catch (e) {
            continue;
        }
    }
    console.error('[PDF Export] Ошибка загрузки шрифта: ни один URL не сработал.', candidates);
    return null;
}

let cachedFontBytes = null;

export const ExportService = {
    isExporting: false,
    styleElement: null,

    init() {
        if (this.styleElement) return;
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'export-pdf-styles';
        this.styleElement.textContent = '';
        document.head.appendChild(this.styleElement);
    },

    async exportElementToPdf(element, filename = 'document', context = {}) {
        if (this.isExporting) {
            NotificationService.add('Экспорт уже выполняется.', 'warning');
            return;
        }
        if (!element) {
            NotificationService.add('Ошибка: элемент для экспорта не найден.', 'error');
            return;
        }

        const PDFLib = typeof window !== 'undefined' ? window.PDFLib : null;
        const fontkit = typeof window !== 'undefined' ? window.fontkit : null;
        if (!PDFLib) {
            NotificationService.add('Библиотека PDF (pdf-lib) не загружена.', 'error', { important: true });
            return;
        }
        if (!fontkit) {
            NotificationService.add('Модуль fontkit для PDF не загружен.', 'error', { important: true });
            return;
        }

        this.isExporting = true;
        if (loadingOverlayManager) {
            loadingOverlayManager.createAndShow();
            loadingOverlayManager.updateProgress(10, 'Подготовка документа...');
        }

        const cleanFilename = filename.replace(/[^a-zа-я0-9\s-_]/gi, '').trim() || 'export';
        const finalFilename = `${cleanFilename}.pdf`;

        const clone = element.cloneNode(true);
        clone.querySelectorAll?.('button, script, .fav-btn-placeholder-modal-reglament, .toggle-favorite-btn, .view-screenshot-btn, .copyable-step-active').forEach((el) => el.remove());

        try {
            if (loadingOverlayManager) loadingOverlayManager.updateProgress(20, 'Обработка контента...');

            const blobToDataUrl = (blob) =>
                new Promise((resolve, reject) => {
                    if (!(blob instanceof Blob)) return reject(new Error('Not a Blob'));
                    const r = new FileReader();
                    r.onload = () => resolve(r.result);
                    r.onerror = () => reject(new Error('FileReader failed'));
                    r.readAsDataURL(blob);
                });

            if (context.type === 'algorithm' && context.data && Array.isArray(context.data.steps)) {
                const stepsInClone = clone.querySelectorAll('.algorithm-step');
                for (let i = 0; i < context.data.steps.length; i++) {
                    const step = context.data.steps[i];
                    const stepEl = stepsInClone[i];
                    if (!stepEl || !Array.isArray(step.screenshotIds) || step.screenshotIds.length === 0) continue;
                    const screenshots = (await Promise.all(step.screenshotIds.map((id) => getFromIndexedDB('screenshots', id)))).filter(Boolean);
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
                    if (container.children.length) stepEl.appendChild(container);
                }
            } else if (
                context.type === 'algorithm-section' &&
                Array.isArray(context.algorithms) &&
                context.algorithms.length > 0
            ) {
                const stepsInClone = clone.querySelectorAll('.algorithm-step');
                const stepsFlat = context.algorithms.flatMap((algo) =>
                    (algo.steps || []).map((step, stepIndex) => ({ algo, step, stepIndex })),
                );
                for (let k = 0; k < stepsFlat.length && k < stepsInClone.length; k++) {
                    const { step } = stepsFlat[k];
                    const stepEl = stepsInClone[k];
                    if (!stepEl || stepEl.querySelector('.export-pdf-image-container img')) continue;
                    const screenshotIds = Array.isArray(step.screenshotIds) ? step.screenshotIds : [];
                    const screenshots =
                        screenshotIds.length > 0
                            ? (
                                  await Promise.all(
                                      screenshotIds.map((id) => getFromIndexedDB('screenshots', id)),
                                  )
                              ).filter(Boolean)
                            : [];
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
                    if (container.children.length) stepEl.appendChild(container);
                }
            }

            const contentBlocks = extractPdfContent(clone);
            if (loadingOverlayManager) loadingOverlayManager.updateProgress(40, 'Загрузка шрифта...');

            let fontBytes = cachedFontBytes;
            if (!fontBytes) {
                fontBytes = await loadPdfFontBytes();
                if (fontBytes) cachedFontBytes = fontBytes;
            }
            if (!fontBytes) {
                const isFileProtocol =
                    typeof window !== 'undefined' &&
                    (window.location?.protocol === 'file:' || document.baseURI?.startsWith('file:'));
                const msg = isFileProtocol
                    ? 'Шрифт для PDF не загружается при открытии через file://. Запустите приложение с веб-сервера: в папке site выполните «npx serve .» или «python -m http.server 8080» и откройте в браузере http://localhost:8080'
                    : 'Не удалось загрузить шрифт для PDF. Проверьте, что в папке site есть папка fonts с файлом PT_Serif-Web-Regular.ttf.';
                NotificationService.add(msg, 'error', { important: true, duration: 12000 });
                this.isExporting = false;
                if (loadingOverlayManager) await loadingOverlayManager.hideAndDestroy();
                return;
            }

            if (loadingOverlayManager) loadingOverlayManager.updateProgress(50, 'Генерация PDF...');

            if (!(fontBytes instanceof ArrayBuffer) || fontBytes.byteLength < 1000) {
                NotificationService.add(
                    'Ошибка: данные шрифта для PDF некорректны. Запустите приложение с веб-сервера (не file://).',
                    'error',
                    { important: true },
                );
                this.isExporting = false;
                if (loadingOverlayManager) await loadingOverlayManager.hideAndDestroy();
                return;
            }

            const getImageBytes = (dataUrl) => {
                if (!dataUrl || !dataUrl.startsWith('data:')) return Promise.resolve(null);
                const base64 = dataUrl.split(',')[1];
                if (!base64) return Promise.resolve(null);
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return Promise.resolve(bytes);
            };
            const isJpg = (dataUrl) => /^data:image\/jpe?g/i.test(dataUrl);

            const pdfBytes = await buildPdfFromContent(contentBlocks, {
                fontBytes,
                getImageBytes,
                isJpg,
            });

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            a.click();
            URL.revokeObjectURL(url);

            if (loadingOverlayManager) loadingOverlayManager.updateProgress(90, 'Готово.');
            NotificationService.add('Документ успешно экспортирован в PDF.', 'success');
        } catch (error) {
            console.error('Ошибка при экспорте в PDF:', error);
            NotificationService.add(
                `Ошибка при экспорте в PDF: ${error?.message || String(error)}`,
                'error',
                { important: true },
            );
        } finally {
            if (loadingOverlayManager) {
                loadingOverlayManager.updateProgress(100);
                await loadingOverlayManager.hideAndDestroy();
            }
            this.isExporting = false;
        }
    },
};

ExportService.init();
