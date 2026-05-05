// tests/functional/objectives/objective-view-access-levels.spec.js
// Regression: SSR 500 при открытии цели уровня company обычным пользователем
//
// Проверяет что страница /ru/objectives/view/{id}/ не даёт 500 ("Все упало")
// для целей разных уровней (self, team, company) при просмотре от роли user.
// Также проверяет корректное поведение при selective-доступе (userAccessType: 'selective').
//
// ВАЖНО: page.textContent("body") содержит встроенный JSON Redux-стейт, в котором
// могут быть подстроки "500", "404" и т.д. — НЕ проверяем body-text на эти числа.
// Проверяем только ВИДИМЫЕ элементы страницы.

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// ID целей — заполняются в beforeAll
const objectiveIds = {
  self: null,
  team: null,
  company: null,
  limited: null,
};
const createdIds = [];

// Ожидаемые заголовки, которые были заданы при создании
const objectiveTitles = {};

/**
 * Проверить что страница не является страницей ошибки SSR.
 * SSR 500 показывает видимый текст "Все упало".
 * ПРИМЕЧАНИЕ: <title> в этом приложении может содержать "Ошибка" как дефолтное значение
 * до гидрации клиента — не используем его для проверки SSR-ошибки.
 * @param {import('@playwright/test').Page} page
 */
async function assertNoSSRError(page) {
  // "Все упало" — видимый текст страницы ошибки SSR
  const errorEl = page.getByText("Все упало", { exact: false });
  const isErrorVisible = await errorEl.isVisible();
  expect(
    isErrorVisible,
    "Страница не должна показывать SSR-ошибку 'Все упало'",
  ).toBe(false);
}

