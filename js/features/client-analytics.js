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
    normalizeInnForBlacklistLookup,
} from './client-analytics-blacklist-crosscheck.js';
import { NavigationSource } from './contextual-back-navigation.js';
import {
    buildDisplayUnitsFromGrouped,
    sortClientAnalyticsDisplayUnits,
    filterUnitsByFolder,
    filterUnitsByTagsAny,
    groupClientAnalyticsUnitsForRender,
    getClientAnalyticsUnitMetaId,
    normalizeClientAnalyticsCardMeta,
    CA_FOLDER_FILTER_ALL,
    CA_FOLDER_FILTER_UNFILED,
} from './client-analytics-organization.js';

/** @typedef {import('./client-analytics-organization.js').CaSortMode} CaSortMode */
/** @typedef {import('./client-analytics-organization.js').CaGroupMode} CaGroupMode */

const CA_ORG_VIEW_PREF_ID = 'clientAnalyticsOrgView';

let deps = {
    showNotification: null,
    updateSearchIndex: null,
    applyCurrentView: null,
};

let clientAnalyticsSearchQuery = '';
let clientAnalyticsFilesCollapsed = true;

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
 * @param {number} n
 * @returns {string}
 */
export function pluralRuAppeals(n) {
    const abs = Math.abs(n);
    const m10 = abs % 10;
    const m100 = abs % 100;
    if (m10 === 1 && m100 !== 11) return `${n} обращение`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} обращения`;
    return `${n} обращений`;
}

/**
 * Одна карточка в списке на каждый нормализованный ИНН; записи без извлекаемого ИНН — по одной карточке.
 *
 * @param {object[]} records
 * @returns {{ innStacks: Array<{ innKey: string, records: object[] }>, noInnRecords: object[] }}
 */
export function groupClientAnalyticsRecordsForDisplay(records) {
    const innStacks = new Map();
    const noInnRecords = [];
    const list = Array.isArray(records) ? records.filter((r) => r && r.id != null) : [];
    for (const r of list) {
        const innKey = normalizeInnForBlacklistLookup(r.inn);
        if (!innKey) {
            noInnRecords.push(r);
            continue;
        }
        if (!innStacks.has(innKey)) innStacks.set(innKey, []);
        innStacks.get(innKey).push(r);
    }
    const sortByUploadedDesc = (a, b) =>
        new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
    for (const arr of innStacks.values()) {
        arr.sort(sortByUploadedDesc);
    }
    noInnRecords.sort(sortByUploadedDesc);
    const stacks = [...innStacks.entries()].map(([innKey, recs]) => ({ innKey, records: recs }));
    stacks.sort((a, b) => {
        const ta = new Date(a.records[0]?.uploadedAt || 0).getTime();
        const tb = new Date(b.records[0]?.uploadedAt || 0).getTime();
        return tb - ta;
    });
    return { innStacks: stacks, noInnRecords };
}

function normalizeSearchText(value) {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildClientAnalyticsSearchIndexLine(record) {
    if (!record || typeof record !== 'object') return '';
    const chunks = [
        record.inn,
        record.kpp,
        Array.isArray(record.phones) ? record.phones.join(' ') : record.phones,
        Array.isArray(record.emails) ? record.emails.join(' ') : record.emails,
        record.question,
        record.contextSnippet,
        record.sourceFileName,
        record.uploadedAt,
        record.confidence,
        record.listItemIndex != null ? String(record.listItemIndex) : '',
    ];
    return normalizeSearchText(chunks.filter(Boolean).join(' '));
}

export function filterClientAnalyticsRecordsByQuery(records, query) {
    const prepared = Array.isArray(records) ? records : [];
    const q = normalizeSearchText(query);
    if (!q) return prepared;
    const tokens = q.split(' ').filter(Boolean);
    if (!tokens.length) return prepared;
    return prepared.filter((record) => {
        const line = buildClientAnalyticsSearchIndexLine(record);
        return tokens.every((token) => line.includes(token));
    });
}

/**
 * @param {unknown} hex
 * @returns {string}
 */
function sanitizeClientAnalyticsTagColor(hex) {
    const s = String(hex || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : '';
}

/**
 * @param {import('./client-analytics-organization.js').CaCardMeta} meta
 * @param {Map<number, object>} foldersById
 * @param {Map<number, object>} tagsById
 * @returns {string}
 */
function buildClientAnalyticsMetaChipsHtml(meta, foldersById, tagsById) {
    const parts = [];
    const m = normalizeClientAnalyticsCardMeta(meta);
    if (m.folderId != null && foldersById.has(m.folderId)) {
        const name = String(foldersById.get(m.folderId).name || 'Папка');
        parts.push(
            `<span class="ca-meta-chip ca-meta-chip--folder">${escapeHtml(name)}</span>`,
        );
    }
    for (const tid of m.tagIds || []) {
        if (!tagsById.has(tid)) continue;
        const t = tagsById.get(tid);
        const col = sanitizeClientAnalyticsTagColor(t.color);
        const style = col ? ` style="border-color:${escapeHtml(col)}"` : '';
        parts.push(
            `<span class="ca-meta-chip ca-meta-chip--tag"${style}>${escapeHtml(String(t.name || ''))}</span>`,
        );
    }
    return parts.join('');
}

/**
 * @param {unknown} pref
 * @returns {{ sortMode: CaSortMode, groupMode: CaGroupMode, folderFilter: string, tagFilterIds: number[] }}
 */
function normalizeClientAnalyticsOrgViewPref(pref) {
    const base = {
        sortMode: /** @type {CaSortMode} */ ('date_desc'),
        groupMode: /** @type {CaGroupMode} */ ('none'),
        folderFilter: CA_FOLDER_FILTER_ALL,
        tagFilterIds: /** @type {number[]} */ ([]),
    };
    if (!pref || typeof pref !== 'object') return base;
    const sortRaw = pref.sortMode;
    const groupRaw = pref.groupMode;
    const allowedSort = new Set([
        'date_desc',
        'date_asc',
        'inn_asc',
        'appeals_desc',
        'file_asc',
        'question_asc',
    ]);
    const allowedGroup = new Set(['none', 'folder', 'tag', 'source_file']);
    if (typeof sortRaw === 'string' && allowedSort.has(sortRaw)) {
        base.sortMode = /** @type {CaSortMode} */ (sortRaw);
    }
    if (typeof groupRaw === 'string' && allowedGroup.has(groupRaw)) {
        base.groupMode = /** @type {CaGroupMode} */ (groupRaw);
    }
    if (pref.folderFilter === CA_FOLDER_FILTER_ALL || pref.folderFilter === CA_FOLDER_FILTER_UNFILED) {
        base.folderFilter = pref.folderFilter;
    } else if (pref.folderFilter != null && Number.isFinite(Number(pref.folderFilter))) {
        base.folderFilter = String(Number(pref.folderFilter));
    }
    const tf = pref.tagFilterIds;
    if (Array.isArray(tf)) {
        base.tagFilterIds = [...new Set(tf.map((n) => Number(n)).filter((n) => Number.isFinite(n)))].sort(
            (a, b) => a - b,
        );
    }
    return base;
}

/**
 * @param {{ folderFilter: string }} view
 * @param {Map<number, object>} foldersById
 */
function coerceClientAnalyticsOrgFolderFilter(view, foldersById) {
    const f = view.folderFilter;
    if (f === CA_FOLDER_FILTER_ALL || f === CA_FOLDER_FILTER_UNFILED) return;
    const n = Number(f);
    if (!Number.isFinite(n) || !foldersById.has(n)) {
        view.folderFilter = CA_FOLDER_FILTER_ALL;
    }
}

/**
 * @returns {Promise<{ folders: object[], tags: object[], metaById: Map<string, import('./client-analytics-organization.js').CaCardMeta>, foldersById: Map<number, object>, tagsById: Map<number, object>, view: ReturnType<typeof normalizeClientAnalyticsOrgViewPref> }>}
 */
async function loadClientAnalyticsOrgState() {
    const [foldersRaw, tagsRaw, metaRows, prefRow] = await Promise.all([
        getAllFromIndexedDB('clientAnalyticsFolders'),
        getAllFromIndexedDB('clientAnalyticsTags'),
        getAllFromIndexedDB('clientAnalyticsCardMeta'),
        getFromIndexedDB('preferences', CA_ORG_VIEW_PREF_ID),
    ]);
    const folders = Array.isArray(foldersRaw) ? foldersRaw.filter(Boolean) : [];
    const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : [];
    /** @type {Map<string, import('./client-analytics-organization.js').CaCardMeta>} */
    const metaById = new Map();
    for (const row of Array.isArray(metaRows) ? metaRows : []) {
        if (row && row.id) {
            metaById.set(String(row.id), normalizeClientAnalyticsCardMeta(row));
        }
    }
    const foldersById = new Map(folders.map((f) => [Number(f.id), f]));
    const tagsById = new Map(tags.map((t) => [Number(t.id), t]));
    const prefPayload =
        prefRow && typeof prefRow === 'object' && prefRow.data && typeof prefRow.data === 'object'
            ? prefRow.data
            : prefRow;
    const view = normalizeClientAnalyticsOrgViewPref(prefPayload);
    coerceClientAnalyticsOrgFolderFilter(view, foldersById);
    view.tagFilterIds = (view.tagFilterIds || []).filter((id) => tagsById.has(id));
    return { folders, tags, metaById, foldersById, tagsById, view };
}

/**
 * @param {ReturnType<typeof normalizeClientAnalyticsOrgViewPref>} view
 */
async function saveClientAnalyticsOrgViewPref(view) {
    await saveToIndexedDB('preferences', {
        id: CA_ORG_VIEW_PREF_ID,
        data: { ...view },
    });
    const again = await getFromIndexedDB('preferences', CA_ORG_VIEW_PREF_ID);
    const payload = again?.data && typeof again.data === 'object' ? again.data : again;
    if (!payload || typeof payload !== 'object') {
        console.warn('[client-analytics] не удалось перепроверить сохранение настроек вида');
    }
}

/**
 * @param {string} metaId
 * @param {import('./client-analytics-organization.js').CaCardMeta} meta
 */
async function persistClientAnalyticsCardMeta(metaId, meta) {
    const normalized = normalizeClientAnalyticsCardMeta(meta);
    const row = { id: metaId, folderId: normalized.folderId, tagIds: normalized.tagIds };
    await saveToIndexedDB('clientAnalyticsCardMeta', row);
    const read = await getFromIndexedDB('clientAnalyticsCardMeta', metaId);
    if (!read || read.folderId !== row.folderId || JSON.stringify(read.tagIds) !== JSON.stringify(row.tagIds)) {
        console.warn('[client-analytics] перепроверка clientAnalyticsCardMeta не совпала', metaId);
    }
}

/**
 * @param {number} folderId
 */
async function deleteClientAnalyticsFolderCascade(folderId) {
    const id = Number(folderId);
    if (!Number.isFinite(id)) return;
    const allMeta = await getAllFromIndexedDB('clientAnalyticsCardMeta');
    for (const row of Array.isArray(allMeta) ? allMeta : []) {
        if (!row || row.id == null) continue;
        const m = normalizeClientAnalyticsCardMeta(row);
        if (m.folderId === id) {
            await persistClientAnalyticsCardMeta(String(row.id), { folderId: null, tagIds: m.tagIds });
        }
    }
    await deleteFromIndexedDB('clientAnalyticsFolders', id);
}

/**
 * @param {number} tagId
 */
async function deleteClientAnalyticsTagCascade(tagId) {
    const id = Number(tagId);
    if (!Number.isFinite(id)) return;
    const allMeta = await getAllFromIndexedDB('clientAnalyticsCardMeta');
    for (const row of Array.isArray(allMeta) ? allMeta : []) {
        if (!row || row.id == null) continue;
        const m = normalizeClientAnalyticsCardMeta(row);
        if (!m.tagIds.includes(id)) continue;
        const next = m.tagIds.filter((t) => t !== id);
        await persistClientAnalyticsCardMeta(String(row.id), { folderId: m.folderId, tagIds: next });
    }
    await deleteFromIndexedDB('clientAnalyticsTags', id);
}

/**
 * @param {object[]} folders
 * @param {object[]} tags
 * @param {ReturnType<typeof normalizeClientAnalyticsOrgViewPref>} view
 */
function syncClientAnalyticsOrgToolbarDom(folders, tags, view) {
    const sortEl = document.getElementById('clientAnalyticsSortSelect');
    const groupEl = document.getElementById('clientAnalyticsGroupSelect');
    const folderEl = document.getElementById('clientAnalyticsFolderFilterSelect');
    const tagBar = document.getElementById('clientAnalyticsTagFilterBar');
    if (sortEl) sortEl.value = view.sortMode;
    if (groupEl) groupEl.value = view.groupMode;
    if (folderEl) {
        folderEl.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = CA_FOLDER_FILTER_ALL;
        optAll.textContent = 'Все карточки';
        folderEl.appendChild(optAll);
        const optUn = document.createElement('option');
        optUn.value = CA_FOLDER_FILTER_UNFILED;
        optUn.textContent = 'Без папки';
        folderEl.appendChild(optUn);
        const sorted = [...folders].sort((a, b) => {
            const ao = Number(a.sortOrder) || 0;
            const bo = Number(b.sortOrder) || 0;
            if (ao !== bo) return ao - bo;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        });
        for (const f of sorted) {
            const o = document.createElement('option');
            o.value = String(f.id);
            o.textContent = String(f.name || 'Папка');
            folderEl.appendChild(o);
        }
        const want = [CA_FOLDER_FILTER_ALL, CA_FOLDER_FILTER_UNFILED].includes(view.folderFilter)
            ? view.folderFilter
            : String(view.folderFilter);
        const valid = Array.from(folderEl.options).some((o) => o.value === want);
        folderEl.value = valid ? want : CA_FOLDER_FILTER_ALL;
        if (!valid && view.folderFilter !== CA_FOLDER_FILTER_ALL) {
            view.folderFilter = CA_FOLDER_FILTER_ALL;
        }
    }
    if (tagBar) {
        tagBar.innerHTML =
            '<span class="text-xs text-gray-500 dark:text-gray-400 mr-1 shrink-0">Теги:</span>';
        const sortedTags = [...tags].sort((a, b) => {
            const ao = Number(a.sortOrder) || 0;
            const bo = Number(b.sortOrder) || 0;
            if (ao !== bo) return ao - bo;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        });
        const selected = new Set(view.tagFilterIds || []);
        for (const t of sortedTags) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = [
                'ca-tag-filter-btn',
                'text-xs',
                'font-medium',
                'rounded-full',
                'px-2.5',
                'py-1',
                'border',
                'transition-colors',
                'focus:outline-none',
                'focus-visible:ring-2',
                'focus-visible:ring-primary',
                selected.has(Number(t.id))
                    ? 'ca-tag-filter-btn--active border-primary bg-primary/10 text-primary dark:bg-primary/20'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700',
            ].join(' ');
            btn.dataset.tagFilterId = String(t.id);
            btn.textContent = String(t.name || 'Тег');
            const col = sanitizeClientAnalyticsTagColor(t.color);
            if (col) btn.style.borderColor = col;
            tagBar.appendChild(btn);
        }
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className =
            'text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 ml-1 underline-offset-2 hover:underline';
        clearBtn.textContent = 'Сбросить фильтр тегов';
        clearBtn.setAttribute('data-ca-clear-tag-filter', '1');
        tagBar.appendChild(clearBtn);
    }
}

export function buildClientAnalyticsStructureSignature(parsedRecords) {
    const rows = (Array.isArray(parsedRecords) ? parsedRecords : []).map((record) => ({
        inn: String(record?.inn || '').trim(),
        kpp: String(record?.kpp || '').trim(),
        phones: [...new Set(Array.isArray(record?.phones) ? record.phones.map(String) : [])].sort(),
        emails: [...new Set(Array.isArray(record?.emails) ? record.emails.map(String) : [])].sort(),
        question: String(record?.question || '').replace(/\s+/g, ' ').trim(),
        confidence: String(record?.confidence || 'medium'),
        listItemIndex:
            record?.listItemIndex != null && Number.isFinite(record.listItemIndex)
                ? Number(record.listItemIndex)
                : null,
    }));
    rows.sort((a, b) => {
        const ak = `${a.inn}|${a.kpp}|${a.phones.join(',')}|${a.emails.join(',')}|${a.question}|${a.listItemIndex ?? ''}`;
        const bk = `${b.inn}|${b.kpp}|${b.phones.join(',')}|${b.emails.join(',')}|${b.question}|${b.listItemIndex ?? ''}`;
        return ak.localeCompare(bk, 'ru');
    });
    return JSON.stringify(rows);
}

export function decideClientAnalyticsDuplicateReason(candidate, existingFiles) {
    const files = Array.isArray(existingFiles) ? existingFiles : [];
    const normalizedName = String(candidate?.name || '').trim().toLowerCase();
    if (!normalizedName) return null;

    const byName = files.find((file) => String(file?.fileName || '').trim().toLowerCase() === normalizedName);
    if (byName) return { kind: 'name', fileName: byName.fileName || '' };

    if (candidate?.textSha256) {
        const byContent = files.find((file) => file?.textSha256 && file.textSha256 === candidate.textSha256);
        if (byContent) return { kind: 'content', fileName: byContent.fileName || '' };
    }

    if (candidate?.structureSha256 && Number.isFinite(candidate?.recordCount)) {
        const byStructure = files.find(
            (file) =>
                file?.recordsStructureSha256 &&
                file.recordsStructureSha256 === candidate.structureSha256 &&
                Number(file.recordsCount || 0) === Number(candidate.recordCount),
        );
        if (byStructure) return { kind: 'structure', fileName: byStructure.fileName || '' };
    }

    return null;
}

function duplicateReasonToMessage(reason, fileName) {
    if (!reason) return '';
    const quoted = reason.fileName ? ` «${reason.fileName}»` : '';
    if (reason.kind === 'name') {
        return `Файл «${fileName}» уже загружен (дубль по имени${quoted ? `, найдено${quoted}` : ''}). Переименуйте файл, если это новая версия.`;
    }
    if (reason.kind === 'content') {
        return `Файл «${fileName}» уже присутствует в базе (полное совпадение содержимого${quoted ? ` с${quoted}` : ''}).`;
    }
    return `Файл «${fileName}» уже присутствует в базе (совпадает внутренняя структура данных${quoted ? ` с${quoted}` : ''}).`;
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

    const toggleBtn = document.getElementById('clientAnalyticsFilesToggleBtn');
    if (toggleBtn) {
        const stateLabel = clientAnalyticsFilesCollapsed ? 'Развернуть' : 'Свернуть';
        toggleBtn.setAttribute('aria-expanded', clientAnalyticsFilesCollapsed ? 'false' : 'true');
        toggleBtn.title = `${stateLabel} список загруженных файлов`;
    }

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
        if (outerEl) {
            outerEl.hidden = clientAnalyticsFilesCollapsed;
            outerEl.classList.toggle(
                'client-analytics-files-scroll-outer--clip',
                clip && !clientAnalyticsFilesCollapsed,
            );
        }
        listEl.classList.toggle(
            'client-analytics-files-list--scrollable',
            clip && !clientAnalyticsFilesCollapsed,
        );
        if (hintEl) {
            hintEl.hidden = clientAnalyticsFilesCollapsed;
            hintEl.textContent = clip
                ? `В списке ${label}; показана только часть — прокрутите список вниз, чтобы увидеть остальные.`
                : `В списке ${label}.`;
        }
    };

    requestAnimationFrame(() => requestAnimationFrame(apply));
}

/**
 * Полностью удаляет данные раздела «База клиентов и аналитика» из IndexedDB и снимает записи с поискового индекса.
 * Не трогает другие разделы приложения и не изменяет настройки вида раздела (preferences).
 * @returns {Promise<void>}
 */
async function purgeClientAnalyticsSectionStoresFromIndexedDb() {
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
    const wipeStore = async (name) => {
        const rows = await getAllFromIndexedDB(name);
        for (const row of Array.isArray(rows) ? rows : []) {
            if (row && row.id != null) await deleteFromIndexedDB(name, row.id);
        }
    };
    await wipeStore('clientAnalyticsFolders');
    await wipeStore('clientAnalyticsTags');
    await wipeStore('clientAnalyticsCardMeta');
}

/**
 * Очищает раздел «База клиентов и аналитика»: записи, файлы, папки, теги, метаданные карточек и сохранённые фильтры/сортировку раздела.
 * Другие данные приложения не затрагиваются.
 * @returns {Promise<void>}
 */
export async function clearEntireClientAnalyticsSection() {
    if (!State.db) throw new Error('База данных недоступна');
    await purgeClientAnalyticsSectionStoresFromIndexedDb();
    try {
        await deleteFromIndexedDB('preferences', CA_ORG_VIEW_PREF_ID);
    } catch {
        /* настройка вида могла отсутствовать */
    }
    const [recC, fileC, foldC, tagC, metaC] = await Promise.all([
        getAllFromIndexedDB('clientAnalyticsRecords'),
        getAllFromIndexedDB('clientAnalyticsFiles'),
        getAllFromIndexedDB('clientAnalyticsFolders'),
        getAllFromIndexedDB('clientAnalyticsTags'),
        getAllFromIndexedDB('clientAnalyticsCardMeta'),
    ]);
    const counts = [recC, fileC, foldC, tagC, metaC].map((x) => (Array.isArray(x) ? x.length : -1));
    if (counts.some((n) => n !== 0)) {
        throw new Error('Перепроверка: после очистки раздела в IndexedDB остались данные');
    }
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
    updateClientAnalyticsIngestProgress({
        phase: 'Разбор текста (ИНН, телефоны, почта)…',
        percent: 30,
        fileLabel,
    });
    const parsed = parseTxtIntoRecords(text, file.name);
    const structureSignature = buildClientAnalyticsStructureSignature(parsed);
    const recordsStructureSha256 = await sha256HexUtf8(structureSignature);
    const existingFiles = await getAllFromIndexedDB('clientAnalyticsFiles');
    const duplicateReason = decideClientAnalyticsDuplicateReason(
        {
            name: file.name,
            textSha256,
            structureSha256: recordsStructureSha256,
            recordCount: parsed.length,
        },
        existingFiles,
    );
    if (duplicateReason) {
        throw new Error(duplicateReasonToMessage(duplicateReason, file.name));
    }

    const fileRow = {
        fileName: file.name,
        uploadedAt,
        textSha256,
        recordsStructureSha256,
        recordsCount: parsed.length,
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
        phase: 'Проверка дубликатов завершена, сохранение записей…',
        percent: 40,
        fileLabel,
    });
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
    const folders = await getAllFromIndexedDB('clientAnalyticsFolders');
    const tags = await getAllFromIndexedDB('clientAnalyticsTags');
    const cardMeta = await getAllFromIndexedDB('clientAnalyticsCardMeta');
    return {
        exportKind: 'clientAnalyticsSection',
        exportDate: new Date().toISOString(),
        schemaOrg: 1,
        files,
        records,
        folders: Array.isArray(folders) ? folders : [],
        tags: Array.isArray(tags) ? tags : [],
        cardMeta: Array.isArray(cardMeta) ? cardMeta : [],
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

    await purgeClientAnalyticsSectionStoresFromIndexedDb();

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

    const folderRows = Array.isArray(data.folders) ? data.folders : [];
    const tagRows = Array.isArray(data.tags) ? data.tags : [];
    const metaRows = Array.isArray(data.cardMeta) ? data.cardMeta : [];
    const folderIdMap = new Map();
    for (const f of folderRows) {
        const oldFid = f.id;
        const copy = { ...f };
        delete copy.id;
        const nf = await saveToIndexedDB('clientAnalyticsFolders', copy);
        if (oldFid != null) folderIdMap.set(oldFid, nf);
    }
    const tagIdMap = new Map();
    for (const t of tagRows) {
        const oldTid = t.id;
        const copy = { ...t };
        delete copy.id;
        const nt = await saveToIndexedDB('clientAnalyticsTags', copy);
        if (oldTid != null) tagIdMap.set(oldTid, nt);
    }
    for (const m of metaRows) {
        if (!m || m.id == null) continue;
        const strId = String(m.id);
        const oldFolder = m.folderId;
        let folderId = null;
        if (oldFolder != null && folderIdMap.has(oldFolder)) {
            folderId = folderIdMap.get(oldFolder);
        }
        const nextTags = [];
        for (const tid of Array.isArray(m.tagIds) ? m.tagIds : []) {
            const nt = tagIdMap.get(tid);
            if (nt != null) nextTags.push(nt);
        }
        const row = { id: strId, folderId, tagIds: nextTags };
        await saveToIndexedDB('clientAnalyticsCardMeta', row);
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
 * @param {{ metaId?: string, chipsHtml?: string } | null} [org]
 * @returns {HTMLElement}
 */
function createRecordCardElement(rec, viewMode, blacklistLevel = 0, org = null) {
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
    const frogBadge =
        bl > 0 && rec.inn
            ? `<button type="button" class="inline-flex items-center p-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded" data-action="open-blacklist-by-inn" data-inn="${escapeHtml(rec.inn)}" title="Открыть запись в черном списке по ИНН">${frogBlacklistBadgeHtml(
                  bl,
              )}</button>`
            : bl > 0
              ? frogBlacklistBadgeHtml(bl)
              : '';
    const phones = (rec.phones || []).length
        ? escapeHtml(rec.phones.join(', '))
        : '—';
    const emails = (rec.emails || []).length
        ? escapeHtml(rec.emails.join(', '))
        : '—';
    const q = escapeHtml((rec.question || '').slice(0, 280));
    const fn = escapeHtml(rec.sourceFileName || '');
    const orgBtn =
        org && org.metaId
            ? `<button type="button" class="ca-card-organize pointer-events-auto ${viewMode === 'list' ? BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS : BOOKMARK_CARD_ICON_BUTTON_CLASS} text-gray-600 hover:text-primary dark:text-gray-300 dark:hover:text-blue-200" data-ca-organize="${escapeHtml(org.metaId)}" title="Папка и теги" aria-label="Папка и теги"><i class="fas fa-tags text-sm" aria-hidden="true"></i></button>`
            : '';
    const chipsRow =
        org && org.chipsHtml
            ? `<div class="ca-meta-chips-row flex flex-wrap gap-1 mt-2">${org.chipsHtml}</div>`
            : '';
    const delBtn =
        viewMode === 'list'
            ? `<button type="button" class="${CA_LIST_DELETE_BTN_CLASS}" data-id="${rec.id}" title="Удалить запись" aria-label="Удалить запись"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>`
            : `<div class="client-analytics-card-actions absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto" data-role="actions">
  ${orgBtn}<button type="button" class="${CA_CARD_DELETE_BTN_CLASS}" data-id="${rec.id}" title="Удалить запись" aria-label="Удалить запись"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>
