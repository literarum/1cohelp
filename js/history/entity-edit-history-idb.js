'use strict';

/**
 * Персистентное хранение стеков отката/повтора по ключу сущности (IndexedDB).
 */

import {
    ENTITY_EDIT_HISTORY_STORE,
    ENTITY_HISTORY_LOCAL_MIRROR_PREFIX,
} from '../constants.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

/**
 * Резервное зеркало без Blob (только метаданные и алгоритм JSON) — второй контур при частичной деградации IDB.
 * @param {string} entityKey
 * @param {{ undoStack: unknown[], redoStack: unknown[] }} stacks
 */
export function mirrorEntityHistoryMetaToLocalStorage(entityKey, stacks) {
    try {
        if (typeof localStorage === 'undefined') return;
        const slimUndo = (stacks.undoStack || []).map((entry) => slimSnapshotForMirror(entry));
        const slimRedo = (stacks.redoStack || []).map((entry) => slimSnapshotForMirror(entry));
        localStorage.setItem(
            ENTITY_HISTORY_LOCAL_MIRROR_PREFIX + entityKey,
            JSON.stringify({
                updatedAt: new Date().toISOString(),
                undoStack: slimUndo,
                redoStack: slimRedo,
            }),
        );
    } catch (e) {
        console.warn('[entity-edit-history-idb] Зеркало localStorage не записано:', e);
    }
}

/**
 * @param {unknown} entry
 * @returns {unknown}
 */
function slimSnapshotForMirror(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.version === 1 && entry.algorithm) {
        return {
            version: 1,
            algorithm: entry.algorithm,
            screenshotRecordIds: Object.keys(entry.screenshotRecords || {}).map((k) => Number(k)),
        };
    }
    return entry;
}

/**
 * @param {string} entityKey
 * @returns {Promise<{ undoStack: unknown[], redoStack: unknown[] } | null>}
 */
export async function loadEntityHistoryStacks(entityKey) {
    const row = await getFromIndexedDB(ENTITY_EDIT_HISTORY_STORE, entityKey);
    if (row && Array.isArray(row.undoStack) && Array.isArray(row.redoStack)) {
        return { undoStack: row.undoStack, redoStack: row.redoStack };
    }
    return tryLoadMirrorFromLocalStorage(entityKey);
}

/**
 * @param {string} entityKey
 * @returns {Promise<{ undoStack: unknown[], redoStack: unknown[] } | null>}
 */
async function tryLoadMirrorFromLocalStorage(entityKey) {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(ENTITY_HISTORY_LOCAL_MIRROR_PREFIX + entityKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.undoStack) && Array.isArray(parsed.redoStack)) {
            console.warn(
                '[entity-edit-history-idb] Использовано зеркало localStorage (без бинарных скриншотов).',
            );
            return { undoStack: parsed.undoStack, redoStack: parsed.redoStack };
        }
    } catch (e) {
        console.warn('[entity-edit-history-idb] Ошибка чтения зеркала:', e);
    }
    return null;
}

/**
 * @param {string} entityKey
 * @param {{ undoStack: unknown[], redoStack: unknown[] }} stacks
 * @returns {Promise<void>}
 */
export async function persistEntityHistoryStacks(entityKey, stacks) {
    await saveToIndexedDB(ENTITY_EDIT_HISTORY_STORE, {
        id: entityKey,
        undoStack: stacks.undoStack,
        redoStack: stacks.redoStack,
        updatedAt: new Date().toISOString(),
    });
    mirrorEntityHistoryMetaToLocalStorage(entityKey, stacks);
}
