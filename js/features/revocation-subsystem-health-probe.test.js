'use strict';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.js', () => ({
    REVOCATION_API_BASE_URL: 'https://revoke-api.test',
}));

vi.mock('../config/revocation-sources.js', () => ({
    REVOCATION_LOCAL_HELPER_BASE_URL: '',
    REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER: false,
}));

import { runRevocationSubsystemHealthCrossCheck } from './revocation-subsystem-health-probe.js';
import { clearRuntimeHubBuffer, ingestRuntimeHubIssue } from './runtime-issue-hub.js';

describe('runRevocationSubsystemHealthCrossCheck', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        clearRuntimeHubBuffer();
    });

    const runWithTimeout = (p) => p;

    it('reports info when second probe ok and no FNS runtime faults', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({ ok: true })),
                }),
            ),
        );
        const reports = [];
        await runRevocationSubsystemHealthCrossCheck(
            runWithTimeout,
            (level, title, message, meta) => {
                reports.push({ level, title, message, meta });
            },
            { probeTag: 'startup' },
        );
        const info = reports.find((r) => r.title === 'Отзыв сертификатов (перекрёстная)');
        expect(info?.level).toBe('info');
        expect(info?.message).toContain('согласованы');
    });

    it('reports error when cloud health probe fails in API mode', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    status: 503,
                    text: () => Promise.resolve(''),
                }),
            ),
        );
        const reports = [];
        await runRevocationSubsystemHealthCrossCheck(
            runWithTimeout,
            (level, title, message, meta) => {
                reports.push({ level, title, message, meta });
            },
            { probeTag: 'startup' },
        );
        const err = reports.find((r) => r.title === 'Отзыв сертификатов (контур B)');
        expect(err?.level).toBe('error');
    });

    it('warns when FNS revocation faults exist in runtime window', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({ ok: true })),
                }),
            ),
        );
        ingestRuntimeHubIssue('FNS Revocation', 'Проверка отзыва ФНС: сеть');
        const reports = [];
        await runRevocationSubsystemHealthCrossCheck(
            runWithTimeout,
            (level, title, message, meta) => {
                reports.push({ level, title, message, meta });
            },
            { probeTag: 'watchdog', runtimeFaultWindowMs: 60_000 },
        );
        const warn = reports.find((r) => r.title === 'Отзыв сертификатов (буфер runtime)');
        expect(warn?.level).toBe('warn');
        expect(warn?.message).toMatch(/зафиксировано \d+ сбоев/);
    });
});
