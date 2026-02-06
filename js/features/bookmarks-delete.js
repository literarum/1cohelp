'use strict';

// ============================================================================
// BOOKMARKS DELETE (вынос из script.js)
// ============================================================================

let State = null;
let getFromIndexedDB = null;
let showNotification = null;
let updateSearchIndex = null;
let removeBookmarkFromDOM = null;
let loadBookmarks = null;
let removeFromFavoritesDB = null;
let updateFavoriteStatusUI = null;
let renderFavoritesPage = null;

export function setBookmarksDeleteDependencies(deps) {
    State = deps.State;
    getFromIndexedDB = deps.getFromIndexedDB;
    showNotification = deps.showNotification;
    updateSearchIndex = deps.updateSearchIndex;
    removeBookmarkFromDOM = deps.removeBookmarkFromDOM;
    loadBookmarks = deps.loadBookmarks;
    removeFromFavoritesDB = deps.removeFromFavoritesDB;
    updateFavoriteStatusUI = deps.updateFavoriteStatusUI;
    renderFavoritesPage = deps.renderFavoritesPage;
}

export async function deleteBookmark(id) {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        console.error('deleteBookmark: Передан невалидный ID:', id);
        showNotification?.('Ошибка: Неверный ID закладки для удаления.', 'error');
        return;
    }

    let bookmarkToDelete = null;
    let screenshotIdsToDelete = [];
    let transaction;

    try {
        try {
            bookmarkToDelete = await getFromIndexedDB?.('bookmarks', numericId);
            if (!bookmarkToDelete) {
                console.warn(
                    `Закладка с ID ${numericId} не найдена в базе данных. Возможно, уже удалена.`,
                );
                removeBookmarkFromDOM?.(numericId);
                showNotification?.('Закладка не найдена (возможно, уже удалена).', 'warning');
                return;
            }
            if (
                Array.isArray(bookmarkToDelete.screenshotIds) &&
                bookmarkToDelete.screenshotIds.length > 0
            ) {
                screenshotIdsToDelete = [...bookmarkToDelete.screenshotIds];
                console.log(
                    `Найдены ID скриншотов [${screenshotIdsToDelete.join(
                        ',',
                    )}] для удаления вместе с закладкой ${numericId}.`,
                );
            } else {
                console.log(`Скриншоты для закладки ${numericId} не найдены или отсутствуют.`);
            }
        } catch (fetchError) {
            console.error(
                `Ошибка при получении данных закладки ${numericId} перед удалением:`,
                fetchError,
            );
            showNotification?.(
                'Не удалось получить данные скриншотов, но будет предпринята попытка удалить закладку.',
                'warning',
            );
        }

        if (bookmarkToDelete && typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex('bookmarks', numericId, null, 'delete', bookmarkToDelete);
                console.log(
                    `Обновление индекса (delete) для закладки ID: ${numericId} инициировано.`,
                );
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса при удалении закладки ${numericId}:`,
                    indexError,
                );
                showNotification?.('Ошибка обновления поискового индекса.', 'warning');
            }
        } else {
            console.warn(
                `Обновление индекса для закладки ${numericId} пропущено (данные не получены или функция недоступна).`,
            );
        }

        if (!State?.db) {
            throw new Error('State.db не инициализирован (IndexedDB недоступен).');
        }

        const stores = ['bookmarks'];
        if (screenshotIdsToDelete.length > 0) stores.push('screenshots');

        transaction = State.db.transaction(stores, 'readwrite');
        const bookmarkStore = transaction.objectStore('bookmarks');
        const screenshotStore = stores.includes('screenshots')
            ? transaction.objectStore('screenshots')
            : null;

        const deletePromises = [];

        deletePromises.push(
            new Promise((resolve, reject) => {
                const req = bookmarkStore.delete(numericId);
                req.onsuccess = () => {
                    console.log(`Запрос на удаление закладки ${numericId} успешен.`);
                    resolve();
                };
                req.onerror = (e) => {
                    console.error(`Ошибка запроса на удаление закладки ${numericId}:`, e.target.error);
                    reject(e.target.error);
                };
            }),
        );

        if (screenshotStore && screenshotIdsToDelete.length > 0) {
            screenshotIdsToDelete.forEach((screenshotId) => {
                deletePromises.push(
                    new Promise((resolve, reject) => {
                        const req = screenshotStore.delete(screenshotId);
                        req.onsuccess = () => {
                            console.log(`Запрос на удаление скриншота ${screenshotId} успешен.`);
                            resolve();
                        };
                        req.onerror = (e) => {
                            console.error(
                                `Ошибка запроса на удаление скриншота ${screenshotId}:`,
                                e.target.error,
                            );
                            reject(e.target.error);
                        };
                    }),
                );
            });
        }

        await Promise.all(deletePromises);
        console.log('Все запросы на удаление (закладка + скриншоты) успешно инициированы.');

        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log(
                    `Транзакция удаления закладки ${numericId} и скриншотов успешно завершена.`,
                );
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(`Ошибка ТРАНЗАКЦИИ при удалении закладки ${numericId}:`, e.target.error);
                reject(e.target.error || new Error('Неизвестная ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn(`Транзакция удаления закладки ${numericId} прервана:`, e.target.error);
                reject(e.target.error || new Error('Транзакция прервана'));
            };
        });

        // Синхронизация с избранным (если доступно)
        try {
            const removedBookmark = await removeFromFavoritesDB?.('bookmark', numericId);
            const removedNote = await removeFromFavoritesDB?.('bookmark_note', numericId);
            if (removedBookmark || removedNote) {
                if (typeof updateFavoriteStatusUI === 'function') {
                    await updateFavoriteStatusUI(numericId, 'bookmark', false);
                    await updateFavoriteStatusUI(numericId, 'bookmark_note', false);
                }
                if (State?.currentSection === 'favorites') {
                    if (typeof renderFavoritesPage === 'function') {
                        await renderFavoritesPage();
                    }
                } else {
                    const selector = `.favorite-item[data-original-item-id="${String(
                        numericId,
                    )}"][data-item-type="bookmark"], .favorite-item[data-original-item-id="${String(
                        numericId,
                    )}"][data-item-type="bookmark_note"]`;
                    document.querySelectorAll(selector).forEach((el) => el.remove());
                    const favContainer = document.getElementById('favoritesContainer');
                    if (favContainer && !favContainer.querySelector('.favorite-item')) {
                        favContainer.innerHTML =
                            '<p class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">В избранном пока ничего нет.</p>';
                    }
                }
            }
        } catch (favErr) {
            console.warn('deleteBookmark: ошибка синхронизации с избранным:', favErr);
        }

        removeBookmarkFromDOM?.(numericId);
        showNotification?.('Закладка и связанные скриншоты удалены');
    } catch (error) {
        console.error(`Критическая ошибка при удалении закладки ID ${numericId}:`, error);
        showNotification?.('Ошибка при удалении закладки: ' + (error.message || error), 'error');
        if (transaction && transaction.abort && transaction.readyState !== 'done') {
            try {
                transaction.abort();
            } catch (abortErr) {
                console.error('Ошибка отмены транзакции в catch:', abortErr);
            }
        }
        await loadBookmarks?.();
    }
}

