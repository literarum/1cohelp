'use strict';

let deps = {
    loadingOverlayManager: null,
};

export function setOverlayUtilsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function showOverlayForFixedDuration(duration = 2000) {
    if (!deps.loadingOverlayManager) return;
    if (deps.loadingOverlayManager.overlayElement) {
        deps.loadingOverlayManager.hideAndDestroy();
    }
    deps.loadingOverlayManager.createAndShow();

    setTimeout(() => {
        if (deps.loadingOverlayManager.overlayElement) {
            deps.loadingOverlayManager.hideAndDestroy();
        }
    }, duration);
}
