import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mountBookmarkRichEditor } from './bookmark-rich-editor.js';
import { getCurrentBookmarkFormState } from '../components/bookmarks.js';
import { captureFormBaseline, registerFormDirty } from '../ui/form-modal-kit.js';
import { shouldConfirmBeforeClose } from '../ui/unsaved-changes-registry.js';

let form, editor;
beforeEach(() => {
    document.body.innerHTML =
        '<form><input name="bookmarkId"><input name="bookmarkTitle"><input name="bookmarkUrl"><label for="bookmarkDescription">Описание</label><textarea id="bookmarkDescription" name="bookmarkDescription"></textarea><select name="bookmarkFolder"><option value=""></option></select></form>';
    form = document.querySelector('form');
    editor = mountBookmarkRichEditor(form);
});
afterEach(() => {
    editor?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});
describe('bookmark visual editor integration', () => {
    it('makes the shared modal close guard detect formatting-only edits', () => {
        form.id = 'bookmarkModal';
        editor.setContent({ description: 'Same text' });
        registerFormDirty(form);
        captureFormBaseline(form, form);
        expect(shouldConfirmBeforeClose(form)).toBe(false);
        const metadata = document.createElement('input');
        metadata.type = 'hidden';
        metadata.name = 'internalMetadata';
        form.append(metadata);
        metadata.value = 'not a user edit';
        expect(shouldConfirmBeforeClose(form)).toBe(false);
        editor.editable.innerHTML = '<p><strong>Same text</strong></p>';
        editor.editable.dispatchEvent(new Event('input', { bubbles: true }));
        expect(form.elements.bookmarkDescription.value).toBe('Same text');
        expect(shouldConfirmBeforeClose(form)).toBe(true);
    });
    it('adds a link without replacing the selected inline formatting', () => {
        editor.setContent({
            descriptionHtml: '<p><strong style="color:#c53030">Formatted</strong></p>',
        });
        const range = document.createRange();
        range.selectNodeContents(editor.editable.querySelector('strong'));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        const exec = vi.fn(() => true);
        Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
        form.querySelector('[aria-label="Вставить или изменить ссылку (Ctrl+K)"]').click();
        const inputs = form.querySelectorAll('.bookmark-format-panel input');
        inputs[0].value = 'https://example.com/';
        [...form.querySelectorAll('button')]
            .find((b) => b.textContent === 'Применить ссылку')
            .click();
        expect(exec).toHaveBeenCalledWith('createLink', false, 'https://example.com/');
        expect(editor.editable.querySelector('strong').style.color).toBe('rgb(197, 48, 48)');
        delete document.execCommand;
    });
    it('can delete a pasted table even when its cells are merged', () => {
        editor.setContent({
            descriptionHtml: '<table><tr><td colspan="2">Merged</td></tr></table>',
        });
        const range = document.createRange();
        range.selectNodeContents(editor.editable.querySelector('td'));
        range.collapse(true);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        const exec = vi.fn(() => true);
        Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
        form.querySelector('[aria-label="Удалить таблицу"]').click();
        expect(exec).toHaveBeenCalledWith('insertHTML', false, '<p><br></p>');
        delete document.execCommand;
    });
    it('adds a column to a rectangular projection of a ragged imported table without losing cells', () => {
        editor.setContent({
            descriptionHtml: '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>',
        });
        const range = document.createRange();
        range.selectNodeContents(editor.editable.querySelectorAll('td')[1]);
        range.collapse(true);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        const exec = vi.fn(() => true);
        Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
        form.querySelector('[aria-label="Добавить столбец таблицы"]').click();
        const html = exec.mock.calls.find((call) => call[0] === 'insertHTML')?.[2];
        expect(html).toBeTruthy();
        const host = document.createElement('div');
        host.innerHTML = html;
        expect([...host.querySelectorAll('tr')].map((row) => row.cells.length)).toEqual([3, 3]);
        for (const value of ['A', 'B', 'C']) expect(host.textContent).toContain(value);
        delete document.execCommand;
    });
    it('keeps the normal font size after a native form reset', async () => {
        form.reset();
        await Promise.resolve();
        expect(form.querySelector('select[aria-label="Размер текста"]').value).toBe('3');
    });
    it('mounts once and exposes all groups with accessible controls', () => {
        expect(mountBookmarkRichEditor(form)).toBe(editor);
        expect(form.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
        for (const label of [
            'Цвет текста',
            'Цвет выделения',
            'Вставить таблицу',
            'Добавить строку таблицы',
            'Очистить оформление',
            'Повторить (Ctrl+Y)',
        ])
            expect(form.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
        expect(form.elements.bookmarkDescription.hidden).toBe(true);
        expect(editor.editable.getAttribute('aria-multiline')).toBe('true');
    });
    it('synchronizes sanitized rich and plain fields, including formatting-only dirty changes', () => {
        editor.setContent({ description: 'Один два' });
        const before = getCurrentBookmarkFormState(form);
        editor.editable.innerHTML = '<p><b>Один</b> два</p>';
        editor.editable.dispatchEvent(new Event('input', { bubbles: true }));
        const after = getCurrentBookmarkFormState(form);
        expect(after.description).toBe(before.description);
        expect(after.descriptionHtml).not.toBe(before.descriptionHtml);
        expect(after.descriptionHtml).toContain('<b>Один</b>');
    });
    it('clears old rich content when opening a new or legacy bookmark', () => {
        editor.setContent({ descriptionHtml: '<p><strong>Предыдущая</strong></p>' });
        editor.setContent({ description: '<b>Буквальный текст</b>' });
        expect(editor.editable.querySelector('b,strong')).toBeNull();
        expect(form.elements.bookmarkDescription.value).toBe('<b>Буквальный текст</b>');
        editor.setContent();
        expect(form.elements.bookmarkDescription.value).toBe('');
    });
    it('restores the editor selection after a formatting panel takes focus', () => {
        editor.setContent({ description: 'Один два' });
        const range = document.createRange();
        range.selectNodeContents(editor.editable.querySelector('p'));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        const exec = vi.fn(() => true);
        Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
        form.querySelector('[aria-label="Цвет текста"]').click();
        const hex = form.querySelector('.bookmark-format-panel input[type=text]');
        hex.focus();
        hex.value = '#c53030';
        [...form.querySelectorAll('button')]
            .find((b) => b.textContent === 'Применить цвет')
            .click();
        expect(exec).toHaveBeenCalledWith('foreColor', false, '#c53030');
        expect(document.getSelection().toString()).toBe('Один два');
        delete document.execCommand;
    });
});
