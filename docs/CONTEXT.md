# Контекст работы

- Концепт: работа через IDE с подключенным корпоративным Codex от Open AI.
- Репозиторий берём из GitLab: https://gitlab.example.org/sample/playwright-tests (локально `~/playwright-tests`).
- Всегда сначала открываем `docs/` — там лежат контекст, кейсы и сопутствующие документы (API и т.п.).
- Основной стенд для работы: https://client.st7.apprs.ru/ (доступ/роли см. в своих .env/кредах).
- Переодически меняем дубли, повторения и ненужное в этом файле, но всегда подсвечиваем и согласовываем изменения!
- Локальные вещи, которые не пушим: `node_modules/`, `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`, `playwright/.auth/`, `allure-results/`, `allure-report/`, `.env*`, `.pw-home/` (локально в `info/exclude`), `.idea/`, `.DS_Store`.
- Рабочая ветка: `yuri/work` (локальная, публикуется в `origin/yuri/work`). В `origin/main` **не пушим**, только подтягиваем через `git fetch` + `git rebase origin/main` (или merge) в `yuri/work`.
- Актуальный OpenAPI: `docs/api/openapi-st7.yaml` (YAML — единственный источник; JSON не храним, при необходимости генерируем из YAML).
- Кейсы ведём в `docs/cases/` по шаблону `TEMPLATE.md`, правила — в `docs/cases/README.md`. Один файл на кейс или блок кейсов; статусы обновляем прямо в файле.
- После согласования текстовых кейсов они переводятся в кодовые тесты в `tests/...` и запускаются.
- Защита от случайного пуша `docs` в `main`: `docs/` добавлен в локальный `.git/info/exclude`; работаем с документами только в ветке `yuri/work`, в `main` не коммитим.
- Установлен OpenJDK 21 через Homebrew (keg-only). Для Java/Allure используем: `JAVA_HOME=/usr/local/opt/openjdk@21 PATH="/usr/local/opt/openjdk@21/bin:$PATH"`; symlink в `/Library/Java/...` не делаем (нет прав).
- Браузер: встроенный Chromium на mac может падать из-за crashpad/прав; рабочий вариант — проект `ui-firefox` с запуском `SKIP_GLOBAL_SETUP=1 SKIP_SEED=1` (headed), часто с эскалацией. Если нужен Chromium, предварительно решить вопрос с crashpad/правами.
- UI-прогоны локально гоняем из Terminal, а не из VS Code/агента: в VS Code Chromium падает на доступе к `~/Library/.../Crashpad`; в Terminal команда работает (`PLAYWRIGHT_BROWSERS_PATH=./.pw-browsers SKIP_GLOBAL_SETUP=1 SKIP_SEED=1 npx playwright test --project=ui ... --headed --reporter=line`).
- Временные артефакты Playwright (`.pw-browsers/`, `.tmp-home-*`, `playwright-report/`, `test-results/`, `.vscode/` и т.п.) не коммитим; `.vscode/` занесён в `.gitignore`.

Перед началом сессии: открыть `docs/CONTEXT.md` (обновить при нужде), затем работать с кейсами/стендом/кредами по текущей задаче.

## Стенд ST7 (https://client.st7.apprs.ru/)
- Компания: Uzum1
- Креды лежат в локальном `.env.st7`. Активировать стенд — `cp .env.st7 .env` (/.env* в игноре). Если нужен стенд 8 — использовать `.env.st8` и так же копировать в `.env`.

## Запуск тестов и данные
- Базово: `npm test` (все проекты), `npm run test:functional`, `npm run test:smoke`, `npm run test:security`, `npm run test:nightly`.
- По модулям/тегам: `npm run test:functional:surveys|feedback|objectives|org-structure|profile|performance-review` или `npm run test:module:surveys|feedback|objectives|performance-review`; критичные — `npm run test:critical`.
- Отчёты: `npm run report` (Playwright HTML), `npm run allure:gen` и `npm run allure:open` (allure). Если запускаем вручную: `... --reporter=line,allure-playwright`, затем `JAVA_HOME=/usr/local/opt/openjdk@21 PATH="/usr/local/opt/openjdk@21/bin:$PATH" npx allure serve allure-results` (может потребоваться эскалация портов). После отладки кейса показываем HTML + Allure при реальном прогоне (кейс 1 уже гоняем с отчётами).
- Seed/cleanup данных: скрипты в `scripts/` (`npm run seed:survey`, `seed:survey:cleanup`, `seed:pr`, `seed:pr:cleanup`), проверка `--check`.
- При запуске тестов: по умолчанию просим запуск с экраном (headed/--ui) и поясняем, что делаем. После каждого шага (подготовка env, запуск, сбор отчёта) останавливаемся и берём аппрув, описываем действия простыми словами.
- Рабочий процесс с кейсами: познакомиться с кейсом → задать вопросы → получить ответы → внести правки → одобрение → финальное согласование перед автоматизацией.
- Рабочий процесс с кейсами: познакомиться с кейсом → задать вопросы → получить ответы → внести правки → одобрение → финальное согласование перед автоматизацией.
- Процесс работы с пользователем: всегда действуем по шагам, после каждого шага даём подробное человекочитаемое описание и ждём явного апрува. Не выполняем цепочки действий без согласия. Инициативные действия не выполняем — только предлагаем и исполняем после разрешения.
- Процесс работы с пользователем: всегда действуем по шагам, после каждого шага даём подробное человекочитаемое описание и ждём явного апрува. Не выполняем цепочки действий без согласия. Инициативные действия не выполняем — только предлагаем и исполняем после разрешения.
- Сообщения коммитов/пушей: пишем на английском, в скобках добавляем краткий русский перевод (например, `Update context and playwright setup (Обновление контекста и настроек Playwright)`).

## Кейсы
- Статусы: черновик/в работе/готов — отмечаем прямо в файле кейса.
- Один файл — один кейс или связанный блок; шаблон `docs/cases/TEMPLATE.md`.
- Кейс 1: `docs/cases/1.md` — скачивание балансов (UI). Тест: `tests/functional/virtual-currency/1-virtual-currency-download.spec.js`. Прогон прошёл (UI Firefox).
- Кейс 2: `docs/cases/2.md` — сверка отчёта и истории. Тест: `tests/functional/virtual-currency/2-virtual-currency-balances-report.spec.js` (нормализация ФИО, полная пагинация истории). Строгая сверка сумм включается `STRICT_BALANCE=1`; без него проверяем наличие получателей/непустые суммы.
- Прочие старые тесты (deposit/settings) лежат в `tests/functional/virtual-currency/`, но не относятся к кейсам 1-2.

## API
- Актуальный OpenAPI: `docs/api/openapi-st7.yaml`. Для ручных вызовов используем логины/пароли из `.env.st7` (или других env).

Минимальный пример кейса смотри в `docs/cases/README.md`.
