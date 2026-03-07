import { describe, expect, it } from 'vitest';
import { __testables } from './fns-cert-revocation.js';

const {
    detectCertificateFormat,
    decodeRawBase64ToBytes,
    parseCertificate,
    isCertificateExpired,
    resolveFinalRevocationState,
    resolveCrlUrls,
    resolveNetworkPolicy,
    shouldAttemptBrowserFetch,
    shouldRecommendProxy,
} = __testables;

describe('fns certificate parser format detection', () => {
    it('detects PEM content first', () => {
        const pem = `-----BEGIN CERTIFICATE-----
MIIB
-----END CERTIFICATE-----`;
        const bytes = new TextEncoder().encode(pem);
        const detected = detectCertificateFormat(bytes);
        expect(detected.format).toBe('pem');
    });

    it('detects raw base64 certificate text', () => {
        const base64 = 'A'.repeat(120);
        const bytes = new TextEncoder().encode(base64);
        const detected = detectCertificateFormat(bytes);
        expect(detected.format).toBe('base64');
    });

    it('treats non-text content as DER', () => {
        const bytes = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]);
        const detected = detectCertificateFormat(bytes);
        expect(detected.format).toBe('der');
    });
});

describe('fns certificate parser error classification', () => {
    it('throws explicit code for malformed base64', () => {
        expect(() => decodeRawBase64ToBytes('@@@not-base64@@@')).toThrowError(/base64/i);
        try {
            decodeRawBase64ToBytes('@@@not-base64@@@');
        } catch (error) {
            expect(error.code).toBe('cert_base64_decode_failed');
        }
    });

    it('throws explicit ASN.1 code for malformed DER', () => {
        const malformed = new Uint8Array([0x30, 0xff, 0xff, 0xff]).buffer;
        try {
            parseCertificate(malformed);
            throw new Error('Expected parseCertificate to fail');
        } catch (error) {
            expect(error.code).toBe('cert_asn1_failed');
        }
    });
});

describe('fns revocation proxy recommendation', () => {
    it('recommends proxy when failure rate crosses threshold', () => {
        expect(shouldRecommendProxy(6, 5)).toBe(true);
    });

    it('does not recommend proxy for small sample', () => {
        expect(shouldRecommendProxy(2, 2)).toBe(false);
    });
});

describe('fns revocation network policy', () => {
    it('defaults to backend_first policy', () => {
        expect(resolveNetworkPolicy()).toBe('backend_first');
    });

    it('does not attempt browser fetch in backend_first mode', () => {
        expect(shouldAttemptBrowserFetch('https://pki.tax.gov.ru/cdp/test.crl')).toBe(false);
    });
});

describe('fns revocation effective status', () => {
    it('treats expired certificate as revoked even when CRL has no hit', () => {
        const certInfo = { notAfterEpochMs: Date.now() - 1000 };
        expect(isCertificateExpired(certInfo)).toBe(true);
        expect(resolveFinalRevocationState(false, true)).toEqual({
            revoked: true,
            reason: 'expired',
        });
    });

    it('keeps non-expired certificate not revoked without CRL hit', () => {
        const certInfo = { notAfterEpochMs: Date.now() + 60_000 };
        expect(isCertificateExpired(certInfo)).toBe(false);
        expect(resolveFinalRevocationState(false, false)).toEqual({
            revoked: false,
            reason: null,
        });
    });
});

describe('fns revocation CRL source selection', () => {
    it('prioritizes certificate CDP URLs over static fallback list', () => {
        const certInfo = {
            crlDistributionPoints: [
                'http://pki.tax.gov.ru/cdp/fcb21945f2bb7670b371b03cee94381d4f975cd5.crl',
                'http://uc.nalog.ru/cdp/fcb21945f2bb7670b371b03cee94381d4f975cd5.crl',
            ],
        };

        const urls = resolveCrlUrls(certInfo);
        expect(urls[0]).toContain('/cdp/fcb21945f2bb7670b371b03cee94381d4f975cd5.crl');
        expect(urls[1]).toContain('/cdp/fcb21945f2bb7670b371b03cee94381d4f975cd5.crl');
    });
});
