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
        .querySelectorAll('p,div,li,h1,h2,h3,h4,blockquote,pre,hr,tr,table')
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
        if (bookmarkHtmlToText(clean)) return clean;
    }
    return bookmark?.description ? `<p>${linkify(String(bookmark.description))}</p>` : '';
}

export function bookmarkDescriptionState(form) {
    const rich = form?.elements.bookmarkDescriptionHtml;
    if (rich) {
        const html = sanitizeBookmarkHtml(rich.value);
        const text = bookmarkHtmlToText(html);
        return { description: text, descriptionHtml: text ? html : null };
    }
    return {
        description: form?.elements.bookmarkDescription?.value.trim() || '',
        descriptionHtml: null,
    };
}
