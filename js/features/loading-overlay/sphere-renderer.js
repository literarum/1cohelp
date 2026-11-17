/**
 * Оверлей загрузки «Космическое ядро» (Canvas 2D, без библиотек).
 *
 * Слои (снизу вверх), всё с аддитивным смешиванием ('lighter') в тёмной теме:
 *   1. Звёздное поле с мерцанием и медленным параллаксом.
 *   2. Гало-«блум»: большие заранее отрисованные радиальные спрайты.
 *   3. Оболочка-сфера (решётка Фибоначчи), вращается в 3D, «дышит» волнами плотности.
 *   4. Орбиты: наклонённые кольца частиц разного размера, у каждой своя скорость и направление,
 *      с короткими кометными хвостами.
 *   5. Пульсирующее ядро со звёздными лучами.
 * Финал (finish): сжатие → вспышка → ударные волны → взрыв частиц с искрами и шлейфами.
 *
 * Производительность: свечение — спрайты drawImage (без shadowBlur и ctx.filter: первое дорого,
 * второго нет в Safari), аддитивное смешивание не требует сортировки по глубине,
 * число частиц масштабируется под устройство, DPR ограничен.
 */
import { readOverlaySettings, readAccentHex, accentPalette } from './overlay-settings.js';

export const SPHERE_EXIT_MS = 1900;
/** Финал «мягкое растворение» (настройка оверлея): без вспышки и ударных волн. */
export const FADE_EXIT_MS = 900;

/** Гамма: синий → индиго → фиолетовый → пурпурный → маджента (+ холодные акценты). */
export const COSMIC_PALETTE_DARK = [
    '#3b82f6', // синий
    '#60a5fa', // светло-синий
    '#22d3ee', // циан (акцент)
    '#6366f1', // индиго
    '#818cf8', // светлый индиго
    '#8b5cf6', // фиолетовый
    '#a855f7', // пурпурный
    '#c084fc', // светлый пурпур
    '#d946ef', // фуксия
    '#e879f9', // светлая фуксия
    '#ec4899', // маджента
    '#f472b6', // розовая маджента
];
export const COSMIC_PALETTE_LIGHT = [
    '#1d4ed8',
    '#2563eb',
    '#0891b2',
    '#4338ca',
    '#4f46e5',
    '#6d28d9',
    '#7e22ce',
    '#9333ea',
    '#a21caf',
    '#c026d3',
    '#be185d',
    '#db2777',
];

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Детерминированный ГПСЧ (mulberry32): одинаковая картина при каждом запуске, без мерцания при пересборке. */
export function createRng(seed = 0x1c0ffee) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const easeInCubic = (x) => x * x * x;
export const easeOutCubic = (x) => 1 - (1 - x) ** 3;
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Фазы финала по нормированному времени e ∈ [0, 1].
 * @returns {{implode:number, flash:number, burst:number, fade:number}}
 */
export function exitPhases(e) {
    const IMPLODE_END = 0.3;
    return {
        // Сжатие к ядру с ускорением.
        implode: easeInCubic(clamp01(e / IMPLODE_END)),
        // Вспышка: мгновенный пик в момент «взрыва», затем быстрый спад.
        flash: e < IMPLODE_END ? 0 : Math.max(0, 1 - (e - IMPLODE_END) / 0.22) ** 2,
        // Разлёт: быстрый старт, долгое торможение.
        burst: e < IMPLODE_END ? 0 : easeOutExpo(clamp01((e - IMPLODE_END) / (1 - IMPLODE_END))),
        // Общее затухание в последней трети.
        fade: clamp01((e - 0.62) / 0.38),
    };
}

