// pages/StructureConstructorPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class StructureConstructorPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.topMenu = this.page.locator(SELECTORS.ORG_STRUCTURE_TOP_MENU).first();

    // В DOM: <div class="ViewSelect_view-select__..."><button ...>Вид: ...</button></div>
    this.viewSelectButton = this.page
      .locator(`${SELECTORS.VIEW_SELECT} button`)
      .first();

    // В DOM: <div class="StructureConstructor_search-button__..."><button ... /></div>
    this.searchButton = this.page
      .locator('div[class*="StructureConstructor_search-button"] button')
      .first();

    // В DOM: <button class="... UsersExportButton_users-export-button__...">Скачать</button>
    this.exportButton = this.page
      .locator(SELECTORS.USERS_EXPORT_BUTTON)
      .first();

    this.pageWrapper = this.page
      .locator('div[class*="StructureConstructor_page-wrapper"]')
      .first();

    this.constructorOuter = this.page
      .locator('div[class*="StructureConstructor_constructor-outer"]')
      .first();

    this.constructorWrapper = this.page
      .locator('div[class*="StructureConstructor_constructor-wrapper"]')
      .first();

    this.constructorInner = this.page
      .locator('div[class*="StructureConstructor_constructor__"]')
      .first();

    this.treeRoot = this.page
      .locator('div[class*="StructureConstructor_tree"]')
      .first();
    this.connectorsPath = this.page
      .locator('svg path[class*="Connectors_connector"]')
      .first();
  }

  async openFromSideMenu() {
    await this._step(
      'Открыть страницу "Структура компании" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureConstructor();
        await this.assertOpened();
      },
    );
  }

  async goto() {
    return this.openFromSideMenu();
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Структура компании"',
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);

        await this.topMenu.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.viewSelectButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        await expect(this.viewSelectButton).toContainText(/вид/i);
        await expect(this.viewSelectButton).toContainText(
          /структура компании/i,
        );

        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_CONSTRUCTOR, {
            timeout: TIMEOUTS.SHORT,
          })
          .catch(() => null);
      },
    );
  }

  async assertMainElementsVisible() {
    await this._step(
      "Проверить основные элементы страницы оргструктуры (без проверки данных)",
      async () => {
        await this.topMenu.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.viewSelectButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.searchButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await expect(this.searchButton).toBeEnabled();

        await this.exportButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await expect(this.exportButton).toBeEnabled();
        await expect(this.exportButton).toContainText(/скачать/i);

        // Рабочая область (дерево/плейн/пустое состояние) - без привязки к данным
        await this.constructorOuter.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.constructorWrapper.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        // Интерактивная область (в DOM это tabindex="0")
        await expect(this.constructorWrapper).toHaveAttribute("tabindex", "0");

        // Не падаем на пустой структуре: допускаем разные варианты отрисовки.
        const hasTree =
          (await this.treeRoot.count()) > 0 &&
          (await this.treeRoot.isVisible().catch(() => false));
        const hasConnectors = (await this.connectorsPath.count()) > 0;

        if (!hasTree && !hasConnectors) {
          await this.pageWrapper.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
        }
      },
    );
  }
}
