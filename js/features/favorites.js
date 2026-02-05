'use strict';

/**
 * Модуль системы избранного
 * Содержит логику работы с избранным: добавление, удаление, отображение, навигация
 */

import { State } from '../app/state.js';
import { escapeHtml, highlightElement } from '../utils/html.js';
import {
    addToFavoritesDB,
    removeFromFavoritesDB,
    isFavoriteDB,
    getAllFavoritesDB,
    clearAllFavoritesDB,
} from '../db/favorites.js';
import { getFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setFavoritesDependencies)
// ============================================================================

let deps = {
    showNotification: null,
    setActiveTab: null,
    algorithms: null,
    showAlgorithmDetail: null,
    showBookmarkDetailModal: null,
    showReglamentDetail: null,
    showReglamentsForCategory: null,
    copyToClipboard: null,
    filterBookmarks: null,
    applyCurrentView: null,
    loadingOverlayManager: null,
    renderAllAlgorithms: null,
    loadBookmarks: null,
    loadExtLinks: null,
    renderReglamentCategories: null,
};

/**
 * Устанавливает зависимости для модуля избранного
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setFavoritesDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[Favorites] Зависимости установлены');
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Переключает статус избранного для элемента
 */
export async function toggleFavorite(
    originalItemId,
    itemType,
    originalItemSection,
    title,
    description,
    buttonElement = null
) {
    const isCurrentlyFavoriteInDB = await isFavoriteDB(itemType, originalItemId);
    let success = false;
    let operation = '';
    let newStatus = false;

    console.log(
        `Toggling favorite: ID=${originalItemId}, Type=${itemType}, Section=${originalItemSection}, CurrentDBStatus=${isCurrentlyFavoriteInDB}`
    );

    try {
        if (isCurrentlyFavoriteInDB) {
            await removeFromFavoritesDB(itemType, originalItemId);
            deps.showNotification?.(`"${title}" удалено из избранного.`, 'info', 2000);
            success = true;
            operation = 'removed';
            newStatus = false;
        } else {
            const favoriteItem = {
                originalItemId: String(originalItemId),
                itemType,
                originalItemSection,
                title,
                description: description || '',
                dateAdded: new Date().toISOString(),
            };
            await addToFavoritesDB(favoriteItem);
            deps.showNotification?.(`"${title}" добавлено в избранное!`, 'success', 2000);
            success = true;
            operation = 'added';
            newStatus = true;
        }
    } catch (error) {
        console.error('Error toggling favorite state in DB:', error);
        deps.showNotification?.('Ошибка при изменении статуса избранного.', 'error');
    }

    if (success) {
        State.currentFavoritesCache = await getAllFavoritesDB();
        await updateFavoriteStatusUI(originalItemId, itemType, newStatus, buttonElement);
        if (State.currentSection === 'favorites') {
            await renderFavoritesPage();
        }
    }
    return { success, operation, newStatus };
}

/**
 * Обновляет UI статуса избранного для всех кнопок элемента
 */
export async function updateFavoriteStatusUI(originalItemId, itemType, isFavoriteStatus) {
    const stringOriginalItemId = String(originalItemId);
    console.log(
        `[updateFavoriteStatusUI] Обновление UI для элемента ${itemType}:${stringOriginalItemId} на isFavorite=${isFavoriteStatus}`
    );

    const updateButtonAppearance = (button) => {
        if (!button) return;
        const icon = button.querySelector('i');
        if (icon) {
            icon.className = isFavoriteStatus ? 'fas fa-star text-yellow-400' : 'far fa-star';
        }
        button.title = isFavoriteStatus ? 'Удалить из избранного' : 'Добавить в избранное';
        button.dataset.isFavorite = String(isFavoriteStatus);
    };

    const allRelatedButtons = document.querySelectorAll(
        `.toggle-favorite-btn[data-item-id="${stringOriginalItemId}"][data-item-type="${itemType}"]`
    );

    if (allRelatedButtons.length > 0) {
        console.log(
            `[updateFavoriteStatusUI] Найдено ${allRelatedButtons.length} кнопок для обновления для ${itemType}:${stringOriginalItemId}.`
        );
        allRelatedButtons.forEach((button) => {
            updateButtonAppearance(button);
        });
    } else {
        console.warn(
            `[updateFavoriteStatusUI] Кнопки "в избранное" не найдены в DOM для элемента ${itemType}:${stringOriginalItemId}.`
        );
    }
}

