'use strict';

/**
 * Периодическое напоминание о резервном копировании (интервал 3 ч, HUD-поведение тоста).
 * Два контура: localStorage (интервал) + userPreferences.backupReminderEnabled (вкл/выкл).
 * Отложить: третий контур — copilot_backup_reminder_defer_until_v1 + одноразовый таймер в памяти;
 * при срабатывании — системное уведомление (если разрешено) + повтор тоста.
 */

import { NotificationService } from '../services/notification.js';
import {
    STORAGE_KEY_DEFER_UNTIL,
    isBackupReminderSuppressedByDefer,
    parseDeferLocalDatetimeToUtcMs,
    readDeferUntilMs,
    writeDeferUntilMs,
} from './backup-reminder-defer.js';

export { STORAGE_KEY_DEFER_UNTIL } from './backup-reminder-defer.js';

export const BACKUP_REMINDER_TOAST_ID = 'copilot-backup-reminder-toast';
export const BACKUP_REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const BACKUP_REMINDER_MIN_VISIBLE_MS = 7000;
export const STORAGE_KEY_FIRST_LAUNCH = 'copilot_backup_reminder_first_launch_v1';
export const STORAGE_KEY_LAST_SHOWN = 'copilot_backup_reminder_last_shown_v1';

const TICK_MS = 60 * 1000;

let _deps = {
    State: null,
    NotificationService: null,
    showAppConfirm: null,
    saveUserPreferences: null,
};

let _intervalId = null;
let _onVisibility = null;
let _deferAlarmId = null;
let _onStorage = null;

export function setBackupReminderDependencies(deps = {}) {
    _deps = { ..._deps, ...deps };
}

/**
 * Чистая логика: показывать ли напоминание (для тестов и второго контура проверки).
 * @param {number} now
 * @param {number|null|undefined} firstLaunchMs
 * @param {number|null|undefined} lastShownMs
 * @param {boolean} enabled
 * @param {number} intervalMs
 */
export function shouldShowBackupReminder(now, firstLaunchMs, lastShownMs, enabled, intervalMs) {
    if (!enabled) return false;
    const first = typeof firstLaunchMs === 'number' && firstLaunchMs > 0 ? firstLaunchMs : now;
    if (lastShownMs == null || lastShownMs <= 0) {
        return now - first >= intervalMs;
    }
    return now - lastShownMs >= intervalMs;
}

