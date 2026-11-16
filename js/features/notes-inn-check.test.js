import { describe, it, expect } from 'vitest';
import { findInvalidInns } from './notes-inn-check.js';

describe('findInvalidInns', () => {
    it('верный ИНН не флагуется, опечатка — да', () => {
        expect(findInvalidInns('ИНН 7707083893')).toEqual([]);
        expect(findInvalidInns('инн: 7707083894')[0].reason).toMatch(/контрольная/);
    });
    it('неверная длина', () => {
        expect(findInvalidInns('ИНН 770708389')[0].reason).toMatch(/9 цифр/);
    });
    it('телефон без слова ИНН не проверяется', () => {
        expect(findInvalidInns('тел 9031234567, 1234567890')).toEqual([]);
    });
    it('ИНН с пробелами внутри нормализуется', () => {
        expect(findInvalidInns('ИНН 7707 083 893')).toEqual([]);
    });
});
