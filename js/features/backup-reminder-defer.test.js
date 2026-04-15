/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect } from 'vitest';
import {
    isBackupReminderSuppressedByDefer,
    parseDeferLocalDatetimeToUtcMs,
    STORAGE_KEY_DEFER_UNTIL,
    readDeferUntilMs,
    writeDeferUntilMs,
} from './backup-reminder-defer.js';

describe('backup-reminder-defer', () => {
    it('isBackupReminderSuppressedByDefer is false when unset', () => {
        expect(isBackupReminderSuppressedByDefer(1e12, null)).toBe(false);
        expect(isBackupReminderSuppressedByDefer(1e12, undefined)).toBe(false);
        expect(isBackupReminderSuppressedByDefer(1e12, 0)).toBe(false);
    });

    it('isBackupReminderSuppressedByDefer is true before deadline', () => {
        expect(isBackupReminderSuppressedByDefer(1000, 5000)).toBe(true);
    });

    it('isBackupReminderSuppressedByDefer is false at or after deadline', () => {
        expect(isBackupReminderSuppressedByDefer(5000, 5000)).toBe(false);
        expect(isBackupReminderSuppressedByDefer(6000, 5000)).toBe(false);
    });

    it('parseDeferLocalDatetimeToUtcMs rejects past or now', () => {
        const now = Date.UTC(2026, 0, 10, 12, 0, 0);
        expect(parseDeferLocalDatetimeToUtcMs('2026-01-10T11:00', now)).toBe(null);
        expect(parseDeferLocalDatetimeToUtcMs('', now)).toBe(null);
    });

    it('parseDeferLocalDatetimeToUtcMs accepts future', () => {
        const now = 0;
        const t = parseDeferLocalDatetimeToUtcMs('2099-06-15T15:30', now);
        expect(t).not.toBe(null);
        expect(t).toBeGreaterThan(now);
    });

    it('read/write defer round-trip via localStorage', () => {
        const prev = localStorage.getItem(STORAGE_KEY_DEFER_UNTIL);
        try {
            writeDeferUntilMs(null);
            expect(readDeferUntilMs()).toBe(null);
            writeDeferUntilMs(9_999_999_999);
            expect(readDeferUntilMs()).toBe(9_999_999_999);
            writeDeferUntilMs(null);
            expect(readDeferUntilMs()).toBe(null);
        } finally {
            if (prev == null) localStorage.removeItem(STORAGE_KEY_DEFER_UNTIL);
            else localStorage.setItem(STORAGE_KEY_DEFER_UNTIL, prev);
        }
    });
});