/**
 * Рендерит страницу избранного
 */
export async function renderFavoritesPage() {
    const container = document.getElementById('favoritesContainer');
    if (!container) {
        console.error('Favorites container #favoritesContainer not found.');
        return;
    }

    container.innerHTML =
        '<p class="text-center py-6 text-gray-500 dark:text-gray-400 col-span-full">Загрузка избранного...</p>';

    let favoritesToRender;
    try {
        favoritesToRender = await getAllFavoritesDB();
    } catch (e) {
        console.error('Error fetching favorites for rendering:', e);
        container.innerHTML =
            '<p class="text-center py-6 text-red-500 dark:text-red-400 col-span-full">Ошибка загрузки избранного.</p>';
        return;
    }

    State.currentFavoritesCache = favoritesToRender;
    favoritesToRender.sort(
        (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
    );

    const currentView =
        State.viewPreferences['favoritesContainer'] || container.dataset.defaultView || 'cards';

    if (favoritesToRender.length === 0) {
        container.innerHTML =
            '<p class="text-center py-6 text-gray-500 dark:text-gray-400 col-span-full">В избранном пока ничего нет.</p>';
    } else {
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        favoritesToRender.forEach((fav) => {
            const itemElement = document.createElement('div');
            itemElement.className = 'favorite-item view-item group relative cursor-pointer';
            itemElement.dataset.favoriteId = fav.id;
            itemElement.dataset.originalItemId = fav.originalItemId;
            itemElement.dataset.itemType = fav.itemType;
            itemElement.dataset.originalItemSection = fav.originalItemSection;

            let iconClass = 'fa-question-circle';
            let typeText = fav.itemType;

            switch (fav.itemType) {
                case 'mainAlgorithm':
                    iconClass = 'fa-home';
                    typeText = 'Главная';
                    break;
                case 'algorithm':
                    iconClass = 'fa-sitemap';
                    typeText = 'Алгоритм';
                    break;
                case 'link':
                    iconClass = 'fa-link';
                    typeText = 'Ссылка 1С';
                    break;
                case 'bookmark':
                    iconClass = 'fa-bookmark';
                    typeText = 'Закладка';
                    break;
                case 'bookmark_note':
                    iconClass = 'fa-sticky-note';
                    typeText = 'Заметка';
                    break;
                case 'reglament':
                    iconClass = 'fa-file-alt';
                    typeText = 'Регламент';
                    break;
                case 'extLink':
                    iconClass = 'fa-external-link-alt';
                    typeText = 'Внешний ресурс';
                    break;
                case 'sedoTypeSection':
                    iconClass = 'fa-comments';
                    typeText = 'Раздел СЭДО';
                    break;
            }

            const favButtonHTML = getFavoriteButtonHTML(
                fav.originalItemId,
                fav.itemType,
                fav.originalItemSection,
                fav.title,
                fav.description,
                true
            );
            const goToOriginalBtnHTML = `
                <button class="go-to-original-btn p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Перейти к оригиналу">
                    <i class="fas fa-external-link-square-alt"></i>
                </button>
            `;

            if (currentView === 'cards') {
                itemElement.classList.add(
                    'bg-white',
                    'dark:bg-gray-700',
                    'p-4',
                    'rounded-lg',
                    'shadow-md',
                    'hover:shadow-lg',
                    'transition-shadow',
                    'flex',
                    'flex-col',
                    'justify-between',
                    'h-full'
                );

                itemElement.innerHTML = `
                    <div class="flex-grow min-w-0 cursor-pointer">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center min-w-0 flex-1">
                                <i class="fas ${iconClass} text-primary mr-2 text-lg"></i>
                                <h3 class="font-semibold text-gray-900 dark:text-gray-100 truncate flex-1" title="${escapeHtml(
                                    fav.title
                                )}">${escapeHtml(fav.title)}</h3>
                            </div>
                            <div class="actions-container flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">${favButtonHTML}</div>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Тип: ${typeText}</p>
                        <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3" title="${escapeHtml(
                            fav.description || ''
                        )}">${escapeHtml(fav.description || 'Нет описания')}</p>
                    </div>
                    <div class="mt-auto pt-3 border-t border-gray-200 dark:border-gray-600 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                        <span>Добавлено: ${new Date(fav.dateAdded).toLocaleDateString()}</span>
                        <button class="go-to-original-btn inline-flex items-center p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Перейти к оригиналу">
                            <i class="fas fa-external-link-square-alt"></i> <span class="ml-1 hidden sm:inline">Перейти</span>
                        </button>
                    </div>
                `;
            } else {
                itemElement.classList.add(
                    'flex',
                    'items-center',
                    'justify-between',
                    'p-3',
                    'border-b',
                    'border-gray-200',
                    'dark:border-gray-600',
                    'hover:bg-gray-50',
                    'dark:hover:bg-gray-700',
                    'cursor-pointer'
                );

                itemElement.innerHTML = `
                    <div class="cursor-pointer flex items-center min-w-0 flex-1 cursor-pointer" data-action="go-to-original">
                         <i class="fas ${iconClass} text-primary mr-3 text-lg w-5 text-center"></i>
                         <div class="min-w-0 flex-1">
                             <h3 class="font-medium text-gray-900 dark:text-gray-100 truncate" title="${escapeHtml(
                                 fav.title
                             )}">${escapeHtml(fav.title)}</h3>
                             <p class="text-xs text-gray-500 dark:text-gray-400">${typeText}</p>
                         </div>
                    </div>
                    <div class="flex-shrink-0 ml-4 flex items-center gap-2">
                         ${favButtonHTML}
                         ${goToOriginalBtnHTML.replace(
                             '</button>',
                             '<span class="hidden sm:inline ml-1">Перейти</span></button>'
                         )}
                    </div>
                `;
            }
            fragment.appendChild(itemElement);
        });
        container.appendChild(fragment);
    }

    if (typeof deps.applyCurrentView === 'function') {
        deps.applyCurrentView('favoritesContainer');
    }
}

/**
 * Генерирует HTML кнопки избранного
 */
export function getFavoriteButtonHTML(
    originalItemId,
    itemType,
    originalItemSection,
    title,
    description,
    isCurrentlyFavorite
) {
    const iconClass = isCurrentlyFavorite ? 'fas fa-star text-yellow-400' : 'far fa-star';
    const tooltip = isCurrentlyFavorite ? 'Удалить из избранного' : 'Добавить в избранное';

    const safeTitle = (typeof title === 'string' ? escapeHtml(title) : 'Элемент').replace(
        /"/g,
        '&quot;'
    );
    const safeDescription = (
        typeof description === 'string' ? escapeHtml(description) : ''
    ).replace(/"/g, '&quot;');
    const safeOriginalItemSection = (
        typeof originalItemSection === 'string' ? escapeHtml(originalItemSection) : ''
    ).replace(/"/g, '&quot;');

    return `
        <button class="toggle-favorite-btn p-1.5 text-gray-500 hover:text-yellow-500 dark:text-gray-400 dark:hover:text-yellow-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-primary dark:focus:ring-offset-gray-800 transition-colors"
                title="${tooltip}"
                data-item-id="${originalItemId}"
                data-item-type="${itemType}"
                data-original-item-section="${safeOriginalItemSection}"
                data-item-title="${safeTitle}"
                data-item-description="${safeDescription}">
            <i class="${iconClass}"></i>
        </button>
    `;
}

/**
 * Обработчик клика по контейнеру избранного
 */
export async function handleFavoriteContainerClick(event) {
    const button = event.target.closest('button');
    const favoriteItemCard = event.target.closest('.favorite-item');

    if (!favoriteItemCard) return;

    const originalItemId = favoriteItemCard.dataset.originalItemId;
    const itemType = favoriteItemCard.dataset.itemType;
    const originalItemSection = favoriteItemCard.dataset.originalItemSection;
    const title = favoriteItemCard.querySelector('h3')?.textContent || 'Элемент';
    const description = favoriteItemCard.querySelector('p.line-clamp-3')?.textContent || '';

    if (button && button.classList.contains('go-to-original-btn')) {
        event.stopPropagation();
        console.log(
            `Переход к оригиналу: Type=${itemType}, ID=${originalItemId}, Section=${originalItemSection}`
        );

        if (itemType === 'mainAlgorithm') {
            deps.setActiveTab?.('main');
        } else if (itemType === 'sedoTypeSection') {
            deps.setActiveTab?.('sedoTypes');
        } else if (originalItemSection && deps.setActiveTab) {
            deps.setActiveTab(originalItemSection);
            await new Promise((resolve) => setTimeout(resolve, 200));

            if (itemType === 'algorithm') {
                const algoData = deps.algorithms?.[originalItemSection]?.find(
                    (a) => String(a.id) === String(originalItemId)
                );
                if (algoData) deps.showAlgorithmDetail?.(algoData, originalItemSection);
                else deps.showNotification?.('Оригинальный алгоритм не найден.', 'warning');
            } else if (itemType === 'link') {
                const linkElement = document.querySelector(
                    `.cib-link-item[data-id="${originalItemId}"]`
                );
                if (linkElement) {
                    linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightElement(linkElement, title);
                } else deps.showNotification?.('Оригинальная ссылка 1С не найдена.', 'warning');
            } else if (itemType === 'bookmark' || itemType === 'bookmark_note') {
                const bookmarkData = await getFromIndexedDB(
                    'bookmarks',
                    parseInt(originalItemId, 10)
                );
                if (!bookmarkData) {
                    deps.showNotification?.('Не удалось найти оригинальную закладку.', 'error');
                    return;
                }

                const folderFilter = document.getElementById('bookmarkFolderFilter');
                if (folderFilter) {
                    folderFilter.value = bookmarkData.folder || '';
                    if (deps.filterBookmarks) {
                        await deps.filterBookmarks();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 100));

                const bookmarkElement = document.querySelector(
                    `.bookmark-item[data-id="${originalItemId}"]`
                );
                if (bookmarkElement) {
                    bookmarkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightElement(bookmarkElement, title);
                }

                deps.showBookmarkDetailModal?.(parseInt(originalItemId, 10));
            } else if (itemType === 'reglament') {
                const reglamentData = await getFromIndexedDB(
                    'reglaments',
                    parseInt(originalItemId, 10)
                );
                if (reglamentData && reglamentData.category) {
                    await deps.showReglamentsForCategory?.(reglamentData.category);
                    await new Promise((resolve) => setTimeout(resolve, 50));

                    const reglamentElement = document.querySelector(
                        `.reglament-item[data-id="${originalItemId}"]`
                    );
                    if (reglamentElement) {
                        reglamentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        highlightElement(reglamentElement, title);
                    }
                    deps.showReglamentDetail?.(parseInt(originalItemId, 10));
                } else {
                    deps.showNotification?.(
                        'Оригинальный регламент или его категория не найдены.',
                        'warning'
                    );
                }
            } else if (itemType === 'extLink') {
                const extLinkElement = document.querySelector(
                    `.ext-link-item[data-id="${originalItemId}"]`
                );
                if (extLinkElement) {
                    extLinkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightElement(extLinkElement, title);
                    const url = extLinkElement.querySelector('a.ext-link-url')?.href;
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                } else deps.showNotification?.('Оригинальный внешний ресурс не найден.', 'warning');
            } else {
                deps.showNotification?.(
                    `Переход для типа "${itemType}" еще не полностью реализован.`,
                    'info'
                );
            }
        } else {
            deps.showNotification?.('Не удалось определить оригинальный раздел для перехода.', 'error');
        }
    } else if (button && button.classList.contains('toggle-favorite-btn')) {
        event.stopPropagation();
        await toggleFavorite(
            originalItemId,
            itemType,
            originalItemSection,
            title,
            description,
            button
        );
    } else {
        event.stopPropagation();
        console.log(
            `[FIXED] Клик по карточке избранного. Type=${itemType}, ID=${originalItemId}, Section=${originalItemSection}`
        );

        switch (itemType) {
            case 'mainAlgorithm':
                deps.setActiveTab?.('main');
                break;

            case 'sedoTypeSection':
                deps.setActiveTab?.('sedoTypes');
                break;

            case 'algorithm':
                const algoData = deps.algorithms?.[originalItemSection]?.find(
                    (a) => String(a.id) === String(originalItemId)
                );
                if (algoData) {
                    deps.showAlgorithmDetail?.(algoData, originalItemSection);
                } else {
                    deps.showNotification?.('Не удалось найти данные для этого алгоритма.', 'error');
                }
                break;

            case 'bookmark':
            case 'bookmark_note':
                const bookmarkId = parseInt(originalItemId, 10);
                if (!isNaN(bookmarkId)) {
                    deps.showBookmarkDetailModal?.(bookmarkId);
                } else {
                    deps.showNotification?.('Некорректный ID закладки.', 'error');
                }
                break;

            case 'reglament':
                const reglamentId = parseInt(originalItemId, 10);
                if (!isNaN(reglamentId)) {
                    deps.showReglamentDetail?.(reglamentId);
                } else {
                    deps.showNotification?.('Некорректный ID регламента.', 'error');
                }
                break;

            case 'extLink':
                const linkData = await getFromIndexedDB('extLinks', parseInt(originalItemId, 10));
                if (linkData && linkData.url) {
                    try {
                        new URL(linkData.url);
                        window.open(linkData.url, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                        deps.showNotification?.('Некорректный URL у этого ресурса.', 'error');
                    }
                } else {
                    deps.showNotification?.('URL для этого ресурса не найден.', 'error');
                }
                break;

            case 'link':
                const linkDataForCopy = await getFromIndexedDB(
                    'links',
                    parseInt(originalItemId, 10)
                );
                if (linkDataForCopy && linkDataForCopy.link) {
                    deps.copyToClipboard?.(linkDataForCopy.link, 'Ссылка 1С скопирована!');
                } else {
                    deps.showNotification?.('Не удалось получить данные ссылки 1С.', 'error');
                }
                break;

            default:
                deps.showNotification?.(`Просмотр деталей для типа "${itemType}" не реализован.`, 'info');
                break;
        }
    }
}

/**
 * Обработчик клика по кнопке избранного (для делегирования событий)
 */
export async function handleFavoriteActionClick(event) {
    const button = event.target.closest('.toggle-favorite-btn');
    if (!button) return;

    event.stopPropagation();
    event.preventDefault();

    const originalItemId = button.dataset.itemId;
    const itemType = button.dataset.itemType;
    let originalItemSection = button.dataset.originalItemSection;
    let title = button.dataset.itemTitle || 'Элемент';
    let description = button.dataset.itemDescription || '';

    if (!originalItemId || !itemType) {
        console.error(
            'handleFavoriteActionClick: Missing data attributes itemId or itemType on button.',
            button.dataset
        );
        deps.showNotification?.('Ошибка: Не удалось определить элемент.', 'error');
        return;
    }

    if (!originalItemSection && itemType !== 'mainAlgorithm' && itemType !== 'sedoTypeSection') {
        const cardElement = button.closest('.view-item[data-id]');
        if (cardElement) {
            const sectionContainer = cardElement.closest(
                '[id$="Algorithms"], [id$="Container"], [id$="Content"]'
            );
            if (sectionContainer) {
                if (sectionContainer.id.includes('program')) originalItemSection = 'program';
                else if (sectionContainer.id.includes('skzi')) originalItemSection = 'skzi';
                else if (sectionContainer.id.includes('lk1c')) originalItemSection = 'lk1c';
                else if (sectionContainer.id.includes('webReg')) originalItemSection = 'webReg';
                else if (sectionContainer.id.includes('links')) originalItemSection = 'links';
                else if (sectionContainer.id.includes('extLinks')) originalItemSection = 'extLinks';
                else if (sectionContainer.id.includes('reglaments')) {
                    const reglamentListDiv = button.closest('#reglamentsList');
                    if (reglamentListDiv && reglamentListDiv.dataset.currentCategory) {
                        originalItemSection = reglamentListDiv.dataset.currentCategory;
                    } else {
                        try {
                            const reglamentData = await getFromIndexedDB(
                                'reglaments',
                                parseInt(originalItemId, 10)
                            );
                            originalItemSection = reglamentData?.category || 'reglaments';
                        } catch (e) {
                            console.warn(
                                'Не удалось получить категорию для регламента из БД в handleFavoriteActionClick'
                            );
                            originalItemSection = 'reglaments';
                        }
                    }
                } else if (sectionContainer.id.includes('bookmarks'))
                    originalItemSection = 'bookmarks';
            }
        }
        if (!originalItemSection) originalItemSection = State.currentSection;
    } else if (itemType === 'mainAlgorithm' && !originalItemSection) {
        originalItemSection = 'main';
    } else if (itemType === 'sedoTypeSection' && !originalItemSection) {
        originalItemSection = 'sedoTypes';
    }

    if (!originalItemSection) {
        console.error(
            `handleFavoriteActionClick: CRITICAL - originalItemSection could not be determined for ${itemType}:${originalItemId}.`
        );
        deps.showNotification?.('Ошибка: Не удалось определить раздел элемента.', 'error');
        return;
    }

    console.log(
        `Favorite button clicked (Capturing Phase Logic Active): ID=${originalItemId}, Type=${itemType}, Section=${originalItemSection}`
    );
    await toggleFavorite(originalItemId, itemType, originalItemSection, title, description, button);
}

/**
 * Проверяет, является ли элемент избранным (из кэша)
 */
export function isFavorite(itemType, originalItemId) {
    if (!State.currentFavoritesCache) return false;
    return State.currentFavoritesCache.some(
        (fav) => fav.itemType === itemType && String(fav.originalItemId) === String(originalItemId)
    );
}

/**
 * Обновляет UI всех секций, содержащих элементы с возможностью добавления в избранное
 */
export async function refreshAllFavoritableSectionsUI() {
    console.log('Refreshing UI for all sections that can contain favorites...');
    try {
        if (deps.renderAllAlgorithms) {
            deps.renderAllAlgorithms();
            console.log('Refreshed: All algorithm sections.');
        }

        if (deps.loadBookmarks) {
            await deps.loadBookmarks();
            console.log('Refreshed: Bookmarks section.');
        }

        if (deps.loadExtLinks) {
            await deps.loadExtLinks();
            console.log('Refreshed: External Links section.');
        }

        const reglamentsListDiv = document.getElementById('reglamentsList');
        const categoryGrid = document.getElementById('reglamentCategoryGrid');
        if (reglamentsListDiv && categoryGrid && deps.renderReglamentCategories) {
            reglamentsListDiv.classList.add('hidden');
            delete reglamentsListDiv.dataset.currentCategory;
            categoryGrid.classList.remove('hidden');
            deps.renderReglamentCategories();
            console.log('Refreshed: Reglaments section (reset to categories view).');
        }

        const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
        if (showFavoritesHeaderButton) {
            showFavoritesHeaderButton.classList.remove('text-primary');
        }

        console.log('UI refresh for favoritable items complete.');
    } catch (error) {
        console.error('Error during UI refresh of favoritable sections:', error);
        deps.showNotification?.('Произошла ошибка при обновлении интерфейса.', 'error');
    }
}

/**
 * Инициализирует систему избранного: регистрирует обработчики событий
 */
export function initFavoritesSystem() {
    // Регистрация глобального обработчика кликов по кнопкам избранного
    document.addEventListener('click', handleFavoriteActionClick);

    // Регистрация обработчика для контейнера избранного
    const favoritesContainer = document.getElementById('favoritesContainer');
    if (favoritesContainer) {
        favoritesContainer.removeEventListener('click', handleFavoriteContainerClick);
        favoritesContainer.addEventListener('click', handleFavoriteContainerClick);
    }

    // Кнопка в хедере
    const showFavoritesHeaderBtn = document.getElementById('showFavoritesHeaderBtn');
    if (showFavoritesHeaderBtn) {
        showFavoritesHeaderBtn.addEventListener('click', () => deps.setActiveTab?.('favorites'));
    }

    // Кнопка очистки избранного
    const clearFavoritesBtn = document.getElementById('clearFavoritesBtn');
    if (clearFavoritesBtn) {
        clearFavoritesBtn.addEventListener('click', async () => {
            if (confirm('Вы уверены, что хотите очистить ВСЁ избранное? Это действие необратимо.')) {
                if (deps.loadingOverlayManager?.createAndShow) {
                    deps.loadingOverlayManager.createAndShow();
                    deps.loadingOverlayManager.updateProgress(50, 'Очистка избранного...');
                }

                const success = await clearAllFavoritesDB();

                if (success) {
                    await refreshAllFavoritableSectionsUI();
                    await renderFavoritesPage();

                    if (deps.loadingOverlayManager?.hideAndDestroy) {
                        deps.loadingOverlayManager.updateProgress(100, 'Готово');
                        setTimeout(() => deps.loadingOverlayManager.hideAndDestroy(), 500);
                    }
                    deps.showNotification?.('Избранное успешно очищено.', 'success');
                } else {
                    if (deps.loadingOverlayManager?.hideAndDestroy) {
                        deps.loadingOverlayManager.hideAndDestroy();
                    }
                    deps.showNotification?.('Не удалось очистить избранное.', 'error');
                }
            }
        });
    }

    console.log('[Favorites] Система избранного инициализирована');
}

// Экспорт для совместимости с window
export default {
    setFavoritesDependencies,
    initFavoritesSystem,
    toggleFavorite,
    updateFavoriteStatusUI,
    renderFavoritesPage,
    getFavoriteButtonHTML,
    handleFavoriteContainerClick,
    handleFavoriteActionClick,
    isFavorite,
    refreshAllFavoritableSectionsUI,
};
