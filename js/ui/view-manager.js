'use strict';

/**
 * Модуль управления видами отображения (cards/list)
 * Обеспечивает переключение между видами и применение настроек
 */

import {
    CARD_CONTAINER_CLASSES,
    LIST_CONTAINER_CLASSES,
    CARD_ITEM_BASE_CLASSES,
    LIST_ITEM_BASE_CLASSES,
    ALGO_BOOKMARK_CARD_CLASSES,
    LINK_REGLAMENT_CARD_CLASSES,
    LIST_HOVER_TRANSITION_CLASSES,
    SECTION_GRID_COLS,
} from '../config.js';
import { State } from '../app/state.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С ВИДАМИ ОТОБРАЖЕНИЯ
// ============================================================================

/**
 * Загружает настройки видов отображения из БД
 */
export async function loadViewPreferences() {
    try {
        const prefs = await getFromIndexedDB('preferences', 'viewPreferences');
        State.viewPreferences = prefs?.views || {};
        document.querySelectorAll('[data-section-id]').forEach((container) => {
            const sectionId = container.dataset.sectionId;
            const defaultView = container.dataset.defaultView || 'cards';
            applyView(container, State.viewPreferences[sectionId] || defaultView);
        });
    } catch (error) {
        console.error('Error loading view preferences:', error);
        applyDefaultViews();
    }
}

/**
 * Сохраняет настройку вида отображения в БД
 * @param {string} sectionId - ID секции
 * @param {string} view - Вид отображения
 */
export async function saveViewPreference(sectionId, view) {
    State.viewPreferences[sectionId] = view;
    try {
        await saveToIndexedDB('preferences', {
            id: 'viewPreferences',
            views: State.viewPreferences,
        });
    } catch (error) {
        console.error('Error saving view preference:', error);
    }
}

/**
 * Применяет вид отображения к контейнеру
 * @param {HTMLElement} container - Контейнер для применения вида
 * @param {string} view - Вид отображения ('cards' или 'list')
 */
