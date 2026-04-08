'use strict';

import { reminderModalConfig } from '../config.js';
import { toggleModalFullscreen } from '../ui/modals-manager.js';
import { escapeHtml } from '../utils/html.js';
import { saveReminderRow, getAllRemindersFromDB, deleteReminderById } from '../db/reminders.js';
import {
    addCalendarDaysUtc,
    compareRemindersByDueAsc,
    isPendingDue,
    intentLabel,
} from './context-reminders-core.js';

/** @type {import('../services/notification.js').showNotification | null} */
let deps = {
    showNotification: null,
    setActiveTab: null,
    showBookmarkDetailModal: null,
    getClientData: null,
};

export const REMINDER_INTENT_LABELS = {
    callback: 'Перезвонить клиенту',
    followup: 'Уточнить / по задаче',
    return_to: 'Вернуться к контексту',
    task: 'Контрольная точка',
    other: 'Другое',
};

const CONTEXT_TYPE_LABELS = {
    bookmark: 'Закладка',
    client: 'Клиент / обращение',
    algorithm: 'Алгоритм',
    reglament: 'Регламент',
    free: 'Без привязки',
};

/** @type {Set<string|number>} */
const toastShownThisSession = new Set();

/**
 * @param {object} d
 */
export function setContextRemindersDependencies(d) {
    deps = { ...deps, ...d };
}

function reminderModalEl() {
    return document.getElementById('reminderModal');
}

function formatDueRu(iso) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return '—';
    return new Date(t).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function isOverdue(iso, nowMs = Date.now()) {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) && t < nowMs;
}

/**
 * @param {object[]} rows
 */
export function countActionablePending(rows) {
    const now = Date.now();
    return rows.filter((r) => r.status === 'pending' && isOverdue(r.dueAt, now)).length;
}

/**
 * Обновляет точку на кнопке в шапке (есть просроченные / сегодня к исполнению).
 */
export function updateRemindersHeaderBadge(rows) {
    const btn = document.getElementById('showRemindersHeaderBtn');
    if (!btn) return;
    const pending = Array.isArray(rows) ? rows.filter((r) => r.status === 'pending') : [];
    const hot = countActionablePending(pending);
    let badge = btn.querySelector('.reminders-header-badge');
    if (hot > 0) {
        btn.classList.add('has-pending-reminders');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'reminders-header-badge';
            badge.setAttribute('aria-hidden', 'true');
            btn.appendChild(badge);
        }
        btn.title = `Напоминания — есть ${hot} к моменту срока`;
    } else {
        btn.classList.remove('has-pending-reminders');
        badge?.remove();
        btn.title = 'Напоминания';
    }
}

/**
 * @param {object} row
 */
function rowKey(row) {
    return row.id != null ? String(row.id) : '';
}

/**
 * Проверка сроков: внутренний тост + опционально системное уведомление.
 */
export async function runReminderDueCheck() {
    const rows = await getAllRemindersFromDB();
    updateRemindersHeaderBadge(rows);

    const now = Date.now();
    const dueList = rows.filter((r) => isPendingDue(r, now));
    for (const r of dueList) {
        const key = rowKey(r);
        if (!key || toastShownThisSession.has(key)) continue;
        toastShownThisSession.add(key);
        const title = r.title || 'Напоминание';
        const ctx = r.contextLabel ? ` · ${r.contextLabel}` : '';
        deps.showNotification?.(`⏰ ${title}${ctx}`, 'info', 12000);

        if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted' &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden'
        ) {
            try {
                new Notification('Copilot 1СО — напоминание', {
                    body: `${title}${ctx}`,
                    tag: `reminder-${key}`,
                    requireInteraction: false,
                });
            } catch {
                /* ignore */
            }
        }
    }
}

let reminderIntervalId = null;
let reminderBound = false;

export function scheduleReminderChecks() {
    if (reminderIntervalId) clearInterval(reminderIntervalId);
    reminderIntervalId = window.setInterval(() => {
        runReminderDueCheck().catch(() => {});
    }, 60 * 1000);

    if (!reminderBound) {
        reminderBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                runReminderDueCheck().catch(() => {});
            }
        });
    }

    runReminderDueCheck().catch(() => {});
}

/**
 * Рендер списка на вкладке «Напоминания».
 */
