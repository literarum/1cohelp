/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountTrainingRichEditor } from './training-rich-editor.js';

describe('training-rich-editor', () => {
    /** @type {HTMLDivElement} */
    let host;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        host.remove();
    });

    it('getHtml returns sanitized HTML without script', () => {
        const ed = mountTrainingRichEditor(host, { ariaLabel: 'Тест' });
        ed.setHtml('<p>Hi</p><script>x</script>');
        const h = ed.getHtml();
        expect(h).not.toMatch(/script/i);
        expect(h).toMatch(/Hi/);
        ed.destroy();
    });

    it('setHtml empty yields valid default block', () => {
        const ed = mountTrainingRichEditor(host, {});
        ed.setHtml('');
        expect(ed.getHtml().length).toBeGreaterThan(0);
        ed.destroy();
    });
});