export function applyView(container, view) {
    if (!container) {
        console.warn(`[applyView v8] Контейнер не предоставлен.`);
        return;
    }

    container.dataset.view = view === 'list' ? 'list' : 'cards';
    const sectionId = container.dataset.sectionId;
    let viewControlsContainer = null;

    if (sectionId === 'reglamentsContainer' || sectionId === 'reglamentCategoryGrid') {
        viewControlsContainer = document.getElementById('globalReglamentActionsBar');
    } else {
        const firstViewToggleButtonInSection = container
            .closest('.tab-content')
            ?.querySelector(`.view-toggle[data-view]`);
        if (firstViewToggleButtonInSection) {
            viewControlsContainer = firstViewToggleButtonInSection.closest(
                '.flex.items-center.gap-2, .flex.items-center.space-x-1.border, .flex.items-center.space-x-2, #globalReglamentActionsBar',
            );
            if (!viewControlsContainer) {
                const sectionWrapper = container.closest(
                    '.bg-gray-100.dark\\:bg-gray-800.p-content',
                );
                if (sectionWrapper) {
                    viewControlsContainer = sectionWrapper.querySelector(
                        '.flex.items-center.gap-2, .flex.items-center.space-x-1.border, .flex.items-center.space-x-2',
                    );
                }
            }
        }
    }

    const buttons = viewControlsContainer
        ? viewControlsContainer.querySelectorAll(`.view-toggle`)
        : document.querySelectorAll(`.view-toggle[data-view]`);
    let sectionSpecificButtons = [];
    if (buttons && buttons.length > 0) {
        const sectionRoot = container.closest('.tab-content');
        if (sectionRoot) {
            const buttonsWithinSection = sectionRoot.querySelectorAll('.view-toggle');
            sectionSpecificButtons =
                buttonsWithinSection.length > 0
                    ? Array.from(buttonsWithinSection)
                    : Array.from(buttons);
        } else {
            sectionSpecificButtons = Array.from(buttons);
        }
    }

    let items;
    if (sectionId === 'reglamentCategoryGrid') {
        items = container.querySelectorAll('.view-item, .reglament-category, .reglament-item');
    } else {
        items = container.querySelectorAll(
            '.view-item, .algorithm-card, .bookmark-item, .ext-link-item, .cib-link-item, .favorite-item, .reglament-item, .client-analytics-card',
        );
    }

    if (sectionSpecificButtons.length > 0) {
        sectionSpecificButtons.forEach((btn) => {
            const isTargetView = btn.dataset.view === view;
            btn.classList.toggle('bg-primary', isTargetView);
            btn.classList.toggle('text-white', isTargetView);
            const isGlobalReglamentBarButton = btn.closest('#globalReglamentActionsBar');
            if (isGlobalReglamentBarButton) {
                btn.classList.toggle('bg-white', !isTargetView);
                btn.classList.toggle('dark:bg-gray-700', !isTargetView);
                btn.classList.toggle('text-gray-900', !isTargetView);
                btn.classList.toggle('dark:text-white', !isTargetView);
            } else {
                btn.classList.toggle('bg-white', !isTargetView);
                btn.classList.toggle('dark:bg-gray-700', !isTargetView);
                btn.classList.toggle('text-gray-900', !isTargetView);
                btn.classList.toggle('dark:text-gray-300', !isTargetView);
            }
        });
    }

    const gridColsClassesBase = SECTION_GRID_COLS[sectionId] || SECTION_GRID_COLS.default;
    const gridColsClassesForCategoryGrid = SECTION_GRID_COLS.reglamentCategoryGrid || [
        'grid-cols-1',
        'md:grid-cols-2',
        'lg:grid-cols-3',
    ];

    container.classList.remove(
        ...CARD_CONTAINER_CLASSES,
        ...gridColsClassesBase,
        ...gridColsClassesForCategoryGrid,
        ...LIST_CONTAINER_CLASSES,
        'auto-rows-fr',
        'gap-1',
        'gap-2',
        'gap-3',
        'gap-4',
        'gap-content',
        'gap-content-sm',
    );

    if (view === 'cards') {
        container.classList.add(...CARD_CONTAINER_CLASSES);
        container.classList.add('auto-rows-fr');
        if (sectionId === 'reglamentCategoryGrid') {
            container.classList.add(...gridColsClassesForCategoryGrid);
        } else {
            container.classList.add(...gridColsClassesBase);
        }
        if (
            [
                'bookmarksContainer',
                'extLinksContainer',
                'linksContainer',
                'clientAnalyticsContainer',
            ].includes(sectionId)
        ) {
            container.classList.add('gap-4');
        } else if (sectionId === 'reglamentCategoryGrid') {
            container.classList.add('gap-content');
        }
    } else {
        if (sectionId === 'reglamentCategoryGrid') {
            container.classList.remove(
                ...gridColsClassesForCategoryGrid,
                ...gridColsClassesBase,
                'auto-rows-fr',
            );
            container.classList.add('grid');
            container.classList.add('grid-cols-1');
            container.classList.add('gap-content-sm');
        } else {
            container.classList.add(...LIST_CONTAINER_CLASSES);
        }
    }

    items.forEach((item) => {
        item.classList.remove(
            ...CARD_ITEM_BASE_CLASSES,
            ...ALGO_BOOKMARK_CARD_CLASSES,
            ...LINK_REGLAMENT_CARD_CLASSES,
            'bg-white',
            'dark:bg-[#374151]',
            'border',
            'border-gray-200',
            'dark:border-gray-700',
            'h-full',
            'flex-col',
            'justify-between',
            ...LIST_ITEM_BASE_CLASSES,
            ...LIST_HOVER_TRANSITION_CLASSES,
            'py-3',
            'pl-5',
            'pr-3',
            'mb-1',
            'mb-2',
            'p-3',
            'border-b',
            'text-center',
            'md:items-start',
            'md:text-left',
        );
        item.style.borderColor = '';

        if (view === 'cards') {
            item.classList.add(...CARD_ITEM_BASE_CLASSES);
            item.classList.add('h-full');

            if (item.classList.contains('bookmark-item')) {
                const title = item.querySelector('.bookmark-title, .item-title, h3, h4');
                if (title) {
                    title.classList.remove('font-medium', 'text-sm');
                    title.classList.add('font-semibold', 'text-base');
                }
                const actions = item.querySelector('.bookmark-actions, [data-role="actions"]');
                if (actions) {
                    actions.classList.add(
                        'opacity-0',
                        'pointer-events-none',
                        'group-hover:opacity-100',
                        'group-hover:pointer-events-auto',
                        'transition-opacity',
                    );
                }
            }

            if (item.classList.contains('algorithm-card')) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
            } else if (item.classList.contains('reglament-category')) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
                item.classList.remove('bg-white', 'dark:bg-gray-700');
            } else if (
                item.classList.contains('bookmark-item') ||
                item.classList.contains('ext-link-item') ||
                item.classList.contains('cib-link-item')
            ) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
            } else if (item.classList.contains('client-analytics-card')) {
                item.classList.add(...ALGO_BOOKMARK_CARD_CLASSES);
            }
        } else {
            item.classList.add(...LIST_ITEM_BASE_CLASSES, ...LIST_HOVER_TRANSITION_CLASSES);
            item.classList.remove('h-full');
            if (item.classList.contains('reglament-category')) {
                item.classList.remove('border-l-4');
            }
            if (item.classList.contains('algorithm-card')) {
                item.classList.remove('flex', 'justify-between', 'items-center');
                item.classList.add('block');
            }
            if (item.classList.contains('bookmark-item')) {
                const title = item.querySelector('.bookmark-title, .item-title, h3, h4');
                if (title) {
                    title.classList.remove('font-semibold', 'text-base');
                    title.classList.add('font-medium', 'text-sm');
                }
                const actions = item.querySelector('.bookmark-actions, [data-role="actions"]');
                if (actions) {
                    actions.classList.add(
                        'opacity-0',
                        'pointer-events-none',
                        'group-hover:opacity-100',
                        'group-hover:pointer-events-auto',
                        'transition-opacity',
                    );
                }
            }
        }
    });

    console.log(
        `[applyView v8] Вид '${view}' применён к ${items.length} элементам в контейнере ${
            sectionId || container.id
        }.`,
    );
}

