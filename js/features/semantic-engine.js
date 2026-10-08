'use strict';

/**
 * Семантический поисковый движок (офлайн, без нейросетей и внешних сервисов).
 *
 * Что делает сверх обычного поиска по подстроке:
 *  1. BM25F: редкие слова весят больше частых, заголовок — больше описания, длинные тексты не доминируют.
 *  2. Расширение запроса «по смыслу» тремя слоями:
 *       • предметный тезаурус (domain-thesaurus.js): синонимы, жаргон, транслит, устойчивые фразы;
 *       • слабые связи по теме (подпись → токен, КриптоПро);
 *       • ассоциации, ВЫУЧЕННЫЕ на текстах самого пользователя (PPMI по совместной встречаемости
 *         слов в записях): если в его базе «Рутокен» постоянно встречается рядом с «драйвер»,
 *         запрос «рутокен» найдёт и записи про драйвер.
 *  3. Словоформы (стемминг), начало слова («сертиф»), опечатки (Дамерау — Левенштейн),
 *     неверная раскладка («cthnbabrfn»).
 *  4. Фразы в кавычках "…", исключения -слово, бонус за близость слов друг к другу.
 *  5. Объяснение результата («подпись ≈ сертификат», «по контексту: драйвер») и подсказка
 *     «Возможно, вы искали …» при опечатке.
 *
 * Это честная классическая семантика (словарь + статистика корпуса), а не языковая модель:
 * она не «понимает» смысл вне словаря и текстов пользователя, зато быстрая, объяснимая и работает офлайн.
 */

import { prepareText, editDistance, fixKeyboardLayout } from './search-text-utils.js';
import {
    isThesaurusKey,
    relatedUnitsForKey,
    weakUnitsForKey,
    thesaurusMaxPhraseLen,
} from './domain-thesaurus.js';
import { stemWord, normalizeTextForIndex } from './search-normalize.js';

const K1 = 1.2;
const B = 0.55;

const W = {
    exact: 1,
    prefix: 0.8,
    synonym: 0.62,
    context: 0.5,
    typo: 0.5,
    topic: 0.3,
};

/** Слова, которые сами по себе ничего не ищут (но «не»/«нет»/«без» сохраняются как отрицание). */
const QUERY_STOP = new Set([
    'и', 'в', 'во', 'на', 'по', 'с', 'со', 'к', 'ко', 'для', 'при', 'из', 'у', 'о', 'об', 'от',
    'до', 'за', 'как', 'что', 'это', 'или', 'а', 'но', 'же', 'бы', 'ли', 'то', 'там', 'уже', 'ни',
]);
const NEGATIONS = new Set(['не', 'нет', 'без']);

const KIND_LABEL = {
    synonym: 'синоним',
    context: 'по контексту',
    typo: 'исправлена опечатка',
    topic: 'по теме',
    layout: 'исправлена раскладка',
    prefix: 'начало слова',
};

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------
function fnv(str, h = 0x811c9dc5) {
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function normField(f) {
    if (typeof f === 'string') return { text: f, weight: 1 };
    return { text: String((f && f.text) || ''), weight: (f && f.weight) || 1 };
}

const isNumeric = (s) => /^\d+$/.test(s);

// ---------------------------------------------------------------------------
// Разбор запроса
// ---------------------------------------------------------------------------
/**
 * @param {string} query
 * @returns {{ words: string[], phrases: string[][], excludes: string[] }}
 */
export function parseQuery(query) {
    let q = typeof query === 'string' ? query : '';
    const phrases = [];
    q = q.replace(/["«“]([^"»”]+)["»”]/g, (_, inner) => {
        const st = prepareText(inner).stems.filter(Boolean);
        if (st.length) phrases.push(st);
        return ' ' + inner + ' ';
    });
    const excludes = [];
    q = q.replace(/(^|\s)-([\p{L}\d][\p{L}\d-]*)/gu, (_, sp, w) => {
        const st = prepareText(w).stems.filter(Boolean);
        for (const s of st) excludes.push(s);
        return sp;
    });
    const norm = normalizeTextForIndex(q);
    const words = norm ? norm.split(/[\s\-_]+/).filter(Boolean) : [];
    return { words, phrases, excludes };
}

