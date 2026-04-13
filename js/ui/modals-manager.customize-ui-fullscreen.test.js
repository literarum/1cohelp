/**
 * @vitest-environment jsdom
 */
'use strict';

import { describe, it, expect, beforeEach } from 'vitest';
import { toggleModalFullscreen, ensureFullscreenToggleForConfig } from './modals-manager.js';
import { customizeUIModalConfig } from '../config.js';

describe('toggleModalFullscreen + customizeUIModalConfig', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="customizeUIModal" class="fixed inset-0 p-4 overflow-y-auto flex items-center justify-center">
                <div id="customizeUIModalShell" class="flex items-center justify-center min-h-full w-full">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-screen flex flex-col modal-inner-container overflow-hidden">
                        <div class="p-content border-b">H</div>
                        <div class="p-content overflow-y-auto flex-1">C</div>
                    </div>
                </div>
                <button type="button" id="toggleFullscreenCustomizeUIBtn" title="Развернуть">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
        `;
    });

    it('сохраняет bg-white / dark:bg-gray-800 панели при fullscreen (без «прозрачной» карточки)', () => {
        const panel = document.querySelector('#customizeUIModal .modal-inner-container');
        expect(panel.classList.contains('bg-white')).toBe(true);
        expect(panel.classList.contains('dark:bg-gray-800')).toBe(true);

        toggleModalFullscreen(
            customizeUIModalConfig.modalId,
            customizeUIModalConfig.buttonId,
            customizeUIModalConfig.classToggleConfig,
            customizeUIModalConfig.innerContainerSelector,
            customizeUIModalConfig.contentAreaSelector,
        );

        expect(document.getElementById('customizeUIModal').classList.contains('is-fullscreen')).toBe(
            true,
        );
        expect(panel.classList.contains('bg-white')).toBe(true);
        expect(panel.classList.contains('dark:bg-gray-800')).toBe(true);

        toggleModalFullscreen(
            customizeUIModalConfig.modalId,
            customizeUIModalConfig.buttonId,
            customizeUIModalConfig.classToggleConfig,
            customizeUIModalConfig.innerContainerSelector,
            customizeUIModalConfig.contentAreaSelector,
        );

        expect(document.getElementById('customizeUIModal').classList.contains('is-fullscreen')).toBe(
            false,
        );
    });

    it('ensureFullscreenToggleForConfig привязывает клик по кнопке', () => {
        const modal = document.getElementById('customizeUIModal');
        const btn = document.getElementById('toggleFullscreenCustomizeUIBtn');
        ensureFullscreenToggleForConfig(customizeUIModalConfig);
        btn.click();
        expect(modal.classList.contains('is-fullscreen')).toBe(true);
    });
});
