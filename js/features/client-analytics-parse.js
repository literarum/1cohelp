'use strict';

/**
 * Извлечение сущностей из текста обращений (ИНН, КПП, телефоны, вопрос).
 * Формат «умной» выгрузки: пункты 1). 2). … — каждое обращение в отдельном блоке.
 * Двухконтурная проверка ИНН: формат + контрольная сумма ФНС (10/12 знаков).
 */

import { cleanDisplayText } from './client-analytics-text.js';

/** Версия разборщика: записи со старой версией можно переобработать из исходного текста файла. */
export const CA_PARSER_VERSION = 4;

/**
 * КПП: NNNN PP XXX, где P — цифра или ЗАГЛАВНАЯ латинская буква A–Z
 * (приказ ФНС от 26.06.2025 № ЕД-7-14/559@). Регистрозависимо: «7701ab001» — не КПП.
 */
const KPP_SRC = '\\d{4}[\\dA-Z]{2}\\d{3}';
const KPP_STANDALONE_RE = new RegExp(`(?<![\\dA-Za-z])(${KPP_SRC})(?![\\dA-Za-z])`);
const KPP_STANDALONE_RE_G = new RegExp(KPP_STANDALONE_RE.source, 'g');
const KPP_LABELED_RE = new RegExp(`(?:КПП|Кпп|кпп|KPP|kpp)\\s*[:№]?\\s*(${KPP_SRC})(?![\\dA-Za-z])`);

const INN_10_COEFF = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN_12_COEFF_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN_12_COEFF_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

/**
 * @param {string} inn
 * @returns {boolean}
 */
export function isValidInn10Checksum(inn) {
    if (!/^\d{10}$/.test(inn)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(inn[i], 10) * INN_10_COEFF[i];
    let c = s % 11;
    if (c === 10) c = 0;
    return c === parseInt(inn[9], 10);
}

/**
 * @param {string} inn
 * @returns {boolean}
 */
export function isValidInn12Checksum(inn) {
    if (!/^\d{12}$/.test(inn)) return false;
    let s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(inn[i], 10) * INN_12_COEFF_11[i];
    let c1 = s % 11;
    if (c1 === 10) c1 = 0;
    if (c1 !== parseInt(inn[10], 10)) return false;
    s = 0;
    for (let i = 0; i < 11; i++) s += parseInt(inn[i], 10) * INN_12_COEFF_12[i];
    let c2 = s % 11;
    if (c2 === 10) c2 = 0;
    return c2 === parseInt(inn[11], 10);
}

/**
 * @param {string} digits
 * @returns {'high'|'medium'|'low'}
 */
export function innConfidence(digits) {
    if (digits.length === 10 && isValidInn10Checksum(digits)) return 'high';
    if (digits.length === 12 && isValidInn12Checksum(digits)) return 'high';
    if (/^\d{10}$/.test(digits) || /^\d{12}$/.test(digits)) return 'medium';
    return 'low';
}

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeRussianPhone(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const d = raw.replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
        return `7${d.slice(1)}`;
    }
    if (d.length === 10 && d[0] === '9') {
        return `7${d}`;
    }
    if (d.length === 11 && d[0] === '7') {
        return d;
    }
    return null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
/**
 * Адреса электронной почты в тексте (дедупликация, порядок появления).
 * @param {string} text
 * @returns {string[]}
 */
const EMAIL_SRC =
    '(?<![\\p{L}\\d._%+-])[\\p{L}\\d][\\p{L}\\d._%+-]*@[\\p{L}\\d](?:[\\p{L}\\d-]*[\\p{L}\\d])?(?:\\.[\\p{L}\\d](?:[\\p{L}\\d-]*[\\p{L}\\d])?)*\\.(?:\\p{L}{2,}|xn--[a-z\\d-]+)(?![\\p{L}\\d-])';
const EMAIL_RE_G = new RegExp(EMAIL_SRC, 'giu');

export function extractEmailCandidates(text) {
    if (!text || typeof text !== 'string') return [];
    // латиница и кириллица (EAI, домены .рф), а также punycode-домены (xn--…)
    const re = EMAIL_RE_G;
    re.lastIndex = 0;
    const out = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(text)) !== null) {
        const raw = m[0];
        const key = raw.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(raw);
        }
    }
    return out;
}

/**
 * Если в пункте только идентификаторы (ИНН/КПП/тел.) без текста вопроса, не дублировать ИНН в поле «вопрос».
 * @param {string} question
 * @param {string} inn
 * @returns {string}
 */
export function normalizeQuestionAfterParse(question, inn) {
    let q = (question || '').replace(/\s+/g, ' ').trim();
    if (!inn) return q;
    if (!q) return '';
    if (q === inn) return '';
    const onlyDigits = q.replace(/\D/g, '');
    if (onlyDigits === inn) return '';
    if (/^(?:ИНН|инн)\s+(\d{10}|\d{12})\s*$/i.test(q)) {
        const d = q.match(/(\d{10}|\d{12})/);
        if (d && d[1] === inn) return '';
    }
    return q;
}

