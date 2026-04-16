'use strict';

/**
 * Пользовательские модули учебника: хранение в IndexedDB + зеркало localStorage.
 * Схема совместима с встроенным training-curriculum (mode: textbook, steps, quiz).
 */

import { TRAINING_USER_CURRICULUM_BACKUP_KEY } from '../constants.js';
import { getAllFromIndexedDB, saveToIndexedDB, deleteFromIndexedDB } from '../db/indexeddb.js';

const MAX_BODY_LEN = 50000;
const MAX_TITLE_LEN = 500;
const MAX_SUBTITLE_LEN = 500;
const MAX_QUIZ_OPTIONS = 12;

/**
 * @param {string} html
 * @returns {string}
 */
export function sanitizeTrainingBodyHtml(html) {
    if (typeof html !== 'string') return '';
    let s = html
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<script\b[\s\S]*$/gi, '')
        .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/\s(href|src)\s*=\s*["']?\s*javascript:/gi, ' data-blocked=');
    return s.trim().slice(0, MAX_BODY_LEN);
}

/**
 * True if HTML has no visible text (empty paragraphs, only &nbsp;, whitespace).
 * @param {string} html
 * @returns {boolean}
 */
export function isRichTextMeaningfullyEmpty(html) {
    const s = sanitizeTrainingBodyHtml(typeof html === 'string' ? html : '');
    if (!s) return true;
    if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.innerHTML = s;
        const t = div.textContent || '';
        return !t.replace(/\u00a0/g, ' ').trim();
    }
    return !s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {unknown} raw
 * @returns {{ question: string, options: string[], correctIndex: number } | null}
 */
export function normalizeQuizItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const question = String(o.question || '')
        .trim()
        .slice(0, 2000);
    let options = Array.isArray(o.options) ? o.options.map((x) => String(x || '').trim()) : [];
    options = options.filter(Boolean).slice(0, MAX_QUIZ_OPTIONS);
    if (!question.length || options.length < 2) return null;
    let correctIndex = Number(o.correctIndex);
    if (!Number.isFinite(correctIndex)) correctIndex = 0;
    correctIndex = Math.max(0, Math.min(options.length - 1, Math.floor(correctIndex)));
    return { question, options, correctIndex };
}

/**
 * @param {unknown} raw
 * @returns {import('./training-curriculum.js').TrainingStep | null}
 */
export function normalizeUserStep(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const id = String(o.id || '')
        .trim()
        .slice(0, 120);
    const title = String(o.title || '')
        .trim()
        .slice(0, MAX_TITLE_LEN);
    if (!id || title.length < 1) return null;
    const bodyHtml = sanitizeTrainingBodyHtml(String(o.bodyHtml || ''));
    if (!bodyHtml) return null;
    let quiz = Array.isArray(o.quiz) ? o.quiz.map(normalizeQuizItem).filter(Boolean) : [];
    if (quiz.length === 0) quiz = undefined;
    return { id, title, bodyHtml, ...(quiz ? { quiz } : {}) };
}

/**
 * @param {unknown} raw
 * @returns {import('./training-curriculum.js').TrainingTrack | null}
 */
export function normalizeUserTrackRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const id = String(o.id || '')
        .trim()
        .slice(0, 160);
    if (!id || !id.startsWith('user-')) return null;
    const title = String(o.title || '')
        .trim()
        .slice(0, MAX_TITLE_LEN);
    if (title.length < 1) return null;
    const subtitle =
        o.subtitle != null ? String(o.subtitle).trim().slice(0, MAX_SUBTITLE_LEN) : undefined;
    const stepsRaw = Array.isArray(o.steps) ? o.steps : [];
    /** @type {import('./training-curriculum.js').TrainingStep[]} */
    const steps = stepsRaw.map(normalizeUserStep).filter(Boolean);
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

