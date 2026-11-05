import { describe, it, expect } from 'vitest';
import {
    sanitizeBookmarkHtml,
    bookmarkHtmlToText,
    bookmarkDescriptionHtml,
    bookmarkLink,
} from './bookmark-rich-text.js';

describe('bookmark rich document contract', () => {
    it('retains native browser index formatting without allowing arbitrary positioning', () => {
        const host = document.createElement('div');
        host.innerHTML = sanitizeBookmarkHtml(
            '<span style="vertical-align:sub">2</span><span style="vertical-align:super">3</span><span style="vertical-align:900px;position:fixed">Other</span>',
        );
        const spans = host.querySelectorAll('span');
        expect(spans[0].style.verticalAlign).toBe('sub');
        expect(spans[1].style.verticalAlign).toBe('super');
        expect(spans[2].style.verticalAlign).toBe('');
        expect(spans[2].style.position).toBe('');
    });
    it('retains supported formatting, colors, sizes, alignment, lists and tables', () => {
        const html = sanitizeBookmarkHtml(
            '<h2>Заголовок</h2><p style="text-align:center"><b>Жирный</b> <span style="color:#c53030;background-color:#fff59d;font-size:24px;font-family:Georgia">Цвет</span></p><ol start="3"><li>Пункт</li></ol><table><tbody><tr><th>Код</th><td>111</td></tr></tbody></table>',
        );
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('h2').textContent).toBe('Заголовок');
        expect(host.querySelector('span').style.fontSize).toBe('24px');
        expect(host.querySelector('span').style.color).not.toBe('');
        expect(host.querySelector('span').style.backgroundColor).not.toBe('');
        expect(host.querySelector('p').style.textAlign).toBe('center');
        expect(host.querySelector('ol').getAttribute('start')).toBe('3');
        expect(host.querySelector('td').textContent).toBe('111');
    });
    it('never interprets legacy plain descriptions as HTML and preserves their text', () => {
        const html = bookmarkDescriptionHtml({
            description: '<b>буквально</b>\nhttps://example.test',
        });
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('b')).toBeNull();
        expect(host.textContent).toContain('<b>буквально</b>');
        expect(host.querySelector('a').getAttribute('href')).toBe('https://example.test');
    });
    it('strips active elements, arbitrary app classes and CSS, remote images and unsafe links', () => {
        const html = sanitizeBookmarkHtml(
            '<p id="searchInput" class="fixed" onclick="alert(1)" style="position:fixed;color:red;background-image:url(https://evil.test/a);opacity:0">Текст</p><script>alert(1)</script><img src="https://evil.test/image"><svg onload="alert(1)"><a href="javascript:alert(1)">bad</a></svg><a href="java&#10;script:alert(1)">ссылка</a><iframe srcdoc="bad"></iframe><form><input name="x"></form>',
        );
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(
            host.querySelector('script,img,svg,iframe,form,input,[onclick],[id],[class]'),
        ).toBeNull();
        expect(host.querySelector('p').style.position).toBe('');
        expect(host.querySelector('p').style.opacity).toBe('');
        expect(host.querySelector('p').style.backgroundImage).toBe('');
        expect(host.querySelector('a').hasAttribute('href')).toBe(false);
        expect(html).not.toContain('alert');
    });
    it('produces readable plain text without joining blocks or table cells', () => {
        const text = bookmarkHtmlToText(
            '<p>Первая<br>Вторая</p><ul><li>Один</li><li>Два</li></ul><table><tr><td>Код</td><td>111</td></tr><tr><td>Статус</td><td>Нет данных</td></tr></table>',
        );
        expect(text).toContain('Первая\nВторая');
        expect(text).toContain('Один\nДва');
        expect(text).toContain('Код\t111');
        expect(text).toContain('Статус\tНет данных');
        expect(bookmarkHtmlToText('<p><br></p>')).toBe('');
    });
    it('normalizes safe links and rejects scripts, data, control characters and protocol-relative URLs', () => {
        expect(bookmarkLink('example.test/path')).toBe('https://example.test/path');
        expect(bookmarkLink('mailto:a@example.test')).toBe('mailto:a@example.test');
        for (const value of [
            'javascript:alert(1)',
            'data:text/html,test',
            '//evil.test',
            'java\tscript:1',
        ])
            expect(bookmarkLink(value)).toBeNull();
    });
    it('is idempotent and normalizes browser font output without retaining arbitrary attributes', () => {
        const clean = sanitizeBookmarkHtml(
            '<font face="Georgia" size="5" color="#c53030">Текст</font><a href="https://example.test" target="evil">Открыть</a>',
        );
        expect(sanitizeBookmarkHtml(clean)).toBe(clean);
        const host = document.createElement('div');
        host.innerHTML = clean;
        expect(host.querySelector('span').style.fontSize).toBe('24px');
        expect(host.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer');
    });
});
