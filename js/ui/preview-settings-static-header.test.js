/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { measureStaticHeaderReservePx } from './preview-settings.js';

describe('measureStaticHeaderReservePx', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('берёт максимум из offsetHeight и ceil(height) по getBoundingClientRect', () => {
        const el = document.createElement('div');
        Object.defineProperty(el, 'offsetHeight', { value: 100, configurable: true });
        el.getBoundingClientRect = () => ({ height: 100.4, top: 0, left: 0, bottom: 100.4, right: 10, width: 10 });
        expect(measureStaticHeaderReservePx(el)).toBe(101);
    });

    it('при заниженном offsetHeight опирается на getBoundingClientRect', () => {
        const el = document.createElement('div');
        Object.defineProperty(el, 'offsetHeight', { value: 80, configurable: true });
        el.getBoundingClientRect = () => ({ height: 120, top: 0, left: 0, bottom: 120, right: 10, width: 10 });
        expect(measureStaticHeaderReservePx(el)).toBe(120);
    });

    it('без элемента возвращает запасной размер', () => {
        expect(measureStaticHeaderReservePx(null)).toBe(180);
    });
});
