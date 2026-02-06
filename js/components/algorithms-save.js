'use strict';

/**
 * Модуль сохранения алгоритмов (создание и редактирование)
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let algorithms = null;
let extractStepsDataFromEditForm = null;
let showNotification = null;
let updateSearchIndex = null;
let renderAlgorithmCards = null;
let renderMainAlgorithm = null;
let clearTemporaryThumbnailsFromContainer = null;
let getVisibleModals = null;
let addPdfRecords = null;
let resetInitialAddState = null;
let resetInitialEditState = null;
let getSectionName = null;

export function setAlgorithmsSaveDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.algorithms !== undefined) algorithms = deps.algorithms;
    if (deps.extractStepsDataFromEditForm !== undefined) extractStepsDataFromEditForm = deps.extractStepsDataFromEditForm;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.updateSearchIndex !== undefined) updateSearchIndex = deps.updateSearchIndex;
    if (deps.renderAlgorithmCards !== undefined) renderAlgorithmCards = deps.renderAlgorithmCards;
    if (deps.renderMainAlgorithm !== undefined) renderMainAlgorithm = deps.renderMainAlgorithm;
    if (deps.clearTemporaryThumbnailsFromContainer !== undefined) clearTemporaryThumbnailsFromContainer = deps.clearTemporaryThumbnailsFromContainer;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
    if (deps.addPdfRecords !== undefined) addPdfRecords = deps.addPdfRecords;
    if (deps.resetInitialAddState !== undefined) resetInitialAddState = deps.resetInitialAddState;
    if (deps.resetInitialEditState !== undefined) resetInitialEditState = deps.resetInitialEditState;
    if (deps.getSectionName !== undefined) getSectionName = deps.getSectionName;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ СОХРАНЕНИЯ
// ============================================================================

/**
 * Сохраняет новый алгоритм
 */
