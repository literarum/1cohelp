'use strict';

import { describe, it, expect } from 'vitest';
import {
    addCalendarDaysUtc,
    compareRemindersByDueAsc,
    isPendingDue,
    intentLabel,
} from './context-reminders-core.js';

describe('context-reminders-core', () => {
    it('addCalendarDaysUtc adds whole days in UTC', () => {
        const base = new Date(Date.UTC(2026, 3, 1, 12, 0, 0));
        const out = addCalendarDaysUtc(base, 7);
        expect(out.getUTCDate()).toBe(8);
        expect(out.getUTCMonth()).toBe(3);
    });

    it('compareRemindersByDueAsc orders by dueAt', () => {
        const a = { id: 2, dueAt: '2026-04-10T00:00:00.000Z' };
        const b = { id: 1, dueAt: '2026-04-05T00:00:00.000Z' };
        expect(compareRemindersByDueAsc(a, b)).toBeGreaterThan(0);
        expect(compareRemindersByDueAsc(b, a)).toBeLessThan(0);
    });

    it('isPendingDue is true only for pending with due in the past', () => {
        const now = Date.UTC(2026, 4, 1, 10, 0, 0); // 1 мая 2026, 10:00 UTC
        expect(isPendingDue({ status: 'pending', dueAt: '2026-05-01T09:00:00.000Z' }, now)).toBe(
            true,
        );
        expect(isPendingDue({ status: 'pending', dueAt: '2026-05-01T11:00:00.000Z' }, now)).toBe(
            false,
        );
        expect(isPendingDue({ status: 'done', dueAt: '2026-05-01T09:00:00.000Z' }, now)).toBe(
            false,
        );
    });

    it('intentLabel falls back', () => {
        const L = { callback: 'Перезвон', other: 'Другое' };
        expect(intentLabel('callback', L)).toBe('Перезвон');
        expect(intentLabel('unknown', L)).toBe('Другое');
    });
});
