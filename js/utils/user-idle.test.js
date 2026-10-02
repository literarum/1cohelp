/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect } from 'vitest';
import { msSinceUserInput, waitForUserIdle } from './user-idle.js';

describe('user-idle', () => {
    it('ввод пользователя сбрасывает счётчик простоя', () => {
        const before = msSinceUserInput();
        window.dispatchEvent(new Event('keydown'));
        expect(msSinceUserInput()).toBeLessThanOrEqual(before + 5);
    });

    it('waitForUserIdle завершается по maxWaitMs, даже если ввод продолжается', async () => {
        const t0 = Date.now();
        const timer = setInterval(() => window.dispatchEvent(new Event('keydown')), 20);
        await waitForUserIdle({ quietMs: 1000, maxWaitMs: 150 });
        clearInterval(timer);
        const dt = Date.now() - t0;
        expect(dt).toBeGreaterThanOrEqual(120);
        expect(dt).toBeLessThan(1200);
    });

    it('waitForUserIdle сразу завершается при долгой тишине', async () => {
        await new Promise((r) => setTimeout(r, 30));
        const t0 = Date.now();
        await waitForUserIdle({ quietMs: 10, maxWaitMs: 5000 });
        expect(Date.now() - t0).toBeLessThan(500);
    });
});
