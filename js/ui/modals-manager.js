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

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С МОДАЛЬНЫМИ ОКНАМИ
// ============================================================================

/**
 * Получает видимые модальные окна
 * @returns {HTMLElement[]} Массив видимых модальных окон
 */
export function getVisibleModals() {
    const modals = document.querySelectorAll('[id$="Modal"]:not(.hidden)');
    return Array.from(modals).filter((modal) => {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
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
    } else {
        modalElement.classList.remove('is-fullscreen');
        if (icon) {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
        buttonElement.title = 'Развернуть на весь экран';
    }
}

/**
 * Инициализирует обработчики для переключения fullscreen режима модальных окон
 * @param {Object[]} modalConfigs - Массив конфигураций модальных окон
 */
export function initFullscreenToggles(modalConfigs) {
    if (!Array.isArray(modalConfigs) || modalConfigs.length === 0) {
        console.warn('[initFullscreenToggles] No modal configs provided.');
        return;
    }

    console.log('[initFullscreenToggles] Initializing fullscreen toggles for modals...');

    const attachHandler = (config) => {
        const button = document.getElementById(config.buttonId);
        const modal = document.getElementById(config.modalId);

        if (button && modal) {
            // Удаляем старый обработчик, если есть
            if (button._fullscreenToggleHandler) {
                button.removeEventListener('click', button._fullscreenToggleHandler);
            }

            // Создаем новый обработчик
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
            console.log(
                `Fullscreen toggle handler attached to #${config.buttonId} for #${config.modalId}.`,
            );
        } else {
            if (!button)
                console.warn(`[initFullscreenToggles] Button #${config.buttonId} not found.`);
            if (!modal)
                console.warn(
                    `[initFullscreenToggles] Modal #${config.modalId} not found for button #${config.buttonId}.`,
                );
        }
    };

    modalConfigs.forEach(attachHandler);
    console.log('[initFullscreenToggles] Finished attaching handlers for modals.');
}

/**
 * Инициализирует обработчик beforeunload для блокирующих модальных окон
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
            if (e.target === modal || e.target.closest('.close-modal')) {
                modal.classList.add('hidden');
                if (typeof removeEscapeHandler === 'function') {
                    removeEscapeHandler(modal);
                }
                const visibleModals = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
                if (visibleModals.length === 0) {
                    document.body.classList.remove('overflow-hidden');
                }
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
