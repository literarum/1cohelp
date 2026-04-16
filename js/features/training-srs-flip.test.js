'use strict';

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
    escapeTrainingSrsHtml,
    buildSrsFlipCardSectionHtml,
    setSrsFlipRevealed,
    SRS_FLIP_LABEL_SHOW,
    SRS_FLIP_LABEL_HIDE,
} from './training-srs-flip.js';

describe('training-srs-flip', () => {
    it('escapeTrainingSrsHtml neutralizes HTML', () => {
        expect(escapeTrainingSrsHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
        expect(escapeTrainingSrsHtml('a&b')).toBe('a&amp;b');
    });

    it('buildSrsFlipCardSectionHtml includes structure and escaped content', () => {
        const html = buildSrsFlipCardSectionHtml({
            front: 'Q<script>',
            back: 'A"><img',
            cardId: 42,
        });
        expect(html).toContain('data-srs-flip-root');
        expect(html).toContain('data-srs-flip-hit');
        expect(html).toContain('tabindex="0"');
        expect(html).not.toContain('data-srs-flip-toggle');
        expect(html).toContain('training-srs-flip__hint');
        expect(html).toContain('data-srs-flip-front');
        expect(html).toContain('data-srs-flip-back');
        expect(html).toContain('id="training-srs-flip-back-42"');
        expect(html).toContain('aria-controls="training-srs-flip-back-42"');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&quot;&gt;&lt;img');
        expect(html).not.toContain('<script>');
    });

    it('setSrsFlipRevealed updates class, aria, and hit area', () => {
        const dom = new JSDOM(
            `<div data-srs-flip-root class="training-srs-flip">
                <div data-srs-flip-hit role="button" aria-pressed="false" aria-label="${SRS_FLIP_LABEL_SHOW}">
                <div class="training-srs-flip__inner">
                    <div data-srs-flip-front aria-hidden="false">F</div>
                    <div data-srs-flip-back aria-hidden="true">B</div>
                </div>
                </div>
            </div>`,
        );
        const root = dom.window.document.querySelector('[data-srs-flip-root]');
        const hit = dom.window.document.querySelector('[data-srs-flip-hit]');
        const front = dom.window.document.querySelector('[data-srs-flip-front]');
        const back = dom.window.document.querySelector('[data-srs-flip-back]');

        setSrsFlipRevealed(/** @type {HTMLElement} */ (root), true);
        expect(root.classList.contains('training-srs-flip--revealed')).toBe(true);
        expect(hit.getAttribute('aria-pressed')).toBe('true');
        expect(hit.getAttribute('aria-label')).toBe(SRS_FLIP_LABEL_HIDE);
        expect(front.getAttribute('aria-hidden')).toBe('true');
        expect(back.getAttribute('aria-hidden')).toBe('false');

        setSrsFlipRevealed(/** @type {HTMLElement} */ (root), false);
        expect(root.classList.contains('training-srs-flip--revealed')).toBe(false);
        expect(hit.getAttribute('aria-pressed')).toBe('false');
        expect(hit.getAttribute('aria-label')).toBe(SRS_FLIP_LABEL_SHOW);
        expect(front.getAttribute('aria-hidden')).toBe('false');
        expect(back.getAttribute('aria-hidden')).toBe('true');
    });

    it('setSrsFlipRevealed is no-op for missing nodes', () => {
        const dom = new JSDOM('<div></div>');
        expect(() =>
            setSrsFlipRevealed(
                /** @type {HTMLElement} */ (dom.window.document.querySelector('div')),
                true,
            ),
        ).not.toThrow();
    });
});
