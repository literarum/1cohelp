'use strict';

/**
 * Компонент «Внешние ресурсы».
 * Содержит функции для работы с внешними ссылками.
 */

import { escapeHtml } from '../utils/html.js';
import { getAllFromIndexedDB } from '../db/indexeddb.js';
import { NotificationService } from '../services/notification.js';

// Полные классы для бейджей категорий (Tailwind не поддерживает динамические имена классов)
const CATEGORY_BADGE_CLASSES = {
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

function normalizeCategoryColor(colorName) {
    if (!colorName) return 'gray';
    const raw = String(colorName).trim().toLowerCase();
    const cleaned = raw
        .replace(/^bg-/, '')
        .replace(/\/.+$/, '')
        .replace(/-(50|100|200|300|400|500|600|700|800|900|950)$/, '');
    return CATEGORY_BADGE_CLASSES[cleaned] ? cleaned : 'gray';
}

function getCategoryBadgeClasses(colorName) {
    const key = normalizeCategoryColor(colorName);
    return CATEGORY_BADGE_CLASSES[key] || CATEGORY_BADGE_CLASSES.gray;
}

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let isFavorite = null;
let getFavoriteButtonHTML = null;
let showNotification = null;
let State = null;
let applyCurrentView = null;
let _debounce = null;
let _filterExtLinks = null;
let _setupClearButton = null;
let _showAddEditExtLinkModal = null;
let _showOrganizeExtLinkCategoriesModal = null;
let _handleExtLinkAction = null;
let _handleViewToggleClick = null;

/**
 * Устанавливает зависимости для компонента внешних ссылок
 */
export function setExtLinksDependencies(deps) {
    if (deps.isFavorite !== undefined) isFavorite = deps.isFavorite;
    if (deps.getFavoriteButtonHTML !== undefined)
        getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.State !== undefined) State = deps.State;
    if (deps.applyCurrentView !== undefined) applyCurrentView = deps.applyCurrentView;
    if (deps.debounce !== undefined) _debounce = deps.debounce;
    if (deps.filterExtLinks !== undefined) _filterExtLinks = deps.filterExtLinks;
    if (deps.setupClearButton !== undefined) _setupClearButton = deps.setupClearButton;
    if (deps.showAddEditExtLinkModal !== undefined)
        _showAddEditExtLinkModal = deps.showAddEditExtLinkModal;
    if (deps.showOrganizeExtLinkCategoriesModal !== undefined)
        _showOrganizeExtLinkCategoriesModal = deps.showOrganizeExtLinkCategoriesModal;
    if (deps.handleExtLinkAction !== undefined) _handleExtLinkAction = deps.handleExtLinkAction;
    if (deps.handleViewToggleClick !== undefined)
        _handleViewToggleClick = deps.handleViewToggleClick;
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
        categoryData = categoryMap[link.category] || categoryMap[String(link.category)] || null;

        if (!categoryData && typeof link.category === 'string') {
            const legacyKey = link.category.toLowerCase();
            const legacyKeyToNameMap = {
                docs: 'документация',
                gov: 'гос. сайты',
                gos: 'гос.сайты',
                tools: 'инструменты',
                other: 'прочее',
            };
            const targetName = legacyKeyToNameMap[legacyKey] || legacyKey;
            const normalizedTargetName = targetName.replace(/\s+/g, '').toLowerCase();

            for (const key in categoryMap) {
                const candidateName = String(categoryMap[key].name || '').toLowerCase();
                const normalizedCandidateName = candidateName.replace(/\s+/g, '');
                if (
                    candidateName === targetName ||
                    normalizedCandidateName === normalizedTargetName
                ) {
                    categoryData = categoryMap[key];
                    break;
                }
            }
        }
    }

    if (categoryData && !categoryData.color) {
        const normalizedName = String(categoryData.name || '')
            .toLowerCase()
            .replace(/\s+/g, '');
        if (normalizedName.includes('гос.сайты') || normalizedName.includes('госсайты')) {
            categoryData.color = 'blue';
        }
    }

    const categoryDisplayName = categoryData
        ? categoryData.name
        : link.category != null
          ? `Категория (ID: ${link.category})`
          : '';
    let categoryBadgeHTML = '';
    if (categoryData) {
        const badgeClasses = getCategoryBadgeClasses(categoryData.color);
        categoryBadgeHTML = `
            <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap ${badgeClasses}" title="Папка: ${escapeHtml(
                categoryData.name,
            )}">
                ${escapeHtml(categoryData.name)}
            </span>`;
    } else if (categoryDisplayName) {
        categoryBadgeHTML = `
             <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Категория с ID: ${escapeHtml(
                 String(link.category),
             )} не найдена в списке">
                ${escapeHtml(categoryDisplayName)}
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
    } catch {
        urlHostnameHTML = `<span class="text-red-500 text-xs inline-flex items-center" title="Некорректный URL: ${escapeHtml(
            String(link.url),
        )}"><i class="fas fa-exclamation-triangle mr-1"></i>Некорр. URL</span>`;
        cardClickOpensUrl = false;
    }

    // Используем зависимости или глобальные функции
    const isFavFunc = isFavorite || window.isFavorite;
    const getFavBtnFunc = getFavoriteButtonHTML || window.getFavoriteButtonHTML;

    const isFav = typeof isFavFunc === 'function' ? isFavFunc('extLink', String(link.id)) : false;
    const favButtonHTML =
        typeof getFavBtnFunc === 'function'
            ? getFavBtnFunc(link.id, 'extLink', 'extLinks', link.title, link.description, isFav)
            : '';

    const safeTitle = escapeHtml(link.title);
    const safeDescription = escapeHtml(link.description || 'Нет описания');

    if (viewMode === 'cards') {
        linkElement.className =
            'ext-link-item view-item group relative flex flex-col justify-between p-4 rounded-lg shadow-sm bg-white dark:bg-gray-700 transition-shadow duration-200 border border-gray-200 dark:border-gray-700 h-full';

        const mainContentHTML = `
            <div class="flex-grow min-w-0 cursor-pointer pt-10 mb-3" data-action="open-link">
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1 truncate w-full" title="${safeTitle}">${safeTitle}</h3>
                <p class="ext-link-description text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2 w-full" title="${safeDescription}">${safeDescription}</p>
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
            'ext-link-item view-item group flex items-center p-content-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 cursor-pointer';
        linkElement.innerHTML = `
            <div class="flex-grow min-w-0 flex items-center cursor-pointer" data-action="open-link">
                <i class="fas fa-link text-gray-400 dark:text-gray-500 mr-4 flex-shrink-0"></i>
                <div class="min-w-0 flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-gray-100 truncate" title="${safeTitle}">${safeTitle}</h3>
                    <p class="ext-link-description text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5" title="${safeDescription}">${safeDescription}</p>
                </div>
            </div>
            <div class="ext-link-actions flex-shrink-0 ml-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                ${categoryBadgeHTML}
                ${favButtonHTML}
                <button data-action="edit" class="p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Редактировать">
                    <i class="fas fa-edit fa-fw text-sm"></i>
                </button>
                <button data-action="delete" class="p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Удалить">
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
    const resolvedCategoryMap = { ...(categoryInfoMap || {}) };

    // Подтягиваем категории из БД, если в карточках есть category, но map пустой/неполный.
    const linksWithCategory = (links || []).filter(
        (link) =>
            link && link.category !== null && link.category !== undefined && link.category !== '',
    );
    const hasMissingCategory = linksWithCategory.some((link) => {
        const key = String(link.category);
        return !resolvedCategoryMap[key] && !resolvedCategoryMap[link.category];
    });
    if (hasMissingCategory) {
        try {
            const categories = await getAllFromIndexedDB('extLinkCategories');
            (categories || []).forEach((cat) => {
                if (!cat || typeof cat.id === 'undefined') return;
                resolvedCategoryMap[cat.id] = {
                    name: cat.name || 'Без названия',
                    color: cat.color || 'gray',
                };
            });
            if (State) {
                State.extLinkCategoryInfo = { ...resolvedCategoryMap };
            }
        } catch (error) {
            console.warn('renderExtLinks: не удалось догрузить категории внешних ресурсов:', error);
        }
    }
    extLinksContainer.innerHTML = '';

    if (!links || links.length === 0) {
        extLinksContainer.innerHTML =
            '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных внешних ресурсов.</div>';
    } else {
        const fragment = document.createDocumentFragment();
        for (const link of links) {
            const linkElement = createExtLinkElement(link, resolvedCategoryMap, currentView);
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
        console.debug('loadExtLinks: База данных не инициализирована.');
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
            console.log(
                'loadExtLinks: Категории внешних ссылок не найдены. State.extLinkCategoryInfo пуст.',
            );
        }
    } catch (error) {
        console.error('Ошибка при загрузке категорий внешних ссылок:', error);
        if (State && !State.extLinkCategoryInfo) {
            State.extLinkCategoryInfo = {};
        }
    }
}
