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

const ALLOWED_TAGS = new Set([
    'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H2', 'H3', 'H4',
    'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'DIV', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH',
    'TD', 'SUB', 'SUP', 'MARK', 'SMALL', 'IMG',
]);

/** Теги, которые удаляются вместе с содержимым (исполняемые, формы, медиа, пространства имён SVG/MathML). */
const DROP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON',
    'TEXTAREA', 'SELECT', 'OPTION', 'LINK', 'META', 'BASE', 'TEMPLATE', 'NOSCRIPT', 'AUDIO',
    'VIDEO', 'CANVAS', 'FRAME', 'FRAMESET', 'APPLET', 'TITLE', 'HEAD', 'PICTURE', 'SOURCE',
    'TRACK', 'DIALOG', 'XMP', 'PLAINTEXT', 'LISTING',
]);

const SAFE_URL_RE = /^(https?:|mailto:|tel:|#|\/(?!\/)|\.{1,2}\/)/i;
const SAFE_IMG_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

/**
 * @param {string} v
 * @returns {boolean}
 */
function isSafeUrl(v) {
    // Управляющие символы и пробелы внутри схемы ("java\tscript:") не должны обходить проверку
    const t = String(v || '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0020\u007f-\u009f]+/g, '')
        .trim();
    return !!t && SAFE_URL_RE.test(t);
}

/**
 * @param {Element} el
 */
function cleanAttributes(el) {
    const tag = el.tagName;
    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        let keep = false;
        if (name === 'class') {
            const toks = attr.value
                .split(/\s+/)
                .filter((x) => /^[\w-]{1,48}$/.test(x))
                .slice(0, 8);
            if (toks.length) {
                el.setAttribute('class', toks.join(' '));
                continue;
            }
        } else if (tag === 'A' && name === 'href') {
            keep = isSafeUrl(attr.value);
        } else if (tag === 'A' && name === 'title') {
            keep = true;
        } else if ((tag === 'TD' || tag === 'TH') && (name === 'colspan' || name === 'rowspan')) {
            keep = /^\d{1,2}$/.test(attr.value);
        } else if (tag === 'OL' && name === 'start') {
            keep = /^\d{1,4}$/.test(attr.value);
        } else if (tag === 'IMG' && name === 'src') {
            keep = SAFE_IMG_RE.test(attr.value.trim());
        } else if (tag === 'IMG' && name === 'alt') {
            keep = true;
        }
        if (!keep) el.removeAttribute(attr.name);
    }
    if (tag === 'A') {
        if (el.hasAttribute('href')) {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
        } else {
            el.removeAttribute('target');
            el.removeAttribute('rel');
        }
    }
}

/**
 * @param {Node} parent
 */
function cleanChildren(parent) {
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === 3) continue;
        if (node.nodeType !== 1) {
            parent.removeChild(node);
            continue;
        }
        const el = /** @type {Element} */ (node);
        const tag = el.tagName.toUpperCase();
        // Не-HTML пространство имён (svg/math внутри разметки) — удаляем целиком
        if (DROP_TAGS.has(tag) || (el.namespaceURI && !/xhtml/.test(el.namespaceURI))) {
            parent.removeChild(el);
            continue;
        }
        cleanChildren(el);
        if (!ALLOWED_TAGS.has(tag)) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
            continue;
        }
        if (tag === 'IMG' && !SAFE_IMG_RE.test((el.getAttribute('src') || '').trim())) {
            parent.removeChild(el);
            continue;
        }
        cleanAttributes(el);
    }
}

/**
 * Резерв без DOM (Node/тесты без окружения): оставляет только простые теги без атрибутов.
 * @param {string} html
 * @returns {string}
 */
function sanitizeWithoutDom(html) {
    let s = String(html);
    for (let i = 0; i < 3; i++) {
        s = s
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(
                /<(script|style|iframe|object|embed|svg|math|form|template|noscript|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi,
                '',
            )
            .replace(
                /<(script|style|iframe|object|embed|svg|math|form|template|noscript|textarea|select|button)\b[\s\S]*$/gi,
                '',
            );
    }
    s = s.replace(/<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>/gi, (m, slash, name) => {
        const up = String(name).toUpperCase();
        if (!ALLOWED_TAGS.has(up) || up === 'IMG' || up === 'A') return '';
        return `<${slash}${String(name).toLowerCase()}>`;
    });
    return s.replace(/<(?![/a-z])/gi, '&lt;');
}

/**
 * Безопасный HTML для учебных материалов: allow-list тегов и атрибутов на реальном DOM
 * (вместо regex-вычёркивания), удаление скриптов, обработчиков, javascript:/data: ссылок, svg/math.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeTrainingBodyHtml(html) {
    if (typeof html !== 'string' || !html) return '';
    const pass = (/** @type {string} */ src) => {
        if (typeof DOMParser === 'undefined') return sanitizeWithoutDom(src);
        let doc;
        try {
            doc = new DOMParser().parseFromString(`<body>${src}</body>`, 'text/html');
        } catch {
            return sanitizeWithoutDom(src);
        }
        const body = doc.body;
        if (!body) return '';
        cleanChildren(body);
        return body.innerHTML;
    };
    let out = pass(html).trim();
    if (out.length > MAX_BODY_LEN) {
        // Обрезаем и повторно пропускаем через DOM, чтобы не остались незакрытые теги
        out = pass(out.slice(0, MAX_BODY_LEN)).trim();
    }
    return out;
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
    const steps = dedupeStepIds(stepsRaw.map(normalizeUserStep).filter(Boolean));
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
 * Одинаковые id шагов склеивали бы прогресс разных шагов: делаем уникальными.
 * @param {import('./training-curriculum.js').TrainingStep[]} steps
 * @returns {import('./training-curriculum.js').TrainingStep[]}
 */
export function dedupeStepIds(steps) {
    const seen = new Set();
    return steps.map((st) => {
        let id = st.id;
        let n = 2;
        while (seen.has(id)) id = `${st.id}-${n++}`;
        seen.add(id);
        return id === st.id ? st : { ...st, id };
    });
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
