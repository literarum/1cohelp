/**
 * @vitest-environment jsdom
 */
'use strict';

import { describe, it, expect, beforeEach } from 'vitest';
import { toggleModalFullscreen, ensureFullscreenToggleForConfig } from './modals-manager.js';
import { appCustomizationModalConfig } from '../config.js';

describe('toggleModalFullscreen + appCustomizationModalConfig', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="appCustomizationModal" class="app-customization-overlay p-2 flex items-center justify-center">
                <div id="appCustomizationModalShell" class="flex min-h-full w-full">
                    <div class="app-customization-panel bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 max-w-4xl w-full flex flex-col overflow-hidden modal-inner-container">
                        <div class="app-customization-header">H</div>
                        <div class="p-content overflow-y-auto flex-1 app-customization-scroll">C</div>
                    </div>
                </div>
                <button type="button" id="toggleFullscreenAppCustomizationBtn" title="Развернуть">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
        `;
    });

    it('после разворота панель сохраняет bg-white и dark:bg-gray-800 (регрессия «прозрачного» fullscreen)', () => {
        const panel = document.querySelector('#appCustomizationModal .app-customization-panel');
        expect(panel.classList.contains('bg-white')).toBe(true);
        expect(panel.classList.contains('dark:bg-gray-800')).toBe(true);

        toggleModalFullscreen(
            appCustomizationModalConfig.modalId,
            appCustomizationModalConfig.buttonId,
            appCustomizationModalConfig.classToggleConfig,
            appCustomizationModalConfig.innerContainerSelector,
            appCustomizationModalConfig.contentAreaSelector,
        );

        expect(
            document.getElementById('appCustomizationModal').classList.contains('is-fullscreen'),
        ).toBe(true);
        expect(panel.classList.contains('bg-white')).toBe(true);
        expect(panel.classList.contains('dark:bg-gray-800')).toBe(true);

        toggleModalFullscreen(
            appCustomizationModalConfig.modalId,
            appCustomizationModalConfig.buttonId,
            appCustomizationModalConfig.classToggleConfig,
            appCustomizationModalConfig.innerContainerSelector,
            appCustomizationModalConfig.contentAreaSelector,
        );

        expect(
            document.getElementById('appCustomizationModal').classList.contains('is-fullscreen'),
        ).toBe(false);
        expect(panel.classList.contains('bg-white')).toBe(true);
        expect(panel.classList.contains('dark:bg-gray-800')).toBe(true);
    });

    it('ensureFullscreenToggleForConfig привязывает клик (резерв, если initFullscreenToggles не нашёл кнопку)', () => {
        const modal = document.getElementById('appCustomizationModal');
        const btn = document.getElementById('toggleFullscreenAppCustomizationBtn');
        expect(modal.classList.contains('is-fullscreen')).toBe(false);

        ensureFullscreenToggleForConfig(appCustomizationModalConfig);
        btn.click();

        expect(modal.classList.contains('is-fullscreen')).toBe(true);
    });
});