export async function renderRemindersPage() {
    const listEl = document.getElementById('remindersList');
    const emptyEl = document.getElementById('remindersEmptyState');
    if (!listEl) return;

    const rows = await getAllRemindersFromDB();
    updateRemindersHeaderBadge(rows);

    const pending = rows
        .filter((r) => r.status === 'pending')
        .sort((a, b) => compareRemindersByDueAsc(a, b));
    const done = rows
        .filter((r) => r.status === 'done' || r.status === 'dismissed')
        .sort((a, b) => {
            const ca = Date.parse(a.completedAt || a.updatedAt || a.dueAt || '');
            const cb = Date.parse(b.completedAt || b.updatedAt || b.dueAt || '');
            const va = Number.isFinite(ca) ? ca : 0;
            const vb = Number.isFinite(cb) ? cb : 0;
            return vb - va;
        });

    if (pending.length === 0 && done.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    const parts = [];
    if (pending.length) {
        parts.push(
            `<h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Активные</h3>
            <div class="space-y-3 mb-8" role="list">${pending.map((r) => renderReminderCard(r)).join('')}</div>`,
        );
    }
    if (done.length) {
        parts.push(
            `<h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Архив</h3>
            <div class="space-y-2 opacity-80" role="list">${done.map((r) => renderReminderCard(r, true)).join('')}</div>`,
        );
    }
    listEl.innerHTML = parts.join('');
}

/**
 * @param {object} row
 * @param {boolean} [archived]
 */
function renderReminderCard(row, archived = false) {
    const id = row.id;
    const title = escapeHtml(row.title || 'Без названия');
    const intent = intentLabel(row.intent || 'other', REMINDER_INTENT_LABELS);
    const ctxType = CONTEXT_TYPE_LABELS[row.contextType] || row.contextType || '';
    const ctxLine = row.contextLabel
        ? `${escapeHtml(ctxType ? `${ctxType}: ` : '')}${escapeHtml(row.contextLabel)}`
        : escapeHtml(ctxType || '');
    const due = formatDueRu(row.dueAt);
    const overdue = !archived && row.status === 'pending' && isOverdue(row.dueAt);
    const cardCls = overdue
        ? 'reminder-card reminder-card--overdue border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 rounded-xl p-4 shadow-sm'
        : 'reminder-card border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 rounded-xl p-4 shadow-sm';

    const actions =
        archived || row.status !== 'pending'
            ? `<button type="button" class="reminder-delete-btn text-xs text-red-600 dark:text-red-400 hover:underline" data-id="${id}">Удалить из архива</button>`
            : `<div class="flex flex-wrap gap-2 justify-end">
            <button type="button" class="reminder-done-btn px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium" data-id="${id}">Выполнено</button>
            <button type="button" class="reminder-snooze-btn px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium" data-id="${id}" data-days="1">+1 день</button>
            <button type="button" class="reminder-snooze-btn px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium" data-id="${id}" data-days="7">+7 дней</button>
            <button type="button" class="reminder-open-btn px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-medium" data-id="${id}">Открыть контекст</button>
            <button type="button" class="reminder-delete-btn text-xs text-gray-500 hover:text-red-600" data-id="${id}">Удалить</button>
        </div>`;

    return `<article class="${cardCls}" role="listitem">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="font-semibold text-gray-900 dark:text-gray-100 truncate">${title}</span>
                    <span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary">${escapeHtml(intent)}</span>
                </div>
                ${ctxLine ? `<p class="text-xs text-gray-600 dark:text-gray-400 mb-1 truncate">${ctxLine}</p>` : ''}
                <p class="text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}">
                    <i class="far fa-clock mr-1 opacity-70"></i>${due}${overdue ? ' · пора сделать' : ''}
                </p>
                ${row.note ? `<p class="text-sm text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap">${escapeHtml(row.note)}</p>` : ''}
            </div>
            <div class="flex-shrink-0 w-full sm:w-auto">${actions}</div>
        </div>
    </article>`;
}

/**
 * @param {object} options
 * @param {number} [options.id] — редактирование
 * @param {string} [options.contextType]
 * @param {string} [options.contextId]
 * @param {string} [options.contextLabel]
 * @param {string} [options.title]
 * @param {string} [options.intent]
 * @param {string} [options.note]
 * @param {string} [options.dueAt] — ISO
 */
export function openReminderModal(options = {}) {
    const modal = reminderModalEl();
    if (!modal) return;

    const titleInput = modal.querySelector('#reminderFormTitle');
    const noteInput = modal.querySelector('#reminderFormNote');
    const intentSelect = modal.querySelector('#reminderFormIntent');
    const dueInput = modal.querySelector('#reminderFormDueLocal');
    const ctxDisplay = modal.querySelector('#reminderFormContextDisplay');
    const idInput = modal.querySelector('#reminderFormId');
    const ctxTypeInput = modal.querySelector('#reminderFormContextType');
    const ctxIdInput = modal.querySelector('#reminderFormContextId');
    const ctxLabelInput = modal.querySelector('#reminderFormContextLabel');

    if (
        !titleInput ||
        !noteInput ||
        !intentSelect ||
        !dueInput ||
        !ctxDisplay ||
        !ctxTypeInput ||
        !ctxIdInput ||
        !ctxLabelInput
    ) {
        return;
    }

    if (idInput) idInput.value = options.id != null ? String(options.id) : '';

    const ct = options.contextType || 'free';
    ctxTypeInput.value = ct;
    ctxIdInput.value = options.contextId != null ? String(options.contextId) : '';
    ctxLabelInput.value = options.contextLabel || '';

    if (options.contextLabel || ct !== 'free') {
        const prefix = CONTEXT_TYPE_LABELS[ct] || '';
        ctxDisplay.textContent = options.contextLabel
            ? `${prefix ? `${prefix}: ` : ''}${options.contextLabel}`
            : prefix || '—';
        ctxDisplay.classList.remove('hidden');
    } else {
        ctxDisplay.textContent = 'Без привязки к закладке или клиенту';
        ctxDisplay.classList.remove('hidden');
    }

    titleInput.value = options.title || '';
    noteInput.value = options.note || '';
    intentSelect.value = options.intent && REMINDER_INTENT_LABELS[options.intent] ? options.intent : 'return_to';

    const base = new Date();
    let dueDate = options.dueAt ? new Date(options.dueAt) : addCalendarDaysUtc(base, options.daysFromNow != null ? options.daysFromNow : 7);
    if (!Number.isFinite(dueDate.getTime())) {
        dueDate = addCalendarDaysUtc(base, 7);
    }
    const pad = (n) => String(n).padStart(2, '0');
    const localStr = `${dueDate.getFullYear()}-${pad(dueDate.getMonth() + 1)}-${pad(dueDate.getDate())}T${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}`;
    dueInput.value = localStr;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden', 'modal-open');
    if (noteInput) {
        noteInput.style.removeProperty('height');
    }
    requestAnimationFrame(() => {
        noteInput?.style.removeProperty('height');
    });
    titleInput.focus();
}

export function closeReminderModal() {
    const modal = reminderModalEl();
    if (!modal) return;
    if (modal.classList.contains('is-fullscreen')) {
        toggleModalFullscreen(
            reminderModalConfig.modalId,
            reminderModalConfig.buttonId,
            reminderModalConfig.classToggleConfig,
            reminderModalConfig.innerContainerSelector,
            reminderModalConfig.contentAreaSelector,
        );
    }
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden', 'modal-open');
}

function localDatetimeToIso(localValue) {
    const d = new Date(localValue);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
}

function applyQuickDueDays(days) {
    const dueInput = document.querySelector('#reminderFormDueLocal');
    if (!dueInput) return;
    const n = Math.max(0, Math.floor(Number(days)) || 0);
    const d = addCalendarDaysUtc(new Date(), n);
    const pad = (x) => String(x).padStart(2, '0');
    dueInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function submitReminderForm() {
    const modal = reminderModalEl();
    if (!modal) return;

    const titleInput = modal.querySelector('#reminderFormTitle');
    const noteInput = modal.querySelector('#reminderFormNote');
    const intentSelect = modal.querySelector('#reminderFormIntent');
    const dueInput = modal.querySelector('#reminderFormDueLocal');
    const idInput = modal.querySelector('#reminderFormId');
    const ctxTypeInput = modal.querySelector('#reminderFormContextType');
    const ctxIdInput = modal.querySelector('#reminderFormContextId');
    const ctxLabelInput = modal.querySelector('#reminderFormContextLabel');

    const title = (titleInput?.value || '').trim();
    if (!title) {
        deps.showNotification?.('Укажите заголовок напоминания.', 'warning', 4000);
        return;
    }

    const dueIso = localDatetimeToIso(dueInput?.value || '');
    if (!dueIso) {
        deps.showNotification?.('Укажите корректную дату и время.', 'warning', 4000);
        return;
    }

    const row = {
        title,
        note: (noteInput?.value || '').trim(),
        intent: intentSelect?.value || 'other',
        dueAt: dueIso,
        contextType: ctxTypeInput?.value || 'free',
        contextId: (ctxIdInput?.value || '').trim() || null,
        contextLabel: (ctxLabelInput?.value || '').trim() || null,
        status: 'pending',
        updatedAt: new Date().toISOString(),
    };

    const rawId = idInput?.value?.trim();
    if (rawId) {
        const num = parseInt(rawId, 10);
        if (!Number.isNaN(num)) row.id = num;
    } else {
        row.createdAt = new Date().toISOString();
    }

    await saveReminderRow(row);
    deps.showNotification?.('Напоминание сохранено.', 'success', 2500);
    closeReminderModal();
    await renderRemindersPage();
    await runReminderDueCheck();
}

async function markReminderDone(id) {
    const rows = await getAllRemindersFromDB();
    const row = rows.find((r) => String(r.id) === String(id));
    if (!row) return;
    row.status = 'done';
    row.completedAt = new Date().toISOString();
    await saveReminderRow(row);
    await renderRemindersPage();
    await runReminderDueCheck();
}

async function snoozeReminder(id, days) {
    const rows = await getAllRemindersFromDB();
    const row = rows.find((r) => String(r.id) === String(id));
    if (!row) return;
    const base = new Date();
    const d = addCalendarDaysUtc(base, days);
    row.dueAt = d.toISOString();
    row.updatedAt = new Date().toISOString();
    toastShownThisSession.delete(String(id));
    await saveReminderRow(row);
    deps.showNotification?.(`Отложено на ${days} дн.`, 'info', 2500);
    await renderRemindersPage();
}

async function openReminderContext(row) {
    const t = row.contextType;
    const cid = row.contextId;
    if (t === 'bookmark' && cid != null && deps.showBookmarkDetailModal) {
        const num = parseInt(String(cid), 10);
        if (!Number.isNaN(num)) await deps.showBookmarkDetailModal(num);
        return;
    }
    if (t === 'client') {
        deps.showNotification?.('Откройте главную вкладку — блок «Информация по обращению».', 'info', 5000);
        await deps.setActiveTab?.('main');
        return;
    }
    deps.showNotification?.('Для этого типа контекста откройте соответствующий раздел вручную.', 'info', 4000);
}

function bindReminderListClicks() {
    const listEl = document.getElementById('remindersList');
    if (!listEl || listEl._reminderClicksBound) return;
    listEl._reminderClicksBound = true;
    listEl.addEventListener('click', async (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const del = t.closest('.reminder-delete-btn');
        const done = t.closest('.reminder-done-btn');
        const sn = t.closest('.reminder-snooze-btn');
        const op = t.closest('.reminder-open-btn');
        const id = del?.dataset?.id || done?.dataset?.id || sn?.dataset?.id || op?.dataset?.id;
        if (!id) return;
        e.preventDefault();
        if (del) {
            await deleteReminderById(id);
            toastShownThisSession.delete(String(id));
            deps.showNotification?.('Удалено.', 'info', 2000);
            await renderRemindersPage();
            return;
        }
        if (done) {
            await markReminderDone(id);
            return;
        }
        if (sn) {
            const days = parseInt(sn.dataset.days || '1', 10);
            await snoozeReminder(id, Number.isFinite(days) ? days : 1);
            return;
        }
        if (op) {
            const rows = await getAllRemindersFromDB();
            const row = rows.find((r) => String(r.id) === String(id));
            if (row) await openReminderContext(row);
        }
    });
}

/**
 * Быстрое создание напоминания из блока «Информация по обращению» на главной.
 */
export function openReminderFromClient() {
    const notes = document.getElementById('clientNotes')?.value?.trim() || '';
    const firstLine = (notes.split('\n')[0] || '').trim().slice(0, 120) || 'Текущее обращение';
    openReminderModal({
        contextType: 'client',
        contextId: 'current',
        contextLabel: firstLine,
        title: 'Вернуться к обращению',
        intent: 'callback',
        daysFromNow: 3,
    });
}

export function initContextRemindersSystem() {
    bindReminderListClicks();

    const addBtn = document.getElementById('addReminderBtn');
    if (addBtn && !addBtn._bound) {
        addBtn._bound = true;
        addBtn.addEventListener('click', () => openReminderModal({ contextType: 'free' }));
    }

    const modal = reminderModalEl();
    if (modal && !modal._bound) {
        modal._bound = true;
        if (!modal._reminderEscapeBound) {
            modal._reminderEscapeBound = true;
            document.addEventListener(
                'keydown',
                (e) => {
                    if (e.key !== 'Escape') return;
                    const m = reminderModalEl();
                    if (!m || m.classList.contains('hidden')) return;
                    e.preventDefault();
                    closeReminderModal();
                },
                true,
            );
        }
        modal.querySelector('#reminderModalCloseBtn')?.addEventListener('click', closeReminderModal);
        modal.querySelector('#reminderModalCancelBtn')?.addEventListener('click', closeReminderModal);
        modal.querySelector('#reminderFormSubmitBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            submitReminderForm().catch(() => {});
        });

        modal.querySelectorAll('.reminder-quick-due-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const d = btn.getAttribute('data-days');
                applyQuickDueDays(d);
            });
        });
    }

    scheduleReminderChecks();
    renderRemindersPage().catch(() => {});
}
