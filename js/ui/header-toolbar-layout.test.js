'use strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
const indexHtmlPath = join(repoRoot, 'site/index.html');
const baseCssPath = join(repoRoot, 'site/css/base/base.css');
const headerTemplatePath = join(repoRoot, 'site/templates/components/header.html');

/**
 * Регрессия: перенос кнопок в шапке и обрезка UI из-за overflow на внешнем кластере.
 * Внешний .header-toolbar-cluster — overflow:visible; прокрутка только на .header-toolbar-cluster-scroll.
 */
function extractTopHeaderActionsOpenTag(html) {
    const m = html.match(/<div\s[^>]*\bid="topHeaderActions"[^>]*>/);
    return m ? m[0] : null;
}

function sliceAfterTopHeaderActions(html, len = 500) {
    const idx = html.indexOf('id="topHeaderActions"');
    if (idx < 0) return '';
    return html.slice(idx, idx + len);
}

describe('header toolbar layout (no wrap inside action cluster)', () => {
    it('index.html: #topHeaderActions без flex-wrap; внутри — header-toolbar-cluster-scroll', () => {
        const html = readFileSync(indexHtmlPath, 'utf8');
        const tag = extractTopHeaderActionsOpenTag(html);
        expect(tag, 'topHeaderActions div must exist').toBeTruthy();
        expect(tag).not.toMatch(/\bflex-wrap\b/);
        const slice = sliceAfterTopHeaderActions(html);
        expect(slice).toMatch(/header-toolbar-cluster-scroll/);
        expect(slice).toMatch(/flex-nowrap/);
        expect(slice).toMatch(/flex-row/);
    });

    it('header template: #topHeaderActions matches index contract', () => {
        const html = readFileSync(headerTemplatePath, 'utf8');
        const tag = extractTopHeaderActionsOpenTag(html);
        expect(tag, 'topHeaderActions must exist in header template').toBeTruthy();
        expect(tag).not.toMatch(/\bflex-wrap\b/);
        const slice = sliceAfterTopHeaderActions(html);
        expect(slice).toMatch(/header-toolbar-cluster-scroll/);
        expect(slice).toMatch(/flex-nowrap/);
    });

    it('base.css: внутренний ряд кластера — nowrap; внешний кластер без overflow-x', () => {
        const css = readFileSync(baseCssPath, 'utf8');
        expect(css).toMatch(
            /\.header-toolbar-cluster-scroll\s*\{[^}]*flex-wrap:\s*nowrap\s*!important/s,
        );
        expect(css).toMatch(
            /#staticHeaderWrapper\s+header\s*>\s*div\s*>\s*div\.header-toolbar-row\s+\.header-toolbar-cluster\s*\{[^}]*overflow:\s*visible/s,
        );
        expect(css).toMatch(
            /\.header-toolbar-cluster-scroll\s*\{[^}]*display:\s*flex\s*!important/s,
        );
    });
});
