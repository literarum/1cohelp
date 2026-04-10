/** @vitest-environment node */
'use strict';

import { describe, it, expect } from 'vitest';
import { stepNeedsNoInnHelpLink, isLikelyInnClarificationStep } from './main-algo-inn-link.js';

describe('main-algo-inn-link', () => {
    it('stepNeedsNoInnHelpLink: showNoInnHelp true', () => {
        expect(stepNeedsNoInnHelpLink({ showNoInnHelp: true, title: 'x' })).toBe(true);
    });

    it('stepNeedsNoInnHelpLink: inn_step', () => {
        expect(stepNeedsNoInnHelpLink({ type: 'inn_step', title: 'x' })).toBe(true);
    });

    it('stepNeedsNoInnHelpLink: явный false отключает эвристику по заголовку', () => {
        expect(
            stepNeedsNoInnHelpLink({
                showNoInnHelp: false,
                title: 'Уточнение ИНН',
                description: 'Уточните ИНН организации',
            }),
        ).toBe(false);
        expect(isLikelyInnClarificationStep({ title: 'Уточнение ИНН', description: 'Уточните ИНН' })).toBe(
            true,
        );
    });

    it('stepNeedsNoInnHelpLink: без флагов — эвристика для старых данных', () => {
        expect(
            stepNeedsNoInnHelpLink({
                title: 'Уточнение ИНН',
                description: 'Уточните ИНН организации',
            }),
        ).toBe(true);
    });
});
