import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as helper from './clipboard-health-probe.js';
const source = readFileSync(resolve(process.cwd(), 'js/features/background-health-tests.js'), 'utf8');
const marker = '// Тест 6.2: clipboard';
const ends = ['                updateHud(95);', '            // Второй контур целостности данных'];
let cursor = 0;
const paths = ends.map(end => {
    const start = source.indexOf(marker, cursor);
    const finish = source.indexOf(end, start);
    if (start < 0 || finish <= start) throw Error('Production clipboard probe boundary missing');
    cursor = finish;
    return source.slice(start + marker.length, finish);
});
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(path, report) {
    return new AsyncFunction('report', 'reportClipboardHealth', paths[path])(report, helper.reportClipboardHealth);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('both production clipboard diagnostic paths', () => {
    it.each([0, 1])('path %i never reads or replaces clipboard contents', async path => {
        let contents = 'synthetic existing clipboard';
        const writeText = vi.fn(async value => { contents = value; });
        const readText = vi.fn(async () => contents);
        vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
        vi.spyOn(document, 'hasFocus').mockReturnValue(true);
        await run(path, vi.fn());
        expect(writeText).not.toHaveBeenCalled();
        expect(readText).not.toHaveBeenCalled();
        expect(contents).toBe('synthetic existing clipboard');
    });
    it.each([0, 1])('path %i reports unfocused document as a neutral skipped probe', async path => {
        const writeText = vi.fn().mockRejectedValue(new DOMException('Document is not focused.', 'NotAllowedError'));
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        vi.spyOn(document, 'hasFocus').mockReturnValue(false);
        const report = vi.fn();
        await run(path, report);
        expect(report).toHaveBeenCalledWith('info', 'Буфер обмена', expect.stringMatching(/фокус|активир/i));
        expect(report.mock.calls.some(([level]) => level === 'warn')).toBe(false);
        expect(writeText).not.toHaveBeenCalled();
    });
});
