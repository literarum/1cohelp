# HTML шаблоны

## Описание

HTML шаблоны компонентов и модальных окон для переиспользования.

## Структура

```
templates/
├── components/        # Компоненты UI
│   ├── header.html   # Шапка приложения
│   └── tabs.html     # Навигационные табы
└── modals/           # Модальные окна
    ├── algorithm-modal.html
    ├── edit-modal.html
    ├── add-modal.html
    ├── hotkeys-modal.html
    ├── cib-link-modal.html
    ├── confirm-clear-data-modal.html
    └── customize-ui-modal.html
```

## Использование

### Статическое использование
Шаблоны можно использовать напрямую в HTML или копировать в нужные места.

### Динамическое использование
Используйте утилиту `js/ui/template-loader.js` для динамической загрузки:

```javascript
import { loadTemplate, loadTemplateIntoElement } from './js/ui/template-loader.js';

// Загрузить шаблон
const html = await loadTemplate('modals/algorithm-modal.html');

// Загрузить и вставить в элемент
await loadTemplateIntoElement('modals/algorithm-modal.html', '#container');
```

## Примечания

- Шаблоны извлечены из `index.html` для переиспользования
- Модальные окна также остались в `index.html` для обеспечения работы при загрузке
- В будущем можно использовать шаблоны для динамической загрузки модальных окон
