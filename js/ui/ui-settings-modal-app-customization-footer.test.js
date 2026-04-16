/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDefaultUISettings } from '../config.js';
import {
    initUISettingsModalHandlers,
    setUISettingsModalInitDependencies,
} from './ui-settings-modal-init.js';

describe('app customization modal footer (save / cancel / close)', () => {
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

    it('Сохранить: синхронизация превью, saveUISettings и анимированное закрытие', async () => {
        document.getElementById('appCustomizationSaveBtn').click();
        expect(updatePreviewSpy).toHaveBeenCalled();
        await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled());
        expect(closeAnimatedSpy).toHaveBeenCalledWith(
            document.getElementById('appCustomizationModal'),
        );
    });

    it('Крестик при несохранённых изменениях: диалог, откат и закрытие', async () => {
        testState.isUISettingsDirty = true;
        document.getElementById('closeAppCustomizationModalBtn').click();
        await vi.waitFor(() => expect(showUnsavedSpy).toHaveBeenCalled());
        await vi.waitFor(() => expect(revertSpy).toHaveBeenCalled());
        await vi.waitFor(() => expect(closeAnimatedSpy).toHaveBeenCalled());
    });

    it('Отмена при несохранённых изменениях — тот же контур, что и крестик', async () => {
        testState.isUISettingsDirty = true;
        showUnsavedSpy.mockClear();
        revertSpy.mockClear();
        closeAnimatedSpy.mockClear();
        document.getElementById('appCustomizationCancelBtn').click();
        await vi.waitFor(() => expect(showUnsavedSpy).toHaveBeenCalled());
        await vi.waitFor(() => expect(revertSpy).toHaveBeenCalled());
        await vi.waitFor(() => expect(closeAnimatedSpy).toHaveBeenCalled());
    });
});
