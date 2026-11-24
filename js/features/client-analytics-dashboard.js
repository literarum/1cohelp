'use strict';

/**
 * Дашборд «Аналитика обращений» раздела «База клиентов».
 * Расчёт — в Web Worker (client-analytics-insights-worker.js), отрисовка — строки HTML/SVG.
 * Любой столбик/строка с data-ca-drill открывает список соответствующих записей,
 * запись — «рентген»: каждое слово (основа, вес IDF, стоп-слово, смешанная письменность),
 * каждый необычный символ (кодовая точка), темы, намерение, срочность, разбор ИНН/КПП.
 */

import { computeInsights, effectiveDate, xrayRecord } from './client-analytics-insights.js';
import { tokenizeDetailed, TOPICS, normalizeForAnalysis } from './client-analytics-text.js';
import {
    barsH,
    columns,
    timeSeries,
    heatmap,
    lorenzChart,
    zipfChart,
    statTile,
    table,
    bindVizTooltips,
    setChartWidths,
    fmt,
} from './client-analytics-charts.js';
import { escapeHtml } from '../utils/html.js';
import { formatRussianPhoneForDisplay } from './client-analytics-parse.js';
import { activateModalFocus, deactivateModalFocus } from '../ui/modals-manager.js';
import { regionByCode } from './client-analytics-registry.js';

const MODAL_ID = 'clientAnalyticsInsightsModal';
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TABS = [
    ['overview', 'Обзор'],
    ['time', 'Динамика'],
    ['clients', 'Клиенты'],
    ['topics', 'Темы и смысл'],
    ['text', 'Текст и язык'],
    ['dups', 'Повторы'],
    ['quality', 'Качество данных'],
    ['method', 'Методика'],
];

/** @type {{ loadRecords?: Function, loadFiles?: Function, loadBlacklistInns?: Function, openInnHistory?: Function, reprocess?: Function, notify?: Function }} */
let api = {};

const st = {
    all: [],
    filtered: [],
    byId: new Map(),
    insights: null,
    tab: 'overview',
    grain: 'week',
    filter: { period: 'all', from: '', to: '', innOnly: false, query: '' },
    drill: null,
    drillPage: 1,
    computing: null,
    seq: 0,
};

export function setClientAnalyticsDashboardApi(a) {
    api = { ...api, ...a };
}

// ---------------------------------------------------------------------------
// Расчёт (воркер с запасным вариантом в основном потоке)
// ---------------------------------------------------------------------------
function slimRecord(r) {
    return {
        id: r.id,
        inn: r.inn,
        kpp: r.kpp,
        inns: r.inns,
        phones: r.phones,
        emails: r.emails,
        question: r.question,
        uploadedAt: r.uploadedAt,
        sourceFileId: r.sourceFileId,
        appealDate: r.appealDate,
        appealTime: r.appealTime,
        appealDateSource: r.appealDateSource,
        parserVersion: r.parserVersion,
    };
}

function runInsights(records, opts, onProgress) {
    const slim = records.map(slimRecord);
    if (typeof Worker === 'undefined' || slim.length < 1500) {
        return Promise.resolve(computeInsights(slim, { ...opts, onProgress }));
    }
    return new Promise((resolve) => {
        let worker;
        try {
            worker = new Worker(new URL('./client-analytics-insights-worker.js', import.meta.url), { type: 'module' });
        } catch {
            resolve(computeInsights(slim, { ...opts, onProgress }));
            return;
        }
        const id = ++st.seq;
        const fallback = (why) => {
            console.warn('[client-analytics] аналитика в основном потоке:', why);
            worker.terminate();
            resolve(computeInsights(slim, { ...opts, onProgress }));
        };
        worker.onmessage = (e) => {
            const d = e.data || {};
            if (d.id !== id) return;
            if (d.progress) {
                onProgress(d.phase, d.pct);
                return;
            }
            worker.terminate();
            if (d.ok) resolve(d.result);
            else fallback(d.error);
        };
        worker.onerror = (e) => fallback((e && e.message) || 'worker error');
        worker.postMessage({ id, records: slim, opts });
    });
}

function applyFilter(records, f) {
    let from = null;
    let to = null;
    if (f.period === 'custom') {
        from = f.from || null;
        to = f.to || null;
    } else if (f.period !== 'all') {
        // «последние N дней» — относительно самой поздней даты в базе, а не сегодняшнего дня
        let max = null;
        for (const r of records) {
            const d = effectiveDate(r).ymd;
            if (d && (!max || d > max)) max = d;
        }
        if (max) {
            const days = Number(f.period);
            const dt = new Date(`${max}T00:00:00Z`);
            dt.setUTCDate(dt.getUTCDate() - days + 1);
            from = dt.toISOString().slice(0, 10);
            to = max;
        }
    }
    const q = normalizeForAnalysis(f.query || '').trim();
    const qDigits = q.replace(/\D/g, '');
    return records.filter((r) => {
        if (f.innOnly && !r.inn) return false;
        if (from || to) {
            const d = effectiveDate(r).ymd;
            if (!d || (from && d < from) || (to && d > to)) return false;
        }
        if (q) {
            const hay = normalizeForAnalysis(`${r.question || ''} ${r.inn || ''} ${r.kpp || ''} ${(r.emails || []).join(' ')}`);
            if (!hay.includes(q) && !(qDigits.length >= 5 && (r.phones || []).some((p) => p.includes(qDigits)))) return false;
        }
        return true;
    });
}

async function recompute() {
    const body = document.getElementById('caInsBody');
    const prog = document.getElementById('caInsProgress');
    st.filtered = applyFilter(st.all, st.filter);
    const token = ++st.seq;
    if (prog) {
        prog.hidden = false;
        prog.querySelector('[data-role="phase"]').textContent = 'Подготовка…';
        prog.querySelector('[data-role="bar"]').style.width = '2%';
    }
    let blacklistInns = [];
    try {
        blacklistInns = api.loadBlacklistInns ? await api.loadBlacklistInns() : [];
    } catch {
        blacklistInns = [];
    }
    const result = await runInsights(st.filtered, { blacklistInns, now: Date.now() }, (phase, pct) => {
        if (!prog || token !== st.seq) return;
        prog.querySelector('[data-role="phase"]').textContent = phase;
        prog.querySelector('[data-role="bar"]').style.width = `${Math.max(2, pct)}%`;
    });
    if (token !== st.seq && st.insights) return; // устаревший расчёт
    st.insights = result;
    if (prog) prog.hidden = true;
    const meta = document.getElementById('caInsMeta');
    if (meta) {
        meta.textContent = `${fmt.int(result.overview.records)} из ${fmt.int(st.all.length)} обращений · расчёт ${fmt.num1(result.computeMs / 1000)} с · ${new Date(result.computedAt).toLocaleString('ru-RU')}`;
    }
    if (body) renderTab();
}

// ---------------------------------------------------------------------------
// Каркас окна
// ---------------------------------------------------------------------------
function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-stretch justify-center p-2 sm:p-4';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'caInsTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.tabIndex = -1;
    modal.innerHTML = `
<div class="ca-ins-shell ca-viz bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col w-full min-h-0">
  <header class="ca-ins-head">
    <div class="min-w-0">
      <h2 id="caInsTitle" class="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 m-0">Аналитика обращений</h2>
      <p id="caInsMeta" class="ca-viz-muted text-xs m-0 mt-0.5">Расчёт…</p>
    </div>
    <div class="ca-ins-actions">
      <button type="button" class="ca-ins-btn" data-ins-action="recompute" title="Перечитать базу и пересчитать"><i class="fas fa-rotate" aria-hidden="true"></i><span>Пересчитать</span></button>
      <button type="button" class="ca-ins-btn" data-ins-action="export-json" title="Сводный отчёт в JSON"><i class="fas fa-file-code" aria-hidden="true"></i><span>Отчёт JSON</span></button>
      <button type="button" class="ca-ins-btn" data-ins-action="export-csv" title="Признаки каждой записи в CSV (Excel)"><i class="fas fa-file-csv" aria-hidden="true"></i><span>Записи CSV</span></button>
      <button type="button" class="ca-ins-btn ca-ins-btn-icon" data-ins-action="close" aria-label="Закрыть аналитику"><i class="fas fa-times" aria-hidden="true"></i></button>
    </div>
  </header>
  <form class="ca-ins-filters" id="caInsFilters" onsubmit="return false">
    <label class="ca-ins-field"><span>Период</span>
      <select name="period">
        <option value="all">Всё время</option><option value="7">7 дней</option><option value="30">30 дней</option>
        <option value="90">90 дней</option><option value="365">365 дней</option><option value="custom">Свой диапазон</option>
      </select></label>
    <label class="ca-ins-field" data-role="custom" hidden><span>с</span><input type="date" name="from"></label>
    <label class="ca-ins-field" data-role="custom" hidden><span>по</span><input type="date" name="to"></label>
    <label class="ca-ins-field ca-ins-grow"><span>Текст, ИНН, телефон</span><input type="search" name="query" placeholder="например: требование или 7707083893" autocomplete="off"></label>
    <label class="ca-ins-check"><input type="checkbox" name="innOnly"> только с ИНН</label>
    <button type="button" class="ca-ins-btn ca-ins-btn-primary" data-ins-action="apply">Применить</button>
  </form>
  <div class="ca-ins-tabs" role="tablist" aria-label="Разделы аналитики">
    ${TABS.map(([id, label], i) => `<button type="button" role="tab" id="caInsTab-${id}" aria-controls="caInsBody" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-ins-tab="${id}">${escapeHtml(label)}</button>`).join('')}
  </div>
  <div class="ca-ins-main">
    <div id="caInsBody" class="ca-ins-body custom-scrollbar" role="tabpanel" tabindex="0"></div>
    <aside id="caInsDrawer" class="ca-ins-drawer custom-scrollbar" hidden aria-label="Записи выборки"></aside>
    <div id="caInsProgress" class="ca-ins-progress" hidden role="status" aria-live="polite">
      <div class="ca-ins-progress-card"><p data-role="phase" class="m-0 text-sm"></p><div class="ca-ins-progress-track"><div data-role="bar" class="ca-ins-progress-bar"></div></div></div>
    </div>
  </div>
</div>`;
    document.body.appendChild(modal);
    bindModal(modal);
    return modal;
}

