// Минимальный статический сервер для E2E (без зависимостей, без кэширования).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
};

export function startStaticServer(root, port = 0) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
            if (path.endsWith('/')) path += 'index.html';
            const file = join(root, path);
            if (!file.startsWith(root)) throw new Error('outside root');
            const s = await stat(file);
            if (!s.isFile()) throw new Error('not a file');
            res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(await readFile(file));
        } catch {
            res.writeHead(404);
            res.end('not found');
        }
    });
    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
