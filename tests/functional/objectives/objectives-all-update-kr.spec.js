// tests/objectives-all-update-kr.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";

// ID цели создаётся динамически в beforeAll
let objectiveId = null;

test.describe(
  'Страница "Все цели" — обновление КР из таблицы',
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      const userId = adminApi.getCurrentUserId();
      if (!userId) {
        throw new Error(
          "Не удалось получить userId администратора после signIn — проверь credentials",
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      const { response: createResp, data: createData } =
        await adminApi.saveObjective({
          title: `[Тест-C4008] Обновление КР из таблицы ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-c4008-${uniqueId}`,
              title: `КР процентный прогресс ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 50,
              responsibleUserId: userId,
            },
          ],
        });

      if (!createResp.ok()) {
        throw new Error(
          `Не удалось создать цель через API: ${createResp.status()} ${JSON.stringify(createData)}`,
        );
      }

      objectiveId = createData?.id;
      if (!objectiveId) {
        throw new Error(
          `API не вернул ID созданной цели. Ответ: ${JSON.stringify(createData)}`,
        );
      }

      console.log(
        `[beforeAll] Создана тестовая цель id=${objectiveId} с процентным КР для C4008`,
      );
    });

    test.afterAll(async ({ request }) => {
      if (!objectiveId) return;

      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      await adminApi.deleteObjective(objectiveId).catch((e) => {
        console.warn(
          `[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`,
        );
      });
      objectiveId = null;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test('C4008: Админ обновляет значение первого КР прямо со страницы "Все цели"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      // 1. Открыть страницу "Все цели" через боковое меню
      await test.step('Открыть страницу "Все цели"', async () => {
        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      let initialProgress;

      // 2. Раскрыть первую цель и запомнить текущий прогресс первого КР
      await test.step("Раскрыть первую цель и запомнить прогресс первого КР", async () => {
        await objectivesAllPage.expandFirstObjectiveRow();
        initialProgress =
          await objectivesAllPage.getFirstMilestoneCurrentProgress();

        expect(
          Number.isFinite(initialProgress),
          `Прогресс первого КР должен быть числом, получили ${initialProgress}`,
        ).toBe(true);
      });

      // 3. Обновить значение первого КР на ПРОИЗВОЛЬНОЕ (1–100, не = initialProgress)
      await test.step("Обновить значение первого КР на новое произвольное и дождаться отображения", async () => {
        const generateNewValue = (initial) => {
          // нормальный диапазон — 1..100
          const min = 1;
          const max = 100;

          // если исходное значение не в диапазоне, просто берём любое число 1..100
          if (!Number.isFinite(initial) || initial < min || initial > max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
          }

          // пробуем несколько раз получить число != initial
          for (let i = 0; i < 10; i += 1) {
            const candidate = Math.floor(Math.random() * (max - min + 1)) + min;
            if (candidate !== initial) return candidate;
          }

          // запасной вариант, если «не повезло»
          if (initial === max) return max - 1;
          return min;
        };

        const newValue = generateNewValue(initialProgress);

        await objectivesAllPage.updateFirstMilestoneProgress(newValue);

        // Ждём, пока прогресс действительно станет равен newValue (гонка с UI/бэком)
        await expect
          .poll(
            async () => objectivesAllPage.getFirstMilestoneCurrentProgress(),
            {
              timeout: 10_000,
            },
          )
          .toBe(newValue);

        const finalProgress =
          await objectivesAllPage.getFirstMilestoneCurrentProgress();

        expect(
          finalProgress,
          "Прогресс КР после обновления не должен совпадать с исходным значением",
        ).not.toBe(initialProgress);
      });
    });
  },
);
