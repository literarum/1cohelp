'use strict';

/**
 * Архив обращений. «Информация по обращению» — одно поле; раньше перед следующим звонком
 * текст приходилось стирать или копить. Кнопка «Новое обращение» отправляет текущие заметки
 * в архив (дата, найденные ИНН, первая строка) и очищает поле. Архив — отдельное хранилище
 * appealArchive (входит в экспорт и слияние), с поиском, просмотром и возвратом в поле.
 */

import { State } from '../app/state.js';
import {
    saveToIndexedDB,
    getAllFromIndexedDB,
    deleteFromIndexedDB,
    getFromIndexedDB,
} from '../db/indexeddb.js';
import { escapeHtml } from '../utils/html.js';
import { isValidInn10Checksum, isValidInn12Checksum } from './client-analytics-parse.js';
import { showAppConfirm } from '../ui/app-confirm-modal.js';

export const ARCHIVE_STORE = 'appealArchive';
const MODAL_ID = 'appealArchiveModal';

/** ИНН с верной контрольной суммой, без повторов, в порядке появления. */
export function extractInns(text) {
    const out = [];
    const re = /(?<!\d)(\d{12}|\d{10})(?!\d)/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
        const v = m[1];
        const ok = v.length === 10 ? isValidInn10Checksum(v) : isValidInn12Checksum(v);
        if (ok && !out.includes(v)) out.push(v);
    }
    return out;
}

/** Запись архива из текста заметок (null — пустые заметки). */
export function buildArchiveRecord(notes, now = new Date()) {
    const text = String(notes ?? '');
    if (!text.trim()) return null;
    const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) || '';
    return {
        archivedAt: now.toISOString(),
        notes: text,
        inns: extractInns(text),
        title: firstLine.slice(0, 120),
        length: text.length,
    };
}

/** Поиск по архиву: все слова запроса должны встретиться (без учёта регистра и ё/е). */
export function filterArchive(records, query) {
    const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return records;
    return records.filter((r) => {
        const hay = norm(`${r.notes} ${(r.inns || []).join(' ')}`);
        return words.every((w) => hay.includes(w));
    });
}

function notify(msg, type = 'info', opts = {}) {
    window.NotificationService?.add?.(msg, type, opts);
}

/** Отправить текущие заметки в архив и очистить поле. */
export async function startNewAppeal() {
    const ta = document.getElementById('clientNotes');
    if (!ta) return false;
    const rec = buildArchiveRecord(ta.value);
    if (!rec) {
        ta.focus();
        return false;
    }
    if (!State.db) {
        notify('База данных недоступна — архивирование невозможно.', 'error');
        return false;
    }
    await saveToIndexedDB(ARCHIVE_STORE, rec);
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    try {
        const cd = await import('./client-data.js');
        await cd.saveClientData();
    } catch (e) {
        console.warn('[appeal-archive] не удалось сохранить очищенное поле', e);
    }
    try {
        localStorage.removeItem('copilot.mainChecklist.v1');
        document.dispatchEvent(new CustomEvent('copilot1co:new-appeal'));
    } catch {
        /* ignore */
    }
    notify('Обращение отправлено в архив. Поле готово для нового звонка.', 'success', {
        duration: 5000,
        actions: [{ label: 'Открыть архив', onClick: () => void openAppealArchive() }],
    });
    ta.focus();
    return true;
}

async function loadRecords() {
    const all = (await getAllFromIndexedDB(ARCHIVE_STORE)) || [];
    return all.sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
}

const fmt = (iso) =>
    new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function renderList(root, records, query) {
    const list = root.querySelector('[data-aa-list]');
    const shown = filterArchive(records, query);
    root.querySelector('[data-aa-count]').textContent = query
        ? `Найдено: ${shown.length} из ${records.length}`
        : `Обращений в архиве: ${records.length}`;
    if (!shown.length) {
        list.innerHTML = `<p class="rq-empty">${records.length ? 'Ничего не найдено.' : 'Архив пуст. Нажмите «Новое обращение» в заметках, чтобы отправить сюда текущее обращение.'}</p>`;
        return;
    }
    list.innerHTML = shown
        .map(
            (r) => `<article class="aa-item" data-aa-id="${r.id}">
                <div class="aa-meta"><time>${escapeHtml(fmt(r.archivedAt))}</time>${(r.inns || []).map((i) => `<span class="aa-inn">ИНН ${escapeHtml(i)}</span>`).join('')}</div>
                <p class="aa-title">${escapeHtml(r.title || '')}</p>
                <details><summary>Показать полностью</summary><pre>${escapeHtml(r.notes)}</pre></details>
                <div class="so-actions">
                    <button type="button" class="vc-chip" data-aa-act="copy">Копировать</button>
                    <button type="button" class="vc-chip" data-aa-act="restore">Вернуть в поле</button>
                    <button type="button" class="vc-chip" data-aa-act="delete">Удалить</button>
                </div>
            </article>`,
        )
        .join('');
}

