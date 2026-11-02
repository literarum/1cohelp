/** Shared first-paint/replay sphere. All curves belong to its surface; no orbit rings. */
export const SPHERE_EXIT_MS = 820;

export function createSphereRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let frame = null, exitTimer = null, exitResolve = null, exitPromise = null;
    let width = 0, height = 0, radius = 0, started = 0, exitStarted = null;
    let theme = document.documentElement.dataset.loadingOverlayTheme || 'dark';
    let sprites = [], glow, reduced = false;
    const points = Array.from({ length: 2200 }, (_, i) => {
        const y = 1 - (i / 2199) * 2;
        const a = i * 2.399963229728653;
        const r = Math.sqrt(1 - y * y);
        return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, seed: i * 0.61803398875 % 1 };
    });
    const palette = () => theme === 'light'
        ? ['#6d28d9', '#9333ea', '#2563eb', '#c026d3']
        : ['#a78bfa', '#c084fc', '#67e8f9', '#f0abfc'];

    function makeGlow(color, core = false) {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 64;
        const c = sprite.getContext('2d');
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, core ? '#ffffff' : color);
        g.addColorStop(0.12, color);
        g.addColorStop(0.38, `${color}70`);
        g.addColorStop(1, `${color}00`);
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
        return sprite;
    }
    function buildPalette() {
        sprites = palette().map(color => makeGlow(color, true));
        glow = makeGlow(theme === 'light' ? '#a78bfa' : '#7c3aed');
    }
    function resize() {
        width = canvas.clientWidth || window.innerWidth;
        height = canvas.clientHeight || window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        radius = Math.min(width * 0.28, height * 0.26, 215);
        if (api.isRunning && reduced) draw(performance.now());
    }
    function draw(now) {
        if (!ctx) return;
        const t = reduced ? 0 : (now - started) / 1000;
        const exit = exitStarted === null ? 0 : Math.min(1, (now - exitStarted) / SPHERE_EXIT_MS);
        const burst = Math.max(0, (exit - 0.18) / 0.82);
        const squeeze = exit > 0 && exit < 0.18 ? 1 - 0.35 * Math.sin(exit / 0.18 * Math.PI / 2) : 1;
        const scale = burst ? 0.65 + (1 - (1 - burst) ** 3) * 5.8 : squeeze;
        const alpha = burst ? (1 - burst) ** 1.6 : 1;
        const cx = width / 2, cy = height * 0.445;
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'source-over';
        ctx.globalAlpha = (theme === 'dark' ? 0.42 : 0.18) * alpha;
        const halo = radius * (burst ? 4 + burst * 7 : 3.8);
        ctx.drawImage(glow, cx - halo / 2, cy - halo / 2, halo, halo);
        const angle = t * 0.15, sin = Math.sin(angle), cos = Math.cos(angle);
        // A depth-sorted shell with flowing density ridges creates a woven, volumetric sphere.
        const projected = points.map(p => {
            const wave = Math.sin(p.y * 15 + Math.atan2(p.z, p.x) * 4 + t * 0.7);
            const r = radius * (1 + wave * 0.035) * scale * (1 + burst * p.seed * 0.6);
            const x = p.x * cos + p.z * sin;
            const z = p.z * cos - p.x * sin;
            const perspective = 1 / (1 - z * 0.18);
            return { x: cx + x * r * perspective, y: cy + p.y * r * perspective,
                z, wave, seed: p.seed, perspective };
        }).sort((a, b) => a.z - b.z);
        for (const p of projected) {
            const front = (p.z + 1) / 2;
            const ridge = Math.max(0, p.wave) ** 5;
            const size = (1.5 + ridge * 2.3 + p.seed * 1.8) * p.perspective * (1 + burst * 1.5);
            ctx.globalAlpha = alpha * (0.18 + front * 0.58 + ridge * 0.24);
            const sprite = sprites[Math.min(3, Math.floor((p.seed + p.wave * 0.06 + 1) % 1 * 4))];
            ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2);
            if (burst && front > 0.7 && p.seed > 0.88) {
                ctx.strokeStyle = palette()[2];
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(cx + (p.x - cx) * (1 - burst * 0.13), cy + (p.y - cy) * (1 - burst * 0.13));
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }
    function tick(now) {
        frame = null;
        if (!api.isRunning) return;
        draw(now);
        if (!reduced) frame = requestAnimationFrame(tick);
    }
    function settleExit() {
        clearTimeout(exitTimer);
        exitTimer = null;
        const resolve = exitResolve;
        exitResolve = null;
        resolve?.();
    }
    const api = {
        isRunning: false,
        start() {
            if (api.isRunning) return;
            reduced = document.documentElement.dataset.motion === 'reduce' ||
                (document.documentElement.dataset.motion !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
            exitStarted = null;
            exitPromise = null;
            started = performance.now();
            api.isRunning = true;
            buildPalette();
            resize();
            window.addEventListener('resize', resize);
            draw(started);
            if (!reduced && ctx) frame = requestAnimationFrame(tick);
        },
        stop() {
            api.isRunning = false;
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            window.removeEventListener('resize', resize);
            settleExit();
        },
        resize,
        setTheme(value) {
            theme = value === 'light' ? 'light' : 'dark';
            if (api.isRunning) { buildPalette(); draw(performance.now()); }
        },
        finish() {
            if (exitPromise) return exitPromise;
            exitStarted = performance.now();
            // Timer is independent of paint: a background tab must never retain the overlay.
            exitPromise = new Promise(resolve => {
                exitResolve = resolve;
                exitTimer = setTimeout(settleExit, reduced || !ctx ? 120 : SPHERE_EXIT_MS);
            });
            return exitPromise;
        },
    };
    return api;
}
