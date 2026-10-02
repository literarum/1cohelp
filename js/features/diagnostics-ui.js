'use strict';

/**
 * Интерфейс самодиагностики: оверлей хода проверки, итоговый отчёт (сводка, слои, фильтры, карточки
 * с гипотезами и шагами устранения), режим «контекст ошибки» из карточки уведомления, история запусков,
 * копирование отчёта для техподдержки.
 */

import { escapeHtml } from '../utils/html.js';
import {
    DIAGNOSTIC_LAYERS,
    DIAGNOSTIC_LAYER_ORDER,
    collectDiagnosticEnvironment,
    diagnoseIssue,
    formatDiagnosisAsText,
    formatReportAsText,
    groupByLayer,
    inferLayer,
    issueKey,
    compareIssueSets,
    probabilityLabel,
} from './diagnostics-core.js';
import {
    checkGoogleDocsConnection,
    getGoogleDocsConnectionState,
    runGoogleDocsConnectivityProbes,
} from './google-docs.js';

const HISTORY_KEY = 'copilot1co:dx-history';
const HISTORY_MAX = 8;

// ============================================================================
// УТИЛИТЫ
// ============================================================================

function toast(message, type = 'info') {
    try {
        window.NotificationService?.add(message, type, { duration: 3500 });
    } catch {
        /* ignore */
    }
}

async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* fallback ниже */
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function readHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}
function writeHistory(list) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX)));
    } catch {
        /* не критично */
    }
}

/** Приводит отчёт к спискам с уровнем (error/warn/info) без дублей. */
export function normalizeReportEntries(report) {
    const errors = (report?.errors || []).map((e) => ({ ...e, level: 'error' }));
    const warnings = (report?.warnings || []).map((e) => ({ ...e, level: 'warn' }));
    const problemKeys = new Set([...errors, ...warnings].map((e) => `${e.title}|${e.message}`));
    const seen = new Set();
    const ok = [];
    for (const c of report?.checks || []) {
        const k = `${c.title}|${c.message}`;
        if (problemKeys.has(k) || seen.has(k)) continue;
        if (c.level === 'error' || c.level === 'warn') continue;
        seen.add(k);
        ok.push({ ...c, level: 'info' });
    }
    return { errors, warnings, ok };
}

// ============================================================================
// ОВЕРЛЕЙ ХОДА ДИАГНОСТИКИ
// ============================================================================

export const DIAGNOSTIC_STAGES = [
    { id: 'env', label: 'Среда и сеть', icon: 'fa-wifi' },
    { id: 'external', label: 'Внешние сервисы', icon: 'fa-cloud' },
    { id: 'storage', label: 'Хранилище', icon: 'fa-database' },
    { id: 'search', label: 'Поиск и индекс', icon: 'fa-magnifying-glass' },
    { id: 'ui', label: 'Интерфейс', icon: 'fa-window-maximize' },
    { id: 'data', label: 'Экспорт и данные', icon: 'fa-file-shield' },
    { id: 'integrity', label: 'Целостность и итоги', icon: 'fa-list-check' },
];

let activeOverlay = null;

/**
 * Показывает оверлей хода диагностики. Скрывает вспомогательные артефакты зондов под собой.
 * @param {{ onCancel?: () => void }} [opts]
 */
