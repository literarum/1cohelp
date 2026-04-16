'use strict';

/**
 * Модуль управления модальными окнами
 * Обеспечивает работу с fullscreen режимом, проверку блокирующих модальных окон
 */

// ============================================================================
// КОНФИГУРАЦИЯ МОДАЛЬНЫХ ОКОН
// ============================================================================

const UNIFIED_FULLSCREEN_MODAL_CLASSES = {
    modal: ['p-0'],
    innerContainer: [
        'w-screen',
        'h-screen',
        'max-w-none',
        'max-h-none',
        'rounded-none',
        'shadow-none',
    ],
    contentArea: ['h-full', 'max-h-full', 'p-6'],
};

const FOCUSABLE_SELECTOR =
    'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(modal) {
    return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

export function enhanceModalAccessibility(modal, options = {}) {
    if (!modal) return;
    const { labelledBy, describedBy } = options;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (labelledBy) modal.setAttribute('aria-labelledby', labelledBy);
    if (describedBy) modal.setAttribute('aria-describedby', describedBy);
    if (!modal.hasAttribute('tabindex')) {
        modal.setAttribute('tabindex', '-1');
    }
}

export function activateModalFocus(modal) {
    if (!modal || modal._focusTrapActive) return;

    modal._focusTrapActive = true;
    modal._previouslyFocusedElement = document.activeElement;

    const onKeydown = (event) => {
        if (event.key !== 'Tab') return;
        const focusable = getFocusableElements(modal);
        if (!focusable.length) {
            event.preventDefault();
            modal.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !modal.contains(active))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    modal._focusTrapHandler = onKeydown;
    modal.addEventListener('keydown', onKeydown);

    const focusable = getFocusableElements(modal);
    if (focusable.length) {
        focusable[0].focus();
    } else {
        modal.focus();
    }
}

export function deactivateModalFocus(modal) {
    if (!modal) return;

    if (modal._focusTrapHandler) {
        modal.removeEventListener('keydown', modal._focusTrapHandler);
        delete modal._focusTrapHandler;
    }

    modal._focusTrapActive = false;
    const target = modal._previouslyFocusedElement;
    delete modal._previouslyFocusedElement;

    if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus();
    }
}

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С МОДАЛЬНЫМИ ОКНАМИ
// ============================================================================

/**
 * Учитывает скрытие предком (например оверлей с .hidden, внутри которого лежит #xmlAnalyzerCertModal).
 * Иначе getComputedStyle у потомка может не отражать display:none родителя, и getVisibleModals()
 * ложно считает модалку открытой — body.modal-open не снимается и пропадает прокрутка страницы.
 */
function isModalElementActuallyVisible(modal) {
    if (!modal || modal.id === 'commandPaletteModal') return false;
    if (modal.classList.contains('hidden')) return false;

    if (typeof modal.checkVisibility === 'function') {
        try {
            return modal.checkVisibility({
                checkOpacity: false,
                checkVisibilityCSS: true,
                contentVisibilityAuto: true,
            });
        } catch {
            /* старые движки — ниже */
        }
    }

    const style = window.getComputedStyle(modal);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return modal.getClientRects().length > 0;
}

/**
 * Получает видимые модальные окна
 * @returns {HTMLElement[]} Массив видимых модальных окон
 */
export function getVisibleModals() {
    const modals = document.querySelectorAll('[id$="Modal"]');
    return Array.from(modals).filter((modal) => isModalElementActuallyVisible(modal));
}

/**
 * Снимает блокировку прокрутки страницы, если не осталось видимых модалок.
 * Единая точка правды вместо разрозненного remove классов (двойной контур с getVisibleModals).
 */
export function syncBodyScrollLockAfterModalClose() {
    requestAnimationFrame(() => {
        if (getVisibleModals().length === 0) {
            document.body.classList.remove('modal-open', 'overflow-hidden');
        }
    });
}

/**
 * Колесо над затемнённым фоном модалки перенаправляет прокрутку в указанный скроллируемый блок
 * (когда событие не пришло из этого блока — типичный UX для центрированных диалогов).
 *
 * @param {HTMLElement} modalElement - корень модалки (fixed inset-0)
 * @param {string} scrollableSelector - CSS-селектор области с overflow-y: auto/scroll
 */
