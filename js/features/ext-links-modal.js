'use strict';

// ============================================================================
// EXT LINKS MODAL (вынос из script.js)
// ============================================================================

let State = null;
let showNotification = null;
let getFromIndexedDB = null;
let getAllFromIndexedDB = null;
let removeEscapeHandler = null;
let addEscapeHandler = null;
let getVisibleModals = null;
let handleExtLinkFormSubmit = null;

export function setExtLinksModalDependencies(deps) {
    State = deps.State;
    showNotification = deps.showNotification;
    getFromIndexedDB = deps.getFromIndexedDB;
    getAllFromIndexedDB = deps.getAllFromIndexedDB;
    removeEscapeHandler = deps.removeEscapeHandler;
    addEscapeHandler = deps.addEscapeHandler;
    getVisibleModals = deps.getVisibleModals;
    handleExtLinkFormSubmit = deps.handleExtLinkFormSubmit;
}

export function ensureExtLinkModal() {
    const modalId = 'extLinkModal';
    let modal = document.getElementById(modalId);

    if (!modal) {
        console.log(`Модальное окно #${modalId} не найдено, создаем новое.`);
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
        modal.innerHTML = `
                                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                                    <div class="p-6">
                                    <div class="flex justify-between items-center mb-4">
                                    <h2 class="text-xl font-bold" id="extLinkModalTitle">Заголовок окна</h2>
                                    <button class="close-modal bg-transparent p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors" title="Закрыть">
                                    <i class="fas fa-times text-xl"></i>
                                    </button>
                                    </div>
                                    <form id="extLinkForm" novalidate>
                                    <input type="hidden" id="extLinkId">
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkTitle">Название</label>
                                    <input type="text" id="extLinkTitle" name="extLinkTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    </div>
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkUrl">URL</label>
                                    <input type="url" id="extLinkUrl" name="extLinkUrl" required placeholder="https://example.com" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    </div>
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkDescription">Описание (опционально)</label>
                                    <textarea id="extLinkDescription" name="extLinkDescription" rows="3" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
                                    </div>
                                    <div class="mb-4">
                                    <label class="block text-sm font-medium mb-1" for="extLinkCategory">Категория</label>
                                    <select id="extLinkCategory" name="extLinkCategory" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    <option value="">Без категории</option>
                                    </select>
                                    </div>
                                    <div class="flex justify-end mt-6">
                                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition mr-2">Отмена</button>
                                    <button type="submit" id="saveExtLinkBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">Сохранить</button>
                                    </div>
                                    </form>
                                    </div>
                                    </div>`;
        document.body.appendChild(modal);
        const closeModal = () => {
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            if (getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        };
        modal
            .querySelectorAll('.close-modal, .cancel-modal')
            .forEach((btn) => btn.addEventListener('click', closeModal));

        const form = modal.querySelector('#extLinkForm');
        if (form) {
            if (typeof handleExtLinkFormSubmit === 'function') {
                if (!form.dataset.listenerAttached) {
                    form.addEventListener('submit', handleExtLinkFormSubmit);
                    form.dataset.listenerAttached = 'true';
                    console.log(
                        'Обработчик handleExtLinkFormSubmit прикреплен к форме #extLinkForm.',
                    );
                }
            } else {
                console.error(
                    'Ошибка: Глобальная функция handleExtLinkFormSubmit не найдена при создании модального окна!',
                );
            }
        } else {
            console.error('Форма #extLinkForm не найдена внутри созданного модального окна!');
        }
    }

    const elements = {
        modal: modal,
        form: modal.querySelector('#extLinkForm'),
        titleEl: modal.querySelector('#extLinkModalTitle'),
        idInput: modal.querySelector('#extLinkId'),
        titleInput: modal.querySelector('#extLinkTitle'),
        urlInput: modal.querySelector('#extLinkUrl'),
        descriptionInput: modal.querySelector('#extLinkDescription'),
        categoryInput: modal.querySelector('#extLinkCategory'),
        saveButton: modal.querySelector('#saveExtLinkBtn'),
    };

    for (const key in elements) {
        if (!elements[key]) {
            console.warn(
                `[ensureExtLinkModal] Элемент '${key}' не был найден в модальном окне #${modalId}!`,
            );
        }
    }

    if (elements.modal && typeof addEscapeHandler === 'function') {
        addEscapeHandler(elements.modal);
    } else if (elements.modal) {
        console.warn('[ensureExtLinkModal] addEscapeHandler function not found.');
    }

    const categorySelect = elements.categoryInput;
    if (categorySelect && !categorySelect.dataset.populated) {
        while (categorySelect.options.length > 1) {
            categorySelect.remove(1);
        }
        const fragment = document.createDocumentFragment();
        Object.entries(State.extLinkCategoryInfo).forEach(([key, info]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = info.name;
            fragment.appendChild(option);
        });
        categorySelect.appendChild(fragment);
        categorySelect.dataset.populated = 'true';
        console.log('Категории в модальном окне внешних ссылок обновлены.');
    }

    return elements;
}

export function showAddExtLinkModal() {
    const { modal, form, titleEl, idInput } = ensureExtLinkModal();
    if (!form) {
        console.error('Не удалось получить форму из ensureExtLinkModal');
        return;
    }
    form.reset();
    idInput.value = '';
    titleEl.textContent = 'Добавить внешний ресурс';
    modal.classList.remove('hidden');
    form.elements.extLinkTitle?.focus();
}

export async function showEditExtLinkModal(id) {
    const { modal, form, titleEl, idInput, titleInput, urlInput, descriptionInput, categoryInput } =
        ensureExtLinkModal();

    if (!form) {
        console.error('Не удалось получить форму из ensureExtLinkModal для редактирования');
        if (typeof showNotification === 'function') {
            showNotification('Ошибка интерфейса: не удалось открыть окно редактирования.', 'error');
        }
        return;
    }

    form.reset();
    idInput.value = id;

    try {
        const link = await getFromIndexedDB('extLinks', id);
        if (!link) {
            showNotification('Ресурс не найден', 'error');
            modal.classList.add('hidden');
            return;
        }

        titleEl.textContent = 'Редактировать ресурс';
        titleInput.value = link.title || '';
        urlInput.value = link.url || '';
        descriptionInput.value = link.description || '';
        categoryInput.value = link.category || '';

        try {
            const categories = await getAllFromIndexedDB('extLinkCategories');
            categoryInput.innerHTML = '<option value="">Без категории</option>';
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
                categoryInput.appendChild(fragment);
            }
            categoryInput.value = link.category || '';
        } catch (e) {
            console.error('Не удалось загрузить категории для модального окна', e);
        }

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        titleInput.focus();
    } catch (error) {
        console.error('Ошибка при загрузке данных ресурса:', error);
        showNotification('Ошибка загрузки ресурса', 'error');
        modal.classList.add('hidden');
    }
}

