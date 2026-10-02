'use strict';

import { isReducedMotion } from './motion-pref.js';

/**
 * Виртуализация сетки/списка карточек: в DOM находятся только видимые строки (+запас),
 * остальное заменено верхним/нижним отступом контейнера. Высота строк измеряется по факту,
 * для ещё не отрисованных используется среднее. Прокрутка окна (или ближайшего скролл-родителя)
 * компенсируется, чтобы контент не «прыгал» при уточнении высот.
 *
 * Элементы с isFullRow(item) === true (заголовки секций) занимают строку целиком.
 * Список короче eagerThreshold отрисовывается целиком без виртуализации.
 */

import {
    CARD_ITEM_BASE_CLASSES,
    LIST_ITEM_BASE_CLASSES,
    ALGO_BOOKMARK_CARD_CLASSES,
    LIST_HOVER_TRANSITION_CLASSES,
} from '../config.js';

const SCROLL_OVERFLOW_RE = /(auto|scroll|overlay)/;

function findScrollParent(el) {
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
        const oy = getComputedStyle(p).overflowY;
        if (SCROLL_OVERFLOW_RE.test(oy) && p.scrollHeight > p.clientHeight + 1) return p;
        p = p.parentElement;
    }
    return null;
}

/**
 * @template T
 * @param {{
 *   container: HTMLElement,
 *   renderItem: (item: T, index: number, viewMode: 'cards'|'list') => HTMLElement|null,
 *   isFullRow?: (item: T) => boolean,
 *   getViewMode?: () => 'cards'|'list',
 *   estimateRowHeight?: (viewMode: 'cards'|'list') => number,
 *   overscanPx?: number,
 *   eagerThreshold?: number,
 *   animateFirst?: boolean,
 *   onRender?: (info: { first: number, last: number, total: number }) => void,
 * }} opts
 */
