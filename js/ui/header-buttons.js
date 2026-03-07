'use strict';

let deps = {
    setActiveTab: null,
};

export function setHeaderButtonsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initHeaderButtons() {
    const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
    if (showFavoritesHeaderButton && !showFavoritesHeaderButton.dataset.listenerAttached) {
        showFavoritesHeaderButton.addEventListener('click', () => {
            if (typeof deps.setActiveTab === 'function') {
                deps.setActiveTab('favorites');
            }
        });
        showFavoritesHeaderButton.dataset.listenerAttached = 'true';
    }
}
