'use strict';

import { describe, it, expect } from 'vitest';
import { normalizeFormStateForDirtyCheck } from './algorithms.js';

describe('normalizeFormStateForDirtyCheck', () => {
    it('считает эквивалентными section-алгоритм при type number в initial и string в current', () => {
        const a = {
            title: 'T',
            description: 'D',
            steps: [
                {
                    title: 's',
                    description: 'd',
                    additionalInfoText: '',
                    additionalInfoShowTop: false,
                    additionalInfoShowBottom: false,
                    type: 1,
                    existingScreenshotIds: '2,1',
                    tempScreenshotsCount: 0,
                    deletedScreenshotIds: '',
                },
            ],
        };
        const b = {
            title: 'T',
            description: 'D',
            steps: [
                {
                    title: 's',
                    description: 'd',
                    additionalInfoText: '',
                    additionalInfoShowTop: false,
                    additionalInfoShowBottom: false,
                    type: '1',
                    existingScreenshotIds: '1,2',
                    tempScreenshotsCount: 0,
                    deletedScreenshotIds: '',
                },
            ],
        };
        expect(normalizeFormStateForDirtyCheck(a, false)).toEqual(
            normalizeFormStateForDirtyCheck(b, false),
        );
    });

    it('нормализует \\r\\n в заголовке', () => {
        const x = { title: 'a\r\nb', description: '', steps: [] };
        const y = { title: 'a\nb', description: '', steps: [] };
        expect(normalizeFormStateForDirtyCheck(x, false)).toEqual(
            normalizeFormStateForDirtyCheck(y, false),
        );
    });

    it('для главного алгоритма приводит type к строке', () => {
        const mainStep = {
            title: 'x',
            description: '',
            example: 'e',
            additionalInfoText: '',
            additionalInfoShowTop: false,
            additionalInfoShowBottom: false,
            type: 2,
            isCopyable: false,
            isCollapsible: false,
            showNoInnHelp: false,
            phoneNumbers: [],
            phoneNumbersEnabled: false,
        };
        const a = { title: 'M', steps: [{ ...mainStep, type: 2 }] };
        const b = { title: 'M', steps: [{ ...mainStep, type: '2' }] };
        expect(normalizeFormStateForDirtyCheck(a, true)).toEqual(
            normalizeFormStateForDirtyCheck(b, true),
        );
    });
});
