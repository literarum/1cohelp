'use strict';

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(__dirname, '..', '..', 'manifest.webmanifest');

function loadManifest() {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

describe('manifest.webmanifest (PWA installability baseline)', () => {
    it('does not set prefer_related_applications to true', () => {
        const m = loadManifest();
        expect(m.prefer_related_applications).not.toBe(true);
    });

    it('uses standalone display without display_override (Chromium-family compatibility)', () => {
        const m = loadManifest();
        expect(m.display).toBe('standalone');
        expect(m.display_override).toBeUndefined();
    });

    it('omits manifest id so identity defaults to start_url (avoids relative-id edge cases)', () => {
        const m = loadManifest();
        expect(m.id).toBeUndefined();
    });

    it('includes 192 and 512 PNG icons', () => {
        const m = loadManifest();
        const sizes = new Set();
        for (const ic of m.icons || []) {
            if (ic && typeof ic.sizes === 'string') {
                for (const s of ic.sizes.split(/\s+/)) {
                    sizes.add(s.trim());
                }
            }
        }
        expect(sizes.has('192x192')).toBe(true);
        expect(sizes.has('512x512')).toBe(true);
    });

    it('resolves start_url within scope relative to manifest URL', () => {
        const m = loadManifest();
        const manifestUrl = new URL('manifest.webmanifest', 'https://pwa-verify.invalid/');
        const resolvedStart = new URL(m.start_url, manifestUrl);
        const resolvedScope = new URL(m.scope, manifestUrl);
        expect(resolvedStart.origin).toBe(resolvedScope.origin);
        const scopePath = resolvedScope.pathname.endsWith('/')
            ? resolvedScope.pathname
            : `${resolvedScope.pathname}/`;
        expect(
            resolvedStart.pathname.startsWith(scopePath) ||
                resolvedStart.pathname === scopePath.replace(/\/$/, '') ||
                (scopePath === '/' && resolvedStart.pathname.startsWith('/')),
        ).toBe(true);
    });
});
