'use strict';

import {
    getAllFromIndexedDB,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
    performDBOperation,
} from '../db/indexeddb.js';
import {
    RECENTLY_DELETED_STORE_NAME,
    RECENTLY_DELETED_TRACKED_STORES,
    ARCHIVE_FOLDER_ID,
} from '../constants.js';

let deps = {
    showNotification: null,
    loadBookmarks: null,
    loadExtLinks: null,
    loadCibLinks: null,
    renderAllAlgorithms: null,
    renderReglamentCategories: null,
    loadBlacklistedClients: null,
    updateSearchIndex: null,
};

function notify(message, type = 'info') {
    if (typeof deps.showNotification === 'function') {
        deps.showNotification(message, type);
    }
}

function isTrackedStoreName(storeName) {
    return RECENTLY_DELETED_TRACKED_STORES.includes(storeName);
}

function clonePayload(payload) {
    try {
        return JSON.parse(JSON.stringify(payload));
    } catch {
        return payload;
    }
}

function ensureModal() {
    let modal = document.getElementById('recentlyDeletedModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'recentlyDeletedModal';
    modal.className =
        'fixed inset-0 bg-black bg-opacity-50 hidden z-[80] p-4 overflow-y-auto flex items-center justify-center';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
                    <i class="fas fa-trash mr-2 text-red-500"></i>Недавно удаленные
                </h2>
                <button
                    type="button"
                    data-action="close"
                    class="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                    title="Закрыть"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    Здесь хранятся удаленные материалы. Можно восстановить или удалить окончательно.
                </p>
                <button
                    type="button"
                    id="clearRecentlyDeletedBtn"
                    class="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition"
                >
                    <i class="fas fa-trash-alt mr-1"></i>Очистить корзину
                </button>
            </div>
            <div id="recentlyDeletedList" class="p-4 overflow-y-auto flex-1 space-y-2"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="close"]')) {
            closeRecentlyDeletedModal();
        }
    });
    return modal;
}

function formatDeletedDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('ru-RU');
    } catch {
        return String(iso);
    }
}

function getEntryTitle(entry) {
    const payload = entry?.payload;
    if (!payload || typeof payload !== 'object') return '(без названия)';
    if (payload.title && String(payload.title).trim()) return String(payload.title);
    if (payload.name && String(payload.name).trim()) return String(payload.name);
    if (payload.url && String(payload.url).trim()) return String(payload.url);
    if (payload.organizationName && String(payload.organizationName).trim()) {
        return String(payload.organizationName);
    }
    return `(ID: ${String(entry?.entityId ?? '—')})`;
}

