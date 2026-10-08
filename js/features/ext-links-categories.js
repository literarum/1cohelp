'use strict';

/**
 * Модуль управления категориями внешних ссылок
 * Вынесено из script.js
 */

import { escapeHtml } from '../utils/html.js';
import { recordStoreEntityHistoryAfterSave } from '../history/store-record-history.js';
import { refreshModalEntityHistoryToolbar } from '../history/modal-entity-history.js';
import {
    folderColorStyle,
    renderFolderColorPicker,
    setFolderColorInPicker,
    DEFAULT_FOLDER_COLOR,
} from '../utils/folder-colors.js';

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let showNotification = null;
let getFromIndexedDB = null;
let getAllFromIndexedDB = null;
let getAllFromIndex = null;
let saveToIndexedDB = null;
let deleteFromIndexedDB = null;
let updateSearchIndex = null;
let removeEscapeHandler = null;
let addEscapeHandler = null;
let getVisibleModals = null;
let renderExtLinks = null;
let getAllExtLinks = null;
let showAppConfirm = null;

export function setExtLinksCategoriesDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.getFromIndexedDB !== undefined) getFromIndexedDB = deps.getFromIndexedDB;
    if (deps.getAllFromIndexedDB !== undefined) getAllFromIndexedDB = deps.getAllFromIndexedDB;
    if (deps.getAllFromIndex !== undefined) getAllFromIndex = deps.getAllFromIndex;
    if (deps.saveToIndexedDB !== undefined) saveToIndexedDB = deps.saveToIndexedDB;
    if (deps.deleteFromIndexedDB !== undefined) deleteFromIndexedDB = deps.deleteFromIndexedDB;
    if (deps.updateSearchIndex !== undefined) updateSearchIndex = deps.updateSearchIndex;
    if (deps.removeEscapeHandler !== undefined) removeEscapeHandler = deps.removeEscapeHandler;
    if (deps.addEscapeHandler !== undefined) addEscapeHandler = deps.addEscapeHandler;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
    if (deps.renderExtLinks !== undefined) renderExtLinks = deps.renderExtLinks;
    if (deps.getAllExtLinks !== undefined) getAllExtLinks = deps.getAllExtLinks;
    if (deps.showAppConfirm !== undefined) showAppConfirm = deps.showAppConfirm;
}

/**
 * Загружает список категорий в указанный select элемент
 */
export async function populateExtLinkCategoryFilter(categoryFilterElement) {
    if (!categoryFilterElement) {
        console.error('populateExtLinkCategoryFilter: Элемент фильтра категорий не передан.');
        return;
    }

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');
        categoryFilterElement.innerHTML = '<option value="">Все категории</option>';

        if (categories && categories.length > 0) {
            const fragment = document.createDocumentFragment();
            categories
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach((cat) => {
                    const option = document.createElement('option');
                    option.value = cat.id;
                    option.textContent = cat.name;
                    fragment.appendChild(option);
                });
            categoryFilterElement.appendChild(fragment);
        }
    } catch (error) {
        console.error('Ошибка при загрузке категорий для фильтра:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка загрузки категорий', 'error');
        }
    }
}

/**
 * Показывает модальное окно управления категориями внешних ссылок
 */
