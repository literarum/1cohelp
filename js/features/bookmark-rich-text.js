import { linkify } from '../utils/html.js';

const TAGS = new Set(
    'P DIV BR SPAN STRONG B EM I U S STRIKE SUB SUP UL OL LI H1 H2 H3 H4 BLOCKQUOTE PRE CODE HR A TABLE THEAD TBODY TFOOT TR TD TH CAPTION'.split(
        ' ',
    ),
);
const DROP = new Set(
    'SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH FORM INPUT BUTTON TEXTAREA SELECT OPTION LINK META BASE TEMPLATE NOSCRIPT AUDIO VIDEO CANVAS FRAME FRAMESET APPLET TITLE HEAD PICTURE SOURCE TRACK DIALOG XMP PLAINTEXT LISTING'.split(
        ' ',
    ),
);
export const BOOKMARK_FONTS = [
    'system-ui',
    'Arial',
    'Verdana',
    'Georgia',
    'Times New Roman',
    'Courier New',
];
export const BOOKMARK_SIZES = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };

/*
 * Встроенные изображения. В HTML хранится только ссылка на запись хранилища `screenshots`
 * (data-shot="ID") или, до сохранения, на черновик (data-shot-temp="t…"). Сам Blob в разметку
 * не попадает никогда: так не раздуваются запись закладки, поисковый индекс и история правок,
 * а резервные копии, слияние, удаление закладки и проверка целостности продолжают работать
 * со скриншотами по прежним правилам (они остаются в bookmark.screenshotIds).
 */
