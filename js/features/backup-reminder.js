'use strict';

/**
 * Периодическое напоминание о резервном копировании (интервал 3 ч, HUD-поведение тоста).
 * Два контура: localStorage (интервал) + userPreferences.backupReminderEnabled (вкл/выкл).
 */

import { NotificationService } from '../services/notification.js';

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

function _maybeShow() {
    const NS = _deps.NotificationService || NotificationService;
    if (!NS || typeof NS.showImportantRich !== 'function') return;

    if (!_isReminderEnabled()) return;

    if (NS.activeImportantNotifications?.has(BACKUP_REMINDER_TOAST_ID)) return;

    const now = Date.now();
    const first = _getOrInitFirstLaunch(now);
    const lastShown = _readNum(STORAGE_KEY_LAST_SHOWN);

    if (!shouldShowBackupReminder(now, first, lastShown, true, BACKUP_REMINDER_INTERVAL_MS)) {
        return;
    }

    const showAppConfirm = _deps.showAppConfirm;
    const savePrefs = _deps.saveUserPreferences;

    const dismissAndMark = () => {
        _markLastShown(Date.now());
        NS.dismissImportant(BACKUP_REMINDER_TOAST_ID);
    };

    NS.showImportantRich({
        id: BACKUP_REMINDER_TOAST_ID,
        message:
            'Сделайте резервную копию информационной базы, чтобы не потерять данные.',
        type: 'warning',
        minVisibleBeforeInteractionDismissMs: BACKUP_REMINDER_MIN_VISIBLE_MS,
        dismissAfterActivityDelayMs: 2000,
        shouldIgnoreInteractionEvent: (e) => Boolean(e?.target?.closest?.('#appConfirmModal')),
        onDismiss: () => {
            _markLastShown(Date.now());
        },
        actions: [
            {
                id: 'export-now',
                label: 'Сделать сейчас',
                primary: true,
                onClick: () => {
                    _markLastShown(Date.now());
                    NS.dismissImportant(BACKUP_REMINDER_TOAST_ID);
                    const btn = document.getElementById('exportDataBtn');
                    if (btn && typeof btn.click === 'function') btn.click();
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
    tick();
}

/**
 * При включении напоминаний в настройках — не показывать тост сразу, отсчёт с «сейчас».
 */
export function onBackupReminderReEnabled() {
    const now = Date.now();
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
}