// ---------------------------------------------------------------------------
// Индекс
// ---------------------------------------------------------------------------
export class SemanticIndex {
    /**
     * @param {Array<{id:any, fields:Array<string|{text:string,weight?:number}>}>} docs
     * @param {{ learn?: boolean, maxLearnDocs?: number }} [opts]
     */
    constructor(docs, opts = {}) {
        this.opts = { learn: true, maxLearnDocs: 4000, ...opts };
        this.docs = [];
        this.df = new Map();
        /** stem → Map(docIdx → взвешенная частота) */
        this.post = new Map();
        /** stem → слово для показа */
        this.display = new Map();
        this.totalLen = 0;
        this.assocBuilt = false;
        this.assoc = new Map();
        this._vocab = null;
        this._byLen = null;

        for (let di = 0; di < docs.length; di++) {
            const d = docs[di];
            const fields = (d.fields || []).map(normField);
            const prepFields = [];
            const tf = new Map();
            let len = 0;
            for (const f of fields) {
                const p = prepareText(f.text);
                const stems = p.stems;
                prepFields.push({ stems, w: f.weight, norm: p.norm });
                len += stems.length;
                for (let i = 0; i < stems.length; i++) {
                    const st = stems[i];
                    if (!st || st.length < 1) continue;
                    tf.set(st, (tf.get(st) || 0) + f.weight);
                    if (!this.display.has(st)) this.display.set(st, p.words[i]);
                }
            }
            for (const [st, v] of tf) {
                let m = this.post.get(st);
                if (!m) {
                    m = new Map();
                    this.post.set(st, m);
                }
                m.set(di, v);
                this.df.set(st, (this.df.get(st) || 0) + 1);
            }
            this.docs.push({ id: d.id, fields: prepFields, len: Math.max(1, len), tfKeys: tf });
            this.totalLen += Math.max(1, len);
        }
        this.N = this.docs.length;
        this.avgLen = this.N ? this.totalLen / this.N : 1;
    }

    idf(stem) {
        const df = this.df.get(stem) || 0;
        if (!df) return 0;
        return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
    }

    get vocab() {
        if (!this._vocab) this._vocab = Array.from(this.post.keys()).sort();
        return this._vocab;
    }

    get byLen() {
        if (!this._byLen) {
            this._byLen = new Map();
            for (const s of this.post.keys()) {
                const l = s.length;
                if (!this._byLen.has(l)) this._byLen.set(l, []);
                this._byLen.get(l).push(s);
            }
        }
        return this._byLen;
    }

