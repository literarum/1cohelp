/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { applyPreviewSettings, setPreviewSettingsDependencies } from './preview-settings.js';
import { contrastRatio } from './color-settings-engine.js';
import { calculateSecondaryColor, hexToHsl, hslToHex, adjustHsl } from '../utils/color.js';

const value = (name) => document.documentElement.style.getPropertyValue(name).trim();
const base = { primaryColor: '#9933ff', theme: 'dark', fontSize: 80 };
const apply = (settings) => applyPreviewSettings({ ...base, ...settings }, { preview: true });

beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.body.className = '';
    document.body.innerHTML = '';
    setPreviewSettingsDependencies({
        DEFAULT_UI_SETTINGS: base, calculateSecondaryColor, hexToHsl, hslToHex, adjustHsl,
        setTheme: vi.fn(),
    });
});

describe('customization color contracts', () => {
    it('applies standalone text, then clears it without leaving background overrides', async () => {
        await apply({ isTextCustom: true, customTextColor: '#2468ac' });
        for (const theme of ['light', 'dark']) {
            expect(value(`--override-text-primary-${theme}`)).toBe('#2468ac');
            expect(value(`--override-background-${theme}`)).toBe('');
        }
        expect(document.body.classList.contains('custom-text-active')).toBe(true);
        await apply({ isTextCustom: false });
        expect(value('--override-text-primary-dark')).toBe('');
        expect(document.body.classList.contains('custom-text-active')).toBe(false);
    });

    it.each(['#ffffff', '#000000', '#808080', '#cccc00', '#182b38', '#fef3c7', '#de0e9b', '#0f8185', '#9359c2'])
    ('keeps automatic text readable across the actual %s palette in either theme', async (background) => {
        for (const theme of ['dark', 'light']) {
            await apply({ theme, backgroundAnchor: theme, isBackgroundCustom: true, backgroundColor: background });
            expect(value(`--override-background-${theme}`)).toBe(background);
            for (const slot of ['light', 'dark']) {
                for (const surface of ['background', 'surface-1', 'surface-2', 'input-bg']) {
                    for (const text of ['primary', 'secondary']) {
                        expect(contrastRatio(value(`--override-text-${text}-${slot}`), value(`--override-${surface}-${slot}`)), `${theme}/${slot}/${surface}/${text}`).toBeGreaterThanOrEqual(4.5);
                    }
                }
            }
        }
    });

    it.each(['#ffff00', '#06b6d4', '#ef4444', '#9933ff', '#000000', '#ffffff', '#777777'])
    ('preserves accent %s with readable filled and hover text', async (primaryColor) => {
        await apply({ primaryColor });
        expect(value('--color-primary')).toBe(primaryColor);
        for (const background of ['--color-primary', '--color-secondary']) {
            // CSS fallback before the preview engine writes an adaptive foreground.
            expect(contrastRatio(value('--color-text-on-primary') || '#ffffff', value(background))).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('preserves explicitly chosen text even when contrast is poor', async () => {
        await apply({ isTextCustom: true, customTextColor: '#ffff00', isBackgroundCustom: true, backgroundColor: '#ffffff' });
        expect(value('--override-text-primary-dark')).toBe('#ffff00');
    });

    it('does not couple destructive button colors to the unrelated primary accent', () => {
        const css = postcss.parse(readFileSync('css/theme/custom-theme.css', 'utf8'));
        css.walkRules(rule => {
            if (!rule.selector.includes('#confirmAndClearDataBtn') && !rule.selector.includes('.btn-destructive-all')) return;
            expect(rule.nodes.some(d => d.prop === 'color' && d.value === 'var(--color-text-on-primary)')).toBe(false);
        });
    });

    it('filled component accent consumers use the adaptive foreground', () => {
        const files = readdirSync('css/components').filter(name => name.endsWith('.css'));
        for (const file of files) {
            const css = postcss.parse(readFileSync(`css/components/${file}`, 'utf8'));
            css.walkRules(rule => {
                if (!rule.nodes.some(d => /^background(?:-color)?$/.test(d.prop) && /var\(--color-(?:primary|secondary)[,)]/.test(d.value))) return;
                expect(rule.nodes.some(d => d.prop === 'color' && /^(?:#fff(?:fff)?|white)$/i.test(d.value)), `${file}: ${rule.selector}`).toBe(false);
            });
        }
    });

    it('standalone text utility overrides cannot recolor filled primary actions or their labels', () => {
        const css = postcss.parse(readFileSync('css/theme/custom-theme.css', 'utf8'));
        document.body.className = 'custom-text-active';
        document.body.innerHTML = '<button class="bg-primary text-white dark:text-gray-200"><span class="text-gray-700">Organize</span></button>';
        for (const el of document.body.querySelectorAll('button,span')) {
            css.walkRules(rule => {
                if (!rule.selector.includes('custom-text-active') || !rule.nodes.some(d => d.prop === 'color')) return;
                expect(postcss.list.comma(rule.selector).some(s => el.matches(s))).toBe(false);
            });
        }
    });

    it('does not assign primary fill or generic text overrides to semantic components', () => {
        const css = postcss.parse(readFileSync('css/theme/custom-theme.css', 'utf8'));
        document.body.className = 'custom-background-active';
        document.body.innerHTML = '<button id="appCustomizationCancelBtn" class="ac-btn"><span>Cancel</span></button><button class="ac-swatch" style="--sw:#ef4444"><i>check</i></button><span class="xa-badge xa-badge-ok">Valid</span><a href="#">Link</a>';
        for (const el of document.body.querySelectorAll('button, button > *, .xa-badge, a')) {
            css.walkRules(rule => {
                const overwrites = rule.nodes.some(d => (d.prop === 'background-color' && d.value === 'var(--color-primary)') || (d.prop === 'color' && d.important));
                if (!overwrites || rule.selector.includes(':hover')) return;
                // Pseudo-elements are not element matches (and jsdom cannot parse vendor ones).
                expect(postcss.list.comma(rule.selector).filter(s => !s.includes('::') && !s.includes(':-ms-input-placeholder')).some(s => el.matches(s)), `${el.outerHTML}: ${rule.selector}`).toBe(false);
            });
        }
    });
});
