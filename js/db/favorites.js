'use strict';

import { FAVORITES_STORE_NAME } from '../constants.js';
import { State } from '../app/state.js';
import {
    saveToIndexedDB,
    getAllFromIndexedDB,
    clearIndexedDBStore,
    performDBOperation,
} from './indexeddb.js';

// ============================================================================
// РАБОТА С ИЗБРАННЫМ
// ============================================================================

/**
 * Добавляет элемент в избранное
 */
export async function addToFavoritesDB(favoriteItem) {
    if (!State.db) {
        console.error('DB not initialized. Cannot add to favorites.');
        return null;
    }
    const { id, ...itemData } = favoriteItem;
    return await saveToIndexedDB(FAVORITES_STORE_NAME, itemData);
}

/**
 * Удаляет элемент из избранного
 */
export async function removeFromFavoritesDB(itemType, originalItemId) {
    if (!State.db) {
        console.error('DB not initialized. Cannot remove from favorites.');
        return false;
    }
    const transaction = State.db.transaction(FAVORITES_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(FAVORITES_STORE_NAME);
    const index = store.index('unique_favorite');
    const request = index.getKey([itemType, String(originalItemId)]);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const favoriteKey = request.result;
            if (favoriteKey !== undefined) {
                const deleteRequest = store.delete(favoriteKey);
                deleteRequest.onsuccess = () => resolve(true);
                deleteRequest.onerror = (e) => reject(e.target.error);
            } else {
                console.warn(
                    `Item not found in favorites to remove: type=${itemType}, id=${originalItemId}`,
                );
                resolve(false);
            }
        };
        request.onerror = (e) => {
            console.error('Error finding favorite key to remove:', e.target.error);
            reject(e.target.error);
        };
    });
}

/**
 * Проверяет, находится ли элемент в избранном
 */
export async function isFavoriteDB(itemType, originalItemId) {
    if (!State.db) {
        console.error('DB not initialized. Cannot check favorite status.');
        return false;
    }
    const transaction = State.db.transaction(FAVORITES_STORE_NAME, 'readonly');
    const store = transaction.objectStore(FAVORITES_STORE_NAME);
    const index = store.index('unique_favorite');
    const request = index.getKey([itemType, String(originalItemId)]);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result !== undefined);
        };
        request.onerror = (e) => {
            console.error('Error checking favorite status in DB:', e.target.error);
            resolve(false);
        };
    });
}

/**
 * Получает все элементы из избранного
 */
export async function getAllFavoritesDB() {
    if (!State.db) {
        console.error('DB not initialized. Cannot get all favorites.');
        return [];
    }
    return await getAllFromIndexedDB(FAVORITES_STORE_NAME);
}

/**
 * Очищает всё избранное
 */
export async function clearAllFavoritesDB() {
    if (!State.db) {
        console.error('DB not initialized. Cannot clear favorites.');
        return false;
    }
    try {
        await clearIndexedDBStore(FAVORITES_STORE_NAME);
        State.currentFavoritesCache = [];
        console.log('Favorites store cleared and cache reset.');
        return true;
    } catch (error) {
        console.error('Error clearing favorites from DB:', error);
        return false;
    }
}

/**
 * Загружает начальный кэш избранного
 */
export async function loadInitialFavoritesCache() {
    try {
        State.currentFavoritesCache = await getAllFavoritesDB();
        console.log(
            `Initial favorites cache loaded with ${State.currentFavoritesCache.length} items.`,
        );
    } catch (e) {
        console.error('Failed to load initial favorites cache:', e);
        State.currentFavoritesCache = [];
    }
}
