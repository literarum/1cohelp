'use strict';

/**
 * Компонент «Регламенты».
 * Модуль для работы с регламентами: CRUD операции, отображение, модальные окна.
 */

import { escapeHtml } from '../utils/html.js';

// ========== Dependencies (будут инъектированы через setReglamentsDependencies) ==========
let State = null;
let categoryDisplayInfo = null;
let getFromIndexedDB = null;
let saveToIndexedDB = null;
let deleteFromIndexedDB = null;
let getAllFromIndexedDB = null;
let showNotification = null;
let applyCurrentView = null;
let isFavorite = null;
let getFavoriteButtonHTML = null;
let updateSearchIndex = null;
let getOrCreateModal = null;
let removeEscapeHandler = null;
let addEscapeHandler = null;
let toggleModalFullscreen = null;
let getVisibleModals = null;
let ExportService = null;
let reglamentDetailModalConfig = null;
let reglamentModalConfigGlobal = null;
let handleViewToggleClick = null;

/**
 * Устанавливает зависимости модуля регламентов
 * @param {Object} deps - Объект с зависимостями
 */
export function setReglamentsDependencies(deps) {
    if (deps.State) State = deps.State;
    if (deps.categoryDisplayInfo) categoryDisplayInfo = deps.categoryDisplayInfo;
    if (deps.getFromIndexedDB) getFromIndexedDB = deps.getFromIndexedDB;
    if (deps.saveToIndexedDB) saveToIndexedDB = deps.saveToIndexedDB;
    if (deps.deleteFromIndexedDB) deleteFromIndexedDB = deps.deleteFromIndexedDB;
    if (deps.getAllFromIndexedDB) getAllFromIndexedDB = deps.getAllFromIndexedDB;
    if (deps.showNotification) showNotification = deps.showNotification;
    if (deps.applyCurrentView) applyCurrentView = deps.applyCurrentView;
    if (deps.isFavorite) isFavorite = deps.isFavorite;
    if (deps.getFavoriteButtonHTML) getFavoriteButtonHTML = deps.getFavoriteButtonHTML;
    if (deps.updateSearchIndex) updateSearchIndex = deps.updateSearchIndex;
    if (deps.getOrCreateModal) getOrCreateModal = deps.getOrCreateModal;
    if (deps.removeEscapeHandler) removeEscapeHandler = deps.removeEscapeHandler;
    if (deps.addEscapeHandler) addEscapeHandler = deps.addEscapeHandler;
    if (deps.toggleModalFullscreen) toggleModalFullscreen = deps.toggleModalFullscreen;
    if (deps.getVisibleModals) getVisibleModals = deps.getVisibleModals;
    if (deps.ExportService) ExportService = deps.ExportService;
    if (deps.reglamentDetailModalConfig) reglamentDetailModalConfig = deps.reglamentDetailModalConfig;
    if (deps.reglamentModalConfigGlobal) reglamentModalConfigGlobal = deps.reglamentModalConfigGlobal;
    if (deps.handleViewToggleClick) handleViewToggleClick = deps.handleViewToggleClick;
}

// ========== Utility Functions ==========

/**
 * Заполняет выпадающие списки категорий регламентов
 */
