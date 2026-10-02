import { describe, it, expect } from 'vitest';
import { sha256Hex, timingSafeEqual } from './sha256.js';

describe('sha256Hex', () => {
    it('известные векторы', () => {
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
            '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
        );
    });
    it('кириллица и длинная строка (несколько блоков)', () => {
        expect(sha256Hex('привет')).toBe('e58f1e8c55fa105bdd3f40e5037eb0b039b5998d52c05e6cd98878dd2da5cab2');
        expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
    });
    it('timingSafeEqual', () => {
        expect(timingSafeEqual('abc', 'abc')).toBe(true);
        expect(timingSafeEqual('abc', 'abd')).toBe(false);
        expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });
});
