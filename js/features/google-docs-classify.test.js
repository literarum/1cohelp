import { describe, it, expect, vi, afterEach } from 'vitest';
import { classifyNonJsonBody, fetchGoogleDocs } from './google-docs.js';

describe('classifyNonJsonBody', () => {
    const err = new SyntaxError('Unexpected token <');

    it('страница входа Google → kind=auth', () => {
        const e = classifyNonJsonBody('<!DOCTYPE html><html><title>Sign in</title> accounts.google.com</html>', err, {});
        expect(e.kind).toBe('auth');
    });

    it('«страница не найдена» → notfound, квота → quota, прочий HTML → html', () => {
        expect(classifyNonJsonBody('<html><title>Страница не найдена</title></html>', err, {}).kind).toBe('notfound');
        expect(classifyNonJsonBody('<html><title>x</title>Слишком много раз</html>', err, {}).kind).toBe('quota');
        expect(classifyNonJsonBody('<html><body>что-то</body></html>', err, {}).kind).toBe('html');
    });

    it('не HTML → kind=parse', () => {
        expect(classifyNonJsonBody('not json at all', err, {}).kind).toBe('parse');
    });
});

describe('fetchGoogleDocs: тело ответа', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('HTML-страница входа вместо JSON даёт понятную ошибку, а не «Ошибка разбора JSON»', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                url: 'https://accounts.google.com/signin',
                text: async () => '<!DOCTYPE html><html><title>Sign in</title></html>',
            }),
        );
        const result = await fetchGoogleDocs(['doc-1'], false, { retryDelays: [] });
        expect(result).toHaveLength(1);
        expect(result[0].data).toEqual([]);
        expect(result[0].error).toContain('страницу входа');
        expect(result[0].error).not.toContain('разбора JSON');
    });
});
