// tests/functional/performance-review/results/pr-scoreonly-notification-integration.spec.js
// Уведомление в интеграцию при scoreOnly с enableNotification=true
// Нет уведомления в интеграцию при enableNotification=false
// NOTE: C-IDs не назначены — тесты-заглушки, требуют webhook-инфраструктуры

import { test, expect } from "../../../fixtures/auth.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Notifications: scoreOnly — интеграции",
  {
    tag: [
      "@performance-review",
      "@results",
      "@api",
      "@regression",
      "@integration",
      "@scoreOnly",
    ],
  },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly Integration Notifications");
    });

    test.skip(
      "Уведомление в интеграцию при scoreOnly с enableNotification=true",
      { tag: ["@regression"] },
      async () => {
        setSeverity("normal");
        // Тест пропущен: интеграции требуют отдельной настройки окружения.
        // Когда будет готов webhook endpoint для тестирования:
        // 1. Настроить интеграцию (webhook / Slack / etc.)
        // 2. ScoreOnly + enableNotification=true
        // 3. Проверить что webhook получил событие
        // 4. Проверить payload: название PR, тип доступа, ссылка на профиль
        expect(true).toBe(true);
      },
    );

    test.skip(
      "Нет уведомления в интеграцию при enableNotification=false",
      { tag: ["@regression"] },
      async () => {
        setSeverity("normal");
        // Тест пропущен: интеграции требуют отдельной настройки окружения.
        // Когда будет готов webhook endpoint:
        // 1. ScoreOnly + enableNotification=false
        // 2. Проверить что webhook НЕ получил событие
        expect(true).toBe(true);
      },
    );
  },
);
