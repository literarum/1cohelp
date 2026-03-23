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
export function setupPdfDragAndDrop(targetEl, onFiles, _opts = {}) {
    if (!targetEl || typeof onFiles !== 'function') return;
    if (targetEl._pdfDndWired) return;
    targetEl._pdfDndWired = true;

    const cs = window.getComputedStyle(targetEl);
    if (cs.position === 'static') targetEl.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = `pdf-drop-overlay pointer-events-none absolute inset-0 rounded-xl z-20
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

            const savedId = await saveToIndexedDB('pdfFiles', record);
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
        const all = await getAllFromIndexedDB('pdfFiles');
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
        if (!(blob instanceof Blob) || blob.size <= 0) {
            showNotification('Файл недоступен для скачивания', 'error');
            return;
        }
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

function formatPdfSize(bytes) {
    const n = typeof bytes === 'number' && bytes > 0 ? bytes : 0;
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`;
    const mb = n / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} МБ`;
}

async function confirmPdfRemoval(displayName) {
    const message = `Файл «${displayName}» будет удалён с устройства. Это действие нельзя отменить.`;
    if (typeof window !== 'undefined' && typeof window.showAppConfirm === 'function') {
        return window.showAppConfirm({
            title: 'Удалить PDF?',
            message,
            confirmText: 'Удалить',
            cancelText: 'Отмена',
            confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
        });
    }
    return typeof window !== 'undefined' && window.confirm ? window.confirm(message) : false;
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
    section.className =
        parentType === 'algorithm'
            ? 'pdf-attachments-section mt-6 pt-6 border-t border-gray-100 dark:border-gray-700/80'
            : 'pdf-attachments-section mt-6 pt-6 border-t border-gray-100 dark:border-gray-700/80';
    section.dataset.parentType = parentType;
    section.dataset.parentId = parentId;

    const addMoreLabel =
        parentType === 'bookmark'
            ? 'Добавить ещё PDF к этой закладке'
            : 'Добавить ещё PDF к этому алгоритму';

    section.innerHTML = `
    <input type="file" accept="application/pdf" multiple class="hidden pdf-input" aria-label="Выбрать PDF-файлы">
    <div class="pdf-add-toolbar hidden border-t border-gray-100 pt-2 pb-1 dark:border-gray-700/80" role="region" aria-label="Добавление PDF">
      <button type="button" class="pdf-add-more-btn inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-600 shadow-sm transition hover:border-primary/50 hover:bg-gray-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-primary/40 dark:hover:bg-gray-700/50" aria-label="${addMoreLabel}">
        <i class="fas fa-plus text-sm" aria-hidden="true"></i>
      </button>
    </div>
    <div class="pdf-list-shell pdf-drop-target mt-2 min-h-0 rounded-xl transition-colors"></div>`;

    const shell = section.querySelector('.pdf-list-shell');
    const input = section.querySelector('.pdf-input');
    const addToolbar = section.querySelector('.pdf-add-toolbar');
    const addMoreBtn = section.querySelector('.pdf-add-more-btn');
    if (addMoreBtn) {
        addMoreBtn.title = addMoreLabel;
        addMoreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            input?.click();
        });
    }

    input?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        await addPdfRecords(files, parentType, parentId);
        input.value = '';
        refreshPdfList(section, parentType, parentId);
    });

    if (shell) {
        setupPdfDragAndDrop(shell, async (files) => {
            await addPdfRecords(files, parentType, parentId);
            refreshPdfList(section, parentType, parentId);
        });
    }

    hostEl.appendChild(section);
    mountedPdfSections.set(bkey, section);
    refreshPdfList(section, parentType, parentId);
}

/**
 * Refresh the PDF list in a section
 */
async function refreshPdfList(section, parentType, parentId) {
    const shell = section.querySelector('.pdf-list-shell');
    if (!shell) return;

    const pdfs = await getPdfsForParent(parentType, parentId);

    const addToolbar = section.querySelector('.pdf-add-toolbar');
    if (addToolbar) {
        addToolbar.classList.toggle('hidden', pdfs.length === 0);
    }

    shell.innerHTML = '';
    shell.className =
        'pdf-list-shell pdf-drop-target mt-2 min-h-0 rounded-xl transition-colors border-2 border-dashed border-gray-200/90 bg-gray-50/40 px-1 py-0.5 dark:border-gray-600/70 dark:bg-gray-900/25';

    if (!pdfs.length) {
        const empty = document.createElement('div');
        empty.className =
            'pdf-empty-state flex flex-col items-center justify-center gap-0.5 py-2 px-2 text-center cursor-pointer rounded-lg outline-none transition-colors hover:bg-gray-100/60 dark:hover:bg-gray-800/25 focus-visible:ring-2 focus-visible:ring-primary/35';
        empty.setAttribute('role', 'button');
        empty.setAttribute('tabindex', '0');
        empty.title =
            'Нажмите, чтобы выбрать PDF, или перетащите файлы в эту область. Только PDF, хранение в браузере.';
        empty.innerHTML = `
          <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gray-200/70 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400" aria-hidden="true">
            <i class="far fa-file-pdf text-sm"></i>
          </span>
          <p class="text-xs font-medium leading-snug text-gray-700 dark:text-gray-200">Нет прикреплённых PDF</p>
          <p class="max-w-sm text-2xs leading-snug text-gray-500 dark:text-gray-400">Нажмите здесь, чтобы выбрать файлы, или перетащите PDF в эту область</p>
          <p class="text-2xs text-gray-400 dark:text-gray-500">Только PDF · локально в браузере</p>`;
        const pickFiles = () => {
            const inp = section.querySelector('.pdf-input');
            inp?.click();
        };
        empty.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            pickFiles();
        });
        empty.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pickFiles();
            }
        });
        shell.appendChild(empty);
        return;
    }

    shell.className =
        'pdf-list-shell pdf-drop-target mt-2 rounded-xl border border-gray-200/90 bg-white px-0 py-0 shadow-sm dark:border-gray-600/80 dark:bg-gray-800/40';

    const ul = document.createElement('ul');
    ul.className = 'pdf-list divide-y divide-gray-100 dark:divide-gray-700/80';
    ul.setAttribute('role', 'list');

    pdfs.forEach((pdf) => {
        const li = document.createElement('li');
        li.className =
            'group flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-700/30';

        const displayName =
            typeof pdf?.filename === 'string' && pdf.filename.trim() ? pdf.filename.trim() : 'file.pdf';
        const sizeLabel = formatPdfSize(pdf?.size || (pdf?.blob && pdf.blob.size) || 0);
        const iconWrap = document.createElement('div');
        iconWrap.className =
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/[0.08] text-red-600 dark:bg-red-400/10 dark:text-red-400';
        iconWrap.setAttribute('aria-hidden', 'true');
        iconWrap.innerHTML = '<i class="far fa-file-pdf text-lg"></i>';

        const meta = document.createElement('div');
        meta.className = 'min-w-0 flex-1';
        const nameEl = document.createElement('p');
        nameEl.className =
            'truncate text-sm font-medium text-gray-900 dark:text-gray-100';
        nameEl.textContent = displayName;
        nameEl.title = displayName;
        const sizeEl = document.createElement('p');
        sizeEl.className = 'mt-0.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums';
        sizeEl.textContent = sizeLabel;
        meta.appendChild(nameEl);
        meta.appendChild(sizeEl);

        const actions = document.createElement('div');
        actions.className = 'flex flex-shrink-0 items-center gap-0.5 sm:gap-1';

        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className =
            'rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100';
        dlBtn.setAttribute('aria-label', `Скачать ${displayName}`);
        dlBtn.title = `Скачать «${displayName}» на устройство`;
        dlBtn.innerHTML = '<i class="fas fa-download text-sm" aria-hidden="true"></i>';
        dlBtn.addEventListener('click', () => {
            const blob = pdf?.blob instanceof Blob ? pdf.blob : null;
            if (blob && blob.size > 0) {
                downloadPdfBlob(blob, displayName);
            } else {
                showNotification('Файл повреждён или недоступен', 'error');
            }
        });

        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className =
            'rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:hover:bg-red-950/40 dark:hover:text-red-400';
        rmBtn.setAttribute('aria-label', `Удалить ${displayName}`);
        rmBtn.title = `Удалить «${displayName}» из списка PDF`;
        rmBtn.innerHTML = '<i class="far fa-trash-alt text-sm" aria-hidden="true"></i>';
        rmBtn.addEventListener('click', async () => {
            const ok = await confirmPdfRemoval(displayName);
            if (!ok) return;
            try {
                await deleteFromIndexedDB('pdfFiles', pdf.id);
                await refreshPdfList(section, parentType, parentId);
                showNotification('PDF удалён', 'success');
            } catch (err) {
                console.error('[refreshPdfList] Delete error:', err);
                showNotification('Ошибка удаления PDF', 'error');
            }
        });

        actions.appendChild(dlBtn);
        actions.appendChild(rmBtn);
        li.appendChild(iconWrap);
        li.appendChild(meta);
        li.appendChild(actions);
        ul.appendChild(li);
    });

    shell.appendChild(ul);
}

/**
 * Remove all PDF sections mounted inside a container and clear them from cache.
 * Use before re-rendering (e.g. when switching bookmark in detail modal) to avoid
 * multiple sections from different parents showing in the same view.
 */
export function removePdfSectionsFromContainer(container) {
    if (!container) return;
    const sections = container.querySelectorAll?.('.pdf-attachments-section') || [];
    sections.forEach((section) => {
        const pt = section.dataset?.parentType;
        const pid = section.dataset?.parentId;
        if (pt != null && pid != null) {
            mountedPdfSections.delete(`${pt}:${pid}`);
        }
        section.remove();
    });
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
    block.className = 'mt-6 mb-4';
    block.innerHTML = `
      <div class="pdf-draft-section rounded-2xl border border-gray-200/90 bg-gray-50/30 p-4 dark:border-gray-600/70 dark:bg-gray-900/20">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <span class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400" aria-hidden="true">
              <i class="far fa-file-pdf text-base"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">PDF-документы</h3>
              <p class="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">Будут сохранены вместе с закладкой. Только формат PDF.</p>
            </div>
          </div>
          <div class="flex flex-shrink-0 items-center gap-2">
            <input type="file" accept="application/pdf" multiple class="hidden pdf-draft-input" aria-label="Выбрать PDF для черновика закладки">
            <button type="button" class="add-pdf-draft-btn inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 dark:hover:bg-gray-700/80">
              <i class="fas fa-plus text-xs opacity-80" aria-hidden="true"></i>
              <span>Добавить</span>
            </button>
          </div>
        </div>
        <div class="pdf-draft-shell mt-4 min-h-[4rem] rounded-xl border-2 border-dashed border-gray-200/90 bg-white/60 px-1 py-1 dark:border-gray-600/60 dark:bg-gray-800/30"></div>
      </div>`;

    const screenshotsBlock = form
        .querySelector('#bookmarkScreenshotThumbnailsContainer')
        ?.closest('.mb-4');
    if (screenshotsBlock && screenshotsBlock.parentNode) {
        screenshotsBlock.parentNode.insertBefore(block, screenshotsBlock.nextSibling);
    } else {
        form.appendChild(block);
    }

    const draftShell = block.querySelector('.pdf-draft-shell');
    const input = block.querySelector('.pdf-draft-input');
    const btn = block.querySelector('.add-pdf-draft-btn');

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

        if (!draftShell) return;
        draftShell.innerHTML = '';

        if (!files.length) {
            const empty = document.createElement('div');
            empty.className =
                'flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center text-xs text-gray-400 dark:text-gray-500';
            empty.innerHTML =
                '<span class="text-sm font-medium text-gray-500 dark:text-gray-400">Пока нет файлов</span><span>Добавьте PDF — они прикрепятся при сохранении закладки.</span>';
            draftShell.appendChild(empty);
            draftShell.className =
                'pdf-draft-shell mt-4 min-h-[4rem] rounded-xl border-2 border-dashed border-gray-200/90 bg-white/60 px-1 py-1 dark:border-gray-600/60 dark:bg-gray-800/30';
            return;
        }

        draftShell.className =
            'pdf-draft-shell mt-4 min-h-[4rem] rounded-xl border border-gray-200/90 bg-white px-0 py-0 shadow-sm dark:border-gray-600/80 dark:bg-gray-800/40';

        const ul = document.createElement('ul');
        ul.className = 'divide-y divide-gray-100 dark:divide-gray-700/80';
        ul.setAttribute('role', 'list');

        files.forEach((file, idx) => {
            const li = document.createElement('li');
            li.className =
                'flex items-center gap-3 px-3 py-3 sm:px-4 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-700/25';

            const displayName =
                typeof file?.name === 'string' && file.name.trim() ? file.name.trim() : `PDF ${idx + 1}`;
            const sizeLabel = formatPdfSize(file.size || 0);

            const iconWrap = document.createElement('div');
            iconWrap.className =
                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/[0.08] text-red-600 dark:bg-red-400/10 dark:text-red-400';
            iconWrap.setAttribute('aria-hidden', 'true');
            iconWrap.innerHTML = '<i class="far fa-file-pdf"></i>';

            const meta = document.createElement('div');
            meta.className = 'min-w-0 flex-1';
            const nameEl = document.createElement('p');
            nameEl.className = 'truncate text-sm font-medium text-gray-900 dark:text-gray-100';
            nameEl.textContent = displayName;
            nameEl.title = displayName;
            const sizeEl = document.createElement('p');
            sizeEl.className = 'mt-0.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums';
            sizeEl.textContent = sizeLabel;
            meta.appendChild(nameEl);
            meta.appendChild(sizeEl);

            const rmBtn = document.createElement('button');
            rmBtn.type = 'button';
            rmBtn.className =
                'rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:hover:bg-gray-700 dark:hover:text-gray-200';
            rmBtn.setAttribute('aria-label', `Убрать из списка: ${displayName}`);
            rmBtn.innerHTML = '<i class="fas fa-times text-sm" aria-hidden="true"></i>';
            rmBtn.addEventListener('click', () => {
                const curr = Array.from(form._tempPdfFiles || []);
                curr.splice(idx, 1);
                form._tempPdfFiles = curr;
                refreshDraftList();
            });

            li.appendChild(iconWrap);
            li.appendChild(meta);
            li.appendChild(rmBtn);
            ul.appendChild(li);
        });

        draftShell.appendChild(ul);
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

    if (draftShell && !draftShell.dataset.dndWired) {
        draftShell.dataset.dndWired = '1';
        setupPdfDragAndDrop(draftShell, (files) => {
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
    window.removePdfSectionsFromContainer = removePdfSectionsFromContainer;
    window.initPdfAttachmentSystem = initPdfAttachmentSystem;
    window.attachAlgorithmAddPdfHandlers = attachAlgorithmAddPdfHandlers;
    window.attachBookmarkPdfHandlers = attachBookmarkPdfHandlers;
}