test.describe(
  "Цели — просмотр страницы цели по уровням (регрессия SSR 500)",
  { tag: ["@ui", "@objectives", "@regression", "@critical"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      const adminId = adminApi.getCurrentUserId();
      if (!adminId) {
        throw new Error(
          "Не удалось получить adminId после signIn — проверь credentials",
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const ts = Date.now();

      // Создаём 3 цели everybody (self / team / company)
      for (const level of ["self", "team", "company"]) {
        const title = `[VIEW-UI] ${level} цель ${ts}`;
        const { response, data } = await adminApi.saveObjective({
          title,
          startDate,
          endDate,
          status: "active",
          level,
          responsibleUserId: adminId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-view-ui-${level}-${ts}`,
              title: `КР ${level} ${ts}`,
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: adminId,
            },
          ],
        });

        if (!response.ok() || !data?.id) {
          throw new Error(
            `Не удалось создать цель level='${level}': ${response.status()} ${JSON.stringify(data)}`,
          );
        }

        objectiveIds[level] = data.id;
        objectiveTitles[level] = title;
        createdIds.push(data.id);
      }

      // Создаём цель с selective-доступом (только конкретные пользователи из списка)
      // API принимает: everybody | selective
      const selectiveTitle = `[VIEW-UI] selective цель ${ts}`;
      const { response: selResp, data: selData } = await adminApi.saveObjective({
        title: selectiveTitle,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: adminId,
        userAccessType: "selective",
        milestones: [
          {
            temporaryId: `temp-view-ui-selective-${ts}`,
            title: `КР selective ${ts}`,
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: adminId,
          },
        ],
      });

      if (!selResp.ok() || !selData?.id) {
        throw new Error(
          `Не удалось создать selective-цель: ${selResp.status()} ${JSON.stringify(selData)}`,
        );
      }

      objectiveIds.limited = selData.id;
      objectiveTitles.limited = selectiveTitle;
      createdIds.push(selData.id);

      console.log(
        `[beforeAll] Цели созданы: self=${objectiveIds.self}, team=${objectiveIds.team}, company=${objectiveIds.company}, selective=${objectiveIds.limited}`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      for (const id of createdIds) {
        await adminApi.deleteObjective(id).catch((e) => {
          console.warn(`[afterAll] Не удалось удалить цель ${id}: ${e.message}`);
        });
      }
      createdIds.length = 0;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES, "View Access Levels");
    });

    // ──────────────────────────────────────────────
    // Self-уровень
    // ──────────────────────────────────────────────

    test("C8362: User открывает страницу индивидуальной цели (self) без ошибки 500",
      { tag: ["@smoke"] },
      async ({ userAuth, page }) => {
        setSeverity("critical");

        if (!objectiveIds.self) {
          throw new Error(
            "objectiveIds.self не установлен — beforeAll завершился с ошибкой",
          );
        }

        await test.step(
          `Открыть /ru/objectives/view/${objectiveIds.self}/`,
          async () => {
            await page.goto(`/ru/objectives/view/${objectiveIds.self}/`);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
              .catch(() => {});
          },
        );

        await test.step("Проверить: страница не показывает SSR-ошибку 'Все упало'", async () => {
          await assertNoSSRError(page);
        });

        await test.step("Проверить: заголовок 'Детали цели' виден на странице", async () => {
          const heading = page
            .getByRole("heading", { name: /Детали цели/i })
            .first();
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(
            heading,
            "Заголовок 'Детали цели' должен быть виден",
          ).toBeVisible();
        });

        await test.step("Проверить: title цели виден на странице", async () => {
          const titleText = objectiveTitles.self;
          const titleEl = page.getByText(titleText, { exact: false });
          await titleEl.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await expect(
            titleEl,
            `Title цели '${titleText}' должен быть виден на странице`,
          ).toBeVisible();
        });
      },
    );

    // ──────────────────────────────────────────────
    // Team-уровень
    // ──────────────────────────────────────────────

    test("C8363: User открывает страницу командной цели (team) без ошибки 500",
      { tag: ["@smoke"] },
      async ({ userAuth, page }) => {
        setSeverity("critical");

        if (!objectiveIds.team) {
          throw new Error(
            "objectiveIds.team не установлен — beforeAll завершился с ошибкой",
          );
        }

        await test.step(
          `Открыть /ru/objectives/view/${objectiveIds.team}/`,
          async () => {
            await page.goto(`/ru/objectives/view/${objectiveIds.team}/`);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
              .catch(() => {});
          },
        );

        await test.step("Проверить: страница не показывает SSR-ошибку 'Все упало'", async () => {
          await assertNoSSRError(page);
        });

        await test.step("Проверить: заголовок 'Детали цели' виден на странице", async () => {
          const heading = page
            .getByRole("heading", { name: /Детали цели/i })
            .first();
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(heading, "Заголовок 'Детали цели' должен быть виден").toBeVisible();
        });

        await test.step("Проверить: title цели виден на странице", async () => {
          const titleText = objectiveTitles.team;
          const titleEl = page.getByText(titleText, { exact: false });
          await titleEl.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await expect(
            titleEl,
            `Title цели '${titleText}' должен быть виден на странице`,
          ).toBeVisible();
        });
      },
    );

    // ──────────────────────────────────────────────
    // Company-уровень — ключевой регрессионный тест
    // ──────────────────────────────────────────────

    test("C8364: User открывает страницу цели компании (company) без ошибки 500 — регрессия",
      { tag: ["@smoke"] },
      async ({ userAuth, page }) => {
        setSeverity("critical");

        if (!objectiveIds.company) {
          throw new Error(
            "objectiveIds.company не установлен — beforeAll завершился с ошибкой",
          );
        }

        await test.step(
          `Открыть /ru/objectives/view/${objectiveIds.company}/`,
          async () => {
            await page.goto(`/ru/objectives/view/${objectiveIds.company}/`);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
              .catch(() => {});
          },
        );

        await test.step(
          "Проверить: страница не показывает SSR-ошибку 'Все упало' (основная регрессия)",
          async () => {
            await assertNoSSRError(page);
          },
        );

        await test.step("Проверить: заголовок 'Детали цели' виден на странице", async () => {
          const heading = page
            .getByRole("heading", { name: /Детали цели/i })
            .first();
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(
            heading,
            "Заголовок 'Детали цели' должен быть виден",
          ).toBeVisible();
        });

        await test.step("Проверить: title цели виден на странице", async () => {
          const titleText = objectiveTitles.company;
          const titleEl = page.getByText(titleText, { exact: false });
          await titleEl.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await expect(
            titleEl,
            `Title цели '${titleText}' должен быть виден на странице`,
          ).toBeVisible();
        });
      },
    );

    // ──────────────────────────────────────────────
    // Selective-доступ — пользователь вне списка
    // ──────────────────────────────────────────────

    test("C8365: User открывает цель с selective-доступом (не в списке) — видит сообщение, а не 500",
      async ({ userAuth, page }) => {
        setSeverity("normal");

        if (!objectiveIds.limited) {
          throw new Error(
            "objectiveIds.limited не установлен — beforeAll завершился с ошибкой",
          );
        }

        await test.step(
          `Открыть /ru/objectives/view/${objectiveIds.limited}/`,
          async () => {
            await page.goto(`/ru/objectives/view/${objectiveIds.limited}/`);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
              .catch(() => {});
          },
        );

        await test.step(
          "Проверить: страница не отдаёт SSR-ошибку 'Все упало' (даже при ограниченном доступе)",
          async () => {
            await assertNoSSRError(page);
          },
        );

        await test.step(
          "Проверить: страница показывает осмысленный ответ (либо 'Детали цели', либо сообщение об ограничении)",
          async () => {
            // При selective-доступе user не состоит в списке → должна быть страница с понятным
            // сообщением (не 500). Если API возвращает данные — тоже ок.
            const detailsHeading = page
              .getByRole("heading", { name: /Детали цели/i })
              .first();
            const accessDenied = page.getByText(/нет доступа|доступ ограничен|не найден|forbidden/i);
            const deletedNotice = page.getByText(/цель была удалена/i);

            const [hasDetails, hasDenied, hasDeleted] = await Promise.all([
              detailsHeading.isVisible(),
              accessDenied.isVisible(),
              deletedNotice.isVisible(),
            ]);

            expect(
              hasDetails || hasDenied || hasDeleted,
              "При selective-доступе страница должна показывать осмысленный контент или сообщение об ограничении, а не пустую/сломанную страницу",
            ).toBe(true);
          },
        );
      },
    );
  },
);
