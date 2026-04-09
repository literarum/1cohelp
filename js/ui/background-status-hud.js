'use strict';

import { getRuntimeHubIssuesForHealth } from '../features/runtime-issue-hub.js';

/** Заголовок основной карточки HUD (единый источник для UI и тестов). */
export const BG_HUD_MAIN_HEADINGS = Object.freeze({
    initializing: 'Фоновая инициализация...',
    initComplete: 'Инициализация завершена',
    problems: 'Обнаружены проблемы',
});

export function initBackgroundStatusHUD() {
    const STATE = {
        tasks: new Map(),
        container: null,
        cardEl: null,
        completionCardEl: null,
        barEl: null,
        titleEl: null,
        percentEl: null,
        detailsBtnEl: null,
        diagnostics: {
            errors: [],
            warnings: [],
            checks: [],
            updatedAt: null,
        },
        watchdog: {
            statusText: 'Ожидание первого цикла watchdog...',
            lastRunAt: null,
            lastAutosaveAt: null,
            running: false,
            severity: 'running',
        },
        hasShownCompletion: false,
        rafId: null,
        lastVisualPercent: 0,
        animatingToComplete: false,
        autoHideTimeoutId: null,
        dismissing: false,
        userDismissed: false,
        pendingDismissAfterActivity: null,
        activityListenersRemoved: false,
        _onActivity: null,
        watchdogInfoEl: null,
        watchdogRunNowHandler: null,
        headingMainEl: null,
        /** true если app-init завершился с ошибками подсистем/UI (второй контур к диагностике чеклиста). */
        initHadSubsystemFailures: false,
    };

    const DISMISS_AFTER_ACTIVITY_DELAY_MS = 2000;

    function ensureStyles() {
        if (document.getElementById('bg-status-hud-styles')) return;
        const css = `
    #bg-status-hud {
      position: fixed; right: 16px; top: 16px; z-index: 9998;
      width: min(440px, calc(100vw - 32px));
      max-width: calc(100vw - 32px);
      font-family: inherit;
      color: var(--color-text-primary, #111);
    }
    #bg-status-hud .hud-card{
      background: var(--color-surface-2, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px 14px; backdrop-filter: saturate(1.1) blur(2px);
      position: relative;
      transition: transform 0.3s ease-out;
    }
    #bg-status-hud .hud-title { display:flex; align-items:center; gap:8px; flex-wrap: nowrap;
      font-weight:600; font-size:14px; margin-bottom:8px; padding-right: 36px; }
    #bg-status-hud .hud-title #bg-hud-main-heading {
      flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #bg-status-hud .hud-title .dot { width:8px; height:8px; border-radius:9999px;
      background: var(--color-primary, #2563eb); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-primary, #2563eb) 30%, transparent); }
    #bg-status-hud .hud-sub { font-size:12px; opacity:.8; margin-bottom:8px; }
    #bg-status-hud .hud-progress { width:100%; height:10px; border-radius:9999px;
      background: color-mix(in srgb, var(--color-surface-2, #fff) 60%, var(--color-text-primary, #111) 10%);
      overflow:hidden; border:1px solid var(--color-border, rgba(0,0,0,.12));
    }
    #bg-status-hud .hud-bar {
      height:100%; width:0%;
      background: linear-gradient(90deg,
        color-mix(in srgb, var(--color-primary, #2563eb) 95%, #fff 5%),
        color-mix(in srgb, var(--color-primary, #2563eb) 80%, #fff 20%)
      );
      transition: width .28s ease, background .3s ease, animation .3s ease;
      background-size: 24px 24px;
      animation: hud-stripes 2.2s linear infinite;
    }
    #bg-status-hud .hud-bar.completed {
      animation: none !important;
      background: var(--color-primary, #2563eb) !important;
      background-size: auto !important;
    }
    #bg-status-hud .hud-footer { display:flex; justify-content:flex-start; align-items:center; margin-top:8px; font-size:12px; opacity:.9; gap:8px; }
    #bg-status-hud .hud-watchdog {
      margin-top: 8px;
      font-size: 12px;
      opacity: .92;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #bg-status-hud .hud-watchdog-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    #bg-status-hud .hud-watchdog-info {
      color: var(--color-text-primary, #111);
      opacity: .9;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      max-width: 100%;
    }
    #bg-status-hud .hud-watchdog-line--status {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 6px;
      min-width: 0;
      width: 100%;
      white-space: nowrap;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    #bg-status-hud .hud-watchdog-line--meta {
      font-size: 11px;
      opacity: .92;
      white-space: nowrap;
      overflow-x: auto;
      max-width: 100%;
      scrollbar-width: thin;
    }
    #bg-status-hud .hud-watchdog-msg {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #bg-status-hud .hud-watchdog-heading {
      flex-shrink: 0;
    }
    #bg-status-hud .hud-watchdog-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
      font-weight: 600;
      flex-shrink: 0;
    }
    #bg-status-hud .hud-watchdog-dot {
      width: 8px;
      height: 8px;
      border-radius: 9999px;
      display: inline-block;
      box-shadow: 0 0 0 3px rgba(0,0,0,0.08);
    }
    #bg-status-hud .hud-watchdog-dot.is-ok { background: var(--color-success, #16a34a); }
    #bg-status-hud .hud-watchdog-dot.is-warn { background: #f59e0b; }
    #bg-status-hud .hud-watchdog-dot.is-error { background: #dc2626; }
    #bg-status-hud .hud-watchdog-dot.is-running { background: var(--color-primary, #2563eb); }
    #bg-status-hud .hud-watchdog-run {
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      background: color-mix(in srgb, var(--color-surface-2, #fff) 85%, var(--color-text-primary, #111) 5%);
      color: var(--color-text-primary, #111);
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      opacity: .9;
    }
    #bg-status-hud .hud-watchdog-run:hover { opacity: 1; }
    #bg-status-hud .hud-watchdog-run:disabled { opacity: .55; cursor: not-allowed; }
    #bg-status-hud .hud-details {
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      background: color-mix(in srgb, var(--color-surface-2, #fff) 85%, var(--color-text-primary, #111) 5%);
      color: var(--color-text-primary, #111);
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      opacity: 0.9;
    }
    #bg-status-hud .hud-details:hover { opacity: 1; }
    #bg-status-hud .hud-details.hidden { display: none; }
    #bg-status-hud .hud-close {
      position: absolute; top: 8px; right: 8px;
      width: 28px; height: 28px; border-radius: 8px;
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      background: color-mix(in srgb, var(--color-surface-2, #fff) 85%, var(--color-text-primary, #111) 5%);
      color: var(--color-text-primary, #111);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; opacity: .75;
    }
    #bg-status-hud .hud-close:hover { opacity: 1; }
    #bg-status-hud .hud-close:focus { outline: 2px solid color-mix(in srgb, var(--color-primary, #2563eb) 60%, transparent); outline-offset: 2px; }
    #bg-status-hud #bg-hud-percent { display: none !important; }
    #bg-status-hud { display: flex; flex-direction: column; gap: 10px; }
    #bg-status-hud .hud-completion-card {
      background: var(--color-surface-2, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px 14px; backdrop-filter: saturate(1.1) blur(2px);
      position: relative;
      transition: transform 0.3s ease-out;
      display: flex; align-items: center; gap: 10px;
      color: var(--color-text-primary, #111);
    }
    #bg-status-hud .hud-completion-card .hud-completion-icon { color: var(--color-success, #16a34a); font-size: 18px; }
    #bg-status-hud .hud-completion-card .hud-completion-text { font-size: 14px; font-weight: 600; }
    @keyframes hud-stripes{ 0%{ background-position: 0 0; } 100%{ background-position: 24px 0; } }
    #bg-hud-details-modal {
      position: fixed; z-index: 9999; display: none;
      top: 0; left: 0; right: 0; bottom: 0;
      width: 100vw; height: 100vh;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.5);
      box-sizing: border-box;
    }
    #bg-hud-details-modal .hud-modal-card {
      width: min(56rem, 92vw) !important;
      max-width: 92vw !important;
      max-height: 90vh !important;
      min-width: 18rem !important;
      display: flex !important; flex-direction: column !important;
      box-sizing: border-box;
      flex-shrink: 0;
    }
  `;
        const style = document.createElement('style');
        style.id = 'bg-status-hud-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function ensureContainer() {
        if (STATE.container) return;
        ensureStyles();
        const root = document.createElement('div');
        root.id = 'bg-status-hud';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.style.display = 'none';
        root.innerHTML = `
    <div class="hud-card">
      <button type="button" id="bg-hud-close" class="hud-close" aria-label="Скрыть">✕</button>
      <div class="hud-title"><span class="dot" aria-hidden="true"></span><span id="bg-hud-main-heading">${BG_HUD_MAIN_HEADINGS.initializing}</span></div>
      <div class="hud-sub" id="bg-hud-title">Подготовка…</div>
      <div class="hud-progress"><div class="hud-bar" id="bg-hud-bar"></div></div>
      <div class="hud-watchdog">
        <div id="bg-hud-watchdog-info" class="hud-watchdog-info">Watchdog: ожидание данных...</div>
      </div>
      <div class="hud-footer"></div>
    </div>`;
        document.body.appendChild(root);
        STATE.container = root;
        STATE.cardEl = root.querySelector('.hud-card');
        STATE.barEl = root.querySelector('#bg-hud-bar');
        STATE.titleEl = root.querySelector('#bg-hud-title');
        STATE.percentEl = root.querySelector('#bg-hud-percent');
        STATE.watchdogInfoEl = root.querySelector('#bg-hud-watchdog-info');
        STATE.headingMainEl = root.querySelector('#bg-hud-main-heading');
        root.querySelector('#bg-hud-close').addEventListener('click', () => dismissAnimated());
        renderWatchdogInfo();
        updateDetailsButton();
    }

    function syncHudMainHeading() {
        if (!STATE.headingMainEl) return;
        if (STATE.tasks.size > 0) {
            STATE.headingMainEl.textContent = BG_HUD_MAIN_HEADINGS.initializing;
            return;
        }
        STATE.headingMainEl.textContent = shouldBlockHudSuccessAndAutoDismiss()
            ? BG_HUD_MAIN_HEADINGS.problems
            : BG_HUD_MAIN_HEADINGS.initComplete;
    }

    function watchdogStatusLabel(severity) {
        switch (severity) {
            case 'ok':
                return 'OK';
            case 'warn':
                return 'WARN';
            case 'error':
                return 'ERROR';
            default:
                return 'RUN';
        }
    }

    /**
     * Второй контур HUD: строка самотестирования не должна показывать OK / «в норме», если
     * shouldBlockHudSuccessAndAutoDismiss() уже истинно (ошибки диагностики, init, watchdog).
     */
    function getResolvedWatchdogLineDisplay() {
        let displayStatus = STATE.watchdog.statusText || '—';
        let displaySeverity = STATE.watchdog.severity || 'running';
        if (shouldBlockHudSuccessAndAutoDismiss() && displaySeverity !== 'error') {
            displaySeverity = 'error';
            const errN = effectiveDiagnosticErrors().length;
            if (errN > 0) {
                displayStatus = 'Обнаружены ошибки самотестирования';
            } else if (STATE.initHadSubsystemFailures) {
                displayStatus = 'Инициализация завершена с ошибками';
            } else if (
                displayStatus === 'Система в норме' ||
                displayStatus === 'Есть предупреждения'
            ) {
                displayStatus = 'Проблемы обнаружены';
            }
        }
        return { displayStatus, displaySeverity };
    }

    function renderWatchdogInfo() {
        if (!STATE.watchdogInfoEl) return;
        const { displayStatus, displaySeverity } = getResolvedWatchdogLineDisplay();
        const lastRunStr = STATE.watchdog.lastRunAt
            ? new Date(STATE.watchdog.lastRunAt).toLocaleString('ru-RU')
            : '—';
        const lastAutosave = STATE.watchdog.lastAutosaveAt
            ? new Date(STATE.watchdog.lastAutosaveAt).toLocaleString('ru-RU')
            : '—';
        const dotClass =
            displaySeverity === 'error'
                ? 'is-error'
                : displaySeverity === 'warn'
                  ? 'is-warn'
                  : displaySeverity === 'ok'
                    ? 'is-ok'
                    : 'is-running';
        const statusEscaped = escapeHtml(displayStatus);
        STATE.watchdogInfoEl.innerHTML = `<div class="hud-watchdog-line hud-watchdog-line--status" role="status"><span class="hud-watchdog-heading" id="bg-hud-watchdog-heading">Самотестирование</span><span aria-hidden="true">·</span><span class="hud-watchdog-status"><span class="hud-watchdog-dot ${dotClass}" aria-hidden="true"></span>${watchdogStatusLabel(
            displaySeverity,
        )}</span><span class="hud-watchdog-msg">${statusEscaped}</span></div><div class="hud-watchdog-line hud-watchdog-line--meta">Автосохранение: ${lastAutosave} · Проверка: ${lastRunStr}</div>`;
    }

    function computeTopOffset() {
        let top = 16;
        const imp = document.getElementById('important-notifications-container');
        if (imp && imp.children.length > 0) {
            const s = parseInt(getComputedStyle(imp).top || '0', 10);
            top = Math.max(top, s + imp.offsetHeight + 8);
        }
        const toast = document.getElementById('notification-container');
        if (toast && toast.children.length > 0) {
            top = Math.max(top, 90);
        }
        STATE.container.style.top = `${top}px`;
    }

    function aggregatePercent() {
        if (STATE.animatingToComplete) return 100;
        let totalWeight = 0;
        let acc = 0;
        for (const t of STATE.tasks.values()) {
            if (!t.total || t.total <= 0) continue;
            const w = t.weight ?? 1;
            totalWeight += w;
            acc += w * Math.min(1, t.processed / t.total);
        }
        if (totalWeight === 0) return 0;
        return (acc / totalWeight) * 100;
    }

    // При успешном самотестировании HUD после «Готово» скрывается после активности пользователя.
    // При ошибках самотестирования (или watchdog ERROR) автоскрытия нет — только кнопка ✕.

    function tick() {
        const target = aggregatePercent();
        const next =
            STATE.lastVisualPercent +
            Math.min(2.5, Math.max(0.4, (target - STATE.lastVisualPercent) * 0.2));
        STATE.lastVisualPercent = Math.min(100, Math.max(0, next));
        if (STATE.barEl) {
            STATE.barEl.style.width = `${STATE.lastVisualPercent.toFixed(1)}%`;
            if (STATE.animatingToComplete && STATE.lastVisualPercent >= 99.9) {
                STATE.lastVisualPercent = 100;
                STATE.barEl.style.width = '100%';
                STATE.barEl.classList.add('completed');
                STATE.animatingToComplete = false;
                STATE.rafId = null;
                setTimeout(() => {
                    if (!shouldBlockHudSuccessAndAutoDismiss()) {
                        showCompletionCard();
                        scheduleDismissAfterActivity();
                    }
                }, 200);
                return;
            }
            if (STATE.tasks.size === 0 && !STATE.animatingToComplete) {
                STATE.animatingToComplete = true;
            }
            if (!STATE.animatingToComplete) {
                STATE.barEl.classList.remove('completed');
            }
        }
        if (STATE.percentEl)
            STATE.percentEl.textContent = `${Math.round(STATE.lastVisualPercent)}%`;
        const shouldContinue =
            STATE.tasks.size > 0 || (STATE.animatingToComplete && STATE.lastVisualPercent < 99.9);
        if (shouldContinue) STATE.rafId = requestAnimationFrame(tick);
    }

    function show() {
        ensureContainer();
        if (STATE.userDismissed) return;
        computeTopOffset();
        STATE.container.style.display = '';
        if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
    }

    function removeActivityListeners() {
        if (STATE.activityListenersRemoved || !STATE._onActivity) return;
        STATE.activityListenersRemoved = true;
        if (STATE.pendingDismissAfterActivity) {
            clearTimeout(STATE.pendingDismissAfterActivity);
            STATE.pendingDismissAfterActivity = null;
        }
        document.removeEventListener('mousemove', STATE._onActivity);
        document.removeEventListener('keydown', STATE._onActivity);
        document.removeEventListener('touchstart', STATE._onActivity);
        document.removeEventListener('scroll', STATE._onActivity, true);
        STATE._onActivity = null;
    }

    function hide() {
        removeActivityListeners();
        if (!STATE.container) return;
        STATE.container.style.display = 'none';
        if (STATE.cardEl) {
            STATE.cardEl.style.transform = '';
            STATE.cardEl.style.transition = '';
        }
        if (STATE.completionCardEl && STATE.completionCardEl.parentNode) {
            STATE.completionCardEl.remove();
            STATE.completionCardEl = null;
        }
        if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
        STATE.rafId = null;
        STATE.lastVisualPercent = 0;
        STATE.animatingToComplete = false;
        STATE.dismissing = false;
        if (STATE.autoHideTimeoutId) {
            clearTimeout(STATE.autoHideTimeoutId);
            STATE.autoHideTimeoutId = null;
        }
    }

    function dismissAnimated(onDone) {
        if (!STATE.container || STATE.dismissing) {
            if (onDone) onDone();
            return;
        }
        STATE.userDismissed = true;
        STATE.dismissing = true;
        const card = STATE.cardEl || STATE.container.querySelector('.hud-card');
        const cardsToAnimate = [card, STATE.completionCardEl].filter(Boolean);
        if (cardsToAnimate.length === 0) {
            hide();
            if (onDone) onDone();
            return;
        }
        const duration = 300;
        cardsToAnimate.forEach((el) => {
            el.style.transition = `transform ${duration}ms ease-out`;
            el.style.transform = 'translateX(calc(100% + 32px))';
        });
        let ended = 0;
        const onEnd = () => {
            ended += 1;
            if (ended < cardsToAnimate.length) return;
            cardsToAnimate.forEach((el) => el.removeEventListener('transitionend', onEnd));
            clearTimeout(fallback);
            hide();
            if (onDone) onDone();
        };
        cardsToAnimate.forEach((el) => el.addEventListener('transitionend', onEnd));
        const fallback = setTimeout(onEnd, duration + 50);
    }

    function updateTitle() {
        const active = [...STATE.tasks.values()];
        if (!STATE.titleEl) return;
        if (active.length === 0) {
            STATE.titleEl.textContent = shouldBlockHudSuccessAndAutoDismiss()
                ? 'Обнаружены ошибки самотестирования'
                : 'Готово';
            STATE.animatingToComplete = true;
            if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
            syncHudMainHeading();
            return;
        }
        const main = active[0];
        const others = Math.max(0, active.length - 1);
        const prefix = main.id === 'app-init' ? 'Выполняется' : 'Индексируется';
        STATE.titleEl.textContent =
            others > 0 ? `${prefix}: ${main.label} + ещё ${others}` : `${prefix}: ${main.label}`;
        syncHudMainHeading();
    }

    function showCompletionCard() {
        if (!STATE.container || STATE.hasShownCompletion || STATE.completionCardEl) return;
        if (shouldBlockHudSuccessAndAutoDismiss()) return;
        STATE.hasShownCompletion = true;
        const card = document.createElement('div');
        card.className = 'hud-completion-card';
        card.setAttribute('role', 'status');
        card.innerHTML = `
            <span class="hud-completion-icon" aria-hidden="true"><i class="fas fa-check-circle"></i></span>
            <span class="hud-completion-text">Приложение полностью загружено</span>`;
        STATE.container.appendChild(card);
        STATE.completionCardEl = card;
        syncHudMainHeading();
    }

    function effectiveDiagnosticErrors() {
        const base = STATE.diagnostics.errors || [];
        const rt = getRuntimeHubIssuesForHealth(40);
        if (!rt.length) return base;
        return [...rt, ...base];
    }

    /** Ошибки самотестирования (включая буфер рантайма) или критический watchdog — без «всё ок» и без автоскрытия. */
    function shouldBlockHudSuccessAndAutoDismiss() {
        if (STATE.initHadSubsystemFailures) return true;
        if (effectiveDiagnosticErrors().length > 0) return true;
        if (STATE.watchdog.severity === 'error') return true;
        return false;
    }

    /** Снять отложенное скрытие по активности и убрать карточку «полностью загружено», если есть ошибки. */
    function suppressCompletionUiWhenErrors() {
        if (!shouldBlockHudSuccessAndAutoDismiss()) return;
        removeActivityListeners();
        if (STATE.completionCardEl?.parentNode) {
            STATE.completionCardEl.remove();
            STATE.completionCardEl = null;
        }
    }

    function updateDetailsButton() {
        const hasIssues =
            STATE.initHadSubsystemFailures ||
            effectiveDiagnosticErrors().length > 0 ||
            (STATE.diagnostics.warnings?.length || 0) > 0;
        const hasChecks = (STATE.diagnostics.checks?.length || 0) > 0;
        const showDetails = hasIssues || hasChecks;
        const footer = STATE.container?.querySelector('.hud-footer');
        if (!footer) return;
        if (showDetails) {
            if (!STATE.detailsBtnEl) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'bg-hud-details-btn';
                btn.className = 'hud-details';
                btn.addEventListener('click', () => openDiagnosticsModal());
                footer.appendChild(btn);
                STATE.detailsBtnEl = btn;
            }
            STATE.detailsBtnEl.textContent = 'Сводка по системам';
        } else {
            if (STATE.detailsBtnEl?.parentNode) {
                STATE.detailsBtnEl.remove();
                STATE.detailsBtnEl = null;
            }
        }
    }

    function ensureDiagnosticsModal() {
        if (document.getElementById('bg-hud-details-modal')) return;
        ensureStyles();
        const modal = document.createElement('div');
        modal.id = 'bg-hud-details-modal';
        modal.innerHTML = `
            <div class="hud-modal-card">
                <div class="hud-modal-header">
                    <div>
                        <strong>Диагностика фоновых тестов</strong>
                        <div class="text-xs opacity-70" id="bg-hud-details-updated"></div>
                    </div>
                    <button type="button" id="bg-hud-details-close" class="hud-close">✕</button>
                </div>
                <div class="hud-modal-body" id="bg-hud-details-body"></div>
            </div>
        `;
        const card = modal.querySelector('.hud-modal-card');
        const vw = Math.min(896, (window.innerWidth || 0) * 0.92);
        card.style.width = `${vw}px`;
        card.style.maxWidth = '92vw';
        card.style.maxHeight = '90vh';
        card.style.minWidth = '288px';
        document.body.appendChild(modal);
        modal.querySelector('#bg-hud-details-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        if (!modal.dataset.escapeCloseAttached) {
            modal.dataset.escapeCloseAttached = '1';
            document.addEventListener(
                'keydown',
                (e) => {
                    if (e.key !== 'Escape') return;
                    const m = document.getElementById('bg-hud-details-modal');
                    if (!m || m.style.display !== 'flex') return;
                    m.style.display = 'none';
                    e.preventDefault();
                },
                true,
            );
        }
    }

    function escapeHtml(str) {
        if (str == null || typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function openDiagnosticsModal() {
        const { warnings, checks, updatedAt } = STATE.diagnostics;
        const errors = effectiveDiagnosticErrors();
        let errorsForReport = errors || [];
        if (STATE.initHadSubsystemFailures) {
            const hasInitEntry = errorsForReport.some(
                (e) =>
                    e?.system === 'app-init' ||
                    String(e?.title || '').includes('Инициализация приложения'),
            );
            if (!hasInitEntry) {
                errorsForReport = [
                    ...errorsForReport,
                    {
                        title: 'Инициализация приложения',
                        message:
                            'Одна или несколько подсистем завершили инициализацию с ошибкой. Подробности — в консоли браузера.',
                        system: 'app-init',
                    },
                ];
            }
        }

        // Если доступна полноразмерная модалка «Состояние здоровья», используем её,
        // чтобы поведение и размеры были идентичны ручному прогону из настроек.
        if (typeof window !== 'undefined' && typeof window.showHealthReportModal === 'function') {
            const report = {
                success: errorsForReport.length === 0,
                errors: errorsForReport,
                warnings: warnings || [],
                checks: checks || [],
                startedAt: updatedAt || null,
                finishedAt: updatedAt || null,
            };
            window.showHealthReportModal(report);
            return;
        }

        // Fallback: собственная компактная модалка HUD
        ensureDiagnosticsModal();
        const modal = document.getElementById('bg-hud-details-modal');
        const card = modal.querySelector('.hud-modal-card');
        if (card) {
            const w = Math.min(896, (window.innerWidth || 0) * 0.92);
            card.style.width = `${w}px`;
            card.style.maxWidth = '92vw';
            card.style.maxHeight = '90vh';
            card.style.minWidth = '288px';
        }
        const body = modal.querySelector('#bg-hud-details-body');
        const updated = modal.querySelector('#bg-hud-details-updated');
        const esc = escapeHtml;
        updated.textContent = updatedAt ? `Обновлено: ${updatedAt}` : '';

        const buildSectionList = (items, itemIcon) => {
            if (!items?.length) return '';
            return items
                .map(
                    (i) =>
                        `<li class="health-report-item">
                            <span class="health-report-item-icon">${itemIcon}</span>
                            <div>
                                <div class="health-report-item-title">${esc(i.title)}</div>
                                <div class="health-report-item-message">${esc(i.message)}</div>
                            </div>
                        </li>`,
                )
                .join('');
        };

        const errorsList = buildSectionList(
            errorsForReport,
            '<i class="fas fa-times-circle text-red-500 dark:text-red-400" aria-hidden="true"></i>',
        );
        const warningsList = buildSectionList(
            warnings,
            '<i class="fas fa-exclamation-triangle text-amber-500 dark:text-amber-400" aria-hidden="true"></i>',
        );
        const checksList = buildSectionList(
            checks,
            '<i class="fas fa-check text-primary" aria-hidden="true"></i>',
        );

        const { displayStatus: fallbackWdStatus, displaySeverity: fallbackWdSeverity } =
            getResolvedWatchdogLineDisplay();
        const watchdogLabel = watchdogStatusLabel(fallbackWdSeverity);
        const lastAutosave = STATE.watchdog.lastAutosaveAt
            ? new Date(STATE.watchdog.lastAutosaveAt).toLocaleString('ru-RU')
            : '—';
        const summaryOkClass =
            errorsForReport.length === 0 ? 'health-report-summary-ok' : 'health-report-summary-fail';

        body.innerHTML = `
            <div class="health-report-body-scroll">
                <div class="health-report-summary ${summaryOkClass}">
                    <div class="health-report-summary-icon"><i class="fas fa-stethoscope" aria-hidden="true"></i></div>
                    <div class="health-report-summary-text">
                        <h3>Диагностика фоновых тестов</h3>
                        <div class="health-report-summary-meta">${esc(updatedAt || '')}</div>
                    </div>
                </div>
                <div class="health-report-section">
                    <div class="health-report-section-header">
                        <span class="health-report-section-icon"><i class="fas fa-heartbeat" aria-hidden="true"></i></span>
                        <span>Watchdog</span>
                    </div>
                    <ul class="health-report-section-list">
                        <li class="health-report-item">
                            <span class="health-report-item-icon"></span>
                            <div>
                                <div class="health-report-item-title">Уровень: ${esc(watchdogLabel)}</div>
                                <div class="health-report-item-message">Статус: ${esc(fallbackWdStatus)}</div>
                                <div class="health-report-item-message">Последнее автосохранение: ${esc(lastAutosave)}</div>
                            </div>
                        </li>
                    </ul>
                </div>
                <div class="health-report-section health-report-section-errors">
                    <div class="health-report-section-header health-report-section-errors">
                        <span class="health-report-section-icon"><i class="fas fa-exclamation-circle" aria-hidden="true"></i></span>
                        <span>Ошибки (${errorsForReport?.length ?? 0})</span>
                    </div>
                    ${errorsForReport?.length ? `<ul class="health-report-section-list">${errorsList}</ul>` : '<div class="health-report-empty">Ошибок не обнаружено.</div>'}
                </div>
                <div class="health-report-section health-report-section-warnings health-report-section-collapsible is-collapsed">
                    <div class="health-report-section-header health-report-section-warnings">
                        <span class="health-report-section-icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></span>
                        <span>Предупреждения (${warnings?.length ?? 0})</span>
                        <button type="button" class="health-report-section-toggle" aria-expanded="false" aria-label="Развернуть раздел" title="Развернуть">&#9654;</button>
                    </div>
                    <div class="health-report-section-body">
                        <div class="health-report-section-body-inner">
                            ${warnings?.length ? `<ul class="health-report-section-list">${warningsList}</ul>` : '<div class="health-report-empty">Предупреждений нет.</div>'}
                        </div>
                    </div>
                </div>
                <div class="health-report-section health-report-section-checks health-report-section-collapsible is-collapsed">
                    <div class="health-report-section-header health-report-section-checks">
                        <span class="health-report-section-icon"><i class="fas fa-clipboard-check" aria-hidden="true"></i></span>
                        <span>Проверки (${checks?.length ?? 0}) — слои, хранилища, надёжность данных</span>
                        <button type="button" class="health-report-section-toggle" aria-expanded="false" aria-label="Развернуть раздел" title="Развернуть">&#9654;</button>
                    </div>
                    <div class="health-report-section-body">
                        <div class="health-report-section-body-inner">
                            ${checks?.length ? `<ul class="health-report-section-list">${checksList}</ul>` : '<div class="health-report-empty">Список проверок пуст.</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        initHudDetailsModalCollapse(modal);
        modal.style.display = 'flex';
    }

    function initHudDetailsModalCollapse(modal) {
        if (!modal || modal.dataset.hudDetailsCollapseInit) return;
        modal.dataset.hudDetailsCollapseInit = '1';
        modal.addEventListener('click', (e) => {
            const header = e.target.closest(
                '.health-report-section-collapsible .health-report-section-header',
            );
            if (!header) return;
            e.preventDefault();
            const section = header.closest('.health-report-section-collapsible');
            if (!section) return;
            section.classList.toggle('is-collapsed');
            const expanded = !section.classList.contains('is-collapsed');
            const btn = section.querySelector('.health-report-section-toggle');
            if (btn) {
                btn.setAttribute('aria-expanded', String(expanded));
                btn.title = expanded ? 'Свернуть' : 'Развернуть';
                btn.setAttribute('aria-label', expanded ? 'Свернуть раздел' : 'Развернуть раздел');
                btn.textContent = expanded ? '\u25BC' : '\u25B6';
            }
        });
    }

    function scheduleDismissAfterActivity() {
        STATE._onActivity = () => {
            removeActivityListeners();
            STATE.pendingDismissAfterActivity = setTimeout(() => {
                STATE.pendingDismissAfterActivity = null;
                dismissAnimated(() => {});
            }, DISMISS_AFTER_ACTIVITY_DELAY_MS);
        };
        document.addEventListener('mousemove', STATE._onActivity, { once: false, passive: true });
        document.addEventListener('keydown', STATE._onActivity, { once: false });
        document.addEventListener('touchstart', STATE._onActivity, { once: false, passive: true });
        document.addEventListener('scroll', STATE._onActivity, { once: false, passive: true });
    }

    function maybeFinishAll() {
        if (STATE.tasks.size === 0) {
            STATE.animatingToComplete = true;
            if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
        }
    }

    const API = {
        startTask(id, label, opts = {}) {
            console.log(`[BackgroundStatusHUD] startTask: ${id} (${label})`);
            ensureContainer();
            STATE.tasks.set(id, {
                id,
                label,
                weight: typeof opts.weight === 'number' ? opts.weight : 1,
                processed: 0,
                total: Math.max(1, opts.total ?? 100),
            });
            updateTitle();
            show();
        },
        updateTask(id, processed, total) {
            const t = STATE.tasks.get(id);
            if (!t) return;
            if (typeof total === 'number' && total > 0) t.total = total;
            if (typeof processed === 'number') {
                t.processed = Math.min(total ?? t.total, Math.max(0, processed));
            }
            computeTopOffset();
            updateTitle();
        },
        finishTask(id, success = true) {
            console.log(
                `[BackgroundStatusHUD] finishTask: ${id} (success: ${success}). Оставшиеся задачи: ${STATE.tasks.size - 1}`,
            );
            if (id === 'app-init') {
                STATE.initHadSubsystemFailures = !success;
            }
            STATE.tasks.delete(id);
            updateTitle();
            maybeFinishAll();
            if (id === 'app-init') {
                suppressCompletionUiWhenErrors();
                updateDetailsButton();
                syncHudMainHeading();
                renderWatchdogInfo();
            }
        },
        reportIndexProgress(processed, total, error) {
            const id = 'search-index-build';
            if (!STATE.tasks.has(id)) {
                API.startTask(id, 'Индексация контента', {
                    weight: 0.6,
                    total: Math.max(1, total || 100),
                });
            }
            if (error) {
                API.finishTask(id, false);
            } else {
                API.updateTask(id, processed, total);
                if (total && processed >= total) API.finishTask(id, true);
            }
        },
        setDiagnostics(payload = {}) {
            STATE.diagnostics = {
                errors: payload.errors || [],
                warnings: payload.warnings || [],
                checks: payload.checks || [],
                updatedAt: payload.updatedAt || null,
            };
            updateDetailsButton();
            suppressCompletionUiWhenErrors();
            updateTitle();
            syncHudMainHeading();
            renderWatchdogInfo();
        },
        /** Снимок последней диагностики (фон / ручной прогон) для экспорта пакета. */
        getDiagnosticsSnapshot() {
            return {
                errors: [...(STATE.diagnostics.errors || [])],
                warnings: [...(STATE.diagnostics.warnings || [])],
                checks: [...(STATE.diagnostics.checks || [])],
                updatedAt: STATE.diagnostics.updatedAt || null,
            };
        },
        /** Для второго контура: фоновые тесты не должны считаться «успех», если app-init уже зафиксировал сбои. */
        getInitHadSubsystemFailures() {
            return Boolean(STATE.initHadSubsystemFailures);
        },
        getWatchdogSnapshot() {
            return { ...STATE.watchdog };
        },
        setWatchdogStatus(payload = {}) {
            STATE.watchdog = {
                ...STATE.watchdog,
                ...payload,
            };
            renderWatchdogInfo();
            suppressCompletionUiWhenErrors();
            updateTitle();
        },
        setWatchdogRunNowHandler(handler) {
            STATE.watchdogRunNowHandler = typeof handler === 'function' ? handler : null;
        },
        /** Вызывается из runtime-issue-hub при новой записи в буфере */
        touchRuntimeIssues() {
            updateDetailsButton();
            suppressCompletionUiWhenErrors();
            updateTitle();
            syncHudMainHeading();
            renderWatchdogInfo();
        },
    };

    return API;
}
