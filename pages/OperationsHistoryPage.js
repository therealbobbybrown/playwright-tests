import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/OperationsHistoryPage.js

export class OperationsHistoryPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок вкладки "История операций"
    // <span class="Tabs_label__RjVCm">История операций</span>
    this.heading = this.page
      .locator('span[class*="Tabs_label__"]', { hasText: "История операций" })
      .first();

    // Основная таблица операций
    this.tableBody = this.page.locator('tbody[class*="Table_body__"]').first();
    this.rows = this.tableBody.locator('tr[class*="Table_row__"]');
  }

  /** Страница "История операций" открыта */
  async assertOpened() {
    await this._step('Открыта страница "История операций"', async () => {
      // ожидаемый URL истории операций
      await this.page.waitForURL(URL_PATTERNS.OPERATIONS_HISTORY, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      await this.page.waitForLoadState("load");

      // ждем вкладку "История операций"
      await this.heading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // ждем, пока появится хотя бы одна строка таблицы
      await this.rows.first().waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Проверить, что самая свежая операция — покупка подарка текущим пользователем
   * @param {{ amount: number }} params
   */
  async assertLatestPurchase({ amount }) {
    await this._step(
      "Проверить последнюю транзакцию в истории операций",
      async () => {
        await this.tableBody.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const row = this.rows.first();

        await row.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Тип операции — "Покупка"
        const typeCell = row
          .locator("td")
          .filter({ hasText: "Покупка" })
          .first();

        const typeText = (await typeCell.innerText()).trim();
        if (!typeText.includes("Покупка")) {
          throw new Error(
            `Ожидали, что последняя операция — "Покупка", фактически: "${typeText}"`,
          );
        }

        // Сумма операции — -amount (в таблице выводится с минусом)
        const amountCell = row
          .locator('td[class*="TransactionRow_amount__"]')
          .first();

        const rawAmountText = await amountCell.innerText();

        const normalized = rawAmountText
          .replace(/\u2212|–/g, "-") // варианты минуса
          .replace(/[^\d-]/g, ""); // только цифры и минус

        const numericAmount = Number(normalized);

        if (!Number.isFinite(numericAmount)) {
          throw new Error(
            `Не удалось распарсить сумму операции из текста "${rawAmountText}"`,
          );
        }

        const expectedAmount = -Math.abs(amount);
        if (numericAmount !== expectedAmount) {
          throw new Error(
            `Ожидали сумму операции ${expectedAmount}, ` +
              `получили ${numericAmount} (сырой текст: "${rawAmountText}")`,
          );
        }

        // ФИО пользователя в строке операции
        const rowUserName = (
          await row
            .locator('div[class*="User_full-name__"]')
            .first()
            .innerText()
        ).trim();

        // ФИО текущего пользователя из попапа профиля
        const currentUserFullName = await this._getCurrentUserFullName();

        if (rowUserName !== currentUserFullName) {
          throw new Error(
            `Ожидали, что операция совершена текущим пользователем "${currentUserFullName}", ` +
              `но в таблице указан "${rowUserName}"`,
          );
        }
      },
    );
  }

  /** Прочитать ФИО текущего пользователя из попапа профиля (клик по аватарке в шапке) */
  async _getCurrentUserFullName() {
    return this._step(
      "Получить ФИО текущего пользователя из попапа профиля",
      async () => {
        // Пытаемся найти аватарку пользователя в хедере
        let avatar = this.page
          .locator('header span[class*="Avatar_avatar__"]')
          .first();

        if ((await avatar.count()) === 0) {
          // fallback: первая аватарка на странице (ожидаем, что в шапке она выше остальных)
          avatar = this.page.locator('span[class*="Avatar_avatar__"]').first();
        }

        await avatar.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // открываем попап текущего пользователя
        await avatar.click();

        const popup = this.page.locator("div.PopupWidget_popup___SkFt").first();

        await popup.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const nameLocator = popup
          .locator('span[class*="Text_text--size-medium__"] b')
          .first();

        const fullName = (await nameLocator.innerText()).trim();

        // закрываем попап кликом по фону
        await this.page.mouse.click(10, 10);
        // Wait for popup to close
        await popup
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        if (!fullName) {
          throw new Error(
            "Не удалось получить ФИО текущего пользователя из попапа профиля",
          );
        }

        return fullName;
      },
    );
  }
}