export function populateReglamentCategoryDropdowns() {
    const selects = document.querySelectorAll('#reglamentCategory, #editReglamentCategory');
    selects.forEach((select) => {
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Выберите категорию</option>';

        const fragment = document.createDocumentFragment();
        const sortedCategories = Object.entries(categoryDisplayInfo).sort(([, a], [, b]) =>
            a.title.localeCompare(b.title),
        );

        sortedCategories.forEach(([id, info]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = info.title;
            fragment.appendChild(option);
        });
        select.appendChild(fragment);

        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// ========== Data Access Functions ==========

/**
 * Загружает регламенты из IndexedDB
 * @returns {Promise<boolean>} true если успешно
 */
export async function loadReglaments() {
    if (!State?.db) {
        console.warn(
            '[loadReglaments - CORRECTED] База данных не инициализирована. Загрузка регламентов невозможна.',
        );
        return false;
    }

    try {
        const reglaments = await getAllFromIndexedDB('reglaments');
        if (!reglaments || reglaments.length === 0) {
            console.log(
                "[loadReglaments - CORRECTED] Хранилище 'reglaments' пусто или не содержит данных. Дефолтные регламенты НЕ создаются.",
            );
        } else {
            console.log(
                `[loadReglaments - CORRECTED] В базе найдено ${reglaments.length} регламентов.`,
            );
        }
        return true;
    } catch (error) {
        console.error(
            '[loadReglaments - CORRECTED] Ошибка при доступе к хранилищу регламентов:',
            error,
        );
        return false;
    }
}

/**
 * Получает все регламенты из IndexedDB
 * @returns {Promise<Array>} Массив регламентов
 */
export async function getAllReglaments() {
    try {
        const reglaments = await getAllFromIndexedDB('reglaments');
        return reglaments || [];
    } catch (error) {
        console.error('Ошибка при получении всех регламентов:', error);
        return [];
    }
}

/**
 * Получает регламенты по категории
 * @param {string} category - ID категории
 * @returns {Promise<Array>} Массив регламентов категории
 */
export function getReglamentsByCategory(category) {
    return new Promise((resolve, reject) => {
        if (!State?.db) {
            console.error('База данных не инициализирована для getReglamentsByCategory');
            return reject('База данных не готова');
        }
        try {
            const transaction = State.db.transaction('reglaments', 'readonly');
            const store = transaction.objectStore('reglaments');
            const index = store.index('category');
            const request = index.getAll(category);

            request.onsuccess = (event) => {
                resolve(event.target.result || []);
            };
            request.onerror = (event) => {
                console.error("Ошибка запроса к индексу 'category':", event.target.error);
                reject(event.target.error);
            };
        } catch (error) {
            console.error('Ошибка при создании транзакции или доступе к хранилищу/индексу:', error);
            reject(error);
        }
    });
}

// ========== Render Functions ==========

/**
 * Создает DOM-элемент категории
 * @param {string} categoryId - ID категории
 * @param {string} title - Название категории
 * @param {string} iconClass - CSS класс иконки
 * @param {string} color - Цвет категории
 * @returns {HTMLElement} DOM-элемент категории
 */
export function createCategoryElement(categoryId, title, iconClass = 'fa-folder', color = 'gray') {
    const categoryElement = document.createElement('div');
    categoryElement.className = `reglament-category view-item bg-white dark:bg-gray-700 p-content rounded-lg shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between group relative border-l-4 border-transparent`;
    categoryElement.dataset.category = categoryId;

    const iconColorMap = {
        red: 'text-red-400',
        blue: 'text-blue-400',
        orange: 'text-orange-400',
        gray: 'text-gray-300',
        default: 'text-gray-300',
    };

    const iconColorClass = iconColorMap[color] || iconColorMap['default'];
    const titleBaseColorClass = 'text-gray-100';
    const titleHoverColorClass = 'group-hover:text-primary';

    categoryElement.innerHTML = `
        <div class="category-content-wrapper flex-grow flex flex-col items-center text-center md:items-start md:text-left">
            <div class="category-header-info flex flex-col md:flex-row items-center md:items-center mb-2">
                <i class="category-icon fas ${iconClass} ${iconColorClass} text-3xl md:text-2xl md:mr-3"></i>
                <h4 class="category-title font-bold text-lg ${titleBaseColorClass} ${titleHoverColorClass} transition-colors duration-150 ease-in-out">${title}</h4>
            </div>
        </div>
    `;
    return categoryElement;
}

/**
 * Рендерит сетку категорий регламентов
 */
export function renderReglamentCategories() {
    const categoryGrid = document.getElementById('reglamentCategoryGrid');
    if (!categoryGrid) {
        console.error('Category grid container (#reglamentCategoryGrid) not found.');
        return;
    }
    categoryGrid.innerHTML = '';

    Object.entries(categoryDisplayInfo).forEach(([categoryId, info]) => {
        const categoryElement = createCategoryElement(
            categoryId,
            info.title,
            info.icon,
            info.color,
        );
        categoryGrid.appendChild(categoryElement);
    });
}

/**
 * Показывает регламенты для выбранной категории
 * @param {string} categoryId - ID категории
 */
export async function showReglamentsForCategory(categoryId) {
    const reglamentsContainer = document.getElementById('reglamentsContainer');
    const reglamentsListDiv = document.getElementById('reglamentsList');
    const currentCategoryTitleEl = document.getElementById('currentCategoryTitle');
    const categoryGridElement = document.getElementById('reglamentCategoryGrid');

    if (
        !reglamentsContainer ||
        !reglamentsListDiv ||
        !currentCategoryTitleEl ||
        !categoryGridElement
    ) {
        console.error('Ошибка: Не найдены ключевые элементы для отображения регламентов.');
        showNotification('Ошибка интерфейса регламентов', 'error');
        return;
    }

    const title = categoryDisplayInfo[categoryId]?.title || categoryId;
    currentCategoryTitleEl.textContent = title;

    categoryGridElement.classList.add('hidden');
    reglamentsListDiv.classList.remove('hidden');
    reglamentsListDiv.dataset.currentCategory = categoryId;

    reglamentsContainer.innerHTML =
        '<div class="text-center py-6 text-gray-500 dark:text-gray-400 col-span-full">Загрузка регламентов...</div>';

    if (reglamentsListDiv._reglamentActionHandler) {
        reglamentsListDiv.removeEventListener('click', reglamentsListDiv._reglamentActionHandler);
    }
    reglamentsListDiv._reglamentActionHandler = handleReglamentAction;
    reglamentsListDiv.addEventListener('click', reglamentsListDiv._reglamentActionHandler);

    try {
        const reglaments = await getReglamentsByCategory(categoryId);
        reglamentsContainer.innerHTML = '';

        if (!reglaments || reglaments.length === 0) {
            reglamentsContainer.innerHTML =
                '<div class="py-6 text-gray-500 dark:text-gray-400 col-span-full text-center">В этой категории пока нет регламентов. <br> Вы можете <button class="bg-transparent text-primary hover:underline font-medium px-1 py-0.5 rounded" data-action="add-reglament-from-empty">добавить регламент</button> в эту категорию.</div>';
            applyCurrentView('reglamentsContainer');
            return;
        }

        const fragment = document.createDocumentFragment();
        reglaments.forEach((reglament) => {
            const reglamentElement = document.createElement('div');
            reglamentElement.className =
                'reglament-item view-item group relative flex flex-col mb-2';
            reglamentElement.dataset.id = reglament.id;

            const isFav = isFavorite('reglament', String(reglament.id));
            const favButtonHTML = getFavoriteButtonHTML(
                reglament.id,
                'reglament',
                'reglaments',
                reglament.title,
                reglament.content?.substring(0, 100) + '...',
                isFav,
            );

            reglamentElement.innerHTML = `
                <div class="flex flex-col justify-center h-full min-h-[3rem] sm:min-h-[3.5rem]" data-action="view"> 
                    <h4 class="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary dark:group-hover:text-primary truncate" title="${escapeHtml(
                        reglament.title,
                    )}">
                        ${escapeHtml(reglament.title)}
                    </h4>
                </div>
                <div class="reglament-actions absolute top-2 right-2 z-10 flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                    ${favButtonHTML}
                    <button data-action="edit" class="edit-reglament-inline p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none" title="Редактировать">
                        <i class="fas fa-edit fa-sm"></i>
                    </button>
                    <button data-action="delete" class="delete-reglament-inline p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none ml-1" title="Удалить">
                        <i class="fas fa-trash fa-sm"></i>
                    </button>
                </div>
            `;
            fragment.appendChild(reglamentElement);
        });

        reglamentsContainer.appendChild(fragment);
        applyCurrentView('reglamentsContainer');
    } catch (error) {
        console.error(`Ошибка при загрузке регламентов для категории ${categoryId}:`, error);
        reglamentsContainer.innerHTML =
            '<div class="text-center py-6 text-red-500 col-span-full">Не удалось загрузить регламенты.</div>';
        showNotification('Ошибка загрузки регламентов', 'error');
    } finally {
        reglamentsListDiv.scrollTop = 0;
    }
}

// ========== Action Handlers ==========

/**
 * Обработчик действий с регламентами (просмотр, редактирование, удаление)
 * @param {Event} event - Событие клика
 */
export function handleReglamentAction(event) {
    const target = event.target;

    if (target.closest('.toggle-favorite-btn')) {
        console.log('[handleReglamentAction] Click on favorite button detected, returning early.');
        return;
    }

    const addTrigger = target.closest('button[data-action="add-reglament-from-empty"]');
    if (addTrigger) {
        event.preventDefault();
        const reglamentsListDiv = document.getElementById('reglamentsList');
        const currentCategoryId = reglamentsListDiv?.dataset.currentCategory;
        showAddReglamentModal(currentCategoryId);
        return;
    }

    const reglamentItem = target.closest('.reglament-item[data-id]');
    if (!reglamentItem) return;

    const reglamentId = parseInt(reglamentItem.dataset.id);

    const actionButton = target.closest('button[data-action]');

    if (actionButton) {
        const action = actionButton.dataset.action;

        if (action === 'edit') {
            editReglament(reglamentId);
        } else if (action === 'delete') {
            const title = reglamentItem.querySelector('h4')?.title || `ID ${reglamentId}`;
            if (confirm(`Вы уверены, что хотите удалить регламент "${title}"?`)) {
                deleteReglamentFromList(reglamentId, reglamentItem);
            }
        }
    } else {
        showReglamentDetail(reglamentId);
    }
}

/**
 * Удаляет регламент из списка и IndexedDB
 * @param {number|string} reglamentId - ID регламента
 * @param {HTMLElement} reglamentItemElement - DOM-элемент регламента
 */
export async function deleteReglamentFromList(reglamentId, reglamentItemElement) {
    const numericId = parseInt(reglamentId, 10);
    if (isNaN(numericId)) {
        console.error('deleteReglamentFromList: Передан невалидный ID регламента:', reglamentId);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка: Неверный ID регламента для удаления.', 'error');
        }
        return;
    }

    let reglamentToDelete = null;

    try {
        try {
            reglamentToDelete = await getFromIndexedDB('reglaments', numericId);
        } catch (fetchError) {
            console.warn(
                `Не удалось получить данные регламента ${numericId} перед удалением (для индекса):`,
                fetchError,
            );
        }

        await deleteFromIndexedDB('reglaments', numericId);
        console.log(`Регламент с ID ${numericId} успешно удален из IndexedDB.`);

        if (reglamentItemElement && reglamentItemElement.parentNode) {
            const parentContainer = reglamentItemElement.parentNode;
            reglamentItemElement.remove();
            console.log(`DOM-элемент регламента ${numericId} удален.`);

            if (
                parentContainer.id === 'reglamentsContainer' &&
                parentContainer.children.length === 0
            ) {
                parentContainer.innerHTML =
                    '<div class="py-6 text-gray-500 dark:text-gray-400 col-span-full text-center">В этой категории пока нет регламентов. <br> Вы можете <button class="bg-transparent text-primary hover:underline font-medium px-1 py-0.5 rounded" data-action="add-reglament-from-empty">добавить регламент</button> в эту категорию.</div>';
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView('reglamentsContainer');
                }
            }
        } else {
            console.warn(
                `DOM-элемент регламента ${numericId} не был предоставлен или уже удален. Список может потребовать полной перерисовки.`,
            );
            const reglamentsListDiv = document.getElementById('reglamentsList');
            const currentCategoryId = reglamentsListDiv?.dataset.currentCategory;
            if (currentCategoryId) {
                await showReglamentsForCategory(currentCategoryId);
            }
        }

        if (typeof showNotification === 'function') {
            showNotification('Регламент успешно удален.', 'success');
        }

        if (reglamentToDelete && typeof updateSearchIndex === 'function') {
            await updateSearchIndex('reglaments', numericId, reglamentToDelete, 'delete');
            console.log(`Поисковый индекс обновлен (удаление) для регламента ID ${numericId}.`);
        } else if (typeof updateSearchIndex !== 'function') {
            console.warn('Функция updateSearchIndex не найдена. Поисковый индекс не обновлен.');
        } else if (!reglamentToDelete) {
            console.warn(
                `Данные удаленного регламента (reglamentToDelete) отсутствуют для ID ${numericId}. Поисковый индекс может быть не обновлен корректно.`,
            );
        }
    } catch (error) {
        console.error(`Ошибка при удалении регламента ID ${numericId}:`, error);
        if (typeof showNotification === 'function') {
            showNotification(
                'Ошибка при удалении регламента: ' + (error.message || 'Неизвестная ошибка'),
                'error',
            );
        }
        const reglamentsListDiv = document.getElementById('reglamentsList');
        const currentCategoryId = reglamentsListDiv?.dataset.currentCategory;
        if (currentCategoryId) {
            await showReglamentsForCategory(currentCategoryId);
        }
    }
}

// ========== Modal Functions ==========

/**
 * Показывает модальное окно деталей регламента
 * @param {number|string} reglamentId - ID регламента
 */
export async function showReglamentDetail(reglamentId) {
    if (typeof reglamentId !== 'number' && typeof reglamentId !== 'string') {
        console.error('showReglamentDetail: Invalid reglamentId provided:', reglamentId);
        showNotification('Ошибка: Неверный ID регламента.', 'error');
        return;
    }
    const numericId = parseInt(reglamentId, 10);
    if (isNaN(numericId)) {
        console.error('showReglamentDetail: Could not parse reglamentId to number:', reglamentId);
        showNotification('Ошибка: Неверный формат ID регламента.', 'error');
        return;
    }

    const modalId = 'reglamentDetailModal';
    const modalClassName =
        'fixed inset-0 bg-black bg-opacity-50 hidden z-[70] p-4 flex items-center justify-center';

    const modalHTML = `
        <div class="flex items-center justify-center min-h-full">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100" id="reglamentDetailTitle">Детали регламента</h2>
                        <div class="flex items-center">
                            <div class="fav-btn-placeholder-modal-reglament mr-1"></div>
                            <button id="exportReglamentToPdfBtn" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Экспорт в PDF">
                                <i class="fas fa-file-pdf"></i>
                            </button>
                            <button id="toggleFullscreenReglamentDetailBtn" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                                <i class="fas fa-expand"></i>
                            </button>
                            <button class="close-detail-modal ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" aria-label="Закрыть">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-6" id="reglamentDetailContent">
                    <p class="text-center text-gray-500 dark:text-gray-400">Загрузка данных...</p>
                </div>
                <div class="flex-shrink-0 px-6 py-4">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-3">
                        <span class="text-xs text-gray-500 dark:text-gray-400 text-center sm:text-left" id="reglamentDetailMeta"></span>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <button type="button" id="editReglamentFromDetailBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition text-sm font-medium inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed">
                                <i class="fas fa-edit mr-1.5"></i> Редактировать
                            </button>
                            <button type="button" class="close-detail-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition text-sm font-medium">
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    const setupDetailModal = (modalElement, isNew) => {
        const editButton = modalElement.querySelector('#editReglamentFromDetailBtn');
        if (editButton) {
            if (editButton._clickHandler) {
                editButton.removeEventListener('click', editButton._clickHandler);
            }
            editButton._clickHandler = () => {
                const currentId = modalElement.dataset.currentReglamentId;
                if (currentId) {
                    modalElement.classList.add('hidden');
                    removeEscapeHandler(modalElement);
                    if (getVisibleModals().filter((m) => m.id !== modalId).length === 0) {
                        document.body.classList.remove('modal-open');
                    }
                    editReglament(parseInt(currentId, 10));
                } else {
                    console.error(
                        'Не найден ID регламента для редактирования в dataset модального окна',
                    );
                    showNotification(
                        'Ошибка: Не удалось определить ID для редактирования.',
                        'error',
                    );
                }
            };
            editButton.addEventListener('click', editButton._clickHandler);
        } else {
            console.error(
                'Кнопка редактирования #editReglamentFromDetailBtn не найдена в модальном окне деталей',
            );
        }

        const fullscreenBtn = modalElement.querySelector('#toggleFullscreenReglamentDetailBtn');
        if (fullscreenBtn) {
            if (fullscreenBtn._fullscreenToggleHandler) {
                fullscreenBtn.removeEventListener('click', fullscreenBtn._fullscreenToggleHandler);
            }
            fullscreenBtn._fullscreenToggleHandler = () => {
                if (typeof toggleModalFullscreen === 'function') {
                    toggleModalFullscreen(
                        reglamentDetailModalConfig.modalId,
                        reglamentDetailModalConfig.buttonId,
                        reglamentDetailModalConfig.classToggleConfig,
                        reglamentDetailModalConfig.innerContainerSelector,
                        reglamentDetailModalConfig.contentAreaSelector,
                    );
                } else {
                    console.error('Функция toggleModalFullscreen не найдена!');
                    showNotification(
                        'Ошибка: Функция переключения полноэкранного режима недоступна.',
                        'error',
                    );
                }
            };
            fullscreenBtn.addEventListener('click', fullscreenBtn._fullscreenToggleHandler);
            console.log(
                `Fullscreen listener attached to ${reglamentDetailModalConfig.buttonId} for ${reglamentDetailModalConfig.modalId}.`,
            );
        } else {
            console.error(
                'Кнопка #toggleFullscreenReglamentDetailBtn не найдена в модальном окне деталей регламента!',
            );
        }

        const exportBtn = modalElement.querySelector('#exportReglamentToPdfBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const content = document.getElementById('reglamentDetailContent');
                const title = document.getElementById('reglamentDetailTitle').textContent;
                ExportService.exportElementToPdf(content, title);
            });
        }
    };

    const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupDetailModal);
    const titleElement = modal.querySelector('#reglamentDetailTitle');
    const contentElement = modal.querySelector('#reglamentDetailContent');
    const metaElement = modal.querySelector('#reglamentDetailMeta');
    const editButton = modal.querySelector('#editReglamentFromDetailBtn');

    const favoriteButtonContainer = modal.querySelector('.fav-btn-placeholder-modal-reglament');

    if (titleElement) titleElement.textContent = 'Загрузка регламента...';
    if (contentElement)
        contentElement.innerHTML =
            '<p class="text-center text-gray-500 dark:text-gray-400">Загрузка данных...</p>';
    if (metaElement) metaElement.textContent = '';
    if (editButton) editButton.disabled = true;
    modal.dataset.currentReglamentId = String(numericId);

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    try {
        const reglament = await getFromIndexedDB('reglaments', numericId);

        if (!reglament) {
            if (titleElement) titleElement.textContent = 'Ошибка';
            if (contentElement)
                contentElement.innerHTML = `<p class="text-red-500 text-center font-semibold">Регламент с ID ${numericId} не найден.</p>`;
            showNotification('Регламент не найден', 'error');
            if (editButton) editButton.disabled = true;
            return;
        }

        if (favoriteButtonContainer) {
            const isFav = isFavorite('reglament', String(reglament.id));
            const favButtonHTML = getFavoriteButtonHTML(
                reglament.id,
                'reglament',
                'reglaments',
                reglament.title,
                reglament.content?.substring(0, 100) + '...',
                isFav,
            );
            favoriteButtonContainer.innerHTML = favButtonHTML;
        }

        if (titleElement) titleElement.textContent = reglament.title || 'Без заголовка';

        if (contentElement) {
            try {
                const preElement = document.createElement('pre');
                preElement.className = 'whitespace-pre-wrap break-words text-sm font-sans';
                preElement.style.fontSize = '102%';
                preElement.textContent = reglament.content || 'Содержимое отсутствует.';
                contentElement.innerHTML = '';
                contentElement.appendChild(preElement);
            } catch (error) {
                console.error('Error setting reglament content:', error);
                contentElement.textContent = 'Ошибка отображения содержимого.';
            }
        }

        if (metaElement) {
            const categoryInfo = reglament.category
                ? categoryDisplayInfo[reglament.category]
                : null;
            const categoryName = categoryInfo
                ? categoryInfo.title
                : reglament.category || 'Без категории';
            const dateAdded = reglament.dateAdded
                ? new Date(reglament.dateAdded).toLocaleDateString()
                : 'Неизвестно';
            const dateUpdated = reglament.dateUpdated
                ? new Date(reglament.dateUpdated).toLocaleDateString()
                : null;

            let metaParts = [
                `ID: ${reglament.id}`,
                `Категория: ${categoryName}`,
                `Добавлен: ${dateAdded}`,
            ];
            if (dateUpdated && dateUpdated !== dateAdded) {
                metaParts.push(`Обновлен: ${dateUpdated}`);
            }
            metaElement.textContent = metaParts.join(' | ');
        }

        if (editButton) editButton.disabled = false;
    } catch (error) {
        console.error(`Error fetching or displaying reglament ${numericId}:`, error);
        if (titleElement) titleElement.textContent = 'Ошибка загрузки';
        if (contentElement)
            contentElement.innerHTML = `<p class="text-red-500 text-center font-semibold">Не удалось загрузить регламент.</p>`;
        showNotification('Ошибка при загрузке регламента', 'error');
        if (editButton) editButton.disabled = true;
    }
}

/**
 * Показывает модальное окно добавления/редактирования регламента
 * @param {string|null} currentCategoryId - ID текущей категории
 */
export async function showAddReglamentModal(currentCategoryId = null) {
    const modalId = 'reglamentModal';
    const modalClassName =
        'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
    const modalHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] max-w-5xl h-[90vh] flex flex-col overflow-hidden p-2 modal-inner-container">
                    <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <div class="flex justify-between items-center">
                            <h2 class="text-xl font-bold" id="reglamentModalTitle">Добавить регламент</h2>
                            <div>
                                <button id="toggleFullscreenReglamentBtn" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                                    <i class="fas fa-expand"></i>
                                </button>
                                <button class="close-modal inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" aria-label="Закрыть">
                                    <i class="fas fa-times text-xl"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-6 modal-content-area">
                        <form id="reglamentForm" class="h-full flex flex-col">
                            <input type="hidden" id="reglamentId" name="reglamentId">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label class="block text-sm font-medium mb-1" for="reglamentTitle">Название</label>
                                    <input type="text" id="reglamentTitle" name="reglamentTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1" for="reglamentCategory">Категория</label>
                                    <select id="reglamentCategory" name="reglamentCategory" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                        <option value="">Выберите категорию</option>
                                    </select>
                                </div>
                            </div>
                            <div class="mb-4 flex-1 flex flex-col">
                                <label class="block text-sm font-medium mb-1" for="reglamentContent">Содержание</label>
                                <textarea id="reglamentContent" name="reglamentContent" required class="w-full flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base resize-none"></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="flex-shrink-0 px-6 py-4">
                        <div class="flex justify-end">
                            <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition mr-2">
                                Отмена
                            </button>
                            <button type="submit" form="reglamentForm" id="saveReglamentBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                <i class="fas fa-save mr-1"></i> Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            `;

    const setupModalSpecifics = (modalElement, isNew) => {
        const form = modalElement.querySelector('#reglamentForm');
        const titleInput = form.elements.reglamentTitle;
        const categorySelect = form.elements.reglamentCategory;
        const contentTextarea = form.elements.reglamentContent;
        const idInput = form.elements.reglamentId;
        const saveButton = modalElement.querySelector('#saveReglamentBtn');
        const modalTitleEl = modalElement.querySelector('#reglamentModalTitle');

        if (!form.dataset.submitHandlerAttached) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (saveButton) {
                    saveButton.disabled = true;
                    saveButton.innerHTML =
                        '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';
                }

                const title = titleInput.value.trim();
                const category = categorySelect.value;
                const content = contentTextarea.value.trim();
                const reglamentId = idInput.value;

                if (!title || !category || !content) {
                    if (typeof showNotification === 'function') {
                        showNotification(
                            'Пожалуйста, заполните все обязательные поля (Название, Категория, Содержание)',
                            'error',
                        );
                    } else {
                        alert('Пожалуйста, заполните все обязательные поля.');
                    }
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = `<i class="fas fa-save mr-1"></i> ${
                            reglamentId ? 'Сохранить изменения' : 'Сохранить'
                        }`;
                    }
                    return;
                }

                const newData = { title, category, content };
                const isEditing = !!reglamentId;
                let oldData = null;
                let finalId = null;
                const timestamp = new Date().toISOString();

                try {
                    if (isEditing) {
                        newData.id = parseInt(reglamentId, 10);
                        finalId = newData.id;
                        try {
                            oldData = await getFromIndexedDB('reglaments', newData.id);
                            newData.dateAdded = oldData?.dateAdded || timestamp;
                        } catch (fetchError) {
                            console.warn(
                                `Не удалось получить старые данные регламента (${newData.id}):`,
                                fetchError,
                            );
                            newData.dateAdded = timestamp;
                        }
                        newData.dateUpdated = timestamp;
                    } else {
                        newData.dateAdded = timestamp;
                    }

                    const savedResult = await saveToIndexedDB('reglaments', newData);
                    if (!isEditing) {
                        finalId = savedResult;
                        newData.id = finalId;
                    }

                    console.log(
                        `Регламент ${finalId} ${isEditing ? 'обновлен' : 'добавлен'} успешно.`,
                    );

                    if (typeof updateSearchIndex === 'function') {
                        updateSearchIndex(
                            'reglaments',
                            finalId,
                            newData,
                            isEditing ? 'update' : 'add',
                            oldData,
                        )
                            .then(() =>
                                console.log(
                                    `Обновление индекса для регламента (${finalId}) успешно завершено.`,
                                ),
                            )
                            .catch((indexError) => {
                                console.error(
                                    `Ошибка фонового обновления поискового индекса для регламента ${finalId}:`,
                                    indexError,
                                );
                                if (typeof showNotification === 'function') {
                                    showNotification(
                                        'Ошибка обновления поискового индекса.',
                                        'warning',
                                    );
                                }
                            });
                    } else {
                        console.warn('Функция updateSearchIndex недоступна.');
                    }

                    if (typeof showNotification === 'function') {
                        showNotification(
                            isEditing ? 'Регламент успешно обновлен' : 'Регламент успешно добавлен',
                            'success',
                        );
                    }

                    const reglamentsListDiv = document.getElementById('reglamentsList');
                    if (reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden')) {
                        const displayedCategoryId = reglamentsListDiv.dataset.currentCategory;
                        if (displayedCategoryId === category) {
                            console.log(`Обновление списка регламентов для категории ${category}.`);
                            await showReglamentsForCategory(category);
                        }
                    }

                    modalElement.classList.add('hidden');
                    if (typeof removeEscapeHandler === 'function') {
                        removeEscapeHandler(modalElement);
                    }
                    form.reset();
                    idInput.value = '';
                    if (modalTitleEl) modalTitleEl.textContent = 'Добавить регламент';
                    if (saveButton)
                        saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
                    if (getVisibleModals().length === 0) {
                        document.body.classList.remove('modal-open');
                    }
                } catch (error) {
                    console.error(
                        `Ошибка при ${isEditing ? 'обновлении' : 'добавлении'} регламента:`,
                        error,
                    );
                    if (typeof showNotification === 'function') {
                        showNotification(
                            `Ошибка сохранения регламента: ${error.message || error}`,
                            'error',
                        );
                    }
                } finally {
                    if (saveButton) {
                        saveButton.disabled = false;
                    }
                }
            });
            form.dataset.submitHandlerAttached = 'true';
            console.log('Обработчик submit для регламента привязан.');
        }

        const fullscreenBtn = modalElement.querySelector('#toggleFullscreenReglamentBtn');
        if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
            fullscreenBtn.addEventListener('click', () => {
                if (typeof toggleModalFullscreen === 'function') {
                    toggleModalFullscreen(
                        reglamentModalConfigGlobal.modalId,
                        reglamentModalConfigGlobal.buttonId,
                        reglamentModalConfigGlobal.classToggleConfig,
                        reglamentModalConfigGlobal.innerContainerSelector,
                        reglamentModalConfigGlobal.contentAreaSelector,
                    );
                } else {
                    console.error('Функция toggleModalFullscreen не найдена!');
                    if (typeof showNotification === 'function') {
                        showNotification(
                            'Ошибка: Функция переключения полноэкранного режима недоступна.',
                            'error',
                        );
                    }
                }
            });
            fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
            console.log('Обработчик fullscreen для регламента привязан.');
        } else if (!fullscreenBtn && isNew) {
            console.error(
                'Кнопка #toggleFullscreenReglamentBtn не найдена в новом модальном окне регламента.',
            );
        }
    };

    try {
        const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupModalSpecifics);
        const categorySelect = modal.querySelector('#reglamentCategory');
        const titleInput = modal.querySelector('#reglamentTitle');
        const form = modal.querySelector('#reglamentForm');
        const idInput = modal.querySelector('#reglamentId');
        const saveBtn = modal.querySelector('#saveReglamentBtn');
        const modalTitleEl = modal.querySelector('#reglamentModalTitle');

        if (!categorySelect || !titleInput || !form || !idInput || !saveBtn || !modalTitleEl) {
            console.error(
                'Не удалось найти все необходимые элементы в модальном окне регламента после getOrCreateModal.',
            );
            if (typeof showNotification === 'function') {
                showNotification('Ошибка инициализации окна добавления регламента.', 'error');
            }
            return;
        }

        form.reset();
        idInput.value = '';
        modalTitleEl.textContent = 'Добавить регламент';
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
        saveBtn.setAttribute('form', 'reglamentForm');

        if (categorySelect) {
            while (categorySelect.options.length > 1) {
                categorySelect.remove(1);
            }
            try {
                populateReglamentCategoryDropdowns();
                console.log('Список категорий регламента обновлен в showAddReglamentModal.');

                if (currentCategoryId) {
                    const optionExists = categorySelect.querySelector(
                        `option[value="${currentCategoryId}"]`,
                    );
                    if (optionExists) {
                        categorySelect.value = currentCategoryId;
                        console.log(`Установлена категория по умолчанию: ${currentCategoryId}`);
                    } else {
                        console.warn(
                            `Переданный ID категории ${currentCategoryId} не найден в списке.`,
                        );
                        categorySelect.value = '';
                    }
                } else {
                    categorySelect.value = '';
                }
            } catch (error) {
                console.error('Ошибка при заполнении категорий регламента:', error);
                if (typeof showNotification === 'function') {
                    showNotification('Не удалось загрузить список категорий.', 'error');
                }
            }
        }

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        if (typeof addEscapeHandler === 'function') {
            addEscapeHandler(modal);
        } else {
            console.warn('Функция addEscapeHandler не найдена.');
        }

        if (titleInput) {
            titleInput.focus();
        }
    } catch (error) {
        console.error('Ошибка при показе модального окна добавления регламента:', error);
        if (typeof showNotification === 'function') {
            showNotification(
                `Не удалось открыть окно добавления регламента: ${error.message || error}`,
                'error',
            );
        }
    }
}

