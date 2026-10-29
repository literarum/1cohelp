import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseXml } from './xml-analyzer-model.js';
import { collectRequisites } from './xml-analyzer-insights.js';
import { createExplorerView } from './xml-analyzer-explorer.js';

const views = [];
// jsdom has no native top-layer dialog implementation; DOM relocation and state remain real.
for (const [name, open] of [['showModal', true], ['close', false]]) {
    if (!HTMLDialogElement.prototype[name]) {
        Object.defineProperty(HTMLDialogElement.prototype, name, { configurable: true,
            value() { this.open = open; } });
    }
}
async function explorer(extra = {}) {
    const doc = await parseXml('<Документ Версия="1" ИНН="1234567894"><Строка Код="1">Первое значение</Строка><Строка Код="2">Второе значение</Строка></Документ>');
    const view = createExplorerView({ doc, meta: { fileName: 'sample.xml', size: 180 },
        sign: { certificates: [], signatures: [], cms: [] }, findings: [],
        requisites: collectRequisites(doc), initialTab: 'tree', ...extra });
    document.body.appendChild(view.element);
    views.push(view);
    return view;
}
afterEach(() => {
    views.splice(0).forEach(view => view.destroy());
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('XML explorer workspace', () => {
    it('keeps validated attributes in three aligned columns with the copy action last', async () => {
        const view = await explorer();
        await vi.waitFor(() => expect(view.element.querySelector('.xa-attrs')).not.toBeNull());
        const row = [...view.element.querySelectorAll('.xa-attr')].find(el => el.querySelector('.xa-attr-name').textContent === 'ИНН');
        expect(row.children).toHaveLength(3);
        expect(row.lastElementChild.getAttribute('aria-label')).toBe('Копировать значение');
        expect(row.querySelector('.xa-attr-val .xa-badge').textContent).toBe('✓');
    });
    it('supports Home and End in the tab list and preserves one keyboard tab stop', async () => {
        const view = await explorer();
        const list = view.element.querySelector('[role="tablist"]');
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement.id).toBe('xa-tab-compare');
        expect(view.element.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(document.activeElement.id).toBe('xa-tab-overview');
    });

    it('expands the same workspace without rebuilding its active panel, then restores focus and location', async () => {
        const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function () { this.open = true; });
        vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function () { this.open = false; });
        const view = await explorer();
        const originalParent = view.element.parentNode;
        const tree = view.element.querySelector('[role="tree"]');
        const expand = view.element.querySelector('[data-xa-expand]');
        expect(expand).not.toBeNull();
        expand.focus(); expand.click();
        const dialog = document.querySelector('.xa-fullscreen-dialog');
        expect(show).toHaveBeenCalledOnce();
        expect(dialog.contains(view.element)).toBe(true);
        expect(view.element.querySelector('[role="tree"]')).toBe(tree);
        view.activate('structure');
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(document.querySelector('.xa-fullscreen-dialog')).toBeNull();
        expect(view.element.parentNode).toBe(originalParent);
        expect(view.element.querySelector('#xa-tab-structure').getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(expand);
    });

    it('removes the fullscreen dialog and releases body scrolling when destroyed', async () => {
        vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function () { this.open = true; });
        vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function () { this.open = false; });
        document.body.style.overflow = 'clip';
        const view = await explorer();
        view.element.querySelector('[data-xa-expand]').click();
        view.destroy();
        expect(document.querySelector('.xa-fullscreen-dialog')).toBeNull();
        expect(document.body.style.overflow).toBe('clip');
        document.body.style.overflow = '';
    });

    it('keeps fullscreen content mounted when its document session is presented again', async () => {
        const { createXmlAnalyzerApp } = await import('./xml-analyzer-app.js');
        const appRoot = document.createElement('div');
        appRoot.innerHTML = '<button id="xmlAnalyzerAnalyzeBtn"></button>';
        const appPrototype = Object.getPrototypeOf(createXmlAnalyzerApp(appRoot));
        const view = await explorer();
        const outputArea = document.createElement('div');
        document.body.appendChild(outputArea);
        const session = { root: document.body, outputArea, _buildDocBar: () => null,
            renderCertificateManager() {}, getEl: () => null, updateAnalyzeButtonState() {} };
        const rec = { view };
        appPrototype._presentRecord.call(session, rec);
        const tree = view.element.querySelector('[role="tree"]');
        view.element.querySelector('[data-xa-expand]').click();
        appPrototype._presentRecord.call(session, rec);
        const dialog = document.querySelector('.xa-fullscreen-dialog');
        expect(dialog.open).toBe(true);
        expect(dialog.contains(view.element)).toBe(true);
        expect(view.element.querySelector('[role="tree"]')).toBe(tree);
        dialog.querySelector('button').click();
        expect(view.element.isConnected).toBe(true);
        expect(outputArea.contains(view.element)).toBe(true);
        expect(document.querySelector('.xa-fullscreen-dialog')).toBeNull();
    });

    it('handles Escape before application document shortcuts can cancel the native dialog action', async () => {
        const view = await explorer();
        view.element.querySelector('[data-xa-expand]').click();
        const dialog = document.querySelector('.xa-fullscreen-dialog');
        const appShortcut = vi.fn(event => event.preventDefault());
        document.addEventListener('keydown', appShortcut);
        try {
            dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(document.querySelector('.xa-fullscreen-dialog')).toBeNull();
            expect(appShortcut).not.toHaveBeenCalled();
            expect(view.element.querySelector('[data-xa-expand]').getAttribute('aria-label')).toBe('На весь экран');
        } finally { document.removeEventListener('keydown', appShortcut); }
    });

    it('groups certificate fields, separates actions, and avoids repeating the identical issuer', async () => {
        const c = { ownerFio: 'ТЕСТОВЫЙ ВЛАДЕЛЕЦ', subject: { CN: 'ТЕСТОВЫЙ ВЛАДЕЛЕЦ', E: 'sample@example.test' },
            issuer: { CN: 'Тестовый УЦ', O: 'Тестовый УЦ' }, serialNumber: 'AA11', thumbprint: 'AB'.repeat(20),
            thumbprintSha256: 'CD'.repeat(32), validity: { notBefore: '2025-01-01', notAfter: '2030-01-01' },
            publicKeyAlgorithm: { name: 'Тестовый алгоритм' }, signatureAlgorithm: { name: 'Тестовая подпись' },
            base64: 'AA==', extensions: [], source: 'Тестовый элемент' };
        const view = await explorer({ initialTab: 'signatures', sign: { certificates: [c] } });
        const card = view.element.querySelector('.xa-cert-card');
        expect(card).not.toBeNull();
        expect([...card.querySelectorAll('.xa-cert-section-title')].map(el => el.textContent)).toEqual([
            'Владелец', 'Срок действия и издатель', 'Технические сведения',
        ]);
        expect(card.textContent.match(/Тестовый УЦ/g)).toHaveLength(1);
        expect(card.querySelector('.xa-cert-actions').getAttribute('aria-label')).toBe('Действия с сертификатом');
        expect(card.textContent).toContain('AB'.repeat(20));
    });

    it('clears stale comparison results when the second document is removed', async () => {
        const other = await parseXml('<Документ><Строка>Изменено</Строка></Документ>');
        let docs = [{ id: 'other', name: 'other.xml', doc: other }];
        const view = await explorer({ initialTab: 'compare', getOtherDocs: () => docs });
        await vi.waitFor(() => expect(view.element.querySelectorAll('.xa-diff').length).toBeGreaterThan(0));
        docs = [];
        view.refreshCompare();
        const select = view.element.querySelector('select');
        expect(select.disabled).toBe(true);
        expect(view.element.querySelectorAll('.xa-diff')).toHaveLength(0);
        expect(view.element.querySelector('.xa-cmp-host').textContent).toContain('Загрузите второй XML');
    });

    it('explains what to do when several comparison documents are available', async () => {
        const other = await parseXml('<r/>');
        const view = await explorer({ initialTab: 'compare', getOtherDocs: () => [
            { id: 'a', name: 'a.xml', doc: other }, { id: 'b', name: 'b.xml', doc: other },
        ] });
        expect(view.element.querySelector('.xa-cmp-host').textContent).toContain('Выберите документ');
        expect(view.element.querySelector('select').disabled).toBe(false);
    });
});
