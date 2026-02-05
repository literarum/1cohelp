'use strict';

/**
 * Модуль системы ссылок 1С (CIB Links)
 * Содержит логику работы со ссылками 1С: добавление, редактирование, удаление, отображение
 */

import { State } from '../app/state.js';
import {
    getAllFromIndexedDB,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
} from '../db/indexeddb.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setCibLinksDependencies)
// ============================================================================

let deps = {
    showNotification: null,
    debounce: null,
    filterLinks: null,
    setupClearButton: null,
    copyToClipboard: null,
    handleViewToggleClick: null,
    applyCurrentView: null,
    applyView: null,
    updateSearchIndex: null,
    getVisibleModals: null,
    addEscapeHandler: null,
    removeEscapeHandler: null,
    getRequiredElements: null,
    DEFAULT_CIB_LINKS: [],
};

/**
 * Устанавливает зависимости для модуля CIB Links
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setCibLinksDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[CibLinks] Зависимости установлены');
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Инициализирует систему ссылок 1С
 */
export function initCibLinkSystem() {
    const essentialIds = ['addLinkBtn', 'linksContainer', 'linksContent', 'linkSearchInput'];
    const coreElements = deps.getRequiredElements?.(essentialIds);

    if (!coreElements) {
        console.error(
            '!!! Отсутствуют критически важные элементы CIB в initCibLinkSystem. Инициализация прервана.'
        );
        return;
    }

    const { addLinkBtn, linksContainer, linksContent, linkSearchInput } = coreElements;

    try {
        addLinkBtn.addEventListener('click', () => showAddEditCibLinkModal());
    } catch (e) {
        console.error('Ошибка при добавлении обработчика к addLinkBtn:', e);
    }

    if (deps.debounce && deps.filterLinks) {
        try {
            linkSearchInput.addEventListener('input', deps.debounce(deps.filterLinks, 250));
        } catch (e) {
            console.error('Ошибка при добавлении обработчика к linkSearchInput:', e);
        }

        if (deps.setupClearButton) {
            deps.setupClearButton('linkSearchInput', 'clearLinkSearchInputBtn', deps.filterLinks);
        } else {
            console.warn('Функция setupClearButton недоступна для поля поиска ссылок 1С.');
        }
    } else {
        console.error(
            '!!! Функции debounce или filterLinks не найдены. Поиск ссылок 1С работать не будет.'
        );
    }

    loadCibLinks();

    try {
        linksContent.querySelectorAll('.view-toggle').forEach((button) => {
            if (deps.handleViewToggleClick) {
                button.removeEventListener('click', deps.handleViewToggleClick);
                button.addEventListener('click', deps.handleViewToggleClick);
            } else {
                console.warn('Функция handleViewToggleClick не найдена для кнопок вида ссылок 1С.');
            }
        });
    } catch (e) {
        console.error('Ошибка при добавлении обработчиков к кнопкам вида ссылок 1С:', e);
    }

    try {
        linksContainer.removeEventListener('click', handleLinkActionClick);
        linksContainer.addEventListener('click', handleLinkActionClick);
    } catch (e) {
        console.error('Ошибка при добавлении обработчика к linksContainer:', e);
    }

    initCibLinkModal();

    console.log('Система ссылок 1С инициализирована.');
}

/**
 * Инициализирует модальное окно CIB Links
 */
export function initCibLinkModal() {
    const modal = document.getElementById('cibLinkModal');
    if (!modal) {
        console.warn('CIB Link modal (#cibLinkModal) not found during init.');
        return;
    }

    const form = modal.querySelector('#cibLinkForm');
    if (!form) {
        console.error('CIB Link modal form (#cibLinkForm) not found.');
        return;
    }

    const closeModalHandler = () => {
        modal.classList.add('hidden');
        deps.removeEscapeHandler?.(modal);
        if ((deps.getVisibleModals?.() || []).length === 0) {
            document.body.classList.remove('overflow-hidden');
        }
    };

    modal.querySelectorAll('.close-modal, .cancel-modal').forEach((button) => {
        button.removeEventListener('click', closeModalHandler);
        button.addEventListener('click', closeModalHandler);
    });

    form.removeEventListener('submit', handleCibLinkSubmit);
    form.addEventListener('submit', handleCibLinkSubmit);
}

