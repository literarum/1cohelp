'use strict';

// ============================================================================
// EXT LINKS FORM SUBMIT (вынос из script.js)
// ============================================================================

import { recordStoreEntityHistoryAfterSave } from '../history/store-record-history.js';

let State = null;
let showNotification = null;
let ensureExtLinkModal = null;
let getFromIndexedDB = null;
let saveToIndexedDB = null;
let updateSearchIndex = null;
let getAllExtLinks = null;
let renderExtLinks = null;
let getVisibleModals = null;
let removeEscapeHandler = null;

export function setExtLinksFormDependencies(deps) {
    State = deps.State;
    showNotification = deps.showNotification;
    ensureExtLinkModal = deps.ensureExtLinkModal;
    getFromIndexedDB = deps.getFromIndexedDB;
    saveToIndexedDB = deps.saveToIndexedDB;
    updateSearchIndex = deps.updateSearchIndex;
    getAllExtLinks = deps.getAllExtLinks;
    renderExtLinks = deps.renderExtLinks;
    getVisibleModals = deps.getVisibleModals;
    removeEscapeHandler = deps.removeEscapeHandler;
}

export async function handleExtLinkFormSubmit(e) {
    e.preventDefault();
    const modalElements = ensureExtLinkModal();

    if (
        !modalElements ||
        !modalElements.modal ||
        !modalElements.form ||
        !modalElements.saveButton
    ) {
        console.error(
            'handleExtLinkFormSubmit: Не удалось получить элементы модального окна для внешних ссылок.',
        );
        showNotification('Ошибка интерфейса при сохранении внешнего ресурса.', 'error');
        return;
    }

    const { modal, idInput, titleInput, urlInput, descriptionInput, categoryInput, saveButton } =
        modalElements;

    if (saveButton) saveButton.disabled = true;

    const id = idInput.value;
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    const description = descriptionInput.value.trim() || null;

    const categoryValue = categoryInput.value;
    let category = null;
    if (categoryValue && !isNaN(parseInt(categoryValue, 10))) {
        category = parseInt(categoryValue, 10);
    }

    if (!title || !url) {
        showNotification("Пожалуйста, заполните поля 'Название' и 'URL'", 'error');
        if (saveButton) saveButton.disabled = false;
        return;
    }
    try {
        let testUrl = url;
        if (!testUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && testUrl.includes('.')) {
            if (!testUrl.startsWith('//')) {
                testUrl = 'https://' + testUrl;
            }
        }
        new URL(testUrl);
    } catch {
        showNotification(
            'Пожалуйста, введите корректный URL (например, https://example.com)',
            'error',
        );
        if (saveButton) saveButton.disabled = false;
        return;
    }

    const newData = {
        title,
        url,
        description,
        category,
    };

    const isEditing = !!id;
    let oldData = null;
    let finalId = null;

    try {
        const timestamp = new Date().toISOString();
        if (isEditing) {
            newData.id = parseInt(id, 10);
            finalId = newData.id;

            try {
                oldData = await getFromIndexedDB('extLinks', newData.id);
                newData.dateAdded = oldData?.dateAdded || timestamp;
            } catch (fetchError) {
                console.warn(
                    `Не удалось получить старые данные внешнего ресурса (${newData.id}):`,
                    fetchError,
                );
                newData.dateAdded = timestamp;
            }
            newData.dateUpdated = timestamp;
        } else {
            newData.dateAdded = timestamp;
        }

        const savedResult = await saveToIndexedDB('extLinks', newData);
        if (!isEditing) {
            finalId = savedResult;
            newData.id = finalId;
        }

        if (isEditing && oldData) {
            try {
                const newFromDb = await getFromIndexedDB('extLinks', finalId);
                await recordStoreEntityHistoryAfterSave({
                    storeName: 'extLinks',
                    recordId: finalId,
                    oldRecord: oldData,
                    newRecord: newFromDb,
                });
            } catch (histErr) {
                console.warn('[ext-links-form] entity history:', histErr);
            }
        }

        if (typeof updateSearchIndex === 'function') {
            try {
                await updateSearchIndex(
                    'extLinks',
                    finalId,
                    newData,
                    isEditing ? 'update' : 'add',
                    oldData,
                );
                const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                console.log(
                    `Обновление индекса для внешнего ресурса (${finalId}) инициировано ${oldDataStatus}.`,
                );
            } catch (indexError) {
                console.error(
                    `Ошибка обновления поискового индекса для внешнего ресурса ${finalId}:`,
                    indexError,
                );
                showNotification('Ошибка обновления поискового индекса для ресурса.', 'warning');
            }
        } else {
            console.warn('Функция updateSearchIndex недоступна.');
        }

        const updatedLinks = await getAllExtLinks();
        renderExtLinks(updatedLinks, State.extLinkCategoryInfo);
        showNotification(isEditing ? 'Ресурс обновлен' : 'Ресурс добавлен');

        if (modal) {
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
        }
        requestAnimationFrame(() => {
            if (typeof getVisibleModals === 'function' && getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        });
    } catch (error) {
        console.error('Ошибка при сохранении внешнего ресурса:', error);
        showNotification('Ошибка при сохранении', 'error');
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}
