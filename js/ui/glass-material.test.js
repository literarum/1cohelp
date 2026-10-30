import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeMaterial, applyGlassMaterial } from './glass-material.js';
import { buildAppearanceProfile, parseAppearanceProfile } from './appearance-profile.js';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('optional glass appearance', () => {
    beforeEach(() => { document.body.innerHTML = ''; document.documentElement.removeAttribute('style'); });
    it('defaults to solid and bounds untrusted material values', () => {
        expect(sanitizeMaterial({})).toEqual({ surfaceMaterial: 'solid', glassMatte: 65, glassRefraction: 30 });
        expect(sanitizeMaterial({ surfaceMaterial: 'url(evil)', glassMatte: Infinity, glassRefraction: -5 }))
            .toEqual({ surfaceMaterial: 'solid', glassMatte: 65, glassRefraction: 0 });
        expect(sanitizeMaterial({ surfaceMaterial: 'glass', glassMatte: '120', glassRefraction: '44' }))
            .toEqual({ surfaceMaterial: 'glass', glassMatte: 100, glassRefraction: 44 });
    });
    it('changes backdrop-only parameters and restores solid without leaving a filter', () => {
        applyGlassMaterial({ surfaceMaterial: 'glass', glassMatte: 20, glassRefraction: 80 });
        const root = document.documentElement;
        expect(root.dataset.surfaceMaterial).toBe('glass');
        const filter = document.querySelector('#copilot-glass-backdrop');
        expect(filter.querySelector('feDisplacementMap').getAttribute('scale')).toBe('19.2');
        expect(root.style.getPropertyValue('--glass-blur')).toBe('10px');
        applyGlassMaterial({ surfaceMaterial: 'glass', glassMatte: 90, glassRefraction: 0 });
        expect(root.style.getPropertyValue('--glass-blur')).toBe('31px');
        expect(filter.querySelector('feDisplacementMap').getAttribute('scale')).toBe('0');
        expect(document.querySelectorAll('#copilot-glass-filters')).toHaveLength(1);
        applyGlassMaterial({});
        expect(root.dataset.surfaceMaterial).toBe('solid');
        expect(root.style.getPropertyValue('--glass-filter')).toBe('');
    });
    it('round-trips material in a portable profile with sanitized controls', () => {
        const profile = buildAppearanceProfile({ surfaceMaterial: 'glass', glassMatte: 76, glassRefraction: 42 }, {});
        const parsed = parseAppearanceProfile(JSON.stringify(profile));
        expect(parsed.ok).toBe(true);
        expect(parsed.appearance).toMatchObject({ surfaceMaterial: 'glass', glassMatte: 76, glassRefraction: 42 });
    });
    it('places the tinted background above legacy important dialog backgrounds without filtering content', () => {
        const css = postcss.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../css/components/glass-material.css'), 'utf8'));
        const layer = css.nodes.find(node => node.type === 'atrule' && node.name === 'layer' && node.params === 'app-material');
        expect(layer).toBeTruthy();
        const background = layer.nodes.find(node => node.type === 'rule' && node.selector.includes('.ac-studio'));
        expect(background.nodes.some(node => node.prop === 'background' && node.important && node.value.includes('transparent'))).toBe(true);
        expect(background.nodes.some(node => node.prop === 'filter')).toBe(false);
    });
});