/**
 * Показывает модальное окно добавления/редактирования ссылки 1С
 * @param {number|null} linkId - ID ссылки для редактирования или null для создания новой
 */
export async function showAddEditCibLinkModal(linkId = null) {
    const modalElements = deps.getRequiredElements?.([
        'cibLinkModal',
        'cibLinkForm',
        'cibLinkModalTitle',
        'cibLinkId',
        'saveCibLinkBtn',
        'cibLinkTitle',
        'cibLinkValue',
        'cibLinkDescription',
    ]);
    if (!modalElements) return;

    const {
        cibLinkModal: modal,
        cibLinkForm: form,
        cibLinkModalTitle: modalTitle,
        cibLinkId: linkIdInput,
        saveCibLinkBtn: saveButton,
        cibLinkTitle: titleInput,
        cibLinkValue: linkValueInput,
        cibLinkDescription: descriptionInput,
    } = modalElements;

    form.reset();
    linkIdInput.value = linkId ? linkId : '';

    try {
        if (linkId) {
            modalTitle.textContent = 'Редактировать ссылку 1С';
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';

            const link = await getFromIndexedDB('links', linkId);
            if (!link) {
                deps.showNotification?.(`Ссылка с ID ${linkId} не найдена`, 'error');
                return;
            }
            titleInput.value = link.title ?? '';
            linkValueInput.value = link.link ?? '';
            descriptionInput.value = link.description ?? '';
        } else {
            modalTitle.textContent = 'Добавить ссылку 1С';
            saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
        }

        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        deps.addEscapeHandler?.(modal);
        titleInput.focus();
    } catch (error) {
        console.error(`Ошибка при ${linkId ? 'загрузке' : 'подготовке'} ссылки 1С:`, error);
        deps.showNotification?.(
            `Не удалось ${linkId ? 'загрузить данные' : 'открыть форму'} ссылки`,
            'error'
        );
    }
}

/**
 * Обработчик клика по элементам ссылок 1С
 */
export function handleLinkActionClick(event) {
    const target = event.target;

    const buttonOrAnchor = target.closest('button[data-action], a[data-action]');
    const linkItem = target.closest('.cib-link-item[data-id]');

    if (!linkItem) return;

    const linkId = parseInt(linkItem.dataset.id, 10);
    if (isNaN(linkId)) {
        console.error('Некорректный ID ссылки 1С:', linkItem.dataset.id);
        return;
    }

    const codeElement = linkItem.querySelector('code');

    if (buttonOrAnchor) {
        event.stopPropagation();
        const action = buttonOrAnchor.dataset.action;

        switch (action) {
            case 'copy':
                if (codeElement && deps.copyToClipboard) {
                    deps.copyToClipboard(codeElement.textContent, 'Ссылка 1С скопирована!');
                }
                break;
            case 'edit':
                showAddEditCibLinkModal(linkId);
                break;
            case 'delete':
                const titleElement = linkItem.querySelector('h3');
                const linkTitle = titleElement
                    ? titleElement.getAttribute('title') || titleElement.textContent
                    : `ID ${linkId}`;
                deleteCibLink(linkId, linkTitle);
                break;
            default:
                console.warn(`Неизвестное действие '${action}' для ссылки 1С.`);
        }
    } else {
        if (codeElement && deps.copyToClipboard) {
            deps.copyToClipboard(codeElement.textContent, 'Ссылка 1С скопирована!');
        }
    }
}

/**
 * Загружает ссылки 1С из базы данных
 */
