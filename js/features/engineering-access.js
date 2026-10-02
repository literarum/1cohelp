'use strict';

import { sha256Hex, timingSafeEqual } from '../utils/sha256.js';

/** SHA-256 пароля доступа (открытый текст в коде не хранится). Замок от случайных нажатий, а не защита от разработчика. */
export const ENGINEERING_PASSWORD_SHA256 =
    '834bb0196d8f7d14379bb17a931fc57ea4ca7a1a594d2f5209cf292b338035fb';

/** Проверка пароля инженерного режима: сравнение отпечатков за постоянное время. */
export function isEngineeringPassword(value) {
    return timingSafeEqual(sha256Hex(String(value ?? '').trim()), ENGINEERING_PASSWORD_SHA256);
}
