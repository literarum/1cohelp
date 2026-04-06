'use strict';

/**
 * Раздел «База клиентов и аналитика»: загрузка .txt, разбор, отдельные хранилища IndexedDB,
 * индексация в общем поиске, экспорт/импорт только раздела.
 */

import { State } from '../app/state.js';
import {
    getAllFromIndexedDB,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
} from '../db/indexeddb.js';
import { parseTxtIntoRecords } from './client-analytics-parse.js';
import {
    CARD_CONTAINER_CLASSES,
    LIST_CONTAINER_CLASSES,
    SECTION_GRID_COLS,
} from '../config.js';
import { escapeHtml } from '../utils/html.js';

let deps = {
    showNotification: null,
    updateSearchIndex: null,
    applyCurrentView: null,
};

/**
 * @param {Object} d
 */
export function setClientAnalyticsDependencies(d) {
    deps = { ...deps, ...d };
}

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256HexUtf8(text) {
    const enc = new TextEncoder();
    const buf = enc.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsTextUtf8(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ''));
        r.onerror = () => reject(r.error || new Error('FileReader error'));
        r.readAsText(file, 'UTF-8');
    });
}

/**
 * Удаляет записи раздела, относящиеся к файлу, и снимает их с поискового индекса.
 * @param {number} sourceFileId
 */
async function deleteRecordsForFile(sourceFileId) {
    const all = await getAllFromIndexedDB('clientAnalyticsRecords');
    const toDel = all.filter((r) => r && r.sourceFileId === sourceFileId);
    for (const rec of toDel) {
        if (deps.updateSearchIndex) {
            await deps.updateSearchIndex(
                'clientAnalyticsRecords',
                rec.id,
                null,
                'delete',
                rec,
            );
        }
        await deleteFromIndexedDB('clientAnalyticsRecords', rec.id);
    }
}

/**
 * @param {File} file
 * @returns {Promise<{ fileId: number, recordCount: number }>}
 */
export async function ingestTxtFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.txt')) {
        throw new Error('Ожидается файл .txt');
    }
    if (!State.db) throw new Error('База данных недоступна');

    const text = await readFileAsTextUtf8(file);
    const textSha256 = await sha256HexUtf8(text);
    const uploadedAt = new Date().toISOString();

    const fileRow = {
        fileName: file.name,
        uploadedAt,
        textSha256,
        charCount: text.length,
        parseStatus: 'ok',
        parseError: null,
        rawText: text,
    };

    const id = await saveToIndexedDB('clientAnalyticsFiles', fileRow);
    const saved = await getFromIndexedDB('clientAnalyticsFiles', id);
    if (!saved || saved.textSha256 !== textSha256) {
        await deleteFromIndexedDB('clientAnalyticsFiles', id);
        throw new Error('Проверка целостности после записи файла не пройдена');
    }

    const parsed = parseTxtIntoRecords(text, file.name);
    let recordCount = 0;

    try {
        for (const row of parsed) {
            const rec = {
                sourceFileId: id,
                sourceFileName: file.name,
                uploadedAt,
                inn: row.inn,
                kpp: row.kpp || '',
                phones: row.phones || [],
                phonesJoined: (row.phones || []).join(' '),
                question: row.question || '',
                contextSnippet: row.contextSnippet || '',
                confidence: row.confidence || 'medium',
            };
            if (row.listItemIndex != null && Number.isFinite(row.listItemIndex)) {
                rec.listItemIndex = row.listItemIndex;
            }
            const rid = await saveToIndexedDB('clientAnalyticsRecords', rec);
            const again = await getFromIndexedDB('clientAnalyticsRecords', rid);
            if (again && deps.updateSearchIndex) {
                await deps.updateSearchIndex(
                    'clientAnalyticsRecords',
                    rid,
                    again,
                    'add',
                    null,
                );
            }
            recordCount++;
        }
        if (parsed.length === 0) {
            saved.parseStatus = 'ok';
            saved.parseError =
                'Не удалось извлечь ИНН (10/12 цифр), КПП (9 цифр), телефон (11 цифр) или нумерованные обращения вида «1). …». Файл сохранён — проверьте текст и кодировку UTF-8.';
            await saveToIndexedDB('clientAnalyticsFiles', saved);
        }
    } catch (e) {
        saved.parseStatus = 'error';
        saved.parseError = e?.message || String(e);
        await saveToIndexedDB('clientAnalyticsFiles', saved);
        throw e;
    }

    return { fileId: id, recordCount };
}

/**
 * @param {number} fileId
 */
export async function deleteAnalyticsFile(fileId) {
    await deleteRecordsForFile(fileId);
    await deleteFromIndexedDB('clientAnalyticsFiles', fileId);
}

/**
 * @param {number} recordId
 */
