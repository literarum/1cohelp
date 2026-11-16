'use strict';

/**
 * Приватность на рабочем месте оператора.
 *
 * 1. Режим демонстрации экрана (Alt+Shift+P): размывает персональные данные — заметки,
 *    базу клиентов, чёрный список, архив обращений, описания результатов поиска.
 * 2. Блокировка PIN-кодом: вручную (Alt+Shift+L), при простое (по умолчанию 15 мин) и при запуске.
 *    PIN хранится только как хэш PBKDF2-SHA256 с солью.
 *
 * Ограничение (сказано и в интерфейсе): это экран приватности от посторонних глаз,
 * а не шифрование базы — данные браузера по-прежнему доступны через инструменты разработчика.
 */

const LOCK_KEY = 'copilot.lock.v1';
const PRIVACY_KEY = 'copilot.privacyMode';
export const IDLE_OPTIONS = [5, 15, 30, 60, 0];
export const DEFAULT_IDLE_MINUTES = 15;
const PIN_ITERATIONS = 200_000;
const RESET_DELAY_S = 30;

const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPin(pin, saltBytes, iterations = PIN_ITERATIONS) {
    const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
    return b64(new Uint8Array(bits));
}

/** Сравнение без раннего выхода. */
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export function isValidPin(pin) {
    return /^\d{4,8}$/.test(String(pin || ''));
}

export function readLockConfig() {
    try {
        const c = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
        if (!c || typeof c.hash !== 'string' || typeof c.salt !== 'string') return null;
        return {
            hash: c.hash,
            salt: c.salt,
            iterations: Number(c.iterations) || PIN_ITERATIONS,
            idleMinutes: IDLE_OPTIONS.includes(Number(c.idleMinutes)) ? Number(c.idleMinutes) : DEFAULT_IDLE_MINUTES,
            lockOnStart: c.lockOnStart !== false,
        };
    } catch {
        return null;
    }
}

function writeLockConfig(cfg) {
    if (!cfg) localStorage.removeItem(LOCK_KEY);
    else localStorage.setItem(LOCK_KEY, JSON.stringify(cfg));
}

export async function setPin(pin, opts = {}) {
    if (!isValidPin(pin)) throw new Error('PIN — от 4 до 8 цифр.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const prev = readLockConfig();
    writeLockConfig({
        hash: await hashPin(pin, salt),
        salt: b64(salt),
        iterations: PIN_ITERATIONS,
        idleMinutes: opts.idleMinutes ?? prev?.idleMinutes ?? DEFAULT_IDLE_MINUTES,
        lockOnStart: opts.lockOnStart ?? prev?.lockOnStart ?? true,
    });
}

export async function verifyPin(pin) {
    const cfg = readLockConfig();
    if (!cfg) return true;
    return safeEqual(await hashPin(pin, unb64(cfg.salt), cfg.iterations), cfg.hash);
}

export function updateLockSettings(patch) {
    const cfg = readLockConfig();
    if (!cfg) return;
    writeLockConfig({ ...cfg, ...patch });
}

export function disableLock() {
    writeLockConfig(null);
}

// ------------------------------------------------------------------ режим демонстрации
export function isPrivacyMode() {
    return document.documentElement.classList.contains('privacy-mode');
}

export function setPrivacyMode(on) {
    document.documentElement.classList.toggle('privacy-mode', Boolean(on));
    try {
        if (on) sessionStorage.setItem(PRIVACY_KEY, '1');
        else sessionStorage.removeItem(PRIVACY_KEY);
    } catch {
        /* ignore */
    }
    let banner = document.getElementById('privacyModeBanner');
    if (on && !banner) {
        banner = document.createElement('button');
        banner.type = 'button';
        banner.id = 'privacyModeBanner';
        banner.className = 'privacy-banner';
        banner.innerHTML = '<i class="fas fa-eye-slash" aria-hidden="true"></i> Режим демонстрации: персональные данные скрыты · Alt+Shift+P — выключить';
        banner.addEventListener('click', () => setPrivacyMode(false));
        document.body.appendChild(banner);
    } else if (!on) banner?.remove();
}

export function togglePrivacyMode() {
    setPrivacyMode(!isPrivacyMode());
}

// ------------------------------------------------------------------ экран блокировки
let locked = false;
let lastInput = Date.now();

export function isLocked() {
    return locked;
}

export function lockNow() {
    if (locked || !readLockConfig()) return false;
    locked = true;
    const app = document.getElementById('appContent');
    app?.setAttribute('inert', '');
    document.documentElement.classList.add('app-locked');
    const root = document.createElement('div');
    root.id = 'appLockScreen';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'lockTitle');
    root.innerHTML = `
        <form class="lock-card" novalidate autocomplete="off">
            <span class="lock-icon" aria-hidden="true"><i class="fas fa-lock"></i></span>
            <h2 id="lockTitle">Copilot 1СО заблокирован</h2>
            <p class="lock-sub">Введите PIN, чтобы продолжить</p>
            <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="lock-pin" aria-label="PIN" data-lock-pin>
            <p class="lock-err" role="alert" data-lock-err></p>
            <button type="submit" class="lock-btn">Разблокировать</button>
            <button type="button" class="lock-link" data-lock-forgot>Забыли PIN?</button>
        </form>`;
    document.body.appendChild(root);
    const input = root.querySelector('[data-lock-pin]');
    const err = root.querySelector('[data-lock-err]');
    let attempts = 0;
    root.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await verifyPin(input.value)) {
            unlock();
            return;
        }
        attempts += 1;
        input.value = '';
        err.textContent = attempts >= 5 ? 'Неверный PIN. Подождите 10 секунд.' : 'Неверный PIN.';
        if (attempts >= 5) {
            input.disabled = true;
            setTimeout(() => {
                input.disabled = false;
                err.textContent = '';
                input.focus();
            }, 10_000);
        }
    });
    root.querySelector('[data-lock-forgot]').addEventListener('click', () => startPinReset(root));
    // Ловим клавиши, чтобы горячие клавиши приложения не срабатывали за экраном блокировки.
    root.addEventListener('keydown', (e) => e.stopPropagation());
    requestAnimationFrame(() => input.focus());
    return true;
}

