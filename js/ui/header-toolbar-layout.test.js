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
    it('index.html: обёртка #searchInput — на md растёт между кластерами (flex-1)', () => {
        const html = readFileSync(indexHtmlPath, 'utf8');
        const idx = html.indexOf('id="searchInput"');
        expect(idx).toBeGreaterThan(0);
        const before = html.slice(Math.max(0, idx - 320), idx);
        expect(before).toMatch(/\brelative\b.*\bmd:flex-1\b/s);
    });

    it('index.html: внешний toolbar-row — колонка до md, одна строка с md (без перекрытия блоков)', () => {
        const html = readFileSync(indexHtmlPath, 'utf8');
        const m = html.match(/class="header-toolbar-row([^"]*)"/);
        expect(m, 'header-toolbar-row class must exist').toBeTruthy();
        const cls = m[1];
        expect(cls).toMatch(/\bmd:flex-row\b/);
        expect(cls).toMatch(/\bmd:flex-nowrap\b/);
        expect(cls).toMatch(/\bflex-col\b/);
        expect(cls).toMatch(/\bmd:flex-1\b/);
        /* На md раскладку усиливает base.css (grid) */
        expect(cls).not.toMatch(/\bmd:w-auto\b/);
    });

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

    it('base.css: внутренний ряд кластера — nowrap; внешний кластер без overflow-x; toolbar-row grid только от md', () => {
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
        expect(css).toMatch(
            /@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[^}]*#staticHeaderWrapper\s+header\s*>\s*div\s*>\s*div\.header-toolbar-row[^}]*flex-wrap:\s*nowrap\s*!important/s,
        );
        expect(css).toMatch(
            /@media\s*\(\s*max-width:\s*767\.98px\s*\)\s*\{[^}]*#staticHeaderWrapper\s+header\s*>\s*div\s*>\s*div\.header-toolbar-row[^}]*flex-direction:\s*column/s,
        );
        expect(css).toMatch(
            /@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[^}]*#staticHeaderWrapper\s+header\s*>\s*div\s*>\s*div\.header-toolbar-row[^}]*display:\s*grid/s,
        );
        expect(css).toMatch(
            /@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[^}]*#staticHeaderWrapper\s+header\s*>\s*div\s*>\s*div\.header-toolbar-row[^}]*grid-template-columns:\s*minmax\(0,\s*auto\)\s+minmax\(12rem,\s*1fr\)\s+auto/s,
        );
    });
});

describe('header toolbar vertical alignment & stacked actions row', () => {
    it('index.html: #timerDisplay без items-baseline (единая ось с иконками)', () => {
        const html = readFileSync(indexHtmlPath, 'utf8');
        const m = html.match(/id="timerDisplay"[^>]*class="([^"]*)"/);
        expect(m, 'timerDisplay must exist').toBeTruthy();
        expect(m[1]).not.toMatch(/items-baseline/);
        expect(m[1]).toMatch(/items-center/);
    });

    it('base.css: иконки в .header-toolbar-cluster-scroll — inline-flex + min-height (согласованность с таймером)', () => {
        const css = readFileSync(baseCssPath, 'utf8');
        expect(css).toMatch(
            /#staticHeaderWrapper\s+header\s+\.header-toolbar-cluster-scroll\s+button\s*\{[^}]*display:\s*inline-flex/s,
        );
        expect(css).toMatch(
            /#staticHeaderWrapper\s+header\s+\.header-toolbar-cluster-scroll\s+button\s*\{[^}]*min-height:\s*2\.25rem/s,
        );
    });

    it('base.css: до md правый кластер #topHeaderActions — flex-end (убирает пустоту справа в колонке)', () => {
        const css = readFileSync(baseCssPath, 'utf8');
        const start = css.indexOf('@media (max-width: 767.98px)');
        const end = css.indexOf('@media (min-width: 768px)', start);
        expect(start, 'max-width 767.98px block').toBeGreaterThan(-1);
        expect(end, 'closing before md block').toBeGreaterThan(start);
        const slice = css.slice(start, end);
        expect(slice).toMatch(/#topHeaderActions[\s\S]*justify-content:\s*flex-end/);
    });

    it('header template: #timerDisplay согласован с index (items-center)', () => {
        const html = readFileSync(headerTemplatePath, 'utf8');
        const m = html.match(/id="timerDisplay"[^>]*class="([^"]*)"/);
        expect(m, 'timerDisplay in template').toBeTruthy();
        expect(m[1]).not.toMatch(/items-baseline/);
        expect(m[1]).toMatch(/items-center/);
    });
});
