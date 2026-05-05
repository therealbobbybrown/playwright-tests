// pages/menu/DevelopmentMenuHelper.js
// Хелпер для работы с меню "Развитие"
import { BaseMenuHelper } from "./BaseMenuHelper.js";
import { TIMEOUTS } from "../../tests/utils/constants.js";

/**
 * Хелпер для работы с пунктом меню "Развитие"
 */
export class DevelopmentMenuHelper extends BaseMenuHelper {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Главный пункт меню
    this.developmentMenuItem = this._createMenuItemLocator("Развитие");
  }

  /** Открыть страницу "Настроить планы развития" через меню "Развитие" */
  async openDevelopmentPlansSettings() {
    await this._step(
      'Открыть "Настроить планы развития" через боковое меню',
      async () => {
        const targetUrl = /\/development-plans-settings\/?($|\?)/;

        if (targetUrl.test(this.page.url())) return;

        const item = this.developmentMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await item.hover();

        const link = this.page
          .getByRole("link", { name: "Настроить планы развития" })
          .first();

        // hover может не открыть подменю
        try {
          await link.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }

        await Promise.all([
          this.page.waitForURL(targetUrl, { timeout: TIMEOUTS.PAGE_LOAD }),
          link.click(),
        ]);

        await this.page.waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this._moveCursorToContent();
      },
    );
  }

  /** Получить пункты подменю "Развитие" (только тексты ссылок) */
  async getDevelopmentMenuItems() {
    return this._step(
      'Получить пункты подменю "Развитие" в боковом меню',
      async () => {
        await this.developmentMenuItem.first().hover();

        const panel = this.page
          .locator('div[class*="SidePanel_panel__"]')
          .filter({ hasText: /КОМПЕТЕНЦИИ/i })
          .first();

        await panel.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const links = panel.locator("a[href]");
        await links
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const texts = await links.allInnerTexts();
        await this._moveCursorToContent();

        return texts.map((t) => t.trim()).filter(Boolean);
      },
    );
  }

  /** Открыть страницу "Планы развития" */
  async openDevelopmentPlans() {
    await this._step(
      'Открыть "Планы развития" через боковое меню',
      async () => {
        const targetUrl = /\/development-plans\/?($|\?)/;

        if (targetUrl.test(this.page.url())) return;

        const item = this.developmentMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await item.hover();

        // Ссылка внутри SidePanel (не breadcrumb!)
        const link = this.page
          .locator(
            'div[data-panel="developmentPlans"] a[href*="/development-plans/"]',
          )
          .filter({ hasText: /^Планы развития$/ })
          .first();

        try {
          await link.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }

        try {
          await Promise.all([
            this.page.waitForURL(targetUrl, { timeout: TIMEOUTS.PAGE_LOAD }),
            link.click(),
          ]);
        } catch {
          // Fallback: прямая навигация (меню может не работать из-за SidePanel intercept)
          const origin = new URL(this.page.url()).origin;
          await this.page.goto(`${origin}/ru/development-plans/`, {
            waitUntil: "domcontentloaded",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        }

        await this.page.waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this._moveCursorToContent();
      },
    );
  }

  /** Открыть страницу "Шаблоны планов развития" */
  async openDevelopmentPlanTemplates() {
    await this._step(
      'Открыть "Шаблоны планов развития" через боковое меню',
      async () => {
        const targetUrl =
          /\/development-plan-templates\/?($|\?)|\/development-plans\/templates\/?($|\?)/;

        if (targetUrl.test(this.page.url())) return;

        const item = this.developmentMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await item.hover();

        const link = this.page
          .getByRole("link", { name: "Шаблоны планов развития" })
          .first();

        try {
          await link.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }

        try {
          await Promise.all([
            this.page.waitForURL(targetUrl, { timeout: TIMEOUTS.PAGE_LOAD }),
            link.click(),
          ]);
        } catch {
          // Fallback: прямая навигация (меню может не работать со страницы деталей шаблона)
          const origin = new URL(this.page.url()).origin;
          await this.page.goto(`${origin}/ru/development-plans/templates/`, {
            waitUntil: "domcontentloaded",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        }

        await this.page.waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this._moveCursorToContent();
      },
    );
  }
}