export const FIGURE_ALIGNS = ['left', 'center', 'right', 'wide'];
export const FIGURE_MIN_WIDTH = 15;
const SHOT_ID_RE = /^[1-9]\d{0,12}$/;
const SHOT_TEMP_RE = /^t[a-z0-9]{6,32}$/;
const round4 = (n) => Math.round(n * 10000) / 10000;
const plainText = (value, max) =>
    String(value || '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

/** "x,y,w,h" в долях исходного изображения; null — без кадрирования или некорректно. */
export function parseFigureCrop(value) {
    const parts = String(value || '')
        .split(',')
        .map((s) => Number(s.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [x, y, w, h] = parts;
    if (x < 0 || y < 0 || w < 0.02 || h < 0.02 || x + w > 1.0001 || y + h > 1.0001) return null;
    if (x < 0.0005 && y < 0.0005 && w > 0.9995 && h > 0.9995) return null;
    return { x: round4(x), y: round4(y), w: round4(Math.min(w, 1 - x)), h: round4(Math.min(h, 1 - y)) };
}
export function formatFigureCrop(crop) {
    const c = crop && parseFigureCrop(`${crop.x},${crop.y},${crop.w},${crop.h}`);
    return c ? `${c.x},${c.y},${c.w},${c.h}` : '';
}

/** Нормализованная модель figure (из исходного или уже очищенного элемента). */
export function readFigureModel(el) {
    const shot = el.getAttribute('data-shot');
    const temp = el.getAttribute('data-shot-temp');
    const align = el.getAttribute('data-align');
    const width = Number(el.getAttribute('data-width'));
    const ratio = Number(el.getAttribute('data-ratio'));
    const caption = Array.from(el.children).find((c) => c.tagName === 'FIGCAPTION');
    return {
        shot: SHOT_ID_RE.test(shot || '') ? Number(shot) : null,
        temp: !SHOT_ID_RE.test(shot || '') && SHOT_TEMP_RE.test(temp || '') ? temp : null,
        align: FIGURE_ALIGNS.includes(align) ? align : 'center',
        width:
            Number.isFinite(width) && width >= FIGURE_MIN_WIDTH && width <= 100
                ? Math.round(width)
                : 100,
        crop: parseFigureCrop(el.getAttribute('data-crop')),
        ratio: Number.isFinite(ratio) && ratio >= 0.02 && ratio <= 50 ? round4(ratio) : null,
        alt: plainText(el.getAttribute('data-alt'), 300),
        caption: caption ? plainText(caption.textContent, 500) : null,
    };
}

/** Каноническая разметка: значения по умолчанию не пишутся, чтобы сравнение «есть ли изменения» было стабильным. */
export function buildFigureElement(model) {
    const fig = document.createElement('figure');
    if (model.shot) fig.setAttribute('data-shot', String(model.shot));
    else if (model.temp) fig.setAttribute('data-shot-temp', model.temp);
    else return null;
    const align = FIGURE_ALIGNS.includes(model.align) ? model.align : 'center';
    if (align !== 'center') fig.setAttribute('data-align', align);
    // «Во всю ширину» по определению 100 %; для остальных 100 % — значение по умолчанию.
    if (align !== 'wide' && model.width && model.width !== 100)
        fig.setAttribute('data-width', String(model.width));
    const crop = formatFigureCrop(model.crop);
    if (crop) fig.setAttribute('data-crop', crop);
    if (model.ratio) fig.setAttribute('data-ratio', String(round4(model.ratio)));
    if (model.alt) fig.setAttribute('data-alt', model.alt);
    if (model.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = model.caption;
        fig.append(cap);
    }
    return fig;
}

export function hasBookmarkFigures(html) {
    return typeof html === 'string' && /<figure\b[^>]*\sdata-shot(-temp)?="/i.test(html);
}

/** ID сохранённых скриншотов, на которые ссылается текст. Без DOM: используется и при слиянии БД. */
export function bookmarkInlineShotIds(html) {
    const ids = new Set();
    if (typeof html !== 'string') return ids;
    for (const m of html.matchAll(/<figure\b[^>]*?\sdata-shot="([1-9]\d{0,12})"/gi)) ids.add(Number(m[1]));
    return ids;
}
export function bookmarkInlineTempKeys(html) {
    const keys = new Set();
    if (typeof html !== 'string') return keys;
    for (const m of html.matchAll(/<figure\b[^>]*?\sdata-shot-temp="(t[a-z0-9]{6,32})"/gi)) keys.add(m[1]);
    return keys;
}

/** Перепривязка ссылок при импорте/слиянии (старый ID → новый ID). */
export function remapBookmarkInlineShotIds(html, idMap) {
    if (typeof html !== 'string' || !idMap || !idMap.size) return html;
    return html.replace(
        /(<figure\b[^>]*?\sdata-shot=")([1-9]\d{0,12})(")/gi,
        (all, a, id, b) => {
            const mapped = idMap.get(Number(id)) ?? idMap.get(id) ?? idMap.get(String(id));
            return SHOT_ID_RE.test(String(mapped ?? '')) ? a + String(mapped) + b : all;
        },
    );
}

/** Черновики → сохранённые ID. Ссылки на черновики без записи удаляются, а не сохраняются «битыми». */
export function resolveBookmarkInlineTempShots(html, tempToId) {
    if (typeof html !== 'string' || !html) return html;
    const template = document.createElement('template');
    template.innerHTML = sanitizeBookmarkHtml(html);
    for (const fig of template.content.querySelectorAll('figure[data-shot-temp]')) {
        const id = tempToId?.get(fig.getAttribute('data-shot-temp'));
        if (!SHOT_ID_RE.test(String(id ?? ''))) {
            fig.remove();
            continue;
        }
        fig.removeAttribute('data-shot-temp');
        fig.setAttribute('data-shot', String(id));
    }
    return sanitizeBookmarkHtml(template.innerHTML);
}

/** Links created by the editor are explicit, non-executable destinations. */
export function bookmarkLink(value, normalizeHost = true) {
    let text = String(value || '').trim();
    if (!text || /[\u0000-\u001f\u007f-\u009f]/.test(text) || text.startsWith('//')) return null;
    if (/^#[\w.-]+$/.test(text)) return text;
    if (normalizeHost && !/^[a-z][a-z\d+.-]*:/i.test(text) && /^[^\s/]+\.[^\s]+/.test(text))
        text = 'https://' + text;
    try {
        const url = new URL(text);
        if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return null;
        if (
            ['https:', 'http:'].includes(url.protocol) &&
            (!url.hostname || url.username || url.password)
        )
            return null;
        return url.href;
    } catch {
        return null;
    }
}

function color(value) {
    if (!/^(#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d.%\s,/]+\)|hsla?\([\d.%\s,/deg]+\))$/i.test(value))
        return '';
    const probe = document.createElement('span');
    probe.style.color = value;
    return probe.style.color;
}
function cleanStyles(source, target) {
    const style = source.style;
    for (const key of ['color', 'background-color']) {
        const v = color(style.getPropertyValue(key).trim());
        if (v) target.style.setProperty(key, v);
    }
    const font = style.fontFamily.replace(/["']/g, '').trim();
    if (BOOKMARK_FONTS.includes(font)) target.style.fontFamily = font;
    const namedSizes = {
        'xx-small': '10px',
        'x-small': '13px',
        small: '13px',
        medium: '16px',
        large: '18px',
        'x-large': '24px',
        'xx-large': '32px',
        '-webkit-xxx-large': '48px',
    };
    const size = Object.hasOwn(namedSizes, style.fontSize)
        ? namedSizes[style.fontSize]
        : style.fontSize;
    if (/^\d+(\.\d+)?px$/.test(size) && parseFloat(size) >= 10 && parseFloat(size) <= 72)
        target.style.fontSize = size;
    if (/^(left|center|right|justify)$/.test(style.textAlign))
        target.style.textAlign = style.textAlign;
    if (/^(normal|bold|[4-9]00)$/.test(style.fontWeight))
        target.style.fontWeight = style.fontWeight;
    if (/^(normal|italic)$/.test(style.fontStyle)) target.style.fontStyle = style.fontStyle;
    if (/^(baseline|sub|super)$/.test(style.verticalAlign))
        target.style.verticalAlign = style.verticalAlign;
    const decoration = style.textDecorationLine || style.textDecoration;
    if (
        /^(underline|line-through|underline line-through|line-through underline|none)$/.test(
            decoration,
        )
    )
        target.style.textDecorationLine = decoration;
    const indent = style.marginLeft;
    if (
        /^\d+(\.\d+)?(px|em)$/.test(indent) &&
        parseFloat(indent) <= (indent.endsWith('em') ? 8 : 160)
    )
        target.style.marginLeft = indent;
    if (
        /^(disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/.test(
            style.listStyleType,
        )
    )
        target.style.listStyleType = style.listStyleType;
}

/** Inert parsing + strict allowlists. Applied to editor load, paste, save and every rich view. */
export function sanitizeBookmarkHtml(value) {
    if (typeof value !== 'string' || !value || typeof document === 'undefined') return '';
    const template = document.createElement('template');
    template.innerHTML = value;
    // Postorder without recursive JS calls: deeply nested imported markup cannot exhaust the stack.
    for (const original of Array.from(template.content.querySelectorAll('*')).reverse()) {
        let el = original;
        const tag = el.tagName;
        if (DROP.has(tag) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
            el.remove();
            continue;
        }
        if (tag === 'FIGCAPTION') {
            // Подпись — только простой текст и только внутри figure; иначе остаётся текстом.
            if (el.parentElement?.tagName === 'FIGURE') {
                const cap = document.createElement('figcaption');
                cap.textContent = plainText(el.textContent, 500);
                el.replaceWith(cap);
            } else el.replaceWith(...el.childNodes);
            continue;
        }
        if (tag === 'FIGURE') {
            // Всё содержимое, кроме подписи (img, рамки, ручки редактора), отбрасывается.
            const clean = buildFigureElement(readFigureModel(el));
            if (clean) el.replaceWith(clean);
            else el.remove();
            continue;
        }
        if (tag === 'FONT') {
            const span = document.createElement('span');
            span.style.cssText = el.style.cssText;
            const face = el.getAttribute('face');
            if (BOOKMARK_FONTS.includes(face)) span.style.fontFamily = face;
            const size = Object.hasOwn(BOOKMARK_SIZES, el.getAttribute('size'))
                ? BOOKMARK_SIZES[el.getAttribute('size')]
                : null;
            if (size) span.style.fontSize = size + 'px';
            const ink = color(el.getAttribute('color') || '');
            if (ink) span.style.color = ink;
            span.append(...el.childNodes);
            el.replaceWith(span);
            el = span;
        } else if (!TAGS.has(tag)) {
            el.replaceWith(...el.childNodes);
            continue;
        }
        const clean = document.createElement(el.tagName.toLowerCase());
        cleanStyles(el, clean);
        if (el.tagName === 'A') {
            const href = bookmarkLink(el.getAttribute('href'), false);
            if (href) {
                clean.setAttribute('href', href);
                clean.setAttribute('target', '_blank');
                clean.setAttribute('rel', 'noopener noreferrer');
            }
            if (el.hasAttribute('title')) clean.title = el.getAttribute('title');
        }
        if (['TD', 'TH'].includes(el.tagName))
            for (const name of ['colspan', 'rowspan']) {
                const n = Number(el.getAttribute(name));
                if (Number.isInteger(n) && n > 1 && n <= 100) clean.setAttribute(name, String(n));
            }
        if (el.tagName === 'OL') {
            const start = Number(el.getAttribute('start'));
            if (Number.isInteger(start) && start > 0 && start <= 9999)
                clean.setAttribute('start', String(start));
        }
        clean.append(...el.childNodes);
        el.replaceWith(clean);
    }
    const comments = document.createTreeWalker(template.content, NodeFilter.SHOW_COMMENT);
    const remove = [];
    while (comments.nextNode()) remove.push(comments.currentNode);
    remove.forEach((node) => node.remove());
    return template.innerHTML.trim();
}

export function bookmarkHtmlToText(html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeBookmarkHtml(html);
    template.content.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
    template.content.querySelectorAll('td,th').forEach((el) => el.append('\t'));
    template.content
        .querySelectorAll('p,div,li,h1,h2,h3,h4,blockquote,pre,hr,tr,table,figure,figcaption')
        .forEach((el) => el.append('\n'));
    return (template.content.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function bookmarkDescriptionHtml(bookmark) {
    if (typeof bookmark?.descriptionHtml === 'string' && bookmark.descriptionHtml.trim()) {
        const clean = sanitizeBookmarkHtml(bookmark.descriptionHtml);
        if (bookmarkHtmlToText(clean) || hasBookmarkFigures(clean)) return clean;
    }
    return bookmark?.description ? `<p>${linkify(String(bookmark.description))}</p>` : '';
}

export function bookmarkDescriptionState(form) {
    const rich = form?.elements.bookmarkDescriptionHtml;
    if (rich) {
        const html = sanitizeBookmarkHtml(rich.value);
        const text = bookmarkHtmlToText(html);
        const hasImages = hasBookmarkFigures(html);
        return { description: text, descriptionHtml: text || hasImages ? html : null, hasImages };
    }
    return {
        description: form?.elements.bookmarkDescription?.value.trim() || '',
        descriptionHtml: null,
        hasImages: false,
    };
}