function writeMirror(tracks) {
    try {
        const payload = {
            schemaVersion: 1,
            tracks,
            updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(TRAINING_USER_CURRICULUM_BACKUP_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('[training-user-curriculum] localStorage mirror failed', e);
    }
}

function readMirrorTracks() {
    try {
        const raw = localStorage.getItem(TRAINING_USER_CURRICULUM_BACKUP_KEY);
        if (!raw) return [];
        const p = JSON.parse(raw);
        const arr = Array.isArray(p?.tracks) ? p.tracks : [];
        return arr.map(normalizeUserTrackRecord).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * @param {import('./training-curriculum.js').TrainingTrack[]} a
 * @param {import('./training-curriculum.js').TrainingTrack[]} b
 * @returns {import('./training-curriculum.js').TrainingTrack[]}
 */
export function reconcileUserCurriculumLists(a, b) {
    const map = new Map();
    const ingest = (list, preferNewer) => {
        for (const t of list) {
            const n = normalizeUserTrackRecord(t);
            if (!n) continue;
            const prev = map.get(n.id);
            if (!prev) {
                map.set(n.id, n);
                continue;
            }
            const tp = Date.parse(prev.updatedAt || '') || 0;
            const tn = Date.parse(n.updatedAt || '') || 0;
            if (preferNewer ? tn >= tp : tp >= tn) {
                map.set(n.id, tn >= tp ? n : prev);
            }
        }
    };
    ingest(a, false);
    ingest(b, true);
    return [...map.values()].sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
}

/**
 * @param {import('../app/state.js').State} State
 * @returns {Promise<import('./training-curriculum.js').TrainingTrack[]>}
 */
export async function loadUserCurriculumTracks(State) {
    let fromDb = [];
    try {
        if (State?.db) {
            const all = await getAllFromIndexedDB('trainingUserCurriculum');
            fromDb = Array.isArray(all) ? all : [];
        }
    } catch (e) {
        console.warn('[training-user-curriculum] IndexedDB read failed', e);
    }
    const normalizedDb = fromDb.map(normalizeUserTrackRecord).filter(Boolean);
    if (normalizedDb.length) {
        writeMirror(normalizedDb);
        return normalizedDb;
    }
    const fromMirror = readMirrorTracks();
    if (fromMirror.length && State?.db) {
        try {
            for (const t of fromMirror) {
                await saveToIndexedDB('trainingUserCurriculum', t);
            }
        } catch (e) {
            console.warn('[training-user-curriculum] rehydrate from mirror failed', e);
        }
    }
    return fromMirror;
}

/**
 * @param {import('../app/state.js').State} State
 * @param {import('./training-curriculum.js').TrainingTrack} track
 */
export async function saveUserCurriculumTrack(State, track) {
    const n = normalizeUserTrackRecord(track);
    if (!n) throw new Error('Некорректный модуль');
    if (!State?.db) throw new Error('База данных недоступна');
    const payload = { ...n, updatedAt: new Date().toISOString() };
    await saveToIndexedDB('trainingUserCurriculum', payload);
    const all = await getAllFromIndexedDB('trainingUserCurriculum');
    const list = (Array.isArray(all) ? all : []).map(normalizeUserTrackRecord).filter(Boolean);
    writeMirror(list);
}

/**
 * @param {import('../app/state.js').State} State
 * @param {string} id
 */
export async function deleteUserCurriculumTrack(State, id) {
    if (!State?.db) throw new Error('База данных недоступна');
    const sid = String(id || '').trim();
    if (!sid.startsWith('user-')) throw new Error('Некорректный идентификатор');
    await deleteFromIndexedDB('trainingUserCurriculum', sid);
    const all = await getAllFromIndexedDB('trainingUserCurriculum');
    const list = (Array.isArray(all) ? all : []).map(normalizeUserTrackRecord).filter(Boolean);
    writeMirror(list);
}

/**
 * @returns {string}
 */
export function newUserTrackId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `user-${crypto.randomUUID()}`;
    }
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @returns {string}
 */
export function newUserStepId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `st-${crypto.randomUUID().slice(0, 8)}`;
    }
    return `st-${Date.now().toString(36)}`;
}

/**
 * @param {string} trackId
 * @param {string} stepId
 * @param {import('./training-curriculum.js').TrainingTrack[]} userTracks
 * @returns {import('./training-curriculum.js').TrainingStep | null}
 */
export function getUserStepById(trackId, stepId, userTracks) {
    const tr = userTracks.find((t) => t.id === trackId);
    if (!tr || !Array.isArray(tr.steps)) return null;
    return tr.steps.find((s) => s.id === stepId) || null;
}
