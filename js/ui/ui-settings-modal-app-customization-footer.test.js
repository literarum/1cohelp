/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDefaultUISettings } from '../config.js';
import {
    initUISettingsModalHandlers,
    setUISettingsModalInitDependencies,
} from './ui-settings-modal-init.js';

describe('app customization modal footer (готово / крестик)', () => {
    let saveSpy;
    let updatePreviewSpy;
    let closeAnimatedSpy;
    let showUnsavedSpy;
    let revertSpy;
    let testState;

    beforeEach(() => {
        document.documentElement.innerHTML = `<body>
<div id="customizeUIModal">
  <button type="button" id="saveUISettingsBtn"></button>
  <button type="button" id="cancelUISettingsBtn"></button>
  <span id="fontSizeLabel">100%</span>
  <div id="panelSortContainer"></div>
  <button type="button" id="openAppCustomizationModalBtn"></button>
</div>
<div id="appCustomizationModal" class="hidden">
  <button type="button" id="closeAppCustomizationModalBtn"></button>
  <button type="button" id="appCustomizationSaveBtn"></button>
  <button type="button" id="appCustomizationCancelBtn"></button>
  <input type="range" id="densitySlider" min="1" max="6" value="3" />
  <input type="range" id="borderRadiusSlider" min="0" max="20" value="8" />
  <input type="radio" name="themeMode" value="dark" checked />
</div>
</body>`;

        const defaults = getDefaultUISettings(['main']);
        testState = {
            isUISettingsDirty: false,
            currentPreviewSettings: { ...defaults, contentDensity: 3, borderRadius: 8 },
            userPreferences: { ...defaults },
            originalUISettings: { ...defaults },
        };

        saveSpy = vi.fn().mockResolvedValue(true);
        updatePreviewSpy = vi.fn();
        closeAnimatedSpy = vi.fn();
        showUnsavedSpy = vi.fn().mockResolvedValue(true);
        revertSpy = vi.fn().mockResolvedValue(undefined);

        setUISettingsModalInitDependencies({
            State: testState,
            loadUISettings: vi.fn(),
            populateModalControls: vi.fn(),
            populateCustomizationModalControls: vi.fn(),
            setColorPickerStateFromHex: vi.fn(),
            addEscapeHandler: vi.fn(),
            openAnimatedModal: vi.fn(),
            closeAnimatedModal: closeAnimatedSpy,
            saveUISettings: saveSpy,
            resetUISettingsInModal: vi.fn(),
            revertUISettingsOnDiscard: revertSpy,
            updatePreviewSettingsFromModal: updatePreviewSpy,
            applyPreviewSettings: vi.fn(),
            initColorPicker: vi.fn(),
            refreshCustomizationPickerAfterThemeChange: vi.fn(),
            showUnsavedConfirmModal: showUnsavedSpy,
            shouldConfirmBeforeClose: vi.fn((modal) =>
                Boolean(modal?.id === 'appCustomizationModal' && testState.isUISettingsDirty),
            ),
            setupExtensionFieldListeners: vi.fn(),
            loadEmployeeExtension: vi.fn(),
            showAppConfirm: vi.fn(),
            openRecentlyDeletedModal: vi.fn(),
            startOnboardingTour: vi.fn(),
        });

        const cu = document.getElementById('customizeUIModal');
        delete cu.dataset.settingsInnerListenersAttached;
        const openBtn = document.getElementById('openAppCustomizationModalBtn');
        openBtn.removeAttribute('data-customization-listener-attached');

        initUISettingsModalHandlers();
    });

    const settle = () => new Promise((r) => setTimeout(r, 60));

    afterEach(() => {
        delete window.__copilotCustomizationStudio;
    });

    it('«Готово»: досохраняет хвост через студию и закрывает окно без вопросов', async () => {
        const persistNow = vi.fn().mockResolvedValue(true);
        window.__copilotCustomizationStudio = { persistNow };
        testState.isUISettingsDirty = true;
        document.getElementById('appCustomizationSaveBtn').click();
        await vi.waitFor(() => expect(persistNow).toHaveBeenCalled());
        await vi.waitFor(() =>
            expect(closeAnimatedSpy).toHaveBeenCalledWith(
                document.getElementById('appCustomizationModal'),
            ),
        );
        expect(showUnsavedSpy).not.toHaveBeenCalled();
        expect(revertSpy).not.toHaveBeenCalled();
    });

    it('Крестик: автосохранённое не откатывается, диалога нет', async () => {
        const persistNow = vi.fn().mockResolvedValue(true);
        window.__copilotCustomizationStudio = { persistNow };
        testState.isUISettingsDirty = true;
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(closeAnimatedSpy).toHaveBeenCalled();
        expect(persistNow).toHaveBeenCalled();
        expect(showUnsavedSpy).not.toHaveBeenCalled();
        expect(revertSpy).not.toHaveBeenCalled();
    });

    it('Окно закрывается, даже если студия не загружена или досохранение упало', async () => {
        window.__copilotCustomizationStudio = {
            persistNow: vi.fn().mockRejectedValue(new Error('boom')),
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(closeAnimatedSpy).toHaveBeenCalled();
        warn.mockRestore();
    });
});
