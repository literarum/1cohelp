'use strict';

/**
 * Инструменты для больших баз закладок: режим выделения, поиск и слияние дубликатов,
 * сохранённые фильтры («умные папки»). Панель создаётся программно над списком закладок.
 */

import { escapeHtml } from '../utils/html.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { State } from '../app/state.js';
import { findDuplicateBookmarkGroups, mergeDuplicateBookmarks } from './bookmarks-bulk.js';

const SAVED_FILTERS_PREF_ID = 'bookmarkSavedFilters';

/**
 * @typedef {Object} BookmarksToolsApi
 * @property {() => Promise<{ all: object[], folderMap: object }>} getSnapshot
 * @property {(opts?: object) => Promise<void>} refresh
 * @property {(on: boolean) => void} setSelectionMode
 * @property {() => boolean} isSelectionMode
 * @property {() => void} updateSortButtons
 * @property {(removedIds: number[], keepers: object[]) => Promise<void>} reindexAfterMerge
 * @property {Function} removeFromIndex
 * @property {Function} updateIndex
 * @property {Function} notify
 * @property {Function} [confirm]
 */

/** @type {BookmarksToolsApi|null} */
let api = null;

async function loadSavedFilters() {
    try {
        const row = await getFromIndexedDB('preferences', SAVED_FILTERS_PREF_ID);
        return Array.isArray(row?.items) ? row.items.filter((x) => x && x.id && x.name) : [];
    } catch {
        return [];
    }
}

async function persistSavedFilters(items) {
    await saveToIndexedDB('preferences', { id: SAVED_FILTERS_PREF_ID, items });
}

function currentFilterState() {
    const s = document.getElementById('bookmarkSearchInput');
    const f = document.getElementById('bookmarkFolderFilter');
    const sort = State.currentBookmarksSort || { criteria: 'date', direction: 'asc' };
    return {
        search: s ? s.value.trim() : '',
        folder: f ? f.value : '',
        sort: { criteria: sort.criteria || 'date', direction: sort.direction || 'asc' },
    };
}

function describeFilter(f, folderLabel) {
    const parts = [];
    if (f.search) parts.push(`«${f.search}»`);
    if (f.folder) parts.push(folderLabel || 'папка');
    return parts.join(' · ') || 'все закладки';
}

async function renderSavedFiltersSelect() {
    const sel = document.getElementById('bookmarkSavedFiltersSelect');
    if (!sel) return;
    const items = await loadSavedFilters();
    const prev = sel.value;
    sel.textContent = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = items.length ? 'Сохранённые фильтры…' : 'Нет сохранённых фильтров';
    sel.appendChild(o0);
    for (const it of items) {
        const o = document.createElement('option');
        o.value = it.id;
        o.textContent = it.name;
        sel.appendChild(o);
    }
    if (items.some((i) => i.id === prev)) sel.value = prev;
    const del = document.getElementById('bookmarkDeleteFilterBtn');
    if (del) del.hidden = !sel.value;
}

async function applySavedFilter(id) {
    const items = await loadSavedFilters();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const s = document.getElementById('bookmarkSearchInput');
    const f = document.getElementById('bookmarkFolderFilter');
    if (s) s.value = it.search || '';
    document
        .getElementById('clearBookmarkSearchBtn')
        ?.classList.toggle('hidden', !(it.search && it.search.length));
    if (f) {
        const has = Array.from(f.options).some((o) => o.value === String(it.folder ?? ''));
        f.value = has ? String(it.folder ?? '') : '';
    }
    if (it.sort) {
        State.currentBookmarksSort = {
            criteria: it.sort.criteria || 'date',
            direction: it.sort.direction || 'asc',
        };
        api.updateSortButtons();
    }
    await api.refresh({ keepScroll: false });
}

function promptName(defaultName) {
    return new Promise((resolve) => {
        const wrap = document.createElement('div');
        wrap.className = 'bm-tools-inline';
        wrap.innerHTML = `<label class="sr-only" for="bookmarkFilterNameInput">Название фильтра</label>
<input id="bookmarkFilterNameInput" type="text" maxlength="60" class="bm-tools-input" placeholder="Название фильтра" />
<button type="button" data-ok class="bm-tools-btn bm-tools-btn--primary">Сохранить</button>
<button type="button" data-cancel class="bm-tools-btn">Отмена</button>`;
        const row = document.getElementById('bookmarksToolsRow');
        row.appendChild(wrap);
        const input = wrap.querySelector('input');
        input.value = defaultName;
        input.focus();
        input.select();
        const done = (v) => {
            wrap.remove();
            resolve(v);
        };
        wrap.querySelector('[data-ok]').addEventListener('click', () => done(input.value.trim()));
        wrap.querySelector('[data-cancel]').addEventListener('click', () => done(null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                done(input.value.trim());
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                done(null);
            }
        });
    });
}

// ----------------------------------------------------------------------------
// Дубликаты
// ----------------------------------------------------------------------------

