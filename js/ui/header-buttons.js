'use strict';

let deps = {
    setActiveTab: null,
};

export function setHeaderButtonsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initHeaderButtons() {
    // Кнопка «Избранное» (#showFavoritesHeaderBtn) вешается в app-init; здесь не дублируем,
    // чтобы избежать двойного вызова setActiveTab и мерцания при возврате из избранного.
}
