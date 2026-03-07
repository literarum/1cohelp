export const FNS_CRL_URLS = [
    'https://pki.tax.gov.ru/cdp/4e5c543b70fefd74c7597304f2cacad7967078e4.crl',
    'https://pki.tax.gov.ru/cdp/fcb21945f2bb7670b371b03cee94381d4f975cd5.crl',
    'https://pki.tax.gov.ru/cdp/e91f07442c45b2cf599ee949e5d83e8382b94a50.crl',
    'https://cdp.tax.gov.ru/cdp/d156fb382c4c55ad7eb3ae0ac66749577f87e116.crl',
    'https://pki.tax.gov.ru/cdp/23f0da4a5de30c96e91f976a3e641689a1f8553c.crl',
    'https://uc.nalog.ru/cdp/ac53bead76ac54d0880675d705c58b01b5abbe94.crl',
];

export const REVOCATION_PROXY_ENABLED = false;
export const REVOCATION_PROXY_URL = '';
export const REVOCATION_PROXY_FAILURE_RATE_THRESHOLD = 0.7;
export const REVOCATION_PROXY_MIN_ATTEMPTS = 3;

/** При использовании из РФ: запускайте локальный helper (npm run helper:crl). Запросы к ФНС пойдут с вашего компьютера, бэкенд только разбирает уже загруженные CRL. */
export const REVOCATION_NETWORK_POLICY = 'backend_first';
/** Не передаём URL helper в облачный бэкенд: он не может достучаться до localhost пользователя. */
export const REVOCATION_LOCAL_HELPER_ENABLED = false;
export const REVOCATION_LOCAL_HELPER_BASE_URL = 'http://localhost:7777';

/** true = браузер загружает CRL через локальный helper (localhost:7777). false = только облачный API (Yandex и т.п.) загружает CRL. */
export const REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER = false;

/** URL to desktop app download page or direct binary; used when local helper is not responding. */
export const REVOCATION_DESKTOP_APP_DOWNLOAD_URL = '/downloads/';
