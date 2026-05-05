import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/StatisticsPage.js

export class StatisticsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Живучий маркер страницы: h1 “История и статистика”
    this.heading = this.page
      .locator('h1, [role="heading"][aria-level="1"]')
      .filter({ hasText: /История\s+и\s+статистика/i })
      .first();

    this.sectionWrappers = this.page.locator(
      'div[class*="Statistics_spoiler-wrapper__"]',
    );

    this.feedbackSection = this._sectionByTitle("Фидбек");
    this.requestsSection = this._sectionByTitle("Запросы на фидбек");
  }

  // ---------------- Public API ----------------

  async assertOpened() {
    await this._step('Открыта страница "История и статистика"', async () => {
      await this.page.waitForURL(URL_PATTERNS.STATISTICS, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
        waitUntil: "commit",
      });

      await this._waitStatisticsUI(15_000);
    });
  }

  async getFeedbackTabTitles() {
    return this._getSectionTabTitles(this.feedbackSection);
  }

  async getRequestsTabTitles() {
    return this._getSectionTabTitles(this.requestsSection);
  }

  /**
   * ЗАПРОСЫ: обычно на /statistics у табов есть только mark.
   * Но если в раскрытом состоянии внезапно есть Chart_total — сравним.
   */
  async assertRequestsTabMarkMatchesChartTotalIfPresent(title) {
    await this._step(
      `Запросы: "${title}" — (если есть) mark == total`,
      async () => {
        const item = await this._getTabItem(this.requestsSection, title);

        const markLocator = item
          .locator('span[class*="SpoilerItem_mark__"]')
          .first();
        if ((await markLocator.count()) === 0) {
          throw new Error(
            `Запросы "${title}": не нашли mark (SpoilerItem_mark__dyDi5)`,
          );
        }

        const mark = await this._readNumberFast(
          markLocator,
          `requests mark ("${title}")`,
        );

        const totalLocator = item
          .locator('div[class*="Chart_total__"]')
          .first();
        if ((await totalLocator.count()) > 0) {
          const total = await this._readNumberFast(
            totalLocator,
            `requests total ("${title}")`,
          );
          if (mark !== total) {
            throw new Error(
              `Запросы "${title}": mark=${mark} != total=${total}`,
            );
          }
        }
      },
    );
  }

  /** ФИДБЕК: раскрыть таб и проверить mark == total (chart) */
  async assertFeedbackTabMarkMatchesChartTotal(title) {
    await this._step(`Фидбек: "${title}" — mark == total`, async () => {
      const item = await this._openFeedbackSpoiler(title);

      const markLocator = item
        .locator('span[class*="SpoilerItem_mark__"]')
        .first();
      const totalLocator = item.locator('div[class*="Chart_total__"]').first();

      if ((await markLocator.count()) === 0) {
        throw new Error(
          `Фидбек "${title}": не нашли mark (SpoilerItem_mark__dyDi5)`,
        );
      }
      if ((await totalLocator.count()) === 0) {
        throw new Error(
          `Фидбек "${title}": не нашли total (Chart_total__vIHFe)`,
        );
      }

      const mark = await this._readNumberFast(markLocator, `mark ("${title}")`);
      const total = await this._readNumberFast(
        totalLocator,
        `total ("${title}")`,
      );

      if (mark !== total) {
        throw new Error(`Фидбек "${title}": mark=${mark} != total=${total}`);
      }
    });
  }

  /** ФИДБЕК: раскрыть таб -> "Посмотреть ленту" -> проверить h1 -> скрин -> назад */
  async openFeedFromFeedbackTabAndAssertHeader(title, expectedH1) {
    await this._step(
      `Фидбек: "${title}" — лента + h1 + скрин + назад`,
      async () => {
        const item = await this._openFeedbackSpoiler(title);

        const action = this._findViewFeedActionInside(item);
        await action.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await Promise.all([
          this._waitLeaveStatistics(15_000),
          action.click({ noWaitAfter: true }),
        ]);

        await this._assertH1(expectedH1);
        await this._attachScreenshot(`Лента — ${expectedH1}`);

        await this._goBackToStatistics();
        await this.assertOpened();
      },
    );
  }

  /**
   * ЗАПРОСЫ: иногда клик раскрывает контент с "Посмотреть ленту",
   * иногда сразу ведёт в ленту.
   * После перехода — проверка h1 + скрин.
   */
  async openFeedFromRequestsTabAndAssertHeader(title, expectedH1) {
    await this._step(
      `Запросы: "${title}" — лента + h1 + скрин + назад`,
      async () => {
        const item = await this._getTabItem(this.requestsSection, title);

        await item.scrollIntoViewIfNeeded().catch(() => null);
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const headerBtn = item
          .locator('button[class*="SpoilerItem_button__"]')
          .first();
        if ((await headerBtn.count()) > 0) {
          await headerBtn.click();
        } else {
          await item.click();
        }

        // 1) сначала пробуем: появился action "Посмотреть ленту" в этом item
        const action = this._findViewFeedActionInside(item);

        const actionVisible = await action
          .waitFor({ state: "visible", timeout: 2_000 })
          .then(() => true)
          .catch(() => false);

        if (actionVisible) {
          await Promise.all([
            this._waitLeaveStatistics(15_000),
            action.click({ noWaitAfter: true }),
          ]);

          await this._assertH1(expectedH1);
          await this._attachScreenshot(`Лента — ${expectedH1}`);

          await this._goBackToStatistics();
          await this.assertOpened();
          return;
        }

        // 2) если action не появилось — значит, клик уже увёл в ленту
        await this._waitNavigationOrHeader(expectedH1, 15_000);
        await this._assertH1(expectedH1);

        await this._attachScreenshot(`Лента — ${expectedH1}`);

        await this._goBackToStatistics();
        await this.assertOpened();
      },
    );
  }

  // ---------------- Internal helpers ----------------

  _sectionByTitle(sectionTitleText) {
    const wrapper = this.sectionWrappers
      .filter({
        has: this.page.locator('h2[class*="Statistics_spoiler-title__"]', {
          hasText: sectionTitleText,
        }),
      })
      .first();

    const items = wrapper.locator("div.SpoilerItem_item___Je1x");

    return { title: sectionTitleText, wrapper, items };
  }

  async _getSectionTabTitles(section) {
    return this._step(
      `Получить названия табов секции "${section.title}"`,
      async () => {
        const count = await section.items.count();
        if (!count) return [];

        const titles = [];
        for (let i = 0; i < count; i += 1) {
          const t = (
            await section.items
              .nth(i)
              .locator('span[class*="SpoilerItem_title__"]')
              .first()
              .innerText()
          ).trim();
          if (t) titles.push(t);
        }
        return titles;
      },
    );
  }

  async _getTabItem(section, title) {
    const item = section.items
      .filter({
        has: this.page.locator('span[class*="SpoilerItem_title__"]', {
          hasText: title,
        }),
      })
      .first();

    if ((await item.count()) === 0) {
      throw new Error(`Не нашли таб "${title}" в секции "${section.title}"`);
    }

    return item;
  }

  async _openFeedbackSpoiler(title) {
    const item = await this._getTabItem(this.feedbackSection, title);

    await item.scrollIntoViewIfNeeded().catch(() => null);
    await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const cls = (await item.getAttribute("class")) || "";
    const isOpen = cls.includes("SpoilerItem_item--is-open");

    if (!isOpen) {
      const headerBtn = item
        .locator('button[class*="SpoilerItem_button__"]')
        .first();
      if ((await headerBtn.count()) > 0) {
        await headerBtn.click();
      } else {
        await item.click();
      }
    }

    const content = item.locator('div[class*="SpoilerItem_content__"]').first();
    await content.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    return item;
  }

  _findViewFeedActionInside(item) {
    return item
      .locator("a, button")
      .filter({ hasText: /Посмотреть ленту/i })
      .first();
  }

  async _assertH1(expectedH1) {
    const h1 = this.page
      .locator('h1, [role="heading"][aria-level="1"]')
      .filter({ hasText: expectedH1 })
      .first();
    await h1.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
  }

  async _waitLeaveStatistics(timeoutMs) {
    try {
      await this.page.waitForURL(
        (url) => !URL_PATTERNS.STATISTICS.test(url.pathname),
        { timeout: timeoutMs, waitUntil: "commit" },
      );
      return true;
    } catch {
      return false;
    }
  }

  async _waitNavigationOrHeader(expectedH1, timeoutMs) {
    const h1 = this.page
      .locator('h1, [role="heading"][aria-level="1"]')
      .filter({ hasText: expectedH1 })
      .first();

    await Promise.race([
      this.page.waitForURL(
        (url) => !URL_PATTERNS.STATISTICS.test(url.pathname),
        { timeout: timeoutMs, waitUntil: "commit" },
      ),
      h1.waitFor({ state: "visible", timeout: timeoutMs }),
    ]);
  }

  async _waitStatisticsUI(timeoutMs) {
    // Страница статистики считается “готовой”, если появился любой маркер.
    await Promise.race([
      this.heading.waitFor({ state: "visible", timeout: timeoutMs }),
      this.feedbackSection.wrapper.waitFor({
        state: "visible",
        timeout: timeoutMs,
      }),
      this.requestsSection.wrapper.waitFor({
        state: "visible",
        timeout: timeoutMs,
      }),
    ]);
  }

  async _goBackToStatistics() {
    const backBtn = this.page
      .locator('button[class*="BackButton_back__"]:not([disabled])')
      .first();

    // 1) Возвращаемся на /statistics
    if (await backBtn.isVisible().catch(() => false)) {
      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.STATISTICS, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
          waitUntil: "commit",
        }),
        backBtn.click({ noWaitAfter: true }),
      ]);
    } else {
      await this.page
        .goBack({ waitUntil: "domcontentloaded" })
        .catch(async () => {
          await this.page.goto("/ru/statistics/", {
            waitUntil: "domcontentloaded",
          });
        });

      await this.page.waitForURL(URL_PATTERNS.STATISTICS, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
        waitUntil: "commit",
      });
    }

    // 2) Дожидаемся появления страницы статистики.
    // ВАЖНО: без дополнительного goto-фоллбека, чтобы не ловить "page closed"
    await this._waitStatisticsUI(15_000);
  }

  async _attachScreenshot(name) {
    // fullPage здесь часто “дорогой” и может добивать общий таймаут теста.
    // Для отчёта обычно достаточно видимой области.
    const png = await this.page.screenshot({ fullPage: false });

    if (this.testInfo?.attach) {
      await this.testInfo.attach(name, {
        body: png,
        contentType: "image/png",
      });
      return;
    }

    if (allure && typeof allure.attachment === "function") {
      allure.attachment(name, png, "image/png");
    }
  }

  async _readNumberFast(locator, context) {
    const raw = (await locator.textContent().catch(() => null)) ?? "";
    const cleaned = String(raw).replace(/[\s ]/g, "");
    const match = cleaned.match(/-?\d+/);

    if (!match) {
      throw new Error(
        `Не удалось распарсить число из ${context}. Сырой текст: "${raw}"`,
      );
    }

    const num = Number(match[0]);
    if (!Number.isFinite(num)) {
      throw new Error(
        `Не удалось привести к числу значение ${context}: "${match[0]}"`,
      );
    }

    return num;
  }
}
