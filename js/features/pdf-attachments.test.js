/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';

import {
    buildPdfFilenameFromBasename,
    getPdfDropContentRoot,
    isPdfModalSaveFocusTarget,
    PDF_DND_INNER_CLASS,
    setupPdfDragAndDrop,
    splitPdfFilenameParts,
} from './pdf-attachments.js';

function fireFileDrag(shell, type, relatedTarget) {
    const dt = {
        types: ['Files'],
        dropEffect: 'none',
        effectAllowed: 'all',
        files: [],
        items: [],
    };
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: dt, enumerable: true });
    Object.defineProperty(e, 'relatedTarget', { value: relatedTarget ?? null, enumerable: true });
    shell.dispatchEvent(e);
}

describe('splitPdfFilenameParts', () => {
    it('splits trailing .pdf case-insensitively and preserves suffix casing', () => {
        expect(splitPdfFilenameParts('report.pdf')).toEqual({ base: 'report', suffix: '.pdf' });
        expect(splitPdfFilenameParts('report.PDF')).toEqual({ base: 'report', suffix: '.PDF' });
        expect(splitPdfFilenameParts('a.PdF')).toEqual({ base: 'a', suffix: '.PdF' });
    });

    it('treats only a final .pdf as extension', () => {
        expect(splitPdfFilenameParts('one.two.pdf')).toEqual({ base: 'one.two', suffix: '.pdf' });
    });

    it('defaults suffix to .pdf when filename has no pdf extension', () => {
        expect(splitPdfFilenameParts('notes')).toEqual({ base: 'notes', suffix: '.pdf' });
    });

    it('trims and handles empty input', () => {
        expect(splitPdfFilenameParts('  x.pdf  ')).toEqual({ base: 'x', suffix: '.pdf' });
        expect(splitPdfFilenameParts('')).toEqual({ base: '', suffix: '.pdf' });
        expect(splitPdfFilenameParts(null)).toEqual({ base: '', suffix: '.pdf' });
    });
});

describe('buildPdfFilenameFromBasename', () => {
    it('appends original suffix casing from stored filename', () => {
        expect(buildPdfFilenameFromBasename('new', 'old.PDF')).toBe('new.PDF');
    });

    it('strips accidental .pdf from basename before merge', () => {
        expect(buildPdfFilenameFromBasename('x.pdf', 'old.pdf')).toBe('x.pdf');
        expect(buildPdfFilenameFromBasename('  y.PDF  ', 'z.pdf')).toBe('y.pdf');
    });

    it('uses file as stem when basename empty', () => {
        expect(buildPdfFilenameFromBasename('', 'a.pdf')).toBe('file.pdf');
        expect(buildPdfFilenameFromBasename('   ', 'b.pdf')).toBe('file.pdf');
    });

    it('respects 180-char total limit via basename truncation', () => {
        const long = 'a'.repeat(200);
        const out = buildPdfFilenameFromBasename(long, 'seed.pdf');
        expect(out.length).toBe(180);
        expect(out.endsWith('.pdf')).toBe(true);
    });
});

describe('isPdfModalSaveFocusTarget', () => {
    it('returns true for save buttons and bookmark submit by id or form attribute', () => {
        const a = document.createElement('button');
        a.id = 'saveBookmarkBtn';
        expect(isPdfModalSaveFocusTarget(a)).toBe(true);

        const b = document.createElement('button');
        b.id = 'saveAlgorithmBtn';
        expect(isPdfModalSaveFocusTarget(b)).toBe(true);

        const c = document.createElement('button');
        c.type = 'submit';
        c.setAttribute('form', 'bookmarkForm');
        expect(isPdfModalSaveFocusTarget(c)).toBe(true);
    });

    it('returns true when the target is inside a matching control', () => {
        const btn = document.createElement('button');
        btn.id = 'saveBookmarkBtn';
        const icon = document.createElement('i');
        btn.appendChild(icon);
        expect(isPdfModalSaveFocusTarget(icon)).toBe(true);
    });

    it('returns false for unrelated elements and null', () => {
        expect(isPdfModalSaveFocusTarget(null)).toBe(false);
        const x = document.createElement('button');
        x.type = 'button';
        x.id = 'cancel-modal-btn-hook';
        expect(isPdfModalSaveFocusTarget(x)).toBe(false);
    });
});

describe('setupPdfDragAndDrop / getPdfDropContentRoot', () => {
    it('creates inner wrapper and keeps overlay in shell when inner is cleared', () => {
        const shell = document.createElement('div');
        document.body.appendChild(shell);
        setupPdfDragAndDrop(shell, () => {});
        const inner = shell.querySelector(`.${PDF_DND_INNER_CLASS}`);
        const overlay = shell.querySelector('.pdf-drop-overlay');
        expect(inner).toBeTruthy();
        expect(overlay).toBeTruthy();
        expect(getPdfDropContentRoot(shell)).toBe(inner);
        inner.innerHTML = '<p>list</p>';
        expect(shell.contains(overlay)).toBe(true);
        expect(overlay.parentElement).toBe(shell);
    });

    it('shows and hides drop highlight using relatedTarget-safe enter/leave', () => {
        const shell = document.createElement('div');
        const outside = document.createElement('div');
        document.body.appendChild(outside);
        document.body.appendChild(shell);
        setupPdfDragAndDrop(shell, () => {});

        fireFileDrag(shell, 'dragenter', outside);
        expect(shell.classList.contains('pdf-drop-target-active')).toBe(true);
        expect(shell.getAttribute('data-pdf-dropping')).toBe('true');

        const inner = shell.querySelector(`.${PDF_DND_INNER_CLASS}`);
        const child = document.createElement('span');
        inner.appendChild(child);
        fireFileDrag(shell, 'dragenter', child);
        expect(shell.classList.contains('pdf-drop-target-active')).toBe(true);

        fireFileDrag(shell, 'dragleave', outside);
        expect(shell.classList.contains('pdf-drop-target-active')).toBe(false);
        expect(shell.hasAttribute('data-pdf-dropping')).toBe(false);
    });

    it('hides inner content while drop highlight is active (only overlay message remains meaningful)', () => {
        const style = document.createElement('style');
        style.textContent = `
          .pdf-dnd-inner { opacity: 1; visibility: visible; transition: opacity 0.2s ease, visibility 0.2s ease; }
          .pdf-drop-target-active > .pdf-dnd-inner { opacity: 0; visibility: hidden; pointer-events: none; }
        `;
        document.head.appendChild(style);

        const shell = document.createElement('div');
        const outside = document.createElement('div');
        document.body.appendChild(outside);
        document.body.appendChild(shell);
        setupPdfDragAndDrop(shell, () => {});
        const inner = shell.querySelector(`.${PDF_DND_INNER_CLASS}`);
        inner.innerHTML = '<p data-testid="filler">visible list</p>';

        fireFileDrag(shell, 'dragenter', outside);
        const hidden = window.getComputedStyle(inner);
        expect(hidden.opacity).toBe('0');
        expect(hidden.visibility).toBe('hidden');

        fireFileDrag(shell, 'dragleave', outside);
        const shown = window.getComputedStyle(inner);
        expect(shown.visibility).toBe('visible');
        expect(parseFloat(shown.opacity)).toBe(1);
    });
});
