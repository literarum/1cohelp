'use strict';

import { describe, expect, it } from 'vitest';
import { __algorithmStepExecutionTestables } from './algorithm-step-execution.js';

describe('algorithm-step-execution testables', () => {
    const { clampStepIndex, getStepExecutionUiState, getStepExecutionProgressText } =
        __algorithmStepExecutionTestables;

    it('clampStepIndex keeps value within available range', () => {
        expect(clampStepIndex(-1, 3)).toBe(0);
        expect(clampStepIndex(1, 3)).toBe(1);
        expect(clampStepIndex(100, 3)).toBe(2);
    });

    it('clampStepIndex returns 0 when there are no steps', () => {
        expect(clampStepIndex(5, 0)).toBe(0);
    });

    it('getStepExecutionUiState disables prev and marks first step', () => {
        expect(getStepExecutionUiState(0, 4)).toEqual({
            hasSteps: true,
            currentIndex: 0,
            isFirst: true,
            isLast: false,
            canGoPrev: false,
            canGoNext: true,
        });
    });

    it('getStepExecutionUiState disables next and marks last step', () => {
        expect(getStepExecutionUiState(10, 4)).toEqual({
            hasSteps: true,
            currentIndex: 3,
            isFirst: false,
            isLast: true,
            canGoPrev: true,
            canGoNext: false,
        });
    });

    it('getStepExecutionUiState handles empty step list safely', () => {
        expect(getStepExecutionUiState(0, 0)).toEqual({
            hasSteps: false,
            currentIndex: 0,
            isFirst: true,
            isLast: true,
            canGoPrev: false,
            canGoNext: false,
        });
    });

    it('getStepExecutionProgressText shows 1-based step progress', () => {
        expect(getStepExecutionProgressText(0, 4)).toBe('Шаг 1 из 4');
        expect(getStepExecutionProgressText(2, 4)).toBe('Шаг 3 из 4');
    });

    it('getStepExecutionProgressText shows fallback when no steps', () => {
        expect(getStepExecutionProgressText(0, 0)).toBe('Шаги отсутствуют');
    });
});
