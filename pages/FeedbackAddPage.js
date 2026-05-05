// pages/FeedbackAddPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

const USERS_LOAD_TIMEOUT_MS = TIMEOUTS.EXTRA_LONG;
const USERS_LOAD_RETRY_DELAY_MS = 500;

export class FeedbackAddPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы "Дать фидбек"
    this.heading = this.page
      .locator("h1, h2")
      .filter({ hasText: /Дать фидбек/i })
      .first();

    // --- Тип: благодарность / фидбек ---
    this.feedbackTypeCard = this.page
      .locator('[class*="FeedbackTypeButtons_buttonInner__"]')
      .filter({ hasText: "Фидбек" })
      .first();

    this.blockTitle = this.page
      .locator('[class*="AddFeedback_block-title__"]')
      .first();

    this.feedbackBlockTitle = this.page
      .locator('[class*="AddFeedback_block-title__"]')
      .filter({ hasText: /Ваш фидбек/i })
      .first();

    // --- поле "Кому" ---
    this.recipientsPlaceholder = this.page
      .getByText("Выберите сотрудников или отдел", { exact: false })
      .first();

    // список пользователей (CSS-modules, поэтому по префиксу)
    this.recipientsList = this.page
      .locator('[class*="Users_list__"]:visible')
      .first();

    this.recipientRows = this.recipientsList.locator(
      '[class*="UserOption_row__"]',
    );

    this.recipientsApplyButton = this.page
      .getByRole("button", { name: "Применить" })
      .first();

    // Редактировать получателей (после выбора первого получателя)
    this.editRecipientsButton = this.page
      .getByRole("button", { name: /Редактировать/i })
      .or(this.page.getByRole("link", { name: /Редактировать/i }))
      .first();

    // --- текст ---
    this.bodyTextarea = this.page.locator("textarea#addFeedback__body").first();

    // --- публичность ---
    this.publicVisibilityCard = this.page
      .locator('[class*="FeedbackAccessButtons_buttonInner__"]')
      .filter({ hasText: "Сделать публичной" })
      .first();

    this.otherPeopleTitle = this.page
      .locator('[class*="AddFeedback_members-title__"]')
      .filter({ hasText: "Другие люди" });

    // --- отправка ---
    this.submitButton = this.page
      .getByRole("button", { name: "Отправить" })
      .first();

    this.feedbackSuccessNotification = this.page
      .locator(".Toastify__toast")
      .first();

    // --- экран "Фидбек отправлен" ---
    this.sentHeading = this.page
      .getByText(/Фидбек отправлен/i, { exact: false })
      .first();

    this.goToFeedbackButton = this.page
      .getByRole("button", { name: "Перейти к фидбеку" })
      .first();

    // --- "Подарить баллы" ---
    this.karmaToggleButton = this.page
      .getByRole("button", { name: /Подарить баллы/i })
      .first();

    this.karmaDebitInfo = this.page
      .getByText("Будет списано", { exact: false })
      .first();

    // --- GIF ---
    this.gifButton = this.page
      .locator('button[class*="AddFeedback_gifButton__"]')
      .first();
    this.gifModal = this.page
      .locator('[class*="GifModal_gifContent__"]')
      .first();
    this.gifModalItems = this.gifModal.locator(
      '[class*="GifModal_gifItemWrapper__"] img',
    );
    this.gifPreviewImage = this.page
      .locator('[class*="AddFeedback_gifPreview__"] img')
      .first();
  }

  async assertOpened() {
    await this._step('Открыта страница "Дать фидбек"', async () => {
      await this.heading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.page).toHaveURL(/\/feedbacks\/add\/?/);
      await this.bodyTextarea.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async switchToFeedback() {
    await this._step('Переключиться на тип "Фидбек"', async () => {
      await this.feedbackTypeCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.feedbackTypeCard.click();
      await this.feedbackBlockTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async openRecipientsPicker() {
    const placeholderVisible = await this.recipientsPlaceholder
      .isVisible()
      .catch(() => false);

    if (placeholderVisible) {
      await this.recipientsPlaceholder.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.recipientsPlaceholder.click();
    } else {
      await this.editRecipientsButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.editRecipientsButton.click();
    }

    await this.recipientsList.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });
  }

  async selectAnyRecipient() {
    await this._step('Выбрать получателя фидбэка в поле "Кому"', async () => {
      await this.openRecipientsPicker();

      const startedAt = Date.now();
      let count = await this.recipientRows.count();
      while (count === 0 && Date.now() - startedAt < USERS_LOAD_TIMEOUT_MS) {
        await this.page.waitForTimeout(USERS_LOAD_RETRY_DELAY_MS);
        count = await this.recipientRows.count();
      }

      if (count === 0) {
        throw new Error(
          `Список получателей пуст (ждали ${USERS_LOAD_TIMEOUT_MS} мс)`,
        );
      }

      await this.recipientRows.first().click();

      await this.recipientsApplyButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await Promise.all([
        this.recipientsList.waitFor({
          state: "hidden",
          timeout: TIMEOUTS.MEDIUM,
        }),
        this.recipientsApplyButton.click(),
      ]);
    });
  }

  async fillBody(text) {
    await this._step("Заполнить текст фидбэка", async () => {
      await this.bodyTextarea.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.bodyTextarea.fill(text);
    });
  }

  async fillThanks(params) {
    const { body } = params;

    await this._step(
      "Заполнить получателя и текст фидбэка/благодарности",
      async () => {
        await this.selectAnyRecipient();
        await this.fillBody(body);
      },
    );
  }

  async setKarmaPoints(points) {
    await this._step(
      'Включить "Подарить баллы" и ввести количество',
      async () => {
        await this.karmaToggleButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.karmaToggleButton.click();

        const karmaInput = this.page
          .locator("input#addFeedback__giftBonusAmount")
          .first();

        await karmaInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await karmaInput.fill("");
        await karmaInput.type(String(points));
      },
    );
  }

  async assertKarmaDebitInfo(points) {
    await this._step("Проверить текст о списании баллов", async () => {
      await this.karmaDebitInfo.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.karmaDebitInfo).toContainText(String(points));
    });
  }

  async pickAnyGif() {
    await this._step("Выбрать гифку для фидбэка", async () => {
      await this.gifButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.gifButton.click();

      await this.gifModal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      let attempts = 0;
      let count = await this.gifModalItems.count();
      while (count === 0 && attempts < 10) {
        await this.page.waitForTimeout(TIMEOUTS.SMALL);
        count = await this.gifModalItems.count();
        attempts += 1;
      }

      if (count === 0) throw new Error("В модалке нет гифок");

      await this.gifModalItems.first().click();
    });
  }

  async assertGifPreviewVisible() {
    await this._step("Проверить превью выбранной гифки", async () => {
      await this.gifPreviewImage.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.gifPreviewImage).toBeVisible();
    });
  }

  async addAdditionalRecipients(count = 2) {
    await this._step("Добавить дополнительных получателей", async () => {
      await this.openRecipientsPicker();

      const startedAt = Date.now();
      let total = await this.recipientRows.count();
      while (total === 0 && Date.now() - startedAt < USERS_LOAD_TIMEOUT_MS) {
        await this.page.waitForTimeout(USERS_LOAD_RETRY_DELAY_MS);
        total = await this.recipientRows.count();
      }

      if (total === 0)
        throw new Error("Список получателей пуст (дополнительные)");

      // первый уже выбран (мы его выбираем в selectAnyRecipient()),
      // чтобы не снять — начинаем со 2-го элемента списка
      const availableForAdd = Math.max(total - 1, 0);
      if (availableForAdd === 0) {
        throw new Error(
          "Недостаточно пользователей в списке, чтобы добавить дополнительных получателей",
        );
      }

      const toSelect = Math.min(count, availableForAdd);
      for (let i = 0; i < toSelect; i += 1) {
        await this.recipientRows.nth(i + 1).click();
      }

      await this.recipientsApplyButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await Promise.all([
        this.recipientsList.waitFor({
          state: "hidden",
          timeout: TIMEOUTS.MEDIUM,
        }),
        this.recipientsApplyButton.click(),
      ]);
    });
  }

  async setPublicVisibility() {
    await this._step("Сделать фидбек публичным", async () => {
      await this.publicVisibilityCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.publicVisibilityCard.click();
    });
  }

  async assertAdditionalRecipientsSectionHidden() {
    await this._step('Проверить, что блок "Другие люди" скрыт', async () => {
      await expect(this.otherPeopleTitle).toHaveCount(0);
    });
  }

  async assertMembersSectionHidden() {
    await this._step('Проверить, что блок "Другие люди" скрыт', async () => {
      await expect(this.otherPeopleTitle).toHaveCount(0);
    });
  }

  async submit() {
    await this._step("Отправить фидбек", async () => {
      await this.submitButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.submitButton.click();
    });
  }

  async assertFeedbackSent() {
    await this._step('Проверить экран "Фидбек отправлен"', async () => {
      // Даем странице стабилизироваться: навигация/рендер могут занять время.
      await this.page
        .waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        })
        .catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      await Promise.race([
        this.sentHeading.waitFor({ state: "visible", timeout: TIMEOUTS.LONG }),
        this.goToFeedbackButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
          .catch(() => {}),
      ]);
    });
  }

  async openLastFeedback() {
    await this._step("Перейти к карточке отправленного фидбэка", async () => {
      await this.goToFeedbackButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.FEEDBACK_VIEW),
        this.goToFeedbackButton.click(),
      ]);
    });
  }

  async assertFeedbackSentToast() {
    await this._step("Проверить, что появился тост об успехе", async () => {
      await expect(this.feedbackSuccessNotification).toBeVisible({
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }
}
