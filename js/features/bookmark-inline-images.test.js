import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    sanitizeBookmarkHtml,
    bookmarkHtmlToText,
    bookmarkDescriptionHtml,
    bookmarkInlineShotIds,
    bookmarkInlineTempKeys,
    remapBookmarkInlineShotIds,
    resolveBookmarkInlineTempShots,
    parseFigureCrop,
} from './bookmark-rich-text.js';
import { hydrateBookmarkFigures, layoutFigure } from './bookmark-inline-images.js';
import { fitAspect, resizeRect } from './bookmark-image-crop.js';
import { mountBookmarkRichEditor, trimEmptyEdges } from './bookmark-rich-editor.js';
import { State } from '../app/state.js';
import { handleBookmarkFormSubmit, setBookmarksFormDependencies } from './bookmarks-form.js';

let urlCounter = 0;
beforeEach(() => {
    URL.createObjectURL = vi.fn(() => `blob:test/${++urlCounter}`);
    URL.revokeObjectURL = vi.fn();
    // jsdom не декодирует изображения: имитируем загрузку 1600×900.
    globalThis.Image = class {
        constructor() {
            this.naturalWidth = 1600;
            this.naturalHeight = 900;
        }
        set src(v) {
            this._src = v;
            queueMicrotask(() => this.onload?.());
        }
        get src() {
            return this._src;
        }
    };
});
afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

const flush = async (n = 6) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('inline image markup', () => {
    it('keeps only a validated figure reference and a plain-text caption', () => {
        const html = sanitizeBookmarkHtml(
            '<figure data-shot="12" data-align="left" data-width="40" data-crop="0.1,0.2,0.5,0.5" data-ratio="1.7778" data-alt="Окно ФНС" onclick="x()" style="position:fixed">' +
                '<img src="javascript:alert(1)"><div class="bm-fig-frame"><img src="blob:x"></div>' +
                '<figcaption><b>Шаг</b> 1<script>x</script></figcaption></figure>',
        );
        expect(html).toBe(
            '<figure data-shot="12" data-align="left" data-width="40" data-crop="0.1,0.2,0.5,0.5" data-ratio="1.7778" data-alt="Окно ФНС"><figcaption>Шаг 1</figcaption></figure>',
        );
    });
    it('drops figures without a valid reference and invalid geometry', () => {
        expect(sanitizeBookmarkHtml('<figure data-shot="0"><img src="a.png"></figure><p>x</p>')).toBe('<p>x</p>');
        expect(sanitizeBookmarkHtml('<figure data-shot-temp="../../x"></figure>')).toBe('');
        const odd = sanitizeBookmarkHtml('<figure data-shot="5" data-width="900" data-align="top" data-crop="0.9,0,0.5,1"></figure>');
        expect(odd).toBe('<figure data-shot="5"></figure>');
    });
    it('writes defaults canonically so dirty-checking stays stable', () => {
        const a = sanitizeBookmarkHtml('<figure data-shot="3" data-align="center" data-width="100" data-crop="0,0,1,1"></figure>');
        expect(a).toBe('<figure data-shot="3"></figure>');
        expect(sanitizeBookmarkHtml('<figure data-shot="3" data-align="wide" data-width="40"></figure>')).toBe(
            '<figure data-shot="3" data-align="wide"></figure>',
        );
    });
    it('treats an image-only note as content and includes captions in searchable text', () => {
        const html = '<figure data-shot="7"><figcaption>Схема подключения</figcaption></figure>';
        expect(bookmarkDescriptionHtml({ descriptionHtml: '<figure data-shot="7"></figure>' })).toContain('data-shot="7"');
        expect(bookmarkHtmlToText(html)).toBe('Схема подключения');
    });
    it('collects, remaps and resolves references', () => {
        const html = '<p>a</p><figure data-shot="4"></figure><figure data-shot-temp="tabc12345"></figure><figure data-shot="9"></figure>';
        expect([...bookmarkInlineShotIds(html)]).toEqual([4, 9]);
        expect([...bookmarkInlineTempKeys(html)]).toEqual(['tabc12345']);
        expect(remapBookmarkInlineShotIds(html, new Map([[4, 40]]))).toContain('data-shot="40"');
        expect(remapBookmarkInlineShotIds(html, new Map([[4, 40]]))).toContain('data-shot="9"');
        const resolved = resolveBookmarkInlineTempShots(html, new Map([['tabc12345', 77]]));
        expect(resolved).toContain('data-shot="77"');
        expect(resolved).not.toContain('data-shot-temp');
        // Черновик без записи не превращается в битую ссылку.
        expect(resolveBookmarkInlineTempShots(html, new Map())).not.toContain('figure data-shot-temp');
    });
    it('parses crops defensively', () => {
        expect(parseFigureCrop('0.1,0.1,0.5,0.5')).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
        expect(parseFigureCrop('0,0,1,1')).toBeNull();
        expect(parseFigureCrop('a,b,c,d')).toBeNull();
        expect(parseFigureCrop('0.5,0.5,0.6,0.2')).toBeNull();
    });
    it('trims only empty edge lines', () => {
        expect(trimEmptyEdges('<p><br></p><figure data-shot="1"></figure><p><br></p>')).toBe('<figure data-shot="1"></figure>');
        expect(trimEmptyEdges('<p>a</p><p><br></p><p>b</p>')).toBe('<p>a</p><p><br></p><p>b</p>');
    });
});

