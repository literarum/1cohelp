'use strict';

/**
 * Проверки поверхности UI: DOM-аудит, геометрия интерактивов, зонд кнопок, поиск.
 * По умолчанию фоновый режим ненавязчивый (без смены вкладок, без открытия панели поиска).
 * Полный «живой» контур поиска (performSearch + InputEvent) — только при intrusiveUi: true.
 */

import {
    HEALTH_SURFACE_DATA_ATTR,
    resolveMonitoredDomIds,
    bucketMissingIdsByZone,
    probeVisibleInteractiveLayout,
} from './ui-health-surface-registry.js';
import { runFullButtonHealthSweep } from './ui-health-button-sweep.js';

/** Минимальная задержка после input (debounce 300 + запас на async performSearch). */
const INPUT_SETTLE_MS = 520;

/**
 * @deprecated Используйте resolveMonitoredDomIds(document).allIds — список генерируется из index.html.
 * Оставлено для совместимости со старыми импортами/тестами.
 */
export function getLegacyCriticalDomIdsFlat() {
    return resolveMonitoredDomIds(typeof document !== 'undefined' ? document : undefined).allIds;
}

/**
 * @param {string} html
 * @param {Element | null} panel
 * @returns {{ ok: boolean, reason?: string }}
 */
export function classifySearchPanelContent(html, panel) {
    const t = (html || '').trim();
    if (t.length < 12) {
        return { ok: false, reason: 'Слишком мало разметки в панели результатов.' };
    }
    if (/Идет поиск|fa-spinner/i.test(t)) {
        return { ok: true, reason: 'Индикатор загрузки' };
    }
    if (/ничего не найдено/i.test(t)) {
        return { ok: true, reason: 'Пустой результат (ожидаемо для зонда)' };
    }
    if (/Ошибка при поиске|Ошибка во время поиска|База данных не доступна/i.test(t)) {
        return { ok: true, reason: 'Сообщение об ошибке в UI (панель отвечает)' };
    }
    if (panel?.querySelector?.('ul li')) {
        return { ok: true, reason: 'Список результатов' };
    }
    if (/search-result-item|exact-match-highlight/i.test(t)) {
        return { ok: true, reason: 'Элементы результатов' };
    }
    return { ok: false, reason: 'Разметка не похожа на ответ поиска.' };
}

/**
 * @param {Element | null} panel — обычно #searchResults
 * @returns {{ ok: boolean, blocker?: string }}
 */
