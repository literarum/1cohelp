import { defineConfig } from 'vitest/config';

// Тесты лежат рядом с модулями (js/**/*.test.js). Окружение по умолчанию — jsdom;
// файлы с пометкой «@vitest-environment node» выполняются в Node.
export default defineConfig({
    test: {
        include: ['js/**/*.test.js'],
        environment: 'jsdom',
        testTimeout: 20000,
        restoreMocks: true,
    },
});