describe('crop geometry', () => {
    it('fits a preset aspect inside the image around the current centre', () => {
        const r = fitAspect({ x: 0, y: 0, w: 1, h: 1 }, 1, 16 / 9);
        // квадрат на изображении 16:9: высота целиком, ширина 9/16
        expect(r.h).toBeCloseTo(1);
        expect(r.w).toBeCloseTo(9 / 16);
        expect(r.x).toBeCloseTo((1 - 9 / 16) / 2);
    });
    it('keeps the opposite corner fixed and the rect inside bounds', () => {
        const r = resizeRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'se', 0.9, 0.9, null, 1);
        expect(r).toEqual({ x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
        const locked = resizeRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'se', 0.9, 0, 1, 1);
        expect(locked.w).toBeCloseTo(locked.h);
        expect(locked.x + locked.w).toBeLessThanOrEqual(1);
        expect(locked.y + locked.h).toBeLessThanOrEqual(1);
    });
});

describe('view hydration', () => {
    it('renders images from storage with crop geometry and a graceful placeholder', async () => {
        const root = document.createElement('div');
        root.innerHTML =
            '<figure data-shot="1" data-width="50" data-crop="0.25,0,0.5,1" data-ratio="2"></figure><figure data-shot="2"></figure>';
        document.body.append(root);
        const openLightbox = vi.fn();
        const blob = new Blob(['x'], { type: 'image/png' });
        await hydrateBookmarkFigures(root, {
            loadShot: async (id) => (id === 1 ? { blob } : undefined),
            openLightbox,
        });
        const [a, b] = root.querySelectorAll('figure');
        expect(a.style.getPropertyValue('--bm-fig-w')).toBe('50%');
        const img = a.querySelector('img');
        expect(img.style.width).toBe('200%');
        expect(img.style.left).toBe('-50%');
        expect(a.querySelector('.bm-fig-frame').style.aspectRatio).toBe('1');
        expect(b.querySelector('.is-missing')).not.toBeNull();
        a.querySelector('.bm-fig-frame').click();
        expect(openLightbox).toHaveBeenCalledWith([blob], 0);
    });
    it('layout without crop leaves the image in normal flow', () => {
        const fig = document.createElement('figure');
        fig.setAttribute('data-shot', '1');
        fig.innerHTML = '<div class="bm-fig-frame"><img></div>';
        layoutFigure(fig, 1.5);
        expect(fig.querySelector('img').style.width).toBe('');
    });
});

function mountEditor() {
    document.body.innerHTML =
        '<form id="bookmarkForm"><input name="bookmarkId"><input name="bookmarkTitle" value="T"><input name="bookmarkUrl"><label for="bookmarkDescription">Описание</label><textarea id="bookmarkDescription" name="bookmarkDescription"></textarea><select name="bookmarkFolder"><option value=""></option></select><div id="bookmarkScreenshotThumbnailsContainer"></div></form>';
    const form = document.querySelector('form');
    const editor = mountBookmarkRichEditor(form);
    return { form, editor };
}
const placeCaret = (node, offset) => {
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const s = document.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
};
const key = (el, k, extra = {}) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

