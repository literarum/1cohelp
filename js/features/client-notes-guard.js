'use strict';

/**
 * Защита заметок «Информация по обращению» от потери при закрытии вкладки.
 *
 * Автосохранение в IndexedDB отложено (debounce 750 мс) и асинхронно: при закрытии вкладки
 * сразу после набора последние символы терялись. При уходе со страницы (pagehide / скрытие)
 * текст синхронно пишется в localStorage как «ожидающий»; после успешной записи в БД
 * отметка снимается. При запуске более свежая ожидающая копия побеждает запись из БД.
 */

export const PENDING_NOTES_KEY = 'copilot_client_notes_pending_v1';
/** Резервная копия из saveClientData при недоступной БД. */
export const LEGACY_FALLBACK_KEY = 'clientData';

function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const v = JSON.parse(raw);
        return v && typeof v === 'object' && typeof v.notes === 'string' ? v : null;
    } catch {
        return null;
    }
}

const ts = (rec) => {
    const t = rec?.timestamp ? Date.parse(rec.timestamp) : NaN;
    return Number.isFinite(t) ? t : 0;
};

/**
 * Выбрать актуальный текст: из БД или более свежий локальный (ожидающий/резервный).
 * @param {{notes?:string, timestamp?:string}|null} dbRecord
 * @param {Array<{notes:string, timestamp?:string}|null>} localRecords
 * @returns {{notes:string, source:'db'|'local', restored:boolean}}
 */
export function pickNewestNotes(dbRecord, localRecords) {
    const dbNotes = typeof dbRecord?.notes === 'string' ? dbRecord.notes : '';
    let best = { notes: dbNotes, t: dbRecord ? ts(dbRecord) : -1, source: 'db' };
    for (const rec of localRecords || []) {
        if (!rec || typeof rec.notes !== 'string') continue;
        const t = ts(rec);
        if (t > best.t) best = { notes: rec.notes, t, source: 'local' };
    }
    return {
        notes: best.notes,
        source: best.source,
        restored: best.source === 'local' && best.notes !== dbNotes,
    };
}

export function readLocalNotesCandidates() {
    return [readJson(PENDING_NOTES_KEY), readJson(LEGACY_FALLBACK_KEY)];
}

export function writePendingNotes(notes) {
    try {
        localStorage.setItem(
            PENDING_NOTES_KEY,
            JSON.stringify({ notes: String(notes ?? ''), timestamp: new Date().toISOString() }),
        );
        return true;
    } catch {
        return false;
    }
}

/** Вызывать после подтверждённой записи в БД. */
export function clearPendingNotes() {
    try {
        localStorage.removeItem(PENDING_NOTES_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {{ getLastSaved: () => string, save: () => Promise<void> }} opts
 * @returns {() => void}
 */
export function installClientNotesUnloadGuard(textarea, opts) {
    if (!textarea || typeof window === 'undefined') return () => {};
    const flush = () => {
        const value = textarea.value;
        if (value === opts.getLastSaved()) return;
        writePendingNotes(value);
        try {
            void opts.save();
        } catch {
            /* асинхронная запись может не успеть — останется ожидающая копия */
        }
    };
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', onVisibility);
    };
}