/**
 * Добавочные номера: «+7 (495) 123-45-67 доб. 1234» → { '74951234567': '1234' }.
 * @param {string} text
 */
export function extractPhoneExtensions(text) {
    const out = {};
    const src = String(text || '');
    // линейно: сначала метка добавочного, затем телефон в 40 символах перед ней
    // (общий шаблон «телефон…доб.» откатывался квадратично на длинных цифровых строках)
    const re = /(?<![\p{L}])(?:доб(?:авочный)?|вн(?:утр(?:енний)?)?|ext)\.?\s*[:№]?\s*(\d{1,6})(?!\d)/giu;
    for (const m of src.matchAll(re)) {
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        const ph = before.match(/(\+?\d[\d\s\-().]{7,30}\d)\s*,?\s*$/);
        if (!ph) continue;
        const n = normalizeRussianPhone(ph[1]);
        if (n) out[n] = m[1];
    }
    return out;
}

/**
 * Признак «рядом стоит телефон»: подпись тел./моб./phone/WhatsApp или префикс +7 / 8 перед числом.
 * @param {string} text
 * @param {number} index начало числа
 */
export function hasPhoneContext(text, index) {
    const before = String(text || '').slice(Math.max(0, index - 24), index).toLowerCase();
    return /(?:тел|моб|сот|phone|whatsapp|ватсап|вацап|viber|телеграм|telegram|номер|звонить|перезвон)[^\d]{0,12}$/.test(
        before,
    ) || /(?:\+7|(?<!\d)8)[\s(-]*$/.test(before);
}

/**
 * 10 цифр после подписи «тел.»/префикса +7: если начинается с 9 (мобильный без кода страны) —
 * это телефон даже при случайно сошедшейся контрольной сумме ИНН (вероятность 1/11); иначе —
 * телефон, только если контрольная сумма ИНН не сходится.
 */
export function isPhoneLikeInnOccurrence(text, o) {
    if (!hasPhoneContext(text, o.index)) return false;
    if (o.digits.length === 10 && o.digits[0] === '9') return true;
    return innConfidence(o.digits) !== 'high';
}

export function extractPhoneCandidates(text) {
    if (!text || typeof text !== 'string') return [];
    const out = [];
    const seen = new Set();

    const tryAdd = (raw, index) => {
        const digits = raw.replace(/\D/g, '');
        // 10 цифр подряд без +7/8 и без подписи «тел.» с верной контрольной суммой ИНН — это ИНН
        // (у московских ИНН 97xx… первая цифра 9, как у мобильного номера без кода страны)
        if (
            digits.length === 10 &&
            /^\d{10}$/.test(raw.trim()) &&
            isValidInn10Checksum(digits) &&
            !hasPhoneContext(text, index)
        ) {
            return;
        }
        const n = normalizeRussianPhone(raw);
        if (n && n.length === 11 && !seen.has(n)) {
            seen.add(n);
            out.push(n);
        }
    };

    const re =
        /(?:\+?\d[\d\s\-().]{7,}\d)|(?:\b8\s?[\s\-()]?\d{3}[\s\-()]?\d{3}[\s\-()]?\d{2}[\s\-()]?\d{2}\b)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        tryAdd(m[0], m.index);
    }

    const plain11 = text.matchAll(/\b([78]\d{10})\b/g);
    for (const pm of plain11) {
        tryAdd(pm[1], pm.index);
    }

    // иностранные номера в международном формате (+375, +380, +998…): храним как «+цифры»
    for (const im of text.matchAll(/\+(?!7)[1-9][\d\s\-()]{6,18}\d/g)) {
        const digits = im[0].replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) continue;
        const key = `+${digits}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(key);
        }
    }

    return out;
}

/**
 * @param {string} windowText
 * @returns {string|null}
 */
export function extractKppNearInn(windowText) {
    if (!windowText) return null;
    const labeled = windowText.match(KPP_LABELED_RE);
    if (labeled) return labeled[1];
    const afterInn = windowText.split(/ИНН|inn/i);
    if (afterInn.length > 1) {
        const tail = afterInn.slice(1).join(' ');
        const m = tail.match(KPP_STANDALONE_RE);
        if (m) return m[1];
    }
    return null;
}

/**
 * Диапазоны [start, end) занятые ИНН 10/12 и телефонами 11 — чтобы не принять фрагмент за КПП.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
function reservedDigitSpansForKpp(text) {
    const spans = [];
    if (!text) return spans;
    const innRe = /\b(\d{10}|\d{12})\b/g;
    let im;
    while ((im = innRe.exec(text)) !== null) {
        spans.push([im.index, im.index + im[1].length]);
    }
    const phRe = /\b([78]\d{10})\b/g;
    let pm;
    while ((pm = phRe.exec(text)) !== null) {
        spans.push([pm.index, pm.index + pm[1].length]);
    }
    return spans;
}

/**
 * @param {number} pos
 * @param {number} len
 * @param {Array<[number, number]>} spans
 * @returns {boolean}
 */
function overlapsSpan(pos, len, spans) {
    const end = pos + len;
    for (const [a, b] of spans) {
        if (pos < b && end > a) return true;
    }
    return false;
}

/**
 * Ищет КПП (9 цифр), не пересекающийся с ИНН/телефоном.
 * @param {string} blockText
 * @returns {string|null}
 */
export function extractKppFromBlock(blockText) {
    const labeled = extractKppNearInn(blockText);
    if (labeled) return labeled;
    const spans = reservedDigitSpansForKpp(blockText);
    const re = KPP_STANDALONE_RE_G;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(blockText)) !== null) {
        if (!overlapsSpan(m.index, 9, spans)) {
            return m[1];
        }
    }
    return null;
}

/**
 * @param {string} segment
 * @returns {string}
 */
export function extractQuestionHeuristic(segment) {
    if (!segment || typeof segment !== 'string') return '';
    const lines = segment
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const withQuestion = lines.find((l) => l.includes('?'));
    if (withQuestion) return withQuestion.slice(0, 2000);

    const lower = segment.toLowerCase();
    const markers = ['вопрос', 'обращение', 'жалоба', 'проблема', 'текст обращения'];
    for (const mk of markers) {
        const idx = lower.indexOf(mk);
        if (idx !== -1) {
            const slice = segment
                .slice(idx, idx + 1500)
                .replace(/\s+/g, ' ')
                .trim();
            return slice;
        }
    }

    if (lines.length) return lines.slice(-3).join(' ').slice(0, 2000);
    return segment.slice(0, 1500).replace(/\s+/g, ' ').trim();
}

/**
 * Удаляет маркер `N).` в начале блока.
 * @param {string} blockText
 * @returns {string}
 */
export function stripLeadingNumberedMarker(blockText) {
    if (!blockText) return '';
    return blockText.replace(/^\s*\d+\)\.?\s+/, '').trim();
}

/**
 * Есть ли в тексте нумерованные обращения вида `1).`, `2).`
 * @param {string} text
 * @returns {boolean}
 */
export function hasNumberedAppealFormat(text) {
    if (!text || typeof text !== 'string') return false;
    return /(?:^|\n)[ \t]*\d+\)\.?\s+/.test(text.replace(/\r\n/g, '\n'));
}

/**
 * Делит файл на блоки по строкам, начинающимся с `N).` или `N).`
 * @param {string} fullText
 * @returns {string[]}
 */
export function splitIntoNumberedBlocks(fullText) {
    if (!fullText || typeof fullText !== 'string') return [];
    const normalized = fullText.replace(/\r\n/g, '\n');
    const parts = normalized.split(/(?=\n[ \t]*\d+\)\.?\s+)/);
    return parts.map((c) => c.trim()).filter((c) => c.length > 0);
}

/**
 * Делит текст на сегменты (legacy: разделители ---).
 * @param {string} fullText
 * @returns {string[]}
 */
export function splitIntoSegments(fullText) {
    if (!fullText || typeof fullText !== 'string') return [];
    const normalized = fullText.replace(/\r\n/g, '\n');
    const chunks = normalized.split(/(?:\n{3,}|(?:^|\n)---+\s*|\n___+\s*|(?:^|\n)====+\s*)/);
    return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

/**
 * @param {string} text
 * @returns {Array<{ index: number, digits: string }>}
 */
export function findInnOccurrences(text) {
    const out = [];
    if (!text) return out;
    const re = /\b(\d{10}|\d{12})\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        out.push({ index: m.index, digits: m[1] });
    }
    return out;
}

/**
 * Выбирает основной ИНН в блоке (предпочтение валидной контрольной суммы).
 * @param {string} text
 * @returns {{ digits: string, index: number }|null}
 */
export function pickPrimaryInn(text) {
    const occ = findInnOccurrences(text).filter(
        // «тел. 9161234567» — номер телефона без кода страны, а не ИНН (если контрольная сумма не сходится)
        (o) => !isPhoneLikeInnOccurrence(text, o),
    );
    if (occ.length === 0) return null;
    let best = occ[0];
    let bestRank = rankInn(occ[0].digits);
    for (let i = 1; i < occ.length; i++) {
        const r = rankInn(occ[i].digits);
        if (r > bestRank) {
            bestRank = r;
            best = occ[i];
        }
    }
    return best;
}

/**
 * @param {string} d
 * @returns {number}
 */
function rankInn(d) {
    const c = innConfidence(d);
    if (c === 'high') return 3;
    if (c === 'medium') return 2;
    return 1;
}

/**
 * @param {string} text
 * @param {string} inn
 * @param {string|null} kpp
 * @param {string[]} phones
 * @returns {string}
 */
export function extractQuestionFromAppealBody(text, inn, kpp, phones) {
    if (!text) return '';
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const innEsc = inn ? inn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const filtered = lines.filter((line) => {
        if (!line) return false;
        if (/^ИНН\s*[\d\s]+$/i.test(line)) return false;
        if (/^инн\s*[:\s]*\d{10,12}\s*$/i.test(line)) return false;
        if (/^КПП\s*[:№]?\s*\d{4}[\dA-Z]{2}\d{3}/i.test(line)) return false;
        // строка только из реквизитов: «ИНН 7707083893 КПП 770701001», «ИНН: …, КПП: …»
        if (/^(?:(?:ИНН|КПП|ИНН\s*\/\s*КПП|ОГРНИП|ОГРН)\s*[:№]?\s*(?:\d{9,15}|\d{4}[\dA-Z]{2}\d{3})(?:\s*\/\s*\d{4}[\dA-Z]{2}\d{3})?[\s,;/]*)+$/i.test(line)) return false;
        if (/^(?:тел|телефон|моб|phone)\s*[.:]?\s*[\d\s+()-]+$/i.test(line)) return false;
        if (innEsc && new RegExp(`^\\s*${innEsc}\\s*$`).test(line.replace(/\s/g, ''))) return false;
        if (kpp && new RegExp(`^\\s*${kpp}\\s*$`).test(line)) return false;
        return true;
    });
    let joined = filtered.join(' ').replace(/\s+/g, ' ').trim();
    if (inn) {
        joined = joined
            // вместе с номером убираем и его подпись, иначе оставалось «ИНН КПП Вопрос: …»
            .replace(new RegExp(`(?:ИНН|инн)\\s*[:№]?\\s*${innEsc}`, 'g'), ' ')
            .replace(new RegExp(`\\b${innEsc}\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (kpp) {
        const kppEsc = kpp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        joined = joined
            .replace(new RegExp(`(?:КПП|кпп)\\s*[:№]?\\s*${kppEsc}`, 'g'), ' ')
            .replace(new RegExp(`\\b${kppEsc}\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    for (const p of phones || []) {
        const pe = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        joined = joined.replace(new RegExp(`\\b${pe}\\b`, 'g'), ' ');
        joined = joined.replace(new RegExp(`\\b8${p.slice(1)}\\b`, 'g'), ' ');
    }
    joined = joined.replace(/^[\s,;:.\-–—]+/, '');
    joined = joined.replace(/\s+/g, ' ').trim();
    return joined.slice(0, 4000);
}

/**
 * @param {string} text
 * @param {number} centerIndex
 * @param {number} radius
 * @returns {string}
 */
export function snippetAround(text, centerIndex, radius = 420) {
    const start = Math.max(0, centerIndex - radius);
    const end = Math.min(text.length, centerIndex + radius);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Разбор одного нумерованного блока `N). …`
 * @param {string} blockText
 * @returns {object|null}
 */
export function parseNumberedAppealBlock(blockText) {
    const head = blockText.match(/^\s*(\d+)\)\.?\s+/);
    if (!head) return null;
    const listItemIndex = parseInt(head[1], 10);
    const body = stripLeadingNumberedMarker(blockText);
    if (!body) {
        return {
            inn: '',
            kpp: null,
            phones: [],
            emails: [],
            question: '',
            contextSnippet: blockText.slice(0, 500),
            confidence: 'low',
            listItemIndex,
        };
    }

    const primary = pickPrimaryInn(body);
    const inn = primary ? primary.digits : '';
    const kpp = extractKppFromBlock(body);
    const phones = extractPhoneCandidates(body);
    const emails = extractEmailCandidates(body);

    let confidence = 'low';
    if (inn) confidence = innConfidence(inn);
    else if (phones.length) confidence = 'medium';
    else if (kpp) confidence = 'medium';

    let question =
        extractQuestionFromAppealBody(body, inn, kpp, phones) || extractQuestionHeuristic(body);
    question = normalizeQuestionAfterParse(question, inn);

    const centerIdx = primary ? primary.index : 0;
    const contextSnippet = snippetAround(body, centerIdx, 500);

    return enrichParsedRecord(
        {
            inn,
            kpp,
            phones,
            emails,
            question,
            contextSnippet,
            confidence,
            listItemIndex,
        },
        body,
    );
}

/**
 * Разбор одного загруженного .txt в записи для БД.
 * @param {string} fullText
 * @param {string} fileName
 * @returns {Array<{ inn: string, kpp: string|null, phones: string[], question: string, contextSnippet: string, confidence: 'high'|'medium'|'low', listItemIndex?: number }>}
 */
export function parseTxtIntoRecords(fullText, fileName = '') {
    const out0 = parseTxtIntoRecordsCore(sanitizeRawText(fullText), fileName);
    // дата обращения по умолчанию: из «шапки» файла (до первого пункта) или из имени файла
    const sanitized = sanitizeRawText(fullText);
    const firstItem = sanitized.search(/(?:^|\n)[ \t]*\d+\)\.?\s+/);
    // шапка — только текст ДО первого пункта; если файл начинается сразу с «1). …», шапки нет
    // (раньше первой строкой считался сам пункт 1, и его дата приписывалась всем пунктам без даты)
    const preamble =
        firstItem > 0 ? sanitized.slice(0, Math.min(firstItem, 600)) : firstItem === 0 ? '' : sanitized.split('\n')[0].slice(0, 200);
    const headDates = findDatesInText(preamble);
    const fileDate = headDates.length ? headDates[0].date : dateFromFileName(fileName);
    const fileDateSource = headDates.length ? 'file-header' : fileDate ? 'file-name' : null;
    for (const r of out0) {
        if (!r.parserVersion) enrichParsedRecord(r, r.__block || r.contextSnippet || '');
        delete r.__block;
        if (!r.appealDate && fileDate) {
            r.appealDate = fileDate;
            r.appealTime = null;
            r.appealDateSource = fileDateSource;
        }
    }
    return out0;
}

function parseTxtIntoRecordsCore(fullText, fileName = '') {
    const normalized = fullText.replace(/\r\n/g, '\n');

    if (hasNumberedAppealFormat(normalized)) {
        const chunks = splitIntoNumberedBlocks(normalized);
        const out = [];
        for (const chunk of chunks) {
            if (!/^\s*\d+\)\.?\s+/.test(chunk)) continue;
            const rec = parseNumberedAppealBlock(chunk);
            if (!rec) continue;
            if (
                rec.inn ||
                (rec.phones && rec.phones.length > 0) ||
                rec.kpp ||
                (rec.emails && rec.emails.length > 0)
            ) {
                out.push(rec);
            }
        }
        if (out.length > 0) return out;
    }

    const segments = splitIntoSegments(fullText);
    const blocks = segments.length ? segments : [fullText];
    const results = [];
    const seen = new Set();

    for (const block of blocks) {
        const occ = findInnOccurrences(block);
        if (occ.length === 0) continue;

        for (const { index, digits } of occ) {
            const conf = innConfidence(digits);
            const key = `${digits}|${index}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const win = snippetAround(block, index, 500);
            const kpp = extractKppFromBlock(block) || extractKppNearInn(win);
            const phones = extractPhoneCandidates(win);
            const emails = extractEmailCandidates(block);
            let question = extractQuestionHeuristic(block);
            question = normalizeQuestionAfterParse(question, digits);

            results.push({
                inn: digits,
                kpp,
                phones,
                emails,
                question,
                contextSnippet: win,
                confidence: conf,
                __block: occ.length > 1 ? win : block,
            });
        }
    }

    if (results.length === 0 && fileName) {
        const occ = findInnOccurrences(fullText);
        for (const { index, digits } of occ) {
            const conf = innConfidence(digits);
            const win = snippetAround(fullText, index, 500);
            const qRaw = extractQuestionHeuristic(fullText);
            results.push({
                inn: digits,
                kpp: extractKppFromBlock(fullText) || extractKppNearInn(win),
                phones: extractPhoneCandidates(win),
                emails: extractEmailCandidates(fullText),
                question: normalizeQuestionAfterParse(qRaw, digits),
                contextSnippet: win,
                confidence: conf,
                __block: win,
            });
        }
    }

    if (results.length === 0 && fileName) {
        const phoneOnly = extractPhoneCandidates(fullText);
        if (phoneOnly.length > 0) {
            results.push({
                inn: '',
                kpp: null,
                phones: phoneOnly,
                emails: extractEmailCandidates(fullText),
                question: extractQuestionHeuristic(fullText),
                contextSnippet: fullText.slice(0, 500).replace(/\s+/g, ' ').trim(),
                confidence: 'medium',
                __block: fullText.slice(0, 20000),
            });
        }
    }

    if (results.length === 0 && fileName) {
        const kppOnly = extractKppFromBlock(fullText);
        if (kppOnly) {
            results.push({
                inn: '',
                kpp: kppOnly,
                phones: [],
                emails: extractEmailCandidates(fullText),
                question: extractQuestionHeuristic(fullText),
                contextSnippet: fullText.slice(0, 500).replace(/\s+/g, ' ').trim(),
                confidence: 'medium',
                __block: fullText.slice(0, 20000),
            });
        }
    }

    return results;
}

