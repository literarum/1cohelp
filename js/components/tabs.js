'use strict';

import { MAX_UPDATE_VISIBLE_TABS_RETRIES } from '../constants.js';
import { State } from '../app/state.js';
import { tabsConfig } from '../config.js';

// Зависимости модуля
let deps = {
    setActiveTab: null,
    showBlacklistWarning: null,
    renderFavoritesPage: null,
    updateVisibleTabs: null,
    getVisibleModals: null,
};

/**
 * Установка зависимостей модуля
 * @param {Object} dependencies - объект с зависимостями
 */
export function setTabsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
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
        'tab-btn relative px-1 py-2 sm:px-3 sm:py-2 border-b-2 font-medium text-sm focus:outline-none transition-colors whitespace-nowrap border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${tabConfig.id}Content`);

    let buttonContent = '';
    if (tabConfig.icon) {
        buttonContent += `<i class="fas ${tabConfig.icon} sm:mr-2"></i>`;
    }

    if (tabConfig.icon) {
        buttonContent += `<span class="hidden sm:inline">${tabConfig.name}</span>`;
        button.title = tabConfig.name;
    } else {
        buttonContent += `<span>${tabConfig.name}</span>`;
    }
    button.innerHTML = buttonContent;

    button.addEventListener('click', () => {
        if (deps.setActiveTab) {
            deps.setActiveTab(tabConfig.id);
        } else if (typeof window.setActiveTab === 'function') {
            window.setActiveTab(tabConfig.id);
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
        console.warn(
            `[updateVisibleTabs v8_FIXED - Retry ${State.updateVisibleTabsRetryCount}/${MAX_UPDATE_VISIBLE_TABS_RETRIES}] tabsNav.offsetWidth is 0. Retrying in next frame...`,
        );
        requestAnimationFrame(updateVisibleTabs);
        return;
    } else if (
        tabsNav.offsetWidth === 0 &&
        State.updateVisibleTabsRetryCount >= MAX_UPDATE_VISIBLE_TABS_RETRIES
    ) {
        console.error(
            `[updateVisibleTabs v8_FIXED - Max Retries Reached] tabsNav.offsetWidth is still 0. Calculation skipped.`,
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
    let totalWidth = 0;
    let firstOverflowIndex = -1;

    let moreTabsWidth = 0;
    if (moreTabsContainer) {
        const wasMoreButtonHidden = moreTabsContainer.classList.contains('hidden');
        if (wasMoreButtonHidden) moreTabsContainer.classList.remove('hidden');
        moreTabsWidth = moreTabsContainer.offsetWidth;
        if (wasMoreButtonHidden) moreTabsContainer.classList.add('hidden');
    }

    for (let i = 0; i < visibleTabs.length; i++) {
        const tab = visibleTabs[i];
        const currentTabWidth = tab.offsetWidth;

        if (currentTabWidth === 0) {
            console.warn(
                `[updateVisibleTabs v8_FIXED] Tab ${
                    tab.id || 'with no id'
                } has offsetWidth 0! Skipping.`,
            );
            continue;
        }

        if (totalWidth + currentTabWidth + moreTabsWidth + LAYOUT_ERROR_MARGIN > navWidth) {
            firstOverflowIndex = i;
            break;
        }
        totalWidth += currentTabWidth;
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
                'block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 overflow-dropdown-item';
            const icon = tab.querySelector('i');
            const text = tab.textContent.trim();
            dropdownItem.innerHTML = `${icon ? icon.outerHTML + ' ' : ''}${text}`;
            dropdownItem.dataset.tabId = tab.id.replace('Tab', '');
            dropdownItem.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.setActiveTab === 'function') {
                    window.setActiveTab(dropdownItem.dataset.tabId);
                }
                if (moreTabsDropdown) moreTabsDropdown.classList.add('hidden');
            });
            dropdownFragment.appendChild(dropdownItem);
        }
        moreTabsDropdown.appendChild(dropdownFragment);
    }
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

    const moreTabsBtn = document.getElementById('moreTabsBtn');
    if (moreTabsBtn) {
        if (moreTabsBtn._clickHandler) {
            moreTabsBtn.removeEventListener('click', moreTabsBtn._clickHandler, true);
        }
        moreTabsBtn.addEventListener('click', handleMoreTabsBtnClick, true);
        moreTabsBtn._clickHandler = handleMoreTabsBtnClick;
    }

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
 */
