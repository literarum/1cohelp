/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '../../index.html');

/**
 * Регрессия: диалог «Выйти без сохранения» должен быть ВЫШЕ модалки закладки (z-[90]),
 * иначе await showUnsavedConfirmModal() не получает клики и Отмена/крестик «зависают».
 */
describe('unsavedConfirmModal stacking', () => {
    it('unsavedConfirmModal z-index is above bookmarkModal (created in JS at z-[90])', () => {
        const html = readFileSync(indexPath, 'utf8');
        const m = html.match(/id="unsavedConfirmModal"[^>]*class="([^"]*)"/);
        expect(m, 'unsavedConfirmModal anchor found').toBeTruthy();
        const cls = m[1];
        expect(cls).toMatch(/z-\[11\d\]/);
        expect(html).toMatch(/id="unsavedConfirmModal"[^>]*style="[^"]*z-index:\s*110/);
    });

    it('tailwind build includes z-[110] utility (class in index.html)', () => {
        const cssPath = join(__dirname, '../../css/tailwind.generated.css');
        const css = readFileSync(cssPath, 'utf8');
        expect(css).toContain('.z-\\[110\\]');
        expect(css).toContain('z-index: 110');
    });
});
