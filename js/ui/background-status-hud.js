'use strict';

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
    };

    const DISMISS_AFTER_ACTIVITY_DELAY_MS = 2000;

    function ensureStyles() {
        if (document.getElementById('bg-status-hud-styles')) return;
        const css = `
    #bg-status-hud {
      position: fixed; right: 16px; top: 16px; z-index: 9998;
      width: 320px; max-width: calc(100vw - 32px);
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
    #bg-status-hud .hud-title { display:flex; align-items:center; gap:8px;
      font-weight:600; font-size:14px; margin-bottom:8px; }
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
    }
    #bg-status-hud .hud-watchdog-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
      font-weight: 600;
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
    @media (prefers-reduced-motion: reduce){ #bg-status-hud .hud-bar{ animation: none; } }
    @keyframes hud-stripes{ 0%{ background-position: 0 0; } 100%{ background-position: 24px 0; } }
    #bg-hud-details-modal {
      position: fixed; inset: 0; z-index: 9999; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55);
    }
    #bg-hud-details-modal .hud-modal-card {
      background: var(--color-surface-2, #fff);
      color: var(--color-text-primary, #111);
      border-radius: 14px;
      width: min(720px, 92vw);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 40px rgba(0,0,0,0.2);
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
    }
    #bg-hud-details-modal .hud-modal-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--color-border, rgba(0,0,0,.12));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    #bg-hud-details-modal .hud-modal-body {
      padding: 16px;
      overflow-y: auto;
      font-size: 13px;
    }
    #bg-hud-details-modal .hud-modal-section {
      margin-bottom: 16px;
    }
    #bg-hud-details-modal .hud-modal-section h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
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
      <div class="hud-title"><span class="dot"></span><span>Фоновая инициализация...</span></div>
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
        root.querySelector('#bg-hud-close').addEventListener('click', () => dismissAnimated());
        renderWatchdogInfo();
        updateDetailsButton();
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

    function renderWatchdogInfo() {
        if (!STATE.watchdogInfoEl) return;
        const status = STATE.watchdog.statusText || '—';
        const lastRun = STATE.watchdog.lastRunAt
            ? new Date(STATE.watchdog.lastRunAt).toLocaleTimeString('ru-RU')
            : '—';
        const lastAutosave = STATE.watchdog.lastAutosaveAt
            ? new Date(STATE.watchdog.lastAutosaveAt).toLocaleTimeString('ru-RU')
            : '—';
        const severity = STATE.watchdog.severity || 'running';
        const dotClass =
            severity === 'error'
                ? 'is-error'
                : severity === 'warn'
                  ? 'is-warn'
                  : severity === 'ok'
                    ? 'is-ok'
                    : 'is-running';
        STATE.watchdogInfoEl.innerHTML = `<span class="hud-watchdog-status"><span class="hud-watchdog-dot ${dotClass}"></span>${watchdogStatusLabel(
            severity,
        )}</span> ${status} | Автосохранение: ${lastAutosave}`;
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

    // HUD скрывается ТОЛЬКО при взаимодействии пользователя (курсор, клавиша, прокрутка).
    // Принудительный таймаут убран — HUD висит до последнего без активности.

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
                    showCompletionCard();
                    scheduleDismissAfterActivity();
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
            STATE.titleEl.textContent = 'Готово';
            STATE.animatingToComplete = true;
            if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
            return;
        }
        const main = active[0];
        const others = Math.max(0, active.length - 1);
        const prefix = main.id === 'app-init' ? 'Выполняется' : 'Индексируется';
        STATE.titleEl.textContent =
            others > 0 ? `${prefix}: ${main.label} + ещё ${others}` : `${prefix}: ${main.label}`;
    }

    function showCompletionCard() {
        if (!STATE.container || STATE.hasShownCompletion || STATE.completionCardEl) return;
        STATE.hasShownCompletion = true;
        const card = document.createElement('div');
        card.className = 'hud-completion-card';
        card.setAttribute('role', 'status');
        card.innerHTML = `
            <span class="hud-completion-icon" aria-hidden="true"><i class="fas fa-check-circle"></i></span>
            <span class="hud-completion-text">Приложение полностью загружено</span>`;
        STATE.container.appendChild(card);
        STATE.completionCardEl = card;
    }

    function updateDetailsButton() {
        const hasIssues =
            (STATE.diagnostics.errors?.length || 0) > 0 ||
            (STATE.diagnostics.warnings?.length || 0) > 0;
        const footer = STATE.container?.querySelector('.hud-footer');
        if (!footer) return;
        if (hasIssues) {
            if (!STATE.detailsBtnEl) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'bg-hud-details-btn';
                btn.className = 'hud-details';
                btn.addEventListener('click', () => openDiagnosticsModal());
                footer.appendChild(btn);
                STATE.detailsBtnEl = btn;
            }
            STATE.detailsBtnEl.textContent = `Подробнее (${STATE.diagnostics.errors.length} / ${STATE.diagnostics.warnings.length})`;
        } else {
            if (STATE.detailsBtnEl?.parentNode) {
                STATE.detailsBtnEl.remove();
                STATE.detailsBtnEl = null;
            }
        }
    }

    function ensureDiagnosticsModal() {
        if (document.getElementById('bg-hud-details-modal')) return;
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
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        document.body.appendChild(modal);
        modal.querySelector('#bg-hud-details-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    function openDiagnosticsModal() {
        ensureDiagnosticsModal();
        const modal = document.getElementById('bg-hud-details-modal');
        const body = modal.querySelector('#bg-hud-details-body');
        const updated = modal.querySelector('#bg-hud-details-updated');
        const { errors, warnings, checks, updatedAt } = STATE.diagnostics;
        updated.textContent = updatedAt ? `Обновлено: ${updatedAt}` : '';

        const buildList = (items, emptyText) => {
            if (!items.length) {
                return `<p class="text-xs opacity-70">${emptyText}</p>`;
            }
            return `<ul class="space-y-2">${items
                .map(
                    (item) =>
                        `<li><strong>${item.title}</strong><div class="text-xs opacity-80">${item.message}</div></li>`,
                )
                .join('')}</ul>`;
        };

        body.innerHTML = `
            <div class="hud-modal-section">
                <h4>Watchdog</h4>
                <p class="text-xs opacity-80">Уровень: ${watchdogStatusLabel(
                    STATE.watchdog.severity || 'running',
                )}</p>
                <p class="text-xs opacity-80">Статус: ${STATE.watchdog.statusText || '—'}</p>
                <p class="text-xs opacity-80">Последнее автосохранение: ${
                    STATE.watchdog.lastAutosaveAt
                        ? new Date(STATE.watchdog.lastAutosaveAt).toLocaleString('ru-RU')
                        : '—'
                }</p>
            </div>
            <div class="hud-modal-section">
                <h4>Ошибки</h4>
                ${buildList(errors, 'Ошибок не обнаружено.')}
            </div>
            <div class="hud-modal-section">
                <h4>Предупреждения</h4>
                ${buildList(warnings, 'Предупреждений нет.')}
            </div>
            <div class="hud-modal-section">
                <h4>Проверки</h4>
                ${buildList(checks, 'Список проверок пуст.')}
            </div>
        `;
        modal.style.display = 'flex';
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
            STATE.tasks.delete(id);
            updateTitle();
            maybeFinishAll();
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
        },
        setWatchdogStatus(payload = {}) {
            STATE.watchdog = {
                ...STATE.watchdog,
                ...payload,
            };
            renderWatchdogInfo();
        },
        setWatchdogRunNowHandler(handler) {
            STATE.watchdogRunNowHandler = typeof handler === 'function' ? handler : null;
        },
    };

    return API;
}
