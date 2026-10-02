/**
 * Наглядные панели режима инженера: карточки метрик и таблица хранилищ.
 * Чистые функции (строка HTML на выходе) — легко тестируются; сырой текст остаётся ниже для копирования.
 */

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function formatBytes(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '—';
    if (v < 1024) return `${Math.round(v)} Б`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} КБ`;
    if (v < 1024 ** 3) return `${(v / 1024 / 1024).toFixed(1)} МБ`;
    return `${(v / 1024 ** 3).toFixed(2)} ГБ`;
}

function card(label, value, tone = 'neutral', hint = '') {
    return `<div class="ec-card ec-card--${tone}"><span class="ec-card__label">${esc(label)}</span><strong class="ec-card__value">${esc(value)}</strong>${
        hint ? `<span class="ec-card__hint">${esc(hint)}</span>` : ''
    }</div>`;
}

/** Статус Service Worker в человекочитаемом виде. */
export function describePwa(pwa) {
    if (!pwa || pwa.error) return { text: 'ошибка чтения', tone: 'bad' };
    if (pwa.supported === false) return { text: 'не поддерживается', tone: 'warn' };
    const active = pwa.registration?.active;
    if (active) return { text: active.state === 'activated' ? 'активен' : active.state, tone: 'ok' };
    if (pwa.registration?.installing || pwa.registration?.waiting) return { text: 'устанавливается', tone: 'warn' };
    return { text: 'не зарегистрирован', tone: 'warn' };
}

/** Карточки для вкладки «Сводка». */
export function buildOverviewCardsHtml(o, dbRows = []) {
    if (!o || typeof o !== 'object') return '';
    const errCount = Number(o.runtime?.runtimeErrorsBuffered) || 0;
    const mem = o.performance?.memory;
    const heapPct =
        mem && typeof mem === 'object' && mem.jsHeapSizeLimit
            ? Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100)
            : null;
    const sw = describePwa(o.pwa);
    const total = (Array.isArray(dbRows) ? dbRows : []).reduce(
        (s, r) => s + (r && r.status === 'ok' ? Number(r.count) || 0 : 0),
        0,
    );
    const upSec = Math.round((Number(o.performance?.now) || 0) / 1000);
    const upText = upSec >= 3600 ? `${Math.floor(upSec / 3600)} ч ${Math.floor((upSec % 3600) / 60)} мин` : `${Math.floor(upSec / 60)} мин ${upSec % 60} с`;
    return [
        card('Сеть', o.app?.online === false ? 'офлайн' : 'онлайн', o.app?.online === false ? 'warn' : 'ok'),
        card('Service Worker', sw.text, sw.tone),
        card('Ошибки в сессии', errCount, errCount ? 'bad' : 'ok'),
        card('Записей в логе', o.runtime?.logsBuffered ?? 0, 'neutral', `всего ${o.logging?.entriesTotal ?? '—'}`),
        card('Записей в БД', total.toLocaleString('ru-RU'), 'neutral', `${dbRows.length} хранилищ`),
        card('Память JS', heapPct == null ? 'н/д' : `${heapPct}%`, heapPct != null && heapPct > 80 ? 'warn' : 'neutral', mem && mem.usedJSHeapSize ? formatBytes(mem.usedJSHeapSize) : ''),
        card('Окно', o.app?.viewport ? `${o.app.viewport.width}×${o.app.viewport.height}` : '—'),
        card('Время сессии', upText),
    ].join('');
}

/** Таблица хранилищ IndexedDB с долями записей. */
export function buildDbTableHtml(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const sorted = rows.slice().sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    const max = Math.max(1, ...sorted.map((r) => (r.status === 'ok' ? Number(r.count) || 0 : 0)));
    const body = sorted
        .map((r) => {
            if (r.status !== 'ok') {
                return `<tr class="is-bad"><th scope="row">${esc(r.store)}</th><td colspan="2">${esc(r.status)}${r.error ? ` — ${esc(r.error)}` : ''}</td></tr>`;
            }
            const c = Number(r.count) || 0;
            const w = c ? Math.max(3, Math.round((c / max) * 100)) : 0;
            return `<tr${c ? '' : ' class="is-empty"'}><th scope="row">${esc(r.store)}</th><td class="ec-num">${c.toLocaleString('ru-RU')}</td><td class="ec-bar"><span style="width:${w}%"></span></td></tr>`;
        })
        .join('');
    return `<table class="ec-table"><thead><tr><th>Хранилище</th><th>Записей</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

