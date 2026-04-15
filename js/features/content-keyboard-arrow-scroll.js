'use strict';

import {
    CONTENT_ARROW_SCROLL_LINE_MULTIPLIER,
    shouldSkipKeyboardArrowScrollAcceleration,
    findVerticalOverflowScrollParent,
    computeLineScrollStepPx,
    applyVerticalScrollDelta,
} from '../utils/content-arrow-scroll-step.js';

let attached = false;

function onDocumentKeydownCapture(event) {
    if (event.defaultPrevented) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typeof event.isComposing === 'boolean' && event.isComposing) return;

    const active = document.activeElement;
    if (shouldSkipKeyboardArrowScrollAcceleration(active instanceof Element ? active : null)) return;

    const scrollParent = findVerticalOverflowScrollParent(
        active instanceof Element ? active : document.body,
    );
    if (!scrollParent) return;

    const step = computeLineScrollStepPx(scrollParent);
    const signed =
        (event.key === 'ArrowDown' ? 1 : -1) * step * CONTENT_ARROW_SCROLL_LINE_MULTIPLIER;

    const st =
        scrollParent === document.documentElement
            ? window.scrollY ?? document.documentElement.scrollTop ?? 0
            : scrollParent.scrollTop ?? 0;
    const ch =
        scrollParent === document.documentElement
            ? window.innerHeight
            : scrollParent.clientHeight ?? 0;
    const sh =
        scrollParent === document.documentElement
            ? document.documentElement.scrollHeight
            : scrollParent.scrollHeight ?? 0;

    const atTop = st <= 0;
    const atBottom = st + ch >= sh - 1;
    if ((signed < 0 && atTop) || (signed > 0 && atBottom)) return;

    event.preventDefault();
    applyVerticalScrollDelta(scrollParent, signed);
}

/**
 * Ускоренная перемотка контента по ↑/↓: шаг = {@link CONTENT_ARROW_SCROLL_LINE_MULTIPLIER}× «строка» контейнера.
 * Регистрируется один раз (capture — до всплытия к остальным обработчикам).
 */
export function initContentKeyboardArrowScroll() {
    if (attached) return;
    attached = true;
    document.addEventListener('keydown', onDocumentKeydownCapture, { capture: true });
}
