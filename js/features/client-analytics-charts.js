'use strict';

/**
 * Лёгкие графики для аналитики обращений: строки HTML/SVG без сторонних библиотек.
 * Цвета — через CSS-переменные .ca-viz (светлая и тёмная тема заданы в client-analytics.css),
 * значения всегда подписаны текстом (идентичность не передаётся только цветом),
 * подсказка при наведении — data-tip + bindVizTooltips() (одна подсказка на корень).
 */

import { escapeHtml } from '../utils/html.js';

const nf = new Intl.NumberFormat('ru-RU');
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export const fmt = {
    int: (v) => nf.format(Math.round(Number(v) || 0)),
    num1: (v) => nf1.format(Number(v) || 0),
    // малые доли (TTR 0,0023) не округляются до «0»: три значащие цифры
    num2: (v) => {
        const x = Number(v) || 0;
        if (x !== 0 && Math.abs(x) < 1) return new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 3 }).format(x);
        return nf2.format(x);
    },
    /** Склонение: plural(5, ['файл', 'файла', 'файлов']) → «5 файлов». */
    plural: (n, forms) => {
        const a = Math.abs(n) % 100;
        const b = a % 10;
        const w = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2];
        return `${nf.format(n)} ${w}`;
    },
    pct: (v, digits = 1) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format((Number(v) || 0) * 100)}%`,
    date: (ymd) => {
        if (!ymd) return '—';
        const [y, m, d] = String(ymd).split('-');
        return d ? `${d}.${m}.${y}` : m ? `${m}.${y}` : String(ymd);
    },
    month: (ym) => {
        const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const [y, m] = String(ym).split('-');
        return `${names[Number(m) - 1] || m} ${String(y).slice(2)}`;
    },
};

let widths = { wide: 900, half: 640 };

/** Ширины графиков под текущий контейнер (задаются перед отрисовкой вкладки). */
export function setChartWidths(w) {
    widths = { ...widths, ...w };
}

function chartWidth(kind) {
    return widths[kind] || 640;
}

/** «Круглый» шаг делений: 1, 2 или 5 × 10^k (для целых счётчиков шаг не меньше 1). */
function niceStep(raw) {
    if (raw <= 1) return 1;
    const p = 10 ** Math.floor(Math.log10(raw));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Ось: максимум, кратный шагу, и деления (≈ 4–5 штук). */
function niceAxis(rawMax, target = 4) {
    const step = niceStep(Math.max(rawMax, 1) / target);
    const max = Math.max(step, Math.ceil(Math.max(rawMax, 1) / step) * step);
    const t = [];
    for (let v = 0; v <= max + 1e-9; v += step) t.push(v);
    return { max, ticks: t };
}

/**
 * Горизонтальные полосы (HTML): подпись, полоса, значение, доля. Клик → data-ca-drill.
 * @param {Array<{ label: string, value: number, note?: string, drill?: string, tip?: string, tone?: string }>} items
 */
export function barsH(items, { max = null, valueFmt = fmt.int, empty = 'Нет данных', showShare = null } = {}) {
    if (!items || !items.length) return `<p class="ca-viz-empty">${escapeHtml(empty)}</p>`;
    const m = max ?? Math.max(...items.map((i) => i.value), 1);
    const rows = items
        .map((it) => {
            const w = m ? Math.max(0.5, (100 * it.value) / m) : 0;
            const share = showShare ? ` <span class="ca-viz-muted">· ${fmt.pct(it.value / showShare)}</span>` : '';
            const tag = it.drill ? 'button' : 'div';
            const attrs = it.drill
                ? ` type="button" data-ca-drill="${escapeHtml(it.drill)}" aria-label="${escapeHtml(`${it.label}: ${valueFmt(it.value)}. Показать записи`)}"`
                : '';
            const tip = it.tip ? ` data-tip="${escapeHtml(it.tip)}"` : '';
            return `<${tag} class="ca-viz-barrow${it.drill ? ' is-drill' : ''}"${attrs}${tip}>
  <span class="ca-viz-barlabel" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}${it.note ? ` <span class="ca-viz-muted">${escapeHtml(it.note)}</span>` : ''}</span>
  <span class="ca-viz-bartrack"><span class="ca-viz-barfill${it.tone ? ` tone-${it.tone}` : ''}" style="width:${w.toFixed(2)}%"></span></span>
  <span class="ca-viz-barval">${escapeHtml(valueFmt(it.value))}${share}</span>
