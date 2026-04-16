'use strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearRuntimeHubBuffer,
    countRuntimeHubFaultsSince,
    getRuntimeHubBufferMeta,
    getRuntimeHubFaultEntries,
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

    it('records Error.cause chain in normalized body', () => {
        const root = new Error('outer failure');
        root.cause = new Error('inner failure');
        ingestRuntimeHubIssue('unit', root);
        const row = getRuntimeHubFaultEntries(5)[0];
        expect(row.message).toMatch(/caused by/i);
        expect(row.message).toMatch(/inner failure/);
    });

    it('classifies script resource faults as critical', () => {
        ingestRuntimeHubIssue(
            'window.error',
            'Ошибка загрузки или выполнения скрипта',
            { kind: 'resource', tag: 'SCRIPT', src: 'https://cdn.example.com/app.js' },
        );
        const row = getRuntimeHubFaultEntries(1)[0];
        expect(row.category).toBe('resource_script');
        expect(row.severity).toBe('critical');
    });

    it('tracks session occurrence and duplicate pressure for repeated identical faults', () => {
        for (let i = 0; i < 6; i += 1) ingestRuntimeHubIssue('x', 'same');
        const meta = getRuntimeHubBufferMeta();
        expect(meta.faultCount).toBe(6);
        expect(meta.uniqueFaultFingerprints).toBe(1);
        expect(meta.fingerprintRepeatMax).toBe(6);
        expect(meta.duplicatePressure).toMatch(/elevated|high/);
        const last = getRuntimeHubFaultEntries(1)[0];
        expect(last.sessionOccurrence).toBe(6);
    });

    it('does not treat signalOnly entries as fault fingerprints for pressure', () => {
        for (let i = 0; i < 5; i += 1)
            ingestRuntimeHubIssue('perf', 'x', { n: i }, { signalOnly: true });
        const meta = getRuntimeHubBufferMeta();
        expect(meta.faultCount).toBe(0);
        expect(meta.signalCount).toBe(5);
        expect(meta.duplicatePressure).toBe('none');
    });

    it('classifies fetch network extras as network_fetch with severity from HTTP status', () => {
        ingestRuntimeHubIssue('fetch.http_error', 'HTTP 503', {
            kind: 'network',
            tag: 'FETCH',
            url: 'https://x/a',
            status: 503,
        });
        ingestRuntimeHubIssue('fetch.http_error', 'HTTP 404', {
            kind: 'network',
            tag: 'FETCH',
            url: 'https://x/missing',
            status: 404,
        });
        const rows = getRuntimeHubFaultEntries(5);
        const a = rows.find((r) => r.message.includes('503'));
        const b = rows.find((r) => r.message.includes('404'));
        expect(a?.category).toBe('network_fetch');
        expect(a?.severity).toBe('high');
        expect(b?.category).toBe('network_fetch');
        expect(b?.severity).toBe('low');
    });
});
