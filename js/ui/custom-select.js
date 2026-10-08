'use strict';

/**
 * Кастомные выпадающие списки поверх нативных <select> (progressive enhancement).
 * Нативный select остаётся источником истины: значение, change/input, form submit, disabled.
 * Opt-out: атрибут data-native-select. Multiple и size>1 остаются нативными.
 */

const ENHANCED = new WeakMap();
const OPEN_Z = 2147483000;
let openInstance = null;
let uid = 0;

function isEligible(sel) {
    if (!(sel instanceof HTMLSelectElement)) return false;
    if (sel.multiple || sel.size > 1) return false;
    if (sel.hasAttribute('data-native-select')) return false;
    if (sel.closest('[data-native-select]')) return false;
    return true;
}

function readOptions(sel) {
    const items = [];
    const walk = (parent, group) => {
        for (const node of parent.children) {
            if (node.tagName === 'OPTGROUP') {
                items.push({ type: 'group', label: node.label || '', disabled: node.disabled });
                walk(node, node);
            } else if (node.tagName === 'OPTION') {
                items.push({
                    type: 'option',
                    value: node.value,
                    label: node.textContent.trim() || node.label || ' ',
                    disabled: node.disabled || (group && group.disabled),
                    index: node.index,
                });
            }
        }
    };
    walk(sel, null);
    return items;
}

class CustomSelect {
    constructor(sel) {
        this.sel = sel;
        this.id = 'cs' + ++uid;
        this.open = false;
        this.active = -1;
        this.typeBuf = '';
        this.typeTimer = 0;
        this.build();
        this.bind();
        this.sync();
    }

    build() {
        const { sel } = this;
        const wrap = document.createElement('span');
        wrap.className = 'cs-wrap';
        const cls = sel.className || '';
        // сохраняем «ширину» нативного select: w-full и т.п. переносим на обёртку
        if (/\bw-full\b/.test(cls)) wrap.classList.add('cs-wrap--block');
        if (/\bw-auto\b/.test(cls)) wrap.classList.add('cs-wrap--auto');
        for (const c of cls.split(/\s+/)) {
            if (/^(flex-1|flex-grow|grow|min-w-0|shrink-0|flex-shrink-0|max-w-\S+|w-\d+\/\d+)$/.test(c)) {
                wrap.classList.add(c);
            }
        }
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(sel);
        sel.classList.add('cs-native');
        sel.tabIndex = -1;
        sel.setAttribute('aria-hidden', 'true');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cs-trigger';
        btn.setAttribute('role', 'combobox');
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', this.id + '-list');
        const label = sel.getAttribute('aria-label') || this.findLabel();
        if (label) btn.setAttribute('aria-label', label);
        btn.innerHTML =
            '<span class="cs-value"></span><svg class="cs-caret" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        wrap.appendChild(btn);

        const panel = document.createElement('div');
        panel.className = 'cs-panel';
        panel.hidden = true;
        panel.innerHTML =
            '<div class="cs-search-wrap" hidden><input type="text" class="cs-search" placeholder="Поиск…" autocomplete="off" aria-label="Поиск по списку"></div><ul class="cs-list" role="listbox" id="' +
            this.id +
            '-list"></ul>';
        this.wrap = wrap;
        this.btn = btn;
        this.panel = panel;
        this.list = panel.querySelector('.cs-list');
        this.searchWrap = panel.querySelector('.cs-search-wrap');
        this.search = panel.querySelector('.cs-search');
        this.valueEl = btn.querySelector('.cs-value');
    }

    findLabel() {
        const { sel } = this;
        if (sel.id) {
            const l = document.querySelector('label[for="' + CSS.escape(sel.id) + '"]');
            if (l) return l.textContent.trim();
        }
        const wrapLabel = sel.closest('label');
        return wrapLabel ? wrapLabel.textContent.trim().slice(0, 60) : '';
    }

