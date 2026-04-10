'use strict';

import { MAX_UPDATE_VISIBLE_TABS_RETRIES, SHABLONY_DOC_ID } from '../constants.js';
import { State } from '../app/state.js';
import { tabsConfig } from '../config.js';
import {
    onBeforeProgrammaticSectionChange,
    applyReglamentsSnapshotIfNeeded,
    scheduleScrollRestore,
    NavigationSource,
    updateBackButtonUi,
} from '../features/contextual-back-navigation.js';

/** Допуск (px) при сравнении границ вкладок (субпиксельный рендер) */
const LAYOUT_TOLERANCE_PX = 2;

// Зависимости модуля
let deps = {
    setActiveTab: null,
    showBlacklistWarning: null,
    renderFavoritesPage: null,
    renderRemindersPage: null,
    renderTrainingPage: null,
    updateVisibleTabs: null,
    getVisibleModals: null,
    loadBookmarks: null,
    renderClientAnalyticsPage: null,
};

/**
 * Установка зависимостей модуля
 * @param {Object} dependencies - объект с зависимостями
 */
export function setTabsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

/**
 * Прокручивает страницу вверх. Использует тот же контейнер, что и кнопки навигации (main или window).
 * Вызывать только при включённой статичной панели (staticHeader).
 */
function scrollPageToTop() {
    const appContent = document.getElementById('appContent');
    const main = appContent?.querySelector('main');
    if (main) {
        const style = window.getComputedStyle(main);
        const overflowY = style.overflowY || style.overflow;
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
            main.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================================
// КОМПОНЕНТ РАБОТЫ С ВКЛАДКАМИ
// ============================================================================

/**
 * Создаёт элемент кнопки вкладки
 * @param {Object} tabConfig - конфигурация вкладки
 * @returns {HTMLButtonElement} элемент кнопки
 */
export function createTabButtonElement(tabConfig) {
    const button = document.createElement('button');
    button.id = `${tabConfig.id}Tab`;

    button.className =
        'tab-btn inline-block p-2.5 sm:p-3 rounded-t-lg border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 whitespace-nowrap text-sm sm:text-base focus:outline-none transition-colors';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${tabConfig.id}Content`);

    let buttonContent = '';
    if (tabConfig.icon) {
        buttonContent += `<i class="fas ${tabConfig.icon} mr-1"></i>`;
    }

    if (tabConfig.icon) {
        buttonContent += `<span class="hidden sm:inline">${tabConfig.name}</span>`;
        button.title = tabConfig.name;
    } else {
        buttonContent += `<span>${tabConfig.name}</span>`;
    }
    button.innerHTML = buttonContent;

    button.addEventListener('click', () => {
        const nav = { navigationSource: NavigationSource.TAB_BAR };
        if (deps.setActiveTab) {
            deps.setActiveTab(tabConfig.id, false, nav);
        } else if (typeof window.setActiveTab === 'function') {
            window.setActiveTab(tabConfig.id, false, nav);
        } else {
            console.error(
                `[createTabButtonElement] Функция setActiveTab не найдена при клике на кнопку ${tabConfig.id}`,
            );
        }
    });
    return button;
}

/**
 * Убеждается, что вкладка присутствует в навигации
 * @param {string} panelId - ID панели
 * @param {boolean} visible - видимость вкладки
 */
export function ensureTabPresent(panelId, visible = true) {
    try {
        const tabNav = document.querySelector('header + .border-b nav.flex');
        if (!tabNav) return;
        const moreTabsBtnParent = document.getElementById('moreTabsBtn')?.parentNode || null;
        const existing = document.getElementById(`${panelId}Tab`);
        if (existing) {
            existing.classList.toggle('hidden', !visible);
            return;
        }
        const cfg = Array.isArray(tabsConfig) ? tabsConfig.find((t) => t.id === panelId) : null;
        if (!cfg) return;
        const btn = createTabButtonElement(cfg);
        if (!visible) btn.classList.add('hidden');
        if (moreTabsBtnParent) tabNav.insertBefore(btn, moreTabsBtnParent);
        else tabNav.appendChild(btn);
    } catch (e) {
        console.error('[ensureTabPresent] Ошибка при создании вкладки', panelId, e);
    }
}

/**
 * Обновляет видимость вкладок с учетом переполнения
 */
export function updateVisibleTabs() {
    const tabsNav = document.querySelector('nav.flex.flex-wrap');
    const moreTabsBtn = document.getElementById('moreTabsBtn');
    const moreTabsDropdown = document.getElementById('moreTabsDropdown');
    const moreTabsContainer = moreTabsBtn ? moreTabsBtn.parentNode : null;

    const LAYOUT_ERROR_MARGIN = 5;

    if (
        !tabsNav ||
        !moreTabsBtn ||
        !moreTabsDropdown ||
        !moreTabsContainer ||
        (moreTabsContainer && moreTabsContainer.nodeName === 'NAV')
    ) {
        console.warn(
            '[updateVisibleTabs v8_FIXED] Aborted: Required DOM elements not found or invalid parent for moreTabsBtn.',
        );
        if (moreTabsContainer && document.body.contains(moreTabsContainer)) {
            moreTabsContainer.classList.add('hidden');
        }
        State.updateVisibleTabsRetryCount = 0;
        return;
    }

    if (
        tabsNav.offsetWidth === 0 &&
        State.updateVisibleTabsRetryCount < MAX_UPDATE_VISIBLE_TABS_RETRIES
    ) {
        State.updateVisibleTabsRetryCount++;
        console.debug(
            `[updateVisibleTabs] tabsNav.offsetWidth is 0, retry ${State.updateVisibleTabsRetryCount}/${MAX_UPDATE_VISIBLE_TABS_RETRIES}.`,
        );
        requestAnimationFrame(updateVisibleTabs);
        return;
    } else if (
        tabsNav.offsetWidth === 0 &&
        State.updateVisibleTabsRetryCount >= MAX_UPDATE_VISIBLE_TABS_RETRIES
    ) {
        console.debug(
            '[updateVisibleTabs] Element not visible yet (offsetWidth=0). Will recalculate on resize.',
        );
        if (moreTabsContainer && document.body.contains(moreTabsContainer)) {
            moreTabsContainer.classList.add('hidden');
        }
        State.updateVisibleTabsRetryCount = 0;
        return;
    }

    State.updateVisibleTabsRetryCount = 0;

    moreTabsDropdown.innerHTML = '';
    if (moreTabsContainer) {
        moreTabsContainer.classList.add('hidden');
    }

    const allPotentialTabs = Array.from(tabsNav.querySelectorAll('.tab-btn:not(#moreTabsBtn)'));
    allPotentialTabs.forEach((tab) => {
        tab.classList.remove('overflow-tab');
        tab.style.display = '';
    });

    const visibleTabs = allPotentialTabs.filter((tab) => {
        const style = window.getComputedStyle(tab);
        return style.display !== 'none' && !tab.classList.contains('hidden');
    });

    if (!visibleTabs.length) {
        if (moreTabsContainer) {
            moreTabsContainer.classList.add('hidden');
        }
        return;
    }

    const navWidth = tabsNav.offsetWidth;

    let moreTabsWidth = 0;
    if (moreTabsContainer) {
        const wasMoreButtonHidden = moreTabsContainer.classList.contains('hidden');
        if (wasMoreButtonHidden) moreTabsContainer.classList.remove('hidden');
        moreTabsWidth = moreTabsContainer.offsetWidth;
        if (wasMoreButtonHidden) moreTabsContainer.classList.add('hidden');
    }

    const availableWidth = navWidth - moreTabsWidth - LAYOUT_ERROR_MARGIN;

    // Определяем максимум вкладок по реальной раскладке: граница — до кнопки «...»,
    // первая вкладка на второй строке или выходящая за границу уходит в overflow.
    const navRect = tabsNav.getBoundingClientRect();
    const boundaryX = navRect.left + availableWidth + LAYOUT_TOLERANCE_PX;
    const firstTabRect = visibleTabs[0].getBoundingClientRect();
    const firstRowBottom = firstTabRect.bottom + LAYOUT_TOLERANCE_PX;

    let firstOverflowIndex = -1;
    for (let i = 0; i < visibleTabs.length; i++) {
        const rect = visibleTabs[i].getBoundingClientRect();
        if (rect.top >= firstRowBottom) {
            firstOverflowIndex = i;
            break;
        }
        if (rect.right > boundaryX) {
            firstOverflowIndex = i;
            break;
        }
    }

    if (firstOverflowIndex !== -1) {
        if (moreTabsContainer) {
            moreTabsContainer.classList.remove('hidden');
        }
        const dropdownFragment = document.createDocumentFragment();

        for (let i = firstOverflowIndex; i < visibleTabs.length; i++) {
            const tab = visibleTabs[i];
            tab.style.display = 'none';
            tab.classList.add('overflow-tab');

            const dropdownItem = document.createElement('a');
            dropdownItem.href = '#';
            dropdownItem.className =
                'block px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-all duration-150 overflow-dropdown-item cursor-pointer';
            const icon = tab.querySelector('i');
            const text = tab.textContent.trim();
            dropdownItem.innerHTML = `${icon ? icon.outerHTML + ' ' : ''}${text}`;
            dropdownItem.dataset.tabId = tab.id.replace('Tab', '');
            dropdownItem.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = { navigationSource: NavigationSource.TAB_BAR };
                if (typeof deps.setActiveTab === 'function') {
                    deps.setActiveTab(dropdownItem.dataset.tabId, false, nav);
                } else if (typeof window.setActiveTab === 'function') {
                    window.setActiveTab(dropdownItem.dataset.tabId, false, nav);
                } else {
                    console.error(
                        `[updateVisibleTabs] setActiveTab недоступна для overflow-вкладки "${dropdownItem.dataset.tabId}".`,
                    );
                }
                if (moreTabsDropdown) moreTabsDropdown.classList.add('hidden');
            });
            dropdownFragment.appendChild(dropdownItem);
        }
        moreTabsDropdown.appendChild(dropdownFragment);
    }
}

/**
 * Делегированный обработчик кликов по вкладкам
 */
export function initTabClickDelegation() {
    if (initTabClickDelegation._isAttached) return;
    initTabClickDelegation._isAttached = true;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn || btn.id === 'moreTabsBtn') return;
        const tabId = (btn.id || '').replace(/Tab$/, '');
        if (tabId && typeof deps.setActiveTab === 'function') {
            deps.setActiveTab(tabId, false, { navigationSource: NavigationSource.TAB_BAR });
        }
    });
}

/**
 * Делегированный обработчик клика: открывает/закрывает меню при клике по кнопке «…»
 */
function delegatedMoreTabsClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('#moreTabsBtn') : null;
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    handleMoreTabsBtnClick(e);
}

/**
 * Настраивает обработчики событий для переполнения вкладок
 */
export function setupTabsOverflow() {
    const tabsNav = document.querySelector('nav.flex.flex-wrap');
    if (!tabsNav) {
        console.warn('[setupTabsOverflow v15_FIXED] Setup skipped: tabsNav not found.');
        return;
    }

    const initKey = 'tabsOverflowInitialized_v15_FIXED';
    if (tabsNav.dataset[initKey] === 'true') {
        return;
    }

    console.log('[setupTabsOverflow v15_FIXED] Performing INITIAL setup of event listeners...');

    // Делегирование клика на nav: меню открывается по клику на #moreTabsBtn даже при поздней отрисовке
    if (tabsNav._delegatedMoreTabsClick) {
        tabsNav.removeEventListener('click', tabsNav._delegatedMoreTabsClick, true);
    }
    tabsNav._delegatedMoreTabsClick = delegatedMoreTabsClick;
    tabsNav.addEventListener('click', delegatedMoreTabsClick, true);

    if (typeof clickOutsideTabsHandler === 'function') {
        if (document._clickOutsideTabsHandler) {
            document.removeEventListener('click', document._clickOutsideTabsHandler, true);
        }
        document.addEventListener('click', clickOutsideTabsHandler, true);
        document._clickOutsideTabsHandler = clickOutsideTabsHandler;
    }

    if (window.ResizeObserver) {
        if (tabsNav._resizeObserverInstance) {
            tabsNav._resizeObserverInstance.disconnect();
        }
        const observer = new ResizeObserver(handleTabsResize);
        observer.observe(tabsNav);
        tabsNav._resizeObserverInstance = observer;
    } else {
        if (window._handleTabsResizeHandler) {
            window.removeEventListener('resize', window._handleTabsResizeHandler);
        }
        window.addEventListener('resize', handleTabsResize);
        window._handleTabsResizeHandler = handleTabsResize;
    }

    tabsNav.dataset[initKey] = 'true';
    console.log(`[setupTabsOverflow v15_FIXED] Initial setup complete. Flag ${initKey} set.`);
}

/**
 * Обработчик клика по кнопке "Еще"
 */
export function handleMoreTabsBtnClick(e) {
    e.stopPropagation();
    e.preventDefault();
    const currentDropdown = document.getElementById('moreTabsDropdown');
    if (currentDropdown) {
        currentDropdown.classList.toggle('hidden');
    } else {
        console.error('[handleMoreTabsBtnClick v10.1 - FINAL] Не удалось найти #moreTabsDropdown.');
    }
}

/**
 * Обработчик клика вне области вкладок
 */
export function clickOutsideTabsHandler(e) {
    const currentDropdown = document.getElementById('moreTabsDropdown');
    const currentMoreBtn = document.getElementById('moreTabsBtn');

    if (!currentDropdown || currentDropdown.classList.contains('hidden')) {
        return;
    }

    const isClickOnMoreBtnOrChild = currentMoreBtn && currentMoreBtn.contains(e.target);
    const isClickInsideDropdown = currentDropdown.contains(e.target);

    if (isClickOnMoreBtnOrChild) {
        console.log(
            `[DEBUG clickOutsideHandler v10.1 - FINAL] Click ON/INSIDE moreTabsBtn. No action taken by this handler. Dropdown state: ${
                currentDropdown.classList.contains('hidden') ? 'hidden' : 'visible'
            }. Target:`,
            e.target,
        );
        return;
    }

    if (!isClickInsideDropdown) {
        console.log(
            `[DEBUG clickOutsideHandler v10.1 - FINAL] Hiding dropdown due to click OUTSIDE of dropdown and button. Target:`,
            e.target,
        );
        currentDropdown.classList.add('hidden');
    } else {
        console.log(
            `[DEBUG clickOutsideHandler v10.1 - FINAL] Click INSIDE dropdown. Not hiding via this handler. Target:`,
            e.target,
        );
    }
}

/**
 * Обработчик изменения размера для вкладок
 */
export function handleTabsResize() {
    clearTimeout(State.tabsResizeTimeout);
    State.tabsResizeTimeout = setTimeout(() => {
        const currentDropdown = document.getElementById('moreTabsDropdown');
        if (currentDropdown && !currentDropdown.classList.contains('hidden')) {
            currentDropdown.classList.add('hidden');
        }
        if (deps.updateVisibleTabs && typeof deps.updateVisibleTabs === 'function') {
            deps.updateVisibleTabs();
        } else if (typeof updateVisibleTabs === 'function') {
            updateVisibleTabs();
        } else {
            console.error(
                '[handleTabsResize v13_FIXED] ERROR: updateVisibleTabs function is not defined!',
            );
        }
    }, 250);
}

/**
 * Применяет порядок и видимость панелей
 * @param {Array<string>} order - Массив ID панелей в нужном порядке
 * @param {Array<boolean>} visibility - Массив флагов видимости для каждой панели
 */
export function applyPanelOrderAndVisibility(order, visibility) {
    if (!Array.isArray(order) || !Array.isArray(visibility) || order.length !== visibility.length) {
        console.error(
            '[applyPanelOrderAndVisibility] Неверные параметры: order и visibility должны быть массивами одинаковой длины.',
        );
        return;
    }

    const tabsNav = document.querySelector('header + .border-b nav.flex');
    if (!tabsNav) {
        console.warn('[applyPanelOrderAndVisibility] Навигация вкладок не найдена.');
        return;
    }

    // Создаём карту видимости для быстрого доступа
    const visibilityMap = {};
    order.forEach((panelId, index) => {
        visibilityMap[panelId] = visibility[index];
    });

    // Применяем порядок и видимость
    order.forEach((panelId) => {
        const tabButton = document.getElementById(`${panelId}Tab`);
        if (tabButton) {
            const shouldBeVisible = visibilityMap[panelId] !== false;
            tabButton.classList.toggle('hidden', !shouldBeVisible);
        }
    });

    // Переупорядочиваем вкладки в DOM согласно order
    const fragment = document.createDocumentFragment();
    const processedIds = new Set();

    order.forEach((panelId) => {
        const tabButton = document.getElementById(`${panelId}Tab`);
        if (tabButton && !processedIds.has(panelId)) {
            fragment.appendChild(tabButton);
            processedIds.add(panelId);
        }
    });

    // Добавляем оставшиеся вкладки, которых нет в order
    const allTabs = Array.from(tabsNav.querySelectorAll('.tab-btn:not(#moreTabsBtn)'));
    allTabs.forEach((tab) => {
        const tabId = tab.id.replace('Tab', '');
        if (!processedIds.has(tabId)) {
            fragment.appendChild(tab);
            processedIds.add(tabId);
        }
    });

    // Очищаем навигацию и добавляем вкладки в новом порядке
    const moreTabsBtn = document.getElementById('moreTabsBtn');
    const moreTabsContainer = moreTabsBtn?.parentNode;

    // Сохраняем кнопку "Еще" если она есть
    if (moreTabsContainer && moreTabsBtn) {
        tabsNav.innerHTML = '';
        tabsNav.appendChild(fragment);
        tabsNav.appendChild(moreTabsContainer);
    } else {
        tabsNav.innerHTML = '';
        tabsNav.appendChild(fragment);
        if (moreTabsBtn) {
            tabsNav.appendChild(moreTabsBtn);
        }
    }

    // Обновляем видимость вкладок
    if (deps.updateVisibleTabs && typeof deps.updateVisibleTabs === 'function') {
        requestAnimationFrame(() => {
            deps.updateVisibleTabs();
        });
    } else if (typeof updateVisibleTabs === 'function') {
        requestAnimationFrame(() => {
            updateVisibleTabs();
        });
    }

    console.log('[applyPanelOrderAndVisibility] Порядок и видимость панелей применены.');
}

// ============================================================================
// ФУНКЦИЯ АКТИВАЦИИ ВКЛАДКИ
// ============================================================================

/**
 * Активирует указанную вкладку с анимацией
 * @param {string} tabId - ID вкладки для активации
 * @param {boolean} warningJustAccepted - флаг, что предупреждение было принято
 * @param {object} [navOptions] - contextual-back: navigationSource, scrollRestore, reglamentsSnapshot
 */
export async function setActiveTab(tabId, warningJustAccepted = false, navOptions = {}) {
    if (tabId === 'favorites' && State.currentSection === 'favorites') {
        tabId = State.sectionBeforeFavorites || 'main';
    }
    if (tabId === 'favorites' && State.currentSection !== 'favorites') {
        State.sectionBeforeFavorites = State.currentSection;
    }
    if (tabId === 'reminders' && State.currentSection === 'reminders') {
        tabId = State.sectionBeforeReminders || 'main';
    }
    if (tabId === 'reminders' && State.currentSection !== 'reminders') {
        State.sectionBeforeReminders = State.currentSection;
    }
    const targetTabId = tabId + 'Tab';
    const targetContentId = tabId + 'Content';

    const allTabButtons = document.querySelectorAll('.tab-btn');
    const allTabContents = document.querySelectorAll('.tab-content');
    const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
    const showRemindersHeaderButton = document.getElementById('showRemindersHeaderBtn');

    const FADE_DURATION = 150;

    console.log(`[setActiveTab v.Corrected] Активация вкладки: ${tabId}`);

    let targetContent = document.getElementById(targetContentId);
    // Резервный контур: динамический раздел "Шаблоны" может не быть создан к моменту клика.
    if (!targetContent && tabId === 'shablony' && typeof window.initGoogleDocSections === 'function') {
        try {
            window.initGoogleDocSections();
            targetContent = document.getElementById(targetContentId);
        } catch (error) {
            console.error('[setActiveTab] Ошибка fallback-инициализации раздела "Шаблоны":', error);
        }
    }

    if (!targetContent && tabId !== 'favorites' && tabId !== 'reminders') {
        console.error(
            `[setActiveTab] Контент вкладки "${tabId}" (${targetContentId}) не найден. Переключение отменено.`,
        );
        return;
    }

    if (
        tabId === 'blacklistedClients' &&
        State.userPreferences.showBlacklistUsageWarning &&
        !warningJustAccepted
    ) {
        if (deps.showBlacklistWarning && typeof deps.showBlacklistWarning === 'function') {
            deps.showBlacklistWarning();
        } else {
            console.error('Функция showBlacklistWarning не найдена!');
        }
        return;
    }

    if (showFavoritesHeaderButton) {
        showFavoritesHeaderButton.classList.toggle('text-primary', tabId === 'favorites');
    }
    if (showRemindersHeaderButton) {
        showRemindersHeaderButton.classList.toggle('text-primary', tabId === 'reminders');
    }

    allTabButtons.forEach((button) => {
        const isActive = button.id === targetTabId && tabId !== 'favorites' && tabId !== 'reminders';
        if (isActive) {
            button.classList.add('tab-active');
            button.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        } else {
            button.classList.remove('tab-active');
            button.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        }
    });

    if (State.currentSection === tabId && !warningJustAccepted) {
        if (State.userPreferences.staticHeader) {
            scrollPageToTop();
        }
        console.log(`[setActiveTab v.Corrected] Вкладка ${tabId} уже активна. Выход.`);
        return;
    }

    if (navOptions?.navigationSource === NavigationSource.PROGRAMMATIC) {
        onBeforeProgrammaticSectionChange(State.currentSection, tabId);
    }

    State.currentSection = tabId;
    localStorage.setItem('lastActiveTabCopilot1CO', tabId);
    let currentActiveContent = null;

    allTabContents.forEach((content) => {
        if (!content.classList.contains('hidden')) {
            currentActiveContent = content;
        }
    });

    if (currentActiveContent && currentActiveContent !== targetContent) {
        currentActiveContent.classList.add('is-hiding');

        await new Promise((resolve) => {
            setTimeout(() => {
                currentActiveContent.classList.add('hidden');
                currentActiveContent.classList.remove('is-hiding');

                if (targetContent) {
                    targetContent.classList.add('is-hiding');
                    targetContent.classList.remove('hidden');

                    requestAnimationFrame(() => {
                        targetContent.classList.remove('is-hiding');
                    });
                }
                resolve();
            }, FADE_DURATION);
        });
    } else if (targetContent) {
        targetContent.classList.add('is-hiding');
        targetContent.classList.remove('hidden');
        requestAnimationFrame(() => {
            targetContent.classList.remove('is-hiding');
        });
    }

    // Fail-safe: иногда вкладка остается с opacity:0 после анимации (race при множественных init/RAF).
    // Принудительно нормализуем состояние отображения целевой вкладки.
    if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.remove('is-hiding');
        targetContent.style.opacity = '1';
        targetContent.style.visibility = 'visible';
        targetContent.style.pointerEvents = 'auto';
    }

    if (targetContent && tabId === 'shablony') {
        setTimeout(() => {
            if (State.currentSection !== 'shablony') return;
            targetContent.classList.remove('hidden');
            targetContent.classList.remove('is-hiding');
            targetContent.style.opacity = '1';
            targetContent.style.visibility = 'visible';
            targetContent.style.pointerEvents = 'auto';
        }, FADE_DURATION + 40);
    }

    if (targetContent && tabId === 'favorites') {
        if (deps.renderFavoritesPage && typeof deps.renderFavoritesPage === 'function') {
            await deps.renderFavoritesPage();
        } else {
            console.error('setActiveTab: Функция renderFavoritesPage не найдена!');
        }
    }

    if (targetContent && tabId === 'reminders') {
        if (deps.renderRemindersPage && typeof deps.renderRemindersPage === 'function') {
            await deps.renderRemindersPage();
        } else {
            console.error('setActiveTab: Функция renderRemindersPage не найдена!');
        }
    }

    if (targetContent && tabId === 'training') {
        if (deps.renderTrainingPage && typeof deps.renderTrainingPage === 'function') {
            await deps.renderTrainingPage();
        } else {
            console.error('setActiveTab: Функция renderTrainingPage не найдена!');
        }
    }

    if (targetContent && tabId === 'clientAnalytics') {
        if (deps.renderClientAnalyticsPage && typeof deps.renderClientAnalyticsPage === 'function') {
            await deps.renderClientAnalyticsPage();
        } else if (typeof window.renderClientAnalyticsPage === 'function') {
            await window.renderClientAnalyticsPage();
        } else {
            console.error('setActiveTab: Функция renderClientAnalyticsPage не найдена!');
        }
    }

    if (targetContent && tabId === 'bookmarks') {
        const bookmarksContainer = document.getElementById('bookmarksContainer');
        const hasNoItems =
            bookmarksContainer && !bookmarksContainer.querySelector('.bookmark-item');
        if (hasNoItems && deps.loadBookmarks && typeof deps.loadBookmarks === 'function') {
            await deps.loadBookmarks();
        }
    }

    if (targetContent) {
        document.dispatchEvent(new CustomEvent('copilot1co:tabShown', { detail: { tabId } }));
    }

    if (targetContent && tabId === 'shablony') {
        const shablonyContainer =
            targetContent.querySelector('#doc-content-shablony') ||
            document.getElementById('doc-content-shablony');
        const hasRenderedBlocks = Boolean(
            shablonyContainer && shablonyContainer.querySelector('.shablony-block'),
        );
        const hasMeaningfulText = Boolean(shablonyContainer?.textContent?.trim()?.length);

        console.log('[setActiveTab][shablony] visibility-diagnostics:', {
            hasTargetContent: Boolean(targetContent),
            targetHidden: targetContent.classList.contains('hidden'),
            targetDisplay: window.getComputedStyle(targetContent).display,
            targetOpacity: window.getComputedStyle(targetContent).opacity,
            shablonyContentCount: document.querySelectorAll('#shablonyContent').length,
            hasContainer: Boolean(shablonyContainer),
            shablonyDocContainerCount: document.querySelectorAll('#doc-content-shablony').length,
            containerTextLength: shablonyContainer?.textContent?.trim()?.length || 0,
            hasRenderedBlocks,
        });

        if (
            shablonyContainer &&
            !hasRenderedBlocks &&
            (!hasMeaningfulText || /загрузка|ошибка/i.test(shablonyContainer.textContent || ''))
        ) {
            if (typeof window.loadAndRenderGoogleDoc === 'function') {
                window
                    .loadAndRenderGoogleDoc(SHABLONY_DOC_ID, 'doc-content-shablony', true)
                    .catch((error) => {
                        console.error(
                            '[setActiveTab][shablony] Force-refresh render failed:',
                            error,
                        );
                    });
            }
        }
    }

    if (deps.updateVisibleTabs && typeof deps.updateVisibleTabs === 'function') {
        requestAnimationFrame(deps.updateVisibleTabs);
    } else if (typeof updateVisibleTabs === 'function') {
        requestAnimationFrame(updateVisibleTabs);
    }

    if (navOptions?.navigationSource === NavigationSource.CONTEXTUAL_BACK) {
        await applyReglamentsSnapshotIfNeeded(navOptions.reglamentsSnapshot);
        if (navOptions.scrollRestore) {
            scheduleScrollRestore(navOptions.scrollRestore, FADE_DURATION + 50);
        }
    } else if (State.userPreferences.staticHeader) {
        scrollPageToTop();
    }

    console.log(`[setActiveTab v.Corrected] Вкладка ${tabId} успешно активирована с анимацией.`);
    updateBackButtonUi();
    requestAnimationFrame(() => {
        const visibleModals =
            deps.getVisibleModals && typeof deps.getVisibleModals === 'function'
                ? deps.getVisibleModals()
                : [];
        if (visibleModals.length === 0) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('overflow-hidden');
        }
    });
}

if (typeof window !== 'undefined') {
    window.setActiveTab = setActiveTab;
}
