/**
 * Хелпер для создания тестовых данных для модуля Scenarios
 *
 * Создаёт:
 * - Черновики сценариев
 * - Активные сценарии (с actions)
 * - Сценарии с участниками
 */

import {
  ScenariosAPI,
  SurveyAPI,
  OrgStructureAPI,
  getCredentials,
} from "../api/index.js";
import { TestDataHelper } from "../TestDataHelper.js";
import { SurveySeedHelper } from "./SurveySeedHelper.js";

export class ScenarioSeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    this.request = request;
    this.scenariosAPI = null;
    this.surveyAPI = null;
    this.orgAPI = null;
    this.createdIds = {
      scenarios: [],
    };
    this._activeSurveyId = null;
    this._testUserId = null;
  }

  /**
   * Инициализировать API с авторизацией
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    this.scenariosAPI = new ScenariosAPI(this.request);
    this.surveyAPI = new SurveyAPI(this.request);
    this.orgAPI = new OrgStructureAPI(this.request);

    const { email, password } = getCredentials(role);
    await this.scenariosAPI.signIn(email, password);
    await this.surveyAPI.signIn(email, password);
    await this.orgAPI.signIn(email, password);

    // Кэшируем активный опрос и тестового пользователя
    await this._cacheTestData();
  }

  /**
   * Кэшировать тестовые данные (активный опрос, тестовый пользователь)
   */
  async _cacheTestData() {
    // Получаем активный опрос
    const { data: surveyData } = await this.surveyAPI.getList({
      status: "active",
      limit: 1,
    });
    const surveys = surveyData?.items || surveyData || [];
    this._activeSurveyId = surveys.length > 0 ? surveys[0].id : null;

    // Если нет активных опросов — создаём
    if (!this._activeSurveyId) {
      console.log("[ScenarioSeed] No active surveys found, creating one...");
      const seed = new SurveySeedHelper(this.request);
      await seed.init();
      const survey = await seed.seedActiveSurvey({
        title: TestDataHelper.generateUniqueName("Auto-created for Scenarios"),
      });
      this._activeSurveyId = survey.id;
      console.log(`[ScenarioSeed] Created active survey ID: ${this._activeSurveyId}`);
    }

    // Получаем тестового пользователя
    const { data: userData } = await this.orgAPI.getUsers({ limit: 1 });
    const users = userData?.items || userData || [];
    this._testUserId = users.length > 0 ? users[0].id : null;

    if (process.env.SEED_DEBUG) {
      console.log("[ScenarioSeed] Cached surveyId:", this._activeSurveyId);
      console.log("[ScenarioSeed] Cached userId:", this._testUserId);
    }
  }

  /**
   * Получить ID активного опроса
   * @returns {string|number|null}
   */
  getActiveSurveyId() {
    return this._activeSurveyId;
  }

  /**
   * Получить ID тестового пользователя
   * @returns {string|number|null}
   */
  getTestUserId() {
    return this._testUserId;
  }

  /**
   * Создать черновик сценария
   * @param {Object} options
   * @param {string} [options.title] - Название
   * @param {string} [options.description] - Описание
   * @returns {Promise<{id: string|number, title: string, status: string}>}
   */
  async seedDraftScenario(options = {}) {
    if (!this.scenariosAPI) {
      throw new Error(
        "ScenarioSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const title =
      options.title || TestDataHelper.generateUniqueName("Test Scenario");
    const description =
      options.description || "Тестовый сценарий для автотестов";

    const { response, data } = await this.scenariosAPI.create({
      title,
      description,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать сценарий: ${error}`);
    }

    this.createdIds.scenarios.push(data.id);

    return {
      id: data.id,
      title: data.title,
      status: data.status,
    };
  }

  /**
   * Создать активный сценарий с действием
   * @param {Object} options
   * @param {string} [options.title] - Название
   * @param {string} [options.description] - Описание
   * @param {string|number} [options.surveyId] - ID опроса для action (по умолчанию кэшированный)
   * @param {number} [options.days=0] - Через сколько дней выполнять action
   * @returns {Promise<{id: string|number, title: string, status: string, actions: Array}|null>}
   */
  async seedActiveScenario(options = {}) {
    if (!this.scenariosAPI) {
      throw new Error(
        "ScenarioSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const surveyId = options.surveyId || this._activeSurveyId;
    if (!surveyId) {
      console.warn(
        "[ScenarioSeed] Нет активного опроса - нельзя создать активный сценарий",
      );
      return null;
    }

    const title =
      options.title || TestDataHelper.generateUniqueName("Active Scenario");
    const description = options.description || "Активный тестовый сценарий";

    const { response, data } = await this.scenariosAPI.createAndActivate({
      title,
      description,
      actions: [
        {
          type: "survey",
          days: options.days ?? 0,
          surveyId,
        },
      ],
    });

    if (!response.ok() || !data?.id) {
      console.warn("[ScenarioSeed] Не удалось создать активный сценарий");
      return null;
    }

    this.createdIds.scenarios.push(data.id);

    return {
      id: data.id,
      title: data.title,
      status: data.status,
      actions: data.scenarioActions || data.actions || [],
    };
  }

  /**
   * Создать активный сценарий с участником
   * @param {Object} options
   * @param {string} [options.title] - Название
   * @param {string|number} [options.surveyId] - ID опроса
   * @param {string|number} [options.userId] - ID пользователя (по умолчанию кэшированный)
   * @returns {Promise<{scenario: Object, performer: Object}|null>}
   */
  async seedScenarioWithPerformer(options = {}) {
    if (!this.scenariosAPI) {
      throw new Error(
        "ScenarioSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const surveyId = options.surveyId || this._activeSurveyId;
    const userId = options.userId || this._testUserId;

    if (!surveyId || !userId) {
      console.warn("[ScenarioSeed] Нет активного опроса или пользователя");
      return null;
    }

    // Создаём активный сценарий
    const scenario = await this.seedActiveScenario({
      title:
        options.title ||
        TestDataHelper.generateUniqueName("Scenario with Performer"),
      surveyId,
    });

    if (!scenario) {
      return null;
    }

    // Добавляем участника
    const { response, data: performers } =
      await this.scenariosAPI.addPerformers(scenario.id, [userId]);

    if (!response.ok()) {
      console.warn("[ScenarioSeed] Не удалось добавить участника");
      return { scenario, performer: null };
    }

    const performer = performers?.items?.[0] || performers?.[0] || null;

    return {
      scenario,
      performer,
    };
  }

  /**
   * Получить ID активного опроса, или создать новый если нет ни одного.
   * Используется в beforeAll тестов сценариев.
   * @param {import('@playwright/test').APIRequestContext} request
   * @param {'admin'} [role='admin']
   * @returns {Promise<string|number>} surveyId
   */
  static async getOrCreateActiveSurveyId(request, role = "admin") {
    const surveyAPI = new SurveyAPI(request);
    const { email, password } = getCredentials(role);
    await surveyAPI.signIn(email, password);

    // Попробуем найти существующий
    const { data } = await surveyAPI.getList({ status: "active", limit: 1 });
    const items = data?.items || data || [];
    if (items.length > 0) {
      return items[0].id;
    }

    // Нет активных опросов — создаём
    console.log("[ScenarioSeed] No active surveys found, creating one...");
    const seed = new SurveySeedHelper(request);
    await seed.init(role);
    const survey = await seed.seedActiveSurvey({
      title: TestDataHelper.generateUniqueName("Auto-created for Scenarios"),
    });
    console.log(`[ScenarioSeed] Created active survey ID: ${survey.id}`);
    return survey.id;
  }

  /**
   * Очистить созданные данные
   * Примечание: DELETE API не реализован, поэтому cleanup ограничен
   */
  async cleanup() {
    if (!this.scenariosAPI) return;

    for (const id of this.createdIds.scenarios) {
      try {
        await this.scenariosAPI.remove(id);
      } catch (error) {
        // DELETE не реализован - это ожидаемо
        if (process.env.SEED_DEBUG) {
          console.log(`[ScenarioSeed] Cleanup skip for ${id}:`, error.message);
        }
      }
    }

    this.createdIds.scenarios = [];
  }

  /**
   * Проверить есть ли необходимые данные для создания активных сценариев
   * @returns {boolean}
   */
  canCreateActiveScenarios() {
    return Boolean(this._activeSurveyId);
  }

  /**
   * Проверить есть ли данные для создания сценариев с участниками
   * @returns {boolean}
   */
  canCreateScenariosWithPerformers() {
    return Boolean(this._activeSurveyId && this._testUserId);
  }
}
