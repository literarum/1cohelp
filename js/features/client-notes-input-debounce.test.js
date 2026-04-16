import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../utils/helpers.js';
import {
    buildClientNotesInputCompositeHandler,
    CLIENT_NOTES_BLACKLIST_DEBOUNCE_MS,
    CLIENT_NOTES_SAVE_DEBOUNCE_MS,
} from './client-notes-input-debounce.js';

describe('client-notes input debounce (ЧС vs автосохранение)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('вызывает проверку ЧС раньше, чем автосохранение', async () => {
        const save = vi.fn(async () => {});
        const blacklist = vi.fn(async () => {});
        const el = { value: '1234567890' };
        const handler = buildClientNotesInputCompositeHandler(
            debounce,
            el,
            '[test]',
            save,
            blacklist,
        );

        handler();
        await vi.advanceTimersByTimeAsync(CLIENT_NOTES_BLACKLIST_DEBOUNCE_MS - 1);
        expect(blacklist).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2);
        expect(blacklist).toHaveBeenCalledTimes(1);
        expect(save).not.toHaveBeenCalled();

        const remaining = CLIENT_NOTES_SAVE_DEBOUNCE_MS - CLIENT_NOTES_BLACKLIST_DEBOUNCE_MS;
        await vi.advanceTimersByTimeAsync(remaining);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('сбрасывает оба таймера при повторном вводе до срабатывания', async () => {
        const save = vi.fn(async () => {});
        const blacklist = vi.fn(async () => {});
        const el = { value: 'x' };
        const handler = buildClientNotesInputCompositeHandler(
            debounce,
            el,
            '[test]',
            save,
            blacklist,
        );

        handler();
        await vi.advanceTimersByTimeAsync(100);
        handler();
        await vi.advanceTimersByTimeAsync(CLIENT_NOTES_BLACKLIST_DEBOUNCE_MS - 1);
        expect(blacklist).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2);
        expect(blacklist).toHaveBeenCalledTimes(1);
    });
});
