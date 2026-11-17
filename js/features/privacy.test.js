import { describe, it, expect, beforeEach } from 'vitest';
import { setPin, verifyPin, isValidPin, readLockConfig, disableLock, lockNow, isLocked, setPrivacyMode, isPrivacyMode, hashPin } from './privacy.js';

describe('privacy', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="appContent"></div>';
    });
    it('isValidPin', () => {
        expect(isValidPin('1234')).toBe(true);
        expect(isValidPin('123')).toBe(false);
        expect(isValidPin('12a4')).toBe(false);
        expect(isValidPin('123456789')).toBe(false);
    });
    it('PIN хранится только как хэш, проверка работает', async () => {
        await setPin('4821');
        const raw = localStorage.getItem('copilot.lock.v1');
        expect(raw).not.toContain('4821');
        expect(await verifyPin('4821')).toBe(true);
        expect(await verifyPin('0000')).toBe(false);
        expect(readLockConfig().idleMinutes).toBe(15);
    }, 20000);
    it('хэш зависит от соли', async () => {
        const a = await hashPin('1111', new Uint8Array(16).fill(1), 1000);
        const b = await hashPin('1111', new Uint8Array(16).fill(2), 1000);
        expect(a).not.toBe(b);
    });
    it('блокировка делает приложение inert; без PIN не блокирует', async () => {
        expect(lockNow()).toBe(false);
        await setPin('4821');
        expect(lockNow()).toBe(true);
        expect(isLocked()).toBe(true);
        expect(document.getElementById('appContent').hasAttribute('inert')).toBe(true);
        expect(document.getElementById('appLockScreen')).toBeTruthy();
        disableLock();
    }, 20000);
    it('режим демонстрации: класс и плашка', () => {
        setPrivacyMode(true);
        expect(isPrivacyMode()).toBe(true);
        expect(document.getElementById('privacyModeBanner')).toBeTruthy();
        setPrivacyMode(false);
        expect(document.getElementById('privacyModeBanner')).toBeNull();
    });
});