/**
 * Телефон для показа: 79031234567 → +7 (903) 123-45-67. Нераспознанное возвращается как есть.
 * @param {string} phone
 */
export function formatRussianPhoneForDisplay(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
        return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
    }
    return String(phone ?? '');
}

// ============================================================================
// Версия 2 разборщика: кодировки, даты обращений, ОГРН, чистый текст вопроса
// ============================================================================

/**
 * Определение кодировки и декодирование .txt.
 * BOM (UTF-8 / UTF-16 LE/BE) → строгий UTF-8 → однобайтовые кириллические (windows-1251, KOI8-R,
 * IBM866) с выбором по частоте типичных русских букв. Раньше файл в windows-1251 читался как UTF-8
 * и превращался в «������», а ИНН из него извлекались, но вопросы — нет.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ text: string, encoding: string }}
 */
export function decodeTextBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dec = (enc, fatal = false) => new TextDecoder(enc, { fatal }).decode(bytes);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return { text: dec('utf-8').replace(/^﻿/, ''), encoding: 'utf-8 (BOM)' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: dec('utf-16le').replace(/^﻿/, ''), encoding: 'utf-16le' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: dec('utf-16be').replace(/^﻿/, ''), encoding: 'utf-16be' };
    }
    try {
        return { text: dec('utf-8', true), encoding: 'utf-8' };
    } catch {
        /* не UTF-8 — пробуем однобайтовые */
    }
    const candidates = ['windows-1251', 'koi8-r', 'ibm866'];
    let best = null;
    for (const enc of candidates) {
        let text;
        try {
            text = dec(enc);
        } catch {
            continue;
        }
        const score = russianTextScore(text);
        if (!best || score > best.score) best = { text, encoding: enc, score };
    }
    if (best) return { text: best.text, encoding: best.encoding };
    return { text: dec('utf-8'), encoding: 'utf-8 (с заменой символов)' };
}