</div>`;
    el.innerHTML =
        viewMode === 'list'
            ? `<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
  <div class="min-w-0 flex-1 pr-2">
    <div class="flex flex-wrap items-center gap-2">
    <h3 class="item-title font-semibold text-gray-900 dark:text-gray-100">${title}</h3>
    ${frogBadge}
    </div>
    ${chipsRow}
    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Тел.: ${phones}</p>
    <p class="text-sm text-gray-600 dark:text-gray-400">E-mail: ${emails}</p>
    <p class="text-sm mt-1 line-clamp-2">${q || '—'}</p>
    <p class="text-xs text-gray-500 mt-1">${fn}</p>
  </div>
  <div class="flex gap-2 shrink-0 self-start" data-role="actions">
    ${orgBtn}${delBtn}
  </div>
</div>`
            : `${delBtn}
<div class="pr-14">
  <div class="flex flex-wrap items-start gap-2">
  <h3 class="item-title font-semibold text-base text-gray-900 dark:text-gray-100">${title}</h3>
  ${frogBadge}
  </div>
  ${chipsRow}
  <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">Тел.: ${phones}</p>
  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">E-mail: ${emails}</p>
  <p class="text-sm mt-2 line-clamp-4">${q || '—'}</p>
  <p class="text-xs text-gray-500 mt-3">${fn}</p>
