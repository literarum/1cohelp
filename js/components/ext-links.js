'use strict';

/**
 * Компонент «Внешние ресурсы».
 * Содержит функции для работы с внешними ссылками.
 */

import { escapeHtml } from '../utils/html.js';
import { getAllFromIndexedDB } from '../db/indexeddb.js';
import { NotificationService } from '../services/notification.js';

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let isFavorite = null;
let getFavoriteButtonHTML = null;
let showNotification = null;
let State = null;
let applyCurrentView = null;
let debounce = null;
let filterExtLinks = null;
let setupClearButton = null;
let showAddEditExtLinkModal = null;
let showOrganizeExtLinkCategoriesModal = null;
let handleExtLinkAction = null;
let handleViewToggleClick = null;
let loadExtLinks = null;
let populateExtLinkCategoryFilter = null;
let renderExtLinks = null;

/**
 * Устанавливает зависимости для компонента внешних ссылок
 */
export function setExtLinksDependencies(deps) {
    if (deps.isFavorite !== undefined) isFavorite = deps.isFavorite;
    if (deps.getFavoriteButtonHTML !== undefined) getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.State !== undefined) State = deps.State;
    if (deps.applyCurrentView !== undefined) applyCurrentView = deps.applyCurrentView;
    if (deps.debounce !== undefined) debounce = deps.debounce;
    if (deps.filterExtLinks !== undefined) filterExtLinks = deps.filterExtLinks;
    if (deps.setupClearButton !== undefined) setupClearButton = deps.setupClearButton;
    if (deps.showAddEditExtLinkModal !== undefined) showAddEditExtLinkModal = deps.showAddEditExtLinkModal;
    if (deps.showOrganizeExtLinkCategoriesModal !== undefined) showOrganizeExtLinkCategoriesModal = deps.showOrganizeExtLinkCategoriesModal;
    if (deps.handleExtLinkAction !== undefined) handleExtLinkAction = deps.handleExtLinkAction;
    if (deps.handleViewToggleClick !== undefined) handleViewToggleClick = deps.handleViewToggleClick;
    if (deps.loadExtLinks !== undefined) loadExtLinks = deps.loadExtLinks;
    if (deps.populateExtLinkCategoryFilter !== undefined) populateExtLinkCategoryFilter = deps.populateExtLinkCategoryFilter;
    if (deps.renderExtLinks !== undefined) renderExtLinks = deps.renderExtLinks;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получает все внешние ссылки из базы данных
 */
export async function getAllExtLinks() {
    try {
        console.log("[getAllExtLinks] Вызов getAllFromIndexedDB('extLinks')...");
        const links = await getAllFromIndexedDB('extLinks');
        console.log(`[getAllExtLinks] Получено ${links?.length ?? 0} внешних ссылок.`);
        return links || [];
    } catch (error) {
        console.error('Ошибка в функции getAllExtLinks при получении внешних ссылок:', error);
        if (typeof showNotification === 'function') {
            showNotification('Не удалось получить список внешних ресурсов', 'error');
        } else if (NotificationService && NotificationService.add) {
            NotificationService.add('Не удалось получить список внешних ресурсов', 'error');
        }
        return [];
    }
}

/**
 * Создает DOM элемент внешней ссылки
 */