let resizeTimer = 0;
let lastBodyWidth = 0;
function onWindowResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const modal = document.getElementById(MODAL_ID);
        const body = document.getElementById('caInsBody');
        if (!modal || modal.classList.contains('hidden') || !body || !st.insights) return;
        if (Math.abs(body.clientWidth - lastBodyWidth) < 24) return;
        lastBodyWidth = body.clientWidth;
        const top = body.scrollTop;
        renderTab();
        body.scrollTop = top;
    }, 200);
}

function bindModal(modal) {
    window.addEventListener('resize', onWindowResize);
    bindVizTooltips(modal.querySelector('#caInsBody'));
    bindVizTooltips(modal.querySelector('#caInsDrawer'));
    modal.addEventListener('click', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t === modal) return closeClientAnalyticsInsights();
        const act = t.closest('[data-ins-action]');
        if (act) {
            const a = act.getAttribute('data-ins-action');
            if (a === 'close') return closeClientAnalyticsInsights();
            if (a === 'recompute') return reload();
            if (a === 'apply') return readFiltersAndRecompute();
            if (a === 'export-json') return exportJson();
            if (a === 'export-csv') return exportCsv();
            if (a === 'reprocess') return reprocessAll(act);
            if (a === 'drawer-close') return closeDrawer();
            if (a === 'drawer-more') {
                st.drillPage++;
                return renderDrawer();
            }
            if (a === 'drawer-back') return renderDrawer();
            if (a === 'grain') {
                st.grain = act.getAttribute('data-grain');
                return renderTab();
            }
            if (a === 'open-inn') {
                const inn = act.getAttribute('data-inn');
                if (api.openInnHistory && inn) api.openInnHistory(inn);
                return;
            }
        }
        const tab = t.closest('[data-ins-tab]');
        if (tab) return selectTab(tab.getAttribute('data-ins-tab'));
        const rec = t.closest('[data-ins-record]');
        if (rec) return renderXray(Number(rec.getAttribute('data-ins-record')));
        const drill = t.closest('[data-ca-drill]');
        if (drill) return openDrill(drill.getAttribute('data-ca-drill'), drill.getAttribute('aria-label') || drill.getAttribute('data-tip') || '');
    });
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            const drawer = document.getElementById('caInsDrawer');
            if (drawer && !drawer.hidden) closeDrawer();
            else closeClientAnalyticsInsights();
            return;
        }
        const tabBtn = e.target instanceof Element ? e.target.closest('[role="tab"]') : null;
        if (tabBtn && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
            const ids = TABS.map((x) => x[0]);
            const i = ids.indexOf(tabBtn.getAttribute('data-ins-tab'));
            const next = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
            selectTab(next);
            document.getElementById(`caInsTab-${next}`)?.focus();
            e.preventDefault();
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.matches('tr[data-ca-drill]')) {
            e.preventDefault();
            openDrill(e.target.getAttribute('data-ca-drill'), '');
        }
        if (e.key === 'Enter' && e.target instanceof Element && e.target.matches('#caInsFilters input')) {
            e.preventDefault();
            readFiltersAndRecompute();
        }
    });
    const form = modal.querySelector('#caInsFilters');
    form.period.addEventListener('change', () => {
        const custom = form.period.value === 'custom';
        form.querySelectorAll('[data-role="custom"]').forEach((el) => (el.hidden = !custom));
        if (!custom) readFiltersAndRecompute();
    });
    form.innOnly.addEventListener('change', readFiltersAndRecompute);
}

function readFiltersAndRecompute() {
    const form = document.getElementById('caInsFilters');
    if (!form) return;
    st.filter = {
        period: form.period.value,
        from: form.from.value,
        to: form.to.value,
        innOnly: form.innOnly.checked,
        query: form.query.value.trim(),
    };
    closeDrawer();
    recompute();
}

function selectTab(id) {
    st.tab = id;
    document.querySelectorAll(`#${MODAL_ID} [data-ins-tab]`).forEach((b) => {
        const on = b.getAttribute('data-ins-tab') === id;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
    });
    document.getElementById('caInsBody')?.setAttribute('aria-labelledby', `caInsTab-${id}`);
    renderTab();
}

async function reload() {
    st.all = api.loadRecords ? await api.loadRecords({ force: true }) : [];
    st.byId = new Map(st.all.map((r) => [r.id, r]));
    closeDrawer();
    await recompute();
}

/** Открыть дашборд. */
export async function openClientAnalyticsInsights() {
    const modal = ensureModal();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden', 'modal-open');
    activateModalFocus(modal);
    document.getElementById('caInsBody').innerHTML = '';
    await reload();
}

export function closeClientAnalyticsInsights() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    deactivateModalFocus(modal);
    st.seq++; // отменяет отображение незавершённого расчёта
    requestAnimationFrame(() => {
        const anyOpen = [...document.querySelectorAll('[id$="Modal"]')].some((m) => !m.classList.contains('hidden') && m.getAttribute('aria-hidden') !== 'true' && m.offsetParent !== null);
        if (!anyOpen) document.body.classList.remove('overflow-hidden', 'modal-open');
    });
}

// ---------------------------------------------------------------------------
// Вкладки
// ---------------------------------------------------------------------------
function section(title, inner, { note = '', wide = false, id = '' } = {}) {
    return `<section class="ca-ins-card${wide ? ' is-wide' : ''}"${id ? ` id="${id}"` : ''}><h3 class="ca-ins-card-title">${escapeHtml(title)}</h3>${note ? `<p class="ca-ins-card-note">${note}</p>` : ''}${inner}</section>`;
}

function pval(p) {
    if (p < 0.001) return 'p < 0,001';
    return `p = ${fmt.num2(p)}`;
}

function renderTab() {
    const body = document.getElementById('caInsBody');
    const I = st.insights;
    if (!body || !I) return;
    if (!I.overview.records) {
        body.innerHTML = `<div class="ca-ins-empty"><p class="text-base font-semibold">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА</p><p class="ca-viz-muted">В выбранной выборке нет обращений. Измените фильтры или загрузите файлы .txt.</p></div>`;
        return;
    }
    // графики строятся под фактическую ширину карточек (без растяжения текста в SVG)
    const inner = Math.max(280, body.clientWidth - 32 - 34);
    const twoCols = body.clientWidth >= 1100;
    setChartWidths({ wide: inner, half: twoCols ? (inner - 14) / 2 : inner });
    const map = { overview: renderOverview, time: renderTime, clients: renderClients, topics: renderTopics, text: renderText, dups: renderDups, quality: renderQuality, method: renderMethod };
    body.innerHTML = `<div class="ca-ins-grid">${(map[st.tab] || renderOverview)(I)}</div>`;
    body.scrollTop = 0;
    lastBodyWidth = body.clientWidth;
}

function conclusions(I) {
    const o = I.overview;
    const out = [];
    if (o.dateReliable < 0.5) {
        out.push(['warning', `У ${fmt.pct(1 - o.dateReliable, 0)} записей нет даты обращения в тексте или имени файла — для динамики взята дата загрузки. Выводы о трендах по ним ненадёжны.`]);
    }
    const tr = I.time.trend;
    if (!I.time.insufficient && tr) {
        if (tr.trend === 'нет') out.push(['info', `Статистически значимого тренда нет (тест Манна — Кендалла, ${pval(tr.p)}, ${tr.points} точек: ${tr.basis}).`]);
        else out.push([tr.trend === 'рост' ? 'warning' : 'good', `Значимый ${tr.trend === 'рост' ? 'рост' : 'спад'} обращений: ${tr.slope > 0 ? '+' : ''}${fmt.num2(tr.slope)} в ${tr.basis === 'дни' ? 'день' : 'неделю'} по наклону Тейла — Сена (${pval(tr.p)}).`]);
    } else out.push(['info', 'Период меньше 14 дней — тренд и сезонность не оцениваются.']);
    if (I.time.changePoint && I.time.changePoint.significant) {
        out.push(['info', `Смена уровня около ${fmt.date(I.time.changePoint.at)}: в среднем ${fmt.num1(I.time.changePoint.before)} → ${fmt.num1(I.time.changePoint.after)} за ${I.time.trend.basis === 'дни' ? 'день' : 'неделю'}.`]);
    }
    if (I.time.anomalies && I.time.anomalies.length) {
        const a = I.time.anomalies[0];
        out.push(['warning', `Самый сильный всплеск: ${fmt.date(a.date)} — ${fmt.int(a.count)} обращений (робастный z = ${fmt.num1(a.z)}). Всего всплесков: ${I.time.anomalies.length}.`]);
    }
    const c = I.clients;
    if (c.total >= 10) {
        out.push(['info', `Концентрация: 20% самых активных клиентов дают ${fmt.pct(c.top20pctShare, 0)} обращений (Джини ${fmt.num2(c.gini)}). Повторно обращались ${fmt.pct(o.repeatRate, 0)} клиентов.`]);
        if (c.gapsCount >= 10) out.push(['info', `Повторное обращение того же клиента: медиана через ${fmt.num1(c.gaps.median)} дн.; в течение 7 дней — ${fmt.pct(c.returnWithin7, 0)} повторов (возможный признак нерешённого вопроса).`]);
    }
    const rising = I.topics.list.filter((t) => t.significant && t.deltaPp > 0).sort((a, b) => b.deltaPp - a.deltaPp);
    if (rising.length) out.push(['warning', `Растущие темы за последние 30 дней: ${rising.slice(0, 3).map((t) => `«${t.label}» (+${fmt.num1(t.deltaPp)} п.п.)`).join(', ')}.`]);
    if (I.text.emerging && I.text.emerging.rising.length) out.push(['info', `Новые/учащающиеся слова (G² Даннинга): ${I.text.emerging.rising.slice(0, 6).map((x) => x.word).join(', ')}.`]);
    if (I.duplicates.templates.length) out.push(['info', `Самый частый повторяющийся вопрос встречается ${fmt.int(I.duplicates.templates[0].count)} раз — кандидат в шаблон ответа/статью базы знаний.`]);
    const qBad = I.quality.checks.filter((x) => x.level === 'serious' && x.count > 0);
    if (qBad.length) out.push(['serious', `Проблемы данных: ${qBad.map((x) => `${x.label.toLowerCase()} — ${fmt.int(x.count)}`).join('; ')}.`]);
    if (!I.clusters.insufficient) out.push(['info', `Найдено ${I.clusters.k} смысловых групп (силуэт ${fmt.num2(I.clusters.silhouette)} — ${I.clusters.silhouette > 0.5 ? 'чёткие' : I.clusters.silhouette > 0.25 ? 'умеренно различимые' : 'перекрывающиеся'}).`]);
    return out;
}

