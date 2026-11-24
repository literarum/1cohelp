'use strict';

/**
 * Математический аппарат аналитики обращений (чистые функции, без DOM — работают и в Web Worker).
 *
 *  • описательная статистика: среднее, дисперсия (Велфорд), квантили (тип 7, как в R/Excel),
 *    асимметрия и эксцесс, медиана и MAD, робастный z-счёт (Иглевич — Хоглин, 0.6745·(x−M)/MAD);
 *  • интервалы: Уилсон для долей; гистограмма по правилу Фридмана — Диакониса;
 *  • неравенство: коэффициент Джини, кривая Лоренца, индекс Херфиндаля — Хиршмана, доля топ-N;
 *  • информация: энтропия Шеннона (бит), нормированная энтропия, перплексия;
 *  • ряды: скользящее среднее, EWMA, автокорреляция, индекс дисперсии (variance/mean, Пуассон = 1),
 *    тест Манна — Кендалла с поправкой на связки + наклон Тейла — Сена, CUSUM-точка изменения,
 *    χ²-тест равномерности (день недели), МНК-регрессия с R² и t-статистикой;
 *  • язык: логарифмическое правдоподобие Даннинга G², PMI / t-score коллокаций, закон Ципфа и Хипса;
 *  • векторы: косинус, сферический k-means с инициализацией k-means++ (детерминированный ГПСЧ),
 *    силуэт по выборке; MinHash + LSH (полосы) для поиска почти-дубликатов; система непересекающихся
 *    множеств (union–find) для связей клиентов через общие телефоны/почту.
 */