</${tag}>`;
        })
        .join('');
    return `<div class="ca-viz-bars">${rows}</div>`;
}

/**
 * Вертикальные столбцы (SVG) с подписями оси X и подсказками.
 * @param {Array<{ label: string, value: number, tip?: string, drill?: string }>} items
 */
export function columns(items, { height = 180, valueFmt = fmt.int, labelEvery = 1, ariaLabel = 'Столбчатая диаграмма', width = chartWidth('half') } = {}) {
    if (!items || !items.length) return '<p class="ca-viz-empty">Нет данных</p>';
    const W = Math.max(260, Math.round(width));
    // подписи оси X не должны налезать друг на друга: не меньше ~34 px на подпись
    labelEvery = Math.max(labelEvery, Math.ceil((items.length * 34) / W));
    const H = height;
    const padL = 40;
    const padB = 26;
    const padT = 14;
    const plotW = W - padL - 6;
    const plotH = H - padB - padT;
    const axis = niceAxis(Math.max(...items.map((i) => i.value), 1));
    const max = axis.max;
    const bw = plotW / items.length;
    const gap = Math.min(2, bw * 0.2);
    const grid = axis.ticks
        .map((t) => {
            const y = padT + plotH - (plotH * t) / max;
            return `<line x1="${padL}" x2="${W - 6}" y1="${y}" y2="${y}" class="ca-viz-grid"/><text x="${padL - 6}" y="${y + 4}" class="ca-viz-axis" text-anchor="end">${escapeHtml(fmt.int(t))}</text>`;
        })
        .join('');
    const bars = items
        .map((it, i) => {
            const h = (plotH * it.value) / max;
            const x = padL + i * bw + gap / 2;
            const y = padT + plotH - h;
            const r = Math.min(4, (bw - gap) / 2, h);
            const path = h > 0 ? roundedTopRect(x, y, bw - gap, h, r) : '';
            const label =
                i % labelEvery === 0
                    ? `<text x="${x + (bw - gap) / 2}" y="${H - 8}" class="ca-viz-axis" text-anchor="middle">${escapeHtml(it.label)}</text>`
                    : '';
            const tip = escapeHtml(it.tip || `${it.label}: ${valueFmt(it.value)}`);
            const drill = it.drill ? ` data-ca-drill="${escapeHtml(it.drill)}" class="ca-viz-hit is-drill"` : ' class="ca-viz-hit"';
            return `<g>${path ? `<path d="${path}" class="ca-viz-col"/>` : ''}<rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${plotH}" fill="transparent"${drill} data-tip="${tip}"/>${label}</g>`;
        })
        .join('');
    return `<svg class="ca-viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}" >${grid}${bars}<line x1="${padL}" x2="${W - 6}" y1="${padT + plotH}" y2="${padT + plotH}" class="ca-viz-baseline"/></svg>`;
}

