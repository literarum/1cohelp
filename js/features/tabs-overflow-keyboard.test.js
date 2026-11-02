/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { setupTabsOverflow } from './tabs-overflow.js';

it('closes the open overflow with Escape and returns keyboard focus to its button', () => {
    document.body.innerHTML = '<button id="moreTabsBtn">More</button><div id="moreTabsDropdown"><a href="#">Long label</a></div>';
    setupTabsOverflow();
    document.querySelector('a').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('moreTabsDropdown').classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('moreTabsBtn'));
    document.body.replaceChildren();
});

it('yields Escape when a foreground dialog has keyboard focus', () => {
    document.body.innerHTML = '<button id="moreTabsBtn">More</button><div id="moreTabsDropdown"><a href="#">Long label</a></div><div role="dialog"><input id="paletteSearch"></div>';
    setupTabsOverflow();
    const input = document.getElementById('paletteSearch');
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('moreTabsDropdown').classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(input);
    document.body.replaceChildren();
});
