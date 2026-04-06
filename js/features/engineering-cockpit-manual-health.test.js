'use strict';

import { describe, it, expect, vi } from 'vitest';
import {
    buildManualDiagnosticFailureReport,
    runManualHealthDiagnosticFromCockpit,
} from './engineering-cockpit-manual-health.js';

describe('engineering-cockpit-manual-health', () => {
    it('buildManualDiagnosticFailureReport includes error shape', () => {
        const r = buildManualDiagnosticFailureReport(new Error('boom'));
        expect(r.success).toBe(false);
        expect(r.errors[0].message).toBe('boom');
        expect(r.checks).toEqual([]);
    });

    it('runManualHealthDiagnosticFromCockpit runs and shows report', async () => {
        const run = vi.fn().mockResolvedValue({ success: true, checks: [] });
        const show = vi.fn();
        const out = await runManualHealthDiagnosticFromCockpit({
            runManualFullDiagnostic: run,
            showHealthReportModal: show,
        });
        expect(run).toHaveBeenCalledTimes(1);
        expect(show).toHaveBeenCalledWith(out);
        expect(out.success).toBe(true);
    });

    it('throws when run is missing', async () => {
        await expect(
            runManualHealthDiagnosticFromCockpit({
                runManualFullDiagnostic: null,
                showHealthReportModal: () => {},
            }),
        ).rejects.toThrow(/runManualFullDiagnostic/);
    });

    it('throws when show is missing', async () => {
        await expect(
            runManualHealthDiagnosticFromCockpit({
                runManualFullDiagnostic: async () => ({}),
                showHealthReportModal: null,
            }),
        ).rejects.toThrow(/showHealthReportModal/);
    });
});
