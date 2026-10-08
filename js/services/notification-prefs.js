'use strict';

/**
 * Настройки системы уведомлений (хранятся в localStorage, применяются сразу, без «Сохранить»).
 * Модуль не зависит от DOM, кроме applyToDocument(); вся логика решений — чистые функции.
 */

export const NOTIFICATION_PREFS_KEY = 'copilot1co:notification-prefs:v1';

export const TOAST_POSITIONS = Object.freeze([
    ['top-right', 'Сверху справа'],
    ['top-left', 'Сверху слева'],
    ['bottom-right', 'Снизу справа'],
    ['bottom-left', 'Снизу слева'],
]);

export const TYPE_LABELS = Object.freeze({
    success: 'Успех',
    info: 'Информация',
    warning: 'Предупреждения',
    error: 'Ошибки',
});

export const DEFAULT_PREFS = Object.freeze({
    enabled: true,
    types: Object.freeze({ success: true, info: true, warning: true, error: true }),
    /** Множитель времени показа: 0.5 … 3 */
    durationScale: 1,
    /** Сколько временных тостов показывать одновременно: 1 … 6 */
    maxVisible: 3,
    position: 'top-right',
    groupDuplicates: true,
    pauseOnHover: true,
    showDiagnosticsButton: true,
    /** Кнопка «Больше не показывать» на ошибках и предупреждениях */
    showMuteButton: true,
    /** «Не беспокоить»: в заданное время показываются только ошибки */
    dnd: Object.freeze({ enabled: false, from: '22:00', to: '08:00' }),
    /** key → { label, type, ts } — заглушённые уведомления */
    muted: Object.freeze({}),
});

function clamp(n, min, max, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
}