export function showOrganizeExtLinkCategoriesModal() {
    let modal = document.getElementById('extLinkCategoriesModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'extLinkCategoriesModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Управление категориями</h2>
                            <div class="flex items-center gap-1">
                            <button type="button" id="extLinkCategoriesModalUndoBtn" disabled class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Предыдущая сохранённая версия (Ctrl+Shift+U)" aria-label="Откат к предыдущей сохранённой версии"><i class="fas fa-undo" aria-hidden="true"></i></button>
                            <button type="button" id="extLinkCategoriesModalRedoBtn" disabled class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Следующая сохранённая версия (Ctrl+Shift+R)" aria-label="Повтор отменённой версии"><i class="fas fa-redo" aria-hidden="true"></i></button>
                            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                            </div>
                        </div>
                        
                        <div id="extLinkCategoriesList" class="max-h-60 overflow-y-auto mb-4">
                            <div class="text-center py-4 text-gray-500">Загрузка категорий...</div>
                        </div>
                        
                        <form id="extLinkCategoryForm" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <input type="hidden" name="editingCategoryId">
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100" for="categoryName">Название категории</label>
                                <input type="text" id="categoryName" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">Цвет</label>
                                ${renderFolderColorPicker('categoryColor', DEFAULT_FOLDER_COLOR)}
                            </div>
                            <div class="flex justify-end">
                                <button type="submit" id="extLinkCategorySubmitBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                    Добавить категорию
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target.closest('.close-modal')) {
                e.preventDefault();
                e.stopPropagation();
                modal.classList.add('hidden');
                if (typeof removeEscapeHandler === 'function') {
                    removeEscapeHandler(modal);
                }
                if (typeof getVisibleModals === 'function' && getVisibleModals().length === 0) {
                    document.body.classList.remove('modal-open');
                }

                const form = modal.querySelector('#extLinkCategoryForm');
                if (form && form.dataset.editingId) {
                    form.reset();
                    delete form.dataset.editingId;
                    const submitButton = form.querySelector('#extLinkCategorySubmitBtn');
                    if (submitButton) submitButton.textContent = 'Добавить категорию';
                    setFolderColorInPicker(form, 'categoryColor', DEFAULT_FOLDER_COLOR);
                }
            }
        });

        const form = modal.querySelector('#extLinkCategoryForm');
        if (!form.dataset.submitListenerAttached) {
            form.addEventListener('submit', handleSaveExtLinkCategorySubmit);
            form.dataset.submitListenerAttached = 'true';
        }
    }

    const form = modal.querySelector('#extLinkCategoryForm');
    if (form) {
        form.reset();
        delete form.dataset.editingId;
        const submitButton = form.querySelector('#extLinkCategorySubmitBtn');
        if (submitButton) submitButton.textContent = 'Добавить категорию';
        setFolderColorInPicker(form, 'categoryColor', DEFAULT_FOLDER_COLOR);
    }

    const categoriesListElement = modal.querySelector('#extLinkCategoriesList');
    if (categoriesListElement && typeof loadExtLinkCategoriesList === 'function') {
        loadExtLinkCategoriesList(categoriesListElement);
    } else {
        loadExtLinkCategoriesList(categoriesListElement);
    }

    if (modal && typeof addEscapeHandler === 'function') {
        addEscapeHandler(modal);
    } else if (modal) {
        console.warn('[showOrganizeExtLinkCategoriesModal] addEscapeHandler function not found.');
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    refreshModalEntityHistoryToolbar('extLinkCategoriesModal').catch(() => {});
}

/**
 * Загружает и отображает список категорий в указанном контейнере
 */
