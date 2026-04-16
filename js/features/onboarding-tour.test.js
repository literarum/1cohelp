import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ONBOARDING_AUTO_OFFER_STORAGE_KEY } from '../constants.js';
import {
    __onboardingTourInternals,
    setOnboardingTourDependencies,
    shouldShowOnboardingAfterInit,
} from './onboarding-tour.js';

describe('shouldShowOnboardingAfterInit', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns false when tour is marked completed', () => {
        setOnboardingTourDependencies({
            State: {
                userPreferences: {
                    onboardingTourCompleted: true,
                    onboardingTourAutoPromptConsumed: false,
                },
            },
        });
        expect(shouldShowOnboardingAfterInit()).toBe(false);
    });

    it('returns false when auto prompt was already consumed', () => {
        setOnboardingTourDependencies({
            State: {
                userPreferences: {
                    onboardingTourCompleted: false,
                    onboardingTourAutoPromptConsumed: true,
                },
            },
        });
        expect(shouldShowOnboardingAfterInit()).toBe(false);
    });

    it('returns false when localStorage marks offer as shown', () => {
        globalThis.localStorage.getItem = vi.fn((key) =>
            key === ONBOARDING_AUTO_OFFER_STORAGE_KEY ? '1' : null,
        );
        setOnboardingTourDependencies({
            State: {
                userPreferences: {
                    onboardingTourCompleted: false,
                    onboardingTourAutoPromptConsumed: false,
                },
            },
        });
        expect(shouldShowOnboardingAfterInit()).toBe(false);
    });

    it('returns true for default first-run preferences without storage flag', () => {
        setOnboardingTourDependencies({
            State: {
                userPreferences: {
                    onboardingTourCompleted: false,
                    onboardingTourAutoPromptConsumed: false,
                },
            },
        });
        expect(shouldShowOnboardingAfterInit()).toBe(true);
    });
});

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
        const sectionsOrderStep = blueprints.find(
            (step) => step.title === 'Включение и порядок разделов',
        );
        const timerButtonsStep = blueprints.find(
            (step) => step.title === 'Таймер: прибавить и убавить',
        );

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
                'training',
                'sedoTypes',
                'blacklistedClients',
                'fnsCert',
                'xmlAnalyzer',
            ]),
        );
        expect(blueprints.some((step) => step.tabId === 'training')).toBe(true);
        const programStep = blueprints.find((step) => step.tabId === 'program');
        expect(programStep?.title).toContain('Программа 1С/УП');
        expect(programStep?.tabNavHighlightTabId).toBe('program');
        expect(programStep?.selectors?.[0]).toBe('#programTab');
        const trainingBodyStep = blueprints.find(
            (step) => step.title === 'Обучение: содержимое раздела',
        );
        expect(trainingBodyStep?.tabNavHighlightTabId).toBe('training');
        expect(trainingBodyStep?.description || '').not.toMatch(/локально/i);
        expect(blueprints.some((step) => step.title.includes('Палитра команд'))).toBe(true);
        expect(blueprints.some((step) => step.title.includes('Настройки приложения'))).toBe(true);
        expect(blueprints.some((step) => step.title.includes('Мастер слияния баз данных'))).toBe(
            true,
        );
        expect(sectionsOrderStep?.selectors?.[0]).toBe('#panelSortContainer');
        expect(timerButtonsStep?.highlightGroupSelectors).toEqual([
            '#timerDecreaseButton',
            '#timerIncreaseButton',
        ]);
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
            querySelector: (selector) =>
                selector === '#blacklistedClientsTab' ? elementMock : null,
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

    it('detects popover side relative to highlighted element', () => {
        const detect = __onboardingTourInternals.detectPopoverSide;
        const elementRect = {
            top: 200,
            bottom: 260,
            left: 200,
            right: 320,
            width: 120,
            height: 60,
        };

        expect(
            detect(elementRect, {
                top: 80,
                bottom: 160,
                left: 180,
                right: 360,
                width: 180,
                height: 80,
            }),
        ).toBe('top');
        expect(
            detect(elementRect, {
                top: 280,
                bottom: 360,
                left: 180,
                right: 360,
                width: 180,
                height: 80,
            }),
        ).toBe('bottom');
        expect(
            detect(elementRect, {
                top: 180,
                bottom: 300,
                left: 20,
                right: 160,
                width: 140,
                height: 120,
            }),
        ).toBe('left');
        expect(
            detect(elementRect, {
                top: 180,
                bottom: 300,
                left: 360,
                right: 500,
                width: 140,
                height: 120,
            }),
        ).toBe('right');
    });

    it('syncs arrow using popover rect, not parent rect', () => {
        const arrow = {
            className: '',
            classList: { add: vi.fn() },
            removeAttribute: vi.fn(),
            style: {},
        };
        const popoverRect = {
            top: 100,
            left: 100,
            right: 400,
            bottom: 220,
            width: 300,
            height: 120,
        };
        const elementRect = { top: 240, left: 200, right: 260, bottom: 300, width: 60, height: 60 };

        const popover = {
            querySelector: (selector) => (selector === '.driver-popover-arrow' ? arrow : null),
            getBoundingClientRect: () => popoverRect,
        };
        const parent = {
            getBoundingClientRect: () => ({
                top: 0,
                left: 0,
                right: 1920,
                bottom: 1080,
                width: 1920,
                height: 1080,
            }),
        };
        popover.parentElement = parent;

        const highlightedElement = { getBoundingClientRect: () => elementRect };
        globalThis.document = {
            querySelector: (selector) => {
                if (selector === '.driver-popover.onboarding-tour-popover') return popover;
                if (selector === '.driver-popover') return popover;
                return null;
            },
            body: { classList: { remove: vi.fn() } },
        };

        __onboardingTourInternals.syncPopoverArrowToElement(highlightedElement);
        expect(arrow.style.left).toBeDefined();
        expect(arrow.style.left).not.toBe('');
    });

    it('resolveVisibleTabNavTarget prefers visible tab, else кнопка «Ещё»', () => {
        const resolve = __onboardingTourInternals.resolveVisibleTabNavTarget;
        const visibleTab = {
            id: 'trainingTab',
            getClientRects: () => /** @type {any} */ ([{ width: 1 }]),
        };
        globalThis.document = {
            getElementById: (id) => (id === 'trainingTab' ? visibleTab : null),
            body: { classList: { remove: vi.fn() } },
        };
        expect(resolve('training')).toBe(visibleTab);

        const hiddenTab = {
            id: 'trainingTab',
            getClientRects: () => [],
        };
        const moreBtn = {
            id: 'moreTabsBtn',
            getClientRects: () => /** @type {any} */ ([{ width: 1 }]),
            parentElement: {
                classList: {
                    contains: () => false,
                },
            },
        };
        globalThis.document = {
            getElementById: (id) => {
                if (id === 'trainingTab') return hiddenTab;
                if (id === 'moreTabsBtn') return moreBtn;
                return null;
            },
            body: { classList: { remove: vi.fn() } },
        };
        expect(resolve('training')).toBe(moreBtn);
    });
});
