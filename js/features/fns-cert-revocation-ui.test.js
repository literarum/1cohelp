'use strict';

import { describe, expect, it } from 'vitest';
import { deriveFnsCertRevocationUiModel } from './fns-cert-revocation.js';

describe('deriveFnsCertRevocationUiModel', () => {
    const ok = { revoked: false, reason: null };

    it('marks status unknown when all CRL checks failed', () => {
        const m = deriveFnsCertRevocationUiModel(ok, 0, 4, null);
        expect(m.statusUnknown).toBe(true);
        expect(m.hasPartialResult).toBe(true);
    });

    it('marks status unknown when some CRL checks failed', () => {
        const m = deriveFnsCertRevocationUiModel(ok, 2, 2, null);
        expect(m.statusUnknown).toBe(true);
        expect(m.hasPartialResult).toBe(true);
    });

    it('marks status known when all checks succeeded and not revoked', () => {
        const m = deriveFnsCertRevocationUiModel(ok, 4, 0, null);
        expect(m.statusUnknown).toBe(false);
        expect(m.hasPartialResult).toBe(false);
    });

    it('does not mark unknown when certificate is revoked despite batch error string', () => {
        const rev = { revoked: true, reason: 'crl' };
        const m = deriveFnsCertRevocationUiModel(rev, 1, 3, 'upstream');
        expect(m.statusUnknown).toBe(false);
    });

    it('treats top-level batch error as partial/unknown when not revoked', () => {
        const m = deriveFnsCertRevocationUiModel(ok, 4, 0, 'server overload');
        expect(m.hasPartialResult).toBe(true);
        expect(m.statusUnknown).toBe(true);
    });
});
