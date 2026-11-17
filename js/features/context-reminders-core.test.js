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

import { nextRepeatDue, normalizeRepeat } from './context-reminders-core.js';

describe('повтор напоминаний', () => {
    const local = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0).toISOString();
    it('каждый день и неделю — сохраняет время, пропущенные периоды не копит', () => {
        const due = local(2026, 11, 10);
        const now = new Date(2026, 10, 17, 9).getTime();
        expect(nextRepeatDue(due, 'daily', now)).toBe(local(2026, 11, 17));
        expect(nextRepeatDue(due, 'weekly', now)).toBe(local(2026, 11, 17));
        expect(nextRepeatDue(due, 'weekly', new Date(2026, 10, 17, 11).getTime())).toBe(local(2026, 11, 24));
    });
    it('по будням — пропускает выходные', () => {
        const fri = local(2026, 11, 20); // пятница
        expect(nextRepeatDue(fri, 'weekdays', new Date(2026, 10, 20, 11).getTime())).toBe(local(2026, 11, 23));
    });
    it('каждый месяц — 31-е в коротком месяце становится последним днём', () => {
        const jan31 = local(2027, 1, 31);
        expect(nextRepeatDue(jan31, 'monthly', new Date(2027, 0, 31, 11).getTime())).toBe(local(2027, 2, 28));
        // с якорем: после 28 февраля — снова 31-е
        expect(nextRepeatDue(local(2027, 2, 28), 'monthly', new Date(2027, 1, 28, 11).getTime(), 31)).toBe(
            local(2027, 3, 31),
        );
    });
    it('без повтора и мусор', () => {
        expect(nextRepeatDue(local(2026, 1, 1), 'none')).toBeNull();
        expect(normalizeRepeat('hourly')).toBe('none');
        expect(nextRepeatDue('bad', 'daily')).toBeNull();
    });
});
