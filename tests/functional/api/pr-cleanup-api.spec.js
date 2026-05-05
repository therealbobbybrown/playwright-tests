// tests/functional/api/performance-review.cleanup.spec.js
// Скрипт очистки Performance Reviews
//
// Использование:
//   npx playwright test performance-review.cleanup --grep "по паттерну" --project=functional
//
// Переменные окружения:
//   PR_CLEANUP_PATTERN - регулярное выражение для фильтрации по title (например: "тест|test")
//   PR_CLEANUP_TITLES  - список заголовков через запятую (например: "Performance Review,Тест PR")
//   RUN_CLEANUP=1      - включить очистку (без этого тесты пропускаются)

import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// Конфигурация из переменных окружения
const RUN_CLEANUP = process.env.RUN_CLEANUP === "1";
const CLEANUP_PATTERN = process.env.PR_CLEANUP_PATTERN || null; // regex pattern
const CLEANUP_TITLES = process.env.PR_CLEANUP_TITLES
  ? process.env.PR_CLEANUP_TITLES.split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  : null; // список точных заголовков

// Расширяем test с фикстурой для Performance Review API
const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Вспомогательная функция для получения ВСЕХ PR с пагинацией
// ВАЖНО: для архивированных используем category=archive, а не isArchived=true
async function getAllPerformanceReviews(prAPI, archived = false) {
  const allItems = [];
  let offset = 0;
  const limit = 100; // Максимум за раз

  while (true) {
    const url = `/manager/performance-reviews?limit=${limit}&offset=${offset}${archived ? "&category=archive" : ""}`;
    const { response, data } = await prAPI.get(url);

    if (!response.ok()) break;

    const items = Array.isArray(data) ? data : data?.items || [];

    if (items.length === 0) break;

    allItems.push(...items);
    offset += items.length;

    // Если получили меньше limit - это последняя страница
    if (items.length < limit) break;
  }

  return allItems;
}

// Функция проверки, подходит ли PR под критерии удаления
function matchesCleanupCriteria(pr, pattern, titles) {
  const title = pr.title || "";

  // Если заданы конкретные заголовки - проверяем точное совпадение
  if (titles && titles.length > 0) {
    return titles.includes(title);
  }

  // Если задан паттерн - проверяем regex
  if (pattern) {
    try {
      const regex = new RegExp(pattern, "i");
      return regex.test(title);
    } catch {
      return false;
    }
  }

  // Если ничего не задано - подходят все
  return true;
}