</div>`;
    return el;
}

/**
 * @param {string} [iso]
 * @returns {string}
 */
function formatClientAnalyticsRuDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Карточка: все обращения с одним ИНН (история открывается в модалке).
 * @param {{ innKey: string, records: object[] }} stack
 * @param {'cards'|'list'} viewMode
 * @param {number} [blacklistLevel]
 * @param {{ metaId?: string, chipsHtml?: string } | null} [org]
 * @returns {HTMLElement}
 */
function createInnStackCardElement(stack, viewMode, blacklistLevel = 0, org = null) {
    const rec = stack.records[0];
    const n = stack.records.length;
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
    el.dataset.innKey = stack.innKey;
    el.dataset.role = 'client-analytics-item';
    el.dataset.stackCount = String(n);
    if (bl > 0) {
        el.dataset.blacklistLevel = String(bl);
    }
    let title;
    let titlePlain;
    if (rec.inn) {
        title = `ИНН ${escapeHtml(rec.inn)}${rec.kpp ? ` · КПП ${escapeHtml(rec.kpp)}` : ''}`;
        titlePlain = `ИНН ${rec.inn}${rec.kpp ? ` · КПП ${rec.kpp}` : ''}`;
    } else {
        title = `ИНН ${escapeHtml(stack.innKey)}`;
        titlePlain = `ИНН ${stack.innKey}`;
    }
    const appealsBadge =
        n > 1
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-100" title="Число обращений по этому ИНН в базе">${escapeHtml(
                  pluralRuAppeals(n),
              )}</span>`
            : '';
    if (bl > 0) {
        el.setAttribute(
            'aria-label',
            `${titlePlain}. ${pluralRuAppeals(n)}. ${frogBadgeLabelsForLevel(bl).aria}.`,
        );
    } else {
        el.setAttribute('aria-label', `${titlePlain}. ${pluralRuAppeals(n)}. Открыть историю обращений.`);
    }
    const frogBadge =
        bl > 0 && stack.innKey
            ? `<button type="button" class="inline-flex items-center p-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded" data-action="open-blacklist-by-inn" data-inn="${escapeHtml(
                  rec.inn || stack.innKey,
              )}" title="Открыть запись в черном списке по ИНН">${frogBlacklistBadgeHtml(bl)}</button>`
            : bl > 0
              ? frogBlacklistBadgeHtml(bl)
              : '';
    const phones = (rec.phones || []).length ? escapeHtml(rec.phones.join(', ')) : '—';
    const emails = (rec.emails || []).length ? escapeHtml(rec.emails.join(', ')) : '—';
    const q = escapeHtml((rec.question || '').slice(0, 280));
    const fn = escapeHtml(rec.sourceFileName || '');
    const updated = formatClientAnalyticsRuDateTime(rec.uploadedAt);
    const historyHint =
        n > 1
            ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Последнее: ${escapeHtml(updated)} · нажмите карточку для полной истории</p>`
            : `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Обновлено: ${escapeHtml(updated)}</p>`;
    const orgBtn =
        org && org.metaId
            ? `<button type="button" class="ca-card-organize pointer-events-auto ${viewMode === 'list' ? BOOKMARK_LIST_ROW_ICON_BUTTON_CLASS : BOOKMARK_CARD_ICON_BUTTON_CLASS} text-gray-600 hover:text-primary dark:text-gray-300 dark:hover:text-blue-200" data-ca-organize="${escapeHtml(org.metaId)}" title="Папка и теги" aria-label="Папка и теги"><i class="fas fa-tags text-sm" aria-hidden="true"></i></button>`
            : '';
    const chipsRow =
        org && org.chipsHtml
            ? `<div class="ca-meta-chips-row flex flex-wrap gap-1 mt-2">${org.chipsHtml}</div>`
            : '';
    const delBtn =
        n === 1
            ? viewMode === 'list'
                ? `<button type="button" class="${CA_LIST_DELETE_BTN_CLASS}" data-id="${rec.id}" title="Удалить запись" aria-label="Удалить запись"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>`
                : `<div class="client-analytics-card-actions absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto" data-role="actions">
  ${orgBtn}<button type="button" class="${CA_CARD_DELETE_BTN_CLASS}" data-id="${rec.id}" title="Удалить единственное обращение" aria-label="Удалить запись"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>