/**
 * Применяет текущий вид отображения к секции
 * @param {string} sectionId - ID секции контейнера
 */
export function applyCurrentView(sectionId) {
    const container = document.getElementById(sectionId);
    if (container) {
        const currentView =
            State.viewPreferences[sectionId] || container.dataset.defaultView || 'cards';
        applyView(container, currentView);
    }
}

/**
 * Инициализирует переключатели видов отображения
 */
export function initViewToggles() {
    if (!window.__viewToggleDelegatedBound) {
        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.view-toggle') : null;
            if (!btn) return;
            handleViewToggleClick(e);
        });
        window.__viewToggleDelegatedBound = true;
    }

    document.querySelectorAll('.view-toggle').forEach((button) => {
        if (!button.__viewToggleDirectBound) {
            button.addEventListener('click', handleViewToggleClick);
            button.__viewToggleDirectBound = true;
        }
    });

    loadViewPreferences();
}

/**
 * Обработчик клика на переключатель вида
 * @param {Event} event - Событие клика
 */
export function handleViewToggleClick(event) {
    const clickedButton =
        event && event.target && event.target.closest
            ? event.target.closest('.view-toggle')
            : event.currentTarget;
    if (!clickedButton) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    const desiredView = clickedButton.dataset.view;
    if (!desiredView) {
        console.warn('[handleViewToggleClick] data-view не задан у кнопки.');
        return;
    }

    const sectionRoot = clickedButton.closest('.tab-content') || document;

    let targetContainer = null;
    if (State.currentSection === 'reglaments') {
        const regList = sectionRoot.querySelector('#reglamentsList');
        const listVisible = regList && !regList.classList.contains('hidden');
        targetContainer = sectionRoot.querySelector(
            listVisible ? '#reglamentsContainer' : '#reglamentCategoryGrid',
        );
    }

    if (!targetContainer) {
        const visibleContainers = Array.from(
            sectionRoot.querySelectorAll('[data-section-id]'),
        ).filter((el) => {
            const style = window.getComputedStyle(el);
            return (
                !el.classList.contains('hidden') &&
                style.display !== 'none' &&
                !el.closest('.hidden')
            );
        });

        if (visibleContainers.length === 1) {
            targetContainer = visibleContainers[0];
        } else if (visibleContainers.length > 1) {
            const controlsBlock =
                clickedButton.closest(
                    '.actions-bar-container, .flex.items-center.gap-2, .flex.items-center.space-x-1.border, .flex.items-center.space-x-2, #globalReglamentActionsBar',
                ) || clickedButton.parentElement;

            let sib = controlsBlock ? controlsBlock.nextElementSibling : null;
            while (sib && !sib.matches('[data-section-id]')) {
                sib = sib.nextElementSibling;
            }
            targetContainer = sib || visibleContainers[0];
        }
    }

    if (!targetContainer) {
        targetContainer = clickedButton.closest('[data-section-id]');
    }

    if (!targetContainer) {
        let fallbackId = State.currentSection + 'Container';
        if (['program', 'skzi', 'webReg', 'lk1c'].includes(State.currentSection)) {
            fallbackId = State.currentSection + 'Algorithms';
        } else if (State.currentSection === 'reglaments') {
            fallbackId = 'reglamentCategoryGrid';
        }
        targetContainer =
            document.getElementById(fallbackId) ||
            document.querySelector(`[data-section-id="${fallbackId}"]`);
    }

    if (!targetContainer) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(
                'Не удалось определить область для переключения вида.',
                'error',
            );
        }
        return;
    }

    const sectionIdForPrefs =
        targetContainer.dataset.sectionId || targetContainer.getAttribute('id') || 'unknown';
    applyView(targetContainer, desiredView);
    saveViewPreference(sectionIdForPrefs, desiredView);
}

