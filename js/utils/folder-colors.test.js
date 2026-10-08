import { describe, it, expect } from 'vitest';
import {
    FOLDER_PALETTE,
    normalizeFolderColor,
    folderColorHex,
    folderColorStyle,
    folderColorSortIndex,
    renderFolderColorPicker,
    setFolderColorInPicker,
} from './folder-colors.js';

describe('folder-colors', () => {
    it('в палитре не меньше 20 уникальных цветов, старые 11 id сохранены', () => {
        expect(FOLDER_PALETTE.length).toBeGreaterThanOrEqual(20);
        expect(new Set(FOLDER_PALETTE.map((c) => c.id)).size).toBe(FOLDER_PALETTE.length);
        for (const id of ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'rose']) {
            expect(FOLDER_PALETTE.some((c) => c.id === id)).toBe(true);
        }
    });

    it('normalizeFolderColor: id, #rrggbb, #rgb, старые bg-*-500 и мусор', () => {
        expect(normalizeFolderColor('red')).toBe('red');
        expect(normalizeFolderColor('bg-emerald-500')).toBe('emerald');
        expect(normalizeFolderColor('#ABCDEF')).toBe('#abcdef');
        expect(normalizeFolderColor('#0af')).toBe('#00aaff');
        expect(normalizeFolderColor('javascript:alert(1)')).toBe('gray');
        expect(normalizeFolderColor('#12345')).toBe('gray');
        expect(normalizeFolderColor(null)).toBe('gray');
    });

    it('folderColorStyle не пропускает ничего, кроме валидного hex', () => {
        expect(folderColorStyle('red')).toBe('--fc:#dc2626');
        expect(folderColorStyle('#12ab9c')).toBe('--fc:#12ab9c');
        expect(folderColorStyle('red;background:url(x)')).toBe('--fc:#6b7280');
        expect(folderColorHex('unknown')).toBe('#6b7280');
    });

    it('сортировка: красный раньше зелёного, серый в конце, свой цвет перед серым', () => {
        expect(folderColorSortIndex('red')).toBeLessThan(folderColorSortIndex('green'));
        expect(folderColorSortIndex('#123456')).toBeLessThan(folderColorSortIndex('gray'));
    });

    it('пикер: рисует палитру + «свой цвет», выбранный цвет отмечается; setFolderColorInPicker работает и для hex', () => {
        const host = document.createElement('div');
        host.innerHTML = renderFolderColorPicker('folderColor', 'teal');
        expect(host.querySelectorAll('input[name="folderColor"]').length).toBe(FOLDER_PALETTE.length + 1);
        expect(host.querySelector('input[name="folderColor"]:checked').value).toBe('teal');
        setFolderColorInPicker(host, 'folderColor', '#12ab9c');
        expect(host.querySelector('input[name="folderColor"]:checked').value).toBe('#12ab9c');
        setFolderColorInPicker(host, 'folderColor', 'red');
        expect(host.querySelector('input[name="folderColor"]:checked').value).toBe('red');
    });
});
