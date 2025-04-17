        // Initialize IndexedDB
        let db;
        const DB_NAME = '1C_Support_Guide';
        const DB_VERSION = 3;
        let userPreferences = { theme: 'auto' };

        let categoryDisplayInfo = {
            'difficult-client': { title: 'Работа с трудным клиентом', icon: 'fa-user-shield', color: 'red' },
            'tech-support': { title: 'Общий регламент', icon: 'fa-headset', color: 'blue' },
            'emergency': { title: 'Чрезвычайные ситуации', icon: 'fa-exclamation-triangle', color: 'orange' }
        };

        const CATEGORY_INFO_KEY = 'reglamentCategoryInfo';

        const storeConfigs = [
            {
                name: 'algorithms',
                options: { keyPath: 'section' }
            },
            {
                name: 'links',
                options: { keyPath: 'id', autoIncrement: true },
                indexes: [{ name: 'category', keyPath: 'category', options: { unique: false } }]
            },
            {
                name: 'bookmarks',
                options: { keyPath: 'id', autoIncrement: true },
                indexes: [{ name: 'folder', keyPath: 'folder', options: { unique: false } }]
            },
            {
                name: 'reglaments',
                options: { keyPath: 'id', autoIncrement: true },
                indexes: [{ name: 'category', keyPath: 'category', options: { unique: false } }]
            },
            {
                name: 'clientData',
                options: { keyPath: 'id', autoIncrement: true }
            },
            {
                name: 'preferences',
                options: { keyPath: 'id' }
            },
            {
                name: 'bookmarkFolders',
                options: { keyPath: 'id', autoIncrement: true }
            },
            {
                name: 'extLinks',
                options: { keyPath: 'id', autoIncrement: true },
                indexes: [{ name: 'category', keyPath: 'category', options: { unique: false } }]
            },
            {
                name: 'searchIndex',
                options: { keyPath: 'word' }
            }
        ];


        // Initialize the database
        function initDB() {
            return new Promise((resolve, reject) => {
                console.log(`Opening database ${DB_NAME} version ${DB_VERSION}`);
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = e => {
                    console.error("IndexedDB error:", e.target.error);
                    reject("Failed to open database. Using fallback storage.");
                };
                request.onsuccess = e => {
                    db = e.target.result;
                    console.log("Database opened successfully");
                    db.onerror = ev => console.error("Database error:", ev.target.error);

                    checkAndBuildIndex().then(() => resolve(db)).catch(reject);

                };
                request.onupgradeneeded = e => {
                    const currentDb = e.target.result;
                    const transaction = e.target.transaction;
                    console.log(`Upgrading database from version ${e.oldVersion} to ${e.newVersion}`);

                    storeConfigs.forEach(config => {
                        if (!currentDb.objectStoreNames.contains(config.name)) {
                            console.log(`Creating object store: ${config.name}`);
                            const store = currentDb.createObjectStore(config.name, config.options);
                            config.indexes?.forEach(index => {
                                console.log(`Creating index '${index.name}' on store '${config.name}'`);
                                store.createIndex(index.name, index.keyPath, index.options || {});
                            });
                        } else {
                            if (config.indexes) {
                                const store = transaction.objectStore(config.name);
                                config.indexes.forEach(index => {
                                    if (!store.indexNames.contains(index.name)) {
                                        console.log(`Creating missing index '${index.name}' on existing store '${config.name}'`);
                                        store.createIndex(index.name, index.keyPath, index.options || {});
                                    }
                                });
                            }
                        }
                    });
                };
            });
        }


        async function loadCategoryInfo() {
            if (!db) {
                console.warn("DB not ready, using default categories.");
                return;
            }
            try {
                const savedInfo = await getFromIndexedDB('preferences', CATEGORY_INFO_KEY);
                if (savedInfo && typeof savedInfo.data === 'object') {
                    categoryDisplayInfo = { ...categoryDisplayInfo, ...savedInfo.data };
                }
            } catch (error) {
                console.error("Error loading reglament category info:", error);
            }
        }


        async function saveCategoryInfo() {
            if (!db) {
                console.error("Cannot save category info: DB not ready.");
                showNotification("Ошибка сохранения настроек категорий", "error");
                return false;
            }
            try {
                await saveToIndexedDB('preferences', { id: CATEGORY_INFO_KEY, data: categoryDisplayInfo });
                populateReglamentCategoryDropdowns();
                return true;
            } catch (error) {
                console.error("Error saving reglament category info:", error);
                showNotification("Ошибка сохранения настроек категорий", "error");
                return false;
            }
        }


        function populateReglamentCategoryDropdowns() {
            const selects = document.querySelectorAll('#reglamentCategory, #editReglamentCategory');
            selects.forEach(select => {
                if (!select) return;

                const currentValue = select.value;
                select.innerHTML = '<option value="">Выберите категорию</option>';

                const fragment = document.createDocumentFragment();
                const sortedCategories = Object.entries(categoryDisplayInfo).sort(([, a], [, b]) => a.title.localeCompare(b.title));

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


        function performDBOperation(storeName, mode, operation) {
            return new Promise((resolve, reject) => {
                if (!db) return reject("Database not initialized");
                try {
                    const transaction = db.transaction(storeName, mode);
                    const store = transaction.objectStore(storeName);
                    const request = operation(store);
                    request.onsuccess = e => resolve(e.target.result);
                    request.onerror = e => reject(e.target.error);
                } catch (error) {
                    reject(error);
                }
            });
        }


        function saveToIndexedDB(storeName, data, key = null) {
            return performDBOperation(storeName, "readwrite", store => store.put(data, ...(key !== null ? [key] : [])));
        }


        function getFromIndexedDB(storeName, key) {
            return performDBOperation(storeName, "readonly", store => store.get(key));
        }


        function getAllFromIndexedDB(storeName) {
            return performDBOperation(storeName, "readonly", store => store.getAll());
        }


        function deleteFromIndexedDB(storeName, key) {
            return performDBOperation(storeName, "readwrite", store => store.delete(key));
        }


        function clearIndexedDBStore(storeName) {
            return performDBOperation(storeName, "readwrite", store => store.clear());
        }


        function setTheme(mode) {
            const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark', isDark);
            userPreferences.theme = mode;
        }


        function renderAllAlgorithms() {
            renderMainAlgorithm();
            renderAlgorithmCards('program');
            renderAlgorithmCards('skzi');
            renderAlgorithmCards('webReg');
        }


        async function loadFromIndexedDB() {
            console.log("Запуск loadFromIndexedDB...");
            const defaultAlgorithms = {
                main: {
                    id: "main",
                    title: "Главный алгоритм работы",
                    steps: [
                        { title: "Приветствие", description: "Обозначьте клиенту, куда он дозвонился, представьтесь, поприветствуйте клиента.", example: "Пример: Техническая поддержка сервиса 1С-Отчетность, меня зовут Сиреневый_Турбовыбулькиватель. Здравствуйте!" },
                        { title: "Уточнение ИНН", description: "Запросите ИНН организации для идентификации клиента в системе и дальнейшей работы.", example: "Пример: Назовите, пожалуйста, ИНН организации.", innLink: true },
                        { title: "Идентификация проблемы", description: "Выясните суть проблемы, задавая уточняющие вопросы. Важно выяснить как можно больше деталей для составления полной картины.", example: { type: 'list', intro: "Примеры вопросов:", items: ["Уточните, пожалуйста, полный текст ошибки?", "При каких действиях возникает ошибка?"] } },
                        { title: "Решение проблемы", description: "Четко для себя определите категорию (направление) проблемы и перейдите к соответствующему разделу в помощнике (либо статье на track.astral.ru) с инструкциями по решению." }
                    ]
                },
                program: [],
                skzi: [],
                webReg: []
            };

            algorithms = JSON.parse(JSON.stringify(defaultAlgorithms));
            console.log("Установлены дефолтные значения algorithms перед загрузкой:", JSON.parse(JSON.stringify(algorithms)));

            if (!db) {
                console.warn("База данных не инициализирована. Используются только дефолтные данные.");
                if (typeof renderAllAlgorithms === 'function') {
                    renderAllAlgorithms();
                }
                return false;
            }

            let loadedDataUsed = false;

            try {
                console.log("Попытка загрузить 'algorithms', 'all' из IndexedDB...");
                const savedAlgorithmsContainer = await getFromIndexedDB('algorithms', 'all');
                console.log("Результат загрузки 'algorithms', 'all':", savedAlgorithmsContainer ? JSON.parse(JSON.stringify(savedAlgorithmsContainer)) : savedAlgorithmsContainer);

                if (savedAlgorithmsContainer?.data && typeof savedAlgorithmsContainer.data === 'object') {
                    const loadedAlgoData = savedAlgorithmsContainer.data;
                    console.log("Обнаружены сохраненные данные алгоритмов. Структура:", Object.keys(loadedAlgoData));

                    if (
                        typeof loadedAlgoData.main === 'object' &&
                        loadedAlgoData.main !== null &&
                        Array.isArray(loadedAlgoData.main.steps) &&
                        loadedAlgoData.main.steps.length > 0
                    ) {
                        algorithms.main = loadedAlgoData.main;
                        if (!algorithms.main.id) algorithms.main.id = 'main';
                        console.log(`Данные 'main' из IndexedDB прошли проверку и загружены (${algorithms.main.steps.length} шагов).`);
                        loadedDataUsed = true;
                    } else {
                        let reason = "Причина неясна";
                        if (typeof loadedAlgoData.main !== 'object' || loadedAlgoData.main === null) reason = "'main' не объект или null.";
                        else if (!Array.isArray(loadedAlgoData.main.steps)) reason = "'main.steps' не массив.";
                        else if (loadedAlgoData.main.steps.length === 0) reason = "'main.steps' пустой массив.";
                        console.warn(`Загруженные данные 'main' некорректны или пусты (${reason}). Используются значения по умолчанию для 'main'. Загружено:`, loadedAlgoData.main);
                    }

                    ['program', 'skzi', 'webReg'].forEach(section => {
                        if (loadedAlgoData.hasOwnProperty(section) && Array.isArray(loadedAlgoData[section])) {
                            algorithms[section] = loadedAlgoData[section].map(item => {
                                if (item && typeof item.id === 'undefined' && item.title) {
                                    console.warn(`Алгоритм в секции '${section}' без ID, генерируем временный:`, item.title);
                                    item.id = `${section}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                                }
                                return item;
                            }).filter(item => item && typeof item.id !== 'undefined');

                            console.log(`Данные '${section}' из IndexedDB загружены (${algorithms[section].length} валидных элементов).`);
                            loadedDataUsed = true;
                        } else {
                            console.warn(`Загруженные данные для '${section}' не являются массивом или секция отсутствует. Используется пустой массив по умолчанию. Загружено:`, loadedAlgoData[section]);
                        }
                    });

                } else {
                    console.warn("Нет сохраненных данных алгоритмов ('algorithms', 'all') в IndexedDB или формат контейнера некорректен. Используются значения по умолчанию.");
                }

                if (typeof renderAllAlgorithms === 'function') {
                    console.log("Вызов renderAllAlgorithms после загрузки данных.");
                    renderAllAlgorithms();
                } else {
                    console.error("Функция renderAllAlgorithms НЕ ОПРЕДЕЛЕНА на момент вызова в loadFromIndexedDB!");
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                    if (typeof renderAlgorithmCards === 'function') {
                        renderAlgorithmCards('program');
                        renderAlgorithmCards('skzi');
                        renderAlgorithmCards('webReg');
                    }
                }

                console.log("Загрузка clientData...");
                const clientData = await getFromIndexedDB('clientData', 'current');
                if (clientData && typeof loadClientData === 'function') {
                    console.log("Загружены clientData, вызов loadClientData:", clientData);
                    loadClientData(clientData);
                } else if (!clientData) {
                    console.log("clientData не найдены.");
                } else {
                    console.warn("Функция loadClientData не определена.");
                }

                console.log("Загрузка bookmarks, reglaments, links, extLinks...");
                const results = await Promise.allSettled([
                    typeof loadBookmarks === 'function' ? loadBookmarks() : Promise.resolve(),
                    typeof loadReglaments === 'function' ? loadReglaments() : Promise.resolve(),
                    typeof loadCibLinks === 'function' ? loadCibLinks() : Promise.resolve(),
                    typeof loadExtLinks === 'function' ? loadExtLinks() : Promise.resolve()
                ]);
                const functionNames = ['bookmarks', 'reglaments', 'links', 'extLinks'];
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.error(`Ошибка при загрузке ${functionNames[index]}:`, result.reason);
                    }
                });
                console.log("Загрузка bookmarks, reglaments, links, extLinks завершена (или произошла ошибка).");

                console.log("Загрузка данных из IndexedDB (loadFromIndexedDB) полностью завершена.");
                if (!algorithms.main || !algorithms.main.steps || algorithms.main.steps.length === 0) {
                    console.error("!!! ПРОВЕРКА В КОНЦЕ loadFromIndexedDB: Main algorithm steps ПУСТЫ или отсутствуют!");
                }
                return true;

            } catch (error) {
                console.error("КРИТИЧЕСКАЯ ОШИБКА в loadFromIndexedDB:", error);
                algorithms = algorithms || {};
                algorithms.main = algorithms.main || defaultAlgorithms.main;
                if (!Array.isArray(algorithms.main?.steps) || algorithms.main.steps.length === 0) {
                    console.error("Критическая ошибка привела к ПУСТОМУ/НЕ МАССИВУ в main.steps! Восстанавливаем из дефолта.");
                    algorithms.main.steps = JSON.parse(JSON.stringify(defaultAlgorithms.main.steps));
                }
                algorithms.program = algorithms.program || [];
                algorithms.skzi = algorithms.skzi || [];
                algorithms.webReg = algorithms.webReg || [];

                console.warn("Из-за ошибки в loadFromIndexedDB, принудительно вызываем renderAllAlgorithms с текущими (возможно дефолтными) данными.");
                if (typeof renderAllAlgorithms === 'function') {
                    renderAllAlgorithms();
                } else {
                    console.error("Функция renderAllAlgorithms НЕ ОПРЕДЕЛЕНА на момент вызова в catch блоке loadFromIndexedDB!");
                }
                return false;
            }
        }


        async function saveDataToIndexedDB() {
            try {
                const clientDataToSave = getClientData();
                await Promise.all([
                    saveToIndexedDB('algorithms', { section: 'all', data: algorithms }),
                    saveToIndexedDB('clientData', clientDataToSave)
                ]);
                return true;
            } catch (error) {
                console.error("Error saving to IndexedDB:", error);
                return false;
            }
        }


        const tabsConfig = [
            { id: 'main', name: 'Главный алгоритм' },
            { id: 'program', name: 'Программа 1С' },
            { id: 'links', name: 'Ссылки 1С' },
            { id: 'extLinks', name: 'Внешние ресурсы' },
            { id: 'skzi', name: 'СКЗИ' },
            { id: 'webReg', name: 'Веб-Регистратор' },
            { id: 'reglaments', name: 'Регламенты' },
            { id: 'bookmarks', name: 'Закладки' }
        ];
        const defaultPanelOrder = tabsConfig.map(t => t.id);
        const defaultPanelVisibility = tabsConfig.map(() => true);


        async function loadUISettings() {
            console.log("Loading UI settings for modal...");
            let loadedSettings = {};
            try {
                const settingsFromDB = await getFromIndexedDB('preferences', 'uiSettings');
                if (settingsFromDB && typeof settingsFromDB === 'object') {
                    loadedSettings = {
                        ...DEFAULT_UI_SETTINGS,
                        ...settingsFromDB,
                        id: 'uiSettings'
                    };
                    if (!Array.isArray(loadedSettings.panelOrder) || loadedSettings.panelOrder.length !== tabsConfig.length) {
                        console.warn("Loaded panelOrder is invalid, using default.");
                        loadedSettings.panelOrder = defaultPanelOrder;
                    }
                    if (!Array.isArray(loadedSettings.panelVisibility) || loadedSettings.panelVisibility.length !== loadedSettings.panelOrder.length) {
                        console.warn("Loaded panelVisibility is invalid, using default.");
                        loadedSettings.panelVisibility = defaultPanelVisibility;
                    }

                    console.log("Loaded UI settings from DB:", loadedSettings);
                } else {
                    console.log("No UI settings found in DB or invalid format, using defaults.");
                    loadedSettings = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
                }
            } catch (error) {
                console.error("Error loading UI settings from DB:", error);
                showNotification("Ошибка загрузки настроек интерфейса", "error");
                loadedSettings = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
            }

            originalUISettings = JSON.parse(JSON.stringify(loadedSettings));
            currentPreviewSettings = JSON.parse(JSON.stringify(loadedSettings));
            isUISettingsDirty = false;

            try {
                populateModalControls(currentPreviewSettings);
                await applyPreviewSettings(currentPreviewSettings);
            } catch (error) {
                console.error("Error applying loaded UI settings:", error);
                showNotification("Ошибка применения настроек к интерфейсу", "error");
            }
            console.log("Finished loading UI settings process.");
        }


        async function saveUISettings() {
            console.log("Saving UI settings...");
            const settingsToSave = { ...currentPreviewSettings };

            if (!settingsToSave.id) {
                settingsToSave.id = 'uiSettings';
            }

            console.log("Settings object being saved:", settingsToSave);

            try {
                await saveToIndexedDB('preferences', settingsToSave);
                console.log("UI settings save successful to DB.");

                originalUISettings = JSON.parse(JSON.stringify(settingsToSave));
                isUISettingsDirty = false;

                return true;
            } catch (error) {
                console.error("Error saving UI settings:", error);
                showNotification("Ошибка при сохранении настроек интерфейса", "error");
                return false;
            }
        }


        async function exportAllData() {
            console.log("Начало экспорта всех данных...");
            showNotification("Подготовка данных для экспорта...", "info");

            if (!db) {
                console.error("Export failed: Database not initialized.");
                showNotification("Ошибка экспорта: База данных не доступна", "error");
                return;
            }

            const allStoreNames = Array.from(db.objectStoreNames);
            const storesToRead = allStoreNames.filter(storeName => storeName !== 'searchIndex');
            console.log("Хранилища для экспорта:", storesToRead);

            if (storesToRead.length === 0) {
                console.warn("Нет хранилищ для экспорта (кроме searchIndex).");
                showNotification("Нет данных для экспорта.", "warning");
                return;
            }

            const exportData = {
                schemaVersion: "1.3",
                exportDate: new Date().toISOString(),
                data: {}
            };
            let exportError = null;

            try {
                const transaction = db.transaction(storesToRead, 'readonly');
                const promises = storesToRead.map(storeName => {
                    return new Promise((resolve, reject) => {
                        try {
                            const store = transaction.objectStore(storeName);
                            const request = store.getAll();
                            request.onsuccess = (e) => {
                                console.log(`Прочитано ${e.target.result?.length ?? 0} записей из ${storeName}`);
                                resolve({ storeName, data: e.target.result });
                            };
                            request.onerror = (e) => {
                                const errorMsg = `Ошибка чтения из ${storeName}: ${e.target.error?.message || e.target.error}`;
                                console.error(errorMsg, e.target.error);
                                reject(new Error(errorMsg));
                            };
                        } catch (err) {
                            const errorMsg = `Ошибка доступа к хранилищу ${storeName}: ${err.message || err}`;
                            console.error(errorMsg, err);
                            reject(new Error(errorMsg));
                        }
                    });
                });

                transaction.oncomplete = () => {
                    console.log("Транзакция чтения для экспорта успешно завершена.");
                };
                transaction.onerror = (e) => {
                    console.error("Ошибка транзакции чтения для экспорта:", e.target.error);
                    if (!exportError) exportError = new Error(`Ошибка транзакции: ${e.target.error?.message || e.target.error}`);
                };
                transaction.onabort = (e) => {
                    console.warn("Транзакция чтения для экспорта прервана:", e.target.error);
                    if (!exportError) exportError = new Error(`Транзакция прервана: ${e.target.error?.message || e.target.error}`);
                };

                const results = await Promise.all(promises);

                if (exportError) throw exportError;

                results.forEach(result => {
                    exportData.data[result.storeName] = Array.isArray(result.data) ? result.data : [];
                });

                console.log("Данные для экспорта собраны:", exportData);

                const now = new Date();
                const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
                const exportFileName = `1C_Support_Guide_Export_${timestamp}.json`;

                let dataStr;
                try {
                    dataStr = JSON.stringify(exportData, null, 2);
                } catch (stringifyError) {
                    console.error("Ошибка при сериализации данных в JSON:", stringifyError);
                    showNotification("Критическая ошибка: Не удалось подготовить данные для экспорта.", "error");
                    return;
                }

                const dataBlob = new Blob([dataStr], { type: "application/json;charset=utf-8" });

                if (window.showSaveFilePicker) {
                    try {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: exportFileName,
                            types: [{
                                description: 'JSON Files',
                                accept: { 'application/json': ['.json'] },
                            }],
                        });
                        const writable = await handle.createWritable();
                        await writable.write(dataBlob);
                        await writable.close();
                        showNotification("Данные успешно сохранены в файл");
                        console.log("Экспорт через File System Access API завершен успешно.");
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            console.error('Ошибка сохранения через File System Access API, используем fallback:', err);
                            const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
                            const linkElement = document.createElement('a');
                            linkElement.href = dataUri;
                            linkElement.download = exportFileName;
                            document.body.appendChild(linkElement);
                            linkElement.click();
                            document.body.removeChild(linkElement);
                            showNotification("Данные успешно экспортированы (fallback)");
                            console.log("Экспорт через data URI (fallback) завершен успешно.");
                        } else {
                            console.log("Экспорт отменен пользователем.");
                            showNotification("Экспорт отменен", "info");
                        }
                    }
                } else {
                    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
                    const linkElement = document.createElement('a');
                    linkElement.href = dataUri;
                    linkElement.download = exportFileName;
                    document.body.appendChild(linkElement);
                    linkElement.click();
                    document.body.removeChild(linkElement);
                    showNotification("Данные успешно экспортированы");
                    console.log("Экспорт через data URI завершен успешно.");
                }

            } catch (error) {
                console.error("Полная ошибка при экспорте данных:", error);
                showNotification(`Критическая ошибка при экспорте: ${error.message || 'Неизвестная ошибка'}`, "error");
            }
        }


        async function importDataFromJSON(jsonString) {
            console.log("Начало импорта данных...");

            const confirmation = confirm(
                "ВНИМАНИЕ!\n\n" +
                "Импорт данных полностью ЗАМЕНИТ все текущие данные в приложении (алгоритмы, ссылки, закладки, регламенты, настройки и т.д.) данными из файла.\n\n" +
                "РЕКОМЕНДУЕТСЯ СНАЧАЛА СДЕЛАТЬ ЭКСПОРТ (резервную копию) ваших текущих данных перед импортом.\n\n" +
                "Продолжить импорт?"
            );

            if (!confirmation) {
                showNotification("Импорт отменен пользователем.", "info");
                console.log("Импорт отменен.");
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
                return false;
            }

            showNotification("Импорт данных... Пожалуйста, подождите.", "info");

            if (!db) {
                console.error("Import failed: Database not initialized.");
                showNotification("Ошибка импорта: База данных не доступна", "error");
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
                return false;
            }

            let importData;
            try {
                importData = JSON.parse(jsonString);
                console.log("JSON успешно распарсен.");
            } catch (error) {
                console.error("Error parsing JSON for import:", error);
                showNotification("Ошибка импорта: Некорректный формат JSON файла.", "error");
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
                return false;
            }

            if (!importData || typeof importData.data !== 'object' || !importData.schemaVersion) {
                console.error("Invalid import file structure:", importData);
                showNotification("Некорректный формат файла импорта (отсутствует data или schemaVersion)", "error");
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
                return false;
            }

            console.log(`Импорт данных версии схемы: ${importData.schemaVersion}`);

            const storesToImport = Object.keys(importData.data).filter(storeName =>
                db.objectStoreNames.contains(storeName) && storeName !== 'searchIndex'
            );

            if (storesToImport.length === 0) {
                console.warn("Нет данных для импорта или хранилища не совпадают с текущей структурой БД.");
                showNotification("Нет данных для импорта в текущую структуру БД.", "warning");
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
                return false;
            }

            console.log("Хранилища для импорта:", storesToImport);
            let overallSuccess = true;
            const errorsOccurred = [];

            try {
                for (const storeName of storesToImport) {
                    const itemsToImport = importData.data[storeName];

                    if (!Array.isArray(itemsToImport)) {
                        console.warn(`Данные для ${storeName} в файле импорта не являются массивом. Пропуск.`);
                        errorsOccurred.push({ storeName, error: 'Данные не являются массивом', item: null });
                        overallSuccess = false;
                        continue;
                    }

                    console.log(`Начало импорта для хранилища: ${storeName} (${itemsToImport.length} записей)`);
                    showNotification(`Импорт ${storeName}...`, "info");

                    let transaction;
                    try {
                        transaction = db.transaction([storeName], 'readwrite');
                        const store = transaction.objectStore(storeName);
                        const keyPath = store.keyPath;
                        const autoIncrement = store.autoIncrement;

                        await new Promise((resolve, reject) => {
                            const clearRequest = store.clear();
                            clearRequest.onsuccess = resolve;
                            clearRequest.onerror = (e) => reject(e.target.error || new Error(`Failed to clear store ${storeName}`));
                        });
                        console.log(`Хранилище ${storeName} очищено.`);

                        if (itemsToImport.length > 0) {
                            const putPromises = itemsToImport.map(item => {
                                return new Promise(async (resolvePut, rejectPut) => {
                                    if (typeof item !== 'object' || item === null) {
                                        console.warn(`Пропуск невалидного элемента (не объект или null) в ${storeName}:`, item);
                                        errorsOccurred.push({ storeName, error: 'Элемент не является объектом или null', item: JSON.stringify(item).substring(0, 100) });
                                        resolvePut({ skipped: true });
                                        return;
                                    }
                                    if (!autoIncrement && keyPath) {
                                        let hasKey = false;
                                        if (typeof keyPath === 'string') {
                                            hasKey = item.hasOwnProperty(keyPath) && item[keyPath] !== undefined && item[keyPath] !== null;
                                        } else if (Array.isArray(keyPath)) {
                                            hasKey = keyPath.every(kp => item.hasOwnProperty(kp) && item[kp] !== undefined && item[kp] !== null);
                                        }
                                        if (!hasKey) {
                                            console.warn(`Пропуск элемента в ${storeName} (нет ключа [${keyPath}] и не автоинкремент):`, JSON.stringify(item).substring(0, 100));
                                            errorsOccurred.push({ storeName, error: `Отсутствует ключ ${keyPath}`, item: JSON.stringify(item).substring(0, 100) });
                                            resolvePut({ skipped: true });
                                            return;
                                        }
                                    }
                                    if (keyPath && Object.keys(item).length === (Array.isArray(keyPath) ? keyPath.length : (keyPath ? 1 : 0))) {
                                        let isEmpty = true;
                                        if (typeof keyPath === 'string' && keyPath in item && item[keyPath] !== null) isEmpty = false;
                                        else if (Array.isArray(keyPath) && keyPath.every(k => k in item && item[k] !== null)) isEmpty = false;

                                        if (isEmpty && Object.keys(item).length <= (Array.isArray(keyPath) ? keyPath.length : 1)) {
                                            console.warn(`Пропуск потенциально пустого элемента в ${storeName}:`, JSON.stringify(item).substring(0, 100));
                                            errorsOccurred.push({ storeName, error: 'Пустой или некорректный элемент', item: JSON.stringify(item).substring(0, 100) });
                                            resolvePut({ skipped: true });
                                            return;
                                        }
                                    }


                                    const putRequest = store.put(item);
                                    putRequest.onsuccess = () => resolvePut({ success: true });
                                    putRequest.onerror = (e) => {
                                        const errorMsg = e.target.error?.message || 'Put request failed';
                                        console.error(`Ошибка записи элемента в ${storeName}:`, errorMsg, item);
                                        rejectPut({ error: errorMsg, item });
                                    };
                                });
                            });

                            const putResults = await Promise.allSettled(putPromises);

                            let successfulPuts = 0;
                            let failedPuts = 0;
                            let skippedPuts = 0;

                            putResults.forEach(result => {
                                if (result.status === 'fulfilled') {
                                    if (result.value?.success) successfulPuts++;
                                    else if (result.value?.skipped) skippedPuts++;
                                } else {
                                    failedPuts++;
                                    const errorReason = result.reason?.error || 'Unknown write error';
                                    const errorItem = result.reason?.item ? JSON.stringify(result.reason.item).substring(0, 100) + '...' : 'N/A';
                                    errorsOccurred.push({ storeName, error: errorReason, item: errorItem });
                                    overallSuccess = false;
                                }
                            });
                            console.log(`В ${storeName}: Успешно записано: ${successfulPuts}, Пропущено: ${skippedPuts}, Ошибки записи: ${failedPuts}.`);
                        } else {
                            console.log(`Нет элементов для записи в ${storeName}.`);
                        }

                        await new Promise((resolve, reject) => {
                            transaction.oncomplete = () => {
                                console.log(`Транзакция для ${storeName} успешно завершена.`);
                                resolve();
                            };
                            transaction.onerror = (e) => {
                                const errorMsg = e.target.error?.message || `Transaction error for ${storeName}`;
                                console.error(`Ошибка транзакции ${storeName}:`, errorMsg);
                                errorsOccurred.push({ storeName, error: `Ошибка транзакции: ${errorMsg}`, item: null });
                                overallSuccess = false;
                                reject(new Error(errorMsg));
                            };
                            transaction.onabort = (e) => {
                                const errorMsg = e.target.error?.message || `Transaction aborted for ${storeName}`;
                                console.error(`Транзакция ${storeName} прервана:`, errorMsg);
                                errorsOccurred.push({ storeName, error: `Транзакция прервана: ${errorMsg}`, item: null });
                                overallSuccess = false;
                                reject(new Error(errorMsg));
                            };
                        });

                    } catch (error) {
                        const errorMsg = error.message || `Критическая ошибка импорта для ${storeName}`;
                        console.error(`Критическая ошибка при импорте данных для хранилища ${storeName}:`, errorMsg);
                        errorsOccurred.push({ storeName, error: errorMsg, item: null });
                        overallSuccess = false;
                        throw new Error(`Import failed during processing store ${storeName}: ${errorMsg}`);
                    }
                }

            } catch (error) {
                console.error("Импорт прерван из-за критической ошибки:", error);
                showNotification(`Импорт остановлен из-за ошибки: ${error.message}`, "error", 10000);
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
                return false;
            }

            console.log("Импорт данных в IndexedDB завершен. Обновление приложения...");
            showNotification("Обновление интерфейса и данных...", "info");

            try {
                const dbReadyAfterImport = await appInit();
                if (!dbReadyAfterImport) {
                    throw new Error("Не удалось переинициализировать базу данных после импорта.");
                }
                console.log("Состояние приложения обновлено (appInit выполнен).");

                console.log("Попытка применить настройки UI после импорта...");
                let loadedSettingsForLog = null;
                try {
                    loadedSettingsForLog = await getFromIndexedDB('preferences', 'uiSettings');
                    console.log("Настройки UI, прочитанные из БД ПЕРЕД вызовом applyUISettings:", loadedSettingsForLog ? JSON.parse(JSON.stringify(loadedSettingsForLog)) : 'не найдены');
                } catch (e) { console.error("Ошибка чтения настроек UI перед применением:", e); }
                await applyUISettings();
                console.log("Настройки UI применены после импорта.");

                console.log("Перестроение поискового индекса после импорта...");
                showNotification("Индексация данных для поиска...", "info");
                await buildInitialSearchIndex();
                console.log("Поисковый индекс перестроен.");

                if (!overallSuccess) {
                    let errorSummary = errorsOccurred.map(e =>
                        `  - ${e.storeName}: ${e.error}${e.item ? ` (Элемент: ${e.item})` : ''}`
                    ).join('\n');
                    if (errorSummary.length > 500) {
                        errorSummary = errorSummary.substring(0, 500) + '...\n(Полный список ошибок в консоли)';
                    }
                    showNotification(`Импорт завершен с ошибками:\n${errorSummary}`, "warning", 15000);
                    console.warn("Ошибки импорта:", errorsOccurred);
                } else {
                    showNotification("Импорт данных успешно завершен. Приложение обновлено!", "success");
                }
                return true;

            } catch (postImportError) {
                console.error("Критическая ошибка во время обновления приложения после импорта:", postImportError);
                showNotification(`Критическая ошибка после импорта: ${postImportError.message}. Пожалуйста, обновите страницу (F5).`, "error", 15000);
                return false;
            } finally {
                const importFileInput = document.getElementById('importFileInput');
                if (importFileInput) importFileInput.value = '';
            }
        }


        function showNotification(message, type = "success", duration = 3000) {
            let notificationElement = document.getElementById('notification');
            const container = document.body;

            if (!container) {
                console.error("Не удалось найти body для отображения уведомления.");
                return;
            }

            if (notificationElement) {
                const existingHideTimeoutId = parseInt(notificationElement.dataset.hideTimeoutId || '0');
                if (existingHideTimeoutId) {
                    clearTimeout(existingHideTimeoutId);
                }
                const existingRemoveTimeoutId = parseInt(notificationElement.dataset.removeTimeoutId || '0');
                if (existingRemoveTimeoutId) {
                    clearTimeout(existingRemoveTimeoutId);
                }
                notificationElement.remove();
            }

            notificationElement = document.createElement('div');
            notificationElement.id = 'notification';

            let bgColorClass = 'bg-green-500';
            if (type === "error") {
                bgColorClass = 'bg-red-600 dark:bg-red-700';
            } else if (type === "warning") {
                bgColorClass = 'bg-yellow-500 dark:bg-yellow-600';
            } else if (type === "info") {
                bgColorClass = 'bg-blue-500 dark:bg-blue-600';
            }

            notificationElement.className = `fixed z-[10000] top-5 right-5 p-4 rounded-lg shadow-lg text-white text-sm font-medium transform transition-transform duration-300 ease-out ${bgColorClass} translate-x-full max-w-sm`;
            notificationElement.textContent = message;
            notificationElement.setAttribute('role', 'alert');

            container.appendChild(notificationElement);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    notificationElement.classList.remove('translate-x-full');
                });
            });

            const hideTimeoutId = setTimeout(() => {
                notificationElement.classList.add('translate-x-full');

                const removeTimeoutId = setTimeout(() => {
                    const currentNotification = document.getElementById('notification');
                    if (currentNotification === notificationElement) {
                        currentNotification.remove();
                    }
                }, 300);

                notificationElement.dataset.removeTimeoutId = removeTimeoutId.toString();

            }, duration);

            notificationElement.dataset.hideTimeoutId = hideTimeoutId.toString();
        }




        let algorithms = {
            main: {
                title: "Главный алгоритм работы",
                steps: [
                    {
                        title: "Шаг 1: Приветствие",
                        description: "Поприветствуйте клиента, представьтесь, назовите компанию и спросите, чем можете помочь.",
                        example: 'Пример: "Добрый день! Техническая поддержка 1С-Отчетность, меня зовут [ваше имя]. Чем могу помочь?"'
                    },
                    {
                        title: "Шаг 2: Уточнение ИНН",
                        description: "Запросите ИНН организации для идентификации клиента в системе.",
                        example: 'Пример: "Для начала работы, подскажите, пожалуйста, ИНН вашей организации."',
                        innLink: true
                    },
                    {
                        title: "Шаг 3: Идентификация проблемы",
                        description: "Выясните суть проблемы, задавая уточняющие вопросы.",
                        example: {
                            type: 'list',
                            intro: "Примеры вопросов:",
                            items: [
                                "<strong>Назовите, пожалуйста, полный текст ошибки</strong> (записать точнее, в идеале, дословно)",
                                "Когда впервые возникла проблема?"
                            ]
                        }
                    },
                    {
                        title: "Шаг 4: Решение проблемы",
                        description: "Определите категорию проблемы и перейдите к соответствующему разделу с инструкциями по решению.",
                        example: null
                    }
                ]
            },
            program: [
                {
                    id: "program1",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." },
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." }
                    ]
                },
                {
                    id: "program2",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." },
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." }
                    ]
                }
            ],
            skzi: [
                {
                    id: "skzi1",
                    title: "Ошибка подписания документа",
                    description: "Базовая ошибка при подписании любого документа, либо автонастройке",
                    steps: [
                        { title: "Проверка данных подписанта и носителя", description: "Проверь информацию о подписанте (сверь информацию, указанную в сертификате, с данными клиента)." },
                        { title: "Подписант рукль или физик?", description: "Если рукль - уточни, присутствует ли физически токен в компьютере, горит ли на нем индикатор, отображается ли он в системном трее или диспетчере устройств, отображется ли контейнер в КриптоПро" }
                    ]
                },
                {
                    id: "skzi2",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." },
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." }
                    ]
                }
            ],
            webReg: [
                {
                    id: "webreg1",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." },
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." }
                    ]
                },
                {
                    id: "webreg2",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." },
                        { title: "Место для вашей рекламы...", description: "Место для вашей рекламы..." }
                    ]
                }
            ]
        };


        function setupTabsOverflow() {
            const tabsNav = document.querySelector('nav.flex');
            const moreTabsBtn = document.getElementById('moreTabsBtn');
            const moreTabsDropdown = document.getElementById('moreTabsDropdown');
            if (!tabsNav || !moreTabsBtn || !moreTabsDropdown) {
                console.warn("Tabs overflow setup skipped: Required DOM elements not found.");
                return;
            }
            const moreTabsContainer = moreTabsBtn.parentNode;

            const updateVisibleTabs = () => {
                const overflowingTabs = [];
                moreTabsDropdown.innerHTML = '';
                moreTabsContainer.classList.add('hidden');

                const allTabs = tabsNav.querySelectorAll('.tab-btn:not(.hidden)');
                if (!allTabs.length) return;

                allTabs.forEach(tab => {
                    tab.classList.remove('overflow-tab');
                    tab.style.display = '';
                });

                const navWidth = tabsNav.offsetWidth;
                const wasHidden = moreTabsContainer.classList.contains('hidden');
                if (wasHidden) moreTabsContainer.classList.remove('hidden');
                const moreTabsWidth = moreTabsContainer.offsetWidth;
                if (wasHidden) moreTabsContainer.classList.add('hidden');

                let totalWidth = 0;
                let overflowDetected = false;

                for (let i = 0; i < allTabs.length; i++) {
                    const tab = allTabs[i];
                    const tabWidth = tab.offsetWidth;

                    if (overflowDetected) {
                        overflowingTabs.push(tab);
                        tab.classList.add('overflow-tab');
                        tab.style.display = 'none';
                        continue;
                    }


                    if (totalWidth + tabWidth + (i < allTabs.length - 1 ? moreTabsWidth : 0) > navWidth) {
                        if (i < allTabs.length - 1) {
                            overflowDetected = true;
                            moreTabsContainer.classList.remove('hidden');
                            overflowingTabs.push(tab);
                            tab.classList.add('overflow-tab');
                            tab.style.display = 'none';
                        } else {
                            totalWidth += tabWidth;
                        }

                    } else {
                        totalWidth += tabWidth;
                    }
                }

                if (overflowingTabs.length > 0) {
                    overflowingTabs.forEach(tab => {
                        const dropdownItem = document.createElement('div');
                        dropdownItem.className = 'px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer overflow-dropdown-item';
                        dropdownItem.innerHTML = tab.innerHTML;
                        dropdownItem.dataset.tabId = tab.id.replace('Tab', '');

                        dropdownItem.addEventListener('click', () => {
                            if (typeof setActiveTab === 'function') {
                                setActiveTab(dropdownItem.dataset.tabId);
                            } else {
                                console.warn('setActiveTab function not found.');
                            }
                            moreTabsDropdown.classList.add('hidden');
                        });
                        moreTabsDropdown.appendChild(dropdownItem);
                    });
                }
            };


            moreTabsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreTabsDropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!moreTabsDropdown.contains(e.target) && !moreTabsBtn.contains(e.target)) {
                    moreTabsDropdown.classList.add('hidden');
                }
            });


            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(updateVisibleTabs, 150);
            });

            setTimeout(updateVisibleTabs, 100);
        }


        const CARD_CONTAINER_CLASSES = ['grid', 'gap-4'];
        const LIST_CONTAINER_CLASSES = ['flex', 'flex-col'];
        const CARD_ITEM_BASE_CLASSES = ['p-4', 'rounded-lg', 'shadow-sm', 'hover:shadow-md', 'bg-white', 'dark:bg-gray-700'];
        const LIST_ITEM_BASE_CLASSES = ['p-3', 'border-b', 'border-gray-200', 'dark:border-gray-600', 'hover:bg-gray-50', 'dark:hover:bg-gray-700', 'flex', 'justify-between', 'items-center', 'bg-white', 'dark:bg-gray-700'];
        const ALGO_BOOKMARK_CARD_CLASSES = ['cursor-pointer', 'items-start'];
        const LINK_REGLAMENT_CARD_CLASSES = ['items-start'];
        const LIST_HOVER_TRANSITION_CLASSES = ['transition-colors'];

        const SECTION_GRID_COLS = {
            bookmarksContainer: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
            extLinksContainer: ['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3'],
            linksContainer: ['grid-cols-1', 'md:grid-cols-2'],
            reglamentsContainer: ['grid-cols-1', 'md:grid-cols-2'],
            default: ['grid-cols-1', 'md:grid-cols-2']
        };


        const DEFAULT_UI_SETTINGS = {
            primaryColor: '#9333EA', // Фиолетовый
            fontSize: 90,          // 90%
            borderRadius: 2,        // 2px (скругление обычно в px)
            contentDensity: 3,       // 3 (соответствует 50% на слайдере 0-10)
            themeMode: 'dark',
            mainLayout: 'horizontal'
        };


        const DEFAULT_CIB_LINKS = [
            {
                title: "Учетные записи документооборота",
                link: "e1cib/list/Справочник.УчетныеЗаписиДокументооборота",
                description: "Все УЗ в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Дополнительные реквизиты УЗ",
                link: "e1cib/list/РегистрСведений.ДополнительныеРеквизитыУчетнойЗаписи",
                description: "Дополнительные параметры",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Налоговые органы",
                link: "e1cib/list/Справочник.НалоговыеОрганы",
                description: "Список всех НО в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Регистрации в налоговом органе",
                link: "e1cib/list/Справочник.РегистрацииВНалоговомОргане",
                description: "Список всех НО с регистрацией в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Органы ПФР",
                link: "e1cib/list/Справочник.ОрганыПФР",
                description: "Список всех органов ПФР в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Органы ФСГС",
                link: "e1cib/list/Справочник.ОрганыФСГС",
                description: "Органы Росстата в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Отправки ФСС",
                link: "e1cib/list/Справочник.ОтправкиФСС",
                description: "Список отправок в ФСС",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Список организаций",
                link: "e1cib/list/Справочник.Организации",
                description: "Перейти к списку всех организаций в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Физические лица",
                link: "e1cib/list/Справочник.ФизическиеЛица",
                description: "Список всех физ.лиц в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Ответственные лица организации",
                link: "e1cib/list/РегистрСведений.ОтветственныеЛицаОрганизаций",
                description: "Список всех ролей по организации",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Виды отправляемых документов",
                link: "e1cib/list/Справочник.ВидыОтправляемыхДокументов",
                description: "Список всех доступных для отправки документов",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Тома хранения файлов",
                link: "e1cib/list/Справочник.ТомаХраненияФайлов",
                description: "Франчовское, но может быть полезным",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Свойства транспортных сообщений",
                link: "e1cib/list/РегистрСведений.СвойстваТранспортныхСообщений",
                description: "",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Транспортные контейнеры",
                link: "e1cib/list/РегистрСведений.ТранспортныеКонтейнеры",
                description: "Органы Росстата в базе",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Групповое изменение реквизитов",
                link: "e1cib/app/Обработка.ГрупповоеИзменениеРеквизитов",
                description: "Очень мощный инструмент редактирования реквизитов орги",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Транспортное сообщение",
                link: "e1cib/list/Документ.ТранспортноеСообщение",
                description: "Список всех транспортных сообщений",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Входящие сообщения СЭДО ФСС",
                link: "e1cib/list/РегистрСведений.ВходящиеСообщенияСЭДОФСС",
                description: "Все входящии по СЭДО",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Дата запрета изменений данных",
                link: "e1cib/command/РегистрСведений.ДатыЗапретаИзменения.Команда.ДатыЗапретаИзмененияДанных",
                description: "Применяется для решения ошибок при сохранении данных в карте орги",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Периоды обновления данных ЕНС",
                link: "e1cib/list/РегистрСведений.ПериодыОбновленияДанныхЕНС",
                description: "ЧИстить при ошибках ЕНС",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Данные ЛК ЕНС",
                link: "e1cib/list/РегистрСведений.ДанныеЛичногоКабинетаЕНС",
                description: "Чистить при ошибках ЕНС",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Журнал загрузки ЕНС",
                link: "e1cib/list/РегистрСведений.ЖурналЗагрузкиЕНС",
                description: "Чистить при ошибках с ЕНС",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Активные пользователи",
                link: "e1cib/app/Обработка.АктивныеПользователи",
                description: "Текущие активные пользователи 1С",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Пользователи",
                link: "e1cib/list/Справочник.Пользователи",
                description: "Все пользователи",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Настройки электронной подписи и шифрования",
                link: "e1cib/app/ОбщаяФорма.НастройкиЭлектроннойПодписиИШифрования",
                description: "Настройки ЭП средствами 1С",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Журнал регистрации",
                link: "e1cib/app/Обработка.ЖурналРегистрации",
                description: "Сбор всех сообщений внутри 1С",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Журнал запросов к серверам ФСС",
                link: "e1cib/list/РегистрСведений.ЖурналЗапросовКСерверамФСС",
                description: "",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Журнал отправок в КО",
                link: "e1cib/list/РегистрСведений.ЖурналОтправокВКонтролирующиеОрганы",
                description: "",
                dateAdded: new Date().toISOString()
            },
            {
                title: "Список заявлений на изменение/подключение",
                link: "e1cib/list/Документ.ЗаявлениеАбонентаСпецоператораСвязи",
                description: "Список всех отправленных заявлений",
                dateAdded: new Date().toISOString()
            }
        ];


        let currentSection = 'main';
        let currentAlgorithm = null;
        let editMode = false;
        let viewPreferences = {};

        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        const algorithmModal = document.getElementById('algorithmModal');
        const editModal = document.getElementById('editModal');
        const addModal = document.getElementById('addModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const closeEditModalBtn = document.getElementById('closeEditModalBtn');
        const closeAddModalBtn = document.getElementById('closeAddModalBtn');
        const editAlgorithmBtn = document.getElementById('editAlgorithmBtn');
        const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');
        const addStepBtn = document.getElementById('addStepBtn');
        const saveAlgorithmBtn = document.getElementById('saveAlgorithmBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        const editMainBtn = document.getElementById('editMainBtn');
        const addNewStepBtn = document.getElementById('addNewStepBtn');
        const saveNewAlgorithmBtn = document.getElementById('saveNewAlgorithmBtn');
        const cancelAddBtn = document.getElementById('cancelAddBtn');
        const addProgramAlgorithmBtn = document.getElementById('addProgramAlgorithmBtn');
        const addSkziAlgorithmBtn = document.getElementById('addSkziAlgorithmBtn');
        const addWebRegAlgorithmBtn = document.getElementById('addWebRegAlgorithmBtn');

        initUI();

        setupTabsOverflow();


        const addClickListeners = (listeners) => {
            listeners.forEach(([element, handler]) => {
                element?.addEventListener('click', handler);
            });
        };

        tabButtons.forEach(button => {
            button.addEventListener('click', () => setActiveTab(button.id.replace('Tab', '')));
        });


        closeModalBtn?.addEventListener('click', () => algorithmModal?.classList.add('hidden'));
        closeEditModalBtn?.addEventListener('click', () => requestCloseModal(editModal));
        closeAddModalBtn?.addEventListener('click', () => requestCloseModal(addModal));
        cancelEditBtn?.addEventListener('click', () => requestCloseModal(editModal));
        cancelAddBtn?.addEventListener('click', () => requestCloseModal(addModal));

        editMainBtn?.addEventListener('click', () => editAlgorithm('main'));
        addStepBtn?.addEventListener('click', addEditStep);
        saveAlgorithmBtn?.addEventListener('click', saveAlgorithm);
        addNewStepBtn?.addEventListener('click', addNewStep);
        saveNewAlgorithmBtn?.addEventListener('click', saveNewAlgorithm);
        addProgramAlgorithmBtn?.addEventListener('click', () => showAddModal('program'));
        addSkziAlgorithmBtn?.addEventListener('click', () => showAddModal('skzi'));
        addWebRegAlgorithmBtn?.addEventListener('click', () => showAddModal('webReg'));

        editAlgorithmBtn?.addEventListener('click', () => {
            if (!currentAlgorithm) {
                console.error('[editAlgorithmBtn Click] Cannot edit: currentAlgorithm ID is missing from state.');
                return;
            }
            editAlgorithm(currentAlgorithm, currentSection);
        });


        function initUI() {
            setActiveTab('main');
            renderMainAlgorithm();
            ['program', 'skzi', 'webReg'].forEach(renderAlgorithmCards);
        }


        function setActiveTab(tabId) {
            currentSection = tabId;
            const targetTabId = tabId + 'Tab';
            const targetContentId = tabId + 'Content';

            tabButtons.forEach(button => {
                const isActive = button.id === targetTabId;
                button.classList.toggle('border-primary', isActive);
                button.classList.toggle('text-primary', isActive);
                button.classList.toggle('border-transparent', !isActive);
                button.classList.toggle('hover:border-gray-300', !isActive);
            });

            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== targetContentId);
            });
        }


        function renderAlgorithmCards(section) {
            const sectionAlgorithms = algorithms[section];
            if (!sectionAlgorithms || !Array.isArray(sectionAlgorithms)) {
                console.warn(`[renderAlgorithmCards] No valid algorithms found for section: ${section}`);
                const container = document.getElementById(section + 'Algorithms');
                if (container) {
                    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full">Алгоритмы для этого раздела не найдены или не загружены.</p>';
                }
                return;
            }

            const container = document.getElementById(section + 'Algorithms');
            if (!container) {
                console.error(`[renderAlgorithmCards] Container #${section}Algorithms not found.`);
                return;
            }

            container.innerHTML = '';

            if (sectionAlgorithms.length === 0) {
                container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center col-span-full">В разделе "${getSectionName(section)}" пока нет алгоритмов.</p>`;
                applyCurrentView(section + 'Algorithms');
                return;
            }

            const fragment = document.createDocumentFragment();

            sectionAlgorithms.forEach(algorithm => {
                if (!algorithm || typeof algorithm !== 'object' || !algorithm.id) {
                    console.warn(`[renderAlgorithmCards] Skipping invalid algorithm object in section ${section}:`, algorithm);
                    return;
                }

                const card = document.createElement('div');
                card.dataset.id = algorithm.id;
                card.className = 'algorithm-card view-item bg-white dark:bg-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer';
                card.innerHTML = `
                    <h3 class="font-bold">${algorithm.title || 'Без заголовка'}</h3>
                    <p class="text-gray-600 dark:text-gray-400 text-sm mt-1">${algorithm.description || 'Нет описания'}</p>
                `;
                card.addEventListener('click', () => {
                    if (typeof showAlgorithmDetail === 'function') {
                        showAlgorithmDetail(algorithm, section);
                    } else {
                        console.error("showAlgorithmDetail function is not defined when clicking card.");
                        showNotification("Ошибка: Невозможно открыть детали алгоритма.", "error");
                    }
                });
                fragment.appendChild(card);
            });

            container.appendChild(fragment);

            if (typeof applyCurrentView === 'function') {
                applyCurrentView(section + 'Algorithms');
            } else {
                console.warn("applyCurrentView function is not defined after rendering cards.");
            }
        }


        function renderMainAlgorithm() {
            const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
            if (!mainAlgorithmContainer) {
                console.error("Container #mainAlgorithm not found for rendering.");
                return;
            }

            if (!algorithms || !algorithms.main || !Array.isArray(algorithms.main.steps)) {
                console.error("Main algorithm data is missing or invalid for rendering.");
                mainAlgorithmContainer.innerHTML = '<p class="text-red-500 dark:text-red-400">Ошибка: Не удалось загрузить главный алгоритм.</p>';
                return;
            }

            let htmlContent = '';
            algorithms.main.steps.forEach(step => {
                const descriptionHtml = linkify(step.description || 'Нет описания');

                let exampleBlockHtml = '';
                if (step.example) {
                    if (typeof step.example === 'object' && step.example.type === 'list' && Array.isArray(step.example.items)) {
                        const introHtml = step.example.intro ? `<p class="text-gray-600 dark:text-gray-400 mt-1 text-sm">${linkify(step.example.intro)}</p>` : '';
                        const listItemsHtml = step.example.items.map(item =>
                            `<li>${linkify(item)}</li>`
                        ).join('');

                        exampleBlockHtml = `
                    ${introHtml}
                    <ul class="list-disc list-inside pl-5 mt-1 text-gray-600 dark:text-gray-400 text-sm">
                        ${listItemsHtml}
                    </ul>
                `;
                    } else if (typeof step.example === 'string') {
                        const exampleContentHtml = linkify(step.example);
                        exampleBlockHtml = `<p class="text-gray-600 dark:text-gray-400 mt-1 text-sm">${exampleContentHtml}</p>`;
                    }
                }

                htmlContent += `
            <div class="algorithm-step bg-white dark:bg-gray-700 p-content-sm rounded-lg shadow-sm border-l-4 border-primary mb-content-sm">
                <h3 class="font-bold text-base">${step.title || 'Без заголовка'}</h3>
                <p class="text-sm mt-1">${descriptionHtml}</p>
                ${exampleBlockHtml}
        `;

                if (step.innLink === true) {
                    htmlContent += `
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">
                    <a href="#" class="text-primary hover:underline" id="noInnLink">Что делать, если клиент не может назвать ИНН?</a>
                </p>
            `;
                }

                htmlContent += `</div>`;
            });

            mainAlgorithmContainer.innerHTML = htmlContent;

            const noInnLinkElement = mainAlgorithmContainer.querySelector('#noInnLink');
            if (noInnLinkElement) {
                noInnLinkElement.addEventListener('click', (event) => {
                    event.preventDefault();
                    showNoInnModal();
                });
            }
        }


        function showAlgorithmDetail(algorithm, section) {
            const algorithmModal = document.getElementById('algorithmModal');
            const modalTitle = document.getElementById('modalTitle');
            const algorithmStepsContainer = document.getElementById('algorithmSteps');
            let deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');

            if (!algorithmModal || !modalTitle || !algorithmStepsContainer) {
                console.error("showAlgorithmDetail: Essential modal elements missing. Cannot proceed.");
                showNotification("Ошибка интерфейса: Не удалось найти элементы окна деталей.", "error");
                return;
            }

            currentAlgorithm = algorithm?.id;
            currentSection = section;
            console.log(`[showAlgorithmDetail] Showing details for Algorithm ID: ${currentAlgorithm}, Section: ${currentSection}`);
            if (currentAlgorithm === undefined || currentAlgorithm === null) {
                console.error("[showAlgorithmDetail] Algorithm ID is missing in the passed data!", algorithm);
                if (section === 'main') {
                    currentAlgorithm = 'main';
                    console.warn("[showAlgorithmDetail] Using 'main' as fallback ID for main section.");
                } else {
                    showNotification("Ошибка: Не удалось определить ID алгоритма.", "error");
                    return;
                }
            }

            modalTitle.textContent = algorithm?.title ?? "Детали алгоритма";

            try {
                let stepsHtml;
                if (algorithm?.steps && Array.isArray(algorithm.steps)) {
                    stepsHtml = algorithm.steps.map((step, index) => {
                        const descriptionHtml = linkify(step?.description ?? 'Нет описания.');
                        let exampleHtml = '';
                        if (typeof step?.example === 'string') {
                            exampleHtml = linkify(step.example);
                        } else if (step?.example?.type === 'list' && Array.isArray(step.example.items)) {
                            const introHtml = step.example.intro ? `<p class="text-sm italic mt-1">${linkify(step.example.intro)}</p>` : '';
                            const listItemsHtml = step.example.items.map(item => `<li>${linkify(item)}</li>`).join('');
                            exampleHtml = `${introHtml}<ul class="list-disc list-inside pl-4 mt-1">${listItemsHtml}</ul>`;
                        } else if (step?.example) {
                            exampleHtml = linkify(JSON.stringify(step.example));
                        }


                        return `
            <div class="algorithm-step bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-sm border-l-4 border-primary mb-3">
                <h3 class="font-bold text-lg">${step?.title ?? `Шаг ${index + 1}`}</h3>
                <p class="mt-1">${descriptionHtml}</p>
                ${exampleHtml ? `<div class="text-gray-600 dark:text-gray-400 mt-2 text-sm prose dark:prose-invert max-w-none">${exampleHtml}</div>` : ''}
            </div>`;
                    }).join('');
                } else {
                    stepsHtml = '<p class="text-orange-500">Данные шагов отсутствуют или некорректны.</p>';
                }
                algorithmStepsContainer.innerHTML = stepsHtml;
            } catch (error) {
                console.error("showAlgorithmDetail: Error processing algorithm steps:", error);
                algorithmStepsContainer.innerHTML = '<p class="text-red-500">Ошибка при отображении шагов алгоритма.</p>';
            }

            if (deleteAlgorithmBtn) {
                if (deleteAlgorithmBtn.dataset.listenerAttached === 'true') {
                    const newDeleteBtn = deleteAlgorithmBtn.cloneNode(true);
                    deleteAlgorithmBtn.parentNode.replaceChild(newDeleteBtn, deleteAlgorithmBtn);
                    deleteAlgorithmBtn = newDeleteBtn;
                    console.log("[showAlgorithmDetail] Replaced delete button to remove old listeners.");
                }

                if (typeof handleDeleteAlgorithmClick === 'function') {
                    deleteAlgorithmBtn.addEventListener('click', handleDeleteAlgorithmClick);
                    deleteAlgorithmBtn.dataset.listenerAttached = 'true';
                    deleteAlgorithmBtn.disabled = false;
                    deleteAlgorithmBtn.title = "Удалить алгоритм";
                } else {
                    console.error("showAlgorithmDetail: handleDeleteAlgorithmClick function is not defined. Delete button disabled.");
                    deleteAlgorithmBtn.disabled = true;
                    deleteAlgorithmBtn.title = "Ошибка: Обработчик удаления не найден.";
                }

                deleteAlgorithmBtn.classList.toggle('hidden', section === 'main');

            } else {
                console.warn("showAlgorithmDetail: Delete button (#deleteAlgorithmBtn) not found.");
            }

            algorithmModal.classList.remove('hidden');
        }


        function editAlgorithm(algorithmId, section = 'main') {
            let algorithm = null;

            initialEditState = null;

            try {
                if (section === 'main') {
                    algorithm = algorithms.main;
                } else {
                    const sourceMap = {
                        program: algorithms.program,
                        skzi: algorithms.skzi,
                        webReg: algorithms.webReg
                    };
                    const sourceArray = sourceMap[section];

                    if (!sourceArray) {
                        console.error(`[editAlgorithm] Unknown section provided: ${section}`);
                        showNotification(`Неизвестный раздел для редактирования: ${section}`, "error");
                        return;
                    }
                    if (!Array.isArray(sourceArray)) {
                        console.error(`[editAlgorithm] Data source for section '${section}' is not an array.`);
                        showNotification(`Ошибка данных: Источник для раздела '${section}' некорректен.`, "error");
                        return;
                    }

                    algorithm = sourceArray.find(a => String(a?.id) === String(algorithmId));
                }
            } catch (error) {
                console.error(`[editAlgorithm] Error retrieving algorithm data for section '${section}', ID '${algorithmId}':`, error);
                showNotification("Ошибка при поиске данных алгоритма.", "error");
                return;
            }


            if (!algorithm) {
                if (typeof algorithmId === 'object' && algorithmId !== null && algorithmId.id) {
                    console.warn(`[editAlgorithm] Received object instead of ID. Trying with object's ID: ${algorithmId.id}`);
                    return editAlgorithm(algorithmId.id, section);
                }
                console.warn(`[editAlgorithm] Algorithm with ID '${algorithmId}' not found in section '${section}'.`);
                showNotification("Не удалось найти алгоритм для редактирования.", "error");
                return;
            }

            const editModalTitle = document.getElementById('editModalTitle');
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const editStepsContainer = document.getElementById('editSteps');
            const editModal = document.getElementById('editModal');
            const algorithmModal = document.getElementById('algorithmModal');

            if (!editModalTitle || !algorithmTitleInput || !editStepsContainer || !editModal || !algorithmModal) {
                console.error("[editAlgorithm] Critical UI Error: One or more edit modal elements are missing from the DOM.");
                showNotification("Ошибка интерфейса: не найдены элементы окна редактирования.", "error");
                return;
            }

            try {
                editModalTitle.textContent = `Редактирование: ${algorithm.title ?? 'Без названия'}`;
                algorithmTitleInput.value = algorithm.title ?? '';

                editStepsContainer.innerHTML = '';

                if (!Array.isArray(algorithm.steps)) {
                    console.error(`[editAlgorithm] Algorithm (ID: ${algorithm.id || algorithmId}, Section: ${section}) has invalid 'steps' data (not an array).`);
                    showNotification("Ошибка данных: Шаги алгоритма некорректны.", "error");
                    editStepsContainer.innerHTML = '<p class="text-red-500">Ошибка загрузки шагов: данные некорректны.</p>';
                } else if (algorithm.steps.length === 0) {
                    editStepsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400">У этого алгоритма еще нет шагов. Добавьте первый шаг.</p>';
                    const stepDiv = document.createElement('div');
                    stepDiv.className = 'edit-step p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4';
                    const showExampleField = section === 'main';
                    stepDiv.innerHTML = createStepElementHTML(1, showExampleField);
                    const deleteBtn = stepDiv.querySelector('.delete-step');
                    if (deleteBtn) {
                        attachDeleteListener(deleteBtn, editStepsContainer, 'editSteps');
                    }
                    editStepsContainer.appendChild(stepDiv);
                    updateStepNumbers(editStepsContainer);
                } else {
                    algorithm.steps.forEach((step, index) => {
                        const stepDiv = document.createElement('div');
                        stepDiv.className = 'edit-step p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4';

                        const showExampleField = section === 'main';
                        let exampleText = '';
                        if (showExampleField) {
                            if (typeof step.example === 'object' && step.example?.type === 'list') {
                                exampleText = (step.example.intro ? step.example.intro + '\n' : '') +
                                    (step.example.items ? step.example.items.map(item => `- ${item}`).join('\n') : '');
                            } else {
                                exampleText = step?.example ?? '';
                            }
                        }

                        const commonInputClasses = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base';
                        const backgroundClasses = 'bg-white dark:bg-gray-700';

                        const exampleInputHtml = showExampleField
                            ? `
                <div class="mt-2">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Пример (опционально)</label>
                    <textarea class="step-example ${commonInputClasses} ${backgroundClasses}" rows="3">${exampleText}</textarea>
                </div>`
                            : '';

                        stepDiv.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 step-number-label">Шаг ${index + 1}</label>
                    <button type="button" class="delete-step text-red-500 hover:text-red-700 transition-colors duration-150 p-1" aria-label="Удалить шаг ${index + 1}">
                        <i class="fas fa-trash fa-fw" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="mb-2">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Заголовок шага</label>
                    <input type="text" class="step-title ${commonInputClasses} ${backgroundClasses}" value="${step?.title ?? ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Описание</label>
                    <textarea class="step-desc ${commonInputClasses} ${backgroundClasses}" rows="3">${step?.description ?? ''}</textarea>
                </div>
                ${exampleInputHtml}
                `;

                        stepDiv.querySelector('.delete-step')?.addEventListener('click', () => {
                            if (editStepsContainer.children.length > 1) {
                                stepDiv.remove();
                                updateStepNumbers(editStepsContainer);
                            } else {
                                showNotification('Алгоритм должен содержать хотя бы один шаг.', 'warning');
                            }
                        });

                        editStepsContainer.appendChild(stepDiv);
                    });

                    updateStepNumbers(editStepsContainer);
                }

                captureInitialEditState(algorithm);

            } catch (error) {
                console.error(`[editAlgorithm] Error populating edit modal for algorithm ID ${algorithm.id || algorithmId}:`, error);
                showNotification("Ошибка при заполнении формы редактирования.", "error");
                editModalTitle.textContent = 'Ошибка редактирования';
                algorithmTitleInput.value = '';
                editStepsContainer.innerHTML = '<p class="text-red-500">Не удалось загрузить данные для редактирования.</p>';
                initialEditState = null;
                return;
            }


            editModal.dataset.algorithmId = String(algorithm.id || algorithmId);
            editModal.dataset.section = section;

            editModal.classList.remove('hidden');
            algorithmModal.classList.add('hidden');
        }


        function updateStepNumbers(container) {
            container.querySelectorAll('.step-number-label').forEach((label, index) => {
                label.textContent = `Шаг ${index + 1}`;
            });
        }


        async function deleteAlgorithm(algorithmId, section) {
            if (section === 'main') {
                console.warn("Attempted to delete 'main' algorithm via deleteAlgorithm function.");
                showNotification("Главный алгоритм не может быть удален.", "warning");
                return Promise.resolve();
            }
            if (!algorithms[section] || !Array.isArray(algorithms[section])) {
                console.error(`deleteAlgorithm: Section ${section} not found or is not an array.`);
                showNotification(`Ошибка: Не удалось найти раздел "${getSectionName(section)}" для удаления алгоритма.`, "error");
                return Promise.reject(new Error(`Invalid section: ${section}`));
            }

            const indexToDelete = algorithms[section].findIndex(a => String(a?.id) === String(algorithmId));

            if (indexToDelete === -1) {
                console.error(`deleteAlgorithm: Algorithm with id ${algorithmId} not found in section ${section}.`);
                showNotification("Ошибка: Алгоритм для удаления не найден в данных.", "error");
                return Promise.reject(new Error(`Algorithm not found: ${algorithmId}`));
            }

            const algorithmToDelete = { ...algorithms[section][indexToDelete] };
            if (!algorithmToDelete.id) algorithmToDelete.id = algorithmId;


            try {
                algorithms[section].splice(indexToDelete, 1);
                console.log(`Algorithm ${algorithmId} removed from in-memory array [${section}].`);

                await saveToIndexedDB('algorithms', { section: 'all', data: algorithms });
                console.log(`Updated algorithms data saved to IndexedDB after deleting ${algorithmId}.`);

                if (typeof updateSearchIndex === 'function' && algorithmToDelete && algorithmToDelete.id) {
                    try {
                        console.log(`Updating search index (delete) for algorithm ID: ${algorithmToDelete.id}`);
                        await updateSearchIndex(
                            'algorithms',
                            algorithmToDelete.id,
                            algorithmToDelete,
                            'delete'
                        );
                    } catch (indexError) {
                        console.error(`Error updating search index for algorithm deletion ${algorithmToDelete.id}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса.", "warning");
                    }
                } else if (!algorithmToDelete || !algorithmToDelete.id) {
                    console.warn(`Could not update index for deleted algorithm ${algorithmId} - data or ID was missing.`);
                } else {
                    console.warn("updateSearchIndex function is not available for algorithm deletion.");
                }

                if (typeof renderAlgorithmCards === 'function') {
                    renderAlgorithmCards(section);
                    console.log(`UI for section ${section} re-rendered.`);
                } else {
                    console.warn("renderAlgorithmCards function not found, UI might not be updated.");
                }

                const algorithmModal = document.getElementById('algorithmModal');
                if (algorithmModal && !algorithmModal.classList.contains('hidden') && currentAlgorithm === algorithmId) {
                    algorithmModal.classList.add('hidden');
                    console.log("Algorithm detail modal hidden after deletion.");
                    currentAlgorithm = null;
                }

                showNotification("Алгоритм успешно удален.");
                return Promise.resolve();

            } catch (error) {
                console.error(`Error deleting algorithm ${algorithmId} from section ${section}:`, error);
                if (algorithmToDelete && algorithms[section] && !algorithms[section].find(a => a.id === algorithmId)) {
                    algorithms[section].splice(indexToDelete, 0, algorithmToDelete);
                    console.warn(`Reverted in-memory deletion of ${algorithmId} due to error.`);
                }
                showNotification("Произошла ошибка при удалении алгоритма.", "error");
                return Promise.reject(error);
            }
        }



        function initViewToggles() {
            document.querySelectorAll('.view-toggle').forEach(button => {
                button.addEventListener('click', handleViewToggleClick);
            });
            loadViewPreferences();
        }


        async function loadViewPreferences() {
            try {
                const prefs = await getFromIndexedDB('preferences', 'viewPreferences');
                viewPreferences = prefs?.views || {};
                document.querySelectorAll('[data-section-id]').forEach(container => {
                    const sectionId = container.dataset.sectionId;
                    const defaultView = container.dataset.defaultView || 'cards';
                    applyView(container, viewPreferences[sectionId] || defaultView);
                });
            } catch (error) {
                console.error("Error loading view preferences:", error);
                applyDefaultViews();
            }
        }


        function applyDefaultViews() {
            document.querySelectorAll('[data-section-id]').forEach(container => {
                applyView(container, container.dataset.defaultView || 'cards');
            });
        }


        async function saveViewPreference(sectionId, view) {
            viewPreferences[sectionId] = view;
            try {
                await saveToIndexedDB('preferences', { id: 'viewPreferences', views: viewPreferences });
            } catch (error) {
                console.error("Error saving view preference:", error);
            }
        }


        function handleViewToggleClick(event) {
            const clickedButton = event.currentTarget;
            const desiredView = clickedButton.dataset.view;

            const viewControlAncestor = clickedButton.closest('.bg-gray-100, .dark\\:bg-gray-800, #reglamentsList');
            if (!viewControlAncestor) {
                console.warn("Could not find ancestor for view toggle controls");
                return;
            }
            const sectionContainer = viewControlAncestor.querySelector('[data-section-id]');

            if (!sectionContainer || !desiredView) {
                console.warn("Could not find section container or desired view for toggle button", clickedButton);
                return;
            }

            const sectionId = sectionContainer.dataset.sectionId;
            applyView(sectionContainer, desiredView);
            saveViewPreference(sectionId, desiredView);
        }


        function applyView(container, view) {
            if (!container) return;

            const sectionId = container.dataset.sectionId;
            let targetView = view;
            if (sectionId === 'bookmarksContainer') {
                targetView = 'cards';
            }
            const viewControlAncestor = container.closest('.tab-content > div, #reglamentsList');
            if (!viewControlAncestor) {
                console.warn(`View control ancestor not found for section ${sectionId}`);
                return;
            }
            const buttons = viewControlAncestor.querySelectorAll(`.view-toggle`);
            const items = container.querySelectorAll('.view-item');

            buttons.forEach(btn => {
                const isTarget = btn.dataset.view === view;
                btn.classList.remove('bg-primary', 'text-white', 'text-gray-500', 'dark:text-gray-400', 'hover:bg-gray-200', 'dark:hover:bg-gray-700');
                if (isTarget) {
                    btn.classList.add('bg-primary', 'text-white');
                } else {
                    btn.classList.add(
                        'text-gray-500',
                        'dark:text-gray-400',
                        'hover:bg-gray-200',
                        'dark:hover:bg-gray-700'
                    );
                }
            });

            const gridColsClasses = SECTION_GRID_COLS[sectionId] || SECTION_GRID_COLS.default;
            container.classList.remove(
                ...CARD_CONTAINER_CLASSES, ...gridColsClasses,
                ...LIST_CONTAINER_CLASSES
            );

            if (view === 'cards') {
                container.classList.add(...CARD_CONTAINER_CLASSES, ...gridColsClasses);
            } else {
                container.classList.add(...LIST_CONTAINER_CLASSES);
            }

            items.forEach(item => {
                const isAlgoBookmarkExtLinkCard = sectionId.includes('Algorithms') || sectionId === 'bookmarksContainer' || sectionId === 'extLinksContainer';
                const isLinkReglamentCard = sectionId === 'linksContainer' || sectionId === 'reglamentsContainer';

                item.classList.remove(
                    ...CARD_ITEM_BASE_CLASSES, ...ALGO_BOOKMARK_CARD_CLASSES, ...LINK_REGLAMENT_CARD_CLASSES,
                    ...LIST_ITEM_BASE_CLASSES, ...LIST_HOVER_TRANSITION_CLASSES,
                    'flex', 'justify-between', 'items-center', 'items-start', 'cursor-pointer',
                    'p-4', 'p-3',
                    'border-b', 'border-gray-200', 'dark:border-gray-600'
                );
                item.classList.remove('bg-white', 'dark:bg-gray-700', 'hover:shadow-md', 'shadow-sm', 'rounded-lg');
                item.classList.remove('hover:bg-gray-50', 'dark:hover:bg-gray-700');

                if (view === 'cards') {
                    item.classList.add(...CARD_ITEM_BASE_CLASSES);

                    if (isAlgoBookmarkExtLinkCard) {
                        item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
                    } else if (isLinkReglamentCard) {
                        item.classList.add(...LINK_REGLAMENT_CARD_CLASSES);
                    }

                    if (item.classList.contains('bookmark-item') || item.classList.contains('ext-link-item') || item.classList.contains('cib-link-item') || item.classList.contains('reglament-item')) {
                        item.classList.add('flex', 'justify-between');
                        if (isAlgoBookmarkExtLinkCard || isLinkReglamentCard || item.classList.contains('cib-link-item')) {
                            item.classList.add('items-start');
                        } else {
                            item.classList.add('items-center');
                        }
                    }
                    item.classList.remove('hover:bg-gray-50', 'dark:hover:bg-gray-700');


                } else {
                    item.classList.add(...LIST_ITEM_BASE_CLASSES);

                    if (isLinkReglamentCard || sectionId === 'extLinksContainer' || sectionId === 'linksContainer') {
                        item.classList.add(...LIST_HOVER_TRANSITION_CLASSES);
                    }
                    item.classList.remove('p-4', 'rounded-lg', 'shadow-sm', 'hover:shadow-md');
                    item.classList.remove('items-start', 'cursor-pointer');
                    item.classList.add('items-center');

                    if (sectionId === 'linksContainer') {
                        item.classList.remove('items-center');
                        item.classList.add('items-start');
                    }
                }
            });

            if (view === 'list' && container.lastElementChild) {
                container.lastElementChild.classList.remove('border-b', 'border-gray-200', 'dark:border-gray-600');
            }
        }


        function applyCurrentView(sectionId) {
            const container = document.getElementById(sectionId);
            if (container) {
                const currentView = viewPreferences[sectionId] || container.dataset.defaultView || 'cards';
                applyView(container, currentView);
            }
        }


        function updateStepNumbers(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.querySelectorAll('.edit-step').forEach((step, index) => {
                const stepLabel = step.querySelector('label');
                if (stepLabel) {
                    stepLabel.textContent = `Шаг ${index + 1}`;
                }
            });
        }


        function createStepElementHTML(stepNumber, includeExampleField) {
            const commonInputClasses = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base';
            const backgroundClasses = 'bg-white dark:bg-gray-700';

            const exampleInputHTML = includeExampleField ? `
        <div class="mt-2">
            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Пример (опционально)</label>
            <textarea class="step-example ${commonInputClasses} ${backgroundClasses}" rows="3"></textarea>
        </div>
    ` : '';

            return `
        <div class="flex justify-between items-start mb-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Шаг ${stepNumber}</label>
            <button type="button" class="delete-step text-red-500 hover:text-red-700 p-1">
                <i class="fas fa-trash fa-fw"></i>
            </button>
        </div>
        <div class="mb-2">
            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Заголовок шага</label>
            <input type="text" class="step-title ${commonInputClasses} ${backgroundClasses}">
        </div>
        <div>
            <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Описание</label>
            <textarea class="step-desc ${commonInputClasses} ${backgroundClasses}" rows="3"></textarea>
        </div>
        ${exampleInputHTML}
    `;
        }


        function attachDeleteListener(buttonElement, containerElement, containerId) {
            buttonElement.addEventListener('click', () => {
                if (containerElement.children.length > 1) {
                    buttonElement.closest('.edit-step')?.remove();
                    updateStepNumbers(containerId);
                } else {
                    alert('Алгоритм должен содержать хотя бы один шаг');
                }
            });
        }


        function extractStepsData(containerElement) {
            const stepsData = { steps: [], isValid: true };
            const stepDivs = containerElement.querySelectorAll('.edit-step');

            stepDivs.forEach(stepDiv => {
                const titleInput = stepDiv.querySelector('.step-title');
                const descInput = stepDiv.querySelector('.step-desc');
                const exampleInput = stepDiv.querySelector('.step-example');

                const title = titleInput?.value.trim();
                const description = descInput?.value.trim();

                const step = { title: title || '', description: description || '' };

                const exampleValue = exampleInput?.value.trim();
                if (exampleInput && exampleValue) {
                    step.example = exampleValue;
                } else if (exampleInput) {
                    delete step.example;
                }

                stepsData.steps.push(step);
            });

            return stepsData;
        }


        function addEditStep() {
            const containerId = 'editSteps';
            const editStepsContainer = document.getElementById(containerId);
            if (!editStepsContainer) return;

            const stepCount = editStepsContainer.children.length;
            const isMainAlgorithm = editModal?.dataset.section === 'main';

            const stepDiv = document.createElement('div');
            stepDiv.className = 'edit-step p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm';
            stepDiv.innerHTML = createStepElementHTML(stepCount + 1, isMainAlgorithm);

            const deleteBtn = stepDiv.querySelector('.delete-step');
            if (deleteBtn) {
                attachDeleteListener(deleteBtn, editStepsContainer, containerId);
            }

            editStepsContainer.appendChild(stepDiv);
        }


        async function saveAlgorithm() {
            const editModal = document.getElementById('editModal');
            const algorithmId = editModal?.dataset.algorithmId;
            const section = editModal?.dataset.section;
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const editStepsContainer = document.getElementById('editSteps');

            if (!editModal || algorithmId === undefined || !section || !algorithmTitleInput || !editStepsContainer) {
                console.error("Save failed: Missing required elements or data attributes (algorithmId, section).");
                showNotification("Ошибка сохранения: Не найдены необходимые элементы или ID алгоритма.", "error");
                return;
            }

            const newTitle = algorithmTitleInput.value.trim();
            if (!newTitle && section !== 'main') {
                showNotification('Пожалуйста, введите название алгоритма', 'error');
                return;
            }
            const finalTitle = (section === 'main' && !newTitle) ? "Главный алгоритм работы" : newTitle;


            const { steps: newSteps } = extractStepsData(editStepsContainer);

            if (newSteps.length === 0) {
                showNotification('Алгоритм должен содержать хотя бы один шаг', 'error');
                return;
            }

            let updateSuccessful = false;
            let algorithmContainerToSave = null;
            let oldAlgorithmData = null;
            let newAlgorithmData = null;

            try {
                if (section === 'main') {
                    if (algorithms?.main) {
                        oldAlgorithmData = JSON.parse(JSON.stringify(algorithms.main));
                    }
                } else if (algorithms?.[section] && Array.isArray(algorithms[section])) {
                    const algorithmIndex = algorithms[section].findIndex(a => String(a?.id) === String(algorithmId));
                    if (algorithmIndex !== -1) {
                        oldAlgorithmData = JSON.parse(JSON.stringify(algorithms[section][algorithmIndex]));
                    } else {
                        console.warn(`Could not find old algorithm data for ${section}/${algorithmId} before update.`);
                    }
                }

                if (section === 'main') {
                    if (algorithms?.main) {
                        algorithms.main.title = finalTitle;
                        algorithms.main.steps = newSteps;
                        algorithms.main.id = 'main';
                        newAlgorithmData = algorithms.main;
                        algorithmContainerToSave = { section: 'all', data: algorithms };
                        const mainTitleElement = document.querySelector('#mainContent h2');
                        if (mainTitleElement) {
                            mainTitleElement.textContent = finalTitle;
                        }
                        if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                        updateSuccessful = true;
                    } else {
                        console.error("Cannot update main algorithm: algorithms.main is not defined.");
                    }
                } else {
                    if (algorithms?.[section] && Array.isArray(algorithms[section])) {
                        const algorithmIndex = algorithms[section].findIndex(a => String(a.id) === String(algorithmId));
                        if (algorithmIndex !== -1) {
                            algorithms[section][algorithmIndex] = {
                                ...algorithms[section][algorithmIndex],
                                title: finalTitle,
                                steps: newSteps
                            };
                            if (!algorithms[section][algorithmIndex].id) {
                                algorithms[section][algorithmIndex].id = algorithmId;
                            }
                            newAlgorithmData = algorithms[section][algorithmIndex];
                            algorithmContainerToSave = { section: 'all', data: algorithms };
                            if (typeof renderAlgorithmCards === 'function') renderAlgorithmCards(section);
                            updateSuccessful = true;
                        } else {
                            console.error(`Cannot find algorithm with ID ${algorithmId} in section ${section} to update.`);
                        }
                    } else {
                        console.error(`Cannot update algorithm: algorithms.${section} is not an array or does not exist.`);
                    }
                }

                if (updateSuccessful && algorithmContainerToSave) {
                    const saved = await saveToIndexedDB('algorithms', algorithmContainerToSave);

                    if (saved) {
                        if (typeof updateSearchIndex === 'function' && newAlgorithmData && algorithmId !== undefined) {
                            console.log(`Updating search index for algorithm ID: ${algorithmId}, section: ${section}`);
                            await updateSearchIndex(
                                'algorithms',
                                algorithmId,
                                newAlgorithmData,
                                'update',
                                oldAlgorithmData
                            ).catch(indexError => {
                                console.error(`Error updating search index during algorithm ${algorithmId} save:`, indexError);
                                showNotification("Ошибка обновления поискового индекса.", "warning");
                            });
                        } else {
                            console.warn(`Could not update search index after saving algorithm ${algorithmId} - function, data or ID missing. ID: ${algorithmId}, Data:`, newAlgorithmData);
                        }

                        showNotification("Алгоритм успешно сохранен.");
                        initialEditState = null;
                        document.getElementById('editModal').classList.add('hidden');
                    } else {
                        showNotification("Не удалось сохранить изменения в базе данных.", "error");
                    }
                } else if (!updateSuccessful) {
                    showNotification("Не удалось обновить данные алгоритма в памяти.", "error");
                }

            } catch (error) {
                console.error(`Error during saving/indexing algorithm ${algorithmId}:`, error);
                showNotification("Ошибка при сохранении данных.", "error");
            }
        }


        function getSectionName(section) {
            switch (section) {
                case 'program': return 'Программа 1С';
                case 'skzi': return 'СКЗИ';
                case 'webReg': return 'Веб-Регистратор';
                default: return 'Основной';
            }
        }


        function showAddModal(section) {
            initialAddState = null;

            const addModal = document.getElementById('addModal');
            if (!addModal) {
                console.error("Модальное окно добавления #addModal не найдено.");
                return;
            }

            const addModalTitle = document.getElementById('addModalTitle');
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const containerId = 'newSteps';
            const newStepsContainer = document.getElementById(containerId);

            if (!addModalTitle || !newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer) {
                console.error("Show Add Modal failed: Missing required elements.");
                return;
            }

            addModalTitle.textContent = 'Новый алгоритм для раздела: ' + getSectionName(section);
            newAlgorithmTitle.value = '';
            newAlgorithmDesc.value = '';

            newStepsContainer.className = 'space-y-4';

            newStepsContainer.innerHTML = `
        <div class="edit-step p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4">
            ${createStepElementHTML(1, false)}
        </div>
    `;

            const firstDeleteBtn = newStepsContainer.querySelector('.delete-step');
            if (firstDeleteBtn) {
                attachDeleteListener(firstDeleteBtn, newStepsContainer, containerId);
            }

            addModal.dataset.section = section;

            captureInitialAddState();

            addModal.classList.remove('hidden');
        }


        function addNewStep() {
            const containerId = 'newSteps';
            const newStepsContainer = document.getElementById(containerId);
            if (!newStepsContainer) return;

            const stepCount = newStepsContainer.children.length;

            const stepDiv = document.createElement('div');
            stepDiv.className = 'edit-step p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm';
            stepDiv.innerHTML = createStepElementHTML(stepCount + 1, false);

            const deleteBtn = stepDiv.querySelector('.delete-step');
            if (deleteBtn) {
                attachDeleteListener(deleteBtn, newStepsContainer, containerId);
            }

            newStepsContainer.appendChild(stepDiv);
        }


        async function saveNewAlgorithm() {
            const addModal = document.getElementById('addModal');
            const section = addModal?.dataset.section;
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');

            if (!addModal || !section || !newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer) {
                console.error("Save New Algorithm failed: Missing required elements or data attributes.");
                showNotification("Ошибка: Не удалось сохранить новый алгоритм.", "error");
                return;
            }
            if (section === 'main') {
                console.error("Attempted to add 'main' algorithm via saveNewAlgorithm.");
                showNotification("Нельзя добавить главный алгоритм таким способом.", "error");
                return;
            }


            const title = newAlgorithmTitle.value.trim();
            const description = newAlgorithmDesc.value.trim();

            if (!title) {
                showNotification('Пожалуйста, введите название алгоритма', 'error');
                return;
            }

            const { steps } = extractStepsData(newStepsContainer);

            if (steps.length === 0) {
                showNotification('Пожалуйста, добавьте хотя бы один шаг', 'error');
                return;
            }

            const id = `${section}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const newAlgorithm = {
                id,
                title,
                description,
                steps
            };

            if (!algorithms[section]) {
                algorithms[section] = [];
            }
            algorithms[section].push(newAlgorithm);

            try {
                const saved = await saveDataToIndexedDB();

                if (saved) {
                    if (typeof renderAlgorithmCards === 'function') {
                        renderAlgorithmCards(section);
                    }

                    if (typeof updateSearchIndex === 'function') {
                        try {
                            console.log(`Updating search index (add) for new algorithm ID: ${newAlgorithm.id}`);
                            await updateSearchIndex(
                                'algorithms',
                                newAlgorithm.id,
                                newAlgorithm,
                                'add'
                            );
                        } catch (indexError) {
                            console.error(`Error updating search index for new algorithm ${newAlgorithm.id}:`, indexError);
                            showNotification("Ошибка обновления поискового индекса.", "warning");
                        }
                    } else {
                        console.warn("updateSearchIndex function not available for new algorithm.");
                    }

                    showNotification("Новый алгоритм успешно добавлен и сохранен.");
                    initialAddState = null;
                    addModal.classList.add('hidden');
                } else {
                    showNotification("Не удалось сохранить алгоритм в базе данных.", "error");
                    const indexToRemove = algorithms[section].findIndex(algo => algo.id === id);
                    if (indexToRemove > -1) {
                        algorithms[section].splice(indexToRemove, 1);
                    }
                }
            } catch (error) {
                console.error("Error saving new algorithm to IndexedDB:", error);
                showNotification("Ошибка при сохранении нового алгоритма.", "error");
                const indexToRemove = algorithms[section].findIndex(algo => algo.id === id);
                if (indexToRemove > -1) {
                    algorithms[section].splice(indexToRemove, 1);
                }
            }
        }


        // ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
        async function appInit() {
            let dbInitialized = false;
            try {
                await initDB();
                dbInitialized = true;

                await Promise.all([
                    loadCategoryInfo(),
                    loadFromIndexedDB()
                ]);

            } catch (error) {
                console.error("Error during appInit data loading:", error);
                if (!dbInitialized) {
                    console.warn("DB init failed. Application might not work correctly.");
                    showNotification("Критическая ошибка: Не удалось инициализировать базу данных.", "error");
                } else {
                    console.warn("Error loading from DB, using defaults where possible.");
                }
                if (!algorithms || !algorithms.main || !algorithms.main.steps || algorithms.main.steps.length === 0) {
                    console.error("CRITICAL: Main algorithm data is missing after init. Applying defaults.");
                    const defaultAlgo = {};
                    algorithms = { main: defaultAlgo, program: [], skzi: [], webReg: [] };
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                }
            }


            console.log("Initializing UI systems...");
            initSearchSystem();
            initBookmarkSystem();
            initCibLinkSystem();
            initViewToggles();
            initReglamentsSystem();
            initClientDataSystem();
            initExternalLinksSystem();
            initUICustomization();

            console.log("UI Systems Initialized.");
            return dbInitialized;
        }


        document.addEventListener('DOMContentLoaded', async () => {
            const loadingOverlay = document.getElementById('loadingOverlay');
            const appContent = document.getElementById('appContent');

            if (!loadingOverlay || !appContent) {
                console.error("Критическая ошибка: Не найден оверлей загрузки (#loadingOverlay) или контейнер приложения (#appContent)!");
                if (loadingOverlay) {
                    loadingOverlay.innerHTML = '<div class="text-center text-red-500 p-4"><i class="fas fa-exclamation-triangle text-3xl mb-2"></i><p>Ошибка инициализации интерфейса.</p></div>';
                    loadingOverlay.style.display = 'flex';
                } else {
                    alert("Критическая ошибка загрузки интерфейса приложения. Пожалуйста, обновите страницу.");
                }
                return;
            }

            try {
                console.log("Инициализация приложения...");
                const dbReady = await appInit();
                console.log("Инициализация appInit завершена. Статус БД:", dbReady);

                initClearDataFunctionality();
                initFullscreenToggles();
                initReloadButton();

                if (dbReady) {
                    if (typeof applyUISettings === 'function') {
                        await applyUISettings();
                    } else {
                        console.error("Функция applyUISettings не определена!");
                        setTheme('auto');
                        document.documentElement.style.fontSize = '100%';
                        document.documentElement.style.removeProperty('--color-primary');
                        document.documentElement.style.removeProperty('--border-radius');
                        document.documentElement.style.removeProperty('--content-spacing');
                    }
                } else {
                    console.warn("База данных не готова. Пропуск применения настроек UI из БД. Применяются настройки по умолчанию.");
                    setTheme('auto');
                    document.documentElement.style.fontSize = '100%';
                    document.documentElement.style.removeProperty('--color-primary');
                    document.documentElement.style.removeProperty('--border-radius');
                    document.documentElement.style.removeProperty('--content-spacing');
                }

                appContent.classList.remove('hidden');
                loadingOverlay.style.display = 'none';

                if (typeof setupTabsOverflow === 'function') {
                    setupTabsOverflow();
                } else {
                    console.warn("Функция setupTabsOverflow не найдена");
                }

                const mainContentContainer = document.getElementById('mainContent');
                if (mainContentContainer) {
                    mainContentContainer.addEventListener('click', (event) => {
                        const link = event.target.closest('#noInnLink');
                        if (link) {
                            event.preventDefault();
                            if (typeof showNoInnModal === 'function') {
                                showNoInnModal();
                            } else {
                                console.error("Функция showNoInnModal не определена");
                            }
                        }
                    });
                } else {
                    console.error("Контейнер #mainContent не найден для делегирования событий '#noInnLink'.");
                }

            } catch (error) {
                console.error("КРИТИЧЕСКАЯ ОШИБКА во время инициализации приложения:", error);

                loadingOverlay.innerHTML = `
            <div class="text-center text-red-600 dark:text-red-400 p-4">
                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                <p class="text-lg font-medium">Ошибка загрузки приложения!</p>
                <p class="text-sm mt-2">Не удалось загрузить необходимые данные или настройки.</p>
                <p class="text-xs mt-4">Детали ошибки: ${error.message || 'Неизвестная ошибка'}</p>
                <p class="text-sm mt-2">Пожалуйста, попробуйте обновить страницу (F5) или проверьте консоль разработчика (F12) для получения дополнительной информации.</p>
            </div>`;
                loadingOverlay.style.display = 'flex';
                if (appContent) {
                    appContent.classList.add('hidden');
                }
                if (typeof showNotification === 'function') {
                    showNotification("Критическая ошибка при инициализации приложения. Обновите страницу.", "error", 10000);
                }
            }
        });




        // СИСТЕМА ПОИСКА
        function initSearchSystem() {
            const debounce = (func, delay) => {
                let timeoutId;
                return (...args) => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        func.apply(this, args);
                    }, delay);
                };
            };

            const searchInput = document.getElementById('searchInput');
            const searchResults = document.getElementById('searchResults');
            const toggleAdvancedSearchBtn = document.getElementById('toggleAdvancedSearch');
            const advancedSearchOptions = document.getElementById('advancedSearchOptions');

            if (!searchInput || !searchResults || !toggleAdvancedSearchBtn || !advancedSearchOptions) {
                console.error('Search system initialization failed: one or more required elements not found.');
                return;
            }

            const toggleResultsVisibility = () => {
                searchResults.classList.toggle('hidden', !searchInput.value);
            };

            const executeSearch = async () => {
                const query = searchInput.value;
                if (!query) {
                    searchResults.classList.add('hidden');
                    return;
                }

                searchResults.classList.remove('hidden');

                try {
                    await performSearch(query);
                } catch (error) {
                    console.error('Search failed:', error);
                } finally {
                }
            };

            const debouncedSearch = debounce(executeSearch, 300);


            searchInput.addEventListener('focus', toggleResultsVisibility);

            searchInput.addEventListener('input', () => {
                toggleResultsVisibility();
                debouncedSearch();
            });

            document.addEventListener('click', (event) => {
                const isClickInsideSearch = searchInput.contains(event.target) || searchResults.contains(event.target);
                if (!isClickInsideSearch) {
                    searchResults.classList.add('hidden');
                }
            });

            toggleAdvancedSearchBtn.addEventListener('click', () => {
                const isHidden = advancedSearchOptions.classList.toggle('hidden');
                toggleAdvancedSearchBtn.innerHTML = isHidden
                    ? '<i class="fas fa-cog mr-1"></i>Параметры поиска'
                    : '<i class="fas fa-times mr-1"></i>Скрыть параметры';
            });

            const advancedSearchControls = document.querySelectorAll('.search-section, .search-field');
            advancedSearchControls.forEach(control => {
                control.addEventListener('change', () => {
                    debouncedSearch();
                });
            });
        }


        function convertItemToSearchResult(storeName, itemId, item, score) {
            if (!item) return null;

            let finalItemId = itemId;
            let finalSection = storeName;

            if (storeName === 'algorithms') {
                finalItemId = itemId;
                if (finalItemId === 'main') {
                    finalSection = 'main';
                } else if (typeof finalItemId === 'string') {
                    const parts = finalItemId.split('-');
                    if (parts.length > 1 && ['program', 'skzi', 'webReg'].includes(parts[0])) {
                        finalSection = parts[0];
                    } else {
                        const knownPrefixes = ['program', 'skzi', 'webReg'];
                        let foundPrefix = false;
                        for (const prefix of knownPrefixes) {
                            if (finalItemId.startsWith(prefix)) {
                                finalSection = prefix;
                                foundPrefix = true;
                                break;
                            }
                        }
                        if (!foundPrefix) {
                            console.warn(`[convertItemToSearchResult] Не удалось определить секцию для algorithm ID: ${finalItemId}. Используется 'program' как fallback.`);
                            finalSection = 'program';
                        }
                    }
                } else {
                    console.error(`[convertItemToSearchResult] Некорректный тип ID (${typeof finalItemId}) для алгоритма:`, finalItemId);
                    return null;
                }
                if (!item.id && finalItemId !== 'main') {
                    item.id = finalItemId;
                } else if (finalItemId === 'main' && !item.id) {
                    item.id = 'main';
                }


            } else if (storeName === 'clientData') {
                finalItemId = 'current';
                finalSection = 'main';
                if (!item.id) item.id = finalItemId;

            } else if (storeName === 'bookmarkFolders') {
                finalItemId = item.id;
                finalSection = 'bookmarks';

            } else {
                finalSection = storeName;
                finalItemId = item.id;
                if (finalItemId === undefined || finalItemId === null) {
                    finalItemId = itemId;
                    if (finalItemId === undefined || finalItemId === null) {
                        console.warn("[convertItemToSearchResult] Item ID missing for store", storeName, item);
                        return null;
                    }
                }
                if (!item.id && finalItemId) item.id = finalItemId;
            }

            let result = {
                section: finalSection,
                type: '',
                id: finalItemId,
                title: item.title || item.name || '',
                description: item.description || '',
                score: score || 0,
            };

            switch (storeName) {
                case 'algorithms':
                    result.type = 'algorithm';
                    result.title = item.title || (itemId === 'main' ? algorithms.main.title : `Алгоритм ${itemId}`);
                    result.description = item.description || item.steps?.[0]?.description || 'Нет описания шагов';
                    break;
                case 'links':
                    result.type = 'link';
                    result.title = item.title || `Ссылка 1С #${item.id}`;
                    result.description = item.description || item.link || 'Нет описания или адреса';
                    break;
                case 'bookmarks':
                    result.type = 'bookmark';
                    result.title = item.title || `Закладка #${item.id}`;
                    result.description = item.description || item.url || 'Нет описания или URL';
                    if (!item.url && item.description) {
                        result.type = 'bookmark_note';
                        result.title = item.title || `Заметка #${item.id}`;
                    }
                    break;
                case 'reglaments':
                    result.type = 'reglament';
                    result.title = item.title || `Регламент #${item.id}`;
                    const categoryInfo = item.category ? categoryDisplayInfo[item.category] : null;
                    const categoryName = categoryInfo ? categoryInfo.title : (item.category || 'Без категории');
                    const contentPreview = item.content?.substring(0, 100).replace(/\s+/g, ' ').trim() + (item.content?.length > 100 ? '...' : '');
                    result.description = `Категория: ${categoryName}. ${contentPreview || 'Нет содержимого'}`;
                    break;
                case 'extLinks':
                    result.type = 'extLink';
                    result.title = item.title || `Ресурс #${item.id}`;
                    result.description = item.description || item.url || 'Нет описания или URL';
                    break;
                case 'clientData':
                    result.type = 'clientNote';
                    result.title = 'Заметки по клиенту';
                    result.description = item.notes ? (item.notes.substring(0, 100).replace(/\s+/g, ' ').trim() + (item.notes.length > 100 ? '...' : '')) : 'Нет заметок';
                    break;
                case 'bookmarkFolders':
                    result.type = 'bookmarkFolder';
                    result.title = `Папка: ${item.name || 'Без названия'}`;
                    result.description = `Нажмите для фильтрации по папке`;
                    break;
                default:
                    console.warn(`[convertItemToSearchResult] Unknown storeName: ${storeName}. Using fallback type.`);
                    result.type = storeName;
                    result.title = item.title || item.name || `Запись ID: ${finalItemId}`;
                    result.description = item.description || JSON.stringify(item).substring(0, 100) + '...';
                    break;
            }

            if (result.description && typeof result.description === 'string') {
                result.description = result.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }

            if (!result.title) {
                console.warn(`[convertItemToSearchResult] Result ended up with no title:`, result);
                result.title = `(${result.type} ${result.id})`;
            }

            return result;
        }


        function navigateToResult(result) {
            if (!result || typeof result !== 'object' || !result.section || !result.type || result.id === undefined) {
                console.error("[navigateToResult] Invalid or incomplete result object provided:", result);
                showNotification("Ошибка навигации: некорректные данные результата.", "error");
                return;
            }

            const { section, type, id, title } = result;
            console.log(`[navigateToResult] Attempting navigation: section=${section}, type=${type}, id=${id}, title=${title}`);

            if (type === 'section_link') {
                console.log(`[navigateToResult] Section link detected for section ID: ${section}`);
                if (typeof setActiveTab === 'function') {
                    try {
                        setActiveTab(section);
                        const contentElement = document.getElementById(`${section}Content`);
                        contentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        console.log(`[navigateToResult] Switched to tab ${section} and scrolled.`);
                    } catch (tabError) {
                        console.error(`[navigateToResult] Error switching or scrolling to tab ${section}:`, tabError);
                        showNotification(`Ошибка при переходе в раздел "${title}"`, "error");
                    }
                } else {
                    console.error("[navigateToResult] 'setActiveTab' function not found for section link.");
                    showNotification("Ошибка интерфейса: Не удалось переключить вкладку.", "error");
                }
                return;
            }

            let targetTabId = section;
            if (type === 'bookmarkFolder') targetTabId = 'bookmarks';
            if (type === 'clientNote') targetTabId = 'main';
            if (!tabsConfig.some(tab => tab.id === targetTabId)) {
                console.error(`[navigateToResult] Invalid targetTabId determined: ${targetTabId} for result:`, result);
                showNotification(`Ошибка навигации: Неизвестный раздел "${targetTabId}"`, "error");
                return;
            }

            try {
                if (typeof setActiveTab === 'function') {
                    setActiveTab(targetTabId);
                    console.log(`[navigateToResult] Switched to tab: ${targetTabId} for item type: ${type}`);
                } else {
                    console.error("[navigateToResult] 'setActiveTab' function not found.");
                    showNotification("Ошибка интерфейса: Не удалось переключить вкладку.", "error");
                    return;
                }
            } catch (error) {
                console.error(`[navigateToResult] Error switching tab to ${targetTabId}:`, error);
                showNotification("Произошла ошибка при переключении вкладки.", "error");
            }

            function scrollToAndHighlight(selector, elementId, targetSectionId) {
                const SCROLL_DELAY_MS = 150;
                const HIGHLIGHT_DURATION_MS = 2500;
                const HIGHLIGHT_BASE_CLASSES = ['outline', 'outline-4', 'outline-offset-2', 'rounded-md', 'transition-all', 'duration-300'];
                const HIGHLIGHT_COLOR_CLASSES = ['outline-yellow-400', 'dark:outline-yellow-300'];
                const HIGHLIGHT_BG_CLASSES = ['bg-yellow-100/50', 'dark:bg-yellow-900/30'];

                const notify = typeof showNotification === 'function' ? showNotification : console.warn;

                setTimeout(() => {
                    const activeContent = document.querySelector(`.tab-content:not(.hidden)`);
                    if (!activeContent) {
                        console.error(`[scrollToAndHighlight] Could not find active tab content container after delay.`);
                        notify("Ошибка: Не найден активный контейнер вкладки.", "error");
                        return;
                    }

                    if (!activeContent.id || !activeContent.id.startsWith(targetSectionId)) {
                        console.warn(`[scrollToAndHighlight] Active tab (${activeContent.id}) doesn't match target (${targetSectionId}). Skipping highlight/scroll.`);
                        return;
                    }

                    const fullSelector = `${selector}[data-id="${elementId}"]`;
                    let element = null;
                    try {
                        element = activeContent.querySelector(fullSelector);
                        console.log(`[scrollToAndHighlight] Searching for selector: "${fullSelector}" within active content "${activeContent.id}"`);
                    } catch (e) {
                        console.error(`[scrollToAndHighlight] Invalid selector: "${fullSelector}". Error:`, e);
                        notify("Ошибка: Не удалось найти элемент (некорректный селектор).", "error");
                        return;
                    }

                    if (element) {
                        console.log(`[scrollToAndHighlight] Element found. Scrolling and highlighting.`);
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        element.classList.add(...HIGHLIGHT_BASE_CLASSES, ...HIGHLIGHT_COLOR_CLASSES, ...HIGHLIGHT_BG_CLASSES);

                        setTimeout(() => {
                            element.classList.remove(...HIGHLIGHT_BASE_CLASSES, ...HIGHLIGHT_COLOR_CLASSES, ...HIGHLIGHT_BG_CLASSES);
                        }, HIGHLIGHT_DURATION_MS);

                    } else {
                        console.warn(`[scrollToAndHighlight] Element '${fullSelector}' not found in section '${targetSectionId}'. Scrolling to section container.`);
                        const elementName = document.querySelector(`[data-id="${elementId}"] h3`)?.textContent || `элемент с ID ${elementId}`;
                        notify(`Элемент "${elementName}" не найден. Прокрутка к началу раздела.`, "warning");

                        const getSectionContainerSelector = (sec) => {
                            switch (sec) {
                                case 'main': return '#mainAlgorithm';
                                case 'program': return '#programAlgorithms';
                                case 'skzi': return '#skziAlgorithms';
                                case 'webReg': return '#webRegAlgorithms';
                                case 'links': return '#linksContainer';
                                case 'extLinks': return '#extLinksContainer';
                                case 'reglaments': return '#reglamentsList:not(.hidden) #reglamentsContainer';
                                case 'bookmarks': return '#bookmarksContainer';
                                default: return `#${sec}Content > div:first-child`;
                            }
                        };
                        const sectionContainerSelector = getSectionContainerSelector(targetSectionId);
                        const sectionContainer = activeContent.querySelector(sectionContainerSelector);
                        if (sectionContainer) {
                            sectionContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else {
                            console.error(`[scrollToAndHighlight] Section container not found ('${sectionContainerSelector}'). Scrolling to top of tab.`);
                            activeContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            notify(`Не удалось найти контейнер раздела "${targetSectionId}".`, "error");
                        }
                    }
                }, SCROLL_DELAY_MS);
            }

            try {
                switch (type) {
                    case 'algorithm':
                        if (section === 'main' && id === 'main') {
                            console.log("[navigateToResult] Main algorithm. Scrolling to main content.");
                            document.getElementById('mainContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else {
                            console.log(`[navigateToResult] Algorithm type. Opening detail modal for ID ${id} in section ${section}.`);
                            if (typeof showAlgorithmDetail === 'function') {
                                const algoDataInMemory = algorithms?.[section]?.find(a => String(a?.id) === String(id));

                                if (algoDataInMemory) {
                                    console.log(`[navigateToResult] Found algorithm data in memory for ${id}. Showing modal.`);
                                    showAlgorithmDetail(algoDataInMemory, section);
                                } else {
                                    console.warn(`[navigateToResult] Algo data for ${id} not in memory. Fetching from DB...`);
                                    getFromIndexedDB('algorithms', 'all')
                                        .then(container => {
                                            const dbAlgoData = container?.data?.[section]?.find(a => String(a?.id) === String(id));
                                            if (dbAlgoData) {
                                                console.log(`[navigateToResult] Found algo data in DB for ${id}. Showing modal.`);
                                                showAlgorithmDetail(dbAlgoData, section);
                                            } else {
                                                console.error(`[navigateToResult] Could not find algo data for ${id} (section ${section}) even in DB.`);
                                                showNotification(`Не удалось найти данные алгоритма ${id}.`, "error");
                                                scrollToAndHighlight('.algorithm-card', id, section);
                                            }
                                        })
                                        .catch(err => {
                                            console.error(`[navigateToResult] Error fetching algo data from DB for ${id}:`, err);
                                            showNotification("Ошибка загрузки данных алгоритма.", "error");
                                            scrollToAndHighlight('.algorithm-card', id, section);
                                        });
                                }
                            } else {
                                console.error("[navigateToResult] 'showAlgorithmDetail' function not found. Scrolling to card.");
                                showNotification("Функция деталей алгоритма не найдена.", "warning");
                                scrollToAndHighlight('.algorithm-card', id, section);
                            }
                        }
                        break;

                    case 'reglament':
                        console.log("[navigateToResult] Reglament type. Showing detail modal for ID:", id);
                        if (typeof showReglamentDetail === 'function') {
                            showReglamentDetail(id);
                        } else {
                            console.warn("[navigateToResult] 'showReglamentDetail' function not found. Scrolling.");
                            showNotification("Функция просмотра регламента не найдена.", "warning");
                            scrollToAndHighlight('.reglament-item', id, section);
                        }
                        break;

                    case 'link':
                        console.log(`[navigateToResult] CIB Link type. Scrolling to item ${id}.`);
                        scrollToAndHighlight('.cib-link-item', id, section);
                        break;

                    case 'extLink':
                        console.log(`[navigateToResult] External Link type. Scrolling to item ${id}.`);
                        scrollToAndHighlight('.ext-link-item', id, section);
                        break;

                    case 'bookmark':
                        console.log(`[navigateToResult] Bookmark type. Scrolling to item ${id}.`);
                        scrollToAndHighlight('.bookmark-item', id, section);
                        break;

                    case 'bookmarkFolder':
                        console.log(`[navigateToResult] Bookmark folder type. Filtering by folder ${id}.`);
                        const folderFilterSelect = document.getElementById('bookmarkFolderFilter');
                        const bookmarksContainer = document.getElementById('bookmarksContainer');
                        if (folderFilterSelect && typeof filterBookmarks === 'function' && bookmarksContainer) {
                            folderFilterSelect.value = id;
                            filterBookmarks();
                            bookmarksContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            showNotification(`Отфильтровано по папке: ${title.replace('Папка: ', '')}`, "info");
                        } else {
                            console.error("[navigateToResult] Cannot filter by bookmark folder. Elements/function missing.");
                            showNotification("Не удалось отфильтровать по папке.", "error");
                            bookmarksContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        break;

                    case 'clientNote':
                        console.log("[navigateToResult] Client Note type. Scrolling to notes field.");
                        const clientNotesField = document.getElementById('clientNotes');
                        if (clientNotesField) {
                            clientNotesField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            clientNotesField.focus({ preventScroll: true });
                            clientNotesField.classList.add('highlight-search-result');
                            setTimeout(() => clientNotesField.classList.remove('highlight-search-result'), HIGHLIGHT_DURATION_MS);
                        } else {
                            console.error("[navigateToResult] Client notes field #clientNotes not found.");
                            showNotification("Не удалось найти поле заметок.", "error");
                        }
                        break;

                    default:
                        console.warn(`[navigateToResult] Unknown result type: '${type}'. Scrolling to top of tab ${targetTabId}.`);
                        showNotification(`Неизвестный тип результата: ${type}.`, "warning");
                        document.querySelector(`#${targetTabId}Content`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        break;
                }
            } catch (error) {
                console.error(`[navigateToResult] Error processing result type '${type}' for ID '${id}' in section '${section}':`, error);
                showNotification("Произошла ошибка при переходе к результату.", "error");
            }
        }


        function tokenize(text) {
            if (!text || typeof text !== 'string') { return []; }
            const cleanedText = text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, '');
            const words = cleanedText.split(/\s+/).filter(word => word.length > 0);
            const tokens = new Set();
            const MIN_TOKEN_LENGTH = 3;

            words.forEach(word => {
                if (word.length >= MIN_TOKEN_LENGTH) {
                    for (let i = MIN_TOKEN_LENGTH; i <= word.length; i++) {
                        tokens.add(word.substring(0, i));
                    }
                    tokens.add(word);
                }
            });
            if (text.toLowerCase().includes('подписания')) {
                console.log(`[DEBUG tokenize] Токены для текста, содержащего 'подписания':`, Array.from(tokens));
                if (tokens.has('подписания') || tokens.has('подписани') || tokens.has('подписан')) {
                    console.log(`[DEBUG tokenize] Токен 'подписания' или его префиксы СГЕНЕРИРОВАНЫ.`);
                } else {
                    console.error(`[DEBUG tokenize] Токен 'подписания' или его префиксы НЕ СГЕНЕРИРОВАНЫ!`);
                }
            }
            return Array.from(tokens);
        }


        function getTextForItem(storeName, itemData) {
            if (!itemData) return '';
            let texts = [];

            try {
                switch (storeName) {
                    case 'algorithms':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.description) texts.push(itemData.description);
                        if (itemData.steps && Array.isArray(itemData.steps)) {
                            itemData.steps.forEach(step => {
                                if (step.title) texts.push(step.title);
                                if (step.description) texts.push(step.description);
                                if (typeof step.example === 'string') {
                                    texts.push(step.example);
                                } else if (typeof step.example === 'object' && step.example !== null) {
                                    if (step.example.type === 'list') {
                                        if (step.example.intro) texts.push(step.example.intro);
                                        if (Array.isArray(step.example.items)) {
                                            step.example.items.forEach(listItem => {
                                                if (typeof listItem === 'string') {
                                                    texts.push(listItem.replace(/<[^>]*>/g, ' ').trim());
                                                }
                                            });
                                        }
                                    } else if (typeof step.example === 'string') {
                                        texts.push(step.example);
                                    }
                                }
                            });
                        }
                        break;
                    case 'links':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.link) texts.push(itemData.link);
                        if (itemData.description) texts.push(itemData.description);
                        break;
                    case 'bookmarks':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.url) texts.push(itemData.url);
                        if (itemData.description) texts.push(itemData.description);
                        break;
                    case 'reglaments':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.content) texts.push(itemData.content);
                        break;
                    case 'extLinks':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.url) texts.push(itemData.url);
                        if (itemData.description) texts.push(itemData.description);
                        break;
                    case 'clientData':
                        if (itemData.notes) texts.push(itemData.notes);
                        break;
                    case 'bookmarkFolders':
                        if (itemData.name) texts.push(itemData.name);
                        break;
                    default:
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.name) texts.push(itemData.name);
                        if (itemData.description) texts.push(itemData.description);
                        if (itemData.content) texts.push(itemData.content);
                        break;
                }
            } catch (error) {
                console.error(`Error extracting text from item in store ${storeName}:`, itemData, error);
            }
            return texts.filter(t => typeof t === 'string' && t.trim()).join(' ').replace(/\s+/g, ' ');
        }


        function getAlgorithmText(algoData) {
            const algoIdForLog = algoData?.id || 'unknown_id';
            if (algoIdForLog === 'skzi1') {
                console.log(`[DEBUG getAlgorithmText] НАЧАЛО извлечения для skzi1. Данные:`, JSON.parse(JSON.stringify(algoData)));
            }

            if (!algoData) return '';
            let texts = [];

            try {
                if (algoData.title) { texts.push(algoData.title); }
                if (algoData.description) { texts.push(algoData.description); }

                if (algoData.steps && Array.isArray(algoData.steps)) {
                    algoData.steps.forEach((step, index) => {
                        if (!step) return;
                        if (step.title) { texts.push(step.title); }
                        if (step.description) { texts.push(step.description); }
                        if (step.example) {
                            if (typeof step.example === 'string') {
                                texts.push(step.example);
                            } else if (typeof step.example === 'object' && step.example !== null) {
                                if (step.example.type === 'list') {
                                    if (step.example.intro) texts.push(step.example.intro);
                                    if (Array.isArray(step.example.items)) {
                                        step.example.items.forEach(listItem => {
                                            let itemText = '';
                                            if (typeof listItem === 'string') { itemText = listItem; }
                                            else if (typeof listItem === 'object' && listItem !== null && listItem.text) { itemText = String(listItem.text); }
                                            itemText = itemText.replace(/<[^>]*>/g, ' ').trim();
                                            if (itemText) texts.push(itemText);
                                        });
                                    }
                                } else if (step.example.text) { texts.push(String(step.example.text).replace(/<[^>]*>/g, ' ').trim()); }
                                else { Object.values(step.example).forEach(val => { if (typeof val === 'string') texts.push(val.replace(/<[^>]*>/g, ' ').trim()); }); }
                            }
                        }
                    });
                }
            } catch (error) { console.error(`[getAlgorithmText] Ошибка при обработке алгоритма ID ${algoIdForLog}:`, error); }

            const fullText = texts.filter(t => typeof t === 'string' && t.trim()).join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

            if (algoIdForLog === 'skzi1') {
                console.log(`[DEBUG getAlgorithmText] КОНЕЦ извлечения для skzi1. Итоговый текст (длина ${fullText.length}): "${fullText}"`);
                if (fullText.toLowerCase().includes('подписания')) {
                    console.log(`[DEBUG getAlgorithmText] Слово "подписания" НАЙДЕНО в тексте для skzi1!`);
                } else {
                    console.error(`[DEBUG getAlgorithmText] Слово "подписания" НЕ НАЙДЕНО в тексте для skzi1!`);
                }
            }
            return fullText;
        }


        async function performSearch(query) {
            const searchResultsContainer = document.getElementById('searchResults');
            const searchInput = document.getElementById('searchInput');

            const loadingIndicator = '<div class="p-3 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Идет поиск...</div>';
            const noResultsMessage = '<div class="p-3 text-center text-gray-500">Ничего не найдено</div>';
            const errorMessage = '<div class="p-3 text-center text-red-500">Ошибка во время поиска.</div>';
            const dbErrorMessage = '<div class="p-3 text-center text-red-500">Ошибка: База данных не доступна.</div>';
            const minLengthMessage = '<div class="p-3 text-center text-gray-500">Введите минимум 3 символа...</div>';

            if (!db) { console.error("[performSearch] DB not ready"); return; }
            if (!searchResultsContainer) { console.error("[performSearch] searchResultsContainer not found"); return; }

            const normalizedQuery = query.trim().toLowerCase().replace(/ё/g, 'е');
            if (!normalizedQuery) { searchResultsContainer.innerHTML = ''; searchResultsContainer.classList.add('hidden'); return; }

            const MIN_SEARCH_LENGTH = 3;
            if (normalizedQuery.length < MIN_SEARCH_LENGTH) { searchResultsContainer.innerHTML = minLengthMessage.replace('3', String(MIN_SEARCH_LENGTH)); searchResultsContainer.classList.remove('hidden'); return; }

            searchResultsContainer.innerHTML = loadingIndicator;
            searchResultsContainer.classList.remove('hidden');
            console.log(`[performSearch] Начало поиска по запросу: "${normalizedQuery}"`);

            const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length >= 1);
            if (queryWords.length === 0) { searchResultsContainer.innerHTML = noResultsMessage; return; }
            console.log(`[performSearch] Query words:`, queryWords);

            let candidateDocs = new Map();
            let isFirstWord = true;

            try {
                const transaction = db.transaction(['searchIndex'], 'readonly');
                const indexStore = transaction.objectStore('searchIndex');

                for (const word of queryWords) {
                    const currentWordDocScores = new Map();
                    const range = IDBKeyRange.bound(word, word + '\uffff');
                    const request = indexStore.openCursor(range);

                    await new Promise((resolve, reject) => {
                        request.onsuccess = e => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const entry = cursor.value;
                                const matchedToken = cursor.key;
                                const tokenMatchBonus = (matchedToken === word) ? 50 : 0;
                                if (entry && Array.isArray(entry.refs)) {
                                    entry.refs.forEach(ref => {
                                        if (ref.store && ref.id !== undefined && ref.id !== null) {
                                            const docKey = `${ref.store}:${ref.id}`;
                                            const scoreIncrement = 1 + Math.pow(matchedToken.length, 1.1) + tokenMatchBonus;
                                            currentWordDocScores.set(docKey, Math.max(currentWordDocScores.get(docKey) || 0, scoreIncrement));
                                        }
                                    });
                                }
                                cursor.continue();
                            } else { resolve(); }
                        };
                        request.onerror = e => reject(e.target.error);
                    });

                    console.log(`[performSearch] Word "${word}" matched ${currentWordDocScores.size} documents. Keys: ${JSON.stringify(Array.from(currentWordDocScores.keys()))}`);

                    if (isFirstWord) {
                        currentWordDocScores.forEach((score, docKey) => {
                            const refParts = docKey.split(':');
                            if (refParts.length === 2) {
                                candidateDocs.set(docKey, { ref: { store: refParts[0], id: refParts[1] }, score: score });
                            }
                        });
                        isFirstWord = false;
                        console.log(`[performSearch] Initial candidates set (${candidateDocs.size}): ${JSON.stringify(Array.from(candidateDocs.keys()))}`);
                    } else {
                        console.log(`[performSearch] Intersecting ${candidateDocs.size} candidates with ${currentWordDocScores.size} results for "${word}"...`);
                        const previousCandidatesKeys = new Set(candidateDocs.keys());
                        let keptCount = 0;
                        let removedCount = 0;

                        previousCandidatesKeys.forEach(docKey => {
                            if (currentWordDocScores.has(docKey)) {
                                const candidateData = candidateDocs.get(docKey);
                                if (candidateData) {
                                    const scoreToAdd = currentWordDocScores.get(docKey);
                                    candidateData.score += scoreToAdd;
                                    keptCount++;
                                }
                            } else {
                                candidateDocs.delete(docKey);
                                removedCount++;
                            }
                        });
                        console.log(`[performSearch] Intersection result: Kept ${keptCount}, Removed ${removedCount}. Remaining candidates: ${candidateDocs.size}`);
                    }

                    if (candidateDocs.size === 0) {
                        console.log(`[performSearch] No documents match all query words up to "${word}". Stopping word loop.`);
                        break;
                    }
                }

            } catch (error) {
                console.error('[performSearch] Ошибка запроса к searchIndex или обработки слов:', error);
                searchResultsContainer.innerHTML = errorMessage;
                return;
            }

            let finalDocRefs = Array.from(candidateDocs.values())
                .map(data => ({ ...data.ref, score: data.score }));
            console.log(`[performSearch] Found ${finalDocRefs.length} refs matching ALL query words.`);

            const selectedCheckboxes = new Set([...document.querySelectorAll('.search-section:checked')].map(cb => cb.value));
            const getSectionForResult = (ref) => {
                if (!ref) return null;
                if (ref.store === 'algorithms') {
                    if (ref.id === 'main') return 'main';
                    if (typeof ref.id === 'string') {
                        if (ref.id.startsWith('program')) return 'program';
                        if (ref.id.startsWith('skzi')) return 'skzi';
                        if (ref.id.startsWith('webReg')) return 'webReg';
                        if (/^[a-zA-Z]+[0-9]+$/.test(ref.id)) {
                            const potentialSection = ref.id.replace(/[0-9]+$/, '');
                            if (['program', 'skzi', 'webReg'].includes(potentialSection)) { return potentialSection; }
                        }
                    }
                    return 'program';
                }
                if (ref.store === 'bookmarkFolders') return 'bookmarks';
                if (ref.store === 'clientData') return 'main';
                return ref.store;
            };

            if (selectedCheckboxes.size > 0) {
                console.log("[performSearch] Применение фильтра по разделам. Выбраны:", Array.from(selectedCheckboxes));
                finalDocRefs = finalDocRefs.filter(ref => {
                    const resultSection = getSectionForResult(ref);
                    return resultSection && selectedCheckboxes.has(resultSection);
                });
                console.log(`[performSearch] После фильтра по разделам осталось ссылок: ${finalDocRefs.length}`);
            } else {
                console.log("[performSearch] Разделы для фильтрации не выбраны.");
            }

            if (finalDocRefs.length === 0) {
                searchResultsContainer.innerHTML = noResultsMessage;
                const sectionMatches = findSectionMatches(normalizedQuery);
                if (sectionMatches.length > 0) {
                    renderSearchResults(sectionMatches, searchResultsContainer);
                }
                return;
            }

            console.log(`[performSearch] Загрузка полных данных для ${finalDocRefs.length} отфильтрованных ссылок...`);
            const uniqueStores = new Set(finalDocRefs.map(ref => ref.store));
            const allFetchedData = new Map();
            const fetchPromises = [];

            for (const storeName of uniqueStores) {
                fetchPromises.push(new Promise(async (resolveStoreFetch) => {
                    const storeDataMap = new Map();
                    allFetchedData.set(storeName, storeDataMap);
                    try {
                        const transaction = db.transaction([storeName], 'readonly');
                        const store = transaction.objectStore(storeName);
                        const isAutoIncrement = store.autoIncrement;

                        if (storeName === 'algorithms' || storeName === 'clientData') {
                            const keyToFetch = storeName === 'algorithms' ? 'all' : 'current';
                            const request = store.get(keyToFetch);
                            request.onsuccess = e => { if (e.target.result) storeDataMap.set(keyToFetch, e.target.result); resolveStoreFetch(); };
                            request.onerror = e => { console.error(`[performSearch Fetch] Ошибка загрузки ${keyToFetch} из ${storeName}:`, e.target.error); resolveStoreFetch(); };
                        } else {
                            const idsForStore = finalDocRefs
                                .filter(ref => ref.store === storeName)
                                .map(ref => ref.id);

                            if (idsForStore.length > 0) {
                                const itemPromises = idsForStore.map(idFromRef => new Promise((resolveItem) => {
                                    let keyToGet = idFromRef;
                                    if (isAutoIncrement && typeof idFromRef === 'string' && !isNaN(parseInt(idFromRef, 10))) {
                                        keyToGet = parseInt(idFromRef, 10);
                                    }
                                    if (keyToGet === null || keyToGet === undefined || (typeof keyToGet === 'number' && isNaN(keyToGet))) {
                                        console.warn(`[performSearch Fetch] Невалидный ключ (${keyToGet}) для хранилища ${storeName}, пропуск ID из ref: ${idFromRef}`);
                                        resolveItem(); return;
                                    }
                                    const request = store.get(keyToGet);
                                    request.onsuccess = e => { if (e.target.result) storeDataMap.set(idFromRef, e.target.result); resolveItem(); };
                                    request.onerror = e => { console.error(`[performSearch Fetch] Ошибка загрузки ключа ${keyToGet} (ID из ref: ${idFromRef}) из ${storeName}:`, e.target.error); resolveItem(); };
                                }));
                                await Promise.all(itemPromises);
                            }
                            resolveStoreFetch();
                        }
                    } catch (error) { console.error(`[performSearch Fetch] Ошибка доступа к хранилищу ${storeName}:`, error); resolveStoreFetch(); }
                }));
            }
            await Promise.all(fetchPromises);
            console.log("[performSearch] Загрузка полных данных завершена.");

            console.log("[performSearch] Обработка загруженных данных...");
            const finalResults = [];
            finalDocRefs.forEach(ref => {
                const fetchedStoreData = allFetchedData.get(ref.store);
                if (!fetchedStoreData) return;
                let itemData = null;
                try {
                    if (ref.store === 'algorithms') {
                        const allAlgosContainer = fetchedStoreData.get('all');
                        if (allAlgosContainer?.data) {
                            if (ref.id === 'main') { itemData = allAlgosContainer.data.main; }
                            else {
                                const sectionKey = getSectionForResult(ref);
                                if (sectionKey && allAlgosContainer.data[sectionKey]) {
                                    itemData = allAlgosContainer.data[sectionKey].find(algo => String(algo?.id) === String(ref.id));
                                }
                            }
                        }
                    } else if (ref.store === 'clientData') {
                        itemData = fetchedStoreData.get('current');
                    } else {
                        itemData = fetchedStoreData.get(ref.id);
                    }
                } catch (dataAccessError) { console.error(`[performSearch Process] Ошибка доступа к данным для ref:`, ref, dataAccessError); itemData = null; }

                if (itemData) {
                    const searchResultItem = convertItemToSearchResult(ref.store, ref.id, itemData, ref.score);
                    if (searchResultItem) {
                        let bonusScore = 0;
                        const fullText = getTextForItem(ref.store, itemData).toLowerCase().replace(/ё/g, 'е');
                        const titleText = (searchResultItem.title || '').toLowerCase().replace(/ё/g, 'е');
                        if (titleText.includes(normalizedQuery)) { bonusScore += 70 * (normalizedQuery.length / (titleText.length || 1)); }
                        queryWords.forEach(word => {
                            const exactWordRegex = new RegExp(`\\b${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
                            if (exactWordRegex.test(fullText)) { bonusScore += 30; }
                            else if (fullText.includes(word)) { bonusScore += 5; }
                        });
                        searchResultItem.score += bonusScore;
                        finalResults.push(searchResultItem);
                    }
                } else {
                }
            });

            const sectionMatches = findSectionMatches(normalizedQuery);

            const combinedResults = [...sectionMatches, ...finalResults];
            combinedResults.sort((a, b) => b.score - a.score);

            console.log(`[performSearch] Обработано ${finalResults.length} результатов для элементов + ${sectionMatches.length} ссылок на разделы. Всего отсортировано: ${combinedResults.length}`);

            renderSearchResults(combinedResults, searchResultsContainer);
        }


        function findSectionMatches(normalizedQuery) {
            const sectionMatches = [];
            tabsConfig.forEach(tab => {
                const tabNameLower = tab.name.toLowerCase().replace(/ё/g, 'е');
                const tabIdLower = tab.id.toLowerCase();

                const queryFoundInId = tabIdLower.includes(normalizedQuery);
                const queryFoundInName = tabNameLower.includes(normalizedQuery);
                console.log(`[DEBUG findSectionMatches] Checking section: ID='${tabIdLower}', Name='${tabNameLower}' against Query='${normalizedQuery}'. Found in ID: ${queryFoundInId}, Found in Name: ${queryFoundInName}`);

                if (queryFoundInId || queryFoundInName) {
                    let sectionScore = 10000;
                    if (tabIdLower === normalizedQuery || tabNameLower === normalizedQuery) {
                        sectionScore += 5000;
                    }
                    console.log(`[DEBUG findSectionMatches] Section Match Found: ID='${tab.id}', Name='${tab.name}', Score=${sectionScore}`); // DEBUG
                    sectionMatches.push({
                        section: tab.id,
                        type: 'section_link',
                        id: `section-${tab.id}`,
                        title: `Перейти в раздел "${tab.name}"`,
                        description: `Открыть вкладку ${tab.name}`,
                        score: sectionScore
                    });
                }
            });
            return sectionMatches;
        }

        function renderSearchResults(results, container) {
            const noResultsMessage = '<div class="p-3 text-center text-gray-500">Ничего не найдено</div>';
            const searchInput = document.getElementById('searchInput');

            if (results.length === 0) {
                container.innerHTML = noResultsMessage;
            } else {
                container.innerHTML = '';
                const fragment = document.createDocumentFragment();
                const uniqueResultKeys = new Set();
                const MAX_RESULTS = 15;

                results.slice(0, MAX_RESULTS).forEach(result => {
                    const resultKey = `${result.type}:${result.id}`;
                    if (uniqueResultKeys.has(resultKey)) return;
                    uniqueResultKeys.add(resultKey);

                    const resultElement = document.createElement('div');
                    resultElement.className = 'p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-0';

                    const sectionDetailsMap = {
                        main: { icon: 'fa-sitemap text-primary', name: 'Главный алгоритм' },
                        program: { icon: 'fa-desktop text-green-500', name: 'Программа 1С' },
                        skzi: { icon: 'fa-key text-yellow-500', name: 'СКЗИ' },
                        webReg: { icon: 'fa-globe text-blue-500', name: 'Веб-Регистратор' },
                        links: { icon: 'fa-link text-purple-500', name: 'Ссылки 1С' },
                        reglaments: { icon: 'fa-file-alt text-red-500', name: 'Регламенты' },
                        bookmarks: { icon: 'fa-bookmark text-orange-500', name: 'Закладки' },
                        extLinks: { icon: 'fa-external-link-alt text-teal-500', name: 'Внешние ресурсы' },
                        clientData: { icon: 'fa-user-edit text-indigo-500', name: 'Данные клиента' },
                        bookmarkFolders: { icon: 'fa-folder text-indigo-500', name: 'Папки закладок' },
                        section_link: { icon: 'fa-folder-open text-gray-500', name: 'Раздел' }
                    };

                    const displaySectionKey = result.type === 'section_link' ? 'section_link' : (result.section || 'unknown');
                    const details = sectionDetailsMap[displaySectionKey] || { icon: 'fa-question-circle text-gray-500', name: displaySectionKey };

                    const sectionIcon = `<i class="fas ${details.icon} mr-2 fa-fw"></i>`;
                    let sectionName = details.name;

                    if (result.type === 'section_link') {
                        const tabInfo = tabsConfig.find(t => t.id === result.section);
                        sectionName = tabInfo ? `Раздел: ${tabInfo.name}` : 'Раздел';
                    }

                    const descriptionText = result.description || '';
                    const cleanDescription = descriptionText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    const descriptionHtml = cleanDescription
                        ? `<div class="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2" title="${cleanDescription.replace(/"/g, '"')}">${cleanDescription}</div>`
                        : '';

                    resultElement.innerHTML = `
                        <div class="font-medium truncate" title="${(result.title || '').replace(/"/g, '"')}">${result.title || 'Без заголовка'}</div>
                        ${descriptionHtml}
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-between">
                            <div class="flex items-center overflow-hidden mr-2">
                                ${sectionIcon}
                                <span class="truncate">${sectionName}</span>
                            </div>
                            <span class="text-xs font-mono text-gray-400 dark:text-gray-500 flex-shrink-0" title="Relevance Score">${result.score.toFixed(0)}</span>
                        </div>
                    `;

                    resultElement.addEventListener('click', () => {
                        if (typeof navigateToResult === 'function') {
                            navigateToResult(result);
                            container.classList.add('hidden');
                            if (searchInput) { searchInput.value = ''; searchInput.blur(); }
                        } else {
                            console.error("[renderSearchResults] Функция navigateToResult не найдена!");
                            showNotification("Ошибка: Невозможно перейти к результату.", "error");
                        }
                    });
                    fragment.appendChild(resultElement);
                });
                container.appendChild(fragment);
            }
        }


        function getTextForItem(storeName, itemData) {
            if (!itemData) return '';
            let texts = [];

            try {
                switch (storeName) {
                    case 'algorithms':
                        texts.push(getAlgorithmText(itemData));
                        break;
                    case 'links':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.link) texts.push(itemData.link);
                        if (itemData.description) texts.push(itemData.description);
                        break;
                    case 'bookmarks':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.url) texts.push(itemData.url);
                        if (itemData.description) texts.push(itemData.description);
                        break;
                    case 'reglaments':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.content) texts.push(itemData.content);
                        break;
                    case 'extLinks':
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.url) texts.push(itemData.url);
                        if (itemData.description) texts.push(itemData.description);
                        break;
                    case 'clientData':
                        if (itemData.notes) texts.push(itemData.notes);
                        break;
                    case 'bookmarkFolders':
                        if (itemData.name) texts.push(itemData.name);
                        break;
                    default:
                        if (itemData.title) texts.push(itemData.title);
                        if (itemData.name) texts.push(itemData.name);
                        if (itemData.description) texts.push(itemData.description);
                        if (itemData.content) texts.push(itemData.content);
                        break;
                }
            } catch (error) {
                console.error(`Error extracting text from item in store ${storeName}:`, itemData, error);
            }

            return texts.filter(t => typeof t === 'string' && t.trim()).join(' ');
        }


        async function updateSearchIndex(storeName, id, newData, operationType = 'update', oldData = null) {
            if (!db) {
                console.error("[updateSearchIndex] Cannot update: DB not initialized.");
                return Promise.reject("DB not initialized");
            }
            if (storeName === 'preferences' || storeName === 'searchIndex') {
                return Promise.resolve();
            }
            if (id === undefined || id === null) {
                console.warn(`[updateSearchIndex] Skipped: Missing ID for store ${storeName}, op: ${operationType}`);
                return Promise.resolve();
            }

            const docRefKey = `${storeName}/${id}`;
            console.log(`[updateSearchIndex] Start: ${docRefKey}, op: ${operationType}`);

            let newTokens = new Set();
            let oldTokens = new Set();
            let errorInDataProcessing = false;

            if ((operationType === 'add' || operationType === 'update') && newData) {
                try {
                    const text = getTextForItem(storeName, newData);
                    if (text) {
                        newTokens = new Set(tokenize(text));
                        console.log(`[updateSearchIndex] ${docRefKey}: Generated ${newTokens.size} new tokens.`);
                    } else {
                        console.log(`[updateSearchIndex] ${docRefKey}: No text in new data.`);
                    }
                } catch (e) {
                    console.error(`[updateSearchIndex] ${docRefKey}: ERROR getting text for new data: `, e);
                    errorInDataProcessing = true;
                }
            }
            if ((operationType === 'delete' || operationType === 'update')) {
                const dataForOldTokens = operationType === 'delete' ? newData : oldData;
                if (dataForOldTokens) {
                    try {
                        const text = getTextForItem(storeName, dataForOldTokens);
                        if (text) {
                            oldTokens = new Set(tokenize(text));
                            console.log(`[updateSearchIndex] ${docRefKey}: Generated ${oldTokens.size} old tokens.`);
                        } else {
                            console.log(`[updateSearchIndex] ${docRefKey}: No text in old/deleted data.`);
                        }
                    } catch (e) {
                        console.error(`[updateSearchIndex] ${docRefKey}: ERROR getting text for old/deleted data:`, e);
                    }
                } else if (operationType === 'update') {
                    console.warn(`[updateSearchIndex] ${docRefKey}: Update op without oldData.`);
                }
            }

            if ((operationType === 'add' || operationType === 'update') && errorInDataProcessing) {
                console.error(`[updateSearchIndex] ${docRefKey}: ABORTING due to error processing new data.`);
                return Promise.reject(new Error("Error processing item data for indexing"));
            }

            const tokensToAdd = new Set();
            const tokensToRemove = new Set();
            const docRef = { store: storeName, id: id };

            if (operationType === 'add') {
                newTokens.forEach(token => tokensToAdd.add(token));
            } else if (operationType === 'delete') {
                oldTokens.forEach(token => tokensToRemove.add(token));
            } else if (operationType === 'update') {
                newTokens.forEach(token => { if (!oldTokens.has(token)) tokensToAdd.add(token); });
                oldTokens.forEach(token => { if (!newTokens.has(token)) tokensToRemove.add(token); });
            }

            const allAffectedTokens = new Set([...tokensToAdd, ...tokensToRemove]);

            if (allAffectedTokens.size === 0) {
                console.log(`[updateSearchIndex] ${docRefKey}: No index changes needed.`);
                return Promise.resolve();
            }

            console.log(`[updateSearchIndex] ${docRefKey}: Tokens to add (${tokensToAdd.size}): ${Array.from(tokensToAdd).slice(0, 5).join(', ')}...`);
            console.log(`[updateSearchIndex] ${docRefKey}: Tokens to remove (${tokensToRemove.size}): ${Array.from(tokensToRemove).slice(0, 5).join(', ')}...`);

            return new Promise((resolve, reject) => {
                let transaction;
                let operationCount = 0;
                let completedCount = 0;
                let transactionError = null;

                try {
                    transaction = db.transaction(['searchIndex'], 'readwrite');
                    const indexStore = transaction.objectStore('searchIndex');
                    operationCount = allAffectedTokens.size;

                    if (operationCount === 0) {
                        resolve();
                        return;
                    }

                    transaction.oncomplete = () => {
                        if (transactionError) {
                            console.error(`[updateSearchIndex] ${docRefKey}: Transaction completed BUT error occurred earlier:`, transactionError);
                            reject(transactionError);
                        } else {
                            console.log(`[updateSearchIndex] ${docRefKey}: Transaction completed successfully.`);
                            resolve();
                        }
                    };
                    transaction.onerror = (e) => {
                        console.error(`[updateSearchIndex] ${docRefKey}: Transaction failed (onerror):`, e.target.error);
                        if (!transactionError) transactionError = e.target.error || new Error('Transaction error');
                    };
                    transaction.onabort = (e) => {
                        console.warn(`[updateSearchIndex] ${docRefKey}: Transaction aborted (onabort):`, e.target.error);
                        if (!transactionError) transactionError = e.target.error || new Error('Transaction aborted');
                        reject(transactionError);
                    };


                    for (const token of allAffectedTokens) {
                        const getRequest = indexStore.get(token);

                        getRequest.onerror = e => {
                            console.error(`[updateSearchIndex] ${docRefKey}: GET request failed for token "${token}":`, e.target.error);
                            if (!transactionError) transactionError = e.target.error;
                            completedCount++;
                        };

                        getRequest.onsuccess = e => {
                            try {
                                let entry = e.target.result;
                                let refs = entry ? [...entry.refs] : [];
                                let modified = false;
                                let operationDesc = 'none';

                                const refIndex = refs.findIndex(ref => ref.store === docRef.store && String(ref.id) === String(docRef.id));
                                const refExists = refIndex !== -1;

                                let requestToExecute = null;

                                if (tokensToAdd.has(token) && !refExists) {
                                    refs.push(docRef);
                                    modified = true;
                                    operationDesc = 'add ref';
                                } else if (tokensToRemove.has(token) && refExists) {
                                    refs.splice(refIndex, 1);
                                    modified = true;
                                    operationDesc = 'remove ref';
                                }

                                if (modified) {
                                    console.log(`[updateSearchIndex] ${docRefKey}: Token "${token}": ${operationDesc}`);
                                    if (refs.length > 0) {
                                        requestToExecute = indexStore.put({ word: token, refs: refs });
                                    } else if (entry) {
                                        requestToExecute = indexStore.delete(token);
                                    }
                                }

                                if (requestToExecute) {
                                    requestToExecute.onerror = (errEvent) => {
                                        console.error(`[updateSearchIndex] ${docRefKey}: ${operationDesc.includes('add') ? 'PUT' : 'DELETE'} failed for token "${token}":`, errEvent.target.error);
                                    };
                                    requestToExecute.onsuccess = () => {
                                    };
                                }
                                completedCount++;
                                if (completedCount === operationCount) {
                                    console.log(`[updateSearchIndex] ${docRefKey}: All ${operationCount} token operations initiated.`);
                                }

                            } catch (processingError) {
                                console.error(`[updateSearchIndex] ${docRefKey}: Error processing refs for token "${token}":`, processingError);
                                if (!transactionError) transactionError = processingError;
                                completedCount++;
                            }
                        };
                    }

                } catch (transactionSetupError) {
                    console.error(`[updateSearchIndex] ${docRefKey}: Failed to create transaction:`, transactionSetupError);
                    reject(transactionSetupError);
                }
            });
        }


        async function checkAndBuildIndex() {
            if (!db) {
                console.warn("checkAndBuildIndex called but DB is not available.");
                return Promise.resolve();
            }

            console.log("Checking search index status...");

            try {
                const transaction = db.transaction(['searchIndex'], 'readonly');
                const store = transaction.objectStore('searchIndex');
                const countRequest = store.count();

                return new Promise((resolve, reject) => {
                    countRequest.onsuccess = async (e) => {
                        const count = e.target.result;
                        console.log(`Search index count: ${count}`);

                        if (count === 0) {
                            console.warn("Search index is empty. Rebuilding...");

                            const loadingOverlay = document.getElementById('loadingOverlay');
                            if (loadingOverlay && loadingOverlay.style.display !== 'none') {
                                const statusDiv = document.getElementById('indexingStatus') || document.createElement('div');
                                statusDiv.id = 'indexingStatus';
                                statusDiv.className = 'text-sm text-gray-600 dark:text-gray-400 mt-2';
                                statusDiv.textContent = 'Индексация данных для поиска...';
                                if (!document.getElementById('indexingStatus')) {
                                    loadingOverlay.querySelector('.text-center')?.appendChild(statusDiv);
                                }
                                loadingOverlay.style.display = 'flex';
                                console.log("Showing indexing status on loading overlay.");
                            } else {
                                console.log("Loading overlay not visible or not found, skipping status update.");
                                showNotification("Индексация данных для поиска...", "info");
                            }

                            try {
                                if (typeof buildInitialSearchIndex !== 'function') {
                                    throw new Error("buildInitialSearchIndex function is not defined");
                                }
                                await buildInitialSearchIndex();
                                console.log("Initial search index build complete.");
                                if (loadingOverlay && document.getElementById('indexingStatus')) {
                                    const statusDiv = document.getElementById('indexingStatus');
                                    if (statusDiv) statusDiv.textContent = 'Индексация завершена.';
                                }
                                resolve();
                            } catch (buildError) {
                                console.error("Error building initial search index:", buildError);
                                if (loadingOverlay && document.getElementById('indexingStatus')) {
                                    const statusDiv = document.getElementById('indexingStatus');
                                    if (statusDiv) statusDiv.textContent = 'Ошибка индексации!';
                                } else {
                                    showNotification("Ошибка индексации данных", "error");
                                }
                                reject(buildError);
                            }
                        } else {
                            console.log("Search index already exists and seems populated.");
                            resolve();
                        }
                    };
                    countRequest.onerror = (e) => {
                        console.error("Error counting items in searchIndex:", e.target.error);
                        reject(e.target.error);
                    };
                    transaction.onerror = (e) => {
                        console.error("Readonly transaction error on searchIndex for count:", e.target.error);
                    };
                    transaction.onabort = (e) => {
                        console.warn("Readonly transaction aborted on searchIndex for count:", e.target.error);
                    };
                });
            } catch (error) {
                console.error("Error accessing searchIndex for check:", error);
                return Promise.reject(error);
            }
        }


        async function buildInitialSearchIndex() {
            console.log("Starting initial index build...");
            const storesToIndex = ['algorithms', 'links', 'bookmarks', 'reglaments', 'extLinks', 'clientData', 'bookmarkFolders'];

            try {
                console.log("Clearing existing search index...");
                await clearIndexedDBStore('searchIndex');
                console.log("Old index cleared.");

                const updatePromises = [];

                for (const storeName of storesToIndex) {
                    console.log(`Indexing store: ${storeName}...`);
                    let items = [];
                    try {
                        if (storeName === 'algorithms') { const data = await getFromIndexedDB('algorithms', 'all'); items = data ? [data] : []; }
                        else if (storeName === 'clientData') { const data = await getFromIndexedDB('clientData', 'current'); items = data ? [data] : []; }
                        else { items = await getAllFromIndexedDB(storeName); }
                        console.log(`  Processing ${items?.length || 0} root items/containers in ${storeName}.`);
                    } catch (e) { continue; }

                    if (!items || items.length === 0) continue;

                    for (const itemContainer of items) {
                        if (storeName === 'algorithms') {
                            if (itemContainer.section === 'all' && itemContainer.data) {
                                const algoData = itemContainer.data;
                                if (algoData.main) {
                                    console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for algorithms/main`);
                                    updatePromises.push(updateSearchIndex(storeName, 'main', algoData.main, 'add').catch(/*...*/));
                                }
                                ['program', 'skzi', 'webReg'].forEach(sectionKey => {
                                    if (Array.isArray(algoData[sectionKey])) {
                                        algoData[sectionKey].forEach(algo => {
                                            if (algo && algo.id) {
                                                console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for ${storeName}/${algo.id}`);
                                                updatePromises.push(updateSearchIndex(storeName, algo.id, algo, 'add').catch(/*...*/));
                                            } else { console.warn(`Skipping algorithm in ${sectionKey} due to missing ID or data:`, algo); }
                                        });
                                    }
                                });
                            }
                        }
                        else if (storeName === 'clientData') {
                            if (itemContainer.id === 'current') {
                                console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for ${storeName}/current`);
                                updatePromises.push(updateSearchIndex(storeName, 'current', itemContainer, 'add').catch(/*...*/));
                            }
                        }
                        else {
                            const item = itemContainer;
                            let itemId = item.id;
                            if (itemId !== undefined && itemId !== null) {
                                console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for ${storeName}/${itemId}`);
                                updatePromises.push(updateSearchIndex(storeName, itemId, item, 'add').catch(/*...*/));
                            } else { console.warn(`Skipping item in ${storeName} due to missing ID:`, item); }
                        }
                    }
                    console.log(`Finished processing ${storeName}.`);
                }

                console.log(`Waiting for ${updatePromises.length} index update operations to complete...`);
                const results = await Promise.allSettled(updatePromises);
                const failedCount = results.filter(r => r.status === 'rejected').length;

                return Promise.resolve();

            } catch (error) { return Promise.reject(error); }
        }


        async function debug_checkIndex(token) {
            if (!db) {
                console.log("DB not ready");
                return;
            }
            if (!token || typeof token !== 'string') {
                console.log("Please provide a token (string) to check.");
                return;
            }
            const normalizedToken = token.toLowerCase().replace(/ё/g, 'е');
            console.log(`Checking index for token: "${normalizedToken}"`);
            try {
                const transaction = db.transaction(['searchIndex'], 'readonly');
                const store = transaction.objectStore('searchIndex');
                const request = store.get(normalizedToken);

                await new Promise((resolve, reject) => {
                    request.onerror = e => {
                        console.error("Error getting token:", e.target.error);
                        reject(e.target.error);
                    };
                    request.onsuccess = e => {
                        const result = e.target.result;
                        if (result) {
                            console.log(`Found entry for token "${normalizedToken}":`, JSON.parse(JSON.stringify(result)));
                            console.log(`  References (${result.refs?.length || 0}):`, JSON.parse(JSON.stringify(result.refs)));
                            const targetRef = result.refs?.find(ref => ref.store === 'algorithms' && String(ref.id) === 'skzi1');
                            if (targetRef) {
                                console.log(`>>> SUCCESS: Found reference to algorithms/skzi1 for this token!`);
                            } else {
                                console.warn(`>>> WARNING: Reference to algorithms/skzi1 NOT FOUND for this token.`);
                            }
                        } else {
                            console.log(`--- Token "${normalizedToken}" not found in searchIndex ---`);
                        }
                        resolve();
                    };
                });
            } catch (error) {
                console.error("Error accessing searchIndex:", error);
            }
        }


        // ПОЛЕ ВВОДА ДАННЫХ ПО КЛИЕНТУ
        function initClientDataSystem() {
            const clientNotes = document.getElementById('clientNotes');
            const clearClientDataBtn = document.getElementById('clearClientDataBtn');
            const buttonContainer = clearClientDataBtn?.parentNode;
            let saveTimeout;

            if (!clientNotes || !clearClientDataBtn || !buttonContainer) {
                console.warn("Не найдены элементы для системы данных клиента (#clientNotes, #clearClientDataBtn или его родитель).");
                return;
            }

            clientNotes.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveClientData, 500);
            });

            clearClientDataBtn.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите очистить все данные по обращению?')) {
                    clearClientData();
                }
            });

            const existingExportBtn = document.getElementById('exportTextBtn');
            if (!existingExportBtn) {
                const exportTextBtn = document.createElement('button');
                exportTextBtn.id = 'exportTextBtn';
                exportTextBtn.className = 'ml-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition ease-in-out duration-150 flex items-center';
                exportTextBtn.title = 'Сохранить заметки как .txt файл';
                exportTextBtn.innerHTML = `<i class="fas fa-file-download mr-2"></i> Сохранить .txt`;

                exportTextBtn.addEventListener('click', exportClientDataToTxt);

                buttonContainer.appendChild(exportTextBtn);
                console.log("Кнопка 'Сохранить .txt' добавлена.");
            } else {
                console.log("Кнопка 'Сохранить .txt' уже существует, повторное добавление пропущено.");
            }
        }


        async function saveClientData() {
            const clientDataToSave = getClientData();
            let oldData = null;

            try {
                if (!db) {
                    console.warn("База данных не готова, сохранение данных клиента в localStorage.");
                    localStorage.setItem('clientData', JSON.stringify(clientDataToSave));
                    return;
                }

                try {
                    oldData = await getFromIndexedDB('clientData', clientDataToSave.id);
                } catch (fetchError) {
                    console.warn(`Не удалось получить старые данные клиента (${clientDataToSave.id}) перед обновлением индекса:`, fetchError);
                }

                await saveToIndexedDB('clientData', clientDataToSave);
                console.log("Client data saved to IndexedDB");

                if (typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex(
                            'clientData',
                            clientDataToSave.id,
                            clientDataToSave,
                            'update',
                            oldData
                        );
                        const oldDataStatus = oldData ? 'со старыми данными' : '(без очистки старых токенов)';
                        console.log(`Обновление индекса для clientData (${clientDataToSave.id}) инициировано ${oldDataStatus}.`);
                    } catch (indexError) {
                        console.error(`Ошибка обновления поискового индекса для clientData ${clientDataToSave.id}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса для данных клиента.", "warning");
                    }
                } else {
                    console.warn("Функция updateSearchIndex недоступна для clientData.");
                }

            } catch (error) {
                console.error("Ошибка сохранения данных клиента в IndexedDB:", error);
                showNotification("Ошибка сохранения данных клиента", "error");
                console.error("Не удалось сохранить данные клиента в IndexedDB. Индекс и localStorage могут быть не синхронизированы.");
            }
        }


        function getClientData() {
            const notesValue = document.getElementById('clientNotes')?.value ?? '';
            return {
                id: 'current',
                notes: notesValue,
                timestamp: new Date().toISOString()
            };
        }


        function exportClientDataToTxt() {
            const notes = document.getElementById('clientNotes')?.value ?? '';
            if (!notes.trim()) {
                showNotification("Нет данных для сохранения", "error");
                return;
            }

            const now = new Date();
            const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
            const filename = `Обращение_1С_${timestamp}.txt`;
            const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });

            if (window.navigator.msSaveOrOpenBlob) {
                window.navigator.msSaveBlob(blob, filename);
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }

            showNotification("Файл успешно сохранен");
        }


        function loadClientData(data) {
            if (!data) return;
            const clientNotes = document.getElementById('clientNotes');
            if (clientNotes) {
                clientNotes.value = data.notes ?? '';
            }
        }


        function clearClientData() {
            const clientNotes = document.getElementById('clientNotes');
            if (clientNotes) {
                clientNotes.value = '';
                saveClientData();
                showNotification("Данные очищены");
            }
        }

        const themeToggleBtn = document.getElementById('themeToggle');
        themeToggleBtn?.addEventListener('click', async () => {
            let currentSavedTheme = DEFAULT_UI_SETTINGS.themeMode;
            let currentSettings = null;

            try {
                currentSettings = await getFromIndexedDB('preferences', 'uiSettings');
                if (currentSettings && typeof currentSettings === 'object') {
                    currentSavedTheme = currentSettings.themeMode || DEFAULT_UI_SETTINGS.themeMode;
                } else {
                    currentSettings = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
                    currentSavedTheme = currentSettings.themeMode;
                }

            } catch (error) {
                console.error("Error fetching current UI settings for theme toggle:", error);
                currentSettings = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
                currentSavedTheme = currentSettings.themeMode;
            }

            let nextTheme;
            if (currentSavedTheme === 'dark') {
                nextTheme = 'light';
            } else if (currentSavedTheme === 'light') {
                nextTheme = 'auto';
            } else {
                nextTheme = 'dark';
            }

            if (typeof setTheme === 'function') {
                setTheme(nextTheme);
            } else {
                const isDark = nextTheme === 'dark' || (nextTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.classList.toggle('dark', isDark);
            }

            currentSettings.themeMode = nextTheme;

            try {
                await saveToIndexedDB('preferences', currentSettings);

                const themeName = nextTheme === 'dark' ? 'темная' : (nextTheme === 'light' ? 'светлая' : 'автоматическая');
                showNotification(`Тема изменена на: ${themeName}`);

                const customizeUIModal = document.getElementById('customizeUIModal');
                if (customizeUIModal && !customizeUIModal.classList.contains('hidden')) {
                    const nextThemeRadio = customizeUIModal.querySelector(`input[name="themeMode"][value="${nextTheme}"]`);
                    if (nextThemeRadio) {
                        nextThemeRadio.checked = true;
                    }
                    if (typeof currentPreviewSettings === 'object' && currentPreviewSettings !== null) {
                        currentPreviewSettings.themeMode = nextTheme;
                    }
                    if (typeof originalUISettings === 'object' && originalUISettings !== null) {
                        originalUISettings.themeMode = nextTheme;
                    }
                }

            } catch (error) {
                console.error("Ошибка при сохранении настроек UI после смены темы:", error);
                showNotification("Ошибка сохранения темы", "error");
                if (typeof setTheme === 'function') {
                    setTheme(currentSavedTheme);
                }
            }
        });

        const exportDataBtn = document.getElementById('exportDataBtn');
        exportDataBtn?.addEventListener('click', exportAllData);

        const importDataBtn = document.getElementById('importDataBtn');
        const importFileInput = document.getElementById('importFileInput');

        importDataBtn?.addEventListener('click', () => importFileInput?.click());

        importFileInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    importDataFromJSON(event.target.result);
                } catch (error) {
                    console.error("Error importing data:", error);
                    showNotification("Ошибка импорта файла. Возможно, файл поврежден или имеет неверный формат.", "error");
                } finally {
                    if (importFileInput) importFileInput.value = '';
                }
            };
            reader.onerror = () => {
                console.error("Error reading file:", reader.error);
                showNotification("Ошибка чтения файла.", "error");
                if (importFileInput) importFileInput.value = '';
            };
            reader.readAsText(file);
        });


        // СИСТЕМА ЗАКЛАДОК
        function initBookmarkSystem() {
            const addBookmarkBtn = document.getElementById('addBookmarkBtn');
            const organizeBookmarksBtn = document.getElementById('organizeBookmarksBtn');
            const bookmarkSearchInput = document.getElementById('bookmarkSearchInput');
            const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');
            const bookmarksContainer = document.getElementById('bookmarksContainer');
            const viewToggleContainer = bookmarksContainer?.closest('.bg-gray-100, .dark\\:bg-gray-800')?.querySelector('.flex.items-center.space-x-1.border');

            if (!addBookmarkBtn || !bookmarksContainer) {
                console.error("Bookmark system init failed: addBookmarkBtn or bookmarksContainer not found.");
                return;
            }

            if (viewToggleContainer) {
                viewToggleContainer.remove();
                console.log("View toggle buttons removed for bookmarks section.");
            } else {
                console.warn("View toggle container for bookmarks not found during init.");
            }

            addBookmarkBtn.addEventListener('click', showAddBookmarkModal);
            organizeBookmarksBtn?.addEventListener('click', showOrganizeFoldersModal);

            const debouncedFilter = typeof debounce === 'function' ? debounce(filterBookmarks, 250) : filterBookmarks;
            bookmarkSearchInput?.addEventListener('input', debouncedFilter);
            bookmarkFolderFilter?.addEventListener('change', filterBookmarks);

            loadBookmarks().then(success => {
                if (success && bookmarksContainer) {
                    applyView(bookmarksContainer, 'cards');
                }
            });
        }


        async function loadBookmarks() {
            if (!db) return false;

            try {
                let folders = await getAllFromIndexedDB('bookmarkFolders');
                let foldersCreated = false;
                if (!folders?.length) {
                    const defaultFolders = [
                        { name: 'Общие', color: 'blue', dateAdded: new Date().toISOString() },
                        { name: 'Важное', color: 'red', dateAdded: new Date().toISOString() },
                        { name: 'Инструкции', color: 'green', dateAdded: new Date().toISOString() }
                    ];
                    const savedFolderIds = await Promise.all(defaultFolders.map(folder => saveToIndexedDB('bookmarkFolders', folder)));
                    const foldersWithIds = defaultFolders.map((folder, index) => ({ ...folder, id: savedFolderIds[index] }));

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(foldersWithIds.map(folder =>
                            updateSearchIndex('bookmarkFolders', folder.id, folder, 'update')
                                .catch(err => console.error(`Error indexing default folder ${folder.id}:`, err))
                        ));
                        console.log("Default bookmark folders indexed.");
                    } else {
                        console.warn("updateSearchIndex function not available for default folders.");
                    }

                    folders = await getAllFromIndexedDB('bookmarkFolders');
                    foldersCreated = true;
                }
                renderBookmarkFolders(folders);

                let bookmarks = await getAllFromIndexedDB('bookmarks');
                if (!bookmarks?.length) {
                    const firstFolderId = folders?.[0]?.id || null;

                    const sampleBookmarksData = [
                        {
                            title: 'База знаний крипты',
                            url: 'https://www.cryptopro.ru/support/docs',
                            description: 'Документация КриптоПро',
                            folder: firstFolderId,
                            dateAdded: new Date().toISOString()
                        },
                        {
                            title: 'База знаний Рутокен',
                            url: 'https://dev.rutoken.ru/display/KB/Search',
                            description: 'Документация Рутокен',
                            folder: firstFolderId,
                            dateAdded: new Date().toISOString()
                        }
                    ];
                    const savedBookmarkIds = await Promise.all(sampleBookmarksData.map(bookmark => saveToIndexedDB('bookmarks', bookmark)));
                    const bookmarksWithIds = sampleBookmarksData.map((bookmark, index) => ({ ...bookmark, id: savedBookmarkIds[index] }));

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(bookmarksWithIds.map(bookmark =>
                            updateSearchIndex('bookmarks', bookmark.id, bookmark, 'update')
                                .catch(err => console.error(`Error indexing default bookmark ${bookmark.id}:`, err))
                        ));
                        console.log("Default bookmarks indexed.");
                    } else {
                        console.warn("updateSearchIndex function not available for default bookmarks.");
                    }

                    bookmarks = await getAllFromIndexedDB('bookmarks');
                }
                renderBookmarks(bookmarks);

                return true;
            } catch (error) {
                console.error("Error loading bookmarks:", error);
                return false;
            }
        }

        async function getAllBookmarks() {
            try {
                const bookmarks = await getAllFromIndexedDB('bookmarks');
                return bookmarks || [];
            } catch (error) {
                console.error("Ошибка при получении всех закладок:", error);
                return [];
            }
        }


        function debounce(func, wait, immediate) {
            let timeout;
            return function executedFunction(...args) {
                const context = this;
                const later = function () {
                    timeout = null;
                    if (!immediate) func.apply(context, args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func.apply(context, args);
            };
        }


        function initExternalLinksSystem() {
            const addExtLinkBtn = document.getElementById('addExtLinkBtn');
            const extLinksContainer = document.getElementById('extLinksContainer');
            const extLinkSearchInput = document.getElementById('extLinkSearchInput');
            const extLinkCategoryFilter = document.getElementById('extLinkCategoryFilter');

            if (!addExtLinkBtn || !extLinksContainer || !extLinkSearchInput || !extLinkCategoryFilter) {
                console.error("Ошибка инициализации системы внешних ссылок: один или несколько элементов не найдены.");
                return;
            }


            addExtLinkBtn?.addEventListener('click', showAddExtLinkModal);

            const debouncedFilter = typeof debounce === 'function' ? debounce(filterExtLinks, 250) : filterExtLinks;
            if (extLinkSearchInput) {
                extLinkSearchInput.addEventListener('input', debouncedFilter);
            }

            extLinkCategoryFilter?.addEventListener('change', filterExtLinks);

            loadExtLinks();
            populateExtLinkCategoryFilter();

            if (extLinksContainer) {
                extLinksContainer.removeEventListener('click', handleExtLinkContainerClick);
                extLinksContainer.addEventListener('click', handleExtLinkContainerClick);
                console.log("Обработчик кликов по карточкам внешних ресурсов добавлен/обновлен.");
            } else {
                console.error("Контейнер #extLinksContainer не найден, не удалось добавить обработчик кликов по карточкам.");
            }
        }


        function renderBookmarkFolders(folders) {
            const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');
            if (!bookmarkFolderFilter) return;

            while (bookmarkFolderFilter.options.length > 1) {
                bookmarkFolderFilter.remove(1);
            }

            const fragment = document.createDocumentFragment();
            folders.forEach(folder => {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.name;
                fragment.appendChild(option);
            });
            bookmarkFolderFilter.appendChild(fragment);
        }


        async function renderBookmarks(bookmarks) {
            const bookmarksContainer = document.getElementById('bookmarksContainer');
            if (!bookmarksContainer) return;

            bookmarksContainer.innerHTML = '';

            if (!bookmarks?.length) {
                bookmarksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных закладок</div>';
                applyCurrentView('bookmarksContainer');
                return;
            }

            let folderMap = {};
            try {
                const folders = await getAllFromIndexedDB('bookmarkFolders');
                folderMap = folders.reduce((map, folder) => {
                    if (folder && typeof folder.id !== 'undefined') {
                        map[folder.id] = folder;
                    }
                    return map;
                }, {});
            } catch (e) {
                console.error("Could not load folders for bookmark rendering:", e);
            }

            const fragment = document.createDocumentFragment();
            bookmarks.forEach(bookmark => {
                if (!bookmark || typeof bookmark.id === 'undefined') {
                    console.warn("Пропуск невалидной закладки:", bookmark);
                    return;
                }

                const bookmarkElement = document.createElement('div');
                bookmarkElement.className = 'bookmark-item view-item group cursor-pointer flex flex-col justify-between h-full';
                bookmarkElement.dataset.id = bookmark.id;
                if (bookmark.folder) bookmarkElement.dataset.folder = bookmark.folder;

                const folder = bookmark.folder ? folderMap[bookmark.folder] : null;
                let folderBadgeHTML = '';
                if (folder) {
                    const colorName = folder.color || 'gray';
                    folderBadgeHTML = `
            <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-${colorName}-100 text-${colorName}-700 dark:bg-${colorName}-900 dark:text-${colorName}-300">
                <i class="fas fa-folder mr-1"></i>${folder.name}
            </span>`;
                } else if (bookmark.folder) {
                    folderBadgeHTML = `
                                        <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" title="Папка ID: ${bookmark.folder} не найдена">
                                            <i class="fas fa-question-circle mr-1"></i>Неизв. папка
                                        </span>`;
                }

                let urlHostnameHTML = '';
                let externalLinkIconHTML = '';
                let editButtonHTML = '';
                let cardClickOpensUrl = false;

                if (bookmark.url) {
                    try {
                        const urlObject = new URL(bookmark.url);
                        urlHostnameHTML = `
                                            <a href="${bookmark.url}" target="_blank" rel="noopener noreferrer" class="bookmark-url text-gray-500 hover:text-primary dark:hover:text-primary text-xs inline-flex items-center mt-1 break-all" title="${bookmark.url}">
                                                <i class="fas fa-link mr-1"></i>${urlObject.hostname}
                                            </a>`;
                        externalLinkIconHTML = `
                                                <a href="${bookmark.url}" target="_blank" rel="noopener noreferrer" class="p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Открыть ссылку">
                                                    <i class="fas fa-external-link-alt"></i>
                                                </a>`;
                        editButtonHTML = `
                                        <button data-action="edit" class="edit-bookmark p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Редактировать">
                                            <i class="fas fa-edit"></i>
                                        </button>`;
                        cardClickOpensUrl = true;
                    } catch (e) {
                        console.warn(`Invalid URL for bookmark ID ${bookmark.id}: ${bookmark.url}`);
                        urlHostnameHTML = `<span class="text-red-500 text-xs mt-1" title="Некорректный URL: ${bookmark.url}"><i class="fas fa-exclamation-triangle mr-1"></i> Некорр. URL</span>`;
                        externalLinkIconHTML = `
                                                <span class="p-1.5 text-red-500 cursor-not-allowed" title="Некорректный URL">
                                                    <i class="fas fa-times-circle"></i>
                                                </span>`;
                        editButtonHTML = `
                                        <button data-action="edit" class="edit-bookmark p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Редактировать (исправить URL)">
                                            <i class="fas fa-edit"></i>
                                        </button>`;
                    }
                } else {
                    externalLinkIconHTML = `
                                            <span class="p-1.5 text-gray-400 cursor-not-allowed" title="URL не указан">
                                                <i class="fas fa-link-slash"></i>
                                            </span>`;
                }

                bookmarkElement.dataset.opensUrl = cardClickOpensUrl;

                const mainContentHTML = `
                                        <div class="flex-grow min-w-0 mr-3 mb-3">
                                            <h3 class="font-semibold text-base group-hover:text-primary dark:group-hover:text-primary truncate" title="${bookmark.title}">${bookmark.title}</h3>
                                            <p class="bookmark-description text-gray-600 dark:text-gray-400 text-sm mt-1 mb-2 line-clamp-3">${bookmark.description || (bookmark.url ? 'Нет описания' : 'Текстовая заметка')}</p>
                                            <div class="bookmark-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                                ${folderBadgeHTML}
                                                <span class="text-gray-500"><i class="far fa-clock mr-1"></i>${new Date(bookmark.dateAdded || Date.now()).toLocaleDateString()}</span>
                                                ${urlHostnameHTML}
                                            </div>
                                        </div>`;

                const actionsHTML = `
                                    <div class="bookmark-actions flex flex-shrink-0 items-center mt-auto pt-2 border-t border-gray-200 dark:border-gray-600 -mx-4 px-4 pb-1 justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                                        ${externalLinkIconHTML}
                                        ${editButtonHTML}
                                        <button data-action="delete" class="delete-bookmark p-1.5 text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Удалить">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>`;

                bookmarkElement.innerHTML = mainContentHTML + actionsHTML;
                fragment.appendChild(bookmarkElement);
            });

            bookmarksContainer.appendChild(fragment);

            bookmarksContainer.removeEventListener('click', handleBookmarkAction);
            bookmarksContainer.addEventListener('click', handleBookmarkAction);

            applyView(bookmarksContainer, 'cards');
        }


        async function handleBookmarkAction(event) {
            const target = event.target;
            const button = target.closest('button[data-action]');
            const linkElement = target.closest('a');
            const bookmarkItem = target.closest('.bookmark-item');

            if (!bookmarkItem) return;

            const bookmarkId = parseInt(bookmarkItem.dataset.id, 10);
            if (isNaN(bookmarkId)) {
                console.error("Невалидный ID закладки:", bookmarkItem.dataset.id);
                return;
            }

            if (button) {
                const action = button.dataset.action;
                event.stopPropagation();

                if (action === 'edit') {
                    if (typeof showEditBookmarkModal === 'function') {
                        showEditBookmarkModal(bookmarkId);
                    } else {
                        const modal = document.getElementById('bookmarkModal');
                        const form = modal?.querySelector('#bookmarkForm');
                        if (modal && form) {
                            try {
                                const bookmark = await getFromIndexedDB('bookmarks', bookmarkId);
                                if (bookmark) {
                                    form.elements.bookmarkTitle.value = bookmark.title || '';
                                    form.elements.bookmarkUrl.value = bookmark.url || '';
                                    form.elements.bookmarkDescription.value = bookmark.description || '';
                                    form.elements.bookmarkFolder.value = bookmark.folder || '';
                                    form.elements.bookmarkId.value = bookmark.id;
                                    modal.querySelector('#bookmarkModalTitle').textContent = 'Редактировать закладку';
                                    modal.querySelector('#saveBookmarkBtn').innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
                                } else {
                                    showNotification("Не удалось загрузить закладку для редактирования.", "error");
                                    modal.classList.add('hidden');
                                }
                            } catch (err) {
                                showNotification("Ошибка загрузки закладки для редактирования.", "error");
                                modal.classList.add('hidden');
                            }
                        }
                    }
                } else if (action === 'delete') {
                    const title = bookmarkItem.querySelector('h3')?.title || `ID ${bookmarkId}`;
                    if (confirm(`Вы уверены, что хотите удалить закладку "${title}"?`)) {
                        deleteBookmark(bookmarkId);
                    }
                }
            } else if (linkElement && linkElement.classList.contains('bookmark-url')) {
                console.log("Клик по ссылке URL, браузер обработает.");
            } else {
                const opensUrl = bookmarkItem.dataset.opensUrl === 'true';
                const bookmarkUrl = bookmarkItem.querySelector('a.bookmark-url')?.href;

                if (opensUrl && bookmarkUrl) {
                    console.log("Клик по телу закладки с URL:", bookmarkId, "URL:", bookmarkUrl);
                    try {
                        new URL(bookmarkUrl);
                        window.open(bookmarkUrl, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                        console.error(`Некорректный URL при попытке открыть закладку ${bookmarkId}: ${bookmarkUrl}`, e);
                        showNotification("Некорректный URL у этой закладки.", "error");
                    }
                } else {
                    console.log("Клик по телу закладки без URL (или с невалидным URL):", bookmarkId);
                    if (typeof showBookmarkDetailModal === 'function') {
                        showBookmarkDetailModal(bookmarkId);
                    } else {
                        console.error("Функция showBookmarkDetailModal не определена!");
                        showNotification("Невозможно отобразить детали закладки.", "error");
                    }
                }
            }
        }


        async function deleteBookmark(id) {
            try {
                const bookmarkToDelete = await getFromIndexedDB('bookmarks', id);

                if (!bookmarkToDelete) {
                    console.warn(`Закладка с ID ${id} не найдена для удаления из индекса.`);
                    showNotification(`Закладка с ID ${id} не найдена.`, "warning");
                    return;
                }

                if (bookmarkToDelete && typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex('bookmarks', id, bookmarkToDelete, 'delete');
                        console.log(`Search index updated (delete) for bookmark ID: ${id}`);
                    } catch (indexError) {
                        console.error(`Error updating search index for bookmark deletion ${id}:`, indexError);
                    }
                } else if (!bookmarkToDelete) {
                } else {
                    console.warn("updateSearchIndex function is not available for bookmark deletion.");
                }

                await deleteFromIndexedDB('bookmarks', id);

                const bookmarks = await getAllFromIndexedDB('bookmarks');
                renderBookmarks(bookmarks);
                showNotification("Закладка удалена");

            } catch (error) {
                console.error("Error deleting bookmark:", error);
                showNotification("Ошибка при удалении закладки", "error");
            }
        }


        async function showEditBookmarkModal(id) {
            try {
                const bookmark = await getFromIndexedDB('bookmarks', id);
                if (!bookmark) {
                    showNotification("Закладка не найдена", "error");
                    return;
                }

                const modal = document.getElementById('bookmarkModal');
                if (!modal) {
                    showAddBookmarkModal();
                    setTimeout(() => showEditBookmarkModal(id), 150);
                    return;
                }

                const form = modal.querySelector('#bookmarkForm');
                const modalTitle = modal.querySelector('h2');
                const submitButton = form?.querySelector('button[type="submit"]');

                if (!form || !modalTitle || !submitButton) {
                    console.error("Edit modal elements not found.");
                    return;
                }

                form.querySelector('#bookmarkTitle').value = bookmark.title;
                form.querySelector('#bookmarkUrl').value = bookmark.url;
                form.querySelector('#bookmarkDescription').value = bookmark.description || '';
                form.querySelector('#bookmarkFolder').value = bookmark.folder || '';

                let bookmarkIdInput = form.querySelector('#bookmarkId');
                if (!bookmarkIdInput) {
                    bookmarkIdInput = form.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', id: 'bookmarkId' }));
                }
                bookmarkIdInput.value = bookmark.id;

                modalTitle.textContent = 'Редактировать закладку';
                submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
                modal.classList.remove('hidden');

            } catch (error) {
                console.error("Error loading bookmark for edit:", error);
                showNotification("Ошибка загрузки закладки для редактирования", "error");
            }
        }


        function renderLinks(links) {
            const linksContainer = document.getElementById('linksContainer');
            if (!linksContainer) return;

            linksContainer.innerHTML = '';

            if (!links?.length) {
                linksContainer.innerHTML = '<div class="text-center py-6 text-gray-500">Нет сохраненных ссылок</div>';
                applyCurrentView('linksContainer');
                return;
            }

            const categoryStyles = {
                common: { name: 'Общие', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' },
                reports: { name: 'Отчеты', classes: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' },
                settings: { name: 'Настройки', classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' },
                help: { name: 'Справка', classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' },
                default: { name: '', classes: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300' }
            };

            const fragment = document.createDocumentFragment();
            links.forEach(link => {
                const linkElement = document.createElement('div');
                let categoryBadgeHTML = '';
                if (link.category) {
                    const style = categoryStyles[link.category] || { ...categoryStyles.default, name: link.category };
                    categoryBadgeHTML = `<span class="link-category-badge inline-block px-2 py-0.5 rounded text-xs ${style.classes} whitespace-nowrap">${style.name}</span>`;
                }

                linkElement.className = 'link-item view-item';
                linkElement.dataset.id = link.id;
                if (link.category) linkElement.dataset.category = link.category;

                linkElement.innerHTML = `
            <div class="flex-grow min-w-0 mr-3">
                <h3 class="font-bold truncate" title="${link.title}">${link.title}</h3>
                <p class="link-description text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">${link.description || ''}</p>
                 <div class="link-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    ${categoryBadgeHTML}
                    <a href="${link.url}" target="_blank" class="link-url text-primary hover:underline text-sm inline-flex items-center">
                        <i class="fas fa-external-link-alt mr-1"></i>Открыть
                    </a>
                </div>
            </div>
            <div class="flex flex-shrink-0 items-center">
                <button data-action="edit" class="edit-link p-1 text-gray-500 hover:text-primary" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
                <button data-action="delete" class="delete-link p-1 text-gray-500 hover:text-red-500 ml-1" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
                fragment.appendChild(linkElement);
            });

            linksContainer.appendChild(fragment);

            linksContainer.removeEventListener('click', handleLinkAction);
            linksContainer.addEventListener('click', handleLinkAction);

            applyCurrentView('linksContainer');
        }


        function handleLinkAction(event) {
            const target = event.target;
            const button = target.closest('button[data-action]');
            const linkItem = target.closest('.link-item');

            if (!linkItem || !button) return;

            const linkId = parseInt(linkItem.dataset.id, 10);
            const action = button.dataset.action;

            event.stopPropagation();

            if (action === 'edit') {
                showEditLinkModal(linkId);
            } else if (action === 'delete') {
                deleteLink(linkId);
            }
        }


        async function deleteLink(linkId) {
            if (!confirm('Вы уверены, что хотите удалить эту ссылку?')) return;

            try {
                await deleteFromIndexedDB('links', parseInt(linkId, 10));
                const links = await getAllFromIndexedDB('links');
                renderLinks(links);
                showNotification("Ссылка успешно удалена.");
            } catch (error) {
                console.error("Error deleting link:", error);
                showNotification("Ошибка при удалении ссылки.", "error");
            }
        }


        function filterItems(options) {
            const { containerSelector, itemSelector, searchInputSelector, filterSelectSelector, dataAttribute, textSelectors } = options;

            const searchInput = document.getElementById(searchInputSelector);
            const filterSelect = filterSelectSelector ? document.getElementById(filterSelectSelector) : null;
            const container = document.querySelector(containerSelector);

            if (!searchInput) {
                console.error(`filterItems: Search input #${searchInputSelector} not found.`);
                return;
            }
            if (!container) {
                console.error(`filterItems: Container ${containerSelector} not found.`);
                return;
            }

            const items = container.querySelectorAll(itemSelector);


            if (!items.length && container.textContent.includes('Загрузка')) {
                console.log("filterItems: Items not found, likely still loading.");
                return;
            }


            const searchValue = searchInput.value.trim().toLowerCase();
            const filterValue = filterSelect ? filterSelect.value : '';

            let visibleCount = 0;

            items.forEach(item => {
                const itemFilterValue = (filterSelect && dataAttribute) ? (item.dataset[dataAttribute] || '') : '';
                const matchesFilter = !filterValue || itemFilterValue === filterValue;

                let matchesSearch = !searchValue;
                if (searchValue) {
                    matchesSearch = textSelectors.some(selector => {
                        const element = item.querySelector(selector);
                        const elementText = element?.textContent?.toLowerCase() || '';
                        const isMatch = elementText.includes(searchValue);
                        return isMatch;
                    });
                }

                const shouldHide = !(matchesSearch && matchesFilter);
                item.classList.toggle('hidden', shouldHide);
                if (!shouldHide) visibleCount++;
            });
        }


        function filterBookmarks() {
            filterItems({
                containerSelector: '#bookmarksContainer',
                itemSelector: '.bookmark-item',
                searchInputSelector: 'bookmarkSearchInput',
                filterSelectSelector: 'bookmarkFolderFilter',
                dataAttribute: 'folder',
                textSelectors: ['h3', 'p.bookmark-description']
            });
        }


        function filterLinks() {
            filterItems({
                containerSelector: '#linksContainer',
                itemSelector: '.cib-link-item',
                searchInputSelector: 'linkSearchInput',
                textSelectors: ['h3', 'code', 'p']
            });
        }

        document.getElementById('bookmarkSearchInput')?.addEventListener('input', debounce(filterBookmarks, 250));
        document.getElementById('linkSearchInput')?.addEventListener('input', debounce(filterLinks, 250));

        document.getElementById('bookmarkFolderFilter')?.addEventListener('change', filterBookmarks);
        document.getElementById('linkCategoryFilter')?.addEventListener('change', filterLinks);


        async function importBookmarks(bookmarks) {
            if (!db || !Array.isArray(bookmarks)) return false;

            try {
                await clearIndexedDBStore('bookmarks');
                await Promise.all(bookmarks.map(bookmark => saveToIndexedDB('bookmarks', bookmark)));
                return true;
            } catch (error) {
                console.error("Error importing bookmarks:", error);
                return false;
            }
        }


        function getRequiredElements(ids) {
            const elements = {};
            for (const id of ids) {
                elements[id] = document.getElementById(id);
                if (!elements[id]) {
                    console.error(`Required element with ID "${id}" not found.`);
                    return null;
                }
            }
            return elements;
        }


        async function showAddBookmarkModal(bookmarkToEdit = null) {
            let modal = document.getElementById('bookmarkModal');
            let isNewModal = false;

            if (!modal) {
                isNewModal = true;
                modal = document.createElement('div');
                modal.id = 'bookmarkModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
                modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div class="p-content border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100" id="bookmarkModalTitle">Добавить закладку</h2>
                <div>
                    <button id="toggleFullscreenBookmarkBtn" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                        <i class="fas fa-expand"></i>
                    </button>
                    <button type="button" class="close-modal inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Закрыть">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="p-content overflow-y-auto flex-1">
            <form id="bookmarkForm">
                <input type="hidden" id="bookmarkId">
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkTitle">Название <span class="text-red-500">*</span></label>
                    <input type="text" id="bookmarkTitle" name="bookmarkTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkUrl">URL (если пусто - будет текстовая заметка)</label>
                    <input type="url" id="bookmarkUrl" name="bookmarkUrl" placeholder="https://..." class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkDescription">Описание / Текст заметки <span class="text-red-500">*</span></label>
                    <textarea id="bookmarkDescription" name="bookmarkDescription" rows="5" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100"></textarea>
                    <p class="text-xs text-gray-500 mt-1">Обязательно для текстовых заметок (без URL).</p>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkFolder">Папка</label>
                    <select id="bookmarkFolder" name="bookmarkFolder" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                        <option value="">Выберите папку</option>
                    </select>
                </div>
            </form>
        </div>
        <div class="p-content border-t border-gray-200 dark:border-gray-700 mt-auto flex-shrink-0">
            <div class="flex justify-end gap-2">
                <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition">
                    Отмена
                </button>
                <button type="submit" form="bookmarkForm" id="saveBookmarkBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                    <i class="fas fa-save mr-1"></i> Сохранить
                </button>
            </div>
        </div>
    </div>
`;
                document.body.appendChild(modal);

                modal.addEventListener('click', (e) => {
                    if (e.target.closest('.close-modal, .cancel-modal')) {
                        modal.classList.add('hidden');
                    }
                });

                const form = modal.querySelector('#bookmarkForm');
                if (form && !form.dataset.submitListenerAttached) {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const saveButton = form.querySelector('#saveBookmarkBtn');
                        if (saveButton) saveButton.disabled = true;

                        const title = form.elements.bookmarkTitle.value.trim();
                        const url = form.elements.bookmarkUrl.value.trim();
                        const description = form.elements.bookmarkDescription.value.trim();
                        const folderValue = form.elements.bookmarkFolder.value;
                        const folder = folderValue ? parseInt(folderValue) : null;
                        const id = form.elements.bookmarkId.value;

                        if (!title) {
                            showNotification("Пожалуйста, заполните поле 'Название'", "error");
                            if (saveButton) saveButton.disabled = false;
                            return;
                        }
                        if (!url && !description) {
                            showNotification("Пожалуйста, заполните 'Описание / Текст заметки', так как URL не указан", "error");
                            if (saveButton) saveButton.disabled = false;
                            return;
                        }

                        const newData = {
                            title,
                            url: url || null,
                            description: description || null,
                            folder: folder,
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
                                    oldData = await getFromIndexedDB('bookmarks', newData.id);
                                    newData.dateAdded = oldData?.dateAdded || timestamp;
                                } catch (fetchError) {
                                    console.warn(`Не удалось получить старые данные закладки (${newData.id}):`, fetchError);
                                    newData.dateAdded = timestamp;
                                }
                                newData.dateUpdated = timestamp;
                            } else {
                                newData.dateAdded = timestamp;
                            }

                            const savedResult = await saveToIndexedDB('bookmarks', newData);
                            if (!isEditing) {
                                finalId = savedResult;
                                newData.id = finalId;
                            }

                            if (typeof updateSearchIndex === 'function') {
                                try {
                                    await updateSearchIndex(
                                        'bookmarks',
                                        finalId,
                                        newData,
                                        isEditing ? 'update' : 'add',
                                        oldData
                                    );
                                    const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                                    console.log(`Обновление индекса для закладки (${finalId}) инициировано ${oldDataStatus}.`);
                                } catch (indexError) {
                                    console.error(`Ошибка обновления поискового индекса для закладки ${finalId}:`, indexError);
                                    showNotification("Ошибка обновления поискового индекса для закладки.", "warning");
                                }
                            } else {
                                console.warn("Функция updateSearchIndex недоступна.");
                            }

                            showNotification(isEditing ? "Закладка обновлена" : "Закладка добавлена");

                            const bookmarkModal = document.getElementById('bookmarkModal');
                            if (bookmarkModal) bookmarkModal.classList.add('hidden');
                            form.reset();
                            const bookmarkIdInput = form.querySelector('#bookmarkId');
                            if (bookmarkIdInput) bookmarkIdInput.value = '';
                            const modalTitleEl = form.closest('#bookmarkModal')?.querySelector('#bookmarkModalTitle');
                            if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                            if (saveButton) saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';

                            try {
                                const bookmarks = await getAllBookmarks();
                                renderBookmarks(bookmarks);
                            } catch (renderError) {
                                console.error("Ошибка при обновлении списка закладок после сохранения:", renderError);
                                showNotification("Не удалось обновить список закладок на экране.", "warning");
                            }

                        } catch (saveError) {
                            console.error("Ошибка при сохранении закладки:", saveError);
                            showNotification("Ошибка при сохранении закладки", "error");
                        } finally {
                            if (saveButton) saveButton.disabled = false;
                        }
                    });
                    form.dataset.submitListenerAttached = 'true';
                }

                if (typeof initFullscreenToggles === 'function') {
                    initFullscreenToggles();
                } else {
                    console.warn("Функция initFullscreenToggles не найдена при создании модального окна закладки.");
                }

            } else {
                const form = modal.querySelector('#bookmarkForm');
                if (form) {
                    form.reset();
                    form.querySelector('#bookmarkId').value = '';
                    modal.querySelector('#bookmarkModalTitle').textContent = 'Добавить закладку';
                    const saveButton = modal.querySelector('#saveBookmarkBtn');
                    if (saveButton) saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
                }
            }

            const folderSelect = modal.querySelector('#bookmarkFolder');
            if (folderSelect) {
                await populateBookmarkFolders(folderSelect);
            } else {
                console.error("Не найден select папок #bookmarkFolder в модальном окне.");
            }

            modal.classList.remove('hidden');
            modal.querySelector('#bookmarkTitle')?.focus();
        }


        async function showBookmarkDetailModal(bookmarkId) {
            const modalId = 'bookmarkDetailModal';
            let modal = document.getElementById(modalId);
            const isNewModal = !modal;

            if (isNewModal) {
                modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
                modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100" id="bookmarkDetailTitle">Детали закладки</h2>
                        <button type="button" class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Закрыть">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>
                <div class="p-6 overflow-y-auto flex-1 prose dark:prose-invert max-w-none" id="bookmarkDetailContent">
                    <p>Загрузка...</p>
                </div>
                 <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                     <button type="button" id="editBookmarkFromDetailBtn" class="hidden px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">
                         <i class="fas fa-edit mr-1"></i> Редактировать
                     </button>
                     <button type="button" class="cancel-modal px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                         Закрыть
                     </button>
                 </div>
            </div>
        `;
                document.body.appendChild(modal);
                modal.addEventListener('click', (e) => {
                    if (e.target.closest('.close-modal, .cancel-modal')) {
                        modal.classList.add('hidden');
                    }
                    if (e.target.closest('#editBookmarkFromDetailBtn')) {
                        const currentId = parseInt(modal.dataset.currentBookmarkId, 10);
                        if (!isNaN(currentId)) {
                            modal.classList.add('hidden');
                            showEditBookmarkModal(currentId);
                        } else {
                            console.error("Не удалось получить ID закладки для редактирования из dataset");
                            showNotification("Ошибка: не удалось определить ID для редактирования", "error");
                        }
                    }
                });
            }

            const titleEl = modal.querySelector('#bookmarkDetailTitle');
            const contentEl = modal.querySelector('#bookmarkDetailContent');
            const editButton = modal.querySelector('#editBookmarkFromDetailBtn');

            modal.dataset.currentBookmarkId = bookmarkId;
            titleEl.textContent = 'Загрузка...';
            contentEl.innerHTML = '<p>Загрузка...</p>';
            if (editButton) editButton.classList.add('hidden');

            modal.classList.remove('hidden');

            try {
                const bookmark = await getFromIndexedDB('bookmarks', bookmarkId);
                if (bookmark) {
                    titleEl.textContent = bookmark.title;
                    const pre = document.createElement('pre');
                    pre.className = 'whitespace-pre-wrap break-words text-sm font-sans';
                    pre.textContent = bookmark.description || 'Нет описания.';
                    contentEl.innerHTML = '';
                    contentEl.appendChild(pre);

                    if (editButton && !bookmark.url) {
                        editButton.classList.remove('hidden');
                    } else if (editButton) {
                        editButton.classList.add('hidden');
                    }

                } else {
                    titleEl.textContent = 'Ошибка';
                    contentEl.innerHTML = '<p class="text-red-500">Не удалось загрузить данные закладки.</p>';
                    if (editButton) editButton.classList.add('hidden');
                    showNotification("Закладка не найдена", "error");
                }
            } catch (error) {
                console.error("Ошибка при загрузке деталей закладки:", error);
                titleEl.textContent = 'Ошибка';
                contentEl.innerHTML = '<p class="text-red-500">Ошибка при загрузке данных.</p>';
                if (editButton) editButton.classList.add('hidden');
                showNotification("Ошибка загрузки деталей закладки", "error");
            }
        }


        async function populateBookmarkFolders(folderSelectElement) {
            const folderSelect = folderSelectElement || document.getElementById('bookmarkFolder');
            if (!folderSelect) return;

            folderSelect.innerHTML = '<option value="">Выберите папку</option>';

            try {
                const folders = await getAllFromIndexedDB('bookmarkFolders');

                if (folders?.length > 0) {
                    const fragment = document.createDocumentFragment();
                    folders.forEach(folder => {
                        const option = document.createElement('option');
                        option.value = folder.id;
                        option.textContent = folder.name;
                        fragment.appendChild(option);
                    });
                    folderSelect.appendChild(fragment);
                }
            } catch (error) {
                console.error("Error loading folders for dropdown:", error);
            }
        }


        function showOrganizeFoldersModal() {
            let modal = document.getElementById('foldersModal');

            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'foldersModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
                modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold">Управление папками</h2>
                            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        <div id="foldersList" class="max-h-60 overflow-y-auto mb-4">
                            <div class="text-center py-4 text-gray-500">Загрузка папок...</div>
                        </div>
                        
                        <form id="folderForm" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="folderName">Название новой папки</label>
                                <input type="text" id="folderName" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1">Цвет</label>
                                <div class="flex gap-2">
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="blue" checked class="form-radio text-blue-600">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-blue-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="red" class="form-radio text-red-600">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-red-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="green" class="form-radio text-green-600">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-green-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="yellow" class="form-radio text-yellow-600">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-yellow-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="purple" class="form-radio text-purple-600">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-purple-600"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="flex justify-end">
                                <button type="submit" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                    Добавить папку
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
                    }
                });

                const form = modal.querySelector('#folderForm');
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const name = form.elements.folderName.value.trim();
                    const colorInput = form.querySelector('input[name="folderColor"]:checked');
                    const color = colorInput?.value ?? 'blue';

                    if (!name) {
                        showNotification("Пожалуйста, введите название папки", "error");
                        return;
                    }

                    const folder = {
                        name,
                        color,
                        dateAdded: new Date().toISOString()
                    };

                    try {
                        await saveToIndexedDB('bookmarkFolders', folder);

                        loadFoldersList(modal.querySelector('#foldersList'));

                        populateBookmarkFolders();

                        const folders = await getAllFromIndexedDB('bookmarkFolders');
                        renderBookmarkFolders(folders);

                        showNotification("Папка добавлена");
                        form.reset();

                        const defaultColorInput = form.querySelector('input[name="folderColor"][value="blue"]');
                        if (defaultColorInput) defaultColorInput.checked = true;
                    } catch (error) {
                        console.error("Error saving folder:", error);
                        showNotification("Ошибка при сохранении папки", "error");
                    }
                });
            }

            const foldersListElement = modal.querySelector('#foldersList');
            if (foldersListElement) {
                loadFoldersList(foldersListElement);
            } else {
                loadFoldersList();
            }

            modal.classList.remove('hidden');
        }


        async function handleDeleteBookmarkFolderClick(folderId, folderItem) {
            try {
                const folderToDelete = await getFromIndexedDB('bookmarkFolders', folderId);
                if (!folderToDelete) {
                    console.warn(`Папка закладок с ID ${folderId} не найдена для удаления из индекса.`);
                }

                if (folderToDelete && typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex('bookmarkFolders', folderId, folderToDelete, 'delete');
                        console.log(`Search index updated (delete) for bookmark folder ID: ${folderId}`);
                    } catch (indexError) {
                        console.error(`Error updating search index for bookmark folder deletion ${folderId}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса при удалении папки.", "warning");
                    }
                } else if (!folderToDelete) {
                } else {
                    console.warn("updateSearchIndex function not available for bookmark folder deletion.");
                }

                await deleteFromIndexedDB('bookmarkFolders', folderId);

                if (folderItem) folderItem.remove();
                populateBookmarkFolders();
                const updatedFolders = await getAllFromIndexedDB('bookmarkFolders');
                renderBookmarkFolders(updatedFolders);

                showNotification("Папка удалена");

                const foldersList = document.getElementById('foldersList');
                if (foldersList && foldersList.childElementCount === 0) {
                    foldersList.innerHTML = '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
                }

            } catch (error) {
                console.error("Error deleting bookmark folder:", error);
                showNotification("Ошибка при удалении папки", "error");
            }
        }



        // СИСТЕМА ССЫЛОК 1С
        function initCibLinkSystem() {
            const coreElements = getRequiredElements(['addLinkBtn', 'linksContainer', 'linksContent', 'linkSearchInput']);
            if (!coreElements) {
                console.error("!!! CIB Core elements missing in initCibLinkSystem. Aborting init.");
                return;
            }
            const { addLinkBtn, linksContainer, linksContent, linkSearchInput } = coreElements;

            addLinkBtn.addEventListener('click', () => showAddEditCibLinkModal());

            if (typeof debounce === 'function' && typeof filterLinks === 'function') {
                if (linkSearchInput) {
                    linkSearchInput.addEventListener('input', debounce(filterLinks, 250));
                } else {
                    console.error("!!! linkSearchInput element NOT FOUND when trying to attach listener.");
                }
            } else {
                console.error("!!! debounce or filterLinks function not found. CIB Link search will not work.");
            }

            loadCibLinks();

            linksContent.querySelectorAll('.view-toggle').forEach(button => {
                button.addEventListener('click', handleViewToggleClick);
            });

            linksContainer.addEventListener('click', handleLinkActionClick);

            initCibLinkModal();
        }


        function filterLinks() {
            filterItems({
                containerSelector: '#linksContainer',
                itemSelector: '.cib-link-item',
                searchInputSelector: 'linkSearchInput',
                textSelectors: ['h3', 'code', 'p']
            });
        }


        function initCibLinkModal() {
            const modal = document.getElementById('cibLinkModal');
            if (!modal) {
                console.warn("CIB Link modal (#cibLinkModal) not found during init.");
                return;
            }

            const form = modal.querySelector('#cibLinkForm');
            if (!form) {
                console.error("CIB Link modal form (#cibLinkForm) not found.");
                return;
            }

            modal.querySelectorAll('.close-modal, .cancel-modal').forEach(button => {
                button.addEventListener('click', () => {
                    modal.classList.add('hidden');
                });
            });

            form.addEventListener('submit', handleCibLinkSubmit);
        }


        function handleLinkActionClick(event) {
            const target = event.target;
            const button = target.closest('button');
            const linkItem = target.closest('.cib-link-item[data-id]');

            if (!linkItem) return;

            const linkId = parseInt(linkItem.dataset.id, 10);
            const codeElement = linkItem.querySelector('code');

            if (button) {
                event.stopPropagation();

                if (button.classList.contains('copy-cib-link')) {
                    if (codeElement) {
                        copyToClipboard(codeElement.textContent, 'Ссылка 1С скопирована!');
                    }
                    return;
                }

                if (button.classList.contains('edit-cib-link')) {
                    showAddEditCibLinkModal(linkId);
                    return;
                }

                if (button.classList.contains('delete-cib-link')) {
                    const titleElement = linkItem.querySelector('h3');
                    const linkTitle = titleElement ? (titleElement.getAttribute('title') || titleElement.textContent) : `ID ${linkId}`;
                    deleteCibLink(linkId, linkTitle);
                    return;
                }
            } else {
                if (codeElement) {
                    copyToClipboard(codeElement.textContent, 'Ссылка 1С скопирована!');
                }
            }
        }


        async function loadCibLinks() {
            const linksContainer = document.getElementById('linksContainer');
            if (!linksContainer) return;

            linksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Загрузка ссылок...</div>';

            try {
                let links = await getAllFromIndexedDB('links');

                if (!links || links.length === 0) {
                    console.log("База ссылок 1С пуста. Добавляем стартовый набор.");

                    const linksToSave = [...DEFAULT_CIB_LINKS];
                    const savedLinkIds = await Promise.all(
                        linksToSave.map(link => saveToIndexedDB('links', link))
                    );
                    const linksWithIds = linksToSave.map((link, index) => ({ ...link, id: savedLinkIds[index] }));

                    console.log("Стартовые ссылки добавлены в IndexedDB.");

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(linksWithIds.map(link =>
                            updateSearchIndex('links', link.id, link, 'update')
                                .catch(err => console.error(`Error indexing default CIB link ${link.id}:`, err))
                        ));
                        console.log("Default CIB links indexed.");
                    } else {
                        console.warn("updateSearchIndex function not available for default CIB links.");
                    }

                    links = await getAllFromIndexedDB('links');
                }

                renderCibLinks(links);

            } catch (error) {
                console.error("Ошибка при загрузке ссылок 1С:", error);
                linksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-red-500">Не удалось загрузить ссылки.</div>';
                applyCurrentView('linksContainer');
            }
        }


        async function getAllCibLinks() {
            try {
                const links = await getAllFromIndexedDB('links');
                return links || [];
            } catch (error) {
                console.error("Ошибка при получении всех ссылок 1С:", error);
                return [];
            }
        }


        function renderCibLinks(links) {
            const linksContainer = document.getElementById('linksContainer');
            if (!linksContainer) return;

            if (!links || links.length === 0) {
                linksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Нет сохраненных ссылок 1С. Нажмите "Добавить ссылку".</div>';
                applyCurrentView('linksContainer');
                return;
            }

            const fragment = document.createDocumentFragment();
            links.forEach(link => {
                const linkElement = document.createElement('div');
                linkElement.className = 'cib-link-item view-item group border-b border-gray-200 dark:border-gray-700';
                linkElement.dataset.id = link.id;

                linkElement.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between p-3 gap-2">
                <div class="flex-grow min-w-0">
                    <h3 class="font-semibold text-base group-hover:text-primary dark:group-hover:text-primary truncate" title="${link.title || ''}">${link.title || 'Без названия'}</h3>
                    <div class="mt-1 relative">
                        <code class="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all inline-block w-full pr-8">${link.link || ''}</code>
                        <button class="copy-cib-link absolute top-1/2 right-1 transform -translate-y-1/2 p-1 text-gray-500 hover:text-primary rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Копировать ссылку">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    ${link.description ? `<p class="text-gray-500 dark:text-gray-400 text-sm mt-1">${link.description}</p>` : ''}
                </div>
                <div class="flex flex-shrink-0 items-center gap-1 md:ml-4 mt-2 md:mt-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button class="edit-cib-link p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-cib-link p-1.5 text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
                fragment.appendChild(linkElement);
            });

            linksContainer.innerHTML = '';
            linksContainer.appendChild(fragment);

            if (linksContainer.classList.contains('flex-col') && linksContainer.lastElementChild) {
                linksContainer.lastElementChild.classList.remove('border-b', 'border-gray-200', 'dark:border-gray-700');
            }

            applyCurrentView('linksContainer');
        }


        async function showAddEditCibLinkModal(linkId = null) {
            const modalElements = getRequiredElements([
                'cibLinkModal', 'cibLinkForm', 'cibLinkModalTitle', 'cibLinkId',
                'saveCibLinkBtn', 'cibLinkTitle', 'cibLinkValue', 'cibLinkDescription'
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
                cibLinkDescription: descriptionInput
            } = modalElements;

            form.reset();
            linkIdInput.value = linkId ? linkId : '';

            try {
                if (linkId) {
                    modalTitle.textContent = 'Редактировать ссылку 1С';
                    saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';

                    const link = await getFromIndexedDB('links', linkId);
                    if (!link) {
                        showNotification(`Ссылка с ID ${linkId} не найдена`, "error");
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
                titleInput.focus();

            } catch (error) {
                console.error(`Ошибка при ${linkId ? 'загрузке' : 'подготовке'} ссылки 1С:`, error);
                showNotification(`Не удалось ${linkId ? 'загрузить данные' : 'открыть форму'} ссылки`, "error");
            }
        }


        async function handleCibLinkSubmit(event) {
            event.preventDefault();
            const form = event.target;
            const saveButton = form.querySelector('button[type="submit"]');
            if (saveButton) saveButton.disabled = true;

            const id = form.elements.cibLinkId.value;
            const title = form.elements.cibLinkTitle.value.trim();
            const linkValue = form.elements.cibLinkValue.value.trim();
            const description = form.elements.cibLinkDescription.value.trim();

            if (!title || !linkValue) {
                showNotification("Пожалуйста, заполните поля 'Название' и 'Ссылка 1С'", "error");
                if (saveButton) saveButton.disabled = false;
                return;
            }

            const newData = {
                title,
                link: linkValue,
                description,
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
                        oldData = await getFromIndexedDB('links', newData.id);
                        newData.dateAdded = oldData?.dateAdded || timestamp;
                    } catch (fetchError) {
                        console.warn(`Не удалось получить старые данные ссылки 1С (${newData.id}) перед обновлением индекса:`, fetchError);
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

                if (typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex(
                            'links',
                            finalId,
                            newData,
                            isEditing ? 'update' : 'add',
                            oldData
                        );
                        const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                        console.log(`Обновление индекса для ссылки 1С (${finalId}) инициировано ${oldDataStatus}.`);
                    } catch (indexError) {
                        console.error(`Ошибка обновления поискового индекса для ссылки 1С ${finalId}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса для ссылки.", "warning");
                    }
                } else {
                    console.warn("Функция updateSearchIndex недоступна.");
                }

                showNotification(isEditing ? "Ссылка обновлена" : "Ссылка добавлена");
                document.getElementById('cibLinkModal')?.classList.add('hidden');
                loadCibLinks();

            } catch (error) {
                console.error("Ошибка при сохранении ссылки 1С:", error);
                showNotification("Не удалось сохранить ссылку", "error");
            } finally {
                if (saveButton) saveButton.disabled = false;
            }
        }


        async function deleteCibLink(linkId, linkTitle) {
            if (confirm(`Вы уверены, что хотите удалить ссылку "${linkTitle || `ID ${linkId}`}"?`)) {
                try {
                    const linkToDelete = await getFromIndexedDB('links', linkId);
                    if (!linkToDelete) {
                        console.warn(`Ссылка 1С с ID ${linkId} не найдена для удаления из индекса.`);
                    }

                    if (linkToDelete && typeof updateSearchIndex === 'function') {
                        try {
                            await updateSearchIndex('links', linkId, linkToDelete, 'delete');
                            console.log(`Search index updated (delete) for CIB link ID: ${linkId}`);
                        } catch (indexError) {
                            console.error(`Error updating search index for CIB link deletion ${linkId}:`, indexError);
                        }
                    } else if (!linkToDelete) {
                    } else {
                        console.warn("updateSearchIndex function not available for CIB link deletion.");
                    }

                    await deleteFromIndexedDB('links', linkId);
                    showNotification("Ссылка удалена");
                    loadCibLinks();

                } catch (error) {
                    console.error("Ошибка при удалении ссылки 1С:", error);
                    showNotification("Не удалось удалить ссылку", "error");
                }
            }
        }


        function copyToClipboard(text, successMessage = "Скопировано!") {
            if (!navigator.clipboard) {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    showNotification(successMessage);
                } catch (err) {
                    console.error('Fallback: Ошибка копирования', err);
                    showNotification("Ошибка при копировании", "error");
                } finally {
                    document.body.removeChild(textArea);
                }
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                showNotification(successMessage);
            }).catch(err => {
                console.error('Ошибка копирования в буфер обмена: ', err);
                showNotification("Не удалось скопировать", "error");
            });
        }


        function initLinkSystem() {
            const addLinkBtn = document.getElementById('addLinkBtn');
            const linkSearchInput = document.getElementById('linkSearchInput');
            const linkCategoryFilter = document.getElementById('linkCategoryFilter');
            const linksContainer = document.getElementById('linksContainer');

            if (!addLinkBtn || !linksContainer) {
                console.warn("Elements for general link system (addLinkBtn, linksContainer) missing in initLinkSystem.");
            }

            if (linkSearchInput) {
                linkSearchInput.addEventListener('input', () => {
                    filterLinks();
                });
            } else {
                console.warn("Link search input (#linkSearchInput) not found for initLinkSystem.");
            }

            if (linkCategoryFilter) {
                linkCategoryFilter.addEventListener('change', () => {
                    filterLinks();
                });
            } else {
                console.warn("Link category filter (#linkCategoryFilter) not found for initLinkSystem.");
            }
        }


        // СИСТЕМА РЕГЛАМЕНТОВ
        function initReglamentsSystem() {
            const addReglamentBtn = document.getElementById('addReglamentBtn');
            const addCategoryBtn = document.getElementById('addReglamentCategoryBtn');
            const categoryGrid = document.getElementById('reglamentCategoryGrid');
            const reglamentsListDiv = document.getElementById('reglamentsList');
            const backToCategoriesBtn = document.getElementById('backToCategories');

            if (!addReglamentBtn) console.error("Кнопка #addReglamentBtn не найдена!");
            if (!addCategoryBtn) console.error("Кнопка #addReglamentCategoryBtn не найдена!");
            if (!categoryGrid) console.error("Сетка категорий #reglamentCategoryGrid не найдена!");
            if (!reglamentsListDiv) console.error("Контейнер списка #reglamentsList не найден!");
            if (!backToCategoriesBtn) console.error("Кнопка #backToCategories не найдена!");

            addReglamentBtn?.addEventListener('click', () => {
                const currentCategoryId = reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden')
                    ? reglamentsListDiv.dataset.currentCategory
                    : null;
                showAddReglamentModal(currentCategoryId);
            });

            addCategoryBtn?.addEventListener('click', () => showAddCategoryModal());

            if (!categoryGrid) {
                console.error("Reglament category grid not found in initReglamentsSystem.");
                return;
            }

            renderReglamentCategories();
            populateReglamentCategoryDropdowns();

            categoryGrid.addEventListener('click', (event) => {
                const categoryElement = event.target.closest('.reglament-category');
                if (!categoryElement) return;

                const categoryId = categoryElement.dataset.category;

                if (event.target.closest('.delete-category-btn')) {
                    handleDeleteCategoryClick(event);
                } else if (event.target.closest('.edit-category-btn')) {
                    event.stopPropagation();
                    showAddCategoryModal(categoryId);
                } else {
                    showReglamentsForCategory(categoryId);
                    if (addCategoryBtn) {
                        addCategoryBtn.classList.add('hidden');
                    }
                    if (reglamentsListDiv) {
                        reglamentsListDiv.dataset.currentCategory = categoryId;
                    }
                }
            });

            backToCategoriesBtn?.addEventListener('click', () => {
                if (reglamentsListDiv) {
                    reglamentsListDiv.classList.add('hidden');
                    delete reglamentsListDiv.dataset.currentCategory;
                }
                if (categoryGrid) categoryGrid.classList.remove('hidden');
                const reglamentsContainer = document.getElementById('reglamentsContainer');
                if (reglamentsContainer) reglamentsContainer.innerHTML = '';
                const currentCategoryTitle = document.getElementById('currentCategoryTitle');
                if (currentCategoryTitle) currentCategoryTitle.textContent = '';

                if (addCategoryBtn) {
                    addCategoryBtn.classList.remove('hidden');
                }
            });
        }


        async function showReglamentDetail(reglamentId) {
            if (typeof reglamentId !== 'number' && typeof reglamentId !== 'string') {
                console.error("showReglamentDetail: Invalid reglamentId provided:", reglamentId);
                showNotification("Ошибка: Неверный ID регламента.", "error");
                return;
            }
            const numericId = parseInt(reglamentId, 10);
            if (isNaN(numericId)) {
                console.error("showReglamentDetail: Could not parse reglamentId to number:", reglamentId);
                showNotification("Ошибка: Неверный формат ID регламента.", "error");
                return;
            }

            const modalId = 'reglamentDetailModal';
            const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-[70] p-4';

            const modalHTML = `
                                <div class="flex items-center justify-center min-h-full">
                                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

                                        <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                            <div class="flex justify-between items-center">
                                                <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100" id="reglamentDetailTitle">Детали регламента</h2>
                                                <button class="close-detail-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" aria-label="Закрыть">
                                                    <i class="fas fa-times text-xl"></i>
                                                </button>
                                            </div>
                                        </div>

                                        <div class="flex-1 overflow-y-auto p-6" id="reglamentDetailContent">
                                            <p class="text-center text-gray-500 dark:text-gray-400">Загрузка данных...</p>
                                        </div>

                                        <div class="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
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

            const setupDetailModal = (modalElement) => {
                const editButton = modalElement.querySelector('#editReglamentFromDetailBtn');
                if (editButton) {
                    editButton.addEventListener('click', () => {
                        const currentId = modalElement.dataset.currentReglamentId;
                        if (currentId) {
                            if (typeof editReglament === 'function') {
                                modalElement.classList.add('hidden');
                                editReglament(parseInt(currentId, 10));
                            } else {
                                console.error("Функция editReglament не найдена!");
                                showNotification("Ошибка: Функция редактирования недоступна.", "error");
                            }
                        } else {
                            console.error("Не найден ID регламента для редактирования в dataset модального окна");
                            showNotification("Ошибка: Не удалось определить ID для редактирования.", "error");
                        }
                    });
                } else {
                    console.error("Кнопка редактирования #editReglamentFromDetailBtn не найдена в модальном окне деталей");
                }
            };

            const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupDetailModal);

            const titleElement = modal.querySelector('#reglamentDetailTitle');
            const contentElement = modal.querySelector('#reglamentDetailContent');
            const metaElement = modal.querySelector('#reglamentDetailMeta');
            const editButton = modal.querySelector('#editReglamentFromDetailBtn');

            if (titleElement) titleElement.textContent = 'Загрузка регламента...';
            if (contentElement) contentElement.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400">Загрузка данных...</p>';
            if (metaElement) metaElement.textContent = '';
            if (editButton) editButton.disabled = true;
            modal.dataset.currentReglamentId = numericId;

            modal.classList.remove('hidden');

            try {
                const reglament = await getFromIndexedDB('reglaments', numericId);

                if (!reglament) {
                    if (titleElement) titleElement.textContent = 'Ошибка';
                    if (contentElement) contentElement.innerHTML = `<p class="text-red-500 text-center font-semibold">Регламент с ID ${numericId} не найден.</p>`;
                    showNotification("Регламент не найден", "error");
                    if (editButton) editButton.disabled = true;
                    return;
                }

                if (titleElement) titleElement.textContent = reglament.title || 'Без заголовка';

                if (contentElement) {
                    try {
                        const preElement = document.createElement('pre');
                        preElement.className = 'whitespace-pre-wrap break-words text-sm font-sans';
                        preElement.textContent = reglament.content || 'Содержимое отсутствует.';
                        contentElement.innerHTML = '';
                        contentElement.appendChild(preElement);


                    } catch (error) {
                        console.error("Error setting reglament content:", error);
                        contentElement.textContent = 'Ошибка отображения содержимого.';
                    }
                }

                if (metaElement) {
                    const categoryInfo = reglament.category ? categoryDisplayInfo[reglament.category] : null;
                    const categoryName = categoryInfo ? categoryInfo.title : reglament.category || 'Без категории';
                    const dateAdded = reglament.dateAdded ? new Date(reglament.dateAdded).toLocaleDateString() : 'Неизвестно';
                    const dateUpdated = reglament.dateUpdated ? new Date(reglament.dateUpdated).toLocaleDateString() : null;

                    let metaParts = [
                        `ID: ${reglament.id}`,
                        `Категория: ${categoryName}`,
                        `Добавлен: ${dateAdded}`
                    ];
                    if (dateUpdated) {
                        metaParts.push(`Обновлен: ${dateUpdated}`);
                    }
                    metaElement.textContent = metaParts.join(' | ');
                }

                if (editButton) editButton.disabled = false;

            } catch (error) {
                console.error(`Error fetching or displaying reglament ${numericId}:`, error);
                if (titleElement) titleElement.textContent = 'Ошибка загрузки';
                if (contentElement) contentElement.innerHTML = `<p class="text-red-500 text-center font-semibold">Не удалось загрузить регламент.</p>`;
                showNotification("Ошибка при загрузке регламента", "error");
                if (editButton) editButton.disabled = true;
            }
        }


        function renderReglamentCategories() {
            const categoryGrid = document.getElementById('reglamentCategoryGrid');
            if (!categoryGrid) {
                console.error("Category grid container (#reglamentCategoryGrid) not found.");
                return;
            }
            categoryGrid.innerHTML = '';

            Object.entries(categoryDisplayInfo).forEach(([categoryId, info]) => {
                const categoryElement = createCategoryElement(categoryId, info.title, info.icon, info.color);
                categoryGrid.appendChild(categoryElement);
            });

            if (categoryGrid.innerHTML === '') {
                categoryGrid.innerHTML = '<div class="text-center py-6 text-gray-500 md:col-span-3">Нет категорий. Нажмите "Добавить категорию".</div>';
            }
        }


        function createCategoryElement(categoryId, title, iconClass = 'fa-folder', color = 'gray') {
            const categoryElement = document.createElement('div');
            categoryElement.className = `reglament-category bg-white dark:bg-gray-700 p-content rounded-lg shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between group relative border-l-4 border-${color}-500`;
            categoryElement.dataset.category = categoryId;

            categoryElement.innerHTML = `
                                        <div class="flex items-start mb-2">
                                            <i class="fas ${iconClass} text-${color}-500 text-xl mr-3 mt-1"></i>
                                            <h4 class="font-bold text-lg flex-grow">${title}</h4>
                                            <div class="category-actions absolute top-2 right-2 flex flex-col items-end space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                <button class="edit-category-btn p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600" title="Редактировать категорию">
                                                    <i class="fas fa-edit text-xs"></i>
                                                </button>
                                                <button class="delete-category-btn p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600" title="Удалить категорию">
                                                    <i class="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">Нажмите, чтобы просмотреть регламенты</p>
    `;
            return categoryElement;
        }


        function showAddCategoryModal(editCategoryId = null) {
            const modalId = 'addReglamentCategoryModal';
            let modal = document.getElementById(modalId);
            let isNewModal = false;

            if (!modal) {
                isNewModal = true;
                modal = document.createElement('div');
                modal.innerHTML = `
                                    <div class="flex items-center justify-center min-h-full">
                                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                                            <form id="addCategoryForm">
                                                <div class="p-6">
                                                    <div class="flex justify-between items-center mb-4">
                                                        <h2 class="text-xl font-bold" id="categoryModalTitle">Добавить категорию</h2>
                                                        <button type="button" class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                            <i class="fas fa-times text-xl"></i>
                                                        </button>
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="newCategoryTitle">Название категории</label>
                                                        <input type="text" id="newCategoryTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="newCategoryId">ID категории (англ, без пробелов)</label>
                                                        <input type="text" id="newCategoryId" required pattern="^[a-zA-Z0-9_-]+$" title="Используйте буквы, цифры, дефис, подчеркивание" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                        <p class="text-xs text-gray-500 mt-1">Например: 'general-questions', 'billing_issues'. <strong class="text-red-600">Нельзя изменить после создания.</strong></p>
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="newCategoryIcon">Иконка (Font Awesome класс)</label>
                                                        <input type="text" id="newCategoryIcon" value="fa-folder-open" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                        <p class="text-xs text-gray-500 mt-1">Например: 'fa-book', 'fa-shield-alt'. <a href="https://fontawesome.com/search?m=free" target="_blank" class="text-primary hover:underline">Найти иконки</a></p>
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="newCategoryColor">Цвет (Tailwind)</label>
                                                        <select id="newCategoryColor" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                            <option value="gray">Серый</option>
                                                            <option value="red">Красный</option>
                                                            <option value="blue" selected>Синий</option>
                                                            <option value="rose">Розовый (Rose)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div class="bg-gray-50 dark:bg-gray-700 px-6 py-3 flex justify-end">
                                                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition mr-2 ">
                                                        Отмена
                                                    </button>
                                                    <button type="submit" id="categorySubmitBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                                        Добавить категорию
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                 `;
                document.body.appendChild(modal);

                modal.querySelector('#addCategoryForm').addEventListener('submit', handleAddCategorySubmit);
                modal.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
                    btn.addEventListener('click', () => modal.classList.add('hidden'));
                });
            }

            const form = modal.querySelector('#addCategoryForm');
            const modalTitle = modal.querySelector('#categoryModalTitle');
            const submitBtn = modal.querySelector('#categorySubmitBtn');
            const categoryIdInput = modal.querySelector('#newCategoryId');

            form.reset();

            if (editCategoryId && categoryDisplayInfo[editCategoryId]) {
                const categoryData = categoryDisplayInfo[editCategoryId];
                modalTitle.textContent = 'Редактировать категорию';
                submitBtn.textContent = 'Сохранить изменения';
                form.dataset.editingId = editCategoryId;

                modal.querySelector('#newCategoryTitle').value = categoryData.title;
                categoryIdInput.value = editCategoryId;
                categoryIdInput.readOnly = true;
                categoryIdInput.classList.add('bg-gray-200', 'dark:bg-gray-600', 'cursor-not-allowed');
                modal.querySelector('#newCategoryIcon').value = categoryData.icon || 'fa-folder-open';
                modal.querySelector('#newCategoryColor').value = categoryData.color || 'gray';

            } else {
                modalTitle.textContent = 'Добавить категорию';
                submitBtn.textContent = 'Добавить категорию';
                delete form.dataset.editingId;
                categoryIdInput.readOnly = false;
                categoryIdInput.classList.remove('bg-gray-200', 'dark:bg-gray-600', 'cursor-not-allowed');
            }

            modal.classList.remove('hidden');
            modal.querySelector('#newCategoryTitle').focus();
        }


        async function handleSaveFolderSubmit(event) {
            event.preventDefault();
            const folderForm = event.target;

            if (!name) {
                showNotification("Пожалуйста, введите название папки", "error");
                return;
            }

            const folderData = {
                name,
                color,
            };

            const isEditing = folderForm.dataset.editingId;
            let oldData = null;
            let finalId = null;
            const timestamp = new Date().toISOString();

            try {
                if (isEditing) {
                    folderData.id = parseInt(folderForm.dataset.editingId);
                    finalId = folderData.id;
                    try {
                        oldData = await getFromIndexedDB('bookmarkFolders', finalId);
                        folderData.dateAdded = oldData?.dateAdded || timestamp;
                    } catch (fetchError) {
                        console.warn(`Не удалось получить старые данные папки закладок (${finalId}):`, fetchError);
                        folderData.dateAdded = timestamp;
                    }
                    folderData.dateUpdated = timestamp;
                } else {
                    folderData.dateAdded = timestamp;
                }

                const savedResult = await saveToIndexedDB('bookmarkFolders', folderData);
                if (!isEditing) {
                    finalId = savedResult;
                    folderData.id = finalId;
                }

                if (typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex(
                            'bookmarkFolders',
                            finalId,
                            folderData,
                            isEditing ? 'update' : 'add',
                            oldData
                        );
                        console.log(`Search index updated for bookmark folder ID: ${finalId}`);
                    } catch (indexError) {
                        console.error(`Error updating search index for bookmark folder ${finalId}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса для папки.", "warning");
                    }
                } else {
                    console.warn("updateSearchIndex function not available for bookmark folder.");
                }

                loadFoldersList(document.getElementById('foldersList'));
                populateBookmarkFolders();
                const folders = await getAllFromIndexedDB('bookmarkFolders');
                renderBookmarkFolders(folders);

                showNotification(isEditing ? "Папка обновлена" : "Папка добавлена");
                folderForm.reset();
                delete folderForm.dataset.editingId;
                const defaultColorInput = folderForm.querySelector('input[name="folderColor"][value="blue"]');
                if (defaultColorInput) defaultColorInput.checked = true;
                const foldersModal = document.getElementById('foldersModal');
                if (foldersModal) foldersModal.classList.add('hidden');


            } catch (error) {
                console.error("Error saving bookmark folder:", error);
                showNotification("Ошибка при сохранении папки", "error");
            }
        }


        async function handleDeleteCategoryClick(event) {
            const deleteButton = event.target.closest('.delete-category-btn');
            if (!deleteButton) return;

            event.stopPropagation();

            const categoryElement = deleteButton.closest('.reglament-category');
            const categoryId = categoryElement?.dataset.category;
            const categoryTitle = categoryElement?.querySelector('h4')?.textContent || 'Выбранная категория';

            if (!categoryId) {
                console.error("Could not determine category ID for deletion.");
                return;
            }

            const protectedCategories = ['difficult-client', 'tech-support', 'emergency'];
            if (protectedCategories.includes(categoryId)) {
                showNotification(`Категорию "${categoryTitle}" нельзя удалить (системная).`, "warning");
                return;
            }

            try {
                const regulations = await getReglamentsByCategory(categoryId);
                if (regulations && regulations.length > 0) {
                    showNotification(`Нельзя удалить категорию "${categoryTitle}", т.к. она содержит ${regulations.length} регламент(ов). Сначала удалите или переместите регламенты.`, "error", 5000);
                    return;
                }

                if (confirm(`Вы уверены, что хотите удалить категорию "${categoryTitle}"? Это действие необратимо.`)) {
                    if (categoryDisplayInfo[categoryId]) {
                        delete categoryDisplayInfo[categoryId];
                        const success = await saveCategoryInfo();
                        if (success) {
                            renderReglamentCategories();
                            showNotification(`Категория "${categoryTitle}" удалена.`);
                        } else {
                            showNotification("Ошибка при сохранении удаления категории.", "error");
                        }
                    } else {
                        showNotification("Ошибка: Категория для удаления не найдена в данных.", "error");
                        categoryElement.remove();
                        renderReglamentCategories();
                    }
                }
            } catch (error) {
                console.error("Error checking/deleting category:", error);
                showNotification("Ошибка при удалении категории.", "error");
            }
        }


        async function loadReglaments() {
            if (!db) return false;

            try {
                const reglaments = await getAllFromIndexedDB('reglaments');

                if (!reglaments || reglaments.length === 0) {
                    const sampleReglamentsData = [
                        { title: 'Работа с агрессивным клиентом', content: 'Сохраняйте спокойствие, следуйте скрипту...', category: 'difficult-client', dateAdded: new Date().toISOString() },
                        { title: 'Стандарт ответа на обращение', content: '1. Приветствие\n2. Идентификация\n3. Решение', category: 'tech-support', dateAdded: new Date().toISOString() }
                    ];
                    const savedReglamentIds = await Promise.all(
                        sampleReglamentsData.map(reglament => saveToIndexedDB('reglaments', reglament))
                    );
                    const reglamentsWithIds = sampleReglamentsData.map((reglament, index) => ({ ...reglament, id: savedReglamentIds[index] }));


                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(reglamentsWithIds.map(reglament =>
                            updateSearchIndex('reglaments', reglament.id, reglament, 'update')
                                .catch(err => console.error(`Error indexing default reglament ${reglament.id}:`, err))
                        ));
                        console.log("Default reglaments indexed.");
                    } else {
                        console.warn("updateSearchIndex function not available for default reglaments.");
                    }
                    console.log("Стартовые регламенты добавлены.");
                }
                return true;
            } catch (error) {
                console.error("Error loading reglaments:", error);
                return false;
            }
        }


        async function getAllReglaments() {
            try {
                const reglaments = await getAllFromIndexedDB('reglaments');
                return reglaments || [];
            } catch (error) {
                console.error("Ошибка при получении всех регламентов:", error);
                return [];
            }
        }


        async function importReglaments(reglaments) {
            if (!db || !Array.isArray(reglaments)) return false;

            try {
                await clearIndexedDBStore('reglaments');
                await Promise.all(
                    reglaments.map(reglament => saveToIndexedDB('reglaments', reglament))
                );

                return true;
            } catch (error) {
                console.error("Error importing reglaments:", error);
                return false;
            }
        }


        async function showReglamentsForCategory(categoryId) {
            const reglamentsContainer = document.getElementById('reglamentsContainer');
            const reglamentsListDiv = document.getElementById('reglamentsList');
            const currentCategoryTitleEl = document.getElementById('currentCategoryTitle');
            const categoryGridElement = document.getElementById('reglamentCategoryGrid');

            if (!reglamentsContainer || !reglamentsListDiv || !currentCategoryTitleEl || !categoryGridElement) {
                console.error("Ошибка: Не найдены ключевые элементы для отображения регламентов (#reglamentsContainer, #reglamentsList, #currentCategoryTitle, #reglamentCategoryGrid).");
                showNotification("Ошибка интерфейса регламентов", "error");
                return;
            }

            const title = categoryDisplayInfo[categoryId]?.title || categoryId;
            currentCategoryTitleEl.textContent = title;

            categoryGridElement.classList.add('hidden');
            reglamentsListDiv.classList.remove('hidden');
            reglamentsContainer.innerHTML = '<div class="text-center py-6 text-gray-500">Загрузка регламентов...</div>';

            reglamentsListDiv.removeEventListener('click', handleReglamentAction);
            reglamentsListDiv.addEventListener('click', handleReglamentAction);

            try {
                const reglaments = await getReglamentsByCategory(categoryId);
                reglamentsContainer.innerHTML = '';

                if (!reglaments || reglaments.length === 0) {
                    reglamentsContainer.innerHTML = '<div class="text-center py-6 text-gray-500 dark:text-gray-400">В этой категории пока нет регламентов. <br> Вы можете <button class="text-primary hover:underline font-medium" data-action="add-reglament-from-empty">добавить регламент</button> в эту категорию.</div>';
                    applyCurrentView('reglamentsContainer');
                    return;
                }

                const fragment = document.createDocumentFragment();
                reglaments.forEach(reglament => {
                    const reglamentElement = document.createElement('div');
                    reglamentElement.className = 'reglament-item view-item group flex justify-between items-center cursor-pointer';
                    reglamentElement.dataset.id = reglament.id;

                    reglamentElement.innerHTML = `
            <div class="flex-grow min-w-0 mr-3" data-action="view">
                 <h4 class="font-semibold group-hover:text-primary dark:group-hover:text-primary truncate" title="${reglament.title}">${reglament.title}</h4>
            </div>
             <div class="reglament-actions flex flex-shrink-0 items-center ml-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                <button data-action="edit" class="edit-reglament-inline p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
                <button data-action="delete" class="delete-reglament-inline p-1.5 text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
                    fragment.appendChild(reglamentElement);
                });

                reglamentsContainer.appendChild(fragment);
                applyCurrentView('reglamentsContainer');


            } catch (error) {
                console.error(`Ошибка при загрузке регламентов для категории ${categoryId}:`, error);
                reglamentsContainer.innerHTML = '<div class="text-center py-6 text-red-500">Не удалось загрузить регламенты.</div>';
                showNotification("Ошибка загрузки регламентов", "error");
            } finally {
                reglamentsListDiv.scrollTop = 0;
            }
        }


        function handleReglamentAction(event) {
            const target = event.target;

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
                event.stopPropagation();

                if (action === 'edit') {
                    editReglament(reglamentId);
                } else if (action === 'delete') {
                    const title = reglamentItem.querySelector('h4')?.title || `ID ${reglamentId}`;
                    if (confirm(`Вы уверены, что хотите удалить регламент "${title}"?`)) {
                        deleteReglamentFromList(reglamentId, reglamentItem);
                    }
                }
            } else {
                event.stopPropagation();
                showReglamentDetail(reglamentId);
            }
        }


        async function deleteReglamentFromList(id, elementToRemove) {
            try {
                const reglamentToDelete = await getFromIndexedDB('reglaments', id);
                if (!reglamentToDelete) {
                    console.warn(`Регламент с ID ${id} не найден для удаления из индекса.`);
                }

                if (reglamentToDelete && typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex('reglaments', id, reglamentToDelete, 'delete');
                        console.log(`Search index updated (delete) for reglament ID: ${id}`);
                    } catch (indexError) {
                        console.error(`Error updating search index for reglament deletion ${id}:`, indexError);
                    }
                } else if (!reglamentToDelete) {
                } else {
                    console.warn("updateSearchIndex function is not available for reglament deletion.");
                }

                await deleteFromIndexedDB('reglaments', id);
                showNotification("Регламент удален");

                if (elementToRemove) {
                    elementToRemove.remove();
                    const container = document.getElementById('reglamentsContainer');
                    if (container && container.childElementCount === 0) {
                        container.innerHTML = '<div class="text-center py-6 text-gray-500">В этой категории пока нет регламентов. <br> Вы можете <button class="text-primary hover:underline font-medium" data-action="add-reglament-from-empty">добавить регламент</button> в эту категорию.</div>';
                    }
                } else {
                    const reglamentsListDiv = document.getElementById('reglamentsList');
                    const currentCategoryId = reglamentsListDiv?.dataset.currentCategory;
                    if (currentCategoryId && !reglamentsListDiv.classList.contains('hidden')) {
                        await showReglamentsForCategory(currentCategoryId);
                    }
                }
            } catch (error) {
                console.error("Ошибка при удалении регламента:", error);
                showNotification("Не удалось удалить регламент", "error");
            }
        }


        function getReglamentsByCategory(category) {
            return new Promise((resolve, reject) => {
                if (!db) {
                    console.error("База данных не инициализирована для getReglamentsByCategory");
                    return reject("База данных не готова");
                }
                try {
                    const transaction = db.transaction('reglaments', 'readonly');
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
                    console.error("Ошибка при создании транзакции или доступе к хранилищу/индексу:", error);
                    reject(error);
                }
            });
        }


        const getOrCreateModal = (id, baseClassName, innerHTML, setupCallback) => {
            let modal = document.getElementById(id);
            if (modal) {
                if (typeof setupCallback === 'function' && !modal.dataset.setupComplete) {
                    try {
                        setupCallback(modal);
                        modal.dataset.setupComplete = 'true';
                    } catch (error) {
                        console.error(`[getOrCreateModal] Error re-executing setupCallback for existing modal #${id}:`, error);
                    }
                }
                return modal;
            }

            modal = document.createElement('div');
            modal.id = id;
            modal.className = baseClassName;
            modal.classList.add('flex', 'items-center', 'justify-center');
            modal.innerHTML = innerHTML;

            if (!document.body) {
                console.error(`[getOrCreateModal] document.body not available when creating modal #${id}. Appending might fail.`);
                throw new Error(`[getOrCreateModal] document.body not available when creating modal #${id}.`);
            }
            document.body.appendChild(modal);

            modal.addEventListener('click', (event) => {
                const target = event.target;
                if (target.closest('.close-modal, .cancel-modal, .close-detail-modal, .cancel-edit-modal, .close-sample-modal, .cancel-add-modal, .closeConfirmClearModalBtns, .close-edit-modal')) {
                    console.log(`[${id} Click Handler] Close button clicked. Hiding modal.`);
                    modal.classList.add('hidden');
                } else {
                }
            });

            if (typeof setupCallback === 'function') {
                try {
                    setupCallback(modal);
                    modal.dataset.setupComplete = 'true';
                } catch (error) {
                    console.error(`[getOrCreateModal] Error executing setupCallback for modal #${id}:`, error);
                }
            } else {
                modal.dataset.setupComplete = 'true';
            }

            return modal;
        };


        async function showAddReglamentModal(currentCategoryId = null) {
            const modalId = 'reglamentModal';
            const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
            const modalHTML = `
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] max-w-5xl h-[90vh] flex flex-col overflow-hidden p-2">

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

                            <div class="flex-1 overflow-y-auto p-6">
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

                            <div class="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
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

            const reglamentModalConfig = {};

            const setupAddForm = (modalElement) => {
                const form = modalElement.querySelector('#reglamentForm');
                const titleInput = form.elements.reglamentTitle;
                const categorySelect = form.elements.reglamentCategory;
                const contentTextarea = form.elements.reglamentContent;
                const idInput = form.elements.reglamentId;
                const saveButton = modalElement.querySelector('#saveReglamentBtn');


                if (!form.dataset.submitHandlerAttached) {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        if (saveButton) {
                            saveButton.disabled = true;
                            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';
                        }

                        const title = titleInput.value.trim();
                        const category = categorySelect.value;
                        const content = contentTextarea.value.trim();
                        const reglamentId = idInput.value;

                        if (!title || !category || !content) {
                            showNotification("Пожалуйста, заполните все обязательные поля (Название, Категория, Содержание)", "error");
                            if (saveButton) {
                                saveButton.disabled = false;
                                saveButton.innerHTML = `<i class="fas fa-save mr-1"></i> ${reglamentId ? 'Сохранить изменения' : 'Сохранить'}`;
                            }
                            return;
                        }

                        const newData = {
                            title,
                            category,
                            content,
                        };

                        const isEditing = !!reglamentId;
                        let oldData = null;
                        let finalId = null;

                        try {
                            const timestamp = new Date().toISOString();
                            if (isEditing) {
                                newData.id = parseInt(reglamentId, 10);
                                finalId = newData.id;

                                try {
                                    oldData = await getFromIndexedDB('reglaments', newData.id);
                                    newData.dateAdded = oldData?.dateAdded || timestamp;
                                } catch (fetchError) {
                                    console.warn(`Не удалось получить старые данные регламента (${newData.id}):`, fetchError);
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

                            if (typeof updateSearchIndex === 'function') {
                                try {
                                    await updateSearchIndex(
                                        'reglaments',
                                        finalId,
                                        newData,
                                        isEditing ? 'update' : 'add',
                                        oldData
                                    );
                                    const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                                    console.log(`Обновление индекса для регламента (${finalId}) инициировано ${oldDataStatus}.`);
                                } catch (indexError) {
                                    console.error(`Ошибка обновления поискового индекса для регламента ${finalId}:`, indexError);
                                    showNotification("Ошибка обновления поискового индекса для регламента.", "warning");
                                }
                            } else {
                                console.warn("Функция updateSearchIndex недоступна.");
                            }

                            showNotification(isEditing ? "Регламент успешно обновлен" : "Регламент успешно добавлен");

                            const reglamentsListDiv = document.getElementById('reglamentsList');
                            const currentCategoryTitleEl = document.getElementById('currentCategoryTitle');

                            if (reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden') && currentCategoryTitleEl) {
                                const displayedCategoryId = reglamentsListDiv.dataset.currentCategory;

                                if (displayedCategoryId === category && typeof showReglamentsForCategory === 'function') {
                                    console.log(`Регламент ${isEditing ? 'обновлен' : 'добавлен'} в текущей категории (${category}). Обновление списка.`);
                                    await showReglamentsForCategory(category);
                                } else {
                                    console.log(`Регламент сохранен в категории ${category}, текущая категория ${displayedCategoryId}. Список не обновляется.`);
                                }
                            }


                            modalElement.classList.add('hidden');
                            form.reset();
                            idInput.value = '';

                        } catch (error) {
                            console.error("Ошибка при сохранении регламента:", error);
                            showNotification("Ошибка при сохранении регламента: " + (error.message || error), "error");
                        } finally {
                            if (saveButton) {
                                saveButton.disabled = false;
                                saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
                                const modalTitleEl = modalElement.querySelector('#reglamentModalTitle');
                                if (modalTitleEl) modalTitleEl.textContent = 'Добавить регламент';
                            }
                        }
                    });
                    form.dataset.submitHandlerAttached = 'true';
                }

                const fullscreenBtn = modalElement.querySelector('#toggleFullscreenReglamentBtn');
                if (fullscreenBtn && !fullscreenBtn.dataset.listenerAttached) {
                    fullscreenBtn.addEventListener('click', () => {
                        if (typeof toggleModalFullscreen === 'function') {
                            toggleModalFullscreen(
                                reglamentModalConfig.modalId,
                                reglamentModalConfig.buttonId,
                                reglamentModalConfig.classToggleConfig,
                                reglamentModalConfig.innerContainerSelector,
                                reglamentModalConfig.contentAreaSelector
                            );
                        } else {
                            console.error('Функция toggleModalFullscreen не найдена!');
                        }
                    });
                    fullscreenBtn.dataset.listenerAttached = 'true';
                    console.log('Fullscreen listener attached for reglamentModal via setupCallback');
                } else if (!fullscreenBtn) {
                    console.error('Кнопка #toggleFullscreenReglamentBtn не найдена в модальном окне регламента во время setupCallback.');
                }
            };

            const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupAddForm);

            const categorySelect = modal.querySelector('#reglamentCategory');
            const titleInput = modal.querySelector('#reglamentTitle');

            if (categorySelect) {
                while (categorySelect.options.length > 1) {
                    categorySelect.remove(1);
                }
                if (typeof populateReglamentCategoryDropdowns === 'function') {
                    populateReglamentCategoryDropdowns();
                } else {
                    console.error("Функция populateReglamentCategoryDropdowns не найдена!");
                }

                if (currentCategoryId) {
                    setTimeout(() => {
                        const optionExists = categorySelect.querySelector(`option[value="${currentCategoryId}"]`);
                        if (optionExists) {
                            categorySelect.value = currentCategoryId;
                        } else {
                            console.warn(`Category ID ${currentCategoryId} not found in dropdown.`);
                            categorySelect.value = '';
                        }
                    }, 50);
                } else {
                    categorySelect.value = '';
                }
            } else {
                console.error("Элемент <select> #reglamentCategory не найден!");
            }

            const form = modal.querySelector('#reglamentForm');
            if (form) {
                form.reset();
                const idInput = form.querySelector('#reglamentId');
                if (idInput) idInput.value = '';
            }
            const saveBtn = modal.querySelector('#saveReglamentBtn');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';
                saveBtn.setAttribute('form', 'reglamentForm');
            }
            const modalTitleEl = modal.querySelector('#reglamentModalTitle');
            if (modalTitleEl) modalTitleEl.textContent = 'Добавить регламент';

            modal.classList.remove('hidden');

            if (titleInput) {
                setTimeout(() => titleInput.focus(), 50);
            }
        }


        async function editReglament(id) {
            try {
                const reglament = await getFromIndexedDB('reglaments', id);
                if (!reglament) {
                    showNotification("Регламент не найден", "error");
                    return;
                }

                const modalId = 'reglamentModal';
                const modal = document.getElementById(modalId);

                if (!modal) {
                    console.warn(`Modal #${modalId} not found for editing. Creating it first.`);
                    await showAddReglamentModal();
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return editReglament(id);
                }

                const form = modal.querySelector('#reglamentForm');
                const titleInput = modal.querySelector('#reglamentTitle');
                const categorySelect = modal.querySelector('#reglamentCategory');
                const contentTextarea = modal.querySelector('#reglamentContent');
                const idInput = modal.querySelector('#reglamentId');
                const saveButton = modal.querySelector('#saveReglamentBtn');
                const modalTitle = modal.querySelector('#reglamentModalTitle');

                if (!form || !titleInput || !categorySelect || !contentTextarea || !idInput || !saveButton || !modalTitle) {
                    console.error("Не все элементы найдены в модальном окне для редактирования регламента.");
                    showNotification("Ошибка интерфейса: не найдены элементы окна редактирования.", "error");
                    return;
                }

                modalTitle.textContent = 'Редактировать регламент';
                saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
                saveButton.disabled = false;

                idInput.value = reglament.id;
                titleInput.value = reglament.title || '';
                contentTextarea.value = reglament.content || '';

                if (typeof populateReglamentCategoryDropdowns === 'function') {
                    populateReglamentCategoryDropdowns();
                }
                setTimeout(() => {
                    categorySelect.value = reglament.category || '';
                }, 100);


                modal.classList.remove('hidden');
                titleInput.focus();

            } catch (error) {
                console.error("Error loading reglament for edit:", error);
                showNotification("Ошибка при загрузке регламента для редактирования", "error");
            }
        }


        // СИСТЕМА ВНЕШНИХ РЕСУРСОВ
        async function loadExtLinks() {
            const extLinksContainer = document.getElementById('extLinksContainer');
            if (!extLinksContainer) return;

            extLinksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Загрузка ресурсов...</div>';

            try {
                let extLinks = await getAllExtLinks();

                if (!extLinks?.length) {
                    console.log("База внешних ссылок пуста. Добавляем стартовый набор.");
                    const sampleExtLinksData = [
                        { title: 'ЕГРЮЛ', url: 'https://egrul.nalog.ru/', description: 'Чекни инфу по орге', category: 'gov', dateAdded: new Date().toISOString() },
                        { title: 'Портал ИТС 1С', url: 'https://its.1c.ru/', description: 'Инфа по 1ЭС', category: 'docs', dateAdded: new Date().toISOString() },
                        { title: 'Track Astral', url: 'https://track.astral.ru/support/display/Support1CO', description: 'Знания древних...', category: 'docs', dateAdded: new Date().toISOString() },
                        { title: 'База (знаний) Astral', url: 'https://astral.ru/help/1s-otchetnost/', description: 'Инфа для обычных людишек...', category: 'docs', dateAdded: new Date().toISOString() }
                    ];
                    const savedExtLinkIds = await Promise.all(sampleExtLinksData.map(link => saveToIndexedDB('extLinks', link)));
                    const extLinksWithIds = sampleExtLinksData.map((link, index) => ({ ...link, id: savedExtLinkIds[index] }));

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(extLinksWithIds.map(link =>
                            updateSearchIndex('extLinks', link.id, link, 'update')
                                .catch(err => console.error(`Error indexing default external link ${link.id}:`, err))
                        ));
                        console.log("Default external links indexed.");
                    } else {
                        console.warn("updateSearchIndex function not available for default external links.");
                    }

                    extLinks = await getAllExtLinks();
                    console.log("Стартовые внешние ссылки добавлены и загружены.");
                }

                renderExtLinks(extLinks);
            } catch (error) {
                console.error('Ошибка при загрузке внешних ресурсов:', error);
                extLinksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-red-500">Не удалось загрузить ресурсы.</div>';
                applyCurrentView('extLinksContainer');
            }
        }


        const extLinkCategoryInfo = {
            docs: { name: 'Документация', color: 'blue', icon: 'fa-file-alt' },
            gov: { name: 'Гос. сайты', color: 'red', icon: 'fa-landmark' },
            tools: { name: 'Инструменты', color: 'green', icon: 'fa-tools' },
            other: { name: 'Прочее', color: 'yellow', icon: 'fa-link' }
        };


        function populateExtLinkCategoryFilter() {
            const filterSelect = document.getElementById('extLinkCategoryFilter');
            if (!filterSelect) {
                console.error("Не найден select для фильтра категорий внешних ссылок (#extLinkCategoryFilter)");
                return;
            }

            const currentValue = filterSelect.value;

            while (filterSelect.options.length > 1) {
                filterSelect.remove(1);
            }

            const fragment = document.createDocumentFragment();
            Object.entries(extLinkCategoryInfo).forEach(([key, info]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = info.name;
                fragment.appendChild(option);
            });

            filterSelect.appendChild(fragment);

            if (currentValue && filterSelect.querySelector(`option[value="${currentValue}"]`)) {
                filterSelect.value = currentValue;
            } else if (filterSelect.options.length > 0) {
                filterSelect.value = "";
            }
            console.log("Фильтр категорий внешних ресурсов обновлен.");
        }


        async function handleExtLinkContainerClick(event) {
            const clickedCard = event.target.closest('.ext-link-item');

            if (!clickedCard) {
                return;
            }

            const isActionClick = event.target.closest('button.edit-ext-link, button.delete-ext-link, a.ext-link-url');

            if (isActionClick) {
                console.log("Клик по кнопке/иконке внутри карточки, пропускаем открытие ссылки с карточки.");
                return;
            }

            const linkElement = clickedCard.querySelector('a.ext-link-url');
            const url = linkElement?.href;

            if (url) {
                try {
                    new URL(url);
                    console.log(`Открытие URL по клику на карточку: ${url}`);
                    window.open(url, '_blank', 'noopener,noreferrer');
                } catch (e) {
                    console.error(`Некорректный URL у ресурса ${clickedCard.dataset.id}: ${url}`, e);
                    if (typeof showNotification === 'function') {
                        showNotification("Некорректный URL у этого ресурса.", "error");
                    }
                }
            } else {
                console.warn(`URL не найден для карточки ${clickedCard.dataset.id}`);
                if (typeof showNotification === 'function') {
                    showNotification("URL для этого ресурса не найден.", "warning");
                }
            }
        }


        function renderExtLinks(links) {
            const extLinksContainer = document.getElementById('extLinksContainer');
            if (!extLinksContainer) {
                console.error("Контейнер #extLinksContainer не найден для рендеринга.");
                return;
            }

            extLinksContainer.innerHTML = '';

            if (!links || links.length === 0) {
                extLinksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных внешних ресурсов.</div>';
                applyCurrentView('extLinksContainer');
                return;
            }

            const categoryMap = {
                ...extLinkCategoryInfo,
                default: { name: 'Без категории', color: 'gray', icon: 'fa-question-circle' }
            };

            const fragment = document.createDocumentFragment();

            links.forEach(link => {
                if (!link || typeof link !== 'object' || !link.id) {
                    console.warn("Пропущен невалидный элемент link при рендеринге:", link);
                    return;
                }

                const linkElement = document.createElement('div');
                linkElement.className = 'ext-link-item view-item group flex justify-between items-start p-4 rounded-lg shadow-sm hover:shadow-md bg-white dark:bg-gray-700 transition cursor-pointer';
                linkElement.dataset.id = link.id;
                linkElement.dataset.category = link.category || '';

                const categoryKey = link.category && categoryMap[link.category] ? link.category : 'default';
                const categoryData = categoryMap[categoryKey];

                const badgeColorName = categoryData.color || 'gray';
                const badgeColorClasses = `bg-${badgeColorName}-100 text-${badgeColorName}-800 dark:bg-${badgeColorName}-900 dark:text-${badgeColorName}-300`;


                const categoryBadge = link.category
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColorClasses} whitespace-nowrap"><i class="fas ${categoryData.icon || 'fa-tag'} mr-1.5"></i>${categoryData.name}</span>`
                    : '';

                linkElement.innerHTML = `
        <div class="flex-grow min-w-0 mr-3">
            <h3 class="font-semibold text-base group-hover:text-primary dark:group-hover:text-primary truncate" title="${link.title || ''}">${link.title || 'Без названия'}</h3>
            <p class="ext-link-description text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">${link.description || 'Нет описания'}</p>
            <div class="ext-link-meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                ${categoryBadge}
                 <span class="text-gray-500 text-xs"><i class="far fa-clock mr-1"></i>${link.dateAdded ? new Date(link.dateAdded).toLocaleDateString() : 'Неизвестно'}</span>
            </div>
        </div>
        <div class="ext-link-actions flex flex-shrink-0 items-center ml-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
             <a href="${link.url || '#'}" target="_blank" rel="noopener noreferrer" class="ext-link-url p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Открыть ${link.url || ''}">
                <i class="fas fa-external-link-alt"></i>
            </a>
            <button class="edit-ext-link p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Редактировать">
                <i class="fas fa-edit"></i>
            </button>
            <button class="delete-ext-link p-1.5 text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Удалить">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

                linkElement.querySelector('.edit-ext-link')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showEditExtLinkModal(link.id);
                });

                linkElement.querySelector('.delete-ext-link')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Вы уверены, что хотите удалить ресурс "${link.title || 'Без названия'}"?`)) {
                        deleteExtLink(link.id);
                    }
                });

                fragment.appendChild(linkElement);
            });

            extLinksContainer.appendChild(fragment);
            applyCurrentView('extLinksContainer');
        }


        function filterExtLinks() {
            console.log("Вызвана функция filterExtLinks (использует filterItems)");
            filterItems({
                containerSelector: '#extLinksContainer',
                itemSelector: '.ext-link-item',
                searchInputSelector: 'extLinkSearchInput',
                filterSelectSelector: 'extLinkCategoryFilter',
                dataAttribute: 'category',
                textSelectors: ['h3', 'p.ext-link-description']
            });
        }


        function ensureExtLinkModal() {
            let modal = document.getElementById('extLinkModal');
            if (!modal) {
                console.log("Модальное окно #extLinkModal не найдено, создаем новое.");
                modal = document.createElement('div');
                modal.id = 'extLinkModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
                modal.innerHTML = `
<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
    <div class="p-6">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold" id="extLinkModalTitle">Заголовок окна</h2>
            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Закрыть">
                <i class="fas fa-times text-xl"></i>
            </button>
        </div>
        <form id="extLinkForm">
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

                const closeModal = () => modal.classList.add('hidden');
                modal.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => btn.addEventListener('click', closeModal));

                const form = modal.querySelector('#extLinkForm');
                if (form && !form.dataset.listenerAttached) {
                    if (typeof handleExtLinkFormSubmit === 'function') {
                        form.addEventListener('submit', handleExtLinkFormSubmit);
                        form.dataset.listenerAttached = 'true';
                        console.log("Обработчик handleExtLinkFormSubmit прикреплен к форме #extLinkForm.");
                    } else {
                        console.error("Ошибка: Глобальная функция handleExtLinkFormSubmit не найдена при создании модального окна!");
                    }
                }
            }

            const categorySelect = modal.querySelector('#extLinkCategory');
            if (categorySelect && !categorySelect.dataset.populated) {
                while (categorySelect.options.length > 1) {
                    categorySelect.remove(1);
                }
                const fragment = document.createDocumentFragment();
                Object.entries(extLinkCategoryInfo).forEach(([key, info]) => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = info.name;
                    fragment.appendChild(option);
                });
                categorySelect.appendChild(fragment);
                categorySelect.dataset.populated = 'true';
                console.log("Категории в модальном окне внешних ссылок обновлены.");
            } else if (!categorySelect) {
                console.error("Не найден select категорий #extLinkCategory в модальном окне!");
            }

            const elements = {
                modal,
                form: modal.querySelector('#extLinkForm'),
                titleEl: modal.querySelector('#extLinkModalTitle'),
                idInput: modal.querySelector('#extLinkId'),
                titleInput: modal.querySelector('#extLinkTitle'),
                urlInput: modal.querySelector('#extLinkUrl'),
                descriptionInput: modal.querySelector('#extLinkDescription'),
                categoryInput: categorySelect,
                saveButton: modal.querySelector('#saveExtLinkBtn') || modal.querySelector('button[type="submit"]')
            };

            for (const key in elements) {
                if (!elements[key]) {
                    console.warn(`[ensureExtLinkModal] Элемент ${key} не был найден в модальном окне!`);
                }
            }

            return elements;
        }


        async function handleExtLinkFormSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const modalElements = ensureExtLinkModal();

            if (!modalElements || !modalElements.modal || !modalElements.form || !modalElements.saveButton) {
                console.error("handleExtLinkFormSubmit: Не удалось получить элементы модального окна для внешних ссылок.");
                showNotification("Ошибка интерфейса при сохранении внешнего ресурса.", "error");
                return;
            }

            const { modal, idInput, titleInput, urlInput, descriptionInput, categoryInput, saveButton } = modalElements;

            if (saveButton) saveButton.disabled = true;

            const id = idInput.value;
            const title = titleInput.value.trim();
            const url = urlInput.value.trim();
            const description = descriptionInput.value.trim() || null;
            const category = categoryInput.value || null;

            if (!title || !url) {
                showNotification("Пожалуйста, заполните поля 'Название' и 'URL'", "error");
                if (saveButton) saveButton.disabled = false;
                return;
            }
            try {
                new URL(url);
            } catch (_) {
                showNotification("Пожалуйста, введите корректный URL (например, https://example.com)", "error");
                if (saveButton) saveButton.disabled = false;
                return;
            }

            const newData = {
                title,
                url,
                description,
                category
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
                        console.warn(`Не удалось получить старые данные внешнего ресурса (${newData.id}):`, fetchError);
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

                if (typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex(
                            'extLinks',
                            finalId,
                            newData,
                            isEditing ? 'update' : 'add',
                            oldData
                        );
                        const oldDataStatus = oldData ? 'со старыми данными' : '(без старых данных)';
                        console.log(`Обновление индекса для внешнего ресурса (${finalId}) инициировано ${oldDataStatus}.`);
                    } catch (indexError) {
                        console.error(`Ошибка обновления поискового индекса для внешнего ресурса ${finalId}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса для ресурса.", "warning");
                    }
                } else {
                    console.warn("Функция updateSearchIndex недоступна.");
                }

                const updatedLinks = await getAllExtLinks();
                renderExtLinks(updatedLinks);
                showNotification(isEditing ? "Ресурс обновлен" : "Ресурс добавлен");
                modal.classList.add('hidden');

            } catch (error) {
                console.error("Ошибка при сохранении внешнего ресурса:", error);
                showNotification("Ошибка при сохранении", "error");
            } finally {
                if (saveButton) saveButton.disabled = false;
            }
        }


        function showAddExtLinkModal() {
            const { modal, form, titleEl, idInput } = ensureExtLinkModal();
            if (!form) {
                console.error("Не удалось получить форму из ensureExtLinkModal");
                return;
            }
            form.reset();
            idInput.value = '';
            titleEl.textContent = 'Добавить внешний ресурс';
            modal.classList.remove('hidden');
            form.elements.extLinkTitle?.focus();
        }

        async function showEditExtLinkModal(id) {
            const { modal, form, titleEl, idInput, titleInput, urlInput, descriptionInput, categoryInput } = ensureExtLinkModal();

            if (!form) {
                console.error("Не удалось получить форму из ensureExtLinkModal для редактирования");
                return;
            }

            try {
                const link = await getFromIndexedDB('extLinks', id);
                if (!link) {
                    showNotification("Внешний ресурс не найден", "error");
                    return;
                }

                form.reset();
                idInput.value = link.id;
                titleInput.value = link.title || '';
                urlInput.value = link.url || '';
                descriptionInput.value = link.description || '';
                categoryInput.value = link.category || '';
                titleEl.textContent = 'Редактировать ресурс';

                modal.classList.remove('hidden');
                titleInput.focus();

            } catch (error) {
                console.error("Ошибка при загрузке внешнего ресурса для редактирования:", error);
                showNotification("Ошибка при загрузке ресурса", "error");
                modal.classList.add('hidden');
            }
        }

        async function showEditExtLinkModal(id) {
            const { modal, form, titleEl, idInput, titleInput, urlInput, descriptionInput, categoryInput } = ensureExtLinkModal();

            try {
                const link = await getFromIndexedDB('extLinks', id);
                if (!link) {
                    showNotification("Ресурс не найден", "error");
                    return;
                }

                form.reset();
                idInput.value = link.id;
                titleInput.value = link.title;
                urlInput.value = link.url;
                descriptionInput.value = link.description || '';
                categoryInput.value = link.category || '';
                titleEl.textContent = 'Редактировать ресурс';

                modal.classList.remove('hidden');
            } catch (error) {
                console.error("Error loading external link for edit:", error);
                showNotification("Ошибка при загрузке ресурса", "error");
                modal.classList.add('hidden');
            }
        }


        async function deleteExtLink(id) {
            const numericId = parseInt(id);
            if (isNaN(numericId)) {
                console.error("Попытка удаления внешнего ресурса с невалидным ID:", id);
                showNotification("Ошибка: Неверный ID для удаления.", "error");
                return;
            }

            try {
                const linkToDelete = await getFromIndexedDB('extLinks', numericId);
                if (!linkToDelete) {
                    console.warn(`Внешний ресурс с ID ${numericId} не найден для удаления из индекса.`);
                }

                if (linkToDelete && typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex('extLinks', numericId, linkToDelete, 'delete');
                        console.log(`Search index updated (delete) for external link ID: ${numericId}`);
                    } catch (indexError) {
                        console.error(`Error updating search index for external link deletion ${numericId}:`, indexError);
                    }
                } else if (!linkToDelete) {
                } else {
                    console.warn("updateSearchIndex function is not available for external link deletion.");
                }

                await deleteFromIndexedDB('extLinks', numericId);
                const links = await getAllExtLinks();
                renderExtLinks(links);
                showNotification("Внешний ресурс удален");

            } catch (error) {
                console.error("Ошибка при удалении внешнего ресурса:", error);
                showNotification("Ошибка при удалении", "error");
            }
        }



        // СИСТЕМА КАСТОМИЗАЦИИ UI
        function initUICustomization() {
            const getElem = (id) => document.getElementById(id);
            const querySelAll = (selector) => document.querySelectorAll(selector);

            const customizeUIBtn = getElem('customizeUIBtn');
            const customizeUIModal = getElem('customizeUIModal');
            const closeCustomizeUIModalBtn = getElem('closeCustomizeUIModalBtn');
            const saveUISettingsBtn = getElem('saveUISettingsBtn');
            const cancelUISettingsBtn = getElem('cancelUISettingsBtn');
            const resetUISettingsBtn = getElem('resetUISettingsBtn');

            if (!customizeUIBtn || !customizeUIModal) {
                console.warn("UI Customization init failed: customizeUIBtn or customizeUIModal not found.");
                return;
            }

            const closeModal = async (forceClose = false) => {
                if (!customizeUIModal) return;

                const inputField = getElem('employeeExtensionInput');
                if (inputField && !inputField.classList.contains('hidden')) {
                    await saveEmployeeExtension(inputField.value);
                    const displaySpan = getElem('employeeExtensionDisplay');
                    inputField.classList.add('hidden');
                    if (displaySpan) displaySpan.classList.remove('hidden');
                }

                if (isUISettingsDirty && !forceClose) {
                    if (!confirm("Изменения не сохранены. Вы уверены, что хотите выйти?")) {
                        return;
                    }
                }

                console.log("Closing customize UI modal. Reverting to original settings.");
                await applyPreviewSettings(originalUISettings);
                isUISettingsDirty = false;
                customizeUIModal.classList.add('hidden');
                document.body.classList.remove('modal-open');
            };

            const openModal = async () => {
                console.log("Opening customize UI modal...");
                await loadUISettings();
                await loadEmployeeExtension();

                if (customizeUIModal) {
                    customizeUIModal.classList.remove('hidden');
                }
                document.body.classList.add('modal-open');
                console.log("Customize UI modal opened.");
                const panelSortContainer = getElem('panelSortContainer');
                initSortableIfNeeded(panelSortContainer);
            };

            const initSortableIfNeeded = (container) => {
                if (!container) {
                    console.error("Panel sort container not found for Sortable init.");
                    return;
                }
                if (window.Sortable && !container.sortableInstance) {
                    try {
                        container.sortableInstance = new Sortable(container, {
                            animation: 150,
                            handle: '.fa-grip-lines',
                            ghostClass: 'my-sortable-ghost',
                            onEnd: function (/**Event*/evt) {
                                console.log("SortableJS onEnd event triggered.");
                                updatePreviewSettingsFromModal();
                                isUISettingsDirty = true;
                            },
                        });
                        console.log("Initialized SortableJS for panel sorting.");
                    } catch (e) {
                        console.error("Error initializing Sortable:", e);
                    }
                } else if (!window.Sortable) {
                    console.warn("SortableJS library not loaded. Drag-and-drop for panels disabled.");
                }
            };

            customizeUIBtn.addEventListener('click', openModal);
            [closeCustomizeUIModalBtn, cancelUISettingsBtn].forEach(btn => btn?.addEventListener('click', () => closeModal()));

            saveUISettingsBtn?.addEventListener('click', async () => {
                const saved = await saveUISettings();
                if (saved) {
                    const inputField = getElem('employeeExtensionInput');
                    if (inputField && !inputField.classList.contains('hidden')) {
                        await saveEmployeeExtension(inputField.value);
                    }
                    closeModal(true);
                    showNotification("Настройки интерфейса сохранены");
                }
            });

            resetUISettingsBtn?.addEventListener('click', async () => {
                if (confirm('Вы уверены, что хотите сбросить все настройки интерфейса к значениям по умолчанию (в окне предпросмотра)? Это изменение нужно будет сохранить.')) {
                    await resetUISettingsInModal();
                    updateExtensionDisplay('');
                    const inputField = getElem('employeeExtensionInput');
                    if (inputField) inputField.value = '';
                }
            });

            querySelAll('input[name="mainLayout"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    if (currentPreviewSettings) {
                        currentPreviewSettings.mainLayout = radio.value;
                        applyPreviewSettings(currentPreviewSettings);
                        isUISettingsDirty = true;
                    }
                });
            });

            setupExtensionFieldListeners();

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    const visibleModals = getVisibleModals();
                    if (!visibleModals.length) return;
                    const topmostModal = getTopmostModal(visibleModals);

                    if (topmostModal && topmostModal.id === 'customizeUIModal') {
                        const inputField = topmostModal.querySelector('#employeeExtensionInput');
                        if (inputField && !inputField.classList.contains('hidden')) {
                            inputField.classList.add('hidden');
                            const displaySpan = topmostModal.querySelector('#employeeExtensionDisplay');
                            if (displaySpan) displaySpan.classList.remove('hidden');
                            loadEmployeeExtension();
                        } else {
                            closeModal();
                        }
                    } else if (topmostModal) {
                        if (topmostModal.id === 'editModal' || topmostModal.id === 'addModal') {
                            requestCloseModal(topmostModal);
                        } else {
                            console.log('Escape pressed. Hiding non-edit/add modal:', topmostModal.id);
                            topmostModal.classList.add('hidden');
                        }
                    }
                }
            });

            document.addEventListener('click', (event) => {
                if (customizeUIModal && !customizeUIModal.classList.contains('hidden')) {
                    const innerContainer = customizeUIModal.querySelector('.bg-white.dark\\:bg-gray-800');
                    if (innerContainer && !innerContainer.contains(event.target)) {
                        const inputField = customizeUIModal.querySelector('#employeeExtensionInput');
                        const displaySpan = customizeUIModal.querySelector('#employeeExtensionDisplay');

                        if ((inputField && inputField.contains(event.target)) || (displaySpan && displaySpan.contains(event.target))) {
                            return;
                        }

                        if (!customizeUIBtn.contains(event.target)) {
                            closeModal();
                        }
                    }
                }
            });
        }


        function calculateSecondaryColor(hex, percent = 15) {
            hex = hex.replace(/^#/, '');
            if (hex.length === 3) {
                hex = hex.split('').map(s => s + s).join('');
            }
            let r = parseInt(hex.substring(0, 2), 16);
            let g = parseInt(hex.substring(2, 4), 16);
            let b = parseInt(hex.substring(4, 6), 16);

            const factor = 1 - (percent / 100);
            r = Math.max(0, Math.floor(r * factor));
            g = Math.max(0, Math.floor(g * factor));
            b = Math.max(0, Math.floor(b * factor));

            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }


        function applyPanelSettings(visibility, order) {
            const tabsConfig = [
                { id: 'main', name: 'Главный алгоритм' },
                { id: 'program', name: 'Программа 1С' },
                { id: 'links', name: 'Ссылки 1С' },
                { id: 'extLinks', name: 'Внешние ресурсы' },
                { id: 'skzi', name: 'СКЗИ' },
                { id: 'webReg', name: 'Веб-Регистратор' },
                { id: 'reglaments', name: 'Регламенты' },
                { id: 'bookmarks', name: 'Закладки' }
            ];
            const panelMap = tabsConfig.reduce((acc, tab) => {
                acc[tab.name] = `${tab.id}Tab`;
                return acc;
            }, {});
            const defaultOrder = tabsConfig.map(tab => tab.name);

            tabsConfig.forEach((tab, index) => {
                const tabBtn = document.getElementById(`${tab.id}Tab`);
                if (tabBtn) {
                    const isVisible = visibility ? (visibility[index] ?? true) : true;
                    tabBtn.classList.toggle('hidden', !isVisible);
                }
            });

            const tabNav = document.querySelector('header + .border-b nav.flex');
            const moreTabsBtnParent = document.getElementById('moreTabsBtn')?.parentNode;
            if (tabNav) {
                const currentOrder = order && order.length === defaultOrder.length ? order : defaultOrder;
                currentOrder.forEach(panelName => {
                    const tabId = panelMap[panelName];
                    const tabBtn = tabId ? document.getElementById(tabId) : null;
                    if (tabBtn) {
                        if (moreTabsBtnParent && !moreTabsBtnParent.classList.contains('hidden')) {
                            tabNav.insertBefore(tabBtn, moreTabsBtnParent);
                        } else {
                            tabNav.appendChild(tabBtn);
                        }
                    }
                });
                if (moreTabsBtnParent) {
                    tabNav.appendChild(moreTabsBtnParent);
                }
            } else {
                console.warn("Tab navigation container not found for applying panel order.");
            }

            if (typeof setupTabsOverflow === 'function') {
                setupTabsOverflow();
            } else {
                console.warn("setupTabsOverflow function not found after applying panel settings.");
            }
        }



        if (typeof loadUISettings === 'undefined') { window.loadUISettings = () => console.log("loadUISettings called"); }
        if (typeof saveUISettings === 'undefined') { window.saveUISettings = () => console.log("saveUISettings called"); }
        if (typeof applyUISettings === 'undefined') { window.applyUISettings = () => console.log("applyUISettings called"); }
        if (typeof resetUISettings === 'undefined') { window.resetUISettings = () => console.log("resetUISettings called"); }
        if (typeof showNotification === 'undefined') { window.showNotification = (msg) => console.log("Notification:", msg); }
        if (typeof setTheme === 'undefined') { window.setTheme = (theme) => console.log("setTheme called with:", theme); }


        async function resetUISettingsInModal() {
            console.log("Resetting UI settings in modal preview...");

            currentPreviewSettings = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
            isUISettingsDirty = true;

            try {
                populateModalControls(currentPreviewSettings);
                await applyPreviewSettings(currentPreviewSettings);
                console.log("UI settings reset preview applied.");
                showNotification("Настройки сброшены для предпросмотра. Нажмите 'Сохранить', чтобы применить.", "info");
                return true;
            } catch (error) {
                console.error("Error resetting UI settings preview:", error);
                showNotification("Ошибка при сбросе настроек для предпросмотра", "error");
                currentPreviewSettings = JSON.parse(JSON.stringify(originalUISettings));
                isUISettingsDirty = false;
                populateModalControls(currentPreviewSettings);
                await applyPreviewSettings(currentPreviewSettings);
                return false;
            }
        }


        async function applyUISettings() {
            console.log("Применение глобальных UI настроек (обычно при старте приложения)...");
            let settingsToApply = {};
            if (!db) {
                console.warn("DB not ready in applyUISettings. Applying defaults.");
                settingsToApply = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
            } else {
                try {
                    const loadedSettings = await getFromIndexedDB('preferences', 'uiSettings');
                    if (loadedSettings && typeof loadedSettings === 'object') {
                        settingsToApply = {
                            ...DEFAULT_UI_SETTINGS,
                            ...loadedSettings,
                            id: 'uiSettings'
                        };
                        if (!Array.isArray(settingsToApply.panelOrder) || settingsToApply.panelOrder.length === 0) {
                            console.warn("Loaded panelOrder is invalid, using default.");
                            settingsToApply.panelOrder = defaultPanelOrder;
                        }
                        if (!Array.isArray(settingsToApply.panelVisibility) || settingsToApply.panelVisibility.length !== settingsToApply.panelOrder.length) {
                            console.warn("Loaded panelVisibility is invalid, using default.");
                            settingsToApply.panelVisibility = defaultPanelVisibility;
                        }
                        console.log("Successfully loaded settings from DB for global application.");
                    } else {
                        console.log("No UI settings found in DB or invalid format for global application, using defaults.");
                        settingsToApply = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
                    }
                } catch (error) {
                    console.error("Error applying UI settings from DB, falling back to defaults:", error);
                    settingsToApply = { ...DEFAULT_UI_SETTINGS, id: 'uiSettings' };
                }
            }

            await applyPreviewSettings(settingsToApply);
            console.log("Глобальные настройки UI применены");
            return true;
        }


        function initClearDataFunctionality() {
            const clearAllDataBtn = document.getElementById('clearAllDataBtn');
            const confirmClearDataModal = document.getElementById('confirmClearDataModal');
            const cancelClearDataBtn = document.getElementById('cancelClearDataBtn');
            const confirmAndClearDataBtn = document.getElementById('confirmAndClearDataBtn');
            const closeConfirmClearModalBtns = confirmClearDataModal?.querySelectorAll('.close-confirm-clear-modal');
            const exportBeforeClearBtn = document.getElementById('exportBeforeClearBtn');

            if (!clearAllDataBtn || !confirmClearDataModal || !cancelClearDataBtn || !confirmAndClearDataBtn) {
                console.warn("Clear Data Functionality: One or more required elements not found. Feature disabled.");
                return;
            }

            clearAllDataBtn.addEventListener('click', () => {
                confirmClearDataModal.classList.remove('hidden');
            });

            cancelClearDataBtn.addEventListener('click', () => {
                confirmClearDataModal.classList.add('hidden');
            });

            closeConfirmClearModalBtns?.forEach(btn => {
                btn.addEventListener('click', () => {
                    confirmClearDataModal.classList.add('hidden');
                });
            });

            confirmAndClearDataBtn.addEventListener('click', async () => {
                console.log("Attempting to clear all application data...");
                confirmClearDataModal.classList.add('hidden');

                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.innerHTML = `
                <div class="text-center">
                    <i class="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
                    <p class="text-lg font-medium text-gray-700 dark:text-gray-300">Очистка данных...</p>
                </div>`;
                    loadingOverlay.style.display = 'flex';
                }
                const appContent = document.getElementById('appContent');
                if (appContent) {
                    appContent.classList.add('hidden');
                }

                await clearAllApplicationData();

                showNotification("Все данные успешно очищены. Перезагрузка...");
                console.log("Data cleared. Reloading page.");

                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            });

            exportBeforeClearBtn?.addEventListener('click', () => {
                if (typeof exportAllData === 'function') {
                    exportAllData();
                    showNotification("Начался экспорт данных...", "info");
                } else {
                    showNotification("Функция экспорта не найдена!", "error");
                }
            });
        }


        async function clearAllApplicationData() {
            console.log("Starting data clearing process...");

            try {
                console.log("Clearing LocalStorage...");
                const localStorageKeys = ['algorithms1C', 'clientData',];
                localStorageKeys.forEach(key => {
                    localStorage.removeItem(key);
                    console.log(`Removed key from LocalStorage: ${key}`);
                });
            } catch (error) {
                console.error("Error clearing LocalStorage:", error);
                showNotification("Ошибка при очистке LocalStorage.", "error");
            }

            try {
                console.log("Closing IndexedDB connection if open...");
                if (db) {
                    db.close();
                    db = null;
                    console.log("IndexedDB connection closed.");
                }

                console.log(`Deleting IndexedDB database: ${DB_NAME}...`);
                await new Promise((resolve, reject) => {
                    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                    deleteRequest.onsuccess = () => {
                        console.log(`IndexedDB database "${DB_NAME}" deleted successfully.`);
                        resolve();
                    };
                    deleteRequest.onerror = (event) => {
                        console.error(`Error deleting database "${DB_NAME}":`, event.target.error);
                        reject(event.target.error);
                    };
                    deleteRequest.onblocked = () => {
                        console.warn(`Database deletion blocked. Probably due to open connections. Page reload required.`);
                        resolve();
                    };
                });
            } catch (error) {
                console.error("Error deleting IndexedDB database:", error);
                showNotification("Ошибка при удалении базы данных.", "error");
            }

            console.log("Data clearing process finished.");
        }


        let deletedSections = [];


        function createPanelItemElement(id, name, isVisible = true) {
            const item = document.createElement('div');
            item.className = 'panel-item flex items-center p-2 bg-gray-100 dark:bg-gray-700 rounded cursor-move mb-2';
            item.setAttribute('data-section', id);
            const eyeClass = isVisible ? 'fa-eye' : 'fa-eye-slash';
            const titleText = isVisible ? 'Скрыть раздел' : 'Показать раздел';
            item.innerHTML = `
                                <i class="fas fa-grip-lines mr-2 text-gray-400"></i>
                                <span class="flex-grow">${name}</span>
                                <div class="ml-auto flex items-center flex-shrink-0">
                                    <button class="toggle-visibility p-1 text-gray-500 hover:text-primary mr-1" title="${titleText}">
                                        <i class="fas ${eyeClass}"></i>
                                    </button>
                                </div>`;
            return item;
        }


        let originalUISettings = {};
        let currentPreviewSettings = {};
        let isUISettingsDirty = false;


        async function applyPreviewSettings(settings) {
            console.log("Applying preview settings:", settings);
            const { style } = document.documentElement;

            const primaryColor = settings?.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
            const secondaryColor = calculateSecondaryColor(primaryColor);
            style.setProperty('--color-primary', primaryColor);
            style.setProperty('--color-secondary', secondaryColor);

            const fontSize = settings?.fontSize || DEFAULT_UI_SETTINGS.fontSize;
            style.fontSize = `${fontSize}%`;

            const borderRadius = settings?.borderRadius ?? DEFAULT_UI_SETTINGS.borderRadius;
            style.setProperty('--border-radius', `${borderRadius}px`);

            const contentDensity = settings?.contentDensity ?? DEFAULT_UI_SETTINGS.contentDensity;
            const spacing = 0.5 + (contentDensity * 0.25);
            style.setProperty('--content-spacing', `${spacing.toFixed(3)}rem`);

            const mainLayout = settings?.mainLayout || DEFAULT_UI_SETTINGS.mainLayout;
            const mainLayoutDiv = document.querySelector('#mainContent > div.grid');
            if (mainLayoutDiv) {
                const isVertical = mainLayout === 'vertical';
                mainLayoutDiv.classList.toggle('grid-cols-1', isVertical);
                mainLayoutDiv.classList.toggle('md:grid-cols-2', !isVertical);
            }

            const themeMode = settings?.themeMode || DEFAULT_UI_SETTINGS.themeMode;
            if (typeof setTheme === 'function') {
                setTheme(themeMode);
            } else {
                const isDark = themeMode === 'dark' || (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.classList.toggle('dark', isDark);
                console.warn("setTheme function was not available, used direct class toggle.");
            }

            const panelOrder = settings?.panelOrder || defaultPanelOrder;
            const panelVisibility = settings?.panelVisibility || defaultPanelVisibility;
            applyPanelOrderAndVisibility(panelOrder, panelVisibility);
        }


        function applyPanelOrderAndVisibility(order, visibility) {
            const tabNav = document.querySelector('header + .border-b nav.flex');
            if (!tabNav) {
                console.warn("Tab navigation container not found for applying panel settings.");
                return;
            }

            const moreTabsBtnParent = document.getElementById('moreTabsBtn')?.parentNode;
            const allTabButtons = {};
            tabsConfig.forEach(tab => {
                const btn = document.getElementById(`${tab.id}Tab`);
                if (btn) allTabButtons[tab.id] = btn;
            });

            order.forEach((panelId, index) => {
                const tabBtn = allTabButtons[panelId];
                const isVisible = visibility[index] ?? true;
                if (tabBtn) {
                    tabBtn.classList.toggle('hidden', !isVisible);
                }
            });

            const fragment = document.createDocumentFragment();
            order.forEach(panelId => {
                const tabBtn = allTabButtons[panelId];
                if (tabBtn && !tabBtn.classList.contains('hidden')) {
                    fragment.appendChild(tabBtn);
                }
            });

            if (moreTabsBtnParent) {
                tabNav.insertBefore(fragment, moreTabsBtnParent);
            } else {
                tabNav.appendChild(fragment);
            }

            if (typeof setupTabsOverflow === 'function') {
                setTimeout(setupTabsOverflow, 50);
            }
        }


        function handleModalVisibilityToggle(event) {
            const button = event.currentTarget;
            const icon = button.querySelector('i');
            if (!icon) return;

            const isCurrentlyVisible = icon.classList.contains('fa-eye');
            const shouldBeHidden = isCurrentlyVisible;

            icon.classList.toggle('fa-eye', !shouldBeHidden);
            icon.classList.toggle('fa-eye-slash', shouldBeHidden);
            button.setAttribute('title', shouldBeHidden ? "Показать раздел" : "Скрыть раздел");

            updatePreviewSettingsFromModal();
            if (currentPreviewSettings) {
                applyPreviewSettings(currentPreviewSettings);
                isUISettingsDirty = true;
            }
        }


        function getSettingsFromModal() {
            const modal = document.getElementById('customizeUIModal');
            if (!modal) return null;

            const selectedColorSwatch = modal.querySelector('.color-swatch.ring-primary');
            const primaryColor = selectedColorSwatch
                ? selectedColorSwatch.getAttribute('data-color')
                : DEFAULT_UI_SETTINGS.primaryColor;

            const panelItems = Array.from(modal.querySelectorAll('#panelSortContainer .panel-item'));
            const panelOrder = panelItems.map(item => item.getAttribute('data-section'));
            const panelVisibility = panelItems.map(item =>
                item.querySelector('.toggle-visibility i')?.classList.contains('fa-eye') ?? true
            );


            return {
                id: 'uiSettings',
                mainLayout: modal.querySelector('input[name="mainLayout"]:checked')?.value || DEFAULT_UI_SETTINGS.mainLayout,
                themeMode: modal.querySelector('input[name="themeMode"]:checked')?.value || DEFAULT_UI_SETTINGS.themeMode,
                primaryColor: primaryColor,
                fontSize: parseInt(modal.querySelector('#fontSizeLabel')?.textContent) || DEFAULT_UI_SETTINGS.fontSize,
                borderRadius: parseInt(modal.querySelector('#borderRadiusSlider')?.value) ?? DEFAULT_UI_SETTINGS.borderRadius,
                contentDensity: parseInt(modal.querySelector('#densitySlider')?.value) ?? DEFAULT_UI_SETTINGS.contentDensity,
                panelOrder: panelOrder,
                panelVisibility: panelVisibility,
            };
        }


        function updatePreviewSettingsFromModal() {
            const settings = getSettingsFromModal();
            if (settings) {
                currentPreviewSettings = { ...settings };
                console.log("Updated currentPreviewSettings from modal:", currentPreviewSettings);
            }
        }


        function populateModalControls(settings) {
            const modal = document.getElementById('customizeUIModal');
            if (!modal) return;

            console.log("Populating modal controls with:", settings);

            const layoutRadio = modal.querySelector(`input[name="mainLayout"][value="${settings.mainLayout}"]`);
            if (layoutRadio) layoutRadio.checked = true;
            else {
                const defaultLayoutRadio = modal.querySelector(`input[name="mainLayout"][value="${DEFAULT_UI_SETTINGS.mainLayout}"]`);
                if (defaultLayoutRadio) defaultLayoutRadio.checked = true;
            }

            const themeRadio = modal.querySelector(`input[name="themeMode"][value="${settings.themeMode}"]`);
            if (themeRadio) themeRadio.checked = true;
            else {
                const defaultThemeRadio = modal.querySelector(`input[name="themeMode"][value="${DEFAULT_UI_SETTINGS.themeMode}"]`);
                if (defaultThemeRadio) defaultThemeRadio.checked = true;
            }

            modal.querySelectorAll('.color-swatch').forEach(s => {
                s.classList.remove('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');
                s.classList.add('border-2', 'border-transparent');
                if (s.getAttribute('data-color') === settings.primaryColor) {
                    s.classList.remove('border-transparent');
                    s.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');
                }
            });

            const fontSizeLabel = modal.querySelector('#fontSizeLabel');
            if (fontSizeLabel) fontSizeLabel.textContent = settings.fontSize + '%';
            const fontSizeSlider = modal.querySelector('#fontSizeSlider');
            if (fontSizeSlider) fontSizeSlider.value = settings.fontSize;

            const borderRadiusSlider = modal.querySelector('#borderRadiusSlider');
            if (borderRadiusSlider) borderRadiusSlider.value = settings.borderRadius;

            const densitySlider = modal.querySelector('#densitySlider');
            if (densitySlider) densitySlider.value = settings.contentDensity;

            const panelSortContainer = document.getElementById('panelSortContainer');
            if (panelSortContainer) {
                panelSortContainer.innerHTML = '';

                const idToConfigMap = tabsConfig.reduce((map, tab) => {
                    map[tab.id] = tab; return map;
                }, {});

                const effectiveOrder = settings.panelOrder && settings.panelOrder.length === tabsConfig.length
                    ? settings.panelOrder
                    : defaultPanelOrder;
                const effectiveVisibility = settings.panelVisibility && settings.panelVisibility.length === effectiveOrder.length
                    ? settings.panelVisibility
                    : defaultPanelVisibility;

                const visibilityMap = effectiveOrder.reduce((map, panelId, index) => {
                    map[panelId] = effectiveVisibility[index] ?? true;
                    return map;
                }, {});


                effectiveOrder.forEach((panelId) => {
                    const config = idToConfigMap[panelId];
                    if (config) {
                        const isVisible = visibilityMap[panelId];
                        const panelItem = createPanelItemElement(config.id, config.name, isVisible);
                        panelSortContainer.appendChild(panelItem);
                    } else {
                        console.warn(`Config not found for panel ID: ${panelId} during modal population.`);
                    }
                });

                if (window.Sortable) {
                    if (panelSortContainer.sortableInstance && typeof panelSortContainer.sortableInstance.destroy === 'function') {
                        try {
                            panelSortContainer.sortableInstance.destroy();
                        } catch (e) { console.error("Error destroying Sortable instance:", e); }
                    }
                    try {
                        panelSortContainer.sortableInstance = new Sortable(panelSortContainer, {
                            animation: 150,
                            handle: '.fa-grip-lines',
                            ghostClass: 'my-sortable-ghost'
                        });
                    } catch (e) { console.error("Failed to initialize Sortable:", e); }
                }

                panelSortContainer.querySelectorAll('.toggle-visibility').forEach(button => {
                    button.removeEventListener('click', handleModalVisibilityToggle);
                    button.addEventListener('click', handleModalVisibilityToggle);
                });

            } else {
                console.error("Panel sort container (#panelSortContainer) not found in populateModalControls.");
            }
        }


        async function handleDeleteAlgorithmClick() {
            if (!currentAlgorithm || !currentSection) {
                console.warn("[handleDeleteAlgorithmClick] Invalid state: Missing algorithm or section reference.");
                showNotification("Ошибка: Не выбран алгоритм для удаления.", "error");
                return;
            }

            if (currentSection === 'main') {
                console.warn("[handleDeleteAlgorithmClick] Attempt prevented: Cannot delete the 'main' algorithm.");
                showNotification("Главный алгоритм удалить нельзя.", "warning");
                return;
            }

            const algorithmTitle = document.getElementById('modalTitle')?.textContent ?? `алгоритм ID: ${currentAlgorithm}`;
            const confirmationMessage = `Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`;

            if (confirm(confirmationMessage)) {
                if (typeof deleteAlgorithm !== 'function') {
                    console.error("[handleDeleteAlgorithmClick] Critical dependency missing: 'deleteAlgorithm' function is not defined!");
                    showNotification("Критическая ошибка: Функция удаления не найдена.", "error");
                    return;
                }

                try {
                    await deleteAlgorithm(currentAlgorithm, currentSection);

                    document.getElementById('algorithmModal')?.classList.add('hidden');

                } catch (error) {
                    console.error(`[handleDeleteAlgorithmClick] Error executing deleteAlgorithm for ID ${currentAlgorithm}, Section ${currentSection}:`, error);
                    showNotification("Произошла ошибка при удалении алгоритма.", "error");
                }
            }
        }



        function toggleSectionVisibility(event) {
            const button = event.currentTarget;
            const icon = button.querySelector('i');
            const sectionItem = button.closest('.panel-item');
            if (!icon || !sectionItem) return;

            const sectionId = sectionItem.getAttribute('data-section');
            const tabBtn = document.getElementById(`${sectionId}Tab`);

            const isCurrentlyVisible = icon.classList.contains('fa-eye');
            const shouldBeHidden = isCurrentlyVisible;

            icon.classList.toggle('fa-eye', !shouldBeHidden);
            icon.classList.toggle('fa-eye-slash', shouldBeHidden);
            button.setAttribute('title', shouldBeHidden ? "Показать раздел" : "Скрыть раздел");


            tabBtn?.classList.toggle('hidden', shouldBeHidden);

            saveUISettings();
        }


        document.addEventListener('DOMContentLoaded', () => {
            if (typeof initUICustomization === 'function') {
                initUICustomization();
            } else {
                console.warn("initUICustomization function not found.");
            }

            Promise.all([
                applyUISettings(),
            ]).catch(error => {
                console.error("Error during initial UI setup:", error);
                showNotification("Ошибка загрузки настроек интерфейса", "error");
            });


            const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');
            if (deleteAlgorithmBtn && typeof deleteAlgorithm === 'function') {
                deleteAlgorithmBtn.addEventListener('click', () => {
                    if (currentAlgorithm && currentSection && currentSection !== 'main') {
                        const algorithmTitle = document.getElementById('modalTitle')?.textContent || 'выбранный алгоритм';
                        if (confirm(`Удалить алгоритм "${algorithmTitle}"? Действие необратимо.`)) {
                            deleteAlgorithm(currentAlgorithm, currentSection);
                        }
                    } else if (currentSection === 'main') {
                        showNotification("Главный алгоритм удалить нельзя.", "warning");
                    } else {
                        showNotification("Не выбран алгоритм для удаления.", "info");
                    }
                });
            } else {
            }

        });


        const getVisibleModals = () =>
            [...document.querySelectorAll('div.fixed.inset-0.bg-black.bg-opacity-50:not(.hidden)')];


        const getTopmostModal = (modals) =>
            modals.reduce((top, current) => {
                const topZ = parseInt(window.getComputedStyle(top).zIndex, 10) || 0;
                const currentZ = parseInt(window.getComputedStyle(current).zIndex, 10) || 0;
                return currentZ >= topZ ? current : top;
            }, modals[0]);

        const triggerSelectors = [
            '#editMainBtn', '#editAlgorithmBtn', '#deleteAlgorithmBtn',
            '#addProgramAlgorithmBtn', '#addSkziAlgorithmBtn', '#addWebRegAlgorithmBtn',
            '#customizeUIBtn', '#addBookmarkBtn', '#addLinkBtn', '#addReglamentBtn', '#addExtLinkBtn',
            '#organizeBookmarksBtn',
            '#exportDataBtn', '#importDataBtn', '#themeToggle', '#noInnLink',
            '.algorithm-card', '.reglament-category', '.edit-bookmark', '.delete-bookmark',
            '.edit-link', '.delete-link', '.edit-ext-link', '.delete-ext-link',
            '#editReglamentBtn', '#deleteReglamentBtn', 'button[id*="ModalBtn"]',
            'button[class*="edit-"]', 'button[class*="delete-"]', 'button[data-action]',
            '#addStepBtn', '#saveAlgorithmBtn', '#addNewStepBtn', '#saveNewAlgorithmBtn',
            '#folderForm button[type="submit"]', '#bookmarkForm button[type="submit"]',
            '#linkForm button[type="submit"]', '#reglamentForm button[type="submit"]',
            '#extLinkForm button[type="submit"]', '#editReglamentForm button[type="submit"]',
        ].join(', ');


        document.addEventListener('click', (event) => {
            const visibleModals = getVisibleModals();
            if (!visibleModals.length) {
                return;
            }

            const topmostModal = getTopmostModal(visibleModals);
            if (!topmostModal) {
                return;
            }

            if (event.target === topmostModal && !event.target.closest(triggerSelectors)) {
                topmostModal.classList.add('hidden');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const visibleModals = getVisibleModals();
                if (!visibleModals.length) {
                    return;
                }

                const topmostModal = getTopmostModal(visibleModals);

                if (!topmostModal) {
                    return;
                }

                if (topmostModal.id === 'editModal' || topmostModal.id === 'addModal') {
                    requestCloseModal(topmostModal);
                } else {
                    console.log('Escape pressed. Hiding non-edit/add modal:', topmostModal.id);
                    topmostModal.classList.add('hidden');
                    if (topmostModal.id === 'customizeUIModal' && isUISettingsDirty) {
                        console.log("Closing customize UI modal via Escape with unsaved changes. Reverting preview.");
                        if (typeof applyPreviewSettings === 'function' && originalUISettings) {
                            applyPreviewSettings(originalUISettings);
                            isUISettingsDirty = false;
                        }
                    }
                }
            }
        });


        // ПРОЧЕЕ
        function linkify(text) {
            if (!text) return '';

            const escapeHtml = (unsafe) => {
                if (!unsafe) return '';
                return unsafe
                    .replace(/&/g, "&")
                    .replace(/</g, "<")
                    .replace(/>/g, ">")
                    .replace(/"/g, "")
                    .replace(/'/g, "'");
            }

            const urlPattern = /(https?:\/\/[^\s<>"]+)/g;

            const parts = text.split(urlPattern);
            let resultHTML = "";

            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    resultHTML += escapeHtml(parts[i]);
                } else {
                    let url = parts[i];
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        let escapedUrl = escapeHtml(url);
                        resultHTML += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline break-all">${escapedUrl}</a>`;
                    } else {
                        resultHTML += escapeHtml(parts[i]);
                    }
                }
            }

            resultHTML = resultHTML.replace(/\n/g, '<br>');

            return resultHTML;
        }


        function toggleModalFullscreen(modalId, buttonId, classToggleConfig, innerContainerSelector, contentAreaSelector) {
            const modalElement = document.getElementById(modalId);
            const buttonElement = document.getElementById(buttonId);

            if (!modalElement || !buttonElement) {
                console.error(`[toggleModalFullscreen] Error: Elements not found for modalId: ${modalId} or buttonId: ${buttonId}`);
                return;
            }

            const innerContainer = modalElement.querySelector(innerContainerSelector);
            const contentArea = contentAreaSelector ? modalElement.querySelector(contentAreaSelector) : null;

            if (!innerContainer) {
                console.error(`[toggleModalFullscreen] Error: innerContainer not found using selector: "${innerContainerSelector}" within #${modalId}`);
                return;
            }

            const icon = buttonElement.querySelector('i');
            const isCurrentlyFullscreen = modalElement.classList.contains('is-fullscreen');
            const shouldBeFullscreen = !isCurrentlyFullscreen;

            console.log(`Toggling fullscreen for ${modalId}. Should be fullscreen: ${shouldBeFullscreen}`);

            const fullscreenClasses = {
                modal: ['p-0', 'bg-opacity-80'],
                innerContainer: ['w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none', 'shadow-none'],
                contentArea: ['p-6']
            };

            modalElement.classList.toggle('is-fullscreen', shouldBeFullscreen);

            Object.entries(classToggleConfig).forEach(([part, classes]) => {
                const element = part === 'modal' ? modalElement : (part === 'innerContainer' ? innerContainer : contentArea);
                if (element && classes && classes.length > 0) {
                    classes.forEach(cls => element.classList.toggle(cls, !shouldBeFullscreen));
                }
            });

            Object.entries(fullscreenClasses).forEach(([part, classes]) => {
                const element = part === 'modal' ? modalElement : (part === 'innerContainer' ? innerContainer : contentArea);
                if (element && classes && classes.length > 0) {
                    classes.forEach(cls => element.classList.toggle(cls, shouldBeFullscreen));
                }
            });


            if (icon) {
                icon.classList.toggle('fa-expand', !shouldBeFullscreen);
                icon.classList.toggle('fa-compress', shouldBeFullscreen);
            }
            buttonElement.setAttribute('title', shouldBeFullscreen ? 'Свернуть' : 'Развернуть на весь экран');

            console.log(`Fullscreen toggle complete for ${modalId}. Is fullscreen: ${shouldBeFullscreen}`);
        }


        function initFullscreenToggles() {
            const viewBtn = document.getElementById('toggleFullscreenViewBtn');
            const addBtn = document.getElementById('toggleFullscreenAddBtn');
            const editBtn = document.getElementById('toggleFullscreenEditBtn');
            const reglamentBtn = document.getElementById('toggleFullscreenReglamentBtn');
            const bookmarkBtn = document.getElementById('toggleFullscreenBookmarkBtn');

            const reglamentModalConfig = {
                modalId: 'reglamentModal',
                buttonId: 'toggleFullscreenReglamentBtn',
                classToggleConfig: {
                    modal: ['p-4'],
                    innerContainer: ['w-[95%]', 'max-w-5xl', 'h-[90vh]', 'rounded-lg', 'shadow-xl'],
                    contentArea: []
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.flex-1.overflow-y-auto.p-6'
            };

            const algorithmModalConfig = {
                modalId: 'algorithmModal',
                buttonId: 'toggleFullscreenViewBtn',
                classToggleConfig: {
                    modal: ['p-4', 'sm:p-6', 'md:p-8'],
                    innerContainer: ['max-w-7xl', 'max-h-[calc(90vh-150px)]', 'rounded-lg', 'shadow-xl'],
                    contentArea: ['max-h-[calc(90vh-150px)]']
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '#algorithmSteps'
            };

            const addModalConfig = {
                modalId: 'addModal',
                buttonId: 'toggleFullscreenAddBtn',
                classToggleConfig: {
                    modal: ['p-4', 'py-content'],
                    innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
                    contentArea: []
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.p-content.overflow-y-auto.flex-1'
            };

            const editModalConfig = {
                modalId: 'editModal',
                buttonId: 'toggleFullscreenEditBtn',
                classToggleConfig: {
                    modal: ['p-4', 'py-content'],
                    innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
                    contentArea: []
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.p-content.overflow-y-auto.flex-1'
            };

            const bookmarkModalConfig = {
                modalId: 'bookmarkModal',
                buttonId: 'toggleFullscreenBookmarkBtn',
                classToggleConfig: {
                    modal: ['p-4'],
                    innerContainer: ['max-w-2xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
                    contentArea: []
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.p-content.overflow-y-auto.flex-1'
            };

            const initButton = (btn, config) => {
                if (btn && !btn.dataset.fullscreenListenerAttached) {
                    btn.addEventListener('click', () => toggleModalFullscreen(
                        config.modalId,
                        config.buttonId,
                        config.classToggleConfig,
                        config.innerContainerSelector,
                        config.contentAreaSelector
                    ));
                    btn.dataset.fullscreenListenerAttached = 'true';
                    console.log(`Fullscreen toggle initialized for ${config.modalId}.`);
                }
            };

            initButton(viewBtn, algorithmModalConfig);
            initButton(addBtn, addModalConfig);
            initButton(editBtn, editModalConfig);
            initButton(reglamentBtn, reglamentModalConfig);
            initButton(bookmarkBtn, bookmarkModalConfig);

            console.log("Attempted to initialize fullscreen toggles.");
        }


        async function getAllExtLinks() {
            try {
                if (typeof getAllFromIndexedDB !== 'function') {
                    throw new Error("Функция getAllFromIndexedDB не определена.");
                }
                const links = await getAllFromIndexedDB('extLinks');
                return links || [];
            } catch (error) {
                console.error("Ошибка при получении всех внешних ссылок из IndexedDB:", error);
                showNotification("Не удалось получить список внешних ресурсов", "error");
                return [];
            }
        }

        if (typeof debounce === 'undefined') {
            function debounce(func, wait, immediate) {
                let timeout;
                return function executedFunction(...args) {
                    const context = this;
                    const later = function () {
                        timeout = null;
                        if (!immediate) func.apply(context, args);
                    };
                    const callNow = immediate && !timeout;
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                    if (callNow) func.apply(context, args);
                };
            }
        }


        function forceReloadApp() {
            const confirmation = confirm(
                "Вы уверены, что хотите перезагрузить приложение?\n\n" +
                "Это действие аналогично обновлению страницы в браузере (F5).\n" +
                "Если вы хотите гарантированно загрузить последнюю версию после обновления, " +
                "используйте 'жесткую перезагрузку' вашего браузера (обычно Ctrl+F5 или Cmd+Shift+R)."
            );

            if (confirmation) {
                console.log("Перезагрузка приложения по запросу пользователя...");
                showNotification("Перезагрузка приложения...", "info");
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                console.log("Перезагрузка отменена пользователем.");
            }
        }


        function initReloadButton() {
            const reloadBtn = document.getElementById('forceReloadBtn');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', forceReloadApp);
                console.log("Кнопка перезагрузки инициализирована.");
            } else {
                console.warn("Кнопка перезагрузки #forceReloadBtn не найдена.");
            }
        }


        let initialEditState = null;
        let initialAddState = null;


        function getCurrentEditState() {
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const editStepsContainer = document.getElementById('editSteps');

            if (!algorithmTitleInput || !editStepsContainer) {
                console.error("getCurrentEditState: Не найдены элементы формы редактирования.");
                return null;
            }

            const currentTitle = algorithmTitleInput.value.trim();
            const { steps: currentSteps, isValid } = extractStepsData(editStepsContainer);

            return {
                title: currentTitle,
                steps: currentSteps
            };
        }


        function getCurrentAddState() {
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');

            if (!newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer) {
                console.error("getCurrentAddState: Не найдены элементы формы добавления.");
                return null;
            }

            const currentTitle = newAlgorithmTitle.value.trim();
            const currentDescription = newAlgorithmDesc.value.trim();
            const { steps: currentSteps, isValid } = extractStepsData(newStepsContainer);

            return {
                title: currentTitle,
                description: currentDescription,
                steps: currentSteps
            };
        }


        function hasChanges(modalType) {
            let initialState;
            let currentState;

            if (modalType === 'edit') {
                initialState = initialEditState;
                currentState = getCurrentEditState();
            } else if (modalType === 'add') {
                initialState = initialAddState;
                currentState = getCurrentAddState();
            } else {
                console.warn("hasChanges: Неизвестный тип модального окна:", modalType);
                return false;
            }

            if (!initialState || !currentState) {
                console.warn("hasChanges: Не удалось получить начальное или текущее состояние для", modalType);
                return false;
            }

            try {
                const initialJson = JSON.stringify(initialState);
                const currentJson = JSON.stringify(currentState);
                const changed = initialJson !== currentJson;
                console.log(`hasChanges (${modalType}):`, changed);
                return changed;
            } catch (error) {
                console.error("hasChanges: Ошибка при сравнении состояний:", error);
                return false;
            }
        }


        function requestCloseModal(modalElement) {
            if (!modalElement) return false;

            const modalId = modalElement.id;
            let modalType = null;

            if (modalId === 'editModal') {
                modalType = 'edit';
            } else if (modalId === 'addModal') {
                modalType = 'add';
            } else {
                console.warn("requestCloseModal: Вызвано для неизвестного модального окна:", modalId);
                modalElement.classList.add('hidden');
                return true;
            }

            if (hasChanges(modalType)) {
                if (!confirm("Вы не сохранили изменения. Закрыть без сохранения?")) {
                    console.log(`Закрытие окна ${modalId} отменено пользователем.`);
                    return false;
                }
                console.log(`Закрытие окна ${modalId} подтверждено пользователем (с изменениями).`);
            } else {
                console.log(`Закрытие окна ${modalId} (без изменений).`);
            }

            modalElement.classList.add('hidden');
            if (modalType === 'edit') {
                initialEditState = null;
            } else if (modalType === 'add') {
                initialAddState = null;
            }
            return true;
        }


        function captureInitialEditState(algorithm) {
            if (!algorithm) {
                initialEditState = null;
                return;
            }
            try {
                initialEditState = JSON.parse(JSON.stringify({
                    title: algorithm.title || '',
                    steps: algorithm.steps || []
                }));
                console.log("Захвачено начальное состояние для редактирования:", initialEditState);
            } catch (error) {
                console.error("Ошибка при захвате начального состояния редактирования:", error);
                initialEditState = null;
            }
        }


        function captureInitialAddState() {
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');

            const initialTitle = newAlgorithmTitle ? newAlgorithmTitle.value.trim() : '';
            const initialDescription = newAlgorithmDesc ? newAlgorithmDesc.value.trim() : '';
            let initialSteps = [];

            if (newStepsContainer) {
                const extracted = extractStepsData(newStepsContainer);
                initialSteps = extracted.steps;
            } else {
                console.warn("captureInitialAddState: Контейнер newSteps не найден при захвате состояния.");
            }

            initialAddState = {
                title: initialTitle,
                description: initialDescription,
                steps: initialSteps
            };
            console.log("Захвачено начальное состояние для добавления:", initialAddState);
        }


        function showNoInnModal() {
            let modal = document.getElementById('noInnModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'noInnModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[60] p-4 flex items-center justify-center hidden';
                modal.innerHTML = `
             <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                 <div class="p-6">
                     <div class="flex justify-between items-center mb-4">
                         <h2 class="text-xl font-bold">Клиент не знает ИНН</h2>
                         <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" aria-label="Закрыть"><i class="fas fa-times text-xl"></i></button>
                     </div>
                     <div class="space-y-3 text-sm">
                         <p>Альтернативные способы идентификации:</p>
                         <ol class="list-decimal ml-5 space-y-1.5">
                             <li>Полное наименование организации</li>
                             <li>Юридический адрес</li>
                             <li>КПП или ОГРН</li>
                             <li>ФИО руководителя</li>
                             <li>Проверить данные через <a href="https://egrul.nalog.ru/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">сервис ФНС</a></li>
                         </ol>
                         <p class="mt-3 text-xs italic text-gray-600 dark:text-gray-400">Тщательно проверяйте данные при идентификации без ИНН.</p>
                     </div>
                     <div class="mt-6 flex justify-end">
                         <button class="close-modal px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">Понятно</button>
                     </div>
                 </div>
             </div>`;
                document.body.appendChild(modal);

                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target.closest('.close-modal')) {
                        modal.classList.add('hidden');
                    }
                });
                const closeModalOnEscape = (e) => {
                    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                        modal.classList.add('hidden');
                        document.removeEventListener('keydown', closeModalOnEscape);
                    }
                };
                document.addEventListener('keydown', closeModalOnEscape);
            }
            modal.classList.remove('hidden');
        }


        async function loadEmployeeExtension() {
            const displaySpan = document.getElementById('employeeExtensionDisplay');
            if (!displaySpan) return;

            let extension = '';
            try {
                if (db) {
                    const pref = await getFromIndexedDB('preferences', 'employeeExtension');
                    extension = pref?.value || '';
                } else {
                    extension = localStorage.getItem('employeeExtension') || ''; // Fallback
                    console.warn("Загрузка добавочного номера из localStorage (DB недоступна)");
                }
            } catch (error) {
                console.error("Ошибка при загрузке добавочного номера:", error);
                extension = localStorage.getItem('employeeExtension') || ''; // Fallback on error
            }
            updateExtensionDisplay(extension);
        }


        async function saveEmployeeExtension(extensionValue) {
            const valueToSave = extensionValue.trim().replace(/\D/g, ''); // Удаляем нецифровые символы

            try {
                if (db) {
                    await saveToIndexedDB('preferences', { id: 'employeeExtension', value: valueToSave });
                    console.log("Добавочный номер сохранен в IndexedDB:", valueToSave);
                } else {
                    localStorage.setItem('employeeExtension', valueToSave); // Fallback
                    console.warn("Сохранение добавочного номера в localStorage (DB недоступна)");
                }
                updateExtensionDisplay(valueToSave);
                return true;
            } catch (error) {
                console.error("Ошибка при сохранении добавочного номера:", error);
                showNotification("Не удалось сохранить добавочный номер", "error");
                return false;
            }
        }


        function updateExtensionDisplay(extensionValue) {
            const displaySpan = document.getElementById('employeeExtensionDisplay');
            if (!displaySpan) return;

            if (extensionValue) {
                displaySpan.textContent = extensionValue;
                displaySpan.classList.remove('italic', 'text-gray-500', 'dark:text-gray-400');
            } else {
                displaySpan.textContent = 'Введите свой добавочный';
                displaySpan.classList.add('italic', 'text-gray-500', 'dark:text-gray-400');
            }
        }


        function setupExtensionFieldListeners() {
            const displaySpan = document.getElementById('employeeExtensionDisplay');
            const inputField = document.getElementById('employeeExtensionInput');

            if (!displaySpan || !inputField) {
                console.error("Не найдены элементы для добавочного номера (#employeeExtensionDisplay или #employeeExtensionInput).");
                return;
            }

            displaySpan.addEventListener('click', () => {
                console.log("Клик по displaySpan, активация редактирования.");
                const currentValue = (displaySpan.textContent !== 'Введите свой добавочный' && !displaySpan.classList.contains('italic')) ? displaySpan.textContent : '';
                inputField.value = currentValue;
                displaySpan.classList.add('hidden');
                inputField.classList.remove('hidden');
                setTimeout(() => {
                    inputField.focus();
                    inputField.select();
                }, 0);
            });

            const finishEditing = async (saveChanges = true) => {
                if (inputField.classList.contains('hidden')) {
                    console.log("finishEditing вызван, но поле ввода скрыто. Ничего не делаем.");
                    return;
                }

                console.log("Завершение редактирования. Сохранять:", saveChanges);
                let saved = false;
                if (saveChanges) {
                    const newValue = inputField.value;
                    saved = await saveEmployeeExtension(newValue);
                } else {
                    await loadEmployeeExtension();
                    saved = true;
                }

                if (saved) {
                    inputField.classList.add('hidden');
                    displaySpan.classList.remove('hidden');
                    console.log("Поле ввода скрыто, отображение восстановлено.");
                } else {
                    inputField.focus();
                    showNotification("Ошибка сохранения. Попробуйте еще раз.", "warning");
                    console.log("Ошибка сохранения, поле ввода остается видимым.");
                }
            };

            inputField.addEventListener('blur', (e) => {
                console.log("Поле ввода потеряло фокус (blur).");
                setTimeout(() => {
                    if (!inputField.classList.contains('hidden')) {
                        console.log("Поле ввода все еще видимо после blur, вызываем finishEditing(true).");
                        finishEditing(true);
                    } else {
                        console.log("Поле ввода уже скрыто к моменту отложенного вызова blur, ничего не делаем.");
                    }
                }, 150);
            });

            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    console.log("Нажата клавиша Enter.");
                    e.preventDefault();
                    finishEditing(true);
                } else if (e.key === 'Escape') {
                    console.log("Нажата клавиша Escape.");
                    e.preventDefault();
                    finishEditing(false);
                }
            });

            inputField.addEventListener('input', () => {
                const originalValue = inputField.value;
                const numericValue = originalValue.replace(/\D/g, '');
                if (originalValue !== numericValue) {
                    inputField.value = numericValue;
                }
            });

            console.log("Обработчики событий для поля добавочного номера настроены.");
        }
