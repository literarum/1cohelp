'use strict';

/**
 * Изображения внутри текста закладки (режим создания/редактирования).
 *
 * Модель: изображение — блок <figure> между строками текста. В живом редакторе figure
 * не редактируется как текст (contenteditable=false), а подпись внутри — редактируется.
 * Всё «оформление редактора» (рамка, <img>, ручки) помечено data-bm-ui и при синхронизации
 * отбрасывается санитайзером, поэтому сохранённая разметка остаётся компактной и безопасной.
 *
 * Принципы:
 *  - вставка там, где курсор (абзац аккуратно делится), или между блоками при перетаскивании;
 *  - всё, что делается с изображением, отменяется (Ctrl+Z) — история общая с текстом;
 *  - ничто не удаляет изображение «случайно»: набор текста при выделенном изображении
 *    переносит курсор под него, Backspace сначала выделяет изображение, потом удаляет;
 *  - черновики (ещё не сохранённые файлы) живут в памяти до сохранения или закрытия формы.
 */

import {
    FIGURE_MIN_WIDTH,
    buildFigureElement,
    readFigureModel,
} from './bookmark-rich-text.js';
import { FIGURE_SELECTOR, figureKey, layoutFigure } from './bookmark-inline-images.js';
import { openBookmarkImageCrop } from './bookmark-image-crop.js';

const TEXT_BLOCK = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE)$/;
const SIZE_PRESETS = [25, 50, 75, 100];
const SNAP = [25, 33, 50, 66, 75, 100];
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/bmp';

const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
};
const icon = (name) => {
    const i = make('i', `fas ${name}`);
    i.setAttribute('aria-hidden', 'true');
    return i;
};
const isImageFile = (f) => f && /^image\//.test(f.type);
export function imageFilesFrom(dt) {
    if (!dt) return [];
    const fromItems = Array.from(dt.items || [])
        .filter((i) => i.kind === 'file' && /^image\//.test(i.type))
        .map((i) => i.getAsFile())
        .filter(Boolean);
    return fromItems.length ? fromItems : Array.from(dt.files || []).filter(isImageFile);
}
const dragHasFiles = (dt) =>
    !!dt && Array.from(dt.types || []).includes('Files');
const newTempKey = () =>
    't' +
    (typeof crypto !== 'undefined' && crypto.getRandomValues
        ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('')
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    )
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 24)
        .padEnd(8, '0');

export function isEmptyBlock(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    return (
        !el.textContent.replace(/[​ ]/g, '').trim() &&
        !el.querySelector('figure,img,table,hr,ul,ol')
    );
}

/** Размер исходника; повреждённый файл не должен «подвесить» вставку — ждём не дольше 5 с. */
function loadImageSize(url) {
    return new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => resolve(null), 5000);
        img.onload = () => {
            clearTimeout(timer);
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = url;
    });
}

/**
 * @param {object} ctx
 * @param {HTMLFormElement} ctx.form
 * @param {HTMLElement} ctx.host — обёртка редактора (position: relative)
 * @param {HTMLElement} ctx.editable
 * @param {(msg:string)=>void} ctx.say — сообщение в строке состояния
 * @param {()=>Range|null} ctx.getRange — запомненная позиция курсора
 * @param {(r:Range|null)=>void} ctx.setRange
 * @param {(kind?:string)=>void} ctx.commit — синхронизация + шаг истории
 * @param {(blob:Blob)=>Promise<Blob>} [ctx.processImage]
 * @param {(id:number)=>Promise<object>} [ctx.loadShot]
 */
