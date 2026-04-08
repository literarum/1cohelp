/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, afterEach } from 'vitest';
import { waitUntilAppInitFinished } from './background-health-tests.js';

describe('waitUntilAppInitFinished (гейт перед finishHud фоновой диагностики)', () => {
    afterEach(() => {
        delete window.__copilotAppInitFinished;
        delete window.__copilotAppInitHudSuccess;
    });

    it('skipped: флаг app-init не выставлялся (undefined) — не блокируем', async () => {
        delete window.__copilotAppInitFinished;
        const r = await waitUntilAppInitFinished(5000);
        expect(r).toEqual({ ok: true, skipped: true });
    });

    it('сразу ok, если app-init уже завершён', async () => {
        window.__copilotAppInitFinished = true;
        window.__copilotAppInitHudSuccess = true;
        const r = await waitUntilAppInitFinished(5000);
        expect(r).toEqual({ ok: true });
    });

    it('ждёт перехода false → true', async () => {
        window.__copilotAppInitFinished = false;
        const p = waitUntilAppInitFinished(5000);
        await new Promise((resolve) => setTimeout(resolve, 25));
        window.__copilotAppInitFinished = true;
        const r = await p;
        expect(r).toEqual({ ok: true });
    });

    it('timedOut, если завершение так и не наступило', async () => {
        window.__copilotAppInitFinished = false;
        const r = await waitUntilAppInitFinished(90);
        expect(r).toEqual({ ok: false, timedOut: true });
    });
});
