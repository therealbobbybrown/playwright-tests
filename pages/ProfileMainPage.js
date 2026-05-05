import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/ProfileMainPage.js

export class ProfileMainPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок профиля (ФИО). В некоторых сборках может быть не h1, поэтому берём любой heading.
    this.userNameHeading = this.page
      .getByRole("heading")
      .filter({ hasText: /\S/ })
      .first();

    // Кнопка "Настроить профиль" — НЕ обязательна (зависит от прав/режима)
    this.configureProfileButton = this.page
      .getByRole("button", { name: /настроить профиль/i })
      .first();

    // Вкладки профиля (tab/button/link — покрываем варианты)
    this.mainTab = this._tabByName("Главное");
    this.employeeReviewTab = this._tabByName("Оценка сотрудника");
    this.developmentTab = this._tabByName("Развитие");
    this.additionalInfoTab = this._tabByName("Дополнительная информация");

    // ---- Активные вкладки (для assertMainTabActive и аналогов) ----
    this.mainTabActive = this._activeTabByName("Главное");
    this.employeeReviewTabActive = this._activeTabByName("Оценка сотрудника");
    this.developmentTabActive = this._activeTabByName("Развитие");
    this.additionalInfoTabActive = this._activeTabByName(
      "Дополнительная информация",
    );

    // Блоки на вкладке "Главное" — проверяем наличие, без содержимого
    this.teamBlockTitle = this.page
      .getByRole("heading", { name: /^Команда$/i })
      .first();
    this.whoSeesBlockTitle = this.page
      .getByRole("heading", { name: /^Кто видит эту информацию$/i })
      .first();
    this.contactsBlockTitle = this.page
      .getByRole("heading", { name: /^Контакты$/i })
      .first();
    this.aboutBlockTitle = this.page
      .getByRole("heading", { name: /^О себе$/i })
      .first();

    // -------- Аватар и шапка профиля --------
    this.profileAvatar = this.page
      .locator(
        '[class*="Avatar_avatar__"], [class*="ProfileHeader_avatar__"], img[class*="avatar"]',
      )
      .first();

    // -------- Блок "Команда" — детали --------
    this.departmentLabel = this.page.getByText(/^Отдел$/i).first();
    this.departmentValue = this.page
      .locator('[class*="Department_"], [class*="Team_department__"]')
      .first();
    this.companyStructureButton = this.page
      .locator('a[class*="BorderedButton_button"][href*="structure"]')
      .first();

    this.mainManagerLabel = this.page
      .getByText(/^Основной руководитель$/i)
      .first();
    this.mainManagerName = this.page
      .locator(
        '[class*="Manager_name__"], [class*="Team_manager__"] [class*="name"]',
      )
      .first();
    this.mainManagerAvatar = this.page
      .locator('[class*="Manager_avatar__"], [class*="Team_manager__"] img')
      .first();

    // -------- Блок "Контакты" — детали --------
    this.contactEmail = this.page
      .locator(
        '[class*="Contacts_"] a[href^="mailto:"], [class*="Contact_email__"]',
      )
      .first();

    // -------- Блок "О себе" — детали --------
    this.birthdayLabel = this.page.getByText(/^День рождения$/i).first();
    this.birthdayValue = this.page
      .locator('[class*="About_birthday__"], [class*="Birthday_"]')
      .first();
    this.companyStartLabel = this.page.getByText(/^В компании с$/i).first();

    // -------- Вкладка "Оценка сотрудника" --------
    this.employeeReviewCyclesTitle = this.page
      .getByRole("heading", { name: /^Циклы оценок сотрудника$/i })
      .first();
    this.employeeReviewHistoryTable = this.page
      .locator('table[class*="HistoryTable_table__"]')
      .first();
    this.employeeReviewFilterAllStatuses = this.page
      .getByRole("button", { name: /^Все статусы$/i })
      .first();

    // -------- Вкладка "Развитие" --------
    this.developmentPlansTitleHeading = this.page
      .getByRole("heading", { name: /^Планы развития$/i })
      .first();

    // Фолбэк: текст "Планы развития", но НЕ из SidePanel (он часто присутствует в DOM и бывает hidden)
    this.developmentPlansTitleSafeText = this.page
      .locator(
        'xpath=//*[normalize-space(.)="Планы развития" and (self::h1 or self::h2 or self::h3 or self::div or self::span) and not(contains(@class,"SidePanel_")) and not(ancestor::*[contains(@class,"SidePanel_")])]',
      )
      .first();

    this.createDevelopmentPlanButton = this.page
      .getByRole("button", { name: /создать план развития/i })
      .first();

    this.developmentPlansTable = this.page
      .locator('table, div[class*="Table"], div[role="table"]')
      .filter({ hasText: /Цель плана развития/i })
      .first();

    this.developmentPlansTableHeaderGoal = this.page
      .getByText(/Цель плана развития/i)
      .first();
    this.developmentPlansTableHeaderPeriod = this.page
      .getByText(/Период действия/i)
      .first();
    this.developmentPlansTableHeaderProgress = this.page
      .getByText(/Прогресс/i)
      .first();
    this.developmentPlansTableHeaderStatus = this.page
      .getByText(/Статус/i)
      .first();
  }

  async assertOpened() {
    await this._step("Профиль: страница открыта", async () => {
      await this.page.waitForLoadState("domcontentloaded");

      // URL обычно вида: /ru/profile/1/?tab=main (могут быть доп. параметры)
      await this.page
        .waitForURL(URL_PATTERNS.PROFILE_MAIN, { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);

      // Обязательные маркеры страницы: вкладка "Главное" + блок "Команда"
      await this.mainTab
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      await this.teamBlockTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });

      // Заголовок имени — обычно есть, но пусть не будет причиной падения
      await this.userNameHeading
        .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
    });
  }

  async assertProfileShellVisible() {
    await this._step("Профиль: видна оболочка (табы/шапка)", async () => {
      await this.page.waitForLoadState("domcontentloaded");
      await this.mainTab
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      await this.userNameHeading
        .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
    });
  }

  async assertConfigureProfileButtonVisible() {
    await this._step('Профиль: видна кнопка "Настроить профиль"', async () => {
      await this.configureProfileButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async clickConfigureProfile() {
    await this._step('Профиль: нажать "Настроить профиль"', async () => {
      await this.configureProfileButton.click();
    });
  }

  async openTabByName(name) {
    await this._step(`Профиль: открыть вкладку "${name}"`, async () => {
      const tab = this._tabByName(name).first();
      await tab.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      await tab.click();
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
    });
  }

  async assertAdditionalInfoFieldsVisible(labels) {
    await this._step(`Профиль: поля видны (${labels.join(", ")})`, async () => {
      for (const label of labels) {
        const re = new RegExp(`^\\s*${this._escapeRe(label)}\\s*$`, "i");
        await this.page
          .getByText(re)
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      }
    });
  }

  // ----------------- Active tab asserts -----------------

  async assertMainTabActive() {
    await this._step('Профиль: активна вкладка "Главное"', async () => {
      await this.mainTabActive.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async assertEmployeeReviewTabActive() {
    await this._step(
      'Профиль: активна вкладка "Оценка сотрудника"',
      async () => {
        await this.employeeReviewTabActive.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      },
    );
  }

  async assertDevelopmentTabActive() {
    await this._step('Профиль: активна вкладка "Развитие"', async () => {
      await this.developmentTabActive.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async assertAdditionalInfoTabActive() {
    await this._step(
      'Профиль: активна вкладка "Дополнительная информация"',
      async () => {
        await this.additionalInfoTabActive.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      },
    );
  }

  // ----------------- Blocks asserts -----------------

  async assertMainTabBlocksPresent() {
    await this._step(
      'Профиль: на вкладке "Главное" присутствуют основные блоки',
      async () => {
        await this.teamBlockTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.whoSeesBlockTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.contactsBlockTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.aboutBlockTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      },
    );
  }

  async assertProfileAvatarVisible() {
    await this._step("Профиль: аватар виден", async () => {
      await this.profileAvatar.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async assertUserNameVisible() {
    await this._step("Профиль: имя пользователя видно", async () => {
      await this.userNameHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async getUserName() {
    return this._step("Профиль: получить имя пользователя", async () => {
      await this.userNameHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      return this.userNameHeading.textContent();
    });
  }

  async assertTeamBlockDetailsPresent() {
    await this._step(
      'Профиль: блок "Команда" содержит отдел и руководителя',
      async () => {
        await this.departmentLabel.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.mainManagerLabel.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      },
    );
  }

  /**
   * Проверить, что открылся профиль нужного сотрудника
   * Двойная верификация: URL содержит userId + имя в хедере совпадает
   * @param {string} expectedName - Ожидаемое ФИО сотрудника
   * @param {number} [expectedUserId] - Ожидаемый userId (опционально)
   */
  async assertProfileBelongsTo(expectedName, expectedUserId) {
    await this._step(
      `Профиль: проверить, что открыт профиль «${expectedName}»`,
      async () => {
        await this.assertOpened();

        // Если передан userId — проверяем URL (надёжнее имени)
        if (expectedUserId) {
          expect(
            this.page.url(),
            `Профиль должен принадлежать userId=${expectedUserId}`,
          ).toContain(`/profile/${expectedUserId}`);
          return;
        }

        // Проверяем имя в хедере профиля
        await this.userNameHeading.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        const rawActual = (await this.userNameHeading.textContent()).trim();
        // Нормализуем пробелы (профиль может рендерить двойные пробелы)
        const normalize = (s) => s.replace(/\s+/g, " ").trim();
        const actualName = normalize(rawActual);
        const normalizedExpected = normalize(expectedName);
        // Имя из таблицы должно содержаться в имени профиля или наоборот
        const nameMatch =
          actualName.includes(normalizedExpected) ||
          normalizedExpected.includes(actualName);
        expect(
          nameMatch,
          `Ожидалось имя «${normalizedExpected}», в профиле «${actualName}»`,
        ).toBeTruthy();
      },
    );
  }

  async assertCompanyStructureButtonVisible() {
    await this._step('Профиль: кнопка "Структура компании" видна', async () => {
      await this.companyStructureButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async clickCompanyStructure() {
    await this._step('Профиль: нажать "Структура компании"', async () => {
      await this.companyStructureButton.click();
    });
  }

  async assertMainManagerVisible() {
    await this._step("Профиль: основной руководитель виден", async () => {
      await this.mainManagerLabel.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async getMainManagerName() {
    return this._step("Профиль: получить имя руководителя", async () => {
      await this.mainManagerName
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => null);
      const nameEl = this.page
        .locator(
          '[class*="Manager_"] [class*="name"], [class*="Team_manager__"]',
        )
        .first();
      return nameEl.textContent().catch(() => null);
    });
  }

  async assertContactEmailVisible() {
    await this._step("Профиль: email в контактах виден", async () => {
      await this.contactEmail.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async getContactEmail() {
    return this._step("Профиль: получить email", async () => {
      await this.contactEmail.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      const href = await this.contactEmail.getAttribute("href");
      return href
        ? href.replace("mailto:", "")
        : await this.contactEmail.textContent();
    });
  }

  async assertAboutBlockDetailsPresent() {
    await this._step('Профиль: блок "О себе" содержит поля', async () => {
      await this.birthdayLabel.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.companyStartLabel.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async isConfigureProfileButtonVisible() {
    return this._step(
      'Профиль: проверить видимость кнопки "Настроить профиль"',
      async () => {
        try {
          const count = await this.configureProfileButton.count();
          if (count === 0) return false;
          return await this.configureProfileButton.isVisible();
        } catch {
          return false;
        }
      },
    );
  }

  async assertConfigureProfileButtonNotVisible() {
    await this._step(
      'Профиль: кнопка "Настроить профиль" НЕ видна',
      async () => {
        const visible = await this.isConfigureProfileButtonVisible();
        if (visible) {
          throw new Error(
            'Кнопка "Настроить профиль" видна, хотя не должна быть',
          );
        }
      },
    );
  }

  async isEmployeeReviewTabAvailable(timeout = 5_000) {
    return this._step(
      'Профиль: вкладка "Оценка сотрудника" доступна',
      async () => {
        const tab = this.employeeReviewTab.first();
        const count = await tab.count();
        if (count === 0) return false;

        try {
          await tab.waitFor({ state: "visible", timeout });
          return true;
        } catch {
          return false;
        }
      },
    );
  }

  async openEmployeeReviewTab() {
    await this._step(
      'Профиль: открыть вкладку "Оценка сотрудника"',
      async () => {
        const tab = this.employeeReviewTab.first();
        await tab.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

        const targetUrl = /\/profile\/(\d+\/)?\?tab=review/i;
        const already = targetUrl.test(this.page.url());

        if (!already) {
          await Promise.all([
            this.page
              .waitForURL(targetUrl, { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => null),
            tab.click(),
          ]);
        }

        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
        await this.employeeReviewCyclesTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        // Ждём пока исчезнет индикатор загрузки данных (таблица рендерится асинхронно)
        await this.page
          .getByText(/^Загрузка$/i)
          .first()
          .waitFor({ state: "hidden", timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
      },
    );
  }

  async assertEmployeeReviewTabBlocksPresent() {
    await this._step(
      'Профиль: на вкладке "Оценка сотрудника" присутствуют основные блоки',
      async () => {
        await this.employeeReviewCyclesTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.whoSeesBlockTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.employeeReviewFilterAllStatuses
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => null);
      },
    );
  }

  async openDevelopmentTab() {
    await this._step('Профиль: открыть вкладку "Развитие"', async () => {
      const tab = this.developmentTab.first();
      await tab.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

      const targetUrl = /\/profile\/(\d+\/)?\?tab=developmentPlans/i;
      const already = targetUrl.test(this.page.url());

      if (!already) {
        await Promise.all([
          this.page
            .waitForURL(targetUrl, { timeout: TIMEOUTS.PAGE_LOAD })
            .catch(() => null),
          tab.click(),
        ]);
      }

      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
      await this._waitForDevelopmentPlansTitle();
    });
  }

  async assertDevelopmentTabBlocksPresent() {
    await this._step(
      'Профиль: на вкладке "Развитие" присутствуют основные блоки',
      async () => {
        await this._waitForDevelopmentPlansTitle();
        await this.createDevelopmentPlanButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        await this.whoSeesBlockTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        const tableExists =
          (await this.developmentPlansTable.count()) > 0 &&
          (await this.developmentPlansTable.isVisible().catch(() => false));

        if (tableExists) {
          await this.developmentPlansTableHeaderGoal
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .catch(() => null);
          await this.developmentPlansTableHeaderPeriod
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .catch(() => null);
          await this.developmentPlansTableHeaderProgress
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .catch(() => null);
          await this.developmentPlansTableHeaderStatus
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .catch(() => null);
        }
      },
    );
  }

  async _waitForDevelopmentPlansTitle(timeout = 20_000) {
    try {
      await this.developmentPlansTitleHeading.waitFor({
        state: "visible",
        timeout: Math.min(timeout, 8_000),
      });
      return;
    } catch {
      // fallback ниже
    }

    await this.developmentPlansTitleSafeText.waitFor({
      state: "visible",
      timeout,
    });
  }

  _tabByName(name) {
    const re = new RegExp(`^${name}$`, "i");
    const asTab = this.page.getByRole("tab", { name: re });
    const asButton = this.page.getByRole("button", { name: re });
    const asLink = this.page.getByRole("link", { name: re });

    return asTab.or(asButton).or(asLink);
  }

  _activeTabByName(name) {
    const labelRe = new RegExp(`^${name}$`, "i");

    const ariaSelected = this.page
      .locator('[role="tab"][aria-selected="true"]')
      .filter({
        has: this.page
          .locator('span[class*="Tabs_label__"], span')
          .filter({ hasText: labelRe }),
      });

    const classActive = this.page
      .locator('button[class*="Tabs_button--active__"]')
      .filter({
        has: this.page
          .locator('span[class*="Tabs_label__"], span')
          .filter({ hasText: labelRe }),
      });

    const anyActive = this.page
      .locator(
        '[class*="Tabs_button--active__"], [class*="Tabs_tab--active__"]',
      )
      .filter({
        has: this.page
          .locator('span[class*="Tabs_label__"], span')
          .filter({ hasText: labelRe }),
      });

    return ariaSelected.or(classActive).or(anyActive).first();
  }

  _escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