export function attachBookmarkInlineImages(ctx) {
    const { form, host, editable, say, getRange, setRange, commit } = ctx;
    const processImage =
        ctx.processImage ||
        (async (blob) => (await import('./screenshots.js')).processImageFile(blob));
    const loadShot =
        ctx.loadShot ||
        (async (id) => (await import('../db/indexeddb.js')).getFromIndexedDB('screenshots', id));

    /** key → { blob, url } ; key = 'id:N' (сохранённое) или 't…' (черновик) */
    const registry = new Map();
    const pending = new Map();
    const drafts = new Map();
    /** ID сохранённых изображений, которые принадлежат тексту (были в нём или перенесены из вложений). */
    let owned = new Set();
    let selected = null;
    let dragging = null;
    let busy = 0;

    // ------------------------------------------------------------------ реестр изображений
    function entryFor(key) {
        if (registry.has(key)) return Promise.resolve(registry.get(key));
        if (pending.has(key)) return pending.get(key);
        const promise = (async () => {
            let blob = null;
            if (key.startsWith('id:')) {
                try {
                    const rec = await loadShot(Number(key.slice(3)));
                    blob = rec?.blob instanceof Blob ? rec.blob : null;
                } catch (e) {
                    console.warn('[bookmark-image-editor] загрузка изображения', key, e);
                }
            } else blob = drafts.get(key) || null;
            const entry = blob ? { blob, url: URL.createObjectURL(blob) } : null;
            if (entry) registry.set(key, entry);
            pending.delete(key);
            return entry;
        })();
        pending.set(key, promise);
        return promise;
    }
    function remember(key, blob) {
        const old = registry.get(key);
        if (old) URL.revokeObjectURL(old.url);
        const entry = { blob, url: URL.createObjectURL(blob) };
        registry.set(key, entry);
        return entry;
    }
    function releaseAll() {
        for (const { url } of registry.values()) {
            try {
                URL.revokeObjectURL(url);
            } catch {
                /* ignore */
            }
        }
        registry.clear();
        pending.clear();
    }

    // ------------------------------------------------------------------ структура документа
    const figures = () => Array.from(editable.querySelectorAll(FIGURE_SELECTOR));
    const topBlock = (node) => {
        let n = node;
        while (n && n.parentNode !== editable) n = n.parentNode;
        return n && n.parentNode === editable ? n : null;
    };
    const slot = () => {
        const p = make('p');
        p.dataset.bmSlot = '1';
        p.append(make('br'));
        return p;
    };
    /** Около изображения всегда есть строка, куда можно поставить курсор. */
    function ensureSlots({ cleanup = false } = {}) {
        if (cleanup)
            editable.querySelectorAll(':scope > p[data-bm-slot]').forEach((p) => {
                if (isEmptyBlock(p)) p.remove();
            });
        for (const fig of editable.querySelectorAll(':scope > figure')) {
            const next = fig.nextElementSibling;
            if (!next || next.tagName === 'FIGURE') fig.after(slot());
            if (!fig.previousElementSibling) fig.before(slot());
        }
    }
    /** figure внутри абзаца (после вставки HTML) поднимается на уровень блоков. */
    function hoist(fig) {
        const parent = fig.parentElement;
        if (!parent || parent === editable || !TEXT_BLOCK.test(parent.tagName)) return;
        if (parent.parentElement !== editable) return;
        const tail = parent.cloneNode(false);
        while (fig.nextSibling) tail.append(fig.nextSibling);
        parent.after(fig);
        if (!isEmptyBlock(tail)) fig.after(tail);
        if (isEmptyBlock(parent)) parent.remove();
    }

    function decorate(fig) {
        hoist(fig);
        fig.querySelectorAll(':scope > [data-bm-ui]').forEach((n) => n.remove());
        fig.contentEditable = 'false';
        fig.draggable = false;
        fig.classList.add('bm-fig-edit');
        const frame = make('div', 'bm-fig-frame');
        frame.dataset.bmUi = '1';
        frame.draggable = true;
        frame.title = 'Нажмите, чтобы настроить. Перетащите, чтобы переместить.';
        const img = make('img');
        img.alt = readFigureModel(fig).alt || '';
        img.draggable = false;
        frame.append(img);
        fig.prepend(frame);
        for (const side of ['w', 'e']) {
            const h = make('span', `bm-fig-resize bm-fig-resize--${side}`);
            h.dataset.bmUi = '1';
            h.dataset.side = side;
            h.setAttribute('aria-hidden', 'true');
            fig.append(h);
        }
        const badge = make('span', 'bm-fig-badge');
        badge.dataset.bmUi = '1';
        badge.setAttribute('aria-hidden', 'true');
        fig.append(badge);
        const cap = fig.querySelector(':scope > figcaption');
        if (cap) prepareCaption(cap);
        layoutFigure(fig);
        const key = figureKey(fig);
        entryFor(key).then((entry) => {
            if (!fig.isConnected || figureKey(fig) !== key) return;
            if (!entry) {
                frame.classList.add('is-missing');
                frame.replaceChildren(make('span', 'bm-fig-missing', 'Изображение недоступно'));
                return;
            }
            img.onload = () => {
                if (img.naturalHeight) fig._bmNaturalRatio = img.naturalWidth / img.naturalHeight;
                layoutFigure(fig);
                if (fig === selected) positionHud();
            };
            img.src = entry.url;
        });
    }
    function prepareCaption(cap) {
        cap.contentEditable = 'true';
        cap.dataset.placeholder = 'Подпись';
        cap.setAttribute('aria-label', 'Подпись к изображению');
    }
    function decorateAll() {
        hideHud();
        selected = null;
        figures().forEach(decorate);
        ensureSlots();
    }

    // ------------------------------------------------------------------ курсор
    function caretTo(block, atEnd = false) {
        if (!block) return;
        const range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(!atEnd);
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        setRange(range.cloneRange());
    }
    /** newLine: Enter открывает новую пустую строку под изображением (как в Заметках), а не прыгает в следующий абзац. */
    function caretAfter(fig, { newLine = false } = {}) {
        let next = fig.nextElementSibling;
        if (
            !next ||
            next.tagName === 'FIGURE' ||
            !TEXT_BLOCK.test(next.tagName) ||
            (newLine && !isEmptyBlock(next))
        ) {
            next = slot();
            fig.after(next);
        }
        deselect();
        editable.focus({ preventScroll: true });
        caretTo(next, false);
    }
    function caretBefore(fig) {
        let prev = fig.previousElementSibling;
        if (!prev || prev.tagName === 'FIGURE' || !TEXT_BLOCK.test(prev.tagName)) {
            prev = slot();
            fig.before(prev);
        }
        deselect();
        editable.focus({ preventScroll: true });
        caretTo(prev, true);
    }
    const fragmentEmpty = (range) => {
        const frag = range.cloneContents();
        return (
            !frag.textContent.replace(/[​]/g, '').length &&
            !frag.querySelector?.('figure,img,table,hr')
        );
    };
    function caretEdge(range, block, edge) {
        const r = document.createRange();
        if (edge === 'start') {
            r.setStart(block, 0);
            r.setEnd(range.startContainer, range.startOffset);
            return fragmentEmpty(r) && !r.cloneContents().querySelector?.('br');
        }
        r.setStart(range.endContainer, range.endOffset);
        r.setEnd(block, block.childNodes.length);
        return fragmentEmpty(r);
    }

    /** Вставка блока в позицию курсора: выделенный текст заменяется, абзац делится. */
    function placeAtCaret(fig) {
        const range = getRange();
        if (!range || !editable.contains(range.startContainer)) {
            editable.append(fig);
            return;
        }
        if (!range.collapsed) range.deleteContents();
        if (range.startContainer === editable) {
            editable.insertBefore(fig, editable.childNodes[range.startOffset] || null);
            return;
        }
        const block = topBlock(range.startContainer);
        if (!block) {
            editable.append(fig);
            return;
        }
        if (block.nodeType !== Node.ELEMENT_NODE || !TEXT_BLOCK.test(block.tagName)) {
            block.after(fig);
            return;
        }
        const tailRange = document.createRange();
        tailRange.setStart(range.startContainer, range.startOffset);
        tailRange.setEnd(block, block.childNodes.length);
        const tail = block.cloneNode(false);
        tail.removeAttribute('data-bm-slot');
        tail.append(tailRange.extractContents());
        if (isEmptyBlock(block)) block.replaceWith(fig);
        else block.after(fig);
        if (!isEmptyBlock(tail)) fig.after(tail);
    }

    // ------------------------------------------------------------------ выделение
    function select(fig, { native = true } = {}) {
        if (!fig || !editable.contains(fig)) return;
        if (selected && selected !== fig) selected.classList.remove('is-selected');
        selected = fig;
        fig.classList.add('is-selected');
        if (native) {
            editable.focus({ preventScroll: true });
            const range = document.createRange();
            range.selectNode(fig);
            const sel = document.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            setRange(range.cloneRange());
        }
        showHud();
    }
    function deselect() {
        if (selected) selected.classList.remove('is-selected');
        selected = null;
        hideHud();
    }
    function onSelectionChange() {
        if (!selected) return;
        const sel = document.getSelection();
        if (!sel?.rangeCount) return;
        const r = sel.getRangeAt(0);
        const cap = selected.querySelector(':scope > figcaption');
        if (cap?.contains(r.startContainer)) return;
        const wholeFigure =
            r.startContainer === selected.parentNode &&
            r.startOffset <= Array.prototype.indexOf.call(selected.parentNode.childNodes, selected) &&
            r.endOffset > Array.prototype.indexOf.call(selected.parentNode.childNodes, selected);
        if (!wholeFigure && !hud.contains(document.activeElement)) deselect();
    }

    // ------------------------------------------------------------------ плавающая панель
    const hud = make('div', 'bm-fig-hud');
    hud.setAttribute('role', 'toolbar');
    hud.setAttribute('aria-label', 'Настройки изображения');
    hud.hidden = true;
    const hudRow = make('div', 'bm-fig-hud-row');
    const altRow = make('div', 'bm-fig-hud-alt');
    altRow.hidden = true;
    hud.append(hudRow, altRow);
    const hudButtons = {};
    const hudGroup = (label) => {
        const g = make('div', 'bm-fig-hud-group');
        g.setAttribute('role', 'group');
        g.setAttribute('aria-label', label);
        hudRow.append(g);
        return g;
    };
    const hudButton = (g, id, label, content, fn) => {
        const b = make('button', 'bm-fig-hud-btn');
        b.type = 'button';
        b.title = label;
        b.setAttribute('aria-label', label);
        if (typeof content === 'string' && content.startsWith('fa-')) b.append(icon(content));
        else b.append(make('span', 'bm-fig-hud-text', content));
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', (e) => {
            e.preventDefault();
            if (selected) fn(selected);
        });
        g.append(b);
        hudButtons[id] = b;
        return b;
    };
    const alignG = hudGroup('Положение');
    hudButton(alignG, 'align-left', 'Слева, текст обтекает справа', 'fa-align-left', (f) => setAlign(f, 'left'));
    hudButton(alignG, 'align-center', 'По центру', 'fa-align-center', (f) => setAlign(f, 'center'));
    hudButton(alignG, 'align-right', 'Справа, текст обтекает слева', 'fa-align-right', (f) => setAlign(f, 'right'));
    hudButton(alignG, 'align-wide', 'Во всю ширину', 'fa-arrows-alt-h', (f) => setAlign(f, 'wide'));
    const sizeG = hudGroup('Размер');
    for (const p of SIZE_PRESETS)
        hudButton(sizeG, `size-${p}`, `Ширина ${p} %`, `${p}%`, (f) => setWidth(f, p));
    const editG = hudGroup('Изменение');
    hudButton(editG, 'crop', 'Кадрировать', 'fa-crop-alt', (f) => crop(f));
    hudButton(editG, 'caption', 'Подпись под изображением', 'fa-closed-captioning', (f) => toggleCaption(f));
    hudButton(editG, 'alt', 'Описание для экранного диктора (alt)', 'fa-universal-access', () => toggleAlt());
    hudButton(editG, 'replace', 'Заменить изображение', 'fa-sync-alt', (f) => pickFiles((files) => replace(f, files[0]), false));
    const moveG = hudGroup('Порядок и просмотр');
    hudButton(moveG, 'up', 'Переместить выше (Alt+↑)', 'fa-arrow-up', (f) => move(f, -1));
    hudButton(moveG, 'down', 'Переместить ниже (Alt+↓)', 'fa-arrow-down', (f) => move(f, 1));
    hudButton(moveG, 'view', 'Открыть в полноэкранном просмотре', 'fa-search-plus', (f) => view(f));
    const delG = hudGroup('Удаление');
    hudButton(delG, 'delete', 'Удалить изображение (Delete)', 'fa-trash-alt', (f) => remove(f)).classList.add('is-danger');

    const altInput = make('input', 'bm-fig-hud-input');
    altInput.type = 'text';
    altInput.maxLength = 300;
    altInput.placeholder = 'Что изображено — для экранного диктора и поиска';
    altInput.setAttribute('aria-label', 'Описание изображения');
    const altDone = make('button', 'bm-fig-hud-btn bm-fig-hud-btn--wide', 'Готово');
    altDone.type = 'button';
    altRow.append(altInput, altDone);
    const applyAlt = () => {
        if (!selected) return;
        const value = altInput.value.replace(/\s+/g, ' ').trim();
        if (value) selected.setAttribute('data-alt', value);
        else selected.removeAttribute('data-alt');
        const img = selected.querySelector('.bm-fig-frame img');
        if (img) img.alt = value;
        altRow.hidden = true;
        hudButtons.alt.setAttribute('aria-expanded', 'false');
        commit('op');
        select(selected);
        say(value ? 'Описание изображения сохранено.' : 'Описание изображения удалено.');
    };
    altDone.addEventListener('click', applyAlt);
    altInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyAlt();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            altRow.hidden = true;
            if (selected) select(selected);
        }
    });
    function toggleAlt() {
        altRow.hidden = !altRow.hidden;
        hudButtons.alt.setAttribute('aria-expanded', String(!altRow.hidden));
        if (!altRow.hidden) {
            altInput.value = selected?.getAttribute('data-alt') || '';
            positionHud();
            altInput.focus();
        }
    }

    function syncHudState() {
        if (!selected) return;
        const m = readFigureModel(selected);
        for (const a of ['left', 'center', 'right', 'wide'])
            hudButtons[`align-${a}`].setAttribute('aria-pressed', String(m.align === a));
        for (const p of SIZE_PRESETS) {
            hudButtons[`size-${p}`].setAttribute('aria-pressed', String(m.align !== 'wide' && m.width === p));
            hudButtons[`size-${p}`].disabled = m.align === 'wide' && p !== 100;
        }
        hudButtons.crop.setAttribute('aria-pressed', String(!!m.crop));
        hudButtons.caption.setAttribute('aria-pressed', String(!!selected.querySelector(':scope > figcaption')));
        hudButtons.alt.setAttribute('aria-pressed', String(!!m.alt));
        hudButtons.up.disabled = !prevFigureSibling(selected);
        hudButtons.down.disabled = !nextFigureSibling(selected);
    }
    function showHud() {
        hud.hidden = false;
        altRow.hidden = true;
        syncHudState();
        positionHud();
    }
    function hideHud() {
        hud.hidden = true;
        altRow.hidden = true;
    }
    function positionHud() {
        if (!selected || hud.hidden) return;
        const hr = host.getBoundingClientRect();
        const er = editable.getBoundingClientRect();
        const fr = selected.querySelector('.bm-fig-frame')?.getBoundingClientRect() || selected.getBoundingClientRect();
        const visible = fr.bottom > er.top + 8 && fr.top < er.bottom - 8;
        hud.classList.toggle('is-offscreen', !visible);
        const hw = hud.offsetWidth;
        const hh = hud.offsetHeight;
        let top = fr.top - hr.top - hh - 10;
        if (fr.top - hh - 10 < er.top) top = Math.max(er.top - hr.top + 6, fr.top - hr.top + 8);
        if (top + hh > er.bottom - hr.top) top = er.bottom - hr.top - hh - 6;
        let left = fr.left - hr.left + fr.width / 2 - hw / 2;
        left = Math.max(6, Math.min(left, hr.width - hw - 6));
        hud.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    // ------------------------------------------------------------------ операции
    const prevFigureSibling = (f) => (f.parentNode === editable ? f.previousElementSibling : null);
    const nextFigureSibling = (f) => (f.parentNode === editable ? f.nextElementSibling : null);

    function afterChange(fig, message) {
        layoutFigure(fig);
        commit('op');
        if (fig.isConnected) select(fig);
        if (message) say(message);
    }
    function setAlign(fig, align) {
        if (align === 'center' || align === 'wide') fig.removeAttribute('data-align');
        if (align !== 'center') fig.setAttribute('data-align', align);
        if (align === 'wide') fig.removeAttribute('data-width');
        else if ((align === 'left' || align === 'right') && readFigureModel(fig).width > 60)
            fig.setAttribute('data-width', '50'); // обтекание имеет смысл, если рядом остаётся место для текста
        const names = { left: 'слева с обтеканием', center: 'по центру', right: 'справа с обтеканием', wide: 'во всю ширину' };
        afterChange(fig, `Изображение ${names[align]}.`);
    }
    function setWidth(fig, width) {
        const w = Math.round(Math.max(FIGURE_MIN_WIDTH, Math.min(100, width)));
        if (readFigureModel(fig).align === 'wide') fig.removeAttribute('data-align');
        if (w === 100) fig.removeAttribute('data-width');
        else fig.setAttribute('data-width', String(w));
        afterChange(fig, `Ширина изображения ${w} %.`);
    }
    function move(fig, dir) {
        const sibling = dir < 0 ? prevFigureSibling(fig) : nextFigureSibling(fig);
        if (!sibling) return;
        if (dir < 0) sibling.before(fig);
        else sibling.after(fig);
        ensureSlots({ cleanup: true });
        fig.scrollIntoView?.({ block: 'nearest' });
        afterChange(fig, dir < 0 ? 'Изображение перемещено выше.' : 'Изображение перемещено ниже.');
    }
    function remove(fig) {
        const prev = fig.previousElementSibling;
        const next = fig.nextElementSibling;
        deselect();
        fig.remove();
        ensureSlots({ cleanup: true });
        editable.focus({ preventScroll: true });
        if (next?.isConnected && TEXT_BLOCK.test(next.tagName)) caretTo(next, false);
        else if (prev?.isConnected && TEXT_BLOCK.test(prev.tagName)) caretTo(prev, true);
        else if (!editable.firstElementChild) {
            const p = slot();
            editable.append(p);
            caretTo(p);
        }
        commit('op');
        refreshGallery();
        say('Изображение удалено. Ctrl+Z — вернуть.');
    }
    function toggleCaption(fig) {
        const cap = fig.querySelector(':scope > figcaption');
        if (cap) {
            cap.remove();
            afterChange(fig, 'Подпись убрана.');
            return;
        }
        const c = make('figcaption');
        prepareCaption(c);
        fig.querySelector(':scope > .bm-fig-badge')?.before(c);
        commit('op');
        select(fig, { native: false });
        const range = document.createRange();
        range.selectNodeContents(c);
        range.collapse(true);
        c.focus();
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        say('Введите подпись. Enter — продолжить текст под изображением.');
    }
    async function crop(fig) {
        const entry = await entryFor(figureKey(fig));
        if (!entry) return say('Изображение недоступно для кадрирования.');
        const model = readFigureModel(fig);
        const result = await openBookmarkImageCrop({
            src: entry.url,
            crop: model.crop,
            ratio: model.ratio || fig._bmNaturalRatio,
        });
        if (result === undefined || !fig.isConnected) {
            if (fig.isConnected) select(fig);
            return;
        }
        if (!model.ratio && fig._bmNaturalRatio)
            fig.setAttribute('data-ratio', String(Math.round(fig._bmNaturalRatio * 10000) / 10000));
        if (result) {
            const r4 = (n) => Math.round(n * 10000) / 10000;
            fig.setAttribute('data-crop', [result.x, result.y, result.w, result.h].map(r4).join(','));
        } else fig.removeAttribute('data-crop');
        afterChange(fig, result ? 'Кадр применён. Исходное изображение сохранено.' : 'Кадрирование сброшено.');
    }
    function view(fig) {
        const list = figures();
        const blobs = [];
        let index = 0;
        for (const f of list) {
            const entry = registry.get(figureKey(f));
            if (!entry) continue;
            if (f === fig) index = blobs.length;
            blobs.push(entry.blob);
        }
        const open = typeof window !== 'undefined' ? window.openLightbox : null;
        if (typeof open === 'function' && blobs.length) open(blobs, index);
        else say('Просмотр изображений сейчас недоступен.');
    }

    // ------------------------------------------------------------------ вставка
    function defaultWidth(px) {
        const cs = getComputedStyle(editable);
        const content =
            editable.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        if (!content || !px) return 100;
        const cssPx = px / Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
        const pct = Math.round(((cssPx / content) * 100) / 5) * 5;
        return Math.max(25, Math.min(100, pct));
    }
    async function makeFigure(model, blobForKey) {
        const key = model.shot ? `id:${model.shot}` : model.temp;
        const entry = blobForKey ? remember(key, blobForKey) : await entryFor(key);
        const size = entry ? await loadImageSize(entry.url) : null;
        if (size?.w && size?.h) {
            model.ratio = size.w / size.h;
            model.width = defaultWidth(size.w);
        }
        return buildFigureElement({ align: 'center', width: 100, ...model });
    }
    function insertFigures(list, target) {
        if (!list.length) return;
        editable.focus({ preventScroll: true });
        let anchor = null;
        for (const fig of list) {
            if (anchor) anchor.after(fig);
            else if (target) editable.insertBefore(fig, target.ref);
            else placeAtCaret(fig);
            anchor = fig;
            decorate(fig);
        }
        ensureSlots();
        commit('op');
        refreshGallery();
        select(anchor);
        anchor.scrollIntoView?.({ block: 'nearest' });
    }
    /** Новые файлы: сжатие тем же конвейером, что и у скриншотов, затем вставка черновиков. */
    async function insertBlobs(blobs, { target = null, processed = false } = {}) {
        const files = Array.from(blobs || []).filter((b) => b instanceof Blob);
        if (!files.length) return [];
        busy++;
        host.classList.add('is-busy');
        say(files.length > 1 ? `Обработка изображений: ${files.length}…` : 'Обработка изображения…');
        const made = [];
        try {
            for (const file of files) {
                try {
                    const blob = processed ? file : await processImage(file);
                    if (!(blob instanceof Blob)) throw new Error('Пустой результат обработки');
                    const key = newTempKey();
                    drafts.set(key, blob);
                    made.push(await makeFigure({ temp: key }, blob));
                } catch (e) {
                    console.error('[bookmark-image-editor] обработка изображения', e);
                    say(`Не удалось добавить изображение: ${e.message || 'ошибка обработки'}.`);
                }
            }
            const ready = made.filter(Boolean);
            insertFigures(ready, target);
            if (ready.length)
                say(
                    ready.length > 1
                        ? `Добавлено изображений: ${ready.length}. Выберите изображение, чтобы настроить его.`
                        : 'Изображение добавлено. Перетащите его или используйте панель над ним.',
                );
            return ready;
        } finally {
            busy--;
            if (!busy) host.classList.remove('is-busy');
        }
    }
    /** Перенос сохранённого вложения из галереи в текст. */
    async function insertExistingShot(id) {
        const shot = Number(id);
        if (!Number.isInteger(shot) || shot <= 0) return null;
        owned.add(shot);
        const fig = await makeFigure({ shot });
        insertFigures([fig], null);
        say('Изображение перенесено из вложений в текст.');
        return fig;
    }
    async function replace(fig, file) {
        if (!file) return;
        try {
            busy++;
            const blob = await processImage(file);
            const key = newTempKey();
            drafts.set(key, blob);
            const next = await makeFigure({ temp: key, ...pickLayout(readFigureModel(fig)) }, blob);
            if (!fig.isConnected || !next) return;
            fig.replaceWith(next);
            decorate(next);
            commit('op');
            refreshGallery();
            select(next);
            say('Изображение заменено.');
        } catch (e) {
            say(`Не удалось заменить изображение: ${e.message || 'ошибка обработки'}.`);
        } finally {
            busy--;
        }
    }
    const pickLayout = (m) => ({ align: m.align, alt: m.alt, caption: m.caption });

    const picker = make('input');
    picker.type = 'file';
    picker.accept = ACCEPT;
    picker.hidden = true;
    picker.tabIndex = -1;
    picker.className = 'bm-fig-picker';
    host.append(picker);
    let onPicked = null;
    picker.addEventListener('change', () => {
        const files = Array.from(picker.files || []).filter(isImageFile);
        picker.value = '';
        const cb = onPicked;
        onPicked = null;
        if (files.length && cb) cb(files);
    });
    function pickFiles(cb, multiple = true) {
        onPicked = cb;
        picker.multiple = multiple;
        // Диалог выбора файла не должен закрывать модальные окна, в которых живёт редактор.
        const modal = form.closest('[id$="Modal"]');
        if (modal) {
            modal.dataset.fileDialogOpen = '1';
            const clear = () => {
                setTimeout(() => delete modal.dataset.fileDialogOpen, 300);
                window.removeEventListener('focus', clear);
            };
            window.addEventListener('focus', clear);
        }
        picker.click();
    }

    // ------------------------------------------------------------------ изменение размера
    let resizing = null;
    function onResizeDown(e) {
        const handle = e.target.closest?.('.bm-fig-resize');
        if (!handle) return;
        const fig = handle.closest('figure');
        e.preventDefault();
        e.stopPropagation();
        select(fig);
        const cs = getComputedStyle(editable);
        const content =
            editable.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        const model = readFigureModel(fig);
        if (model.align === 'wide') fig.removeAttribute('data-align');
        resizing = {
            fig,
            side: handle.dataset.side,
            x: e.clientX,
            startPx: (fig.querySelector('.bm-fig-frame') || fig).getBoundingClientRect().width,
            content: content || 1,
            factor: model.align === 'center' || model.align === 'wide' ? 2 : 1,
            align: model.align === 'wide' ? 'center' : model.align,
            width: model.width,
        };
        fig.classList.add('is-resizing');
        handle.setPointerCapture?.(e.pointerId);
    }
    function onResizeMove(e) {
        if (!resizing) return;
        const { fig, side, x, startPx, content, factor } = resizing;
        // Тянем от изображения — больше, к нему — меньше; по центру растёт в обе стороны.
        const dx = side === 'w' ? x - e.clientX : e.clientX - x;
        let pct = ((startPx + dx * factor) / content) * 100;
        pct = Math.max(FIGURE_MIN_WIDTH, Math.min(100, pct));
        const snap = SNAP.find((s) => Math.abs(s - pct) < 2.2);
        pct = snap ?? Math.round(pct);
        resizing.width = pct;
        if (pct === 100) fig.removeAttribute('data-width');
        else fig.setAttribute('data-width', String(pct));
        layoutFigure(fig);
        const badge = fig.querySelector('.bm-fig-badge');
        if (badge) badge.textContent = `${pct} %`;
        positionHud();
    }
    function onResizeUp() {
        if (!resizing) return;
        const { fig, width } = resizing;
        resizing = null;
        fig.classList.remove('is-resizing');
        afterChange(fig, `Ширина изображения ${width} %.`);
    }

    // ------------------------------------------------------------------ перетаскивание
    const indicator = make('div', 'bm-fig-drop');
    indicator.hidden = true;
    indicator.setAttribute('aria-hidden', 'true');
    host.append(indicator);
    function dropTarget(clientY) {
        const kids = Array.from(editable.children).filter((k) => k !== dragging);
        for (const kid of kids) {
            const r = kid.getBoundingClientRect();
            if (clientY < r.top + r.height / 2) return { ref: kid, y: r.top };
        }
        const last = kids[kids.length - 1];
        return { ref: null, y: last ? last.getBoundingClientRect().bottom : editable.getBoundingClientRect().top + 12 };
    }
    function showIndicator(target) {
        const hr = host.getBoundingClientRect();
        const er = editable.getBoundingClientRect();
        const cs = getComputedStyle(editable);
        const y = Math.max(er.top + 2, Math.min(target.y, er.bottom - 2));
        indicator.hidden = false;
        indicator.style.top = `${Math.round(y - hr.top - 1)}px`;
        indicator.style.left = `${Math.round(er.left - hr.left + parseFloat(cs.paddingLeft || 0))}px`;
        indicator.style.width = `${Math.round(editable.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0))}px`;
    }
    const hideIndicator = () => {
        indicator.hidden = true;
    };
    function onDragStart(e) {
        const frame = e.target.closest?.('.bm-fig-frame');
        const fig = frame?.closest('figure');
        if (!fig || !editable.contains(fig)) return;
        dragging = fig;
        select(fig, { native: false });
        hideHud();
        fig.classList.add('is-dragging');
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-bookmark-figure', figureKey(fig));
            e.dataTransfer.setData('text/plain', '');
            e.dataTransfer.setDragImage?.(frame, frame.offsetWidth / 2, 16);
        } catch {
            /* старые браузеры */
        }
    }
    function onDragOver(e) {
        if (!dragging && !dragHasFiles(e.dataTransfer)) return false;
        e.preventDefault();
        e.dataTransfer.dropEffect = dragging ? 'move' : 'copy';
        showIndicator(dropTarget(e.clientY));
        return true;
    }
    /** @returns {boolean} обработано ли событие */
    function onDrop(e) {
        if (dragging) {
            e.preventDefault();
            const fig = dragging;
            const target = dropTarget(e.clientY);
            cleanupDrag();
            if (target.ref !== fig && target.ref !== fig.nextElementSibling) {
                editable.insertBefore(fig, target.ref);
                ensureSlots({ cleanup: true });
                afterChange(fig, 'Изображение перемещено.');
            } else select(fig);
            return true;
        }
        const files = imageFilesFrom(e.dataTransfer);
        hideIndicator();
        if (!files.length) return false;
        e.preventDefault();
        e.stopPropagation();
        insertBlobs(files, { target: dropTarget(e.clientY) });
        return true;
    }
    function cleanupDrag() {
        dragging?.classList.remove('is-dragging');
        dragging = null;
        hideIndicator();
    }
    function onDragLeave(e) {
        if (!editable.contains(e.relatedTarget)) hideIndicator();
    }

    // ------------------------------------------------------------------ мышь и клавиатура
    function onMouseDown(e) {
        if (e.target.closest?.('.bm-fig-resize')) return;
        const fig = e.target.closest?.(FIGURE_SELECTOR);
        if (!fig || !editable.contains(fig)) return;
        if (e.target.closest('figcaption')) {
            select(fig, { native: false });
            return;
        }
        if (e.button === 0 && e.detail > 1) {
            e.preventDefault();
            view(fig);
            return;
        }
        // Нажатие по изображению выделяет его целиком (без каретки внутри).
        if (e.button === 0) {
            const frame = e.target.closest('.bm-fig-frame');
            if (!frame) e.preventDefault();
            select(fig);
        }
    }
    function onClick(e) {
        const fig = e.target.closest?.(FIGURE_SELECTOR);
        if (fig && editable.contains(fig) && !e.target.closest('figcaption')) {
            e.preventDefault();
            select(fig);
        }
    }

    /** @returns {boolean} обработано ли нажатие */
    function handleKeydown(e) {
        const cap = e.target.closest?.('figcaption');
        if (cap && editable.contains(cap)) {
            const fig = cap.closest('figure');
            if (e.key === 'Enter') {
                e.preventDefault();
                caretAfter(fig, { newLine: true });
                commit('op');
                return true;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                select(fig);
                return true;
            }
            if (e.key === 'Backspace' && !cap.textContent) {
                e.preventDefault();
                cap.remove();
                afterChange(fig, 'Подпись убрана.');
                return true;
            }
            return false;
        }
        if (selected) {
            const fig = selected;
            const mod = e.ctrlKey || e.metaKey;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                caretAfter(fig);
                return true;
            }
            if (mod) return false; // копирование, вырезание, отмена — штатно
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                move(fig, e.key === 'ArrowUp' ? -1 : 1);
                return true;
            }
            switch (e.key) {
                case 'Backspace':
                case 'Delete':
                    e.preventDefault();
                    remove(fig);
                    return true;
                case 'Enter':
                    e.preventDefault();
                    caretAfter(fig, { newLine: true });
                    commit('op');
                    return true;
                case 'ArrowUp':
                case 'ArrowLeft':
                    e.preventDefault();
                    caretBefore(fig);
                    return true;
                case 'ArrowDown':
                case 'ArrowRight':
                    e.preventDefault();
                    caretAfter(fig);
                    return true;
                case 'Tab':
                    return false;
                default:
                    // Набор текста не заменяет изображение: курсор переходит на строку под ним.
                    if (e.key.length === 1 && !e.altKey) caretAfter(fig);
                    return false;
            }
        }
        if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
        const sel = document.getSelection();
        if (!sel?.rangeCount || !sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        const block = topBlock(range.startContainer);
        if (!block || block.nodeType !== Node.ELEMENT_NODE) return false;
        const neighbour = e.key === 'Backspace' ? block.previousElementSibling : block.nextElementSibling;
        if (neighbour?.tagName !== 'FIGURE' || !neighbour.matches(FIGURE_SELECTOR)) return false;
        if (!caretEdge(range, block, e.key === 'Backspace' ? 'start' : 'end')) return false;
        e.preventDefault();
        // Первое нажатие выделяет изображение, второе — удаляет. Пустая строка рядом убирается.
        if (isEmptyBlock(block) && (block.previousElementSibling || block.nextElementSibling)) {
            const other = e.key === 'Backspace' ? block.nextElementSibling : block.previousElementSibling;
            if (other && other.tagName !== 'FIGURE') {
                block.remove();
                commit('op');
            }
        }
        select(neighbour);
        say('Изображение выделено. Delete — удалить, Enter — продолжить текст.');
        return true;
    }

    /** Вставка из буфера: картинка без текста — встраивается в позицию курсора. */
    function handlePaste(e) {
        const dt = e.clipboardData;
        if (!dt) return false;
        const cap = e.target.closest?.('figcaption');
        if (cap && editable.contains(cap)) {
            e.preventDefault();
            e.stopPropagation();
            const text = (dt.getData('text/plain') || '').replace(/\s+/g, ' ');
            try {
                document.execCommand('insertText', false, text);
            } catch {
                cap.append(text);
            }
            return true;
        }
        const files = imageFilesFrom(dt);
        const text = dt.getData('text/plain') || '';
        if (!files.length || text.trim()) return false;
        e.preventDefault();
        e.stopPropagation();
        if (selected) caretAfter(selected);
        insertBlobs(files);
        return true;
    }
    /** Из вставленного HTML остаются только изображения, известные этой закладке. */
    function filterPastedHtml(html) {
        if (!/<figure/i.test(html || '')) return html;
        const t = document.createElement('template');
        t.innerHTML = html;
        const current = currentShotIds();
        for (const fig of t.content.querySelectorAll('figure')) {
            const key = figureKey(fig);
            const id = Number(fig.getAttribute('data-shot'));
            const known = key.startsWith('id:') ? owned.has(id) || current.has(id) : drafts.has(key);
            if (!known) fig.remove();
        }
        return t.innerHTML;
    }

    // ------------------------------------------------------------------ галерея вложений
    function currentShotIds() {
        const ids = new Set();
        for (const f of editable.querySelectorAll('figure[data-shot]')) ids.add(Number(f.getAttribute('data-shot')));
        return ids;
    }
    /** Изображения, которые находятся в тексте, не дублируются во вложениях. */
    function refreshGallery() {
        const current = currentShotIds();
        form.querySelectorAll('.screenshot-thumbnail.existing[data-existing-id]').forEach((thumb) => {
            const id = Number(thumb.dataset.existingId);
            const inline = current.has(id) || owned.has(id);
            thumb.hidden = inline;
            thumb.classList.toggle('is-inline', inline);
        });
    }
    function removedShotIds() {
        const current = currentShotIds();
        return [...owned].filter((id) => !current.has(id));
    }

    // ------------------------------------------------------------------ подключение
    const onScroll = () => positionHud();
    const onWindowResize = () => positionHud();
    const onPointerUpAnywhere = () => onResizeUp();
    editable.addEventListener('mousedown', onMouseDown);
    editable.addEventListener('click', onClick);
    editable.addEventListener('pointerdown', onResizeDown);
    editable.addEventListener('pointermove', onResizeMove);
    editable.addEventListener('pointerup', onResizeUp);
    editable.addEventListener('pointercancel', onResizeUp);
    editable.addEventListener('dragstart', onDragStart);
    editable.addEventListener('dragend', cleanupDrag);
    editable.addEventListener('dragleave', onDragLeave);
    editable.addEventListener('dragover', onDragOver);
    editable.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointerup', onPointerUpAnywhere);
    host.append(hud);

    return {
        decorateAll,
        ensureSlots,
        handleKeydown,
        handlePaste,
        filterPastedHtml,
        onDrop,
        onSelectionChange,
        positionHud,
        deselect,
        refreshGallery,
        get selected() {
            return selected;
        },
        /** Новый документ: прежние черновики и ссылки забываются. */
        reset() {
            deselect();
            cleanupDrag();
            releaseAll();
            drafts.clear();
            owned = currentShotIds();
            decorateAll();
        },
        pickAndInsert() {
            pickFiles((files) => insertBlobs(files));
        },
        insertBlobs,
        insertExistingShot,
        /** Черновики, на которые ссылается текст, — для записи при сохранении. */
        drafts: () => new Map(drafts),
        removedShotIds,
        currentShotIds,
        isBusy: () => busy > 0,
        destroy() {
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('pointerup', onPointerUpAnywhere);
            releaseAll();
            drafts.clear();
            hud.remove();
            indicator.remove();
            picker.remove();
        },
    };
}
