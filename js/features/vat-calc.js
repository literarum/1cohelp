'use strict';

/**
 * Калькулятор НДС: три режима ввода (сумма без НДС, сумма с НДС, сумма НДС) и расчётные ставки.
 * Чистая логика без DOM. Деньги считаем в копейках (целые), чтобы не накапливать ошибку float.
 */

/** Ставки: 22% общая (с 2026 г.), 20% — для документов прошлых периодов, 10% льготная, 5%/7% — спецрежим, 0%. */
export const VAT_RATES = [22, 20, 10, 7, 5, 0];

/** «1 234,56», «1234.5», «1 234 руб.» → число или null. */
export function parseMoney(input) {
    const s = String(input ?? '')
        .replace(/[\s ]/g, '')
        .replace(/руб\.?|р\.?|₽/gi, '')
        .replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

const toKop = (rub) => Math.round(rub * 100);
const fromKop = (k) => k / 100;

/**
 * @param {number} amount сумма в рублях
 * @param {number} rate ставка, %
 * @param {'net'|'gross'|'vat'} mode что введено: без НДС / с НДС / сам НДС
 * @returns {{net:number, vat:number, gross:number} | null}
 */
export function computeVat(amount, rate, mode = 'net') {
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate < 0) return null;
    const a = toKop(amount);
    let net;
    let vat;
    let gross;
    if (mode === 'gross') {
        gross = a;
        vat = Math.round((gross * rate) / (100 + rate));
        net = gross - vat;
    } else if (mode === 'vat') {
        if (rate === 0) return null;
        vat = a;
        net = Math.round((vat * 100) / rate);
        gross = net + vat;
    } else {
        net = a;
        vat = Math.round((net * rate) / 100);
        gross = net + vat;
    }
    return { net: fromKop(net), vat: fromKop(vat), gross: fromKop(gross) };
}

export function formatMoney(n) {
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
