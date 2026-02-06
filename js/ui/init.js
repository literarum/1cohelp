'use strict';

/**
 * Модуль инициализации UI компонентов
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let setActiveTab = null;
let getVisibleModals = null;
let getTopmostModal = null;
let toggleModalFullscreen = null;
let showNotification = null;
let renderFavoritesPage = null;
let updateVisibleTabs = null;
let showBlacklistWarning = null;
let hotkeysModalConfig = null;

export function setUIInitDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.setActiveTab !== undefined) setActiveTab = deps.setActiveTab;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
    if (deps.getTopmostModal !== undefined) getTopmostModal = deps.getTopmostModal;
    if (deps.toggleModalFullscreen !== undefined) toggleModalFullscreen = deps.toggleModalFullscreen;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.renderFavoritesPage !== undefined) renderFavoritesPage = deps.renderFavoritesPage;
    if (deps.updateVisibleTabs !== undefined) updateVisibleTabs = deps.updateVisibleTabs;
    if (deps.showBlacklistWarning !== undefined) showBlacklistWarning = deps.showBlacklistWarning;
    if (deps.hotkeysModalConfig !== undefined) hotkeysModalConfig = deps.hotkeysModalConfig;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ
// ============================================================================

/**
 * Инициализирует основной UI приложения
 */
export function initUI() {
    if (typeof setActiveTab === 'function') {
        setActiveTab('main');
    } else if (typeof window.setActiveTab === 'function') {
        window.setActiveTab('main');
    } else {
        console.error('initUI: Функция setActiveTab не найдена!');
    }
}

/**
 * Инициализирует взаимодействия с шагами алгоритма
 * @param {HTMLElement} stepElement - элемент шага
 */
export function initStepInteractions(stepElement) {
    const header = stepElement.querySelector('.step-header');
    const titleInput = stepElement.querySelector('.step-title');
    const titlePreview = stepElement.querySelector('.step-title-preview');

    if (!header || !titleInput || !titlePreview) {
        console.warn(
            'initStepInteractions: Не найдены все необходимые элементы в шаге для инициализации.',
            stepElement,
        );
        return;
    }

    const updateTitlePreview = () => {
        const stepNumberLabel = stepElement.querySelector('.step-number-label');
        const stepNumber = stepNumberLabel
            ? stepNumberLabel.textContent.replace('Шаг ', '')
            : '';
        titlePreview.value = titleInput.value || `Шаг ${stepNumber}`;
    };

    titleInput.addEventListener('input', updateTitlePreview);
    updateTitlePreview();

    header.addEventListener('click', (event) => {
        if (event.target.closest('.step-drag-handle, .delete-step')) {
            return;
        }
        stepElement.classList.toggle('is-collapsed');
    });
}

/**
 * Инициализирует кнопки сворачивания/разворачивания всех шагов
 * @param {HTMLElement} container - контейнер с шагами
 * @param {string} stepsContainerSelector - селектор контейнера шагов
 */
export function initCollapseAllButtons(container, stepsContainerSelector) {
    const titleElement = container.querySelector('.text-xl.font-bold');
    if (!titleElement) return;

    let controlsContainer = titleElement.parentElement.querySelector('.collapse-controls');
    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.className = 'collapse-controls flex items-center gap-2 ml-4';
        titleElement.parentElement.insertBefore(controlsContainer, titleElement.nextSibling);
    }

    controlsContainer.innerHTML = `
        <button type="button" class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100" data-action="collapse-all">Свернуть все</button>
        <button type="button" class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-gray-100" data-action="expand-all">Развернуть все</button>
    `;

    controlsContainer.addEventListener('click', (event) => {
        const action = event.target.dataset.action;
        if (action === 'collapse-all' || action === 'expand-all') {
            const stepsContainer = container.querySelector(stepsContainerSelector);
            if (stepsContainer) {
                const steps = stepsContainer.querySelectorAll('.edit-step');
                steps.forEach((step) => {
                    step.classList.toggle('is-collapsed', action === 'collapse-all');
                });
            }
        }
    });
}

/**
 * Инициализирует модальное окно горячих клавиш
 */