// ---------------------------------------------------------------------------
// ГПСЧ и хэши
// ---------------------------------------------------------------------------
/** Детерминированный ГПСЧ mulberry32: одинаковые данные → одинаковые кластеры при каждом запуске. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 32-битный FNV-1a. */
export function fnv1a(str, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// ---------------------------------------------------------------------------
// Описательная статистика
// ---------------------------------------------------------------------------
/** @param {number[]} xs */
export function sum(xs) {
    let s = 0;
    for (const x of xs) s += x;
    return s;
}

/** @param {number[]} xs */
export function mean(xs) {
    return xs.length ? sum(xs) / xs.length : 0;
}

/** Несмещённая дисперсия (алгоритм Велфорда — устойчив к большим значениям). */
export function variance(xs) {
    let n = 0;
    let m = 0;
    let s2 = 0;
    for (const x of xs) {
        n++;
        const d = x - m;
        m += d / n;
        s2 += d * (x - m);
    }
    return n > 1 ? s2 / (n - 1) : 0;
}

export function stdev(xs) {
    return Math.sqrt(variance(xs));
}

/** Квантиль по отсортированному массиву (тип 7, линейная интерполяция). */
export function quantileSorted(sorted, p) {
    const n = sorted.length;
    if (!n) return NaN;
    if (n === 1) return sorted[0];
    const h = (n - 1) * Math.min(1, Math.max(0, p));
    const lo = Math.floor(h);
    const hi = Math.min(n - 1, lo + 1);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function median(xs) {
    return quantileSorted([...xs].sort((a, b) => a - b), 0.5);
}

/** Медианное абсолютное отклонение (без масштабного множителя). */
export function mad(xs, med = median(xs)) {
    return median(xs.map((x) => Math.abs(x - med)));
}

/**
 * Сводка распределения.
 * @param {number[]} xs
 */
export function describe(xs) {
    const n = xs.length;
    if (!n) {
        return { n: 0, mean: 0, sd: 0, min: 0, max: 0, q1: 0, median: 0, q3: 0, p90: 0, p99: 0, iqr: 0, skew: 0, kurt: 0, mad: 0, cv: 0 };
    }
    const sorted = [...xs].sort((a, b) => a - b);
    const m = mean(xs);
    const sd = stdev(xs);
    let m3 = 0;
    let m4 = 0;
    for (const x of xs) {
        const d = x - m;
        m3 += d * d * d;
        m4 += d * d * d * d;
    }
    const pop = (() => {
        let s = 0;
        for (const x of xs) s += (x - m) ** 2;
        return s / n;
    })();
    const skew = pop > 0 ? m3 / n / pop ** 1.5 : 0;
    const kurt = pop > 0 ? m4 / n / (pop * pop) - 3 : 0;
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const med = quantileSorted(sorted, 0.5);
    return {
        n,
        mean: m,
        sd,
        min: sorted[0],
        max: sorted[n - 1],
        q1,
        median: med,
        q3,
        p90: quantileSorted(sorted, 0.9),
        p99: quantileSorted(sorted, 0.99),
        iqr: q3 - q1,
        skew,
        kurt,
        mad: mad(sorted, med),
        cv: m ? sd / m : 0,
    };
}

/**
 * Робастный z-счёт (Иглевич — Хоглин). |z| > 3.5 — выброс.
 * @param {number[]} xs
 * @returns {number[]}
 */
export function robustZ(xs) {
    const med = median(xs);
    const d = mad(xs, med);
    if (d === 0) {
        // MAD = 0 (больше половины значений равны): берём среднее абсолютное отклонение
        const meanAd = mean(xs.map((x) => Math.abs(x - med)));
        if (meanAd === 0) return xs.map(() => 0);
        return xs.map((x) => (x - med) / (1.2533 * meanAd));
    }
    return xs.map((x) => (0.6745 * (x - med)) / d);
}

/** Доверительный интервал Уилсона для доли (z = 1.96 → 95%). */
export function wilson(successes, n, z = 1.96) {
    if (!n) return { p: 0, lo: 0, hi: 0 };
    const p = successes / n;
    const z2 = z * z;
    const den = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / den;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
    return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Гистограмма: ширина корзины по Фридману — Диаконису (2·IQR·n^(−1/3)), не более maxBins.
 * @param {number[]} xs
 */
export function histogram(xs, { maxBins = 40, integer = false } = {}) {
    if (!xs.length) return { bins: [], width: 0 };
    const d = describe(xs);
    if (d.max === d.min) return { bins: [{ x0: d.min, x1: d.max, count: xs.length }], width: 0 };
    let w = d.iqr > 0 ? (2 * d.iqr) / Math.cbrt(xs.length) : (d.max - d.min) / 10;
    let bins = Math.ceil((d.max - d.min) / w);
    if (bins > maxBins) {
        bins = maxBins;
        w = (d.max - d.min) / bins;
    }
    if (integer) {
        w = Math.max(1, Math.ceil(w));
        bins = Math.floor((d.max - d.min) / w) + 1;
    }
    const out = Array.from({ length: bins }, (_, i) => ({ x0: d.min + i * w, x1: d.min + (i + 1) * w, count: 0 }));
    for (const x of xs) {
        let i = Math.floor((x - d.min) / w);
        if (i >= bins) i = bins - 1;
        out[i].count++;
    }
    return { bins: out, width: w };
}

// ---------------------------------------------------------------------------
// Неравенство и концентрация
// ---------------------------------------------------------------------------
/** Коэффициент Джини (0 — все равны, →1 — всё у одного). */
export function gini(values) {
    const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
    const n = xs.length;
    const total = sum(xs);
    if (!n || !total) return 0;
    let acc = 0;
    for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * xs[i];
    return acc / (n * total);
}

/** Кривая Лоренца (не более points точек) — доля клиентов → доля обращений. */
export function lorenz(values, points = 101) {
    const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
    const n = xs.length;
    const total = sum(xs);
    if (!n || !total) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const cum = new Array(n + 1);
    cum[0] = 0;
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + xs[i];
    const out = [];
    for (let k = 0; k < points; k++) {
        const x = k / (points - 1);
        const idx = Math.round(x * n);
        out.push({ x, y: cum[idx] / total });
    }
    return out;
}

/** Индекс Херфиндаля — Хиршмана (сумма квадратов долей, 0..1). */
export function hhi(values) {
    const total = sum(values);
    if (!total) return 0;
    let s = 0;
    for (const v of values) s += (v / total) ** 2;
    return s;
}

/** Доля суммы, приходящаяся на верхние frac элементов. */
export function topShare(values, frac) {
    const xs = [...values].sort((a, b) => b - a);
    const total = sum(xs);
    if (!total) return 0;
    const k = Math.max(1, Math.round(xs.length * frac));
    return sum(xs.slice(0, k)) / total;
}

// ---------------------------------------------------------------------------
// Информация
// ---------------------------------------------------------------------------
/** Энтропия Шеннона в битах по счётчикам. */
export function entropyBits(counts) {
    const total = sum(counts);
    if (!total) return 0;
    let h = 0;
    for (const c of counts) {
        if (c > 0) {
            const p = c / total;
            h -= p * Math.log2(p);
        }
    }
    return h;
}

/** Нормированная энтропия (0 — одна категория, 1 — равномерно). */
export function normalizedEntropy(counts) {
    const k = counts.filter((c) => c > 0).length;
    if (k <= 1) return 0;
    return entropyBits(counts) / Math.log2(k);
}

// ---------------------------------------------------------------------------
// Ряды
// ---------------------------------------------------------------------------
export function movingAverage(xs, w) {
    const out = new Array(xs.length);
    let s = 0;
    for (let i = 0; i < xs.length; i++) {
        s += xs[i];
        if (i >= w) s -= xs[i - w];
        out[i] = s / Math.min(i + 1, w);
    }
    return out;
}

export function ewma(xs, alpha = 0.3) {
    const out = [];
    let prev = xs.length ? xs[0] : 0;
    for (const x of xs) {
        prev = alpha * x + (1 - alpha) * prev;
        out.push(prev);
    }
    return out;
}

/** Выборочная автокорреляция на лаге k. */
export function autocorrelation(xs, k) {
    const n = xs.length;
    if (n <= k + 1) return 0;
    const m = mean(xs);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        den += (xs[i] - m) ** 2;
        if (i + k < n) num += (xs[i] - m) * (xs[i + k] - m);
    }
    return den ? num / den : 0;
}

/** Индекс дисперсии: >1 — поток «всплесками» (сверхпуассоновский), ≈1 — случайный, <1 — равномерный. */
export function dispersionIndex(xs) {
    const m = mean(xs);
    return m ? variance(xs) / m : 0;
}

/** Функция стандартного нормального распределения (Абрамовиц — Стиган 7.1.26). */
export function normalCdf(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
            t *
            Math.exp(-(z * z) / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Тест Манна — Кендалла на монотонный тренд (с поправкой дисперсии на связки)
 * + наклон Тейла — Сена (медиана попарных наклонов; при n > 400 — по равномерной выборке пар).
 * @param {number[]} xs
 * @returns {{ s: number, z: number, p: number, trend: 'рост'|'снижение'|'нет', slope: number }}
 */
export function mannKendall(xs) {
    const n = xs.length;
    if (n < 4) return { s: 0, z: 0, p: 1, trend: 'нет', slope: 0 };
    let s = 0;
    // O(n²) приемлемо до ~2000 точек (дни за 5 лет)
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(xs[j] - xs[i]);
    const ties = new Map();
    for (const x of xs) ties.set(x, (ties.get(x) || 0) + 1);
    let tieTerm = 0;
    for (const t of ties.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
    const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
    let z = 0;
    if (varS > 0) {
        if (s > 0) z = (s - 1) / Math.sqrt(varS);
        else if (s < 0) z = (s + 1) / Math.sqrt(varS);
    }
    const p = 2 * (1 - normalCdf(Math.abs(z)));
    const slopes = [];
    const stride = n > 400 ? Math.ceil((n * n) / 2 / 80000) : 1;
    let c = 0;
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            if (stride > 1 && c++ % stride) continue;
            slopes.push((xs[j] - xs[i]) / (j - i));
        }
    }
    const slope = slopes.length ? median(slopes) : 0;
    return { s, z, p, trend: p < 0.05 ? (s > 0 ? 'рост' : 'снижение') : 'нет', slope };
}

/**
 * Точка изменения уровня (CUSUM по отклонениям от среднего): индекс, где накопленная сумма
 * максимальна по модулю, и средние до/после.
 */
export function cusumChangePoint(xs) {
    const n = xs.length;
    if (n < 8) return null;
    const m = mean(xs);
    let s = 0;
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < n; i++) {
        s += xs[i] - m;
        if (Math.abs(s) > best && i > 1 && i < n - 2) {
            best = Math.abs(s);
            bestIdx = i;
        }
    }
    if (bestIdx < 0) return null;
    const before = mean(xs.slice(0, bestIdx + 1));
    const after = mean(xs.slice(bestIdx + 1));
    const sd = stdev(xs) || 1;
    // эффект в стандартных отклонениях — чтобы не показывать шумовые «переломы»
    const effect = Math.abs(after - before) / sd;
    return { index: bestIdx, before, after, effect, significant: effect >= 0.8 };
}

/**
 * χ²-тест согласия с равномерным распределением (например, дни недели).
 * p-значение через приближение Уилсона — Хилферти.
 */
export function chiSquareUniform(counts) {
    const k = counts.length;
    const total = sum(counts);
    if (k < 2 || !total) return { chi2: 0, df: 0, p: 1 };
    const e = total / k;
    let chi2 = 0;
    for (const c of counts) chi2 += (c - e) ** 2 / e;
    const df = k - 1;
    const z = (Math.cbrt(chi2 / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
    return { chi2, df, p: 1 - normalCdf(z) };
}

/**
 * МНК: y = a + b·x, R², t-статистика наклона.
 * @param {number[]} xs
 * @param {number[]} ys
 */
export function linearRegression(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return { a: 0, b: 0, r2: 0, t: 0, n };
    const mx = mean(xs.slice(0, n));
    const my = mean(ys.slice(0, n));
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
    }
    const b = sxx ? sxy / sxx : 0;
    const a = my - b * mx;
    const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
    let sse = 0;
    for (let i = 0; i < n; i++) sse += (ys[i] - a - b * xs[i]) ** 2;
    const se = n > 2 && sxx ? Math.sqrt(sse / (n - 2) / sxx) : 0;
    return { a, b, r2, t: se ? b / se : 0, n };
}

// ---------------------------------------------------------------------------
// Язык
// ---------------------------------------------------------------------------
/**
 * G² Даннинга: насколько слово характерно для подкорпуса A по сравнению с B.
 * Положительный знак — чаще в A. |G²| > 10.83 ≈ p < 0.001.
 */
export function logLikelihoodG2(a, b, totalA, totalB) {
    const e1 = (totalA * (a + b)) / (totalA + totalB);
    const e2 = (totalB * (a + b)) / (totalA + totalB);
    let g = 0;
    if (a > 0 && e1 > 0) g += a * Math.log(a / e1);
    if (b > 0 && e2 > 0) g += b * Math.log(b / e2);
    g *= 2;
    return a / (totalA || 1) >= b / (totalB || 1) ? g : -g;
}

/** PMI и t-score биграммы. */
export function collocationScores(fxy, fx, fy, n) {
    const pmi = Math.log2((fxy * n) / (fx * fy));
    const t = (fxy - (fx * fy) / n) / Math.sqrt(fxy);
    return { pmi, t };
}

/**
 * Закон Ципфа: регрессия log(частота) ~ log(ранг). Для естественного языка наклон ≈ −1.
 * @param {number[]} freqsDesc частоты по убыванию
 */
export function zipfFit(freqsDesc, maxRank = 2000) {
    const xs = [];
    const ys = [];
    for (let i = 0; i < Math.min(freqsDesc.length, maxRank); i++) {
        if (freqsDesc[i] <= 0) break;
        xs.push(Math.log10(i + 1));
        ys.push(Math.log10(freqsDesc[i]));
    }
    const r = linearRegression(xs, ys);
    return { exponent: -r.b, r2: r.r2, intercept: r.a, points: xs.map((x, i) => ({ x, y: ys[i] })) };
}

/**
 * Закон Хипса: V = K·N^β по кривой роста словаря.
 * @param {Array<{n:number, v:number}>} curve
 */
export function heapsFit(curve) {
    const pts = curve.filter((p) => p.n > 0 && p.v > 0);
    const r = linearRegression(
        pts.map((p) => Math.log(p.n)),
        pts.map((p) => Math.log(p.v)),
    );
    return { beta: r.b, k: Math.exp(r.a), r2: r.r2 };
}

// ---------------------------------------------------------------------------
// Векторы и кластеризация
// ---------------------------------------------------------------------------
/** Разреженный вектор: { idx: Int32Array, val: Float64Array }, нормированный по L2. */
export function normalizeSparse(idx, val) {
    let s = 0;
    for (let i = 0; i < val.length; i++) s += val[i] * val[i];
    const n = Math.sqrt(s) || 1;
    for (let i = 0; i < val.length; i++) val[i] /= n;
    return { idx, val };
}

function dotSparseDense(v, dense) {
    let s = 0;
    for (let i = 0; i < v.idx.length; i++) s += v.val[i] * dense[v.idx[i]];
    return s;
}

function dotSparseSparse(a, b) {
    let i = 0;
    let j = 0;
    let s = 0;
    while (i < a.idx.length && j < b.idx.length) {
        if (a.idx[i] === b.idx[j]) s += a.val[i++] * b.val[j++];
        else if (a.idx[i] < b.idx[j]) i++;
        else j++;
    }
    return s;
}

export function cosineSparse(a, b) {
    return dotSparseSparse(a, b);
}

/**
 * Сферический k-means (косинусная близость) с k-means++ и детерминированным ГПСЧ.
 * @param {Array<{idx:Int32Array,val:Float64Array}>} vecs L2-нормированные векторы
 * @param {number} dim
 * @param {number} k
 */
export function sphericalKMeans(vecs, dim, k, { iters = 25, seed = 42 } = {}) {
    const n = vecs.length;
    const rand = mulberry32(seed);
    if (!n || k <= 0) return { assign: new Int32Array(0), centroids: [], sims: new Float64Array(0), iterations: 0 };
    k = Math.min(k, n);
    // k-means++: следующий центр с вероятностью ∝ (1 − cos)²
    const centers = [];
    const first = Math.floor(rand() * n);
    centers.push(first);
    const dist = new Float64Array(n).fill(Infinity);
    while (centers.length < k) {
        const last = vecs[centers[centers.length - 1]];
        let total = 0;
        for (let i = 0; i < n; i++) {
            const d = 1 - dotSparseSparse(vecs[i], last);
            const d2 = d * d;
            if (d2 < dist[i]) dist[i] = d2;
            total += dist[i];
        }
        if (total <= 1e-12) break;
        let r = rand() * total;
        let pick = n - 1;
        for (let i = 0; i < n; i++) {
            r -= dist[i];
            if (r <= 0) {
                pick = i;
                break;
            }
        }
        centers.push(pick);
    }
    let centroids = centers.map((ci) => {
        const c = new Float64Array(dim);
        const v = vecs[ci];
        for (let t = 0; t < v.idx.length; t++) c[v.idx[t]] = v.val[t];
        return c;
    });
    const assign = new Int32Array(n).fill(-1);
    const sims = new Float64Array(n);
    let it = 0;
    for (; it < iters; it++) {
        let changed = 0;
        for (let i = 0; i < n; i++) {
            let best = -1;
            let bestSim = -Infinity;
            for (let c = 0; c < centroids.length; c++) {
                const s = dotSparseDense(vecs[i], centroids[c]);
                if (s > bestSim) {
                    bestSim = s;
                    best = c;
                }
            }
            if (assign[i] !== best) changed++;
            assign[i] = best;
            sims[i] = bestSim;
        }
        const next = centroids.map(() => new Float64Array(dim));
        const counts = new Int32Array(centroids.length);
        for (let i = 0; i < n; i++) {
            const c = next[assign[i]];
            counts[assign[i]]++;
            const v = vecs[i];
            for (let t = 0; t < v.idx.length; t++) c[v.idx[t]] += v.val[t];
        }
        for (let c = 0; c < next.length; c++) {
            if (!counts[c]) {
                // пустой кластер: переносим в самую «плохо описанную» точку
                let worst = 0;
                for (let i = 1; i < n; i++) if (sims[i] < sims[worst]) worst = i;
                const v = vecs[worst];
                for (let t = 0; t < v.idx.length; t++) next[c][v.idx[t]] = v.val[t];
                sims[worst] = 1;
                continue;
            }
            let s = 0;
            for (let d = 0; d < dim; d++) s += next[c][d] * next[c][d];
            s = Math.sqrt(s) || 1;
            for (let d = 0; d < dim; d++) next[c][d] /= s;
        }
        centroids = next;
        if (changed === 0) break;
    }
    return { assign, centroids, sims, iterations: it + 1 };
}

/**
 * Средний силуэт (косинусное расстояние) по детерминированной выборке до sampleSize точек.
 * Значения: >0.5 — чёткие кластеры, 0.25–0.5 — умеренные, <0.25 — темы перекрываются.
 */
export function silhouetteSample(vecs, assign, k, sampleSize = 400, seed = 7) {
    const n = vecs.length;
    if (n < 3 || k < 2) return 0;
    const rand = mulberry32(seed);
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const sample = idx.slice(0, Math.min(sampleSize, n));
    let total = 0;
    let cnt = 0;
    for (const i of sample) {
        const sumD = new Float64Array(k);
        const num = new Int32Array(k);
        for (const j of sample) {
            if (i === j) continue;
            sumD[assign[j]] += 1 - dotSparseSparse(vecs[i], vecs[j]);
            num[assign[j]]++;
        }
        const own = assign[i];
        if (num[own] === 0) continue;
        const a = sumD[own] / num[own];
        let b = Infinity;
        for (let c = 0; c < k; c++) if (c !== own && num[c]) b = Math.min(b, sumD[c] / num[c]);
        if (!Number.isFinite(b)) continue;
        const s = Math.max(a, b) ? (b - a) / Math.max(a, b) : 0;
        total += s;
        cnt++;
    }
    return cnt ? total / cnt : 0;
}

// ---------------------------------------------------------------------------
// MinHash + LSH
// ---------------------------------------------------------------------------
/**
 * Сигнатура MinHash по множеству шинглов (строк). numHashes = bands·rows.
 * @param {string[]} shingles
 */
export function minhashSignature(shingles, numHashes = 64, seed = 1) {
    const sig = new Uint32Array(numHashes).fill(0xffffffff);
    const rand = mulberry32(seed);
    const a = [];
    const b = [];
    for (let i = 0; i < numHashes; i++) {
        a.push((Math.floor(rand() * 0xfffffffe) + 1) >>> 0);
        b.push(Math.floor(rand() * 0xffffffff) >>> 0);
    }
    for (const sh of shingles) {
        const h = fnv1a(sh);
        for (let i = 0; i < numHashes; i++) {
            const v = (Math.imul(a[i], h) + b[i]) >>> 0;
            if (v < sig[i]) sig[i] = v;
        }
    }
    return sig;
}

/** Оценка сходства Жаккара по двум сигнатурам. */
export function minhashSimilarity(s1, s2) {
    let eq = 0;
    for (let i = 0; i < s1.length; i++) if (s1[i] === s2[i]) eq++;
    return s1.length ? eq / s1.length : 0;
}

/** Точное сходство Жаккара двух множеств. */
export function jaccard(setA, setB) {
    if (!setA.size && !setB.size) return 1;
    let inter = 0;
    const [small, big] = setA.size < setB.size ? [setA, setB] : [setB, setA];
    for (const x of small) if (big.has(x)) inter++;
    return inter / (setA.size + setB.size - inter);
}

/**
 * Кандидаты в почти-дубликаты по полосам LSH. Порог S-кривой ≈ (1/bands)^(1/rows):
 * 16×4 → ≈0.50, затем кандидаты проверяются точным Жаккаром.
 * @param {Uint32Array[]} sigs
 * @returns {Array<[number, number]>}
 */
export function lshCandidatePairs(sigs, bands = 16, rows = 4, maxBucket = 200) {
    const pairs = new Set();
    for (let b = 0; b < bands; b++) {
        const buckets = new Map();
        for (let i = 0; i < sigs.length; i++) {
            const s = sigs[i];
            if (!s) continue;
            let key = b;
            for (let r = 0; r < rows; r++) key = Math.imul(key ^ s[b * rows + r], 0x01000193) >>> 0;
            const arr = buckets.get(key);
            if (arr) arr.push(i);
            else buckets.set(key, [i]);
        }
        for (const arr of buckets.values()) {
            if (arr.length < 2) continue;
            // огромные корзины — это шаблонные ответы; берём соседей, а не все пары (O(n²))
            // (цепочка соседей всё равно связывает всю корзину в одну группу через union–find)
            const big = arr.length > maxBucket;
            for (let x = 0; x < arr.length; x++) {
                const yMax = big ? Math.min(arr.length, x + 4) : arr.length;
                for (let y = x + 1; y < yMax; y++) {
                    const i = arr[x];
                    const j = arr[y];
                    pairs.add(i < j ? `${i}:${j}` : `${j}:${i}`);
                }
            }
        }
    }
    return [...pairs].map((p) => p.split(':').map(Number));
}

// ---------------------------------------------------------------------------
// Union–find
// ---------------------------------------------------------------------------
export class UnionFind {
    constructor(n) {
        this.p = new Int32Array(n);
        this.r = new Uint8Array(n);
        for (let i = 0; i < n; i++) this.p[i] = i;
    }
    find(x) {
        while (this.p[x] !== x) {
            this.p[x] = this.p[this.p[x]];
            x = this.p[x];
        }
        return x;
    }
    union(a, b) {
        let ra = this.find(a);
        let rb = this.find(b);
        if (ra === rb) return false;
        if (this.r[ra] < this.r[rb]) [ra, rb] = [rb, ra];
        this.p[rb] = ra;
        if (this.r[ra] === this.r[rb]) this.r[ra]++;
        return true;
    }
}

// ---------------------------------------------------------------------------
// Сравнение групп (жабы против остальных)
// ---------------------------------------------------------------------------
/** Средние ранги (связки получают средний ранг). */
export function ranks(xs) {
    const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < idx.length; ) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
        const avg = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
        i = j + 1;
    }
    return r;
}

/**
 * U-тест Манна — Уитни (нормальное приближение с поправкой на связки и непрерывность).
 * Эффект — ранго-бисериальная корреляция r = 1 − 2U/(n1·n2) ∈ [−1; 1]
 * (> 0 — значения группы A в среднем больше).
 */
export function mannWhitneyU(a, b) {
    const n1 = a.length;
    const n2 = b.length;
    if (n1 < 2 || n2 < 2) return { u: 0, z: 0, p: 1, effect: 0, insufficient: true };
    const all = [...a, ...b];
    const r = ranks(all);
    let r1 = 0;
    for (let i = 0; i < n1; i++) r1 += r[i];
    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const u2 = n1 * n2 - u1;
    const n = n1 + n2;
    const ties = new Map();
    for (const v of all) ties.set(v, (ties.get(v) || 0) + 1);
    let tieSum = 0;
    for (const t of ties.values()) if (t > 1) tieSum += t * t * t - t;
    const varU = ((n1 * n2) / 12) * (n + 1 - tieSum / (n * (n - 1)));
    const mu = (n1 * n2) / 2;
    const z = varU > 0 ? (u1 - mu - Math.sign(u1 - mu) * 0.5) / Math.sqrt(varU) : 0;
    const p = 2 * (1 - normalCdf(Math.abs(z)));
    return { u: Math.min(u1, u2), z, p, effect: (2 * u1) / (n1 * n2) - 1, insufficient: false };
}

/** Ранговая корреляция Спирмена с t-приближением p-значения (нормальным при n > 30). */
export function spearman(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 4) return { rho: 0, p: 1, n };
    const rx = ranks(xs.slice(0, n));
    const ry = ranks(ys.slice(0, n));
    const mx = mean(rx);
    const my = mean(ry);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
        sxy += (rx[i] - mx) * (ry[i] - my);
        sxx += (rx[i] - mx) ** 2;
        syy += (ry[i] - my) ** 2;
    }
    const rho = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
    const z = rho * Math.sqrt(n - 1);
    return { rho, p: 2 * (1 - normalCdf(Math.abs(z))), n };
}

