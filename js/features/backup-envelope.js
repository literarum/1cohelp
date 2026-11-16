'use strict';

/**
 * «Конверт» резервной копии: необязательное сжатие gzip и шифрование паролем.
 *
 * Формат — JSON (файл остаётся .json и выбирается тем же диалогом импорта):
 *   { format: 'copilot-backup-envelope', v: 1,
 *     compression: 'gzip' | null,
 *     encryption: null | { alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iterations, salt, iv },
 *     payload: base64 }
 *
 * Криптография (Web Crypto, без библиотек):
 *   • ключ: PBKDF2-HMAC-SHA256, 600 000 итераций (рекомендация OWASP Password Storage Cheat Sheet,
 *     сверено по вторичным источникам), соль 16 байт;
 *   • шифр: AES-GCM 256 бит, IV 12 байт (96 бит, как рекомендует NIST SP 800-38D);
 *   • соль и IV новые для каждой копии, поэтому ограничение GCM на число шифрований одним ключом
 *     с случайным IV (2^32) к нам не относится. Неверный пароль — ошибка проверки тега GCM.
 * Сжатие: CompressionStream('gzip') — есть во всех актуальных браузерах (Chrome/Edge 80, Firefox 113,
 * Safari 16.4); если его нет, копия сохраняется без сжатия.
 */

