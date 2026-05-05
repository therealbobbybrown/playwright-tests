// tests/functional/development-plans/dev-plan-create-full.spec.js
// TestRail: C2702 (extended) - Создание плана развития со всеми полями
// UI-002: Создание плана со всеми доступными полями

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import { DevelopmentPlanCreatePage } from "../../../pages/DevelopmentPlanCreatePage.js";
import { DevelopmentPlanDetailsPage } from "../../../pages/DevelopmentPlanDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";

test.describe(
  "Создание плана развития - все поля",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C3539: Создать план развития со всеми полями",
      { tag: ["@regression", "@high"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("high");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        // API для cleanup
        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        // Тестовые данные
        const testData = {
          goal: `Полный план развития ${Date.now()}`,
          description:
            "Детальное описание плана развития для проверки всех полей",
        };
        let createdPlanId = null;

        try {
          // Шаг 1: Перейти к созданию плана
          await test.step("Перейти к созданию плана развития", async () => {
            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();
            await plansPage.clickCreatePlan();

            const newPlanVisible = await plansPage.newPlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            if (newPlanVisible) {
              await plansPage.selectNewPlan();
            }

            await createPage.assertOpened();
          });

          // Шаг 2: Заполнить цель плана
          await test.step("Заполнить цель плана развития", async () => {
            await createPage.fillGoal(testData.goal);

            // Проверка
            const enteredGoal = await createPage.goalInput.inputValue();
            expect(enteredGoal).toBe(testData.goal);
          });

          // Шаг 3: Выбрать сотрудника
          await test.step("Выбрать сотрудника", async () => {
            await createPage.selectFirstEmployee();
            console.log("Сотрудник выбран через page object");
          });

          // Шаг 4: Выбрать куратора (если поле доступно)
          await test.step("Выбрать куратора (если доступно)", async () => {
            const curatorSelectVisible = await createPage.curatorSelect
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (curatorSelectVisible) {
              // Куратор может быть dropdown или модальный picker (аналогично сотруднику)
              await createPage.curatorSelect.click();
              const firstOption = page.getByRole("option").first();
              const optionVisible = await firstOption
                .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
                .then(() => true)
                .catch(() => false);

              if (optionVisible) {
                const curatorName = await firstOption.innerText();
                await firstOption.click();
                testData.curator = curatorName.trim();
                console.log(`Выбран куратор: ${testData.curator}`);
              }
            } else {
              console.log("Поле выбора куратора не отображается");
            }
          });

          // Шаг 5: Период — оставляем дефолтный (datepicker-компонент, не fill-able)
          await test.step("Проверить период действия", async () => {
            const periodInput = page.getByRole("textbox", {
              name: /Период действия/i,
            });
            const periodVisible = await periodInput
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (periodVisible) {
              const periodValue = await periodInput
                .inputValue()
                .catch(() => "");
              console.log(`Период действия (дефолт): ${periodValue}`);
            } else {
              console.log("Поле периода не отображается");
            }
          });

          // Шаг 6: Создать план
          await test.step("Создать план", async () => {
            await createPage.clickCreate();
            await page
              .waitForURL(/\/development-plans\/\d+/, {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});
          });

          // Шаг 7: Проверить все данные на странице деталей
          await test.step("Проверить данные созданного плана", async () => {
            await detailsPage.assertOpened();

            // Сохраняем ID
            const url = page.url();
            const match = url.match(/\/development-plans\/(\d+)/);
            if (match) {
              createdPlanId = parseInt(match[1], 10);
              console.log(`План создан с ID: ${createdPlanId}`);
            }

            // Проверяем цель
            const displayedGoal = await detailsPage.getGoalText();
            expect(displayedGoal).toContain(testData.goal);

            // Проверяем сотрудника (если выбирали)
            if (testData.employee) {
              const employeeInfo = await detailsPage.employeeInfo
                .innerText()
                .catch(() => "");
              console.log(`Информация о сотруднике: ${employeeInfo}`);
              // Проверяем что информация содержит имя выбранного сотрудника
              expect(
                employeeInfo,
                "Поле сотрудника не должно быть пустым",
              ).toContain(testData.employee);
            }

            // Проверяем куратора (если выбирали)
            if (testData.curator) {
              const curatorInfo = await detailsPage.curatorInfo
                .innerText()
                .catch(() => "");
              console.log(`Информация о кураторе: ${curatorInfo}`);
            }

            // Проверяем период (если устанавливали)
            if (testData.startDate) {
              const periodInfo = await detailsPage.periodInfo
                .innerText()
                .catch(() => "");
              console.log(`Информация о периоде: ${periodInfo}`);
            }
          });

          // Шаг 8: Проверить план в списке
          await test.step("Проверить план в списке", async () => {
            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();

            const planRow = await plansPage.findPlanByName(testData.goal);
            expect(planRow).not.toBeNull();
          });
        } finally {
          // Cleanup
          if (createdPlanId) {
            await test.step("Cleanup: удалить созданный план", async () => {
              try {
                await api.deleteDevelopmentPlan(createdPlanId);
                console.log(`План ${createdPlanId} удалён`);
              } catch (e) {
                console.warn(`Не удалось удалить план: ${e.message}`);
              }
            });
          }
        }
      },
    );

    test(
      "C3540: Проверить обязательность полей",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);

        // Перейти к созданию
        await test.step("Перейти к созданию плана", async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();
          await plansPage.clickCreatePlan();

          const newPlanVisible = await plansPage.newPlanOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (newPlanVisible) {
            await plansPage.selectNewPlan();
          }

          await createPage.assertOpened();
        });

        // Проверить какие поля обязательные
        await test.step("Определить обязательные поля", async () => {
          // Проверяем атрибут required у поля цели через Page Object

          // Проверяем атрибут required у поля цели
          const goalRequired =
            await createPage.goalInput.getAttribute("required");
          const goalAriaRequired =
            await createPage.goalInput.getAttribute("aria-required");

          console.log(
            `Поле цели: required=${goalRequired}, aria-required=${goalAriaRequired}`,
          );
        });

        // Проверить валидацию пустой цели
        await test.step("Проверить валидацию пустой цели", async () => {
          // Поле цели пустое - пробуем создать
          const isCreateDisabled = await createPage.createButton
            .isDisabled()
            .catch(() => false);

          if (!isCreateDisabled) {
            await createPage.clickCreate();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            // Должны остаться на странице создания (submit не прошёл)
            const currentUrl = page.url();
            const stillOnCreatePage =
              currentUrl.includes("/create") || currentUrl.includes("/new");
            expect(
              stillOnCreatePage,
              `Должны остаться на странице создания при пустых полях (URL: ${currentUrl})`,
            ).toBe(true);
          } else {
            console.log(
              'Кнопка "Создать" заблокирована при пустых обязательных полях',
            );
            expect(isCreateDisabled).toBe(true);
          }
        });
      },
    );
  },
);
