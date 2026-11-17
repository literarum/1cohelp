'use strict';

/**
 * Быстрые фразы для заметок «Информация по обращению».
 *   • набрать «/» и начало ключа (например «/итог») → список фраз, Enter/Tab — вставить;
 *   • Alt+1…Alt+9 — вставить фразу по номеру;
 *   • переменные: {ИНН} — первый верный ИНН из заметок, {дата}, {время}.
 * Фразы хранятся в базе (preferences, id «notesSnippets») и попадают в экспорт/слияние.
 */

import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { extractInns } from './appeal-archive.js';
import { escapeHtml } from '../utils/html.js';

export const SNIPPETS_ID = 'notesSnippets';
export const DEFAULT_SNIPPETS = Object.freeze([
    { key: 'инн', title: 'ИНН клиента', text: 'ИНН: {ИНН}' },
    { key: 'итог', title: 'Итог обращения', text: 'Итог ({дата} {время}): ' },
    { key: 'перезвон', title: 'Перезвонить', text: 'Перезвонить клиенту {дата} в ' },
]);

const pad2 = (n) => String(n).padStart(2, '0');

/** Подстановка переменных. */
export function expandSnippet(text, notes, now = new Date()) {
    const inn = extractInns(notes)[0] || '';
    return String(text ?? '')
        .replace(/\{ИНН\}/gi, inn)
        .replace(/\{дата\}/gi, `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`)
        .replace(/\{время\}/gi, `${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
}

/** Ключи без пробелов, в нижнем регистре; пустые записи отбрасываются. */
export function sanitizeSnippets(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((s) => ({
            key: String(s?.key ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24),
            title: String(s?.title ?? '').trim().slice(0, 80),
            text: String(s?.text ?? '').slice(0, 2000),
        }))
        .filter((s) => s.key && s.text);
}

/** Фразы, подходящие под набранный префикс (сначала совпадение ключа с начала). */
export function matchSnippets(list, query) {
    const q = String(query || '').toLowerCase();
    if (!q) return list.slice(0, 8);
    const starts = list.filter((s) => s.key.startsWith(q));
    const contains = list.filter(
        (s) => !s.key.startsWith(q) && (s.key.includes(q) || s.title.toLowerCase().includes(q)),
    );
    return [...starts, ...contains].slice(0, 8);
}

/**
 * Найти «/запрос» непосредственно перед курсором (начало строки или после пробела).
 * @returns {{start:number, query:string}|null}
 */
export function findSlashToken(value, caret) {
    const before = String(value).slice(0, caret);
    const m = /(^|[\s(])\/([\p{L}\d-]{0,24})$/u.exec(before);
    if (!m) return null;
    return { start: caret - m[2].length - 1, query: m[2] };
}

let cache = null;

export async function loadSnippets() {
    if (cache) return cache;
    try {
        const rec = await getFromIndexedDB('preferences', SNIPPETS_ID);
        cache = rec ? sanitizeSnippets(rec.items) : sanitizeSnippets(DEFAULT_SNIPPETS);
    } catch {
        cache = sanitizeSnippets(DEFAULT_SNIPPETS);
    }
    return cache;
}

export async function saveSnippets(list) {
    cache = sanitizeSnippets(list);
    await saveToIndexedDB('preferences', { id: SNIPPETS_ID, items: cache });
    return cache;
}

function insertAt(ta, start, end, text) {
    ta.focus();
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------- выпадающий список
let popup = null;
let state = null;

function closePopup() {
    popup?.remove();
    popup = null;
    state = null;
}

function renderPopup(ta, items, active) {
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'notesSnippetsPopup';
        popup.className = 'snp-popup';
        popup.setAttribute('role', 'listbox');
        popup.setAttribute('aria-label', 'Быстрые фразы');
        popup.addEventListener('mousedown', (e) => {
            const li = e.target instanceof Element ? e.target.closest('[data-ns-i]') : null;
            if (!li) return;
            e.preventDefault();
            applyChoice(ta, Number(li.getAttribute('data-ns-i')));
        });
        ta.parentElement?.appendChild(popup);
    }
    popup.innerHTML = items.length
        ? items
              .map(
                  (s, i) =>
                      `<div role="option" class="snp-item${i === active ? ' is-active' : ''}" aria-selected="${i === active}" data-ns-i="${i}"><b>/${escapeHtml(s.key)}</b><span>${escapeHtml(s.title || s.text.slice(0, 60))}</span></div>`,
              )
              .join('')
        : '<div class="snp-empty">Нет фраз с таким ключом. Фразы настраиваются в палитре: «Быстрые фразы».</div>';
}

function applyChoice(ta, index) {
    if (!state) return;
    const s = state.items[index];
    if (!s) return;
    const { start } = state;
    const end = ta.selectionStart;
    closePopup();
    insertAt(ta, start, end, expandSnippet(s.text, ta.value));
}

async function onInput(ta) {
    const token = findSlashToken(ta.value, ta.selectionStart);
    if (!token) return closePopup();
    const list = await loadSnippets();
    const items = matchSnippets(list, token.query);
    state = { start: token.start, items, active: 0 };
    renderPopup(ta, items, 0);
}

export function initNotesSnippets() {
    const ta = document.getElementById('clientNotes');
    if (!ta || ta.dataset.snippets === '1') return;
    ta.dataset.snippets = '1';
    ta.addEventListener('input', () => void onInput(ta));
    ta.addEventListener('blur', () => setTimeout(closePopup, 150));
    ta.addEventListener(
        'keydown',
        async (e) => {
            if (state && popup) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const n = state.items.length;
                    if (!n) return;
                    state.active = (state.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
                    renderPopup(ta, state.items, state.active);
                    return;
                }
                if ((e.key === 'Enter' || e.key === 'Tab') && state.items.length) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    applyChoice(ta, state.active);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closePopup();
                    return;
                }
            }
            if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
                const list = await loadSnippets();
                const s = list[Number(e.code.slice(5)) - 1];
                if (!s) return;
                e.preventDefault();
                insertAt(ta, ta.selectionStart, ta.selectionEnd, expandSnippet(s.text, ta.value));
            }
        },
        true,
    );
}

// ---------------------------------------------------------------- редактор фраз
export async function openSnippetsEditor() {
    document.getElementById('notesSnippetsModal')?.remove();
    const list = [...(await loadSnippets())];
    const root = document.createElement('div');
    root.id = 'notesSnippetsModal';
    root.className = 'rq-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'nsTitle');
    root.innerHTML = `
        <div class="rq-backdrop" data-ns-close></div>
        <div class="rq-card aa-card">
            <header class="rq-head">
                <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-bolt"></i></span>
                <div><h2 id="nsTitle">Быстрые фразы для заметок</h2><p>«/ключ» в заметках или Alt+1…9 по порядку. Переменные: {ИНН}, {дата}, {время}</p></div>
                <button type="button" class="rq-icon-btn rq-close" data-ns-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button>
            </header>
            <div class="rq-body">
                <div class="snp-rows" data-snp-rows></div>
                <div class="so-actions">
                    <button type="button" class="vc-chip" data-ns-add>Добавить фразу</button>
                    <button type="button" class="vc-chip bp-primary" data-ns-save>Сохранить</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(root);
    const rowsEl = root.querySelector('[data-snp-rows]');
    const render = () => {
        rowsEl.innerHTML = list
            .map(
                (s, i) => `<div class="snp-row" data-snp-row="${i}">
                    <span class="snp-num">${i < 9 ? `Alt+${i + 1}` : ''}</span>
                    <input class="rq-input" data-f="key" value="${escapeHtml(s.key)}" placeholder="ключ" aria-label="Ключ фразы ${i + 1}">
                    <input class="rq-input" data-f="title" value="${escapeHtml(s.title)}" placeholder="название" aria-label="Название фразы ${i + 1}">
                    <textarea class="rq-input" data-f="text" rows="2" placeholder="текст, например: ИНН: {ИНН}" aria-label="Текст фразы ${i + 1}">${escapeHtml(s.text)}</textarea>
                    <button type="button" class="rq-icon-btn" data-ns-del aria-label="Удалить фразу ${i + 1}"><i class="fas fa-trash" aria-hidden="true"></i></button>
                </div>`,
            )
            .join('');
    };
    render();
    const collect = () => {
        rowsEl.querySelectorAll('[data-snp-row]').forEach((row) => {
            const i = Number(row.getAttribute('data-snp-row'));
            row.querySelectorAll('[data-f]').forEach((el) => {
                list[i][el.getAttribute('data-f')] = el.value;
            });
        });
    };
    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        root.remove();
    };
    function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.closest('[data-ns-close]')) return close();
        if (t.closest('[data-ns-add]')) {
            collect();
            list.push({ key: '', title: '', text: '' });
            render();
            rowsEl.querySelector('[data-snp-row]:last-child [data-f="key"]')?.focus();
        } else if (t.closest('[data-ns-del]')) {
            collect();
            list.splice(Number(t.closest('[data-snp-row]').getAttribute('data-snp-row')), 1);
            render();
        } else if (t.closest('[data-ns-save]')) {
            collect();
            const saved = await saveSnippets(list);
            window.NotificationService?.add?.(`Фраз сохранено: ${saved.length}.`, 'success', { duration: 3000 });
            close();
        }
    });
    return root;
}

if (typeof window !== 'undefined') window.openSnippetsEditor = openSnippetsEditor;
