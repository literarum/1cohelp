/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initBackgroundStatusHUD, BG_HUD_MAIN_HEADINGS } from './background-status-hud.js';

describe('background-status-hud', () => {
    let hud;

    beforeEach(() => {
        document.body.innerHTML = '';
        const old = document.getElementById('bg-status-hud-styles');
        if (old) old.remove();
        hud = initBackgroundStatusHUD();
    });

    afterEach(() => {
        document.getElementById('bg-status-hud')?.remove();
        document.getElementById('bg-status-hud-styles')?.remove();
    });

    it('BG_HUD_MAIN_HEADINGS.initComplete — ожидаемая подпись после инициализации', () => {
        expect(BG_HUD_MAIN_HEADINGS.initComplete).toBe('Инициализация завершена');
        expect(BG_HUD_MAIN_HEADINGS.initializing).toBe('Фоновая инициализация...');
        expect(BG_HUD_MAIN_HEADINGS.problems).toBe('Обнаружены проблемы');
    });

    it('после завершения задач заголовок main heading — Инициализация завершена', () => {
        hud.startTask('t1', 'Test', { total: 1 });
        hud.updateTask('t1', 1, 1);
        hud.finishTask('t1', true);
        const el = document.getElementById('bg-hud-main-heading');
        expect(el).toBeTruthy();
        expect(el.textContent).toBe(BG_HUD_MAIN_HEADINGS.initComplete);
    });

    it('инжектированные стили задают расширенную ширину HUD', () => {
        hud.startTask('t1', 'Test', { total: 1 });
        const root = document.getElementById('bg-status-hud');
        expect(root).toBeTruthy();
        const sheet = document.getElementById('bg-status-hud-styles');
        expect(sheet?.textContent).toMatch(/min\(440px/);
    });

    it('при неуспешном app-init заголовок — «Обнаружены проблемы», а не «Инициализация завершена»', () => {
        hud.startTask('app-init', 'App', { total: 100 });
        hud.finishTask('app-init', false);
        const el = document.getElementById('bg-hud-main-heading');
        expect(el?.textContent).toBe(BG_HUD_MAIN_HEADINGS.problems);
    });

    it('при ошибках инициализации не показывает OK и «Система в норме» после watchdog ok', () => {
        hud.startTask('app-init', 'App', { total: 1 });
        hud.finishTask('app-init', false);
        hud.setWatchdogStatus({
            severity: 'ok',
            statusText: 'Система в норме',
            running: false,
            lastRunAt: Date.now(),
        });
        const info = document.getElementById('bg-hud-watchdog-info');
        expect(info).toBeTruthy();
        expect(info.textContent).not.toContain('Система в норме');
        expect(info.textContent).toMatch(/ERROR/);
        expect(info.textContent).toContain('Инициализация завершена с ошибками');
    });

    it('при ошибках диагностики (без сбоя app-init) не показывает OK и «Система в норме», если watchdog ещё ok', () => {
        hud.startTask('app-init', 'App', { total: 1 });
        hud.finishTask('app-init', true);
        hud.setWatchdogStatus({
            severity: 'ok',
            statusText: 'Система в норме',
            running: false,
            lastRunAt: Date.now(),
        });
        hud.setDiagnostics({
            errors: [
                {
                    title: 'Поверхность UI / DOM',
                    message: 'Отсутствуют 1 элемент(ов): noInnLink',
                    system: 'ui_surface',
                },
            ],
            warnings: [],
            checks: [],
            updatedAt: 'test',
        });
        const info = document.getElementById('bg-hud-watchdog-info');
        expect(info).toBeTruthy();
        expect(info.textContent).not.toContain('Система в норме');
        expect(info.textContent).toMatch(/ERROR/);
        expect(info.textContent).toContain('Обнаружены ошибки самотестирования');
    });
});
