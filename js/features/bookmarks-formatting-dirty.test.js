import { afterEach, expect, it, vi } from 'vitest';
import { mountBookmarkRichEditor } from './bookmark-rich-editor.js';
import { initFormModalAutoEnhance } from '../ui/form-modal-autoenhance.js';
import { shouldConfirmBeforeClose } from '../ui/unsaved-changes-registry.js';

let editor;
afterEach(() => {
    editor?.destroy();
    document.body.replaceChildren();
    vi.useRealTimers();
});

it('protects formatting immediately on opening, before the shared delayed baseline can absorb edits', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
        '<div id="bookmarkModal" class="hidden"><h2 id="bookmarkModalTitle">Закладка</h2><form><textarea name="bookmarkDescription">Same text</textarea></form></div>';
    const modal = document.querySelector('#bookmarkModal');
    editor = mountBookmarkRichEditor(modal.querySelector('form'));
    initFormModalAutoEnhance();
    modal.classList.remove('hidden');
    await Promise.resolve();
    expect(shouldConfirmBeforeClose(modal)).toBe(false);
    editor.editable.innerHTML = '<p><b>Same text</b></p>';
    editor.editable.dispatchEvent(new Event('input', { bubbles: true }));
    expect(shouldConfirmBeforeClose(modal)).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(shouldConfirmBeforeClose(modal)).toBe(true);
});
