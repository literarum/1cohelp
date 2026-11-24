'use strict';

/**
 * Дашборд «Аналитика обращений» раздела «База клиентов».
 * Расчёт — в Web Worker (client-analytics-insights-worker.js), отрисовка — строки HTML/SVG.
 * Любой столбик/строка с data-ca-drill открывает список соответствующих записей,
 * запись — «рентген»: каждое слово (основа, вес IDF, стоп-слово, смешанная письменность),
 * каждый необычный символ (кодовая точка), темы, намерение, срочность, разбор ИНН/КПП.
 */

import { computeInsights, comparePeriods, effectiveDate, xrayRecord } from './client-analytics-insights.js';
import { tokenizeDetailed, activeTopics, setCustomTopics, compileTopicKeywords, normalizeForAnalysis } from './client-analytics-text.js';
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
import { buildFrogIndex, matchRecordToFrogs, FROG_VIA_LABELS, FROG_LEVEL_LABELS } from './client-analytics-frogs.js';

const MODAL_ID = 'clientAnalyticsInsightsModal';
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TABS = [
    ['overview', 'Обзор'],
    ['time', 'Динамика'],
    ['clients', 'Клиенты'],
    ['frogs', 'Жабы'],
    ['topics', 'Темы и смысл'],
    ['text', 'Текст и язык'],
    ['compare', 'Сравнение периодов'],
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
    filter: { period: 'all', from: '', to: '', innOnly: false, query: '', frog: 'all' },
    frogEntries: [],
    customTopics: [],
    frogIndex: null,
    drill: null,
    drillPage: 1,
    computing: null,
    compare: null,
    compareRange: null,
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
        sourceText: r.sourceText ? String(r.sourceText).slice(0, 3000) : '',
    };
}

/** id сообщений воркеру — отдельный счётчик: st.seq означает «актуальный расчёт» и не должен сдвигаться. */
let workerSeq = 0;

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
        const id = ++workerSeq;
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

function runCompare(records, A, B) {
    const slim = records.map(slimRecord);
    const opts = { blacklistEntries: st.frogEntries, customTopics: st.customTopics };
    if (typeof Worker === 'undefined' || slim.length < 3000) return Promise.resolve(comparePeriods(slim, A, B, opts));
    return new Promise((resolve) => {
        let worker;
        try {
            worker = new Worker(new URL('./client-analytics-insights-worker.js', import.meta.url), { type: 'module' });
        } catch {
            resolve(comparePeriods(slim, A, B, opts));
            return;
        }
        const id = ++workerSeq;
        worker.onmessage = (e) => {
            const d = e.data || {};
            if (d.id !== id || d.progress) return;
            worker.terminate();
            resolve(d.ok ? d.result : comparePeriods(slim, A, B, opts));
        };
        worker.onerror = () => {
            worker.terminate();
            resolve(comparePeriods(slim, A, B, opts));
        };
        worker.postMessage({ id, kind: 'compare', records: slim, A, B, opts });
    });
}

/** Периоды по умолчанию: последние 30 дней против предыдущих 30 (по последней дате выборки). */
function defaultCompareRange(I) {
    const to = I.overview.to;
    if (!to) return null;
    const shift = (ymd, d) => {
        const x = new Date(`${ymd}T00:00:00Z`);
        x.setUTCDate(x.getUTCDate() + d);
        return x.toISOString().slice(0, 10);
    };
    return { A: { from: shift(to, -59), to: shift(to, -30) }, B: { from: shift(to, -29), to } };
}

