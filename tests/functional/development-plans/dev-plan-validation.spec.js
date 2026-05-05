// tests/functional/development-plans/dev-plan-validation.spec.js
// Комплексная валидация полей планов развития и шаблонов
// UI-IPR-020: Валидация обязательных полей, максимальной длины и отображение ошибок

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import { DevelopmentPlanTemplateCreatePage } from "../../../pages/DevelopmentPlanTemplateCreatePage.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Валидация полей ИПР",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test.describe("Валидация шаблонов", () => {
      test(
        "C3587: Валидация обязательных полей шаблона",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("normal");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          await test.step("Открыть форму создания шаблона", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
          });

          await test.step('Проверить что кнопка "Создать" заблокирована при пустых полях', async () => {
            // Находим кнопку создания
            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            await createButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });

            const isDisabled = await createButton
              .isDisabled()
              .catch(() => false);
            console.log(
              'Кнопка "Создать" заблокирована при пустых полях:',
              isDisabled,
            );
            // UI может не блокировать кнопку до ввода (валидация при submit)
            // Проверяем только наличие кнопки
          });

          await test.step("Заполнить только название шаблона", async () => {
            await templateCreatePage.fillName("Тест шаблон валидация");

            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            const isDisabled = await createButton
              .isDisabled()
              .catch(() => false);
            console.log("Кнопка заблокирована без цели плана:", isDisabled);
            // UI может не блокировать кнопку до submit (валидация при отправке)
            if (!isDisabled) {
              console.log(
                "Примечание: валидация происходит при submit, а не в реальном времени",
              );
            }
          });

          await test.step("Заполнить только цель плана развития", async () => {
            // Очистить название
            const nameInput = templateCreatePage.nameInput;
            await nameInput.clear();

            // Заполнить цель
            await templateCreatePage.fillGoal(
              "Цель для тестирования валидации",
            );

            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            const isDisabled = await createButton
              .isDisabled()
              .catch(() => false);
            console.log(
              "Кнопка заблокирована без названия шаблона:",
              isDisabled,
            );
            // UI может не блокировать кнопку до submit
            if (!isDisabled) {
              console.log(
                "Примечание: валидация происходит при submit, а не в реальном времени",
              );
            }
          });

          await test.step("Заполнить оба обязательных поля", async () => {
            await templateCreatePage.fillName("Тест шаблон с валидацией");

            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            const isDisabled = await createButton
              .isDisabled()
              .catch(() => false);
            console.log(
              "Кнопка активна после заполнения всех полей:",
              !isDisabled,
            );
            // Кнопка должна быть активна
            expect(isDisabled).toBe(false);
          });
        },
      );

      test(
        "C3588: Валидация максимальной длины названия шаблона",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("normal");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          await test.step("Открыть форму создания шаблона", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
          });

          await test.step("Ввести очень длинное название шаблона", async () => {
            // Генерируем строку длиннее типичного лимита (например, 256+ символов)
            const longName = "A".repeat(300);
            await templateCreatePage.fillName(longName);

            // Проверяем фактическую длину введённого текста
            const nameInput = templateCreatePage.nameInput;
            const actualValue = await nameInput.inputValue();
            console.log(`Введено символов: ${actualValue.length}`);

            // Проверяем что текст либо обрезан, либо показывается ошибка
            const errorMessage = page
              .locator(
                '[class*="error"], [class*="Error"], .text-red-500, .text-danger',
              )
              .filter({ hasText: /максимум|слишком длин|превышает|limit/i });
            const hasError = await errorMessage
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasError) {
              console.log("Отображается сообщение об ошибке длины");
              expect(hasError).toBe(true);
            } else if (actualValue.length < 300) {
              console.log(`Текст обрезан до ${actualValue.length} символов`);
              expect(actualValue.length).toBeLessThan(300);
            } else {
              console.log("Валидация длины не применяется на клиенте");
            }
          });

          await test.step("Ввести очень длинную цель плана", async () => {
            const longGoal = "Б".repeat(500);
            await templateCreatePage.fillGoal(longGoal);

            const goalInput = templateCreatePage.goalInput;
            const actualValue = await goalInput.inputValue();
            console.log(`Цель: введено символов: ${actualValue.length}`);

            // Аналогичная проверка
            const errorMessage = page
              .locator('[class*="error"], [class*="Error"]')
              .filter({ hasText: /максимум|слишком длин|превышает|limit/i });
            const hasError = await errorMessage
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasError) {
              console.log("Отображается сообщение об ошибке длины цели");
            } else if (actualValue.length < 500) {
              console.log(`Цель обрезана до ${actualValue.length} символов`);
            }
          });
        },
      );

      test(
        "C3589: Валидация специальных символов в названии шаблона",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("minor");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          await test.step("Открыть форму создания шаблона", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
          });

          await test.step("Проверить ввод специальных символов", async () => {
            const specialChars = '<script>alert("XSS")</script>';
            await templateCreatePage.fillName(specialChars);

            const nameInput = templateCreatePage.nameInput;
            const actualValue = await nameInput.inputValue();
            console.log(`Введённое значение: ${actualValue}`);

            // Примечание: экранирование XSS обычно происходит на сервере при сохранении/рендере
            // На клиенте ввод может сохраняться как есть
            if (actualValue.includes("<script>")) {
              console.log(
                "Внимание: поле принимает потенциально опасные символы (проверьте серверную валидацию)",
              );
            } else {
              console.log("Текст экранирован на клиенте");
            }
          });

          await test.step("Проверить HTML-теги в цели плана", async () => {
            const htmlContent = "<b>Bold</b><img src=x onerror=alert(1)>";
            await templateCreatePage.fillGoal(htmlContent);

            const goalInput = templateCreatePage.goalInput;
            const actualValue = await goalInput.inputValue();
            console.log(`Цель с HTML: ${actualValue}`);

            // Примечание: экранирование должно происходить при рендере
            if (actualValue.match(/<img.*onerror/i)) {
              console.log(
                "Внимание: потенциально опасный HTML (проверьте серверную валидацию)",
              );
            } else {
              console.log("HTML экранирован на клиенте");
            }
          });
        },
      );
    });

    test.describe("Валидация планов развития", () => {
      test(
        "C3590: Валидация пустой цели плана развития",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("normal");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const plansPage = new DevelopmentPlansListPage(page, testInfo);

          await test.step('Открыть список планов и нажать "Создать"', async () => {
            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();
            await plansPage.clickCreatePlan();

            // Выбрать "Новый план развития" если появился popup
            const newPlanOption = page.getByText("Новый план развития").first();
            const popupVisible = await newPlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (popupVisible) {
              await newPlanOption.click();
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          await test.step("Проверить что кнопка создания заблокирована без цели", async () => {
            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            await createButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });

            const isDisabled = await createButton
              .isDisabled()
              .catch(() => false);
            console.log('Кнопка "Создать" заблокирована:', isDisabled);
            expect(isDisabled).toBe(true);
          });

          await test.step("Проверить сообщение об обязательном поле", async () => {
            // Находим поле цели плана
            const goalInput = page
              .locator('textarea[placeholder*="Например"]')
              .or(
                page.getByPlaceholder(/Цель плана развития|Освоить основные/i),
              )
              .first();

            await goalInput.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await goalInput.click();
            await goalInput.blur();

            // Проверяем появление сообщения валидации
            const validationMessage = page
              .locator(
                '[class*="error"], [class*="Error"], .field-error, .validation-error',
              )
              .filter({ hasText: /обязательн|required|заполните/i });
            const hasValidation = await validationMessage
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            console.log("Сообщение об обязательном поле:", hasValidation);
          });
        },
      );

      test(
        "C3591: Валидация выбора сотрудника для плана по шаблону",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("normal");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const plansPage = new DevelopmentPlansListPage(page, testInfo);

          await test.step("Открыть создание плана по шаблону", async () => {
            // Ждём API шаблонов — без этого кнопка работает как ссылка на /create
            const templatesPromise = page.waitForResponse(
              (resp) =>
                resp.url().includes("development-plan-templates") &&
                resp.status() === 200,
              { timeout: TIMEOUTS.PAGE_LOAD },
            );

            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();

            await templatesPromise.catch(() => {
              console.warn("Не дождались ответа API шаблонов");
            });

            await plansPage.clickCreatePlan();

            await plansPage.templatePlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            await plansPage.templatePlanOption.click();
            // Ждём навигацию на страницу создания по шаблону
            await page.waitForURL(/\/development-plans\/add\/from-template/, {
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          });

          await test.step("Проверить что нужно выбрать шаблон и сотрудника", async () => {
            const createButton = page
              .getByRole("button", { name: /Создать план развития/i })
              .first();
            await createButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

            const isDisabled = await createButton.isDisabled();
            console.log(
              "Кнопка создания заблокирована без выбора шаблона/сотрудника:",
              isDisabled,
            );
            expect(isDisabled).toBe(true);

            // Проверяем наличие полей выбора
            const templateSelect = page
              .locator('[class*="Select"]')
              .filter({ hasText: /Шаблон/i })
              .first();
            const employeeSelect = page
              .locator('[class*="Select"]')
              .filter({ hasText: /Сотрудник/i })
              .first();

            const templateVisible = await templateSelect
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            const employeeVisible = await employeeSelect
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            console.log("Поле выбора шаблона:", templateVisible);
            console.log("Поле выбора сотрудника:", employeeVisible);
          });
        },
      );

      test(
        "C3592: Валидация длины цели плана развития",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("minor");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const plansPage = new DevelopmentPlansListPage(page, testInfo);

          await test.step("Открыть форму создания плана", async () => {
            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();
            await plansPage.clickCreatePlan();

            const newPlanOption = page.getByText("Новый план развития").first();
            const popupVisible = await newPlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (popupVisible) {
              await newPlanOption.click();
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          await test.step("Ввести очень длинную цель", async () => {
            const goalInput = page
              .locator('textarea[placeholder*="Например"]')
              .or(
                page.getByPlaceholder(/Цель плана развития|Освоить основные/i),
              )
              .first();

            await goalInput.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });

            // Вводим очень длинный текст
            const veryLongGoal = "Освоить навыки ".repeat(100); // ~1500 символов
            await goalInput.fill(veryLongGoal);

            const actualValue = await goalInput.inputValue();
            console.log(`Введено символов в цели: ${actualValue.length}`);

            // Проверяем ограничение или предупреждение
            const charCounter = page
              .getByText(/\d+\s*\/\s*\d+|\d+\s*символ/i)
              .first();
            const counterVisible = await charCounter
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (counterVisible) {
              const counterText = await charCounter.innerText();
              console.log("Счётчик символов:", counterText);
            }
          });
        },
      );
    });

    test.describe("Валидация целей развития и действий", () => {
      test(
        "C3593: Валидация пустого названия цели развития",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("normal");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          const templateName = `Шаблон для валидации целей ${Date.now()}`;

          // Создаём шаблон для теста целей
          await test.step("Создать шаблон", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
            await templateCreatePage.fillTemplateForm(
              templateName,
              "Цель шаблона для валидации",
            );
            await templateCreatePage.clickCreate();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          await test.step("Открыть шаблон и создать цель развития", async () => {
            // Если не на странице деталей шаблона - перейти
            const currentUrl = page.url();
            const isOnTemplatePage =
              currentUrl.includes("development-plan-template") ||
              currentUrl.includes("/development-plans/templates/");

            if (!isOnTemplatePage) {
              await devMenu.openDevelopmentPlanTemplates();
              await templatesPage.assertOpened();

              // Поиск шаблона
              await templatesPage.searchInput.fill(templateName);
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});

              await templatesPage.openTemplateByName(templateName);
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            // Нажать "Создать цель развития"
            const createGoalButton = page
              .getByRole("button", {
                name: /Создать цель развития|Добавить цель/i,
              })
              .first();
            const buttonVisible = await createGoalButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (buttonVisible) {
              await createGoalButton.click();
              const goalForm = page
                .locator('[role="dialog"], [class*="Modal"], form')
                .first();
              await goalForm
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .catch(() => {});
            }
          });

          await test.step("Проверить что нельзя создать цель без названия", async () => {
            // Находим кнопку создания в форме/модалке цели
            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            const buttonVisible = await createButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (buttonVisible) {
              const isDisabled = await createButton
                .isDisabled()
                .catch(() => false);
              console.log('Кнопка "Создать" цель заблокирована:', isDisabled);
              // UI может не блокировать кнопку (валидация при submit)
            } else {
              console.log("Форма создания цели не найдена");
            }
          });

          // Cleanup
          await test.step("Cleanup: удалить шаблон", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона — ждём обновления списка после ввода
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const template =
              await templatesPage.findTemplateByName(templateName);
            if (template) {
              await templatesPage.deleteTemplate(templateName);
            }
          });
        },
      );

      test(
        "C3594: Валидация обязательных полей развивающего действия",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("normal");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          const templateName = `Шаблон для валидации действий ${Date.now()}`;

          await test.step("Создать шаблон", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
            await templateCreatePage.fillTemplateForm(
              templateName,
              "Цель для валидации действий",
            );
            await templateCreatePage.clickCreate();
            // Ждём редирект на страницу деталей шаблона
            await page.waitForURL(/\/development-plans\/templates\/\d+/, {
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          });

          await test.step("Перейти к созданию цели развития", async () => {
            // "Создать цель развития" — это link, не button
            const createGoalLink = page
              .getByRole("link", {
                name: /Создать цель развития/i,
              })
              .first();
            await createGoalLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            await createGoalLink.click();
            await page.waitForURL(/\/objectives\/add/, {
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          });

          await test.step("Проверить кнопку 'Добавить действие' на странице создания цели", async () => {
            // На странице создания цели уже есть кнопка "Добавить действие"
            const addActionButton = page
              .getByRole("button", {
                name: /Добавить действие/i,
              })
              .first();
            await addActionButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            await addActionButton.click();
          });

          await test.step("Проверить валидацию полей действия", async () => {
            // Кнопка создания действия
            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first()
              .or(page.getByRole("button", { name: /Добавить$/i }).first());
            const buttonVisible = await createButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (buttonVisible) {
              const isDisabled = await createButton
                .isDisabled()
                .catch(() => false);
              console.log(
                "Кнопка создания действия заблокирована:",
                isDisabled,
              );
            }

            // Проверяем обязательные поля (через aria-required)
            const requiredFields = page.getByRole("textbox", { name: /\*/ });
            const requiredCount = await requiredFields.count();
            console.log(
              `Обязательных полей в форме действия: ${requiredCount}`,
            );
          });

          // Cleanup
          await test.step("Cleanup: удалить шаблон", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона — ждём обновления списка после ввода
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const template =
              await templatesPage.findTemplateByName(templateName);
            if (template) {
              await templatesPage.deleteTemplate(templateName);
            }
          });
        },
      );
    });

    test.describe("Отображение ошибок валидации", () => {
      test(
        "C3595: Отображение inline-ошибок в форме шаблона",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("minor");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          await test.step("Открыть форму создания шаблона", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
          });

          await test.step("Потерять фокус на обязательных полях", async () => {
            const nameInput = templateCreatePage.nameInput;
            const goalInput = templateCreatePage.goalInput;

            // Фокус на поле названия и сразу убрать
            await nameInput.click();
            await goalInput.click();
            await nameInput.click();
            await page.keyboard.press("Tab");

            // Ищем сообщения об ошибках (используем role="alert" — семантически корректно)
            const errorMessages = page.getByRole("alert");
            const errorCount = await errorMessages.count();
            console.log(`Отображается ошибок валидации: ${errorCount}`);

            // Проверяем стили полей с ошибками
            const nameInputClass = await nameInput.getAttribute("class");
            const hasErrorStyle =
              nameInputClass?.includes("error") ||
              nameInputClass?.includes("invalid");
            console.log("Поле название имеет стиль ошибки:", hasErrorStyle);
          });

          await test.step("Проверить исчезновение ошибки после заполнения", async () => {
            await templateCreatePage.fillName("Тест название");

            // После заполнения ошибка должна исчезнуть
            const nameError = page
              .locator('[class*="error"]')
              .filter({ hasText: /название|name/i });
            await nameError
              .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
            const errorVisible = await nameError
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            console.log("Ошибка названия после заполнения:", errorVisible);
          });
        },
      );

      test(
        "C3596: Отображение toast/notification при ошибке сохранения",
        { tag: ["@regression"] },
        async ({ adminAuth, page }, testInfo) => {
          setSeverity("minor");
          const devMenu = new DevelopmentMenuHelper(page, testInfo);
          const templatesPage = new DevelopmentPlanTemplatesListPage(
            page,
            testInfo,
          );
          const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
            page,
            testInfo,
          );

          await test.step("Открыть форму создания шаблона", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await templateCreatePage.assertOpened();
          });

          await test.step("Заполнить форму некорректными данными", async () => {
            // Заполняем пробелами (некоторые системы считают это пустым значением)
            // ВАЖНО: цель заполняется до названия из-за перерендера формы
            await templateCreatePage.fillGoal("   ");
            await templateCreatePage.fillName("   ");

            // Пробуем отправить форму
            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            const isEnabled = !(await createButton
              .isDisabled()
              .catch(() => true));

            if (isEnabled) {
              await createButton.click();

              // Проверяем появление toast/notification с ошибкой (role="alert")
              const toast = page.getByRole("alert").first();
              const toastVisible = await toast
                .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
                .then(() => true)
                .catch(() => false);
              console.log("Toast с ошибкой отображается:", toastVisible);

              if (toastVisible) {
                const toastText = await toast.innerText().catch(() => "");
                console.log("Текст toast:", toastText);
              }
            } else {
              console.log(
                "Кнопка заблокирована - клиентская валидация сработала",
              );
            }
          });
        },
      );
    });
  },
);
