import { describe, it, expect, beforeEach } from 'vitest';
import { initThemeToggle, setThemeToggleDependencies } from './theme-toggle.js';

describe('theme-toggle: цикл темы идёт от выбранного режима, а не от разрешённого', () => {
    let calls;
    beforeEach(() => {
        calls = [];
        document.body.innerHTML = '<button id="themeToggle"></button>';
    });

    const click = async (stored, resolved) => {
        document.documentElement.dataset.theme = resolved;
        const State = { userPreferences: { theme: stored } };
        setThemeToggleDependencies({
            State,
            DEFAULT_UI_SETTINGS: { themeMode: 'dark' },
            setTheme: (t) => {
                calls.push(t);
                State.userPreferences.theme = t;
            },
            saveUserPreferences: async () => true,
            showNotification: () => {},
        });
        const fresh = document.getElementById('themeToggle').cloneNode(true);
        document.getElementById('themeToggle').replaceWith(fresh);
        initThemeToggle();
        fresh.click();
        await new Promise((r) => setTimeout(r, 20));
    };

    it('dark → light', async () => {
        await click('dark', 'dark');
        expect(calls).toEqual(['light']);
    });
    it('light → auto', async () => {
        await click('light', 'light');
        expect(calls).toEqual(['auto']);
    });
    it('auto (на экране light) → dark, а не снова auto', async () => {
        await click('auto', 'light');
        expect(calls).toEqual(['dark']);
    });
    it('auto (на экране dark) → dark', async () => {
        await click('auto', 'dark');
        expect(calls).toEqual(['dark']);
    });
});
