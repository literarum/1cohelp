'use strict';

/**
 * Движок аналитики обращений: один проход по всем записям раздела «База клиентов» →
 * сводка для дашборда (динамика, клиенты, темы, текст, кластеры, дубликаты, качество данных)
 * и индексы для «проваливания» в записи. Без DOM и сети: работает в Web Worker.
 *
 * Принципы:
 *  • каждое число объяснимо (формула и порог описаны рядом), ничего не «додумывается»;
 *  • если данных мало для вывода — в результате стоит явный флаг insufficient, а не число;
 *  • детерминированность: одинаковая база → одинаковые кластеры и порядок.
 */

import {
    describe,
    histogram,
    gini,
    lorenz,
    hhi,
    topShare,
    entropyBits,
    normalizedEntropy,
    movingAverage,
    robustZ,
    mannKendall,
    cusumChangePoint,
    chiSquareUniform,
    dispersionIndex,
    autocorrelation,
    wilson,
    logLikelihoodG2,
    collocationScores,
    zipfFit,
    heapsFit,
    normalizeSparse,
    sphericalKMeans,
    silhouetteSample,
    minhashSignature,
    lshCandidatePairs,
    UnionFind,
    fnv1a,
    ewma,
    linearRegression,
} from './client-analytics-math.js';
import {
    tokenizeDetailed,
    classifyText,
    wordShingles,
    splitSentences,
    TOPICS,
    INTENTS,
    TOPIC_LABELS,
    INTENT_LABELS,
    normalizeForAnalysis,
} from './client-analytics-text.js';
import { describeInn, kppReason, regionByCode } from './client-analytics-registry.js';
import { innConfidence } from './client-analytics-parse.js';
import { editDistance } from './search-text-utils.js';
import { computeFrogInsights } from './client-analytics-frogs.js';

export const INSIGHTS_VERSION = 1;

