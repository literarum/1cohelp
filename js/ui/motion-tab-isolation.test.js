import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import './motion.js';
import { applyMotionMode } from '../utils/motion-pref.js';

afterEach(() => { document.body.replaceChildren(); document.body.className = ''; vi.restoreAllMocks(); });
describe('one owner for tab transitions', () => {
    it('clicking a tab never starts a global competing card animation on the outgoing panel', () => {
        applyMotionMode('auto', { persistMirror: false });
        document.body.innerHTML = '<button class="tab-btn">Next</button><section class="tab-content"><div class="view-item">Outgoing</div></section>';
        document.querySelector('button').click();
        expect(document.body.classList.contains('motion-entering')).toBe(false);
    });
    it('keeps the navigation fade separate from transforms and staggered card animations', () => {
        const css = postcss.parse(readFileSync(resolve(process.cwd(), 'css/components/motion.css'), 'utf8'));
        const competing = [];
        css.walkRules(rule => {
            if (rule.selector.includes('.tab-content') && rule.nodes.some(d => d.prop === 'animation')) competing.push(rule.selector);
        });
        expect(competing).toEqual([]);
    });
});
