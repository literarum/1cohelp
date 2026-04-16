'use strict';

/**
 * Единая точка отката/повтора для модальных форм с записями в IndexedDB (кроме алгоритмов — см. algorithm-history-bridge).
 */

import { getFromIndexedDB } from '../db/indexeddb.js';
import {
    buildStoreRecordSnapshot,
    makeStoreEntityKey,
    performStoreRecordHistoryStep,
    recordStoreEntityHistoryAfterSave,
} from './store-record-history.js';
import { loadEntityHistoryStacks } from './entity-edit-history-idb.js';

let showNotification = null;
let showAppConfirm = null;
let updateSearchIndex = null;

/** @type {Record<string, unknown>} */
let deps = {};

export function setModalEntityHistoryDependencies(d) {
    deps = { ...deps, ...d };
    if (d.showNotification !== undefined) showNotification = d.showNotification;
    if (d.showAppConfirm !== undefined) showAppConfirm = d.showAppConfirm;
    if (d.updateSearchIndex !== undefined) updateSearchIndex = d.updateSearchIndex;
}

export { recordStoreEntityHistoryAfterSave };

/**
 * Конфиг модалки: storeName, получение id записи из DOM, перезагрузка UI после шага.
 * afterApply: опционально обновить списки/индекс.
 */
function registry() {
    return {
        bookmarkModal: {
            storeName: 'bookmarks',
            getRecordId: (modal) => {
                const v = modal.querySelector('#bookmarkId')?.value;
                return v ? parseInt(v, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.showAddBookmarkModal === 'function')
                    await deps.showAddBookmarkModal(id);
            },
            afterApply: async (record) => {
                if (typeof deps.loadBookmarks === 'function') await deps.loadBookmarks();
                if (updateSearchIndex) {
                    updateSearchIndex('bookmarks', record.id, record, 'update', null).catch(
                        () => {},
                    );
                }
            },
        },
        cibLinkModal: {
            storeName: 'links',
            getRecordId: (modal) => {
                const v = modal.querySelector('#cibLinkId')?.value;
                return v ? parseInt(v, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.showAddEditCibLinkModal === 'function')
                    await deps.showAddEditCibLinkModal(id);
            },
            afterApply: async (record) => {
                if (typeof deps.loadCibLinks === 'function') deps.loadCibLinks();
                if (updateSearchIndex) {
                    updateSearchIndex('links', record.id, record, 'update', null).catch(() => {});
                }
            },
        },
        extLinkModal: {
            storeName: 'extLinks',
            getRecordId: (modal) => {
                const v = modal.querySelector('#extLinkId')?.value;
                return v ? parseInt(v, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.showEditExtLinkModal === 'function')
                    await deps.showEditExtLinkModal(id);
            },
            afterApply: async (record) => {
                if (typeof deps.renderExtLinks === 'function') await deps.renderExtLinks();
                if (updateSearchIndex) {
                    updateSearchIndex('extLinks', record.id, record, 'update', null).catch(
                        () => {},
                    );
                }
            },
        },
        reglamentModal: {
            storeName: 'reglaments',
            getRecordId: (modal) => {
                const v = modal.querySelector('#reglamentId')?.value;
                return v ? parseInt(v, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.editReglament === 'function') await deps.editReglament(id);
            },
            afterApply: async (record) => {
                if (typeof deps.reloadReglamentsUi === 'function') await deps.reloadReglamentsUi();
                if (updateSearchIndex) {
                    updateSearchIndex('reglaments', record.id, record, 'update', null).catch(
                        () => {},
                    );
                }
            },
        },
        blacklistEntryModal: {
            storeName: 'blacklistedClients',
            getRecordId: (modal) => {
                const v = modal.querySelector('#blacklistEntryId')?.value;
                return v ? parseInt(v, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.showBlacklistEntryModal === 'function')
                    await deps.showBlacklistEntryModal(id);
            },
            afterApply: async (record) => {
                if (typeof deps.refreshBlacklistAfterHistory === 'function')
                    await deps.refreshBlacklistAfterHistory();
                if (updateSearchIndex) {
                    updateSearchIndex(
                        'blacklistedClients',
                        record.id,
                        record,
                        'update',
                        null,
                    ).catch(() => {});
                }
            },
        },
        foldersModal: {
            storeName: 'bookmarkFolders',
            getRecordId: (modal) => {
                const form = modal.querySelector('#folderForm');
                const ed = form?.dataset?.editingId;
                return ed ? parseInt(ed, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.reloadBookmarkFolderForm === 'function')
                    await deps.reloadBookmarkFolderForm(id);
            },
            afterApply: async (record) => {
                if (typeof deps.afterBookmarkFolderHistory === 'function')
                    await deps.afterBookmarkFolderHistory();
                if (updateSearchIndex) {
                    updateSearchIndex('bookmarkFolders', record.id, record, 'update', null).catch(
                        () => {},
                    );
                }
            },
        },
        extLinkCategoriesModal: {
            storeName: 'extLinkCategories',
            getRecordId: (modal) => {
                const form = modal.querySelector('#extLinkCategoryForm');
                const ed = form?.dataset?.editingId;
                return ed ? parseInt(ed, 10) : null;
            },
            reloadUi: async (id) => {
                if (typeof deps.reloadExtLinkCategoryForm === 'function')
                    await deps.reloadExtLinkCategoryForm(id);
            },
            afterApply: async (record) => {
                if (typeof deps.afterExtLinkCategoryHistory === 'function')
                    await deps.afterExtLinkCategoryHistory();
                if (updateSearchIndex) {
                    updateSearchIndex('extLinkCategories', record.id, record, 'update', null).catch(
                        () => {},
                    );
                }
            },
        },
    };
}