export function startDiagnosticsOverlay(opts = {}) {
    if (activeOverlay) return activeOverlay;
    const root = document.createElement('div');
    root.id = 'dx-overlay';
    root.className = 'dx-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Выполняется проверка систем');
    root.innerHTML = `
      <div class="dx-overlay__card">
        <div class="dx-overlay__pulse" aria-hidden="true"><span class="dx-overlay__ring"></span><span class="dx-overlay__ring dx-overlay__ring--2"></span><i class="fas fa-stethoscope"></i></div>
        <h2 class="dx-overlay__title">Проверка систем</h2>
        <p class="dx-overlay__step" id="dx-overlay-step" aria-live="polite">Подготовка…</p>
        <div class="dx-overlay__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="dx-overlay-bar"></span></div>
        <ul class="dx-overlay__stages" id="dx-overlay-stages">
          ${DIAGNOSTIC_STAGES.map(
              (s) =>
                  `<li data-stage="${s.id}" class="is-pending"><i class="fas ${s.icon}" aria-hidden="true"></i><span>${escapeHtml(s.label)}</span><em class="dx-overlay__state" aria-hidden="true"></em></li>`,
          ).join('')}
        </ul>
        <p class="dx-overlay__hint">Приложение может ненадолго переключать вкладки — это часть проверки.</p>
        <button type="button" class="dx-btn dx-btn--ghost" id="dx-overlay-cancel">Отменить</button>
      </div>`;
    document.body.appendChild(root);
    document.body.classList.add('dx-running');
    const stepEl = root.querySelector('#dx-overlay-step');
    const barEl = root.querySelector('#dx-overlay-bar');
    const barWrap = root.querySelector('.dx-overlay__bar');
    const cancelBtn = root.querySelector('#dx-overlay-cancel');
    let cancelled = false;
    let current = -1;
    let closed = false;

    const setProgress = (done) => {
        const pct = Math.round((done / DIAGNOSTIC_STAGES.length) * 100);
        barEl.style.width = `${pct}%`;
        barWrap.setAttribute('aria-valuenow', String(pct));
    };
    const doCancel = () => {
        if (cancelled) return;
        cancelled = true;
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Отмена…';
        stepEl.textContent = 'Останавливаю после текущей проверки…';
        opts.onCancel?.();
    };
    cancelBtn.addEventListener('click', doCancel);
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            doCancel();
        }
    };
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => root.classList.add('is-visible'));
    cancelBtn.focus({ preventScroll: true });

    const ctl = {
        get cancelled() {
            return cancelled;
        },
        setStage(id, text) {
            const idx = DIAGNOSTIC_STAGES.findIndex((s) => s.id === id);
            if (idx < 0 || idx === current) return;
            const lis = root.querySelectorAll('#dx-overlay-stages li');
            lis.forEach((li, i) => {
                li.classList.toggle('is-done', i < idx);
                li.classList.toggle('is-active', i === idx);
                li.classList.toggle('is-pending', i > idx);
            });
            current = idx;
            stepEl.textContent = text || `${DIAGNOSTIC_STAGES[idx].label}…`;
            setProgress(idx);
        },
        setText(text) {
            stepEl.textContent = text;
        },
        finish(summary = 'Готово') {
            if (closed) return;
            root.querySelectorAll('#dx-overlay-stages li').forEach((li) => {
                li.classList.remove('is-active', 'is-pending');
                li.classList.add('is-done');
            });
            setProgress(DIAGNOSTIC_STAGES.length);
            stepEl.textContent = summary;
            ctl.close();
        },
        close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey, true);
            root.classList.remove('is-visible');
            root.classList.add('is-leaving');
            document.body.classList.remove('dx-running');
            activeOverlay = null;
            setTimeout(() => root.remove(), 260);
        },
    };
    activeOverlay = ctl;
    return ctl;
}

// ============================================================================
// ДИАГНОЗЫ ДЛЯ ОТЧЁТА
// ============================================================================

function buildDiagnoses(entries, env, probes) {
    return entries.map((e) => {
        const d = diagnoseIssue(e, { env, probes: e.layer === 'external' || inferLayer(e) === 'external' ? probes : {} });
        d.level = e.level;
        return d;
    });
}

function layerStatusMap(diagnoses) {
    const map = {};
    for (const id of DIAGNOSTIC_LAYER_ORDER) map[id] = 'ok';
    for (const d of diagnoses) {
        if (d.level === 'error') map[d.layer] = 'error';
        else if (d.level === 'warn' && map[d.layer] !== 'error') map[d.layer] = 'warn';
    }
    return map;
}

// ============================================================================
// ОТРИСОВКА
// ============================================================================

