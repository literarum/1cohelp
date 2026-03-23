'use strict';

import { getAllFromIndexWithKeyVariants } from '../db/indexeddb.js';

// ============================================================================
// BOOKMARKS PDF EXPORT (одна закладка / все закладки)
// ============================================================================

/**
 * Зависимости модуля выставляются через DI из script.js / app-init.
 * Это позволяет переиспользовать существующие сервисы и упростить тестирование.
 */
let deps = {
    ExportService: null,
    getFromIndexedDB: null,
    getAllFromIndex: null,
    getAllFromIndexedDB: null,
    getPdfsForParent: null,
    showNotification: null,
};

/**
 * Устанавливает зависимости для системы экспорта закладок в PDF.
 * Ожидаемые поля:
 * - ExportService: { exportElementToPdf }
 * - getFromIndexedDB: (storeName, key) => Promise<any>
 * - getAllFromIndex: (storeName, indexName, query) => Promise<any[]>
 * - getPdfsForParent: (parentType, parentId) => Promise<any[]>
 * - showNotification: (message, type?, duration?) => void
 */
export function setBookmarksPdfExportDependencies(overrides) {
    deps = { ...deps, ...overrides };
}

function notify(message, type = 'info', duration) {
    if (typeof deps.showNotification === 'function') {
        deps.showNotification(message, type, duration);
    } else if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
    } else {
        console.log(`[BookmarksPdfExport][${type}] ${message}`);
    }
}

function ensureDepsForSingleExport() {
    const missing = [];
    if (!deps.ExportService || typeof deps.ExportService.exportElementToPdf !== 'function')
        missing.push('ExportService.exportElementToPdf');
    if (typeof deps.getFromIndexedDB !== 'function') missing.push('getFromIndexedDB');
    if (typeof deps.getAllFromIndex !== 'function') missing.push('getAllFromIndex');
    if (typeof deps.getPdfsForParent !== 'function') missing.push('getPdfsForParent');
    if (missing.length > 0) {
        throw new Error(`Bookmarks PDF export is not configured. Missing: ${missing.join(', ')}`);
    }
}

function ensureDepsForAllExport() {
    const missing = [];
    if (!deps.ExportService || typeof deps.ExportService.exportElementToPdf !== 'function')
        missing.push('ExportService.exportElementToPdf');
    if (typeof deps.getAllFromIndexedDB !== 'function') missing.push('getAllFromIndexedDB');
    if (typeof deps.getPdfsForParent !== 'function') missing.push('getPdfsForParent');
    if (missing.length > 0) {
        throw new Error(
            `Bookmarks PDF export (all) is not configured. Missing: ${missing.join(', ')}`,
        );
    }
}

function sanitizeFilenameBase(base) {
    if (!base) return 'Закладка';
    const s = String(base)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^a-zA-Zа-яА-Я0-9\s\-_]+/g, '')
        .trim();
    return s || 'Закладка';
}

function formatUrlForDisplay(url) {
    if (!url) return '';
    return String(url).trim();
}

/** Размер вложения для текста экспорта PDF (КБ/МБ, согласовано с UI вложений). */
function formatPdfExportSize(bytes) {
    const n = typeof bytes === 'number' && bytes > 0 ? bytes : 0;
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`;
    const mb = n / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} МБ`;
}

/**
 * Заголовок, поясняющая подпись и маркированный список вложений для extractPdfContent.
 */
