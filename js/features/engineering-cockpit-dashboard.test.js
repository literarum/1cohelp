import { describe, it, expect } from 'vitest';
import {
    formatBytes,
    describePwa,
    buildOverviewCardsHtml,
    buildDbTableHtml,
    groupErrorEntries,
    buildErrorGroupsHtml,
    buildStateCardsHtml,
} from './engineering-cockpit-dashboard.js';

describe('engineering-cockpit-dashboard', () => {
    it('formatBytes', () => {
        expect(formatBytes(512)).toBe('512 Б');
        expect(formatBytes(2048)).toBe('2.0 КБ');
        expect(formatBytes(-1)).toBe('—');
        expect(formatBytes(NaN)).toBe('—');
    });
    it('describePwa', () => {
        expect(describePwa({ supported: false }).tone).toBe('warn');
        expect(describePwa({ supported: true, registration: { active: { state: 'activated' } } })).toEqual({ text: 'активен', tone: 'ok' });
        expect(describePwa({ error: 'x' }).tone).toBe('bad');
        expect(describePwa(null).tone).toBe('bad');
    });
    it('cards: errors tone and totals, tolerant to junk', () => {
        const html = buildOverviewCardsHtml(
            { app: { online: false }, runtime: { runtimeErrorsBuffered: 2, logsBuffered: 5 }, performance: { now: 125000, memory: 'n/a' } },
            [{ store: 'a', status: 'ok', count: 3 }, { store: 'b', status: 'error' }],
        );
        expect(html).toContain('офлайн');
        expect(html).toContain('ec-card--bad');
        expect(html).toContain('2 хранилищ');
        expect(html).toContain('2 мин 5 с');
        expect(buildOverviewCardsHtml(null)).toBe('');
        expect(() => buildOverviewCardsHtml({}, undefined)).not.toThrow();
    });
    it('table escapes names, sorts by count, shows errors', () => {
        const html = buildDbTableHtml([
            { store: '<b>x</b>', status: 'ok', count: 1 },
            { store: 'big', status: 'ok', count: 10 },
            { store: 'broken', status: 'error', error: 'boom' },
        ]);
        expect(html).not.toContain('<b>x</b>');
        expect(html).toContain('&lt;b&gt;');
        expect(html.indexOf('big')).toBeLessThan(html.indexOf('&lt;b&gt;'));
        expect(html).toContain('boom');
        expect(buildDbTableHtml([])).toBe('');
    });
    it('groupErrorEntries: группирует повторы, сортирует по числу', () => {
        const g = groupErrorEntries(
            [
                { tsIso: '2026-01-01T10:00:00Z', source: 'net', message: 'fail\nstack' },
                { tsIso: '2026-01-01T10:05:00Z', source: 'net', message: 'fail\nother stack' },
            ],
            [{ ts: '2026-01-01T09:00:00Z', source: 'ui', message: 'oops' }],
        );
        expect(g[0]).toMatchObject({ source: 'net', message: 'fail', count: 2, lastTs: '2026-01-01T10:05:00Z' });
        expect(g.length).toBe(2);
        expect(groupErrorEntries(null, undefined)).toEqual([]);
    });
    it('buildErrorGroupsHtml: пусто — зелёная плашка; XSS экранируется', () => {
        expect(buildErrorGroupsHtml([], [])).toContain('ec-okbox');
        const h = buildErrorGroupsHtml([{ tsIso: 'x', source: '<i>', message: '<script>' }], []);
        expect(h).not.toContain('<script>');
        expect(h).toContain('1×');
    });
    it('buildStateCardsHtml: простые настройки в таблице, объекты пропускаются', () => {
        const h = buildStateCardsHtml({
            currentSection: 'main',
            isLoading: false,
            dbAvailable: true,
            keys: ['a', 'b'],
            userPreferences: { theme: 'dark', nested: { a: 1 }, n: 3 },
        });
        expect(h).toContain('theme');
        expect(h).not.toContain('nested');
        expect(h).toContain('подключена');
        expect(buildStateCardsHtml(null)).toBe('');
    });
});
