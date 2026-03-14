'use strict';

import { getCoreService, notify } from '../core/kernel.js';

let deps = {
    NotificationService: null,
    loadingOverlayManager: null,
    appInit: null,
    initGoogleDocSections: null,
    setupTabsOverflow: null,
    initTabClickDelegation: null,
    updateVisibleTabs: null,
    initUISettingsModalHandlers: null,
    backgroundStatusHUD: null,
    /** Optional: array of functions to run after initUISettingsModalHandlers (e.g. PDF export, FNS cert) */
    afterInitCallbacks: null,
};

export function setOnloadHandlerDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function registerOnloadHandler() {
    window.onload = async () => {
        console.log('window.onload: Страница полностью загружена.');
        const appContent = document.getElementById('appContent');
        const resolvedNotificationService =
            deps.NotificationService || getCoreService('NotificationService');

        // Показываем appContent за оверлеем сразу, чтобы во время appInit интерфейс реально загружался и отрисовывался; при снятии оверлея пользователь видит уже готовый UI.
        if (appContent) {
            appContent.classList.remove('hidden');
            appContent.style.display = '';
            appContent.style.visibility = 'visible';
            appContent.style.opacity = '1';
            console.log(
                '[window.onload] appContent показан за оверлеем для фоновой загрузки интерфейса.',
            );
        }

        if (resolvedNotificationService?.init) {
            resolvedNotificationService.init();
        } else {
            console.error('NotificationService не определен в window.onload!');
        }

        if (deps.loadingOverlayManager?.createAndShow) {
            if (!deps.loadingOverlayManager.overlayElement) {
                console.log('[window.onload] Overlay not shown by earlyAppSetup, creating it now.');
                deps.loadingOverlayManager.createAndShow();
            } else {
                console.log(
                    '[window.onload] Overlay already exists (presumably shown by earlyAppSetup).',
                );
            }
        }

        const minDisplayTime = 5040;
        const minDisplayTimePromise = new Promise((resolve) => setTimeout(resolve, minDisplayTime));
        let appInitSuccessfully = false;

        const appLoadPromise = Promise.resolve(deps.appInit?.())
            .then((dbReady) => {
                appInitSuccessfully = dbReady;
                console.log(`[window.onload] appInit завершен. Статус готовности БД: ${dbReady}`);
            })
            .catch((err) => {
                console.error('appInit rejected in window.onload wrapper:', err);
                appInitSuccessfully = false;
            });

        Promise.all([minDisplayTimePromise, appLoadPromise])
            .then(async () => {
                console.log(
                    '[window.onload Promise.all.then] appInit и минимальное время отображения оверлея завершены.',
                );

                if (
                    deps.loadingOverlayManager?.updateProgress &&
                    deps.loadingOverlayManager.overlayElement
                ) {
                    if (deps.loadingOverlayManager.currentProgressValue < 100) {
                        deps.loadingOverlayManager.updateProgress(100);
                    }
                }
                await new Promise((r) => setTimeout(r, 100));

                if (deps.loadingOverlayManager?.runExitEffect) {
                    await deps.loadingOverlayManager.runExitEffect();
                    console.log('[window.onload Promise.all.then] Эффект выхода сферы завершён.');
                }

                if (deps.loadingOverlayManager?.hideAndDestroy) {
                    await deps.loadingOverlayManager.hideAndDestroy();
                    console.log('[window.onload Promise.all.then] Оверлей плавно скрыт.');
                }

                document.body.style.backgroundColor = '';

                // appContent уже видим за оверлеем с начала onload; при снятии оверлея только добавляем плавное появление и обновляем вложенные элементы.
                if (appContent) {
                    appContent.classList.add('content-fading-in');
                    const tabBarWrapper = appContent.querySelector('div.border-b');
                    if (tabBarWrapper) {
                        tabBarWrapper.style.visibility = 'visible';
                        tabBarWrapper.style.display = '';
                    }
                    const tabsNav = appContent.querySelector('nav.flex.flex-wrap');
                    if (tabsNav) {
                        tabsNav.style.visibility = 'visible';
                        tabsNav.style.display = 'flex';
                    }
                    console.log(
                        '[window.onload Promise.all.then] Оверлей снят; интерфейс уже загружен, применён content-fading-in.',
                    );

                    await new Promise((resolve) => requestAnimationFrame(resolve));

                    if (appInitSuccessfully) {
                        if (typeof deps.initGoogleDocSections === 'function') {
                            deps.initGoogleDocSections();
                        } else {
                            console.error(
                                'Функция initGoogleDocSections не найдена в window.onload!',
                            );
                        }
                        // finishTask('app-init') вызывается в app-init.js при завершении инициализации
                    }

                    requestAnimationFrame(() => {
                        if (typeof deps.initTabClickDelegation === 'function') {
                            deps.initTabClickDelegation();
                        }
                        if (typeof deps.setupTabsOverflow === 'function') {
                            deps.setupTabsOverflow();
                        }

                        if (typeof deps.updateVisibleTabs === 'function') {
                            deps.updateVisibleTabs();
                            requestAnimationFrame(() => deps.updateVisibleTabs());
                            setTimeout(deps.updateVisibleTabs, 50);
                            setTimeout(deps.updateVisibleTabs, 150);
                            setTimeout(deps.updateVisibleTabs, 300);
                        }

                        if (typeof deps.initUISettingsModalHandlers === 'function') {
                            deps.initUISettingsModalHandlers();
                        }

                        if (typeof window.updateScrollNavVisibility === 'function') {
                            window.updateScrollNavVisibility();
                            setTimeout(window.updateScrollNavVisibility, 200);
                            setTimeout(window.updateScrollNavVisibility, 600);
                        }

                        if (Array.isArray(deps.afterInitCallbacks)) {
                            for (const fn of deps.afterInitCallbacks) {
                                if (typeof fn === 'function') fn();
                            }
                        }
                    });
                } else {
                    console.warn(
                        '[window.onload Promise.all.then] appContent не найден после appInit. UI может быть сломан.',
                    );
                }
            })
            .catch(async (error) => {
                console.error('Критическая ошибка в Promise.all (window.onload):', error);
                if (deps.loadingOverlayManager?.hideAndDestroy) {
                    await deps.loadingOverlayManager.hideAndDestroy();
                }
                document.body.style.backgroundColor = '';
                if (appContent) {
                    appContent.classList.remove('hidden');
                }
                const errorMessageText = error instanceof Error ? error.message : String(error);
                if (resolvedNotificationService?.add) {
                    resolvedNotificationService.add(
                        `Произошла ошибка при загрузке приложения: ${errorMessageText}.`,
                        'error',
                        { important: true, duration: 10000 },
                    );
                } else {
                    notify(
                        `Произошла ошибка при загрузке приложения: ${errorMessageText}.`,
                        'error',
                        { duration: 10000 },
                    );
                }
            });
    };
}