export async function loadCibLinks() {
    const linksContainer = document.getElementById('linksContainer');
    if (!linksContainer) {
        console.error('Контейнер ссылок (#linksContainer) не найден в loadCibLinks.');
        return;
    }

    linksContainer.innerHTML =
        '<div class="col-span-full text-center py-6 text-gray-500">Загрузка ссылок...</div>';

    try {
        let links = await getAllFromIndexedDB('links');
        let linksToRender = links;

        if (!links || links.length === 0) {
            console.log('База ссылок 1С пуста. Добавляем стартовый набор.');

            const linksToSave = [...(deps.DEFAULT_CIB_LINKS || [])];
            if (linksToSave.length > 0) {
                const savedLinkIds = await Promise.all(
                    linksToSave.map((link) => saveToIndexedDB('links', link))
                );
                const linksWithIds = linksToSave.map((link, index) => ({
                    ...link,
                    id: savedLinkIds[index],
                }));

                console.log('Стартовые ссылки добавлены в IndexedDB.');

                if (deps.updateSearchIndex) {
                    try {
                        await Promise.all(
                            linksWithIds.map((link) =>
                                deps.updateSearchIndex('links', link.id, link, 'add', null).catch((err) =>
                                    console.error(
                                        `Ошибка индексации стартовой ссылки 1С ${link.id}:`,
                                        err
                                    )
                                )
                            )
                        );
                        console.log('Стартовые ссылки 1С проиндексированы.');
                    } catch (indexingError) {
                        console.error('Общая ошибка при индексации стартовых ссылок 1С:', indexingError);
                    }
                }

                linksToRender = linksWithIds;
            }
        }

        renderCibLinks(linksToRender);
    } catch (error) {
        console.error('Ошибка при загрузке ссылок 1С:', error);
        linksContainer.innerHTML =
            '<div class="col-span-full text-center py-6 text-red-500">Не удалось загрузить ссылки.</div>';
        deps.applyCurrentView?.('linksContainer');
    }
}

/**
 * Получает все ссылки 1С из базы данных
 */
export async function getAllCibLinks() {
    try {
        const links = await getAllFromIndexedDB('links');
        return links || [];
    } catch (error) {
        console.error('Ошибка при получении всех ссылок 1С:', error);
        return [];
    }
}

/**
 * Рендерит ссылки 1С в контейнере
 * @param {Array} links - Массив ссылок для отображения
 */
export async function renderCibLinks(links) {
    const linksContainer = document.getElementById('linksContainer');
    if (!linksContainer) {
        console.error('Контейнер ссылок (#linksContainer) не найден в renderCibLinks.');
        return;
    }

    linksContainer.innerHTML = '';

    if (!links || links.length === 0) {
        linksContainer.innerHTML =
            '<div class="col-span-full text-center py-6 text-gray-500">Нет сохраненных ссылок 1С. Нажмите "Добавить ссылку".</div>';
        deps.applyCurrentView?.('linksContainer');
        return;
    }

    const fragment = document.createDocumentFragment();

    links.forEach((link) => {
        if (!link || typeof link.id === 'undefined') {
            console.warn('Пропуск невалидной ссылки 1С при рендеринге:', link);
            return;
        }

        const linkElement = document.createElement('div');

        linkElement.className =
            'cib-link-item view-item group relative border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#374151] rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer';
        linkElement.dataset.id = link.id;

        const buttonsHTML = `
            <div class="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                <button data-action="copy" class="copy-cib-link p-1.5 text-gray-500 hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Копировать ссылку">
                    <i class="fas fa-copy fa-fw"></i>
                </button>
                <button data-action="edit" class="edit-cib-link p-1.5 text-gray-500 hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Редактировать">
                    <i class="fas fa-edit fa-fw"></i>
                </button>
                <button data-action="delete" class="delete-cib-link p-1.5 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Удалить">
                    <i class="fas fa-trash fa-fw"></i>
                </button>
            </div>
        `;

        const contentHTML = `
            <div class="p-4 flex flex-col h-full">
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1 pr-20" title="${
                    link.title || ''
                }">${link.title || 'Без названия'}</h3>
                <div class="mb-2">
                    <code class="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all inline-block w-full">${
                        link.link || ''
                    }</code>
                </div>
                ${
                    link.description
                        ? `<p class="text-gray-500 dark:text-gray-400 text-sm mt-auto flex-grow">${link.description}</p>`
                        : '<div class="flex-grow"></div>'
                }
            </div>
        `;

        linkElement.innerHTML = buttonsHTML + contentHTML;
        fragment.appendChild(linkElement);
    });

    linksContainer.appendChild(fragment);

    deps.applyCurrentView?.('linksContainer');
}

/**
 * Обработчик отправки формы ссылки 1С
 */