/**
 * Открывает модальное окно редактирования регламента
 * @param {number} id - ID регламента для редактирования
 */
export async function editReglament(id) {
    try {
        const reglament = await getFromIndexedDB('reglaments', id);
        if (!reglament) {
            if (typeof showNotification === 'function') {
                showNotification('Регламент не найден', 'error');
            } else {
                console.error('Регламент не найден, и функция showNotification недоступна.');
            }
            return;
        }

        await showAddReglamentModal(reglament.category);

        const modal = document.getElementById('reglamentModal');
        if (!modal) {
            console.error(
                'Модальное окно регламента не найдено после вызова showAddReglamentModal в editReglament.',
            );
            return;
        }

        const form = modal.querySelector('#reglamentForm');
        const titleInput = modal.querySelector('#reglamentTitle');
        const categorySelect = modal.querySelector('#reglamentCategory');
        const contentTextarea = modal.querySelector('#reglamentContent');
        const idInput = modal.querySelector('#reglamentId');
        const saveButton = modal.querySelector('#saveReglamentBtn');
        const modalTitle = modal.querySelector('#reglamentModalTitle');

        if (
            !form ||
            !titleInput ||
            !categorySelect ||
            !contentTextarea ||
            !idInput ||
            !saveButton ||
            !modalTitle
        ) {
            console.error(
                'Не все элементы найдены в модальном окне для редактирования регламента.',
            );
            if (typeof showNotification === 'function') {
                showNotification(
                    'Ошибка интерфейса: не найдены элементы окна редактирования.',
                    'error',
                );
            }
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            return;
        }

        modalTitle.textContent = 'Редактировать регламент';
        saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        saveButton.disabled = false;

        idInput.value = reglament.id;
        titleInput.value = reglament.title || '';
        contentTextarea.value = reglament.content || '';

        if (categorySelect.querySelector(`option[value="${reglament.category}"]`)) {
            categorySelect.value = reglament.category;
        } else {
            console.warn(
                `Категория ID ${reglament.category} для регламента ${id} не найдена в списке при редактировании.`,
            );
            categorySelect.value = '';
        }
        titleInput.focus();
    } catch (error) {
        console.error('Ошибка при загрузке или отображении регламента для редактирования:', error);
        if (typeof showNotification === 'function') {
            showNotification(
                `Ошибка открытия окна редактирования: ${error.message || error}`,
                'error',
            );
        }
    }
}

