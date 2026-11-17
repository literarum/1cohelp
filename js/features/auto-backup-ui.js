'use strict';

/**
 * Окно «Автобэкап»: состояние, настройки (интервал, число копий, сжатие, шифрование)
 * и восстановление из любой копии в папке. Перед восстановлением текущая база
 * сохраняется отдельной копией — откат возможен всегда.
 */

import {
    getAutoBackupConfig,
    saveAutoBackupConfig,
    configureAutoBackup,
    runAutoBackup,
    disableAutoBackup,
    listBackupsIn,
    setAutoBackupPassword,
    clearAutoBackupPassword,
    hasFolderAccess,
    requestFolderAccess,
    isAutoBackupSupported,
} from './auto-backup.js';
import { promptBackupPassword, unwrapBackupText } from './backup-envelope.js';
import { formatBytes } from './storage-guard.js';
import { escapeHtml } from '../utils/html.js';
import { showAppConfirm } from '../ui/app-confirm-modal.js';

const MODAL_ID = 'autoBackupManagerModal';
export const INTERVAL_OPTIONS = [6, 12, 24, 48, 168];
export const KEEP_OPTIONS = [7, 14, 30, 60];

const intervalLabel = (h) => (h === 168 ? 'раз в неделю' : h === 24 ? 'раз в сутки' : h === 48 ? 'раз в 2 суток' : `каждые ${h} ч`);
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function notify(msg, type = 'info', opts = {}) {
    window.NotificationService?.add?.(msg, type, opts);
}

async function confirmRestore(name) {
    const message = `Заменить текущую базу содержимым копии «${name}»? Перед заменой текущая база будет сохранена отдельной копией в этой же папке.`;
    return showAppConfirm({ title: 'Восстановление из копии', message, confirmText: 'Восстановить', cancelText: 'Отмена' });
}

async function restoreFrom(dirHandle, name) {
    if (!(await confirmRestore(name))) return false;
    // Страховочная копия текущего состояния.
    const safety = await runAutoBackup({ interactive: false, kind: 'before-restore' });
    if (!safety.ok && safety.reason !== 'busy') {
        notify('Не удалось сохранить страховочную копию текущей базы — восстановление отменено.', 'error', { important: true });
        return false;
    }
    const file = await (await dirHandle.getFileHandle(name)).getFile();
    const text = await unwrapBackupText(await file.text());
    if (text === null) return false;
    const ie = await import('./import-export.js');
    const overlay = window.loadingOverlayManager;
    overlay?.createAndShow?.();
    try {
        const result = await ie._processActualImport(text);
        if (!result?.success) {
            notify(result?.message || 'Восстановление не удалось.', 'error', { important: true });
            return false;
        }
        notify(`База восстановлена из копии «${name}».`, 'success', { duration: 7000 });
        return true;
    } finally {
        if (overlay?.overlayElement) await overlay.hideAndDestroy?.();
    }
}

