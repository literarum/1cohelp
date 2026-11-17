'use strict';

/**
 * Автоматическое резервное копирование в выбранную пользователем папку (File System Access API).
 *
 * - Папка выбирается один раз; дескриптор хранится в отдельной локальной БД (не попадает в экспорт).
 * - Копия создаётся раз в N часов, пока приложение открыто; старые копии удаляются (ротация).
 * - Если браузер сбросил разрешение на папку, показывается уведомление с кнопкой «Разрешить»
 *   (запрос прав требует жеста пользователя).
 * - Пока автобэкап исправен, напоминание о ручном бэкапе не показывается.
 */

import { State } from '../app/state.js';
import { buildExportDataObjectFromDb } from './import-export.js';
import { wrapBackup, deriveBackupKey, newSalt, PBKDF2_ITERATIONS } from './backup-envelope.js';

export const AUTO_BACKUP_FILE_PREFIX = 'copilot-1co-backup_';
export const DEFAULT_INTERVAL_HOURS = 24;
export const DEFAULT_KEEP = 14;
/** Отметка последнего успешного автобэкапа (читает напоминание о бэкапе). */
export const LS_LAST_OK = 'copilot_auto_backup_last_ok_v1';

const LOCAL_DB = 'copilot-1co-local';
const LOCAL_STORE = 'kv';
const CONFIG_KEY = 'autoBackup';
const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 45 * 1000;

