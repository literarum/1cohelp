import { describe, it, expect } from 'vitest';
import { findBestMatchingStep, formatStepLabel, queryWords } from './search-step-match.js';

const steps = [
    { title: 'Приветствие', description: 'Обозначьте клиенту, куда он дозвонился' },
    { title: 'Уточнение ИНН', description: 'Запросите ИНН организации для идентификации клиента' },
    { title: 'Идентификация проблемы', description: { type: 'list', intro: 'Вопросы:', items: ['Уточните текст ошибки'] } },
];

describe('search-step-match', () => {
    it('находит шаг по заголовку с приоритетом', () => {
        const m = findBestMatchingStep(steps, 'инн');
        expect(m.index).toBe(1);
        expect(formatStepLabel(m)).toBe('Шаг 2 · Уточнение ИНН');
        expect(m.snippet).toContain('Запросите ИНН');
    });
    it('совпадение по префиксу слова и в списке', () => {
        expect(findBestMatchingStep(steps, 'ошиб').index).toBe(2);
        expect(findBestMatchingStep(steps, 'идентиф').index).toBe(2);
    });
    it('нет совпадения — null; теги отбрасываются', () => {
        expect(findBestMatchingStep(steps, 'zzz')).toBeNull();
        expect(queryWords('#тег инн')).toEqual(['инн']);
        expect(findBestMatchingStep([], 'инн')).toBeNull();
    });
    it('спецсимволы в запросе не ломают регулярное выражение', () => {
        expect(() => findBestMatchingStep(steps, 'c++ (инн)')).not.toThrow();
    });
});