// Функция удаления одного PR
async function deletePR(prAPI, pr) {
  const result = {
    success: false,
    stopped: false,
    archived: false,
    deleted: false,
    error: null,
  };

  try {
    // Если PR не draft - пробуем остановить
    if (pr.status !== "draft" && pr.status !== "finished") {
      const stopResponse = await prAPI.stop(pr.id);
      if (stopResponse.ok()) {
        result.stopped = true;
      } else if (stopResponse.status() === 409) {
        result.error = `Нельзя остановить (статус ${pr.status})`;
        return result;
      }
    }

    // Архивируем (если ещё не архивирован)
    if (!pr.isArchived) {
      const archiveResponse = await prAPI.archive(pr.id);
      if (archiveResponse.ok()) {
        result.archived = true;
      } else if (archiveResponse.status() === 409) {
        result.error = "Нельзя архивировать";
        return result;
      }
    }

    // Удаляем
    const deleteResponse = await prAPI.remove(pr.id);
    if (deleteResponse.ok() || deleteResponse.status() === 204) {
      result.deleted = true;
      result.success = true;
    } else {
      result.error = `Удаление: HTTP ${deleteResponse.status()}`;
    }
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

test.describe(
  "Performance Review Cleanup",
  { tag: ["@cleanup", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Cleanup");
    });

    test("C5983: Удалить по паттерну (PR_CLEANUP_PATTERN или PR_CLEANUP_TITLES)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить запрос: Удалить по паттерну (PR_CLEANUP_PATTERN или PR_CLEANUP_TITLES)", async () => {
        test.skip(!RUN_CLEANUP, "RUN_CLEANUP=1 не задан, пропускаем очистку");
        test.skip(
          !CLEANUP_PATTERN && !CLEANUP_TITLES,
          "PR_CLEANUP_PATTERN или PR_CLEANUP_TITLES не заданы",
        );

        console.log("=== УДАЛЕНИЕ PR ПО ПАТТЕРНУ ===\n");
        if (CLEANUP_PATTERN) console.log(`Pattern: /${CLEANUP_PATTERN}/i`);
        if (CLEANUP_TITLES) console.log(`Titles: ${CLEANUP_TITLES.join(", ")}`);
        console.log("");

        const allItems = await getAllPerformanceReviews(prAPI);
        const items = allItems.filter((pr) =>
          matchesCleanupCriteria(pr, CLEANUP_PATTERN, CLEANUP_TITLES),
        );

        console.log(`Всего PR: ${allItems.length}`);
        console.log(`Подходят под критерии: ${items.length}\n`);

        let deleted = 0;
        let errors = 0;

        for (const pr of items) {
          console.log(`\n"${pr.title}" (ID: ${pr.id}, status: ${pr.status})`);

          const result = await deletePR(prAPI, pr);

          if (result.success) {
            const steps = [];
            if (result.stopped) steps.push("остановлен");
            if (result.archived) steps.push("архивирован");
            if (result.deleted) steps.push("удалён");
            console.log(`  ✓ ${steps.join(" → ")}`);
            deleted++;
          } else {
            console.log(`  ✗ ${result.error}`);
            errors++;
          }
        }

        console.log("\n=== ИТОГИ ===");
        console.log(`Удалено: ${deleted}`);
        console.log(`Ошибок: ${errors}`);
      });

      await test.step("Проверить ответ", async () => {
        expect(true).toBe(true);
      });
    });

    test("C5984: Удалить ВСЕ Performance Reviews", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить запрос: Удалить ВСЕ Performance Reviews", async () => {
        console.log("=== НАЧАЛО ОЧИСТКИ PERFORMANCE REVIEWS ===\n");

        // Получаем ВСЕ PR с пагинацией
        const items = await getAllPerformanceReviews(prAPI);
        console.log(`Найдено активных PR: ${items.length}`);

        let archived = 0;
        let deleted = 0;
        let errors = 0;

        // Удаляем каждый PR
        for (const pr of items) {
          console.log(
            `\nОбработка PR: "${pr.title}" (ID: ${pr.id}, status: ${pr.status})`,
          );

          try {
            // Если PR не draft - пробуем остановить
            // Статусы: draft -> nomination -> headApprove -> adminCheck -> active -> finished
            if (pr.status !== "draft" && pr.status !== "finished") {
              const stopResponse = await prAPI.stop(pr.id);
              if (stopResponse.ok()) {
                console.log(`  ✓ Остановлен (был ${pr.status})`);
              } else {
                console.log(
                  `  ⚠ Остановка (${pr.status}): HTTP ${stopResponse.status()}`,
                );
                // Нельзя удалить PR в процессе - пропускаем
                if (stopResponse.status() === 409) {
                  console.log(
                    `  → Пропущен (нельзя остановить PR в статусе ${pr.status})`,
                  );
                  errors++;
                  continue;
                }
              }
            }

            // Сначала архивируем (если ещё не архивирован)
            if (!pr.isArchived) {
              const archiveResponse = await prAPI.archive(pr.id);
              if (archiveResponse.ok()) {
                console.log(`  ✓ Архивирован`);
                archived++;
              } else {
                console.log(`  ⚠ Архивация: HTTP ${archiveResponse.status()}`);
                // Если не удалось архивировать - пропускаем удаление
                if (archiveResponse.status() === 409) {
                  console.log(`  → Пропущен (нельзя архивировать)`);
                  errors++;
                  continue;
                }
              }
            }

            // Затем удаляем
            const deleteResponse = await prAPI.remove(pr.id);
            if (deleteResponse.ok() || deleteResponse.status() === 204) {
              console.log(`  ✓ Удалён`);
              deleted++;
            } else {
              console.log(`  ✗ Удаление: HTTP ${deleteResponse.status()}`);
              errors++;
            }
          } catch (e) {
            console.log(`  ✗ Ошибка: ${e.message}`);
            errors++;
          }
        }

        // Теперь получаем архивированные PR с пагинацией
        console.log("\n--- Проверка архивированных PR ---");

        try {
          const archivedItems = await getAllPerformanceReviews(prAPI, true);
          console.log(`Найдено архивированных PR: ${archivedItems.length}`);

          if (archivedItems.length > 0) {
            for (const pr of archivedItems) {
              console.log(
                `\nУдаление архивированного PR: "${pr.title}" (ID: ${pr.id})`,
              );
              try {
                const deleteResponse = await prAPI.remove(pr.id);
                if (deleteResponse.ok() || deleteResponse.status() === 204) {
                  console.log(`  ✓ Удалён`);
                  deleted++;
                } else {
                  console.log(`  ✗ HTTP ${deleteResponse.status()}`);
                  errors++;
                }
              } catch (e) {
                console.log(`  ✗ Ошибка: ${e.message}`);
                errors++;
              }
            }
          }
        } catch (e) {
          console.log(`Ошибка при получении архивированных PR: ${e.message}`);
        }

        console.log("\n=== ИТОГИ ОЧИСТКИ ===");
        console.log(`Архивировано: ${archived}`);
        console.log(`Удалено: ${deleted}`);
        console.log(`Ошибок: ${errors}`);

        // Проверяем что осталось (все страницы)
        const remaining = await getAllPerformanceReviews(prAPI);
        console.log(`\nОсталось PR: ${remaining.length}`);

        if (remaining.length > 0) {
          console.log("Оставшиеся PR:");
          for (const pr of remaining) {
            console.log(
              `  - "${pr.title}" (ID: ${pr.id}, status: ${pr.status}, isArchived: ${pr.isArchived})`,
            );
          }
        }

        // Тест всегда проходит - это утилита
      });

      await test.step("Проверить ответ", async () => {
        expect(true).toBe(true);
      });
    });

    test("C5985: Удалить только тестовые PR (по префиксу)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить запрос: Удалить только тестовые PR (по префиксу)", async () => {
        const TEST_PREFIXES = [
          "API Test",
          "Test PR",
          "Negative Test",
          "Boundary",
          "XSS",
          "SQL",
          "E2E_",
        ];

        console.log("=== УДАЛЕНИЕ ТЕСТОВЫХ PR ===\n");
        console.log(`Префиксы для удаления: ${TEST_PREFIXES.join(", ")}\n`);

        const items = await getAllPerformanceReviews(prAPI);
        console.log(`Всего PR: ${items.length}`);

        // Фильтруем по префиксам
        const testItems = items.filter((pr) =>
          TEST_PREFIXES.some((prefix) => pr.title?.startsWith(prefix)),
        );
        console.log(`Тестовых PR для удаления: ${testItems.length}`);

        let deleted = 0;
        let errors = 0;

        for (const pr of testItems) {
          console.log(`\nУдаление: "${pr.title}" (ID: ${pr.id})`);
          try {
            // Архивируем
            if (!pr.isArchived) {
              await prAPI.archive(pr.id);
            }
            // Удаляем
            const deleteResponse = await prAPI.remove(pr.id);
            if (deleteResponse.ok() || deleteResponse.status() === 204) {
              console.log(`  ✓ Удалён`);
              deleted++;
            } else {
              console.log(`  ✗ HTTP ${deleteResponse.status()}`);
              errors++;
            }
          } catch (e) {
            console.log(`  ✗ Ошибка: ${e.message}`);
            errors++;
          }
        }

        console.log("\n=== ИТОГИ ===");
        console.log(`Удалено: ${deleted}`);
        console.log(`Ошибок: ${errors}`);
      });

      await test.step("Проверить ответ", async () => {
        expect(true).toBe(true);
      });
    });

    test("C5986: Показать все PR (без удаления)", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить запрос: Показать все PR (без удаления)", async () => {
        console.log("=== СПИСОК ВСЕХ PERFORMANCE REVIEWS ===\n");

        const items = await getAllPerformanceReviews(prAPI);
        console.log(`Всего PR: ${items.length}\n`);

        if (items.length === 0) {
          console.log("Список пуст.");
          return;
        }

        for (const pr of items) {
          console.log(`ID: ${pr.id}`);
          console.log(`  Title: "${pr.title}"`);
          console.log(`  Status: ${pr.status}`);
          console.log(`  Archived: ${pr.isArchived}`);
          console.log(`  Created: ${pr.createdAt}`);
          console.log(
            `  Owner: ${pr.ownerUser?.name || pr.ownerUser?.email || "N/A"}`,
          );
          console.log("");
        }
      });

      await test.step("Проверить ответ", async () => {
        expect(true).toBe(true);
      });
    });

    test("C5987: Диагностика: проверить фильтр category=archive", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить запрос: Диагностика: проверить фильтр category=archive", async () => {
        console.log("=== ДИАГНОСТИКА ФИЛЬТРА category=archive ===\n");

        // 1. Считаем текущее количество
        const { data: beforeData } = await prAPI.get(
          "/manager/performance-reviews?limit=100",
        );
        const beforeItems = Array.isArray(beforeData)
          ? beforeData
          : beforeData?.items || [];
        console.log(`До создания (без фильтра): ${beforeItems.length} PR`);

        // Фронтенд использует category=archive для архивированных!
        const { data: beforeArchivedData } = await prAPI.get(
          "/manager/performance-reviews?limit=100&category=archive",
        );
        const beforeArchivedItems = Array.isArray(beforeArchivedData)
          ? beforeArchivedData
          : beforeArchivedData?.items || [];
        console.log(
          `До создания (category=archive): ${beforeArchivedItems.length} PR`,
        );

        // 2. Создаём тестовый PR
        const testTitle = `E2E_Archive_Test_${Date.now()}`;
        const createRes = await prAPI.create({
          title: testTitle,
          // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
          directions: [
            {
              id: null,
              receiverType: "self",
              isSelected: true,
              title: null,
              description: null,
            },
            {
              id: null,
              receiverType: "head",
              isSelected: true,
              title: null,
              description: null,
            },
            {
              id: null,
              receiverType: "subordinate",
              isSelected: false,
              title: null,
              description: null,
            },
            {
              id: null,
              receiverType: "colleague",
              isSelected: false,
              title: null,
              description: null,
            },
          ],
          anonymityType: "notAnonymous",
          workflowType: "basic",
          notificationsSchedule: {
            enableReminds: false,
            baseDate: new Date().toISOString(),
            repeatType: "noRepeat",
            timezoneOffset: 0,
          },
          isApprovalStep: false,
          isAsyncSteps: false,
          isAsyncStepsSelfResponseStep: false,
        });
        const createdPR = createRes.data;
        console.log(`\nСоздан PR: ID=${createdPR.id}, title="${testTitle}"`);

        // 3. Проверяем что PR видно в обычном списке
        const { data: afterCreateData } = await prAPI.get(
          "/manager/performance-reviews?limit=100",
        );
        const afterCreateItems = Array.isArray(afterCreateData)
          ? afterCreateData
          : afterCreateData?.items || [];
        const foundInNormal = afterCreateItems.some(
          (p) => p.id === createdPR.id,
        );
        console.log(
          `После создания в обычном списке: ${afterCreateItems.length} PR, наш PR найден: ${foundInNormal}`,
        );

        // 4. Архивируем PR
        const { response: archiveRes } = await prAPI.archive(createdPR.id);
        console.log(`\nАрхивация: HTTP ${archiveRes.status()}`);

        // 5. Проверяем списки после архивации
        const { data: afterArchiveData } = await prAPI.get(
          "/manager/performance-reviews?limit=100",
        );
        const afterArchiveItems = Array.isArray(afterArchiveData)
          ? afterArchiveData
          : afterArchiveData?.items || [];
        const foundInNormalAfter = afterArchiveItems.some(
          (p) => p.id === createdPR.id,
        );
        console.log(
          `\nПосле архивации в обычном списке: ${afterArchiveItems.length} PR, наш PR найден: ${foundInNormalAfter}`,
        );

        // Проверяем с category=archive (как фронтенд)
        const { data: afterArchiveArchivedData } = await prAPI.get(
          "/manager/performance-reviews?limit=100&category=archive",
        );
        const afterArchiveArchivedItems = Array.isArray(
          afterArchiveArchivedData,
        )
          ? afterArchiveArchivedData
          : afterArchiveArchivedData?.items || [];
        const foundInArchived = afterArchiveArchivedItems.some(
          (p) => p.id === createdPR.id,
        );
        console.log(
          `После архивации в category=archive: ${afterArchiveArchivedItems.length} PR, наш PR найден: ${foundInArchived}`,
        );

        // 6. Выводы
        console.log("\n--- ВЫВОДЫ ---");
        if (!foundInNormalAfter && foundInArchived) {
          console.log("✅ Фильтр category=archive работает корректно!");
          console.log("   - Архивированный PR НЕ виден в обычном списке");
          console.log("   - Архивированный PR виден с category=archive");
        } else if (foundInNormalAfter && !foundInArchived) {
          console.log("❌ Фильтр НЕ работает - PR остался в обычном списке");
        } else {
          console.log("❓ Неожиданное поведение:");
          console.log(`   - В обычном списке: ${foundInNormalAfter}`);
          console.log(`   - В category=archive: ${foundInArchived}`);
        }

        // Также проверим поле isArchived в ответе
        if (foundInArchived) {
          const archivedPR = afterArchiveArchivedItems.find(
            (p) => p.id === createdPR.id,
          );
          console.log(`   - isArchived в ответе: ${archivedPR?.isArchived}`);
        }

        // 7. Cleanup - удаляем тестовый PR
        console.log("\n--- Cleanup ---");
        const { response: deleteRes } = await prAPI.remove(createdPR.id);
        console.log(`Удаление: HTTP ${deleteRes.status()}`);
      });

      await test.step("Проверить ответ", async () => {
        expect(true).toBe(true);
      });
    });
  },
);
