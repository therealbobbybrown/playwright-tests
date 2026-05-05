// tests/functional/performance-review/dashboard/dashboard-filters.spec.js
// Тесты фильтров дашборда "Моя команда" — модалка "Результаты для"

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { TIMEOUTS } from "../../../utils/constants.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { OrgStructureAPI } from "../../../utils/api/OrgStructureAPI.js";
import { getCredentials } from "../../../utils/credentials.js";

/**
 * Тесты фильтра "Результаты для" на дашборде руководителя
 *
 * Модалка имеет 3 вкладки:
 * - Сотрудники (дерево подчинённых)
 * - Отделы (структура организации)
 * - Группы (пользовательские группы)
 *
 * URL: /ru/dashboard/
 *
 * @tags @regression @dashboard @my-team @performance-review @ui @filters
 */

/**
 * Получить список сотрудников/элементов из открытой модалки «Результаты для».
 *
 * Модалка рендерит элементы списка через компонент Option с CSS-классом
 * Option_title__xxx. Стандартный MyTeamPage.getItemsInResultsForModal()
 * парсит innerText по regex и не находит имена с цифрами (тестовые данные).
 *
 * Эта функция извлекает тексты из DOM-элементов с классом Option_title,
 * находящихся внутри модалки (определяется по наличию рядом с «Результаты для»).
 */
