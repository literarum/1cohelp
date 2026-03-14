'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    registerCoreServices,
    getCoreService,
    notify,
    resetCoreServices,
    getCoreServicesSnapshot,
} from './kernel.js';

describe('core kernel services registry', () => {
    beforeEach(() => {
        resetCoreServices();
    });

    it('registers and resolves core services', () => {
        const service = { name: 'notification' };
        registerCoreServices({
            NotificationService: service,
            showNotification: () => {},
        });

        expect(getCoreService('NotificationService')).toBe(service);
        expect(typeof getCoreService('showNotification')).toBe('function');
    });

    it('routes notify to NotificationService.add when available', () => {
        const add = vi.fn();
        registerCoreServices({
            NotificationService: { add },
            showNotification: vi.fn(),
        });

        const result = notify('Hello', 'info', { duration: 1000 });

        expect(result).toBe(true);
        expect(add).toHaveBeenCalledWith('Hello', 'info', { duration: 1000 });
    });

    it('falls back to showNotification when NotificationService is absent', () => {
        const showNotification = vi.fn();
        registerCoreServices({ showNotification });

        const result = notify('Fallback', 'warning', 1200);

        expect(result).toBe(true);
        expect(showNotification).toHaveBeenCalledWith('Fallback', 'warning', 1200);
    });

    it('returns false when no notification handlers are available', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = notify('No handlers');

        expect(result).toBe(false);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('exposes a snapshot copy without mutating source registry', () => {
        registerCoreServices({ alpha: 1 });
        const snapshot = getCoreServicesSnapshot();
        snapshot.alpha = 2;
        expect(getCoreService('alpha')).toBe(1);
    });
});
