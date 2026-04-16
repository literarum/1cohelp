'use strict';

/**
 * Чистая логика организации карточек «База клиентов»: сортировка, фильтры папка/теги, группировки.
 * Хранение — IndexedDB (см. client-analytics.js); здесь только детерминированные преобразования списков.
 */

/** @typedef {'date_desc'|'date_asc'|'inn_asc'|'appeals_desc'|'file_asc'|'question_asc'} CaSortMode */
/** @typedef {'none'|'folder'|'tag'|'source_file'} CaGroupMode */

/** @typedef {{ type: 'inn', innKey: string, records: object[] }} CaInnUnit */
/** @typedef {{ type: 'record', record: object }} CaRecordUnit */
/** @typedef {CaInnUnit | CaRecordUnit} CaDisplayUnit */

/** @typedef {{ folderId: number|null, tagIds: number[] }} CaCardMeta */

export const CA_SORT_MODES = /** @type {const} */ ([
    'date_desc',
    'date_asc',
    'inn_asc',
    'appeals_desc',
    'file_asc',
    'question_asc',
]);

export const CA_GROUP_MODES = /** @type {const} */ (['none', 'folder', 'tag', 'source_file']);

export const CA_FOLDER_FILTER_ALL = 'all';
export const CA_FOLDER_FILTER_UNFILED = 'unfiled';

/**
 * @param {CaDisplayUnit} unit
 * @returns {string}
 */
export function getClientAnalyticsUnitMetaId(unit) {
    if (unit.type === 'inn') return `inn:${unit.innKey}`;
    if (unit.type === 'record' && unit.record && unit.record.id != null) {
        return `rec:${unit.record.id}`;
    }
    return 'rec:invalid';
}

/**
 * @param {{ innStacks: object[], noInnRecords: object[] }} grouped
 * @returns {CaDisplayUnit[]}
 */
