'use strict';

/**
 * Прогноз числа обращений по дням (для планирования смен).
 *
 * Кандидаты:
 *   snaive — сезонный наивный: «как в тот же день недели неделю назад»;
 *   sma4   — сезонное скользящее среднее: среднее того же дня недели за 4 последние недели
 *            (сильный ориентир для данных колл-центров);
 *   hw     — Холт — Винтерс аддитивный с затухающим трендом (φ = 0,9) и недельной сезонностью;
 *            α, β, γ подбираются по сетке минимизацией одношаговой ошибки на обучающем ряду.
 * Выбор — скользящий бэктест (8 точек отсчёта с шагом 7 дней, горизонт 14 дней), метрика MASE:
 * MAE модели / MAE сезонного наивного прогноза на обучающем ряду (< 1 — лучше наивного).
 * Интервалы — эмпирические квантили ошибок бэктеста по горизонтам (1–7 и 8–14 дней), что честнее
 * формул, предполагающих нормальность. Горизонт ограничен 14 днями: дальше простое среднее
 * побить трудно, и прогноз становится декоративным.
 */

const M = 7;

function mean(xs) {
    let s = 0;
    for (const x of xs) s += x;
    return xs.length ? s / xs.length : 0;
}

function quantile(xs, p) {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const h = (s.length - 1) * p;
    const lo = Math.floor(h);
    return s[lo] + (h - lo) * ((s[Math.min(s.length - 1, lo + 1)] ?? s[lo]) - s[lo]);
}

/** MAE сезонного наивного прогноза внутри ряда (знаменатель MASE). */
export function seasonalNaiveScale(y, m = M) {
    const d = [];
    for (let i = m; i < y.length; i++) d.push(Math.abs(y[i] - y[i - m]));
    return mean(d) || 1;
}

/** Сезонный наивный прогноз на h шагов. */
export function forecastSNaive(y, h, m = M) {
    const out = [];
    for (let k = 1; k <= h; k++) out.push(y[y.length - m + ((k - 1) % m)]);
    return out;
}

/** Сезонное скользящее среднее: средний тот же день недели за последние w недель. */
export function forecastSeasonalMean(y, h, w = 4, m = M) {
    const out = [];
    for (let k = 1; k <= h; k++) {
        const vals = [];
        for (let j = 1; j <= w; j++) {
            const idx = y.length - j * m + ((k - 1) % m);
            if (idx >= 0) vals.push(y[idx]);
        }
        out.push(mean(vals));
    }
    return out;
}

/**
 * Аддитивный Холт — Винтерс с затухающим трендом.
 * @returns {{ sse: number, level: number, trend: number, season: number[], n: number }}
 */
