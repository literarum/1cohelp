'use strict';

/**
 * Резервный контур: критичные подсистемы самодиагностики импортируются и экспортируют ожидаемые точки входа.
 */
import { describe, it, expect } from 'vitest';
import {
    runUiSurfaceHealthSuite,
    waitForUiSurfaceDomProbeReady,
    runWatchdogLightUiSurfaceCheck,
} from './ui-surface-health-suite.js';
import {
    resolveMonitoredDomIds,
    probeVisibleInteractiveLayout,
} from './ui-health-surface-registry.js';
import { runFullButtonHealthSweep } from './ui-health-button-sweep.js';

describe('health subsystem exports (двойная готовность API)', () => {
    it('surface suite entrypoints', () => {
        expect(typeof runUiSurfaceHealthSuite).toBe('function');
        expect(typeof waitForUiSurfaceDomProbeReady).toBe('function');
        expect(typeof runWatchdogLightUiSurfaceCheck).toBe('function');
    });

    it('registry + button sweep entrypoints', () => {
        expect(typeof resolveMonitoredDomIds).toBe('function');
        expect(typeof probeVisibleInteractiveLayout).toBe('function');
        expect(typeof runFullButtonHealthSweep).toBe('function');
    });
});
