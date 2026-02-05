'use strict';

import { State } from '../app/state.js';
import { NotificationService } from '../services/notification.js';
import { getAllFromIndexedDB, saveToIndexedDB, deleteFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// PDF ATTACHMENT SYSTEM
// ============================================================================

// Helper function to show notification
function showNotification(message, type = 'success', duration = 5000) {
    if (typeof NotificationService !== 'undefined' && NotificationService.add) {
        NotificationService.add(message, type, { duration });
    } else if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
    } else {
        console.log(`[Notification] ${type}: ${message}`);
    }
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file) {
    if (!file) return false;
    if (file.type) return file.type === 'application/pdf';
    return /\.pdf$/i.test(file.name || '');
}

/**
 * Setup PDF drag and drop on an element
 */
export function setupPdfDragAndDrop(targetEl, onFiles, opts = {}) {
    if (!targetEl || typeof onFiles !== 'function') return;
    if (targetEl._pdfDndWired) return;
    targetEl._pdfDndWired = true;

    const cs = window.getComputedStyle(targetEl);
    if (cs.position === 'static') targetEl.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = `pdf-drop-overlay pointer-events-none absolute inset-0 rounded-xl z-[1000]
    border-2 border-dashed grid place-items-center text-sm font-medium
    opacity-0 transition-opacity`;
    overlay.style.zIndex = '1000';
    overlay.style.willChange = 'opacity';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.borderStyle = 'dashed';
    overlay.style.borderWidth = '2px';
    overlay.style.opacity = '0';
    overlay.style.visibility = 'hidden';

    overlay.innerHTML = `<div class="pdf-drop-msg px-3 py-2 rounded-md">
    <i class="far fa-file-pdf mr-1"></i>Отпустите PDF, чтобы загрузить
    </div>`;

    targetEl.appendChild(overlay);

    let dragDepth = 0;
    
    const isTransparent = (c) => {
        if (!c) return true;
        if (c === 'transparent') return true;
        const m = c.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const parts = m[1].split(',').map((s) => s.trim());
            const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
            return a === 0;
        }
        return false;
    };
    
    const parseRgb = (c) => {
        if (!c) return [0, 0, 0];
        const hex = c.trim().toLowerCase();
        if (hex.startsWith('#')) {
            const v =
                hex.length === 4
                    ? hex.replace(/#(.)(.)(.)/, (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`)
                    : hex;
            return [
                parseInt(v.slice(1, 3), 16),
                parseInt(v.slice(3, 5), 16),
                parseInt(v.slice(5, 7), 16),
            ];
        }
        const m = c.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const p = m[1].split(',').map((s) => s.trim());
            return [parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0];
        }
        return [0, 0, 0];
    };
    
    const toRgbStr = (arr) => `rgb(${arr[0]},${arr[1]},${arr[2]})`;
    
    const toRgbaWithAlpha = (c, a) => {
        if (!c) return `rgba(0,0,0,${a})`;
        const hex = c.trim().toLowerCase();
        if (hex.startsWith('#')) {
            const v =
                hex.length === 4
                    ? hex.replace(/#(.)(.)(.)/, (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`)
                    : hex;
            const r = parseInt(v.slice(1, 3), 16),
                g = parseInt(v.slice(3, 5), 16),
                b = parseInt(v.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${a})`;
        }
        const m = c.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const parts = m[1].split(',').map((s) => s.trim());
            const r = parseInt(parts[0], 10),
                g = parseInt(parts[1], 10),
                b = parseInt(parts[2], 10);
            return `rgba(${r || 0},${g || 0},${b || 0},${a})`;
        }
        return `rgba(0,0,0,${a})`;
    };

    const showOverlay = () => {
        overlay.style.display = 'grid';
        overlay.style.visibility = 'visible';
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });

        let bgColor, borderColor, textColor;
        const isDark =
            document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark');

        if (isDark) {
            bgColor = 'rgba(59,130,246,0.18)';
            borderColor = 'rgba(96,165,250,0.7)';
            textColor = '#93c5fd';
        } else {
            const parentBg = cs.backgroundColor;
            if (isTransparent(parentBg)) {
                bgColor = 'rgba(59,130,246,0.08)';
                borderColor = 'rgba(37,99,235,0.5)';
                textColor = '#1d4ed8';
            } else {
                const [r, g, b] = parseRgb(parentBg);
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                if (lum < 128) {
                    bgColor = 'rgba(59,130,246,0.18)';
                    borderColor = 'rgba(96,165,250,0.7)';
                    textColor = '#93c5fd';
                } else {
                    bgColor = 'rgba(59,130,246,0.08)';
                    borderColor = 'rgba(37,99,235,0.5)';
                    textColor = '#1d4ed8';
                }
            }
        }
        overlay.style.background = bgColor;
        overlay.style.borderColor = borderColor;
        const msg = overlay.querySelector('.pdf-drop-msg');
        if (msg) {
            msg.style.background = toRgbaWithAlpha(borderColor, 0.15);
            msg.style.color = textColor;
        }
    };

    const hideOverlay = () => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
        }, 200);
    };

    targetEl.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth++;
        if (dragDepth === 1) showOverlay();
    });

    targetEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    targetEl.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth--;
        if (dragDepth <= 0) {
            dragDepth = 0;
            hideOverlay();
        }
    });

    targetEl.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth = 0;
        hideOverlay();

        const files = Array.from(e.dataTransfer?.files || []).filter(isPdfFile);
        if (files.length) onFiles(files);
    });
}

/**
 * Add PDF records to the database
 */
export async function addPdfRecords(files, parentType, parentId) {
    if (!State.db) {
        console.error('[addPdfRecords] DB is not ready');
        return [];
    }
    if (!files || !files.length) return [];

    const results = [];
    for (const file of files) {
        if (!isPdfFile(file)) continue;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

            const record = {
                parentType,
                parentId: String(parentId),
                filename: file.name || 'file.pdf',
                size: blob.size,
                blob,
                createdAt: Date.now(),
            };

            const savedId = await saveToIndexedDB('pdfAttachments', record);
            results.push({ ...record, id: savedId });
            console.log(`[addPdfRecords] Saved PDF: ${file.name}, id=${savedId}`);
        } catch (err) {
            console.error('[addPdfRecords] Error saving PDF:', err);
        }
    }
    return results;
}

/**
 * Get PDFs for a parent entity
 */
export async function getPdfsForParent(parentType, parentId) {
    try {
        if (!State.db) throw new Error('DB not ready');
        const all = await getAllFromIndexedDB('pdfAttachments');
        return all.filter(
            (r) => r.parentType === parentType && String(r.parentId) === String(parentId),
        );
    } catch (err) {
        console.error('[getPdfsForParent] Error:', err);
        return [];
    }
}

/**
 * Download a PDF blob
 */
export function downloadPdfBlob(blob, filename = 'file.pdf') {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('[downloadPdfBlob] Error:', err);
        showNotification('Ошибка скачивания PDF', 'error');
    }
}

// PDF section mounting cache
const mountedPdfSections = new Map();

/**
 * Mount PDF section to a host element
 */
export function mountPdfSection(hostEl, parentType, parentId) {
    if (!hostEl) return;

    const bkey = `${parentType}:${parentId}`;
    if (mountedPdfSections.has(bkey)) {
        const existing = mountedPdfSections.get(bkey);
        if (existing && existing.parentNode) {
            refreshPdfList(existing, parentType, parentId);
            return;
        }
    }

    const section = document.createElement('div');
    section.className = 'pdf-attachments-section mt-4 border-t pt-4';
    section.dataset.parentType = parentType;
    section.dataset.parentId = parentId;

    section.innerHTML = `
    <details class="pdf-collapse group" open>
      <summary class="cursor-pointer select-none font-semibold text-sm text-gray-600 dark:text-gray-300 mb-2">
        <i class="far fa-file-pdf mr-1"></i>PDF-файлы
      </summary>
      <div class="pdf-row flex items-start justify-between gap-3">
        <ul class="pdf-list flex-1 space-y-1 text-sm"></ul>
        <div class="shrink-0">
          <input type="file" accept="application/pdf" multiple class="hidden pdf-input">
          <button type="button" class="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-secondary add-pdf-btn">
            <i class="far fa-file-pdf mr-1"></i>Загрузить PDF
          </button>
        </div>
      </div>
    </details>`;

    const row = section.querySelector('.pdf-row');
    const list = section.querySelector('.pdf-list');
    const input = section.querySelector('.pdf-input');
    const btn = section.querySelector('.add-pdf-btn');

    btn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input?.click();
    });

    input?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        await addPdfRecords(files, parentType, parentId);
        input.value = '';
        refreshPdfList(section, parentType, parentId);
    });

    setupPdfDragAndDrop(row, async (files) => {
        await addPdfRecords(files, parentType, parentId);
        refreshPdfList(section, parentType, parentId);
    });

    hostEl.appendChild(section);
    mountedPdfSections.set(bkey, section);
    refreshPdfList(section, parentType, parentId);
}

/**
 * Refresh the PDF list in a section
 */
async function refreshPdfList(section, parentType, parentId) {
    const list = section.querySelector('.pdf-list');
    if (!list) return;

    const pdfs = await getPdfsForParent(parentType, parentId);

    if (!pdfs.length) {
        list.innerHTML = '<li class="text-gray-500">Нет PDF-файлов</li>';
        return;
    }

    const frag = document.createDocumentFragment();
    pdfs.forEach((pdf) => {
        const li = document.createElement('li');
        li.className =
            'flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded';

        const sizeKb = Math.max(1, Math.round((pdf.size || 0) / 1024));
        const safeName = (pdf.filename || 'file.pdf').replace(
            /[<>&"']/g,
            (s) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[s]),
        );

        li.innerHTML = `
          <div class="truncate pr-2">
            <i class="far fa-file-pdf mr-2"></i>
            <span title="${safeName}">${safeName}</span>
            <span class="text-gray-500">(${sizeKb} KB)</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200" data-act="dl">Скачать</button>
            <button class="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200" data-act="rm">Удалить</button>
          </div>`;

        li.querySelector('[data-act="dl"]')?.addEventListener('click', () => {
            if (pdf.blob) downloadPdfBlob(pdf.blob, pdf.filename);
        });

        li.querySelector('[data-act="rm"]')?.addEventListener('click', async () => {
            try {
                await deleteFromIndexedDB('pdfAttachments', pdf.id);
                refreshPdfList(section, parentType, parentId);
                showNotification('PDF удален', 'success');
            } catch (err) {
                console.error('[refreshPdfList] Delete error:', err);
                showNotification('Ошибка удаления PDF', 'error');
            }
        });

        frag.appendChild(li);
    });

    list.innerHTML = '';
    list.appendChild(frag);
}

/**
 * Render PDF attachments section
 */
export function renderPdfAttachmentsSection(container, parentType, parentId) {
    if (!container) return;
    const bkey = `${parentType}:${parentId}`;
    if (mountedPdfSections.has(bkey)) {
        const existing = mountedPdfSections.get(bkey);
        if (existing && existing.parentNode) {
            refreshPdfList(existing, parentType, parentId);
            return;
        }
    }
    mountPdfSection(container, parentType, parentId);
}

// Helper to try attaching to algorithm view modal
function tryAttachToAlgorithmModal() {
    const modal = document.getElementById('algorithmModal');
    if (!modal) return;

    const observer = new MutationObserver(() => {
        if (modal.classList.contains('hidden')) return;

        const algoId = modal.dataset.algorithmId;
        if (!algoId) return;

        const content = modal.querySelector('.modal-content, .algorithm-content');
        if (!content) return;

        let pdfHost = content.querySelector('.pdf-host-area');
        if (!pdfHost) {
            pdfHost = document.createElement('div');
            pdfHost.className = 'pdf-host-area';
            content.appendChild(pdfHost);
        }

        mountPdfSection(pdfHost, 'algorithm', algoId);
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

// Helper to try attaching to algorithm edit modal
function tryAttachToAlgorithmEditModal() {
    const modal = document.getElementById('editModal');
    if (!modal) return;

    const observer = new MutationObserver(() => {
        if (modal.classList.contains('hidden')) return;

        const algoId = modal.dataset.algorithmId || modal.querySelector('#editAlgorithmId')?.value;
        if (!algoId) return;

        const form = modal.querySelector('form');
        if (!form) return;

        let pdfHost = form.querySelector('.pdf-host-area');
        if (!pdfHost) {
            pdfHost = document.createElement('div');
            pdfHost.className = 'pdf-host-area';
            form.appendChild(pdfHost);
        }

        mountPdfSection(pdfHost, 'algorithm', algoId);
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Initialize PDF attachment system
 */
export function initPdfAttachmentSystem() {
    tryAttachToAlgorithmModal();
    tryAttachToAlgorithmEditModal();
    console.log('PDF Attachment System initialized.');
}

/**
 * Attach PDF handlers for algorithm add modal
 */
export function attachAlgorithmAddPdfHandlers(addModal) {
    const newSteps = addModal?.querySelector('#newSteps');
    if (!newSteps) return;

    // Setup drag and drop for the steps container
    setupPdfDragAndDrop(newSteps, (files) => {
        console.log('[attachAlgorithmAddPdfHandlers] PDF files dropped:', files.length);
        // Store files for later when algorithm is saved
        if (!addModal._tempPdfFiles) addModal._tempPdfFiles = [];
        addModal._tempPdfFiles.push(...files);
        showNotification(`${files.length} PDF файл(ов) добавлено`, 'success');
    });
}

/**
 * Attach PDF handlers for bookmark form
 */
export function attachBookmarkPdfHandlers(form) {
    if (!form) return;

    const idInput = form.querySelector('#bookmarkId');
    if (idInput && idInput.value && idInput.value.trim()) return;

    if (form.dataset.pdfDraftWired === '1' || form.querySelector('.pdf-draft-list')) return;
    form.dataset.pdfDraftWired = '1';

    const block = document.createElement('div');
    block.className = 'mt-4 mb-4';
    block.innerHTML = `
      <details class="pdf-collapse group" open>
        <summary class="cursor-pointer select-none font-semibold text-sm text-gray-600 dark:text-gray-300 mb-2">
          <i class="far fa-file-pdf mr-1"></i>PDF-файлы
        </summary>
        <div class="pdf-row flex items-start justify-between gap-3">
          <ul class="pdf-draft-list flex-1 space-y-1 text-sm"></ul>
          <div class="shrink-0">
            <input type="file" accept="application/pdf" multiple class="hidden pdf-draft-input">
            <button type="button" class="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-secondary add-pdf-draft-btn">
              <i class="far fa-file-pdf mr-1"></i>Загрузить PDF
            </button>
          </div>
        </div>
      </details>`;

    const screenshotsBlock = form
        .querySelector('#bookmarkScreenshotThumbnailsContainer')
        ?.closest('.mb-4');
    if (screenshotsBlock && screenshotsBlock.parentNode) {
        screenshotsBlock.parentNode.insertBefore(block, screenshotsBlock.nextSibling);
    } else {
        form.appendChild(block);
    }

    const detailsEl = block.querySelector('details');
    const rowEl = block.querySelector('.pdf-row');
    const list = block.querySelector('.pdf-draft-list');
    const input = block.querySelector('.pdf-draft-input');
    const btn = block.querySelector('.add-pdf-draft-btn');

    detailsEl.addEventListener('toggle', () => (block.dataset.userToggled = '1'));

    if (btn && btn.dataset.wired !== '1') {
        btn.dataset.wired = '1';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        });
    }

    const makeKey = (f) =>
        `${(f && f.name) || ''}|${(f && f.size) || 0}|${(f && f.lastModified) || 0}`;

    const refreshDraftList = () => {
        const uniq = new Map();
        for (const f of Array.from(form._tempPdfFiles || [])) {
            if (!f) continue;
            const k = makeKey(f);
            if (!uniq.has(k)) uniq.set(k, f);
        }
        const files = Array.from(uniq.values());
        form._tempPdfFiles = files;

        if (!files.length) {
            list.innerHTML = '<li class="text-gray-500">Нет файлов</li>';
            if (!block.dataset.userToggled) detailsEl.open = true;
            return;
        }

        const frag = document.createDocumentFragment();
        files.forEach((file, idx) => {
            const li = document.createElement('li');
            li.className =
                'flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded';

            const displayName =
                typeof file?.name === 'string' && file.name.trim() ? file.name : `PDF ${idx + 1}`;
            const safe = displayName.replace(
                /[<>&"']/g,
                (s) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[s]),
            );
            const sizeKb = Math.max(1, Math.round((file.size || 0) / 1024));

            li.innerHTML = `
              <div class="truncate pr-2">
                <i class="far fa-file-pdf mr-2"></i>
                <span title="${safe}">${safe}</span>
                <span class="text-gray-500">(${sizeKb} KB)</span>
              </div>
              <div class="flex items-center gap-2">
                <button class="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300" data-act="rm">Удалить</button>
              </div>`;

            li.querySelector('[data-act="rm"]').addEventListener('click', () => {
                const curr = Array.from(form._tempPdfFiles || []);
                curr.splice(idx, 1);
                form._tempPdfFiles = curr;
                refreshDraftList();
            });

            frag.appendChild(li);
        });

        list.innerHTML = '';
        list.appendChild(frag);
        detailsEl.open = true;
    };

    if (input && input.dataset.wired !== '1') {
        input.dataset.wired = '1';
        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            const curr = Array.from(form._tempPdfFiles || []);
            const seen = new Set(curr.map(makeKey));
            const toAdd = files.filter((f) => !seen.has(makeKey(f)));
            if (toAdd.length) form._tempPdfFiles = curr.concat(toAdd);
            input.value = '';
            refreshDraftList();
        });
    }

    if (rowEl && !rowEl.dataset.dndWired) {
        rowEl.dataset.dndWired = '1';
        setupPdfDragAndDrop(rowEl, (files) => {
            const curr = Array.from(form._tempPdfFiles || []);
            const seen = new Set(curr.map(makeKey));
            const toAdd = Array.from(files || []).filter((f) => !seen.has(makeKey(f)));
            if (toAdd.length) form._tempPdfFiles = curr.concat(toAdd);
            refreshDraftList();
        });
    }

    refreshDraftList();
}

// Export for window access (backward compatibility)
if (typeof window !== 'undefined') {
    window.isPdfFile = isPdfFile;
    window.setupPdfDragAndDrop = setupPdfDragAndDrop;
    window.addPdfRecords = addPdfRecords;
    window.getPdfsForParent = getPdfsForParent;
    window.downloadPdfBlob = downloadPdfBlob;
    window.mountPdfSection = mountPdfSection;
    window.renderPdfAttachmentsSection = renderPdfAttachmentsSection;
    window.initPdfAttachmentSystem = initPdfAttachmentSystem;
    window.attachAlgorithmAddPdfHandlers = attachAlgorithmAddPdfHandlers;
    window.attachBookmarkPdfHandlers = attachBookmarkPdfHandlers;
}