const LEVEL_ICON = { good: 'fa-circle-check', info: 'fa-circle-info', warning: 'fa-triangle-exclamation', serious: 'fa-circle-exclamation' };
const LEVEL_TEXT = { good: 'хорошо', info: 'к сведению', warning: 'внимание', serious: 'важно' };

function renderOverview(I) {
    const o = I.overview;
    const tr = I.time.trend;
    const tiles = [
        statTile('Обращений', fmt.int(o.records), fmt.plural(o.files, ['файл', 'файла', 'файлов'])),
        statTile('Клиентов (ИНН)', fmt.int(o.clients), `без ИНН: ${fmt.int(o.noInn)} (${fmt.pct(o.noInnShare)})`),
        statTile('Повторные клиенты', fmt.pct(o.repeatRate, 0), `${fmt.int(o.repeatClients)} обращались ≥ 2 раз`),
        statTile('На клиента', `${fmt.num1(o.appealsPerClient.median)} / ${fmt.num1(o.appealsPerClient.mean)}`, 'медиана / среднее', { tip: `максимум ${fmt.int(o.appealsPerClient.max)}, 90-й перцентиль ${fmt.num1(o.appealsPerClient.p90)}` }),
        statTile('Период', o.from ? `${fmt.date(o.from)} — ${fmt.date(o.to)}` : '—', `${fmt.int(o.spanDays)} дн.`),
        statTile('В активный день', o.perActiveDay ? fmt.num1(o.perActiveDay.median) : '—', o.perActiveDay ? `медиана; пик ${fmt.int(o.perActiveDay.max)}` : ''),
        statTile('Тренд', I.time.insufficient ? 'мало данных' : tr.trend === 'нет' ? 'нет' : tr.trend, I.time.insufficient ? '' : pval(tr.p), { tone: tr && tr.trend === 'рост' ? 'warning' : '' }),
        statTile('Полнота данных', fmt.pct(I.quality.completeness, 0), 'ИНН, вопрос, контакт, дата'),
        statTile('Срочные', fmt.int(o.urgent), fmt.pct(o.records ? o.urgent / o.records : 0)),
        statTile('Негативные', fmt.int(o.negative), fmt.pct(o.records ? o.negative / o.records : 0)),
    ].join('');
    const concl = conclusions(I)
        .map(([lvl, text]) => `<li class="ca-ins-concl lvl-${lvl}"><i class="fas ${LEVEL_ICON[lvl]}" aria-hidden="true"></i><span class="sr-only">${LEVEL_TEXT[lvl]}: </span><span>${escapeHtml(text)}</span></li>`)
        .join('');
    const weekly = I.time.weekly.map((w) => ({ x: w.week, y: w.count, muted: w.partial, tip: `неделя с ${fmt.date(w.week)}: ${fmt.int(w.count)}${w.partial ? ' (неполная)' : ''}`, drill: `week:${w.week}` }));
    return [
        `<div class="ca-ins-tiles is-wide">${tiles}</div>`,
        section('Главные выводы', `<ul class="ca-ins-concls">${concl}</ul>`, { wide: true, note: 'Каждый вывод — результат статистического теста или порога, описанного во вкладке «Методика».' }),
        section('Обращения по неделям', timeSeries(weekly, { height: 180, ariaLabel: 'Обращения по неделям' }), { wide: true }),
        section('Темы', topicBars(I, 8)),
        section('Намерения', barsH(I.topics.intents.map((t) => ({ label: t.label, value: t.count, drill: `intent:${t.id}` })), { showShare: o.records })),
    ].join('');
}

function topicBars(I, limit = 99) {
    return barsH(
        I.topics.list.slice(0, limit).map((t) => ({ label: t.label, value: t.count, drill: `topic:${t.id}`, tip: `${t.label}: ${fmt.int(t.count)} (${fmt.pct(t.share)}; 95% ДИ ${fmt.pct(t.lo)}–${fmt.pct(t.hi)})` })),
        { showShare: I.overview.records },
    );
}

function renderTime(I) {
    const T = I.time;
    const grainBtns = ['day', 'week', 'month']
        .map((g) => `<button type="button" class="ca-ins-seg${st.grain === g ? ' is-on' : ''}" data-ins-action="grain" data-grain="${g}" aria-pressed="${st.grain === g}">${{ day: 'дни', week: 'недели', month: 'месяцы' }[g]}</button>`)
        .join('');
    const anomalies = new Set((T.anomalies || []).map((a) => a.date));
    let pts;
    if (st.grain === 'day') pts = T.daily.map((d) => ({ x: d.date, y: d.count, smooth: d.ma7, flag: anomalies.has(d.date), tip: `${fmt.date(d.date)} (${WEEKDAYS[(new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7]}): ${fmt.int(d.count)} · среднее за 7 дн. ${fmt.num1(d.ma7)}${anomalies.has(d.date) ? ` · всплеск, z = ${fmt.num1(d.z)}` : ''}`, drill: `day:${d.date}` }));
    else if (st.grain === 'week') pts = T.weekly.map((w) => ({ x: w.week, y: w.count, muted: w.partial, tip: `неделя с ${fmt.date(w.week)}: ${fmt.int(w.count)}${w.partial ? ' (неполная неделя)' : ''}`, drill: `week:${w.week}` }));
    else pts = T.monthly.map((m) => ({ x: m.month, y: m.count, tip: `${fmt.month(m.month)}: ${fmt.int(m.count)}`, drill: `month:${m.month}` }));
    const chart = timeSeries(pts, { height: 240, xFmt: st.grain === 'month' ? fmt.month : fmt.date, smoothLabel: 'скользящее среднее за 7 дней' });
    const tr = T.trend || {};
    const stats = table(
        ['Показатель', 'Значение', 'Как читать'],
        [
            { cells: ['Тест Манна — Кендалла', T.insufficient ? '—' : `S = ${fmt.int(tr.s)}, z = ${fmt.num2(tr.z)}, ${pval(tr.p)}`, 'p < 0,05 — монотонный тренд статистически значим'] },
            { cells: ['Наклон Тейла — Сена', T.insufficient ? '—' : `${tr.slope > 0 ? '+' : ''}${fmt.num2(tr.slope)} за ${tr.basis === 'дни' ? 'день' : 'неделю'}`, 'устойчивая к выбросам оценка скорости изменения'] },
            { cells: ['МНК-регрессия', T.insufficient ? '—' : `наклон ${fmt.num2(tr.olsSlope)}, R² = ${fmt.num2(tr.r2)}`, 'R² — доля изменчивости, объяснённая линейным трендом'] },
            { cells: ['Точка смены уровня (CUSUM)', T.changePoint ? `${fmt.date(T.changePoint.at)}: ${fmt.num1(T.changePoint.before)} → ${fmt.num1(T.changePoint.after)} (эффект ${fmt.num2(T.changePoint.effect)} σ${T.changePoint.significant ? '' : ', незначимо'})` : '—', 'эффект ≥ 0,8 σ считается существенным'] },
            { cells: ['Индекс дисперсии', fmt.num2(T.dispersion), '≈ 1 — случайный (пуассоновский) поток; > 1 — обращения приходят волнами'] },
            { cells: ['Автокорреляция, лаг 7 дн.', fmt.num2(T.acf7), '> 0,3 — выраженная недельная сезонность'] },
            { cells: ['Текущий уровень (EWMA, α = 0,25)', `${fmt.num1(T.level)} в день`, 'сглаженная оценка «сейчас»'] },
            { cells: ['Будни: χ² равномерности', `χ² = ${fmt.num1(T.weekdayTest.chi2)}, ${pval(T.weekdayTest.p)}`, 'p < 0,05 — нагрузка по будням неравномерна'] },
        ],
    );
    const wd = columns(T.weekday.map((v, i) => ({ label: WEEKDAYS[i], value: v, drill: `wd:${i}` })), { height: 170, ariaLabel: 'Обращения по дням недели' });
    const parts = [
        section('Динамика обращений', `<div class="ca-ins-seggroup" role="group" aria-label="Шаг графика">${grainBtns}</div>${chart}`, { wide: true, note: I.overview.dateReliable < 0.5 ? '⚠ Большинство записей без даты обращения: ряд построен по датам загрузки файлов.' : `Дата обращения из текста/файла у ${fmt.pct(I.overview.dateReliable, 0)} записей.` }),
        section('Статистика ряда', stats, { wide: true }),
        section('По дням недели', wd),
    ];
    if (T.hasTime) {
        parts.push(section('По часам', columns(T.hourly.map((v, h) => ({ label: String(h), value: v, drill: `hour:${h}` })), { height: 170, labelEvery: 2, ariaLabel: 'Обращения по часам' }), { note: `Время указано у ${fmt.int(T.withTime)} записей.` }));
        parts.push(section('День недели × час', heatmap(T.heat, WEEKDAYS, Array.from({ length: 24 }, (_, h) => String(h)), { drillFmt: (r, c) => `heat:${r}:${c}`, ariaLabel: 'Тепловая карта по дням недели и часам' }), { wide: true }));
    } else {
        parts.push(section('По часам', '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: время обращения указано менее чем у 20 записей.</p>'));
    }
    if (T.anomalies && T.anomalies.length) {
        parts.push(section('Всплески', table(['Дата', 'Обращений', 'Робастный z'], T.anomalies.map((a) => ({ cells: [fmt.date(a.date), fmt.int(a.count), fmt.num1(a.z)], drill: `day:${a.date}` })), { numeric: [1, 2] })));
    }
    return parts.join('');
}