export async function handleCibLinkSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) saveButton.disabled = true;

    const id = form.elements.cibLinkId.value;
    const title = form.elements.cibLinkTitle.value.trim();
    const linkValue = form.elements.cibLinkValue.value.trim();
    const description = form.elements.cibLinkDescription.value.trim();

    if (!title || !linkValue) {
        deps.showNotification?.("Пожалуйста, заполните поля 'Название' и 'Ссылка 1С'", 'error');
        if (saveButton) saveButton.disabled = false;
        return;
    }

    const newData = {
        title,
        link: linkValue,
        description,
    };

    const isEditing = !!id;
    try {
        const existing = await getAllFromIndexedDB('links');
        const duplicate = (existing || []).find(
            (l) =>
                l &&
                typeof l.link === 'string' &&
                l.link.trim() === linkValue &&
                (!isEditing || String(l.id) !== String(id))
        );
        if (duplicate) {
            deps.showNotification?.('Данная ссылка уже есть в базе данных', 'error');
            if (saveButton) saveButton.disabled = false;
            form.elements.cibLinkValue.focus();
            return;
        }
    } catch (dupErr) {
        console.warn('Проверка дубликатов ссылок 1С не удалась:', dupErr);
    }
    let oldData = null;
    let finalId = null;

    try {
        const timestamp = new Date().toISOString();
        if (isEditing) {
            newData.id = parseInt(id, 10);
            finalId = newData.id;

            try {
                oldData = await getFromIndexedDB('links', newData.id);
                newData.dateAdded = oldData?.dateAdded || timestamp;
            } catch (fetchError) {
                console.warn(
                    `Не удалось получить старые данные ссылки 1С (${newData.id}) перед обновлением индекса:`,
                    fetchError
                );
                newData.dateAdded = timestamp;
            }
            newData.dateUpdated = timestamp;
        } else {
            newData.dateAdded = timestamp;
        }

        const savedResult = await saveToIndexedDB('links', newData);

        if (!isEditing) {
            finalId = savedResult;
            newData.id = finalId;
        }

        if (deps.updateSearchIndex) {
            try {
                await deps.updateSearchIndex(
                    'links',
                    finalId,
                    newData,
                    isEditing ? 'update' : 'add',
                    oldData
                );
                const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                console.log(
                    `Обновление индекса для ссылки 1С (${finalId}) инициировано ${oldDataStatus}.`
                );
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса для ссылки 1С ${finalId}:`,
                    indexError
                );
                deps.showNotification?.('Ошибка обновления поискового индекса для ссылки.', 'warning');
            }
        }

        deps.showNotification?.(isEditing ? 'Ссылка обновлена' : 'Ссылка добавлена');
        const modal = document.getElementById('cibLinkModal');
        if (modal) {
            modal.classList.add('hidden');
            deps.removeEscapeHandler?.(modal);
        }
        requestAnimationFrame(() => {
            if ((deps.getVisibleModals?.() || []).length === 0) {
                document.body.classList.remove('overflow-hidden');
                document.body.classList.remove('modal-open');
            }
        });
        loadCibLinks();
    } catch (error) {
        console.error('Ошибка при сохранении ссылки 1С:', error);
        deps.showNotification?.('Не удалось сохранить ссылку', 'error');
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}

/**
 * Удаляет ссылку 1С
 * @param {number} linkId - ID ссылки для удаления
 * @param {string} linkTitle - Заголовок ссылки (для подтверждения)
 */
export async function deleteCibLink(linkId, linkTitle) {
    if (confirm(`Вы уверены, что хотите удалить ссылку "${linkTitle || `ID ${linkId}`}"?`)) {
        try {
            const linkToDelete = await getFromIndexedDB('links', linkId);
            if (!linkToDelete) {
                console.warn(`Ссылка 1С с ID ${linkId} не найдена для удаления из индекса.`);
            }

            if (linkToDelete && deps.updateSearchIndex) {
                try {
                    await deps.updateSearchIndex('links', linkId, linkToDelete, 'delete');
                    console.log(`Search index updated (delete) for CIB link ID: ${linkId}`);
                } catch (indexError) {
                    console.error(
                        `Error updating search index for CIB link deletion ${linkId}:`,
                        indexError
                    );
                }
            }

            await deleteFromIndexedDB('links', linkId);
            deps.showNotification?.('Ссылка удалена');
            loadCibLinks();
        } catch (error) {
            console.error('Ошибка при удалении ссылки 1С:', error);
            deps.showNotification?.('Не удалось удалить ссылку', 'error');
        }
    }
}

// Экспорт для совместимости с window
export default {
    setCibLinksDependencies,
    initCibLinkSystem,
    initCibLinkModal,
    showAddEditCibLinkModal,
    handleLinkActionClick,
    loadCibLinks,
    getAllCibLinks,
    renderCibLinks,
    handleCibLinkSubmit,
    deleteCibLink,
};