    /** Слова словаря, начинающиеся с префикса (бинарный поиск по отсортированному словарю). */
    prefixStems(prefix, limit = 12) {
        const v = this.vocab;
        let lo = 0;
        let hi = v.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (v[mid] < prefix) lo = mid + 1;
            else hi = mid;
        }
        const out = [];
        for (let i = lo; i < v.length && v[i].startsWith(prefix) && out.length < limit * 3; i++) {
            if (v[i] !== prefix) out.push(v[i]);
        }
        out.sort((a, b) => (this.df.get(b) || 0) - (this.df.get(a) || 0));
        return out.slice(0, limit);
    }

    /** Ближайшие по написанию слова словаря (≤ maxDist правок). */
    fuzzyStems(stem, maxDist) {
        const out = [];
        for (let l = stem.length - maxDist; l <= stem.length + maxDist; l++) {
            const bucket = this.byLen.get(l);
            if (!bucket) continue;
            for (const s of bucket) {
                if (s === stem || isNumeric(s)) continue;
                const d = editDistance(stem, s, maxDist);
                if (d <= maxDist) out.push({ s, d });
            }
        }
        out.sort((a, b) => a.d - b.d || (this.df.get(b.s) || 0) - (this.df.get(a.s) || 0));
        return out.slice(0, 4);
    }

    // ---------------------------------------------------------------------
    // Выученные ассоциации (PPMI по совместной встречаемости в записях)
    // ---------------------------------------------------------------------
    ensureAssoc() {
        if (this.assocBuilt) return;
        this.assocBuilt = true;
        if (!this.opts.learn || this.N < 6 || this.N > this.opts.maxLearnDocs) return;
        const maxDf = Math.max(3, Math.floor(this.N * 0.35));
        const ids = new Map();
        const names = [];
        const idOf = (st) => {
            let v = ids.get(st);
            if (v === undefined) {
                v = names.length;
                ids.set(st, v);
                names.push(st);
            }
            return v;
        };
        const pair = new Map();
        for (const d of this.docs) {
            const cand = [];
            for (const st of d.tfKeys.keys()) {
                const df = this.df.get(st) || 0;
                if (df < 2 || df > maxDf || st.length < 3 || isNumeric(st)) continue;
                cand.push(st);
            }
            if (cand.length < 2) continue;
            cand.sort((a, b) => this.idf(b) - this.idf(a));
            const top = cand.slice(0, 28).map(idOf);
            for (let i = 0; i < top.length; i++) {
                for (let j = i + 1; j < top.length; j++) {
                    const a = Math.min(top[i], top[j]);
                    const b = Math.max(top[i], top[j]);
                    const k = a * 1048576 + b;
                    pair.set(k, (pair.get(k) || 0) + 1);
                }
            }
        }
        const nb = new Map();
        const add = (a, b, v) => {
            let l = nb.get(a);
            if (!l) {
                l = [];
                nb.set(a, l);
            }
            l.push({ s: b, v });
        };
        for (const [k, c] of pair) {
            if (c < 2) continue;
            const ia = Math.floor(k / 1048576);
            const ib = k % 1048576;
            const sa = names[ia];
            const sb = names[ib];
            const pmi = Math.log((c * this.N) / ((this.df.get(sa) || 1) * (this.df.get(sb) || 1)));
            if (pmi < 1) continue;
            const v = pmi * (c / (c + 1.5));
            add(sa, sb, v);
            add(sb, sa, v);
        }
        for (const [st, l] of nb) {
            l.sort((x, y) => y.v - x.v);
            this.assoc.set(st, l.slice(0, 6));
        }
    }

    /** Выученные соседи слова: [{ s, v }] (v ≈ 1…6). */
    neighbors(stem) {
        this.ensureAssoc();
        return this.assoc.get(stem) || [];
    }

    // ---------------------------------------------------------------------
    // Сегментация и кандидаты
    // ---------------------------------------------------------------------
    segment(words) {
        const stems = [];
        const disp = [];
        for (const w of words) {
            if (QUERY_STOP.has(w)) continue;
            const st = stemWord(w);
            if (!st) continue;
            stems.push(st);
            disp.push(w);
        }
        // если остались одни служебные слова — ищем по ним же
        if (!stems.length) {
            for (const w of words) {
                const st = stemWord(w);
                if (st) {
                    stems.push(st);
                    disp.push(w);
                }
            }
        }
        const terms = [];
        const maxLen = thesaurusMaxPhraseLen();
        let i = 0;
        while (i < stems.length) {
            let took = 0;
            for (let len = Math.min(maxLen, stems.length - i); len >= 2; len--) {
                const key = stems.slice(i, i + len).join(' ');
                if (isThesaurusKey(key)) {
                    terms.push({ key, stems: stems.slice(i, i + len), words: disp.slice(i, i + len) });
                    took = len;
                    break;
                }
            }
            if (!took) {
                if (NEGATIONS.has(stems[i]) && i + 1 < stems.length) {
                    terms.push({
                        key: stems[i] + ' ' + stems[i + 1],
                        stems: [stems[i], stems[i + 1]],
                        words: [disp[i], disp[i + 1]],
                        negation: true,
                    });
                    took = 2;
                } else if (NEGATIONS.has(stems[i]) && stems.length > 1) {
                    took = 1; // одинокая частица «не» — шум
                    i += took;
                    continue;
                } else {
                    terms.push({ key: stems[i], stems: [stems[i]], words: [disp[i]] });
                    took = 1;
                }
            }
            i += took;
        }
        return terms;
    }

    /** Единицы, которыми может быть «закрыт» термин запроса. */
    candidates(term) {
        const units = [];
        const seen = new Set();
        const present = (stems) => stems.every((s) => this.post.has(s));
        const push = (stems, weight, kind, label) => {
            const key = stems.join(' ');
            if (seen.has(key) || !present(stems)) return;
            seen.add(key);
            units.push({ stems, weight, kind, label: label || stems.map((s) => this.display.get(s) || s).join(' ') });
        };
        const single = term.stems.length === 1;
        // точное совпадение
        push(term.stems, W.exact, 'exact');
        if (term.negation) push([term.stems[1]], 0.7, 'exact');
        const mainStem = term.negation ? term.stems[1] : term.stems[0];
        // начало слова
        if (single && mainStem.length >= 3) {
            for (const p of this.prefixStems(mainStem, 10)) push([p], W.prefix, 'prefix');
        }
        // синонимы тезауруса
        for (const u of relatedUnitsForKey(term.key)) push(u.stems, W.synonym, 'synonym');
        for (const u of weakUnitsForKey(term.key)) push(u.stems, W.topic, 'topic');
        // выученные ассоциации
        if (single || term.negation) {
            for (const n of this.neighbors(mainStem)) {
                push([n.s], Math.min(W.context, 0.18 + n.v * 0.07), 'context');
            }
        }
        // опечатки: только если точного совпадения нет
        const hasExact = units.some((u) => u.kind === 'exact');
        if (!hasExact && mainStem.length >= 4 && !isNumeric(mainStem)) {
            const maxD = mainStem.length >= 8 ? 2 : 1;
            for (const f of this.fuzzyStems(mainStem, maxD)) {
                push([f.s], W.typo - 0.08 * (f.d - 1), 'typo');
            }
        }
        return units;
    }

    // ---------------------------------------------------------------------
    // Поиск
    // ---------------------------------------------------------------------
    _unitDocs(unit) {
        // документы, где есть все слова единицы; значение — оценка (вес × idf × насыщение tf)
        const out = new Map();
        const stems = unit.stems;
        let first = this.post.get(stems[0]);
        if (!first) return out;
        let anchor = first;
        let anchorStem = stems[0];
        for (const st of stems) {
            const p = this.post.get(st);
            if (!p) return out;
            if (p.size < anchor.size) {
                anchor = p;
                anchorStem = st;
            }
        }
        const idfAvg = stems.reduce((a, s) => a + this.idf(s), 0) / stems.length;
        for (const [di] of anchor) {
            let tfMin = Infinity;
            let ok = true;
            for (const st of stems) {
                const v = this.post.get(st).get(di);
                if (v === undefined) {
                    ok = false;
                    break;
                }
                if (v < tfMin) tfMin = v;
            }
            if (!ok) continue;
            const dl = this.docs[di].len;
            const tfn = tfMin / (1 - B + (B * dl) / this.avgLen);
            const sat = (tfn * (K1 + 1)) / (tfn + K1);
            out.set(di, unit.weight * idfAvg * sat);
        }
        void anchorStem;
        return out;
    }

    /**
     * @param {string} query
     * @param {{ limit?: number, boost?: (id:any)=>number, allowLayout?: boolean }} [opts]
     * @returns {{ hits: Array<{id:any, index:number, score:number, why:string[], kinds:string[], exact:boolean}>, soft: boolean, suggestion: string|null, terms: number }}
     */
    search(query, opts = {}) {
        const limit = opts.limit || 100;
        const parsed = parseQuery(query);
        const res = this._searchParsed(parsed, opts, '');
        let hits = res.hits;
        let suggestion = this.suggest(query, parsed);
        // неверная раскладка: пробуем исправленный запрос, если исходный почти ничего не дал
        if (opts.allowLayout !== false) {
            const fixed = fixKeyboardLayout(String(query || ''));
            if (fixed && (!hits.length || res.weak)) {
                const p2 = parseQuery(fixed);
                const r2 = this._searchParsed(p2, opts, 'layout');
                if (r2.hits.length > hits.length || (r2.hits[0] && (!hits[0] || r2.hits[0].score > hits[0].score))) {
                    hits = r2.hits;
                    suggestion = null;
                }
            }
        }
        if (opts.boost) {
            for (const h of hits) {
                const m = opts.boost(h.id);
                if (m && m > 0) h.score *= m;
            }
            hits.sort((a, b) => b.score - a.score || a.index - b.index);
        }
        return { hits: hits.slice(0, limit), soft: res.soft, suggestion, terms: res.terms };
    }

    _searchParsed(parsed, opts, tag) {
        const terms = this.segment(parsed.words);
        const phraseOnly = !terms.length && parsed.phrases.length;
        const usePhrases = parsed.phrases;
        if (!terms.length && !phraseOnly) return { hits: [], soft: false, weak: true, terms: 0 };

        // термины фраз добавляются как обязательные
        const allTerms = terms.slice();
        for (const ph of usePhrases) {
            if (ph.length) allTerms.push({ key: ph.join(' '), stems: ph, words: ph, phrase: true });
        }

        // по каждому термину: карта doc → { s, kind, label, unit }
        const perTerm = [];
        for (const t of allTerms) {
            const units = this.candidates(t);
            const m = new Map();
            for (const u of units) {
                const docs = this._unitDocs(u);
                for (const [di, s] of docs) {
                    const cur = m.get(di);
                    if (!cur) m.set(di, { s, kind: u.kind, label: u.label, unit: u, second: 0 });
                    else if (s > cur.s) {
                        cur.second = Math.max(cur.second, cur.s);
                        cur.s = s;
                        cur.kind = u.kind;
                        cur.label = u.label;
                        cur.unit = u;
                    } else cur.second = Math.max(cur.second, s);
                }
            }
            perTerm.push({ term: t, m, units });
        }

        const n = perTerm.length;
        const run = (mode) => {
            const acc = new Map();
            for (let ti = 0; ti < n; ti++) {
                for (const [di, v] of perTerm[ti].m) {
                    let a = acc.get(di);
                    if (!a) {
                        a = { score: 0, matched: 0, per: new Array(n).fill(null) };
                        acc.set(di, a);
                    }
                    a.score += v.s + 0.15 * v.second;
                    a.matched++;
                    a.per[ti] = v;
                }
            }
            const need = mode === 'all' ? n : Math.max(1, Math.ceil(n / 2));
            const out = [];
            for (const [di, a] of acc) {
                if (a.matched < need) continue;
                out.push({ di, a, score: mode === 'all' ? a.score : a.score * 0.6 });
            }
            return out;
        };
        let scored = run('all');
        let soft = false;
        if (!scored.length && n > 1) {
            scored = run('some');
            soft = scored.length > 0;
        }

        // исключения
        if (parsed.excludes.length) {
            scored = scored.filter((x) => {
                const d = this.docs[x.di];
                return !parsed.excludes.some((e) => d.tfKeys.has(e));
            });
        }
        // фразы в кавычках: слова подряд в одном поле
        if (usePhrases.length) {
            scored = scored.filter((x) => usePhrases.every((ph) => this._hasPhrase(this.docs[x.di], ph)));
        }

        // близость и точность заголовка
        const top = scored.sort((a, b) => b.score - a.score).slice(0, 300);
        const qStems = terms.flatMap((t) => t.stems);
        for (const x of top) {
            const d = this.docs[x.di];
            if (terms.length > 1) x.score += this._proximityBonus(d, perTerm, x);
            const f0 = d.fields[0];
            if (f0 && qStems.length && f0.stems.length) {
                const set = new Set(f0.stems);
                if (qStems.every((s) => set.has(s))) {
                    x.score *= f0.stems.length <= qStems.length + 1 ? 1.5 : 1.15;
                }
            }
        }
        top.sort((a, b) => b.score - a.score || a.di - b.di);

        const hits = top.map((x) => {
            const why = [];
            const kinds = new Set();
            let allExact = true;
            for (let ti = 0; ti < n; ti++) {
                const v = x.a.per[ti];
                if (!v) continue;
                kinds.add(v.kind);
                if (v.kind !== 'exact') {
                    allExact = false;
                    const label = KIND_LABEL[v.kind];
                    const src = perTerm[ti].term.words.join(' ');
                    if (v.kind === 'prefix') continue;
                    why.push(
                        v.kind === 'typo'
                            ? `${label}: «${src}» → «${v.label}»`
                            : `${label}: «${src}» → «${v.label}»`,
                    );
                }
            }
            if (tag === 'layout') why.unshift(KIND_LABEL.layout);
            return {
                id: this.docs[x.di].id,
                index: x.di,
                score: x.score,
                why: why.slice(0, 3),
                kinds: Array.from(kinds),
                exact: allExact && !soft,
            };
        });
        const weak = !hits.length || hits.every((h) => !h.exact);
        return { hits, soft, weak, terms: n };
    }

    _hasPhrase(doc, phraseStems) {
        for (const f of doc.fields) {
            const s = f.stems;
            if (s.length < phraseStems.length) continue;
            outer: for (let i = 0; i + phraseStems.length <= s.length; i++) {
                for (let j = 0; j < phraseStems.length; j++) if (s[i + j] !== phraseStems[j]) continue outer;
                return true;
            }
        }
        return false;
    }

    _proximityBonus(doc, perTerm, x) {
        let bonus = 0;
        for (let ti = 0; ti + 1 < perTerm.length; ti++) {
            const va = x.a.per[ti];
            const vb = x.a.per[ti + 1];
            if (!va || !vb) continue;
            const sa = new Set(va.unit.stems);
            const sb = new Set(vb.unit.stems);
            const w = Math.min(va.s, vb.s);
            let best = 0;
            for (const f of doc.fields) {
                const s = f.stems;
                let lastA = -100;
                for (let i = 0; i < s.length; i++) {
                    if (sa.has(s[i])) lastA = i;
                    if (sb.has(s[i]) && lastA >= 0) {
                        const dist = i - lastA;
                        if (dist === 1) best = Math.max(best, 0.35);
                        else if (dist > 0 && dist <= 4) best = Math.max(best, 0.15);
                    }
                    if (sb.has(s[i])) {
                        // обратный порядок рядом тоже считается
                        for (let k = Math.max(0, i - 4); k < i; k++) {
                            if (sa.has(s[k])) best = Math.max(best, i - k === 1 ? 0.25 : 0.1);
                        }
                    }
                }
            }
            bonus += best * w;
        }
        return bonus;
    }

    /**
     * Подсказка «Возможно, вы искали …»: заменяет слова запроса, которых нет в базе,
     * ближайшими по написанию словами базы. null — подсказка не нужна.
     */
    suggest(query, parsedArg) {
        const parsed = parsedArg || parseQuery(query);
        if (!parsed.words.length || !this.N) return null;
        let changed = false;
        const out = [];
        for (const w of parsed.words) {
            const st = stemWord(w);
            if (
                QUERY_STOP.has(w) ||
                NEGATIONS.has(w) ||
                !st ||
                w.length < 4 ||
                isNumeric(w) ||
                this.post.has(st) ||
                this.prefixStems(st, 1).length ||
                isThesaurusKey(st)
            ) {
                out.push(w);
                continue;
            }
            const maxD = st.length >= 8 ? 2 : 1;
            const f = this.fuzzyStems(st, maxD)[0];
            if (f) {
                out.push(this.display.get(f.s) || f.s);
                changed = true;
            } else out.push(w);
        }
        return changed ? out.join(' ') : null;
    }

    get size() {
        return this.N;
    }
}

// ---------------------------------------------------------------------------
// Кэш индексов по содержимому
// ---------------------------------------------------------------------------
const cache = new Map();
const CACHE_LIMIT = 8;

/** Подпись содержимого: меняется при любом изменении текстов/порядка записей. */
export function docsSignature(docs) {
    let h = 0x811c9dc5 ^ docs.length;
    for (const d of docs) {
        h = fnv(String(d.id), h);
        for (const f of d.fields || []) {
            const t = typeof f === 'string' ? f : (f && f.text) || '';
            h = fnv(t, h);
            h = fnv('|', h);
        }
        h = fnv('#', h);
    }
    return h;
}

/**
 * Индекс с кэшем: пока тексты не изменились, повторные запросы не перестраивают индекс.
 * @param {string} key имя корпуса ('bookmarks', 'favorites', 'global'…)
 */
export function getSemanticIndex(key, docs, opts) {
    const sig = docsSignature(docs);
    const hit = cache.get(key);
    if (hit && hit.sig === sig) return hit.index;
    const index = new SemanticIndex(docs, opts);
    cache.delete(key);
    cache.set(key, { sig, index });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return index;
}

export function clearSemanticCache(key) {
    if (key) cache.delete(key);
    else cache.clear();
}