export function detectSearchDropdownVerticalClip(panel) {
    if (!panel || typeof window === 'undefined' || !window.getComputedStyle) {
        return { ok: true };
    }
    let cur = panel.parentElement;
    while (cur && cur !== document.body) {
        const st = window.getComputedStyle(cur);
        const oy = st.overflowY;
        if (oy === 'hidden' || oy === 'clip') {
            const hint = cur.id
                ? `#${cur.id}`
                : cur.className && typeof cur.className === 'string'
                  ? `.${cur.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                  : cur.tagName;
            return {
                ok: false,
                blocker: `Вертикальный клиппинг: ${hint} имеет overflow-y:${oy} (глобальный поиск может быть невидим).`,
            };
        }
        cur = cur.parentElement;
    }
    return { ok: true };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {object} deps
 * @param {function(...args): void} report — (level, title, message, meta?)
 * @param {function(Promise, number): Promise} [runWithTimeout]
 * @param {{ intrusive?: boolean }} [options] — только при **явном** `intrusive: true` вызываются performSearch и синтетический input (панель откроется). Без опции или с `false` — пассивный режим (безопасный дефолт для фона).
 */
export async function runSearchUiDualContourCheck(deps, report, runWithTimeout, options = {}) {
    const r = (level, title, message, extra = {}) =>
        report(level, title, message, { system: 'ui_surface', ...extra });

    const intrusive = options.intrusive === true;

    if (typeof document === 'undefined') {
        r('warn', 'Поверхность UI / поиск', 'Нет document — проверка пропущена.');
        return;
    }

    const searchInput = document.getElementById('searchInput');
    const panel = document.getElementById('searchResults');
    if (!searchInput || !panel) {
        r(
            'error',
            'Поверхность UI / поиск',
            'Отсутствует #searchInput или #searchResults — глобальный поиск не смонтирован.',
        );
        return;
    }

    const clip = detectSearchDropdownVerticalClip(panel);
    if (!clip.ok) {
        r('error', 'Поверхность UI / поиск (вёрстка)', clip.blocker || 'Клиппинг дропдауна.');
    } else {
        r(
            'info',
            'Поверхность UI / поиск (вёрстка)',
            'Цепочка предков не режет дропдаун по overflow-y.',
        );
    }

    if (!intrusive) {
        r(
            'info',
            'Поверхность UI / поиск (фон)',
            'Пассивный режим: панель результатов не открывается (нет performSearch и синтетического ввода).',
        );
        return;
    }

    const probe = '1';
    const prevValue = searchInput.value;

    const runBounded = async (fn) => {
        if (typeof runWithTimeout === 'function') {
            return runWithTimeout(fn(), 8000);
        }
        return fn();
    };

    let contourApiOk = false;
    let contourInputOk = false;

    if (typeof deps.performSearch === 'function') {
        try {
            await runBounded(async () => {
                await deps.performSearch(probe);
            });
            await sleep(80);
            const hiddenA = panel.classList.contains('hidden');
            const clsA = classifySearchPanelContent(panel.innerHTML, panel);
            contourApiOk = !hiddenA && clsA.ok;
            if (!contourApiOk) {
                r(
                    'error',
                    'Поверхность UI / поиск (контур API)',
                    `performSearch("${probe}") не привёл к видимой панели с ожидаемым содержимым: hidden=${hiddenA}, причина=${clsA.reason || '—'}`,
                );
            } else {
                r(
                    'info',
                    'Поверхность UI / поиск (контур API)',
                    `performSearch: панель открыта (${clsA.reason}).`,
                );
            }
        } catch (err) {
            r('error', 'Поверхность UI / поиск (контур API)', err?.message || String(err));
        }
    } else {
        r(
            'warn',
            'Поверхность UI / поиск (контур API)',
            'performSearch не передан в зависимостях health.',
        );
    }

    try {
        if (typeof deps.performSearch === 'function') {
            await deps.performSearch('');
        }
    } catch {
        /* ignore */
    }
    await sleep(120);

    try {
        searchInput.value = probe;
        searchInput.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: probe,
            }),
        );
        await sleep(INPUT_SETTLE_MS);
        const hiddenB = panel.classList.contains('hidden');
        const clsB = classifySearchPanelContent(panel.innerHTML, panel);
        contourInputOk = !hiddenB && clsB.ok;
        if (!contourInputOk) {
            r(
                'error',
                'Поверхность UI / поиск (контур ввода)',
                `Событие input не открыло панель или содержимое нераспознано: hidden=${hiddenB}, причина=${clsB.reason || '—'}`,
            );
        } else {
            r(
                'info',
                'Поверхность UI / поиск (контур ввода)',
                `Цепочка input → debounce → поиск: панель открыта (${clsB.reason}).`,
            );
        }
    } catch (err) {
        r('error', 'Поверхность UI / поиск (контур ввода)', err?.message || String(err));
    } finally {
        searchInput.value = prevValue;
        searchInput.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
        await sleep(INPUT_SETTLE_MS);
    }

    if (contourApiOk && !contourInputOk && typeof deps.performSearch === 'function') {
        r(
            'error',
            'Поверхность UI / поиск (расхождение контуров)',
            'API-контур работает, пользовательский input — нет: вероятна поломка initSearchSystem или обработчиков.',
        );
    }
}

/**
 * Полный DOM-аудит: все id из index (сгенерированный список) + рантайм + data-health-surface.
 * @param {function(...args): void} report
 */
export function runFullSurfaceDomAudit(report) {
    const r = (level, title, message, extra = {}) =>
        report(level, title, message, { system: 'ui_surface', ...extra });

    if (typeof document === 'undefined') {
        r('warn', 'Поверхность UI / DOM', 'document недоступен.');
        return;
    }

    const meta = resolveMonitoredDomIds(document);
    if (meta.dataHealthAttributeOrphans > 0) {
        r(
            'warn',
            'Поверхность UI / автоподхват',
            `${meta.dataHealthAttributeOrphans} узел(ов) с атрибутом ${HEALTH_SURFACE_DATA_ATTR} без id — задайте id, чтобы элемент вошёл в мониторинг.`,
        );
    }

    const missing = meta.allIds.filter((id) => !document.getElementById(id));
    if (!missing.length) {
        r(
            'info',
            'Поверхность UI / DOM',
            `Полный аудит: ${meta.allIds.length} id (index ${meta.indexCount} + рантайм + динамика), все в DOM.`,
        );
        return;
    }

    const buckets = bucketMissingIdsByZone(missing);
    for (const [zone, ids] of Object.entries(buckets)) {
        const sample = ids.slice(0, 16).join(', ');
        const more = ids.length > 16 ? ` … (+${ids.length - 16})` : '';
        r(
            'error',
            `Поверхность UI / DOM / ${zone}`,
            `Отсутствуют ${ids.length} элемент(ов): ${sample}${more}`,
        );
    }
}

/**
 * Геометрия всех интерактивных контролов, не спрятанных цепочкой .hidden (вкладки/модалки).
 * @param {function(...args): void} report
 */
export function runFullInteractiveLayoutProbe(report) {
    const r = (level, title, message, extra = {}) =>
        report(level, title, message, { system: 'ui_surface', ...extra });

    if (typeof document === 'undefined') {
        return;
    }

    const app = document.getElementById('appContent');
    if (!app || app.classList.contains('hidden')) {
        r(
            'warn',
            'Поверхность UI / геометрия',
            '#appContent скрыт — полная проверка интерактивов пропущена.',
        );
        return;
    }

    const { allIds } = resolveMonitoredDomIds(document);
    const { bad, skippedHidden, skippedNonInteractive } = probeVisibleInteractiveLayout(
        document,
        allIds,
    );

    r(
        'info',
        'Поверхность UI / геометрия (охват)',
        `Проверены интерактивные id из мониторинга: пропуск скрытых веток ${skippedHidden}, не-кнопок/полей ${skippedNonInteractive}, подозрительных размеров ${bad.length}.`,
    );

    if (bad.length) {
        const sample = bad.slice(0, 24).join('; ');
        const more = bad.length > 24 ? ` … (+${bad.length - 24})` : '';
        r(
            'warn',
            'Поверхность UI / геометрия',
            `Видимые интерактивы с нулевой/подозрительной областью: ${sample}${more}`,
        );
    }
}

/**
 * Полный пакет для старта / ручной диагностики.
 * @param {object} [options]
 * @param {boolean} [options.syntheticButtonClicks] — только при явном `true` программный клик по кнопкам.
 * @param {boolean} [options.intrusiveUi] — при явном `true`: полный обход вкладок и «живой» зонд поиска (панель откроется). По умолчанию `false`: фон без смены вкладок и без открытия панели поиска.
 */
export async function runUiSurfaceHealthSuite(deps, report, runWithTimeout, options = {}) {
    const syntheticButtonClicks = options.syntheticButtonClicks === true;
    const intrusiveUi = options.intrusiveUi === true;
    const overlayVisible = Boolean(deps?.loadingOverlayManager?.overlayElement);
    report(
        'info',
        'Поверхность UI / контекст',
        overlayVisible
            ? 'Проверка выполняется в фоне при активном оверлее загрузки.'
            : 'Оверлей загрузки не отображается (проверка после снятия или вне старта).',
        { system: 'ui_surface' },
    );
    if (!intrusiveUi) {
        report(
            'info',
            'Поверхность UI / режим',
            'Ненавязчивый фон: без переключения вкладок и без открытия панели глобального поиска.',
            { system: 'ui_surface' },
        );
    }

    runFullSurfaceDomAudit(report);
    if (intrusiveUi) {
        runFullInteractiveLayoutProbe(report);
    } else {
        report(
            'info',
            'Поверхность UI / геометрия',
            'Ненавязчивый режим: зонд геометрии интерактивов отключён (только DOM-аудит id и пассивный зонд кнопок в chrome/текущей вкладке).',
            { system: 'ui_surface' },
        );
    }
    try {
        const sweep = runFullButtonHealthSweep(deps, report, runWithTimeout, {
            syntheticClicks: syntheticButtonClicks,
            tabSweepMode: intrusiveUi ? 'full' : 'background',
        });
        if (typeof runWithTimeout === 'function') {
            await runWithTimeout(sweep, 120000);
        } else {
            await sweep;
        }
    } catch (btnErr) {
        report('warn', 'Поверхность UI / кнопки', btnErr?.message || String(btnErr), {
            system: 'ui_surface',
        });
    }
    await runSearchUiDualContourCheck(deps, report, runWithTimeout, {
        intrusive: intrusiveUi,
    });
}

/**
 * Лёгкий контур watchdog: только вёрстка дропдауна поиска (без открытия панели и без переключения вкладок).
 * Полный пакет поверхности при старте — см. runUiSurfaceHealthSuite (по умолчанию тоже ненавязчивый).
 * @param {object} deps
 * @param {function(level, title, message, system?): void} addCheck
 * @param {function(Promise, number): Promise} [runWithTimeout]
 */
export async function runWatchdogLightUiSurfaceCheck(deps, addCheck, runWithTimeout) {
    const report = (level, title, message, meta) => {
        addCheck(level, title, message, meta?.system || 'ui_surface');
    };
    try {
        if (typeof document === 'undefined') return;
        await runSearchUiDualContourCheck(deps, report, runWithTimeout, { intrusive: false });
    } catch (err) {
        addCheck(
            'warn',
            'Watchdog / Поверхность UI / поиск',
            err?.message || String(err),
            'ui_surface',
        );
    }
}

/**
 * Устаревшее имя: раньше включало полный DOM + кнопки на каждом цикле watchdog.
 * Сейчас делегирует в {@link runWatchdogLightUiSurfaceCheck} (без повторного тяжёлого обхода).
 */
export async function runWatchdogFullUiSurfaceCheck(deps, addCheck, runWithTimeout) {
    await runWatchdogLightUiSurfaceCheck(deps, addCheck, runWithTimeout);
}

/**
 * @deprecated Используйте runWatchdogLightUiSurfaceCheck.
 */
export async function runWatchdogSearchUiSurfaceCheck(deps, addCheck, runWithTimeout) {
    await runWatchdogLightUiSurfaceCheck(deps, addCheck, runWithTimeout);
}
