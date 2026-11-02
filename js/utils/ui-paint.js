'use strict';

/** Allow layout to settle without making logical readiness depend on browser paint scheduling. */
export function waitForUiPaint({ frames = 2, timeoutMs = 150 } = {}) {
    if (typeof requestAnimationFrame !== 'function' ||
        (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
        return Promise.resolve({ painted: false });
    }
    return new Promise(resolve => {
        let remaining = frames;
        let frameId;
        let finished = false;
        const finish = painted => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (frameId !== undefined && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(frameId);
            }
            resolve({ painted });
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        const next = () => {
            if (finished) return;
            if (--remaining <= 0) finish(true);
            else frameId = requestAnimationFrame(next);
        };
        frameId = requestAnimationFrame(next);
    });
}
