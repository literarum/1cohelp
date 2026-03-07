#!/usr/bin/env node
/**
 * Приводит окончания строк в install-скриптах к LF для корректной работы curl|bash.
 * Запускается при сборке (см. package.json в site/).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = ['install-mac.sh', 'install-linux.sh', 'install-windows.ps1'];

for (const name of files) {
    const filePath = path.join(__dirname, name);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('\r')) {
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('[normalize]', name, '-> LF');
    }
}
