'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    setAlgorithmModalControlDependencies,
    initAlgorithmModalControls,
} from './algorithm-modal-controls.js';

describe('initAlgorithmModalControls — кнопка «Редактировать» в модалке деталей алгоритма', () => {
    let editAlgorithm;
    let algorithmModal;
    let editAlgorithmBtn;
    let deleteAlgorithmBtn;

    beforeEach(() => {
        editAlgorithm = vi.fn().mockResolvedValue(undefined);
        algorithmModal = {
            dataset: { currentAlgorithmId: '7', currentSection: 'program' },
        };
        editAlgorithmBtn = {
            addEventListener: vi.fn((type, handler) => {
                if (type === 'click') editAlgorithmBtn._handler = handler;
            }),
            removeEventListener: vi.fn(),
            _editFromDetailHandler: null,
        };
        deleteAlgorithmBtn = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            _clickHandler: null,
        };

        globalThis.document = {
            getElementById: vi.fn((id) => {
                if (id === 'algorithmModal') return algorithmModal;
                if (id === 'editAlgorithmBtn') return editAlgorithmBtn;
                if (id === 'closeModalBtn') return { addEventListener: vi.fn() };
                if (id === 'editMainBtn') return { addEventListener: vi.fn() };
                if (id === 'deleteAlgorithmBtn') return deleteAlgorithmBtn;
                if (id === 'exportMainBtn') return null;
                return null;
            }),
        };

        setAlgorithmModalControlDependencies({
            editAlgorithm,
            deleteAlgorithm: vi.fn(),
            showNotification: vi.fn(),
            ExportService: {},
            closeAnimatedModal: vi.fn(),
            showAppConfirm: vi.fn(),
            showAddModal: vi.fn(),
        });

        initAlgorithmModalControls();
    });

    it('вызывает editAlgorithm с id и section из dataset модалки', async () => {
        expect(editAlgorithmBtn._handler).toBeDefined();
        await editAlgorithmBtn._handler();
        expect(editAlgorithm).toHaveBeenCalledTimes(1);
        expect(editAlgorithm).toHaveBeenCalledWith('7', 'program');
    });

    it('не вызывает editAlgorithm при пустом dataset', async () => {
        algorithmModal.dataset.currentAlgorithmId = '';
        algorithmModal.dataset.currentSection = 'program';
        editAlgorithm.mockClear();
        await editAlgorithmBtn._handler();
        expect(editAlgorithm).not.toHaveBeenCalled();
    });
});