</div>`
            : viewMode === 'list'
              ? ''
              : '';
    const cardActionsMulti =
        n > 1 && orgBtn
            ? `<div class="client-analytics-card-actions absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto" data-role="actions">
  ${orgBtn}
</div>`
            : '';
    el.innerHTML =
        viewMode === 'list'
            ? `<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
  <div class="min-w-0 flex-1 pr-2">
    <div class="flex flex-wrap items-center gap-2">
    <h3 class="item-title font-semibold text-gray-900 dark:text-gray-100">${title}</h3>
    ${appealsBadge}
    ${frogBadge}
    </div>
    ${chipsRow}
    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Тел.: ${phones}</p>
    <p class="text-sm text-gray-600 dark:text-gray-400">E-mail: ${emails}</p>
    <p class="text-sm mt-1 line-clamp-2">${q || '—'}</p>
    <p class="text-xs text-gray-500 mt-1">${fn}</p>
    ${historyHint}
  </div>
  ${
      n === 1
          ? `<div class="flex gap-2 shrink-0 self-start" data-role="actions">${orgBtn}${delBtn}</div>`
          : `<div class="flex gap-2 shrink-0 self-start" data-role="actions">${orgBtn}</div>`
  }
</div>`
            : `${n === 1 ? delBtn : cardActionsMulti}
