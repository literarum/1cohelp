/** @vitest-environment jsdom */
'use strict';

/**
 * Резервный контур #noInnLink: шаг «только телефоны» не создаёт .collapsible-body —
 * repair должен вставить ссылку в корень .algorithm-step.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { repairMissingNoInnLinkIfNeeded } from './main-algorithm.js';

vi.mock('../db/indexeddb.js', () => ({
    getFromIndexedDB: vi.fn(),
    saveToIndexedDB: vi.fn(),
}));

describe('repairMissingNoInnLinkIfNeeded', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container?.remove();
    });

    it('вставляет #noInnLink в шаг без collapsible-body (режим телефонов)', () => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'algorithm-step';
        const title = document.createElement('h3');
        title.textContent = 'Телефоны';
        stepDiv.appendChild(title);
        container.appendChild(stepDiv);

        const mainSteps = [
            {
                title: 'Уточнение ИНН',
                description: 'Уточните ИНН организации',
                phoneNumbersEnabled: true,
                phoneNumbers: [],
            },
        ];

        repairMissingNoInnLinkIfNeeded(container, mainSteps);

        const link = container.querySelector('#noInnLink');
        expect(link).toBeTruthy();
        expect(link.textContent).toContain('ИНН');
        expect(stepDiv.contains(link)).toBe(true);
    });
});
