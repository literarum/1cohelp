'use strict';

import { TRAINING_TRACKS } from './training-curriculum.js';
import { TRAINING_PROGRESS_BACKUP_KEY } from '../constants.js';
import {
    getFromIndexedDB,
    saveToIndexedDB,
} from '../db/indexeddb.js';

const PROGRESS_ID = 'default';

const BUILTIN_ID_SET = new Set(TRAINING_TRACKS.map((t) => t.id));

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeHiddenBuiltinTrackIds(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map(String).filter((id) => BUILTIN_ID_SET.has(id)))];
}

/**
 * @returns {object} пустой шаблон прогресса (версия для миграций)
 */
export function createDefaultTrainingProgress() {
    return {
        id: PROGRESS_ID,
        schemaVersion: 1,
        activeSegment: 'textbook',
        srsPreset: 'balanced',
        /** Дополнительный множитель к интервалу (0.5..2), дублирует смысл пресета при ручной настройке */
        intervalScale: 1,
        trackProgress: {},
        quizStats: { sessions: 0, answered: 0, correct: 0 },
        /** Встроенные треки, скрытые пользователем в «Учебнике» (id из TRAINING_TRACKS) */
        hiddenBuiltinTrackIds: [],
        updatedAt: new Date().toISOString(),
    };
}

/**
 * @param {unknown} raw
 * @returns {object}
 */
/**
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 */
export function mergeTrackProgressMaps(a, b) {
    const out = { ...(a && typeof a === 'object' ? a : {}) };
    const B = b && typeof b === 'object' ? b : {};
    const ids = new Set([...Object.keys(out), ...Object.keys(B)]);
    for (const tid of ids) {
        const x = /** @type {Record<string, unknown>} */ (out[tid] && typeof out[tid] === 'object' ? out[tid] : {});
        const y = /** @type {Record<string, unknown>} */ (B[tid] && typeof B[tid] === 'object' ? B[tid] : {});
        const ax = x.acknowledged && typeof x.acknowledged === 'object' ? x.acknowledged : {};
        const ay = y.acknowledged && typeof y.acknowledged === 'object' ? y.acknowledged : {};
        const acknowledged = { ...ax, ...ay };
        for (const k of Object.keys(acknowledged)) {
            acknowledged[k] = !!(ax[k] || ay[k]);
        }
        const px = x.quizPassed && typeof x.quizPassed === 'object' ? x.quizPassed : {};
        const py = y.quizPassed && typeof y.quizPassed === 'object' ? y.quizPassed : {};
        const quizPassed = { ...px, ...py };
        for (const k of Object.keys(quizPassed)) {
            quizPassed[k] = !!(px[k] || py[k]);
        }
        const rx = x.quizRuns && typeof x.quizRuns === 'object' ? x.quizRuns : {};
        const ry = y.quizRuns && typeof y.quizRuns === 'object' ? y.quizRuns : {};
        const quizRuns = { ...rx };
        for (const [k, v] of Object.entries(ry)) {
            quizRuns[k] = Math.max(Number(rx[k]) || 0, Number(v) || 0);
        }
        const qfx = x.quizFeedbackByStep && typeof x.quizFeedbackByStep === 'object' ? x.quizFeedbackByStep : {};
        const qfy = y.quizFeedbackByStep && typeof y.quizFeedbackByStep === 'object' ? y.quizFeedbackByStep : {};
        const quizFeedbackByStep = { ...qfx, ...qfy };
        out[tid] = { ...x, ...y, acknowledged, quizPassed, quizRuns, quizFeedbackByStep };
    }
    return out;
}

/**
 * Сверка двух копий прогресса (IndexedDB vs localStorage): без потери ответов квиза и отметок.
 * @param {object} primary нормализованный объект (обычно более свежий по updatedAt)
 * @param {object} secondary
 */