function roundedTopRect(x, y, w, h, r) {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Временной ряд (SVG): столбики по дням/неделям + линия сглаживания + отметки всплесков.
 * @param {Array<{ x: string, y: number, smooth?: number, flag?: boolean, tip?: string, drill?: string }>} pts
 */
export function timeSeries(pts, { height = 220, xFmt = fmt.date, ariaLabel = 'Динамика обращений', smoothLabel = 'скользящее среднее', width = chartWidth('wide') } = {}) {
    if (!pts || !pts.length) return '<p class="ca-viz-empty">Нет данных</p>';
    const W = Math.max(280, Math.round(width));
    const H = height;
    const padL = 44;
    const padB = 28;
    const padT = 16;
    const plotW = W - padL - 8;
    const plotH = H - padB - padT;
    const axis = niceAxis(Math.max(...pts.map((p) => Math.max(p.y, p.smooth || 0)), 1));
    const max = axis.max;
    const step = plotW / pts.length;
    const X = (i) => padL + i * step + step / 2;
    const Y = (v) => padT + plotH - (plotH * v) / max;
    const grid = axis.ticks
        .map((t) => `<line x1="${padL}" x2="${W - 8}" y1="${Y(t)}" y2="${Y(t)}" class="ca-viz-grid"/><text x="${padL - 6}" y="${Y(t) + 4}" class="ca-viz-axis" text-anchor="end">${escapeHtml(fmt.int(t))}</text>`)
        .join('');
    const bw = Math.max(1, step - (step > 4 ? 1 : 0));
    const bars = pts
        .map((p, i) => {
            const h = plotH - (Y(p.y) - padT);
            return h > 0 ? `<rect x="${(X(i) - bw / 2).toFixed(2)}" y="${Y(p.y).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" class="ca-viz-tsbar${p.flag ? ' is-flag' : ''}${p.muted ? ' is-muted' : ''}"/>` : '';
        })
        .join('');
    const hasSmooth = pts.some((p) => p.smooth != null);
    const line = hasSmooth
        ? `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)},${Y(p.smooth || 0).toFixed(2)}`).join('')}" class="ca-viz-line"/>`
        : '';
    const flags = pts
        .map((p, i) => (p.flag ? `<circle cx="${X(i)}" cy="${Y(p.y) - 6}" r="4" class="ca-viz-flag"/>` : ''))
        .join('');
    const nLabels = Math.max(2, Math.min(pts.length, Math.floor(W / 90)));
    const every = Math.max(1, Math.ceil(pts.length / nLabels));
    const xLabels = pts
        .map((p, i) => (i % every === 0 ? `<text x="${X(i)}" y="${H - 8}" class="ca-viz-axis" text-anchor="middle">${escapeHtml(xFmt(p.x))}</text>` : ''))
        .join('');
    const hits = pts
        .map((p, i) => {
            const tip = escapeHtml(p.tip || `${xFmt(p.x)}: ${fmt.int(p.y)}`);
            const drill = p.drill ? ` data-ca-drill="${escapeHtml(p.drill)}"` : '';
            return `<rect x="${(padL + i * step).toFixed(2)}" y="${padT}" width="${step.toFixed(2)}" height="${plotH}" fill="transparent" class="ca-viz-hit${p.drill ? ' is-drill' : ''}" data-tip="${tip}" data-xi="${i}"${drill}/>`;
        })
        .join('');
    const legend = `<div class="ca-viz-legend"><span><i class="ca-viz-key key-bar"></i>обращений за период</span>${hasSmooth ? `<span><i class="ca-viz-key key-line"></i>${escapeHtml(smoothLabel)}</span>` : ''}${pts.some((p) => p.flag) ? '<span><i class="ca-viz-key key-flag"></i>всплеск (робастный z &gt; 3,5)</span>' : ''}</div>`;
    return `${legend}<svg class="ca-viz-svg ca-viz-ts" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}">${grid}${bars}${line}${flags}<line x1="${padL}" x2="${W - 8}" y1="${padT + plotH}" y2="${padT + plotH}" class="ca-viz-baseline"/>${xLabels}<line class="ca-viz-cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" visibility="hidden"/>${hits}</svg>`;
}

/**
 * Тепловая карта (HTML-сетка), последовательная шкала одного оттенка.
 * @param {number[][]} matrix
 */
export function heatmap(matrix, rowLabels, colLabels, { tipFmt = null, drillFmt = null, cellLabel = false, ariaLabel = 'Тепловая карта' } = {}) {
    const max = Math.max(1, ...matrix.flat());
    const head = `<div class="ca-viz-hm-corner"></div>${colLabels.map((c) => `<div class="ca-viz-hm-col">${escapeHtml(c)}</div>`).join('')}`;
    const body = matrix
        .map(
            (row, r) =>
                `<div class="ca-viz-hm-row">${escapeHtml(rowLabels[r])}</div>${row
                    .map((v, c) => {
                        const step = v ? Math.min(8, 1 + Math.floor((7 * v) / max)) : 0;
                        const tip = escapeHtml(tipFmt ? tipFmt(r, c, v) : `${rowLabels[r]}, ${colLabels[c]}: ${fmt.int(v)}`);
                        const drill = drillFmt && v ? ` data-ca-drill="${escapeHtml(drillFmt(r, c))}"` : '';
                        return `<div class="ca-viz-hm-cell seq-${step}${drill ? ' is-drill' : ''}" data-tip="${tip}"${drill}>${cellLabel && v ? escapeHtml(fmt.int(v)) : ''}</div>`;
                    })
                    .join('')}`,
        )
        .join('');
    return `<div class="ca-viz-hm" role="img" aria-label="${escapeHtml(ariaLabel)}" style="grid-template-columns: minmax(64px,auto) repeat(${colLabels.length}, minmax(0,1fr))">${head}${body}</div>
<div class="ca-viz-legend ca-viz-seqlegend"><span>меньше</span>${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => `<i class="ca-viz-hm-cell seq-${s}"></i>`).join('')}<span>больше</span></div>`;
}

