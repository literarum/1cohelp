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

import {
    countCockpitLogLevels,
    queryCockpitLogEntries,
    computeVirtualWindow,
    formatCockpitLogNdjson,
    normalizeCockpitLevelSet,
} from './engineering-cockpit-logging.js';

describe('engineering-cockpit-logging: поиск, чипы, виртуализация', () => {
    const logs = [
        { seq: 1, ts: '2026-01-01T10:00:00.000Z', level: 'log', args: ['Старт приложения'] },
        { seq: 2, ts: '2026-01-01T10:00:01.000Z', level: 'warn', args: ['Медленный ответ'] },
        { seq: 3, ts: '2026-01-01T10:00:02.000Z', level: 'error', args: ['Сбой Google Docs'] },
    ];
    it('считает записи по уровням', () => {
        const c = countCockpitLogLevels(logs);
        expect(c.all).toBe(3);
        expect(c.warn).toBe(1);
        expect(c.debug).toBe(0);
    });
    it('фильтрует по нескольким уровням и тексту', () => {
        expect(queryCockpitLogEntries(logs, { levels: ['warn', 'error'] })).toHaveLength(2);
        expect(queryCockpitLogEntries(logs, { query: 'google' })).toHaveLength(1);
        expect(queryCockpitLogEntries(logs, { query: '#2' })[0].seq).toBe(2);
        expect(queryCockpitLogEntries(logs, { levels: ['all'] })).toHaveLength(3);
        expect(normalizeCockpitLevelSet(['bogus', 'info']).size).toBe(1);
    });
    it('окно виртуализации ограничено видимой областью', () => {
        const w = computeVirtualWindow({ total: 3000, rowHeight: 24, scrollTop: 24 * 1000, viewportHeight: 480 });
        expect(w.end - w.start).toBeLessThan(40);
        expect(w.totalHeight).toBe(72000);
        expect(computeVirtualWindow({ total: 0, rowHeight: 24, scrollTop: 0, viewportHeight: 100 }).end).toBe(0);
    });
    it('NDJSON: по записи на строку', () => {
        const lines = formatCockpitLogNdjson(logs).split('\n');
        expect(lines).toHaveLength(3);
        expect(JSON.parse(lines[2]).message).toContain('Google');
    });
});
