import { describe, it, expect } from 'vitest';
import { formatHotkey, hotkeyHintFor, isMacPlatform } from './hotkey-hints.js';

describe('подсказки горячих клавиш в палитре', () => {
    it('Windows/Linux — как записано', () => {
        expect(hotkeyHintFor('action:toggleTheme', false)).toBe('Alt+T');
        expect(hotkeyHintFor('action:unknown', false)).toBe('');
    });
    it('macOS — символы; Ctrl+Shift → ⌘, Ctrl+Alt → ⌃⌥', () => {
        expect(formatHotkey('Ctrl+Shift+D', true)).toBe('⌘⇧D');
        expect(formatHotkey('Ctrl+Alt+T', true)).toBe('⌃⌥T');
        expect(formatHotkey('Ctrl+Shift+Backspace', true)).toBe('⌘⇧⌫');
        expect(formatHotkey('Alt+Shift+S', true)).toBe('⌥⇧S');
    });
    it('определение платформы', () => {
        expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
        expect(isMacPlatform({ userAgentData: { platform: 'Windows' } })).toBe(false);
    });
});
