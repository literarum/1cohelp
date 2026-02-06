'use strict';

/**
 * Модуль инициализации системы внешних ссылок
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let showAddEditExtLinkModal = null;
let showOrganizeExtLinkCategoriesModal = null;
let filterExtLinks = null;
let handleExtLinkAction = null;
let handleViewToggleClick = null;
let loadExtLinks = null;
let populateExtLinkCategoryFilter = null;
let getAllExtLinks = null;
let renderExtLinks = null;
let debounce = null;
let setupClearButton = null;

export function setExtLinksInitDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.showAddEditExtLinkModal !== undefined) showAddEditExtLinkModal = deps.showAddEditExtLinkModal;
    if (deps.showOrganizeExtLinkCategoriesModal !== undefined) showOrganizeExtLinkCategoriesModal = deps.showOrganizeExtLinkCategoriesModal;
    if (deps.filterExtLinks !== undefined) filterExtLinks = deps.filterExtLinks;
    if (deps.handleExtLinkAction !== undefined) handleExtLinkAction = deps.handleExtLinkAction;
    if (deps.handleViewToggleClick !== undefined) handleViewToggleClick = deps.handleViewToggleClick;
    if (deps.loadExtLinks !== undefined) loadExtLinks = deps.loadExtLinks;
    if (deps.populateExtLinkCategoryFilter !== undefined) populateExtLinkCategoryFilter = deps.populateExtLinkCategoryFilter;
    if (deps.getAllExtLinks !== undefined) getAllExtLinks = deps.getAllExtLinks;
    if (deps.renderExtLinks !== undefined) renderExtLinks = deps.renderExtLinks;
    if (deps.debounce !== undefined) debounce = deps.debounce;
    if (deps.setupClearButton !== undefined) setupClearButton = deps.setupClearButton;
}

// ============================================================================
// ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
// ============================================================================

/**
 * Инициализирует систему внешних ссылок
 */
