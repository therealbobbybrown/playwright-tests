// tests/utils/api/AssessmentsAPI.js
// API клиент для работы с анкетами (Assessments)

import { createHash } from "crypto";
import { APIClient } from "./APIClient.js";

/**
 * Генерация fingerPrint как MD5 хеш
 * @returns {string}
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * API клиент для работы с анкетами (Assessments)
 * Endpoints: /manager/assessments/*
 */
export class AssessmentsAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    this.fingerPrint = generateFingerPrint();
  }

  /**
   * Авторизация пользователя
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async signIn(email, password, options = {}) {
    const {
      timeout = 120_000,
      retries = 1,
      retryDelay = 3000,
      ...restOptions
    } = options;
    let lastData;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { data } = await this.post(
          "/auth/account/signin",
          {
            email,
            password,
            fingerPrint: this.fingerPrint,
            permissions: [],
          },
          { timeout, ...restOptions },
        );
        if (data?.accessToken) {
          this.setToken(data.accessToken);
        }
        return data;
      } catch (error) {
        lastData = null;
        if (attempt < retries) {
          console.warn(
            `[AssessmentsAPI] signIn attempt ${attempt + 1} failed (${error.message}), retrying in ${retryDelay}ms...`,
          );
          await new Promise((r) => setTimeout(r, retryDelay));
        } else {
          throw error;
        }
      }
    }

    return lastData;
  }

  // ==================== ASSESSMENTS ====================

  /**
   * Получить список анкет
   * GET /manager/assessments/
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.status] - Статус анкеты
   * @param {boolean} [params.my] - Только мои анкеты
   * @param {string} [params.sortBy] - Поле сортировки
   * @param {string} [params.orderBy] - Порядок сортировки
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAssessments(params = {}) {
    return this.get("/manager/assessments/", params);
  }

  /**
   * Получить анкету по ID
   * GET /manager/assessments/{id}/
   * @param {number} assessmentId - ID анкеты
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAssessment(assessmentId) {
    return this.get(`/manager/assessments/${assessmentId}/`);
  }

  /**
   * Создать анкету
   * POST /manager/assessments/
   * @param {Object} [params] - Параметры создания
   * @param {number} [params.templateId] - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createAssessment(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.templateId) queryParams.set("templateId", params.templateId);
    const queryString = queryParams.toString();
    const url = `/manager/assessments/${queryString ? "?" + queryString : ""}`;
    return this.post(url, {});
  }

  /**
   * Создать черновик анкеты
   * POST /manager/assessments/
   * @param {Object} params - Параметры
   * @param {number} [params.templateId] - ID шаблона
   * @param {number} [params.srcAssessmentId] - ID исходной анкеты
   * @param {Object} [params.body] - Тело запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createAssessmentDraft({ templateId, srcAssessmentId, body } = {}) {
    const queryParams = new URLSearchParams();
    if (templateId) queryParams.set("templateId", templateId);
    if (srcAssessmentId) queryParams.set("srcAssessmentId", srcAssessmentId);
    const queryString = queryParams.toString();
    const url = `/manager/assessments/${queryString ? "?" + queryString : ""}`;
    return this.post(url, body || {});
  }

  /**
   * Обновить анкету
   * POST /manager/assessments/{id}/
   * @param {number} id - ID анкеты
   * @param {Object} questionnaire - Данные анкеты
   * @param {string} [questionnaire.title] - Название
   * @param {string} [questionnaire.description] - Описание
   * @param {string} [questionnaire.theme] - Тема
   * @param {Object} [questionnaire.themeSettings] - Настройки темы
   * @param {Array} [questionnaire.updatedPages] - Обновлённые страницы
   * @param {Array} [questionnaire.updatedArchivedQuestions] - Архивированные вопросы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateAssessment(id, questionnaire = {}) {
    return this.post(`/manager/assessments/${id}/`, { questionnaire });
  }

  /**
   * Удалить анкету
   * DELETE /manager/assessments/{id}/
   * @param {number} id - ID анкеты
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteAssessment(id) {
    return this.delete(`/manager/assessments/${id}/`);
  }

  // ==================== TEMPLATES ====================

  /**
   * Получить список шаблонов анкет
   * GET /manager/assessments/templates/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAssessmentTemplates(params = {}) {
    return this.get("/manager/assessments/templates/", params);
  }

  /**
   * Получить шаблон анкеты по ID
   * GET /manager/assessments/templates/{id}/
   * @param {number} templateId - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAssessmentTemplate(templateId) {
    return this.get(`/manager/assessments/templates/${templateId}/`);
  }

  /**
   * Получить шаблон как анкету
   * GET /manager/assessments/templates/{id}/as-assessment/
   * @param {number} templateId - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTemplateAsAssessment(templateId) {
    return this.get(
      `/manager/assessments/templates/${templateId}/as-assessment/`,
    );
  }

  /**
   * Создать шаблон анкеты
   * POST /manager/assessments/templates/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createAssessmentTemplate() {
    return this.post("/manager/assessments/templates/");
  }

  /**
   * Обновить шаблон анкеты
   * POST /manager/assessments/templates/{id}/
   * @param {number} id - ID шаблона
   * @param {Object} data - Данные шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateAssessmentTemplate(id, templateData = {}) {
    return this.post(`/manager/assessments/templates/${id}/`, {
      id,
      ...templateData,
    });
  }
}
