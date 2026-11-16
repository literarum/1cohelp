'use strict';

/**
 * Страж локальных данных.
 *
 * 1. Постоянное хранилище: navigator.storage.persist(). Без него браузер вправе вытеснить
 *    IndexedDB при нехватке места — для полностью локального приложения это потеря всех данных.
 * 2. Квота: предупреждение, когда занято больше 85% доступного места.
 * 3. Несколько вкладок: BroadcastChannel. Вкладка с устаревшими данными в памяти могла молча
 *    перезаписать изменения, сделанные в другой вкладке (алгоритмы сохраняются целиком).
 *    Теперь соседние вкладки узнают об изменениях и предлагают обновиться.
 */

export const CHANNEL_NAME = 'copilot-1co-data';
export const QUOTA_WARN_RATIO = 0.85;

/** Хранилища с пользовательскими данными: изменения в них важны для соседних вкладок. */
export const SYNCED_STORES = new Set([
    'algorithms',
    'links',
    'bookmarks',
    'bookmarkFolders',
    'reglaments',
    'extLinks',
    'extLinkCategories',
    'blacklistedClients',
    'favorites',
    'reminders',
    'screenshots',
    'pdfFiles',
    'clientAnalyticsFiles',
    'clientAnalyticsRecords',
    'clientAnalyticsFolders',
    'clientAnalyticsTags',
    'clientAnalyticsCardMeta',
    'trainingUserCurriculum',
    'mentorQuizPackages',
]);

const STORE_LABELS = {
    algorithms: 'алгоритмы',
    links: 'ссылки 1С',
    bookmarks: 'закладки',
    bookmarkFolders: 'папки закладок',
    reglaments: 'регламенты',
    extLinks: 'внешние ресурсы',
    extLinkCategories: 'категории ресурсов',
    blacklistedClients: 'чёрный список',
    favorites: 'избранное',
    reminders: 'напоминания',
    screenshots: 'скриншоты',
    pdfFiles: 'PDF-вложения',
    clientAnalyticsFiles: 'база клиентов',
    clientAnalyticsRecords: 'база клиентов',
    clientAnalyticsFolders: 'база клиентов',
    clientAnalyticsTags: 'база клиентов',
    clientAnalyticsCardMeta: 'база клиентов',
    trainingUserCurriculum: 'обучение',
    mentorQuizPackages: 'обучение',
};

/** Человекочитаемый список изменённых разделов без повторов. */
export function describeChangedStores(storeNames) {
    const labels = [];
    for (const name of storeNames) {
        const label = STORE_LABELS[name] || name;
        if (!labels.includes(label)) labels.push(label);
    }
    return labels.join(', ');
}

/** Байты → «12,3 МБ». */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }
    const digits = i === 0 || v >= 100 ? 0 : 1;
    return `${v.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${units[i]}`;
}

/**
 * @param {{usage?:number, quota?:number}|null|undefined} estimate
 * @returns {{usage:number, quota:number, ratio:number, warn:boolean}|null}
 */
export function evaluateQuota(estimate) {
    const usage = Number(estimate?.usage);
    const quota = Number(estimate?.quota);
    if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
    const ratio = usage / quota;
    return { usage, quota, ratio, warn: ratio >= QUOTA_WARN_RATIO };
}

const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let channel = null;
let notify = null;
const pendingRemoteStores = new Set();
let remoteNoticeShown = false;
let multiTabNoticeShown = false;
let outgoing = new Set();
let flushTimer = null;
/** Запись считается пользовательской, если прошло не больше этого времени после ввода. */
export const USER_WRITE_WINDOW_MS = 15000;
let lastUserInputAt = 0;
const markUserInput = () => {
    lastUserInputAt = Date.now();
};

function getNotifier() {
    if (notify) return notify;
    const svc = typeof window !== 'undefined' ? window.NotificationService : null;
    if (svc && typeof svc.add === 'function') return (msg, type, opts) => svc.add(msg, type, opts);
    if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
        return (msg, type) => window.showNotification(msg, type);
    }
    return null;
}

function showRemoteChangeNotice() {
    const n = getNotifier();
    if (!n) return;
    const what = describeChangedStores(pendingRemoteStores);
    n(
        `В другой вкладке изменены данные (${what}). Обновите эту вкладку, чтобы не перезаписать их устаревшей копией.`,
        'warning',
        {
            id: 'storage-guard-remote-change',
            important: true,
            title: 'Данные изменены в другой вкладке',
            actions: [
                {
                    label: 'Обновить вкладку',
                    primary: true,
                    onClick: () => window.location.reload(),
                },
            ],
            onDismiss: () => {
                remoteNoticeShown = false;
            },
        },
    );
    remoteNoticeShown = true;
}

