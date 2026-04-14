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
import {
    activateModalFocus,
    deactivateModalFocus,
    enhanceModalAccessibility,
} from '../ui/modals-manager.js';

/** Текст компактного подтверждения очистки корзины (дублируется в fallback showAppConfirm). */
export const RECENTLY_DELETED_CLEAR_BIN_CONFIRM_MESSAGE =
    'Вы уверены, что хотите безвозвратно удалить эти файлы? Восстановить их будет невозможно.';

let deps = {
    showNotification: null,
    showAppConfirm: null,
    /** Переопределение для тестов: Promise<boolean> вместо встроенной компактной модалки. */
    showRecentlyDeletedClearConfirm: null,
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

/**
 * Собирает объект записи для стора recentlyDeleted (без записи в БД).
 * Используется там, где запись должна попасть в уже открытую транзакцию IndexedDB.
 */
export function buildRecentlyDeletedRecord({
    storeName,
    entityId,
    payload,
    context = null,
    reason = 'delete',
}) {
    if (!isTrackedStoreName(storeName)) return null;
    if (!payload || typeof payload !== 'object') return null;
    return {
        storeName,
        entityId: String(entityId),
        payload: clonePayload(payload),
        context: context && typeof context === 'object' ? clonePayload(context) : null,
        reason,
        deletedAt: new Date().toISOString(),
    };
}

function ensureModal() {
    let modal = document.getElementById('recentlyDeletedModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'recentlyDeletedModal';
    modal.className =
        'fixed inset-0 bg-black bg-opacity-50 hidden z-[100] p-4 overflow-y-auto flex items-center justify-center';
    modal.innerHTML = `
        <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
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
            <div
                id="recentlyDeletedClearConfirmPanel"
                class="hidden absolute inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
                aria-hidden="true"
            >
                <div
                    id="recentlyDeletedClearConfirmCard"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="recentlyDeletedClearConfirmTitle"
                    aria-describedby="recentlyDeletedClearConfirmDesc"
                    class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-5 border border-gray-200 dark:border-gray-700 outline-none"
                    tabindex="-1"
                >
                    <h3
                        id="recentlyDeletedClearConfirmTitle"
                        class="text-base font-semibold text-gray-900 dark:text-gray-100"
                    >
                        Безвозвратное удаление
                    </h3>
                    <p
                        id="recentlyDeletedClearConfirmDesc"
                        class="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed"
                    >
                        ${RECENTLY_DELETED_CLEAR_BIN_CONFIRM_MESSAGE}
                    </p>
                    <div class="mt-5 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            id="recentlyDeletedClearConfirmCancel"
                            class="px-4 py-2 rounded-md font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 transition"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            id="recentlyDeletedClearConfirmOk"
                            class="px-4 py-2 rounded-md font-medium bg-red-600 hover:bg-red-700 text-white transition"
                        >
                            Удалить безвозвратно
                        </button>
                    </div>
                </div>
            </div>
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
    const record = buildRecentlyDeletedRecord({
        storeName,
        entityId,
        payload,
        context,
        reason,
    });
    if (!record) return null;
    return saveToIndexedDB(RECENTLY_DELETED_STORE_NAME, record);
}

let recentlyDeletedDedupeAnonSeq = 0;

/** Сброс компактного подтверждения при закрытии окна корзины (избегаем «висящего» Promise). */
let abortPendingClearConfirm = null;

function dedupeKeyForRecentlyDeletedEntry(entry) {
    if (entry?.storeName && entry.entityId != null && String(entry.entityId) !== '') {
        return `${entry.storeName}|${String(entry.entityId)}`;
    }
    if (entry?.id != null) return `__id__|${String(entry.id)}`;
    recentlyDeletedDedupeAnonSeq += 1;
    return `__anon__|${recentlyDeletedDedupeAnonSeq}`;
}

/**
 * Список записей корзины: новые сверху, без дублей одной сущности (storeName+entityId).
 * Дубликаты возможны при гонках UI; в UI и восстановлении достаточно последнего снимка.
 */
export async function listRecentlyDeletedRecords() {
    const items = await getAllFromIndexedDB(RECENTLY_DELETED_STORE_NAME);
    const sorted = (items || []).sort((a, b) => {
        const ta = new Date(a?.deletedAt || 0).getTime();
        const tb = new Date(b?.deletedAt || 0).getTime();
        return tb - ta;
    });
    const seen = new Set();
    const out = [];
    for (const entry of sorted) {
        const key = dedupeKeyForRecentlyDeletedEntry(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(entry);
    }
    return out;
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

/**
 * Окончательное удаление одной записи из корзины после явного подтверждения
 * (централизованная модалка приложения, как в прочих разделах).
 * @returns {{ removed: boolean, cancelled: boolean }}
 */
export async function permanentlyRemoveRecentlyDeletedEntryWithUserConfirm(entryId) {
    const numericId = Number(entryId);
    if (Number.isNaN(numericId)) {
        throw new Error('Некорректный ID записи корзины');
    }
    const entry = await getFromIndexedDB(RECENTLY_DELETED_STORE_NAME, numericId);
    if (!entry) {
        throw new Error('Запись корзины не найдена');
    }
    const itemTitle = getEntryTitle(entry);
    const message = `Вы уверены, что хотите окончательно удалить «${itemTitle}» из корзины? Восстановить данные будет невозможно.`;
    const confirmed =
        typeof deps.showAppConfirm === 'function'
            ? await deps.showAppConfirm({
                  title: 'Окончательное удаление',
                  message,
                  confirmText: 'Удалить навсегда',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : typeof window !== 'undefined' && window.confirm
              ? window.confirm(message)
              : false;
    if (!confirmed) {
        return { removed: false, cancelled: true };
    }
    await deleteRecentlyDeletedRecord(numericId);
    return { removed: true, cancelled: false };
}

/**
 * Компактная модалка поверх окна корзины (второй контур подтверждения, HIG-style destructive dialog).
 * @param {HTMLElement} panel
 * @returns {Promise<boolean>}
 */
function openRecentlyDeletedClearConfirmPanel(panel) {
    const card = panel.querySelector('#recentlyDeletedClearConfirmCard');
    const cancelBtn = panel.querySelector('#recentlyDeletedClearConfirmCancel');
    const okBtn = panel.querySelector('#recentlyDeletedClearConfirmOk');
    if (!card || !cancelBtn || !okBtn) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
            abortPendingClearConfirm = null;
            document.removeEventListener('keydown', onEscape, true);
            panel.removeEventListener('click', onPanelClick);
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            deactivateModalFocus(card);
        };
        const finish = (value) => {
            if (settled) return;
            settled = true;
            cleanup();
            panel.classList.add('hidden');
            panel.setAttribute('aria-hidden', 'true');
            resolve(value);
        };
        abortPendingClearConfirm = () => finish(false);

        const onEscape = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            finish(false);
        };

        const onPanelClick = (e) => {
            if (e.target === panel) finish(false);
        };

        const onCancel = () => finish(false);
        const onOk = () => finish(true);

        enhanceModalAccessibility(card, {
            labelledBy: 'recentlyDeletedClearConfirmTitle',
            describedBy: 'recentlyDeletedClearConfirmDesc',
        });
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        panel.addEventListener('click', onPanelClick);
        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        document.addEventListener('keydown', onEscape, true);
        activateModalFocus(card);
        cancelBtn.focus();
    });
}

async function resolveClearBinUserConfirm() {
    if (typeof deps.showRecentlyDeletedClearConfirm === 'function') {
        return deps.showRecentlyDeletedClearConfirm();
    }
    if (typeof document !== 'undefined') {
        const panel = document.getElementById('recentlyDeletedClearConfirmPanel');
        if (panel) {
            return openRecentlyDeletedClearConfirmPanel(panel);
        }
    }
    if (typeof deps.showAppConfirm === 'function') {
        return deps.showAppConfirm({
            title: 'Безвозвратное удаление',
            message: RECENTLY_DELETED_CLEAR_BIN_CONFIRM_MESSAGE,
            confirmText: 'Удалить безвозвратно',
            cancelText: 'Отмена',
            confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
        });
    }
    if (typeof window !== 'undefined' && window.confirm) {
        return window.confirm(RECENTLY_DELETED_CLEAR_BIN_CONFIRM_MESSAGE);
    }
    return false;
}

/**
 * Полная очистка корзины после подтверждения (компактная модалка в UI корзины или fallback).
 * @returns {{ cleared: boolean, cancelled: boolean }}
 */
export async function clearRecentlyDeletedBinWithUserConfirm() {
    const confirmed = await resolveClearBinUserConfirm();
    if (!confirmed) {
        return { cleared: false, cancelled: true };
    }
    await clearRecentlyDeletedRecords();
    return { cleared: true, cancelled: false };
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
                    const result = await permanentlyRemoveRecentlyDeletedEntryWithUserConfirm(
                        entryId,
                    );
                    if (result.removed) {
                        notify('Запись удалена из корзины', 'info');
                        await reloadModalList();
                    }
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
                const result = await clearRecentlyDeletedBinWithUserConfirm();
                if (!result.cleared) return;
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
    if (typeof abortPendingClearConfirm === 'function') {
        abortPendingClearConfirm();
    }
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