export async function setActiveTab(tabId, warningJustAccepted = false) {
    const targetTabId = tabId + 'Tab';
    const targetContentId = tabId + 'Content';

    const allTabButtons = document.querySelectorAll('.tab-btn');
    const allTabContents = document.querySelectorAll('.tab-content');
    const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');

    const FADE_DURATION = 150;

    console.log(`[setActiveTab v.Corrected] Активация вкладки: ${tabId}`);

    if (
        tabId === 'blacklistedClients' &&
        State.userPreferences.showBlacklistUsageWarning &&
        !warningJustAccepted
    ) {
        if (deps.showBlacklistWarning && typeof deps.showBlacklistWarning === 'function') {
            deps.showBlacklistWarning();
        } else if (typeof showBlacklistWarning === 'function') {
            showBlacklistWarning();
        } else {
            console.error('Функция showBlacklistWarning не найдена!');
        }
        return;
    }

    if (showFavoritesHeaderButton) {
        showFavoritesHeaderButton.classList.toggle('text-primary', tabId === 'favorites');
    }

    allTabButtons.forEach((button) => {
        const isActive = button.id === targetTabId && tabId !== 'favorites';
        if (isActive) {
            button.classList.add('tab-active');
            button.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        } else {
            button.classList.remove('tab-active');
            button.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        }
    });

    if (State.currentSection === tabId && !warningJustAccepted) {
        console.log(`[setActiveTab v.Corrected] Вкладка ${tabId} уже активна. Выход.`);
        return;
    }

    const previousSection = State.currentSection;
    State.currentSection = tabId;
    localStorage.setItem('lastActiveTabCopilot1CO', tabId);

    const targetContent = document.getElementById(targetContentId);
    let currentActiveContent = null;

    allTabContents.forEach((content) => {
        if (!content.classList.contains('hidden')) {
            currentActiveContent = content;
        }
    });

    if (currentActiveContent && currentActiveContent !== targetContent) {
        currentActiveContent.classList.add('is-hiding');

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
        }, FADE_DURATION);
    } else if (targetContent) {
        targetContent.classList.add('is-hiding');
        targetContent.classList.remove('hidden');
        requestAnimationFrame(() => {
            targetContent.classList.remove('is-hiding');
        });
    }

    if (targetContent && tabId === 'favorites') {
        if (deps.renderFavoritesPage && typeof deps.renderFavoritesPage === 'function') {
            await deps.renderFavoritesPage();
        } else if (typeof renderFavoritesPage === 'function') {
            await renderFavoritesPage();
        } else {
            console.error('setActiveTab: Функция renderFavoritesPage не найдена!');
        }
    }

    if (deps.updateVisibleTabs && typeof deps.updateVisibleTabs === 'function') {
        requestAnimationFrame(deps.updateVisibleTabs);
    } else if (typeof updateVisibleTabs === 'function') {
        requestAnimationFrame(updateVisibleTabs);
    }

    console.log(`[setActiveTab v.Corrected] Вкладка ${tabId} успешно активирована с анимацией.`);
    requestAnimationFrame(() => {
        const visibleModals = deps.getVisibleModals && typeof deps.getVisibleModals === 'function'
            ? deps.getVisibleModals()
            : typeof getVisibleModals === 'function'
            ? getVisibleModals()
            : [];
        if (visibleModals.length === 0) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('overflow-hidden');
        }
    });
}