export function createExtLinkElement(link, categoryMap = {}, viewMode = 'cards') {
    if (!link || typeof link !== 'object' || typeof link.id === 'undefined') {
        console.warn('createExtLinkElement: передан невалидный объект link.', link);
        return null;
    }

    const linkElement = document.createElement('div');
    linkElement.dataset.id = String(link.id);
    linkElement.dataset.category = link.category || '';

    let categoryData = null;
    if (link.category !== null && link.category !== undefined) {
        categoryData = categoryMap[link.category] || null;

        if (!categoryData && typeof link.category === 'string') {
            const legacyKey = link.category.toLowerCase();
            const legacyKeyToNameMap = {
                docs: 'документация',
                gov: 'гос. сайты',
                tools: 'инструменты',
                other: 'прочее',
            };
            const targetName = legacyKeyToNameMap[legacyKey] || legacyKey;

            for (const key in categoryMap) {
                if (categoryMap[key].name && categoryMap[key].name.toLowerCase() === targetName) {
                    categoryData = categoryMap[key];
                    break;
                }
            }
        }
    }

    let categoryBadgeHTML = '';
    if (categoryData) {
        const colorName = categoryData.color || 'gray';
        categoryBadgeHTML = `
            <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-${colorName}-100 text-${colorName}-800 dark:bg-${colorName}-900 dark:text-${colorName}-200" title="Папка: ${escapeHtml(
            categoryData.name,
        )}">
                <i class="fas fa-tag mr-1 opacity-75"></i>${escapeHtml(categoryData.name)}
            </span>`;
    } else if (link.category) {
        categoryBadgeHTML = `
             <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Папка с ID: ${escapeHtml(
                 String(link.category),
             )} не найдена">
                <i class="fas fa-question-circle mr-1 opacity-75"></i>Неизв. папка
            </span>`;
    }

    let urlHostnameHTML = '';
    let cardClickOpensUrl = false;
    let urlForHref = '#';
    try {
        let fixedUrl = String(link.url).trim();
        if (fixedUrl && !fixedUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && fixedUrl.includes('.')) {
            if (!fixedUrl.startsWith('//')) {
                fixedUrl = 'https://' + fixedUrl;
            }
        }
        urlForHref = new URL(fixedUrl).href;
        const hostnameForDisplay = new URL(urlForHref).hostname.replace('www.', '');
        urlHostnameHTML = `<a href="${urlForHref}" target="_blank" rel="noopener noreferrer" class="text-gray-500 dark:text-gray-400 text-xs inline-flex items-center hover:underline" title="Перейти: ${escapeHtml(
            link.url,
        )}"><i class="fas fa-link mr-1 opacity-75"></i>${escapeHtml(hostnameForDisplay)}</a>`;
        cardClickOpensUrl = true;
    } catch (e) {
        urlHostnameHTML = `<span class="text-red-500 text-xs inline-flex items-center" title="Некорректный URL: ${escapeHtml(
            String(link.url),
        )}"><i class="fas fa-exclamation-triangle mr-1"></i>Некорр. URL</span>`;
        cardClickOpensUrl = false;
    }

    // Используем зависимости или глобальные функции
    const isFavFunc = isFavorite || window.isFavorite;
    const getFavBtnFunc = getFavoriteButtonHTML || window.getFavoriteButtonHTML;
    
    const isFav = typeof isFavFunc === 'function' ? isFavFunc('extLink', String(link.id)) : false;
    const favButtonHTML = typeof getFavBtnFunc === 'function' 
        ? getFavBtnFunc(link.id, 'extLink', 'extLinks', link.title, link.description, isFav)
        : '';
    
    const safeTitle = escapeHtml(link.title);
    const safeDescription = escapeHtml(link.description || 'Нет описания');

    if (viewMode === 'cards') {
        linkElement.className =
            'ext-link-item view-item group relative flex flex-col justify-between p-4 rounded-lg shadow-sm hover:shadow-md bg-white dark:bg-gray-700 transition-shadow duration-200 border border-gray-200 dark:border-gray-700 h-full';

        const mainContentHTML = `
            <div class="flex-grow min-w-0 cursor-pointer" data-action="open-link">
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1 truncate" title="${safeTitle}">${safeTitle}</h3>
                <p class="ext-link-description text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2" title="${safeDescription}">${safeDescription}</p>
            </div>
            <div class="ext-link-meta mt-auto pt-2 border-t border-gray-200 dark:border-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                ${categoryBadgeHTML}
                ${urlHostnameHTML}
            </div>
        `;
        const actionsHTML = `
            <div class="ext-link-actions absolute top-2 right-2 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                ${favButtonHTML}
                <button data-action="edit" class="p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Редактировать">
                    <i class="fas fa-edit fa-fw text-sm"></i>
                </button>
                <button data-action="delete" class="p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Удалить">
                    <i class="fas fa-trash fa-fw text-sm"></i>
                </button>
            </div>
        `;
        linkElement.innerHTML = mainContentHTML + actionsHTML;
    } else {
        linkElement.className =
            'ext-link-item view-item group flex items-center p-3 border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors duration-150 ease-in-out';
        linkElement.innerHTML = `
            <div class="flex-grow min-w-0 flex items-center cursor-pointer" data-action="open-link">
                <i class="fas fa-link text-gray-400 dark:text-gray-500 mr-4"></i>
                <div class="min-w-0 flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-gray-100 truncate" title="${safeTitle}">${safeTitle}</h3>
                    <p class="ext-link-description text-sm text-gray-500 dark:text-gray-400 truncate" title="${safeDescription}">${safeDescription}</p>
                </div>
            </div>
             <div class="ext-link-actions flex-shrink-0 ml-4 flex items-center gap-2">
                ${categoryBadgeHTML}
                ${favButtonHTML}
                <button data-action="edit" class="p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Редактировать">
                    <i class="fas fa-edit fa-fw text-sm"></i>
                </button>
                <button data-action="delete" class="p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Удалить">
                    <i class="fas fa-trash fa-fw text-sm"></i>
                </button>
            </div>
        `;
    }

    linkElement.dataset.url = cardClickOpensUrl ? urlForHref : '';
    return linkElement;
}

