'use strict';

/**
 * Навигация к фрагменту в поле «Информация по обращению» (#clientNotes):
 * поиск последовательностей из 10 или 12 цифр (любой текст заметок), прокрутка, жёлтая подсветка.
 */

import { escapeHtml } from '../utils/html.js';
import { NavigationSource } from './contextual-back-navigation.js';

const FLASH_OVERLAY_ATTR = 'data-client-notes-search-flash';
const DEFAULT_FLASH_MS = 5500;

/** Ограничение окон скольжения на один блок цифр (защита от зависания на гигантских числах). */
const MAX_SLIDING_WINDOWS_PER_LEN = 400;

let globalFlashTeardown = null;

/** Разрешённые разделители между цифрами при поиске «с пробелами» (7707 083 893). */
const INN_DIGIT_GAP_RX = /[\s\u00A0\u2009\u202F\-–—.,;']/;

const DIGIT_RUN_RX = /\d+/g;

/**
 * Добавляет в set все подстроки длины 10 и 12 из одного сплошного блока цифр.
 * @param {string} run
 * @param {Set<string>} set
 */
function addTenTwelveWindowsFromDigitRun(run, set) {
    if (!run || run.length < 10) return;
    let w = 0;
    if (run.length >= 10) {
        for (let i = 0; i <= run.length - 10 && w < MAX_SLIDING_WINDOWS_PER_LEN; i++) {
            set.add(run.slice(i, i + 10));
            w++;
        }
    }
    w = 0;
    if (run.length >= 12) {
        for (let i = 0; i <= run.length - 12 && w < MAX_SLIDING_WINDOWS_PER_LEN; i++) {
            set.add(run.slice(i, i + 12));
            w++;
        }
    }
}

/**
 * Все уникальные последовательности ровно из 10 или 12 цифр, встречающиеся в тексте заметок
 * (в т.ч. внутри длинных чисел и после схлопывания пробелов/дефисов между цифрами).
 * @param {string} text
 * @returns {string[]}
 */
export function extractTenTwelveDigitSequencesFromText(text) {
    if (typeof text !== 'string' || !text) return [];
    const set = new Set();
    let m;
    DIGIT_RUN_RX.lastIndex = 0;
    while ((m = DIGIT_RUN_RX.exec(text)) !== null) {
        addTenTwelveWindowsFromDigitRun(m[0], set);
    }
    const compact = text.replace(/[\s\u00A0\u2009\u202F\-–—.,;']/g, '');
    if (compact.length >= 10 && compact !== text) {
        DIGIT_RUN_RX.lastIndex = 0;
        while ((m = DIGIT_RUN_RX.exec(compact)) !== null) {
            addTenTwelveWindowsFromDigitRun(m[0], set);
        }
    }
    return Array.from(set);
}

/**
 * @deprecated Имя сохранено для совместимости; семантика — любые 10/12 цифр, см. extractTenTwelveDigitSequencesFromText.
 * @param {string} text
 * @returns {string[]}
 */
export function extractWholeInnsFromText(text) {
    return extractTenTwelveDigitSequencesFromText(text);
}

/**
 * Цифровой префикс из строки поиска (игнор букв, пробелов, знаков) — для ИНН в глобальном поиске.
 * @param {string} rawQuery
 * @returns {string}
 */
export function digitsRunFromSearchQuery(rawQuery) {
    if (typeof rawQuery !== 'string') return '';
    return rawQuery.replace(/\D/g, '');
}

/**
 * Текст заметок из основного поля и плавающего окна (если открыто) — единый источник для поиска цифровых фрагментов.
 * @returns {string}
 */
export function getNotesSourceForInnSearch() {
    if (typeof document === 'undefined') return '';
    const parts = [];
    const main = document.getElementById('clientNotes');
    const floating = document.getElementById('clientNotesFloatingTextarea');
    if (main && typeof main.value === 'string') parts.push(main.value);
    if (floating && typeof floating.value === 'string') parts.push(floating.value);
    return parts.join('\n');
}

/**
 * Пункты выпадающего глобального поиска: последовательности из 10 или 12 цифр в заметках по клиенту,
 * начинающиеся с введённого набора цифр (любой текст поля, не только ИНН).
 *
 * @param {string} rawQuery — строка поиска (после sanitize)
 * @param {string | null} [notesOverride] — для тестов / IndexedDB; иначе DOM (#clientNotes + плавающее окно)
 * @returns {Array<{ section: string, type: string, id: string, title: string, description: string, score: number, highlightTerm: string, query: string }>}
 */
export function buildAppealNotesDigitQuerySuggestions(rawQuery, notesOverride = null) {
    if (typeof rawQuery !== 'string') return [];
    const digits = digitsRunFromSearchQuery(rawQuery);
    if (digits.length < 1) return [];

    let notes = '';
    if (notesOverride != null) {
        notes = typeof notesOverride === 'string' ? notesOverride : '';
    } else if (typeof document !== 'undefined') {
        notes = getNotesSourceForInnSearch();
    }
    if (!notes) return [];

    const sequences = extractTenTwelveDigitSequencesFromText(notes);
    const matched = sequences.filter((seq) => seq.startsWith(digits));
    if (matched.length === 0) return [];

    matched.sort((a, b) => {
        const ra = a === digits ? 1 : 0;
        const rb = b === digits ? 1 : 0;
        if (rb !== ra) return rb - ra;
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
    });

    const MAX_ROWS = 8;
    const BASE_SCORE = 1e9;
    return matched.slice(0, MAX_ROWS).map((seq) => {
        const n = seq.length;
        const label = n === 12 ? '12 цифр' : '10 цифр';
        return {
            section: 'main',
            type: 'clientNote',
            id: 'current',
            title: 'Информация по обращению',
            description: `${label} в тексте обращения: ${seq}`,
            score: BASE_SCORE + n + (seq === digits ? 50 : 0),
            highlightTerm: seq,
            query: rawQuery,
        };
    });
}

/**
 * @param {string} text
 * @param {string} term
 * @returns {{ start: number, end: number } | null}
 */
export function findFirstCaseInsensitiveSubstring(text, term) {
    if (typeof text !== 'string' || typeof term !== 'string' || !term) return null;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return null;
    return { start: idx, end: idx + term.length };
}

/**
 * Первое вхождение ровно 10 или 12 цифр подряд: как подстрока в тексте или с разрешёнными пробелами/дефисами между цифрами.
 * @param {string} text
 * @param {string} digits — ровно 10 или 12 символов 0–9
 * @returns {{ start: number, end: number } | null}
 */
export function findFirstTenTwelveDigitSequenceOccurrence(text, digits) {
    if (typeof text !== 'string' || typeof digits !== 'string') return null;
    if (!/^\d{10}$|^\d{12}$/.test(digits)) return null;
    const i = text.indexOf(digits);
    if (i !== -1) return { start: i, end: i + digits.length };
    for (let start = 0; start < text.length; start++) {
        if (!/\d/.test(text[start])) continue;
        let ti = start;
        let di = 0;
        while (ti < text.length && di < digits.length) {
            const c = text[ti];
            if (/\d/.test(c)) {
                if (c !== digits[di]) break;
                di++;
            } else if (INN_DIGIT_GAP_RX.test(c)) {
                if (di === 0) break;
            } else {
                break;
            }
            ti++;
        }
        if (di === digits.length) return { start, end: ti };
    }
    return null;
}

/** @see findFirstTenTwelveDigitSequenceOccurrence */
export function findFirstWholeInnOccurrence(text, inn) {
    return findFirstTenTwelveDigitSequenceOccurrence(text, inn);
}

/**
 * Прокручивает textarea так, чтобы позиция caretPos была у видимой области (зеркальный div).
 * @param {HTMLTextAreaElement} textarea
 * @param {number} caretPos
 */
export function scrollTextareaToCharIndex(textarea, caretPos) {
    if (!textarea || typeof textarea.value !== 'string') return;
    const pos = Math.max(0, Math.min(caretPos, textarea.value.length));
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    Object.assign(mirror.style, {
        position: 'absolute',
        visibility: 'hidden',
        left: '-99999px',
        top: '0',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        width: `${textarea.clientWidth}px`,
        font: style.font,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        border: style.border,
        boxSizing: style.boxSizing,
    });
    const before = document.createTextNode(textarea.value.substring(0, pos));
    const marker = document.createElement('span');
    marker.textContent = textarea.value.substring(pos, pos + 1) || '.';
    mirror.appendChild(before);
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const top = marker.offsetTop;
    document.body.removeChild(mirror);
    const lh = parseFloat(style.lineHeight);
    const lineHeightPx =
        Number.isFinite(lh) && lh > 0 ? lh : parseFloat(style.fontSize || '16') * 1.25;
    const target = top - textarea.clientHeight / 2 + lineHeightPx / 2;
    textarea.scrollTop = Math.max(
        0,
        Math.min(target, Math.max(0, textarea.scrollHeight - textarea.clientHeight)),
    );
}

export function teardownClientNotesSearchFlash() {
    if (typeof globalFlashTeardown === 'function') {
        globalFlashTeardown();
        globalFlashTeardown = null;
    }
}

/**
 * Жёлтая подсветка диапазона [start, end) поверх textarea (класс .client-notes-inn-search-flash).
 * @param {HTMLTextAreaElement} textarea
 * @param {number} start
 * @param {number} end
 * @param {{ durationMs?: number }} [opts]
 */
export function flashTextareaRangeYellow(textarea, start, end, opts = {}) {
    if (!textarea?.parentElement || start >= end) return;
    teardownClientNotesSearchFlash();

    const durationMs =
        typeof opts.durationMs === 'number' && opts.durationMs > 0
            ? opts.durationMs
            : DEFAULT_FLASH_MS;

    const wrapper = textarea.parentElement;
    try {
        const ws = getComputedStyle(wrapper);
        if (ws.position === 'static') wrapper.style.position = 'relative';
    } catch {
        /* ignore */
    }

    const preview = document.createElement('div');
    preview.className = 'client-notes-preview';
    preview.setAttribute(FLASH_OVERLAY_ATTR, '1');
    preview.style.display = '';
    preview.style.pointerEvents = 'none';
    const inner = document.createElement('div');
    inner.className = 'client-notes-preview__inner';
    preview.appendChild(inner);
    wrapper.appendChild(preview);

    const getOffsetX = () => {
        const v = getComputedStyle(preview).getPropertyValue('--inn-offset-x').trim();
        return v ? parseFloat(v) : 0;
    };

    const posOverlay = () => {
        const tr = textarea.getBoundingClientRect();
        const wr = wrapper.getBoundingClientRect();
        const scrollLeft = typeof wrapper.scrollLeft === 'number' ? wrapper.scrollLeft : 0;
        const scrollTop = typeof wrapper.scrollTop === 'number' ? wrapper.scrollTop : 0;
        preview.style.left = `${tr.left - wr.left + scrollLeft}px`;
        preview.style.top = `${tr.top - wr.top + scrollTop}px`;
        preview.style.width = `${textarea.clientWidth}px`;
        preview.style.height = `${textarea.clientHeight}px`;
    };

    const computeUsedLineHeightPx = () => {
        const cs = getComputedStyle(textarea);
        if (cs.lineHeight && cs.lineHeight !== 'normal') return cs.lineHeight;
        const probe = document.createElement('div');
        probe.style.cssText =
            'position:absolute;visibility:hidden;white-space:pre-wrap;font:' +
            (cs.font ||
                `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`) +
            ';letter-spacing:' +
            cs.letterSpacing;
        probe.textContent = 'A\nA';
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height / 2;
        document.body.removeChild(probe);
        return `${h}px`;
    };

    const syncMetrics = () => {
        const cs = getComputedStyle(textarea);
        preview.style.font = cs.font;
        preview.style.lineHeight = computeUsedLineHeightPx();
        preview.style.lineHeight = cs.lineHeight;
        preview.style.letterSpacing = cs.letterSpacing;
        preview.style.textAlign = cs.textAlign;
        preview.style.borderRadius = cs.borderRadius;
        preview.style.boxSizing = cs.boxSizing;
        preview.style.color = 'transparent';
        preview.style.paddingTop = cs.paddingTop;
        preview.style.paddingRight = cs.paddingRight;
        preview.style.paddingBottom = cs.paddingBottom;
        preview.style.paddingLeft = cs.paddingLeft;
        posOverlay();
    };

    const rebuildInnerHtml = () => {
        const v = textarea.value || '';
        const s = Math.max(0, Math.min(start, v.length));
        const e = Math.max(s, Math.min(end, v.length));
        const escaped =
            escapeHtml(v.slice(0, s)) +
            `<span class="client-notes-inn-search-flash">${escapeHtml(v.slice(s, e))}</span>` +
            escapeHtml(v.slice(e));
        inner.innerHTML = escaped;
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
        posOverlay();
    };

    const onScroll = () => {
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
    };

    rebuildInnerHtml();
    syncMetrics();
    textarea.addEventListener('scroll', onScroll);
    const onResize = () => {
        syncMetrics();
        rebuildInnerHtml();
    };
    window.addEventListener('resize', onResize);

    const timerId = setTimeout(() => {
        if (typeof globalFlashTeardown === 'function') {
            globalFlashTeardown();
            globalFlashTeardown = null;
        }
    }, durationMs);

    globalFlashTeardown = () => {
        clearTimeout(timerId);
        textarea.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        preview.remove();
    };
}

/**
 * Переход на вкладку main, прокрутка к совпадению в заметках (10/12 цифр или произвольная подстрока).
 * @param {string} rawTerm
 * @param {{
 *   setActiveTab?: (id: string) => void | Promise<void>,
 *   panelTextarea?: HTMLTextAreaElement | null,
 *   isClientNotesPanelOpen?: () => boolean,
 * }} deps
 * @returns {Promise<boolean>}
 */
export async function navigateMainTabToAppealNotesMatch(rawTerm, deps = {}) {
    const term = (rawTerm || '').trim();
    if (!term) return false;

    const { setActiveTab, panelTextarea, isClientNotesPanelOpen } = deps;
    if (typeof setActiveTab === 'function') {
        await setActiveTab('main', false, {
            navigationSource: NavigationSource.PROGRAMMATIC,
        });
    }
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 50));

    const mainTa = document.getElementById('clientNotes');
    if (!mainTa || typeof mainTa.value !== 'string') return false;

    let hit = null;
    if (/^\d{10}$|^\d{12}$/.test(term)) {
        hit = findFirstTenTwelveDigitSequenceOccurrence(mainTa.value, term);
    } else {
        hit = findFirstCaseInsensitiveSubstring(mainTa.value, term);
    }
    if (!hit) return false;

    document.getElementById('clientNotesPanel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
    });

    scrollTextareaToCharIndex(mainTa, hit.start);
    mainTa.setSelectionRange(hit.start, hit.end);

    const panelSynced =
        panelTextarea && panelTextarea !== mainTa && panelTextarea.value === mainTa.value;
    const usePanelFlash =
        panelSynced && typeof isClientNotesPanelOpen === 'function' && isClientNotesPanelOpen();

    if (panelSynced) {
        scrollTextareaToCharIndex(panelTextarea, hit.start);
        panelTextarea.setSelectionRange(hit.start, hit.end);
    }

    if (usePanelFlash) {
        panelTextarea.focus();
        flashTextareaRangeYellow(panelTextarea, hit.start, hit.end);
    } else {
        mainTa.focus();
        flashTextareaRangeYellow(mainTa, hit.start, hit.end);
    }

    return true;
}

/**
 * @param {string} innDigits — 10 или 12 цифр
 * @param {object} deps
 * @returns {Promise<boolean>}
 */
export async function navigateMainTabToClientNotesInn(innDigits, deps = {}) {
    return navigateMainTabToAppealNotesMatch(innDigits, deps);
}
