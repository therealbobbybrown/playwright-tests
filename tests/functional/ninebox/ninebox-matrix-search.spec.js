// @ts-check
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { NineBoxAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тест: поиск сотрудника в матрице NineBox по имени и координатам
 */

test.describe(
  "NineBox матрица — поиск сотрудников",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    let api;

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.NINE_BOX);

      api = new NineBoxAPI(page.request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await api.ensureEnabled();
    });

    test(
      "C9381: Найти сотрудника по имени в матрице NineBox через API",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        let knownUser;

        await test.step(
          "Получить известного сотрудника из матрицы",
          async () => {
            const { response, data } = await api.searchManager({
              limit: 1,
              actualize: false,
            });
            expect(response.status(), "Поиск доступен (200)").toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");

            if (data.items.length === 0) {
              test.skip(
                true,
                "Матрица не содержит сотрудников — тест невозможен",
              );
              return;
            }

            knownUser = data.items[0];
            expect(
              knownUser.targetUserId,
              "targetUserId должен быть числом > 0",
            ).toBeGreaterThan(0);
          },
        );

        await test.step(
          "Выполнить поиск по targetUserId как текстовый запрос",
          async () => {
            const query = String(knownUser.targetUserId);
            const { response, data } = await api.searchManager({
              limit: 10,
              actualize: false,
              q: query,
            });
            expect(response.status(), "Поиск по q выполнен (200)").toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");
            expect(
              Array.isArray(data.items),
              "items — массив",
            ).toBe(true);
          },
        );

        await test.step(
          "Проверить структуру ответа поиска",
          async () => {
            const { data } = await api.searchManager({
              limit: 100,
              actualize: false,
            });

            expect(
              typeof data.total,
              "total — число",
            ).toBe("number");
            expect(
              typeof data.limit,
              "limit — число",
            ).toBe("number");
            expect(
              typeof data.offset,
              "offset — число",
            ).toBe("number");

            if (data.items.length > 0) {
              const item = data.items[0];
              expect(item).toHaveProperty("targetUserId");
              expect(item).toHaveProperty("yValue");
              expect(item).toHaveProperty("xValue");
              expect(item).toHaveProperty("yCoord");
              expect(item).toHaveProperty("xCoord");
            }
          },
        );

        await test.step(
          "Поиск с фильтром по координатам известного сотрудника",
          async () => {
            const { response, data } = await api.searchManager({
              limit: 100,
              actualize: false,
              xCoord: knownUser.xCoord,
              yCoord: knownUser.yCoord,
            });
            expect(
              response.status(),
              "Фильтрация по координатам выполнена (200)",
            ).toBe(200);
            expect(data).toHaveProperty("items");

            // Известный сотрудник должен присутствовать в отфильтрованных результатах
            const found = data.items.find(
              (item) => item.targetUserId === knownUser.targetUserId,
            );
            expect(
              found,
              `Сотрудник ${knownUser.targetUserId} должен быть в результатах фильтрации по координатам [${knownUser.xCoord}, ${knownUser.yCoord}]`,
            ).toBeDefined();

            // Все результаты должны иметь те же координаты
            for (const item of data.items) {
              expect(
                item.xCoord,
                `xCoord сотрудника ${item.targetUserId} должна совпадать с фильтром`,
              ).toBe(knownUser.xCoord);
              expect(
                item.yCoord,
                `yCoord сотрудника ${item.targetUserId} должна совпадать с фильтром`,
              ).toBe(knownUser.yCoord);
            }
          },
        );
      },
    );
  },
);
