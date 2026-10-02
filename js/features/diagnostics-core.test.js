import { describe, expect, it } from 'vitest';
import {
    inferLayer,
    diagnoseIssue,
    normalizeIssue,
    groupByLayer,
    compareIssueSets,
    issueKey,
    formatReportAsText,
    guessGoogleDocsErrorKind,
    probabilityLabel,
} from './diagnostics-core.js';

const envOnline = { online: true, protocol: 'https:', secureContext: true, serviceWorkerSupported: true };

describe('diagnostics-core: слои', () => {
    it('сопоставляет системы со слоями', () => {
        expect(inferLayer({ system: 'storage_idb', title: 'IndexedDB' })).toBe('storage');
        expect(inferLayer({ system: 'tab_pwa', title: 'Service Worker' })).toBe('pwa');
        expect(inferLayer({ system: 'search', title: 'Поиск' })).toBe('search');
        expect(inferLayer({ system: 'external', title: 'Google Docs / Шаблоны' })).toBe('external');
        expect(inferLayer({ system: 'runtime', title: 'Сеть' })).toBe('network');
        expect(inferLayer({ system: 'runtime', title: 'localStorage' })).toBe('storage');
        expect(inferLayer({ system: 'export_import', title: 'Экспорт' })).toBe('data');
        expect(inferLayer({ system: 'ui_surface', title: 'Поверхность UI' })).toBe('ui');
        expect(inferLayer({ system: 'runtime_errors', title: 'x' })).toBe('runtime');
    });
});

describe('diagnostics-core: диагноз Google Docs', () => {
    it('офлайн: очевидная причина', () => {
        const d = diagnoseIssue(
            { title: 'Google Docs / Шаблоны', message: 'Нет подключения', errorInfo: { kind: 'offline', service: 'google-docs' } },
            { env: { ...envOnline, online: false } },
        );
        expect(d.layer).toBe('external');
        expect(d.obvious).toBe(true);
        expect(d.hypotheses[0].id).toBe('device-offline');
    });
    it('сетевой сбой при живом локальном сервере: блокировка внешнего хоста', () => {
        const d = diagnoseIssue(
            { title: 'Google Docs', message: 'Failed to fetch', errorInfo: { kind: 'network' } },
            { env: envOnline, probes: { sameOrigin: { ok: true }, external: { ok: false } } },
        );
        expect(d.hypotheses[0].id).toBe('external-blocked');
    });
    it('оба зонда падают: нет интернета', () => {
        const d = diagnoseIssue(
            { title: 'Google Docs', message: 'x', errorInfo: { kind: 'network' } },
            { env: envOnline, probes: { sameOrigin: { ok: false }, external: { ok: false } } },
        );
        expect(d.hypotheses[0].id).toBe('internet-down');
    });
    it('HTTP-статусы', () => {
        const mk = (status) =>
            diagnoseIssue({ title: 'Google Docs', message: 'e', errorInfo: { kind: 'http', status } }, { env: envOnline }).hypotheses[0].id;
        expect(mk(403)).toBe('access-denied');
        expect(mk(404)).toBe('wrong-deployment');
        expect(mk(429)).toBe('quota');
        expect(mk(503)).toBe('google-5xx');
    });
    it('угадывает тип по тексту', () => {
        expect(guessGoogleDocsErrorKind('Превышено время ожидания')).toBe('timeout');
        expect(guessGoogleDocsErrorKind('Ошибка загрузки: статус 500')).toBe('http');
        expect(guessGoogleDocsErrorKind('Failed to fetch')).toBe('network');
    });
});

describe('diagnostics-core: общие правила и отчёты', () => {
    it('квота IndexedDB', () => {
        const d = diagnoseIssue({ title: 'IndexedDB', message: 'QuotaExceededError при записи', system: 'storage_idb' }, { env: envOnline });
        expect(d.hypotheses[0].id).toBe('quota-full');
    });
    it('fallback по слою', () => {
        const d = diagnoseIssue({ title: 'Странность', message: 'нечто', system: 'ui' }, { env: envOnline });
        expect(d.ruleId).toBe('fallback:ui');
    });
    it('JS-ошибка', () => {
        const d = diagnoseIssue({ title: 'Runtime / window.error', message: 'TypeError: Cannot read properties' }, { env: envOnline });
        expect(d.ruleId).toBe('js-runtime');
    });
    it('probabilityLabel / groupByLayer / compare / key', () => {
        expect(probabilityLabel(80)).toBe('Очень вероятно');
        expect(groupByLayer([{ layer: 'ui' }, { layer: 'network' }]).map((x) => x.layer.id)).toEqual(['network', 'ui']);
        const r = compareIssueSets([{ key: 'a' }], [{ key: 'b' }]);
        expect(r.added).toHaveLength(1);
        expect(r.fixed).toHaveLength(1);
        expect(issueKey({ title: 'T', message: 'сбоев 5' })).toBe(issueKey({ title: 'T', message: 'сбоев 9' }));
    });
    it('formatReportAsText', () => {
        const d = diagnoseIssue({ title: 'IndexedDB', message: 'blocked', system: 'storage_idb' }, { env: envOnline });
        const t = formatReportAsText({ errors: [{}], warnings: [], checks: [1] }, [d], { env: envOnline });
        expect(t).toContain('ОБНАРУЖЕНЫ ОШИБКИ');
        expect(t).toContain('Что сделать');
        expect(normalizeIssue({ message: 'm' }).title).toBe('Ошибка');
    });
});
