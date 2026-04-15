/**
 * @vitest-environment jsdom
 */
'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    CONTENT_ARROW_SCROLL_LINE_MULTIPLIER,
    shouldSkipKeyboardArrowScrollAcceleration,
    findVerticalOverflowScrollParent,
    computeLineScrollStepPx,
    applyVerticalScrollDelta,
} from './content-arrow-scroll-step.js';

describe('content-arrow-scroll-step', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.removeAttribute('style');
        vi.stubGlobal(
            'getComputedStyle',
            vi.fn((el) => {
                if (el === document.documentElement) {
                    return {
                        overflowY: 'visible',
                        fontSize: '16px',
                        lineHeight: 'normal',
                        display: 'block',
                        visibility: 'visible',
                    };
                }
                if (el === document.body) {
                    return {
                        overflowY: 'visible',
                        fontSize: '20px',
                        lineHeight: '24px',
                        display: 'block',
                        visibility: 'visible',
                    };
                }
                if (el?.id === 'scrollbox') {
                    return {
                        overflowY: 'auto',
                        fontSize: '10px',
                        lineHeight: '30px',
                        display: 'block',
                        visibility: 'visible',
                    };
                }
                return {
                    overflowY: 'visible',
                    fontSize: '16px',
                    lineHeight: 'normal',
                    display: 'block',
                    visibility: 'visible',
                };
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('CONTENT_ARROW_SCROLL_LINE_MULTIPLIER is 2', () => {
        expect(CONTENT_ARROW_SCROLL_LINE_MULTIPLIER).toBe(2);
    });

    it('shouldSkipKeyboardArrowScrollAcceleration skips input and menus', () => {
        const input = document.createElement('input');
        expect(shouldSkipKeyboardArrowScrollAcceleration(input)).toBe(true);
        const ta = document.createElement('textarea');
        expect(shouldSkipKeyboardArrowScrollAcceleration(ta)).toBe(true);
        const sel = document.createElement('select');
        expect(shouldSkipKeyboardArrowScrollAcceleration(sel)).toBe(true);
        const btn = document.createElement('button');
        expect(shouldSkipKeyboardArrowScrollAcceleration(btn)).toBe(false);
        const menu = document.createElement('div');
        menu.setAttribute('role', 'menu');
        const mi = document.createElement('button');
        mi.setAttribute('role', 'menuitem');
        menu.appendChild(mi);
        expect(shouldSkipKeyboardArrowScrollAcceleration(mi)).toBe(true);
    });

    it('findVerticalOverflowScrollParent finds nested overflow:auto', () => {
        const outer = document.createElement('div');
        const box = document.createElement('div');
        box.id = 'scrollbox';
        box.style.height = '100px';
        Object.defineProperty(box, 'clientHeight', { value: 100, configurable: true });
        Object.defineProperty(box, 'scrollHeight', { value: 400, configurable: true });
        const inner = document.createElement('button');
        box.appendChild(inner);
        outer.appendChild(box);
        document.body.appendChild(outer);
        expect(findVerticalOverflowScrollParent(inner)).toBe(box);
    });

    it('computeLineScrollStepPx uses line-height when set', () => {
        const box = document.createElement('div');
        box.id = 'scrollbox';
        expect(computeLineScrollStepPx(box)).toBe(30);
    });

    it('applyVerticalScrollDelta calls scrollBy on element when present', () => {
        const el = document.createElement('div');
        const spy = vi.fn();
        el.scrollBy = spy;
        applyVerticalScrollDelta(el, 50);
        expect(spy).toHaveBeenCalledWith({ top: 50, left: 0, behavior: 'auto' });
    });
});