/** Сколько частиц может позволить устройство (жадность компенсируется DPR и площадью). */
export function computeBudget({ width, height, cores, reduced }) {
    const area = Math.max(1, width * height);
    let k = Math.min(1, Math.sqrt(area / (1440 * 900)));
    if (cores && cores <= 4) k *= 0.7;
    if (reduced) k *= 0.6;
    k = Math.max(0.45, k);
    return {
        shell: Math.round(1500 * k),
        orbitParticles: Math.round(220 * k),
        stars: Math.round(260 * k),
        sparks: Math.round(420 * k),
    };
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Радиальный спрайт свечения: яркое ядро → цвет → прозрачность. */
function makeGlowSprite(color, size, coreWhite) {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const c = sprite.getContext('2d');
    if (!c) return sprite;
    const [r, g, b] = hexToRgb(color);
    const h = size / 2;
    const grad = c.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, coreWhite ? 'rgba(255,255,255,1)' : `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.1, `rgba(${r},${g},${b},0.95)`);
    grad.addColorStop(0.28, `rgba(${r},${g},${b},0.42)`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
    return sprite;
}

/** Повернуть точку вокруг осей X и Y. */
function rotate(x, y, z, ax, ay) {
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    const x1 = x * cy + z * sy;
    const z1 = z * cy - x * sy;
    const cx = Math.cos(ax);
    const sx = Math.sin(ax);
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

export function createSphereRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let frame = null;
    let exitTimer = null;
    let exitResolve = null;
    let exitPromise = null;
    let width = 0;
    let height = 0;
    let unit = 0;
    let started = 0;
    let exitStarted = null;
    let lastNow = 0;
    let theme = document.documentElement.dataset.loadingOverlayTheme || 'dark';
    let reduced = false;
    let sprites = [];
    let whiteSprite = null;
    let bloomSprites = [];
    let shell = [];
    let orbits = [];
    let stars = [];
    let sparks = [];

    let settings = readOverlaySettings();
    let accentCache = null;
    const palette = () => {
        if (settings.palette === 'accent') {
            const hex = readAccentHex();
            if (hex) {
                const key = `${hex}|${theme}`;
                if (accentCache?.key !== key) accentCache = { key, colors: accentPalette(hex, theme) };
                return accentCache.colors;
            }
        }
        return theme === 'light' ? COSMIC_PALETTE_LIGHT : COSMIC_PALETTE_DARK;
    };
    const exitDuration = () => (reduced ? 400 : settings.finale === 'fade' ? FADE_EXIT_MS : SPHERE_EXIT_MS);

    function buildSprites() {
        const pal = palette();
        sprites = pal.map((color) => makeGlowSprite(color, 64, theme !== 'light'));
        whiteSprite = makeGlowSprite('#e0e7ff', 64, true);
        bloomSprites =
            settings.palette === 'accent' && pal !== COSMIC_PALETTE_DARK && pal !== COSMIC_PALETTE_LIGHT
                ? [pal[5], pal[1], pal[10]].map((c) => makeGlowSprite(c, 256, false))
                : [
                      makeGlowSprite(theme === 'light' ? '#a78bfa' : '#6d28d9', 256, false),
                      makeGlowSprite(theme === 'light' ? '#93c5fd' : '#1d4ed8', 256, false),
                      makeGlowSprite(theme === 'light' ? '#f0abfc' : '#be185d', 256, false),
                  ];
    }

    /** Цвет по нормированному значению 0..1 вдоль гаммы. */
    const colorIndex = (v) => Math.min(sprites.length - 1, Math.max(0, Math.floor(v * sprites.length)));

    function buildScene() {
        const rng = createRng();
        const budget = computeBudget({
            width,
            height,
            cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8,
            reduced,
        });
        // Оболочка: решётка Фибоначчи — равномерное покрытие сферы без «полюсов».
        shell = Array.from({ length: budget.shell }, (_, i) => {
            const y = 1 - (2 * (i + 0.5)) / budget.shell;
            const r = Math.sqrt(1 - y * y);
            const a = i * GOLDEN_ANGLE;
            const seed = rng();
            return {
                x: Math.cos(a) * r,
                y,
                z: Math.sin(a) * r,
                seed,
                // Градиент по высоте: синий снизу → маджента сверху, с шумом.
                color: clamp01((1 - y) / 2 * 0.85 + seed * 0.15),
                size: 0.95 + rng() ** 3 * 2.6,
                burstSpeed: 0.6 + rng() * 1.6,
                spin: (rng() - 0.5) * 2,
            };
        });
        // Орбиты: наклонённые кольца с разной скоростью и направлением вращения.
        const orbitDefs = [
            { radius: 1.42, tiltX: 1.18, tiltY: 0.2, speed: 0.55, hue: [0.0, 0.35], width: 0.035 },
            { radius: 1.7, tiltX: -0.62, tiltY: 0.9, speed: -0.38, hue: [0.45, 0.75], width: 0.05 },
            { radius: 2.05, tiltX: 0.32, tiltY: -0.5, speed: 0.26, hue: [0.7, 1.0], width: 0.07 },
            { radius: 1.22, tiltX: 1.52, tiltY: 1.4, speed: -0.82, hue: [0.2, 0.55], width: 0.025 },
        ];
        orbits = orbitDefs.map((def) => ({
            ...def,
            particles: Array.from({ length: budget.orbitParticles }, () => {
                const big = rng() < 0.08;
                return {
                    phase: rng() * TAU,
                    offset: (rng() - 0.5) * def.width,
                    lift: (rng() - 0.5) * def.width,
                    // Разные размеры: много мелких, редкие крупные «планеты».
                    size: big ? 2.8 + rng() * 2.6 : 0.9 + rng() * 1.8,
                    big,
                    speedJitter: 0.85 + rng() * 0.3,
                    color: def.hue[0] + rng() * (def.hue[1] - def.hue[0]),
                    burstSpeed: 0.8 + rng() * 1.8,
                };
            }),
        }));
        // Звёзды: фон с мерцанием, глубина задаёт параллакс.
        stars = Array.from({ length: budget.stars }, () => ({
            x: rng(),
            y: rng(),
            depth: 0.2 + rng() * 0.8,
            twinkle: rng() * TAU,
            twinkleSpeed: 0.6 + rng() * 2.2,
            size: 0.4 + rng() ** 2 * 1.4,
            color: rng(),
        }));
        // Искры финала: заготовка, направления равномерны по сфере.
        sparks = Array.from({ length: budget.sparks }, (_, i) => {
            const y = 1 - (2 * (i + 0.5)) / budget.sparks;
            const r = Math.sqrt(1 - y * y);
            const a = i * GOLDEN_ANGLE + rng() * 0.3;
            return {
                dx: Math.cos(a) * r,
                dy: y,
                dz: Math.sin(a) * r,
                speed: 1.5 + rng() ** 2 * 6,
                size: 0.6 + rng() * 2.2,
                color: rng(),
            };
        });
    }

    function resize() {
        width = canvas.clientWidth || window.innerWidth;
        height = canvas.clientHeight || window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        unit = Math.min(width * 0.2, height * 0.2, 165);
        if (api.isRunning) {
            buildScene();
            if (reduced) draw(performance.now());
        }
    }

    function sprite(i, x, y, size, alpha) {
        if (alpha <= 0.003 || size <= 0.05) return;
        ctx.globalAlpha = alpha > 1 ? 1 : alpha;
        const s = sprites[i] || whiteSprite;
        ctx.drawImage(s, x - size, y - size, size * 2, size * 2);
    }

    function drawStars(t, cx, cy, fade, burst) {
        const drift = t * 6;
        for (const s of stars) {
            let x = (s.x * width + drift * s.depth) % width;
            let y = s.y * height;
            if (burst > 0) {
                // При взрыве звёзды «уносит» от центра — эффект рывка камеры.
                const k = 1 + burst * 0.35 * s.depth;
                x = cx + (x - cx) * k;
                y = cy + (y - cy) * k;
            }
            const tw = 0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.twinkle);
            sprite(colorIndex(s.color), x, y, s.size * (1.6 + s.depth), tw * 0.55 * s.depth * fade);
        }
    }

    function drawBloom(cx, cy, t, intensity, scale) {
        const pulse = 1 + Math.sin(t * 1.3) * 0.06;
        const sizes = [unit * 5.2, unit * 3.6, unit * 2.6];
        const alphas = theme === 'light' ? [0.1, 0.07, 0.06] : [0.34, 0.22, 0.17];
        for (let i = 0; i < bloomSprites.length; i++) {
            const s = (sizes[i] * scale * pulse) / 2;
            const ox = Math.cos(t * 0.21 + i * 2.1) * unit * 0.25;
            const oy = Math.sin(t * 0.17 + i * 1.7) * unit * 0.18;
            ctx.globalAlpha = Math.min(1, alphas[i] * intensity);
            ctx.drawImage(bloomSprites[i], cx + ox - s, cy + oy - s, s * 2, s * 2);
        }
    }

    function drawCore(cx, cy, t, power) {
        const beat = 1 + Math.sin(t * 2.4) * 0.08 + Math.sin(t * 5.1) * 0.03;
        const r = unit * 0.28 * beat * power;
        sprite(colorIndex(0.55), cx, cy, r * 3.2, 0.55);
        sprite(colorIndex(0.2), cx, cy, r * 2.1, 0.7);
        ctx.globalAlpha = Math.min(1, 0.9 * power);
        ctx.drawImage(whiteSprite, cx - r, cy - r, r * 2, r * 2);
        // Звёздные лучи: тонкие вытянутые блики, медленно вращаются.
        if (theme !== 'light') {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(t * 0.12);
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 4);
                const len = unit * (i % 2 ? 0.7 : 1.25) * power * beat;
                ctx.globalAlpha = (i % 2 ? 0.16 : 0.26) * Math.min(1, power);
                ctx.drawImage(whiteSprite, -len, -r * 0.08, len * 2, r * 0.16);
            }
            ctx.restore();
        }
    }

    function draw(now) {
        if (!ctx) return;
        const t = reduced ? (now - started) / 4000 : (now - started) / 1000;
        lastNow = now;
        const e =
            exitStarted === null
                ? 0
                : clamp01((now - exitStarted) / exitDuration());
        const ph =
            exitStarted === null
                ? { implode: 0, flash: 0, burst: 0, fade: 0 }
                : settings.finale === 'fade' || reduced
                  ? { implode: 0, flash: 0, burst: 0, fade: easeInOutSine(e) }
                  : exitPhases(e);
        // Появление: частицы «собираются» из глубины первые ~1,4 с.
        const intro = reduced ? 1 : easeOutCubic(clamp01(t / 1.4));
        const alive = 1 - ph.fade;
        const cx = width / 2;
        const cy = height * 0.44;

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = theme === 'light' ? 'source-over' : 'lighter';

        drawStars(t, cx, cy, intro * alive, ph.burst);

        const contract = 1 - ph.implode * 0.82;
        // Масштаб гало ограничен: огромные аддитивные заливки дороги по заполнению пикселей.
        drawBloom(cx, cy, t, (0.6 + 0.4 * intro) * alive * (1 + ph.flash * 2) * (1 - ph.burst * 0.5), Math.min(1.8, contract + ph.burst * 1.2));

        // --- Оболочка ---
        const ay = t * 0.22 + ph.implode * 2.4;
        const ax = 0.42 + Math.sin(t * 0.11) * 0.18;
        const breathe = 1 + Math.sin(t * 0.9) * 0.025;
        const shellR = unit * breathe * contract * (0.35 + 0.65 * intro);
        const explode = ph.burst;
        for (const p of shell) {
            const [x, y, z] = rotate(p.x, p.y, p.z, ax, ay + p.spin * explode);
            // Волны плотности бегут по поверхности — «тканая», объёмная сфера.
            const wave = Math.sin(p.y * 11 + Math.atan2(p.z, p.x) * 3 + t * 1.1);
            const ridge = Math.max(0, wave) ** 6;
            const r = shellR * (1 + wave * 0.03) * (1 + explode * p.burstSpeed * 5.5);
            const persp = 1 / (1 - z * 0.32);
            const px = cx + x * r * persp;
            const py = cy + y * r * persp;
            const front = (z + 1) / 2;
            const size = (p.size + ridge * 2.2) * persp * (1 + explode * 1.2);
            const alpha =
                (0.26 + front * 0.7 + ridge * 0.4) * intro * alive * (theme === 'light' ? 0.85 : 1);
            sprite(colorIndex(p.color), px, py, size, alpha);
        }

        // --- Орбиты ---
        for (const orbit of orbits) {
            const rr = orbit.radius * unit * contract * (0.4 + 0.6 * intro);
            for (const q of orbit.particles) {
                const ang = q.phase + t * orbit.speed * q.speedJitter + ph.implode * 3 * Math.sign(orbit.speed);
                const rad = rr * (1 + q.offset) * (1 + explode * q.burstSpeed * 4);
                const lx = Math.cos(ang) * rad;
                const lz = Math.sin(ang) * rad;
                const [x, y, z] = rotate(lx, q.lift * unit, lz, orbit.tiltX + ax * 0.3, orbit.tiltY + t * 0.05);
                const persp = 1 / (1 - (z / (unit * 3)) * 0.4);
                const px = cx + x * persp;
                const py = cy + y * persp;
                const front = clamp01((z / (unit * orbit.radius) + 1) / 2);
                const size = q.size * persp * (1 + explode * 0.8);
                const alpha = (0.45 + front * 0.6) * intro * alive;
                const ci = colorIndex(q.color);
                // Кометный хвост: несколько затухающих копий позади по орбите.
                if (!reduced && q.big) {
                    const tail = explode > 0 ? 4 : 6;
                    for (let k = 1; k <= tail; k++) {
                        const back = ang - Math.sign(orbit.speed) * k * 0.03 * (1 + explode * 2);
                        const brad = rad * (1 - explode * k * 0.02);
                        const [tx, ty, tz] = rotate(
                            Math.cos(back) * brad,
                            q.lift * unit,
                            Math.sin(back) * brad,
                            orbit.tiltX + ax * 0.3,
                            orbit.tiltY + t * 0.05,
                        );
                        const tp = 1 / (1 - (tz / (unit * 3)) * 0.4);
                        sprite(ci, cx + tx * tp, cy + ty * tp, size * (1 - k / (tail + 2)), alpha * 0.35 * (1 - k / (tail + 1)));
                    }
                }
                sprite(ci, px, py, size * (q.big ? 2.2 : 1.6), alpha);
            }
        }

        // --- Ядро ---
        drawCore(
            cx,
            cy,
            t,
            (0.5 + 0.5 * intro) *
                (1 + ph.implode * 1.6 + ph.flash * 4) *
                (1 - ph.burst * 0.8) *
                (1 - ph.fade),
        );

        // --- Финал: ударные волны, искры, вспышка ---
        if (ph.burst > 0) {
            const maxR = Math.hypot(width, height) * 0.75;
            // Ударные волны: тонкая яркая кромка + широкое мягкое гало (две обводки вместо blur).
            for (let i = 0; i < 3; i++) {
                const local = clamp01(ph.burst * 1.25 - i * 0.12);
                if (local <= 0 || local >= 1) continue;
                const rad = easeOutCubic(local) * maxR * (1 - i * 0.18);
                const fadeRing = (1 - local) ** 1.6 * (theme === 'light' ? 0.45 : 0.8);
                ctx.strokeStyle = palette()[[1, 6, 10][i]];
                ctx.beginPath();
                ctx.arc(cx, cy, rad, 0, TAU);
                ctx.globalAlpha = fadeRing * 0.22;
                ctx.lineWidth = Math.max(2, unit * 0.16 * (1 - local));
                ctx.stroke();
                ctx.globalAlpha = fadeRing;
                ctx.lineWidth = Math.max(1, unit * 0.022 * (1 - local * 0.6));
                ctx.stroke();
            }
            // Искры: шлейфы рисуются пачками по цвету (одна обводка на цвет вместо сотен).
            const a = (1 - ph.burst) ** 0.8 * alive;
            const prevBurst = Math.max(0, ph.burst - 0.06);
            const buckets = new Map();
            for (const s of sparks) {
                const ci = colorIndex(s.color);
                let list = buckets.get(ci);
                if (!list) buckets.set(ci, (list = []));
                list.push(s);
            }
            ctx.globalAlpha = a * 0.5;
            ctx.lineWidth = 1;
            for (const [ci, list] of buckets) {
                ctx.strokeStyle = palette()[ci];
                ctx.beginPath();
                for (const s of list) {
                    const persp = 1 / (1 - s.dz * 0.3);
                    const d = ph.burst * s.speed * unit * 2.4 * persp;
                    const pd = prevBurst * s.speed * unit * 2.4 * persp;
                    ctx.moveTo(cx + s.dx * pd, cy + s.dy * pd);
                    ctx.lineTo(cx + s.dx * d, cy + s.dy * d);
                }
                ctx.stroke();
            }
            for (const s of sparks) {
                const persp = 1 / (1 - s.dz * 0.3);
                const d = ph.burst * s.speed * unit * 2.4 * persp;
                sprite(colorIndex(s.color), cx + s.dx * d, cy + s.dy * d, s.size * 2.2, a);
            }
        }
        if (ph.flash > 0) {
            // Вспышка: белый центр → фиолетовое сияние на весь экран.
            const fr = Math.hypot(width, height) * (0.35 + ph.burst * 0.6);
            ctx.globalAlpha = ph.flash * (theme === 'light' ? 0.55 : 0.9);
            ctx.drawImage(whiteSprite, cx - fr, cy - fr, fr * 2, fr * 2);
            ctx.globalAlpha = ph.flash * 0.6;
            ctx.drawImage(bloomSprites[0], cx - fr * 1.4, cy - fr * 1.4, fr * 2.8, fr * 2.8);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function tick(now) {
        frame = null;
        if (!api.isRunning) return;
        draw(now);
        frame = requestAnimationFrame(tick);
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
            settings = readOverlaySettings();
            const motion = document.documentElement.dataset.motion;
            reduced =
                motion === 'reduce' ||
                (motion !== 'full' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
            exitStarted = null;
            exitPromise = null;
            started = performance.now();
            lastNow = started;
            api.isRunning = true;
            buildSprites();
            resize();
            buildScene();
            window.addEventListener('resize', resize);
            draw(started);
            // При «уменьшить движение» анимация тоже идёт, но в 4 раза медленнее и без хвостов/взрыва.
            if (ctx) frame = requestAnimationFrame(tick);
        },
        stop() {
            api.isRunning = false;
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            window.removeEventListener('resize', resize);
            settleExit();
        },
        resize,
        /**
         * Детерминированно нарисовать один кадр: t — секунды с начала, exit — доля финала 0..1 (или null).
         * Для превью/раскадровки и визуальных тестов; анимационный цикл не затрагивает.
         */
        renderAt(t, exit = null) {
            if (!sprites.length) {
                buildSprites();
                resize();
                buildScene();
            }
            const base = 1_000_000;
            started = base - t * (reduced ? 4000 : 1000);
            exitStarted = exit === null ? null : base - exit * exitDuration();
            draw(base);
        },
        setTheme(value) {
            theme = value === 'light' ? 'light' : 'dark';
            if (api.isRunning) {
                buildSprites();
                draw(performance.now());
            }
        },
        /** Запустить финал. Promise разрешается по таймеру (не по кадрам): фоновая вкладка не держит оверлей. */
        finish() {
            if (exitPromise) return exitPromise;
            exitStarted = performance.now();
            exitPromise = new Promise((resolve) => {
                exitResolve = resolve;
                exitTimer = setTimeout(settleExit, !ctx ? 400 : exitDuration());
            });
            return exitPromise;
        },
    };
    return api;
}