export async function saveNewAlgorithm() {
    const addModal = document.getElementById('addModal');
    const section = addModal?.dataset.section;
    const newAlgorithmTitleInput = document.getElementById('newAlgorithmTitle');
    const newAlgorithmDescInput = document.getElementById('newAlgorithmDesc');
    const newStepsContainer = document.getElementById('newSteps');
    const saveButton = document.getElementById('saveNewAlgorithmBtn');

    if (
        !addModal ||
        !section ||
        !newAlgorithmTitleInput ||
        !newAlgorithmDescInput ||
        !newStepsContainer ||
        !saveButton
    ) {
        console.error('saveNewAlgorithm: Отсутствуют необходимые элементы DOM.');
        showNotification(
            'Ошибка: Не найдены элементы формы для сохранения нового алгоритма.',
            'error',
        );
        return;
    }

    console.log(`[Save New Algorithm] Start. Section: ${section}`);

    const finalTitle = newAlgorithmTitleInput.value.trim();
    const newDescription = newAlgorithmDescInput.value.trim();

    if (!finalTitle) {
        showNotification('Заголовок нового алгоритма не может быть пустым.', 'warning');
        newAlgorithmTitleInput.focus();
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const {
        steps: newStepsBase,
        screenshotOps,
        isValid,
    } = extractStepsDataFromEditForm(newStepsContainer, false);

    if (!isValid || newStepsBase.length === 0) {
        showNotification('Новый алгоритм должен содержать хотя бы один непустой шаг.', 'warning');
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
        return;
    }

    console.log(
        `[Save New Algorithm] Извлечено: ${newStepsBase.length} шагов, ${screenshotOps.length} операций со скриншотами.`,
    );

    let transaction;
    let saveSuccessful = false;
    let newAlgorithmData = null;
    const newAlgorithmId = `${section}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    let finalSteps = JSON.parse(JSON.stringify(newStepsBase));

    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
        const screenshotsStore = transaction.objectStore('screenshots');
        const algorithmsStore = transaction.objectStore('algorithms');
        console.log('[Save New Algorithm TX] Транзакция начата.');

        const addScreenshotPromises = [];
        const newScreenshotIdsMap = {};

        screenshotOps
            .filter((op) => op.action === 'add')
            .forEach((op) => {
                const { stepIndex, blob } = op;
                if (
                    !(blob instanceof Blob) ||
                    typeof stepIndex !== 'number' ||
                    stepIndex < 0 ||
                    !finalSteps[stepIndex]
                ) {
                    console.warn(
                        `[Save New Algorithm TX] Пропуск невалидной операции добавления скриншота:`,
                        op,
                    );
                    return;
                }

                addScreenshotPromises.push(
                    new Promise((resolve, reject) => {
                        const tempName = `${finalTitle || 'Новый алгоритм'}, изобр. ${
                            Date.now() + Math.random()
                        }`;
                        const record = {
                            blob,
                            parentId: newAlgorithmId,
                            parentType: 'algorithm',
                            stepIndex,
                            name: tempName,
                            uploadedAt: new Date().toISOString(),
                        };
                        const request = screenshotsStore.add(record);
                        request.onsuccess = (e) => {
                            const newId = e.target.result;
                            console.log(
                                `[Save New Algorithm TX] Добавлен скриншот, новый ID: ${newId} для шага ${stepIndex}`,
                            );
                            if (!newScreenshotIdsMap[stepIndex])
                                newScreenshotIdsMap[stepIndex] = [];
                            newScreenshotIdsMap[stepIndex].push(newId);
                            resolve();
                        };
                        request.onerror = (e) => {
                            console.error(
                                `[Save New Algorithm TX] Ошибка добавления скриншота для шага ${stepIndex}:`,
                                e.target.error,
                            );
                            reject(e.target.error || new Error('Ошибка добавления скриншота'));
                        };
                    }),
                );
            });

        if (addScreenshotPromises.length > 0) {
            await Promise.all(addScreenshotPromises);
            console.log('[Save New Algorithm TX] Операции добавления скриншотов завершены.');
        }

        finalSteps = finalSteps.map((step, index) => {
            const newlyAddedIds = newScreenshotIdsMap[index] || [];
            if (newlyAddedIds.length > 0) {
                step.screenshotIds = [...newlyAddedIds];
            } else {
                delete step.screenshotIds;
            }
            delete step._tempScreenshotBlobs;
            delete step._screenshotsToDelete;
            delete step.existingScreenshotIds;
            delete step.tempScreenshotsCount;
            delete step.deletedScreenshotIds;
            return step;
        });
        console.log('[Save New Algorithm TX] Финальный массив шагов подготовлен с ID скриншотов.');

        const timestamp = new Date().toISOString();
        newAlgorithmData = {
            id: newAlgorithmId,
            title: finalTitle,
            description: newDescription,
            steps: finalSteps,
            section: section,
            dateAdded: timestamp,
            dateUpdated: timestamp,
        };

        if (!algorithms[section]) {
            algorithms[section] = [];
        }
        algorithms[section].push(newAlgorithmData);
        console.log(
            `[Save New Algorithm TX] Новый алгоритм ${newAlgorithmId} добавлен в память [${section}].`,
        );

        const algorithmContainerToSave = { section: 'all', data: algorithms };
        console.log("[Save New Algorithm TX] Запрос put для всего контейнера 'algorithms'...");
        const putAlgoReq = algorithmsStore.put(algorithmContainerToSave);

        await new Promise((resolve, reject) => {
            putAlgoReq.onerror = (e) =>
                reject(e.target.error || new Error('Ошибка сохранения контейнера algorithms'));
            transaction.oncomplete = () => {
                console.log('[Save New Algorithm TX] Транзакция успешно завершена (oncomplete).');
                saveSuccessful = true;
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    '[Save New Algorithm TX] ОШИБКА ТРАНЗАКЦИИ (onerror):',
                    e.target.error,
                );
                saveSuccessful = false;
                reject(e.target.error || new Error('Ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn(
                    '[Save New Algorithm TX] Транзакция ПРЕРВАНА (onabort):',
                    e.target.error,
                );
                saveSuccessful = false;
                reject(e.target.error || new Error('Транзакция прервана'));
            };
        });
    } catch (error) {
        console.error(
            `[Save New Algorithm] КРИТИЧЕСКАЯ ОШИБКА сохранения для нового алгоритма в секции ${section}:`,
            error,
        );
        if (transaction && transaction.readyState !== 'done' && transaction.abort) {
            try {
                transaction.abort();
                console.log('[Save New Algorithm] Транзакция отменена в catch.');
            } catch (e) {
                console.error('[Save New Algorithm] Ошибка при отмене транзакции в catch:', e);
            }
        }
        saveSuccessful = false;
        if (algorithms[section] && newAlgorithmData) {
            const indexToRemove = algorithms[section].findIndex(
                (a) => a.id === newAlgorithmData.id,
            );
            if (indexToRemove !== -1) {
                algorithms[section].splice(indexToRemove, 1);
                console.warn(
                    `[Save New Algorithm] Новый алгоритм ${newAlgorithmData.id} удален из памяти из-за ошибки сохранения.`,
                );
            }
        }
        showNotification(
            `Произошла критическая ошибка при сохранении нового алгоритма: ${
                error.message || error
            }`,
            'error',
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
        }
    }

    if (saveSuccessful && newAlgorithmData) {
        console.log(`[Save New Algorithm] Алгоритм ${newAlgorithmData.id} успешно сохранен.`);
        if (typeof updateSearchIndex === 'function') {
            updateSearchIndex('algorithms', newAlgorithmData.id, newAlgorithmData, 'add', null)
                .then(() =>
                    console.log(
                        `[Save New Algorithm] Индекс обновлен для нового алгоритма ${newAlgorithmData.id}.`,
                    ),
                )
                .catch((indexError) =>
                    console.error(
                        `[Save New Algorithm] Ошибка обновления индекса для нового алгоритма ${newAlgorithmData.id}:`,
                        indexError,
                    ),
                );
        } else {
            console.warn(
                `[Save New Algorithm] Не удалось обновить индекс для нового алгоритма (функция не найдена).`,
            );
        }

        if (typeof renderAlgorithmCards === 'function') {
            renderAlgorithmCards(section);
        } else {
            console.warn(
                '[Save New Algorithm] Функция renderAlgorithmCards не найдена, UI может не обновиться.',
            );
        }

        try {
            const draftPdfs = Array.from(addModal._tempPdfFiles || []);
            if (draftPdfs.length > 0) {
                await addPdfRecords(draftPdfs, 'algorithm', newAlgorithmData.id);
                console.log(
                    `[Save New Algorithm] Добавлено PDF: ${draftPdfs.length} для algorithm:${newAlgorithmData.id}`,
                );
            }
        } catch (pdfErr) {
            console.error(
                '[Save New Algorithm] Ошибка сохранения PDF-файлов для нового алгоритма:',
                pdfErr,
            );
            if (typeof showNotification === 'function')
                showNotification('PDF не удалось сохранить для нового алгоритма.', 'warning');
        } finally {
            delete addModal._tempPdfFiles;
            addModal.dataset.pdfDraftWired = '0';
            const draftList = addModal.querySelector('.pdf-draft-list');
            if (draftList) draftList.innerHTML = '';
        }

        showNotification('Новый алгоритм успешно добавлен.');
        if (resetInitialAddState) resetInitialAddState();
        addModal.classList.add('hidden');
        requestAnimationFrame(() => {
            if (getVisibleModals && getVisibleModals().length === 0) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('overflow-hidden');
            }
        });
        newAlgorithmTitleInput.value = '';
        newAlgorithmDescInput.value = '';
        newStepsContainer.innerHTML = '';
        const firstStepDiv = newStepsContainer.querySelector('.edit-step');
        if (firstStepDiv) {
            const thumbsContainer = firstStepDiv.querySelector('#screenshotThumbnailsContainer');
            if (thumbsContainer) {
                clearTemporaryThumbnailsFromContainer(thumbsContainer);
            }
            delete firstStepDiv._tempScreenshotBlobs;
            delete firstStepDiv.dataset.screenshotsToDelete;
        }
    } else if (!newAlgorithmData && saveSuccessful) {
        console.error(
            '[Save New Algorithm] Сохранение успешно, но newAlgorithmData отсутствует. Это неожиданно.',
        );
    } else {
        console.error(
            `[Save New Algorithm] Сохранение нового алгоритма в секции ${section} НЕ УДАЛОСЬ.`,
        );
    }
}

/**
 * Сохраняет изменения в существующем алгоритме
 */
export async function saveAlgorithm() {
    const editModal = document.getElementById('editModal');
    const algorithmIdStr = editModal?.dataset.algorithmId;
    const section = editModal?.dataset.section;
    const algorithmTitleInput = document.getElementById('algorithmTitle');
    const algorithmDescriptionInput = document.getElementById('algorithmDescription');
    const editStepsContainer = document.getElementById('editSteps');
    const saveButton = document.getElementById('saveAlgorithmBtn');

    if (
        !editModal ||
        !algorithmIdStr ||
        !section ||
        !algorithmTitleInput ||
        !editStepsContainer ||
        !saveButton
    ) {
        console.error('saveAlgorithm v7 (TX Fix): Missing required elements.');
        showNotification('Ошибка: Не найдены элементы формы.', 'error');
        return;
    }
    const isMainAlgo = section === 'main';
    if (!isMainAlgo && !algorithmDescriptionInput) {
        console.error('saveAlgorithm v7 (TX Fix): Missing description input for non-main.');
        showNotification('Ошибка: Не найдено поле описания.', 'error');
        return;
    }
    console.log(`[Save Algorithm v7 (TX Fix)] Start. ID: ${algorithmIdStr}, Section: ${section}`);

    const finalTitle = algorithmTitleInput.value.trim();
    const newDescription =
        !isMainAlgo && algorithmDescriptionInput
            ? algorithmDescriptionInput.value.trim()
            : undefined;
    if (!finalTitle) {
        showNotification('Заголовок не может быть пустым.', 'warning');
        algorithmTitleInput.focus();
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const {
        steps: newStepsBase,
        screenshotOps,
        isValid,
    } = extractStepsDataFromEditForm(editStepsContainer, isMainAlgo);

    if (!isValid) {
        if (
            isMainAlgo &&
            newStepsBase.length === 0 &&
            editStepsContainer.querySelectorAll('.edit-step').length > 0
        ) {
            showNotification(
                'Главный алгоритм содержит только пустые шаги. Заполните их или удалите.',
                'warning',
            );
        } else if (!isMainAlgo) {
            showNotification('Алгоритм должен содержать хотя бы один непустой шаг.', 'warning');
        } else {
            console.log(
                'Сохранение главного алгоритма без шагов (допустимо, если форма изначально пуста или все удалено корректно).',
            );
        }
        if (
            !isMainAlgo ||
            (isMainAlgo &&
                newStepsBase.length === 0 &&
                editStepsContainer.querySelectorAll('.edit-step').length > 0 &&
                isValid === false)
        ) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
            return;
        }
    }
    console.log(
        `[Save Algorithm v7] Извлечено: ${newStepsBase.length} шагов, ${screenshotOps.length} скриншот-операций.`,
    );

    let transaction;
    let updateSuccessful = false;
    let oldAlgorithmData = null;
    let finalAlgorithmData = null;
    const algorithmIdForRefs = isMainAlgo ? 'main' : algorithmIdStr;
    let finalSteps = JSON.parse(JSON.stringify(newStepsBase));

    try {
        if (isMainAlgo) {
            oldAlgorithmData = algorithms?.main
                ? JSON.parse(JSON.stringify(algorithms.main))
                : null;
        } else if (algorithms?.[section]) {
            oldAlgorithmData =
                algorithms[section].find((a) => String(a?.id) === String(algorithmIdStr)) || null;
            if (oldAlgorithmData) oldAlgorithmData = JSON.parse(JSON.stringify(oldAlgorithmData));
        }
        if (oldAlgorithmData)
            console.log('[Save Algorithm v7] Старые данные для индекса получены.');
        else
            console.warn(
                `[Save Algorithm v7] Не найдены старые данные для ${section}/${algorithmIdStr}.`,
            );
    } catch (e) {
        console.error('[Save Algorithm v7] Ошибка получения старых данных:', e);
    }

    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
        const screenshotsStore = transaction.objectStore('screenshots');
        const algorithmsStore = transaction.objectStore('algorithms');
        console.log('[Save Algorithm v7 TX] Транзакция начата.');

        const screenshotOpPromises = [];

        if (!isMainAlgo) {
            screenshotOps.forEach((op) => {
                screenshotOpPromises.push(
                    new Promise((resolve, reject) => {
                        try {
                            if (
                                op.action === 'delete' &&
                                op.oldScreenshotId !== null &&
                                op.oldScreenshotId !== undefined
                            ) {
                                const request = screenshotsStore.delete(op.oldScreenshotId);
                                request.onsuccess = () => {
                                    console.log(
                                        `[Save Algorithm v7 TX] Deleted screenshot ID: ${op.oldScreenshotId}`,
                                    );
                                    resolve({
                                        success: true,
                                        action: 'delete',
                                        oldId: op.oldScreenshotId,
                                        stepIndex: op.stepIndex,
                                    });
                                };
                                request.onerror = (e) => {
                                    const error =
                                        e.target.error || new Error('Delete screenshot failed');
                                    console.error(
                                        `[Save Algorithm v7 TX] Error deleting screenshot ID ${op.oldScreenshotId}:`,
                                        error,
                                    );
                                    reject({
                                        success: false,
                                        action: 'delete',
                                        oldId: op.oldScreenshotId,
                                        stepIndex: op.stepIndex,
                                        error,
                                    });
                                };
                            } else if (
                                op.action === 'add' &&
                                op.blob instanceof Blob &&
                                typeof op.stepIndex === 'number' &&
                                finalSteps[op.stepIndex]
                            ) {
                                const tempName = `${finalTitle}, изобр. ${
                                    Date.now() + Math.random()
                                }`;
                                const record = {
                                    blob: op.blob,
                                    parentId: algorithmIdForRefs,
                                    parentType: 'algorithm',
                                    stepIndex: op.stepIndex,
                                    name: tempName,
                                    uploadedAt: new Date().toISOString(),
                                };
                                const request = screenshotsStore.add(record);
                                request.onsuccess = (e_add) => {
                                    const newId = e_add.target.result;
                                    console.log(
                                        `[Save Algorithm v7 TX] Added screenshot, new ID: ${newId} for step ${op.stepIndex}`,
                                    );
                                    if (!finalSteps[op.stepIndex].screenshotIds)
                                        finalSteps[op.stepIndex].screenshotIds = [];
                                    finalSteps[op.stepIndex].screenshotIds.push(newId);
                                    resolve({
                                        success: true,
                                        action: 'add',
                                        newId,
                                        stepIndex: op.stepIndex,
                                    });
                                };
                                request.onerror = (e_add_err) => {
                                    const error =
                                        e_add_err.target.error ||
                                        new Error('Add screenshot failed');
                                    console.error(
                                        `[Save Algorithm v7 TX] Error adding screenshot for step ${op.stepIndex}:`,
                                        error,
                                    );
                                    reject({
                                        success: false,
                                        action: 'add',
                                        stepIndex: op.stepIndex,
                                        error,
                                    });
                                };
                            } else {
                                console.warn(
                                    `[Save Algorithm v7 TX] Пропуск невалидной операции со скриншотом:`,
                                    op,
                                );
                                resolve({
                                    success: true,
                                    action: 'skip',
                                    message: 'Invalid operation data',
                                });
                            }
                        } catch (opError) {
                            console.error(
                                `[Save Algorithm v7 TX] Исключение в операции со скриншотом:`,
                                opError,
                            );
                            reject({ success: false, action: op.action, error: opError });
                        }
                    }),
                );
            });

            if (screenshotOpPromises.length > 0) {
                const screenshotResults = await Promise.all(screenshotOpPromises);
                const failedScreenshotOps = screenshotResults.filter((r) => !r.success);
                if (failedScreenshotOps.length > 0) {
                    console.error(
                        `[Save Algorithm v7 TX] Ошибки при операциях со скриншотами (${failedScreenshotOps.length} шт.). Первая ошибка:`,
                        failedScreenshotOps[0].error,
                    );
                    throw new Error(
                        `Не удалось обработать скриншоты: ${
                            failedScreenshotOps[0].error.message || 'Ошибка операции со скриншотом'
                        }`,
                    );
                }
                console.log(
                    '[Save Algorithm v7 TX] Все операции со скриншотами завершены успешно.',
                );
            }
        }

        if (!isMainAlgo) {
            let existingIdsToKeepMap = {};
            if (oldAlgorithmData?.steps) {
                const deletedIdsFromOps = new Set(
                    screenshotOps
                        .filter((op) => op.action === 'delete')
                        .map((op) => op.oldScreenshotId),
                );
                oldAlgorithmData.steps.forEach((step, index) => {
                    if (Array.isArray(step.screenshotIds)) {
                        existingIdsToKeepMap[index] = step.screenshotIds.filter(
                            (id) => !deletedIdsFromOps.has(id),
                        );
                    }
                });
            }

            finalSteps = finalSteps.map((step, index) => {
                const existingKeptIds = existingIdsToKeepMap[index] || [];
                const newlyAddedIds = (step.screenshotIds || []).filter(
                    (id) => typeof id === 'number',
                );

                const finalIds = [...new Set([...existingKeptIds, ...newlyAddedIds])];

                if (finalIds.length > 0) {
                    step.screenshotIds = finalIds;
                } else {
                    delete step.screenshotIds;
                }
                delete step._tempScreenshotBlobs;
                delete step._screenshotsToDelete;
                delete step.existingScreenshotIds;
                delete step.tempScreenshotsCount;
                delete step.deletedScreenshotIds;
                return step;
            });
        }
        console.log('[Save Algorithm v7 TX] Финальный массив шагов подготовлен.');

        let targetAlgorithmObject;
        const timestamp = new Date().toISOString();
        if (isMainAlgo) {
            if (!algorithms.main) algorithms.main = { id: 'main' };
            algorithms.main.title = finalTitle;
            algorithms.main.steps = finalSteps;
            algorithms.main.dateUpdated = timestamp;
            if (!algorithms.main.dateAdded) algorithms.main.dateAdded = timestamp;
            targetAlgorithmObject = algorithms.main;
            const mainTitleElement = document.querySelector('#mainContent h2');
            if (mainTitleElement) mainTitleElement.textContent = finalTitle;
        } else {
            if (!algorithms[section]) algorithms[section] = [];
            const algorithmIndex = algorithms[section].findIndex(
                (a) => String(a?.id) === String(algorithmIdStr),
            );

            const algoDataBase = {
                id: algorithmIdForRefs,
                title: finalTitle,
                description: newDescription,
                steps: finalSteps,
                section: section,
                dateUpdated: timestamp,
            };

            if (algorithmIndex !== -1) {
                algorithms[section][algorithmIndex] = {
                    ...(algorithms[section][algorithmIndex] || {}),
                    ...algoDataBase,
                    dateAdded:
                        algorithms[section][algorithmIndex]?.dateAdded ||
                        oldAlgorithmData?.dateAdded ||
                        timestamp,
                };
                targetAlgorithmObject = algorithms[section][algorithmIndex];
            } else {
                console.warn(
                    `[Save Algorithm v7 TX] Алгоритм ${algorithmIdStr} не найден в памяти ${section} во время редактирования. Создание нового (неожиданно).`,
                );
                targetAlgorithmObject = { ...algoDataBase, dateAdded: timestamp };
                algorithms[section].push(targetAlgorithmObject);
            }
        }
        finalAlgorithmData = JSON.parse(JSON.stringify(targetAlgorithmObject));
        console.log(`[Save Algorithm v7 TX] Объект алгоритма ${algorithmIdStr} обновлен в памяти.`);

        const algorithmContainerToSave = { section: 'all', data: algorithms };
        console.log("[Save Algorithm v7 TX] Запрос put для всего контейнера 'algorithms'...");
        const putAlgoReq = algorithmsStore.put(algorithmContainerToSave);

        await new Promise((resolve, reject) => {
            putAlgoReq.onerror = (e) =>
                reject(e.target.error || new Error('Ошибка сохранения контейнера algorithms'));
            transaction.oncomplete = () => {
                console.log('[Save Algorithm v7 TX] Транзакция успешно завершена (oncomplete).');
                updateSuccessful = true;
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    '[Save Algorithm v7 TX] ОШИБКА ТРАНЗАКЦИИ (onerror):',
                    e.target.error,
                );
                updateSuccessful = false;
                reject(e.target.error || new Error('Ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn(
                    '[Save Algorithm v7 TX] Транзакция ПРЕРВАНА (onabort):',
                    e.target.error,
                );
                updateSuccessful = false;
                reject(e.target.error || new Error('Транзакция прервана'));
            };
        });
    } catch (error) {
        console.error(
            `[Save Algorithm v7 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА сохранения для ${algorithmIdStr}:`,
            error,
        );
        if (
            transaction &&
            transaction.readyState !== 'done' &&
            transaction.abort &&
            !transaction.error
        ) {
            try {
                transaction.abort();
                console.log('[Save Algorithm v7] Транзакция отменена в catch.');
            } catch (e) {
                console.error('[Save Algorithm v7] Ошибка при отмене транзакции в catch:', e);
            }
        }
        updateSuccessful = false;
        if (oldAlgorithmData && typeof algorithms === 'object' && algorithms !== null) {
            console.warn(
                "[Save Algorithm v7] Восстановление состояния 'algorithms' в памяти из-за ошибки...",
            );
            if (isMainAlgo) {
                algorithms.main = oldAlgorithmData;
            } else if (algorithms[section]) {
                const indexToRestore = algorithms[section].findIndex(
                    (a) => String(a?.id) === String(algorithmIdStr),
                );
                if (indexToRestore !== -1) {
                    algorithms[section][indexToRestore] = oldAlgorithmData;
                } else if (oldAlgorithmData.id) {
                    algorithms[section].push(oldAlgorithmData);
                    console.warn(
                        `[Save Algorithm v7] Старый алгоритм ${algorithmIdStr} добавлен обратно в память, т.к. не был найден для восстановления.`,
                    );
                }
            }
            console.log(
                "[Save Algorithm v7] Состояние 'algorithms' в памяти восстановлено (попытка).",
            );
        }
        showNotification(
            `Произошла критическая ошибка при сохранении: ${error.message || error}`,
            'error',
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
        }
    }

    if (updateSuccessful) {
        console.log(`[Save Algorithm v7 (Robust TX)] Алгоритм ${algorithmIdStr} успешно сохранен.`);
        if (typeof updateSearchIndex === 'function' && finalAlgorithmData?.id) {
            const indexId = isMainAlgo ? 'main' : finalAlgorithmData.id;
            updateSearchIndex('algorithms', indexId, finalAlgorithmData, 'update', oldAlgorithmData)
                .then(() => console.log(`[Save Algorithm v7] Индекс обновлен для ${indexId}.`))
                .catch((indexError) =>
                    console.error(
                        `[Save Algorithm v7] Ошибка обновления индекса для ${indexId}:`,
                        indexError,
                    ),
                );
        } else {
            console.warn(
                `[Save Algorithm v7] Не удалось обновить индекс для ${algorithmIdStr} (функция или ID отсутствуют).`,
            );
        }
        try {
            if (isMainAlgo && typeof renderMainAlgorithm === 'function') {
                await renderMainAlgorithm();
            } else if (!isMainAlgo && typeof renderAlgorithmCards === 'function') {
                renderAlgorithmCards(section);
            }
        } catch (renderError) {
            console.error(
                '[Save Algorithm v7] Ошибка обновления UI после сохранения:',
                renderError,
            );
        }
        showNotification('Алгоритм успешно сохранен.');
        if (resetInitialEditState) resetInitialEditState();
        if (editModal) editModal.classList.add('hidden');
        if (getVisibleModals && getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open');
        }
    } else {
        console.error(
            `[Save Algorithm v7 (Robust TX)] Сохранение алгоритма ${algorithmIdStr} НЕ УДАЛОСЬ.`,
        );
    }
}

// ============================================================================
// ФУНКЦИЯ УДАЛЕНИЯ АЛГОРИТМА
// ============================================================================

/**
 * Удаляет алгоритм из указанной секции
 */
export async function deleteAlgorithm(algorithmId, section) {
    if (section === 'main') {
        console.warn("Попытка удалить 'main' алгоритм через функцию deleteAlgorithm.");
        showNotification('Главный алгоритм не может быть удален.', 'warning');
        return Promise.resolve();
    }

    if (!algorithms || !algorithms[section] || !Array.isArray(algorithms[section])) {
        console.error(
            `deleteAlgorithm: Секция ${section} не найдена или не является массивом в 'algorithms'.`,
        );
        showNotification(
            `Ошибка: Не удалось найти раздел "${getSectionName ? getSectionName(section) : section}" для удаления алгоритма.`,
            'error',
        );
        return Promise.reject(new Error(`Неверная секция или данные алгоритмов: ${section}`));
    }

    const indexToDelete = algorithms[section].findIndex(
        (a) => String(a?.id) === String(algorithmId),
    );

    if (indexToDelete === -1) {
        console.error(
            `deleteAlgorithm: Алгоритм с ID ${algorithmId} не найден в секции ${section}.`,
        );
        const algoCard = document.querySelector(
            `#${section}Algorithms .algorithm-card[data-id="${algorithmId}"]`,
        );
        if (algoCard) {
            algoCard.remove();
            console.log(
                `Удалена карточка алгоритма ${algorithmId} из DOM, т.к. он не найден в данных.`,
            );
        }
        showNotification('Ошибка: Алгоритм уже удален или не найден.', 'warning');
        return Promise.resolve();
    }

    const algorithmToDelete = JSON.parse(JSON.stringify(algorithms[section][indexToDelete]));
    if (!algorithmToDelete.id) algorithmToDelete.id = algorithmId;

    console.log(`Начало удаления алгоритма ID: ${algorithmId}, Секция: ${section}`);

    let transaction;
    let deleteSuccessful = false;
    try {
        if (!State.db) throw new Error('База данных недоступна');
        transaction = State.db.transaction(['algorithms', 'screenshots'], 'readwrite');
        const screenshotsStore = transaction.objectStore('screenshots');
        const algorithmsStore = transaction.objectStore('algorithms');

        console.log(
            `[TX Delete] Поиск скриншотов по parentId: ${algorithmId}, parentType: 'algorithm'`,
        );
        const screenshotsToDelete = await new Promise((resolve, reject) => {
            if (!screenshotsStore.indexNames.contains('parentId')) {
                console.error(
                    "[TX Delete] Ошибка: Индекс 'parentId' не найден в хранилище 'screenshots'.",
                );
                return reject(new Error("Индекс 'parentId' отсутствует."));
            }
            const index = screenshotsStore.index('parentId');
            let keyToSearch = algorithmId;

            const request = index.getAll(keyToSearch);

            request.onsuccess = (e) => {
                const allParentScreenshots = e.target.result || [];
                const algorithmScreenshots = allParentScreenshots.filter(
                    (s) => s.parentType === 'algorithm',
                );
                resolve(algorithmScreenshots);
            };
            request.onerror = (e) => {
                console.error(
                    `[TX Delete] Ошибка получения скриншотов по индексу parentId=${keyToSearch}:`,
                    e.target.error,
                );
                reject(new Error(`Ошибка поиска скриншотов: ${e.target.error?.message}`));
            };
        });

        console.log(
            `[TX Delete] Найдено ${screenshotsToDelete.length} скриншотов типа 'algorithm' для удаления (parentId: ${algorithmId}).`,
        );

        if (screenshotsToDelete.length > 0) {
            const deleteScreenshotPromises = screenshotsToDelete.map((screenshot) => {
                return new Promise((resolve) => {
                    if (screenshot && screenshot.id !== undefined) {
                        console.log(
                            `[TX Delete] Запрос на удаление скриншота ID: ${screenshot.id}`,
                        );
                        const delReq = screenshotsStore.delete(screenshot.id);
                        delReq.onsuccess = () => {
                            console.log(`[TX Delete] Успешно удален скриншот ID: ${screenshot.id}`);
                            resolve();
                        };
                        delReq.onerror = (e) => {
                            console.error(
                                `[TX Delete] Ошибка удаления скриншота ID: ${screenshot.id}`,
                                e.target.error,
                            );
                            resolve();
                        };
                    } else {
                        console.warn(
                            '[TX Delete] Пропуск удаления невалидной записи скриншота:',
                            screenshot,
                        );
                        resolve();
                    }
                });
            });
            await Promise.all(deleteScreenshotPromises);
            console.log('[TX Delete] Запросы на удаление скриншотов завершены.');
        } else {
            console.log('[TX Delete] Связанных скриншотов для удаления не найдено.');
        }

        algorithms[section].splice(indexToDelete, 1);
        console.log(`Алгоритм ${algorithmId} удален из массива в памяти [${section}].`);

        const algorithmContainerToSave = { section: 'all', data: algorithms };
        console.log("[TX Delete] Запрос на сохранение обновленного контейнера 'algorithms'.");
        await new Promise((resolve, reject) => {
            const putReq = algorithmsStore.put(algorithmContainerToSave);
            putReq.onsuccess = resolve;
            putReq.onerror = (e) => {
                console.error("[TX Delete] Ошибка сохранения 'algorithms':", e.target.error);
                reject(
                    new Error(
                        `Ошибка сохранения algorithms после удаления ${algorithmId}: ${e.target.error?.message}`,
                    ),
                );
            };
        });
        console.log(
            `Обновленные данные algorithms сохранены в IndexedDB после удаления ${algorithmId}.`,
        );

        deleteSuccessful = true;

        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('Транзакция удаления алгоритма и скриншотов успешно завершена.');
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(
                    'ОШИБКА ТРАНЗАКЦИИ при удалении алгоритма/скриншотов:',
                    e.target.error,
                );
                reject(e.target.error || new Error('Неизвестная ошибка транзакции'));
            };
            transaction.onabort = (e) => {
                console.warn('Транзакция удаления алгоритма/скриншотов ПРЕРВАНА:', e.target.error);
                if (!deleteSuccessful) resolve();
                else reject(e.target.error || new Error('Транзакция прервана'));
            };
        });
    } catch (error) {
        console.error(
            `КРИТИЧЕСКАЯ ОШИБКА при удалении алгоритма ${algorithmId} из секции ${section}:`,
            error,
        );
        if (transaction && transaction.readyState !== 'done' && transaction.abort) {
            try {
                console.log('Попытка явно отменить транзакцию...');
                transaction.abort();
            } catch (e) {
                console.error('Ошибка при явной отмене транзакции:', e);
            }
        }
        deleteSuccessful = false;
        if (
            algorithmToDelete &&
            algorithms?.[section] &&
            !algorithms[section].find((a) => String(a?.id) === String(algorithmId))
        ) {
            algorithms[section].splice(indexToDelete, 0, algorithmToDelete);
            console.warn(`Восстановлен алгоритм ${algorithmId} в памяти из-за ошибки удаления.`);
            if (typeof renderAlgorithmCards === 'function') {
                renderAlgorithmCards(section);
            }
        }
        showNotification(
            `Произошла ошибка при удалении алгоритма: ${error.message || error}`,
            'error',
        );
        return Promise.reject(error);
    }

    if (deleteSuccessful) {
        if (typeof updateSearchIndex === 'function' && algorithmToDelete?.id) {
            console.log(
                `Запуск обновления поискового индекса (delete) для ID: ${algorithmToDelete.id}`,
            );
            updateSearchIndex('algorithms', algorithmToDelete.id, algorithmToDelete, 'delete')
                .then(() =>
                    console.log(
                        `Обновление поискового индекса (удаление) инициировано для ${algorithmToDelete.id}`,
                    ),
                )
                .catch((indexError) =>
                    console.error(
                        `Ошибка фонового обновления индекса при удалении алгоритма ${algorithmToDelete.id}:`,
                        indexError,
                    ),
                );
        } else {
            console.warn(
                'Не удалось обновить индекс для удаленного алгоритма - функция или ID отсутствуют.',
            );
        }

        if (typeof renderAlgorithmCards === 'function') {
            console.log(`Перерисовка карточек алгоритмов для секции ${section}...`);
            renderAlgorithmCards(section);
        } else {
            console.warn('Функция renderAlgorithmCards не найдена, UI может не обновиться.');
        }

        showNotification('Алгоритм успешно удален.');
        return Promise.resolve();
    } else {
        console.error(
            `Удаление алгоритма ${algorithmId} завершилось без успеха, но и без явной ошибки транзакции.`,
        );
        return Promise.reject(new Error('Удаление завершилось с неопределенным статусом'));
    }
}
