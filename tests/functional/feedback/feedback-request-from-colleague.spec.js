// tests/feedback-request-from-colleague.spec.js
import { test } from "../../fixtures/auth.js";
import { FeedbackRequestAddPage } from "../../../pages/FeedbackRequestAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — запрос фидбека",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3604: Админ запрашивает фидбек у коллеги", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const requestAddPage = new FeedbackRequestAddPage(page, testInfo);

      const COMMENT_TEXT =
        "Пожалуйста, дайте обратную связь по моей работе с автотестами.";

      // 1. Открыть страницу "Запросить фидбек" через боковое меню
      await test.step('Открыть страницу "Запросить фидбек" через боковое меню', async () => {
        await requestAddPage.openFromSideMenu();
      });

      // 2. Выбрать, у кого запросить фидбек
      await test.step("Выбрать, у кого запросить фидбек", async () => {
        await requestAddPage.selectAnyRequester();
        await requestAddPage.assertRequestedUsersFilled();
      });

      // 3. Заполнить комментарий к запросу
      await test.step("Заполнить комментарий к запросу", async () => {
        await requestAddPage.fillComment(COMMENT_TEXT);
      });

      // 4. Отправить запрос и проверить экран + текст запроса
      await test.step("Отправить запрос и проверить, что он отображается корректно", async () => {
        await requestAddPage.submit();
        await requestAddPage.assertSuccessScreenAndRequestDetails(COMMENT_TEXT);
      });
    });
  },
);
