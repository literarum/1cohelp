// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    wrapBackup,
    parseEnvelope,
    unwrapEnvelope,
    unwrapBackupText,
    deriveBackupKey,
    newSalt,
    BackupPasswordError,
    isEncryptedEnvelope,
} from './backup-envelope.js';

const sample = JSON.stringify({ schemaVersion: '1', data: { bookmarks: [{ id: 1, title: 'Тест ИНН 7707083893' }], notes: 'x'.repeat(5000) } });
const FAST = { iterations: 1000 }; // в тестах быстрее; в приложении 600 000

describe('backup-envelope', () => {
    it('обычный JSON проходит без изменений', async () => {
        expect(parseEnvelope(sample)).toBeNull();
        expect(await unwrapBackupText(sample)).toBe(sample);
    });
    it('gzip без шифрования: меньше исходного и восстанавливается побайтно', async () => {
        const wrapped = await wrapBackup(sample, { compress: true });
        const env = parseEnvelope(wrapped);
        expect(env.compression).toBe('gzip');
        expect(env.payload.length).toBeLessThan(sample.length);
        expect(await unwrapEnvelope(env)).toBe(sample);
    });
    it('шифрование паролем: верный пароль открывает, неверный — BackupPasswordError', async () => {
        const wrapped = await wrapBackup(sample, { password: 'correct horse', ...FAST });
        const env = parseEnvelope(wrapped);
        expect(isEncryptedEnvelope(env)).toBe(true);
        expect(wrapped).not.toContain('7707083893');
        expect(await unwrapEnvelope(env, { password: 'correct horse' })).toBe(sample);
        await expect(unwrapEnvelope(env, { password: 'wrong' })).rejects.toBeInstanceOf(BackupPasswordError);
    });
    it('каждая копия с новыми солью и IV', async () => {
        const a = parseEnvelope(await wrapBackup(sample, { password: 'p@ssw0rd!', ...FAST }));
        const b = parseEnvelope(await wrapBackup(sample, { password: 'p@ssw0rd!', ...FAST }));
        expect(a.encryption.salt).not.toBe(b.encryption.salt);
        expect(a.encryption.iv).not.toBe(b.encryption.iv);
    });
    it('готовый ключ (автобэкап) открывается паролем', async () => {
        const salt = newSalt();
        const key = await deriveBackupKey('секрет-12345', salt, 1000);
        const wrapped = await wrapBackup(sample, { key, salt, iterations: 1000 });
        expect(await unwrapEnvelope(parseEnvelope(wrapped), { password: 'секрет-12345' })).toBe(sample);
    });
    it('unwrapBackupText: повтор при неверном пароле, отказ → null', async () => {
        const wrapped = await wrapBackup(sample, { password: 'right-pass', ...FAST });
        const answers = ['bad', 'right-pass'];
        expect(await unwrapBackupText(wrapped, { askPassword: async () => answers.shift() })).toBe(sample);
        expect(await unwrapBackupText(wrapped, { askPassword: async () => null })).toBeNull();
    });
    it('копия из более новой версии формата отклоняется понятной ошибкой', async () => {
        const env = parseEnvelope(await wrapBackup(sample));
        env.v = 99;
        await expect(unwrapEnvelope(env)).rejects.toThrow(/новой версией/);
    });
});
