// pages/StructureUsersPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class StructureUsersPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.topMenu = this.page.locator(SELECTORS.ORG_STRUCTURE_TOP_MENU).first();
    this.viewSelectButton = this.page
      .locator(`${SELECTORS.VIEW_SELECT} button`)
      .first();
    this.exportButton = this.page
      .locator(SELECTORS.USERS_EXPORT_BUTTON)
      .first();

    this.filterPresetButtons = this.page.locator(
      'button[class*="FilterButton_button"]',
    );

    this.searchInput = this.page.getByLabel(/Поиск по сотрудникам/i);
    this.addUserButton = this.page
      .locator('button:has-text("Добавить сотрудников")')
      .first();

    this.table = this.page.locator(SELECTORS.USERS_TABLE).first();
    this.tableRows = this.table.locator("tbody tr");
    this.tableHeaders = this.table.locator("th");
  }

  async openFromSideMenu() {
    await this._step(
      'Открыть "Список сотрудников" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureUsers();
        await this.assertOpened();
      },
    );
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Список сотрудников"',
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);

        await this.viewSelectButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await expect(this.viewSelectButton).toContainText(/вид/i);

        // Кнопка экспорта видна только админам — не требуем для всех
        await this.exportButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => null);
        await this.searchInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        // Кнопка добавления тоже может быть скрыта для обычных пользователей
        await this.addUserButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => null);

        // хотя бы одна колонка в таблице
        await this.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        const headersText = await this.tableHeaders.allInnerTexts();
        if (!headersText.some((t) => /Имя/i.test(t))) {
          throw new Error('Не нашли колонку "Имя" в таблице сотрудников');
        }

        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_USERS, { timeout: TIMEOUTS.SHORT })
          .catch(() => null);
      },
    );
  }

  async assertMainElementsVisible() {
    await this._step(
      "Проверить основные элементы списка сотрудников",
      async () => {
        await this.topMenu
          .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(() => null);
        await this.viewSelectButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.exportButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        await this.filterPresetButtons
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await this.searchInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.addUserButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        const headers = await this.tableHeaders.allInnerTexts();
        const requiredHeaders = [
          "Имя",
          "Руководитель",
          "Роль",
          "Должность",
          "Отдел",
        ];
        requiredHeaders.forEach((h) => {
          if (!headers.some((t) => t.toLowerCase().includes(h.toLowerCase()))) {
            throw new Error(`Не найдена колонка "${h}" в таблице сотрудников`);
          }
        });
      },
    );
  }

  /** Кликнуть по каждому пресету фильтров и убедиться, что он стал активным */
  async iterateFilterPresets() {
    await this._step("Перебрать пресеты фильтров пользователей", async () => {
      const buttons = this.filterPresetButtons;
      const count = await buttons.count();
      if (count === 0)
        throw new Error("Не найдены пресеты фильтров на странице сотрудников");

      for (let i = 0; i < count; i += 1) {
        const btn = buttons.nth(i);
        const label = (await btn.innerText().catch(() => "")).trim();

        await btn.scrollIntoViewIfNeeded().catch(() => null);
        await btn.click({ timeout: TIMEOUTS.MEDIUM });

        // активный пресет имеет модификатор FilterButton_button--active
        const isActive = await btn
          .evaluate((node) =>
            node.className.includes("FilterButton_button--active"),
          )
          .catch(() => false);

        if (!isActive) {
          throw new Error(`После клика пресет "${label}" не стал активным`);
        }

        // Ждём обновления таблицы после переключения фильтра
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      }
    });
  }

  /**
   * Открыть контекстное меню для строки пользователя по индексу
   * @param {number} rowIndex - индекс строки (0-based)
   */
  async openRowContextMenu(rowIndex = 0) {
    await this._step(
      `Открыть контекстное меню для строки #${rowIndex + 1}`,
      async () => {
        const row = this.tableRows.nth(rowIndex);
        await row.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        // Скроллим строку в видимую область
        await row.scrollIntoViewIfNeeded().catch(() => null);
        // Ждём завершения анимации скролла
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        // Три точки (kebab menu) — кнопка с классом MenuPopupToggle_button (не overlay-button!)
        const menuButton = row
          .locator('button[class*="MenuPopupToggle_button__"]')
          .first();
        await menuButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Кликаем по кнопке меню
        await menuButton.click({ timeout: TIMEOUTS.MEDIUM });

        // Ждём появления выпадающего меню (пункт "Профиль сотрудника")
        const menuItem = this.page.getByText(/^Профиль сотрудника$/i).first();
        await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  /**
   * Кликнуть по пункту "Профиль сотрудника" в открытом контекстном меню
   */
  /**
   * Кликнуть по пункту "Профиль сотрудника" в открытом контекстном меню.
   * Профиль может открыться в текущей вкладке или в новой — возвращаем страницу профиля.
   * @returns {Promise<import('@playwright/test').Page>} - страница с профилем
   */
  async clickProfileInContextMenu() {
    return this._step(
      'Кликнуть "Профиль сотрудника" в контекстном меню',
      async () => {
        const profileButton = this.page
          .getByRole("button", { name: /Профиль сотрудника/i })
          .first();
        await profileButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Ждём popup (новая вкладка) или навигацию в текущей
        const [newPage] = await Promise.all([
          this.page
            .context()
            .waitForEvent("page", { timeout: 5000 })
            .catch(() => null),
          profileButton.click(),
        ]);

        if (newPage) {
          // Профиль открылся в новой вкладке
          await newPage.waitForLoadState("domcontentloaded");
          return newPage;
        }

        // Профиль открылся в текущей вкладке
        await this.page.waitForLoadState("domcontentloaded");
        return this.page;
      },
    );
  }

  /**
   * Открыть профиль сотрудника через контекстное меню
   * @param {number} rowIndex - индекс строки (0-based)
   * @returns {Promise<import('@playwright/test').Page>} - страница с профилем (может быть новая вкладка)
   */
  async openEmployeeProfileFromContextMenu(rowIndex = 0) {
    return this._step(
      `Открыть профиль сотрудника #${rowIndex + 1} через контекстное меню`,
      async () => {
        await this.openRowContextMenu(rowIndex);
        return await this.clickProfileInContextMenu();
      },
    );
  }

  async assertUserInTableByEmail(email) {
    await this._step(
      `Проверить, что сотрудник с email ${email} появился в таблице`,
      async () => {
        await this.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        const row = this.tableRows.filter({ hasText: email }).first();
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      },
    );
  }

  /**
   * Получить ID профиля другого пользователя (не текущего)
   * @param {number} myId - ID текущего пользователя (чтобы исключить)
   * @param {number} maxAttempts - максимум попыток
   * @returns {Promise<{id: number, page: import('@playwright/test').Page} | null>}
   */
  async getOtherUserProfileId(myId, maxAttempts = 5) {
    return this._step(
      `Найти профиль другого пользователя (не ID=${myId})`,
      async () => {
        await this.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        const rowCount = await this.tableRows.count();

        if (rowCount === 0) {
          return null;
        }

        for (let i = 0; i < Math.min(rowCount, maxAttempts); i++) {
          // Проверяем, есть ли kebab-меню (для админов) или только overlay-кнопка (для обычных пользователей)
          const row = this.tableRows.nth(i);
          await row.waitFor({
            state: "visible",
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
          });
          await row.scrollIntoViewIfNeeded().catch(() => null);

          const menuButton = row
            .locator('button[class*="MenuPopupToggle_button__"]')
            .first();
          const hasMenu = await menuButton
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);

          let profilePage;
          if (hasMenu) {
            // Админ — используем контекстное меню
            profilePage = await this.openEmployeeProfileFromContextMenu(i);
          } else {
            // Обычный пользователь — кликаем по overlay-кнопке в строке
            profilePage = await this._openProfileByRowClick(i);
          }

          const profileUrl = profilePage.url();
          const idMatch = profileUrl.match(/\/profile\/(\d+)/);

          if (idMatch) {
            const userId = parseInt(idMatch[1], 10);

            if (userId !== myId) {
              // Нашли другого пользователя
              return { id: userId, page: profilePage };
            }
          }

          // Это наш профиль или не удалось получить ID — возвращаемся и пробуем следующего
          if (profilePage !== this.page) {
            await profilePage.close();
          } else {
            await this.page.goBack();
            await this.table.waitFor({
              state: "visible",
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          }
        }

        return null;
      },
    );
  }

  /**
   * Открыть профиль кликом по строке (для обычных пользователей без контекстного меню)
   * @param {number} rowIndex
   * @returns {Promise<import('@playwright/test').Page>}
   */
  async _openProfileByRowClick(rowIndex = 0) {
    return this._step(
      `Открыть профиль кликом по строке #${rowIndex + 1}`,
      async () => {
        const row = this.tableRows.nth(rowIndex);
        await row.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await row.scrollIntoViewIfNeeded().catch(() => null);

        // Overlay-кнопка в первой ячейке (имя пользователя)
        const overlayButton = row
          .locator('button[class*="UserItem_overlay"]')
          .first();
        await overlayButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Может открыться в новой вкладке
        const [newPage] = await Promise.all([
          this.page
            .context()
            .waitForEvent("page", { timeout: 5000 })
            .catch(() => null),
          overlayButton.click(),
        ]);

        if (newPage) {
          await newPage.waitForLoadState("domcontentloaded");
          return newPage;
        }

        await this.page.waitForLoadState("domcontentloaded");
        return this.page;
      },
    );
  }

  /** Получить список активных пользователей (email) */
  async getActiveUsersEmails(limit = 10) {
    return await this._step(
      "Получить список активных пользователей (email)",
      async () => {
        // Ждём загрузки страницы
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MODAL_CLOSE })
          .catch(() => {});

        // Переключаемся на вкладку "Активные" - используем тот же подход, что в iterateFilterPresets
        const buttons = this.filterPresetButtons;
        await buttons
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(() => null);
        const count = await buttons.count();

        if (count === 0) {
          // Если пресеты не найдены, пробуем найти кнопку "Активные" другим способом
          const activeButtonAlt = this.page
            .getByRole("button")
            .filter({ hasText: /Активные/i })
            .first();

          const altVisible = await activeButtonAlt
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (altVisible) {
            await activeButtonAlt.click();
            // Ждём обновления таблицы после клика
            await this.table
              .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
              .catch(() => {});
          } else {
            console.warn(
              "Не найдены пресеты фильтров, пробуем получить пользователей без переключения",
            );
          }
        } else {
          // Ищем кнопку "Активные"
          let activeButton = null;
          for (let i = 0; i < count; i++) {
            const btn = buttons.nth(i);
            const label = (await btn.innerText().catch(() => "")).trim();
            if (/Активные/i.test(label)) {
              activeButton = btn;
              break;
            }
          }

          if (activeButton) {
            const isActive = await activeButton
              .evaluate((node) =>
                node.className.includes("FilterButton_button--active"),
              )
              .catch(() => false);

            if (!isActive) {
              await activeButton.scrollIntoViewIfNeeded().catch(() => null);
              await activeButton.click({ timeout: TIMEOUTS.MEDIUM });
              // Ждём обновления таблицы после клика
              await this.table
                .waitFor({
                  state: "visible",
                  timeout: TIMEOUTS.ELEMENT_VISIBLE,
                })
                .catch(() => {});
            }

            const nowActive = await activeButton
              .evaluate((node) =>
                node.className.includes("FilterButton_button--active"),
              )
              .catch(() => false);
            if (!nowActive) {
              throw new Error('Фильтр "Активные" не стал активным после клика');
            }
          } else {
            console.warn(
              'Кнопка "Активные" не найдена, пробуем получить пользователей без переключения',
            );
          }
        }

        // Ждём загрузки таблицы
        await this.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        // Ждём появления хотя бы одной строки
        const firstRow = this.tableRows.first();
        await firstRow.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        // Получаем email из таблицы
        // Email обычно находится в ссылке на профиль или в ячейке с email
        const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
        const emails = [];
        const rowCount = Math.min(await this.tableRows.count(), limit);

        for (let i = 0; i < rowCount; i++) {
          const row = this.tableRows.nth(i);

          const emailCell = row.locator('[class*="User_email__"]').first();
          const emailText = (
            await emailCell.textContent().catch(() => "")
          ).trim();
          const emailFromCell = emailText.match(emailPattern);
          if (emailFromCell) {
            if (!emails.includes(emailFromCell[0])) {
              emails.push(emailFromCell[0]);
            }
            continue;
          }

          // Ищем email в строке - пробуем ссылки на профиль (они содержат email в href)
          const profileLink = row.locator('a[href*="/profile/"]').first();
          const linkHref = await profileLink
            .getAttribute("href")
            .catch(() => "");
          const emailFromHref = linkHref.match(emailPattern);

          if (emailFromHref) {
            if (!emails.includes(emailFromHref[0])) {
              emails.push(emailFromHref[0]);
            }
            continue;
          }

          // Если не нашли в href, ищем в тексте ячеек
          const cells = row.locator("td");
          const cellCount = await cells.count();

          for (let j = 0; j < cellCount; j++) {
            const cell = cells.nth(j);
            const cellText = await cell.textContent().catch(() => "");
            const emailMatch = cellText.match(emailPattern);

            if (emailMatch) {
              if (!emails.includes(emailMatch[0])) {
                emails.push(emailMatch[0]);
              }
              break;
            }
          }
        }

        if (emails.length === 0) {
          throw new Error(
            "Не удалось получить список активных пользователей. Email не найдены в таблице.",
          );
        }

        console.log(`Получено ${emails.length} активных пользователей`);
        return emails;
      },
    );
  }
}