export function reconcileTrainingProgress(primary, secondary) {
    const p = normalizeTrainingProgress(primary);
    const s = normalizeTrainingProgress(secondary);
    const tp = Date.parse(p.updatedAt || '') || 0;
    const ts = Date.parse(s.updatedAt || '') || 0;
    const newer = tp >= ts ? p : s;
    const older = tp >= ts ? s : p;
    const base = normalizeTrainingProgress(newer);
    const o = normalizeTrainingProgress(older);
    base.quizStats = {
        sessions: Math.max(base.quizStats.sessions, o.quizStats.sessions),
        answered: Math.max(base.quizStats.answered, o.quizStats.answered),
        correct: Math.max(base.quizStats.correct, o.quizStats.correct),
    };
    base.trackProgress = mergeTrackProgressMaps(base.trackProgress, o.trackProgress);
    base.activeSegment = newer.activeSegment || base.activeSegment;
    base.srsPreset = newer.srsPreset || base.srsPreset;
    const isc = Number(newer.intervalScale);
    base.intervalScale = Number.isFinite(isc) ? isc : base.intervalScale;
    base.hiddenBuiltinTrackIds = normalizeHiddenBuiltinTrackIds([
        ...(base.hiddenBuiltinTrackIds || []),
        ...(o.hiddenBuiltinTrackIds || []),
    ]);
    return normalizeTrainingProgress(base);
}

export function normalizeTrainingProgress(raw) {
    const base = createDefaultTrainingProgress();
    if (!raw || typeof raw !== 'object') return base;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const merged = {
        ...base,
        ...o,
        id: PROGRESS_ID,
        trackProgress:
            o.trackProgress && typeof o.trackProgress === 'object'
                ? /** @type {Record<string, unknown>} */ (o.trackProgress)
                : {},
        quizStats:
            o.quizStats && typeof o.quizStats === 'object'
                ? {
                      sessions: Number(/** @type {any} */ (o.quizStats).sessions) || 0,
                      answered: Number(/** @type {any} */ (o.quizStats).answered) || 0,
                      correct: Number(/** @type {any} */ (o.quizStats).correct) || 0,
                  }
                : base.quizStats,
    };
    if (!['gentle', 'balanced', 'intensive'].includes(String(merged.srsPreset))) {
        merged.srsPreset = 'balanced';
    }
    const sc = Number(merged.intervalScale);
    merged.intervalScale = Number.isFinite(sc) ? Math.min(2, Math.max(0.5, sc)) : 1;
    merged.hiddenBuiltinTrackIds = normalizeHiddenBuiltinTrackIds(merged.hiddenBuiltinTrackIds);
    return merged;
}

/**
 * Резервный контур: localStorage при ошибке IndexedDB (чтение).
 * @param {import('../app/state.js').State} State
 * @returns {Promise<object>}
 */
export async function loadTrainingProgress(State) {
    let fromDb = null;
    try {
        if (State?.db) {
            fromDb = await getFromIndexedDB('trainingProgress', PROGRESS_ID);
        }
    } catch (e) {
        console.warn('[training-store] IndexedDB read failed, trying localStorage mirror', e);
    }
    let mirror = null;
    try {
        const raw = localStorage.getItem(TRAINING_PROGRESS_BACKUP_KEY);
        mirror = raw ? JSON.parse(raw) : null;
    } catch {
        mirror = null;
    }

    const hasDb = fromDb && typeof fromDb === 'object';
    const hasMirror = mirror && typeof mirror === 'object';

    if (hasDb && hasMirror) {
        const nd = normalizeTrainingProgress(fromDb);
        const nm = normalizeTrainingProgress(mirror);
        if (JSON.stringify(nd) === JSON.stringify(nm)) {
            return nd;
        }
        const reconciled = reconcileTrainingProgress(nd, nm);
        if (State?.db) {
            saveTrainingProgress(State, reconciled).catch((err) =>
                console.warn('[training-store] reconcile persist failed', err),
            );
        }
        return reconciled;
    }
    if (hasDb) return normalizeTrainingProgress(fromDb);
    if (hasMirror) return normalizeTrainingProgress(mirror);
    return createDefaultTrainingProgress();
}

/**
 * Двойная запись: IndexedDB + localStorage mirror.
 * @param {import('../app/state.js').State} State
 * @param {object} progress
 */
export async function saveTrainingProgress(State, progress) {
    const payload = {
        ...normalizeTrainingProgress(progress),
        updatedAt: new Date().toISOString(),
    };
    try {
        localStorage.setItem(TRAINING_PROGRESS_BACKUP_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('[training-store] localStorage mirror failed', e);
    }
    try {
        if (State?.db) {
            await saveToIndexedDB('trainingProgress', payload);
        }
    } catch (e) {
        console.error('[training-store] IndexedDB save failed', e);
        throw e;
    }
}
