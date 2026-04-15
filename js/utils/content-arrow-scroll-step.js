'use strict';

/**
 * Шаг прокрутки по ArrowUp/ArrowDown: базовая «логическая строка» × {@link CONTENT_ARROW_SCROLL_LINE_MULTIPLIER}.
 * Согласовано с практикой предсказуемых дискретных шагов (без лишнего smooth-scroll на каждое нажатие).
 */
export const CONTENT_ARROW_SCROLL_LINE_MULTIPLIER = 2;

/**
 * @param {Element | null} el
 * @returns {boolean}
 */
export function shouldSkipKeyboardArrowScrollAcceleration(el) {
    if (!el || !(el instanceof Element)) return true;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return true;
    const role = el.getAttribute('role');
    if (role === 'slider' || role === 'spinbutton' || role === 'scrollbar') return true;
    if (el.closest('[role="slider"]')) return true;
    if (el.closest('[role="listbox"]')) return true;
    if (el.closest('[role="menu"]')) return true;
    const cp = document.getElementById('commandPaletteModal');
    if (cp && !cp.classList.contains('hidden') && cp.contains(el)) return true;
    return false;
}

/**
 * Ближайший предок с вертикальным overflow и переполнением по высоте.
 * @param {Element | null} startEl
 * @returns {Element | null}
 */
export function findVerticalOverflowScrollParent(startEl) {
    if (!startEl || !(startEl instanceof Element)) {
        startEl = document.body;
    }
    for (let el = startEl; el; el = el.parentElement) {
        if (el.nodeType !== 1) continue;
        if (el === document.documentElement) {
            const doc = document.documentElement;
            if (doc.scrollHeight > window.innerHeight + 1) return doc;
            return null;
        }
        try {
            const st = window.getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') continue;
            const oy = st.overflowY;
            if (
                (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
                el.scrollHeight > el.clientHeight + 1
            ) {
                return el;
            }
        } catch {
            /* ignore */
        }
    }
    return null;
}

/**
 * @param {Element | null} scrollEl document.documentElement или элемент с overflow
 * @returns {number}
 */
export function computeLineScrollStepPx(scrollEl) {
    const fallback = 40;
    try {
        if (!scrollEl || scrollEl === document.documentElement) {
            const fs = parseFloat(window.getComputedStyle(document.body).fontSize);
            const step = Number.isFinite(fs) ? Math.round(fs * 1.25) : fallback;
            return Math.max(16, step);
        }
        const cs = window.getComputedStyle(scrollEl);
        const fs = parseFloat(cs.fontSize);
        const lhRaw = cs.lineHeight;
        let line = (Number.isFinite(fs) ? fs : 16) * 1.25;
        if (lhRaw && lhRaw !== 'normal') {
            const lh = parseFloat(lhRaw);
            if (Number.isFinite(lh)) line = lh;
        }
        const step = Math.round(line);
        return Math.max(16, step);
    } catch {
        return fallback;
    }
}

/**
 * @param {Element} scrollParent
 * @param {number} deltaSigned
 * @returns {void}
 */
export function applyVerticalScrollDelta(scrollParent, deltaSigned) {
    if (!scrollParent || !Number.isFinite(deltaSigned) || deltaSigned === 0) return;
    if (scrollParent === document.documentElement) {
        window.scrollBy({ top: deltaSigned, left: 0, behavior: 'auto' });
        return;
    }
    if (typeof scrollParent.scrollBy === 'function') {
        scrollParent.scrollBy({ top: deltaSigned, left: 0, behavior: 'auto' });
    } else {
        scrollParent.scrollTop += deltaSigned;
    }
}
