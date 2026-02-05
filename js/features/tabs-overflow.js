'use strict';

/**
 * Модуль управления переполнением вкладок
 * Содержит функции для адаптивного отображения вкладок с выпадающим меню
 */

import { State } from '../app/state.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setTabsOverflowDependencies)
// ============================================================================

let deps = {
    setActiveTab: null,
};

/**
 * Устанавливает зависимости для модуля Tabs Overflow
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setTabsOverflowDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[TabsOverflow] Зависимости установлены');
}

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const MAX_UPDATE_VISIBLE_TABS_RETRIES = 5;
const LAYOUT_ERROR_MARGIN = 5;

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Обновляет видимость вкладок на основе доступной ширины
 */
export function updateVisibleTabs() {
    const tabsNav = document.querySelector('nav.flex.flex-wrap');
    const moreTabsBtn = document.getElementById('moreTabsBtn');
    const moreTabsDropdown = document.getElementById('moreTabsDropdown');
    const moreTabsContainer = moreTabsBtn ? moreTabsBtn.parentNode : null;

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
        console.warn(
            `[updateVisibleTabs] Element not visible yet (offsetWidth=0). Will recalculate on resize.`,
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
                if (deps.setActiveTab) {
                    deps.setActiveTab(dropdownItem.dataset.tabId);
                }
                if (moreTabsDropdown) moreTabsDropdown.classList.add('hidden');
            });
            dropdownFragment.appendChild(dropdownItem);
        }
        moreTabsDropdown.appendChild(dropdownFragment);
    }
}

/**
 * Настраивает обработчики событий для системы переполнения вкладок
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

    if (document._clickOutsideTabsHandler) {
        document.removeEventListener('click', document._clickOutsideTabsHandler, true);
    }
    document.addEventListener('click', clickOutsideTabsHandler, true);
    document._clickOutsideTabsHandler = clickOutsideTabsHandler;

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
 * Обработчик клика по кнопке "Ещё"
 * @param {Event} e - Событие клика
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
 * Обработчик клика вне выпадающего меню
 * @param {Event} e - Событие клика
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
 * Обработчик изменения размера окна
 */
export function handleTabsResize() {
    clearTimeout(State.tabsResizeTimeout);
    State.tabsResizeTimeout = setTimeout(() => {
        const currentDropdown = document.getElementById('moreTabsDropdown');
        if (currentDropdown && !currentDropdown.classList.contains('hidden')) {
            currentDropdown.classList.add('hidden');
        }
        updateVisibleTabs();
    }, 250);
}
