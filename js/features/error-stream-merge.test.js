'use strict';

import { describe, it, expect } from 'vitest';
import { mergeHubAndCockpitFaultRows } from './error-stream-merge.js';

describe('mergeHubAndCockpitFaultRows', () => {
    it('keeps repeated messages at different times', () => {
        const hub = [
            {
                tsIso: '2026-01-01T10:00:00.000Z',
                source: 'console.error',
                title: 'Runtime / console.error',
                message: 'fail',
            },
            {
                tsIso: '2026-01-01T11:00:00.000Z',
                source: 'console.error',
                title: 'Runtime / console.error',
                message: 'fail',
            },
        ];
        const cockpit = [];
        const text = mergeHubAndCockpitFaultRows(hub, cockpit);
        expect(text.split('---').length).toBeGreaterThanOrEqual(2);
        expect(text.match(/fail/g)?.length).toBe(2);
    });

    it('dedupes exact duplicate hub+cockpit mirror lines', () => {
        const hub = [
            {
                tsIso: '2026-01-01T12:00:00.000Z',
                source: 'x',
                title: 'Runtime / x',
                message: 'same',
            },
        ];
        const cockpit = [
            {
                ts: '2026-01-01T12:00:00.000Z',
                source: 'x',
                message: 'same',
            },
        ];
        const text = mergeHubAndCockpitFaultRows(hub, cockpit);
        expect(text.includes('same')).toBe(true);
        expect(text.match(/same/g)?.length).toBe(1);
    });

    it('returns empty message when no data', () => {
        expect(mergeHubAndCockpitFaultRows([], [])).toMatch(/не зафиксированы/i);
    });
});