export async function loadExtLinkCategoriesList(categoriesListElement) {
    if (!categoriesListElement) {
        console.error('loadExtLinkCategoriesList: Контейнер для списка категорий не передан.');
        return;
    }

    categoriesListElement.innerHTML =
        '<div class="text-center py-4 text-gray-500">Загрузка категорий...</div>';

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');

        if (!categories || categories.length === 0) {
            categoriesListElement.innerHTML =
                '<div class="text-center py-4 text-gray-500">Нет созданных категорий</div>';
            return;
        }

        categoriesListElement.innerHTML = '';
        const fragment = document.createDocumentFragment();

        categories.forEach((category) => {
            const categoryItem = document.createElement('div');
            categoryItem.className =
                'category-item flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0';
            categoryItem.dataset.categoryId = category.id;

            const dotStyle = folderColorStyle(category.color);

            categoryItem.innerHTML = `
                <div class="flex items-center flex-grow min-w-0 mr-2">
                    <span class="folder-dot w-4 h-4 rounded-full mr-2 flex-shrink-0" style="${dotStyle}"></span>
                    <span class="truncate text-gray-900 dark:text-gray-100" title="${escapeHtml(category.name)}">${escapeHtml(category.name)}</span>
                </div>
                <div class="flex-shrink-0">
                    <button class="edit-category-btn p-1 text-gray-500 hover:text-primary" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-category-btn p-1 text-gray-500 hover:text-red-500 ml-1" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            const deleteBtn = categoryItem.querySelector('.delete-category-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleDeleteExtLinkCategoryClick(category.id, categoryItem);
                });
            }

            const editBtn = categoryItem.querySelector('.edit-category-btn');
            if (editBtn) {
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const modal = document.getElementById('extLinkCategoriesModal');
                    if (!modal) return;

                    const form = modal.querySelector('#extLinkCategoryForm');
                    if (!form) return;

                    const nameInput = form.querySelector('#categoryName');
                    const submitButton = form.querySelector('#extLinkCategorySubmitBtn');

                    if (nameInput) nameInput.value = category.name;
                    setFolderColorInPicker(form, 'categoryColor', category.color);
                    if (submitButton) submitButton.textContent = 'Сохранить изменения';
                    form.dataset.editingId = category.id;
                });
            }

            fragment.appendChild(categoryItem);
        });

        categoriesListElement.appendChild(fragment);
    } catch (error) {
        console.error('Ошибка при загрузке списка категорий:', error);
        categoriesListElement.innerHTML =
            '<div class="text-center py-4 text-red-500">Ошибка загрузки категорий</div>';
    }
}

/**
 * Обрабатывает сохранение категории внешних ссылок
 */
export async function handleSaveExtLinkCategorySubmit(event) {
    event.preventDefault();
    const categoryForm = event.target;
    const saveButton = categoryForm.querySelector('#extLinkCategorySubmitBtn');
    if (!categoryForm || !saveButton) {
        console.error('Не удалось найти форму или кнопку сохранения категории.');
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const nameInput = categoryForm.elements.categoryName;
    const name = nameInput.value.trim();
    const colorInput = categoryForm.querySelector('input[name="categoryColor"]:checked');
    const color = colorInput?.value ?? DEFAULT_FOLDER_COLOR;

    if (!name) {
        if (typeof showNotification === 'function') {
            showNotification('Пожалуйста, введите название категории', 'error');
        }
        saveButton.disabled = false;
        saveButton.innerHTML = categoryForm.dataset.editingId
            ? 'Сохранить изменения'
            : 'Добавить категорию';
        nameInput.focus();
        return;
    }

    const isEditing = categoryForm.dataset.editingId;
    const categoryData = {
        name,
        color,
    };

    let oldData = null;
    let finalId = null;
    const timestamp = new Date().toISOString();

    try {
        if (isEditing) {
            categoryData.id = parseInt(isEditing);
            finalId = categoryData.id;
            try {
                oldData = await getFromIndexedDB('extLinkCategories', finalId);
                categoryData.dateAdded = oldData?.dateAdded || timestamp;
            } catch (fetchError) {
                console.warn(
                    `Не удалось получить старые данные категории (${finalId}):`,
                    fetchError,
                );
                categoryData.dateAdded = timestamp;
            }
            categoryData.dateUpdated = timestamp;
            console.log('Редактирование категории:', categoryData);
        } else {
            categoryData.dateAdded = timestamp;
            console.log('Добавление новой категории:', categoryData);
        }

        const savedResult = await saveToIndexedDB('extLinkCategories', categoryData);
        if (!isEditing) {
            finalId = savedResult;
            categoryData.id = finalId;
        }

        if (isEditing && oldData) {
            try {
                const newFromDb = await getFromIndexedDB('extLinkCategories', finalId);
                await recordStoreEntityHistoryAfterSave({
                    storeName: 'extLinkCategories',
                    recordId: finalId,
                    oldRecord: oldData,
                    newRecord: newFromDb,
                });
            } catch (histErr) {
                console.warn('[ext-link-categories] entity history:', histErr);
            }
        }

        // Обновляем State.extLinkCategoryInfo
        if (State && State.extLinkCategoryInfo) {
            State.extLinkCategoryInfo[finalId] = {
                name: categoryData.name,
                color: categoryData.color,
            };
        }

        if (typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex(
                    'extLinkCategories',
                    finalId,
                    categoryData,
                    isEditing ? 'update' : 'add',
                    oldData,
                );
                console.log(`Поисковый индекс обновлен для категории ID: ${finalId}`);
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса для категории ${finalId}:`,
                    indexError,
                );
                if (typeof showNotification === 'function') {
                    showNotification(
                        'Ошибка обновления поискового индекса для категории.',
                        'warning',
                    );
                }
            }
        } else {
            console.warn('Функция updateSearchIndex недоступна для категории.');
        }

        const categoriesList = document.getElementById('extLinkCategoriesList');
        if (categoriesList) {
            await loadExtLinkCategoriesList(categoriesList);
        }

        // Обновляем фильтр категорий
        const categoryFilter = document.getElementById('extLinkCategoryFilter');
        if (categoryFilter && typeof populateExtLinkCategoryFilter === 'function') {
            await populateExtLinkCategoryFilter(categoryFilter);
        }

        // Перерисовываем внешние ссылки
        if (typeof getAllExtLinks === 'function' && typeof renderExtLinks === 'function') {
            const allLinks = await getAllExtLinks();
            renderExtLinks(allLinks, State.extLinkCategoryInfo);
        }

        if (typeof showNotification === 'function') {
            showNotification(isEditing ? 'Категория обновлена' : 'Категория добавлена');
        }

        categoryForm.reset();
        delete categoryForm.dataset.editingId;
        const submitButton = categoryForm.querySelector('#extLinkCategorySubmitBtn');
        if (submitButton) submitButton.textContent = 'Добавить категорию';
        setFolderColorInPicker(categoryForm, 'categoryColor', DEFAULT_FOLDER_COLOR);

        const modal = document.getElementById('extLinkCategoriesModal');
        if (modal) {
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            if (typeof getVisibleModals === 'function' && getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        }
    } catch (error) {
        console.error('Ошибка при сохранении категории:', error);
        if (typeof showNotification === 'function') {
            showNotification(
                'Ошибка при сохранении категории: ' + (error.message || error),
                'error',
            );
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = categoryForm.dataset.editingId
            ? 'Сохранить изменения'
            : 'Добавить категорию';
    }
}

