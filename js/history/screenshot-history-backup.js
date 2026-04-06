'use strict';

import { State } from '../app/state.js';

/**
 * Собирает числовые id скриншотов из шагов алгоритма.
 * @param {object|null|undefined} algorithm
 * @returns {number[]}
 */
export function collectScreenshotIdsFromAlgorithmSteps(algorithm) {
    const ids = [];
    if (!algorithm || !Array.isArray(algorithm.steps)) return ids;
    for (const step of algorithm.steps) {
        if (!step || typeof step !== 'object') continue;
        if (!Array.isArray(step.screenshotIds)) continue;
        for (const id of step.screenshotIds) {
            if (typeof id === 'number' && Number.isFinite(id)) ids.push(id);
        }
    }
    return ids;
}

/**
 * Читает записи скриншотов по id (для резервного контура отката).
 * @param {number[]} ids
 * @returns {Promise<Record<number, object>>}
 */
export async function readScreenshotRecordsByIds(ids) {
    const out = {};
    if (!ids || ids.length === 0 || !State?.db) return out;

    const unique = [...new Set(ids)];
    await Promise.all(
        unique.map(
            (id) =>
                new Promise((resolve) => {
                    try {
                        const tx = State.db.transaction(['screenshots'], 'readonly');
                        const store = tx.objectStore('screenshots');
                        const req = store.get(id);
                        req.onsuccess = () => {
                            if (req.result) out[id] = req.result;
                            resolve();
                        };
                        req.onerror = () => resolve();
                    } catch {
                        resolve();
                    }
                }),
        ),
    );
    return out;
}

/**
 * Удаляет записи скриншотов, id которых есть в currentIds, но нет в targetIds.
 * @param {number[]} currentIds
 * @param {number[]} targetIds
 * @param {IDBObjectStore} screenshotsStore
 */
export function deleteScreenshotRecordsNotInTarget(currentIds, targetIds, screenshotsStore) {
    const keep = new Set(targetIds);
    for (const id of currentIds) {
        if (!keep.has(id)) {
            try {
                screenshotsStore.delete(id);
            } catch (e) {
                console.warn('[screenshot-history-backup] delete id', id, e);
            }
        }
    }
}
