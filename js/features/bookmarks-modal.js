'use strict';

// ============================================================================
// BOOKMARKS MODAL (вынос из script.js)
// ============================================================================

import { refreshModalEntityHistoryToolbar } from '../history/modal-entity-history.js';
import {
    activateModalFocus,
    attachModalBackdropWheelScroll,
    deactivateModalFocus,
    enhanceModalAccessibility,
} from '../ui/modals-manager.js';
import { SCREENSHOT_EDIT_FIELD } from '../ui/screenshot-attachment-field.js';
import { formatTagsForInput } from '../features/global-tags.js';

let bookmarkModalConfigGlobal = null;
let State = null;
let getCurrentBookmarkFormState = null;
let _deepEqual = null;
let showNotification = null;
let getVisibleModals = null;
let addEscapeHandler = null;
let removeEscapeHandler = null;
let toggleModalFullscreen = null;
let clearTemporaryThumbnailsFromContainer = null;
let attachBookmarkScreenshotHandlers = null;
let attachBookmarkPdfHandlers = null;
let removePdfSectionsFromContainer = null;
let renderPdfAttachmentsSection = null;
let handleBookmarkFormSubmit = null;
let populateBookmarkFolders = null;
let getFromIndexedDB = null;
let renderExistingThumbnail = null;
let showUnsavedConfirmModal = null;
let shouldConfirmBeforeClose = null;

export function setBookmarksModalDependencies(deps) {
    bookmarkModalConfigGlobal = deps.bookmarkModalConfigGlobal;
    State = deps.State;
    getCurrentBookmarkFormState = deps.getCurrentBookmarkFormState;
    _deepEqual = deps.deepEqual;
    showNotification = deps.showNotification;
    getVisibleModals = deps.getVisibleModals;
    addEscapeHandler = deps.addEscapeHandler;
    removeEscapeHandler = deps.removeEscapeHandler;
    toggleModalFullscreen = deps.toggleModalFullscreen;
    clearTemporaryThumbnailsFromContainer = deps.clearTemporaryThumbnailsFromContainer;
    attachBookmarkScreenshotHandlers = deps.attachBookmarkScreenshotHandlers;
    attachBookmarkPdfHandlers = deps.attachBookmarkPdfHandlers;
    if (deps.removePdfSectionsFromContainer !== undefined)
        removePdfSectionsFromContainer = deps.removePdfSectionsFromContainer;
    if (deps.renderPdfAttachmentsSection !== undefined)
        renderPdfAttachmentsSection = deps.renderPdfAttachmentsSection;
    handleBookmarkFormSubmit = deps.handleBookmarkFormSubmit;
    populateBookmarkFolders = deps.populateBookmarkFolders;
    getFromIndexedDB = deps.getFromIndexedDB;
    renderExistingThumbnail = deps.renderExistingThumbnail;
    if (deps.showUnsavedConfirmModal !== undefined)
        showUnsavedConfirmModal = deps.showUnsavedConfirmModal;
    if (deps.shouldConfirmBeforeClose !== undefined)
        shouldConfirmBeforeClose = deps.shouldConfirmBeforeClose;
}

