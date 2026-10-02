'use strict';

/**
 * Интерактивный просмотрщик любого XML для анализатора: обзор, дерево с поиском (виртуализация),
 * структура и таблицы, подписи/сертификаты, сравнение двух документов.
 * Все данные из файла выводятся только через textContent (innerHTML не используется).
 */

import {
    NODE_KIND,
    describeMatch,
    nodeToJson,
    searchDoc,
    serializeNode,
} from './xml-analyzer-model.js';
import {
    buildTable,
    buildTextReport,
    diffDocs,
    diffToCsvRows,
    formatVersionOf,
    nodesOfPath,
    repeatedChildren,
    requisitesToCsvRows,
    structureRows,
    tableToCsvRows,
    toCsv,
} from './xml-analyzer-insights.js';
import { analyzeBlob, base64ToBytes, certToPem, certValidityState } from './xml-analyzer-crypto.js';
import { REQUISITE_LABELS, checkRequisite, requisiteKindByName } from './xml-analyzer-ids.js';

const ROW_H = 26;

// ---------------------------------------------------------------------------
// Мини-хелперы DOM / ввода-вывода
// ---------------------------------------------------------------------------

/** Создаёт элемент: h('div', {class:'x', onclick:fn, title:'..'}, 'текст' | Node | [..]) */
export function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else if (k === 'dataset') Object.assign(el.dataset, v);
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else el.setAttribute(k, v === true ? '' : String(v));
        }
    }
    const add = (c) => {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) c.forEach(add);
        else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
}

