'use strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearRuntimeHubBuffer,
    countRuntimeHubFaultsSince,
    ingestRuntimeHubIssue,
} from './runtime-issue-hub.js';

describe('runtime-issue-hub', () => {
    beforeEach(() => {
        clearRuntimeHubBuffer();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-14T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        clearRuntimeHubBuffer();
    });

    it('countRuntimeHubFaultsSince returns 0 for empty buffer', () => {
        expect(countRuntimeHubFaultsSince(60_000, () => true)).toBe(0);
    });

    it('countRuntimeHubFaultsSince counts matching faults within window', () => {
        ingestRuntimeHubIssue('FNS Revocation', 'crl failed');
        expect(
            countRuntimeHubFaultsSince(
                60_000,
                (e) => e.source === 'FNS Revocation' || e.title.includes('FNS Revocation'),
            ),
        ).toBe(1);
        expect(countRuntimeHubFaultsSince(60_000, (e) => e.source === 'FNS Revocation')).toBe(1);
        expect(countRuntimeHubFaultsSince(60_000, (e) => e.source === 'other')).toBe(0);
    });

    it('countRuntimeHubFaultsSince excludes entries older than window', () => {
        ingestRuntimeHubIssue('FNS Revocation', 'old');
        vi.setSystemTime(new Date('2026-04-14T12:05:00.000Z'));
        expect(countRuntimeHubFaultsSince(60_000, (e) => e.source === 'FNS Revocation')).toBe(0);
        expect(countRuntimeHubFaultsSince(400_000, (e) => e.source === 'FNS Revocation')).toBe(1);
    });

    it('countRuntimeHubFaultsSince ignores signalOnly entries', () => {
        ingestRuntimeHubIssue('perf', 'longtask', null, { signalOnly: true });
        expect(countRuntimeHubFaultsSince(60_000, () => true)).toBe(0);
    });
});