export function buildDisplayUnitsFromGrouped(grouped) {
    const units = [];
    const stacks = Array.isArray(grouped?.innStacks) ? grouped.innStacks : [];
    const singles = Array.isArray(grouped?.noInnRecords) ? grouped.noInnRecords : [];
    for (const s of stacks) {
        if (s && s.innKey && Array.isArray(s.records) && s.records.length) {
            units.push({ type: 'inn', innKey: String(s.innKey), records: s.records });
        }
    }
    for (const r of singles) {
        if (r && r.id != null) units.push({ type: 'record', record: r });
    }
    return units;
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function uploadedMs(v) {
    const t = new Date(v || 0).getTime();
    return Number.isFinite(t) ? t : 0;
}

/**
 * @param {CaDisplayUnit} unit
 * @returns {number}
 */
export function getUnitLatestUploadedMs(unit) {
    if (unit.type === 'inn') {
        let m = 0;
        for (const r of unit.records) {
            const u = uploadedMs(r?.uploadedAt);
            if (u > m) m = u;
        }
        return m;
    }
    return uploadedMs(unit.record?.uploadedAt);
}

/**
 * @param {CaDisplayUnit} unit
 * @returns {number}
 */
export function getUnitEarliestUploadedMs(unit) {
    if (unit.type === 'inn') {
        if (!unit.records.length) return 0;
        let m = uploadedMs(unit.records[0]?.uploadedAt);
        for (let i = 1; i < unit.records.length; i++) {
            const u = uploadedMs(unit.records[i]?.uploadedAt);
            if (u < m) m = u;
        }
        return m;
    }
    return uploadedMs(unit.record?.uploadedAt);
}

/**
 * Последняя по времени запись в стеке ИНН (как в карточке).
 * @param {CaDisplayUnit} unit
 * @returns {object|null}
 */
export function getUnitRepresentativeRecord(unit) {
    if (unit.type === 'inn') {
        return unit.records[0] || null;
    }
    return unit.record || null;
}

/**
 * @param {CaDisplayUnit} unit
 * @returns {string}
 */
export function getUnitInnSortKey(unit) {
    if (unit.type === 'inn') return String(unit.innKey || '');
    const inn = String(unit.record?.inn || '').replace(/\D/g, '');
    if (inn.length === 10 || inn.length === 12) return inn;
    const phones = unit.record?.phones;
    if (Array.isArray(phones) && phones.length) return String(phones[0] || '');
    return String(unit.record?.kpp || unit.record?.id || '');
}

/**
 * @param {CaDisplayUnit} unit
 * @returns {number}
 */
export function getUnitAppealsCount(unit) {
    if (unit.type === 'inn') return unit.records.length;
    return 1;
}

/**
 * @param {CaDisplayUnit} unit
 * @returns {string}
 */
export function getUnitSourceFileName(unit) {
    const r = getUnitRepresentativeRecord(unit);
    return String(r?.sourceFileName || '').toLowerCase();
}

/**
 * @param {CaDisplayUnit} unit
 * @returns {string}
 */
export function getUnitQuestionSortKey(unit) {
    const r = getUnitRepresentativeRecord(unit);
    return String(r?.question || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {CaDisplayUnit[]} units
 * @param {CaSortMode} mode
 * @returns {CaDisplayUnit[]}
 */
export function sortClientAnalyticsDisplayUnits(units, mode) {
    const list = Array.isArray(units) ? [...units] : [];
    const m = CA_SORT_MODES.includes(mode) ? mode : 'date_desc';

    const cmp = (a, b) => {
        if (m === 'date_desc') return getUnitLatestUploadedMs(b) - getUnitLatestUploadedMs(a);
        if (m === 'date_asc') return getUnitEarliestUploadedMs(a) - getUnitEarliestUploadedMs(b);
        if (m === 'inn_asc') return getUnitInnSortKey(a).localeCompare(getUnitInnSortKey(b), 'ru');
        if (m === 'appeals_desc') {
            const d = getUnitAppealsCount(b) - getUnitAppealsCount(a);
            if (d !== 0) return d;
            return getUnitLatestUploadedMs(b) - getUnitLatestUploadedMs(a);
        }
        if (m === 'file_asc') {
            const fa = getUnitSourceFileName(a);
            const fb = getUnitSourceFileName(b);
            const c = fa.localeCompare(fb, 'ru');
            if (c !== 0) return c;
            return getUnitLatestUploadedMs(b) - getUnitLatestUploadedMs(a);
        }
        if (m === 'question_asc') {
            const qa = getUnitQuestionSortKey(a);
            const qb = getUnitQuestionSortKey(b);
            const c = qa.localeCompare(qb, 'ru');
            if (c !== 0) return c;
            return getUnitLatestUploadedMs(b) - getUnitLatestUploadedMs(a);
        }
        return 0;
    };

    list.sort(cmp);
    return list;
}

/**
 * @param {unknown} row
 * @returns {CaCardMeta}
 */
export function normalizeClientAnalyticsCardMeta(row) {
    if (!row || typeof row !== 'object') {
        return { folderId: null, tagIds: [] };
    }
    const folderIdRaw = row.folderId;
    const folderId =
        folderIdRaw != null && Number.isFinite(Number(folderIdRaw)) ? Number(folderIdRaw) : null;
    const rawTags = row.tagIds;
    const tagIds = [];
    if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
            const n = Number(t);
            if (Number.isFinite(n)) tagIds.push(n);
        }
    }
    return { folderId, tagIds: [...new Set(tagIds)].sort((a, b) => a - b) };
}

/**
 * @param {Map<string, CaCardMeta>|Record<string, CaCardMeta>} metaMap
 * @param {string} id
 * @returns {CaCardMeta}
 */
export function getMetaForUnit(metaMap, id) {
    if (!metaMap) return { folderId: null, tagIds: [] };
    if (metaMap instanceof Map) {
        return normalizeClientAnalyticsCardMeta(metaMap.get(id));
    }
    return normalizeClientAnalyticsCardMeta(metaMap[id]);
}

/**
 * @param {CaDisplayUnit[]} units
 * @param {string} folderFilter — 'all' | 'unfiled' | stringified numeric id
 * @param {Map<string, CaCardMeta>|Record<string, CaCardMeta>} metaMap
 * @returns {CaDisplayUnit[]}
 */
export function filterUnitsByFolder(units, folderFilter, metaMap) {
    const list = Array.isArray(units) ? units : [];
    const f =
        folderFilter == null || folderFilter === CA_FOLDER_FILTER_ALL
            ? CA_FOLDER_FILTER_ALL
            : folderFilter;
    if (f === CA_FOLDER_FILTER_ALL) return [...list];

    return list.filter((unit) => {
        const id = getClientAnalyticsUnitMetaId(unit);
        const meta = getMetaForUnit(metaMap, id);
        if (f === CA_FOLDER_FILTER_UNFILED) {
            return meta.folderId == null;
        }
        const want = Number(f);
        if (!Number.isFinite(want)) return true;
        return meta.folderId === want;
    });
}

/**
 * @param {CaDisplayUnit[]} units
 * @param {number[]} selectedTagIds
 * @param {Map<string, CaCardMeta>|Record<string, CaCardMeta>} metaMap
 * @returns {CaDisplayUnit[]}
 */
export function filterUnitsByTagsAny(units, selectedTagIds, metaMap) {
    const list = Array.isArray(units) ? units : [];
    const sel = (Array.isArray(selectedTagIds) ? selectedTagIds : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n));
    if (!sel.length) return [...list];
    const set = new Set(sel);
    return list.filter((unit) => {
        const id = getClientAnalyticsUnitMetaId(unit);
        const meta = getMetaForUnit(metaMap, id);
        return (meta.tagIds || []).some((t) => set.has(t));
    });
}

/**
 * @typedef {{ key: string, label: string, units: CaDisplayUnit[] }} CaRenderSection
 */

