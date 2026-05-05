// pages/ObjectiveCreatePage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { ObjectivesDatepickerHelper } from "./ObjectivesDatepickerHelper.js";

export class ObjectiveCreatePage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок "Создать цель" (heading на странице формы)
    this.titleSpan = this.page.getByRole("heading").getByText("Создать цель", { exact: true });

    // Поле названия цели
    this.objectiveTitleTextarea = this.page.locator("textarea#objective-title");

    // Группа уровней цели
    this.levelButtonsGroup = this.page.locator(
      '[class*="LevelButtonsGroup_buttons__"]',
    );

    // Активная "Индивидуальная"
    this.levelIndividualActiveButton = this.page.locator(
      '[class*="LevelButtonsGroup_buttons__"] button[class*="BorderedButton_button--bg-color-grey__"]:has-text("Индивидуальная")',
    );

    // Блок "Кто увидит цель"
    this.userAccessContainer = this.page.locator(
      '[class*="UserAccess_container__"]',
    );
    this.userAccessPublicRadio = this.userAccessContainer.locator(
      'input[name="userAccessType"][value="everybody"]',
    );
    this.userAccessSelectiveRadio = this.userAccessContainer.locator(
      'input[name="userAccessType"][value="selective"]',
    );
    this.userAccessActiveLabel = this.userAccessContainer.locator(
      '[class*="UserAccess_button__"][class*="UserAccess_button--active__"]',
    );

    // Кнопка "Добавить ключевой результат"
    this.addMilestoneButton = this.page.getByRole("button", {
      name: "Добавить ключевой результат",
    });

    // Поле ключевого результата (первое; для nth КР используй getMilestoneTextarea(n))
    this.milestoneTitleTextarea = this.page.locator("textarea#milestone-title");

    // Кнопка "Создать"
    this.createButton = this.page.getByRole("button", { name: "Создать" });

    // Датапикер периода (DEVAPR-11585)
    // Поле "Период" — якорь датапикера в блоке periodResponsibleBlock
    this.periodBlock = this.page.locator('[class*="MainObjectiveForm_periodResponsibleBlock__"]');
    this.datepicker = new ObjectivesDatepickerHelper(this.page);

    // Заголовок секции периода/ответственного
    this.periodSectionHeading = this.page.getByText(
      "Укажите период действия цели и кто будет отвечать за выполнение",
      { exact: true },
    );

    // Уровень цели — кнопка "Командная"
    this.teamLevelButton = this.levelButtonsGroup
      .locator("button")
      .filter({ hasText: /Командная/i })
      .first();

    // Блок "Кто увидит цель" — лейбл "Ограничить видимость"
    this.userAccessRestrictLabel = this.userAccessContainer.locator(
      '[class*="UserAccess_button__"]',
    ).filter({ hasText: /Ограничить видимость/i }).first();

    // Блок настроек ограниченной видимости (появляется после выбора "Ограничить видимость")
    this.visibilitySettingsArea = this.userAccessContainer.filter({
      hasText: /Сотрудники|Руководители|Другие люди/i,
    });

    // Блок "Сотрудники, ответственные за цель" внутри настроек видимости
    this.visibilityResponsibleBlock = this.userAccessContainer.filter({
      hasText: /Сотрудники, ответственные/i,
    });

    // Блок "Другие люди" внутри настроек видимости
    this.visibilityOtherPeopleSection = this.userAccessContainer.filter({
      hasText: /Другие люди/i,
    });
  }

  /**
   * Получить поле заголовка КР по индексу (0-based).
   * Используется когда на форме несколько КР.
   * @param {number} index - 0-based индекс КР
   * @returns {import('@playwright/test').Locator}
   */
  getMilestoneTextarea(index) {
    return this.milestoneTitleTextarea.nth(index);
  }

  /**
   * Кликнуть вне активного поля ввода (blur), чтобы триггернуть автосохранение.
   */
  async clickOutside() {
    await this.page.locator("body").click({ position: { x: 10, y: 10 } });
  }

  async assertDefaultState() {
    await this._step(
      'Проверка дефолтного состояния страницы "Создать цель"',
      async () => {
        await this.titleSpan.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        await expect(this.objectiveTitleTextarea).toBeVisible();
        await expect(this.objectiveTitleTextarea).toHaveValue("");

        await expect(this.levelButtonsGroup).toBeVisible();
        await expect(this.levelIndividualActiveButton).toHaveCount(1);
        await expect(this.levelIndividualActiveButton).toContainText(
          "Индивидуальная",
        );

        await expect(this.userAccessContainer).toBeVisible();
        await expect(this.userAccessPublicRadio).toBeChecked();
        await expect(this.userAccessSelectiveRadio).not.toBeChecked();
        await expect(this.userAccessActiveLabel).toContainText(
          "Сделать публичной",
        );
      },
    );
  }

  /**
   * Проверить лейаут секции "Период + Ответственный" (DEVAPR-11585).
   * Убеждается что старые дропдауны год/квартал отсутствуют, а поле "Период" (датапикер) — есть.
   */
  async assertLayoutFields() {
    await this._step("Проверка лейаута: поле Период + Ответственный (новый)", async () => {
      // Секция с датапикером видима
      await expect(this.periodBlock).toBeVisible();
      await expect(this.periodSectionHeading).toBeVisible();

      // Поле "Период" (datepicker anchor) видимо
      await expect(this.datepicker.anchor).toBeVisible();

      // Дефолтное значение = текущий квартал (UPD 05.03)
      const { displayValue } = ObjectivesDatepickerHelper.getCurrentQuarterDates();
      await this.datepicker.assertValue(displayValue);

      // Старых дропдаунов нет
      const oldYearSelect = this.page.locator('[class*="Select"]').filter({ hasText: /202\d/ });
      const oldQuarterSelect = this.page.locator('[class*="Select"]').filter({ hasText: /Q1|Q2|Q3|Q4|Весь год/ });
      await expect(oldYearSelect).toHaveCount(0);
      await expect(oldQuarterSelect).toHaveCount(0);
    });
  }

  /**
   * Выбрать уровень цели "Командная".
   * После клика в форме появляется кнопка выбора команды.
   */
  async selectLevelTeam() {
    await this._step('Выбрать уровень цели "Командная"', async () => {
      await this.teamLevelButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await this.teamLevelButton.click();
    });
  }

  /**
   * Выбрать команду из дропдауна.
   * Должна вызываться после selectLevelTeam().
   * Поток: клик по кнопке "Команда" → клик по команде в списке → клик "Подтвердить".
   * @param {number} [teamIndex=0] — индекс команды в списке (0 = первая)
   */
  async selectTeamFromDropdown(teamIndex = 0) {
    await this._step("Выбрать команду из дропдауна", async () => {
      // Открываем дропдаун
      const openButton = this.page.getByRole("button", { name: "Команда", exact: true });
      await openButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await openButton.click();

      // Дропдаун открывается как overlay — ждём поле поиска команды как маркер открытия
      // accessible name = "Название отдела" (placeholder)
      const searchInput = this.page.getByRole("textbox", { name: "Название отдела" });
      await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Список команд: react-modal-sheet содержит кнопки команд.
      // Контейнер списка — прямой родитель кнопок (находим через content-контейнер листа).
      const sheetContent = this.page.locator(
        ".react-modal-sheet-content, [class*=\"SheetContent\"], [class*=\"sheet-content\"]",
      ).first();
      const sheetVisible = await sheetContent
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      /** @type {import("@playwright/test").Locator} */
      let teamContainer;
      if (sheetVisible) {
        teamContainer = sheetContent;
      } else {
        // Fallback: берём родителя поля поиска на 3 уровня вверх
        teamContainer = searchInput.locator("../../..");
      }

      const teamButtons = teamContainer
        .locator("button")
        .filter({ hasNotText: /Подтвердить|Загрузить еще/i });
      await teamButtons.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      const clickTarget = teamButtons.nth(teamIndex);
      await clickTarget.scrollIntoViewIfNeeded();
      await clickTarget.click({ force: true });

      // После выбора команды внизу дропдауна появляется кнопка "Подтвердить"
      const confirmBtn = this.page.getByRole("button", { name: "Подтвердить", exact: true });
      await confirmBtn.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await confirmBtn.click();

      // Дропдаун закрылся — кнопка "Команда" теперь содержит имя выбранной команды
      await searchInput.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    });
  }

  /**
   * Заполнить цель и один КР и нажать "Создать"
   * @param {string} objectiveTitle
   * @param {string} milestoneTitle
   * @param {{type: 'quarter'|'halfYear'|'year'|'month', year: number, value: number}} [period]
   *   Опциональный выбор периода через датапикер. Если не передан — используется дефолтный (текущий квартал).
   */
  async fillAndCreateObjective(objectiveTitle, milestoneTitle, period = null) {
    await this._step("Заполнить название цели", async () => {
      await this.objectiveTitleTextarea.fill(objectiveTitle);
    });

    // Выбрать период через датапикер если передан (иначе остаётся дефолтный — текущий квартал)
    if (period) {
      await this._step(`Выбрать период: ${period.type} ${period.year} #${period.value}`, async () => {
        if (period.type === "quarter") {
          await this.datepicker.selectQuarter(period.year, period.value);
        } else if (period.type === "halfYear") {
          await this.datepicker.selectHalfYear(period.year, period.value);
        } else if (period.type === "year") {
          await this.datepicker.selectYear(period.year);
        } else if (period.type === "month") {
          await this.datepicker.selectMonth(period.year, period.value);
        }
      });
    }

    await this._step(
      "Добавить ключевой результат и заполнить его",
      async () => {
        await this.addMilestoneButton.click();
        await this.milestoneTitleTextarea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.milestoneTitleTextarea.fill(milestoneTitle);
      },
    );

    await this._step('Нажать "Создать"', async () => {
      // Прокручиваем страницу вниз чтобы кнопка была видна
      await this.page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );
      // Wait for button to be in viewport after scroll
      await this.createButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Ждём что кнопка активна и кликаем с force
      await this.createButton.scrollIntoViewIfNeeded();
      await this.createButton.click({ force: true });

      console.log('Кнопка "Создать" нажата');

      // Ждём навигации или изменения URL
      await this.page
        .waitForURL(/\/objectives\/\d+/, { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => {
          console.log("Ожидание навигации истекло");
        });

      // Дополнительное ожидание
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }
}
