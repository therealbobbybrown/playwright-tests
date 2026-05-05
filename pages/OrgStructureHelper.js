// pages/OrgStructureHelper.js
// Вспомогательный класс для получения списков отделов и групп из орг структуры
// и управления ими (создание, удаление, управление составом)
import { BasePage } from "./BasePage.js";
import { StructureDepartmentsPage } from "./StructureDepartmentsPage.js";
import { StructureUserGroupsPage } from "./StructureUserGroupsPage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class OrgStructureHelper extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);
    this.createdDepartments = []; // Список созданных отделов для очистки
    this.createdGroups = []; // Список созданных групп для очистки
  }

  /**
   * Получить список пользователей из списка сотрудников
   * @param {number} limit - максимальное количество пользователей
   * @returns {Promise<Array<{name: string, email: string}>>}
   */
  async getUsersList(limit = 10) {
    return this._step(
      `Получить список пользователей (до ${limit})`,
      async () => {
        const { StructureUsersPage } = await import("./StructureUsersPage.js");
        const usersPage = new StructureUsersPage(this.page, this.testInfo);

        // Используем метод openFromSideMenu, который уже работает в других тестах
        // Он правильно обрабатывает авторизацию и переход через меню
        await usersPage.openFromSideMenu();

        // Ждём загрузки таблицы
        await usersPage.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        const rows = usersPage.tableRows;
        await rows
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const count = Math.min(await rows.count(), limit);
        const users = [];

        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);

          // Email находится в элементе с классом User_email__CBqM1 (из HTML структуры)
          const emailElement = row.locator(".User_email__CBqM1").first();
          const email = (
            await emailElement.textContent().catch(() => "")
          ).trim();

          // Имя находится в элементе с классом User_full-name__aHxgT
          const nameElement = row.locator(".User_full-name__aHxgT").first();
          const name = (await nameElement.textContent().catch(() => "")).trim();

          if (email) {
            users.push({ name: name || email, email });
          }
        }

        if (users.length === 0) {
          throw new Error(
            "Не удалось получить список пользователей из таблицы",
          );
        }

        return users;
      },
    );
  }

  /**
   * Получить список отделов со страницы структуры
   * @param {SurveyPublicationSettingsPage} publicationSettingsPage - не используется, оставлен для совместимости
   * @returns {Promise<string[]>}
   */
  async getDepartmentsListFromUserQuerySelect(
    publicationSettingsPage,
    useAPI = false,
  ) {
    console.log(
      `[DEBUG] getDepartmentsListFromUserQuerySelect вызван с useAPI=${useAPI}`,
    );
    // Используем существующий метод getDepartmentsList, который получает список со страницы структуры
    // По умолчанию используем UI, но можно использовать API через параметр useAPI
    const result = await this.getDepartmentsList(useAPI);
    console.log(
      `[DEBUG] getDepartmentsListFromUserQuerySelect вернул ${result.length} отделов`,
    );
    return result;
  }

  /**
   * Получить список отделов через API
   * @returns {Promise<string[]>}
   */
  /**
   * Определить базовый URL API на основе BASE_URL
   * Использует ту же логику, что и тесты безопасности
   */
  _inferApiBaseUrl() {
    const apiBaseOverride = process.env.API_BASE_URL;
    if (apiBaseOverride) return apiBaseOverride.replace(/\/+$/, "");

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) return null;

    try {
      const base = new URL(baseUrl);
      if (base.host.startsWith("client.")) {
        return `${base.protocol}//api.${base.host.slice("client.".length)}`;
      }
      return base.origin;
    } catch {
      return null;
    }
  }

  /**
   * Получить заголовки авторизации для API запросов
   * Использует ту же логику, что и тесты безопасности (с токенами)
   */
  async _getAuthHeaders() {
    const context = this.page.context();
    const cookies = await context.cookies();

    // Пытаемся найти токен в localStorage/sessionStorage
    const pickToken = (storage) => {
      if (!storage) return null;
      for (const [key, value] of Object.entries(storage)) {
        if (
          key.toLowerCase().includes("token") ||
          key.toLowerCase().includes("auth")
        ) {
          try {
            const parsed =
              typeof value === "string" ? JSON.parse(value) : value;
            if (typeof parsed === "string") return parsed;
            if (parsed?.accessToken) return parsed.accessToken;
            if (parsed?.token) return parsed.token;
          } catch {
            // ignore JSON parse errors
          }
        }
      }
      return null;
    };

    // Получаем storage из страницы
    let token = null;
    try {
      const storage = await this.page.evaluate(() => {
        return {
          local: { ...localStorage },
          session: { ...sessionStorage },
        };
      });
      token = pickToken(storage.local) ?? pickToken(storage.session);
    } catch {
      // ignore errors
    }

    // Если токен не найден в storage, ищем в cookies
    if (!token) {
      token = cookies
        .map((cookie) => {
          if (
            cookie.name.toLowerCase().includes("access_token") &&
            /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(
              cookie.value,
            )
          ) {
            return cookie.value;
          }
          return null;
        })
        .find(Boolean);
    }

    const cookieHeader = cookies.length
      ? cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
      : null;

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    return headers;
  }

  async getDepartmentsListFromAPI() {
    return this._step("Получить список отделов через API", async () => {
      // Определяем базовый URL API (используем ту же логику, что и тесты безопасности)
      let apiBase = this._inferApiBaseUrl();

      if (!apiBase) {
        console.error("[API] Не удалось определить базовый URL API");
        console.log("[API] Переключаемся на UI метод получения отделов");
        return this.getDepartmentsList(false);
      }

      console.log(
        `[API] Получаем список отделов из ${apiBase}/manager/org-struct/tree/departments/root/info/`,
      );

      // Получаем заголовки авторизации
      const headers = await this._getAuthHeaders();

      // Используем правильный endpoint для получения структуры отделов
      const response = await this.page.request.get(
        `${apiBase}/manager/org-struct/tree/departments/root/info/`,
        {
          headers,
          failOnStatusCode: false,
          timeout: TIMEOUTS.MEDIUM,
        },
      );

      if (!response || !response.ok()) {
        const status = response?.status() || "unknown";
        const statusText = response?.statusText() || "no response";
        console.error(
          `[API] Ошибка получения отделов: ${status} ${statusText}`,
        );
        // Если API не работает, возвращаемся к UI методу
        console.log("[API] Переключаемся на UI метод получения отделов");
        return this.getDepartmentsList(false);
      }

      const data = await response.json();
      console.log(
        `[API] Получены данные отделов (первые 500 символов):`,
        JSON.stringify(data).substring(0, 500),
      );
      console.log(
        `[API] Тип данных:`,
        Array.isArray(data) ? "массив" : typeof data,
      );
      console.log(
        `[API] Ключи в объекте:`,
        typeof data === "object" && !Array.isArray(data)
          ? Object.keys(data).join(", ")
          : "N/A",
      );

      // Рекурсивно извлекаем ID отделов из дерева
      const extractDepartmentIds = (node, ids = []) => {
        if (!node) return ids;

        // Если это массив, обрабатываем каждый элемент
        if (Array.isArray(node)) {
          for (const item of node) {
            extractDepartmentIds(item, ids);
          }
          return ids;
        }

        // Если это отдел, добавляем его ID
        if (node.entityType === "department" && node.departmentId) {
          if (!ids.includes(node.departmentId)) {
            ids.push(node.departmentId);
          }
        }

        // Рекурсивно обрабатываем дочерние элементы
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            extractDepartmentIds(child, ids);
          }
        }

        return ids;
      };

      // Извлекаем ID всех отделов
      const departmentIds = extractDepartmentIds(data);
      console.log(
        `[API] Найдено ${departmentIds.length} отделов по ID:`,
        departmentIds,
      );

      // Получаем названия отделов по ID через отдельные запросы
      const departmentNames = [];
      for (const deptId of departmentIds) {
        try {
          const deptResponse = await this.page.request.get(
            `${apiBase}/manager/org-struct/tree/departments/department/${deptId}/info/`,
            {
              headers,
              failOnStatusCode: false,
              timeout: TIMEOUTS.SHORT,
            },
          );

          if (deptResponse && deptResponse.ok()) {
            const deptData = await deptResponse.json();
            console.log(
              `[API] Данные отдела ${deptId}:`,
              JSON.stringify(deptData).substring(0, 200),
            );
            const name =
              deptData.name ||
              deptData.title ||
              deptData.label ||
              deptData.departmentName;
            if (name && !departmentNames.includes(name)) {
              departmentNames.push(name);
              console.log(`[API] Добавлен отдел: ${name}`);
            } else {
              console.warn(
                `[API] Не найдено название для отдела ${deptId}, ключи:`,
                Object.keys(deptData).join(", "),
              );
            }
          } else {
            const status = deptResponse?.status() || "unknown";
            console.warn(`[API] Ошибка получения отдела ${deptId}: ${status}`);
          }
        } catch (error) {
          console.warn(
            `[API] Не удалось получить название отдела ${deptId}:`,
            error.message,
          );
        }
      }

      console.log(
        `[API] Извлечено ${departmentNames.length} отделов:`,
        departmentNames,
      );
      // Если API ничего не вернул или вернул пустой список - fallback на UI
      if (!departmentNames.length) {
        console.log("[API] Не нашли отделов через API, переключаемся на UI");
        return this.getDepartmentsList(false);
      }

      return departmentNames;
    });
  }

  /**
   * Получить список групп через API
   * @returns {Promise<string[]>}
   */
  async getGroupsListFromAPI() {
    return this._step("Получить список групп через API", async () => {
      // Определяем базовый URL API (используем ту же логику, что и тесты безопасности)
      let apiBase = this._inferApiBaseUrl();

      // Если не удалось определить, пробуем альтернативные варианты
      if (!apiBase && process.env.BASE_URL) {
        const baseUrl = process.env.BASE_URL.replace(/\/$/, "");
        apiBase = baseUrl.includes("/api") ? baseUrl : `${baseUrl}/api`;
      }

      if (!apiBase) {
        console.error("[API] Не удалось определить базовый URL API");
        console.log("[API] Переключаемся на UI метод получения групп");
        return this.getGroupsListFromPage();
      }

      console.log(
        `[API] Получаем список групп из ${apiBase}/manager/user-groups`,
      );

      // Получаем заголовки авторизации
      const headers = await this._getAuthHeaders();

      // Пробуем разные варианты endpoint для групп
      let response = await this.page.request.get(
        `${apiBase}/manager/user-groups`,
        {
          headers,
          failOnStatusCode: false,
          timeout: TIMEOUTS.MEDIUM,
        },
      );

      // Если 404, пробуем альтернативный endpoint
      if (response.status() === 404) {
        console.log(
          `[API] Endpoint /manager/user-groups вернул 404, пробуем /manager/groups`,
        );
        response = await this.page.request.get(`${apiBase}/manager/groups`, {
          headers,
          failOnStatusCode: false,
          timeout: TIMEOUTS.MEDIUM,
        });
      }

      // Если все еще 404, пробуем через структуру
      if (response.status() === 404) {
        console.log(
          `[API] Endpoint /manager/groups вернул 404, пробуем /manager/structure/user-groups`,
        );
        response = await this.page.request.get(
          `${apiBase}/manager/structure/user-groups`,
          {
            headers,
            failOnStatusCode: false,
            timeout: TIMEOUTS.MEDIUM,
          },
        );
      }

      if (!response.ok()) {
        console.error(
          `[API] Ошибка получения групп: ${response.status()} ${response.statusText()}`,
        );
        // Если API не работает, возвращаемся к UI методу
        console.log("[API] Переключаемся на UI метод получения групп");
        return this.getGroupsListFromPage();
      }

      const data = await response.json();
      console.log(
        `[API] Получены данные групп:`,
        JSON.stringify(data).substring(0, 200),
      );

      // API может возвращать данные в разных форматах: массив, объект с items/rows/results
      const groups = Array.isArray(data)
        ? data
        : data?.items || data?.rows || data?.results || data?.data || [];

      const groupNames = groups
        .map((group) => group?.name || group?.title || group?.label)
        .filter(Boolean)
        .filter((name, index, self) => self.indexOf(name) === index); // Убираем дубликаты

      console.log(`[API] Извлечено ${groupNames.length} групп:`, groupNames);
      return groupNames;
    });
  }

  /**
   * Получить список групп через API (старая версия, не используется)
   */
  async _getGroupsListFromAPIOld() {
    return this._step("Получить список групп через API", async () => {
      // Определяем базовый URL API
      let apiBase = process.env.API_BASE_URL;
      if (!apiBase && process.env.BASE_URL) {
        const baseUrl = process.env.BASE_URL.replace(/\/$/, "");
        // Пробуем разные варианты API base URL
        apiBase = baseUrl.includes("/api") ? baseUrl : `${baseUrl}/api`;
      }
      if (!apiBase) {
        // Если API не настроен, пробуем использовать базовый URL напрямую
        apiBase =
          process.env.BASE_URL?.replace(/\/$/, "") ||
          "https://api.app-raise.org";
      }

      // Получаем cookies из текущего контекста
      const cookies = await this.page.context().cookies();
      const cookieHeader = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");

      const response = await this.page.request.get(
        `${apiBase}/manager/user-groups`,
        {
          headers: {
            Cookie: cookieHeader,
          },
        },
      );

      if (!response.ok()) {
        throw new Error(
          `Failed to fetch groups: ${response.status()} ${response.statusText()}`,
        );
      }

      const data = await response.json();
      // API может возвращать данные в разных форматах: массив, объект с items/rows/results
      const groups = Array.isArray(data)
        ? data
        : data?.items || data?.rows || data?.results || data?.data || [];

      return groups
        .map((group) => group?.name || group?.title || group?.label)
        .filter(Boolean)
        .filter((name, index, self) => self.indexOf(name) === index); // Убираем дубликаты
    });
  }

  /**
   * Получить список всех отделов из дерева отделов
   * @param {boolean} useAPI - использовать API вместо UI (по умолчанию false)
   * @returns {Promise<string[]>}
   */
  async getDepartmentsList(useAPI = false) {
    if (useAPI) {
      console.log("[API] Используем API для получения списка отделов");
      return this.getDepartmentsListFromAPI();
    }
    console.log("[UI] Используем UI для получения списка отделов");
    return this._step("Получить список отделов из орг структуры", async () => {
      const sideMenu = new SideMenu(this.page, this.testInfo);
      const departmentsPage = new StructureDepartmentsPage(
        this.page,
        this.testInfo,
      );

      // Открываем страницу отделов
      await sideMenu.openStructureDepartments();
      await departmentsPage.assertOpened();

      // Ждём загрузки дерева отделов
      await departmentsPage.treeMenu.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      // Получаем только ссылки на отделы (исключаем элементы интерфейса)
      const treeItems = departmentsPage.treeMenu
        .locator(
          'a[href*="/departments/department/"], a[href*="/departments/root/"]',
        )
        .filter({ hasNotText: /Настройка отделов/i });

      const count = await treeItems.count();
      const departments = [];

      for (let i = 0; i < count; i++) {
        const item = treeItems.nth(i);
        const text = (await item.textContent()).trim();

        // Пропускаем пустые элементы, технические названия и элементы интерфейса
        if (
          text &&
          text.length > 0 &&
          !text.includes("Outside") &&
          !text.includes("Вне структуры") &&
          text !== "Настройка отделов" &&
          text !== "Сотрудники" &&
          text !== "Отделы" &&
          text !== "Группы" &&
          text !== "Сбросить все" &&
          text !== "Посмотреть выбранных" &&
          text !== "Применить" &&
          !text.match(
            /^(Сотрудники|Отделы|Группы|Сбросить все|Посмотреть выбранных|Применить)$/i,
          )
        ) {
          // Извлекаем название отдела (убираем лишние символы и числа в скобках)
          const cleanName = text
            .replace(/\s*\(\d+\)\s*$/, "") // Убираем числа в скобках в конце
            .trim();

          if (
            cleanName &&
            cleanName.length > 0 &&
            !departments.includes(cleanName)
          ) {
            departments.push(cleanName);
          }
        }
      }

      // Также получаем отделы из секции "Отделы" в основной области
      const departmentsSection = departmentsPage.departmentsSection;
      const sectionVisible = await departmentsSection
        .isVisible()
        .catch(() => false);

      if (sectionVisible) {
        const sectionItems = departmentsSection.locator(
          'a[href*="/departments/department/"], div[class*="SectionDepartments_item"]',
        );
        const sectionCount = await sectionItems.count();

        for (let i = 0; i < sectionCount; i++) {
          const item = sectionItems.nth(i);
          const text = (await item.textContent()).trim();
          const cleanName = text.replace(/\s*\(\d+\)\s*$/, "").trim();

          if (cleanName && !departments.includes(cleanName)) {
            departments.push(cleanName);
          }
        }
      }

      return departments.filter((d) => d.length > 0);
    });
  }

  /**
   * Получить список групп из страницы управления группами
   * @returns {Promise<string[]>}
   */
  async getGroupsListFromPage() {
    return this._step(
      "Получить список групп из страницы управления группами",
      async () => {
        const groupsPage = new StructureUserGroupsPage(
          this.page,
          this.testInfo,
        );
        await groupsPage.openFromSideMenu();
        await groupsPage.assertOpened();
        return await groupsPage.getGroupsList();
      },
    );
  }

  /**
   * Получить список групп со страницы структуры
   * @param {SurveyPublicationSettingsPage} publicationSettingsPage - если передан, берём группы прямо из модалки UserQuerySelect на вкладке "Группы" (видны имя и численность)
   * @returns {Promise<string[]>}
   */
  async getGroupsListFromUserQuerySelect(
    publicationSettingsPage = null,
    useAPI = false,
  ) {
    // Сначала пробуем API, если разрешено, но при пустом ответе падаем в UI
    if (useAPI) {
      const apiGroups = await this.getGroupsListFromAPI().catch(() => []);
      if (apiGroups?.length) return apiGroups;
    }

    // Если есть страница настроек публикации — читаем список прямо из модалки "Кто участвует в опросе" -> вкладка "Группы"
    if (publicationSettingsPage) {
      return this._step(
        'Получить список групп из модалки UserQuerySelect (вкладка "Группы")',
        async () => {
          // Открываем модалку выбора получателей
          await publicationSettingsPage.assertParticipantsBlockVisible();
          await publicationSettingsPage.receiversEditButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await publicationSettingsPage.receiversEditButton.click();

          const modal = this.page
            .locator(
              `[class*="UserQuerySelect_modal"], ${SELECTORS.SHEET_MODAL}, [role="dialog"]`,
            )
            .first();
          await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Переходим на вкладку "Группы"
          const groupsTab = modal
            .getByRole("button", { name: /группы/i })
            .or(modal.locator("button").filter({ hasText: /Группы/i }))
            .first();
          await groupsTab.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await groupsTab.click();

          // Wait for tab content to load and get rows
          const rows = modal.locator('[class*="GroupOption_row"]');
          await rows
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          const count = await rows.count();
          const groups = [];

          for (let i = 0; i < count; i++) {
            const row = rows.nth(i);
            const name = (
              await row
                .locator('[class*="GroupOption_name"]')
                .textContent()
                .catch(() => "")
            ).trim();
            const jobText = (
              await row
                .locator('[class*=\"GroupOption_job\"]')
                .textContent()
                .catch(() => "")
            ).trim();

            const usersCountMatch = jobText.match(/(\d+)\s+сотрудник/);
            const usersCount = usersCountMatch
              ? parseInt(usersCountMatch[1], 10)
              : null;

            if (name) {
              groups.push({ name, usersCount });
            }
          }

          if (!groups.length) {
            console.warn(
              "Не удалось получить группы из модалки, пробуем через страницу управления группами",
            );
            return await this.getGroupsListFromPage();
          }

          console.log("Группы из модалки UserQuerySelect:", groups);
          return groups.map((g) => g.name);
        },
      );
    }

    // Фолбэк: получаем группы со страницы управления группами
    return this._step(
      "Получить список групп со страницы структуры",
      async () => {
        const groupsPage = new StructureUserGroupsPage(
          this.page,
          this.testInfo,
        );
        await groupsPage.openFromSideMenu();
        await groupsPage.assertOpened();
        return await groupsPage.getGroupsList();
      },
    );
  }

  /**
   * Получить список групп через UserQuerySelect в настройках опроса
   * Открывает модальное окно UserQuerySelect и получает список групп из вкладки "Группы"
   * @param {boolean} cleanup - удалить временный опрос после получения списка
   * @returns {Promise<string[]>}
   * @deprecated Используйте getGroupsListFromUserQuerySelect вместо этого метода
   */
  async getGroupsList(cleanup = true) {
    return this.getGroupsListFromUserQuerySelect(null);
  }

  /**
   * Получить список отделов через UserQuerySelect (старый метод, не используется)
   * @deprecated Используйте getDepartmentsListFromUserQuerySelect(publicationSettingsPage, useAPI) вместо этого
   * @returns {Promise<string[]>}
   */
  async _getDepartmentsListFromUserQuerySelectOld() {
    return this._step(
      "Получить список отделов через UserQuerySelect (старый метод)",
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        const { SurveysListPage } = await import("./SurveysListPage.js");
        const { SurveyConstructorPage } = await import(
          "./SurveyConstructorPage.js"
        );
        const { SurveyPublicationSettingsPage } = await import(
          "./SurveyPublicationSettingsPage.js"
        );

        const surveysListPage = new SurveysListPage(this.page, this.testInfo);
        const constructorPage = new SurveyConstructorPage(
          this.page,
          this.testInfo,
        );
        const publicationSettingsPage = new SurveyPublicationSettingsPage(
          this.page,
          this.testInfo,
        );

        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
        await surveysListPage.createBlankSurveyFromList();
        await constructorPage.assertOpened();
        await constructorPage.goToPublicationSettings();
        await publicationSettingsPage.assertOpened();
        await publicationSettingsPage.selectAudienceInternal();
        await publicationSettingsPage.assertParticipantsBlockVisible();

        await publicationSettingsPage.receiversSelect.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await publicationSettingsPage.receiversSelect.click();

        const modal = this.page
          .locator(
            `[class*="UserQuerySelect_modal"], ${SELECTORS.SHEET_MODAL}, [role="dialog"]`,
          )
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const departmentsTab = modal
          .getByRole("button", { name: /отделы/i })
          .or(
            modal.locator('[class*="Tabs_tab"]').filter({ hasText: /отделы/i }),
          )
          .first();

        const tabVisible = await departmentsTab.isVisible().catch(() => false);
        if (!tabVisible) {
          await this.page.keyboard.press("Escape").catch(() => {});
          return [];
        }

        await departmentsTab.click();

        const departmentItems = modal.locator(
          '[class*="Departments_item"], [role="option"], div[class*="item"], button',
        );
        await departmentItems
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        const count = await departmentItems.count();
        const departments = [];

        for (let i = 0; i < count; i++) {
          const item = departmentItems.nth(i);
          const text = (await item.textContent()).trim();

          if (
            text &&
            text.length > 0 &&
            !text.includes("Все") &&
            !text.includes("All")
          ) {
            const cleanName = text.replace(/\s*\(\d+\)\s*$/, "").trim();
            if (cleanName && !departments.includes(cleanName)) {
              departments.push(cleanName);
            }
          }
        }

        await this.page.keyboard.press("Escape").catch(() => {});
        await modal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        return departments.filter((d) => d.length > 0);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Создание и удаление отделов
  // ---------------------------------------------------------------------------

  /**
   * Создать отдел
   * @param {string} departmentName - название отдела
   * @returns {Promise<string>} - название созданного отдела
   */
  async createDepartment(departmentName) {
    return this._step(`Создать отдел "${departmentName}"`, async () => {
      const departmentsPage = new StructureDepartmentsPage(
        this.page,
        this.testInfo,
      );
      const sideMenu = new SideMenu(this.page, this.testInfo);

      await sideMenu.openStructureDepartments();
      await departmentsPage.assertOpened();

      // Создаём отдел
      await departmentsPage.createDepartmentAndOpen();

      // Переименовываем
      await departmentsPage.renameOpenedDepartment(departmentName);

      // Сохраняем для возможной очистки
      this.createdDepartments.push(departmentName);

      return departmentName;
    });
  }

  /**
   * Удалить отдел по названию
   * @param {string} departmentName - название отдела
   */
  async deleteDepartment(departmentName) {
    return this._step(`Удалить отдел "${departmentName}"`, async () => {
      const departmentsPage = new StructureDepartmentsPage(
        this.page,
        this.testInfo,
      );
      const sideMenu = new SideMenu(this.page, this.testInfo);

      await sideMenu.openStructureDepartments();
      await departmentsPage.assertOpened();

      // Ищем отдел в дереве и открываем его
      const treeItems = departmentsPage.treeMenu.locator(
        'div[class*="TreeItem_item"], a[href*="/departments/department/"]',
      );
      const count = await treeItems.count();

      let found = false;
      for (let i = 0; i < count; i++) {
        const item = treeItems.nth(i);
        const text = (await item.textContent()).trim();
        if (text.includes(departmentName)) {
          const link = item.locator("a").first();
          await link.click();
          // Wait for department details to load
          await departmentsPage.departmentDetailsSection
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error(`Отдел "${departmentName}" не найден`);
      }

      // Удаляем отдел
      await departmentsPage.deleteOpenedDepartment();
      // Wait for deletion to complete (department details should be hidden)
      await departmentsPage.departmentDetailsSection
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Удаляем из списка созданных
      const index = this.createdDepartments.indexOf(departmentName);
      if (index > -1) {
        this.createdDepartments.splice(index, 1);
      }
    });
  }

  /**
   * Добавить пользователей в отдел
   * @param {string} departmentName - название отдела
   * @param {number} count - количество пользователей для добавления
   */
  async addUsersToDepartment(departmentName, count = 1) {
    return this._step(
      `Добавить ${count} пользователей в отдел "${departmentName}"`,
      async () => {
        const departmentsPage = new StructureDepartmentsPage(
          this.page,
          this.testInfo,
        );
        const sideMenu = new SideMenu(this.page, this.testInfo);

        await sideMenu.openStructureDepartments();
        await departmentsPage.assertOpened();

        // Находим и открываем отдел
        const treeItems = departmentsPage.treeMenu.locator(
          'div[class*="TreeItem_item"], a[href*="/departments/department/"]',
        );
        const itemsCount = await treeItems.count();

        let found = false;
        for (let i = 0; i < itemsCount; i++) {
          const item = treeItems.nth(i);
          const text = (await item.textContent()).trim();
          if (text.includes(departmentName)) {
            const link = item.locator("a").first();
            await link.click();
            // Wait for department details to load
            await departmentsPage.departmentEmployeesSection
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
            found = true;
            break;
          }
        }

        if (!found) {
          throw new Error(`Отдел "${departmentName}" не найден`);
        }

        // Добавляем пользователей
        for (let j = 0; j < count; j++) {
          const prevCount =
            await departmentsPage.departmentEmployeeCards.count();
          await departmentsPage.addFirstEmployeeToDepartment();
          // Wait for new employee card to appear
          await departmentsPage.departmentEmployeeCards
            .nth(prevCount)
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .catch(() => {});
        }
      },
    );
  }

  /**
   * Установить количество пользователей в отделе (добавить или удалить до нужного количества)
   * @param {string} departmentName - название отдела
   * @param {number} targetCount - целевое количество пользователей
   */
  async setDepartmentUsersCount(departmentName, targetCount) {
    return this._step(
      `Установить количество пользователей в отделе "${departmentName}" равным ${targetCount}`,
      async () => {
        const departmentsPage = new StructureDepartmentsPage(
          this.page,
          this.testInfo,
        );
        const sideMenu = new SideMenu(this.page, this.testInfo);

        await sideMenu.openStructureDepartments();
        await departmentsPage.assertOpened();

        // Находим и открываем отдел
        const treeItems = departmentsPage.treeMenu.locator(
          'div[class*="TreeItem_item"], a[href*="/departments/department/"]',
        );
        const itemsCount = await treeItems.count();

        let found = false;
        for (let i = 0; i < itemsCount; i++) {
          const item = treeItems.nth(i);
          const text = (await item.textContent()).trim();
          if (text.includes(departmentName)) {
            const link = item.locator("a").first();
            await link.click();
            // Wait for department employees section to load
            await departmentsPage.departmentEmployeesSection
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
            found = true;
            break;
          }
        }

        if (!found) {
          throw new Error(`Отдел "${departmentName}" не найден`);
        }

        // Получаем текущее количество пользователей
        await departmentsPage.departmentEmployeesSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        const currentCount =
          await departmentsPage.departmentEmployeeCards.count();

        if (currentCount < targetCount) {
          // Добавляем пользователей
          const toAdd = targetCount - currentCount;
          for (let j = 0; j < toAdd; j++) {
            const prevCount =
              await departmentsPage.departmentEmployeeCards.count();
            await departmentsPage.addFirstEmployeeToDepartment();
            // Wait for new employee card to appear
            await departmentsPage.departmentEmployeeCards
              .nth(prevCount)
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          }
        } else if (currentCount > targetCount) {
          // Удаляем пользователей (если есть такая функциональность)
          // Пока просто предупреждаем
          console.warn(
            `В отделе "${departmentName}" ${currentCount} пользователей, требуется ${targetCount}. Удаление пользователей не реализовано.`,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Создание и удаление групп
  // ---------------------------------------------------------------------------

  /**
   * Создать группу пользователей
   * @param {string} groupName - название группы
   * @returns {Promise<string>} - название созданной группы
   */
  async createGroup(groupName) {
    return this._step(`Создать группу "${groupName}"`, async () => {
      const groupsPage = new StructureUserGroupsPage(this.page, this.testInfo);
      await groupsPage.openFromSideMenu();
      await groupsPage.assertOpened();

      const createdName = await groupsPage.createGroup(groupName);

      // Сохраняем для возможной очистки
      this.createdGroups.push(createdName);

      // Wait for group to be saved and visible in the list
      await groupsPage.groupItems
        .filter({ hasText: createdName })
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      return createdName;
    });
  }

  /**
   * Удалить группу по названию
   * @param {string} groupName - название группы
   */
  async deleteGroup(groupName) {
    return this._step(`Удалить группу "${groupName}"`, async () => {
      const groupsPage = new StructureUserGroupsPage(this.page, this.testInfo);
      await groupsPage.openFromSideMenu();
      await groupsPage.assertOpened();

      await groupsPage.openGroupByName(groupName);
      await groupsPage.deleteGroup();
      // Wait for group to be removed from the list
      await groupsPage.groupItems
        .filter({ hasText: groupName })
        .first()
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Удаляем из списка созданных
      const index = this.createdGroups.indexOf(groupName);
      if (index > -1) {
        this.createdGroups.splice(index, 1);
      }
    });
  }

  /**
   * Добавить пользователей в группу
   * @param {string} groupName - название группы
   * @param {number} count - количество пользователей для добавления
   */
  async addUsersToGroup(groupName, count = 1) {
    return this._step(
      `Добавить ${count} пользователей в группу "${groupName}"`,
      async () => {
        const groupsPage = new StructureUserGroupsPage(
          this.page,
          this.testInfo,
        );
        await groupsPage.openFromSideMenu();
        await groupsPage.assertOpened();

        await groupsPage.openGroupByName(groupName);
        await groupsPage.addUsersToGroup(count);
      },
    );
  }

  /**
   * Добавить конкретных пользователей в группу по email
   * @param {string} groupName
   * @param {string[]} emails
   */
  async addUsersToGroupByEmails(groupName, emails = []) {
    if (!emails?.length) return;

    return this._step(
      `Добавить пользователей по email в группу "${groupName}": ${emails.join(", ")}`,
      async () => {
        const groupsPage = new StructureUserGroupsPage(
          this.page,
          this.testInfo,
        );
        await groupsPage.openFromSideMenu();
        await groupsPage.openGroupByName(groupName);
        await groupsPage.addUsersToGroupByEmails(emails);
      },
    );
  }

  /**
   * Установить количество пользователей в группе (добавить до нужного количества)
   * Использует подход с получением пользователей и добавлением их по email
   * @param {string} groupName - название группы
   * @param {number} targetCount - целевое количество пользователей
   */
  async setGroupUsersCount(groupName, targetCount) {
    return this._step(
      `Установить количество пользователей в группе "${groupName}" равным ${targetCount}`,
      async () => {
        const groupsPage = new StructureUserGroupsPage(
          this.page,
          this.testInfo,
        );

        // Открываем страницу групп через боковое меню
        await groupsPage.openFromSideMenu();
        await groupsPage.assertOpened();

        // Ждём загрузки меню групп
        await groupsPage.groupItems
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        // Открываем нужную группу
        await groupsPage.openGroupByName(groupName);

        // Ждём загрузки деталей группы (wait for users section to appear)
        await groupsPage.usersSection
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        // Получаем текущее количество пользователей
        let currentCount = 0;
        try {
          currentCount = await groupsPage.getUsersCountInGroup();
        } catch (error) {
          console.warn(
            `Не удалось получить количество пользователей в группе "${groupName}":`,
            error.message,
          );
          // Предполагаем, что в группе уже есть достаточно пользователей
          console.log(
            `Пропускаем добавление пользователей в группу "${groupName}"`,
          );
          return;
        }

        console.log(
          `Группа "${groupName}": текущее количество пользователей = ${currentCount}, требуется = ${targetCount}`,
        );

        // Если пользователей уже достаточно или больше - ничего не делаем
        if (currentCount >= targetCount) {
          console.log(
            `Группа "${groupName}" уже имеет достаточно пользователей: ${currentCount}`,
          );
          return;
        }

        // Если пользователей меньше - пытаемся добавить
        try {
          const existingEmails = await groupsPage.getGroupUserEmails();
          const neededCount = targetCount - currentCount;
          const activeUsers = await this.getUsersList(neededCount * 2);

          if (activeUsers.length < neededCount) {
            console.warn(
              `Недостаточно активных пользователей для добавления в группу. ` +
                `Требуется ${neededCount}, доступно ${activeUsers.length}. Пропускаем добавление.`,
            );
            return;
          }

          const usersToAdd = activeUsers
            .map((u) => u.email.toLowerCase())
            .filter((email) => !existingEmails.includes(email))
            .slice(0, neededCount);

          if (usersToAdd.length === 0) {
            console.warn(
              `Все доступные пользователи уже находятся в группе "${groupName}". ` +
                `Текущее количество: ${currentCount}`,
            );
            return;
          }

          console.log(
            `Добавляем ${usersToAdd.length} пользователей в группу "${groupName}"`,
          );
          await groupsPage.addUsersToGroupByEmails(usersToAdd);
          // Wait for users to be added to the group (wait for user cards to appear)
          const expectedCount = currentCount + usersToAdd.length;
          await groupsPage.userCards
            .nth(expectedCount - 1)
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .catch(() => {});

          const afterEmails = await groupsPage.getGroupUserEmails();
          const addedCount = usersToAdd.filter((email) =>
            afterEmails.includes(email),
          ).length;
          console.log(
            `Успешно добавлено ${addedCount} из ${usersToAdd.length} пользователей в группу "${groupName}"`,
          );
        } catch (error) {
          console.warn(
            `Ошибка при добавлении пользователей в группу "${groupName}":`,
            error.message,
          );
          console.log(`Продолжаем выполнение теста`);
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Очистка созданных сущностей
  // ---------------------------------------------------------------------------

  /**
   * Удалить все созданные отделы и группы
   */
  async cleanup() {
    return this._step("Удалить все созданные отделы и группы", async () => {
      // Удаляем группы
      for (const groupName of [...this.createdGroups]) {
        try {
          await this.deleteGroup(groupName);
        } catch (error) {
          console.warn(
            `Не удалось удалить группу "${groupName}":`,
            error.message,
          );
        }
      }

      // Удаляем отделы
      for (const deptName of [...this.createdDepartments]) {
        try {
          await this.deleteDepartment(deptName);
        } catch (error) {
          console.warn(
            `Не удалось удалить отдел "${deptName}":`,
            error.message,
          );
        }
      }
    });
  }
}