function startPinReset(root) {
    const err = root.querySelector('[data-lock-err]');
    const form = root.querySelector('form');
    form.querySelector('.lock-sub').textContent =
        'Блокировка — экран приватности, данные не зашифрованы и не пострадают. Чтобы снять PIN, введите «сбросить» и подождите.';
    const input = form.querySelector('[data-lock-pin]');
    input.type = 'text';
    input.removeAttribute('inputmode');
    input.removeAttribute('maxlength');
    input.value = '';
    input.placeholder = 'сбросить';
    form.querySelector('.lock-btn').textContent = 'Сбросить PIN';
    form.querySelector('[data-lock-forgot]').hidden = true;
    form.onsubmit = null;
    form.addEventListener(
        'submit',
        (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (input.value.trim().toLowerCase() !== 'сбросить') {
                err.textContent = 'Введите слово «сбросить».';
                return;
            }
            let left = RESET_DELAY_S;
            input.disabled = true;
            form.querySelector('.lock-btn').disabled = true;
            const tick = () => {
                err.textContent = `PIN будет снят через ${left} с…`;
                if (left-- <= 0) {
                    disableLock();
                    unlock();
                    window.NotificationService?.add?.('PIN снят. Задайте новый в палитре команд: «Блокировка».', 'warning', { duration: 8000 });
                    return;
                }
                setTimeout(tick, 1000);
            };
            tick();
        },
        { capture: true },
    );
    input.focus();
}

function unlock() {
    locked = false;
    lastInput = Date.now();
    document.getElementById('appLockScreen')?.remove();
    document.getElementById('appContent')?.removeAttribute('inert');
    document.documentElement.classList.remove('app-locked');
}

// ------------------------------------------------------------------ настройки
export async function openLockSettings() {
    const { promptBackupPassword } = await import('./backup-envelope.js');
    const cfg = readLockConfig();
    const confirmFn = (await import('../ui/app-confirm-modal.js')).showAppConfirm;
    if (!cfg) {
        const pin = await promptBackupPassword({
            confirm: true,
            title: 'PIN для блокировки',
            hint: 'От 4 до 8 цифр. Приложение будет блокироваться после 15 минут простоя и при запуске. Это экран приватности, а не шифрование данных.',
        });
        if (!pin) return;
        if (!isValidPin(pin)) {
            window.NotificationService?.add?.('PIN должен состоять из 4–8 цифр.', 'error');
            return;
        }
        await setPin(pin);
        window.NotificationService?.add?.('Блокировка включена. Заблокировать сейчас — Alt+Shift+L.', 'success', { duration: 6000 });
        return;
    }
    const next = IDLE_OPTIONS[(IDLE_OPTIONS.indexOf(cfg.idleMinutes) + 1) % IDLE_OPTIONS.length];
    const label = (m) => (m ? `${m} мин простоя` : 'не блокировать по простою');
    const ok = await confirmFn({
        title: 'Блокировка PIN-кодом',
        message: `Сейчас: ${label(cfg.idleMinutes)}, при запуске — ${cfg.lockOnStart ? 'да' : 'нет'}. Переключить автоблокировку на «${label(next)}»?`,
        confirmText: 'Переключить',
        cancelText: 'Оставить',
    });
    if (ok) {
        updateLockSettings({ idleMinutes: next });
        window.NotificationService?.add?.(`Автоблокировка: ${label(next)}.`, 'info', { duration: 4000 });
    }
}

let initialized = false;
export function initPrivacy() {
    if (initialized) return;
    initialized = true;
    try {
        if (sessionStorage.getItem(PRIVACY_KEY) === '1') setPrivacyMode(true);
    } catch {
        /* ignore */
    }
    const mark = () => {
        lastInput = Date.now();
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) =>
        window.addEventListener(t, mark, { capture: true, passive: true }),
    );
    document.addEventListener(
        'keydown',
        (e) => {
            if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
            if (e.code === 'KeyP') {
                e.preventDefault();
                e.stopPropagation(); // Alt+L/Alt+P без Shift — другие команды приложения
                togglePrivacyMode();
            } else if (e.code === 'KeyL') {
                e.preventDefault();
                e.stopPropagation();
                if (!lockNow()) void openLockSettings();
            }
        },
        true,
    );
    setInterval(() => {
        const cfg = readLockConfig();
        if (!cfg || locked || !cfg.idleMinutes) return;
        if (Date.now() - lastInput >= cfg.idleMinutes * 60_000) lockNow();
    }, 20_000);
    if (readLockConfig()?.lockOnStart) lockNow();
}

if (typeof window !== 'undefined') {
    window.togglePrivacyMode = togglePrivacyMode;
    window.lockAppNow = () => lockNow() || openLockSettings();
    window.openLockSettings = openLockSettings;
    window.disableAppLock = async () => {
        if (!readLockConfig()) return;
        const { promptBackupPassword } = await import('./backup-envelope.js');
        const pin = await promptBackupPassword({ title: 'Отключить блокировку', hint: 'Введите текущий PIN.' });
        if (pin && (await verifyPin(pin))) {
            disableLock();
            window.NotificationService?.add?.('Блокировка отключена.', 'info');
        } else if (pin) window.NotificationService?.add?.('Неверный PIN.', 'error');
    };
}
