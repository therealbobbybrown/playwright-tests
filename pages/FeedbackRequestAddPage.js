// pages/FeedbackRequestAddPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

const USERS_LOAD_TIMEOUT_MS = TIMEOUTS.EXTRA_LONG;
const USERS_LOAD_RETRY_DELAY_MS = 500;

export class FeedbackRequestAddPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы "Запросить фидбек"
    this.heading = this.page
      .locator("h1, h2")
      .filter({ hasText: /Запросить фидбек/i })
      .first();

    // --- поле "На кого" (оставляем по умолчанию на себе) ---
    this.targetUserFieldButton = this.page
      .locator('button[class*="Input_input__"]', { hasText: "На кого" })
      .first();

    // --- поле "У кого" ---
    this.fromWhomFieldButton = this.page
      .locator('button[class*="Input_input__"]')
      .filter({ hasText: "У кого" })
      .first();

    // Элемент с выбранными именами внутри поля "У кого"
    this.fromWhomValueNamesInner = this.page
      .locator('[class*="value-names-inner"]')
      .first();

    // --- модалка выбора сотрудников ---
    this.usersSheet = this.page.locator(".react-modal-sheet-content").first();

    this.usersOptions = this.usersSheet.locator(
      '[class*="Option_option-item__"] button.Option_option__K_CL1',
    );

    this.sheetConfirmButton = this.page
      .getByRole("button", { name: "Подтвердить" })
      .first();

    // --- комментарий к запросу ---
    this.commentTextarea = this.page
      .locator("textarea#addFeedbackRequest__comment")
      .first();

    // --- отправка запроса ---
    this.submitButton = this.page
      .getByRole("button", { name: "Запросить" })
      .first();

    // --- экран "Ваш запрос отправлен" ---
    this.requestSentHeading = this.page
      .locator("text=Ваш запрос отправлен")
      .first();

    this.requestSentCloseButton = this.page
      .getByRole("button", { name: "Закрыть" })
      .first();

    // --- страница "Ваш запрос на фидбек" ---
    this.viewHeading = this.page
      .locator('[class*="Simple_title__"] span')
      .filter({ hasText: "Ваш запрос на фидбек" })
      .first();

    this.viewBody = this.page
      .locator('[class*="FeedbackRequest_body__"]')
      .first();
  }

  /** Открыть "Запросить фидбек" через боковое меню */
  async openFromSideMenu() {
    await this._step(
      'Открыть страницу "Запросить фидбек" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openFeedbackRequest();
        await this.assertOpened();
      },
    );
  }

  async assertOpened() {
    await this._step('Открыта страница "Запросить фидбек"', async () => {
      await this.heading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.page).toHaveURL(/\/requests\/add\/?/);

      await this.commentTextarea.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async selectAnyRequester() {
    await this._step("Выбрать, у кого запросить фидбек", async () => {
      await this.fromWhomFieldButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.fromWhomFieldButton.click();

      await this.usersSheet.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const startedAt = Date.now();
      let count = await this.usersOptions.count();
      while (count === 0 && Date.now() - startedAt < USERS_LOAD_TIMEOUT_MS) {
        await this.page.waitForTimeout(USERS_LOAD_RETRY_DELAY_MS);
        count = await this.usersOptions.count();
      }

      if (count === 0) {
        throw new Error("Список сотрудников в модалке пуст");
      }

      await this.usersOptions.first().click();

      await this.sheetConfirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await Promise.all([
        this.usersSheet.waitFor({
          state: "hidden",
          timeout: TIMEOUTS.MEDIUM,
        }),
        this.sheetConfirmButton.click(),
      ]);
    });
  }

  async assertRequestedUsersFilled() {
    await this._step('Проверить, что поле "У кого" заполнено', async () => {
      await this.fromWhomFieldButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const text = await this.fromWhomValueNamesInner.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    });
  }

  async fillComment(text) {
    await this._step("Заполнить комментарий к запросу", async () => {
      await this.commentTextarea.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.commentTextarea.fill(text);
    });
  }

  async submit() {
    await this._step("Отправить запрос фидбека", async () => {
      await this.submitButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.submitButton.click();
    });
  }

  /** Экран с иллюстрацией "Ваш запрос отправлен" */
  async assertRequestSentScreen() {
    await this._step('Проверить экран "Ваш запрос отправлен"', async () => {
      await this.requestSentHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async closeRequestSentScreen() {
    await this._step('Закрыть экран "Ваш запрос отправлен"', async () => {
      await this.requestSentCloseButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await Promise.all([
        this.viewHeading.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        }),
        this.requestSentCloseButton.click(),
      ]);
    });
  }

  async assertRequestViewBodyContains(text) {
    await this._step(
      'Проверить текст запроса на странице "Ваш запрос на фидбек"',
      async () => {
        await this.viewHeading.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(this.viewBody).toContainText(text);
      },
    );
  }

  /** Комплексная проверка после сабмита */
  async assertSuccessScreenAndRequestDetails(commentText) {
    await this.assertRequestSentScreen();
    await this.closeRequestSentScreen();
    await this.assertRequestViewBodyContains(commentText);
  }
}
