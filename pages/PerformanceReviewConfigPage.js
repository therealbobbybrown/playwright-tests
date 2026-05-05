// pages/PerformanceReviewConfigPage.js
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

/**
 * Page Object для страницы настройки оценки сотрудников
 * URL: /ru/manager/performance-reviews/[id]
 *
 * Включает 7 шагов настройки:
 * 1. Выбор сотрудников (targets)
 * 2. Направления оценки (directions)
 * 3. Выбор участников (targetUsers)
 * 4. Регулярные напоминания (notificationsScheduleSettings)
 * 5. Анкеты (assessments)
 * 6. Администрирование (managers)
 * 7. Настройки анонимности (anonymity)
 */
export class PerformanceReviewConfigPage extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы - может быть "Performance Review", "Опрос 360°", "Онбординг"
    this.pageTitle = this.page
      .getByText(/^(Performance Review|Опрос 360°|Онбординг)$/)
      .first();

    // Навигация по шагам (табы) - кликаем на кнопки в сайдбаре, которые содержат текст
    this.directionsTab = this.page
      .locator("button")
      .filter({ hasText: "Направления оценки" })
      .first();
    this.targetUsersTab = this.page
      .locator("button")
      .filter({ hasText: "Выбор участников" })
      .first();
    this.notificationsTab = this.page
      .locator("button")
      .filter({ hasText: "Регулярные напоминания" })
      .first();
    this.assessmentsTab = this.page
      .locator("button")
      .filter({ hasText: "Анкеты" })
      .first();
    this.managersTab = this.page
      .locator("button")
      .filter({ hasText: "Администрирование" })
      .first();
    this.anonymityTab = this.page
      .locator("button")
      .filter({ hasText: "Настройки анонимности" })
      .first();
    // "8 Запуск" в сайдбаре (li button), а НЕ верхний таб "Настройка и запуск"
    this.launchTab = this.page
      .locator("li button")
      .filter({ hasText: "Запуск" })
      .first();

    // Вкладки после запуска PR (верхняя панель)
    // Вкладка "Заполнение анкет" содержит подвкладки "Оцениваемые" и "Респонденты"
    this.fillQuestionnairesTab = this.page
      .locator('button, [role="tab"]')
      .filter({ hasText: /^заполнение анкет$/i })
      .first();
    this.evaluatedTab = this.page
      .locator('button, [role="tab"]')
      .filter({ hasText: /^оцениваемые$/i })
      .first();

    // Кнопки навигации
    this.nextButton = this.page
      .getByRole("button", { name: /далее|продолжить/i })
      .first();
    this.backButton = this.page.getByRole("button", { name: /назад/i }).first();
    this.saveButton = this.page
      .getByRole("button", { name: /сохранить/i })
      .first();
    this.launchButton = this.page
      .getByRole("button", { name: /запустить/i })
      .first();

    // Поле названия оценки - инлайн редактируемое
    // Нужно кликнуть на заголовок или иконку карандаша рядом с ним
    this.titleEditIcon = this.page
      .locator('[class*="Icon"]')
      .filter({ has: this.page.locator("svg") })
      .first();
    // После клика на Editable_opener появляется input внутри контейнера Editable_text
    this.titleInput = this.page
      .locator('[class*="Editable_text"] input, [class*="Editable"] input')
      .first();

    // Модалка выбора участников
    this.participantModal = this.page
      .locator('[class*="Modal"]')
      .filter({ hasText: "Кого еще вы хотите оценить" })
      .first();

    this.participantCards = this.participantModal.locator(
      '[class*="Option_option-item"]',
    );

    this.addParticipantButton = this.page
      .getByRole("button", { name: /добавить участника/i })
      .first();

    // Поле описания
    this.descriptionInput = this.page
      .getByRole("textbox", { name: /описание/i })
      .first();
  }

  // ---------------------------------------------------------------------------
  // Навигация
  // ---------------------------------------------------------------------------

  /**
   * Проверить, что страница настройки открыта
   */
  async assertOpened() {
    await this._step("Страница настройки оценки открыта", async () => {
      await this.page.waitForURL(URL_PATTERNS.PR_CONFIG, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.pageTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Переключиться на конкретный шаг настройки
   * @param {'directions'|'targetUsers'|'notifications'|'assessments'|'managers'|'anonymity'|'launch'} step
   */
  async goToStep(step) {
    await this._step(`Перейти к шагу "${step}"`, async () => {
      const tabs = {
        directions: this.directionsTab,
        targetUsers: this.targetUsersTab,
        notifications: this.notificationsTab,
        assessments: this.assessmentsTab,
        managers: this.managersTab,
        anonymity: this.anonymityTab,
        launch: this.launchTab,
      };

      const tab = tabs[step];
      if (!tab) {
        throw new Error(`Неизвестный шаг: ${step}`);
      }

      // Отвести курсор вправо, чтобы свернуть боковое меню
      await this._moveCursorToContent();

      // Перезагрузить страницу если появился overlay о новом билде
      await this._handleBuildReloadMessage();

      // Закрыть SheetModal, если он перекрывает sidebar-кнопки (паттерн из BaseMenuHelper)
      const hasSheetModal = await this.page
        .locator(".react-modal-sheet-container")
        .first()
        .isVisible()
        .catch(() => false);
      if (hasSheetModal) {
        await this.page
          .evaluate(() => {
            document
              .querySelectorAll(
                ".react-modal-sheet-container, .react-modal-sheet-backdrop",
              )
              .forEach((el) => el.remove());
          })
          .catch(() => {});
        console.log("  ✓ SheetModal убран перед навигацией");
      }

      await tab.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await tab.click();
      // Ждём, пока содержимое шага отрендерится (клик по sidebar может подгружать данные)
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    });
  }

  // ---------------------------------------------------------------------------
  // Основные поля
  // ---------------------------------------------------------------------------

  /**
   * Заполнить название оценки
   * @param {string} title
   */
  async fillTitle(title) {
    await this._step(`Заполнить название: "${title}"`, async () => {
      // HTML структура заголовка:
      // <div class="Editable_text__x_gP7 ...">
      //   <span class="Editable_opener__zqrUY">
      //     <span>Performance</span><span>Review</span><svg icon-edit>
      //   </span>
      // </div>
      // Кликаем на Editable_opener чтобы активировать поле ввода

      const editableOpener = this.page
        .locator('[class*="Editable_opener"]')
        .first();
      await editableOpener.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await editableOpener.click();

      // Теперь должно появиться поле ввода
      await this.titleInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Очистить поле и заполнить новым названием
      await this.titleInput.fill("");
      await this.titleInput.fill(title);

      // Сохранить: нажать Enter и кликнуть вне поля
      await this.page.keyboard.press("Enter");
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});

      // Кликаем вне поля чтобы закрыть режим редактирования
      await this.page.locator("body").click({ position: { x: 10, y: 10 } });

      // Проверяем что название сохранилось - opener должен содержать новый текст
      const savedTitle = await this.page
        .locator('[class*="Editable_opener"]')
        .first()
        .textContent();
      if (!savedTitle?.includes(title.substring(0, 10))) {
        console.log(
          `⚠️ Название возможно не сохранилось. Ожидалось: "${title}", текст: "${savedTitle}"`,
        );
      }
    });
  }

  /**
   * Заполнить описание оценки
   * @param {string} description
   */
  async fillDescription(description) {
    await this._step(`Заполнить описание: "${description}"`, async () => {
      const visible = await this.descriptionInput
        .isVisible()
        .catch(() => false);
      if (visible) {
        await this.descriptionInput.fill(description);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Шаг 1: Направления оценки (directions)
  // ---------------------------------------------------------------------------

  /**
   * Настроить направления оценки через переключатели
   * @param {Object} options
   * @param {boolean} options.self - Самооценка
   * @param {boolean} options.manager - От руководителя
   * @param {boolean} options.subordinates - От подчиненных
   * @param {boolean} options.colleagues - От коллег
   */
  async configureDirections({
    self = true,
    manager = true,
    subordinates = false,
    colleagues = false,
  } = {}) {
    await this._step("Настроить направления оценки", async () => {
      // Шаг 1 открывается по умолчанию при создании

      console.log(
        `🔧 Настраиваем направления: self=${self}, manager=${manager}, subordinates=${subordinates}, colleagues=${colleagues}`,
      );

      // Найти карточки с направлениями
      const selfCard = this.page
        .getByText("Самооценка", { exact: true })
        .locator("../..");
      const managerCard = this.page
        .getByText("Оценка от руководителя", { exact: true })
        .locator("../..");
      const subordinatesCard = this.page
        .getByText("Оценка от подчиненных", { exact: true })
        .locator("../..");
      const colleaguesCard = this.page
        .getByText("Оценка от коллег", { exact: true })
        .locator("../..");

      // Настроить каждое направление
      // Хелпер: кликает видимый wrapper toggle (не hidden input) для корректного React onChange
      const toggleDirection = async (card, label, desired) => {
        const input = card.locator('input[type="checkbox"]').first();
        const isChecked = await input.isChecked();
        console.log(`  ${label}: текущее=${isChecked}, требуется=${desired}`);
        if (desired !== isChecked) {
          // Клик по родителю input (видимый Toggler wrapper), а не по hidden input
          await input.locator("..").click();
          await expect(input).toBeChecked({
            checked: desired,
            timeout: 2000,
          });
          console.log(`  ✓ ${label} переключен`);
        }
      };

      if (self !== undefined)
        await toggleDirection(selfCard, "Самооценка", self);
      if (manager !== undefined)
        await toggleDirection(managerCard, "Руководитель", manager);
      if (subordinates !== undefined)
        await toggleDirection(subordinatesCard, "Подчиненные", subordinates);
      if (colleagues !== undefined)
        await toggleDirection(colleaguesCard, "Коллеги", colleagues);

      console.log("✓ Настроены все направления оценки");
    });
  }

  /**
   * Переключить направления оценки на ЗАПУЩЕННОМ PR (через чекбоксы в заголовке таблицы)
   * @param {Object} options
   * @param {boolean} options.self - Самооценка
   * @param {boolean} options.manager - От руководителя
   * @param {boolean} options.subordinates - От подчиненных
   * @param {boolean} options.colleagues - От коллег
   */
  async toggleDirectionsOnRunningPR({
    self,
    manager,
    subordinates,
    colleagues,
  } = {}) {
    await this._step("Переключить направления на запущенном PR", async () => {
      console.log(
        `🔧 Переключаем направления: self=${self}, manager=${manager}, subordinates=${subordinates}, colleagues=${colleagues}`,
      );

      // Ищем таблицу оцениваемых
      const table = this.page
        .locator("table")
        .filter({
          has: this.page.locator(
            'th:has-text("Оцениваемый"), td:has-text("Оцениваемый")',
          ),
        })
        .first();

      // Чекбоксы находятся в заголовке таблицы
      const headerRow = table.locator("tr").first();

      if (self !== undefined) {
        // Находим ячейку заголовка с текстом "Самооценка"
        const selfCell = headerRow
          .locator("th, td")
          .filter({ hasText: "Самооценка" })
          .first();
        // Тогл - input с классом Toggler_input
        const toggler = selfCell
          .locator('input[class*="Toggler_input"]')
          .first();

        const togglerExists = await toggler
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (togglerExists) {
          const isChecked = await toggler.isChecked();
          console.log(`  Самооценка: текущее=${isChecked}, требуется=${self}`);
          if (self !== isChecked) {
            await toggler.click();
            await expect(toggler).toBeChecked({ checked: self, timeout: 2000 });
            console.log(`  ✓ Самооценка переключена`);
          }
        } else {
          console.log("  ⚠️ Тогл Самооценки не найден");
        }
      }

      if (manager !== undefined) {
        const managerCell = headerRow
          .locator("th, td")
          .filter({ hasText: "Руководитель" })
          .first();
        const checkbox = managerCell.locator('input[type="checkbox"]').first();

        const exists = await checkbox
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (exists) {
          const isChecked = await checkbox.isChecked();
          console.log(
            `  Руководитель: текущее=${isChecked}, требуется=${manager}`,
          );
          if (manager !== isChecked) {
            await checkbox.click();
            await expect(checkbox).toBeChecked({
              checked: manager,
              timeout: 2000,
            });
            console.log(`  ✓ Руководитель переключен`);
          }
        }
      }

      if (subordinates !== undefined) {
        const subordinatesCell = headerRow
          .locator("th, td")
          .filter({ hasText: "Подчиненные" })
          .first();
        const checkbox = subordinatesCell
          .locator('input[type="checkbox"]')
          .first();

        const exists = await checkbox
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (exists) {
          const isChecked = await checkbox.isChecked();
          console.log(
            `  Подчиненные: текущее=${isChecked}, требуется=${subordinates}`,
          );
          if (subordinates !== isChecked) {
            await checkbox.click();
            await expect(checkbox).toBeChecked({
              checked: subordinates,
              timeout: 2000,
            });
            console.log(`  ✓ Подчиненные переключены`);
          }
        }
      }

      if (colleagues !== undefined) {
        const colleaguesCell = headerRow
          .locator("th, td")
          .filter({ hasText: "Коллеги" })
          .first();
        const checkbox = colleaguesCell
          .locator('input[type="checkbox"]')
          .first();

        const exists = await checkbox
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (exists) {
          const isDisabled = await checkbox.isDisabled().catch(() => false);
          if (isDisabled) {
            console.log(
              "  ⚠️ Чекбокс Коллеги disabled (зависит от выбора коллег)",
            );
          } else {
            const isChecked = await checkbox.isChecked();
            console.log(
              `  Коллеги: текущее=${isChecked}, требуется=${colleagues}`,
            );
            if (colleagues !== isChecked) {
              await checkbox.click();
              await expect(checkbox).toBeChecked({
                checked: colleagues,
                timeout: 2000,
              });
              console.log(`  ✓ Коллеги переключены`);
            }
          }
        }
      }

      // После переключения тогла открывается панель "Изменение участников оценки"
      // Нужно нажать "Сохранить" чтобы применить изменения
      // Ждём появления кнопки
      const saveButton = this.page
        .getByRole("button", { name: /сохранить/i })
        .first();
      try {
        await saveButton.waitFor({ state: "visible", timeout: 5000 });
        console.log('✓ Кнопка "Сохранить" появилась');
        await saveButton.click();
        console.log('✓ Нажали "Сохранить"');

        // После "Сохранить" появляется модалка "Подтвердите изменения"
        const confirmButton = this.page
          .getByRole("button", { name: /подтвердить изменения/i })
          .first();
        try {
          await confirmButton.waitFor({ state: "visible", timeout: 5000 });
          console.log('✓ Кнопка "Подтвердить изменения" появилась');
          await confirmButton.click();
          console.log('✓ Нажали "Подтвердить изменения"');
          await this.page.waitForLoadState("networkidle");

          // После подтверждения появляется модалка "Изменения сохранены" с кнопкой "Перейти в карточку оценки"
          // Нужно её закрыть или нажать кнопку
          const goToCardButton = this.page
            .getByRole("button", { name: /перейти в карточку оценки/i })
            .first();
          const goToCardVisible = await goToCardButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          if (goToCardVisible) {
            await goToCardButton.click();
            console.log('✓ Нажали "Перейти в карточку оценки"');
            await this.page.waitForLoadState("networkidle");
          }
        } catch (e) {
          console.log('⚠️ Кнопка "Подтвердить изменения" не появилась');
        }
      } catch (e) {
        console.log('⚠️ Кнопка "Сохранить" не появилась');
      }

      console.log("✓ Направления переключены");
    });
  }

  // ---------------------------------------------------------------------------
  // Шаг 2: Выбор участников (targetUsers)
  // ---------------------------------------------------------------------------

  /**
   * Настроить подбор коллег
   * @param {Object} options
   * @param {boolean} options.askEmployees - Включить режим "Спросить сотрудников" (по умолчанию false - автоматически)
   * @param {number} options.minColleagues - Минимальное количество коллег (от)
   * @param {number} options.maxColleagues - Максимальное количество коллег (до)
   * @param {boolean} options.managerApproval - Отправлять список коллег на проверку руководителям
   * @param {boolean} options.earlyAccess - Разрешить ранний доступ к анкетам
   * @param {boolean} options.showSelfAssessmentToColleagues - Показывать самооценку коллегам (доступно только при earlyAccess=true)
   */
  async configureColleaguesSelection({
    askEmployees = true,
    minColleagues = 2,
    maxColleagues = 5,
    managerApproval = false,
    earlyAccess = false,
    showSelfAssessmentToColleagues = false,
  } = {}) {
    await this._step("Настроить подбор коллег", async () => {
      await this.goToStep("targetUsers");

      if (askEmployees) {
        // Выбрать вариант "Спросить сотрудников"
        const askEmployeesOption = this.page
          .getByText("Спросить сотрудников")
          .first();
        await askEmployeesOption.click();

        // Настроить количество коллег (поля "от" и "до")
        const numberInputs = this.page.locator('input[type="number"]');
        const inputCount = await numberInputs.count();

        if (inputCount >= 2) {
          await numberInputs.first().fill(minColleagues.toString());
          await numberInputs.last().fill(maxColleagues.toString());
        }

        // Тоггл "Отправлять список коллег на проверку руководителям"
        const approvalText = this.page.getByText(
          "Отправлять список коллег на проверку руководителям",
        );
        const approvalToggle = approvalText
          .locator("../..")
          .locator('input[type="checkbox"]')
          .first();
        const isApprovalChecked = await approvalToggle
          .isChecked()
          .catch(() => false);

        if (managerApproval !== isApprovalChecked) {
          await approvalToggle.click();
        }

        // Тоггл "Разрешить ранний доступ к анкетам"
        const earlyAccessText = this.page.getByText(
          "Разрешить ранний доступ к анкетам",
        );
        const earlyAccessToggle = earlyAccessText
          .locator("../..")
          .locator('input[type="checkbox"]')
          .first();
        const isEarlyAccessChecked = await earlyAccessToggle
          .isChecked()
          .catch(() => false);

        if (earlyAccess !== isEarlyAccessChecked) {
          await earlyAccessToggle.click();
        }

        // Тоггл "Показывать самооценку коллегам" (появляется только при earlyAccess=true)
        // ID чекбокса: way-to-select-colleagues--manual--isAsyncStepsSelfResponseStep
        if (earlyAccess && showSelfAssessmentToColleagues) {
          const showSelfAssessmentCheckbox = this.page.locator(
            "#way-to-select-colleagues--manual--isAsyncStepsSelfResponseStep",
          );
          const isShowSelfAssessmentVisible = await showSelfAssessmentCheckbox
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (isShowSelfAssessmentVisible) {
            const isShowSelfAssessmentChecked = await showSelfAssessmentCheckbox
              .isChecked()
              .catch(() => false);

            if (
              showSelfAssessmentToColleagues !== isShowSelfAssessmentChecked
            ) {
              await showSelfAssessmentCheckbox.click();
              console.log(
                `✓ Показывать самооценку коллегам: ${showSelfAssessmentToColleagues}`,
              );
            }
          } else {
            console.log(
              '⚠️ Тогл "Показывать самооценку коллегам" не найден (требуется earlyAccess=true)',
            );
          }
        }

        console.log(
          `✓ Подбор коллег настроен: от ${minColleagues} до ${maxColleagues}, проверка=${managerApproval}, ранний доступ=${earlyAccess}, показывать самооценку=${showSelfAssessmentToColleagues}`,
        );
      } else {
        // Выбрать вариант "Автоматически"
        const autoOption = this.page.getByText("Автоматически").first();
        await autoOption.click();
        console.log("✓ Выбран автоматический подбор коллег");
      }
    });
  }

  /**
   * Добавить участников для оценки
   * @param {Object} options
   * @param {number} options.count - Количество участников для выбора (по умолчанию 1)
   */
  async addTargetUsers({ count = 1 } = {}) {
    await this._step(`Добавить ${count} участников для оценки`, async () => {
      await this.goToStep("targetUsers");

      // Нажать кнопку "Добавить участника"
      const addButton = this.page
        .getByRole("button", { name: /добавить участника/i })
        .first();
      await addButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await addButton.click();

      // Модальное окно выбора пользователей - ищем по заголовку
      const modal = this.page
        .locator('[class*="Modal"]')
        .filter({ hasText: "Кого еще вы хотите оценить" })
        .first();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Выбрать первых N пользователей
      // Карточки — div.Option_option-item обёртки, содержащие кнопку пользователя.
      // Индекс 0 = "Все сотрудники", пользователи начинаются с индекса 1.
      const userCards = modal.locator('[class*="Option_option-item"]');
      await userCards
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      const cardsCount = await userCards.count();

      console.log(`Найдено карточек пользователей: ${cardsCount}`);

      // Выбираем первые N карточек, начиная с индекса 1 (пропуская "Все сотрудники" на индексе 0)
      for (let i = 1; i < Math.min(count + 1, cardsCount); i++) {
        const card = userCards.nth(i);
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await card.click();
        console.log(`Выбран пользователь #${i}`);
      }

      // Кнопка "Подтвердить" - фиолетовая кнопка внизу модального окна (scoped к modal)
      const confirmButton = modal
        .locator("button")
        .filter({ hasText: "Подтвердить" })
        .first();
      await confirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await confirmButton.click();

      // Дождаться закрытия модального окна
      await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Добавить участников из отдела
   * @param {Object} options
   * @param {number} options.count - Количество отделов для выбора (по умолчанию 1)
   * @param {string} options.departmentName - Название конкретного отдела (если указано, выбирается он)
   * @returns {Promise<Array<{name: string, employees: number}>>} - Массив выбранных отделов
   */
  async addTargetUsersFromDepartment({
    count = 1,
    departmentName = null,
  } = {}) {
    return this._step(
      `Добавить участников из ${departmentName || count + " отдел(ов)"}`,
      async () => {
        await this.goToStep("targetUsers");

        // Нажать кнопку "Добавить участника"
        const addButton = this.page
          .getByRole("button", { name: /добавить участника/i })
          .first();
        await addButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await addButton.click();

        // Модальное окно выбора пользователей
        const modal = this.page
          .locator('[class*="Modal"]')
          .filter({ hasText: "Кого еще вы хотите оценить" })
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Переключиться на вкладку "Отделы"
        const departmentsTab = modal
          .getByRole("button", { name: /^Отделы$/i })
          .or(
            modal
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /^Отделы$/i }),
          )
          .first();

        await departmentsTab.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await departmentsTab.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});
        console.log('✓ Переключились на вкладку "Отделы"');

        // Найти опции отделов — div.Option_option-item обёртки
        const options = modal.locator('[class*="Option_option-item"]');
        await options
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        const optionsCount = await options.count();
        console.log(`Найдено отделов: ${optionsCount}`);

        const selectedDepartments = [];

        if (departmentName) {
          // Выбираем конкретный отдел по названию
          for (let i = 0; i < optionsCount; i++) {
            const card = options.nth(i);
            const text = (await card.innerText().catch(() => "")).trim();

            if (text.toLowerCase().includes(departmentName.toLowerCase())) {
              await card.click();

              // Пробуем найти количество сотрудников в тексте карточки
              const employeesMatch = text.match(/(\d+)\s+сотрудник/);
              const employees = employeesMatch ? Number(employeesMatch[1]) : 0;

              // Название - первая строка текста
              const name = text.split("\n")[0].trim();

              selectedDepartments.push({ name, employees });
              console.log(
                `✓ Выбран отдел: "${name}" (${employees} сотрудников)`,
              );
              break;
            }
          }
        } else {
          // Выбираем первые N отделов (пропускаем "Все сотрудники" - это не отдел)
          let selected = 0;
          for (let i = 0; i < optionsCount && selected < count; i++) {
            const card = options.nth(i);
            // Название отдела - весь текст карточки (название под аватаркой)
            const text = (await card.innerText().catch(() => "")).trim();
            // Убираем переносы строк - название может быть многострочным
            const name = text.replace(/\n/g, " ").trim();

            // Пропускаем "Все сотрудники"
            if (name.toLowerCase() === "все сотрудники") {
              continue;
            }

            // Пробуем найти количество сотрудников
            const employeesMatch = text.match(/(\d+)\s+сотрудник/);
            const employees = employeesMatch ? Number(employeesMatch[1]) : 0;

            if (name) {
              await card.click();
              selectedDepartments.push({ name, employees });
              console.log(
                `✓ Выбран отдел #${selected + 1}: "${name}" (${employees} сотрудников)`,
              );
              selected++;
            }
          }
        }

        // Дождаться обработки выбора
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});

        // Кнопка "Подтвердить" (scoped к modal)
        const confirmButton = modal
          .locator("button")
          .filter({ hasText: "Подтвердить" })
          .first();
        await confirmButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await confirmButton.click();

        // Дождаться закрытия модального окна
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });

        console.log(`✓ Добавлено отделов: ${selectedDepartments.length}`);
        return selectedDepartments;
      },
    );
  }

  /**
   * Добавить участников из группы
   * @param {Object} options
   * @param {number} options.count - Количество групп для выбора (по умолчанию 1)
   * @param {string} options.groupName - Название конкретной группы (если указано, выбирается она)
   * @returns {Promise<Array<{name: string}>>} - Массив выбранных групп
   */
  async addTargetUsersFromGroup({ count = 1, groupName = null } = {}) {
    return this._step(
      `Добавить участников из ${groupName || count + " группы"}`,
      async () => {
        await this.goToStep("targetUsers");

        // Нажать кнопку "Добавить участника"
        const addButton = this.page
          .getByRole("button", { name: /добавить участника/i })
          .first();
        await addButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await addButton.click();

        // Модальное окно выбора пользователей
        const modal = this.page
          .locator('[class*="Modal"]')
          .filter({ hasText: "Кого еще вы хотите оценить" })
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Переключиться на вкладку "Группы"
        const groupsTab = modal
          .getByRole("button", { name: /^Группы$/i })
          .or(
            modal
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /^Группы$/i }),
          )
          .first();

        await groupsTab.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await groupsTab.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});
        console.log('✓ Переключились на вкладку "Группы"');

        // Найти опции групп — div.Option_option-item обёртки
        const options = modal.locator('[class*="Option_option-item"]');
        await options
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        const optionsCount = await options.count();
        console.log(`Найдено групп: ${optionsCount}`);

        const selectedGroups = [];

        if (groupName) {
          // Выбираем конкретную группу по названию
          for (let i = 0; i < optionsCount; i++) {
            const card = options.nth(i);
            const text = (await card.innerText().catch(() => "")).trim();

            if (text.toLowerCase().includes(groupName.toLowerCase())) {
              await card.click();
              selectedGroups.push({ name: text });
              console.log(`✓ Выбрана группа: "${text}"`);
              break;
            }
          }
        } else {
          // Выбираем первые N групп (пропускаем "Все сотрудники" - это не группа)
          let selected = 0;
          for (let i = 0; i < optionsCount && selected < count; i++) {
            const card = options.nth(i);
            const text = (await card.innerText().catch(() => "")).trim();
            // Убираем переносы строк и эмодзи для чистого названия
            const name = text.replace(/\n/g, " ").trim();

            // Пропускаем "Все сотрудники" - это универсальный элемент на всех вкладках
            if (name.toLowerCase() === "все сотрудники") {
              continue;
            }

            if (name) {
              await card.click();
              selectedGroups.push({ name });
              console.log(`✓ Выбрана группа #${selected + 1}: "${name}"`);
              selected++;
            }
          }
        }

        // Дождаться обработки выбора
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});

        // Кнопка "Подтвердить" (scoped к modal)
        const confirmButton = modal
          .locator("button")
          .filter({ hasText: "Подтвердить" })
          .first();
        await confirmButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await confirmButton.click();

        // Дождаться закрытия модального окна
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });

        console.log(`✓ Добавлено групп: ${selectedGroups.length}`);
        return selectedGroups;
      },
    );
  }

  /**
   * Получить количество добавленных участников из таблицы на шаге "Выбор участников"
   * @returns {Promise<number>}
   */
  async getTargetUsersCount() {
    return this._step("Получить количество участников", async () => {
      await this.goToStep("targetUsers");

      // Ищем таблицу с добавленными участниками
      const userRows = this.page
        .locator(
          'tr[class*="Table_row"], [class*="UserCard"], [class*="Option_option-item"]',
        )
        .filter({
          has: this.page.locator('[class*="Avatar"], [class*="User"]'),
        });

      const count = await userRows.count();
      console.log(`Количество участников: ${count}`);
      return count;
    });
  }

  // ---------------------------------------------------------------------------
  // Шаг 3: Регулярные напоминания (notifications)
  // ---------------------------------------------------------------------------

  /**
   * Отключить регулярные напоминания (чтобы не спамить в тестах)
   */
  async disableReminders() {
    await this._step("Отключить регулярные напоминания", async () => {
      await this.goToStep("notifications");

      // Найти чекбокс включения напоминаний
      const reminderToggle = this.page
        .locator('input[type="checkbox"][name="enableReminds"]')
        .first();
      const isChecked = await reminderToggle.isChecked().catch(() => false);

      if (isChecked) {
        await reminderToggle.click();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Шаг 4: Анкеты (assessments)
  // ---------------------------------------------------------------------------

  /**
   * Добавить анкеты для всех активных направлений оценки
   * @param {Object} options - Опции
   * @param {string} options.assessmentName - Название анкеты для выбора (если не указано - выбирается "с компетенциями" или первая доступная)
   *                                          Можно передать через env: PR_ASSESSMENT_NAME
   */
  async addAssessmentsForAllDirections({ assessmentName = null } = {}) {
    // Поддержка env переменной и seed-файла для названия анкеты
    let targetAssessment = assessmentName || process.env.PR_ASSESSMENT_NAME || null;

    // Если не задано явно — читаем из seed-файла (создаётся в global-setup)
    if (!targetAssessment) {
      try {
        const seedFile = path.resolve("test-results/.seed-assessment-name");
        targetAssessment = fs.readFileSync(seedFile, "utf-8").trim() || null;
      } catch {
        // seed-файл не создан — будет использована первая доступная анкета
      }
    }

    await this._step("Добавить анкеты для всех направлений", async () => {
      await this.goToStep("assessments");

      if (targetAssessment) {
        console.log(`🎯 Ищем анкету по названию: "${targetAssessment}"`);
      }

      // Найти секцию с таблицей анкет: <div class="Section_section__Ygq0N">
      const assessmentsSection = this.page
        .locator('[class*="Section_section"]')
        .filter({ hasText: "Выберите анкеты для респондентов" })
        .first();

      // Найти все кнопки "Добавить" внутри этой секции с классом AddButton
      const addButtons = assessmentsSection
        .locator('button[class*="AddButton"]')
        .filter({ hasText: "Добавить" });
      const count = await addButtons.count();

      console.log(`Найдено направлений для добавления анкет: ${count}`);

      // Добавить анкету для каждого направления
      // Идём по строкам таблицы (каждая строка = направление оценки)
      const rows = assessmentsSection.locator('tr[class*="Table_row"]');
      const rowCount = await rows.count();

      console.log(`Найдено строк в таблице: ${rowCount}`);

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);

        // Проверить, есть ли в этой строке кнопка "Добавить"
        const addButton = row
          .locator('button[class*="AddButton"]')
          .filter({ hasText: "Добавить" });
        const hasAddButton = await addButton.isVisible().catch(() => false);

        if (!hasAddButton) {
          console.log(
            `Строка ${i + 1}: кнопка "Добавить" не найдена (возможно, анкета уже добавлена)`,
          );
          continue;
        }

        // Получить название направления
        const directionTitle = await row
          .locator('[class*="direction-title"]')
          .innerText()
          .catch(() => `Направление ${i + 1}`);
        console.log(`Строка ${i + 1}: ${directionTitle} - добавляем анкету`);

        // Кликнуть "Добавить"
        await addButton.scrollIntoViewIfNeeded().catch(() => {});
        await addButton.click({ force: true });

        // Модальное окно выбора анкеты
        const modal = this.page
          .locator('[class*="Modal"]')
          .filter({ hasText: "анкет" })
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });

        let selectedAssessment = false;

        // Ждём загрузку списка анкет (контент грузится асинхронно после открытия модалки)
        const selectButtons = modal
          .locator("button")
          .filter({ hasText: "Выбрать" });
        await selectButtons
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {
            console.log(
              '  ⚠️ Кнопки "Выбрать" не появились — модалка может быть пустой',
            );
          });
        const buttonCount = await selectButtons.count();
        console.log(`  Найдено кнопок "Выбрать": ${buttonCount}`);

        // Собираем информацию о всех анкетах
        const assessments = [];
        for (let j = 0; j < buttonCount; j++) {
          const btn = selectButtons.nth(j);
          const cardText = await btn.evaluate((el) => {
            let parent = el.parentElement;
            for (let k = 0; k < 4 && parent; k++) {
              parent = parent.parentElement;
            }
            return parent
              ? parent.innerText
              : el.parentElement?.innerText || "";
          });
          const shortText =
            cardText.split("\n")[0] || cardText.substring(0, 30);
          assessments.push({ btn, cardText, shortText });
          console.log(`  Анкета ${j + 1}: "${shortText}"`);
        }

        // 1. Если указано название анкеты - ищем её
        if (targetAssessment && !selectedAssessment) {
          for (const { btn, cardText, shortText } of assessments) {
            if (
              cardText.toLowerCase().includes(targetAssessment.toLowerCase())
            ) {
              await btn.click();
              console.log(`  ✓ Выбрана анкета по названию: "${shortText}"`);
              selectedAssessment = true;
              break;
            }
          }
          if (!selectedAssessment) {
            console.log(
              `  ⚠️ Анкета "${targetAssessment}" не найдена, используем fallback`,
            );
          }
        }

        // 2. Fallback: ищем анкету с компетенциями
        if (!selectedAssessment) {
          for (const { btn, cardText, shortText } of assessments) {
            if (cardText.toLowerCase().includes("компетенц")) {
              await btn.click();
              console.log(`  ✓ Выбрана анкета с компетенциями: "${shortText}"`);
              selectedAssessment = true;
              break;
            }
          }
        }

        // 3. Fallback: берём первую не "со ссылкой"
        if (!selectedAssessment) {
          for (const { btn, cardText, shortText } of assessments) {
            if (cardText.toLowerCase().includes("ссылк")) {
              console.log(`  Пропускаем: "${shortText}" (со ссылкой)`);
              continue;
            }
            await btn.click();
            console.log(`  ✓ Выбрана анкета: "${shortText}"`);
            selectedAssessment = true;
            break;
          }
        }

        // 4. Крайний fallback - просто выбираем первую
        if (!selectedAssessment && buttonCount > 0) {
          await selectButtons.first().click();
          console.log(`  ✓ Выбрана первая анкета (fallback)`);
        }

        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        // Подтвердить выбор - ищем кнопку "Подтвердить" внутри модального окна
        const confirmButton = modal
          .locator("button")
          .filter({ hasText: /^Подтвердить$/i })
          .first();
        const confirmVisible = await confirmButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (confirmVisible) {
          await confirmButton.click();
          console.log('  ✓ Нажата кнопка "Подтвердить"');
        } else {
          // Fallback: ищем кнопку в footer или просто по тексту
          const fallbackConfirm = this.page
            .locator("button")
            .filter({ hasText: /^Подтвердить$/i })
            .first();
          if (
            await fallbackConfirm
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await fallbackConfirm.click();
            console.log('  ✓ Нажата кнопка "Подтвердить" (fallback)');
          }
        }

        // Дождаться закрытия модального окна
        await modal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(async () => {
            // Если модальное окно не закрылось, попробовать кликнуть кнопку закрытия
            const closeButton = modal
              .locator('[class*="close"], button[aria-label="close"]')
              .first();
            if (
              await closeButton
                .waitFor({ state: "visible", timeout: 1000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await closeButton.click();
            }
          });

        console.log(`✓ Анкета добавлена для: ${directionTitle}`);
      }

      console.log(`✓ Обработаны все ${rowCount} строк таблицы`);
    });
  }

  // ---------------------------------------------------------------------------
  // Навигация по шагам
  // ---------------------------------------------------------------------------

  /**
   * Нажать кнопку "Далее"
   */
  async clickNext() {
    await this._step('Нажать "Далее"', async () => {
      await this.nextButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.nextButton.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});
    });
  }

  /**
   * Нажать кнопку "Назад"
   */
  async clickBack() {
    await this._step('Нажать "Назад"', async () => {
      await this.backButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.backButton.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});
    });
  }

  /**
   * Сохранить черновик
   */
  async saveDraft() {
    await this._step("Сохранить черновик", async () => {
      const visible = await this.saveButton.isVisible().catch(() => false);
      if (visible) {
        await this.saveButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
      }
    });
  }

  /**
   * Сохранить и подтвердить изменения в запущенном PR.
   * Fail-fast: бросает ошибку если кнопка "Сохранить" или "Подтвердить" не найдена.
   *
   * Последовательность UI:
   * 1. Кнопка "Сохранить" в боковой панели
   * 2. Модалка "Подтвердите изменения" → кнопка "Подтвердить изменения"
   * 3. (опционально) Модалка "Изменения сохранены" → кнопка "Перейти в карточку оценки"
   */
  async saveAndConfirmChanges() {
    await this._step("Сохранить и подтвердить изменения", async () => {
      const saveButton = this.page
        .getByRole("button", { name: /сохранить/i })
        .first();
      await saveButton.waitFor({ state: "visible", timeout: 10_000 });
      await saveButton.click();
      console.log('✓ Кнопка "Сохранить" нажата');

      // UI может показать разные варианты подтверждения:
      // 1. Кнопка "Подтвердить изменения"
      // 2. Панель "Изменение участников оценки" с кнопками "Отменить" / "Сохранить"
      const confirmButton = this.page
        .getByRole("button", { name: /подтвердить изменения/i })
        .first();
      const changePanelText = this.page
        .getByText(/изменение участников оценки/i)
        .first();

      // Ждём появления любого из двух вариантов
      await Promise.race([
        confirmButton
          .waitFor({ state: "visible", timeout: 10_000 })
          .catch(() => {}),
        changePanelText
          .waitFor({ state: "visible", timeout: 10_000 })
          .catch(() => {}),
      ]);

      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
        console.log('✓ Кнопка "Подтвердить изменения" нажата');
      } else if (await changePanelText.isVisible().catch(() => false)) {
        console.log('✓ Панель "Изменение участников оценки" появилась');
        // Кнопка "Сохранить" внутри панели — ищем последнюю видимую (панельная, не основная)
        const panelSaveButton = this.page
          .getByRole("button", { name: /^сохранить$/i })
          .last();
        await panelSaveButton.waitFor({ state: "visible", timeout: 5_000 });
        await panelSaveButton.click();
        console.log('✓ Кнопка "Сохранить" в панели подтверждения нажата');
      } else {
        throw new Error(
          'Ни "Подтвердить изменения", ни панель "Изменение участников оценки" не появились',
        );
      }

      await this.page.waitForLoadState("networkidle");

      // Опциональная модалка "Изменения сохранены"
      const goToCardButton = this.page
        .getByRole("button", { name: /перейти в карточку оценки/i })
        .first();
      if (
        await goToCardButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await goToCardButton.click();
        console.log('✓ Нажали "Перейти в карточку оценки"');
        await this.page.waitForLoadState("networkidle");
      }

      console.log("✓ Изменения сохранены и подтверждены");
    });
  }

  /**
   * Запустить оценку
   */
  async launch() {
    await this._step("Запустить оценку", async () => {
      await this.launchButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.launchButton.click();

      // Подтверждение запуска — кнопка "Да, отправить" в popup (НЕ Modal-класс)
      // ВАЖНО: isVisible() НЕ ждёт (timeout deprecated) — используем waitFor
      const confirmButton = this.page.getByRole("button", {
        name: "Да, отправить",
      });
      try {
        await confirmButton.waitFor({ state: "visible", timeout: 5_000 });
        await confirmButton.click();
        await confirmButton
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        console.log("✓ Подтверждение запуска выполнено");
      } catch {
        // Popup не появился — возможно запуск без подтверждения
      }

      // После подтверждения может быть редирект
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
    });
  }

  /**
   * Отправить на этап выбора коллег (когда включен ручной выбор)
   * Это кнопка "Запустить", которая при ручном выборе коллег отправляет на этап подбора
   */
  async sendForColleagueSelection() {
    await this._step("Отправить на выбор коллег", async () => {
      // Кнопка "Запустить" (даже при ручном выборе коллег она так называется)
      await this.launchButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.launchButton.click();

      // Подтверждение запуска — waitFor вместо isVisible (который не ждёт)
      const confirmButton = this.page.getByRole("button", {
        name: "Да, отправить",
      });
      try {
        await confirmButton.waitFor({ state: "visible", timeout: 3_000 });
        await confirmButton.click();
        await confirmButton
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      } catch {
        // Popup не появился
      }

      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log("✓ Отправлено на этап выбора коллег");
    });
  }

  // ---------------------------------------------------------------------------
  // Упрощённый флоу настройки (для быстрых тестов)
  // ---------------------------------------------------------------------------

  /**
   * Пройти все шаги настройки с заполнением обязательных полей и запустить оценку
   * @param {Object} options
   * @param {number} options.targetUsersCount - Количество участников (по умолчанию 1)
   */
  async quickSetupAndLaunch({ targetUsersCount = 1 } = {}) {
    await this._step(
      "Быстрая настройка и запуск Performance Review",
      async () => {
        // Шаг 1: Направления оценки (оставляем по умолчанию)
        // По умолчанию включены Самооценка и От руководителя

        // Шаг 2: Добавить участников (ОБЯЗАТЕЛЬНО)
        await this.addTargetUsers({ count: targetUsersCount });

        // Шаг 3: Отключить напоминания (чтобы не спамить)
        await this.disableReminders();

        // Шаг 4: Добавить анкеты для всех направлений (ОБЯЗАТЕЛЬНО)
        await this.addAssessmentsForAllDirections();

        // Шаги 5-6: Администрирование и Анонимность (оставляем по умолчанию)

        // Шаг 7: Перейти к запуску и запустить
        await this.goToStep("launch");
        await this.launch();

        console.log("✓ Performance Review успешно настроен и запущен");
      },
    );
  }

  /**
   * Завершить текущий этап Performance Review (например, подбор коллег)
   */
  async completeCurrentStage() {
    await this._step("Завершить текущий этап", async () => {
      // Найти кнопку "Завершить этап" (оранжевая кнопка)
      const completeButton = this.page
        .locator('button[class*="Button_button"][class*="color-warning"]')
        .filter({ hasText: /завершить этап/i })
        .first();

      await completeButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await completeButton.click();

      console.log('✓ Кнопка "Завершить этап" нажата');

      // Подтвердить завершение этапа в popup (вторая кнопка "Завершить этап" — из подтверждения)
      const confirmButton = this.page
        .getByRole("button", { name: /завершить этап/i })
        .last();
      try {
        await confirmButton.waitFor({ state: "visible", timeout: 3_000 });
        await confirmButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Этап завершен (подтверждение в модальном окне)");
      } catch {
        // Popup подтверждения не появился
      }
    });
  }

  /**
   * Редактировать таблицу респондентов на этапе создания оценки
   * Позволяет добавить руководителя, подчиненных и коллег из списка активных пользователей
   * @param {Object} options
   * @param {Array} options.managers - Массив пользователей для добавления как руководителей [{name, email}]
   * @param {Array} options.subordinates - Массив пользователей для добавления как подчиненных [{name, email}]
   * @param {Array} options.colleagues - Массив пользователей для добавления как коллег [{name, email}]
   * @returns {Object} Объект с массивами фактически добавленных респондентов { addedManagers, addedSubordinates, addedColleagues }
   */
  async editRespondentsTable({
    managers = [],
    subordinates = [],
    colleagues = [],
  } = {}) {
    const result = {
      addedManagers: [],
      addedSubordinates: [],
      addedColleagues: [],
    };

    await this._step("Редактировать таблицу респондентов", async () => {
      // Находим таблицу респондентов
      const table = this.page
        .locator(
          '.TableFirstFreeze_table__9wBIr, table[class*="TableFirstFreeze"]',
        )
        .first();
      await table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      console.log("✓ Таблица респондентов найдена");

      // Добавить руководителей
      if (managers.length > 0) {
        console.log(`📝 Добавляем руководителей (${managers.length} чел)...`);

        // Находим ячейку "Оценка от руководителя"
        const managerCell = this.page
          .locator('td[data-title="Оценка от руководителя"]')
          .first();
        await managerCell.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });

        // Получаем уже добавленных респондентов
        const existingManagers = await managerCell
          .locator(".Option_title__GGOnc")
          .allInnerTexts();
        console.log(
          `  Уже добавлены: ${existingManagers.join(", ") || "никто"}`,
        );

        for (const manager of managers) {
          // Проверяем, не добавлен ли уже
          if (existingManagers.some((name) => name.includes(manager.name))) {
            console.log(
              `  ⚠️ ${manager.name} уже добавлен как руководитель, пропускаем`,
            );
            continue;
          }

          console.log(`  📝 Добавляем руководителя: ${manager.name}...`);

          // Кликаем на кнопку "Добавить" в ячейке руководителя
          const addButton = managerCell
            .locator("button")
            .filter({ hasText: "Добавить" })
            .first();
          await addButton.click();

          // Ждём модальное окно - "Добавить Оценка от руководителя"
          const modal = this.page
            .locator('[class*="SheetModal"], [class*="Modal"]')
            .filter({ hasText: /добавить|руководител|сотрудник/i })
            .first();
          await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          console.log(`  ✓ Модальное окно открыто`);

          // Используем поле поиска для нахождения пользователя
          const searchInput = modal.locator("input").first();
          const isSearchVisible = await searchInput
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Поле поиска видно: ${isSearchVisible}`);

          if (isSearchVisible) {
            await searchInput.clear();
            await searchInput.fill(manager.name);
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});
            console.log(`  🔍 Поиск: "${manager.name}"`);
          }

          // Ищем пользователя по имени в результатах
          let userRow = modal
            .locator("div")
            .filter({ hasText: new RegExp(`^${manager.name}$`, "i") })
            .first();

          if (
            !(await userRow
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false))
          ) {
            userRow = modal.getByText(manager.name, { exact: false }).first();
          }

          let userFound = await userRow
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Пользователь найден: ${userFound}`);

          if (userFound) {
            await userRow.click();
            console.log(`  ✓ Выбран руководитель: ${manager.name}`);
          } else {
            console.log(`  ⚠️ ${manager.name} не найден в результатах поиска`);
          }

          // Закрыть модалку - подтвердить
          const confirmButton = modal
            .locator("button")
            .filter({ hasText: /подтвердить/i })
            .first();
          if (
            await confirmButton
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await confirmButton.click();
            console.log(`  ✓ Модалка закрыта (Подтвердить)`);
          } else {
            const closeButton = modal
              .locator('button[aria-label="close"], [class*="close"]')
              .first();
            if (
              await closeButton
                .waitFor({ state: "visible", timeout: 1000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await closeButton.click();
            } else {
              await this.page.keyboard.press("Escape");
            }
            console.log(`  ✓ Модалка закрыта (Escape/Close)`);
          }
        }
      }

      // Добавить подчиненных
      if (subordinates.length > 0) {
        console.log(`📝 Добавляем подчиненных (${subordinates.length} чел)...`);

        // Находим ячейку "Оценка от подчиненных"
        const subordinatesCell = this.page
          .locator('td[data-title="Оценка от подчиненных"]')
          .first();
        await subordinatesCell.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });

        // Получаем уже добавленных респондентов
        const existingSubordinates = await subordinatesCell
          .locator(".Option_title__GGOnc")
          .allInnerTexts();
        console.log(
          `  Уже добавлены: ${existingSubordinates.join(", ") || "никто"}`,
        );

        for (const subordinate of subordinates) {
          // Проверяем, не добавлен ли уже
          if (
            existingSubordinates.some((name) => name.includes(subordinate.name))
          ) {
            console.log(
              `  ⚠️ ${subordinate.name} уже добавлен как подчиненный, пропускаем`,
            );
            continue;
          }

          console.log(`  📝 Добавляем подчиненного: ${subordinate.name}...`);

          // Кликаем на кнопку "Добавить" в ячейке подчиненных
          const addButton = subordinatesCell
            .locator("button")
            .filter({ hasText: "Добавить" })
            .first();
          await addButton.click();

          // Ждём модальное окно - "Добавить Оценка от подчиненных"
          const modal = this.page
            .locator('[class*="SheetModal"], [class*="Modal"]')
            .filter({ hasText: /добавить|подчиненн|сотрудник/i })
            .first();
          await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          console.log(`  ✓ Модальное окно открыто`);

          // Используем поле поиска для нахождения пользователя
          // На скриншоте: placeholder="Имя, фамилия или почта"
          const searchInput = modal.locator("input").first();
          const isSearchVisible = await searchInput
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Поле поиска видно: ${isSearchVisible}`);

          if (isSearchVisible) {
            // Очищаем и вводим имя для поиска
            await searchInput.clear();
            await searchInput.fill(subordinate.name);
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});
            console.log(`  🔍 Поиск: "${subordinate.name}"`);
          }

          // Ищем пользователя по имени в результатах
          // На скриншоте карточки пользователей - ищем по имени
          let userRow = modal
            .locator("div")
            .filter({ hasText: new RegExp(`^${subordinate.name}$`, "i") })
            .first();

          // Если не нашли точное совпадение, ищем содержащий текст
          if (
            !(await userRow
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false))
          ) {
            userRow = modal
              .locator(
                '[class*="UserCard"], [class*="Option"], [class*="Avatar"]',
              )
              .locator(
                'xpath=ancestor::div[contains(@class, "Option") or contains(@class, "Card") or contains(@class, "User")]',
              )
              .filter({ hasText: subordinate.name })
              .first();
          }

          // Fallback - просто ищем текст в модалке
          if (
            !(await userRow
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false))
          ) {
            userRow = modal
              .getByText(subordinate.name, { exact: false })
              .first();
          }

          let userFound = await userRow
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Пользователь найден: ${userFound}`);

          if (userFound) {
            await userRow.click();
            console.log(`  ✓ Выбран подчиненный: ${subordinate.name}`);
          } else {
            console.log(
              `  ⚠️ ${subordinate.name} не найден в результатах поиска`,
            );
          }

          // Закрыть модалку - подтвердить
          const confirmButton = modal
            .locator("button")
            .filter({ hasText: /подтвердить/i })
            .first();
          if (
            await confirmButton
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await confirmButton.click();
            console.log(`  ✓ Модалка закрыта (Подтвердить)`);
          } else {
            // Закрыть по крестику или Escape
            const closeButton = modal
              .locator('button[aria-label="close"], [class*="close"]')
              .first();
            if (
              await closeButton
                .waitFor({ state: "visible", timeout: 1000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await closeButton.click();
            } else {
              await this.page.keyboard.press("Escape");
            }
            console.log(`  ✓ Модалка закрыта (Escape/Close)`);
          }
        }
      }

      // Добавить коллег (при автоматическом выборе коллег)
      if (colleagues.length > 0) {
        console.log(`📝 Добавляем коллег (${colleagues.length} чел)...`);

        // Находим ячейку "Оценка от коллег"
        const colleaguesCell = this.page
          .locator('td[data-title="Оценка от коллег"]')
          .first();
        const colleaguesCellVisible = await colleaguesCell
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);

        if (!colleaguesCellVisible) {
          console.log(
            '  ⚠️ Ячейка "Оценка от коллег" не найдена - возможно выбран ручной подбор коллег',
          );
        } else {
          // Получаем уже добавленных респондентов
          const existingColleagues = await colleaguesCell
            .locator(".Option_title__GGOnc")
            .allInnerTexts();
          console.log(
            `  Уже добавлены: ${existingColleagues.join(", ") || "никто"}`,
          );

          for (const colleague of colleagues) {
            // Проверяем, не добавлен ли уже
            if (
              existingColleagues.some((name) => name.includes(colleague.name))
            ) {
              console.log(
                `  ⚠️ ${colleague.name} уже добавлен как коллега, пропускаем`,
              );
              continue;
            }

            console.log(`  📝 Добавляем коллегу: ${colleague.name}...`);

            // Кликаем на кнопку "Добавить" в ячейке коллег
            const addButton = colleaguesCell
              .locator("button")
              .filter({ hasText: "Добавить" })
              .first();
            await addButton.click();

            // Ждём модальное окно
            const modal = this.page
              .locator('[class*="SheetModal"], [class*="Modal"]')
              .filter({ hasText: /добавить|коллег|сотрудник/i })
              .first();
            await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            console.log(`  ✓ Модальное окно открыто`);

            // Используем поле поиска для нахождения пользователя
            const searchInput = modal.locator("input").first();
            const isSearchVisible = await searchInput
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false);
            console.log(`  Поле поиска видно: ${isSearchVisible}`);

            if (isSearchVisible) {
              await searchInput.clear();
              await searchInput.fill(colleague.name);
              await this.page
                .waitForLoadState("networkidle", { timeout: 15_000 })
                .catch(() => {});
              console.log(`  🔍 Поиск: "${colleague.name}"`);
            }

            // Ищем пользователя по имени в результатах
            let userRow = modal
              .locator("div")
              .filter({ hasText: new RegExp(`^${colleague.name}$`, "i") })
              .first();

            if (
              !(await userRow
                .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true)
                .catch(() => false))
            ) {
              userRow = modal
                .getByText(colleague.name, { exact: false })
                .first();
            }

            let userFound = await userRow
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false);
            console.log(`  Пользователь найден: ${userFound}`);

            if (userFound) {
              await userRow.click();
              console.log(`  ✓ Выбран коллега: ${colleague.name}`);
              result.addedColleagues.push(colleague);
            } else {
              console.log(
                `  ⚠️ ${colleague.name} не найден в результатах поиска`,
              );
            }

            // Закрыть модалку - подтвердить
            const confirmButton = modal
              .locator("button")
              .filter({ hasText: /подтвердить/i })
              .first();
            if (
              await confirmButton
                .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await confirmButton.click();
              console.log(`  ✓ Модалка закрыта (Подтвердить)`);
            } else {
              const closeButton = modal
                .locator('button[aria-label="close"], [class*="close"]')
                .first();
              if (
                await closeButton
                  .waitFor({ state: "visible", timeout: 1000 })
                  .then(() => true)
                  .catch(() => false)
              ) {
                await closeButton.click();
              } else {
                await this.page.keyboard.press("Escape");
              }
              console.log(`  ✓ Модалка закрыта (Escape/Close)`);
            }
          }
        }
      }

      // Убедиться, что все модалки закрыты
      const anyModal = this.page
        .locator('[class*="Modal"], [class*="Sheet"]')
        .filter({ hasText: /выбер|сотрудник|добавить/i })
        .first();
      if (
        await anyModal
          .waitFor({ state: "visible", timeout: 1000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await this.page.keyboard.press("Escape");
      }

      console.log("✓ Таблица респондентов отредактирована");
    });

    return result;
  }

  /**
   * Запустить оценку и сразу отправить анкеты (для автоматического выбора коллег)
   * Используется когда не нужен этап подбора коллег
   */
  async launchAndSendQuestionnaires() {
    await this._step("Запустить и отправить анкеты", async () => {
      // Кнопка "Запустить"
      await this.launchButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.launchButton.click();

      // Подтверждение запуска — waitFor вместо isVisible (который не ждёт)
      const confirmButton = this.page.getByRole("button", {
        name: "Да, отправить",
      });
      try {
        await confirmButton.waitFor({ state: "visible", timeout: 5_000 });
        await confirmButton.click();
        console.log('  ✓ Подтверждение запуска: нажата "Да, отправить"');
        await confirmButton
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      } catch {
        // Popup не появился — возможно запуск без подтверждения
      }

      console.log("✓ Оценка запущена");

      // После запуска ищем кнопку "Отправить анкеты"
      const sendButton = this.page.getByRole("button", {
        name: /отправить анкеты/i,
      });
      let sendVisible = false;
      try {
        await sendButton.waitFor({ state: "visible", timeout: 5_000 });
        sendVisible = true;
      } catch {
        // Кнопка не появилась
      }

      if (sendVisible) {
        await sendButton.click();

        // Подтвердить отправку — кнопка "Да, отправить"
        const sendConfirmButton = this.page.getByRole("button", {
          name: "Да, отправить",
        });
        try {
          await sendConfirmButton.waitFor({ state: "visible", timeout: 3_000 });
          await sendConfirmButton.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
        } catch {
          // Нет подтверждения отправки
        }

        console.log("✓ Анкеты отправлены");
      } else {
        console.log(
          '⚠️ Кнопка "Отправить анкеты" не найдена - возможно анкеты отправлены автоматически',
        );
      }
    });
  }

  /**
   * Отправить анкеты участникам
   */
  async sendQuestionnaires() {
    await this._step("Отправить анкеты", async () => {
      // Найти кнопку "Отправить анкеты"
      const sendButton = this.page
        .locator('button[class*="Button_button"][class*="color-primary"]')
        .filter({ hasText: /отправить анкеты/i })
        .first();

      await sendButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await sendButton.click();

      console.log('✓ Кнопка "Отправить анкеты" нажата');

      // Подтвердить отправку — кнопка "Да, отправить" в popup
      const confirmButton = this.page.getByRole("button", {
        name: "Да, отправить",
      });
      try {
        await confirmButton.waitFor({ state: "visible", timeout: 3_000 });
        await confirmButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Анкеты отправлены (подтверждение в модальном окне)");
      } catch {
        // Popup не появился
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Вкладка "Результаты" (для админа)
  // ---------------------------------------------------------------------------

  /**
   * Перейти на вкладку "Результаты"
   */
  async goToResultsTab() {
    await this._step('Перейти на вкладку "Результаты"', async () => {
      const resultsTab = this.page
        .locator('button[class*="Tabs_button"]')
        .filter({ hasText: /^результаты$/i });

      await resultsTab.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await resultsTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});
      console.log('✓ Переключились на вкладку "Результаты"');
    });
  }

  /**
   * Перейти на вкладку "Заполнение анкет" -> "Оцениваемые"
   * Вкладка доступна после запуска PR и содержит таблицу с оцениваемыми
   */
  async goToEvaluatedTab() {
    await this._step('Перейти на вкладку "Оцениваемые"', async () => {
      // Сначала кликаем на "Заполнение анкет" (верхняя вкладка)
      const fillTabVisible = await this.fillQuestionnairesTab
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (fillTabVisible) {
        await this.fillQuestionnairesTab.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});
        console.log('✓ Переключились на вкладку "Заполнение анкет"');
      }

      // Затем кликаем на "Оцениваемые" (подвкладка)
      await this.evaluatedTab.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.evaluatedTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});
      console.log('✓ Переключились на подвкладку "Оцениваемые"');
    });
  }

  /**
   * Перейти на вкладку "Заполнение анкет" -> "Респонденты"
   * Вкладка доступна после запуска PR и содержит таблицу с респондентами
   */
  async goToRespondentsTab() {
    await this._step('Перейти на вкладку "Респонденты"', async () => {
      // Сначала кликаем на "Заполнение анкет" (верхняя вкладка)
      const fillTabVisible = await this.fillQuestionnairesTab
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (fillTabVisible) {
        await this.fillQuestionnairesTab.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});
        console.log('✓ Переключились на вкладку "Заполнение анкет"');
      }

      // Затем кликаем на "Респонденты" (подвкладка)
      const respondentsTab = this.page
        .locator('button, [role="tab"]')
        .filter({ hasText: /^респонденты$/i })
        .first();
      await respondentsTab.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await respondentsTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});
      console.log('✓ Переключились на подвкладку "Респонденты"');
    });
  }

  /**
   * Перейти к результатам конкретного сотрудника через кнопку "Результаты" в таблице
   *
   * На вкладке "Результаты" внизу страницы есть таблица с оцениваемыми:
   * - Чекбокс
   * - Имя сотрудника
   * - Статус
   * - Кнопка "Результаты"
   *
   * @param {string} userName - Имя пользователя в таблице
   * @returns {Promise<string>} - URL страницы результатов
   */
  async clickResultsButtonForUser(userName) {
    return this._step(`Открыть результаты для ${userName}`, async () => {
      // Переходим на вкладку "Результаты" (там внизу есть таблица с кнопками)
      await this.goToResultsTab();

      // Скроллим вниз чтобы увидеть таблицу с пользователями
      await this.page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );

      // Проверяем что пользователь есть на странице
      const userNameElement = this.page
        .getByText(userName, { exact: false })
        .first();
      await userNameElement.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      console.log(`✓ Найден пользователь: ${userName}`);

      // Кнопка "Результаты" - это BUTTON с классом BorderedButton
      // Находим все кнопки "Результаты" на странице (их может быть несколько если несколько пользователей)
      const allResultsButtons = this.page
        .locator('button[class*="BorderedButton"]')
        .filter({ hasText: /^результаты$/i });

      const buttonsCount = await allResultsButtons.count();
      console.log(`Найдено кнопок "Результаты": ${buttonsCount}`);

      if (buttonsCount === 0) {
        throw new Error('Кнопки "Результаты" не найдены на странице');
      }

      // Если кнопка одна - кликаем на неё
      if (buttonsCount === 1) {
        await allResultsButtons.first().click();
        console.log('✓ Кликнули на единственную кнопку "Результаты"');
      } else {
        // Если кнопок несколько - находим ту, что связана с нужным пользователем
        // Ищем строку таблицы содержащую имя пользователя
        // Кастомная таблица может использовать разные контейнеры

        // Способ 1: Ищем ближайший контейнер с пользователем и кнопкой
        let clicked = false;

        // Пробуем найти через tr (стандартная таблица)
        const tableRow = this.page
          .locator("tr")
          .filter({ hasText: userName })
          .first();
        let rowExists = await tableRow
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (rowExists) {
          const btnInRow = tableRow
            .locator("button")
            .filter({ hasText: /результаты/i })
            .first();
          if (
            await btnInRow
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await btnInRow.click();
            clicked = true;
            console.log("✓ Кликнули через tr");
          }
        }

        // Способ 2: Кликаем на первую видимую кнопку (если одна строка)
        if (!clicked) {
          const firstVisibleBtn = allResultsButtons.first();
          if (
            await firstVisibleBtn
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await firstVisibleBtn.click();
            clicked = true;
            console.log("✓ Кликнули на первую видимую кнопку");
          }
        }

        if (!clicked) {
          throw new Error(
            `Не удалось кликнуть на кнопку "Результаты" для ${userName}`,
          );
        }
      }

      // Дождаться навигации на страницу результатов
      await this.page.waitForURL(/\/results\/|targetUserId=/, {
        timeout: TIMEOUTS.LONG,
      });

      const currentUrl = this.page.url();
      console.log(`✓ Открыта страница результатов: ${currentUrl}`);
      return currentUrl;
    });
  }

  // ---------------------------------------------------------------------------
  // Навигация через аватар (переход в профиль сотрудника)
  // ---------------------------------------------------------------------------

  /**
   * Кликнуть по аватару сотрудника на вкладке «Результаты» → переход в профиль
   * @param {string} userName - Имя сотрудника в таблице
   */
  async clickEmployeeAvatarInResults(userName) {
    await this._step(
      `Кликнуть на аватар «${userName}» на вкладке Результаты`,
      async () => {
        const row = this.page
          .locator("tr")
          .filter({ hasText: userName })
          .first();
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const avatar = row.locator('[class*="Avatar_avatar"]').first();
        await avatar.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await avatar.click();
      },
    );
  }

  /**
   * Кликнуть по имени сотрудника на вкладке «Результаты» → переход в профиль
   * @param {string} userName - Имя сотрудника в таблице
   */
  async clickEmployeeNameInResults(userName) {
    await this._step(
      `Кликнуть на имя «${userName}» на вкладке Результаты`,
      async () => {
        const row = this.page
          .locator("tr")
          .filter({ hasText: userName })
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

  /**
   * Открыть доступ к результатам для оцениваемого пользователя
   *
   * Флоу на UI (AccessModal):
   * Модалка «Поделиться с сотрудником» содержит 3 опции:
   * - "Не делиться результатами и оценкой"
   * - "Только итоговой оценкой"
   * - "Результатами и итоговой оценкой"
   * Кнопки "Отмена" / "Готово"
   *
   * @param {Object} options
   * @param {string} [options.userName] - Имя пользователя (если нужно выбрать конкретного)
   * @param {"full"|"scoreOnly"|"none"} [options.accessMode="full"] - Режим доступа
   */
  async openResultsAccessForUser({
    userName = null,
    accessMode = "full",
  } = {}) {
    await this._step("Открыть доступ к результатам", async () => {
      // Убедимся, что мы на вкладке результатов
      await this.goToResultsTab();

      // Скроллим вниз чтобы увидеть нижнюю таблицу с чекбоксами
      await this.page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );

      // Кликаем на чекбокс "Выбрать всех" или на конкретного пользователя
      if (userName) {
        console.log(`🔍 Ищем пользователя: ${userName}`);
        const userRow = this.page
          .locator("tr")
          .filter({ hasText: userName })
          .first();
        const userCheckboxLabel = userRow.locator("label").first();
        await userCheckboxLabel.click({ force: true });
        console.log("✓ Выбран пользователь через чекбокс");
      } else {
        const selectAllCheckbox = this.page
          .locator("label, span")
          .filter({ hasText: /выбрать всех/i })
          .first();
        await selectAllCheckbox.waitFor({ state: "visible", timeout: 5000 });
        await selectAllCheckbox.click();
        console.log('✓ Нажали "Выбрать всех"');
      }

      // Кнопка "Управление доступом"
      const bulkAccessButton = this.page
        .locator("button")
        .filter({ hasText: /управление доступом/i })
        .first();

      await bulkAccessButton.waitFor({ state: "visible", timeout: 5000 });

      // Ждём пока кнопка станет enabled
      await this.page
        .waitForFunction(
          () => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const accessBtn = buttons.find((b) =>
              b.textContent.includes("Управление доступом"),
            );
            return accessBtn && !accessBtn.disabled;
          },
          { timeout: 5000 },
        )
        .catch(() => console.log("⚠️ Кнопка может быть disabled"));

      await bulkAccessButton.click({ timeout: TIMEOUTS.MEDIUM });
      console.log("✓ Кнопка доступа нажата");

      // Модалка «Поделиться с сотрудником»
      const accessModal = this.page
        .locator('[role="dialog"]')
        .filter({ hasText: /поделиться с сотрудником/i })
        .first();

      await accessModal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      console.log("✓ Модалка «Поделиться с сотрудником» открыта");

      // Маппинг accessMode → текст опции
      const optionTextMap = {
        none: /не делиться результатами/i,
        scoreOnly: /только итоговой оценкой/i,
        full: /результатами и итоговой оценкой/i,
      };
      const optionPattern = optionTextMap[accessMode];
      if (!optionPattern) {
        throw new Error(`Неизвестный accessMode: "${accessMode}"`);
      }

      // Кликаем по нужной опции
      const option = accessModal
        .locator(
          "button, [class*='option'], [class*='Option'], div[role='radio'], div[role='button']",
        )
        .filter({ hasText: optionPattern })
        .first();

      // Fallback: ищем любой кликабельный элемент с нужным текстом
      const optionLocator =
        (await option.count()) > 0
          ? option
          : accessModal.getByText(optionPattern).first();

      await optionLocator.click();
      console.log(`✓ Выбран режим: ${accessMode}`);

      // Подтвердить - кнопка "Готово"
      const confirmButton = accessModal
        .locator("button")
        .filter({ hasText: /готово/i })
        .first();

      await confirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await confirmButton.click();

      // Дождаться закрытия модалки
      await accessModal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });

      console.log("✓ Доступ к результатам открыт");
    });
  }

  /**
   * Поделиться результатами с сотрудником (новая модалка с 3 опциями).
   *
   * Модалка «Поделиться с сотрудником» содержит 3 кнопки-опции:
   * - "none"          → «Не делиться результатами и оценкой»
   * - "scoreOnly"     → «Только итоговой оценкой»   (resultAccess=user, contentAccess=final)
   * - "full"          → «Результатами и итоговой оценкой» (resultAccess=user, contentAccess=finalAndResults)
   *
   * @param {Object} options
   * @param {string|null} [options.userName=null] - Имя пользователя или null = "Выбрать всех"
   * @param {"none"|"scoreOnly"|"full"} [options.accessMode="scoreOnly"]
   * @param {boolean} [options.enableNotification=false] - Включить уведомление (для scoreOnly/full)
   * @param {boolean} [options.includePdfLink=false] - Прикрепить PDF (только для full)
   */
  async shareResultsWithEmployee({
    userName = null,
    accessMode = "scoreOnly",
    enableNotification = false,
    includePdfLink = false,
  } = {}) {
    await this._step(
      `Поделиться результатами: ${accessMode}${userName ? ` (${userName})` : " (все)"}`,
      async () => {
        await this.goToResultsTab();

        // Скроллим вниз к нижней таблице
        await this.page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );

        // Выбрать пользователя или всех
        if (userName) {
          const userRow = this.page
            .locator("tr")
            .filter({ hasText: userName })
            .first();
          await userRow.locator("label").first().click({ force: true });
        } else {
          const selectAll = this.page
            .locator("label, span")
            .filter({ hasText: /выбрать всех/i })
            .first();
          await selectAll.waitFor({ state: "visible", timeout: 5000 });
          await selectAll.click();
        }

        // Кнопка "Управление доступом"
        const accessBtn = this.page
          .locator("button")
          .filter({ hasText: /управление доступом/i })
          .first();
        await accessBtn.waitFor({ state: "visible", timeout: 5000 });
        await this.page
          .waitForFunction(
            () => {
              const buttons = Array.from(document.querySelectorAll("button"));
              const btn = buttons.find((b) =>
                b.textContent.includes("Управление доступом"),
              );
              return btn && !btn.disabled;
            },
            { timeout: 5000 },
          )
          .catch(() => null);
        await accessBtn.click({ timeout: TIMEOUTS.MEDIUM });

        // Ждём модалку «Поделиться с сотрудником»
        const modal = this.page
          .locator('[role="dialog"]')
          .filter({ hasText: /поделиться с сотрудником/i })
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Маппинг accessMode → текст опции
        const optionTextMap = {
          none: "Не делиться результатами и оценкой",
          scoreOnly: "Только итоговой оценкой",
          full: "Результатами и итоговой оценкой",
        };
        const optionText = optionTextMap[accessMode];
        if (!optionText) {
          throw new Error(`Неизвестный accessMode: "${accessMode}"`);
        }

        // Кликаем по кнопке опции (каждая опция — это блок с текстом + button)
        const optionBlock = modal
          .locator("button")
          .filter({
            has: this.page.locator("*", { hasText: optionText }).first(),
          })
          .or(
            modal
              .locator(`text=${optionText}`)
              .locator("..")
              .locator("..")
              .locator("button")
              .first(),
          )
          .first();

        // Попробуем клик по блоку-родителю опции
        const optionParent = modal
          .locator("*")
          .filter({ hasText: optionText })
          .filter({ has: this.page.locator("button") })
          .first();
        const optionButton = optionParent.locator("button").first();
        await optionButton.click();

        // Настроить уведомление (для scoreOnly и full)
        if (accessMode !== "none") {
          const notifCheckbox = modal.getByRole("checkbox", {
            name: /отправить уведомление/i,
          });
          const isNotifVisible = await notifCheckbox
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (isNotifVisible) {
            const isChecked = await notifCheckbox.isChecked();
            if (enableNotification && !isChecked) {
              await modal.locator("text=Отправить уведомление").first().click();
            } else if (!enableNotification && isChecked) {
              await modal.locator("text=Отправить уведомление").first().click();
            }
          }
        }

        // Настроить PDF (только для full)
        if (accessMode === "full" && includePdfLink) {
          const pdfCheckbox = modal.getByRole("checkbox", {
            name: /включить в письмо ссылку на pdf/i,
          });
          const isPdfVisible = await pdfCheckbox
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          if (isPdfVisible && !(await pdfCheckbox.isChecked())) {
            await modal
              .locator("text=Включить в письмо ссылку на PDF")
              .first()
              .click();
          }
        }

        // Подтвердить
        const confirmBtn = modal
          .locator("button")
          .filter({ hasText: /готово/i })
          .first();
        await confirmBtn.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await confirmBtn.click();

        // Дождаться закрытия модалки
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  /**
   * Открыть просмотр результатов для конкретного пользователя (из админки)
   * @param {string} userName - Имя пользователя
   * @returns {Promise<{targetUserId: string, revisionId: string}>} - Параметры для URL результатов
   */
  async openResultsViewForUser(userName) {
    return this._step(
      `Открыть просмотр результатов для ${userName}`,
      async () => {
        await this.goToResultsTab();

        // Найти строку с пользователем
        const userRow = this.page
          .locator('tr, [class*="Row"]')
          .filter({ hasText: userName })
          .first();

        await userRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Кликнуть на имя пользователя чтобы открыть модалку с результатами
        const userNameElement = userRow
          .locator('[class*="User"], [class*="name"]')
          .filter({ hasText: userName })
          .first();

        await userNameElement.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        // Извлекаем параметры из URL (targetUserId, revisionId)
        const currentUrl = this.page.url();
        const urlParams = new URL(currentUrl).searchParams;

        const targetUserId = urlParams.get("targetUserId") || "";
        const revisionId = urlParams.get("revisionId") || "";

        console.log(
          `✓ Открыты результаты: targetUserId=${targetUserId}, revisionId=${revisionId}`,
        );
        return { targetUserId, revisionId };
      },
    );
  }

  /**
   * Получить ID Performance Review из текущего URL
   * @returns {Promise<string|null>}
   */
  async getPerformanceReviewId() {
    return this._step("Получить ID Performance Review", async () => {
      const currentUrl = this.page.url();
      const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
      const prId = match ? match[1] : null;
      console.log(`PR ID: ${prId}`);
      return prId;
    });
  }

  /**
   * Получить revisionId из вкладки результатов
   * @returns {Promise<string|null>}
   */
  async getRevisionId() {
    return this._step("Получить Revision ID", async () => {
      await this.goToResultsTab();

      // Revision ID может быть в селекторе ревизий или в URL
      const currentUrl = this.page.url();
      const urlParams = new URL(currentUrl).searchParams;
      let revisionId = urlParams.get("revisionId");

      if (!revisionId) {
        // Попробуем получить из селектора
        const revisionSelect = this.page
          .locator('#filter-revisions, [class*="RevisionSelect"]')
          .first();
        const selectValue = await revisionSelect
          .getAttribute("value")
          .catch(() => null);
        revisionId = selectValue;
      }

      console.log(`Revision ID: ${revisionId}`);
      return revisionId;
    });
  }

  // ---------------------------------------------------------------------------
  // Работа с анкетами для конкретных направлений
  // ---------------------------------------------------------------------------

  /**
   * Добавить анкету для конкретного направления оценки
   * @param {string} direction - Название направления ('Самооценка', 'Руководитель', 'Коллеги', 'Подчинённые')
   * @param {string} assessmentName - Название анкеты для выбора (если не указано - первая доступная)
   */
  async addAssessmentForDirection(direction, assessmentName = null) {
    await this._step(
      `Добавить анкету для направления "${direction}"`,
      async () => {
        // Проверяем, запущен ли PR по наличию вкладки "Заполнение анкет"
        const fillQuestionnairesTab = this.page
          .locator('button, [role="tab"]')
          .filter({ hasText: /заполнение анкет/i })
          .first();
        const isLaunched = await fillQuestionnairesTab
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (!isLaunched) {
          // PR ещё не запущен - переходим на вкладку анкет
          await this.goToStep("assessments");
        }

        // Найти блок "Анкеты" и таблицу внутри него
        const assessmentsBlock = this.page
          .locator('[class*="BlockShadow_block"]')
          .filter({ has: this.page.locator('h2:has-text("Анкеты")') })
          .first();
        let assessmentsTable = assessmentsBlock.locator("table").first();

        // Если не нашли в блоке, пробуем найти по содержимому направления
        if (
          !(await assessmentsTable
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false))
        ) {
          assessmentsTable = this.page
            .locator("table")
            .filter({
              has: this.page.locator(`td:has-text("${direction}")`),
            })
            .first();
        }

        // Найти строку для нужного направления
        const rows = assessmentsTable.locator("tr");
        const rowCount = await rows.count();

        let targetRow = null;
        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const rowText = await row.innerText().catch(() => "");

          if (rowText.toLowerCase().includes(direction.toLowerCase())) {
            targetRow = row;
            break;
          }
        }

        if (!targetRow) {
          throw new Error(
            `Направление "${direction}" не найдено в таблице анкет`,
          );
        }

        // Найти кнопку "Добавить" в этой строке
        let addButton = targetRow
          .locator('button[class*="AddButton"]')
          .filter({ hasText: "Добавить" });
        let hasAddButton = await addButton.isVisible().catch(() => false);

        // На запущенном PR кнопка может быть обычной
        if (!hasAddButton) {
          addButton = targetRow
            .locator("button")
            .filter({ hasText: /^добавить$/i });
          hasAddButton = await addButton.isVisible().catch(() => false);
        }

        if (!hasAddButton) {
          console.log(
            `⚠️ Кнопка "Добавить" не найдена для направления "${direction}"`,
          );
          return;
        }

        await addButton.scrollIntoViewIfNeeded().catch(() => {});
        await addButton.click({ force: true });

        // Модальное окно выбора анкеты
        const modal = this.page
          .locator('[class*="Modal"]')
          .filter({ hasText: "анкет" })
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });

        // Выбор анкеты
        const selectButtons = modal
          .locator("button")
          .filter({ hasText: "Выбрать" });
        const buttonCount = await selectButtons.count();

        let selectedAssessment = false;

        if (assessmentName) {
          // Ищем конкретную анкету по названию
          for (let j = 0; j < buttonCount; j++) {
            const btn = selectButtons.nth(j);
            const cardText = await btn.evaluate((el) => {
              let parent = el.parentElement;
              for (let k = 0; k < 4 && parent; k++)
                parent = parent.parentElement;
              return parent ? parent.innerText : "";
            });

            if (cardText.toLowerCase().includes(assessmentName.toLowerCase())) {
              await btn.click();
              console.log(`  ✓ Выбрана анкета: "${assessmentName}"`);
              selectedAssessment = true;
              break;
            }
          }
        }

        // Fallback - выбираем первую
        if (!selectedAssessment && buttonCount > 0) {
          await selectButtons.first().click();
          console.log(`  ✓ Выбрана первая доступная анкета`);
        }

        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        // Подтвердить выбор - ищем кнопку "Подтвердить" внутри модального окна
        let confirmButton = modal
          .locator("button")
          .filter({ hasText: /^Подтвердить$/i })
          .first();
        let confirmVisible = await confirmButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (confirmVisible) {
          await confirmButton.click();
          console.log('  ✓ Нажата кнопка "Подтвердить"');
        } else {
          // Fallback 1: ищем в footer модального окна
          const modalFooter = this.page
            .locator(
              '[class*="SheetModal_footer"], [class*="Modal_footer"], [class*="footer"]',
            )
            .first();
          confirmButton = modalFooter
            .locator("button")
            .filter({ hasText: /Подтвердить/i })
            .first();
          confirmVisible = await confirmButton
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);

          if (confirmVisible) {
            await confirmButton.click();
            console.log('  ✓ Нажата кнопка "Подтвердить" (footer)');
          } else {
            // Fallback 2: ищем кнопку просто по тексту на странице
            const fallbackConfirm = this.page
              .locator("button")
              .filter({ hasText: /^Подтвердить$/i })
              .first();
            if (
              await fallbackConfirm
                .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await fallbackConfirm.click();
              console.log('  ✓ Нажата кнопка "Подтвердить" (fallback)');
            } else {
              console.log('  ⚠️ Кнопка "Подтвердить" не найдена');
            }
          }
        }

        // Дождаться закрытия модального окна
        await modal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {
            console.log("  ⚠️ Модальное окно не закрылось автоматически");
          });

        console.log(`✓ Анкета добавлена для направления "${direction}"`);
      },
    );
  }

  /**
   * Удалить анкету из направления оценки
   * @param {string} direction - Название направления ('Самооценка', 'Руководитель', 'Коллеги', 'Подчинённые')
   * @param {number} index - Индекс анкеты для удаления (0 = первая, по умолчанию удаляем последнюю)
   */
  async deleteAssessmentFromDirection(direction, index = -1) {
    await this._step(
      `Удалить анкету из направления "${direction}"`,
      async () => {
        // Определяем запущен ли PR по наличию вкладки "Заполнение анкет"
        // Эта вкладка есть ТОЛЬКО на запущенном PR
        const fillQuestionnairesTab = this.page
          .locator('button, [role="tab"]')
          .filter({ hasText: /заполнение анкет/i })
          .first();
        const isLaunched = await fillQuestionnairesTab
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (!isLaunched) {
          // PR ещё не запущен - переходим на вкладку "Анкеты" в сайдбаре
          await this.goToStep("assessments");
        }

        // Найти таблицу анкет - ищем внутри блока с заголовком "Анкеты"
        // Структура: BlockShadow_block > h2 "Анкеты" > table
        const assessmentsBlock = this.page
          .locator('[class*="BlockShadow_block"]')
          .filter({ has: this.page.locator('h2:has-text("Анкеты")') })
          .first();
        const assessmentsTable = assessmentsBlock.locator("table").first();

        console.log(
          `Таблица анкет найдена: ${await assessmentsTable.isVisible().catch(() => false)}`,
        );

        // Найти строку для нужного направления
        const rows = assessmentsTable.locator("tr");
        const rowCount = await rows.count();
        console.log(`Найдено строк в таблице анкет: ${rowCount}`);

        let targetRow = null;
        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const rowText = await row.innerText().catch(() => "");

          if (rowText.toLowerCase().includes(direction.toLowerCase())) {
            targetRow = row;
            console.log(
              `Найдена строка для "${direction}": ${rowText.substring(0, 50)}...`,
            );
            break;
          }
        }

        if (!targetRow) {
          throw new Error(
            `Направление "${direction}" не найдено в таблице анкет`,
          );
        }

        // На запущенном PR анкеты - это div[role="button"] с классом Option_option
        // Исключаем кнопку "Добавить"
        const allOptions = targetRow.locator(
          '[role="button"][class*="Option_option"], div[class*="Option_option"]',
        );
        const allOptionsCount = await allOptions.count();
        console.log(`Найдено Option элементов в строке: ${allOptionsCount}`);

        const assessmentButtonsList = [];
        for (let i = 0; i < allOptionsCount; i++) {
          const opt = allOptions.nth(i);
          const rawText = await opt.innerText().catch(() => "");
          const text = rawText.toLowerCase().replace(/\s+/g, " ").trim();

          // Пропускаем если это не анкета
          if (text.includes("добавить") || text.length === 0) {
            console.log(`  Пропуск: "${text}"`);
            continue;
          }

          console.log(
            `  Анкета ${assessmentButtonsList.length + 1}: "${text}"`,
          );
          assessmentButtonsList.push(opt);
        }

        const buttonCount = assessmentButtonsList.length;
        console.log(`Найдено кнопок анкет: ${buttonCount}`);

        if (buttonCount === 0) {
          console.log(`⚠️ Анкеты не найдены для направления "${direction}"`);
          return;
        }

        // Выбираем нужную кнопку (index = -1 означает последнюю)
        const targetIndex = index === -1 ? buttonCount - 1 : index;
        const targetButton = assessmentButtonsList[targetIndex];
        const buttonText = await targetButton
          .innerText()
          .catch(() => "unknown");
        console.log(`Удаляем анкету #${targetIndex + 1}: "${buttonText}"`);

        // Скроллим к элементу
        await targetButton.scrollIntoViewIfNeeded().catch(() => {});

        // Hover на элемент чтобы появилась кнопка удаления
        await targetButton.hover();
        console.log("✓ Навели курсор на анкету");

        // Ищем кнопку удаления после hover
        const deleteSelectors = [
          'button[class*="delete"]',
          'button[class*="Delete"]',
          'button[class*="close"]',
          'button[class*="Close"]',
          'button[class*="remove"]',
          '[class*="icon"] button',
          '[class*="Icon"] button',
          "button svg",
          "button",
        ];

        let deleteButton = null;
        let deleteExists = false;

        for (const selector of deleteSelectors) {
          const candidate = targetButton.locator(selector).first();
          const isVisible = await candidate
            .waitFor({ state: "visible", timeout: 1000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Пробуем ${selector}: visible=${isVisible}`);
          if (isVisible) {
            deleteButton = candidate;
            deleteExists = true;
            break;
          }
        }

        // Fallback: ищем кнопку удаления рядом с Option (не внутри)
        if (!deleteExists) {
          const parentRow = targetRow || targetButton.locator("xpath=../..");
          const rowDeleteBtn = parentRow
            .locator(
              'button[class*="delete"], button[class*="Delete"], button[class*="remove"]',
            )
            .first();
          const rowDelVisible = await rowDeleteBtn
            .waitFor({ state: "visible", timeout: 1000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Кнопка в строке: visible=${rowDelVisible}`);
          if (rowDelVisible) {
            deleteButton = rowDeleteBtn;
            deleteExists = true;
          }
        }

        if (deleteExists && deleteButton) {
          await deleteButton.click({ force: true });
          console.log("✓ Кликнули на кнопку удаления");
        } else {
          // Если кнопка удаления не найдена, кликаем на сам элемент для выделения
          console.log("  Кнопка удаления не найдена, кликаем на элемент...");
          await targetButton.click();

          // После клика ищем кнопку удаления снова
          const deleteAfterClick = targetButton.locator("button").first();
          if (
            await deleteAfterClick
              .waitFor({ state: "visible", timeout: 1000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await deleteAfterClick.click({ force: true });
            console.log("✓ Кликнули на кнопку удаления после активации");
          }
        }

        // Может появиться модальное окно подтверждения удаления
        const confirmModal = this.page
          .locator('[class*="Modal"]')
          .filter({ hasText: /удалить|подтвердите/i })
          .first();
        const modalVisible = await confirmModal
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (modalVisible) {
          const confirmButton = confirmModal
            .locator("button")
            .filter({ hasText: /да|удалить|подтвердить/i })
            .first();
          await confirmButton.click();
          await confirmModal
            .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        }

        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log(`✓ Анкета удалена из направления "${direction}"`);
      },
    );
  }

  /**
   * Получить количество анкет для направления
   * @param {string} direction - Название направления
   * @returns {Promise<number>}
   */
  async getAssessmentCountForDirection(direction) {
    return this._step(
      `Получить количество анкет для "${direction}"`,
      async () => {
        await this.goToStep("assessments");

        const assessmentsSection = this.page
          .locator('[class*="Section_section"]')
          .filter({ hasText: "Выберите анкеты для респондентов" })
          .first();

        const rows = assessmentsSection.locator('tr[class*="Table_row"]');
        const rowCount = await rows.count();

        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const rowText = await row.innerText().catch(() => "");

          if (rowText.toLowerCase().includes(direction.toLowerCase())) {
            // Считаем количество добавленных анкет в ячейке
            const assessmentCells = row.locator(
              '[class*="Assessment"], [class*="Card"], [class*="chip"]',
            );
            const count = await assessmentCells.count();
            console.log(`Направление "${direction}": ${count} анкет`);
            return count;
          }
        }

        return 0;
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Пакетная рассылка анкет (завершение этапа самооценки)
  // ---------------------------------------------------------------------------

  /**
   * Проверить видимость алерта о возможности пакетной рассылки анкет
   * Алерт появляется на экране запущенной оценки когда есть сотрудники с незаполненной самооценкой
   * Текст: "X из Y сотрудника не прошел самооценку. Это блокирует отправку анкет..."
   * @returns {Promise<boolean>}
   */
  async isBatchSendAlertVisible() {
    return this._step(
      "Проверить видимость алерта пакетной рассылки",
      async () => {
        // Пробуем несколько селекторов
        const alertSelectors = [
          '[class*="SelfDirectionSkipBlock"]',
          '[class*="SelfDirectionSkip"]',
          '[class*="SkipBlock"]',
        ];

        for (const selector of alertSelectors) {
          const alert = this.page.locator(selector).first();
          const isVisible = await alert
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);
          if (isVisible) {
            console.log(`Алерт пакетной рассылки: виден (${selector})`);
            return true;
          }
        }

        // Fallback: ищем по кнопке "Отправить анкеты"
        const buttonVisible = await this.page
          .locator("button")
          .filter({ hasText: /отправить анкеты/i })
          .first()
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `Алерт пакетной рассылки: ${buttonVisible ? "виден (по кнопке)" : "не виден"}`,
        );
        return buttonVisible;
      },
    );
  }

  /**
   * Проверить наличие кнопки "Отправить анкеты" в алерте
   * @returns {Promise<boolean>}
   */
  async hasBatchSendButton() {
    return this._step(
      'Проверить наличие кнопки "Отправить анкеты"',
      async () => {
        // Сначала пробуем найти внутри блока алерта
        const alertSelectors = [
          '[class*="SelfDirectionSkipBlock"]',
          '[class*="SelfDirectionSkip"]',
          '[class*="SkipBlock"]',
        ];

        for (const selector of alertSelectors) {
          const alert = this.page.locator(selector).first();
          if (
            await alert
              .waitFor({ state: "visible", timeout: 1000 })
              .then(() => true)
              .catch(() => false)
          ) {
            const button = alert
              .locator("button")
              .filter({ hasText: /отправить анкеты/i })
              .first();
            const isVisible = await button
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false);
            if (isVisible) {
              console.log(`Кнопка "Отправить анкеты": видна (в ${selector})`);
              return true;
            }
          }
        }

        // Fallback: ищем кнопку напрямую
        const button = this.page
          .locator("button")
          .filter({ hasText: /отправить анкеты/i })
          .first();
        const isVisible = await button
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        console.log(
          `Кнопка "Отправить анкеты": ${isVisible ? "видна" : "не видна"}`,
        );
        return isVisible;
      },
    );
  }

  /**
   * Получить текст алерта о пакетной рассылке
   * @returns {Promise<string>}
   */
  async getBatchSendAlertText() {
    return this._step("Получить текст алерта пакетной рассылки", async () => {
      // Пробуем несколько селекторов
      const alertSelectors = [
        '[class*="SelfDirectionSkipBlock"]',
        '[class*="SelfDirectionSkip"]',
        '[class*="SkipBlock"]',
      ];

      for (const selector of alertSelectors) {
        const alert = this.page.locator(selector).first();
        if (
          await alert
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false)
        ) {
          // Ищем текстовый элемент внутри
          const textElement = alert
            .locator('[class*="_text"], [class*="Text"]')
            .first();
          if (
            await textElement
              .waitFor({ state: "visible", timeout: 1000 })
              .then(() => true)
              .catch(() => false)
          ) {
            const text = await textElement.innerText();
            console.log(`Текст алерта: ${text}`);
            return text;
          }
          // Fallback: получаем весь текст блока
          const text = await alert.innerText();
          console.log(`Текст алерта (весь блок): ${text}`);
          return text;
        }
      }

      // Text-based fallback: find element containing the alert text
      let alertText = "";
      const textFallback = this.page.getByText(/не прошл.*самооценку|блокирует отправку/i).first();
      try {
        await textFallback.waitFor({ state: "visible", timeout: 5000 });
        const parent = textFallback.locator("xpath=ancestor::div[1]");
        alertText = (await parent.textContent())?.trim() || (await textFallback.textContent())?.trim() || "";
      } catch { /* no alert text found */ }

      if (alertText) {
        console.log(`Текст алерта (text-fallback): ${alertText}`);
        return alertText;
      }

      console.log("⚠️ Алерт пакетной рассылки не найден");
      return "";
    });
  }

  /**
   * Кликнуть на кнопку "Отправить анкеты" в алерте пакетной рассылки
   * Открывает модальное окно подтверждения
   */
  async clickBatchSendAlert() {
    await this._step(
      'Кликнуть на кнопку "Отправить анкеты" в алерте',
      async () => {
        // Перезагрузить страницу если появился overlay о новом билде
        await this._handleBuildReloadMessage();

        // Пробуем несколько селекторов для поиска блока алерта
        const alertSelectors = [
          '[class*="SelfDirectionSkipBlock"]',
          '[class*="SelfDirectionSkip"]',
          '[class*="SkipBlock"]',
          '[class*="Alert"][class*="self"]',
          // Fallback: ищем по содержимому
          '[class*="Alert"]',
        ];

        let alert = null;
        let alertFound = false;

        for (const selector of alertSelectors) {
          const candidate = this.page.locator(selector).first();
          const isVisible = await candidate
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);
          console.log(`  Пробуем ${selector}: visible=${isVisible}`);
          if (isVisible) {
            alert = candidate;
            alertFound = true;
            break;
          }
        }

        // Если не нашли по классу, ищем по тексту кнопки "Отправить анкеты"
        if (!alertFound) {
          const buttonByText = this.page
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          const buttonVisible = await buttonByText
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          if (buttonVisible) {
            // Нашли кнопку - кликаем напрямую
            await buttonByText.scrollIntoViewIfNeeded().catch(() => {});
            await buttonByText.click();
            console.log(
              '✓ Кликнули на кнопку "Отправить анкеты" (найдена по тексту)',
            );
            return;
          }
        }

        if (!alert) {
          // Последняя попытка - скроллим страницу и ищем снова
          await this.page.evaluate(() => window.scrollTo(0, 0));

          alert = this.page
            .locator('[class*="SelfDirectionSkipBlock"]')
            .first();
          await alert.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }

        // Прокручиваем к алерту если он не в видимой области
        await alert.scrollIntoViewIfNeeded().catch(() => {});

        // Кнопка "Отправить анкеты" внутри блока
        const actionButton = alert
          .locator("button")
          .filter({ hasText: /отправить анкеты/i })
          .first();
        await actionButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await actionButton.click();
        console.log('✓ Кликнули на кнопку "Отправить анкеты"');
      },
    );
  }

  /**
   * Подтвердить пакетную рассылку анкет в модальном окне
   * Модальное окно предупреждает что это необратимое действие
   */
  async confirmBatchSend() {
    await this._step("Подтвердить пакетную рассылку анкет", async () => {
      // Перезагрузить страницу если появился overlay о новом билде
      if (await this._handleBuildReloadMessage()) {
        // После перезагрузки модальное окно закрыто, нужно вернуться к алерту
        await this.goToStep("launch");
        await this.clickBatchSendAlert();
      }

      // Может появиться InfoModal "Завершить самооценку" (earlyAccess + askEmployees)
      // Если она появляется — подтверждение запускает рассылку сразу (без "Отправить анкеты")
      const endSelfAssessBtn = this.page
        .locator("button")
        .filter({ hasText: /^Завершить самооценку$/i })
        .first();
      let selfAssessHandled = false;
      if (
        await endSelfAssessBtn
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await endSelfAssessBtn.click();
        console.log('✓ Подтвердили "Завершить самооценку"');
        await this.page
          .locator(".ReactModal__Content")
          .first()
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        selfAssessHandled = true;
      }

      // Модальное окно "Отправить анкеты руководителям и коллегам"
      // Может не появиться если "Завершить самооценку" уже запустила рассылку
      const confirmButton = this.page
        .locator("button")
        .filter({ hasText: /^Отправить анкеты$/i })
        .first();

      const confirmVisible = await confirmButton
        .waitFor({
          state: "visible",
          timeout: selfAssessHandled ? 3_000 : TIMEOUTS.MEDIUM,
        })
        .then(() => true)
        .catch(() => false);

      if (confirmVisible) {
        await confirmButton.click();
        console.log('✓ Кликнули на кнопку "Отправить анкеты"');

        // Ждём исчезновения модального окна (по react-modal)
        await this.page
          .locator(".ReactModal__Content")
          .first()
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      } else if (selfAssessHandled) {
        console.log(
          '✓ Рассылка выполнена через "Завершить самооценку" — дополнительное подтверждение не требуется',
        );
      }

      await this.page.waitForLoadState("networkidle").catch(() => {});
      console.log("✓ Пакетная рассылка анкет подтверждена");
    });
  }

  /**
   * Выполнить пакетную рассылку анкет (клик на алерт + подтверждение)
   * Отправляет анкеты руководителям и коллегам для сотрудников с незаполненной самооценкой
   */
  async performBatchSendQuestionnaires() {
    await this._step("Выполнить пакетную рассылку анкет", async () => {
      await this.clickBatchSendAlert();
      await this.confirmBatchSend();

      // Ждём обработки на бэкенде
      await this.page.waitForLoadState("networkidle");

      console.log("✓ Пакетная рассылка анкет выполнена");
    });
  }

  /**
   * Проверить что алерт пакетной рассылки больше не отображается (после выполнения)
   * @returns {Promise<boolean>}
   */
  async assertBatchSendAlertNotVisible() {
    return this._step(
      "Проверить что алерт пакетной рассылки скрыт",
      async () => {
        const alert = this.page
          .locator("div")
          .filter({
            hasText: /не прошл?и? самооценку|блокирует отправку анкет/i,
          })
          .filter({
            has: this.page.locator('button:has-text("Отправить анкеты")'),
          })
          .first();

        const isVisible = await alert
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (isVisible) {
          console.log("⚠️ Алерт пакетной рассылки всё ещё виден");
          return false;
        }

        console.log("✓ Алерт пакетной рассылки скрыт");
        return true;
      },
    );
  }

  /**
   * Получить количество сотрудников с незаполненной самооценкой
   * @returns {Promise<number>}
   */
  async getUnfilledSelfAssessmentCount() {
    return this._step(
      "Получить количество с незаполненной самооценкой",
      async () => {
        // Ищем текст в алерте или таблице с количеством
        const alertText = await this.getBatchSendAlertText().catch(() => "");

        // Пытаемся извлечь число из текста (например "5 сотрудников не заполнили")
        const match = alertText.match(/(\d+)\s*(сотрудник|человек|участник)/i);
        if (match) {
          const count = parseInt(match[1], 10);
          console.log(`Количество с незаполненной самооценкой: ${count}`);
          return count;
        }

        // Fallback: считаем в таблице
        const table = this.page
          .locator("table")
          .filter({
            has: this.page.locator(
              'th:has-text("Оцениваемый"), td:has-text("Оцениваемый")',
            ),
          })
          .first();

        const rows = table.locator("tbody tr");
        const rowCount = await rows.count();
        let unfilledCount = 0;

        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const selfAssessmentCell = row
            .locator("td")
            .filter({ hasText: /самооценка/i })
            .first();
          const cellText = await selfAssessmentCell.innerText().catch(() => "");

          if (
            cellText.includes("не заполнен") ||
            cellText.includes("ожидает") ||
            !cellText.includes("заполнен")
          ) {
            unfilledCount++;
          }
        }

        console.log(`Количество с незаполненной самооценкой: ${unfilledCount}`);
        return unfilledCount;
      },
    );
  }
}
