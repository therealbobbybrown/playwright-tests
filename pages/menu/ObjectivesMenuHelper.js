// pages/menu/ObjectivesMenuHelper.js
// Хелпер для работы с меню "Цели"
import { BaseMenuHelper } from "./BaseMenuHelper.js";
import { TIMEOUTS } from "../../tests/utils/constants.js";
import { URL_PATTERNS } from "../../tests/utils/urls.js";

/**
 * Хелпер для работы с пунктом меню "Цели"
 */
export class ObjectivesMenuHelper extends BaseMenuHelper {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Локаторы для подменю "Цели"
    this.objectivesMenuItem = this._createMenuItemLocator("Цели");
    this.objectivesCreateLink = this.page.getByRole("link", {
      name: "Создать цель",
    });
    this.objectivesAllLink = this.page.getByRole("link", { name: "Все цели" });
    this.objectivesSettingsLink = this.page.getByRole("link", {
      name: "Настройки целей",
    });
  }

  /** Открыть страницу "Настройки целей" через меню */
  async openObjectivesSettings() {
    await this._step(
      'Открыть "Настройки целей" через боковое меню',
      async () => {
        await this.objectivesMenuItem.first().hover();
        await this.objectivesSettingsLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.objectivesSettingsLink.click();
      },
    );
  }

  /** Есть ли пункт "Все цели" внутри меню "Цели" */
  async hasObjectivesAllItem() {
    await this.objectivesMenuItem.first().hover();
    await this.objectivesSettingsLink.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });

    const count = await this.objectivesAllLink.count();
    await this._moveCursorToContent();
    return count > 0;
  }

  /** Открыть "Все цели" через меню "Цели" */
  async openObjectivesAll() {
    await this._step('Открыть "Все цели" через боковое меню', async () => {
      await this.objectivesMenuItem.first().hover();
      await this.objectivesAllLink
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.OBJECTIVES, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        }),
        this.objectivesAllLink.first().click(),
      ]);
    });
  }

  /** Меню "Цели" при выключенных OKR: только "Настройки целей" */
  async assertObjectivesMenuHasOnlySettings() {
    await this._step('Пункты меню "Цели" при выключенных OKR', async () => {
      await this.objectivesMenuItem.first().hover();
      await this.objectivesSettingsLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const createCount = await this.objectivesCreateLink.count();
      const allCount = await this.objectivesAllLink.count();

      if (createCount !== 0 || allCount !== 0) {
        throw new Error(
          `Ожидали только "Настройки целей", ` +
            `"Создать цель" x${createCount}, "Все цели" x${allCount}`,
        );
      }

      await this._moveCursorToContent();
    });
  }

  /** Меню "Цели" при включённых OKR: полный набор */
  async assertObjectivesMenuHasFullSet() {
    await this._step('Пункты меню "Цели" при включённых OKR', async () => {
      await this.objectivesMenuItem.first().hover();
      await this.objectivesSettingsLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const createCount = await this.objectivesCreateLink.count();
      const allCount = await this.objectivesAllLink.count();
      const settingsCount = await this.objectivesSettingsLink.count();

      if (createCount === 0 || allCount === 0 || settingsCount === 0) {
        throw new Error(
          'Ожидали пункты "Создать цель", "Все цели" и "Настройки целей" в меню "Цели"',
        );
      }

      await this._moveCursorToContent();
    });
  }

  /** Есть ли пункт "Создать цель" внутри меню "Цели" */
  async hasObjectivesCreateItem() {
    await this.objectivesMenuItem.first().hover();
    await this.objectivesSettingsLink.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });

    const count = await this.objectivesCreateLink.count();
    await this._moveCursorToContent();
    return count > 0;
  }

  /** Открыть "Создать цель" через меню "Цели" */
  async openObjectivesCreate() {
    await this._step('Открыть "Создать цель" через боковое меню', async () => {
      await this.objectivesMenuItem.first().hover();
      await this.objectivesCreateLink
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.OBJECTIVES_ADD, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        }),
        this.objectivesCreateLink.first().click(),
      ]);
    });
  }
}
