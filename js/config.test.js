'use strict';

import { describe, it, expect } from 'vitest';
import {
    getDefaultUISettings,
    clampBorderRadiusPx,
    DEFAULT_BORDER_RADIUS_PX,
    DEFAULT_BORDER_RADIUS_SLIDER_PERCENT,
    BORDER_RADIUS_SLIDER_MAX,
    tabsConfig,
} from './config.js';

/** Единая подпись раздела: панель вкладок, настройки UI и палитра команд должны совпадать. */
describe('tabsConfig display names', () => {
    it('program panel matches main tab label «Программа 1С/УП»', () => {
        const program = tabsConfig.find((t) => t.id === 'program');
        expect(program?.name).toBe('Программа 1С/УП');
    });
});

describe('config defaults', () => {
    it('default border radius is 25% of slider track (px)', () => {
        expect(DEFAULT_BORDER_RADIUS_PX).toBe(
            Math.round((BORDER_RADIUS_SLIDER_MAX * DEFAULT_BORDER_RADIUS_SLIDER_PERCENT) / 100),
        );
        const defaults = getDefaultUISettings(['main']);
        expect(defaults.borderRadius).toBe(DEFAULT_BORDER_RADIUS_PX);
    });

    it('clampBorderRadiusPx preserves 0 and clamps invalid', () => {
        expect(clampBorderRadiusPx(0)).toBe(0);
        expect(clampBorderRadiusPx('')).toBe(DEFAULT_BORDER_RADIUS_PX);
        expect(clampBorderRadiusPx(99)).toBe(BORDER_RADIUS_SLIDER_MAX);
    });

    it('disables birthday mode by default', () => {
        const defaults = getDefaultUISettings(['main', 'clientAnalytics', 'training']);
        expect(defaults.birthdayModeEnabled).toBe(false);
    });

    it('hides client analytics and training sections by default', () => {
        const panelIds = ['main', 'clientAnalytics', 'training', 'sedoTypes', 'blacklistedClients'];
        const defaults = getDefaultUISettings(panelIds);
        const visibilityById = defaults.panelOrder.reduce((acc, panelId, index) => {
            acc[panelId] = defaults.panelVisibility[index];
            return acc;
        }, {});

        expect(visibilityById.main).toBe(true);
        expect(visibilityById.clientAnalytics).toBe(false);
        expect(visibilityById.training).toBe(false);
        expect(visibilityById.sedoTypes).toBe(false);
        expect(visibilityById.blacklistedClients).toBe(false);
    });
});