export function createVirtualGrid(opts) {
    const container = opts.container;
    const renderItem = opts.renderItem;
    const isFullRow = opts.isFullRow || (() => false);
    const getViewMode =
        opts.getViewMode || (() => (container.dataset.view === 'list' ? 'list' : 'cards'));
    const estimateRowHeight = opts.estimateRowHeight || ((m) => (m === 'list' ? 96 : 190));
    const overscanPx = opts.overscanPx ?? 900;
    const eagerThreshold = opts.eagerThreshold ?? 120;

    /** @type {T[]} */
    let items = [];
    /** строки: [startIndex, endIndexExclusive] */
    let rows = [];
    /** stride строки (высота + зазор), NaN — не измерено */
    let strides = [];
    let offsets = [0];
    let offsetsDirty = true;
    let measuredSum = 0;
    let measuredCount = 0;
    let cols = 1;
    let viewMode = getViewMode();
    let virtual = false;
    /** @type {Map<number, HTMLElement>} */
    let nodes = new Map();
    let firstRow = 0;
    let lastRow = -1;
    let rafId = 0;
    let destroyed = false;
    let animateNext = !!opts.animateFirst;
    let scroller = null;
    let ro = null;
    let mo = null;
    let rowGap = 16;

    // CSS-значение верхнего отступа (без инлайна) — нужно, чтобы считать сдвиг якоря без повторного layout.
    const initialInlinePad = container.style.paddingTop;
    container.style.paddingTop = '';
    let cssPadTop = 0;
    try {
        cssPadTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
    } catch {
        cssPadTop = 0;
    }
    container.style.paddingTop = initialInlinePad;

    container.style.overflowAnchor = 'none';
    container.classList.add('vg-container');

    function readColumns(mode = viewMode) {
        if (mode === 'list') return 1;
        try {
            const tpl = getComputedStyle(container).gridTemplateColumns;
            if (tpl && tpl !== 'none') {
                const n = tpl.split(' ').filter(Boolean).length;
                if (n >= 1) return n;
            }
        } catch {
            /* ignore */
        }
        return 1;
    }

    function buildRows() {
        rows = [];
        let i = 0;
        const n = items.length;
        while (i < n) {
            if (isFullRow(items[i])) {
                rows.push([i, i + 1]);
                i++;
                continue;
            }
            let j = i;
            while (j < n && j - i < cols && !isFullRow(items[j])) j++;
            rows.push([i, j]);
            i = j;
        }
        strides = new Array(rows.length).fill(NaN);
        offsetsDirty = true;
    }

    function meanStride() {
        return measuredCount > 0 ? measuredSum / measuredCount : estimateRowHeight(viewMode) + rowGap;
    }

    function recomputeOffsets() {
        if (!offsetsDirty) return;
        const mean = meanStride();
        const n = rows.length;
        if (offsets.length !== n + 1) offsets = new Array(n + 1);
        let acc = 0;
        offsets[0] = 0;
        for (let i = 0; i < n; i++) {
            const s = strides[i];
            acc += Number.isNaN(s) ? mean : s;
            offsets[i + 1] = acc;
        }
        offsetsDirty = false;
    }

    function getViewportMetrics() {
        const rect = container.getBoundingClientRect();
        if (scroller) {
            const sr = scroller.getBoundingClientRect();
            return { y: sr.top - rect.top, h: scroller.clientHeight, rectTop: rect.top };
        }
        return { y: -rect.top, h: window.innerHeight, rectTop: rect.top };
    }

    function findRow(y) {
        let lo = 0;
        let hi = rows.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (offsets[mid + 1] <= y) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    function clearNodes() {
        for (const el of nodes.values()) el.remove();
        nodes.clear();
    }

    function createNode(index, animate, animIdx) {
        const el = renderItem(items[index], index, viewMode);
        if (!el) return null;
        el.dataset.vgIndex = String(index);
        if (animate && animIdx < 12 && !isReducedMotion()) {
            el.classList.add('vg-enter');
            el.style.setProperty('--vg-delay', `${animIdx * 22}ms`);
            el.addEventListener(
                'animationend',
                () => {
                    el.classList.remove('vg-enter');
                    el.style.removeProperty('--vg-delay');
                },
                { once: true },
            );
        }
        return el;
    }

    function measureRendered() {
        // stride строки = расстояние между верхами соседних строк (включая зазоры и поля заголовков)
        let changed = false;
        let prevTop = null;
        let prevRow = -1;
        for (let r = firstRow; r <= lastRow; r++) {
            const first = nodes.get(rows[r][0]);
            if (!first) continue;
            const top = first.getBoundingClientRect().top;
            if (prevRow >= 0 && prevTop !== null) {
                setStride(prevRow, top - prevTop);
            }
            prevTop = top;
            prevRow = r;
            if (r === lastRow) {
                const rowH = first.getBoundingClientRect().height;
                // последняя строка окна: высота + зазор
                let maxH = rowH;
                for (let k = rows[r][0] + 1; k < rows[r][1]; k++) {
                    const e = nodes.get(k);
                    if (e) maxH = Math.max(maxH, e.getBoundingClientRect().height);
                }
                setStride(r, maxH + rowGap);
            }
        }
        function setStride(r, v) {
            if (!(v > 0) || !Number.isFinite(v)) return;
            const old = strides[r];
            if (Number.isNaN(old)) {
                measuredSum += v;
                measuredCount++;
                changed = true;
            } else if (Math.abs(old - v) > 0.5) {
                measuredSum += v - old;
                changed = true;
            } else return;
            strides[r] = v;
        }
        if (changed) offsetsDirty = true;
        return changed;
    }

    function applyPadding() {
        recomputeOffsets();
        const total = offsets[rows.length];
        const top = offsets[firstRow];
        const bottom = lastRow >= 0 ? Math.max(0, total - offsets[lastRow + 1]) : 0;
        container.style.paddingTop = top > 0 ? `${Math.round(top)}px` : '';
        container.style.paddingBottom = bottom > 0 ? `${Math.round(bottom)}px` : '';
    }

    function anchorSnapshot() {
        for (let r = firstRow; r <= lastRow; r++) {
            const el = nodes.get(rows[r][0]);
            if (!el) continue;
            const b = el.getBoundingClientRect();
            if (b.bottom > 0) return { el, top: b.top };
        }
        return null;
    }

    function scrollByDelta(dy) {
        if (Math.abs(dy) < 0.5) return;
        if (scroller) scroller.scrollTop += dy;
        else window.scrollBy(0, dy);
    }

    function currentTopPadding(base) {
        const v = parseFloat(container.style.paddingTop);
        return Number.isFinite(v) ? v : base;
    }

    function render() {
        rafId = 0;
        if (destroyed) return;
        if (!virtual) return;
        recomputeOffsets();
        const m = getViewportMetrics();
        const from = Math.max(0, m.y - overscanPx);
        const to = m.y + m.h + overscanPx;
        let a = findRow(from);
        let b = findRow(to);
        if (b < a) b = a;
        // Контейнер вне видимости далеко — рисуем минимум (одну строку у ближайшего края)
        if (m.y > offsets[rows.length] + overscanPx) a = b = rows.length - 1;
        if (m.y + m.h < -overscanPx) a = b = 0;

        const anchor = anchorSnapshot();
        // Верхний отступ контейнера до правок (инлайн или CSS-база, снятая при создании).
        const basePadTop = cssPadTop;
        const needA = a;
        const needB = b;
        if (needA === firstRow && needB === lastRow && nodes.size > 0) {
            // окно не изменилось — только уточнить высоты
        } else {
            const wantStart = rows[needA][0];
            const wantEnd = rows[needB][1];
            for (const [idx, el] of nodes) {
                if (idx < wantStart || idx >= wantEnd) {
                    el.remove();
                    nodes.delete(idx);
                }
            }
            const animate = animateNext;
            animateNext = false;
            let animIdx = 0;
            // добавляем недостающие: сначала «до» существующих, затем «после»
            const existingIdx = Array.from(nodes.keys());
            const minExisting = existingIdx.length ? Math.min(...existingIdx) : Infinity;
            const maxExisting = existingIdx.length ? Math.max(...existingIdx) : -Infinity;
            const before = document.createDocumentFragment();
            const after = document.createDocumentFragment();
            for (let i = wantStart; i < wantEnd; i++) {
                if (nodes.has(i)) continue;
                const el = createNode(i, animate, animIdx++);
                if (!el) continue;
                nodes.set(i, el);
                if (i < minExisting) before.appendChild(el);
                else if (i > maxExisting) after.appendChild(el);
                else after.appendChild(el);
            }
            if (before.childNodes.length) {
                const firstEl = nodes.get(minExisting);
                if (firstEl && firstEl.parentNode === container) container.insertBefore(before, firstEl);
                else container.appendChild(before);
            }
            if (after.childNodes.length) container.appendChild(after);
            firstRow = needA;
            lastRow = needB;
        }
        // Отступы выставляются ДО измерения: единственный принудительный layout за проход учитывает их,
        // и в обычной прокрутке по уже измеренным строкам второго layout не нужно. Если высоты
        // уточнились — отступы пересчитываются, а сдвиг якоря вычисляется арифметически.
        applyPadding();
        const padMid = currentTopPadding(basePadTop);
        const changed = measureRendered();
        let anchorTopNow = null;
        if (anchor && anchor.el.isConnected) anchorTopNow = anchor.el.getBoundingClientRect().top;
        if (changed) applyPadding();
        if (anchorTopNow !== null) {
            const padAfter = currentTopPadding(basePadTop);
            scrollByDelta(anchorTopNow + (padAfter - padMid) - anchor.top);
        }
        if (changed) {
            // окно могло сместиться из-за уточнения высот
            scheduleRender();
        }
        opts.onRender?.({
            first: rows[firstRow] ? rows[firstRow][0] : 0,
            last: rows[lastRow] ? rows[lastRow][1] - 1 : -1,
            total: items.length,
        });
    }

    function scheduleRender() {
        if (rafId || destroyed) return;
        rafId = requestAnimationFrame(render);
    }

    function renderAllEager() {
        clearNodes();
        container.style.paddingTop = '';
        container.style.paddingBottom = '';
        const frag = document.createDocumentFragment();
        const animate = animateNext;
        animateNext = false;
        for (let i = 0; i < items.length; i++) {
            const el = createNode(i, animate, i);
            if (!el) continue;
            nodes.set(i, el);
            frag.appendChild(el);
        }
        container.appendChild(frag);
        firstRow = 0;
        lastRow = -1;
        opts.onRender?.({ first: 0, last: items.length - 1, total: items.length });
    }

    function onScroll() {
        scheduleRender();
    }

    function attach() {
        scroller = findScrollParent(container);
        (scroller || window).addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            let lastW = container.clientWidth;
            ro = new ResizeObserver(() => {
                const w = container.clientWidth;
                if (w !== lastW) {
                    lastW = w;
                    relayout();
                }
            });
            ro.observe(container);
        }
        if (typeof MutationObserver !== 'undefined') {
            mo = new MutationObserver(() => {
                if (getViewMode() !== viewMode) relayout();
            });
            mo.observe(container, { attributes: true, attributeFilter: ['data-view'] });
        }
    }

    function detach() {
        (scroller || window).removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        ro?.disconnect();
        mo?.disconnect();
        ro = mo = null;
    }

    function firstVisibleItemIndex() {
        if (!virtual || !rows.length) return 0;
        const m = getViewportMetrics();
        recomputeOffsets();
        const r = Math.min(rows.length - 1, Math.max(0, findRow(Math.max(0, m.y))));
        return rows[r][0];
    }

    /** Перестроить раскладку (смена колонок/вида) с сохранением первого видимого элемента. */
    function relayout() {
        if (destroyed) return;
        const keepIdx = firstVisibleItemIndex();
        const newMode = getViewMode();
        const newCols = newMode === 'list' ? 1 : readColumns(newMode);
        if (newMode === viewMode && newCols === cols && rows.length) {
            scheduleRender();
            return;
        }
        viewMode = newMode;
        cols = newCols;
        // Разметка карточки зависит от вида — перерисовываем окно целиком
        clearNodes();
        firstRow = 0;
        lastRow = -1;
        measuredSum = 0;
        measuredCount = 0;
        if (items.length <= eagerThreshold) {
            virtual = false;
            renderAllEager();
            return;
        }
        virtual = true;
        buildRows();
        // восстанавливаем позицию: строка с keepIdx → к верху окна
        recomputeOffsets();
        const rowIdx = Math.max(
            0,
            rows.findIndex((r) => keepIdx >= r[0] && keepIdx < r[1]),
        );
        render();
        const m = getViewportMetrics();
        scrollByDelta(offsets[rowIdx] - m.y);
        scheduleRender();
    }

    function setItems(next, setOpts = {}) {
        items = Array.isArray(next) ? next : [];
        const keepScroll = !!setOpts.keepScroll;
        const keepIdx = keepScroll ? firstVisibleItemIndex() : 0;
        viewMode = getViewMode();
        cols = viewMode === 'list' ? 1 : readColumns();
        clearNodes();
        firstRow = 0;
        lastRow = -1;
        if (setOpts.animate) animateNext = true;
        const cs = getComputedStyle(container);
        const g = parseFloat(cs.rowGap);
        rowGap = Number.isFinite(g) ? g : 16;
        if (items.length <= eagerThreshold) {
            virtual = false;
            container.style.paddingTop = '';
            container.style.paddingBottom = '';
            renderAllEager();
            return;
        }
        virtual = true;
        measuredSum = 0;
        measuredCount = 0;
        buildRows();
        if (!keepScroll) {
            // список сменился — вернём верх списка в зону видимости (если он выше окна)
            const rect = container.getBoundingClientRect();
            if (rect.top < 0) scrollByDelta(rect.top - 8);
        }
        render();
        if (keepScroll && keepIdx > 0) {
            recomputeOffsets();
            const rowIdx = Math.max(
                0,
                rows.findIndex((r) => keepIdx >= r[0] && keepIdx < r[1]),
            );
            const m = getViewportMetrics();
            scrollByDelta(offsets[rowIdx] - m.y);
            scheduleRender();
        }
    }

    function scrollToIndex(index) {
        if (!virtual) {
            nodes.get(index)?.scrollIntoView({ block: 'center' });
            return;
        }
        const rowIdx = rows.findIndex((r) => index >= r[0] && index < r[1]);
        if (rowIdx < 0) return;
        recomputeOffsets();
        const m = getViewportMetrics();
        scrollByDelta(offsets[rowIdx] - m.y - 80);
        scheduleRender();
    }

    function destroy() {
        destroyed = true;
        detach();
        if (rafId) cancelAnimationFrame(rafId);
        clearNodes();
        container.style.paddingTop = '';
        container.style.paddingBottom = '';
        container.style.overflowAnchor = '';
        container.classList.remove('vg-container');
    }

    attach();

    return {
        setItems,
        refresh: scheduleRender,
        relayout,
        scrollToIndex,
        destroy,
        getItems: () => items,
        getRenderedCount: () => nodes.size,
        isVirtual: () => virtual,
        /** Элемент DOM по индексу элемента списка (если он сейчас отрисован). */
        getNode: (i) => nodes.get(i) || null,
    };
}