    bind() {
        const { sel, btn } = this;
        btn.addEventListener('click', () => (this.open ? this.close(true) : this.openPanel()));
        btn.addEventListener('keydown', (e) => this.onTriggerKey(e));
        this.list.addEventListener('mousedown', (e) => e.preventDefault());
        this.list.addEventListener('click', (e) => {
            const li = e.target.closest('.cs-option');
            if (!li || li.getAttribute('aria-disabled') === 'true') return;
            this.choose(Number(li.dataset.index));
        });
        this.list.addEventListener('mousemove', (e) => {
            const li = e.target.closest('.cs-option');
            if (li && li.getAttribute('aria-disabled') !== 'true') this.setActive(Number(li.dataset.idx));
        });
        this.search.addEventListener('input', () => this.renderList());
        this.search.addEventListener('keydown', (e) => this.onPanelKey(e));
        sel.addEventListener('change', () => this.sync());
        // программная смена .value не шлёт события — перехватываем сеттеры
        this.patchValueSetters();
        this.mo = new MutationObserver(() => {
            this.sync();
            if (this.open) this.renderList();
        });
        this.mo.observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
        if (sel.form) {
            this.onReset = () => setTimeout(() => this.sync(), 0);
            sel.form.addEventListener('reset', this.onReset);
        }
    }

    patchValueSetters() {
        const sel = this.sel;
        const self = this;
        for (const prop of ['value', 'selectedIndex']) {
            const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
            if (!desc || !desc.set) continue;
            Object.defineProperty(sel, prop, {
                configurable: true,
                get() {
                    return desc.get.call(this);
                },
                set(v) {
                    desc.set.call(this, v);
                    self.sync();
                },
            });
        }
    }

    sync() {
        const { sel, btn } = this;
        const opt = sel.options[sel.selectedIndex];
        const text = opt ? opt.textContent.trim() : '';
        this.valueEl.textContent = text || ' ';
        this.valueEl.classList.toggle('cs-placeholder', !opt || (opt.value === '' && !!text));
        btn.disabled = sel.disabled;
        btn.classList.toggle('cs-invalid', sel.getAttribute('aria-invalid') === 'true');
        // скрыт сам select (hidden / .hidden / display:none) — прячем и обёртку
        let hide = sel.hidden;
        try {
            hide = hide || getComputedStyle(sel).display === 'none';
        } catch (_) {
            /* ignore */
        }
        this.wrap.style.display = hide ? 'none' : '';
    }

    renderList() {
        const items = readOptions(this.sel);
        const q = this.search.value.trim().toLowerCase();
        const optCount = items.filter((i) => i.type === 'option').length;
        this.searchWrap.hidden = optCount <= 12;
        this.visible = [];
        const frag = document.createDocumentFragment();
        let pendingGroup = null;
        let idx = 0;
        for (const it of items) {
            if (it.type === 'group') {
                pendingGroup = it;
                continue;
            }
            if (q && !it.label.toLowerCase().includes(q)) continue;
            if (pendingGroup) {
                const g = document.createElement('li');
                g.className = 'cs-group';
                g.setAttribute('role', 'presentation');
                g.textContent = pendingGroup.label;
                frag.appendChild(g);
                pendingGroup = null;
            }
            const li = document.createElement('li');
            li.className = 'cs-option';
            li.id = this.id + '-o' + idx;
            li.dataset.idx = String(idx);
            li.dataset.index = String(it.index);
            li.setAttribute('role', 'option');
            li.textContent = it.label;
            if (it.disabled) li.setAttribute('aria-disabled', 'true');
            const selected = it.index === this.sel.selectedIndex;
            li.setAttribute('aria-selected', selected ? 'true' : 'false');
            frag.appendChild(li);
            this.visible.push({ el: li, index: it.index, disabled: it.disabled });
            idx++;
        }
        if (!this.visible.length) {
            const e = document.createElement('li');
            e.className = 'cs-empty';
            e.textContent = 'Ничего не найдено';
            frag.appendChild(e);
        }
        this.list.replaceChildren(frag);
        const cur = this.visible.findIndex((v) => v.index === this.sel.selectedIndex);
        this.setActive(cur >= 0 ? cur : this.nextEnabled(-1, 1), true);
    }