export async function openAppealArchive() {
    document.getElementById(MODAL_ID)?.remove();
    const last = document.activeElement;
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'rq-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'aaTitle');
    root.innerHTML = `
        <div class="rq-backdrop" data-aa-close></div>
        <div class="rq-card aa-card">
            <header class="rq-head">
                <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-box-archive"></i></span>
                <div><h2 id="aaTitle">Архив обращений</h2><p data-aa-count></p></div>
                <button type="button" class="rq-icon-btn rq-close" data-aa-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button>
            </header>
            <div class="rq-body">
                <input type="search" class="rq-input" data-aa-q placeholder="Поиск: ИНН, слово из заметок…" aria-label="Поиск по архиву" autocomplete="off">
                <div class="aa-list" data-aa-list><p class="rq-empty">Загрузка…</p></div>
            </div>
        </div>`;
    document.body.appendChild(root);
    let records = await loadRecords();
    const q = root.querySelector('[data-aa-q]');
    const refresh = () => renderList(root, records, q.value);
    refresh();
    q.addEventListener('input', refresh);
    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        root.remove();
        try {
            last?.focus?.();
        } catch {
            /* ignore */
        }
    };
    function onKey(e) {
        if (e.key === 'Escape' && !document.querySelector('#appConfirmModal:not(.hidden)')) {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.closest('[data-aa-close]')) return close();
        const act = t.closest('[data-aa-act]')?.getAttribute('data-aa-act');
        const id = Number(t.closest('[data-aa-id]')?.getAttribute('data-aa-id'));
        if (!act || !Number.isFinite(id)) return;
        const rec = await getFromIndexedDB(ARCHIVE_STORE, id);
        if (!rec) return;
        if (act === 'copy') {
            try {
                await navigator.clipboard.writeText(rec.notes);
                notify('Текст обращения скопирован.', 'success', { duration: 2500 });
            } catch {
                notify('Не удалось скопировать.', 'error');
            }
        } else if (act === 'restore') {
            const ta = document.getElementById('clientNotes');
            if (!ta) return;
            if (ta.value.trim()) {
                const ok = await showAppConfirm({
                    title: 'Заменить текущие заметки?',
                    message: 'В поле уже есть текст. Сначала отправить его в архив, затем вернуть выбранное обращение?',
                    confirmText: 'Да, архивировать и вернуть',
                    cancelText: 'Отмена',
                });
                if (!ok) return;
                const cur = buildArchiveRecord(ta.value);
                if (cur) await saveToIndexedDB(ARCHIVE_STORE, cur);
            }
            ta.value = rec.notes;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            await deleteFromIndexedDB(ARCHIVE_STORE, id);
            close();
            window.setActiveTab?.('main');
            notify('Обращение возвращено в поле заметок.', 'success', { duration: 3000 });
            return;
        } else if (act === 'delete') {
            const ok = await showAppConfirm({
                title: 'Удалить обращение из архива?',
                message: 'Запись будет удалена без возможности восстановления.',
                confirmText: 'Удалить',
                cancelText: 'Отмена',
                confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
            });
            if (!ok) return;
            await deleteFromIndexedDB(ARCHIVE_STORE, id);
        }
        records = await loadRecords();
        refresh();
    });
    requestAnimationFrame(() => q.focus());
    return root;
}

/** Кнопки в шапке заметок. */
export function initAppealArchiveButtons() {
    const actions = document.getElementById('clientNotesActions');
    if (!actions || actions.querySelector('#newAppealBtn')) return;
    const mk = (id, icon, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = id;
        b.className =
            'w-8 h-8 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 transition text-sm shrink-0';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
        b.addEventListener('click', onClick);
        return b;
    };
    actions.prepend(
        mk('newAppealBtn', 'fa-file-circle-plus', 'Новое обращение: отправить текущее в архив (Alt+Shift+N)', () => void startNewAppeal()),
        mk('openAppealArchiveBtn', 'fa-box-archive', 'Архив обращений', () => void openAppealArchive()),
    );
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
            e.preventDefault();
            void startNewAppeal();
        }
    });
}

if (typeof window !== 'undefined') {
    window.openAppealArchive = openAppealArchive;
    window.startNewAppeal = startNewAppeal;
}
