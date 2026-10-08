'use strict';

import { isReducedMotion } from '../utils/motion-pref.js';

import { linkify as linkifyFn } from '../utils/html.js';
import { getPrefs, decide, muteNotification, applyToDocument } from './notification-prefs.js';

/**
 * Единая система тост-уведомлений.
 *
 * Все публичные вызовы прежних версий продолжают работать:
 *   NotificationService.add(message, type, { duration, important, id, isDismissible, onClick, autoDismissDelay })
 *   NotificationService.showImportant / showImportantRich / showTemporary / dismissImportant / init
 *   showNotification(message, type, durationOrOptions)
 * Новое:
 *   NotificationService.show({ id, type, title, message, sticky, duration, actions, progress, ... })
 *   NotificationService.update(id, patch) / dismiss(id) / dismissAll() / has(id)
 *   NotificationService.success|info|warning|error(message, options)
 *   NotificationService.progress(id, message, value) / complete(id, message, type)
 *
 * Возможности: типы success / info / warning / error / progress, очередь и лимит одновременно видимых
 * временных тостов, группировка дубликатов со счётчиком, пауза таймера при hover/focus/скрытой вкладке,
 * кнопка закрытия, кнопки действий, role=status|alert, reduced-motion, тёмная тема (стили — css/components/toasts.css).
 * Каждый тост типа error получает кнопку «Диагностика» (режим самодиагностики с контекстом ошибки).
 */

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const TYPE_META = {
    success: { icon: 'fa-check-circle', label: 'Успешно', role: 'status', duration: 3500 },
    info: { icon: 'fa-info-circle', label: 'Информация', role: 'status', duration: 4500 },
    warning: { icon: 'fa-exclamation-triangle', label: 'Предупреждение', role: 'status', duration: 6500 },
    error: { icon: 'fa-times-circle', label: 'Ошибка', role: 'alert', duration: 9000 },
    progress: { icon: 'fa-circle-notch fa-spin', label: 'Выполняется', role: 'status', duration: 0 },
    'hyper-alert': {
        icon: 'fa-exclamation-triangle',
        label: 'Тревога',
        role: 'alert',
        duration: 0,
    },
};

const MAX_VISIBLE_TIMED = 3;
const MAX_QUEUE = 8;
const MIN_DURATION_WITH_ACTIONS_MS = 10000;
const SHAKE_MS = 500;

function normalizeType(type) {
    return Object.prototype.hasOwnProperty.call(TYPE_META, type) ? type : 'info';
}

function stringify(value) {
    if (value == null) return '';
    return typeof value === 'string' ? value : String(value);
}

function reducedMotion() {
    return isReducedMotion();
}

/** Совместимость: раньше инжектировал CSS «без иконок». Теперь стили — в css/components/toasts.css. */
export function ensureNotificationIconlessStyles() {
    /* no-op: единая система тостов использует иконки и кнопку закрытия */
}

/**
 * Открывает режим самодиагностики с контекстом ошибки (ленивая загрузка, без циклических импортов).
 * @param {object} ctx
 */
function openDiagnosticsForToast(ctx) {
    try {
        const direct =
            (typeof window !== 'undefined' &&
                (window.CopilotDiagnostics?.openForIssue || window.openDiagnosticsForIssue)) ||
            null;
        if (typeof direct === 'function') {
            direct(ctx);
            return;
        }
        import('../features/diagnostics-ui.js')
            .then((m) => m.openDiagnosticsForIssue(ctx))
            .catch((err) => {
                console.warn('[NotificationService] Не удалось открыть диагностику:', err);
            });
    } catch (err) {
        console.warn('[NotificationService] openDiagnostics error:', err);
    }
}

// ============================================================================
// СЕРВИС УВЕДОМЛЕНИЙ
// ============================================================================

