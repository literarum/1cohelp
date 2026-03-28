'use strict';

import { NotificationService } from './notification.js';
import { getFromIndexedDB, getAllFromIndex, getAllFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// СЕРВИС ЭКСПОРТА В PDF (pdf-lib — текст копируемый, без контейнера)
// ============================================================================

/** Включить детальное логирование экспорта в PDF (источники скриншотов, дедуп, слияние блоков). */
const PDF_EXPORT_DEBUG = true;

let loadingOverlayManager = null;

export function setLoadingOverlayManager(manager) {
    loadingOverlayManager = manager;
}

// A4 в пунктах (1 mm ≈ 2.83465 pt). Стиль в духе Apple: воздух, мягкая типографика, чёткая иерархия.
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_MM = 25;
const MARGIN_PT = MARGIN_MM * 2.83465;
const _CONTENT_WIDTH_PT = A4_WIDTH_PT - 2 * MARGIN_PT;
const BODY_FONT_SIZE = 11;
const LINE_HEIGHT_RATIO = 1.5;
const HEADING_SIZES = { 1: 18, 2: 16, 3: 14, 4: 12 };
/** Размер и отступ заголовка-названия при экспорте одного алгоритма в PDF. */
const SINGLE_ALGORITHM_TITLE_FONT_SIZE = 20;
const SINGLE_ALGORITHM_TITLE_BOTTOM_SPACING_PT = 14;
const BLOCK_SPACING_PT = 8;
const HEADING_BOTTOM_SPACING_PT = 12;
const STEP_INDENT_PT = 12;
const SEPARATOR_LINE_THICKNESS_PT = 0.35;
const SEPARATOR_GAP_PT = 6;
const ALGORITHM_CARD_GAP_PT = 20;
const DESC_FONT_SIZE = 10;
const CAPTION_FONT_SIZE = 9;

// Режим «все алгоритмы»: явное разделение алгоритмов (увеличенные отступы между ними), читаемые шаги.
const ALGORITHM_SECTION_MARGIN_MM = 18;
const ALGORITHM_SECTION_BLOCK_SPACING_PT = 6;
const ALGORITHM_SECTION_STEP_GAP_PT = 4;
/** Отступ между алгоритмами при пачечной выгрузке — чтобы не сливались в одно полотно. */
const ALGORITHM_BREAK_GAP_PT = 38;
const ALGORITHM_SEPARATOR_THICKNESS_PT = 1.4;
/** Высота полосы-разделителя между алгоритмами. */
const ALGORITHM_BAND_HEIGHT_PT = 18;
/** Отступ после полосы перед заголовком следующего алгоритма. */
const ALGORITHM_BAND_AFTER_GAP_PT = 10;
const ALGORITHM_BAND_GRAY = 0.94;
const STEP_SEPARATOR_THICKNESS_PT = 0.4;
const STEP_SEPARATOR_GAP_PT = 5;
const MAX_IMAGE_HEIGHT_RATIO = 0.52;

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
export function extractPdfContent(root) {
    const blocks = [];
    if (!root || !root.querySelector) return blocks;

    const hiddenSet = new Set();
    root.querySelectorAll(HIDDEN_SELECTORS).forEach((el) => hiddenSet.add(el));

    function walk(el) {
        if (!el || hiddenSet.has(el)) return;
        if (el.nodeType !== Node.ELEMENT_NODE) return;

        const tag = el.tagName.toLowerCase();
        const isStep =
            el.classList?.contains('algorithm-step') || el.classList?.contains('reglament-item');

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
                    blocks.push({
                        type: 'block',
                        text: restText || '',
                        images: imgs.length ? imgs : undefined,
                    });
                }
            } else {
                blocks.push({
                    type: 'block',
                    text: fullText,
                    images: imgs.length ? imgs : undefined,
                });
            }
            return;
        }

        if (el.classList?.contains('pdf-caption')) {
            const text = (el.textContent || '').trim();
            if (text) blocks.push({ type: 'caption', text });
            return;
        }

        // Скриншоты вне шагов алгоритма (например экспорт закладки): контейнер с <img data:...>.
        // Раньше walk заходил в <img> без обработчика — изображения не попадали в PDF.
        if (
            el.classList?.contains('export-pdf-image-container') &&
            !el.closest('.algorithm-step, .reglament-item')
        ) {
            const imgs = Array.from(el.querySelectorAll('img'))
                .map((img) => img.src)
                .filter((src) => src && (src.startsWith('data:') || src.startsWith('http')));
            if (imgs.length) {
                blocks.push({ type: 'block', text: '', images: imgs });
            }
            return;
        }

        if (
            ['h1', 'h2', 'h3', 'h4'].includes(tag) &&
            !el.closest('.algorithm-step, .reglament-item')
        ) {
            const level = parseInt(tag.charAt(1), 10);
            const text = (el.textContent || '').trim();
            if (text) blocks.push({ type: 'heading', level, text });
            return;
        }

        if ((tag === 'p' || tag === 'pre') && !el.closest('.algorithm-step, .reglament-item')) {
            const text = (el.textContent || '').trim();
            if (!text) return;
            if (tag === 'pre' && (text.includes('\n\n') || /Шаг\s*\d+[\s:]/i.test(text))) {
                const segments = text
                    .split(/\n\n+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                for (let segIndex = 0; segIndex < segments.length; segIndex++) {
                    const seg = segments[segIndex];
                    const lines = seg
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean);
                    const firstLine = lines[0] || '';
                    const restLines = lines.slice(1);
                    const rest = restLines.join('\n').trim();
                    const isSingleLine = restLines.length === 0;
                    const looksLikeList =
                        /^[\s•\-*]\s/.test(firstLine) || /^\d+[.)]\s/.test(firstLine);
                    const firstShort =
                        !looksLikeList && firstLine.length <= (segIndex === 0 ? 100 : 90);
                    if (/^Шаг\s*\d+[\s:]/i.test(firstLine)) {
                        blocks.push({ type: 'heading', level: 4, text: firstLine });
                        if (rest) blocks.push({ type: 'paragraph', text: rest });
                    } else if (isSingleLine && firstShort) {
                        blocks.push({
                            type: 'heading',
                            level: segIndex === 0 ? 2 : 3,
                            text: firstLine,
                        });
                    } else if (
                        firstShort &&
                        restLines.length === 1 &&
                        restLines[0].length <= 90 &&
                        !/^[\s•\-*]\s/.test(restLines[0]) &&
                        !/^\d+[.)]\s/.test(restLines[0])
                    ) {
                        blocks.push({
                            type: 'heading',
                            level: segIndex === 0 ? 2 : 3,
                            text: firstLine,
                        });
                        blocks.push({ type: 'heading', level: 3, text: restLines[0] });
                    } else if (firstShort && rest) {
                        blocks.push({
                            type: 'heading',
                            level: segIndex === 0 ? 2 : 3,
                            text: firstLine,
                        });
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
 * Конвертирует data URL в PNG, если формат не JPEG и не PNG (pdf-lib поддерживает только их).
 * @param {string} dataUrl
 * @returns {Promise<string>} data URL (image/png или image/jpeg без изменений)
 */
function dataUrlToPngIfNeeded(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return Promise.resolve(dataUrl);
    const mimeMatch = dataUrl.match(/^data:(image\/[^;]+)/i);
    const mime = mimeMatch ? mimeMatch[1].toLowerCase() : '';
    if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') {
        return Promise.resolve(dataUrl);
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas 2d context unavailable'));
                    return;
                }
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
    });
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

    const isAlgorithmSection = Boolean(opts.isAlgorithmSection);
    const marginPt = isAlgorithmSection ? ALGORITHM_SECTION_MARGIN_MM * 2.83465 : MARGIN_PT;
    const contentWidthPt = A4_WIDTH_PT - 2 * marginPt;
    const bottomLimit = marginPt;
    const blockSpacingPt = isAlgorithmSection
        ? ALGORITHM_SECTION_BLOCK_SPACING_PT
        : BLOCK_SPACING_PT;
    const maxImageHeightPt = isAlgorithmSection
        ? A4_HEIGHT_PT * MAX_IMAGE_HEIGHT_RATIO
        : A4_HEIGHT_PT;

    const pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    let font;
    try {
        font = await pdfDoc.embedFont(opts.fontBytes);
    } catch {
        throw new Error(
            'Шрифт PT Serif не удалось встроить в PDF. Откройте приложение с веб-сервера (не через file://).',
        );
    }
    const rgb =
        PDFLib.rgb || PDFLib.RGB || ((r, g, b) => ({ type: 'RGB', red: r, green: g, blue: b }));

    let page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    let y = A4_HEIGHT_PT - marginPt;

    function ensureSpace(neededPt) {
        if (y - neededPt < bottomLimit) {
            page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
            y = A4_HEIGHT_PT - marginPt;
        }
    }

    const blocks = contentBlocks.length
        ? contentBlocks
        : [{ type: 'paragraph', text: 'Нет контента для экспорта.' }];

    let prevBlock = null;

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex];
        if (block.type === 'heading') {
            if (block.level === 2 && prevBlock !== null) {
                const gapPt = isAlgorithmSection ? ALGORITHM_BREAK_GAP_PT : ALGORITHM_CARD_GAP_PT;
                y -= gapPt;
                if (isAlgorithmSection) {
                    ensureSpace(
                        ALGORITHM_BAND_HEIGHT_PT +
                            ALGORITHM_SEPARATOR_THICKNESS_PT +
                            SEPARATOR_GAP_PT +
                            30,
                    );
                    const _bandTop = y;
                    const bandBottom = y - ALGORITHM_BAND_HEIGHT_PT;
                    page.drawRectangle({
                        x: marginPt,
                        y: bandBottom,
                        width: contentWidthPt,
                        height: ALGORITHM_BAND_HEIGHT_PT,
                        color: rgb(ALGORITHM_BAND_GRAY, ALGORITHM_BAND_GRAY, ALGORITHM_BAND_GRAY),
                    });
                    y = bandBottom;
                    page.drawLine({
                        start: { x: marginPt, y },
                        end: { x: marginPt + contentWidthPt, y },
                        thickness: ALGORITHM_SEPARATOR_THICKNESS_PT,
                        color: rgb(0.25, 0.25, 0.3),
                    });
                    y -= SEPARATOR_GAP_PT + ALGORITHM_BAND_AFTER_GAP_PT;
                }
            }
            const text = sanitizeTextForPdf(block.text);
            const fontSize =
                block.level === 1
                    ? SINGLE_ALGORITHM_TITLE_FONT_SIZE
                    : HEADING_SIZES[block.level] || 16;
            const lineHeight = fontSize * LINE_HEIGHT_RATIO;
            const lines = wrapText(text, font, fontSize, contentWidthPt);
            const bottomSpacing =
                block.level === 1
                    ? SINGLE_ALGORITHM_TITLE_BOTTOM_SPACING_PT
                    : HEADING_BOTTOM_SPACING_PT;
            const sepThickness =
                block.level === 4 && isAlgorithmSection
                    ? STEP_SEPARATOR_THICKNESS_PT
                    : SEPARATOR_LINE_THICKNESS_PT;
            const headingBlockHeight =
                lines.length * lineHeight + bottomSpacing + sepThickness + SEPARATOR_GAP_PT;
            ensureSpace(headingBlockHeight);
            for (const line of lines) {
                page.drawText(line, {
                    x: marginPt,
                    y: y - fontSize,
                    size: fontSize,
                    font,
                    color: rgb(0.08, 0.08, 0.1),
                });
                y -= fontSize * LINE_HEIGHT_RATIO;
            }
            y -= bottomSpacing;
            const lineY = y;
            page.drawLine({
                start: { x: marginPt, y: lineY },
                end: { x: marginPt + contentWidthPt, y: lineY },
                thickness: sepThickness,
                color:
                    block.level === 4 && isAlgorithmSection
                        ? rgb(0.35, 0.35, 0.4)
                        : rgb(0.18, 0.18, 0.22),
            });
            y =
                lineY -
                (block.level === 4 && isAlgorithmSection
                    ? STEP_SEPARATOR_GAP_PT
                    : SEPARATOR_GAP_PT);
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
            const segments = raw
                .split(/\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            const lines = [];
            for (const seg of segments) {
                const text = block.type === 'list' ? '• ' + seg : seg;
                lines.push(...wrapText(text, font, fontSize, contentWidthPt - indent));
            }
            const lineHeight = fontSize * LINE_HEIGHT_RATIO;
            ensureSpace(lines.length * lineHeight + blockSpacingPt);
            for (const line of lines) {
                page.drawText(line, {
                    x: marginPt + indent,
                    y: y - fontSize,
                    size: fontSize,
                    font,
                    color: textColor,
                });
                y -= lineHeight;
            }
            y -= blockSpacingPt;
            prevBlock = block;
            continue;
        }

        if (block.type === 'caption') {
            const raw = sanitizeTextForPdf(block.text);
            const lines = wrapText(raw, font, CAPTION_FONT_SIZE, contentWidthPt - STEP_INDENT_PT);
            const lineHeight = CAPTION_FONT_SIZE * LINE_HEIGHT_RATIO;
            ensureSpace(lines.length * lineHeight + blockSpacingPt * 0.5);
            for (const line of lines) {
                page.drawText(line, {
                    x: marginPt + STEP_INDENT_PT,
                    y: y - CAPTION_FONT_SIZE,
                    size: CAPTION_FONT_SIZE,
                    font,
                    color: rgb(0.45, 0.45, 0.5),
                });
                y -= lineHeight;
            }
            y -= blockSpacingPt * 0.5;
            prevBlock = block;
            continue;
        }

        if (block.type === 'block') {
            const blockText = sanitizeTextForPdf(block.text);
            if (blockText) {
                const segments = blockText
                    .split(/\n/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                const lines = [];
                for (const seg of segments)
                    lines.push(
                        ...wrapText(seg, font, BODY_FONT_SIZE, contentWidthPt - STEP_INDENT_PT),
                    );
                const lineHeight = BODY_FONT_SIZE * LINE_HEIGHT_RATIO;
                ensureSpace(lines.length * lineHeight + blockSpacingPt);
                for (const line of lines) {
                    page.drawText(line, {
                        x: marginPt + STEP_INDENT_PT,
                        y: y - BODY_FONT_SIZE,
                        size: BODY_FONT_SIZE,
                        font,
                        color: rgb(0.18, 0.18, 0.22),
                    });
                    y -= lineHeight;
                }
                y -= blockSpacingPt;
            }
            if (block.images && block.images.length && opts.getImageBytes) {
                if (PDF_EXPORT_DEBUG) {
                    const prefixes = block.images.map(
                        (u, i) => `#${i}:${(u && String(u).slice(0, 52)) || ''}...`,
                    );
                    console.log(
                        '[PDF Export] buildPdf: blockIndex=',
                        blockIndex,
                        'imagesCount=',
                        block.images.length,
                        'dataUrlPrefixes=',
                        prefixes,
                    );
                }
                for (const dataUrl of block.images) {
                    try {
                        const dataUrlToEmbed = await dataUrlToPngIfNeeded(dataUrl);
                        const bytes = await opts.getImageBytes(dataUrlToEmbed);
                        if (!bytes || bytes.length === 0) continue;
                        const isJpg = /^data:image\/jpe?g/i.test(dataUrlToEmbed);
                        let img = null;
                        try {
                            img = isJpg
                                ? await pdfDoc.embedJpg(bytes)
                                : await pdfDoc.embedPng(bytes);
                        } catch (embedErr) {
                            try {
                                img = isJpg
                                    ? await pdfDoc.embedPng(bytes)
                                    : await pdfDoc.embedJpg(bytes);
                            } catch {
                                throw embedErr;
                            }
                        }
                        if (!img) continue;
                        const dims = img.scale(1);
                        const scaleW =
                            dims.width > contentWidthPt ? contentWidthPt / dims.width : 1;
                        const scaleH =
                            dims.height > maxImageHeightPt ? maxImageHeightPt / dims.height : 1;
                        const scale = Math.min(scaleW, scaleH);
                        const drawWidth = dims.width * scale;
                        const drawHeight = dims.height * scale;
                        const imgGap = isAlgorithmSection
                            ? ALGORITHM_SECTION_STEP_GAP_PT
                            : blockSpacingPt;
                        ensureSpace(drawHeight + imgGap);
                        page.drawImage(img, {
                            x: marginPt,
                            y: y - drawHeight,
                            width: drawWidth,
                            height: drawHeight,
                        });
                        y -= drawHeight + imgGap;
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
        } catch {
            /* ignore */
        }
    }
    try {
        candidates.push(new URL('../../fonts/' + FONT_FILENAME, import.meta.url).href);
    } catch {
        /* ignore */
    }
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
        } catch {
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
            NotificationService.add('Библиотека PDF (pdf-lib) не загружена.', 'error', {
                important: true,
            });
            return;
        }
        if (!fontkit) {
            NotificationService.add('Модуль fontkit для PDF не загружен.', 'error', {
                important: true,
            });
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
        clone
            .querySelectorAll?.(
                'button, script, .fav-btn-placeholder-modal-reglament, .toggle-favorite-btn, .view-screenshot-btn, .copyable-step-active',
            )
            .forEach((el) => el.remove());
        // Не включать в PDF блок «PDF-файлы» (ни «Нет PDF-файлов», ни список загруженных PDF).
        clone
            .querySelectorAll?.('.pdf-attachments-section, .pdf-host-area')
            .forEach((el) => el.remove());

        try {
            if (loadingOverlayManager)
                loadingOverlayManager.updateProgress(20, 'Обработка контента...');

            let sectionStepDataUrls = null;
            let allScreenshotsCount = 0;
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
                    if (
                        !stepEl ||
                        !Array.isArray(step.screenshotIds) ||
                        step.screenshotIds.length === 0
                    )
                        continue;
                    let screenshots = (
                        await Promise.all(
                            step.screenshotIds.map((id) => getFromIndexedDB('screenshots', id)),
                        )
                    ).filter(Boolean);
                    const seenIdsAlgo = new Set();
                    screenshots = screenshots.filter((sc) => {
                        const id = sc?.id;
                        if (id != null && seenIdsAlgo.has(id)) return false;
                        if (id != null) seenIdsAlgo.add(id);
                        return true;
                    });
                    const dataUrlsAlgo = [];
                    for (const sc of screenshots) {
                        let blob = sc?.blob;
                        if (!(blob instanceof Blob) && blob != null) {
                            if (blob instanceof ArrayBuffer || ArrayBuffer.isView(blob)) {
                                blob = new Blob([blob]);
                            } else {
                                blob = null;
                            }
                        }
                        if (blob instanceof Blob) {
                            try {
                                dataUrlsAlgo.push(await blobToDataUrl(blob));
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                    const uniqueDataUrls = [...new Set(dataUrlsAlgo)];
                    const container = document.createElement('div');
                    container.className = 'export-pdf-image-container';
                    for (const dataUrl of uniqueDataUrls) {
                        const img = document.createElement('img');
                        img.src = dataUrl;
                        img.alt = '';
                        container.appendChild(img);
                    }
                    if (container.children.length) stepEl.appendChild(container);
                }
            } else if (
                context.type === 'algorithm-section' &&
                Array.isArray(context.algorithms) &&
                context.algorithms.length > 0
            ) {
                const stepsFlat = context.algorithms.flatMap((algo) =>
                    (algo.steps || []).map((step, stepIndex) => ({ algo, step, stepIndex })),
                );
                let allScreenshotsRaw = [];
                try {
                    allScreenshotsRaw = await getAllFromIndexedDB('screenshots');
                } catch {
                    /* ignore */
                }
                const allScreenshots = Array.isArray(allScreenshotsRaw) ? allScreenshotsRaw : [];
                allScreenshotsCount = allScreenshots.length;

                sectionStepDataUrls = [];
                if (PDF_EXPORT_DEBUG) {
                    console.log(
                        '[PDF Export] algorithm-section: stepsFlat.length=',
                        stepsFlat.length,
                        ', allScreenshots=',
                        allScreenshots.length,
                    );
                }
                for (let k = 0; k < stepsFlat.length; k++) {
                    const { algo, step, stepIndex } = stepsFlat[k];
                    let screenshots = [];
                    let source = 'none';
                    const screenshotIds = Array.isArray(step.screenshotIds)
                        ? step.screenshotIds
                        : [];
                    if (screenshotIds.length > 0) {
                        screenshots = (
                            await Promise.all(
                                screenshotIds.map((id) => getFromIndexedDB('screenshots', id)),
                            )
                        ).filter(Boolean);
                        source = 'ids';
                    }
                    if (screenshots.length === 0 && algo.id != null) {
                        try {
                            const byParent = await getAllFromIndex(
                                'screenshots',
                                'parentId',
                                String(algo.id),
                            );
                            screenshots = (byParent || []).filter(
                                (s) =>
                                    s &&
                                    Number(s.stepIndex) === Number(stepIndex) &&
                                    s.parentType === 'algorithm',
                            );
                            if (screenshots.length) source = 'index';
                        } catch {
                            /* ignore */
                        }
                    }
                    if (screenshots.length === 0 && allScreenshots.length > 0 && algo.id != null) {
                        screenshots = allScreenshots.filter(
                            (s) =>
                                s &&
                                s.parentType === 'algorithm' &&
                                String(s.parentId) === String(algo.id) &&
                                Number(s.stepIndex) === Number(stepIndex),
                        );
                        if (screenshots.length) source = 'all';
                    }
                    const beforeDedupe = screenshots.length;
                    const seenIds = new Set();
                    screenshots = screenshots.filter((sc) => {
                        const id = sc?.id;
                        if (id != null && seenIds.has(id)) return false;
                        if (id != null) seenIds.add(id);
                        return true;
                    });
                    const dataUrls = [];
                    for (const sc of screenshots) {
                        let blob = sc?.blob;
                        if (!(blob instanceof Blob) && blob != null) {
                            if (blob instanceof ArrayBuffer || ArrayBuffer.isView(blob)) {
                                blob = new Blob([blob]);
                            } else {
                                blob = null;
                            }
                        }
                        if (blob instanceof Blob) {
                            try {
                                dataUrls.push(await blobToDataUrl(blob));
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                    const uniqueUrls = [...new Set(dataUrls)];
                    if (
                        PDF_EXPORT_DEBUG &&
                        (beforeDedupe > 0 || dataUrls.length > 0 || uniqueUrls.length > 0)
                    ) {
                        console.log(
                            '[PDF Export] step',
                            k,
                            'algoId=',
                            algo?.id,
                            'stepIndex=',
                            stepIndex,
                            'source=',
                            source,
                            'screenshotsBeforeIdDedupe=',
                            beforeDedupe,
                            'afterIdDedupe=',
                            screenshots.length,
                            'dataUrlsBeforeSet=',
                            dataUrls.length,
                            'afterSet=',
                            uniqueUrls.length,
                        );
                    }
                    sectionStepDataUrls.push(uniqueUrls);
                }
                if (PDF_EXPORT_DEBUG) {
                    const summary = sectionStepDataUrls
                        .map((arr, i) => `s${i}:${arr.length}`)
                        .join(', ');
                    console.log('[PDF Export] sectionStepDataUrls summary:', summary);
                }
                const stepsInClone = clone.querySelectorAll('.algorithm-step');
                for (let k = 0; k < stepsFlat.length && k < stepsInClone.length; k++) {
                    const stepEl = stepsInClone[k];
                    const dataUrls = sectionStepDataUrls[k];
                    // Remove any existing image containers so this step has exactly our images
                    // (avoids duplicates from buildAlgorithmSectionExport and ensures correct order).
                    stepEl
                        .querySelectorAll('.export-pdf-image-container')
                        .forEach((c) => c.remove());
                    if (!dataUrls?.length) continue;
                    const container = document.createElement('div');
                    container.className = 'export-pdf-image-container';
                    for (const dataUrl of dataUrls) {
                        const img = document.createElement('img');
                        img.src = dataUrl;
                        img.alt = '';
                        container.appendChild(img);
                    }
                    stepEl.appendChild(container);
                }
            }

            let contentBlocks = extractPdfContent(clone);
            // Для экспорта одного алгоритма: добавить в начало PDF заголовок с названием алгоритма.
            if (context.type === 'algorithm') {
                const titleText = (context.data?.title || cleanFilename || 'Алгоритм').trim();
                contentBlocks = [{ type: 'heading', level: 1, text: titleText }, ...contentBlocks];
            }
            if (sectionStepDataUrls && sectionStepDataUrls.length > 0) {
                if (PDF_EXPORT_DEBUG) {
                    const blockCount = contentBlocks.filter((b) => b.type === 'block').length;
                    console.log(
                        '[PDF Export] contentBlocks: total=',
                        contentBlocks.length,
                        ', type=block=',
                        blockCount,
                        ', sectionStepDataUrls.length=',
                        sectionStepDataUrls.length,
                    );
                    contentBlocks.forEach((b, i) => {
                        if (b.type === 'block')
                            console.log(
                                '[PDF Export] block from DOM before merge: blockIndex=',
                                i,
                                'imagesFromDOM=',
                                b.images?.length ?? 0,
                            );
                    });
                }
                // For algorithm-section, do NOT overwrite block.images: extractPdfContent already
                // read the correct images from the DOM (we injected them per step above). Overwriting
                // by stepIdx would misalign when step count !== block count (e.g. a step with only
                // a heading yields no block, so indices shift and images get assigned to wrong steps).
                if (context.type !== 'algorithm-section') {
                    let stepIdx = 0;
                    for (let blockIndex = 0; blockIndex < contentBlocks.length; blockIndex++) {
                        const block = contentBlocks[blockIndex];
                        if (block.type === 'block') {
                            const urls =
                                stepIdx < sectionStepDataUrls.length &&
                                Array.isArray(sectionStepDataUrls[stepIdx])
                                    ? sectionStepDataUrls[stepIdx]
                                    : [];
                            block.images = urls;
                            if (PDF_EXPORT_DEBUG && urls.length > 0) {
                                console.log(
                                    '[PDF Export] merge: blockIndex=',
                                    blockIndex,
                                    'stepIdx=',
                                    stepIdx,
                                    'imagesCount=',
                                    urls.length,
                                );
                            }
                            stepIdx++;
                        }
                    }
                }
                const stepsWithImages = sectionStepDataUrls.filter((a) => a.length > 0).length;
                const stepBlockCount = contentBlocks.filter((b) => b.type === 'block').length;
                const blocksWithImages = contentBlocks.filter((b) => b.images?.length).length;
                console.warn(
                    '[PDF Export] algorithm-section: steps=',
                    sectionStepDataUrls.length,
                    ', allScreenshots=',
                    allScreenshotsCount,
                    ', stepsWithImages=',
                    stepsWithImages,
                    ', stepBlocks=',
                    stepBlockCount,
                    ', blocksWithImagesAfterMerge=',
                    blocksWithImages,
                );
            }
            if (loadingOverlayManager)
                loadingOverlayManager.updateProgress(40, 'Загрузка шрифта...');

            let fontBytes = cachedFontBytes;
            if (!fontBytes) {
                fontBytes = await loadPdfFontBytes();
                if (fontBytes) cachedFontBytes = fontBytes;
            }
            if (!fontBytes) {
                const isFileProtocol =
                    typeof window !== 'undefined' &&
                    (window.location?.protocol === 'file:' ||
                        document.baseURI?.startsWith('file:'));
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
                isAlgorithmSection: context.type === 'algorithm-section',
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
