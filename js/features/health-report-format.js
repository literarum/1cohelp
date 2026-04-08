'use strict';

/**
 * Форматирование отчёта «Состояние здоровья»: группировка по подсистемам (авиационная модель слоёв).
 */

/** Порядок отображения групп в UI */
export const HEALTH_SYSTEM_ORDER = [
    'runtime',
    'storage_quota',
    'memory',
    'tab_pwa',
    'telemetry',
    'storage_idb',
    'search',
    'ui_surface',
    'export_import',
    'merge',
    'data_content',
    'data_integrity',
    'autosave',
    'revocation',
    'ui',
    'notifications',
    'clipboard',
    'runtime_errors',
    'watchdog',
    'general',
];

export const HEALTH_SYSTEM_LABELS = {
    runtime: 'Среда и платформа (сеть, контекст, Web Storage API)',
    storage_quota: 'Квота хранилища и persistence',
    memory: 'Память (heap, устройство)',
    tab_pwa: 'Вкладка и PWA (Service Worker)',
    telemetry: 'Телеметрия и наблюдатели',
    storage_idb: 'IndexedDB: структура и транзакции',
    search: 'Поиск и индексация',
    ui_surface: 'Поверхность интерфейса (DOM, вёрстка поиска, геометрия)',
    export_import: 'Экспорт и резервное копирование',
    merge: 'Слияние баз (совместимость формата)',
    data_content: 'Данные (алгоритмы, закладки, клиент, сторы)',
    data_integrity: 'Целостность данных (второй контур: ссылки, PDF, сироты)',
    autosave: 'Автосохранение заметок',
    revocation: 'Проверка отзыва сертификатов',
    ui: 'Интерфейс, тема, вёрстка',
    notifications: 'Уведомления ОС',
    clipboard: 'Буфер обмена',
    runtime_errors: 'Ошибки выполнения (центральный буфер)',
    watchdog: 'Watchdog (периодический контроль)',
    general: 'Прочее',
};

/**
 * @param {string} title
 * @returns {string} ключ HEALTH_SYSTEM_LABELS
 */