describe('editor: images between lines', () => {
    it('inserts at the caret by splitting the paragraph, and saves a draft reference', async () => {
        const { form, editor } = mountEditor();
        editor.setContent({ description: 'Первая часть вторая часть' });
        const text = editor.editable.querySelector('p').firstChild;
        placeCaret(text, 'Первая часть '.length);
        const blob = new Blob(['img'], { type: 'image/webp' });
        await editor.inlineImages.insertBlobs([blob], { processed: true });
        const kids = Array.from(editor.editable.children).map((n) => n.tagName);
        expect(kids).toEqual(['P', 'FIGURE', 'P']);
        expect(editor.editable.firstElementChild.textContent).toBe('Первая часть ');
        expect(editor.editable.lastElementChild.textContent).toBe('вторая часть');
        const rich = form.elements.bookmarkDescriptionHtml.value;
        expect(rich).toMatch(/<figure data-shot-temp="t[a-z0-9]+" data-ratio="1.7778"><\/figure>/);
        expect(rich).not.toContain('<img');
        expect(editor.inlineImages.drafts().size).toBe(1);
        const hud = form.querySelector('.bm-fig-hud');
        expect(hud.hidden).toBe(false);
    });

    it('changes alignment and size from the panel and undoes everything step by step', async () => {
        const { form, editor } = mountEditor();
        editor.setContent({ descriptionHtml: '<p>Текст</p><figure data-shot="5"></figure><p>Ещё</p>' });
        await flush();
        const fig = editor.editable.querySelector('figure');
        fig.querySelector('.bm-fig-frame').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
        form.querySelector('[aria-label="Слева, текст обтекает справа"]').click();
        expect(form.elements.bookmarkDescriptionHtml.value).toContain('data-align="left" data-width="50"');
        form.querySelector('[aria-label="Ширина 25 %"]').click();
        expect(form.elements.bookmarkDescriptionHtml.value).toContain('data-width="25"');
        editor.undo();
        expect(form.elements.bookmarkDescriptionHtml.value).toContain('data-width="50"');
        editor.undo();
        expect(form.elements.bookmarkDescriptionHtml.value).toBe('<p>Текст</p><figure data-shot="5"></figure><p>Ещё</p>');
        editor.redo();
        expect(form.elements.bookmarkDescriptionHtml.value).toContain('data-align="left"');
        // После восстановления из истории изображение снова оформлено для редактирования.
        expect(editor.editable.querySelector('figure .bm-fig-frame img')).not.toBeNull();
    });

    it('deletes with Delete, restores with Ctrl+Z, and reports removed saved images for deletion', async () => {
        const { form, editor } = mountEditor();
        editor.setContent({ descriptionHtml: '<p>a</p><figure data-shot="8"></figure><p>b</p>' });
        await flush();
        const fig = editor.editable.querySelector('figure');
        fig.querySelector('.bm-fig-frame').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
        key(editor.editable, 'Delete');
        expect(editor.editable.querySelector('figure')).toBeNull();
        expect(editor.inlineImages.removedShotIds()).toEqual([8]);
        key(editor.editable, 'z', { code: 'KeyZ', ctrlKey: true });
        expect(editor.editable.querySelector('figure[data-shot="8"]')).not.toBeNull();
        expect(editor.inlineImages.removedShotIds()).toEqual([]);
        expect(form.elements.bookmarkDescriptionHtml.value).toContain('data-shot="8"');
    });

    it('Backspace at the start of the next line selects the image first instead of deleting it', async () => {
        const { editor } = mountEditor();
        editor.setContent({ descriptionHtml: '<p>a</p><figure data-shot="2"></figure><p>после</p>' });
        await flush();
        placeCaret(editor.editable.lastElementChild.firstChild, 0);
        key(editor.editable, 'Backspace');
        const fig = editor.editable.querySelector('figure');
        expect(fig).not.toBeNull();
        expect(fig.classList.contains('is-selected')).toBe(true);
        key(editor.editable, 'Backspace');
        expect(editor.editable.querySelector('figure')).toBeNull();
    });

    it('typing while an image is selected moves the caret below it and never replaces the image', async () => {
        const { editor } = mountEditor();
        editor.setContent({ descriptionHtml: '<figure data-shot="2"></figure>' });
        await flush();
        const fig = editor.editable.querySelector('figure');
        fig.querySelector('.bm-fig-frame').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
        key(editor.editable, 'x');
        expect(editor.editable.querySelector('figure')).not.toBeNull();
        const sel = document.getSelection().getRangeAt(0);
        expect(fig.nextElementSibling.contains(sel.startContainer) || sel.startContainer === fig.nextElementSibling).toBe(true);
    });

    it('pastes an image from the clipboard inline without also adding it to the gallery', async () => {
        const { form, editor } = mountEditor();
        editor.setContent({ description: 'x' });
        placeCaret(editor.editable.querySelector('p').firstChild, 1);
        const file = new File(['p'], 'shot.png', { type: 'image/png' });
        const formPaste = vi.fn();
        form.addEventListener('paste', formPaste);
        const evt = new Event('paste', { bubbles: true, cancelable: true });
        evt.clipboardData = {
            items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
            files: [file],
            getData: () => '',
        };
        editor.editable.dispatchEvent(evt);
        expect(evt.defaultPrevented).toBe(true);
        expect(formPaste).not.toHaveBeenCalled();
    });

    it('drops pasted figures that reference images of other bookmarks', () => {
        const { editor } = mountEditor();
        editor.setContent({ descriptionHtml: '<figure data-shot="3"></figure>' });
        const out = editor.inlineImages.filterPastedHtml('<figure data-shot="3"></figure><figure data-shot="99"></figure>');
        expect(out).toContain('data-shot="3"');
        expect(out).not.toContain('data-shot="99"');
    });

    it('hides gallery thumbnails of images that live in the text', () => {
        const { form, editor } = mountEditor();
        const thumbs = form.querySelector('#bookmarkScreenshotThumbnailsContainer');
        thumbs.innerHTML =
            '<div class="screenshot-thumbnail existing" data-existing-id="3"></div><div class="screenshot-thumbnail existing" data-existing-id="4"></div>';
        editor.setContent({ descriptionHtml: '<figure data-shot="3"></figure><p>x</p>' });
        editor.inlineImages.refreshGallery();
        expect(thumbs.children[0].hidden).toBe(true);
        expect(thumbs.children[1].hidden).toBe(false);
    });
});

