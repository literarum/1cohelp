'use strict';

import { describe, it, expect, vi } from 'vitest';
import {
    buildCopilotDiagnosticBundle,
    diagnosticBundleToJsonString,
    suggestDiagnosticFilename,
} from './diagnostic-bundle.js';

describe('diagnostic-bundle', () => {
    it('buildCopilotDiagnosticBundle includes schema and runtime sections', async () => {
        const bundle = await buildCopilotDiagnosticBundle({
            getFromIndexedDB: vi.fn().mockResolvedValue('1.5'),
            getLogs: () => [{ ts: 't', level: 'info', args: ['x'] }],
            getCockpitErrors: () => [],
            getHubFaultEntries: () => [],
            getHudDiagnostics: () => ({ errors: [], warnings: [], checks: [], updatedAt: 'now' }),
            getWatchdog: () => ({ statusText: 'ok' }),
            getSystemOverview: () => ({ ok: true }),
            getStateSnapshot: () => ({ s: 1 }),
            getDbSummary: () => [],
        });
        expect(bundle.bundleFormat).toBe('copilot1co-diagnostic-v1');
        expect(bundle.app.schemaVersionCurrent).toBeTruthy();
        expect(bundle.app.schemaVersionStored).toBe('1.5');
        expect(bundle.health.hudDiagnostics.updatedAt).toBe('now');
        expect(bundle.health.orchestration?.schema).toBe('copilot1co-application-health-state-v1');
        expect(bundle.health.orchestration?.phases).toMatchObject({
            STARTUP_READINESS: 'startup_readiness',
        });
        expect(bundle.runtime.hubBufferMeta).toMatchObject({
            capacity: expect.any(Number),
        });
        expect(bundle.pwa).toBeDefined();
        expect(bundle.pwa).toMatchObject({
            supported: expect.any(Boolean),
            assetQueryVersion: expect.any(String),
        });
        const json = diagnosticBundleToJsonString(bundle);
        expect(json).toContain('copilot1co-diagnostic-v1');
    });

    it('suggestDiagnosticFilename is safe', () => {
        expect(suggestDiagnosticFilename('p')).toMatch(/^p-.*\.json$/);
    });
});