function appendBookmarkPdfExportSection(host, pdfFiles) {
    if (!host || !Array.isArray(pdfFiles) || pdfFiles.length === 0) return;

    const h3 = document.createElement('h3');
    h3.textContent = 'Прикреплённые PDF';
    host.appendChild(h3);

    const caption = document.createElement('p');
    caption.className = 'pdf-caption';
    caption.textContent =
        'Перечень имён и размеров файлов. Содержимое PDF в этот документ не встраивается.';
    host.appendChild(caption);

    const listEl = document.createElement('ul');
    listEl.className = 'bookmark-pdf-summary-list';

    pdfFiles.forEach((pdf) => {
        const li = document.createElement('li');
        const name =
            typeof pdf?.filename === 'string' && pdf.filename.trim()
                ? pdf.filename.trim()
                : 'file.pdf';
        const sizeLabel = formatPdfExportSize(pdf?.size || (pdf?.blob && pdf.blob.size) || 0);
        li.textContent = `${name} — ${sizeLabel}`;
        listEl.appendChild(li);
    });

    host.appendChild(listEl);
}

function toFolderKey(value) {
    if (value == null) return '';
    return String(value).trim();
}

function buildFolderNameMap(folders) {
    const folderNameById = new Map();
    if (!Array.isArray(folders)) return folderNameById;

    folders.forEach((folder) => {
        const key = toFolderKey(folder?.id);
        const name = typeof folder?.name === 'string' ? folder.name.trim() : '';
        if (!key || !name) return;
        folderNameById.set(key, name);
    });

    return folderNameById;
}

function resolveFolderName(folderId, folderNameById) {
    const key = toFolderKey(folderId);
    if (!key) return '';

    if (folderNameById instanceof Map && folderNameById.has(key)) {
        return folderNameById.get(key);
    }

    if (key.toLowerCase() === 'archive') {
        return 'Архив';
    }

    return key;
}

function getDescriptionParagraphsForExport(description) {
    if (typeof description !== 'string') return [];
    const normalized = description.replace(/\r\n/g, '\n');
    if (!normalized.trim()) return [];

    const paragraphs = normalized
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean);

    if (paragraphs.length > 0) return paragraphs;
    return [normalized.trim()];
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) {
            reject(new Error('Not a Blob'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
    });
}

async function loadBookmarkScreenshots(bookmarkId) {
    try {
        const allForParent = await getAllFromIndexWithKeyVariants(
            'screenshots',
            'parentId',
            bookmarkId,
        );
        if (!Array.isArray(allForParent)) return [];
        return allForParent.filter((s) => s && s.parentType === 'bookmark');
    } catch (e) {
        // Не критично для экспорта, просто сообщаем в консоль.
        console.warn('[BookmarksPdfExport] Failed to load screenshots for bookmark', bookmarkId, e);
        return [];
    }
}

async function loadBookmarkPdfs(bookmarkId) {
    if (!deps.getPdfsForParent) return [];
    try {
        const pdfs = await deps.getPdfsForParent('bookmark', String(bookmarkId));
        return Array.isArray(pdfs) ? pdfs : [];
    } catch (e) {
        console.warn('[BookmarksPdfExport] Failed to load PDFs for bookmark', bookmarkId, e);
        return [];
    }
}

/**
 * Строит DOM-дерево для экспорта одной закладки в PDF.
 * Здесь важно использовать только те теги, которые корректно обрабатывает ExportService.extractPdfContent:
 * - h1/h2/h3/h4, p, li, контейнеры с img внутри (.export-pdf-image-container).
 */