function renderHypotheses(d) {
    return d.hypotheses
        .map(
            (h, i) => `
        <li class="dx-hyp${i === 0 ? ' is-top' : ''}">
          <div class="dx-hyp__head"><span class="dx-hyp__title">${escapeHtml(h.title)}</span>
            <span class="dx-hyp__prob" title="${escapeHtml(probabilityLabel(h.probability))}">${h.probability}%</span></div>
          <div class="dx-hyp__bar" aria-hidden="true"><span style="width:${Math.min(100, h.probability)}%"></span></div>
          ${h.evidence.length ? `<ul class="dx-hyp__evidence">${h.evidence.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
        </li>`,
        )
        .join('');
}

function renderCard(d, { expanded = false, idx = 0 } = {}) {
    const icon =
        d.level === 'error'
            ? 'fa-times-circle'
            : d.level === 'warn'
              ? 'fa-exclamation-triangle'
              : 'fa-check-circle';
    const top = d.hypotheses[0];
    const tech = d.technical
        .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
        .join('');
    const bodyId = `dx-card-body-${idx}-${Math.abs(hashStr(d.id))}`;
    return `
    <article class="dx-card dx-card--${d.level}${expanded ? ' is-open' : ''}" data-level="${d.level}" data-layer="${d.layer}" data-search="${escapeHtml(`${d.title} ${d.message} ${d.cause}`.toLowerCase())}" data-key="${escapeHtml(d.id)}">
      <button type="button" class="dx-card__head" aria-expanded="${expanded}" aria-controls="${bodyId}">
        <span class="dx-card__icon" aria-hidden="true"><i class="fas ${icon}"></i></span>
        <span class="dx-card__main">
          <span class="dx-card__title">${escapeHtml(d.title)}</span>
          <span class="dx-card__msg">${escapeHtml(d.message.length > 200 ? `${d.message.slice(0, 200)}…` : d.message)}</span>
        </span>
        ${d.level !== 'info' && top ? `<span class="dx-card__badge" title="${escapeHtml(top.title)}">${d.obvious ? 'причина ясна' : `гипотез: ${d.hypotheses.length}`}</span>` : ''}
        <i class="fas fa-chevron-down dx-card__chev" aria-hidden="true"></i>
      </button>
      <div class="dx-card__body" id="${bodyId}" ${expanded ? '' : 'hidden'}>
        <p class="dx-card__cause"><strong>${d.obvious ? 'Причина:' : 'Предварительная оценка:'}</strong> ${escapeHtml(d.cause)}</p>
        <h4 class="dx-h4">${d.obvious ? 'Установленная причина' : 'Вероятные причины'}</h4>
        <ol class="dx-hyps">${renderHypotheses(d)}</ol>
        <h4 class="dx-h4">Как устранить</h4>
        <ol class="dx-steps">${d.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
        <details class="dx-tech"><summary>Технические детали</summary><table class="dx-tech__table"><tbody>${tech}</tbody></table></details>
        <div class="dx-card__actions">
          <button type="button" class="dx-btn dx-btn--small" data-dx-copy="${escapeHtml(d.id)}"><i class="far fa-copy" aria-hidden="true"></i>Копировать описание</button>
        </div>
      </div>
    </article>`;
}

function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
}

function renderOkList(ok) {
    const groups = groupByLayer(ok.map((o) => ({ ...o, layer: inferLayer(o) })));
    if (!groups.length) return '';
    return `<section class="dx-ok" data-dx-section="ok">
      <h3 class="dx-section-title"><i class="fas fa-check-circle" aria-hidden="true"></i>Пройденные проверки (${ok.length})</h3>
      ${groups
          .map(
              (g) => `<details class="dx-ok__group" data-layer="${g.layer.id}"><summary><i class="fas ${g.layer.icon}" aria-hidden="true"></i>${escapeHtml(g.layer.label)}<em>${g.items.length}</em></summary>
          <ul>${g.items
              .map(
                  (i) =>
                      `<li data-search="${escapeHtml(`${i.title} ${i.message}`.toLowerCase())}"><span class="dx-ok__t">${escapeHtml(i.title)}</span><span class="dx-ok__m">${escapeHtml(i.message)}</span></li>`,
              )
              .join('')}</ul></details>`,
          )
          .join('')}
    </section>`;
}

function renderHistoryStrip(cmp, prevAt) {
    if (!cmp) return '';
    const parts = [];
    if (cmp.added.length) parts.push(`<span class="dx-hist__pill dx-hist__pill--bad">новых проблем: ${cmp.added.length}</span>`);
    if (cmp.fixed.length) parts.push(`<span class="dx-hist__pill dx-hist__pill--good">исправлено: ${cmp.fixed.length}</span>`);
    if (cmp.same.length) parts.push(`<span class="dx-hist__pill">без изменений: ${cmp.same.length}</span>`);
    if (!parts.length) parts.push('<span class="dx-hist__pill dx-hist__pill--good">проблем не было и нет</span>');
    const list = (arr, cls) =>
        arr.length
            ? `<ul class="dx-hist__list ${cls}">${arr.map((x) => `<li>${escapeHtml(x.title)}</li>`).join('')}</ul>`
            : '';
    return `<details class="dx-hist"><summary><i class="fas fa-clock-rotate-left" aria-hidden="true"></i>Сравнение с прошлой проверкой (${escapeHtml(prevAt)}) ${parts.join(' ')}</summary>
      ${list(cmp.added, 'is-added')}${list(cmp.fixed, 'is-fixed')}</details>`;
}

let lastRender = null;

/**
 * Рендерит отчёт в #healthReportModalBody и показывает модалку.
 * @param {object} report — { errors, warnings, checks, startedAt, finishedAt, success, durationMs?, focus? }
 * @param {{ fresh?: boolean, focus?: object }} [opts]
 */
export function showDiagnosticsReport(report, opts = {}) {
    const modal = document.getElementById('healthReportModal');
    const body = modal?.querySelector('#healthReportModalBody');
    if (!modal || !body) return;
    bindModalChrome(modal);

    const env = collectDiagnosticEnvironment();
    const { errors, warnings, ok } = normalizeReportEntries(report || {});
    const probes = opts.probes || lastRender?.probes || {};
    const diagnoses = buildDiagnoses([...errors, ...warnings], env, probes);
    const status = errors.length ? 'error' : warnings.length ? 'warn' : 'ok';

    // История
    let cmp = null;
    let prevAt = '';
    if (opts.fresh) {
        const hist = readHistory();
        const prev = hist[hist.length - 1];
        const cur = diagnoses.map((d) => ({ key: issueKey(d), title: d.title, level: d.level }));
        if (prev) {
            cmp = compareIssueSets(prev.issues, cur);
            prevAt = new Date(prev.at).toLocaleString('ru-RU');
        }
        hist.push({ at: Date.now(), issues: cur, ok: ok.length, errors: errors.length, warnings: warnings.length });
        writeHistory(hist);
    } else if (lastRender?.cmp) {
        cmp = lastRender.cmp;
        prevAt = lastRender.prevAt;
    }

    lastRender = { report, diagnoses, env, probes, cmp, prevAt, status, ok, focus: opts.focus || null };

    const layerStatus = layerStatusMap(diagnoses);
    const title =
        status === 'error' ? 'Обнаружены ошибки' : status === 'warn' ? 'Есть предупреждения' : 'Всё в порядке';
    const sub =
        status === 'ok'
            ? 'Все проверки пройдены успешно.'
            : 'Раскройте карточку, чтобы увидеть причины и шаги устранения.';
    const meta = [
        report?.finishedAt ? `Завершено: ${report.finishedAt}` : '',
        report?.durationMs ? `за ${(report.durationMs / 1000).toFixed(1)} с` : '',
    ]
        .filter(Boolean)
        .join(' · ');

    const focusHtml = opts.focus ? renderFocus(opts.focus) : '';
    const noRun = Boolean(opts.focus) && !(report?.checks?.length);

    if (noRun) {
        body.innerHTML = `
    <div class="dx-root" data-status="focus">
      ${focusHtml}
      <div class="dx-empty dx-empty--cta"><i class="fas fa-stethoscope" aria-hidden="true"></i><p>Полная проверка приложения ещё не запускалась. Запустите её, чтобы увидеть общую картину по всем слоям.</p>
      <button type="button" class="dx-btn dx-btn--primary" data-dx-action="rerun"><i class="fas fa-rotate" aria-hidden="true"></i>Запустить полную проверку</button></div>
    </div>`;
        wireReport(body);
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        return;
    }

    body.innerHTML = `
    <div class="dx-root" data-status="${status}">
      <header class="dx-summary dx-summary--${status}">
        <div class="dx-summary__badge" aria-hidden="true"><i class="fas ${status === 'error' ? 'fa-heart-crack' : status === 'warn' ? 'fa-triangle-exclamation' : 'fa-heart-circle-check'}"></i></div>
        <div class="dx-summary__text"><h3>${title}</h3><p>${escapeHtml(sub)}</p><small>${escapeHtml(meta)}</small></div>
        <div class="dx-summary__actions">
          <button type="button" class="dx-btn dx-btn--primary" data-dx-action="rerun"><i class="fas fa-rotate" aria-hidden="true"></i>Проверить снова</button>
          <button type="button" class="dx-btn" data-dx-action="copy"><i class="far fa-copy" aria-hidden="true"></i>Копировать отчёт</button>
          <button type="button" class="dx-btn" data-dx-action="download"><i class="fas fa-download" aria-hidden="true"></i>.txt</button>
        </div>
      </header>
      ${focusHtml}
      <div class="dx-tiles" role="group" aria-label="Фильтр по результату">
        <button type="button" class="dx-tile dx-tile--error" data-dx-filter="error"><b>${errors.length}</b><span>Ошибки</span></button>
        <button type="button" class="dx-tile dx-tile--warn" data-dx-filter="warn"><b>${warnings.length}</b><span>Предупреждения</span></button>
        <button type="button" class="dx-tile dx-tile--ok" data-dx-filter="ok"><b>${ok.length}</b><span>Пройдено</span></button>
        <button type="button" class="dx-tile dx-tile--all is-active" data-dx-filter="all"><b>${errors.length + warnings.length + ok.length}</b><span>Все</span></button>
      </div>
      <div class="dx-layers" role="group" aria-label="Слои приложения">
        ${DIAGNOSTIC_LAYER_ORDER.map((id) => {
            const l = DIAGNOSTIC_LAYERS[id];
            return `<button type="button" class="dx-layer dx-layer--${layerStatus[id]}" data-dx-layer="${id}" title="${escapeHtml(l.hint)}"><i class="fas ${l.icon}" aria-hidden="true"></i><span>${escapeHtml(l.short)}</span><i class="dx-layer__dot" aria-hidden="true"></i></button>`;
        }).join('')}
      </div>
      ${renderHistoryStrip(cmp, prevAt)}
      <div class="dx-filterbar">
        <label class="dx-search"><i class="fas fa-search" aria-hidden="true"></i><input type="search" id="dx-search" placeholder="Поиск по проверкам…" aria-label="Поиск по результатам"></label>
        <button type="button" class="dx-btn dx-btn--ghost dx-btn--small" data-dx-action="toggle-all">Развернуть все</button>
      </div>
      <div class="dx-results" id="dx-results">
        ${
            diagnoses.length
                ? groupByLayer(diagnoses)
                      .map(
                          (g) => `<section class="dx-group" data-layer="${g.layer.id}">
            <h3 class="dx-group__title"><i class="fas ${g.layer.icon}" aria-hidden="true"></i>${escapeHtml(g.layer.label)}<em>${g.items.length}</em></h3>
            ${g.items.map((d, i) => renderCard(d, { expanded: status === 'error' && d.level === 'error' && g.items.length === 1 && diagnoses.length === 1, idx: i })).join('')}
          </section>`,
                      )
                      .join('')
                : `<div class="dx-empty"><i class="fas fa-circle-check" aria-hidden="true"></i><p>Ошибок и предупреждений нет.</p></div>`
        }
        ${renderOkList(ok)}
        <div class="dx-empty dx-empty--filter" hidden><i class="fas fa-filter" aria-hidden="true"></i><p>Нет результатов для выбранного фильтра.</p></div>
      </div>
    </div>`;

    wireReport(body);
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    body.querySelector('.dx-root')?.scrollTo?.(0, 0);
}

function renderFocus(focus) {
    return `<section class="dx-focus" id="dx-focus" aria-label="Контекст ошибки">
      <div class="dx-focus__head"><i class="fas fa-bullseye" aria-hidden="true"></i><div><strong>Диагностика конкретной ошибки</strong><small>Контекст получен из уведомления</small></div></div>
      <div id="dx-focus-body">${focus.html || ''}</div>
      <div class="dx-focus__actions">
        ${focus.recheck ? `<button type="button" class="dx-btn dx-btn--primary" data-dx-action="recheck"><i class="fas fa-plug-circle-check" aria-hidden="true"></i>Проверить связь сейчас</button>` : ''}
        <button type="button" class="dx-btn" data-dx-action="rerun"><i class="fas fa-stethoscope" aria-hidden="true"></i>Полная проверка систем</button>
      </div>
    </section>`;
}

function applyFilters(body) {
    const root = body.querySelector('.dx-root');
    if (!root) return;
    const f = root.dataset.filter || 'all';
    const layer = root.dataset.layer || '';
    const q = (body.querySelector('#dx-search')?.value || '').trim().toLowerCase();
    let visible = 0;
    root.querySelectorAll('.dx-card').forEach((card) => {
        const okLevel = f === 'all' || card.dataset.level === f;
        const okLayer = !layer || card.dataset.layer === layer;
        const okQ = !q || card.dataset.search.includes(q);
        const show = okLevel && okLayer && okQ;
        card.hidden = !show;
        if (show) visible += 1;
    });
    root.querySelectorAll('.dx-group').forEach((g) => {
        g.hidden = ![...g.querySelectorAll('.dx-card')].some((c) => !c.hidden);
    });
    const okSection = root.querySelector('[data-dx-section="ok"]');
    if (okSection) {
        let okVisible = 0;
        okSection.querySelectorAll('.dx-ok__group').forEach((grp) => {
            const lOk = !layer || grp.dataset.layer === layer;
            let n = 0;
            grp.querySelectorAll('li').forEach((li) => {
                const show = lOk && (f === 'all' || f === 'ok') && (!q || li.dataset.search.includes(q));
                li.hidden = !show;
                if (show) n += 1;
            });
            grp.hidden = n === 0;
            if (q && n) grp.open = true;
            okVisible += n;
        });
        okSection.hidden = okVisible === 0;
        visible += okVisible;
    }
    const empty = root.querySelector('.dx-empty--filter');
    if (empty) empty.hidden = visible > 0;
    root.querySelectorAll('[data-dx-filter]').forEach((b) => b.classList.toggle('is-active', b.dataset.dxFilter === f));
    root.querySelectorAll('[data-dx-layer]').forEach((b) => b.classList.toggle('is-active', b.dataset.dxLayer === layer));
}

function buildSupportText() {
    if (!lastRender) return '';
    const g = getGoogleDocsConnectionState();
    const extra = [
        `Google Docs: статус=${g.status}, последний успех=${g.lastSuccessAt ? new Date(g.lastSuccessAt).toISOString() : 'никогда'}, подряд неудач=${g.consecutiveFailures}`,
    ];
    try {
        const hist = readHistory();
        extra.push(`История проверок: ${hist.length} (последняя: ${hist.length ? new Date(hist[hist.length - 1].at).toLocaleString('ru-RU') : '—'})`);
    } catch {
        /* ignore */
    }
    return formatReportAsText(lastRender.report, lastRender.diagnoses, { env: lastRender.env, extra });
}

function wireReport(body) {
    const root = body.querySelector('.dx-root');
    if (!root) return;
    root.dataset.filter = 'all';
    root.addEventListener('click', async (e) => {
        const head = e.target.closest('.dx-card__head');
        if (head) {
            const card = head.closest('.dx-card');
            const open = !card.classList.contains('is-open');
            card.classList.toggle('is-open', open);
            head.setAttribute('aria-expanded', String(open));
            card.querySelector('.dx-card__body').hidden = !open;
            return;
        }
        const filterBtn = e.target.closest('[data-dx-filter]');
        if (filterBtn) {
            root.dataset.filter = filterBtn.dataset.dxFilter;
            applyFilters(body);
            return;
        }
        const layerBtn = e.target.closest('[data-dx-layer]');
        if (layerBtn) {
            root.dataset.layer = root.dataset.layer === layerBtn.dataset.dxLayer ? '' : layerBtn.dataset.dxLayer;
            applyFilters(body);
            return;
        }
        const copyOne = e.target.closest('[data-dx-copy]');
        if (copyOne) {
            const d = lastRender?.diagnoses.find((x) => x.id === copyOne.dataset.dxCopy);
            if (d) toast((await copyText(formatDiagnosisAsText(d))) ? 'Описание проблемы скопировано.' : 'Не удалось скопировать.', 'info');
            return;
        }
        const act = e.target.closest('[data-dx-action]');
        if (!act) return;
        const a = act.dataset.dxAction;
        if (a === 'copy') {
            toast((await copyText(buildSupportText())) ? 'Отчёт скопирован — вставьте его в обращение в поддержку.' : 'Не удалось скопировать отчёт.', 'info');
        } else if (a === 'download') {
            downloadText(buildSupportText(), `copilot-diagnostic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`);
        } else if (a === 'rerun') {
            runDiagnosticsFlow();
        } else if (a === 'recheck') {
            act.disabled = true;
            act.classList.add('is-busy');
            try {
                await recheckExternal();
            } finally {
                act.disabled = false;
                act.classList.remove('is-busy');
            }
        } else if (a === 'toggle-all') {
            const cards = [...root.querySelectorAll('.dx-card:not([hidden])')];
            const openAll = cards.some((c) => !c.classList.contains('is-open'));
            cards.forEach((c) => {
                c.classList.toggle('is-open', openAll);
                c.querySelector('.dx-card__head').setAttribute('aria-expanded', String(openAll));
                c.querySelector('.dx-card__body').hidden = !openAll;
            });
            act.textContent = openAll ? 'Свернуть все' : 'Развернуть все';
        }
    });
    const search = root.querySelector('#dx-search');
    search?.addEventListener('input', () => applyFilters(body));
}

let chromeBound = false;
function bindModalChrome(modal) {
    if (chromeBound) return;
    chromeBound = true;
    const close = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    };
    document.getElementById('healthReportModalClose')?.addEventListener('click', close);
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Escape' || activeOverlay) return;
            if (modal.classList.contains('hidden') || modal.style.display === 'none') return;
            // выше стоящие модалки (z>85) сами обработают Esc
            close();
        },
        false,
    );
}

// ============================================================================
// ЗАПУСК И РЕЖИМ «КОНТЕКСТ ОШИБКИ»
// ============================================================================

let flowInFlight = null;

/** Полный прогон с оверлеем и показом отчёта. */
export function runDiagnosticsFlow() {
    if (flowInFlight) return flowInFlight;
    const run = window.runManualFullDiagnostic;
    if (typeof run !== 'function') {
        toast('Диагностика недоступна: модуль ещё не загружен.', 'warning');
        return Promise.resolve(null);
    }
    flowInFlight = (async () => {
        try {
            // runManualFullDiagnostic сам показывает оверлей хода проверки; отчёт показываем здесь
            const report = await run();
            if (report) window.showHealthReportModal(report);
            return report;
        } catch (err) {
            console.warn('[diagnostics-ui] прогон завершился ошибкой:', err);
            showDiagnosticsReport({
                errors: [{ title: 'Ручной прогон', message: err?.message || String(err), system: 'runtime' }],
                warnings: [],
                checks: [],
                finishedAt: new Date().toLocaleString('ru-RU'),
            }, { fresh: true });
            return null;
        } finally {
            flowInFlight = null;
        }
    })();
    return flowInFlight;
}

async function recheckExternal() {
    const bodyEl = document.getElementById('dx-focus-body');
    if (bodyEl) bodyEl.insertAdjacentHTML('afterbegin', '<p class="dx-focus__busy" id="dx-focus-busy"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Проверяю связь…</p>');
    let res = null;
    try {
        res = await checkGoogleDocsConnection();
    } catch (err) {
        res = { ok: false, error: err, probes: null };
    }
    document.getElementById('dx-focus-busy')?.remove();
    if (res.ok) {
        toast('Связь с Google Docs работает, данные обновлены.', 'success');
        if (lastRender?.focus) {
            lastRender.focus.html = `<div class="dx-okbox"><i class="fas fa-circle-check" aria-hidden="true"></i><div><strong>Связь восстановлена</strong><p>Запрос к Google Docs выполнен успешно, раздел «Шаблоны» обновлён.</p></div></div>`;
        }
        const el = document.getElementById('dx-focus-body');
        if (el) el.innerHTML = lastRender.focus.html;
        return;
    }
    await openDiagnosticsForIssue({
        title: 'Google Docs / Шаблоны',
        message: res.error?.message || 'Связь с Google Docs недоступна',
        layer: 'external',
        system: 'external',
        errorInfo: res.errorInfo,
        source: 'recheck',
        probes: res.probes,
        skipAutoProbe: true,
    });
}

/**
 * Открывает режим самодиагностики с контекстом конкретной ошибки (кнопка «Диагностика» в карточке).
 * @param {object} ctx — { title, message, layer?, system?, errorInfo?, details?, source?, probes? }
 */
export async function openDiagnosticsForIssue(ctx = {}) {
    const env = collectDiagnosticEnvironment();
    const issue = {
        level: 'error',
        title: ctx.title || String(ctx.message || 'Ошибка').split('\n')[0].slice(0, 90),
        message: ctx.message || '',
        system: ctx.system || '',
        layer: ctx.layer,
        source: ctx.source || 'toast',
        errorInfo: ctx.errorInfo,
        details: ctx.details || null,
        ts: ctx.ts,
    };
    const layerId = inferLayer(issue);
    let probes = ctx.probes || {};
    const diag = diagnoseIssue({ ...issue, layer: layerId }, { env, probes });
    diag.level = 'error';
    const isExternal = layerId === 'external';

    const focus = {
        html: renderCard(diag, { expanded: true, idx: 900 }) + (isExternal && !ctx.skipAutoProbe ? '<p class="dx-focus__busy" id="dx-focus-busy"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Выполняю зонды связности…</p>' : ''),
        recheck: isExternal,
    };
    const prev = lastRender?.report || { errors: [], warnings: [], checks: [] };
    showDiagnosticsReport(prev, { focus, probes });
    wireFocusCard(diag);
    document.getElementById('dx-focus')?.scrollIntoView?.({ block: 'start' });

    if (isExternal && !ctx.skipAutoProbe) {
        try {
            probes = await runGoogleDocsConnectivityProbes();
        } catch {
            probes = {};
        }
        const d2 = diagnoseIssue({ ...issue, layer: layerId }, { env, probes });
        d2.level = 'error';
        if (lastRender) {
            lastRender.probes = probes;
            lastRender.focus.html = renderCard(d2, { expanded: true, idx: 900 });
        }
        const el = document.getElementById('dx-focus-body');
        if (el) {
            el.innerHTML = lastRender.focus.html;
            wireFocusCard(d2);
        }
    }
    return diag;
}

function wireFocusCard(diag) {
    const focus = document.getElementById('dx-focus');
    if (!focus) return;
    const card = focus.querySelector('.dx-card');
    if (card) card.querySelector('.dx-card__body').hidden = false;
    focus.querySelectorAll('[data-dx-copy]').forEach((b) => {
        b.onclick = async (e) => {
            e.stopPropagation();
            toast((await copyText(formatDiagnosisAsText(diag))) ? 'Описание проблемы скопировано.' : 'Не удалось скопировать.', 'info');
        };
    });
}

/** Для вызова из других модулей: сохраняет историю/снимок и возвращает последние диагнозы. */
export function getLastDiagnosticsSnapshot() {
    return lastRender
        ? { status: lastRender.status, diagnoses: lastRender.diagnoses, at: lastRender.report?.finishedAt }
        : null;
}

if (typeof window !== 'undefined') {
    window.CopilotDiagnostics = {
        openForIssue: openDiagnosticsForIssue,
        showReport: showDiagnosticsReport,
        startOverlay: startDiagnosticsOverlay,
        run: runDiagnosticsFlow,
        getLast: getLastDiagnosticsSnapshot,
    };
    window.openDiagnosticsForIssue = openDiagnosticsForIssue;
    // Мой рендерер имеет приоритет над прежним (ui-settings-modal-init присваивает свой fallback при инициализации)
    try {
        Object.defineProperty(window, 'showHealthReportModal', {
            configurable: true,
            get: () => (report, opts) => {
                const fresh = Boolean(report && report.__fresh && !report.__recorded);
                if (report && typeof report === 'object') report.__recorded = true;
                return showDiagnosticsReport(report, { fresh, ...(opts || {}) });
            },
            set: () => {
                /* игнорируем перезапись прежним рендерером */
            },
        });
    } catch {
        window.showHealthReportModal = (report, opts) => showDiagnosticsReport(report, opts);
    }
}
