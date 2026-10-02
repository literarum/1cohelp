import { describe, it, expect } from 'vitest';
import { scanRequisites, summarizeScan, buildScanReportText } from './requisites-scan.js';

describe('scanRequisites', () => {
    it('находит ИНН с подписью и без, проверяет контрольную сумму', () => {
        const r = scanRequisites('Клиент ИНН: 7707083893, второй 7707083894');
        const inns = r.filter((x) => x.kind === 'inn');
        expect(inns.map((x) => x.value)).toEqual(['7707083893', '7707083894']);
        expect(inns[0].status).toBe('ok');
        expect(inns[1].status).toBe('error');
    });
    it('СНИЛС с разделителями; телефон 11 цифр не принимается за СНИЛС', () => {
        const r = scanRequisites('СНИЛС 112-233-445 95, тел 89161234567');
        expect(r.filter((x) => x.kind === 'snils').length).toBe(1);
        expect(r.find((x) => x.kind === 'snils').status).toBe('ok');
        expect(r.some((x) => x.value === '89161234567')).toBe(false);
    });
    it('ОГРН, КПП, БИК и счёт с проверкой ключа по БИК', () => {
        const r = scanRequisites('ОГРН 1027700132195 КПП 770701001 БИК 044525225 р/с 40702810400000000001');
        const by = Object.fromEntries(r.map((x) => [x.kind, x]));
        expect(by.ogrn.status).toBe('ok');
        expect(by.kpp.status).toBe('ok');
        expect(by.bik.status).toBe('ok');
        expect(by.account.value).toBe('40702810400000000001');
        expect(['ok', 'error']).toContain(by.account.status);
    });
    it('голые числа классифицируются по длине, дубликаты схлопываются', () => {
        const r = scanRequisites('7707083893 и снова 7707083893; 044525225');
        expect(r.filter((x) => x.kind === 'inn').length).toBe(1);
        expect(r.find((x) => x.value === '044525225').kind).toBe('bik');
    });
    it('e-mail, мусор и пустой ввод', () => {
        expect(scanRequisites('пишите на ivan@example.ru').map((x) => x.kind)).toEqual(['email']);
        expect(scanRequisites('')).toEqual([]);
        expect(scanRequisites(null)).toEqual([]);
        expect(scanRequisites('просто текст 123 без реквизитов')).toEqual([]);
    });
    it('сводка и отчёт', () => {
        const r = scanRequisites('ИНН 7707083893 ИНН 7707083894');
        expect(summarizeScan(r)).toEqual({ total: 2, ok: 1, bad: 1, info: 0 });
        expect(buildScanReportText(r)).toContain('✘ ИНН: 7707083894');
    });
    it('ИНН с подписью, за которым через пробел идёт другое число', () => {
        const r = scanRequisites('ИНН 7707083893 770701001');
        expect(r.find((x) => x.kind === 'inn').value).toBe('7707083893');
    });
});