async function doCompare() {
    const form = document.getElementById('caInsCompareForm');
    if (!form) return;
    const A = { from: form.aFrom.value, to: form.aTo.value };
    const B = { from: form.bFrom.value, to: form.bTo.value };
    if (!A.from || !A.to || !B.from || !B.to || A.from > A.to || B.from > B.to) {
        const out = document.getElementById('caInsCompareOut');
        if (out) out.innerHTML = '<p class="ca-viz-empty">Укажите обе даты каждого периода (начало не позже конца).</p>';
        return;
    }
    st.compareRange = { A, B };
    const out = document.getElementById('caInsCompareOut');
    if (out) out.innerHTML = '<p class="ca-viz-muted">Сравнение…</p>';
    st.compare = await runCompare(st.filtered, A, B);
    if (st.tab === 'compare') renderTab();
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
    const fi = f.frog && f.frog !== 'all' ? st.frogIndex : null;
    return records.filter((r) => {
        if (f.innOnly && !r.inn) return false;
        if (fi) {
            const isFrog = matchRecordToFrogs(r, fi).level > 0;
            if (f.frog === 'frogs' ? !isFrog : isFrog) return false;
        }
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
    const result = await runInsights(st.filtered, { blacklistEntries: st.frogEntries, customTopics: st.customTopics, now: Date.now() }, (phase, pct) => {
        if (!prog || token !== st.seq) return;
        prog.querySelector('[data-role="phase"]').textContent = phase;
        prog.querySelector('[data-role="bar"]').style.width = `${Math.max(2, pct)}%`;
    });
    if (token !== st.seq && st.insights) return; // устаревший расчёт
    st.insights = result;
    st.compare = null;
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
    <label class="ca-ins-field"><span>Жабы</span>
      <select name="frog">
        <option value="all">Все клиенты</option><option value="frogs">Только жабы</option><option value="nonfrogs">Без жаб</option>
      </select></label>
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

/** Данные изменились, пока окно открыто: предложить пересчёт (а не показывать «призраки» удалённых записей). */
function markStale(reason) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || modal.classList.contains('hidden') || !st.insights) return;
    st.stale = true;
    const meta = document.getElementById('caInsMeta');
    if (meta && !meta.querySelector('.ca-ins-stale')) {
        meta.insertAdjacentHTML(
            'beforeend',
            ` <span class="ca-ins-stale" role="status">· ${escapeHtml(reason)} — <button type="button" class="ca-ins-link" data-ins-action="recompute">пересчитать</button></span>`,
        );
    }
}

function bindModal(modal) {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('copilot:client-analytics-changed', () => markStale('обращения изменились'));
    window.addEventListener('copilot:blacklist-changed', () => markStale('чёрный список изменился'));
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
            if (a === 'compare-run') return doCompare();
            if (a === 'topic-add') return saveCustomTopicFromForm();
            if (a === 'topic-del') return deleteCustomTopic(act.getAttribute('data-topic-id'));
            if (a === 'topic-edit') return editCustomTopic(act.getAttribute('data-topic-id'));
            if (a === 'suggest-word') {
                const ta = document.getElementById('caInsTopicWords');
                if (ta) {
                    const w = act.getAttribute('data-word');
                    ta.value = ta.value.trim() ? `${ta.value.trim().replace(/[,\s]+$/, '')}, ${w}` : w;
                    ta.dispatchEvent(new Event('input'));
                    ta.focus();
                }
                return;
            }
            if (a === 'open-frog') {
                const id = Number(act.getAttribute('data-frog-id'));
                if (api.openBlacklistEntry && Number.isFinite(id)) api.openBlacklistEntry(id);
                return;
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
    // Escape перехватывается на уровне документа (фаза захвата): если фокус «упал» на <body>
    // (кнопку, по которой кликнули, перерисовали), событие иначе уходило глобальному обработчику,
    // и он закрывал всё окно аналитики вместо панели записей.
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Escape' || modal.classList.contains('hidden')) return;
            // поверх аналитики открыто другое окно (история клиента, жаба, подтверждение) — пусть закроется оно
            const above = ['clientAnalyticsDetailModal', 'blacklistDetailModal', 'appConfirmModal', 'clientAnalyticsAssignModal'].some((id) => {
                const m = document.getElementById(id);
                return m && !m.classList.contains('hidden') && m.getAttribute('aria-hidden') !== 'true';
            });
            if (above) return;
            // открытый выпадающий список (кастомный select) закрывается своим обработчиком
            if (document.querySelector('.cs-wrap.cs-open')) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const drawer = document.getElementById('caInsDrawer');
            if (drawer && !drawer.hidden) closeDrawer();
            else closeClientAnalyticsInsights();
        },
        true,
    );
    modal.addEventListener('keydown', (e) => {
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
    let previewTimer = 0;
    modal.addEventListener('input', (e) => {
        if (!(e.target instanceof Element) || !e.target.matches('#caInsTopicWords')) return;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            const pv = document.getElementById('caInsTopicPreview');
            if (!pv) return;
            const c = topicPreviewCount(e.target.value);
            pv.textContent = c == null ? '' : `Совпадений в выборке: ${fmt.int(c)}`;
        }, 250);
    });
    const form = modal.querySelector('#caInsFilters');
    form.period.addEventListener('change', () => {
        const custom = form.period.value === 'custom';
        form.querySelectorAll('[data-role="custom"]').forEach((el) => (el.hidden = !custom));
        if (!custom) readFiltersAndRecompute();
    });
    form.innOnly.addEventListener('change', readFiltersAndRecompute);
    form.frog.addEventListener('change', readFiltersAndRecompute);
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
        frog: form.frog.value,
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
    st.stale = false;
    st.all = api.loadRecords ? await api.loadRecords({ force: true }) : [];
    try {
        st.frogEntries = api.loadBlacklistEntries ? await api.loadBlacklistEntries() : [];
    } catch {
        st.frogEntries = [];
    }
    st.frogIndex = buildFrogIndex(st.frogEntries);
    try {
        st.customTopics = api.loadCustomTopics ? await api.loadCustomTopics() : [];
    } catch {
        st.customTopics = [];
    }
    setCustomTopics(st.customTopics);
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
    closeDrawer();
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
        const f = st.filter;
        let why = 'В выбранной выборке нет обращений. Измените фильтры или загрузите файлы .txt.';
        if (!st.all.length) why = 'База клиентов пуста — загрузите файлы .txt в разделе «База клиентов».';
        else if (f.period === 'custom' && f.from && f.to && f.from > f.to) why = `Начало периода (${fmt.date(f.from)}) позже его конца (${fmt.date(f.to)}) — поменяйте даты местами.`;
        else if (f.query) why = `По запросу «${f.query}» обращений не найдено (из ${fmt.int(st.all.length)}).`;
        else if (f.frog === 'frogs' && !st.frogEntries.length) why = 'Чёрный список пуст — фильтр «Только жабы» нечего показывать.';
        body.innerHTML = `<div class="ca-ins-empty"><p class="text-base font-semibold">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА</p><p class="ca-viz-muted">${escapeHtml(why)}</p></div>`;
        return;
    }
    // графики строятся под фактическую ширину карточек (без растяжения текста в SVG)
    const inner = Math.max(280, body.clientWidth - 32 - 34);
    const twoCols = body.clientWidth >= 1100;
    setChartWidths({ wide: inner, half: twoCols ? (inner - 14) / 2 : inner });
    const map = { compare: renderCompare, overview: renderOverview, time: renderTime, clients: renderClients, frogs: renderFrogs, topics: renderTopics, text: renderText, dups: renderDups, quality: renderQuality, method: renderMethod };
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
    if (I.fcr && !I.fcr.insufficient && I.fcr.topics.length) {
        const worst = I.fcr.topics[0];
        out.push(['info', `Решено с первого обращения (нет повтора по той же теме за 7 дней): ${fmt.pct(I.fcr.w7.fcr, 0)}. Хуже всего — «${worst.label}»: ${fmt.pct(worst.fcr, 0)} (${fmt.int(worst.repeats)} повторов из ${fmt.int(worst.n)}).`]);
    }
    const DE = I.time.deadlineEffect;
    if (DE && !DE.insufficient && DE.significant && DE.farMean) {
        out.push(['warning', `За 0–2 рабочих дня до срока отчётности обращений в ×${fmt.num2(DE.nearMean / DE.farMean)} больше, чем в остальные рабочие дни (${pval(DE.p)}) — закладывайте смены под 25-е числа.`]);
    }
    if (I.time.dips && I.time.dips.length) out.push(['warning', `Провалов в рабочие дни: ${I.time.dips.length} (например, ${fmt.date(I.time.dips[0].date)}) — проверьте, все ли выгрузки загружены.`]);
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
    const F = I.frogs;
    if (F && !F.insufficient) {
        out.push(['info', `Жабы: ${fmt.int(F.summary.appeals)} обращений (${fmt.pct(F.summary.appealsShare)}) от ${fmt.int(F.summary.clients)} клиентов; из ${fmt.int(F.entries.total)} записей списка в базе найдено ${fmt.int(F.entries.matched)}.`]);
        const sigCmp = F.compare.filter((c) => c.significant && c.effect > 0);
        if (sigCmp.length) out.push(['warning', `У жаб значимо выше: ${sigCmp.map((c) => c.label.toLowerCase()).join(', ')} (U-тест, p < 0,05).`]);
        const sigTopics = F.topics.filter((t) => t.significant && t.or > 1).slice(0, 3);
        if (sigTopics.length) out.push(['info', `Темы, характерные для жаб: ${sigTopics.map((t) => `«${t.label}» (OR ${fmt.num2(t.or)})`).join(', ')}.`]);
        if (!F.beforeAfter.insufficient && F.beforeAfter.continued) out.push(['warning', `${fmt.int(F.beforeAfter.continued)} из ${fmt.int(F.beforeAfter.eligible)} жаб продолжили обращаться после внесения в список.`]);
        if (F.neighborsTotal) out.push(['warning', `${fmt.int(F.neighborsTotal)} других ИНН используют те же телефоны/почту, что и жабы — см. вкладку «Жабы».`]);
        if (!F.model.insufficient && F.model.candidates.length) out.push(['info', `Модель находит клиентов, похожих на жаб по поведению (AUC ${fmt.num2(F.model.auc)}, ${F.model.quality}).`]);
        const bad = F.hygiene.filter((h) => h.level === 'serious' && h.count);
        if (bad.length) out.push(['serious', `В самом чёрном списке: ${bad.map((h) => `${h.label.toLowerCase()} — ${fmt.int(h.count)}`).join('; ')}.`]);
    }
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
        statTile('Решено с 1-го обращения', I.fcr && !I.fcr.insufficient ? fmt.pct(I.fcr.w7.fcr, 0) : '—', I.fcr && !I.fcr.insufficient ? `без повтора по теме за 7 дн.; за 14 дн. — ${fmt.pct(I.fcr.w14.fcr, 0)}` : 'мало данных', { tip: 'Прокси FCR по повторным обращениям того же клиента; обычно завышает FCR относительно опросов клиентов' }),
        statTile('Полнота данных', fmt.pct(I.quality.completeness, 0), 'ИНН, вопрос, контакт, дата'),
        statTile('Срочные', fmt.int(o.urgent), fmt.pct(o.records ? o.urgent / o.records : 0)),
        statTile('Негативные', fmt.int(o.negative), fmt.pct(o.records ? o.negative / o.records : 0)),
        statTile('Обращения жаб', fmt.int(o.frogAppeals || 0), I.frogs && !I.frogs.insufficient ? `${fmt.int(o.frogClients)} клиентов · ${fmt.pct(I.frogs.summary.appealsShare)}` : 'чёрный список пуст'),
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
    if (st.grain === 'day') pts = T.daily.map((d) => ({ x: d.date, y: d.count, smooth: d.ma7, flag: anomalies.has(d.date), muted: d.dk === 'weekend' || d.dk === 'holiday', tip: `${fmt.date(d.date)} (${WEEKDAYS[(new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7]}${d.hol ? `, ${d.hol}` : d.dk === 'workingSaturday' ? ', рабочая суббота' : ''}): ${fmt.int(d.count)} · среднее за 7 дн. ${fmt.num1(d.ma7)}${anomalies.has(d.date) ? ` · всплеск, z = ${fmt.num1(d.z)}` : ''}`, drill: `day:${d.date}` }));
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
        section('Прогноз на 14 дней', forecastHtml(T.forecast, I), { wide: true }),
        section('Статистика ряда', stats, { wide: true }),
        section('По дням недели', wd),
    ];
    if (T.hasTime) {
        parts.push(section('По часам', columns(T.hourly.map((v, h) => ({ label: String(h), value: v, drill: `hour:${h}` })), { height: 170, labelEvery: 2, ariaLabel: 'Обращения по часам' }), { note: `Время указано у ${fmt.int(T.withTime)} записей.` }));
        parts.push(section('День недели × час', heatmap(T.heat, WEEKDAYS, Array.from({ length: 24 }, (_, h) => String(h)), { drillFmt: (r, c) => `heat:${r}:${c}`, ariaLabel: 'Тепловая карта по дням недели и часам' }), { wide: true }));
    } else {
        parts.push(section('По часам', '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: время обращения указано менее чем у 20 записей.</p>'));
    }
    const DK = { workday: 'рабочий', weekend: 'выходной', holiday: 'праздник', workingSaturday: 'рабочая суббота' };
    const anomTable = (rows) =>
        table(
            ['Дата', 'День', 'Обращений', 'Робастный z', 'Рядом срок (≤ 3 раб. дн.)'],
            rows.map((a) => ({ cells: [fmt.date(a.date), `${DK[a.dk] || ''}${a.hol ? ` · ${a.hol}` : ''}`, fmt.int(a.count), fmt.num1(a.z), a.deadline ? `${fmt.date(a.deadlineDate)}: ${a.deadline}` : a.payment ? 'срок уплаты ЕНП' : '—'], drill: `day:${a.date}` })),
            { numeric: [2, 3] },
        );
    if (T.anomalies && T.anomalies.length) parts.push(section('Всплески', anomTable(T.anomalies), { wide: true, note: 'z считается отдельно для рабочих и нерабочих дней (производственный календарь РФ).' }));
    if (T.dips && T.dips.length) parts.push(section('Провалы в рабочие дни', anomTable(T.dips), { wide: true, note: 'Рабочий день с аномально малым числом обращений: z < −3,5 или меньше четверти обычного уровня соседних рабочих дней. Возможно, обращения за этот день не попали в выгрузку.' }));
    if (T.deadlineProfile && T.deadlineProfile.length) {
        const E = T.deadlineEffect;
        const S = T.spikesNearDeadline;
        const effect = E.insufficient
            ? '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: мало рабочих дней рядом со сроками.</p>'
            : `<div class="ca-ins-tiles">${statTile('За 0–2 раб. дня до срока', fmt.num1(E.nearMean), `в среднем за рабочий день (${E.nearDays} дн.)`)}${statTile('В остальные рабочие дни', fmt.num1(E.farMean), `${E.farDays} дн.`)}${statTile('Различие', E.farMean ? `×${fmt.num2(E.nearMean / E.farMean)}` : '—', `U-тест: ${pval(E.p)}${E.significant ? ' · значимо' : ' · незначимо'}`, { tone: E.significant && E.nearMean > E.farMean ? 'warning' : '' })}${S.spikes ? statTile('Всплески у сроков', `${S.hits} из ${S.spikes}`, `ожидалось бы ${fmt.pct(S.baseShare, 0)} случайно · ${pval(S.p)}`) : ''}</div>`;
        const prof = columns(
            T.deadlineProfile.map((g) => ({ label: g.gap >= 10 ? '10+' : String(g.gap), value: Math.round(g.mean * 10) / 10, tip: `${g.gap >= 10 ? '10 и более' : g.gap} раб. дн. до срока отчётности: в среднем ${fmt.num1(g.mean)} (×${fmt.num2(g.ratio)} к среднему рабочему дню; ${g.days} дн.)` })),
            { height: 170, valueFmt: fmt.num1, ariaLabel: 'Среднее число обращений за рабочий день по числу рабочих дней до срока отчётности' },
        );
        parts.push(section('Нагрузка и сроки отчётности', `${effect}<h4 class="ca-ins-subtitle">Среднее обращений за рабочий день по числу рабочих дней до ближайшего срока (25-е, с переносом)</h4>${prof}`, { wide: true, note: 'Сроки: уведомления и отчётность — 25-е, уплата ЕНП — 28-е, квартальная отчётность (НДС, РСВ, 6-НДФЛ, ЕФС-1) — 25-е месяца после квартала; перенос на ближайший рабочий день по производственному календарю.' }));
    }
    if (T.holidayStats) {
        const H = T.holidayStats;
        parts.push(section('Рабочие и нерабочие дни', table(['Тип дня', 'Дней', 'Среднее обращений'], [['Рабочий', 'workday'], ['Рабочая суббота', 'workingSaturday'], ['Выходной', 'weekend'], ['Праздник / перенесённый выходной', 'holiday']].filter(([, k]) => H[k].days).map(([l, k]) => ({ cells: [l, fmt.int(H[k].days), H[k].mean != null ? fmt.num1(H[k].mean) : '—'] })), { numeric: [1, 2] }), { note: T.calendarKnownShare < 1 ? `Производственный календарь известен для 2024–2027 гг.; для остальных дат (${fmt.pct(1 - T.calendarKnownShare, 0)} ряда) праздники не учитываются.` : 'Производственный календарь РФ 2024–2027 (постановления о переносе выходных).' }));
    }
    return parts.join('');
}

