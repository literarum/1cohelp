import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../css/components/modals.css'),
    'utf8',
);

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