async function render(root) {
    const body = root.querySelector('[data-ab-body]');
    if (!isAutoBackupSupported()) {
        body.innerHTML = '<p class="rq-empty">Этот браузер не умеет сохранять файлы в папку. Используйте Chrome, Edge или Яндекс Браузер, либо «Экспорт базы с паролем».</p>';
        return;
    }
    const cfg = await getAutoBackupConfig();
    const handle = cfg.enabled ? cfg.dirHandle : null;
    const access = handle ? await hasFolderAccess(handle) : false;
    let list = [];
    let listError = '';
    if (handle && access) {
        try {
            list = await listBackupsIn(handle);
        } catch (e) {
            listError = e?.message || String(e);
        }
    }
    const opt = (values, cur, label) => values.map((v) => `<option value="${v}"${Number(cur) === v ? ' selected' : ''}>${label(v)}</option>`).join('');
    body.innerHTML = `
        <section class="so-block">
            <div class="so-row"><span>Папка</span><strong>${handle ? escapeHtml(handle.name) : 'не выбрана'}</strong></div>
            <div class="so-row"><span>Последняя копия</span><strong>${cfg.lastBackupAt ? escapeHtml(new Date(cfg.lastBackupAt).toLocaleString('ru-RU')) : '—'}</strong></div>
            ${cfg.lastError ? `<div class="so-row"><span>Ошибка</span><strong class="so-warn">${escapeHtml(cfg.lastError)}</strong></div>` : ''}
            ${handle && !access ? '<p class="so-note">Браузер снял доступ к папке после перезапуска.</p>' : ''}
        </section>
        <div class="so-actions">
            <button type="button" class="vc-chip bp-primary" data-ab="choose">${handle ? 'Сменить папку' : 'Выбрать папку и включить'}</button>
            ${handle && !access ? '<button type="button" class="vc-chip" data-ab="grant">Разрешить доступ</button>' : ''}
            ${handle ? '<button type="button" class="vc-chip" data-ab="now">Сохранить копию сейчас</button><button type="button" class="vc-chip" data-ab="off">Отключить</button>' : ''}
        </div>
        ${handle ? `
        <section class="so-block ab-settings">
            <label class="ab-row"><span>Как часто</span><select data-ab-set="intervalHours">${opt(INTERVAL_OPTIONS, cfg.intervalHours, intervalLabel)}</select></label>
            <label class="ab-row"><span>Хранить копий</span><select data-ab-set="keep">${opt(KEEP_OPTIONS, cfg.keep, (v) => `последние ${v}`)}</select></label>
            <label class="ab-row"><span>Сжимать (gzip)</span><input type="checkbox" data-ab-set="compress"${cfg.compress !== false ? ' checked' : ''}></label>
            <label class="ab-row"><span>Шифровать паролем (AES-256)</span><input type="checkbox" data-ab-set="encrypt"${cfg.encryption ? ' checked' : ''}></label>
            <p class="so-note">Пароль не хранится: при восстановлении его нужно будет ввести.</p>
        </section>
        <section class="so-block">
            <h3 class="ab-h">Копии в папке</h3>
            ${listError ? `<p class="so-warn">${escapeHtml(listError)}</p>` : ''}
            ${access && list.length === 0 && !listError ? '<p class="so-note">Пока нет копий.</p>' : ''}
            ${list.length ? `<table class="so-table"><thead><tr><th>Дата</th><th class="num">Размер</th><th></th></tr></thead><tbody>${list
                .map((f) => `<tr><td>${escapeHtml(fmtDate(f.lastModified))}</td><td class="num">${f.size == null ? '—' : escapeHtml(formatBytes(f.size))}</td><td class="num"><button type="button" class="vc-chip" data-ab-restore="${escapeHtml(f.name)}">Восстановить</button></td></tr>`)
                .join('')}</tbody></table>` : ''}
        </section>` : ''}`;
}

export async function openAutoBackupManager() {
    document.getElementById(MODAL_ID)?.remove();
    const last = document.activeElement;
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'rq-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'abTitle');
    root.innerHTML = `
        <div class="rq-backdrop" data-ab-close></div>
        <div class="rq-card so-card">
            <header class="rq-head">
                <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-clock-rotate-left"></i></span>
                <div><h2 id="abTitle">Автобэкап</h2><p>Копии базы в выбранную папку и восстановление из них</p></div>
                <button type="button" class="rq-icon-btn rq-close" data-ab-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button>
            </header>
            <div class="rq-body" data-ab-body><p class="rq-empty">Загрузка…</p></div>
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
        if (e.key === 'Escape' && !document.querySelector('[data-bp-pass]')) {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }
    document.addEventListener('keydown', onKey, true);
    const refresh = () => render(root).catch((e) => console.warn('[auto-backup-ui] render', e));

    root.addEventListener('click', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.closest('[data-ab-close]')) return close();
        const action = t.closest('[data-ab]')?.getAttribute('data-ab');
        const restore = t.closest('[data-ab-restore]')?.getAttribute('data-ab-restore');
        try {
            if (action === 'choose') await configureAutoBackup();
            else if (action === 'grant') {
                const cfg = await getAutoBackupConfig();
                if (cfg.dirHandle) await requestFolderAccess(cfg.dirHandle);
            } else if (action === 'now') await runAutoBackup({ interactive: true });
            else if (action === 'off') await disableAutoBackup();
            else if (restore) {
                const cfg = await getAutoBackupConfig();
                if (cfg.dirHandle) {
                    const ok = await restoreFrom(cfg.dirHandle, restore);
                    if (ok) return close();
                }
            } else return;
        } catch (err) {
            notify(`Автобэкап: ${err?.message || err}`, 'error');
        }
        await refresh();
    });
    root.addEventListener('change', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        const key = t?.getAttribute?.('data-ab-set');
        if (!key) return;
        if (key === 'intervalHours' || key === 'keep') {
            await saveAutoBackupConfig({ [key]: Number(t.value) });
        } else if (key === 'compress') {
            await saveAutoBackupConfig({ compress: t.checked });
        } else if (key === 'encrypt') {
            if (t.checked) {
                const password = await promptBackupPassword({ confirm: true, title: 'Пароль для автобэкапа' });
                if (password) {
                    await setAutoBackupPassword(password);
                    notify('Новые копии будут зашифрованы. Запомните пароль — без него их не открыть.', 'success', { duration: 8000 });
                } else t.checked = false;
            } else {
                await clearAutoBackupPassword();
            }
        }
        await refresh();
    });
    await refresh();
    root.querySelector('.rq-close')?.focus();
    return root;
}
