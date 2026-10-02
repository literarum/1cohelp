'use strict';

import { isReducedMotion } from '../utils/motion-pref.js';

/**
 * Лёгкие вспомогательные функции анимаций (вся визуальная часть — css/components/motion.css).
 * Никаких постоянных циклов: только разовые классы на короткое время.
 */

const ENTER_CLASS = 'motion-entering';
const ENTER_MS = 520;
let enterTimer = null;
let bound = false;

export function prefersReducedMotion() {
    return isReducedMotion();
}

/** Включить каскад появления для первых видимых карточек/панели на ~0.5 с. */
export function markContentEntering() {
    if (prefersReducedMotion() || typeof document === 'undefined') return;
    document.body.classList.add(ENTER_CLASS);
    if (enterTimer) clearTimeout(enterTimer);
    enterTimer = setTimeout(() => {
        document.body.classList.remove(ENTER_CLASS);
        enterTimer = null;
    }, ENTER_MS);
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

export function initMotion() {
    if (bound || typeof document === 'undefined') return;
    bound = true;
    document.addEventListener(
        'click',
        (e) => {
            const t = e.target;
            if (t instanceof Element && t.closest('.tab-btn')) markContentEntering();
        },
        true,
    );
}
initMotion();
