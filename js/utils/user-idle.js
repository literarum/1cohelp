'use strict';

/**
 * Простой пользователя: фоновая тяжёлая работа (хэширование базы, сухой экспорт) ждёт паузу во вводе,
 * чтобы не отнимать главный поток у поиска и прокрутки.
 */

let lastInputAt = 0;
let listening = false;

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'input'];

function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function ensureListening() {
    if (listening || typeof window === 'undefined' || !window.addEventListener) return;
    listening = true;
    lastInputAt = now();
    const mark = () => {
        lastInputAt = now();
    };
    for (const name of EVENTS) {
        window.addEventListener(name, mark, { capture: true, passive: true });
    }
}

/** Миллисекунды с последнего ввода пользователя. */
export function msSinceUserInput() {
    ensureListening();
    return now() - lastInputAt;
}

/**
 * Ждёт, пока пользователь не будет «тихим» quietMs (но не дольше maxWaitMs).
 * Без окна (тесты Node) сразу завершается.
 * @param {{ quietMs?: number, maxWaitMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export function waitForUserIdle(opts = {}) {
    const quietMs = opts.quietMs ?? 2500;
    const maxWaitMs = opts.maxWaitMs ?? 30000;
    if (typeof window === 'undefined' || typeof setTimeout !== 'function') return Promise.resolve();
    ensureListening();
    const started = now();
    return new Promise((resolve) => {
        const check = () => {
            const quiet = now() - lastInputAt;
            const hidden = typeof document !== 'undefined' && document.hidden;
            if (quiet >= quietMs || hidden || now() - started >= maxWaitMs) {
                resolve();
                return;
            }
            setTimeout(check, Math.min(500, Math.max(100, quietMs - quiet)));
        };
        check();
    });
}
