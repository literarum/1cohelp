'use strict';

import { isReducedMotion } from '../utils/motion-pref.js';

/**
 * Окно «Проверка реквизитов»: вставьте любой текст — найдём ИНН/КПП/ОГРН/СНИЛС/БИК/счета/e-mail,
 * проверим контрольные суммы и дадим скопировать. Открывается из палитры команд и контекстного меню.
 */

import { scanRequisites, summarizeScan, buildScanReportText } from './requisites-scan.js';

const MODAL_ID = 'requisitesCheckModal';
let lastFocus = null;

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(msg, type = 'success') {
    try {
        const ns = window.NotificationService;
        if (ns?.show) return ns.show(msg, type, { duration: 1800 });
        if (typeof window.showNotification === 'function') window.showNotification(msg, type, { duration: 1800 });
    } catch {
        /* уведомление не критично */
    }
}

async function copy(text, okMsg) {
    try {
        await navigator.clipboard.writeText(text);
        toast(okMsg);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            toast(okMsg);
        } catch {
            toast('Не удалось скопировать', 'error');
        }
        ta.remove();
    }
}

const ICONS = { ok: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };

export function renderResultsHtml(items) {
    if (!items.length) {
        return '<p class="rq-empty">Реквизитов в тексте не найдено. Проверяются ИНН, КПП, ОГРН/ОГРНИП, СНИЛС, БИК, счета и e-mail.</p>';
    }
    return `<ul class="rq-list">${items
        .map(
            (i, n) => `<li class="rq-item rq-item--${i.status}">
            <i class="fas ${ICONS[i.status] || ICONS.info}" aria-hidden="true"></i>
            <div class="rq-item__main"><span class="rq-item__label">${esc(i.label)}</span><code class="rq-item__value">${esc(i.value)}</code>${i.note ? `<span class="rq-item__note">${esc(i.note)}</span>` : ''}</div>
            <button type="button" class="rq-icon-btn" data-rq-copy="${n}" title="Копировать значение" aria-label="Копировать ${esc(i.label)}"><i class="far fa-copy" aria-hidden="true"></i></button>
        </li>`,
        )
        .join('')}</ul>`;
}

function build() {
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'rq-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'rqTitle');
    root.innerHTML = `
        <div class="rq-backdrop" data-rq-close></div>
        <div class="rq-card">
            <header class="rq-head">
                <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-id-card"></i></span>
                <div><h2 id="rqTitle">Проверка реквизитов</h2><p>Вставьте текст — найдём ИНН, КПП, ОГРН, СНИЛС, БИК, счета и проверим контрольные суммы</p></div>
                <button type="button" class="rq-icon-btn rq-close" data-rq-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button>
            </header>
            <div class="rq-body">
                <label class="rq-sr" for="rqInput">Текст для проверки</label>
                <textarea id="rqInput" class="rq-input" rows="5" spellcheck="false" placeholder="Например: ООО «Ромашка», ИНН 7707083893, КПП 770701001, р/с 40702810400000000001, БИК 044525225"></textarea>
                <div class="rq-bar"><span id="rqSummary" class="rq-summary" aria-live="polite"></span>
                    <span class="rq-bar__btns"><button type="button" class="rq-btn" id="rqPaste"><i class="far fa-paste" aria-hidden="true"></i> Вставить</button>
                    <button type="button" class="rq-btn" id="rqCopyAll" disabled><i class="far fa-copy" aria-hidden="true"></i> Копировать отчёт</button></span></div>
                <div id="rqResults" class="rq-results"></div>
            </div>
        </div>`;
    return root;
}

export function openRequisitesCheck(initialText = '') {
    let root = document.getElementById(MODAL_ID);
    if (root) root.remove();
    lastFocus = document.activeElement;
    root = build();
    document.body.appendChild(root);
    document.body.classList.add('modal-open');
    const input = root.querySelector('#rqInput');
    const results = root.querySelector('#rqResults');
    const summary = root.querySelector('#rqSummary');
    const copyAll = root.querySelector('#rqCopyAll');
    let items = [];

    const run = () => {
        items = scanRequisites(input.value);
        results.innerHTML = input.value.trim() ? renderResultsHtml(items) : '';
        const s = summarizeScan(items);
        summary.textContent = input.value.trim()
            ? s.total
                ? `Найдено ${s.total}: верных ${s.ok}${s.bad ? `, с ошибкой ${s.bad}` : ''}${s.info ? `, без полной проверки ${s.info}` : ''}`
                : ''
            : '';
        summary.classList.toggle('has-error', s.bad > 0);
        copyAll.disabled = !items.length;
    };
    let t = null;
    input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(run, 120);
    });

    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        root.classList.add('is-leaving');
        const done = () => {
            root.remove();
            if (!document.querySelector('.modal-open-anchor, .fixed.inset-0:not(.hidden):not(.rq-modal)')) {
                document.body.classList.remove('modal-open');
            }
            try {
                lastFocus?.focus?.();
            } catch {
                /* фокус вернуть не удалось */
            }
        };
        setTimeout(done, isReducedMotion() ? 0 : 160);
    };
    function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }
    document.addEventListener('keydown', onKey, true);

    root.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        if (target.closest('[data-rq-close]')) return close();
        const c = target.closest('[data-rq-copy]');
        if (c) {
            const it = items[Number(c.getAttribute('data-rq-copy'))];
            if (it) void copy(it.value, `${it.label} скопирован`);
        }
    });
    root.querySelector('#rqPaste').addEventListener('click', async () => {
        try {
            input.value = await navigator.clipboard.readText();
            run();
        } catch {
            toast('Браузер не разрешил прочитать буфер — вставьте текст через Ctrl+V', 'warning');
            input.focus();
        }
    });
    copyAll.addEventListener('click', () => void copy(buildScanReportText(items), 'Отчёт скопирован'));

    if (initialText) {
        input.value = String(initialText);
        run();
    }
    requestAnimationFrame(() => input.focus());
    return root;
}

if (typeof window !== 'undefined') window.openRequisitesCheck = openRequisitesCheck;
