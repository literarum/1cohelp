'use strict';

import { computeVirtualWindow } from './engineering-cockpit-logging.js';

const ROW_HEIGHT = 24;

function pad(n, w = 2) {
    return String(n).padStart(w, '0');
}

/** HH:MM:SS.mmm из ISO-строки (локальное время); иначе исходный текст. */
export function formatLogClock(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts || '');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function firstLine(entry) {
    const body = Array.isArray(entry.args) ? entry.args.join(' ') : '';
    const nl = body.indexOf('\n');
    const line = nl >= 0 ? body.slice(0, nl) : body;
    return line.length > 400 ? `${line.slice(0, 400)}…` : line;
}

/**
 * Виртуализированный список логов: в DOM только видимые строки (+ запас), поэтому
 * буфер на тысячи записей не тормозит прокрутку и фильтрацию.
 *
 * @param {{ viewport: HTMLElement, onSelect?: (entry: object | null) => void, onFollowChange?: (follow: boolean) => void }} opts
 */
export function createVirtualLogView({ viewport, onSelect, onFollowChange }) {
    viewport.classList.add('cockpit-logview');
    viewport.setAttribute('role', 'log');
    viewport.setAttribute('aria-label', 'Журнал консоли');
    viewport.setAttribute('aria-live', 'off');
    viewport.tabIndex = 0;
    viewport.textContent = '';

    const spacer = document.createElement('div');
    spacer.className = 'cockpit-logview__spacer';
    const rowsBox = document.createElement('div');
    rowsBox.className = 'cockpit-logview__rows';
    const empty = document.createElement('div');
    empty.className = 'cockpit-logview__empty';
    empty.hidden = true;
    spacer.appendChild(rowsBox);
    viewport.append(spacer, empty);

    /** @type {object[]} */
    let entries = [];
    let selectedSeq = null;
    let follow = true;
    let raf = 0;
    let programmaticScroll = false;

    const setFollow = (v) => {
        if (follow === v) return;
        follow = v;
        onFollowChange?.(v);
    };

    const isAtBottom = () =>
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= ROW_HEIGHT;

    function renderRows() {
        raf = 0;
        const vh = viewport.clientHeight || 400;
        const w = computeVirtualWindow({
            total: entries.length,
            rowHeight: ROW_HEIGHT,
            scrollTop: viewport.scrollTop,
            viewportHeight: vh,
        });
        spacer.style.height = `${w.totalHeight}px`;
        rowsBox.style.transform = `translateY(${w.offsetTop}px)`;
        const frag = document.createDocumentFragment();
        for (let i = w.start; i < w.end; i += 1) {
            const e = entries[i];
            const row = document.createElement('div');
            const lvl = String(e.level || 'log');
            row.className = `cockpit-logrow cockpit-logrow--${lvl}`;
            if (e.seq === selectedSeq) row.classList.add('is-selected');
            row.dataset.index = String(i);
            row.setAttribute('role', 'row');
            const t = document.createElement('span');
            t.className = 'cockpit-logrow__time';
            t.textContent = formatLogClock(e.ts);
            const l = document.createElement('span');
            l.className = 'cockpit-logrow__lvl';
            l.textContent = lvl;
            const q = document.createElement('span');
            q.className = 'cockpit-logrow__seq';
            q.textContent = `#${e.seq ?? '—'}`;
            const m = document.createElement('span');
            m.className = 'cockpit-logrow__msg';
            m.textContent = firstLine(e);
            row.append(t, l, q, m);
            frag.appendChild(row);
        }
        rowsBox.replaceChildren(frag);
    }

    const schedule = () => {
        if (!raf) raf = requestAnimationFrame(renderRows);
    };

    viewport.addEventListener(
        'scroll',
        () => {
            if (!programmaticScroll) setFollow(isAtBottom());
            programmaticScroll = false;
            schedule();
        },
        { passive: true },
    );

    function select(index, { scroll = false } = {}) {
        const e = entries[index];
        selectedSeq = e ? e.seq : null;
        if (e && scroll) {
            const top = index * ROW_HEIGHT;
            if (top < viewport.scrollTop) viewport.scrollTop = top;
            else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight)
                viewport.scrollTop = top + ROW_HEIGHT - viewport.clientHeight;
        }
        renderRows();
        onSelect?.(e || null);
    }

    viewport.addEventListener('click', (ev) => {
        const row = ev.target instanceof Element ? ev.target.closest('.cockpit-logrow') : null;
        if (!row) return;
        select(Number(row.dataset.index));
    });

    viewport.addEventListener('keydown', (ev) => {
        if (!entries.length) return;
        const cur = entries.findIndex((e) => e.seq === selectedSeq);
        let next = null;
        if (ev.key === 'ArrowDown') next = Math.min(entries.length - 1, cur + 1);
        else if (ev.key === 'ArrowUp') next = Math.max(0, cur < 0 ? entries.length - 1 : cur - 1);
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = entries.length - 1;
        else if (ev.key === 'PageDown')
            next = Math.min(entries.length - 1, Math.max(0, cur) + 10);
        else if (ev.key === 'PageUp') next = Math.max(0, Math.max(0, cur) - 10);
        if (next == null) return;
        ev.preventDefault();
        select(next, { scroll: true });
    });

    const ro =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null;
    ro?.observe(viewport);

    return {
        ROW_HEIGHT,
        /** Заменяет список записей; при включённом «следить» прокручивает к концу. */
        setEntries(list, { emptyText = 'Логи пока отсутствуют.' } = {}) {
            entries = Array.isArray(list) ? list : [];
            empty.hidden = entries.length > 0;
            empty.textContent = entries.length ? '' : emptyText;
            spacer.hidden = entries.length === 0;
            if (follow) {
                programmaticScroll = true;
                viewport.scrollTop = viewport.scrollHeight;
            }
            renderRows();
        },
        scrollToEnd() {
            programmaticScroll = true;
            viewport.scrollTop = viewport.scrollHeight;
            setFollow(true);
            renderRows();
        },
        setFollow(v) {
            setFollow(Boolean(v));
            if (follow) this.scrollToEnd();
        },
        get follow() {
            return follow;
        },
        getRenderedRowCount() {
            return rowsBox.childElementCount;
        },
        getSelected() {
            return entries.find((e) => e.seq === selectedSeq) || null;
        },
        destroy() {
            ro?.disconnect();
            if (raf) cancelAnimationFrame(raf);
        },
    };
}
