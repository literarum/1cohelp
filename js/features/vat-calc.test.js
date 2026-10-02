import { describe, it, expect } from 'vitest';
import { parseMoney, computeVat, formatMoney, VAT_RATES } from './vat-calc.js';

describe('vat-calc', () => {
    it('parseMoney понимает пробелы, запятую и «руб.»', () => {
        expect(parseMoney('1 234,56')).toBe(1234.56);
        expect(parseMoney('1234.5 руб.')).toBe(1234.5);
        expect(parseMoney('12 000 ₽')).toBe(12000);
        expect(parseMoney('abc')).toBeNull();
        expect(parseMoney('')).toBeNull();
    });
    it('без НДС → с НДС (22%)', () => {
        expect(computeVat(1000, 22, 'net')).toEqual({ net: 1000, vat: 220, gross: 1220 });
    });
    it('с НДС → выделить НДС по расчётной ставке 22/122', () => {
        const r = computeVat(1220, 22, 'gross');
        expect(r).toEqual({ net: 1000, vat: 220, gross: 1220 });
        expect(computeVat(100, 10, 'gross').vat).toBe(9.09);
    });
    it('по сумме НДС восстанавливает базу; при 0% — null', () => {
        expect(computeVat(220, 22, 'vat')).toEqual({ net: 1000, vat: 220, gross: 1220 });
        expect(computeVat(10, 0, 'vat')).toBeNull();
    });
    it('ставка 0% и некорректный ввод', () => {
        expect(computeVat(500, 0, 'net')).toEqual({ net: 500, vat: 0, gross: 500 });
        expect(computeVat(NaN, 22)).toBeNull();
        expect(computeVat(10, -1)).toBeNull();
    });
    it('копейки не плывут: net+vat === gross', () => {
        for (const a of [0.01, 19.99, 100.05, 12345.67]) {
            for (const r of VAT_RATES) {
                const x = computeVat(a, r, 'gross');
                expect(Math.round((x.net + x.vat) * 100)).toBe(Math.round(x.gross * 100));
            }
        }
    });
    it('formatMoney', () => {
        expect(formatMoney(1234.5).replace(/\s/g, '')).toBe('1234,50');
        expect(formatMoney(NaN)).toBe('—');
    });
});