export async function ensureBookmarkModal() {
    const modalId = bookmarkModalConfigGlobal.modalId;
    let modal = document.getElementById(modalId);
    let mustRebuildContent = false;
    const LOG_PREFIX = '[ensureBookmarkModal_V2]';

    if (modal) {
        const formInModal = modal.querySelector('#bookmarkForm');
        if (!formInModal) {
            console.warn(
                `${LOG_PREFIX} Модальное окно #${modalId} найдено, но не содержит #bookmarkForm. Пересоздание содержимого.`,
            );
            mustRebuildContent = true;
        }
    }

    if (!modal || mustRebuildContent) {
        if (modal && mustRebuildContent) {
            const innerModalContainer = modal.querySelector(
                bookmarkModalConfigGlobal.innerContainerSelector,
            );
            if (innerModalContainer) innerModalContainer.innerHTML = '';
            else modal.innerHTML = '';
            console.log(
                `${LOG_PREFIX} Содержимое существующего #${modalId} очищено для пересоздания.`,
            );
        } else if (!modal) {
            console.log(`${LOG_PREFIX} Модальное окно #${modalId} не найдено, создаем новое.`);
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className =
                'fixed inset-0 bg-black bg-opacity-50 hidden z-[90] p-4 flex items-center justify-center';
            document.body.appendChild(modal);
        }

        const normalModalClasses = bookmarkModalConfigGlobal.classToggleConfig.normal.modal || [];
        if (normalModalClasses.length > 0) {
            modal.classList.remove(...normalModalClasses);
            modal.classList.add(...normalModalClasses);
        }

        modal.innerHTML = `
            <div class="modal-inner-container bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div class="p-content border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 flex-grow mr-4 truncate" id="bookmarkModalTitle">
                            Заголовок окна закладки
                        </h2>
                        <div class="flex items-center flex-shrink-0 gap-1">
                            <button type="button" id="bookmarkModalUndoBtn" disabled class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Предыдущая сохранённая версия (Ctrl+Shift+U)" aria-label="Откат к предыдущей сохранённой версии"><i class="fas fa-undo" aria-hidden="true"></i></button>
                            <button type="button" id="bookmarkModalRedoBtn" disabled class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Следующая сохранённая версия (Ctrl+Shift+R)" aria-label="Повтор отменённой версии"><i class="fas fa-redo" aria-hidden="true"></i></button>
                            <button id="${bookmarkModalConfigGlobal.buttonId}" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                                <i class="fas fa-expand"></i>
                            </button>
                            <button type="button" class="close-modal-btn-hook inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle ml-1" title="Закрыть (Esc)">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="modal-content-area p-content overflow-y-auto overscroll-y-contain flex-1 min-h-0">
                    <form id="bookmarkForm" novalidate>
                        <input type="hidden" id="bookmarkId" name="bookmarkId">
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkTitle">Название <span class="text-red-500">*</span></label>
                            <input type="text" id="bookmarkTitle" name="bookmarkTitle" required
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkUrl">URL (опционально)</label>
                            <input type="url" id="bookmarkUrl" name="bookmarkUrl" placeholder="https://example.com"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkDescription">Описание <span class="text-red-500" id="bookmarkDescriptionRequiredIndicator" style="display:none;">*</span></label>
                            <textarea id="bookmarkDescription" name="bookmarkDescription" rows="8"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base modal-description-field min-h-[10rem]"
                                placeholder="Краткое описание закладки или текст заметки"></textarea>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkFolder">Папка (опционально)</label>
                            <select id="bookmarkFolder" name="bookmarkFolder"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                <option value="">Без папки</option>
                            </select>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkTags">Теги (через запятую)</label>
                            <input type="text" id="bookmarkTags" name="bookmarkTags" autocomplete="off"
                                class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"
                                placeholder="например: фнс, срочно" />
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">В глобальном поиске используйте <span class="font-mono">#тег</span> для фильтра по меткам.</p>
                        </div>
                        <div class="mb-4 ${SCREENSHOT_EDIT_FIELD.wrapperCard}">
                             <label class="${SCREENSHOT_EDIT_FIELD.label}">Скриншоты (опционально)</label>
                             <p class="${SCREENSHOT_EDIT_FIELD.hint}">Добавляйте изображения кнопкой или вставкой из буфера (Ctrl/Cmd+V) в эту область.</p>
                             <div id="bookmarkScreenshotThumbnailsContainer" class="${SCREENSHOT_EDIT_FIELD.dropzone}">
                             </div>
                             <div class="${SCREENSHOT_EDIT_FIELD.actions}">
                                 <button type="button" class="${SCREENSHOT_EDIT_FIELD.addBtnBookmark}">
                                     <i class="fas fa-camera mr-1"></i> Загрузить/Добавить
                                 </button>
                             </div>
                             <input type="file" class="bookmark-screenshot-input hidden" accept="image/png, image/jpeg, image/gif, image/webp" multiple>
                         </div>
                        <div id="bookmarkPdfEditHost" class="mb-4 min-h-0" aria-label="PDF-вложения закладки"></div>
                    </form>
                </div>
                <div class="p-content border-t border-gray-200 dark:border-gray-700 mt-auto flex-shrink-0">
                    <div class="flex justify-end gap-2">
                        <button type="button" class="cancel-modal-btn-hook px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition">
                            Отмена
                        </button>
                        <button type="submit" form="bookmarkForm" id="saveBookmarkBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                            <i class="fas fa-save mr-1"></i> Сохранить
                        </button>
                    </div>
                </div>
            </div>
        `;
        console.log(`${LOG_PREFIX} HTML-структура для #${modalId} создана/пересоздана.`);
        enhanceModalAccessibility(modal, {
            labelledBy: 'bookmarkModalTitle',
        });

        const innerContainer = modal.querySelector(
            bookmarkModalConfigGlobal.innerContainerSelector,
        );
        const contentArea = modal.querySelector(bookmarkModalConfigGlobal.contentAreaSelector);

        const normalInnerClasses =
            bookmarkModalConfigGlobal.classToggleConfig.normal.innerContainer || [];
        const normalContentClasses =
            bookmarkModalConfigGlobal.classToggleConfig.normal.contentArea || [];
        if (innerContainer && normalInnerClasses.length > 0)
            innerContainer.classList.add(...normalInnerClasses);
        if (contentArea && normalContentClasses.length > 0)
            contentArea.classList.add(...normalContentClasses);

        const fullscreenBtn = modal.querySelector('#' + bookmarkModalConfigGlobal.buttonId);
        if (fullscreenBtn) {
            if (fullscreenBtn._fullscreenToggleHandler)
                fullscreenBtn.removeEventListener('click', fullscreenBtn._fullscreenToggleHandler);
            fullscreenBtn._fullscreenToggleHandler = () => {
                if (typeof toggleModalFullscreen === 'function') {
                    toggleModalFullscreen(
                        bookmarkModalConfigGlobal.modalId,
                        bookmarkModalConfigGlobal.buttonId,
                        bookmarkModalConfigGlobal.classToggleConfig,
                        bookmarkModalConfigGlobal.innerContainerSelector,
                        bookmarkModalConfigGlobal.contentAreaSelector,
                    );
                } else console.error('Функция toggleModalFullscreen не найдена!');
            };
            fullscreenBtn.addEventListener('click', fullscreenBtn._fullscreenToggleHandler);
            console.log(
                `${LOG_PREFIX} Fullscreen listener attached to ${bookmarkModalConfigGlobal.buttonId}`,
            );
        } else
            console.error(
                `${LOG_PREFIX} Кнопка #${bookmarkModalConfigGlobal.buttonId} не найдена!`,
            );

        const formElement = modal.querySelector('#bookmarkForm');
        if (formElement) {
            if (formElement._submitHandler)
                formElement.removeEventListener('submit', formElement._submitHandler);
            if (typeof handleBookmarkFormSubmit === 'function') {
                formElement._submitHandler = handleBookmarkFormSubmit;
                formElement.addEventListener('submit', formElement._submitHandler);
                console.log(`${LOG_PREFIX} Новый обработчик submit добавлен к #bookmarkForm.`);
            } else
                console.error(`${LOG_PREFIX} Ошибка: Функция handleBookmarkFormSubmit не найдена!`);

            if (typeof attachBookmarkScreenshotHandlers === 'function') {
                attachBookmarkScreenshotHandlers(formElement);
            } else
                console.error(
                    `${LOG_PREFIX} Ошибка: Функция attachBookmarkScreenshotHandlers не найдена!`,
                );
            if (typeof attachBookmarkPdfHandlers === 'function') {
                attachBookmarkPdfHandlers(formElement);
            } else {
                console.error(
                    `${LOG_PREFIX} Ошибка: Функция attachBookmarkPdfHandlers не найдена!`,
                );
            }
        } else
            console.error(
                `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: Не удалось найти форму #bookmarkForm ПОСЛЕ создания модального окна!`,
            );
    }

    const handleCloseActions = async (targetModal) => {
        const form = targetModal.querySelector('#bookmarkForm');
        let doClose = true;
        if (
            typeof shouldConfirmBeforeClose === 'function' &&
            shouldConfirmBeforeClose(targetModal)
        ) {
            const confirmLeave =
                typeof showUnsavedConfirmModal === 'function'
                    ? await showUnsavedConfirmModal()
                    : confirm('Изменения не сохранены. Закрыть без сохранения?');
            if (!confirmLeave) doClose = false;
        }

        if (doClose) {
            targetModal.classList.add('hidden');
            deactivateModalFocus(targetModal);
            if (form) {
                const pdfHostClose = form.querySelector('#bookmarkPdfEditHost');
                if (pdfHostClose && typeof removePdfSectionsFromContainer === 'function') {
                    removePdfSectionsFromContainer(pdfHostClose);
                }
                form.querySelectorAll('.pdf-draft-section').forEach((el) => el.remove());
                form.dataset.pdfDraftWired = '0';
                form.reset();
                const idInput = form.querySelector('#bookmarkId');
                if (idInput) idInput.value = '';
                const modalTitleEl = targetModal.querySelector('#bookmarkModalTitle');
                if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                const saveButton = targetModal.querySelector('#saveBookmarkBtn');
                if (saveButton) saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
                const thumbsContainer = form.querySelector(
                    '#bookmarkScreenshotThumbnailsContainer',
                );
                if (thumbsContainer && typeof clearTemporaryThumbnailsFromContainer === 'function')
                    clearTemporaryThumbnailsFromContainer(thumbsContainer);
                delete form._tempScreenshotBlobs;
                delete form.dataset.screenshotsToDelete;
                State.initialBookmarkFormState = null;
            }
            if (typeof removeEscapeHandler === 'function') removeEscapeHandler(targetModal);

            requestAnimationFrame(() => {
                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('overflow-hidden');
                    document.body.classList.remove('modal-open');
                    console.log('Body overflow и modal-open сняты после закрытия окна закладки.');
                }
            });
        }
    };

    modal.querySelectorAll('.close-modal-btn-hook, .cancel-modal-btn-hook').forEach((btn) => {
        if (btn._specificClickHandler) btn.removeEventListener('click', btn._specificClickHandler);
        btn._specificClickHandler = (e) => {
            e.stopPropagation();
            handleCloseActions(modal);
        };
        btn.addEventListener('click', btn._specificClickHandler);
    });

    if (typeof addEscapeHandler === 'function') addEscapeHandler(modal);
    else console.warn(`${LOG_PREFIX} addEscapeHandler function not found.`);

    const elements = {
        modal,
        form: modal.querySelector('#bookmarkForm'),
        modalTitle: modal.querySelector('#bookmarkModalTitle'),
        submitButton: modal.querySelector('#saveBookmarkBtn'),
        idInput: modal.querySelector('#bookmarkId'),
        titleInput: modal.querySelector('#bookmarkTitle'),
        urlInput: modal.querySelector('#bookmarkUrl'),
        descriptionInput: modal.querySelector('#bookmarkDescription'),
        folderSelect: modal.querySelector('#bookmarkFolder'),
        tagsInput: modal.querySelector('#bookmarkTags'),
        thumbsContainer: modal.querySelector('#bookmarkScreenshotThumbnailsContainer'),
    };

    for (const key in elements) {
        if (key === 'tagsInput') continue;
        if (!elements[key]) {
            console.error(
                `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: Элемент '${key}' не найден ПОСЛЕ ensureBookmarkModal!`,
            );
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') removeEscapeHandler(modal);
            return null;
        }
    }

    if (elements.form && elements.thumbsContainer) {
        delete elements.form._tempScreenshotBlobs;
        delete elements.form.dataset.screenshotsToDelete;
        delete elements.form.dataset.existingScreenshotIds;
        elements.thumbsContainer.innerHTML = '';
        if (typeof attachBookmarkScreenshotHandlers === 'function') {
            attachBookmarkScreenshotHandlers(elements.form);
        }
    }

    attachModalBackdropWheelScroll(modal, bookmarkModalConfigGlobal.contentAreaSelector);

    console.log(`${LOG_PREFIX} Модальное окно для закладок успешно подготовлено/найдено.`);
    return elements;
}

