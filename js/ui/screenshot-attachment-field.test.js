'use strict';

import { describe, it, expect } from 'vitest';
import { SCREENSHOT_EDIT_FIELD } from './screenshot-attachment-field.js';

describe('SCREENSHOT_EDIT_FIELD', () => {
    it('exposes shared classes for bookmark and step handlers', () => {
        expect(SCREENSHOT_EDIT_FIELD.addBtnBookmark).toContain('add-bookmark-screenshot-btn');
        expect(SCREENSHOT_EDIT_FIELD.addBtnStep).toContain('add-screenshot-btn');
        expect(SCREENSHOT_EDIT_FIELD.dropzone).toContain('app-screenshot-field__dropzone');
        expect(SCREENSHOT_EDIT_FIELD.wrapperCard).toContain('rounded-xl');
    });
});