function renderList(entries) {
    const list = document.getElementById('recentlyDeletedList');
    if (!list) return;
    if (!Array.isArray(entries) || entries.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10 text-gray-500 dark:text-gray-400">
                Корзина пуста.
            </div>
        `;
        return;
    }

    const html = entries
        .map((entry) => {
            const title = getEntryTitle(entry);
            return `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/40">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="font-semibold text-gray-900 dark:text-gray-100 truncate">${title}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Тип: <code>${entry.storeName}</code> ·
                                ID: <code>${String(entry.entityId)}</code> ·
                                Удалено: ${formatDeletedDate(entry.deletedAt)}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                data-action="restore"
                                data-entry-id="${String(entry.id)}"
                                class="px-3 py-1.5 text-sm bg-primary hover:bg-secondary text-white rounded-md transition"
                            >
                                <i class="fas fa-undo mr-1"></i>Восстановить
                            </button>
                            <button
                                type="button"
                                data-action="delete-permanently"
                                data-entry-id="${String(entry.id)}"
                                class="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition"
                            >
                                <i class="fas fa-times mr-1"></i>Удалить
                            </button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
    list.innerHTML = html;
}

async function refreshRelevantUI(storeName) {
    if (storeName === 'algorithms') {
        await deps.renderAllAlgorithms?.();
        return;
    }
    if (storeName === 'bookmarks' || storeName === 'bookmarkFolders') {
        await deps.loadBookmarks?.();
        return;
    }
    if (storeName === 'links') {
        await deps.loadCibLinks?.();
        return;
    }
    if (storeName === 'extLinks' || storeName === 'extLinkCategories') {
        await deps.loadExtLinks?.();
        return;
    }
    if (storeName === 'reglaments') {
        await deps.renderReglamentCategories?.();
        return;
    }
    if (storeName === 'blacklistedClients') {
        await deps.loadBlacklistedClients?.();
    }
}

async function restoreAlgorithmFromEntry(entry) {
    const payload = entry?.payload;
    const section = entry?.context?.section || payload?.section;
    if (!payload || !section) {
        throw new Error('Недостаточно данных для восстановления алгоритма');
    }
    const container = await getFromIndexedDB('algorithms', 'all');
    const currentData = container?.data && typeof container.data === 'object' ? container.data : {};
    if (!Array.isArray(currentData[section])) {
        currentData[section] = [];
    }
    const existingIdx = currentData[section].findIndex((a) => String(a?.id) === String(payload.id));
    if (existingIdx === -1) {
        currentData[section].push(payload);
    } else {
        currentData[section][existingIdx] = payload;
    }
    await saveToIndexedDB('algorithms', { section: 'all', data: currentData });
    await deps.updateSearchIndex?.('algorithms', payload.id, payload, 'add', null);
}

async function restoreGenericEntry(entry) {
    const payload = clonePayload(entry.payload);
    if (!payload || typeof payload !== 'object') {
        throw new Error('Запись восстановления повреждена');
    }
    if (entry.storeName === 'bookmarks') {
        // Не восстанавливаем архивные служебные записи как активные "материалы" без явного payload.
        if (payload.folder === ARCHIVE_FOLDER_ID && !payload.title && !payload.url) {
            throw new Error('Некорректная архивная закладка');
        }
    }
    await saveToIndexedDB(entry.storeName, payload);
    await deps.updateSearchIndex?.(
        entry.storeName,
        payload.id ?? entry.entityId,
        payload,
        'add',
        null,
    );
}

export function setRecentlyDeletedDependencies(nextDeps = {}) {
    deps = { ...deps, ...nextDeps };
}

export async function addRecentlyDeletedRecord({
    storeName,
    entityId,
    payload,
    context = null,
    reason = 'delete',
}) {
    if (!isTrackedStoreName(storeName)) return null;
    if (!payload || typeof payload !== 'object') return null;
    const record = {
        storeName,
        entityId: String(entityId),
        payload: clonePayload(payload),
        context: context && typeof context === 'object' ? clonePayload(context) : null,
        reason,
        deletedAt: new Date().toISOString(),
    };
    return saveToIndexedDB(RECENTLY_DELETED_STORE_NAME, record);
}

export async function listRecentlyDeletedRecords() {
    const items = await getAllFromIndexedDB(RECENTLY_DELETED_STORE_NAME);
    return (items || []).sort((a, b) => {
        const ta = new Date(a?.deletedAt || 0).getTime();
        const tb = new Date(b?.deletedAt || 0).getTime();
        return tb - ta;
    });
}

export async function restoreRecentlyDeletedRecord(entryId) {
    const numericId = Number(entryId);
    if (Number.isNaN(numericId)) throw new Error('Некорректный ID записи корзины');
    const entry = await getFromIndexedDB(RECENTLY_DELETED_STORE_NAME, numericId);
    if (!entry) throw new Error('Запись корзины не найдена');

    if (entry.storeName === 'algorithms') {
        await restoreAlgorithmFromEntry(entry);
    } else {
        await restoreGenericEntry(entry);
    }

    await deleteFromIndexedDB(RECENTLY_DELETED_STORE_NAME, numericId);
    await refreshRelevantUI(entry.storeName);
    return entry;
}

export async function deleteRecentlyDeletedRecord(entryId) {
    await deleteFromIndexedDB(RECENTLY_DELETED_STORE_NAME, entryId);
}

export async function clearRecentlyDeletedRecords() {
    return performDBOperation(RECENTLY_DELETED_STORE_NAME, 'readwrite', (store) => store.clear());
}

async function reloadModalList() {
    const entries = await listRecentlyDeletedRecords();
    renderList(entries);
}

export async function openRecentlyDeletedModal() {
    const modal = ensureModal();
    await reloadModalList();
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    const list = document.getElementById('recentlyDeletedList');
    if (list && !list.dataset.bound) {
        list.addEventListener('click', async (event) => {
            const btn = event.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const entryId = btn.dataset.entryId;
            if (!entryId) return;
            try {
                if (action === 'restore') {
                    await restoreRecentlyDeletedRecord(entryId);
                    notify('Запись восстановлена', 'success');
                    await reloadModalList();
                } else if (action === 'delete-permanently') {
                    await deleteRecentlyDeletedRecord(entryId);
                    notify('Запись удалена из корзины', 'info');
                    await reloadModalList();
                }
            } catch (err) {
                console.error('[recently-deleted] Action failed:', err);
                notify(`Ошибка: ${err?.message || String(err)}`, 'error');
            }
        });
        list.dataset.bound = '1';
    }

    const clearBtn = document.getElementById('clearRecentlyDeletedBtn');
    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.addEventListener('click', async () => {
            try {
                await clearRecentlyDeletedRecords();
                await reloadModalList();
                notify('Корзина очищена', 'success');
            } catch (err) {
                console.error('[recently-deleted] Clear failed:', err);
                notify('Не удалось очистить корзину', 'error');
            }
        });
        clearBtn.dataset.bound = '1';
    }
}

export function closeRecentlyDeletedModal() {
    const modal = document.getElementById('recentlyDeletedModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

export function initRecentlyDeletedSystem() {
    if (typeof window !== 'undefined') {
        window.openRecentlyDeletedModal = openRecentlyDeletedModal;
        window.closeRecentlyDeletedModal = closeRecentlyDeletedModal;
    }
}
