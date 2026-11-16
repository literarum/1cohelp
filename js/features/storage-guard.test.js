import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    describeChangedStores,
    formatBytes,
    evaluateQuota,
    handleChannelMessage,
    initStorageGuard,
    ensurePersistentStorage,
    __resetStorageGuardForTests,
    __getTabIdForTests,
} from './storage-guard.js';

describe('storage-guard', () => {
    beforeEach(() => __resetStorageGuardForTests());

    it('formatBytes', () => {
        expect(formatBytes(512)).toBe('512 Б');
        expect(formatBytes(1536).replace(/\s/g, ' ')).toBe('1,5 КБ');
        expect(formatBytes(5 * 1024 * 1024)).toMatch(/^5 МБ$/);
        expect(formatBytes(-1)).toBe('—');
    });

    it('evaluateQuota', () => {
        expect(evaluateQuota({ usage: 90, quota: 100 }).warn).toBe(true);
        expect(evaluateQuota({ usage: 10, quota: 100 }).warn).toBe(false);
        expect(evaluateQuota({ usage: 1, quota: 0 })).toBeNull();
        expect(evaluateQuota(null)).toBeNull();
    });

    it('describeChangedStores убирает повторы', () => {
        expect(describeChangedStores(['clientAnalyticsRecords', 'clientAnalyticsTags', 'bookmarks'])).toBe(
            'база клиентов, закладки',
        );
    });

    it('запись в соседней вкладке показывает предупреждение с кнопкой обновления', () => {
        const notify = vi.fn();
        initStorageGuard({ notify });
        handleChannelMessage({ type: 'write', from: 'other', stores: ['searchIndex'] });
        expect(notify).not.toHaveBeenCalled();
        handleChannelMessage({ type: 'write', from: 'other', stores: ['algorithms'] });
        expect(notify).toHaveBeenCalledOnce();
        const [msg, type, opts] = notify.mock.calls[0];
        expect(type).toBe('warning');
        expect(msg).toContain('алгоритмы');
        expect(opts.actions[0].label).toBe('Обновить вкладку');
    });

    it('свои сообщения игнорируются', () => {
        const notify = vi.fn();
        initStorageGuard({ notify });
        handleChannelMessage({ type: 'write', from: __getTabIdForTests(), stores: ['algorithms'] });
        expect(notify).not.toHaveBeenCalled();
    });

    it('ensurePersistentStorage запрашивает persist, если ещё не выдано', async () => {
        const persist = vi.fn().mockResolvedValue(true);
        vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false), persist } });
        expect(await ensurePersistentStorage()).toBe(true);
        expect(persist).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });
});