function renderClients(I) {
    const C = I.clients;
    const tiles = [
        statTile('Коэффициент Джини', fmt.num2(C.gini), '0 — поровну, 1 — всё у одного'),
        statTile('Индекс HHI', fmt.num2(C.hhi * 10000), '< 1500 — низкая концентрация'),
        statTile('Топ-1% клиентов', fmt.pct(C.top1pctShare, 0), 'доля обращений'),
        statTile('Топ-10% клиентов', fmt.pct(C.top10pctShare, 0), 'доля обращений'),
        statTile('Повтор ≤ 7 дней', fmt.pct(C.returnWithin7, 0), `из ${fmt.int(C.gapsCount)} повторов`),
        statTile('Медианный интервал', C.gapsCount ? `${fmt.num1(C.gaps.median)} дн.` : '—', 'между обращениями клиента'),
        statTile('ЮЛ / ФЛ-ИП', `${fmt.int(C.kinds['ЮЛ'])} / ${fmt.int(C.kinds['ФЛ/ИП'])}`, 'по длине ИНН'),
        statTile('Связанные клиенты', fmt.int(C.linkedClients), `${fmt.int(C.linkedGroups.length)} групп с общими контактами`),
    ].join('');
    const top = table(
        ['ИНН', 'Обращ.', 'Первое', 'Последнее', 'Темы', 'Регион', ''],
        C.top.map((c) => ({
            cells: [
                { html: `<button type="button" class="ca-ins-link" data-ins-action="open-inn" data-inn="${escapeHtml(c.inn)}">${escapeHtml(c.inn)}</button>${c.valid ? '' : ' <span class="ca-ins-badge lvl-serious" title="Контрольная сумма ИНН не сходится">КС</span>'}${c.blacklisted ? ' <span class="ca-ins-badge lvl-warning">ЧС</span>' : ''}` },
                fmt.int(c.count),
                fmt.date(c.first),
                fmt.date(c.last),
                c.topics.join(', ') || '—',
                c.region || '—',
                { html: `<button type="button" class="ca-ins-link" data-ca-drill="inn:${escapeHtml(c.inn)}">записи</button>` },
            ],
        })),
        { numeric: [1] },
    );
    const groups = C.linkedGroups.length
        ? table(
              ['Клиентов', 'Обращений', 'ИНН', 'Общие контакты'],
              C.linkedGroups.map((g, i) => ({ cells: [fmt.int(g.size), fmt.int(g.appeals), g.inns.slice(0, 6).join(', ') + (g.inns.length > 6 ? ` и ещё ${g.inns.length - 6}` : ''), g.shared.map((s) => (/^\d{11}$/.test(s) ? formatRussianPhoneForDisplay(s) : s)).join(', ')], drill: `group:${i}` })),
              { numeric: [0, 1] },
          )
        : '<p class="ca-viz-empty">Общих телефонов и почты у разных ИНН не найдено.</p>';
    const hubs = C.hubContacts.length
        ? `<p class="ca-ins-card-note">Контакты, встречающиеся у 30+ клиентов (номер поддержки, крупная бухфирма), в связи не учитываются: ${C.hubContacts.map((h) => `${escapeHtml(h.kind === 'phone' ? formatRussianPhoneForDisplay(h.contact) : h.contact)} (${fmt.int(h.clients)})`).join(', ')}.</p>`
        : '';
    return [
        `<div class="ca-ins-tiles is-wide">${tiles}</div>`,
        section('Кривая Лоренца', lorenzChart(C.lorenz, C.gini), { note: 'Чем дальше кривая от диагонали, тем сильнее обращения сосредоточены у немногих клиентов.' }),
        section('Сколько раз обращались клиенты', columns(C.repeatBuckets.map((b, i) => ({ label: b.label, value: b.clients, drill: `repeat:${i}`, tip: `${b.label} обращ.: ${fmt.int(b.clients)} клиентов` })), { height: 200, ariaLabel: 'Распределение клиентов по числу обращений' })),
        section('Регион по ИНН', barsH(C.regions.slice(0, 15).map((r) => ({ label: r.name, value: r.count, drill: `region:${r.name}` })), { showShare: C.total }), { note: 'Регион, где присвоен ИНН (при переезде ИНН не меняется).' }),
        section('Регион и причина по КПП', `${barsH(C.kppRegions.slice(0, 8).map((r) => ({ label: r.name, value: r.count })))}<h4 class="ca-ins-subtitle">Причина постановки на учёт (5–6 знаки КПП)</h4>${barsH(C.kppReasons.map((r) => ({ label: r.name, value: r.count })))}`),
        section('Самые активные клиенты', top, { wide: true }),
        section('Клиенты с общими контактами', groups + hubs, { wide: true, note: 'Компоненты связности графа «ИНН — телефон/почта» (система непересекающихся множеств).' }),
    ].join('');
}

