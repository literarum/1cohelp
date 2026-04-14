'use strict';

import { describe, it, expect, beforeEach } from 'vitest';
import {
    HEALTH_PHASE,
    recordApplicationHealthSnapshot,
    resetApplicationHealthStateForTests,
    getApplicationHealthStateForExport,
    clientDataHealthProbeRecordsMatch,
} from './application-health-state.js';

describe('application-health-state', () => {
    beforeEach(() => {
        resetApplicationHealthStateForTests();
    });

    it('records startup and exposes export snapshot', () => {
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.STARTUP_READINESS,
            source: 'startup',
            errorCount: 0,
            warnCount: 2,
            checkCount: 10,
            runtimeFaultCount: 0,
            errors: [],
        });
        const exp = getApplicationHealthStateForExport();
        expect(exp.lastStartupReadiness?.phase).toBe(HEALTH_PHASE.STARTUP_READINESS);
        expect(exp.lastStartupReadiness?.warnCount).toBe(2);
        expect(exp.crossCheckNotes.length).toBe(0);
    });

    it('emits cross-check when runtime faults exist but structured errors are zero', () => {
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.STARTUP_READINESS,
            source: 'startup',
            errorCount: 0,
            warnCount: 0,
            checkCount: 5,
            runtimeFaultCount: 3,
            errors: [],
        });
        const exp = getApplicationHealthStateForExport();
        expect(exp.crossCheckNotes.some((n) => /Двойной контур/.test(n))).toBe(true);
    });

    it('rings watchdog history and detects flap between interval cycles', () => {
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.PERIODIC_LIVENESS,
            source: 'interval',
            errorCount: 1,
            warnCount: 0,
            checkCount: 4,
            runtimeFaultCount: 1,
            errors: [{ title: 'A' }],
            watchdogSeverity: 'error',
        });
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.PERIODIC_LIVENESS,
            source: 'interval',
            errorCount: 0,
            warnCount: 0,
            checkCount: 4,
            runtimeFaultCount: 0,
            errors: [],
            watchdogSeverity: 'ok',
        });
        const exp = getApplicationHealthStateForExport();
        expect(exp.recentWatchdogCycles.length).toBe(2);
        expect(exp.crossCheckNotes.some((n) => /watchdog/.test(n))).toBe(true);
    });

    it('clientDataHealthProbeRecordsMatch compares id and notes', () => {
        expect(
            clientDataHealthProbeRecordsMatch(
                { id: 'x', notes: 'a' },
                { id: 'x', notes: 'a' },
            ),
        ).toBe(true);
        expect(
            clientDataHealthProbeRecordsMatch(
                { id: 'x', notes: 'a' },
                { id: 'x', notes: 'b' },
            ),
        ).toBe(false);
    });

    it('cross-check when manual deep has errors but startup was clean', () => {
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.STARTUP_READINESS,
            source: 'startup',
            errorCount: 0,
            warnCount: 0,
            checkCount: 8,
            runtimeFaultCount: 0,
            errors: [],
        });
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.MANUAL_DEEP,
            source: 'manual_full',
            errorCount: 2,
            warnCount: 0,
            checkCount: 20,
            runtimeFaultCount: 0,
            errors: [{ title: 'X' }, { title: 'Y' }],
        });
        const exp = getApplicationHealthStateForExport();
        expect(exp.crossCheckNotes.some((n) => /глубокий ручной прогон/.test(n))).toBe(true);
    });

    it('cross-check when last watchdog had errors but last manual had none', () => {
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.PERIODIC_LIVENESS,
            source: 'interval',
            errorCount: 1,
            warnCount: 0,
            checkCount: 4,
            runtimeFaultCount: 0,
            errors: [{ title: 'Wd' }],
            watchdogSeverity: 'error',
        });
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.MANUAL_DEEP,
            source: 'manual_full',
            errorCount: 0,
            warnCount: 0,
            checkCount: 30,
            runtimeFaultCount: 0,
            errors: [],
        });
        const exp = getApplicationHealthStateForExport();
        expect(exp.crossCheckNotes.some((n) => /плановый watchdog/.test(n))).toBe(true);
    });

    it('emits cross-check when runtime faults accumulate after clean startup but checklist stays clean', () => {
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.STARTUP_READINESS,
            source: 'startup',
            errorCount: 0,
            warnCount: 0,
            checkCount: 8,
            runtimeFaultCount: 0,
            errors: [],
        });
        recordApplicationHealthSnapshot({
            phase: HEALTH_PHASE.PERIODIC_LIVENESS,
            source: 'interval',
            errorCount: 0,
            warnCount: 0,
            checkCount: 6,
            runtimeFaultCount: 4,
            errors: [],
            watchdogSeverity: 'ok',
        });
        const exp = getApplicationHealthStateForExport();
        expect(exp.crossCheckNotes.some((n) => /Тройной контур/.test(n))).toBe(true);
    });
});
