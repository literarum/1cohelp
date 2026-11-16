'use strict';

/**
 * Окно «Данные и хранилище»: занятое место, число записей по разделам, вес вложений,
 * постоянное хранение, автобэкап. Открывается из палитры команд.
 */

import { State } from '../app/state.js';
import { performDBOperation, countInIndexedDB } from '../db/indexeddb.js';
import { escapeHtml } from '../utils/html.js';
import { formatBytes, evaluateQuota, ensurePersistentStorage } from './storage-guard.js';

const MODAL_ID = 'storageOverviewModal';

/** Разделы для отчёта: хранилище → подпись. Служебные (индекс, история) идут отдельной строкой. */
export const OVERVIEW_STORES = [
    ['algorithms', 'Алгоритмы (разделы)'],
    ['bookmarks', 'Закладки'],
    ['bookmarkFolders', 'Папки закладок'],
    ['links', 'Ссылки 1С'],
    ['extLinks', 'Внешние ресурсы'],
    ['reglaments', 'Регламенты'],
    ['blacklistedClients', 'Чёрный список'],
    ['clientAnalyticsRecords', 'База клиентов: обращения'],
    ['clientAnalyticsFiles', 'База клиентов: файлы'],
    ['reminders', 'Напоминания'],
    ['favorites', 'Избранное'],
    ['screenshots', 'Скриншоты'],
    ['pdfFiles', 'PDF-вложения'],
    ['recentlyDeleted', 'Корзина'],
    ['searchIndex', 'Поисковый индекс (служебное)'],
];

/** Сумма размеров Blob в хранилище (курсор: данные Blob не читаются, только метаданные). */
function sumBlobSizes(storeName) {
    return performDBOperation(storeName, 'readonly', (store) => {
        let total = 0;
        return new Promise((resolve, reject) => {
            const req = store.openCursor();
            req.onsuccess = () => {
                const c = req.result;
                if (!c) {
                    resolve(total);
                    return;
                }
                const v = c.value || {};
                for (const key of Object.keys(v)) {
                    const x = v[key];
                    if (x && typeof x === 'object' && typeof x.size === 'number' && typeof x.type === 'string') {
                        total += x.size;
                    }
                }
                c.continue();
            };
            req.onerror = () => reject(req.error);
        });
    });
}

export async function collectStorageOverview() {
    const rows = [];
    for (const [store, label] of OVERVIEW_STORES) {
        if (!State.db?.objectStoreNames.contains(store)) continue;
        let count = null;
        try {
            count = await countInIndexedDB(store);
        } catch {
            count = null;
        }
        let bytes = null;
        if (store === 'screenshots' || store === 'pdfFiles') {
            try {
                bytes = await sumBlobSizes(store);
            } catch {
                bytes = null;
            }
        }
        rows.push({ store, label, count, bytes });
    }
    let quota = null;
    let persisted = null;
    try {
        quota = evaluateQuota(await navigator.storage?.estimate?.());
        persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
        /* Storage API недоступен */
    }
    let autoBackup = 'недоступно';
    try {
        const m = await import('./auto-backup.js');
        autoBackup = await m.describeAutoBackupStatus();
    } catch {
        /* модуль не загрузился */
    }
    return { rows, quota, persisted, autoBackup };
}

function render(root, data) {
    const body = root.querySelector('[data-so-body]');
    const q = data.quota;
    const pct = q ? Math.min(100, Math.round(q.ratio * 100)) : null;
    const visibleRows = data.rows.filter((r) => r.count !== 0);
    const hiddenCount = data.rows.length - visibleRows.length;
    const tableRows = visibleRows
        .map(
            (r) =>
                `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.count == null ? '—' : r.count.toLocaleString('ru-RU')}</td><td class="num">${r.bytes == null ? '' : escapeHtml(formatBytes(r.bytes))}</td></tr>`,
        )
        .join('');
    body.innerHTML = `
        <section class="so-block">
            <div class="so-row"><span>Занято браузером</span><strong>${q ? `${escapeHtml(formatBytes(q.usage))} из ${escapeHtml(formatBytes(q.quota))}` : 'нет данных'}</strong></div>
            ${pct == null ? '' : `<div class="so-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Заполнено хранилище"><span style="width:${pct}%" class="${q.warn ? 'is-warn' : ''}"></span></div>`}
            <div class="so-row"><span>Постоянное хранение</span><strong class="${data.persisted ? 'so-ok' : 'so-warn'}">${data.persisted === null ? 'неизвестно' : data.persisted ? 'включено — браузер не удалит данные' : 'не включено — при нехватке места браузер может удалить данные'}</strong></div>
            <div class="so-row"><span>Автобэкап</span><strong>${escapeHtml(data.autoBackup)}</strong></div>
        </section>
        <table class="so-table"><thead><tr><th>Раздел</th><th class="num">Записей</th><th class="num">Объём</th></tr></thead><tbody>${tableRows}</tbody></table>
        ${hiddenCount ? `<p class="so-note">Пустые разделы скрыты: ${hiddenCount}.</p>` : ''}
        <div class="so-actions">
            ${data.persisted ? '' : '<button type="button" class="vc-chip" data-so-action="persist">Включить постоянное хранение</button>'}
            <button type="button" class="vc-chip" data-so-action="autobackup">Настроить автобэкап</button>
            <button type="button" class="vc-chip" data-so-action="export">Экспорт базы</button>
            <button type="button" class="vc-chip" data-so-action="trash">Открыть корзину</button>
        </div>`;
}

export async function openStorageOverview() {
    document.getElementById(MODAL_ID)?.remove();
    const last = document.activeElement;
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'rq-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'soTitle');
    root.innerHTML = `
        <div class="rq-backdrop" data-so-close></div>
        <div class="rq-card so-card">
            <header class="rq-head">
                <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-database"></i></span>
                <div><h2 id="soTitle">Данные и хранилище</h2><p>Где лежат данные и насколько они защищены</p></div>
                <button type="button" class="rq-icon-btn rq-close" data-so-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button>
            </header>
            <div class="rq-body" data-so-body><p class="rq-empty">Подсчёт…</p></div>
        </div>`;
    document.body.appendChild(root);

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
        if (t.closest('[data-so-close]')) return close();
        const action = t.closest('[data-so-action]')?.getAttribute('data-so-action');
        if (!action) return;
        if (action === 'persist') {
            const ok = await ensurePersistentStorage();
            window.NotificationService?.add?.(
                ok
                    ? 'Постоянное хранение включено.'
                    : 'Браузер отклонил запрос. Установите приложение (значок установки в адресной строке) — тогда постоянное хранение обычно выдаётся автоматически.',
                ok ? 'success' : 'warning',
                { duration: 7000 },
            );
            render(root, await collectStorageOverview());
        } else if (action === 'autobackup') {
            close();
            const m = await import('./auto-backup-ui.js');
            await m.openAutoBackupManager();
        } else if (action === 'export') {
            close();
            document.getElementById('exportDataBtn')?.click();
        } else if (action === 'trash') {
            close();
            window.openRecentlyDeletedModal?.();
        }
    });
    root.querySelector('.rq-close')?.focus();
    try {
        render(root, await collectStorageOverview());
    } catch (e) {
        root.querySelector('[data-so-body]').innerHTML = `<p class="rq-empty">Не удалось собрать сведения: ${escapeHtml(e?.message || String(e))}</p>`;
    }
    return root;
}

if (typeof window !== 'undefined') window.openStorageOverview = openStorageOverview;