    nextEnabled(from, dir) {
        const n = this.visible.length;
        if (!n) return -1;
        for (let i = 1; i <= n; i++) {
            const k = (((from + dir * i) % n) + n) % n;
            if (!this.visible[k].disabled) return k;
        }
        return -1;
    }

    setActive(i, scroll) {
        if (this.active >= 0 && this.visible && this.visible[this.active]) {
            this.visible[this.active].el.classList.remove('cs-active');
        }
        this.active = i;
        const v = this.visible && this.visible[i];
        if (!v) {
            this.btn.removeAttribute('aria-activedescendant');
            return;
        }
        v.el.classList.add('cs-active');
        this.btn.setAttribute('aria-activedescendant', v.el.id);
        if (scroll !== false) v.el.scrollIntoView({ block: 'nearest' });
    }

    openPanel() {
        if (this.sel.disabled) return;
        if (openInstance && openInstance !== this) openInstance.close(false);
        this.open = true;
        openInstance = this;
        this.search.value = '';
        this.renderList();
        this.panel.hidden = false;
        document.body.appendChild(this.panel);
        this.panel.style.zIndex = String(OPEN_Z);
        this.btn.setAttribute('aria-expanded', 'true');
        this.wrap.classList.add('cs-open');
        this.position();
        requestAnimationFrame(() => {
            this.panel.classList.add('cs-panel--in');
            if (!this.searchWrap.hidden) this.search.focus({ preventScroll: true });
        });
        this.onDoc = (e) => {
            if (!this.panel.contains(e.target) && !this.wrap.contains(e.target)) this.close(false);
        };
        this.onWin = () => this.position();
        document.addEventListener('mousedown', this.onDoc, true);
        document.addEventListener('touchstart', this.onDoc, true);
        window.addEventListener('resize', this.onWin);
        window.addEventListener('scroll', this.onWin, true);
        this.onEsc = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.close(true);
            }
        };
        window.addEventListener('keydown', this.onEsc, true);
    }

    position() {
        const r = this.btn.getBoundingClientRect();
        const p = this.panel;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        p.classList.remove('cs-panel--sheet');
        if (vw <= 520) {
            p.classList.add('cs-panel--sheet');
            p.style.left = p.style.top = p.style.width = p.style.maxHeight = '';
            return;
        }
        // минимум 15rem: короткие подписи («Нет сохранённых фильтров») не переносятся, длинные названия читаются
        const width = Math.min(Math.max(r.width, 240), vw - 16);
        p.style.width = width + 'px';
        p.style.minWidth = width + 'px';
        const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
        p.style.left = left + 'px';
        const below = vh - r.bottom - 12;
        const above = r.top - 12;
        const want = Math.min(p.scrollHeight, 320);
        const up = below < Math.min(want, 200) && above > below;
        p.classList.toggle('cs-panel--up', up);
        p.style.maxHeight = Math.max(120, Math.min(320, up ? above : below)) + 'px';
        if (up) {
            p.style.top = '';
            p.style.bottom = vh - r.top + 6 + 'px';
        } else {
            p.style.bottom = '';
            p.style.top = r.bottom + 6 + 'px';
        }
    }

    close(refocus) {
        if (!this.open) return;
        this.open = false;
        if (openInstance === this) openInstance = null;
        this.panel.classList.remove('cs-panel--in');
        this.panel.hidden = true;
        this.btn.setAttribute('aria-expanded', 'false');
        this.btn.removeAttribute('aria-activedescendant');
        this.wrap.classList.remove('cs-open');
        document.removeEventListener('mousedown', this.onDoc, true);
        document.removeEventListener('touchstart', this.onDoc, true);
        window.removeEventListener('keydown', this.onEsc, true);
        window.removeEventListener('resize', this.onWin);
        window.removeEventListener('scroll', this.onWin, true);
        this.panel.remove();
        if (refocus) this.btn.focus({ preventScroll: true });
    }

    choose(optionIndex) {
        const { sel } = this;
        if (sel.selectedIndex !== optionIndex) {
            sel.selectedIndex = optionIndex;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.sync();
        this.close(true);
    }

    onTriggerKey(e) {
        const k = e.key;
        if (!this.open) {
            if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
                e.preventDefault();
                this.openPanel();
                return;
            }
            if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                this.typeAhead(k, true);
            }
            return;
        }
        this.onPanelKey(e);
    }

    onPanelKey(e) {
        const k = e.key;
        if (k === 'ArrowDown') {
            e.preventDefault();
            this.setActive(this.nextEnabled(this.active, 1));
        } else if (k === 'ArrowUp') {
            e.preventDefault();
            this.setActive(this.nextEnabled(this.active, -1));
        } else if (k === 'Home') {
            e.preventDefault();
            this.setActive(this.nextEnabled(-1, 1));
        } else if (k === 'End') {
            e.preventDefault();
            this.setActive(this.nextEnabled(0, -1));
        } else if (k === 'Enter' || (k === ' ' && e.target === this.btn)) {
            e.preventDefault();
            const v = this.visible[this.active];
            if (v && !v.disabled) this.choose(v.index);
        } else if (k === 'Tab') {
            this.close(false);
        } else if (k.length === 1 && e.target === this.btn && !e.ctrlKey && !e.metaKey) {
            this.typeAhead(k, false);
        }
    }

    typeAhead(ch, selectDirect) {
        clearTimeout(this.typeTimer);
        this.typeBuf += ch.toLowerCase();
        this.typeTimer = setTimeout(() => (this.typeBuf = ''), 700);
        const opts = readOptions(this.sel).filter((i) => i.type === 'option' && !i.disabled);
        const hit = opts.find((i) => i.label.toLowerCase().startsWith(this.typeBuf));
        if (!hit) return;
        if (selectDirect) {
            this.sel.selectedIndex = hit.index;
            this.sel.dispatchEvent(new Event('change', { bubbles: true }));
            this.sync();
        } else {
            const i = this.visible.findIndex((v) => v.index === hit.index);
            if (i >= 0) this.setActive(i);
        }
    }

    destroy() {
        this.close(false);
        this.mo.disconnect();
        if (this.onReset && this.sel.form) this.sel.form.removeEventListener('reset', this.onReset);
        delete this.sel.value;
        delete this.sel.selectedIndex;
        this.sel.classList.remove('cs-native');
        this.sel.removeAttribute('aria-hidden');
        this.sel.tabIndex = 0;
        this.wrap.parentNode?.insertBefore(this.sel, this.wrap);
        this.wrap.remove();
        ENHANCED.delete(this.sel);
    }
}

