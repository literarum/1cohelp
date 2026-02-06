'use strict';

/**
 * Модуль инициализации приложения.
 * Вынесен из script.js для уменьшения мегафайла и улучшения модульности.
 */

let dependencies = {};

/**
 * Устанавливает зависимости для модуля appInit
 */
export function setAppInitDependencies(deps) {
    dependencies = { ...deps };
    console.log('[app-init.js] Зависимости модуля appInit установлены');
}

/**
 * Инициализация приложения
 * @param {string} context - Контекст инициализации ('normal', 'reload', и т.д.)
 * @returns {Promise<boolean>} Promise, который разрешается с флагом успешной инициализации БД
 */
export async function appInit(context = 'normal') {
    console.log(`[appInit V5 - Context-Aware: '${context}'] Начало инициализации приложения...`);

    const {
        loadingOverlayManager,
        NotificationService,
        initDB,
        loadInitialFavoritesCache,
        handleFavoriteActionClick,
        setActiveTab,
        loadUserPreferences,
        loadCategoryInfo,
        loadFromIndexedDB,
        ensureSearchIndexIsBuilt,
        checkAndBuildIndex,
        setSearchDependencies,
        algorithms,
        showNotification,
        showAlgorithmDetail,
        showBookmarkDetailModal,
        showReglamentDetail,
        showReglamentsForCategory,
        debounce,
        categoryDisplayInfo,
        initSearchSystem,
        initBookmarkSystem,
        initCibLinkSystem,
        initViewToggles,
        initReglamentsSystem,
        initClientDataSystem,
        initExternalLinksSystem,
        initTimerSystem,
        initSedoTypesSystem,
        initBlacklistSystem,
        initReloadButton,
        initClearDataFunctionality,
        initUICustomization,
        initHotkeysModal,
        setupHotkeys,
        initFullscreenToggles,
        applyInitialUISettings,
        initUI,
    } = dependencies;

    let currentAppInitProgress = 0;

    const updateTotalAppInitProgress = (stageWeightCompleted, stageName) => {
        currentAppInitProgress += stageWeightCompleted;
        const displayProgress = Math.min(currentAppInitProgress, 99);
        if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
            loadingOverlayManager.updateProgress(displayProgress);
        }
        if (typeof window.BackgroundStatusHUD !== 'undefined' && typeof window.BackgroundStatusHUD.updateTask === 'function') {
            window.BackgroundStatusHUD.updateTask('app-init', displayProgress, 100);
        }
        console.log(
            `[appInit Progress] ${stageName}: ${displayProgress.toFixed(
                1,
            )}% (добавлено ${stageWeightCompleted.toFixed(
                1,
            )}%, всего ${currentAppInitProgress.toFixed(1)}%)`,
        );
    };

    const updateFineGrainedProgress = (baseProgress, stageWeight, current, total) => {
        if (total === 0) {
            const displayProgress = Math.min(baseProgress, 99);
            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                loadingOverlayManager.updateProgress(displayProgress);
            }
            console.log(
                `[appInit FineGrainedProgress] Стадия с 0 элементами (${current}/${total}). Базовый прогресс: ${baseProgress.toFixed(
                    1,
                )}%, отображаемый: ${displayProgress.toFixed(1)}%`,
            );
            return;
        }
        const stageProgressFraction = current / total;
        const currentStageProgressContribution = stageProgressFraction * stageWeight;
        const newOverallProgressForDisplay = baseProgress + currentStageProgressContribution;
        const displayProgress = Math.min(newOverallProgressForDisplay, 99);

        if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
            loadingOverlayManager.updateProgress(displayProgress);
        }
        console.log(
            `[appInit FineGrainedProgress] ${current}/${total} (вклад стадии: +${currentStageProgressContribution.toFixed(
                1,
            )}% к базе ${baseProgress.toFixed(
                1,
            )}%). Отображаемый прогресс: ${displayProgress.toFixed(1)}%`,
        );
    };

    const STAGE_WEIGHTS_APP_INIT = {
        NOTIFICATION_SERVICE: 2,
        DB_INIT: 15,
        USER_PREFS: 8,
        DATA_LOAD: 25,
        INDEX_BUILD: 25,
        UI_SYSTEMS: 20,
        FINAL_UI: 5,
    };

    if (typeof window.BackgroundStatusHUD !== 'undefined' && typeof window.BackgroundStatusHUD.startTask === 'function') {
        window.BackgroundStatusHUD.startTask('app-init', 'Фоновая инициализация', { weight: 1, total: 100 });
    }

    if (
        NotificationService &&
        typeof NotificationService.init === 'function'
    ) {
        try {
            NotificationService.init();
        } catch (e) {
            console.error('Failed to initialize NotificationService:', e);
        }
    } else {
        console.error('NotificationService is not defined or init method is missing!');
    }
    updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.NOTIFICATION_SERVICE, 'NotificationService');

    let dbInitialized = false;

    return new Promise(async (resolve, reject) => {
        try {
            if (typeof initDB === 'function') {
                await initDB();
                dbInitialized = true;
                console.log('[appInit V3] База данных успешно инициализирована.');
            } else {
                console.error('[appInit V3] Функция initDB не найдена!');
                throw new Error('initDB function not found');
            }
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.DB_INIT, 'DBInit');

            if (dbInitialized && typeof loadInitialFavoritesCache === 'function') {
                await loadInitialFavoritesCache();
                console.log('[appInit - Favorites] loadInitialFavoritesCache выполнена.');
            } else if (!dbInitialized) {
                console.warn(
                    '[appInit - Favorites] DB not initialized, skipping favorites cache load.',
                );
            } else {
                console.warn('[appInit - Favorites] loadInitialFavoritesCache function not found.');
            }

            if (typeof handleFavoriteActionClick === 'function') {
                if (document.body._favoriteActionClickHandlerAttached) {
                    document.removeEventListener('click', handleFavoriteActionClick, false);
                    delete document.body._favoriteActionClickHandlerAttached;
                    console.log(
                        '[appInit - Favorites] Старый обработчик handleFavoriteActionClick (BUBBLING), если был, удален.',
                    );
                }
                if (document.body._favoriteActionClickHandlerAttachedCapture) {
                    document.removeEventListener('click', handleFavoriteActionClick, true);
                    delete document.body._favoriteActionClickHandlerAttachedCapture;
                    console.log(
                        '[appInit - Favorites] Предыдущий обработчик handleFavoriteActionClick (CAPTURING) удален для перерегистрации.',
                    );
                }

                document.addEventListener('click', handleFavoriteActionClick, true);
                document.body._favoriteActionClickHandlerAttachedCapture = true;
                console.log(
                    '[appInit - Favorites] Глобальный обработчик handleFavoriteActionClick (CAPTURING) добавлен/перерегистрирован.',
                );
            } else {
                console.error(
                    '[appInit - Favorites] Функция handleFavoriteActionClick не определена!',
                );
            }

            const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
            if (showFavoritesHeaderButton) {
                if (showFavoritesHeaderButton._clickHandlerInstance) {
                    showFavoritesHeaderButton.removeEventListener(
                        'click',
                        showFavoritesHeaderButton._clickHandlerInstance,
                    );
                }
                showFavoritesHeaderButton._clickHandlerInstance = () => {
                    if (typeof setActiveTab === 'function') {
                        setActiveTab('favorites');
                    }
                };
                showFavoritesHeaderButton.addEventListener(
                    'click',
                    showFavoritesHeaderButton._clickHandlerInstance,
                );
                console.log(
                    "[appInit - Favorites] Обработчик для кнопки 'Избранное' в шапке (#showFavoritesHeaderBtn) инициализирован/обновлен.",
                );
            } else {
                console.warn(
                    "[appInit - Favorites] Кнопка 'Избранное' в шапке (#showFavoritesHeaderBtn) не найдена.",
                );
            }

            if (typeof loadUserPreferences === 'function') {
                await loadUserPreferences();
            } else {
                console.warn('[appInit V3] Функция loadUserPreferences не найдена.');
            }
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.USER_PREFS, 'UserPrefs');

            const dataLoadPromises = [];
            if (dbInitialized) {
                if (typeof loadCategoryInfo === 'function')
                    dataLoadPromises.push(
                        loadCategoryInfo().catch((err) => {
                            console.error('[appInit V3] Ошибка loadCategoryInfo:', err);
                            return null;
                        }),
                    );
                if (typeof loadFromIndexedDB === 'function')
                    dataLoadPromises.push(
                        loadFromIndexedDB().catch((err) => {
                            console.error('[appInit V3] Ошибка loadFromIndexedDB:', err);
                            return null;
                        }),
                    );
                else {
                    console.warn('[appInit V3] Функция loadFromIndexedDB не найдена.');
                }
            } else {
                console.warn(
                    '[appInit V3] База данных не инициализирована, пропускаем dataLoadPromises.',
                );
            }

            const dataResults = await Promise.allSettled(dataLoadPromises);
            console.log(
                '[appInit V3] Загрузка данных завершена. Результаты:',
                dataResults.map((r) => r.status),
            );
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.DATA_LOAD, 'DataLoad');

            const baseProgressForIndex = currentAppInitProgress;
            if (dbInitialized && typeof ensureSearchIndexIsBuilt === 'function') {
                try {
                    console.log('[appInit V3] Начало построения/проверки поискового индекса...');
                    const indexProgressCallback = (processed, total, error) => {
                        if (error) {
                            console.warn(
                                '[appInit V3 - IndexProgress] Ошибка во время коллбэка индексации:',
                                error,
                            );
                            return;
                        }
                        if (total > 0) {
                            const indexStageProgress =
                                (processed / total) * STAGE_WEIGHTS_APP_INIT.INDEX_BUILD;
                            const displayProgress = Math.min(
                                baseProgressForIndex + indexStageProgress,
                                baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD,
                                99,
                            );
                            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                                loadingOverlayManager.updateProgress(displayProgress);
                            }
                        } else if (processed === 0 && total === 0) {
                            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                                loadingOverlayManager.updateProgress(
                                    Math.min(
                                        baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD,
                                        99,
                                    ),
                                );
                            }
                        }
                    };

                    if (typeof checkAndBuildIndex === 'function') {
                        await checkAndBuildIndex(false, indexProgressCallback, context);
                    } else {
                        console.warn(
                            '[appInit V3] Функция checkAndBuildIndex не найдена, вызываем ensureSearchIndexIsBuilt.',
                        );
                        await ensureSearchIndexIsBuilt();
                        if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                            loadingOverlayManager.updateProgress(
                                Math.min(baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD, 99),
                            );
                        }
                    }
                    console.log('[appInit V3] Поисковый индекс построен/проверен успешно.');
                } catch (indexError) {
                    console.error('[appInit V3] Ошибка построения поискового индекса:', indexError);
                }
            } else {
                if (!dbInitialized)
                    console.warn(
                        '[appInit V3] База данных не инициализирована, построение поискового индекса пропущено.',
                    );
                else
                    console.warn(
                        '[appInit V3] Функция ensureSearchIndexIsBuilt не найдена, построение поискового индекса пропущено.',
                    );
            }
            currentAppInitProgress = baseProgressForIndex + STAGE_WEIGHTS_APP_INIT.INDEX_BUILD;
            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                loadingOverlayManager.updateProgress(Math.min(currentAppInitProgress, 99));
            }

            // Устанавливаем зависимости для модуля поиска
            if (typeof setSearchDependencies === 'function') {
                setSearchDependencies({
                    algorithms: algorithms,
                    showNotification: showNotification,
                    setActiveTab: setActiveTab,
                    showAlgorithmDetail: showAlgorithmDetail,
                    showBookmarkDetailModal: showBookmarkDetailModal,
                    showReglamentDetail: showReglamentDetail,
                    showReglamentsForCategory: showReglamentsForCategory,
                    loadingOverlayManager: loadingOverlayManager,
                    debounce: debounce,
                    categoryDisplayInfo: categoryDisplayInfo
                });
                console.log('[appInit] Search dependencies установлены');
            }

            console.log('[appInit V3] Начало инициализации подсистем UI...');
            const initSystems = [
                {
                    name: 'initSearchSystem',
                    func:
                        typeof initSearchSystem === 'function'
                            ? initSearchSystem
                            : () => console.warn('initSearchSystem not defined'),
                    critical: true,
                },
                {
                    name: 'initBookmarkSystem',
                    func:
                        typeof initBookmarkSystem === 'function'
                            ? initBookmarkSystem
                            : () => console.warn('initBookmarkSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initCibLinkSystem',
                    func:
                        typeof initCibLinkSystem === 'function'
                            ? initCibLinkSystem
                            : () => console.warn('initCibLinkSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initViewToggles',
                    func:
                        typeof initViewToggles === 'function'
                            ? initViewToggles
                            : () => console.warn('initViewToggles not defined'),
                    critical: false,
                },
                {
                    name: 'initReglamentsSystem',
                    func:
                        typeof initReglamentsSystem === 'function'
                            ? initReglamentsSystem
                            : () => console.warn('initReglamentsSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initClientDataSystem',
                    func:
                        typeof initClientDataSystem === 'function'
                            ? initClientDataSystem
                            : () => console.warn('initClientDataSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initExternalLinksSystem',
                    func:
                        typeof initExternalLinksSystem === 'function'
                            ? initExternalLinksSystem
                            : () => console.warn('initExternalLinksSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initTimerSystem',
                    func:
                        typeof initTimerSystem === 'function'
                            ? initTimerSystem
                            : () => console.warn('initTimerSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initSedoTypesSystem',
                    func:
                        typeof initSedoTypesSystem === 'function'
                            ? initSedoTypesSystem
                            : () => console.warn('initSedoTypesSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initBlacklistSystem',
                    func:
                        typeof initBlacklistSystem === 'function'
                            ? initBlacklistSystem
                            : () => console.warn('initBlacklistSystem not defined'),
                    critical: false,
                },
                {
                    name: 'initReloadButton',
                    func:
                        typeof initReloadButton === 'function'
                            ? initReloadButton
                            : () => console.warn('initReloadButton not defined'),
                    critical: false,
                },
                {
                    name: 'initClearDataFunctionality',
                    func:
                        typeof initClearDataFunctionality === 'function'
                            ? initClearDataFunctionality
                            : () => console.warn('initClearDataFunctionality not defined'),
                    critical: false,
                },
                {
                    name: 'initUICustomization',
                    func:
                        typeof initUICustomization === 'function'
                            ? initUICustomization
                            : () => console.warn('initUICustomization not defined'),
                    critical: false,
                },
                {
                    name: 'initHotkeysModal',
                    func:
                        typeof initHotkeysModal === 'function'
                            ? initHotkeysModal
                            : () => console.warn('initHotkeysModal not defined'),
                    critical: false,
                },
                {
                    name: 'setupHotkeys',
                    func:
                        typeof setupHotkeys === 'function'
                            ? setupHotkeys
                            : () => console.warn('setupHotkeys not defined'),
                    critical: false,
                },
                {
                    name: 'initFullscreenToggles',
                    func:
                        typeof initFullscreenToggles === 'function'
                            ? initFullscreenToggles
                            : () => console.warn('initFullscreenToggles not defined'),
                    critical: false,
                },
            ];
            let successCount = 0;
            let errorCount = 0;
            const baseProgressForUISystems = currentAppInitProgress;
            let processedUISystems = 0;

            for (const system of initSystems) {
                try {
                    if (typeof system.func === 'function') {
                        await Promise.resolve(system.func());
                        console.log(`[appInit V3] ✓ ${system.name} инициализирована успешно.`);
                        successCount++;
                    } else {
                        console.warn(
                            `[appInit V3] ⚠ ${system.name} не найдена или не является функцией (неожиданно, т.к. должна быть заглушка).`,
                        );
                        if (system.critical)
                            throw new Error(`Critical system ${system.name} not found`);
                    }
                } catch (error) {
                    console.error(`[appInit V3] ✗ Ошибка инициализации ${system.name}:`, error);
                    errorCount++;
                    if (system.critical)
                        throw new Error(`Critical system ${system.name} failed: ${error.message}`);
                }
                processedUISystems++;
                updateFineGrainedProgress(
                    baseProgressForUISystems,
                    STAGE_WEIGHTS_APP_INIT.UI_SYSTEMS,
                    processedUISystems,
                    initSystems.length,
                );
            }
            currentAppInitProgress = baseProgressForUISystems + STAGE_WEIGHTS_APP_INIT.UI_SYSTEMS;
            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                loadingOverlayManager.updateProgress(Math.min(currentAppInitProgress, 99));
            }
            console.log(
                `[appInit V3] Инициализация подсистем UI завершена: ${successCount} успешно, ${errorCount} с ошибками.`,
            );

            try {
                if (typeof applyInitialUISettings === 'function') {
                    await applyInitialUISettings();
                } else {
                    console.warn('[appInit V3] Функция applyInitialUISettings не найдена.');
                }
            } catch (uiSettingsError) {
                console.error('[appInit V3] ✗ Ошибка применения UI настроек:', uiSettingsError);
            }

            try {
                if (typeof initUI === 'function') {
                    await Promise.resolve(initUI());
                } else {
                    console.warn('[appInit V3] ⚠ Функция initUI не найдена.');
                }
            } catch (finalUIError) {
                console.error('[appInit V3] ✗ Ошибка в финальной инициализации UI:', finalUIError);
            }
            updateTotalAppInitProgress(STAGE_WEIGHTS_APP_INIT.FINAL_UI, 'FinalUI');

            console.log(
                '[appInit V3] Все логические операции и вызовы рендеринга завершены. Ожидание отрисовки DOM браузером...',
            );
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            console.log('[appInit V3] Отрисовка DOM браузером должна была произойти.');

            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                loadingOverlayManager.updateProgress(100);
            }
            if (typeof window.BackgroundStatusHUD !== 'undefined' && typeof window.BackgroundStatusHUD.updateTask === 'function') {
                window.BackgroundStatusHUD.updateTask('app-init', 100, 100);
            }
            // finishTask('app-init') вызывается в window.onload после скрытия оверлея и запуска initGoogleDocSections,
            // чтобы уведомление «Приложение полностью загружено» не появлялось до исчезновения оверлея и плашки HUD
            console.log('[appInit V3] ✓ Инициализация приложения завершена успешно.');
            resolve(dbInitialized);
        } catch (criticalError) {
            console.error('[appInit V3] ✗ КРИТИЧЕСКАЯ ОШИБКА инициализации:', criticalError);
            if (loadingOverlayManager && typeof loadingOverlayManager.updateProgress === 'function') {
                loadingOverlayManager.updateProgress(100);
            }
            if (typeof window.BackgroundStatusHUD !== 'undefined' && typeof window.BackgroundStatusHUD.finishTask === 'function') {
                window.BackgroundStatusHUD.finishTask('app-init', false);
            }
            if (NotificationService && typeof NotificationService.add === 'function') {
                NotificationService.add(
                    `Критическая ошибка инициализации: ${criticalError.message}. Приложение может работать некорректно.`,
                    'error',
                    { important: true, duration: 0 },
                );
            } else {
                alert(
                    `Критическая ошибка инициализации: ${criticalError.message}. Приложение может работать некорректно.`,
                );
            }
            reject(criticalError);
        }
    });
}
