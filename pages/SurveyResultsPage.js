import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/SurveyResultsPage.js

export class SurveyResultsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Вкладка "Результаты" в верхнем меню опроса (button)
    this.resultsTabButton = this.page
      .getByRole("button", { name: /результаты/i })
      .first();

    // Любой текст с упоминанием "ответ" на странице результатов
    this.answersText = this.page.getByText(/ответ/i).first();

    // Тепловая карта (heat map) - на основе HeatMapResults компонента
    this.heatMapSection = this.page
      .locator('[class*="HeatMapResults_section"]')
      .first();
    this.heatMapContainer = this.page
      .locator('[class*="HeatMapResults_chartsSection"]')
      .first();
    this.heatMapTable = this.page
      .locator("table")
      .filter({ has: this.page.locator("thead") })
      .first();
    this.heatMapRows = this.heatMapTable.locator("tbody tr");

    // Баннер анонимности - ищем по тексту, который может быть в разных местах
    this.anonymityBanner = this.page
      .locator("div, span, p")
      .filter({
        hasText: /некоторые отделы|скрыты|анонимность|менее.*ответ|порог/i,
      })
      .first();

    // Фильтры - на основе Filter компонента
    this.filterContainer = this.page
      .locator('[class*="Filter_filter"]')
      .first();
    this.userSelectFilter = this.page.locator("#filter-users").first();
    this.revisionSelectFilter = this.page.locator("#filter-revisions").first();

    // Кнопки экспорта - на основе Results компонента
    this.exportButton = this.page
      .getByRole("button", { name: /скачать результаты/i })
      .first();
    this.exportMenuPopup = this.page
      .locator('[class*="Results_popup"]')
      .first();
    this.exportMenuItems = this.page.locator(
      '[class*="MenuPopup"], [role="menuitem"]',
    );

    // Строка "Без отдела" - ищем в тепловой карте
    this.noDepartmentRow = this.heatMapTable
      .locator("tbody tr")
      .filter({ hasText: /без отдела/i })
      .first();

    // Общие результаты - ищем в тепловой карте (строка "Общая оценка")
    this.generalResultsRow = this.heatMapTable
      .locator("tbody tr")
      .filter({ hasText: /общая оценка/i })
      .first();

    // Контейнер результатов
    this.resultsContainer = this.page
      .locator('[class*="Results_results"]')
      .first();
    this.resultsItems = this.page.locator('[class*="Results_items"]').first();

    // Вторая таблица - таблица групп (Groups heat map)
    // Находим секцию с заголовком "Группы" или вторую таблицу на странице
    this.groupsSection = this.page
      .locator("section, div")
      .filter({ hasText: /^Группы$/i })
      .first();
    this.groupsTable = this.page
      .locator("table")
      .filter({ has: this.page.locator("thead") })
      .nth(1);
    this.groupsRows = this.groupsTable.locator("tbody tr");
  }

  // ---------------------------------------------------------------------------
  // Открытие вкладки "Результаты"
  // ---------------------------------------------------------------------------

  /** Переключиться на вкладку "Результаты" у открытого опроса */
  async openResultsTab() {
    await this._step('Открыть вкладку "Результаты" опроса', async () => {
      await this.resultsTabButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.resultsTabButton.click();

      // Ждём появления контейнера результатов или тепловой карты
      await Promise.race([
        this.resultsContainer.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        }),
        this.heatMapContainer.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        }),
        this.answersText.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }),
      ]).catch(() => {});
    });
  }

  // ---------------------------------------------------------------------------
  // Проверка наличия ответов
  // ---------------------------------------------------------------------------

  /** Убедиться, что по опросу есть хотя бы один ответ */
  async assertHasAnyAnswers() {
    await this._step(
      "Проверить, что по опросу есть хотя бы один ответ",
      async () => {
        await this.answersText.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const text = (await this.answersText.innerText()).trim().toLowerCase();

        if (text.includes("нет ответов")) {
          throw new Error(
            `Ожидали, что по опросу будут ответы, но видим текст: "${text}".`,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Тепловая карта
  // ---------------------------------------------------------------------------

  /** Проверить, что тепловая карта отображается */
  async assertHeatMapVisible() {
    await this._step("Проверить, что тепловая карта отображается", async () => {
      await this.heatMapContainer.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /** Алиас для assertHeatMapVisible (некоторые тесты ожидают camelCase без заглавной M) */
  async assertHeatmapVisible() {
    return this.assertHeatMapVisible();
  }

  /** Проверить, что тепловая карта скрыта */
  async assertHeatMapHidden() {
    await this._step("Проверить, что тепловая карта скрыта", async () => {
      const visible = await this.heatMapContainer
        .isVisible()
        .catch(() => false);
      if (visible) {
        throw new Error(
          "Ожидали, что тепловая карта будет скрыта, но она видна.",
        );
      }
    });
  }

  /** Получить список видимых отделов/групп в тепловой карте */
  async getVisibleDepartments() {
    return this._step(
      "Получить список видимых отделов в тепловой карте",
      async () => {
        await this.heatMapTable.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        const rows = this.heatMapRows;
        const count = await rows.count();
        const departments = [];

        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const firstCell = row.locator("td").first();
          const text = (await firstCell.textContent()).trim();
          // Пропускаем строку "Общая оценка" и пустые строки
          if (
            text &&
            !text.toLowerCase().includes("общая оценка") &&
            text !== "–"
          ) {
            departments.push(text);
          }
        }

        return departments;
      },
    );
  }

  /** Алиас под старое имя: получить отделы из тепловой карты */
  async getHeatmapDepartmentNames() {
    return this.getVisibleDepartments();
  }

  /** Проверить, что отдел виден в тепловой карте */
  async assertDepartmentVisible(departmentName) {
    await this._step(
      `Проверить, что отдел "${departmentName}" виден`,
      async () => {
        const departments = await this.getVisibleDepartments();
        const found = departments.some((d) =>
          d.toLowerCase().includes(departmentName.toLowerCase()),
        );
        if (!found) {
          throw new Error(
            `Ожидали, что отдел "${departmentName}" будет виден, но его нет в списке: ${departments.join(", ")}`,
          );
        }
      },
    );
  }

  /** Проверить, что отдел скрыт в тепловой карте */
  async assertDepartmentHidden(departmentName) {
    await this._step(
      `Проверить, что отдел "${departmentName}" скрыт`,
      async () => {
        const departments = await this.getVisibleDepartments();
        const found = departments.some((d) =>
          d.toLowerCase().includes(departmentName.toLowerCase()),
        );
        if (found) {
          throw new Error(
            `Ожидали, что отдел "${departmentName}" будет скрыт, но он виден в списке: ${departments.join(", ")}`,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Группы (вторая таблица)
  // ---------------------------------------------------------------------------

  /** Получить список видимых групп во второй таблице (тепловая карта групп) */
  async getVisibleGroups() {
    return this._step(
      "Получить список видимых групп в тепловой карте",
      async () => {
        // Ждём загрузки второй таблицы
        const tableVisible = await this.groupsTable
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (!tableVisible) {
          console.log("Таблица групп не найдена на странице");
          return [];
        }

        await this.groupsTable.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        const rows = this.groupsRows;
        const count = await rows.count();
        const groups = [];

        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const firstCell = row.locator("td").first();
          const text = (await firstCell.textContent()).trim();
          // Пропускаем пустые строки и строки с прочерком
          if (text && text !== "–") {
            groups.push(text);
          }
        }

        return groups;
      },
    );
  }

  /** Проверить, что группа видна во второй таблице (тепловая карта групп) */
  async assertGroupVisible(groupName) {
    await this._step(`Проверить, что группа "${groupName}" видна`, async () => {
      const groups = await this.getVisibleGroups();
      const found = groups.some((g) =>
        g.toLowerCase().includes(groupName.toLowerCase()),
      );
      if (!found) {
        throw new Error(
          `Ожидали, что группа "${groupName}" будет видна, но её нет в списке: ${groups.join(", ")}`,
        );
      }
    });
  }

  /** Проверить наличие строки "Без отдела" */
  async assertNoDepartmentRowVisible() {
    await this._step('Проверить, что строка "Без отдела" видна', async () => {
      await this.noDepartmentRow.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить, что строка "Без отдела" скрыта */
  async assertNoDepartmentRowHidden() {
    await this._step('Проверить, что строка "Без отдела" скрыта', async () => {
      const visible = await this.noDepartmentRow.isVisible().catch(() => false);
      if (visible) {
        throw new Error(
          'Ожидали, что строка "Без отдела" будет скрыта, но она видна.',
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Баннер анонимности
  // ---------------------------------------------------------------------------

  /** Проверить, что баннер анонимности отображается */
  async assertAnonymityBannerVisible() {
    await this._step(
      "Проверить, что баннер анонимности отображается",
      async () => {
        await this.anonymityBanner.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /** Проверить, что баннер анонимности скрыт */
  async assertAnonymityBannerHidden() {
    await this._step("Проверить, что баннер анонимности скрыт", async () => {
      const visible = await this.anonymityBanner.isVisible().catch(() => false);
      if (visible) {
        throw new Error(
          "Ожидали, что баннер анонимности будет скрыт, но он виден.",
        );
      }
    });
  }

  /** Получить текст баннера анонимности */
  async getAnonymityBannerText() {
    return this._step("Получить текст баннера анонимности", async () => {
      await this.anonymityBanner.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      return (await this.anonymityBanner.textContent()).trim();
    });
  }

  // ---------------------------------------------------------------------------
  // Фильтры
  // ---------------------------------------------------------------------------

  /** Применить фильтр по отделу через UserSelect */
  async applyDepartmentFilter(departmentName) {
    await this._step(
      `Применить фильтр по отделу "${departmentName}"`,
      async () => {
        await this.userSelectFilter.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.userSelectFilter.click();

        // Ждём появления выпадающего списка опций
        await this.page
          .locator('[role="option"], [class*="option"]')
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        // Ищем опцию с отделом в выпадающем списке
        const option = this.page
          .locator('[role="option"], [class*="option"]')
          .filter({ hasText: departmentName })
          .first();
        await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await option.click();

        // Ждём обновления тепловой карты после применения фильтра
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      },
    );
  }

  /** Применить фильтр по группе через UserSelect */
  async applyGroupFilter(groupName) {
    await this._step(`Применить фильтр по группе "${groupName}"`, async () => {
      await this.userSelectFilter.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.userSelectFilter.click();

      // Ждём появления выпадающего списка опций
      await this.page
        .locator('[role="option"], [class*="option"]')
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Ищем опцию с группой в выпадающем списке
      const option = this.page
        .locator('[role="option"], [class*="option"]')
        .filter({ hasText: groupName })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await option.click();

      // Ждём обновления тепловой карты после применения фильтра
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /** Применить несколько фильтров (логика ИЛИ) */
  async applyMultipleFilters(filters) {
    await this._step("Применить несколько фильтров", async () => {
      for (const filter of filters) {
        if (filter.type === "department") {
          await this.applyDepartmentFilter(filter.name);
        } else if (filter.type === "group") {
          await this.applyGroupFilter(filter.name);
        }
      }
    });
  }

  /** Сбросить все фильтры */
  async clearFilters() {
    await this._step("Сбросить все фильтры", async () => {
      const clearButton = this.page
        .getByRole("button", { name: /сбросить|очистить/i })
        .first();
      const visible = await clearButton.isVisible().catch(() => false);
      if (visible) {
        await clearButton.click();
        // Ждём обновления результатов после сброса фильтров
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Экспорт
  // ---------------------------------------------------------------------------

  /** Экспортировать результаты в XLSX */
  async exportToXLSX(useFilters = false) {
    return this._step("Экспортировать результаты в XLSX", async () => {
      await this._openExportMenu();

      // Ищем пункт меню с XLSX
      const menuItem = this.page
        .locator('[role="menuitem"], [class*="MenuPopup_item"]')
        .filter({
          hasText: useFilters
            ? /с учетом фильтров.*xlsx/i
            : /все результаты.*xlsx/i,
        })
        .first();

      await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const [download] = await Promise.all([
        this.page.waitForEvent("download", { timeout: TIMEOUTS.LONG }),
        menuItem.click(),
      ]);

      return download;
    });
  }

  /** Экспортировать результаты в CSV */
  async exportToCSV(useFilters = false) {
    return this._step("Экспортировать результаты в CSV", async () => {
      await this._openExportMenu();

      // Ищем пункт меню с CSV
      const menuItem = this.page
        .locator('[role="menuitem"], [class*="MenuPopup_item"]')
        .filter({
          hasText: useFilters
            ? /с учетом фильтров.*csv/i
            : /все результаты.*csv/i,
        })
        .first();

      await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const [download] = await Promise.all([
        this.page.waitForEvent("download", { timeout: TIMEOUTS.LONG }),
        menuItem.click(),
      ]);

      return download;
    });
  }

  /** Экспортировать результаты в PPTX */
  async exportToPPTX(useFilters = false) {
    return this._step("Экспортировать результаты в PPTX", async () => {
      await this._openExportMenu();

      // Ищем пункт меню с PPTX
      const menuItem = this.page
        .locator('[role="menuitem"], [class*="MenuPopup_item"]')
        .filter({
          hasText: useFilters ? /с учетом фильтров.*pptx/i : /отчет.*pptx/i,
        })
        .first();

      await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const [download] = await Promise.all([
        this.page.waitForEvent("download", { timeout: TIMEOUTS.LONG }),
        menuItem.click(),
      ]);

      return download;
    });
  }

  /** Открыть меню экспорта */
  async _openExportMenu() {
    await this.exportButton.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.exportButton.click();

    // Ждём появления меню или модального окна
    await this.exportMenuPopup
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .catch(() => {
        // На мобильных устройствах может быть модальное окно
        const modal = this.page.locator('[class*="SheetModal"]').first();
        return modal.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      });
  }

  // ---------------------------------------------------------------------------
  // Общие результаты
  // ---------------------------------------------------------------------------

  /** Проверить наличие строки "Общая оценка" в тепловой карте */
  async assertGeneralResultsVisible() {
    await this._step(
      'Проверить наличие строки "Общая оценка" в тепловой карте',
      async () => {
        await this.generalResultsRow.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Группы пользователей (отдельная секция в результатах)
  // ---------------------------------------------------------------------------

  /** Получить список видимых групп в результатах */
  async getVisibleGroups() {
    return this._step(
      "Получить список видимых групп в результатах",
      async () => {
        // Ищем секцию "Группы" в результатах
        const groupsSection = this.page
          .locator("section, div")
          .filter({ hasText: /^Группы$/i })
          .first();

        // Ищем таблицу групп (после секции "Группы")
        const groupsTable = this.page
          .locator("table")
          .filter({
            has: this.page
              .locator("th, td")
              .filter({ hasText: /группе|группы/i }),
          })
          .first();

        const tableVisible = await groupsTable
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);

        if (!tableVisible) {
          // Fallback: ищем по тексту названий групп напрямую
          const groups = await this.page.evaluate(() => {
            const groupNames = [];
            // Ищем строки таблицы, которые содержат названия групп
            const rows = document.querySelectorAll("tr");
            for (const row of rows) {
              const cells = row.querySelectorAll("td");
              if (cells.length > 0) {
                const text = cells[0].textContent?.trim() || "";
                // Проверяем, что это название группы (имеет emoji или специальный формат)
                if (
                  text &&
                  !text.includes("Общая оценка") &&
                  !text.includes("–")
                ) {
                  groupNames.push(text);
                }
              }
            }
            return groupNames;
          });
          return groups;
        }

        const rows = groupsTable.locator("tbody tr");
        const count = await rows.count();
        const groups = [];

        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const firstCell = row.locator("td").first();
          const text = (await firstCell.textContent()).trim();
          if (
            text &&
            !text.toLowerCase().includes("общая оценка") &&
            text !== "–"
          ) {
            groups.push(text);
          }
        }

        return groups;
      },
    );
  }

  /** Проверить, что группа видна в результатах */
  async assertGroupVisible(groupName) {
    await this._step(`Проверить, что группа "${groupName}" видна`, async () => {
      // Прокручиваем страницу вниз, чтобы увидеть секцию групп
      await this.page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );

      // Ждём завершения загрузки контента после прокрутки
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Ищем текст группы на странице
      const groupText = this.page
        .locator("td, div, span")
        .filter({
          hasText: new RegExp(
            groupName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i",
          ),
        })
        .first();

      const visible = await groupText
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (!visible) {
        // Получаем список групп для отладки
        const groups = await this.getVisibleGroups();
        throw new Error(
          `Ожидали, что группа "${groupName}" будет видна, но её нет. Видимые группы: ${groups.join(", ") || "не найдены"}`,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Вспомогательное
  // ---------------------------------------------------------------------------
}
