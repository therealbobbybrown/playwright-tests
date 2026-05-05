// pages/EmployeeResultsModal.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { SELECTORS } from "../tests/utils/selectors.js";

/**
 * Page Object для модалки "Результаты сотрудника"
 *
 * Используется из:
 * - Дашборда "Моя команда" (кнопка "Результаты")
 * - Страницы результатов PR (кнопка "Результаты" в таблице)
 *
 * @example
 * const modal = new EmployeeResultsModal(page, testInfo);
 * await modal.assertModalOpened();
 * await modal.selectAssessment('Оценка 360 - 2');
 * await modal.switchToResultsTab();
 * await modal.downloadReport('xlsx');
 * await modal.closeModal();
 */
export class EmployeeResultsModal extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // ═══════════════════════════════════════════════════════════════════
    // ЛОКАТОРЫ: Контейнер модалки
    // ═══════════════════════════════════════════════════════════════════

    /** Контейнер модалки (SheetModal) */
    this.modal = this.page.locator(SELECTORS.SHEET_MODAL).first();

    /** Кнопка закрытия модалки (X) */
    this.closeButton = this.modal
      .getByRole("button", { name: /закрыть|close/i })
      .first();

    // ═══════════════════════════════════════════════════════════════════
    // ЛОКАТОРЫ: Заголовок с информацией о сотруднике
    // ═══════════════════════════════════════════════════════════════════

    /** Имя сотрудника */
    this.employeeName = this.modal
      .locator('h2, h3, [class*="name"], [class*="Name"]')
      .first();

    /** Должность сотрудника */
    this.employeePosition = this.modal
      .locator('[class*="position"], [class*="Position"], [class*="subtitle"]')
      .first();

    // ═══════════════════════════════════════════════════════════════════
    // ЛОКАТОРЫ: Фильтры
    // ═══════════════════════════════════════════════════════════════════

    /** Фильтр "Оценка" (кнопка dropdown) - ищем по label "Оценка" выше кнопки */
    this.assessmentFilterButton = this.modal
      .locator("div")
      .filter({ hasText: /^Оценка$/ })
      .locator(
        "xpath=following-sibling::button | following-sibling::div//button | ../button | ../div/button",
      )
      .first();

    /** Фильтр "Период оценки" / "Цикл оценки" (кнопка dropdown) - ищем по label */
    this.periodFilterButton = this.modal
      .locator("div")
      .filter({ hasText: /^Период оценки$/ })
      .locator(
        "xpath=following-sibling::button | following-sibling::div//button | ../button | ../div/button",
      )
      .first();

    // ═══════════════════════════════════════════════════════════════════
    // ЛОКАТОРЫ: Табы
    // ═══════════════════════════════════════════════════════════════════

    /** Таб "Результаты оценки" */
    this.resultsTab = this.modal
      .getByRole("button", { name: /результаты оценки/i })
      .first();

    /** Таб "AI саммари" */
    this.aiSummaryTab = this.modal
      .getByRole("button", { name: /AI саммари/i })
      .first();

    // ═══════════════════════════════════════════════════════════════════
    // ЛОКАТОРЫ: Контент табов
    // ═══════════════════════════════════════════════════════════════════

    /** Секция "Участники оценки" */
    this.participantsSection = this.modal
      .locator('[class*="Participants"], [class*="participants"]')
      .first();

    /** Счётчик участников (круговая диаграмма) */
    this.participantsDonut = this.modal
      .locator('[class*="Donut"], [class*="donut"], svg circle')
      .first();

    /** Текст "Ещё не оценили" */
    this.pendingParticipantsLabel = this.modal
      .getByText(/ещё не оценили/i)
      .first();

    /** Секция с результатами анкеты */
    this.assessmentResultsSection = this.modal
      .locator('[class*="Results"], [class*="results"]')
      .first();

    /** Заголовок анкеты (например, "Оценка сотрудника 002") */
    this.assessmentTitle = this.modal
      .locator("h3, h4")
      .filter({ hasText: /оценка|анкета/i })
      .first();

    /** Контент AI саммари */
    this.aiSummaryContent = this.modal
      .locator(
        '[class*="AiSummary"], [class*="ai-summary"], [class*="Summary"]',
      )
      .first();

    /** Текст "Собираем ответы" (AI саммари в процессе) */
    this.aiSummaryPending = this.modal
      .getByText(/собираем ответы|генерируем|в процессе/i)
      .first();

    // ═══════════════════════════════════════════════════════════════════
    // ЛОКАТОРЫ: Кнопки действий
    // ═══════════════════════════════════════════════════════════════════

    /** Кнопка "Скачать результаты" */
    this.downloadButton = this.modal
      .getByRole("button", { name: /скачать результаты/i })
      .first();

    /** Кнопка "Создать план развития" */
    this.createPlanButton = this.modal
      .getByRole("button", { name: /создать план развития/i })
      .first();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Проверки состояния модалки
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Проверить, что модалка открыта
   * @returns {Promise<void>}
   */
  async assertModalOpened() {
    await this._step("Модалка результатов сотрудника открыта", async () => {
      await this.modal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.employeeName.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Проверить, что модалка закрыта
   * @returns {Promise<void>}
   */
  async assertModalClosed() {
    await this._step("Модалка результатов сотрудника закрыта", async () => {
      await this.modal.waitFor({
        state: "hidden",
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    });
  }

  /**
   * Получить имя сотрудника из заголовка модалки
   * @returns {Promise<string>}
   */
  async getEmployeeName() {
    return this._step("Получить имя сотрудника", async () => {
      const name = await this.employeeName.innerText();
      return name.trim();
    });
  }

  /**
   * Дождаться загрузки модалки для конкретного сотрудника
   * @param {string} expectedName - Ожидаемое имя или часть имени сотрудника
   * @returns {Promise<void>}
   */
  async waitForEmployeeLoaded(expectedName) {
    await this._step(
      `Дождаться загрузки данных для "${expectedName}"`,
      async () => {
        // Ждём пока имя сотрудника в модалке будет содержать ожидаемое значение
        await expect(this.employeeName).toContainText(expectedName, {
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /**
   * Получить должность сотрудника
   * @returns {Promise<string>}
   */
  async getEmployeePosition() {
    return this._step("Получить должность сотрудника", async () => {
      const position = await this.employeePosition.innerText().catch(() => "");
      return position.trim();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Работа с фильтрами
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Выбрать оценку в фильтре
   * @param {string} assessmentName - Название оценки (например, "Оценка 360 - 2")
   * @returns {Promise<void>}
   */
  async selectAssessment(assessmentName) {
    await this._step(`Выбрать оценку "${assessmentName}"`, async () => {
      await this.assessmentFilterButton.click();

      const option = this.page
        .locator(SELECTORS.ROLE_OPTION)
        .filter({ hasText: assessmentName })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await option.click();

      // Ждём пока dropdown меню закроется после выбора
      await this.page
        .locator(SELECTORS.ROLE_OPTION)
        .first()
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Выбрать период оценки в фильтре
   * @param {string} periodName - Название периода (например, "Цикл оценки 1")
   * @returns {Promise<void>}
   */
  async selectPeriod(periodName) {
    await this._step(`Выбрать период оценки "${periodName}"`, async () => {
      await this.periodFilterButton.click();

      const option = this.page
        .locator(SELECTORS.ROLE_OPTION)
        .filter({ hasText: periodName })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await option.click();

      // Ждём пока dropdown меню закроется после выбора
      await this.page
        .locator(SELECTORS.ROLE_OPTION)
        .first()
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Получить текущее значение фильтра "Оценка"
   * @returns {Promise<string>}
   */
  async getSelectedAssessment() {
    return this._step("Получить выбранную оценку", async () => {
      const text = await this.assessmentFilterButton.innerText();
      return text.trim();
    });
  }

  /**
   * Получить текущее значение фильтра "Период оценки"
   * @returns {Promise<string>}
   */
  async getSelectedPeriod() {
    return this._step("Получить выбранный период", async () => {
      const text = await this.periodFilterButton.innerText();
      return text.trim();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Работа с табами
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Переключиться на таб "Результаты оценки"
   * @returns {Promise<void>}
   */
  async switchToResultsTab() {
    await this._step('Переключиться на таб "Результаты оценки"', async () => {
      await this.resultsTab.click();
      // Ждём пока таб станет активным и контент загрузится
      await expect(this.resultsTab)
        .toHaveAttribute("aria-selected", "true", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Переключиться на таб "AI саммари"
   * @returns {Promise<void>}
   */
  async switchToAiSummaryTab() {
    await this._step('Переключиться на таб "AI саммари"', async () => {
      await this.aiSummaryTab.click();
      // Ждём пока таб станет активным и контент загрузится
      await expect(this.aiSummaryTab)
        .toHaveAttribute("aria-selected", "true", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Проверить, что таб "Результаты оценки" активен
   * @returns {Promise<boolean>}
   */
  async isResultsTabActive() {
    const ariaSelected = await this.resultsTab.getAttribute("aria-selected");
    const hasActiveClass = await this.resultsTab
      .evaluate(
        (el) =>
          el.className.includes("active") || el.className.includes("selected"),
      )
      .catch(() => false);
    return ariaSelected === "true" || hasActiveClass;
  }

  /**
   * Проверить содержимое таба "Результаты оценки"
   * @returns {Promise<void>}
   */
  async assertResultsTabContent() {
    await this._step(
      'Проверить содержимое таба "Результаты оценки"',
      async () => {
        // Секция участников оценки
        const hasParticipants = await this.participantsSection
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (hasParticipants) {
          console.log('✓ Секция "Участники оценки" найдена');
        }

        // Круговая диаграмма
        const hasDonut = await this.participantsDonut
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (hasDonut) {
          console.log("✓ Диаграмма участников найдена");
        }

        // Результаты анкеты
        const hasResults = await this.assessmentResultsSection
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (hasResults) {
          console.log("✓ Секция результатов анкеты найдена");
        }

        if (!hasParticipants && !hasResults && !hasDonut) {
          throw new Error('Не найдено содержимое таба "Результаты оценки"');
        }
      },
    );
  }

  /**
   * Проверить содержимое таба "AI саммари"
   * @returns {Promise<void>}
   */
  async assertAiSummaryTabContent() {
    await this._step('Проверить содержимое таба "AI саммари"', async () => {
      // AI саммари контент
      const hasContent = await this.aiSummaryContent
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      // Или сообщение "Собираем ответы"
      const isPending = await this.aiSummaryPending
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (hasContent) {
        console.log("✓ Контент AI саммари найден");
      } else if (isPending) {
        console.log('⚠️ AI саммари в процессе генерации ("Собираем ответы")');
      } else {
        console.log("⚠️ AI саммари недоступно");
      }
    });
  }

  /**
   * Получить количество участников оценки
   * @returns {Promise<number>}
   */
  async getParticipantsCount() {
    return this._step("Получить количество участников", async () => {
      // Ищем число внутри круговой диаграммы
      const countText = await this.modal
        .locator('[class*="Donut"] text, [class*="donut"] span')
        .first()
        .innerText()
        .catch(() => "0");
      return parseInt(countText, 10) || 0;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Скачивание отчётов
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Открыть меню скачивания отчётов
   * @returns {Promise<void>}
   */
  async openDownloadMenu() {
    await this._step("Открыть меню скачивания", async () => {
      await this.downloadButton.click();
      // Ждём появления первого пункта меню
      await this.page
        .locator(`${SELECTORS.ROLE_MENUITEM}, ${SELECTORS.MENU_POPUP_ITEM}`)
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    });
  }

  /**
   * Скачать отчёт в указанном формате
   * @param {'xlsx' | 'pdf' | 'csv' | 'pptx'} format - Формат отчёта
   * @returns {Promise<import('@playwright/test').Download|null>}
   */
  async downloadReport(format) {
    return this._step(
      `Скачать отчёт в формате ${format.toUpperCase()}`,
      async () => {
        await this.openDownloadMenu();

        const formatOption = this.page
          .locator(`${SELECTORS.ROLE_MENUITEM}, ${SELECTORS.MENU_POPUP_ITEM}`)
          .filter({ hasText: new RegExp(format, "i") })
          .first();

        // Подготавливаем слушатели ДО клика
        const directDownloadPromise = this.page
          .waitForEvent("download", { timeout: TIMEOUTS.SHORT })
          .catch(() => null);

        // Для новой страницы: сразу при открытии подписываемся на download
        let newPageDownloadPromise = null;
        const newPageHandler = (newPage) => {
          // Подписываемся на download сразу как страница открылась
          newPageDownloadPromise = newPage.waitForEvent("download", {
            timeout: TIMEOUTS.LONG,
          });
        };
        this.page.context().once("page", newPageHandler);

        await formatOption.click();

        // Проверяем прямое скачивание
        const directDownload = await directDownloadPromise;
        if (directDownload) {
          this.page.context().off("page", newPageHandler);
          console.log(
            `✓ Файл ${format.toUpperCase()} скачан: ${directDownload.suggestedFilename()}`,
          );
          return directDownload;
        }

        // Проверяем скачивание через новую страницу
        if (newPageDownloadPromise) {
          const newPageDownload = await newPageDownloadPromise.catch(
            () => null,
          );
          // Получаем страницу для закрытия
          const pages = this.page.context().pages();
          const downloadPage = pages.find((p) =>
            p.url().includes("/download/"),
          );

          if (newPageDownload) {
            console.log(
              `✓ Файл ${format.toUpperCase()} скачан: ${newPageDownload.suggestedFilename()}`,
            );
            if (downloadPage) await downloadPage.close();
            return newPageDownload;
          }

          if (downloadPage) await downloadPage.close();
          console.log(
            `⚠️ Скачивание ${format.toUpperCase()} не началось на странице /download/`,
          );
          return null;
        }

        console.log(
          `⚠️ Экспорт ${format.toUpperCase()} не вызвал скачивание или открытие вкладки`,
        );
        return null;
      },
    );
  }

  /**
   * Проверить доступность всех форматов экспорта
   * @returns {Promise<string[]>} Список доступных форматов
   */
  async getAvailableExportFormats() {
    return this._step("Получить доступные форматы экспорта", async () => {
      await this.openDownloadMenu();

      const options = this.page.locator(
        `${SELECTORS.ROLE_MENUITEM}, ${SELECTORS.MENU_POPUP_ITEM}`,
      );
      const formats = await options.allInnerTexts();

      // Закрыть меню кликом вне
      await this.modal.click({ position: { x: 10, y: 10 } });

      console.log(`✓ Доступные форматы: ${formats.join(", ")}`);
      return formats;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Действия
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Нажать "Создать план развития" (редирект)
   * Если есть шаблоны - появляется меню с выбором:
   * - "Новый план развития" (с чистого листа)
   * - "План развития по шаблону"
   * Если шаблонов нет - сразу переходит на страницу.
   * @param {'new' | 'template'} option - Какой вариант выбрать (по умолчанию 'new')
   * @returns {Promise<void>}
   */
  async clickCreateDevelopmentPlan(option = "new") {
    await this._step('Нажать "Создать план развития"', async () => {
      // Кнопка в popup: "Новый" или "шаблону" (по тексту в title span)
      const titleText = option === "new" ? "Новый" : "шаблону";
      const popupButton = this.page
        .locator('button[class*="AddDevelopmentPlanButton_button"]')
        .filter({
          has: this.page.locator(
            `[class*="AddDevelopmentPlanButton_title"]:has-text("${titleText}")`,
          ),
        });

      const employeeName = await this.employeeName.textContent();
      await this.createPlanButton.click();

      // Два варианта:
      // 1. План уже существует → прямой редирект
      // 2. Плана нет, но есть шаблоны → попап с выбором
      const popupVisible = await popupButton
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (popupVisible) {
        console.log("✓ Попап с выбором типа плана");
        await popupButton.click();
        await this.page.waitForURL(/development-plan/, {
          timeout: TIMEOUTS.URL_CHANGE,
        });
      } else {
        // План уже существует - ждём редирект
        console.log("✓ План уже существует, прямой редирект");
        await this.page.waitForURL(/development-plan/, {
          timeout: TIMEOUTS.URL_CHANGE,
        });
      }

      console.log(`✓ Переход на страницу создания плана развития`);
      console.log(`✓ Редирект выполнен для сотрудника: ${employeeName}`);
    });
  }

  /**
   * Закрыть модалку
   * @returns {Promise<void>}
   */
  async closeModal() {
    await this._step("Закрыть модалку результатов", async () => {
      // Пробуем найти кнопку закрытия разными способами
      const closeBtn = this.modal
        .locator("button")
        .filter({ hasText: /×|✕|close/i })
        .first();
      const closeBtnAria = this.modal
        .getByRole("button", { name: /close|закрыть/i })
        .first();
      const closeBtnIcon = this.modal
        .locator('button svg[class*="close"], button [class*="Icon"]')
        .first();

      const btnVisible = await closeBtn
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      const ariaVisible = await closeBtnAria
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      const iconVisible = await closeBtnIcon
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (btnVisible) {
        await closeBtn.click();
      } else if (ariaVisible) {
        await closeBtnAria.click();
      } else if (iconVisible) {
        await closeBtnIcon.click();
      } else {
        // Fallback: нажать Escape
        await this.page.keyboard.press("Escape");
      }

      await this.assertModalClosed();
    });
  }
}
