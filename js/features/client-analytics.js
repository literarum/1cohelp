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
    BOOKMARK_CARD_ICON_BUTTON_CLASS,
    BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS,
    CARD_CONTAINER_CLASSES,
    LIST_CONTAINER_CLASSES,
    SECTION_GRID_COLS,
} from '../config.js';
import { escapeHtml } from '../utils/html.js';
import { activateModalFocus, deactivateModalFocus, getVisibleModals } from '../ui/modals-manager.js';
import {
    buildMaxBlacklistLevelByInnMap,
    getBlacklistLevelForClientInn,
    frogBadgeLabelsForLevel,
} from './client-analytics-blacklist-crosscheck.js';

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
 * @param {number} n
 * @returns {string}
 */
export function pluralRuFiles(n) {
    const abs = Math.abs(n);
    const m10 = abs % 10;
    const m100 = abs % 100;
    if (m10 === 1 && m100 !== 11) return `${n} файл`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} файла`;
    return `${n} файлов`;
}

/**
 * Бейдж, подсказка про прокрутку, градиент «есть ещё ниже», aria-label (двойная подсказка к скроллбару).
 * @param {number} fileCount
 */
function updateClientAnalyticsFilesListChrome(fileCount) {
    const listEl = document.getElementById('clientAnalyticsFilesList');
    const outerEl = document.getElementById('clientAnalyticsFilesScrollOuter');
    const hintEl = document.getElementById('clientAnalyticsFilesScrollHint');
    const badgeEl = document.getElementById('clientAnalyticsFilesBadge');
    const sectionEl = document.getElementById('clientAnalyticsFilesSection');
    if (sectionEl && typeof fileCount === 'number' && !Number.isNaN(fileCount)) {
        sectionEl.dataset.fileCount = String(fileCount);
    }
    if (!listEl) return;

    if (!fileCount) {
        if (badgeEl) {
            badgeEl.hidden = true;
            badgeEl.textContent = '';
        }
        if (hintEl) {
            hintEl.hidden = true;
            hintEl.textContent = '';
        }
        if (outerEl) outerEl.classList.remove('client-analytics-files-scroll-outer--clip');
        listEl.classList.remove('client-analytics-files-list--scrollable');
        listEl.removeAttribute('aria-label');
        return;
    }

    const label = pluralRuFiles(fileCount);

    if (badgeEl) {
        badgeEl.hidden = false;
        badgeEl.textContent = label;
    }

    listEl.setAttribute(
        'aria-label',
        `Загруженные текстовые файлы: ${label}. Прокрутите список по вертикали, если строки не помещаются в видимую область.`,
    );

    const apply = () => {
        const clip = listEl.scrollHeight > listEl.clientHeight + 2;
        if (outerEl) outerEl.classList.toggle('client-analytics-files-scroll-outer--clip', clip);
        listEl.classList.toggle('client-analytics-files-list--scrollable', clip);
        if (hintEl) {
            hintEl.hidden = false;
            hintEl.textContent = clip
                ? `В списке ${label}; показана только часть — прокрутите список вниз, чтобы увидеть остальные.`
                : `В списке ${label}.`;
        }
    };

    requestAnimationFrame(() => requestAnimationFrame(apply));
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
/**
 * @param {{ phase: string, percent: number, fileLabel?: string }} state
 */
function updateClientAnalyticsIngestProgress(state) {
    const panel = document.getElementById('clientAnalyticsIngestPanel');
    const bar = document.getElementById('clientAnalyticsIngestBar');
    const phaseEl = document.getElementById('clientAnalyticsIngestPhase');
    const pctEl = document.getElementById('clientAnalyticsIngestPercent');
    if (!panel || !bar || !phaseEl || !pctEl) return;
    const pct = Math.max(0, Math.min(100, Math.round(state.percent)));
    bar.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    pctEl.textContent = `${pct}%`;
    const label = state.fileLabel ? `${state.fileLabel} · ` : '';
    phaseEl.textContent = `${label}${state.phase}`;
}

function setClientAnalyticsIngestPanelVisible(visible) {
    const panel = document.getElementById('clientAnalyticsIngestPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !visible);
    panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/**
 * @param {File} file
 * @param {{ progressFileLabel?: string }} [opts]
 */
export async function ingestTxtFile(file, opts = {}) {
    if (!file || !file.name.toLowerCase().endsWith('.txt')) {
        throw new Error('Ожидается файл .txt');
    }
    if (!State.db) throw new Error('База данных недоступна');

    const fileLabel = opts.progressFileLabel || '';

    updateClientAnalyticsIngestProgress({
        phase: 'Чтение файла из памяти…',
        percent: 5,
        fileLabel,
    });

    const text = await readFileAsTextUtf8(file);
    updateClientAnalyticsIngestProgress({
        phase: 'Проверка целостности (SHA-256)…',
        percent: 15,
        fileLabel,
    });
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

    updateClientAnalyticsIngestProgress({
        phase: 'Сохранение файла в IndexedDB…',
        percent: 25,
        fileLabel,
    });

    const id = await saveToIndexedDB('clientAnalyticsFiles', fileRow);
    const saved = await getFromIndexedDB('clientAnalyticsFiles', id);
    if (!saved || saved.textSha256 !== textSha256) {
        await deleteFromIndexedDB('clientAnalyticsFiles', id);
        throw new Error('Проверка целостности после записи файла не пройдена');
    }

    updateClientAnalyticsIngestProgress({
        phase: 'Разбор текста (ИНН, телефоны, почта)…',
        percent: 40,
        fileLabel,
    });

    const parsed = parseTxtIntoRecords(text, file.name);
    let recordCount = 0;

    try {
        const n = parsed.length || 1;
        for (let i = 0; i < parsed.length; i++) {
            const row = parsed[i];
            updateClientAnalyticsIngestProgress({
                phase: `Сохранение записей и индекс: ${i + 1} / ${parsed.length}`,
                percent: 40 + (55 * (i + 1)) / n,
                fileLabel,
            });
            const rec = {
                sourceFileId: id,
                sourceFileName: file.name,
                uploadedAt,
                inn: row.inn,
                kpp: row.kpp || '',
                phones: row.phones || [],
                phonesJoined: (row.phones || []).join(' '),
                emails: row.emails || [],
                emailsJoined: (row.emails || []).join(' '),
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
                'Не удалось извлечь ИНН (10/12 цифр), КПП (9 цифр), телефон (11 цифр), e-mail или нумерованные обращения вида «1). …». Файл сохранён — проверьте текст и кодировку UTF-8.';
            await saveToIndexedDB('clientAnalyticsFiles', saved);
        }
        updateClientAnalyticsIngestProgress({
            phase: 'Готово',
            percent: 100,
            fileLabel,
        });
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
    'cursor-pointer',
];

const CA_CARD_DELETE_BTN_CLASS = [
    'delete-ca-record',
    'pointer-events-auto',
    BOOKMARK_CARD_ICON_BUTTON_CLASS,
    'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300',
].join(' ');

const CA_LIST_DELETE_BTN_CLASS = [
    'delete-ca-record',
    'pointer-events-auto',
    BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS,
    'text-red-500 hover:text-red-700 dark:text-red-400',
].join(' ');

/**
 * @param {number} level 1|2|3
 * @returns {string}
 */
function frogBlacklistBadgeHtml(level) {
    const { short } = frogBadgeLabelsForLevel(level);
    let badgeCls =
        'bg-green-100 text-green-800 dark:bg-green-800/80 dark:text-green-200';
    if (level === 2) {
        badgeCls =
            'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/80 dark:text-yellow-200';
    }
    if (level === 3) {
        badgeCls = 'bg-red-100 text-red-800 dark:bg-red-800/80 dark:text-red-200';
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${badgeCls}" role="status">${escapeHtml(short)}</span>`;
}