export function attachModalBackdropWheelScroll(modalElement, scrollableSelector) {
    if (
        !modalElement ||
        !scrollableSelector ||
        modalElement.dataset.backdropWheelScrollAttached === '1'
    )
        return;
    modalElement.dataset.backdropWheelScrollAttached = '1';
    modalElement.addEventListener(
        'wheel',
        (event) => {
            const scrollable = modalElement.querySelector(scrollableSelector);
            if (!scrollable) return;
            if (scrollable.contains(event.target)) return;
            const { scrollTop, scrollHeight, clientHeight } = scrollable;
            if (scrollHeight <= clientHeight) return;
            const delta = event.deltaY;
            const atTop = scrollTop <= 0;
            const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
            if ((delta < 0 && atTop) || (delta > 0 && atBottom)) return;
            scrollable.scrollTop += delta;
            event.preventDefault();
        },
        { passive: false },
    );
}

/**
 * Получает верхнее модальное окно по z-index
 * @param {HTMLElement[]} modals - Массив модальных окон
 * @returns {HTMLElement|null} Верхнее модальное окно или null
 */
export function getTopmostModal(modals) {
    if (!modals || modals.length === 0) return null;
    return modals.reduce((top, current) => {
        if (!top) return current;
        const topZ = parseInt(window.getComputedStyle(top).zIndex, 10) || 0;
        const currentZ = parseInt(window.getComputedStyle(current).zIndex, 10) || 0;
        return currentZ >= topZ ? current : top;
    }, modals[0]);
}

/**
 * Проверяет, есть ли открытые блокирующие модальные окна
 * @returns {boolean} true, если есть блокирующие модальные окна
 */
export function hasBlockingModalsOpen() {
    const modals = getVisibleModals();
    const SAVE_BUTTON_SELECTORS =
        'button[type="submit"], #saveAlgorithmBtn, #createAlgorithmBtn, #saveCibLinkBtn, #saveBookmarkBtn, #saveExtLinkBtn';

    return modals.some((modal) => {
        try {
            if (modal.classList.contains('hidden')) return false;
            const hasFormWithSubmit = !!modal.querySelector('form button[type="submit"]');
            const hasKnownSaveButton = !!modal.querySelector(SAVE_BUTTON_SELECTORS);
            const explicitlyProtected = modal.dataset.protectUnload === 'true';
            return hasFormWithSubmit || hasKnownSaveButton || explicitlyProtected;
        } catch (e) {
            console.warn('beforeunload: ошибка проверки модального окна:', e);
            return false;
        }
    });
}

/**
 * Переключает модальное окно в fullscreen режим
 * @param {string} modalId - ID модального окна
 * @param {string} buttonId - ID кнопки переключения
 * @param {Object} classToggleConfig - Конфигурация классов для переключения
 * @param {string} innerContainerSelector - Селектор внутреннего контейнера
 * @param {string} contentAreaSelector - Селектор области контента (опционально)
 */