function forecastHtml(F, I) {
    if (!F || F.insufficient) {
        return `<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: ${escapeHtml((F && F.reason) || 'ряд слишком короткий')}</p>`;
    }
    const pts = F.days.map((d) => ({
        x: d.date,
        y: Math.round(d.value * 10) / 10,
        lo: d.lo80,
        hi: d.hi80,
        muted: d.dayKind === 'holiday' || d.dayKind === 'weekend',
        tip: `${fmt.date(d.date)} (${WEEKDAYS[(new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7]}${d.dayName ? `, ${d.dayName}` : ''}): ≈ ${fmt.num1(d.value)} · 80%: ${fmt.num1(d.lo80)}–${fmt.num1(d.hi80)} · 95%: ${fmt.num1(d.lo95)}–${fmt.num1(d.hi95)}`,
    }));
    const warn = I.overview.dateReliable < 0.5 ? '<p class="ca-ins-card-note">⚠ У большинства записей нет даты обращения — ряд построен по датам загрузки, прогноз описывает загрузки файлов, а не поток обращений.</p>' : '';
    const cands = table(
        ['Модель', 'MASE', ''],
        F.candidates.map((c) => ({ cells: [c.label, fmt.num2(c.mase), c.key === F.method ? 'выбрана' : ''] })),
        { numeric: [1] },
    );
    return `${warn}<div class="ca-ins-tiles">${statTile('Следующие 7 дней', `≈ ${fmt.int(F.nextWeek.value)}`, `80%: ${fmt.int(F.nextWeek.lo80)}–${fmt.int(F.nextWeek.hi80)} (по ${F.nextWeek.samples} неделям бэктеста)`)}${statTile('Точность (MASE)', fmt.num2(F.mase), F.quality, { tip: 'MAE модели / MAE прогноза «как неделю назад». < 1 — модель полезнее наивного прогноза' })}${statTile('Калибровка 80%-интервала', Number.isFinite(F.coverage80) ? fmt.pct(F.coverage80, 0) : '—', 'доля факта внутри интервала на бэктесте (идеал ≈ 80%)')}</div>
${timeSeries(pts, { height: 200, ariaLabel: 'Прогноз обращений на 14 дней с 80% интервалом', band: true, smoothLabel: '' })}
${F.calendar ? `<p class="ca-ins-card-note">Учтён производственный календарь: праздники в истории заменены типичным уровнем, на праздники горизонта применён коэффициент ×${fmt.num2(F.calendar.holidayRatio ?? 1)} (${escapeHtml(F.calendar.holidayRatioSource)}).</p>` : ''}<h4 class="ca-ins-subtitle">Сравнение моделей на скользящем бэктесте (${F.origins} точек отсчёта, горизонт ${F.horizon} дн.)</h4>${cands}`;
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
                { html: `<button type="button" class="ca-ins-link" data-ins-action="open-inn" data-inn="${escapeHtml(c.inn)}">${escapeHtml(c.inn)}</button>${c.valid ? '' : ' <span class="ca-ins-badge lvl-serious" title="Контрольная сумма ИНН не сходится">КС</span>'}${c.frogLevel ? ` ${frogBadge(c.frogLevel)}` : c.blacklisted ? ' <span class="ca-ins-badge lvl-warning">ЧС</span>' : ''}` },
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
              ['Клиентов', 'Обращений', 'Из них жаб', 'ИНН', 'Общие контакты'],
              C.linkedGroups.map((g, i) => ({ cells: [fmt.int(g.size), fmt.int(g.appeals), g.frogs ? { html: `🐸 ${fmt.int(g.frogs)}` } : '—', g.inns.slice(0, 6).join(', ') + (g.inns.length > 6 ? ` и ещё ${g.inns.length - 6}` : ''), g.shared.map((s) => (/^\d{11}$/.test(s) ? formatRussianPhoneForDisplay(s) : s)).join(', ')], drill: `group:${i}` })),
              { numeric: [0, 1, 2] },
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
        section('Телефоны: типы номеров', barsH(C.phoneKinds.map((k) => ({ label: k.name, value: k.count })), { showShare: C.phonesTotal || 1, empty: 'Телефонов нет' }), { note: `Уникальных номеров: ${fmt.int(C.phonesTotal)}. «+7 6xx/7xx» — Казахстан (общая зона +7). Номера 8-800 — горячие линии: в связях клиентов и сверке с жабами не используются.` }),
        section('Регион и причина по КПП', `${barsH(C.kppRegions.slice(0, 8).map((r) => ({ label: r.name, value: r.count })))}<h4 class="ca-ins-subtitle">Причина постановки на учёт (5–6 знаки КПП)</h4>${barsH(C.kppReasons.map((r) => ({ label: r.name, value: r.count })))}`),
        section('Самые активные клиенты', top, { wide: true }),
        section('Цепочки повторных обращений', I.fcr && I.fcr.chains.length
            ? table(['Клиент', 'Обращений подряд', 'Период', 'Главная тема'], I.fcr.chains.map((c, n) => ({ cells: [c.byInn ? { html: `<button type="button" class="ca-ins-link" data-ins-action="open-inn" data-inn="${escapeHtml(c.client)}">ИНН ${escapeHtml(c.client)}</button>` } : formatRussianPhoneForDisplay(c.client), fmt.int(c.length), `${fmt.date(c.from)} — ${fmt.date(c.to)}`, c.topic], drill: `chain:${n}` })), { numeric: [1] })
            : '<p class="ca-viz-empty">Цепочек из 3+ обращений с разрывом ≤ 7 дней нет.</p>', { wide: true, note: `Клиент обращается снова и снова с разрывом не больше 7 дней — вероятно, вопрос не решается. Всего цепочек: ${fmt.int(I.fcr ? I.fcr.chainsTotal : 0)}.` }),
        section('Клиенты с общими контактами', groups + hubs, { wide: true, note: 'Компоненты связности графа «ИНН — телефон/почта» (система непересекающихся множеств).' }),
    ].join('');
}


