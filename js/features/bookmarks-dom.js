'use strict';

// ============================================================================
// BOOKMARKS DOM OPERATIONS (вынос из script.js)
// ============================================================================

let createBookmarkElement = null;
let applyCurrentView = null;
let removeFromFavoritesDB = null;
let updateFavoriteStatusUI = null;
let renderFavoritesPage = null;
let State = null;
let SECTION_GRID_COLS = null;
let CARD_CONTAINER_CLASSES = null;

export function setBookmarksDomDependencies(deps) {
    createBookmarkElement = deps.createBookmarkElement;
    applyCurrentView = deps.applyCurrentView;
    removeFromFavoritesDB = deps.removeFromFavoritesDB;
    updateFavoriteStatusUI = deps.updateFavoriteStatusUI;
    renderFavoritesPage = deps.renderFavoritesPage;
    State = deps.State;
    SECTION_GRID_COLS = deps.SECTION_GRID_COLS;
    CARD_CONTAINER_CLASSES = deps.CARD_CONTAINER_CLASSES;
}

export async function addBookmarkToDOM(bookmarkData) {
    const bookmarksContainer = document.getElementById('bookmarksContainer');
    if (!bookmarksContainer) {
        console.error('addBookmarkToDOM: Контейнер #bookmarksContainer не найден.');
        return;
    }

    const noBookmarksMsg = bookmarksContainer.querySelector('.col-span-full.text-center');
    if (noBookmarksMsg) {
        noBookmarksMsg.remove();
        if (bookmarksContainer.classList.contains('flex-col')) {
            bookmarksContainer.classList.remove('flex', 'flex-col');
            if (!bookmarksContainer.classList.contains('grid')) {
                const gridColsClasses =
                    SECTION_GRID_COLS.bookmarksContainer || SECTION_GRID_COLS.default;
                bookmarksContainer.classList.add(...CARD_CONTAINER_CLASSES, ...gridColsClasses);
                console.log("Восстановлены классы grid после удаления сообщения 'нет закладок'");
            }
        }
    }

    const newElement = await createBookmarkElement(bookmarkData);
    if (!newElement) {
        console.error(
            'addBookmarkToDOM: Не удалось создать DOM-элемент для закладки:',
            bookmarkData,
        );
        return;
    }

    bookmarksContainer.appendChild(newElement);
    console.log(`Закладка ID ${bookmarkData.id} добавлена в DOM.`);

    applyCurrentView('bookmarksContainer');
}

export async function updateBookmarkInDOM(bookmarkData) {
    const bookmarksContainer = document.getElementById('bookmarksContainer');
    if (!bookmarksContainer || !bookmarkData || typeof bookmarkData.id === 'undefined') {
        console.error('updateBookmarkInDOM: Неверные аргументы или контейнер не найден.');
        return;
    }

    const existingElement = bookmarksContainer.querySelector(
        `.bookmark-item[data-id="${bookmarkData.id}"]`,
    );
    if (!existingElement) {
        console.warn(
            `updateBookmarkInDOM: Не найден элемент закладки с ID ${bookmarkData.id} для обновления в DOM.`,
        );
        await addBookmarkToDOM(bookmarkData);
        return;
    }

    const newElement = await createBookmarkElement(bookmarkData);
    if (!newElement) {
        console.error(
            `updateBookmarkInDOM: Не удалось создать обновленный элемент для закладки ID ${bookmarkData.id}.`,
        );
        return;
    }

    existingElement.replaceWith(newElement);
    console.log(`Закладка ID ${bookmarkData.id} обновлена в DOM.`);

    applyCurrentView('bookmarksContainer');
}

export async function removeBookmarkFromDOM(bookmarkId) {
    const bookmarksContainer = document.getElementById('bookmarksContainer');
    if (!bookmarksContainer) {
        console.error('removeBookmarkFromDOM: Контейнер #bookmarksContainer не найден.');
        try {
            const removed = await removeFromFavoritesDB('bookmark', bookmarkId);
            if (removed) {
                if (Array.isArray(State.currentFavoritesCache)) {
                    State.currentFavoritesCache = State.currentFavoritesCache.filter(
                        (f) =>
                            !(
                                f.itemType === 'bookmark' &&
                                String(f.originalItemId) === String(bookmarkId)
                            ),
                    );
                }
                if (typeof updateFavoriteStatusUI === 'function') {
                    await updateFavoriteStatusUI(bookmarkId, 'bookmark', false);
                }
                if (typeof State.currentSection !== 'undefined' && State.currentSection === 'favorites') {
                    if (typeof renderFavoritesPage === 'function') {
                        await renderFavoritesPage();
                    }
                } else {
                    const favCard = document.querySelector(
                        `.favorite-item[data-item-type="bookmark"][data-original-item-id="${String(
                            bookmarkId,
                        )}"]`,
                    );
                    if (favCard) favCard.remove();
                    const favContainer = document.getElementById('favoritesContainer');
                    if (favContainer && !favContainer.querySelector('.favorite-item')) {
                        favContainer.innerHTML =
                            '<p class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">В избранном пока ничего нет.</p>';
                    }
                }
            }
        } catch (e) {
            console.warn('removeBookmarkFromDOM: ошибка синхронизации с избранным:', e);
        }
        return;
    }

    const itemToRemove = bookmarksContainer.querySelector(
        `.bookmark-item[data-id="${bookmarkId}"]`,
    );
    if (itemToRemove) {
        itemToRemove.remove();
        console.log(`Удален элемент закладки ${bookmarkId} из DOM.`);

        if (!bookmarksContainer.querySelector('.bookmark-item')) {
            bookmarksContainer.innerHTML =
                '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных закладок</div>';
            console.log('Контейнер закладок пуст, добавлено сообщение.');
        }
        applyCurrentView('bookmarksContainer');
    } else {
        console.warn(
            `removeBookmarkFromDOM: Элемент закладки ${bookmarkId} не найден в DOM для удаления.`,
        );
    }
    try {
        const removed = await removeFromFavoritesDB('bookmark', bookmarkId);
        if (removed) {
            if (Array.isArray(State.currentFavoritesCache)) {
                State.currentFavoritesCache = State.currentFavoritesCache.filter(
                    (f) =>
                        !(
                            f.itemType === 'bookmark' &&
                            String(f.originalItemId) === String(bookmarkId)
                        ),
                );
            }
            if (typeof updateFavoriteStatusUI === 'function') {
                await updateFavoriteStatusUI(bookmarkId, 'bookmark', false);
            }
            if (typeof State.currentSection !== 'undefined' && State.currentSection === 'favorites') {
                if (typeof renderFavoritesPage === 'function') {
                    await renderFavoritesPage();
                }
            } else {
                const favCard = document.querySelector(
                    `.favorite-item[data-item-type="bookmark"][data-original-item-id="${String(
                        bookmarkId,
                    )}"]`,
                );
                if (favCard) favCard.remove();
                const favContainer = document.getElementById('favoritesContainer');
                if (favContainer && !favContainer.querySelector('.favorite-item')) {
                    favContainer.innerHTML =
                        '<p class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">В избранном пока ничего нет.</p>';
                }
            }
        }
    } catch (e) {
        console.warn('removeBookmarkFromDOM: ошибка синхронизации с избранным:', e);
    }
}