/**
 * Обрабатывает удаление категории внешних ссылок
 */
export async function handleDeleteExtLinkCategoryClick(categoryId, categoryItem) {
    try {
        if (typeof getAllFromIndex !== 'function') {
            console.error('Функция getAllFromIndex не определена при попытке удаления категории!');
            if (typeof showNotification === 'function') {
                showNotification('Ошибка: Невозможно проверить содержимое категории.', 'error');
            }
            return;
        }

        const linksInCategory = await getAllFromIndex('extLinks', 'category', categoryId);
        const categoryToDelete = await getFromIndexedDB('extLinkCategories', categoryId);

        let confirmationMessage = `Вы уверены, что хотите удалить категорию "${
            categoryToDelete?.name || 'ID ' + categoryId
        }"?`;

        if (linksInCategory && linksInCategory.length > 0) {
            confirmationMessage += `\n\nВ этой категории находит${
                linksInCategory.length === 1 ? 'ся' : 'ся'
            } ${linksInCategory.length} внешн${
                linksInCategory.length === 1
                    ? 'яя ссылка'
                    : linksInCategory.length < 5
                      ? 'их ссылки'
                      : 'их ссылок'
            }. Они не будут удалены, но потеряют привязку к категории.`;
            // Не удаляем ссылки, только убираем категорию.
        }

        const confirmed = showAppConfirm
            ? await showAppConfirm({
                  title: 'Удаление категории',
                  message: confirmationMessage,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : confirm(confirmationMessage);
        if (!confirmed) {
            console.log('Удаление категории отменено.');
            return;
        }

        console.log(`Начало удаления категории ID: ${categoryId}.`);

        const indexUpdatePromises = [];
        if (categoryToDelete && typeof updateSearchIndex === 'function') {
            indexUpdatePromises.push(
                updateSearchIndex(
                    'extLinkCategories',
                    categoryId,
                    categoryToDelete,
                    'delete',
                ).catch((err) =>
                    console.error(`Ошибка индексации (удаление категории ${categoryId}):`, err),
                ),
            );
        } else {
            console.warn(
                'Не удалось обновить поисковый индекс при удалении категории: категория не найдена или функция updateSearchIndex недоступна.',
            );
        }
        await Promise.allSettled(indexUpdatePromises);
        console.log('Обновление поискового индекса (удаление) завершено.');

        // Удаляем категорию из БД
        await deleteFromIndexedDB('extLinkCategories', categoryId);

        // Удаляем из State.extLinkCategoryInfo
        if (State && State.extLinkCategoryInfo && State.extLinkCategoryInfo[categoryId]) {
            delete State.extLinkCategoryInfo[categoryId];
        }

        // Убираем категорию у всех ссылок в этой категории
        if (linksInCategory && linksInCategory.length > 0) {
            for (const link of linksInCategory) {
                link.category = null;
                link.dateUpdated = new Date().toISOString();
                await saveToIndexedDB('extLinks', link);
                if (typeof updateSearchIndex === 'function') {
                    const oldDataForIndex = { ...link, category: categoryId };
                    await updateSearchIndex(
                        'extLinks',
                        link.id,
                        link,
                        'update',
                        oldDataForIndex,
                    ).catch((err) => console.error(`Ошибка индексации ссылки ${link.id}:`, err));
                }
            }
        }

        if (categoryItem && categoryItem.parentNode) categoryItem.remove();
        else console.warn(`Элемент категории ${categoryId} не найден или уже удален из DOM.`);

        // Обновляем фильтр категорий
        const categoryFilter = document.getElementById('extLinkCategoryFilter');
        if (categoryFilter && typeof populateExtLinkCategoryFilter === 'function') {
            await populateExtLinkCategoryFilter(categoryFilter);
        }

        // Перерисовываем внешние ссылки
        if (typeof getAllExtLinks === 'function' && typeof renderExtLinks === 'function') {
            const allLinks = await getAllExtLinks();
            renderExtLinks(allLinks, State.extLinkCategoryInfo);
        }

        if (typeof showNotification === 'function') {
            showNotification('Категория удалена');
        }

        const categoriesList = document.getElementById('extLinkCategoriesList');
        if (categoriesList && !categoriesList.querySelector('.category-item')) {
            categoriesList.innerHTML =
                '<div class="text-center py-4 text-gray-500">Нет созданных категорий</div>';
        }
    } catch (error) {
        console.error('Ошибка при удалении категории:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при удалении категории: ' + (error.message || error), 'error');
        }
        const categoriesList = document.getElementById('extLinkCategoriesList');
        if (categoriesList) {
            await loadExtLinkCategoriesList(categoriesList);
        }
    }
}
