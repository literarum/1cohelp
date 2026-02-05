# Ветки репозитория

- **main** — основная, стабильная ветка. В неё не коммитить напрямую; все изменения — только через слияние из `safe-work` (или через Pull Request), чтобы ничего не сломать.

- **safe-work** — рабочая ветка для разработки и экспериментов. Вся работа ведётся здесь; когда всё проверено, изменения переносятся в `main` через merge/PR.

## Как работать

1. Всегда работайте в ветке **safe-work**: `git checkout safe-work`
2. Коммиты и пуш — в `safe-work`: `git add ...`, `git commit`, `git push`
3. В **main** не переключайтесь для правок или переключайтесь только чтобы подтянуть обновления: `git checkout main`, `git pull`
4. Когда готово перенести изменения в main — сделайте merge в main (через GitHub Pull Request или локально) и запушьте main.

## Защита main на GitHub

Чтобы ветку `main` нельзя было случайно изменить:

1. GitHub → репозиторий **1cohelp** → **Settings** → **Branches**
2. **Add branch protection rule**
3. Branch name pattern: `main`
4. Включите, например:
   - **Require a pull request before merging** — тогда в main попадёт только через PR из safe-work
   - **Do not allow bypassing the above settings** — правило применяется ко всем
5. **Create** / **Save changes**

После этого в `main` нельзя будет пушить напрямую; изменения — только через Pull Request из `safe-work`.
