// tests/org-structure-invite-links.spec.js
import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureInviteLinksPage } from "../../../pages/StructureInviteLinksPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - приглашение по ссылке",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C3519: Админ открывает страницу приглашения и копирует ссылку", async ({
      adminAuth: page,
      browser,
    }, testInfo) => {
      setSeverity("normal");
      const inviteLinksPage = new StructureInviteLinksPage(page, testInfo);
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const email = `qaadmin+${suffix}@example.org`;
      await page.context().grantPermissions(["clipboard-read"]);

      await test.step('Открыть страницу "Пригласить по ссылке" через боковое меню', async () => {
        await inviteLinksPage.openFromSideMenu();
      });

      await test.step("Проверить основные элементы страницы", async () => {
        await inviteLinksPage.assertMainElementsVisible();
      });

      await test.step('Нажать "Скопировать ссылку-приглашение"', async () => {
        await inviteLinksPage.copyInviteLink();
      });

      const inviteLink =
        await test.step("Получить ссылку из буфера обмена", async () => {
          let clipboardValue = "";
          await expect
            .poll(
              async () => {
                clipboardValue = await page.evaluate(() =>
                  navigator.clipboard.readText(),
                );
                return clipboardValue;
              },
              { timeout: 10_000 },
            )
            .not.toBe("");
          return clipboardValue;
        });

      await test.step("Открыть ссылку в новом контексте (инкогнито)", async () => {
        const anonContext = await browser.newContext();
        const anonPage = await anonContext.newPage();
        await anonPage.goto(inviteLink, { waitUntil: "domcontentloaded" });
        await anonPage.locator("#form-login-email").fill(email);
        await anonPage
          .locator('form:has(#form-login-email) button[type="submit"]')
          .click();
        await anonPage
          .locator('div[class*="EmailSent_title__"]')
          .waitFor({ state: "visible", timeout: 20_000 });
        await expect(
          anonPage.locator('div[class*="EmailSent_title__"]'),
        ).toHaveText(/Проверьте почту|Check your e-mail/i);
        await expect(
          anonPage.locator('div[class*="EmailSent_description__"] b'),
        ).toHaveText(email);
        await anonContext.close();
      });
    });
  },
);