export function toggleModalFullscreen(
    modalId,
    buttonId,
    classToggleConfig,
    innerContainerSelector,
    contentAreaSelector,
) {
    const modalElement = document.getElementById(modalId);
    const buttonElement = document.getElementById(buttonId);

    if (!modalElement || !buttonElement) {
        console.error(
            `[toggleModalFullscreen] Error: Elements not found for modalId: ${modalId} or buttonId: ${buttonId}`,
        );
        return;
    }

    const innerContainer = modalElement.querySelector(innerContainerSelector);
    const contentArea = contentAreaSelector
        ? modalElement.querySelector(contentAreaSelector)
        : null;

    if (!innerContainer) {
        console.error(
            `[toggleModalFullscreen] Error: innerContainer not found using selector: "${innerContainerSelector}" within #${modalId}`,
        );
        return;
    }
    if (contentAreaSelector && !contentArea) {
        console.warn(
            `[toggleModalFullscreen] Warning: contentArea not found using selector: "${contentAreaSelector}" within #${modalId}. Proceeding without it.`,
        );
    }

    const icon = buttonElement.querySelector('i');
    const isCurrentlyFullscreen = modalElement.classList.contains('is-fullscreen');
    const shouldBeFullscreen = !isCurrentlyFullscreen;

    console.log(`Toggling fullscreen for ${modalId}. Should be fullscreen: ${shouldBeFullscreen}`);

    const classesToRemoveConfig = isCurrentlyFullscreen
        ? classToggleConfig.fullscreen
        : classToggleConfig.normal;
    const classesToAddConfig = shouldBeFullscreen
        ? classToggleConfig.fullscreen
        : classToggleConfig.normal;

    // Удаляем классы из нормального режима
    if (classesToRemoveConfig.modal) {
        modalElement.classList.remove(...classesToRemoveConfig.modal);
    }
    if (classesToRemoveConfig.innerContainer && innerContainer) {
        innerContainer.classList.remove(...classesToRemoveConfig.innerContainer);
    }
    if (classesToRemoveConfig.contentArea && contentArea) {
        contentArea.classList.remove(...classesToRemoveConfig.contentArea);
    }

    // Добавляем классы для fullscreen режима
    if (classesToAddConfig.modal) {
        modalElement.classList.add(...classesToAddConfig.modal);
    }
    if (classesToAddConfig.innerContainer && innerContainer) {
        innerContainer.classList.add(...classesToAddConfig.innerContainer);
    }
    if (classesToAddConfig.contentArea && contentArea) {
        contentArea.classList.add(...classesToAddConfig.contentArea);
    }

    // Переключаем класс is-fullscreen
    if (shouldBeFullscreen) {
        modalElement.classList.add('is-fullscreen');
        if (icon) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
        }
        buttonElement.title = 'Свернуть';
        buttonElement.setAttribute('aria-label', 'Свернуть');
        buttonElement.setAttribute('aria-expanded', 'true');
    } else {
        modalElement.classList.remove('is-fullscreen');
        if (icon) {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
        buttonElement.title = 'Развернуть на весь экран';
        buttonElement.setAttribute('aria-label', 'Развернуть на весь экран');
        buttonElement.setAttribute('aria-expanded', 'false');
    }
}

/**
 * Если модалка в `is-fullscreen`, возвращает обычные классы (централизованно, без смены `hidden`).
 * Вызывать при закрытии окна или перед повторным открытием, чтобы не застревало в полноэкранной вёрстке.
 * @param {string} modalId
 * @param {Object} config - тот же объект, что в FULLSCREEN_MODAL_CONFIGS
 */
export function collapseModalFullscreenIfActive(modalId, config) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !config || !modalElement.classList.contains('is-fullscreen')) return;
    toggleModalFullscreen(
        config.modalId,
        config.buttonId,
        config.classToggleConfig,
        config.innerContainerSelector,
        config.contentAreaSelector,
    );
}

/**
 * Привязать один обработчик fullscreen по конфигу (идемпотентно).
 * @param {Object} config - как в FULLSCREEN_MODAL_CONFIGS
 * @param {{ silent?: boolean }} [options] - silent: без console (для повторной привязки при открытии модалки)
 * @returns {boolean} true, если кнопка и модалка найдены и обработчик повешен
 */
export function attachFullscreenToggleForConfig(config, options = {}) {
    const silent = Boolean(options.silent);
    const button = document.getElementById(config.buttonId);
    const modal = document.getElementById(config.modalId);

    if (button && modal) {
        if (button._fullscreenToggleHandler) {
            button.removeEventListener('click', button._fullscreenToggleHandler);
        }

        button._fullscreenToggleHandler = () => {
            toggleModalFullscreen(
                config.modalId,
                config.buttonId,
                config.classToggleConfig,
                config.innerContainerSelector,
                config.contentAreaSelector,
            );
        };

        button.addEventListener('click', button._fullscreenToggleHandler);
        if (!silent) {
            console.log(
                `Fullscreen toggle handler attached to #${config.buttonId} for #${config.modalId}.`,
            );
        }
        return true;
    }

    if (!silent) {
        if (!button) {
            console.debug(
                `[initFullscreenToggles] Button #${config.buttonId} not found (may be created later).`,
            );
        }
        if (!modal) {
            console.debug(
                `[initFullscreenToggles] Modal #${config.modalId} not found for #${config.buttonId}.`,
            );
        }
    }
    return false;
}

/**
 * Повторная привязка без логов: на старте init иногда не находит #toggleFullscreenAppCustomizationBtn
 * (порядок загрузки / кэш), а к открытию окна узел уже в DOM.
 * @param {Object} config
 */
export function ensureFullscreenToggleForConfig(config) {
    attachFullscreenToggleForConfig(config, { silent: true });
}

/**
 * Инициализирует обработчики для переключения fullscreen режима модальных окон
 * @param {Object[]} modalConfigs - Массив конфигураций модальных окон
 */