async function confirmDiscardIfNeeded() {
    if (typeof showAppConfirm === 'function') {
        return showAppConfirm({
            title: 'Версии записи',
            message:
                'Отменить несохранённые изменения в форме и перейти к другой сохранённой версии из истории?',
            confirmText: 'Продолжить',
            cancelText: 'Отмена',
        });
    }
    return confirm('Отменить несохранённые изменения и перейти к версии из истории?');
}

/**
 * @param {string} modalId
 * @param {'undo'|'redo'} direction
 */
export async function performModalEntityHistoryStep(modalId, direction) {
    const cfg = registry()[modalId];
    if (!cfg) return;

    const modal = document.getElementById(modalId);
    if (!modal || modal.classList.contains('hidden')) return;

    const ok = await confirmDiscardIfNeeded();
    if (!ok) return;

    const recordId = cfg.getRecordId(modal);
    if (recordId === null || recordId === undefined || Number.isNaN(recordId)) {
        showNotification?.('Не удалось определить запись для истории версий.', 'warning');
        return;
    }

    const entityKey = makeStoreEntityKey(cfg.storeName, recordId);

    try {
        const buildCurrent = async () => {
            const cur = await getFromIndexedDB(cfg.storeName, recordId);
            return buildStoreRecordSnapshot(cfg.storeName, cur);
        };

        const { applied, targetRecord } = await performStoreRecordHistoryStep({
            entityKey,
            storeName: cfg.storeName,
            direction,
            buildCurrentSnapshot: buildCurrent,
        });

        if (!applied || !targetRecord) {
            showNotification?.(
                direction === 'undo'
                    ? 'Нет сохранённых версий для отката.'
                    : 'Нет версий для повтора.',
                'warning',
            );
            await refreshModalEntityHistoryToolbar(modalId);
            return;
        }

        await cfg.reloadUi(recordId);
        if (typeof cfg.afterApply === 'function') {
            await cfg.afterApply(targetRecord);
        }

        showNotification?.(
            direction === 'undo'
                ? 'Восстановлена предыдущая сохранённая версия.'
                : 'Восстановлена следующая версия.',
            'success',
        );
    } catch (e) {
        console.error('[modal-entity-history]', e);
        showNotification?.('Не удалось применить откат/повтор.', 'error');
    } finally {
        await refreshModalEntityHistoryToolbar(modalId);
    }
}

export async function performModalEntityUndo(modalId) {
    return performModalEntityHistoryStep(modalId, 'undo');
}

export async function performModalEntityRedo(modalId) {
    return performModalEntityHistoryStep(modalId, 'redo');
}

/**
 * @param {string} modalId
 */
export async function refreshModalEntityHistoryToolbar(modalId) {
    const cfg = registry()[modalId];
    const undoBtn = document.getElementById(`${modalId}UndoBtn`);
    const redoBtn = document.getElementById(`${modalId}RedoBtn`);
    if (!undoBtn && !redoBtn) return;

    if (!cfg) {
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
        return;
    }

    const modal = document.getElementById(modalId);
    if (!modal || modal.classList.contains('hidden')) {
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
        return;
    }

    const recordId = cfg.getRecordId(modal);
    if (recordId === null || recordId === undefined || Number.isNaN(recordId)) {
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
        return;
    }

    const entityKey = makeStoreEntityKey(cfg.storeName, recordId);
    const stacks = (await loadEntityHistoryStacks(entityKey)) || { undoStack: [], redoStack: [] };
    if (undoBtn) undoBtn.disabled = !stacks.undoStack?.length;
    if (redoBtn) redoBtn.disabled = !stacks.redoStack?.length;
}

