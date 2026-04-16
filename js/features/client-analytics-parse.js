'use strict';

/**
 * Извлечение сущностей из текста обращений (ИНН, КПП, телефоны, вопрос).
 * Формат «умной» выгрузки: пункты 1). 2). … — каждое обращение в отдельном блоке.
 * Двухконтурная проверка ИНН: формат + контрольная сумма ФНС (10/12 знаков).
 */

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
export function extractEmailCandidates(text) {
    if (!text || typeof text !== 'string') return [];
    const re = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
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

export function extractPhoneCandidates(text) {
    if (!text || typeof text !== 'string') return [];
    const out = [];
    const seen = new Set();

    const tryAdd = (raw) => {
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
        tryAdd(m[0]);
    }

    const plain11 = text.matchAll(/\b([78]\d{10})\b/g);
    for (const pm of plain11) {
        tryAdd(pm[1]);
    }

    return out;
}

/**
 * @param {string} windowText
 * @returns {string|null}
 */
export function extractKppNearInn(windowText) {
    if (!windowText) return null;
    const labeled = windowText.match(/(?:КПП|kpp)[\s:]*(\d{9})\b/i);
    if (labeled) return labeled[1];
    const afterInn = windowText.split(/ИНН|inn/i);
    if (afterInn.length > 1) {
        const tail = afterInn.slice(1).join(' ');
        const m = tail.match(/\b(\d{9})\b/);
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
    const re = /\b(\d{9})\b/g;
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
    return /(?:^|\n)\s*\d+\)\.?\s+/.test(text.replace(/\r\n/g, '\n'));
}

/**
 * Делит файл на блоки по строкам, начинающимся с `N).` или `N).`
 * @param {string} fullText
 * @returns {string[]}
 */
export function splitIntoNumberedBlocks(fullText) {
    if (!fullText || typeof fullText !== 'string') return [];
    const normalized = fullText.replace(/\r\n/g, '\n');
    const parts = normalized.split(/(?=\n\s*\d+\)\.?\s+)/);
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
    const occ = findInnOccurrences(text);
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
        if (/^КПП\s*\d{9}/i.test(line)) return false;
        if (/^кпп\s*[:\s]*\d{9}\s*$/i.test(line)) return false;
        if (/^(?:тел|телефон|моб|phone)\s*[.:]?\s*[\d\s+()-]+$/i.test(line)) return false;
        if (innEsc && new RegExp(`^\\s*${innEsc}\\s*$`).test(line.replace(/\s/g, ''))) return false;
        if (kpp && new RegExp(`^\\s*${kpp}\\s*$`).test(line)) return false;
        return true;
    });
    let joined = filtered.join(' ').replace(/\s+/g, ' ').trim();
    if (inn) {
        joined = joined
            .replace(new RegExp(`\\b${innEsc}\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (kpp) {
        const kppEsc = kpp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        joined = joined
            .replace(new RegExp(`\\b${kppEsc}\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    for (const p of phones || []) {
        const pe = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        joined = joined.replace(new RegExp(`\\b${pe}\\b`, 'g'), ' ');
        joined = joined.replace(new RegExp(`\\b8${p.slice(1)}\\b`), ' ');
    }
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

    return {
        inn,
        kpp,
        phones,
        emails,
        question,
        contextSnippet,
        confidence,
        listItemIndex,
    };
}

/**
 * Разбор одного загруженного .txt в записи для БД.
 * @param {string} fullText
 * @param {string} fileName
 * @returns {Array<{ inn: string, kpp: string|null, phones: string[], question: string, contextSnippet: string, confidence: 'high'|'medium'|'low', listItemIndex?: number }>}
 */
export function parseTxtIntoRecords(fullText, fileName = '') {
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
            });
        }
    }

    return results;
}
