'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    percentileSorted,
    recordClientSloSample,
    evaluateClientSloAgainstBudgets,
    DEFAULT_CLIENT_SLO_BUDGETS,
    _resetClientSloStorageForTests,
} from './client-slo-budgets.js';

describe('percentileSorted', () => {
    it('returns null for empty', () => {
        expect(percentileSorted([], 0.95)).toBe(null);
    });
    it('returns max for p95 on small samples', () => {
        const s = [10, 20, 30, 40, 50].sort((a, b) => a - b);
        expect(percentileSorted(s, 0.95)).toBe(50);
    });
});

describe('evaluateClientSloAgainstBudgets', () => {
    beforeEach(() => {
        _resetClientSloStorageForTests();
    });
    afterEach(() => {
        _resetClientSloStorageForTests();
    });

    it('warns when watchdog p95 exceeds budget', () => {
        const b = { ...DEFAULT_CLIENT_SLO_BUDGETS, watchdogCycleP95Ms: 100 };
        for (let i = 0; i < 25; i += 1) {
            recordClientSloSample({
                ts: Date.now(),
                watchdogCycleMs: 200 + i,
                watchdogHadError: false,
            });
        }
        const ev = evaluateClientSloAgainstBudgets(b);
        expect(ev.warnings.some((w) => /watchdog/i.test(w))).toBe(true);
    });

    it('warns when error rate exceeds budget', () => {
        const b = { ...DEFAULT_CLIENT_SLO_BUDGETS, watchdogErrorRate: 0.05 };
        for (let i = 0; i < 20; i += 1) {
            recordClientSloSample({
                ts: Date.now(),
                watchdogCycleMs: 50,
                watchdogHadError: i % 2 === 0,
            });
        }
        const ev = evaluateClientSloAgainstBudgets(b);
        expect(ev.warnings.some((w) => /ошибк/i.test(w))).toBe(true);
    });
});
