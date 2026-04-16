'use strict';

/**
 * Дифференциальная проверка критичного контура экспорта: два независимых способа чтения IndexedDB
 * (одна multi-store транзакция + getAll против последовательных одно-стор транзакций; счётчики —
 * count() в пакете против обхода openCursor) и сравнение канонических представлений на ограниченном
 * подмножестве записей, чтобы не перегружать CPU.
 */

import {
    buildExportDataObjectFromDb,
    getStoresToReadForExport,
} from './import-export.js?v=20260406health';

/** Хранилища, для которых сравнивается полное тело записей (обычно небольшие). */
export const DIFF_FULL_BODY_STORES = ['preferences', 'clientData', 'algorithms'];

/** Для прочих хранилищ — максимум записей в глубоком сравнении после сортировки по стабильному ключу. */
export const DIFF_MAX_RECORDS_PER_LARGE_STORE = 32;

/** djb2 — детерминированный хэш без Web Crypto (доступен в тестах и старых средах). */
export function djb2HashUtf8(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i += 1) {
        h = (h * 33) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
}

export function stableRecordKey(record) {
    if (record == null) return 'null';
    if (typeof record !== 'object') return `v:${String(record)}`;
    if (Object.prototype.hasOwnProperty.call(record, 'section')) {
        return `section:${String(record.section)}`;
    }
    if (record.id != null) return `id:${String(record.id)}`;
    if (record.word != null) return `word:${String(record.word)}`;
    try {
        return `j:${JSON.stringify(record).slice(0, 160)}`;
    } catch {
        return 'opaque';
    }
}

function sortKeysDeep(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v));
    const out = {};
    for (const k of Object.keys(value).sort()) {
        out[k] = sortKeysDeep(value[k]);
    }
    return out;
}

/**
 * Урезанное каноническое представление для сравнения двух путей чтения.
 * @param {{ schemaVersion?: string, data?: Record<string, unknown[]> }} exportData
 * @param {{ fullStores?: string[], maxPerLarge?: number }} [opts]
 */
export function canonicalizeExportDataForDiff(exportData, opts = {}) {
    const fullStores = new Set(opts.fullStores || DIFF_FULL_BODY_STORES);
    const maxPerLarge = opts.maxPerLarge ?? DIFF_MAX_RECORDS_PER_LARGE_STORE;
    const data = exportData?.data && typeof exportData.data === 'object' ? exportData.data : {};
    const storeNames = Object.keys(data).sort();
    const out = {
        schemaVersion: exportData?.schemaVersion ?? null,
        stores: {},
    };
    for (const sn of storeNames) {
        let rows = Array.isArray(data[sn]) ? [...data[sn]] : [];
        rows.sort((a, b) => stableRecordKey(a).localeCompare(stableRecordKey(b)));
        const useFull = fullStores.has(sn);
        const cap = useFull ? rows.length : Math.min(rows.length, maxPerLarge);
        const sliced = rows.slice(0, cap);
        out.stores[sn] = {
            totalCount: rows.length,
            comparedCount: cap,
            fullBody: useFull,
            records: sliced.map((r) => sortKeysDeep(r)),
        };
    }
    return out;
}

export function hashCanonicalExportSnapshot(canonical) {
    let text;
    try {
        text = JSON.stringify(canonical);
    } catch (e) {
        text = `stringify-failed:${e?.message || e}`;
    }
    return djb2HashUtf8(text);
}

/**
 * Подсчёт записей: один пакетный запрос count() на хранилище в общей транзакции.
 * @param {IDBDatabase} db
 * @param {string[]} storeNames
 */
export async function countRecordsBatchCountApi(db, storeNames) {
    if (!storeNames.length) return {};
    const tx = db.transaction(storeNames, 'readonly');
    const pairs = await Promise.all(
        storeNames.map(
            (sn) =>
                new Promise((resolve, reject) => {
                    const req = tx.objectStore(sn).count();
                    req.onsuccess = () => resolve([sn, req.result]);
                    req.onerror = () => reject(req.error || new Error(`count ${sn}`));
                }),
        ),
    );
    return Object.fromEntries(pairs);
}

/**
 * Подсчёт записей: «сырой» обход openCursor в отдельной транзакции на каждое хранилище.
 * @param {IDBDatabase} db
 * @param {string[]} storeNames
 */