/**
 * @param {object} rec
 * @param {'cards'|'list'} viewMode
 * @param {number} [blacklistLevel] 0 — нет в ЧС, иначе 1|2|3
 * @returns {HTMLElement}
 */
function createRecordCardElement(rec, viewMode, blacklistLevel = 0) {
    const el = document.createElement('article');
    const bl =
        typeof blacklistLevel === 'number' && blacklistLevel >= 1 && blacklistLevel <= 3
            ? blacklistLevel
            : 0;
    const cardClasses = [...CARD_CLASSES];
    if (bl === 1) cardClasses.push('client-analytics-card--frog-l1');
    if (bl === 2) cardClasses.push('client-analytics-card--frog-l2');
    if (bl === 3) cardClasses.push('client-analytics-card--frog-l3');
    el.className = cardClasses.join(' ');
    el.dataset.id = String(rec.id);
    el.dataset.role = 'client-analytics-item';
    if (bl > 0) {
        el.dataset.blacklistLevel = String(bl);
    }
    let title;
    let titlePlain;
    if (rec.inn) {
        title = `ИНН ${escapeHtml(rec.inn)}${rec.kpp ? ` · КПП ${escapeHtml(rec.kpp)}` : ''}`;
        titlePlain = `ИНН ${rec.inn}${rec.kpp ? ` · КПП ${rec.kpp}` : ''}`;
    } else if ((rec.phones || []).length) {
        title = `Тел. ${escapeHtml(rec.phones.join(', '))}${
            rec.kpp ? ` · КПП ${escapeHtml(rec.kpp)}` : ''
        }`;
        titlePlain = `Тел. ${rec.phones.join(', ')}${rec.kpp ? ` · КПП ${rec.kpp}` : ''}`;
    } else if (rec.kpp) {
        title = `КПП ${escapeHtml(rec.kpp)}`;
        titlePlain = `КПП ${rec.kpp}`;
    } else {
        title = 'Запись';
        titlePlain = 'Запись';
    }
    if (bl > 0) {
        el.setAttribute(
            'aria-label',
            `${titlePlain}. ${frogBadgeLabelsForLevel(bl).aria}.`,
        );
    }
    const frogBadge = bl > 0 ? frogBlacklistBadgeHtml(bl) : '';
    const phones = (rec.phones || []).length
        ? escapeHtml(rec.phones.join(', '))
        : '—';
    const emails = (rec.emails || []).length
        ? escapeHtml(rec.emails.join(', '))
        : '—';
    const q = escapeHtml((rec.question || '').slice(0, 280));
    const fn = escapeHtml(rec.sourceFileName || '');
    const delBtn =
        viewMode === 'list'
            ? `<button type="button" class="${CA_LIST_DELETE_BTN_CLASS}" data-id="${rec.id}" title="Удалить запись" aria-label="Удалить запись"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>`
            : `<div class="client-analytics-card-actions absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto" data-role="actions">
  <button type="button" class="${CA_CARD_DELETE_BTN_CLASS}" data-id="${rec.id}" title="Удалить запись" aria-label="Удалить запись"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>
</div>`;
    el.innerHTML =
        viewMode === 'list'
            ? `<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
  <div class="min-w-0 flex-1 pr-2">
    <div class="flex flex-wrap items-center gap-2">
    <h3 class="item-title font-semibold text-gray-900 dark:text-gray-100">${title}</h3>
    ${frogBadge}
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Тел.: ${phones}</p>
    <p class="text-sm text-gray-600 dark:text-gray-400">E-mail: ${emails}</p>
    <p class="text-sm mt-1 line-clamp-2">${q || '—'}</p>
    <p class="text-xs text-gray-500 mt-1">${fn}</p>
  </div>
  <div class="flex gap-2 shrink-0 self-start" data-role="actions">
    ${delBtn}
  </div>
</div>`
            : `${delBtn}
<div class="pr-14">
  <div class="flex flex-wrap items-start gap-2">
  <h3 class="item-title font-semibold text-base text-gray-900 dark:text-gray-100">${title}</h3>
  ${frogBadge}
  </div>
  <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">Тел.: ${phones}</p>
  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">E-mail: ${emails}</p>
  <p class="text-sm mt-2 line-clamp-4">${q || '—'}</p>
  <p class="text-xs text-gray-500 mt-3">${fn}</p>
</div>`;
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
    /** @type {Map<string, number>} */
    let blacklistLevelByInn = new Map();
    if (State.db) {
        try {
            const blEntries = await getAllFromIndexedDB('blacklistedClients');
            blacklistLevelByInn = buildMaxBlacklistLevelByInnMap(blEntries);
        } catch (err) {
            console.warn('[client-analytics] не удалось загрузить чёрный список для перекрёстной сверки', err);
        }
    }
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
            const blLevel = getBlacklistLevelForClientInn(rec.inn, blacklistLevelByInn);
            frag.appendChild(createRecordCardElement(rec, viewMode, blLevel));
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
            updateClientAnalyticsFilesListChrome(0);
        } else {
            filesSectionEl.hidden = false;
            const delFileBtnClass = [
                'delete-ca-file',
                'ml-auto shrink-0 inline-flex items-center justify-center',
                BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS,
                'text-red-500 hover:text-red-700 dark:text-red-400',
            ].join(' ');
            filesListEl.innerHTML = byDate
                .map(
                    (f) =>
                        `<li class="client-analytics-files-row text-sm flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/80 last:border-b-0" data-file-id="${f.id}">
<span class="font-medium min-w-0 flex-1 break-words text-gray-900 dark:text-gray-100">${escapeHtml(f.fileName)}</span>
<span class="text-gray-500 shrink-0">${f.charCount ?? '?'} симв.</span>
<span class="text-xs shrink-0 ${f.parseStatus === 'error' ? 'text-red-600' : 'text-green-600'}">${escapeHtml(f.parseStatus || '')}</span>
<button type="button" class="${delFileBtnClass}" data-file-id="${f.id}" title="Удалить файл" aria-label="Удалить файл"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>
</li>`,
                )
                .join('');
            updateClientAnalyticsFilesListChrome(byDate.length);
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

    deactivateModalFocus(modal);

    const file = await getFromIndexedDB('clientAnalyticsFiles', rec.sourceFileId);
    const rawPreview = file && file.rawText ? file.rawText.slice(0, 8000) : '';

    let frogBannerHtml = '';
    if (State.db && rec.inn) {
        try {
            const blEntries = await getAllFromIndexedDB('blacklistedClients');
            const blMap = buildMaxBlacklistLevelByInnMap(blEntries);
            const dBl = getBlacklistLevelForClientInn(rec.inn, blMap);
            if (dBl > 0) {
                const { short, aria } = frogBadgeLabelsForLevel(dBl);
                const live = dBl === 3 ? 'assertive' : 'polite';
                frogBannerHtml = `
  <div class="client-analytics-frog-banner client-analytics-frog-banner--l${dBl} mx-4 mt-4 mb-0 rounded-lg border px-3 py-2.5 text-sm" role="status" aria-live="${live}">
    <p class="font-semibold m-0">${escapeHtml(short)}</p>
    <p class="m-0 mt-1 opacity-90">${escapeHtml(aria)}</p>
  </div>`;
            }
        } catch (e) {
            console.warn('[client-analytics] сверка с чёрным списком в карточке', e);
        }
    }

    body.innerHTML = `
${frogBannerHtml}
<div class="flex flex-col flex-1 min-h-0">
  <div class="client-analytics-detail-scroll flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 custom-scrollbar">
    <dl class="space-y-2 text-sm">
      <div><dt class="font-semibold text-gray-700 dark:text-gray-300">Пункт в файле</dt><dd>${rec.listItemIndex != null ? escapeHtml(String(rec.listItemIndex)) : '—'}</dd></div>
      <div><dt class="font-semibold text-gray-700 dark:text-gray-300">ИНН</dt><dd>${escapeHtml(rec.inn || '—')}</dd></div>
      <div><dt class="font-semibold">КПП</dt><dd>${escapeHtml(rec.kpp || '—')}</dd></div>
      <div><dt class="font-semibold">Телефоны</dt><dd>${escapeHtml((rec.phones || []).join(', ') || '—')}</dd></div>
      <div><dt class="font-semibold">E-mail</dt><dd>${escapeHtml((rec.emails || []).join(', ') || '—')}</dd></div>
      <div><dt class="font-semibold">Вопрос / суть</dt><dd class="whitespace-pre-wrap">${escapeHtml(rec.question || '—')}</dd></div>
      <div><dt class="font-semibold">Файл</dt><dd>${escapeHtml(rec.sourceFileName || '')} (id ${rec.sourceFileId})</dd></div>
    </dl>
    <details class="mt-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40">
      <summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-800 dark:text-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">Исходный текст (начало файла)</summary>
      <div class="px-3 pb-3 pt-0">
        <div class="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap text-gray-800 dark:text-gray-200">${escapeHtml(rawPreview)}</div>
      </div>
    </details>
  </div>
  <div class="client-analytics-detail-footer flex-shrink-0 flex justify-end px-4 pb-4 pt-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
    <button type="button" id="clientAnalyticsDeleteRecordBtn" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800" title="Удалить запись" aria-label="Удалить запись">Удалить запись</button>
  </div>
</div>`;

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden', 'modal-open');
    activateModalFocus(modal);

    const delBtn = document.getElementById('clientAnalyticsDeleteRecordBtn');
    if (delBtn) {
        delBtn.onclick = async () => {
            await deleteAnalyticsRecord(recordId);
            closeClientAnalyticsDetailModal();
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
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    deactivateModalFocus(modal);
    requestAnimationFrame(() => {
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('overflow-hidden', 'modal-open');
        }
    });
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

    const filesListForResize = document.getElementById('clientAnalyticsFilesList');
    if (filesListForResize && typeof ResizeObserver !== 'undefined' && !filesListForResize._caResizeBound) {
        filesListForResize._caResizeBound = true;
        const ro = new ResizeObserver(() => {
            const sec = document.getElementById('clientAnalyticsFilesSection');
            if (!sec || sec.hidden) return;
            const n = parseInt(sec.dataset.fileCount || '0', 10);
            if (n > 0) updateClientAnalyticsFilesListChrome(n);
        });
        ro.observe(filesListForResize);
    }

    const input = document.getElementById('clientAnalyticsFileInput');
    if (input) {
        input.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || !files.length) return;
            const total = files.length;
            setClientAnalyticsIngestPanelVisible(true);
            for (let fi = 0; fi < total; fi++) {
                const file = files[fi];
                const progressFileLabel = total > 1 ? `Файл ${fi + 1} из ${total}` : '';
                try {
                    const { recordCount } = await ingestTxtFile(file, { progressFileLabel });
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
            setClientAnalyticsIngestPanelVisible(false);
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
        const delRec = e.target.closest('.delete-ca-record');
        if (delRec && delRec.dataset.id) {
            e.stopPropagation();
            const rid = parseInt(delRec.dataset.id, 10);
            (async () => {
                await deleteAnalyticsRecord(rid);
                if (deps.showNotification) deps.showNotification('Запись удалена', 'success');
                await renderClientAnalyticsPage();
            })();
            return;
        }
        const card = e.target.closest('.client-analytics-card');
        if (card && card.dataset.id && !e.target.closest('a[href]')) {
            showClientAnalyticsDetailModal(parseInt(card.dataset.id, 10));
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
}
