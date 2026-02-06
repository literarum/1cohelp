'use strict';

// ============================================================================
// BOOKMARKS FORM SUBMIT (вынос из script.js)
// ============================================================================

let State = null;
let ARCHIVE_FOLDER_ID = null;
let showNotification = null;
let addPdfRecords = null;
let updateSearchIndex = null;
let loadBookmarks = null;
let getVisibleModals = null;

export function setBookmarksFormDependencies(deps) {
    State = deps.State;
    ARCHIVE_FOLDER_ID = deps.ARCHIVE_FOLDER_ID;
    showNotification = deps.showNotification;
    addPdfRecords = deps.addPdfRecords;
    updateSearchIndex = deps.updateSearchIndex;
    loadBookmarks = deps.loadBookmarks;
    getVisibleModals = deps.getVisibleModals;
}

export async function handleBookmarkFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const modal = form.closest('#bookmarkModal');
    const saveButton = modal?.querySelector('#saveBookmarkBtn');

    console.log('[handleBookmarkFormSubmit v6 - Archive Logic] Function start.');

    if (!form) {
        console.error('handleBookmarkFormSubmit v6: CRITICAL - event.target is not the form!');
        if (typeof showNotification === 'function')
            showNotification('Критическая ошибка: форма не найдена.', 'error');
        return;
    }
    if (!modal) {
        console.error(
            'handleBookmarkFormSubmit v6: CRITICAL - Could not find parent modal #bookmarkModal.',
        );
        if (typeof showNotification === 'function')
            showNotification('Критическая ошибка интерфейса: не найдено модальное окно.', 'error');
        if (saveButton) saveButton.disabled = false;
        return;
    }
    if (!saveButton) {
        console.error(
            'handleBookmarkFormSubmit v6: CRITICAL - Could not find save button #saveBookmarkBtn within modal.',
        );
        if (typeof showNotification === 'function')
            showNotification(
                'Критическая ошибка интерфейса: не найдена кнопка сохранения.',
                'error',
            );
        const potentialSaveButton = document.getElementById('saveBookmarkBtn');
        if (potentialSaveButton) potentialSaveButton.disabled = false;
        return;
    }

    console.log('[handleBookmarkFormSubmit v6] Modal, form, and save button found. Proceeding...');

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const id = form.elements.bookmarkId.value;
    const title = form.elements.bookmarkTitle.value.trim();
    const url = form.elements.bookmarkUrl.value.trim();
    const description = form.elements.bookmarkDescription.value.trim();

    const folderValue = form.elements.bookmarkFolder.value;
    let folder;
    if (folderValue === ARCHIVE_FOLDER_ID) {
        folder = ARCHIVE_FOLDER_ID;
        console.log("[handleBookmarkFormSubmit v6] Выбрана папка 'Архив'.");
    } else if (folderValue === '') {
        folder = null;
        console.log('[handleBookmarkFormSubmit v6] Папка не выбрана (Без папки).');
    } else {
        const parsedFolderId = parseInt(folderValue, 10);
        if (!isNaN(parsedFolderId)) {
            folder = parsedFolderId;
            console.log(`[handleBookmarkFormSubmit v6] Выбрана обычная папка с ID: ${folder}.`);
        } else {
            folder = null;
            console.warn(
                `[handleBookmarkFormSubmit v6] Некорректный ID папки '${folderValue}'. Установлено 'Без папки'.`,
            );
        }
    }

    if (!title) {
        if (typeof showNotification === 'function')
            showNotification("Заполните поле 'Название'", 'error');
        saveButton.disabled = false;
        saveButton.innerHTML = id
            ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
            : '<i class="fas fa-plus mr-1"></i> Добавить';
        form.elements.bookmarkTitle.focus();
        return;
    }
    if (!url && !description) {
        if (typeof showNotification === 'function')
            showNotification("Заполните 'Описание', т.к. URL не указан", 'error');
        saveButton.disabled = false;
        saveButton.innerHTML = id
            ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
            : '<i class="fas fa-plus mr-1"></i> Добавить';
        form.elements.bookmarkDescription.focus();
        return;
    }
    if (url) {
        try {
            let testUrl = url;
            if (!testUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/i) && testUrl.includes('.')) {
                if (!testUrl.startsWith('//')) {
                    testUrl = 'https://' + testUrl;
                }
            }
            new URL(testUrl);
        } catch (_) {
            if (typeof showNotification === 'function')
                showNotification('Введите корректный URL (например, https://example.com)', 'error');
            saveButton.disabled = false;
            saveButton.innerHTML = id
                ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
                : '<i class="fas fa-plus mr-1"></i> Добавить';
            form.elements.bookmarkUrl.focus();
            return;
        }
    }

    const screenshotOps = [];
    const newScreenshotBlobs = form._tempScreenshotBlobs || [];
    const idsToDeleteStr = form.dataset.screenshotsToDelete || '';

    newScreenshotBlobs.forEach((blob) => {
        if (blob instanceof Blob) screenshotOps.push({ action: 'add', blob });
    });
    idsToDeleteStr
        .split(',')
        .map((idStr) => parseInt(idStr.trim(), 10))
        .filter((idNum) => !isNaN(idNum) && idNum > 0)
        .forEach((idToDelete) =>
            screenshotOps.push({ action: 'delete', oldScreenshotId: idToDelete }),
        );
    console.log(
        `[Save Bookmark v6 TX] Запланировано ${screenshotOps.length} операций со скриншотами.`,
    );

    const isEditing = !!id;
    let finalId = isEditing ? parseInt(id, 10) : null;
    let oldData = null;
    let existingIdsToKeep = [];
    const newDataBase = {
        title,
        url: url || null,
        description: description || null,
        folder: folder,
    };

    let transaction;
    let saveSuccessful = false;

    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['bookmarks', 'screenshots'], 'readwrite');
        const bookmarksStore = transaction.objectStore('bookmarks');
        const screenshotsStore = transaction.objectStore('screenshots');
        console.log('[Save Bookmark v6 TX] Транзакция начата.');

        const timestamp = new Date().toISOString();
        let bookmarkReadyPromise;

        if (isEditing) {
            newDataBase.id = finalId;
            console.log(`[Save Bookmark v6 TX] Редактирование закладки ID: ${finalId}`);
            bookmarkReadyPromise = new Promise(async (resolve, reject) => {
                try {
                    const request = bookmarksStore.get(finalId);
                    request.onsuccess = (e) => {
                        oldData = e.target.result;
                        if (oldData) {
                            newDataBase.dateAdded = oldData.dateAdded || timestamp;
                            const deletedIdsSet = new Set(
                                screenshotOps
                                    .filter((op) => op.action === 'delete')
                                    .map((op) => op.oldScreenshotId),
                            );
                            existingIdsToKeep = (oldData.screenshotIds || []).filter(
                                (existingId) => !deletedIdsSet.has(existingId),
                            );
                        } else {
                            newDataBase.dateAdded = timestamp;
                        }
                        resolve();
                    };
                    request.onerror = (e) =>
                        reject(
                            e.target.error ||
                                new Error(`Не удалось получить старые данные для ID ${finalId}`),
                        );
                } catch (fetchError) {
                    reject(fetchError);
                }
            });
            newDataBase.dateUpdated = timestamp;
        } else {
            newDataBase.dateAdded = timestamp;
            delete newDataBase.id;
            console.log('[Save Bookmark v6 TX] Добавление новой закладки...');
            bookmarkReadyPromise = new Promise((resolve, reject) => {
                const request = bookmarksStore.add(newDataBase);
                request.onsuccess = (e) => {
                    finalId = e.target.result;
                    newDataBase.id = finalId;
                    resolve();
                };
                request.onerror = (e) =>
                    reject(e.target.error || new Error('Ошибка добавления закладки'));
            });
        }

        await bookmarkReadyPromise;

        if (finalId === null || finalId === undefined)
            throw new Error('Не удалось определить ID закладки.');
        console.log(`[Save Bookmark v6 TX] ID закладки определен: ${finalId}`);

        const screenshotOpResults = [];
        const screenshotPromises = [];
        const newScreenshotIds = [];

        if (screenshotOps.length > 0) {
            console.log(
                `[Save Bookmark v6 TX ${finalId}] Обработка ${screenshotOps.length} операций со скриншотами...`,
            );
            screenshotOps.forEach((op) => {
                const { action, blob, oldScreenshotId } = op;
                screenshotPromises.push(
                    new Promise(async (resolve) => {
                        try {
                            if (action === 'delete' && oldScreenshotId) {
                                const request = screenshotsStore.delete(oldScreenshotId);
                                request.onsuccess = () => {
                                    screenshotOpResults.push({
                                        success: true,
                                        action: 'delete',
                                        oldId: oldScreenshotId,
                                    });
                                    resolve();
                                };
                                request.onerror = (e) => {
                                    screenshotOpResults.push({
                                        success: false,
                                        action: 'delete',
                                        oldId: oldScreenshotId,
                                        error: e.target.error || new Error('Delete failed'),
                                    });
                                    resolve();
                                };
                            } else if (action === 'add' && blob instanceof Blob) {
                                const tempName = `${newDataBase.title || 'Закладка'}-${Date.now()}`;
                                const record = {
                                    blob,
                                    parentId: finalId,
                                    parentType: 'bookmark',
                                    name: tempName,
                                    uploadedAt: new Date().toISOString(),
                                };
                                const request = screenshotsStore.add(record);
                                request.onsuccess = (e_add) => {
                                    const newId = e_add.target.result;
                                    screenshotOpResults.push({
                                        success: true,
                                        action: 'add',
                                        newId,
                                    });
                                    newScreenshotIds.push(newId);
                                    resolve();
                                };
                                request.onerror = (e_add_err) => {
                                    screenshotOpResults.push({
                                        success: false,
                                        action: 'add',
                                        error: e_add_err.target.error || new Error('Add failed'),
                                    });
                                    resolve();
                                };
                            } else {
                                screenshotOpResults.push({
                                    success: false,
                                    action: op.action || 'unknown',
                                    error: new Error('Invalid op'),
                                });
                                resolve();
                            }
                        } catch (opError) {
                            screenshotOpResults.push({
                                success: false,
                                action: action,
                                error: opError,
                            });
                            resolve();
                        }
                    }),
                );
            });
            await Promise.all(screenshotPromises);
            console.log(`[Save Bookmark v6 TX ${finalId}] Операции со скриншотами завершены.`);

            const failedOps = screenshotOpResults.filter((r) => !r.success);
            if (failedOps.length > 0)
                throw new Error(
                    `Ошибка операции со скриншотом: ${
                        failedOps[0].error?.message || 'Unknown error'
                    }`,
                );
        }

        newDataBase.screenshotIds = [...new Set([...existingIdsToKeep, ...newScreenshotIds])];
        if (newDataBase.screenshotIds.length === 0) delete newDataBase.screenshotIds;

        console.log(
            `[Save Bookmark v6 TX ${finalId}] Финальный объект закладки для put:`,
            JSON.parse(JSON.stringify(newDataBase)),
        );

        const putBookmarkReq = bookmarksStore.put(newDataBase);

        await new Promise((resolve, reject) => {
            putBookmarkReq.onerror = (e) =>
                reject(e.target.error || new Error(`Ошибка сохранения закладки ${finalId}`));
            transaction.oncomplete = () => {
                saveSuccessful = true;
                resolve();
            };
            transaction.onerror = (e) => reject(e.target.error || new Error('Ошибка транзакции'));
            transaction.onabort = (e) => reject(e.target.error || new Error('Транзакция прервана'));
        });

        try {
            const pdfTemp = Array.isArray(form._tempPdfFiles) ? form._tempPdfFiles : [];
            if (pdfTemp.length > 0) {
                console.log(
                    `[Save Bookmark] Сохранение ${pdfTemp.length} PDF для закладки ${finalId}`,
                );
                await addPdfRecords(pdfTemp, 'bookmark', finalId);
            }
        } catch (pdfErr) {
            console.error('[handleBookmarkFormSubmit] Ошибка сохранения PDF-файлов:', pdfErr);
        }
    } catch (saveError) {
        console.error(
            `[Save Bookmark v6 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА при сохранении закладки ${
                finalId || '(новый)'
            }:`,
            saveError,
        );
        if (transaction && transaction.abort && transaction.readyState !== 'done') {
            try {
                transaction.abort();
                console.log('[Save Bookmark v6] Транзакция отменена в catch.');
            } catch (e) {
                console.error('[Save Bookmark v6] Ошибка отмены транзакции:', e);
            }
        }
        saveSuccessful = false;
        if (typeof showNotification === 'function')
            showNotification(
                'Ошибка при сохранении закладки: ' + (saveError.message || saveError),
                'error',
            );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = id
                ? '<i class="fas fa-save mr-1"></i> Сохранить изменения'
                : '<i class="fas fa-plus mr-1"></i> Добавить';
        }
    }

    if (saveSuccessful) {
        console.log(`[Save Bookmark v6 (Robust TX)] Успешно завершено для ID: ${finalId}`);
        const finalDataForIndex = { ...newDataBase };

        if (typeof updateSearchIndex === 'function') {
            updateSearchIndex(
                'bookmarks',
                finalId,
                finalDataForIndex,
                isEditing ? 'update' : 'add',
                oldData,
            )
                .then(() => console.log(`Индекс обновлен для закладки ${finalId}.`))
                .catch((indexError) =>
                    console.error(`Ошибка обновления индекса для закладки ${finalId}:`, indexError),
                );
        } else {
            console.warn('updateSearchIndex не найдена.');
        }

        try {
            const newPdfFiles = Array.from(form._tempPdfFiles || []);
            if (newPdfFiles.length > 0) {
                await addPdfRecords(newPdfFiles, 'bookmark', finalId);
                console.log(
                    `[Save Bookmark] Добавлено PDF файлов: ${newPdfFiles.length} для bookmark:${finalId}`,
                );
            }
        } catch (pdfErr) {
            console.error('Ошибка сохранения PDF-файлов для закладки:', pdfErr);
            if (typeof showNotification === 'function')
                showNotification('PDF не удалось сохранить для закладки.', 'warning');
        } finally {
            delete form._tempPdfFiles;
        }

        if (typeof showNotification === 'function')
            showNotification(isEditing ? 'Закладка обновлена' : 'Закладка добавлена');
        modal.classList.add('hidden');
        form.reset();
        const bookmarkIdInput = form.querySelector('#bookmarkId');
        if (bookmarkIdInput) bookmarkIdInput.value = '';
        const modalTitleEl = modal.querySelector('#bookmarkModalTitle');
        if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
        delete form._tempScreenshotBlobs;
        delete form.dataset.screenshotsToDelete;
        form.dataset.pdfDraftWired = '0';
        const draftPdfList = form.querySelector('.pdf-draft-list');
        if (draftPdfList) draftPdfList.innerHTML = '';
        const thumbsContainer = form.querySelector('#bookmarkScreenshotThumbnailsContainer');
        if (thumbsContainer) thumbsContainer.innerHTML = '';
        delete form._tempPdfFiles;
        const pdfListEl = form.querySelector('#bookmarkPdfList');
        if (pdfListEl) pdfListEl.innerHTML = '<li class="text-gray-500">Нет файлов</li>';
        State.initialBookmarkFormState = null;

        if (typeof loadBookmarks === 'function') loadBookmarks();

        if (typeof getVisibleModals === 'function') {
            const visibleModals = getVisibleModals().filter(
                (m) => m.id !== modal.id && !m.classList.contains('hidden'),
            );
            if (visibleModals.length === 0) {
                document.body.classList.remove('overflow-hidden');
                document.body.classList.remove('modal-open');
            }
        } else {
            document.body.classList.remove('overflow-hidden');
            document.body.classList.remove('modal-open');
        }
    } else {
        console.error(
            `[Save Bookmark v6 (Robust TX)] Сохранение закладки ${
                finalId || '(новый)'
            } НЕ удалось.`,
        );
    }
}
