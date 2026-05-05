/**
 * Хелпер для создания и очистки тестовых данных через API
 * Использовать в beforeEach/afterEach для подготовки и очистки данных
 */

import { TestDataHelper } from "../TestDataHelper.js";
import { AuthAPI, getCredentials } from "../api/index.js";

export class SeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request - Playwright request context
   */
  constructor(request) {
    this.request = request;
    this.apiClient = null;
    this.createdIds = {
      surveys: [],
      departments: [],
      groups: [],
      users: [],
      feedbacks: [],
      objectives: [],
      performanceReviews: [],
    };
  }

  /**
   * Инициализировать API клиент с авторизацией
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    this.apiClient = new AuthAPI(this.request);
    const { email, password } = getCredentials(role);
    const { response } = await this.apiClient.signIn(email, password);

    if (!response.ok()) {
      throw new Error(`SeedHelper: не удалось авторизоваться как ${role}`);
    }
  }

  /**
   * Создать тестовый департамент через API
   * POST /manager/departments
   * @param {string} name - Название департамента
   * @returns {Promise<{id: string, name: string}>}
   */
  async seedDepartment(name) {
    if (!this.apiClient) {
      throw new Error("SeedHelper не инициализирован. Вызовите init() первым.");
    }

    const uniqueName = TestDataHelper.generateUniqueName(name || "Департамент");

    const response = await this.apiClient.post("/manager/departments", {
      title: uniqueName,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать департамент: ${error}`);
    }

    const data = await response.json();
    const id = data.id;
    this.createdIds.departments.push(id);

    return { id, name: uniqueName };
  }

  /**
   * Создать тестовый опрос через API
   * POST /manager/surveys
   * @param {Object} options - Параметры опроса
   * @param {string} [options.title] - Название опроса
   * @returns {Promise<{id: string, title: string}>}
   */
  async seedSurvey(options = {}) {
    if (!this.apiClient) {
      throw new Error("SeedHelper не инициализирован. Вызовите init() первым.");
    }

    const uniqueTitle = TestDataHelper.generateUniqueName(
      options.title || "Опрос",
    );

    const response = await this.apiClient.post("/manager/surveys", {
      title: uniqueTitle,
      description: options.description || "Тестовый опрос",
      ...options,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать опрос: ${error}`);
    }

    const data = await response.json();
    const id = data.id;
    this.createdIds.surveys.push(id);

    return { id, title: uniqueTitle };
  }

  /**
   * Создать группу пользователей через API
   * POST /manager/user-groups
   * @param {string} name - Название группы
   * @returns {Promise<{id: string, name: string}>}
   */
  async seedUserGroup(name) {
    if (!this.apiClient) {
      throw new Error("SeedHelper не инициализирован. Вызовите init() первым.");
    }

    const uniqueName = TestDataHelper.generateUniqueName(name || "Группа");

    const response = await this.apiClient.post("/manager/user-groups", {
      title: uniqueName,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать группу: ${error}`);
    }

    const data = await response.json();
    const id = data.id;
    this.createdIds.groups.push(id);

    return { id, name: uniqueName };
  }

  /**
   * Создать Performance Review через API
   * POST /manager/performance-reviews
   * @param {Object} options - Параметры
   * @returns {Promise<{id: string, title: string}>}
   */
  async seedPerformanceReview(options = {}) {
    if (!this.apiClient) {
      throw new Error("SeedHelper не инициализирован. Вызовите init() первым.");
    }

    const uniqueTitle = TestDataHelper.generateUniqueName(
      options.title || "Ревью",
    );

    const response = await this.apiClient.post("/manager/performance-reviews", {
      title: uniqueTitle,
      ...options,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать Performance Review: ${error}`);
    }

    const data = await response.json();
    const id = data.id;
    this.createdIds.performanceReviews.push(id);

    return { id, title: uniqueTitle };
  }

  /**
   * Получить список пользователей
   * GET /manager/users
   * @returns {Promise<Array>}
   */
  async getUsers() {
    if (!this.apiClient) {
      throw new Error("SeedHelper не инициализирован. Вызовите init() первым.");
    }

    const response = await this.apiClient.get("/manager/users");

    if (!response.ok()) {
      throw new Error("Не удалось получить список пользователей");
    }

    return response.json();
  }

  /**
   * Получить список департаментов
   * GET /manager/departments
   * @returns {Promise<Array>}
   */
  async getDepartments() {
    if (!this.apiClient) {
      throw new Error("SeedHelper не инициализирован. Вызовите init() первым.");
    }

    const response = await this.apiClient.get("/manager/departments");

    if (!response.ok()) {
      throw new Error("Не удалось получить список департаментов");
    }

    return response.json();
  }

  /**
   * Удалить департамент через API
   * DELETE /manager/departments/{id}
   * @param {string} id - ID департамента
   */
  async deleteDepartment(id) {
    if (!this.apiClient) return;

    try {
      await this.apiClient.delete(`/manager/departments/${id}`);
    } catch (error) {
      console.warn(`Не удалось удалить департамент ${id}:`, error.message);
    }
  }

  /**
   * Удалить опрос через API
   * DELETE /manager/surveys/{id}
   * @param {string} id - ID опроса
   */
  async deleteSurvey(id) {
    if (!this.apiClient) return;

    try {
      await this.apiClient.delete(`/manager/surveys/${id}`);
    } catch (error) {
      console.warn(`Не удалось удалить опрос ${id}:`, error.message);
    }
  }

  /**
   * Удалить группу пользователей через API
   * DELETE /manager/user-groups/{id}
   * @param {string} id - ID группы
   */
  async deleteUserGroup(id) {
    if (!this.apiClient) return;

    try {
      await this.apiClient.delete(`/manager/user-groups/${id}`);
    } catch (error) {
      console.warn(`Не удалось удалить группу ${id}:`, error.message);
    }
  }

  /**
   * Удалить Performance Review через API
   * DELETE /manager/performance-reviews/{id}
   * @param {string} id - ID
   */
  async deletePerformanceReview(id) {
    if (!this.apiClient) return;

    try {
      await this.apiClient.delete(`/manager/performance-reviews/${id}`);
    } catch (error) {
      console.warn(
        `Не удалось удалить Performance Review ${id}:`,
        error.message,
      );
    }
  }

  /**
   * Очистить все созданные тестовые данные
   * Вызывать в afterEach
   */
  async cleanup() {
    if (!this.apiClient) {
      console.warn(
        "SeedHelper: apiClient не инициализирован, очистка пропущена",
      );
      return;
    }

    try {
      // Удалить опросы
      for (const id of this.createdIds.surveys) {
        await this.deleteSurvey(id);
      }

      // Удалить Performance Reviews
      for (const id of this.createdIds.performanceReviews) {
        await this.deletePerformanceReview(id);
      }

      // Удалить группы
      for (const id of this.createdIds.groups) {
        await this.deleteUserGroup(id);
      }

      // Удалить департаменты
      for (const id of this.createdIds.departments) {
        await this.deleteDepartment(id);
      }

      // Очистить массивы
      this.createdIds = {
        surveys: [],
        departments: [],
        groups: [],
        users: [],
        feedbacks: [],
        objectives: [],
        performanceReviews: [],
      };
    } catch (error) {
      console.error("Ошибка при очистке тестовых данных:", error);
    }
  }

  /**
   * Получить все созданные ID определённого типа
   * @param {'surveys'|'departments'|'groups'|'users'|'feedbacks'|'objectives'|'performanceReviews'} type
   * @returns {Array<string>}
   */
  getCreatedIds(type) {
    return this.createdIds[type] || [];
  }
}