/** Эталонные частоты букв русского языка, % (НКРЯ). Для сравнения «алфавитного профиля» базы. */
export const RU_LETTER_FREQ = {
    о: 10.97, е: 8.45, а: 8.01, и: 7.35, н: 6.7, т: 6.26, с: 5.47, р: 4.73, в: 4.54, л: 4.4, к: 3.49,
    м: 3.21, д: 2.98, п: 2.81, у: 2.62, я: 2.01, ы: 1.9, ь: 1.74, г: 1.7, з: 1.65, б: 1.59, ч: 1.44,
    й: 1.21, х: 0.97, ж: 0.94, ш: 0.73, ю: 0.64, ц: 0.48, щ: 0.36, э: 0.32, ф: 0.26, ъ: 0.04, ё: 0.04,
};

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Даты
// ---------------------------------------------------------------------------
function ymdToDayNum(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayNumToYmd(n) {
    const d = new Date(n * DAY_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function localYmd(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Эффективная дата записи: дата обращения из текста → из шапки/имени файла → дата загрузки.
 * @returns {{ ymd: string|null, time: string|null, source: 'block'|'file-header'|'file-name'|'upload'|null }}
 */
export function effectiveDate(r) {
    if (r && typeof r.appealDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.appealDate)) {
        return { ymd: r.appealDate, time: r.appealTime || null, source: r.appealDateSource || 'block' };
    }
    const ymd = r && r.uploadedAt ? localYmd(r.uploadedAt) : null;
    return { ymd, time: null, source: ymd ? 'upload' : null };
}

// ---------------------------------------------------------------------------
// Основной расчёт
// ---------------------------------------------------------------------------
/**
 * @param {object[]} records записи clientAnalyticsRecords
 * @param {{ files?: object[], onProgress?: (phase: string, pct: number) => void, now?: number,
 *   blacklistInns?: string[], maxTermsIndexed?: number }} [opts]
 */
export function computeInsights(records, opts = {}) {
    const t0 = Date.now();
    const progress = opts.onProgress || (() => {});
    const now = opts.now || Date.now();
    const list = (Array.isArray(records) ? records : []).filter((r) => r && r.id != null);
    const n = list.length;

    // ---------------- проход 1: признаки каждой записи ----------------
    progress('Разбор текста и признаков записей', 5);
    const stemCache = new Map(); // норм. слово → { stem, ... } (стемминг дорогой — кэшируем)
    const surfaceByStem = new Map(); // стем → Map(словоформа → частота)
    const tf = new Map(); // стем → общая частота
    const df = new Map(); // стем → в скольких записях
    const docStems = new Array(n); // уникальные стемы записи (для df/кластеров)
    const docTokens = new Array(n); // стемы записи по порядку (для биграмм/шинглов)
    const lenChars = [];
    const lenWords = [];
    const sentencesPerRec = [];
    const letterCounts = Object.create(null);
    const charClass = { cyr: 0, lat: 0, digit: 0, space: 0, punct: 0, other: 0 };
    const mixedWords = new Map(); // исходное смешанное слово → частота
    const heapsCurve = [];
    let totalTokens = 0;
    let totalContent = 0;
    const recInfo = new Array(n);

    const topicIndex = Object.fromEntries(TOPICS.map((t) => [t.id, []]));
    const intentIndex = Object.fromEntries([...INTENTS.map((t) => [t.id, []]), ['other', []]]);
    const urgentIds = [];
    const negativeIds = [];
    const topicCo = TOPICS.map(() => new Array(TOPICS.length).fill(0));
    const topicIdxById = Object.fromEntries(TOPICS.map((t, i) => [t.id, i]));

    for (let i = 0; i < n; i++) {
        const r = list[i];
        const q = String(r.question || '');
        const toks = tokenizeDetailed(q);
        const stems = [];
        const uniq = new Set();
        let wordsCount = 0;
        for (const t of toks) {
            totalTokens++;
            if (!t.numeric) wordsCount++;
            if (t.script === 'mixed') mixedWords.set(t.surface, (mixedWords.get(t.surface) || 0) + 1);
            if (t.stop || t.numeric) continue;
            if (t.norm.length < 2 && !/\d/.test(t.norm)) continue;
            let st = stemCache.get(t.norm);
            if (st === undefined) {
                st = t.stem;
                stemCache.set(t.norm, st);
            }
            stems.push(st);
            uniq.add(st);
            totalContent++;
            tf.set(st, (tf.get(st) || 0) + 1);
            let sm = surfaceByStem.get(st);
            if (!sm) surfaceByStem.set(st, (sm = new Map()));
            sm.set(t.norm, (sm.get(t.norm) || 0) + 1);
        }
        for (const st of uniq) df.set(st, (df.get(st) || 0) + 1);
        docStems[i] = uniq;
        docTokens[i] = stems;
        lenChars.push(q.length);
        lenWords.push(wordsCount);
        sentencesPerRec.push(splitSentences(q).length);
        countChars(q, charClass, letterCounts);
        if (i % Math.max(1, Math.floor(n / 60)) === 0) heapsCurve.push({ n: totalContent, v: tf.size });

        const cls = classifyText(q);
        for (const tp of cls.topics) topicIndex[tp].push(r.id);
        for (let a = 0; a < cls.topics.length; a++) {
            for (let b = a; b < cls.topics.length; b++) {
                const ia = topicIdxById[cls.topics[a]];
                const ib = topicIdxById[cls.topics[b]];
                topicCo[ia][ib]++;
                if (ia !== ib) topicCo[ib][ia]++;
            }
        }
        intentIndex[cls.intent].push(r.id);
        if (cls.urgency >= 2) urgentIds.push(r.id);
        if (cls.negativity >= 2) negativeIds.push(r.id);

        const ed = effectiveDate(r);
        recInfo[i] = {
            id: r.id,
            day: ed.ymd ? ymdToDayNum(ed.ymd) : null,
            time: ed.time,
            dateSource: ed.source,
            topics: cls.topics,
            intent: cls.intent,
            urgency: cls.urgency,
            negativity: cls.negativity,
            caps: cls.capsRatio,
        };
        if (i % 2000 === 0) progress('Разбор текста и признаков записей', 5 + Math.round((30 * i) / Math.max(1, n)));
    }
    heapsCurve.push({ n: totalContent, v: tf.size });

    const displayForm = (st) => {
        const sm = surfaceByStem.get(st);
        if (!sm) return st;
        let best = st;
        let bc = -1;
        for (const [w, c] of sm) if (c > bc || (c === bc && w.length < best.length)) [best, bc] = [w, c];
        return best;
    };

    // ---------------- обзор ----------------
    progress('Сводка и качество данных', 38);
    const innCounts = new Map();
    const innRecs = new Map();
    let noInn = 0;
    for (let i = 0; i < n; i++) {
        const inn = String(list[i].inn || '').replace(/\D/g, '');
        if (inn.length !== 10 && inn.length !== 12) {
            noInn++;
            continue;
        }
        innCounts.set(inn, (innCounts.get(inn) || 0) + 1);
        if (!innRecs.has(inn)) innRecs.set(inn, []);
        innRecs.get(inn).push(i);
    }
    const days = recInfo.map((x) => x.day).filter((d) => d != null);
    const minDay = days.length ? Math.min(...days) : null;
    const maxDay = days.length ? Math.max(...days) : null;
    const dateSources = { block: 0, 'file-header': 0, 'file-name': 0, upload: 0, none: 0 };
    for (const x of recInfo) dateSources[x.dateSource || 'none']++;
    const dateReliable = n ? (dateSources.block + dateSources['file-header'] + dateSources['file-name']) / n : 0;

    // ---------------- качество данных ----------------
    const quality = computeQuality(list, recInfo, innCounts, now);

    // ---------------- динамика ----------------
    progress('Динамика и сезонность', 45);
    const time = computeTimeSeries(recInfo, minDay, maxDay);

    // ---------------- клиенты ----------------
    progress('Клиенты, концентрация, связи', 52);
    const blacklistInns = opts.blacklistInns || (opts.blacklistEntries || []).map((e) => String((e && e.inn) || '').replace(/\D/g, '')).filter(Boolean);
    const clients = computeClients(list, recInfo, innCounts, innRecs, blacklistInns);

    // ---------------- текст ----------------
    progress('Лингвистика: частоты, Ципф, коллокации', 60);
    const termsSorted = [...tf.entries()].sort((a, b) => b[1] - a[1]);
    const freqs = termsSorted.map((e) => e[1]);
    const hapax = freqs.filter((f) => f === 1).length;
    const zipf = zipfFit(freqs);
    const heaps = heapsFit(heapsCurve);
    const maxTerms = opts.maxTermsIndexed || 300;
    const topTerms = termsSorted.slice(0, 60).map(([st, f]) => {
        const d = df.get(st) || 0;
        return {
            stem: st,
            word: displayForm(st),
            tf: f,
            df: d,
            share: n ? d / n : 0,
            idf: Math.log((n + 1) / (d + 1)) + 1,
        };
    });
    // ключевые слова по TF-IDF (суммарный вес по корпусу, отбрасываем слова из > 40% записей)
    const tfidfTerms = termsSorted
        .filter(([st]) => (df.get(st) || 0) >= 3 && (df.get(st) || 0) / Math.max(1, n) <= 0.4)
        .map(([st, f]) => ({ stem: st, word: displayForm(st), score: f * Math.log(n / (df.get(st) || 1)), tf: f, df: df.get(st) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);

    // коллокации (биграммы соседних значимых слов)
    const bigram = new Map();
    let bigramTotal = 0;
    for (const stems of docTokens) {
        for (let k = 0; k + 1 < stems.length; k++) {
            if (stems[k] === stems[k + 1]) continue;
            const key = `${stems[k]} ${stems[k + 1]}`;
            bigram.set(key, (bigram.get(key) || 0) + 1);
            bigramTotal++;
        }
    }
    const collocations = [];
    for (const [key, f] of bigram) {
        if (f < 3) continue;
        const [a, b] = key.split(' ');
        const sc = collocationScores(f, tf.get(a), tf.get(b), Math.max(totalContent, 1));
        collocations.push({ phrase: `${displayForm(a)} ${displayForm(b)}`, key, f, pmi: sc.pmi, t: sc.t });
    }
    collocations.sort((x, y) => y.t - x.t);

    // буквенный профиль и расхождение с эталоном (расстояние Йенсена — Шеннона, 0..1)
    const lettersTotal = Object.values(letterCounts).reduce((s, v) => s + v, 0);
    const letters = Object.keys(RU_LETTER_FREQ).map((ch) => ({
        ch,
        count: letterCounts[ch] || 0,
        pct: lettersTotal ? (100 * (letterCounts[ch] || 0)) / lettersTotal : 0,
        ref: RU_LETTER_FREQ[ch],
    }));
    const jsd = jensenShannon(
        letters.map((l) => l.pct / 100),
        letters.map((l) => l.ref / 100),
    );

    // кандидаты в опечатки: редкое слово на расстоянии 1 правки от частого той же длины ±1
    const typos = findTypoCandidates(surfaceByStem, tf);

    // «набирающие» и «уходящие» слова: последние 30 дней против всего предыдущего периода (G²)
    const emerging = computeEmergingTerms(docTokens, recInfo, maxDay, displayForm);

    const text = {
        totalTokens,
        contentTokens: totalContent,
        vocabulary: tf.size,
        hapax,
        hapaxShare: tf.size ? hapax / tf.size : 0,
        ttr: totalContent ? tf.size / totalContent : 0,
        entropy: entropyBits(freqs),
        entropyNorm: normalizedEntropy(freqs),
        zipf: { exponent: zipf.exponent, r2: zipf.r2, intercept: zipf.intercept, points: thinPoints(zipf.points, 120) },
        heaps: { ...heaps, curve: heapsCurve },
        lengthChars: describe(lenChars),
        lengthWords: describe(lenWords),
        lengthWordsHist: histogram(lenWords, { maxBins: 30, integer: true }).bins,
        sentences: describe(sentencesPerRec),
        topTerms,
        tfidfTerms,
        collocations: collocations.slice(0, 30),
        bigramTotal,
        letters,
        lettersTotal,
        letterJsd: jsd,
        charClass,
        mixedWords: [...mixedWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w, c]) => ({ word: w, count: c })),
        mixedWordsTotal: [...mixedWords.values()].reduce((s, v) => s + v, 0),
        typos,
        emerging,
    };

    // ---------------- темы и намерения ----------------
    progress('Темы, намерения, срочность', 68);
    const topics = computeTopics(recInfo, topicIndex, intentIndex, topicCo, maxDay, n, urgentIds, negativeIds);

    // ---------------- кластеры ----------------
    progress('Кластеризация (сферический k-means)', 74);
    const clusters = computeClusters(list, docStems, df, n, displayForm, opts.seed || 42);

    // ---------------- дубликаты ----------------
    progress('Почти-дубликаты (MinHash + LSH)', 86);
    const duplicates = computeDuplicates(list, docTokens);

    // ---------------- жабы (чёрный список) ----------------
    progress('Сверка с чёрным списком («жабы»)', 91);
    const frogsRaw = computeFrogInsights(list, recInfo, opts.blacklistEntries || [], { docTokens, displayForm, now });
    const frogPer = frogsRaw.perRecord;
    const frogIndex = frogsRaw.index;
    const frogEntryIds = frogsRaw.entryIds;
    delete frogsRaw.perRecord;
    delete frogsRaw.index;
    delete frogsRaw.entryIds;
    const frogs = frogsRaw;
    if (frogs.clientLevels) {
        for (const c of clients.top) c.frogLevel = frogs.clientLevels[c.inn] || 0;
        for (const g of clients.linkedGroups) g.frogs = g.inns.filter((x) => frogs.clientLevels[x]).length;
    }

    // ---------------- индекс слов → записи для проваливания ----------------
    progress('Индексы для просмотра записей', 95);
    const termIndex = {};
    const indexed = new Set(termsSorted.slice(0, maxTerms).map((e) => e[0]));
    for (const c of collocations.slice(0, 30)) c.key.split(' ').forEach((s) => indexed.add(s));
    for (const e of [...emerging.rising, ...emerging.falling]) indexed.add(e.stem);
    for (const st of indexed) termIndex[st] = [];
    for (let i = 0; i < n; i++) for (const st of docStems[i]) if (termIndex[st]) termIndex[st].push(list[i].id);

    const perRecord = {};
    for (let i = 0; i < n; i++) {
        const x = recInfo[i];
        const fm = frogPer[i];
        perRecord[x.id] = { t: x.topics, i: x.intent, c: clusters.assignById ? clusters.assignById[x.id] : -1, u: x.urgency, g: x.negativity, d: x.day, s: x.dateSource };
        if (fm && fm.entries.length) perRecord[x.id].f = { l: fm.level, w: fm.weakLevel, v: fm.via, e: fm.entries };
    }
    delete clusters.assignById;

    const overview = {
        records: n,
        clients: innCounts.size,
        noInn,
        noInnShare: n ? noInn / n : 0,
        files: Array.isArray(opts.files) ? opts.files.length : new Set(list.map((r) => r.sourceFileId)).size,
        from: minDay != null ? dayNumToYmd(minDay) : null,
        to: maxDay != null ? dayNumToYmd(maxDay) : null,
        spanDays: minDay != null ? maxDay - minDay + 1 : 0,
        perActiveDay: time.daily.length ? describe(time.daily.filter((d) => d.count > 0).map((d) => d.count)) : null,
        repeatClients: [...innCounts.values()].filter((c) => c > 1).length,
        repeatRate: innCounts.size ? [...innCounts.values()].filter((c) => c > 1).length / innCounts.size : 0,
        appealsPerClient: describe([...innCounts.values()]),
        dateSources,
        dateReliable,
        topTopic: topics.list[0] || null,
        topIntent: topics.intents[0] || null,
        urgent: urgentIds.length,
        negative: negativeIds.length,
        frogAppeals: frogs.summary ? frogs.summary.appeals : 0,
        frogClients: frogs.summary ? frogs.summary.clients : 0,
    };

    progress('Готово', 100);
    return {
        version: INSIGHTS_VERSION,
        computedAt: new Date(now).toISOString(),
        computeMs: Date.now() - t0,
        overview,
        quality,
        time,
        clients,
        text,
        topics,
        clusters,
        duplicates,
        frogs,
        index: { topic: topicIndex, intent: intentIndex, term: termIndex, urgent: urgentIds, negative: negativeIds, quality: quality.index, frog: frogIndex, frogEntry: frogEntryIds },
        perRecord,
        df: Object.fromEntries([...df.entries()].filter((e) => e[1] >= 2)),
        labels: { topics: TOPIC_LABELS, intents: INTENT_LABELS },
    };
}

const PUNCT_RE = /[\p{P}\p{S}]/u;
/** Классы символов по кодовым точкам (быстрее регулярного выражения на каждый символ). */
export function countChars(text, cls, letters) {
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if ((c >= 0x430 && c <= 0x44f) || c === 0x451) {
            cls.cyr++;
            if (letters) {
                const ch = text[i];
                letters[ch] = (letters[ch] || 0) + 1;
            }
        } else if ((c >= 0x410 && c <= 0x42f) || c === 0x401) {
            cls.cyr++;
            if (letters) {
                const ch = text[i].toLowerCase();
                letters[ch] = (letters[ch] || 0) + 1;
            }
        } else if ((c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)) cls.lat++;
        else if (c >= 0x30 && c <= 0x39) cls.digit++;
        else if (c === 0x20 || c === 0x0a || c === 0x09 || c === 0x0d || c === 0xa0) cls.space++;
        else if (PUNCT_RE.test(text[i])) cls.punct++;
        else cls.other++;
    }
}

function thinPoints(points, max) {
    if (points.length <= max) return points;
    const out = [];
    // логарифмическая выборка: равномерно по log-рангу, как и рисуется график
    const step = points.length / max;
    for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
    out.push(points[points.length - 1]);
    return out;
}

function jensenShannon(p, q) {
    const m = p.map((v, i) => (v + q[i]) / 2);
    const kl = (a, b) => a.reduce((s, v, i) => (v > 0 && b[i] > 0 ? s + v * Math.log2(v / b[i]) : s), 0);
    return Math.sqrt(Math.max(0, (kl(p, m) + kl(q, m)) / 2));
}

// ---------------------------------------------------------------------------
// Качество данных
// ---------------------------------------------------------------------------
function computeQuality(list, recInfo, innCounts, now) {
    const idx = {
        innInvalid: [],
        noInn: [],
        noContacts: [],
        emptyQuestion: [],
        shortQuestion: [],
        ipWithKpp: [],
        kppRegionMismatch: [],
        multiInn: [],
        noAppealDate: [],
        futureDate: [],
        mixedScript: [],
        caps: [],
        exactDuplicate: [],
        legacyParser: [],
    };
    const seen = new Map();
    const todayDay = Math.floor(now / DAY_MS) + 1;
    for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const x = recInfo[i];
        const inn = String(r.inn || '').replace(/\D/g, '');
        const q = String(r.question || '').trim();
        if (!inn) idx.noInn.push(r.id);
        else if (innConfidence(inn) !== 'high') idx.innInvalid.push(r.id);
        if (!(r.phones && r.phones.length) && !(r.emails && r.emails.length)) idx.noContacts.push(r.id);
        if (!q) idx.emptyQuestion.push(r.id);
        else if (q.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length < 3) idx.shortQuestion.push(r.id);
        if (inn.length === 12 && r.kpp) idx.ipWithKpp.push(r.id);
        if (inn.length === 10 && /^\d{9}$/.test(String(r.kpp || '')) && String(r.kpp).slice(0, 2) !== inn.slice(0, 2)) {
            // Москва: 77 и 97 — один регион
            const a = inn.slice(0, 2);
            const b = String(r.kpp).slice(0, 2);
            if (!((a === '77' || a === '97') && (b === '77' || b === '97'))) idx.kppRegionMismatch.push(r.id);
        }
        if (Array.isArray(r.inns) && r.inns.length > 1) idx.multiInn.push(r.id);
        if (x.dateSource === 'upload' || !x.dateSource) idx.noAppealDate.push(r.id);
        if (x.day != null && x.day > todayDay) idx.futureDate.push(r.id);
        if (/[а-яё][a-z]|[a-z][а-яё]|\d[cC](?![a-zа-яё])/i.test(q)) idx.mixedScript.push(r.id);
        if (x.caps > 0.6) idx.caps.push(r.id);
        if (!r.parserVersion) idx.legacyParser.push(r.id);
        if (q) {
            const key = `${inn}|${normalizeForAnalysis(q).replace(/[^\p{L}\d]+/gu, ' ').trim()}`;
            const h = fnv1a(key);
            const prev = seen.get(h);
            if (prev != null) {
                if (prev.first) {
                    idx.exactDuplicate.push(prev.id);
                    prev.first = false;
                }
                idx.exactDuplicate.push(r.id);
            } else seen.set(h, { id: r.id, first: true });
        }
    }
    const nTotal = list.length;
    const LABELS = {
        innInvalid: ['ИНН не проходит контрольную сумму ФНС', 'serious', 'Опечатка в ИНН или это не ИНН (номер договора, счёта).'],
        noInn: ['Нет ИНН', 'warning', 'Обращение не привязано к клиенту — не попадает в историю по ИНН.'],
        noContacts: ['Нет телефона и e-mail', 'info', 'С клиентом не связаться по данным записи.'],
        emptyQuestion: ['Пустой текст вопроса', 'serious', 'В пункте были только реквизиты.'],
        shortQuestion: ['Очень короткий вопрос (< 3 слов)', 'info', 'Мало текста для тем и кластеров.'],
        ipWithKpp: ['ИНН физлица/ИП (12 цифр) вместе с КПП', 'warning', 'У ИП нет КПП — вероятна ошибка в реквизитах.'],
        kppRegionMismatch: ['Регион КПП ≠ регион ИНН', 'info', 'Обычно переезд или обособленное подразделение; не ошибка.'],
        multiInn: ['Несколько ИНН в одном обращении', 'warning', 'Запись привязана к первому ИНН с верной контрольной суммой.'],
        noAppealDate: ['Нет даты обращения в тексте/файле', 'info', 'Для динамики взята дата загрузки файла.'],
        futureDate: ['Дата обращения в будущем', 'serious', 'Ошибка в дате в тексте.'],
        mixedScript: ['Смешение латиницы и кириллицы в словах', 'info', 'Например «1C» латиницей; для анализа исправляется.'],
        caps: ['Текст в основном ЗАГЛАВНЫМИ', 'info', 'Признак эмоционального обращения.'],
        exactDuplicate: ['Точные дубликаты (тот же ИНН и текст)', 'warning', 'Одно обращение загружено несколько раз.'],
        legacyParser: ['Записи разобраны старой версией', 'info', 'Нажмите «Переобработать», чтобы обновить поля.'],
    };
    const checks = Object.entries(idx).map(([key, ids]) => {
        const w = wilson(ids.length, nTotal);
        return { key, label: LABELS[key][0], level: LABELS[key][1], hint: LABELS[key][2], count: ids.length, share: w.p, lo: w.lo, hi: w.hi };
    });
    // Индекс полноты (0..100): доля записей с ИНН (верным), вопросом, контактом и датой
    let complete = 0;
    const bad = new Set([...idx.innInvalid, ...idx.noInn, ...idx.emptyQuestion, ...idx.noContacts, ...idx.noAppealDate]);
    for (const r of list) if (!bad.has(r.id)) complete++;
    const fieldFill = {
        inn: nTotal ? 1 - idx.noInn.length / nTotal : 0,
        innValid: nTotal ? 1 - (idx.noInn.length + idx.innInvalid.length) / nTotal : 0,
        kpp: nTotal ? list.filter((r) => r.kpp).length / nTotal : 0,
        phone: nTotal ? list.filter((r) => r.phones && r.phones.length).length / nTotal : 0,
        email: nTotal ? list.filter((r) => r.emails && r.emails.length).length / nTotal : 0,
        question: nTotal ? 1 - idx.emptyQuestion.length / nTotal : 0,
        date: nTotal ? 1 - idx.noAppealDate.length / nTotal : 0,
    };
    return { checks, completeness: nTotal ? complete / nTotal : 0, fieldFill, index: idx, clientsWithInn: innCounts.size };
}

// ---------------------------------------------------------------------------
// Ряды
// ---------------------------------------------------------------------------
function computeTimeSeries(recInfo, minDay, maxDay) {
    const out = { daily: [], weekly: [], monthly: [], weekday: new Array(7).fill(0), hourly: new Array(24).fill(0), heat: Array.from({ length: 7 }, () => new Array(24).fill(0)), hasTime: false, insufficient: true };
    if (minDay == null) return out;
    // слишком длинный ряд (ошибочные даты 2000 г.) — ограничиваем последними 3 годами
    const from = Math.max(minDay, maxDay - 3 * 366);
    const len = maxDay - from + 1;
    const counts = new Array(len).fill(0);
    let withTime = 0;
    for (const x of recInfo) {
        if (x.day == null || x.day < from) continue;
        counts[x.day - from]++;
        const wd = (new Date(x.day * DAY_MS).getUTCDay() + 6) % 7;
        out.weekday[wd]++;
        if (x.time) {
            const h = Number(x.time.slice(0, 2));
            if (h >= 0 && h < 24) {
                out.hourly[h]++;
                out.heat[wd][h]++;
                withTime++;
            }
        }
    }
    out.hasTime = withTime >= 20;
    out.withTime = withTime;
    const ma7 = movingAverage(counts, 7);
    const z = robustZ(counts);
    out.daily = counts.map((c, i) => ({ date: dayNumToYmd(from + i), count: c, ma7: ma7[i], z: z[i] }));
    // всплески: робастный z > 3.5 и минимум 5 обращений (иначе «всплеск» из 2 записей)
    out.anomalies = out.daily.filter((d) => d.z > 3.5 && d.count >= 5).sort((a, b) => b.z - a.z).slice(0, 15);
    // недели (пн — вс)
    const weekMap = new Map();
    for (let i = 0; i < len; i++) {
        const dn = from + i;
        const wd = (new Date(dn * DAY_MS).getUTCDay() + 6) % 7;
        const wk = dn - wd;
        weekMap.set(wk, (weekMap.get(wk) || 0) + counts[i]);
    }
    // неполные крайние недели помечаются и не участвуют в тесте тренда (иначе ложное «снижение»)
    out.weekly = [...weekMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([wk, c]) => ({ week: dayNumToYmd(wk), count: c, partial: wk < from || wk + 6 > maxDay }));
    const monthMap = new Map();
    for (let i = 0; i < len; i++) {
        const ym = dayNumToYmd(from + i).slice(0, 7);
        monthMap.set(ym, (monthMap.get(ym) || 0) + counts[i]);
    }
    out.monthly = [...monthMap.entries()].map(([month, count]) => ({ month, count }));
    const fullWeeks = out.weekly.filter((w) => !w.partial);
    const byWeeks = fullWeeks.length >= 8;
    const series = byWeeks ? fullWeeks.map((w) => w.count) : counts;
    out.trend = { ...mannKendall(series), basis: byWeeks ? 'полные недели' : 'дни', points: series.length };
    const reg = linearRegression(series.map((_, i) => i), series);
    out.trend.olsSlope = reg.b;
    out.trend.r2 = reg.r2;
    out.changePoint = (() => {
        const cp = cusumChangePoint(series);
        if (!cp) return null;
        const label = byWeeks ? fullWeeks[cp.index + 1]?.week : out.daily[cp.index + 1]?.date;
        return { ...cp, at: label || null };
    })();
    out.weekdayTest = chiSquareUniform(out.weekday.slice(0, 5)); // будни (выходные — отдельный режим)
    out.dispersion = dispersionIndex(counts);
    out.acf7 = autocorrelation(counts, 7);
    const ew = ewma(counts, 0.25);
    out.level = ew.length ? ew[ew.length - 1] : 0; // текущий сглаженный уровень, обращений/день
    out.insufficient = len < 14;
    out.from = dayNumToYmd(from);
    out.to = dayNumToYmd(maxDay);
    return out;
}

// ---------------------------------------------------------------------------
// Клиенты
// ---------------------------------------------------------------------------
function computeClients(list, recInfo, innCounts, innRecs, blacklistInns) {
    const values = [...innCounts.values()];
    const repeatBuckets = [
        { label: '1', min: 1, max: 1 },
        { label: '2', min: 2, max: 2 },
        { label: '3', min: 3, max: 3 },
        { label: '4–5', min: 4, max: 5 },
        { label: '6–9', min: 6, max: 9 },
        { label: '10–19', min: 10, max: 19 },
        { label: '20+', min: 20, max: Infinity },
    ].map((b) => ({ ...b, clients: values.filter((v) => v >= b.min && v <= b.max).length }));

    // интервалы между соседними обращениями одного клиента (дни)
    const gaps = [];
    const sameDayRepeats = { count: 0 };
    for (const idxs of innRecs.values()) {
        if (idxs.length < 2) continue;
        const ds = idxs.map((i) => recInfo[i].day).filter((d) => d != null).sort((a, b) => a - b);
        for (let k = 1; k < ds.length; k++) {
            const g = ds[k] - ds[k - 1];
            gaps.push(g);
            if (g === 0) sameDayRepeats.count++;
        }
    }
    const returnWithin = (d) => (gaps.length ? gaps.filter((g) => g <= d).length / gaps.length : 0);

    const kinds = { ЮЛ: 0, 'ФЛ/ИП': 0 };
    const regions = new Map();
    const kppRegions = new Map();
    const reasons = new Map();
    for (const inn of innCounts.keys()) {
        const di = describeInn(inn);
        if (!di) continue;
        kinds[di.kind]++;
        const rk = di.region || `код ${di.regionCode}`;
        regions.set(rk, (regions.get(rk) || 0) + 1);
    }
    const kppByInn = new Map();
    for (const r of list) {
        const inn = String(r.inn || '').replace(/\D/g, '');
        if (r.kpp && /^\d{9}$/.test(r.kpp) && inn) kppByInn.set(inn, r.kpp);
    }
    for (const kpp of kppByInn.values()) {
        const rs = kppReason(kpp);
        if (rs) reasons.set(rs.label, (reasons.get(rs.label) || 0) + 1);
        const reg = regionByCode(kpp.slice(0, 2)) || `код ${kpp.slice(0, 2)}`;
        kppRegions.set(reg, (kppRegions.get(reg) || 0) + 1);
    }

    const bl = new Set(blacklistInns.map((x) => String(x).replace(/\D/g, '')));
    const top = [...innCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([inn, c]) => {
            const idxs = innRecs.get(inn) || [];
            const ds = idxs.map((i) => recInfo[i].day).filter((d) => d != null);
            const tcount = new Map();
            for (const i of idxs) for (const t of recInfo[i].topics) tcount.set(t, (tcount.get(t) || 0) + 1);
            const topT = [...tcount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => TOPIC_LABELS[t]);
            const di = describeInn(inn);
            return {
                inn,
                count: c,
                first: ds.length ? dayNumToYmd(Math.min(...ds)) : null,
                last: ds.length ? dayNumToYmd(Math.max(...ds)) : null,
                topics: topT,
                kind: di ? di.kind : '',
                region: di ? di.region : null,
                valid: innConfidence(inn) === 'high',
                blacklisted: bl.has(inn),
                urgent: idxs.filter((i) => recInfo[i].urgency >= 2).length,
            };
        });

    // граф «клиент — телефон/почта»: компоненты связности (одни и те же контакты у разных ИНН)
    const innList = [...innCounts.keys()];
    const innPos = new Map(innList.map((x, i) => [x, i]));
    const contactOwners = new Map();
    for (const r of list) {
        const inn = String(r.inn || '').replace(/\D/g, '');
        if (!innPos.has(inn)) continue;
        for (const p of r.phones || []) {
            const k = `т:${p}`;
            if (!contactOwners.has(k)) contactOwners.set(k, new Set());
            contactOwners.get(k).add(inn);
        }
        for (const e of r.emails || []) {
            const k = `e:${String(e).toLowerCase()}`;
            if (!contactOwners.has(k)) contactOwners.set(k, new Set());
            contactOwners.get(k).add(inn);
        }
    }
    const uf = new UnionFind(innList.length);
    const hubContacts = [];
    for (const [k, owners] of contactOwners) {
        if (owners.size < 2) continue;
        // контакт у 30+ клиентов — это, скорее всего, номер самой поддержки/бухфирмы-гиганта: не склеиваем
        if (owners.size >= 30) {
            hubContacts.push({ contact: k.slice(2), kind: k[0] === 'т' ? 'phone' : 'email', clients: owners.size });
            continue;
        }
        const arr = [...owners];
        for (let i = 1; i < arr.length; i++) uf.union(innPos.get(arr[0]), innPos.get(arr[i]));
    }
    const comps = new Map();
    for (let i = 0; i < innList.length; i++) {
        const root = uf.find(i);
        if (!comps.has(root)) comps.set(root, []);
        comps.get(root).push(innList[i]);
    }
    const linkedGroups = [...comps.values()]
        .filter((g) => g.length > 1)
        .sort((a, b) => b.length - a.length)
        .slice(0, 30)
        .map((inns) => {
            const shared = [];
            for (const [k, owners] of contactOwners) {
                if (owners.size >= 2 && owners.size < 30 && inns.some((x) => owners.has(x))) shared.push(k.slice(2));
                if (shared.length >= 5) break;
            }
            return { inns, size: inns.length, appeals: inns.reduce((s, x) => s + (innCounts.get(x) || 0), 0), shared };
        });

    return {
        total: innCounts.size,
        gini: gini(values),
        lorenz: lorenz(values, 51),
        hhi: hhi(values),
        top1pctShare: topShare(values, 0.01),
        top10pctShare: topShare(values, 0.1),
        top20pctShare: topShare(values, 0.2),
        repeatBuckets,
        gaps: describe(gaps),
        gapsCount: gaps.length,
        returnWithin7: returnWithin(7),
        returnWithin30: returnWithin(30),
        sameDayRepeats: sameDayRepeats.count,
        kinds,
        regions: [...regions.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
        kppRegions: [...kppRegions.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
        kppReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
        top,
        linkedGroups,
        linkedClients: linkedGroups.reduce((s, g) => s + g.size, 0),
        hubContacts: hubContacts.sort((a, b) => b.clients - a.clients).slice(0, 10),
    };
}

// ---------------------------------------------------------------------------
// Темы
// ---------------------------------------------------------------------------
function computeTopics(recInfo, topicIndex, intentIndex, topicCo, maxDay, n, urgentIds, negativeIds) {
    const recentFrom = maxDay != null ? maxDay - 29 : null;
    const prevFrom = maxDay != null ? maxDay - 59 : null;
    const byId = new Map(recInfo.map((x) => [x.id, x]));
    let recentN = 0;
    let prevN = 0;
    for (const x of recInfo) {
        if (x.day == null || recentFrom == null) continue;
        if (x.day >= recentFrom) recentN++;
        else if (x.day >= prevFrom) prevN++;
    }
    const list = TOPICS.map((t) => {
        const ids = topicIndex[t.id];
        let rec = 0;
        let prev = 0;
        for (const id of ids) {
            const x = byId.get(id);
            if (!x || x.day == null || recentFrom == null) continue;
            if (x.day >= recentFrom) rec++;
            else if (x.day >= prevFrom) prev++;
        }
        const w = wilson(ids.length, n);
        // изменение доли темы: последние 30 дней против предыдущих 30, в процентных пунктах
        const shareRecent = recentN ? rec / recentN : 0;
        const sharePrev = prevN ? prev / prevN : 0;
        const g2 = rec + prev >= 5 ? logLikelihoodG2(rec, prev, recentN || 1, prevN || 1) : 0;
        return { id: t.id, label: t.label, count: ids.length, share: w.p, lo: w.lo, hi: w.hi, recent: rec, prev, shareRecent, sharePrev, deltaPp: (shareRecent - sharePrev) * 100, g2, significant: Math.abs(g2) > 3.84 && recentN >= 20 && prevN >= 20 };
    }).sort((a, b) => b.count - a.count);
    const untagged = recInfo.filter((x) => !x.topics.length).length;
    const intents = [...INTENTS.map((t) => t.id), 'other']
        .map((id) => ({ id, label: INTENT_LABELS[id], count: intentIndex[id].length, share: n ? intentIndex[id].length / n : 0 }))
        .sort((a, b) => b.count - a.count);
    const urgencyDist = [0, 0, 0, 0, 0];
    for (const x of recInfo) urgencyDist[Math.min(4, x.urgency)]++;
    // матрица совместной встречаемости тем → коэффициент Жаккара пары
    const co = [];
    for (let a = 0; a < TOPICS.length; a++) {
        for (let b = a + 1; b < TOPICS.length; b++) {
            const inter = topicCo[a][b];
            if (inter < 3) continue;
            const union = topicCo[a][a] + topicCo[b][b] - inter;
            co.push({ a: TOPICS[a].label, b: TOPICS[b].label, aId: TOPICS[a].id, bId: TOPICS[b].id, count: inter, jaccard: union ? inter / union : 0 });
        }
    }
    co.sort((x, y) => y.jaccard - x.jaccard);
    const matrix = TOPICS.map((t, a) => TOPICS.map((_, b) => topicCo[a][b]));
    return {
        list,
        untagged,
        untaggedShare: n ? untagged / n : 0,
        intents,
        urgencyDist,
        urgent: urgentIds.length,
        negative: negativeIds.length,
        cooccurrence: co.slice(0, 20),
        matrix,
        matrixLabels: TOPICS.map((t) => t.label),
        recentN,
        prevN,
        diversity: normalizedEntropy(list.map((t) => t.count)),
    };
}

// ---------------------------------------------------------------------------
// Кластеры
// ---------------------------------------------------------------------------
function computeClusters(list, docStems, df, n, displayForm, seed) {
    const res = { k: 0, silhouette: 0, list: [], insufficient: true, vocabulary: 0, candidates: [] };
    if (n < 30) return res;
    // словарь признаков: слова из ≥ 3 записей и ≤ 30% записей, не более 1500
    const vocab = [...df.entries()]
        .filter(([, d]) => d >= Math.min(3, Math.max(2, Math.floor(n / 500))) && d / n <= 0.3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1500)
        .map(([st]) => st);
    if (vocab.length < 10) return res;
    const pos = new Map(vocab.map((st, i) => [st, i]));
    const vecs = [];
    const vecOwner = [];
    for (let i = 0; i < n; i++) {
        const idx = [];
        for (const st of docStems[i]) {
            const p = pos.get(st);
            if (p != null) idx.push(p);
        }
        if (idx.length < 2) continue;
        idx.sort((a, b) => a - b);
        const val = new Float64Array(idx.length);
        for (let k = 0; k < idx.length; k++) val[k] = Math.log((n + 1) / (df.get(vocab[idx[k]]) + 1)) + 1; // бинарный TF × IDF
        vecs.push(normalizeSparse(Int32Array.from(idx), val));
        vecOwner.push(i);
    }
    if (vecs.length < 30) return res;
    // выбор k по силуэту на выборке (детерминированно)
    const sampleN = Math.min(vecs.length, 3000);
    const stride = vecs.length / sampleN;
    const sample = [];
    for (let s = 0; s < sampleN; s++) sample.push(vecs[Math.floor(s * stride)]);
    const kMax = Math.min(16, Math.max(3, Math.floor(Math.sqrt(vecs.length / 4))));
    const ks = [];
    for (let k = 3; k <= kMax; k += k < 8 ? 1 : 2) ks.push(k);
    let best = null;
    for (const k of ks) {
        const km = sphericalKMeans(sample, vocab.length, k, { iters: 15, seed });
        const sil = silhouetteSample(sample, km.assign, k, 350);
        res.candidates.push({ k, silhouette: sil });
        // небольшой штраф за число кластеров, чтобы не дробить без нужды
        const score = sil - 0.004 * k;
        if (!best || score > best.score) best = { k, sil, score };
    }
    const k = best.k;
    // обучение на выборке до 20 000, затем отнесение всех записей к ближайшему центру
    const trainN = Math.min(vecs.length, 20000);
    const tStride = vecs.length / trainN;
    const train = [];
    for (let s = 0; s < trainN; s++) train.push(vecs[Math.floor(s * tStride)]);
    const km = sphericalKMeans(train, vocab.length, k, { iters: 30, seed });
    const assignById = {};
    const members = Array.from({ length: k }, () => []);
    const simSum = new Float64Array(k);
    for (let v = 0; v < vecs.length; v++) {
        let bc = 0;
        let bs = -Infinity;
        for (let c = 0; c < k; c++) {
            const cen = km.centroids[c];
            let s = 0;
            const vec = vecs[v];
            for (let t = 0; t < vec.idx.length; t++) s += vec.val[t] * cen[vec.idx[t]];
            if (s > bs) [bs, bc] = [s, c];
        }
        const rid = list[vecOwner[v]].id;
        assignById[rid] = bc;
        members[bc].push({ id: rid, sim: bs });
        simSum[bc] += bs;
    }
    res.k = k;
    res.silhouette = best.sil;
    res.vocabulary = vocab.length;
    res.clustered = vecs.length;
    res.unclustered = n - vecs.length;
    res.iterations = km.iterations;
    res.list = members
        .map((m, c) => {
            const cen = km.centroids[c];
            const terms = [...cen.keys()]
                .map((d) => [d, cen[d]])
                .filter((e) => e[1] > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([d, w]) => ({ word: displayForm(vocab[d]), stem: vocab[d], weight: w }));
            const sorted = m.slice().sort((a, b) => b.sim - a.sim);
            return {
                id: c,
                size: m.length,
                share: n ? m.length / n : 0,
                cohesion: m.length ? simSum[c] / m.length : 0,
                terms,
                label: terms.slice(0, 3).map((t) => t.word).join(' · '),
                sampleIds: sorted.slice(0, 5).map((x) => x.id),
                ids: sorted.map((x) => x.id),
            };
        })
        .filter((c) => c.size > 0)
        .sort((a, b) => b.size - a.size);
    res.assignById = assignById;
    res.insufficient = false;
    return res;
}

// ---------------------------------------------------------------------------
// Дубликаты и шаблонные вопросы
// ---------------------------------------------------------------------------
function computeDuplicates(list, docTokens) {
    const n = list.length;
    const innById = new Map(list.map((r) => [r.id, r.inn]));
    // 1) точные повторы текста (после нормализации) — «шаблонные» вопросы
    const exact = new Map();
    for (let i = 0; i < n; i++) {
        const key = docTokens[i].join(' ');
        if (!key) continue;
        if (!exact.has(key)) exact.set(key, []);
        exact.get(key).push(i);
    }
    const templates = [...exact.values()]
        .filter((g) => g.length >= 3)
        .sort((a, b) => b.length - a.length)
        .slice(0, 25)
        .map((g) => ({ count: g.length, text: String(list[g[0]].question || '').slice(0, 240), ids: g.map((i) => list[i].id), clients: new Set(g.map((i) => list[i].inn).filter(Boolean)).size }));
    // 2) почти-дубликаты: MinHash по биграммам стеммов, 16 полос × 4 строки (порог S-кривой ≈ 0.5),
    //    проверка кандидатов точным Жаккаром ≥ 0.6. Представители точных групп — по одному.
    const reps = [];
    for (const g of exact.values()) if (docTokens[g[0]].length >= 4) reps.push(g[0]);
    const shingleSets = reps.map((i) => new Set(wordShingles(docTokens[i], 2)));
    const sigs = shingleSets.map((s) => minhashSignature([...s], 64, 11));
    const pairs = lshCandidatePairs(sigs, 16, 4, 150);
    const uf = new UnionFind(reps.length);
    let verified = 0;
    for (const [a, b] of pairs) {
        const A = shingleSets[a];
        const Bs = shingleSets[b];
        let inter = 0;
        for (const x of A) if (Bs.has(x)) inter++;
        const j = inter / (A.size + Bs.size - inter);
        if (j >= 0.6) {
            uf.union(a, b);
            verified++;
        }
    }
    const groups = new Map();
    for (let r = 0; r < reps.length; r++) {
        const root = uf.find(r);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(r);
    }
    const nearGroups = [...groups.values()]
        .filter((g) => g.length >= 2)
        .map((g) => {
            const ids = [];
            for (const r of g) {
                const key = docTokens[reps[r]].join(' ');
                for (const i of exact.get(key)) ids.push(list[i].id);
            }
            return { variants: g.length, count: ids.length, text: String(list[reps[g[0]]].question || '').slice(0, 240), ids, clients: new Set(ids.map((id) => innById.get(id)).filter(Boolean)).size };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 25);
    return {
        uniqueTexts: exact.size,
        repeatedTextsShare: n ? 1 - exact.size / n : 0,
        templates,
        nearGroups,
        candidatePairs: pairs.length,
        verifiedPairs: verified,
        method: 'MinHash 64 × LSH 16×4, проверка Жаккара ≥ 0.6 по биграммам основ',
    };
}

// ---------------------------------------------------------------------------
// Опечатки и «новые» слова
// ---------------------------------------------------------------------------
function findTypoCandidates(surfaceByStem, tf) {
    const wordFreq = new Map();
    for (const sm of surfaceByStem.values()) for (const [w, c] of sm) wordFreq.set(w, (wordFreq.get(w) || 0) + c);
    const frequent = [...wordFreq.entries()].filter(([w, c]) => c >= 15 && w.length >= 5 && /^[а-я]+$/.test(w));
    const buckets = new Map();
    for (const [w, c] of frequent) {
        const key = w.slice(0, 1);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push([w, c]);
    }
    const out = [];
    let checked = 0;
    for (const [w, c] of wordFreq) {
        if (c > 2 || w.length < 5 || !/^[а-я]+$/.test(w)) continue;
        if (checked++ > 4000) break;
        const cand = buckets.get(w.slice(0, 1)) || [];
        let best = null;
        for (const [fw, fc] of cand) {
            if (Math.abs(fw.length - w.length) > 1 || fw === w) continue;
            if (editDistance(w, fw, 1) <= 1 && (!best || fc > best[1])) best = [fw, fc];
        }
        if (best && best[1] >= 10 * c) out.push({ word: w, count: c, likely: best[0], likelyCount: best[1] });
    }
    void tf;
    return out.sort((a, b) => b.likelyCount - a.likelyCount).slice(0, 40);
}

function computeEmergingTerms(docTokens, recInfo, maxDay, displayForm) {
    const res = { rising: [], falling: [], window: 30, insufficient: true };
    if (maxDay == null) return res;
    const from = maxDay - 29;
    const a = new Map();
    const b = new Map();
    let ta = 0;
    let tb = 0;
    for (let i = 0; i < docTokens.length; i++) {
        const d = recInfo[i].day;
        if (d == null) continue;
        const target = d >= from ? a : b;
        for (const st of docTokens[i]) target.set(st, (target.get(st) || 0) + 1);
        if (d >= from) ta += docTokens[i].length;
        else tb += docTokens[i].length;
    }
    if (ta < 200 || tb < 200) return res;
    const keys = new Set([...a.keys(), ...b.keys()]);
    const scored = [];
    for (const k of keys) {
        const fa = a.get(k) || 0;
        const fb = b.get(k) || 0;
        if (fa + fb < 6) continue;
        const g = logLikelihoodG2(fa, fb, ta, tb);
        scored.push({ stem: k, word: displayForm(k), recent: fa, before: fb, g2: g, ratio: (fa / ta + 1e-9) / (fb / tb + 1e-9) });
    }
    res.rising = scored.filter((s) => s.g2 > 10.83).sort((x, y) => y.g2 - x.g2).slice(0, 20);
    res.falling = scored.filter((s) => s.g2 < -10.83).sort((x, y) => x.g2 - y.g2).slice(0, 12);
    res.insufficient = false;
    res.recentTokens = ta;
    res.beforeTokens = tb;
    return res;
}

// ---------------------------------------------------------------------------
// Профиль клиента (для истории по ИНН)
// ---------------------------------------------------------------------------
/**
 * @param {object[]} records обращения одного клиента
 */
export function computeClientProfile(records) {
    const recs = (records || []).filter(Boolean);
    const days = [];
    const topicCount = new Map();
    const intentCount = new Map();
    let urgent = 0;
    const months = new Map();
    for (const r of recs) {
        const ed = effectiveDate(r);
        if (ed.ymd) {
            days.push(ymdToDayNum(ed.ymd));
            const ym = ed.ymd.slice(0, 7);
            months.set(ym, (months.get(ym) || 0) + 1);
        }
        const c = classifyText(r.question || '');
        for (const t of c.topics) topicCount.set(t, (topicCount.get(t) || 0) + 1);
        intentCount.set(c.intent, (intentCount.get(c.intent) || 0) + 1);
        if (c.urgency >= 2) urgent++;
    }
    days.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
    const monthKeys = [...months.keys()].sort();
    const series = [];
    if (monthKeys.length) {
        let [y, m] = monthKeys[0].split('-').map(Number);
        const [ly, lm] = monthKeys[monthKeys.length - 1].split('-').map(Number);
        while (y < ly || (y === ly && m <= lm)) {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            series.push({ month: key, count: months.get(key) || 0 });
            m++;
            if (m > 12) {
                m = 1;
                y++;
            }
            if (series.length > 120) break;
        }
    }
    return {
        count: recs.length,
        first: days.length ? dayNumToYmd(days[0]) : null,
        last: days.length ? dayNumToYmd(days[days.length - 1]) : null,
        gaps: describe(gaps),
        topics: [...topicCount.entries()].sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ id, label: TOPIC_LABELS[id], count: c })),
        intents: [...intentCount.entries()].sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ id, label: INTENT_LABELS[id], count: c })),
        urgent,
        monthly: series,
    };
}

