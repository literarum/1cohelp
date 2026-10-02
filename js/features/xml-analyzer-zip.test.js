'use strict';

import { describe, expect, it } from 'vitest';
import { crc32, uniqueZipNames, buildZipStored } from './xml-analyzer-zip.js';

describe('xml-analyzer-zip', () => {
    it('crc32 совпадает с эталоном', () => {
        expect((crc32(new TextEncoder().encode('123456789')) >>> 0).toString(16)).toBe('cbf43926');
    });
    it('имена в архиве уникальны', () => {
        const r = uniqueZipNames(['a.cer', 'a.cer', 'b.cer']);
        expect(new Set(r).size).toBe(3);
    });
    it('собирает корректный zip с сигнатурами', () => {
        const z = buildZipStored([{ name: 'a.txt', data: new TextEncoder().encode('привет') }]);
        const u = z instanceof Uint8Array ? z : new Uint8Array(z);
        expect(u[0]).toBe(0x50);
        expect(u[1]).toBe(0x4b);
    });
});
