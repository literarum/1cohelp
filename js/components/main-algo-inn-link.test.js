/** @vitest-environment node */
'use strict';

import { describe, it, expect } from 'vitest';
import {
    isLikelyInnClarificationStep,
    stepNeedsNoInnHelpLink,
} from './main-algo-inn-link.js';

describe('main-algo-inn-link', () => {
    it('legacy шаг без type/showNoInnHelp, но с типичным заголовком — нужна ссылка', () => {
        const legacy = {
            title: 'Уточнение ИНН',
            description: 'Запросите ИНН организации для идентификации клиента.',
        };
        expect(isLikelyInnClarificationStep(legacy)).toBe(true);
        expect(stepNeedsNoInnHelpLink(legacy)).toBe(true);
    });

    it('явный inn_step — нужна ссылка', () => {
        expect(stepNeedsNoInnHelpLink({ type: 'inn_step', title: 'X' })).toBe(true);
    });

    it('showNoInnHelp: true — нужна ссылка', () => {
        expect(stepNeedsNoInnHelpLink({ showNoInnHelp: true, title: 'X' })).toBe(true);
    });

    it('посторонний шаг без ИНН — не нужна', () => {
        expect(stepNeedsNoInnHelpLink({ title: 'Приветствие', description: 'Здравствуйте' })).toBe(
            false,
        );
    });

    it('заголовок только «ИНН» без контекста уточнения — эвристика не срабатывает', () => {
        expect(isLikelyInnClarificationStep({ title: 'ИНН', description: '' })).toBe(false);
    });
});
