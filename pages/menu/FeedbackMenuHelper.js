// pages/menu/FeedbackMenuHelper.js
// Хелпер для работы с меню "Фидбек"
import { BaseMenuHelper } from "./BaseMenuHelper.js";
import { TIMEOUTS } from "../../tests/utils/constants.js";
import { URL_PATTERNS } from "../../tests/utils/urls.js";
import { SELECTORS } from "../../tests/utils/selectors.js";

/**
 * Хелпер для работы с пунктом меню "Фидбек"
 */
export class FeedbackMenuHelper extends BaseMenuHelper {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Главный пункт меню
    this.feedbackMenuItem = this.page.locator(
      `li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Фидбек"))`,
    );

    // Ссылки в подменю
    this.feedbackAddLink = this.page.getByRole("link", { name: "Дать фидбек" });
    this.feedbackRequestLink = this.page.getByRole("link", {
      name: "Запросить фидбек",
    });

    // <a href="/ru/manager/feedbacks/">Просмотр фидбека</a>
    this.feedbackViewLink = this.page
      .locator(
        'a[href="/ru/manager/feedbacks/"], a[href^="/ru/manager/feedbacks"]',
      )
      .filter({ hasText: /Просмотр фидбека/i })
      .first();

    // <a href="/ru/feedbacks/feed/of-employees/">Фидбек моих сотрудников</a>
    this.feedbackOfEmployeesLink = this.page
      .locator(
        'a[href="/ru/feedbacks/feed/of-employees/"], a[href*="/feedbacks/feed/of-employees"]',
      )
      .filter({ hasText: /Фидбек моих сотрудников/i })
      .first();

    // <a href="/ru/statistics/">История и статистика</a>
    this.feedbackHistoryStatisticsLink = this.page
      .locator(
        'a[href="/ru/statistics/"], a[href^="/ru/statistics"], a[href*="/statistics"]',
      )
      .filter({ hasText: /История и статистика/i })
      .first();

