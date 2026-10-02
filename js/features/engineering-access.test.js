import { describe, it, expect } from 'vitest';
import { isEngineeringPassword, ENGINEERING_PASSWORD_SHA256 } from './engineering-access.js';

describe('engineering-access', () => {
    it('верный пароль принимается (с пробелами по краям), неверный — нет', () => {
        expect(isEngineeringPassword('05213587')).toBe(true);
        expect(isEngineeringPassword('  05213587 ')).toBe(true);
        expect(isEngineeringPassword('05213588')).toBe(false);
        expect(isEngineeringPassword('')).toBe(false);
        expect(isEngineeringPassword(null)).toBe(false);
    });
    it('в модуле нет открытого текста пароля', () => {
        expect(ENGINEERING_PASSWORD_SHA256).toMatch(/^[0-9a-f]{64}$/);
        expect(isEngineeringPassword.toString()).not.toContain('05213587');
    });
});
