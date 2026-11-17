/**
 * Оверлей загрузки «Рождение звезды» (Canvas 2D, без библиотек).
 *
 * Слои снизу вверх (в тёмной теме — аддитивное смешивание 'lighter'):
 *   1. Фон, отрисованный один раз: процедурные туманности (десятки мягких облаков палитры),
 *      глубокое звёздное поле, яркие звёзды с дифракционными бликами; медленный параллакс.
 *   2. Мерцающие звёзды и падающие звёзды (детерминированное расписание).
 *   3. Галактический диск: частицы в двух спиральных рукавах, дифференциальное вращение
 *      (ω ∝ r^-1.5, внутренние быстрее), цвет от горячего синего у центра к маджента на краю,
 *      шлейфы движения; часть диска проходит ЗА планетой и затеняется.
 *   4. Планета: точечная оболочка с освещением по Ламберту, светящиеся меридианы-каркас,
 *      атмосферное свечение по контуру, энергетические потоки внутри.
 *   5. Три наклонённые орбиты: тонкие линии, частицы, «луны» с ореолом и хвостом.
 *   6. Ядро: многослойное свечение, анаморфный блик, 6 дифракционных лучей, мерцающая корона.
 * Финал: спиральное засасывание с наездом камеры → вспышка → ударные волны с хроматической
 * аберрацией → обломки с сопротивлением среды, закруткой и остыванием цвета, огненные фрагменты
 * с длинными шлейфами → расширяющаяся туманность-остаток; встряска камеры.
 *
 * Производительность: свечение — заранее отрисованные спрайты (без shadowBlur и ctx.filter:
 * первое дорого, второго нет в Safari), шлейфы рисуются пачками по цвету (десятки обводок
 * вместо тысяч), фон — один drawImage, обломки считаются аналитически (без пошаговой физики,
 * поэтому кадр детерминирован и не зависит от частоты кадров). Число частиц — по устройству.
 */
import { readOverlaySettings, readAccentHex, accentPalette } from './overlay-settings.js';

export const SPHERE_EXIT_MS = 2100;
/** Финал «мягкое растворение» (настройка оверлея): без вспышки и ударных волн. */
export const FADE_EXIT_MS = 900;
/** Доля финала, отведённая сжатию (≈570 мс — совпадает с задержкой гашения фона в CSS). */
export const IMPLODE_END = 0.27;

/** Гамма: синий → индиго → фиолетовый → пурпурный → маджента (+ холодные акценты). */
export const COSMIC_PALETTE_DARK = [
    '#3b82f6',
    '#60a5fa',
    '#22d3ee',
    '#6366f1',
    '#818cf8',
    '#8b5cf6',
    '#a855f7',
    '#c084fc',
    '#d946ef',
    '#e879f9',
    '#ec4899',
    '#f472b6',
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

/** Детерминированный ГПСЧ (mulberry32). */
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
    return {
        implode: easeInCubic(clamp01(e / IMPLODE_END)),
        flash: e < IMPLODE_END ? 0 : Math.max(0, 1 - (e - IMPLODE_END) / 0.2) ** 2,
        burst: e < IMPLODE_END ? 0 : easeOutExpo(clamp01((e - IMPLODE_END) / (1 - IMPLODE_END))),
        fade: clamp01((e - 0.6) / 0.4),
    };
}

/** Бюджет частиц под экран и устройство (не ниже порога). */
export function computeBudget({ width, height, cores, reduced }) {
    const area = Math.max(1, width * height);
    let k = Math.min(1, Math.sqrt(area / (1440 * 900)));
    if (cores && cores <= 4) k *= 0.7;
    if (reduced) k *= 0.6;
    k = Math.max(0.45, k);
    return {
        shell: Math.round(1500 * k),
        meridians: 9,
        meridianPoints: Math.round(56 * Math.max(0.6, k)),
        disk: Math.round(1500 * k),
        orbitParticles: Math.round(110 * k),
        flows: Math.round(100 * k),
        twinkles: Math.round(120 * k),
        staticStars: Math.round(650 * k),
        debris: Math.round(1100 * k),
        fragments: 16,
        remnant: 22,
    };
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex, a) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
};

/** Радиальный спрайт свечения: яркое ядро → цвет → прозрачность. */
function makeGlowSprite(color, size, coreWhite) {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const c = sprite.getContext('2d');
    if (!c) return sprite;
    const h = size / 2;
    const grad = c.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, coreWhite ? 'rgba(255,255,255,1)' : rgba(color, 1));
    grad.addColorStop(0.1, rgba(color, 0.95));
    grad.addColorStop(0.28, rgba(color, 0.42));
    grad.addColorStop(0.55, rgba(color, 0.12));
    grad.addColorStop(1, rgba(color, 0));
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
    return sprite;
}

/** Анаморфный блик: тонкая горизонтальная полоса, яркая в центре. */
function makeStreakSprite(color) {
    const sprite = document.createElement('canvas');
    sprite.width = 256;
    sprite.height = 16;
    const c = sprite.getContext('2d');
    if (!c) return sprite;
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.42, rgba(color, 0.55));
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, rgba(color, 0.55));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    const v = c.createLinearGradient(0, 0, 0, 16);
    c.fillRect(0, 6, 256, 4);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = v;
    c.fillRect(0, 0, 256, 16);
    return sprite;
}

