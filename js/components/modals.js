'use strict';

import { SAVE_BUTTON_SELECTORS } from '../config.js';

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С МОДАЛЬНЫМИ ОКНАМИ
// ============================================================================

/**
 * Получает все видимые модальные окна
 */
export function getVisibleModals() {
    return Array.from(
        document.querySelectorAll('div.fixed.inset-0.bg-black.bg-opacity-50:not(.hidden)'),
    );
}

/**
 * Проверяет, есть ли открытые блокирующие модальные окна
 */
export function hasBlockingModalsOpen() {
    const modals = getVisibleModals();
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
 * Получает верхнее модальное окно по z-index
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
 * Инициализирует обработчик beforeunload для защиты от потери данных
 */
export function initBeforeUnloadProtection() {
    window.addEventListener('beforeunload', (event) => {
        if (hasBlockingModalsOpen()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

// Автоинициализация защиты от потери данных
initBeforeUnloadProtection();
