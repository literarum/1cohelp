'use strict';

/**
 * Реестр поверхности UI для авиационного самотестирования.
 *
 * 1) Полный контур: все уникальные id из index.html (ui-health-index-ids.js), плюс
 *    элементы, вмонтированные только в рантайме (HUD).
 * 2) Автоподхват нового функционала:
 *    — После добавления разметки в index.html запустите: node scripts/extract-ui-health-index-ids.mjs
 *    — Либо пометьте корневой элемент: data-health-surface="<зона>" (и обязательный id) —
 *      он попадёт в мониторинг без правки списка id, пока не перенесёте в index.
 */

import { INDEX_HTML_UNIQUE_ELEMENT_IDS } from './ui-health-index-ids.js';

/** Атрибут для автоматического включения элемента (с id) в мониторинг DOM. */
export const HEALTH_SURFACE_DATA_ATTR = 'data-health-surface';

/**
 * Id элементов, которые создаёт JS (нет в статическом index.html), но они обязаны
 * появиться к моменту health-проверок.
 */
export const RUNTIME_INJECTED_REQUIRED_IDS = Object.freeze(['bg-status-hud']);

/**
 * @param {Document} doc
 * @returns {{ ids: string[], orphanAttributeNodes: number }}
 */
export function collectDataHealthSurfaceBindings(doc) {
    if (typeof doc?.querySelectorAll !== 'function') {
        return { ids: [], orphanAttributeNodes: 0 };
    }
    const sel = `[${HEALTH_SURFACE_DATA_ATTR}]`;
    /** @type {string[]} */
    const ids = [];
    let orphanAttributeNodes = 0;
    doc.querySelectorAll(sel).forEach((el) => {
        if (el.id) ids.push(el.id);
        else orphanAttributeNodes += 1;
    });
    return { ids: [...new Set(ids)], orphanAttributeNodes };
}

/**
 * Полный список id для DOM-аудита (index + рантайм + data-health-surface).
 * @param {Document} [doc]
 * @returns {{ allIds: string[], indexCount: number, runtimeExtraCount: number, dynamicIds: string[] }}
 */
export function resolveMonitoredDomIds(doc) {
    const set = new Set(INDEX_HTML_UNIQUE_ELEMENT_IDS);
    const indexCount = set.size;
    for (const id of RUNTIME_INJECTED_REQUIRED_IDS) set.add(id);

    let dynamicIds = [];
    let orphanAttributeNodes = 0;
    if (doc) {
        const { ids, orphanAttributeNodes: orphans } = collectDataHealthSurfaceBindings(doc);
        dynamicIds = ids;
        orphanAttributeNodes = orphans;
        for (const id of ids) set.add(id);
    }

    const allIds = [...set].sort();
    return {
        allIds,
        indexCount,
        runtimeExtraCount: RUNTIME_INJECTED_REQUIRED_IDS.length,
        dynamicIds,
        dataHealthAttributeOrphans: orphanAttributeNodes,
    };
}

/**
 * Грубая зональная метка для отчёта (без дублирования длинных списков вручную).
 * @param {string} id
 * @returns {string}
 */
export function inferDomZoneLabel(id) {
    if (id === 'bg-status-hud') return 'HUD / фоновый статус';
    if (/Tab$/.test(id) || id === 'moreTabsBtn' || id === 'moreTabsDropdown')
        return 'Панель вкладок';
    if (
        /Content$/.test(id) ||
        id === 'trainingMount' ||
        id === 'trainingContent' ||
        id === 'mainContent'
    ) {
        return 'Контент вкладок';
    }
    if (id.startsWith('custom-loading') || id.startsWith('loading') || id === 'animated-dots') {
        return 'Экран загрузки';
    }
    if (id === 'notification-container' || id === 'tailwind-built')
        return 'Оболочка / ранний bootstrap';
    if (
        id === 'staticHeaderWrapper' ||
        id === 'topHeaderActions' ||
        id === 'dataTransferControls' ||
        id === 'appSlogan' ||
        id === 'appContent' ||
        id === 'app-copyright'
    ) {
        return 'Шапка и каркас';
    }
    if (
        id.includes('search') ||
        id === 'clearSearchInputBtn' ||
        id === 'toggleAdvancedSearch' ||
        id === 'advancedSearchOptionsLabel'
    ) {
        return 'Глобальный поиск';
    }
    if (id.includes('Timer') || id.startsWith('timer') || id === 'appTimer') return 'Таймер';
    if (id.startsWith('clientNotes') || id.startsWith('clientData') || id === 'mainAlgoCard') {
        return 'Главная / клиент';
    }
    if (id.startsWith('engineering')) return 'Машинное отделение';
    if (id.startsWith('dbMerge')) return 'Слияние баз (модалка)';
    if (id.startsWith('healthReport') || id === 'health-report-modal-inline') {
        return 'Отчёт о здоровье';
    }
    if (id.startsWith('xmlAnalyzer')) return 'XML-анализатор';
    if (id.startsWith('fnsCert')) return 'Проверка сертификата ФНС';
    /* clearClientAnalyticsSearchBtn и прочие id с подстрокой ClientAnalytics */
    if (id.startsWith('clientAnalytics') || /clientanalytics/i.test(id)) return 'Аналитика клиентов';
    if (id.startsWith('reminder')) return 'Напоминания';
    if (id.includes('Modal') || id.includes('Lightbox') || id === 'screenshotLightbox') {
        return 'Модальные окна';
    }
    if (id.startsWith('scroll') && id.includes('Btn')) return 'Плавающая прокрутка';
    return 'Прочая разметка';
}

