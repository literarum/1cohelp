'use strict';

/**
 * Переопределения встроенных учебных треков (IndexedDB). Без записи — используется TRAINING_TRACKS из кода (по умолчанию пустой каталог).
 */

import { TRAINING_TRACKS } from './training-curriculum.js';
import { getAllFromIndexedDB, saveToIndexedDB, deleteFromIndexedDB } from '../db/indexeddb.js';
import { normalizeUserStep } from './training-user-curriculum.js';

const BUILTIN_IDS = new Set(TRAINING_TRACKS.map((t) => t.id));

const MAX_TITLE_LEN = 500;
const MAX_SUBTITLE_LEN = 500;

/**
 * @param {unknown} raw
 * @returns {import('./training-curriculum.js').TrainingTrack | null}
 */
export function normalizeBuiltinTrackRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const id = String(o.id || '')
        .trim()
        .slice(0, 160);
    if (!id || !BUILTIN_IDS.has(id)) return null;
    const title = String(o.title || '')
        .trim()
        .slice(0, MAX_TITLE_LEN);
    if (title.length < 1) return null;
    const subtitle =
        o.subtitle != null ? String(o.subtitle).trim().slice(0, MAX_SUBTITLE_LEN) : undefined;
    const stepsRaw = Array.isArray(o.steps) ? o.steps : [];
    /** @type {import('./training-curriculum.js').TrainingStep[]} */
    const steps = stepsRaw.map(normalizeUserStep).filter(Boolean);
    if (steps.length < 1) return null;
    const createdAt = String(o.createdAt || new Date().toISOString()).slice(0, 40);
    const updatedAt = String(o.updatedAt || createdAt).slice(0, 40);
    return {
        id,
        title,
        ...(subtitle ? { subtitle } : {}),
        mode: 'textbook',
        steps,
        createdAt,
        updatedAt,
    };
}

/**
 * @param {import('../app/state.js').State} State
 * @returns {Promise<import('./training-curriculum.js').TrainingTrack[]>}
 */
export async function loadBuiltinTrackOverrides(State) {
    if (!State?.db) return [];
    try {
        const all = await getAllFromIndexedDB('trainingBuiltinCurriculum');
        const list = Array.isArray(all) ? all : [];
        return list.map(normalizeBuiltinTrackRecord).filter(Boolean);
    } catch (e) {
        console.warn('[training-builtin-curriculum] read failed', e);
        return [];
    }
}

/**
 * @param {import('../app/state.js').State} State
 * @param {import('./training-curriculum.js').TrainingTrack} track
 */
export async function saveBuiltinTrackOverride(State, track) {
    const n = normalizeBuiltinTrackRecord(track);
    if (!n) throw new Error('Некорректный встроенный модуль');
    if (!State?.db) throw new Error('База данных недоступна');
    const payload = { ...n, updatedAt: new Date().toISOString() };
    await saveToIndexedDB('trainingBuiltinCurriculum', payload);
}

/**
 * @param {import('../app/state.js').State} State
 * @param {string} trackId
 */
export async function deleteBuiltinTrackOverride(State, trackId) {
    if (!State?.db) throw new Error('База данных недоступна');
    const sid = String(trackId || '').trim();
    if (!BUILTIN_IDS.has(sid)) throw new Error('Некорректный идентификатор');
    await deleteFromIndexedDB('trainingBuiltinCurriculum', sid);
}

/**
 * @param {string} trackId
 * @param {import('./training-curriculum.js').TrainingTrack[]} overrides
 * @returns {import('./training-curriculum.js').TrainingTrack | null}
 */
export function getEffectiveBuiltinTrack(trackId, overrides) {
    const o = overrides.find((t) => t.id === trackId);
    if (o) return o;
    return TRAINING_TRACKS.find((t) => t.id === trackId) || null;
}