export function initHotkeysModal() {
    const showHotkeysBtn = document.getElementById('showHotkeysBtn');
    const hotkeysModal = document.getElementById('hotkeysModal');
    const closeHotkeysModalBtn = document.getElementById('closeHotkeysModalBtn');
    const okHotkeysModalBtn = document.getElementById('okHotkeysModalBtn');
    const fullscreenBtn = document.getElementById('toggleFullscreenHotkeysBtn');

    if (
        !showHotkeysBtn ||
        !hotkeysModal ||
        !closeHotkeysModalBtn ||
        !okHotkeysModalBtn ||
        !fullscreenBtn
    ) {
        console.warn(
            'Не найдены все элементы для модального окна горячих клавиш ' +
                '(#showHotkeysBtn, #hotkeysModal, #closeHotkeysModalBtn, #okHotkeysModalBtn, #toggleFullscreenHotkeysBtn). ' +
                'Функциональность может быть нарушена.',
        );
        return;
    }

    if (hotkeysModal._escapeHandlerInstance) {
        document.removeEventListener('keydown', hotkeysModal._escapeHandlerInstance);
        delete hotkeysModal._escapeHandlerInstance;
    }

    const handleEscapeKeyInternal = (event) => {
        if (event.key === 'Escape') {
            if (hotkeysModal && !hotkeysModal.classList.contains('hidden')) {
                const visibleModals = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
                const topmostModal =
                    visibleModals.length > 0 && typeof getTopmostModal === 'function'
                        ? getTopmostModal(visibleModals)
                        : null;
                if (topmostModal && topmostModal.id !== hotkeysModal.id) {
                    console.log(
                        `[HotkeysModal Escape] Event not handled, topmost is ${topmostModal.id}`,
                    );
                    return;
                }

                closeModalInternal();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        }
    };

    const openModal = () => {
        if (!hotkeysModal) return;
        hotkeysModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (hotkeysModal._escapeHandlerInstance) {
            document.removeEventListener('keydown', hotkeysModal._escapeHandlerInstance);
        }
        hotkeysModal._escapeHandlerInstance = handleEscapeKeyInternal;
        document.addEventListener('keydown', hotkeysModal._escapeHandlerInstance);
        console.log('Hotkey modal opened, Escape listener added.');
    };

    const closeModalInternal = () => {
        if (!hotkeysModal) return;
        hotkeysModal.classList.add('hidden');
        const visibleModals = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
        if (visibleModals.length === 0) {
            document.body.classList.remove('overflow-hidden');
        }
        if (hotkeysModal._escapeHandlerInstance) {
            document.removeEventListener('keydown', hotkeysModal._escapeHandlerInstance);
            delete hotkeysModal._escapeHandlerInstance;
        }
        console.log('Hotkey modal closed, Escape listener removed.');
    };

    if (!showHotkeysBtn.dataset.listenerAttached) {
        showHotkeysBtn.addEventListener('click', openModal);
        showHotkeysBtn.dataset.listenerAttached = 'true';
    }

    if (!closeHotkeysModalBtn.dataset.listenerAttached) {
        closeHotkeysModalBtn.addEventListener('click', closeModalInternal);
        closeHotkeysModalBtn.dataset.listenerAttached = 'true';
    }
    if (!okHotkeysModalBtn.dataset.listenerAttached) {
        okHotkeysModalBtn.addEventListener('click', closeModalInternal);
        okHotkeysModalBtn.dataset.listenerAttached = 'true';
    }

    if (!hotkeysModal.dataset.overlayListenerAttached) {
        hotkeysModal.addEventListener('click', (event) => {
            if (event.target === hotkeysModal) {
                closeModalInternal();
            }
        });
        hotkeysModal.dataset.overlayListenerAttached = 'true';
    }

    if (fullscreenBtn && !fullscreenBtn.dataset.fullscreenListenerAttached) {
        fullscreenBtn.addEventListener('click', () => {
            if (typeof toggleModalFullscreen === 'function' && hotkeysModalConfig) {
                toggleModalFullscreen(
                    hotkeysModalConfig.modalId,
                    hotkeysModalConfig.buttonId,
                    hotkeysModalConfig.classToggleConfig,
                    hotkeysModalConfig.innerContainerSelector,
                    hotkeysModalConfig.contentAreaSelector,
                );
            } else {
                console.error('Функция toggleModalFullscreen не найдена или конфигурация отсутствует!');
                if (typeof showNotification === 'function') {
                    showNotification(
                        'Ошибка: Функция переключения полноэкранного режима недоступна.',
                        'error',
                    );
                }
            }
        });
        fullscreenBtn.dataset.fullscreenListenerAttached = 'true';
        console.log(`Fullscreen listener attached to ${hotkeysModalConfig?.buttonId || 'unknown'}`);
    }

    console.log('Модальное окно горячих клавиш инициализировано.');
}