function isHHMM(s) {
    return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Приводит произвольный объект к валидным настройкам (мусор → значения по умолчанию). */
export function normalizePrefs(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const types = {};
    for (const t of Object.keys(DEFAULT_PREFS.types)) {
        types[t] = src.types && typeof src.types[t] === 'boolean' ? src.types[t] : DEFAULT_PREFS.types[t];
    }
    const positions = TOAST_POSITIONS.map((p) => p[0]);
    const muted = {};
    if (src.muted && typeof src.muted === 'object') {
        for (const k of Object.keys(src.muted).slice(0, 200)) {
            const m = src.muted[k];
            if (!k || !m || typeof m !== 'object') continue;
            muted[k] = {
                label: String(m.label || k).slice(0, 200),
                type: m.type === 'warning' ? 'warning' : 'error',
                ts: Number(m.ts) || 0,
            };
        }
    }
    const dnd = src.dnd && typeof src.dnd === 'object' ? src.dnd : {};
    return {
        enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_PREFS.enabled,
        types,
        durationScale: clamp(src.durationScale, 0.5, 3, 1),
        maxVisible: Math.round(clamp(src.maxVisible, 1, 6, 3)),
        position: positions.includes(src.position) ? src.position : DEFAULT_PREFS.position,
        groupDuplicates: typeof src.groupDuplicates === 'boolean' ? src.groupDuplicates : true,
        pauseOnHover: typeof src.pauseOnHover === 'boolean' ? src.pauseOnHover : true,
        showDiagnosticsButton:
            typeof src.showDiagnosticsButton === 'boolean' ? src.showDiagnosticsButton : true,
        showMuteButton: typeof src.showMuteButton === 'boolean' ? src.showMuteButton : true,
        dnd: {
            enabled: typeof dnd.enabled === 'boolean' ? dnd.enabled : false,
            from: isHHMM(dnd.from) ? dnd.from : DEFAULT_PREFS.dnd.from,
            to: isHHMM(dnd.to) ? dnd.to : DEFAULT_PREFS.dnd.to,
        },
        muted,
    };
}

function toMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/** Попадает ли момент `date` в окно «Не беспокоить» (окно может переходить через полночь). */
export function isInDndWindow(dnd, date = new Date()) {
    if (!dnd || !dnd.enabled) return false;
    const from = toMinutes(dnd.from);
    const to = toMinutes(dnd.to);
    if (from === to) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Ключ для «Больше не показывать»: явный suppressKey либо нормализованный текст (числа → #). */
export function makeMuteKey(opts) {
    if (opts && opts.suppressKey) return String(opts.suppressKey).slice(0, 160);
    const text = `${opts?.title || ''} ${opts?.message || ''}`
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '#url')
        .replace(/\d+/g, '#')
        .replace(/\s+/g, ' ')
        .trim();
    return `auto:${opts?.type || 'info'}:${text.slice(0, 120)}`;
}

/**
 * Решение: показывать ли уведомление.
 * @returns {{ show: boolean, reason?: 'disabled'|'type'|'muted'|'dnd' }}
 */
export function decide(prefs, opts, date = new Date()) {
    const type = opts?.type || 'info';
    // Прогресс и «тревога» — служебные, их не гасим (иначе пропадёт обратная связь долгих операций).
    if (type === 'progress' || type === 'hyper-alert') return { show: true };
    if (opts && opts.force === true) return { show: true };
    if (!prefs.enabled) return { show: false, reason: 'disabled' };
    if (type in prefs.types && prefs.types[type] === false) return { show: false, reason: 'type' };
    if (type === 'error' || type === 'warning') {
        if (prefs.muted[makeMuteKey({ ...opts, type })]) return { show: false, reason: 'muted' };
    }
    if (type !== 'error' && isInDndWindow(prefs.dnd, date)) return { show: false, reason: 'dnd' };
    return { show: true };
}

// ---------------------------------------------------------------------------
// Хранилище
// ---------------------------------------------------------------------------
let cache = null;
const listeners = new Set();

function readStorage() {
    try {
        const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
        return normalizePrefs(raw ? JSON.parse(raw) : null);
    } catch {
        return normalizePrefs(null);
    }
}

export function getPrefs() {
    if (!cache) cache = readStorage();
    return cache;
}

export function setPrefs(patch) {
    const cur = getPrefs();
    const next = normalizePrefs({
        ...cur,
        ...patch,
        types: { ...cur.types, ...(patch && patch.types) },
        dnd: { ...cur.dnd, ...(patch && patch.dnd) },
        muted: patch && 'muted' in patch ? patch.muted : cur.muted,
    });
    cache = next;
    try {
        localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next));
    } catch (e) {
        console.warn('[notification-prefs] Не удалось сохранить настройки:', e);
    }
    applyToDocument();
    listeners.forEach((fn) => {
        try {
            fn(next);
        } catch {
            /* ignore */
        }
    });
    return next;
}

export function resetPrefs({ keepMuted = false } = {}) {
    const muted = keepMuted ? getPrefs().muted : {};
    cache = null;
    try {
        localStorage.removeItem(NOTIFICATION_PREFS_KEY);
    } catch {
        /* ignore */
    }
    return setPrefs({ ...normalizePrefs(null), muted });
}

export function onPrefsChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function muteNotification(opts, type) {
    const key = makeMuteKey({ ...opts, type });
    const label = String(opts.title || opts.message || key).replace(/\s+/g, ' ').slice(0, 160);
    const muted = { ...getPrefs().muted, [key]: { label, type, ts: Date.now() } };
    setPrefs({ muted });
    return key;
}

export function unmuteNotification(key) {
    const muted = { ...getPrefs().muted };
    delete muted[key];
    setPrefs({ muted });
}

export function clearMuted() {
    setPrefs({ muted: {} });
}

/** Для сброса кэша в тестах. */
export function _resetCacheForTests() {
    cache = null;
}

export function applyToDocument() {
    if (typeof document === 'undefined') return;
    const p = getPrefs();
    const root = document.documentElement;
    root.dataset.toastPos = p.position;
    root.dataset.toastGroup = p.groupDuplicates ? '1' : '0';
}
