# CSS структура

## Описание

Стили приложения разнесены по модулям: переменные и база, компоненты, темизация, утилиты. Точка входа — `main.css`.

## Структура

```
css/
├── main.css              # Точка входа: импортирует все модули по порядку каскада
├── inline-styles.css     # Скроллбар и кнопки (подключается из main.css)
├── styles.css            # Deprecated: только @import main.css (обратная совместимость)
├── base/
│   └── base.css         # Базовые стили: html, body, layout, FNS cert, focus
├── layout/
│   ├── responsive.css   # Адаптивность: брейкпоинты, safe area, отступы, fluid-типографика
│   └── copyright.css   # Копирайт, header primary, кнопки хедера
├── theme/
│   ├── variables.css     # Переменные темы и семантическая палитра
│   ├── dark-overrides.css # Тёмная тема (html.dark)
│   └── custom-theme.css  # Кастомная тема (body.custom-background-active)
├── components/
│   ├── modals.css
│   ├── scrollbar.css
│   ├── tabs.css
│   ├── search.css
│   ├── sortable.css
│   ├── color-picker.css
│   ├── lightbox.css
│   ├── cards-timer.css
│   ├── buttons.css       # Заглушка (кнопки внутри custom-theme.css)
│   ├── pdf-dropzone.css
│   ├── folders-examples.css
│   └── health-modal.css
└── utilities/
    ├── animations.css
    ├── helpers.css
    └── elevation.css     # Тени (--shadow-sm/md/lg/xl)
```

## Порядок импортов в main.css

1. `theme/variables.css` — переменные и семантика
2. `layout/responsive.css` — адаптивность (safe area, отступы, fluid-типографика)
3. `base/base.css` — база и layout
4. Компоненты (modals → scrollbar → tabs → search → sortable → color-picker → lightbox → cards-timer → buttons)
5. `theme/dark-overrides.css`, `theme/custom-theme.css`
6. Утилиты и layout: animations, helpers, copyright, elevation
7. Оставшиеся компоненты: pdf-dropzone, folders-examples, health-modal
8. `inline-styles.css`

## Адаптивность и брейкпоинты

**Единый источник** адаптивных токенов — `layout/responsive.css`. В `@media` используйте литералы (CSS не поддерживает `var()` в медиа-запросах); значения согласованы с `tailwind.config.js` → `theme.extend.screens`.

### Брейкпоинты (справочно)

| Имя  | Ширина  | Назначение                    |
|------|---------|--------------------------------|
| xs   | 360px   | Очень малые телефоны          |
| sm   | 640px   | Телефоны landscape            |
| md   | 768px   | Планшеты portrait             |
| lg   | 1024px  | Планшеты landscape / ноутбуки |
| xl   | 1280px  | Десктоп                       |
| 2xl  | 1536px  | Большие мониторы              |
| 3xl  | 1920px  | Широкие экраны                |

### Переменные из responsive.css

| Переменная                 | Назначение |
|----------------------------|------------|
| `--safe-area-top/right/bottom/left` | Отступы от вырезов (notch, Dynamic Island, home indicator); fallback `0` на десктопе |
| `--content-padding-inline` | Адаптивные горизонтальные отступы контента (`clamp`) |
| `--content-padding-block`   | Адаптивные вертикальные отступы |
| `--modal-margin-inline`    | Отступ модалок от краёв viewport |
| `--text-fluid-title`       | Fluid размер заголовка (header h1) |
| `--text-fluid-subtitle`    | Fluid размер подзаголовка |
| `--touch-target-min`       | Минимальный размер touch-цели (44px, Apple HIG) |

В `index.html` для учёта safe area на устройствах с вырезами задан `viewport-fit=cover` в meta viewport.

## Использование

В `index.html` подключается один файл:

```html
<link rel="stylesheet" href="css/main.css" />
```

Старые ссылки на `css/styles.css` по-прежнему работают: `styles.css` содержит только `@import url('./main.css');`.

## Тема и кастомизация цветов

**Единственный источник истины для цветов темы** — `theme/variables.css`. Все фоны, текст и границы в теме должны использовать семантические переменные. В JS дефолтные значения синхронизированы с этим ядром через `THEME_DEFAULTS` в `js/config.js`.

### Семантические переменные (обязательно использовать в компонентах)

| Переменная                                                       | Назначение                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `--color-initial-bg`                                             | Фон первого кадра до загрузки темы                        |
| `--color-text-primary`                                           | Основной текст на фоне surface/background                 |
| `--color-text-secondary`                                         | Второстепенный текст, подписи                             |
| `--color-text-placeholder`                                       | Плейсхолдеры полей ввода                                  |
| `--color-text-on-primary`                                        | Текст на кнопках/элементах с primary-фоном (обычно белый) |
| `--color-background`                                             | Фон страницы                                              |
| `--color-surface-1`                                              | Подложки, заголовки блоков                                |
| `--color-surface-2`                                              | Карточки, модалки, основной контент                       |
| `--color-surface-3`                                              | Hover/акцент поверх surface-2                             |
| `--color-border`, `--color-border-subtle`                         | Границы и разделители (subtlе — для таббара и т.п.)       |
| `--color-border-interactive`                                     | Границы полей ввода, интерактивных элементов              |
| `--color-input-bg`                                               | Фон input/textarea/select                                 |
| `--color-hover-subtle`                                           | Лёгкий hover-фон                                          |
| `--color-primary`, `--color-secondary`                           | Акцентные цвета (кнопки, ссылки, активные табы)           |
| `--color-favorites-icon`, `--color-favorites-icon-hover`         | Иконка избранного в хедере                                |
| `--color-link` / `--color-link-hover`                            | Ссылки в тёмной теме (в светлой — из primary/text)        |
| `--color-red-text`, `--color-red-border`, `--color-red-hover-bg`, `--color-red-solid`, `--color-red-bg-*` | Деструктивные действия и ошибки |
| `--hint-bg`, `--hint-border`, `--hint-text`, `--hint-action`, `--hint-bg-strong` | Подсказки (hint-блоки)                    |
| `--shadow-overlay`                                               | Тень оверлея (например, lightbox)                         |

Значения задаются в `:root` (светлая тема) и в `html.dark` (тёмная тема). Переопределения по темам: `--override-<token>-light`, `--override-<token>-dark`.

### Кастомизация

- **Через CSS:** задать на `document.documentElement` (или в корневом стиле) свойства `--override-<token>-light` и/или `--override-<token>-dark` (например, `--override-background-light: #f0f0f0`).
- **Через JS:** использовать `applyThemeOverrides()` из `js/components/theme.js`, передав объект вида `{ background: { light: '#f0f0f0', dark: '#1a1a2e' } }` (ключи в camelCase, в CSS подставляются в kebab-case). Дефолтные hex для темы и оверлея загрузки берутся из `THEME_DEFAULTS` в `js/config.js`.

**Правило:** в компонентах не использовать захардкоженные hex/rgb для фона, текста, границ и акцентов — только `var(--color-*)` или `var(--hint-*)`, `var(--shadow-*)`. Исключения: объявление значений токенов в `theme/variables.css` и константы в `js/config.js` (THEME_DEFAULTS).