function closeDuplicatesModal() {
    const m = document.getElementById('bookmarkDuplicatesModal');
    if (m) {
        m.remove();
        document.removeEventListener('keydown', onDupKeydown, true);
        document.getElementById('bookmarkDuplicatesBtn')?.focus();
    }
}
function onDupKeydown(e) {
    if (e.key === 'Escape') {
        e.stopPropagation();
        closeDuplicatesModal();
    }
}

async function openDuplicatesModal() {
    closeDuplicatesModal();
    const modal = document.createElement('div');
    modal.id = 'bookmarkDuplicatesModal';
    modal.className = 'bm-modal-backdrop';
    modal.innerHTML = `<div class="bm-modal" role="dialog" aria-modal="true" aria-labelledby="bmDupTitle">
<div class="bm-modal-head"><h2 id="bmDupTitle">Дубликаты закладок</h2>
<button type="button" class="bm-tools-btn" data-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button></div>
<p class="bm-modal-sub" id="bmDupSub">Поиск по нормализованному адресу (без http/https, www, якорей и utm-меток)…</p>
<div class="bm-modal-body" id="bmDupBody"><div class="vg-skeleton" style="height:5rem"></div></div>
<div class="bm-modal-foot"><button type="button" class="bm-tools-btn bm-tools-btn--primary" data-merge-all hidden>Объединить все группы</button>
<button type="button" class="bm-tools-btn" data-close>Закрыть</button></div></div>`;
    document.body.appendChild(modal);
    document.addEventListener('keydown', onDupKeydown, true);
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close]')) closeDuplicatesModal();
    });
    modal.querySelector('[data-close]')?.focus();

    const body = modal.querySelector('#bmDupBody');
    const sub = modal.querySelector('#bmDupSub');
    const mergeAllBtn = modal.querySelector('[data-merge-all]');
    const snap = await api.getSnapshot();
    let groups = findDuplicateBookmarkGroups(snap.all);

    const render = () => {
        if (!groups.length) {
            sub.textContent = 'Дубликатов не найдено.';
            body.innerHTML =
                '<p class="bm-empty">Все закладки с адресами уникальны. Отличная работа!</p>';
            mergeAllBtn.hidden = true;
            return;
        }
        const extra = groups.reduce((n, g) => n + g.items.length - 1, 0);
        sub.textContent = `Групп: ${groups.length.toLocaleString('ru-RU')} · лишних записей: ${extra.toLocaleString('ru-RU')}. В каждой группе сохраняется отмеченная закладка: теги, описание и скриншоты объединяются, остальные уходят в «Недавно удалённые».`;
        mergeAllBtn.hidden = false;
        const shown = groups.slice(0, 50);
        body.innerHTML = shown
            .map((g, gi) => {
                const rows = g.items
                    .map(
                        (b, i) => `<label class="bm-dup-row">
<input type="radio" name="keep-${gi}" value="${b.id}" ${i === 0 ? 'checked' : ''} />
<span class="bm-dup-title">${escapeHtml(b.title || 'Без названия')}</span>
<span class="bm-dup-meta">${escapeHtml(b.url || '')}${b.dateAdded ? ' · ' + escapeHtml(new Date(b.dateAdded).toLocaleDateString('ru-RU')) : ''}</span></label>`,
                    )
                    .join('');
                return `<section class="bm-dup-group" data-gi="${gi}"><div class="bm-dup-head"><strong>${escapeHtml(g.key)}</strong>
<button type="button" class="bm-tools-btn" data-merge="${gi}">Объединить (${g.items.length})</button></div>${rows}</section>`;
            })
            .join('');
        if (groups.length > shown.length) {
            body.insertAdjacentHTML(
                'beforeend',
                `<p class="bm-empty">Показаны первые ${shown.length} групп из ${groups.length}. После слияния список обновится.</p>`,
            );
        }
    };
    render();

    const mergeGroup = async (gi) => {
        const g = groups[gi];
        if (!g) return;
        const checked = body.querySelector(`input[name="keep-${gi}"]:checked`);
        const keepId = checked ? Number(checked.value) : g.items[0].id;
        const res = await mergeDuplicateBookmarks(g.items, keepId, { deferIndex: true });
        void api.reindexAfterMerge(res.otherIds, [res.merged]);
    };

    body.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-merge]');
        if (!btn) return;
        btn.disabled = true;
        try {
            const gi = Number(btn.dataset.merge);
            await mergeGroup(gi);
            groups.splice(gi, 1);
            render();
            api.notify('Дубликаты объединены. Удалённые копии — в «Недавно удалённые».', 'success');
            await api.refresh({ force: true });
        } catch (err) {
            console.error(err);
            api.notify('Не удалось объединить: ' + (err?.message || err), 'error');
            btn.disabled = false;
        }
    });
    mergeAllBtn.addEventListener('click', async () => {
        mergeAllBtn.disabled = true;
        let n = 0;
        const removedIds = [];
        const keepers = [];
        try {
            const list = groups.slice();
            for (let gi = 0; gi < list.length; gi++) {
                const g = list[gi];
                const checked = body.querySelector(`input[name="keep-${gi}"]:checked`);
                const keepId = checked ? Number(checked.value) : g.items[0].id;
                const res = await mergeDuplicateBookmarks(g.items, keepId, { deferIndex: true });
                removedIds.push(...res.otherIds);
                keepers.push(res.merged);
                n++;
                if (n % 20 === 0) {
                    sub.textContent = `Объединено групп: ${n} из ${list.length}…`;
                    await new Promise((r) => setTimeout(r, 0));
                }
            }
            groups = [];
            render();
            api.notify(`Объединено групп: ${n}.`, 'success');
        } catch (err) {
            console.error(err);
            api.notify('Ошибка слияния: ' + (err?.message || err), 'error');
        }
        mergeAllBtn.disabled = false;
        await api.refresh({ force: true });
        // индекс — одним проходом, уже после обновления списка
        void api.reindexAfterMerge(removedIds, keepers);
    });
}