/**
 * Применяет виды отображения по умолчанию для всех секций
 */
export function applyDefaultViews() {
    document.querySelectorAll('[data-section-id]').forEach((container) => {
        applyView(container, container.dataset.defaultView || 'cards');
    });
}

/**
 * Контейнер списка/плиток для текущей секции ({@link State.currentSection}).
 * @returns {{ container: HTMLElement, sectionIdentifierForPrefs: string } | null}
 */
export function resolveToggleContainerForCurrentSection() {
    if (typeof State === 'undefined' || !State.currentSection) return null;

    switch (State.currentSection) {
        case 'main':
            return null;
        case 'program':
            return containerPair('programAlgorithms');
        case 'skzi':
            return containerPair('skziAlgorithms');
        case 'webReg':
            return containerPair('webRegAlgorithms');
        case 'lk1c':
            return containerPair('lk1cAlgorithms');
        case 'links':
            return containerPair('linksContainer');
        case 'extLinks':
            return containerPair('extLinksContainer');
        case 'reglaments': {
            const reglamentsListDiv = document.getElementById('reglamentsList');
            if (!reglamentsListDiv || reglamentsListDiv.classList.contains('hidden')) {
                return null;
            }
            return containerPair('reglamentsContainer');
        }
        case 'bookmarks':
            return containerPair('bookmarksContainer');
        case 'favorites':
            return containerPair('favoritesContainer');
        case 'clientAnalytics':
            return containerPair('clientAnalyticsContainer');
        default:
            return null;
    }

    function containerPair(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        return { container, sectionIdentifierForPrefs: containerId };
    }
}

/**
 * Подпись пункта «список / плитки» для контекстного меню.
 * @returns {{ disabled: boolean; label: string; hiddenInMenu?: boolean }}
 */
export function getViewToggleLabelForContextMenu() {
    const r = resolveToggleContainerForCurrentSection();
    if (!r) {
        if (State.currentSection === 'main') {
            return { disabled: true, label: 'Вид: недоступно на главной', hiddenInMenu: true };
        }
        if (State.currentSection === 'reglaments') {
            return { disabled: true, label: 'Вид: сначала выберите категорию' };
        }
        return { disabled: true, label: 'Вид недоступен' };
    }
    const currentView =
        State.viewPreferences[r.sectionIdentifierForPrefs] ||
        r.container.dataset.defaultView ||
        'cards';
    const nextView = currentView === 'cards' ? 'list' : 'cards';
    return {
        disabled: false,
        label: nextView === 'list' ? 'Отобразить списком' : 'Отобразить плитками',
    };
}

/**
 * Переключает вид активной секции (список ⟷ плитки), синхронно с {@link State.currentSection}.
 */
export function toggleActiveSectionView() {
    if (typeof State === 'undefined' || !State.currentSection) {
        console.warn('toggleActiveSectionView: State.currentSection не задан.');
        return;
    }
    if (State.currentSection === 'main') {
        window.showNotification?.('Главный алгоритм не имеет переключения вида.', 'info');
        return;
    }

    const r = resolveToggleContainerForCurrentSection();
    if (!r) {
        if (State.currentSection === 'reglaments') {
            window.showNotification?.('Сначала выберите категорию регламентов.', 'info');
        } else {
            window.showNotification?.(
                'Переключение вида для текущей секции не поддерживается.',
                'warning',
            );
        }
        return;
    }

    const { container, sectionIdentifierForPrefs } = r;
    const currentView =
        State.viewPreferences[sectionIdentifierForPrefs] ||
        container.dataset.defaultView ||
        'cards';
    const nextView = currentView === 'cards' ? 'list' : 'cards';

    applyView(container, nextView);
    saveViewPreference(sectionIdentifierForPrefs, nextView);
    window.showNotification?.(
        `Вид переключен на: ${nextView === 'list' ? 'Список' : 'Плитки'}`,
        'info',
        1500,
    );
}
