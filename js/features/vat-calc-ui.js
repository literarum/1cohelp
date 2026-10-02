'use strict';

/** Окно «Калькулятор НДС» (палитра команд). Оформление — общее с «Проверкой реквизитов» (rq-*). */

import { VAT_RATES, parseMoney, computeVat, formatMoney } from './vat-calc.js';

const MODAL_ID = 'vatCalcModal';
const MODES = [
    { id: 'net', label: 'Сумма без НДС' },
    { id: 'gross', label: 'Сумма с НДС' },
    { id: 'vat', label: 'Сумма НДС' },
];

async function copy(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function openVatCalc() {
    document.getElementById(MODAL_ID)?.remove();
    const last = document.activeElement;
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'rq-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'vcTitle');
    root.innerHTML = `
        <div class="rq-backdrop" data-vc-close></div>
        <div class="rq-card vc-card">
            <header class="rq-head">
                <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-percent"></i></span>
                <div><h2 id="vcTitle">Калькулятор НДС</h2><p>Выделить НДС из суммы или начислить сверху</p></div>
                <button type="button" class="rq-icon-btn rq-close" data-vc-close aria-label="Закрыть"><i class="fas fa-times" aria-hidden="true"></i></button>
            </header>
            <div class="rq-body">
                <div class="vc-modes" role="radiogroup" aria-label="Что вы вводите">
                    ${MODES.map((m, i) => `<button type="button" class="vc-chip${i === 1 ? ' is-active' : ''}" role="radio" aria-checked="${i === 1}" data-vc-mode="${m.id}">${m.label}</button>`).join('')}
                </div>
                <label class="rq-sr" for="vcAmount">Сумма</label>
                <input id="vcAmount" class="rq-input vc-amount" inputmode="decimal" autocomplete="off" placeholder="Например: 12 345,67">
                <div class="vc-modes" role="radiogroup" aria-label="Ставка НДС">
                    ${VAT_RATES.map((r, i) => `<button type="button" class="vc-chip${i === 0 ? ' is-active' : ''}" role="radio" aria-checked="${i === 0}" data-vc-rate="${r}">${r}%</button>`).join('')}
                </div>
                <p class="vc-note">22% — общая ставка с 2026 года; 20% — для документов прошлых периодов; 5% и 7% — для плательщиков на УСН.</p>
                <div id="vcResult" class="vc-result" aria-live="polite"></div>
            </div>
        </div>`;
    document.body.appendChild(root);
    document.body.classList.add('modal-open');
    const input = root.querySelector('#vcAmount');
    const out = root.querySelector('#vcResult');
    let mode = 'gross';
    let rate = VAT_RATES[0];

    const render = () => {
        const amount = parseMoney(input.value);
        if (!input.value.trim()) {
            out.innerHTML = '';
            return;
        }
        const r = amount === null ? null : computeVat(amount, rate, mode);
        if (!r) {
            out.innerHTML = `<p class="rq-empty">${amount === null ? 'Введите число, например 12 345,67' : 'При ставке 0% сумму НДС вычислить нельзя'}</p>`;
            return;
        }
        const rows = [
            ['Без НДС', r.net],
            [`НДС ${rate}%`, r.vat],
            ['С НДС', r.gross],
        ];
        out.innerHTML = rows
            .map(
                ([l, v], i) => `<div class="vc-row${i === 2 ? ' vc-row--total' : ''}"><span>${l}</span><strong>${formatMoney(v)} ₽</strong><button type="button" class="rq-icon-btn" data-vc-copy="${v.toFixed(2).replace('.', ',')}" title="Копировать" aria-label="Копировать ${l}"><i class="far fa-copy" aria-hidden="true"></i></button></div>`,
            )
            .join('');
    };
    const setActive = (attr, value) => {
        root.querySelectorAll(`[${attr}]`).forEach((b) => {
            const on = b.getAttribute(attr) === String(value);
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-checked', String(on));
        });
    };
    input.addEventListener('input', render);

    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        root.remove();
        if (!document.querySelector('.fixed.inset-0:not(.hidden)')) document.body.classList.remove('modal-open');
        try {
            last?.focus?.();
        } catch {
            /* фокус вернуть не удалось */
        }
    };
    function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.closest('[data-vc-close]')) return close();
        const m = t.closest('[data-vc-mode]');
        if (m) {
            mode = m.getAttribute('data-vc-mode');
            setActive('data-vc-mode', mode);
            return render();
        }
        const r = t.closest('[data-vc-rate]');
        if (r) {
            rate = Number(r.getAttribute('data-vc-rate'));
            setActive('data-vc-rate', rate);
            return render();
        }
        const c = t.closest('[data-vc-copy]');
        if (c) {
            const ok = await copy(c.getAttribute('data-vc-copy'));
            c.classList.toggle('is-copied', ok);
            setTimeout(() => c.classList.remove('is-copied'), 900);
        }
    });
    requestAnimationFrame(() => input.focus());
    return root;
}

if (typeof window !== 'undefined') window.openVatCalc = openVatCalc;