<div class="${n === 1 || orgBtn ? 'pr-14' : ''}">
  <div class="flex flex-wrap items-start gap-2">
  <h3 class="item-title font-semibold text-base text-gray-900 dark:text-gray-100">${title}</h3>
  ${appealsBadge}
  ${frogBadge}
  </div>
  ${chipsRow}
  <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">Тел.: ${phones}</p>
  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">E-mail: ${emails}</p>
  <p class="text-sm mt-2 line-clamp-4">${q || '—'}</p>
  <p class="text-xs text-gray-500 mt-3">${fn}</p>
  ${historyHint}
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
    const totalRecords = sorted.length;
    const filtered = filterClientAnalyticsRecordsByQuery(sorted, clientAnalyticsSearchQuery);
    const groupedAll = groupClientAnalyticsRecordsForDisplay(sorted);
    const groupedFiltered = groupClientAnalyticsRecordsForDisplay(filtered);
    const cardCountAll = groupedAll.innStacks.length + groupedAll.noInnRecords.length;
    const cardCountFiltered = groupedFiltered.innStacks.length + groupedFiltered.noInnRecords.length;
    let orgState = {
        folders: [],
        tags: [],
        metaById: /** @type {Map<string, import('./client-analytics-organization.js').CaCardMeta>} */ (new Map()),
        foldersById: new Map(),
        tagsById: new Map(),
        view: normalizeClientAnalyticsOrgViewPref(null),
    };
    try {
        orgState = await loadClientAnalyticsOrgState();
        syncClientAnalyticsOrgToolbarDom(orgState.folders, orgState.tags, orgState.view);
    } catch (e) {
        console.warn('[client-analytics] не удалось загрузить папки/теги', e);
    }

    const countEl = document.getElementById('clientAnalyticsRecordCount');
    if (countEl) {
        const filterSuffix =
            orgState.view.folderFilter !== CA_FOLDER_FILTER_ALL || (orgState.view.tagFilterIds || []).length
                ? ' · фильтр'
                : '';
        countEl.textContent =
            clientAnalyticsSearchQuery.trim().length > 0
                ? `Карточек: ${cardCountAll} · по запросу: ${cardCountFiltered} (${filtered.length} обращ.)${filterSuffix}`
                : `Карточек: ${cardCountAll} · обращений: ${totalRecords}${filterSuffix}`;
    }

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

    if (cardCountFiltered === 0) {
        container.innerHTML =
            clientAnalyticsSearchQuery.trim().length > 0
                ? `<p class="text-gray-500 dark:text-gray-400 text-center col-span-full py-6">По запросу «${escapeHtml(
                      clientAnalyticsSearchQuery,
                  )}» ничего не найдено.</p>`
                : '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full py-6">Записей пока нет. Загрузите один или несколько .txt файлов выше.</p>';
    } else {
        let units = buildDisplayUnitsFromGrouped(groupedFiltered);
        units = sortClientAnalyticsDisplayUnits(units, orgState.view.sortMode);
        const metaRecord = Object.fromEntries(orgState.metaById);
        units = filterUnitsByFolder(units, orgState.view.folderFilter, metaRecord);
        units = filterUnitsByTagsAny(units, orgState.view.tagFilterIds, metaRecord);
        const sections = groupClientAnalyticsUnitsForRender(
            units,
            orgState.view.groupMode,
            orgState.folders,
            orgState.tags,
            metaRecord,
        );

        /**
         * @param {import('./client-analytics-organization.js').CaDisplayUnit} u
         */
        const orgPayloadForUnit = (u) => {
            const id = getClientAnalyticsUnitMetaId(u);
            const meta = orgState.metaById.get(id) || { folderId: null, tagIds: [] };
            const chips = buildClientAnalyticsMetaChipsHtml(
                meta,
                orgState.foldersById,
                orgState.tagsById,
            );
            return { metaId: id, chipsHtml: chips };
        };

        if (!units.length) {
            container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center col-span-full py-6">По выбранным фильтрам папки и тегов карточек нет. Сбросьте фильтры или назначьте папки и теги через иконку на карточке.</p>`;
        } else {
            const frag = document.createDocumentFragment();
            for (const sec of sections) {
                if (sec.label) {
                    const h = document.createElement('h3');
                    h.className =
                        'ca-section-heading col-span-full text-sm font-semibold text-gray-700 dark:text-gray-200 mt-3 mb-2 px-0.5 border-b border-gray-200 dark:border-gray-600 pb-1';
                    h.textContent = sec.label;
                    frag.appendChild(h);
                }
                for (const u of sec.units) {
                    if (u.type === 'inn') {
                        const blLevel = getBlacklistLevelForClientInn(u.innKey, blacklistLevelByInn);
                        frag.appendChild(
                            createInnStackCardElement(
                                { innKey: u.innKey, records: u.records },
                                viewMode,
                                blLevel,
                                orgPayloadForUnit(u),
                            ),
                        );
                    } else {
                        const blLevel = getBlacklistLevelForClientInn(u.record.inn, blacklistLevelByInn);
                        frag.appendChild(
                            createRecordCardElement(u.record, viewMode, blLevel, orgPayloadForUnit(u)),
                        );
                    }
                }
            }
            container.appendChild(frag);
        }
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
 * Модалка: хронология всех обращений по одному ИНН (данные перечитываются из IndexedDB).
 * @param {string} innKey нормализованный ИНН (10/12 цифр)
 */
export async function showClientAnalyticsInnHistoryModal(innKey) {
    const key = normalizeInnForBlacklistLookup(innKey);
    if (!key) return;

    const modal = document.getElementById('clientAnalyticsDetailModal');
    const body = document.getElementById('clientAnalyticsDetailBody');
    const titleEl = document.getElementById('clientAnalyticsDetailTitle');
    if (!modal || !body || !titleEl) return;

    const all = await getAllFromIndexedDB('clientAnalyticsRecords');
    const stack = all
        .filter((r) => r && r.id != null && normalizeInnForBlacklistLookup(r.inn) === key)
        .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
    if (!stack.length) return;

    deactivateModalFocus(modal);

    let frogBannerHtml = '';
    let maxBl = 0;
    if (State.db) {
        try {
            const blEntries = await getAllFromIndexedDB('blacklistedClients');
            const blMap = buildMaxBlacklistLevelByInnMap(blEntries);
            for (const r of stack) {
                const lv = getBlacklistLevelForClientInn(r.inn, blMap);
                if (lv > maxBl) maxBl = lv;
            }
            if (maxBl > 0) {
                const { short, aria } = frogBadgeLabelsForLevel(maxBl);
                const live = maxBl === 3 ? 'assertive' : 'polite';
                frogBannerHtml = `
  <div class="client-analytics-frog-banner client-analytics-frog-banner--l${maxBl} mx-4 mt-4 mb-0 rounded-lg border px-3 py-2.5 text-sm" role="status" aria-live="${live}">
    <p class="font-semibold m-0">${escapeHtml(short)}</p>
    <p class="m-0 mt-1 opacity-90">${escapeHtml(aria)}</p>
  </div>`;
            }
        } catch (e) {
            console.warn('[client-analytics] сверка с чёрным списком в истории ИНН', e);
        }
    }

    const displayInn = stack[0].inn || key;
    titleEl.textContent = `ИНН ${displayInn} · ${pluralRuAppeals(stack.length)}`;

    const rows = stack
        .map((rec) => {
            const when = formatClientAnalyticsRuDateTime(rec.uploadedAt);
            const q = escapeHtml((rec.question || '—').slice(0, 2000));
            const fn = escapeHtml(rec.sourceFileName || '—');
            const item = rec.listItemIndex != null ? escapeHtml(String(rec.listItemIndex)) : '—';
            const phones = escapeHtml((rec.phones || []).join(', ') || '—');
            const emails = escapeHtml((rec.emails || []).join(', ') || '—');
            const kpp = escapeHtml(rec.kpp || '—');
            return `
<li class="client-analytics-history-item rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-3">
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div class="min-w-0 flex-1">
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-300 m-0">${escapeHtml(when)}</p>
      <p class="text-sm mt-1 whitespace-pre-wrap break-words m-0">${q}</p>
    </div>
    <button type="button" class="delete-ca-history-record shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500" data-ca-history-delete="${rec.id}" title="Удалить это обращение" aria-label="Удалить обращение от ${escapeHtml(when)}"><i class="fas fa-trash text-sm" aria-hidden="true"></i></button>
  </div>
  <dl class="mt-2 grid gap-1 text-xs text-gray-600 dark:text-gray-400">
    <div class="flex flex-wrap gap-x-2"><dt class="font-medium text-gray-700 dark:text-gray-300">Файл</dt><dd class="m-0">${fn}</dd></div>
    <div class="flex flex-wrap gap-x-2"><dt class="font-medium text-gray-700 dark:text-gray-300">Пункт</dt><dd class="m-0">${item}</dd></div>
    <div class="flex flex-wrap gap-x-2"><dt class="font-medium text-gray-700 dark:text-gray-300">КПП</dt><dd class="m-0">${kpp}</dd></div>
    <div class="flex flex-wrap gap-x-2"><dt class="font-medium text-gray-700 dark:text-gray-300">Тел.</dt><dd class="m-0">${phones}</dd></div>
    <div class="flex flex-wrap gap-x-2"><dt class="font-medium text-gray-700 dark:text-gray-300">E-mail</dt><dd class="m-0">${emails}</dd></div>
  </dl>
</li>`;
        })
        .join('');

    const detailInnBadgeHtml =
        maxBl > 0
            ? `<button type="button" class="inline-flex items-center p-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded ml-2" data-action="open-blacklist-by-inn" data-inn="${escapeHtml(
                  displayInn,
              )}" title="Открыть запись в черном списке по ИНН">${frogBlacklistBadgeHtml(maxBl)}</button>`
            : '';

    body.innerHTML = `
${frogBannerHtml}
<div class="flex flex-col flex-1 min-h-0 px-4 pt-3 pb-2">
  <div class="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
    <span>Обращения отсортированы от новых к старым.</span>${detailInnBadgeHtml}
  </div>
  <div class="client-analytics-detail-scroll flex-1 min-h-0 overflow-y-auto pb-2 custom-scrollbar">
    <ol class="client-analytics-history-list space-y-3 list-none m-0 p-0">${rows}</ol>
  </div>
</div>`;

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden', 'modal-open');
    activateModalFocus(modal);

    const bindHistoryDeletes = () => {
        body.querySelectorAll('[data-ca-history-delete]').forEach((btn) => {
            btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const rid = parseInt(btn.getAttribute('data-ca-history-delete') || '', 10);
                if (!Number.isFinite(rid)) return;
                await deleteAnalyticsRecord(rid);
                if (deps.showNotification) deps.showNotification('Обращение удалено', 'success');
                await renderClientAnalyticsPage();
                const again = await getAllFromIndexedDB('clientAnalyticsRecords');
                const rest = again.filter(
                    (r) => r && r.id != null && normalizeInnForBlacklistLookup(r.inn) === key,
                );
                if (!rest.length) {
                    closeClientAnalyticsDetailModal();
                } else {
                    await showClientAnalyticsInnHistoryModal(key);
                }
            });
        });
    };
    bindHistoryDeletes();
}

