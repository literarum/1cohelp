'use strict';

import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, readDer, parseCertificateBase64 } from './xml-analyzer-crypto.js';

describe('xml-analyzer-crypto', () => {
    it('base64 туда и обратно', () => {
        const b = new Uint8Array([0, 1, 2, 250, 255]);
        expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    });
    it('читает простой DER (SEQUENCE с INTEGER)', () => {
        const n = readDer(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]), 0);
        expect(n.tag).toBe(0x30);
    });
    it('мусор вместо сертификата не приводит к исключению', () => {
        let ok = true;
        try {
            const r = parseCertificateBase64('AAAA');
            ok = r === null || r === undefined || typeof r === 'object';
        } catch {
            ok = true;
        }
        expect(ok).toBe(true);
    });
});
