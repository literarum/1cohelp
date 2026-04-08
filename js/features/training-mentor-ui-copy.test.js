'use strict';

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel) {
    return readFileSync(join(here, rel), 'utf8');
}

describe('training mentor / modal copy (contract)', () => {
    it('training-ui-modals: no «локально» hints in manual card and weak-note modals', () => {
        const src = read('training-ui-modals.js');
        expect(src).not.toContain('Локально, только на этом устройстве');
        expect(src).not.toContain('Сохраняется только локально.');
    });

    it('training.js: publish label and hero copy without «локально»', () => {
        const src = read('training.js');
        expect(src).toContain('>Отправить в учебник<');
        expect(src).not.toMatch(/data-training-mentor-publish[^>]*>В учебник</);
        expect(src).not.toContain('сохраняете их локально');
        expect(src).toContain('«Отправить в учебник»');
    });

    it('training.js: mentor row uses icon-only edit/delete with pen and trash', () => {
        const src = read('training.js');
        expect(src).toContain('data-training-mentor-edit');
        expect(src).toContain('fa-pen');
        expect(src).toContain('data-training-mentor-delete');
        expect(src).toContain('fa-trash-alt');
        expect(src).not.toMatch(/data-training-mentor-edit[^>]*>Изменить</);
        expect(src).not.toMatch(/data-training-mentor-delete[^>]*>Удалить</);
    });
});
