import { describe, it, expect } from 'vitest';
import { cssColorToHex, syncThemeColorMeta } from './theme-color-meta.js';

describe('theme-color-meta', () => {
    it('cssColorToHex', () => {
        expect(cssColorToHex('rgb(18, 18, 31)')).toBe('#12121f');
        expect(cssColorToHex('rgba(255, 255, 255, 1)')).toBe('#ffffff');
        expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
        expect(cssColorToHex('#ABCDEF')).toBe('#abcdef');
        expect(cssColorToHex('transparent')).toBeNull();
    });
    it('syncThemeColorMeta берёт фон body', () => {
        document.head.innerHTML = '<meta name="theme-color" content="#000000">';
        document.body.style.backgroundColor = 'rgb(240, 241, 242)';
        syncThemeColorMeta();
        expect(document.querySelector('meta[name="theme-color"]').content).toBe('#f0f1f2');
    });
});