export async function showAddBookmarkModal(bookmarkToEditId = null) {
    const LOG_PREFIX = '[showAddBookmarkModal_V2]';
    console.log(
        `${LOG_PREFIX} Вызов для ID: ${bookmarkToEditId === null ? 'нового' : bookmarkToEditId}`,
    );

    const modalElements = await ensureBookmarkModal();
    if (!modalElements) {
        if (typeof showNotification === 'function') {
            showNotification(
                'Критическая ошибка: Не удалось инициализировать окно закладки',
                'error',
            );
        }
        console.error(
            `${LOG_PREFIX} Не удалось получить элементы модального окна из ensureBookmarkModal.`,
        );
        return;
    }

    const {
        modal,
        form,
        modalTitle,
        submitButton,
        idInput,
        titleInput,
        urlInput,
        descriptionInput,
        folderSelect,
        thumbsContainer,
    } = modalElements;

    form.reset();
    idInput.value = '';
    if (thumbsContainer) thumbsContainer.innerHTML = '';
    delete form._tempScreenshotBlobs;
    delete form.dataset.screenshotsToDelete;
    form.dataset.existingScreenshotIds = '';
    form.dataset.existingRendered = 'false';

    delete modal.dataset.currentBookmarkId;
    if (modal.hasAttribute('data-bookmark-id')) modal.removeAttribute('data-bookmark-id');
    const pdfHostReset = form.querySelector('#bookmarkPdfEditHost');
    if (pdfHostReset && typeof removePdfSectionsFromContainer === 'function') {
        removePdfSectionsFromContainer(pdfHostReset);
    }
    form.querySelectorAll('.pdf-draft-section').forEach((el) => el.remove());
    form.dataset.pdfDraftWired = '0';
    modal.querySelectorAll('.pdf-attachments-section').forEach((n) => n.remove());

    const descRequiredIndicator = form.querySelector('#bookmarkDescriptionRequiredIndicator');
    if (descRequiredIndicator) descRequiredIndicator.style.display = 'none';

    if (typeof populateBookmarkFolders === 'function') {
        await populateBookmarkFolders(folderSelect);
    } else {
        console.warn(`${LOG_PREFIX} Функция populateBookmarkFolders не найдена.`);
    }
    submitButton.disabled = false;

    if (bookmarkToEditId !== null) {
        modalTitle.textContent = 'Редактировать закладку';
        submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        try {
            const bookmark = await getFromIndexedDB('bookmarks', parseInt(bookmarkToEditId, 10));
            if (!bookmark) {
                if (typeof showNotification === 'function')
                    showNotification('Закладка не найдена', 'error');
                modal.classList.add('hidden');
                return;
            }
            idInput.value = bookmark.id;
            titleInput.value = bookmark.title || '';
            urlInput.value = bookmark.url || '';
            descriptionInput.value = bookmark.description || '';
            folderSelect.value = bookmark.folder || '';

            if (!bookmark.url && descRequiredIndicator) {
                descRequiredIndicator.style.display = 'inline';
            }

            const existingIds = bookmark.screenshotIds || [];
            form.dataset.existingScreenshotIds = existingIds.join(',');
            if (existingIds.length > 0 && typeof renderExistingThumbnail === 'function') {
                const renderPromises = existingIds.map((screenshotId) =>
                    renderExistingThumbnail(screenshotId, thumbsContainer, form),
                );
                await Promise.all(renderPromises);
            }
            form.dataset.existingRendered = 'true';
            if (pdfHostReset && typeof renderPdfAttachmentsSection === 'function') {
                renderPdfAttachmentsSection(pdfHostReset, 'bookmark', String(bookmark.id));
            }
            console.log(
                `${LOG_PREFIX} Форма заполнена для редактирования закладки ID: ${bookmark.id}`,
            );
        } catch (error) {
            console.error(`${LOG_PREFIX} Ошибка при загрузке закладки для редактирования:`, error);
            if (typeof showNotification === 'function')
                showNotification('Ошибка загрузки закладки', 'error');
            modal.classList.add('hidden');
            return;
        }
    } else {
        modalTitle.textContent = 'Добавить закладку';
        submitButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
        if (typeof attachBookmarkPdfHandlers === 'function') {
            attachBookmarkPdfHandlers(form);
        }
        console.log(`${LOG_PREFIX} Форма подготовлена для добавления новой закладки.`);
    }

    if (typeof getCurrentBookmarkFormState === 'function') {
        State.initialBookmarkFormState = getCurrentBookmarkFormState(form);
        console.log(
            `${LOG_PREFIX} Начальное состояние формы захвачено:`,
            JSON.parse(JSON.stringify(State.initialBookmarkFormState)),
        );
    } else {
        console.warn(
            `${LOG_PREFIX} Функция getCurrentBookmarkFormState не найдена, отслеживание изменений может не работать.`,
        );
        State.initialBookmarkFormState = null;
    }

    if (urlInput && descriptionInput && descRequiredIndicator) {
        const updateDescRequirement = () => {
            const urlIsEmpty = !urlInput.value.trim();
            descRequiredIndicator.style.display = urlIsEmpty ? 'inline' : 'none';
            descriptionInput.required = urlIsEmpty;
        };
        urlInput.removeEventListener('input', updateDescRequirement);
        urlInput.addEventListener('input', updateDescRequirement);
        updateDescRequirement();
    }

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    activateModalFocus(modal);

    if (titleInput) {
        setTimeout(() => {
            try {
                titleInput.focus();
            } catch (focusError) {
                console.warn(`${LOG_PREFIX} Не удалось установить фокус:`, focusError);
            }
        }, 50);
    }

    refreshModalEntityHistoryToolbar('bookmarkModal').catch(() => {});
}

