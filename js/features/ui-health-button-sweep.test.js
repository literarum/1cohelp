/** @vitest-environment jsdom */
'use strict';

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
    computeAccessibleName,
    isHealthAutoclickDeniedByPattern,
    runFullButtonHealthSweep,
    HEALTH_BUTTON_SWEEP_TAB_IDS,
} from './ui-health-button-sweep.js';

describe('ui-health-button-sweep', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('isHealthAutoclickDeniedByPattern отсекает вкладки и опасные префиксы', () => {
        expect(isHealthAutoclickDeniedByPattern('mainTab')).toBe(true);
        expect(isHealthAutoclickDeniedByPattern('exportDataBtn')).toBe(true);
        expect(isHealthAutoclickDeniedByPattern('runManualHealthCheckBtn')).toBe(true);
        expect(isHealthAutoclickDeniedByPattern('themeToggle')).toBe(false);
    });

    it('computeAccessibleName использует aria-label', () => {
        document.body.innerHTML = '<button type="button" id="x" aria-label="Тест"></button>';
        const el = document.getElementById('x');
        expect(computeAccessibleName(el)).toBe('Тест');
    });

    it('обход вызывает setActiveTab и восстанавливает вкладку', async () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <div id="staticHeaderWrapper"><button type="button" id="themeToggle" aria-label="Тема">T</button></div>
            <div id="mainContent" class="tab-content"><button type="button" id="safeUiBtn" aria-label="OK">ok</button></div>
        </div>`;
        const calls = [];
        const setActiveTab = vi.fn(async (tabId) => {
            calls.push(tabId);
        });
        const report = vi.fn();
        await runFullButtonHealthSweep({ setActiveTab, State: { currentSection: 'main' } }, report, (p) => p);
        expect(setActiveTab).toHaveBeenCalled();
        expect(calls[calls.length - 1]).toBe('main');
        expect(HEALTH_BUTTON_SWEEP_TAB_IDS.length).toBeGreaterThan(10);
    });

    it('режим background не вызывает setActiveTab', async () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <div id="staticHeaderWrapper"><button type="button" id="themeToggle" aria-label="Тема">T</button></div>
            <div id="mainContent" class="tab-content"><button type="button" id="onlyMain" aria-label="M">m</button></div>
        </div>`;
        const setActiveTab = vi.fn(async () => {});
        const report = vi.fn();
        await runFullButtonHealthSweep(
            { setActiveTab, State: { currentSection: 'main' } },
            report,
            (p) => p,
            { syntheticClicks: false, tabSweepMode: 'background' },
        );
        expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('при syntheticClicks: false не вызывает HTMLElement.click()', async () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <div id="staticHeaderWrapper"><button type="button" id="themeToggle" aria-label="Тема">T</button></div>
            <div id="mainContent" class="tab-content"></div>
        </div>`;
        const clickSpy = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
        const setActiveTab = vi.fn(async () => {});
        const report = vi.fn();
        await runFullButtonHealthSweep(
            { setActiveTab, State: { currentSection: 'main' } },
            report,
            (p) => p,
            { syntheticClicks: false },
        );
        expect(clickSpy).not.toHaveBeenCalled();
        clickSpy.mockRestore();
    });

    it('без options не вызывает программный click (дефолт — только явный syntheticClicks: true)', async () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <div id="staticHeaderWrapper"><button type="button" id="themeToggle" aria-label="Тема">T</button></div>
            <div id="mainContent" class="tab-content"></div>
        </div>`;
        const clickSpy = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
        const setActiveTab = vi.fn(async () => {});
        const report = vi.fn();
        await runFullButtonHealthSweep({ setActiveTab, State: { currentSection: 'main' } }, report, (p) => p);
        expect(clickSpy).not.toHaveBeenCalled();
        clickSpy.mockRestore();
    });
});