export const ENVELOPE_FORMAT = 'copilot-backup-envelope';
export const ENVELOPE_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export class BackupPasswordError extends Error {
    constructor(message = 'Неверный пароль или повреждённый файл.') {
        super(message);
        this.name = 'BackupPasswordError';
    }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

function base64ToBytes(b64) {
    const bin = atob(String(b64 || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function streamThrough(bytes, transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function isCompressionSupported() {
    return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

export async function gzipBytes(bytes) {
    return streamThrough(bytes, new CompressionStream('gzip'));
}

export async function gunzipBytes(bytes) {
    return streamThrough(bytes, new DecompressionStream('gzip'));
}

/**
 * Ключ AES-GCM из пароля. Неизвлекаемый: его можно хранить в IndexedDB для автобэкапа,
 * не храня сам пароль.
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} [iterations]
 * @returns {Promise<CryptoKey>}
 */
export async function deriveBackupKey(password, salt, iterations = PBKDF2_ITERATIONS) {
    if (!password) throw new Error('Пустой пароль.');
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
        'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

export function newSalt() {
    return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * Упаковать JSON-текст резервной копии.
 * @param {string} jsonText
 * @param {{ compress?: boolean, password?: string|null, key?: CryptoKey|null, salt?: Uint8Array|null, iterations?: number }} [opts]
 *   key+salt — готовый ключ (автобэкап), password — ключ выводится заново.
 * @returns {Promise<string>}
 */
export async function wrapBackup(jsonText, opts = {}) {
    const compress = opts.compress !== false && isCompressionSupported();
    let bytes = enc.encode(String(jsonText));
    if (compress) bytes = await gzipBytes(bytes);
    let encryption = null;
    if (opts.password || opts.key) {
        const iterations = opts.iterations || PBKDF2_ITERATIONS;
        const salt = opts.key ? opts.salt : newSalt();
        if (!salt) throw new Error('Для готового ключа нужна его соль.');
        const key = opts.key || (await deriveBackupKey(opts.password, salt, iterations));
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
        encryption = {
            alg: 'AES-GCM-256',
            kdf: 'PBKDF2-SHA256',
            iterations,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
        };
    }
    return JSON.stringify({
        format: ENVELOPE_FORMAT,
        v: ENVELOPE_VERSION,
        createdAt: new Date().toISOString(),
        compression: compress ? 'gzip' : null,
        encryption,
        payload: bytesToBase64(bytes),
    });
}

/** Разобрать конверт; для обычной копии вернуть null. */
export function parseEnvelope(text) {
    if (typeof text !== 'string') return null;
    const head = text.slice(0, 256);
    if (!head.includes(ENVELOPE_FORMAT)) return null;
    try {
        const env = JSON.parse(text);
        return env && env.format === ENVELOPE_FORMAT ? env : null;
    } catch {
        return null;
    }
}

export function isEncryptedEnvelope(env) {
    return Boolean(env && env.encryption);
}

/**
 * Распаковать конверт в исходный JSON-текст.
 * @param {object} env результат parseEnvelope
 * @param {{ password?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function unwrapEnvelope(env, opts = {}) {
    if (!env || env.format !== ENVELOPE_FORMAT) throw new Error('Это не конверт резервной копии.');
    if (env.v > ENVELOPE_VERSION) {
        throw new Error('Копия создана более новой версией приложения. Обновите приложение.');
    }
    let bytes = base64ToBytes(env.payload);
    if (env.encryption) {
        if (env.encryption.alg !== 'AES-GCM-256' || env.encryption.kdf !== 'PBKDF2-SHA256') {
            throw new Error('Неизвестный способ шифрования копии.');
        }
        if (!opts.password) throw new BackupPasswordError('Копия зашифрована — нужен пароль.');
        const key = await deriveBackupKey(
            opts.password,
            base64ToBytes(env.encryption.salt),
            env.encryption.iterations || PBKDF2_ITERATIONS,
        );
        try {
            bytes = new Uint8Array(
                await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: base64ToBytes(env.encryption.iv) },
                    key,
                    bytes,
                ),
            );
        } catch {
            throw new BackupPasswordError();
        }
    }
    if (env.compression === 'gzip') {
        if (!isCompressionSupported()) {
            throw new Error('Браузер не умеет распаковывать сжатые копии. Обновите браузер.');
        }
        bytes = await gunzipBytes(bytes);
    }
    return dec.decode(bytes);
}

/**
 * Для импорта/слияния: обычный JSON возвращается как есть, конверт распаковывается
 * (с запросом пароля, до 3 попыток). null — пользователь отказался вводить пароль.
 * @param {string} text
 * @param {{ askPassword?: (attempt:number) => Promise<string|null> }} [opts]
 * @returns {Promise<string|null>}
 */
export async function unwrapBackupText(text, opts = {}) {
    const env = parseEnvelope(text);
    if (!env) return text;
    if (!isEncryptedEnvelope(env)) return unwrapEnvelope(env);
    const ask = opts.askPassword || ((attempt) => promptBackupPassword({ attempt }));
    for (let attempt = 1; attempt <= 3; attempt++) {
        const password = await ask(attempt);
        if (password === null || password === undefined) return null;
        try {
            return await unwrapEnvelope(env, { password });
        } catch (e) {
            if (!(e instanceof BackupPasswordError) || attempt === 3) throw e;
        }
    }
    return null;
}

/**
 * Окно ввода пароля (стили — общие rq-* окна).
 * @param {{ title?: string, hint?: string, confirm?: boolean, attempt?: number }} [o]
 * @returns {Promise<string|null>}
 */
export function promptBackupPassword(o = {}) {
    return new Promise((resolve) => {
        const confirm = Boolean(o.confirm);
        const root = document.createElement('div');
        root.className = 'rq-modal';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'bpTitle');
        root.innerHTML = `
            <div class="rq-backdrop" data-bp-cancel></div>
            <form class="rq-card so-card" novalidate>
                <header class="rq-head">
                    <span class="rq-head__icon" aria-hidden="true"><i class="fas fa-lock"></i></span>
                    <div><h2 id="bpTitle"></h2><p data-bp-hint></p></div>
                </header>
                <div class="rq-body">
                    <label class="bp-field"><span>Пароль</span><input type="password" class="rq-input" data-bp-pass autocomplete="${confirm ? 'new-password' : 'current-password'}" required minlength="${confirm ? 8 : 1}"></label>
                    ${confirm ? '<label class="bp-field"><span>Повторите пароль</span><input type="password" class="rq-input" data-bp-pass2 autocomplete="new-password" required></label>' : ''}
                    <p class="bp-error" role="alert" data-bp-error></p>
                    <div class="so-actions">
                        <button type="submit" class="vc-chip bp-primary">${confirm ? 'Зашифровать' : 'Открыть'}</button>
                        <button type="button" class="vc-chip" data-bp-cancel>Отмена</button>
                    </div>
                </div>
            </form>`;
        root.querySelector('#bpTitle').textContent =
            o.title || (confirm ? 'Пароль для резервной копии' : 'Копия зашифрована');
        root.querySelector('[data-bp-hint]').textContent =
            o.hint ||
            (confirm
                ? 'Не менее 8 символов. Без пароля копию восстановить невозможно — сохраните его.'
                : o.attempt > 1
                  ? `Неверный пароль. Попытка ${o.attempt} из 3.`
                  : 'Введите пароль, заданный при создании копии.');
        const last = document.activeElement;
        document.body.appendChild(root);
        const pass = root.querySelector('[data-bp-pass]');
        const pass2 = root.querySelector('[data-bp-pass2]');
        const err = root.querySelector('[data-bp-error]');
        const done = (value) => {
            document.removeEventListener('keydown', onKey, true);
            root.remove();
            try {
                last?.focus?.();
            } catch {
                /* ignore */
            }
            resolve(value);
        };
        function onKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                done(null);
            }
        }
        document.addEventListener('keydown', onKey, true);
        root.addEventListener('click', (e) => {
            if (e.target instanceof Element && e.target.closest('[data-bp-cancel]')) done(null);
        });
        root.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            const v = pass.value;
            if (confirm && v.length < 8) {
                err.textContent = 'Пароль короче 8 символов.';
                return;
            }
            if (confirm && v !== pass2.value) {
                err.textContent = 'Пароли не совпадают.';
                return;
            }
            if (!v) {
                err.textContent = 'Введите пароль.';
                return;
            }
            done(v);
        });
        requestAnimationFrame(() => pass.focus());
    });
}