/**
 * Кривая Лоренца (SVG) с линией равенства.
 * @param {Array<{x:number,y:number}>} pts
 */
export function lorenzChart(pts, giniValue) {
    const S = 320;
    const pad = 40;
    const P = S - pad - 10;
    const X = (x) => pad + x * P;
    const Y = (y) => 10 + P - y * P;
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    const area = `${path}L${X(1)},${Y(0)}L${X(0)},${Y(0)}Z`;
    const hits = pts
        .filter((_, i) => i % 5 === 0)
        .map((p) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="7" fill="transparent" class="ca-viz-hit" data-tip="${escapeHtml(`${fmt.pct(p.x, 0)} клиентов с наименьшим числом обращений дают ${fmt.pct(p.y)} всех обращений`)}"/>`)
        .join('');
    const axis = [0, 0.25, 0.5, 0.75, 1]
        .map((t) => `<text x="${X(t)}" y="${S - 10}" class="ca-viz-axis" text-anchor="middle">${t * 100}%</text><text x="${pad - 5}" y="${Y(t) + 4}" class="ca-viz-axis" text-anchor="end">${t * 100}%</text>`)
        .join('');
    return `<svg class="ca-viz-svg ca-viz-square" viewBox="0 0 ${S} ${S}" role="img" aria-label="Кривая Лоренца, коэффициент Джини ${fmt.num2(giniValue)}">
<path d="${area}" class="ca-viz-area"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" class="ca-viz-equal"/><path d="${path}" class="ca-viz-line"/>${axis}${hits}
<text x="${X(0.04)}" y="${Y(0.9)}" class="ca-viz-note">линия равенства</text></svg>`;
}

/**
 * Лог-лог диаграмма Ципфа с линией регрессии.
 * @param {Array<{x:number,y:number}>} pts log10(ранг), log10(частота)
 */
export function zipfChart(pts, fit) {
    if (!pts || pts.length < 3) return '<p class="ca-viz-empty">Мало слов для закона Ципфа</p>';
    const W = 420;
    const H = 260;
    const pad = 40;
    const maxX = Math.max(...pts.map((p) => p.x), 1);
    const maxY = Math.max(...pts.map((p) => p.y), 1);
    const X = (x) => pad + (x / maxX) * (W - pad - 10);
    const Y = (y) => 10 + (H - pad - 10) - (y / maxY) * (H - pad - 10);
    const dots = pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" class="ca-viz-dot" data-tip="${escapeHtml(`ранг ${fmt.int(10 ** p.x)}: частота ${fmt.int(10 ** p.y)}`)}"/>`).join('');
    const fx0 = fit.intercept;
    const fx1 = fit.intercept - fit.exponent * maxX;
    const line = `<line x1="${X(0)}" y1="${Y(fx0)}" x2="${X(maxX)}" y2="${Y(Math.max(0, fx1))}" class="ca-viz-fit"/>`;
    const axX = [];
    for (let e = 0; e <= Math.floor(maxX); e++) axX.push(`<text x="${X(e)}" y="${H - 14}" class="ca-viz-axis" text-anchor="middle">${fmt.int(10 ** e)}</text>`);
    const axY = [];
    for (let e = 0; e <= Math.floor(maxY); e++) axY.push(`<text x="${pad - 6}" y="${Y(e) + 4}" class="ca-viz-axis" text-anchor="end">${fmt.int(10 ** e)}</text>`);
    return `<svg class="ca-viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Закон Ципфа: показатель ${fmt.num2(fit.exponent)}">${line}${dots}${axX.join('')}${axY.join('')}
<text x="${W / 2}" y="${H - 1}" class="ca-viz-axis" text-anchor="middle">ранг слова (лог. шкала)</text></svg>`;
}

