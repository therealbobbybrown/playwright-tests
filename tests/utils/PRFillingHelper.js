// tests/utils/PRFillingHelper.js
// Хелпер для E2E тестов Performance Review - убирает дублирование кода

import { PerformanceReviewsListPage } from "../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewFillPage } from "../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../pages/OrgStructureHelper.js";
import { createUserSession, filterValidUsers } from "./UserSessionHelper.js";
import { verifyPRResults } from "./ResultsVerificationHelper.js";

/**
 * Хелпер для E2E тестов Performance Review
 */
export class PRFillingHelper {
  constructor({ adminPage, browser, request, testInfo }) {
    this.adminPage = adminPage;
    this.browser = browser;
    this.request = request;
    this.testInfo = testInfo;
    this.baseUrl = process.env.BASE_URL;

    // Page Objects
    this.listPage = new PerformanceReviewsListPage(adminPage, testInfo);
    this.configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
    this.orgHelper = new OrgStructureHelper(adminPage, testInfo);
    this.adminFillPage = new PerformanceReviewFillPage(adminPage, testInfo);
    this.userSession = createUserSession(browser, testInfo);

    // Тестовые данные
    this.users = [];
    this.colleagues = [];
    this.managerUser = null;
    this.subordinateUsers = [];
    this.prId = null;
    this.evaluatedUserName = null;
  }

  /**
   * Шаг 1: Получить список пользователей и распределить роли
   * @param {number} minUsers - минимальное количество пользователей
   */
  async getUsersAndAssignRoles(minUsers = 6) {
    await this.adminPage.goto(this.baseUrl, { waitUntil: "domcontentloaded" });

    const rawUsers = await this.orgHelper.getUsersList(minUsers + 5);
    this.users = await filterValidUsers(rawUsers);
    console.log(
      `✓ Получено ${rawUsers.length} пользователей, валидных: ${this.users.length}`,
    );

    if (this.users.length < minUsers) {
      throw new Error(
        `Недостаточно валидных пользователей для теста (нужно минимум ${minUsers}, есть ${this.users.length})`,
      );
    }

    // Распределяем роли: users[0] - админ (оцениваемый)
    this.evaluatedUserName = this.users[0]?.name || "Elena Shapoval";
    this.managerUser = this.users[1];
    this.subordinateUsers = this.users.slice(2, 4);
    this.colleagues = this.users.slice(4, 6);

    console.log(`Оцениваемый: ${this.evaluatedUserName}`);
    console.log(
      `Руководитель: ${this.managerUser.name} (${this.managerUser.email})`,
    );
    console.log(
      `Подчиненные: ${this.subordinateUsers.map((u) => u.name).join(", ")}`,
    );
    console.log(`Коллеги: ${this.colleagues.map((u) => u.name).join(", ")}`);

    return {
      evaluatedUserName: this.evaluatedUserName,
      managerUser: this.managerUser,
      subordinateUsers: this.subordinateUsers,
      colleagues: this.colleagues,
    };
  }

  /**
   * Шаг 2: Создать Performance Review и настроить направления
   * @param {Object} colleaguesConfig - конфигурация подбора коллег
   */
  async createPRWithDirections(colleaguesConfig = { askEmployees: false }) {
    await this.adminPage.goto(
      new URL("/ru/manager/performance-reviews/", this.baseUrl).toString(),
    );
    await this.listPage.assertOpened();

    await this.listPage.openCreateModal();
    await this.listPage.performanceReviewType.click();
    await this.configPage.assertOpened();

    await this.configPage.configureDirections({
      self: true,
      manager: true,
      colleagues: true,
      subordinates: true,
    });

    await this.configPage.configureColleaguesSelection(colleaguesConfig);

    console.log("✓ Направления настроены");
  }

  /**
   * Шаг 3: Добавить участника и респондентов
   * @param {Object} options - опции добавления
   * @param {boolean} options.addColleaguesDirectly - добавить коллег напрямую (для автовыбора)
   */
  async addParticipantsAndRespondents({ addColleaguesDirectly = false } = {}) {
    await this.configPage.addTargetUsers({ count: 1 });
    console.log("✓ Участник добавлен");

    const respondents = {
      managers: [this.managerUser],
      subordinates: this.subordinateUsers,
    };

    if (addColleaguesDirectly) {
      respondents.colleagues = this.colleagues;
    }

    await this.configPage.editRespondentsTable(respondents);
    console.log("✓ Респонденты добавлены");
  }

  /**
   * Шаг 4: Настроить анкеты и запустить PR
   * @param {string} launchMode - режим запуска: 'direct' | 'colleagueSelection'
   */
  async setupAssessmentsAndLaunch(launchMode = "direct") {
    await this.configPage.disableReminders();
    await this.configPage.addAssessmentsForAllDirections();
    await this.configPage.goToStep("launch");

    if (launchMode === "direct") {
      await this.configPage.launchAndSendQuestionnaires();
    } else {
      await this.configPage.sendForColleagueSelection();
    }

    this.prId = this._extractPRIdFromUrl();
    console.log(`✓ Performance Review создан, ID: ${this.prId}`);

    return this.prId;
  }

  /**
   * Выбрать коллег (для режима askEmployees: true)
   * @param {number} count - количество коллег для выбора
   */
  async selectColleagues(count = 2) {
    await this.adminFillPage.navigateToColleagueSelection(
      this.baseUrl,
      this.prId,
    );
    this.colleagues = await this.adminFillPage.selectColleaguesForReview(
      this.colleagues,
      count,
    );
    console.log(`✓ Выбрано ${this.colleagues.length} коллег`);
    return this.colleagues;
  }