export async function deleteAnalyticsRecord(recordId) {
    const rec = await getFromIndexedDB('clientAnalyticsRecords', recordId);
    if (!rec) return;
    if (deps.updateSearchIndex) {
        await deps.updateSearchIndex('clientAnalyticsRecords', recordId, null, 'delete', rec);
    }
    await deleteFromIndexedDB('clientAnalyticsRecords', recordId);
}

/**
 * @returns {Promise<object>}
 */
export async function exportClientAnalyticsSection() {
    const files = await getAllFromIndexedDB('clientAnalyticsFiles');
    const records = await getAllFromIndexedDB('clientAnalyticsRecords');
    return {
        exportKind: 'clientAnalyticsSection',
        exportDate: new Date().toISOString(),
        files,
        records,
    };
}

/**
 * @param {object} data
 */
export async function importClientAnalyticsSection(data) {
    if (!data || data.exportKind !== 'clientAnalyticsSection') {
        throw new Error('Неверный формат файла раздела');
    }
    if (!State.db) throw new Error('База данных недоступна');

    const files = Array.isArray(data.files) ? data.files : [];
    const records = Array.isArray(data.records) ? data.records : [];

    const existing = await getAllFromIndexedDB('clientAnalyticsRecords');
    for (const r of existing) {
        if (deps.updateSearchIndex) {
            await deps.updateSearchIndex('clientAnalyticsRecords', r.id, null, 'delete', r);
        }
        await deleteFromIndexedDB('clientAnalyticsRecords', r.id);
    }
    const existingFiles = await getAllFromIndexedDB('clientAnalyticsFiles');
    for (const f of existingFiles) {
        await deleteFromIndexedDB('clientAnalyticsFiles', f.id);
    }

    const idMap = new Map();
    for (const f of files) {
        const oldId = f.id;
        const copy = { ...f };
        delete copy.id;
        const newId = await saveToIndexedDB('clientAnalyticsFiles', copy);
        if (oldId != null) idMap.set(oldId, newId);
    }

    for (const r of records) {
        const copy = { ...r };
        delete copy.id;
        const sid = copy.sourceFileId;
        if (sid != null && idMap.has(sid)) {
            copy.sourceFileId = idMap.get(sid);
        }
        const nid = await saveToIndexedDB('clientAnalyticsRecords', copy);
        const saved = await getFromIndexedDB('clientAnalyticsRecords', nid);
        if (saved && deps.updateSearchIndex) {
            await deps.updateSearchIndex('clientAnalyticsRecords', nid, saved, 'add', null);
        }
    }
}

const CARD_CLASSES = [
    'client-analytics-card',
    'view-item',
    'group',
    'relative',
    'rounded-lg',
    'border',
    'border-gray-200',
    'dark:border-gray-600',
    'p-4',
    'shadow-sm',
    'hover:shadow-md',
    'transition-shadow',
];

/**
 * @param {object} rec
 * @param {'cards'|'list'} viewMode
 * @returns {HTMLElement}
 */
function createRecordCardElement(rec, viewMode) {
    const el = document.createElement('article');
    el.className = CARD_CLASSES.join(' ');
    el.dataset.id = String(rec.id);
    el.dataset.role = 'client-analytics-item';
    const idxPrefix =
        rec.listItemIndex != null && Number.isFinite(rec.listItemIndex)
            ? `п.${rec.listItemIndex} · `
            : '';
    let title;
    if (rec.inn) {
        title = `${idxPrefix}ИНН ${escapeHtml(rec.inn)}${rec.kpp ? ` · КПП ${escapeHtml(rec.kpp)}` : ''}`;
    } else if ((rec.phones || []).length) {
        title = `${idxPrefix}Тел. ${escapeHtml(rec.phones.join(', '))}${
            rec.kpp ? ` · КПП ${escapeHtml(rec.kpp)}` : ''
        }`;
    } else if (rec.kpp) {
        title = `${idxPrefix}КПП ${escapeHtml(rec.kpp)}`;
    } else {
        title = `${idxPrefix}Запись`;
    }
    const phones = (rec.phones || []).length
        ? escapeHtml(rec.phones.join(', '))
        : '—';
    const q = escapeHtml((rec.question || '').slice(0, 280));
    const fn = escapeHtml(rec.sourceFileName || '');
    el.innerHTML =
        viewMode === 'list'
            ? `<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
  <div class="min-w-0 flex-1">
    <h3 class="item-title font-semibold text-gray-900 dark:text-gray-100">${title}</h3>
    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Тел.: ${phones}</p>
    <p class="text-sm mt-1 line-clamp-2">${q || '—'}</p>
    <p class="text-xs text-gray-500 mt-1">${fn}</p>
  </div>
  <div class="flex gap-2 shrink-0" data-role="actions">
    <button type="button" class="px-2 py-1 text-sm rounded bg-gray-200 dark:bg-gray-600 open-ca-detail" data-id="${rec.id}">Подробнее</button>
  </div>
</div>`
            : `<div class="flex justify-between items-start gap-2">
  <h3 class="item-title font-semibold text-base text-gray-900 dark:text-gray-100">${title}</h3>
  <button type="button" class="text-sm px-2 py-1 rounded bg-primary text-white open-ca-detail" data-id="${rec.id}">Открыть</button>
</div>
<p class="text-sm text-gray-600 dark:text-gray-400 mt-2">Тел.: ${phones}</p>
<p class="text-sm mt-2 line-clamp-4">${q || '—'}</p>
<p class="text-xs text-gray-500 mt-3">${fn}</p>`;
    return el;
}