/**
 * @param {object} folder
 * @returns {number}
 */
function folderOrder(folder) {
    const o = folder?.sortOrder;
    return Number.isFinite(Number(o)) ? Number(o) : 0;
}

/**
 * @param {object} tag
 * @returns {number}
 */
function tagOrder(tag) {
    const o = tag?.sortOrder;
    return Number.isFinite(Number(o)) ? Number(o) : 0;
}

/**
 * @param {CaDisplayUnit[]} units
 * @param {CaGroupMode} mode
 * @param {{ id: number, name: string, sortOrder?: number }[]} folders
 * @param {{ id: number, name: string, sortOrder?: number }[]} tags
 * @param {Map<string, CaCardMeta>|Record<string, CaCardMeta>} metaMap
 * @returns {CaRenderSection[]}
 */
export function groupClientAnalyticsUnitsForRender(units, mode, folders, tags, metaMap) {
    const list = Array.isArray(units) ? units : [];
    const m = CA_GROUP_MODES.includes(mode) ? mode : 'none';
    const map = metaMap || {};

    if (m === 'none') {
        return [{ key: 'all', label: '', units: [...list] }];
    }

    if (m === 'folder') {
        const sortedFolders = [...(Array.isArray(folders) ? folders : [])].sort((a, b) => {
            const ao = folderOrder(a);
            const bo = folderOrder(b);
            if (ao !== bo) return ao - bo;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        });
        /** @type {Map<number, CaDisplayUnit[]>} */
        const byFolderId = new Map();
        const unfiled = [];
        for (const f of sortedFolders) {
            byFolderId.set(Number(f.id), []);
        }
        for (const u of list) {
            const meta = getMetaForUnit(map, getClientAnalyticsUnitMetaId(u));
            const fid = meta.folderId;
            if (fid != null && byFolderId.has(fid)) {
                byFolderId.get(fid).push(u);
            } else {
                unfiled.push(u);
            }
        }
        /** @type {CaRenderSection[]} */
        const sections = [];
        for (const f of sortedFolders) {
            const id = Number(f.id);
            const arr = byFolderId.get(id) || [];
            if (arr.length) {
                sections.push({
                    key: `folder:${id}`,
                    label: String(f.name || 'Папка'),
                    units: arr,
                });
            }
        }
        if (unfiled.length) {
            sections.push({ key: 'folder:unfiled', label: 'Без папки', units: unfiled });
        }
        return sections.length ? sections : [{ key: 'all', label: '', units: [] }];
    }

    if (m === 'tag') {
        const sortedTags = [...(Array.isArray(tags) ? tags : [])].sort((a, b) => {
            const ao = tagOrder(a);
            const bo = tagOrder(b);
            if (ao !== bo) return ao - bo;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        });
        /** @type {Map<number, CaDisplayUnit[]>} */
        const byTagId = new Map();
        for (const t of sortedTags) {
            byTagId.set(Number(t.id), []);
        }
        const untagged = [];
        for (const u of list) {
            const meta = getMetaForUnit(map, getClientAnalyticsUnitMetaId(u));
            const tids = meta.tagIds || [];
            if (!tids.length) {
                untagged.push(u);
                continue;
            }
            const seen = new Set();
            for (const raw of tids) {
                const tid = Number(raw);
                if (!Number.isFinite(tid) || seen.has(tid)) continue;
                seen.add(tid);
                if (!byTagId.has(tid)) continue;
                byTagId.get(tid).push(u);
            }
        }
        /** @type {CaRenderSection[]} */
        const sections = [];
        for (const t of sortedTags) {
            const id = Number(t.id);
            const arr = byTagId.get(id) || [];
            if (arr.length) {
                sections.push({
                    key: `tag:${id}`,
                    label: String(t.name || 'Тег'),
                    units: arr,
                });
            }
        }
        if (untagged.length) {
            sections.push({ key: 'tag:untagged', label: 'Без тегов', units: untagged });
        }
        return sections.length ? sections : [{ key: 'all', label: '', units: [] }];
    }

    if (m === 'source_file') {
        /** @type {Map<string, { label: string, units: CaDisplayUnit[] }>} */
        const byFile = new Map();
        for (const u of list) {
            const r = getUnitRepresentativeRecord(u);
            const rawName = String(r?.sourceFileName || '').trim();
            const key = rawName ? rawName.toLowerCase() : '__empty__';
            const label = rawName || 'Файл не указан';
            if (!byFile.has(key)) {
                byFile.set(key, { label, units: [] });
            }
            byFile.get(key).units.push(u);
        }
        const entries = [...byFile.entries()].sort((a, b) =>
            a[1].label.localeCompare(b[1].label, 'ru'),
        );
        return entries.map(([key, v]) => ({
            key: `file:${key}`,
            label: v.label,
            units: v.units,
        }));
    }

    return [{ key: 'all', label: '', units: [...list] }];
}