/** z-тест разности двух долей (объединённая оценка дисперсии). */
export function twoProportionZ(x1, n1, x2, n2) {
    if (!n1 || !n2) return { p1: 0, p2: 0, diff: 0, z: 0, p: 1 };
    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const pp = (x1 + x2) / (n1 + n2);
    const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    const z = se ? (p1 - p2) / se : 0;
    return { p1, p2, diff: p1 - p2, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

/**
 * Отношение шансов таблицы 2×2 с поправкой Холдейна (+0,5 к каждой клетке) и 95% ДИ по Вульфу.
 * a — признак в группе A, b — нет признака в A, c — признак в B, d — нет признака в B.
 */
export function oddsRatio(a, b, c, d) {
    const [A, Bv, C, D] = [a + 0.5, b + 0.5, c + 0.5, d + 0.5];
    const lor = Math.log((A * D) / (Bv * C));
    const se = Math.sqrt(1 / A + 1 / Bv + 1 / C + 1 / D);
    return { or: Math.exp(lor), lo: Math.exp(lor - 1.96 * se), hi: Math.exp(lor + 1.96 * se), significant: lor - 1.96 * se > 0 || lor + 1.96 * se < 0 };
}

/** ROC AUC = вероятность, что случайный положительный пример оценён выше отрицательного. */
export function rocAuc(scores, labels) {
    const pos = [];
    const neg = [];
    scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
    if (!pos.length || !neg.length) return NaN;
    const r = ranks([...pos, ...neg]);
    let rp = 0;
    for (let i = 0; i < pos.length; i++) rp += r[i];
    return (rp - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/**
 * Логистическая регрессия с L2-регуляризацией (градиентный спуск по стандартизованным признакам,
 * веса классов уравновешены — положительных примеров мало).
 * @param {number[][]} X
 * @param {number[]} y 0/1
 */
export function trainLogistic(X, y, { l2 = 1, iters = 400, lr = 0.3 } = {}) {
    const n = X.length;
    const d = n ? X[0].length : 0;
    const mu = new Array(d).fill(0);
    const sd = new Array(d).fill(1);
    for (let j = 0; j < d; j++) {
        const col = X.map((r) => r[j]);
        mu[j] = mean(col);
        sd[j] = stdev(col) || 1;
    }
    const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
    const npos = y.reduce((s, v) => s + v, 0);
    const wPos = npos ? n / (2 * npos) : 1;
    const wNeg = n - npos ? n / (2 * (n - npos)) : 1;
    const w = new Array(d).fill(0);
    let b = 0;
    for (let it = 0; it < iters; it++) {
        const gw = new Array(d).fill(0);
        let gb = 0;
        let wsum = 0;
        for (let i = 0; i < n; i++) {
            let z = b;
            for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
            const cw = y[i] ? wPos : wNeg;
            const err = (sigmoid(z) - y[i]) * cw;
            for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
            gb += err;
            wsum += cw;
        }
        for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / wsum + (l2 * w[j]) / n);
        b -= lr * (gb / wsum);
    }
    return {
        w,
        b,
        mu,
        sd,
        predict(x) {
            let z = b;
            for (let j = 0; j < d; j++) z += w[j] * ((x[j] - mu[j]) / sd[j]);
            return sigmoid(z);
        },
        contributions(x) {
            return w.map((wj, j) => wj * ((x[j] - mu[j]) / sd[j]));
        },
    };
}

/** k-кратная перекрёстная проверка логистической регрессии → AUC вне обучающей выборки. */
export function crossValidatedAuc(X, y, k = 5, opts = {}) {
    const n = X.length;
    const npos = y.reduce((s, v) => s + v, 0);
    if (npos < k || n - npos < k) return NaN;
    // стратифицированные фолды, детерминированно
    const posIdx = [];
    const negIdx = [];
    y.forEach((v, i) => (v ? posIdx : negIdx).push(i));
    const fold = new Array(n);
    posIdx.forEach((i, t) => (fold[i] = t % k));
    negIdx.forEach((i, t) => (fold[i] = t % k));
    const scores = new Array(n);
    for (let f = 0; f < k; f++) {
        const tr = [];
        const ty = [];
        for (let i = 0; i < n; i++) if (fold[i] !== f) {
            tr.push(X[i]);
            ty.push(y[i]);
        }
        const m = trainLogistic(tr, ty, opts);
        for (let i = 0; i < n; i++) if (fold[i] === f) scores[i] = m.predict(X[i]);
    }
    return rocAuc(scores, y);
}

// ---------------------------------------------------------------------------
// Множественные сравнения
// ---------------------------------------------------------------------------
/**
 * Поправка Бенджамини — Хохберга: q-значения (контроль доли ложных открытий, FDR).
 * q₍ᵢ₎ = min по j ≥ i от min(p₍ⱼ₎·m/j, 1) — как p.adjust(method = "BH") в R.
 * @param {number[]} pvals
 * @returns {number[]} q в исходном порядке
 */
export function benjaminiHochberg(pvals) {
    const m = pvals.length;
    if (!m) return [];
    const order = pvals.map((p, i) => [Number.isFinite(p) ? p : 1, i]).sort((a, b) => a[0] - b[0]);
    const q = new Array(m);
    let prev = 1;
    for (let k = m - 1; k >= 0; k--) {
        const [p, i] = order[k];
        prev = Math.min(prev, (p * m) / (k + 1), 1);
        q[i] = prev;
    }
    return q;
}

/** p-значение для статистики G² (χ² с одной степенью свободы). */
export function pFromG2(g2) {
    const g = Math.abs(Number(g2) || 0);
    return 2 * (1 - normalCdf(Math.sqrt(g)));
}

/** Проставить q (BH) и флаг significant в массиве объектов с полем p. */
export function applyFdr(rows, { alpha = 0.05, guard = () => true } = {}) {
    const q = benjaminiHochberg(rows.map((r) => (r && Number.isFinite(r.p) ? r.p : 1)));
    rows.forEach((r, i) => {
        r.q = q[i];
        r.significant = !!(guard(r) && q[i] < alpha);
    });
    return rows;
}