// ---------------------------------------------------------------------------
// Жабы (чёрный список)
// ---------------------------------------------------------------------------
/** Значок жабы: уровень + чем подтверждено (цвет дублируется текстом). */
function frogBadge(level, via, { weak = false } = {}) {
    if (!level) return '';
    const lvl = level >= 3 ? 'serious' : level === 2 ? 'warning' : 'info';
    const viaText = via && via.length ? ` · ${via.map((v) => FROG_VIA_LABELS[v] || v).join(', ')}` : '';
    return `<span class="ca-ins-badge lvl-${lvl}" title="${escapeHtml(`${FROG_LEVEL_LABELS[level]}${viaText}${weak ? ' (слабое совпадение)' : ''}`)}">🐸 ${escapeHtml(weak ? `упоминание · ур. ${level}` : FROG_LEVEL_LABELS[level])}${escapeHtml(viaText)}</span>`;
}

function fmtOr(x) {
    if (!x || x.or == null) return '—';
    return `${fmt.num2(x.or)} (${fmt.num2(x.lo)}–${fmt.num2(x.hi)})`;
}

function renderFrogs(I) {
    const F = I.frogs;
    if (!F || F.insufficient) {
        return section('Жабы', '<p class="ca-viz-empty">Чёрный список пуст — сопоставлять не с чем. Добавьте записи в разделе «Чёрный список», и здесь появится их связь с обращениями.</p>', { wide: true });
    }
    const S = F.summary;
    const E = F.entries;
    const tiles = [
        statTile('Записей в списке', fmt.int(E.total), `ур. 1/2/3: ${E.byLevel[1]} / ${E.byLevel[2]} / ${E.byLevel[3]}`),
        statTile('Найдены в базе', fmt.int(E.matched), `не обращались: ${fmt.int(E.silent)}`),
        statTile('Обращений жаб', fmt.int(S.appeals), `${fmt.pct(S.appealsShare)} (95% ДИ ${fmt.pct(S.appealsLo)}–${fmt.pct(S.appealsHi)})`),
        statTile('Клиентов-жаб', fmt.int(S.clients), `${fmt.pct(S.clientsShare)} клиентов с ИНН`),
        statTile('Соседи жаб', fmt.int(F.neighborsTotal), 'другие ИНН с общим контактом'),
        statTile('Только упоминания', fmt.int(S.weakOnly), 'название в тексте, без ИНН/тел.'),
    ].join('');
    const via = barsH(
        Object.entries(S.byVia)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ label: FROG_VIA_LABELS[k], value: v, drill: `frogvia:${k}` })),
        { empty: 'Совпадений нет' },
    );
    const levels = barsH([1, 2, 3].map((L) => ({ label: FROG_LEVEL_LABELS[L], value: S.byLevelAppeals[L], drill: `frog:l${L}`, tone: '' })), { showShare: S.appeals || 1 });
    const cmp = table(
        ['Показатель клиента', 'Жабы (ср. / медиана)', 'Остальные (ср. / медиана)', 'U-тест', 'Эффект r'],
        F.compare.map((c) => ({
            cells: [
                c.label,
                c.key === 'k' ? `${fmt.num1(c.frogMean)} / ${fmt.num1(c.frogMedian)}` : `${fmt.pct(c.frogMean)} / ${fmt.pct(c.frogMedian)}`,
                c.key === 'k' ? `${fmt.num1(c.otherMean)} / ${fmt.num1(c.otherMedian)}` : `${fmt.pct(c.otherMean)} / ${fmt.pct(c.otherMedian)}`,
                c.insufficient ? 'мало данных' : { html: `<span class="${c.significant ? 'ca-ins-up' : ''}">${escapeHtml(pval(c.p))} · q = ${escapeHtml(fmt.num2(c.q))}${c.significant ? ' *' : ''}</span>` },
                c.insufficient ? '—' : fmt.num2(c.effect),
            ],
        })),
    );
    const props = table(
        ['Признак обращения', 'У жаб', 'У остальных', 'Отношение шансов (95% ДИ)', 'z-тест'],
        F.proportions.map((c) => ({
            cells: [c.label, c.empty ? '—' : `${fmt.pct(c.p1)} (${fmt.int(c.frog)})`, c.empty ? '—' : `${fmt.pct(c.p2)} (${fmt.int(c.other)})`, fmtOr(c.or), c.empty ? 'не встречается' : { html: `<span class="${c.significant ? (c.diff > 0 ? 'ca-ins-up' : 'ca-ins-down') : ''}">${escapeHtml(pval(c.p))}${c.significant ? ' *' : ''}</span>` }],
        })),
    );
    const topics = table(
        ['Тема', 'Доля у жаб', 'Доля у остальных', 'Отношение шансов (95% ДИ)', ''],
        F.topics
            .filter((t) => !t.empty)
            .map((t) => ({
                cells: [t.label, `${fmt.pct(t.frogShare)} (${fmt.int(t.frog)})`, `${fmt.pct(t.otherShare)} (${fmt.int(t.other)})`, fmtOr(t), t.significant ? { html: `<span class="${t.or > 1 ? 'ca-ins-up' : 'ca-ins-down'}">${t.or > 1 ? 'чаще у жаб' : 'реже у жаб'} *</span>` } : 'различие незначимо'],
                drill: `frogtopic:${t.id}`,
            })),
    );
    const words = F.words.length
        ? `<div class="ca-ins-cloud">${F.words.map((w, i) => `<button type="button" class="ca-ins-term w${Math.max(1, 4 - Math.floor(i / 6))}" data-ca-drill="frogword:${escapeHtml(w.stem)}" data-tip="${escapeHtml(`G² = ${fmt.num1(w.g2)}: у жаб ${fmt.int(w.frog)}, у остальных ${fmt.int(w.other)}`)}">${escapeHtml(w.word)}</button>`).join('')}</div>`
        : '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: у жаб мало текста или их лексика не отличается.</p>';
    const grad = table(
        ['Признак', 'ρ Спирмена', 'p', 'Вывод'],
        F.gradient.map((g) => ({ cells: [g.label, fmt.num2(g.rho), pval(g.p), g.p < 0.05 ? (g.rho > 0 ? 'растёт с уровнем жабы' : 'снижается с уровнем жабы') : 'связи с уровнем нет'] })),
    ) + table(
        ['Уровень', 'Клиентов', 'Обращений на клиента', 'Негатив', 'Срочные'],
        F.byLevel.map((b) => ({ cells: [b.level ? FROG_LEVEL_LABELS[b.level] : 'не в списке', fmt.int(b.clients), fmt.num1(b.appealsPerClient), fmt.pct(b.neg), fmt.pct(b.urg)] })),
        { numeric: [1, 2] },
    );
    const BA = F.beforeAfter;
    const ba = BA.insufficient
        ? '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: нужно ≥ 3 жаб, внесённых в список внутри периода базы и имеющих обращения.</p>'
        : `<div class="ca-ins-tiles">${statTile('До внесения', `${fmt.num2(BA.beforeRate)}`, 'обращений в 30 дней (на все такие жабы)')}${statTile('После внесения', `${fmt.num2(BA.afterRate)}`, 'обращений в 30 дней')}${statTile('Продолжили обращаться', fmt.pct(BA.continuedShare, 0), `${fmt.int(BA.continued)} из ${fmt.int(BA.eligible)}`)}</div>`;
    const monthly = F.monthly.length
        ? columns(F.monthly.map((m) => ({ label: fmt.month(m.month), value: Math.round(m.share * 1000) / 10, tip: `${fmt.month(m.month)}: ${fmt.int(m.frog)} из ${fmt.int(m.total)} (${fmt.pct(m.share)})`, drill: `frogmonth:${m.month}` })), { height: 170, valueFmt: (v) => `${fmt.num1(v)}%`, ariaLabel: 'Доля обращений жаб по месяцам, %' })
        : '<p class="ca-viz-empty">Нет дат.</p>';
    const M = F.model;
    let model;
    if (M.insufficient) {
        model = `<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: для модели нужно ≥ 8 клиентов-жаб с обращениями и ≥ 30 остальных (сейчас ${fmt.int(M.positives)} и ${fmt.int(M.negatives)}).</p>`;
    } else {
        const weights = barsH(M.weights.map((w) => ({ label: w.label, value: Math.abs(w.w), note: w.w >= 0 ? '↑ повышает' : '↓ понижает' })), { valueFmt: (v) => fmt.num2(v) });
        const cands = M.candidates.length
            ? table(
                  ['ИНН', 'Сходство', 'Обращений', 'Почему', ''],
                  M.candidates.map((c) => ({
                      cells: [
                          { html: `<button type="button" class="ca-ins-link" data-ins-action="open-inn" data-inn="${escapeHtml(c.inn)}">${escapeHtml(c.inn)}</button>` },
                          fmt.pct(c.p, 0),
                          fmt.int(c.appeals),
                          c.reasons.join(', ') || '—',
                          { html: `<button type="button" class="ca-ins-link" data-ca-drill="inn:${escapeHtml(c.inn)}">записи</button>` },
                      ],
                  })),
                  { numeric: [1, 2] },
              )
            : `<p class="ca-viz-empty">Кандидаты не показываются: качество модели ${escapeHtml(M.quality)} (AUC ${Number.isFinite(M.auc) ? fmt.num2(M.auc) : '—'} < 0,6) — её подсказки были бы не лучше случайных.</p>`;
        model = `<p class="ca-ins-card-note">Логистическая регрессия по поведенческим признакам клиента (лексика не используется — иначе модель «подсматривала» бы ответ). Обучено на ${fmt.int(M.trainedOn)} клиентах. Качество на 5-кратной перекрёстной проверке: AUC ${Number.isFinite(M.auc) ? fmt.num2(M.auc) : '—'} — ${escapeHtml(M.quality)}. Это статистическое сходство с профилем жаб, а не решение о внесении в список.</p>
<h4 class="ca-ins-subtitle">Вклад признаков (стандартизованные коэффициенты)</h4>${weights}<h4 class="ca-ins-subtitle">Клиенты, больше всего похожие на жаб</h4>${cands}`;
    }
    const entries = table(
        ['Организация', 'Уровень', 'ИНН', 'Обращений', 'Последнее', 'После внесения', 'Найдено по', ''],
        F.entryRows.slice(0, 200).map((r) => ({
            cells: [
                { html: `<button type="button" class="ca-ins-link" data-ins-action="open-frog" data-frog-id="${escapeHtml(String(r.id))}">${escapeHtml(r.name || '—')}</button>` },
                { html: frogBadge(r.level) },
                { html: `${escapeHtml(r.inn || '—')}${r.inn && !r.innValid ? ' <span class="ca-ins-badge lvl-serious" title="Контрольная сумма ИНН не сходится">КС</span>' : ''}` },
                fmt.int(r.appeals) + (r.mentions ? ` (+${fmt.int(r.mentions)} упом.)` : ''),
                fmt.date(r.last),
                r.afterAdded == null ? '—' : fmt.int(r.afterAdded),
                r.via.map((v) => FROG_VIA_LABELS[v]).join(', ') || '—',
                r.appeals || r.mentions ? { html: `<button type="button" class="ca-ins-link" data-ca-drill="frogentry:${escapeHtml(String(r.id))}">записи</button>` } : '',
            ],
        })),
        { numeric: [3, 5] },
    );
    const neighbors = F.neighbors.length
        ? table(
              ['ИНН', 'Обращений', 'Связан с жабами', 'Через контакт'],
              F.neighbors.map((v) => ({
                  cells: [
                      { html: `<button type="button" class="ca-ins-link" data-ins-action="open-inn" data-inn="${escapeHtml(v.inn)}">${escapeHtml(v.inn)}</button>` },
                      fmt.int(v.appeals),
                      { html: `${frogBadge(v.maxLevel)} ${escapeHtml(v.frogs.slice(0, 3).join(', '))}` },
                      v.via.map((c) => (/^\d{11}$/.test(c) ? formatRussianPhoneForDisplay(c) : c)).join(', '),
                  ],
                  drill: `inn:${v.inn}`,
              })),
              { numeric: [1] },
          )
        : '<p class="ca-viz-empty">Других ИНН с телефонами или почтой жаб не найдено.</p>';
    const hyg = F.hygiene.filter((h) => h.count > 0);
    const hygiene = hyg.length
        ? table(
              ['Проблема списка', 'Уровень', 'Записей', 'Примеры', 'Пояснение'],
              hyg.map((h) => ({
                  cells: [
                      h.label,
                      { html: `<span class="ca-ins-badge lvl-${h.level}"><i class="fas ${LEVEL_ICON[h.level]}" aria-hidden="true"></i> ${LEVEL_TEXT[h.level]}</span>` },
                      fmt.int(h.count),
                      { html: h.ids.slice(0, 4).map((id) => {
                          const row = F.entryRows.find((r) => r.id === id);
                          return `<button type="button" class="ca-ins-link" data-ins-action="open-frog" data-frog-id="${escapeHtml(String(id))}">${escapeHtml((row && row.name) || `#${id}`)}</button>`;
                      }).join(', ') + (h.ids.length > 4 ? ` и ещё ${h.ids.length - 4}` : '') },
                      h.hint,
                  ],
              })),
              { numeric: [2] },
          )
        : '<p class="ca-viz-empty">Проблем в списке не найдено.</p>';
    return [
        `<div class="ca-ins-tiles is-wide">${tiles}</div>`,
        section('Как найдены совпадения', via, { note: 'ИНН, телефон и данные из примечания — сильные совпадения (дают уровень). Название организации в тексте — слабое, только подсказка.' }),
        section('Обращения жаб по уровням', levels),
        section('Чем жабы отличаются от остальных клиентов', cmp, { wide: true, note: 'U-тест Манна — Уитни по клиентам; r — ранго-бисериальная корреляция (> 0 — у жаб больше). * — значимо после поправки Бенджамини — Хохберга (q < 0,05).' }),
        section('Признаки обращений: жабы против остальных', props, { wide: true, note: 'z-тест разности долей; отношение шансов с поправкой Холдейна и 95% ДИ по Вульфу. * — q < 0,05 (Бенджамини — Хохберг).' }),
        section('Темы, характерные для жаб', topics, { wide: true, note: 'Отношение шансов > 1 — тема у жаб встречается чаще. * — различие значимо после поправки Бенджамини — Хохберга на число тем (q < 0,05).' }),
        section('Слова, характерные для жаб', words, { note: 'G² Даннинга по сравнению с остальными обращениями; оставлены слова с q < 0,01 после поправки Бенджамини — Хохберга на число проверенных слов.' }),
        section('Доля обращений жаб по месяцам, %', monthly),
        section('Градиент по уровню жабы', grad, { wide: true, note: 'Связь уровня (0 — не в списке … 3 — гипержаба) с поведением клиента.' }),
        section('До и после внесения в список', ba, { wide: true, note: 'Сравнение темпа обращений жаб до и после даты добавления в чёрный список (только жабы, внесённые внутри периода базы).' }),
        section('Похожие на жаб клиенты (модель)', model, { wide: true }),
        section('Соседи жаб: тот же телефон или e-mail', neighbors, { wide: true, note: 'Другие ИНН, у которых в обращениях тот же контакт, что у клиента-жабы (контакты у 30+ клиентов не учитываются).' }),
        section('Записи чёрного списка и их обращения', entries, { wide: true }),
        section('Проверка самого чёрного списка', hygiene, { wide: true }),
    ].join('');
}

