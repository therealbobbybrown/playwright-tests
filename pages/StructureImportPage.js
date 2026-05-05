// pages/StructureImportPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

export class StructureImportPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.title = this.page
      .getByRole("heading", { name: "Импорт сотрудников" })
      .first();
    this.description = this.page
      .getByText(
        "Загрузите таблицу с сотрудниками или импортируйте их из других сервисов.",
      )
      .first();

    this.dropzone = this.page
      .locator('div[class*="UploadFiles_dropzone__"]')
      .first();
    this.fileInput = this.dropzone.locator('input[type="file"]').first();
    this.uploadButton = this.dropzone
      .getByRole("button", { name: "Загрузить таблицу" })
      .first();
    this.dropzoneHint = this.dropzone
      .getByText("или перетащите файл сюда")
      .first();

    this.sizeHint = this.page
      .locator('span[class*="UploadFiles_hint__"]')
      .first();
    this.sampleLink = this.page
      .locator('a[class*="Files_file__"]')
      .filter({ hasText: /Скачать пример таблицы XLSX/i })
      .first();
  }

  async openFromSideMenu() {
    await this._step(
      'Открыть "Загрузить таблицу" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureImport();
        await this.assertOpened();
      },
    );
  }

  async assertOpened() {
    await this._step(
      "Проверить, что открыта страница импорта сотрудников",
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);
        await this.title.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.description.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.dropzone.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_IMPORT, {
            timeout: TIMEOUTS.SHORT,
          })
          .catch(() => null);
      },
    );
  }

  async assertMainElementsVisible() {
    await this._step(
      "Проверить основные элементы импорта сотрудников",
      async () => {
        await expect(this.title).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.description).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(this.dropzone).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.fileInput).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.uploadButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.dropzoneHint).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(this.sizeHint).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.sampleLink).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  async downloadSampleFile() {
    return this._step("Скачать пример таблицы XLSX", async () => {
      await this.sampleLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      const href = await this.sampleLink.getAttribute("href");
      if (!href) {
        throw new Error("Не нашли ссылку на пример таблицы");
      }
      const url = new URL(href, this.page.url()).toString();

      const [response] = await Promise.all([
        this.page.request.get(url),
        this.sampleLink.click(),
      ]);

      if (!response.ok()) {
        throw new Error(
          `Ссылка не отдает файл: ${response.status()} ${response.statusText()}`,
        );
      }

      const contentType = response.headers()["content-type"] ?? "";
      const isSpreadsheet =
        contentType.includes("spreadsheetml") ||
        contentType.includes("officedocument") ||
        contentType.includes("octet-stream") ||
        contentType.includes("application/vnd") ||
        contentType.includes("xlsx");
      if (!isSpreadsheet) {
        throw new Error(
          `Ожидали XLSX Content-Type, получили: "${contentType}"`,
        );
      }
    });
  }

  async openFileChooser() {
    return this._step(
      'Нажать "Загрузить таблицу" и открыть выбор файла',
      async () => {
        await this.uploadButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        const tryOpen = async (clickTarget) => {
          try {
            const [chooser] = await Promise.all([
              this.page.waitForEvent("filechooser", { timeout: 3_000 }),
              clickTarget.click(),
            ]);
            return chooser;
          } catch {
            return null;
          }
        };

        let chooser = await tryOpen(this.uploadButton);
        if (!chooser) {
          chooser = await tryOpen(this.dropzone);
        }
        if (!chooser) {
          chooser = await tryOpen(this.fileInput);
        }

        if (!chooser) {
          throw new Error("Не удалось открыть окно выбора файла");
        }

        return chooser;
      },
    );
  }
}