/**
 * Рендер списка записей и метаданных файлов.
 */
export async function renderClientAnalyticsPage() {
    const container = document.getElementById('clientAnalyticsContainer');
    const filesListEl = document.getElementById('clientAnalyticsFilesList');
    const filesSectionEl = document.getElementById('clientAnalyticsFilesSection');
    if (!container) return;

    const records = await getAllFromIndexedDB('clientAnalyticsRecords');
    const sorted = records
        .filter((r) => r && r.id != null)
        .sort((a, b) => {
            const ta = new Date(a.uploadedAt || 0).getTime();
            const tb = new Date(b.uploadedAt || 0).getTime();
            return tb - ta;
        });

    const viewMode =
        (State.viewPreferences && State.viewPreferences['clientAnalyticsContainer']) ||
        container.dataset.defaultView ||
        'cards';

    container.innerHTML = '';
    container.className =
        viewMode === 'cards' ? CARD_CONTAINER_CLASSES.join(' ') : LIST_CONTAINER_CLASSES.join(' ');
    if (viewMode === 'cards') {
        const gridCols = SECTION_GRID_COLS.clientAnalyticsContainer || SECTION_GRID_COLS.default;
        gridCols.forEach((c) => container.classList.add(c));
        container.classList.add('gap-4', 'auto-rows-fr');
    }

    if (sorted.length === 0) {
        container.innerHTML =
            '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full py-6">Записей пока нет. Загрузите один или несколько .txt файлов выше.</p>';
    } else {
        const frag = document.createDocumentFragment();
        for (const rec of sorted) {
            frag.appendChild(createRecordCardElement(rec, viewMode));
        }
        container.appendChild(frag);
    }

    if (typeof deps.applyCurrentView === 'function') {
        deps.applyCurrentView('clientAnalyticsContainer');
    } else if (typeof window.applyCurrentView === 'function') {
        window.applyCurrentView('clientAnalyticsContainer');
    }

    if (filesListEl && filesSectionEl) {
        const files = await getAllFromIndexedDB('clientAnalyticsFiles');
        const byDate = files
            .filter(Boolean)
            .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
        if (byDate.length === 0) {
            filesListEl.innerHTML = '';
            filesSectionEl.hidden = true;
        } else {
            filesSectionEl.hidden = false;
            filesListEl.innerHTML = byDate
                .map(
                    (f) =>
                        `<li class="text-sm flex flex-wrap items-center gap-2 py-1 border-b border-gray-200 dark:border-gray-600" data-file-id="${f.id}">
<span class="font-medium truncate max-w-[200px]" title="${escapeHtml(f.fileName)}">${escapeHtml(f.fileName)}</span>
<span class="text-gray-500">${f.charCount ?? '?'} симв.</span>
<span class="text-xs ${f.parseStatus === 'error' ? 'text-red-600' : 'text-green-600'}">${escapeHtml(f.parseStatus || '')}</span>
<button type="button" class="ml-auto text-red-600 hover:underline text-xs delete-ca-file" data-file-id="${f.id}">Удалить файл</button>
</li>`,
                )
                .join('');
        }
    }
}

/**
 * Показ модального окна с полными полями записи.
 * @param {number} recordId
 */
