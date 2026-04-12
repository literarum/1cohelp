'use strict';

import { describe, it, expect } from 'vitest';
import { getDefaultUISettings } from './config.js';

describe('config defaults', () => {
    it('enables birthday mode by default', () => {
        const defaults = getDefaultUISettings(['main', 'clientAnalytics', 'training']);
        expect(defaults.birthdayModeEnabled).toBe(true);
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
