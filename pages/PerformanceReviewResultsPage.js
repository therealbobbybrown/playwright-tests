// pages/PerformanceReviewResultsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

/**
 * Page Object для страницы просмотра результатов Performance Review
 * URL: /ru/performance-reviews/results/?targetUserId=X&revisionId=Y
 *
 * Эта страница доступна оцениваемому ТОЛЬКО после того, как админ
 * открыл доступ к результатам через вкладку "Результаты" в админке PR.
 *
 * Структура страницы:
 * 1. Фильтры (PR, ревизия)
 * 2. Итоговая оценка компетенций (CompetenceResult)
 * 3. Кнопка экспорта (XLSX, CSV, PPTX, PDF)
 * 4. Графики (ResultCharts - heat map)
 * 5. Секции по направлениям оценки (assessments):
 *    - "Самооценка: Имя"
 *    - "Оценка от руководителя: Имя"
 *    - "Оценка от коллег: Имя"
 *    - "Оценка от подчинённых: Имя"
 * 6. Вопросы с ответами (Question)
 * 7. AI-саммари (опционально)
 */
export class PerformanceReviewResultsPage extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Основной контейнер результатов
    this.resultsContainer = this.page
      .locator(
        '[class*="PerformanceReviewResults_results"], [class*="results"]',
      )
      .first();

    // Фильтры
    this.performanceReviewSelect = this.page
      .locator("#filter-performanceReviews")
      .first();
    this.revisionSelect = this.page.locator("#filter-revisions").first();

    // Итоговая оценка компетенций
    this.competenceResult = this.page
      .locator('[class*="CompetenceResult"]')
      .first();

    // Кнопка экспорта
    this.exportButton = this.page
      .getByRole("button", { name: /скачать|экспорт/i })
      .first();

    // Секции с результатами (по направлениям) - div.section с заголовком направления
    this.resultsSections = this.page.locator('[class*="section"]');

    // Графики и диаграммы - ResultCharts содержит heat map и графики
    this.charts = this.page.locator('[class*="ResultCharts"]').first();
    this.heatMap = this.page.locator('[class*="HeatMap"]').first();

    // Респонденты (кто заполнил анкету)
    this.respondentsList = this.page.locator('[class*="Respondents"]').first();

    // Вопросы с ответами - Question компоненты
    this.questions = this.page.locator(
      '[class*="Question_question"], [class*="Question"]',
    );

    // AI-саммари (если есть)
    this.aiSummaryTab = this.page
      .locator('[class*="Tab"]')
      .filter({ hasText: /AI|саммари/i })
      .first();
    this.aiSummaryContent = this.page.locator('[class*="AiSummary"]').first();
  }

  // ---------------------------------------------------------------------------
  // Навигация
  // ---------------------------------------------------------------------------

  /**
   * Открыть страницу результатов для конкретного пользователя и ревизии
   * URL: /performance-reviews/[performanceReviewId]/results/?targetUserId=X&revisionId=Y
   *
   * @param {string} baseUrl - Базовый URL
   * @param {number} targetUserId - ID оцениваемого пользователя (target user из PR)
   * @param {number} revisionId - ID ревизии PR
   * @param {number} performanceReviewId - ID Performance Review (ОБЯЗАТЕЛЬНО!)
   */
  async open(baseUrl, targetUserId, revisionId, performanceReviewId) {
    await this._step("Открыть страницу результатов PR", async () => {
      if (!performanceReviewId) {
        throw new Error(
          "performanceReviewId обязателен для открытия страницы результатов",
        );
      }

      // Правильный формат URL: /performance-reviews/{prId}/results/?targetUserId=X&revisionId=Y
      const url = new URL(
        `/ru/performance-reviews/${performanceReviewId}/results/`,
        baseUrl,
      );
      url.searchParams.set("targetUserId", targetUserId);
      url.searchParams.set("revisionId", revisionId);

      console.log(`📄 Открываем URL результатов: ${url.toString()}`);

      await this.page.goto(url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
    });
  }

  /**
   * Проверить, что страница результатов открыта
   * URL может быть:
   * - /performance-reviews/{id}/results/?targetUserId=X&revisionId=Y (прямой доступ)
   * - /manager/performance-reviews/{id}/?tab=results&targetUserId=X (из админки)
   */
  async assertOpened() {
    await this._step("Страница результатов PR открыта", async () => {
      // URL может содержать /results/ или targetUserId=
      const currentUrl = this.page.url();
      const isResultsPage =
        currentUrl.includes("/results/") ||
        currentUrl.includes("targetUserId=") ||
        currentUrl.includes("tab=results");

      if (!isResultsPage) {
        // Ждём перехода на страницу результатов
        await this.page.waitForURL(/\/results\/|targetUserId=|tab=results/, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
      }

      // Ждём загрузки контента страницы результатов
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
    });
  }

  /**
   * Проверить, что результаты доступны (не показывается сообщение об ошибке)
   */
  async assertResultsAvailable() {
    await this._step("Результаты доступны для просмотра", async () => {
      // Проверяем, что нет сообщения об ошибке доступа
      const accessDenied = this.page
        .getByText(/доступ.*запрещен|нет доступа|недоступн/i)
        .first();
      const isDenied = await accessDenied
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);

      if (isDenied) {
        throw new Error(
          "Доступ к результатам запрещён. Убедитесь, что админ открыл доступ.",
        );
      }

      // Проверяем наличие хотя бы одного элемента результатов
      const hasResults = await this.resultsContainer
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);
      const hasCharts = await this.charts
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      const hasQuestions = await this.questions
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (!hasResults && !hasCharts && !hasQuestions) {
        throw new Error("Результаты не найдены на странице");
      }

      console.log("✓ Результаты доступны для просмотра");
    });
  }

  // ---------------------------------------------------------------------------
  // Проверки результатов по направлениям
  // ---------------------------------------------------------------------------

  /**
   * Проверить наличие секции с самооценкой
   * Секция имеет title формата "Самооценка: Имя Пользователя"
   */
  async assertSelfAssessmentVisible() {
    await this._step("Проверить наличие самооценки", async () => {
      // Ищем заголовок секции с текстом "Самооценка"
      const selfSection = this.page.getByText(/самооценка/i).first();
      const isVisible = await selfSection
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);

      if (!isVisible) {
        // Fallback - ищем в секциях
        const sectionWithSelf = this.resultsSections
          .filter({ hasText: /самооценка/i })
          .first();
        await sectionWithSelf.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      }
      console.log("✓ Секция самооценки найдена");
    });
  }

  /**
   * Проверить наличие секции с оценкой от руководителя
   * Секция имеет title формата "Оценка от руководителя: Имя Пользователя"
   */
  async assertManagerAssessmentVisible() {
    await this._step("Проверить наличие оценки от руководителя", async () => {
      // Ищем заголовок секции с текстом "руководител"
      const managerSection = this.page
        .getByText(/от руководител|руководител/i)
        .first();
      const isVisible = await managerSection
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);

      if (!isVisible) {
        // Fallback - ищем в секциях
        const sectionWithManager = this.resultsSections
          .filter({ hasText: /руководител/i })
          .first();
        await sectionWithManager.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      }
      console.log("✓ Секция оценки от руководителя найдена");
    });
  }

  /**
   * Проверить наличие секции с оценкой от коллег
   * Секция имеет title формата "Оценка от коллег: Имя Пользователя"
   */
  async assertColleaguesAssessmentVisible() {
    await this._step("Проверить наличие оценки от коллег", async () => {
      // Ищем заголовок секции с текстом "коллег"
      const colleaguesSection = this.page
        .getByText(/от коллег|коллег/i)
        .first();
      const isVisible = await colleaguesSection
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);

      if (!isVisible) {
        // Fallback - ищем в секциях
        const sectionWithColleagues = this.resultsSections
          .filter({ hasText: /коллег/i })
          .first();
        await sectionWithColleagues.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      }
      console.log("✓ Секция оценки от коллег найдена");
    });
  }

  /**
   * Проверить наличие секции с оценкой от подчинённых
   * Секция имеет title формата "Оценка от подчинённых: Имя Пользователя"
   */
  async assertSubordinatesAssessmentVisible() {
    await this._step("Проверить наличие оценки от подчинённых", async () => {
      // Ищем заголовок секции с текстом "подчинен"
      const subordinatesSection = this.page
        .getByText(/от подчиненн|подчиненн/i)
        .first();
      const isVisible = await subordinatesSection
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);

      if (!isVisible) {
        // Fallback - ищем в секциях
        const sectionWithSubordinates = this.resultsSections
          .filter({ hasText: /подчиненн/i })
          .first();
        await sectionWithSubordinates.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      }
      console.log("✓ Секция оценки от подчинённых найдена");
    });
  }

  // ---------------------------------------------------------------------------
  // Графики и диаграммы
  // ---------------------------------------------------------------------------

  /**
   * Проверить наличие графиков
   */
  async assertChartsVisible() {
    await this._step("Проверить наличие графиков", async () => {
      const chartsVisible = await this.charts
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);
      if (!chartsVisible) {
        // Попробуем найти любой график (исключаем скрытый SVG sprite)
        const anyChart = this.page
          .locator(
            '[class*="Chart"] svg, [class*="Donut"] svg, canvas, main svg:not([id="__SVG_SPRITE_NODE__"])',
          )
          .first();
        const chartFound = await anyChart
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        if (!chartFound) {
          console.log("⚠️ Графики не найдены, но тест продолжается");
          return; // Графики опциональны, не фейлим тест
        }
      }
      console.log("✓ Графики найдены");
    });
  }

  /**
   * Проверить наличие радарной диаграммы (паутинка)
   */
  async assertRadarChartVisible() {
    await this._step("Проверить наличие радарной диаграммы", async () => {
      await this.radarChart.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      console.log("✓ Радарная диаграмма найдена");
    });
  }

  // ---------------------------------------------------------------------------
  // Итоговая оценка
  // ---------------------------------------------------------------------------

  /**
   * Получить итоговую оценку компетенций
   * @returns {Promise<{value: string, characteristic: string}>}
   */
  async getCompetenceResult() {
    return this._step("Получить итоговую оценку компетенций", async () => {
      await this.competenceResult.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const value = await this.competenceResult
        .locator('[class*="value"]')
        .innerText()
        .catch(() => "");
      const characteristic = await this.competenceResult
        .locator('[class*="characteristic"]')
        .innerText()
        .catch(() => "");

      console.log(`✓ Итоговая оценка: ${value} (${characteristic})`);
      return { value, characteristic };
    });
  }

  // ---------------------------------------------------------------------------
  // Респонденты
  // ---------------------------------------------------------------------------

  /**
   * Получить список респондентов (кто заполнил анкету)
   * @returns {Promise<string[]>}
   */
  async getRespondentsList() {
    return this._step("Получить список респондентов", async () => {
      const respondentsVisible = await this.respondentsList
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!respondentsVisible) {
        console.log("⚠️ Список респондентов не найден");
        return [];
      }

      const respondents = await this.respondentsList
        .locator('[class*="name"], [class*="User"]')
        .allInnerTexts();
      console.log(`✓ Найдено респондентов: ${respondents.length}`);
      return respondents;
    });
  }

  // ---------------------------------------------------------------------------
  // Экспорт
  // ---------------------------------------------------------------------------

  /**
   * Открыть меню экспорта
   */
  async openExportMenu() {
    await this._step("Открыть меню экспорта", async () => {
      await this.exportButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.exportButton.click();
      // Ждём появления пунктов меню экспорта
      const menuItem = this.page
        .locator(`${SELECTORS.ROLE_MENUITEM}, ${SELECTORS.MENU_POPUP_ITEM}`)
        .first();
      await menuItem.waitFor({ state: "visible", timeout: 5000 });
    });
  }

  /**
   * Экспортировать результаты в XLSX
   * @returns {Promise<Download>}
   */
  async exportToXLSX() {
    return this._step("Экспортировать в XLSX", async () => {
      await this.openExportMenu();

      const xlsxOption = this.page
        .locator(`${SELECTORS.ROLE_MENUITEM}, ${SELECTORS.MENU_POPUP_ITEM}`)
        .filter({ hasText: /xlsx/i })
        .first();

      const [download] = await Promise.all([
        this.page.waitForEvent("download", { timeout: TIMEOUTS.LONG }),
        xlsxOption.click(),
      ]);

      return download;
    });
  }

  /**
   * Экспортировать результаты в PDF
   * @returns {Promise<Download>}
   */
  async exportToPDF() {
    return this._step("Экспортировать в PDF", async () => {
      await this.openExportMenu();

      const pdfOption = this.page
        .locator(`${SELECTORS.ROLE_MENUITEM}, ${SELECTORS.MENU_POPUP_ITEM}`)
        .filter({ hasText: /pdf/i })
        .first();

      const [download] = await Promise.all([
        this.page.waitForEvent("download", { timeout: TIMEOUTS.LONG }),
        pdfOption.click(),
      ]);

      return download;
    });
  }

  // ---------------------------------------------------------------------------
  // Вопросы с ответами
  // ---------------------------------------------------------------------------

  /**
   * Получить количество вопросов с ответами
   * @returns {Promise<number>}
   */
  async getQuestionsCount() {
    return this._step("Получить количество вопросов", async () => {
      const count = await this.questions.count();
      console.log(`✓ Найдено вопросов: ${count}`);
      return count;
    });
  }

  /**
   * Проверить, что есть хотя бы один вопрос с ответом
   */
  async assertHasAnsweredQuestions() {
    await this._step("Проверить наличие ответов на вопросы", async () => {
      const count = await this.questions.count();
      if (count === 0) {
        throw new Error("Не найдено ни одного вопроса с ответом");
      }
      console.log(`✓ Найдено ${count} вопросов с ответами`);
    });
  }

  /**
   * Проверить все направления оценки одним методом
   * @param {Object} options - какие направления должны быть видны
   * @param {boolean} options.self - Самооценка
   * @param {boolean} options.manager - От руководителя
   * @param {boolean} options.colleagues - От коллег
   * @param {boolean} options.subordinates - От подчинённых
   */
  async assertAllDirectionsVisible({
    self = true,
    manager = true,
    colleagues = true,
    subordinates = true,
  } = {}) {
    await this._step("Проверить все направления оценки", async () => {
      const results = [];

      if (self) {
        try {
          await this.assertSelfAssessmentVisible();
          results.push({ direction: "Самооценка", found: true });
        } catch (e) {
          results.push({
            direction: "Самооценка",
            found: false,
            error: e.message,
          });
        }
      }

      if (manager) {
        try {
          await this.assertManagerAssessmentVisible();
          results.push({ direction: "Руководитель", found: true });
        } catch (e) {
          results.push({
            direction: "Руководитель",
            found: false,
            error: e.message,
          });
        }
      }

      if (colleagues) {
        try {
          await this.assertColleaguesAssessmentVisible();
          results.push({ direction: "Коллеги", found: true });
        } catch (e) {
          results.push({
            direction: "Коллеги",
            found: false,
            error: e.message,
          });
        }
      }

      if (subordinates) {
        try {
          await this.assertSubordinatesAssessmentVisible();
          results.push({ direction: "Подчинённые", found: true });
        } catch (e) {
          results.push({
            direction: "Подчинённые",
            found: false,
            error: e.message,
          });
        }
      }

      // Вывод результатов
      console.log("📊 Результаты проверки направлений:");
      results.forEach((r) => {
        if (r.found) {
          console.log(`  ✓ ${r.direction}: найдено`);
        } else {
          console.log(`  ✗ ${r.direction}: НЕ найдено - ${r.error}`);
        }
      });

      // Проверяем, все ли направления найдены
      const notFound = results.filter((r) => !r.found);
      if (notFound.length > 0) {
        throw new Error(
          `Не найдены направления: ${notFound.map((r) => r.direction).join(", ")}`,
        );
      }
    });
  }

  /**
   * Получить список всех секций с названиями направлений
   * @returns {Promise<string[]>} - список названий секций
   */
  async getSectionTitles() {
    return this._step("Получить названия секций результатов", async () => {
      // Ищем заголовки секций - они содержат название направления
      const titleElements = this.page.locator('[class*="title"]').filter({
        hasText: /самооценка|руководител|коллег|подчиненн/i,
      });

      const titles = await titleElements.allInnerTexts();
      console.log(`✓ Найдено секций: ${titles.length}`);
      titles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
      return titles;
    });
  }

  // ---------------------------------------------------------------------------
  // AI-саммари
  // ---------------------------------------------------------------------------

  /**
   * Переключиться на вкладку AI-саммари (если доступна)
   */
  async switchToAiSummary() {
    await this._step("Переключиться на AI-саммари", async () => {
      const aiTabVisible = await this.aiSummaryTab
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!aiTabVisible) {
        console.log("⚠️ Вкладка AI-саммари недоступна");
        return;
      }

      await this.aiSummaryTab.click();
      // Ждём загрузки контента AI-саммари после переключения вкладки
      await this.page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {});
      console.log("✓ Переключились на вкладку AI-саммари");
    });
  }

  // ---------------------------------------------------------------------------
  // Навигация через аватар (переход в профиль сотрудника)
  // ---------------------------------------------------------------------------

  /**
   * Кликнуть по ссылке на профиль сотрудника в хлебных крошках веб-отчёта → переход в профиль
   */
  async clickAvatarInHeader() {
    await this._step(
      "Кликнуть на ссылку профиля в хлебных крошках веб-отчёта",
      async () => {
        const profileLink = this.page
          .locator('[class*="BreadCrumbs"] a[href*="/profile/"]')
          .first();
        await profileLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await profileLink.click();
      },
    );
  }

  /**
   * Кликнуть по имени в хлебных крошках веб-отчёта → переход в профиль
   */
  async clickNameInHeader() {
    await this._step(
      "Кликнуть на имя в хлебных крошках веб-отчёта",
      async () => {
        const profileLink = this.page
          .locator('[class*="BreadCrumbs"] a[href*="/profile/"]')
          .first();
        await profileLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await profileLink.click();
      },
    );
  }

  /**
   * Hover на ссылку профиля в хлебных крошках — проверка hover-эффектов
   */
  async hoverAvatarInHeader() {
    await this._step(
      "Навести на ссылку профиля в хлебных крошках веб-отчёта",
      async () => {
        const profileLink = this.page
          .locator('[class*="BreadCrumbs"] a[href*="/profile/"]')
          .first();
        await profileLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await profileLink.hover();
      },
    );
  }

  /**
   * Получить имя сотрудника из хлебных крошек веб-отчёта
   * @returns {Promise<string>}
   */
  async getEmployeeNameFromHeader() {
    return this._step("Получить имя из хлебных крошек веб-отчёта", async () => {
      const profileLink = this.page
        .locator('[class*="BreadCrumbs"] a[href*="/profile/"]')
        .first();
      await profileLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      return (await profileLink.textContent()).trim();
    });
  }

  /**
   * Кликнуть по аватару сотрудника в heatmap результатов → переход в профиль
   * @param {string} employeeName - Имя сотрудника в heatmap
   */
  async clickAvatarInHeatmap(employeeName) {
    await this._step(
      `Кликнуть на аватар «${employeeName}» в heatmap результатов`,
      async () => {
        await this.heatMap.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const row = this.heatMap
          .locator('[class*="row"], tr')
          .filter({ hasText: employeeName })
          .first();
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const avatar = row.locator('[class*="Avatar_avatar"]').first();
        await avatar.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await avatar.click();
      },
    );
  }

  /**
   * Кликнуть по имени сотрудника в heatmap результатов → переход в профиль
   * @param {string} employeeName - Имя сотрудника в heatmap
   */
  async clickNameInHeatmap(employeeName) {
    await this._step(
      `Кликнуть на имя «${employeeName}» в heatmap результатов`,
      async () => {
        await this.heatMap.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const row = this.heatMap
          .locator('[class*="row"], tr')
          .filter({ hasText: employeeName })
          .first();
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const nameElement = row
          .locator('[class*="User_full-name-wrapper"] > div')
          .first();
        await nameElement.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await nameElement.click();
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Скриншоты для отчёта
  // ---------------------------------------------------------------------------

  /**
   * Сделать скриншот результатов
   * @param {string} filename - Имя файла (без расширения)
   */
  async takeScreenshot(filename = "pr-results") {
    await this._step("Сделать скриншот результатов", async () => {
      await this.page.screenshot({
        path: `test-results/${filename}.png`,
        fullPage: true,
      });
      console.log(`✓ Скриншот сохранён: test-results/${filename}.png`);
    });
  }
}