async function buildSingleBookmarkExportElement(bookmark, screenshots, pdfFiles) {
    const root = document.createElement('div');
    root.className = 'bookmark-export-root space-y-3';

    // Заголовок (h1)
    const titleEl = document.createElement('h1');
    titleEl.textContent = bookmark.title || `Закладка ${bookmark.id ?? ''}`.trim();
    root.appendChild(titleEl);

    // URL (если есть)
    const urlText = formatUrlForDisplay(bookmark.url);
    if (urlText) {
        const urlEl = document.createElement('p');
        urlEl.className = 'bookmark-url';
        urlEl.textContent = urlText;
        root.appendChild(urlEl);
    }

    // Описание (plain text с сохранением базовых переносов).
    const description =
        typeof bookmark.description === 'string' && bookmark.description.trim()
            ? bookmark.description
            : 'Нет описания.';
    if (description) {
        const descWrapper = document.createElement('div');
        descWrapper.className = 'bookmark-description';

        const paragraphs = String(description)
            .replace(/\r\n/g, '\n')
            .split(/\n{2,}/)
            .map((s) => s.trim())
            .filter(Boolean);

        if (paragraphs.length === 0) {
            const p = document.createElement('p');
            p.textContent = description.trim();
            descWrapper.appendChild(p);
        } else {
            paragraphs.forEach((chunk) => {
                const p = document.createElement('p');
                p.textContent = chunk;
                descWrapper.appendChild(p);
            });
        }

        root.appendChild(descWrapper);
    }

    // Скриншоты (если есть).
    const imageDataUrls = [];
    if (Array.isArray(screenshots) && screenshots.length > 0) {
        for (const sc of screenshots) {
            let blob = sc && sc.blob;
            if (!(blob instanceof Blob) && blob != null) {
                if (blob instanceof ArrayBuffer || ArrayBuffer.isView(blob)) {
                    blob = new Blob([blob]);
                } else {
                    blob = null;
                }
            }
            if (blob instanceof Blob) {
                try {
                    const dataUrl = await blobToDataUrl(blob);
                    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                        imageDataUrls.push(dataUrl);
                    }
                } catch (e) {
                    console.warn(
                        '[BookmarksPdfExport] Failed to convert screenshot blob to data URL',
                        e,
                    );
                }
            }
        }
    }

    if (imageDataUrls.length > 0) {
        const screenshotsWrapper = document.createElement('div');
        screenshotsWrapper.className = 'bookmark-screenshots';

        const imgContainer = document.createElement('div');
        imgContainer.className = 'export-pdf-image-container';

        imageDataUrls.forEach((dataUrl) => {
            const img = document.createElement('img');
            img.src = dataUrl;
            img.alt = '';
            imgContainer.appendChild(img);
        });

        screenshotsWrapper.appendChild(imgContainer);
        root.appendChild(screenshotsWrapper);
    }

    if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
        const pdfWrapper = document.createElement('div');
        pdfWrapper.className = 'bookmark-pdf-summary';
        appendBookmarkPdfExportSection(pdfWrapper, pdfFiles);
        root.appendChild(pdfWrapper);
    }

    return root;
}

/**
 * Экспорт одной закладки в PDF по её ID.
 * Вызывает ExportService.exportElementToPdf с построенным DOM.
 */
export async function exportSingleBookmarkToPdf(bookmarkId) {
    try {
        ensureDepsForSingleExport();
    } catch (e) {
        notify(e.message || String(e), 'error', 8000);
        throw e;
    }

    if (bookmarkId == null || bookmarkId === '') {
        notify('Не указан ID закладки для экспорта.', 'error');
        return;
    }

    let numericId = bookmarkId;
    if (typeof numericId === 'string') {
        const parsed = parseInt(numericId, 10);
        if (!Number.isNaN(parsed)) numericId = parsed;
    }

    try {
        const bookmark = await deps.getFromIndexedDB('bookmarks', numericId);
        if (!bookmark) {
            notify('Закладка не найдена. Возможно, она была удалена.', 'error');
            return;
        }

        const [screenshots, pdfFiles] = await Promise.all([
            loadBookmarkScreenshots(bookmark.id),
            loadBookmarkPdfs(bookmark.id),
        ]);

        const element = await buildSingleBookmarkExportElement(bookmark, screenshots, pdfFiles);
        const base = sanitizeFilenameBase(bookmark.title || `bookmark-${bookmark.id}`);
        const filename = `Закладка_${base}`;

        await deps.ExportService.exportElementToPdf(element, filename, {
            type: 'bookmark',
            data: bookmark,
        });
    } catch (error) {
        console.error('[BookmarksPdfExport] Error exporting single bookmark to PDF:', error);
        notify(
            `Ошибка при экспорте закладки в PDF: ${error?.message || String(error)}`,
            'error',
            10000,
        );
    }
}