    // <a href="/ru/manager/statistics/feedbacks/">Статистика фидбека</a>
    this.feedbackStatisticsLink = this.page
      .locator(
        'a[href="/ru/manager/statistics/feedbacks/"], a[href^="/ru/manager/statistics/feedbacks"], a[href*="/manager/statistics/feedbacks"]',
      )
      .filter({ hasText: /Статистика фидбека/i })
      .first();
  }

  /** Видим ли пункт "Фидбек" в боковом меню (верхний уровень) */
  async isFeedbackMenuItemVisible() {
    const item = this.feedbackMenuItem.first();
    const count = await item.count();
    if (count === 0) return false;
    return item.isVisible().catch(() => false);
  }

  /** Открыть страницу "Дать фидбек" через боковое меню */
  async openFeedbackAdd() {
    await this._step('Открыть "Дать фидбек" через боковое меню', async () => {
      const item = this.feedbackMenuItem.first();
      await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await item.hover();

      await this.feedbackAddLink
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.FEEDBACK_ADD, {
          timeout: TIMEOUTS.PAGE_LOAD,
        }),
        this.feedbackAddLink.first().click(),
      ]);

      await this.page.waitForLoadState("domcontentloaded", {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this._moveCursorToContent();
    });
  }

  /** Открыть страницу "Запросить фидбек" через боковое меню */
  async openFeedbackRequest() {
    await this._step(
      'Открыть "Запросить фидбек" через боковое меню',
      async () => {
        const item = this.feedbackMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await item.hover();

        await this.feedbackRequestLink
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await Promise.all([
          this.page.waitForURL(URL_PATTERNS.FEEDBACK_REQUEST_ADD, {
            timeout: TIMEOUTS.PAGE_LOAD,
          }),
          this.feedbackRequestLink.first().click(),
        ]);

        await this.page.waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this._moveCursorToContent();
      },
    );
  }

  /** Открыть страницу "Просмотр фидбека" через боковое меню */
  async openFeedbackView() {
    await this._step(
      'Открыть "Просмотр фидбека" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/feedbacks\/?($|\?)/;
        await this._openFromFeedbackMenu(this.feedbackViewLink, targetUrl, {
          fallbackPath: "/ru/manager/feedbacks/",
        });
      },
    );
  }

  // алиас, чтобы не ломать существующие тесты
  async openFeedbackReview() {
    return this.openFeedbackView();
  }

  /** Открыть страницу "Фидбек моих сотрудников" через боковое меню */
  async openFeedbackOfEmployees() {
    await this._step(
      'Открыть "Фидбек моих сотрудников" через боковое меню',
      async () => {
        const targetUrl = /\/feedbacks\/feed\/of-employees\/?($|\?)/;
        await this._openFromFeedbackMenu(
          this.feedbackOfEmployeesLink,
          targetUrl,
          { fallbackPath: "/ru/feedbacks/feed/of-employees/" },
        );
      },
    );
  }

  /** Открыть страницу "История и статистика" (Фидбек) через боковое меню */
  async openFeedbackHistoryStatistics() {
    await this._step(
      'Открыть "История и статистика" через боковое меню',
      async () => {
        const targetUrl = /\/statistics\/?($|\?)/;
        await this._openFromFeedbackMenu(
          this.feedbackHistoryStatisticsLink,
          targetUrl,
          {
            afterClickWait: "networkidle",
            fallbackPath: "/ru/statistics/",
          },
        );
      },
    );
  }

  /** Открыть страницу "Статистика фидбека" (компании) через боковое меню */
  async openFeedbackStatistics() {
    await this._step(
      'Открыть "Статистика фидбека" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/statistics\/feedbacks\/?($|\?)/;
        await this._openFromFeedbackMenu(
          this.feedbackStatisticsLink,
          targetUrl,
          {
            afterClickWait: "domcontentloaded",
            fallbackPath: "/ru/manager/statistics/feedbacks/",
          },
        );
      },
    );
  }

  // совместимость со старым названием
  async openFeedbackCompanyStatistics() {
    return this.openFeedbackStatistics();
  }

  /** Внутренний метод для открытия ссылок из меню "Фидбек" */
  async _openFromFeedbackMenu(linkLocator, targetUrlRe, opts = {}) {
    const { afterClickWait = "domcontentloaded", fallbackPath } = opts;

    if (targetUrlRe.test(this.page.url())) return;

    await this._dismissOpenModals();

    const item = this.feedbackMenuItem.first();
    const link = linkLocator;

    await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    // Подменю раскрывается через JS onMouseEnter на li + CSS transition ~0.1s.
    // hover может не сработать, если курсор уже рядом (mouseenter не срабатывает повторно).
    // Стратегия: увести курсор → hover → ждать → retry с click.
    let submenuOpened = false;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Увести курсор от меню, чтобы гарантировать mouseenter при следующем hover
      await this.page.mouse.move(500, 300);

      await item.hover();
      // Подождать CSS transition (opacity 0.1s + delay 0.07s)
      await this.page.waitForTimeout(200);

      try {
        await link.waitFor({ state: "visible", timeout: 5_000 });
        submenuOpened = true;
        break; // подменю раскрылось
      } catch {
        // Пробуем click + hover
        await item.click().catch(() => null);
        await this.page.mouse.move(500, 300);
      }
    }

    if (submenuOpened) {
      try {
        await Promise.all([
          this.page.waitForURL(targetUrlRe, { timeout: TIMEOUTS.URL_CHANGE }),
          link.click(),
        ]);
        // Успешно — выходим из метода через finally (waitForLoadState ниже)
      } catch {
        submenuOpened = false; // клик не сработал — fallback
      }
    }

    if (!submenuOpened) {
      // Fallback: прямая навигация (подменю не раскрылось или клик перехвачен)
      // Пробуем достать href из DOM, иначе используем fallbackPath
      const href = await link.getAttribute("href").catch(() => null);
      const origin = new URL(this.page.url()).origin;
      const url = href
        ? href.startsWith("http")
          ? href
          : `${origin}${href}`
        : fallbackPath
          ? `${origin}${fallbackPath}`
          : null;
      if (url) {
        await this.page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      }
    }

    await this.page
      .waitForLoadState(afterClickWait, { timeout: TIMEOUTS.URL_CHANGE })
      .catch(() => null);
    await this._moveCursorToContent();
  }
}
