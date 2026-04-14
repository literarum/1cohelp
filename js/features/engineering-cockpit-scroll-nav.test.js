'use strict';

/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
    COCKPIT_SCROLL_NAV_THRESHOLD,
    computeCockpitScrollNavState,
    bindEngineeringCockpitScrollNav,
} from './engineering-cockpit-scroll-nav.js';

describe('engineering-cockpit-scroll-nav', () => {
    it('computeCockpitScrollNavState: no overflow → no show', () => {
        const r = computeCockpitScrollNavState(0, 100, 100);
        expect(r.show).toBe(false);
        expect(r.canScrollUp).toBe(false);
        expect(r.canScrollDown).toBe(false);
    });

    it('computeCockpitScrollNavState: overflow at top → down enabled', () => {
        const r = computeCockpitScrollNavState(0, 500, 100);
        expect(r.show).toBe(true);
        expect(r.canScrollUp).toBe(false);
        expect(r.canScrollDown).toBe(true);
    });

    it('computeCockpitScrollNavState: mid scroll → both directions', () => {
        const r = computeCockpitScrollNavState(200, 500, 100);
        expect(r.show).toBe(true);
        expect(r.canScrollUp).toBe(true);
        expect(r.canScrollDown).toBe(true);
    });

    it('computeCockpitScrollNavState: near bottom respects threshold', () => {
        const ch = 100;
        const sh = 500;
        const st = sh - ch - COCKPIT_SCROLL_NAV_THRESHOLD;
        const r = computeCockpitScrollNavState(st, sh, ch);
        expect(r.show).toBe(true);
        expect(r.canScrollDown).toBe(false);
    });

    it('bindEngineeringCockpitScrollNav toggles visibility on overflow', async () => {
        const modal = document.createElement('div');
        const workspace = document.createElement('div');
        const contentWrap = document.createElement('div');
        const container = document.createElement('div');
        const upBtn = document.createElement('button');
        const downBtn = document.createElement('button');

        let scrollTopVal = 0;
        Object.defineProperty(contentWrap, 'scrollHeight', { value: 800, configurable: true });
        Object.defineProperty(contentWrap, 'clientHeight', { value: 200, configurable: true });
        Object.defineProperty(contentWrap, 'scrollTop', {
            get() {
                return scrollTopVal;
            },
            set(v) {
                scrollTopVal = v;
            },
            configurable: true,
        });

        const api = bindEngineeringCockpitScrollNav({
            modal,
            workspace,
            contentWrap,
            container,
            upBtn,
            downBtn,
        });

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        expect(container.getAttribute('aria-hidden')).toBe('false');
        expect(container.classList.contains('opacity-0')).toBe(false);
        expect(upBtn.disabled).toBe(true);
        expect(downBtn.disabled).toBe(false);

        scrollTopVal = 400;
        contentWrap.dispatchEvent(new Event('scroll'));
        api.requestUpdate();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        expect(upBtn.disabled).toBe(false);
        expect(downBtn.disabled).toBe(false);

        api.detach();
    });
});