function fcrTopicsHtml(I) {
    const F = I.fcr;
    if (!F || F.insufficient) return '<p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: нужно ≥ 20 датированных обращений с ИНН или телефоном.</p>';
    return `<div class="ca-ins-tiles">${statTile('FCR, окно 7 дней', fmt.pct(F.w7.fcr, 1), `95% ДИ ${fmt.pct(F.w7.lo)}–${fmt.pct(F.w7.hi)} · повторов ${fmt.int(F.w7.repeats)}`)}${statTile('FCR, окно 14 дней', fmt.pct(F.w14.fcr, 1), `95% ДИ ${fmt.pct(F.w14.lo)}–${fmt.pct(F.w14.hi)}`)}</div>
<h4 class="ca-ins-subtitle">Доля обращений с повтором по теме (чем длиннее — тем хуже решается)</h4>
${barsH(F.topics.map((t) => ({ label: t.label, value: (1 - t.fcr) * 100, note: `FCR ${fmt.pct(t.fcr, 0)} · ${fmt.int(t.repeats)} из ${fmt.int(t.n)}`, tip: `${t.label}: повтор после ${fmt.pct(1 - t.fcr)} обращений; FCR ${fmt.pct(t.fcr)} (95% ДИ ${fmt.pct(t.lo)}–${fmt.pct(t.hi)})` })), { valueFmt: (v) => `${fmt.num1(v)}%` })}
<p class="ca-ins-card-note"><button type="button" class="ca-ins-link" data-ca-drill="repeat7">Показать обращения, после которых был повтор (${fmt.int(F.w7.repeats)})</button></p>`;
}

