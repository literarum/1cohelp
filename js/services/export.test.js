'use strict';

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { extractPdfContent } from './export.js';

describe('extractPdfContent', () => {
    it('includes data-URL images from bookmark-style .export-pdf-image-container', () => {
        const root = document.createElement('div');
        root.innerHTML = `
      <h1>Title</h1>
      <div class="bookmark-screenshots">
        <div class="export-pdf-image-container">
          <img alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" />
        </div>
      </div>
    `;

        const blocks = extractPdfContent(root);
        const withImages = blocks.filter((b) => b.type === 'block' && b.images?.length);
        expect(withImages.length).toBe(1);
        expect(withImages[0].images[0]).toMatch(/^data:image\/png;/);
    });

    it('still collects images inside .algorithm-step without duplicate blocks from inner container', () => {
        const root = document.createElement('div');
        const step = document.createElement('div');
        step.className = 'algorithm-step';
        const h = document.createElement('h4');
        h.textContent = 'Шаг 1';
        step.appendChild(h);
        const container = document.createElement('div');
        container.className = 'export-pdf-image-container';
        const img = document.createElement('img');
        img.src =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        container.appendChild(img);
        step.appendChild(container);
        root.appendChild(step);

        const blocks = extractPdfContent(root);
        const imageBlocks = blocks.filter((b) => b.type === 'block' && b.images?.length);
        expect(imageBlocks.length).toBe(1);
        expect(imageBlocks[0].images.length).toBe(1);
    });
});
