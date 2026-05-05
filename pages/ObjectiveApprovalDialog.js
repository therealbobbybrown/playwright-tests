// pages/ObjectiveApprovalDialog.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Page object для попапов утверждения целей (DEVAPR-11722)
 * Обслуживает 3 диалога: отправка на утверждение, утверждение, возврат на доработку
 */
export class ObjectiveApprovalDialog extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    this.dialog = this.page.getByRole('dialog');
    this.dialogTitle = this.dialog.locator('div, span').first();
    this.closeButton = this.dialog.getByRole('button', { name: 'Закрыть модальное окно' });
    this.cancelButton = this.dialog.getByRole('button', { name: 'Отмена' });

    // Попап "Отправить на утверждение"
    this.approverLink = this.dialog.getByRole('link');
    this.approverName = this.dialog.getByRole('link').locator('div, span').first();

    // Попап "В доработку" — поле комментария
    this.commentField = this.dialog.getByRole('textbox', { name: /комментарий/i });
    this.commentHint = this.dialog.getByText('Комментарий будет доступен сотруднику и его руководителям');
  }

  /** Дождаться появления диалога */
  async waitForOpen() {
    await this.dialog.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
  }

  /** Проверить заголовок диалога */
  async assertTitle(expectedTitle) {
    await this._step(`Проверить заголовок диалога: "${expectedTitle}"`, async () => {
      await expect(this.dialog.getByText(expectedTitle)).toBeVisible();
    });
  }

  /** Проверить имя утверждающего в попапе отправки */
  async assertApproverName(expectedName) {
    await this._step(`Проверить имя утверждающего: "${expectedName}"`, async () => {
      await expect(this.dialog.getByText(expectedName)).toBeVisible();
    });
  }

  /** Проверить ссылку на профиль утверждающего */
  async assertApproverProfileLink(userId) {
    await this._step(`Проверить ссылку на профиль утверждающего: user ${userId}`, async () => {
      const link = this.dialog.getByRole('link').filter({ has: this.page.locator(`[href*="/profile/${userId}/"]`) });
      // Fallback: check href contains userId
      const anyLink = this.dialog.getByRole('link');
      const href = await anyLink.getAttribute('href').catch(() => '');
      expect(href, `Ссылка должна вести на профиль ${userId}`).toContain(`/profile/${userId}/`);
    });
  }

  /** Проверить что текст "Утверждает цель" отображается */
  async assertApproverLabel() {
    await this._step('Проверить метку "Утверждает цель"', async () => {
      await expect(this.dialog.getByText('Утверждает цель')).toBeVisible();
    });
  }

  /** Проверить видимость поля комментария (попап доработки) */
  async assertCommentFieldVisible() {
    await this._step('Проверить видимость поля комментария', async () => {
      await expect(this.commentField).toBeVisible();
      await expect(this.commentHint).toBeVisible();
    });
  }

  /** Заполнить комментарий */
  async fillComment(text) {
    await this._step(`Ввести комментарий: "${text}"`, async () => {
      await this.commentField.fill(text);
    });
  }

  /** Нажать кнопку подтверждения ("Отправить" или "Утвердить") */
  async confirm() {
    await this._step('Подтвердить действие в диалоге', async () => {
      // Кнопка подтверждения — вторая кнопка (первая "Отмена"), или по имени
      const confirmBtn = this.dialog.getByRole('button', { name: /^Отправить$|^Утвердить$/ }).first();
      await confirmBtn.click();
      // Дождаться закрытия диалога
      await this.dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    });
  }

  /** Нажать "Отмена" */
  async cancel() {
    await this._step('Отменить действие в диалоге', async () => {
      await this.cancelButton.click();
      await this.dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    });
  }

  /** Закрыть диалог крестиком */
  async close() {
    await this._step('Закрыть диалог крестиком', async () => {
      await this.closeButton.click();
      await this.dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    });
  }

  /** Проверить что диалог закрыт */
  async assertClosed() {
    await expect(this.dialog).toHaveCount(0);
  }

  /** Проверить что диалог открыт */
  async assertOpen() {
    await expect(this.dialog).toBeVisible();
  }
}
