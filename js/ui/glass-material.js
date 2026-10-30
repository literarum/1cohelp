/** Optional backdrop material. No persistence: the appearance transaction owns it. */
export const MATERIAL_DEFAULTS = Object.freeze({ surfaceMaterial: 'solid', glassMatte: 65, glassRefraction: 30 });

export function sanitizeMaterial(settings = {}) {
    const percent = (value, fallback) => {
        if (value === null || value === '' || typeof value === 'boolean') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : fallback;
    };
    return {
        surfaceMaterial: settings.surfaceMaterial === 'glass' ? 'glass' : 'solid',
        glassMatte: percent(settings.glassMatte, MATERIAL_DEFAULTS.glassMatte),
        glassRefraction: percent(settings.glassRefraction, MATERIAL_DEFAULTS.glassRefraction),
    };
}

export function applyGlassMaterial(settings = {}) {
    const material = sanitizeMaterial(settings);
    const root = document.documentElement;
    root.dataset.surfaceMaterial = material.surfaceMaterial;
    if (material.surfaceMaterial === 'solid') {
        ['--glass-filter', '--glass-blur', '--glass-tint'].forEach((key) => root.style.removeProperty(key));
        return;
    }
    let filters = document.getElementById('copilot-glass-filters');
    if (!filters) {
        filters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        filters.id = 'copilot-glass-filters';
        filters.setAttribute('aria-hidden', 'true');
        filters.setAttribute('width', '0');
        filters.setAttribute('height', '0');
        filters.style.cssText = 'position:fixed;pointer-events:none;overflow:hidden';
        filters.innerHTML = '<defs><filter id="copilot-glass-backdrop" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="1" seed="8" result="lens"/><feDisplacementMap in="SourceGraphic" in2="lens" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
        document.body.appendChild(filters);
    }
    filters.querySelector('feDisplacementMap').setAttribute('scale', String(Math.round(material.glassRefraction * 0.24 * 100) / 100));
    root.style.setProperty('--glass-blur', `${4 + material.glassMatte * 0.3}px`);
    root.style.setProperty('--glass-tint', `${68 + material.glassMatte * 0.26}%`);
    root.style.setProperty('--glass-filter', material.glassRefraction ? 'url("#copilot-glass-backdrop")' : 'blur(0px)');
}
