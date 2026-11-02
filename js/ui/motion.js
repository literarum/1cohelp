'use strict';

import { isReducedMotion, isRichMotion } from '../utils/motion-pref.js';
import { waitForUiPaint } from '../utils/ui-paint.js';

const sectionAnimations = new WeakMap();

export function cancelSectionEntrance(panel) {
    for (const animation of sectionAnimations.get(panel) || []) animation.cancel?.();
    sectionAnimations.delete(panel);
}

/** One animation owner, scoped to the newly visible panel; never delay showing it. */
export function animateSectionEntrance(panel) {
    if (!panel || isReducedMotion()) return Promise.resolve();
    cancelSectionEntrance(panel);
    const cards = isRichMotion()
        ? [...panel.querySelectorAll('[data-section-id] > .view-item')].slice(0, 12)
        : [];
    const elements = cards.length ? cards : [panel];
    const animations = elements.filter(el => typeof el.animate === 'function').map((el, i) =>
        el.animate(
            [{ opacity: 0.35, transform: isRichMotion() ? 'translateY(7px)' : 'none' },
             { opacity: 1, transform: 'none' }],
            { duration: isRichMotion() ? 180 : 120, delay: cards.length ? i * 12 : 0,
              easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
        ),
    );
    if (!animations.length) return waitForUiPaint();
    sectionAnimations.set(panel, animations);
    const completed = Promise.all(animations.map(animation => animation.finished)).catch(error => {
        if (error?.name !== 'AbortError') throw error;
    });
    let timeout;
    const suspended = new Promise(resolve => {
        timeout = setTimeout(() => {
            for (const animation of animations) animation.cancel?.();
            resolve();
        }, 400);
    });
    return Promise.race([completed, suspended]).finally(() => {
        clearTimeout(timeout);
        if (sectionAnimations.get(panel) === animations) sectionAnimations.delete(panel);
    });
}

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
