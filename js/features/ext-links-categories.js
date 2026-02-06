'use strict';

/**
 * Модуль управления категориями внешних ссылок
 * Вынесено из script.js
 */

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
    let isNewModal = false;

    if (!modal) {
        isNewModal = true;
        modal = document.createElement('div');
        modal.id = 'extLinkCategoriesModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Управление категориями</h2>
                            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-times text-xl"></i>
                            </button>
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
                                <div class="flex gap-2 flex-wrap">
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="gray" class="form-radio text-gray-600 focus:ring-gray-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-gray-500 border border-gray-300"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="red" class="form-radio text-red-600 focus:ring-red-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-red-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="orange" class="form-radio text-orange-600 focus:ring-orange-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-orange-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="yellow" class="form-radio text-yellow-500 focus:ring-yellow-400">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-yellow-400"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="green" class="form-radio text-green-600 focus:ring-green-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-green-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="teal" class="form-radio text-teal-600 focus:ring-teal-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-teal-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="blue" checked class="form-radio text-blue-600 focus:ring-blue-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-blue-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="indigo" class="form-radio text-indigo-600 focus:ring-indigo-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-indigo-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="purple" class="form-radio text-purple-600 focus:ring-purple-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-purple-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="pink" class="form-radio text-pink-600 focus:ring-pink-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-pink-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="categoryColor" value="rose" class="form-radio text-rose-600 focus:ring-rose-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-rose-500"></span>
                                    </label>
                                </div>
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
                    const defaultColorInput = form.querySelector(
                        'input[name="categoryColor"][value="blue"]',
                    );
                    if (defaultColorInput) defaultColorInput.checked = true;
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
        const defaultColorInput = form.querySelector('input[name="categoryColor"][value="blue"]');
        if (defaultColorInput) defaultColorInput.checked = true;
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
}

/**
 * Загружает и отображает список категорий в указанном контейнере
 */
async function loadExtLinkCategoriesList(categoriesListElement) {
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

            const colorName = category.color || 'gray';
            const colorClass = `bg-${colorName}-500`;

            categoryItem.innerHTML = `
                <div class="flex items-center flex-grow min-w-0 mr-2">
                    <span class="w-4 h-4 rounded-full ${colorClass} mr-2 flex-shrink-0"></span>
                    <span class="truncate text-gray-900 dark:text-gray-100" title="${category.name}">${category.name}</span>
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
                    const colorInputs = form.querySelectorAll('input[name="categoryColor"]');
                    const submitButton = form.querySelector('#extLinkCategorySubmitBtn');

                    if (nameInput) nameInput.value = category.name;
                    if (colorInputs) {
                        colorInputs.forEach((input) => {
                            input.checked = input.value === (category.color || 'blue');
                        });
                    }
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
    const color = colorInput?.value ?? 'blue';

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
                    showNotification('Ошибка обновления поискового индекса для категории.', 'warning');
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
        const defaultColorInput = categoryForm.querySelector(
            'input[name="categoryColor"][value="blue"]',
        );
        if (defaultColorInput) defaultColorInput.checked = true;

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
            showNotification('Ошибка при сохранении категории: ' + (error.message || error), 'error');
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
        let shouldDeleteLinks = false;

        if (linksInCategory && linksInCategory.length > 0) {
            confirmationMessage += `\n\nВ этой категории находит${
                linksInCategory.length === 1 ? 'ся' : 'ся'
            } ${linksInCategory.length} внешн${
                linksInCategory.length === 1 ? 'яя ссылка' : linksInCategory.length < 5 ? 'их ссылки' : 'их ссылок'
            }. Они не будут удалены, но потеряют привязку к категории.`;
            shouldDeleteLinks = false; // Не удаляем ссылки, только убираем категорию
        }

        if (!confirm(confirmationMessage)) {
            console.log('Удаление категории отменено.');
            return;
        }

        console.log(
            `Начало удаления категории ID: ${categoryId}.`,
        );

        const indexUpdatePromises = [];
        if (categoryToDelete && typeof updateSearchIndex === 'function') {
            indexUpdatePromises.push(
                updateSearchIndex('extLinkCategories', categoryId, categoryToDelete, 'delete').catch(
                    (err) => console.error(`Ошибка индексации (удаление категории ${categoryId}):`, err),
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
                    await updateSearchIndex('extLinks', link.id, link, 'update', oldDataForIndex).catch(
                        (err) => console.error(`Ошибка индексации ссылки ${link.id}:`, err),
                    );
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
