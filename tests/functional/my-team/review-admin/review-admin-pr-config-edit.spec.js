/**
 * AT-67: review_admin может редактировать конфигурацию назначенного PR через API
 *
 * Проверяет, что пользователь с permission [12] (manageOwnPerformanceReview)
 * и назначенный администратором конкретного PR имеет WRITE-доступ:
 * может обновить настройки PR через POST /manager/performance-reviews/{id}.
 */
import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import {
  PerformanceReviewAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = base.extend({
  reviewAdminCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");
    const setupData = await helper.seedFullSetup();

    const password = getTestUserPassword();

    // API клиент от имени review_admin
    const reviewAdminPrAPI = new PerformanceReviewAPI(request);
    await reviewAdminPrAPI.signIn(setupData.email, password);

    // API клиент от имени админа (для верификации)
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminPrAPI = new PerformanceReviewAPI(request);
    await adminPrAPI.signIn(adminEmail, adminPassword);

    await use({
      reviewAdminPrAPI,
      adminPrAPI,
      setupData,
      helper,
    });

    try {
      await helper.cleanup(setupData);
    } catch (e) {
      console.warn(`[Cleanup] ${e.message}`);
    }
  },
});

test.describe(
  "Review Admin API — Редактирование конфигурации assigned PR",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin PR Config Edit");
    });

    test("C8085: Review_admin может обновить описание назначенного PR через API",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { reviewAdminPrAPI, adminPrAPI, setupData } = reviewAdminCtx;
        const { prId } = setupData;

        let originalDescription;
        const testDescription = `E2E_AT67_${Date.now()}`;

        await test.step(
          "Шаг 1: Получить текущие настройки PR через review_admin API",
          async () => {
            const { response, data } = await reviewAdminPrAPI.getById(prId);

            expect(
              response.ok(),
              `GET /manager/performance-reviews/${prId} должен вернуть 2xx, получили ${response.status()}`,
            ).toBe(true);

            expect(data, "Тело ответа не должно быть пустым").toBeTruthy();

            originalDescription = data.description ?? "";

            console.log(
              `[AT-67] Текущее описание PR ${prId}: "${originalDescription}"`,
            );
          },
        );

        await test.step(
          "Шаг 2: Обновить описание PR через review_admin API",
          async () => {
            const { response, data } = await reviewAdminPrAPI.update(prId, {
              description: testDescription,
            });

            expect(
              response.ok(),
              `POST /manager/performance-reviews/${prId} должен вернуть 2xx (review_admin имеет write-доступ), получили ${response.status()}. Body: ${JSON.stringify(data)}`,
            ).toBe(true);

            console.log(
              `[AT-67] Описание обновлено на "${testDescription}", статус: ${response.status()}`,
            );
          },
        );

        await test.step(
          "Шаг 3: Верифицировать, что изменение сохранилось (перечитать PR)",
          async () => {
            const { response, data } = await reviewAdminPrAPI.getById(prId);

            expect(response.ok()).toBe(true);

            expect(
              data.description,
              `Описание PR должно быть обновлено до "${testDescription}"`,
            ).toBe(testDescription);

            console.log(
              `[AT-67] Верификация: описание PR ${prId} = "${data.description}"`,
            );
          },
        );

        await test.step(
          "Шаг 4: Откат — восстановить исходное описание PR",
          async () => {
            const { response } = await adminPrAPI.update(prId, {
              description: originalDescription,
            });

            expect(
              response.ok(),
              `Откат описания PR ${prId} должен пройти успешно, получили ${response.status()}`,
            ).toBe(true);

            console.log(
              `[AT-67] Откат выполнен: описание восстановлено до "${originalDescription}"`,
            );
          },
        );
      },
    );
  },
);