/** Панель «Информация по обращению» — не модалка, id фиктивный для кнопок. */
export async function refreshClientDataHistoryToolbar() {
    const undoBtn = document.getElementById('clientDataUndoBtn');
    const redoBtn = document.getElementById('clientDataRedoBtn');
    if (!undoBtn && !redoBtn) return;
    const entityKey = makeStoreEntityKey('clientData', 'current');
    const stacks = (await loadEntityHistoryStacks(entityKey)) || { undoStack: [], redoStack: [] };
    if (undoBtn) undoBtn.disabled = !stacks.undoStack?.length;
    if (redoBtn) redoBtn.disabled = !stacks.redoStack?.length;
}

export async function performClientDataHistoryStep(direction) {
    const ok = await confirmDiscardIfNeeded();
    if (!ok) return;
    const entityKey = makeStoreEntityKey('clientData', 'current');
    const buildCurrent = async () => {
        const cur = await getFromIndexedDB('clientData', 'current');
        return buildStoreRecordSnapshot('clientData', cur);
    };
    try {
        const { applied, targetRecord } = await performStoreRecordHistoryStep({
            entityKey,
            storeName: 'clientData',
            direction,
            buildCurrentSnapshot: buildCurrent,
        });
        if (!applied || !targetRecord) {
            showNotification?.(
                direction === 'undo' ? 'Нет версий для отката.' : 'Нет версий для повтора.',
                'warning',
            );
            await refreshClientDataHistoryToolbar();
            return;
        }
        const ta = document.getElementById('clientNotes');
        if (ta) ta.value = targetRecord.notes ?? '';
        if (updateSearchIndex) {
            updateSearchIndex('clientData', 'current', targetRecord, 'update', null).catch(
                () => {},
            );
        }
        showNotification?.(
            direction === 'undo'
                ? 'Восстановлена предыдущая версия заметок.'
                : 'Восстановлена следующая версия.',
            'success',
        );
    } catch (e) {
        console.error('[modal-entity-history clientData]', e);
        showNotification?.('Не удалось применить откат/повтор.', 'error');
    } finally {
        await refreshClientDataHistoryToolbar();
    }
}

const MODAL_IDS_WITH_HISTORY = [
    'bookmarkModal',
    'cibLinkModal',
    'extLinkModal',
    'reglamentModal',
    'blacklistEntryModal',
    'foldersModal',
    'extLinkCategoriesModal',
];

/**
 * Вызывать после открытия модалки с известным id записи.
 */
export async function refreshHistoryToolbarForOpenModals() {
    for (const id of MODAL_IDS_WITH_HISTORY) {
        const m = document.getElementById(id);
        if (m && !m.classList.contains('hidden')) {
            await refreshModalEntityHistoryToolbar(id);
        }
    }
    await refreshClientDataHistoryToolbar();
}

/**
 * Подвязка кнопок по соглашению id = {modalId}UndoBtn / RedoBtn.
 * Делегирование с document.body — кнопки в модалках, создаваемых динамически, подхватываются без повторной инициализации.
 */
export function initModalEntityHistoryToolbarButtons() {
    if (typeof document === 'undefined' || document.body.dataset.modalEntityHistoryClickBound)
        return;
    document.body.dataset.modalEntityHistoryClickBound = '1';

    document.body.addEventListener(
        'click',
        (e) => {
            const btn = e.target.closest('button');
            if (!btn?.id) return;

            if (btn.id === 'clientDataUndoBtn') {
                e.preventDefault();
                performClientDataHistoryStep('undo');
                return;
            }
            if (btn.id === 'clientDataRedoBtn') {
                e.preventDefault();
                performClientDataHistoryStep('redo');
                return;
            }

            if (btn.id.endsWith('UndoBtn')) {
                const modalId = btn.id.slice(0, -'UndoBtn'.length);
                if (MODAL_IDS_WITH_HISTORY.includes(modalId)) {
                    e.preventDefault();
                    performModalEntityUndo(modalId);
                }
                return;
            }
            if (btn.id.endsWith('RedoBtn')) {
                const modalId = btn.id.slice(0, -'RedoBtn'.length);
                if (MODAL_IDS_WITH_HISTORY.includes(modalId)) {
                    e.preventDefault();
                    performModalEntityRedo(modalId);
                }
            }
        },
        false,
    );
}

export { MODAL_IDS_WITH_HISTORY };