export async function copyText(text) {
    const s = String(text ?? '');
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(s);
            return true;
        }
    } catch {
        // падаем на запасной вариант
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

export function downloadData(fileName, data, mime = 'text/plain;charset=utf-8') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function fmtNum(n) {
    return Number(n).toLocaleString('ru-RU');
}

export function fmtSize(b) {
    if (b < 1024) return `${b} Б`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} КБ`;
    return `${(b / 1048576).toFixed(1)} МБ`;
}

function safeFileBase(name) {
    return (
        String(name || 'xml')
            .replace(/\.[a-z0-9]{1,5}$/i, '')
            .replace(/[^\p{L}\p{N}_.-]+/gu, '_')
            .slice(0, 60) || 'xml'
    );
}

/** Добавляет в parent текст с подсветкой подстроки q (без регистра). */
function appendHighlighted(parent, text, q) {
    const s = String(text);
    if (!q) {
        parent.appendChild(document.createTextNode(s));
        return;
    }
    const low = s.toLowerCase();
    let i = 0;
    let idx = low.indexOf(q, i);
    if (idx < 0) {
        parent.appendChild(document.createTextNode(s));
        return;
    }
    let guard = 0;
    while (idx >= 0 && guard++ < 50) {
        if (idx > i) parent.appendChild(document.createTextNode(s.slice(i, idx)));
        parent.appendChild(h('mark', { class: 'xa-mark', text: s.slice(idx, idx + q.length) }));
        i = idx + q.length;
        idx = low.indexOf(q, i);
    }
    if (i < s.length) parent.appendChild(document.createTextNode(s.slice(i)));
}

const KIND_ICON = { ok: 'fa-circle-check', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark', info: 'fa-circle-info' };

function iconEl(level) {
    return h('i', { class: `fas ${KIND_ICON[level] || KIND_ICON.info} xa-ico xa-ico-${level}`, 'aria-hidden': 'true' });
}

function badge(text, level = 'info', title = '') {
    return h('span', { class: `xa-badge xa-badge-${level}`, title: title || null, text });
}

function button(label, { icon, title, onclick, cls = '' } = {}) {
    return h(
        'button',
        { type: 'button', class: `xa-btn ${cls}`, title: title || null, 'aria-label': title || label || null, onclick },
        icon ? h('i', { class: `fas ${icon}`, 'aria-hidden': 'true' }) : null,
        label ? h('span', { text: label }) : null,
    );
}

// ---------------------------------------------------------------------------
// Виртуализированное дерево
// ---------------------------------------------------------------------------

class VirtualTree {
    constructor(doc, { onSelect, onToggle }) {
        this.doc = doc;
        this.onSelect = onSelect;
        this.onToggle = onToggle;
        this.expanded = new Uint8Array(doc.n + 1);
        this.rows = [];
        this.selected = -1;
        this.matchSet = new Set();
        this.currentMatch = -1;
        this.query = '';
        this.winStart = -1;
        this.winEnd = -1;
        this.raf = 0;

        this.viewport = h('div', {
            class: 'xa-vt',
            role: 'tree',
            tabindex: '0',
            'aria-label': 'Дерево XML',
        });
        this.spacer = h('div', { class: 'xa-vt-spacer' });
        this.layer = h('div', { class: 'xa-vt-rows' });
        this.spacer.appendChild(this.layer);
        this.viewport.appendChild(this.spacer);
        this.viewport.addEventListener('scroll', () => this.schedule());
        this.viewport.addEventListener('keydown', (e) => this.onKey(e));
        this.viewport.addEventListener('click', (e) => this.onClick(e));
        this.viewport.addEventListener('dblclick', (e) => {
            const row = e.target.closest('.xa-row');
            if (row) this.toggle(Number(row.dataset.n));
        });
        if (typeof ResizeObserver === 'function') {
            this.ro = new ResizeObserver(() => this.schedule());
            this.ro.observe(this.viewport);
        }
        this.autoExpand();
        this.rebuild();
    }

    destroy() {
        if (this.ro) this.ro.disconnect();
        cancelAnimationFrame(this.raf);
    }

    /** Раскрывает верхние уровни, пока строк не больше лимита. */
    autoExpand() {
        const doc = this.doc;
        const queue = [];
        for (let c = doc.first[0]; c >= 0; c = doc.next[c]) queue.push(c);
        let rows = queue.length;
        let qi = 0;
        while (qi < queue.length && rows < 160) {
            const n = queue[qi++];
            if (doc.first[n] < 0 || doc.depth[n] > 4) continue;
            const cc = doc.childCount(n);
            if (cc > 60) continue;
            if (rows + cc > 220) continue;
            this.expanded[n] = 1;
            rows += cc;
            for (let c = doc.first[n]; c >= 0; c = doc.next[c]) queue.push(c);
        }
    }

    /** Раскрывает всё до глубины depthLimit (с ограничением на общее число строк). */
    expandToDepth(depthLimit, maxRows = 120000) {
        const doc = this.doc;
        this.expanded.fill(0);
        let rows = 0;
        const st = [];
        for (let c = doc.first[0]; c >= 0; c = doc.next[c]) st.push(c);
        // обход в ширину по уровням, чтобы лимит строк действовал равномерно
        let level = st;
        while (level.length && rows < maxRows) {
            const nextLevel = [];
            for (const n of level) {
                rows++;
                if (doc.first[n] < 0 || doc.depth[n] >= depthLimit - 1) continue;
                if (rows + doc.childCount(n) > maxRows) continue;
                this.expanded[n] = 1;
                for (let c = doc.first[n]; c >= 0; c = doc.next[c]) nextLevel.push(c);
            }
            level = nextLevel;
        }
        this.rebuild();
    }

    collapseAll() {
        this.expanded.fill(0);
        this.rebuild();
    }

    rebuild() {
        const doc = this.doc;
        const rows = [];
        const stack = [];
        for (let c = doc.first[0]; c >= 0; c = doc.next[c]) stack.push(c);
        // стек со «следующими соседями»: обходим итеративно в порядке документа
        const iter = [];
        let cur = doc.first[0];
        while (cur >= 0 || iter.length) {
            if (cur < 0) {
                cur = iter.pop();
                continue;
            }
            rows.push(cur);
            const nxt = doc.next[cur];
            if (this.expanded[cur] && doc.first[cur] >= 0) {
                if (nxt >= 0) iter.push(nxt);
                cur = doc.first[cur];
            } else {
                cur = nxt;
            }
        }
        this.rows = rows;
        this.spacer.style.height = rows.length * ROW_H + 'px';
        this.winStart = -1;
        this.schedule(true);
    }

    indexOfNode(n) {
        const rows = this.rows;
        let lo = 0;
        let hi = rows.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (rows[mid] === n) return mid;
            if (rows[mid] < n) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }

    toggle(n) {
        if (this.doc.first[n] < 0) return;
        this.expanded[n] = this.expanded[n] ? 0 : 1;
        this.rebuild();
        if (this.onToggle) this.onToggle(n);
    }

    expand(n) {
        if (this.doc.first[n] >= 0 && !this.expanded[n]) {
            this.expanded[n] = 1;
            this.rebuild();
        }
    }

    reveal(n, { select = true, center = true } = {}) {
        const doc = this.doc;
        let p = doc.parent[n];
        let changed = false;
        while (p > 0) {
            if (!this.expanded[p]) {
                this.expanded[p] = 1;
                changed = true;
            }
            p = doc.parent[p];
        }
        if (changed) this.rebuild();
        const idx = this.indexOfNode(n);
        if (idx < 0) return;
        if (select) this.select(n, { scroll: false });
        const top = idx * ROW_H;
        const vh = this.viewport.clientHeight || 400;
        if (center || top < this.viewport.scrollTop || top + ROW_H > this.viewport.scrollTop + vh) {
            this.viewport.scrollTop = Math.max(0, top - vh / 2 + ROW_H);
        }
        this.schedule(true);
    }

    select(n, { scroll = true, notify = true } = {}) {
        this.selected = n;
        if (scroll) {
            const idx = this.indexOfNode(n);
            if (idx >= 0) {
                const top = idx * ROW_H;
                const vh = this.viewport.clientHeight || 400;
                if (top < this.viewport.scrollTop) this.viewport.scrollTop = top;
                else if (top + ROW_H > this.viewport.scrollTop + vh) this.viewport.scrollTop = top + ROW_H - vh;
            }
        }
        this.winStart = -1;
        this.schedule(true);
        if (notify && this.onSelect) this.onSelect(n);
    }

    setMatches(ids, query, currentIdx = -1) {
        this.matchSet = new Set(ids);
        this.query = String(query || '').toLowerCase();
        this.currentMatch = currentIdx >= 0 ? ids[currentIdx] : -1;
        this.winStart = -1;
        this.schedule(true);
    }

    onClick(e) {
        const row = e.target.closest('.xa-row');
        if (!row) return;
        const n = Number(row.dataset.n);
        if (e.target.closest('.xa-twisty')) {
            this.toggle(n);
            this.select(n, { scroll: false });
            return;
        }
        this.select(n, { scroll: false });
        this.viewport.focus({ preventScroll: true });
    }

    onKey(e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const doc = this.doc;
        let idx = this.selected >= 0 ? this.indexOfNode(this.selected) : -1;
        const pageRows = Math.max(1, Math.floor((this.viewport.clientHeight || 300) / ROW_H) - 1);
        let handled = true;
        switch (e.key) {
            case 'ArrowDown':
                idx = Math.min(this.rows.length - 1, idx + 1);
                break;
            case 'ArrowUp':
                idx = Math.max(0, idx < 0 ? 0 : idx - 1);
                break;
            case 'PageDown':
                idx = Math.min(this.rows.length - 1, idx + pageRows);
                break;
            case 'PageUp':
                idx = Math.max(0, idx - pageRows);
                break;
            case 'Home':
                idx = 0;
                break;
            case 'End':
                idx = this.rows.length - 1;
                break;
            case 'ArrowRight':
                if (this.selected >= 0 && doc.first[this.selected] >= 0) {
                    if (!this.expanded[this.selected]) {
                        this.toggle(this.selected);
                        return e.preventDefault();
                    }
                    idx = idx + 1;
                } else handled = false;
                break;
            case 'ArrowLeft':
                if (this.selected >= 0) {
                    if (this.expanded[this.selected] && doc.first[this.selected] >= 0) {
                        this.toggle(this.selected);
                        return e.preventDefault();
                    }
                    const p = doc.parent[this.selected];
                    if (p > 0) {
                        this.select(p);
                        return e.preventDefault();
                    }
                }
                handled = false;
                break;
            case 'Enter':
            case ' ':
                if (this.selected >= 0 && doc.first[this.selected] >= 0) this.toggle(this.selected);
                break;
            default:
                handled = false;
        }
        if (!handled) return;
        e.preventDefault();
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End' || e.key === 'ArrowRight') && this.rows[idx] !== undefined) {
            this.select(this.rows[idx]);
        }
    }

    schedule(force = false) {
        if (force) {
            cancelAnimationFrame(this.raf);
            this.render();
            return;
        }
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.render();
        });
    }

    render() {
        const total = this.rows.length;
        const vh = this.viewport.clientHeight || 400;
        const first = Math.max(0, Math.floor(this.viewport.scrollTop / ROW_H) - 8);
        const last = Math.min(total, Math.ceil((this.viewport.scrollTop + vh) / ROW_H) + 8);
        if (first === this.winStart && last === this.winEnd) return;
        this.winStart = first;
        this.winEnd = last;
        const frag = document.createDocumentFragment();
        for (let i = first; i < last; i++) frag.appendChild(this.buildRow(this.rows[i], i));
        this.layer.replaceChildren(frag);
        this.layer.style.transform = `translateY(${first * ROW_H}px)`;
        if (this.selected >= 0 && this.indexOfNode(this.selected) >= 0) {
            this.viewport.setAttribute('aria-activedescendant', 'xa-row-' + this.selected);
        }
    }

    buildRow(n, index) {
        const doc = this.doc;
        const k = doc.kind[n];
        const q = this.query;
        const isHit = this.matchSet.has(n);
        const row = h('div', {
            class:
                'xa-row' +
                (n === this.selected ? ' xa-sel' : '') +
                (isHit ? ' xa-hit' : '') +
                (n === this.currentMatch ? ' xa-hit-cur' : ''),
            id: 'xa-row-' + n,
            role: 'treeitem',
            'aria-level': String(doc.depth[n] + 1),
            'aria-selected': n === this.selected ? 'true' : 'false',
            dataset: { n: String(n) },
        });
        if (index !== undefined) row.style.height = ROW_H + 'px';
        const depth = Math.min(doc.depth[n], 40);
        row.style.paddingLeft = 6 + depth * 14 + 'px';
        const hasKids = doc.first[n] >= 0;
        if (k === NODE_KIND.ELEMENT) {
            row.setAttribute('aria-expanded', hasKids ? (this.expanded[n] ? 'true' : 'false') : 'false');
            if (!hasKids) row.removeAttribute('aria-expanded');
        }
        row.appendChild(
            h('span', { class: 'xa-twisty' + (hasKids ? '' : ' xa-twisty-empty'), 'aria-hidden': 'true' }, hasKids ? (this.expanded[n] ? '▾' : '▸') : ''),
        );
        const line = h('span', { class: 'xa-line' });
        if (k === NODE_KIND.ELEMENT) {
            line.appendChild(h('span', { class: 'xa-punct', text: '<' }));
            const nm = h('span', { class: 'xa-tag' });
            appendHighlighted(nm, doc.name(n), isHit ? q : '');
            line.appendChild(nm);
            const c = doc.aCnt[n];
            if (c) {
                const s = doc.aStart[n];
                const shown = Math.min(c, 5);
                for (let a = 0; a < shown; a++) {
                    const idx = s + a;
                    const an = h('span', { class: 'xa-an' });
                    appendHighlighted(an, doc.names[doc.aName[idx]], isHit ? q : '');
                    const rawV = doc.src.slice(doc.aVs[idx], Math.min(doc.aVe[idx], doc.aVs[idx] + 120));
                    const av = h('span', { class: 'xa-av' });
                    appendHighlighted(av, rawV + (doc.aVe[idx] - doc.aVs[idx] > 120 ? '…' : ''), isHit ? q : '');
                    line.appendChild(document.createTextNode(' '));
                    line.appendChild(an);
                    line.appendChild(h('span', { class: 'xa-punct', text: '="' }));
                    line.appendChild(av);
                    line.appendChild(h('span', { class: 'xa-punct', text: '"' }));
                }
                if (c > shown) line.appendChild(h('span', { class: 'xa-more', text: ` +${c - shown}` }));
            }
            line.appendChild(h('span', { class: 'xa-punct', text: hasKids || doc.hasOwnText(n) ? '>' : '/>' }));
            if (doc.hasOwnText(n)) {
                const raw = doc.src.slice(doc.ts[n], Math.min(doc.te[n], doc.ts[n] + 300));
                const val = h('span', { class: 'xa-val' });
                appendHighlighted(val, raw.replace(/\s+/g, ' ').trim() + (doc.te[n] - doc.ts[n] > 300 ? '…' : ''), isHit ? q : '');
                line.appendChild(document.createTextNode(' '));
                line.appendChild(val);
            }
            if (hasKids) {
                line.appendChild(h('span', { class: 'xa-cnt', title: 'Дочерних узлов', text: ` ${fmtNum(doc.childCount(n))}` }));
            }
        } else if (k === NODE_KIND.COMMENT) {
            const t = h('span', { class: 'xa-comment' });
            appendHighlighted(t, '<!--' + doc.src.slice(doc.ts[n], Math.min(doc.te[n], doc.ts[n] + 200)).replace(/\s+/g, ' ') + '-->', isHit ? q : '');
            line.appendChild(t);
        } else if (k === NODE_KIND.PI) {
            line.appendChild(h('span', { class: 'xa-comment', text: '<?' + doc.ownRaw(n).slice(0, 200) + '?>' }));
        } else {
            const t = h('span', { class: 'xa-text' + (k === NODE_KIND.CDATA ? ' xa-cdata' : '') });
            const raw = doc.src.slice(doc.ts[n], Math.min(doc.te[n], doc.ts[n] + 300)).replace(/\s+/g, ' ').trim();
            appendHighlighted(t, (k === NODE_KIND.CDATA ? 'CDATA: ' : '') + raw, isHit ? q : '');
            line.appendChild(t);
        }
        row.appendChild(line);
        return row;
    }
}

// ---------------------------------------------------------------------------
// Основная сборка представления
// ---------------------------------------------------------------------------

/**
 * @param {object} ctx
 * @param {import('./xml-analyzer-model.js').XmlDoc|null} ctx.doc
 * @param {object} ctx.meta {fileName,size,encodingUsed,reportType,sourceFormat}
 * @param {object} ctx.requisites
 * @param {object} ctx.sign
 * @param {Array} ctx.findings
 * @param {Node|null} ctx.reportNode готовый отчёт по известному типу
 * @param {()=>Array<{id:string,name:string,doc:object}>} ctx.getOtherDocs
 * @param {(msg:string,type?:string)=>void} ctx.notify
 * @param {()=>void} ctx.requestSecondFile
 * @param {(cert:object)=>void} ctx.showCertificate
 */
export function createExplorerView(ctx) {
    const { doc, meta = {}, requisites, sign, findings, notify } = ctx;
    const root = h('div', { class: 'xa-result' });
    const disposers = [];

    const say = (m, t = 'success') => notify && notify(m, t);
    const copy = async (text, okMsg = 'Скопировано') => {
        const ok = await copyText(text);
        say(ok ? okMsg : 'Не удалось скопировать в буфер обмена', ok ? 'success' : 'error');
    };

    const tabs = [];
    if (ctx.reportNode) tabs.push({ id: 'report', label: 'Отчёт', icon: 'fa-file-lines' });
    tabs.push({ id: 'overview', label: 'Обзор', icon: 'fa-gauge-high' });
    if (doc) {
        tabs.push({ id: 'tree', label: 'Дерево', icon: 'fa-sitemap' });
        tabs.push({ id: 'structure', label: 'Структура и таблицы', icon: 'fa-table' });
    }
    tabs.push({ id: 'signatures', label: 'Подписи', icon: 'fa-file-signature', count: (sign.certificates || []).length });
    if (doc) tabs.push({ id: 'compare', label: 'Сравнение', icon: 'fa-code-compare' });

    const tablist = h('div', { class: 'xa-tabs', role: 'tablist', 'aria-label': 'Разделы анализа' });
    const panels = h('div', { class: 'xa-panels' });
    const built = new Map();
    const tabBtns = new Map();
    const panelEls = new Map();
    let active = '';

    const builders = {
        report: () => h('div', { class: 'xa-report-host' }, ctx.reportNode),
        overview: () => buildOverview(),
        tree: () => buildTree(),
        structure: () => buildStructure(),
        signatures: () => buildSignatures(),
        compare: () => buildCompare(),
    };

    function activate(id, { focus = false } = {}) {
        if (!builders[id]) return;
        active = id;
        for (const [tid, btn] of tabBtns) {
            const on = tid === id;
            btn.classList.toggle('xa-tab-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
            btn.tabIndex = on ? 0 : -1;
        }
        for (const [pid, el] of panelEls) el.hidden = pid !== id;
        if (!built.has(id)) {
            const el = panelEls.get(id);
            let content;
            try {
                content = builders[id]();
            } catch (e) {
                console.error('[xml-analyzer] ошибка построения раздела', id, e);
                content = h('div', { class: 'xa-empty' }, `Не удалось построить раздел: ${e.message}`);
            }
            el.replaceChildren(content);
            built.set(id, content);
        }
        const hook = panelHooks[id];
        if (hook) hook();
        if (focus) tabBtns.get(id).focus();
        try {
            localStorage.setItem('xmlAnalyzerLastTab', id);
        } catch {
            // хранилище недоступно
        }
    }
    const panelHooks = {};

    for (const t of tabs) {
        const btn = h(
            'button',
            {
                type: 'button',
                class: 'xa-tab',
                role: 'tab',
                id: 'xa-tab-' + t.id,
                'aria-controls': 'xa-panel-' + t.id,
                'aria-selected': 'false',
                onclick: () => activate(t.id),
            },
            h('i', { class: `fas ${t.icon}`, 'aria-hidden': 'true' }),
            h('span', { class: 'xa-tab-label', text: t.label }),
            t.count ? h('span', { class: 'xa-tab-count', text: String(t.count) }) : null,
        );
        tabBtns.set(t.id, btn);
        tablist.appendChild(btn);
        const panel = h('section', { class: 'xa-panel', role: 'tabpanel', id: 'xa-panel-' + t.id, 'aria-labelledby': 'xa-tab-' + t.id, hidden: true });
        panelEls.set(t.id, panel);
        panels.appendChild(panel);
    }
    tablist.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const ids = tabs.map((t) => t.id);
        let i = ids.indexOf(active);
        i = (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
        activate(ids[i], { focus: true });
        e.preventDefault();
    });

    // ---------- Шапка ----------
    function buildHeader() {
        const st = doc ? doc.stats() : null;
        const chips = [];
        if (meta.size !== undefined) chips.push(['fa-weight-hanging', fmtSize(meta.size)]);
        if (st) {
            chips.push(['fa-circle-nodes', `${fmtNum(st.elements)} эл.`]);
            chips.push(['fa-layer-group', `глубина ${st.maxDepth}`]);
        }
        if (meta.encodingUsed) chips.push(['fa-font', meta.encodingUsed]);
        const actions = h('div', { class: 'xa-actions' });
        if (doc) {
            actions.appendChild(button('Копировать сводку', { icon: 'fa-copy', title: 'Скопировать текстовую сводку анализа для тикета', onclick: () => copy(textReport(), 'Сводка скопирована — вставьте её в тикет') }));
            actions.appendChild(button('JSON', { icon: 'fa-file-code', title: 'Скачать документ как JSON', onclick: exportJson }));
            actions.appendChild(button('Сводка .txt', { icon: 'fa-file-arrow-down', title: 'Скачать сводку анализа текстовым файлом', onclick: () => downloadData(`${safeFileBase(meta.fileName)}_сводка.txt`, '﻿' + textReport()) }));
        }
        return h(
            'div',
            { class: 'xa-head' },
            h(
                'div',
                { class: 'xa-head-main' },
                h('h2', { class: 'xa-title', text: meta.title || meta.fileName || 'Результат анализа' }),
                meta.subtitle ? h('p', { class: 'xa-sub', text: meta.subtitle }) : null,
                h('div', { class: 'xa-chips' }, chips.map(([ic, tx]) => h('span', { class: 'xa-chip' }, h('i', { class: `fas ${ic}`, 'aria-hidden': 'true' }), ' ', tx))),
            ),
            actions,
        );
    }

    function textReport() {
        return buildTextReport({ doc, requisites, sign, findings, meta });
    }

    function exportJson() {
        try {
            const json = JSON.stringify(nodeToJson(doc, 0), null, 2);
            downloadData(`${safeFileBase(meta.fileName)}.json`, json, 'application/json;charset=utf-8');
        } catch (e) {
            say(`Не удалось выгрузить JSON: ${e.message}`, 'error');
        }
    }

    // ---------- Обзор ----------
    function card(title, icon, body, { cls = '', actions = null } = {}) {
        return h(
            'section',
            { class: `xa-card ${cls}` },
            h('div', { class: 'xa-card-head' }, h('h3', { class: 'xa-card-title' }, icon ? h('i', { class: `fas ${icon}`, 'aria-hidden': 'true' }) : null, ' ', title), actions),
            h('div', { class: 'xa-card-body' }, body),
        );
    }

    function kv(label, value, { mono = false, level = null, title = '' } = {}) {
        if (value === null || value === undefined || value === '') return null;
        return h(
            'div',
            { class: 'xa-kv' },
            h('span', { class: 'xa-k', text: label }),
            h('span', { class: `xa-v${mono ? ' xa-mono' : ''}${level ? ' xa-lv-' + level : ''}`, title: title || null, text: String(value) }),
        );
    }

    function locate(node) {
        if (!doc || node === undefined || node === null || node < 1) return;
        activate('tree');
        if (treeApi) treeApi.reveal(node);
    }

    function buildOverview() {
        const wrap = h('div', { class: 'xa-grid' });
        // быстрые выводы
        const list = h('ul', { class: 'xa-findings' });
        for (const f of findings) {
            const li = h('li', { class: `xa-finding xa-f-${f.level}` }, iconEl(f.level), h('span', { class: 'xa-f-text', text: f.text }));
            if (f.node && f.node > 0 && doc) {
                li.appendChild(button('', { icon: 'fa-location-crosshairs', title: 'Показать в дереве', cls: 'xa-btn-icon', onclick: () => locate(f.node) }));
            }
            list.appendChild(li);
        }
        const worst = findings.some((f) => f.level === 'error') ? 'error' : findings.some((f) => f.level === 'warn') ? 'warn' : 'ok';
        wrap.appendChild(
            card(
                'Быстрые выводы',
                'fa-bolt',
                list,
                {
                    cls: `xa-card-wide xa-card-${worst}`,
                    actions: doc ? button('Копировать для тикета', { icon: 'fa-copy', onclick: () => copy(textReport(), 'Сводка скопирована — вставьте её в тикет') }) : null,
                },
            ),
        );

        // ключевые реквизиты
        if (requisites && (requisites.items.length || requisites.empty.length)) {
            const body = h('div', { class: 'xa-req' });
            for (const it of requisites.items) {
                const level = it.status === 'ok' ? 'ok' : it.status === 'error' ? 'error' : 'info';
                const row = h(
                    'div',
                    { class: 'xa-req-row' },
                    h('span', { class: 'xa-req-label', text: it.label }),
                    h('button', { type: 'button', class: 'xa-req-val xa-mono', title: 'Копировать значение', onclick: () => copy(it.value, `${it.label} скопирован`), text: it.value }),
                    it.status === 'ok' || it.status === 'error'
                        ? badge(it.status === 'ok' ? 'корректно' : 'ошибка', level, it.note || '')
                        : null,
                    it.count > 1 ? h('span', { class: 'xa-req-cnt', title: 'Сколько раз встречается', text: `×${it.count}` }) : null,
                    it.status === 'error' && it.note ? h('span', { class: 'xa-req-note', text: it.note }) : null,
                    doc ? button('', { icon: 'fa-location-crosshairs', title: 'Показать в дереве', cls: 'xa-btn-icon', onclick: () => locate(it.node) }) : null,
                );
                body.appendChild(row);
            }
            if (requisites.hiddenCount > 0) body.appendChild(h('p', { class: 'xa-hint', text: `Ещё значений не показано: ${fmtNum(requisites.hiddenCount)}. Остальное — в разделе «Структура и таблицы».` }));
            if (requisites.amountTotal !== null && requisites.amountCount > 1) {
                body.appendChild(h('p', { class: 'xa-hint', text: `Сумма по полям «сумма/итого/всего»: ${requisites.amountTotal.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} (значений: ${fmtNum(requisites.amountCount)}).` }));
            }
            wrap.appendChild(
                card('Ключевые реквизиты', 'fa-id-card', body, {
                    actions: button('CSV', {
                        icon: 'fa-file-csv',
                        title: 'Скачать реквизиты в CSV',
                        onclick: () => downloadData(`${safeFileBase(meta.fileName)}_реквизиты.csv`, '﻿' + toCsv(requisitesToCsvRows(requisites)), 'text/csv;charset=utf-8'),
                    }),
                }),
            );
        } else if (doc) {
            wrap.appendChild(card('Ключевые реквизиты', 'fa-id-card', h('p', { class: 'xa-empty', text: 'Реквизиты (ИНН, КПП, ОГРН, СНИЛС, БИК, даты, суммы) в документе не найдены по именам тегов и атрибутов.' })));
        }

        // статистика
        if (doc) {
            const st = doc.stats();
            const body = h('div', { class: 'xa-stats' });
            const rows = [
                kv('Корневой элемент', st.rootName || '—', { mono: true }),
                kv('Пространство имён корня', st.rootNamespace || (st.rootName ? 'не задано' : ''), { mono: true }),
                kv('Версия / схема формата', formatVersionOf(doc), { mono: true }),
                kv('Размер', fmtSize(meta.size ?? doc.src.length)),
                kv('Кодировка', meta.encodingUsed ? `${meta.encodingUsed}${doc.decl && doc.decl.encoding ? ` (декларация: ${doc.decl.encoding})` : ''}` : doc.decl && doc.decl.encoding),
                kv('Версия XML', doc.decl && doc.decl.version),
                kv('Элементов', fmtNum(st.elements)),
                kv('Атрибутов', fmtNum(st.attributes)),
                kv('Текстовых узлов', fmtNum(st.textNodes + st.cdata)),
                kv('Комментариев', st.comments ? fmtNum(st.comments) : ''),
                kv('Максимальная глубина', st.maxDepth),
                kv('Уникальных тегов', fmtNum(st.distinctNames)),
                kv('Уникальных путей', fmtNum(st.distinctPaths)),
                kv('Ошибок структуры', doc.errors.length ? fmtNum(doc.errors.length + (doc.errorsSuppressed || 0)) : 'нет', { level: doc.errors.length ? 'error' : 'ok' }),
            ];
            rows.forEach((r) => r && body.appendChild(r));
            if (st.namespaces.length) {
                const ns = h('div', { class: 'xa-ns' }, h('div', { class: 'xa-k', text: 'Пространства имён' }));
                st.namespaces.slice(0, 12).forEach((n) => ns.appendChild(h('div', { class: 'xa-ns-row xa-mono' }, h('b', { text: n.prefix || '(по умолчанию)' }), ' → ', n.uri)));
                if (st.namespaces.length > 12) ns.appendChild(h('div', { class: 'xa-hint', text: `… и ещё ${st.namespaces.length - 12}` }));
                body.appendChild(ns);
            }
            if (st.topNames.length) {
                const chips = h('div', { class: 'xa-topnames' });
                st.topNames.slice(0, 14).forEach((t) =>
                    chips.appendChild(
                        h('button', { type: 'button', class: 'xa-chip xa-chip-btn', title: 'Найти в дереве', onclick: () => { activate('tree'); searchApi.run(t.name, { names: true, attrs: false, values: false }); } }, t.name, ' ', h('b', { text: fmtNum(t.count) })),
                    ),
                );
                body.appendChild(h('div', { class: 'xa-k xa-topnames-label', text: 'Частые теги' }));
                body.appendChild(chips);
            }
            wrap.appendChild(card('Статистика документа', 'fa-chart-simple', body));
        }

        // подписи (кратко)
        const certs = sign.certificates || [];
        const sbody = h('div', { class: 'xa-sigsum' });
        if (certs.length) {
            certs.slice(0, 6).forEach((c) => {
                const st = certValidityState(c.validity);
                const lvl = st.state === 'valid' ? 'ok' : st.state === 'soon' ? 'warn' : st.state === 'unknown' ? 'info' : 'error';
                sbody.appendChild(
                    h('div', { class: 'xa-sig-line' }, badge(st.state === 'valid' ? 'действует' : st.state === 'soon' ? 'скоро истечёт' : st.state === 'expired' ? 'истёк' : st.state === 'notyet' ? 'не начал действовать' : 'срок неизвестен', lvl, st.label), ' ', h('span', { class: 'xa-sig-name', text: c.ownerFio || c.thumbprint }), c.subject && c.subject.O ? h('span', { class: 'xa-sig-org', text: ` — ${c.subject.O}` }) : null),
                );
            });
            sbody.appendChild(button('Все подписи и сертификаты', { icon: 'fa-arrow-right', onclick: () => activate('signatures') }));
        } else {
            sbody.appendChild(h('p', { class: 'xa-empty', text: (sign.signatures || []).length || (sign.cms || []).length ? 'Подписи найдены, но сертификаты разобрать не удалось.' : 'Подписи и сертификаты в документе не найдены.' }));
        }
        wrap.appendChild(card('Подписи и сертификаты', 'fa-file-signature', sbody));
        return wrap;
    }

    // ---------- Дерево ----------
    let treeApi = null;
    const searchApi = { run: () => {} };

    function buildTree() {
        const wrap = h('div', { class: 'xa-treewrap' });
        const stored = (() => {
            try {
                return JSON.parse(localStorage.getItem('xmlAnalyzerSearchOpts') || '{}');
            } catch {
                return {};
            }
        })();
        const opts = { names: stored.names !== false, attrs: stored.attrs !== false, values: stored.values !== false };

        const input = h('input', { type: 'search', class: 'xa-input', placeholder: 'Поиск по тегам, атрибутам и значениям…', 'aria-label': 'Поиск по документу', autocomplete: 'off', spellcheck: 'false' });
        const status = h('span', { class: 'xa-search-status', 'aria-live': 'polite' });
        const mkOpt = (key, label) => {
            const cb = h('input', { type: 'checkbox', checked: opts[key] ? true : null });
            cb.checked = opts[key];
            cb.addEventListener('change', () => {
                opts[key] = cb.checked;
                try {
                    localStorage.setItem('xmlAnalyzerSearchOpts', JSON.stringify(opts));
                } catch {
                    // ignore
                }
                run(input.value);
            });
            return h('label', { class: 'xa-opt' }, cb, h('span', { text: label }));
        };
        let results = [];
        let cur = -1;
        let ctl = null;
        let timer = 0;
        let lastQuery = '';

        const prevBtn = button('', { icon: 'fa-chevron-up', title: 'Предыдущее совпадение (Shift+Enter)', cls: 'xa-btn-icon', onclick: () => step(-1) });
        const nextBtn = button('', { icon: 'fa-chevron-down', title: 'Следующее совпадение (Enter)', cls: 'xa-btn-icon', onclick: () => step(1) });

        function paintStatus(extra = '') {
            if (!lastQuery) status.textContent = '';
            else if (!results.length) status.textContent = extra || 'Ничего не найдено';
            else status.textContent = `${cur + 1} из ${fmtNum(results.length)}${extra}`;
            prevBtn.disabled = nextBtn.disabled = results.length === 0;
        }
        function step(d) {
            if (!results.length) return;
            cur = (cur + d + results.length) % results.length;
            tree.setMatches(results, lastQuery, cur);
            tree.reveal(results[cur]);
            paintStatus(searchTruncated ? '+' : '');
        }
        let searchTruncated = false;
        async function run(q, override) {
            if (override) Object.assign(opts, override), wrap.querySelectorAll('.xa-opt input').forEach((c, i) => (c.checked = [opts.names, opts.attrs, opts.values][i]));
            if (override) input.value = q;
            q = String(q || '').trim();
            if (ctl) ctl.abort();
            lastQuery = q;
            if (!q) {
                results = [];
                cur = -1;
                tree.setMatches([], '', -1);
                paintStatus();
                return;
            }
            ctl = new AbortController();
            const my = ctl;
            status.textContent = 'Поиск…';
            const r = await searchDoc(doc, q, {
                ...opts,
                signal: my.signal,
                onProgress: (p) => {
                    if (!my.signal.aborted) status.textContent = `Поиск… ${Math.round(p * 100)}%`;
                },
            });
            if (my.signal.aborted || r.cancelled) return;
            results = r.ids;
            searchTruncated = r.truncated;
            cur = results.length ? 0 : -1;
            tree.setMatches(results, q, cur);
            if (results.length) tree.reveal(results[0]);
            paintStatus(r.truncated ? '+ (показаны первые совпадения)' : '');
        }
        searchApi.run = run;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => run(input.value), 280);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(timer);
                if (input.value.trim() === lastQuery && results.length) step(e.shiftKey ? -1 : 1);
                else run(input.value);
            } else if (e.key === 'Escape') {
                input.value = '';
                run('');
            }
        });

        const gotoInput = h('input', { type: 'text', class: 'xa-input xa-input-path', placeholder: 'Перейти по пути: /Корень/Элемент[2]', 'aria-label': 'Перейти по пути', spellcheck: 'false' });
        gotoInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const r = doc.resolvePath(gotoInput.value);
            if (!r) return say('Путь не найден в документе', 'error');
            tree.reveal(r.node);
        });

        const toolbar = h(
            'div',
            { class: 'xa-toolbar' },
            h('div', { class: 'xa-search' }, h('i', { class: 'fas fa-magnifying-glass xa-search-ico', 'aria-hidden': 'true' }), input, prevBtn, nextBtn, status),
            h('div', { class: 'xa-opts' }, mkOpt('names', 'Теги'), mkOpt('attrs', 'Атрибуты'), mkOpt('values', 'Значения')),
            h(
                'div',
                { class: 'xa-tbtns' },
                button('', { icon: 'fa-angles-down', title: 'Развернуть до 3 уровней', cls: 'xa-btn-icon', onclick: () => tree.expandToDepth(3) }),
                button('', { icon: 'fa-layer-group', title: 'Развернуть до 6 уровней', cls: 'xa-btn-icon', onclick: () => tree.expandToDepth(6) }),
                button('', { icon: 'fa-angles-up', title: 'Свернуть всё', cls: 'xa-btn-icon', onclick: () => tree.collapseAll() }),
            ),
        );
        const pathBar = h('div', { class: 'xa-pathbar' }, h('span', { class: 'xa-pathbar-label', text: 'Путь' }), h('code', { class: 'xa-pathcode', text: 'выберите узел' }), button('', { icon: 'fa-copy', title: 'Скопировать путь', cls: 'xa-btn-icon', onclick: () => pathCode.textContent !== 'выберите узел' && copy(currentPath(), 'Путь скопирован') }), gotoInput);
        const pathCode = pathBar.querySelector('.xa-pathcode');
        let selAttr = null;
        const currentPath = () => (tree.selected > 0 ? doc.pathOf(tree.selected, selAttr) : '');

        const details = h('aside', { class: 'xa-details', 'aria-label': 'Свойства узла' }, h('p', { class: 'xa-empty', text: 'Выберите узел в дереве, чтобы увидеть путь, атрибуты и значение.' }));

        const tree = new VirtualTree(doc, {
            onSelect: (n) => {
                selAttr = null;
                renderDetails(n);
            },
        });
        disposers.push(() => tree.destroy());
        treeApi = tree;

        function renderDetails(n) {
            const k = doc.kind[n];
            pathCode.textContent = doc.pathOf(n);
            const body = h('div', { class: 'xa-det' });
            const title = k === NODE_KIND.ELEMENT ? `<${doc.name(n)}>` : k === NODE_KIND.COMMENT ? 'Комментарий' : k === NODE_KIND.PI ? 'Инструкция обработки' : k === NODE_KIND.CDATA ? 'Раздел CDATA' : 'Текст';
            body.appendChild(h('h4', { class: 'xa-det-title xa-mono', text: title }));
            const meta1 = h('div', { class: 'xa-det-meta' });
            const ln = doc.lineOf(n);
            [
                ['Строка', fmtNum(ln)],
                k === NODE_KIND.ELEMENT && doc.namespaceUri(n) ? ['Пространство имён', doc.namespaceUri(n)] : null,
                k === NODE_KIND.ELEMENT && doc.prefix(n) ? ['Префикс', doc.prefix(n)] : null,
                doc.first[n] >= 0 ? ['Дочерних узлов', fmtNum(doc.childCount(n))] : null,
                doc.sub[n] > 0 ? ['Всего потомков', fmtNum(doc.sub[n])] : null,
                ['Глубина', String(doc.depth[n] + 1)],
            ]
                .filter(Boolean)
                .forEach(([a, b]) => meta1.appendChild(kv(a, b, { mono: a === 'Пространство имён' })));
            body.appendChild(meta1);

            // атрибуты
            if (k === NODE_KIND.ELEMENT && doc.aCnt[n]) {
                const tbl = h('div', { class: 'xa-attrs' });
                tbl.appendChild(h('h5', { class: 'xa-det-h', text: `Атрибуты (${doc.aCnt[n]})` }));
                for (const a of doc.attrs(n)) {
                    const kind = requisiteKindByName(a.name);
                    const chk = kind ? checkRequisite(kind, a.value) : null;
                    tbl.appendChild(
                        h(
                            'div',
                            { class: 'xa-attr' + (selAttr === a.name ? ' xa-attr-sel' : '') },
                            h('button', { type: 'button', class: 'xa-attr-name xa-mono', title: 'Показать путь к атрибуту', onclick: () => { selAttr = a.name; pathCode.textContent = doc.pathOf(n, a.name); } , text: a.name }),
                            h('span', { class: 'xa-attr-val xa-mono', text: a.value.length > 2000 ? a.value.slice(0, 2000) + '…' : a.value }),
                            chk && (chk.status === 'ok' || chk.status === 'error') && (kind !== 'date' && kind !== 'amount') ? badge(chk.status === 'ok' ? '✓' : '✗', chk.status, chk.note) : null,
                            button('', { icon: 'fa-copy', title: 'Копировать значение', cls: 'xa-btn-icon', onclick: () => copy(a.value) }),
                        ),
                    );
                }
                body.appendChild(tbl);
            }

            // значение
            const hasVal = k !== NODE_KIND.ELEMENT ? true : doc.hasOwnText(n);
            if (hasVal) {
                const full = doc.ownText(n);
                const LIM = 20000;
                const valBox = h('div', { class: 'xa-valbox' });
                valBox.appendChild(h('h5', { class: 'xa-det-h' }, 'Значение ', h('span', { class: 'xa-muted', text: `(${fmtNum(full.length)} симв.)` })));
                const pre = h('pre', { class: 'xa-pre', text: full.length > LIM ? full.slice(0, LIM) + '\n… (обрезано)' : full });
                valBox.appendChild(pre);
                const acts = h('div', { class: 'xa-det-acts' });
                acts.appendChild(button('Копировать значение', { icon: 'fa-copy', onclick: () => copy(full) }));
                if (full.length > LIM) acts.appendChild(button('Показать полностью', { icon: 'fa-expand', onclick: (e) => { pre.textContent = full; e.currentTarget.remove(); } }));
                const compact = full.replace(/\s+/g, '');
                if (compact.length >= 200 && /^[A-Za-z0-9+/=_-]+$/.test(compact)) {
                    acts.appendChild(
                        button('Разобрать как сертификат/подпись', {
                            icon: 'fa-key',
                            onclick: async (e) => {
                                const btn = e.currentTarget;
                                const bytes = base64ToBytes(compact);
                                const r = bytes ? await analyzeBlob(bytes) : { type: 'unknown' };
                                const out = h('div', { class: 'xa-blob' });
                                if (r.type === 'certificate') {
                                    const st = certValidityState(r.cert.validity);
                                    out.appendChild(kv('Тип', 'Сертификат X.509'));
                                    out.appendChild(kv('Владелец', r.cert.ownerFio));
                                    out.appendChild(kv('Организация', r.cert.subject.O));
                                    out.appendChild(kv('Издатель', r.cert.issuer.CN || r.cert.issuer.O));
                                    out.appendChild(kv('Срок', st.label, { level: st.state === 'valid' ? 'ok' : st.state === 'soon' ? 'warn' : 'error' }));
                                    out.appendChild(kv('Отпечаток SHA-1', r.cert.thumbprint, { mono: true }));
                                } else if (r.type === 'cms') {
                                    out.appendChild(kv('Тип', `Подпись CMS (${r.cms.detached ? 'отсоединённая' : 'присоединённая'})`));
                                    out.appendChild(kv('Подписантов', r.cms.signers.length));
                                    r.cms.certs.filter((c) => !c.error).forEach((c) => out.appendChild(kv('Сертификат', `${c.ownerFio} — ${certValidityState(c.validity).label}`)));
                                } else out.appendChild(h('p', { class: 'xa-empty', text: 'Данные не распознаны как сертификат или подпись CMS.' }));
                                btn.replaceWith(out);
                            },
                        }),
                    );
                }
                valBox.appendChild(acts);
                body.appendChild(valBox);
            }

            // кто внутри
            if (k === NODE_KIND.ELEMENT && doc.first[n] >= 0) {
                const counts = new Map();
                for (let c = doc.first[n]; c >= 0; c = doc.next[c]) {
                    if (doc.kind[c] !== NODE_KIND.ELEMENT) continue;
                    const nm = doc.name(c);
                    counts.set(nm, (counts.get(nm) || 0) + 1);
                    if (counts.size > 60) break;
                }
                if (counts.size) {
                    const chips = h('div', { class: 'xa-topnames' });
                    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).forEach(([nm, c]) => chips.appendChild(h('span', { class: 'xa-chip' }, nm, c > 1 ? h('b', { text: ' ×' + c }) : null)));
                    body.appendChild(h('h5', { class: 'xa-det-h', text: 'Внутри' }));
                    body.appendChild(chips);
                }
            }

            // действия
            if (k === NODE_KIND.ELEMENT) {
                const acts = h('div', { class: 'xa-det-acts' });
                acts.appendChild(button('Копировать XML', { icon: 'fa-code', title: 'Копировать фрагмент XML', onclick: () => { const s = serializeNode(doc, n); copy(s.text, s.truncated ? 'Фрагмент скопирован (обрезан по размеру)' : 'Фрагмент XML скопирован'); } }));
                acts.appendChild(button('Скачать XML', { icon: 'fa-download', onclick: () => downloadData(`${safeFileBase(doc.name(n))}.xml`, serializeNode(doc, n, { maxChars: 50_000_000 }).text, 'application/xml;charset=utf-8') }));
                acts.appendChild(button('Как JSON', { icon: 'fa-file-code', onclick: () => copy(JSON.stringify(nodeToJson(doc, n), null, 2), 'JSON скопирован') }));
                const rep = doc.first[n] >= 0 ? repeatedChildren(doc, n) : [];
                if (rep.length > 1) {
                    acts.appendChild(button(`Таблица (${fmtNum(rep.length)} эл.)`, { icon: 'fa-table', title: 'Показать повторяющиеся дочерние элементы таблицей', onclick: () => { activate('structure'); structureApi.showNodes(rep, `${doc.name(rep[0])} внутри ${doc.name(n)}`); } }));
                }
                body.appendChild(acts);
            }
            details.replaceChildren(body);
        }

        const split = h('div', { class: 'xa-split' }, h('div', { class: 'xa-treepane' }, tree.viewport), details);
        wrap.append(toolbar, pathBar, split);
        paintStatus();
        // начальный выбор: корневой элемент
        if (doc.rootElement > 0) setTimeout(() => tree.select(doc.rootElement, { scroll: false }), 0);
        panelHooks.tree = () => tree.schedule(true);
        return wrap;
    }

    // ---------- Структура и таблицы ----------
    const structureApi = { showNodes: () => {} };

    function buildStructure() {
        const wrap = h('div', { class: 'xa-structure' });
        const rows = structureRows(doc);
        const filter = h('input', { type: 'search', class: 'xa-input', placeholder: `Фильтр путей (${fmtNum(rows.length)})…`, 'aria-label': 'Фильтр структуры' });
        const list = h('div', { class: 'xa-paths', role: 'list' });
        const tableHost = h('div', { class: 'xa-tablehost' }, h('p', { class: 'xa-empty', text: 'Выберите путь слева, чтобы увидеть все такие элементы таблицей (атрибуты и вложенные поля — столбцы).' }));
        let activePid = -1;

        function paint() {
            const q = filter.value.trim().toLowerCase();
            const frag = document.createDocumentFragment();
            let shown = 0;
            for (const r of rows) {
                if (q && !r.path.toLowerCase().includes(q) && !r.attrs.some((a) => a.toLowerCase().includes(q))) continue;
                if (shown++ > 3000) break;
                const item = h(
                    'button',
                    { type: 'button', role: 'listitem', class: 'xa-path' + (r.pathId === activePid ? ' xa-path-active' : ''), style: { paddingLeft: 8 + Math.min(r.depth - 1, 12) * 12 + 'px' }, onclick: () => { activePid = r.pathId; paint(); showPath(r); }, title: r.path },
                    h('span', { class: 'xa-path-name xa-mono', text: r.name }),
                    h('span', { class: 'xa-path-cnt', text: fmtNum(r.count) }),
                    r.attrs.length ? h('span', { class: 'xa-path-attrs', text: '@' + r.attrs.slice(0, 4).join(' @') + (r.attrs.length > 4 ? ' …' : '') }) : null,
                );
                frag.appendChild(item);
            }
            if (!shown) frag.appendChild(h('p', { class: 'xa-empty', text: 'Ничего не найдено' }));
            list.replaceChildren(frag);
        }
        filter.addEventListener('input', paint);

        function showPath(r) {
            const nodes = nodesOfPath(doc, r.pathId);
            showNodes(nodes, r.path, r.count > nodes.length ? `Показаны первые ${fmtNum(nodes.length)} из ${fmtNum(r.count)}` : '');
        }

        function showNodes(nodes, title, note = '') {
            tableHost.replaceChildren(buildTableView(nodes, title, note));
        }
        structureApi.showNodes = (nodes, title) => {
            showNodes(nodes, title);
        };

        function buildTableView(nodes, title, note) {
            const table = buildTable(doc, nodes);
            const PAGE = 200;
            let page = 0;
            let sortCol = -1;
            let sortDir = 1;
            let filterText = '';
            let view = nodes.slice();
            let cache = null;

            const info = h('span', { class: 'xa-muted' });
            const tbl = h('table', { class: 'xa-table' });
            const scroller = h('div', { class: 'xa-table-scroll' }, tbl);
            const pager = h('div', { class: 'xa-pager' });
            const ftxt = h('input', { type: 'search', class: 'xa-input xa-input-sm', placeholder: 'Фильтр строк…', 'aria-label': 'Фильтр строк таблицы' });

            const cellText = (n, ci) => table.cell(n, table.columns[ci]);
            function recompute() {
                view = nodes.slice();
                if (filterText) {
                    const q = filterText.toLowerCase();
                    view = view.filter((n) => table.columns.some((c) => String(table.cell(n, c)).toLowerCase().includes(q)));
                }
                if (sortCol >= 0) {
                    const col = sortCol;
                    const keyed = view.map((n) => [n, cellText(n, col)]);
                    const numeric = keyed.every(([, v]) => v === '' || /^-?\d+([.,]\d+)?$/.test(String(v).trim()));
                    keyed.sort((a, b) => {
                        if (numeric) return (parseFloat(String(a[1]).replace(',', '.')) || 0) - (parseFloat(String(b[1]).replace(',', '.')) || 0);
                        return String(a[1]).localeCompare(String(b[1]), 'ru');
                    });
                    if (sortDir < 0) keyed.reverse();
                    view = keyed.map(([n]) => n);
                }
                page = 0;
                cache = null;
                draw();
            }
            function draw() {
                const thead = h('thead', null, h('tr', null, h('th', { class: 'xa-th-num', text: '#' }), table.columns.map((c, ci) => h('th', { scope: 'col', 'aria-sort': sortCol === ci ? (sortDir > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { type: 'button', class: 'xa-th-btn', title: 'Сортировать', onclick: () => { if (sortCol === ci) sortDir = -sortDir; else { sortCol = ci; sortDir = 1; } recompute(); } }, (c.type === 'attr' ? '@' : '') + c.label, sortCol === ci ? (sortDir > 0 ? ' ▲' : ' ▼') : '')))));
                const tbody = h('tbody');
                const from = page * PAGE;
                const to = Math.min(view.length, from + PAGE);
                for (let i = from; i < to; i++) {
                    const n = view[i];
                    const tr = h('tr', { tabindex: '0', title: 'Показать в дереве', onclick: () => locate(n), onkeydown: (e) => { if (e.key === 'Enter') locate(n); } });
                    tr.appendChild(h('td', { class: 'xa-td-num', text: String(i + 1) }));
                    for (let ci = 0; ci < table.columns.length; ci++) {
                        const v = String(cellText(n, ci));
                        const kind = requisiteKindByName(table.columns[ci].label);
                        const bad = kind && (kind === 'inn' || kind === 'snils' || kind === 'ogrn' || kind === 'kpp') && v && checkRequisite(kind, v).status === 'error';
                        tr.appendChild(h('td', { class: bad ? 'xa-td-bad' : null, title: bad ? 'Не проходит проверку' : null, text: v.length > 300 ? v.slice(0, 300) + '…' : v }));
                    }
                    tbody.appendChild(tr);
                }
                tbl.replaceChildren(thead, tbody);
                info.textContent = `Строк: ${fmtNum(view.length)}${view.length !== nodes.length ? ` из ${fmtNum(nodes.length)}` : ''}; столбцов: ${table.columns.length}`;
                const pages = Math.max(1, Math.ceil(view.length / PAGE));
                pager.replaceChildren(
                    pages > 1 ? button('', { icon: 'fa-chevron-left', title: 'Назад', cls: 'xa-btn-icon', onclick: () => { page = Math.max(0, page - 1); draw(); } }) : null,
                    pages > 1 ? h('span', { class: 'xa-muted', text: `Страница ${page + 1} из ${fmtNum(pages)}` }) : null,
                    pages > 1 ? button('', { icon: 'fa-chevron-right', title: 'Вперёд', cls: 'xa-btn-icon', onclick: () => { page = Math.min(pages - 1, page + 1); draw(); } }) : null,
                );
            }
            let t = 0;
            ftxt.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(() => { filterText = ftxt.value.trim(); recompute(); }, 250);
            });
            const head = h(
                'div',
                { class: 'xa-table-head' },
                h('h4', { class: 'xa-table-title xa-mono', text: title }),
                h('div', { class: 'xa-table-tools' },
                    ftxt,
                    button('CSV', { icon: 'fa-file-csv', title: 'Скачать таблицу в CSV (Excel)', onclick: () => downloadData(`${safeFileBase(meta.fileName)}_${safeFileBase(title.split('/').pop())}.csv`, '﻿' + toCsv(tableToCsvRows(table, view)), 'text/csv;charset=utf-8') }),
                    button('Копировать', { icon: 'fa-copy', title: 'Копировать таблицу (вставляется в Excel)', onclick: () => copy(tableToCsvRows(table, view.slice(0, 20000)).map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'), 'Таблица скопирована') }),
                    button('JSON', { icon: 'fa-file-code', onclick: () => downloadData(`${safeFileBase(meta.fileName)}_таблица.json`, JSON.stringify(view.map((n) => Object.fromEntries(table.columns.map((c) => [c.label, cellText(n, table.columns.indexOf(c))]))), null, 2), 'application/json;charset=utf-8') }),
                ),
            );
            draw();
            return h('div', { class: 'xa-tableview' }, head, note ? h('p', { class: 'xa-hint', text: note }) : null, info, scroller, pager);
        }

        paint();
        wrap.append(
            h('div', { class: 'xa-paths-pane' }, filter, list),
            tableHost,
        );
        return wrap;
    }

    // ---------- Подписи ----------
    function buildSignatures() {
        const wrap = h('div', { class: 'xa-sigs' });
        const certs = sign.certificates || [];
        if (!certs.length && !(sign.signatures || []).length && !(sign.cms || []).length) {
            wrap.appendChild(card('Подписи не найдены', 'fa-file-signature', h('p', { class: 'xa-empty', text: 'В документе нет подписи XMLDSig (<Signature>), подписи CMS и сертификатов X.509 — ни в тегах, ни в атрибутах (base64).' })));
            return wrap;
        }
        for (const sig of sign.signatures || []) {
            const body = h('div', { class: 'xa-stats' });
            [
                kv('Алгоритм подписи', sig.signatureMethod, { mono: true }),
                kv('Алгоритм хеширования', sig.digestMethods.join(', '), { mono: true }),
                kv('Каноникализация', sig.canonicalization, { mono: true }),
                kv('Ссылки (Reference)', sig.references.length ? sig.references.map((r) => r || '(весь документ)').join(', ') : '', { mono: true }),
                kv('Размер значения подписи', sig.valueLength ? `${fmtNum(sig.valueLength)} симв. base64` : ''),
                kv('Время подписания', sig.signingTime),
                kv('Субъект (X509SubjectName)', sig.subjectNames.join('; ')),
            ].forEach((r) => r && body.appendChild(r));
            if (doc) body.appendChild(button('Показать в дереве', { icon: 'fa-location-crosshairs', onclick: () => locate(sig.node) }));
            wrap.appendChild(card('Подпись XMLDSig', 'fa-signature', body));
        }
        for (const cms of sign.cms || []) {
            const body = h('div', { class: 'xa-stats' });
            body.appendChild(kv('Тип', cms.detached ? 'Отсоединённая подпись CMS (PKCS#7)' : 'Присоединённая подпись CMS (PKCS#7)'));
            body.appendChild(kv('Источник', cms.source));
            body.appendChild(kv('Алгоритмы хеширования', cms.digestAlgorithms.join(', ')));
            cms.signers.forEach((s, i) => {
                body.appendChild(kv(`Подписант ${i + 1}`, s.error || [(s.issuer && (s.issuer.CN || s.issuer.O)) || '', s.serialNumber ? `серия ${s.serialNumber}` : ''].filter(Boolean).join(', ')));
                if (s.signingTime) body.appendChild(kv('Время подписания', s.signingTime.toLocaleString('ru-RU')));
                if (s.signatureAlgorithm) body.appendChild(kv('Алгоритм', s.signatureAlgorithm));
            });
            if (doc && cms.node) body.appendChild(button('Показать в дереве', { icon: 'fa-location-crosshairs', onclick: () => locate(cms.node) }));
            wrap.appendChild(card('Подпись CMS', 'fa-signature', body));
        }
        for (const c of certs) wrap.appendChild(certCard(c));
        return wrap;
    }

    function certCard(c) {
        const st = certValidityState(c.validity);
        const lvl = st.state === 'valid' ? 'ok' : st.state === 'soon' ? 'warn' : st.state === 'unknown' ? 'info' : 'error';
        const body = h('div', { class: 'xa-stats' });
        const s = c.subject || {};
        const idv = (k, kind) => {
            if (!s[k]) return null;
            const chk = checkRequisite(kind, s[k]);
            return h('div', { class: 'xa-kv' }, h('span', { class: 'xa-k', text: REQUISITE_LABELS[kind] || k }), h('span', { class: 'xa-v xa-mono' }, s[k], ' ', chk.status === 'ok' ? badge('корректно', 'ok', chk.note) : chk.status === 'error' ? badge('ошибка', 'error', chk.note) : null));
        };
        [
            kv('Владелец', c.ownerFio),
            kv('Организация', s.O),
            kv('Должность', s.T),
            idv('INN', 'inn'),
            idv('INNLE', 'inn'),
            idv('SNILS', 'snils'),
            idv('OGRN', 'ogrn'),
            idv('OGRNIP', 'ogrn'),
            kv('Email', s.E),
            kv('Издатель', c.issuer && (c.issuer.CN || c.issuer.O)),
            kv('Организация-издатель', c.issuer && c.issuer.O && c.issuer.CN ? c.issuer.O : ''),
            kv('Серийный номер', c.serialNumber, { mono: true }),
            kv('Отпечаток SHA-1', c.thumbprint, { mono: true }),
            kv('Отпечаток SHA-256', c.thumbprintSha256, { mono: true }),
            kv('Действителен с', c.validity.notBefore ? new Date(c.validity.notBefore).toLocaleString('ru-RU') : ''),
            kv('Действителен по', c.validity.notAfter ? new Date(c.validity.notAfter).toLocaleString('ru-RU') : '', { level: lvl === 'ok' ? null : lvl }),
            kv('Алгоритм ключа', c.publicKeyAlgorithm && c.publicKeyAlgorithm.name),
            kv('Алгоритм подписи', c.signatureAlgorithm && c.signatureAlgorithm.name),
            kv('Использование ключа', ((c.extensions || []).find((e) => e.name === 'keyUsage') || {}).keyUsage?.join(', ')),
            kv('Расширенное использование', ((c.extensions || []).find((e) => e.name === 'extKeyUsage') || {}).extKeyUsage?.join(', ')),
            kv('Точки отзыва (CRL)', ((c.extensions || []).find((e) => e.name === 'cRLDistributionPoints') || {}).urls?.slice(0, 3).join(' ')),
            kv('Найден', c.source),
            c.selfSigned ? kv('Самоподписанный', 'да') : null,
        ].forEach((r) => r && body.appendChild(r));
        const acts = h('div', { class: 'xa-det-acts' });
        acts.appendChild(button('Скачать .cer', { icon: 'fa-download', onclick: () => downloadBase64(c.base64, `certificate_${c.thumbprint.slice(0, 8)}.cer`) }));
        acts.appendChild(button('Копировать PEM', { icon: 'fa-copy', onclick: () => copy(certToPem(c.base64), 'Сертификат (PEM) скопирован') }));
        acts.appendChild(button('Копировать отпечаток', { icon: 'fa-fingerprint', onclick: () => copy(c.thumbprint, 'Отпечаток скопирован') }));
        if (doc && c.node) acts.appendChild(button('В дереве', { icon: 'fa-location-crosshairs', onclick: () => locate(c.node) }));
        if (ctx.showCertificate) acts.appendChild(button('Подробнее', { icon: 'fa-circle-info', onclick: () => ctx.showCertificate(c) }));
        body.appendChild(acts);
        return card(c.ownerFio || 'Сертификат', 'fa-certificate', body, { cls: `xa-card-${lvl}`, actions: badge(st.label, lvl) });
    }

    function downloadBase64(b64, name) {
        const bytes = base64ToBytes(b64);
        if (!bytes) return say('Данные сертификата повреждены', 'error');
        downloadData(name, new Blob([bytes], { type: 'application/x-x509-ca-cert' }));
    }

    // ---------- Сравнение ----------
    function buildCompare() {
        const wrap = h('div', { class: 'xa-compare' });
        const host = h('div', { class: 'xa-cmp-host' });
        const select = h('select', { class: 'xa-input xa-select', 'aria-label': 'Документ для сравнения' });
        const bar = h('div', { class: 'xa-cmp-bar' }, h('span', { class: 'xa-muted', text: 'Сравнить с:' }), select, button('Загрузить второй файл', { icon: 'fa-upload', onclick: () => ctx.requestSecondFile && ctx.requestSecondFile() }));
        function refreshOptions() {
            const others = (ctx.getOtherDocs ? ctx.getOtherDocs() : []).filter((d) => d.doc !== doc);
            select.replaceChildren(h('option', { value: '', text: others.length ? 'Выберите документ…' : 'Нет других загруженных документов' }), ...others.map((d) => h('option', { value: d.id, text: d.name })));
            select.disabled = !others.length;
            return others;
        }
        let others = refreshOptions();
        select.addEventListener('change', () => {
            const d = others.find((x) => x.id === select.value);
            if (d) runDiff(d);
        });
        panelHooks.compare = () => {
            const prev = select.value;
            others = refreshOptions();
            if (prev && others.some((o) => o.id === prev)) select.value = prev;
            else if (others.length === 1 && !host.dataset.done) {
                select.value = others[0].id;
                runDiff(others[0]);
            }
        };
        function runDiff(other) {
            host.dataset.done = '1';
            host.replaceChildren(h('p', { class: 'xa-empty', text: 'Сравнение…' }));
            setTimeout(() => {
                let diff;
                try {
                    diff = diffDocs(doc, other.doc);
                } catch (e) {
                    host.replaceChildren(h('p', { class: 'xa-empty', text: `Не удалось сравнить: ${e.message}` }));
                    return;
                }
                host.replaceChildren(renderDiff(diff, other));
            }, 20);
        }
        function renderDiff(diff, other) {
            const total = diff.addedTotal + diff.removedTotal + diff.changedTotal;
            const summary = h('div', { class: 'xa-cmp-sum' },
                badge(`изменено ${fmtNum(diff.changedTotal)}`, diff.changedTotal ? 'warn' : 'ok'),
                badge(`добавлено ${fmtNum(diff.addedTotal)}`, diff.addedTotal ? 'info' : 'ok'),
                badge(`удалено ${fmtNum(diff.removedTotal)}`, diff.removedTotal ? 'error' : 'ok'),
                badge(`совпало ${fmtNum(diff.same)}`, 'ok'),
            );
            const rows = [];
            diff.changed.forEach((r) => rows.push({ type: 'changed', ...r }));
            diff.added.forEach((r) => rows.push({ type: 'added', ...r }));
            diff.removed.forEach((r) => rows.push({ type: 'removed', ...r }));
            const list = h('div', { class: 'xa-cmp-list' });
            let mode = 'all';
            let q = '';
            const filterBar = h('div', { class: 'xa-cmp-filters' });
            const ftxt = h('input', { type: 'search', class: 'xa-input xa-input-sm', placeholder: 'Фильтр по пути/значению…', 'aria-label': 'Фильтр различий' });
            const modes = [['all', 'Все'], ['changed', 'Изменено'], ['added', 'Добавлено'], ['removed', 'Удалено']];
            const mbtns = modes.map(([id, label]) => h('button', { type: 'button', class: 'xa-seg' + (id === mode ? ' xa-seg-on' : ''), onclick: () => { mode = id; mbtns.forEach((b, i) => b.classList.toggle('xa-seg-on', modes[i][0] === id)); paint(); } }, label));
            filterBar.append(...mbtns, ftxt, button('CSV', { icon: 'fa-file-csv', onclick: () => downloadData(`сравнение_${safeFileBase(meta.fileName)}_${safeFileBase(other.name)}.csv`, '﻿' + toCsv(diffToCsvRows(diff)), 'text/csv;charset=utf-8') }));
            function paint() {
                const ql = q.toLowerCase();
                const frag = document.createDocumentFragment();
                let n = 0;
                for (const r of rows) {
                    if (mode !== 'all' && r.type !== mode) continue;
                    if (ql && !(r.path + ' ' + (r.a || '') + ' ' + (r.b || '')).toLowerCase().includes(ql)) continue;
                    if (n++ >= 400) break;
                    const item = h('div', { class: `xa-diff xa-diff-${r.type}` },
                        h('span', { class: 'xa-diff-sign', text: r.type === 'added' ? '+' : r.type === 'removed' ? '−' : '≠' }),
                        h('div', { class: 'xa-diff-main' },
                            h('code', { class: 'xa-diff-path', text: r.path }),
                            r.type !== 'added' ? h('div', { class: 'xa-diff-a' }, h('span', { class: 'xa-diff-tag', text: 'было' }), h('span', { class: 'xa-mono', text: r.a === '' ? '(пусто)' : String(r.a).slice(0, 500) }), r.aAttrs ? h('span', { class: 'xa-muted xa-mono', text: ` [${r.aAttrs.slice(0, 200)}]` }) : null) : null,
                            r.type !== 'removed' ? h('div', { class: 'xa-diff-b' }, h('span', { class: 'xa-diff-tag', text: 'стало' }), h('span', { class: 'xa-mono', text: r.b === '' ? '(пусто)' : String(r.b).slice(0, 500) }), r.bAttrs ? h('span', { class: 'xa-muted xa-mono', text: ` [${r.bAttrs.slice(0, 200)}]` }) : null) : null,
                        ),
                        r.nodeA ? button('', { icon: 'fa-location-crosshairs', title: 'Показать в дереве', cls: 'xa-btn-icon', onclick: () => locate(r.nodeA) }) : null,
                    );
                    frag.appendChild(item);
                }
                if (!n) frag.appendChild(h('p', { class: 'xa-empty', text: total ? 'Нет различий по фильтру' : 'Документы идентичны по структуре и значениям.' }));
                else if (rows.length > 400) frag.appendChild(h('p', { class: 'xa-hint', text: 'Показаны первые 400 строк — уточните фильтр или выгрузите CSV.' }));
                list.replaceChildren(frag);
            }
            let tt = 0;
            ftxt.addEventListener('input', () => { clearTimeout(tt); tt = setTimeout(() => { q = ftxt.value.trim(); paint(); }, 250); });
            paint();
            return h('div', null, h('p', { class: 'xa-hint', text: `«${meta.fileName || 'Документ'}» (было) → «${other.name}» (стало)${diff.capped ? '. Документы очень большие: сравнены первые 300 000 элементов.' : ''}` }), summary, filterBar, list);
        }
        wrap.append(bar, host);
        if (!others.length) host.appendChild(h('p', { class: 'xa-empty', text: 'Загрузите второй XML (кнопка выше или перетащите несколько файлов сразу) — будут показаны отличия по структуре и значениям.' }));
        return wrap;
    }

    root.append(buildHeader(), tablist, panels);
    const initial = (() => {
        if (ctx.reportNode) return 'report';
        if (ctx.initialTab && builders[ctx.initialTab]) return ctx.initialTab;
        return 'overview';
    })();
    activate(initial);

    return {
        element: root,
        activate,
        destroy() {
            disposers.forEach((d) => d());
        },
        refreshCompare() {
            if (panelHooks.compare && built.has('compare')) panelHooks.compare();
        },
    };
}
