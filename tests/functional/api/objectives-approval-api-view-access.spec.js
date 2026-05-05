// tests/functional/api/objectives-approval-api-view-access.spec.js
// Regression: SSR 500 при открытии цели уровня company обычным пользователем
//
// Тест-матрица GET /private/objectives/{id}/ по ролям и уровням:
// | Роль     | self | team | company |
// | admin    |  200 |  200 |   200   |
// | user     |  200 |  200 |   200   |
// | head     |  200 |  200 |   200   |
// | stranger |  200 |  200 |   200   |
//
// Все цели созданы от admin с userAccessType: 'everybody'

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const STRANGER_EMAIL = "qaadmin+acc+3@example.org";
const STRANGER_PASSWORD = "DemoPass_7421!";

// Созданные ID — заполняются в beforeAll, очищаются в afterAll
const objectiveIds = {
  self: null,
  team: null,
  company: null,
};
const createdIds = [];

test.describe(
  "Objectives API — просмотр цели по ролям и уровням (регрессия SSR 500)",
  { tag: ["@api", "@objectives", "@regression"] },
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

      for (const level of ["self", "team", "company"]) {
        const { response, data } = await adminApi.saveObjective({
          title: `[VIEW-ACCESS] ${level} цель ${ts}`,
          startDate,
          endDate,
          status: "active",
          level,
          responsibleUserId: adminId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-view-${level}-${ts}`,
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
        createdIds.push(data.id);
      }

      console.log(
        `[beforeAll] Созданы цели: self=${objectiveIds.self}, team=${objectiveIds.team}, company=${objectiveIds.company}`,
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
      markAsAPITest(MODULES.OBJECTIVES, "View Access by Role");
    });

    // ──────────────────────────────────────────────
    // ADMIN — владелец целей
    // ──────────────────────────────────────────────

    test(
      "C8410: Admin может просмотреть индивидуальную цель (self)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        if (!objectiveIds.self) {
          throw new Error("objectiveIds.self не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — self (admin)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.self));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Admin должен получить 200 для self-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(
            title,
            "Тело ответа должно содержать title цели",
          ).toBeTruthy();
        });
      },
    );

    test(
      "C8411: Admin может просмотреть командную цель (team)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        if (!objectiveIds.team) {
          throw new Error("objectiveIds.team не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — team (admin)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.team));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Admin должен получить 200 для team-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8412: Admin может просмотреть цель компании (company)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        if (!objectiveIds.company) {
          throw new Error("objectiveIds.company не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — company (admin)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.company));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Admin должен получить 200 для company-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    // ──────────────────────────────────────────────
    // USER — не владелец, не руководитель
    // ──────────────────────────────────────────────

    test(
      "C8413: User может просмотреть индивидуальную цель другого сотрудника (self)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("user");
        await api.signIn(email, password);

        if (!objectiveIds.self) {
          throw new Error("objectiveIds.self не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — self (user)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.self));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `User должен получить 200 для self-цели с userAccessType=everybody, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8414: User может просмотреть командную цель (team)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("user");
        await api.signIn(email, password);

        if (!objectiveIds.team) {
          throw new Error("objectiveIds.team не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — team (user)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.team));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `User должен получить 200 для team-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8415: User может просмотреть цель компании (company) — регрессия SSR 500",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("user");
        await api.signIn(email, password);

        if (!objectiveIds.company) {
          throw new Error("objectiveIds.company не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — company (user)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.company));
        });

        await test.step(
          "Проверить: статус 200 и title в теле ответа (не 500 — регрессия SSR)",
          async () => {
            expect(
              response.status(),
              `API не должен возвращать 500 для company-цели при запросе от user. Статус: ${response.status()}`,
            ).not.toBe(500);
            expect(
              response.ok(),
              `User должен получить 200 для company-цели с userAccessType=everybody, получен ${response.status()}`,
            ).toBe(true);
            const title = data?.title ?? data?.objective?.title;
            expect(
              title,
              "Тело ответа должно содержать title цели — не пустой SSR-ответ",
            ).toBeTruthy();
          },
        );
      },
    );

    // ──────────────────────────────────────────────
    // HEAD — прямой руководитель
    // ──────────────────────────────────────────────

    test(
      "C8416: Head может просмотреть индивидуальную цель (self)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("head");
        await api.signIn(email, password);

        if (!objectiveIds.self) {
          throw new Error("objectiveIds.self не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — self (head)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.self));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Head должен получить 200 для self-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8417: Head может просмотреть командную цель (team)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("head");
        await api.signIn(email, password);

        if (!objectiveIds.team) {
          throw new Error("objectiveIds.team не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — team (head)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.team));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Head должен получить 200 для team-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8418: Head может просмотреть цель компании (company)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("head");
        await api.signIn(email, password);

        if (!objectiveIds.company) {
          throw new Error("objectiveIds.company не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — company (head)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.company));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Head должен получить 200 для company-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    // ──────────────────────────────────────────────
    // STRANGER — пользователь из другой ветки
    // ──────────────────────────────────────────────

    test(
      "C8419: Stranger может просмотреть индивидуальную цель (self)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        await api.signIn(STRANGER_EMAIL, STRANGER_PASSWORD);

        if (!objectiveIds.self) {
          throw new Error("objectiveIds.self не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — self (stranger)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.self));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Stranger должен получить 200 для self-цели с userAccessType=everybody, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8420: Stranger может просмотреть командную цель (team)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        await api.signIn(STRANGER_EMAIL, STRANGER_PASSWORD);

        if (!objectiveIds.team) {
          throw new Error("objectiveIds.team не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — team (stranger)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.team));
        });

        await test.step("Проверить: статус 200 и title в теле ответа", async () => {
          expect(
            response.ok(),
            `Stranger должен получить 200 для team-цели, получен ${response.status()}`,
          ).toBe(true);
          const title = data?.title ?? data?.objective?.title;
          expect(title, "Тело ответа должно содержать title цели").toBeTruthy();
        });
      },
    );

    test(
      "C8421: Stranger может просмотреть цель компании (company) — регрессия SSR 500",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new ObjectivesAPI(request);
        await api.signIn(STRANGER_EMAIL, STRANGER_PASSWORD);

        if (!objectiveIds.company) {
          throw new Error("objectiveIds.company не установлен — beforeAll завершился с ошибкой");
        }

        let response, data;
        await test.step("GET /private/objectives/{id}/ — company (stranger)", async () => {
          ({ response, data } = await api.getObjectiveById(objectiveIds.company));
        });

        await test.step(
          "Проверить: статус 200 и title в теле ответа (не 500 — регрессия SSR)",
          async () => {
            expect(
              response.status(),
              `API не должен возвращать 500 для company-цели при запросе от stranger. Статус: ${response.status()}`,
            ).not.toBe(500);
            expect(
              response.ok(),
              `Stranger должен получить 200 для company-цели с userAccessType=everybody, получен ${response.status()}`,
            ).toBe(true);
            const title = data?.title ?? data?.objective?.title;
            expect(
              title,
              "Тело ответа должно содержать title цели — не пустой SSR-ответ",
            ).toBeTruthy();
          },
        );
      },
    );
  },
);
