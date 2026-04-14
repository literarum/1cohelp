/**
 * @vitest-environment jsdom
 * Регрессия: полноэкранные «Настройки» (.is-fullscreen → z-index 90) не должны перекрывать
 * соседние fixed-оверлеи «Кастомизация» и «Недавно удалённые» (z-index 100).
 */
'use strict';

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODALS_CSS_PATH = join(__dirname, '../../css/components/modals.css');

function injectModalsCss() {
    const css = readFileSync(MODALS_CSS_PATH, 'utf8');
    const style = document.createElement('style');
    style.setAttribute('data-test', 'modals-css');
    style.textContent = css;
    document.head.appendChild(style);
}

describe('settings fullscreen vs nested modals z-index', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = `
            <div id="customizeUIModal" class="fixed inset-0 is-fullscreen"></div>
            <div id="appCustomizationModal" class="app-customization-overlay fixed inset-0"></div>
            <div id="recentlyDeletedModal" class="fixed inset-0"></div>
        `;
        injectModalsCss();
    });

    it('appCustomizationModal stacks above fullscreen settings (90)', () => {
        const settings = document.getElementById('customizeUIModal');
        const customization = document.getElementById('appCustomizationModal');
        const zSettings = parseInt(window.getComputedStyle(settings).zIndex, 10);
        const zCustomization = parseInt(window.getComputedStyle(customization).zIndex, 10);
        expect(zSettings).toBe(90);
        expect(zCustomization).toBe(100);
        expect(zCustomization).toBeGreaterThan(zSettings);
    });

    it('recentlyDeletedModal stacks above fullscreen settings (90)', () => {
        const settings = document.getElementById('customizeUIModal');
        const trash = document.getElementById('recentlyDeletedModal');
        const zSettings = parseInt(window.getComputedStyle(settings).zIndex, 10);
        const zTrash = parseInt(window.getComputedStyle(trash).zIndex, 10);
        expect(zSettings).toBe(90);
        expect(zTrash).toBe(100);
        expect(zTrash).toBeGreaterThan(zSettings);
    });
});