function showMultiTabNotice() {
    if (multiTabNoticeShown) return;
    multiTabNoticeShown = true;
    const n = getNotifier();
    if (!n) return;
    n(
        'Приложение открыто в нескольких вкладках. Изменения одной вкладки появятся в другой только после её обновления — работайте в одной вкладке.',
        'info',
        { id: 'storage-guard-multi-tab', duration: 9000, title: 'Несколько вкладок' },
    );
}

/** Обработка сообщения соседней вкладки (экспорт для тестов). */
export function handleChannelMessage(data) {
    if (!data || typeof data !== 'object' || data.from === tabId) return;
    if (data.type === 'hello') {
        channel?.postMessage({ type: 'here', from: tabId });
        showMultiTabNotice();
        return;
    }
    if (data.type === 'here') {
        showMultiTabNotice();
        return;
    }
    if (data.type === 'write' && Array.isArray(data.stores)) {
        let relevant = false;
        for (const s of data.stores) {
            if (SYNCED_STORES.has(s)) {
                pendingRemoteStores.add(s);
                relevant = true;
            }
        }
        if (relevant) showRemoteChangeNotice();
    }
}

function flushOutgoing() {
    flushTimer = null;
    if (!channel || outgoing.size === 0) return;
    const stores = Array.from(outgoing);
    outgoing = new Set();
    try {
        channel.postMessage({ type: 'write', from: tabId, stores });
    } catch (e) {
        console.warn('[storage-guard] postMessage failed', e);
    }
}

/**
 * Сообщить соседним вкладкам о записи в хранилище. Пишем только из видимой вкладки:
 * фоновые служебные записи (диагностика, кэши) не должны пугать пользователя.
 * @param {string} storeName
 */
export function announceStoreWrite(storeName) {
    if (!channel || !SYNCED_STORES.has(storeName)) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    // Служебные записи без действия пользователя (засев, миграции, кэши) не оповещаем.
    if (Date.now() - lastUserInputAt > USER_WRITE_WINDOW_MS) return;
    outgoing.add(storeName);
    if (!flushTimer) flushTimer = setTimeout(flushOutgoing, 250);
}

/** Запросить постоянное хранилище. Возвращает итоговый статус (true — данные не будут вытеснены). */
export async function ensurePersistentStorage() {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!storage || typeof storage.persisted !== 'function') return null;
    try {
        if (await storage.persisted()) return true;
        if (typeof storage.persist !== 'function') return false;
        return await storage.persist();
    } catch (e) {
        console.warn('[storage-guard] persist() failed', e);
        return false;
    }
}

/** Проверка квоты с предупреждением. */
export async function checkStorageQuota() {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!storage || typeof storage.estimate !== 'function') return null;
    try {
        const q = evaluateQuota(await storage.estimate());
        if (q?.warn) {
            getNotifier()?.(
                `Занято ${formatBytes(q.usage)} из ${formatBytes(q.quota)} (${Math.round(q.ratio * 100)}%). Сделайте экспорт базы и удалите ненужные скриншоты, PDF и файлы аналитики, иначе новые данные могут не сохраниться.`,
                'warning',
                { id: 'storage-guard-quota', important: true, title: 'Место для данных заканчивается' },
            );
        }
        return q;
    } catch (e) {
        console.warn('[storage-guard] estimate() failed', e);
        return null;
    }
}

let initialized = false;

/**
 * @param {{ notify?: (msg:string, type:string, opts?:object)=>void }} [opts]
 */
export function initStorageGuard(opts = {}) {
    if (initialized) return;
    initialized = true;
    if (typeof opts.notify === 'function') notify = opts.notify;
    if (typeof BroadcastChannel === 'function') {
        try {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.onmessage = (e) => handleChannelMessage(e.data);
            channel.postMessage({ type: 'hello', from: tabId });
        } catch (e) {
            console.warn('[storage-guard] BroadcastChannel unavailable', e);
            channel = null;
        }
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', flushOutgoing);
        window.addEventListener('pointerdown', markUserInput, { capture: true, passive: true });
        window.addEventListener('keydown', markUserInput, { capture: true, passive: true });
        window.addEventListener('drop', markUserInput, { capture: true, passive: true });
    }
    ensurePersistentStorage().then((granted) => {
        if (typeof window !== 'undefined') window.__copilotStoragePersisted = granted;
    });
    // Квоту проверяем не сразу: старт и так нагружен.
    setTimeout(() => void checkStorageQuota(), 15000);
}

/** Только для тестов. */
export function __resetStorageGuardForTests() {
    initialized = false;
    channel = null;
    notify = null;
    pendingRemoteStores.clear();
    remoteNoticeShown = false;
    multiTabNoticeShown = false;
    outgoing = new Set();
    lastUserInputAt = 0;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
}

export function __getTabIdForTests() {
    return tabId;
}

export function __isRemoteNoticeShownForTests() {
    return remoteNoticeShown;
}
