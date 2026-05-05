// pages/BrandSettingsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class BrandSettingsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.heading = this.page.getByRole("heading", {
      level: 1,
      name: "Внешний вид",
    });

    this.breadcrumbHome = this.page
      .locator('a[href="/ru/"], a[href^="/ru/"]')
      .filter({ hasText: "Главная" })
      .first();

    this.logoSectionTitle = this.page
      .getByText("Логотип", { exact: true })
      .first();
    this.uploadLogoButton = this.page
      .getByRole("button", { name: "Загрузить логотип" })
      .first();
    this.logoDropzone = this.page
      .locator('[class*="ImageUploader_dropzone__"]')
      .first();
    this.logoSection = this.page
      .locator('[class*="LogoSettings_section__"]')
      .first();
    this.logoDeleteButton = this.logoSection
      .getByRole("button", { name: /Удалить/i })
      .first();
    this.logoChangeButton = this.logoSection
      .getByRole("button", { name: /Изменить/i })
      .first();

    this.menuSettingsTitle = this.page
      .getByText("Настройка пунктов меню", { exact: true })
      .first();
    this.feedbackToggleLabel = this.page
      .getByText("Показывать раздел фидбека в боковом меню", { exact: false })
      .first();
    this.feedbackToggleInput = this.page
      .locator("input#feedbackDisabled")
      .first();

    // Модалка загрузки логотипа
    this.logoFileInput = this.page
      .locator('[class*="ImageUploader_dropzone__"] input[type="file"]')
      .first();
    this.logoUploadInnerButton = this.page
      .locator('[class*="ImageUploader_dropzone__"] button')
      .filter({ hasText: "Загрузить файл" })
      .first();
    this.logoApplyButton = this.page
      .getByRole("button", { name: "Применить" })
      .first();
    this.logoPreviewImg = this.page
      .locator('[class*="ImageUploader_image__"] img')
      .first();

    this.toast = this.page.locator(".Toastify__toast").first();
  }

  async assertOpened() {
    await this._step('Открыта страница "Внешний вид"', async () => {
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      await this.heading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await expect(this.page).toHaveURL(/\/manager\/company\/brand\/?/);
    });
  }

  async assertMainElementsVisible() {
    await this._step(
      'Проверить ключевые элементы страницы "Внешний вид"',
      async () => {
        await this.breadcrumbHome.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.logoSectionTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.uploadLogoButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.menuSettingsTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.feedbackToggleLabel.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.feedbackToggleInput.waitFor({
          state: "attached",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /** Включен ли переключатель "Показывать раздел фидбека" */
  async isFeedbackToggleOn() {
    await this.feedbackToggleInput.waitFor({
      state: "attached",
      timeout: TIMEOUTS.MEDIUM,
    });
    return this.feedbackToggleInput.isChecked();
  }

  /** Установить нужное состояние переключателя (true = показывать в меню) */
  async setFeedbackMenuVisibility(shouldShow) {
    await this._step(
      `Установить переключатель фидбека в меню: ${shouldShow ? "вкл" : "выкл"}`,
      async () => {
        const current = await this.isFeedbackToggleOn();
        if (current === shouldShow) return;

        await this.feedbackToggleLabel.click();
        await this.feedbackToggleInput.waitFor({
          state: "attached",
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect
          .poll(async () => this.isFeedbackToggleOn(), {
            timeout: TIMEOUTS.SHORT,
          })
          .toBe(shouldShow);
      },
    );
  }

  /** Загрузить логотип через кнопку */
  async uploadLogo(filePath) {
    await this._step("Загрузить логотип", async () => {
      await this.uploadLogoButton.click();

      // Ждём появление инпута внутри дропзоны/модалки
      await this.logoDropzone.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.logoFileInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // setInputFiles надёжнее, чем ожидать filechooser
      await this.logoFileInput.setInputFiles(filePath);

      // Если инпут не реагирует, кликаем вспомогательную кнопку
      try {
        const applied = await this.logoFileInput.evaluate(
          (input) => !!input.files?.length,
        );
        if (!applied) {
          await this.logoUploadInnerButton.click({ timeout: TIMEOUTS.SHORT });
          await this.logoFileInput.setInputFiles(filePath);
        }
      } catch (e) {
        console.warn("uploadLogo: fallback setInputFiles warning:", e.message);
      }

      // Возможная кнопка "Сохранить" (кроп)
      const saveButton = this.page
        .getByRole("button", { name: "Сохранить" })
        .first();
      try {
        await saveButton.waitFor({ state: "visible", timeout: 3_000 });
        await saveButton.click();
      } catch (e) {
        console.warn("uploadLogo: save/crop button warning:", e.message);
      }

      // Подтверждаем загрузку — ищем кнопку "Применить" ближе к дропзоне
      let applyBtn = this.logoDropzone
        .locator(
          'xpath=ancestor-or-self::*//button[normalize-space()="Применить"]',
        )
        .first();

      if ((await applyBtn.count()) === 0) {
        applyBtn = this.logoApplyButton;
      }

      await applyBtn.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await applyBtn.click();

      // Даем фоновым запросам чуть времени
      await this.page
        .waitForLoadState("networkidle", { timeout: 7_000 })
        .catch(() => {});
    });
  }

  /** Удалить существующий логотип, если он уже установлен */
  async removeLogoIfPresent() {
    await this._step("Удалить существующий логотип, если есть", async () => {
      const deleteCount = await this.logoDeleteButton.count();
      if (deleteCount === 0) return;

      const visible = await this.logoDeleteButton.isVisible();
      if (!visible) return;

      await this.logoDeleteButton.click();

      // Ждём, пока исчезнет превью или появится тост
      const removed = this.logoPreviewImg
        .waitFor({ state: "detached", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .then(() => true)
        .catch(() => false);

      const toastSeen = this.toast
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .then(() => true)
        .catch(() => false);

      const ok = await Promise.race([removed, toastSeen]);
      if (!ok) throw new Error("Логотип не удалился: нет тоста и превью не исчезло.");
    });
  }

  /** Дождаться, что логотип удалён (нет превью и кнопки удаления) */
  async waitLogoRemoved() {
    await this._step("Дождаться удаления логотипа", async () => {
      const noPreview = this.logoPreviewImg
        .waitFor({ state: "hidden", timeout: TIMEOUTS.PAGE_LOAD })
        .then(() => true)
        .catch(() => false);

      const deleteHidden = this.logoDeleteButton
        .waitFor({ state: "hidden", timeout: TIMEOUTS.PAGE_LOAD })
        .then(() => true)
        .catch(() => false);

      const ok = await Promise.race([noPreview, deleteHidden]);
      if (!ok) throw new Error("Логотип не исчез после удаления.");
    });
  }

  /** Проверить тост об успешной загрузке логотипа */
  async assertLogoUploadNotification() {
    await this._step(
      "Проверить уведомление об успешной загрузке логотипа",
      async () => {
        // Пытаемся дождаться либо тоста, либо появления превью загруженного логотипа
        const toastSeen = this.toast
          .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
          .then(async () => {
            const text = (await this.toast.innerText().catch(() => "")).trim();
            if (!text) return false;
            return (
              /логотип/i.test(text) ||
              /успеш/i.test(text) ||
              /сохран/i.test(text)
            );
          })
          .catch(() => false);

        const previewSeen = this.logoPreviewImg
          .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
          .then(() => true)
          .catch(() => false);

        const ok = await Promise.race([toastSeen, previewSeen]);

        if (!ok) {
          throw new Error(
            "Не появилось уведомление и не показалось превью загруженного логотипа",
          );
        }
      },
    );
  }

  /** Дождаться применения логотипа (toast/превью/секции кнопок) */
  async waitLogoApplied() {
    await this._step("Дождаться применения логотипа", async () => {
      const toastSeen = this.toast
        .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
        .then(() => true)
        .catch(() => false);

      const previewSeen = this.logoPreviewImg
        .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
        .then(() => true)
        .catch(() => false);

      const deleteVisible = this.logoDeleteButton
        .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
        .then(() => true)
        .catch(() => false);

      const ok = await Promise.race([toastSeen, previewSeen, deleteVisible]);
      if (!ok)
        throw new Error(
          "Логотип не применился: нет тоста/превью/секции с кнопками.",
        );
    });
  }
}
