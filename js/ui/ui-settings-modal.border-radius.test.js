/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { getDefaultUISettings, DEFAULT_BORDER_RADIUS_PX } from '../config.js';
import { getSettingsFromModal, setUISettingsModalDependencies } from './ui-settings-modal.js';

describe('getSettingsFromModal border radius', () => {
    beforeEach(() => {
        const dom = new JSDOM(
            `<!DOCTYPE html><html><body>
        <div id="customizeUIModal">
          <span id="fontSizeLabel">100%</span>
          <div id="panelSortContainer"></div>
        </div>
        <div id="appCustomizationModal">
          <input type="range" id="borderRadiusSlider" min="0" max="20" value="5" />
          <input type="range" id="densitySlider" min="0" max="6" value="3" />
          <input type="radio" name="themeMode" value="dark" checked />
        </div>
      </body></html>`,
            { url: 'http://localhost/' },
        );
        globalThis.document = dom.window.document;
        globalThis.window = dom.window;

        const defaults = getDefaultUISettings(['main']);
        const State = {
            currentPreviewSettings: { ...defaults, borderRadius: 12 },
        };
        setUISettingsModalDependencies({
            State,
            DEFAULT_UI_SETTINGS: defaults,
            tabsConfig: [{ id: 'main', name: 'Главная' }],
            defaultPanelOrder: ['main'],
            defaultPanelVisibility: [true],
        });
    });

    it('читает 0 с ползунка без подмены на fallback (регрессия parseInt || 8)', () => {
        const slider = document.getElementById('borderRadiusSlider');
        slider.value = '0';
        const s = getSettingsFromModal();
        expect(s.borderRadius).toBe(0);
    });

    it('если ползунок недоступен — берётся clamp от currentPreviewSettings', () => {
        const slider = document.getElementById('borderRadiusSlider');
        slider.remove();
        const s = getSettingsFromModal();
        expect(s.borderRadius).toBe(12);
    });

    it('некорректное сохранённое значение даёт DEFAULT_BORDER_RADIUS_PX после clamp в цепочке', () => {
        const slider = document.getElementById('borderRadiusSlider');
        slider.remove();
        const defaults = getDefaultUISettings(['main']);
        setUISettingsModalDependencies({
            State: { currentPreviewSettings: { ...defaults, borderRadius: 'x' } },
            DEFAULT_UI_SETTINGS: defaults,
            tabsConfig: [{ id: 'main', name: 'Главная' }],
            defaultPanelOrder: ['main'],
            defaultPanelVisibility: [true],
        });
        const s = getSettingsFromModal();
        expect(s.borderRadius).toBe(DEFAULT_BORDER_RADIUS_PX);
    });
});
