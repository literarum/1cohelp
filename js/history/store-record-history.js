'use strict';

/**
 * Универсальные снимки записей IndexedDB (одна запись в store + связанные скриншоты по screenshotIds).
 * Версия снимка v2 — для закладок и других сущностей с полем screenshotIds[].
 */

import { State } from '../app/state.js';
import { getFromIndexedDB } from '../db/indexeddb.js';
import {
    popRedo,
    popUndo,
    pushUndoAfterSave,
    snapshotsEqual,
} from './entity-edit-history-core.js';
import {
    deleteScreenshotRecordsNotInTarget,
    readScreenshotRecordsByIds,
} from './screenshot-history-backup.js';
import { loadEntityHistoryStacks, persistEntityHistoryStacks } from './entity-edit-history-idb.js';

export const STORE_RECORD_SNAPSHOT_VERSION = 2;

/**
 * @param {string} storeName
 * @param {string|number} recordId
 */
export function makeStoreEntityKey(storeName, recordId) {
    return `${storeName}:${String(recordId)}`;
}

/**
 * @param {object|null|undefined} record
 * @returns {number[]}
 */
export function collectScreenshotIdsFromFlatRecord(record) {
    if (!record || !Array.isArray(record.screenshotIds)) return [];
    return record.screenshotIds.filter((id) => typeof id === 'number' && Number.isFinite(id));
}

/**
 * @param {string} storeName
 * @param {object} record
 * @returns {Promise<{ version: number, storeName: string, record: object, screenshotRecords: Record<number, object> }|null>}
 */
export async function buildStoreRecordSnapshot(storeName, record) {
    if (!record || typeof record !== 'object') return null;
    const clone = JSON.parse(JSON.stringify(record));
    const ids = collectScreenshotIdsFromFlatRecord(clone);
    const screenshotRecords = await readScreenshotRecordsByIds(ids);
    return {
        version: STORE_RECORD_SNAPSHOT_VERSION,
        storeName,
        record: clone,
        screenshotRecords,
    };
}

/**
 * Запись истории после успешного сохранения сущности (режим редактирования).
 */
export async function recordStoreEntityHistoryAfterSave({
    storeName,
    recordId,
    oldRecord,
    newRecord,
}) {
    if (oldRecord === null || oldRecord === undefined) return;
    if (snapshotsEqual(oldRecord, newRecord)) return;

    const previousSnapshot = await buildStoreRecordSnapshot(storeName, oldRecord);
    if (!previousSnapshot) return;

    const entityKey = makeStoreEntityKey(storeName, recordId);
    const loaded = (await loadEntityHistoryStacks(entityKey)) || { undoStack: [], redoStack: [] };
    const next = pushUndoAfterSave(loaded, previousSnapshot);
    if (!next.changed) return;

    await persistEntityHistoryStacks(entityKey, {
        undoStack: next.undoStack,
        redoStack: next.redoStack,
    });
}

/**
 * Применяет снимок к IndexedDB (запись + скриншоты).
 * @param {{ version: number, storeName: string, record: object, screenshotRecords: Record<number, object> }} snapshot
 */
export async function applyStoreRecordSnapshotToDb(snapshot) {
    if (!snapshot || snapshot.version !== STORE_RECORD_SNAPSHOT_VERSION) {
        throw new Error('Неподдерживаемый формат снимка записи');
    }
    const { storeName, record, screenshotRecords } = snapshot;
    if (!record || typeof record.id === 'undefined') {
        throw new Error('Снимок записи без id');
    }
    const key = record.id;

    const current = await getFromIndexedDB(storeName, key);
    const currentIds = collectScreenshotIdsFromFlatRecord(current);
    const targetIds = collectScreenshotIdsFromFlatRecord(record);

    await new Promise((resolve, reject) => {
        try {
            if (!State?.db) throw new Error('База данных недоступна');
            const tx = State.db.transaction([storeName, 'screenshots'], 'readwrite');
            const screenshotsStore = tx.objectStore('screenshots');
            const store = tx.objectStore(storeName);

            const recMap = screenshotRecords || {};
            for (const k of Object.keys(recMap)) {
                const rec = recMap[k];
                if (rec && typeof rec === 'object') {
                    try {
                        screenshotsStore.put(rec);
                    } catch (e) {
                        console.warn('[store-record-history] put screenshot', k, e);
                    }
                }
            }
            deleteScreenshotRecordsNotInTarget(currentIds, targetIds, screenshotsStore);

            const putReq = store.put(record);
            putReq.onerror = () => reject(putReq.error);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Ошибка транзакции'));
            tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Откат/повтор для простой записи store + стеки в entityKey.
 * @returns {Promise<{ applied: boolean, targetRecord: object|null }>}
 */
export async function performStoreRecordHistoryStep({
    entityKey,
    storeName: _storeName,
    direction,
    buildCurrentSnapshot,
}) {
    const stacks = (await loadEntityHistoryStacks(entityKey)) || { undoStack: [], redoStack: [] };
    const currentSnap = await buildCurrentSnapshot();

    const result =
        direction === 'undo' ? popUndo(stacks, currentSnap) : popRedo(stacks, currentSnap);

    if (!result.target || result.error) {
        return { applied: false, targetRecord: null };
    }

    await applyStoreRecordSnapshotToDb(result.target);
    await persistEntityHistoryStacks(entityKey, {
        undoStack: result.undoStack,
        redoStack: result.redoStack,
    });

    return { applied: true, targetRecord: result.target.record };
}

export { popUndo, popRedo, snapshotsEqual };
