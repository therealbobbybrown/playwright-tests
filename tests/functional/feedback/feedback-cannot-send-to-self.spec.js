// tests/functional/feedback/feedback-cannot-send-to-self.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackAddPage } from "../../../pages/FeedbackAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Фидбек — негативные сценарии: отправка самому себе",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3599: Себя нет в списке получателей фидбека", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const feedbackAddPage = new FeedbackAddPage(page, testInfo);

      // Получаем имя текущего пользователя из профиля или заголовка
      let currentUserName = "";

      await test.step("Получить имя текущего пользователя", async () => {
        // Открываем профиль чтобы надёжно получить имя
        await sideMenu.openMyProfile();
        const heading = page.getByRole("heading").first();
        await heading.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        currentUserName = (await heading.innerText()).trim();

        expect(
          currentUserName.length,
          "Имя текущего пользователя должно быть определено",
        ).toBeGreaterThan(0);
        console.log(`Текущий пользователь: "${currentUserName}"`);
      });

      await test.step('Открыть страницу "Дать фидбек"', async () => {
        await sideMenu.openFeedbackAdd();
        await feedbackAddPage.assertOpened();
      });

      await test.step("Открыть список получателей и проверить отсутствие себя", async () => {
        await feedbackAddPage.openRecipientsPicker();

        // Ждём загрузки списка
        const recipientsList = feedbackAddPage.recipientsList;
        await recipientsList.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Ждём появления хотя бы одного получателя
        const rows = feedbackAddPage.recipientRows;
        await rows
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.LONG });

        // Получаем все имена в списке
        const allNames = await rows.allInnerTexts();
        console.log(`Найдено получателей: ${allNames.length}`);
        expect(allNames.length, "Список получателей не должен быть пустым").toBeGreaterThan(0);

        // Проверяем, что текущего пользователя нет в списке
        const firstName = currentUserName.split(" ")[0].toLowerCase();
        const selfInList = allNames.some((name) =>
          name.toLowerCase().includes(firstName),
        );
        expect(
          selfInList,
          `Текущий пользователь "${currentUserName}" не должен быть в списке получателей`,
        ).toBe(false);
      });
    });
  },
);
