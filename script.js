        let db;
        const DB_NAME = '1C_Support_Guide';
        const DB_VERSION = 4;
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
            },
            {
                name: 'screenshots',
                options: { keyPath: 'id', autoIncrement: true },
                indexes: [
                    { name: 'parentId', keyPath: 'parentId', options: { unique: false } },
                    { name: 'parentType', keyPath: 'parentType', options: { unique: false } }
                ]
            }
        ];


        // Initialize the database
        function initDB() {
            return new Promise((resolve, reject) => {
                console.log(`Открытие базы данных ${DB_NAME} версии ${DB_VERSION}`);
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = e => {
                    console.error("Ошибка IndexedDB:", e.target.error);
                    reject("Не удалось открыть базу данных. Используется резервное хранилище.");
                };
                request.onsuccess = e => {
                    db = e.target.result;
                    console.log("База данных успешно открыта");
                    db.onerror = ev => console.error("Ошибка базы данных:", ev.target.error);

                    checkAndBuildIndex().then(() => resolve(db)).catch(reject);
                };
                request.onupgradeneeded = e => {
                    const currentDb = e.target.result;
                    const transaction = e.target.transaction;
                    console.log(`Обновление базы данных с версии ${e.oldVersion} до ${e.newVersion}`);

                    storeConfigs.forEach(config => {
                        if (!currentDb.objectStoreNames.contains(config.name)) {
                            console.log(`Создание хранилища объектов: ${config.name}`);
                            const store = currentDb.createObjectStore(config.name, config.options);
                            config.indexes?.forEach(index => {
                                console.log(`Создание индекса '${index.name}' в хранилище '${config.name}'`);
                                store.createIndex(index.name, index.keyPath, index.options || {});
                            });
                        } else {
                            const store = transaction.objectStore(config.name);
                            if (config.indexes) {
                                config.indexes.forEach(index => {
                                    if (!store.indexNames.contains(index.name)) {
                                        console.log(`Создание отсутствующего индекса '${index.name}' в существующем хранилище '${config.name}'`);
                                        store.createIndex(index.name, index.keyPath, index.options || {});
                                    }
                                });
                            }
                            console.log(`Хранилище объектов '${config.name}' уже существует.`);

                            if (config.name === 'screenshots' && e.oldVersion < 4) {
                                console.log(`Обновление хранилища 'screenshots' с v${e.oldVersion} до v${DB_VERSION}.`);
                                if (store.indexNames.contains('algorithmId')) {
                                    console.log(`Удаление старого индекса 'algorithmId' из 'screenshots'.`);
                                    try {
                                        store.deleteIndex('algorithmId');
                                    } catch (deleteIndexError) {
                                        console.warn("Не удалось удалить индекс 'algorithmId' (возможно, уже удален):", deleteIndexError);
                                    }
                                }
                                if (!store.indexNames.contains('parentId')) {
                                    console.log(`Создание нового индекса 'parentId' в 'screenshots'.`);
                                    store.createIndex('parentId', 'parentId', { unique: false });
                                }
                            }
                        }
                    });
                    console.log("Обновление структуры базы данных завершено.");
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
                showNotification("Ошибка сохранения настроек категорий: База данных недоступна", "error");
                return false;
            }
            try {
                await saveToIndexedDB('preferences', { id: CATEGORY_INFO_KEY, data: categoryDisplayInfo });
                populateReglamentCategoryDropdowns();
                console.log("Reglament category info saved successfully.");
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


        function getAllFromIndexedDB(storeName) {
            console.log(`[getAllFromIndexedDB] Запрос всех данных из хранилища: ${storeName}`);
            return performDBOperation(storeName, "readonly", store => store.getAll())
                .then(results => {
                    console.log(`[getAllFromIndexedDB] Успешно получено ${results?.length ?? 0} записей из ${storeName}.`);
                    return results || [];
                })
                .catch(error => {
                    console.error(`[getAllFromIndexedDB] Ошибка при получении данных из ${storeName}:`, error);
                    throw error;
                });
        }


        function performDBOperation(storeName, mode, operation) {
            return new Promise((resolve, reject) => {
                if (!db) {
                    console.error(`performDBOperation: База данных (db) не инициализирована! Store: ${storeName}, Mode: ${mode}`);
                    return reject(new Error("База данных не инициализирована"));
                }
                try {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const errorMsg = `Хранилище объектов '${storeName}' не найдено в базе данных. Доступные: ${Array.from(db.objectStoreNames).join(', ')}`;
                        console.error(`performDBOperation: ${errorMsg}`);
                        return reject(new Error(errorMsg));
                    }

                    const transaction = db.transaction(storeName, mode);
                    const store = transaction.objectStore(storeName);
                    const request = operation(store);

                    request.onsuccess = e => resolve(e.target.result);
                    request.onerror = e => {
                        const errorDetails = e.target.error ? `${e.target.error.name}: ${e.target.error.message}` : 'Неизвестная ошибка запроса';
                        console.error(`performDBOperation: Ошибка запроса к хранилищу '${storeName}' (mode: ${mode}). Детали: ${errorDetails}`, e.target.error);
                        reject(e.target.error || new Error(`Ошибка запроса к ${storeName}`));
                    };

                    transaction.onerror = e => {
                        const errorDetails = e.target.error ? `${e.target.error.name}: ${e.target.error.message}` : 'Неизвестная ошибка транзакции';
                        console.error(`performDBOperation: Ошибка транзакции для '${storeName}' (mode: ${mode}). Детали: ${errorDetails}`, e.target.error);
                        reject(e.target.error || new Error(`Ошибка транзакции для ${storeName}`));
                    };
                    transaction.onabort = e => {
                        const errorDetails = e.target.error ? `${e.target.error.name}: ${e.target.error.message}` : 'Транзакция прервана';
                        console.warn(`performDBOperation: Транзакция для '${storeName}' (mode: ${mode}) прервана. Детали: ${errorDetails}`, e.target.error);
                        reject(e.target.error || new Error(`Транзакция для ${storeName} прервана`));
                    };

                } catch (error) {
                    console.error(`performDBOperation: Исключение при попытке выполнить операцию для '${storeName}' (mode: ${mode}).`, error);
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
            renderAlgorithmCards('lk1c');
        }


        async function loadFromIndexedDB() {
            console.log("Запуск loadFromIndexedDB...");

            if (typeof algorithms === 'undefined' || algorithms === null) {
                algorithms = {};
            }
            const defaultMainAlgorithm = {
                id: "main",
                title: "Главный алгоритм работы",
                steps: [
                    { title: "Приветствие", description: "Обозначьте клиенту, куда он дозвонился, представьтесь, поприветствуйте клиента.", example: "Пример: Техническая поддержка сервиса 1С-Отчетность, меня зовут Сиреневый_Турбовыбулькиватель. Здравствуйте!" },
                    { title: "Уточнение ИНН", description: "Запросите ИНН организации для идентификации клиента в системе и дальнейшей работы.", example: "Пример: Назовите, пожалуйста, ИНН организации.", type: 'inn_step', },
                    { title: "Идентификация проблемы", description: "Выясните суть проблемы, задавая уточняющие вопросы. Важно выяснить как можно больше деталей для составления полной картины.", example: { type: 'list', intro: "Примеры вопросов:", items: ["Уточните, пожалуйста, полный текст ошибки.", "При каких действиях возникает ошибка?"] } },
                    { title: "Решение проблемы", description: "Четко для себя определите категорию (направление) проблемы и перейдите к соответствующему разделу в помощнике (либо статье на track.astral.ru) с инструкциями по решению." }
                ]
            };
            const defaultOtherSections = {
                program: [],
                skzi: [],
                lk1c: [],
                webReg: []
            };

            const mainTitleElement = document.querySelector('#mainContent h2');
            if (mainTitleElement) {
                mainTitleElement.textContent = algorithms.main?.title || defaultMainAlgorithm.title;
                console.log(`[loadFromIndexedDB] Установлен начальный заголовок: "${mainTitleElement.textContent}"`);
            } else {
                console.warn("[loadFromIndexedDB] Не найден элемент #mainContent h2 для установки начального заголовка.");
            }

            if (!db) {
                console.warn("База данных не инициализирована. Используются только дефолтные данные.");
                algorithms.main = JSON.parse(JSON.stringify(defaultMainAlgorithm));
                Object.assign(algorithms, JSON.parse(JSON.stringify(defaultOtherSections)));

                if (mainTitleElement) {
                    mainTitleElement.textContent = algorithms.main.title;
                }

                if (typeof renderAllAlgorithms === 'function') {
                    renderAllAlgorithms();
                } else {
                    console.error("Функция renderAllAlgorithms НЕ ОПРЕДЕЛЕНА на момент вызова в loadFromIndexedDB при отсутствии DB!");
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                    if (typeof renderAlgorithmCards === 'function') {
                        renderAlgorithmCards('program');
                        renderAlgorithmCards('skzi');
                        renderAlgorithmCards('lk1c');
                        renderAlgorithmCards('webReg');
                    }
                }
                return false;
            }

            let loadedDataUsed = false;

            try {
                console.log("Попытка загрузить 'algorithms', 'all' из IndexedDB...");
                const savedAlgorithmsContainer = await getFromIndexedDB('algorithms', 'all');
                console.log("Результат загрузки 'algorithms', 'all':", savedAlgorithmsContainer ? JSON.parse(JSON.stringify(savedAlgorithmsContainer)) : savedAlgorithmsContainer);

                let loadedAlgoData = null;
                if (savedAlgorithmsContainer?.data && typeof savedAlgorithmsContainer.data === 'object') {
                    loadedAlgoData = savedAlgorithmsContainer.data;
                    console.log("Обнаружены сохраненные данные алгоритмов. Структура:", Object.keys(loadedAlgoData));
                    loadedDataUsed = true;
                } else {
                    console.warn("Нет сохраненных данных алгоритмов ('algorithms', 'all') в IndexedDB или формат контейнера некорректен. Будут использованы значения по умолчанию.");
                }

                if (
                    loadedAlgoData &&
                    typeof loadedAlgoData.main === 'object' &&
                    loadedAlgoData.main !== null &&
                    Array.isArray(loadedAlgoData.main.steps) &&
                    loadedAlgoData.main.steps.length > 0
                ) {
                    algorithms.main = loadedAlgoData.main;
                    if (!algorithms.main.id) algorithms.main.id = 'main';
                    console.log(`Данные 'main' из IndexedDB прошли проверку и загружены (${algorithms.main.steps.length} шагов).`);
                    if (mainTitleElement) {
                        mainTitleElement.textContent = algorithms.main.title || defaultMainAlgorithm.title;
                        console.log(`[loadFromIndexedDB] Установлен заголовок главного алгоритма из DB: "${mainTitleElement.textContent}"`);
                    }
                } else {
                    let reason = "Причина неясна";
                    if (!loadedAlgoData) reason = "Нет загруженных данных.";
                    else if (typeof loadedAlgoData.main !== 'object' || loadedAlgoData.main === null) reason = "'main' не объект или null.";
                    else if (!Array.isArray(loadedAlgoData.main.steps)) reason = "'main.steps' не массив.";
                    else if (loadedAlgoData.main.steps.length === 0) reason = "'main.steps' пустой массив.";
                    console.warn(`Загруженные данные 'main' некорректны или пусты (${reason}). Используются значения по умолчанию для 'main'. Загружено:`, loadedAlgoData?.main);
                    algorithms.main = JSON.parse(JSON.stringify(defaultMainAlgorithm));
                    if (mainTitleElement) {
                        mainTitleElement.textContent = algorithms.main.title;
                        console.log(`[loadFromIndexedDB] Установлен дефолтный заголовок главного алгоритма (данные из DB некорректны или отсутствуют): "${mainTitleElement.textContent}"`);
                    }
                }

                Object.keys(defaultOtherSections).forEach(section => {
                    if (loadedAlgoData && loadedAlgoData.hasOwnProperty(section) && Array.isArray(loadedAlgoData[section])) {
                        algorithms[section] = loadedAlgoData[section].map(item => {
                            if (item && typeof item === 'object') {
                                if (typeof item.id === 'undefined' && item.title) {
                                    console.warn(`Алгоритм в секции '${section}' без ID, генерируем временный:`, item.title);
                                    item.id = `${section}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                                }
                                return item;
                            }
                            console.warn(`Пропуск невалидного элемента (не объект) в секции ${section}:`, item);
                            return null;
                        }).filter(item => item && typeof item.id !== 'undefined');

                        console.log(`Данные '${section}' из IndexedDB загружены (${algorithms[section].length} валидных элементов).`);
                    } else {
                        console.warn(`Загруженные данные для '${section}' не являются массивом или секция отсутствует. Используется пустой массив по умолчанию. Загружено:`, loadedAlgoData ? loadedAlgoData[section] : 'N/A');
                        algorithms[section] = [];
                    }
                });

                if (typeof renderAllAlgorithms === 'function') {
                    console.log("Вызов renderAllAlgorithms после загрузки данных.");
                    renderAllAlgorithms();
                } else {
                    console.error("Функция renderAllAlgorithms НЕ ОПРЕДЕЛЕНА на момент вызова в loadFromIndexedDB!");
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                    if (typeof renderAlgorithmCards === 'function') {
                        Object.keys(defaultOtherSections).forEach(section => renderAlgorithmCards(section));
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
                if (!algorithms.main || !algorithms.main.steps || !Array.isArray(algorithms.main.steps) || algorithms.main.steps.length === 0) {
                    console.error("!!! ПРОВЕРКА В КОНЦЕ loadFromIndexedDB: Main algorithm steps ПУСТЫ или отсутствуют ПОСЛЕ загрузки! Восстанавливаем из дефолта.");
                    algorithms.main = JSON.parse(JSON.stringify(defaultMainAlgorithm));
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                }

                return true;

            } catch (error) {
                console.error("КРИТИЧЕСКАЯ ОШИБКА в loadFromIndexedDB:", error);
                algorithms = algorithms || {};
                algorithms.main = algorithms.main || JSON.parse(JSON.stringify(defaultMainAlgorithm));
                if (!Array.isArray(algorithms.main?.steps) || algorithms.main.steps.length === 0) {
                    console.error("Критическая ошибка привела к ПУСТОМУ/НЕ МАССИВУ в main.steps! Восстанавливаем из дефолта.");
                    algorithms.main = JSON.parse(JSON.stringify(defaultMainAlgorithm));
                }
                Object.keys(defaultOtherSections).forEach(section => {
                    algorithms[section] = algorithms[section] || [];
                });

                if (mainTitleElement) {
                    mainTitleElement.textContent = algorithms.main.title;
                    console.log(`[loadFromIndexedDB - catch] Установлен заголовок главного алгоритма (вероятно дефолтный): "${mainTitleElement.textContent}"`);
                }

                console.warn("Из-за ошибки в loadFromIndexedDB, принудительно вызываем renderAllAlgorithms с текущими (возможно дефолтными) данными.");
                if (typeof renderAllAlgorithms === 'function') {
                    renderAllAlgorithms();
                } else {
                    console.error("Функция renderAllAlgorithms НЕ ОПРЕДЕЛЕНА на момент вызова в catch блоке loadFromIndexedDB!");
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                    if (typeof renderAlgorithmCards === 'function') {
                        Object.keys(defaultOtherSections).forEach(section => renderAlgorithmCards(section));
                    }
                }
                return false;
            }
        }


        async function saveDataToIndexedDB() {
            if (!db) {
                console.error("Cannot save data: Database not initialized.");
                showNotification("Ошибка сохранения: База данных недоступна", "error");
                return false;
            }

            try {
                const clientDataToSave = getClientData();
                const algorithmsToSave = { section: 'all', data: algorithms };

                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction(['algorithms', 'clientData'], 'readwrite');
                    const algoStore = transaction.objectStore('algorithms');
                    const clientStore = transaction.objectStore('clientData');
                    let opsCompleted = 0;
                    const totalOps = 2;

                    const checkCompletion = () => {
                        opsCompleted++;
                        if (opsCompleted === totalOps) {
                        }
                    };

                    const req1 = algoStore.put(algorithmsToSave);
                    req1.onsuccess = checkCompletion;
                    req1.onerror = (e) => {
                        console.error("Error saving algorithms:", e.target.error);
                    };

                    const req2 = clientStore.put(clientDataToSave);
                    req2.onsuccess = checkCompletion;
                    req2.onerror = (e) => {
                        console.error("Error saving clientData:", e.target.error);
                    };

                    transaction.oncomplete = () => {
                        console.log("Algorithms and clientData saved successfully in one transaction.");
                        resolve(true);
                    };

                    transaction.onerror = (e) => {
                        console.error("Error during save transaction for algorithms/clientData:", e.target.error);
                        reject(e.target.error);
                    };

                    transaction.onabort = (e) => {
                        console.warn("Save transaction for algorithms/clientData aborted:", e.target.error);
                        if (!e.target.error) {
                            reject(new Error("Save transaction aborted"));
                        }
                    };
                });

            } catch (error) {
                console.error("Failed to execute save transaction:", error);
                showNotification("Ошибка сохранения данных", "error");
                return false;
            }
        }


        const tabsConfig = [
            { id: 'main', name: 'Главный алгоритм' },
            { id: 'program', name: 'Программа 1С' },
            { id: 'links', name: 'Ссылки 1С' },
            { id: 'skzi', name: 'СКЗИ' },
            { id: 'lk1c', name: '1СО ЛК' },
            { id: 'webReg', name: 'Веб-Регистратор' },
            { id: 'extLinks', name: 'Внешние ресурсы' },
            { id: 'reglaments', name: 'Регламенты' },
            { id: 'bookmarks', name: 'Закладки' }
        ];
        const defaultPanelOrder = tabsConfig.map(t => t.id);
        const defaultPanelVisibility = tabsConfig.map(() => true);


        async function loadUISettings() {
            console.log("Loading UI settings for modal...");
            let loadedSettings = {};
            const currentPanelIds = tabsConfig.map(t => t.id);
            const defaultPanelOrder = tabsConfig.map(t => t.id);
            const defaultPanelVisibility = tabsConfig.map(() => true);

            try {
                const settingsFromDB = await getFromIndexedDB('preferences', 'uiSettings');
                if (settingsFromDB && typeof settingsFromDB === 'object') {
                    const savedOrder = settingsFromDB.panelOrder || [];
                    const savedVisibility = settingsFromDB.panelVisibility || [];
                    const knownPanelIds = new Set(currentPanelIds);

                    let effectiveOrder = [];
                    let effectiveVisibility = [];
                    const processedIds = new Set();

                    savedOrder.forEach((panelId, index) => {
                        if (knownPanelIds.has(panelId)) {
                            effectiveOrder.push(panelId);
                            effectiveVisibility.push(savedVisibility[index] ?? true);
                            processedIds.add(panelId);
                        } else {
                            console.warn(`loadUISettings: Saved panel ID "${panelId}" no longer exists in tabsConfig. Ignoring.`);
                        }
                    });

                    currentPanelIds.forEach(panelId => {
                        if (!processedIds.has(panelId)) {
                            console.log(`loadUISettings: Adding new panel "${panelId}" to order/visibility.`);
                            effectiveOrder.push(panelId);
                            effectiveVisibility.push(true);
                        }
                    });

                    loadedSettings = {
                        ...DEFAULT_UI_SETTINGS,
                        ...settingsFromDB,
                        id: 'uiSettings',
                        panelOrder: effectiveOrder,
                        panelVisibility: effectiveVisibility
                    };
                    console.log("Merged UI settings from DB:", JSON.parse(JSON.stringify(loadedSettings)));

                } else {
                    console.log("No UI settings found in DB or invalid format, using defaults including default panel config.");
                    loadedSettings = {
                        ...DEFAULT_UI_SETTINGS,
                        id: 'uiSettings',
                        panelOrder: defaultPanelOrder,
                        panelVisibility: defaultPanelVisibility
                    };
                }
            } catch (error) {
                console.error("Error loading UI settings from DB:", error);
                showNotification("Ошибка загрузки настроек интерфейса", "error");
                loadedSettings = {
                    ...DEFAULT_UI_SETTINGS,
                    id: 'uiSettings',
                    panelOrder: defaultPanelOrder,
                    panelVisibility: defaultPanelVisibility
                };
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
                console.error("Export failed: Database (db variable) is not initialized.");
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
                schemaVersion: "1.4",
                exportDate: new Date().toISOString(),
                data: {}
            };
            let exportError = null;
            let transaction;

            const blobToBase64 = (blob) => {
                return new Promise((resolve, reject) => {
                    if (!(blob instanceof Blob)) {
                        console.warn("Попытка конвертировать не Blob в Base64:", blob);
                        return resolve(null);
                    }
                    const reader = new FileReader();
                    reader.onerror = reject;
                    reader.onload = () => {
                        const dataUrl = reader.result;
                        if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
                            console.error("Некорректный формат Data URL:", dataUrl);
                            return reject(new Error("Некорректный формат Data URL"));
                        }
                        const base64String = dataUrl.split(',')[1];
                        resolve({ base64: base64String, type: blob.type });
                    };
                    reader.readAsDataURL(blob);
                });
            };

            try {
                if (!db) throw new Error("База данных стала недоступна перед транзакцией экспорта.");

                transaction = db.transaction(storesToRead, 'readonly');
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

                const results = await Promise.allSettled(promises);

                const fulfilledResults = [];
                const rejectedReasons = [];
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        fulfilledResults.push(result.value);
                    } else {
                        console.error(`Ошибка при чтении хранилища ${storesToRead[index]}:`, result.reason);
                        rejectedReasons.push(`Ошибка в ${storesToRead[index]}: ${result.reason?.message || result.reason}`);
                        if (!exportError) exportError = result.reason;
                    }
                });

                if (rejectedReasons.length > 0 && !exportError) {
                    exportError = new Error(`Ошибки чтения из хранилищ: ${rejectedReasons.join('; ')}`);
                }

                if (exportError) {
                    console.error("Экспорт прерван из-за ошибки:", exportError);
                    throw exportError;
                }

                const screenshotDataIndex = fulfilledResults.findIndex(r => r.storeName === 'screenshots');
                if (screenshotDataIndex !== -1) {
                    const screenshotResult = fulfilledResults[screenshotDataIndex];
                    if (Array.isArray(screenshotResult.data)) {
                        console.log(`Начало обработки ${screenshotResult.data.length} скриншотов для конвертации в Base64...`);
                        showNotification(`Обработка ${screenshotResult.data.length} скриншотов...`, "info");
                        const processedScreenshots = [];
                        const conversionPromises = screenshotResult.data.map(async (item) => {
                            if (item && item.blob instanceof Blob) {
                                const base64Data = await blobToBase64(item.blob);
                                if (base64Data) {
                                    const { blob, ...rest } = item;
                                    return { ...rest, blob: base64Data };
                                } else {
                                    console.warn(`Не удалось конвертировать Blob для скриншота ID: ${item.id}`);
                                    const { blob, ...rest } = item;
                                    return rest;
                                }
                            } else {
                                return item;
                            }
                        });
                        screenshotResult.data = await Promise.all(conversionPromises);
                        console.log(`Обработка скриншотов завершена.`);
                    }
                }

                fulfilledResults.forEach(result => {
                    exportData.data[result.storeName] = Array.isArray(result.data) ? result.data : [];
                });

                console.log("Данные для экспорта собраны:", Object.keys(exportData.data).map(k => `${k}: ${exportData.data[k].length} items`));

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
                            const dataUri = URL.createObjectURL(dataBlob);
                            const linkElement = document.createElement('a');
                            linkElement.href = dataUri;
                            linkElement.download = exportFileName;
                            document.body.appendChild(linkElement);
                            linkElement.click();
                            document.body.removeChild(linkElement);
                            URL.revokeObjectURL(dataUri);
                            showNotification("Данные успешно экспортированы (fallback)");
                            console.log("Экспорт через data URI (fallback) завершен успешно.");
                        } else {
                            console.log("Экспорт отменен пользователем.");
                            showNotification("Экспорт отменен", "info");
                        }
                    }
                } else {
                    const dataUri = URL.createObjectURL(dataBlob);
                    const linkElement = document.createElement('a');
                    linkElement.href = dataUri;
                    linkElement.download = exportFileName;
                    document.body.appendChild(linkElement);
                    linkElement.click();
                    document.body.removeChild(linkElement);
                    URL.revokeObjectURL(dataUri);
                    showNotification("Данные успешно экспортированы");
                    console.log("Экспорт через data URI завершен успешно.");
                }

            } catch (error) {
                console.error("Полная ошибка при экспорте данных:", error);
                showNotification(`Критическая ошибка при экспорте: ${error.message || 'Неизвестная ошибка'}`, "error");
                if (transaction && typeof transaction.abort === 'function' && transaction.readyState !== 'done') {
                    try { transaction.abort(); } catch (e) { console.error("Ошибка при отмене транзакции в catch:", e); }
                }
            }
        }


        function base64ToBlob(base64, mimeType = '') {
            if (!base64 || typeof base64 !== 'string') {
                console.error(`Ошибка конвертации Base64 в Blob: Передана невалидная строка Base64.`);
                return null;
            }
            try {
                const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
                if (!base64Data) {
                    console.error(`Ошибка конвертации Base64 в Blob: Строка Base64 пуста после удаления префикса.`);
                    return null;
                }
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                return new Blob([byteArray], { type: mimeType });
            } catch (error) {
                console.error(`Ошибка конвертации Base64 в Blob (MIME: ${mimeType}, Base64 начало: ${base64.substring(0, 30)}...):`, error);
                if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
                    console.error("   > Вероятно, строка Base64 содержит невалидные символы.");
                }
                return null;
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
            const errorsOccurred = [];
            let importTransactionSuccessful = false;
            let finalOutcomeSuccess = false;

            try {
                await new Promise(async (resolve, reject) => {
                    let transaction;
                    try {
                        transaction = db.transaction(storesToImport, 'readwrite');
                    } catch (txError) {
                        console.error("Ошибка создания транзакции импорта:", txError);
                        errorsOccurred.push({ storeName: storesToImport.join(', '), error: `Ошибка создания транзакции: ${txError.message}`, item: null });
                        return reject(txError);
                    }

                    const allRequests = [];
                    let putPromises = [];

                    transaction.oncomplete = () => {
                        console.log("Транзакция импорта успешно завершена (oncomplete).");
                        importTransactionSuccessful = true;
                        resolve();
                    };
                    transaction.onerror = (e) => {
                        const errorMsg = e.target.error?.message || `Transaction error during import`;
                        console.error(`ОШИБКА ТРАНЗАКЦИИ ИМПОРТА (onerror):`, errorMsg, e.target.error);
                        errorsOccurred.push({ storeName: storesToImport.join(', '), error: `Критическая ошибка транзакции: ${errorMsg}. Импорт отменен.`, item: null });
                        importTransactionSuccessful = false;
                        reject(e.target.error || new Error(errorMsg));
                    };
                    transaction.onabort = (e) => {
                        const errorMsg = e.target.error?.message || `Transaction aborted during import`;
                        console.warn(`ТРАНЗАКЦИЯ ИМПОРТА ПРЕРВАНА (onabort):`, errorMsg, e.target.error);
                        if (!errorsOccurred.some(err => err.error.includes('Критическая ошибка'))) {
                            errorsOccurred.push({ storeName: storesToImport.join(', '), error: `Транзакция прервана: ${errorMsg}. Импорт отменен.`, item: null });
                        }
                        importTransactionSuccessful = false;
                        reject(e.target.error || new Error(errorMsg));
                    };

                    for (const storeName of storesToImport) {
                        console.log(`Подготовка к очистке хранилища: ${storeName}`);
                        try {
                            const store = transaction.objectStore(storeName);
                            const clearRequest = store.clear();
                            allRequests.push(new Promise((resolveReq, rejectReq) => {
                                clearRequest.onsuccess = () => {
                                    console.log(`Хранилище ${storeName} успешно очищено (в транзакции).`);
                                    resolveReq({ storeName, operation: 'clear', success: true });
                                };
                                clearRequest.onerror = (e) => {
                                    const errorMsg = `Ошибка очистки ${storeName}: ${e.target.error?.message || e.target.error}`;
                                    console.error(errorMsg, e.target.error);
                                    errorsOccurred.push({ storeName, error: `Ошибка очистки: ${errorMsg}`, item: null });
                                    resolveReq({ storeName, operation: 'clear', success: false, error: e.target.error });
                                };
                            }));
                        } catch (storeError) {
                            console.error(`Ошибка доступа к хранилищу ${storeName} для очистки: ${storeError}`);
                            errorsOccurred.push({ storeName, error: `Ошибка доступа к ${storeName} для очистки: ${storeError.message}`, item: null });
                        }
                    }
                    await Promise.all(allRequests);
                    console.log("Очистка хранилищ завершена (или получены ошибки).");
                    const clearErrors = errorsOccurred.filter(e => e.operation === 'clear' && !e.success);
                    if (clearErrors.length > 0) {
                        throw new Error(`Не удалось очистить одно или несколько хранилищ: ${clearErrors.map(e => e.storeName).join(', ')}`);
                    }

                    let totalPutsInitiated = 0;
                    let skippedPuts = 0;

                    for (const storeName of storesToImport) {
                        let itemsToImport = importData.data[storeName];
                        if (!Array.isArray(itemsToImport)) {
                            console.warn(`Данные для ${storeName} в файле импорта не являются массивом. Пропуск добавления.`);
                            errorsOccurred.push({ storeName, error: 'Данные не являются массивом', item: null });
                            continue;
                        }

                        console.log(`Начало подготовки добавления данных в хранилище: ${storeName} (${itemsToImport.length} записей)`);
                        showNotification(`Импорт ${storeName}...`, "info");

                        if (storeName === 'screenshots') {
                            console.log(`[Импорт] Обработка скриншотов для конвертации Base64 -> Blob...`);
                            itemsToImport = itemsToImport.map((item, index) => {
                                if (item && typeof item.blob === 'object' && item.blob !== null && typeof item.blob.base64 === 'string' && typeof item.blob.type === 'string') {
                                    const convertedBlob = base64ToBlob(item.blob.base64, item.blob.type);
                                    if (convertedBlob instanceof Blob) {
                                        console.log(`[Импорт] Скриншот ID (если есть): ${item.id || index}, Blob сконвертирован успешно.`);
                                        item.blob = convertedBlob;
                                    } else {
                                        console.error(`[Импорт] Ошибка конвертации Base64 в Blob для скриншота ID: ${item.id || index}. Свойство blob будет удалено.`);
                                        errorsOccurred.push({ storeName, error: `Ошибка конвертации Base64->Blob`, item: JSON.stringify(item)?.substring(0, 100) });
                                        delete item.blob;
                                    }
                                } else if (item && item.blob && !(item.blob instanceof Blob)) {
                                    console.warn(`[Импорт] Неожиданный формат blob у скриншота ID: ${item.id || index}. Ожидался {base64, type} или Blob. Свойство blob будет удалено.`);
                                    delete item.blob;
                                }
                                return item;
                            });
                            console.log(`[Импорт] Обработка скриншотов для конвертации завершена.`);
                        }

                        if (itemsToImport.length > 0) {
                            let store = null;
                            try {
                                store = transaction.objectStore(storeName);
                            } catch (storeError) {
                                console.error(`Ошибка доступа к хранилищу ${storeName} для добавления: ${storeError}`);
                                errorsOccurred.push({ storeName, error: `Ошибка доступа к ${storeName} для добавления: ${storeError.message}`, item: null });
                                continue;
                            }

                            const keyPath = store.keyPath;
                            const autoIncrement = store.autoIncrement;

                            for (const item of itemsToImport) {
                                if (typeof item !== 'object' || item === null) {
                                    console.warn(`Пропуск невалидного элемента (не объект или null) в ${storeName}:`, item);
                                    errorsOccurred.push({ storeName, error: 'Элемент не является объектом или null', item: JSON.stringify(item)?.substring(0, 100) });
                                    skippedPuts++; continue;
                                }
                                if (!autoIncrement && keyPath) {
                                    let hasKey = false;
                                    if (typeof keyPath === 'string') { hasKey = item.hasOwnProperty(keyPath) && item[keyPath] !== undefined && item[keyPath] !== null; }
                                    else if (Array.isArray(keyPath)) { hasKey = keyPath.every(kp => item.hasOwnProperty(kp) && item[kp] !== undefined && item[kp] !== null); }
                                    if (!hasKey) {
                                        console.warn(`Пропуск элемента в ${storeName} (нет ключа [${keyPath}] и не автоинкремент):`, JSON.stringify(item).substring(0, 100));
                                        errorsOccurred.push({ storeName, error: `Отсутствует ключ ${keyPath}`, item: JSON.stringify(item).substring(0, 100) });
                                        skippedPuts++; continue;
                                    }
                                }
                                if (keyPath && typeof keyPath === 'string' && Object.keys(item).length === 1 && item.hasOwnProperty(keyPath)) {
                                    console.warn(`Пропуск элемента в ${storeName} (содержит только ключ ${keyPath}):`, JSON.stringify(item).substring(0, 100));
                                    errorsOccurred.push({ storeName, error: 'Элемент содержит только ключ', item: JSON.stringify(item).substring(0, 100) });
                                    skippedPuts++; continue;
                                }
                                if (keyPath && Array.isArray(keyPath) && Object.keys(item).length === keyPath.length && keyPath.every(k => item.hasOwnProperty(k))) {
                                    console.warn(`Пропуск элемента в ${storeName} (содержит только ключи ${keyPath.join(', ')}):`, JSON.stringify(item).substring(0, 100));
                                    errorsOccurred.push({ storeName, error: `Элемент содержит только ключи ${keyPath.join(', ')}`, item: JSON.stringify(item).substring(0, 100) });
                                    skippedPuts++; continue;
                                }

                                putPromises.push(new Promise((resolveReq) => {
                                    try {
                                        const putRequest = store.put(item);
                                        totalPutsInitiated++;
                                        putRequest.onsuccess = () => resolveReq({ storeName, operation: 'put', success: true });
                                        putRequest.onerror = (e) => {
                                            const errorMsg = e.target.error?.message || 'Put request failed';
                                            console.error(`Ошибка записи элемента в ${storeName}:`, errorMsg, item);
                                            errorsOccurred.push({ storeName, error: `Ошибка записи: ${errorMsg}`, item: JSON.stringify(item)?.substring(0, 100) });
                                            resolveReq({ storeName, operation: 'put', success: false, error: e.target.error });
                                        };
                                    } catch (putError) {
                                        console.error(`Исключение при вызове put для ${storeName}:`, putError, item);
                                        errorsOccurred.push({ storeName, error: `Исключение при записи: ${putError.message}`, item: JSON.stringify(item)?.substring(0, 100) });
                                        resolveReq({ storeName, operation: 'put', success: false, error: putError });
                                    }
                                }));

                            }
                            console.log(`В ${storeName}: Подготовлено к записи: ${itemsToImport.length - skippedPuts}, Пропущено (из-за валидации): ${skippedPuts}.`);
                        } else {
                            console.log(`Нет элементов для импорта в ${storeName}.`);
                        }
                    }

                    console.log(`Всего инициировано put запросов: ${totalPutsInitiated}`);
                    await Promise.all(putPromises);
                    console.log("Все put операции завершены (или произошли ошибки).");

                    const putErrors = errorsOccurred.filter(e => e.operation === 'put' && !e.success);
                    if (putErrors.length > 0) {
                        console.error(`Обнаружено ${putErrors.length} ошибок при записи данных. Прерывание транзакции...`);
                        if (transaction.abort) {
                            transaction.abort();
                        } else {
                            reject(new Error("Ошибки при записи данных, импорт невозможен."));
                        }
                    }
                });

                if (importTransactionSuccessful) {
                    finalOutcomeSuccess = true;
                    console.log("Импорт данных в IndexedDB завершен успешно (транзакция). Обновление приложения...");
                    showNotification("Обновление интерфейса и данных...", "info");

                    try {
                        const dbReadyAfterImport = await appInit();
                        if (!dbReadyAfterImport) {
                            throw new Error("Не удалось переинициализировать приложение после импорта.");
                        }
                        console.log("Состояние приложения обновлено (appInit выполнен).");

                        if (storesToImport.includes('preferences') && importData.data.preferences?.find(p => p.id === 'uiSettings')) {
                            console.log("Попытка применить настройки UI после импорта...");
                            await loadUISettings();
                            console.log("Настройки UI применены после импорта.");
                        } else {
                            console.log("Настройки UI не импортировались или отсутствуют, применение пропущено.");
                        }

                        console.log("Перестроение поискового индекса после импорта...");
                        showNotification("Индексация данных для поиска...", "info");
                        await buildInitialSearchIndex();
                        console.log("Поисковый индекс перестроен.");

                        const nonFatalErrors = errorsOccurred.filter(e => !e.error.includes('Критическая ошибка транзакции') && !e.error.includes('Транзакция прервана') && !e.error.includes('Ошибка очистки') && !e.error.includes('Ошибка записи') && e.error !== 'Данные не являются массивом');
                        if (nonFatalErrors.length > 0) {
                            let errorSummary = nonFatalErrors.map(e =>
                                `  - ${e.storeName}: ${e.error}${e.item ? ` (Элемент: ${e.item})` : ''}`
                            ).join('\n');
                            if (errorSummary.length > 500) {
                                errorSummary = errorSummary.substring(0, 500) + '...\n(Полный список ошибок в консоли)';
                            }
                            showNotification(`Импорт завершен с предупреждениями/пропусками:\n${errorSummary}`, "warning", 15000);
                            console.warn("Предупреждения/ошибки/пропуски при импорте:", nonFatalErrors);
                        } else {
                            showNotification("Импорт данных успешно завершен. Приложение обновлено!", "success");
                        }

                    } catch (postImportError) {
                        console.error("Критическая ошибка во время обновления приложения после импорта:", postImportError);
                        showNotification(`Критическая ошибка после импорта: ${postImportError.message}. Пожалуйста, обновите страницу (F5).`, "error", 15000);
                        finalOutcomeSuccess = false;
                    }

                } else {
                    console.error("Импорт НЕ удался из-за ошибки транзакции.");
                    finalOutcomeSuccess = false;
                    const criticalErrors = errorsOccurred.filter(e => e.error.includes('Критическая ошибка транзакции') || e.error.includes('Транзакция прервана') || e.error.includes('Ошибка очистки') || e.error.includes('Ошибка записи'));
                    if (criticalErrors.length > 0) {
                        showNotification(`Импорт данных не удался: ${criticalErrors[0].error}. Данные не были изменены.`, "error", 10000);
                    } else {
                        showNotification("Импорт данных не удался по неизвестной причине.", "error", 10000);
                    }
                }

            } catch (outerError) {
                console.error("Импорт прерван из-за внешней ошибки:", outerError);
                showNotification(`Импорт остановлен из-за ошибки: ${outerError.message}. Данные могли не измениться.`, "error", 10000);
                finalOutcomeSuccess = false;
            }

            const importFileInput = document.getElementById('importFileInput');
            if (importFileInput) importFileInput.value = '';

            return finalOutcomeSuccess;
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
                id: 'main',
                title: "Главный алгоритм работы",
                steps: []
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
            lk1c: [
                {
                    id: "lk1c1",
                    title: "Алгоритм для 1СО ЛК 1",
                    description: "Описание для первого алгоритма 1СО ЛК",
                    steps: [
                        { title: "Шаг 1 ЛК", description: "Описание шага 1 ЛК" },
                        { title: "Шаг 2 ЛК", description: "Описание шага 2 ЛК" }
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


        function updateVisibleTabs() {
            const tabsNav = document.querySelector('nav.flex.flex-wrap');
            const moreTabsBtn = document.getElementById('moreTabsBtn');
            const moreTabsDropdown = document.getElementById('moreTabsDropdown');
            const moreTabsContainer = moreTabsBtn ? moreTabsBtn.parentNode : null;

            if (!tabsNav || !moreTabsBtn || !moreTabsDropdown || !moreTabsContainer || moreTabsContainer.nodeName === 'NAV') {
                console.warn("[updateVisibleTabs v5 Optimized] Aborted: Required DOM elements not found or invalid parent for moreTabsBtn.");
                if (moreTabsContainer && moreTabsContainer.nodeName === 'NAV') {
                    console.error("[updateVisibleTabs v5 Optimized] FATAL: moreTabsBtn's parent cannot be the NAV element itself. Check HTML structure.");
                }
                if (moreTabsContainer) moreTabsContainer.classList.add('hidden');
                return;
            }

            console.log("[updateVisibleTabs v5 Optimized] Starting...");
            const overflowingTabs = [];

            moreTabsDropdown.innerHTML = '';
            moreTabsContainer.classList.add('hidden');

            const allPotentialTabs = Array.from(tabsNav.querySelectorAll('.tab-btn:not(#moreTabsBtn)'));
            allPotentialTabs.forEach(tab => {
                tab.classList.remove('overflow-tab');
                tab.style.display = '';
            });

            const visibleTabs = allPotentialTabs.filter(tab => !tab.classList.contains('hidden'));

            if (!visibleTabs.length) {
                console.log("[updateVisibleTabs v5 Optimized] No visible tabs to process.");
                return;
            }
            console.log(`[updateVisibleTabs v5 Optimized] Found ${visibleTabs.length} visible tabs.`);

            const navWidth = tabsNav.offsetWidth;
            const tabWidths = visibleTabs.map(tab => tab.offsetWidth);

            let moreTabsWidth = 0;
            const wasMoreButtonHidden = moreTabsContainer.classList.contains('hidden');
            if (wasMoreButtonHidden) moreTabsContainer.classList.remove('hidden');
            moreTabsWidth = moreTabsContainer.offsetWidth;
            if (wasMoreButtonHidden) moreTabsContainer.classList.add('hidden');

            console.log(`[updateVisibleTabs v5 Optimized] navWidth: ${navWidth}, moreTabsWidth: ${moreTabsWidth}`);
            console.log(`[updateVisibleTabs v5 Optimized] Tab widths:`, tabWidths);

            let totalWidth = 0;
            let firstOverflowIndex = -1;

            for (let i = 0; i < visibleTabs.length; i++) {
                const currentTabWidth = tabWidths[i];
                if (currentTabWidth === 0) {
                    console.warn(`[updateVisibleTabs v5 Optimized] Tab ${visibleTabs[i].id || 'with no id'} has offsetWidth 0! Skipping.`);
                    continue;
                }

                const potentialWidthWithMore = totalWidth + currentTabWidth + (i < visibleTabs.length - 1 ? moreTabsWidth : 0);

                if (potentialWidthWithMore > navWidth) {
                    firstOverflowIndex = i;
                    console.log(`[updateVisibleTabs v5 Optimized] Overflow detected at index ${i} (tab id: ${visibleTabs[i].id}). Required: ${potentialWidthWithMore}, Available: ${navWidth}`);
                    break;
                } else {
                    totalWidth += currentTabWidth;
                }
            }

            if (firstOverflowIndex !== -1) {
                console.log(`[updateVisibleTabs v5 Optimized] Processing overflow starting from index ${firstOverflowIndex}.`);
                moreTabsContainer.classList.remove('hidden');
                const dropdownFragment = document.createDocumentFragment();

                for (let i = 0; i < visibleTabs.length; i++) {
                    const tab = visibleTabs[i];
                    if (i >= firstOverflowIndex) {
                        overflowingTabs.push(tab);
                        tab.classList.add('overflow-tab');
                        tab.style.display = 'none';

                        const dropdownItem = document.createElement('a');
                        dropdownItem.href = '#';
                        dropdownItem.className = 'block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 overflow-dropdown-item';
                        const icon = tab.querySelector('i');
                        const text = tab.textContent.trim();
                        dropdownItem.innerHTML = `${icon ? icon.outerHTML + ' ' : ''}${text}`;
                        dropdownItem.dataset.tabId = tab.id.replace('Tab', '');
                        dropdownItem.addEventListener('click', (e) => {
                            e.preventDefault();
                            if (typeof setActiveTab === 'function') {
                                setActiveTab(dropdownItem.dataset.tabId);
                            } else { console.warn('[updateVisibleTabs v5 Optimized] setActiveTab function not found.'); }
                            if (moreTabsDropdown) moreTabsDropdown.classList.add('hidden');
                        });
                        dropdownFragment.appendChild(dropdownItem);
                    } else {
                        tab.classList.remove('overflow-tab');
                        tab.style.display = '';
                    }
                }
                moreTabsDropdown.appendChild(dropdownFragment);

            } else {
                console.log("[updateVisibleTabs v5 Optimized] No overflow detected.");
                visibleTabs.forEach(tab => {
                    tab.classList.remove('overflow-tab');
                    tab.style.display = '';
                });
                moreTabsContainer.classList.add('hidden');
            }

            console.log("[updateVisibleTabs v5 Optimized] updateVisibleTabs finished.");
        }


        function setupTabsOverflow() {
            const tabsNav = document.querySelector('nav.flex.flex-wrap');
            if (!tabsNav) {
                console.warn("[setupTabsOverflow v10.1] Setup skipped: tabsNav not found.");
                return;
            }

            const initKey = 'tabsOverflowInitialized';
            if (tabsNav.dataset[initKey] === 'true') {
                console.log("[setupTabsOverflow v10.1] Already initialized. Skipping setup, calling updateVisibleTabs.");
                if (typeof updateVisibleTabs === 'function') {
                    updateVisibleTabs();
                }
                return;
            }

            const moreTabsBtn = document.getElementById('moreTabsBtn');
            const moreTabsDropdown = document.getElementById('moreTabsDropdown');

            if (!moreTabsBtn || !moreTabsDropdown) {
                console.warn("[setupTabsOverflow v10.1] Setup skipped: moreTabsBtn or moreTabsDropdown not found.");
                return;
            }
            const moreTabsContainer = moreTabsBtn.parentNode;
            if (!moreTabsContainer || moreTabsContainer === tabsNav || moreTabsContainer.nodeName === 'NAV' || !moreTabsContainer.classList.contains('relative')) {
                console.warn(`[setupTabsOverflow v10.1] Setup skipped: Invalid parent node for moreTabsBtn. Parent:`, moreTabsContainer);
                return;
            }
            console.log("[setupTabsOverflow v10.1] Performing INITIAL setup...");

            moreTabsBtn.removeEventListener('click', handleMoreTabsBtnClick, true);
            moreTabsBtn.addEventListener('click', handleMoreTabsBtnClick, true);
            console.log("[setupTabsOverflow v10.1] Attached CAPTURING handleMoreTabsBtnClick listener to moreTabsBtn.");

            document.removeEventListener('click', clickOutsideTabsHandler, true);
            document.addEventListener('click', clickOutsideTabsHandler, true);
            console.log("[setupTabsOverflow v10.1] Attached CAPTURING clickOutsideTabsHandler to document.");

            window.removeEventListener('resize', handleTabsResize);
            window.addEventListener('resize', handleTabsResize);
            console.log("[setupTabsOverflow v10.1] Added resize listener.");

            tabsNav.dataset[initKey] = 'true';
            console.log("[setupTabsOverflow v10.1] Initialized flag set on tabsNav.");

            console.log("[setupTabsOverflow v10.1] Initial call to updateVisibleTabs directly after setup.");
            if (typeof updateVisibleTabs === 'function') {
                updateVisibleTabs();
            } else {
                console.error("[setupTabsOverflow v10.1] ERROR: updateVisibleTabs function is not defined for initial call!");
            }
            console.log("[setupTabsOverflow v10.1] Initial setup finished.");
        }


        function handleMoreTabsBtnClick(e) {
            console.log(`%c[handleMoreTabsBtnClick v10.1] Обработчик вызван. Phase: ${e.eventPhase}. Target:`, "color: green; font-weight: bold;", e.target);

            e.stopPropagation();
            e.preventDefault();
            console.log("[handleMoreTabsBtnClick v10.1] stopPropagation() и preventDefault() вызваны.");

            const currentDropdown = document.getElementById('moreTabsDropdown');
            console.log("[handleMoreTabsBtnClick v10.1] Поиск #moreTabsDropdown:", currentDropdown ? 'Найден' : 'НЕ НАЙДЕН!');

            if (currentDropdown) {
                const isHiddenBefore = currentDropdown.classList.contains('hidden');
                console.log(`[handleMoreTabsBtnClick v10.1] Состояние дропдауна ПЕРЕД toggle: ${isHiddenBefore ? 'скрыт' : 'видим'}`);

                currentDropdown.classList.toggle('hidden');

                const isHiddenAfter = currentDropdown.classList.contains('hidden');
                console.log(`[handleMoreTabsBtnClick v10.1] Состояние дропдауна ПОСЛЕ toggle: ${isHiddenAfter ? 'скрыт' : 'видим'}`);

                if (isHiddenBefore === isHiddenAfter) {
                    console.error("[handleMoreTabsBtnClick v10.1] КРИТИЧЕСКАЯ ОШИБКА: classList.toggle('hidden') НЕ ИЗМЕНИЛ состояние!");
                }
            } else {
                console.error("[handleMoreTabsBtnClick v10.1] Не удалось найти #moreTabsDropdown. Переключение невозможно.");
                const allDropdowns = document.querySelectorAll('[id="moreTabsDropdown"]');
                console.log(`[handleMoreTabsBtnClick v10.1] Результат querySelectorAll('[id="moreTabsDropdown"]'):`, allDropdowns);
            }
        }


        function clickOutsideTabsHandler(e) {
            const currentDropdown = document.getElementById('moreTabsDropdown');
            const currentMoreBtn = document.getElementById('moreTabsBtn');
            if (currentDropdown && !currentDropdown.classList.contains('hidden')) {
                if (currentMoreBtn && !currentMoreBtn.contains(e.target) && !currentDropdown.contains(e.target)) {
                    console.log(`[DEBUG clickOutsideHandler v10.1] Hiding dropdown due to click outside. Target:`, e.target);
                    currentDropdown.classList.add('hidden');
                } else {
                    console.log(`[DEBUG clickOutsideHandler v10.1] Click detected, but target is inside button/dropdown. Target:`, e.target);
                }
            }
        }

        let tabsResizeTimeout;
        function handleTabsResize() {
            clearTimeout(tabsResizeTimeout);
            tabsResizeTimeout = setTimeout(() => {
                console.log("[setupTabsOverflow v10.1 - Resize] Resize triggered. Calling updateVisibleTabs.");
                if (typeof updateVisibleTabs === 'function') {
                    const currentDropdown = document.getElementById('moreTabsDropdown');
                    if (currentDropdown && !currentDropdown.classList.contains('hidden')) {
                        currentDropdown.classList.add('hidden');
                    }
                    updateVisibleTabs();
                } else {
                    console.error("[setupTabsOverflow v10.1 - Resize] ERROR: updateVisibleTabs function is not defined in resize handler!");
                }
            }, 150);
        }


        requestAnimationFrame(() => {
            console.log("[setupTabsOverflow v3] Initial call to updateVisibleTabs via requestAnimationFrame");
            updateVisibleTabs();
        });


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



        // СИСТЕМА РАБОТЫ С КОМПОНЕНТАМИ ИНТЕРФЕЙСА И АЛГОРИТМАМИ
        let currentSection = 'main';
        let currentAlgorithm = null;
        let editMode = false;
        let viewPreferences = {};
        let lightboxCloseButtonClickListener = null;
        let lightboxOverlayClickListener = null;

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
        saveAlgorithmBtn?.addEventListener('click', async (event) => {
            event.preventDefault();
            await saveAlgorithm();
        });
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        const editMainBtn = document.getElementById('editMainBtn');
        const addNewStepBtn = document.getElementById('addNewStepBtn');
        const saveNewAlgorithmBtn = document.getElementById('saveNewAlgorithmBtn');
        const cancelAddBtn = document.getElementById('cancelAddBtn');
        const addProgramAlgorithmBtn = document.getElementById('addProgramAlgorithmBtn');
        const addSkziAlgorithmBtn = document.getElementById('addSkziAlgorithmBtn');
        const addWebRegAlgorithmBtn = document.getElementById('addWebRegAlgorithmBtn');
        const addLk1cAlgorithmBtn = document.getElementById('addLk1cAlgorithmBtn');

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
        addNewStepBtn?.addEventListener('click', addNewStep);
        saveNewAlgorithmBtn?.addEventListener('click', saveNewAlgorithm);
        addProgramAlgorithmBtn?.addEventListener('click', () => showAddModal('program'));
        addSkziAlgorithmBtn?.addEventListener('click', () => showAddModal('skzi'));
        addLk1cAlgorithmBtn?.addEventListener('click', () => showAddModal('lk1c'));
        addWebRegAlgorithmBtn?.addEventListener('click', () => showAddModal('webReg'));

        editAlgorithmBtn?.addEventListener('click', async () => {
            const algorithmModal = document.getElementById('algorithmModal');
            const currentAlgorithmFromData = algorithmModal?.dataset.currentAlgorithmId;
            const currentSectionFromData = algorithmModal?.dataset.currentSection;

            if (!currentAlgorithmFromData || !currentSectionFromData) {
                console.error('[editAlgorithmBtn Click] Cannot edit: currentAlgorithmId или currentSection не установлены в data-атрибутах модального окна.');
                showNotification("Ошибка: Не удалось определить алгоритм для редактирования.", "error");
                return;
            }
            console.log(`[editAlgorithmBtn Click] Запрос на редактирование: ID=${currentAlgorithmFromData}, Section=${currentSectionFromData}`);

            if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
                algorithmModal.classList.add('hidden');
                console.log(`[editAlgorithmBtn Click] Окно деталей algorithmModal скрыто.`);
                document.body.classList.remove('modal-open');
                delete algorithmModal.dataset.currentAlgorithmId;
                delete algorithmModal.dataset.currentSection;
            } else {
                console.warn("[editAlgorithmBtn Click] Окно деталей algorithmModal не найдено или уже скрыто.");
            }

            try {
                if (typeof editAlgorithm === 'function') {
                    await editAlgorithm(currentAlgorithmFromData, currentSectionFromData);
                } else {
                    console.error("[editAlgorithmBtn Click] Функция editAlgorithm не найдена!");
                    throw new Error("Функция редактирования недоступна.");
                }
                console.log(`[editAlgorithmBtn Click] Окно редактирования для ${currentAlgorithmFromData} должно быть открыто.`);
            } catch (error) {
                console.error(`[editAlgorithmBtn Click] Ошибка при вызове editAlgorithm для ID=${currentAlgorithmFromData}:`, error);
                showNotification("Не удалось открыть окно редактирования.", "error");
            }
        });


        function initUI() {
            setActiveTab('main');
            renderMainAlgorithm();
            ['program', 'skzi', 'lk1c', 'webReg'].forEach(renderAlgorithmCards);
        }


        function setActiveTab(tabId) {
            const targetTabId = tabId + 'Tab';
            const targetContentId = tabId + 'Content';

            const allTabButtons = document.querySelectorAll('.tab-btn');
            const allTabContents = document.querySelectorAll('.tab-content');

            allTabButtons.forEach(button => {
                const isActive = button.id === targetTabId;
                if (isActive) {
                    button.classList.add('border-primary', 'text-primary');
                    button.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400', 'hover:border-gray-300', 'dark:hover:border-gray-600', 'hover:text-gray-700', 'dark:hover:text-gray-300');
                } else {
                    button.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400', 'hover:border-gray-300', 'dark:hover:border-gray-600', 'hover:text-gray-700', 'dark:hover:text-gray-300');
                    button.classList.remove('border-primary', 'text-primary');
                }
            });

            if (tabId === currentSection) {
                console.log(`[setActiveTab] Клик по уже активной вкладке: ${tabId}. Анимация не требуется.`);
                if (typeof setupTabsOverflow === 'function') {
                    setupTabsOverflow();
                }
                return;
            }

            console.log(`[setActiveTab] Переключение на новую вкладку: ${tabId}`);
            currentSection = tabId;

            let currentlyVisibleContent = null;

            allTabContents.forEach(content => {
                if (!content.classList.contains('hidden')) {
                    currentlyVisibleContent = content;
                    content.classList.add('fade-out');
                    content.classList.remove('fade-in');
                }
            });

            const targetContent = document.getElementById(targetContentId);

            const showNewContent = () => {
                if (targetContent) {
                    targetContent.classList.add('fade-out');
                    targetContent.classList.remove('hidden');

                    requestAnimationFrame(() => {
                        targetContent.classList.remove('fade-out');
                        targetContent.classList.add('fade-in');
                    });
                    console.log(`[setActiveTab] Content shown: ${targetContentId}`);
                } else {
                    console.warn(`[setActiveTab] Target content not found: ${targetContentId}`);
                }
            };

            if (currentlyVisibleContent) {
                const handler = (event) => {
                    if (event.target === currentlyVisibleContent && event.propertyName === 'opacity') {
                        currentlyVisibleContent.classList.add('hidden');
                        currentlyVisibleContent.classList.remove('fade-out');
                        currentlyVisibleContent.removeEventListener('transitionend', handler);
                        console.log(`[setActiveTab] Old content hidden: ${currentlyVisibleContent.id}`);
                        showNewContent();
                    }
                };
                currentlyVisibleContent.addEventListener('transitionend', handler);

                setTimeout(() => {
                    const stillVisibleContent = document.getElementById(currentlyVisibleContent.id);
                    if (stillVisibleContent && !stillVisibleContent.classList.contains('hidden') && stillVisibleContent.classList.contains('fade-out')) {
                        console.warn(`[setActiveTab] Transitionend fallback for hiding old content: ${currentlyVisibleContent.id}`);
                        stillVisibleContent.classList.add('hidden');
                        stillVisibleContent.classList.remove('fade-out');
                        stillVisibleContent.removeEventListener('transitionend', handler);
                        showNewContent();
                    }
                }, 20);

            } else {
                console.log("[setActiveTab] No previous content found, showing new content directly.");
                showNewContent();
            }

            if (typeof setupTabsOverflow === 'function') {
                setupTabsOverflow();
            } else {
                console.warn("[setActiveTab] setupTabsOverflow function not found.");
            }
        }


        async function renderAlgorithmCards(section) {
            const sectionAlgorithms = algorithms?.[section];

            if (!sectionAlgorithms || !Array.isArray(sectionAlgorithms)) {
                console.warn(`[renderAlgorithmCards v5 Исправленная] Не найдены валидные алгоритмы для секции: ${section}`);
                const container = document.getElementById(section + 'Algorithms');
                if (container) {
                    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full">Алгоритмы для этого раздела не найдены или не загружены.</p>';
                    if (typeof applyCurrentView === 'function') {
                        applyCurrentView(section + 'Algorithms');
                    } else {
                        console.warn("[renderAlgorithmCards v5 Исправленная] Функция applyCurrentView не определена при рендеринге пустого контейнера.");
                        if (typeof applyView === 'function') {
                            applyView(container, container.dataset.defaultView || 'cards');
                        } else {
                            console.error("[renderAlgorithmCards v5 Исправленная] Функции applyCurrentView и applyView не найдены.");
                        }
                    }
                }
                return;
            }

            const container = document.getElementById(section + 'Algorithms');
            if (!container) {
                console.error(`[renderAlgorithmCards v5 Исправленная] Контейнер #${section}Algorithms не найден.`);
                return;
            }

            container.innerHTML = '';

            if (sectionAlgorithms.length === 0) {
                container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center col-span-full">В разделе "${getSectionName(section)}" пока нет алгоритмов.</p>`;
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView(section + 'Algorithms');
                } else {
                    console.warn("[renderAlgorithmCards v5 Исправленная] Функция applyCurrentView не определена при рендеринге сообщения об отсутствии алгоритмов.");
                    if (typeof applyView === 'function') {
                        applyView(container, container.dataset.defaultView || 'cards');
                    } else {
                        console.error("[renderAlgorithmCards v5 Исправленная] Функции applyCurrentView и applyView не найдены.");
                    }
                }
                return;
            }

            const fragment = document.createDocumentFragment();
            const safeEscapeHtml = typeof escapeHtml === 'function' ? escapeHtml : (text) => {
                if (typeof text !== 'string') return '';
                return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "").replace(/'/g, "'");
            };

            sectionAlgorithms.forEach(algorithm => {
                if (!algorithm || typeof algorithm !== 'object' || !algorithm.id) {
                    console.warn(`[renderAlgorithmCards v5 Исправленная] Пропуск невалидного объекта алгоритма в секции ${section}:`, algorithm);
                    return;
                }

                const card = document.createElement('div');
                card.className = 'algorithm-card view-item transition cursor-pointer';
                card.dataset.id = algorithm.id;

                const titleText = algorithm.title || 'Без заголовка';
                const descriptionText = algorithm.description || 'Нет описания';

                card.innerHTML = `
            <div class="flex-grow min-w-0">
                <h3 class="font-bold" title="${safeEscapeHtml(titleText)}">${safeEscapeHtml(titleText)}</h3>
                <p class="text-gray-600 dark:text-gray-400 text-sm mt-1"
                   title="${safeEscapeHtml(descriptionText)}">
                   ${safeEscapeHtml(descriptionText)}
                </p>
            </div>
        `;

                card.addEventListener('click', () => {
                    if (typeof showAlgorithmDetail === 'function') {
                        showAlgorithmDetail(algorithm, section);
                    } else {
                        console.error("[renderAlgorithmCards v5 Исправленная] Функция showAlgorithmDetail не определена при клике на карточку.");
                        if (typeof showNotification === 'function') {
                            showNotification("Ошибка: Невозможно открыть детали алгоритма.", "error");
                        }
                    }
                });
                fragment.appendChild(card);
            });

            container.appendChild(fragment);

            if (typeof applyCurrentView === 'function') {
                applyCurrentView(section + 'Algorithms');
                console.log(`[renderAlgorithmCards v5 Исправленная] Вызвана applyCurrentView для ${section}Algorithms`);
            } else {
                console.warn("[renderAlgorithmCards v5 Исправленная] Функция applyCurrentView не найдена. Стили вида могут быть некорректны.");
                if (typeof applyView === 'function') {
                    applyView(container, container.dataset.defaultView || 'cards');
                } else {
                    console.error("[renderAlgorithmCards v5 Исправленная] Fallback невозможен: функции applyCurrentView и applyView не найдены.");
                }
            }
            console.log(`[renderAlgorithmCards v5 Исправленная] Рендеринг для секции ${section} завершен.`);
        }


        async function renderMainAlgorithm() {
            console.log('[renderMainAlgorithm v5 async] Вызвана (скриншоты для main отключены).');
            const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
            if (!mainAlgorithmContainer) {
                console.error("[renderMainAlgorithm v5 async] Контейнер #mainAlgorithm не найден.");
                return;
            }

            mainAlgorithmContainer.innerHTML = '';

            if (!algorithms || typeof algorithms !== 'object' || !algorithms.main || typeof algorithms.main !== 'object' || !Array.isArray(algorithms.main.steps)) {
                console.error("[renderMainAlgorithm v5 async] Данные главного алгоритма (algorithms.main.steps) отсутствуют или невалидны:", algorithms?.main);
                const errorP = document.createElement('p');
                errorP.className = 'text-red-500 dark:text-red-400 p-4 text-center font-medium';
                errorP.textContent = 'Ошибка: Не удалось загрузить шаги главного алгоритма. Данные повреждены или отсутствуют.';
                mainAlgorithmContainer.appendChild(errorP);
                const mainTitleElement = document.querySelector('#mainContent h2');
                if (mainTitleElement) mainTitleElement.textContent = "Главный алгоритм работы";
                return;
            }

            const mainSteps = algorithms.main.steps;
            const fragment = document.createDocumentFragment();

            mainSteps.forEach((step, index) => {
                if (!step || typeof step !== 'object') {
                    console.warn("[renderMainAlgorithm v5 async] Пропуск невалидного объекта шага:", step);
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'algorithm-step bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 mb-3 rounded-lg shadow-sm text-red-700 dark:text-red-300';
                    errorDiv.textContent = `Ошибка: Некорректные данные для шага ${index + 1}.`;
                    fragment.appendChild(errorDiv);
                    return;
                }

                const stepDiv = document.createElement('div');
                stepDiv.className = 'algorithm-step bg-gray-100 dark:bg-gray-700 p-3 rounded-lg shadow-sm mb-3 relative';

                const titleH3 = document.createElement('h3');
                titleH3.className = 'font-bold text-base mb-1 text-gray-900 dark:text-gray-100';
                titleH3.textContent = step.title || 'Без заголовка';
                stepDiv.appendChild(titleH3);


                const descriptionP = document.createElement('p');
                descriptionP.className = 'text-sm text-gray-700 dark:text-gray-300 mt-1 break-words';
                descriptionP.innerHTML = linkify(step.description || 'Нет описания');
                stepDiv.appendChild(descriptionP);

                if (step.example) {
                    const exampleContainer = document.createElement('div');
                    exampleContainer.className = 'example-container mt-2 text-sm text-gray-600 dark:text-gray-400 break-words';
                    const exampleLabel = document.createElement('strong');
                    exampleLabel.className = 'block mb-1';
                    exampleContainer.appendChild(exampleLabel);

                    if (typeof step.example === 'object' && step.example.type === 'list' && Array.isArray(step.example.items)) {
                        exampleLabel.textContent = step.example.intro ? '' : 'Пример (список):';
                        if (step.example.intro) {
                            const introP = document.createElement('p');
                            introP.className = 'italic mb-1';
                            introP.innerHTML = linkify(step.example.intro);
                            exampleContainer.appendChild(introP);
                        }
                        const ul = document.createElement('ul');
                        ul.className = 'list-disc list-inside pl-5 space-y-0.5';
                        step.example.items.forEach(item => {
                            const li = document.createElement('li');
                            li.innerHTML = linkify(String(item));
                            ul.appendChild(li);
                        });
                        exampleContainer.appendChild(ul);
                    } else if (typeof step.example === 'string') {
                        exampleLabel.textContent = 'Пример:';
                        const exampleP = document.createElement('p');
                        exampleP.innerHTML = linkify(step.example);
                        exampleContainer.appendChild(exampleP);
                    } else {
                        exampleLabel.textContent = 'Пример (данные):';
                        try {
                            const pre = document.createElement('pre');
                            pre.className = 'text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded mt-1 overflow-x-auto font-mono whitespace-pre-wrap';
                            const code = document.createElement('code');
                            code.textContent = JSON.stringify(step.example, null, 2);
                            pre.appendChild(code);
                            exampleContainer.appendChild(pre);
                        } catch (e) {
                            console.warn("[renderMainAlgorithm v5 async] Не удалось сериализовать 'example' для шага:", step, e);
                            const errorP = document.createElement('p');
                            errorP.className = 'text-xs text-red-500 mt-1';
                            errorP.textContent = '[Неподдерживаемый формат примера]';
                            exampleContainer.appendChild(errorP);
                        }
                    }
                    stepDiv.appendChild(exampleContainer);
                }

                if (step.type === 'inn_step') {
                    const innP = document.createElement('p');
                    innP.className = 'text-sm text-gray-500 dark:text-gray-400 mt-3';
                    const innLink = document.createElement('a');
                    innLink.href = '#';
                    innLink.id = `noInnLink_${index}`;
                    innLink.className = 'text-primary hover:underline';
                    innLink.textContent = 'Что делать, если клиент не может назвать ИНН?';
                    innLink.removeEventListener('click', handleNoInnLinkClick);
                    innLink.addEventListener('click', handleNoInnLinkClick);
                    innP.appendChild(innLink);
                    stepDiv.appendChild(innP);
                }

                fragment.appendChild(stepDiv);
            });

            mainAlgorithmContainer.appendChild(fragment);
            console.log(`[renderMainAlgorithm v5 async] Рендеринг ${mainSteps.length} шагов завершен (скриншоты отключены).`);
        }


        function handleNoInnLinkClick(event) {
            event.preventDefault();
            if (typeof showNoInnModal === 'function') {
                showNoInnModal();
            } else {
                console.error("Функция showNoInnModal не определена");
                alert("Функция для отображения информации не найдена.");
            }
        }


        async function getAllFromIndex(storeName, indexName, indexValue) {
            if (!db) {
                console.error(`getAllFromIndex: База данных (db) не инициализирована ПЕРЕД транзакцией! Store: ${storeName}, Index: ${indexName}`);
                return initDB().then(reopenedDb => {
                    if (!reopenedDb) {
                        console.error("getAllFromIndex: Не удалось восстановить соединение с БД.");
                        return Promise.reject(new Error("Не удалось восстановить соединение с БД"));
                    }
                    db = reopenedDb;
                    console.log("getAllFromIndex: Соединение с БД восстановлено, повторная попытка вызова...");
                    return getAllFromIndex(storeName, indexName, indexValue);
                }).catch(err => {
                    console.error("getAllFromIndex: Ошибка при попытке восстановления БД:", err);
                    return Promise.reject(new Error("Ошибка при попытке восстановления БД"));
                });
            }

            if (!storeName || !indexName || indexValue === undefined || indexValue === null) {
                const errorMsg = `getAllFromIndex: Некорректные аргументы: storeName=${storeName}, indexName=${indexName}, indexValue=${indexValue}`;
                console.error(errorMsg);
                return Promise.reject(new Error("Некорректные аргументы для getAllFromIndex"));
            }

            return new Promise((resolve, reject) => {
                if (!db) {
                    console.error(`getAllFromIndex: База данных (db) все еще не инициализирована ВНУТРИ промиса! Store: ${storeName}`);
                    return reject(new Error("База данных не инициализирована (проверка внутри промиса)"));
                }
                try {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const errorMsg = `getAllFromIndex: Хранилище объектов '${storeName}' не найдено в базе данных.`;
                        console.error(errorMsg);
                        return reject(new Error(errorMsg));
                    }

                    const transaction = db.transaction(storeName, "readonly");
                    const store = transaction.objectStore(storeName);

                    if (!store.indexNames.contains(indexName)) {
                        const errorMsg = `Индекс '${indexName}' не найден в хранилище '${storeName}'. Доступные индексы: ${Array.from(store.indexNames).join(', ')}`;
                        console.error(`getAllFromIndex: ${errorMsg}`);
                        transaction.abort();
                        return reject(new Error(errorMsg));
                    }

                    console.log(`getAllFromIndex: Индекс '${indexName}' найден в '${storeName}'. Запрашиваем значение:`, indexValue, `(Тип: ${typeof indexValue})`);

                    const index = store.index(indexName);
                    const request = index.getAll(indexValue);

                    request.onsuccess = e => {
                        const result = e.target.result;
                        const resultLength = result?.length ?? 0;
                        console.log(`getAllFromIndex: Успешно получен результат для ${storeName}/${indexName} по значению ${indexValue}. Количество записей: ${resultLength}.`);
                        if (resultLength === 0) {
                            console.warn(`getAllFromIndex: Результат пуст. Проверьте, существуют ли записи с ${indexName}=${indexValue} в хранилище ${storeName}. Возможные причины: данные не были сохранены, были удалены или сохранены с другим ключом.`);
                        }
                        resolve(result || []);
                    };
                    request.onerror = e => {
                        const errorMsg = `Ошибка получения данных из индекса '${indexName}' по значению '${indexValue}' в хранилище '${storeName}'`;
                        console.error(`${errorMsg}:`, e.target.error);
                        reject(e.target.error || new Error(errorMsg));
                    };

                    transaction.onerror = e => {
                        const errorMsg = `Ошибка readonly транзакции при запросе к ${storeName}/${indexName} по значению '${indexValue}'`;
                        console.error(`${errorMsg}:`, e.target.error);
                        reject(e.target.error || new Error(errorMsg));
                    };
                    transaction.onabort = e => {
                        const errorMsg = `Readonly транзакция прервана при запросе к ${storeName}/${indexName} по значению '${indexValue}'`;
                        console.warn(`${errorMsg}:`, e.target.error);
                        reject(e.target.error || new Error("Транзакция прервана"));
                    };

                } catch (error) {
                    const errorMsg = `Исключение при попытке доступа к индексу '${indexName}' в хранилище '${storeName}'`;
                    console.error(`${errorMsg}:`, error);
                    reject(error);
                }
            });
        }

        async function showScreenshotViewerModal(screenshots, algorithmId, algorithmTitle) {
            const modalId = 'screenshotViewerModal';
            let modal = document.getElementById(modalId);
            let isNewModal = false;
            let modalState = {};

            const cleanupModalState = (state) => {
                console.log(`[Cleanup for ${modalId}] Cleaning up state and listeners.`);
                if (state.escapeHandler) {
                    document.removeEventListener('keydown', state.escapeHandler);
                    console.log(`[Cleanup ${modalId}] Removed escape handler.`);
                }
                if (state.gridBtnClickHandler) {
                    state.gridBtn?.removeEventListener('click', state.gridBtnClickHandler);
                    console.log(`[Cleanup ${modalId}] Removed gridBtn handler.`);
                }
                if (state.listBtnClickHandler) {
                    state.listBtn?.removeEventListener('click', state.listBtnClickHandler);
                    console.log(`[Cleanup ${modalId}] Removed listBtn handler.`);
                }
                if (state.closeButtonXClickHandler) {
                    state.closeButtonX?.removeEventListener('click', state.closeButtonXClickHandler);
                    console.log(`[Cleanup ${modalId}] Removed closeButtonX handler.`);
                }
                if (state.closeButtonCancelClickHandler) {
                    state.closeButtonCancel?.removeEventListener('click', state.closeButtonCancelClickHandler);
                    console.log(`[Cleanup ${modalId}] Removed closeButtonCancel handler.`);
                }
                if (state.overlayClickHandler) {
                    state.overlayElement?.removeEventListener('click', state.overlayClickHandler);
                    console.log(`[Cleanup ${modalId}] Removed overlay handler.`);
                }

                const images = state.contentArea?.querySelectorAll('img[data-object-url]');
                images?.forEach(img => {
                    if (img.dataset.objectUrl) {
                        console.log(`[Cleanup ${modalId}] Revoking Object URL:`, img.dataset.objectUrl);
                        try { URL.revokeObjectURL(img.dataset.objectUrl); } catch (revokeError) { console.warn(`Error revoking URL ${img.dataset.objectUrl}:`, revokeError); }
                        delete img.dataset.objectUrl;
                    }
                });

                Object.keys(state).forEach(key => delete state[key]);
            };

            const closeModal = () => {
                const currentModal = document.getElementById(modalId);
                if (currentModal && !currentModal.classList.contains('hidden')) {
                    console.log(`[showScreenshotViewerModal] Closing modal #${modalId}`);
                    currentModal.classList.add('hidden');
                    document.body.classList.remove('overflow-hidden');

                    const state = currentModal._modalState || {};
                    cleanupModalState(state);
                    delete currentModal._modalState;

                    const contentAreaForClearOnClose = currentModal.querySelector('#screenshotContentArea');
                    if (contentAreaForClearOnClose) {
                        contentAreaForClearOnClose.innerHTML = '';
                        console.log(`[showScreenshotViewerModal] Content area cleared on close for #${modalId}.`);
                    }

                } else {
                    console.log(`[showScreenshotViewerModal] Attempt to close already closed or non-existent modal #${modalId}`);
                }
            };

            if (modal && modal._modalState) {
                console.log(`[showScreenshotViewerModal] Reusing modal #${modalId}. Cleaning up previous state...`);
                cleanupModalState(modal._modalState);
                const contentAreaForClear = modal.querySelector('#screenshotContentArea');
                if (contentAreaForClear) contentAreaForClear.innerHTML = '';
            }

            if (!modal) {
                isNewModal = true;
                console.log(`[showScreenshotViewerModal] Creating new modal #${modalId}`);
                modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'fixed inset-0 bg-black bg-opacity-75 hidden z-[80] p-4 flex items-center justify-center';

                modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-center">
                        <h2 id="screenshotViewerTitle" class="text-xl font-bold text-gray-900 dark:text-gray-100 truncate pr-4">Скриншоты</h2>
                        <div class="flex items-center flex-shrink-0">
                             <div class="mr-4 hidden sm:inline-flex rounded-md shadow-sm" role="group">
                                 <button type="button" id="screenshotViewToggleGrid" class="px-3 py-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-l-lg hover:bg-gray-100 hover:text-primary focus:z-10 focus:ring-2 focus:ring-primary focus:text-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-primary dark:focus:text-white" title="Вид сеткой">
                                     <i class="fas fa-th-large"></i>
                                 </button>
                                 <button type="button" id="screenshotViewToggleList" class="px-3 py-1.5 text-sm font-medium text-gray-900 bg-white border-t border-b border-r border-gray-200 rounded-r-lg hover:bg-gray-100 hover:text-primary focus:z-10 focus:ring-2 focus:ring-primary focus:text-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-primary dark:focus:text-white" title="Вид списком">
                                     <i class="fas fa-list"></i>
                                 </button>
                             </div>
                            <button type="button" id="screenshotViewerCloseXBtn" class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Закрыть (Esc)">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div id="screenshotContentArea" class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-700">
                    <p class="text-center text-gray-500 dark:text-gray-400 p-6">Загрузка скриншотов...</p>
                </div>
                <div class="flex-shrink-0 px-6 py-4 bg-gray-100 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end">
                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition text-sm font-medium">
                        Закрыть
                    </button>
                </div>
            </div>
        `;
                document.body.appendChild(modal);
            }

            modalState = {};
            modal._modalState = modalState;

            modalState.titleEl = modal.querySelector('#screenshotViewerTitle');
            modalState.contentArea = modal.querySelector('#screenshotContentArea');
            modalState.gridBtn = modal.querySelector('#screenshotViewToggleGrid');
            modalState.listBtn = modal.querySelector('#screenshotViewToggleList');
            modalState.closeButtonX = modal.querySelector('#screenshotViewerCloseXBtn');
            modalState.closeButtonCancel = modal.querySelector('.cancel-modal');
            modalState.overlayElement = modal;

            if (!modalState.titleEl || !modalState.contentArea || !modalState.gridBtn || !modalState.listBtn || !modalState.closeButtonX || !modalState.closeButtonCancel) {
                console.error("[showScreenshotViewerModal] CRITICAL ERROR: Not all required inner elements found! Check IDs/classes in modal.innerHTML.", {
                    title: !!modalState.titleEl,
                    content: !!modalState.contentArea,
                    gridBtn: !!modalState.gridBtn,
                    listBtn: !!modalState.listBtn,
                    closeX: !!modalState.closeButtonX,
                    closeCancel: !!modalState.closeButtonCancel
                });
                showNotification("Критическая ошибка интерфейса окна просмотра скриншотов.", "error");
                if (modal && !modal.classList.contains('hidden')) { modal.classList.add('hidden'); }
                if (modal._modalState) delete modal._modalState;
                return;
            }
            console.log("[showScreenshotViewerModal] All required inner elements found successfully.");

            modalState.closeButtonXClickHandler = closeModal;
            modalState.closeButtonCancelClickHandler = closeModal;
            modalState.overlayClickHandler = (e) => { if (e.target === modalState.overlayElement) { closeModal(); } };
            modalState.escapeHandler = (event) => { if (event.key === 'Escape') { closeModal(); } };

            if (!isNewModal) {
                modalState.closeButtonX?.removeEventListener('click', modalState.closeButtonXClickHandler);
                modalState.closeButtonCancel?.removeEventListener('click', modalState.closeButtonCancelClickHandler);
                modalState.overlayElement?.removeEventListener('click', modalState.overlayClickHandler);
                document.removeEventListener('keydown', modalState.escapeHandler);
            }

            modalState.closeButtonX.addEventListener('click', modalState.closeButtonXClickHandler);
            modalState.closeButtonCancel.addEventListener('click', modalState.closeButtonCancelClickHandler);
            modalState.overlayElement.addEventListener('click', modalState.overlayClickHandler);
            document.addEventListener('keydown', modalState.escapeHandler);
            console.log(`[showScreenshotViewerModal] Attached event handlers for #${modalId}.`);

            const defaultTitle = `Скриншоты для ${algorithmId}`;
            modalState.titleEl.textContent = `${algorithmTitle || defaultTitle}`;
            modalState.titleEl.title = modalState.titleEl.textContent;
            modalState.contentArea.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 p-6">Загрузка...</p>';
            document.body.classList.add('overflow-hidden');
            modal.classList.remove('hidden');

            let currentView = 'grid';

            const updateViewButtons = () => {
                if (!modalState.gridBtn || !modalState.listBtn) return;
                const isGrid = currentView === 'grid';
                modalState.gridBtn.classList.toggle('bg-primary', isGrid);
                modalState.gridBtn.classList.toggle('text-white', isGrid);
                modalState.gridBtn.classList.toggle('bg-white', !isGrid);
                modalState.gridBtn.classList.toggle('dark:bg-gray-700', !isGrid);
                modalState.gridBtn.classList.toggle('text-gray-900', !isGrid);
                modalState.gridBtn.classList.toggle('dark:text-white', !isGrid);

                modalState.listBtn.classList.toggle('bg-primary', !isGrid);
                modalState.listBtn.classList.toggle('text-white', !isGrid);
                modalState.listBtn.classList.toggle('bg-white', isGrid);
                modalState.listBtn.classList.toggle('dark:bg-gray-700', isGrid);
                modalState.listBtn.classList.toggle('text-gray-900', isGrid);
                modalState.listBtn.classList.toggle('dark:text-white', isGrid);
            };

            const renderContent = () => {
                console.log(`[renderContent for ${modalId}] Rendering for view: ${currentView}`);
                if (!modalState.contentArea) {
                    console.error(`[renderContent for ${modalId}] Ошибка: contentArea не найден в modalState!`);
                    return;
                }

                const existingImages = modalState.contentArea.querySelectorAll('img[data-object-url]');
                existingImages.forEach(img => {
                    if (img.dataset.objectUrl) {
                        console.log(`[renderContent for ${modalId}] Revoking Object URL before re-render:`, img.dataset.objectUrl);
                        try { URL.revokeObjectURL(img.dataset.objectUrl); } catch (e) { console.warn("Error revoking URL in renderContent", e); }
                        delete img.dataset.objectUrl;
                    }
                });
                modalState.contentArea.innerHTML = '';

                if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
                    modalState.contentArea.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 p-6">Нет скриншотов для отображения.</p>';
                    return;
                }
                const sortedScreenshots = [...screenshots].sort((a, b) => (a.id || 0) - (b.id || 0));

                const openLightboxHandler = (blobs, index) => {
                    if (typeof openLightbox === 'function') {
                        openLightbox(blobs, index);
                    } else {
                        console.error("Функция openLightbox не найдена!");
                        showNotification("Ошибка: Функция просмотра изображений (лайтбокс) недоступна.", "error");
                    }
                };

                if (currentView === 'grid') {
                    if (typeof renderScreenshotThumbnails === 'function') {
                        renderScreenshotThumbnails(modalState.contentArea, sortedScreenshots, openLightboxHandler, modalState);
                    }
                    else {
                        modalState.contentArea.innerHTML = '<p class="text-center text-red-500 dark:text-red-400 p-6">Ошибка: Функция отображения миниатюр недоступна.</p>';
                        console.error("Функция renderScreenshotThumbnails не найдена!");
                    }
                } else {
                    if (typeof renderScreenshotList === 'function') {
                        renderScreenshotList(modalState.contentArea, sortedScreenshots, openLightboxHandler, null, modalState);
                    }
                    else {
                        modalState.contentArea.innerHTML = '<p class="text-center text-red-500 dark:text-red-400 p-6">Ошибка: Функция отображения списка недоступна.</p>';
                        console.error("Функция renderScreenshotList не найдена!");
                    }
                }
            };

            if (!isNewModal && modalState.gridBtn) {
                modalState.gridBtn.onclick = null;
            }
            if (!isNewModal && modalState.listBtn) {
                modalState.listBtn.onclick = null;
            }

            modalState.gridBtnClickHandler = () => { if (currentView !== 'grid') { currentView = 'grid'; updateViewButtons(); renderContent(); } };
            modalState.listBtnClickHandler = () => { if (currentView !== 'list') { currentView = 'list'; updateViewButtons(); renderContent(); } };

            modalState.gridBtn.addEventListener('click', modalState.gridBtnClickHandler);
            modalState.listBtn.addEventListener('click', modalState.listBtnClickHandler);
            console.log(`[showScreenshotViewerModal] Attached view toggle handlers for #${modalId}.`);

            updateViewButtons();
            renderContent();
        }


        function renderScreenshotThumbnails(container, screenshots, onOpenLightbox, modalState = null) {
            if (!container) {
                console.error("[renderScreenshotThumbnails] Контейнер не предоставлен.");
                return [];
            }
            if (!Array.isArray(screenshots)) {
                console.error("[renderScreenshotThumbnails] 'screenshots' должен быть массивом.");
                return [];
            }
            if (typeof onOpenLightbox !== 'function') {
                console.error("[renderScreenshotThumbnails] 'onOpenLightbox' должен быть функцией.");
            }

            const createdObjectUrls = [];

            const existingImagesThumbs = container.querySelectorAll('img[data-object-url]');
            existingImagesThumbs.forEach(img => {
                if (img.dataset.objectUrl) {
                    console.log("[renderScreenshotThumbnails] Освобождаем существующий Объектный URL перед рендерингом:", img.dataset.objectUrl);
                    try {
                        URL.revokeObjectURL(img.dataset.objectUrl);
                    } catch (e) {
                        console.warn("Ошибка освобождения URL в renderScreenshotThumbnails (pre-render cleanup)", e);
                    }
                    delete img.dataset.objectUrl;
                }
            });

            container.innerHTML = '';
            container.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4";

            const fragment = document.createDocumentFragment();
            const allBlobs = screenshots.map(s => s?.blob).filter(blob => blob instanceof Blob);

            screenshots.forEach((screenshot, index) => {
                if (!screenshot || !(screenshot.blob instanceof Blob) || typeof screenshot.id === 'undefined') {
                    console.warn(`[renderScreenshotThumbnails] Пропуск невалидного элемента скриншота на индексе ${index}:`, screenshot);
                    return;
                }

                const item = document.createElement('div');
                item.className = 'group relative aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow hover:shadow-md transition cursor-pointer border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900';
                item.tabIndex = 0;
                item.title = `Скриншот ${screenshot.id || index + 1}`;

                const img = document.createElement('img');
                img.className = 'w-full h-full object-contain';
                img.alt = `Миниатюра скриншота ${screenshot.id || index + 1}`;
                img.loading = 'lazy';

                let objectURL = null;
                try {
                    objectURL = URL.createObjectURL(screenshot.blob);
                    createdObjectUrls.push(objectURL);
                    img.dataset.objectUrl = objectURL;
                    img.src = objectURL;

                    img.onload = () => {
                        console.log(`Миниатюра ${screenshot.id} загружена.`);
                    };

                    img.onerror = () => {
                        console.error(`Ошибка загрузки миниатюры ${screenshot.id}`);
                        if (img.dataset.objectUrl) {
                            try {
                                URL.revokeObjectURL(img.dataset.objectUrl);
                                console.log(`[renderScreenshotThumbnails] Освобожден URL из-за ошибки загрузки: ${img.dataset.objectUrl}`);
                                const urlIndex = createdObjectUrls.indexOf(img.dataset.objectUrl);
                                if (urlIndex > -1) {
                                    createdObjectUrls.splice(urlIndex, 1);
                                }
                            } catch (e) {
                                console.warn("Ошибка освобождения URL при onerror:", e);
                            }
                            delete img.dataset.objectUrl;
                        }
                        item.innerHTML = `<div class="flex items-center justify-center w-full h-full text-center text-red-500 text-xs p-1">Ошибка<br>загрузки</div>`;
                        item.classList.add('bg-red-100', 'border-red-500');
                        if (item._clickHandler) item.removeEventListener('click', item._clickHandler);
                        if (item._keydownHandler) item.removeEventListener('keydown', item._keydownHandler);
                        item._clickHandler = null;
                        item._keydownHandler = null;
                    };
                } catch (e) {
                    console.error(`Ошибка создания Object URL для скриншота ${screenshot.id}:`, e);
                    item.innerHTML = `<div class="flex items-center justify-center w-full h-full text-center text-red-500 text-xs p-1">Ошибка<br>создания URL</div>`;
                    item.classList.add('bg-red-100', 'border-red-500');
                }

                const caption = document.createElement('div');
                caption.className = 'absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate hidden group-hover:block';
                caption.textContent = `ID: ${screenshot.id}`;

                if (objectURL && !item.querySelector('div.text-red-500')) {
                    item.appendChild(img);
                    item.appendChild(caption);

                    const currentBlobIndex = allBlobs.findIndex(b => b === screenshot.blob);

                    if (item._clickHandler) item.removeEventListener('click', item._clickHandler);
                    item._clickHandler = () => {
                        if (typeof onOpenLightbox === 'function') {
                            if (currentBlobIndex !== -1) {
                                onOpenLightbox(allBlobs, currentBlobIndex);
                            } else {
                                console.error(`[renderScreenshotThumbnails] Не удалось найти Blob в массиве 'allBlobs' для скриншота ${screenshot.id}. Лайтбокс не будет открыт.`);
                            }
                        } else {
                            console.warn("[renderScreenshotThumbnails] Функция 'onOpenLightbox' не предоставлена или не является функцией.");
                        }
                    };
                    item.addEventListener('click', item._clickHandler);

                    if (item._keydownHandler) item.removeEventListener('keydown', item._keydownHandler);
                    item._keydownHandler = (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (typeof onOpenLightbox === 'function') {
                                if (currentBlobIndex !== -1) {
                                    onOpenLightbox(allBlobs, currentBlobIndex);
                                } else {
                                    console.error(`[renderScreenshotThumbnails] Не удалось найти Blob в массиве 'allBlobs' для скриншота ${screenshot.id} при нажатии клавиши. Лайтбокс не будет открыт.`);
                                }
                            } else {
                                console.warn("[renderScreenshotThumbnails] Функция 'onOpenLightbox' не предоставлена или не является функцией.");
                            }
                        }
                    };
                    item.addEventListener('keydown', item._keydownHandler);
                }

                fragment.appendChild(item);
            });

            container.appendChild(fragment);

            console.log(`[renderScreenshotThumbnails] Рендеринг миниатюр завершен. Добавлено: ${fragment.childElementCount} элементов. Создано URL: ${createdObjectUrls.length}`);
        }


        function renderScreenshotList(container, screenshots, onOpenLightbox, onItemClick = null, modalState = null) {
            if (!container) {
                console.error("[renderScreenshotList] Контейнер не предоставлен.");
                return;
            }
            if (!Array.isArray(screenshots)) {
                console.error("[renderScreenshotList] 'screenshots' должен быть массивом.");
                container.innerHTML = '<div class="p-4 text-red-600 dark:text-red-400">Ошибка: Данные скриншотов не являются массивом.</div>';
                return;
            }
            if (typeof onOpenLightbox !== 'function') {
                console.error("[renderScreenshotList] 'onOpenLightbox' должен быть функцией.");
            }

            container.innerHTML = '';
            container.className = "flex flex-col space-y-1 p-4";
            console.log(`[renderScreenshotList] Начало рендеринга. Передано скриншотов: ${screenshots.length}.`);

            if (screenshots.length === 0) {
                container.innerHTML = '<div class="p-4 text-gray-500 dark:text-gray-400 text-center">Список скриншотов пуст.</div>';
                console.log("[renderScreenshotList] Список скриншотов пуст.");
                return;
            }

            const fragment = document.createDocumentFragment();
            const validBlobsForLightbox = screenshots
                .map(s => (s && s.blob instanceof Blob ? s.blob : null))
                .filter(blob => blob !== null);
            let renderedCount = 0;

            screenshots.forEach((screenshot, index) => {
                if (!screenshot || typeof screenshot.id === 'undefined' || !(screenshot.blob instanceof Blob)) {
                    console.warn(`[renderScreenshotList] Пропуск невалидного элемента скриншота на индексе ${index}:`, screenshot);
                    return;
                }

                const item = document.createElement('div');
                item.dataset.screenshotId = screenshot.id;
                item.className = 'group flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 rounded transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 dark:focus:ring-offset-gray-900';
                item.tabIndex = 0;
                item.setAttribute('role', 'button');
                item.setAttribute('aria-label', `Информация о скриншоте ${screenshot.id}`);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'flex flex-col text-sm';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'font-medium text-gray-900 dark:text-gray-100';
                nameSpan.textContent = screenshot.name || `Скриншот ${screenshot.id}`;
                const sizeSpan = document.createElement('span');
                sizeSpan.className = 'text-gray-500 dark:text-gray-400';
                sizeSpan.textContent = screenshot.blob.size ? `${(screenshot.blob.size / 1024).toFixed(1)} KB` : 'Размер неизвестен';
                infoDiv.appendChild(nameSpan);
                infoDiv.appendChild(sizeSpan);

                const viewButton = document.createElement('button');
                viewButton.type = 'button';
                viewButton.className = 'ml-4 px-3 py-1 bg-primary text-white text-xs font-medium rounded shadow-sm hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition';
                viewButton.textContent = 'Просмотр';
                viewButton.setAttribute('aria-label', `Просмотреть скриншот ${screenshot.id}`);

                const blobIndexForLightbox = validBlobsForLightbox.findIndex(b => b === screenshot.blob);


                const itemClickHandler = (e) => {
                    if (e.target === viewButton || viewButton.contains(e.target)) {
                        return;
                    }
                    console.log(`[renderScreenshotList] Клик по элементу списка ID: ${screenshot.id}`);
                    if (typeof onItemClick === 'function') {
                        onItemClick(screenshot, index);
                    } else {
                        if (typeof onOpenLightbox === 'function' && blobIndexForLightbox !== -1) {
                            onOpenLightbox(validBlobsForLightbox, blobIndexForLightbox);
                        } else if (blobIndexForLightbox === -1) {
                            console.error(`[renderScreenshotList] Не удалось найти Blob для ID ${screenshot.id} в массиве 'validBlobsForLightbox' при клике на элемент.`);
                        }
                    }
                };
                if (item._itemClickHandler) item.removeEventListener('click', item._itemClickHandler);
                item.addEventListener('click', itemClickHandler);
                item._itemClickHandler = itemClickHandler;

                const itemKeydownHandler = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        itemClickHandler(e);
                    }
                };
                if (item._itemKeydownHandler) item.removeEventListener('keydown', item._itemKeydownHandler);
                item.addEventListener('keydown', itemKeydownHandler);
                item._itemKeydownHandler = itemKeydownHandler;


                const buttonClickHandler = (e) => {
                    e.stopPropagation();
                    console.log(`[renderScreenshotList] Клик по кнопке "Просмотр" для ID: ${screenshot.id}`);
                    if (typeof onOpenLightbox === 'function') {
                        if (blobIndexForLightbox !== -1) {
                            onOpenLightbox(validBlobsForLightbox, blobIndexForLightbox);
                        } else {
                            console.error(`[renderScreenshotList] Не удалось найти Blob для ID ${screenshot.id} в массиве 'validBlobsForLightbox' при клике на кнопку.`);
                        }
                    } else {
                        console.warn("[renderScreenshotList] Функция 'onOpenLightbox' не предоставлена или не является функцией.");
                    }
                };
                if (viewButton._buttonClickHandler) viewButton.removeEventListener('click', viewButton._buttonClickHandler);
                viewButton.addEventListener('click', buttonClickHandler);
                viewButton._buttonClickHandler = buttonClickHandler;

                item.appendChild(infoDiv);
                item.appendChild(viewButton);
                fragment.appendChild(item);
                renderedCount++;
            });

            container.appendChild(fragment);
            console.log(`[renderScreenshotList] Рендеринг списка завершен. Добавлено: ${renderedCount} элементов.`);
        }



        function formatExampleForTextarea(exampleData) {
            if (!exampleData) {
                return '';
            }

            if (typeof exampleData === 'object' && exampleData !== null && exampleData.type === 'list') {
                const intro = exampleData.intro ? String(exampleData.intro).trim() + '\n' : '';
                const items = Array.isArray(exampleData.items)
                    ? exampleData.items.map(item => `- ${String(item).replace(/<[^>]*>/g, '').trim()}`).join('\n')
                    : '';
                return (intro + items).trim();
            }

            if (typeof exampleData === 'string') {
                return exampleData.trim();
            }

            try {
                return JSON.stringify(exampleData, null, 2).trim();
            } catch {
                return '[Невалидные данные примера]';
            }
        }


        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') {
                return '';
            }
            return unsafe
                .replace(/&/g, "&")
                .replace(/</g, "<")
                .replace(/>/g, ">")
                .replace(/"/g, "")
                .replace(/'/g, "'");
        }


        async function showAlgorithmDetail(algorithm, section) {
            console.log(`[showAlgorithmDetail v8 Corrected] Вызвана. Алгоритм ID (из объекта): ${algorithm?.id}, Секция: ${section}`);

            const algorithmModal = document.getElementById('algorithmModal');
            const modalTitle = document.getElementById('modalTitle');
            const algorithmStepsContainer = document.getElementById('algorithmSteps');
            const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');
            const editAlgorithmBtnModal = document.getElementById('editAlgorithmBtn');

            if (!algorithmModal || !modalTitle || !algorithmStepsContainer) {
                console.error("[showAlgorithmDetail Error] Не найдены основные элементы модального окна (#algorithmModal, #modalTitle, #algorithmSteps).");
                showNotification("Критическая ошибка интерфейса: не найдены элементы окна деталей.", "error");
                return;
            }
            if (!algorithm || typeof algorithm !== 'object') {
                console.error("[showAlgorithmDetail Error] Передан некорректный объект алгоритма:", algorithm);
                showNotification("Ошибка: Некорректные данные алгоритма.", "error");
                return;
            }
            const currentAlgorithmId = (section === 'main') ? 'main' : (algorithm.id || null);
            if (currentAlgorithmId === null || currentAlgorithmId === undefined) {
                console.error(`[showAlgorithmDetail Error] Не удалось определить ID алгоритма. Section: ${section}, Algorithm Object ID: ${algorithm.id}`);
                showNotification("Ошибка: Не удалось определить ID алгоритма.", "error");
                return;
            }

            algorithmModal.dataset.currentAlgorithmId = String(currentAlgorithmId);
            algorithmModal.dataset.currentSection = section;
            console.log(`[showAlgorithmDetail Info] Установлены data-атрибуты: data-current-algorithm-id=${algorithmModal.dataset.currentAlgorithmId}, data-current-section=${algorithmModal.dataset.currentSection}`);


            modalTitle.textContent = algorithm.title ?? "Детали алгоритма";
            algorithmStepsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Загрузка шагов...</p>';
            console.log(`[showAlgorithmDetail Info] Заголовок модального окна установлен: "${modalTitle.textContent}"`);

            if (deleteAlgorithmBtn) deleteAlgorithmBtn.style.display = (section === 'main') ? 'none' : '';
            if (editAlgorithmBtnModal) editAlgorithmBtnModal.style.display = '';


            const isMainAlgorithm = section === 'main';

            try {
                if (!algorithm.steps || !Array.isArray(algorithm.steps)) {
                    console.error("[showAlgorithmDetail Step Render Error] Поле 'steps' отсутствует или не является массивом в данных алгоритма:", algorithm);
                    throw new Error('Данные шагов отсутствуют или некорректны.');
                }
                console.log(`[showAlgorithmDetail Step Render] Начало рендеринга ${algorithm.steps.length} шагов.`);

                const stepHtmlPromises = algorithm.steps.map(async (step, index) => {
                    if (!step || typeof step !== 'object') {
                        console.warn(`[showAlgorithmDetail Step Render Warn] Пропуск невалидного объекта шага на индексе ${index}:`, step);
                        return `<div class="algorithm-step bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-3 rounded shadow-sm text-red-700 dark:text-red-300">Ошибка: Некорректные данные для шага ${index + 1}.</div>`;
                    }

                    let screenshotIconHtml = '';
                    let iconContainerHtml = '';
                    if (!isMainAlgorithm) {
                        const hasSavedScreenshotIds = Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0;
                        const hasScreenshots = hasSavedScreenshotIds;
                        console.log(`[showAlgorithmDetail Step Render Debug] Шаг ${index}: hasScreenshots (based on step.screenshotIds)=${hasScreenshots}. IDs: ${JSON.stringify(step.screenshotIds)}`);
                        console.log(`[showAlgorithmDetail Step Render Debug] Шаг ${index}: Вызов renderScreenshotIcon с ID='${currentAlgorithmId}', Index=${index}, HasScreenshots=${hasScreenshots}`);
                        if (typeof renderScreenshotIcon === 'function') {
                            screenshotIconHtml = renderScreenshotIcon(currentAlgorithmId, index, hasScreenshots);
                            if (screenshotIconHtml) {
                                iconContainerHtml = `<div class="inline-block ml-2 align-middle">${screenshotIconHtml}</div>`;
                            }
                        } else {
                            console.warn("[showAlgorithmDetail Step Render] Функция renderScreenshotIcon не найдена!");
                        }
                    }

                    const descriptionHtml = `<p class="mt-1 text-base ${iconContainerHtml ? 'clear-both' : ''} break-words">${linkify(step.description ?? 'Нет описания.')}</p>`;
                    let exampleHtml = '';
                    if (step.example) {
                        exampleHtml = `<div class="example-container mt-2 text-sm prose dark:prose-invert max-w-none break-words">`;
                        if (typeof step.example === 'object' && step.example.type === 'list' && Array.isArray(step.example.items)) {
                            if (step.example.intro) exampleHtml += `<p class="italic mb-1">${linkify(step.example.intro)}</p>`;
                            exampleHtml += `<ul class="list-disc list-inside pl-5 space-y-0.5">`;
                            step.example.items.forEach(item => exampleHtml += `<li>${linkify(String(item))}</li>`);
                            exampleHtml += `</ul>`;
                        } else if (typeof step.example === 'string') {
                            exampleHtml += `<strong>Пример:</strong><p class="mt-1">${linkify(step.example)}</p>`;
                        } else {
                            try {
                                exampleHtml += `<strong>Пример (данные):</strong><pre class="text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded mt-1 overflow-x-auto font-mono whitespace-pre-wrap"><code>${escapeHtml(JSON.stringify(step.example, null, 2))}</code></pre>`;
                            } catch (e) { exampleHtml += `<div class="text-xs text-red-500 mt-1">[Ошибка формата примера]</div>`; }
                        }
                        exampleHtml += `</div>`;
                    }

                    const stepTitle = escapeHtml(step.title ?? `Шаг ${index + 1}`);
                    const stepHTML = `
                         <div class="algorithm-step bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-sm border-l-4 border-primary mb-3 relative">
                             <h3 class="font-bold text-lg ${iconContainerHtml ? 'inline' : ''}" title="${stepTitle}">${stepTitle}</h3>
                             ${iconContainerHtml}
                             ${descriptionHtml}
                             ${exampleHtml}
                         </div>`;
                    console.log(`[showAlgorithmDetail Step Render Debug] Шаг ${index}: HTML сгенерирован.`);
                    return stepHTML;
                });

                const stepsHtmlArray = await Promise.all(stepHtmlPromises);
                algorithmStepsContainer.innerHTML = stepsHtmlArray.join('');
                console.log(`[showAlgorithmDetail Step Render] Рендеринг ${stepsHtmlArray.length} шагов завершен.`);


                if (!isMainAlgorithm) {
                    const newButtons = algorithmStepsContainer.querySelectorAll('.view-screenshot-btn');
                    if (newButtons.length > 0) {
                        let attachedCount = 0;
                        newButtons.forEach(button => {
                            if (typeof handleViewScreenshotClick === 'function') {
                                button.removeEventListener('click', handleViewScreenshotClick);
                                button.addEventListener('click', handleViewScreenshotClick);
                                attachedCount++;
                            } else {
                                console.warn(`[showAlgorithmDetail Warn] Функция handleViewScreenshotClick не найдена при повторной привязке.`);
                                button.disabled = true;
                                button.title = "Обработчик не найден";
                            }
                        });
                        console.log(`[showAlgorithmDetail Event Listeners] Обработчики кликов для ${attachedCount}/${newButtons.length} кнопок скриншотов добавлены/обновлены.`);
                    } else {
                        console.log("[showAlgorithmDetail Event Listeners] Кнопки скриншотов (.view-screenshot-btn) не найдены для привязки обработчиков.");
                    }
                } else {
                    console.log("[showAlgorithmDetail Event Listeners] Обработчики для кнопок скриншотов не привязываются для главного алгоритма.");
                }

            } catch (error) {
                console.error("[showAlgorithmDetail Step Render Error] Ошибка при обработке/рендеринге шагов алгоритма:", error);
                algorithmStepsContainer.innerHTML = `<p class="text-red-500 p-4 text-center">Ошибка при отображении шагов алгоритма: ${error.message}</p>`;
            }


            algorithmModal.classList.remove('hidden');
            document.body.classList.add('modal-open');
            console.log(`[showAlgorithmDetail Info] Модальное окно #${algorithmModal.id} показано.`);
        }


        async function editAlgorithm(algorithmId, section = 'main') {
            let algorithm = null;
            initialEditState = null;

            const isMainAlgorithm = section === 'main';
            console.log(`[editAlgorithm v7 Исправленная] Попытка редактирования: ID=${algorithmId}, Секция=${section}, isMainAlgorithm=${isMainAlgorithm}`);

            try {
                console.log(`[editAlgorithm v7] Поиск/загрузка данных для ID ${algorithmId} в секции ${section}...`);
                if (isMainAlgorithm) {
                    if (algorithms?.main?.id === 'main') {
                        algorithm = algorithms.main;
                        console.log("[editAlgorithm v7] Найден главный алгоритм в памяти.");
                    } else {
                        console.log("[editAlgorithm v7] Главный алгоритм не найден в памяти, попытка загрузки из IndexedDB...");
                        const savedAlgoContainer = await getFromIndexedDB('algorithms', 'all');
                        if (savedAlgoContainer?.data?.main?.id === 'main') {
                            algorithm = savedAlgoContainer.data.main;
                            if (typeof algorithms !== 'undefined') {
                                algorithms.main = JSON.parse(JSON.stringify(algorithm));
                            }
                            console.log("[editAlgorithm v7] Главный алгоритм загружен из IndexedDB.");
                        } else {
                            console.warn("[editAlgorithm v7] Главный алгоритм не найден ни в памяти, ни в IndexedDB.");
                        }
                    }
                } else {
                    let foundInMemory = false;
                    if (algorithms?.[section] && Array.isArray(algorithms[section])) {
                        algorithm = algorithms[section].find(a => String(a?.id) === String(algorithmId));
                        if (algorithm) {
                            foundInMemory = true;
                            console.log(`[editAlgorithm v7] Алгоритм ${algorithmId} найден в памяти [${section}].`);
                        }
                    }

                    if (!foundInMemory) {
                        console.log(`[editAlgorithm v7] Алгоритм ${algorithmId} не найден в памяти [${section}], попытка загрузки из IndexedDB...`);
                        const savedAlgoContainer = await getFromIndexedDB('algorithms', 'all');
                        const savedAlgoData = savedAlgoContainer?.data;
                        if (savedAlgoData?.[section] && Array.isArray(savedAlgoData[section])) {
                            algorithm = savedAlgoData[section].find(a => String(a?.id) === String(algorithmId));
                            if (algorithm) {
                                if (algorithms && algorithms[section]) {
                                    const indexInMemory = algorithms[section].findIndex(a => String(a?.id) === String(algorithmId));
                                    if (indexInMemory > -1) {
                                        console.log(`[editAlgorithm v7] Обновление алгоритма ${algorithmId} в памяти из данных БД.`);
                                        algorithms[section][indexInMemory] = JSON.parse(JSON.stringify(algorithm));
                                    } else {
                                        console.log(`[editAlgorithm v7] Добавление алгоритма ${algorithmId} в память из данных БД.`);
                                        algorithms[section].push(JSON.parse(JSON.stringify(algorithm)));
                                    }
                                } else {
                                    console.warn(`[editAlgorithm v7] Секция ${section} не найдена в 'algorithms' для обновления из БД.`);
                                    if (!algorithms) algorithms = {};
                                    algorithms[section] = [JSON.parse(JSON.stringify(algorithm))];
                                }
                                console.log(`[editAlgorithm v7] Алгоритм ${algorithmId} загружен из IndexedDB [${section}].`);
                            } else {
                                console.warn(`[editAlgorithm v7] Алгоритм ${algorithmId} не найден в IndexedDB [${section}].`);
                            }
                        } else {
                            console.warn(`[editAlgorithm v7] Секция ${section} не найдена в сохраненных данных IndexedDB или не является массивом.`);
                        }
                    }
                }
                if (!algorithm || typeof algorithm !== 'object') {
                    throw new Error(`Алгоритм с ID ${algorithmId} не найден в секции ${section} после всех проверок.`);
                }

            } catch (error) {
                console.error(`[editAlgorithm v7 Исправленная] Ошибка при получении данных алгоритма:`, error);
                showNotification(`Ошибка при поиске данных алгоритма: ${error.message || error}`, "error");
                initialEditState = null;
                return;
            }

            if (!algorithm || typeof algorithm !== 'object') {
                console.error(`[editAlgorithm v7 FATAL] 'algorithm' все еще не объект после блока try/catch! ID=${algorithmId}, Section=${section}`);
                showNotification("Критическая ошибка: не удалось получить данные алгоритма.", "error");
                initialEditState = null;
                return;
            }

            const editModal = document.getElementById('editModal');
            const editModalTitle = document.getElementById('editModalTitle');
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const descriptionContainer = document.getElementById('algorithmDescriptionContainer');
            const algorithmDescriptionInput = document.getElementById('algorithmDescription');
            const editStepsContainer = document.getElementById('editSteps');
            const addStepBtn = document.getElementById('addStepBtn');
            const saveAlgorithmBtn = document.getElementById('saveAlgorithmBtn');

            if (!editModal || !editModalTitle || !algorithmTitleInput || !editStepsContainer || !addStepBtn || !saveAlgorithmBtn || !descriptionContainer) {
                console.error("[editAlgorithm v7 Исправленная] КРИТИЧЕСКАЯ ОШИБКА: Не найдены ОБЯЗАТЕЛЬНЫЕ элементы модального окна редактирования.");
                showNotification("Критическая ошибка интерфейса: не найдены элементы окна редактирования.", "error");
                if (editModal && !editModal.classList.contains('hidden')) { editModal.classList.add('hidden'); }
                initialEditState = null;
                return;
            }
            if (!isMainAlgorithm && !algorithmDescriptionInput) {
                console.error("[editAlgorithm v7 Исправленная] КРИТИЧЕСКАЯ ОШИБКА: Не найдено поле описания (#algorithmDescription) для не-главного алгоритма.");
                showNotification("Критическая ошибка интерфейса: не найдено поле описания.", "error");
                if (editModal && !editModal.classList.contains('hidden')) { editModal.classList.add('hidden'); }
                initialEditState = null;
                return;
            }

            try {
                descriptionContainer.style.display = isMainAlgorithm ? 'none' : 'block';

                editModalTitle.textContent = `Редактирование: ${algorithm.title ?? 'Без названия'}`;
                algorithmTitleInput.value = algorithm.title ?? '';
                if (!isMainAlgorithm && algorithmDescriptionInput) {
                    algorithmDescriptionInput.value = algorithm.description ?? '';
                }

                editStepsContainer.innerHTML = '';
                if (!Array.isArray(algorithm.steps)) {
                    console.error(`[editAlgorithm v7 Исправленная] Алгоритм (ID: ${algorithm.id || algorithmId}) имеет невалидные 'steps'.`);
                    editStepsContainer.innerHTML = '<p class="text-red-500 p-4 text-center">Ошибка загрузки шагов: данные некорректны.</p>';
                } else if (algorithm.steps.length === 0 && !isMainAlgorithm) {
                    editStepsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center p-4">У этого алгоритма еще нет шагов. Добавьте первый шаг.</p>';
                } else {
                    const fragment = document.createDocumentFragment();
                    for (const [index, step] of algorithm.steps.entries()) {
                        if (!step || typeof step !== 'object') {
                            continue;
                        }
                        const stepDiv = document.createElement('div');
                        stepDiv.className = 'edit-step p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm mb-4';
                        stepDiv.dataset.stepIndex = index;
                        if (step.type) { stepDiv.dataset.stepType = step.type; }
                        try {
                            stepDiv.innerHTML = createStepElementHTML(index + 1, isMainAlgorithm, !isMainAlgorithm);
                        } catch (htmlError) {
                            console.error(`[editAlgorithm v7] Ошибка при вызове createStepElementHTML для шага ${index + 1}:`, htmlError);
                            stepDiv.innerHTML = `<p class="text-red-500">Ошибка рендеринга шага ${index + 1}</p>`;
                            fragment.appendChild(stepDiv);
                            continue;
                        }

                        const titleInput = stepDiv.querySelector('.step-title');
                        const descInput = stepDiv.querySelector('.step-desc');
                        const exampleTextarea = stepDiv.querySelector('.step-example');

                        if (titleInput) { titleInput.value = step.title ?? ''; }
                        if (descInput) { descInput.value = step.description ?? ''; }
                        if (exampleTextarea) { exampleTextarea.value = formatExampleForTextarea(step.example); }

                        if (!isMainAlgorithm) {
                            const thumbsContainer = stepDiv.querySelector('#screenshotThumbnailsContainer');
                            if (thumbsContainer) {
                                const existingIds = Array.isArray(step.screenshotIds) ? step.screenshotIds.filter(id => id !== null && id !== undefined) : [];
                                stepDiv.dataset.existingScreenshotIds = existingIds.join(',');

                                if (existingIds.length > 0) {
                                    if (typeof renderExistingThumbnail === 'function') {
                                        const renderPromises = existingIds.map(screenshotId =>
                                            renderExistingThumbnail(screenshotId, thumbsContainer, stepDiv)
                                                .catch(err => console.error(`[editAlgorithm v7 - Step ${index}] Ошибка рендеринга миниатюры ID ${screenshotId}:`, err))
                                        );
                                        await Promise.allSettled(renderPromises);
                                    } else { }
                                }
                                stepDiv.dataset.existingRendered = 'true';
                                stepDiv._tempScreenshotBlobs = [];
                                stepDiv.dataset.screenshotsToDelete = '';
                                if (typeof attachScreenshotHandlers === 'function') {
                                    attachScreenshotHandlers(stepDiv);
                                } else { }
                            } else { }
                        }

                        const deleteStepBtn = stepDiv.querySelector('.delete-step');
                        if (deleteStepBtn) {
                            if (typeof attachStepDeleteHandler === 'function') {
                                attachStepDeleteHandler(deleteStepBtn, stepDiv, editStepsContainer, section, 'edit', isMainAlgorithm);
                            } else { }
                        } else { }

                        fragment.appendChild(stepDiv);
                    }
                    editStepsContainer.appendChild(fragment);

                    if (typeof updateStepNumbers === 'function') {
                        updateStepNumbers(editStepsContainer);
                    } else {
                        console.error("[editAlgorithm v7 Исправленная] Функция updateStepNumbers не найдена!");
                    }
                }

                if (typeof captureInitialEditState === 'function') {
                    captureInitialEditState(algorithm);
                } else {
                    console.warn("[editAlgorithm v7 Исправленная] Функция captureInitialEditState не найдена.");
                    initialEditState = null;
                }

            } catch (error) {
                console.error("[editAlgorithm v7 Исправленная] Ошибка при заполнении формы данными:", error);
                showNotification("Произошла ошибка при подготовке формы редактирования.", "error");
                editStepsContainer.innerHTML = '<p class="text-red-500 p-4 text-center">Ошибка загрузки данных в форму.</p>';
                if (saveAlgorithmBtn) saveAlgorithmBtn.disabled = true;
                initialEditState = null;
                return;
            }

            if (algorithm && (typeof algorithm.id === 'string' || typeof algorithm.id === 'number') && algorithm.id !== '' && algorithm.id !== null && algorithm.id !== undefined) {
                editModal.dataset.algorithmId = String(algorithm.id);
            } else {
                console.error(`[editAlgorithm v7 FATAL] Не удалось получить валидный algorithm.id для установки dataset! algorithm:`, algorithm);
                showNotification("Критическая ошибка: не удалось определить ID редактируемого алгоритма.", "error");
                if (editModal && !editModal.classList.contains('hidden')) editModal.classList.add('hidden');
                initialEditState = null;
                return;
            }
            editModal.dataset.section = section;

            const algorithmModal = document.getElementById('algorithmModal');
            if (algorithmModal) { algorithmModal.classList.add('hidden'); }

            editModal.classList.remove('hidden');
            setTimeout(() => {
                try {
                    const titleInputForFocus = document.getElementById('algorithmTitle');
                    if (titleInputForFocus && titleInputForFocus.offsetParent !== null) {
                        titleInputForFocus.focus();
                    } else {
                        console.warn("[editAlgorithm v7] Не удалось установить фокус: поле заголовка не найдено или не видимо.");
                    }
                } catch (focusError) {
                    console.warn("[editAlgorithm v7] Ошибка при попытке установить фокус на поле заголовка:", focusError);
                }
            }, 50);

            console.log(`[editAlgorithm v7 Исправленная] Успешно открыто окно редактирования для Algorithm ID: ${algorithm.id}, Секция: ${section}. Начальное состояние захвачено.`);
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
            if (!container) {
                console.warn(`[applyView v3 Исправленная] Контейнер не предоставлен.`);
                return;
            }

            const sectionId = container.dataset.sectionId;
            const viewControlAncestor = container.closest('.tab-content > div, #reglamentsList');
            if (!viewControlAncestor) {
                console.warn(`[applyView v3 Исправленная] Родительский элемент управления видом не найден для секции ${sectionId}`);
                return;
            }
            const buttons = viewControlAncestor.querySelectorAll(`.view-toggle`);
            const items = container.querySelectorAll('.view-item');

            buttons.forEach(btn => {
                const isTarget = btn.dataset.view === view;
                btn.classList.remove('bg-primary', 'text-white', 'text-gray-500', 'dark:text-gray-400');
                if (isTarget) {
                    btn.classList.add('bg-primary', 'text-white');
                } else {
                    btn.classList.add('text-gray-500', 'dark:text-gray-400');
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
                const isReglamentItem = item.classList.contains('reglament-item');
                const isCibLinkItem = item.classList.contains('cib-link-item');
                const actionsSelector = '.reglament-actions, .bookmark-actions, .ext-link-actions, .cib-link-item .flex-shrink-0, .algorithm-actions';
                const actions = item.querySelector(actionsSelector);
                const titleElement = item.querySelector('h3, h4');
                let descriptionElement = null;
                if (item.classList.contains('algorithm-card')) {
                    descriptionElement = item.querySelector('div.flex-grow > p');
                } else if (item.classList.contains('cib-link-item')) {
                    descriptionElement = item.querySelector('p.link-description');
                } else {
                    descriptionElement = item.querySelector('p.bookmark-description, p.ext-link-description');
                }

                item.classList.remove(
                    'flex', 'flex-col', 'justify-between', 'items-center', 'items-start',
                    'p-4', 'p-3', 'py-3', 'pl-5', 'pr-3', 'pb-12',
                    'border-b', 'border-gray-200', 'dark:border-gray-600',
                    'bg-white', 'dark:bg-gray-700', 'dark:bg-[#374151]',
                    'hover:shadow-md', 'shadow-sm', 'shadow-md', 'hover:shadow-lg', 'rounded-lg',
                    'group',
                    'cursor-pointer',
                    'overflow-hidden',
                    ...LIST_ITEM_BASE_CLASSES,
                    ...CARD_ITEM_BASE_CLASSES,
                    ...ALGO_BOOKMARK_CARD_CLASSES,
                    ...LINK_REGLAMENT_CARD_CLASSES,
                    'mb-1',
                    'h-full'
                );

                if (titleElement) {
                    titleElement.classList.remove(
                        'group-hover:text-primary',
                        'truncate', 'overflow-hidden', 'whitespace-nowrap', 'text-ellipsis',
                        'min-w-0'
                    );
                }
                if (descriptionElement) {
                    descriptionElement.classList.remove(
                        'line-clamp-2', 'overflow-hidden'
                    );
                    descriptionElement.style.display = '';
                    descriptionElement.style.webkitBoxOrient = '';
                    descriptionElement.style.webkitLineClamp = '';
                }

                if (actions) {
                    actions.classList.remove(
                        'opacity-0', 'opacity-100', 'group-hover:opacity-100', 'focus-within:opacity-100',
                        'transition-opacity', 'duration-200',
                        'mt-auto', 'pt-2', 'border-t', '-mx-4', 'px-4', 'pb-1', 'pb-2', 'justify-end',
                        'absolute', 'top-2', 'right-2', 'z-10', 'space-x-1',
                        'ml-2', 'ml-auto'
                    );
                    actions.classList.add('flex', 'flex-shrink-0', 'items-center');
                }

                if (view === 'cards') {
                    item.classList.add(...CARD_ITEM_BASE_CLASSES);
                    item.classList.add('flex', 'flex-col', 'justify-between');
                    item.classList.add('group');
                    item.classList.add('overflow-hidden');

                    if (titleElement) {
                        if (!isCibLinkItem) {
                            titleElement.classList.add('group-hover:text-primary');
                        }
                    }

                    if (descriptionElement) {
                        descriptionElement.classList.add('line-clamp-2', 'overflow-hidden');
                        descriptionElement.style.display = '-webkit-box';
                        descriptionElement.style.webkitBoxOrient = 'vertical';
                    }

                    if (item.classList.contains('bookmark-item')) {
                        item.classList.add('pb-12', 'relative', 'h-full');
                        if (actions) {
                            actions.classList.add('absolute', 'bottom-0', 'left-0', 'right-0', 'border-t', 'border-gray-200', 'dark:border-gray-700', 'px-4', 'py-2', 'justify-end', 'bg-inherit', 'rounded-b-lg');
                            actions.classList.add('opacity-0', 'group-hover:opacity-100', 'focus-within:opacity-100', 'transition-opacity', 'duration-200');
                        }
                    } else if (isCibLinkItem) {
                        item.classList.add('relative', 'items-start');
                        item.classList.remove('flex-col', 'justify-between');
                        if (actions) {
                            actions.classList.add('absolute', 'top-2', 'right-2', 'z-10', 'space-x-1');
                            actions.classList.add('opacity-0', 'group-hover:opacity-100', 'focus-within:opacity-100', 'transition-opacity', 'duration-200');
                        }
                    } else {
                        item.classList.add('items-start');
                        if (item.classList.contains('algorithm-card') || item.classList.contains('ext-link-item')) {
                            item.classList.add('cursor-pointer');
                        }
                        if (actions) {
                            actions.classList.add('ml-auto');
                            actions.classList.add('opacity-0', 'group-hover:opacity-100', 'focus-within:opacity-100', 'transition-opacity', 'duration-200');
                        }
                    }

                } else {
                    // Вид "Список"
                    const baseListClassesFiltered = LIST_ITEM_BASE_CLASSES.filter(cls => ![
                        'p-3', 'border-b', 'border-gray-200', 'dark:border-gray-600'
                    ].includes(cls));
                    item.classList.add(...baseListClassesFiltered);
                    item.classList.add('py-3', 'pl-5', 'pr-3');
                    item.classList.add('border-b', 'border-gray-200', 'dark:border-gray-600');
                    item.classList.add('group');
                    item.classList.add('mb-1');

                    if (actions) {
                        actions.classList.add('opacity-0', 'group-hover:opacity-100', 'focus-within:opacity-100', 'transition-opacity', 'duration-200');
                        actions.classList.add('ml-2');
                    }

                    if (container.lastElementChild === item) {
                        item.classList.remove('border-b', 'border-gray-200', 'dark:border-gray-600', 'mb-1');
                    }
                }
            });
            console.log(`[applyView v3 Исправленная] Стили для вида '${view}' применены к ${items.length} элементам в контейнере ${sectionId || container.id}.`); // v3
        }


        function applyCurrentView(sectionId) {
            const container = document.getElementById(sectionId);
            if (container) {
                const currentView = viewPreferences[sectionId] || container.dataset.defaultView || 'cards';
                applyView(container, currentView);
            }
        }


        function createStepElementHTML(stepNumber, includeExampleField, includeScreenshotsField) {
            const commonInputClasses = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
            const commonTextareaClasses = `${commonInputClasses} resize-y`;

            const exampleInputHTML = includeExampleField ? `
            <div class="mt-2">
                <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Пример / Список (опционально)</label>
                <textarea class="step-example ${commonTextareaClasses}" rows="4" placeholder="Пример: Текст примера...\nИЛИ\n- Элемент списка 1\n- Элемент списка 2"></textarea>
                <p class="text-xs text-gray-500 mt-1">Для списка используйте дефис (-) или звездочку (*) в начале каждой строки. Первая строка без дефиса/звездочки будет вступлением.</p>
            </div>
        ` : '';

            const screenshotHTML = includeScreenshotsField ? `
                <div class="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Скриншоты (опционально)</label>
                     <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Добавляйте изображения кнопкой или вставкой из буфера.</p>
                    <div id="screenshotThumbnailsContainer" class="flex flex-wrap gap-2 mb-2 min-h-[3rem]">
                    </div>
                    <div class="flex items-center gap-3">
                        <button type="button" class="add-screenshot-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition">
                            <i class="fas fa-camera mr-1"></i> Загрузить/Добавить
                        </button>
                    </div>
                    <input type="file" class="screenshot-input hidden" accept="image/png, image/jpeg, image/gif, image/webp" multiple>
                </div>
            ` : '';

            return `
                    <div class="flex justify-between items-start mb-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 step-number-label">Шаг ${stepNumber}</label>
                        <button type="button" class="delete-step text-red-500 hover:text-red-700 transition-colors duration-150 p-1 ml-2 flex-shrink-0" aria-label="Удалить шаг ${stepNumber}">
                            <i class="fas fa-trash fa-fw" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div class="mb-2">
                        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Заголовок шага</label>
                        <input type="text" class="step-title ${commonInputClasses}" placeholder="Введите заголовок...">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Описание</label>
                        <textarea class="step-desc ${commonTextareaClasses}" rows="3" placeholder="Введите описание шага..."></textarea>
                    </div>
                    ${exampleInputHTML}
                    ${screenshotHTML}
                `;
        }


        function addEditStep() {
            const containerId = 'editSteps';
            const editStepsContainer = document.getElementById(containerId);
            if (!editStepsContainer) {
                console.error("Контейнер #editSteps не найден для добавления шага.");
                showNotification("Ошибка: Не удалось найти контейнер шагов.", "error");
                return;
            }
            const editModal = document.getElementById('editModal');
            if (!editModal) {
                console.error("Модальное окно редактирования #editModal не найдено.");
                showNotification("Ошибка: Не найдено окно редактирования.", "error");
                return;
            }

            const section = editModal.dataset.section;
            if (!section) {
                console.error("Не удалось определить секцию в addEditStep (dataset.section отсутствует).");
                showNotification("Ошибка: Не удалось определить раздел для добавления шага.", "error");
                return;
            }

            const isMainAlgorithm = section === 'main';
            console.log(`addEditStep: Добавление шага в секцию ${section} (isMainAlgorithm: ${isMainAlgorithm})`);

            const stepCount = editStepsContainer.children.length;
            const stepDiv = document.createElement('div');
            stepDiv.className = 'edit-step p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm mb-4';
            stepDiv.dataset.stepIndex = stepCount;

            stepDiv.innerHTML = createStepElementHTML(stepCount + 1, isMainAlgorithm, !isMainAlgorithm);

            const deleteBtn = stepDiv.querySelector('.delete-step');
            if (deleteBtn) {
                if (typeof attachStepDeleteHandler === 'function') {
                    attachStepDeleteHandler(deleteBtn, stepDiv, editStepsContainer, section, 'edit', isMainAlgorithm);
                } else {
                    console.error("Функция attachStepDeleteHandler не найдена в addEditStep!");
                    deleteBtn.disabled = true;
                    deleteBtn.title = "Функция удаления недоступна";
                }
            } else {
                console.warn("Не удалось найти кнопку удаления для нового шага в addEditStep.");
            }

            if (!isMainAlgorithm) {
                if (typeof attachScreenshotHandlers === 'function') {
                    attachScreenshotHandlers(stepDiv);
                } else {
                    console.error("Функция attachScreenshotHandlers не найдена в addEditStep!");
                }
            } else {
                console.log("Скриншоты для главного алгоритма не используются, attachScreenshotHandlers не вызывается.");
            }

            const placeholder = editStepsContainer.querySelector('p.text-gray-500');
            if (placeholder) {
                placeholder.remove();
            }

            editStepsContainer.appendChild(stepDiv);

            if (typeof updateStepNumbers === 'function') {
                updateStepNumbers(editStepsContainer);
            } else {
                console.error("Функция updateStepNumbers не найдена в addEditStep!");
            }

            stepDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const newTitleInput = stepDiv.querySelector('.step-title');
            if (newTitleInput) {
                setTimeout(() => newTitleInput.focus(), 100);
            }
            console.log("Шаг добавлен в форму редактирования. Отслеживание изменений через hasChanges('edit').");
        }



        async function saveAlgorithm() {
            const editModal = document.getElementById('editModal');
            const algorithmIdStr = editModal?.dataset.algorithmId;
            const section = editModal?.dataset.section;
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const algorithmDescriptionInput = document.getElementById('algorithmDescription');
            const editStepsContainer = document.getElementById('editSteps');
            const saveButton = document.getElementById('saveAlgorithmBtn');

            if (!editModal || !algorithmIdStr || !section || !algorithmTitleInput || !editStepsContainer || !saveButton) {
                console.error("saveAlgorithm v6 (TX Fix): Missing required elements.");
                showNotification("Ошибка: Не найдены элементы формы.", "error");
                return;
            }
            const isMainAlgo = section === 'main';
            if (!isMainAlgo && !algorithmDescriptionInput) {
                console.error("saveAlgorithm v6 (TX Fix): Missing description input for non-main.");
                showNotification("Ошибка: Не найдено поле описания.", "error");
                return;
            }
            console.log(`[Save Algorithm v6 (TX Fix)] Start. ID: ${algorithmIdStr}, Section: ${section}`);

            const finalTitle = algorithmTitleInput.value.trim();
            const newDescription = (!isMainAlgo && algorithmDescriptionInput) ? algorithmDescriptionInput.value.trim() : undefined;
            if (!finalTitle) {
                showNotification("Заголовок не может быть пустым.", "warning");
                algorithmTitleInput.focus(); return;
            }

            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

            const { steps: newStepsBase, screenshotOps, isValid } = extractStepsDataFromEditForm(editStepsContainer, isMainAlgo);
            if (!isValid && !isMainAlgo) {
                showNotification("Алгоритм должен содержать хотя бы один шаг.", "warning");
                saveButton.disabled = false; saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения'; return;
            }
            console.log(`[Save Algorithm v6] Извлечено: ${newStepsBase.length} шагов, ${screenshotOps.length} скриншот-операций.`);

            let transaction;
            let updateSuccessful = false;
            let oldAlgorithmData = null;
            let finalAlgorithmData = null;
            const algorithmIdForRefs = isMainAlgo ? 'main' : algorithmIdStr;
            const screenshotOpResults = [];
            let finalSteps = JSON.parse(JSON.stringify(newStepsBase));

            try {
                if (isMainAlgo) {
                    oldAlgorithmData = algorithms?.main ? JSON.parse(JSON.stringify(algorithms.main)) : null;
                } else if (algorithms?.[section]) {
                    oldAlgorithmData = algorithms[section].find(a => String(a?.id) === String(algorithmIdStr)) || null;
                    if (oldAlgorithmData) oldAlgorithmData = JSON.parse(JSON.stringify(oldAlgorithmData));
                }
                if (oldAlgorithmData) console.log("[Save Algorithm v6] Старые данные для индекса получены.");
                else console.warn(`[Save Algorithm v6] Не найдены старые данные для ${section}/${algorithmIdStr}.`);
            } catch (e) { console.error("[Save Algorithm v6] Ошибка получения старых данных:", e); }

            try {
                if (!db) throw new Error("База данных недоступна");
                transaction = db.transaction(['algorithms', 'screenshots'], 'readwrite');
                const screenshotsStore = transaction.objectStore('screenshots');
                const algorithmsStore = transaction.objectStore('algorithms');
                console.log("[Save Algorithm v6 TX] Транзакция начата.");

                const deletePromises = [];
                const addPromises = [];
                const newScreenshotIdsMap = {};

                if (!isMainAlgo) {
                    screenshotOps.filter(op => op.action === 'delete').forEach(op => {
                        const { stepIndex, oldScreenshotId } = op;
                        if (oldScreenshotId === null || oldScreenshotId === undefined) return;
                        deletePromises.push(new Promise((resolve) => {
                            const request = screenshotsStore.delete(oldScreenshotId);
                            request.onsuccess = () => {
                                console.log(`[Save Algorithm v6 TX] Deleted screenshot ID: ${oldScreenshotId}`);
                                screenshotOpResults.push({ success: true, action: 'delete', oldId: oldScreenshotId, stepIndex });
                                resolve();
                            };
                            request.onerror = (e) => {
                                console.error(`[Save Algorithm v6 TX] Error deleting screenshot ID ${oldScreenshotId}:`, e.target.error);
                                screenshotOpResults.push({ success: false, action: 'delete', oldId: oldScreenshotId, stepIndex, error: e.target.error || new Error('Delete failed') });
                                resolve();
                            };
                        }));
                    });
                    if (deletePromises.length > 0) {
                        await Promise.all(deletePromises);
                        console.log("[Save Algorithm v6 TX] Delete operations finished.");
                        const deleteErrors = screenshotOpResults.filter(r => r.action === 'delete' && !r.success);
                        if (deleteErrors.length > 0) {
                            throw new Error(`Ошибка удаления скриншота: ${deleteErrors[0].error?.message || 'Unknown delete error'}`);
                        }
                    }

                    screenshotOps.filter(op => op.action === 'add').forEach(op => {
                        const { stepIndex, blob } = op;
                        if (!(blob instanceof Blob) || typeof stepIndex !== 'number' || stepIndex < 0 || !finalSteps[stepIndex]) return;

                        addPromises.push(new Promise((resolve) => {
                            const tempName = `${finalTitle}, изобр. ${Date.now() + Math.random()}`;
                            const record = { blob, parentId: algorithmIdForRefs, parentType: 'algorithm', stepIndex, name: tempName, uploadedAt: new Date().toISOString() };
                            const request = screenshotsStore.add(record);
                            request.onsuccess = e => {
                                const newId = e.target.result;
                                console.log(`[Save Algorithm v6 TX] Added screenshot, new ID: ${newId} for step ${stepIndex}`);
                                screenshotOpResults.push({ success: true, action: 'add', newId, stepIndex });
                                if (!newScreenshotIdsMap[stepIndex]) newScreenshotIdsMap[stepIndex] = [];
                                newScreenshotIdsMap[stepIndex].push(newId);
                                resolve();
                            };
                            request.onerror = e => {
                                console.error(`[Save Algorithm v6 TX] Error adding screenshot for step ${stepIndex}:`, e.target.error);
                                screenshotOpResults.push({ success: false, action: 'add', stepIndex, error: e.target.error || new Error('Add failed') });
                                resolve();
                            };
                        }));
                    });
                    if (addPromises.length > 0) {
                        await Promise.all(addPromises);
                        console.log("[Save Algorithm v6 TX] Add operations finished.");
                        const addErrors = screenshotOpResults.filter(r => r.action === 'add' && !r.success);
                        if (addErrors.length > 0) {
                            throw new Error(`Ошибка добавления скриншота: ${addErrors[0].error?.message || 'Unknown add error'}`);
                        }
                    }
                }

                let existingIdsToKeepMap = {};
                if (!isMainAlgo && oldAlgorithmData?.steps) {
                    const deletedIdsSet = new Set(screenshotOpResults.filter(r => r.success && r.action === 'delete').map(r => r.oldId));
                    oldAlgorithmData.steps.forEach((step, index) => {
                        if (Array.isArray(step.screenshotIds)) {
                            existingIdsToKeepMap[index] = step.screenshotIds.filter(id => !deletedIdsSet.has(id));
                        }
                    });
                }

                finalSteps = finalSteps.map((step, index) => {
                    const existingKeptIds = existingIdsToKeepMap[index] || [];
                    const newlyAddedIds = newScreenshotIdsMap[index] || [];
                    const finalIds = [...new Set([...existingKeptIds, ...newlyAddedIds])];

                    if (finalIds.length > 0) {
                        step.screenshotIds = finalIds;
                    } else {
                        delete step.screenshotIds;
                    }
                    delete step._tempScreenshotBlobs; delete step._screenshotsToDelete; delete step.existingScreenshotIds;
                    delete step.tempScreenshotsCount; delete step.deletedScreenshotIds;
                    return step;
                });
                console.log("[Save Algorithm v6 TX] Финальный массив шагов подготовлен.");

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
                    const algorithmIndex = algorithms[section].findIndex(a => String(a?.id) === String(algorithmIdStr));
                    const algoDataBase = {
                        id: algorithmIdForRefs, title: finalTitle, description: newDescription, steps: finalSteps, dateUpdated: timestamp
                    };
                    if (algorithmIndex !== -1) {
                        algorithms[section][algorithmIndex] = {
                            ...(algorithms[section][algorithmIndex] || {}),
                            ...algoDataBase,
                            dateAdded: algorithms[section][algorithmIndex]?.dateAdded || oldAlgorithmData?.dateAdded || timestamp
                        };
                        targetAlgorithmObject = algorithms[section][algorithmIndex];
                    } else {
                        console.warn(`[Save Algorithm v6 TX] Алгоритм ${algorithmIdStr} не найден в памяти ${section}. Создание нового.`);
                        targetAlgorithmObject = { ...algoDataBase, dateAdded: timestamp };
                        algorithms[section].push(targetAlgorithmObject);
                    }
                }
                finalAlgorithmData = JSON.parse(JSON.stringify(targetAlgorithmObject));
                console.log(`[Save Algorithm v6 TX] Объект алгоритма ${algorithmIdStr} обновлен в памяти.`);

                algorithmContainerToSave = { section: 'all', data: algorithms };
                console.log("[Save Algorithm v6 TX] Запрос put для всего контейнера 'algorithms'...");
                const putAlgoReq = algorithmsStore.put(algorithmContainerToSave);

                await new Promise((resolve, reject) => {
                    putAlgoReq.onerror = (e) => reject(e.target.error || new Error("Ошибка сохранения контейнера algorithms"));
                    transaction.oncomplete = () => {
                        console.log("[Save Algorithm v6 TX] Транзакция успешно завершена (oncomplete).");
                        updateSuccessful = true;
                        resolve();
                    };
                    transaction.onerror = (e) => {
                        console.error("[Save Algorithm v6 TX] ОШИБКА ТРАНЗАКЦИИ (onerror):", e.target.error);
                        updateSuccessful = false;
                        reject(e.target.error || new Error("Ошибка транзакции"));
                    };
                    transaction.onabort = (e) => {
                        console.warn("[Save Algorithm v6 TX] Транзакция ПРЕРВАНА (onabort):", e.target.error);
                        updateSuccessful = false;
                        reject(e.target.error || new Error("Транзакция прервана"));
                    };
                });

            } catch (error) {
                console.error(`[Save Algorithm v6 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА сохранения для ${algorithmIdStr}:`, error);
                if (transaction && transaction.readyState !== 'done' && transaction.abort && !transaction.error) {
                    try { transaction.abort(); console.log("[Save Algorithm v6] Транзакция отменена в catch."); }
                    catch (e) { console.error("[Save Algorithm v6] Ошибка при отмене транзакции в catch:", e); }
                }
                updateSuccessful = false;
                if (oldAlgorithmData && typeof algorithms === 'object' && algorithms !== null) {
                    console.warn("[Save Algorithm v6] Восстановление состояния 'algorithms' в памяти из-за ошибки...");
                    if (isMainAlgo) { algorithms.main = oldAlgorithmData; }
                    else if (algorithms[section]) {
                        const indexToRestore = algorithms[section].findIndex(a => String(a?.id) === String(algorithmIdStr));
                        if (indexToRestore !== -1) { algorithms[section][indexToRestore] = oldAlgorithmData; }
                        else if (oldAlgorithmData.id) {
                            algorithms[section].push(oldAlgorithmData);
                            console.warn(`[Save Algorithm v6] Старый алгоритм ${algorithmIdStr} добавлен обратно.`);
                        }
                    }
                    console.log("[Save Algorithm v6] Состояние 'algorithms' в памяти восстановлено (попытка).");
                }
                showNotification(`Произошла критическая ошибка при сохранении: ${error.message || error}`, "error");
            } finally {
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
                }
            }

            if (updateSuccessful) {
                console.log(`[Save Algorithm v6 (Robust TX)] Алгоритм ${algorithmIdStr} успешно сохранен.`);
                if (typeof updateSearchIndex === 'function' && finalAlgorithmData?.id) {
                    const indexId = isMainAlgo ? 'main' : finalAlgorithmData.id;
                    updateSearchIndex('algorithms', indexId, finalAlgorithmData, 'update', oldAlgorithmData)
                        .then(() => console.log(`[Save Algorithm v6] Индекс обновлен для ${indexId}.`))
                        .catch(indexError => console.error(`[Save Algorithm v6] Ошибка обновления индекса для ${indexId}:`, indexError));
                } else { console.warn(`[Save Algorithm v6] Не удалось обновить индекс для ${algorithmIdStr}.`); }
                try {
                    if (isMainAlgo && typeof renderMainAlgorithm === 'function') { await renderMainAlgorithm(); }
                    else if (!isMainAlgo && typeof renderAlgorithmCards === 'function') { renderAlgorithmCards(section); }
                } catch (renderError) { console.error("[Save Algorithm v6] Ошибка обновления UI:", renderError); }
                showNotification("Алгоритм успешно сохранен.");
                initialEditState = null;
                editModal.classList.add('hidden');
            } else {
                console.error(`[Save Algorithm v6 (Robust TX)] Сохранение алгоритма ${algorithmIdStr} НЕ УДАЛОСЬ.`);
            }
        }


        function extractStepsDataFromEditForm(containerElement, isMainAlgorithm = false) {
            const parseExample = (val) => {
                if (!val) return undefined;
                const lines = val.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length === 0) return undefined;
                const startsWithMarker = /^\s*[-*+•]/.test(lines[0]);
                const isListStrict = lines.length > 1 && lines.slice(1).every(l => /^\s*[-*+•]/.test(l));
                const potentialIntro = (lines.length > 0 && !startsWithMarker) ? lines[0] : null;
                const isListLikely = startsWithMarker || (potentialIntro && isListStrict);
                if (isListLikely) {
                    const items = (potentialIntro ? lines.slice(1) : lines).map(l => l.replace(/^\s*[-*+•]\s*/, '').trim()).filter(item => item);
                    if (items.length > 0) { const listExample = { type: 'list', items: items }; if (potentialIntro) listExample.intro = potentialIntro; return listExample; }
                    else if (potentialIntro) return potentialIntro;
                    else return undefined;
                }
                return val;
            };

            const stepsData = {
                steps: [],
                screenshotOps: [],
                isValid: true
            };

            if (!containerElement) {
                console.error("extractStepsDataFromEditForm: Контейнер не передан.");
                stepsData.isValid = false;
                return stepsData;
            }

            const stepDivs = containerElement.querySelectorAll('.edit-step');

            stepDivs.forEach((stepDiv, formIndex) => {
                const titleInput = stepDiv.querySelector('.step-title');
                const descInput = stepDiv.querySelector('.step-desc');
                const exampleInput = isMainAlgorithm ? stepDiv.querySelector('.step-example') : null;

                const title = titleInput?.value.trim() || '';
                const description = descInput?.value.trim() || '';

                if (!title && !description) {
                    console.warn(`Пропуск пустого шага (индекс в форме ${formIndex + 1}) при извлечении данных из формы редактирования.`);
                    return;
                }

                const stepIndexForOps = stepsData.steps.length;

                const step = { title, description };

                if (isMainAlgorithm && exampleInput) {
                    const exampleValue = exampleInput.value.trim();
                    step.example = parseExample(exampleValue);
                }

                if (stepDiv.dataset.stepType) {
                    step.type = stepDiv.dataset.stepType;
                }

                if (!isMainAlgorithm) {
                    console.log(`  > _tempScreenshotBlobs:`, stepDiv._tempScreenshotBlobs);
                    console.log(`  > dataset.screenshotsToDelete:`, stepDiv.dataset.screenshotsToDelete);
                    console.log(`  > dataset.existingScreenshotIds:`, stepDiv.dataset.existingScreenshotIds);

                    if (stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs)) {
                        stepDiv._tempScreenshotBlobs.forEach((blobInfo, blobIndex) => {
                            if (blobInfo instanceof Blob) {
                                console.log(`  > Обнаружен новый Blob [${blobIndex}]:`, { size: blobInfo.size, type: blobInfo.type });
                                stepsData.screenshotOps.push({
                                    stepIndex: stepIndexForOps,
                                    action: 'add',
                                    blob: blobInfo,
                                    oldScreenshotId: null
                                });
                            } else {
                                console.warn(`  > Обнаружен не-Blob элемент в _tempScreenshotBlobs [${blobIndex}]:`, blobInfo);
                            }
                        });
                    } else {
                        console.log(`  > _tempScreenshotBlobs отсутствует или не массив.`);
                    }

                    const idsToDeleteStr = stepDiv.dataset.screenshotsToDelete;
                    const idsToDeleteSet = new Set();
                    if (idsToDeleteStr) {
                        const idsToDelete = idsToDeleteStr.split(',')
                            .map(idStr => parseInt(idStr.trim(), 10))
                            .filter(idNum => !isNaN(idNum));
                        console.log(`  > ID к удалению из dataset:`, idsToDelete);
                        idsToDelete.forEach(idToDelete => {
                            stepsData.screenshotOps.push({
                                stepIndex: stepIndexForOps,
                                action: 'delete',
                                blob: null,
                                oldScreenshotId: idToDelete
                            });
                            idsToDeleteSet.add(idToDelete);
                            console.log(`  > Запланирована операция 'delete' для скриншота ID ${idToDelete}.`);
                        });
                    } else {
                        console.log(`  > Нет ID к удалению в dataset.`);
                    }

                    const existingScreenshotIdsStr = stepDiv.dataset.existingScreenshotIds || '';
                    let idsToKeep = [];
                    if (existingScreenshotIdsStr) {
                        const existingIds = existingScreenshotIdsStr.split(',')
                            .map(idStr => parseInt(idStr.trim(), 10))
                            .filter(idNum => !isNaN(idNum));

                        console.log(`  > Существующие ID из dataset:`, existingIds);
                        idsToKeep = existingIds.filter(id => !idsToDeleteSet.has(id));
                    }

                    step.screenshotIds = idsToKeep;
                    console.log(`  > Итоговый step.screenshotIds (сохраняемые):`, idsToKeep);
                    if (idsToKeep.length > 0) {
                        console.log(`  > Сохраняются существующие ID скриншотов:`, idsToKeep);
                    } else if (existingScreenshotIdsStr) {
                        console.log(`  > Все существующие скриншоты помечены на удаление или отсутствовали/были невалидны.`);
                    } else {
                        console.log(`  > Существующие скриншоты не были найдены изначально.`);
                    }

                }
                stepsData.steps.push(step);
            });

            stepsData.isValid = stepsData.steps.length > 0 || isMainAlgorithm;
            if (!stepsData.isValid) {
                console.warn("extractStepsDataFromEditForm: Не найдено валидных шагов (для не-главного алгоритма).");
            } else if (stepsData.steps.length === 0 && isMainAlgorithm) {
                console.info("extractStepsDataFromEditForm: Главный алгоритм не содержит шагов (допустимо при редактировании).");
            }


            return stepsData;
        }


        function getSectionName(section) {
            switch (section) {
                case 'program': return 'Программа 1С/УП';
                case 'skzi': return 'СКЗИ';
                case 'lk1c': return '1СО ЛК';
                case 'webReg': return 'Веб-Регистратор';
                default: return 'Основной';
            }
        }


        function showAddModal(section) {
            initialAddState = null;

            const addModal = document.getElementById('addModal');
            if (!addModal) {
                console.error("Модальное окно добавления #addModal не найдено.");
                showNotification("Ошибка: Не найдено окно добавления.", "error");
                return;
            }

            const addModalTitle = document.getElementById('addModalTitle');
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');
            const saveButton = document.getElementById('saveNewAlgorithmBtn');

            if (!addModalTitle || !newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer || !saveButton) {
                console.error("Show Add Modal failed: Missing required elements (#addModalTitle, #newAlgorithmTitle, #newAlgorithmDesc, #newSteps, #saveNewAlgorithmBtn).");
                showNotification("Ошибка интерфейса: не найдены элементы окна добавления.", "error");
                return;
            }

            addModalTitle.textContent = 'Новый алгоритм для раздела: ' + getSectionName(section);
            newAlgorithmTitle.value = '';
            newAlgorithmDesc.value = '';
            newStepsContainer.innerHTML = '';
            newStepsContainer.className = 'space-y-4';

            const firstStepDiv = document.createElement('div');
            firstStepDiv.className = 'edit-step p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4';
            firstStepDiv.innerHTML = createStepElementHTML(1, false, true);
            firstStepDiv.dataset.stepIndex = 0;
            newStepsContainer.appendChild(firstStepDiv);

            const firstDeleteBtn = firstStepDiv.querySelector('.delete-step');
            if (firstDeleteBtn) {
                if (typeof attachStepDeleteHandler === 'function') {
                    attachStepDeleteHandler(firstDeleteBtn, firstStepDiv, newStepsContainer, section, 'add', false);
                } else {
                    console.error("Функция attachStepDeleteHandler не найдена в showAddModal!");
                    firstDeleteBtn.disabled = true;
                }
            } else {
                console.warn("Не удалось найти кнопку удаления для первого шага в showAddModal.");
            }

            if (typeof attachScreenshotHandlers === 'function') {
                attachScreenshotHandlers(firstStepDiv);
            } else {
                console.error("Функция attachScreenshotHandlers не найдена в showAddModal!");
            }

            addModal.dataset.section = section;
            saveButton.disabled = false;
            saveButton.innerHTML = 'Сохранить';

            captureInitialAddState();
            addModal.classList.remove('hidden');

            setTimeout(() => newAlgorithmTitle.focus(), 50);
            console.log(`showAddModal: Окно для секции '${section}' открыто.`);
        }


        function addNewStep() {
            const containerId = 'newSteps';
            const newStepsContainer = document.getElementById(containerId);
            if (!newStepsContainer) {
                console.error("Контейнер #newSteps не найден для добавления шага.");
                showNotification("Ошибка: Не удалось найти контейнер для нового шага.", "error");
                return;
            }
            const addModal = document.getElementById('addModal');
            if (!addModal) {
                console.error("Модальное окно добавления #addModal не найдено.");
                showNotification("Ошибка: Не найдено окно добавления.", "error");
                return;
            }
            const section = addModal.dataset.section;
            if (!section) {
                console.error("Не удалось определить секцию в addNewStep (dataset.section отсутствует).");
                showNotification("Ошибка: Не удалось определить раздел для нового шага.", "error");
                return;
            }

            const stepCount = newStepsContainer.children.length;
            const isMainAlgorithm = false;

            const placeholder = newStepsContainer.querySelector('p.text-gray-500');
            if (placeholder) {
                placeholder.remove();
            }

            const stepDiv = document.createElement('div');
            stepDiv.className = 'edit-step p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4';
            stepDiv.innerHTML = createStepElementHTML(stepCount + 1, isMainAlgorithm, true);
            stepDiv.dataset.stepIndex = stepCount;

            const deleteBtn = stepDiv.querySelector('.delete-step');
            if (deleteBtn) {
                if (typeof attachStepDeleteHandler === 'function') {
                    attachStepDeleteHandler(deleteBtn, stepDiv, newStepsContainer, section, 'add', false);
                } else {
                    console.error("Функция attachStepDeleteHandler не найдена в addNewStep!");
                    deleteBtn.disabled = true;
                    deleteBtn.title = "Функция удаления недоступна";
                }
            } else {
                console.warn("Не удалось найти кнопку удаления для нового шага в addNewStep.");
            }

            if (typeof attachScreenshotHandlers === 'function') {
                attachScreenshotHandlers(stepDiv);
            } else {
                console.error("Функция attachScreenshotHandlers не найдена в addNewStep!");
            }

            newStepsContainer.appendChild(stepDiv);

            if (typeof updateStepNumbers === 'function') {
                updateStepNumbers(newStepsContainer);
            } else {
                console.error("Функция updateStepNumbers не найдена в addNewStep!");
            }

            stepDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const newTitleInput = stepDiv.querySelector('.step-title');
            if (newTitleInput) {
                setTimeout(() => newTitleInput.focus(), 100);
            }

            console.log(`addNewStep: Добавлен шаг ${stepCount + 1} в секцию ${section}. Отслеживание изменений через hasChanges('add').`);
        }


        function attachScreenshotHandlers(stepElement) {
            const addBtn = stepElement.querySelector('.add-screenshot-btn');
            const fileInput = stepElement.querySelector('.screenshot-input');
            const thumbnailsContainer = stepElement.querySelector('#screenshotThumbnailsContainer');

            if (!addBtn || !fileInput || !thumbnailsContainer) {
                console.warn("attachScreenshotHandlers: Не удалось найти все элементы для управления скриншотами в шаге:", stepElement);
                return;
            }

            if (!stepElement._tempScreenshotBlobs) {
                stepElement._tempScreenshotBlobs = [];
            }
            if (stepElement.dataset.screenshotsToDelete === undefined) {
                stepElement.dataset.screenshotsToDelete = '';
            }

            const addBlobToStep = async (blob) => {
                if (!Array.isArray(stepElement._tempScreenshotBlobs)) { stepElement._tempScreenshotBlobs = []; }
                try {
                    const processedBlob = await processImageFile(blob);
                    if (!processedBlob) throw new Error("Обработка изображения не удалась.");

                    const tempIndex = stepElement._tempScreenshotBlobs.length;
                    stepElement._tempScreenshotBlobs.push(processedBlob);

                    renderTemporaryThumbnail(processedBlob, tempIndex, thumbnailsContainer, stepElement);

                    console.log(`Временный Blob (индекс ${tempIndex}) добавлен и отрисована миниатюра.`);
                    if (typeof isUISettingsDirty !== 'undefined') { isUISettingsDirty = true; } else if (typeof isDirty !== 'undefined') { isDirty = true; }
                    else { console.warn("Не удалось установить флаг изменений (isUISettingsDirty/isDirty не найдены)."); }
                } catch (error) {
                    console.error("Ошибка обработки или добавления Blob в addBlobToStep:", error);
                    showNotification(`Ошибка обработки изображения: ${error.message || 'Неизвестная ошибка'}`, "error");
                }
            };

            if (!addBtn.dataset.listenerAttached) {
                addBtn.addEventListener('click', () => { fileInput.click(); });
                addBtn.dataset.listenerAttached = 'true';
            }
            if (!fileInput.dataset.listenerAttached) {
                fileInput.addEventListener('change', (event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) {
                        Array.from(files).forEach(file => { handleImageFileForStepProcessing(file, addBlobToStep, addBtn); });
                    }
                    event.target.value = null;
                });
                fileInput.dataset.listenerAttached = 'true';
            }
            if (!stepElement.dataset.pasteListenerAttached) {
                stepElement.addEventListener('paste', (event) => {
                    const items = event.clipboardData?.items;
                    if (!items) return;
                    let imageFile = null;
                    for (let i = 0; i < items.length; i++) { if (items[i].kind === 'file' && items[i].type.startsWith('image/')) { imageFile = items[i].getAsFile(); break; } }
                    if (imageFile) { event.preventDefault(); handleImageFileForStepProcessing(imageFile, addBlobToStep, addBtn); }
                });
                stepElement.dataset.pasteListenerAttached = 'true';
            }

            console.log(`Обработчики событий для *новых* скриншотов настроены для шага (контейнер: #${thumbnailsContainer?.id || '?'}). Drag&Drop отключен.`);
        }


        function renderTemporaryThumbnail(blob, tempIndex, container, stepEl) {
            if (!container || !stepEl) {
                console.error("[renderTemporaryThumbnail] Контейнер или родительский элемент (stepEl) не предоставлены.");
                return;
            }
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'relative w-16 h-12 group border-2 border-dashed border-green-500 dark:border-green-400 rounded overflow-hidden shadow-sm screenshot-thumbnail temporary';
            thumbDiv.dataset.tempIndex = tempIndex;
            const img = document.createElement('img');
            img.className = 'w-full h-full object-contain bg-gray-200 dark:bg-gray-600';
            img.alt = `Новый скриншот ${tempIndex + 1}`;
            let objectURL = null;

            try {
                objectURL = URL.createObjectURL(blob);
                img.dataset.objectUrl = objectURL;
                console.log(`[renderTemporaryThumbnail] Создан Object URL для temp ${tempIndex}: ${objectURL}`);

                img.onload = () => {
                    console.log(`[renderTemporaryThumbnail] Изображение (temp ${tempIndex}) загружено.`);
                    img.dataset.objectUrlRevoked = 'false';
                };

                img.onerror = () => {
                    console.error(`[renderTemporaryThumbnail] Ошибка загрузки изображения (temp ${tempIndex}). URL: ${objectURL}`);
                    img.alt = "Ошибка";
                    if (img.dataset.objectUrl && img.dataset.objectUrlRevoked !== 'true') {
                        try {
                            URL.revokeObjectURL(img.dataset.objectUrl);
                            console.log(`[renderTemporaryThumbnail] Освобожден URL из-за ошибки загрузки: ${img.dataset.objectUrl}`);
                            img.dataset.objectUrlRevoked = 'true';
                        } catch (e) {
                            console.warn("Ошибка освобождения URL при onerror:", e);
                        }
                        delete img.dataset.objectUrl;
                    }
                };
                img.src = objectURL;

            } catch (e) {
                console.error(`[renderTemporaryThumbnail] Ошибка создания Object URL для temp ${tempIndex}:`, e);
                img.alt = "Ошибка URL";
                if (objectURL) {
                    try { URL.revokeObjectURL(objectURL); } catch (revokeError) { console.warn("Ошибка освобождения URL при catch:", revokeError); }
                    objectURL = null;
                }
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'absolute top-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-1 z-10 focus:outline-none focus:ring-1 focus:ring-white delete-temp-screenshot-btn';
            deleteBtn.title = 'Удалить этот новый скриншот';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';

            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                const indexToRemove = parseInt(thumbDiv.dataset.tempIndex, 10);
                if (!isNaN(indexToRemove) && stepEl._tempScreenshotBlobs && stepEl._tempScreenshotBlobs[indexToRemove] !== undefined) {
                    stepEl._tempScreenshotBlobs.splice(indexToRemove, 1);
                    console.log(`Удален временный скриншот с tempIndex ${indexToRemove} из массива.`);

                    const urlToRevoke = img.dataset.objectUrl;
                    if (urlToRevoke && img.dataset.objectUrlRevoked !== 'true') {
                        try {
                            URL.revokeObjectURL(urlToRevoke);
                            console.log(`[renderTemporaryThumbnail - deleteBtn] Освобожден URL ${urlToRevoke}`);
                        } catch (revokeError) {
                            console.warn("Ошибка освобождения URL при удалении временной миниатюры:", revokeError);
                        }
                    }

                    thumbDiv.remove();

                    container.querySelectorAll('div.temporary[data-temp-index]').forEach((remainingThumb, newIndex) => {
                        remainingThumb.dataset.tempIndex = newIndex;
                    });

                    if (typeof isUISettingsDirty !== 'undefined') { isUISettingsDirty = true; }
                    else if (typeof isDirty !== 'undefined') { isDirty = true; }

                } else {
                    console.warn(`Не удалось удалить временный скриншот, индекс ${indexToRemove} некорректен или элемент уже удален.`);
                    if (thumbDiv.parentNode === container) {
                        thumbDiv.remove();
                    }
                }
            };
            thumbDiv.appendChild(img);
            thumbDiv.appendChild(deleteBtn);
            container.appendChild(thumbDiv);
        }


        async function handleImageFileForStepProcessing(fileOrBlob, addCallback, buttonElement = null) {
            if (!(fileOrBlob instanceof Blob)) {
                console.error("handleImageFileForStepProcessing: Предоставленные данные не являются файлом или Blob.");
                if (typeof showNotification === 'function') showNotification("Ошибка: Некорректный формат файла.", "error");
                return;
            }
            if (typeof addCallback !== 'function') {
                console.error("handleImageFileForStepProcessing: Не передан или не является функцией обязательный addCallback.");
                if (typeof showNotification === 'function') showNotification("Внутренняя ошибка: Не задан обработчик добавления файла.", "error");
                return;
            }
            if (!fileOrBlob.type.startsWith('image/')) {
                console.warn(`handleImageFileForStepProcessing: Тип файла '${fileOrBlob.type}' не является изображением. Попытка обработки может не удасться.`);
                if (typeof showNotification === 'function') showNotification("Выбранный файл не является изображением.", "warning");
            }

            let originalButtonHTML = null;
            let wasButtonDisabled = false;

            if (buttonElement instanceof HTMLElement) {
                originalButtonHTML = buttonElement.innerHTML;
                wasButtonDisabled = buttonElement.disabled;
                buttonElement.disabled = true;
                buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Обработка...';
                console.log(`[handleImageFileProcessing] Кнопка ${buttonElement.className} заблокирована, показан спиннер.`);
            }

            try {
                console.log("[handleImageFileProcessing] Вызов addCallback...");
                await addCallback(fileOrBlob);
                console.log("[handleImageFileProcessing] addCallback успешно выполнен.");

            } catch (error) {
                console.error("Ошибка внутри addCallback при обработке изображения:", error);
                if (typeof showNotification === 'function') {
                    showNotification(`Ошибка обработки изображения: ${error.message || 'Неизвестная ошибка'}`, "error");
                }
            } finally {
                if (buttonElement instanceof HTMLElement) {
                    buttonElement.disabled = wasButtonDisabled;
                    buttonElement.innerHTML = originalButtonHTML;
                    console.log(`[handleImageFileProcessing] Кнопка ${buttonElement.className} разблокирована, HTML восстановлен.`);
                }
            }
        }


        function renderScreenshotIcon(algorithmId, stepIndex, hasScreenshots = false) {
            const safeAlgorithmId = typeof algorithmId === 'string' || typeof algorithmId === 'number' ? String(algorithmId).replace(/"/g, '') : 'unknown';
            const safeStepIndex = typeof stepIndex === 'number' ? String(stepIndex).replace(/"/g, '') : 'unknown';

            if (safeAlgorithmId === 'unknown' || safeStepIndex === 'unknown') {
                console.warn(`renderScreenshotIcon: Получены невалидные ID алгоритма (${algorithmId}) или индекс шага (${stepIndex}). Кнопка не будет работать корректно.`);
                return '';
            }

            const isDisabled = !hasScreenshots;
            const titleAttributeText = isDisabled ? "Нет изображений для этого шага" : "Просмотреть изображения для этого алгоритма";
            const iconHtml = '<i class="fas fa-images mr-1"></i>';
            const buttonText = "Визуальные шаги";
            const disabledClasses = isDisabled
                ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600'
                : 'hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700';

            const buttonClasses = `
                                    view-screenshot-btn
                                    ml-2 px-2 py-1
                                    text-sm font-medium
                                    rounded-md border
                                    transition-colors duration-150 ease-in-out
                                    inline-flex items-center align-middle
                                    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500
                                    ${disabledClasses}
                                `;

            return `
                    <button type="button"
                            class="${buttonClasses.replace(/\s+/g, ' ').trim()}"
                            data-algorithm-id="${safeAlgorithmId}"
                            data-step-index="${safeStepIndex}"
                            title="${titleAttributeText}"
                            ${isDisabled ? 'disabled' : ''}>
                        ${iconHtml}
                        <span>${buttonText}</span>
                    </button>
                `;
        }


        async function saveNewAlgorithm() {
            const addModal = document.getElementById('addModal');
            const section = addModal?.dataset.section;
            const newAlgorithmTitleInput = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDescInput = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');
            const saveButton = document.getElementById('saveNewAlgorithmBtn');

            if (!addModal || !section || !newAlgorithmTitleInput || !newAlgorithmDescInput || !newStepsContainer || !saveButton) {
                console.error("saveNewAlgorithm v4 (TX Fix): Missing required elements.");
                showNotification("Ошибка: Не найдены компоненты формы.", "error");
                if (saveButton) saveButton.disabled = false; return;
            }
            if (section === 'main') { console.error("saveNewAlgorithm v4: Попытка добавить 'main'."); showNotification("Нельзя добавить главный алгоритм.", "error"); if (saveButton) saveButton.disabled = false; return; }

            const title = newAlgorithmTitleInput.value.trim();
            const description = newAlgorithmDescInput.value.trim();
            if (!title) { showNotification('Введите название алгоритма', 'error'); newAlgorithmTitleInput.focus(); if (saveButton) saveButton.disabled = false; return; }

            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

            const { steps: newStepsBase, screenshotOps, isValid } = extractStepsDataFromEditForm(newStepsContainer, false);
            if (!isValid) { showNotification('Алгоритм должен содержать хотя бы один шаг.', 'error'); saveButton.disabled = false; saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить'; return; }
            console.log(`[Save New Algorithm v4] Извлечено: ${newStepsBase.length} шагов, ${screenshotOps.length} скриншот-операций.`);

            const newAlgorithmId = `${section}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            console.log(`[Save New Algorithm v4 (TX Fix)] Start. ID: ${newAlgorithmId}, Section: ${section}`);

            let transaction;
            let saveSuccessful = false;
            let newAlgorithmData = null;
            const screenshotOpResults = [];
            const newScreenshotIdsMap = {};
            let finalSteps = JSON.parse(JSON.stringify(newStepsBase));

            try {
                if (!db) throw new Error("База данных недоступна");
                transaction = db.transaction(['algorithms', 'screenshots'], 'readwrite');
                const screenshotsStore = transaction.objectStore('screenshots');
                const algorithmsStore = transaction.objectStore('algorithms');
                console.log("[Save New Algorithm v4 TX] Транзакция начата.");

                const addPromises = [];

                if (screenshotOps.length > 0) {
                    console.log(`[Save New Algorithm v4 TX] Обработка ${screenshotOps.length} операций добавления скриншотов для ID: ${newAlgorithmId}`);
                    screenshotOps.forEach((op) => {
                        if (op.action === 'add' && op.blob instanceof Blob) {
                            const { stepIndex, blob } = op;
                            if (typeof stepIndex !== 'number' || stepIndex < 0 || !finalSteps[stepIndex]) {
                                console.warn(`[Save New Algorithm v4 TX] Пропуск add из-за неверного stepIndex (${stepIndex}):`, op);
                                screenshotOpResults.push({ success: false, action: 'add', stepIndex, error: new Error('Invalid stepIndex') });
                                return;
                            }
                            addPromises.push(new Promise((resolve) => {
                                const tempName = `${title}, изобр. ${Date.now() + Math.random()}`;
                                const record = { blob, parentId: newAlgorithmId, parentType: 'algorithm', stepIndex, name: tempName, uploadedAt: new Date().toISOString() };
                                const request = screenshotsStore.add(record);
                                request.onsuccess = e => {
                                    const newId = e.target.result;
                                    console.log(`[Save New Algorithm v4 TX] Added screenshot, new ID: ${newId} for step ${stepIndex}`);
                                    screenshotOpResults.push({ success: true, action: 'add', newId, stepIndex });
                                    if (!newScreenshotIdsMap[stepIndex]) newScreenshotIdsMap[stepIndex] = [];
                                    newScreenshotIdsMap[stepIndex].push(newId);
                                    resolve();
                                };
                                request.onerror = e => {
                                    console.error(`[Save New Algorithm v4 TX] Error adding screenshot for step ${stepIndex}:`, e.target.error);
                                    screenshotOpResults.push({ success: false, action: 'add', stepIndex, error: e.target.error || new Error('Add failed') });
                                    resolve();
                                };
                            }));
                        } else if (op.action !== 'add') {
                            console.warn(`[Save New Algorithm v4 TX] Обнаружена неожиданная операция '${op.action}' при добавлении. Игнорируется.`);
                            screenshotOpResults.push({ success: false, action: op.action || 'unknown', stepIndex: op.stepIndex, error: new Error('Unexpected operation') });
                        }
                    });

                    if (addPromises.length > 0) {
                        await Promise.all(addPromises);
                        console.log("[Save New Algorithm v4 TX] Add screenshot operations finished.");
                        const addErrors = screenshotOpResults.filter(r => r.action === 'add' && !r.success);
                        if (addErrors.length > 0) {
                            throw new Error(`Ошибка добавления скриншота: ${addErrors[0].error?.message || 'Unknown add error'}`);
                        }
                    }
                }

                finalSteps = finalSteps.map((step, index) => {
                    const addedIds = newScreenshotIdsMap[index];
                    if (addedIds && addedIds.length > 0) {
                        step.screenshotIds = [...new Set(addedIds)];
                    } else {
                        delete step.screenshotIds;
                    }
                    delete step._tempScreenshotBlobs; delete step._screenshotsToDelete; delete step.existingScreenshotIds;
                    delete step.tempScreenshotsCount; delete step.deletedScreenshotIds;
                    return step;
                });
                console.log("[Save New Algorithm v4 TX] Финальный массив шагов подготовлен.");

                newAlgorithmData = { id: newAlgorithmId, title, description, steps: finalSteps, dateAdded: new Date().toISOString() };

                if (!algorithms[section] || !Array.isArray(algorithms[section])) {
                    algorithms[section] = [];
                }
                algorithms[section].push(JSON.parse(JSON.stringify(newAlgorithmData)));
                console.log(`Новый алгоритм ${newAlgorithmId} добавлен в память [${section}].`);

                const algorithmContainerToSave = { section: 'all', data: algorithms };
                console.log("[Save New Algorithm v4 TX] Запрос put для всего контейнера 'algorithms'...");
                const putAlgoReq = algorithmsStore.put(algorithmContainerToSave);

                await new Promise((resolve, reject) => {
                    putAlgoReq.onerror = (e) => reject(e.target.error || new Error("Ошибка сохранения контейнера algorithms"));
                    transaction.oncomplete = () => {
                        console.log("[Save New Algorithm v4 TX] Транзакция успешно завершена (oncomplete).");
                        saveSuccessful = true;
                        resolve();
                    };
                    transaction.onerror = (e) => {
                        console.error("[Save New Algorithm v4 TX] ОШИБКА ТРАНЗАКЦИИ (onerror):", e.target.error);
                        saveSuccessful = false;
                        reject(e.target.error || new Error("Ошибка транзакции"));
                    };
                    transaction.onabort = (e) => {
                        console.warn("[Save New Algorithm v4 TX] Транзакция ПРЕРВАНА (onabort):", e.target.error);
                        saveSuccessful = false;
                        reject(e.target.error || new Error("Транзакция прервана"));
                    };
                });

            } catch (error) {
                console.error(`[Save New Algorithm v4 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА при добавлении ${newAlgorithmId}:`, error);
                if (transaction && transaction.abort && transaction.readyState !== 'done') {
                    try { transaction.abort(); console.log("[Save New Algorithm v4] Транзакция отменена в catch."); }
                    catch (e) { console.error("[Save New Algorithm v4] Ошибка при отмене транзакции в catch:", e); }
                }
                saveSuccessful = false;
                if (newAlgorithmId && algorithms?.[section]) {
                    const addedIndex = algorithms[section].findIndex(a => a.id === newAlgorithmId);
                    if (addedIndex > -1) {
                        algorithms[section].splice(addedIndex, 1);
                        console.log(`Алгоритм ${newAlgorithmId} удален из памяти из-за ошибки.`);
                    }
                }
                showNotification(`Произошла критическая ошибка при сохранении: ${error.message || error}`, "error");
            } finally {
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
                }
            }

            if (saveSuccessful) {
                console.log(`[Save New Algorithm v4 (Robust TX)] Алгоритм ${newAlgorithmId} успешно сохранен.`);
                if (typeof updateSearchIndex === 'function' && newAlgorithmData?.id) {
                    updateSearchIndex('algorithms', newAlgorithmData.id, newAlgorithmData, 'add')
                        .then(() => console.log(`[Save New Algorithm v4] Индекс обновлен для ${newAlgorithmData.id}.`))
                        .catch(indexError => console.error(`[Save New Algorithm v4] Ошибка обновления индекса для ${newAlgorithmData.id}:`, indexError));
                } else { console.warn("[Save New Algorithm v4] updateSearchIndex не найдена или ID нового алгоритма отсутствует."); }
                if (typeof renderAlgorithmCards === 'function') { renderAlgorithmCards(section); }
                else { console.warn("[Save New Algorithm v4] renderAlgorithmCards не найдена."); }

                showNotification("Новый алгоритм успешно добавлен.");
                initialAddState = null;
                addModal.classList.add('hidden');
                const form = addModal.querySelector('#addAlgorithmForm');
                if (form) form.reset();
                if (newStepsContainer) newStepsContainer.innerHTML = '';

            } else {
                console.error(`[Save New Algorithm v4 (Robust TX)] Добавление нового алгоритма (${newAlgorithmId}) НЕ УДАЛОСЬ.`);
            }
        }


        // ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
        async function appInit() {
            let dbInitialized = false;
            try {
                await initDB();
                dbInitialized = true;
                console.log("appInit: База данных успешно инициализирована.");

                await Promise.all([
                    loadCategoryInfo(),
                    loadFromIndexedDB()
                ]);
                console.log("appInit: Основные данные загружены.");

            } catch (error) {
                console.error("Ошибка во время инициализации данных в appInit:", error);
                if (!dbInitialized) {
                    console.warn("appInit: Инициализация БД не удалась. Приложение может работать некорректно.");
                    showNotification("Критическая ошибка: Не удалось инициализировать базу данных.", "error");
                } else {
                    console.warn("appInit: Ошибка при загрузке данных из БД. Используются значения по умолчанию, где возможно.");
                }
                if (!algorithms || !algorithms.main || !algorithms.main.steps || algorithms.main.steps.length === 0) {
                    console.error("CRITICAL (appInit catch): Данные главного алгоритма отсутствуют! Применение стандартных.");
                    if (typeof algorithms === 'undefined') algorithms = {};
                    const defaultAlgo = { id: "main", title: "Главный алгоритм работы", steps: [] };
                    algorithms.main = JSON.parse(JSON.stringify(defaultAlgo));
                    if (typeof renderMainAlgorithm === 'function') renderMainAlgorithm();
                    else console.error("Функция renderMainAlgorithm не найдена для отображения дефолта в catch!");
                }
            }

            // Инициализация подсистем UI
            console.log("appInit: Инициализация подсистем UI...");
            initSearchSystem();
            initBookmarkSystem();
            initCibLinkSystem();
            initViewToggles();
            initReglamentsSystem();
            initClientDataSystem();
            initExternalLinksSystem();
            initUICustomization();
            console.log("appInit: Подсистемы UI инициализированы.");

            return dbInitialized;
        }


        // СИСТЕМА ПОИСКА
        function initSearchSystem() {

            const searchInput = document.getElementById('searchInput');
            const searchResults = document.getElementById('searchResults');
            const toggleAdvancedSearchBtn = document.getElementById('toggleAdvancedSearch');
            const advancedSearchOptions = document.getElementById('advancedSearchOptions');
            const clearSearchInputBtn = document.getElementById('clearSearchInputBtn');

            if (!searchInput || !searchResults || !toggleAdvancedSearchBtn || !advancedSearchOptions || !clearSearchInputBtn) {
                console.error('Search system initialization failed: one or more required elements not found.');
                return;
            }

            const toggleResultsVisibility = () => {
                searchResults.classList.toggle('hidden', !searchInput.value && searchInput !== document.activeElement);
            };

            const executeSearch = async () => {
                const query = searchInput.value;
                const MIN_SEARCH_LENGTH = 3;

                if (!query && searchInput !== document.activeElement) {
                    searchResults.classList.add('hidden');
                    return;
                }

                if (!query || query.length < MIN_SEARCH_LENGTH) {
                    if (searchInput === document.activeElement) {
                        searchResults.innerHTML = `<div class="p-3 text-center text-gray-500">Введите минимум ${MIN_SEARCH_LENGTH} символа...</div>`;
                        searchResults.classList.remove('hidden');
                    } else {
                        searchResults.classList.add('hidden');
                    }
                    return;
                }


                searchResults.classList.remove('hidden');
                searchResults.innerHTML = '<div class="p-3 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Идет поиск...</div>';

                try {
                    await performSearch(query);
                } catch (error) {
                    console.error('Search failed:', error);
                    searchResults.innerHTML = '<div class="p-3 text-center text-red-500">Ошибка во время поиска.</div>';
                } finally {
                }
            };

            const debouncedSearch = debounce(executeSearch, 300);

            searchInput.addEventListener('focus', toggleResultsVisibility);

            searchInput.addEventListener('input', () => {
                debouncedSearch();
            });

            document.addEventListener('click', (event) => {
                const isClickInsideSearch = searchInput.contains(event.target)
                    || searchResults.contains(event.target)
                    || clearSearchInputBtn.contains(event.target);
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

            setupClearButton('searchInput', 'clearSearchInputBtn', () => {
                executeSearch();
            });
            console.log("Search system initialized.");
        }


        function convertItemToSearchResult(storeName, itemId, item, score) {
            if (!item) {
                console.warn(`[convertItemToSearchResult] Попытка конвертировать пустой элемент для ${storeName}/${itemId}`);
                return null;
            }

            let finalItemId = itemId;
            let finalSection = storeName;
            const algoSections = ['program', 'skzi', 'webReg', 'lk1c', 'main'];

            if (storeName === 'algorithms') {
                if (item.section && algoSections.includes(item.section)) {
                    finalSection = item.section;
                    finalItemId = item.id || itemId;
                    if (finalItemId === 'main') finalSection = 'main';
                }
                else {
                    finalItemId = itemId;
                    if (finalItemId === 'main') {
                        finalSection = 'main';
                    } else if (typeof finalItemId === 'string') {
                        let foundPrefix = false;
                        for (const prefix of algoSections.filter(s => s !== 'main')) {
                            if (finalItemId.startsWith(prefix)) {
                                finalSection = prefix;
                                foundPrefix = true;
                                console.warn(`[convertItemToSearchResult] Секция для ${finalItemId} определена по префиксу '${prefix}'. Рекомендуется добавить поле 'section' в данные.`);
                                break;
                            }
                        }
                        if (!foundPrefix) {
                            let foundInMemory = false;
                            for (const sectionKey of algoSections.filter(s => s !== 'main')) {
                                if (algorithms[sectionKey] && Array.isArray(algorithms[sectionKey]) && algorithms[sectionKey].find(a => String(a?.id) === String(finalItemId))) {
                                    finalSection = sectionKey;
                                    foundInMemory = true;
                                    console.warn(`[convertItemToSearchResult] Секция для ${finalItemId} найдена в памяти (${finalSection}) по совпадению ID. Это может быть ненадежно. Рекомендуется добавить поле 'section'.`);
                                    break;
                                }
                            }
                            if (!foundInMemory) {
                                console.error(`[convertItemToSearchResult] Не удалось определить секцию для algorithm ID: ${finalItemId}. Используется 'program' как fallback. КРИТИЧНО: Проверьте данные или логику определения секции!`);
                                finalSection = 'program';
                            }
                        }
                    } else {
                        console.error(`[convertItemToSearchResult] Некорректный тип ID (${typeof finalItemId}) для алгоритма:`, finalItemId, item);
                        return null;
                    }
                }
                if (!item.id && finalItemId) {
                    item.id = finalItemId;
                } else if (item.id && String(item.id) !== String(finalItemId)) {
                    console.warn(`[convertItemToSearchResult] ID в данных (${item.id}) не совпадает с ID из индекса (${finalItemId}) для секции ${finalSection}. Используется ID из индекса.`);
                    item.id = finalItemId;
                }

            } else if (storeName === 'clientData') {
                finalItemId = 'current';
                finalSection = 'main';
                if (!item.id) item.id = finalItemId;

            } else if (storeName === 'bookmarkFolders') {
                finalItemId = item.id || itemId;
                finalSection = 'bookmarks';
                if (!finalItemId) {
                    console.warn("[convertItemToSearchResult] Отсутствует ID у папки закладок:", item);
                    return null;
                }
                if (!item.id) item.id = finalItemId;


            } else {
                finalSection = storeName;
                finalItemId = item.id || itemId;
                if (finalItemId === undefined || finalItemId === null) {
                    console.warn("[convertItemToSearchResult] Item ID не найден для хранилища", storeName, item, "переданный itemId:", itemId);
                    return null;
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
                    result.title = item.title || (finalItemId === 'main' ? (algorithms?.main?.title || 'Главный алгоритм') : `Алгоритм ${finalItemId}`);
                    result.description = item.description || item.steps?.[0]?.description || 'Нет описания шагов';
                    break;
                case 'links':
                    result.type = 'link';
                    result.title = item.title || `Ссылка 1С #${finalItemId}`;
                    result.description = item.description || item.link || 'Нет описания или адреса';
                    break;
                case 'bookmarks':
                    if (item.url) {
                        result.type = 'bookmark';
                        result.title = item.title || `Закладка #${finalItemId}`;
                        result.description = item.description || item.url;
                    } else {
                        result.type = 'bookmark_note';
                        result.title = item.title || `Заметка #${finalItemId}`;
                        result.description = item.description || 'Нет текста заметки';
                    }
                    break;
                case 'reglaments':
                    result.type = 'reglament';
                    result.title = item.title || `Регламент #${finalItemId}`;
                    const categoryInfo = item.category ? categoryDisplayInfo[item.category] : null;
                    const categoryName = categoryInfo ? categoryInfo.title : (item.category || 'Без категории');
                    const contentPreview = item.content
                        ? (item.content.substring(0, 100).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() + (item.content.length > 100 ? '...' : ''))
                        : 'Нет содержимого';
                    result.description = `Категория: ${categoryName}. ${contentPreview}`;
                    break;
                case 'extLinks':
                    result.type = 'extLink';
                    result.title = item.title || `Ресурс #${finalItemId}`;
                    result.description = item.description || item.url || 'Нет описания или URL';
                    break;
                case 'clientData':
                    result.type = 'clientNote';
                    result.title = 'Заметки по клиенту';
                    const notesPreview = item.notes
                        ? (item.notes.substring(0, 100).replace(/\s+/g, ' ').trim() + (item.notes.length > 100 ? '...' : ''))
                        : 'Нет заметок';
                    result.description = notesPreview;
                    break;
                case 'bookmarkFolders':
                    result.type = 'bookmarkFolder';
                    result.title = `Папка: ${item.name || 'Без названия'}`;
                    result.description = `Нажмите для фильтрации по этой папке`;
                    break;
                default:
                    console.warn(`[convertItemToSearchResult] Неизвестный storeName: ${storeName}. Используется тип по умолчанию.`);
                    result.type = storeName;
                    result.title = item.title || item.name || `Запись ID: ${finalItemId}`;
                    result.description = item.description || JSON.stringify(item).substring(0, 100) + '...';
                    break;
            }

            if (result.description && typeof result.description === 'string') {
                result.description = result.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }

            if (!result.title) {
                console.warn(`[convertItemToSearchResult] Результат не имеет заголовка:`, result);
                result.title = `(${result.type || 'Запись'} ${result.id})`;
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
            console.log(`[navigateToResult v5] Attempting navigation: section=${section}, type=${type}, id=${id}, title=${title}`);

            if (type === 'section_link') {
                console.log(`[navigateToResult v5] Section link detected for section ID: ${section}`);
                if (typeof setActiveTab === 'function') {
                    try {
                        setActiveTab(section);
                        const contentElement = document.getElementById(`${section}Content`);
                        contentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        console.log(`[navigateToResult v5] Switched to tab ${section} and scrolled.`);
                    } catch (tabError) {
                        console.error(`[navigateToResult v5] Error switching or scrolling to tab ${section}:`, tabError);
                        showNotification(`Ошибка при переходе в раздел "${title}"`, "error");
                    }
                } else {
                    console.error("[navigateToResult v5] 'setActiveTab' function not found for section link.");
                    showNotification("Ошибка интерфейса: Не удалось переключить вкладку.", "error");
                }
                return;
            }

            let targetTabId = section;
            if (type === 'bookmarkFolder') targetTabId = 'bookmarks';
            if (type === 'clientNote') targetTabId = 'main';

            if (!tabsConfig.some(tab => tab.id === targetTabId)) {
                console.error(`[navigateToResult v5] Invalid targetTabId determined: ${targetTabId} for result:`, result);
                showNotification(`Ошибка навигации: Неизвестный раздел "${targetTabId}"`, "error");
                return;
            }

            try {
                if (typeof setActiveTab === 'function') {
                    setActiveTab(targetTabId);
                    console.log(`[navigateToResult v5] Switched to tab: ${targetTabId} for item type: ${type}`);
                } else {
                    console.error("[navigateToResult v5] 'setActiveTab' function not found.");
                    showNotification("Ошибка интерфейса: Не удалось переключить вкладку.", "error");
                    return;
                }
            } catch (error) {
                console.error(`[navigateToResult v5] Error switching tab to ${targetTabId}:`, error);
                showNotification("Произошла ошибка при переключении вкладки.", "error");
            }

            function scrollToAndHighlight(selector, elementId, targetSectionId) {
                const SCROLL_DELAY_MS_HELPER = 150;
                const HIGHLIGHT_DURATION_MS_HELPER = 2500;
                const HIGHLIGHT_BASE_CLASSES = ['outline', 'outline-4', 'outline-offset-2', 'rounded-md', 'transition-all', 'duration-300'];
                const HIGHLIGHT_COLOR_CLASSES = ['outline-yellow-400', 'dark:outline-yellow-300'];
                const HIGHLIGHT_BG_CLASSES = ['bg-yellow-100/50', 'dark:bg-yellow-900/30'];
                const notify = typeof showNotification === 'function' ? showNotification : console.warn;
                setTimeout(() => {
                    const activeContent = document.querySelector(`.tab-content:not(.hidden)`);
                    if (!activeContent) { console.error(`[scrollToAndHighlight v5] Could not find active tab content container after delay.`); notify("Ошибка: Не найден активный контейнер вкладки.", "error"); return; }
                    if (!activeContent.id || !activeContent.id.startsWith(targetSectionId)) { console.warn(`[scrollToAndHighlight v5] Active tab (${activeContent.id}) doesn't match target (${targetSectionId}). Skipping highlight/scroll.`); return; }
                    const fullSelector = `${selector}[data-id="${elementId}"]`;
                    let element = null;
                    try { element = activeContent.querySelector(fullSelector); console.log(`[scrollToAndHighlight v5] Searching for selector: "${fullSelector}" within active content "${activeContent.id}"`); }
                    catch (e) { console.error(`[scrollToAndHighlight v5] Invalid selector: "${fullSelector}". Error:`, e); notify("Ошибка: Не удалось найти элемент (некорректный селектор).", "error"); return; }
                    if (element && element.offsetParent !== null) {
                        console.log(`[scrollToAndHighlight v5] Element found and visible. Scrolling to CENTER and highlighting.`);
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add(...HIGHLIGHT_BASE_CLASSES, ...HIGHLIGHT_COLOR_CLASSES, ...HIGHLIGHT_BG_CLASSES);
                        setTimeout(() => { element.classList.remove(...HIGHLIGHT_BASE_CLASSES, ...HIGHLIGHT_COLOR_CLASSES, ...HIGHLIGHT_BG_CLASSES); }, HIGHLIGHT_DURATION_MS_HELPER);
                    } else if (element) {
                        console.warn(`[scrollToAndHighlight v5] Element '${fullSelector}' found but not visible (offsetParent is null) in section '${targetSectionId}'. Skipping.`);
                        notify(`Элемент "${element.textContent?.trim() || elementId}" найден, но невидим.`, "warning");
                    } else {
                        console.warn(`[scrollToAndHighlight v5] Element '${fullSelector}' not found in section '${targetSectionId}'. Scrolling to section container (start).`);
                        const elementName = `элемент с ID ${elementId}`; notify(`Элемент "${elementName}" не найден. Прокрутка к началу раздела.`, "warning");
                        const getSectionContainerSelector = (sec) => { switch (sec) { case 'main': return '#mainAlgorithm'; case 'program': return '#programAlgorithms'; case 'skzi': return '#skziAlgorithms'; case 'webReg': return '#webRegAlgorithms'; case 'lk1c': return '#lk1cAlgorithms'; case 'links': return '#linksContainer'; case 'extLinks': return '#extLinksContainer'; case 'reglaments': return '#reglamentsList:not(.hidden) #reglamentsContainer'; case 'bookmarks': return '#bookmarksContainer'; default: return `#${sec}Content > div:first-child`; } };
                        const sectionContainerSelector = getSectionContainerSelector(targetSectionId); const sectionContainer = activeContent.querySelector(sectionContainerSelector);
                        if (sectionContainer) { sectionContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                        else { console.error(`[scrollToAndHighlight v5] Section container not found ('${sectionContainerSelector}'). Scrolling to top of tab.`); activeContent.scrollIntoView({ behavior: 'smooth', block: 'start' }); notify(`Не удалось найти контейнер раздела "${targetSectionId}".`, "error"); }
                    }
                }, SCROLL_DELAY_MS_HELPER);
            }

            try {
                switch (type) {
                    case 'algorithm':
                        if (section === 'main' && id === 'main') {
                            console.log("[navigateToResult v5] Main algorithm. Scrolling to main content (start).");
                            document.getElementById('mainContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else {
                            console.log(`[navigateToResult v5] Algorithm type. Opening detail modal for ID ${id} in section ${section}.`);
                            if (typeof showAlgorithmDetail === 'function') {
                                const algoDataInMemory = algorithms?.[section]?.find(a => String(a?.id) === String(id));
                                if (algoDataInMemory) {
                                    showAlgorithmDetail(algoDataInMemory, section);
                                } else {
                                    getFromIndexedDB('algorithms', 'all')
                                        .then(container => {
                                            const dbAlgoData = container?.data?.[section]?.find(a => String(a?.id) === String(id));
                                            if (dbAlgoData) { showAlgorithmDetail(dbAlgoData, section); }
                                            else { console.error(`[navigateToResult v5] Algo data not found ${id}`); showNotification(`Не удалось найти данные алгоритма ${id}.`, "error"); }
                                        })
                                        .catch(err => { console.error(`[navigateToResult v5] Error fetching algo ${id}`, err); showNotification("Ошибка загрузки данных алгоритма.", "error"); });
                                }
                            } else {
                                console.error("[navigateToResult v5] 'showAlgorithmDetail' function not found.");
                                showNotification("Функция деталей алгоритма не найдена.", "warning");
                                scrollToAndHighlight('.algorithm-card', id, section);
                            }
                        }
                        break;

                    case 'reglament':
                        console.log("[navigateToResult v5] Reglament type. Showing detail modal for ID:", id);
                        if (typeof showReglamentDetail === 'function') {
                            showReglamentDetail(id);
                        } else {
                            console.warn("[navigateToResult v5] 'showReglamentDetail' function not found. Scrolling to item.");
                            showNotification("Функция просмотра регламента не найдена.", "warning");
                            scrollToAndHighlight('.reglament-item', id, section);
                        }
                        break;

                    case 'link':
                        console.log(`[navigateToResult v5] CIB Link type. Scrolling to item ${id} (center).`);
                        scrollToAndHighlight('.cib-link-item', id, section);
                        break;

                    case 'extLink':
                        console.log(`[navigateToResult v5] External Link type. Scrolling to item ${id} (center).`);
                        scrollToAndHighlight('.ext-link-item', id, section);
                        break;

                    case 'bookmark':
                        console.log(`[navigateToResult v5] Bookmark type. Scrolling to item ${id} (center).`);
                        scrollToAndHighlight('.bookmark-item', id, section);
                        break;
                    case 'bookmark_note':
                        console.log(`[navigateToResult v5] Bookmark note type. Showing detail modal for ID: ${id}.`);
                        if (typeof showBookmarkDetailModal === 'function') {
                            showBookmarkDetailModal(id);
                        } else {
                            console.error("Функция showBookmarkDetailModal не определена!");
                            showNotification("Невозможно отобразить детали заметки.", "error");
                            scrollToAndHighlight('.bookmark-item', id, section);
                        }
                        break;

                    case 'bookmarkFolder':
                        console.log(`[navigateToResult v5] Bookmark folder type. Filtering by folder ${id}. Scrolling to container (start).`);
                        const folderFilterSelect = document.getElementById('bookmarkFolderFilter');
                        const bookmarksContainer = document.getElementById('bookmarksContainer');
                        if (folderFilterSelect && typeof filterBookmarks === 'function' && bookmarksContainer) {
                            folderFilterSelect.value = id;
                            filterBookmarks();
                            bookmarksContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            showNotification(`Отфильтровано по папке: ${title.replace('Папка: ', '')}`, "info");
                        } else {
                            console.error("[navigateToResult v5] Cannot filter by bookmark folder. Elements/function missing.");
                            showNotification("Не удалось отфильтровать по папке.", "error");
                            bookmarksContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        break;

                    case 'clientNote':
                        console.log("[navigateToResult v5] Client Note type. Scrolling to notes field (center) and selecting text.");
                        const SCROLL_DELAY_MS_CLIENT_NOTE_V5 = 500;
                        const FOCUS_DELAY_MS_V5 = 50;

                        setTimeout(() => {
                            const clientNotesField = document.getElementById('clientNotes');
                            if (clientNotesField && clientNotesField.offsetParent !== null) {
                                console.log("  [v5] > Scrolling #clientNotes to center...");
                                clientNotesField.scrollIntoView({ behavior: 'smooth', block: 'center' });

                                setTimeout(() => {
                                    const currentClientNotesField = document.getElementById('clientNotes');
                                    if (currentClientNotesField && currentClientNotesField.offsetParent !== null) {
                                        console.log("  [v5] > Focusing and selecting text in #clientNotes...");
                                        currentClientNotesField.focus({ preventScroll: true });

                                        const searchQueryInput = document.getElementById('searchInput');
                                        const query = (searchQueryInput?.value || '').trim().toLowerCase().replace(/ё/g, 'е');
                                        const text = currentClientNotesField.value;
                                        const textLower = text.toLowerCase().replace(/ё/g, 'е');
                                        let startIndex = -1;

                                        console.log(`  [v5 DEBUG] > Search Query (normalized): "${query}"`);

                                        if (query && text) {
                                            startIndex = textLower.indexOf(query);
                                            console.log(`  [v5] > Search Result: startIndex = ${startIndex}`);
                                        } else {
                                            console.log("  [v5] > Search query or notes text is empty, skipping selection.");
                                        }

                                        if (startIndex !== -1) {
                                            const endIndex = startIndex + query.length;
                                            try {
                                                console.log(`  [v5 DEBUG] > Attempting setSelectionRange(${startIndex}, ${endIndex})`);
                                                currentClientNotesField.setSelectionRange(startIndex, endIndex);
                                                console.log(`  [v5 DEBUG] > Selection check - Start: ${currentClientNotesField.selectionStart}, End: ${currentClientNotesField.selectionEnd}`);

                                                const linesBefore = text.substring(0, startIndex).split('\n').length;
                                                const avgLineHeight = parseFloat(window.getComputedStyle(currentClientNotesField).lineHeight) || 18;
                                                const scrollOffset = Math.max(0, (linesBefore - 1) * avgLineHeight - (currentClientNotesField.clientHeight * 0.2));
                                                console.log(`  [v5 DEBUG] > Calculated scrollOffset: ${scrollOffset}`);

                                                requestAnimationFrame(() => {
                                                    console.log(`  [v5 DEBUG] > Applying scrollTop = ${scrollOffset} inside requestAnimationFrame`);
                                                    currentClientNotesField.scrollTop = scrollOffset;
                                                    console.log(`  [v5 DEBUG] > Actual scrollTop after setting: ${currentClientNotesField.scrollTop}`);
                                                });

                                            } catch (selectionError) {
                                                console.error("  [v5] > Error setting selection range:", selectionError);
                                            }
                                        } else {
                                            console.log("  [v5] > Text not found in notes, skipping selection and internal scroll. Scrolling to top.");
                                            requestAnimationFrame(() => {
                                                if (currentClientNotesField.scrollTop !== 0) {
                                                    currentClientNotesField.scrollTop = 0;
                                                    console.log("  [v5] > Scrolled to top because text not found.");
                                                }
                                            });
                                        }
                                        console.log("  [v5] > Highlight for the entire field is SKIPPED.");

                                    } else {
                                        console.warn("   [v5] >> #clientNotes became hidden or removed before focus/selection timeout.");
                                    }
                                }, FOCUS_DELAY_MS_V5);

                            } else if (clientNotesField) {
                                console.warn("[navigateToResult v5] Client notes field #clientNotes found but not visible (offsetParent is null). Skipping scroll/focus/highlight.");
                                showNotification("Поле заметок найдено, но не видимо на экране.", "warning");
                            } else {
                                console.error("[navigateToResult v5] Client notes field #clientNotes not found.");
                                showNotification("Не удалось найти поле заметок.", "error");
                            }
                        }, SCROLL_DELAY_MS_CLIENT_NOTE_V5);
                        break;

                    default:
                        console.warn(`[navigateToResult v5] Unknown result type: '${type}'. Scrolling to top of tab ${targetTabId}.`);
                        showNotification(`Неизвестный тип результата: ${type}.`, "warning");
                        document.querySelector(`#${targetTabId}Content`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        break;
                }
            } catch (error) {
                console.error(`[navigateToResult v5] Error processing result type '${type}' for ID '${id}' in section '${section}':`, error);
                showNotification("Произошла ошибка при переходе к результату.", "error");
            }
        }


        function tokenize(text) {
            if (!text || typeof text !== 'string') { return []; }
            const cleanedText = text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s_-]/g, '');
            const words = cleanedText.split(/\s+/).filter(word => word.length > 0);
            const tokens = new Set();
            const MIN_TOKEN_LENGTH = 3;

            words.forEach(word => {
                const isNumeric = /^\d+$/.test(word);

                if (word.length >= MIN_TOKEN_LENGTH) {
                    if (!isNumeric || /[^0-9]/.test(word)) {
                        for (let i = MIN_TOKEN_LENGTH; i <= word.length; i++) {
                            tokens.add(word.substring(0, i));
                        }
                    }
                    tokens.add(word);
                } else if (word.length > 0) {
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
                console.error(`Ошибка извлечения текста из элемента в хранилище ${storeName}:`, itemData, error);
            }

            return texts.filter(t => typeof t === 'string' && t.trim())
                .join(' ')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
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

            if (!db) {
                console.error("[performSearch] DB not ready");
                if (searchResultsContainer) searchResultsContainer.innerHTML = dbErrorMessage;
                return;
            }
            if (!searchResultsContainer) {
                console.error("[performSearch] searchResultsContainer not found");
                return;
            }

            const normalizedQuery = query.trim().toLowerCase().replace(/ё/g, 'е');
            if (!normalizedQuery) {
                searchResultsContainer.innerHTML = '';
                searchResultsContainer.classList.add('hidden');
                return;
            }

            const MIN_SEARCH_LENGTH = 3;
            if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
                searchResultsContainer.innerHTML = minLengthMessage.replace('3', String(MIN_SEARCH_LENGTH));
                searchResultsContainer.classList.remove('hidden');
                return;
            }

            searchResultsContainer.innerHTML = loadingIndicator;
            searchResultsContainer.classList.remove('hidden');
            console.log(`[performSearch] Начало поиска по запросу: "${normalizedQuery}"`);

            const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length >= 1);
            if (queryWords.length === 0) {
                searchResultsContainer.innerHTML = noResultsMessage;
                return;
            }
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
                            } else {
                                resolve();
                            }
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

            const selectedCheckboxes = new Set([...document.querySelectorAll('.search-field:checked')].map(cb => cb.value));
            const algoSections = ['program', 'skzi', 'webReg', 'lk1c'];

            const getSectionForResult = (ref) => {
                if (!ref) return null;
                if (ref.store === 'algorithms') {
                    if (ref.id === 'main') return 'main';
                    if (typeof ref.id === 'string') {
                        for (const prefix of algoSections) {
                            if (ref.id.startsWith(prefix)) {
                                return prefix;
                            }
                        }
                        if (/^[a-zA-Z]+[0-9]+$/.test(ref.id)) {
                            const potentialSection = ref.id.replace(/[0-9]+$/, '');
                            if (algoSections.includes(potentialSection)) {
                                return potentialSection;
                            }
                        }
                        for (const sectionKey of algoSections) {
                            if (algorithms[sectionKey] && algorithms[sectionKey].some(algo => algo.id === ref.id)) {
                                console.warn(`[getSectionForResult] Fallback: Found algorithm ID ${ref.id} in section ${sectionKey} based on memory.`);
                                return sectionKey;
                            }
                        }
                    }
                    console.warn(`[getSectionForResult] Не удалось определить секцию для algorithm ID: ${ref.id}. Используется 'program'.`);
                    return 'program';
                }
                if (ref.store === 'bookmarkFolders') return 'bookmarks';
                if (ref.store === 'clientData') return 'main';
                return ref.store;
            };

            const searchTitle = selectedCheckboxes.has('title');
            const searchDescription = selectedCheckboxes.has('description');
            const searchSteps = selectedCheckboxes.has('steps');
            const searchInAllFields = !searchTitle && !searchDescription && !searchSteps;

            if (!searchInAllFields && finalDocRefs.length > 0) {
                console.log("[performSearch] Применение фильтра по полям. Выбраны:", { searchTitle, searchDescription, searchSteps });
                console.log("[performSearch] Фильтрация по полям (title/desc/steps) не реализована точно из-за структуры индекса. Пропуск этого шага.");

            } else if (finalDocRefs.length > 0) {
                console.log("[performSearch] Фильтрация по полям не применяется (выбраны все или ни одного).");
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
                            request.onsuccess = e => {
                                if (e.target.result) storeDataMap.set(keyToFetch, e.target.result);
                                resolveStoreFetch();
                            };
                            request.onerror = e => {
                                console.error(`[performSearch Fetch] Ошибка загрузки ${keyToFetch} из ${storeName}:`, e.target.error);
                                resolveStoreFetch();
                            };
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
                                    request.onsuccess = e => {
                                        if (e.target.result) storeDataMap.set(idFromRef, e.target.result);
                                        resolveItem();
                                    };
                                    request.onerror = e => {
                                        console.error(`[performSearch Fetch] Ошибка загрузки ключа ${keyToGet} (ID из ref: ${idFromRef}) из ${storeName}:`, e.target.error);
                                        resolveItem();
                                    };
                                }));
                                await Promise.all(itemPromises);
                            }
                            resolveStoreFetch();
                        }
                    } catch (error) {
                        console.error(`[performSearch Fetch] Ошибка доступа к хранилищу ${storeName}:`, error);
                        resolveStoreFetch();
                    }
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
                            if (ref.id === 'main') {
                                itemData = allAlgosContainer.data.main;
                            } else {
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
                } catch (dataAccessError) {
                    console.error(`[performSearch Process] Ошибка доступа к данным для ref:`, ref, dataAccessError);
                    itemData = null;
                }


                if (itemData) {
                    const searchResultItem = convertItemToSearchResult(ref.store, ref.id, itemData, ref.score);
                    if (searchResultItem) {
                        let bonusScore = 0;
                        const fullText = getTextForItem(ref.store, itemData).toLowerCase().replace(/ё/g, 'е');
                        const titleText = (searchResultItem.title || '').toLowerCase().replace(/ё/g, 'е');

                        if (titleText.includes(normalizedQuery)) {
                            bonusScore += 70 * (normalizedQuery.length / (titleText.length || 1));
                        }

                        queryWords.forEach(word => {
                            const exactWordRegex = new RegExp(`\\b${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
                            if (exactWordRegex.test(fullText)) {
                                bonusScore += 30;
                            }
                            else if (fullText.includes(word)) {
                                bonusScore += 5;
                            }
                        });
                        searchResultItem.score += bonusScore;
                        finalResults.push(searchResultItem);
                    }
                } else {
                    console.warn(`[performSearch Process] Данные для ref ${ref.store}:${ref.id} не найдены в загруженных.`);
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
                    console.log(`[DEBUG findSectionMatches] Section Match Found: ID='${tab.id}', Name='${tab.name}', Score=${sectionScore}`);
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
                        program: { icon: 'fa-desktop text-green-500', name: 'Программа 1С/УП' },
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
                    } catch (e) {
                        console.error(`Error getting items for store ${storeName} during indexing:`, e);
                        continue;
                    }

                    if (!items || items.length === 0) {
                        console.log(`  Store ${storeName} is empty, skipping.`);
                        continue;
                    }

                    for (const itemContainer of items) {
                        if (storeName === 'algorithms') {
                            if (itemContainer.section === 'all' && itemContainer.data) {
                                const algoData = itemContainer.data;
                                if (algoData.main) {
                                    console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for algorithms/main`);
                                    updatePromises.push(updateSearchIndex(storeName, 'main', algoData.main, 'add').catch(err => console.error("Index update failed for main algorithm:", err)));
                                }
                                ['program', 'skzi', 'lk1c', 'webReg'].forEach(sectionKey => {
                                    if (Array.isArray(algoData[sectionKey])) {
                                        algoData[sectionKey].forEach(algo => {
                                            if (algo && algo.id) {
                                                console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for ${storeName}/${algo.id}`);
                                                updatePromises.push(updateSearchIndex(storeName, algo.id, algo, 'add').catch(err => console.error(`Index update failed for ${storeName}/${algo.id}:`, err)));
                                            } else { console.warn(`Skipping algorithm in ${sectionKey} due to missing ID or data:`, algo); }
                                        });
                                    }
                                });
                            }
                        }
                        else if (storeName === 'clientData') {
                            if (itemContainer.id === 'current') {
                                console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for ${storeName}/current`);
                                updatePromises.push(updateSearchIndex(storeName, 'current', itemContainer, 'add').catch(err => console.error("Index update failed for clientData:", err)));
                            }
                        }
                        else {
                            const item = itemContainer;
                            let itemId = item.id;
                            if (itemId !== undefined && itemId !== null) {
                                console.log(`[DEBUG buildInitialSearchIndex] Scheduling index update for ${storeName}/${itemId}`);
                                updatePromises.push(updateSearchIndex(storeName, itemId, item, 'add').catch(err => console.error(`Index update failed for ${storeName}/${itemId}:`, err)));
                            } else { console.warn(`Skipping item in ${storeName} due to missing ID:`, item); }
                        }
                    }
                    console.log(`Finished processing ${storeName}.`);
                }

                console.log(`Waiting for ${updatePromises.length} index update operations to complete...`);
                const results = await Promise.allSettled(updatePromises);
                const failedCount = results.filter(r => r.status === 'rejected').length;
                if (failedCount > 0) {
                    console.error(`Initial index build completed with ${failedCount} errors.`);
                    showNotification(`Индексация завершена с ${failedCount} ошибками.`, "warning");
                } else {
                    console.log("Initial index build completed successfully.");
                }

                return Promise.resolve();

            } catch (error) {
                console.error("CRITICAL ERROR during initial index build:", error);
                showNotification("Критическая ошибка при построении поискового индекса.", "error");
                return Promise.reject(error);
            }
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

            clientNotes.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.ctrlKey) {
                    event.preventDefault();

                    const textarea = event.target;
                    const value = textarea.value;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;

                    const textBeforeCursor = value.substring(0, start);
                    const regex = /(?:^|\n)\s*(\d+)([).])\s/g;
                    let lastNum = 0;
                    let delimiter = ')';
                    let match;

                    while ((match = regex.exec(textBeforeCursor)) !== null) {
                        const currentNum = parseInt(match[1], 10);
                        if (currentNum >= lastNum) {
                            lastNum = currentNum;
                            delimiter = match[2];
                        }
                    }
                    const nextNum = lastNum + 1;

                    let prefix = "\n\n";
                    if (start === 0) {
                        prefix = "";
                    } else {
                        const charBefore = value.substring(start - 1, start);
                        if (charBefore === '\n') {
                            if (start >= 2 && value.substring(start - 2, start) === '\n\n') {
                                prefix = "";
                            } else {
                                prefix = "\n";
                            }
                        }
                    }

                    const insertionText = prefix + nextNum + delimiter + " ";

                    textarea.value = value.substring(0, start) + insertionText + value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = start + insertionText.length;

                    textarea.scrollTop = textarea.scrollHeight;

                    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                }
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


        async function exportClientDataToTxt() {
            const notes = document.getElementById('clientNotes')?.value ?? '';
            if (!notes.trim()) {
                showNotification("Нет данных для сохранения", "error");
                return;
            }

            const now = new Date();
            const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
            const filename = `Обращение_1С_${timestamp}.txt`;
            const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Текстовые файлы',
                            accept: { 'text/plain': ['.txt'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    showNotification("Файл успешно сохранен");
                    console.log("Экспорт текста клиента через File System Access API завершен успешно.");
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log("Сохранение файла отменено пользователем.");
                        showNotification("Сохранение файла отменено", "info");
                    } else {
                        console.error('Ошибка сохранения через File System Access API, используем fallback:', err);
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(link.href);
                        showNotification("Файл успешно сохранен (fallback)");
                        console.log("Экспорт текста клиента через data URI (fallback) завершен успешно.");
                    }
                }
            } else {
                console.log("File System Access API не поддерживается, используем fallback.");
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                showNotification("Файл успешно сохранен");
                console.log("Экспорт текста клиента через data URI завершен успешно.");
            }
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
        async function createBookmarkElement(bookmark, folderMap = {}) {
            if (!bookmark || typeof bookmark.id === 'undefined') {
                console.error("createBookmarkElement: Неверные данные закладки", bookmark);
                return null;
            }

            const bookmarkElement = document.createElement('div');
            bookmarkElement.className = 'bookmark-item view-item group relative bg-white dark:bg-[#374151] shadow-md hover:shadow-lg transition-shadow duration-200 rounded-lg border border-gray-200 dark:border-gray-700 p-4 pb-12';
            bookmarkElement.dataset.id = bookmark.id;
            if (bookmark.folder) {
                bookmarkElement.dataset.folder = bookmark.folder;
            }

            const folder = bookmark.folder ? folderMap[bookmark.folder] : null;
            let folderBadgeHTML = '';
            if (folder) {
                const colorName = folder.color || 'gray';
                folderBadgeHTML = `
                <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-${colorName}-100 text-${colorName}-800 dark:bg-${colorName}-900 dark:text-${colorName}-200" title="Папка: ${escapeHtml(folder.name)}">
                    <i class="fas fa-folder mr-1 opacity-75"></i>${escapeHtml(folder.name)}
                </span>`;
            } else if (bookmark.folder) {
                folderBadgeHTML = `
                <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Папка с ID: ${bookmark.folder} не найдена">
                    <i class="fas fa-question-circle mr-1 opacity-75"></i>Неизв. папка
                </span>`;
            }

            let externalLinkIconHTML = '';
            let urlHostnameHTML = '';
            let cardClickOpensUrl = false;
            let validUrl = null;
            let displayHostname = '';

            if (bookmark.url) {
                try {
                    validUrl = new URL(bookmark.url);
                    const safeUrl = escapeHtml(bookmark.url);
                    displayHostname = escapeHtml(validUrl.hostname);
                    externalLinkIconHTML = `
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" data-action="open-link-icon" class="p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Открыть ссылку (${safeUrl}) в новой вкладке">
                        <i class="fas fa-external-link-alt fa-fw"></i>
                    </a>`;
                    urlHostnameHTML = `
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" data-action="open-link-hostname" class="bookmark-url text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary text-xs inline-flex items-center group-hover:underline" title="Перейти: ${safeUrl}">
                        <i class="fas fa-link mr-1 opacity-75"></i>${displayHostname}
                    </a>`;
                    cardClickOpensUrl = true;
                } catch (e) {
                    console.warn(`Некорректный URL для закладки ID ${bookmark.id}: ${bookmark.url}`);
                    externalLinkIconHTML = `
                    <span class="p-1.5 text-red-400 cursor-not-allowed" title="Некорректный URL: ${escapeHtml(bookmark.url)}">
                        <i class="fas fa-times-circle fa-fw"></i>
                    </span>`;
                    urlHostnameHTML = `
                    <span class="text-red-500 text-xs inline-flex items-center" title="Некорректный URL: ${escapeHtml(bookmark.url)}">
                        <i class="fas fa-exclamation-triangle mr-1"></i> Некорр. URL
                    </span>`;
                    cardClickOpensUrl = false;
                }
            } else {
                externalLinkIconHTML = `
                <span class="p-1.5 text-gray-400 dark:text-gray-500 cursor-help" title="Текстовая заметка (нет URL)">
                    <i class="fas fa-sticky-note fa-fw"></i>
                </span>`;
                cardClickOpensUrl = false;
            }
            bookmarkElement.dataset.opensUrl = cardClickOpensUrl;

            const hasScreenshots = bookmark.screenshotIds && Array.isArray(bookmark.screenshotIds) && bookmark.screenshotIds.length > 0;
            const screenshotButtonHTML = hasScreenshots ? `
            <button data-action="view-screenshots" class="p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Просмотреть скриншоты (${bookmark.screenshotIds.length})">
                <i class="fas fa-images fa-fw"></i>
            </button>
        ` : '';

            const actionsHTML = `
            <div class="bookmark-actions absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                ${screenshotButtonHTML}
                ${externalLinkIconHTML}
                <button data-action="edit" class="edit-bookmark p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Редактировать">
                    <i class="fas fa-edit fa-fw"></i>
                </button>
                <button data-action="delete" class="delete-bookmark p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Удалить">
                    <i class="fas fa-trash fa-fw"></i>
                </button>
            </div>`;

            const safeTitle = escapeHtml(bookmark.title || 'Без названия');
            const safeDescription = escapeHtml(bookmark.description || '');
            const descriptionHTML = safeDescription
                ? `<p class="bookmark-description text-gray-600 dark:text-gray-400 text-sm mt-1 mb-2 line-clamp-3" title="${safeDescription}">${safeDescription}</p>`
                : (bookmark.url ? '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Нет описания</p>' : '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Текстовая заметка</p>');

            const mainContentHTML = `
            <div class="flex-grow min-w-0 mb-3 pr-20">
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 group-hover:text-primary dark:group-hover:text-primary transition-colors duration-200 truncate" title="${safeTitle}">
                    ${safeTitle}
                </h3>
                ${descriptionHTML}
                <div class="bookmark-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2">
                    ${folderBadgeHTML}
                    <span class="text-gray-500 dark:text-gray-400" title="Добавлено: ${new Date(bookmark.dateAdded || Date.now()).toLocaleString()}">
                        <i class="far fa-clock mr-1 opacity-75"></i>${new Date(bookmark.dateAdded || Date.now()).toLocaleDateString()}
                    </span>
                </div>
            </div>`;

            const urlBlockHTML = bookmark.url && urlHostnameHTML ? `
            <div class="absolute bottom-3 right-4 z-10">
                ${urlHostnameHTML}
            </div>
        ` : '';

            bookmarkElement.innerHTML = actionsHTML + mainContentHTML + urlBlockHTML;
            return bookmarkElement;
        }


        function initBookmarkSystem() {
            console.log("Вызвана функция initBookmarkSystem (заглушка).");
            const addBookmarkBtn = document.getElementById('addBookmarkBtn');
            const organizeBookmarksBtn = document.getElementById('organizeBookmarksBtn');
            const bookmarkSearchInput = document.getElementById('bookmarkSearchInput');
            const bookmarkFolderFilter = document.getElementById('bookmarkFolderFilter');

            if (addBookmarkBtn && !addBookmarkBtn.dataset.listenerAttached) {
                addBookmarkBtn.addEventListener('click', () => showAddBookmarkModal());
                addBookmarkBtn.dataset.listenerAttached = 'true';
                console.log("Обработчик для addBookmarkBtn добавлен в initBookmarkSystem.");
            }

            if (organizeBookmarksBtn && !organizeBookmarksBtn.dataset.listenerAttached) {
                organizeBookmarksBtn.addEventListener('click', () => {
                    if (typeof showOrganizeFoldersModal === 'function') {
                        showOrganizeFoldersModal();
                    } else {
                        console.error("Функция showOrganizeFoldersModal не найдена!");
                        showNotification("Функция управления папками недоступна.", "error");
                    }
                });
                organizeBookmarksBtn.dataset.listenerAttached = 'true';
                console.log("Обработчик для organizeBookmarksBtn добавлен в initBookmarkSystem.");
            }

            if (bookmarkSearchInput && !bookmarkSearchInput.dataset.listenerAttached) {
                const debouncedFilter = typeof debounce === 'function' ? debounce(filterBookmarks, 250) : filterBookmarks;
                bookmarkSearchInput.addEventListener('input', debouncedFilter);
                bookmarkSearchInput.dataset.listenerAttached = 'true';
                console.log("Обработчик для bookmarkSearchInput добавлен в initBookmarkSystem.");
                setupClearButton('bookmarkSearchInput', 'clearBookmarkSearchBtn', filterBookmarks);
            }

            if (bookmarkFolderFilter && !bookmarkFolderFilter.dataset.listenerAttached) {
                bookmarkFolderFilter.addEventListener('change', filterBookmarks);
                bookmarkFolderFilter.dataset.listenerAttached = 'true';
                console.log("Обработчик для bookmarkFolderFilter добавлен в initBookmarkSystem.");
            }
            populateBookmarkFolders();
            loadBookmarks();
        }


        async function ensureBookmarkModal() {
            const modalId = 'bookmarkModal';
            let modal = document.getElementById(modalId);
            let mustRebuildContent = false;

            const bookmarkModalConfig = {
                modalId: 'bookmarkModal',
                buttonId: 'toggleFullscreenBookmarkBtn',
                classToggleConfig: {
                    normal: { modal: ['p-4'], innerContainer: ['max-w-2xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'], contentArea: [] },
                    fullscreen: { modal: ['p-0'], innerContainer: ['w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none', 'shadow-none'], contentArea: ['p-6'] }
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.p-content.overflow-y-auto.flex-1'
            };

            if (modal && !modal.querySelector('#bookmarkForm')) {
                console.warn(`Модальное окно #${modalId} найдено, но его содержимое некорректно. Пересоздание содержимого.`);
                mustRebuildContent = true;
                modal.innerHTML = '';
            }

            if (!modal || mustRebuildContent) {
                if (!modal) {
                    console.log("Модальное окно #bookmarkModal не найдено, создаем новое.");
                    modal = document.createElement('div');
                    modal.id = modalId;
                    modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-[90] p-4 flex items-center justify-center';
                    document.body.appendChild(modal);
                }

                modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div class="p-content border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 flex-grow mr-4 truncate" id="bookmarkModalTitle">
                        Заголовок окна
                    </h2>
                    <div class="flex items-center flex-shrink-0">
                        <button id="toggleFullscreenBookmarkBtn" type="button" class="inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle" title="Развернуть на весь экран">
                            <i class="fas fa-expand"></i>
                        </button>
                        <button type="button" class="close-modal inline-block p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors align-middle ml-1" title="Закрыть">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="p-content overflow-y-auto flex-1">
                <form id="bookmarkForm" novalidate>
                    <input type="hidden" id="bookmarkId" name="bookmarkId">
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkTitle">Название <span class="text-red-500">*</span></label>
                        <input type="text" id="bookmarkTitle" name="bookmarkTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkUrl">URL (если пусто - будет текстовая заметка)</label>
                        <input type="url" id="bookmarkUrl" name="bookmarkUrl" placeholder="https://..." class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkDescription">Описание / Текст заметки</label>
                        <textarea id="bookmarkDescription" name="bookmarkDescription" rows="5" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100"></textarea>
                        <p class="text-xs text-gray-500 mt-1">Обязательно для текстовых заметок (если URL пуст).</p>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" for="bookmarkFolder">Папка</label>
                        <select id="bookmarkFolder" name="bookmarkFolder" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base text-gray-900 dark:text-gray-100">
                            <option value="">Выберите папку</option>
                        </select>
                    </div>

                     <div class="mt-6 border-t border-gray-200 dark:border-gray-600 pt-4">
                         <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Скриншоты (опционально)</label>
                         <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Добавляйте изображения кнопкой или вставкой из буфера.</p>
                         <div id="bookmarkScreenshotThumbnailsContainer" class="flex flex-wrap gap-2 mb-2 min-h-[3rem]">
                         </div>
                         <div class="flex items-center gap-3">
                             <button type="button" class="add-bookmark-screenshot-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition">
                                 <i class="fas fa-camera mr-1"></i> Загрузить/Добавить
                             </button>
                         </div>
                         <input type="file" class="bookmark-screenshot-input hidden" accept="image/png, image/jpeg, image/gif, image/webp" multiple>
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

                const currentClickHandler = modal._clickHandler;
                if (currentClickHandler) {
                    modal.removeEventListener('click', currentClickHandler);
                }

                const newClickHandler = (e) => {
                    const targetModal = document.getElementById(modalId);
                    if (!targetModal) return;

                    if (e.target.closest('.close-modal, .cancel-modal')) {
                        console.log(`[ensureBookmarkModal Handler] Closing modal #${modalId} via button click.`);
                        targetModal.classList.add('hidden');
                        const form = targetModal.querySelector('#bookmarkForm');
                        if (form) {
                            form.reset();
                            const idInput = form.querySelector('#bookmarkId');
                            if (idInput) idInput.value = '';
                            const modalTitleEl = targetModal.querySelector('#bookmarkModalTitle');
                            if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                            const saveButton = targetModal.querySelector('#saveBookmarkBtn');
                            if (saveButton) saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
                            delete form._tempScreenshotBlobs;
                            delete form.dataset.screenshotsToDelete;
                            const thumbsContainer = form.querySelector('#bookmarkScreenshotThumbnailsContainer');
                            if (thumbsContainer) thumbsContainer.innerHTML = '';
                        }
                        document.body.classList.remove('modal-open');
                        if (typeof removeEscapeHandler === 'function') {
                            removeEscapeHandler(targetModal);
                        }
                    }
                };

                modal.addEventListener('click', newClickHandler);
                modal._clickHandler = newClickHandler;


                const fullscreenBtn = modal.querySelector('#toggleFullscreenBookmarkBtn');
                if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
                    fullscreenBtn.addEventListener('click', () => {
                        if (typeof toggleModalFullscreen === 'function') {
                            toggleModalFullscreen(
                                bookmarkModalConfig.modalId,
                                bookmarkModalConfig.buttonId,
                                bookmarkModalConfig.classToggleConfig,
                                bookmarkModalConfig.innerContainerSelector,
                                bookmarkModalConfig.contentAreaSelector
                            );
                        } else {
                            console.error("Функция toggleModalFullscreen не найдена!");
                            showNotification("Ошибка: Функция переключения полноэкранного режима недоступна.", "error");
                        }
                    });
                    fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
                    console.log(`Fullscreen listener attached to ${bookmarkModalConfig.buttonId}`);
                } else if (!fullscreenBtn) {
                    console.error(`Кнопка #${bookmarkModalConfig.buttonId} не найдена в модальном окне закладок!`);
                }

                const form = modal.querySelector('#bookmarkForm');
                if (form) {
                    if (!form.dataset.submitListenerAttached) {
                        if (typeof handleBookmarkFormSubmit === 'function') {
                            form.addEventListener('submit', handleBookmarkFormSubmit);
                            form.dataset.submitListenerAttached = 'true';
                            console.log("Новый обработчик submit добавлен к форме #bookmarkForm.");
                        } else {
                            console.error("Ошибка: Функция handleBookmarkFormSubmit не найдена!");
                            form.addEventListener('submit', (ev) => { ev.preventDefault(); alert("Ошибка сохранения!"); });
                        }
                    }
                    if (typeof attachBookmarkScreenshotHandlers === 'function') {
                        attachBookmarkScreenshotHandlers(form);
                    } else {
                        console.error("Функция attachBookmarkScreenshotHandlers не найдена!");
                    }

                } else {
                    console.error("Критическая ошибка: Не удалось найти форму #bookmarkForm после создания содержимого модального окна!");
                }
            }

            const form = modal.querySelector('#bookmarkForm');
            const modalTitle = modal.querySelector('#bookmarkModalTitle');
            const submitButton = modal.querySelector('#saveBookmarkBtn');
            const idInput = modal.querySelector('#bookmarkId');
            const titleInput = modal.querySelector('#bookmarkTitle');
            const urlInput = modal.querySelector('#bookmarkUrl');
            const descriptionInput = modal.querySelector('#bookmarkDescription');
            const folderSelect = modal.querySelector('#bookmarkFolder');
            const thumbsContainer = modal.querySelector('#bookmarkScreenshotThumbnailsContainer');

            if (!form || !modalTitle || !submitButton || !idInput || !titleInput || !urlInput || !descriptionInput || !folderSelect || !thumbsContainer) {
                console.error("Критическая ошибка: Не удалось найти все необходимые элементы формы (#bookmarkForm, #bookmarkModalTitle, #saveBookmarkBtn, ..., #bookmarkScreenshotThumbnailsContainer) внутри модального окна!");
                modal.classList.add('hidden');
                return null;
            }

            delete form._tempScreenshotBlobs;
            delete form.dataset.screenshotsToDelete;
            if (thumbsContainer) thumbsContainer.innerHTML = '';

            return {
                modal,
                form,
                modalTitle,
                submitButton,
                idInput,
                titleInput,
                urlInput,
                descriptionInput,
                folderSelect,
                thumbsContainer
            };
        }


        function attachBookmarkScreenshotHandlers(formElement) {
            if (!formElement || formElement.tagName !== 'FORM') {
                console.error("attachBookmarkScreenshotHandlers: Требуется элемент FORM.");
                return;
            }

            const addBtn = formElement.querySelector('.add-bookmark-screenshot-btn');
            const fileInput = formElement.querySelector('.bookmark-screenshot-input');
            const thumbnailsContainer = formElement.querySelector('#bookmarkScreenshotThumbnailsContainer');

            if (!addBtn || !fileInput || !thumbnailsContainer) {
                console.warn("attachBookmarkScreenshotHandlers: Не удалось найти все элементы для управления скриншотами в форме закладки:", formElement.id);
                return;
            }

            if (!formElement._tempScreenshotBlobs) {
                formElement._tempScreenshotBlobs = [];
            }
            if (formElement.dataset.screenshotsToDelete === undefined) {
                formElement.dataset.screenshotsToDelete = '';
            }

            const addBlobToBookmarkForm = async (blob) => {
                if (!Array.isArray(formElement._tempScreenshotBlobs)) { formElement._tempScreenshotBlobs = []; }
                try {
                    const processedBlob = await processImageFile(blob);
                    if (!processedBlob) throw new Error("Обработка изображения не удалась.");

                    const tempIndex = formElement._tempScreenshotBlobs.length;
                    formElement._tempScreenshotBlobs.push(processedBlob);

                    renderTemporaryThumbnail(processedBlob, tempIndex, thumbnailsContainer, formElement);

                    console.log(`Временный Blob для закладки (индекс ${tempIndex}) добавлен и отрисована миниатюра.`);
                    if (typeof isUISettingsDirty !== 'undefined') { isUISettingsDirty = true; } else if (typeof isDirty !== 'undefined') { isDirty = true; }
                } catch (error) {
                    console.error("Ошибка обработки или добавления Blob в addBlobToBookmarkForm:", error);
                    showNotification(`Ошибка обработки изображения: ${error.message || 'Неизвестная ошибка'}`, "error");
                }
            };

            async function handleImageFileForBookmarkProcessing(fileOrBlob, addCallback, buttonElement) {
                if (!fileOrBlob || !(fileOrBlob instanceof Blob) || typeof addCallback !== 'function') { console.error("handleImageFileForBookmarkProcessing: Некорректные аргументы."); return; }
                const originalButtonHTML = buttonElement ? buttonElement.innerHTML : ''; const wasButtonDisabled = buttonElement ? buttonElement.disabled : false;
                if (buttonElement) { buttonElement.disabled = true; buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Обработка...'; }
                try { await addCallback(fileOrBlob); }
                catch (error) { console.error("Ошибка при вызове колбэка в handleImageFileForBookmarkProcessing:", error); }
                finally { if (buttonElement) { buttonElement.disabled = wasButtonDisabled; buttonElement.innerHTML = originalButtonHTML; } }
            }

            if (!addBtn.dataset.listenerAttached) { addBtn.addEventListener('click', () => { fileInput.click(); }); addBtn.dataset.listenerAttached = 'true'; }
            if (!fileInput.dataset.listenerAttached) {
                fileInput.addEventListener('change', (event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) { Array.from(files).forEach(file => { handleImageFileForBookmarkProcessing(file, addBlobToBookmarkForm, addBtn); }); }
                    event.target.value = null;
                });
                fileInput.dataset.listenerAttached = 'true';
            }
            if (!formElement.dataset.pasteListenerAttached) {
                formElement.addEventListener('paste', (event) => {
                    const items = event.clipboardData?.items; if (!items) return; let imageFile = null;
                    for (let i = 0; i < items.length; i++) { if (items[i].kind === 'file' && items[i].type.startsWith('image/')) { imageFile = items[i].getAsFile(); break; } }
                    if (imageFile) { event.preventDefault(); handleImageFileForBookmarkProcessing(imageFile, addBlobToBookmarkForm, addBtn); }
                });
                formElement.dataset.pasteListenerAttached = 'true';
            }

            console.log("Обработчики событий для *новых* скриншотов настроены для формы закладки. Drag&Drop отключен.");
        }


        async function renderExistingThumbnail(screenshotId, container, parentElement) {
            if (!container || !parentElement) {
                console.error("renderExistingThumbnail: Контейнер или родительский элемент не предоставлены.");
                return;
            }
            if (typeof screenshotId !== 'number' || isNaN(screenshotId)) {
                console.error("renderExistingThumbnail: Некорректный screenshotId:", screenshotId);
                return;
            }

            let screenshotData = null;
            try {
                screenshotData = await getFromIndexedDB('screenshots', screenshotId);
            } catch (fetchError) {
                console.error(`Ошибка загрузки данных для скриншота ID ${screenshotId}:`, fetchError);
            }

            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'relative w-16 h-12 group border border-gray-300 dark:border-gray-500 rounded overflow-hidden shadow-sm screenshot-thumbnail existing';
            thumbDiv.dataset.existingId = screenshotId;

            if (!screenshotData || !(screenshotData.blob instanceof Blob)) {
                console.warn(`Данные для скриншота ID ${screenshotId} не найдены или некорректны.`);
                thumbDiv.classList.remove('border-gray-300', 'dark:border-gray-500');
                thumbDiv.classList.add('border-red-500', 'dark:border-red-400', 'bg-red-100', 'dark:bg-red-900/30', 'flex', 'items-center', 'justify-center', 'text-red-600', 'text-xs', 'p-1');
                thumbDiv.textContent = `Ошибка ID:${screenshotId}`;
                container.appendChild(thumbDiv);
                return;
            }

            const currentToDelete = (parentElement.dataset.screenshotsToDelete || '').split(',').map(s => parseInt(s.trim(), 10));
            const isMarkedForDeletion = currentToDelete.includes(screenshotId);
            if (isMarkedForDeletion) {
                thumbDiv.classList.add('opacity-50', 'border-dashed', 'border-red-500');
                console.log(`Миниатюра для ID ${screenshotId} рендерится как помеченная к удалению.`);
            }

            const img = document.createElement('img');
            img.className = 'w-full h-full object-contain bg-gray-200 dark:bg-gray-600';
            img.alt = `Скриншот ${screenshotId}`;
            img.loading = 'lazy';

            let objectURL = null;
            try {
                objectURL = URL.createObjectURL(screenshotData.blob);
                img.src = objectURL;
                img.onload = () => { console.log(`Существующая миниатюра ${screenshotId} загружена.`); URL.revokeObjectURL(objectURL); };
                img.onerror = () => { console.error(`Ошибка загрузки существующей миниатюры ${screenshotId}.`); URL.revokeObjectURL(objectURL); img.alt = "Ошибка"; };
            } catch (e) {
                console.error(`Ошибка создания URL для Blob ${screenshotId}:`, e);
                img.alt = "Ошибка URL";
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'absolute top-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-1 z-10 focus:outline-none focus:ring-1 focus:ring-white delete-existing-screenshot-btn';
            deleteBtn.title = 'Пометить к удалению';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
            deleteBtn.disabled = isMarkedForDeletion;

            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                const idToDelete = parseInt(thumbDiv.dataset.existingId, 10);
                if (!isNaN(idToDelete)) {
                    const currentToDeleteRaw = parentElement.dataset.screenshotsToDelete || '';
                    const currentToDeleteArray = currentToDeleteRaw.split(',').filter(Boolean).map(s => parseInt(s.trim(), 10));

                    if (!currentToDeleteArray.includes(idToDelete)) {
                        currentToDeleteArray.push(idToDelete);
                        parentElement.dataset.screenshotsToDelete = currentToDeleteArray.join(',');
                        thumbDiv.classList.add('opacity-50', 'border-dashed', 'border-red-500');
                        deleteBtn.disabled = true;
                        console.log(`Скриншот ID ${idToDelete} помечен к удалению. Список: ${parentElement.dataset.screenshotsToDelete}`);

                        if (typeof isUISettingsDirty !== 'undefined') { isUISettingsDirty = true; }
                        else if (typeof isDirty !== 'undefined') { isDirty = true; }
                    }
                }
            };

            thumbDiv.appendChild(img);
            thumbDiv.appendChild(deleteBtn);
            container.appendChild(thumbDiv);
        }

        async function processImageFile(fileOrBlob) {
            return new Promise((resolve, reject) => {
                if (!(fileOrBlob instanceof Blob)) {
                    return reject(new Error('Предоставленные данные не являются файлом или Blob.'));
                }
                const img = new Image();
                const reader = new FileReader();
                reader.onload = (e_reader) => {
                    if (!e_reader.target || typeof e_reader.target.result !== 'string') { return reject(new Error('Не удалось прочитать данные файла изображения.')); }
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 1280, MAX_HEIGHT = 1024;
                        let width = img.naturalWidth || img.width, height = img.naturalHeight || img.height;
                        if (width === 0 || height === 0) { return reject(new Error('Не удалось определить размеры изображения.')); }
                        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                        canvas.width = Math.round(width); canvas.height = Math.round(height);
                        const ctx = canvas.getContext('2d');
                        if (!ctx) { return reject(new Error('Не удалось получить 2D контекст Canvas.')); }
                        try {
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        } catch (drawError) {
                            console.error("Ошибка отрисовки на Canvas:", drawError);
                            return reject(new Error('Ошибка отрисовки изображения.'));
                        }
                        canvas.toBlob(blob => {
                            if (blob) {
                                console.log(`Изображение обработано и сжато в WebP. Размер: ${(blob.size / 1024).toFixed(1)} KB`);
                                resolve(blob);
                            } else {
                                canvas.toBlob(jpegBlob => {
                                    if (jpegBlob) {
                                        console.log(`Изображение обработано и сжато в JPEG. Размер: ${(jpegBlob.size / 1024).toFixed(1)} KB`);
                                        resolve(jpegBlob);
                                    } else {
                                        reject(new Error('Не удалось создать Blob из Canvas (ни WebP, ни JPEG)'));
                                    }
                                }, 'image/jpeg', 0.85);
                            }
                        }, 'image/webp', 0.8);
                    };
                    img.onerror = (err) => reject(new Error('Не удалось загрузить данные изображения в Image объект.'));
                    img.src = e_reader.target.result;
                };
                reader.onerror = (err) => reject(new Error('Не удалось прочитать файл изображения.'));
                reader.readAsDataURL(fileOrBlob);
            });
        }

        async function handleBookmarkFormSubmit(event) {
            event.preventDefault();
            const form = event.target;
            const modal = form.closest('#bookmarkModal');
            const saveButton = modal?.querySelector('#saveBookmarkBtn');

            console.log("[handleBookmarkFormSubmit v5] Function start.");

            if (!form) {
                console.error("handleBookmarkFormSubmit v5: CRITICAL - event.target is not the form!");
                showNotification("Критическая ошибка: форма не найдена.", "error");
                return;
            }
            if (!modal) {
                console.error("handleBookmarkFormSubmit v5: CRITICAL - Could not find parent modal #bookmarkModal.");
                showNotification("Критическая ошибка интерфейса: не найдено модальное окно.", "error");
                if (saveButton) saveButton.disabled = false;
                return;
            }
            if (!saveButton) {
                console.error("handleBookmarkFormSubmit v5: CRITICAL - Could not find save button #saveBookmarkBtn within modal.");
                showNotification("Критическая ошибка интерфейса: не найдена кнопка сохранения.", "error");
                const potentialSaveButton = document.getElementById('saveBookmarkBtn');
                if (potentialSaveButton) potentialSaveButton.disabled = false;
                return;
            }


            console.log("[handleBookmarkFormSubmit v5] Modal, form, and save button found. Proceeding...");

            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

            const id = form.elements.bookmarkId.value;
            const title = form.elements.bookmarkTitle.value.trim();
            const url = form.elements.bookmarkUrl.value.trim();
            const description = form.elements.bookmarkDescription.value.trim();
            const folderValue = form.elements.bookmarkFolder.value;
            const folder = folderValue ? parseInt(folderValue, 10) : null;

            if (!title) {
                showNotification("Заполните поле 'Название'", "error");
                saveButton.disabled = false; saveButton.innerHTML = id ? '<i class="fas fa-save mr-1"></i> Сохранить изменения' : '<i class="fas fa-plus mr-1"></i> Добавить';
                form.elements.bookmarkTitle.focus(); return;
            }
            if (!url && !description) {
                showNotification("Заполните 'Описание', т.к. URL не указан", "error");
                saveButton.disabled = false; saveButton.innerHTML = id ? '<i class="fas fa-save mr-1"></i> Сохранить изменения' : '<i class="fas fa-plus mr-1"></i> Добавить';
                form.elements.bookmarkDescription.focus(); return;
            }
            if (url) {
                try { new URL(url); } catch (_) {
                    showNotification("Введите корректный URL", "error");
                    saveButton.disabled = false; saveButton.innerHTML = id ? '<i class="fas fa-save mr-1"></i> Сохранить изменения' : '<i class="fas fa-plus mr-1"></i> Добавить';
                    form.elements.bookmarkUrl.focus(); return;
                }
            }

            const screenshotOps = [];
            const newScreenshotBlobs = form._tempScreenshotBlobs || [];
            const idsToDeleteStr = form.dataset.screenshotsToDelete || '';

            newScreenshotBlobs.forEach(blob => { if (blob instanceof Blob) screenshotOps.push({ action: 'add', blob }); });
            idsToDeleteStr.split(',').map(idStr => parseInt(idStr.trim(), 10)).filter(idNum => !isNaN(idNum) && idNum > 0)
                .forEach(idToDelete => screenshotOps.push({ action: 'delete', oldScreenshotId: idToDelete }));
            console.log(`[Save Bookmark v5 TX] Запланировано ${screenshotOps.length} операций со скриншотами.`);

            const isEditing = !!id;
            let finalId = isEditing ? parseInt(id, 10) : null;
            let oldData = null;
            let existingIdsToKeep = [];
            const newDataBase = { title, url: url || null, description: description || null, folder };

            let transaction;
            let saveSuccessful = false;

            try {
                if (!db) throw new Error("База данных недоступна");
                transaction = db.transaction(['bookmarks', 'screenshots'], 'readwrite');
                const bookmarksStore = transaction.objectStore('bookmarks');
                const screenshotsStore = transaction.objectStore('screenshots');
                console.log("[Save Bookmark v5 TX] Транзакция начата.");

                const timestamp = new Date().toISOString();
                let bookmarkReadyPromise;

                if (isEditing) {
                    newDataBase.id = finalId;
                    console.log(`[Save Bookmark v5 TX] Редактирование закладки ID: ${finalId}`);
                    bookmarkReadyPromise = new Promise(async (resolve, reject) => {
                        try {
                            const request = bookmarksStore.get(finalId);
                            request.onsuccess = (e) => {
                                oldData = e.target.result;
                                if (oldData) {
                                    newDataBase.dateAdded = oldData.dateAdded || timestamp;
                                    const deletedIdsSet = new Set(screenshotOps.filter(op => op.action === 'delete').map(op => op.oldScreenshotId));
                                    existingIdsToKeep = (oldData.screenshotIds || []).filter(existingId => !deletedIdsSet.has(existingId));
                                } else { newDataBase.dateAdded = timestamp; }
                                resolve();
                            };
                            request.onerror = (e) => reject(e.target.error || new Error(`Не удалось получить старые данные для ID ${finalId}`));
                        } catch (fetchError) { reject(fetchError); }
                    });
                    newDataBase.dateUpdated = timestamp;
                } else {
                    newDataBase.dateAdded = timestamp;
                    delete newDataBase.id;
                    console.log("[Save Bookmark v5 TX] Добавление новой закладки...");
                    bookmarkReadyPromise = new Promise((resolve, reject) => {
                        const request = bookmarksStore.add(newDataBase);
                        request.onsuccess = (e) => { finalId = e.target.result; newDataBase.id = finalId; resolve(); };
                        request.onerror = (e) => reject(e.target.error || new Error('Ошибка добавления закладки'));
                    });
                }

                await bookmarkReadyPromise;

                if (finalId === null || finalId === undefined) throw new Error("Не удалось определить ID закладки.");
                console.log(`[Save Bookmark v5 TX] ID закладки определен: ${finalId}`);

                const screenshotOpResults = [];
                const screenshotPromises = [];
                const newScreenshotIds = [];

                if (screenshotOps.length > 0) {
                    console.log(`[Save Bookmark v5 TX ${finalId}] Обработка ${screenshotOps.length} операций со скриншотами...`);
                    screenshotOps.forEach(op => {
                        const { action, blob, oldScreenshotId } = op;
                        screenshotPromises.push(new Promise(async (resolve) => {
                            try {
                                if (action === 'delete' && oldScreenshotId) {
                                    const request = screenshotsStore.delete(oldScreenshotId);
                                    request.onsuccess = () => { screenshotOpResults.push({ success: true, action: 'delete', oldId: oldScreenshotId }); resolve(); };
                                    request.onerror = (e) => { screenshotOpResults.push({ success: false, action: 'delete', oldId: oldScreenshotId, error: e.target.error || new Error('Delete failed') }); resolve(); };
                                } else if (action === 'add' && blob instanceof Blob) {
                                    const tempName = `${newDataBase.title}, изобр. ${Date.now() + Math.random()}`;
                                    const record = { blob, parentId: finalId, parentType: 'bookmark', name: tempName, uploadedAt: new Date().toISOString() };
                                    const request = screenshotsStore.add(record);
                                    request.onsuccess = e => { const newId = e.target.result; screenshotOpResults.push({ success: true, action: 'add', newId }); newScreenshotIds.push(newId); resolve(); };
                                    request.onerror = e => { screenshotOpResults.push({ success: false, action: 'add', error: e.target.error || new Error('Add failed') }); resolve(); };
                                } else { screenshotOpResults.push({ success: false, action: op.action || 'unknown', error: new Error('Invalid op') }); resolve(); }
                            } catch (opError) { screenshotOpResults.push({ success: false, action: action, error: opError }); resolve(); }
                        }));
                    });
                    await Promise.all(screenshotPromises);
                    console.log(`[Save Bookmark v5 TX ${finalId}] Операции со скриншотами завершены.`);

                    const failedOps = screenshotOpResults.filter(r => !r.success);
                    if (failedOps.length > 0) throw new Error(`Ошибка операции со скриншотом: ${failedOps[0].error?.message || 'Unknown error'}`);
                }

                newDataBase.screenshotIds = [...new Set([...existingIdsToKeep, ...newScreenshotIds])];
                if (newDataBase.screenshotIds.length === 0) delete newDataBase.screenshotIds;
                console.log(`[Save Bookmark v5 TX ${finalId}] Финальный объект закладки для put:`, JSON.parse(JSON.stringify(newDataBase)));

                const putBookmarkReq = bookmarksStore.put(newDataBase);

                await new Promise((resolve, reject) => {
                    putBookmarkReq.onerror = (e) => reject(e.target.error || new Error(`Ошибка сохранения закладки ${finalId}`));
                    transaction.oncomplete = () => { saveSuccessful = true; resolve(); };
                    transaction.onerror = (e) => reject(e.target.error || new Error("Ошибка транзакции"));
                    transaction.onabort = (e) => reject(e.target.error || new Error("Транзакция прервана"));
                });

            } catch (saveError) {
                console.error(`[Save Bookmark v5 (Robust TX)] КРИТИЧЕСКАЯ ОШИБКА при сохранении закладки ${finalId}:`, saveError);
                if (transaction && transaction.abort && transaction.readyState !== 'done') {
                    try { transaction.abort(); console.log("[Save Bookmark v5] Транзакция отменена в catch."); }
                    catch (e) { console.error("[Save Bookmark v5] Ошибка отмены транзакции:", e); }
                }
                saveSuccessful = false;
                showNotification("Ошибка при сохранении закладки: " + (saveError.message || saveError), "error");
            } finally {
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.innerHTML = id ? '<i class="fas fa-save mr-1"></i> Сохранить изменения' : '<i class="fas fa-plus mr-1"></i> Добавить';
                }
            }

            if (saveSuccessful) {
                console.log(`[Save Bookmark v5 (Robust TX)] Успешно завершено для ID: ${finalId}`);
                const finalDataForIndex = { ...newDataBase };

                if (typeof updateSearchIndex === 'function') {
                    updateSearchIndex('bookmarks', finalId, finalDataForIndex, isEditing ? 'update' : 'add', oldData)
                        .then(() => console.log(`Индекс обновлен для закладки ${finalId}.`))
                        .catch(indexError => console.error(`Ошибка обновления индекса для закладки ${finalId}:`, indexError));
                } else { console.warn("updateSearchIndex не найдена."); }

                showNotification(isEditing ? "Закладка обновлена" : "Закладка добавлена");
                modal.classList.add('hidden');
                form.reset();
                const bookmarkIdInput = form.querySelector('#bookmarkId'); if (bookmarkIdInput) bookmarkIdInput.value = '';
                const modalTitleEl = modal.querySelector('#bookmarkModalTitle'); if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                delete form._tempScreenshotBlobs; delete form.dataset.screenshotsToDelete;
                const thumbsContainer = form.querySelector('#bookmarkScreenshotThumbnailsContainer'); if (thumbsContainer) thumbsContainer.innerHTML = '';

                loadBookmarks();
            } else {
                console.error(`[Save Bookmark v5 (Robust TX)] Сохранение закладки ${finalId} НЕ удалось.`);
            }
        }


        async function loadBookmarks() {
            if (!db) {
                console.error("База данных не инициализирована. Загрузка закладок невозможна.");
                showNotification("Ошибка: База данных недоступна.", "error");
                renderBookmarkFolders([]);
                renderBookmarks([]);
                return false;
            }

            let folders = [];
            let bookmarks = [];
            let foldersCreated = false;
            let instructionsFolderId = null;
            let firstFolderId = null;

            try {
                folders = await getAllFromIndexedDB('bookmarkFolders');
                console.log(`loadBookmarks: Найдено ${folders?.length || 0} существующих папок.`);

                if (!folders?.length) {
                    console.log("Папки не найдены, создаем папки по умолчанию...");
                    const defaultFoldersData = [
                        { name: 'Общие', color: 'blue', dateAdded: new Date().toISOString() },
                        { name: 'Важное', color: 'red', dateAdded: new Date().toISOString() },
                        { name: 'Инструкции', color: 'green', dateAdded: new Date().toISOString() }
                    ];

                    const savedFolderIds = await Promise.all(
                        defaultFoldersData.map(folder => saveToIndexedDB('bookmarkFolders', folder))
                    );

                    const createdFoldersWithIds = defaultFoldersData.map((folder, index) => ({ ...folder, id: savedFolderIds[index] }));
                    console.log("Папки по умолчанию созданы:", createdFoldersWithIds);

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(createdFoldersWithIds.map(folder =>
                            updateSearchIndex('bookmarkFolders', folder.id, folder, 'add')
                                .catch(err => console.error(`Ошибка индексации папки по умолчанию ${folder.id}:`, err))
                        ));
                        console.log("Папки закладок по умолчанию проиндексированы.");
                    }

                    folders = await getAllFromIndexedDB('bookmarkFolders');
                    foldersCreated = true;
                }

                if (folders?.length) {
                    const instructionsFolder = folders.find(f => f.name === 'Инструкции');
                    if (instructionsFolder) {
                        instructionsFolderId = instructionsFolder.id;
                    }
                    firstFolderId = folders[0]?.id;
                }
                console.log(`loadBookmarks: Определены ID. Инструкции: ${instructionsFolderId}, Первая папка: ${firstFolderId}`);

                renderBookmarkFolders(folders || []);

                bookmarks = await getAllFromIndexedDB('bookmarks');
                console.log(`loadBookmarks: Найдено ${bookmarks?.length || 0} существующих закладок.`);

                if (!bookmarks?.length && folders?.length) {
                    console.log("Закладки не найдены, создаем примеры закладок...");

                    if (firstFolderId === null) {
                        console.error("Критическая ошибка: не удалось определить ID первой папки для создания примеров закладок.");
                        throw new Error("Не найден ID папки для примеров.");
                    }
                    const targetFolderIdForKB = instructionsFolderId ?? firstFolderId;
                    const targetFolderIdForNote = firstFolderId;

                    const sampleBookmarksData = [
                        {
                            title: 'База знаний КриптоПро',
                            url: 'https://support.cryptopro.ru/kb',
                            description: 'Официальная база знаний КриптоПро.',
                            folder: targetFolderIdForKB,
                            dateAdded: new Date().toISOString()
                        },
                        {
                            title: 'База знаний Рутокен',
                            url: 'https://dev.rutoken.ru/display/KB/Knowledge+Base',
                            description: 'Официальная база знаний Рутокен.',
                            folder: targetFolderIdForKB,
                            dateAdded: new Date().toISOString()
                        },
                        {
                            title: 'Пример текстовой заметки',
                            url: null,
                            description: 'Это пример текстовой заметки, сохраненной в системе закладок. У нее нет URL-адреса.',
                            folder: targetFolderIdForNote,
                            dateAdded: new Date().toISOString()
                        }
                    ];

                    const savedBookmarkIds = await Promise.all(
                        sampleBookmarksData.map(bookmark => saveToIndexedDB('bookmarks', bookmark))
                    );
                    const bookmarksWithIds = sampleBookmarksData.map((bookmark, index) => ({ ...bookmark, id: savedBookmarkIds[index] }));
                    console.log("Примеры закладок созданы:", bookmarksWithIds);

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(bookmarksWithIds.map(bookmark =>
                            updateSearchIndex('bookmarks', bookmark.id, bookmark, 'add')
                                .catch(err => console.error(`Ошибка индексации примера закладки ${bookmark.id}:`, err))
                        ));
                        console.log("Примеры закладок проиндексированы.");
                    }

                    bookmarks = await getAllFromIndexedDB('bookmarks');
                }

                const folderMap = (folders || []).reduce((map, folder) => {
                    map[folder.id] = folder;
                    return map;
                }, {});
                renderBookmarks(bookmarks || [], folderMap);

                console.log(`Загрузка закладок завершена. Загружено ${folders?.length || 0} папок и ${bookmarks?.length || 0} закладок.`);
                return true;

            } catch (error) {
                console.error("Критическая ошибка при загрузке закладок или папок:", error);
                renderBookmarkFolders([]);
                renderBookmarks([]);
                showNotification("Критическая ошибка загрузки данных закладок.", "error");
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


        async function loadFoldersList(foldersListElement) {
            if (!foldersListElement) {
                console.error("loadFoldersList: Контейнер для списка папок не передан.");
                return;
            }

            foldersListElement.innerHTML = '<div class="text-center py-4 text-gray-500">Загрузка папок...</div>';

            try {
                const folders = await getAllFromIndexedDB('bookmarkFolders');

                if (!folders || folders.length === 0) {
                    foldersListElement.innerHTML = '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
                    return;
                }

                foldersListElement.innerHTML = '';
                const fragment = document.createDocumentFragment();

                folders.forEach(folder => {
                    const folderItem = document.createElement('div');
                    folderItem.className = 'folder-item flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0';
                    folderItem.dataset.folderId = folder.id;

                    const colorName = folder.color || 'gray';
                    const colorClass = `bg-${colorName}-500`;

                    folderItem.innerHTML = `
                <div class="flex items-center flex-grow min-w-0 mr-2">
                    <span class="w-4 h-4 rounded-full ${colorClass} mr-2 flex-shrink-0"></span>
                    <span class="truncate" title="${folder.name}">${folder.name}</span>
                </div>
                <div class="flex-shrink-0">
                    <button class="edit-folder-btn p-1 text-gray-500 hover:text-primary" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-folder-btn p-1 text-gray-500 hover:text-red-500 ml-1" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

                    const deleteBtn = folderItem.querySelector('.delete-folder-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (confirm(`Вы уверены, что хотите удалить папку "${folder.name}"? Закладки в ней не будут удалены, но потеряют привязку к папке.`)) {
                                handleDeleteBookmarkFolderClick(folder.id, folderItem);
                            }
                        });
                    }

                    const editBtn = folderItem.querySelector('.edit-folder-btn');
                    if (editBtn) {
                        editBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const modal = document.getElementById('foldersModal');
                            if (!modal) return;

                            const form = modal.querySelector('#folderForm');
                            if (!form) return;

                            try {
                                const folderData = await getFromIndexedDB('bookmarkFolders', folder.id);
                                if (folderData) {
                                    form.elements.folderName.value = folderData.name;
                                    const colorInput = form.querySelector(`input[name="folderColor"][value="${folderData.color || 'blue'}"]`);
                                    if (colorInput) colorInput.checked = true;
                                    form.dataset.editingId = folder.id;
                                    const submitButton = form.querySelector('button[type="submit"]');
                                    if (submitButton) submitButton.textContent = 'Сохранить изменения';
                                    form.elements.folderName.focus();
                                } else {
                                    showNotification("Не удалось загрузить данные папки для редактирования", "error");
                                }
                            } catch (error) {
                                console.error("Ошибка загрузки папки для редактирования:", error);
                                showNotification("Ошибка загрузки папки", "error");
                            }
                        });
                    }

                    fragment.appendChild(folderItem);
                });

                foldersListElement.appendChild(fragment);

            } catch (error) {
                console.error("Ошибка при загрузке списка папок:", error);
                foldersListElement.innerHTML = '<div class="text-center py-4 text-red-500">Не удалось загрузить папки</div>';
                showNotification("Ошибка загрузки списка папок", "error");
            }
        }


        async function renderBookmarks(bookmarks, folderMap = {}) {
            const bookmarksContainer = document.getElementById('bookmarksContainer');
            if (!bookmarksContainer) {
                console.error("Контейнер #bookmarksContainer не найден. Отрисовка закладок невозможна.");
                return;
            }

            bookmarksContainer.innerHTML = '';

            if (!bookmarks?.length) {
                bookmarksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных закладок</div>';
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView('bookmarksContainer');
                } else {
                    applyView(bookmarksContainer, 'cards');
                    console.warn("applyCurrentView не найдена, применен вид 'cards' по умолчанию для пустого списка.");
                }
                return;
            }

            const fragment = document.createDocumentFragment();

            bookmarks.forEach(bookmark => {
                if (!bookmark || typeof bookmark.id === 'undefined') {
                    console.warn("Пропуск невалидной закладки (отсутствует id или сам объект):", bookmark);
                    return;
                }

                const bookmarkElement = document.createElement('div');
                bookmarkElement.className = 'bookmark-item view-item group cursor-pointer flex flex-col justify-between h-full bg-white dark:bg-[#374151] shadow-md hover:shadow-lg transition-shadow duration-200 rounded-lg border border-gray-200 dark:border-gray-700 p-4';
                bookmarkElement.dataset.id = bookmark.id;
                if (bookmark.folder) {
                    bookmarkElement.dataset.folder = bookmark.folder;
                }

                const folder = bookmark.folder ? folderMap[bookmark.folder] : null;
                let folderBadgeHTML = '';

                if (folder) {
                    const colorName = folder.color || 'gray';
                    folderBadgeHTML = `
                                        <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-${colorName}-100 text-${colorName}-800 dark:bg-${colorName}-900 dark:text-${colorName}-200" title="Папка: ${escapeHtml(folder.name)}">
                                            <i class="fas fa-folder mr-1 opacity-75"></i>${escapeHtml(folder.name)}
                                        </span>`;
                } else if (bookmark.folder) {
                    folderBadgeHTML = `
    <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Папка с ID: ${bookmark.folder} не найдена">
        <i class="fas fa-question-circle mr-1 opacity-75"></i>Неизв. папка
    </span>`;
                }

                let urlHostnameHTML = '';
                let externalLinkIconHTML = '';
                let cardClickOpensUrl = false;

                if (bookmark.url) {
                    try {
                        const urlObject = new URL(bookmark.url);
                        const safeUrl = escapeHtml(bookmark.url);
                        urlHostnameHTML = `
                                            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="bookmark-url text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary text-xs inline-flex items-center mt-1 break-all group-hover:underline" title="Перейти: ${safeUrl}">
                                                <i class="fas fa-link mr-1 opacity-75"></i>${escapeHtml(urlObject.hostname)}
                                            </a>`;
                        externalLinkIconHTML = `
                                            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" data-action="open-link" class="p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Открыть ссылку в новой вкладке">
                                                <i class="fas fa-external-link-alt"></i>
                                            </a>`;
                        cardClickOpensUrl = true;
                    } catch (e) {
                        console.warn(`Некорректный URL для закладки ID ${bookmark.id}: ${bookmark.url}`);
                        urlHostnameHTML = `
                                            <span class="text-red-500 text-xs mt-1 inline-flex items-center" title="Некорректный URL: ${escapeHtml(bookmark.url)}">
                                                <i class="fas fa-exclamation-triangle mr-1"></i> Некорр. URL
                                            </span>`;
                        externalLinkIconHTML = `
                                            <span class="p-1.5 text-red-400 cursor-not-allowed" title="Некорректный URL, нельзя открыть">
                                                <i class="fas fa-times-circle"></i>
                                            </span>`;
                        cardClickOpensUrl = false;
                    }
                } else {
                    externalLinkIconHTML = `
                                            <span class="p-1.5 text-gray-400 dark:text-gray-500 cursor-help" title="Текстовая заметка (нет URL)">
                                                <i class="fas fa-sticky-note"></i>
                                            </span>`;
                    cardClickOpensUrl = false;
                }

                bookmarkElement.dataset.opensUrl = cardClickOpensUrl;

                const safeTitle = escapeHtml(bookmark.title || 'Без названия');
                const safeDescription = escapeHtml(bookmark.description || '');
                const descriptionHTML = safeDescription
                    ? `<p class="bookmark-description text-gray-600 dark:text-gray-400 text-sm mt-1 mb-2 line-clamp-3" title="${safeDescription}">${safeDescription}</p>`
                    : (bookmark.url ? '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Нет описания</p>' : '<p class="bookmark-description text-sm mt-1 mb-2 italic text-gray-500">Текстовая заметка</p>');

                const mainContentHTML = `
                                        <div class="flex-grow min-w-0 mb-3">
                                            <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 group-hover:text-primary dark:group-hover:text-primary transition-colors duration-200 truncate" title="${safeTitle}">
                                                ${safeTitle}
                                            </h3>
                                            ${descriptionHTML}
                                            <div class="bookmark-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2">
                                                ${folderBadgeHTML}
                                                <span class="text-gray-500 dark:text-gray-400" title="Добавлено: ${new Date(bookmark.dateAdded || Date.now()).toLocaleString()}">
                                                    <i class="far fa-clock mr-1 opacity-75"></i>${new Date(bookmark.dateAdded || Date.now()).toLocaleDateString()}
                                                </span>
                                                ${urlHostnameHTML}
                                            </div>
                                        </div>`;

                const actionsHTML = `
                                    <div class="bookmark-actions flex flex-shrink-0 items-center mt-auto pt-2 border-t border-gray-200 dark:border-gray-700 -mx-4 px-4 -mb-2 pb-2 justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                                        ${externalLinkIconHTML}
                                        <button data-action="edit" class="edit-bookmark p-1.5 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1" title="Редактировать">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button data-action="delete" class="delete-bookmark p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1" title="Удалить">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>`;

                bookmarkElement.innerHTML = mainContentHTML + actionsHTML;
                fragment.appendChild(bookmarkElement);
            });

            bookmarksContainer.appendChild(fragment);

            bookmarksContainer.removeEventListener('click', handleBookmarkAction);
            bookmarksContainer.addEventListener('click', handleBookmarkAction);

            if (typeof applyCurrentView === 'function') {
                applyCurrentView('bookmarksContainer');
            } else {
                applyView(bookmarksContainer, 'cards');
                console.warn("applyCurrentView не найдена, применен вид 'cards' по умолчанию.");
            }
        }


        async function handleBookmarkAction(event) {
            const target = event.target;
            const bookmarkItem = target.closest('.bookmark-item[data-id]');
            if (!bookmarkItem) return;

            const bookmarkId = parseInt(bookmarkItem.dataset.id, 10);
            if (isNaN(bookmarkId)) {
                console.error("Невалидный ID закладки:", bookmarkItem.dataset.id);
                return;
            }

            const button = target.closest('button[data-action], a[data-action]');
            const actionTarget = button || target;

            let action = button ? button.dataset.action : null;
            if (!action && actionTarget.closest('.bookmark-item')) {
                const opensUrl = bookmarkItem.dataset.opensUrl === 'true';
                if (opensUrl) {
                    action = 'open-card-url';
                } else {
                    action = 'view-details';
                }
            }

            if (!action) {
                return;
            }

            console.log(`Действие '${action}' для закладки ID: ${bookmarkId}`);

            if (button) {
                event.stopPropagation();
                event.preventDefault();
            }

            if (action === 'edit') {
                if (typeof showEditBookmarkModal === 'function') {
                    showEditBookmarkModal(bookmarkId);
                } else {
                    console.error("Функция showEditBookmarkModal не определена.");
                    showNotification("Функция редактирования недоступна.", "error");
                }
            } else if (action === 'delete') {
                const title = bookmarkItem.querySelector('h3')?.title || `закладку с ID ${bookmarkId}`;
                if (confirm(`Вы уверены, что хотите удалить закладку "${title}"?`)) {
                    if (typeof deleteBookmark === 'function') {
                        deleteBookmark(bookmarkId);
                    } else {
                        console.error("Функция deleteBookmark не определена.");
                        showNotification("Функция удаления недоступна.", "error");
                    }
                }
            } else if (action === 'open-link-icon' || action === 'open-link-hostname' || action === 'open-card-url') {
                const url = action === 'open-card-url'
                    ? bookmarkItem.querySelector('a.bookmark-url')?.href
                    : (button || actionTarget)?.href;

                if (url) {
                    try {
                        new URL(url);
                        console.log(`Открытие URL (${action}) для закладки ${bookmarkId}: ${url}`);
                        window.open(url, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                        console.error(`Некорректный URL (${action}) для закладки ${bookmarkId}: ${url}`, e);
                        showNotification("Некорректный URL у этой закладки.", "error");
                        if (action === 'open-card-url') {
                            if (typeof showBookmarkDetailModal === 'function') {
                                showBookmarkDetailModal(bookmarkId);
                            } else {
                                console.warn("Функция showBookmarkDetailModal не определена.");
                            }
                        }
                    }
                } else {
                    console.warn(`Нет URL для действия '${action}' у закладки ID: ${bookmarkId}`);
                    if (action === 'open-card-url') {
                        if (typeof showBookmarkDetailModal === 'function') {
                            showBookmarkDetailModal(bookmarkId);
                        } else {
                            console.warn("Функция showBookmarkDetailModal не определена.");
                        }
                    }
                }
            } else if (action === 'view-screenshots') {
                if (typeof handleViewBookmarkScreenshots === 'function') {
                    handleViewBookmarkScreenshots(bookmarkId);
                } else {
                    console.error("Функция handleViewBookmarkScreenshots не определена.");
                    showNotification("Функция просмотра скриншотов недоступна.", "error");
                }
            } else if (action === 'view-details') {
                if (typeof showBookmarkDetailModal === 'function') {
                    showBookmarkDetailModal(bookmarkId);
                } else {
                    console.warn("Функция showBookmarkDetailModal не определена.");
                    showNotification("Невозможно отобразить детали этой заметки.", "info");
                }
            }
        }


        async function handleViewBookmarkScreenshots(bookmarkId) {
            console.log(`[handleViewBookmarkScreenshots] Запрос скриншотов для закладки ID: ${bookmarkId}`);
            const button = document.querySelector(`.bookmark-item[data-id="${bookmarkId}"] button[data-action="view-screenshots"]`);
            let originalContent, iconElement, originalIconClass;

            if (button) {
                originalContent = button.innerHTML;
                iconElement = button.querySelector('i');
                originalIconClass = iconElement ? iconElement.className : null;
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            try {
                const allParentScreenshots = await getAllFromIndex('screenshots', 'parentId', bookmarkId);

                const bookmarkScreenshots = allParentScreenshots.filter(s => s.parentType === 'bookmark');
                console.log(`[handleViewBookmarkScreenshots] Найдено и отфильтровано ${bookmarkScreenshots.length} скриншотов.`);

                if (bookmarkScreenshots.length === 0) {
                    showNotification("Для этой закладки нет скриншотов.", "info");
                    return;
                }

                let bookmarkTitle = `Закладка ID ${bookmarkId}`;
                try {
                    const bookmarkData = await getFromIndexedDB('bookmarks', bookmarkId);
                    if (bookmarkData && bookmarkData.title) {
                        bookmarkTitle = bookmarkData.title;
                    }
                } catch (titleError) {
                    console.warn(`Не удалось получить название закладки ${bookmarkId}:`, titleError);
                }

                if (typeof showScreenshotViewerModal === 'function') {
                    await showScreenshotViewerModal(bookmarkScreenshots, bookmarkId, bookmarkTitle);
                } else {
                    console.error("Функция showScreenshotViewerModal не определена!");
                    showNotification("Ошибка: Функция просмотра скриншотов недоступна.", "error");
                }

            } catch (error) {
                console.error(`Ошибка при загрузке скриншотов для закладки ID ${bookmarkId}:`, error);
                showNotification(`Ошибка загрузки скриншотов: ${error.message || 'Неизвестная ошибка'}`, "error");
            } finally {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = originalContent;
                }
            }
        }


        async function deleteBookmark(id) {
            const numericId = parseInt(id, 10);
            if (isNaN(numericId)) {
                console.error("deleteBookmark: Передан невалидный ID:", id);
                showNotification("Ошибка: Неверный ID закладки для удаления.", "error");
                return;
            }

            let bookmarkToDelete = null;
            let screenshotIdsToDelete = [];
            let transaction;

            try {
                try {
                    bookmarkToDelete = await getFromIndexedDB('bookmarks', numericId);
                    if (!bookmarkToDelete) {
                        console.warn(`Закладка с ID ${numericId} не найдена в базе данных. Возможно, уже удалена.`);
                        removeBookmarkFromDOM(numericId);
                        showNotification("Закладка не найдена (возможно, уже удалена).", "warning");
                        return;
                    }
                    if (Array.isArray(bookmarkToDelete.screenshotIds) && bookmarkToDelete.screenshotIds.length > 0) {
                        screenshotIdsToDelete = [...bookmarkToDelete.screenshotIds];
                        console.log(`Найдены ID скриншотов [${screenshotIdsToDelete.join(',')}] для удаления вместе с закладкой ${numericId}.`);
                    } else {
                        console.log(`Скриншоты для закладки ${numericId} не найдены или отсутствуют.`);
                    }
                } catch (fetchError) {
                    console.error(`Ошибка при получении данных закладки ${numericId} перед удалением:`, fetchError);
                    showNotification("Не удалось получить данные скриншотов, но будет предпринята попытка удалить закладку.", "warning");
                }

                if (bookmarkToDelete && typeof updateSearchIndex === 'function') {
                    try {
                        await updateSearchIndex('bookmarks', numericId, null, 'delete', bookmarkToDelete);
                        console.log(`Обновление индекса (delete) для закладки ID: ${numericId} инициировано.`);
                    } catch (indexError) {
                        console.error(`Ошибка обновления поискового индекса при удалении закладки ${numericId}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса.", "warning");
                    }
                } else {
                    console.warn(`Обновление индекса для закладки ${numericId} пропущено (данные не получены или функция недоступна).`);
                }

                const stores = ['bookmarks'];
                if (screenshotIdsToDelete.length > 0) {
                    stores.push('screenshots');
                }

                transaction = db.transaction(stores, 'readwrite');
                const bookmarkStore = transaction.objectStore('bookmarks');
                const screenshotStore = stores.includes('screenshots') ? transaction.objectStore('screenshots') : null;

                const deletePromises = [];

                deletePromises.push(new Promise((resolve, reject) => {
                    const req = bookmarkStore.delete(numericId);
                    req.onsuccess = () => { console.log(`Запрос на удаление закладки ${numericId} успешен.`); resolve(); };
                    req.onerror = (e) => { console.error(`Ошибка запроса на удаление закладки ${numericId}:`, e.target.error); reject(e.target.error); };
                }));

                if (screenshotStore && screenshotIdsToDelete.length > 0) {
                    screenshotIdsToDelete.forEach(screenshotId => {
                        deletePromises.push(new Promise((resolve, reject) => {
                            const req = screenshotStore.delete(screenshotId);
                            req.onsuccess = () => { console.log(`Запрос на удаление скриншота ${screenshotId} успешен.`); resolve(); };
                            req.onerror = (e) => { console.error(`Ошибка запроса на удаление скриншота ${screenshotId}:`, e.target.error); reject(e.target.error); };
                        }));
                    });
                }

                await Promise.all(deletePromises);
                console.log("Все запросы на удаление (закладка + скриншоты) успешно инициированы.");

                await new Promise((resolve, reject) => {
                    transaction.oncomplete = () => {
                        console.log(`Транзакция удаления закладки ${numericId} и скриншотов успешно завершена.`);
                        resolve();
                    };
                    transaction.onerror = (e) => {
                        console.error(`Ошибка ТРАНЗАКЦИИ при удалении закладки ${numericId}:`, e.target.error);
                        reject(e.target.error || new Error("Неизвестная ошибка транзакции"));
                    };
                    transaction.onabort = (e) => {
                        console.warn(`Транзакция удаления закладки ${numericId} прервана:`, e.target.error);
                        reject(e.target.error || new Error("Транзакция прервана"));
                    };
                });

                removeBookmarkFromDOM(numericId);
                showNotification("Закладка и связанные скриншоты удалены");

            } catch (error) {
                console.error(`Критическая ошибка при удалении закладки ID ${numericId}:`, error);
                showNotification("Ошибка при удалении закладки: " + (error.message || error), "error");
                if (transaction && transaction.abort && transaction.readyState !== 'done') {
                    try { transaction.abort(); } catch (abortErr) { console.error("Ошибка отмены транзакции в catch:", abortErr); }
                }
                await loadBookmarks();
            }
        }


        async function showEditBookmarkModal(id) {
            const modalElements = await ensureBookmarkModal();
            if (!modalElements) {
                showNotification("Ошибка инициализации окна редактирования закладки", "error");
                console.error("Не удалось получить элементы модального окна из ensureBookmarkModal.");
                return;
            }
            const { modal, form, modalTitle, submitButton, idInput, titleInput, urlInput, descriptionInput, folderSelect, thumbsContainer } = modalElements;

            if (!modal || !form || !modalTitle || !submitButton || !idInput || !titleInput || !urlInput || !descriptionInput || !folderSelect || !thumbsContainer) {
                console.error("showEditBookmarkModal: Отсутствуют один или несколько ключевых элементов модального окна ПОСЛЕ ensureBookmarkModal.", modalElements);
                showNotification("Ошибка интерфейса: не найдены элементы окна закладки (возможно, контейнер скриншотов).", "error");
                if (modal) modal.classList.add('hidden');
                return;
            }

            try {
                const bookmark = await getFromIndexedDB('bookmarks', id);
                if (!bookmark) {
                    showNotification("Закладка не найдена", "error");
                    console.warn(`Попытка редактировать несуществующую закладку с ID: ${id}`);
                    modal.classList.add('hidden');
                    return;
                }

                form.reset();
                delete form._tempScreenshotBlobs;
                delete form.dataset.screenshotsToDelete;
                delete form.dataset.existingScreenshotIds;
                delete form.dataset.existingRendered;
                thumbsContainer.innerHTML = '';

                idInput.value = bookmark.id;
                titleInput.value = bookmark.title || '';
                urlInput.value = bookmark.url || '';
                descriptionInput.value = bookmark.description || '';

                try {
                    if (typeof populateBookmarkFolders === 'function') {
                        await populateBookmarkFolders(folderSelect);
                        folderSelect.value = bookmark.folder || '';
                        if (bookmark.folder && folderSelect.value !== String(bookmark.folder)) {
                            console.warn(`Папка с ID ${bookmark.folder} не найдена в списке при редактировании.`);
                        }
                    } else {
                        console.warn("Функция populateBookmarkFolders не найдена.");
                        folderSelect.value = '';
                    }
                } catch (error) {
                    console.error("Не удалось загрузить или установить папки для формы редактирования закладки:", error);
                    showNotification("Ошибка загрузки списка папок", "warning");
                    folderSelect.value = '';
                }

                modalTitle.textContent = 'Редактировать закладку';
                submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
                submitButton.disabled = false;

                const existingIds = bookmark.screenshotIds || [];
                if (existingIds.length > 0) {
                    console.log(`Найдены существующие скриншоты (${existingIds.length}) для закладки ${id}. Рендеринг...`);
                    form.dataset.existingScreenshotIds = existingIds.join(',');

                    if (typeof renderExistingThumbnail === 'function') {
                        const renderPromises = existingIds.map(screenshotId =>
                            renderExistingThumbnail(screenshotId, thumbsContainer, form)
                                .catch(err => console.error(`Ошибка рендеринга существующей миниатюры ID ${screenshotId}:`, err))
                        );
                        await Promise.all(renderPromises);
                        console.log("Рендеринг существующих миниатюр для закладки завершен.");
                    } else {
                        console.error("ГЛОБАЛЬНАЯ Функция renderExistingThumbnail не найдена!");
                        thumbsContainer.innerHTML = '<p class="text-red-500 text-xs">Ошибка рендеринга.</p>';
                    }
                } else {
                    form.dataset.existingScreenshotIds = '';
                    console.log(`Существующие скриншоты для закладки ${id} не найдены.`);
                }
                form.dataset.existingRendered = 'true';

                if (typeof attachBookmarkScreenshotHandlers === 'function') {
                    attachBookmarkScreenshotHandlers(form);
                    console.log("attachBookmarkScreenshotHandlers вызван в showEditBookmarkModal после рендеринга.");
                } else {
                    console.error("Функция attachBookmarkScreenshotHandlers не найдена в showEditBookmarkModal!");
                }

                modal.classList.remove('hidden');

                if (titleInput) {
                    setTimeout(() => {
                        try { titleInput.focus(); }
                        catch (focusError) { console.warn("Не удалось установить фокус:", focusError); }
                    }, 50);
                }

            } catch (error) {
                console.error("Ошибка при загрузке закладки для редактирования:", error);
                showNotification("Ошибка загрузки закладки для редактирования", "error");
                modal.classList.add('hidden');
            }
        }


        function renderLinks(links) {
            const linksContainer = document.getElementById('linksContainer');
            if (!linksContainer) return;

            linksContainer.innerHTML = '';

            if (!links?.length) {
                linksContainer.innerHTML = '<div class="text-center py-6 text-gray-500">Нет сохраненных ссылок</div>';
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView('linksContainer');
                } else {
                    console.warn("Функция applyCurrentView не найдена, состояние вида может быть некорректным.");
                }
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

                linkElement.className = 'cib-link-item view-item flex items-start p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition duration-150 ease-in-out';
                linkElement.dataset.id = link.id;
                if (link.category) linkElement.dataset.category = link.category;

                linkElement.innerHTML = `
            <div class="flex-grow min-w-0 mr-3">
                <h3 class="font-bold truncate text-gray-900 dark:text-gray-100" title="${link.title}">${link.title}</h3>
                <p class="link-description text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">${link.description || ''}</p>
                <div class="link-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    ${categoryBadgeHTML}
                    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-url text-primary hover:underline text-sm inline-flex items-center">
                        <i class="fas fa-external-link-alt mr-1 text-xs"></i>Открыть
                    </a>
                </div>
                <div class="link-code-container mt-2">
                    <code class="text-xs bg-gray-100 dark:bg-gray-700 p-1 rounded inline-block break-all">${link.url}</code>
                </div>
            </div>
            <div class="flex flex-shrink-0 items-center space-x-1">
                <button data-action="edit" class="edit-link p-1 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary" title="Редактировать">
                    <i class="fas fa-edit fa-fw"></i>
                </button>
                <button data-action="delete" class="delete-link p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500" title="Удалить">
                    <i class="fas fa-trash fa-fw"></i>
                </button>
            </div>`;
                fragment.appendChild(linkElement);
            });

            linksContainer.appendChild(fragment);

            if (typeof applyCurrentView === 'function') {
                applyCurrentView('linksContainer');
            } else {
                console.warn("Функция applyCurrentView не найдена, состояние вида может быть некорректным после рендеринга ссылок.");
            }
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
                searchInputSelector: '#linkSearchInput',
                textSelectors: ['h3', 'code', 'p']
            });
        }

        document.getElementById('bookmarkSearchInput')?.addEventListener('input', debounce(filterBookmarks, 250));
        document.getElementById('linkSearchInput')?.addEventListener('input', debounce(filterLinks, 250));

        document.getElementById('bookmarkFolderFilter')?.addEventListener('change', filterBookmarks);


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


        async function showAddBookmarkModal(bookmarkToEditId = null) {
            const modalElements = await ensureBookmarkModal();
            if (!modalElements) {
                showNotification("Критическая ошибка: Не удалось инициализировать окно закладки", "error");
                return;
            }

            const { modal, form, modalTitle, submitButton, idInput, titleInput, urlInput, descriptionInput, folderSelect } = modalElements;

            if (!modal || !form || !modalTitle || !submitButton || !idInput || !titleInput || !urlInput || !descriptionInput || !folderSelect) {
                console.error("showAddBookmarkModal: Отсутствуют один или несколько ключевых элементов модального окна после ensureBookmarkModal.", modalElements);
                showNotification("Ошибка интерфейса: не найдены элементы окна закладки.", "error");
                return;
            }

            form.reset();
            idInput.value = '';

            try {
                await populateBookmarkFolders(folderSelect);
            } catch (error) {
                console.error("Ошибка при заполнении папок в showAddBookmarkModal:", error);
                showNotification("Не удалось загрузить папки для формы.", "warning");
            }

            submitButton.disabled = false;

            if (bookmarkToEditId !== null) {
                modalTitle.textContent = 'Редактировать закладку';
                submitButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';

                try {
                    const bookmark = await getFromIndexedDB('bookmarks', bookmarkToEditId);

                    if (bookmark) {
                        idInput.value = bookmark.id;
                        titleInput.value = bookmark.title || '';
                        urlInput.value = bookmark.url || '';
                        descriptionInput.value = bookmark.description || '';
                        if (bookmark.folderId) {
                            folderSelect.value = bookmark.folderId;
                            if (folderSelect.value !== String(bookmark.folderId)) {
                                console.warn(`Папка с ID ${bookmark.folderId} для закладки ${bookmark.id} не найдена в списке.`);
                            }
                        } else {
                            folderSelect.value = "";
                        }
                    } else {
                        console.error(`Закладка с ID ${bookmarkToEditId} не найдена для редактирования.`);
                        showNotification("Не удалось загрузить данные закладки для редактирования.", "error");
                        modal.classList.add('hidden');
                        return;
                    }
                } catch (error) {
                    console.error(`Ошибка при загрузке закладки ${bookmarkToEditId} для редактирования:`, error);
                    showNotification("Ошибка загрузки данных для редактирования.", "error");
                    modal.classList.add('hidden');
                    return;
                }

            } else {
                modalTitle.textContent = 'Добавить закладку';
                submitButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
            }

            modal.classList.remove('hidden');

            if (titleInput) {
                setTimeout(() => {
                    try {
                        titleInput.focus();
                    } catch (focusError) {
                        console.warn("Не удалось установить фокус на поле заголовка:", focusError);
                    }
                }, 50);
            } else {
                console.warn("showAddBookmarkModal: Поле ввода заголовка не найдено для установки фокуса.");
            }
        }


        async function showBookmarkDetailModal(bookmarkId) {
            const modalId = 'bookmarkDetailModal';
            let modal = document.getElementById(modalId);
            const isNewModal = !modal;

            if (isNewModal) {
                modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-[60] p-4 flex items-center justify-center';
                modal.innerHTML = `
                                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
                                        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                                            <div class="flex justify-between items-center">
                                                <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100" id="bookmarkDetailTitle">Детали закладки</h2>
                                                <button type="button" class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Закрыть (Esc)">
                                                    <i class="fas fa-times text-xl"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="p-6 overflow-y-auto flex-1" id="bookmarkDetailOuterContent">
                                            <div class="prose dark:prose-invert max-w-none mb-6" id="bookmarkDetailTextContent">
                                                <p>Загрузка...</p>
                                            </div>
                                            <div id="bookmarkDetailScreenshotsContainer" class="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                                                <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">Скриншоты:</h4>
                                                <div id="bookmarkDetailScreenshotsGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                                </div>
                                            </div>
                                        </div>
                                        <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                                            <button type="button" id="editBookmarkFromDetailBtn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">
                                                <i class="fas fa-edit mr-1"></i> Редактировать
                                            </button>
                                            <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition">
                                                Закрыть
                                            </button>
                                        </div>
                                    </div>
                                `;
                document.body.appendChild(modal);

                modal.addEventListener('click', (e) => {
                    const currentModal = document.getElementById(modalId);
                    if (!currentModal) return;

                    if (e.target.closest('.close-modal, .cancel-modal')) {
                        if (currentModal._escapeHandler) {
                            document.removeEventListener('keydown', currentModal._escapeHandler);
                            delete currentModal._escapeHandler;
                        }
                        currentModal.classList.add('hidden');
                        const images = currentModal.querySelectorAll('#bookmarkDetailScreenshotsGrid img[data-object-url]');
                        images.forEach(img => {
                            if (img.dataset.objectUrl) {
                                try { URL.revokeObjectURL(img.dataset.objectUrl); } catch (revokeError) { console.warn("Error revoking URL on close:", revokeError); }
                                delete img.dataset.objectUrl;
                            }
                        });
                    }
                    else if (e.target.closest('#editBookmarkFromDetailBtn')) {
                        const currentId = parseInt(currentModal.dataset.currentBookmarkId, 10);
                        if (!isNaN(currentId)) {
                            currentModal.classList.add('hidden');
                            if (currentModal._escapeHandler) {
                                document.removeEventListener('keydown', currentModal._escapeHandler);
                                delete currentModal._escapeHandler;
                            }
                            if (typeof showAddBookmarkModal === 'function') {
                                showAddBookmarkModal(currentId);
                            } else {
                                console.error("Функция showAddBookmarkModal не определена!");
                                showNotification("Ошибка: функция редактирования недоступна.", "error");
                            }
                        } else {
                            console.error("Не удалось получить ID закладки для редактирования из dataset");
                            showNotification("Ошибка: не удалось определить ID для редактирования", "error");
                        }
                    }
                });

                const closeModalOnEscape = (e) => {
                    const currentModalInstance = document.getElementById(modalId);
                    if (e.key === 'Escape' && currentModalInstance && !currentModalInstance.classList.contains('hidden')) {
                        currentModalInstance.classList.add('hidden');
                        document.removeEventListener('keydown', closeModalOnEscape);
                        delete currentModalInstance._escapeHandler;
                        const images = currentModalInstance.querySelectorAll('#bookmarkDetailScreenshotsGrid img[data-object-url]');
                        images.forEach(img => {
                            if (img.dataset.objectUrl) {
                                try { URL.revokeObjectURL(img.dataset.objectUrl); } catch (revokeError) { console.warn("Error revoking URL on escape:", revokeError); }
                                delete img.dataset.objectUrl;
                            }
                        });
                    }
                };
                modal._closeModalOnEscape = closeModalOnEscape;
            }

            const titleEl = modal.querySelector('#bookmarkDetailTitle');
            const textContentEl = modal.querySelector('#bookmarkDetailTextContent');
            const screenshotsContainer = modal.querySelector('#bookmarkDetailScreenshotsContainer');
            const screenshotsGridEl = modal.querySelector('#bookmarkDetailScreenshotsGrid');
            const editButton = modal.querySelector('#editBookmarkFromDetailBtn');

            if (!titleEl || !textContentEl || !screenshotsContainer || !screenshotsGridEl || !editButton) {
                console.error("Не найдены необходимые элементы в модальном окне деталей закладки.");
                if (modal) modal.classList.add('hidden');
                return;
            }

            if (modal._escapeHandler) {
                document.removeEventListener('keydown', modal._escapeHandler);
                delete modal._escapeHandler;
            }
            if (modal._closeModalOnEscape) {
                document.addEventListener('keydown', modal._closeModalOnEscape);
                modal._escapeHandler = modal._closeModalOnEscape;
            }

            modal.dataset.currentBookmarkId = bookmarkId;
            titleEl.textContent = 'Загрузка...';
            textContentEl.innerHTML = '<p>Загрузка...</p>';
            screenshotsGridEl.innerHTML = '';
            screenshotsContainer.classList.add('hidden');
            editButton.classList.add('hidden');

            modal.classList.remove('hidden');

            try {
                const bookmark = await getFromIndexedDB('bookmarks', bookmarkId);

                if (bookmark) {
                    titleEl.textContent = bookmark.title || 'Без названия';
                    const preElement = document.createElement('pre');
                    preElement.className = 'whitespace-pre-wrap break-words text-sm font-sans';
                    preElement.style.fontSize = '102%';
                    preElement.textContent = bookmark.description || 'Нет описания.';
                    textContentEl.innerHTML = '';
                    textContentEl.appendChild(preElement);

                    editButton.classList.remove('hidden');

                    if (bookmark.screenshotIds && bookmark.screenshotIds.length > 0) {
                        console.log(`Загрузка ${bookmark.screenshotIds.length} скриншотов для деталей закладки ${bookmarkId}...`);
                        screenshotsContainer.classList.remove('hidden');
                        screenshotsGridEl.innerHTML = '<p class="col-span-full text-xs text-gray-500">Загрузка скриншотов...</p>';

                        try {
                            const allParentScreenshots = await getAllFromIndex('screenshots', 'parentId', bookmarkId);
                            const bookmarkScreenshots = allParentScreenshots.filter(s => s.parentType === 'bookmark');

                            if (bookmarkScreenshots.length > 0) {
                                if (typeof renderScreenshotThumbnails === 'function') {
                                    renderScreenshotThumbnails(screenshotsGridEl, bookmarkScreenshots, openLightbox);
                                    console.log(`Отрисовано ${bookmarkScreenshots.length} миниатюр в деталях закладки.`);
                                } else {
                                    console.error("Функция renderScreenshotThumbnails не найдена!");
                                    screenshotsGridEl.innerHTML = '<p class="col-span-full text-red-500 text-xs">Ошибка рендеринга скриншотов.</p>';
                                }
                            } else {
                                screenshotsGridEl.innerHTML = '';
                                screenshotsContainer.classList.add('hidden');
                                console.log("Скриншоты не найдены в БД, хотя ID были в закладке.");
                            }
                        } catch (screenshotError) {
                            console.error("Ошибка загрузки скриншотов для деталей закладки:", screenshotError);
                            screenshotsGridEl.innerHTML = '<p class="col-span-full text-red-500 text-xs">Ошибка загрузки скриншотов.</p>';
                            screenshotsContainer.classList.remove('hidden');
                        }
                    } else {
                        screenshotsGridEl.innerHTML = '';
                        screenshotsContainer.classList.add('hidden');
                        console.log("Скриншоты для деталей закладки отсутствуют.");
                    }

                } else {
                    titleEl.textContent = 'Ошибка';
                    textContentEl.innerHTML = '<p class="text-red-500">Не удалось загрузить данные закладки. Возможно, она была удалена.</p>';
                    showNotification("Закладка не найдена", "error");
                    editButton.classList.add('hidden');
                    screenshotsContainer.classList.add('hidden');
                }
            } catch (error) {
                console.error("Ошибка при загрузке деталей закладки:", error);
                titleEl.textContent = 'Ошибка загрузки';
                textContentEl.innerHTML = '<p class="text-red-500">Произошла ошибка при загрузке данных.</p>';
                showNotification("Ошибка загрузки деталей закладки", "error");
                editButton.classList.add('hidden');
                screenshotsContainer.classList.add('hidden');
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
            let isNewModal = false;

            if (!modal) {
                isNewModal = true;
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
                            <input type="hidden" name="editingFolderId">
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="folderName">Название папки</label>
                                <input type="text" id="folderName" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1">Цвет</label>
                                <div class="flex gap-2 flex-wrap">
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="gray" class="form-radio text-gray-600 focus:ring-gray-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-gray-500 border border-gray-300"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="red" class="form-radio text-red-600 focus:ring-red-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-red-600"></span>
                                    </label>
                                     <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="orange" class="form-radio text-orange-600 focus:ring-orange-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-orange-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="yellow" class="form-radio text-yellow-500 focus:ring-yellow-400">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-yellow-400"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="green" class="form-radio text-green-600 focus:ring-green-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-green-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="teal" class="form-radio text-teal-600 focus:ring-teal-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-teal-500"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="blue" checked class="form-radio text-blue-600 focus:ring-blue-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-blue-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="indigo" class="form-radio text-indigo-600 focus:ring-indigo-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-indigo-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="purple" class="form-radio text-purple-600 focus:ring-purple-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-purple-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="pink" class="form-radio text-pink-600 focus:ring-pink-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-pink-600"></span>
                                    </label>
                                    <label class="inline-flex items-center">
                                        <input type="radio" name="folderColor" value="rose" class="form-radio text-rose-600 focus:ring-rose-500">
                                        <span class="ml-2 w-5 h-5 rounded-full bg-rose-500"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="flex justify-end">
                                <button type="submit" id="folderSubmitBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
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
                        const form = modal.querySelector('#folderForm');
                        if (form && form.dataset.editingId) {
                            form.reset();
                            delete form.dataset.editingId;
                            const submitButton = form.querySelector('#folderSubmitBtn');
                            if (submitButton) submitButton.textContent = 'Добавить папку';
                            const defaultColorInput = form.querySelector('input[name="folderColor"][value="blue"]');
                            if (defaultColorInput) defaultColorInput.checked = true;
                        }
                    }
                });

                const form = modal.querySelector('#folderForm');
                if (!form.dataset.submitListenerAttached) {
                    if (typeof handleSaveFolderSubmit === 'function') {
                        form.addEventListener('submit', handleSaveFolderSubmit);
                        form.dataset.submitListenerAttached = 'true';
                    } else {
                        console.error("Функция handleSaveFolderSubmit не определена!");
                        form.addEventListener('submit', (e) => {
                            e.preventDefault();
                            showNotification("Ошибка: функция сохранения не найдена.", "error");
                        });
                    }
                }
            }

            const form = modal.querySelector('#folderForm');
            if (form) {
                form.reset();
                delete form.dataset.editingId;
                const submitButton = form.querySelector('#folderSubmitBtn');
                if (submitButton) submitButton.textContent = 'Добавить папку';
                const defaultColorInput = form.querySelector('input[name="folderColor"][value="blue"]');
                if (defaultColorInput) defaultColorInput.checked = true;
            }

            const foldersListElement = modal.querySelector('#foldersList');
            if (foldersListElement) {
                loadFoldersList(foldersListElement);
            } else {
                console.error("Не найден элемент #foldersList в модальном окне папок.");
            }

            modal.classList.remove('hidden');
        }


        async function handleDeleteBookmarkFolderClick(folderId, folderItem) {
            try {
                if (typeof getAllFromIndex !== 'function') {
                    console.error("Функция getAllFromIndex не определена при попытке удаления папки!");
                    showNotification("Ошибка: Невозможно проверить содержимое папки.", "error");
                    return;
                }

                const bookmarksInFolder = await getAllFromIndex('bookmarks', 'folder', folderId);
                const folderToDelete = await getFromIndexedDB('bookmarkFolders', folderId);

                let confirmationMessage = `Вы уверены, что хотите удалить папку "${folderToDelete?.name || 'ID ' + folderId}"?`;
                let shouldDeleteBookmarks = false;
                let screenshotIdsToDelete = [];

                if (bookmarksInFolder && bookmarksInFolder.length > 0) {
                    confirmationMessage += `\n\nВ этой папке находит${bookmarksInFolder.length === 1 ? 'ся' : 'ся'} ${bookmarksInFolder.length} заклад${bookmarksInFolder.length === 1 ? 'ка' : (bookmarksInFolder.length < 5 ? 'ки' : 'ок')}. Они также будут УДАЛЕНЫ вместе со связанными скриншотами!`;
                    shouldDeleteBookmarks = true;
                    bookmarksInFolder.forEach(bm => {
                        if (Array.isArray(bm.screenshotIds) && bm.screenshotIds.length > 0) {
                            screenshotIdsToDelete.push(...bm.screenshotIds);
                        }
                    });
                    screenshotIdsToDelete = [...new Set(screenshotIdsToDelete)];
                    console.log(`К удалению запланировано ${bookmarksInFolder.length} закладок и ${screenshotIdsToDelete.length} скриншотов.`);
                }

                if (!confirm(confirmationMessage)) {
                    console.log("Удаление папки отменено.");
                    return;
                }

                console.log(`Начало удаления папки ID: ${folderId}. Удаление закладок: ${shouldDeleteBookmarks}. Удаление скриншотов: ${screenshotIdsToDelete.length > 0}`);

                const indexUpdatePromises = [];
                if (folderToDelete && typeof updateSearchIndex === 'function') {
                    indexUpdatePromises.push(
                        updateSearchIndex('bookmarkFolders', folderId, folderToDelete, 'delete')
                            .catch(err => console.error(`Ошибка индексации (удаление папки ${folderId}):`, err))
                    );
                    if (shouldDeleteBookmarks) {
                        bookmarksInFolder.forEach(bm => {
                            indexUpdatePromises.push(
                                updateSearchIndex('bookmarks', bm.id, bm, 'delete')
                                    .catch(err => console.error(`Ошибка индексации (удаление закладки ${bm.id}):`, err))
                            );
                        });
                    }
                } else {
                    console.warn("Не удалось обновить поисковый индекс при удалении папки: папка не найдена или функция updateSearchIndex недоступна.");
                }
                await Promise.allSettled(indexUpdatePromises);
                console.log("Обновление поискового индекса (удаление) завершено.");

                let transaction;
                try {
                    const stores = ['bookmarkFolders'];
                    if (shouldDeleteBookmarks) stores.push('bookmarks');
                    if (screenshotIdsToDelete.length > 0) stores.push('screenshots');

                    transaction = db.transaction(stores, 'readwrite');
                    const folderStore = transaction.objectStore('bookmarkFolders');
                    const bookmarkStore = stores.includes('bookmarks') ? transaction.objectStore('bookmarks') : null;
                    const screenshotStore = stores.includes('screenshots') ? transaction.objectStore('screenshots') : null;

                    const deleteRequests = [];

                    deleteRequests.push(new Promise((resolve, reject) => {
                        const req = folderStore.delete(folderId);
                        req.onsuccess = resolve;
                        req.onerror = (e) => reject(e.target.error || new Error(`Ошибка удаления папки ${folderId}`));
                    }));

                    if (bookmarkStore && shouldDeleteBookmarks) {
                        bookmarksInFolder.forEach(bm => {
                            deleteRequests.push(new Promise((resolve, reject) => {
                                const req = bookmarkStore.delete(bm.id);
                                req.onsuccess = resolve;
                                req.onerror = (e) => reject(e.target.error || new Error(`Ошибка удаления закладки ${bm.id}`));
                            }));
                        });
                    }

                    if (screenshotStore && screenshotIdsToDelete.length > 0) {
                        screenshotIdsToDelete.forEach(screenshotId => {
                            deleteRequests.push(new Promise((resolve, reject) => {
                                const req = screenshotStore.delete(screenshotId);
                                req.onsuccess = resolve;
                                req.onerror = (e) => reject(e.target.error || new Error(`Ошибка удаления скриншота ${screenshotId}`));
                            }));
                        });
                    }

                    await Promise.all(deleteRequests);

                    await new Promise((resolve, reject) => {
                        transaction.oncomplete = resolve;
                        transaction.onerror = (e) => reject(e.target.error || new Error("Ошибка транзакции удаления"));
                        transaction.onabort = (e) => reject(e.target.error || new Error("Транзакция удаления прервана"));
                    });

                    console.log(`Папка ${folderId}, ${bookmarksInFolder.length} закладок и ${screenshotIdsToDelete.length} скриншотов успешно удалены из БД.`);

                    if (folderItem && folderItem.parentNode) folderItem.remove();
                    else console.warn(`Элемент папки ${folderId} не найден или уже удален из DOM.`);

                    await populateBookmarkFolders();
                    await loadBookmarks();

                    showNotification("Папка и ее содержимое удалены");

                    const foldersList = document.getElementById('foldersList');
                    if (foldersList && !foldersList.querySelector('.folder-item')) {
                        foldersList.innerHTML = '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
                    }

                } catch (error) {
                    console.error("Ошибка при удалении папки/закладок/скриншотов в транзакции:", error);
                    showNotification("Ошибка при удалении папки: " + (error.message || error), "error");
                    if (transaction && transaction.readyState !== 'done' && transaction.abort) {
                        try { transaction.abort(); } catch (abortErr) { console.error("Ошибка отмены транзакции при ошибке:", abortErr); }
                    }
                    await loadBookmarks();
                    const foldersList = document.getElementById('foldersList');
                    if (foldersList) await loadFoldersList(foldersList);
                }

            } catch (error) {
                console.error("Общая ошибка при удалении папки закладок (вне транзакции):", error);
                showNotification("Ошибка при удалении папки: " + (error.message || error), "error");
            }
        }



        // СИСТЕМА ССЫЛОК 1С
        function initCibLinkSystem() {
            const essentialIds = ['addLinkBtn', 'linksContainer', 'linksContent', 'linkSearchInput'];
            const coreElements = getRequiredElements(essentialIds);

            if (!coreElements) {
                console.error("!!! Отсутствуют критически важные элементы CIB в initCibLinkSystem. Инициализация прервана.");
                return;
            }

            const { addLinkBtn, linksContainer, linksContent, linkSearchInput } = coreElements;

            try {
                addLinkBtn.addEventListener('click', () => showAddEditCibLinkModal());
            } catch (e) { console.error("Ошибка при добавлении обработчика к addLinkBtn:", e); }

            if (typeof debounce === 'function' && typeof filterLinks === 'function') {
                try {
                    linkSearchInput.addEventListener('input', debounce(filterLinks, 250));
                } catch (e) { console.error("Ошибка при добавлении обработчика к linkSearchInput:", e); }

                if (typeof setupClearButton === 'function') {
                    setupClearButton('linkSearchInput', 'clearLinkSearchInputBtn', filterLinks);
                } else {
                    console.warn("Функция setupClearButton недоступна для поля поиска ссылок 1С.");
                }
            } else {
                console.error("!!! Функции debounce или filterLinks не найдены. Поиск ссылок 1С работать не будет.");
            }

            loadCibLinks();

            try {
                linksContent.querySelectorAll('.view-toggle').forEach(button => {
                    if (typeof handleViewToggleClick === 'function') {
                        button.removeEventListener('click', handleViewToggleClick);
                        button.addEventListener('click', handleViewToggleClick);
                    } else {
                        console.warn("Функция handleViewToggleClick не найдена для кнопок вида ссылок 1С.");
                    }
                });
            } catch (e) { console.error("Ошибка при добавлении обработчиков к кнопкам вида ссылок 1С:", e); }

            try {
                linksContainer.removeEventListener('click', handleLinkActionClick);
                linksContainer.addEventListener('click', handleLinkActionClick);
            } catch (e) { console.error("Ошибка при добавлении обработчика к linksContainer:", e); }

            initCibLinkModal();

            console.log("Система ссылок 1С инициализирована.");
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
            if (!linksContainer) {
                console.error("Контейнер ссылок (#linksContainer) не найден в loadCibLinks.");
                return;
            }

            linksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Загрузка ссылок...</div>';

            try {
                let links = await getAllFromIndexedDB('links');
                let linksToRender = links;

                if (!links || links.length === 0) {
                    console.log("База ссылок 1С пуста. Добавляем стартовый набор.");

                    const linksToSave = [...DEFAULT_CIB_LINKS];
                    const savedLinkIds = await Promise.all(
                        linksToSave.map(link => saveToIndexedDB('links', link))
                    );
                    const linksWithIds = linksToSave.map((link, index) => ({ ...link, id: savedLinkIds[index] }));

                    console.log("Стартовые ссылки добавлены в IndexedDB.");

                    if (typeof updateSearchIndex === 'function') {
                        try {
                            await Promise.all(linksWithIds.map(link =>
                                updateSearchIndex('links', link.id, link, 'add')
                                    .catch(err => console.error(`Ошибка индексации стартовой ссылки 1С ${link.id}:`, err))
                            ));
                            console.log("Стартовые ссылки 1С проиндексированы.");
                        } catch (indexingError) {
                            console.error("Общая ошибка при индексации стартовых ссылок 1С:", indexingError);
                        }
                    } else {
                        console.warn("Функция updateSearchIndex недоступна для стартовых ссылок 1С.");
                    }

                    linksToRender = linksWithIds;
                }

                renderCibLinks(linksToRender);

            } catch (error) {
                console.error("Ошибка при загрузке ссылок 1С:", error);
                linksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-red-500">Не удалось загрузить ссылки.</div>';
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView('linksContainer');
                } else {
                    console.warn("Функция applyCurrentView недоступна для применения вида при ошибке загрузки.");
                }
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


        async function renderCibLinks(links) {
            const linksContainer = document.getElementById('linksContainer');
            if (!linksContainer) {
                console.error("Контейнер ссылок (#linksContainer) не найден в renderCibLinks.");
                return;
            }

            linksContainer.innerHTML = '';

            if (!links || links.length === 0) {
                linksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Нет сохраненных ссылок 1С. Нажмите "Добавить ссылку".</div>';
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView('linksContainer');
                } else {
                    console.warn("Функция applyCurrentView недоступна для применения вида при пустом списке ссылок 1С.");
                    if (typeof applyView === 'function') {
                        applyView(linksContainer, linksContainer.dataset.defaultView || 'cards');
                    }
                }
                return;
            }

            const fragment = document.createDocumentFragment();

            links.forEach(link => {
                if (!link || typeof link.id === 'undefined') {
                    console.warn("Пропуск невалидной ссылки 1С при рендеринге:", link);
                    return;
                }

                const linkElement = document.createElement('div');
                linkElement.className = 'cib-link-item view-item group relative border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#374151] rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200';
                linkElement.dataset.id = link.id;

                const buttonsHTML = `
            <div class="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                <button class="copy-cib-link p-1.5 text-gray-500 hover:text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Копировать ссылку">
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
                <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1 pr-20" title="${link.title || ''}">${link.title || 'Без названия'}</h3>
                <div class="mb-2">
                    <code class="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all inline-block w-full">${link.link || ''}</code>
                </div>
                ${link.description ? `<p class="text-gray-500 dark:text-gray-400 text-sm mt-auto flex-grow">${link.description}</p>` : '<div class="flex-grow"></div>'}
            </div>
        `;

                linkElement.innerHTML = buttonsHTML + contentHTML;
                fragment.appendChild(linkElement);
            });

            linksContainer.appendChild(fragment);

            if (typeof applyCurrentView === 'function') {
                applyCurrentView('linksContainer');
            } else {
                console.warn("Функция applyCurrentView недоступна для применения вида после рендеринга ссылок 1С.");
                if (typeof applyView === 'function') {
                    applyView(linksContainer, linksContainer.dataset.defaultView || 'cards');
                }
            }
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


        // СИСТЕМА РЕГЛАМЕНТОВ
        function initReglamentsSystem() {
            const addReglamentBtn = document.getElementById('addReglamentBtn');
            const categoryGrid = document.getElementById('reglamentCategoryGrid');
            const reglamentsListDiv = document.getElementById('reglamentsList');
            const backToCategoriesBtn = document.getElementById('backToCategories');

            if (!addReglamentBtn) console.error("Кнопка #addReglamentBtn не найдена!");
            if (!categoryGrid) console.error("Сетка категорий #reglamentCategoryGrid не найдена!");
            if (!reglamentsListDiv) console.error("Контейнер списка #reglamentsList не найден!");
            if (!backToCategoriesBtn) console.error("Кнопка #backToCategories не найдена!");

            if (!categoryGrid || !reglamentsListDiv) {
                console.error("Критически важные элементы (#reglamentCategoryGrid или #reglamentsList) не найдены. Инициализация системы регламентов прервана.");
                return;
            }

            addReglamentBtn?.addEventListener('click', () => {
                const currentCategoryId = reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden')
                    ? reglamentsListDiv.dataset.currentCategory
                    : null;
                showAddReglamentModal(currentCategoryId);
            });

            renderReglamentCategories();
            populateReglamentCategoryDropdowns();

            categoryGrid.addEventListener('click', (event) => {
                const categoryElement = event.target.closest('.reglament-category');
                if (!categoryElement) return;

                const categoryId = categoryElement.dataset.category;

                if (event.target.closest('.delete-category-btn')) {
                    if (typeof handleDeleteCategoryClick === 'function') {
                        handleDeleteCategoryClick(event);
                    } else {
                        console.error("Функция handleDeleteCategoryClick не найдена!");
                    }
                } else if (event.target.closest('.edit-category-btn')) {
                    event.stopPropagation();
                    if (typeof showAddCategoryModal === 'function') {
                        showAddCategoryModal(categoryId);
                    } else {
                        console.error("Функция showAddCategoryModal (для редактирования) не найдена!");
                    }
                } else {
                    showReglamentsForCategory(categoryId);
                    reglamentsListDiv.dataset.currentCategory = categoryId;
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


        async function handleSaveFolderSubmit(event) {
            event.preventDefault();
            const folderForm = event.target;
            const saveButton = folderForm.querySelector('#folderSubmitBtn');
            if (!folderForm || !saveButton) {
                console.error("Не удалось найти форму или кнопку сохранения папки.");
                return;
            }

            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

            const nameInput = folderForm.elements.folderName;
            const name = nameInput.value.trim();
            const colorInput = folderForm.querySelector('input[name="folderColor"]:checked');
            const color = colorInput?.value ?? 'blue';

            if (!name) {
                showNotification("Пожалуйста, введите название папки", "error");
                saveButton.disabled = false;
                saveButton.innerHTML = folderForm.dataset.editingId ? 'Сохранить изменения' : 'Добавить папку';
                nameInput.focus();
                return;
            }

            const isEditing = folderForm.dataset.editingId;
            const folderData = {
                name,
                color,
            };

            let oldData = null;
            let finalId = null;
            const timestamp = new Date().toISOString();

            try {
                if (isEditing) {
                    folderData.id = parseInt(isEditing);
                    finalId = folderData.id;
                    try {
                        oldData = await getFromIndexedDB('bookmarkFolders', finalId);
                        folderData.dateAdded = oldData?.dateAdded || timestamp;
                    } catch (fetchError) {
                        console.warn(`Не удалось получить старые данные папки закладок (${finalId}):`, fetchError);
                        folderData.dateAdded = timestamp;
                    }
                    folderData.dateUpdated = timestamp;
                    console.log("Редактирование папки:", folderData);
                } else {
                    folderData.dateAdded = timestamp;
                    console.log("Добавление новой папки:", folderData);
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
                        console.log(`Поисковый индекс обновлен для папки ID: ${finalId}`);
                    } catch (indexError) {
                        console.error(`Ошибка обновления поискового индекса для папки ${finalId}:`, indexError);
                        showNotification("Ошибка обновления поискового индекса для папки.", "warning");
                    }
                } else {
                    console.warn("Функция updateSearchIndex недоступна для папки.");
                }

                const foldersList = document.getElementById('foldersList');
                if (foldersList) {
                    await loadFoldersList(foldersList);
                }

                await populateBookmarkFolders();
                const folderSelectInAddModal = document.getElementById('bookmarkFolder');
                if (folderSelectInAddModal) {
                    await populateBookmarkFolders(folderSelectInAddModal);
                }

                showNotification(isEditing ? "Папка обновлена" : "Папка добавлена");

                folderForm.reset();
                delete folderForm.dataset.editingId;
                const submitButton = folderForm.querySelector('#folderSubmitBtn');
                if (submitButton) submitButton.textContent = 'Добавить папку';
                const defaultColorInput = folderForm.querySelector('input[name="folderColor"][value="blue"]');
                if (defaultColorInput) defaultColorInput.checked = true;

                const modal = document.getElementById('foldersModal');
                if (modal) modal.classList.add('hidden');


            } catch (error) {
                console.error("Ошибка при сохранении папки:", error);
                showNotification("Ошибка при сохранении папки: " + (error.message || error), "error");
            } finally {
                saveButton.disabled = false;
                saveButton.innerHTML = folderForm.dataset.editingId ? 'Сохранить изменения' : 'Добавить папку';
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
            if (!db || !Array.isArray(reglaments)) {
                console.error("База данных не готова или предоставлены неверные данные для импорта регламентов.");
                return false;
            }

            console.log(`Начало импорта ${reglaments.length} регламентов...`);
            try {
                await clearIndexedDBStore('reglaments');
                console.log("Хранилище 'reglaments' очищено.");

                const savePromises = reglaments.map(reglament => {
                    const { id, ...reglamentData } = reglament;
                    return saveToIndexedDB('reglaments', reglamentData);
                });

                const savedIds = await Promise.all(savePromises);
                console.log(`Сохранено ${savedIds.length} регламентов в IndexedDB.`);

                if (typeof updateSearchIndex === 'function') {
                    console.log("Начало обновления поискового индекса для импортированных регламентов...");
                    const indexPromises = reglaments.map((reglament, index) => {
                        const newId = savedIds[index];
                        if (newId === undefined || newId === null) {
                            console.warn(`Не удалось получить ID для регламента при импорте: ${reglament.title || 'Без заголовка'}. Пропуск индексации.`);
                            return Promise.resolve();
                        }
                        const reglamentWithId = { ...reglament, id: newId };
                        return updateSearchIndex('reglaments', newId, reglamentWithId, 'add')
                            .catch(err => console.error(`Ошибка индексации импортированного регламента ID ${newId}:`, err));
                    });
                    await Promise.all(indexPromises);
                    console.log("Поисковый индекс обновлен для импортированных регламентов.");
                } else {
                    console.warn("Функция updateSearchIndex недоступна. Поисковый индекс не обновлен после импорта.");
                    showNotification("Импорт завершен, но поисковый индекс не обновлен.", "warning");
                }

                console.log("Импорт регламентов успешно завершен.");
                await renderReglamentCategories();
                const reglamentsListDiv = document.getElementById('reglamentsList');
                const currentCategoryId = reglamentsListDiv?.dataset.currentCategory;
                if (currentCategoryId && reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden')) {
                    await showReglamentsForCategory(currentCategoryId);
                }

                return true;

            } catch (error) {
                console.error("Ошибка во время импорта регламентов:", error);
                showNotification("Ошибка при импорте регламентов. См. консоль.", "error");
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
                    reglamentElement.className = 'reglament-item view-item group';
                    reglamentElement.dataset.id = reglament.id;

                    reglamentElement.innerHTML = `
    <div class="flex-grow min-w-0 mr-3" data-action="view">
         <h4 class="font-semibold truncate" title="${reglament.title}">${reglament.title}</h4>
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
            let isNew = false;

            if (!modal) {
                isNew = true;
                modal = document.createElement('div');
                modal.id = id;
                modal.className = baseClassName;
                if (!baseClassName.includes('flex')) {
                    modal.classList.add('flex', 'items-center', 'justify-center');
                }
                modal.innerHTML = innerHTML;

                if (!document.body) {
                    console.error(`[getOrCreateModal] document.body не доступно при создании #${id}. Невозможно добавить модальное окно в DOM.`);
                    throw new Error(`document.body не доступно при создании модального окна #${id}`);
                }
                document.body.appendChild(modal);
                console.log(`[getOrCreateModal] Created new modal #${id}.`);

                if (modal._overlayClickHandler) {
                    modal.removeEventListener('click', modal._overlayClickHandler);
                }

                const overlayClickHandler = (event) => {
                    const currentModal = document.getElementById(id);
                    if (!currentModal || currentModal.classList.contains('hidden')) return;

                    if (event.target.closest('.close-modal, .cancel-modal, .close-detail-modal')) {
                        console.log(`[Click Close for ${id}] Closing modal via button.`);
                        currentModal.classList.add('hidden');
                        removeEscapeHandler(currentModal);
                    }
                };

                modal.addEventListener('click', overlayClickHandler);
                modal._overlayClickHandler = overlayClickHandler;
                modal.dataset.baseListenersAdded = 'true';
                console.log(`[getOrCreateModal] Attached NEW overlay click handler (buttons only) for #${id}.`);

            } else {
                console.log(`[getOrCreateModal] Modal #${id} already exists.`);
                if (!modal.dataset.baseListenersAdded) {
                    if (modal._overlayClickHandler) {
                        modal.removeEventListener('click', modal._overlayClickHandler);
                    }
                    const overlayClickHandler = (event) => {
                        const currentModal = document.getElementById(id);
                        if (!currentModal || currentModal.classList.contains('hidden')) return;
                        if (event.target.closest('.close-modal, .cancel-modal, .close-detail-modal')) {
                            currentModal.classList.add('hidden');
                            removeEscapeHandler(currentModal);
                        }
                    };
                    modal.addEventListener('click', overlayClickHandler);
                    modal._overlayClickHandler = overlayClickHandler;
                    modal.dataset.baseListenersAdded = 'true';
                    console.log(`[getOrCreateModal] Attached NEW overlay click handler (buttons only) for EXISTING #${id}.`);
                }
            }

            if (typeof setupCallback === 'function') {
                const modalForSetup = document.getElementById(id);
                if (modalForSetup) {
                    try {
                        setupCallback(modalForSetup, isNew);
                        modalForSetup.dataset.setupComplete = 'true';
                        console.log(`[getOrCreateModal] Setup callback executed for #${id} (isNew=${isNew}).`);
                    } catch (error) {
                        console.error(`[getOrCreateModal] Ошибка выполнения setupCallback для #${id} (isNew=${isNew}):`, error);
                        modalForSetup.classList.add('hidden');
                        removeEscapeHandler(modalForSetup);
                        if (typeof showNotification === 'function') {
                            showNotification(`Ошибка настройки окна ${id}`, "error");
                        }
                        throw new Error(`Ошибка настройки модального окна #${id}: ${error.message}`);
                    }
                } else {
                    console.error(`[getOrCreateModal] Не удалось найти модальное окно #${id} в DOM перед вызовом setupCallback.`);
                    throw new Error(`Модальное окно #${id} не найдено для setupCallback.`);
                }
            }
            return document.getElementById(id);
        };

        const addEscapeHandler = (modalElement) => {
            if (!modalElement || modalElement._escapeHandler) return;

            const handler = (event) => {
                const currentModal = document.getElementById(modalElement.id);
                if (event.key === 'Escape' && currentModal && !currentModal.classList.contains('hidden')) {
                    console.log(`[Escape Handler for ${modalElement.id}] Closing modal.`);
                    currentModal.classList.add('hidden');
                    removeEscapeHandler(currentModal);
                }
            };
            document.addEventListener('keydown', handler);
            modalElement._escapeHandler = handler;
            console.log(`[addEscapeHandler] Added Escape handler for #${modalElement.id}`);
        };

        const removeEscapeHandler = (modalElement) => {
            if (modalElement?._escapeHandler) {
                document.removeEventListener('keydown', modalElement._escapeHandler);
                delete modalElement._escapeHandler;
                console.log(`[removeEscapeHandler] Removed Escape handler for #${modalElement.id}`);
            }
        };


        async function showAddReglamentModal(currentCategoryId = null) {
            const modalId = 'reglamentModal';
            const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
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

            const reglamentModalConfig = {
                modalId: 'reglamentModal',
                buttonId: 'toggleFullscreenReglamentBtn',
                classToggleConfig: {
                    normal: { modal: ['p-4'], innerContainer: ['w-[95%]', 'max-w-5xl', 'h-[90vh]', 'rounded-lg', 'shadow-xl'], contentArea: ['p-6'] },
                    fullscreen: { modal: ['p-0'], innerContainer: ['w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none', 'shadow-none'], contentArea: ['p-6'] }
                },
                innerContainerSelector: '.modal-inner-container',
                contentAreaSelector: '.modal-content-area'
            };

            const setupAddForm = (modalElement, isNew) => {
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
                            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';
                        }

                        const title = titleInput.value.trim();
                        const category = categorySelect.value;
                        const content = contentTextarea.value.trim();
                        const reglamentId = idInput.value;

                        if (!title || !category || !content) {
                            if (typeof showNotification === 'function') { showNotification("Пожалуйста, заполните все обязательные поля (Название, Категория, Содержание)", "error"); }
                            else { alert("Пожалуйста, заполните все обязательные поля."); }
                            if (saveButton) {
                                saveButton.disabled = false;
                                saveButton.innerHTML = `<i class="fas fa-save mr-1"></i> ${reglamentId ? 'Сохранить изменения' : 'Сохранить'}`;
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
                                try { oldData = await getFromIndexedDB('reglaments', newData.id); newData.dateAdded = oldData?.dateAdded || timestamp; }
                                catch (fetchError) { console.warn(`Не удалось получить старые данные регламента (${newData.id}):`, fetchError); newData.dateAdded = timestamp; }
                                newData.dateUpdated = timestamp;
                            } else { newData.dateAdded = timestamp; }

                            const savedResult = await saveToIndexedDB('reglaments', newData);
                            if (!isEditing) { finalId = savedResult; newData.id = finalId; }

                            console.log(`Регламент ${finalId} ${isEditing ? 'обновлен' : 'добавлен'} успешно.`);

                            if (typeof updateSearchIndex === 'function') {
                                updateSearchIndex('reglaments', finalId, newData, isEditing ? 'update' : 'add', oldData)
                                    .then(() => console.log(`Обновление индекса для регламента (${finalId}) успешно завершено.`))
                                    .catch(indexError => { console.error(`Ошибка фонового обновления поискового индекса для регламента ${finalId}:`, indexError); if (typeof showNotification === 'function') { showNotification("Ошибка обновления поискового индекса.", "warning"); } });
                            } else { console.warn("Функция updateSearchIndex недоступна."); }

                            if (typeof showNotification === 'function') { showNotification(isEditing ? "Регламент успешно обновлен" : "Регламент успешно добавлен", "success"); }

                            const reglamentsListDiv = document.getElementById('reglamentsList');
                            if (reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden')) {
                                const displayedCategoryId = reglamentsListDiv.dataset.currentCategory;
                                if (displayedCategoryId === category && typeof showReglamentsForCategory === 'function') {
                                    console.log(`Обновление списка регламентов для категории ${category}.`);
                                    await showReglamentsForCategory(category);
                                }
                            }

                            modalElement.classList.add('hidden');
                            if (typeof removeEscapeHandler === 'function') { removeEscapeHandler(modalElement); }
                            form.reset();
                            idInput.value = '';
                            if (modalTitleEl) modalTitleEl.textContent = 'Добавить регламент';
                            if (saveButton) saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить';

                        } catch (error) {
                            console.error(`Ошибка при ${isEditing ? 'обновлении' : 'добавлении'} регламента:`, error);
                            if (typeof showNotification === 'function') { showNotification(`Ошибка сохранения регламента: ${error.message || error}`, "error"); }
                        } finally { if (saveButton) { saveButton.disabled = false; } }
                    });
                    form.dataset.submitHandlerAttached = 'true';
                    console.log('Обработчик submit для регламента привязан.');
                }

                const fullscreenBtn = modalElement.querySelector('#toggleFullscreenReglamentBtn');
                if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
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
                            showNotification("Ошибка: Функция переключения полноэкранного режима недоступна.", "error");
                        }
                    });
                    fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
                    console.log('Обработчик fullscreen для регламента привязан.');
                } else if (!fullscreenBtn && isNew) {
                    console.error('Кнопка #toggleFullscreenReglamentBtn не найдена в новом модальном окне регламента.');
                }
            };

            try {
                const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupAddForm);
                const categorySelect = modal.querySelector('#reglamentCategory');
                const titleInput = modal.querySelector('#reglamentTitle');
                const form = modal.querySelector('#reglamentForm');
                const idInput = modal.querySelector('#reglamentId');
                const saveBtn = modal.querySelector('#saveReglamentBtn');
                const modalTitleEl = modal.querySelector('#reglamentModalTitle');

                if (!categorySelect || !titleInput || !form || !idInput || !saveBtn || !modalTitleEl) {
                    console.error("Не удалось найти все необходимые элементы в модальном окне регламента после getOrCreateModal.");
                    if (typeof showNotification === 'function') { showNotification("Ошибка инициализации окна добавления регламента.", "error"); }
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
                    if (typeof populateReglamentCategoryDropdowns === 'function') {
                        try {
                            await populateReglamentCategoryDropdowns([categorySelect]);
                            console.log("Список категорий регламента обновлен в showAddReglamentModal.");

                            if (currentCategoryId) {
                                const optionExists = categorySelect.querySelector(`option[value="${currentCategoryId}"]`);
                                if (optionExists) {
                                    categorySelect.value = currentCategoryId;
                                    console.log(`Установлена категория по умолчанию: ${currentCategoryId}`);
                                } else {
                                    console.warn(`Переданный ID категории ${currentCategoryId} не найден в списке.`);
                                    categorySelect.value = '';
                                }
                            } else {
                                categorySelect.value = '';
                            }
                        } catch (error) {
                            console.error("Ошибка при заполнении категорий регламента:", error);
                            if (typeof showNotification === 'function') { showNotification("Не удалось загрузить список категорий.", "error"); }
                        }
                    } else {
                        console.error("Функция populateReglamentCategoryDropdowns не найдена!");
                    }
                }

                modal.classList.remove('hidden');

                if (typeof addEscapeHandler === 'function') {
                    addEscapeHandler(modal);
                } else {
                    console.warn('Функция addEscapeHandler не найдена.');
                }

                if (titleInput) {
                    titleInput.focus();
                }

            } catch (error) {
                console.error("Ошибка при показе модального окна добавления регламента:", error);
                if (typeof showNotification === 'function') { showNotification(`Не удалось открыть окно добавления регламента: ${error.message || error}`, "error"); }
            }
        }


        async function editReglament(id) {
            const modalId = 'reglamentModal';
            const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
            const modalHTML = `
                 <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95%] max-w-5xl h-[90vh] flex flex-col overflow-hidden p-2 modal-inner-container">
                    <div class="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                         <div class="flex justify-between items-center">
                             <h2 class="text-xl font-bold" id="reglamentModalTitle">Редактировать регламент</h2>
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
                     <div class="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                         <div class="flex justify-end">
                             <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md transition mr-2">
                                 Отмена
                             </button>
                             <button type="submit" form="reglamentForm" id="saveReglamentBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                 <i class="fas fa-save mr-1"></i> Сохранить изменения
                             </button>
                         </div>
                     </div>
                 </div>
             `;

            const reglamentModalConfig = {
                modalId: 'reglamentModal',
                buttonId: 'toggleFullscreenReglamentBtn',
                classToggleConfig: {},
                innerContainerSelector: '.modal-inner-container',
                contentAreaSelector: '.modal-content-area'
            };

            const setupAddForm = (modalElement, isNew) => {
                const fullscreenBtn = modalElement.querySelector('#toggleFullscreenReglamentBtn');
                if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
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
                    fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
                    console.log('Обработчик fullscreen для регламента привязан (через setupAddForm).');
                } else if (!fullscreenBtn && isNew) {
                    console.error('Кнопка #toggleFullscreenReglamentBtn не найдена в новом модальном окне регламента (при редактировании).');
                }
                const form = modalElement.querySelector('#reglamentForm');
                if (form && !form.dataset.submitHandlerAttached) {
                    form.addEventListener('submit', async (e) => { });
                    form.dataset.submitHandlerAttached = 'true';
                }
            };

            try {
                const reglament = await getFromIndexedDB('reglaments', id);
                if (!reglament) {
                    if (typeof showNotification === 'function') { showNotification("Регламент не найден", "error"); }
                    else { console.error("Регламент не найден, и функция showNotification недоступна."); }
                    return;
                }

                const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupAddForm);
                const form = modal.querySelector('#reglamentForm');
                const titleInput = modal.querySelector('#reglamentTitle');
                const categorySelect = modal.querySelector('#reglamentCategory');
                const contentTextarea = modal.querySelector('#reglamentContent');
                const idInput = modal.querySelector('#reglamentId');
                const saveButton = modal.querySelector('#saveReglamentBtn');
                const modalTitle = modal.querySelector('#reglamentModalTitle');

                if (!form || !titleInput || !categorySelect || !contentTextarea || !idInput || !saveButton || !modalTitle) {
                    console.error("Не все элементы найдены в модальном окне для редактирования регламента после getOrCreateModal.");
                    if (typeof showNotification === 'function') { showNotification("Ошибка интерфейса: не найдены элементы окна редактирования.", "error"); }
                    modal.classList.add('hidden');
                    if (typeof removeEscapeHandler === 'function') { removeEscapeHandler(modal); }
                    return;
                }

                modalTitle.textContent = 'Редактировать регламент';
                saveButton.innerHTML = '<i class="fas fa-save mr-1"></i> Сохранить изменения';
                saveButton.disabled = false;
                saveButton.setAttribute('form', 'reglamentForm');

                idInput.value = reglament.id;
                titleInput.value = reglament.title || '';
                contentTextarea.value = reglament.content || '';

                if (typeof populateReglamentCategoryDropdowns === 'function') {
                    while (categorySelect.options.length > 1) {
                        categorySelect.remove(1);
                    }
                    try {
                        await populateReglamentCategoryDropdowns([categorySelect]);
                        console.log("Список категорий для редактирования обновлен.");
                        categorySelect.value = reglament.category || '';
                        if (categorySelect.value !== String(reglament.category) && reglament.category) {
                            console.warn(`Категория ID ${reglament.category} не найдена в списке при редактировании.`);
                        } else if (reglament.category) {
                            console.log(`Установлена категория для редактирования: ${categorySelect.value}`);
                        } else {
                            console.log(`Категория не была установлена (либо не указана в данных, либо не найдена).`);
                        }
                    } catch (error) {
                        console.error("Ошибка при заполнении категорий для редактирования:", error);
                        if (typeof showNotification === 'function') { showNotification("Не удалось загрузить список категорий для редактирования.", "error"); }
                        categorySelect.value = '';
                    }
                } else {
                    console.error("Функция populateReglamentCategoryDropdowns не найдена при редактировании!");
                    categorySelect.value = '';
                }

                modal.classList.remove('hidden');

                if (typeof addEscapeHandler === 'function') {
                    addEscapeHandler(modal);
                } else {
                    console.warn('Функция addEscapeHandler не найдена.');
                }

                titleInput.focus();

            } catch (error) {
                console.error("Ошибка при загрузке или отображении регламента для редактирования:", error);
                if (typeof showNotification === 'function') { showNotification(`Ошибка открытия окна редактирования: ${error.message || error}`, "error"); }
            }
        }


        // СИСТЕМА ВНЕШНИХ РЕСУРСОВ
        async function loadExtLinks() {
            const extLinksContainer = document.getElementById('extLinksContainer');
            if (!extLinksContainer) {
                console.error("loadExtLinks: Контейнер #extLinksContainer не найден.");
                return;
            }

            extLinksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Загрузка ресурсов...</div>';

            try {
                let extLinks = await getAllExtLinks();
                let linksToRender = [];

                if (!extLinks || extLinks.length === 0) {
                    console.log("База внешних ссылок пуста. Добавляем стартовый набор.");
                    const sampleExtLinksData = [
                        { title: 'ЕГРЮЛ', url: 'https://egrul.nalog.ru/', description: 'Чекни инфу по орге', category: 'gov', dateAdded: new Date().toISOString() },
                        { title: 'Портал ИТС 1С', url: 'https://its.1c.ru/', description: 'Инфа по 1ЭС', category: 'docs', dateAdded: new Date().toISOString() },
                        { title: 'Track Astral', url: 'https://track.astral.ru/support/display/Support1CO', description: 'Знания древних...', category: 'docs', dateAdded: new Date().toISOString() },
                        { title: 'База (знаний) Astral', url: 'https://astral.ru/help/1s-otchetnost/', description: 'Инфа для обычных людишек...', category: 'docs', dateAdded: new Date().toISOString() }
                    ];

                    const savedExtLinkIds = await Promise.all(sampleExtLinksData.map(link => saveToIndexedDB('extLinks', link)));
                    console.log("Стартовые внешние ссылки добавлены в IndexedDB. ID:", savedExtLinkIds);

                    const extLinksWithIds = sampleExtLinksData.map((link, index) => ({ ...link, id: savedExtLinkIds[index] }));

                    linksToRender = extLinksWithIds;

                    if (typeof updateSearchIndex === 'function') {
                        await Promise.all(extLinksWithIds.map(link =>
                            updateSearchIndex('extLinks', link.id, link, 'add')
                                .catch(err => console.error(`Error indexing default external link ${link.id}:`, err))
                        ));
                        console.log("Default external links indexed.");
                    } else {
                        console.warn("updateSearchIndex function not available for default external links.");
                    }

                } else {
                    linksToRender = extLinks;
                    console.log(`Загружено ${linksToRender.length} существующих внешних ссылок.`);
                }

                renderExtLinks(linksToRender);

            } catch (error) {
                console.error('Ошибка при загрузке внешних ресурсов:', error);
                extLinksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-red-500">Не удалось загрузить ресурсы.</div>';
                if (typeof applyCurrentView === 'function') {
                    applyCurrentView('extLinksContainer');
                } else if (typeof applyView === 'function') {
                    applyView(extLinksContainer, extLinksContainer.dataset.defaultView || 'cards');
                    console.warn("applyCurrentView не найдена, применен вид по умолчанию при ошибке загрузки.");
                } else {
                    console.error("Ни applyCurrentView, ни applyView не найдены для установки вида при ошибке.");
                }
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
            const modalId = 'extLinkModal';
            let modal = document.getElementById(modalId);

            if (!modal) {
                console.log(`Модальное окно #${modalId} не найдено, создаем новое.`);
                modal = document.createElement('div');
                modal.id = modalId;
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
                const closeModal = () => modal.classList.add('hidden');
                modal.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => btn.addEventListener('click', closeModal));

                const form = modal.querySelector('#extLinkForm');
                if (form) {
                    if (typeof handleExtLinkFormSubmit === 'function') {
                        if (!form.dataset.listenerAttached) {
                            form.addEventListener('submit', handleExtLinkFormSubmit);
                            form.dataset.listenerAttached = 'true';
                            console.log("Обработчик handleExtLinkFormSubmit прикреплен к форме #extLinkForm.");
                        }
                    } else {
                        console.error("Ошибка: Глобальная функция handleExtLinkFormSubmit не найдена при создании модального окна!");
                    }
                } else {
                    console.error("Форма #extLinkForm не найдена внутри созданного модального окна!");
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
                saveButton: modal.querySelector('#saveExtLinkBtn')
            };

            for (const key in elements) {
                if (!elements[key]) {
                    console.warn(`[ensureExtLinkModal] Элемент '${key}' не был найден в модальном окне #${modalId}!`);
                }
            }

            const categorySelect = elements.categoryInput;
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
                if (typeof showNotification === 'function') {
                    showNotification("Ошибка интерфейса: не удалось открыть окно редактирования.", "error");
                }
                return;
            }

            try {
                const link = await getFromIndexedDB('extLinks', id);
                if (!link) {
                    if (typeof showNotification === 'function') {
                        showNotification("Внешний ресурс не найден", "error");
                    }
                    console.warn(`Внешний ресурс с ID ${id} не найден для редактирования.`);
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
                if (typeof showNotification === 'function') {
                    showNotification("Ошибка при загрузке ресурса для редактирования", "error");
                }
                if (modal) {
                    modal.classList.add('hidden');
                }
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
                if (typeof originalUISettings !== 'undefined' && originalUISettings !== null) {
                    await applyPreviewSettings(originalUISettings);
                } else {
                    console.warn("Не удалось отменить изменения: originalUISettings не найдены. Применяем дефолтные.");
                    await applyPreviewSettings(DEFAULT_UI_SETTINGS);
                }

                isUISettingsDirty = false;
                customizeUIModal.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
            };

            const openModal = async () => {
                console.log("Opening customize UI modal...");
                await loadUISettings();
                await loadEmployeeExtension();

                if (typeof originalUISettings !== 'undefined' && originalUISettings !== null) {
                    currentPreviewSettings = JSON.parse(JSON.stringify(originalUISettings));
                } else {
                    console.error("Не удалось загрузить originalUISettings, инициализируем currentPreviewSettings дефолтными значениями.");
                    currentPreviewSettings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
                    originalUISettings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
                }

                populateModalControls(currentPreviewSettings);
                await applyPreviewSettings(currentPreviewSettings);
                isUISettingsDirty = false;

                if (customizeUIModal) {
                    customizeUIModal.classList.remove('hidden');
                    document.body.classList.add('overflow-hidden');
                }
                console.log("Customize UI modal opened.");
            };

            customizeUIBtn.addEventListener('click', openModal);
            [closeCustomizeUIModalBtn, cancelUISettingsBtn].forEach(btn => btn?.addEventListener('click', () => closeModal()));

            saveUISettingsBtn?.addEventListener('click', async () => {
                updatePreviewSettingsFromModal();
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

            const colorSwatches = customizeUIModal.querySelectorAll('.color-swatch');
            colorSwatches.forEach(swatch => {
                swatch.addEventListener('click', () => {
                    const selectedColor = swatch.getAttribute('data-color');
                    if (!selectedColor) return;

                    console.log("Color swatch clicked:", selectedColor);

                    if (currentPreviewSettings) {
                        currentPreviewSettings.primaryColor = selectedColor;
                    } else {
                        console.warn("currentPreviewSettings is not defined when clicking color swatch!");
                        currentPreviewSettings = { ...originalUISettings, primaryColor: selectedColor };
                    }

                    colorSwatches.forEach(s => {
                        s.classList.remove('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');
                        s.classList.add('border-2', 'border-transparent');
                    });
                    swatch.classList.remove('border-transparent');
                    swatch.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');

                    applyPreviewSettings(currentPreviewSettings);

                    isUISettingsDirty = true;
                    console.log("isUISettingsDirty set to true after color change.");
                });
            });

            const fontSizeSlider = getElem('fontSizeSlider');
            const fontSizeLabel = getElem('fontSizeLabel');
            if (fontSizeSlider && fontSizeLabel) {
                fontSizeSlider.addEventListener('input', () => {
                    const size = fontSizeSlider.value;
                    fontSizeLabel.textContent = size + '%';
                    if (currentPreviewSettings) {
                        currentPreviewSettings.fontSize = parseInt(size);
                        applyPreviewSettings(currentPreviewSettings);
                        isUISettingsDirty = true;
                    }
                });
            }

            const borderRadiusSlider = getElem('borderRadiusSlider');
            if (borderRadiusSlider) {
                borderRadiusSlider.addEventListener('input', () => {
                    const radius = borderRadiusSlider.value;
                    if (currentPreviewSettings) {
                        currentPreviewSettings.borderRadius = parseInt(radius);
                        applyPreviewSettings(currentPreviewSettings);
                        isUISettingsDirty = true;
                    }
                });
            }

            const densitySlider = getElem('densitySlider');
            if (densitySlider) {
                densitySlider.addEventListener('input', () => {
                    const density = densitySlider.value;
                    if (currentPreviewSettings) {
                        currentPreviewSettings.contentDensity = parseInt(density);
                        applyPreviewSettings(currentPreviewSettings);
                        isUISettingsDirty = true;
                    }
                });
            }

            querySelAll('input[name="mainLayout"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    if (currentPreviewSettings) {
                        currentPreviewSettings.mainLayout = radio.value;
                        applyPreviewSettings(currentPreviewSettings);
                        isUISettingsDirty = true;
                    }
                });
            });

            querySelAll('input[name="themeMode"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    if (currentPreviewSettings) {
                        currentPreviewSettings.themeMode = radio.value;
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
                            finishEditing(false);
                        } else {
                            closeModal();
                        }
                    }
                }
            });


            document.addEventListener('click', (event) => {
                if (customizeUIModal && !customizeUIModal.classList.contains('hidden')) {
                    const innerContainer = customizeUIModal.querySelector('.bg-white.dark\\:bg-gray-800');
                    if (innerContainer && !innerContainer.contains(event.target) && !customizeUIBtn.contains(event.target)) {
                        const inputField = customizeUIModal.querySelector('#employeeExtensionInput');
                        const displaySpan = customizeUIModal.querySelector('#employeeExtensionDisplay');

                        if ((inputField && inputField.contains(event.target)) || (displaySpan && displaySpan.contains(event.target))) {
                            return;
                        }

                        closeModal();
                    }
                }
            });

            console.log("UI Customization system initialized.");
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

            let settingsToApply = { ...DEFAULT_UI_SETTINGS };
            const currentPanelIds = tabsConfig.map(t => t.id);
            const knownPanelIds = new Set(currentPanelIds);

            if (!db) {
                console.warn("DB not ready in applyUISettings. Applying defaults.");
            } else {
                try {
                    const loadedSettings = await getFromIndexedDB('preferences', 'uiSettings');

                    if (loadedSettings && typeof loadedSettings === 'object') {
                        console.log("Настройки UI загружены из БД. Слияние и корректировка...");

                        settingsToApply = {
                            ...DEFAULT_UI_SETTINGS,
                            ...loadedSettings,
                            id: 'uiSettings'
                        };

                        let savedOrder = settingsToApply.panelOrder || [];
                        let savedVisibility = settingsToApply.panelVisibility || [];
                        let effectiveOrder = [];
                        let effectiveVisibility = [];
                        const processedIds = new Set();

                        savedOrder.forEach((panelId, index) => {
                            if (knownPanelIds.has(panelId)) {
                                effectiveOrder.push(panelId);
                                effectiveVisibility.push(typeof savedVisibility[index] === 'boolean' ? savedVisibility[index] : true);
                                processedIds.add(panelId);
                            } else {
                                console.warn(`applyUISettings (DB Load): Saved panel ID "${panelId}" no longer exists. Ignoring.`);
                            }
                        });

                        currentPanelIds.forEach(panelId => {
                            if (!processedIds.has(panelId)) {
                                console.log(`applyUISettings (DB Load): Adding new panel "${panelId}" to order/visibility.`);
                                effectiveOrder.push(panelId);
                                effectiveVisibility.push(true);
                            }
                        });

                        settingsToApply.panelOrder = effectiveOrder;
                        settingsToApply.panelVisibility = effectiveVisibility;

                        console.log("Слияние и корректировка настроек из БД завершены.");

                    } else {
                        console.log("Нет сохраненных настроек UI в БД или формат неверный. Используются дефолты.");
                    }
                } catch (error) {
                    console.error("Ошибка при загрузке настроек UI из БД, используются дефолты:", error);
                    settingsToApply = { ...DEFAULT_UI_SETTINGS };
                }
            }

            try {
                await applyPreviewSettings(settingsToApply);
                console.log("Глобальные настройки UI применены:", settingsToApply);
                return true;
            } catch (applyError) {
                console.error("КРИТИЧЕСКАЯ ОШИБКА при финальном вызове applyPreviewSettings в applyUISettings:", applyError);
                await applyPreviewSettings(DEFAULT_UI_SETTINGS);
                if (typeof showNotification === 'function') {
                    showNotification("Критическая ошибка применения настроек интерфейса. Сброшено к базовым.", "error");
                }
                return false;
            }
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
                const localStorageKeys = ['clientData', 'employeeExtension', 'viewPreferences'];
                localStorageKeys.forEach(key => {
                    if (localStorage.getItem(key) !== null) {
                        localStorage.removeItem(key);
                        console.log(`Removed key from LocalStorage: ${key}`);
                    } else {
                        console.log(`Key not found in LocalStorage, skipping removal: ${key}`);
                    }
                });
            } catch (error) {
                console.error("Error clearing LocalStorage:", error);
                showNotification("Ошибка при очистке LocalStorage.", "warning");
            }

            try {
                console.log("Closing IndexedDB connection if open...");
                if (db) {
                    db.close();
                    db = null;
                    console.log("IndexedDB connection closed.");
                } else {
                    console.log("IndexedDB connection was not open.");
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
                        reject(event.target.error || new Error('Unknown DB deletion error'));
                    };
                    deleteRequest.onblocked = (event) => {
                        console.warn(`Database deletion blocked for "${DB_NAME}". Open connections exist. Reload required.`, event);
                        showNotification("База данных заблокирована другими вкладками. Пожалуйста, закройте их и перезагрузите страницу для завершения очистки.", "warning", 10000);
                        resolve();
                    };
                });
            } catch (error) {
                console.error("Error deleting IndexedDB database:", error);
                showNotification("Ошибка при удалении базы данных: " + (error.message || "Неизвестная ошибка"), "error");
            }

            console.log("Data clearing process finished.");
        }


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
            } else {
                console.warn("[applyPreviewSettings] Main content grid container not found.");
            }

            const themeMode = settings?.themeMode || DEFAULT_UI_SETTINGS.themeMode;
            if (typeof setTheme === 'function') {
                setTheme(themeMode);
            } else {
                const isDark = themeMode === 'dark' || (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.classList.toggle('dark', isDark);
                console.warn("setTheme function was not available, used direct class toggle.");
            }

            const currentPanelIds = tabsConfig.map(t => t.id);
            const defaultPanelOrder = currentPanelIds;
            const defaultPanelVisibility = currentPanelIds.map(() => true);

            const savedOrder = settings?.panelOrder || defaultPanelOrder;
            const savedVisibility = settings?.panelVisibility || defaultPanelVisibility;
            const knownPanelIds = new Set(currentPanelIds);

            let effectiveOrder = [];
            let effectiveVisibility = [];
            const processedIds = new Set();

            savedOrder.forEach((panelId, index) => {
                if (knownPanelIds.has(panelId)) {
                    effectiveOrder.push(panelId);
                    effectiveVisibility.push(savedVisibility[index] ?? true);
                    processedIds.add(panelId);
                }
            });
            currentPanelIds.forEach(panelId => {
                if (!processedIds.has(panelId)) {
                    effectiveOrder.push(panelId);
                    effectiveVisibility.push(true);
                }
            });

            applyPanelOrderAndVisibility(effectiveOrder, effectiveVisibility);
        }


        function applyPanelOrderAndVisibility(order, visibility) {
            const tabNav = document.querySelector('header + .border-b nav.flex');
            if (!tabNav) {
                console.warn("[applyPanelOrderAndVisibility v3] Tab navigation container not found.");
                return;
            }

            const moreTabsBtn = document.getElementById('moreTabsBtn');
            const moreTabsBtnParent = moreTabsBtn?.parentNode;

            const allTabButtons = {};
            tabsConfig.forEach(tab => {
                const btn = document.getElementById(`${tab.id}Tab`);
                if (btn) allTabButtons[tab.id] = btn;
                else console.warn(`[applyPanelOrderAndVisibility v3] Tab button not found for ID: ${tab.id}Tab`);
            });

            console.log("[applyPanelOrderAndVisibility v3] Applying visibility. Order:", order, "Visibility:", visibility);

            order.forEach((panelId, index) => {
                const tabBtn = allTabButtons[panelId];
                const isVisible = visibility[index] ?? true;
                if (tabBtn) {
                    const wasHidden = tabBtn.classList.contains('hidden');
                    const shouldBeHidden = !isVisible;
                    if (wasHidden && !shouldBeHidden) {
                        console.log(`[applyPanelOrderAndVisibility v3] Removing 'hidden' from: ${panelId}Tab`);
                        tabBtn.classList.remove('hidden');
                    } else if (!wasHidden && shouldBeHidden) {
                        console.log(`[applyPanelOrderAndVisibility v3] Adding 'hidden' to: ${panelId}Tab`);
                        tabBtn.classList.add('hidden');
                    }
                } else {
                    console.warn(`[applyPanelOrderAndVisibility v3] Cannot apply visibility, button ${panelId}Tab not found.`);
                }
            });

            const fragment = document.createDocumentFragment();
            order.forEach(panelId => {
                const tabBtn = allTabButtons[panelId];
                if (tabBtn) {
                    fragment.appendChild(tabBtn);
                }
            });

            if (moreTabsBtnParent) {
                let currentChild = tabNav.firstChild;
                while (currentChild) {
                    let nextSibling = currentChild.nextSibling;
                    if (currentChild.nodeType === Node.ELEMENT_NODE && currentChild.id && currentChild.id.endsWith('Tab') && currentChild.id !== 'moreTabsBtn') {
                        tabNav.removeChild(currentChild);
                    }
                    currentChild = nextSibling;
                }
                tabNav.insertBefore(fragment, moreTabsBtnParent);
                console.log("[applyPanelOrderAndVisibility v3] DOM order applied before 'more' button.");
            } else {
                tabNav.innerHTML = '';
                tabNav.appendChild(fragment);
                console.log("[applyPanelOrderAndVisibility v3] DOM order applied (moreTabsBtnParent not found, might cause issues).");
            }

            if (typeof setupTabsOverflow === 'function') {
                requestAnimationFrame(() => {
                    console.log("[applyPanelOrderAndVisibility v3] Calling setupTabsOverflow via requestAnimationFrame");
                    setupTabsOverflow();
                });
            } else {
                console.warn("[applyPanelOrderAndVisibility v3] setupTabsOverflow function not found.");
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
                            console.log("Destroyed previous SortableJS instance.");
                        } catch (e) { console.error("Error destroying Sortable instance:", e); }
                    }
                    try {
                        panelSortContainer.sortableInstance = new Sortable(panelSortContainer, {
                            animation: 150,
                            handle: '.fa-grip-lines',
                            ghostClass: 'my-sortable-ghost',
                            onEnd: function (/**Event*/evt) {
                                console.log("SortableJS onEnd event triggered INSIDE populateModalControls.");
                                updatePreviewSettingsFromModal();
                                isUISettingsDirty = true;
                                console.log("Preview settings updated after drag. isUISettingsDirty:", isUISettingsDirty);
                            },
                        });
                        console.log("Initialized SortableJS with onEnd handler inside populateModalControls.");
                    } catch (e) {
                        console.error("Failed to initialize Sortable:", e);
                        showNotification("Не удалось инициализировать сортировку панелей.", "error");
                    }
                } else {
                    console.warn("SortableJS library not loaded. Drag-and-drop for panels disabled.");
                }

                panelSortContainer.querySelectorAll('.toggle-visibility').forEach(button => {
                    button.removeEventListener('click', handleModalVisibilityToggle);
                    button.addEventListener('click', handleModalVisibilityToggle);
                });

            } else {
                console.error("Panel sort container (#panelSortContainer) not found in populateModalControls.");
            }
        }


        async function deleteAlgorithm(algorithmId, section) {
            if (section === 'main') {
                console.warn("Попытка удалить 'main' алгоритм через функцию deleteAlgorithm.");
                showNotification("Главный алгоритм не может быть удален.", "warning");
                return Promise.resolve();
            }

            if (!algorithms || !algorithms[section] || !Array.isArray(algorithms[section])) {
                console.error(`deleteAlgorithm: Секция ${section} не найдена или не является массивом в 'algorithms'.`);
                showNotification(`Ошибка: Не удалось найти раздел "${getSectionName(section)}" для удаления алгоритма.`, "error");
                return Promise.reject(new Error(`Неверная секция или данные алгоритмов: ${section}`));
            }

            const indexToDelete = algorithms[section].findIndex(a => String(a?.id) === String(algorithmId));

            if (indexToDelete === -1) {
                console.error(`deleteAlgorithm: Алгоритм с ID ${algorithmId} не найден в секции ${section}.`);
                const algoCard = document.querySelector(`#${section}Algorithms .algorithm-card[data-id="${algorithmId}"]`);
                if (algoCard) {
                    algoCard.remove();
                    console.log(`Удалена карточка алгоритма ${algorithmId} из DOM, т.к. он не найден в данных.`);
                }
                showNotification("Ошибка: Алгоритм уже удален или не найден.", "warning");
                return Promise.resolve();
            }

            const algorithmToDelete = JSON.parse(JSON.stringify(algorithms[section][indexToDelete]));
            if (!algorithmToDelete.id) algorithmToDelete.id = algorithmId;

            console.log(`Начало удаления алгоритма ID: ${algorithmId}, Секция: ${section}`);

            let transaction;
            let deleteSuccessful = false;
            try {
                if (!db) throw new Error("База данных недоступна");
                transaction = db.transaction(['algorithms', 'screenshots'], 'readwrite');
                const screenshotsStore = transaction.objectStore('screenshots');
                const algorithmsStore = transaction.objectStore('algorithms');

                console.log(`[TX Delete] Поиск скриншотов по parentId: ${algorithmId}, parentType: 'algorithm'`);
                const screenshotsToDelete = await new Promise((resolve, reject) => {
                    if (!screenshotsStore.indexNames.contains('parentId')) {
                        console.error("[TX Delete] Ошибка: Индекс 'parentId' не найден в хранилище 'screenshots'.");
                        return reject(new Error("Индекс 'parentId' отсутствует."));
                    }
                    const index = screenshotsStore.index('parentId');
                    let keyToSearch = algorithmId;

                    const request = index.getAll(keyToSearch);

                    request.onsuccess = e => {
                        const allParentScreenshots = e.target.result || [];
                        const algorithmScreenshots = allParentScreenshots.filter(s => s.parentType === 'algorithm');
                        resolve(algorithmScreenshots);
                    };
                    request.onerror = e => {
                        console.error(`[TX Delete] Ошибка получения скриншотов по индексу parentId=${keyToSearch}:`, e.target.error);
                        reject(new Error(`Ошибка поиска скриншотов: ${e.target.error?.message}`));
                    };
                });

                console.log(`[TX Delete] Найдено ${screenshotsToDelete.length} скриншотов типа 'algorithm' для удаления (parentId: ${algorithmId}).`);

                if (screenshotsToDelete.length > 0) {
                    const deleteScreenshotPromises = screenshotsToDelete.map(screenshot => {
                        return new Promise((resolve) => {
                            if (screenshot && screenshot.id !== undefined) {
                                console.log(`[TX Delete] Запрос на удаление скриншота ID: ${screenshot.id}`);
                                const delReq = screenshotsStore.delete(screenshot.id);
                                delReq.onsuccess = () => { console.log(`[TX Delete] Успешно удален скриншот ID: ${screenshot.id}`); resolve(); };
                                delReq.onerror = (e) => { console.error(`[TX Delete] Ошибка удаления скриншота ID: ${screenshot.id}`, e.target.error); resolve(); };
                            } else {
                                console.warn("[TX Delete] Пропуск удаления невалидной записи скриншота:", screenshot);
                                resolve();
                            }
                        });
                    });
                    await Promise.all(deleteScreenshotPromises);
                    console.log("[TX Delete] Запросы на удаление скриншотов завершены.");
                } else {
                    console.log("[TX Delete] Связанных скриншотов для удаления не найдено.");
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
                        reject(new Error(`Ошибка сохранения algorithms после удаления ${algorithmId}: ${e.target.error?.message}`));
                    };
                });
                console.log(`Обновленные данные algorithms сохранены в IndexedDB после удаления ${algorithmId}.`);

                deleteSuccessful = true;

                await new Promise((resolve, reject) => {
                    transaction.oncomplete = () => {
                        console.log("Транзакция удаления алгоритма и скриншотов успешно завершена.");
                        resolve();
                    };
                    transaction.onerror = (e) => {
                        console.error("ОШИБКА ТРАНЗАКЦИИ при удалении алгоритма/скриншотов:", e.target.error);
                        reject(e.target.error || new Error("Неизвестная ошибка транзакции"));
                    };
                    transaction.onabort = (e) => {
                        console.warn("Транзакция удаления алгоритма/скриншотов ПРЕРВАНА:", e.target.error);
                        if (!deleteSuccessful) resolve();
                        else reject(e.target.error || new Error("Транзакция прервана"));
                    };
                });

            } catch (error) {
                console.error(`КРИТИЧЕСКАЯ ОШИБКА при удалении алгоритма ${algorithmId} из секции ${section}:`, error);
                if (transaction && transaction.readyState !== 'done' && transaction.abort) {
                    try { console.log("Попытка явно отменить транзакцию..."); transaction.abort(); } catch (e) { console.error("Ошибка при явной отмене транзакции:", e); }
                }
                deleteSuccessful = false;
                if (algorithmToDelete && algorithms?.[section] && !algorithms[section].find(a => String(a?.id) === String(algorithmId))) {
                    algorithms[section].splice(indexToDelete, 0, algorithmToDelete);
                    console.warn(`Восстановлен алгоритм ${algorithmId} в памяти из-за ошибки удаления.`);
                    if (typeof renderAlgorithmCards === 'function') {
                        renderAlgorithmCards(section);
                    }
                }
                showNotification(`Произошла ошибка при удалении алгоритма: ${error.message || error}`, "error");
                return Promise.reject(error);
            }

            if (deleteSuccessful) {
                if (typeof updateSearchIndex === 'function' && algorithmToDelete?.id) {
                    console.log(`Запуск обновления поискового индекса (delete) для ID: ${algorithmToDelete.id}`);
                    updateSearchIndex('algorithms', algorithmToDelete.id, algorithmToDelete, 'delete')
                        .then(() => console.log(`Обновление поискового индекса (удаление) инициировано для ${algorithmToDelete.id}`))
                        .catch(indexError => console.error(`Ошибка фонового обновления индекса при удалении алгоритма ${algorithmToDelete.id}:`, indexError));
                } else { console.warn("Не удалось обновить индекс для удаленного алгоритма - функция или ID отсутствуют."); }

                if (typeof renderAlgorithmCards === 'function') {
                    console.log(`Перерисовка карточек алгоритмов для секции ${section}...`);
                    renderAlgorithmCards(section);
                } else { console.warn("Функция renderAlgorithmCards не найдена, UI может не обновиться."); }

                showNotification("Алгоритм успешно удален.");
                return Promise.resolve();
            } else {
                console.error(`Удаление алгоритма ${algorithmId} завершилось без успеха, но и без явной ошибки транзакции.`);
                return Promise.reject(new Error("Удаление завершилось с неопределенным статусом"));
            }
        }


        document.addEventListener('DOMContentLoaded', () => {
            if (typeof initUICustomization === 'function') {
                initUICustomization();
            } else {
                console.warn("initUICustomization function not found.");
            }

            if (typeof applyUISettings === 'function') {
                applyUISettings()
                    .catch(error => {
                        console.error("Error during initial UI setup:", error);
                        if (typeof showNotification === 'function') {
                            showNotification("Ошибка загрузки настроек интерфейса", "error");
                        } else {
                            console.error("showNotification function not found, cannot display UI settings load error.");
                        }
                    });
            } else {
                console.warn("applyUISettings function not found.");
            }
        });

        const newClickHandler = async (event) => {
            const button = event.currentTarget;
            const algorithmModal = button.closest('#algorithmModal');

            if (!algorithmModal) {
                console.error("handleDeleteAlgorithmClick: Не удалось найти родительское модальное окно #algorithmModal.");
                showNotification("Ошибка: Не удалось определить контекст для удаления.", "error");
                return;
            }

            const algorithmIdToDelete = algorithmModal.dataset.currentAlgorithmId;
            const sectionToDelete = algorithmModal.dataset.currentSection;

            if (!algorithmIdToDelete || !sectionToDelete) {
                console.error("handleDeleteAlgorithmClick: Не удалось определить algorithmId или section из data-атрибутов.");
                showNotification("Ошибка: Не удалось определить алгоритм для удаления.", "error");
                return;
            }

            if (sectionToDelete === 'main') {
                showNotification("Главный алгоритм удалить нельзя.", "warning");
                return;
            }

            const modalTitleElement = document.getElementById('modalTitle');
            const algorithmTitle = modalTitleElement ? modalTitleElement.textContent : `алгоритм с ID ${algorithmIdToDelete}`;

            if (confirm(`Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`)) {

                algorithmModal.classList.add('hidden');
                console.log(`[newClickHandler] Modal #${algorithmModal.id} скрыто сразу после подтверждения.`);

                console.log(`Запуск удаления алгоритма ID: ${algorithmIdToDelete} из секции: ${sectionToDelete}`);
                try {
                    if (typeof deleteAlgorithm === 'function') {
                        await deleteAlgorithm(algorithmIdToDelete, sectionToDelete);
                    } else {
                        console.error("handleDeleteAlgorithmClick: Функция deleteAlgorithm не найдена!");
                        throw new Error("Функция удаления недоступна.");
                    }
                } catch (error) {
                    console.error(`Ошибка при вызове deleteAlgorithm из обработчика кнопки:`, error);
                    showNotification("Произошла ошибка при попытке удаления алгоритма.", "error");
                }
            } else {
                console.log("Удаление алгоритма отменено пользователем.");
            }
        };

        deleteAlgorithmBtn.addEventListener('click', newClickHandler);
        deleteAlgorithmBtn._clickHandler = newClickHandler;
        console.log("Обработчик клика для deleteAlgorithmBtn настроен для использования data-атрибутов.");


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

            if (event.target === topmostModal) {

                if (topmostModal.id === 'bookmarkModal' || topmostModal.id === 'bookmarkDetailModal') {
                    console.log(`[Global Click Handler] Click on overlay for modal "${topmostModal.id}" detected, but closing is prevented for bookmark modals.`);
                    return;
                }

                const contentContainer = topmostModal.querySelector('.modal-content-container');

                console.log(`[Global Click Handler] Closing modal "${topmostModal.id}" due to click on overlay.`);

                if (topmostModal.id === 'editModal' || topmostModal.id === 'addModal') {
                    if (typeof requestCloseModal === 'function') {
                        requestCloseModal(topmostModal);
                    } else {
                        console.warn('requestCloseModal function not found, hiding modal directly.');
                        topmostModal.classList.add('hidden');
                        if (typeof removeEscapeHandler === 'function') {
                            removeEscapeHandler(topmostModal);
                        }
                    }
                } else if (topmostModal.id === 'reglamentDetailModal' || topmostModal.id === 'screenshotViewerModal' || topmostModal.id === 'noInnModal' || topmostModal.id === 'foldersModal' || topmostModal.id === 'hotkeysModal' || topmostModal.id === 'confirmClearDataModal' || topmostModal.id === 'cibLinkModal' || topmostModal.id === 'extLinkModal') {
                    topmostModal.classList.add('hidden');
                    if (typeof removeEscapeHandler === 'function') {
                        removeEscapeHandler(topmostModal);
                    }
                    if (topmostModal.id === 'screenshotViewerModal') {
                        const state = topmostModal._modalState || {};
                        const images = state.contentArea?.querySelectorAll('img[data-object-url]');
                        images?.forEach(img => {
                            if (img.dataset.objectUrl) {
                                try { URL.revokeObjectURL(img.dataset.objectUrl); } catch (revokeError) { console.warn(`Error revoking URL on overlay close for ${topmostModal.id}:`, revokeError); }
                                delete img.dataset.objectUrl;
                            }
                        });
                    }
                } else if (topmostModal.id === 'customizeUIModal') {
                    topmostModal.classList.add('hidden');
                    if (typeof removeEscapeHandler === 'function') {
                        removeEscapeHandler(topmostModal);
                    }
                    if (window.isUISettingsDirty) {
                        console.log("Closing customize UI modal via overlay click with unsaved changes. Reverting preview.");
                        if (typeof applyPreviewSettings === 'function' && typeof window.originalUISettings !== 'undefined') {
                            applyPreviewSettings(window.originalUISettings);
                            window.isUISettingsDirty = false;
                        } else {
                            console.warn("Cannot revert preview settings: applyPreviewSettings function or originalUISettings missing.");
                        }
                    }
                    const inputField = topmostModal.querySelector('#employeeExtensionInput');
                    if (inputField && !inputField.classList.contains('hidden')) {
                        const displaySpan = topmostModal.querySelector('#employeeExtensionDisplay');
                        inputField.classList.add('hidden');
                        if (displaySpan) displaySpan.classList.remove('hidden');
                        if (typeof loadEmployeeExtension === 'function') loadEmployeeExtension();
                    }
                } else {
                    console.warn(`[Global Click Handler] Closing unhandled modal "${topmostModal.id}" on overlay click.`);
                    topmostModal.classList.add('hidden');
                    if (typeof removeEscapeHandler === 'function') {
                        removeEscapeHandler(topmostModal);
                    }
                }

                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('modal-open');
                }
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

            const escapeHtmlLocal = (unsafe) => {
                if (typeof unsafe !== 'string') return '';
                return unsafe
                    .replace(/&/g, "&")
                    .replace(/</g, "<")
                    .replace(/>/g, ">")
                    .replace(/"/g, "")
                    .replace(/'/g, "'");
            };

            const urlPattern = /(https?:\/\/[^\s<>"]+)/g;

            const parts = text.split(urlPattern);
            let resultHTML = "";

            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    resultHTML += escapeHtmlLocal(parts[i]).replace(/\n/g, '<br>');
                } else {
                    let url = parts[i];
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        let escapedUrlForAttr = escapeHtmlLocal(url);
                        let linkText = escapeHtmlLocal(url);
                        resultHTML += `<a href="${escapedUrlForAttr}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline break-all">${linkText}</a>`;
                    } else {
                        resultHTML += escapeHtmlLocal(parts[i]).replace(/\n/g, '<br>');
                    }
                }
            }

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
            if (contentAreaSelector && !contentArea) {
                console.warn(`[toggleModalFullscreen] Warning: contentArea not found using selector: "${contentAreaSelector}" within #${modalId}. Proceeding without it.`);
            }

            const icon = buttonElement.querySelector('i');
            const isCurrentlyFullscreen = modalElement.classList.contains('is-fullscreen');
            const shouldBeFullscreen = !isCurrentlyFullscreen;

            console.log(`Toggling fullscreen for ${modalId}. Should be fullscreen: ${shouldBeFullscreen}`);

            const classesToRemoveConfig = isCurrentlyFullscreen ? classToggleConfig.fullscreen : classToggleConfig.normal;
            const classesToAddConfig = shouldBeFullscreen ? classToggleConfig.fullscreen : classToggleConfig.normal;

            Object.entries(classesToRemoveConfig).forEach(([part, classes]) => {
                const element = part === 'modal' ? modalElement : (part === 'innerContainer' ? innerContainer : contentArea);
                if (element && classes && classes.length > 0) {
                    element.classList.remove(...classes);
                }
            });

            Object.entries(classesToAddConfig).forEach(([part, classes]) => {
                const element = part === 'modal' ? modalElement : (part === 'innerContainer' ? innerContainer : contentArea);
                if (element && classes && classes.length > 0) {
                    element.classList.add(...classes);
                }
            });

            modalElement.classList.toggle('is-fullscreen', shouldBeFullscreen);

            if (icon) {
                icon.classList.remove('fa-expand', 'fa-compress');
                icon.classList.add(shouldBeFullscreen ? 'fa-compress' : 'fa-expand');
            }
            buttonElement.setAttribute('title', shouldBeFullscreen ? 'Свернуть' : 'Развернуть на весь экран');

            console.log(`Fullscreen toggle complete for ${modalId}. Is fullscreen: ${shouldBeFullscreen}`);
        }


        function initFullscreenToggles() {
            const viewBtn = document.getElementById('toggleFullscreenViewBtn');
            const addBtn = document.getElementById('toggleFullscreenAddBtn');
            const editBtn = document.getElementById('toggleFullscreenEditBtn');

            const algorithmModalConfig = {
                modalId: 'algorithmModal',
                buttonId: 'toggleFullscreenViewBtn',
                classToggleConfig: {
                    normal: { modal: ['p-4'], innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'], contentArea: ['p-6'] },
                    fullscreen: { modal: ['p-0'], innerContainer: ['w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none', 'shadow-none'], contentArea: ['p-6'] }
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '#algorithmSteps'
            };
            const addModalConfig = {
                modalId: 'addModal',
                buttonId: 'toggleFullscreenAddBtn',
                classToggleConfig: {
                    normal: { modal: ['p-4'], innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'], contentArea: ['p-6'] },
                    fullscreen: { modal: ['p-0'], innerContainer: ['w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none', 'shadow-none'], contentArea: ['p-6'] }
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.p-content.overflow-y-auto.flex-1'
            };
            const editModalConfig = {
                modalId: 'editModal',
                buttonId: 'toggleFullscreenEditBtn',
                classToggleConfig: {
                    normal: { modal: ['p-4'], innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'], contentArea: ['p-6'] },
                    fullscreen: { modal: ['p-0'], innerContainer: ['w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none', 'shadow-none'], contentArea: ['p-6'] }
                },
                innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
                contentAreaSelector: '.p-content.overflow-y-auto.flex-1'
            };

            const initButton = (btn, config) => {
                if (btn && !btn.dataset.fullscreenListenerAttached) {
                    btn.addEventListener('click', () => {
                        if (typeof toggleModalFullscreen === 'function') {
                            toggleModalFullscreen(
                                config.modalId,
                                config.buttonId,
                                config.classToggleConfig,
                                config.innerContainerSelector,
                                config.contentAreaSelector
                            );
                        } else {
                            console.error(`Функция toggleModalFullscreen не найдена при клике на кнопку #${config.buttonId}`);
                            if (typeof showNotification === 'function') showNotification("Ошибка: Функция переключения полноэкранного режима недоступна.", "error");
                        }
                    });
                    btn.dataset.fullscreenListenerAttached = 'true';
                    console.log(`Полноэкранный режим инициализирован для ${config.modalId} в initFullscreenToggles.`);
                } else if (!btn) {
                    console.log(`[initFullscreenToggles] Кнопка с ID ${config.buttonId} не найдена. Пропуск инициализации для ${config.modalId}.`);
                }
            };

            initButton(viewBtn, algorithmModalConfig);
            initButton(addBtn, addModalConfig);
            initButton(editBtn, editModalConfig);

            console.log("Выполнена инициализация переключателей полноэкранного режима (только для статичных/гарантированных окон).");
        }


        async function getAllExtLinks() {
            try {
                console.log("[getAllExtLinks] Вызов getAllFromIndexedDB('extLinks')...");
                const links = await getAllFromIndexedDB('extLinks');
                console.log(`[getAllExtLinks] Получено ${links?.length ?? 0} внешних ссылок.`);
                return links || [];
            } catch (error) {
                console.error("Ошибка в функции getAllExtLinks при получении внешних ссылок:", error);
                showNotification("Не удалось получить список внешних ресурсов", "error");
                return [];
            }
        }

        async function getAllFromIndexedDBWhere(storeName, indexName, indexValue) {
            console.log(`[getAllFromIndexedDBWhere] Вызов обертки для ${storeName} по индексу ${indexName} = ${indexValue}`);
            try {
                if (typeof getAllFromIndex !== 'function') {
                    console.error("getAllFromIndexedDBWhere: Базовая функция getAllFromIndex не найдена!");
                    throw new Error("Зависимость getAllFromIndex отсутствует");
                }
                return await getAllFromIndex(storeName, indexName, indexValue);
            } catch (error) {
                console.error(`[getAllFromIndexedDBWhere] Ошибка при вызове getAllFromIndex для ${storeName}/${indexName}/${indexValue}:`, error);
                throw error;
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
            const editModal = document.getElementById('editModal');
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const algorithmDescriptionInput = document.getElementById('algorithmDescription');
            const editStepsContainer = document.getElementById('editSteps');

            if (!editModal || !algorithmTitleInput || !editStepsContainer) {
                console.error("getCurrentEditState: Не найдены элементы формы редактирования или модальное окно.");
                return null;
            }

            const section = editModal.dataset.section;
            const isMainAlgorithm = section === 'main';

            const currentTitle = algorithmTitleInput.value.trim();
            const currentDescription = (!isMainAlgorithm && algorithmDescriptionInput)
                ? algorithmDescriptionInput.value.trim()
                : undefined;

            const currentSteps = [];
            const stepDivs = editStepsContainer.querySelectorAll('.edit-step');

            stepDivs.forEach(stepDiv => {
                const titleInput = stepDiv.querySelector('.step-title');
                const descInput = stepDiv.querySelector('.step-desc');
                const exampleInput = stepDiv.querySelector('.step-example');

                const currentStepData = {
                    title: titleInput ? titleInput.value.trim() : '',
                    description: descInput ? descInput.value.trim() : '',
                    example: exampleInput ? exampleInput.value.trim() : ''
                };
                if (stepDiv.dataset.stepType) {
                    currentStepData.type = stepDiv.dataset.stepType;
                }

                if (!isMainAlgorithm) {
                    const existingIdsStr = stepDiv.dataset.existingScreenshotIds || '';
                    const deletedIdsStr = stepDiv.dataset.screenshotsToDelete || '';
                    const deletedIdsSet = new Set(deletedIdsStr.split(',').filter(Boolean).map(s => s.trim()));

                    const currentExistingIds = existingIdsStr.split(',')
                        .filter(Boolean)
                        .map(s => s.trim())
                        .filter(id => !deletedIdsSet.has(id))
                        .join(',');

                    currentStepData.existingScreenshotIds = currentExistingIds;

                    currentStepData.tempScreenshotsCount = (stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs))
                        ? stepDiv._tempScreenshotBlobs.length
                        : 0;

                    currentStepData.deletedScreenshotIds = deletedIdsStr;
                }

                currentSteps.push(currentStepData);
            });

            const currentState = {
                title: currentTitle,
                ...(currentDescription !== undefined && { description: currentDescription }),
                steps: currentSteps
            };

            console.log("Получено ТЕКУЩЕЕ состояние для сравнения (с учетом скриншотов):", JSON.parse(JSON.stringify(currentState)));
            return currentState;
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
            const currentSteps = [];

            const stepDivs = newStepsContainer.querySelectorAll('.edit-step');

            stepDivs.forEach(stepDiv => {
                const titleInput = stepDiv.querySelector('.step-title');
                const descInput = stepDiv.querySelector('.step-desc');
                const exampleInput = stepDiv.querySelector('.step-example');

                const stepData = {
                    title: titleInput ? titleInput.value.trim() : '',
                    description: descInput ? descInput.value.trim() : '',
                    example: exampleInput ? exampleInput.value.trim() : '',
                    existingScreenshotIds: '',
                    tempScreenshotsCount: (stepDiv._tempScreenshotBlobs && Array.isArray(stepDiv._tempScreenshotBlobs))
                        ? stepDiv._tempScreenshotBlobs.length
                        : 0,
                    deletedScreenshotIds: stepDiv.dataset.screenshotsToDelete || ''
                };
                if (stepDiv.dataset.stepType) {
                    stepData.type = stepDiv.dataset.stepType;
                }
                currentSteps.push(stepData);
            });

            const currentState = {
                title: currentTitle,
                description: currentDescription,
                steps: currentSteps
            };

            return currentState;
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

            if (initialState === null) {
                console.error(`hasChanges (${modalType}): НАЧАЛЬНОЕ состояние (initialState) равно null! Невозможно сравнить. Возможно, произошла ошибка при открытии окна. Предполагаем наличие изменений для безопасности.`);
                console.log(`hasChanges (${modalType}): Текущее состояние (currentState):`, currentState ? JSON.parse(JSON.stringify(currentState)) : currentState);
                return true;
            }
            if (currentState === null) {
                console.error(`hasChanges (${modalType}): ТЕКУЩЕЕ состояние (currentState) равно null! Невозможно сравнить. Возможно, произошла ошибка при получении данных из формы. Предполагаем наличие изменений для безопасности.`);
                console.log(`hasChanges (${modalType}): Начальное состояние (initialState):`, JSON.parse(JSON.stringify(initialState)));
                return true;
            }

            const areEquivalent = deepEqual(initialState, currentState);

            const changed = !areEquivalent;

            if (changed) {
                console.log(`hasChanges (${modalType}): Обнаружены изменения через deepEqual.`);
                console.log("Initial State:", JSON.stringify(initialState, null, 2));
                console.log("Current State:", JSON.stringify(currentState, null, 2));
            } else {
                console.log(`hasChanges (${modalType}): Изменения НЕ обнаружены через deepEqual.`);
            }

            return changed;
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
            const editModal = document.getElementById('editModal');
            const section = editModal?.dataset.section;

            if (!algorithm || !section) {
                initialEditState = null;
                console.warn("captureInitialEditState: Алгоритм или секция не предоставлены.");
                return;
            }

            try {
                const isMainAlgorithm = section === 'main';
                const algorithmCopy = JSON.parse(JSON.stringify(algorithm));

                const initialData = {
                    title: algorithmCopy.title || '',
                    ...(!isMainAlgorithm && { description: algorithmCopy.description || '' }),
                    steps: []
                };

                if (Array.isArray(algorithmCopy.steps)) {
                    initialData.steps = algorithmCopy.steps.map(step => {
                        if (!step) return null;

                        const initialStep = {
                            title: step.title || '',
                            description: step.description || '',
                            example: formatExampleForTextarea(step.example),
                            ...(step.type && { type: step.type })
                        };

                        if (!isMainAlgorithm) {
                            const existingIds = Array.isArray(step.screenshotIds)
                                ? step.screenshotIds.filter(id => id !== null && id !== undefined).join(',')
                                : '';
                            initialStep.existingScreenshotIds = existingIds;
                            initialStep.tempScreenshotsCount = 0;
                            initialStep.deletedScreenshotIds = '';
                        }

                        return initialStep;

                    }).filter(step => step !== null);
                } else {
                    console.warn(`captureInitialEditState: Поле steps у алгоритма ${algorithm.id} не является массивом.`);
                    initialData.steps = [];
                }

                initialEditState = JSON.parse(JSON.stringify(initialData));
                console.log("Захвачено НАЧАЛЬНОЕ состояние для редактирования (с учетом скриншотов):", JSON.parse(JSON.stringify(initialEditState)));

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
            const initialSteps = [];

            initialAddState = {
                title: initialTitle,
                description: initialDescription,
                steps: initialSteps
            };

            console.log("Захвачено НАЧАЛЬНОЕ состояние для добавления:", JSON.parse(JSON.stringify(initialAddState)));
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
                    extension = localStorage.getItem('employeeExtension') || '';
                    console.warn("Загрузка добавочного номера из localStorage (DB недоступна)");
                }
            } catch (error) {
                console.error("Ошибка при загрузке добавочного номера:", error);
                extension = localStorage.getItem('employeeExtension') || '';
            }
            updateExtensionDisplay(extension);
        }


        async function saveEmployeeExtension(extensionValue) {
            const valueToSave = extensionValue.trim().replace(/\D/g, '');

            try {
                if (db) {
                    await saveToIndexedDB('preferences', { id: 'employeeExtension', value: valueToSave });
                    console.log("Добавочный номер сохранен в IndexedDB:", valueToSave);
                } else {
                    localStorage.setItem('employeeExtension', valueToSave);
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


        function setupClearButton(inputId, buttonId, actionCallback) {
            const input = document.getElementById(inputId);
            const button = document.getElementById(buttonId);

            if (!input || !button) {
                console.warn(`Не удалось настроить кнопку очистки: поле ввода (${inputId}) или кнопка (${buttonId}) не найдены.`);
                return;
            }

            const toggleButtonVisibility = () => {
                button.classList.toggle('hidden', input.value.length === 0);
            };

            input.addEventListener('input', toggleButtonVisibility);

            toggleButtonVisibility();

            button.addEventListener('click', () => {
                input.value = '';
                button.classList.add('hidden');
                input.focus();
                if (typeof actionCallback === 'function') {
                    try {
                        actionCallback();
                    } catch (error) {
                        console.error(`Ошибка при вызове actionCallback для ${inputId}:`, error);
                    }
                }
                const event = new Event('input', { bubbles: true, cancelable: true });
                input.dispatchEvent(event);
            });
            console.log(`Кнопка очистки настроена для поля ${inputId}`);
        }


        function setupHotkeys() {
            document.removeEventListener('keydown', handleGlobalHotkey, true);
            document.removeEventListener('keydown', handleGlobalHotkey, false);

            document.addEventListener('keydown', handleGlobalHotkey, false);
            console.log("Глобальный обработчик горячих клавиш инициализирован (фаза всплытия).");
        }


        function toggleActiveSectionView() {
            if (typeof currentSection === 'undefined' || !currentSection) {
                console.warn("toggleActiveSectionView: Переменная currentSection не определена или пуста.");
                showNotification("Не удалось определить активную секцию для переключения вида.", "warning");
                return;
            }

            let containerId;
            let sectionIdentifierForPrefs;

            switch (currentSection) {
                case 'main':
                    showNotification("Главный алгоритм не имеет переключения вида.", "info");
                    return;
                case 'program': containerId = 'programAlgorithms'; break;
                case 'skzi': containerId = 'skziAlgorithms'; break;
                case 'webReg': containerId = 'webRegAlgorithms'; break;
                case 'lk1c': containerId = 'lk1cAlgorithms'; break;
                case 'links': containerId = 'linksContainer'; break;
                case 'extLinks': containerId = 'extLinksContainer'; break;
                case 'reglaments':
                    const reglamentsListDiv = document.getElementById('reglamentsList');
                    if (!reglamentsListDiv || reglamentsListDiv.classList.contains('hidden')) {
                        showNotification("Сначала выберите категорию регламентов.", "info");
                        return;
                    }
                    containerId = 'reglamentsContainer';
                    break;
                case 'bookmarks': containerId = 'bookmarksContainer'; break;
                default:
                    console.warn(`toggleActiveSectionView: Неизвестная секция '${currentSection}'.`);
                    showNotification("Переключение вида для текущей секции не поддерживается.", "warning");
                    return;
            }
            sectionIdentifierForPrefs = containerId;

            const container = document.getElementById(containerId);
            if (!container) {
                console.warn(`toggleActiveSectionView: Контейнер #${containerId} не найден для секции ${currentSection}.`);
                showNotification("Не удалось найти контейнер для переключения вида.", "error");
                return;
            }

            const currentView = viewPreferences[sectionIdentifierForPrefs] || container.dataset.defaultView || 'cards';
            const nextView = currentView === 'cards' ? 'list' : 'cards';

            console.log(`Переключение вида для ${sectionIdentifierForPrefs} с ${currentView} на ${nextView}`);

            if (typeof applyView === 'function' && typeof saveViewPreference === 'function') {
                applyView(container, nextView);
                saveViewPreference(sectionIdentifierForPrefs, nextView);
                showNotification(`Вид переключен на: ${nextView === 'list' ? 'Список' : 'Плитки'}`, "info", 1500);
            } else {
                console.error("toggleActiveSectionView: Функции applyView или saveViewPreference не найдены.");
                showNotification("Ошибка: Функция переключения вида недоступна.", "error");
            }
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

            let dbReady = false;
            try {
                console.log("DOMContentLoaded: Запуск инициализации приложения (appInit)...");
                dbReady = await appInit();
                console.log("DOMContentLoaded: Инициализация appInit завершена. Статус БД:", dbReady);

                initClearDataFunctionality();
                initFullscreenToggles();
                initReloadButton();
                initHotkeysModal();
                console.log("DOMContentLoaded: Инициализация горячих клавиш...");
                setupHotkeys();

                if (dbReady) {
                    if (typeof applyUISettings === 'function') {
                        console.log("DOMContentLoaded: БД готова, применяем настройки UI...");
                        await applyUISettings();
                    } else {
                        console.error("DOMContentLoaded: Функция applyUISettings не определена! Применяются стили по умолчанию.");
                        if (typeof setTheme === 'function') setTheme('auto'); else document.documentElement.classList.remove('dark');
                        document.documentElement.style.fontSize = '100%';
                        document.documentElement.style.removeProperty('--color-primary');
                    }
                } else {
                    console.warn("DOMContentLoaded: База данных не готова. Пропуск применения настроек UI из БД. Применяются настройки по умолчанию.");
                    if (typeof setTheme === 'function') setTheme('auto'); else document.documentElement.classList.remove('dark');
                    document.documentElement.style.fontSize = '100%';
                    document.documentElement.style.removeProperty('--color-primary');
                }

                appContent.classList.remove('hidden');
                loadingOverlay.style.display = 'none';
                console.log("DOMContentLoaded: Приложение отображено.");

                if (typeof setupTabsOverflow === 'function') {
                    setupTabsOverflow();
                } else {
                    console.warn("DOMContentLoaded: Функция setupTabsOverflow не найдена");
                }

                const mainContentContainer = document.getElementById('mainContent');
                if (mainContentContainer) {
                    mainContentContainer.addEventListener('click', (event) => {
                        const link = event.target.closest('a[id^="noInnLink_"]');
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
                console.error("КРИТИЧЕСКАЯ ОШИБКА во время инициализации приложения (DOMContentLoaded):", error);

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


        function navigateBackWithinApp() {
            console.log("[App Navigate Back] Попытка навигации назад внутри приложения...");

            const reglamentsListDiv = document.getElementById('reglamentsList');
            const categoryGrid = document.getElementById('reglamentCategoryGrid');
            const backToCategoriesBtn = document.getElementById('backToCategories');

            if (reglamentsListDiv && !reglamentsListDiv.classList.contains('hidden') && backToCategoriesBtn) {
                console.log("[App Navigate Back]   > Обнаружен активный список регламентов. Имитация клика 'Назад к категориям'.");
                backToCategoriesBtn.click();
                return true;
            }


            console.log("[App Navigate Back]   > Не найдено подходящего состояния для навигации назад.");
            showNotification("Нет действия 'назад' для текущего экрана.", "info");
            return false;
        }

        function handleGlobalHotkey(event) {
            const code = event.code;
            const ctrlOrMeta = event.ctrlKey || event.metaKey;
            const shift = event.shiftKey;
            const alt = event.altKey;

            const activeElement = document.activeElement;
            const isInputFocused = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            );

            if (code === 'Backspace' && !ctrlOrMeta && !shift && !alt && !isInputFocused) {
                console.log("[Hotkey] Обнаружен Backspace (вне поля ввода)");
                const visibleModals = getVisibleModals();
                const nonClosableByBack = [
                    'customizeUIModal',
                    'hotkeysModal',
                    'confirmClearDataModal',
                    'screenshotLightbox'
                ];
                const topmostModal = visibleModals.length > 0 ? getTopmostModal(visibleModals) : null;

                if (topmostModal && !nonClosableByBack.includes(topmostModal.id)) {
                    console.log(`[Hotkey Backspace] Closing modal: ${topmostModal.id}`);
                    topmostModal.classList.add('hidden');
                    if (topmostModal._escapeHandler && typeof topmostModal._escapeHandler === 'function') {
                        document.removeEventListener('keydown', topmostModal._escapeHandler);
                        delete topmostModal._escapeHandler;
                        console.log(`[Hotkey Backspace] Removed escape handler for modal ${topmostModal.id}`);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                } else if (topmostModal) {
                    console.log(`[Hotkey Backspace] Modal ${topmostModal.id} is open, but not closable by Backspace. Ignoring.`);
                    return;
                } else {
                    console.log("[Hotkey Backspace] No interfering modal open. Preventing browser back navigation.");
                    event.preventDefault();
                    event.stopPropagation();
                    console.log("[Hotkey Backspace] Calling navigateBackWithinApp()");
                    navigateBackWithinApp();
                    return;
                }
            }

            // --- Обработка комбинаций Alt ---
            if (alt && !ctrlOrMeta && !isInputFocused) {
                switch (code) {
                    case 'KeyN': // Alt + N
                        if (!shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + KeyN");
                            event.preventDefault(); event.stopPropagation();
                            console.log(`[Hotkey]   > Выполнение действия: добавить элемент для секции '${currentSection}'`);
                            let addFunctionN = null, functionArgN = null, functionNameN = '';
                            switch (currentSection) {
                                case 'program': case 'skzi': case 'webReg': case 'lk1c':
                                    addFunctionN = showAddModal; functionArgN = currentSection; functionNameN = 'showAddModal'; break;
                                case 'links': addFunctionN = showAddEditCibLinkModal; functionNameN = 'showAddEditCibLinkModal'; break;
                                case 'extLinks': addFunctionN = showAddExtLinkModal; functionNameN = 'showAddExtLinkModal'; break;
                                case 'reglaments': addFunctionN = showAddReglamentModal; functionNameN = 'showAddReglamentModal'; break;
                                case 'bookmarks': addFunctionN = showAddBookmarkModal; functionNameN = 'showAddBookmarkModal'; break;
                                case 'main': showNotification("Добавление элементов в главный алгоритм не предусмотрено.", "info"); break;
                                default:
                                    console.warn(`Alt+N: Неизвестная или неподдерживаемая секция '${currentSection}'.`);
                                    showNotification("Добавление для текущей секции не поддерживается.", "warning");
                            }
                            if (addFunctionN) {
                                if (typeof addFunctionN === 'function') {
                                    console.log(`[Hotkey Alt+N] Вызов функции ${functionNameN} с аргументом:`, functionArgN);
                                    addFunctionN(functionArgN);
                                } else {
                                    console.error(`Alt+N: Функция ${functionNameN} не найдена!`);
                                    showNotification(`Ошибка: Функция добавления для секции ${currentSection} недоступна.`, "error");
                                }
                            }
                            return;
                        }
                        break;

                    case 'KeyT': // Alt + T (Тема)
                        if (!shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + KeyT");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: смена темы");
                            const themeToggleBtn = document.getElementById('themeToggle');
                            if (themeToggleBtn) { themeToggleBtn.click(); }
                            else { console.warn("Alt+T: Кнопка темы не найдена."); showNotification("Кнопка темы не найдена", "error"); }
                            return;
                        }
                        break;

                    case 'KeyS': // Alt + Shift + S (Экспорт)
                        if (shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + Shift + KeyS (Экспорт)");
                            event.preventDefault();
                            event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: экспорт данных (отложенный вызов)");
                            if (typeof exportAllData === 'function') {
                                console.log("[Hotkey]     -> Планирование вызова exportAllData() через setTimeout(0)...");
                                setTimeout(() => {
                                    console.log("[Hotkey]     -> Выполняется exportAllData() из setTimeout.");
                                    try {
                                        exportAllData();
                                    } catch (exportError) {
                                        console.error("!!! Ошибка ВНУТРИ exportAllData() при вызове из хоткея:", exportError);
                                        showNotification("Произошла ошибка во время экспорта.", "error");
                                    }
                                }, 0);
                            } else {
                                console.warn("Alt+Shift+S: Функция exportAllData не найдена.");
                                showNotification("Функция экспорта недоступна.", "error");
                            }
                            return;
                        }
                        break;

                    case 'KeyO': // Alt + Shift + O (Импорт)
                        if (shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + Shift + KeyO (Импорт)");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: импорт данных");
                            const importFileInput = document.getElementById('importFileInput');
                            if (importFileInput) { importFileInput.click(); }
                            else { console.warn("Alt+Shift+O: Поле импорта не найдено."); showNotification("Функция импорта недоступна.", "error"); }
                            return;
                        }
                        break;
                    case 'KeyF': // Alt + F (Фокус на поиск)
                        if (!shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + KeyF (вне поля ввода)");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: фокус на поиск");
                            const searchInput = document.getElementById('searchInput');
                            if (searchInput) { searchInput.focus(); searchInput.select(); }
                            else { console.warn("Alt+F: Поле поиска не найдено."); showNotification("Поле поиска не найдено", "warning"); }
                            return;
                        }
                        break;
                    case 'KeyI': // Alt + I (Открыть настройки)
                        if (!shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + KeyI (вне поля ввода)");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: открыть настройки");
                            const customizeUIBtn = document.getElementById('customizeUIBtn');
                            if (customizeUIBtn) {
                                const customizeUIModal = document.getElementById('customizeUIModal');
                                if (customizeUIModal && customizeUIModal.classList.contains('hidden')) { customizeUIBtn.click(); }
                                else if (!customizeUIModal) { console.warn("Alt+I: Модальное окно настроек не найдено."); showNotification("Окно настроек не найдено.", "error"); }
                                else { console.log("Alt+I: Окно настроек уже открыто."); }
                            } else { console.warn("Alt+I: Кнопка настроек не найдена."); showNotification("Кнопка настроек не найдена.", "error"); }
                            return;
                        }
                        break;
                    case 'KeyV': // Alt + V (Переключить вид)
                        if (!shift) {
                            console.log("[Hotkey] Обнаружена комбинация Alt + KeyV (вне поля ввода)");
                            event.preventDefault(); event.stopPropagation();

                            const screenshotModal = document.getElementById('screenshotViewerModal');
                            if (screenshotModal && !screenshotModal.classList.contains('hidden')) {
                                console.log("[Hotkey]   > Окно просмотра скриншотов активно. Переключаем вид в нем.");
                                const gridBtn = screenshotModal.querySelector('#screenshotViewToggleGrid');
                                const listBtn = screenshotModal.querySelector('#screenshotViewToggleList');

                                if (gridBtn && listBtn) {
                                    const isGridActive = gridBtn.classList.contains('bg-primary');
                                    const buttonToClick = isGridActive ? listBtn : gridBtn;
                                    if (buttonToClick) {
                                        buttonToClick.click();
                                        console.log(`[Hotkey Alt+V] Имитирован клик по кнопке '${buttonToClick.id}' в окне скриншотов.`);
                                    } else {
                                        console.warn("Alt+V (Screenshot): Не удалось определить неактивную кнопку для клика.");
                                    }
                                } else {
                                    console.warn("Alt+V (Screenshot): Не найдены кнопки переключения вида в модальном окне.");
                                    showNotification("Ошибка: Не найдены кнопки вида в окне скриншотов.", "error");
                                }
                            } else {
                                console.log("[Hotkey]   > Выполнение стандартного действия: переключить вид активной секции");
                                if (typeof toggleActiveSectionView === 'function') { toggleActiveSectionView(); }
                                else { console.warn("Alt+V: Функция toggleActiveSectionView не найдена."); showNotification("Функция переключения вида недоступна.", "error"); }
                            }
                            return;
                        }
                        break;
                }
            }

            // --- Комбинации Ctrl/Meta ---
            if (ctrlOrMeta && !alt) {
                switch (code) {
                    case 'KeyD': // D / В
                        if (shift) {
                            console.log("[Hotkey] Обнаружена комбинация Ctrl/Meta + Shift + KeyD");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: сохранить заметки в txt");
                            if (typeof exportClientDataToTxt === 'function') { exportClientDataToTxt(); }
                            else { console.warn("Ctrl+Shift+D: Функция exportClientDataToTxt не найдена."); showNotification("Функция сохранения заметок недоступна.", "error"); }
                            return;
                        }
                        break;
                    case 'Backspace':
                        if (shift) {
                            console.log("[Hotkey] Обнаружена комбинация Ctrl/Meta + Shift + Backspace");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: очистка заметок клиента");
                            const clientNotes = document.getElementById('clientNotes');
                            if (clientNotes && clientNotes.value.trim() !== '') {
                                if (confirm('Вы уверены, что хотите очистить поле данных по обращению?')) {
                                    if (typeof clearClientData === 'function') { clearClientData(); }
                                    else { console.warn("Ctrl+Shift+Backspace: Функция clearClientData не найдена."); clientNotes.value = ''; showNotification("Поле очищено, но не удалось вызвать стандартную функцию.", "warning"); }
                                }
                            } else if (clientNotes) { showNotification("Поле данных по обращению уже пусто.", "info"); }
                            else { console.warn("Ctrl+Shift+Backspace: Поле #clientNotes не найдено."); }
                            return;
                        }
                        break;
                    case 'KeyH': // H / Р
                        if (shift) {
                            console.log("[Hotkey] Обнаружена комбинация Ctrl/Meta + Shift + KeyH");
                            event.preventDefault(); event.stopPropagation();
                            console.log("[Hotkey]   > Выполнение действия: показать окно горячих клавиш");
                            const showHotkeysBtn = document.getElementById('showHotkeysBtn');
                            if (showHotkeysBtn) { showHotkeysBtn.click(); }
                            else { console.warn("Ctrl+Shift+H: Кнопка #showHotkeysBtn не найдена."); showNotification("Не удалось найти кнопку для отображения горячих клавиш.", "error"); }
                            return;
                        }
                        break;
                }
            }
        }


        function initHotkeysModal() {
            const showHotkeysBtn = document.getElementById('showHotkeysBtn');
            const hotkeysModal = document.getElementById('hotkeysModal');
            const closeHotkeysModalBtn = document.getElementById('closeHotkeysModalBtn');
            const okHotkeysModalBtn = document.getElementById('okHotkeysModalBtn');

            if (!showHotkeysBtn || !hotkeysModal || !closeHotkeysModalBtn || !okHotkeysModalBtn) {
                console.warn(
                    "Не найдены все элементы для модального окна горячих клавиш " +
                    "(#showHotkeysBtn, #hotkeysModal, #closeHotkeysModalBtn, #okHotkeysModalBtn). " +
                    "Функциональность может быть нарушена."
                );
                return;
            }

            const handleEscapeKey = (event) => {
                if (event.key === 'Escape') {
                    if (hotkeysModal && !hotkeysModal.classList.contains('hidden')) {
                        closeModal();
                    }
                }
            };

            const openModal = () => {
                if (!hotkeysModal) return;
                hotkeysModal.classList.remove('hidden');
                document.body.classList.add('modal-open');
                document.addEventListener('keydown', handleEscapeKey);
                console.log("Hotkey modal opened, Escape listener added.");
            };

            const closeModal = () => {
                if (!hotkeysModal) return;
                hotkeysModal.classList.add('hidden');
                document.body.classList.remove('modal-open');
                document.removeEventListener('keydown', handleEscapeKey);
                console.log("Hotkey modal closed, Escape listener removed.");
            };

            if (!showHotkeysBtn.dataset.listenerAttached) {
                showHotkeysBtn.addEventListener('click', openModal);
                showHotkeysBtn.dataset.listenerAttached = 'true';
            }


            if (!closeHotkeysModalBtn.dataset.listenerAttached) {
                closeHotkeysModalBtn.addEventListener('click', closeModal);
                closeHotkeysModalBtn.dataset.listenerAttached = 'true';
            }
            if (!okHotkeysModalBtn.dataset.listenerAttached) {
                okHotkeysModalBtn.addEventListener('click', closeModal);
                okHotkeysModalBtn.dataset.listenerAttached = 'true';
            }


            if (!hotkeysModal.dataset.overlayListenerAttached) {
                hotkeysModal.addEventListener('click', (event) => {
                    if (event.target === hotkeysModal) {
                        closeModal();
                    }
                });
                hotkeysModal.dataset.overlayListenerAttached = 'true';
            }

            console.log("Модальное окно горячих клавиш инициализировано.");
        }


        function showImageAtIndex(index, blobs, stateManager) {
            const {
                getCurrentObjectUrl, getCurrentPreloadedUrls,
                updateCurrentIndex, updateCurrentScale, updateTranslate,
                updateObjectUrl, updatePreloadedUrls,
                updateImageTransform, preloadImage
            } = stateManager;

            const currentLightbox = document.getElementById('screenshotLightbox');
            if (!currentLightbox || currentLightbox.classList.contains('hidden')) {
                console.warn(`showImageAtIndex(${index}): Лайтбокс не найден или скрыт.`);
                return;
            }

            const lightboxImage = currentLightbox.querySelector('#lightboxImage');
            const loadingIndicator = currentLightbox.querySelector('#lightboxLoading');
            const counterElement = currentLightbox.querySelector('#lightboxCounter');
            const prevBtn = currentLightbox.querySelector('#prevLightboxBtn');
            const nextBtn = currentLightbox.querySelector('#nextLightboxBtn');

            if (!lightboxImage || !loadingIndicator || !counterElement || !prevBtn || !nextBtn) {
                console.error(`showImageAtIndex(${index}): КРИТИЧЕСКАЯ ОШИБКА! Внутренние элементы лайтбокса не найдены!`);
                if (typeof showNotification === 'function') showNotification("Критическая ошибка интерфейса лайтбокса при показе изображения.", "error");
                const closeLightboxBtn = currentLightbox.querySelector('#closeLightboxBtn');
                if (closeLightboxBtn && typeof closeLightboxBtn.click === 'function') closeLightboxBtn.click();
                else { currentLightbox.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }
                return;
            }


            const totalImages = blobs?.length ?? 0;
            if (totalImages === 0) {
                console.error("showImageAtIndex: Массив blobs пуст, отображать нечего.");
                loadingIndicator.innerHTML = "Нет изображений";
                loadingIndicator.classList.remove('hidden');
                lightboxImage.classList.add('hidden');
                counterElement.textContent = "0 / 0";
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                return;
            }

            if (typeof index !== 'number' || index < 0 || index >= totalImages) {
                console.warn(`showImageAtIndex: Неверный индекс ${index}. Используем индекс 0.`);
                index = 0;
            }

            console.log(`Показ изображения с индексом: ${index}`);

            const oldObjectUrl = getCurrentObjectUrl();
            const oldPreloadedUrls = getCurrentPreloadedUrls();
            if (oldObjectUrl) { try { URL.revokeObjectURL(oldObjectUrl); console.log("Освобожден предыдущий currentObjectUrl:", oldObjectUrl); } catch (e) { console.warn("Ошибка освобождения предыдущего currentObjectUrl:", e); } }
            if (oldPreloadedUrls?.next) { try { URL.revokeObjectURL(oldPreloadedUrls.next); console.log("Освобожден предыдущий preloadedUrls.next:", oldPreloadedUrls.next); } catch (e) { console.warn("Ошибка освобождения предыдущего preloadedUrls.next:", e); } }
            if (oldPreloadedUrls?.prev) { try { URL.revokeObjectURL(oldPreloadedUrls.prev); console.log("Освобожден предыдущий preloadedUrls.prev:", oldPreloadedUrls.prev); } catch (e) { console.warn("Ошибка освобождения предыдущего preloadedUrls.prev:", e); } }

            updateCurrentIndex(index);
            updateCurrentScale(1.0);
            updateTranslate(0, 0);
            updateObjectUrl(null);
            updatePreloadedUrls({ next: null, prev: null });

            loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
            loadingIndicator.classList.remove('hidden');
            lightboxImage.classList.add('hidden');
            updateImageTransform();

            const blob = blobs[index];

            counterElement.textContent = `${index + 1} / ${totalImages}`;
            prevBtn.disabled = totalImages <= 1;
            nextBtn.disabled = totalImages <= 1;

            if (!(blob instanceof Blob)) {
                console.error(`Элемент с индексом ${index} не является Blob:`, blob);
                loadingIndicator.innerHTML = "Ошибка формата данных";
                return;
            }

            let newObjectUrl = null;
            try {
                newObjectUrl = URL.createObjectURL(blob);
                console.log(`Создан Object URL для индекса ${index}: ${newObjectUrl}`);

                lightboxImage.onload = null;
                lightboxImage.onerror = null;

                lightboxImage.onload = () => {
                    console.log(`Изображение ${index} успешно загружено.`);
                    loadingIndicator.classList.add('hidden');
                    lightboxImage.classList.remove('hidden');
                };
                lightboxImage.onerror = () => {
                    console.error(`Ошибка загрузки изображения ${index} по URL ${newObjectUrl}`);
                    loadingIndicator.innerHTML = "Ошибка загрузки";
                    loadingIndicator.classList.remove('hidden');
                    lightboxImage.classList.add('hidden');
                    if (newObjectUrl) {
                        try { URL.revokeObjectURL(newObjectUrl); console.log("Освобожден URL из-за ошибки загрузки img"); } catch (e) { console.warn("Ошибка освобождения URL при onerror:", e); }
                        updateObjectUrl(null);
                    }
                };
                lightboxImage.src = newObjectUrl;
                updateObjectUrl(newObjectUrl);

                let newPreloadedUrls = { next: null, prev: null };
                if (totalImages > 1) {
                    const nextIndex = (index + 1) % totalImages;
                    const prevIndex = (index - 1 + totalImages) % totalImages;
                    if (nextIndex !== index) { newPreloadedUrls.next = preloadImage(nextIndex); }
                    if (prevIndex !== index) { newPreloadedUrls.prev = preloadImage(prevIndex); }
                    console.log(`Предзагрузка: next=${newPreloadedUrls.next ? 'OK' : 'Null'}, prev=${newPreloadedUrls.prev ? 'OK' : 'Null'}`);
                }
                updatePreloadedUrls(newPreloadedUrls);

            } catch (error) {
                console.error("Ошибка при создании Object URL или установке src:", error);
                loadingIndicator.innerHTML = "Ошибка отображения";
                loadingIndicator.classList.remove('hidden');
                lightboxImage.classList.add('hidden');
                if (newObjectUrl) {
                    try { URL.revokeObjectURL(newObjectUrl); console.log("Освобожден URL из-за ошибки создания/src"); } catch (e) { console.warn("Ошибка освобождения URL при catch:", e); }
                    updateObjectUrl(null);
                }
            }
        }


        function openLightbox(blobs, initialIndex) {
            let lightbox = document.getElementById('screenshotLightbox');
            let currentObjectUrl = null;
            let preloadedUrls = { next: null, prev: null };
            let wheelListener = null;
            let keydownListener = null;
            let mousedownListener = null;
            let mousemoveListener = null;
            let mouseupListener = null;
            let mouseleaveListener = null;
            let originalTriggerElement = document.activeElement;

            let currentIndex = initialIndex;
            let currentScale = 1.0;
            let translateX = 0;
            let translateY = 0;
            let isPanning = false;
            let startX = 0;
            let startY = 0;
            const MIN_SCALE = 0.2;
            const MAX_SCALE = 5.0;
            const ZOOM_SENSITIVITY = 0.1;
            let lightboxBlobs = blobs || [];

            const closeLightboxInternal = () => {
                const lbElement = document.getElementById('screenshotLightbox');
                if (!lbElement || lbElement.classList.contains('hidden')) return;
                console.log("Закрытие лайтбокса и очистка ресурсов...");
                lbElement.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');

                const imgElement = lbElement.querySelector('#lightboxImage');

                if (lightboxCloseButtonClickListener) {
                    const closeBtn = lbElement.querySelector('#closeLightboxBtn');
                    if (closeBtn) {
                        closeBtn.removeEventListener('click', lightboxCloseButtonClickListener);
                        console.log("Удален слушатель клика кнопки закрытия.");
                    }
                    lightboxCloseButtonClickListener = null;
                }
                if (lightboxOverlayClickListener) {
                    lbElement.removeEventListener('click', lightboxOverlayClickListener);
                    console.log("Удален слушатель клика оверлея.");
                    lightboxOverlayClickListener = null;
                }

                if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); console.log("Освобожден URL:", currentObjectUrl); } catch (e) { console.warn("Ошибка освобождения currentObjectUrl:", e); } currentObjectUrl = null; }
                if (preloadedUrls.next) { try { URL.revokeObjectURL(preloadedUrls.next); console.log("Освобожден preloadedUrls.next:", preloadedUrls.next); } catch (e) { console.warn("Ошибка освобождения preloadedUrls.next:", e); } preloadedUrls.next = null; }
                if (preloadedUrls.prev) { try { URL.revokeObjectURL(preloadedUrls.prev); console.log("Освобожден preloadedUrls.prev:", preloadedUrls.prev); } catch (e) { console.warn("Ошибка освобождения preloadedUrls.prev:", e); } preloadedUrls.prev = null; }

                if (imgElement) {
                    imgElement.onload = null; imgElement.onerror = null; imgElement.src = '';
                    imgElement.style.transform = 'translate(0px, 0px) scale(1)';
                    imgElement.classList.add('hidden');
                    if (wheelListener) imgElement.removeEventListener('wheel', wheelListener);
                    if (mousedownListener) imgElement.removeEventListener('mousedown', mousedownListener);
                    if (mouseleaveListener) imgElement.removeEventListener('mouseleave', mouseleaveListener);
                    wheelListener = mousedownListener = mouseleaveListener = null;
                    console.log("Обработчики событий изображения удалены.");
                }

                if (mousemoveListener) document.removeEventListener('mousemove', mousemoveListener);
                if (mouseupListener) document.removeEventListener('mouseup', mouseupListener);
                mousemoveListener = mouseupListener = null;
                console.log("Глобальные обработчики панорамирования удалены.");

                if (keydownListener) { document.removeEventListener('keydown', keydownListener); keydownListener = null; console.log("Обработчик клавиатуры удален."); }

                if (originalTriggerElement && typeof originalTriggerElement.focus === 'function') {
                    console.log("Возврат фокуса на элемент:", originalTriggerElement);
                    setTimeout(() => { try { originalTriggerElement.focus(); } catch (focusError) { console.warn("Не удалось вернуть фокус (ошибка):", focusError); } }, 0);
                } else { console.warn("Не удалось вернуть фокус на исходный элемент."); }
                originalTriggerElement = null;
            };

            const preloadImage = (index) => {
                if (index < 0 || index >= lightboxBlobs.length) return null;
                const blob = lightboxBlobs[index];
                if (!(blob instanceof Blob)) return null;
                try { const url = URL.createObjectURL(blob); return url; } catch (e) { console.error(`Ошибка создания URL для предзагрузки индекса ${index}:`, e); return null; }
            };

            const updateImageTransform = () => {
                const img = document.getElementById('lightboxImage');
                if (img) {
                    const finalTranslateX = currentScale > 1 ? translateX : 0;
                    const finalTranslateY = currentScale > 1 ? translateY : 0;
                    img.style.transform = `translate(${finalTranslateX}px, ${finalTranslateY}px) scale(${currentScale})`;
                } else { console.warn("updateImageTransform: Элемент #lightboxImage не найден."); }
            };

            const navigateImage = (direction) => {
                if (lightboxBlobs.length <= 1) return;
                let newIndex = currentIndex;
                if (direction === 'prev') { newIndex = (currentIndex - 1 + lightboxBlobs.length) % lightboxBlobs.length; }
                else if (direction === 'next') { newIndex = (currentIndex + 1) % lightboxBlobs.length; }
                showImageAtIndex(newIndex, lightboxBlobs, {
                    getCurrentIndex: () => currentIndex,
                    getCurrentObjectUrl: () => currentObjectUrl,
                    getCurrentPreloadedUrls: () => preloadedUrls,
                    updateCurrentIndex: (idx) => currentIndex = idx,
                    updateCurrentScale: (s) => currentScale = s,
                    updateTranslate: (x, y) => { translateX = x; translateY = y; },
                    updateObjectUrl: (url) => currentObjectUrl = url,
                    updatePreloadedUrls: (urls) => preloadedUrls = urls,
                    updateImageTransform: updateImageTransform,
                    preloadImage: preloadImage
                });
            };

            const handleWheelZoom = (event) => {
                const img = document.getElementById('lightboxImage');
                if (!img) return;
                event.preventDefault();
                const delta = event.deltaY > 0 ? -1 : 1;
                let newScale = currentScale + delta * ZOOM_SENSITIVITY * currentScale;
                newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
                if (newScale !== currentScale) {
                    const rect = img.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    const imageX = (mouseX - translateX) / currentScale;
                    const imageY = (mouseY - translateY) / currentScale;
                    translateX = mouseX - imageX * newScale;
                    translateY = mouseY - imageY * newScale;
                    currentScale = newScale;
                    if (currentScale <= 1.0) { translateX = 0; translateY = 0; }
                    img.style.cursor = currentScale > 1 ? 'grab' : 'default';
                    updateImageTransform();
                }
            };

            const onMouseDown = (event) => { const img = document.getElementById('lightboxImage'); if (img && currentScale > 1) { event.preventDefault(); isPanning = true; startX = event.clientX - translateX; startY = event.clientY - translateY; img.style.cursor = 'grabbing'; img.classList.add('panning'); } };
            const onMouseMove = (event) => { if (isPanning) { event.preventDefault(); translateX = event.clientX - startX; translateY = event.clientY - startY; updateImageTransform(); } };
            const onMouseUpOrLeave = (event) => { const img = document.getElementById('lightboxImage'); if (isPanning && img) { event.preventDefault(); isPanning = false; img.style.cursor = 'grab'; img.classList.remove('panning'); } };

            const handleKeydown = (event) => {
                const activeLightbox = document.getElementById('screenshotLightbox');
                if (!activeLightbox || activeLightbox.classList.contains('hidden')) { document.removeEventListener('keydown', handleKeydown); keydownListener = null; return; }
                if (event.key === 'Tab') {
                    const focusableElements = Array.from(activeLightbox.querySelectorAll('button:not([disabled]), [href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
                    if (focusableElements.length === 0) { event.preventDefault(); return; }
                    const firstElement = focusableElements[0]; const lastElement = focusableElements[focusableElements.length - 1];
                    if (event.shiftKey) { if (document.activeElement === firstElement) { lastElement.focus(); event.preventDefault(); } }
                    else { if (document.activeElement === lastElement) { firstElement.focus(); event.preventDefault(); } }
                }
                switch (event.key) {
                    case 'ArrowLeft': navigateImage('prev'); break;
                    case 'ArrowRight': navigateImage('next'); break;
                    case 'Escape': closeLightboxInternal(); break;
                }
            };

            if (!Array.isArray(lightboxBlobs) || lightboxBlobs.length === 0) { console.error("openLightbox: Требуется массив Blob'ов."); if (typeof showNotification === 'function') showNotification("Ошибка: Нет изображений для отображения.", "error"); return; }
            if (typeof initialIndex !== 'number' || initialIndex < 0 || initialIndex >= lightboxBlobs.length) { console.warn(`openLightbox: Некорректный начальный индекс ${initialIndex}. Используем 0.`); currentIndex = 0; }
            else { currentIndex = initialIndex; }

            lightbox = document.getElementById('screenshotLightbox');
            if (!lightbox) {
                console.error("Критическая ошибка: элемент #screenshotLightbox не найден в DOM.");
                if (typeof showNotification === 'function') showNotification("Ошибка: Не найден контейнер для просмотра изображений.", "error");
                return;
            }

            closeLightboxInternal();

            console.log("Планирование инициализации лайтбокса через setTimeout(0)...");
            setTimeout(() => {
                const currentLightboxInstance = document.getElementById('screenshotLightbox');
                if (!currentLightboxInstance) { console.error("openLightbox (setTimeout): Лайтбокс исчез!"); return; }

                console.log("openLightbox (setTimeout): Инициализация лайтбокса...");
                currentIndex = initialIndex;
                currentScale = 1.0; translateX = 0; translateY = 0; isPanning = false;
                originalTriggerElement = document.activeElement;

                const imgElement = currentLightboxInstance.querySelector('#lightboxImage');
                const prevButton = currentLightboxInstance.querySelector('#prevLightboxBtn');
                const nextButton = currentLightboxInstance.querySelector('#nextLightboxBtn');
                const closeButton = currentLightboxInstance.querySelector('#closeLightboxBtn');
                const loadingIndicator = currentLightboxInstance.querySelector('#lightboxLoading');
                const counterElement = currentLightboxInstance.querySelector('#lightboxCounter');

                if (!imgElement || !prevButton || !nextButton || !closeButton || !loadingIndicator || !counterElement) {
                    console.error("openLightbox (setTimeout): Ошибка! Не найдены все необходимые внутренние элементы лайтбокса.");
                    if (typeof showNotification === 'function') showNotification("Критическая ошибка интерфейса лайтбокса.", "error");
                    currentLightboxInstance.classList.add('hidden');
                    document.body.classList.remove('overflow-hidden');
                    return;
                }

                if (lightboxCloseButtonClickListener && closeButton) {
                    closeButton.removeEventListener('click', lightboxCloseButtonClickListener);
                }
                if (lightboxOverlayClickListener) {
                    currentLightboxInstance.removeEventListener('click', lightboxOverlayClickListener);
                }

                lightboxCloseButtonClickListener = () => {
                    console.log("Клик по кнопке закрытия (крестик)");
                    closeLightboxInternal();
                };
                lightboxOverlayClickListener = (event) => {
                    if (event.target === currentLightboxInstance) {
                        console.log("Клик по оверлею");
                        closeLightboxInternal();
                    }
                };

                if (closeButton) {
                    closeButton.addEventListener('click', lightboxCloseButtonClickListener);
                    console.log("Добавлен слушатель клика на кнопку закрытия.");
                }
                currentLightboxInstance.addEventListener('click', lightboxOverlayClickListener);
                console.log("Добавлен слушатель клика на оверлей.");

                prevButton.onclick = () => navigateImage('prev');
                nextButton.onclick = () => navigateImage('next');

                if (wheelListener) imgElement.removeEventListener('wheel', wheelListener);
                wheelListener = handleWheelZoom;
                imgElement.addEventListener('wheel', wheelListener, { passive: false });

                if (mousedownListener) imgElement.removeEventListener('mousedown', mousedownListener);
                if (mousemoveListener) document.removeEventListener('mousemove', mousemoveListener);
                if (mouseupListener) document.removeEventListener('mouseup', mouseupListener);
                if (mouseleaveListener) imgElement.removeEventListener('mouseleave', mouseleaveListener);
                mousedownListener = onMouseDown; mousemoveListener = onMouseMove; mouseupListener = onMouseUpOrLeave; mouseleaveListener = onMouseUpOrLeave;
                imgElement.addEventListener('mousedown', mousedownListener);
                document.addEventListener('mousemove', mousemoveListener);
                document.addEventListener('mouseup', mouseupListener);
                imgElement.addEventListener('mouseleave', mouseleaveListener);
                console.log("Обработчики зума и панорамирования добавлены/обновлены.");

                if (keydownListener) document.removeEventListener('keydown', keydownListener);
                keydownListener = handleKeydown;
                document.addEventListener('keydown', keydownListener);
                console.log("Обработчик keydown для лайтбокса добавлен/обновлен.");

                currentLightboxInstance.classList.remove('hidden');
                document.body.classList.add('overflow-hidden');

                showImageAtIndex(currentIndex, lightboxBlobs, {
                    getCurrentIndex: () => currentIndex,
                    getCurrentObjectUrl: () => currentObjectUrl,
                    getCurrentPreloadedUrls: () => preloadedUrls,
                    updateCurrentIndex: (idx) => currentIndex = idx,
                    updateCurrentScale: (s) => currentScale = s,
                    updateTranslate: (x, y) => { translateX = x; translateY = y; },
                    updateObjectUrl: (url) => currentObjectUrl = url,
                    updatePreloadedUrls: (urls) => preloadedUrls = urls,
                    updateImageTransform: updateImageTransform,
                    preloadImage: preloadImage
                });

                setTimeout(() => {
                    const focusTarget = document.querySelector('#screenshotLightbox #closeLightboxBtn');
                    if (focusTarget) { focusTarget.focus(); console.log("Фокус установлен на кнопку закрытия."); }
                    else { console.warn("Не удалось установить фокус на кнопку закрытия."); }
                }, 50);

                console.log(`Лайтбокс открыт для ${lightboxBlobs.length} изображений, начиная с индекса ${currentIndex} (инициализация из setTimeout).`);
            }, 0);
        }


        async function handleViewScreenshotClick(event) {
            const button = event.currentTarget;
            const algorithmId = button.dataset.algorithmId;
            const stepIndexStr = button.dataset.stepIndex;

            console.log(`[handleViewScreenshotClick v2] Нажата кнопка просмотра. Algorithm ID: ${algorithmId}, Step Index: ${stepIndexStr}`);

            if (!algorithmId || algorithmId === 'unknown') {
                console.error("Не найден корректный ID алгоритма (data-algorithm-id) на кнопке:", button);
                showNotification("Не удалось определить алгоритм для скриншотов", "error");
                return;
            }
            const stepIndex = (stepIndexStr !== undefined && stepIndexStr !== 'unknown' && !isNaN(parseInt(stepIndexStr, 10)))
                ? parseInt(stepIndexStr, 10)
                : null;

            const originalContent = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Загрузка...';

            try {
                console.log(`[handleViewScreenshotClick v2] Запрос скриншотов из индекса 'parentId' со значением: ${algorithmId}`);
                const allParentScreenshots = await getAllFromIndex('screenshots', 'parentId', algorithmId);
                const algorithmScreenshots = allParentScreenshots.filter(s => s.parentType === 'algorithm');
                console.log(`[handleViewScreenshotClick v2] Получено ${algorithmScreenshots?.length ?? 0} скриншотов для algorithmId=${algorithmId}.`);

                if (!Array.isArray(algorithmScreenshots)) {
                    console.error("[handleViewScreenshotClick v2] Ошибка: getAllFromIndex или фильтрация вернули не массив!", algorithmScreenshots);
                    throw new Error("Не удалось получить список скриншотов");
                }

                let screenshotsToShow = [];
                let stepTitleSuffix = '';

                if (stepIndex !== null) {
                    screenshotsToShow = algorithmScreenshots.filter(s => s.stepIndex === stepIndex);
                    stepTitleSuffix = ` (Шаг ${stepIndex + 1})`;
                    console.log(`[handleViewScreenshotClick v2] Отфильтровано ${screenshotsToShow.length} скриншотов для шага ${stepIndex}.`);
                    if (screenshotsToShow.length === 0) {
                        showNotification("Для этого шага нет скриншотов.", "info");
                        return;
                    }
                } else {
                    screenshotsToShow = algorithmScreenshots;
                    console.log(`[handleViewScreenshotClick v2] Индекс шага не указан, показываем все ${screenshotsToShow.length} скриншотов для алгоритма ${algorithmId}.`);
                    if (screenshotsToShow.length === 0) {
                        showNotification("Для этого алгоритма нет скриншотов.", "info");
                        return;
                    }
                }

                let algorithmTitle = algorithmId;
                try {
                    if (algorithmId === 'main') {
                        algorithmTitle = algorithms?.main?.title || 'Главный алгоритм';
                    } else {
                        const sections = ['program', 'skzi', 'lk1c', 'webReg'];
                        let found = false;
                        for (const section of sections) {
                            if (algorithms && Array.isArray(algorithms[section])) {
                                const foundAlgo = algorithms[section].find(a => String(a?.id) === String(algorithmId));
                                if (foundAlgo) {
                                    algorithmTitle = foundAlgo.title || algorithmId;
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (!found) { console.warn(`[handleViewScreenshotClick v2] Алгоритм с ID ${algorithmId} не найден ни в одной секции для получения заголовка.`); }
                    }
                } catch (titleError) {
                    console.warn("[handleViewScreenshotClick v2] Не удалось получить название алгоритма:", titleError);
                }

                const finalModalTitle = `${algorithmTitle}${stepTitleSuffix}`;
                console.log(`[handleViewScreenshotClick v2] Вызов showScreenshotViewerModal с ${screenshotsToShow.length} скриншотами. Title: "${finalModalTitle}"`);
                if (typeof showScreenshotViewerModal === 'function') {
                    await showScreenshotViewerModal(screenshotsToShow, algorithmId, finalModalTitle);
                } else {
                    console.error("Функция showScreenshotViewerModal не определена!");
                    showNotification("Ошибка: Функция просмотра скриншотов недоступна.", "error");
                }

            } catch (error) {
                console.error(`[handleViewScreenshotClick v2] Ошибка при загрузке или отображении скриншотов для алгоритма ID ${algorithmId}:`, error);
                showNotification(`Ошибка загрузки скриншотов: ${error.message || 'Неизвестная ошибка'}`, "error");
            } finally {
                button.disabled = false;
                button.innerHTML = originalContent;
                console.log("[handleViewScreenshotClick v2] Кнопка восстановлена.");
            }
        }


        async function addBookmarkToDOM(bookmarkData) {
            const bookmarksContainer = document.getElementById('bookmarksContainer');
            if (!bookmarksContainer) {
                console.error("addBookmarkToDOM: Контейнер #bookmarksContainer не найден.");
                return;
            }

            const noBookmarksMsg = bookmarksContainer.querySelector('.col-span-full.text-center');
            if (noBookmarksMsg) {
                noBookmarksMsg.remove();
                if (bookmarksContainer.classList.contains('flex-col')) {
                    bookmarksContainer.classList.remove('flex', 'flex-col');
                    if (!bookmarksContainer.classList.contains('grid')) {
                        const gridColsClasses = SECTION_GRID_COLS.bookmarksContainer || SECTION_GRID_COLS.default;
                        bookmarksContainer.classList.add(...CARD_CONTAINER_CLASSES, ...gridColsClasses);
                        console.log("Восстановлены классы grid после удаления сообщения 'нет закладок'");
                    }
                }
            }

            const newElement = await createBookmarkElement(bookmarkData);
            if (!newElement) {
                console.error("addBookmarkToDOM: Не удалось создать DOM-элемент для закладки:", bookmarkData);
                return;
            }

            bookmarksContainer.appendChild(newElement);
            console.log(`Закладка ID ${bookmarkData.id} добавлена в DOM.`);

            applyCurrentView('bookmarksContainer');
        }

        async function updateBookmarkInDOM(bookmarkData) {
            const bookmarksContainer = document.getElementById('bookmarksContainer');
            if (!bookmarksContainer || !bookmarkData || typeof bookmarkData.id === 'undefined') {
                console.error("updateBookmarkInDOM: Неверные аргументы или контейнер не найден.");
                return;
            }

            const existingElement = bookmarksContainer.querySelector(`.bookmark-item[data-id="${bookmarkData.id}"]`);
            if (!existingElement) {
                console.warn(`updateBookmarkInDOM: Не найден элемент закладки с ID ${bookmarkData.id} для обновления в DOM.`);
                await addBookmarkToDOM(bookmarkData);
                return;
            }

            const newElement = await createBookmarkElement(bookmarkData);
            if (!newElement) {
                console.error(`updateBookmarkInDOM: Не удалось создать обновленный элемент для закладки ID ${bookmarkData.id}.`);
                return;
            }

            existingElement.replaceWith(newElement);
            console.log(`Закладка ID ${bookmarkData.id} обновлена в DOM.`);

            applyCurrentView('bookmarksContainer');
        }

        function removeBookmarkFromDOM(bookmarkId) {
            const bookmarksContainer = document.getElementById('bookmarksContainer');
            if (!bookmarksContainer) {
                console.error("removeBookmarkFromDOM: Контейнер #bookmarksContainer не найден.");
                return;
            }

            const itemToRemove = bookmarksContainer.querySelector(`.bookmark-item[data-id="${bookmarkId}"]`);
            if (itemToRemove) {
                itemToRemove.remove();
                console.log(`Удален элемент закладки ${bookmarkId} из DOM.`);

                if (!bookmarksContainer.querySelector('.bookmark-item')) {
                    bookmarksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">Нет сохраненных закладок</div>';
                    console.log("Контейнер закладок пуст, добавлено сообщение.");
                }
                applyCurrentView('bookmarksContainer');

            } else {
                console.warn(`removeBookmarkFromDOM: Элемент закладки ${bookmarkId} не найден в DOM для удаления.`);
            }
        }


        function attachStepDeleteHandler(deleteButton, stepElement, containerElement, section, mode = 'edit') {
            if (!deleteButton || !stepElement || !containerElement) {
                console.error("attachStepDeleteHandler: Не переданы необходимые элементы.");
                return;
            }

            const oldHandler = deleteButton._deleteHandler;
            if (oldHandler) {
                deleteButton.removeEventListener('click', oldHandler);
            }

            const newHandler = () => {
                const isMainSection = section === 'main';
                const canDelete = (mode === 'add' && containerElement.children.length > 0) ||
                    (mode === 'edit' && (containerElement.children.length > 1 || !isMainSection));

                if (canDelete) {
                    console.log(`Удаление шага ${stepElement.dataset.stepIndex || '(новый)'} в режиме ${mode}, секция ${section}`);
                    const previewImg = stepElement.querySelector('.screenshot-preview');
                    const objectUrl = previewImg?.dataset.objectUrl;
                    if (objectUrl) {
                        URL.revokeObjectURL(objectUrl);
                        console.log("Освобожден Object URL при удалении шага:", objectUrl);
                        delete previewImg.dataset.objectUrl;
                    }
                    const currentId = stepElement.dataset.currentScreenshotId;
                    if (currentId && !stepElement._tempScreenshotBlob) {
                        stepElement.dataset.deleteScreenshot = "true";
                        console.log(`Шаг удаляется, существующий скриншот ${currentId} помечен для удаления при сохранении.`);
                    } else if (stepElement._tempScreenshotBlob) {
                        delete stepElement._tempScreenshotBlob;
                        console.log("Шаг удаляется, временный Blob (_tempScreenshotBlob) очищен.");
                    }

                    stepElement.remove();

                    if (typeof updateStepNumbers === 'function') {
                        updateStepNumbers(containerElement);
                    } else {
                        console.error("Функция updateStepNumbers не найдена!");
                    }

                    if (mode === 'edit') {
                        isUISettingsDirty = true;
                        console.log("Установлен флаг изменений после удаления шага в режиме редактирования.");
                    } else if (mode === 'add' && containerElement.children.length === 0) {
                        containerElement.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">Добавьте шаги для нового алгоритма.</p>';
                    }

                } else if (isMainSection && mode === 'edit') {
                    showNotification('Главный алгоритм должен содержать хотя бы один шаг.', 'warning');
                } else {
                    console.log("Попытка удалить единственный шаг - проигнорировано.");
                }
            };

            deleteButton.addEventListener('click', newHandler);
            deleteButton._deleteHandler = newHandler;
        }


        function updateStepNumbers(containerElement) {
            if (!containerElement) return;
            const steps = containerElement.querySelectorAll('.edit-step');
            steps.forEach((step, index) => {
                const numberLabel = step.querySelector('.step-number-label');
                if (numberLabel) {
                    numberLabel.textContent = `Шаг ${index + 1}`;
                }
                const deleteButton = step.querySelector('.delete-step');
                if (deleteButton) {
                    deleteButton.setAttribute('aria-label', `Удалить шаг ${index + 1}`);
                }
            });
            console.log(`Номера шагов обновлены в контейнере ${containerElement.id}`);
        }


        function deepEqual(obj1, obj2) {
            if (obj1 === obj2) {
                return true;
            }

            if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') {

                if (Number.isNaN(obj1) && Number.isNaN(obj2)) {
                    return true;
                }
                return false;
            }

            if (obj1 instanceof Date && obj2 instanceof Date) {
                return obj1.getTime() === obj2.getTime();
            }
            if (obj1 instanceof RegExp && obj2 instanceof RegExp) {
                return obj1.toString() === obj2.toString();
            }

            if (Array.isArray(obj1) && Array.isArray(obj2)) {
                if (obj1.length !== obj2.length) {
                    return false;
                }
                for (let i = 0; i < obj1.length; i++) {
                    if (!deepEqual(obj1[i], obj2[i])) {
                        return false;
                    }
                }
                return true;
            }

            if (Array.isArray(obj1) || Array.isArray(obj2)) {
                return false;
            }

            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);

            if (keys1.length !== keys2.length) {
                return false;
            }

            for (const key of keys1) {
                if (!Object.prototype.hasOwnProperty.call(obj2, key) || !deepEqual(obj1[key], obj2[key])) {
                    return false;
                }
            }

            return true;
        }


        function openAnimatedModal(modalElement) {
            if (!modalElement) return;

            modalElement.classList.add('modal-transition');
            modalElement.classList.remove('modal-visible');
            modalElement.classList.remove('hidden');

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    modalElement.classList.add('modal-visible');
                    document.body.classList.add('modal-open');
                    console.log(`[openAnimatedModal] Opened modal #${modalElement.id}`);
                });
            });

            if (typeof addEscapeHandler === 'function' && !modalElement._escapeHandler) {
                addEscapeHandler(modalElement);
            }
        }

        function closeAnimatedModal(modalElement) {
            if (!modalElement || modalElement.classList.contains('hidden')) return;

            modalElement.classList.add('modal-transition');
            modalElement.classList.remove('modal-visible');

            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modalElement);
            }

            const handleTransitionEnd = (event) => {
                if (event.target === modalElement && event.propertyName === 'opacity') {
                    modalElement.classList.add('hidden');
                    document.body.classList.remove('modal-open');
                    modalElement.removeEventListener('transitionend', handleTransitionEnd);
                    console.log(`[closeAnimatedModal] Closed modal #${modalElement.id}`);

                    if (modalElement.id === 'bookmarkModal') {
                        const form = modalElement.querySelector('#bookmarkForm');
                        if (form) {
                            form.reset();
                            const idInput = form.querySelector('#bookmarkId');
                            if (idInput) idInput.value = '';
                            const modalTitleEl = modalElement.querySelector('#bookmarkModalTitle');
                            if (modalTitleEl) modalTitleEl.textContent = 'Добавить закладку';
                            const saveButton = modalElement.querySelector('#saveBookmarkBtn');
                            if (saveButton) saveButton.innerHTML = '<i class="fas fa-plus mr-1"></i> Добавить';
                            delete form._tempScreenshotBlobs;
                            delete form.dataset.screenshotsToDelete;
                            const thumbsContainer = form.querySelector('#bookmarkScreenshotThumbnailsContainer');
                            if (thumbsContainer) thumbsContainer.innerHTML = '';
                            console.log(`[closeAnimatedModal] Cleaned up bookmarkModal form.`);
                        }
                    }
                }
            };

            modalElement.addEventListener('transitionend', handleTransitionEnd);

            setTimeout(() => {
                if (!modalElement.classList.contains('hidden')) {
                    console.warn(`[closeAnimatedModal] Transitionend fallback triggered for #${modalElement.id}`);
                    modalElement.classList.add('hidden');
                    document.body.classList.remove('modal-open');
                    modalElement.removeEventListener('transitionend', handleTransitionEnd);
                }
            }, 300);
        }


        closeModalBtn?.addEventListener('click', () => closeAnimatedModal(algorithmModal));

        editMainBtn?.addEventListener('click', async () => {
            if (typeof editAlgorithm === 'function') {
                await editAlgorithm('main');
            } else {
                console.error("Функция editAlgorithm не найдена для кнопки editMainBtn");
            }
        });

        async function showAddModal(section) {
            initialAddState = null;

            const addModal = document.getElementById('addModal');
            if (!addModal) {
                console.error("Модальное окно добавления #addModal не найдено.");
                showNotification("Ошибка: Не найдено окно добавления.", "error");
                return;
            }

            const addModalTitle = document.getElementById('addModalTitle');
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');
            const saveButton = document.getElementById('saveNewAlgorithmBtn');

            if (!addModalTitle || !newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer || !saveButton) {
                console.error("Show Add Modal failed: Missing required elements.");
                showNotification("Ошибка интерфейса: не найдены элементы окна добавления.", "error");
                return;
            }

            addModalTitle.textContent = 'Новый алгоритм для раздела: ' + getSectionName(section);
            newAlgorithmTitle.value = '';
            newAlgorithmDesc.value = '';
            newStepsContainer.innerHTML = '';
            newStepsContainer.className = 'space-y-4';

            const firstStepDiv = document.createElement('div');
            firstStepDiv.className = 'edit-step p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm mb-4';
            firstStepDiv.innerHTML = createStepElementHTML(1, false, true);
            firstStepDiv.dataset.stepIndex = 0;
            newStepsContainer.appendChild(firstStepDiv);

            const firstDeleteBtn = firstStepDiv.querySelector('.delete-step');
            if (firstDeleteBtn) {
                if (typeof attachStepDeleteHandler === 'function') {
                    attachStepDeleteHandler(firstDeleteBtn, firstStepDiv, newStepsContainer, section, 'add', false);
                } else {
                    console.error("Функция attachStepDeleteHandler не найдена в showAddModal!");
                    firstDeleteBtn.disabled = true;
                }
            } else {
                console.warn("Не удалось найти кнопку удаления для первого шага в showAddModal.");
            }

            if (typeof attachScreenshotHandlers === 'function') {
                attachScreenshotHandlers(firstStepDiv);
            } else {
                console.error("Функция attachScreenshotHandlers не найдена в showAddModal!");
            }

            addModal.dataset.section = section;
            saveButton.disabled = false;
            saveButton.innerHTML = 'Сохранить';

            captureInitialAddState();
            openAnimatedModal(addModal);

            setTimeout(() => newAlgorithmTitle.focus(), 50);
            console.log(`showAddModal: Окно для секции '${section}' открыто.`);
        }
