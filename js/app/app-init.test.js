'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAppInitDependencies, appInit } from './app-init.js';

function createDomHarness() {
    const documentListeners = new Map();
    const favoritesContainer = {
        _listeners: new Map(),
        addEventListener: vi.fn((type, handler) => {
            favoritesContainer._listeners.set(type, handler);
        }),
        removeEventListener: vi.fn((type) => {
            favoritesContainer._listeners.delete(type);
        }),
    };
    const favoritesHeaderBtn = {
        _clickHandlerInstance: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    const remindersHeaderBtn = {
        _clickHandlerInstance: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };

    const documentMock = {
        body: {},
        addEventListener: vi.fn((type, handler, capture = false) => {
            documentListeners.set(`${type}:${capture ? 'capture' : 'bubble'}`, handler);
        }),
        removeEventListener: vi.fn((type, _handler, capture = false) => {
            documentListeners.delete(`${type}:${capture ? 'capture' : 'bubble'}`);
        }),
        getElementById: vi.fn((id) => {
            if (id === 'showFavoritesHeaderBtn') return favoritesHeaderBtn;
            if (id === 'showRemindersHeaderBtn') return remindersHeaderBtn;
            if (id === 'favoritesContainer') return favoritesContainer;
            return null;
        }),
    };

    return {
        documentMock,
        favoritesContainer,
        favoritesHeaderBtn,
        remindersHeaderBtn,
        documentListeners,
    };
}

function setMinimalDependencies(overrides = {}) {
    setAppInitDependencies({
        NotificationService: { init: vi.fn(), add: vi.fn() },
        initDB: vi.fn(async () => {}),
        loadInitialFavoritesCache: vi.fn(async () => {}),
        handleFavoriteActionClick: vi.fn(),
        handleFavoriteContainerClick: vi.fn(),
        setActiveTab: vi.fn(),
        loadUserPreferences: vi.fn(async () => {}),
        loadCategoryInfo: vi.fn(async () => {}),
        loadFromIndexedDB: vi.fn(async () => {}),
        ensureSearchIndexIsBuilt: vi.fn(async () => {}),
        checkAndBuildIndex: vi.fn(async () => {}),
        setSearchDependencies: vi.fn(),
        setCommandPaletteDependencies: vi.fn(),
        initSearchSystem: vi.fn(),
        ...overrides,
    });
}

describe('appInit favorites wiring', () => {
    let originalDocument;
    let originalWindow;
    let originalRequestAnimationFrame;

    beforeEach(() => {
        originalDocument = globalThis.document;
        originalWindow = globalThis.window;
        originalRequestAnimationFrame = globalThis.requestAnimationFrame;

        const { documentMock } = createDomHarness();
        globalThis.document = documentMock;
        globalThis.window = {};
        globalThis.requestAnimationFrame = (cb) => {
            cb();
            return 0;
        };

        setMinimalDependencies();
    });

    afterEach(() => {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        vi.restoreAllMocks();
    });

    it('attaches click handler to favorites container during app init', async () => {
        const handler = vi.fn();
        setMinimalDependencies({
            handleFavoriteContainerClick: handler,
        });

        await appInit('test');

        const favoritesContainer = globalThis.document.getElementById('favoritesContainer');
        expect(favoritesContainer.removeEventListener).toHaveBeenCalledWith('click', handler);
        expect(favoritesContainer.addEventListener).toHaveBeenCalledWith('click', handler);
    });
});