function customTopicsHtml(I) {
    const counts = Object.fromEntries(I.topics.list.map((t) => [t.id, t.count]));
    const rows = st.customTopics.length
        ? table(
              ['Тема', 'Ключевые слова', 'Обращений', ''],
              st.customTopics.map((t) => {
                  const id = String(t.id).startsWith('u_') ? t.id : `u_${t.id}`;
                  return {
                      cells: [
                          t.label,
                          t.words,
                          counts[id] != null ? fmt.int(counts[id]) : 'ошибка в словах',
                          { html: `<button type="button" class="ca-ins-link" data-ca-drill="topic:${escapeHtml(id)}">записи</button> · <button type="button" class="ca-ins-link" data-ins-action="topic-edit" data-topic-id="${escapeHtml(String(t.id))}">изменить</button> · <button type="button" class="ca-ins-link" data-ins-action="topic-del" data-topic-id="${escapeHtml(String(t.id))}">удалить</button>` },
                      ],
                  };
              }),
              { numeric: [2] },
          )
        : '<p class="ca-viz-empty">Своих тем пока нет.</p>';
    const sugg = (I.topics.untaggedTerms || []).length
        ? `<h4 class="ca-ins-subtitle">Частые слова в обращениях без темы (${fmt.int(I.topics.untagged)}) — нажмите, чтобы добавить в ключевые слова · <button type="button" class="ca-ins-link" data-ca-drill="untagged">показать эти обращения</button></h4><div class="ca-ins-cloud">${I.topics.untaggedTerms
              .map((w) => `<button type="button" class="ca-ins-term" data-ins-action="suggest-word" data-word="${escapeHtml(w.word)}" data-tip="${escapeHtml(`в ${fmt.int(w.df)} обращениях без темы (${fmt.pct(w.share)})`)}">${escapeHtml(w.word)} <small>${fmt.int(w.df)}</small></button>`)
              .join('')}</div>`
        : '';
    return `${rows}
<form class="ca-ins-topicform" id="caInsTopicForm" onsubmit="return false">
  <input type="hidden" name="topicId" value="">
  <label class="ca-ins-field"><span>Название темы</span><input type="text" name="label" maxlength="80" placeholder="например: Акты сверки"></label>
  <label class="ca-ins-field ca-ins-grow"><span>Ключевые слова (через запятую)</span><textarea id="caInsTopicWords" name="words" rows="2" placeholder="акт сверки, сверк, взаиморасч*т"></textarea></label>
  <div class="ca-ins-topicform-actions"><span id="caInsTopicPreview" class="ca-viz-muted text-xs" aria-live="polite"></span><button type="button" class="ca-ins-btn ca-ins-btn-primary" data-ins-action="topic-add">Сохранить тему</button></div>
</form>${sugg}`;
}

function topicPreviewCount(words) {
    const re = compileTopicKeywords(words);
    if (!re) return null;
    let c = 0;
    for (const r of st.filtered) {
        if (re.test(normalizeForAnalysis(r.question || ''))) c++;
    }
    return c;
}

async function saveCustomTopicFromForm() {
    const form = document.getElementById('caInsTopicForm');
    if (!form) return;
    const label = form.label.value.trim();
    const words = form.words.value.trim();
    if (!label || !compileTopicKeywords(words)) {
        const pv = document.getElementById('caInsTopicPreview');
        if (pv) pv.textContent = !label ? 'Укажите название темы.' : 'Добавьте хотя бы одно слово из 2+ букв.';
        return;
    }
    const id = form.topicId.value || String(Date.now());
    const next = st.customTopics.filter((t) => String(t.id) !== id);
    next.push({ id, label, words });
    st.customTopics = next;
    if (api.saveCustomTopics) await api.saveCustomTopics(next);
    setCustomTopics(next);
    if (api.notify) api.notify(`Тема «${label}» сохранена`, 'success');
    await recompute();
}

async function deleteCustomTopic(id) {
    st.customTopics = st.customTopics.filter((t) => String(t.id) !== String(id));
    if (api.saveCustomTopics) await api.saveCustomTopics(st.customTopics);
    setCustomTopics(st.customTopics);
    await recompute();
}

function editCustomTopic(id) {
    const t = st.customTopics.find((x) => String(x.id) === String(id));
    const form = document.getElementById('caInsTopicForm');
    if (!t || !form) return;
    form.topicId.value = t.id;
    form.label.value = t.label;
    form.words.value = t.words;
    form.words.dispatchEvent(new Event('input'));
    form.label.focus();
}