export function initFullscreenToggles(modalConfigs) {
    if (!Array.isArray(modalConfigs) || modalConfigs.length === 0) {
        console.debug('[initFullscreenToggles] No modal configs provided, skipping.');
        return;
    }

    console.log('[initFullscreenToggles] Initializing fullscreen toggles for modals...');

    modalConfigs.forEach((c) => attachFullscreenToggleForConfig(c));
    console.log('[initFullscreenToggles] Finished attaching handlers for modals.');
}

/**
 * Инициализирует обработчик beforeunload для блокирующих модальных окон.
 * При перезагрузке через Ctrl/Cmd+R показывается модальное окно приложения (см. hotkeys-handler).
 * Для кнопки перезагрузки браузера API не позволяет показать своё окно — остаётся нативный диалог.
 */
export function initBeforeUnloadHandler() {
    window.addEventListener('beforeunload', (event) => {
        if (hasBlockingModalsOpen()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

/**
 * Инициализирует вертикальные разделители с перетаскиванием внутри контейнера.
 * Механизм централизованный и может переиспользоваться в любых модалках.
 *
 * Ожидаемая разметка:
 * - split root: .js-draggable-split
 * - левая панель: [data-split-pane="left"]
 * - правая панель: [data-split-pane="right"]
 * - вертикальный handle: .js-draggable-splitter
 *
 * Доп. data-атрибуты для split root:
 * - data-split-min-left
 * - data-split-min-right
 * - data-split-storage-key (опционально, для запоминания ширины)
 */
export function initDraggableVerticalSplitters(rootElement, options = {}) {
    const root =
        rootElement && typeof rootElement.querySelectorAll === 'function' ? rootElement : document;
    const splitSelector = options.splitSelector || '.js-draggable-split';
    const handleSelector = options.handleSelector || '.js-draggable-splitter';
    const leftSelector = options.leftSelector || '[data-split-pane="left"]';
    const rightSelector = options.rightSelector || '[data-split-pane="right"]';
    const defaultMinLeft = Number.isFinite(options.defaultMinLeft) ? options.defaultMinLeft : 220;
    const defaultMinRight = Number.isFinite(options.defaultMinRight)
        ? options.defaultMinRight
        : 280;

    const splitRoots = root.querySelectorAll(splitSelector);
    splitRoots.forEach((splitRoot) => {
        if (splitRoot.dataset.verticalSplitterReady === '1') {
            return;
        }

        const handle = splitRoot.querySelector(handleSelector);
        const leftPane = splitRoot.querySelector(leftSelector);
        const rightPane = splitRoot.querySelector(rightSelector);
        if (!handle || !leftPane || !rightPane) {
            return;
        }

        const readNumber = (rawValue, fallback) => {
            const parsed = Number.parseFloat(rawValue);
            return Number.isFinite(parsed) ? parsed : fallback;
        };

        const minLeft = readNumber(splitRoot.dataset.splitMinLeft, defaultMinLeft);
        const minRight = readNumber(splitRoot.dataset.splitMinRight, defaultMinRight);
        const storageKey = (splitRoot.dataset.splitStorageKey || '').trim();

        const applyLeftWidth = (widthPx) => {
            const numericWidth = Number.isFinite(widthPx) ? widthPx : minLeft;
            leftPane.style.flex = `0 0 ${numericWidth}px`;
            leftPane.style.width = `${numericWidth}px`;
            rightPane.style.flex = '1 1 auto';
            splitRoot.dataset.splitCurrentLeft = String(Math.round(numericWidth));
        };

        const clampLeftWidth = (widthPx, containerWidth) => {
            const maxLeft = Math.max(minLeft, containerWidth - minRight);
            return Math.min(Math.max(widthPx, minLeft), maxLeft);
        };

        if (storageKey) {
            try {
                const storedRaw = window.localStorage.getItem(storageKey);
                const storedWidth = Number.parseFloat(storedRaw || '');
                if (Number.isFinite(storedWidth)) {
                    const containerWidth = splitRoot.getBoundingClientRect().width;
                    applyLeftWidth(clampLeftWidth(storedWidth, containerWidth));
                }
            } catch (error) {
                console.warn(
                    '[initDraggableVerticalSplitters] Не удалось прочитать localStorage:',
                    error,
                );
            }
        }

        const persistCurrentWidth = () => {
            if (!storageKey) return;
            const currentWidth = Number.parseFloat(splitRoot.dataset.splitCurrentLeft || '');
            if (!Number.isFinite(currentWidth)) return;
            try {
                window.localStorage.setItem(storageKey, String(currentWidth));
            } catch (error) {
                console.warn(
                    '[initDraggableVerticalSplitters] Не удалось записать localStorage:',
                    error,
                );
            }
        };

        const HANDLE_HIT_MARGIN_PX = 40;

        const isPointerInHandleZone = (clientX, clientY) => {
            const rect = handle.getBoundingClientRect();
            return (
                clientX >= rect.left - HANDLE_HIT_MARGIN_PX &&
                clientX <= rect.right + HANDLE_HIT_MARGIN_PX &&
                clientY >= rect.top &&
                clientY <= rect.bottom
            );
        };

        const onPointerDown = (event) => {
            if (event.button !== 0) return;
            const modalForVisibility = splitRoot.closest('#dbMergeModal');
            if (modalForVisibility?.classList.contains('hidden')) return;
            if (!isPointerInHandleZone(event.clientX, event.clientY)) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const modalEl = splitRoot.closest('#dbMergeModal');
            if (modalEl) modalEl.style.overflow = 'hidden';

            try {
                splitRoot.setPointerCapture(event.pointerId);
            } catch {
                /* ignore if unsupported */
            }

            const startX = event.clientX;
            const startLeftWidth = leftPane.getBoundingClientRect().width;
            const containerWidth = splitRoot.getBoundingClientRect().width;

            splitRoot.classList.add('is-resizing');
            document.body.classList.add('is-col-resizing');

            const onPointerMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const nextWidth = clampLeftWidth(startLeftWidth + deltaX, containerWidth);
                applyLeftWidth(nextWidth);
            };

            const onPointerUp = (upEvent) => {
                try {
                    splitRoot.releasePointerCapture(upEvent.pointerId);
                } catch {
                    /* ignore */
                }
                splitRoot.classList.remove('is-resizing');
                document.body.classList.remove('is-col-resizing');
                if (modalEl) modalEl.style.overflow = '';
                persistCurrentWidth();
                document.removeEventListener('pointermove', onPointerMove, true);
                document.removeEventListener('pointerup', onPointerUp, true);
            };

            document.addEventListener('pointermove', onPointerMove, true);
            document.addEventListener('pointerup', onPointerUp, true);
        };

        splitRoot.addEventListener('pointerdown', onPointerDown, { capture: true });

        const modalEl = splitRoot.closest('#dbMergeModal');
        if (modalEl && splitRoot.classList.contains('db-merge-body')) {
            modalEl.addEventListener('pointerdown', onPointerDown, { capture: true });
            document.addEventListener('pointerdown', onPointerDown, { capture: true });

            const onModalPointerMove = (e) => {
                if (modalEl.classList.contains('hidden')) {
                    modalEl.style.overflow = '';
                    return;
                }
                if (splitRoot.classList.contains('is-resizing')) return;
                if (isPointerInHandleZone(e.clientX, e.clientY)) {
                    modalEl.style.overflow = 'hidden';
                } else {
                    modalEl.style.overflow = '';
                }
            };
            modalEl.addEventListener('pointermove', onModalPointerMove, { passive: true });
        }

        splitRoot.dataset.verticalSplitterReady = '1';
    });
}

/**
 * Показывает модальное окно с информацией о том, что клиент не знает ИНН
 * @param {Function} addEscapeHandler - функция для добавления обработчика Escape
 * @param {Function} removeEscapeHandler - функция для удаления обработчика Escape
 * @param {Function} getVisibleModals - функция для получения видимых модальных окон
 */
export function showNoInnModal(addEscapeHandler, removeEscapeHandler, getVisibleModals) {
    let modal = document.getElementById('noInnModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'noInnModal';
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 z-[60] p-4 flex items-center justify-center hidden';
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
            if (!e.target.closest('.close-modal')) return;
            e.preventDefault();
            e.stopPropagation();
            modal.classList.add('hidden');
            if (typeof removeEscapeHandler === 'function') {
                removeEscapeHandler(modal);
            }
            const visibleModals = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
            if (visibleModals.length === 0) {
                document.body.classList.remove('overflow-hidden');
            }
        });
    }
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (typeof addEscapeHandler === 'function') {
        addEscapeHandler(modal);
    }
}

// Экспортируем константы
export { UNIFIED_FULLSCREEN_MODAL_CLASSES };