function renderTopics(I) {
    const T = I.topics;
    const trendRows = T.list.map((t) => ({
        cells: [
            t.label,
            fmt.int(t.count),
            `${fmt.pct(t.share)} (${fmt.pct(t.lo)}–${fmt.pct(t.hi)})`,
            T.recentN && T.prevN ? `${fmt.pct(t.sharePrev)} → ${fmt.pct(t.shareRecent)}` : '—',
            T.recentN && T.prevN ? { html: `<span class="${t.significant ? (t.deltaPp > 0 ? 'ca-ins-up' : 'ca-ins-down') : ''}">${t.deltaPp > 0 ? '▲ +' : t.deltaPp < 0 ? '▼ ' : ''}${fmt.num1(t.deltaPp)} п.п.${t.significant ? ' *' : ''}</span>` } : '—',
        ],
        drill: `topic:${t.id}`,
    }));
    const clusters = I.clusters.insufficient
        ? '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: для кластеризации нужно не меньше 30 обращений с содержательным текстом.</p>'
        : `<div class="ca-ins-clusters">${I.clusters.list
              .map(
                  (c) => `<button type="button" class="ca-ins-cluster" data-ca-drill="cluster:${c.id}" aria-label="${escapeHtml(`Группа «${c.label}»: ${c.size} обращений. Показать`)}">
  <span class="ca-ins-cluster-head"><span class="ca-ins-cluster-size">${fmt.int(c.size)}</span><span class="ca-viz-muted">${fmt.pct(c.share)} · связность ${fmt.num2(c.cohesion)}</span></span>
  <span class="ca-ins-cluster-terms">${c.terms.map((t, i) => `<span class="ca-ins-term w${Math.max(1, 4 - Math.floor(i / 2))}">${escapeHtml(t.word)}</span>`).join('')}</span>
</button>`,
              )
              .join('')}</div>`;
    const co = T.cooccurrence.length
        ? table(['Тема', 'вместе с темой', 'Обращений', 'Жаккар'], T.cooccurrence.map((c) => ({ cells: [c.a, c.b, fmt.int(c.count), fmt.num2(c.jaccard)], drill: `topicpair:${c.aId}:${c.bId}` })), { numeric: [2, 3] })
        : '<p class="ca-viz-empty">Темы почти не пересекаются.</p>';
    const urg = columns(['0 — обычное', '1', '2', '3', '4+ — критично'].map((l, i) => ({ label: l, value: T.urgencyDist[i] })), { height: 160, ariaLabel: 'Распределение срочности' });
    return [
        section('Темы обращений', topicBars(I), { note: `Рубрикатор по словарю предметной области; одно обращение может относиться к нескольким темам. Без темы: ${fmt.int(T.untagged)} (${fmt.pct(T.untaggedShare)}). Разнообразие тем (норм. энтропия): ${fmt.num2(T.diversity)}.` }),
        section('Намерения', barsH(T.intents.map((t) => ({ label: t.label, value: t.count, drill: `intent:${t.id}` })), { showShare: I.overview.records })),
        section('Изменение долей тем: 30 дней против предыдущих 30', table(['Тема', 'Всего', 'Доля (95% ДИ Уилсона)', 'Доля: было → стало', 'Изменение'], trendRows, { numeric: [1] }) + '<p class="ca-ins-card-note">* — изменение значимо (G² Даннинга > 3,84, p < 0,05; в каждом окне ≥ 20 обращений).</p>', { wide: true }),
        section(`Смысловые группы (k-means, k = ${I.clusters.k || '—'})`, clusters, { wide: true, note: I.clusters.insufficient ? '' : `Сферический k-means по TF-IDF основ слов (${fmt.int(I.clusters.vocabulary)} признаков), k выбран по силуэту (${fmt.num2(I.clusters.silhouette)}). Вне групп (мало слов): ${fmt.int(I.clusters.unclustered)}.` }),
        section('Срочность', urg, { note: `Срочных (≥ 2 баллов): ${fmt.int(T.urgent)}. Негативная окраска: ${fmt.int(T.negative)}.` }),
        section('Совместная встречаемость тем', co),
        section('Матрица тем', heatmap(T.matrix, T.matrixLabels.map((l) => l.split(/[,(]/)[0].trim()), T.matrixLabels.map((_, i) => String(i + 1)), { cellLabel: false, tipFmt: (r, c, v) => `${T.matrixLabels[r]} × ${T.matrixLabels[c]}: ${fmt.int(v)}`, drillFmt: (r, c) => `topicpair:${TOPICS[r].id}:${TOPICS[c].id}`, ariaLabel: 'Матрица совместной встречаемости тем' }), { wide: true, note: 'Столбцы пронумерованы в том же порядке, что и строки; диагональ — число обращений темы.' }),
    ].join('');
}

function renderText(I) {
    const X = I.text;
    const tiles = [
        statTile('Словоупотреблений', fmt.int(X.totalTokens), `значимых: ${fmt.int(X.contentTokens)}`),
        statTile('Словарь (основ)', fmt.int(X.vocabulary), `гапаксов ${fmt.pct(X.hapaxShare, 0)}`, { tip: 'Гапакс — основа, встретившаяся один раз' }),
        statTile('TTR', fmt.num2(X.ttr), 'разнообразие словаря'),
        statTile('Энтропия', `${fmt.num2(X.entropy)} бит`, `нормир. ${fmt.num2(X.entropyNorm)}`),
        statTile('Закон Ципфа', `s = ${fmt.num2(X.zipf.exponent)}`, `R² = ${fmt.num2(X.zipf.r2)}`, { tip: 'Для живой речи s ≈ 1. Сильно меньше — много шаблонных фраз' }),
        statTile('Закон Хипса', `β = ${fmt.num2(X.heaps.beta)}`, `R² = ${fmt.num2(X.heaps.r2)}`, { tip: 'Рост словаря V = K·N^β; β ≈ 0,4–0,6 для естественного текста' }),
        statTile('Длина вопроса', `${fmt.int(X.lengthWords.median)} слов`, `медиана; символов ${fmt.int(X.lengthChars.median)}`),
        statTile('Смешанные слова', fmt.int(X.mixedWordsTotal), 'латиница внутри кириллицы'),
    ].join('');
    const hist = columns(X.lengthWordsHist.map((b, i) => ({ label: `${Math.round(b.x0)}`, value: b.count, drill: `len:${Math.round(b.x0)}:${Math.round(b.x1)}`, tip: `${Math.round(b.x0)}–${Math.round(b.x1) - 1} слов: ${fmt.int(b.count)}` })), { height: 180, labelEvery: Math.max(1, Math.ceil(X.lengthWordsHist.length / 12)), ariaLabel: 'Гистограмма длины вопросов' });
    const L = X.lengthWords;
    const lenTable = table(['', 'Слов', 'Символов'], [
        ['Среднее ± σ', `${fmt.num1(L.mean)} ± ${fmt.num1(L.sd)}`, `${fmt.num1(X.lengthChars.mean)} ± ${fmt.num1(X.lengthChars.sd)}`],
        ['Медиана (MAD)', `${fmt.num1(L.median)} (${fmt.num1(L.mad)})`, `${fmt.num1(X.lengthChars.median)} (${fmt.num1(X.lengthChars.mad)})`],
        ['Квартили Q1–Q3', `${fmt.num1(L.q1)}–${fmt.num1(L.q3)}`, `${fmt.num1(X.lengthChars.q1)}–${fmt.num1(X.lengthChars.q3)}`],
        ['90-й / 99-й перцентиль', `${fmt.num1(L.p90)} / ${fmt.num1(L.p99)}`, `${fmt.num1(X.lengthChars.p90)} / ${fmt.num1(X.lengthChars.p99)}`],
        ['Асимметрия / эксцесс', `${fmt.num2(L.skew)} / ${fmt.num2(L.kurt)}`, `${fmt.num2(X.lengthChars.skew)} / ${fmt.num2(X.lengthChars.kurt)}`],
        ['Предложений в вопросе (медиана)', fmt.num1(X.sentences.median), ''],
    ].map((c) => ({ cells: c })), { numeric: [1, 2] });
    const terms = barsH(X.topTerms.slice(0, 25).map((t) => ({ label: t.word, value: t.df, drill: `term:${t.stem}`, tip: `«${t.word}»: в ${fmt.int(t.df)} обращениях (${fmt.pct(t.share)}), всего ${fmt.int(t.tf)} раз, IDF ${fmt.num2(t.idf)}` })), { showShare: I.overview.records });
    const tfidf = `<div class="ca-ins-cloud">${X.tfidfTerms.map((t, i) => `<button type="button" class="ca-ins-term w${Math.max(1, 4 - Math.floor(i / 8))}" data-ca-drill="term:${escapeHtml(t.stem)}" data-tip="${escapeHtml(`TF-IDF ${fmt.num1(t.score)} · в ${fmt.int(t.df)} обращениях`)}">${escapeHtml(t.word)}</button>`).join('')}</div>`;
    const coll = table(['Словосочетание', 'Частота', 't-score', 'PMI'], X.collocations.map((c) => ({ cells: [c.phrase, fmt.int(c.f), fmt.num1(c.t), fmt.num2(c.pmi)], drill: `bigram:${c.key}` })), { numeric: [1, 2, 3] });
    const em = X.emerging;
    const emerging = em.insufficient
        ? '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: нужно ≥ 200 слов и в последних 30 днях, и до них.</p>'
        : `<div class="ca-ins-two">${table(['Учащается', 'сейчас', 'раньше', 'G²'], em.rising.map((e) => ({ cells: [e.word, fmt.int(e.recent), fmt.int(e.before), fmt.num1(e.g2)], drill: `term:${e.stem}` })), { numeric: [1, 2, 3] })}${table(['Уходит', 'сейчас', 'раньше', 'G²'], em.falling.map((e) => ({ cells: [e.word, fmt.int(e.recent), fmt.int(e.before), fmt.num1(e.g2)], drill: `term:${e.stem}` })), { numeric: [1, 2, 3] })}</div>`;
    const letters = barsH(X.letters.map((l) => ({ label: l.ch, value: l.pct, note: `эталон ${fmt.num2(l.ref)}%`, tip: `«${l.ch}»: ${fmt.num2(l.pct)}% (${fmt.int(l.count)}), в русском языке ${fmt.num2(l.ref)}%` })), { valueFmt: (v) => `${fmt.num2(v)}%` });
    const cc = X.charClass;
    const ccTotal = Object.values(cc).reduce((s, v) => s + v, 0) || 1;
    const chars = barsH([
        { label: 'Кириллица', value: cc.cyr },
        { label: 'Латиница', value: cc.lat },
        { label: 'Цифры', value: cc.digit },
        { label: 'Пробелы', value: cc.space },
        { label: 'Знаки препинания и символы', value: cc.punct },
        { label: 'Прочее', value: cc.other },
    ], { showShare: ccTotal });
    const mixed = X.mixedWords.length
        ? `<div class="ca-ins-cloud">${X.mixedWords.map((m) => `<span class="ca-ins-term is-mixed" data-tip="${escapeHtml(`${m.count} раз: ${[...m.word].map((ch) => (/[a-z]/i.test(ch) ? `${ch}(лат.)` : ch)).join('')}`)}">${escapeHtml(m.word)} <small>${fmt.int(m.count)}</small></span>`).join('')}</div><p class="ca-ins-card-note">Для анализа латинские двойники (a, c, e, o, p, x…) внутри русских слов заменяются на кириллицу, «1C» → «1С».</p>`
        : '<p class="ca-viz-empty">Смешанных слов нет.</p>';
    const typos = X.typos.length
        ? table(['Слово', 'раз', 'Вероятно', 'раз'], X.typos.map((t) => ({ cells: [t.word, fmt.int(t.count), t.likely, fmt.int(t.likelyCount)] })), { numeric: [1, 3] })
        : '<p class="ca-viz-empty">Кандидатов в опечатки не найдено.</p>';
    return [
        `<div class="ca-ins-tiles is-wide">${tiles}</div>`,
        section('Длина вопросов (слов)', hist),
        section('Распределение длины', lenTable),
        section('Самые частые слова', terms, { note: 'Доля — в скольких обращениях встречается основа (стоп-слова и вежливые формулы исключены).' }),
        section('Ключевые слова (TF-IDF)', tfidf, { note: 'Частые, но не повсеместные слова: характерная лексика базы.' }),
        section('Устойчивые словосочетания', coll, { note: 't-score > 2,6 — неслучайное сочетание; PMI — сила связи слов.' }),
        section('Новые и уходящие слова (30 дней)', emerging, { note: 'Логарифмическое правдоподобие G² Даннинга, |G²| > 10,83 ≈ p < 0,001.' }),
        section('Буквенный профиль', letters, { note: `Расстояние Йенсена — Шеннона до эталона русского языка: ${fmt.num2(X.letterJsd)} (0 — совпадение; > 0,2 — много аббревиатур, сокращений или проблемы кодировки). Всего букв: ${fmt.int(X.lettersTotal)}.` }),
        section('Классы символов', chars),
        section('Смешанная письменность', mixed),
        section('Возможные опечатки', typos, { note: 'Редкое слово (≤ 2 раз) на расстоянии одной правки (Дамерау — Левенштейн) от частого слова (≥ 10× чаще).' }),
        section('Закон Ципфа (лог-лог)', zipfChart(X.zipf.points, X.zipf), { note: 'Точки — частоты основ по рангу; линия — регрессия.' }),
    ].join('');
}

function renderDups(I) {
    const D = I.duplicates;
    const tpl = D.templates.length
        ? table(['Повторов', 'Клиентов', 'Текст'], D.templates.map((t, i) => ({ cells: [fmt.int(t.count), fmt.int(t.clients), t.text], drill: `template:${i}` })), { numeric: [0, 1] })
        : '<p class="ca-viz-empty">Вопросов, повторяющихся дословно 3+ раз, нет.</p>';
    const near = D.nearGroups.length
        ? table(['Вариантов', 'Обращений', 'Клиентов', 'Пример'], D.nearGroups.map((g, i) => ({ cells: [fmt.int(g.variants), fmt.int(g.count), fmt.int(g.clients), g.text], drill: `near:${i}` })), { numeric: [0, 1, 2] })
        : '<p class="ca-viz-empty">Почти-дубликатов не найдено.</p>';
    return [
        `<div class="ca-ins-tiles is-wide">${statTile('Уникальных формулировок', fmt.int(D.uniqueTexts))}${statTile('Доля повторов', fmt.pct(D.repeatedTextsShare))}${statTile('Пар-кандидатов LSH', fmt.int(D.candidatePairs))}${statTile('Подтверждено пар', fmt.int(D.verifiedPairs))}</div>`,
        section('Дословно повторяющиеся вопросы', tpl, { wide: true, note: 'Совпадение после нормализации (регистр, ё/е, словоформы, стоп-слова). Кандидаты в шаблоны ответов и статьи базы знаний.' }),
        section('Похожие формулировки (почти-дубликаты)', near, { wide: true, note: escapeHtml(D.method) }),
    ].join('');
}

function renderQuality(I) {
    const Q = I.quality;
    const ff = Q.fieldFill;
    const fill = barsH(
        [
            ['ИНН указан', ff.inn],
            ['ИНН с верной контрольной суммой', ff.innValid],
            ['КПП', ff.kpp],
            ['Телефон', ff.phone],
            ['E-mail', ff.email],
            ['Текст вопроса', ff.question],
            ['Дата обращения (из текста/файла)', ff.date],
        ].map(([label, v]) => ({ label, value: v * 100 })),
        { max: 100, valueFmt: (v) => `${fmt.num1(v)}%` },
    );
    const checks = table(
        ['Проверка', 'Уровень', 'Записей', 'Доля (95% ДИ)', 'Пояснение'],
        Q.checks
            .filter((c) => c.count > 0)
            .sort((a, b) => ({ serious: 0, warning: 1, info: 2 })[a.level] - ({ serious: 0, warning: 1, info: 2 })[b.level] || b.count - a.count)
            .map((c) => ({
                cells: [c.label, { html: `<span class="ca-ins-badge lvl-${c.level}"><i class="fas ${LEVEL_ICON[c.level] || LEVEL_ICON.info}" aria-hidden="true"></i> ${LEVEL_TEXT[c.level] || c.level}</span>` }, fmt.int(c.count), `${fmt.pct(c.share)} (${fmt.pct(c.lo)}–${fmt.pct(c.hi)})`, c.hint],
                drill: `quality:${c.key}`,
            })),
        { numeric: [2] },
    );
    const legacy = Q.index.legacyParser.length;
    const reprocess = `<div class="ca-ins-reprocess"><p class="m-0 text-sm">Переобработка заново разбирает исходный текст каждого загруженного файла новой версией разборщика: дата обращения, очистка вопроса от телефонов/почты, ОГРН, все ИНН блока, исходный текст обращения. Папки и теги карточек сохраняются (они привязаны к ИНН).${legacy ? ` Записей старой версии: <b>${fmt.int(legacy)}</b>.` : ''}</p><button type="button" class="ca-ins-btn ca-ins-btn-primary" data-ins-action="reprocess"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Переобработать базу</span></button></div>`;
    return [
        `<div class="ca-ins-tiles is-wide">${statTile('Полнота записей', fmt.pct(Q.completeness, 0), 'есть верный ИНН, вопрос, контакт и дата')}${statTile('Проблем «важно»', fmt.int(Q.checks.filter((c) => c.level === 'serious').reduce((s, c) => s + c.count, 0)))}${statTile('Записей старой версии', fmt.int(legacy))}</div>`,
        section('Заполненность полей', fill),
        section('Переобработка', reprocess),
        section('Проверки записей', checks || '<p class="ca-viz-empty">Проблем не найдено.</p>', { wide: true, note: 'Нажмите строку, чтобы увидеть записи. Интервал — доверительный интервал Уилсона.' }),
    ].join('');
}

function renderMethod() {
    const rows = [
        ['Разбор файла', 'Кодировка определяется по BOM, затем строгой проверкой UTF-8, затем выбором из windows-1251 / KOI8-R / IBM866 по частоте типичных русских букв. Удаляются невидимые символы (ZWSP, мягкий перенос, BOM), неразрывные пробелы заменяются обычными.'],
        ['ИНН', 'Контрольные суммы ФНС для 10 и 12 знаков. 10 цифр после «тел.»/«+7», начинающиеся с 9, считаются телефоном; 10 цифр с верной суммой ИНН без подписи телефона — ИНН (у московских ИНН 97… первая цифра 9).'],
        ['Дата обращения', 'Берётся только «уверенная» дата: в первой строке пункта или после подписи «Дата», «от», «поступило». Дата внутри текста («отчёт за 31.03») — это период, она не используется. Иначе — дата из шапки файла, затем из имени файла, затем дата загрузки (помечается).'],
        ['Слова', 'Нижний регистр, ё → е, латинские двойники в русских словах → кириллица, стоп-слова и вежливые формулы исключаются, основа слова — тот же стеммер, что и в общем поиске.'],
        ['Темы и намерения', 'Прозрачный словарный рубрикатор предметной области (ЭП, отчётность ФНС/СФР/Росстат, ЭДО, 1С…). Намерение — первое сработавшее правило по приоритету: жалоба → проблема → статус → оплата → изменение → инструкция → консультация.'],
        ['Срочность', '+2 — слова «срочно», «сегодня», «последний день», «штраф», «блокировка»; +1 — два и более «!»; +1 — текст преимущественно заглавными.'],
        ['Доли и интервалы', 'Доверительный интервал Уилсона (95%) — корректен и для малых долей.'],
        ['Всплески', 'Робастный z-счёт Иглевича — Хоглина 0,6745·(x − медиана)/MAD; всплеск — z > 3,5 и не меньше 5 обращений.'],
        ['Тренд', 'Тест Манна — Кендалла с поправкой на связки по полным неделям (неполные крайние недели исключаются) или по дням для коротких рядов; скорость — наклон Тейла — Сена; дополнительно МНК с R².'],
        ['Смена уровня', 'CUSUM: точка максимального накопленного отклонения от среднего; существенна при эффекте ≥ 0,8 стандартного отклонения.'],
        ['Сезонность', 'Автокорреляция на лаге 7 дней; χ²-тест равномерности по будням; индекс дисперсии variance/mean.'],
        ['Концентрация', 'Коэффициент Джини, кривая Лоренца, индекс Херфиндаля — Хиршмана, доли топ-1/10/20% клиентов.'],
        ['Изменение тем', 'Последние 30 дней против предыдущих 30: разница долей в п.п. и G² Даннинга; значимо при G² > 3,84 и ≥ 20 обращениях в каждом окне.'],
        ['Кластеры', 'Бинарный TF × IDF по основам (слова из ≥ 3 и ≤ 30% записей, до 1500), сферический k-means (косинус) с инициализацией k-means++ и фиксированным зерном — результат воспроизводим; k ∈ [3; 16] выбирается по среднему силуэту на выборке.'],
        ['Почти-дубликаты', 'MinHash (64 хэш-функции) по биграммам основ, LSH 16 полос × 4 строки (порог ≈ 0,5), проверка кандидатов точным коэффициентом Жаккара ≥ 0,6, объединение в группы через union–find.'],
        ['Связи клиентов', 'Граф «ИНН — телефон/почта», компоненты связности; контакты у 30+ клиентов не связывают (это номера-«хабы»).'],
        ['Язык', 'Законы Ципфа (регрессия log частоты по log ранга) и Хипса (V = K·N^β), энтропия Шеннона, TTR, доля гапаксов, коллокации (t-score, PMI), расстояние Йенсена — Шеннона буквенного профиля до эталона НКРЯ.'],
        ['Опечатки', 'Редкое слово на расстоянии одной правки Дамерау — Левенштейна от слова, встречающегося в 10+ раз чаще.'],
        ['Ограничения', 'Это классическая статистика и словари, а не языковая модель: смысл вне словаря и вне текстов базы не «понимается». При малых выборках выводы помечаются «НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА».'],
    ];
    return section('Как считается каждый показатель', table(['Что', 'Метод'], rows.map((c) => ({ cells: c }))), { wide: true });
}

// ---------------------------------------------------------------------------
// Проваливание в записи
// ---------------------------------------------------------------------------
function resolveDrill(key) {
    const I = st.insights;
    const [kind, ...rest] = key.split(':');
    const arg = rest.join(':');
    const recs = st.filtered;
    const byDate = (pred) => recs.filter((r) => {
        const d = effectiveDate(r);
        return d.ymd && pred(d);
    }).map((r) => r.id);
    let ids = [];
    let highlight = null;
    let title = '';
    switch (kind) {
        case 'topic': {
            ids = I.index.topic[arg] || [];
            const tp = TOPICS.find((t) => t.id === arg);
            title = `Тема: ${tp ? tp.label : arg}`;
            if (tp) highlight = { re: tp.re };
            break;
        }
        case 'topicpair': {
            const [a, b] = arg.split(':');
            const sb = new Set(I.index.topic[b] || []);
            ids = (I.index.topic[a] || []).filter((id) => sb.has(id));
            title = `Темы: ${I.labels.topics[a]} + ${I.labels.topics[b]}`;
            break;
        }
        case 'intent':
            ids = I.index.intent[arg] || [];
            title = `Намерение: ${I.labels.intents[arg] || arg}`;
            break;
        case 'term':
            ids = I.index.term[arg] || [];
            title = `Слово: ${arg}…`;
            highlight = { stems: new Set([arg]) };
            break;
        case 'bigram': {
            const [a, b] = arg.split(' ');
            const sb = new Set(I.index.term[b] || []);
            ids = (I.index.term[a] || []).filter((id) => sb.has(id));
            title = `Словосочетание: ${arg}`;
            highlight = { stems: new Set([a, b]) };
            break;
        }
        case 'cluster': {
            const c = I.clusters.list.find((x) => String(x.id) === arg);
            ids = c ? c.ids : [];
            title = `Смысловая группа: ${c ? c.label : arg}`;
            if (c) highlight = { stems: new Set(c.terms.map((t) => t.stem)) };
            break;
        }
        case 'quality':
            ids = I.index.quality[arg] || [];
            title = `Проверка: ${(I.quality.checks.find((c) => c.key === arg) || {}).label || arg}`;
            break;
        case 'template':
            ids = (I.duplicates.templates[Number(arg)] || {}).ids || [];
            title = 'Повторяющийся вопрос';
            break;
        case 'near':
            ids = (I.duplicates.nearGroups[Number(arg)] || {}).ids || [];
            title = 'Похожие формулировки';
            break;
        case 'day':
            ids = byDate((d) => d.ymd === arg);
            title = `Дата: ${fmt.date(arg)}`;
            break;
        case 'week': {
            const end = new Date(`${arg}T00:00:00Z`);
            end.setUTCDate(end.getUTCDate() + 6);
            const to = end.toISOString().slice(0, 10);
            ids = byDate((d) => d.ymd >= arg && d.ymd <= to);
            title = `Неделя ${fmt.date(arg)} — ${fmt.date(to)}`;
            break;
        }
        case 'month':
            ids = byDate((d) => d.ymd.startsWith(arg));
            title = `Месяц: ${fmt.month(arg)}`;
            break;
        case 'wd':
            ids = byDate((d) => (new Date(`${d.ymd}T00:00:00Z`).getUTCDay() + 6) % 7 === Number(arg));
            title = `День недели: ${WEEKDAYS[Number(arg)]}`;
            break;
        case 'hour':
            ids = byDate((d) => d.time && Number(d.time.slice(0, 2)) === Number(arg));
            title = `Час: ${arg}:00–${arg}:59`;
            break;
        case 'heat': {
            const [w, h] = arg.split(':').map(Number);
            ids = byDate((d) => d.time && Number(d.time.slice(0, 2)) === h && (new Date(`${d.ymd}T00:00:00Z`).getUTCDay() + 6) % 7 === w);
            title = `${WEEKDAYS[w]}, ${h}:00–${h}:59`;
            break;
        }
        case 'inn':
            ids = recs.filter((r) => String(r.inn || '') === arg).map((r) => r.id);
            title = `ИНН ${arg}`;
            break;
        case 'group': {
            const g = I.clients.linkedGroups[Number(arg)];
            const set = new Set(g ? g.inns : []);
            ids = recs.filter((r) => set.has(String(r.inn || ''))).map((r) => r.id);
            title = `Связанные клиенты (${set.size})`;
            break;
        }
        case 'repeat': {
            const b = I.clients.repeatBuckets[Number(arg)];
            const counts = new Map();
            for (const r of recs) if (r.inn) counts.set(r.inn, (counts.get(r.inn) || 0) + 1);
            ids = recs.filter((r) => r.inn && counts.get(r.inn) >= b.min && counts.get(r.inn) <= b.max).map((r) => r.id);
            title = `Клиенты с ${b.label} обращ.`;
            break;
        }
        case 'region': {
            ids = recs.filter((r) => {
                const inn = String(r.inn || '');
                if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
                return regionNameForInn(inn) === arg;
            }).map((r) => r.id);
            title = `Регион по ИНН: ${arg}`;
            break;
        }
        case 'len': {
            const [a, b] = arg.split(':').map(Number);
            ids = recs.filter((r) => {
                const n = tokenizeDetailed(r.question || '').filter((t) => !t.numeric).length;
                return n >= a && n < b;
            }).map((r) => r.id);
            title = `Длина вопроса ${a}–${b - 1} слов`;
            break;
        }
        default:
            title = key;
    }
    return { ids, title, highlight };
}

function regionNameForInn(inn) {
    const code = inn.slice(0, 2);
    // имя региона — так же, как в движке: из справочника или «код NN»
    return regionByCode(code) || `код ${code}`;
}

function openDrill(key, label) {
    if (!key) return;
    const { ids, title, highlight } = resolveDrill(key);
    st.drill = { key, ids, title: title || label, highlight };
    st.drillPage = 1;
    renderDrawer();
}

function closeDrawer() {
    const d = document.getElementById('caInsDrawer');
    if (d) {
        d.hidden = true;
        d.innerHTML = '';
    }
    st.drill = null;
}

function highlightQuestion(text, hl) {
    const q = String(text || '');
    if (!hl) return escapeHtml(q);
    if (hl.re) {
        const re = new RegExp(hl.re.source, 'gu');
        let out = '';
        let last = 0;
        for (const m of q.matchAll(re)) {
            // расширяем совпадение до конца слова
            let end = m.index + m[0].length;
            while (end < q.length && /[\p{L}\d]/u.test(q[end])) end++;
            out += escapeHtml(q.slice(last, m.index)) + `<mark>${escapeHtml(q.slice(m.index, end))}</mark>`;
            last = end;
        }
        return out + escapeHtml(q.slice(last));
    }
    if (hl.stems) {
        let out = '';
        let last = 0;
        for (const t of tokenizeDetailed(q)) {
            if (!hl.stems.has(t.stem)) continue;
            out += escapeHtml(q.slice(last, t.start)) + `<mark>${escapeHtml(t.surface)}</mark>`;
            last = t.end;
        }
        return out + escapeHtml(q.slice(last));
    }
    return escapeHtml(q);
}

function recordRowHtml(r, hl) {
    const pr = st.insights.perRecord[r.id] || {};
    const ed = effectiveDate(r);
    const topics = (pr.t || []).map((t) => `<span class="ca-ins-chip">${escapeHtml(st.insights.labels.topics[t] || t)}</span>`).join('');
    const dateLabel = ed.ymd ? `${fmt.date(ed.ymd)}${ed.time ? ` ${ed.time}` : ''}${ed.source === 'upload' ? ' (загрузка)' : ''}` : '—';
    return `<li><button type="button" class="ca-ins-rec" data-ins-record="${r.id}">
  <span class="ca-ins-rec-head"><span>${escapeHtml(dateLabel)}</span><span>${r.inn ? `ИНН ${escapeHtml(r.inn)}` : 'без ИНН'}</span>${pr.u >= 2 ? '<span class="ca-ins-badge lvl-warning">срочно</span>' : ''}</span>
  <span class="ca-ins-rec-q">${highlightQuestion(r.question || '—', hl) || '—'}</span>
  <span class="ca-ins-rec-meta">${topics}<span class="ca-viz-muted">${escapeHtml(st.insights.labels.intents[pr.i] || '')}</span></span>
</button></li>`;
}

function renderDrawer() {
    const d = document.getElementById('caInsDrawer');
    if (!d || !st.drill) return;
    const { ids, title, highlight } = st.drill;
    const recs = ids.map((id) => st.byId.get(id)).filter(Boolean);
    const shown = recs.slice(0, st.drillPage * 50);
    d.hidden = false;
    d.innerHTML = `<div class="ca-ins-drawer-head"><div class="min-w-0"><h3 class="ca-ins-card-title m-0">${escapeHtml(title)}</h3><p class="ca-viz-muted text-xs m-0">${fmt.int(recs.length)} записей${st.insights.overview.records ? ` · ${fmt.pct(recs.length / st.insights.overview.records)} выборки` : ''}</p></div><button type="button" class="ca-ins-btn ca-ins-btn-icon" data-ins-action="drawer-close" aria-label="Закрыть список записей"><i class="fas fa-times" aria-hidden="true"></i></button></div>
<ol class="ca-ins-reclist">${shown.map((r) => recordRowHtml(r, highlight)).join('') || '<li class="ca-viz-empty">Нет записей</li>'}</ol>
${recs.length > shown.length ? `<button type="button" class="ca-ins-btn w-full justify-center" data-ins-action="drawer-more">Показать ещё (${fmt.int(recs.length - shown.length)})</button>` : ''}`;
    d.scrollTop = st.drillPage === 1 ? 0 : d.scrollTop;
    d.querySelector('.ca-ins-drawer-head button')?.focus({ preventScroll: true });
}

const TOKEN_KIND_LABEL = { stop: 'стоп-слово', numeric: 'число', mixed: 'смешанная письменность', content: 'значимое слово' };

function renderXray(recordId) {
    const d = document.getElementById('caInsDrawer');
    const r = st.byId.get(recordId);
    if (!d || !r) return;
    const x = xrayRecord(r, { df: st.insights.df, n: st.insights.overview.records });
    const q = String(r.question || '');
    let tokHtml = '';
    let last = 0;
    for (const t of x.tokens) {
        tokHtml += escapeHtml(q.slice(last, t.start));
        const kind = t.homoglyph || t.script === 'mixed' ? 'mixed' : t.stop ? 'stop' : t.numeric ? 'numeric' : 'content';
        const tip = `${TOKEN_KIND_LABEL[kind]} · основа «${t.stem}»${t.norm !== t.surface.toLowerCase() ? ` · исправлено: «${t.norm}»` : ''}${t.idf ? ` · IDF ${fmt.num2(t.idf)}` : ''}`;
        const w = t.idf ? Math.min(4, Math.max(1, Math.round(t.idf / 2))) : 1;
        tokHtml += `<span class="ca-ins-tok k-${kind}${kind === 'content' ? ` w${w}` : ''}" data-tip="${escapeHtml(tip)}" tabindex="0">${escapeHtml(t.surface)}</span>`;
        last = t.end;
    }
    tokHtml += escapeHtml(q.slice(last));
    // необычные символы: латиница в русских словах, невидимые, нестандартные пробелы и знаки
    const unusual = new Map();
    for (const ch of q) {
        const cp = ch.codePointAt(0);
        const isPlain = /[а-яёА-ЯЁ0-9\s.,!?:;()«»"'%№\-–—/]/.test(ch);
        if (!isPlain) unusual.set(ch, (unusual.get(ch) || 0) + 1);
        void cp;
    }
    const unusualRows = [...unusual.entries()].map(([ch, c]) => ({ cells: [ch === ' ' ? '␠' : ch, `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`, /[a-z]/i.test(ch) ? 'латиница' : /\p{L}/u.test(ch) ? 'буква' : /\p{P}|\p{S}/u.test(ch) ? 'знак' : 'прочее', fmt.int(c)] }));
    const c = x.classification;
    const innInfo = x.inn
        ? `${escapeHtml(r.inn)} — ${escapeHtml(x.inn.kindLong || '')}, ${escapeHtml(x.inn.region || `код ${x.inn.regionCode}`)}, инспекция ${escapeHtml(x.inn.taxOffice || '')} · ${x.inn.valid ? 'контрольная сумма верна' : '<b>контрольная сумма не сходится</b>'}`
        : '—';
    const kppInfo = x.kpp ? `${escapeHtml(r.kpp)} — ${escapeHtml(x.kpp.region || '')}${x.kpp.reason ? `, ${escapeHtml(x.kpp.reason.label)} (${escapeHtml(x.kpp.reason.code)})` : ''}` : '—';
    const dl = [
        ['Дата обращения', x.date.ymd ? `${fmt.date(x.date.ymd)}${x.date.time ? ` ${x.date.time}` : ''} · источник: ${{ block: 'текст обращения', 'file-header': 'шапка файла', 'file-name': 'имя файла', upload: 'дата загрузки' }[x.date.source] || '—'}` : '—'],
        ['ИНН', innInfo, true],
        ['Все ИНН в обращении', (r.inns || []).join(', ') || '—'],
        ['КПП', kppInfo, true],
        ['ОГРН/ОГРНИП', (r.ogrn || []).join(', ') || '—'],
        ['Телефоны', (r.phones || []).map(formatRussianPhoneForDisplay).join(', ') || '—'],
        ['E-mail', (r.emails || []).join(', ') || '—'],
        ['Темы', c.topicLabels.join(', ') || 'не определены'],
        ['Намерение', c.intentLabel],
        ['Срочность / негатив', `${c.urgency} / ${c.negativity}${c.capsRatio > 0.6 ? ' · ЗАГЛАВНЫЕ' : ''}${c.exclam ? ` · «!» ×${c.exclam}` : ''}`],
        ['Файл / пункт', `${r.sourceFileName || '—'}${r.listItemIndex != null ? ` · пункт ${r.listItemIndex}` : ''}`],
    ]
        .map(([k, v, html]) => `<div><dt>${escapeHtml(k)}</dt><dd>${html ? v : escapeHtml(v)}</dd></div>`)
        .join('');
    const chars = x.chars;
    d.hidden = false;
    d.innerHTML = `<div class="ca-ins-drawer-head"><div class="min-w-0"><h3 class="ca-ins-card-title m-0">Разбор обращения</h3><p class="ca-viz-muted text-xs m-0">${fmt.int(x.length)} символов · ${fmt.int(x.words)} слов (значимых ${fmt.int(x.contentWords)}, служебных ${fmt.int(x.stopWords)}) · предложений ${fmt.int(x.sentences)}</p></div>
<div class="flex gap-1">${st.drill ? '<button type="button" class="ca-ins-btn" data-ins-action="drawer-back"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>К списку</span></button>' : ''}<button type="button" class="ca-ins-btn ca-ins-btn-icon" data-ins-action="drawer-close" aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button></div></div>
<div class="ca-ins-xray-text" aria-label="Текст вопроса по словам">${tokHtml || '<span class="ca-viz-muted">Текст вопроса пуст</span>'}</div>
<div class="ca-viz-legend"><span><i class="ca-ins-tok k-content w3">аа</i> значимое (жирнее — реже в базе)</span><span><i class="ca-ins-tok k-stop">аа</i> служебное</span><span><i class="ca-ins-tok k-numeric">00</i> число</span><span><i class="ca-ins-tok k-mixed">аa</i> смешанная письменность</span></div>
<dl class="ca-ins-dl">${dl}</dl>
<h4 class="ca-ins-subtitle">Символы</h4>
${barsH([
        { label: 'Кириллица', value: chars.cyr },
        { label: 'Латиница', value: chars.lat },
        { label: 'Цифры', value: chars.digit },
        { label: 'Пробелы', value: chars.space },
        { label: 'Знаки', value: chars.punct },
        { label: 'Прочее', value: chars.other },
    ].filter((b) => b.value > 0), { showShare: x.length || 1 })}
${unusualRows.length ? table(['Символ', 'Код', 'Класс', 'Раз'], unusualRows, { numeric: [3] }) : ''}
${r.inn ? `<p class="mt-3"><button type="button" class="ca-ins-btn" data-ins-action="open-inn" data-inn="${escapeHtml(r.inn)}"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i><span>История клиента</span></button></p>` : ''}
<details class="ca-ins-src"><summary>Исходный текст обращения</summary><pre>${escapeHtml(r.sourceText || r.contextSnippet || '—')}</pre></details>`;
    d.scrollTop = 0;
}

// ---------------------------------------------------------------------------
// Переобработка и экспорт
// ---------------------------------------------------------------------------
async function reprocessAll(btn) {
    if (!api.reprocess) return;
    btn.disabled = true;
    const prog = document.getElementById('caInsProgress');
    if (prog) prog.hidden = false;
    try {
        const res = await api.reprocess((phase, pct) => {
            if (!prog) return;
            prog.querySelector('[data-role="phase"]').textContent = phase;
            prog.querySelector('[data-role="bar"]').style.width = `${Math.max(2, pct)}%`;
        });
        if (api.notify) api.notify(`Переобработано файлов: ${res.files}, записей: ${res.records}`, 'success');
        await reload();
    } catch (e) {
        console.error(e);
        if (api.notify) api.notify(`Переобработка не удалась: ${e?.message || e}`, 'error');
        if (prog) prog.hidden = true;
    } finally {
        btn.disabled = false;
    }
}

function download(name, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

function exportJson() {
    const I = st.insights;
    if (!I) return;
    const { perRecord: _p, index: _i, df: _d, ...rest } = I;
    const clusters = { ...rest.clusters, list: rest.clusters.list.map(({ ids: _ids, ...c }) => c) };
    download(`analitika-obrashcheniy-${stamp()}.json`, 'application/json', JSON.stringify({ filter: st.filter, ...rest, clusters }, null, 2));
}

/** Экранирование ячейки CSV + защита от формул Excel (=, +, -, @, табуляция). */
export function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
    const I = st.insights;
    if (!I) return;
    const head = ['id', 'дата', 'время', 'источник даты', 'ИНН', 'КПП', 'телефоны', 'e-mail', 'темы', 'намерение', 'группа', 'срочность', 'негатив', 'вопрос', 'файл', 'пункт'];
    const lines = [head.join(';')];
    for (const r of st.filtered) {
        const p = I.perRecord[r.id] || {};
        const ed = effectiveDate(r);
        const cl = I.clusters.list.find((c) => c.id === p.c);
        lines.push(
            [r.id, ed.ymd || '', ed.time || '', ed.source || '', r.inn || '', r.kpp || '', (r.phones || []).join(', '), (r.emails || []).join(', '), (p.t || []).map((t) => I.labels.topics[t]).join(', '), I.labels.intents[p.i] || '', cl ? cl.label : '', p.u ?? '', p.g ?? '', r.question || '', r.sourceFileName || '', r.listItemIndex ?? '']
                .map(csvCell)
                .join(';'),
        );
    }
    // BOM — чтобы Excel открыл UTF-8 с кириллицей корректно
    download(`obrashcheniya-priznaki-${stamp()}.csv`, 'text/csv;charset=utf-8', `﻿${lines.join('\r\n')}`);
}
