'use strict';

/**
 * Пакетные операции над закладками (большие базы): удаление/архив пачкой в корзину «Недавно удалённые»,
 * поиск и слияние дубликатов по нормализованному URL.
 * Всё записывается атомарными транзакциями порциями; индекс поиска обновляется одним проходом.
 */

import { State } from '../app/state.js';
import { ARCHIVE_FOLDER_ID, RECENTLY_DELETED_STORE_NAME } from '../constants.js';
import { markStoreChanged } from '../db/indexeddb.js';
import { buildRecentlyDeletedRecord } from './recently-deleted.js';
import { coerceTagsArray } from './global-tags.js';

const CHUNK = 400;

function waitTx(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error || new Error('Ошибка транзакции'));
        tx.onabort = (e) => reject(e.target.error || new Error('Транзакция прервана'));
    });
}

function idbGet(store, key) {
    return new Promise((resolve, reject) => {
        const r = store.get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}

function markChanged(...stores) {
    for (const s of stores) markStoreChanged(s);
}

/**
 * Удаляет закладки пачкой: снимок каждой уходит в «Недавно удалённые» (одна транзакция на порцию),
 * избранное снимается. Скриншоты НЕ удаляются — чтобы восстановление из корзины вернуло закладку с изображениями.
 * @param {number[]} ids
 * @param {{ removeFromIndex?: (type: string, ids: number[]) => Promise<void> }} [deps]
 * @returns {Promise<{ deleted: number, failed: number }>}
 */
export async function bulkDeleteBookmarks(ids, deps = {}) {
    if (!State.db) throw new Error('База данных недоступна');
    const unique = Array.from(new Set(ids.map((x) => Number(x)).filter((x) => Number.isFinite(x))));
    let deleted = 0;
    let failed = 0;
    const doneIds = [];
    for (let off = 0; off < unique.length; off += CHUNK) {
        const chunk = unique.slice(off, off + CHUNK);
        try {
            const tx = State.db.transaction(
                ['bookmarks', RECENTLY_DELETED_STORE_NAME, 'favorites'],
                'readwrite',
            );
            const bm = tx.objectStore('bookmarks');
            const rd = tx.objectStore(RECENTLY_DELETED_STORE_NAME);
            const fav = tx.objectStore('favorites');
            const favIdx = fav.index('unique_favorite');
            const done = waitTx(tx);
            const records = await Promise.all(chunk.map((id) => idbGet(bm, id)));
            records.forEach((rec, i) => {
                if (!rec) return;
                const id = chunk[i];
                const snapshot = buildRecentlyDeletedRecord({
                    storeName: 'bookmarks',
                    entityId: id,
                    payload: rec,
                    reason: 'delete_bookmark_bulk',
                });
                if (snapshot) rd.add(snapshot);
                bm.delete(id);
                for (const type of ['bookmark', 'bookmark_note']) {
                    const k = favIdx.getKey([type, String(id)]);
                    k.onsuccess = () => {
                        if (k.result !== undefined) fav.delete(k.result);
                    };
                }
                doneIds.push(id);
                deleted++;
            });
            await done;
            markChanged('bookmarks', RECENTLY_DELETED_STORE_NAME, 'favorites');
        } catch (e) {
            console.error('[bookmarks-bulk] порция удаления не выполнена:', e);
            failed += chunk.length;
        }
        await new Promise((r) => setTimeout(r, 0));
    }
    if (doneIds.length && deps.removeFromIndex) {
        // Проход по индексу занимает секунды на больших базах — не задерживаем обновление списка
        void Promise.resolve()
            .then(() => deps.removeFromIndex('bookmarks', doneIds))
            .catch((e) => console.warn('[bookmarks-bulk] индекс не обновлён после удаления:', e));
    }
    return { deleted, failed };
}

/**
 * Перемещает закладки в архив (или возвращает), порциями в транзакциях.
 * @param {number[]} ids
 * @param {boolean} archive
 * @param {{ removeFromIndex?: Function, updateIndex?: Function }} [deps]
 * @returns {Promise<{ changed: number }>}
 */
export async function bulkSetBookmarksArchived(ids, archive, deps = {}) {
    if (!State.db) throw new Error('База данных недоступна');
    const unique = Array.from(new Set(ids.map((x) => Number(x)).filter((x) => Number.isFinite(x))));
    let changed = 0;
    const changedIds = [];
    const restored = [];
    for (let off = 0; off < unique.length; off += CHUNK) {
        const chunk = unique.slice(off, off + CHUNK);
        const tx = State.db.transaction('bookmarks', 'readwrite');
        const store = tx.objectStore('bookmarks');
        const done = waitTx(tx);
        const recs = await Promise.all(chunk.map((id) => idbGet(store, id)));
        const now = new Date().toISOString();
        for (const rec of recs) {
            if (!rec) continue;
            const isArch = rec.folder === ARCHIVE_FOLDER_ID;
            if (archive === isArch) continue;
            const before = { ...rec };
            rec.folder = archive ? ARCHIVE_FOLDER_ID : null;
            rec.dateUpdated = now;
            store.put(rec);
            changed++;
            changedIds.push(rec.id);
            if (!archive) restored.push({ rec, before });
        }
        await done;
        markChanged('bookmarks');
        await new Promise((r) => setTimeout(r, 0));
    }
    if (archive && changedIds.length && deps.removeFromIndex) {
        void Promise.resolve()
            .then(() => deps.removeFromIndex('bookmarks', changedIds))
            .catch((e) => console.warn('[bookmarks-bulk] индекс не обновлён после архивации:', e));
    } else if (!archive && deps.updateIndex) {
        void (async () => {
            for (const { rec, before } of restored) {
                await deps.updateIndex('bookmarks', rec.id, rec, 'update', before);
            }
        })().catch((e) => console.warn('[bookmarks-bulk] индекс не обновлён:', e));
    }
    return { changed };
}

// ============================================================================
// ДУБЛИКАТЫ
// ============================================================================

const TRACKING_PARAMS = /^(utm_[a-z0-9_]+|fbclid|gclid|yclid|ysclid|_openstat|mc_cid|mc_eid|igshid|ref_src)$/i;

/**
 * Нормализованный URL для сравнения: без протокола/www/якоря/слэша в конце/портов по умолчанию,
 * параметры отслеживания удалены, остальные отсортированы.
 * @param {string} raw
 * @returns {string} пустая строка, если URL некорректен
 */
export function normalizeBookmarkUrl(raw) {
    let s = String(raw || '')
        .trim()
        .replace(/[​-‍﻿]/g, '');
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try {
        u = new URL(s);
    } catch {
        return '';
    }
    if (!/^https?:$/.test(u.protocol)) return '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let port = u.port;
    if (port === '80' || port === '443') port = '';
    let path = u.pathname.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path === '/') path = '';
    const params = [];
    u.searchParams.forEach((v, k) => {
        if (!TRACKING_PARAMS.test(k)) params.push([k, v]);
    });
    params.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
    const q = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return `${host}${port ? ':' + port : ''}${path}${q ? '?' + q : ''}`;
}

/**
 * Группы дубликатов (2+ закладки с одним нормализованным URL). Внутри группы — по возрастанию даты.
 * @param {object[]} bookmarks
 * @returns {Array<{ key: string, items: object[] }>}
 */
export function findDuplicateBookmarkGroups(bookmarks) {
    const map = new Map();
    for (const b of bookmarks || []) {
        if (!b || b.id == null || !b.url) continue;
        const key = normalizeBookmarkUrl(b.url);
        if (!key) continue;
        let arr = map.get(key);
        if (!arr) map.set(key, (arr = []));
        arr.push(b);
    }
    const groups = [];
    for (const [key, items] of map) {
        if (items.length < 2) continue;
        items.sort(
            (a, b) =>
                (new Date(a.dateAdded || 0).getTime() || 0) -
                    (new Date(b.dateAdded || 0).getTime() || 0) || a.id - b.id,
        );
        groups.push({ key, items });
    }
    groups.sort((a, b) => b.items.length - a.items.length || (a.key < b.key ? -1 : 1));
    return groups;
}

/**
 * Что получится при слиянии: сохраняемая закладка получает объединённые теги, самое подробное
 * описание, все скриншоты, самую раннюю дату добавления.
 * @param {object[]} items
 * @param {number} keepId
 */
export function buildMergedBookmark(items, keepId) {
    const keeper = items.find((x) => x.id === keepId) || items[0];
    const others = items.filter((x) => x.id !== keeper.id);
    const merged = { ...keeper };
    const tags = new Set(coerceTagsArray(keeper.tags));
    let desc = String(keeper.description || '');
    const shots = Array.isArray(keeper.screenshotIds) ? [...keeper.screenshotIds] : [];
    let earliest = keeper.dateAdded;
    for (const o of others) {
        for (const t of coerceTagsArray(o.tags)) tags.add(t);
        if (String(o.description || '').length > desc.length) desc = String(o.description);
        for (const sid of Array.isArray(o.screenshotIds) ? o.screenshotIds : []) {
            if (!shots.some((x) => String(x) === String(sid))) shots.push(sid);
        }
        if (
            o.dateAdded &&
            (!earliest || new Date(o.dateAdded).getTime() < new Date(earliest).getTime())
        ) {
            earliest = o.dateAdded;
        }
        if (!merged.folder && o.folder && o.folder !== ARCHIVE_FOLDER_ID) merged.folder = o.folder;
    }
    if (tags.size) merged.tags = Array.from(tags);
    if (desc) merged.description = desc;
    if (shots.length) merged.screenshotIds = shots;
    if (earliest) merged.dateAdded = earliest;
    merged.dateUpdated = new Date().toISOString();
    return { merged, keeper, others };
}

/**
 * Сливает группу дубликатов в закладку keepId одной транзакцией. Остальные уходят в «Недавно удалённые»
 * (reason: merge_duplicate), их скриншоты переподчиняются сохраняемой закладке.
 * @param {object[]} items
 * @param {number} keepId
 * @param {{ removeFromIndex?: Function, updateIndex?: Function }} [deps]
 * @returns {Promise<{ removed: number }>}
 */
export async function mergeDuplicateBookmarks(items, keepId, deps = {}) {
    if (!State.db) throw new Error('База данных недоступна');
    const { merged, keeper, others } = buildMergedBookmark(items, keepId);
    if (!others.length) return { removed: 0, merged, otherIds: [] };
    const tx = State.db.transaction(
        ['bookmarks', RECENTLY_DELETED_STORE_NAME, 'screenshots', 'favorites'],
        'readwrite',
    );
    const bm = tx.objectStore('bookmarks');
    const rd = tx.objectStore(RECENTLY_DELETED_STORE_NAME);
    const shots = tx.objectStore('screenshots');
    const fav = tx.objectStore('favorites');
    const done = waitTx(tx);
    bm.put(merged);
    for (const o of others) {
        const snap = buildRecentlyDeletedRecord({
            storeName: 'bookmarks',
            entityId: o.id,
            payload: o,
            context: { mergedInto: keeper.id },
            reason: 'merge_duplicate',
        });
        if (snap) rd.add(snap);
        bm.delete(o.id);
        const idx = shots.index('parentId');
        for (const v of [o.id, String(o.id)]) {
            const cur = idx.openCursor(IDBKeyRange.only(v));
            cur.onsuccess = () => {
                const c = cur.result;
                if (!c) return;
                const row = c.value;
                if (row.parentType === 'bookmark') {
                    row.parentId = keeper.id;
                    c.update(row);
                }
                c.continue();
            };
        }
        const favIdx = fav.index('unique_favorite');
        for (const type of ['bookmark', 'bookmark_note']) {
            const k = favIdx.getKey([type, String(o.id)]);
            k.onsuccess = () => {
                if (k.result !== undefined) fav.delete(k.result);
            };
        }
    }
    await done;
    markChanged('bookmarks', RECENTLY_DELETED_STORE_NAME, 'screenshots', 'favorites');
    if (deps.deferIndex) return { removed: others.length, merged, otherIds: others.map((o) => o.id) };
    try {
        if (deps.removeFromIndex) {
            await deps.removeFromIndex(
                'bookmarks',
                others.map((o) => o.id),
            );
        }
        if (deps.updateIndex) {
            await deps.updateIndex('bookmarks', merged.id, merged, 'update', keeper);
        }
    } catch (e) {
        console.warn('[bookmarks-bulk] индекс не обновлён после слияния:', e);
    }
    return { removed: others.length, merged, otherIds: others.map((o) => o.id) };
}
