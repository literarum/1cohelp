'use strict';

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import {
    shouldDeferToNativeContextMenu,
    clampMenuPosition,
    buildMenuItemDescriptors,
} from './global-context-menu-shared.js';

describe('global-context-menu', () => {
    it('shouldDeferToNativeContextMenu: Shift+ПКМ → нативное меню', () => {
        const ev = { shiftKey: true };
        const span = document.createElement('span');
        expect(shouldDeferToNativeContextMenu(ev, span)).toBe(true);
    });

    it('shouldDeferToNativeContextMenu: data-allow-native-contextmenu', () => {
        const ev = { shiftKey: false };
        const wrap = document.createElement('div');
        wrap.innerHTML = '<span data-allow-native-contextmenu="true"><b></b></span>';
        const inner = wrap.querySelector('b');
        expect(shouldDeferToNativeContextMenu(ev, inner)).toBe(true);
    });

    it('shouldDeferToNativeContextMenu: INPUT/TEXTAREA/SELECT', () => {
        const ev = { shiftKey: false };
        expect(shouldDeferToNativeContextMenu(ev, document.createElement('input'))).toBe(true);
        expect(shouldDeferToNativeContextMenu(ev, document.createElement('textarea'))).toBe(
            true,
        );
        expect(shouldDeferToNativeContextMenu(ev, document.createElement('select'))).toBe(true);
    });

    it('shouldDeferToNativeContextMenu: обычная область → кастомное меню', () => {
        const ev = { shiftKey: false };
        const el = document.createElement('div');
        expect(shouldDeferToNativeContextMenu(ev, el)).toBe(false);
    });

    it('clampMenuPosition: удерживает меню внутри вьюпорта', () => {
        expect(clampMenuPosition(10, 10, 200, 300, 800, 600)).toEqual({ left: 10, top: 10 });
        expect(clampMenuPosition(900, 700, 200, 300, 800, 600)).toEqual({ left: 592, top: 292 });
    });

    it('buildMenuItemDescriptors: подписи таймера и вида', () => {
        const d = buildMenuItemDescriptors({
            timerRunning: true,
            viewToggle: { disabled: false, label: 'Отобразить списком' },
        });
        const items = d.filter((x) => x.type === 'item');
        const ids = items.map((x) => x.id);
        expect(ids).toContain('timer-toggle');
        expect(ids).toContain('view-toggle');
        const timer = items.find((x) => x.id === 'timer-toggle');
        expect(timer.label).toMatch(/Остановить/i);
        const view = items.find((x) => x.id === 'view-toggle');
        expect(view.label).toBe('Отобразить списком');
    });

    it('buildMenuItemDescriptors: второй пункт — «Избранное»', () => {
        const d = buildMenuItemDescriptors({
            timerRunning: false,
            viewToggle: { disabled: false, label: 'Отобразить списком' },
        });
        const items = d.filter((x) => x.type === 'item');
        expect(items[1].id).toBe('favorites');
        expect(items[1].label).toBe('Избранное');
    });

    it('buildMenuItemDescriptors: на главной пункт «Вид» скрыт (hiddenInMenu)', () => {
        const d = buildMenuItemDescriptors({
            timerRunning: false,
            viewToggle: {
                disabled: true,
                label: 'Вид: недоступно на главной',
                hiddenInMenu: true,
            },
        });
        const ids = d.filter((x) => x.type === 'item').map((x) => x.id);
        expect(ids).not.toContain('view-toggle');
    });
});