export async function navigateToBlacklistByInn(inn, options = {}) {
    const key = normalizeInnForBlacklistLookup(inn);
    if (!key) return false;
    const setTab = options.setActiveTabFn || (typeof window !== 'undefined' ? window.setActiveTab : null);
    if (typeof setTab === 'function') {
        await Promise.resolve(
            setTab('blacklistedClients', true, {
                navigationSource: NavigationSource.PROGRAMMATIC,
            }),
        );
    }
    const applySearch = () => {
        const input = document.getElementById('blacklistSearchInput');
        if (!input) return false;
        input.value = key;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        return true;
    };
    if (applySearch()) return true;
    requestAnimationFrame(() => {
        setTimeout(() => {
            applySearch();
        }, 60);
    });
    return true;
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
    const titleEl = document.getElementById('clientAnalyticsDetailTitle');
    if (!modal || !body) return;
    if (titleEl) titleEl.textContent = 'Карточка клиента';

    deactivateModalFocus(modal);

    const file = await getFromIndexedDB('clientAnalyticsFiles', rec.sourceFileId);
    const rawPreview = file && file.rawText ? file.rawText.slice(0, 8000) : '';

    let frogBannerHtml = '';
    let detailInnBadgeHtml = '';
    if (State.db && rec.inn) {
        try {
            const blEntries = await getAllFromIndexedDB('blacklistedClients');
            const blMap = buildMaxBlacklistLevelByInnMap(blEntries);
            const dBl = getBlacklistLevelForClientInn(rec.inn, blMap);
            if (dBl > 0) {
                const { short, aria } = frogBadgeLabelsForLevel(dBl);
                const live = dBl === 3 ? 'assertive' : 'polite';
                detailInnBadgeHtml = `<button type="button" class="inline-flex items-center p-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded" data-action="open-blacklist-by-inn" data-inn="${escapeHtml(
                    rec.inn,
                )}" title="Открыть запись в черном списке по ИНН">${frogBlacklistBadgeHtml(dBl)}</button>`;
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
      <div><dt class="font-semibold text-gray-700 dark:text-gray-300">ИНН</dt><dd class="flex flex-wrap items-center gap-2">${escapeHtml(rec.inn || '—')}${detailInnBadgeHtml}</dd></div>
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

async function refreshClientAnalyticsOrgManageModalLists() {
    const ulF = document.getElementById('clientAnalyticsFoldersManageList');
    const ulT = document.getElementById('clientAnalyticsTagsManageList');
    if (!ulF || !ulT) return;
    const folders = await getAllFromIndexedDB('clientAnalyticsFolders');
    const tags = await getAllFromIndexedDB('clientAnalyticsTags');
    const fs = [...(Array.isArray(folders) ? folders : [])].sort((a, b) => {
        const ao = Number(a.sortOrder) || 0;
        const bo = Number(b.sortOrder) || 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    ulF.innerHTML = fs
        .map(
            (f) =>
                `<li class="flex items-center gap-2 justify-between border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5">
<span class="min-w-0 break-words">${escapeHtml(String(f.name || ''))}</span>
<button type="button" class="shrink-0 text-red-600 hover:text-red-800 text-sm" data-ca-delete-folder="${f.id}" title="Удалить папку" aria-label="Удалить папку"><i class="fas fa-trash" aria-hidden="true"></i></button>
</li>`,
        )
        .join('');
    const ts = [...(Array.isArray(tags) ? tags : [])].sort((a, b) => {
        const ao = Number(a.sortOrder) || 0;
        const bo = Number(b.sortOrder) || 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    ulT.innerHTML = ts
        .map((t) => {
            const col = sanitizeClientAnalyticsTagColor(t.color) || '#94a3b8';
            return `<li class="flex items-center gap-2 justify-between border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5">
<span class="min-w-0 flex items-center gap-2 break-words"><span class="inline-block h-2.5 w-2.5 rounded-full shrink-0" style="background:${escapeHtml(col)}"></span>${escapeHtml(String(t.name || ''))}</span>
<button type="button" class="shrink-0 text-red-600 hover:text-red-800 text-sm" data-ca-delete-tag="${t.id}" title="Удалить тег" aria-label="Удалить тег"><i class="fas fa-trash" aria-hidden="true"></i></button>
</li>`;
        })
        .join('');
}

function closeClientAnalyticsAssignModal() {
    const modal = document.getElementById('clientAnalyticsAssignModal');
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

function closeClientAnalyticsOrgManageModal() {
    const modal = document.getElementById('clientAnalyticsOrgManageModal');
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

function resetClientAnalyticsClearAllModalForm() {
    const ack = document.getElementById('clientAnalyticsClearAllAcknowledge');
    const confirmBtn = document.getElementById('clientAnalyticsClearAllConfirmBtn');
    if (ack) ack.checked = false;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.setAttribute('aria-disabled', 'true');
    }
}

function openClientAnalyticsClearAllModal() {
    closeClientAnalyticsDetailModal();
    closeClientAnalyticsAssignModal();
    closeClientAnalyticsOrgManageModal();
    const modal = document.getElementById('clientAnalyticsClearAllModal');
    if (!modal) return;
    resetClientAnalyticsClearAllModalForm();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden', 'modal-open');
    activateModalFocus(modal);
}

/**
 * Закрытие модалки полной очистки раздела «База клиентов» (Escape / Отмена).
 */
export function closeClientAnalyticsClearAllModal() {
    const modal = document.getElementById('clientAnalyticsClearAllModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    deactivateModalFocus(modal);
    resetClientAnalyticsClearAllModalForm();
    requestAnimationFrame(() => {
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('overflow-hidden', 'modal-open');
        }
    });
}

async function openClientAnalyticsOrgManageModal() {
    const modal = document.getElementById('clientAnalyticsOrgManageModal');
    if (!modal) return;
    await refreshClientAnalyticsOrgManageModalLists();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden', 'modal-open');
    activateModalFocus(modal);
}

/**
 * @param {string} metaId
 */
async function openClientAnalyticsAssignModal(metaId) {
    const modal = document.getElementById('clientAnalyticsAssignModal');
    const hid = document.getElementById('clientAnalyticsAssignMetaId');
    const folderSelect = document.getElementById('clientAnalyticsAssignFolderSelect');
    const tagBox = document.getElementById('clientAnalyticsAssignTagsFieldset');
    if (!modal || !hid || !folderSelect || !tagBox || !metaId) return;
    const state = await loadClientAnalyticsOrgState();
    hid.value = metaId;
    folderSelect.innerHTML = '<option value="">Без папки</option>';
    const fs = [...state.folders].sort((a, b) => {
        const ao = Number(a.sortOrder) || 0;
        const bo = Number(b.sortOrder) || 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    for (const f of fs) {
        const o = document.createElement('option');
        o.value = String(f.id);
        o.textContent = String(f.name || 'Папка');
        folderSelect.appendChild(o);
    }
    const meta = state.metaById.get(metaId) || { folderId: null, tagIds: [] };
    folderSelect.value = meta.folderId != null ? String(meta.folderId) : '';
    const ts = [...state.tags].sort((a, b) => {
        const ao = Number(a.sortOrder) || 0;
        const bo = Number(b.sortOrder) || 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    const sel = new Set(meta.tagIds || []);
    tagBox.innerHTML = ts
        .map((t) => {
            const id = `ca-assign-tag-${t.id}`;
            const checked = sel.has(Number(t.id)) ? ' checked' : '';
            return `<label class="flex items-center gap-2 cursor-pointer select-none" for="${id}">
<input type="checkbox" id="${id}" value="${String(t.id)}" class="rounded border-gray-300 text-primary focus:ring-primary"${checked}/>
<span>${escapeHtml(String(t.name || ''))}</span>
</label>`;
        })
        .join('');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden', 'modal-open');
    activateModalFocus(modal);
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

    const clearAllBtn = document.getElementById('clientAnalyticsClearAllBtn');
    if (clearAllBtn && !clearAllBtn._caClearAllBound) {
        clearAllBtn._caClearAllBound = true;
        clearAllBtn.addEventListener('click', () => {
            openClientAnalyticsClearAllModal();
        });
    }
    const clearAck = document.getElementById('clientAnalyticsClearAllAcknowledge');
    const clearConfirm = document.getElementById('clientAnalyticsClearAllConfirmBtn');
    if (clearAck && clearConfirm && !clearAck._caClearAckBound) {
        clearAck._caClearAckBound = true;
        clearAck.addEventListener('change', () => {
            clearConfirm.disabled = !clearAck.checked;
            clearConfirm.setAttribute('aria-disabled', clearConfirm.disabled ? 'true' : 'false');
        });
    }
    const clearCancel = document.getElementById('clientAnalyticsClearAllCancelBtn');
    const clearClose = document.getElementById('clientAnalyticsClearAllModalCloseBtn');
    for (const el of [clearCancel, clearClose]) {
        if (el && !el._caClearModalDismissBound) {
            el._caClearModalDismissBound = true;
            el.addEventListener('click', () => closeClientAnalyticsClearAllModal());
        }
    }
    if (clearConfirm && !clearConfirm._caClearConfirmBound) {
        clearConfirm._caClearConfirmBound = true;
        clearConfirm.addEventListener('click', async () => {
            if (clearConfirm.disabled) return;
            try {
                await clearEntireClientAnalyticsSection();
                clientAnalyticsSearchQuery = '';
                const si = document.getElementById('clientAnalyticsSearchInput');
                if (si) si.value = '';
                const csb = document.getElementById('clearClientAnalyticsSearchBtn');
                if (csb) csb.classList.add('hidden');
                closeClientAnalyticsClearAllModal();
                if (deps.showNotification) {
                    deps.showNotification(
                        'Раздел «База клиентов и аналитика» полностью очищен (остальные данные приложения не изменены)',
                        'success',
                    );
                }
            } catch (err) {
                console.error(err);
                if (deps.showNotification) {
                    deps.showNotification(err?.message || String(err), 'error');
                }
            }
            await renderClientAnalyticsPage();
        });
    }

    document.addEventListener('click', (e) => {
        const orgHit = e.target.closest('[data-ca-organize]');
        if (orgHit) {
            e.preventDefault();
            e.stopPropagation();
            const mid = orgHit.getAttribute('data-ca-organize') || '';
            void openClientAnalyticsAssignModal(mid);
            return;
        }
        const openBlacklist = e.target.closest('[data-action="open-blacklist-by-inn"]');
        if (openBlacklist) {
            e.preventDefault();
            e.stopPropagation();
            const inn = openBlacklist.getAttribute('data-inn') || '';
            void navigateToBlacklistByInn(inn);
            return;
        }
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
        if (card && !e.target.closest('a[href]')) {
            if (card.dataset.innKey) {
                void showClientAnalyticsInnHistoryModal(card.dataset.innKey);
                return;
            }
            if (card.dataset.id) {
                void showClientAnalyticsDetailModal(parseInt(card.dataset.id, 10));
                return;
            }
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

    const searchInput = document.getElementById('clientAnalyticsSearchInput');
    const clearSearchBtn = document.getElementById('clearClientAnalyticsSearchBtn');
    if (searchInput && !searchInput._clientAnalyticsSearchBound) {
        searchInput._clientAnalyticsSearchBound = true;
        searchInput.addEventListener('input', async () => {
            clientAnalyticsSearchQuery = searchInput.value || '';
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle('hidden', clientAnalyticsSearchQuery.trim().length === 0);
            }
            await renderClientAnalyticsPage();
        });
    }
    if (clearSearchBtn && !clearSearchBtn._clientAnalyticsSearchBound) {
        clearSearchBtn._clientAnalyticsSearchBound = true;
        clearSearchBtn.addEventListener('click', async () => {
            if (!searchInput) return;
            searchInput.value = '';
            clientAnalyticsSearchQuery = '';
            clearSearchBtn.classList.add('hidden');
            searchInput.focus();
            await renderClientAnalyticsPage();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.classList.toggle('hidden', clientAnalyticsSearchQuery.trim().length === 0);
    }

    const filesToggleBtn = document.getElementById('clientAnalyticsFilesToggleBtn');
    if (filesToggleBtn && !filesToggleBtn._clientAnalyticsToggleBound) {
        filesToggleBtn._clientAnalyticsToggleBound = true;
        filesToggleBtn.addEventListener('click', () => {
            clientAnalyticsFilesCollapsed = !clientAnalyticsFilesCollapsed;
            const sec = document.getElementById('clientAnalyticsFilesSection');
            const n = parseInt(sec?.dataset?.fileCount || '0', 10);
            updateClientAnalyticsFilesListChrome(Number.isFinite(n) ? n : 0);
        });
    }

    const sortSel = document.getElementById('clientAnalyticsSortSelect');
    if (sortSel && !sortSel._caSortBound) {
        sortSel._caSortBound = true;
        sortSel.addEventListener('change', async () => {
            const st = await loadClientAnalyticsOrgState();
            st.view.sortMode = /** @type {CaSortMode} */ (sortSel.value);
            await saveClientAnalyticsOrgViewPref(st.view);
            await renderClientAnalyticsPage();
        });
    }
    const groupSel = document.getElementById('clientAnalyticsGroupSelect');
    if (groupSel && !groupSel._caGroupBound) {
        groupSel._caGroupBound = true;
        groupSel.addEventListener('change', async () => {
            const st = await loadClientAnalyticsOrgState();
            st.view.groupMode = /** @type {CaGroupMode} */ (groupSel.value);
            await saveClientAnalyticsOrgViewPref(st.view);
            await renderClientAnalyticsPage();
        });
    }
    const folderSel = document.getElementById('clientAnalyticsFolderFilterSelect');
    if (folderSel && !folderSel._caFolderFilterBound) {
        folderSel._caFolderFilterBound = true;
        folderSel.addEventListener('change', async () => {
            const st = await loadClientAnalyticsOrgState();
            st.view.folderFilter = folderSel.value;
            await saveClientAnalyticsOrgViewPref(st.view);
            await renderClientAnalyticsPage();
        });
    }

    const orgToolbar = document.getElementById('clientAnalyticsOrgToolbar');
    if (orgToolbar && !orgToolbar._caTagBarBound) {
        orgToolbar._caTagBarBound = true;
        orgToolbar.addEventListener('click', async (ev) => {
            const clearB = ev.target.closest('[data-ca-clear-tag-filter]');
            if (clearB) {
                ev.preventDefault();
                const st = await loadClientAnalyticsOrgState();
                st.view.tagFilterIds = [];
                await saveClientAnalyticsOrgViewPref(st.view);
                await renderClientAnalyticsPage();
                return;
            }
            const tagB = ev.target.closest('.ca-tag-filter-btn');
            if (tagB && tagB.dataset.tagFilterId != null) {
                ev.preventDefault();
                const tid = Number(tagB.dataset.tagFilterId);
                if (!Number.isFinite(tid)) return;
                const st = await loadClientAnalyticsOrgState();
                const set = new Set(st.view.tagFilterIds || []);
                if (set.has(tid)) set.delete(tid);
                else set.add(tid);
                st.view.tagFilterIds = [...set].sort((a, b) => a - b);
                await saveClientAnalyticsOrgViewPref(st.view);
                await renderClientAnalyticsPage();
            }
        });
    }

    const manageOrgBtn = document.getElementById('clientAnalyticsManageOrgBtn');
    if (manageOrgBtn && !manageOrgBtn._caBound) {
        manageOrgBtn._caBound = true;
        manageOrgBtn.addEventListener('click', () => void openClientAnalyticsOrgManageModal());
    }

    const assignClose = document.getElementById('clientAnalyticsAssignCloseBtn');
    if (assignClose && !assignClose._caBound) {
        assignClose._caBound = true;
        assignClose.addEventListener('click', closeClientAnalyticsAssignModal);
    }
    const assignCancel = document.getElementById('clientAnalyticsAssignCancelBtn');
    if (assignCancel && !assignCancel._caBound) {
        assignCancel._caBound = true;
        assignCancel.addEventListener('click', closeClientAnalyticsAssignModal);
    }
    const assignSave = document.getElementById('clientAnalyticsAssignSaveBtn');
    if (assignSave && !assignSave._caBound) {
        assignSave._caBound = true;
        assignSave.addEventListener('click', async () => {
            const hid = document.getElementById('clientAnalyticsAssignMetaId');
            const folderSelect = document.getElementById('clientAnalyticsAssignFolderSelect');
            const tagBox = document.getElementById('clientAnalyticsAssignTagsFieldset');
            if (!hid || !folderSelect || !tagBox) return;
            const metaId = hid.value;
            if (!metaId) return;
            const fv = folderSelect.value;
            let folderId = null;
            if (fv !== '') {
                const n = Number(fv);
                if (Number.isFinite(n)) folderId = n;
            }
            const tagIds = [];
            tagBox.querySelectorAll('input[type="checkbox"]').forEach((inp) => {
                if (inp.checked) {
                    const n = Number(inp.value);
                    if (Number.isFinite(n)) tagIds.push(n);
                }
            });
            tagIds.sort((a, b) => a - b);
            try {
                await persistClientAnalyticsCardMeta(metaId, {
                    folderId,
                    tagIds,
                });
                if (deps.showNotification) deps.showNotification('Папка и теги сохранены', 'success');
                closeClientAnalyticsAssignModal();
                await renderClientAnalyticsPage();
            } catch (err) {
                console.error(err);
                if (deps.showNotification) deps.showNotification(String(err?.message || err), 'error');
            }
        });
    }

    const orgManageClose = document.getElementById('clientAnalyticsOrgManageCloseBtn');
    if (orgManageClose && !orgManageClose._caBound) {
        orgManageClose._caBound = true;
        orgManageClose.addEventListener('click', closeClientAnalyticsOrgManageModal);
    }

    const addFolderBtn = document.getElementById('clientAnalyticsAddFolderBtn');
    if (addFolderBtn && !addFolderBtn._caBound) {
        addFolderBtn._caBound = true;
        addFolderBtn.addEventListener('click', async () => {
            const inp = document.getElementById('clientAnalyticsNewFolderName');
            const name = String(inp?.value || '').trim();
            if (!name) {
                if (deps.showNotification) deps.showNotification('Введите название папки', 'warning');
                return;
            }
            const all = await getAllFromIndexedDB('clientAnalyticsFolders');
            const maxOrder = Math.max(
                0,
                ...(Array.isArray(all) ? all : []).map((f) => Number(f.sortOrder) || 0),
            );
            await saveToIndexedDB('clientAnalyticsFolders', {
                name,
                sortOrder: maxOrder + 1,
                createdAt: new Date().toISOString(),
            });
            if (inp) inp.value = '';
            await refreshClientAnalyticsOrgManageModalLists();
            await renderClientAnalyticsPage();
            if (deps.showNotification) deps.showNotification('Папка добавлена', 'success');
        });
    }

    const addTagBtn = document.getElementById('clientAnalyticsAddTagBtn');
    if (addTagBtn && !addTagBtn._caBound) {
        addTagBtn._caBound = true;
        addTagBtn.addEventListener('click', async () => {
            const inp = document.getElementById('clientAnalyticsNewTagName');
            const colorInp = document.getElementById('clientAnalyticsNewTagColor');
            const name = String(inp?.value || '').trim();
            if (!name) {
                if (deps.showNotification) deps.showNotification('Введите название тега', 'warning');
                return;
            }
            const colorRaw = colorInp && 'value' in colorInp ? colorInp.value : '';
            const color = sanitizeClientAnalyticsTagColor(colorRaw) || '#3b82f6';
            const all = await getAllFromIndexedDB('clientAnalyticsTags');
            const maxOrder = Math.max(
                0,
                ...(Array.isArray(all) ? all : []).map((t) => Number(t.sortOrder) || 0),
            );
            await saveToIndexedDB('clientAnalyticsTags', {
                name,
                color,
                sortOrder: maxOrder + 1,
                createdAt: new Date().toISOString(),
            });
            if (inp) inp.value = '';
            await refreshClientAnalyticsOrgManageModalLists();
            await renderClientAnalyticsPage();
            if (deps.showNotification) deps.showNotification('Тег добавлен', 'success');
        });
    }

    const manageModal = document.getElementById('clientAnalyticsOrgManageModal');
    if (manageModal && !manageModal._caDeleteBound) {
        manageModal._caDeleteBound = true;
        manageModal.addEventListener('click', async (ev) => {
            const df = ev.target.closest('[data-ca-delete-folder]');
            if (df) {
                ev.preventDefault();
                const id = parseInt(df.getAttribute('data-ca-delete-folder') || '', 10);
                if (!Number.isFinite(id)) return;
                await deleteClientAnalyticsFolderCascade(id);
                await refreshClientAnalyticsOrgManageModalLists();
                await renderClientAnalyticsPage();
                if (deps.showNotification) deps.showNotification('Папка удалена', 'info');
                return;
            }
            const dt = ev.target.closest('[data-ca-delete-tag]');
            if (dt) {
                ev.preventDefault();
                const id = parseInt(dt.getAttribute('data-ca-delete-tag') || '', 10);
                if (!Number.isFinite(id)) return;
                await deleteClientAnalyticsTagCascade(id);
                await refreshClientAnalyticsOrgManageModalLists();
                await renderClientAnalyticsPage();
                if (deps.showNotification) deps.showNotification('Тег удалён', 'info');
            }
        });
    }
}
