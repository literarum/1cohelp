import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const cssRoot = join(dirname(fileURLToPath(import.meta.url)), '../../css');
const readCss = (path) => readFileSync(join(cssRoot, path), 'utf8');
const scrollbar = postcss.parse(readCss('components/scrollbar.css'));
const layout = postcss.parse(readCss('components/layout-repair.css'));
const followup = postcss.parse(readCss('components/app-polish-followup.css'));

function matchingRules(sheet, element, pseudo = '') {
    const matches = [];
    sheet.walkRules((rule) => {
        if (postcss.list.comma(rule.selector).some((selector) => {
            if (pseudo && !selector.endsWith(pseudo)) return false;
            if (!pseudo && selector.includes('::')) return false;
            const host = pseudo ? selector.slice(0, -pseudo.length) : selector;
            return element.matches(host);
        })) matches.push(rule);
    });
    return matches;
}

function hasDeclaration(rule, prop, value) {
    return rule.nodes.some((node) => node.type === 'decl' && node.prop === prop &&
        node.value === value && node.important);
}

describe('shared input and scrollbar styling contract', () => {
    it('gives anonymous nested regions, editors, menus and dialogs both thin axes', () => {
        document.body.innerHTML = '<div><section><textarea></textarea><dialog><div></div></dialog>' +
            '<ul class="cs-list"></ul><nav class="ac-nav"></nav></section></div>';
        const regions = [document.documentElement, document.body, ...document.body.querySelectorAll('*')];
        for (const theme of ['', 'dark']) {
            document.documentElement.className = theme;
            for (const region of regions) {
                const rules = matchingRules(scrollbar, region, '::-webkit-scrollbar');
                expect(rules.some((rule) => hasDeclaration(rule, 'width', '8px') &&
                    hasDeclaration(rule, 'height', '8px') && hasDeclaration(rule, 'display', 'block'))).toBe(true);
            }
        }
        document.documentElement.className = '';
    });

    it('keeps arrow styling active against component important rules and Chromium standards overrides', () => {
        const layer = scrollbar.nodes.find((node) => node.type === 'atrule' && node.name === 'layer');
        expect(layer).toBeTruthy();
        const chromium = layer.nodes.find((node) => node.type === 'atrule' && node.name === 'supports');
        expect(chromium?.params).toBe('selector(::-webkit-scrollbar)');
        const standardResets = matchingRules(chromium, document.body);
        expect(standardResets.some((rule) => hasDeclaration(rule, 'scrollbar-width', 'auto') &&
            hasDeclaration(rule, 'scrollbar-color', 'auto'))).toBe(true);
        for (const axis of ['vertical', 'horizontal']) {
            for (const direction of ['decrement', 'increment']) {
                const selector = `::-webkit-scrollbar-button:single-button:${axis}:${direction}`;
                const arrows = matchingRules(layer, document.body, selector);
                expect(arrows.some((rule) => rule.nodes.some((decl) => decl.prop === 'background-image' &&
                    decl.value.includes('var(--color-text-secondary)') && decl.important))).toBe(true);
            }
        }
        const firefox = layer.nodes.filter((node) => node.type === 'rule');
        expect(firefox.some((rule) => hasDeclaration(rule, 'scrollbar-width', 'thin'))).toBe(true);
    });

    it('keeps base text-field and validation styling, with the final quiet-focus layer covering commands', () => {
        document.body.innerHTML = '<input><input type="search"><input type="password"><textarea></textarea>' +
            '<select><option>One</option></select><div contenteditable="true" tabindex="0"></div>' +
            '<div role="textbox" tabindex="0"></div><button>Save</button><input type="checkbox">' +
            '<input class="form-field-invalid" aria-invalid="true">';
        for (const field of document.querySelectorAll('input:not([type=checkbox]), textarea, select, [contenteditable], [role=textbox]')) {
            field.focus();
            const rules = matchingRules(layout, field);
            expect(rules.some((rule) => hasDeclaration(rule, 'outline', 'none') &&
                hasDeclaration(rule, 'box-shadow', 'none'))).toBe(true);
        }
        const button = document.querySelector('button');
        button.focus();
        const buttonRules = matchingRules(layout, button);
        expect(buttonRules.some((rule) => hasDeclaration(rule, 'outline', 'none'))).toBe(false);
        expect(buttonRules.some((rule) => hasDeclaration(rule, 'outline', '2px solid var(--color-primary)'))).toBe(true);
        const finalButtonRules = matchingRules(followup, button);
        expect(finalButtonRules.some(rule => hasDeclaration(rule, 'outline', 'none') && hasDeclaration(rule, 'box-shadow', 'none'))).toBe(true);
        expect(finalButtonRules.some(rule => rule.parent.name === 'layer' && rule.parent.params === 'app-quiet-focus')).toBe(true);
        for (const control of document.querySelectorAll('input[type=checkbox], .form-field-invalid')) {
            control.focus();
            expect(matchingRules(layout, control).some((rule) =>
                hasDeclaration(rule, 'border-color', 'var(--color-border)'))).toBe(false);
        }
    });

    it('points each conic arrow tip toward the direction in which its button scrolls', () => {
        // A 90-degree wedge has its tip at the gradient origin. The two arms
        // extend into the box, so the top arrow needs its tip at the top edge.
        const geometry = [
            ['vertical', 'decrement', 'from 135deg at 50% 0%'],
            ['vertical', 'increment', 'from -45deg at 50% 100%'],
            ['horizontal', 'decrement', 'from 45deg at 0% 50%'],
            ['horizontal', 'increment', 'from 225deg at 100% 50%'],
        ];
        for (const [axis, direction, tip] of geometry) {
            const rules = matchingRules(scrollbar, document.body,
                `::-webkit-scrollbar-button:single-button:${axis}:${direction}`);
            expect(rules.some(rule => rule.nodes.some(decl => decl.prop === 'background-image' &&
                decl.value.startsWith(`conic-gradient(${tip},`)))).toBe(true);
        }
    });

    it('loads the production scrollbar sheet after the component styles that used to override it', () => {
        const main = postcss.parse(readCss('main.css'));
        const imports = main.nodes.filter((node) => node.type === 'atrule' && node.name === 'import');
        expect(imports.at(-1).params).toBe("url('./components/scrollbar.css')");
    });
});