describe('save transaction with inline images', () => {
    let db;
    const readAll = (store) =>
        new Promise((resolve, reject) => {
            const r = db.transaction(store).objectStore(store).getAll();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    beforeEach(async () => {
        const factory = new IDBFactory();
        db = await new Promise((resolve, reject) => {
            const r = factory.open('bookmark-inline', 1);
            r.onupgradeneeded = () => {
                r.result.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
                r.result.createObjectStore('screenshots', { keyPath: 'id', autoIncrement: true });
            };
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
        State.db = db;
        setBookmarksFormDependencies({
            State,
            ARCHIVE_FOLDER_ID: 'archive',
            showNotification: vi.fn(),
            addPdfRecords: vi.fn(),
            updateSearchIndex: vi.fn().mockResolvedValue(),
            loadBookmarks: vi.fn().mockResolvedValue(),
            filterBookmarks: vi.fn().mockResolvedValue(),
            getVisibleModals: () => [],
        });
    });
    afterEach(() => {
        db.close();
        State.db = null;
    });

    it('stores an image-only note: draft becomes a screenshot record and the text references its real id', async () => {
        const { form, editor } = mountEditor();
        const modal = document.createElement('div');
        modal.id = 'bookmarkModal';
        const save = document.createElement('button');
        save.id = 'saveBookmarkBtn';
        document.body.append(modal);
        modal.append(form, save);
        editor.setContent({});
        await editor.inlineImages.insertBlobs([new Blob(['img'], { type: 'image/webp' })], { processed: true });
        await handleBookmarkFormSubmit({ target: form, preventDefault() {} });
        const [bookmark] = await readAll('bookmarks');
        const shots = await readAll('screenshots');
        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({ parentId: bookmark.id, parentType: 'bookmark' });
        expect(bookmark.screenshotIds).toEqual([shots[0].id]);
        expect(bookmark.descriptionHtml).toBe(`<figure data-shot="${shots[0].id}" data-ratio="1.7778"></figure>`);
        expect(bookmark.description).toBeNull();
    });
});
