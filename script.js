        // Initialize IndexedDB
        let db;
        const DB_NAME = '1C_Support_Guide';
        const DB_VERSION = 2;
        let userPreferences = { theme: 'auto' };

        let categoryDisplayInfo = {
            'difficult-client': { title: 'Работа с трудным клиентом', icon: 'fa-user-shield', color: 'red' },
            'tech-support': { title: 'Общий регламент', icon: 'fa-headset', color: 'blue' },
            'emergency': { title: 'Чрезвычайные ситуации', icon: 'fa-exclamation-triangle', color: 'orange' }
        };

        const CATEGORY_INFO_KEY = 'reglamentCategoryInfo';

        // Configuration for object stores
        const storeConfigs = [
            {
                name: 'algorithms',
                options: { keyPath: 'section' }
            },

            {
                name: 'links',
                options:
                {
                    keyPath: 'id',
                    autoIncrement: true
                }, indexes: [
                    {
                        name: 'category',
                        keyPath: 'category',
                        options: { unique: false }
                    }]
            },
            {
                name: 'bookmarks',
                options: {
                    keyPath: 'id',
                    autoIncrement: true
                },
                indexes: [
                    {
                        name: 'folder',
                        keyPath: 'folder',
                        options: { unique: false }
                    }]
            },
            {
                name: 'reglaments',
                options: {
                    keyPath: 'id',
                    autoIncrement: true
                },
                indexes: [
                    {
                        name: 'category',
                        keyPath: 'category',
                        options: { unique: false }
                    }]
            },
            {
                name: 'clientData',
                options: {
                    keyPath: 'id',
                    autoIncrement: true
                }
            },
            {
                name: 'preferences',
                options: { keyPath: 'id' }
            },
            {
                name: 'bookmarkFolders',
                options:
                {
                    keyPath: 'id',
                    autoIncrement: true
                }
            },
            {
                name: 'extLinks',
                options: {
                    keyPath: 'id',
                    autoIncrement: true
                },
                indexes: [
                    {
                        name: 'category',
                        keyPath: 'category',
                        options: { unique: false }
                    }]
            }
        ];

        // Initialize the database
        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = e => (console.error("IndexedDB error:", e.target.error), reject("Failed to open database. Using fallback storage."));
                request.onsuccess = e => {
                    db = e.target.result;
                    console.log("Database opened successfully");
                    db.onerror = ev => console.error("Database error:", ev.target.error);
                    resolve(db);
                };
                request.onupgradeneeded = e => {
                    const currentDb = e.target.result;
                    storeConfigs.forEach(config => {
                        if (!currentDb.objectStoreNames.contains(config.name)) {
                            const store = currentDb.createObjectStore(config.name, config.options);
                            config.indexes?.forEach(index => store.createIndex(index.name, index.keyPath, index.options || {}));
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


        async function loadThemePreference() {
            try {
                const themePref = await getFromIndexedDB('preferences', 'theme');
                setTheme(themePref ? themePref.value : 'auto');
            } catch (error) {
                console.error("Error loading theme preference:", error);
                setTheme('auto');
            }
        }


        function renderAllAlgorithms() {
            renderMainAlgorithm();
            renderAlgorithmCards('program');
            renderAlgorithmCards('skzi');
            renderAlgorithmCards('webReg');
        }


        async function loadFromIndexedDB() {
            let loadedDataSuccessfully = false;
            try {
                const savedAlgorithmsContainer = await getFromIndexedDB('algorithms', 'all');

                if (savedAlgorithmsContainer?.data && typeof savedAlgorithmsContainer.data === 'object') {
                    const loadedAlgoData = savedAlgorithmsContainer.data;

                    const sections = ['main', 'program', 'skzi', 'webReg'];
                    sections.forEach(section => {
                        if (loadedAlgoData.hasOwnProperty(section)) {
                            if (section === 'main') {
                                if (typeof loadedAlgoData.main === 'object' && loadedAlgoData.main !== null) {
                                    algorithms.main = loadedAlgoData.main;
                                    console.log(`Loaded data for section [main] is valid.`);
                                } else {
                                    console.warn(`Loaded data for section [main] is INVALID. Keeping default.`);
                                }
                            } else {
                                if (Array.isArray(loadedAlgoData[section])) {
                                    algorithms[section] = loadedAlgoData[section];
                                    console.log(`Loaded data for section [${section}] is an array.`);
                                } else {
                                    console.warn(`Loaded data for section [${section}] is NOT an array! Setting to empty array.`);
                                    algorithms[section] = [];
                                }
                            }
                        } else {
                            console.warn(`Key [${section}] missing in loaded data. Ensuring default structure.`);
                            if (section === 'main' && (typeof algorithms.main !== 'object' || algorithms.main === null)) {
                                algorithms.main = { title: "Главный алгоритм", steps: [] };
                            } else if (section !== 'main' && !Array.isArray(algorithms[section])) {
                                algorithms[section] = [];
                            }
                        }
                    });
                    loadedDataSuccessfully = true;
                } else {
                    algorithms.main = algorithms.main || { title: "Главный алгоритм", steps: [] };
                    algorithms.program = algorithms.program || [];
                    algorithms.skzi = algorithms.skzi || [];
                    algorithms.webReg = algorithms.webReg || [];
                }

                renderAllAlgorithms();

                const clientData = await getFromIndexedDB('clientData', 'current');
                if (clientData) {
                    loadClientData(clientData);
                }
                await Promise.all([
                    loadBookmarks(),
                    loadReglaments()
                ]);

                return true;

            } catch (error) {
                console.error("Error in loadFromIndexedDB:", error);
                algorithms.main = algorithms.main || { title: "Главный алгоритм", steps: [] };
                algorithms.program = algorithms.program || [];
                algorithms.skzi = algorithms.skzi || [];
                algorithms.webReg = algorithms.webReg || [];
                renderAllAlgorithms();
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


        async function loadUISettings() {
            try {
                const uiSettings = await getFromIndexedDB('preferences', 'uiSettings') || {};
                const modal = document.getElementById('customizeUIModal');

                const assignIfTruthy = (settingValue, selector, assignFunc) => {
                    const valueToUse = settingValue;
                    if (valueToUse) {
                        const element = document.querySelector(selector);
                        if (element) assignFunc(element);
                    }
                };
                const assignByIdIfPresent = (settingValue, elementId, assignFunc, defaultValue) => {
                    const valueToAssign = settingValue !== undefined && settingValue !== null ? settingValue : defaultValue;
                    if (valueToAssign !== undefined) {
                        const element = document.getElementById(elementId);
                        if (element) assignFunc(element, valueToAssign);
                    }
                };

                const layoutToSet = uiSettings.mainLayout || DEFAULT_UI_SETTINGS.mainLayout;
                assignIfTruthy(layoutToSet, `input[name="mainLayout"][value="${layoutToSet}"]`, el => el.checked = true);

                const themeToSet = uiSettings.themeMode || DEFAULT_UI_SETTINGS.themeMode;
                assignIfTruthy(themeToSet, `input[name="themeMode"][value="${themeToSet}"]`, el => el.checked = true);

                const savedPrimaryColor = uiSettings.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
                modal?.querySelectorAll('.color-swatch').forEach(s => {
                    s.classList.remove('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');
                    s.classList.add('border-2', 'border-transparent');
                    if (s.getAttribute('data-color') === savedPrimaryColor) {
                        s.classList.remove('border-transparent');
                        s.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');
                    }
                });

                assignByIdIfPresent(uiSettings.fontSize, 'fontSizeLabel', (el, val) => el.textContent = val + '%', DEFAULT_UI_SETTINGS.fontSize);
                assignByIdIfPresent(uiSettings.borderRadius, 'borderRadiusSlider', (el, val) => el.value = val, DEFAULT_UI_SETTINGS.borderRadius);
                assignByIdIfPresent(uiSettings.contentDensity, 'densitySlider', (el, val) => el.value = val, DEFAULT_UI_SETTINGS.contentDensity);

                const panelSortContainer = document.getElementById('panelSortContainer');
                if (panelSortContainer) {
                    panelSortContainer.innerHTML = '';

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

                    const savedOrder = Array.isArray(uiSettings.panelOrder) && uiSettings.panelOrder.length === tabsConfig.length
                        ? uiSettings.panelOrder
                        : tabsConfig.map(t => t.name);

                    const savedVisibility = Array.isArray(uiSettings.panelVisibility) && uiSettings.panelVisibility.length === tabsConfig.length
                        ? uiSettings.panelVisibility
                        : tabsConfig.map(() => true);

                    const nameToConfigMap = tabsConfig.reduce((map, tab) => {
                        map[tab.name] = tab;
                        return map;
                    }, {});
                    const nameToVisibilityMap = savedOrder.reduce((map, name, index) => {
                        map[name] = savedVisibility[index] ?? true;
                        return map;
                    }, {});

                    savedOrder.forEach(panelName => {
                        const config = nameToConfigMap[panelName];
                        if (config) {
                            const isVisible = nameToVisibilityMap[panelName];
                            const panelItem = createPanelItemElement(config.id, config.name, isVisible);
                            panelSortContainer.appendChild(panelItem);
                        }
                    });

                    panelSortContainer.querySelectorAll('.toggle-visibility').forEach(button => {
                        button.removeEventListener('click', toggleSectionVisibility);
                        button.addEventListener('click', toggleSectionVisibility);
                    });

                    if (window.Sortable && typeof panelSortContainer.sortableInstance?.destroy === 'function') {
                        panelSortContainer.sortableInstance.destroy();
                    }
                    if (window.Sortable) {
                        try {
                            panelSortContainer.sortableInstance = new Sortable(panelSortContainer, { animation: 150, handle: '.fa-grip-lines', ghostClass: 'my-sortable-ghost' });
                        } catch (e) {
                            console.error("Failed to initialize Sortable:", e);
                        }
                    }

                } else {
                    console.warn("Panel sort container not found in loadUISettings");
                }

            } catch (error) {
                console.error("Error loading UI settings:", error);
            }
        }


        async function saveUISettings() {
            console.log("Saving UI settings...");
            try {
                const selectedColorSwatch = document.querySelector('#customizeUIModal .color-swatch.ring-primary');
                const primaryColor = selectedColorSwatch
                    ? selectedColorSwatch.getAttribute('data-color')
                    : '#5D5CDE';
                console.log("Selected primaryColor for saving:", primaryColor);

                const uiSettings = {
                    mainLayout: document.querySelector('input[name="mainLayout"]:checked')?.value || 'horizontal',
                    themeMode: document.querySelector('input[name="themeMode"]:checked')?.value || 'auto',
                    primaryColor: primaryColor,
                    fontSize: parseInt(document.getElementById('fontSizeLabel')?.textContent) || 100,
                    borderRadius: parseInt(document.getElementById('borderRadiusSlider')?.value) || 8,
                    contentDensity: parseInt(document.getElementById('densitySlider')?.value) || 3,
                    panelVisibility: Array.from(document.querySelectorAll('#panelSortContainer .toggle-visibility')).map(btn =>
                        btn.querySelector('i')?.classList.contains('fa-eye') ?? true
                    ),
                    panelOrder: Array.from(document.querySelectorAll('#panelSortContainer .panel-item span')).map(span => span.textContent)
                };

                console.log("Settings object being saved:", uiSettings);

                await saveToIndexedDB('preferences', { id: 'uiSettings', ...uiSettings });
                console.log("UI settings save successful.");
                return true;
            } catch (error) {
                console.error("Error saving UI settings:", error);
                showNotification("Ошибка при сохранении настроек интерфейса", "error");
                return false;
            }
        }


        function exportAllData() {
            try {
                const currentDate = new Date();
                const exportData = {
                    algorithms: algorithms,
                    clientData: getClientData(),
                    bookmarks: getAllBookmarks(),
                    reglaments: getAllReglaments(),
                    exportDate: currentDate.toISOString(),
                    schemaVersion: "1.0"
                };

                const exportFileName = `1C_Support_Guide_Export_${currentDate.toISOString().slice(0, 10)}.json`;
                const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`;
                const linkElement = document.createElement('a');
                linkElement.href = dataUri;
                linkElement.download = exportFileName;
                linkElement.click();

                showNotification("Данные успешно экспортированы");
            } catch (error) {
                console.error("Error exporting data:", error);
                showNotification("Ошибка при экспорте данных", "error");
            }
        }


        async function importDataFromJSON(jsonString) {
            try {
                const importData = JSON.parse(jsonString);

                if (!importData?.schemaVersion || !importData?.algorithms) {
                    showNotification("Некорректный формат файла импорта", "error");
                    return false;
                }

                algorithms = importData.algorithms;
                await saveToIndexedDB('algorithms', { section: 'all', data: algorithms });
                renderAllAlgorithms();

                const importTasks = [];
                if (importData.bookmarks) {
                    importTasks.push(importBookmarks(importData.bookmarks));
                }

                if (importData.reglaments) {
                    importTasks.push(importReglaments(importData.reglaments));
                }

                if (importTasks.length > 0) {
                    await Promise.all(importTasks);
                }

                showNotification("Данные успешно импортированы");
                return true;

            } catch (error) {
                console.error("Error importing data:", error);
                showNotification("Ошибка при импорте данных", "error");
                return false;
            }
        }


        function showNotification(message, type = "success") {
            let notificationElement = document.getElementById('notification');
            if (notificationElement) {
                const existingHideTimeoutId = parseInt(notificationElement.dataset.hideTimeoutId || '0');
                if (existingHideTimeoutId) {
                    clearTimeout(existingHideTimeoutId);
                }
                const existingRemoveTimeoutId = parseInt(notificationElement.dataset.removeTimeoutId || '0');
                if (existingRemoveTimeoutId) {
                    clearTimeout(existingRemoveTimeoutId);
                }
                notificationElement.classList.add('translate-x-full');
                notificationElement.classList.remove('opacity-0');
            } else {
                notificationElement = document.createElement('div');
                notificationElement.id = 'notification';
                notificationElement.className = 'fixed z-50 top-4 right-4 p-4 rounded-lg shadow-lg transform transition-transform duration-300 translate-x-full';
                document.body.appendChild(notificationElement);
            }

            const bgColor = type === "error" ? 'bg-red-500' : (type === 'warning' ? 'bg-yellow-500' : 'bg-green-500');
            notificationElement.className = `fixed z-50 top-4 right-4 p-4 rounded-lg shadow-lg transform transition-transform duration-300 ${bgColor} text-white`;
            notificationElement.textContent = message;

            notificationElement.classList.add('translate-x-full');

            requestAnimationFrame(() => {
                notificationElement.classList.remove('translate-x-full');
            });

            const hideTimeoutId = setTimeout(() => {
                notificationElement.classList.add('translate-x-full');

                const removeTimeoutId = setTimeout(() => {
                    const currentNotification = document.getElementById('notification');
                    if (currentNotification) {
                        currentNotification.remove();
                    }
                }, 300);

                notificationElement.dataset.removeTimeoutId = removeTimeoutId.toString();

            }, 3000);

            notificationElement.dataset.hideTimeoutId = hideTimeoutId.toString();
        }




        let algorithms = {
            main: {
                title: "Главный алгоритм работы",
                steps: [
                    {
                        title: "Приветствие",
                        description: "Обозначьте клиенту, куда он дозвонился, представьтесь, поприветствуйте клиента.",
                        example: "Пример: \"Техническая поддержка сервиса 1С-Отчетность, меня зовут Максим. Здравствуйте!\""
                    },

                    {
                        title: "Уточнение ИНН",
                        description: "Запросите ИНН организации для идентификации клиента в системе и дальнейшей работы.",
                        example: "Пример: \"Назовите, пожалуйста, ИНН организации.\""
                    },

                    {
                        title: "Идентификация проблемы",
                        description: "Выясните суть проблемы, задавая уточняющие вопросы. Важно выяснить как можно больше деталей для составления полной картины.",
                        example: "Примеры вопросов:<ul class=\"list-disc ml-5 mt-1\"><li>Уточните, пожалуйста, полный текст ошибки</li><li>При каких действиях возникает ошибка?</li></ul>"
                    },

                    {
                        title: "Решение проблемы",
                        description: "Четко для себя определите категорию (направление) проблемы и перейдите к соответствующему разделу в помощнике (либо статье на track.astral.ru) с инструкциями по решению.",
                        example: ""
                    }
                ]
            },

            program: [
                {
                    id: "program1",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        },
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        }]
                },

                {
                    id: "program2",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        },
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        }]
                }
            ],

            skzi: [
                {
                    id: "skzi1",
                    title: "Ошибка подписания документа",
                    description: "Базовая ошибка при подписании любого документа, либо автонастройке",
                    steps: [
                        {
                            title: "Проверка данных подписанта и носителя",
                            description: "Проверь информацию о подписанте (сверь информацию, указанную в сертификате, с данными клиента)."
                        },
                        {
                            title: "Подписант рукль или физик?",
                            description: "Если рукль - уточни, присутствует ли физически токен в компьютере, горит ли на нем индикатор, отображается ли он в системном трее или диспетчере устройств, отображется ли контейнер в КриптоПро"
                        }]
                },

                {
                    id: "skzi2",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        },
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        }]
                }
            ],

            webReg: [
                {
                    id: "webreg1",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        },
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        }]
                },

                {
                    id: "webreg2",
                    title: "Место для вашей рекламы...",
                    description: "Место для вашей рекламы...",
                    steps: [
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        },
                        {
                            title: "Место для вашей рекламы...",
                            description: "Место для вашей рекламы..."
                        }]
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
            themeMode: 'auto',
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
                title: "Транспортные сообщения",
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

        addClickListeners([
            [closeModalBtn, () => document.getElementById('algorithmModal')?.classList.add('hidden')],
            [closeEditModalBtn, () => document.getElementById('editModal')?.classList.add('hidden')],
            [closeAddModalBtn, () => document.getElementById('addModal')?.classList.add('hidden')],
            [cancelEditBtn, () => document.getElementById('editModal')?.classList.add('hidden')],
            [cancelAddBtn, () => document.getElementById('addModal')?.classList.add('hidden')],

            [editMainBtn, () => editAlgorithm('main')],
            [addStepBtn, addEditStep],
            [saveAlgorithmBtn, saveAlgorithm],
            [addNewStepBtn, addNewStep],
            [saveNewAlgorithmBtn, saveNewAlgorithm],

            [addProgramAlgorithmBtn, () => showAddModal('program')],
            [addSkziAlgorithmBtn, () => showAddModal('skzi')],
            [addWebRegAlgorithmBtn, () => showAddModal('webReg')],

            [editAlgorithmBtn, () => {
                if (!currentAlgorithm) {
                    console.error('[editAlgorithmBtn Click] Cannot edit: currentAlgorithm ID is missing from state.');
                    return;
                }
                editAlgorithm(currentAlgorithm, currentSection);
            }]
        ]);


        function initUI() {
            loadFromLocalStorage();
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
            if (!sectionAlgorithms) return;

            const container = document.getElementById(section + 'Algorithms');
            if (!container) return;

            container.innerHTML = '';

            sectionAlgorithms.forEach(algorithm => {
                const card = document.createElement('div');
                card.className = 'algorithm-card view-item bg-white dark:bg-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer';
                card.innerHTML = `
            <h3 class="font-bold">${algorithm.title}</h3>
            <p class="text-gray-600 dark:text-gray-400 text-sm mt-1">${algorithm.description}</p>
        `;
                card.addEventListener('click', () => showAlgorithmDetail(algorithm, section));
                container.appendChild(card);
            });

            applyCurrentView(section + 'Algorithms');
        }


        function renderMainAlgorithm() {
            const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
            if (!mainAlgorithmContainer) {
                console.error("Container #mainAlgorithm not found for rendering.");
                return;
            }

            if (!algorithms || !algorithms.main || !Array.isArray(algorithms.main.steps)) {
                console.error("Main algorithm data is missing or invalid for rendering.");
                mainAlgorithmContainer.innerHTML = '<p class="text-red-500">Ошибка: Не удалось загрузить главный алгоритм.</p>';
                return;
            }

            let htmlContent = '';
            algorithms.main.steps.forEach(step => {
                htmlContent += `
                    <div class="algorithm-step bg-white dark:bg-gray-700 p-4 rounded-lg shadow-sm border-l-4 border-primary">
                        <h3 class="font-bold text-lg">${step.title || 'Без заголовка'}</h3>
                        <p>${step.description || 'Нет описания'}</p>
                        ${step.example ? `<p class="text-gray-600 dark:text-gray-400 mt-2">${step.example}</p>` : ''}
                `;

                if (step.title === "Уточнение ИНН") {
                    htmlContent += `
                        <p class="text-sm text-gray-500 mt-1 italic">
                            <a href="#" class="text-primary hover:underline" id="noInnLink">Что делать, если клиент не может назвать ИНН?</a>
                        </p>
                    `;
                }

                htmlContent += `</div>`;
            });

            mainAlgorithmContainer.innerHTML = htmlContent;
        }


        function showAlgorithmDetail(algorithm, section) {
            const algorithmModal = document.getElementById('algorithmModal');
            const modalTitle = document.getElementById('modalTitle');
            const algorithmStepsContainer = document.getElementById('algorithmSteps');
            let deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');

            if (!algorithmModal || !modalTitle || !algorithmStepsContainer) {
                console.error("showAlgorithmDetail: Essential modal elements missing (#algorithmModal, #modalTitle, #algorithmStepsContainer). Cannot proceed.");
                showNotification("Ошибка интерфейса: Не удалось найти элементы окна деталей.", "error");
                return;
            }

            currentAlgorithm = algorithm?.id ?? 'main';
            currentSection = section;

            modalTitle.textContent = algorithm?.title ?? "Детали алгоритма";

            try {
                let stepsHtml;
                if (algorithm?.steps && Array.isArray(algorithm.steps)) {
                    stepsHtml = algorithm.steps.map((step, index) => `
                <div class="algorithm-step bg-white dark:bg-gray-700 p-4 rounded-lg shadow-sm border-l-4 border-primary mb-3">
                    <h3 class="font-bold text-lg">${step?.title ?? `Шаг ${index + 1}`}</h3>
                    <p>${step?.description ?? 'Нет описания.'}</p>
                    ${step?.example ? `<div class="text-gray-600 dark:text-gray-400 mt-2 text-sm prose dark:prose-invert max-w-none">${step.example}</div>` : ''}
                </div>`).join('');
                } else {
                    stepsHtml = '<p class="text-orange-500">Данные шагов отсутствуют или некорректны.</p>';
                }
                algorithmStepsContainer.innerHTML = stepsHtml;
            } catch (error) {
                console.error("showAlgorithmDetail: Error processing algorithm steps:", error);
                algorithmStepsContainer.innerHTML = '<p class="text-red-500">Ошибка при отображении шагов алгоритма.</p>';
            }

            if (deleteAlgorithmBtn) {
                try {
                    const newDeleteBtn = deleteAlgorithmBtn.cloneNode(true);
                    deleteAlgorithmBtn.parentNode.replaceChild(newDeleteBtn, deleteAlgorithmBtn);
                    deleteAlgorithmBtn = newDeleteBtn;

                    if (typeof handleDeleteAlgorithmClick === 'function') {
                        deleteAlgorithmBtn.addEventListener('click', handleDeleteAlgorithmClick);
                    } else {
                        console.error("showAlgorithmDetail: handleDeleteAlgorithmClick function is not defined. Delete button disabled.");
                        deleteAlgorithmBtn.disabled = true;
                        deleteAlgorithmBtn.title = "Ошибка: Обработчик удаления не найден.";
                    }

                    deleteAlgorithmBtn.classList.toggle('hidden', section === 'main');

                } catch (error) {
                    console.error("showAlgorithmDetail: Error processing delete button:", error);
                    if (deleteAlgorithmBtn) {
                        deleteAlgorithmBtn.disabled = true;
                        deleteAlgorithmBtn.title = "Ошибка при настройке кнопки.";
                        deleteAlgorithmBtn.classList.add('hidden');
                    }
                }
            } else {
                console.warn("showAlgorithmDetail: Delete button (#deleteAlgorithmBtn) not found.");
            }

            algorithmModal.classList.remove('hidden');
        }


        function editAlgorithm(algorithmId, section = 'main') {
            let algorithm = null;

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
                    console.error(`[editAlgorithm] Algorithm (ID: ${algorithmId}, Section: ${section}) has invalid 'steps' data (not an array).`);
                    showNotification("Ошибка данных: Шаги алгоритма некорректны.", "error");
                    editStepsContainer.innerHTML = '<p class="text-red-500">Ошибка загрузки шагов: данные некорректны.</p>';
                } else if (algorithm.steps.length === 0) {
                    editStepsContainer.innerHTML = '<p class="text-gray-500">У этого алгоритма еще нет шагов. Добавьте первый шаг.</p>';
                } else {
                    algorithm.steps.forEach((step, index) => {
                        const stepDiv = document.createElement('div');
                        stepDiv.className = 'edit-step mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg';

                        const showExampleField = ('example' in step) || section === 'main';
                        const exampleInputHtml = showExampleField
                            ? `
                <div class="mt-2">
                    <label class="block text-sm font-medium mb-1">Пример (опционально)</label>
                    <textarea class="step-example w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base" rows="3">${step?.example ?? ''}</textarea>
                </div>`
                            : '';

                        stepDiv.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <label class="block text-sm font-medium step-number-label">Шаг ${index + 1}</label>
                    <button type="button" class="delete-step text-red-500 hover:text-red-700 transition-colors duration-150" aria-label="Удалить шаг ${index + 1}">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="mb-2">
                    <label class="block text-sm font-medium mb-1">Заголовок шага</label>
                    <input type="text" class="step-title w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base" value="${step?.title ?? ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Описание</label>
                    <textarea class="step-desc w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base" rows="3">${step?.description ?? ''}</textarea>
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

            } catch (error) {
                console.error(`[editAlgorithm] Error populating edit modal for algorithm ID ${algorithmId}:`, error);
                showNotification("Ошибка при заполнении формы редактирования.", "error");
                editModalTitle.textContent = 'Ошибка редактирования';
                algorithmTitleInput.value = '';
                editStepsContainer.innerHTML = '<p class="text-red-500">Не удалось загрузить данные для редактирования.</p>';
                return;
            }


            editModal.dataset.algorithmId = algorithmId;
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
                showNotification(`Ошибка: Не удалось найти раздел "${section}" для удаления алгоритма.`, "error");
                return Promise.reject(new Error(`Invalid section: ${section}`));
            }

            const indexToDelete = algorithms[section].findIndex(a => String(a.id) === String(algorithmId));

            if (indexToDelete === -1) {
                console.error(`deleteAlgorithm: Algorithm with id ${algorithmId} not found in section ${section}.`);
                showNotification("Ошибка: Алгоритм для удаления не найден в данных.", "error");
                return Promise.reject(new Error(`Algorithm not found: ${algorithmId}`));
            }

            try {
                algorithms[section].splice(indexToDelete, 1);
                console.log(`Algorithm ${algorithmId} removed from in-memory array [${section}].`);

                await saveDataToIndexedDB();
                console.log(`Updated algorithms data saved to IndexedDB after deleting ${algorithmId}.`);

                if (typeof renderAlgorithmCards === 'function') {
                    renderAlgorithmCards(section);
                    console.log(`UI for section ${section} re-rendered.`);
                } else {
                    console.warn("renderAlgorithmCards function not found, UI might not be updated.");
                }

                const algorithmModal = document.getElementById('algorithmModal');
                if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
                    algorithmModal.classList.add('hidden');
                    console.log("Algorithm detail modal hidden after deletion.");
                }

                showNotification("Алгоритм успешно удален.");
                return Promise.resolve();

            } catch (error) {
                console.error(`Error deleting algorithm ${algorithmId} from section ${section}:`, error);
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
            const exampleInputHTML = includeExampleField ? `
        <div class="mt-2">
            <label class="block text-sm font-medium mb-1">Пример (опционально)</label>
            <textarea class="step-example w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
        </div>
    ` : '';
            return `
        <div class="flex justify-between items-start mb-2">
            <label class="block text-sm font-medium">Шаг ${stepNumber}</label>
            <button type="button" class="delete-step text-red-500 hover:text-red-700">
                <i class="fas fa-trash"></i>
            </button>
        </div>
        <div class="mb-2">
            <label class="block text-sm font-medium mb-1">Заголовок шага</label>
            <input type="text" class="step-title w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
        </div>
        <div>
            <label class="block text-sm font-medium mb-1">Описание</label>
            <textarea class="step-desc w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
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

                if (!title || !description) {
                    stepsData.isValid = false;
                }

                const step = { title: title || '', description: description || '' };
                const exampleValue = exampleInput?.value.trim();
                if (exampleValue) {
                    step.example = exampleValue;
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
            stepDiv.className = 'edit-step mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg';
            stepDiv.innerHTML = createStepElementHTML(stepCount + 1, isMainAlgorithm);

            const deleteBtn = stepDiv.querySelector('.delete-step');
            if (deleteBtn) {
                attachDeleteListener(deleteBtn, editStepsContainer, containerId);
            }

            editStepsContainer.appendChild(stepDiv);
        }


        async function saveAlgorithm() {
            const algorithmId = editModal?.dataset.algorithmId;
            const section = editModal?.dataset.section;
            const algorithmTitleInput = document.getElementById('algorithmTitle');
            const editStepsContainer = document.getElementById('editSteps');

            if (!editModal || !algorithmId || !section || !algorithmTitleInput || !editStepsContainer) {
                console.error("Save failed: Missing required elements or data attributes.");
                showNotification("Ошибка сохранения: Не найдены необходимые элементы.", "error");
                return;
            }

            const newTitle = algorithmTitleInput.value.trim();
            if (!newTitle) {
                showNotification('Пожалуйста, введите название алгоритма', 'error');
                return;
            }

            const { steps: newSteps, isValid } = extractStepsData(editStepsContainer);

            if (!isValid) {
                showNotification('Пожалуйста, заполните все обязательные поля (Заголовок и Описание) для каждого шага', 'error');
                return;
            }

            let updateSuccessful = false;

            if (section === 'main') {
                if (algorithms?.main) {
                    algorithms.main.title = newTitle;
                    algorithms.main.steps = newSteps;
                    const mainTitleElement = document.querySelector('#mainContent h2');
                    if (mainTitleElement) {
                        mainTitleElement.textContent = newTitle;
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
                            id: algorithms[section][algorithmIndex].id,
                            title: newTitle,
                            steps: newSteps
                        };
                        if (typeof renderAlgorithmCards === 'function') renderAlgorithmCards(section);
                        updateSuccessful = true;
                    } else {
                        console.error(`Cannot find algorithm with ID ${algorithmId} in section ${section} to update.`);
                    }
                } else {
                    console.error(`Cannot update algorithm: algorithms.${section} is not an array or does not exist.`);
                }
            }

            if (updateSuccessful) {
                try {
                    console.log("Attempting to save updated algorithms to IndexedDB...");
                    const saved = await saveDataToIndexedDB();
                    if (saved) {
                        console.log("Algorithms successfully saved to IndexedDB.");
                        showNotification("Алгоритм успешно сохранен.");
                    } else {
                        console.error("saveDataToIndexedDB returned false.");
                        showNotification("Не удалось сохранить изменения.", "error");
                    }
                } catch (error) {
                    console.error("Error during saveDataToIndexedDB in saveAlgorithm:", error);
                    showNotification("Ошибка при сохранении данных.", "error");
                }
            } else {
                showNotification("Не удалось обновить данные алгоритма в памяти.", "error");
            }


            editModal.classList.add('hidden');

            if (typeof algorithmModal !== 'undefined' && !algorithmModal.classList.contains('hidden') && typeof showAlgorithmDetail === 'function') {
                const algorithm = section === 'main'
                    ? algorithms?.main
                    : algorithms?.[section]?.find(a => String(a.id) === String(algorithmId));
                if (algorithm) {
                    showAlgorithmDetail(algorithm, section);
                }
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
            if (!addModal) return;

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


            newStepsContainer.innerHTML = `
        <div class="edit-step mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            ${createStepElementHTML(1, false)}
        </div>
    `;

            const firstDeleteBtn = newStepsContainer.querySelector('.delete-step');
            if (firstDeleteBtn) {
                attachDeleteListener(firstDeleteBtn, newStepsContainer, containerId);
            }

            addModal.dataset.section = section;
            addModal.classList.remove('hidden');
        }


        function addNewStep() {
            const containerId = 'newSteps';
            const newStepsContainer = document.getElementById(containerId);
            if (!newStepsContainer) return;

            const stepCount = newStepsContainer.children.length;

            const stepDiv = document.createElement('div');
            stepDiv.className = 'edit-step mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg';
            stepDiv.innerHTML = createStepElementHTML(stepCount + 1, false);

            const deleteBtn = stepDiv.querySelector('.delete-step');
            if (deleteBtn) {
                attachDeleteListener(deleteBtn, newStepsContainer, containerId);
            }

            newStepsContainer.appendChild(stepDiv);
        }


        function saveNewAlgorithm() {
            const section = addModal?.dataset.section;
            const newAlgorithmTitle = document.getElementById('newAlgorithmTitle');
            const newAlgorithmDesc = document.getElementById('newAlgorithmDesc');
            const newStepsContainer = document.getElementById('newSteps');

            if (!addModal || !section || !newAlgorithmTitle || !newAlgorithmDesc || !newStepsContainer) {
                console.error("Save New Algorithm failed: Missing required elements or data attributes.");
                return;
            }

            const title = newAlgorithmTitle.value.trim();
            const description = newAlgorithmDesc.value.trim();
            if (!title) return alert('Пожалуйста, введите название алгоритма');
            if (!description) return alert('Пожалуйста, введите краткое описание алгоритма');

            const { steps, isValid } = extractStepsData(newStepsContainer);

            if (!isValid) return alert('Пожалуйста, заполните все обязательные поля (Заголовок и Описание) для каждого шага');
            if (steps.length === 0) return alert('Пожалуйста, добавьте хотя бы один шаг');

            const id = section + Date.now();

            const newAlgorithm = { id, title, description, steps };

            if (!algorithms[section]) {
                algorithms[section] = [];
            }
            algorithms[section].push(newAlgorithm);

            if (typeof renderAlgorithmCards === 'function') renderAlgorithmCards(section);

            if (typeof saveToLocalStorage === 'function') saveToLocalStorage();

            addModal.classList.add('hidden');
        }


        function saveToLocalStorage() {
            try {
                localStorage.setItem('algorithms1C', JSON.stringify(algorithms));
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
            }
        }


        function loadFromLocalStorage() {
            try {
                const savedAlgorithms = localStorage.getItem('algorithms1C');
                if (savedAlgorithms) {
                    algorithms = JSON.parse(savedAlgorithms);
                    return true;
                }
            } catch (e) {
                console.error('Failed to load from localStorage:', e);
            }
            return false;
        }


        // ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
        async function appInit() {
            let dbInitialized = false;
            try {
                await initDB();
                dbInitialized = true;

                await Promise.all([
                    loadThemePreference(),
                    loadCategoryInfo(),
                    loadFromIndexedDB()
                ]);

            } catch (error) {
                console.error("Error during appInit data loading:", error);
                if (!Object.keys(algorithms.main.steps).length) {
                    loadFromLocalStorage();
                }
                if (!dbInitialized) {
                    console.warn("DB init failed. Using defaults for preferences/categories.");
                } else {
                    console.warn("Error loading from DB, using defaults for categories/prefs.");
                }
            }

            if (!algorithms || !algorithms.main || !algorithms.main.steps || algorithms.main.steps.length === 0) {
                console.error("CRITICAL: Main algorithm data is missing after init. App might not function correctly.");
            }

            console.log("Initializing UI systems...");
            initSearchSystem();
            initBookmarkSystem();
            initLinkSystem();
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

                if (dbReady) {
                    console.log("Применение настроек UI из IndexedDB...");
                    await applyUISettings();
                    console.log("Настройки UI применены.");
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

                setupTabsOverflow();

                const mainContentContainer = document.getElementById('mainContent');
                if (mainContentContainer) {
                    mainContentContainer.addEventListener('click', (event) => {
                        const link = event.target.closest('#noInnLink');
                        if (link) {
                            event.preventDefault();
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
                    });
                } else {
                    console.error("Контейнер #mainContent не найден для делегирования событий '#noInnLink'.");
                }

                console.log("Приложение успешно инициализировано и отображено.");

            } catch (error) {
                console.error("Критическая ошибка во время инициализации приложения:", error);

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
                    showNotification("Критическая ошибка при инициализации приложения. Обновите страницу.", "error");
                }
            }
        });




        // СИСТЕМА ПОИСКА
        function initSearchSystem() {
            const searchInput = document.getElementById('searchInput');
            const searchResults = document.getElementById('searchResults');
            const toggleAdvancedSearchBtn = document.getElementById('toggleAdvancedSearch');
            const advancedSearchOptions = document.getElementById('advancedSearchOptions');

            const toggleResultsVisibility = () => {
                searchResults.classList.toggle('hidden', !searchInput.value);
            };

            searchInput.addEventListener('focus', toggleResultsVisibility);

            searchInput.addEventListener('input', async () => {
                toggleResultsVisibility();
                if (searchInput.value) {
                    await performSearch(searchInput.value);
                }
            });

            document.addEventListener('click', (event) => {
                if (!searchInput.contains(event.target) && !searchResults.contains(event.target)) {
                    searchResults.classList.add('hidden');
                }
            });

            toggleAdvancedSearchBtn.addEventListener('click', () => {
                const isHidden = advancedSearchOptions.classList.toggle('hidden');
                toggleAdvancedSearchBtn.innerHTML = isHidden
                    ? '<i class="fas fa-cog mr-1"></i>Параметры поиска'
                    : '<i class="fas fa-times mr-1"></i>Скрыть параметры';
            });

            document.querySelectorAll('.search-section, .search-field').forEach(checkbox => {
                checkbox.addEventListener('change', async () => {
                    if (searchInput.value) {
                        await performSearch(searchInput.value);
                    }
                });
            });
        }


        async function performSearch(query) {
            const searchResults = document.getElementById('searchResults');
            const normalizedQuery = query.trim().toLowerCase();
            const results = [];

            if (!normalizedQuery) {
                searchResults.innerHTML = '<div class="p-3 text-center text-gray-500">Ничего не найдено</div>';
                searchResults.classList.add('hidden');
                return;
            }

            const sections = new Set([...document.querySelectorAll('.search-section:checked')].map(cb => cb.value));
            const fields = new Set([...document.querySelectorAll('.search-field:checked')].map(cb => cb.value));
            const includesIgnoreCase = (text, query) => text && text.toLowerCase().includes(query);
            const addResult = (item, section, type, id, title, description = null) => {
                if (!results.some(r => r.id === id && r.section === section && r.type === type)) {
                    results.push({ title, description, section, type, id });
                }
            };

            const searchSources = [
                {
                    section: 'main', type: 'algorithm', id: 'main', data: algorithms.main,
                    check: (item) => {
                        if (!item) return false;
                        if (fields.has('title') && includesIgnoreCase(item.title, normalizedQuery)) return true;
                        if (fields.has('steps')) {
                            return item.steps?.some(step =>
                                includesIgnoreCase(step.title, normalizedQuery) ||
                                includesIgnoreCase(step.description, normalizedQuery) ||
                                includesIgnoreCase(step.example, normalizedQuery)
                            );
                        }
                        return false;
                    },
                    getResult: (item) => ({ title: item.title })
                },
                {
                    section: 'links',
                    type: 'link',
                    getData: getAllCibLinks,
                    check: (item) => item && (
                        (fields.has('title') && includesIgnoreCase(item.title, normalizedQuery)) ||
                        (fields.has('description') && (includesIgnoreCase(item.description, normalizedQuery) || includesIgnoreCase(item.link, normalizedQuery)))
                    ),
                    getResult: (item) => ({
                        title: item.title,
                        description: item.description,
                        id: item.id
                    })
                },
                ...['program', 'skzi', 'webReg'].map(section => ({
                    section: section, type: 'algorithm', data: algorithms[section],
                    check: (item) => {
                        if (!item) return false;
                        if ((fields.has('title') && includesIgnoreCase(item.title, normalizedQuery)) ||
                            (fields.has('description') && includesIgnoreCase(item.description, normalizedQuery))) {
                            return true;
                        }
                        if (fields.has('steps')) {
                            return item.steps?.some(step =>
                                includesIgnoreCase(step.title, normalizedQuery) ||
                                includesIgnoreCase(step.description, normalizedQuery)
                            );
                        }
                        return false;
                    },
                    getResult: (item) => ({ title: item.title, description: item.description, id: item.id })
                })),
                {
                    section: 'reglaments', type: 'reglament', data: getAllReglaments(),
                    check: (item) => item && (
                        (fields.has('title') && includesIgnoreCase(item.title, normalizedQuery)) ||
                        (fields.has('description') && includesIgnoreCase(item.content, normalizedQuery))
                    ),
                    getResult: (item) => ({ title: item.title, description: item.category, id: item.id })
                },
                {
                    section: 'bookmarks', type: 'bookmark', data: getAllBookmarks(),
                    check: (item) => item && (
                        (fields.has('title') && includesIgnoreCase(item.title, normalizedQuery)) ||
                        (fields.has('description') && includesIgnoreCase(item.description, normalizedQuery))
                    ),
                    getResult: (item) => ({ title: item.title, description: item.description, id: item.id })
                }
            ];

            searchResults.innerHTML = '<div class="p-3 text-center text-gray-500">Идет поиск...</div>';
            results.length = 0;

            for (const source of searchSources) {
                if (sections.has(source.section)) {
                    let items = [];
                    try {
                        if (source.data) {
                            items = Array.isArray(source.data) ? source.data : [source.data];
                        } else if (source.getData) {
                            items = await source.getData();
                            items = Array.isArray(items) ? items : (items ? [items] : []);
                        }

                        items.forEach(item => {
                            if (item && source.check(item)) {
                                const resultData = source.getResult(item);
                                addResult(item, source.section, source.type, resultData.id ?? source.id ?? item.id, resultData.title, resultData.description);
                            }
                        });
                    } catch (error) {
                        console.error(`Ошибка при поиске в разделе ${source.section}:`, error);
                    }
                }
            }

            if (results.length === 0) {
                searchResults.innerHTML = '<div class="p-3 text-center text-gray-500">Ничего не найдено</div>';
            } else {
                searchResults.innerHTML = '';

                const sectionDetails = {
                    main: { icon: 'fa-sitemap text-primary', name: 'Главный алгоритм' },
                    program: { icon: 'fa-desktop text-green-500', name: 'Программа 1С' },
                    skzi: { icon: 'fa-key text-yellow-500', name: 'СКЗИ' },
                    webReg: { icon: 'fa-globe text-blue-500', name: 'Веб-Регистратор' },
                    links: { icon: 'fa-link text-purple-500', name: 'Ссылки 1С' },
                    reglaments: { icon: 'fa-file-alt text-red-500', name: 'Регламенты' },
                    bookmarks: { icon: 'fa-bookmark text-orange-500', name: 'Закладки' }
                };

                const fragment = document.createDocumentFragment();
                results.forEach(result => {
                    const resultElement = document.createElement('div');
                    resultElement.className = 'p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-0';

                    const details = sectionDetails[result.section];
                    const sectionIcon = `<i class="fas ${details.icon} mr-2"></i>`;
                    const sectionName = details.name;

                    resultElement.innerHTML = `
                <div class="font-medium">${result.title}</div>
                ${result.description ? `<div class="text-sm text-gray-600 dark:text-gray-400">${result.description}</div>` : ''}
                <div class="text-xs text-gray-500 mt-1">${sectionIcon}${sectionName}</div>
            `;

                    resultElement.addEventListener('click', () => {
                        navigateToResult(result);
                        searchResults.classList.add('hidden');
                    });
                    fragment.appendChild(resultElement);
                });
                searchResults.appendChild(fragment);
            }
            searchResults.classList.toggle('hidden', results.length === 0);
        }


        function navigateToResult(result) {
            if (!result || typeof result !== 'object' || !result.section || !result.type || !result.id) {
                console.error("navigateToResult: Invalid or incomplete result object provided.", result);
                showNotification("Ошибка навигации: некорректные данные результата.", "error");
                return;
            }

            setActiveTab(result.section);

            const scrollToAndHighlight = (selector, id) => {
                setTimeout(() => {
                    const activeContent = document.querySelector('.tab-content:not(.hidden)');
                    if (!activeContent) {
                        console.warn(`[scrollToAndHighlight] Active tab content container not found.`);
                        return;
                    }

                    const element = activeContent.querySelector(`${selector}[data-id="${id}"]`);

                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        const highlightClasses = ['bg-yellow-100', 'dark:bg-yellow-800', 'ring-2', 'ring-yellow-400', 'transition-all', 'duration-300'];
                        element.classList.add(...highlightClasses);

                        setTimeout(() => {
                            element.classList.remove(...highlightClasses);
                        }, 2500);
                    } else {
                        console.warn(`[scrollToAndHighlight] Element not found: selector='${selector}', id='${id}' within active tab.`);
                    }
                }, 150);
            };

            try {
                switch (result.type) {
                    case 'algorithm':
                        if (result.section !== 'main') {
                            const algorithm = algorithms[result.section]?.find(a => String(a?.id) === String(result.id));
                            if (algorithm) {
                                showAlgorithmDetail(algorithm, result.section);
                            } else {
                                console.warn(`[navigateToResult] Algorithm data not found in memory for ID ${result.id} in section ${result.section}.`);
                                showNotification(`Не найдены данные для алгоритма ID ${result.id}`, "warning");
                            }
                        } else {
                            document.getElementById('mainContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        break;

                    case 'link':
                        scrollToAndHighlight('.cib-link-item', result.id);
                        break;

                    case 'extLink':
                        scrollToAndHighlight('.ext-link-item', result.id);
                        break;

                    case 'reglament':
                        if (typeof showReglamentDetail === 'function') {
                            showReglamentDetail(result.id);
                        } else {
                            console.error("[navigateToResult] Function 'showReglamentDetail' is not defined. Cannot show reglament details.");
                            showNotification("Ошибка: Функция отображения регламента не найдена.", "error");
                        }
                        break;

                    case 'bookmark':
                        scrollToAndHighlight('.bookmark-item', result.id);
                        break;

                    default:
                        console.warn(`[navigateToResult] Unknown result type encountered: ${result.type}`);
                        showNotification(`Неизвестный тип результата: ${result.type}`, "warning");
                        break;
                }
            } catch (error) {
                console.error(`[navigateToResult] Error processing result type '${result.type}' for ID '${result.id}':`, error);
                showNotification("Произошла ошибка при переходе к результату.", "error");
            }

            document.getElementById('searchResults')?.classList.add('hidden');
            document.getElementById('searchInput')?.blur();
        }


        // ПОЛЕ ВВОДА ДАННЫХ ПО КЛИЕНТУ
        function initClientDataSystem() {
            const clientNotes = document.getElementById('clientNotes');
            const clearClientDataBtn = document.getElementById('clearClientDataBtn');
            let saveTimeout;

            clientNotes?.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveClientData, 500);
            });

            clearClientDataBtn?.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите очистить все данные по обращению?')) {
                    clearClientData();
                }
            });

            const exportTextBtn = document.createElement('button');
            exportTextBtn.id = 'exportTextBtn';
            exportTextBtn.className = 'p-1.5 lg:px-2 lg:py-1 bg-green-500 hover:bg-green-600 text-white rounded-md transition text-sm ml-2';
            exportTextBtn.title = 'Сохранить как .txt';
            exportTextBtn.innerHTML = `
                                        <i class="fas fa-file-download lg:mr-1"></i>
                                        <span class="hidden lg:inline">Сохранить как .txt</span>
                                    `;
            exportTextBtn.addEventListener('click', exportClientDataToTxt);

            const clearButton = document.getElementById('clearClientDataBtn');
            clearButton?.parentNode?.appendChild(exportTextBtn);
        }


        function saveClientData() {
            const clientDataToSave = getClientData();

            if (db) {
                saveToIndexedDB('clientData', clientDataToSave)
                    .catch(error => {
                        console.error("Error saving client data to IndexedDB:", error);
                        console.warn("Falling back to localStorage due to IndexedDB error.");
                        try {
                            localStorage.setItem('clientData', JSON.stringify(clientDataToSave));
                        } catch (lsError) {
                            console.error("Error saving client data to localStorage after IndexedDB failure:", lsError);
                            showNotification("Ошибка сохранения данных.", "error");
                        }
                    });
            } else {
                try {
                    localStorage.setItem('clientData', JSON.stringify(clientDataToSave));
                } catch (lsError) {
                    console.error("Error saving client data to localStorage:", lsError);
                    showNotification("Ошибка сохранения данных.", "error");
                }
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
                showNotification("Нет данных для экспорта", "error");
                return;
            }

            const now = new Date();
            const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-'); // YYYY-MM-DD_HH-MM-SS
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
        themeToggleBtn?.addEventListener('click', () => {
            const currentTheme = document.querySelector('input[name="themeMode"]:checked')?.value || 'auto';
            const nextTheme = currentTheme === 'dark' ? 'light' : (currentTheme === 'light' ? 'auto' : 'dark');

            const nextThemeRadio = document.querySelector(`input[name="themeMode"][value="${nextTheme}"]`);
            if (nextThemeRadio) {
                nextThemeRadio.checked = true;
                setTheme(nextTheme);
                saveUISettings().then(success => {
                    if (success) showNotification(`Тема изменена на: ${nextTheme}`);
                });
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

            if (!addBookmarkBtn || !bookmarksContainer) return;

            addBookmarkBtn.addEventListener('click', showAddBookmarkModal);
            organizeBookmarksBtn?.addEventListener('click', showOrganizeFoldersModal);
            bookmarkSearchInput?.addEventListener('input', filterBookmarks);
            bookmarkFolderFilter?.addEventListener('change', filterBookmarks);
        }

        async function loadBookmarks() {
            if (!db) return false;

            try {
                let folders = await getAllFromIndexedDB('bookmarkFolders');
                if (!folders?.length) {
                    const defaultFolders = [
                        { name: 'Общие', color: 'blue' },
                        { name: 'Важное', color: 'red' },
                        { name: 'Инструкции', color: 'green' }
                    ];
                    await Promise.all(defaultFolders.map(folder => saveToIndexedDB('bookmarkFolders', folder)));
                    folders = await getAllFromIndexedDB('bookmarkFolders');
                }
                renderBookmarkFolders(folders);

                let bookmarks = await getAllFromIndexedDB('bookmarks');
                if (!bookmarks?.length) {
                    const sampleBookmarks = [
                        {
                            title: 'База знаний крипты',
                            url: 'https://www.cryptopro.ru/support/docs',
                            description: 'Документация КриптоПро',
                            folder: 1
                        },

                        {
                            title: 'База знаний Рутокен',
                            url: 'https://dev.rutoken.ru/display/KB/Search',
                            description: 'Документация Рутокен',
                            folder: 1
                        }
                    ];
                    await Promise.all(sampleBookmarks.map(bookmark => saveToIndexedDB('bookmarks', bookmark)));
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

            if (!addExtLinkBtn || !extLinksContainer) return;

            addExtLinkBtn.addEventListener('click', showAddExtLinkModal);

            const extLinkSearchInput = document.getElementById('extLinkSearchInput');
            extLinkSearchInput?.addEventListener('input', debounce(filterExtLinks, 250));

            const extLinkCategoryFilter = document.getElementById('extLinkCategoryFilter');
            extLinkCategoryFilter?.addEventListener('change', filterExtLinks);

            loadExtLinks();
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
                folderMap = folders.reduce((map, folder) => (map[folder.id] = folder, map), {});
            } catch (e) {
                console.error("Could not load folders for bookmark rendering:", e);
            }

            const fragment = document.createDocumentFragment();
            bookmarks.forEach(bookmark => {
                const bookmarkElement = document.createElement('div');
                const folder = bookmark.folder ? folderMap[bookmark.folder] : null;
                let folderBadgeHTML = '';

                if (folder) {
                    const color = folder.color || 'gray';
                    folderBadgeHTML = `
                <span class="folder-badge inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap bg-${color}-100 text-${color}-700 dark:bg-${color}-900 dark:text-${color}-300">
                    <i class="fas fa-folder mr-1"></i>${folder.name}
                </span>`;
                }

                bookmarkElement.className = 'bookmark-item view-item group';
                bookmarkElement.dataset.id = bookmark.id;
                if (bookmark.folder) bookmarkElement.dataset.folder = bookmark.folder;

                bookmarkElement.innerHTML = `
            <div class="flex-grow min-w-0 mr-3">
                <h3 class="font-semibold text-base group-hover:text-primary dark:group-hover:text-primary truncate" title="${bookmark.title}">${bookmark.title}</h3>
                <p class="bookmark-description text-gray-600 dark:text-gray-400 text-sm mt-1 mb-2 truncate">${bookmark.description || 'Нет описания'}</p>
                <div class="bookmark-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                     ${folderBadgeHTML}
                     <span class="text-gray-500"><i class="far fa-clock mr-1"></i>${new Date(bookmark.dateAdded).toLocaleDateString()}</span>
                     <a href="${bookmark.url}" target="_blank" class="bookmark-url text-gray-500 hover:text-primary dark:hover:text-primary hidden" title="${bookmark.url}">
                         <i class="fas fa-link mr-1"></i>${new URL(bookmark.url).hostname}
                     </a>
                </div>
            </div>
            <div class="bookmark-actions flex flex-shrink-0 items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <a href="${bookmark.url}" target="_blank" class="p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Открыть ссылку">
                    <i class="fas fa-external-link-alt"></i>
                </a>
                <button data-action="edit" class="edit-bookmark p-1.5 text-gray-500 hover:text-primary rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
                <button data-action="delete" class="delete-bookmark p-1.5 text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ml-1" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
                fragment.appendChild(bookmarkElement);
            });

            bookmarksContainer.appendChild(fragment);

            bookmarksContainer.removeEventListener('click', handleBookmarkAction);
            bookmarksContainer.addEventListener('click', handleBookmarkAction);

            applyCurrentView('bookmarksContainer');
        }


        function handleBookmarkAction(event) {
            const target = event.target;
            const button = target.closest('button[data-action]');
            const bookmarkItem = target.closest('.bookmark-item');

            if (!bookmarkItem) return;

            const bookmarkId = parseInt(bookmarkItem.dataset.id, 10);
            const action = button?.dataset.action;

            if (action === 'edit') {
                event.stopPropagation();
                showEditBookmarkModal(bookmarkId);
            } else if (action === 'delete') {
                event.stopPropagation();
                const title = bookmarkItem.querySelector('h3')?.title || `ID ${bookmarkId}`;
                if (confirm(`Вы уверены, что хотите удалить закладку "${title}"?`)) {
                    deleteBookmark(bookmarkId);
                }
            } else if (!target.closest('a') && !button) {
                console.log("Клик по закладке:", bookmarkId);
            }
        }


        async function deleteBookmark(id) {
            try {
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


        function showAddBookmarkModal() {
            let modal = document.getElementById('bookmarkModal');

            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'bookmarkModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
                modal.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold">Добавить закладку</h2>
                            <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        <form id="bookmarkForm">
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="bookmarkTitle">Название</label>
                                <input type="text" id="bookmarkTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="bookmarkUrl">URL</label>
                                <input type="url" id="bookmarkUrl" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="bookmarkDescription">Описание</label>
                                <textarea id="bookmarkDescription" rows="3" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
                            </div>
                            <div class="mb-4">
                                <label class="block text-sm font-medium mb-1" for="bookmarkFolder">Папка</label>
                                <select id="bookmarkFolder" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                    <option value="">Выберите папку</option>
                                    <!-- Folder options will be added here -->
                                </select>
                            </div>
                            <div class="flex justify-end mt-6">
                                <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md transition mr-2">
                                    Отмена
                                </button>
                                <button type="submit" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                    Сохранить
                                </button>
                            </div>
                        </form>
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
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const title = form.elements.bookmarkTitle.value.trim();
                    const url = form.elements.bookmarkUrl.value.trim();
                    const description = form.elements.bookmarkDescription.value.trim();
                    const folder = form.elements.bookmarkFolder.value;

                    if (!title || !url) {
                        showNotification("Пожалуйста, заполните обязательные поля", "error");
                        return;
                    }

                    const bookmark = {
                        title,
                        url,
                        description,
                        folder: folder || null,
                        dateAdded: new Date().toISOString()
                    };

                    try {
                        await saveToIndexedDB('bookmarks', bookmark);

                        const bookmarks = await getAllFromIndexedDB('bookmarks');
                        renderBookmarks(bookmarks);

                        showNotification("Закладка добавлена");
                        modal.classList.add('hidden');
                        form.reset();
                    } catch (error) {
                        console.error("Error saving bookmark:", error);
                        showNotification("Ошибка при сохранении закладки", "error");
                    }
                });
            }

            const folderSelect = modal.querySelector('#bookmarkFolder');
            if (folderSelect) {
                populateBookmarkFolders(folderSelect);
            } else {
                populateBookmarkFolders();
            }

            modal.classList.remove('hidden');
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


        async function loadFoldersList(foldersListElement) {
            const foldersList = foldersListElement || document.getElementById('foldersList');
            if (!foldersList) return;

            foldersList.innerHTML = '<div class="text-center py-4 text-gray-500">Загрузка папок...</div>';

            try {
                const folders = await getAllFromIndexedDB('bookmarkFolders');

                if (!folders?.length) {
                    foldersList.innerHTML = '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
                    return;
                }

                foldersList.innerHTML = '';

                const fragment = document.createDocumentFragment();
                folders.forEach(folder => {
                    const folderItem = document.createElement('div');
                    folderItem.className = 'flex justify-between items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded';
                    folderItem.dataset.id = folder.id;
                    folderItem.innerHTML = `
                <div class="flex items-center">
                    <span class="w-4 h-4 rounded-full bg-${folder.color}-600 mr-2"></span>
                    <span>${folder.name}</span>
                </div>
                <button class="delete-folder text-red-500 hover:text-red-700 p-1" aria-label="Удалить папку ${folder.name}">
                    <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
            `;
                    fragment.appendChild(folderItem);
                });
                foldersList.appendChild(fragment);

                foldersList.addEventListener('click', async (e) => {
                    const deleteButton = e.target.closest('.delete-folder');
                    if (!deleteButton) return;

                    const folderItem = deleteButton.closest('[data-id]');
                    const folderId = folderItem?.dataset.id;

                    if (!folderId) {
                        console.error("Could not find folder ID for deletion.");
                        return;
                    }

                    try {
                        const bookmarks = await getAllFromIndexedDB('bookmarks');
                        const folderHasBookmarks = bookmarks.some(bookmark => bookmark.folder == folderId);

                        if (folderHasBookmarks) {
                            showNotification("Нельзя удалить папку, содержащую закладки", "error");
                            return;
                        }

                        await deleteFromIndexedDB('bookmarkFolders', Number(folderId) || folderId);

                        folderItem.remove();

                        populateBookmarkFolders();
                        const updatedFolders = await getAllFromIndexedDB('bookmarkFolders');
                        renderBookmarkFolders(updatedFolders);

                        showNotification("Папка удалена");

                        if (foldersList.childElementCount === 0) {
                            foldersList.innerHTML = '<div class="text-center py-4 text-gray-500">Нет созданных папок</div>';
                        }

                    } catch (error) {
                        console.error("Error deleting folder:", error);
                        showNotification("Ошибка при удалении папки", "error");
                    }
                });

            } catch (error) {
                console.error("Error loading folders list:", error);
                foldersList.innerHTML = '<div class="text-center py-4 text-gray-500">Ошибка при загрузке папок</div>';
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
            if (!modal) return;

            const form = modal.querySelector('#cibLinkForm');
            if (!form) {
                console.error("CIB Link modal form (#cibLinkForm) not found.");
                return;
            }

            modal.querySelectorAll('.close-modal, .cancel-modal').forEach(button => {
                button.addEventListener('click', () => modal.classList.add('hidden'));
            });

            form.addEventListener('submit', handleCibLinkSubmit);

            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }


        function handleLinkActionClick(event) {
            const button = event.target.closest('button');
            if (!button) return;

            const linkItem = button.closest('.cib-link-item[data-id]');
            if (!linkItem) return;

            const linkId = parseInt(linkItem.dataset.id, 10);

            if (button.classList.contains('copy-cib-link')) {
                const codeElement = linkItem.querySelector('code');
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
                const linkTitle = titleElement ? titleElement.getAttribute('title') || titleElement.textContent : `ID ${linkId}`;
                deleteCibLink(linkId, linkTitle);
                return;
            }
        }


        async function loadCibLinks() {
            const linksContainer = document.getElementById('linksContainer');
            if (!linksContainer) return;

            linksContainer.innerHTML = '<div class="text-center py-6 text-gray-500">Загрузка ссылок...</div>';

            try {
                let links = await getAllFromIndexedDB('links');

                if (!links || links.length === 0) {
                    console.log("База ссылок 1С пуста. Добавляем стартовый набор.");

                    await Promise.all(
                        DEFAULT_CIB_LINKS.map(link => saveToIndexedDB('links', link))
                    );
                    console.log("Стартовые ссылки добавлены в IndexedDB.");

                    links = await getAllFromIndexedDB('links');
                }

                renderCibLinks(links);

            } catch (error) {
                console.error("Ошибка при загрузке ссылок 1С:", error);
                linksContainer.innerHTML = '<div class="text-center py-6 text-red-500">Не удалось загрузить ссылки. Проверьте консоль на наличие ошибок базы данных.</div>';
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
                <div class="flex flex-shrink-0 items-center gap-1 md:ml-4 mt-2 md:mt-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"> <!-- Кнопки -->
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

            const id = form.elements.cibLinkId.value;
            const title = form.elements.cibLinkTitle.value.trim();
            const linkValue = form.elements.cibLinkValue.value.trim();
            const description = form.elements.cibLinkDescription.value.trim();

            if (!title || !linkValue) {
                showNotification("Пожалуйста, заполните поля 'Название' и 'Ссылка 1С'", "error");
                return;
            }
            if (!linkValue.toLowerCase().startsWith('e1cib/')) {
                showNotification("Ссылка должна начинаться с 'e1cib/' (Рекомендуется)", "warning");
            }

            const linkData = {
                title,
                link: linkValue,
                description,
            };

            const isEditing = !!id;

            try {
                const timestamp = new Date().toISOString();
                if (isEditing) {
                    linkData.id = parseInt(id, 10);
                    linkData.dateUpdated = timestamp;
                    const existingLink = await getFromIndexedDB('links', linkData.id);
                    linkData.dateAdded = existingLink?.dateAdded || timestamp;
                } else {
                    linkData.dateAdded = timestamp;
                }

                await saveToIndexedDB('links', linkData);

                showNotification(isEditing ? "Ссылка обновлена" : "Ссылка добавлена");
                document.getElementById('cibLinkModal')?.classList.add('hidden');
                loadCibLinks();

            } catch (error) {
                console.error("Ошибка при сохранении ссылки 1С:", error);
                showNotification("Не удалось сохранить ссылку", "error");
            }
        }

        async function deleteCibLink(linkId, linkTitle) {
            if (confirm(`Вы уверены, что хотите удалить ссылку "${linkTitle || `ID ${linkId}`}"?`)) {
                try {
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
            document.getElementById('addReglamentBtn')?.addEventListener('click', showAddReglamentModal);
            document.getElementById('addReglamentCategoryBtn')?.addEventListener('click', () => showAddCategoryModal());

            const categoryGrid = document.getElementById('reglamentCategoryGrid');
            const reglamentsListDiv = document.getElementById('reglamentsList');

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
                }
            });

            document.getElementById('backToCategories')?.addEventListener('click', () => {
                if (reglamentsListDiv) reglamentsListDiv.classList.add('hidden');
                if (categoryGrid) categoryGrid.classList.remove('hidden');
                const reglamentsContainer = document.getElementById('reglamentsContainer');
                if (reglamentsContainer) reglamentsContainer.innerHTML = '';
                document.getElementById('currentCategoryTitle').textContent = '';
            });
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
                                                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-md transition mr-2">
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


        async function handleAddCategorySubmit(event) {
            event.preventDefault();
            const form = event.target;
            const title = form.elements.newCategoryTitle.value.trim();
            const categoryId = form.elements.newCategoryId.value.trim();
            const icon = form.elements.newCategoryIcon.value.trim() || 'fa-folder-open';
            const color = form.elements.newCategoryColor.value || 'gray';

            if (!title || !categoryId) {
                showNotification("Пожалуйста, заполните Название и ID категории.", "error");
                return;
            }

            const isEditing = form.dataset.editingId;

            if (isEditing) {
                if (categoryDisplayInfo[isEditing]) {
                    categoryDisplayInfo[isEditing] = { title: title, icon: icon, color: color };

                    const success = await saveCategoryInfo();
                    if (success) {
                        renderReglamentCategories();
                        showNotification(`Категория "${title}" обновлена.`);
                        form.closest('.fixed.inset-0')?.classList.add('hidden');
                    }
                } else {
                    showNotification("Ошибка: Редактируемая категория не найдена.", "error");
                }

            } else {
                if (categoryDisplayInfo[categoryId]) {
                    showNotification("Категория с таким ID уже существует.", "error");
                    return;
                }

                categoryDisplayInfo[categoryId] = { title: title, icon: icon, color: color };

                const success = await saveCategoryInfo();
                if (success) {
                    renderReglamentCategories();
                    showNotification(`Категория "${title}" добавлена.`);
                    form.closest('.fixed.inset-0')?.classList.add('hidden');
                    form.reset();
                }
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
                    const sampleReglaments = [
                        { title: 'Работа с агрессивным клиентом', content: 'Сам он дурак, а ты красавчег!', category: 'difficult-client' },
                        { title: 'Стандарт ответа на обращение', content: 'Дратути', category: 'tech-support' }
                    ];
                    await Promise.all(
                        sampleReglaments.map(reglament => saveToIndexedDB('reglaments', reglament))
                    );
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
                    reglamentElement.className = 'reglament-item view-item group flex justify-between items-center';
                    reglamentElement.dataset.id = reglament.id;

                    reglamentElement.innerHTML = `
                <div class="flex-grow min-w-0 mr-3 cursor-pointer" data-action="view">
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
                showAddReglamentModal();
                return;
            }

            const actionButton = target.closest('button[data-action]');
            const viewTrigger = target.closest('[data-action="view"]');
            const reglamentItem = target.closest('.reglament-item[data-id]');

            if (!reglamentItem) return;

            const reglamentId = parseInt(reglamentItem.dataset.id);

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
            } else if (viewTrigger) {
                event.stopPropagation();
                showReglamentDetail(reglamentId);
            }
        }


        async function deleteReglamentFromList(id, elementToRemove) {
            try {
                await deleteFromIndexedDB('reglaments', id);
                showNotification("Регламент удален");
                if (elementToRemove) {
                    elementToRemove.remove();
                    const container = document.getElementById('reglamentsContainer');
                    if (container && container.childElementCount === 0) {
                        container.innerHTML = '<div class="text-center py-6 text-gray-500">В этой категории пока нет регламентов. <br> Вы можете <button class="text-primary hover:underline" onclick="showAddReglamentModal()">добавить регламент</button> в эту категорию.</div>';
                    }
                } else {
                    const currentCategoryTitleEl = document.getElementById('currentCategoryTitle');
                    if (currentCategoryTitleEl && !currentCategoryTitleEl.closest('#reglamentsList').classList.contains('hidden')) {
                        const currentCategoryId = Object.keys(categoryDisplayInfo).find(key => categoryDisplayInfo[key].title === currentCategoryTitleEl.textContent);
                        if (currentCategoryId) showReglamentsForCategory(currentCategoryId);
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
                return modal;
            }

            modal = document.createElement('div');
            modal.id = id;

            modal.className = baseClassName;
            modal.classList.add('flex', 'items-center', 'justify-center');

            modal.innerHTML = innerHTML;

            if (!document.body) {
                throw new Error(`[getOrCreateModal] document.body not available when creating modal #${id}.`);
            }
            document.body.appendChild(modal);

            modal.addEventListener('click', (event) => {
                const target = event.target;
                if (target === modal || target.closest('.close-modal, .cancel-modal, .close-detail-modal, .cancel-edit-modal, .close-sample-modal')) {
                    modal.classList.add('hidden');
                }
            });

            if (typeof setupCallback === 'function') {
                try {
                    setupCallback(modal);
                } catch (error) {
                    console.error(`[getOrCreateModal] Error executing setupCallback for modal #${id}:`, error);
                }
            }

            return modal;
        };


        const loadMarkedIfNeeded = (() => {
            let loadingPromise = null;
            return () => {
                if (window.marked) {
                    return Promise.resolve(window.marked);
                }
                if (loadingPromise) {
                    return loadingPromise;
                }

                const existingScript = document.querySelector('script[src*="marked.min.js"]');
                if (existingScript) {
                    loadingPromise = new Promise((resolve, reject) => {
                        const MAX_WAIT = 5000;
                        let waited = 0;
                        const interval = setInterval(() => {
                            if (window.marked) {
                                clearInterval(interval);
                                loadingPromise = null;
                                return resolve(window.marked);
                            }
                            waited += 100;
                            if (waited >= MAX_WAIT) {
                                clearInterval(interval);
                                console.error("marked.js loading timed out (script tag existed).");
                                loadingPromise = null;
                                return reject(new Error("marked.js loading timed out"));
                            }
                        }, 100);
                        existingScript.addEventListener('error', () => {
                            clearInterval(interval);
                            console.error("marked.js script tag reported an error.");
                            loadingPromise = null;
                            reject(new Error("Failed to load marked.js"));
                        }, { once: true });
                    });
                    return loadingPromise;
                }

                loadingPromise = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
                    script.async = true;
                    script.onload = () => {
                        loadingPromise = null;
                        resolve(window.marked);
                    };
                    script.onerror = (err) => {
                        console.error("Failed to load marked.js:", err);
                        loadingPromise = null;
                        reject(new Error("Failed to load marked.js"));
                    };
                    document.head.appendChild(script);
                });
                return loadingPromise;
            };
        })();


        const renderMarkdown = async (element, markdownContent) => {
            try {
                const marked = await loadMarkedIfNeeded();
                if (marked) {
                    element.innerHTML = marked.parse(markdownContent);
                } else {
                    element.innerHTML = `<pre>${markdownContent.replace(/</g, "<")}</pre>`;
                    showNotification("Не удалось загрузить редактор Markdown", "warning");
                }
            } catch (error) {
                element.innerHTML = `<pre>${markdownContent.replace(/</g, "<")}</pre>`;
            }
        };


        function showAddReglamentModal() {
            const modalId = 'reglamentModal';
            const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
            const modalHTML = `
                                <div class="flex items-center justify-center min-h-full">
                                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
                                        <div class="p-6">
                                            <div class="flex justify-between items-center mb-4">
                                                <h2 class="text-xl font-bold">Добавить регламент</h2>
                                                <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                    <i class="fas fa-times text-xl"></i>
                                                </button>
                                            </div>
                                            <form id="reglamentForm">
                                                <div class="mb-4">
                                                    <label class="block text-sm font-medium mb-1" for="reglamentTitle">Название</label>
                                                    <input type="text" id="reglamentTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                </div>
                                                <div class="mb-4">
                                                    <label class="block text-sm font-medium mb-1" for="reglamentCategory">Категория</label>
                                                    <select id="reglamentCategory" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                        <option value="">Выберите категорию</option>
                                                        <option value="difficult-client">Работа с трудным клиентом</option>
                                                        <option value="tech-support">Общий регламент</option>
                                                        <option value="emergency">Чрезвычайные ситуации</option>
                                                    </select>
                                                </div>
                                                <div class="mb-4">
                                                    <label class="block text-sm font-medium mb-1" for="reglamentContent">Содержание</label>
                                                    <textarea id="reglamentContent" rows="10" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
                                                    <p class="text-sm text-gray-500 mt-1">Вы можете использовать Markdown для форматирования текста</p>
                                                </div>
                                                <div class="flex justify-end mt-6">
                                                    <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md transition mr-2">
                                                        Отмена
                                                    </button>
                                                    <button type="submit" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                                        Сохранить
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                </div>`;


            const setupAddForm = (modal) => {
                const form = modal.querySelector('#reglamentForm');
                const titleInput = modal.querySelector('#reglamentTitle');
                const categorySelect = modal.querySelector('#reglamentCategory');
                const contentTextarea = modal.querySelector('#reglamentContent');

                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const title = titleInput.value.trim();
                    const category = categorySelect.value;
                    const content = contentTextarea.value.trim();

                    if (!title || !category || !content) {
                        showNotification("Пожалуйста, заполните все обязательные поля", "error");
                        return;
                    }

                    const reglament = { title, category, content, dateAdded: new Date().toISOString() };

                    try {
                        await saveToIndexedDB('reglaments', reglament);

                        const currentCategoryTitle = document.getElementById('currentCategoryTitle');
                        if (currentCategoryTitle && !currentCategoryTitle.parentElement.classList.contains('hidden')) {
                            const activeCategoryElement = document.querySelector('.reglament-category.active');
                            if (activeCategoryElement?.dataset.category === category) {
                                showReglamentsForCategory(category);
                            }
                        }

                        showNotification("Регламент добавлен");
                        modal.classList.add('hidden');
                        form.reset();
                    } catch (error) {
                        console.error("Error saving reglament:", error);
                        showNotification("Ошибка при сохранении регламента", "error");
                    }
                });
            };

            const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupAddForm);
            modal.classList.remove('hidden');
        }


        async function showReglamentDetail(id) {
            try {
                const reglament = await getFromIndexedDB('reglaments', id);
                if (!reglament) {
                    showNotification("Регламент не найден", "error");
                    return;
                }

                const modalId = 'viewReglamentModal';
                const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
                const modalHTML = `
                                    <div class="flex items-center justify-center min-h-full">
                                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                                            <div class="p-6">
                                                <div class="flex justify-between items-center mb-4">
                                                    <h2 id="reglamentDetailTitle" class="text-2xl font-bold">Название регламента</h2>
                                                    <div class="flex">
                                                        <button id="editReglamentBtn" class="px-3 py-1 bg-primary hover:bg-secondary text-white rounded-md transition mr-2">
                                                            <i class="fas fa-edit mr-1"></i>Изменить
                                                        </button>
                                                        <button class="close-detail-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                            <i class="fas fa-times text-xl"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div id="reglamentDetailContent" class="prose dark:prose-invert max-w-none">
                                                    <!-- Content will be loaded here -->
                                                </div>
                                            </div>
                                        </div>
                                    </div>`;


                const setupDetailView = (modal) => {
                    modal.querySelector('#editReglamentBtn').addEventListener('click', () => {
                        const currentId = modal.dataset.reglamentId;
                        if (currentId) {
                            editReglament(parseInt(currentId));
                            modal.classList.add('hidden');
                        } else {
                            console.error("Reglament ID not found on detail modal.");
                            showNotification("Ошибка: Не удалось определить ID регламента для редактирования", "error");
                        }
                    });
                };

                const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupDetailView);

                modal.dataset.reglamentId = id;
                modal.querySelector('#reglamentDetailTitle').textContent = reglament.title;
                const contentElement = modal.querySelector('#reglamentDetailContent');

                contentElement.innerHTML = 'Загрузка содержимого...';
                await renderMarkdown(contentElement, reglament.content);

                modal.classList.remove('hidden');

            } catch (error) {
                console.error("Error loading reglament:", error);
                showNotification("Ошибка при загрузке регламента", "error");
            }
        }


        async function editReglament(id) {
            try {
                const reglament = await getFromIndexedDB('reglaments', id);
                if (!reglament) {
                    showNotification("Регламент не найден", "error");
                    return;
                }

                const modalId = 'editReglamentModal';
                const modalClassName = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
                const modalHTML = `
                                    <div class="flex items-center justify-center min-h-full">
                                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
                                            <div class="p-6 flex flex-col h-full max-h-[90vh]">
                                                <div class="flex justify-between items-center mb-4">
                                                    <h2 class="text-xl font-bold">Редактировать регламент</h2>
                                                    <button class="close-edit-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                        <i class="fas fa-times text-xl"></i>
                                                    </button>
                                                </div>
                                                <form id="editReglamentForm" class="flex flex-col flex-1 overflow-hidden">
                                                    <input type="hidden" id="editReglamentId">
                                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                        <div>
                                                            <label class="block text-sm font-medium mb-1" for="editReglamentTitle">Название</label>
                                                            <input type="text" id="editReglamentTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                        </div>
                                                        <div>
                                                            <label class="block text-sm font-medium mb-1" for="editReglamentCategory">Категория</label>
                                                            <select id="editReglamentCategory" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                                <option value="">Выберите категорию</option>
                                                                <option value="difficult-client">Работа с трудным клиентом</option>
                                                                <option value="tech-support">Общий регламент</option>
                                                                <option value="emergency">Чрезвычайные ситуации</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div class="mb-2 flex-1 flex flex-col overflow-hidden">
                                                        <label class="block text-sm font-medium mb-1" for="editReglamentContent">Содержание</label>
                                                        <div class="markdown-editor flex-1 flex flex-col overflow-hidden">
                                                            <div class="markdown-toolbar flex flex-wrap gap-1 mb-2 bg-gray-50 dark:bg-gray-800 p-2 rounded border border-gray-300 dark:border-gray-600">
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Полужирный" data-action="bold"><i class="fas fa-bold"></i></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Курсив" data-action="italic"><i class="fas fa-italic"></i></button>
                                                                <div class="h-6 mx-1 w-px bg-gray-300 dark:bg-gray-600"></div>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Заголовок 1" data-action="h1"><i class="fas fa-heading"></i><span class="text-xs">1</span></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Заголовок 2" data-action="h2"><i class="fas fa-heading"></i><span class="text-xs">2</span></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Заголовок 3" data-action="h3"><i class="fas fa-heading"></i><span class="text-xs">3</span></button>
                                                                <div class="h-6 mx-1 w-px bg-gray-300 dark:bg-gray-600"></div>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Маркированный список" data-action="ulist"><i class="fas fa-list-ul"></i></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Нумерованный список" data-action="olist"><i class="fas fa-list-ol"></i></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Задача" data-action="task"><i class="fas fa-tasks"></i></button>
                                                                <div class="h-6 mx-1 w-px bg-gray-300 dark:bg-gray-600"></div>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Ссылка" data-action="link"><i class="fas fa-link"></i></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Цитата" data-action="quote"><i class="fas fa-quote-right"></i></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Код" data-action="code"><i class="fas fa-code"></i></button>
                                                                <button type="button" class="md-btn p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Таблица" data-action="table"><i class="fas fa-table"></i></button>
                                                                <div class="ml-auto">
                                                                    <div class="flex items-center">
                                                                        <input type="checkbox" id="editorPreviewToggle" class="mr-2">
                                                                        <label for="editorPreviewToggle" class="text-sm cursor-pointer">Предпросмотр</label>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div class="editor-container flex-1 flex flex-col md:flex-row min-h-[200px] md:h-[400px] overflow-hidden">
                                                                <div id="markdownEditorWrapper" class="flex-1 h-full md:h-auto overflow-hidden">
                                                                    <textarea id="editReglamentContent" class="w-full h-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base font-mono resize-none"></textarea>
                                                                </div>
                                                                <div id="markdownPreview" class="hidden md:w-1/2 md:ml-4 h-full md:h-auto overflow-auto bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md p-4">
                                                                    <!-- Preview content will be shown here -->
                                                                </div>
                                                            </div>
                                                            <p class="text-sm text-gray-500 mt-2 flex items-center">
                                                                <i class="fas fa-info-circle mr-1"></i>
                                                                <span>Поддерживается синтаксис Markdown для форматирования текста</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div class="flex justify-between mt-auto pt-4">
                                                        <button type="button" id="deleteReglamentBtn" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition">
                                                            <i class="fas fa-trash mr-1"></i>Удалить
                                                        </button>
                                                        <div>
                                                            <button type="button" id="addSampleTextBtn" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition mr-2">
                                                                <i class="fas fa-puzzle-piece mr-1"></i>Вставить шаблон
                                                            </button>
                                                            <button type="button" class="cancel-edit-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md transition mr-2">
                                                                Отмена
                                                            </button>
                                                            <button type="submit" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">
                                                                <i class="fas fa-save mr-1"></i>Сохранить
                                                            </button>
                                                        </div>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>`;


                const setupEditForm = (modal) => {
                    const form = modal.querySelector('#editReglamentForm');
                    const idInput = modal.querySelector('#editReglamentId');
                    const titleInput = modal.querySelector('#editReglamentTitle');
                    const categorySelect = modal.querySelector('#editReglamentCategory');
                    const contentTextarea = modal.querySelector('#editReglamentContent');
                    const previewToggle = modal.querySelector('#editorPreviewToggle');
                    const markdownEditorWrapper = modal.querySelector('#markdownEditorWrapper');
                    const markdownPreview = modal.querySelector('#markdownPreview');
                    const deleteButton = modal.querySelector('#deleteReglamentBtn');
                    const addSampleTextBtn = modal.querySelector('#addSampleTextBtn');

                    initMarkdownEditor(modal);

                    previewToggle.addEventListener('change', () => {
                        const showPreview = previewToggle.checked;
                        markdownPreview.classList.toggle('hidden', !showPreview);
                        markdownEditorWrapper.classList.toggle('md:w-1/2', showPreview);
                        markdownEditorWrapper.classList.toggle('md:w-full', !showPreview);
                        if (showPreview) {
                            updateMarkdownPreview(modal);
                        }
                    });

                    addSampleTextBtn.addEventListener('click', () => addSampleTextToEditor(modal));

                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const currentId = idInput.value;
                        const title = titleInput.value.trim();
                        const category = categorySelect.value;
                        const content = contentTextarea.value.trim();

                        if (!title || !category || !content) {
                            showNotification("Пожалуйста, заполните все обязательные поля", "error");
                            return;
                        }

                        try {
                            const existingReglament = await getFromIndexedDB('reglaments', parseInt(currentId));
                            if (!existingReglament) throw new Error("Original reglament not found for update.");

                            const updatedReglament = {
                                ...existingReglament,
                                id: parseInt(currentId),
                                title,
                                category,
                                content,
                                dateUpdated: new Date().toISOString()
                            };

                            await saveToIndexedDB('reglaments', updatedReglament);

                            const currentCategoryTitle = document.getElementById('currentCategoryTitle');
                            if (currentCategoryTitle && !currentCategoryTitle.parentElement.classList.contains('hidden')) {
                                const displayedCategory = document.querySelector('.reglament-category.active')?.dataset.category;
                                if (displayedCategory && (displayedCategory === category || displayedCategory === existingReglament.category)) {
                                    showReglamentsForCategory(displayedCategory);
                                }
                            }

                            showNotification("Регламент обновлен");
                            modal.classList.add('hidden');
                        } catch (error) {
                            console.error("Error updating reglament:", error);
                            showNotification("Ошибка при обновлении регламента", "error");
                        }
                    });

                    deleteButton.addEventListener('click', async () => {
                        const currentId = parseInt(idInput.value);
                        if (confirm("Вы уверены, что хотите удалить этот регламент?")) {
                            try {
                                const reglamentToDelete = await getFromIndexedDB('reglaments', currentId);
                                const originalCategory = reglamentToDelete?.category;

                                await deleteFromIndexedDB('reglaments', currentId);

                                const currentCategoryTitle = document.getElementById('currentCategoryTitle');
                                if (originalCategory && currentCategoryTitle && !currentCategoryTitle.parentElement.classList.contains('hidden')) {
                                    const displayedCategory = document.querySelector('.reglament-category.active')?.dataset.category;
                                    if (displayedCategory === originalCategory) {
                                        showReglamentsForCategory(displayedCategory);
                                    }
                                }

                                showNotification("Регламент удален");
                                modal.classList.add('hidden');
                            } catch (error) {
                                console.error("Error deleting reglament:", error);
                                showNotification("Ошибка при удалении регламента", "error");
                            }
                        }
                    });
                };

                const modal = getOrCreateModal(modalId, modalClassName, modalHTML, setupEditForm);

                modal.querySelector('#editReglamentId').value = reglament.id;
                modal.querySelector('#editReglamentTitle').value = reglament.title;
                modal.querySelector('#editReglamentCategory').value = reglament.category;
                modal.querySelector('#editReglamentContent').value = reglament.content;

                const previewToggle = modal.querySelector('#editorPreviewToggle');
                const markdownEditorWrapper = modal.querySelector('#markdownEditorWrapper');
                const markdownPreview = modal.querySelector('#markdownPreview');
                const showPreview = previewToggle.checked;
                markdownPreview.classList.toggle('hidden', !showPreview);
                markdownEditorWrapper.classList.toggle('md:w-1/2', showPreview);
                markdownEditorWrapper.classList.toggle('md:w-full', !showPreview);
                if (showPreview) {
                    updateMarkdownPreview(modal);
                }

                modal.classList.remove('hidden');

            } catch (error) {
                console.error("Error loading reglament for edit:", error);
                showNotification("Ошибка при загрузке регламента для редактирования", "error");
            }
        }


        function initMarkdownEditor(modal) {
            const textarea = modal.querySelector('#editReglamentContent');
            const mdButtons = modal.querySelectorAll('.md-btn');

            mdButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const action = button.dataset.action;
                    applyMarkdownFormat(textarea, action);
                    updateMarkdownPreview(modal);
                });
            });

            textarea.addEventListener('input', () => {
                const previewToggle = modal.querySelector('#editorPreviewToggle');
                if (previewToggle?.checked) {
                    updateMarkdownPreview(modal);
                }
            });
        }


        function applyMarkdownFormat(textarea, action) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);
            let prefix = '', suffix = '', replacement = '';
            const currentLineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
            const currentLine = textarea.value.substring(currentLineStart, start).trim() ? textarea.value.substring(currentLineStart) : '';

            switch (action) {
                case 'bold': prefix = '**'; suffix = '**'; break;
                case 'italic': prefix = '*'; suffix = '*'; break;
                case 'h1': prefix = '# '; break;
                case 'h2': prefix = '## '; break;
                case 'h3': prefix = '### '; break;
                case 'ulist': prefix = '- '; break;
                case 'olist': prefix = '1. '; break;
                case 'task': prefix = '- [ ] '; break;
                case 'link':
                    replacement = selectedText.trim().startsWith('http')
                        ? `[Ссылка](${selectedText})`
                        : `[${selectedText || 'Текст ссылки'}](https://)`;
                    break;
                case 'quote': prefix = '> '; break;
                case 'code': prefix = '`'; suffix = '`'; break;
                case 'table':
                    replacement = `| Заголовок 1 | Заголовок 2 |\n|------------|------------|\n| Ячейка 1   | Ячейка 2   |\n| Ячейка 4   | Ячейка 5   |`;
                    break;
            }

            textarea.focus();

            if (['h1', 'h2', 'h3', 'ulist', 'olist', 'task', 'quote'].includes(action)) {
                const lines = textarea.value.substring(start, end).split('\n');
                const actualStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
                let actualEnd = textarea.value.indexOf('\n', end);
                if (actualEnd === -1) actualEnd = textarea.value.length;
                else if (end === actualStart) actualEnd = start;

                const textToModify = textarea.value.substring(actualStart, actualEnd);
                const modifiedLines = textToModify.split('\n').map((line, index) => {
                    if (!line.trim() && lines.length > 1) return '';
                    line = line.replace(/^(\d+\.|-|\*|>|- \[.?\])\s*/, '');
                    if (action === 'olist') return `${index + 1}. ${line}`;
                    return `${prefix}${line}`;
                }).join('\n');

                textarea.setRangeText(modifiedLines, actualStart, actualEnd, 'select');

            } else if (replacement) {
                textarea.setRangeText(replacement, start, end, 'select');
            } else if (prefix || suffix) {
                const currentText = textarea.value;
                const textBefore = currentText.substring(start - prefix.length, start);
                const textAfter = currentText.substring(end, end + suffix.length);

                if (textBefore === prefix && textAfter === suffix) {
                    textarea.setRangeText(selectedText, start - prefix.length, end + suffix.length, 'select');
                } else {
                    textarea.setRangeText(`${prefix}${selectedText}${suffix}`, start, end, 'select');
                }
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }


        async function updateMarkdownPreview(modal) {
            const textarea = modal.querySelector('#editReglamentContent');
            const previewElement = modal.querySelector('#markdownPreview');
            if (!textarea || !previewElement || previewElement.classList.contains('hidden')) return;

            const markdownContent = textarea.value;
            previewElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Обновление...</div>';

            await renderMarkdown(previewElement, markdownContent);
        }


        function addSampleTextToEditor(modalContext = null) {
            const editorTextarea = document.getElementById('editReglamentContent');
            if (!editorTextarea) {
                console.error("Editor textarea not found");
                return;
            }

            const samples = [
                {
                    title: "Регламент обработки звонков в технической поддержке",
                    content: `## Приветствие\n\n*   Разговор необходимо начать с четкого и доброжелательного приветствия.\n*   Обязательно озвучивать название технической поддержки сервиса, свое имя и приветствие («Техническая поддержка сервиса …….., меня зовут ….., здравствуйте!»).\n\n## Идентификация клиента\n\n*   Необходимо провести первичную идентификацию клиента, это обязательно для каждого входящего звонка.\n*   Уточните ИНН или другой реквизит, по которому можно определить ИНН (например, наименование организации, рег.номер СФР, СНИЛС подписанта по учётной записи и т.д.).\n*   Если по данному ИНН зарегистрировано несколько организаций, уточните также КПП.\n*   Если система Манго автоматически отобразила данные об организации, подтвердите отображенную информацию («Уточните, пожалуйста, Вы обращаетесь по вопросу компании «Северный путь»»).\n*   В некоторых случаях может потребоваться дополнительная идентификация (например, первые символы id учетной записи клиента).\n*   Если клиент отказывается предоставить ИНН или любой другой возможный реквизит, оператор может пропустить идентификацию и приступить к консультации, если это представляется возможным.\n\n## Выявление причины обращения\n\n*   Необходимо четко, последовательно, подробно выявить причину обращения и суть вопроса клиента, если первоначальной информации недостаточно.\n*   Задайте уточняющие вопросы:\n    *   "Уточните, пожалуйста, какой у вас вопрос?"\n    *   "Какая именно ошибка возникает? Прочтите, пожалуйста, текст ошибки"\n    *   "При каких действиях возникает ошибка?"\n\n## Предоставление консультации и решение проблемы (если компетентен)\n\n1.  **Стиль общения:** Диалог необходимо вести бодрым, уверенным голосом, с четким произношением, тоном без раздражения и в умеренном темпе, внятно.\n2.  **Грамотность:** Необходимо использовать грамотную, четкую, ясную и точную информацию в официально-деловом стиле. Избегайте грамматических и логических ошибок, неверных окончаний и ударений, уменьшительно-ласкательных суффиксов, сленга и просторечий.\n3.  **Чистота речи:** Необходимо обеспечить чистоту речи, избегать междометий, слов-паразитов, личных оценок, внутренних терминов.\n4.  **Вовлеченность:** Необходимо проявлять вовлеченность в диалог (активное слушание, отсутствие длительных пауз), поддерживать инициативу на своей стороне, не перебивать клиента, использовать развернутые ответы при необходимости.\n5.  **Комфорт и этикет:** Необходимо создавать комфорт в беседе, соблюдать речевой этикет (фразы вежливости).\n6.  **Паузы:** Необходимо избегать длительных пауз без предупреждения (более 5 секунд). Также следует избегать трех и более коротких пауз без предупреждения.\n7.  **Ожидание (Уточнение):** Если необходимо время для уточнения информации, предупредите клиента и попросите оставаться на линии, используя вежливые фразы, например: «Оставайтесь, пожалуйста, на линии, я уточню для Вас информацию».\n8.  **Возвращение после ожидания:** При возвращении после уточнения информации, поблагодарите клиента за ожидание, например: «Спасибо за ожидание, ...». Если для проверки информации требуется больше времени (свыше 120 секунд), сообщите об этом клиенту.\n9.  **Точность и полнота:** Необходим быстрый и точный поиск информации, информацию нужно предоставлять в полном объеме, избегать односложных ответов.\n10. **Удаленное подключение:** На удаленном подключении необходимо комментировать все проводимые действия.\n11. **Предупреждение о последствиях:** При выполнении определенных действий (например, удаление криптопровайдера) необходимо предупредить клиента о возможных последствиях, предложить создать точку восстановления ОС, убедиться в сохранности важных данных.\n\n## Завершение разговора\n\n1.  **Резюмирование:** При возникновении небольшой паузы после консультации, если клиент не завершает разговор, необходимо резюмировать итоги консультации в виде вопроса («На данный момент у Вас остались ещё вопросы?») или через подведения итога консультации.\n2.  **Прощание:** Стандартные фразы прощания: для входящего звонка - «Спасибо за обращение, всего доброго, до свидания!», для исходящего - «Спасибо за уделенное время, всего доброго, до свидания». Допускаются вариации («Спасибо за Ваш звонок»).\n3.  **Обязательность прощания:** Прощание является обязательным, за исключением случаев, когда от клиента не поступил ответ на вопрос о слышимости, консультация не окончена или у оператора не было возможности попрощаться по техническим причинам.`
                },

                {
                    title: "Частые проблемы и решения",
                    content: `# Часто возникающие проблемы и их решения\n\n## Проблемы при настройке 1С-Отчетности\n\n### Проблема: Ошибка при установке криптопровайдера\n\n**Симптомы:**\n- Появляется сообщение "Ошибка установки компонента безопасности"\n- В логах присутствуют записи об ошибке доступа\n\n**Решение:**\n1. Закройте все приложения 1С\n2. Запустите установку от имени администратора\n3. Временно отключите антивирус\n4. Проверьте, нет ли конфликтующих СКЗИ\n\n> **Примечание:** Если проблема сохраняется, необходимо проверить системный журнал Windows.\n\n## Проблемы при отправке отчетности\n\n### Проблема: Ошибка "Сервер временно недоступен"\n\n**Возможные причины:**\n- [ ] Проблемы с подключением к интернету\n- [ ] Профилактические работы на сервере контролирующего органа\n- [ ] Неверные настройки прокси-сервера\n\n**Диагностика и решение:**\n\n1. Проверьте доступность интернета\n2. Проверьте статус серверов на сайте службы поддержки\n3. Проверьте настройки прокси в программе\n\n### Таблица кодов ошибок\n\n| Код ошибки | Описание | Решение |\n|------------|----------|---------|\n| 1001 | Ошибка подключения | Проверить интернет |\n| 1002 | Ошибка аутентификации | Проверить сертификат |\n| 1003 | Ошибка формата файла | Проверить формат файла |`
                },

                {
                    title: "Регламент проведения обновления",
                    content: `# Регламент проведения обновления системы\n\n## Подготовительные мероприятия\n\n### 1. Уведомление пользователей\n- Отправьте уведомления всем пользователям за 3 дня до обновления\n- Укажите точное время и ожидаемую продолжительность работ\n- Опишите, какие изменения будут внесены\n\n### 2. Резервное копирование\n- [ ] Создать полную резервную копию базы данных\n- [ ] Проверить целостность резервной копии\n- [ ] Сохранить копию на отдельном физическом носителе\n\n### 3. Тестирование обновления\n- Развернуть тестовую среду\n- Выполнить обновление в тестовой среде\n- Проверить основные бизнес-процессы после обновления\n\n## Процедура обновления\n\n> **Внимание!** Обновление должно проводиться в нерабочее время.\n\n1. **Подготовка** (30 минут):\n- Остановка сервера приложений\n- Отключение всех пользователей от системы\n- Проверка резервной копии\n\n2. **Обновление** (1-2 часа):\n- Установка обновлений в соответствии с инструкцией\n- Обновление схемы базы данных\n- Миграция данных (при необходимости)\n\n3. **Проверка** (1 час):\n- Запуск сервера приложений\n- Проверка основных функций системы\n- Тестирование критичных бизнес-процессов\n\n## Действия при возникновении проблем\n\n| Проблема | Действия | Ответственный |\n|----------|----------|---------------|\n| Ошибка обновления БД | Восстановление из резервной копии | Администратор БД |\n| Ошибка запуска сервера | Анализ логов, откат изменений | Системный администратор |\n| Ошибки в работе приложения | Исправление конфигурации, применение патчей | Разработчик |\n\n## Завершение работ\n\n- Отправьте уведомление об успешном завершении обновления\n- Обновите документацию системы\n- Проведите обучение пользователей по новым функциям`
                }
            ];

            const sampleModalId = 'sampleTextModal';
            document.getElementById(sampleModalId)?.remove();

            const modal = document.createElement('div');
            modal.id = sampleModalId;
            modal.className = 'fixed inset-0 bg-black bg-opacity-60 z-[60] p-4 flex items-center justify-center';
            modal.innerHTML = `
                                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
                                    <div class="p-6">
                                        <div class="flex justify-between items-center mb-4">
                                            <h2 class="text-xl font-bold">Выберите шаблон</h2>
                                            <button class="close-sample-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                <i class="fas fa-times text-xl"></i>
                                            </button>
                                        </div>
                                        <div class="sample-list space-y-3 max-h-96 overflow-y-auto">
                                            ${samples.map((sample, index) => `
                                                <div class="sample-item bg-gray-50 dark:bg-gray-700 p-4 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition duration-150" data-index="${index}">
                                                    <h3 class="font-bold text-lg pointer-events-none">${sample.title}</h3>
                                                    <p class="text-gray-600 dark:text-gray-400 text-sm mt-1 pointer-events-none">Нажмите, чтобы использовать этот шаблон</p>
                                                </div>
                                            `).join('')}
                                        </div>
                                        <div class="mt-6 flex justify-end">
                                            <button class="close-sample-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md transition">
                                                Отмена
                                            </button>
                                        </div>
                                    </div>
                                </div>`;

            modal.addEventListener('click', (event) => {
                const target = event.target;
                if (target.closest('.close-sample-modal')) {
                    modal.remove();
                    return;
                }
                const sampleItem = target.closest('.sample-item');
                if (sampleItem) {
                    const index = parseInt(sampleItem.dataset.index);
                    if (samples[index]) {
                        if (confirm('Вставить выбранный шаблон? Текущее содержимое будет заменено.')) {
                            editorTextarea.value = samples[index].content;
                            if (modalContext) {
                                updateMarkdownPreview(modalContext);
                                editorTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                            }
                            modal.remove();
                        }
                    }
                }
            });

            document.body.appendChild(modal);
        }


        // СИСТЕМА ВНЕШНИХ РЕСУРСОВ
        async function loadExtLinks() {
            const extLinksContainer = document.getElementById('extLinksContainer');
            if (!extLinksContainer) return;

            try {
                let extLinks = await getAllFromIndexedDB('extLinks');

                if (!extLinks?.length) {
                    const sampleExtLinks = [

                        {
                            title: 'ЕГРЮЛ',
                            url: 'https://egrul.nalog.ru/',
                            description: 'Чекни инфу по орге',
                            category: 'gov'
                        },

                        {
                            title: 'Портал ИТС 1С',
                            url: 'https://its.1c.ru/',
                            description: 'Инфа по 1ЭС',
                            category: 'docs'
                        },

                        {
                            title: 'Track Astral',
                            url: 'https://track.astral.ru/support/display/Support1CO',
                            description: 'Знания древних...',
                            category: 'docs'
                        },

                        {
                            title: 'База (знаний) Astral',
                            url: 'https://astral.ru/help/1s-otchetnost/',
                            description: 'Инфа для обычных людишек...',
                            category: 'docs'
                        }
                    ];
                    await Promise.all(sampleExtLinks.map(link => saveToIndexedDB('extLinks', link)));
                    extLinks = await getAllFromIndexedDB('extLinks');
                }

                renderExtLinks(extLinks);
            } catch (error) {
                console.error('Error loading external links:', error);
                extLinksContainer.textContent = 'Ошибка при загрузке внешних ресурсов';
                extLinksContainer.className = 'text-center py-6 text-gray-500';
            }
        }


        function renderExtLinks(links) {
            const extLinksContainer = document.getElementById('extLinksContainer');
            if (!extLinksContainer) return;

            extLinksContainer.innerHTML = '';

            if (!links?.length) {
                extLinksContainer.innerHTML = '<div class="col-span-full text-center py-6 text-gray-500">Нет внешних ресурсов</div>';
                applyCurrentView('extLinksContainer');
                return;
            }

            const categoryMap = {
                docs: { name: 'Документация', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: 'fa-file-alt' },
                gov: { name: 'Гос. сайты', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: 'fa-landmark' },
                tools: { name: 'Инструменты', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: 'fa-tools' },
                default: { name: 'Прочее', color: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300', icon: 'fa-link' }
            };

            const fragment = document.createDocumentFragment();

            links.forEach(link => {
                const linkElement = document.createElement('div');
                linkElement.className = 'ext-link-item view-item';
                linkElement.dataset.id = link.id;
                const categoryKey = link.category && categoryMap[link.category] ? link.category : 'default';
                const categoryData = categoryMap[categoryKey];
                linkElement.dataset.category = link.category || '';

                const categoryBadge = link.category
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs ${categoryData.color} whitespace-nowrap"><i class="fas ${categoryData.icon} mr-1"></i>${categoryData.name}</span>`
                    : '';

                linkElement.innerHTML = `
                                            <div class="flex-grow min-w-0 mr-3">
                                                <h3 class="font-bold text-lg truncate" title="${link.title}">${link.title}</h3>
                                                <p class="ext-link-description text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">${link.description || ''}</p>
                                                <div class="ext-link-meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    ${categoryBadge}
                                                    <a href="${link.url}" target="_blank" class="ext-link-url inline-flex items-center text-primary hover:underline text-sm">
                                                        <i class="fas fa-external-link-alt mr-1"></i>Открыть
                                                    </a>
                                                </div>
                                            </div>
                                            <div class="flex flex-shrink-0 items-center">
                                                <button class="edit-ext-link p-1 text-gray-500 hover:text-primary" title="Редактировать"><i class="fas fa-edit"></i></button>
                                                <button class="delete-ext-link p-1 text-gray-500 hover:text-red-500 ml-1" title="Удалить"><i class="fas fa-trash"></i></button>
                                            </div>
                                        `;

                linkElement.querySelector('.edit-ext-link')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showEditExtLinkModal(link.id);
                });

                linkElement.querySelector('.delete-ext-link')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Вы уверены, что хотите удалить этот ресурс?')) {
                        deleteExtLink(link.id);
                    }
                });

                linkElement.addEventListener('click', (e) => {
                    if (!e.target.closest('button, a.ext-link-url')) {
                        console.log("Клик по карточке внешнего ресурса:", link.id);
                    }
                });

                fragment.appendChild(linkElement);
            });

            extLinksContainer.appendChild(fragment);
            applyCurrentView('extLinksContainer');
        }


        function filterExtLinks() {
            const searchInput = document.getElementById('extLinkSearchInput');
            const categoryFilter = document.getElementById('extLinkCategoryFilter');
            const linkItems = document.querySelectorAll('.ext-link-item');

            if (!searchInput || !categoryFilter || !linkItems.length) return;

            const searchValue = searchInput.value.trim().toLowerCase();
            const categoryValue = categoryFilter.value;

            linkItems.forEach(item => {
                const title = item.querySelector('h3')?.textContent.trim().toLowerCase() || '';
                const description = item.querySelector('p.ext-link-description')?.textContent.trim().toLowerCase() || '';
                const category = item.dataset.category || '';

                const matchesSearch = !searchValue || title.includes(searchValue) || description.includes(searchValue);
                const matchesCategory = !categoryValue || category === categoryValue;

                item.hidden = !(matchesSearch && matchesCategory);
            });
        }


        function ensureExtLinkModal() {
            let modal = document.getElementById('extLinkModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'extLinkModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4';
                modal.innerHTML = `
                                    <div class="flex items-center justify-center min-h-full">
                                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                                            <div class="p-6">
                                                <div class="flex justify-between items-center mb-4">
                                                    <h2 class="text-xl font-bold" id="extLinkModalTitle"></h2>
                                                    <button class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                        <i class="fas fa-times text-xl"></i>
                                                    </button>
                                                </div>
                                                <form id="extLinkForm">
                                                    <input type="hidden" id="extLinkId">
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="extLinkTitle">Название</label>
                                                        <input type="text" id="extLinkTitle" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="extLinkUrl">URL</label>
                                                        <input type="url" id="extLinkUrl" required class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="extLinkDescription">Описание</label>
                                                        <textarea id="extLinkDescription" rows="3" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base"></textarea>
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block text-sm font-medium mb-1" for="extLinkCategory">Категория</label>
                                                        <select id="extLinkCategory" class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-base">
                                                            <option value="">Без категории</option>
                                                            <option value="docs">Документация</option>
                                                            <option value="gov">Государственные сайты</option>
                                                            <option value="tools">Инструменты</option>
                                                            <option value="other">Прочее</option>
                                                        </select>
                                                    </div>
                                                    <div class="flex justify-end mt-6">
                                                        <button type="button" class="cancel-modal px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md transition mr-2">Отмена</button>
                                                        <button type="submit" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition">Сохранить</button>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                    `;
                document.body.appendChild(modal);

                const closeModal = () => modal.classList.add('hidden');
                modal.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => btn.addEventListener('click', closeModal));

                const form = modal.querySelector('#extLinkForm');
                form?.addEventListener('submit', handleExtLinkFormSubmit);
            }

            return {
                modal,
                form: modal.querySelector('#extLinkForm'),
                titleEl: modal.querySelector('#extLinkModalTitle'),
                idInput: modal.querySelector('#extLinkId'),
                titleInput: modal.querySelector('#extLinkTitle'),
                urlInput: modal.querySelector('#extLinkUrl'),
                descriptionInput: modal.querySelector('#extLinkDescription'),
                categoryInput: modal.querySelector('#extLinkCategory')
            };
        }


        async function handleExtLinkFormSubmit(e) {
            e.preventDefault();
            const modalElements = ensureExtLinkModal();
            const { modal, idInput, titleInput, urlInput, descriptionInput, categoryInput } = modalElements;

            const id = idInput.value;
            const title = titleInput.value.trim();
            const url = urlInput.value.trim();

            if (!title || !url) {
                showNotification("Пожалуйста, заполните Название и URL", "error");
                return;
            }

            try {
                const linkData = {
                    title,
                    url,
                    description: descriptionInput.value.trim() || null,
                    category: categoryInput.value || null
                };

                if (id) {
                    linkData.id = parseInt(id, 10);
                    linkData.dateUpdated = new Date().toISOString();
                } else {
                    linkData.dateAdded = new Date().toISOString();
                }

                await saveToIndexedDB('extLinks', linkData);
                const updatedLinks = await getAllFromIndexedDB('extLinks');
                renderExtLinks(updatedLinks);

                showNotification(id ? "Ресурс обновлен" : "Ресурс добавлен");
                modal.classList.add('hidden');

            } catch (error) {
                console.error("Error saving external link:", error);
                showNotification("Ошибка при сохранении", "error");
            }
        }


        function showAddExtLinkModal() {
            const { modal, form, titleEl, idInput } = ensureExtLinkModal();
            form.reset();
            idInput.value = '';
            titleEl.textContent = 'Добавить внешний ресурс';
            modal.classList.remove('hidden');
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
            try {
                await deleteFromIndexedDB('extLinks', id);
                const links = await getAllFromIndexedDB('extLinks');
                renderExtLinks(links);
                showNotification("Ресурс удален");
            } catch (error) {
                console.error("Error deleting external link:", error);
                showNotification("Ошибка при удалении", "error");
            }
        }


        // СИСТЕМА КАСТОМИЗАЦИИ UI
        function initUICustomization() {
            const getElem = (id) => document.getElementById(id);
            const customizeUIBtn = getElem('customizeUIBtn');
            const customizeUIModal = getElem('customizeUIModal');
            const closeCustomizeUIModalBtn = getElem('closeCustomizeUIModalBtn');
            const saveUISettingsBtn = getElem('saveUISettingsBtn');
            const cancelUISettingsBtn = getElem('cancelUISettingsBtn');
            const resetUISettingsBtn = getElem('resetUISettingsBtn');
            const panelSortContainer = getElem('panelSortContainer');
            const decreaseFontBtn = getElem('decreaseFontBtn');
            const increaseFontBtn = getElem('increaseFontBtn');
            const resetFontBtn = getElem('resetFontBtn');
            const fontSizeLabel = getElem('fontSizeLabel');
            const borderRadiusSlider = getElem('borderRadiusSlider');
            const densitySlider = getElem('densitySlider');
            const querySel = (selector) => document.querySelector(selector);
            const querySelAll = (selector) => document.querySelectorAll(selector);
            const mainContentGrid = querySel('#mainContent > div');

            if (!customizeUIBtn || !customizeUIModal) return;

            const closeModal = () => customizeUIModal.classList.add('hidden');
            const openModal = () => {
                loadUISettings();
                customizeUIModal.classList.remove('hidden');
            };
            const setFontSize = (size) => {
                document.documentElement.style.fontSize = `${size}%`;
                if (fontSizeLabel) fontSizeLabel.textContent = `${size}%`;
            };
            const initSortableIfNeeded = (container) => {
                if (!container) return;
                const sortableOptions = { animation: 150, handle: '.fa-grip-lines', ghostClass: 'my-sortable-ghost' };

                if (window.Sortable) {
                    new Sortable(container, sortableOptions);
                } else if (!document.querySelector('script[src*="sortable"]')) {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.14.0/Sortable.min.js';
                    script.onload = () => new Sortable(container, sortableOptions);
                    script.onerror = () => console.error("Failed to load Sortable.js");
                    document.head.appendChild(script);
                }
            };

            customizeUIBtn.addEventListener('click', openModal);
            [closeCustomizeUIModalBtn, cancelUISettingsBtn].forEach(btn => btn?.addEventListener('click', closeModal));

            saveUISettingsBtn?.addEventListener('click', () => {
                saveUISettings();
                closeModal();
                showNotification("Настройки интерфейса сохранены");
                applyUISettings();
            });

            resetUISettingsBtn?.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите сбросить все настройки интерфейса?')) {
                    resetUISettings();
                    loadUISettings();
                    showNotification("Настройки интерфейса сброшены");
                }
            });

            initSortableIfNeeded(panelSortContainer);

            customizeUIModal.addEventListener('click', (e) => {
                const toggleBtn = e.target.closest('.toggle-visibility');
                if (toggleBtn) {
                    const icon = toggleBtn.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('fa-eye');
                        icon.classList.toggle('fa-eye-slash');
                    }
                    return;
                }

                const swatch = e.target.closest('.color-swatch');
                if (swatch) {
                    customizeUIModal.querySelectorAll('.color-swatch').forEach(s => {
                        s.classList.remove('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary', 'border-black', 'dark:border-white');
                        s.classList.add('border-2', 'border-transparent');
                    });
                    swatch.classList.remove('border-transparent');
                    swatch.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');

                    const primaryColor = swatch.getAttribute('data-color');
                    if (primaryColor) {
                        const secondaryColor = calculateSecondaryColor(primaryColor);
                        document.documentElement.style.setProperty('--color-primary', primaryColor);
                        document.documentElement.style.setProperty('--color-secondary', secondaryColor);
                        try {
                            if (window.tailwind?.config?.theme?.extend?.colors) {
                                window.tailwind.config.theme.extend.colors.primary = `var(--color-primary)`;
                                window.tailwind.config.theme.extend.colors.secondary = `var(--color-secondary)`;
                                window.tailwind.config.theme.extend.colors.blue.DEFAULT = `var(--color-primary)`;
                            }
                        } catch (err) {
                            console.warn("Could not update live Tailwind config for preview:", err?.message);
                        }
                    }
                    return;
                }
            });


            if (decreaseFontBtn && increaseFontBtn && resetFontBtn) {
                decreaseFontBtn.addEventListener('click', () => {
                    const currentSize = parseInt(document.documentElement.style.fontSize || '100');
                    if (currentSize > 70) setFontSize(currentSize - 10);
                });
                increaseFontBtn.addEventListener('click', () => {
                    const currentSize = parseInt(document.documentElement.style.fontSize || '100');
                    if (currentSize < 150) setFontSize(currentSize + 10);
                });
                resetFontBtn.addEventListener('click', () => setFontSize(100));
            }

            borderRadiusSlider?.addEventListener('input', () => {
                document.documentElement.style.setProperty('--border-radius', `${borderRadiusSlider.value}px`);
            });

            densitySlider?.addEventListener('input', () => {
                const spacing = 0.5 + (parseFloat(densitySlider.value) * 0.25);
                document.documentElement.style.setProperty('--content-spacing', `${spacing}rem`);
            });

            querySelAll('input[name="mainLayout"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    if (mainContentGrid) {
                        const isVertical = radio.value === 'vertical';
                        mainContentGrid.classList.toggle('grid-cols-1', isVertical);
                        mainContentGrid.classList.toggle('md:grid-cols-2', !isVertical);
                    }
                });
            });

            querySelAll('input[name="themeMode"]').forEach(radio => {
                radio.addEventListener('change', () => setTheme(radio.value));
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


        async function resetUISettings() {
            console.log("Resetting UI settings...");
            try {
                if (db) {
                    await deleteFromIndexedDB('preferences', 'uiSettings');
                    console.log("Cleared UI settings from IndexedDB.");
                } else {
                    console.warn("DB not available, cannot clear stored UI settings.");
                }

                const { style } = document.documentElement;
                const defaultPrimary = DEFAULT_UI_SETTINGS.primaryColor;
                const defaultSecondary = calculateSecondaryColor(defaultPrimary);

                style.setProperty('--color-primary', defaultPrimary);
                style.setProperty('--color-secondary', defaultSecondary);
                style.fontSize = `${DEFAULT_UI_SETTINGS.fontSize}%`;
                style.setProperty('--border-radius', `${DEFAULT_UI_SETTINGS.borderRadius}px`);
                const spacing = 0.5 + (DEFAULT_UI_SETTINGS.contentDensity * 0.25);
                style.setProperty('--content-spacing', `${spacing.toFixed(3)}rem`);

                setTheme(DEFAULT_UI_SETTINGS.themeMode);

                applyPanelSettings(null, null);

                const customizeUIModal = document.getElementById('customizeUIModal');
                if (customizeUIModal && !customizeUIModal.classList.contains('hidden')) {
                    console.log("Resetting controls inside the UI Customization modal to new defaults.");
                    const defaultLayout = customizeUIModal.querySelector(`input[name="mainLayout"][value="${DEFAULT_UI_SETTINGS.mainLayout}"]`);
                    if (defaultLayout) defaultLayout.checked = true;
                    const defaultTheme = customizeUIModal.querySelector(`input[name="themeMode"][value="${DEFAULT_UI_SETTINGS.themeMode}"]`);
                    if (defaultTheme) defaultTheme.checked = true;

                    customizeUIModal.querySelectorAll('.color-swatch').forEach(s => {
                        s.classList.remove('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary', 'border-black', 'dark:border-white');
                        s.classList.add('border-2', 'border-transparent');
                    });
                    const defaultColorSwatch = customizeUIModal.querySelector(`.color-swatch[data-color="${defaultPrimary}"]`);
                    if (defaultColorSwatch) {
                        defaultColorSwatch.classList.remove('border-transparent');
                        defaultColorSwatch.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-gray-800', 'ring-primary');
                    }

                    const fontSizeLabel = customizeUIModal.querySelector('#fontSizeLabel');
                    if (fontSizeLabel) fontSizeLabel.textContent = `${DEFAULT_UI_SETTINGS.fontSize}%`;
                    const borderRadiusSlider = customizeUIModal.querySelector('#borderRadiusSlider');
                    if (borderRadiusSlider) borderRadiusSlider.value = DEFAULT_UI_SETTINGS.borderRadius;
                    const densitySlider = customizeUIModal.querySelector('#densitySlider');
                    if (densitySlider) densitySlider.value = DEFAULT_UI_SETTINGS.contentDensity;

                    const panelSortContainer = customizeUIModal.querySelector('#panelSortContainer');
                    if (panelSortContainer) {
                    }
                }
                try {
                    if (window.tailwind?.config?.theme?.extend?.colors) {
                    }
                } catch (e) {
                    console.warn("Could not reset Tailwind config (might be normal):", e?.message);
                }

                console.log("UI settings reset complete.");
                return true;
            } catch (error) {
                console.error("Error resetting UI settings:", error);
                return false;
            }
        }


        async function applyUISettings() {
            const { style } = document.documentElement;

            const applyDefaults = () => {
                const primary = DEFAULT_UI_SETTINGS.primaryColor;
                const secondary = calculateSecondaryColor(primary);
                style.setProperty('--color-primary', primary);
                style.setProperty('--color-secondary', secondary);
                style.fontSize = `${DEFAULT_UI_SETTINGS.fontSize}%`;
                style.setProperty('--border-radius', `${DEFAULT_UI_SETTINGS.borderRadius}px`);
                const spacing = 0.5 + (DEFAULT_UI_SETTINGS.contentDensity * 0.25);
                style.setProperty('--content-spacing', `${spacing.toFixed(3)}rem`);
                setTheme(DEFAULT_UI_SETTINGS.themeMode);
                applyPanelSettings(null, null);
            };

            if (!db) {
                console.warn("DB not ready in applyUISettings. Applying defaults.");
                applyDefaults();
                return false;
            }
            try {
                const uiSettings = await getFromIndexedDB('preferences', 'uiSettings');

                style.removeProperty('--color-primary');
                style.removeProperty('--color-secondary');
                style.removeProperty('--border-radius');
                style.removeProperty('--content-spacing');
                style.fontSize = '';

                const primaryColor = uiSettings?.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
                const secondaryColor = calculateSecondaryColor(primaryColor);
                style.setProperty('--color-primary', primaryColor);
                style.setProperty('--color-secondary', secondaryColor);

                const fontSize = uiSettings?.fontSize || DEFAULT_UI_SETTINGS.fontSize;
                style.fontSize = `${fontSize}%`;

                const borderRadius = uiSettings?.borderRadius ?? DEFAULT_UI_SETTINGS.borderRadius;
                style.setProperty('--border-radius', `${borderRadius}px`);

                const contentDensity = uiSettings?.contentDensity ?? DEFAULT_UI_SETTINGS.contentDensity;
                const spacing = 0.5 + (contentDensity * 0.25);
                style.setProperty('--content-spacing', `${spacing.toFixed(3)}rem`);

                const mainLayout = uiSettings?.mainLayout || DEFAULT_UI_SETTINGS.mainLayout;
                const mainLayoutDiv = document.querySelector('#mainContent > div.grid');
                if (mainLayoutDiv) {
                    const isVertical = mainLayout === 'vertical';
                    mainLayoutDiv.classList.toggle('grid-cols-1', isVertical);
                    mainLayoutDiv.classList.toggle('md:grid-cols-2', !isVertical);
                } else {
                    console.warn("Main layout div (#mainContent > div.grid) not found for applying layout settings.");
                }

                const themeMode = uiSettings?.themeMode || DEFAULT_UI_SETTINGS.themeMode;
                setTheme(themeMode);

                applyPanelSettings(uiSettings?.panelVisibility, uiSettings?.panelOrder);

                try {
                    if (window.tailwind?.config?.theme?.extend?.colors) {
                    }
                } catch (e) {
                    console.warn("Could not update live Tailwind config:", e?.message);
                }

                return true;
            } catch (error) {
                console.error("Error applying UI settings, falling back to defaults:", error);
                applyDefaults();
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
            '#addSampleTextBtn'
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

                if (topmostModal) {
                    topmostModal.classList.add('hidden');
                }
                console.log('Escape pressed. Visible modals:', visibleModals.length, 'Topmost:', topmostModal?.id);
                if (topmostModal) {
                    console.log('Hiding modal:', topmostModal.id);
                    topmostModal.classList.add('hidden');
                }
            }
        });