export const NotificationService = {
    /** Единый контейнер стека тостов (alias для старого имени). */
    importantNotificationsContainer: null,
    /** id → запись «важных» (sticky) тостов; используется внешним кодом через .has(id). */
    activeImportantNotifications: new Map(),
    /** id → запись любого видимого тоста. */
    activeToasts: new Map(),
    /** Очередь временных тостов, ожидающих свободного места. */
    toastQueue: [],
    temporaryNotificationElement: null,
    defaultTemporaryDuration: 3000,
    FADE_DURATION_MS: 300,
    MAX_VISIBLE_TIMED,
    isTemporaryNotificationVisible: false,
    _seq: 0,
    _visibilityBound: false,
    _resizeObserver: null,
    /** Переопределяемый обработчик кнопки «Диагностика». */
    diagnosticsHandler: openDiagnosticsForToast,

    // ------------------------------------------------------------------------
    // Инициализация контейнера
    // ------------------------------------------------------------------------
    init() {
        applyToDocument();
        if (
            this.importantNotificationsContainer &&
            document.body.contains(this.importantNotificationsContainer)
        ) {
            return;
        }
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            document.body.appendChild(container);
        }
        container.classList.add('app-toast-stack');
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'Уведомления');
        this.importantNotificationsContainer = container;

        if (!this._visibilityBound && typeof document !== 'undefined') {
            this._visibilityBound = true;
            document.addEventListener('visibilitychange', () => {
                for (const rec of this.activeToasts.values()) {
                    rec.hold.hidden = document.hidden;
                    this._syncTimer(rec);
                }
            });
        }
        if (typeof ResizeObserver !== 'undefined' && !this._resizeObserver) {
            try {
                this._resizeObserver = new ResizeObserver(() => this._emitLayout());
                this._resizeObserver.observe(container);
            } catch {
                /* ignore */
            }
        }
    },

    _emitLayout() {
        try {
            window.dispatchEvent(new CustomEvent('app-toasts-layout'));
        } catch {
            /* ignore */
        }
    },

    _nextId(prefix) {
        this._seq += 1;
        return `${prefix}-${Date.now()}-${this._seq}-${Math.random().toString(36).slice(2, 7)}`;
    },

    // ------------------------------------------------------------------------
    // Публичный API (новый)
    // ------------------------------------------------------------------------
    /**
     * @param {object} opts
     * @param {string} [opts.id] — фиксированный id: повторный вызов обновляет тост на месте
     * @param {'success'|'info'|'warning'|'error'|'progress'|'hyper-alert'} [opts.type]
     * @param {string} [opts.title]
     * @param {string} opts.message
     * @param {boolean} [opts.sticky] — не закрывать по таймеру
     * @param {number} [opts.duration] — мс (0 = не закрывать); по умолчанию зависит от типа
     * @param {number} [opts.autoDismissDelay] — для sticky: закрыть через N мс
     * @param {boolean} [opts.isDismissible=true]
     * @param {Array<{label:string,onClick?:Function,primary?:boolean,id?:string,keepOpen?:boolean}>} [opts.actions]
     * @param {Function} [opts.onClick]
     * @param {Function} [opts.onDismiss]
     * @param {number|null} [opts.progress] — 0..100; null/undefined у type=progress — неопределённый
     * @param {boolean|object} [opts.diagnostics] — false: без кнопки «Диагностика»; object — контекст ошибки
     * @param {boolean} [opts.dedupe=true] — группировать одинаковые сообщения
     * @returns {string} id
     */
    show(opts = {}) {
        const message = stringify(opts.message);
        const title = stringify(opts.title);
        if (!message.trim() && !title.trim()) {
            console.warn('[NotificationService.show] Пустое сообщение.');
            return '';
        }
        const type = normalizeType(opts.type);
        // Пользовательские настройки уведомлений: выключено / тип отключён / «Не беспокоить» / «Больше не показывать»
        if (!decide(getPrefs(), { ...opts, type, title, message }).show) return '';
        this.init();

        const id = opts.id ? String(opts.id) : null;

        // Обновление существующего тоста по id
        if (id && this.activeToasts.has(id)) {
            const rec = this.activeToasts.get(id);
            this._updateRecord(
                rec,
                {
                    ...opts,
                    type,
                    message,
                    title,
                    // как раньше: повторный вызов сбрасывает прежний автотаймер sticky-тоста
                    autoDismissDelay: opts.autoDismissDelay > 0 ? opts.autoDismissDelay : 0,
                },
                true,
            );
            return id;
        }

        const sticky = Boolean(opts.sticky);
        const dedupe = opts.dedupe !== false && getPrefs().groupDuplicates;

        // Группировка дубликатов (одинаковый тип + текст среди видимых/ожидающих)
        if (!id && dedupe) {
            const key = `${type}|${title}|${message}`;
            const dup =
                [...this.activeToasts.values()].find((r) => r.dedupeKey === key && !r.leaving) ||
                this.toastQueue.find((r) => r.dedupeKey === key);
            if (dup) {
                dup.count += 1;
                if (dup.el) {
                    this._renderCount(dup);
                    this._bump(dup);
                    if (!dup.sticky && dup.timer) this._restartTimer(dup);
                }
                return dup.id;
            }
        }

        const rec = this._createRecord({ ...opts, id, type, message, title, sticky });
        if (
            !sticky &&
            rec.type !== 'error' &&
            rec.type !== 'progress' &&
            this._visibleTimedCount() >= this._maxVisible()
        ) {
            this.toastQueue.push(rec);
            // Не копим бесконечную очередь: выбрасываем самые старые «лёгкие» тосты
            while (this.toastQueue.length > MAX_QUEUE) {
                const idx = this.toastQueue.findIndex(
                    (r) => r.type === 'info' || r.type === 'success',
                );
                this.toastQueue.splice(idx >= 0 ? idx : 0, 1);
            }
            return rec.id;
        }
        this._mount(rec);
        return rec.id;
    },

    success(message, options = {}) {
        if (message && typeof message === 'object') return this.show({ ...message, type: 'success' });
        return this.show({ ...options, type: 'success', message });
    },
    info(message, options = {}) {
        if (message && typeof message === 'object') return this.show({ ...message, type: 'info' });
        return this.show({ ...options, type: 'info', message });
    },
    warning(message, options = {}) {
        if (message && typeof message === 'object') return this.show({ ...message, type: 'warning' });
        return this.show({ ...options, type: 'warning', message });
    },
    error(message, options = {}) {
        if (message && typeof message === 'object') return this.show({ ...message, type: 'error' });
        return this.show({ ...options, type: 'error', message });
    },

    /** Тост-прогресс: value 0..100 или null (неопределённый). Закрывается через complete()/dismiss(). */
    progress(id, message, value = null, options = {}) {
        return this.show({
            ...options,
            id,
            type: 'progress',
            message,
            progress: value,
            sticky: true,
            isDismissible: options.isDismissible === true,
        });
    },

    /** Превращает тост-прогресс в итоговый (success/error) с обычным таймером закрытия. */
    complete(id, message, type = 'success', options = {}) {
        const rec = this.activeToasts.get(id);
        if (!rec) return this.show({ ...options, type, message });
        this._updateRecord(
            rec,
            {
                ...options,
                type: normalizeType(type),
                message,
                progress: undefined,
                sticky: false,
                isDismissible: true,
            },
            true,
        );
        return id;
    },

    update(id, patch = {}) {
        const rec = this.activeToasts.get(id);
        if (!rec) return false;
        this._updateRecord(rec, patch, false);
        return true;
    },

    has(id) {
        return this.activeToasts.has(String(id)) || this.toastQueue.some((r) => r.id === id);
    },

    dismiss(id) {
        const key = String(id);
        const rec = this.activeToasts.get(key);
        if (rec) {
            this._remove(rec);
            return true;
        }
        const qi = this.toastQueue.findIndex((r) => r.id === key);
        if (qi >= 0) {
            this.toastQueue.splice(qi, 1);
            return true;
        }
        return false;
    },

    dismissAll({ keepSticky = false } = {}) {
        this.toastQueue.length = 0;
        for (const rec of [...this.activeToasts.values()]) {
            if (keepSticky && rec.sticky) continue;
            this._remove(rec);
        }
    },

    // ------------------------------------------------------------------------
    // Совместимые методы
    // ------------------------------------------------------------------------
    add(message, type = 'info', options = {}) {
        const {
            duration,
            important = false,
            id = null,
            isDismissible = true,
            onClick = null,
            autoDismissDelay = null,
            actions,
            title,
            onDismiss,
            diagnostics,
            progress,
        } = options || {};

        if (important) {
            this.showImportant(message, type, {
                id,
                isDismissible,
                onClick,
                autoDismissDelay,
                actions,
                title,
                onDismiss,
                diagnostics,
                progress,
            });
        } else {
            this.showTemporary(message, type, duration, {
                id,
                onClick,
                isDismissible,
                actions,
                title,
                onDismiss,
                diagnostics,
                progress,
            });
        }
    },

    showImportant(message, type, options = {}) {
        const { autoDismissDelay = null, ...rest } = options;
        this.show({
            ...rest,
            type,
            message,
            sticky: true,
            autoDismissDelay,
        });
    },

    showTemporary(message, type, duration, options = {}) {
        const explicit =
            typeof duration === 'number' && Number.isFinite(duration) ? duration : undefined;
        this.show({ ...options, type, message, sticky: false, duration: explicit });
    },

    /**
     * Важное уведомление с кнопками действий и режимом «HUD»: первые minVisibleBeforeInteractionDismissMs
     * не закрывается от активности документа; затем — после любой активности закрывается через задержку.
     * @param {Object} options
     * @param {string} [options.id]
     * @param {string} options.message
     * @param {string} [options.type='warning']
     * @param {Array<{ label: string, onClick?: function, primary?: boolean, id?: string }>} [options.actions]
     * @param {boolean} [options.isDismissible=true]
     * @param {number} [options.minVisibleBeforeInteractionDismissMs=7000]
     * @param {number} [options.dismissAfterActivityDelayMs=2000]
     * @param {function} [options.onDismiss]
     * @param {function(Event): boolean} [options.shouldIgnoreInteractionEvent]
     */
    showImportantRich(options = {}) {
        const {
            id: fixedId = null,
            message,
            type = 'warning',
            actions = [],
            isDismissible = true,
            minVisibleBeforeInteractionDismissMs = 7000,
            dismissAfterActivityDelayMs = 2000,
            onDismiss = null,
            shouldIgnoreInteractionEvent = null,
        } = options;

        if (!message || typeof message !== 'string') {
            console.warn('[NotificationService.showImportantRich] Пустое сообщение.');
            return;
        }
        if (!decide(getPrefs(), { ...options, type, title: '', message }).show) return;
        this.init();

        const notificationId = fixedId || this._nextId('important-rich');
        if (fixedId && this.activeToasts.has(fixedId)) {
            this.dismiss(fixedId);
        }

        const rec = this._createRecord({
            id: notificationId,
            type,
            message,
            sticky: true,
            isDismissible,
            actions,
            onDismiss,
            rich: true,
            diagnostics: options.diagnostics,
            dedupe: false,
        });
        rec.el = null;
        this._mount(rec);

        let interactionDismissEnabled = false;
        let postActivityDismissTimeout = null;
        let minVisibleTimeout = null;

        const removeActivityListeners = () => {
            document.removeEventListener('click', onDocumentActivity, false);
            document.removeEventListener('keydown', onDocumentActivity, false);
            document.removeEventListener('touchstart', onDocumentActivity, false);
            document.removeEventListener('scroll', onDocumentActivity, false);
        };
        const onDocumentActivity = (e) => {
            if (!interactionDismissEnabled) return;
            if (
                typeof shouldIgnoreInteractionEvent === 'function' &&
                shouldIgnoreInteractionEvent(e)
            ) {
                return;
            }
            if (rec.el && rec.el.contains(e.target) && e.target.closest('button')) return;
            removeActivityListeners();
            if (postActivityDismissTimeout) clearTimeout(postActivityDismissTimeout);
            postActivityDismissTimeout = setTimeout(() => {
                postActivityDismissTimeout = null;
                this._remove(rec, { fireDismiss: true });
            }, dismissAfterActivityDelayMs);
        };

        rec.richCleanup = () => {
            if (minVisibleTimeout) {
                clearTimeout(minVisibleTimeout);
                minVisibleTimeout = null;
            }
            if (postActivityDismissTimeout) {
                clearTimeout(postActivityDismissTimeout);
                postActivityDismissTimeout = null;
            }
            removeActivityListeners();
        };

        minVisibleTimeout = setTimeout(() => {
            minVisibleTimeout = null;
            interactionDismissEnabled = true;
            document.addEventListener('click', onDocumentActivity, false);
            document.addEventListener('keydown', onDocumentActivity, false);
            document.addEventListener('touchstart', onDocumentActivity, { passive: true });
            document.addEventListener('scroll', onDocumentActivity, { passive: true });
        }, minVisibleBeforeInteractionDismissMs);
    },

    dismissImportant(notificationId) {
        return this.dismiss(notificationId);
    },

    // ------------------------------------------------------------------------
    // Внутренняя кухня
    // ------------------------------------------------------------------------
    _maxVisible() {
        return getPrefs().maxVisible || MAX_VISIBLE_TIMED;
    },

    /** Множитель времени показа из настроек (0 — «не закрывать» не трогаем). */
    _scaleDuration(ms) {
        if (!(ms > 0)) return ms;
        return Math.max(1200, Math.round(ms * getPrefs().durationScale));
    },

    _visibleTimedCount() {
        let n = 0;
        for (const r of this.activeToasts.values()) {
            if (!r.sticky && !r.leaving && r.type !== 'error' && r.type !== 'progress') n += 1;
        }
        return n;
    },

    _createRecord(o) {
        const type = normalizeType(o.type);
        const meta = TYPE_META[type];
        const id = o.id || this._nextId(o.sticky ? 'important' : 'temp');
        const diagnosticsOff =
            o.diagnostics === false || type !== 'error' || !getPrefs().showDiagnosticsButton;
        const actions = Array.isArray(o.actions) ? o.actions.filter((a) => a && a.label) : [];
        const rec = {
            id,
            type,
            title: stringify(o.title),
            message: stringify(o.message),
            sticky: Boolean(o.sticky),
            dismissible: o.isDismissible !== false,
            actions,
            onClick: typeof o.onClick === 'function' ? o.onClick : null,
            onDismiss: typeof o.onDismiss === 'function' ? o.onDismiss : null,
            progress: o.progress === undefined ? undefined : o.progress,
            rich: Boolean(o.rich),
            count: 1,
            el: null,
            leaving: false,
            timer: null,
            hold: { hover: false, focus: false, hidden: false },
            dedupeKey: !o.id && o.dedupe !== false ? `${type}|${stringify(o.title)}|${stringify(o.message)}` : null,
            diagnosticsCtx: diagnosticsOff
                ? null
                : typeof o.diagnostics === 'object' && o.diagnostics
                  ? o.diagnostics
                  : {},
            durationMs: 0,
            autoDismissDelay: o.autoDismissDelay > 0 ? o.autoDismissDelay : 0,
            meta,
        };
        if (rec.sticky) {
            rec.durationMs = rec.autoDismissDelay && rec.dismissible ? rec.autoDismissDelay : 0;
        } else {
            let d =
                typeof o.duration === 'number' && Number.isFinite(o.duration)
                    ? o.duration
                    : meta.duration || this.defaultTemporaryDuration;
            const hasButtons = rec.actions.length > 0 || rec.diagnosticsCtx;
            if (
                d > 0 &&
                hasButtons &&
                !(typeof o.duration === 'number' && Number.isFinite(o.duration))
            ) {
                d = Math.max(d, MIN_DURATION_WITH_ACTIONS_MS);
            }
            rec.durationMs = this._scaleDuration(d);
        }
        rec.muteSrc = { suppressKey: o.suppressKey, title: rec.title, message: rec.message };
        rec.muteable = o.muteable !== false;
        return rec;
    },

    _buildElement(rec) {
        const el = document.createElement('div');
        el.className = `app-toast-wrap`;
        el.dataset.id = rec.id;

        const card = document.createElement('div');
        card.className = [
            'app-toast',
            `app-toast--${rec.type}`,
            // совместимость со старыми селекторами
            'notification-item',
            `notification-type-${rec.type}`,
            rec.sticky ? 'important-notification' : 'temporary-notification',
        ].join(' ');
        card.dataset.id = rec.id;
        card.dataset.type = rec.type;
        if (rec.rich) card.dataset.richNotification = '1';
        card.setAttribute('role', rec.meta.role);
        card.setAttribute('aria-live', rec.meta.role === 'alert' ? 'assertive' : 'polite');
        card.setAttribute('aria-atomic', 'true');
        card.tabIndex = -1;
        if (rec.type === 'hyper-alert') card.classList.add('notification-hyper-alert');

        const icon = document.createElement('span');
        icon.className = 'app-toast__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<i class="fas ${rec.meta.icon}"></i>`;
        card.appendChild(icon);

        const body = document.createElement('div');
        body.className = 'app-toast__body';
        const title = document.createElement('div');
        title.className = 'app-toast__title';
        const msg = document.createElement('div');
        msg.className = 'app-toast__message notification-message-span notification-message-span--toast';
        body.appendChild(title);
        body.appendChild(msg);
        const actions = document.createElement('div');
        actions.className = 'app-toast__actions';
        body.appendChild(actions);
        card.appendChild(body);

        const count = document.createElement('span');
        count.className = 'app-toast__count';
        count.hidden = true;
        count.setAttribute('aria-hidden', 'true');
        card.appendChild(count);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'app-toast__close';
        close.setAttribute('aria-label', 'Закрыть уведомление');
        close.title = 'Закрыть';
        close.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            this._remove(rec, { fireDismiss: true });
        });
        card.appendChild(close);

        const bar = document.createElement('div');
        bar.className = 'app-toast__bar';
        bar.setAttribute('aria-hidden', 'true');
        bar.innerHTML = '<span></span>';
        card.appendChild(bar);

        card.addEventListener('mouseenter', () => {
            if (!getPrefs().pauseOnHover) return;
            rec.hold.hover = true;
            this._syncTimer(rec);
        });
        card.addEventListener('mouseleave', () => {
            rec.hold.hover = false;
            this._syncTimer(rec);
        });
        card.addEventListener('focusin', () => {
            rec.hold.focus = true;
            this._syncTimer(rec);
        });
        card.addEventListener('focusout', (e) => {
            if (!card.contains(e.relatedTarget)) {
                rec.hold.focus = false;
                this._syncTimer(rec);
            }
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && rec.dismissible) {
                e.stopPropagation();
                this._remove(rec, { fireDismiss: true });
            }
        });
        card.addEventListener('click', (e) => {
            if (!rec.onClick) return;
            if (e.target.closest('button, a')) return;
            try {
                rec.onClick(e);
            } catch (err) {
                console.warn('[NotificationService] onClick error:', err);
            }
        });

        el.appendChild(card);
        rec.card = card;
        rec.refs = { icon, title, msg, actions, count, close, bar };
        return el;
    },

    _fillContent(rec) {
        const { refs, card } = rec;
        const meta = TYPE_META[rec.type];
        rec.meta = meta;
        card.className = card.className
            .replace(/app-toast--\S+/g, '')
            .replace(/notification-type-\S+/g, '')
            .trim();
        card.classList.add(`app-toast--${rec.type}`, `notification-type-${rec.type}`);
        card.classList.toggle('notification-hyper-alert', rec.type === 'hyper-alert');
        card.setAttribute('role', meta.role);
        card.setAttribute('aria-live', meta.role === 'alert' ? 'assertive' : 'polite');
        refs.icon.innerHTML = `<i class="fas ${meta.icon}"></i>`;

        refs.title.hidden = !rec.title;
        refs.title.textContent = rec.title;
        const html = linkifyFn(rec.message);
        if (refs.msg.innerHTML !== html) refs.msg.innerHTML = html;
        refs.msg.hidden = !rec.message;

        refs.close.hidden = !rec.dismissible;
        card.classList.toggle('has-close', rec.dismissible);
        card.classList.toggle('is-clickable', Boolean(rec.onClick));

        // Прогресс
        const isProgress = rec.type === 'progress' || rec.progress != null;
        card.classList.toggle('is-progress', isProgress);
        if (isProgress) {
            card.classList.add('is-timed-none');
            const hasValue = typeof rec.progress === 'number' && Number.isFinite(rec.progress);
            card.classList.toggle('is-indeterminate', !hasValue);
            const bar = refs.bar;
            bar.classList.add('is-progress-bar');
            const inner = bar.firstElementChild;
            if (hasValue) {
                const v = Math.max(0, Math.min(100, rec.progress));
                inner.style.width = `${v}%`;
                card.setAttribute('aria-valuenow', String(Math.round(v)));
            } else {
                inner.style.width = '';
                card.removeAttribute('aria-valuenow');
            }
        } else {
            refs.bar.classList.remove('is-progress-bar');
        }

        // Кнопки действий (+ «Диагностика» для ошибок)
        refs.actions.textContent = '';
        const allActions = [...rec.actions];
        if (rec.diagnosticsCtx && !allActions.some((a) => a.id === 'diagnostics')) {
            allActions.push({
                id: 'diagnostics',
                label: 'Диагностика',
                icon: 'fa-stethoscope',
                onClick: () => {
                    const ctx = {
                        source: 'toast',
                        type: rec.type,
                        notificationId: rec.id,
                        title: rec.title || '',
                        message: rec.message,
                        ts: Date.now(),
                        ...rec.diagnosticsCtx,
                    };
                    const handler =
                        typeof this.diagnosticsHandler === 'function'
                            ? this.diagnosticsHandler
                            : openDiagnosticsForToast;
                    handler(ctx);
                },
            });
        }
        if (
            getPrefs().showMuteButton &&
            rec.muteable !== false &&
            (rec.type === 'error' || (rec.type === 'warning' && rec.sticky)) &&
            !allActions.some((a) => a.id === 'mute')
        ) {
            allActions.push({
                id: 'mute',
                label: 'Больше не показывать',
                icon: 'fa-bell-slash',
                onClick: () => {
                    const src = { ...(rec.muteSrc || {}), title: rec.title, message: rec.message };
                    const type = rec.type;
                    const key = muteNotification(src, type);
                    this._remove(rec, { fireDismiss: true });
                    this.show({
                        type: 'info',
                        force: true,
                        message: 'Такое уведомление больше не будет показываться. Вернуть можно в Настройки → Уведомления.',
                        duration: 7000,
                        actions: [
                            {
                                label: 'Отменить',
                                onClick: () => {
                                    import('./notification-prefs.js').then((m) => m.unmuteNotification(key));
                                },
                            },
                        ],
                    });
                },
            });
        }
        for (const action of allActions) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className =
                'app-toast__btn' + (action.primary === true ? ' app-toast__btn--primary' : '');
            if (action.icon) {
                const ic = document.createElement('i');
                ic.className = `fas ${action.icon}`;
                ic.setAttribute('aria-hidden', 'true');
                btn.appendChild(ic);
            }
            btn.appendChild(document.createTextNode(action.label));
            if (action.id) btn.dataset.actionId = String(action.id);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    if (typeof action.onClick === 'function') action.onClick(e);
                } catch (err) {
                    console.warn('[NotificationService] action error:', err);
                }
            });
            refs.actions.appendChild(btn);
        }
        refs.actions.hidden = allActions.length === 0;
        card.classList.toggle('has-actions', allActions.length > 0);
        this._renderCount(rec);
    },

    _renderCount(rec) {
        if (!rec.refs) return;
        const c = rec.refs.count;
        c.hidden = rec.count < 2;
        c.textContent = rec.count > 99 ? '99+' : `×${rec.count}`;
        rec.card.classList.toggle('has-count', rec.count > 1);
    },

    _bump(rec) {
        if (!rec.card) return;
        rec.card.classList.remove('is-bumped');
        // перезапуск CSS-анимации
        void rec.card.offsetWidth;
        rec.card.classList.add('is-bumped');
        clearTimeout(rec.bumpTimer);
        rec.bumpTimer = setTimeout(() => rec.card && rec.card.classList.remove('is-bumped'), SHAKE_MS);
    },

    _mount(rec) {
        this.init();
        const el = this._buildElement(rec);
        rec.el = el;
        this._fillContent(rec);
        rec.hold.hidden = typeof document !== 'undefined' ? document.hidden : false;

        const container = this.importantNotificationsContainer;
        container.prepend(el);
        this.activeToasts.set(rec.id, rec);
        if (rec.sticky) {
            this.activeImportantNotifications.set(rec.id, {
                element: el,
                data: {
                    message: rec.message,
                    type: rec.type,
                    id: rec.id,
                    isDismissible: rec.dismissible,
                    rich: rec.rich || undefined,
                },
                timeoutId: null,
                richCleanup: () => rec.richCleanup && rec.richCleanup(),
            });
        } else {
            this.temporaryNotificationElement = el;
            this.isTemporaryNotificationVisible = true;
        }

        el.classList.add('is-entering');
        const enter = () => el.classList.remove('is-entering');
        if (reducedMotion()) enter();
        else requestAnimationFrame(() => requestAnimationFrame(enter));

        if (rec.durationMs > 0) this._startTimer(rec, rec.durationMs);
        this._emitLayout();
    },

    _startTimer(rec, ms) {
        this._clearTimer(rec);
        rec.timer = { total: ms, remaining: ms, startedAt: Date.now(), handle: null, paused: false };
        if (rec.card) {
            rec.card.style.setProperty('--toast-duration', `${ms}ms`);
            rec.card.classList.add('is-timed');
            rec.card.classList.remove('is-paused');
            // перезапуск анимации полоски времени
            const inner = rec.refs.bar.firstElementChild;
            if (inner && !rec.card.classList.contains('is-progress')) {
                inner.style.animation = 'none';
                void inner.offsetWidth;
                inner.style.animation = '';
            }
        }
        rec.timer.handle = setTimeout(() => this._remove(rec, { fireDismiss: false }), ms);
        this._syncTimer(rec);
    },

    _restartTimer(rec) {
        if (rec.durationMs > 0) this._startTimer(rec, rec.durationMs);
    },

    _clearTimer(rec) {
        if (rec.timer && rec.timer.handle) clearTimeout(rec.timer.handle);
        rec.timer = null;
        if (rec.card) rec.card.classList.remove('is-timed', 'is-paused');
    },

    _syncTimer(rec) {
        const t = rec.timer;
        if (!t) return;
        const shouldHold = rec.hold.hover || rec.hold.focus || rec.hold.hidden;
        if (shouldHold && !t.paused) {
            clearTimeout(t.handle);
            t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
            t.paused = true;
            t.handle = null;
            rec.card && rec.card.classList.add('is-paused');
        } else if (!shouldHold && t.paused) {
            t.paused = false;
            t.startedAt = Date.now();
            t.handle = setTimeout(
                () => this._remove(rec, { fireDismiss: false }),
                Math.max(400, t.remaining),
            );
            rec.card && rec.card.classList.remove('is-paused');
        }
    },

    _updateRecord(rec, patch, restart) {
        if (!rec || rec.leaving) return;
        const prevType = rec.type;
        if (patch.type !== undefined) rec.type = normalizeType(patch.type);
        if (patch.title !== undefined) rec.title = stringify(patch.title);
        if (patch.message !== undefined) rec.message = stringify(patch.message);
        if ('progress' in patch) rec.progress = patch.progress;
        if (patch.isDismissible !== undefined) rec.dismissible = patch.isDismissible !== false;
        if (Array.isArray(patch.actions)) rec.actions = patch.actions.filter((a) => a && a.label);
        if (typeof patch.onClick === 'function') rec.onClick = patch.onClick;
        if (typeof patch.onDismiss === 'function') rec.onDismiss = patch.onDismiss;
        if (patch.diagnostics !== undefined) {
            rec.diagnosticsCtx =
                patch.diagnostics === false || rec.type !== 'error'
                    ? null
                    : typeof patch.diagnostics === 'object'
                      ? patch.diagnostics
                      : rec.diagnosticsCtx || {};
        } else if (rec.type !== 'error') {
            rec.diagnosticsCtx = null;
        } else if (prevType !== 'error' && !rec.diagnosticsCtx) {
            rec.diagnosticsCtx = {};
        }
        if (patch.sticky !== undefined) {
            const was = rec.sticky;
            rec.sticky = Boolean(patch.sticky);
            if (was !== rec.sticky && rec.card) {
                rec.card.classList.toggle('important-notification', rec.sticky);
                rec.card.classList.toggle('temporary-notification', !rec.sticky);
                if (rec.sticky && !this.activeImportantNotifications.has(rec.id)) {
                    this.activeImportantNotifications.set(rec.id, {
                        element: rec.el,
                        data: { message: rec.message, type: rec.type, id: rec.id },
                        timeoutId: null,
                    });
                } else if (!rec.sticky) {
                    this.activeImportantNotifications.delete(rec.id);
                }
            }
        }
        if (patch.autoDismissDelay !== undefined) {
            rec.autoDismissDelay = patch.autoDismissDelay > 0 ? patch.autoDismissDelay : 0;
        }
        // длительность
        const explicitDuration =
            typeof patch.duration === 'number' && Number.isFinite(patch.duration)
                ? patch.duration
                : undefined;
        if (rec.sticky) {
            rec.durationMs = rec.autoDismissDelay && rec.dismissible ? rec.autoDismissDelay : 0;
        } else {
            const meta = TYPE_META[rec.type];
            let d = explicitDuration !== undefined ? explicitDuration : meta.duration || 3000;
            if (explicitDuration === undefined && d > 0 && (rec.actions.length || rec.diagnosticsCtx)) {
                d = Math.max(d, MIN_DURATION_WITH_ACTIONS_MS);
            }
            rec.durationMs = this._scaleDuration(d);
        }
        if (patch.suppressKey !== undefined) rec.muteSrc = { ...(rec.muteSrc || {}), suppressKey: patch.suppressKey };
        if (rec.card) {
            this._fillContent(rec);
            if (this.activeImportantNotifications.has(rec.id)) {
                const e = this.activeImportantNotifications.get(rec.id);
                e.data.message = rec.message;
                e.data.type = rec.type;
            }
            if (restart) {
                if (rec.durationMs > 0) this._startTimer(rec, rec.durationMs);
                else this._clearTimer(rec);
                this._bump(rec);
            }
        }
        this._emitLayout();
    },

    _remove(rec, { fireDismiss = false } = {}) {
        if (!rec || rec.leaving) return;
        rec.leaving = true;
        if (typeof rec.richCleanup === 'function') {
            try {
                rec.richCleanup();
            } catch (e) {
                console.warn('[NotificationService] richCleanup error:', e);
            }
        }
        this._clearTimer(rec);
        clearTimeout(rec.bumpTimer);
        this.activeToasts.delete(rec.id);
        this.activeImportantNotifications.delete(rec.id);
        if (this.temporaryNotificationElement === rec.el) this.temporaryNotificationElement = null;
        this.isTemporaryNotificationVisible = this._visibleTimedCount() > 0;
        if (fireDismiss && rec.onDismiss) {
            try {
                rec.onDismiss();
            } catch (e) {
                console.warn('[NotificationService] onDismiss error:', e);
            }
        }

        const el = rec.el;
        if (!el) {
            this._pumpQueue();
            return;
        }
        el.classList.add('is-leaving');
        el.style.maxHeight = `${el.offsetHeight}px`;
        requestAnimationFrame(() => {
            el.style.maxHeight = '0px';
        });
        setTimeout(() => {
            if (el.parentElement) el.remove();
            this._pumpQueue();
            this._emitLayout();
        }, this.FADE_DURATION_MS + 20);
    },

    _pumpQueue() {
        while (this.toastQueue.length && this._visibleTimedCount() < this._maxVisible()) {
            const next = this.toastQueue.shift();
            this._mount(next);
        }
    },
};

// ============================================================================
// LEGACY showNotification (message, type, duration)
// ============================================================================

export function showNotification(message, type = 'success', durationOrOptions) {
    if (!message || typeof message !== 'string' || message.trim() === '') {
        console.warn('[showNotification] Вызван с пустым или невалидным сообщением.', {
            messageContent: message,
            type,
        });
        return;
    }

    // Объект опций — тот же контракт, что у NotificationService.add (duration, important, …)
    if (durationOrOptions !== null && typeof durationOrOptions === 'object') {
        NotificationService.add(message, type, durationOrOptions);
        return;
    }

    // Без явной длительности — по умолчанию для типа (success 3.5 с … error 9 с)
    const duration =
        typeof durationOrOptions === 'number' && Number.isFinite(durationOrOptions)
            ? durationOrOptions
            : undefined;
    NotificationService.add(message, type, { duration });
}
