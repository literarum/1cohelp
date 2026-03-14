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
├── layout/
│   └── copyright.css     # Копирайт, header primary, кнопки хедера
└── utilities/
    ├── animations.css
    ├── helpers.css
    └── elevation.css     # Тени (--shadow-sm/md/lg/xl)
```

## Порядок импортов в main.css

1. `theme/variables.css` — переменные и семантика
2. `base/base.css` — база и layout
3. Компоненты (modals → scrollbar → tabs → search → sortable → color-picker → lightbox → cards-timer → buttons)
4. `theme/dark-overrides.css`, `theme/custom-theme.css`
5. Утилиты и layout: animations, helpers, copyright, elevation
6. Оставшиеся компоненты: pdf-dropzone, folders-examples, health-modal
7. `inline-styles.css`

## Использование

В `index.html` подключается один файл:

```html
<link rel="stylesheet" href="css/main.css" />
```

Старые ссылки на `css/styles.css` по-прежнему работают: `styles.css` содержит только `@import url('./main.css');`.

## Тема и кастомизация цветов

**Единственный источник истины для цветов темы** — `theme/variables.css`. Все фоны, текст и границы в теме должны использовать семантические переменные.

### Семантические переменные (обязательно использовать в компонентах)

| Переменная                                                       | Назначение                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `--color-text-primary`                                           | Основной текст на фоне surface/background                 |
| `--color-text-secondary`                                         | Второстепенный текст, подписи                             |
| `--color-text-placeholder`                                       | Плейсхолдеры полей ввода                                  |
| `--color-text-on-primary`                                        | Текст на кнопках/элементах с primary-фоном (обычно белый) |
| `--color-background`                                             | Фон страницы                                              |
| `--color-surface-1`                                              | Подложки, заголовки блоков                                |
| `--color-surface-2`                                              | Карточки, модалки, основной контент                       |
| `--color-surface-3`                                              | Hover/акцент поверх surface-2                             |
| `--color-border`                                                 | Границы и разделители                                     |
| `--color-border-interactive`                                     | Границы полей ввода, интерактивных элементов              |
| `--color-input-bg`                                               | Фон input/textarea/select                                 |
| `--color-hover-subtle`                                           | Лёгкий hover-фон                                          |
| `--color-primary`                                                | Акцентный цвет (кнопки, ссылки, активные табы)            |
| `--color-link` / `--color-link-hover`                            | Ссылки в тёмной теме (в светлой — из primary/text)        |
| `--color-red-text`, `--color-red-border`, `--color-red-hover-bg` | Деструктивные действия и ошибки                           |

Значения задаются в `:root` (светлая тема) и в `html.dark` (тёмная тема). Переопределения по темам: `--override-<token>-light`, `--override-<token>-dark`.

### Кастомизация

- **Через CSS:** задать на `document.documentElement` (или в корневом стиле) свойства `--override-<token>-light` и/или `--override-<token>-dark` (например, `--override-background-light: #f0f0f0`).
- **Через JS:** использовать `applyThemeOverrides()` из `js/components/theme.js`, передав объект вида `{ background: { light: '#f0f0f0', dark: '#1a1a2e' } }` (ключи в camelCase, в CSS подставляются в kebab-case).

Добавлять в компонентах хардкод hex для фона/текста/границ темы нельзя — только `var(--color-*)`. Исключения: спецблоки (hint, alert, danger), где допустимы свои переменные (например `--hint-bg`, `--color-red-text`).
