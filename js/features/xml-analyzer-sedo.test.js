import { describe, it, expect } from 'vitest';
import {
    normalizeSedoPayload,
    renderSedoReport,
    renderStructuredValue,
    formatSedoTimestamp,
} from './xml-analyzer-sedo.js';

const mixed = {
    docflows: [
        {
            uid: 'cycle-a',
            errors: [],
            messages: [
                {
                    id: 'message-a',
                    type: '111',
                    title: 'Уведомление об изменении ЭЛН',
                    date: '2026-10-29 10:17:54.667000',
                    received_at: '2026-10-29 10:30:37.974905',
                    processed_at: '2026-10-29 10:33:57.725665',
                    delivered_at: null,
                    status: null,
                    extra: { source: 'retained' },
                },
            ],
        },
        {
            id: 'message-b',
            type: '332',
            title: 'Ответ на запрос исторических данных',
            date: '2026-10-27 10:34:56.267000',
            received_at: '2026-10-27 11:13:42.919475',
            processed_at: '2026-10-27 16:06:07.326973',
            delivered_at: null,
            error: null,
            status: null,
        },
        {
            id: 'message-c',
            type: '206',
            title: 'Результат создания доверенности',
            status: 'Зарегистрировано',
            error: { code: 'synthetic', description: '<img src=x onerror=alert(1)>' },
        },
    ],
};

describe('readable SFR exchange analysis', () => {
    it('loads long message lists inside one cycle incrementally without losing the tail', () => {
        const report = renderSedoReport({
            uid: 'large-cycle',
            messages: Array.from({ length: 501 }, (_, i) => ({
                type: '332',
                title: 'Synthetic',
                id: 'nested-' + i,
            })),
        });
        expect(report.querySelectorAll('[data-sedo-message]')).toHaveLength(50);
        let more = report.querySelector('[data-sedo-more-messages]');
        while (more) {
            more.click();
            more = report.querySelector('[data-sedo-more-messages]');
        }
        expect(report.querySelectorAll('[data-sedo-message]')).toHaveLength(501);
        expect(report.textContent).toContain('nested-500');
    });
    it('retains unfamiliar field names that also occur on Object.prototype', () => {
        const value = JSON.parse(
            '{"constructor":"retained-a","__proto__":"retained-b","toString":"retained-c"}',
        );
        const view = renderStructuredValue(value);
        expect([...view.querySelectorAll('.xa-k')].map((el) => el.textContent)).toEqual([
            'constructor',
            '__proto__',
            'toString',
        ]);
        expect(view.textContent).toContain('retained-b');
    });
    it('accounts for nested cycles and flat messages without mutating the original payload', () => {
        const before = JSON.stringify(mixed);
        const normalized = normalizeSedoPayload(mixed);
        expect(normalized.records).toHaveLength(3);
        expect(normalized.summary).toMatchObject({
            records: 3,
            messages: 3,
            identifiedCycles: 1,
            processed: 2,
            delivered: 0,
            statusMissing: 2,
            errors: 1,
        });
        expect(normalized.records.map((r) => r.messages.length)).toEqual([1, 1, 1]);
        expect(JSON.stringify(mixed)).toBe(before);
    });
    it('preserves microseconds and never invents a timezone for server timestamps', () => {
        expect(formatSedoTimestamp('2026-10-29 10:33:57.725665')).toBe(
            '29.10.2026, 10:33:57.725665',
        );
        expect(formatSedoTimestamp(null)).toBe('Не указано');
        expect(formatSedoTimestamp('2026-10-29T10:33:57.725665Z')).toContain('UTC');
    });
    it('shows every stage, known type context, missing status, errors and unknown fields safely', () => {
        const report = renderSedoReport(mixed);
        document.body.replaceChildren(report);
        expect(report.querySelectorAll('[data-sedo-message]')).toHaveLength(3);
        const text = report.textContent;
        for (const part of [
            'cycle-a',
            'message-a',
            'message-b',
            'message-c',
            '111',
            '332',
            '206',
            'Получено',
            'Обработано',
            'Доставлено',
            '10:33:57.725665',
            'Статус не указан',
            'Зарегистрировано',
        ])
            expect(text).toContain(part);
        expect(text).not.toContain('[object Object]');
        for (const details of report.querySelectorAll('details')) {
            details.open = true;
            details.dispatchEvent(new Event('toggle'));
        }
        expect(report.textContent).toContain('retained');
        expect(report.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(report.querySelector('img')).toBeNull();
    });
    it('retains empty/error-only cycles and offers access beyond 500 records', () => {
        const data = {
            docflows: [
                { uid: 'empty', messages: [], errors: ['cycle issue'] },
                ...Array.from({ length: 501 }, (_, i) => ({
                    type: '332',
                    id: 'm' + i,
                    title: 'Message ' + i,
                })),
            ],
        };
        const parsed = normalizeSedoPayload(data);
        expect(parsed.summary).toMatchObject({
            records: 502,
            messages: 501,
            errors: 1,
        });
        const report = renderSedoReport(data);
        document.body.replaceChildren(report);
        let more = report.querySelector('[data-sedo-more]');
        while (more) {
            more.click();
            more = report.querySelector('[data-sedo-more]');
        }
        expect(report.querySelectorAll('[data-sedo-message]')).toHaveLength(501);
        expect(report.textContent).toContain('cycle issue');
    });
    it('accepts the existing messages envelope and declines unrelated JSON', () => {
        expect(normalizeSedoPayload({ messages: [] })).not.toBeNull();
        expect(normalizeSedoPayload({ arbitrary: [{ id: 1, title: 'Other' }] })).toBeNull();
    });
    it('retains envelope metadata and does not interpret payload HTML as markup', () => {
        const report = renderSedoReport({
            docflows: [],
            notice: '<script>untrusted</script>',
            extra: { value: false },
        });
        expect(report.textContent).toContain('<script>untrusted</script>');
        expect(report.textContent).toContain('Нет');
        expect(report.querySelector('script')).toBeNull();
    });
    it('does not calculate intervals from invalid calendar dates or mixed timezone evidence', () => {
        const report = renderSedoReport({
            messages: [
                {
                    type: '111',
                    date: '2026-02-31 10:00:00',
                    received_at: '2026-03-03 10:01:00',
                    processed_at: '2026-03-03T10:02:00Z',
                },
            ],
        });
        expect(report.querySelector('.xa-sedo-intervals')).toBeNull();
        expect(report.textContent).toContain('31.02.2026, 10:00:00');
    });
});
