# Playwright Tests - Документация

Автоматизированные E2E тесты для HR платформы с использованием Playwright.

## Содержание

- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Запуск тестов](#запуск-тестов)
- [Система тегов](#система-тегов)
- [Написание тестов](#написание-тестов)
- [Утилиты](#утилиты)
- [Отчёты](#отчёты)

---

## Структура проекта

```
playwright-tests/
├── tests/
│   ├── functional/              # Функциональные тесты (по необходимости)
│   │   ├── auth/               # Аутентификация
│   │   ├── surveys/            # Опросы
│   │   │   ├── creation/      # Создание опросов
│   │   │   ├── publication/   # Публикация
│   │   │   ├── results/       # Результаты
│   │   │   └── management/    # Управление
│   │   ├── feedback/           # Обратная связь
│   │   ├── objectives/         # Цели (OKR)
│   │   ├── org-structure/      # Оргструктура
│   │   ├── profile/            # Профиль
│   │   ├── my-team/            # Моя команда
│   │   ├── gift-shop/          # Магазин подарков
│   │   ├── virtual-currency/   # Виртуальная валюта
│   │   ├── brand/              # Брендинг
│   │   ├── account/            # Аккаунт
│   │   ├── settings/           # Настройки
│   │   └── home/               # Главная страница
│   │
│   ├── security/                # Тесты безопасности (раз в спринт)
│   │
│   ├── utils/                   # Утилиты
│   │   ├── seed/               # Создание тестовых данных
│   │   ├── cleanup/            # Очистка данных
│   │   ├── api/                # API клиенты
│   │   ├── constants.js        # Константы
│   │   └── TestDataHelper.js   # Генерация данных
│   │
│   ├── fixtures/                # Фикстуры
│   │   └── auth.js             # Фикстуры аутентификации
│   │
│   └── _archived/               # Архивные тесты
│       └── cleanup/            # Старые cleanup тесты
│
├── pages/                       # Page Object Model
├── playwright.config.js         # Конфигурация Playwright
├── global-setup.js              # Глобальная настройка
└── package.json                 # NPM скрипты
```

---

## Быстрый старт

### Установка зависимостей

```bash
npm install
```

### Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
BASE_URL=https://your-app.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_password
USER_EMAIL=user@example.com
USER_PASSWORD=your_password
MANAGER_EMAIL=manager@example.com
MANAGER_PASSWORD=your_password
```

### Первый запуск

```bash
# Запустить все функциональные тесты
npm run test:functional

# Запустить в UI режиме
npm run ui

# Запустить с отображением браузера
npm run headed
```

---

## Запуск тестов

### По типу тестов

```bash
# Функциональные тесты (по необходимости)
npm run test:functional

# Тесты безопасности (раз в спринт)
npm run test:security
```

### По модулям

```bash
# Все функциональные тесты модуля
npm run test:functional:surveys       # Только опросы
npm run test:functional:feedback      # Только обратная связь
npm run test:functional:objectives    # Только цели
npm run test:functional:org-structure # Только оргструктура
npm run test:functional:profile       # Только профиль
```

### По тегам

```bash
# Критичные тесты
npm run test:critical

# По модулям через теги
npm run test:module:surveys    # Все с тегом @surveys
npm run test:module:feedback   # Все с тегом @feedback
npm run test:module:objectives # Все с тегом @objectives
```

### Специальные режимы

```bash
# UI режим (интерактивный)
npm run ui

# С отображением браузера
npm run headed

# Debug режим
npm run debug

# Конкретный файл
npx playwright test tests/functional/surveys/creation/create-blank-from-list.spec.js

# Конкретная папка
npx playwright test tests/functional/surveys

# Запуск с указанием проекта (UI или API)
npx playwright test --project=ui tests/functional/surveys     # UI тесты
npx playwright test --project=api tests/functional/api        # API тесты
```

> **Примечание:** Функциональные тесты запускаются по паттерну `--project=ui/api + path`.
> Проект `ui` используется для браузерных тестов, `api` - для API тестов.

---

## Система тегов

### Теги приоритета

- `@critical` - критичный функционал (блокирует релиз)
- `@high` - высокий приоритет
- `@medium` - средний приоритет
- `@low` - низкий приоритет

### Теги модулей

- `@surveys` - опросы
- `@feedback` - обратная связь
- `@objectives` - цели
- `@org-structure` - оргструктура
- `@profile` - профиль
- `@gift-shop` - магазин подарков
- `@virtual-currency` - виртуальная валюта
- `@auth` - аутентификация
- `@security` - безопасность

### Теги типов

- `@smoke` - smoke тест (быстрая проверка)
- `@regression` - регрессионный тест
- `@api` - API тест
- `@ui` - UI тест
- `@e2e` - end-to-end сценарий

### Теги workflow

- `@creation` - создание сущности
- `@publication` - публикация
- `@results` - результаты
- `@management` - управление

### Специальные теги

- `@slow` - медленный тест (>2 мин)
- `@flaky` - нестабильный тест
- `@data-dependent` - зависит от данных
- `@multi-user` - мультиюзерный тест

### Примеры использования тегов

```javascript
// Критичный smoke тест
test.describe("Опросы — создание @surveys @creation", () => {
  test("создать пустой опрос @critical @smoke @ui", async ({ page }) => {
    // ...
  });
});

// Медленный e2e тест
test.describe("Полный цикл опроса @surveys @e2e", () => {
  test("создать, опубликовать, пройти @critical @slow @multi-user", async ({
    page,
    browser,
  }) => {
    test.slow(); // Playwright медленный маркер
    // ...
  });
});
```

### Запуск по тегам

```bash
# Все критичные тесты
npx playwright test --grep @critical

# Все опросы
npx playwright test --grep @surveys

# Критичные опросы
npx playwright test --grep "@critical.*@surveys"

# Исключить медленные
npx playwright test --grep-invert @slow
```

---

## Написание тестов

### Структура теста

```javascript
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";

test.describe("Название модуля @модуль @workflow", () => {
  test("описание теста @приоритет @тип", async ({
    adminAuth: page,
  }, testInfo) => {
    // Инициализация Page Objects
    const sideMenu = new SideMenu(page, testInfo);

    // Шаги теста
    await test.step("Шаг 1", async () => {
      // ...
    });

    await test.step("Шаг 2", async () => {
      // Проверки
      await expect(element).toBeVisible();
    });
  });
});
```

### Использование утилит

#### Генерация уникальных данных

```javascript
import { TestDataHelper } from "../../utils/TestDataHelper.js";

const surveyTitle = TestDataHelper.generateUniqueName("Опрос");
const email = TestDataHelper.generateUniqueEmail();
const randomNumber = TestDataHelper.getRandomNumber(1, 10);
```

#### Использование констант

```javascript
import { TIMEOUTS, TEST_DATA } from "../../utils/constants.js";

await element.waitFor({ timeout: TIMEOUTS.MEDIUM });
const password = TEST_DATA.DEFAULT_PASSWORD;
```

#### Seed и Cleanup данных

```javascript
import { SeedHelper } from "../../utils/seed/SeedHelper.js";

test.describe("Мой тест", () => {
  let seedHelper;

  test.beforeEach(async ({ page }) => {
    seedHelper = new SeedHelper(page);
    // Создать тестовые данные
    const dept = await seedHelper.seedDepartment("Отдел продаж");
  });

  test.afterEach(async () => {
    // Очистить данные после теста
    await seedHelper.cleanup();
  });

  test("тест с данными", async ({ page }) => {
    // Тест использует созданные данные
  });
});
```

---

## Утилиты

### TestDataHelper

Генерация уникальных тестовых данных:

```javascript
TestDataHelper.generateUniqueName("Префикс"); // E2E_Префикс_1234567890_abc123
TestDataHelper.generateUniqueEmail(); // e2e_1234567890_abc123@test.com
TestDataHelper.getRandomNumber(1, 10); // 7
TestDataHelper.getCurrentDate(); // 14.01.2026
TestDataHelper.getFutureDate(7); // 21.01.2026
TestDataHelper.isTestData("E2E_Опрос_123"); // true
```

### SeedHelper

Создание и очистка тестовых данных:

```javascript
const seed = new SeedHelper(page);

// Создать данные
const dept = await seed.seedDepartment("Название");
const survey = await seed.seedSurvey("Название");
const group = await seed.seedUserGroup("Название");

// Получить созданные ID
const surveyIds = seed.getCreatedIds("surveys");

// Очистить всё
await seed.cleanup();
```

### Constants

Константы для таймаутов и данных:

```javascript
TIMEOUTS.SHORT; // 5000ms
TIMEOUTS.MEDIUM; // 10000ms
TIMEOUTS.LONG; // 30000ms
TIMEOUTS.NAVIGATION; // 30000ms
TIMEOUTS.AUTOSAVE; // 10000ms

TEST_DATA.DEFAULT_PASSWORD; // из TEST_USER_PASSWORD или '123456'
TEST_DATA.TEST_PREFIX; // 'E2E_Test'
TEST_DATA.MIN_ANONYMITY_THRESHOLD; // 5
```

---

## Отчёты

### HTML Report

```bash
# Сгенерировать и открыть
npm run report
```

### Allure Report

```bash
# Сгенерировать отчёт
npm run allure:gen

# Открыть отчёт
npm run allure:open
```

В Allure вы увидите:

- Тесты сгруппированные по тегам
- Скриншоты каждого шага
- Timeline выполнения
- Статистику по модулям и приоритетам
- Flaky tests

---

## Workflow использования

### Разработка новой фичи

```bash
# 1. Запускаю тесты модуля, над которым работаю
npm run test:functional:surveys

# 2. Или по конкретной папке
npx playwright test tests/functional/surveys/creation
```

### Раз в спринт

```bash
# Тесты безопасности
npm run test:security
```

### Быстрая проверка критичного функционала

```bash
# Только критичные тесты
npm run test:critical
```

---

## Troubleshooting

### Тесты не запускаются

1. Проверьте `.env` файл с учётными данными
2. Убедитесь, что выполнен `npm install`
3. Проверьте, что BASE_URL доступен

### Тест падает с timeout

1. Проверьте интернет-соединение
2. Увеличьте timeout в конкретном тесте:
   ```javascript
   test.setTimeout(180_000); // 3 минуты
   ```

### Нужно обновить импорты после перемещения

Импорты обновлены автоматически:

- `../../fixtures/auth.js` - для фикстур
- `../../../../pages/PageName.js` - для Page Objects

### Тесты конфликтуют из-за данных

Используйте `TestDataHelper.generateUniqueName()` для уникальных имён:

```javascript
const title = TestDataHelper.generateUniqueName("Опрос");
```

---

## Следующие шаги

1. ✅ Структура создана и тесты перемещены
2. ✅ Утилиты для работы с данными готовы
3. ✅ NPM scripts настроены
4. 🔄 Добавляйте теги в существующие тесты постепенно
5. 🔄 Создавайте регрессионные наборы для модулей
6. 🔜 API тесты находятся в `tests/functional/api/`

---

## Контакты и поддержка

При вопросах обращайтесь к команде QA или оставляйте Issues в GitLab.

**Happy Testing! 🚀**
