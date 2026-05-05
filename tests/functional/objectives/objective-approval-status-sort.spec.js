// tests/functional/objectives/objective-approval-status-sort.spec.js
// TestRail: C-APPROVAL-SORT-01 — Сортировка по статусу утверждения
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

let objectiveIds = [];
let initialApprovalEnabled = null;
// Уникальный суффикс только из букв и цифр (без спецсимволов — поиск использует regex)
let sortSuffix = null;

// Три статуса: approvalWaiting, approvalProcess, approved
// Порядок в массиве = порядок создания (не алфавитный, не статусный)
const APPROVAL_STATUSES = [
  { apiStatus: "approvalWaiting", uiLabel: "Требует утверждения" },
  { apiStatus: "approvalProcess", uiLabel: "На утверждении" },
  { apiStatus: "approved",        uiLabel: "Утверждено" },
];

// Функция для получения title цели по индексу
function getObjectiveTitle(index) {
  return `APPSORT${sortSuffix}${index}`;
}

test.describe(
  "Утверждение целей — сортировка по статусу в списке",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // Уникальный суффикс из цифр (без спецсимволов — поиск обрабатывает как regex)
      sortSuffix = String(Date.now()).slice(-6);

      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const adminId = api.getCurrentUserId();

      // Сохраняем исходное состояние настройки утверждения
      const { data: settingsData } = await api.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение целей
      const { response: enableResp } = await api.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём цели от admin — только admin'овы цели видны admin'у в "Мои цели"
      // Admin сам же отправляет на утверждение и утверждает свои цели
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

      for (let i = 0; i < APPROVAL_STATUSES.length; i++) {
        const { apiStatus, uiLabel } = APPROVAL_STATUSES[i];
        const title = getObjectiveTitle(i);

        const { response, data } = await api.saveObjective({
          title,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: adminId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `tsort${apiStatus}${sortSuffix}${i}`,
              title: `KR ${title}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: adminId,
            },
          ],
        });

        if (!response.ok()) {
          throw new Error(
            `Не удалось создать цель (${uiLabel}): ${response.status()} ${JSON.stringify(data)}`,
          );
        }

        const objectiveId = data?.id;
        if (!objectiveId) {
          throw new Error(
            `API не вернул ID созданной цели (${uiLabel}). Ответ: ${JSON.stringify(data)}`,
          );
        }

        objectiveIds.push(objectiveId);

        // Переводим цель в нужный статус
        if (apiStatus === "approvalProcess") {
          const { response: statusResp } = await api.sendForApproval(objectiveId);
          if (!statusResp.ok()) {
            throw new Error(
              `Не удалось отправить на утверждение цель ${objectiveId}: ${statusResp.status()}`,
            );
          }
        } else if (apiStatus === "approved") {
          await api.sendForApproval(objectiveId);
          const { response: approveResp } = await api.approveObjective(objectiveId);
          if (!approveResp.ok()) {
            throw new Error(
              `Не удалось утвердить цель ${objectiveId}: ${approveResp.status()}`,
            );
          }
        }

        console.log(
          `[beforeAll] Создана цель id=${objectiveId} title="${title}" approvalStatus=${apiStatus}`,
        );
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of objectiveIds) {
        await api.deleteObjective(id).catch((e) => {
          console.warn(`[afterAll] Не удалось удалить цель ${id}: ${e.message}`);
        });
      }
      objectiveIds = [];

      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
      setSeverity("normal");
    });

    // APP_BUG: сортировка по статусу утверждения — API 400 при POST /private/objectives/get с sort по approvalStatus
    test("C8310: Сортировка по статусу утверждения меняет порядок строк на обратный",
      { tag: [] },
      async ({ adminAuth: page }) => {
        if (objectiveIds.length < APPROVAL_STATUSES.length) {
          throw new Error(
            "objectiveIds не заполнены — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const objectivesPage = new ObjectivesAllPage(page);

        await test.step("Открыть список целей", async () => {
          await page.goto("/ru/objectives/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          await objectivesPage.assertOpened();
        });

        await test.step("Убедиться, что тестовые цели присутствуют в таблице", async () => {
          // Проверяем через поиск что цели созданы (до любой сортировки)
          const searchBox = page.getByRole("textbox", { name: "Найти цель" });
          const searchPrefix = `APPSORT${sortSuffix}`;

          await searchBox.fill(searchPrefix);
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          for (let i = 0; i < APPROVAL_STATUSES.length; i++) {
            const title = getObjectiveTitle(i);
            const row = objectivesPage.tableRows.filter({ hasText: title }).first();
            await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            console.log(`[test] Цель "${title}" найдена в таблице`);
          }

          // Сбрасываем поиск — очищаем поле и ждём обновления таблицы
          await searchBox.clear();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
          await objectivesPage.tableRows.nth(2).waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        /**
         * Получить порядок тестовых целей в таблице после сортировки.
         * Сканирует DOM напрямую через page.evaluate() без использования поискового поля —
         * это гарантирует что React-состояние сортировки не нарушается.
         * Если не все 3 цели видны на первой странице — кликает "Показать ещё 20".
         * Возвращает массив [{title, status, rowIndex}] в порядке DOM (rowIndex возрастает).
         */
        const getTestObjectiveOrderedStatuses = async (label) => {
          // Ждём стабилизации таблицы после клика сортировки
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
          await objectivesPage.tableRows
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          const expectedTitles = Array.from({ length: APPROVAL_STATUSES.length }, (_, i) =>
            getObjectiveTitle(i)
          );

          // Загружаем страницы таблицы пока не найдём все 3 цели или кнопка пропадёт
          // Максимум 10 итераций чтобы избежать бесконечного цикла
          for (let attempt = 0; attempt < 10; attempt++) {
            // Сканируем DOM: ищем строки с нашим prefix в первой ячейке
            const found = await page.evaluate(
              (expectedTitles) => {
                const rows = Array.from(document.querySelectorAll('tbody tr'));
                const results = [];
                rows.forEach((row, idx) => {
                  const titleCell = row.querySelector('td:first-child');
                  const statusCell = row.querySelector('td:nth-child(5)');
                  if (!titleCell || !statusCell) return;
                  const title = titleCell.innerText.trim();
                  if (expectedTitles.includes(title)) {
                    results.push({
                      title,
                      status: statusCell.innerText.trim(),
                      rowIndex: idx,
                    });
                  }
                });
                return results;
              },
              expectedTitles,
            );

            console.log(`[${label}] attempt=${attempt} DOM rows scanned, found=${found.length}/${expectedTitles.length}`);
            found.forEach(f => console.log(`[${label}]   row ${f.rowIndex}: ${f.title} → "${f.status}"`));

            if (found.length >= expectedTitles.length) {
              // Все 3 цели найдены — возвращаем в порядке DOM
              return found.sort((a, b) => a.rowIndex - b.rowIndex);
            }

            // Не все найдены — пробуем загрузить следующую порцию строк
            const loadMoreBtn = page.getByRole("button", { name: /Показать ещё|Показать еще/i });
            const hasMore = await loadMoreBtn.isVisible().catch(() => false);
            if (!hasMore) {
              console.log(`[${label}] Кнопка "Показать ещё" не найдена — больше строк нет`);
              return found.sort((a, b) => a.rowIndex - b.rowIndex);
            }

            await loadMoreBtn.click();
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
          }

          // Если после 10 итераций не нашли всех — возвращаем что есть
          return [];
        };

        // Первый клик — включаем сортировку по статусу
        let positionsAfterFirstClick;
        await test.step("Кликнуть по заголовку «Статус» — первая сортировка", async () => {
          await objectivesPage.sortByStatus();
          positionsAfterFirstClick = await getTestObjectiveOrderedStatuses("click1");
          expect(
            positionsAfterFirstClick.length,
            `После 1-го клика должны быть найдены все 3 тестовые цели в таблице. ` +
            `Найдено: ${positionsAfterFirstClick.length}`,
          ).toBe(APPROVAL_STATUSES.length);
          console.log(
            "[test] Позиции после 1-го клика:",
            positionsAfterFirstClick.map((p) => `${p.title}→${p.status}@${p.rowIndex}`),
          );
        });

        // Второй клик — обратная сортировка
        let positionsAfterSecondClick;
        await test.step("Кликнуть по заголовку «Статус» ещё раз — обратная сортировка", async () => {
          await objectivesPage.sortByStatus();
          positionsAfterSecondClick = await getTestObjectiveOrderedStatuses("click2");
          expect(
            positionsAfterSecondClick.length,
            `После 2-го клика должны быть найдены все 3 тестовые цели в таблице. ` +
            `Найдено: ${positionsAfterSecondClick.length}`,
          ).toBe(APPROVAL_STATUSES.length);
          console.log(
            "[test] Позиции после 2-го клика:",
            positionsAfterSecondClick.map((p) => `${p.title}→${p.status}@${p.rowIndex}`),
          );
        });

        await test.step(
          "Проверить: порядок статусов после 2-го клика — обратный к порядку после 1-го",
          async () => {
            // Извлекаем упорядоченные статусы (по rowIndex) наших тестовых целей
            const statuses1 = positionsAfterFirstClick.map((p) => p.status);
            const statuses2 = positionsAfterSecondClick.map((p) => p.status);

            console.log("[test] Статусы после 1-го клика (по порядку строк):", statuses1);
            console.log("[test] Статусы после 2-го клика (по порядку строк):", statuses2);

            // Наши 3 цели имеют разные статусы — порядок должен измениться
            expect(
              JSON.stringify(statuses1),
              `После 2-го клика порядок тестовых строк по статусу должен отличаться от 1-го клика.\n` +
              `1-й клик: ${JSON.stringify(statuses1)}\n` +
              `2-й клик: ${JSON.stringify(statuses2)}`,
            ).not.toBe(JSON.stringify(statuses2));

            // Набор статусов одинаков (те же 3 цели, только в другом порядке)
            expect(
              [...statuses2].sort(),
              `Набор статусов должен быть одинаков — меняется только порядок`,
            ).toEqual([...statuses1].sort());

            // 2-й клик = реверс 1-го (asc → desc или desc → asc)
            const reversed1 = [...statuses1].reverse();
            expect(
              statuses2,
              `2-й клик должен давать обратный порядок к 1-му.\n` +
              `1-й клик: ${JSON.stringify(statuses1)}\n` +
              `2-й клик: ${JSON.stringify(statuses2)}\n` +
              `Ожидали (реверс): ${JSON.stringify(reversed1)}`,
            ).toEqual(reversed1);
          },
        );
      },
    );
  },
);
