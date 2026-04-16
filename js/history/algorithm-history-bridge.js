'use strict';

/**
 * Откат/повтор версий карточки алгоритма (главный и разделы) с устойчивым хранением в IndexedDB
 * и резервным зеркалом метаданных. Скриншоты: снимок записей IndexedDB до удаления.
 */

import { State } from '../app/state.js';
import { popRedo, popUndo, pushUndoAfterSave, snapshotsEqual } from './entity-edit-history-core.js';
import {
    collectScreenshotIdsFromAlgorithmSteps,
    readScreenshotRecordsByIds,
    deleteScreenshotRecordsNotInTarget,
} from './screenshot-history-backup.js';
import { loadEntityHistoryStacks, persistEntityHistoryStacks } from './entity-edit-history-idb.js';

let algorithms = null;
let showNotification = null;
let editAlgorithm = null;
let updateSearchIndex = null;
let renderMainAlgorithm = null;
let renderAlgorithmCards = null;
let hasChanges = null;
let showAppConfirm = null;

export function setAlgorithmHistoryDependencies(deps) {
    if (deps.algorithms !== undefined) algorithms = deps.algorithms;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.editAlgorithm !== undefined) editAlgorithm = deps.editAlgorithm;
    if (deps.updateSearchIndex !== undefined) updateSearchIndex = deps.updateSearchIndex;
    if (deps.renderMainAlgorithm !== undefined) renderMainAlgorithm = deps.renderMainAlgorithm;
    if (deps.renderAlgorithmCards !== undefined) renderAlgorithmCards = deps.renderAlgorithmCards;
    if (deps.hasChanges !== undefined) hasChanges = deps.hasChanges;
    if (deps.showAppConfirm !== undefined) showAppConfirm = deps.showAppConfirm;
}

/**
 * @param {string} section
 * @param {string} algorithmIdStr
 * @returns {string}
 */
export function algorithmEntityKey(section, algorithmIdStr) {
    return section === 'main' ? 'algorithm:main' : `algorithm:${String(algorithmIdStr)}`;
}

/**
 * @param {object} algorithm
 * @returns {Promise<{ version: 1, algorithm: object, screenshotRecords: Record<number, object> } | null>}
 */
export async function buildAlgorithmSnapshotForHistory(algorithm) {
    if (!algorithm || typeof algorithm !== 'object') return null;
    const clone = JSON.parse(JSON.stringify(algorithm));
    const ids = collectScreenshotIdsFromAlgorithmSteps(clone);
    const screenshotRecords = await readScreenshotRecordsByIds(ids);
    return { version: 1, algorithm: clone, screenshotRecords };
}

/**
 * @param {string} section
 * @param {string} algorithmIdStr
 * @returns {Promise<object|null>}
 */
async function buildCurrentAlgorithmSnapshot(section, algorithmIdStr) {
    const isMain = section === 'main';
    let algo = null;
    if (isMain) {
        algo = algorithms?.main;
    } else if (algorithms?.[section]) {
        algo = algorithms[section].find((a) => String(a?.id) === String(algorithmIdStr));
    }
    if (!algo) return null;
    return buildAlgorithmSnapshotForHistory(JSON.parse(JSON.stringify(algo)));
}

/**
 * @param {object} algorithmData
 * @param {string} section
 * @param {string} algorithmIdStr
 * @param {object} targetAlgorithms — объект algorithms (глобальный или клон)
 */
function applyAlgorithmEntryToMemory(algorithmData, section, algorithmIdStr, targetAlgorithms) {
    const isMain = section === 'main';
    if (isMain) {
        targetAlgorithms.main = algorithmData;
    } else {
        if (!targetAlgorithms[section]) targetAlgorithms[section] = [];
        const idx = targetAlgorithms[section].findIndex(
            (a) => String(a?.id) === String(algorithmIdStr),
        );
        if (idx >= 0) {
            targetAlgorithms[section][idx] = algorithmData;
        } else {
            targetAlgorithms[section].push(algorithmData);
        }
    }
}

/**
 * Заменяет содержимое глобального algorithms данными успешно сохранённого клона.
 * @param {object} nextAlgorithms
 */