export async function countRecordsSequentialCursor(db, storeNames) {
    const sorted = [...storeNames].sort((a, b) => a.localeCompare(b));
    const out = {};
    for (const sn of sorted) {
        const n = await new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(sn, 'readonly');
                const store = tx.objectStore(sn);
                const req = store.openCursor();
                let c = 0;
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) {
                        resolve(c);
                        return;
                    }
                    c += 1;
                    cursor.continue();
                };
                req.onerror = () => reject(req.error || new Error(`cursor ${sn}`));
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
        out[sn] = n;
    }
    return out;
}

export function countsEqual(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if ((a[k] ?? -1) !== (b[k] ?? -2)) return false;
    }
    return true;
}

/**
 * @param {IDBDatabase} db
 * @param {{ quiet?: boolean, deepExportCompare?: boolean }} [options]
 *        deepExportCompare=false — только контур счётчиков (batch count vs cursor), без двойного полного чтения экспорта.
 * @returns {Promise<{ ok: boolean, tier1Ok: boolean, tier2Ok: boolean, hashBatch?: string, hashSequential?: string, detail?: string }>}
 */
export async function runExportImportDifferentialCheck(db, options = {}) {
    const { quiet = true, deepExportCompare = true } = options;
    if (!db || !db.objectStoreNames) {
        return {
            ok: false,
            tier1Ok: false,
            tier2Ok: false,
            detail: 'Нет подключения к IndexedDB.',
        };
    }

    const storeNames = getStoresToReadForExport(db);
    if (storeNames.length === 0) {
        return { ok: true, tier1Ok: true, tier2Ok: true, detail: 'Нет хранилищ для экспорта.' };
    }

    let tier1Ok = true;
    try {
        const batchCounts = await countRecordsBatchCountApi(db, storeNames);
        const cursorCounts = await countRecordsSequentialCursor(db, storeNames);
        if (!countsEqual(batchCounts, cursorCounts)) {
            tier1Ok = false;
            const sample = storeNames
                .filter((sn) => batchCounts[sn] !== cursorCounts[sn])
                .slice(0, 6)
                .map((sn) => `${sn}: count=${batchCounts[sn]} vs cursor=${cursorCounts[sn]}`)
                .join('; ');
            return {
                ok: false,
                tier1Ok: false,
                tier2Ok: false,
                detail: `Расхождение счётчиков записей (batch count vs cursor): ${sample}`,
            };
        }
    } catch (e) {
        return {
            ok: false,
            tier1Ok: false,
            tier2Ok: false,
            detail: `Ошибка контура счётчиков: ${e?.message || e}`,
        };
    }

    if (!deepExportCompare) {
        return {
            ok: true,
            tier1Ok: true,
            tier2Ok: true,
            detail: 'Контур счётчиков (batch count vs cursor) совпал; глубокое сравнение снимков отключено для экономии CPU.',
        };
    }

    let batchPayload;
    let seqPayload;
    try {
        [batchPayload, seqPayload] = await Promise.all([
            buildExportDataObjectFromDb(db, { quiet, readMode: 'batch' }),
            buildExportDataObjectFromDb(db, { quiet, readMode: 'sequential' }),
        ]);
    } catch (e) {
        return {
            ok: false,
            tier1Ok,
            tier2Ok: false,
            detail: `Ошибка чтения снимков экспорта: ${e?.message || e}`,
        };
    }

    if (!batchPayload || !seqPayload) {
        return {
            ok: false,
            tier1Ok,
            tier2Ok: false,
            detail: 'Пустой снимок экспорта по одному из контуров.',
        };
    }

    const canonBatch = canonicalizeExportDataForDiff(batchPayload);
    const canonSeq = canonicalizeExportDataForDiff(seqPayload);
    const hashBatch = hashCanonicalExportSnapshot(canonBatch);
    const hashSequential = hashCanonicalExportSnapshot(canonSeq);

    const tier2Ok = hashBatch === hashSequential;
    return {
        ok: tier1Ok && tier2Ok,
        tier1Ok,
        tier2Ok,
        hashBatch,
        hashSequential,
        detail: tier2Ok
            ? 'Контуры batch-getAll и sequential-getAll совпали (канонический хэш ограниченного набора).'
            : `Расхождение канонических хэшей: batch=${hashBatch} sequential=${hashSequential}`,
    };
}