/** Доля частых строчных русских букв среди кириллицы: у верной кодировки ≈ 0.5, у ошибочной ≈ 0.1. */
export function russianTextScore(text) {
    let cyr = 0;
    let common = 0;
    const COMMON = 'оеаинтсрвлкмдпу';
    for (const ch of text) {
        const c = ch.charCodeAt(0);
        if (c >= 0x410 && c <= 0x44f) {
            cyr++;
            if (COMMON.includes(ch)) common++;
        }
    }
    return cyr ? common / cyr + Math.min(cyr, 1000) / 1e6 : 0;
}

/**
 * Санитизация сырого текста файла перед разбором: CRLF → LF, невидимые символы (ZWSP, BOM, мягкий
 * перенос) удаляются, неразрывные/узкие пробелы → обычный пробел. Невидимый символ внутри
 * «7707​083893» раньше ломал распознавание ИНН.
 * @param {string} text
 */
export function sanitizeRawText(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[­​-‏⁠﻿]/g, '')
        .replace(/[  -   　]/g, ' ');
}

const RU_MONTHS = [
    ['январ', 1], ['феврал', 2], ['март', 3], ['апрел', 4], ['ма', 5], ['июн', 6],
    ['июл', 7], ['август', 8], ['сентябр', 9], ['октябр', 10], ['ноябр', 11], ['декабр', 12],
];

