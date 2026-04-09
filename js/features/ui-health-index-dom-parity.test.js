/** @vitest-environment node */
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';
import { INDEX_HTML_UNIQUE_ELEMENT_IDS } from './ui-health-index-ids.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, '..', '..', 'index.html');

describe('ui-health-index vs index.html (паритет DOM)', () => {
    it('каждый id из INDEX_HTML_UNIQUE_ELEMENT_IDS находится в полном JSDOM-парсере index.html', () => {
        const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
        const dom = new JSDOM(html, { url: 'http://localhost/' });
        const doc = dom.window.document;
        const missing = INDEX_HTML_UNIQUE_ELEMENT_IDS.filter((id) => !doc.getElementById(id));
        expect(missing, `Отсутствуют в DOM: ${missing.join(', ')}`).toEqual([]);
    });
});