function replaceAlgorithmsRoot(nextAlgorithms) {
    for (const k of Object.keys(algorithms)) {
        delete algorithms[k];
    }
    Object.assign(algorithms, nextAlgorithms);
}

/**
 * @param {{ version: 1, algorithm: object, screenshotRecords: Record<number, object> }} entry
 * @param {string} section
 * @param {string} algorithmIdStr
 * @returns {Promise<void>}
 */
async function persistAlgorithmSnapshotToStores(entry, section, algorithmIdStr) {
    if (!State?.db) throw new Error('База данных недоступна');
    const isMain = section === 'main';
    let beforeAlgo = null;
    if (isMain) {
        beforeAlgo = algorithms?.main ? JSON.parse(JSON.stringify(algorithms.main)) : null;
    } else {
        const found = algorithms?.[section]?.find((a) => String(a?.id) === String(algorithmIdStr));
        beforeAlgo = found ? JSON.parse(JSON.stringify(found)) : null;
    }
    const currentIds = collectScreenshotIdsFromAlgorithmSteps(beforeAlgo);
    const targetIds = collectScreenshotIdsFromAlgorithmSteps(entry.algorithm);

    const nextAlgorithms = JSON.parse(JSON.stringify(algorithms));
    applyAlgorithmEntryToMemory(entry.algorithm, section, algorithmIdStr, nextAlgorithms);

    await new Promise((resolve, reject) => {
        try {
            const tx = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
            const screenshotsStore = tx.objectStore('screenshots');
            const algorithmsStore = tx.objectStore('algorithms');

            const recMap = entry.screenshotRecords || {};
            for (const k of Object.keys(recMap)) {
                const rec = recMap[k];
                if (rec && typeof rec === 'object') {
                    try {
                        screenshotsStore.put(rec);
                    } catch (e) {
                        console.warn('[algorithm-history-bridge] put screenshot', k, e);
                    }
                }
            }
            deleteScreenshotRecordsNotInTarget(currentIds, targetIds, screenshotsStore);

            const putReq = algorithmsStore.put({ section: 'all', data: nextAlgorithms });
            putReq.onerror = () => reject(putReq.error);

            tx.oncomplete = () => {
                replaceAlgorithmsRoot(nextAlgorithms);
                resolve();
            };
            tx.onerror = () => reject(tx.error || new Error('Ошибка транзакции'));
            tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Запись в историю после успешного сохранения (снимок состояния до записи на диск).
 */
export async function recordAlgorithmHistoryAfterSuccessfulSave({
    section,
    algorithmIdStr,
    isMainAlgo: _isMainAlgo,
    oldAlgorithm,
    newAlgorithm,
}) {
    if (!oldAlgorithm || typeof oldAlgorithm !== 'object') return;
    if (snapshotsEqual(oldAlgorithm, newAlgorithm)) return;

    const previousSnapshot = await buildAlgorithmSnapshotForHistory(oldAlgorithm);
    if (!previousSnapshot) return;

    const key = algorithmEntityKey(section, algorithmIdStr);
    const loaded = (await loadEntityHistoryStacks(key)) || { undoStack: [], redoStack: [] };
    const next = pushUndoAfterSave(loaded, previousSnapshot);
    if (!next.changed) return;

    await persistEntityHistoryStacks(key, {
        undoStack: next.undoStack,
        redoStack: next.redoStack,
    });
}

/**
 * @returns {Promise<boolean>}
 */
async function confirmDiscardUnsavedIfNeeded() {
    if (typeof hasChanges === 'function' && hasChanges('edit')) {
        if (typeof showAppConfirm === 'function') {
            return showAppConfirm({
                title: 'Откат версии',
                message:
                    'Есть несохранённые изменения в форме. Отменить их и перейти к предыдущей сохранённой версии карточки?',
                confirmText: 'Продолжить',
                cancelText: 'Отмена',
            });
        }
        return confirm(
            'Есть несохранённые изменения. Отменить их и откатить к предыдущей сохранённой версии?',
        );
    }
    return true;
}

/**
 * @param {'undo'|'redo'} direction
 * @returns {Promise<void>}
 */
export async function performAlgorithmHistoryStep(direction) {
    const editModal = document.getElementById('editModal');
    if (!editModal || editModal.classList.contains('hidden')) return;

    const section = editModal.dataset.section;
    const algorithmIdStr = editModal.dataset.algorithmId;
    if (!section || !algorithmIdStr) return;

    const ok = await confirmDiscardUnsavedIfNeeded();
    if (!ok) return;

    const key = algorithmEntityKey(section, algorithmIdStr);
    const stacks = (await loadEntityHistoryStacks(key)) || { undoStack: [], redoStack: [] };
    const currentSnap = await buildCurrentAlgorithmSnapshot(section, algorithmIdStr);

    const result =
        direction === 'undo' ? popUndo(stacks, currentSnap) : popRedo(stacks, currentSnap);

    if (!result.target || result.error) {
        showNotification?.(
            direction === 'undo' ? 'Нет сохранённых версий для отката.' : 'Нет версий для повтора.',
            'warning',
        );
        return;
    }

    try {
        await persistAlgorithmSnapshotToStores(result.target, section, algorithmIdStr);

        await persistEntityHistoryStacks(key, {
            undoStack: result.undoStack,
            redoStack: result.redoStack,
        });

        const idxId = section === 'main' ? 'main' : result.target.algorithm?.id || algorithmIdStr;
        if (typeof updateSearchIndex === 'function' && result.target.algorithm) {
            updateSearchIndex('algorithms', idxId, result.target.algorithm, 'update', null).catch(
                (e) => console.warn('[algorithm-history-bridge] search index', e),
            );
        }

        if (section === 'main' && typeof renderMainAlgorithm === 'function') {
            await renderMainAlgorithm();
        } else if (typeof renderAlgorithmCards === 'function') {
            renderAlgorithmCards(section);
        }

        if (typeof editAlgorithm === 'function') {
            await editAlgorithm(algorithmIdStr, section);
        }

        showNotification?.(
            direction === 'undo'
                ? 'Восстановлена предыдущая сохранённая версия.'
                : 'Восстановлена следующая версия.',
            'success',
        );
    } catch (e) {
        console.error('[algorithm-history-bridge]', e);
        showNotification?.(
            'Не удалось применить откат/повтор. Попробуйте ещё раз или перезагрузите страницу.',
            'error',
        );
    } finally {
        await refreshAlgorithmHistoryToolbar();
    }
}

export async function performAlgorithmUndo() {
    return performAlgorithmHistoryStep('undo');
}

export async function performAlgorithmRedo() {
    return performAlgorithmHistoryStep('redo');
}

/**
 * Обновляет доступность кнопок в шапке модалки редактирования.
 */
export async function refreshAlgorithmHistoryToolbar() {
    const editModal = document.getElementById('editModal');
    const undoBtn = document.getElementById('editAlgorithmUndoBtn');
    const redoBtn = document.getElementById('editAlgorithmRedoBtn');
    if (!undoBtn && !redoBtn) return;

    if (!editModal || editModal.classList.contains('hidden')) {
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
        return;
    }

    const section = editModal.dataset.section;
    const algorithmIdStr = editModal.dataset.algorithmId;
    if (!section || !algorithmIdStr) {
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
        return;
    }

    const key = algorithmEntityKey(section, algorithmIdStr);
    const stacks = (await loadEntityHistoryStacks(key)) || { undoStack: [], redoStack: [] };
    if (undoBtn) undoBtn.disabled = !stacks.undoStack?.length;
    if (redoBtn) redoBtn.disabled = !stacks.redoStack?.length;
}

/**
 * Подписка на кнопки (вызывать после загрузки DOM).
 */
export function initAlgorithmEditHistoryToolbarUi() {
    const undoBtn = document.getElementById('editAlgorithmUndoBtn');
    const redoBtn = document.getElementById('editAlgorithmRedoBtn');
    undoBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        performAlgorithmUndo();
    });
    redoBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        performAlgorithmRedo();
    });
}