export async function showClientAnalyticsDetailModal(recordId) {
    const rec = await getFromIndexedDB('clientAnalyticsRecords', recordId);
    if (!rec) return;
    const modal = document.getElementById('clientAnalyticsDetailModal');
    const body = document.getElementById('clientAnalyticsDetailBody');
    if (!modal || !body) return;

    const file = await getFromIndexedDB('clientAnalyticsFiles', rec.sourceFileId);
    const rawPreview = file && file.rawText ? file.rawText.slice(0, 8000) : '';

    body.innerHTML = `
<dl class="space-y-2 text-sm">
  <div><dt class="font-semibold text-gray-700 dark:text-gray-300">Пункт в файле</dt><dd>${rec.listItemIndex != null ? escapeHtml(String(rec.listItemIndex)) : '—'}</dd></div>
  <div><dt class="font-semibold text-gray-700 dark:text-gray-300">ИНН</dt><dd>${escapeHtml(rec.inn || '—')}</dd></div>
  <div><dt class="font-semibold">КПП</dt><dd>${escapeHtml(rec.kpp || '—')}</dd></div>
  <div><dt class="font-semibold">Телефоны</dt><dd>${escapeHtml((rec.phones || []).join(', ') || '—')}</dd></div>
  <div><dt class="font-semibold">Вопрос / суть</dt><dd class="whitespace-pre-wrap">${escapeHtml(rec.question || '—')}</dd></div>
  <div><dt class="font-semibold">Фрагмент</dt><dd class="whitespace-pre-wrap text-gray-600 dark:text-gray-400">${escapeHtml(rec.contextSnippet || '')}</dd></div>
  <div><dt class="font-semibold">Файл</dt><dd>${escapeHtml(rec.sourceFileName || '')} (id ${rec.sourceFileId})</dd></div>
  <div><dt class="font-semibold">Достоверность разбора</dt><dd>${escapeHtml(rec.confidence || '')}</dd></div>
  <div><dt class="font-semibold">Исходный текст (начало файла)</dt><dd class="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs max-h-48 overflow-y-auto whitespace-pre-wrap">${escapeHtml(rawPreview)}</dd></div>
</dl>
<div class="mt-4 flex gap-2">
  <button type="button" id="clientAnalyticsDeleteRecordBtn" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm">Удалить запись</button>
</div>`;

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    const delBtn = document.getElementById('clientAnalyticsDeleteRecordBtn');
    if (delBtn) {
        delBtn.onclick = async () => {
            await deleteAnalyticsRecord(recordId);
            modal.classList.add('hidden');
            if (deps.showNotification) deps.showNotification('Запись удалена', 'success');
            await renderClientAnalyticsPage();
        };
    }
}

/**
 * Закрытие модального окна деталей.
 */
export function closeClientAnalyticsDetailModal() {
    const modal = document.getElementById('clientAnalyticsDetailModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
}

let _handlersBound = false;

/**
 * Вызывается из цепочки app-init после установки зависимостей.
 */
export function initClientAnalyticsSystem() {
    initClientAnalyticsUi();
}

/**
 * Инициализация обработчиков UI (один раз).
 */
export function initClientAnalyticsUi() {
    if (_handlersBound) return;
    _handlersBound = true;

    const input = document.getElementById('clientAnalyticsFileInput');
    if (input) {
        input.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || !files.length) return;
            for (const file of files) {
                try {
                    const { recordCount } = await ingestTxtFile(file);
                    if (deps.showNotification) {
                        deps.showNotification(
                            `Файл «${file.name}»: сохранено, извлечено записей: ${recordCount}`,
                            'success',
                        );
                    }
                } catch (err) {
                    console.error(err);
                    if (deps.showNotification) {
                        deps.showNotification(err?.message || String(err), 'error');
                    }
                }
            }
            input.value = '';
            await renderClientAnalyticsPage();
        });
    }

    const exportBtn = document.getElementById('clientAnalyticsExportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const data = await exportClientAnalyticsSection();
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json;charset=utf-8',
                });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `client-analytics-export-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                if (deps.showNotification) deps.showNotification('Экспорт раздела сохранён', 'success');
            } catch (err) {
                if (deps.showNotification) deps.showNotification(String(err?.message || err), 'error');
            }
        });
    }

    const importInput = document.getElementById('clientAnalyticsImportInput');
    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            try {
                const text = await readFileAsTextUtf8(f);
                const data = JSON.parse(text);
                await importClientAnalyticsSection(data);
                if (deps.showNotification) {
                    deps.showNotification('Данные раздела импортированы', 'success');
                }
            } catch (err) {
                console.error(err);
                if (deps.showNotification) {
                    deps.showNotification(err?.message || String(err), 'error');
                }
            }
            importInput.value = '';
            await renderClientAnalyticsPage();
        });
    }

    document.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.open-ca-detail');
        if (openBtn && openBtn.dataset.id) {
            showClientAnalyticsDetailModal(parseInt(openBtn.dataset.id, 10));
            return;
        }
        const delFile = e.target.closest('.delete-ca-file');
        if (delFile && delFile.dataset.fileId) {
            const fid = parseInt(delFile.dataset.fileId, 10);
            (async () => {
                await deleteAnalyticsFile(fid);
                if (deps.showNotification) deps.showNotification('Файл и связанные записи удалены', 'info');
                await renderClientAnalyticsPage();
            })();
        }
    });

    const closeBtn = document.getElementById('clientAnalyticsDetailCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeClientAnalyticsDetailModal);
    }

    const detailModal = document.getElementById('clientAnalyticsDetailModal');
    if (detailModal) {
        detailModal.addEventListener('click', (e) => {
            if (e.target === detailModal) closeClientAnalyticsDetailModal();
        });
    }
}
