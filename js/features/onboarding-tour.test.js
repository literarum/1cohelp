import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    __onboardingTourInternals,
    setOnboardingTourDependencies,
} from './onboarding-tour.js';

describe('onboarding-tour coverage', () => {
    beforeEach(() => {
        globalThis.document = {
            querySelector: () => null,
            body: {
                classList: {
                    remove: vi.fn(),
                },
            },
        };
        globalThis.window = {};
        setOnboardingTourDependencies({
            setActiveTab: null,
        });
    });

    it('builds a full-app tour with broad tab coverage', () => {
        const blueprints = __onboardingTourInternals.TOUR_STEP_BLUEPRINTS;
        const tabIds = new Set(blueprints.map((step) => step.tabId).filter(Boolean));

        expect(blueprints.length).toBeGreaterThan(25);
        expect(tabIds).toEqual(
            new Set([
                'main',
                'program',
                'skzi',
                'lk1c',
                'webReg',
                'links',
                'extLinks',
                'reglaments',
                'bookmarks',
                'sedoTypes',
                'blacklistedClients',
                'fnsCert',
                'xmlAnalyzer',
            ]),
        );
        expect(blueprints.some((step) => step.title.includes('Палитра команд'))).toBe(true);
        expect(
            blueprints.some((step) => step.title.includes('Настройка интерфейса (модальное окно)')),
        ).toBe(true);
        expect(blueprints.some((step) => step.title.includes('Мастер слияния баз данных'))).toBe(
            true,
        );
    });

    it('creates intro and outro steps without target elements', () => {
        const steps = __onboardingTourInternals.buildTourSteps();
        const firstStep = steps[0];
        const lastStep = steps[steps.length - 1];

        expect(firstStep.popover.title).toContain('Добро пожаловать');
        expect(firstStep.element).toBeUndefined();
        expect(lastStep.popover.title).toContain('Готово');
        expect(lastStep.element).toBeUndefined();
    });

    it('switches to blacklisted clients tab with warning bypass', () => {
        const setActiveTab = vi.fn(async () => {});
        setOnboardingTourDependencies({ setActiveTab });

        const elementMock = { id: 'blacklistedClientsTab' };
        globalThis.document = {
            querySelector: (selector) => (selector === '#blacklistedClientsTab' ? elementMock : null),
            body: {
                classList: {
                    remove: vi.fn(),
                },
            },
        };

        const steps = __onboardingTourInternals.buildTourSteps();
        const blacklistStep = steps.find((step) => step.tabId === 'blacklistedClients');

        expect(blacklistStep).toBeTruthy();
        const element = blacklistStep.element();
        expect(element?.id).toBe('blacklistedClientsTab');
        expect(setActiveTab).toHaveBeenCalledWith('blacklistedClients', true);
    });
});
