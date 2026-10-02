'use strict';

import { describe, expect, it } from 'vitest';
import { validateInn, validateSnils, validateOgrn, validateBik, parseAmount, parseDateValue, requisiteKindByName } from './xml-analyzer-ids.js';

describe('xml-analyzer-ids', () => {
    it('ИНН: контрольная сумма', () => {
        expect(validateInn('7707083893').ok).toBe(true);
        expect(validateInn('7707083894').ok).toBe(false);
        expect(validateInn('123').ok).toBe(false);
        expect(validateInn('77O7083893').ok).toBe(false);
    });
    it('СНИЛС: контрольное число', () => {
        expect(validateSnils('112-233-445 95').ok).toBe(true);
        expect(validateSnils('112-233-445 96').ok).toBe(false);
    });
    it('ОГРН и БИК', () => {
        expect(validateOgrn('1027700132195').ok).toBe(true);
        expect(validateOgrn('1027700132196').ok).toBe(false);
        expect(validateBik('044525225').ok).toBe(true);
        expect(validateBik('1').ok).toBe(false);
    });
    it('суммы и даты в разных форматах', () => {
        expect(parseAmount('1 234,50')).toBeCloseTo(1234.5);
        expect(parseDateValue('31.12.2025').ok).toBe(true);
        expect(parseDateValue('не дата').ok).toBe(false);
    });
    it('вид реквизита по имени тега', () => {
        expect(requisiteKindByName('ИНН')).toBe('inn');
        expect(requisiteKindByName('Произвольное')).toBeFalsy();
    });
});