function monthFromRu(word) {
    const w = String(word).toLowerCase();
    if (w === 'мая' || w === 'май') return 5;
    for (const [stem, n] of RU_MONTHS) if (stem !== 'ма' && w.startsWith(stem)) return n;
    return 0;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function validYmd(y, m, d) {
    if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validHm(h, mi) {
    return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

/**
 * Все даты в тексте: «12.03.2025 [10:15]», «12/03/2025», «2025-03-12[T10:15]», «12 марта 2025 [г.] [в 10:15]»,
 * «12.03.25» (двузначный год — только через точку). Невозможные даты (31.02) отбрасываются.
 * @param {string} text
 * @returns {Array<{ date: string, time: string|null, index: number, raw: string }>}
 */
export function findDatesInText(text) {
    const s = String(text || '');
    const out = [];
    const timeTail = '(?:\\s*(?:г\\.|года?))?(?:[ ,T]+(?:в\\s*)?(\\d{1,2})[:.](\\d{2})(?::(\\d{2}))?(?!\\d))?';
    const reDmy = new RegExp(`(?<![\\d.])(\\d{1,2})([./-])(\\d{1,2})\\2(\\d{4}|\\d{2})(?![\\d])${timeTail}`, 'g');
    const reIso = new RegExp(`(?<!\\d)(\\d{4})-(\\d{2})-(\\d{2})(?!\\d)${timeTail}`, 'g');
    const reRu = new RegExp(
        `(?<!\\d)(\\d{1,2})\\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\\s+(\\d{4})(?:\\s*(?:г\\.?|года))?(?:[ ,]+(?:в\\s*)?(\\d{1,2})[:.](\\d{2}))?`,
        'giu',
    );
    let m;
    while ((m = reDmy.exec(s)) !== null) {
        let y = Number(m[4]);
        if (m[4].length === 2) {
            if (m[2] !== '.') continue;
            y += 2000;
        }
        const mo = Number(m[3]);
        const d = Number(m[1]);
        if (!validYmd(y, mo, d)) continue;
        const h = m[5] != null ? Number(m[5]) : null;
        const mi = m[6] != null ? Number(m[6]) : null;
        const time = h != null && validHm(h, mi) ? `${pad2(h)}:${pad2(mi)}` : null;
        out.push({ date: `${y}-${pad2(mo)}-${pad2(d)}`, time, index: m.index, raw: m[0] });
    }
    while ((m = reIso.exec(s)) !== null) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!validYmd(y, mo, d)) continue;
        const h = m[4] != null ? Number(m[4]) : null;
        const mi = m[5] != null ? Number(m[5]) : null;
        const time = h != null && validHm(h, mi) ? `${pad2(h)}:${pad2(mi)}` : null;
        out.push({ date: `${y}-${pad2(mo)}-${pad2(d)}`, time, index: m.index, raw: m[0] });
    }
    while ((m = reRu.exec(s)) !== null) {
        const y = Number(m[3]);
        const mo = monthFromRu(m[2]);
        const d = Number(m[1]);
        if (!validYmd(y, mo, d)) continue;
        const h = m[4] != null ? Number(m[4]) : null;
        const mi = m[5] != null ? Number(m[5]) : null;
        const time = h != null && validHm(h, mi) ? `${pad2(h)}:${pad2(mi)}` : null;
        out.push({ date: `${y}-${pad2(mo)}-${pad2(d)}`, time, index: m.index, raw: m[0] });
    }
    out.sort((a, b) => a.index - b.index);
    return out;
}

const DATE_LABEL_RE =
    /(?:дата|от|поступ\p{L}*|созда\p{L}*|получ\p{L}*|время|звон\p{L}*|обращени\p{L}*|зарегистр\p{L}*)[\s:№-]*$/iu;

/**
 * Дата самого обращения — только «уверенная»: в первой строке блока (заголовок) или после подписи
 * «Дата:», «от», «поступило», «создано». Дата внутри текста («отчёт за 31.03.2025») — это период,
 * а не момент обращения, и в хронологию не попадает.
 * @param {string} block
 * @returns {{ date: string, time: string|null, raw: string } | null}
 */
export function extractAppealDateTime(block) {
    const s = String(block || '');
    const firstLineEnd = s.indexOf('\n') === -1 ? s.length : s.indexOf('\n');
    for (const d of findDatesInText(s)) {
        const inHead = d.index < Math.min(firstLineEnd, 120);
        const labeled = DATE_LABEL_RE.test(s.slice(Math.max(0, d.index - 24), d.index));
        if (inHead || labeled) return { date: d.date, time: d.time, raw: d.raw };
    }
    return null;
}

/**
 * Дата из имени файла: «обращения_2025-03-12.txt», «12.03.2025.txt», «20250312_выгрузка.txt».
 * @param {string} name
 * @returns {string|null} YYYY-MM-DD
 */
export function dateFromFileName(name) {
    const base = String(name || '').replace(/\.[^.]+$/, '');
    const found = findDatesInText(base.replace(/_/g, ' '));
    if (found.length) return found[0].date;
    const m = base.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
    if (m && validYmd(Number(m[1]), Number(m[2]), Number(m[3]))) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
}

/** Контрольное число ОГРН (13 знаков) / ОГРНИП (15 знаков). */
export function isValidOgrn(digits) {
    const s = String(digits || '');
    if (/^\d{13}$/.test(s)) {
        return Number(BigInt(s.slice(0, 12)) % 11n % 10n) === Number(s[12]);
    }
    if (/^\d{15}$/.test(s)) {
        return Number(BigInt(s.slice(0, 14)) % 13n % 10n) === Number(s[14]);
    }
    return false;
}

/** ОГРН/ОГРНИП с верной контрольной суммой. */
export function extractOgrnCandidates(text) {
    const out = [];
    for (const m of String(text || '').matchAll(/(?<!\d)(\d{13}|\d{15})(?!\d)/g)) {
        if (isValidOgrn(m[1]) && !out.includes(m[1])) out.push(m[1]);
    }
    return out;
}

/** Все различные ИНН блока; ИНН с верной контрольной суммой — первыми. */
export function extractAllInns(text) {
    const seen = new Map();
    for (const o of findInnOccurrences(text)) {
        if (isPhoneLikeInnOccurrence(text, o)) continue;
        if (!seen.has(o.digits)) seen.set(o.digits, innConfidence(o.digits));
    }
    return [...seen.entries()]
        .sort((a, b) => (a[1] === 'high' ? 0 : 1) - (b[1] === 'high' ? 0 : 1))
        .map(([d]) => d);
}

const PHONE_RUN_RE = /\+?\d[\d\s\-().]{7,}\d/g;
const EMAIL_RE = new RegExp(EMAIL_SRC, 'gu');

/**
 * Финальная чистка текста вопроса: убирает телефоны в любом написании («+7 (903) 123-45-67»),
 * адреса почты, ОГРН, повисшие подписи «Тел.:», «E-mail:», «ИНН:», ведущие «Вопрос:»/«Суть:» и дату
 * обращения из заголовка. Раньше отформатированный телефон и почта оставались в поле «Вопрос».
 * @param {string} question
 * @param {{ phones?: string[], emails?: string[], ogrn?: string[], dateRaw?: string|null }} ctx
 */
export function scrubQuestionText(question, ctx = {}) {
    let q = String(question || '');
    const phoneSet = new Set(ctx.phones || []);
    const PH_LABEL = '(?:(?<![\\p{L}])(?:тел(?:ефон)?|моб(?:ильный)?|сот(?:овый)?|whatsapp|ватсап)\\.?\\s*[:№]?\\s*)?';
    q = q.replace(new RegExp(`${PH_LABEL}(${PHONE_RUN_RE.source})`, 'giu'), (whole, run) => {
        const n = normalizeRussianPhone(run);
        return n && phoneSet.has(n) ? ' ' : whole;
    });
    q = q.replace(
        new RegExp(`(?:(?<![\\p{L}])(?:e-?mail|email|mail|почта|эл\\.?\\s?почта|эл\\.?\\s?адрес)\\s*[:№]?\\s*)?${EMAIL_RE.source}`, 'giu'),
        ' ',
    );
    // иностранные номера (+375 …), сохранённые как «+цифры»
    for (const p of ctx.phones || []) {
        if (!String(p).startsWith('+')) continue;
        q = q.replace(new RegExp(`${PH_LABEL}\\+[\\d\\s\\-()]{6,22}\\d`, 'giu'), (run) => (run.replace(/\D/g, '').endsWith(p.slice(1)) ? ' ' : run));
    }
    if ((ctx.phones || []).length) {
        // остаток добавочного номера после удалённого телефона
        q = q.replace(/(?<![\p{L}])(?:доб(?:авочный)?|вн(?:утр(?:енний)?)?|ext)\.?\s*[:№]?\s*\d{1,6}(?!\d)/giu, ' ');
    }
    // «ИНН/КПП 7707083893/770701001» после удаления номеров оставлял «ИНН/КПП /»
    q = q.replace(/(?<![\p{L}])инн\s*\/\s*кпп\s*[:№]?\s*(?:\/\s*)?(?=$|[\s,;])/giu, ' ');
    for (const o of ctx.ogrn || []) q = q.split(o).join(' ');
    if (ctx.dateRaw) {
        const idx = q.indexOf(ctx.dateRaw);
        if (idx !== -1 && idx < 40) q = q.slice(0, idx) + ' ' + q.slice(idx + ctx.dateRaw.length);
    }
    const LABEL =
        '(?:тел(?:ефон)?|моб(?:ильный)?|сот(?:овый)?|e-?mail|email|почта|эл\\.?\\s?почта|эл\\.?\\s?адрес|инн|кпп|огрн(?:ип)?|дата|время)';
    // подпись, после которой ничего не осталось (или сразу следующая подпись / знак препинания)
    const dangling = new RegExp(
        `(?<![\\p{L}])${LABEL}(?:\\.\\s*[:№]?|\\s*[:№])\\s*(?=$|[,;|/]|\\s+${LABEL}(?![\\p{L}])|\\s*(?:вопрос|суть|тема|текст)\\s*:)`,
        'giu',
    );
    for (let i = 0; i < 3; i++) q = q.replace(dangling, ' ');
    q = q
        .replace(/^[\s,;:.\-–—|/]+/, '')
        .replace(/^(?:вопрос|суть(?:\s+обращения)?|обращение|текст(?:\s+обращения)?|тема)\s*[:\-–—]\s*/iu, '');
    q = q
        .replace(/\(\s*\)/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,;:.\-–—|/]+/, '')
        .replace(/[\s,;:\-–—|/]+$/, '')
        .trim();
    return q;
}

/**
 * Обогащение разобранной записи полями версии 2 (по исходному блоку).
 * @param {object} rec результат parseNumberedAppealBlock / legacy-разбора
 * @param {string} block исходный текст блока
 */
export function enrichParsedRecord(rec, block) {
    const src = String(block || '');
    const when = extractAppealDateTime(src);
    const ogrn = extractOgrnCandidates(src);
    const inns = extractAllInns(src);
    rec.question = scrubQuestionText(rec.question, {
        phones: rec.phones,
        emails: rec.emails,
        ogrn,
        dateRaw: when ? when.raw : null,
    });
    rec.question = normalizeQuestionAfterParse(rec.question, rec.inn);
    rec.sourceText = cleanDisplayText(src).slice(0, 20000);
    rec.inns = inns;
    rec.ogrn = ogrn;
    const ext = extractPhoneExtensions(src);
    if (Object.keys(ext).length) rec.phoneExt = ext;
    rec.appealDate = when ? when.date : null;
    rec.appealTime = when ? when.time : null;
    rec.appealDateSource = when ? 'block' : null;
    rec.parserVersion = CA_PARSER_VERSION;
    return rec;
}
