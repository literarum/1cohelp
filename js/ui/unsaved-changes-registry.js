'use strict';

/**
 * Централизованный реестр проверки «грязного» состояния модальных окон.
 * Предупреждение «Выйти без сохранения» показывается только если для модалки
 * зарегистрирована проверка и она возвращает true (есть несохранённые изменения).
 */

/** @type {Map<string, (modal: HTMLElement) => boolean>} */
const dirtyCheckers = new Map();

/**
 * Регистрирует проверку несохранённых изменений для модального окна.
 * @param {string} modalId - id элемента модального окна (например 'editModal', 'bookmarkModal')
 * @param {(modal: HTMLElement) => boolean} getDirtyState - функция: возвращает true, если есть несохранённые изменения
 */
export function registerModalDirtyCheck(modalId, getDirtyState) {
    if (!modalId || typeof getDirtyState !== 'function') return;
    dirtyCheckers.set(modalId, getDirtyState);
}

/**
 * Определяет, нужно ли перед закрытием модалки показывать подтверждение «Выйти без сохранения».
 * Возвращает true только если модалка зарегистрирована и её проверка возвращает true (есть изменения).
 * @param {HTMLElement|null} modal - элемент модального окна
 * @returns {boolean}
 */
export function shouldConfirmBeforeClose(modal) {
    if (!modal || !modal.id) return false;
    const checker = dirtyCheckers.get(modal.id);
    if (!checker) return false;
    try {
        return Boolean(checker(modal));
    } catch (e) {
        console.warn('[unsaved-changes-registry] dirty check failed for', modal.id, e);
        return false;
    }
}
