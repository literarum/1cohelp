import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerOnloadHandler, setOnloadHandlerDependencies } from './onload-handler.js';

afterEach(() => { window.onload = null; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('startup leaves automatically when initialization settles', () => {
    it('binds functional UI before releasing the overlay, without depending on a paint callback', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 9));
        document.body.innerHTML = '<div id="appContent"></div>';
        let finish;
        const bound = vi.fn();
        const hide = vi.fn(() => {
            expect(bound).toHaveBeenCalledTimes(1);
            return new Promise(resolve => { finish = resolve; });
        });
        setOnloadHandlerDependencies({ NotificationService: { init: vi.fn() },
            appInit: vi.fn().mockResolvedValue(true), initGoogleDocSections: vi.fn(),
            afterInitCallbacks: [bound], loadingOverlayManager: { overlayElement: {}, hideAndDestroy: hide } });
        registerOnloadHandler();
        const startup = window.onload();
        await vi.advanceTimersByTimeAsync(1);
        expect(hide).toHaveBeenCalledTimes(1);
        expect(bound).toHaveBeenCalledTimes(1);
        finish?.();
        await vi.advanceTimersByTimeAsync(250);
        await startup;
        vi.unstubAllGlobals();
    });
    it.each([true, false])('does not gate readiness=%s behind a click or a fixed animation delay', async ready => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="appContent" class="hidden"></div><div id="custom-loading-overlay"><div id="loadingText">Загрузка<span id="animated-dots"></span></div></div>';
        const hide = vi.fn().mockResolvedValue();
        const exit = vi.fn().mockResolvedValue();
        const google = vi.fn();
        const overlay = document.getElementById('custom-loading-overlay');
        setOnloadHandlerDependencies({ NotificationService: { init: vi.fn(), add: vi.fn() },
            loadingOverlayManager: { overlayElement: overlay, currentProgressValue: 100, hideAndDestroy: hide, runExitEffect: exit },
            appInit: vi.fn().mockResolvedValue(ready), initGoogleDocSections: google });
        registerOnloadHandler();
        const startup = window.onload();
        await vi.advanceTimersByTimeAsync(250);
        await startup;
        expect(hide).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();
        expect(document.getElementById('animated-dots')).not.toBeNull();
        expect(document.getElementById('loadingText').textContent).not.toMatch(/нажмите|готово/i);
        expect(google).toHaveBeenCalledTimes(1);
    });
});