/**
 * @param {string[]} missingIds
 * @returns {Record<string, string[]>}
 */
export function bucketMissingIdsByZone(missingIds) {
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const id of missingIds) {
        const z = inferDomZoneLabel(id);
        if (!out[z]) out[z] = [];
        out[z].push(id);
    }
    return out;
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Для кастомного переключателя (.app-toggle) нативный input скрыт (0×0); зонд геометрии
 * должен измерять видимую область — контейнер label.app-toggle.
 * @param {Element | null} el
 * @returns {Element | null}
 */
export function resolveInteractiveLayoutProbeElement(el) {
    if (!el) return null;
    if (el instanceof HTMLInputElement && el.classList.contains('app-toggle-input')) {
        const host = el.closest('.app-toggle');
        if (host) return host;
    }
    return el;
}

/**
 * Цепочка предков со `hidden` (Tailwind) — типичный «выкл» для вкладок и модалок.
 * @param {Element | null} el
 * @param {Document} doc
 * @returns {boolean}
 */
export function hasHiddenAncestor(el, doc) {
    let cur = el;
    while (cur && cur !== doc.body && cur !== doc.documentElement) {
        if (cur instanceof HTMLElement && cur.classList?.contains('hidden')) {
            return true;
        }
        cur = cur.parentElement;
    }
    return false;
}

/**
 * Предок без участия в геометрии (display:none / visibility:hidden), в т.ч. от CSS
 * (например неактивная вкладка `.engineering-cockpit-tab` без `.is-active`).
 * @param {Element | null} el
 * @param {Document} doc
 * @returns {boolean}
 */
export function hasObscuredLayoutAncestor(el, doc) {
    let cur = el.parentElement;
    while (cur && cur !== doc.documentElement) {
        if (cur instanceof HTMLElement) {
            if (cur.classList?.contains('hidden')) return true;
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
                try {
                    const st = window.getComputedStyle(cur);
                    if (st.display === 'none' || st.visibility === 'hidden') return true;
                } catch {
                    /* ignore */
                }
            }
        }
        cur = cur.parentElement;
    }
    return false;
}

/**
 * Пропуск геометрии/a11y-зонда: вкладки в overflow (display:none), вычислительно скрытые узлы.
 * @param {Element | null} el
 * @param {Document} doc
 * @returns {boolean}
 */
export function shouldSkipHealthInteractiveGeometry(el, doc) {
    if (!el || !(el instanceof HTMLElement)) return true;
    if (el.classList.contains('hidden')) return true;
    if (hasHiddenAncestor(el, doc)) return true;
    if (el.classList.contains('overflow-tab')) return true;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        try {
            const st = window.getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') return true;
        } catch {
            /* ignore */
        }
    }
    if (hasObscuredLayoutAncestor(el, doc)) return true;
    return false;
}

/**
 * Интерактивные элементы с ненулевой геометрией, если они не спрятаны вкладкой/модалкой.
 * @param {Document} doc
 * @param {string[]} allMonitoredIds
 * @returns {{ bad: string[], skippedHidden: number, skippedNonInteractive: number }}
 */
export function probeVisibleInteractiveLayout(doc, allMonitoredIds) {
    const bad = [];
    let skippedHidden = 0;
    let skippedNonInteractive = 0;

    for (const id of allMonitoredIds) {
        const el = doc.getElementById(id);
        if (!el) continue;
        if (el.tagName === 'TEMPLATE') {
            skippedNonInteractive += 1;
            continue;
        }
        if (!INTERACTIVE_TAGS.has(el.tagName) && el.getAttribute('role') !== 'button') {
            skippedNonInteractive += 1;
            continue;
        }
        if (el.tagName === 'INPUT' && /** @type {HTMLInputElement} */ (el).type === 'hidden') {
            skippedNonInteractive += 1;
            continue;
        }
        if (shouldSkipHealthInteractiveGeometry(el, doc)) {
            skippedHidden += 1;
            continue;
        }

        const probeTarget = resolveInteractiveLayoutProbeElement(el);
        if (
            probeTarget &&
            probeTarget !== el &&
            shouldSkipHealthInteractiveGeometry(probeTarget, doc)
        ) {
            skippedHidden += 1;
            continue;
        }

        const rect = probeTarget?.getBoundingClientRect?.();
        const w = rect?.width ?? 0;
        const h = rect?.height ?? 0;
        if (w < 2 || h < 2) {
            bad.push(`${id}(${Math.round(w)}×${Math.round(h)})`);
        }
    }

    return { bad, skippedHidden, skippedNonInteractive };
}