export async function initExternalLinksSystem() {
    const LOG_PREFIX = '[initExternalLinksSystem v2.1_FINAL]';
    console.log(`${LOG_PREFIX} --- START ---`);

    // Ждем, пока DOM будет готов
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    const panel = document.getElementById('extLinksContent');
    if (!panel) {
        console.error(
            `${LOG_PREFIX} CRITICAL FAILURE: Панель #extLinksContent отсутствует в HTML.`,
        );
        return;
    }
    
    console.log(`${LOG_PREFIX} Панель #extLinksContent найдена, текущий innerHTML длина: ${panel.innerHTML.length}`);

    const structureHTML = `
        <div class="bg-gray-100 dark:bg-gray-800 p-content rounded-lg shadow-md">
            <div class="flex flex-wrap gap-x-4 gap-y-2 justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Внешние ресурсы</h2>
                <div class="flex items-center gap-2">
                    <div class="flex items-center space-x-1 border border-gray-300 dark:border-gray-600 rounded-md p-0.5">
                            <button class="view-toggle p-1.5 rounded bg-primary text-white" data-view="cards" title="Вид карточек"> <i class="fas fa-th-large"></i> </button>
                            <button class="view-toggle p-1.5 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-300" data-view="list" title="Вид списка"> <i class="fas fa-list"></i> </button>
                        </div>
                    <button
                        id="addExtLinkBtn"
                        class="h-9 px-3.5 bg-primary hover:bg-secondary text-white rounded-md shadow-sm transition inline-flex items-center gap-2"
                    >
                        <i class="fas fa-plus mr-1"></i>Добавить
                    </button>
                    <button id="organizeExtLinkCategoriesBtn" class="px-3 py-2 bg-primary hover:bg-secondary text-white dark:text-gray-200 rounded-md transition text-sm font-medium flex items-center">
                        <i class="fas fa-folder-open mr-2"></i>Категории
                    </button>
                </div>
            </div>
            <div class="flex items-center gap-4 mb-4 flex-shrink-0">
                <div class="relative flex-grow">
                    <input type="text" id="extLinkSearchInput" placeholder="Поиск по ресурсам..." class="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100">
                    <button id="clearExtLinkSearchBtn" class="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white-700 hidden" title="Очистить поиск">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <select id="extLinkCategoryFilter" class="w-auto py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100">
                    <option value="">Все категории</option>
                </select>
            </div>
            <div id="extLinksContainer" class="flex-grow min-h-0 overflow-y-auto custom-scrollbar -mr-content-sm pr-content-sm view-section" data-section-id="extLinksContainer" data-default-view="cards">
            </div>
        </div>
    `;
    // Очищаем панель перед вставкой нового HTML
    panel.innerHTML = '';
    panel.innerHTML = structureHTML;

    // Используем requestAnimationFrame для гарантии, что DOM обновился
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const addBtn = panel.querySelector('#addExtLinkBtn');
    const organizeBtn = panel.querySelector('#organizeExtLinkCategoriesBtn');
    const searchInput = panel.querySelector('#extLinkSearchInput');
    const categoryFilter = panel.querySelector('#extLinkCategoryFilter');
    const clearSearchBtn = panel.querySelector('#clearExtLinkSearchBtn');
    const viewToggles = panel.querySelectorAll('.view-toggle');
    const contentContainer = panel.querySelector('#extLinksContainer');

    // Детальное логирование для отладки
    if (!addBtn) console.error(`${LOG_PREFIX} Не найден: #addExtLinkBtn`);
    if (!organizeBtn) console.error(`${LOG_PREFIX} Не найден: #organizeExtLinkCategoriesBtn`);
    if (!searchInput) console.error(`${LOG_PREFIX} Не найден: #extLinkSearchInput`);
    if (!categoryFilter) console.error(`${LOG_PREFIX} Не найден: #extLinkCategoryFilter`);
    if (!clearSearchBtn) console.error(`${LOG_PREFIX} Не найден: #clearExtLinkSearchBtn`);
    if (!contentContainer) console.error(`${LOG_PREFIX} Не найден: #extLinksContainer`);
    if (!viewToggles || viewToggles.length === 0) console.error(`${LOG_PREFIX} Не найдены: .view-toggle`);

    if (
        !addBtn ||
        !organizeBtn ||
        !searchInput ||
        !categoryFilter ||
        !clearSearchBtn ||
        !contentContainer
    ) {
        console.error(
            `${LOG_PREFIX} CRITICAL: Не удалось найти все элементы управления после рендеринга HTML.`,
        );
        console.error(`${LOG_PREFIX} HTML структура:`, panel.innerHTML.substring(0, 500));
        return;
    }

    addBtn.addEventListener('click', () => {
        if (showAddEditExtLinkModal && typeof showAddEditExtLinkModal === 'function') {
            showAddEditExtLinkModal();
        } else {
            console.error(`${LOG_PREFIX} showAddEditExtLinkModal не найдена`);
        }
    });
    organizeBtn.addEventListener('click', () => {
        if (showOrganizeExtLinkCategoriesModal && typeof showOrganizeExtLinkCategoriesModal === 'function') {
            showOrganizeExtLinkCategoriesModal();
        } else {
            console.error(`${LOG_PREFIX} showOrganizeExtLinkCategoriesModal не найдена`);
        }
    });

    if (debounce && filterExtLinks) {
        const debouncedFilter = debounce(filterExtLinks, 250);
        searchInput.addEventListener('input', debouncedFilter);
    } else {
        console.error(`${LOG_PREFIX} debounce или filterExtLinks не найдены`);
    }

    if (setupClearButton && filterExtLinks) {
        setupClearButton('extLinkSearchInput', 'clearExtLinkSearchBtn', filterExtLinks);
    } else {
        console.error(`${LOG_PREFIX} setupClearButton не найдена`);
    }

    if (filterExtLinks) {
        categoryFilter.addEventListener('change', filterExtLinks);
    }

    if (handleExtLinkAction) {
        contentContainer.addEventListener('click', handleExtLinkAction);
    }

    if (handleViewToggleClick) {
        viewToggles.forEach((button) => button.addEventListener('click', handleViewToggleClick));
    }

    // Загружаем категории и инициализируем фильтр
    if (loadExtLinks && typeof loadExtLinks === 'function') {
        await loadExtLinks();
    } else {
        console.error(`${LOG_PREFIX} loadExtLinks не найдена`);
    }

    if (populateExtLinkCategoryFilter && typeof populateExtLinkCategoryFilter === 'function') {
        await populateExtLinkCategoryFilter(categoryFilter);
    } else {
        console.error(`${LOG_PREFIX} populateExtLinkCategoryFilter не найдена`);
    }
    
    if (getAllExtLinks && renderExtLinks && State) {
        const allLinks = await getAllExtLinks();
        renderExtLinks(allLinks, State.extLinkCategoryInfo);
    } else {
        console.error(`${LOG_PREFIX} getAllExtLinks, renderExtLinks или State не найдены`);
    }

    console.log(`${LOG_PREFIX} --- END --- Система внешних ресурсов успешно инициализирована.`);
}
