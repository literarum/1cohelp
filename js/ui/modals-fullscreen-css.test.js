import { describe, it, expect } from 'vitest';

const cssUrl = new URL('../../css/components/modals.css', import.meta.url);
async function loadCss() {
    if (typeof window !== 'undefined' && typeof fetch === 'function' && cssUrl.protocol.startsWith('http')) {
        return (await fetch(cssUrl)).text();
    }
    const { readFileSync } = await import('node:fs');
    return readFileSync(cssUrl, 'utf8');
}
const css = await loadCss();

describe('полноэкранный режим модалок', () => {
    it('перебивает общий лимит .modal-inner-container (920px / 90vh)', () => {
        const m = css.match(/\.is-fullscreen\s*>\s*\.modal-inner-container\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/max-width:\s*none\s*!important/);
        expect(m[1]).toMatch(/max-height:\s*none\s*!important/);
        expect(m[1]).toMatch(/width:\s*100%\s*!important/);
        expect(m[1]).toMatch(/height:\s*100%\s*!important/);
    });
});