export function holtWintersFit(y, alpha, beta, gamma, phi = 0.9, m = M) {
    const n = y.length;
    if (n < 2 * m) return null;
    let level = mean(y.slice(0, m));
    let trend = (mean(y.slice(m, 2 * m)) - level) / m;
    const season = y.slice(0, m).map((v) => v - level);
    let sse = 0;
    for (let t = m; t < n; t++) {
        const s = season[t % m];
        const fc = level + phi * trend + s;
        const e = y[t] - fc;
        sse += e * e;
        const prevLevel = level;
        level = alpha * (y[t] - s) + (1 - alpha) * (prevLevel + phi * trend);
        trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
        season[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
    }
    return { sse, level, trend, season, n, phi, alpha, beta, gamma };
}

export function holtWintersForecast(fit, h, m = M) {
    const out = [];
    let damp = 0;
    let pw = 1;
    for (let k = 1; k <= h; k++) {
        pw *= fit.phi;
        damp += pw;
        out.push(fit.level + damp * fit.trend + fit.season[(fit.n + k - 1) % m]);
    }
    return out;
}

const GRID_A = [0.05, 0.1, 0.2, 0.35, 0.5];
const GRID_B = [0, 0.02, 0.08];
const GRID_G = [0.05, 0.15, 0.3];

/** Подбор параметров по сетке (минимум суммы квадратов одношаговых ошибок). */
export function holtWintersAuto(y, m = M) {
    let best = null;
    for (const a of GRID_A) for (const b of GRID_B) for (const g of GRID_G) {
        const f = holtWintersFit(y, a, b, g, 0.9, m);
        if (f && (!best || f.sse < best.sse)) best = f;
    }
    return best;
}

const METHODS = {
    snaive: { label: 'Сезонный наивный (неделю назад)', fc: (y, h) => forecastSNaive(y, h) },
    sma4: { label: 'Среднее того же дня недели за 4 недели', fc: (y, h) => forecastSeasonalMean(y, h, 4) },
    hw: {
        label: 'Холт — Винтерс (затухающий тренд, недельная сезонность)',
        fc: (y, h) => {
            const f = holtWintersAuto(y);
            return f ? holtWintersForecast(f, h) : forecastSeasonalMean(y, h, 4);
        },
    },
};

/**
 * Прогноз с бэктестом.
 * @param {Array<{date: string, count: number}>} daily непрерывный дневной ряд
 * @param {{ horizon?: number, origins?: number }} [opts]
 */
/**
 * Календарная поправка ряда. Праздничные будни и рабочие субботы ломают недельную сезонность:
 * в обучающем ряду они заменяются типичным значением этого дня недели (среднее соседних недель
 * без праздников), а для прогноза измеряется коэффициент «праздник / обычный будний день».
 * @param {number[]} y
 * @param {string[]} dates
 * @param {(ymd: string) => { kind: string }} dayInfo
 */
export function calendarAdjust(y, dates, dayInfo) {
    const kinds = dates.map((d) => dayInfo(d).kind);
    const special = (k) => k === 'holiday' || k === 'workingSaturday';
    const adj = y.slice();
    const holidayRatios = [];
    const wsRatios = [];
    for (let i = 0; i < y.length; i++) {
        if (!special(kinds[i])) continue;
        const ref = [];
        for (const off of [-14, -7, 7, 14]) {
            const j = i + off;
            if (j >= 0 && j < y.length && !special(kinds[j])) ref.push(y[j]);
        }
        if (!ref.length) continue;
        const typical = mean(ref);
        adj[i] = typical;
        if (typical > 0) (kinds[i] === 'holiday' ? holidayRatios : wsRatios).push(y[i] / typical);
    }
    const med = (xs) => {
        if (!xs.length) return null;
        const s = [...xs].sort((a, b) => a - b);
        return s[Math.floor((s.length - 1) / 2)];
    };
    // мало праздников в истории — коэффициент «как выходной»: среднее сб/вс к среднему пн–пт
    let weekendRatio = null;
    {
        const we = [];
        const wd = [];
        dates.forEach((d, i) => (kinds[i] === 'weekend' ? we : kinds[i] === 'workday' ? wd : []).push(y[i]));
        if (we.length && wd.length && mean(wd) > 0) weekendRatio = mean(we) / mean(wd);
    }
    return {
        adjusted: adj,
        kinds,
        holidayRatio: holidayRatios.length >= 3 ? med(holidayRatios) : weekendRatio,
        holidayRatioSource: holidayRatios.length >= 3 ? `по ${holidayRatios.length} праздникам в истории` : 'как в выходные (праздников в истории мало)',
        // рабочая суббота: без истории считаем её обычным рабочим днём (коэффициент к будней — 1)
        wsRatio: wsRatios.length >= 2 ? med(wsRatios) : 1,
    };
}

function addDaysYmd(ymd, n) {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/**
 * Прогноз с учётом календаря: модель учится на скорректированном ряду, затем для праздников
 * и рабочих суббот горизонта применяются коэффициенты. Бэктест проходит тот же путь.
 */
function calendarForecast(meth, y, dates, h, dayInfo) {
    if (!dayInfo) return meth.fc(y, h);
    const cal = calendarAdjust(y, dates, dayInfo);
    const base = meth.fc(cal.adjusted, h);
    const last = dates[dates.length - 1];
    const kinds = base.map((_, k) => dayInfo(addDaysYmd(last, k + 1)).kind);
    // средний прогноз обычных будних дней горизонта — ориентир для рабочей субботы
    const workdayVals = base.filter((_, k) => kinds[k] === 'workday');
    const workdayMean = workdayVals.length ? mean(workdayVals) : null;
    return base.map((v, k) => {
        if (kinds[k] === 'holiday' && cal.holidayRatio != null) return v * cal.holidayRatio;
        if (kinds[k] === 'workingSaturday' && workdayMean != null) return workdayMean * cal.wsRatio;
        return v;
    });
}

export function forecastDaily(daily, opts = {}) {
    const H = opts.horizon || 14;
    const ORIG = opts.origins || 8;
    const y = daily.map((d) => d.count);
    const dates = daily.map((d) => d.date);
    const dayInfo = opts.dayInfo || null;
    // нужно минимум 5 недель обучения + 2 недели на самую раннюю проверку
    if (y.length < 7 * 7) {
        return { insufficient: true, reason: `Нужно не меньше 49 дней ряда (сейчас ${y.length}).` };
    }
    const origins = [];
    for (let k = ORIG; k >= 1; k--) {
        const o = y.length - k * 7 - (H - 7);
        if (o >= 5 * 7) origins.push(o);
    }
    const res = {};
    for (const [key, meth] of Object.entries(METHODS)) {
        let absSum = 0;
        let cnt = 0;
        let scaleSum = 0;
        const errsByH = Array.from({ length: H }, () => []);
        const weekErr = [];
        for (const o of origins) {
            const train = y.slice(0, o);
            const fc = calendarForecast(meth, train, dates.slice(0, o), H, dayInfo);
            const scale = seasonalNaiveScale(train);
            let wsumA = 0;
            let wsumF = 0;
            let wn = 0;
            for (let k = 0; k < H && o + k < y.length; k++) {
                const e = y[o + k] - fc[k];
                errsByH[k].push(e);
                absSum += Math.abs(e) / scale;
                scaleSum++;
                cnt++;
                if (k < 7) {
                    wsumA += y[o + k];
                    wsumF += fc[k];
                    wn++;
                }
            }
            if (wn === 7) weekErr.push(wsumA - wsumF);
        }
        res[key] = { label: meth.label, mase: cnt ? absSum / scaleSum : NaN, errsByH, weekErr, points: cnt };
    }
    const ranked = Object.entries(res).filter(([, r]) => Number.isFinite(r.mase)).sort((a, b) => a[1].mase - b[1].mase);
    if (!ranked.length) return { insufficient: true, reason: 'Не удалось провести бэктест.' };
    const [bestKey, best] = ranked[0];
    const point = calendarForecast(METHODS[bestKey], y, dates, H, dayInfo).map((v) => Math.max(0, v));
    const cal = dayInfo ? calendarAdjust(y, dates, dayInfo) : null;
    // эмпирические интервалы: ошибки бэктеста по блокам горизонта (1–7, 8–14)
    const block = (k) => (k < 7 ? 0 : 1);
    const pooled = [[], []];
    best.errsByH.forEach((errs, k) => pooled[block(k)].push(...errs));
    const bands = pooled.map((e) => ({ lo80: quantile(e, 0.1), hi80: quantile(e, 0.9), lo95: quantile(e, 0.025), hi95: quantile(e, 0.975) }));
    const lastDate = new Date(`${daily[daily.length - 1].date}T00:00:00Z`);
    const days = point.map((v, k) => {
        const d = new Date(lastDate);
        d.setUTCDate(d.getUTCDate() + k + 1);
        const b = bands[block(k)];
        const ds = d.toISOString().slice(0, 10);
        const info = dayInfo ? dayInfo(ds) : null;
        return {
            date: ds,
            dayKind: info ? info.kind : null,
            dayName: info ? info.name : null,
            value: v,
            lo80: Math.max(0, v + b.lo80),
            hi80: Math.max(0, v + b.hi80),
            lo95: Math.max(0, v + b.lo95),
            hi95: Math.max(0, v + b.hi95),
        };
    });
    const nextWeek = days.slice(0, 7).reduce((s, d) => s + d.value, 0);
    const we = best.weekErr;
    // покрытие 80%-интервала на самом бэктесте — проверка калибровки (идеал ≈ 80%)
    let inside = 0;
    let total = 0;
    best.errsByH.forEach((errs, k) => {
        const b = bands[block(k)];
        for (const e of errs) {
            total++;
            if (e >= b.lo80 && e <= b.hi80) inside++;
        }
    });
    return {
        insufficient: false,
        method: bestKey,
        methodLabel: best.label,
        mase: best.mase,
        quality: best.mase < 0.8 ? 'лучше наивного прогноза' : best.mase < 1 ? 'немного лучше наивного' : 'не лучше наивного прогноза',
        candidates: ranked.map(([k, r]) => ({ key: k, label: r.label, mase: r.mase })),
        origins: origins.length,
        horizon: H,
        days,
        nextWeek: {
            value: nextWeek,
            lo80: Math.max(0, nextWeek + quantile(we, 0.1)),
            hi80: Math.max(0, nextWeek + quantile(we, 0.9)),
            samples: we.length,
        },
        coverage80: total ? inside / total : NaN,
        calendar: cal ? { holidayRatio: cal.holidayRatio, holidayRatioSource: cal.holidayRatioSource, wsRatio: cal.wsRatio } : null,
    };
}