const DECORATE_REMOVE = [
    ...CARD_ITEM_BASE_CLASSES,
    ...ALGO_BOOKMARK_CARD_CLASSES,
    'bg-white',
    'dark:bg-[#374151]',
    'border',
    'border-gray-200',
    'dark:border-gray-700',
    'h-full',
    'flex-col',
    'justify-between',
    ...LIST_ITEM_BASE_CLASSES,
    ...LIST_HOVER_TRANSITION_CLASSES,
    'py-3',
    'pl-5',
    'pr-3',
    'mb-1',
    'mb-2',
    'p-3',
    'border-b',
    'text-center',
    'md:items-start',
    'md:text-left',
];

/**
 * Оформление свежесозданной карточки под текущий вид — то же, что applyView() делает для
 * уже существующих элементов (карточки, созданные при прокрутке, не проходят через applyView).
 * @param {HTMLElement} el
 * @param {'cards'|'list'} view
 */
export function decorateCardForView(el, view) {
    el.classList.remove(...DECORATE_REMOVE);
    el.style.borderColor = '';
    if (view === 'cards') {
        el.classList.add(...CARD_ITEM_BASE_CLASSES, 'h-full', ...ALGO_BOOKMARK_CARD_CLASSES);
    } else {
        el.classList.add(...LIST_ITEM_BASE_CLASSES, ...LIST_HOVER_TRANSITION_CLASSES);
        el.classList.remove('h-full');
    }
    if (el.classList.contains('bookmark-item')) {
        const title = el.querySelector('.bookmark-title, .item-title, h3, h4');
        if (title) {
            if (view === 'cards') {
                title.classList.remove('font-medium', 'text-sm');
                title.classList.add('font-semibold', 'text-base');
            } else {
                title.classList.remove('font-semibold', 'text-base');
                title.classList.add('font-medium', 'text-sm');
            }
        }
        const actions = el.querySelector('.bookmark-actions, [data-role="actions"]');
        if (actions) {
            actions.classList.add(
                'opacity-0',
                'pointer-events-none',
                'group-hover:opacity-100',
                'group-hover:pointer-events-auto',
                'transition-opacity',
            );
        }
    }
}