export async function showEditBookmarkModal(id) {
    const modalElements = await ensureBookmarkModal();
    if (!modalElements || !modalElements.form) {
        showNotification?.(
            'Критическая ошибка: Не удалось инициализировать окно редактирования закладки',
            'error',
        );
        console.error(
            'Не удалось получить элементы модального окна из ensureBookmarkModal в showEditBookmarkModal.',
        );
        return;
    }
    const {
        modal,
        form,
        modalTitle,
        submitButton,
        idInput,
        titleInput,
        urlInput,
        descriptionInput,
        folderSelect,
        tagsInput,
        thumbsContainer,
    } = modalElements;

    if (thumbsContainer) thumbsContainer.innerHTML = '';
    delete form._tempScreenshotBlobs;
    delete form.dataset.screenshotsToDelete;
    form.dataset.existingScreenshotIds = '';
    form.dataset.existingRendered = 'false';

    try {
        const bookmark = await getFromIndexedDB('bookmarks', id);
        if (!bookmark) {
            showNotification?.('Закладка не найдена', 'error');
            modal.classList.add('hidden');
            return;
        }

        form.reset();

        form.querySelectorAll('.pdf-draft-section').forEach((el) => el.remove());
        form.dataset.pdfDraftWired = '0';
        const pdfHostEdit = form.querySelector('#bookmarkPdfEditHost');
        if (pdfHostEdit && typeof removePdfSectionsFromContainer === 'function') {
            removePdfSectionsFromContainer(pdfHostEdit);
        }

        idInput.value = bookmark.id;
        titleInput.value = bookmark.title || '';
        urlInput.value = bookmark.url || '';
        descriptionInput.value = bookmark.description || '';
        if (tagsInput) tagsInput.value = formatTagsForInput(bookmark.tags);

        if (typeof populateBookmarkFolders === 'function') {
            await populateBookmarkFolders(folderSelect);
            folderSelect.value = bookmark.folder || '';
        } else {
            console.warn('populateBookmarkFolders не найдена в showEditBookmarkModal.');
        }

        modalTitle.textContent = 'Редактировать закладку';
        submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        submitButton.disabled = false;

        const existingIds = bookmark.screenshotIds || [];
        form.dataset.existingScreenshotIds = existingIds.join(',');
        if (existingIds.length > 0 && typeof renderExistingThumbnail === 'function') {
            const renderPromises = existingIds.map((screenshotId) =>
                renderExistingThumbnail(screenshotId, thumbsContainer, form),
            );
            await Promise.all(renderPromises);
        }
        form.dataset.existingRendered = 'true';

        if (pdfHostEdit && typeof renderPdfAttachmentsSection === 'function') {
            renderPdfAttachmentsSection(pdfHostEdit, 'bookmark', String(bookmark.id));
        }

        if (typeof getCurrentBookmarkFormState === 'function') {
            form._initialState = getCurrentBookmarkFormState(form);
            console.log(
                'Захвачено начальное состояние для EDIT bookmarkModal:',
                JSON.parse(JSON.stringify(form._initialState)),
            );
        }

        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        activateModalFocus(modal);
        if (typeof addEscapeHandler === 'function') addEscapeHandler(modal);

        if (titleInput) {
            setTimeout(() => {
                try {
                    titleInput.focus();
                } catch (focusError) {
                    console.warn('Не удалось установить фокус (edit bookmark):', focusError);
                }
            }, 50);
        }

        refreshModalEntityHistoryToolbar('bookmarkModal').catch(() => {});
    } catch (error) {
        console.error('Ошибка при загрузке закладки для редактирования:', error);
        showNotification?.('Ошибка загрузки закладки', 'error');
        modal.classList.add('hidden');
    }
}