function rotXY(x, y, z, ax, ay) {
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
    let dpr = 1;
    let unit = 0;
    let started = 0;
    let exitStarted = null;
    let theme = document.documentElement.dataset.loadingOverlayTheme || 'dark';
    let reduced = false;
    let settings = readOverlaySettings();
    let accentCache = null;

    let sprites = [];
    let whiteSprite = null;
    let streakSprite = null;
    let haloSprites = [];
    let bg = null;
    let planetLayers = null;
    let remnantImg = null;

    let shell = [];
    let meridians = [];
    let flows = [];
    let disk = [];
    let orbits = [];
    let twinkles = [];
    let debris = [];
    let fragments = [];
    let remnant = [];

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
    const dark = () => theme !== 'light';
    const exitDuration = () =>
        reduced ? 400 : settings.finale === 'fade' ? FADE_EXIT_MS : SPHERE_EXIT_MS;
    const colorIndex = (v) =>
        Math.min(sprites.length - 1, Math.max(0, Math.floor(clamp01(v) * sprites.length - 1e-9)));

    // ------------------------------------------------------------------ подготовка
    function buildSprites() {
        const pal = palette();
        sprites = pal.map((c) => makeGlowSprite(c, 64, dark()));
        whiteSprite = makeGlowSprite(dark() ? '#e0e7ff' : '#c7d2fe', 64, true);
        streakSprite = makeStreakSprite(pal[2]);
        haloSprites = [pal[5], pal[1], pal[10], pal[3]].map((c) => makeGlowSprite(c, 256, false));
    }

    /** Фон рисуется один раз на ресайз/смену темы: туманности + статичные звёзды. */
    function buildBackground(budget) {
        bg = document.createElement('canvas');
        const margin = 0.08;
        const bw = Math.round(width * (1 + margin * 2));
        const bh = Math.round(height * (1 + margin * 2));
        bg.width = Math.round(bw * dpr);
        bg.height = Math.round(bh * dpr);
        bg.dataset.margin = String(margin);
        const b = bg.getContext('2d');
        if (!b) return;
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
        const rng = createRng(0xbadc0de);
        const pal = palette();
        const ox = width * margin;
        const oy = height * margin;
        const cx = ox + width / 2;
        const cy = oy + height * 0.44;
        b.globalCompositeOperation = dark() ? 'lighter' : 'source-over';
        // Туманности: облака вдоль диагональной «ленты», плотнее к центру.
        for (let i = 0; i < 46; i++) {
            const along = (rng() - 0.5) * 2;
            const off = (rng() - 0.5) * (0.35 + Math.abs(along) * 0.25);
            const x = cx + along * width * 0.55 + off * width * 0.25;
            const y = cy + along * height * 0.32 - off * height * 0.5;
            const r = unit * (0.9 + rng() ** 1.5 * 3.4);
            const col = pal[Math.floor(rng() * pal.length)];
            const a = (dark() ? 0.022 : 0.03) + rng() * (dark() ? 0.045 : 0.03);
            const g = b.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, rgba(col, a));
            g.addColorStop(0.5, rgba(col, a * 0.45));
            g.addColorStop(1, rgba(col, 0));
            b.fillStyle = g;
            b.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // Внешнее свечение вокруг ядра (статично; живые внутренние слои — в drawHalo).
        for (let i = 0; i < 2; i++) {
            const r = (unit * [7.5, 5][i]) / 2;
            b.globalAlpha = (dark() ? [0.3, 0.22] : [0.08, 0.06])[i];
            b.drawImage(haloSprites[i], cx - r, cy - r, r * 2, r * 2);
        }
        b.globalAlpha = 1;
        // Звёздная пыль.
        for (let i = 0; i < budget.staticStars; i++) {
            const x = rng() * bw;
            const y = rng() * bh;
            const s = rng() < 0.92 ? 0.6 + rng() * 0.6 : 1.2 + rng();
            const tint = rng();
            b.fillStyle = dark()
                ? tint < 0.7
                    ? `rgba(226,232,255,${0.2 + rng() * 0.55})`
                    : rgba(pal[Math.floor(rng() * pal.length)], 0.35 + rng() * 0.4)
                : `rgba(67,56,202,${0.08 + rng() * 0.18})`;
            b.fillRect(x, y, s, s);
        }
        // Яркие звёзды с дифракционными бликами.
        for (let i = 0; i < 14; i++) {
            const x = rng() * bw;
            const y = rng() * bh;
            const s = 1.5 + rng() * 2.5;
            const col = pal[Math.floor(rng() * pal.length)];
            b.globalAlpha = dark() ? 0.85 : 0.4;
            b.drawImage(makeGlowSprite(col, 32, dark()), x - s * 4, y - s * 4, s * 8, s * 8);
            b.globalAlpha = dark() ? 0.5 : 0.25;
            b.fillStyle = rgba(dark() ? '#ffffff' : col, 0.6);
            b.fillRect(x - s * 7, y - 0.4, s * 14, 0.8);
            b.fillRect(x - 0.4, y - s * 7, 0.8, s * 14);
        }
        b.globalAlpha = 1;
    }

    /** Тело планеты, освещённая сторона, кромка и атмосфера — один раз на размер/тему. */
    function buildPlanetLayers() {
        const ref = Math.max(8, Math.round(unit));
        const size = Math.ceil(ref * 2.7);
        const scale = Math.min(2, dpr);
        const mk = () => {
            const c = document.createElement('canvas');
            c.width = c.height = Math.round(size * scale);
            const g = c.getContext('2d');
            g?.setTransform(scale, 0, 0, scale, 0, 0);
            return [c, g];
        };
        const pal = palette();
        const h = size / 2;
        let body = null;
        if (dark()) {
            const [c, g] = mk();
            if (g) {
                const grad = g.createRadialGradient(h - ref * 0.35, h - ref * 0.35, ref * 0.1, h, h, ref);
                grad.addColorStop(0, 'rgba(30,22,70,0.92)');
                grad.addColorStop(1, 'rgba(8,6,22,0.96)');
                g.fillStyle = grad;
                g.beginPath();
                g.arc(h, h, ref * 1.01, 0, TAU);
                g.fill();
            }
            body = c;
        }
        const [glow, g] = mk();
        if (g) {
            g.globalCompositeOperation = dark() ? 'lighter' : 'source-over';
            const lit = g.createRadialGradient(h - ref * 0.42, h - ref * 0.45, 0, h - ref * 0.2, h - ref * 0.2, ref * 1.1);
            lit.addColorStop(0, rgba(pal[1], dark() ? 0.42 : 0.22));
            lit.addColorStop(0.45, rgba(pal[5], dark() ? 0.16 : 0.1));
            lit.addColorStop(1, rgba(pal[5], 0));
            g.fillStyle = lit;
            g.beginPath();
            g.arc(h, h, ref, 0, TAU);
            g.fill();
            // Кромка с освещённой стороны.
            g.globalAlpha = dark() ? 0.55 : 0.35;
            g.strokeStyle = rgba(pal[2], 0.9);
            g.lineWidth = Math.max(1, ref * 0.02);
            g.beginPath();
            g.arc(h, h, ref * 0.995, Math.PI * 0.8, Math.PI * 1.75);
            g.stroke();
            g.globalAlpha = 1;
            // Атмосфера.
            const atm = g.createRadialGradient(h, h, ref * 0.88, h, h, ref * 1.32);
            atm.addColorStop(0, rgba(pal[4], 0));
            atm.addColorStop(0.22, rgba(pal[4], dark() ? 0.32 : 0.18));
            atm.addColorStop(0.5, rgba(pal[6], dark() ? 0.12 : 0.07));
            atm.addColorStop(1, rgba(pal[6], 0));
            g.fillStyle = atm;
            g.beginPath();
            g.arc(h, h, ref * 1.32, 0, TAU);
            g.fill();
        }
        planetLayers = { ref, size, body, glow };
    }

    function buildScene() {
        const rng = createRng();
        const budget = computeBudget({
            width,
            height,
            cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8,
            reduced,
        });
        // Оболочка (решётка Фибоначчи).
        shell = Array.from({ length: budget.shell }, (_, i) => {
            const y = 1 - (2 * (i + 0.5)) / budget.shell;
            const r = Math.sqrt(1 - y * y);
            const a = i * GOLDEN_ANGLE;
            return {
                x: Math.cos(a) * r,
                y,
                z: Math.sin(a) * r,
                c: clamp01(((1 - y) / 2) * 0.8 + rng() * 0.2),
                s: 0.7 + rng() ** 3 * 2,
                seed: rng(),
            };
        });
        // Меридианы — каркас глобуса.
        meridians = [];
        for (let m = 0; m < budget.meridians; m++) {
            const phi = (m / budget.meridians) * Math.PI;
            for (let k = 0; k < budget.meridianPoints; k++) {
                const th = (k / budget.meridianPoints) * TAU;
                meridians.push({
                    x: Math.cos(th) * Math.cos(phi),
                    y: Math.sin(th),
                    z: Math.cos(th) * Math.sin(phi),
                    c: 0.3 + 0.25 * Math.sin(th),
                });
            }
        }
        // Энергетические потоки внутри планеты: точки на наклонных петлях.
        flows = Array.from({ length: budget.flows }, () => ({
            loop: rng(),
            r: 0.35 + rng() * 0.5,
            tilt: rng() * Math.PI,
            phase: rng() * TAU,
            speed: 0.8 + rng() * 1.6,
        }));
        // Галактический диск: два спиральных рукава + рассеянная составляющая.
        const rMin = 1.18;
        const rMax = 3.3;
        disk = Array.from({ length: budget.disk }, () => {
            const u = rng();
            const r = rMin + (rMax - rMin) * u ** 1.55;
            const inArm = rng() < 0.7;
            const arm = rng() < 0.5 ? 0 : Math.PI;
            const g = (rng() + rng() + rng() - 1.5) * 0.45;
            const theta = inArm ? arm + Math.log(r) * 2.6 + g : rng() * TAU;
            const t = (r - rMin) / (rMax - rMin);
            return {
                r,
                theta,
                h: (rng() - 0.5) * 0.06 * (1 + t),
                omega: 0.95 * (r / rMin) ** -1.5,
                c: clamp01(t * 0.95 + (rng() - 0.5) * 0.12),
                s: 0.6 + rng() ** 2 * 1.6,
                bright: rng() < 0.28,
                seed: rng(),
            };
        });
        // Орбиты.
        const defs = [
            { radius: 1.55, tiltX: 1.08, roll: 0.5, speed: 0.62, hue: [0.0, 0.3] },
            { radius: 2.05, tiltX: -0.7, roll: -0.85, speed: -0.42, hue: [0.45, 0.72] },
            { radius: 2.65, tiltX: 0.32, roll: 1.25, speed: 0.28, hue: [0.72, 1.0] },
        ];
        orbits = defs.map((d) => ({
            ...d,
            particles: Array.from({ length: budget.orbitParticles }, () => ({
                phase: rng() * TAU,
                off: (rng() - 0.5) * 0.05,
                s: 0.6 + rng() * 1.3,
                c: d.hue[0] + rng() * (d.hue[1] - d.hue[0]),
            })),
            moons: [0, 1].map(() => ({ phase: rng() * TAU, s: 3 + rng() * 2.5, c: d.hue[0] + rng() * (d.hue[1] - d.hue[0]) })),
        }));
        twinkles = Array.from({ length: budget.twinkles }, () => ({
            x: rng(),
            y: rng(),
            depth: 0.3 + rng() * 0.7,
            ph: rng() * TAU,
            sp: 0.6 + rng() * 2.4,
            s: 0.6 + rng() ** 2 * 1.6,
            c: rng(),
        }));
        // Обломки взрыва: направления по сфере, скорости и сопротивление — разные.
        debris = Array.from({ length: budget.debris }, (_, i) => {
            const y = 1 - (2 * (i + 0.5)) / budget.debris;
            const r = Math.sqrt(1 - y * y);
            const a = i * GOLDEN_ANGLE + rng() * 0.4;
            return {
                dx: Math.cos(a) * r,
                dy: y * 0.75,
                dz: Math.sin(a) * r,
                v: 3.5 + rng() ** 1.3 * 13,
                k: 1.1 + rng() * 2.2,
                spin: (rng() - 0.5) * 1.6,
                s: 0.8 + rng() ** 2 * 2.8,
                c: rng(),
                life: 0.6 + rng() * 0.4,
            };
        });
        fragments = Array.from({ length: budget.fragments }, () => {
            const a = rng() * TAU;
            return { dx: Math.cos(a), dy: Math.sin(a) * 0.8, v: 9 + rng() * 9, k: 1 + rng() * 0.8, spin: (rng() - 0.5) * 0.8, s: 4 + rng() * 4, c: rng() };
        });
        remnant = Array.from({ length: budget.remnant }, () => {
            const a = rng() * TAU;
            return { a, d: 0.4 + rng() * 1.6, r: 1.2 + rng() * 2.2, c: Math.floor(rng() * 12), al: 0.05 + rng() * 0.07 };
        });
        buildBackground(budget);
        buildPlanetLayers();
        buildRemnant();
    }

    /** Облака туманности после взрыва — в 1/4 разрешения (мягкие, детали не нужны). */
    function buildRemnant() {
        // Квадрат ±13 unit вокруг центра: самые дальние облака гаснут внутри, без видимых краёв буфера.
        const extent = unit * 26;
        const q = Math.min(0.25, 640 / extent);
        const c = document.createElement('canvas');
        c.width = c.height = Math.max(1, Math.round(extent * q));
        const g = c.getContext('2d');
        remnantImg = c;
        if (!g) return;
        g.setTransform(q, 0, 0, q, 0, 0);
        g.globalCompositeOperation = dark() ? 'lighter' : 'source-over';
        const pal = palette();
        const ox = extent / 2;
        const oy = extent / 2;
        for (const n of remnant) {
            const x = ox + Math.cos(n.a) * n.d * unit * 2.6;
            const y = oy + Math.sin(n.a) * n.d * unit * 2.0;
            const r = n.r * unit * 2.1;
            const al = n.al * (dark() ? 1.6 : 0.55);
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, rgba(pal[n.c], al));
            grad.addColorStop(0.5, rgba(pal[n.c], al * 0.45));
            grad.addColorStop(1, rgba(pal[n.c], 0));
            g.fillStyle = grad;
            g.fillRect(x - r, y - r, r * 2, r * 2);
        }
    }

    function resize() {
        width = canvas.clientWidth || window.innerWidth;
        height = canvas.clientHeight || window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        unit = Math.min(width * 0.13, height * 0.15, 128);
        if (api.isRunning) {
            buildScene();
            if (reduced) draw(performance.now());
        }
    }

    // ------------------------------------------------------------------ рисование
    function sprite(i, x, y, size, alpha) {
        if (alpha <= 0.015 || size <= 0.05) return;
        ctx.globalAlpha = alpha > 1 ? 1 : alpha;
        const s = sprites[i] || whiteSprite;
        ctx.drawImage(s, x - size, y - size, size * 2, size * 2);
    }

    /** Пачки линий по цвету: [индекс цвета] → массив сегментов. */
    function newBuckets() {
        return Array.from({ length: sprites.length }, () => []);
    }
    function strokeBuckets(buckets, width, alpha) {
        const pal = palette();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.lineCap = 'butt';
        for (let i = 0; i < buckets.length; i++) {
            const segs = buckets[i];
            if (!segs.length) continue;
            ctx.strokeStyle = pal[i];
            ctx.beginPath();
            for (let j = 0; j < segs.length; j += 4) {
                ctx.moveTo(segs[j], segs[j + 1]);
                ctx.lineTo(segs[j + 2], segs[j + 3]);
            }
            ctx.stroke();
        }
    }

    function drawBackground(t, alpha, burst) {
        if (!bg || alpha <= 0) return;
        const m = Number(bg.dataset.margin) || 0;
        const ox = -width * m + Math.sin(t * 0.05) * width * m * 0.3;
        const oy = -height * m + Math.cos(t * 0.04) * height * m * 0.25;
        const bw = width * (1 + 2 * m);
        const bh = height * (1 + 2 * m);
        ctx.globalAlpha = alpha;
        // Без масштабирования и с целочисленным (в пикселях устройства) сдвигом — быстрый путь копирования;
        // при взрыве фон слегка «отпрыгивает» назад (сдвиг вниз-вправо без ресэмплинга).
        const kick = burst > 0 ? Math.sin(Math.min(1, burst) * Math.PI) * unit * 0.04 : 0;
        ctx.drawImage(bg, Math.round((ox + kick) * dpr) / dpr, Math.round((oy + kick) * dpr) / dpr, bw, bh);
    }

    function drawTwinkles(t, alpha) {
        for (const s of twinkles) {
            const x = ((s.x * width + t * 5 * s.depth) % width + width) % width;
            const y = s.y * height;
            const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
            sprite(colorIndex(s.c), x, y, s.s * (1.4 + s.depth) * (0.7 + tw * 0.6), tw * 0.6 * s.depth * alpha);
        }
    }

    /** Падающие звезда: детерминированно по номеру интервала (кадр зависит только от t). */
    function drawShootingStars(t, alpha) {
        if (reduced || alpha <= 0) return;
        const period = 1.7;
        const n = Math.floor(t / period);
        for (const k of [n - 1, n]) {
            if (k < 0) continue;
            const rng = createRng(0x5eed + k * 977);
            if (rng() < 0.35) continue;
            const local = (t - k * period) / 0.9;
            if (local < 0 || local > 1) continue;
            const x0 = width * (0.1 + rng() * 0.8);
            const y0 = height * (0.05 + rng() * 0.3);
            const ang = Math.PI * (0.15 + rng() * 0.2) * (rng() < 0.5 ? 1 : -1) + (rng() < 0.5 ? 0 : Math.PI);
            const len = unit * (2 + rng() * 2);
            const p = easeOutCubic(local);
            const hx = x0 + Math.cos(ang) * len * 2 * p;
            const hy = y0 + Math.abs(Math.sin(ang)) * len * 2 * p;
            const tail = len * 0.6 * (1 - local * 0.5);
            const grad = ctx.createLinearGradient(hx, hy, hx - Math.cos(ang) * tail, hy - Math.abs(Math.sin(ang)) * tail);
            grad.addColorStop(0, 'rgba(255,255,255,0.9)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = alpha * Math.sin(local * Math.PI);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx - Math.cos(ang) * tail, hy - Math.abs(Math.sin(ang)) * tail);
            ctx.stroke();
            sprite(2, hx, hy, 3, alpha * Math.sin(local * Math.PI));
        }
    }

    function drawHalo(cx, cy, t, intensity, scale) {
        const pulse = 1 + Math.sin(t * 1.2) * 0.05;
        // Два внешних слоя «запечены» в фон; здесь — два внутренних, живых.
        const sizes = [unit * 7.5, unit * 5, unit * 3.6, unit * 2.4];
        const alphas = dark() ? [0.3, 0.22, 0.18, 0.2] : [0.08, 0.06, 0.05, 0.05];
        for (let i = 2; i < haloSprites.length; i++) {
            const s = (sizes[i] * scale * pulse) / 2;
            const ox = Math.cos(t * 0.19 + i * 2.1) * unit * 0.3;
            const oy = Math.sin(t * 0.15 + i * 1.7) * unit * 0.2;
            ctx.globalAlpha = Math.min(1, alphas[i] * intensity);
            ctx.drawImage(haloSprites[i], cx + ox - s, cy + oy - s, s * 2, s * 2);
        }
    }

    /** Проекция точки диска (наклон + крен + перспектива). */
    function diskPoint(r, theta, h, cx, cy, incl, roll) {
        const x = Math.cos(theta) * r;
        const z0 = Math.sin(theta) * r;
        const y1 = h * Math.cos(incl) - z0 * Math.sin(incl);
        const z1 = h * Math.sin(incl) + z0 * Math.cos(incl);
        const xr = x * Math.cos(roll) - y1 * Math.sin(roll);
        const yr = x * Math.sin(roll) + y1 * Math.cos(roll);
        const persp = 1 / (1 - (z1 / 10) * 0.9);
        return [cx + xr * unit * persp, cy + yr * unit * persp, z1, persp];
    }

    function drawDisk(t, cx, cy, ph, shellR, intro, alive) {
        const incl = 1.18 + Math.sin(t * 0.13) * 0.04;
        const roll = -0.32 + Math.sin(t * 0.09) * 0.03;
        const back = newBuckets();
        const front = newBuckets();
        const heads = [];
        const spin = ph.implode * 7;
        const shrink = 1 - ph.implode * 0.88;
        for (const p of disk) {
            const r = p.r * shrink * (0.55 + 0.45 * intro);
            const th = p.theta + t * p.omega * (1 + ph.implode * 3) + spin * p.omega;
            const [x, y, z, persp] = diskPoint(r, th, p.h, cx, cy, incl, roll);
            const [x2, y2] = diskPoint(r, th - 0.06 * p.omega * (1 + ph.implode * 4), p.h, cx, cy, incl, roll);
            const ci = colorIndex(p.c);
            const behind = z < 0 && Math.hypot(x - cx, y - cy) < shellR * 0.98;
            (z < 0 ? back : front)[ci].push(x2, y2, x, y);
            if (p.bright && !behind) heads.push(ci, x, y, p.s * persp * 1.8, (0.55 + 0.45 * (z > 0 ? 1 : 0.5)));
        }
        const a = intro * alive;
        // Задняя половина диска тусклее (и частично скрыта планетой, которая рисуется поверх).
        strokeBuckets(back, 1.1, (dark() ? 0.35 : 0.3) * a);
        return { front, heads, a };
    }

    function drawDiskFront(diskState) {
        const { front, heads, a } = diskState;
        strokeBuckets(front, 1.3, (dark() ? 0.75 : 0.55) * a);
        for (let i = 0; i < heads.length; i += 5) sprite(heads[i], heads[i + 1], heads[i + 2], heads[i + 3], heads[i + 4] * a);
    }

    function drawPlanet(t, cx, cy, R, ph, intro, alive) {
        if (R <= 1) return;
        const ay = t * 0.2 + ph.implode * 3;
        const ax = 0.38 + Math.sin(t * 0.1) * 0.12;
        // Тело (закрывает задний диск) и объёмный свет — заранее отрисованные слои.
        const pr = planetLayers;
        if (pr) {
            const k = R / pr.ref;
            const half = (pr.size / 2) * k;
            ctx.globalAlpha = intro * alive;
            if (pr.body) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(pr.body, cx - half, cy - half, half * 2, half * 2);
                ctx.globalCompositeOperation = 'lighter';
            }
            ctx.drawImage(pr.glow, cx - half, cy - half, half * 2, half * 2);
        }
        // Свет сверху-слева-спереди.
        const L = [-0.55, -0.6, 0.58];
        for (const p of shell) {
            const [x, y, z] = rotXY(p.x, p.y, p.z, ax, ay);
            // Дальняя полусфера скрыта телом планеты — не тратим на неё кадр.
            if (z < -0.22) continue;
            const lam = Math.max(0, x * L[0] + y * L[1] + z * L[2]);
            const front = (z + 1) / 2;
            const wave = Math.max(0, Math.sin(p.y * 9 + Math.atan2(p.z, p.x) * 3 + t * 1.2)) ** 6;
            const persp = 1 / (1 - z * 0.25);
            const al = (0.06 + front * 0.35 + lam * 0.65 + wave * 0.4) * intro * alive;
            sprite(colorIndex(p.c * 0.7 + lam * 0.3), cx + x * R * persp, cy + y * R * persp, (p.s * 1.45 + wave * 2) * persp * (0.7 + front * 0.6), al);
        }
        // Каркас-меридианы: только передняя полусфера, мягко.
        for (const m of meridians) {
            const [x, y, z] = rotXY(m.x, m.y, m.z, ax, ay);
            if (z < -0.05) continue;
            const persp = 1 / (1 - z * 0.25);
            sprite(colorIndex(m.c), cx + x * R * persp, cy + y * R * persp, 1.25 * persp, (0.18 + z * 0.5) * intro * alive);
        }
        // Потоки энергии.
        for (const f of flows) {
            const a = f.phase + t * f.speed;
            const lx = Math.cos(a) * f.r;
            const ly = Math.sin(a) * f.r * 0.35;
            const [x, y, z] = rotXY(lx, ly * Math.cos(f.tilt), ly * Math.sin(f.tilt), ax * 0.5, ay * 0.6 + f.tilt);
            sprite(2, cx + x * R, cy + y * R, 1.1, (0.25 + (z + 1) * 0.25) * intro * alive);
        }
    }

    function drawOrbits(t, cx, cy, ph, intro, alive) {
        const shrink = 1 - ph.implode * 0.85;
        const a = intro * alive;
        for (const o of orbits) {
            const R = o.radius * shrink * (0.5 + 0.5 * intro);
            // Тонкая линия орбиты.
            ctx.globalAlpha = (dark() ? 0.09 : 0.12) * a;
            ctx.strokeStyle = palette()[colorIndex((o.hue[0] + o.hue[1]) / 2)];
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            for (let k = 0; k <= 96; k++) {
                const [x, y] = diskPoint(R, (k / 96) * TAU, 0, cx, cy, o.tiltX, o.roll);
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            for (const p of o.particles) {
                const th = p.phase + t * o.speed * (1 + ph.implode * 4);
                const [x, y, z, persp] = diskPoint(R * (1 + p.off), th, 0, cx, cy, o.tiltX, o.roll);
                sprite(colorIndex(p.c), x, y, p.s * persp * 1.5, (0.35 + (z > 0 ? 0.5 : 0.1)) * a);
            }
            for (const m of o.moons) {
                const th = m.phase + t * o.speed * 0.8 * (1 + ph.implode * 4);
                const ci = colorIndex(m.c);
                for (let k = 7; k >= 1; k--) {
                    const [tx, ty] = diskPoint(R, th - Math.sign(o.speed) * k * 0.035, 0, cx, cy, o.tiltX, o.roll);
                    sprite(ci, tx, ty, m.s * (1 - k / 9), 0.25 * (1 - k / 8) * a);
                }
                const [x, y, z, persp] = diskPoint(R, th, 0, cx, cy, o.tiltX, o.roll);
                sprite(ci, x, y, m.s * persp * 2.6, (z > 0 ? 0.55 : 0.2) * a);
                ctx.globalAlpha = (z > 0 ? 0.9 : 0.3) * a;
                ctx.drawImage(whiteSprite, x - m.s * 0.7, y - m.s * 0.7, m.s * 1.4, m.s * 1.4);
            }
        }
    }

    function drawCore(cx, cy, t, power) {
        if (power <= 0) return;
        const beat = 1 + Math.sin(t * 2.3) * 0.07 + Math.sin(t * 5.3) * 0.03;
        const r = unit * 0.24 * beat * power;
        sprite(colorIndex(0.5), cx, cy, r * 5, 0.5);
        sprite(colorIndex(0.15), cx, cy, r * 3, 0.65);
        ctx.globalAlpha = Math.min(1, 0.95 * power);
        ctx.drawImage(whiteSprite, cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
        if (!dark()) return;
        // Анаморфный блик.
        const sw = unit * 6 * Math.min(2, power) * beat;
        ctx.globalAlpha = Math.min(1, 0.55 * power);
        ctx.drawImage(streakSprite, cx - sw / 2, cy - r * 0.18, sw, r * 0.36);
        // Дифракционные лучи (6) с медленным вращением.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.07);
        for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            const len = unit * (1.1 + 0.25 * Math.sin(t * 1.7 + i)) * power;
            ctx.globalAlpha = 0.22 * Math.min(1, power);
            ctx.drawImage(whiteSprite, -len, -r * 0.05, len * 2, r * 0.1);
        }
        ctx.restore();
        // Корона: тонкие мерцающие лучи.
        ctx.globalAlpha = 0.18 * Math.min(1, power);
        ctx.strokeStyle = palette()[1];
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 0; i < 36; i++) {
            const a = (i / 36) * TAU + t * 0.05;
            const l = r * (1.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * 2.1 + i * 2.3)));
            ctx.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
            ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
        }
        ctx.stroke();
    }

    /** Аналитическое движение с сопротивлением: пройденный путь за τ секунд. */
    const dragDist = (v, k, tau) => (v * (1 - Math.exp(-k * tau))) / k;

    function drawExplosion(cx, cy, ph, e) {
        const dur = exitDuration() / 1000;
        const tau = Math.max(0, (e - IMPLODE_END) * dur);
        if (tau <= 0) return;
        const pal = palette();
        const maxR = Math.hypot(width, height) * 0.75;
        // Туманность-остаток: заранее отрисована в уменьшенный буфер, здесь — одно масштабирование.
        const grow = easeOutCubic(clamp01(tau / 1.4));
        const nebA = Math.sin(Math.min(1, tau / 1.2) * Math.PI * 0.9) * (1 - ph.fade);
        if (nebA > 0.01 && remnantImg) {
            const size = unit * 26 * (0.35 + 0.65 * grow);
            ctx.globalAlpha = Math.min(1, nebA);
            ctx.drawImage(remnantImg, cx - size / 2, cy - size / 2, size, size);
        }
        // Ударные волны с хроматической аберрацией.
        for (let i = 0; i < 3; i++) {
            const local = clamp01(ph.burst * 1.25 - i * 0.13);
            if (local <= 0 || local >= 1) continue;
            const rad = easeOutCubic(local) * maxR * (1 - i * 0.2);
            const fadeRing = (1 - local) ** 1.6 * (dark() ? 0.85 : 0.45);
            const w = Math.max(1, unit * 0.03 * (1 - local * 0.6));
            const layers = [
                [pal[2], -w * 1.6, 0.6],
                ['#ffffff', 0, 1],
                [pal[10], w * 1.6, 0.6],
            ];
            ctx.globalAlpha = fadeRing * 0.18;
            ctx.strokeStyle = pal[5];
            ctx.lineWidth = Math.max(3, unit * 0.22 * (1 - local));
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, TAU);
            ctx.stroke();
            for (const [col, off, k] of layers) {
                ctx.globalAlpha = fadeRing * k;
                ctx.strokeStyle = col;
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.arc(cx, cy, Math.max(1, rad + off), 0, TAU);
                ctx.stroke();
            }
        }
        // Обломки: путь с сопротивлением, закрутка, остывание (белый → цвет → угасание).
        const trails = newBuckets();
        const hot = [];
        const heads = [];
        for (const d of debris) {
            const life = clamp01(tau / (dur * d.life));
            if (life >= 1) continue;
            const dist = dragDist(d.v, d.k, tau) * unit;
            const prev = dragDist(d.v, d.k, Math.max(0, tau - 0.05)) * unit;
            const sw = d.spin * (1 - Math.exp(-d.k * tau));
            const cs = Math.cos(sw);
            const sn = Math.sin(sw);
            const dxr = d.dx * cs - d.dy * sn;
            const dyr = d.dx * sn + d.dy * cs;
            const persp = 1 / (1 - d.dz * 0.3);
            const x = cx + dxr * dist * persp;
            const y = cy + dyr * dist * persp;
            const px = cx + dxr * prev * persp;
            const py = cy + dyr * prev * persp;
            const ci = colorIndex(d.c);
            const a = (1 - life) ** 0.9;
            if (life < 0.18) hot.push(px, py, x, y);
            else trails[ci].push(px, py, x, y);
            heads.push(ci, x, y, d.s * (1.2 + (1 - life)), a);
        }
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = dark() ? '#ffffff' : pal[3];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < hot.length; i += 4) {
            ctx.moveTo(hot[i], hot[i + 1]);
            ctx.lineTo(hot[i + 2], hot[i + 3]);
        }
        ctx.stroke();
        strokeBuckets(trails, 1, 0.55 * (1 - ph.fade));
        for (let i = 0; i < heads.length; i += 5) sprite(heads[i], heads[i + 1], heads[i + 2], heads[i + 3], heads[i + 4] * (1 - ph.fade * 0.6));
        // Огненные фрагменты с длинными шлейфами.
        for (const f of fragments) {
            const dist = dragDist(f.v, f.k, tau) * unit;
            const sw = f.spin * (1 - Math.exp(-f.k * tau));
            const dxr = f.dx * Math.cos(sw) - f.dy * Math.sin(sw);
            const dyr = f.dx * Math.sin(sw) + f.dy * Math.cos(sw);
            const a = Math.max(0, 1 - tau / dur) * (1 - ph.fade);
            const ci = colorIndex(f.c);
            for (let k = 10; k >= 0; k--) {
                const tk = Math.max(0, tau - k * 0.025);
                const dk = dragDist(f.v, f.k, tk) * unit;
                sprite(ci, cx + dxr * dk, cy + dyr * dk, f.s * 1.6 * (1 - k / 13), a * (1 - k / 11) * 0.85);
            }
            ctx.globalAlpha = a;
            ctx.drawImage(whiteSprite, cx + dxr * dist - f.s, cy + dyr * dist - f.s, f.s * 2, f.s * 2);
        }
    }

    function drawFlash(cx, cy, ph) {
        if (ph.flash <= 0) return;
        const fr = Math.hypot(width, height) * (0.32 + ph.burst * 0.55);
        ctx.globalAlpha = ph.flash * (dark() ? 0.95 : 0.55);
        ctx.drawImage(whiteSprite, cx - fr, cy - fr, fr * 2, fr * 2);
        ctx.globalAlpha = ph.flash * (dark() ? 0.6 : 0.3);
        ctx.drawImage(haloSprites[0], cx - fr * 1.5, cy - fr * 1.5, fr * 3, fr * 3);
        if (dark()) {
            const sw = width * 1.6;
            ctx.globalAlpha = ph.flash;
            ctx.drawImage(streakSprite, cx - sw / 2, cy - unit * 0.08, sw, unit * 0.16);
        }
    }

    function draw(now) {
        if (!ctx) return;
        const t = reduced ? (now - started) / 4000 : (now - started) / 1000;
        const e = exitStarted === null ? 0 : clamp01((now - exitStarted) / exitDuration());
        const fadeOnly = settings.finale === 'fade' || reduced;
        const ph =
            exitStarted === null
                ? { implode: 0, flash: 0, burst: 0, fade: 0 }
                : fadeOnly
                  ? { implode: 0, flash: 0, burst: 0, fade: easeInOutSine(e) }
                  : exitPhases(e);
        const intro = reduced ? 1 : easeOutCubic(clamp01(t / 1.6));
        const alive = 1 - ph.fade;
        // Встряска камеры в первые мгновения взрыва.
        const shake = ph.burst > 0 && ph.burst < 0.6 ? (1 - ph.burst / 0.6) ** 2 * unit * 0.05 : 0;
        const cx = width / 2 + Math.sin(now * 0.09) * shake;
        const cy = height * 0.44 + Math.cos(now * 0.11) * shake;
        const zoom = 1 + ph.implode * 0.07;

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = dark() ? 'lighter' : 'source-over';

        drawBackground(t, (0.55 + 0.45 * intro) * alive, ph.burst);
        drawTwinkles(t, intro * alive);
        drawShootingStars(t, intro * alive * (1 - ph.implode));

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);

        const contract = 1 - ph.implode * 0.85;
        const visibleWorld = ph.burst < 0.02;
        drawHalo(cx, cy, t, (0.6 + 0.4 * intro) * alive * (1 + ph.implode * 1.5) * (1 - ph.burst * 0.6), Math.min(1.8, contract + ph.burst));
        if (visibleWorld) {
            const R = unit * contract * (0.4 + 0.6 * intro) * (1 + Math.sin(t * 0.8) * 0.015);
            const diskState = drawDisk(t, cx, cy, ph, R, intro, alive);
            drawPlanet(t, cx, cy, R, ph, intro, alive);
            drawDiskFront(diskState);
            drawOrbits(t, cx, cy, ph, intro, alive);
        }
        drawCore(cx, cy, t, (0.55 + 0.45 * intro) * (1 + ph.implode * 2 + ph.flash * 4) * (1 - ph.burst * 0.85) * alive);
        ctx.restore();

        if (!fadeOnly && exitStarted !== null) drawExplosion(cx, cy, ph, e);
        drawFlash(cx, cy, ph);

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
            api.isRunning = true;
            buildSprites();
            resize();
            buildScene();
            window.addEventListener('resize', resize);
            draw(started);
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
        /** Детерминированно нарисовать кадр: t — секунды, exit — доля финала 0..1 или null. */
        renderAt(t, exit = null) {
            if (!sprites.length) {
                settings = readOverlaySettings();
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
                buildScene();
                draw(performance.now());
            }
        },
        /** Запустить финал. Promise — по таймеру (не по кадрам): фоновая вкладка не держит оверлей. */
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