/** Мини-ряд (спарклайн) для профиля клиента. */
export function sparkline(values, { width = 480, height = 44, labels = [] } = {}) {
    if (!values || !values.length) return '';
    const max = Math.max(1, ...values);
    const bw = width / values.length;
    return `<svg class="ca-viz-svg ca-viz-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Обращения по месяцам" preserveAspectRatio="none">${values
        .map((v, i) => {
            const h = Math.max(v ? 2 : 0, ((height - 4) * v) / max);
            return `<rect x="${(i * bw + 0.5).toFixed(2)}" y="${(height - h).toFixed(2)}" width="${Math.max(1, bw - 1).toFixed(2)}" height="${h.toFixed(2)}" class="ca-viz-col"/><rect x="${(i * bw).toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${height}" fill="transparent" class="ca-viz-hit" data-tip="${escapeHtml(`${labels[i] || i + 1}: ${fmt.int(v)}`)}"/>`;
        })
        .join('')}</svg>`;
}

/** Показатель-плитка. */
export function statTile(label, value, note = '', { tone = '', tip = '' } = {}) {
    return `<div class="ca-viz-tile${tone ? ` tone-${tone}` : ''}"${tip ? ` data-tip="${escapeHtml(tip)}"` : ''}><div class="ca-viz-tile-label">${escapeHtml(label)}</div><div class="ca-viz-tile-value">${escapeHtml(String(value))}</div>${note ? `<div class="ca-viz-tile-note">${escapeHtml(note)}</div>` : ''}</div>`;
}

/** Таблица (доступная альтернатива графику). */
export function table(headers, rows, { caption = '', numeric = [] } = {}) {
    const th = headers.map((h, i) => `<th scope="col"${numeric.includes(i) ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('');
    const tr = rows
        .map((r) => `<tr${r.drill ? ` class="is-drill" data-ca-drill="${escapeHtml(r.drill)}" tabindex="0"` : ''}>${r.cells.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${c && c.html != null ? c.html : escapeHtml(String(c ?? ''))}</td>`).join('')}</tr>`)
        .join('');
    return `<div class="ca-viz-tablewrap"><table class="ca-viz-table">${caption ? `<caption>${escapeHtml(caption)}</caption>` : ''}<thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/**
 * Одна всплывающая подсказка на корневой элемент: data-tip у любого потомка.
 * У временного ряда дополнительно двигается вертикальная линия-перекрестие.
 * @param {HTMLElement} root
 */
export function bindVizTooltips(root) {
    if (!root || root._caTipBound) return;
    root._caTipBound = true;
    const tip = document.createElement('div');
    tip.className = 'ca-viz-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    root.appendChild(tip);
    const hide = () => {
        tip.hidden = true;
        root.querySelectorAll('.ca-viz-cross').forEach((l) => l.setAttribute('visibility', 'hidden'));
    };
    const show = (target, clientX, clientY) => {
        const text = target.getAttribute('data-tip');
        if (!text) return hide();
        tip.textContent = text;
        tip.hidden = false;
        const rr = root.getBoundingClientRect();
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let x = clientX - rr.left + root.scrollLeft + 14;
        let y = clientY - rr.top + root.scrollTop - th - 10;
        if (x + tw > root.clientWidth + root.scrollLeft - 8) x = clientX - rr.left + root.scrollLeft - tw - 14;
        if (y < root.scrollTop + 4) y = clientY - rr.top + root.scrollTop + 18;
        tip.style.transform = `translate(${Math.max(4, x)}px, ${y}px)`;
        const svg = target.closest('svg.ca-viz-ts');
        if (svg && target.hasAttribute('data-xi')) {
            const cross = svg.querySelector('.ca-viz-cross');
            const cx = Number(target.getAttribute('x')) + Number(target.getAttribute('width')) / 2;
            cross.setAttribute('x1', cx);
            cross.setAttribute('x2', cx);
            cross.setAttribute('visibility', 'visible');
        }
    };
    root.addEventListener('pointermove', (e) => {
        const t = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
        if (t && root.contains(t)) show(t, e.clientX, e.clientY);
        else hide();
    });
    root.addEventListener('pointerleave', hide);
    root.addEventListener('focusin', (e) => {
        const t = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
        if (!t) return;
        const r = t.getBoundingClientRect();
        show(t, r.left + r.width / 2, r.top);
    });
    root.addEventListener('focusout', hide);
    root.addEventListener('scroll', hide, { passive: true });
}
