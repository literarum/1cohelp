/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    MOTION_MODES,
    MOTION_STORAGE_KEY,
    sanitizeMotionMode,
    resolveMotionLevel,
    applyMotionMode,
    getMotionLevel,
    isReducedMotion,
    isRichMotion,
    onMotionChange,
    withThemeTransition,
} from './motion-pref.js';

describe('motion-pref', () => {
    beforeEach(() => {
        try {
            window.localStorage.removeItem(MOTION_STORAGE_KEY);
        } catch {
            /* ignore */
        }
        applyMotionMode('auto');
    });

    it('sanitizeMotionMode: допустимые значения и откат к auto', () => {
        for (const m of MOTION_MODES) expect(sanitizeMotionMode(m)).toBe(m);
        expect(sanitizeMotionMode('turbo')).toBe('auto');
        expect(sanitizeMotionMode(undefined)).toBe('auto');
        expect(sanitizeMotionMode(5)).toBe('auto');
    });

    it('applies a theme immediately even if native transition never runs its callback', async () => {
        applyMotionMode('auto');
        const native = document.startViewTransition;
        document.startViewTransition = vi.fn(() => ({ updateCallbackDone: new Promise(() => {}) }));
        try {
            const change = vi.fn(() => document.documentElement.classList.add('dark'));
            const applied = withThemeTransition(change);
            expect(change).toHaveBeenCalledTimes(1);
            expect(document.documentElement.classList.contains('dark')).toBe(true);
            await applied;
        } finally { document.startViewTransition = native; }
    });

    it('reports change errors instead of swallowing them as animation failures', async () => {
        const failure = new Error('theme application failed');
        await expect(withThemeTransition(() => { throw failure; })).rejects.toBe(failure);
    });

    it('resolveMotionLevel: система просит меньше движения — уважаем в auto и calm', () => {
        expect(resolveMotionLevel('auto', false)).toBe('full');
        expect(resolveMotionLevel('auto', true)).toBe('reduce');
        expect(resolveMotionLevel('calm', false)).toBe('calm');
        expect(resolveMotionLevel('calm', true)).toBe('reduce');
        expect(resolveMotionLevel('reduce', false)).toBe('reduce');
    });

    it('applyMotionMode: пишет data-motion, зеркало в localStorage и уведомляет подписчиков', () => {
        const seen = [];
        const off = onMotionChange((level, mode) => seen.push([level, mode]));
        applyMotionMode('reduce');
        expect(document.documentElement.dataset.motion).toBe('reduce');
        expect(document.documentElement.dataset.motionMode).toBe('reduce');
        expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduce');
        expect(isReducedMotion()).toBe(true);
        expect(isRichMotion()).toBe(false);
        expect(getMotionLevel()).toBe('reduce');
        expect(seen.length).toBeGreaterThan(0);
        off?.();
        applyMotionMode('auto');
        expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    });
});