// ----------------------------------------------------------------------------

/**
 * @param {BookmarksToolsApi} a
 */
export function initBookmarksTools(a) {
    api = a;
    const container = document.getElementById('bookmarksContainer');
    if (!container || !container.parentNode || document.getElementById('bookmarksToolsRow')) return;
    const row = document.createElement('div');
    row.id = 'bookmarksToolsRow';
    row.className = 'bm-tools-row';
    row.innerHTML = `<button type="button" id="bookmarksSelectModeBtn" class="bm-tools-btn" aria-pressed="false" title="Выделять закладки для массового удаления или архивации"><i class="far fa-check-square" aria-hidden="true"></i> Выбрать</button>
<button type="button" id="bookmarkDuplicatesBtn" class="bm-tools-btn" title="Найти и объединить закладки с одинаковым адресом"><i class="far fa-clone" aria-hidden="true"></i> Дубликаты</button>
<span class="bm-tools-sep" aria-hidden="true"></span>
<label class="sr-only" for="bookmarkSavedFiltersSelect">Сохранённые фильтры</label>
<select id="bookmarkSavedFiltersSelect" class="bm-tools-input"><option value="">Сохранённые фильтры…</option></select>
<button type="button" id="bookmarkSaveFilterBtn" class="bm-tools-btn" title="Сохранить текущие поиск, папку и сортировку"><i class="far fa-star" aria-hidden="true"></i> Сохранить фильтр</button>
<button type="button" id="bookmarkDeleteFilterBtn" class="bm-tools-btn" hidden title="Удалить выбранный сохранённый фильтр" aria-label="Удалить выбранный сохранённый фильтр"><i class="fas fa-trash" aria-hidden="true"></i></button>`;
    const anchor = document.getElementById('bookmarksListStatus') || container;
    container.parentNode.insertBefore(row, anchor);

    document.getElementById('bookmarksSelectModeBtn').addEventListener('click', () => {
        api.setSelectionMode(!api.isSelectionMode());
    });
    document.getElementById('bookmarkDuplicatesBtn').addEventListener('click', () => {
        void openDuplicatesModal();
    });
    const sel = document.getElementById('bookmarkSavedFiltersSelect');
    sel.addEventListener('change', async () => {
        const del = document.getElementById('bookmarkDeleteFilterBtn');
        if (del) del.hidden = !sel.value;
        if (sel.value) await applySavedFilter(sel.value);
    });
    document.getElementById('bookmarkSaveFilterBtn').addEventListener('click', async () => {
        const st = currentFilterState();
        const folderSel = document.getElementById('bookmarkFolderFilter');
        const folderLabel =
            folderSel && folderSel.selectedIndex >= 0
                ? folderSel.options[folderSel.selectedIndex].textContent
                : '';
        const name = await promptName(
            st.search ? st.search.slice(0, 40) : describeFilter(st, folderLabel).slice(0, 40),
        );
        if (!name) return;
        const items = await loadSavedFilters();
        const existing = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
        const rec = {
            id: existing ? existing.id : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
            name,
            ...st,
        };
        const next = existing ? items.map((i) => (i.id === existing.id ? rec : i)) : [...items, rec];
        try {
            await persistSavedFilters(next);
            await renderSavedFiltersSelect();
            sel.value = rec.id;
            document.getElementById('bookmarkDeleteFilterBtn').hidden = false;
            api.notify(`Фильтр «${name}» сохранён`, 'success');
        } catch (e) {
            api.notify('Не удалось сохранить фильтр: ' + (e?.message || e), 'error');
        }
    });
    document.getElementById('bookmarkDeleteFilterBtn').addEventListener('click', async () => {
        if (!sel.value) return;
        const items = await loadSavedFilters();
        const it = items.find((i) => i.id === sel.value);
        if (!it) return;
        const ok = api.confirm
            ? await api.confirm({
                  title: 'Удаление фильтра',
                  message: `Удалить сохранённый фильтр «${it.name}»?`,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : true;
        if (!ok) return;
        await persistSavedFilters(items.filter((i) => i.id !== it.id));
        await renderSavedFiltersSelect();
        api.notify('Фильтр удалён', 'info');
    });
    void renderSavedFiltersSelect();
}