// ========== System Initialization ==========

/**
 * Инициализирует систему регламентов
 */
export function initReglamentsSystem() {
    const addReglamentBtnOriginal = document.getElementById('addReglamentBtn');
    const categoryGrid = document.getElementById('reglamentCategoryGrid');
    const reglamentsListDiv = document.getElementById('reglamentsList');
    const backToCategoriesBtn = document.getElementById('backToCategories');
    const globalReglamentActionsBar = document.getElementById('globalReglamentActionsBar');

    if (!categoryGrid || !reglamentsListDiv || !globalReglamentActionsBar) {
        console.error(
            'Критически важные элементы для системы регламентов не найдены. Инициализация прервана.',
        );
        return;
    }

    if (!categoryGrid.dataset.sectionId) {
        categoryGrid.dataset.sectionId = 'reglamentCategoryGrid';
    }
    if (!categoryGrid.dataset.defaultView) {
        categoryGrid.dataset.defaultView = 'cards';
    }
    const reglamentsContainer = document.getElementById('reglamentsContainer');
    if (reglamentsContainer) {
        if (!reglamentsContainer.dataset.sectionId) {
            reglamentsContainer.dataset.sectionId = 'reglamentsContainer';
        }
        if (!reglamentsContainer.dataset.defaultView) {
            reglamentsContainer.dataset.defaultView = 'list';
        }
    }

    if (addReglamentBtnOriginal) {
        addReglamentBtnOriginal.addEventListener('click', () => {
            const currentCategoryId =
                reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden')
                    ? reglamentsListDiv.dataset.currentCategory
                    : null;
            showAddReglamentModal(currentCategoryId);
        });
    } else {
        console.error('Кнопка #addReglamentBtn не найдена!');
    }

    renderReglamentCategories();
    if (typeof applyCurrentView === 'function') {
        applyCurrentView('reglamentCategoryGrid');
    }

    populateReglamentCategoryDropdowns();

    categoryGrid.addEventListener('click', (event) => {
        const categoryElement = event.target.closest('.reglament-category');
        if (!categoryElement) return;
        const categoryId = categoryElement.dataset.category;

        if (event.target.closest('.delete-category-btn')) {
            // Функционал удаления категорий убран
        } else if (event.target.closest('.edit-category-btn')) {
            // Функционал редактирования категорий убран
        } else {
            showReglamentsForCategory(categoryId);
            if (reglamentsListDiv) reglamentsListDiv.dataset.currentCategory = categoryId;
        }
    });

    if (backToCategoriesBtn) {
        backToCategoriesBtn.addEventListener('click', () => {
            if (reglamentsListDiv) {
                reglamentsListDiv.classList.add('hidden');
                delete reglamentsListDiv.dataset.currentCategory;
            }
            if (categoryGrid) categoryGrid.classList.remove('hidden');

            if (typeof applyCurrentView === 'function') {
                applyCurrentView('reglamentCategoryGrid');
            }

            const reglamentsContainer = document.getElementById('reglamentsContainer');
            if (reglamentsContainer) reglamentsContainer.innerHTML = '';
            const currentCategoryTitle = document.getElementById('currentCategoryTitle');
            if (currentCategoryTitle) currentCategoryTitle.textContent = '';
        });
    } else {
        console.error('Кнопка #backToCategories не найдена!');
    }

    const viewTogglesInGlobalBar = globalReglamentActionsBar.querySelectorAll('.view-toggle');
    viewTogglesInGlobalBar.forEach((button) => {
        if (button._clickHandlerReglaments) {
            button.removeEventListener('click', button._clickHandlerReglaments);
        }
        button._clickHandlerReglaments = (event) => {
            handleViewToggleClick(event);
        };
        button.addEventListener('click', button._clickHandlerReglaments);
    });
    console.log('Система регламентов инициализирована.');
}
