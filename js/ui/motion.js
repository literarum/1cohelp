'use strict';

import { isReducedMotion } from '../utils/motion-pref.js';

/**
 * Лёгкие вспомогательные функции анимаций (вся визуальная часть — css/components/motion.css).
 * Никаких постоянных циклов: только разовые классы на короткое время.
 */

export function prefersReducedMotion() {
    return isReducedMotion();
}

/**
 * Плавно скрыть элемент перед удалением из DOM.
 * @param {Element | null} el
 * @returns {Promise<void>} резолвится, когда можно удалять элемент (не дольше ~300 мс)
 */
export function animateRemoval(el) {
    if (!el || prefersReducedMotion()) return Promise.resolve();
    return new Promise((resolve) => {
        el.classList.add('motion-removing');
        setTimeout(resolve, 230);
    });
}

/** Показать на кнопке галочку «сохранено» (≈1 с). */
export function flashButtonSuccess(btn) {
    if (!btn || prefersReducedMotion()) return;
    btn.classList.remove('motion-save-success');
    void btn.offsetWidth; // перезапуск анимации
    btn.classList.add('motion-save-success');
    setTimeout(() => btn.classList.remove('motion-save-success'), 1150);
}

/** «Встряхнуть» невалидное поле. */
export function shakeField(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('motion-field-shake');
    void el.offsetWidth;
    el.classList.add('motion-field-shake');
    setTimeout(() => el.classList.remove('motion-field-shake'), 380);
}

// Tab navigation owns its opacity transition in app/tabs.js. A capture-click
// body animation used to animate the outgoing panel and truncate card staggers.
