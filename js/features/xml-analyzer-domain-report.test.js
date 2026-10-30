import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createXmlAnalyzerApp } from './xml-analyzer-app.js';
import { installBrowserElectronAPI } from './xml-analyzer-adapter.js';

const payload = {
    docflows: [
        {
            uid: 'synthetic-cycle',
            errors: [],
            messages: [
                {
                    id: 'synthetic-message',
                    type: '111',
                    title: 'Уведомление об изменении ЭЛН',
                    processed_at: '2026-10-29 10:33:57.725665',
                    status: null,
                },
            ],
        },
        {
            id: 'synthetic-flat',
            type: '332',
            title: 'Ответ на запрос исторических данных',
            status: null,
        },
    ],
};
let app;
beforeEach(() => {
    const markup = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../index.html'),
        'utf8',
    );
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    document.body.replaceChildren(
        document.importNode(parsed.getElementById('xmlAnalyzerContent'), true),
    );
    installBrowserElectronAPI();
    app = createXmlAnalyzerApp(document.getElementById('xmlAnalyzerContent'));
});
afterEach(() => {
    app?.clearAnalysis();
    document.body.replaceChildren();
});

describe('real analyzer domain report pipeline', () => {
    it('recognizes the mixed SFR docflows envelope and exposes its readable report', async () => {
        const text = JSON.stringify(payload);
        const rec = await app._createRecord({
            name: 'synthetic.json',
            size: text.length,
            text,
        });
        expect(rec.kind).toBe('sedo');
        await app._adoptRecords([rec], false);
        expect(rec.view.element.querySelector('#xa-tab-report')).not.toBeNull();
        rec.view.activate('report');
        const report = rec.view.element.querySelector('#xa-panel-report');
        expect(report.textContent).toContain('synthetic-flat');
        expect(report.textContent).toContain('10:33:57.725665');
        rec.view.activate('overview');
        expect(rec.view.element.querySelector('#xa-panel-overview').textContent).toContain('СФР');
    });
    it('does not discard unfamiliar arrays or embedded SFR objects in diagnostic XML', async () => {
        const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
        const text = `<ТипОтчет ВерсияПрограммы="TEST"><ДополнительнаяИнформация><Инфо><Вид>ЦиклыОбменаСФР</Вид><Значение>${escape(JSON.stringify(payload))}</Значение></Инфо><Инфо><Вид>НовыйМассив</Вид><Значение>[{"Поле":"retained-array-value"}]</Значение></Инфо></ДополнительнаяИнформация></ТипОтчет>`;
        const rec = await app._createRecord({
            name: 'synthetic.xml',
            size: text.length,
            text,
        });
        await app._adoptRecords([rec], false);
        rec.view.activate('report');
        const report = rec.view.element.querySelector('#xa-panel-report');
        expect(report.textContent).toContain('synthetic-flat');
        for (const d of report.querySelectorAll('details')) {
            d.open = true;
            d.dispatchEvent(new Event('toggle'));
        }
        expect(report.textContent).toContain('retained-array-value');
        expect(report.textContent).not.toContain('[object Object]');
    });
});