function renderTopics(I) {
    const T = I.topics;
    const trendRows = T.list.filter((t) => t.count > 0).map((t) => ({
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
        section('Свои темы', customTopicsHtml(I), { wide: true, note: 'Добавьте тему со своими ключевыми словами — она сразу участвует во всей аналитике (доли, тренды, жабы, CSV). Слово совпадает с началом слов текста: «сверк» найдёт «сверка», «сверки». Фраза — слова подряд, «*» — любые буквы.' }),
        section('Темы обращений', topicBars(I), { note: `Рубрикатор по словарю предметной области; одно обращение может относиться к нескольким темам. Без темы: ${fmt.int(T.untagged)} (${fmt.pct(T.untaggedShare)}). Разнообразие тем (норм. энтропия): ${fmt.num2(T.diversity)}.` }),
        section('Намерения', barsH(T.intents.map((t) => ({ label: t.label, value: t.count, drill: `intent:${t.id}` })), { showShare: I.overview.records })),
        section('Решение с первого обращения по темам', fcrTopicsHtml(I), { wide: true, note: 'Повтор — тот же клиент (ИНН, иначе телефон) обратился снова по той же теме в течение 7 дней; дословные дубли не считаются. Внутренний расчёт по повторам обычно завышает FCR на 10–20 п.п. относительно опросов клиентов — используйте для сравнения тем между собой.' }),
        section('Изменение долей тем: 30 дней против предыдущих 30', table(['Тема', 'Всего', 'Доля (95% ДИ Уилсона)', 'Доля: было → стало', 'Изменение'], trendRows, { numeric: [1] }) + '<p class="ca-ins-card-note">* — изменение значимо после поправки Бенджамини — Хохберга на число тем (q < 0,05; G² Даннинга; в каждом окне ≥ 20 обращений).</p>', { wide: true }),
        section(`Смысловые группы (k-means, k = ${I.clusters.k || '—'})`, clusters, { wide: true, note: I.clusters.insufficient ? '' : `Сферический k-means по TF-IDF основ слов (${fmt.int(I.clusters.vocabulary)} признаков), k выбран по силуэту (${fmt.num2(I.clusters.silhouette)}). Вне групп (мало слов): ${fmt.int(I.clusters.unclustered)}.` }),
        section('Срочность', urg, { note: `Срочных (≥ 2 баллов): ${fmt.int(T.urgent)}. Негативная окраска: ${fmt.int(T.negative)}.` }),
        section('Совместная встречаемость тем', co),
        section('Матрица тем', heatmap(T.matrix, T.matrixLabels.map((l) => l.split(/[,(]/)[0].trim()), T.matrixLabels.map((_, i) => String(i + 1)), { cellLabel: false, tipFmt: (r, c, v) => `${T.matrixLabels[r]} × ${T.matrixLabels[c]}: ${fmt.int(v)}`, drillFmt: (r, c) => `topicpair:${activeTopics()[r].id}:${activeTopics()[c].id}`, ariaLabel: 'Матрица совместной встречаемости тем' }), { wide: true, note: 'Столбцы пронумерованы в том же порядке, что и строки; диагональ — число обращений темы.' }),
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
        section('Новые и уходящие слова (30 дней)', emerging, { note: 'Логарифмическое правдоподобие G² Даннинга: |G²| > 10,83 и q < 0,01 после поправки Бенджамини — Хохберга на число проверенных слов.' }),
        section('Буквенный профиль', letters, { note: `Расстояние Йенсена — Шеннона до эталона русского языка: ${fmt.num2(X.letterJsd)} (0 — совпадение; > 0,2 — много аббревиатур, сокращений или проблемы кодировки). Всего букв: ${fmt.int(X.lettersTotal)}.` }),
        section('Классы символов', chars),
        section('Смешанная письменность', mixed),
        section('Возможные опечатки', typos, { note: 'Редкое слово (≤ 2 раз) на расстоянии одной правки (Дамерау — Левенштейн) от частого слова (≥ 10× чаще).' }),
        section('Закон Ципфа (лог-лог)', zipfChart(X.zipf.points, X.zipf), { note: 'Точки — частоты основ по рангу; линия — регрессия.' }),
    ].join('');
}

function renderCompare(I) {
    const R = st.compareRange || defaultCompareRange(I);
    if (!R) return section('Сравнение периодов', '<p class="ca-viz-empty">Нет дат.</p>', { wide: true });
    const form = `<form class="ca-ins-filters ca-ins-compareform" id="caInsCompareForm" onsubmit="return false">
  <fieldset class="ca-ins-period"><legend>Период A (было)</legend><label class="ca-ins-field"><span>с</span><input type="date" name="aFrom" value="${escapeHtml(R.A.from)}"></label><label class="ca-ins-field"><span>по</span><input type="date" name="aTo" value="${escapeHtml(R.A.to)}"></label></fieldset>
  <fieldset class="ca-ins-period"><legend>Период B (стало)</legend><label class="ca-ins-field"><span>с</span><input type="date" name="bFrom" value="${escapeHtml(R.B.from)}"></label><label class="ca-ins-field"><span>по</span><input type="date" name="bTo" value="${escapeHtml(R.B.to)}"></label></fieldset>
  <button type="button" class="ca-ins-btn ca-ins-btn-primary" data-ins-action="compare-run">Сравнить</button>
</form>`;
    const C = st.compare;
    let body = '<div id="caInsCompareOut"><p class="ca-viz-muted">Выберите периоды и нажмите «Сравнить».</p></div>';
    if (C) {
        if (C.insufficient) {
            body = `<div id="caInsCompareOut"><p class="ca-viz-empty">НЕТ ДАННЫХ ДЛЯ НАДЁЖНОГО ВЫВОДА: в периоде A ${fmt.int(C.A.n)}, в периоде B ${fmt.int(C.B.n)} обращений (нужно ≥ 5 в каждом).</p></div>`;
        } else {
            const sig = (x) => (x.significant ? { html: `<span class="${x.deltaPp > 0 ? 'ca-ins-up' : 'ca-ins-down'}">${x.deltaPp > 0 ? '▲ +' : '▼ '}${fmt.num1(x.deltaPp)} п.п. *</span>` } : `${x.deltaPp > 0 ? '+' : ''}${fmt.num1(x.deltaPp)} п.п.`);
            const shareTable = (rows, first) =>
                table([first, 'A', 'B', 'Изменение', 'p / q', 'OR (95% ДИ)'], rows.map((x) => ({ cells: [x.label, `${fmt.pct(x.shareA)} (${fmt.int(x.a)})`, `${fmt.pct(x.shareB)} (${fmt.int(x.b)})`, sig(x), `${pval(x.p)} / q = ${x.q != null ? fmt.num2(x.q) : '—'}`, x.or ? `${fmt.num2(x.or.or)} (${fmt.num2(x.or.lo)}–${fmt.num2(x.or.hi)})` : '—'] })), { numeric: [1, 2] });
            const wordsTbl = (rows, head) =>
                rows.length ? table([head, 'A', 'B', 'G²'], rows.map((w) => ({ cells: [w.word, fmt.int(w.a), fmt.int(w.b), fmt.num1(w.g2)] })), { numeric: [1, 2, 3] }) : '<p class="ca-viz-empty">Значимых изменений нет.</p>';
            const rateSig = C.rate.p < 0.05;
            body = `<div id="caInsCompareOut" class="ca-ins-grid">
<div class="ca-ins-tiles is-wide">${statTile('Обращений в день', `${fmt.num1(C.rate.a)} → ${fmt.num1(C.rate.b)}`, `${C.rate.ratio != null ? `×${fmt.num2(C.rate.ratio)}` : ''} · ${pval(C.rate.p)}${rateSig ? ' · значимо' : ' · незначимо'} · дисперсия φ = ${fmt.num1(C.rate.phi)}`, { tone: rateSig && C.rate.ratio > 1 ? 'warning' : '' })}${statTile('Обращений', `${fmt.int(C.A.n)} → ${fmt.int(C.B.n)}`, `${C.A.days} и ${C.B.days} дн.`)}${statTile('Клиентов', `${fmt.int(C.clients.a)} → ${fmt.int(C.clients.b)}`, `новых в B: ${fmt.int(C.clients.newInB)} · ушли: ${fmt.int(C.clients.lostFromA)} · в обоих: ${fmt.int(C.clients.both)}`)}</div>
${section('Сигналы', shareTable(C.signals, 'Признак'), { wide: true })}
${section('Темы', shareTable(C.topics, 'Тема'), { wide: true, note: '* — z-тест разности долей с поправкой Бенджамини — Хохберга на все темы и намерения (q < 0,05) при ≥ 20 обращениях в каждом периоде. Без поправки при ~25 проверках 1–2 «значимых» различия появлялись бы случайно.' })}
${section('Намерения', shareTable(C.intents, 'Намерение'), { wide: true })}
${section('Слова, которые учащаются в B', wordsTbl(C.rising, 'Слово'), { note: 'G² Даннинга: |G²| > 10,83 и q < 0,01 (Бенджамини — Хохберг).' })}
${section('Слова, которые уходят в B', wordsTbl(C.falling, 'Слово'))}
</div>`;
        }
    }
    return section('Сравнение двух периодов', form + body, { wide: true, note: 'Периоды берутся из текущей выборки (с учётом фильтров сверху). Разница темпа проверяется условным биномиальным тестом с квазипуассоновской поправкой на «волновой» поток (φ — индекс дисперсии дневных объёмов).' });
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
        ['Жабы: сопоставление', 'Запись обращения связывается с записью чёрного списка по ИНН, по второму ИНН в тексте, по телефону и по ИНН/телефонам/e-mail из примечания (сильные совпадения, дают уровень). Название организации в тексте (без формы собственности и кавычек) — слабое совпадение, только подсказка.'],
        ['Жабы: сравнение', 'Клиенты-жабы против остальных — U-тест Манна — Уитни и ранго-бисериальная корреляция; признаки обращений — z-тест долей и отношение шансов (поправка Холдейна, 95% ДИ Вульфа); лексика — G² Даннинга; связь с уровнем — ρ Спирмена; темп обращений до/после даты внесения в список.'],
        ['Жабы: модель', 'Логистическая регрессия с L2 по поведенческим признакам клиента, веса классов уравновешены, качество — AUC на стратифицированной 5-кратной перекрёстной проверке. Кандидаты не показываются при AUC < 0,6. Лексика в модель не входит, чтобы не было утечки метки.'],
        ['Множественные сравнения', 'Когда проверяется много гипотез сразу (темы, намерения, слова, признаки жаб), p-значения корректируются процедурой Бенджамини — Хохберга (контроль доли ложных открытий): тема или слово помечается значимым, только если q < 0,05 (для слов — q < 0,01). Без поправки при 25 проверках 1–2 ложные «находки» ожидаются просто случайно.'],
        ['Прогноз', 'Три модели — «как неделю назад», среднее того же дня недели за 4 недели, Холт — Винтерс с затухающим трендом; выбирается лучшая по MASE на скользящем бэктесте (8 точек отсчёта, горизонт 14 дней). Интервалы — эмпирические квантили ошибок бэктеста; рядом показана их фактическая калибровка.'],
        ['Сравнение периодов', 'Темп — условный биномиальный тест (при равном темпе доля обращений периода A равна доле его дней) с квазипуассоновской поправкой z/√φ, где φ — индекс дисперсии дневных объёмов; доли тем, намерений и сигналов — z-тест с поправкой Бенджамини — Хохберга; слова — G² с поправкой; клиенты — новые, ушедшие и оставшиеся по ИНН.'],
        ['Решение с первого обращения', 'Прокси FCR: обращение решено, если тот же клиент (ИНН, иначе первый телефон) не обратился снова по той же теме (или оба без темы) за 7 / 14 дней; дословные дубли не считаются. Интервал — Уилсон. Внутренний расчёт по повторам обычно завышает FCR на 10–20 п.п. по сравнению с опросами клиентов.'],
        ['Календарь', 'Производственный календарь РФ 2024–2027 (постановления № 1314, 1335, 1466, 1187): праздники, перенесённые выходные, рабочие субботы. Всплески и провалы ищутся отдельно среди рабочих и нерабочих дней. Прогноз учится на ряду, где праздники заменены типичным уровнем, и применяет к будущим праздникам коэффициент, измеренный по прошлым. Для дат вне 2024–2027 праздники не учитываются.'],
        ['Сроки отчётности', 'Учитываются только подтверждённые общие правила: уведомления и отчётность — 25-е, уплата ЕНП — 28-е, квартальные НДС, РСВ, 6-НДФЛ, ЕФС-1 (раздел 2) — 25-е месяца после квартала, годовой 6-НДФЛ — 25 февраля, годовая декларация по прибыли — 25 марта; с переносом на ближайший рабочий день. Эффект сроков — U-тест «0–2 рабочих дня до срока против остальных»; совпадение всплесков со сроками — точный биномиальный тест против доли таких дней в календаре.'],
        ['Телефоны', 'Российские номера нормализуются к 11 цифрам (7XXXXXXXXXX), иностранные хранятся как «+код…». «+7 6xx/7xx» — Казахстан. 8-800 — горячие линии: не связывают клиентов и не используются в сверке с чёрным списком. Добавочный («доб. 1234») сохраняется отдельно.'],
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
            const tp = activeTopics().find((t) => t.id === arg);
            title = `Тема: ${tp ? tp.label : arg}`;
            if (tp) highlight = { re: tp.re };
            break;
        }
        case 'repeat7':
            ids = I.index.repeat7 || [];
            title = 'Обращения, после которых был повтор по той же теме (≤ 7 дней)';
            break;
        case 'chain':
            ids = (I.index.chainIds && I.index.chainIds[arg]) || [];
            title = `Цепочка повторных обращений (${ids.length})`;
            break;
        case 'untagged':
            ids = I.topics.untaggedIds || [];
            title = 'Обращения без темы';
            break;
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
        case 'frog': {
            const key = arg === 'all' ? 'all' : arg;
            ids = (I.index.frog && I.index.frog[key]) || [];
            title = key === 'all' ? 'Обращения жаб' : `Обращения: ${FROG_LEVEL_LABELS[Number(key.slice(1))] || key}`;
            break;
        }
        case 'frogvia':
            ids = (I.index.frog && I.index.frog[arg]) || [];
            title = `Жабы, найденные по: ${FROG_VIA_LABELS[arg] || arg}`;
            break;
        case 'frogentry': {
            ids = (I.index.frogEntry && I.index.frogEntry[arg]) || [];
            const row = I.frogs.entryRows.find((r) => String(r.id) === arg);
            title = `Жаба: ${row ? row.name : arg}`;
            break;
        }
        case 'frogtopic': {
            const fs = new Set((I.index.frog && I.index.frog.all) || []);
            ids = (I.index.topic[arg] || []).filter((id) => fs.has(id));
            title = `Жабы · тема: ${I.labels.topics[arg] || arg}`;
            const tp = activeTopics().find((t) => t.id === arg);
            if (tp) highlight = { re: tp.re };
            break;
        }
        case 'frogword': {
            const fs = new Set((I.index.frog && I.index.frog.all) || []);
            ids = recs.filter((r) => fs.has(r.id) && tokenizeDetailed(r.question || '').some((t) => ((I.stemCanon || {})[t.stem] || t.stem) === arg)).map((r) => r.id);
            title = `Жабы · слово: ${arg}…`;
            highlight = { stems: new Set([arg]) };
            break;
        }
        case 'frogmonth': {
            const fs = new Set((I.index.frog && I.index.frog.all) || []);
            ids = byDate((d) => d.ymd.startsWith(arg)).filter((id) => fs.has(id));
            title = `Жабы · ${fmt.month(arg)}`;
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
    // куда вернуть фокус после закрытия списка (клавиатурная навигация)
    const active = document.activeElement;
    if (active && active !== document.body && !document.getElementById('caInsDrawer')?.contains(active)) st.drillReturn = active;
    const { ids, title, highlight } = resolveDrill(key);
    st.drill = { key, ids, title: title || label, highlight };
    st.drillPage = 1;
    renderDrawer();
}

function closeDrawer() {
    const d = document.getElementById('caInsDrawer');
    const wasOpen = d && !d.hidden;
    if (d) {
        d.hidden = true;
        d.innerHTML = '';
    }
    st.drill = null;
    const back = st.drillReturn;
    st.drillReturn = null;
    if (wasOpen && back && document.contains(back) && typeof back.focus === 'function') back.focus({ preventScroll: true });
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
        const canon = (st.insights && st.insights.stemCanon) || {};
        for (const t of tokenizeDetailed(q)) {
            if (!hl.stems.has(canon[t.stem] || t.stem)) continue;
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
  <span class="ca-ins-rec-head"><span>${escapeHtml(dateLabel)}</span><span>${r.inn ? `ИНН ${escapeHtml(r.inn)}` : 'без ИНН'}</span>${pr.u >= 2 ? '<span class="ca-ins-badge lvl-warning">срочно</span>' : ''}${pr.f ? (pr.f.l ? frogBadge(pr.f.l, pr.f.v) : frogBadge(pr.f.w, pr.f.v, { weak: true })) : ''}</span>
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

function frogXrayHtml(r) {
    if (!st.frogIndex || !st.frogIndex.frogs.length) return 'список пуст';
    const m = matchRecordToFrogs(r, st.frogIndex);
    if (!m.entries.length) return 'совпадений нет';
    return m.entries
        .map((id) => {
            const f = st.frogIndex.byId.get(id);
            return `${frogBadge(f.level)} <button type="button" class="ca-ins-link" data-ins-action="open-frog" data-frog-id="${escapeHtml(String(id))}">${escapeHtml(f.name || `#${id}`)}</button>`;
        })
        .join('<br>') + `<br><span class="ca-viz-muted">найдено по: ${escapeHtml(m.via.map((v) => FROG_VIA_LABELS[v]).join(', '))}${m.level ? '' : ' (слабое совпадение — только название)'}</span>`;
}

const TOKEN_KIND_LABEL = { stop: 'стоп-слово', numeric: 'число', mixed: 'смешанная письменность', content: 'значимое слово' };

function renderXray(recordId) {
    const d = document.getElementById('caInsDrawer');
    const r = st.byId.get(recordId);
    if (!d || !r) return;
    const x = xrayRecord(r, { df: st.insights.df, canon: st.insights.stemCanon, n: st.insights.overview.records });
    const q = String(r.question || '');
    let tokHtml = '';
    let last = 0;
    for (const t of x.tokens) {
        tokHtml += escapeHtml(q.slice(last, t.start));
        const kind = t.homoglyph || t.script === 'mixed' ? 'mixed' : t.stop ? 'stop' : t.numeric ? 'numeric' : 'content';
        const tip = `${TOKEN_KIND_LABEL[kind]} · основа «${t.stem}»${t.norm !== t.surface.toLowerCase() ? ` · исправлено: «${t.norm}»` : ''}${t.idf ? ` · IDF ${fmt.num2(t.idf)}` : ''}`;
        const w = t.idf ? Math.min(4, Math.max(1, Math.round(t.idf / 2))) : 1;
        // слова не фокусируемые: иначе длинный текст давал сотни остановок Tab; подсказка — при наведении
        tokHtml += `<span class="ca-ins-tok k-${kind}${kind === 'content' ? ` w${w}` : ''}" data-tip="${escapeHtml(tip)}">${escapeHtml(t.surface)}</span>`;
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
        ['Чёрный список', frogXrayHtml(r), true],
    ]
        .map(([k, v, html]) => `<div><dt>${escapeHtml(k)}</dt><dd>${html ? v : escapeHtml(v)}</dd></div>`)
        .join('');
    const chars = x.chars;
    d.hidden = false;
    d.innerHTML = `<div class="ca-ins-drawer-head"><div class="min-w-0"><h3 class="ca-ins-card-title m-0">Разбор обращения</h3><p class="ca-viz-muted text-xs m-0">${fmt.int(x.length)} символов · ${fmt.int(x.words)} слов (значимых ${fmt.int(x.contentWords)}, служебных ${fmt.int(x.stopWords)}) · предложений ${fmt.int(x.sentences)}</p></div>
<div class="flex gap-1">${st.drill ? '<button type="button" class="ca-ins-btn" data-ins-action="drawer-back" aria-label="К списку записей"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>К списку</span></button>' : ''}<button type="button" class="ca-ins-btn ca-ins-btn-icon" data-ins-action="drawer-close" aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button></div></div>
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
    // кнопка записи, по которой кликнули, перерисована — фокус переносится в панель, а не теряется
    d.querySelector('[data-ins-action="drawer-back"], [data-ins-action="drawer-close"]')?.focus({ preventScroll: true });
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
    const head = ['id', 'дата', 'время', 'источник даты', 'ИНН', 'КПП', 'телефоны', 'e-mail', 'темы', 'намерение', 'группа', 'срочность', 'негатив', 'жаба: уровень', 'жаба: найдено по', 'вопрос', 'файл', 'пункт'];
    const lines = [head.join(';')];
    for (const r of st.filtered) {
        const p = I.perRecord[r.id] || {};
        const ed = effectiveDate(r);
        const cl = I.clusters.list.find((c) => c.id === p.c);
        lines.push(
            [r.id, ed.ymd || '', ed.time || '', ed.source || '', r.inn || '', r.kpp || '', (r.phones || []).join(', '), (r.emails || []).join(', '), (p.t || []).map((t) => I.labels.topics[t]).join(', '), I.labels.intents[p.i] || '', cl ? cl.label : '', p.u ?? '', p.g ?? '', p.f ? p.f.l || `упоминание (${p.f.w})` : '', p.f ? p.f.v.map((v) => FROG_VIA_LABELS[v]).join(', ') : '', r.question || '', r.sourceFileName || '', r.listItemIndex ?? '']
                .map(csvCell)
                .join(';'),
        );
    }
    // BOM — чтобы Excel открыл UTF-8 с кириллицей корректно
    download(`obrashcheniya-priznaki-${stamp()}.csv`, 'text/csv;charset=utf-8', `﻿${lines.join('\r\n')}`);
}