export async function showAddEditExtLinkModal(id = null, categoryId = null) {
    const {
        modal,
        form,
        titleEl,
        idInput,
        titleInput,
        urlInput,
        descriptionInput,
        categoryInput,
        saveButton,
    } = ensureExtLinkModal();
    if (!modal) return;

    form.reset();
    idInput.value = id ? id : '';

    try {
        const categories = await getAllFromIndexedDB('extLinkCategories');
        categoryInput.innerHTML = '<option value="">Без категории</option>';
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
            categoryInput.appendChild(fragment);
        }
    } catch (e) {
        console.error('Не удалось загрузить категории для модального окна', e);
    }

    if (id !== null) {
        titleEl.textContent = 'Редактировать ресурс';
        saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        try {
            const link = await getFromIndexedDB('extLinks', id);
            if (link) {
                titleInput.value = link.title || '';
                urlInput.value = link.url || '';
                descriptionInput.value = link.description || '';
                categoryInput.value = link.category || '';
            } else {
                showNotification('Ресурс не найден', 'error');
                modal.classList.add('hidden');
                return;
            }
        } catch (error) {
            showNotification('Ошибка загрузки ресурса', 'error');
            modal.classList.add('hidden');
            return;
        }
    } else {
        titleEl.textContent = 'Добавить внешний ресурс';
        saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
        if (categoryId) {
            categoryInput.value = categoryId;
        }
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    titleInput.focus();
}
