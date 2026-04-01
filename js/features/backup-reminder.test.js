'use strict';

import { describe, it, expect } from 'vitest';
import {
    shouldShowBackupReminder,
    BACKUP_REMINDER_INTERVAL_MS,
} from './backup-reminder.js';

describe('shouldShowBackupReminder', () => {
    const interval = BACKUP_REMINDER_INTERVAL_MS;

    it('returns false when disabled', () => {
        expect(shouldShowBackupReminder(1e13, 0, null, false, interval)).toBe(false);
    });

    it('returns false before first interval from first launch when never shown', () => {
        const first = 1_000_000;
        expect(shouldShowBackupReminder(first + interval - 1, first, null, true, interval)).toBe(
            false,
        );
    });

    it('returns true after interval from first launch when never shown', () => {
        const first = 1_000_000;
        expect(shouldShowBackupReminder(first + interval, first, null, true, interval)).toBe(true);
    });

    it('returns false before 3h since last shown', () => {
        const last = 5_000_000;
        expect(shouldShowBackupReminder(last + interval - 1, 0, last, true, interval)).toBe(false);
    });

    it('returns true after 3h since last shown', () => {
        const last = 5_000_000;
        expect(shouldShowBackupReminder(last + interval, 0, last, true, interval)).toBe(true);
    });
});