export function inferSystemFromTitle(title) {
    const t = String(title || '');
    if (/Поверхность UI/i.test(t)) return 'ui_surface';
    if (/^SLO\s*\//i.test(t)) return 'telemetry';
    if (/Watchdog\s*\//i.test(t) || /^Watchdog/i.test(t)) return 'watchdog';
    if (/^localStorage$|^sessionStorage$/i.test(t)) return 'runtime';
    if (/^IndexedDB$/i.test(t)) return 'storage_idb';
    if (/^IndexedDB\s*\(/i.test(t) && /второй контур/i.test(t)) return 'storage_idb';
    if (/Вкладка|Service Worker|Cross-origin isolation/i.test(t)) return 'tab_pwa';
    if (/Поиск|searchIndex|индекс|Индекс/i.test(t)) return 'search';
    if (/Экспорт|Импорт|File System|экспорт|резервн/i.test(t)) return 'export_import';
    if (/слиян|merge|Merge|совместимост/i.test(t)) return 'merge';
    if (/Yandex|отзыв|API проверки|Компонента проверки|проверки отзыва/i.test(t)) return 'revocation';
    if (/Целостность данных/i.test(t)) return 'data_integrity';
    if (/IndexedDB|хранилищ|clientData|Алгоритмы|Закладки|Черн|Избранное|Заметки|Регламент|Ссылки|pdfFiles|screenshots|СЭДО|Корзина удалений|sedoTypes/i.test(t))
        return 'data_content';
    if (/автосохран|Autosave/i.test(t)) return 'autosave';
    if (/Глобальные ошибки|буфере сбоев|runtime.?hub|Необработанные ошибки/i.test(t)) return 'runtime_errors';
    if (/UI |Стили|ResizeObserver|Кастомизация|Настройки интерфейса|^UI /i.test(t)) return 'ui';
    if (/Clipboard|Буфер обмена/i.test(t)) return 'clipboard';
    if (/Уведомления|Notification/i.test(t)) return 'notifications';
    if (/Хранилище|StorageManager|persistence|квот/i.test(t)) return 'storage_quota';
    if (/Память|heap|RAM|Устройство/i.test(t)) return 'memory';
    if (/localStorage|sessionStorage|Сеть|Безопасн|secure|офлайн/i.test(t)) return 'runtime';
    if (/Телеметрия|long task|Reporting/i.test(t)) return 'telemetry';
    if (/Ручной прогон|Фоновая диагностика/i.test(t)) return 'general';
    return 'general';
}

/**
 * @param {{ title?: string, message?: string, system?: string }} entry
 * @returns {{ title: string, message: string, system: string }}
 */
export function enrichHealthEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return { title: '', message: '', system: 'general' };
    }
    const system = entry.system || inferSystemFromTitle(entry.title);
    return {
        title: entry.title != null ? String(entry.title) : '',
        message: entry.message != null ? String(entry.message) : '',
        system,
    };
}

/**
 * Агрегат по худшему сигналу в группе: error > warn > ok
 * @param {Array<{title?:string,message?:string,system?:string}>} errors
 * @param {Array<{title?:string,message?:string,system?:string}>} warnings
 * @returns {Record<string, 'ok'|'warn'|'error'>}
 */
export function computeSubsystemStatuses(errors, warnings) {
    /** @type {Record<string, 'ok'|'warn'|'error'>} */
    const status = {};
    for (const id of HEALTH_SYSTEM_ORDER) {
        status[id] = 'ok';
    }
    const apply = (list, level) => {
        for (const raw of list || []) {
            const e = enrichHealthEntry(raw);
            const id = e.system || 'general';
            if (!status[id]) status[id] = 'ok';
            if (level === 'error') status[id] = 'error';
            else if (level === 'warn' && status[id] !== 'error') status[id] = 'warn';
        }
    };
    apply(errors, 'error');
    apply(warnings, 'warn');
    return status;
}

/**
 * @param {string} str
 */
function esc(str) {
    if (str == null || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Сводная таблица подсистем для верха модалки
 * @param {(s: string) => string} escHtml — опционально внешний esc
 */
export function buildHealthSubsystemSummaryHtml(errors, warnings, _checks, escHtml = esc) {
    const e = escHtml;
    const status = computeSubsystemStatuses(errors, warnings);
    const renderChip = (id) => {
        const st = status[id] || 'ok';
        const label = HEALTH_SYSTEM_LABELS[id] || id;
        const cls =
            st === 'error'
                ? 'health-sys-chip is-error'
                : st === 'warn'
                  ? 'health-sys-chip is-warn'
                  : 'health-sys-chip is-ok';
        const titleAttr = st === 'ok' ? 'OK' : st === 'warn' ? 'Предупреждение' : 'Ошибка';
        return `<span class="${cls}" title="${e(titleAttr)}: ${e(label)}"><span class="health-sys-chip-dot" aria-hidden="true">●</span>${e(
            label,
        )}</span>`;
    };
    const allChips = HEALTH_SYSTEM_ORDER.map(renderChip).join('');
    return `<div class="health-subsystem-summary" role="region" aria-label="Сводка по подсистемам"><p class="health-subsystem-summary-intro">Самотестирование систем</p><div class="health-subsystem-chips">${allChips}</div></div>`;
}

/**
 * Группированный список проверок
 * @param {Array<{title?:string,message?:string,system?:string}>} items
 * @param {string} itemIconHtml
 */
export function buildGroupedHealthListHtml(items, itemIconHtml, escHtml = esc) {
    const e = escHtml;
    const list = (items || []).map(enrichHealthEntry);
    /** @type {Record<string, typeof list>} */
    const bySys = {};
    for (const it of list) {
        const id = it.system || 'general';
        if (!bySys[id]) bySys[id] = [];
        bySys[id].push(it);
    }

    const renderItems = (arr) =>
        arr
            .map(
                (i) =>
                    `<li class="health-report-item">
            <span class="health-report-item-icon">${itemIconHtml}</span>
            <div>
              <div class="health-report-item-title">${e(i.title)}</div>
              <div class="health-report-item-message">${e(i.message)}</div>
            </div>
        </li>`,
            )
            .join('');

    const parts = [];
    const seen = new Set();

    for (const id of HEALTH_SYSTEM_ORDER) {
        if (!bySys[id]?.length) continue;
        seen.add(id);
        const label = HEALTH_SYSTEM_LABELS[id] || id;
        parts.push(`<li class="health-system-group">
      <div class="health-system-group-title" role="heading" aria-level="4">${e(label)}</div>
      <ul class="health-report-section-list health-system-group-list">${renderItems(bySys[id])}</ul>
    </li>`);
    }
    for (const id of Object.keys(bySys)) {
        if (seen.has(id)) continue;
        const label = HEALTH_SYSTEM_LABELS[id] || id;
        parts.push(`<li class="health-system-group">
      <div class="health-system-group-title" role="heading" aria-level="4">${e(label)}</div>
      <ul class="health-report-section-list health-system-group-list">${renderItems(bySys[id])}</ul>
    </li>`);
    }

    return `<ul class="health-grouped-root">${parts.join('')}</ul>`;
}
