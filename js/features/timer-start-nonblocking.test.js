/**
 * @vitest-environment jsdom
 */
'use strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../services/notification.js';
import { initTimerSystem, toggleTimer } from './timer.js';

describe('timer: старт не блокируется уведомлениями', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="appTimer">
                <button type="button" id="timerToggleButton"><i class="fa-solid fa-play"></i></button>
                <button type="button" id="timerResetButton"><i class="fa-undo"></i></button>
                <button type="button" id="timerIncreaseButton">+</button>
                <button type="button" id="timerDecreaseButton">-</button>
                <div id="timerDisplay"></div>
            </div>
            <div id="timerReturnToClientModal" class="hidden"></div>
        `;
        vi.stubGlobal('requestAnimationFrame', () => 0);
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        let permResolve;
        const hanging = new Promise((resolve) => {
            permResolve = resolve;
        });
        globalThis.__timerTestPermResolve = permResolve;
        globalThis.Notification = class {
            static get permission() {
                return 'default';
            }
            static requestPermission() {
                return hanging;
            }
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        localStorage.clear();
        document.body.innerHTML = '';
        delete globalThis.__timerTestPermResolve;
    });

    it('отсчёт идёт, пока requestPermission ещё не вернул результат', async () => {
        vi.useFakeTimers();
        const addSpy = vi.spyOn(NotificationService, 'add').mockImplementation(() => {});

        initTimerSystem();
        const sec0 = document.getElementById('timerSecondsDisplay')?.textContent;

        const togglePromise = toggleTimer();
        await Promise.resolve();
        await Promise.resolve();
        expect(togglePromise).toBeInstanceOf(Promise);

        await vi.advanceTimersByTimeAsync(1000);
        const sec1 = document.getElementById('timerSecondsDisplay')?.textContent;

        expect(sec0).toBeTruthy();
        expect(sec1).toBeTruthy();
        expect(sec1).not.toBe(sec0);

        globalThis.__timerTestPermResolve?.('default');
        await vi.advanceTimersByTimeAsync(10);

        addSpy.mockRestore();
    });
});

describe('timer: при уже выданном разрешении на уведомления', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="appTimer">
                <button type="button" id="timerToggleButton"><i class="fa-solid fa-play"></i></button>
                <button type="button" id="timerResetButton"><i class="fa-undo"></i></button>
                <button type="button" id="timerIncreaseButton">+</button>
                <button type="button" id="timerDecreaseButton">-</button>
                <div id="timerDisplay"></div>
            </div>
            <div id="timerReturnToClientModal" class="hidden"></div>
        `;
        vi.stubGlobal('requestAnimationFrame', () => 0);
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        globalThis.Notification = class {
            static get permission() {
                return 'granted';
            }
            static requestPermission() {
                return Promise.resolve('granted');
            }
        };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
        document.body.innerHTML = '';
    });

    it('не показывает инфо-тост «уже разрешены» при каждом старте таймера', async () => {
        const addSpy = vi.spyOn(NotificationService, 'add').mockImplementation(() => {});

        initTimerSystem();
        await toggleTimer();
        await Promise.resolve();

        await toggleTimer();
        await toggleTimer();
        await Promise.resolve();

        const messages = addSpy.mock.calls.map((c) => String(c[0]));
        expect(messages.some((m) => m.includes('уже разрешены'))).toBe(false);

        addSpy.mockRestore();
    });
});