export function enhanceSelect(sel) {
    if (!isEligible(sel) || ENHANCED.has(sel) || !sel.parentNode) return null;
    const inst = new CustomSelect(sel);
    ENHANCED.set(sel, inst);
    return inst;
}

export function enhanceAll(root = document) {
    root.querySelectorAll('select').forEach((s) => {
        try {
            enhanceSelect(s);
        } catch (e) {
            console.warn('[custom-select] enhance failed', e);
        }
    });
}

let started = false;
export function initCustomSelects() {
    if (started || typeof document === 'undefined') return;
    started = true;
    enhanceAll();
    let queued = false;
    // Накопитель добавленных узлов: пачки мутаций, пришедшие до отрисовки кадра, не должны теряться
    // (раньше вторая пачка в том же кадре отбрасывалась, и часть select оставалась нативной).
    const pending = new Set();
    const mo = new MutationObserver((muts) => {
        for (const m of muts) {
            m.addedNodes.forEach((n) => {
                if (n.nodeType === 1) pending.add(n);
            });
        }
        if (queued || pending.size === 0) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            const nodes = [...pending];
            pending.clear();
            for (const n of nodes) {
                if (!n.isConnected) continue;
                if (n.tagName === 'SELECT') enhanceSelect(n);
                else if (n.querySelector) enhanceAll(n);
            }
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
}
