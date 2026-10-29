import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('customization preview session and explicit persistence', () => {
    let State, studio, fonts, root, persisted, saveRecord, applyPreview, closeModal, background, persistedImage, deleteRecord;
    const settle = async () => {
        await Promise.resolve();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(40);
    };
    const change = (selector, value, type = 'input') => {
        const element = root.querySelector(selector);
        if (element.type === 'radio') element.checked = true;
        else element.value = value;
        element.dispatchEvent(new Event(type, { bubbles: true }));
    };
    const edit = async () => {
        studio.setAccent('#16a34a');
        change('#borderRadiusSlider', '17');
        change('input[name="themeMode"][value="light"]', '', 'change');
        change('input[name="motionMode"][value="reduce"]', '', 'change');
        change('[data-fs="ui"]', 'georgia');
        change('[data-fs="scale"]', '120');
        await settle();
    };

    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        localStorage.clear();
        document.documentElement.removeAttribute('style');
        document.documentElement.removeAttribute('class');
        document.body.className = '';
        document.body.innerHTML = `
          <div id="customizeUIModal"><button id="openAppCustomizationModalBtn"></button><input id="toggleStaticHeader" type="checkbox"></div>
          <div id="appCustomizationModal" class="hidden">
            <div data-ac-studio></div>
            <button id="closeAppCustomizationModalBtn"></button>
            <button id="appCustomizationSaveBtn"></button><button id="appCustomizationCancelBtn"></button>
            <span id="acStatus"><span class="ac-status-text"></span><i></i></span>
            <input id="borderRadiusSlider" type="range" min="0" max="20" value="5">
            <input id="densitySlider" type="range" min="0" max="6" value="3">
            <input type="radio" name="themeMode" value="dark" checked>
            <input type="radio" name="themeMode" value="light"><input type="radio" name="themeMode" value="auto">
            <input type="radio" name="motionMode" value="auto" checked>
            <input type="radio" name="motionMode" value="reduce">
            <div data-ac-mount="fonts"></div>
            <div data-ac-mount="profiles"></div>
            <button id="backgroundImageUploadBtn"></button><button id="backgroundImageRemoveBtn"></button>
            <input type="file" id="backgroundImageInput"><div id="backgroundImagePreview"></div><span id="backgroundImagePreviewText"></span>
          </div>`;
        window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
        for (const method of ['log', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {});
        ({ State } = await import('../app/state.js'));
        const { getDefaultUISettings } = await import('../config.js');
        State.userPreferences = { ...getDefaultUISettings(['main']), theme: 'dark', employeeExtension: '123' };
        State.currentPreviewSettings = structuredClone(State.userPreferences);
        State.originalUISettings = structuredClone(State.userPreferences);
        State.isUISettingsDirty = false;
        State.db = {};
        persisted = structuredClone(State.userPreferences);
        persistedImage = 'data:image/png;base64,b3JpZ2luYWw=';
        saveRecord = vi.fn(async (_store, record) => {
            if (record.id === 'customBackgroundImage') persistedImage = record.value;
            else persisted = structuredClone(record.data);
        });
        deleteRecord = vi.fn(async () => { persistedImage = null; });
        vi.doMock('../db/indexeddb.js', async importOriginal => ({ ...await importOriginal(), saveToIndexedDB: saveRecord }));
        vi.doMock('./app-confirm-modal.js', () => ({ showAppConfirm: vi.fn().mockResolvedValue(true) }));
        const prefs = await import('../app/user-preferences.js');
        prefs.setUserPreferencesDependencies({ State });
        const preview = await import('./preview-settings.js');
        const colors = await import('../utils/color.js');
        const { setTheme } = await import('../components/theme.js');
        preview.setPreviewSettingsDependencies({ DEFAULT_UI_SETTINGS: getDefaultUISettings(['main']), ...colors, setTheme });
        applyPreview = preview.applyPreviewSettings;
        await applyPreview(State.currentPreviewSettings);
        fonts = await import('./font-settings.js');
        fonts.saveFontSettings({ ...fonts.FONT_DEFAULTS });
        fonts.remountFontSettings();
        background = await import('../features/background-image.js');
        background.setBackgroundImageDependencies({ saveToIndexedDB: saveRecord, deleteFromIndexedDB: deleteRecord,
            showAppConfirm: vi.fn().mockResolvedValue(true), showNotification: vi.fn(), processImageFile: vi.fn().mockResolvedValue(new Blob(['image'])) });
        background.applyCustomBackgroundImage(persistedImage);
        background.setupBackgroundImageControls();
        (await import('./appearance-profile.js')).mountAppearanceProfileSection();
        const { initCustomizationStudio } = await import('./customization-studio.js');
        root = document.getElementById('appCustomizationModal');
        studio = initCustomizationStudio({ root });
        const handlers = await import('./ui-settings-modal-init.js');
        closeModal = vi.fn(modal => modal.classList.add('hidden'));
        handlers.setUISettingsModalInitDependencies({
            State, populateCustomizationModalControls: vi.fn(), initColorPicker: vi.fn(),
            closeAnimatedModal: closeModal, openAnimatedModal: vi.fn(), addEscapeHandler: vi.fn(),
        });
        handlers.initUISettingsModalHandlers();
        document.getElementById('openAppCustomizationModalBtn').click();
        await settle();
    });

    afterEach(async () => {
        studio?.destroy();
        vi.doUnmock('../db/indexeddb.js');
        vi.doUnmock('./app-confirm-modal.js');
        vi.unstubAllGlobals();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('previews colors, theme, motion and fonts without mutating durable preferences', async () => {
        const before = structuredClone(persisted);
        const fontRecord = localStorage.getItem(fonts.FONT_STORAGE_KEY);
        const mirrors = ['copilot.theme.hint', 'copilot.theme.resolved', 'copilot.loading-overlay.snapshot', 'copilot.motion.v1']
            .map(key => [key, localStorage.getItem(key)]);
        await edit();
        await vi.advanceTimersByTimeAsync(1000);
        expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#16a34a');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.dataset.motionMode).toBe('reduce');
        expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe('1.2');
        expect(saveRecord).not.toHaveBeenCalled();
        expect(persisted).toEqual(before);
        expect(State.userPreferences).toEqual(before);
        expect(localStorage.getItem(fonts.FONT_STORAGE_KEY)).toBe(fontRecord);
        for (const [key, value] of mirrors) expect(localStorage.getItem(key)).toBe(value);
    });

    it.each(['Cancel', 'X', 'external hidden close'])('rolls back %s without persisting and stays reverted after deferred frames', async route => {
        const before = structuredClone(State.currentPreviewSettings);
        await edit();
        if (route === 'Cancel') document.getElementById('appCustomizationCancelBtn').click();
        else if (route === 'X') document.getElementById('closeAppCustomizationModalBtn').click();
        else root.classList.add('hidden'); // Escape/central close ends in this shared lifecycle boundary.
        await settle();
        await vi.advanceTimersByTimeAsync(1000);
        expect(State.currentPreviewSettings.primaryColor).toBe(before.primaryColor);
        expect(State.currentPreviewSettings.theme).toBe(before.theme);
        expect(State.currentPreviewSettings.borderRadius).toBe(before.borderRadius);
        expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(before.primaryColor);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.dataset.motionMode).toBe('auto');
        expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe('1');
        expect(persisted.primaryColor).toBe(before.primaryColor);
        expect(persisted.theme).toBe(before.theme);
        expect(fonts.loadFontSettings().ui).toBe('default');
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it('backdrop policy keeps the draft open without saving; later X discards it', async () => {
        await edit();
        const { requestBackdropClose } = await import('./modal-choreographer.js');
        expect(requestBackdropClose(root, root)).toBe(false);
        expect(root.classList.contains('hidden')).toBe(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(saveRecord).not.toHaveBeenCalled();
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(State.currentPreviewSettings.primaryColor).toBe(persisted.primaryColor);
    });

    it('explicit Save retains appearance and fonts after close and reopen', async () => {
        await edit();
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(root.classList.contains('hidden')).toBe(true);
        expect(persisted.primaryColor).toBe('#16a34a');
        expect(persisted.theme).toBe('light');
        expect(persisted.employeeExtension).toBe('123');
        expect(fonts.loadFontSettings()).toMatchObject({ ui: 'georgia', scale: 120 });
        expect(localStorage.getItem('copilot.theme.hint')).toBe('light');
        document.getElementById('openAppCustomizationModalBtn').click();
        await settle();
        studio.setAccent('#112233');
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(State.currentPreviewSettings.primaryColor).toBe('#16a34a');
        expect(persisted.primaryColor).toBe('#16a34a');
        expect(fonts.loadFontSettings().ui).toBe('georgia');
    });

    it('failed Save keeps the editor open and original persisted settings intact', async () => {
        await edit();
        saveRecord.mockRejectedValueOnce(new Error('storage unavailable'));
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(root.classList.contains('hidden')).toBe(false);
        expect(persisted.primaryColor).not.toBe('#16a34a');
        expect(State.userPreferences.primaryColor).toBe(persisted.primaryColor);
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(State.currentPreviewSettings.primaryColor).toBe(persisted.primaryColor);
    });

    it('discard preserves settings that were already drafted in the parent modal', async () => {
        root.classList.add('hidden');
        await settle();
        State.currentPreviewSettings.contentDensity = 6;
        State.currentPreviewSettings.disableForcedBackupOnImport = true;
        State.isUISettingsDirty = true;
        document.getElementById('openAppCustomizationModalBtn').click();
        await settle();
        await edit();
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(State.currentPreviewSettings.contentDensity).toBe(6);
        expect(State.currentPreviewSettings.disableForcedBackupOnImport).toBe(true);
        expect(State.isUISettingsDirty).toBe(true);
        expect(persisted.contentDensity).toBe(3);
    });

    it('background removal is only a preview and Cancel restores the original asset', async () => {
        const image = persistedImage;
        root.querySelector('#backgroundImageRemoveBtn').click();
        await settle();
        expect(document.body.classList.contains('custom-bg-image-active')).toBe(false);
        expect(deleteRecord).not.toHaveBeenCalled();
        expect(persistedImage).toBe(image);
        document.getElementById('appCustomizationCancelBtn').click();
        await settle();
        expect(document.body.classList.contains('custom-bg-image-active')).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--custom-background-image')).toContain(image);
        expect(persistedImage).toBe(image);
    });

    it('background upload previews locally, X discards, and explicit Save writes the new asset', async () => {
        const image = persistedImage;
        vi.stubGlobal('FileReader', class {
            readAsDataURL() { this.result = 'data:image/png;base64,bmV3'; void this.onloadend(); }
        });
        const upload = async () => {
            const input = root.querySelector('#backgroundImageInput');
            Object.defineProperty(input, 'files', { configurable: true, value: [new File(['image'], 'image.png')] });
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await settle();
        };
        await upload();
        expect(document.documentElement.style.getPropertyValue('--custom-background-image')).toContain('bmV3');
        expect(saveRecord).not.toHaveBeenCalled();
        expect(persistedImage).toBe(image);
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(document.documentElement.style.getPropertyValue('--custom-background-image')).toContain(image);
        document.getElementById('openAppCustomizationModalBtn').click();
        await settle();
        await upload();
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(persistedImage).toBe('data:image/png;base64,bmV3');
        expect(root.classList.contains('hidden')).toBe(true);
    });

    it('imported profile previews without save/reload and X restores appearance and fonts', async () => {
        const before = structuredClone(State.currentPreviewSettings);
        const input = root.querySelector('[data-ap-file]');
        const profile = { format: 'copilot-appearance', version: 1,
            appearance: { theme: 'light', primaryColor: '#123456', staticHeader: true }, fonts: { ui: 'georgia', scale: 120 } };
        Object.defineProperty(input, 'files', { configurable: true,
            value: [{ size: 300, text: async () => JSON.stringify(profile) }] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(State.currentPreviewSettings.primaryColor).toBe('#123456');
        expect(State.currentPreviewSettings.staticHeader).toBe(true);
        expect(saveRecord).not.toHaveBeenCalled();
        expect(persisted.primaryColor).toBe(before.primaryColor);
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(State.currentPreviewSettings.primaryColor).toBe(before.primaryColor);
        expect(State.currentPreviewSettings.staticHeader).toBe(before.staticHeader);
        expect(fonts.loadFontSettings().ui).toBe('default');
    });

    it('profile full reset remains a preview until Save', async () => {
        await edit();
        root.querySelector('[data-ap="reset"]').click();
        await settle();
        expect(saveRecord).not.toHaveBeenCalled();
        expect(State.currentPreviewSettings.primaryColor).toBe(persisted.primaryColor);
        expect(State.currentPreviewSettings.theme).toBe('dark');
        expect(fonts.loadFontSettings().ui).toBe('default');
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(root.classList.contains('hidden')).toBe(true);
        expect(persisted.primaryColor).toBe(State.currentPreviewSettings.primaryColor);
    });

    it('font-only Save persists fonts even when appearance keys are unchanged', async () => {
        change('[data-fs="ui"]', 'georgia');
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(root.classList.contains('hidden')).toBe(true);
        expect(JSON.parse(localStorage.getItem(fonts.FONT_STORAGE_KEY)).ui).toBe('georgia');
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it('background removal is persisted only by Save', async () => {
        root.querySelector('#backgroundImageRemoveBtn').click();
        await settle();
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(persistedImage).toBeNull();
        expect(deleteRecord).toHaveBeenCalledTimes(1);
        expect(document.body.classList.contains('custom-bg-image-active')).toBe(false);
    });

    it.each(['Cancel', 'X'])('ignores an image read that finishes after %s', async route => {
        let finishRead;
        const image = persistedImage;
        vi.stubGlobal('FileReader', class {
            readAsDataURL() { this.result = 'data:image/png;base64,bGF0ZQ=='; finishRead = () => this.onloadend(); }
        });
        const input = root.querySelector('#backgroundImageInput');
        Object.defineProperty(input, 'files', { configurable: true, value: [new File(['image'], 'image.png')] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        document.getElementById(route === 'Cancel' ? 'appCustomizationCancelBtn' : 'closeAppCustomizationModalBtn').click();
        await settle();
        await finishRead();
        await settle();
        expect(document.documentElement.style.getPropertyValue('--custom-background-image')).toContain(image);
        expect(persistedImage).toBe(image);
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it('failed background persistence restores earlier preference writes and leaves the draft open', async () => {
        await edit();
        root.querySelector('#backgroundImageRemoveBtn').click();
        await settle();
        deleteRecord.mockRejectedValueOnce(new Error('image storage unavailable'));
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(root.classList.contains('hidden')).toBe(false);
        expect(persisted.primaryColor).not.toBe('#16a34a');
        expect(State.userPreferences.primaryColor).toBe(persisted.primaryColor);
        expect(JSON.parse(localStorage.getItem(fonts.FONT_STORAGE_KEY)).ui).toBe('default');
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        expect(document.body.classList.contains('custom-bg-image-active')).toBe(true);
    });

    it('an imported profile can be saved, including its static header setting', async () => {
        const input = root.querySelector('[data-ap-file]');
        const profile = { format: 'copilot-appearance', version: 1,
            appearance: { theme: 'light', primaryColor: '#123456', staticHeader: true }, fonts: { ui: 'georgia' } };
        Object.defineProperty(input, 'files', { configurable: true,
            value: [{ size: 300, text: async () => JSON.stringify(profile) }] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(persisted).toMatchObject({ theme: 'light', primaryColor: '#123456', staticHeader: true });
        expect(document.getElementById('toggleStaticHeader').checked).toBe(true);
        expect(JSON.parse(localStorage.getItem(fonts.FONT_STORAGE_KEY)).ui).toBe('georgia');
    });

    it('a profile read finishing after Cancel cannot reapply discarded changes', async () => {
        let finishRead;
        const input = root.querySelector('[data-ap-file]');
        Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 200,
            text: () => new Promise(resolve => { finishRead = () => resolve(JSON.stringify({ format: 'copilot-appearance', version: 1, appearance: { primaryColor: '#123456' } })); }) }] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        document.getElementById('appCustomizationCancelBtn').click();
        await settle();
        finishRead();
        await settle();
        expect(State.currentPreviewSettings.primaryColor).toBe(persisted.primaryColor);
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it('discard settles a queued preview promise without applying its stale frame', async () => {
        const preview = await import('./preview-settings.js');
        let settled = false;
        preview.applyPreviewSettingsCoalesced({ ...State.currentPreviewSettings, primaryColor: '#123456' })
            .then(() => { settled = true; });
        await studio.discard();
        await settle();
        expect(settled).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(persisted.primaryColor);
    });

    it('font preview is labelled unsaved', () => {
        change('[data-fs="ui"]', 'georgia');
        expect(document.getElementById('acStatus').dataset.state).toBe('pending');
    });

    it('Escape through the production hotkey handler discards the preview', async () => {
        await edit();
        const hotkeys = await import('./hotkeys-handler.js');
        hotkeys.setHotkeysDependencies({ State,
            getVisibleModals: () => root.classList.contains('hidden') ? [] : [root],
            getTopmostModal: modals => modals[0], requestCloseModal: () => true,
            closeSettingsStackModal: closeModal,
        });
        await hotkeys.handleGlobalHotkey(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
        await settle();
        expect(root.classList.contains('hidden')).toBe(true);
        expect(State.currentPreviewSettings.primaryColor).toBe(persisted.primaryColor);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(fonts.loadFontSettings().ui).toBe('default');
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it('font-storage failure rolls back preference and image writes; status itself never saves', async () => {
        await edit();
        const image = persistedImage;
        root.querySelector('#backgroundImageRemoveBtn').click();
        await settle();
        const setItem = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (key === fonts.FONT_STORAGE_KEY) throw new Error('font storage unavailable');
            return setItem.call(this, key, value);
        });
        document.getElementById('appCustomizationSaveBtn').click();
        await settle();
        expect(root.classList.contains('hidden')).toBe(false);
        expect(persisted.primaryColor).not.toBe('#16a34a');
        expect(persistedImage).toBe(image);
        expect(JSON.parse(localStorage.getItem(fonts.FONT_STORAGE_KEY)).ui).toBe('default');
        expect(document.getElementById('acStatus').dataset.state).toBe('error');
        saveRecord.mockClear();
        document.getElementById('acStatus').click();
        await settle();
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it.each(['Cancel', 'X'])('restores normal auto-theme mirroring after %s discards preview', async route => {
        document.getElementById('closeAppCustomizationModalBtn').click();
        await settle();
        State.userPreferences.theme = 'auto';
        State.currentPreviewSettings.theme = 'auto';
        await applyPreview(State.currentPreviewSettings);
        await settle();
        expect(localStorage.getItem('copilot.theme.resolved')).toBe('light');
        document.getElementById('openAppCustomizationModalBtn').click();
        await settle();
        change('input[name="themeMode"][value="light"]', '', 'change');
        await settle();
        document.getElementById(route === 'Cancel' ? 'appCustomizationCancelBtn' : 'closeAppCustomizationModalBtn').click();
        await settle();
        const { setTheme } = await import('../components/theme.js');
        expect(typeof setTheme._onChange).toBe('function');
        setTheme._onChange({ matches: true });
        await settle();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.getItem('copilot.theme.resolved')).toBe('dark');
    });
});
