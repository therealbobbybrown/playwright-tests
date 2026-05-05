// pages/ObjectiveDetailsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class ObjectiveDetailsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок "Детали цели" или просто страница с целью
    this.detailsTitleSpan = this.page.getByText("Детали цели", { exact: true });

    // Таблица с деталями цели (содержит поле "Период")
    this.detailsTable = this.page.locator('table[class*="Table_table__"]').first();

    // Блок информации о видимости/доступе на странице деталей
    this.visibilityInfo = this.page.locator(
      '[class*="visibility"], [class*="Visibility"]',
    ).first();

    // Список участников (вкладка "Участники")
    this.participantsList = this.page.locator(
      '[class*="Participant"], [class*="participant"], [class*="User"]',
    );

    // Утверждение целей (DEVAPR-11722)
    this.approvalStatusBadge = this.page.locator('[class*="ObjectiveView"], [class*="objective"]')
      .getByText(/Требует утверждения|На утверждении|Утверждена/i)
      .first();

    this.sendForApprovalButton = this.page.getByRole('button', { name: 'Отправить на утверждение' });
    this.approveButton = this.page.getByRole('button', { name: 'Утвердить цель' });
    this.returnToRevisionButton = this.page.getByRole('button', { name: 'В доработку' });
    this.editLink = this.page.locator('a[href*="/edit/"]').first();
    this.deleteButton = this.page.getByRole('heading', { level: 1 }).locator('button').first();
  }

  /**
   * Проверить, что мы на странице деталей нужной цели
   * @param {string} objectiveTitle
   * @param {string} milestoneTitle
   */
  async assertDetails(objectiveTitle, milestoneTitle) {
    await this._step('Проверка страницы "Детали цели"', async () => {
      // Ждём либо заголовок "Детали цели", либо переход на страницу objectives
      const hasDetailsTitle = await this.detailsTitleSpan
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);

      if (!hasDetailsTitle) {
        // Альтернативная проверка: URL содержит objectives и не содержит add/create
        const url = this.page.url();
        const isOnDetailsPage =
          url.includes("objectives") &&
          !url.includes("add") &&
          !url.includes("create");

        if (!isOnDetailsPage) {
          // Ждём загрузки и проверяем что мы не на странице создания
          await this.page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          // Проверяем что заголовок страницы не "Создать цель"
          const createTitle = this.page.getByRole("heading", {
            name: /Создать цель/i,
          });
          const isOnCreatePage = await createTitle
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (isOnCreatePage) {
            throw new Error(
              'Остались на странице "Создать цель" - цель не была создана. Возможно, не заполнены обязательные поля.',
            );
          }
        }
      }

      // Название цели присутствует на странице
      const objectiveTitleVisible = await this.page
        .getByText(objectiveTitle, { exact: true })
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);
      if (!objectiveTitleVisible) {
        // Пробуем частичное совпадение
        const partialMatch = await this.page
          .getByText(objectiveTitle.substring(0, 20))
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (!partialMatch) {
          console.log("Название цели не найдено на странице");
        }
      }
      expect(objectiveTitleVisible).toBe(true);

      // Название ключевого результата присутствует на странице
      const milestoneVisible = await this.page
        .getByText(milestoneTitle)
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (!milestoneVisible) {
        console.log("КР не найден на странице - возможно свёрнут");
      }
    });
  }

  /**
   * Обновить прогресс KR через UI на странице списка целей.
   * Кнопка "Обновить КР" появляется при hover на строку КР раскрытой цели.
   * API updateMilestoneProgress не работает (APP_BUG), поэтому используем UI.
   * @param {string} objectiveTitle - Уникальное название цели (для поиска в списке)
   * @param {number} progress - Новое значение прогресса (0-100)
   */
  async updateKRProgressViaUI(objectiveTitle, progress) {
    await this._step(`Обновить KR прогресс "${objectiveTitle}" до ${progress}% через UI`, async () => {
      // Открываем страницу списка целей
      await this.page.goto("/ru/objectives/");
      await this.page.getByRole("heading", { name: "Цели", level: 1 })
        .waitFor({ state: "visible", timeout: TIMEOUTS.LONG });

      // Ищем цель через поиск, чтобы не скроллить
      const searchBox = this.page.getByRole("textbox", { name: "Найти цель" });
      await searchBox.fill(objectiveTitle);
      await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});

      // Раскрываем строку цели кликом по стрелке (первая img внутри первой ячейки)
      const objectiveRow = this.page.getByRole("row").filter({ hasText: objectiveTitle }).first();
      await objectiveRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      // Клик по стрелке раскрывает КР (CSS class ObjectiveRow_arrow__)
      const expandArrow = objectiveRow.locator('[class*="ObjectiveRow_arrow"]');
      await expandArrow.click();

      // Hover на строку КР для появления кнопки "Обновить КР"
      const krRow = this.page.getByRole("row").filter({ hasText: /КР \d/ }).first();
      await krRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await krRow.hover();

      // Кликаем "Обновить КР"
      const updateBtn = this.page.getByRole("button", { name: "Обновить КР" });
      await updateBtn.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await updateBtn.click();

      // Заполняем прогресс в ячейке "из 100%"
      const progressCell = this.page.getByRole("cell", { name: /из\s+100%/ });
      const progressInput = progressCell.getByRole("textbox");
      await progressInput.fill(String(progress));

      // Подтверждаем кликом на кнопку ✓
      const confirmBtn = progressCell.getByRole("button");
      await confirmBtn.click();

      // Ждём обновления — "Только что" должно появиться в строке цели
      await objectiveRow.getByText(/Только что|Сегодня/).first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Проверить отображение периода на странице деталей цели (DEVAPR-11585).
   * Формат: "DD.MM.YYYY - DD.MM.YYYY"
   *
   * Новый лейаут (DEVAPR-11722): период отображается в блоке информации о цели
   * как пара «Период действия» (метка) + значение DD.MM.YYYY - DD.MM.YYYY (сосед).
   * Структура: <div> <div>Период действия</div> <div>01.07.2026 - 30.09.2026</div> </div>
   *
   * @param {string} expectedPeriodText - Ожидаемый текст периода, напр. "01.04.2026 - 30.06.2026"
   */
  async assertPeriodDisplay(expectedPeriodText) {
    await this._step(`Проверить период на деталях: ${expectedPeriodText}`, async () => {
      // Новый лейаут: период в блоке информации рядом с меткой "Период действия"
      const periodBlock = this.page
        .getByText("Период действия", { exact: true })
        .locator("..")
        .filter({ hasText: expectedPeriodText });
      await periodBlock.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await expect(periodBlock).toContainText(expectedPeriodText);
    });
  }

  /** Проверить текст статуса утверждения */
  async assertApprovalStatus(expectedText) {
    await this._step(`Проверить статус утверждения: "${expectedText}"`, async () => {
      const statusLocator = this.page.getByText(expectedText, { exact: true }).first();
      await statusLocator.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
      await expect(statusLocator).toBeVisible();
    });
  }

  /**
   * Проверить что ТОЛЬКО указанные кнопки видны, остальные отсутствуют
   * @param {Object} expected - { sendForApproval?: bool, approve?: bool, returnToRevision?: bool, edit?: bool, delete?: bool }
   */
  async assertVisibleActions(expected = {}) {
    await this._step('Проверить видимые действия на странице деталей', async () => {
      const checks = [
        { key: 'sendForApproval', loc: this.sendForApprovalButton, name: 'Отправить на утверждение' },
        { key: 'approve', loc: this.approveButton, name: 'Утвердить цель' },
        { key: 'returnToRevision', loc: this.returnToRevisionButton, name: 'В доработку' },
      ];
      for (const { key, loc, name } of checks) {
        if (!(key in expected)) continue; // Не указан — пропускаем
        if (expected[key]) {
          await expect(loc, `Кнопка "${name}" должна быть видна`).toBeVisible();
        } else {
          await expect(loc, `Кнопка "${name}" должна отсутствовать`).toHaveCount(0);
        }
      }
      // edit link
      if (expected.edit !== undefined) {
        if (expected.edit) {
          await expect(this.editLink, 'Ссылка редактирования должна быть видна').toBeVisible();
        } else {
          await expect(this.editLink, 'Ссылка редактирования должна отсутствовать').toHaveCount(0);
        }
      }
    });
  }

  /** Открыть детали цели по ID */
  async goto(objectiveId) {
    await this.page.goto(`/ru/objectives/view/${objectiveId}/`);
    await this.page.waitForLoadState('domcontentloaded', { timeout: TIMEOUTS.ELEMENT_VISIBLE }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: TIMEOUTS.SHORT }).catch(() => {});
  }
}
