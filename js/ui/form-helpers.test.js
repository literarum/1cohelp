'use strict';

import { describe, expect, it } from 'vitest';
import { normalizeUrlInput, validateInn, formatPhoneRu } from './form-helpers.js';

describe('form-helpers: normalizeUrlInput', () => {
    it('добавляет https:// к адресу без схемы', () => {
        expect(normalizeUrlInput(' example.com/a ')).toEqual({ ok: true, url: 'https://example.com/a' });
    });
    it('оставляет схему и пустое значение', () => {
        expect(normalizeUrlInput('http://a.ru').url).toBe('http://a.ru');
        expect(normalizeUrlInput('').url).toBe('');
    });
    it('отклоняет javascript: и слова без точки', () => {
        expect(normalizeUrlInput('javascript:alert(1)').ok).toBe(false);
        expect(normalizeUrlInput('просто текст').ok).toBe(false);
    });
});

describe('form-helpers: validateInn', () => {
    it('принимает корректные ИНН (10 и 12 цифр)', () => {
        expect(validateInn('7707083893').ok).toBe(true);
        expect(validateInn('500100732259').ok).toBe(true);
    });
    it('отклоняет неверную контрольную сумму и длину', () => {
        expect(validateInn('7707083894').ok).toBe(false);
        expect(validateInn('123').ok).toBe(false);
    });
});

describe('form-helpers: formatPhoneRu', () => {
    it('форматирует 11 цифр', () => {
        expect(formatPhoneRu('89991234567')).toBe('+7 (999) 123-45-67');
    });
    it('не трогает нераспознанное', () => {
        expect(formatPhoneRu('доб. 123')).toBe('доб. 123');
    });
});