function buildAllBookmarksExportElement(bookmarks, pdfsByBookmarkId, folderNameById) {
    const root = document.createElement('div');
    root.className = 'bookmarks-export-root space-y-4';

    const titleEl = document.createElement('h1');
    titleEl.textContent = 'Закладки';
    root.appendChild(titleEl);

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'Нет закладок для экспорта.';
        root.appendChild(p);
        return root;
    }

    const sorted = [...bookmarks].sort((a, b) => {
        const ta = (a && a.title) || '';
        const tb = (b && b.title) || '';
        return String(ta).localeCompare(String(tb), 'ru');
    });

    sorted.forEach((bookmark) => {
        if (!bookmark) return;
        const h2 = document.createElement('h2');
        h2.textContent = bookmark.title || `Закладка ${bookmark.id ?? ''}`.trim();
        root.appendChild(h2);

        const urlText = formatUrlForDisplay(bookmark.url);
        if (urlText) {
            const urlEl = document.createElement('p');
            urlEl.className = 'bookmark-url';
            urlEl.textContent = urlText;
            root.appendChild(urlEl);
        }

        const descParagraphs = getDescriptionParagraphsForExport(bookmark.description);
        descParagraphs.forEach((paragraph) => {
            const descEl = document.createElement('p');
            descEl.className = 'bookmark-desc';
            descEl.textContent = paragraph;
            root.appendChild(descEl);
        });

        if (bookmark.folder != null) {
            const folderEl = document.createElement('p');
            folderEl.className = 'bookmark-folder';
            folderEl.textContent = `Папка: ${resolveFolderName(bookmark.folder, folderNameById)}`;
            root.appendChild(folderEl);
        }

        const pdfList = pdfsByBookmarkId.get(String(bookmark.id)) || [];
        if (pdfList.length > 0) {
            appendBookmarkPdfExportSection(root, pdfList);
        }
    });

    return root;
}

export async function exportAllBookmarksToPdf() {
    try {
        ensureDepsForAllExport();
    } catch (e) {
        notify(e.message || String(e), 'error', 8000);
        throw e;
    }

    try {
        const allBookmarks = await deps.getAllFromIndexedDB('bookmarks');
        const bookmarks = Array.isArray(allBookmarks) ? allBookmarks : [];
        const allFolders = await deps.getAllFromIndexedDB('bookmarkFolders');
        const folderNameById = buildFolderNameMap(allFolders);

        const pdfsByBookmarkId = new Map();
        await Promise.all(
            bookmarks.map(async (bm) => {
                const id = bm && bm.id;
                if (id == null) return;
                const pdfs = await loadBookmarkPdfs(id);
                pdfsByBookmarkId.set(String(id), pdfs);
            }),
        );

        const element = buildAllBookmarksExportElement(bookmarks, pdfsByBookmarkId, folderNameById);
        await deps.ExportService.exportElementToPdf(element, 'Закладки', {
            type: 'bookmarks-section',
        });
    } catch (error) {
        console.error('[BookmarksPdfExport] Error exporting all bookmarks to PDF:', error);
        notify(
            `Ошибка при экспорте всех закладок в PDF: ${error?.message || String(error)}`,
            'error',
            10000,
        );
    }
}

// Для обратной совместимости и ручного вызова из консоли.
if (typeof window !== 'undefined') {
    window.setBookmarksPdfExportDependencies = setBookmarksPdfExportDependencies;
    window.exportSingleBookmarkToPdf = exportSingleBookmarkToPdf;
    window.exportAllBookmarksToPdf = exportAllBookmarksToPdf;
}

export const __bookmarksPdfExportTestables = {
    buildFolderNameMap,
    resolveFolderName,
    getDescriptionParagraphsForExport,
};