const firstLine = (s) => String(s ?? '').split('\n')[0].trim().slice(0, 160);

function fmtTime(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso ?? '') : d.toLocaleTimeString('ru-RU');
}

/**
 * Группы повторяющихся ошибок: источник + первая строка сообщения, число повторов и время последнего.
 * @param {Array<{tsIso?:string,ts?:string,source?:string,title?:string,message?:string}>} hubEntries
 * @param {Array<{ts?:string,source?:string,message?:string}>} cockpitEntries
 */
export function groupErrorEntries(hubEntries = [], cockpitEntries = []) {
    const map = new Map();
    const add = (ts, source, message, title) => {
        const msg = firstLine(message) || firstLine(title) || '(без текста)';
        const src = String(source || 'unknown');
        const key = `${src}\0${msg}`;
        const g = map.get(key) || { source: src, message: msg, count: 0, firstTs: ts, lastTs: ts };
        g.count += 1;
        if (ts && (!g.lastTs || ts > g.lastTs)) g.lastTs = ts;
        if (ts && (!g.firstTs || ts < g.firstTs)) g.firstTs = ts;
        map.set(key, g);
    };
    for (const e of Array.isArray(hubEntries) ? hubEntries : []) add(e?.tsIso, e?.source, e?.message, e?.title);
    for (const e of Array.isArray(cockpitEntries) ? cockpitEntries : []) add(e?.ts, e?.source, e?.message);
    return [...map.values()].sort((a, b) => b.count - a.count || String(b.lastTs).localeCompare(String(a.lastTs)));
}

export function buildErrorGroupsHtml(hubEntries, cockpitEntries, limit = 30) {
    const groups = groupErrorEntries(hubEntries, cockpitEntries);
    if (!groups.length) {
        return '<div class="ec-okbox"><i class="fas fa-circle-check" aria-hidden="true"></i> Ошибок в этой сессии не зафиксировано</div>';
    }
    const total = groups.reduce((n, g) => n + g.count, 0);
    const rows = groups
        .slice(0, limit)
        .map(
            (g) => `<li class="ec-err"><span class="ec-err__count" title="Повторов">${g.count}×</span><div class="ec-err__main"><strong>${esc(g.message)}</strong><span>${esc(g.source)} · последняя в ${esc(fmtTime(g.lastTs))}</span></div></li>`,
        )
        .join('');
    return `<div class="ec-err-head">Уникальных ошибок: <b>${groups.length}</b>, всего срабатываний: <b>${total}</b>${groups.length > limit ? ` · показаны первые ${limit}` : ''}</div><ul class="ec-err-list">${rows}</ul>`;
}

/** Карточки вкладки State + таблица простых настроек. */
export function buildStateCardsHtml(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    const prefs = snapshot.userPreferences && typeof snapshot.userPreferences === 'object' ? snapshot.userPreferences : null;
    const cards = [
        card('Раздел', snapshot.currentSection ?? '—'),
        card('Загрузка', snapshot.isLoading ? 'идёт' : 'завершена', snapshot.isLoading ? 'warn' : 'ok'),
        card('База данных', snapshot.dbAvailable ? 'подключена' : 'нет', snapshot.dbAvailable ? 'ok' : 'bad'),
        card('Ключей в State', Array.isArray(snapshot.keys) ? snapshot.keys.length : '—'),
        card('Настроек', prefs ? Object.keys(prefs).length : 0),
    ].join('');
    let table = '';
    if (prefs) {
        const rows = Object.entries(prefs)
            .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(String(v).slice(0, 80))}</td></tr>`)
            .join('');
        if (rows) table = `<table class="ec-table ec-table--prefs"><thead><tr><th>Настройка</th><th>Значение</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<div class="ec-cards">${cards}</div>${table}`;
}