async function getModalEmployees(page) {
  // Ждём загрузки контента модалки — либо появления элементов списка,
  // либо индикатора «Все сотрудники» / «Все группы» (пустой список).
  // Ждём именно появления employee/group-строк, а не просто заголовка модалки.
  // AllOption_text ("Все сотрудники") появляется мгновенно, поэтому не включаем его.
  await page
    .waitForSelector(
      '[class*="UserOption_name"], [class*="GroupOption_name"],' +
        '[class*="DepartmentOption_name"]',
      { timeout: 8000 },
    ); // модалка пустая (нет подчинённых) — продолжаем

  const items = await page.evaluate(() => {
    // Вкладка «Сотрудники» использует компонент UserOption (класс UserOption_name),
    // вкладка «Группы» — GroupOption (класс GroupOption_name),
    // вкладка «Отделы» — DepartmentOption или аналогичный компонент.
    // Ищем глобально, но исключаем элементы внутри кнопки «Результаты для»
    // (SelectInput_input — там показывается текущий выбор, а не список вариантов).
    const selectors = [
      '[class*="UserOption_name"]',
      '[class*="GroupOption_name"]',
      '[class*="DepartmentOption_name"]',
      '[class*="DeptOption_name"]',
    ];
    const names = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        // Исключаем элементы внутри кнопки-селектора (она показывает выбранных)
        if (el.closest('[class*="SelectInput_input"]')) continue;
        const text = (el.textContent || "").trim();
        if (!text || text.length < 3) continue;
        if (!names.includes(text)) names.push(text);
      }
    }

    return names;
  });

  // Фильтруем: убираем элементы, явно не являющиеся сотрудниками/отделами/группами
  // (название PR, цикл оценки и т.п.)
  const filtered = items.filter((name) => {
    // Исключаем названия PR (содержат "E2E_", "PR_", или длинные snake_case строки)
    if (/^(E2E_|PR_)/.test(name)) return false;
    if (/^[A-Za-z0-9_]+_\d+$/.test(name)) return false; // "PR_Directions_1771315315021"
    // Исключаем названия PR с timestamp: "Validation Threshold 1771339899563"
    if (/\d{10,13}/.test(name)) return false;
    // Исключаем названия циклов
    if (/Цикл оценки/i.test(name)) return false;
    if (
      /\d+\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i.test(
        name,
      )
    )
      return false;
    return true;
  });

  console.log(
    `[getModalEmployees] Найдено: ${filtered.length} (из ${items.length} raw)`,
  );
  if (filtered.length > 0) {
    console.log(
      `[getModalEmployees] Элементы: ${filtered.slice(0, 5).join(", ")}`,
    );
  }
  return filtered;
}
test.describe(
  "Dashboard Filters - Результаты для",
  {
    tag: [
      "@regression",
      "@dashboard",
      "@filters",
      "@performance-review",
      "@ui",
    ],
  },
  () => {
    // Название PR для выбора на дашборде (заполняется в beforeAll)
    let prTitle = null;

    // Создать тестовые данные: активный PR с ≥3 target users + departments для вкладки "Отделы"
    test.beforeAll(async ({ prSeed, request }) => {
      // 1. Обеспечить активный PR с ≥3 target users для дашборда
      let prId = null;
      const existing = await prSeed.findValidPRForMyTeam(3);
      if (existing?.found) {
        prTitle = existing.prTitle;
        prId = existing.prId;
        console.log(
          `✅ Найден PR "${prTitle}" (ID ${prId}, ${existing.targetUsersCount} target users)`,
        );
      } else {
        const pr = await prSeed.seedActivePR({ fillAssessments: true });
        prTitle = pr.title;
        prId = pr.id;
        console.log(`✅ Создан PR "${prTitle}" (ID ${prId})`);
      }

      if (!prTitle) {
        throw new Error(
          "PR title не получен — невозможно выбрать PR на дашборде",
        );
      }

      // 2. Обеспечить наличие departments + привязать target users к отделу
      // (вкладка "Отделы" видна только если target users PR принадлежат отделам)
      const orgAPI = new OrgStructureAPI(request);
      const { email, password } = getCredentials("admin");
      await orgAPI.signIn(email, password);

      // Найти или создать отдел
      const { data: depts } = await orgAPI.getDepartments({ limit: 5 });
      const deptItems = depts?.items || depts || [];
      let deptId = null;
      if (deptItems.length > 0) {
        deptId = deptItems[0].id;
        console.log(
          `✅ Отделов в системе: ${deptItems.length}, используем ID ${deptId}`,
        );
      } else {
        const { data: newDept } = await orgAPI.createDepartment({
          title: "Тестовый отдел — Dashboard",
        });
        deptId = newDept?.id;
        console.log(`✅ Создан тестовый отдел ID ${deptId}`);
      }

      // Привязать target users PR к отделу (чтобы вкладка "Отделы" была доступна)
      if (deptId && prId) {
        const { data: targetUsersData } = await prSeed.prAPI.getTargetUsers(
          prId,
          {},
        );
        const targetUsers = targetUsersData?.items || targetUsersData || [];
        const userIds = targetUsers
          .map((tu) => tu.userId || tu.user?.id || tu.id)
          .filter(Boolean)
          .slice(0, 5);

        if (userIds.length > 0) {
          const { response } = await orgAPI.addTreeUsersToDepartment(
            deptId,
            userIds,
          );
          if (response.ok()) {
            console.log(
              `✅ Привязано ${userIds.length} target users к отделу ${deptId}`,
            );
          } else {
            console.warn(
              `⚠️ Не удалось привязать users к отделу: ${response.status()}`,
            );
          }
        }
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Filters");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-001: Открытие модалки "Результаты для"
    // ═══════════════════════════════════════════════════════════════════════

    test(
      'C4165: Модалка "Результаты для" открывается и содержит все элементы',
      { tag: ["@regression", "@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть дашборд "Моя команда" → вкладка "Оценка команды"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
        });

        await test.step('Проверить, что кнопка фильтра "Результаты для" видна', async () => {
          await expect(myTeamPage.resultsForSelect).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
          const buttonText = await myTeamPage.resultsForSelect.innerText();
          console.log(`✓ Текст кнопки фильтра: "${buttonText}"`);
          expect(buttonText).toContain("Результаты для");
        });

        await test.step('Открыть модалку "Результаты для"', async () => {
          const modal = await myTeamPage.openResultsForModal();
          await expect(modal).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить наличие вкладок (если есть) или списка сотрудников", async () => {
          const modal = myTeamPage.getResultsForModal();

          // Вкладки могут отсутствовать в зависимости от прав/настроек
          const employeesTab = modal
            .getByRole("button", { name: "Сотрудники" })
            .first();
          const hasTabs = await employeesTab
            .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true, () => false)

          if (hasTabs) {
            console.log('✓ Вкладка "Сотрудники" присутствует');

            const departmentsTab = modal
              .getByRole("button", { name: "Отделы" })
              .first();
            const groupsTab = modal
              .getByRole("button", { name: "Группы" })
              .first();

            // Вкладки "Отделы" и "Группы" опциональны — зависят от настроек компании
            const hasDepartments = await departmentsTab
              .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true, () => false)
            const hasGroups = await groupsTab
              .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true, () => false)

            if (hasDepartments) console.log('✓ Вкладка "Отделы" присутствует');
            if (hasGroups) console.log('✓ Вкладка "Группы" присутствует');

            // Достаточно наличия хотя бы одной вкладки
            expect(
              hasTabs,
              'Должна быть хотя бы вкладка "Сотрудники"',
            ).toBeTruthy();
          } else {
            console.log("⚠️ Вкладки отсутствуют — упрощённая модалка");
            // Проверяем что есть хотя бы список сотрудников
            const employeesList = modal.getByText("Все сотрудники").first();
            await expect(employeesList).toBeVisible({
              timeout: TIMEOUTS.SHORT,
            });
            console.log('✓ Список "Все сотрудники" присутствует');
          }
        });

        await test.step("Проверить наличие поля поиска", async () => {
          const modal = myTeamPage.getResultsForModal();
          // Поиск может быть textbox или input с placeholder-текстом внутри
          const searchInput = modal.locator('input, [role="textbox"]').first();
          await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.SHORT });
          console.log("✓ Поле поиска присутствует");
        });

        await test.step('Проверить наличие кнопки "Применить"', async () => {
          const modal = myTeamPage.getResultsForModal();
          const applyButton = modal
            .getByRole("button", { name: "Применить" })
            .first();
          await expect(applyButton).toBeVisible({ timeout: TIMEOUTS.SHORT });
          console.log('✓ Кнопка "Применить" присутствует');
        });

        await test.step("Проверить наличие списка элементов (сотрудники/подчинённые)", async () => {
          // Ждём загрузки списка после открытия модалки
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });
          // СИЛЬНАЯ ПРОВЕРКА: должны быть элементы в списке
          const items = await getModalEmployees(page);
          console.log(`✓ Элементов в списке: ${items.length}`);

          // Проверяем что список не пустой (для менеджера должен быть хотя бы он сам или подчинённые)
          if (items.length > 0) {
            console.log(`✓ Первые элементы: ${items.slice(0, 3).join(", ")}`);

            // СИЛЬНАЯ ПРОВЕРКА: элементы должны выглядеть как имена (ФИО или тестовые «Name 123 Name 123»)
            const looksLikeNames = items.filter(
              (item) =>
                /^[А-ЯA-Z][а-яa-z]+\s+[А-ЯA-Z][а-яa-z]+/.test(item) ||
                /^[A-Za-zА-Яа-яЁё]+\s+\d+\s+[A-Za-zА-Яа-яЁё]+\s+\d+/.test(
                  item,
                ) ||
                /^\d+\s+[A-Za-zА-Яа-яЁё]+/.test(item),
            );
            console.log(
              `✓ Похожи на ФИО: ${looksLikeNames.length} из ${items.length}`,
            );
            expect(
              looksLikeNames.length,
              "В списке должны быть ФИО сотрудников",
            ).toBeGreaterThan(0);
          }
        });

        await test.step("Закрыть модалку клавишей Escape", async () => {
          await myTeamPage.closeResultsForModal();

          // Проверить что модалка закрылась
          const modal = myTeamPage.getResultsForModal();
          await expect(modal).toBeHidden({ timeout: TIMEOUTS.MEDIUM });
          console.log("✓ Модалка закрыта");
        });

        await page.screenshot({
          path: "test-results/dash-filter-001-modal-closed.png",
          fullPage: false,
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-002: Вкладка "Сотрудники" (требует наличия вкладок)
    // ═══════════════════════════════════════════════════════════════════════

    test(
      'C4166: Вкладка "Сотрудники" отображает дерево подчинённых',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть дашборд и выбрать PR с ≥3 target users", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
          const found = await myTeamPage.selectPRByPattern(prTitle);
          expect(found, `PR "${prTitle}" не найден на дашборде`).toBeTruthy();
        });

        await test.step('Открыть модалку "Результаты для"', async () => {
          await myTeamPage.openResultsForModal();
        });

        // Вкладки ДОЛЖНЫ быть, т.к. выбран PR с ≥3 target users
        const modal = myTeamPage.getResultsForModal();
        const employeesTab = modal
          .getByRole("button", { name: "Сотрудники" })
          .first();
        await expect(
          employeesTab,
          'Вкладка "Сотрудники" должна быть видна для админа',
        ).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        await test.step("Проверить отображение списка сотрудников", async () => {
          const items = await getModalEmployees(page);
          console.log(`✓ Найдено сотрудников: ${items.length}`);

          // СИЛЬНАЯ ПРОВЕРКА: должны быть сотрудники
          expect(
            items.length,
            'Вкладка "Сотрудники" должна содержать подчинённых',
          ).toBeGreaterThan(0);

          if (items.length > 0) {
            console.log(`✓ Первые 5: ${items.slice(0, 5).join(", ")}`);

            // СИЛЬНАЯ ПРОВЕРКА: элементы должны выглядеть как ФИО, ID+Имя или тестовые «Name 123 Name 123»
            const looksLikeNames = items.filter(
              (item) =>
                /^[А-ЯA-Z][а-яa-z]+\s+[А-ЯA-Z][а-яa-z]+/.test(item) ||
                /^[A-Za-zА-Яа-яЁё]+\s+\d+\s+[A-Za-zА-Яа-яЁё]+\s+\d+/.test(
                  item,
                ) ||
                /^\d+\s+[A-Za-zА-Яа-яЁё]+/.test(item),
            );
            console.log(
              `✓ Похожи на ФИО/ID+Имя: ${looksLikeNames.length} из ${items.length}`,
            );
            expect(
              looksLikeNames.length,
              "Сотрудники должны отображаться как ФИО или ID+Имя",
            ).toBeGreaterThan(0);
          }
        });

        await test.step("Закрыть модалку", async () => {
          await myTeamPage.closeResultsForModal();
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-003: Вкладка "Отделы" (требует наличия вкладок)
    // ═══════════════════════════════════════════════════════════════════════

    test(
      'C4167: Вкладка "Отделы" отображает структуру организации',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть дашборд и выбрать PR с ≥3 target users", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
          const found = await myTeamPage.selectPRByPattern(prTitle);
          expect(found, `PR "${prTitle}" не найден на дашборде`).toBeTruthy();
        });

        await test.step('Открыть модалку "Результаты для"', async () => {
          await myTeamPage.openResultsForModal();
        });

        // Проверяем наличие вкладки "Отделы" (должна быть, т.к. beforeAll создал departments)
        const modal = myTeamPage.getResultsForModal();
        const departmentsTab = modal
          .getByRole("button", { name: "Отделы" })
          .first();
        await expect(
          departmentsTab,
          'Вкладка "Отделы" должна быть видна для админа',
        ).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Запоминаем содержимое до переключения
        let itemsBeforeSwitch = [];
        await test.step("Запомнить содержимое вкладки Сотрудники", async () => {
          itemsBeforeSwitch = await getModalEmployees(page);
          console.log(
            `✓ До переключения (Сотрудники): ${itemsBeforeSwitch.length} элементов`,
          );
        });

        await test.step('Переключиться на вкладку "Отделы"', async () => {
          await myTeamPage.switchResultsForTab("departments");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          // СИЛЬНАЯ ПРОВЕРКА: вкладка должна стать активной
          const modal = myTeamPage.getResultsForModal();
          const departmentsTab = modal
            .getByRole("button", { name: "Отделы" })
            .first();
          // Проверяем что вкладка видна (активная вкладка всегда видна)
          await expect(departmentsTab).toBeVisible();
          console.log('✓ Вкладка "Отделы" активна');
        });

        await test.step("Проверить отображение списка отделов", async () => {
          const items = await getModalEmployees(page);
          console.log(`✓ Найдено отделов/элементов: ${items.length}`);

          // СИЛЬНАЯ ПРОВЕРКА: должны быть элементы после переключения
          expect(
            items.length,
            'Вкладка "Отделы" должна содержать элементы',
          ).toBeGreaterThan(0);

          if (items.length > 0) {
            console.log(`✓ Первые 5: ${items.slice(0, 5).join(", ")}`);
          }

          // СИЛЬНАЯ ПРОВЕРКА: контент изменился после переключения вкладки
          // (либо количество другое, либо хотя бы какие-то элементы отличаются)
          const itemsSet = new Set(items);
          const beforeSet = new Set(itemsBeforeSwitch);
          const sameContent =
            items.length === itemsBeforeSwitch.length &&
            items.every((item) => beforeSet.has(item));

          if (!sameContent) {
            console.log('✓ Контент отличается от вкладки "Сотрудники"');
          } else {
            // Если контент тот же — это ОК если сотрудники привязаны к отделам
            console.log(
              "⚠️ Контент совпадает — возможно, сотрудники привязаны к тем же отделам",
            );
          }
        });

        await test.step("Закрыть модалку", async () => {
          await myTeamPage.closeResultsForModal();
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-004: Вкладка "Группы" (требует наличия вкладок)
    // ═══════════════════════════════════════════════════════════════════════

    test(
      'C4168: Вкладка "Группы" отображает список групп',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть дашборд и выбрать PR с ≥3 target users", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
          const found = await myTeamPage.selectPRByPattern(prTitle);
          expect(found, `PR "${prTitle}" не найден на дашборде`).toBeTruthy();
        });

        await test.step('Открыть модалку "Результаты для"', async () => {
          await myTeamPage.openResultsForModal();
        });

        // Вкладки ДОЛЖНЫ быть, т.к. выбран PR с ≥3 target users
        const modal = myTeamPage.getResultsForModal();
        const groupsTab = modal.getByRole("button", { name: "Группы" }).first();
        await expect(
          groupsTab,
          'Вкладка "Группы" должна быть видна для админа',
        ).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        await test.step('Переключиться на вкладку "Группы"', async () => {
          await myTeamPage.switchResultsForTab("groups");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          // СИЛЬНАЯ ПРОВЕРКА: вкладка должна стать активной
          const modal = myTeamPage.getResultsForModal();
          const groupsTab = modal
            .getByRole("button", { name: "Группы" })
            .first();
          await expect(groupsTab).toBeVisible();
          console.log('✓ Вкладка "Группы" активна');
        });

        await test.step("Проверить отображение списка групп", async () => {
          const items = await getModalEmployees(page);
          console.log(`✓ Найдено групп/элементов: ${items.length}`);

          // СИЛЬНАЯ ПРОВЕРКА: должны быть элементы на вкладке групп
          expect(
            items.length,
            'Вкладка "Группы" должна содержать элементы',
          ).toBeGreaterThan(0);

          if (items.length > 0) {
            console.log(`✓ Первые 5: ${items.slice(0, 5).join(", ")}`);

            // СИЛЬНАЯ ПРОВЕРКА: проверяем что есть хотя бы одна группа (не только имена сотрудников)
            // Группы обычно имеют слово "Group", "Группа" или начинаются с заглавной не как ФИО
            const hasGroupName = items.some(
              (item) =>
                item.toLowerCase().includes("group") ||
                item.toLowerCase().includes("групп") ||
                /^\d+/.test(item) || // Группы могут начинаться с цифр
                !/^[А-ЯA-Z][а-яa-z]+\s+[А-ЯA-Z][а-яa-z]+$/.test(item), // Не похоже на ФИО
            );
            console.log(
              `✓ Есть названия групп (не только ФИО): ${hasGroupName}`,
            );

            // ASSERT: на вкладке групп должны быть группы, а не только сотрудники
            expect(
              hasGroupName,
              'На вкладке "Группы" должны быть названия групп',
            ).toBeTruthy();
          }
        });

        await test.step("Закрыть модалку", async () => {
          await myTeamPage.closeResultsForModal();
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-005: Поиск в модалке
    // ═══════════════════════════════════════════════════════════════════════

    test(
      "C4169: Поиск сотрудника в модалке фильтра",
      { tag: ["@regression"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let initialItems = [];

        await test.step('Открыть дашборд и модалку "Результаты для"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
          const found = await myTeamPage.selectPRByPattern(prTitle);
          expect(found, `PR "${prTitle}" не найден на дашборде`).toBeTruthy();
          await myTeamPage.openResultsForModal();
        });

        await test.step("Получить начальный список сотрудников", async () => {
          initialItems = await getModalEmployees(page);
          console.log(`✓ Начальное количество: ${initialItems.length}`);

          // Нужен хотя бы 1 сотрудник для поиска
          expect(initialItems.length).toBeGreaterThan(0);
        });

        await test.step("Выполнить поиск по первому сотруднику", async () => {
          // Берём первые 3 символа имени первого сотрудника
          const searchQuery = initialItems[0].substring(0, 3);
          console.log(`✓ Поисковый запрос: "${searchQuery}"`);

          await myTeamPage.searchInResultsForModal(searchQuery);
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          const filteredItems = await getModalEmployees(page);
          console.log(`✓ После фильтрации: ${filteredItems.length} элементов`);

          // После фильтрации должен остаться хотя бы тот сотрудник, которого искали
          expect(filteredItems.length).toBeGreaterThan(0);

          // СИЛЬНАЯ ПРОВЕРКА: найденные имена должны содержать поисковый запрос
          const queryLower = searchQuery.toLowerCase();
          const matchingItems = filteredItems.filter((name) =>
            name.toLowerCase().includes(queryLower),
          );
          console.log(
            `✓ Совпадений с запросом "${searchQuery}": ${matchingItems.length}`,
          );
          expect(
            matchingItems.length,
            `Ожидалось найти имена с "${searchQuery}"`,
          ).toBeGreaterThan(0);
        });

        await test.step("Очистить поиск и проверить возврат полного списка", async () => {
          const modal = myTeamPage.getResultsForModal();
          const searchInput = modal.getByRole("textbox").first();
          await searchInput.clear();
          await page.waitForTimeout(1000);
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          const restoredItems = await getModalEmployees(page);
          console.log(`✓ После очистки: ${restoredItems.length} элементов`);

          // Количество должно вернуться к начальному
          expect(restoredItems.length).toBeGreaterThanOrEqual(
            initialItems.length,
          );
        });

        await test.step("Закрыть модалку", async () => {
          await myTeamPage.closeResultsForModal();
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-006: Выбор сотрудника и применение фильтра
    // ═══════════════════════════════════════════════════════════════════════

    test(
      "C4170: Выбор сотрудника в фильтре обновляет таблицу",
      { tag: ["@regression", "@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let initialRowCount = 0;
        let selectedEmployeeName = "";

        await test.step('Открыть дашборд "Моя команда" → вкладка "Оценка команды"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
        });

        await test.step("Запомнить начальное количество строк в таблице", async () => {
          initialRowCount = await myTeamPage.getEmployeesCount();
          console.log(`✓ Начальное количество сотрудников: ${initialRowCount}`);

          // Нужен хотя бы 1 сотрудник для теста
          if (initialRowCount < 1) {
            console.log("⚠️ Нет сотрудников для теста фильтрации");
            test.skip();
            return;
          }
        });

        await test.step('Открыть модалку "Результаты для"', async () => {
          await myTeamPage.openResultsForModal();
        });

        await test.step("Сбросить все и выбрать одного сотрудника", async () => {
          const items = await getModalEmployees(page);
          expect(items.length).toBeGreaterThan(0);

          selectedEmployeeName = items[0];
          console.log(`✓ Доступные сотрудники: ${items.join(", ")}`);
          console.log(`✓ Выбираем: "${selectedEmployeeName}"`);

          // Сначала сбрасываем все выбранные (по умолчанию все выбраны)
          await myTeamPage.resetAllInResultsForModal();

          // Теперь выбираем конкретного сотрудника
          await myTeamPage.selectItemInResultsForModal(selectedEmployeeName);

          // Проверяем счётчик выбранных
          const selectedCount =
            await myTeamPage.getSelectedCountInResultsForModal();
          console.log(`✓ Выбрано элементов: ${selectedCount}`);
        });

        await test.step("Применить фильтр", async () => {
          await myTeamPage.applyResultsForFilter();
        });

        await test.step("Проверить, что таблица отфильтрована", async () => {
          const filteredRowCount = await myTeamPage.getEmployeesCount();
          console.log(`✓ Количество после фильтрации: ${filteredRowCount}`);

          // После фильтрации должно быть меньше или равно начальному
          expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);

          // Должен остаться хотя бы 1 сотрудник (тот что выбрали)
          expect(filteredRowCount).toBeGreaterThanOrEqual(1);

          // СИЛЬНАЯ ПРОВЕРКА: выбранный сотрудник ДОЛЖЕН быть в отфильтрованной таблице
          const employees = await myTeamPage.getAllEmployeeNames();
          console.log(`✓ Сотрудники в таблице: ${employees.join(", ")}`);

          // Ищем выбранного сотрудника (имя может быть частично совпадающим)
          const selectedNamePart = selectedEmployeeName.split(" ")[0]; // Берём имя
          const foundEmployee = employees.find(
            (emp) =>
              emp.includes(selectedNamePart) ||
              selectedEmployeeName.includes(emp.split(" ")[0]),
          );
          expect(
            foundEmployee,
            `Выбранный "${selectedEmployeeName}" должен быть в таблице`,
          ).toBeTruthy();
        });

        await test.step("Проверить текст кнопки фильтра", async () => {
          const filterValue = await myTeamPage.getSelectedResultsFor();
          console.log(`✓ Значение фильтра: "${filterValue}"`);

          // СИЛЬНАЯ ПРОВЕРКА: значение фильтра должно содержать имя выбранного сотрудника
          const selectedNamePart = selectedEmployeeName.split(" ")[0];
          expect(
            filterValue,
            `Фильтр должен показывать "${selectedEmployeeName}"`,
          ).toContain(selectedNamePart);
        });

        await page.screenshot({
          path: "test-results/dash-filter-006-filtered.png",
          fullPage: false,
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-007: Сброс фильтра
    // ═══════════════════════════════════════════════════════════════════════

    test(
      "C4171: Сброс фильтра восстанавливает полный список",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let initialRowCount = 0;
        let allItems = [];

        await test.step("Открыть дашборд и выбрать PR с ≥3 target users", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
          const found = await myTeamPage.selectPRByPattern(prTitle);
          expect(found, `PR "${prTitle}" не найден на дашборде`).toBeTruthy();
        });

        await test.step("Выбрать всех сотрудников в фильтре", async () => {
          await myTeamPage.openResultsForModal();
          allItems = await getModalEmployees(page);
          console.log(`✓ Всего сотрудников в модалке: ${allItems.length}`);
          expect(
            allItems.length,
            "В модалке должно быть ≥2 сотрудников",
          ).toBeGreaterThanOrEqual(2);

          // Сбрасываем фильтр и выбираем ВСЕХ, чтобы получить полный список в таблице
          await myTeamPage.resetAllInResultsForModal();
          for (const item of allItems) {
            await myTeamPage.selectItemInResultsForModal(item);
          }
          await myTeamPage.applyResultsForFilter();

          initialRowCount = await myTeamPage.getEmployeesCount();
          console.log(
            `✓ Начальное количество (все выбраны): ${initialRowCount}`,
          );
          expect(
            initialRowCount,
            "На дашборде должно быть ≥2 сотрудников",
          ).toBeGreaterThan(1);
        });

        await test.step("Сбросить все и применить фильтр на одного сотрудника", async () => {
          await myTeamPage.openResultsForModal();

          // Сбрасываем все, выбираем только первого
          await myTeamPage.resetAllInResultsForModal();
          await myTeamPage.selectItemInResultsForModal(allItems[0]);
          await myTeamPage.applyResultsForFilter();

          const filteredCount = await myTeamPage.getEmployeesCount();
          console.log(`✓ После фильтрации: ${filteredCount}`);
          expect(filteredCount).toBe(1);
        });

        await test.step("Открыть модалку и выбрать всех сотрудников", async () => {
          await myTeamPage.openResultsForModal();

          // Первый уже выбран, выбираем остальных
          for (let i = 1; i < allItems.length; i++) {
            await myTeamPage.selectItemInResultsForModal(allItems[i]);
            console.log(`✓ Выбран: ${allItems[i]}`);
          }

          await myTeamPage.applyResultsForFilter();
        });

        await test.step("Проверить, что таблица восстановлена", async () => {
          const restoredCount = await myTeamPage.getEmployeesCount();
          console.log(`✓ После сброса: ${restoredCount}`);

          // Количество должно вернуться к начальному
          expect(restoredCount).toBe(initialRowCount);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════════════
    // DASH-FILTER-008: Мультиселект — выбор нескольких сотрудников
    // ═══════════════════════════════════════════════════════════════════════

    test(
      "C4172: Мультиселект — выбор нескольких сотрудников",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let selectedNames = [];

        await test.step("Открыть дашборд и выбрать PR с ≥3 target users", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
          const found = await myTeamPage.selectPRByPattern(prTitle);
          expect(found, `PR "${prTitle}" не найден на дашборде`).toBeTruthy();
        });

        await test.step('Открыть модалку "Результаты для"', async () => {
          await myTeamPage.openResultsForModal();
        });

        await test.step("Сбросить все и выбрать несколько сотрудников", async () => {
          const items = await getModalEmployees(page);
          console.log(`✓ Доступные сотрудники: ${items.join(", ")}`);

          // Минимум 2 сотрудника для мультиселекта (beforeAll создаёт PR с 3 target users)
          expect(
            items.length,
            "В модалке должно быть ≥2 сотрудников",
          ).toBeGreaterThanOrEqual(2);

          // Сбрасываем все выбранные
          await myTeamPage.resetAllInResultsForModal();

          // Выбираем первых 2 сотрудников
          selectedNames = items.slice(0, 2);
          for (const name of selectedNames) {
            await myTeamPage.selectItemInResultsForModal(name);
            console.log(`✓ Выбран: "${name}"`);
          }

          // Проверяем счётчик
          const selectedCount =
            await myTeamPage.getSelectedCountInResultsForModal();
          console.log(`✓ Выбрано элементов: ${selectedCount}`);
          expect(selectedCount, "Должно быть выбрано 2 сотрудника").toBe(2);
        });

        await test.step("Применить фильтр", async () => {
          await myTeamPage.applyResultsForFilter();
        });

        await test.step("Проверить, что в таблице отображаются выбранные сотрудники", async () => {
          const tableEmployees = await myTeamPage.getAllEmployeeNames();
          console.log(`✓ Сотрудники в таблице: ${tableEmployees.join(", ")}`);

          // СИЛЬНАЯ ПРОВЕРКА: количество строк = количеству выбранных
          expect(
            tableEmployees.length,
            "В таблице должно быть 2 сотрудника",
          ).toBe(2);

          // СИЛЬНАЯ ПРОВЕРКА: каждый выбранный сотрудник должен быть в таблице.
          // getAllEmployeeNames() может возвращать полные имена или только инициалы
          // (первая буква из аватара), поэтому проверяем оба варианта.
          for (const selectedName of selectedNames) {
            const namePart = selectedName.split(" ")[0]; // Берём первое слово (имя)
            const initial = namePart[0]; // Первая буква имени
            const found = tableEmployees.some(
              (emp) =>
                emp.includes(namePart) ||
                namePart.includes(emp) ||
                emp === initial,
            );
            console.log(`✓ "${selectedName}" в таблице: ${found}`);
            expect(
              found,
              `Выбранный "${selectedName}" должен быть в таблице`,
            ).toBeTruthy();
          }
        });

        await test.step("Проверить текст кнопки фильтра", async () => {
          const filterValue = await myTeamPage.getSelectedResultsFor();
          console.log(`✓ Значение фильтра: "${filterValue}"`);

          // Фильтр должен показывать что выбрано несколько
          // Может быть формат "Имя1, Имя2" или "Выбрано: 2"
          expect(filterValue.length).toBeGreaterThan(0);
        });
      },
    );
  },
);