// ---------------------------------------------------------------------------
// «Рентген» записи: каждое слово и символ
// ---------------------------------------------------------------------------
/**
 * Подробный разбор одной записи: токены с основами, стоп-слова, смешанная письменность, классы
 * символов, темы/намерение/срочность, IDF слов относительно базы (если передан df).
 * @param {object} rec
 * @param {{ df?: Record<string, number>, n?: number }} [ctx]
 */
export function xrayRecord(rec, ctx = {}) {
    const q = String((rec && rec.question) || '');
    const tokens = tokenizeDetailed(q);
    const cls = classifyText(q);
    const chars = { cyr: 0, lat: 0, digit: 0, space: 0, punct: 0, other: 0 };
    countChars(q, chars, null);
    const content = tokens.filter((t) => !t.stop && !t.numeric);
    const n = ctx.n || 0;
    const weights = content.map((t) => {
        const d = ctx.df && ctx.df[t.stem];
        return { ...t, idf: n && d ? Math.log((n + 1) / (d + 1)) + 1 : null };
    });
    return {
        tokens: tokens.map((t) => ({ ...t, idf: weights.find((w) => w.start === t.start)?.idf ?? null })),
        chars,
        length: q.length,
        words: tokens.filter((t) => !t.numeric).length,
        contentWords: content.length,
        stopWords: tokens.filter((t) => t.stop).length,
        sentences: splitSentences(q).length,
        classification: { ...cls, topicLabels: cls.topics.map((t) => TOPIC_LABELS[t]), intentLabel: INTENT_LABELS[cls.intent] },
        date: effectiveDate(rec),
        inn: rec && rec.inn ? { ...describeInn(rec.inn), valid: innConfidence(rec.inn) === 'high' } : null,
        kpp: rec && rec.kpp ? { reason: kppReason(rec.kpp), region: regionByCode(rec.kpp.slice(0, 2)) } : null,
    };
}
