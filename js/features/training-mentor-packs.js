'use strict';

/**
 * Квиз-пакеты наставника: локальный банк + переносимый JSON для другого экземпляра Copilot 1СО.
 * Двойной контур: IndexedDB + зеркало localStorage (как у пользовательских модулей учебника).
 */

import { TRAINING_MENTOR_QUIZ_PACKS_BACKUP_KEY } from '../constants.js';
import {
    getAllFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
} from '../db/indexeddb.js';
import {
    normalizeQuizItem,
    sanitizeTrainingBodyHtml,
    newUserTrackId,
    newUserStepId,
} from './training-user-curriculum.js';

export const MENTOR_QUIZ_EXPORT_KIND = 'mentorQuizPack';
export const MENTOR_QUIZ_SCHEMA_VERSION = 1;

/**
 * @typedef {import('./training-curriculum.js').TrainingQuizItem} TrainingQuizItem
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   subtitle?: string,
 *   instructionsHtml: string,
 *   questions: TrainingQuizItem[],
 *   createdAt: string,
 *   updatedAt: string,
 * }} MentorQuizPack
 */

/**
 * @returns {string}
 */
export function newMentorPackId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `mentor-${crypto.randomUUID()}`;
    }
    return `mentor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} raw
 * @returns {MentorQuizPack | null}
 */
export function normalizeMentorQuizPack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const id = String(o.id || '').trim();
    if (!id.startsWith('mentor-')) return null;
    const title = String(o.title || '').trim().slice(0, 500);
    if (title.length < 1) return null;
    const subtitle =
        o.subtitle != null ? String(o.subtitle).trim().slice(0, 500) : undefined;
    const instructionsHtml = sanitizeTrainingBodyHtml(String(o.instructionsHtml || ''));
    const qRaw = Array.isArray(o.questions) ? o.questions : [];
    const questions = qRaw.map(normalizeQuizItem).filter(Boolean);
    if (questions.length < 1) return null;
    const createdAt = String(o.createdAt || new Date().toISOString()).slice(0, 40);
    const updatedAt = String(o.updatedAt || createdAt).slice(0, 40);
    return {
        id,
        title,
        ...(subtitle ? { subtitle } : {}),
        instructionsHtml,
        questions,
        createdAt,
        updatedAt,
    };
}

function writeMirror(packs) {
    try {
        const payload = {
            schemaVersion: MENTOR_QUIZ_SCHEMA_VERSION,
            packs,
            updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(TRAINING_MENTOR_QUIZ_PACKS_BACKUP_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('[training-mentor-packs] localStorage mirror failed', e);
    }
}

function readMirrorPacks() {
    try {
        const raw = localStorage.getItem(TRAINING_MENTOR_QUIZ_PACKS_BACKUP_KEY);
        if (!raw) return [];
        const p = JSON.parse(raw);
        const arr = Array.isArray(p?.packs) ? p.packs : [];
        return arr.map(normalizeMentorQuizPack).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * @param {MentorQuizPack[]} a
 * @param {MentorQuizPack[]} b
 * @returns {MentorQuizPack[]}
 */
export function reconcileMentorPackLists(a, b) {
    const map = new Map();
    const ingest = (list, preferNewer) => {
        for (const t of list) {
            const n = normalizeMentorQuizPack(t);
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
 * @returns {Promise<MentorQuizPack[]>}
 */
export async function loadMentorQuizPacks(State) {
    let fromDb = [];
    try {
        if (State?.db) {
            const all = await getAllFromIndexedDB('mentorQuizPackages');
            fromDb = Array.isArray(all) ? all : [];
        }
    } catch (e) {
        console.warn('[training-mentor-packs] IndexedDB read failed', e);
    }
    const normalizedDb = fromDb.map(normalizeMentorQuizPack).filter(Boolean);
    if (normalizedDb.length) {
        writeMirror(normalizedDb);
        return normalizedDb;
    }
    const fromMirror = readMirrorPacks();
    if (fromMirror.length && State?.db) {
        try {
            for (const t of fromMirror) {
                await saveToIndexedDB('mentorQuizPackages', t);
            }
        } catch (e) {
            console.warn('[training-mentor-packs] rehydrate from mirror failed', e);
        }
    }
    return fromMirror;
}

/**
 * @param {import('../app/state.js').State} State
 * @param {MentorQuizPack} pack
 */
export async function saveMentorQuizPack(State, pack) {
    const n = normalizeMentorQuizPack(pack);
    if (!n) throw new Error('Некорректный пакет');
    if (!State?.db) throw new Error('База данных недоступна');
    const payload = { ...n, updatedAt: new Date().toISOString() };
    await saveToIndexedDB('mentorQuizPackages', payload);
    const all = await getAllFromIndexedDB('mentorQuizPackages');
    const list = (Array.isArray(all) ? all : []).map(normalizeMentorQuizPack).filter(Boolean);
    writeMirror(list);
}

/**
 * @param {import('../app/state.js').State} State
 * @param {string} id
 */
export async function deleteMentorQuizPack(State, id) {
    if (!State?.db) throw new Error('База данных недоступна');
    const sid = String(id || '').trim();
    if (!sid.startsWith('mentor-')) throw new Error('Некорректный идентификатор');
    await deleteFromIndexedDB('mentorQuizPackages', sid);
    const all = await getAllFromIndexedDB('mentorQuizPackages');
    const list = (Array.isArray(all) ? all : []).map(normalizeMentorQuizPack).filter(Boolean);
    writeMirror(list);
}

/**
 * @param {MentorQuizPack} pack
 * @returns {string}
 */
export function buildMentorPackExportJson(pack) {
    const n = normalizeMentorQuizPack(pack);
    if (!n) throw new Error('Некорректный пакет для экспорта');
    const envelope = {
        copilot1coExport: true,
        kind: MENTOR_QUIZ_EXPORT_KIND,
        schemaVersion: MENTOR_QUIZ_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        generator: 'Copilot1CO',
        pack: n,
    };
    return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * @param {string} text
 * @returns {{ ok: true, pack: MentorQuizPack } | { ok: false, message: string }}
 */
export function parseMentorPackImport(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, message: 'Файл не является корректным JSON.' };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, message: 'Корень документа должен быть объектом.' };
    }
    const o = /** @type {Record<string, unknown>} */ (parsed);
    if (o.copilot1coExport !== true) {
        return { ok: false, message: 'Отсутствует признак copilot1coExport — отказ из соображений безопасности.' };
    }
    if (o.kind !== MENTOR_QUIZ_EXPORT_KIND) {
        return { ok: false, message: `Ожидался kind="${MENTOR_QUIZ_EXPORT_KIND}".` };
    }
    if (Number(o.schemaVersion) !== MENTOR_QUIZ_SCHEMA_VERSION) {
        return {
            ok: false,
            message: `Неподдерживаемая версия схемы: ${String(o.schemaVersion)} (ожидается ${MENTOR_QUIZ_SCHEMA_VERSION}).`,
        };
    }
    const inner = normalizeMentorQuizPack(o.pack);
    if (!inner) {
        return { ok: false, message: 'Поле pack не прошло проверку (заголовок, id mentor-*, вопросы).' };
    }
    return { ok: true, pack: inner };
}

/**
 * Повторная нормализация после parse (двойной контур проверки).
 * @param {MentorQuizPack} pack
 * @returns {MentorQuizPack | null}
 */
export function validateMentorPackStrict(pack) {
    const once = normalizeMentorQuizPack(pack);
    if (!once) return null;
    const twice = normalizeMentorQuizPack(JSON.parse(JSON.stringify(once)));
    return twice;
}

/**
 * Импорт на устройство: при конфликте id выдаём новый id.
 * @param {MentorQuizPack} pack
 * @param {Set<string>} existingIds
 * @returns {MentorQuizPack}
 */
export function assignMentorPackIdForImport(pack, existingIds) {
    const n = normalizeMentorQuizPack(pack);
    if (!n) throw new Error('Некорректный пакет');
    let id = n.id;
    if (existingIds.has(id)) {
        id = newMentorPackId();
    }
    const now = new Date().toISOString();
    return {
        ...n,
        id,
        createdAt: n.createdAt || now,
        updatedAt: now,
    };
}

/**
 * Публикация в «Учебник»: один шаг с телом-инструкцией и всеми вопросами в quiz[].
 * @param {MentorQuizPack} pack
 * @returns {import('./training-curriculum.js').TrainingTrack}
 */
export function mentorPackToUserTrack(pack) {
    const n = normalizeMentorQuizPack(pack);
    if (!n) throw new Error('Некорректный пакет');
    const body =
        n.instructionsHtml && n.instructionsHtml.replace(/\s/g, '').length
            ? n.instructionsHtml
            : '<p class="mb-2">Ответьте на все вопросы ниже. После успешной проверки шаг будет засчитан.</p>';
    const stepId = newUserStepId();
    return {
        id: newUserTrackId(),
        title: n.title,
        ...(n.subtitle ? { subtitle: n.subtitle } : { subtitle: 'Квиз от наставника' }),
        mode: 'textbook',
        steps: [
            {
                id: stepId,
                title: 'Проверка знаний',
                bodyHtml: body,
                quiz: n.questions.map((q) => ({ ...q })),
            },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