function _readNum(key) {
    try {
        const v = localStorage.getItem(key);
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function _writeNum(key, n) {
    try {
        localStorage.setItem(key, String(n));
    } catch {
        /* второй контур: preferences */
    }
}

function _getOrInitFirstLaunch(now) {
    const existing = _readNum(STORAGE_KEY_FIRST_LAUNCH);
    if (existing != null && existing > 0) return existing;
    _writeNum(STORAGE_KEY_FIRST_LAUNCH, now);
    return now;
}

function _isReminderEnabled() {
    const p = _deps.State?.userPreferences;
    if (!p || typeof p !== 'object') return true;
    return p.backupReminderEnabled !== false;
}

function _markLastShown(now) {
    _writeNum(STORAGE_KEY_LAST_SHOWN, now);
}

function _purgeExpiredDeferIfAny() {
    const du = readDeferUntilMs();
    if (du != null && du <= Date.now()) {
        writeDeferUntilMs(null);
        _clearDeferAlarm();
    }
}

function _clearDeferAlarm() {
    if (_deferAlarmId != null) {
        clearTimeout(_deferAlarmId);
        _deferAlarmId = null;
    }
}

function _armDeferAlarm(untilMs) {
    _clearDeferAlarm();
    const delay = Math.max(0, untilMs - Date.now());
    _deferAlarmId = setTimeout(() => {
        _deferAlarmId = null;
        const stored = readDeferUntilMs();
        if (stored == null || stored <= Date.now()) {
            writeDeferUntilMs(null);
            _onDeferAlarmFired().catch(() => {});
        }
    }, delay);
}

function _trySystemNotifyBackupDeferred() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    try {
        new Notification('Copilot 1СО — резервная копия', {
            body: 'Настало время напоминания о резервном копировании.',
            tag: `${BACKUP_REMINDER_TOAST_ID}-defer`,
            requireInteraction: false,
        });
    } catch {
        /* резерв: тост покажется при возврате во вкладку */
    }
}

async function _onDeferAlarmFired() {
    _trySystemNotifyBackupDeferred();
    _presentBackupReminderToast({ forceInterval: true });
}

function _syncDeferAlarmFromStorage() {
    const until = readDeferUntilMs();
    if (until != null && until > Date.now()) {
        _armDeferAlarm(until);
    } else {
        _clearDeferAlarm();
        if (until != null && until <= Date.now()) {
            writeDeferUntilMs(null);
        }
    }
}

function _pad2(n) {
    return String(n).padStart(2, '0');
}

function _toDatetimeLocalValue(d) {
    return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}T${_pad2(d.getHours())}:${_pad2(
        d.getMinutes(),
    )}`;
}

/**
 * @returns {Promise<number|null>} defer until UTC ms, or null if cancelled
 */
export function openBackupReminderDeferDialog() {
    const modal = document.getElementById('backupReminderDeferModal');
    const input = document.getElementById('backupReminderDeferDatetime');
    const confirmBtn = document.getElementById('backupReminderDeferConfirmBtn');
    const cancelBtn = document.getElementById('backupReminderDeferCancelBtn');
    const closeBtn = document.getElementById('backupReminderDeferModalCloseBtn');
    if (!modal || !input || !confirmBtn || !cancelBtn) {
        return Promise.resolve(null);
    }

    const now = new Date();
    const min = new Date(now.getTime() + 60 * 1000);
    input.min = _toDatetimeLocalValue(min);
    let def = new Date(now.getTime() + 60 * 60 * 1000);
    if (def < min) def = new Date(min.getTime());
    input.value = _toDatetimeLocalValue(def);

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden', 'modal-open');

    return new Promise((resolve) => {
        let settled = false;
        const finish = (/** @type {number|null} */ v) => {
            if (settled) return;
            settled = true;
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden', 'modal-open');
            input.removeEventListener('keydown', onInputKeydown);
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn?.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onEscape);
            resolve(v);
        };

        const onEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish(null);
            }
        };

        const onInputKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };

        const onConfirm = () => {
            const raw = input.value;
            const until = parseDeferLocalDatetimeToUtcMs(raw, Date.now());
            if (until == null) {
                const NS = _deps.NotificationService || NotificationService;
                NS?.add?.('Укажите время в будущем (не раньше чем через минуту).', 'warning', {
                    duration: 4500,
                });
                return;
            }
            finish(until);
        };

        const onCancel = () => finish(null);

        input.addEventListener('keydown', onInputKeydown);
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn?.addEventListener('click', onCancel);
        document.addEventListener('keydown', onEscape, true);
        setTimeout(() => input.focus(), 0);
    });
}

/**
 * @param {object} opts
 * @param {boolean} [opts.forceInterval] — показать без проверки интервала (срабатывание отложенного будильника)
 */
function _presentBackupReminderToast(opts = {}) {
    const { forceInterval = false } = opts;
    _purgeExpiredDeferIfAny();
    const NS = _deps.NotificationService || NotificationService;
    if (!NS || typeof NS.showImportantRich !== 'function') return;

    if (!_isReminderEnabled()) return;

    if (NS.activeImportantNotifications?.has(BACKUP_REMINDER_TOAST_ID)) return;

    const now = Date.now();
    if (isBackupReminderSuppressedByDefer(now, readDeferUntilMs())) return;

    const first = _getOrInitFirstLaunch(now);
    const lastShown = _readNum(STORAGE_KEY_LAST_SHOWN);

    if (
        !forceInterval &&
        !shouldShowBackupReminder(now, first, lastShown, true, BACKUP_REMINDER_INTERVAL_MS)
    ) {
        return;
    }

    const showAppConfirm = _deps.showAppConfirm;
    const savePrefs = _deps.saveUserPreferences;

    const dismissAndMark = () => {
        _markLastShown(Date.now());
        NS.dismissImportant(BACKUP_REMINDER_TOAST_ID);
    };

    const requestNotificationPermissionFromGesture = () => {
        if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
        try {
            const p = Notification.requestPermission();
            if (p && typeof p.then === 'function') void p.catch(() => {});
        } catch {
            /* ignore */
        }
    };

    NS.showImportantRich({
        id: BACKUP_REMINDER_TOAST_ID,
        message:
            'Сделайте резервную копию информационной базы, чтобы не потерять данные.',
        type: 'warning',
        minVisibleBeforeInteractionDismissMs: BACKUP_REMINDER_MIN_VISIBLE_MS,
        dismissAfterActivityDelayMs: 2000,
        shouldIgnoreInteractionEvent: (e) =>
            Boolean(
                e?.target?.closest?.('#appConfirmModal') ||
                    e?.target?.closest?.('#backupReminderDeferModal'),
            ),
        onDismiss: () => {
            _markLastShown(Date.now());
        },
        actions: [
            {
                id: 'export-now',
                label: 'Сделать сейчас',
                primary: true,
                onClick: () => {
                    writeDeferUntilMs(null);
                    _clearDeferAlarm();
                    _markLastShown(Date.now());
                    NS.dismissImportant(BACKUP_REMINDER_TOAST_ID);
                    const btn = document.getElementById('exportDataBtn');
                    if (btn && typeof btn.click === 'function') btn.click();
                },
            },
            {
                id: 'defer-reminder',
                label: 'Отложить',
                onClick: () => {
                    requestNotificationPermissionFromGesture();
                    NS.dismissImportant(BACKUP_REMINDER_TOAST_ID);
                    void openBackupReminderDeferDialog().then((untilMs) => {
                        if (untilMs == null) {
                            _presentBackupReminderToast({ forceInterval: true });
                            return;
                        }
                        writeDeferUntilMs(untilMs);
                        _armDeferAlarm(untilMs);
                        const when = new Date(untilMs).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                        });
                        NS.add(`Напоминание отложено до ${when}.`, 'info', { duration: 5000 });
                    });
                },
            },
            {
                id: 'disable-reminders',
                label: 'Больше не показывать',
                onClick: async () => {
                    if (typeof showAppConfirm !== 'function') {
                        console.warn('[backup-reminder] showAppConfirm недоступен.');
                        return;
                    }
                    const ok = await showAppConfirm({
                        title: 'Отключить напоминания?',
                        message:
                            'Вы действительно хотите отключить напоминания о резервном копировании? Включить уведомления можно в настройках приложения.',
                        confirmText: 'Да, выключить',
                        cancelText: 'Нет, продолжить получать',
                        confirmClass: 'bg-primary hover:bg-secondary text-white',
                    });
                    if (!ok) return;
                    writeDeferUntilMs(null);
                    _clearDeferAlarm();
                    if (_deps.State?.userPreferences) {
                        _deps.State.userPreferences.backupReminderEnabled = false;
                    }
                    if (typeof savePrefs === 'function') {
                        await savePrefs();
                    }
                    dismissAndMark();
                },
            },
        ],
    });
}

function _maybeShow() {
    _purgeExpiredDeferIfAny();
    const now = Date.now();
    if (isBackupReminderSuppressedByDefer(now, readDeferUntilMs())) return;
    _presentBackupReminderToast({ forceInterval: false });
}

/**
 * Запуск периодической проверки и реакции на возврат во вкладку.
 */
export function initBackupReminderScheduler() {
    if (_intervalId != null) return;

    const tick = () => {
        try {
            _maybeShow();
        } catch (e) {
            console.error('[backup-reminder] tick:', e);
        }
    };

    _intervalId = setInterval(tick, TICK_MS);
    _onVisibility = () => {
        if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', _onVisibility);

    if (!_onStorage) {
        _onStorage = (e) => {
            if (e.key === STORAGE_KEY_DEFER_UNTIL) {
                _syncDeferAlarmFromStorage();
            }
        };
        window.addEventListener('storage', _onStorage);
    }

    _syncDeferAlarmFromStorage();
    tick();
}

/**
 * При включении напоминаний в настройках — не показывать тост сразу, отсчёт с «сейчас».
 */
export function onBackupReminderReEnabled() {
    const now = Date.now();
    writeDeferUntilMs(null);
    _clearDeferAlarm();
    _writeNum(STORAGE_KEY_FIRST_LAUNCH, now);
    _writeNum(STORAGE_KEY_LAST_SHOWN, now);
}

export function __resetBackupReminderSchedulerForTests() {
    if (_intervalId != null) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
    if (_onVisibility) {
        document.removeEventListener('visibilitychange', _onVisibility);
        _onVisibility = null;
    }
    if (_onStorage) {
        window.removeEventListener('storage', _onStorage);
        _onStorage = null;
    }
    _clearDeferAlarm();
}