/**
 * Рендерит список внешних ссылок
 */
export async function renderExtLinks(links, categoryInfoMap = {}) {
    const extLinksContainer = document.getElementById('extLinksContainer');
    if (!extLinksContainer) {
        console.error('Контейнер #extLinksContainer не найден для рендеринга.');
        return;
    }

    const currentView =
        (State && State.viewPreferences && State.viewPreferences['extLinksContainer']) ||
        extLinksContainer.dataset.defaultView ||
        'cards';
    extLinksContainer.innerHTML = '';

    if (!links || links.length === 0) {
        extLinksContainer.innerHTML =
            '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных внешних ресурсов.</div>';
    } else {
        const fragment = document.createDocumentFragment();
        for (const link of links) {
            const linkElement = createExtLinkElement(link, categoryInfoMap, currentView);
            if (linkElement) {
                fragment.appendChild(linkElement);
            }
        }
        extLinksContainer.appendChild(fragment);
    }

    if (typeof applyCurrentView === 'function') {
        applyCurrentView('extLinksContainer');
    }
}

// ============================================================================
// ФУНКЦИИ-ДЕЛЕГАТЫ (пока используют window.*)
// ============================================================================

export function initExternalLinksSystem() {
    if (typeof window.initExternalLinksSystem === 'function') {
        return window.initExternalLinksSystem();
    }
    console.warn('[ext-links.js] initExternalLinksSystem не определена в window.');
}

/**
 * Загружает категории внешних ссылок и инициализирует State.extLinkCategoryInfo
 */
export async function loadExtLinks() {
    if (!State || !State.db) {
        console.warn('loadExtLinks: База данных не инициализирована.');
        if (State) {
            State.extLinkCategoryInfo = {};
        }
        return;
    }

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');
        
        // Инициализируем State.extLinkCategoryInfo как объект, если его нет
        if (!State.extLinkCategoryInfo) {
            State.extLinkCategoryInfo = {};
        }

        // Заполняем State.extLinkCategoryInfo данными из БД
        if (categories && categories.length > 0) {
            categories.forEach((cat) => {
                if (cat && typeof cat.id !== 'undefined') {
                    State.extLinkCategoryInfo[cat.id] = {
                        name: cat.name || 'Без названия',
                        color: cat.color || 'gray',
                    };
                }
            });
            console.log(`loadExtLinks: Загружено ${categories.length} категорий внешних ссылок.`);
        } else {
            console.log('loadExtLinks: Категории внешних ссылок не найдены. State.extLinkCategoryInfo пуст.');
        }
    } catch (error) {
        console.error('Ошибка при загрузке категорий внешних ссылок:', error);
        if (State && !State.extLinkCategoryInfo) {
            State.extLinkCategoryInfo = {};
        }
    }
}
