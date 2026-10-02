'use strict';

/**
 * Надёжный фоновый планировщик периодического опроса.
 *  - штатный интервал фиксирован (по умолчанию 5 минут от начала прошлого цикла), без накопления запросов;
 *  - один запрос одновременно (single-flight): повторные trigger() присоединяются к текущему;
 *  - вкладка скрыта / нет сети — цикл пропускается, при возврате (visibilitychange/focus/online) выполняется
 *    «догоняющий» опрос, если срок уже наступил (после неудачи — сразу при возврате сети);
 *  - ретраи и экспоненциальный backoff живут ВНУТРИ task (не меняют штатный интервал).
 * Использует глобальные setTimeout/Date.now, поэтому управляется fake-таймерами (Playwright page.clock).
 */

export const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * @param {{
 *   intervalMs?: number,
 *   task: (info: { reason: string }) => Promise<any>,
 *   isOnline?: () => boolean,
 *   isVisible?: () => boolean,
 *   onSkip?: (reason: string) => void,
 *   bindEvents?: boolean,
 * }} opts
 */
export function createBackgroundPoller(opts) {
    const intervalMs = Math.max(1000, opts.intervalMs || DEFAULT_POLL_INTERVAL_MS);
    const isOnline = opts.isOnline || (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    const isVisible = opts.isVisible || (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

    let timer = null;
    let running = false;
    let inFlight = null;
    let nextDueAt = 0;
    let lastStartedAt = 0;
    let lastFinishedAt = 0;
    let lastOk = null;
    let runs = 0;
    let skipped = 0;
    let listenersBound = false;

    const schedule = (delay) => {
        if (timer) clearTimeout(timer);
        nextDueAt = Date.now() + delay;
        timer = setTimeout(onTimer, delay);
    };

    async function execute(reason) {
        if (inFlight) return inFlight;
        lastStartedAt = Date.now();
        runs += 1;
        // Следующий штатный запуск — от НАЧАЛА цикла: интервал не «плывёт» из-за длительности/ретраев
        if (running) schedule(intervalMs);
        inFlight = (async () => {
            try {
                const res = await opts.task({ reason });
                lastOk = true;
                return res;
            } catch (err) {
                lastOk = false;
                throw err;
            } finally {
                lastFinishedAt = Date.now();
                inFlight = null;
            }
        })();
        return inFlight;
    }

    function onTimer() {
        timer = null;
        if (!running) return;
        if (!isOnline() || !isVisible()) {
            skipped += 1;
            opts.onSkip?.(!isOnline() ? 'offline' : 'hidden');
            // срок наступил, но запустить нельзя — ждём возврата; следующий слот держим на сетке интервала
            nextDueAt = Date.now();
            schedule(intervalMs);
            nextDueAt = Date.now(); // «просрочено»: catch-up сработает сразу при возврате
            return;
        }
        execute('interval').catch(() => {});
    }

    function catchUp(reason) {
        if (!running || inFlight) return;
        if (!isOnline() || !isVisible()) return;
        const overdue = Date.now() >= nextDueAt;
        const retryAfterFailure = lastOk === false && reason === 'online';
        if (overdue || retryAfterFailure) execute(`catchup:${reason}`).catch(() => {});
    }

    const onVisibility = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') catchUp('visible');
    };
    const onFocus = () => catchUp('focus');
    const onOnline = () => catchUp('online');

    function bind() {
        if (listenersBound || opts.bindEvents === false) return;
        listenersBound = true;
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', onFocus);
            window.addEventListener('online', onOnline);
        }
    }
    function unbind() {
        if (!listenersBound) return;
        listenersBound = false;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onOnline);
        }
    }

    return {
        intervalMs,
        /** Запускает расписание: первый штатный цикл через intervalMs (первичную загрузку делает вызывающий). */
        start({ firstDelayMs } = {}) {
            if (running) return;
            running = true;
            bind();
            schedule(typeof firstDelayMs === 'number' ? firstDelayMs : intervalMs);
        },
        stop() {
            running = false;
            if (timer) clearTimeout(timer);
            timer = null;
            unbind();
        },
        /** Внеочередной запуск (ручной/диагностика). Дедуплицируется с текущим запросом. Сдвигает расписание. */
        trigger(reason = 'manual') {
            if (running) schedule(intervalMs);
            return execute(reason);
        },
        /** Отметить, что внешний код только что выполнил успешную загрузку (сдвиг штатного срока). */
        markRun(ok = true) {
            lastStartedAt = lastFinishedAt = Date.now();
            lastOk = ok;
            if (running) schedule(intervalMs);
        },
        getState() {
            return {
                running,
                inFlight: Boolean(inFlight),
                nextDueAt,
                lastStartedAt,
                lastFinishedAt,
                lastOk,
                runs,
                skipped,
                intervalMs,
            };
        },
    };
}