/** Поддерживается ли запись в папку в этом браузере. */
export function isAutoBackupSupported() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Имя файла по локальному времени: copilot-1co-backup_2026-11-16_14-05.json */
export function buildBackupFileName(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${AUTO_BACKUP_FILE_PREFIX}${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}.json`;
}

/**
 * Какие файлы удалить при ротации: оставляем `keep` самых новых копий с нашим префиксом.
 * Имена сортируются лексикографически = хронологически.
 * @param {string[]} names
 * @param {number} keep
 */
export function selectBackupsToDelete(names, keep) {
    const ours = names
        .filter((n) => n.startsWith(AUTO_BACKUP_FILE_PREFIX) && n.endsWith('.json'))
        .sort();
    const k = Math.max(1, Math.floor(keep) || DEFAULT_KEEP);
    return ours.length > k ? ours.slice(0, ours.length - k) : [];
}

/** Пора ли делать копию. */
export function isBackupDue(lastBackupAt, intervalHours, now = Date.now()) {
    if (!lastBackupAt) return true;
    const last = new Date(lastBackupAt).getTime();
    if (!Number.isFinite(last)) return true;
    const h = Number(intervalHours) > 0 ? Number(intervalHours) : DEFAULT_INTERVAL_HOURS;
    return now - last >= h * 3600 * 1000;
}

// --------------------------------------------------------------------------
// Локальное хранилище настроек (вне экспортируемой БД)
// --------------------------------------------------------------------------

function openLocalDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(LOCAL_DB, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(LOCAL_STORE)) {
                req.result.createObjectStore(LOCAL_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function kv(mode, fn) {
    const db = await openLocalDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_STORE, mode);
            const r = fn(tx.objectStore(LOCAL_STORE));
            tx.oncomplete = () => resolve(r?.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('aborted'));
        });
    } finally {
        db.close();
    }
}

/** @returns {Promise<{dirHandle?:FileSystemDirectoryHandle, intervalHours:number, keep:number, lastBackupAt?:string, lastError?:string, enabled:boolean}>} */
export async function getAutoBackupConfig() {
    let cfg = null;
    try {
        cfg = await kv('readonly', (s) => s.get(CONFIG_KEY));
    } catch (e) {
        console.warn('[auto-backup] read config failed', e);
    }
    return {
        enabled: false,
        intervalHours: DEFAULT_INTERVAL_HOURS,
        keep: DEFAULT_KEEP,
        compress: true,
        /** { key: CryptoKey (неизвлекаемый), salt: Uint8Array, iterations } — пароль не хранится. */
        encryption: null,
        ...(cfg || {}),
    };
}

export async function saveAutoBackupConfig(patch) {
    const cur = await getAutoBackupConfig();
    const next = { ...cur, ...patch };
    await kv('readwrite', (s) => s.put(next, CONFIG_KEY));
    return next;
}

// --------------------------------------------------------------------------
// Работа с папкой
// --------------------------------------------------------------------------

async function hasPermission(handle, request) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    try {
        if ((await handle.queryPermission?.(opts)) === 'granted') return true;
        if (request && (await handle.requestPermission?.(opts)) === 'granted') return true;
    } catch (e) {
        console.warn('[auto-backup] permission check failed', e);
    }
    return false;
}

async function writeBackupFile(dirHandle, fileName, text) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
        await writable.write(new Blob([text], { type: 'application/json' }));
        await writable.close();
    } catch (e) {
        try {
            await writable.abort();
        } catch {
            /* уже закрыт */
        }
        throw e;
    }
}

async function rotateBackups(dirHandle, keep) {
    const names = [];
    for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind === 'file') names.push(name);
    }
    for (const name of selectBackupsToDelete(names, keep)) {
        try {
            await dirHandle.removeEntry(name);
        } catch (e) {
            console.warn('[auto-backup] cannot remove old backup', name, e);
        }
    }
}

/**
 * Снять полную копию базы и записать в папку с ротацией.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {number} keep
 * @returns {Promise<string|null>} имя файла или null, если данных нет
 */
export async function writeBackupTo(dirHandle, keep = DEFAULT_KEEP, opts = {}) {
    const data = await buildExportDataObjectFromDb(State.db, { quiet: true, readMode: 'batch' });
    if (!data) return null;
    data.backupKind = opts.kind || 'auto';
    const fileName = buildBackupFileName();
    let text = JSON.stringify(data);
    if (opts.compress !== false || opts.encryption) {
        text = await wrapBackup(text, {
            compress: opts.compress !== false,
            key: opts.encryption?.key || null,
            salt: opts.encryption?.salt || null,
            iterations: opts.encryption?.iterations,
        });
    }
    await writeBackupFile(dirHandle, fileName, text);
    await rotateBackups(dirHandle, keep);
    return fileName;
}

/** Копии в папке, новые сверху. */
export async function listBackupsIn(dirHandle) {
    const out = [];
    for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind !== 'file' || !name.startsWith(AUTO_BACKUP_FILE_PREFIX) || !name.endsWith('.json')) continue;
        try {
            const f = await entry.getFile();
            out.push({ name, size: f.size, lastModified: f.lastModified });
        } catch {
            out.push({ name, size: null, lastModified: null });
        }
    }
    return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Включить шифрование автобэкапа паролем (ключ выводится один раз и хранится неизвлекаемым). */
export async function setAutoBackupPassword(password) {
    const salt = newSalt();
    const key = await deriveBackupKey(password, salt, PBKDF2_ITERATIONS);
    await saveAutoBackupConfig({ encryption: { key, salt, iterations: PBKDF2_ITERATIONS } });
}

export async function clearAutoBackupPassword() {
    await saveAutoBackupConfig({ encryption: null });
}

function notifier() {
    const svc = typeof window !== 'undefined' ? window.NotificationService : null;
    return svc && typeof svc.add === 'function' ? svc : null;
}

let running = false;

/**
 * Сделать копию сейчас.
 * @param {{interactive?:boolean}} [opts] interactive — вызвано кликом (можно запросить разрешение)
 * @returns {Promise<{ok:boolean, fileName?:string, reason?:string}>}
 */
export async function runAutoBackup(opts = {}) {
    const interactive = Boolean(opts.interactive);
    if (running) return { ok: false, reason: 'busy' };
    const cfg = await getAutoBackupConfig();
    if (!cfg.dirHandle) return { ok: false, reason: 'not-configured' };
    if (!State.db) return { ok: false, reason: 'db-not-ready' };
    if (!(await hasPermission(cfg.dirHandle, interactive))) {
        if (!interactive) showPermissionPrompt(cfg.dirHandle.name);
        return { ok: false, reason: 'permission' };
    }
    running = true;
    try {
        const fileName = await writeBackupTo(cfg.dirHandle, cfg.keep, {
            compress: cfg.compress !== false,
            encryption: cfg.encryption,
            kind: opts.kind,
        });
        if (!fileName) return { ok: false, reason: 'no-data' };
        const now = new Date().toISOString();
        await saveAutoBackupConfig({ lastBackupAt: now, lastError: null });
        try {
            localStorage.setItem(LS_LAST_OK, String(Date.now()));
        } catch {
            /* localStorage недоступен */
        }
        notifier()?.dismissImportant?.('auto-backup-error');
        if (interactive) {
            notifier()?.add(`Резервная копия сохранена: ${cfg.dirHandle.name}/${fileName}`, 'success', {
                duration: 5000,
            });
        }
        return { ok: true, fileName };
    } catch (e) {
        console.error('[auto-backup] failed', e);
        const message = e?.message || String(e);
        await saveAutoBackupConfig({ lastError: message }).catch(() => {});
        notifier()?.add(`Не удалось сохранить автоматическую резервную копию: ${message}`, 'error', {
            id: 'auto-backup-error',
            important: true,
            title: 'Автобэкап',
            actions: [{ label: 'Повторить', primary: true, onClick: () => runAutoBackup({ interactive: true }) }],
        });
        return { ok: false, reason: 'error' };
    } finally {
        running = false;
    }
}

let permissionPromptShown = false;
function showPermissionPrompt(folderName) {
    if (permissionPromptShown) return;
    permissionPromptShown = true;
    notifier()?.add(
        `Браузер снял разрешение на запись в папку «${folderName}». Разрешите доступ, чтобы автоматические резервные копии продолжали сохраняться.`,
        'warning',
        {
            id: 'auto-backup-permission',
            important: true,
            title: 'Автобэкап приостановлен',
            actions: [
                {
                    label: 'Разрешить и сохранить',
                    primary: true,
                    onClick: () => {
                        permissionPromptShown = false;
                        void runAutoBackup({ interactive: true });
                    },
                },
            ],
            onDismiss: () => {
                permissionPromptShown = false;
            },
        },
    );
}

/** Выбрать папку и включить автобэкап (вызывать из обработчика клика). */
export async function configureAutoBackup() {
    if (!isAutoBackupSupported()) {
        notifier()?.add(
            'Этот браузер не умеет сохранять файлы в папку автоматически. Используйте Chrome, Edge или Яндекс Браузер, либо делайте экспорт вручную.',
            'warning',
            { duration: 9000 },
        );
        return false;
    }
    let dirHandle;
    try {
        dirHandle = await window.showDirectoryPicker({ id: 'copilot-1co-backup', mode: 'readwrite' });
    } catch (e) {
        if (e?.name !== 'AbortError') console.warn('[auto-backup] picker failed', e);
        return false;
    }
    await saveAutoBackupConfig({ dirHandle, enabled: true, lastError: null });
    const r = await runAutoBackup({ interactive: true });
    if (r.ok) {
        notifier()?.add(
            `Автобэкап включён: копия раз в ${DEFAULT_INTERVAL_HOURS} ч в папку «${dirHandle.name}», хранятся последние ${DEFAULT_KEEP}.`,
            'success',
            { duration: 7000 },
        );
    }
    return r.ok;
}

export async function disableAutoBackup() {
    await saveAutoBackupConfig({ enabled: false, dirHandle: null });
    try {
        localStorage.removeItem(LS_LAST_OK);
    } catch {
        /* ignore */
    }
    notifier()?.add('Автобэкап отключён. Не забывайте делать экспорт вручную.', 'info', { duration: 5000 });
}

/** Краткий статус для интерфейса/диагностики. */
/** Есть ли сейчас доступ к папке (без запроса). */
export async function hasFolderAccess(handle) {
    return hasPermission(handle, false);
}

/** Запросить доступ к папке (вызывать из клика). */
export async function requestFolderAccess(handle) {
    return hasPermission(handle, true);
}

export async function describeAutoBackupStatus() {
    if (!isAutoBackupSupported()) return 'не поддерживается браузером';
    const cfg = await getAutoBackupConfig();
    if (!cfg.enabled || !cfg.dirHandle) return 'выключен';
    const last = cfg.lastBackupAt ? new Date(cfg.lastBackupAt).toLocaleString('ru-RU') : 'ещё не было';
    return `папка «${cfg.dirHandle.name}», последняя копия: ${last}${cfg.lastError ? `, ошибка: ${cfg.lastError}` : ''}`;
}

async function maybeRunScheduled() {
    try {
        const cfg = await getAutoBackupConfig();
        if (!cfg.enabled || !cfg.dirHandle) return;
        if (!isBackupDue(cfg.lastBackupAt, cfg.intervalHours)) return;
        await runAutoBackup({ interactive: false });
    } catch (e) {
        console.warn('[auto-backup] scheduled check failed', e);
    }
}

let schedulerStarted = false;
export function initAutoBackupScheduler() {
    if (schedulerStarted || !isAutoBackupSupported()) return;
    schedulerStarted = true;
    setTimeout(maybeRunScheduled, FIRST_CHECK_DELAY_MS);
    setInterval(maybeRunScheduled, CHECK_EVERY_MS);
}

if (typeof window !== 'undefined') {
    window.configureAutoBackup = configureAutoBackup;
    window.runAutoBackupNow = () => runAutoBackup({ interactive: true });
    window.disableAutoBackup = disableAutoBackup;
    window.describeAutoBackupStatus = describeAutoBackupStatus;
    window.openAutoBackupManager = () =>
        import('./auto-backup-ui.js').then((m) => m.openAutoBackupManager());
}