  /**
   * Завершить этап подбора коллег
   */
  async completeColleagueSelectionStage() {
    await this.adminPage.goto(
      new URL(
        `/ru/manager/performance-reviews/${this.prId}/`,
        this.baseUrl,
      ).toString(),
    );
    await this.adminPage.waitForLoadState("networkidle");

    await this.configPage.completeCurrentStage();
    console.log("✓ Этап подбора завершен");
  }

  /**
   * Отправить анкеты после завершения этапа
   */
  async sendQuestionnaires() {
    await this.configPage.sendQuestionnaires();
    console.log("✓ Анкеты отправлены");
  }

  /**
   * Заполнить самооценку (админ)
   */
  async fillSelfAssessment() {
    await this.adminFillPage.fillQuestionnaireComplete(this.baseUrl);
    console.log("✓ Самооценка заполнена");
  }

  /**
   * Заполнить оценку от коллеги
   * @param {number} colleagueIndex - индекс коллеги (по умолчанию 0)
   */
  async fillColleagueAssessment(colleagueIndex = 0) {
    if (this.colleagues.length === 0) {
      console.log("⚠️ Нет выбранных коллег, пропускаем");
      return;
    }

    await this.userSession.runAs(
      this.colleagues[colleagueIndex],
      async (page) => {
        const fillPage = new PerformanceReviewFillPage(page, this.testInfo);
        await fillPage.fillQuestionnaireForEvaluated(
          this.baseUrl,
          this.evaluatedUserName,
        );
        console.log("✓ Оценка от коллеги заполнена");
      },
    );
  }

  /**
   * Заполнить оценку от руководителя
   */
  async fillManagerAssessment() {
    if (!this.managerUser) {
      console.log("⚠️ Руководитель не назначен, пропускаем");
      return;
    }

    await this.userSession.runAs(this.managerUser, async (page) => {
      const fillPage = new PerformanceReviewFillPage(page, this.testInfo);
      await fillPage.fillQuestionnaireForEvaluated(
        this.baseUrl,
        this.evaluatedUserName,
      );
      console.log("✓ Оценка от руководителя заполнена");
    });
  }

  /**
   * Заполнить оценки от подчиненных
   */
  async fillSubordinatesAssessments() {
    if (this.subordinateUsers.length === 0) {
      console.log("⚠️ Подчиненные не назначены, пропускаем");
      return;
    }

    for (const subordinate of this.subordinateUsers) {
      await this.userSession.runAs(subordinate, async (page) => {
        const fillPage = new PerformanceReviewFillPage(page, this.testInfo);
        await fillPage.fillQuestionnaireForEvaluated(
          this.baseUrl,
          this.evaluatedUserName,
        );
        console.log(`✓ Оценка от подчиненного ${subordinate.name} заполнена`);
      });
    }
  }

  /**
   * Проверить результаты PR и расчёты
   */
  async verifyResults() {
    if (!this.prId) {
      console.log("⚠️ PR ID не найден, пропускаем проверку результатов");
      return null;
    }

    const results = await verifyPRResults({
      page: this.adminPage,
      request: this.request,
      testInfo: this.testInfo,
      baseUrl: this.baseUrl,
      prId: this.prId,
      evaluatedUserName: this.evaluatedUserName,
      openAccess: true,
    });

    if (results.calculations.length > 0) {
      console.log(`✓ Проверено ${results.calculations.length} вопросов`);
      console.log(
        `✓ Расчёты корректны: ${results.isValid ? "Да" : "Есть расхождения"}`,
      );
    } else {
      console.log("⚠️ Нет данных для проверки расчётов");
    }

    return results;
  }

  /**
   * Извлечь ID PR из текущего URL
   * @private
   */
  _extractPRIdFromUrl() {
    const currentUrl = this.adminPage.url();
    const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
    return match ? match[1] : null;
  }

  // ============== Готовые сценарии ==============

  /**
   * Полный сценарий: автоматический выбор коллег
   */
  async runAutoColleaguesScenario() {
    await this.getUsersAndAssignRoles();
    await this.createPRWithDirections({ askEmployees: false });
    await this.addParticipantsAndRespondents({ addColleaguesDirectly: true });
    await this.setupAssessmentsAndLaunch("direct");
    await this.fillSelfAssessment();
    await this.fillColleagueAssessment();
    await this.fillManagerAssessment();
    await this.fillSubordinatesAssessments();
    return await this.verifyResults();
  }

  /**
   * Полный сценарий: ручной выбор коллег (askEmployees: true)
   */
  async runManualColleaguesScenario() {
    await this.getUsersAndAssignRoles();
    await this.createPRWithDirections({
      askEmployees: true,
      minColleagues: 1,
      maxColleagues: 2,
      managerApproval: false,
      earlyAccess: false,
    });
    await this.addParticipantsAndRespondents({ addColleaguesDirectly: false });
    await this.setupAssessmentsAndLaunch("colleagueSelection");
    await this.selectColleagues(2);
    await this.completeColleagueSelectionStage();
    await this.sendQuestionnaires();
    await this.fillSelfAssessment();
    await this.fillColleagueAssessment();
    await this.fillManagerAssessment();
    await this.fillSubordinatesAssessments();
    return await this.verifyResults();
  }
}

/**
 * Фабрика для создания хелпера
 */
export function createPRFillingHelper({
  adminPage,
  browser,
  request,
  testInfo,
}) {
  return new PRFillingHelper({ adminPage, browser, request, testInfo });
}
