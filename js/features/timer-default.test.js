/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { TIMER_STATE_KEY } from '../constants.js';
import { loadTimerState, saveTimerState } from './timer.js';

const saved = () => JSON.parse(localStorage.getItem(TIMER_STATE_KEY));

describe('таймер при запуске — 01:50', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="timerDisplay"></div>';
    });

    it('изменённая кнопками длительность не переживает перезапуск', () => {
        localStorage.setItem(
            TIMER_STATE_KEY,
            JSON.stringify({ timerCurrentSetDuration: 300, isTimerRunning: false, timeLeftVisualOnPause: 300 }),
        );
        loadTimerState();
        saveTimerState();
        expect(saved().timerCurrentSetDuration).toBe(110);
        expect(saved().timeLeftVisualOnPause).toBe(110);
    });

    it('пауза посреди отсчёта сохраняется, длительность для сброса — 01:50', () => {
        localStorage.setItem(
            TIMER_STATE_KEY,
            JSON.stringify({ timerCurrentSetDuration: 300, isTimerRunning: false, timeLeftVisualOnPause: 95 }),
        );
        loadTimerState();
        saveTimerState();
        expect(saved().timeLeftVisualOnPause).toBe(95);
        expect(saved().timerCurrentSetDuration).toBe(110);
    });
});
