'use strict';

import { describe, expect, it } from 'vitest';
import {
    buildCockpitLoggingCrosscheck,
    filterCockpitLogEntries,
    formatCockpitLogLine,
    formatCockpitLogText,
    isValidCockpitLogFilterLevel,
} from './engineering-cockpit-logging.js';

describe('engineering-cockpit-logging', () => {
    it('filterCockpitLogEntries respects level', () => {
        const entries = [
            { seq: 1, ts: 'a', level: 'log', args: ['x'] },
            { seq: 2, ts: 'b', level: 'warn', args: ['y'] },
        ];
        expect(filterCockpitLogEntries(entries, 'all')).toHaveLength(2);
        expect(filterCockpitLogEntries(entries, 'warn')).toEqual([entries[1]]);
        expect(filterCockpitLogEntries(entries, 'unknownbad')).toEqual(entries);
    });

    it('formatCockpitLogLine includes seq and level', () => {
        expect(
            formatCockpitLogLine({
                seq: 42,
                ts: '2026-01-01T00:00:00.000Z',
                level: 'info',
                args: ['hello', 'world'],
            }),
        ).toBe('[#42] [2026-01-01T00:00:00.000Z] [INFO] hello world');
    });

    it('formatCockpitLogLine tolerates missing seq', () => {
        expect(
            formatCockpitLogLine({
                ts: 't',
                level: 'boot',
                args: ['early'],
            }),
        ).toMatch(/\[#—\]/);
    });

    it('formatCockpitLogText joins lines', () => {
        const t = formatCockpitLogText([
            { seq: 1, ts: 't1', level: 'log', args: ['a'] },
            { seq: 2, ts: 't2', level: 'error', args: ['b'] },
        ]);
        expect(t.split('\n')).toHaveLength(2);
        expect(t).toContain('[ERROR]');
    });

    it('buildCockpitLoggingCrosscheck aggregates hub meta', () => {
        const x = buildCockpitLoggingCrosscheck(
            [{ seq: 3, ts: 'z', level: 'log', args: [] }],
            { faultCount: 1, total: 2 },
            1500,
        );
        expect(x.entriesTotal).toBe(1);
        expect(x.lastSeq).toBe(3);
        expect(x.runtimeHub.faultCount).toBe(1);
        expect(x.bufferCapacity).toBe(1500);
    });

    it('buildCockpitLoggingCrosscheck surfaces hub duplicate pressure fields', () => {
        const x = buildCockpitLoggingCrosscheck(
            [],
            {
                faultCount: 10,
                uniqueFaultFingerprints: 1,
                duplicatePressure: 'high',
                fingerprintRepeatMax: 10,
                topFingerprintRepeats: [{ fingerprint: 'abc', count: 10 }],
            },
            1500,
        );
        expect(x.hubFaultDiversityRatio).toBeCloseTo(0.1);
        expect(x.hubDuplicatePressure).toBe('high');
        expect(x.hubFingerprintRepeatMax).toBe(10);
        expect(x.hubTopFingerprintRepeats).toHaveLength(1);
    });

    it('isValidCockpitLogFilterLevel', () => {
        expect(isValidCockpitLogFilterLevel('all')).toBe(true);
        expect(isValidCockpitLogFilterLevel('nope')).toBe(false);
    });
});
