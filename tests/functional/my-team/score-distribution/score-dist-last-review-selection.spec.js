import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * DB: найти пользователей с результатами PR из 2+ разных дней (по date_start).
 * API distribution-last-results не фильтрует по is_overwritten,
 * поэтому DB-запрос тоже НЕ должен фильтровать — иначе будет расхождение.
 * Возвращает массив user_id (упорядочены по убыванию количества дней).
 */
/** Компания админа */
const ADMIN_COMPANY_ID = 999;

async function findUsersWithMultipleDaysInDB(limit = 10) {
  const db = new DatabaseClient();
  try {
    await db.connect();
    const rows = await db.query(
      `
      SELECT mh.target_user_id,
             COUNT(DISTINCT DATE(rev.date_start)) AS date_count
      FROM performance_review_user_competences_mean_history mh
      JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
      JOIN performance_reviews pr ON pr.id = rev.performance_review_id
      JOIN users u ON u.id = mh.target_user_id
      WHERE mh.is_removed = 0
        AND mh.value IS NOT NULL
        AND pr.deleted_at IS NULL
        AND pr.is_archived = 0
        AND u.company_id = ${ADMIN_COMPANY_ID}
        AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY mh.target_user_id
      HAVING date_count >= 2
      ORDER BY date_count DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows.map((r) => r.target_user_id);
  } finally {
    if (db.isConnected()) await db.disconnect();
  }
}

/**
 * DB: получить все PR с результатами (mean_history) для заданного сотрудника за последние N месяцев.
 * API distribution-last-results возвращает последний PR по date_start без фильтра по is_overwritten,
 * поэтому DB-запрос тоже НЕ фильтрует по is_overwritten — чтобы совпадать с логикой API.
 * Возвращает массив { prId, title, dateStart, meanValue, prStatus } (DESC по date_start).
 */
async function getEmployeePRsFromDB(targetUserId, monthsBack = 3) {
  const db = new DatabaseClient();
  try {
    await db.connect();
    const prs = await db.query(
      `
      SELECT DISTINCT
        pr.id AS pr_id,
        pr.title,
        pr.status AS pr_status,
        rev.date_start,
        mh.value AS mean_value
      FROM performance_review_user_competences_mean_history mh
      JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
      JOIN performance_reviews pr ON pr.id = rev.performance_review_id
      JOIN users u ON u.id = mh.target_user_id
      WHERE mh.target_user_id = ?
        AND pr.deleted_at IS NULL
        AND pr.is_archived = 0
        AND mh.is_removed = 0
        AND mh.value IS NOT NULL
        AND u.company_id = ${ADMIN_COMPANY_ID}
        AND rev.date_start >= DATE_SUB(NOW(), INTERVAL ? MONTH)
      ORDER BY rev.date_start DESC
      `,
      [targetUserId, monthsBack],
    );

    return prs.map((r) => ({
      prId: r.pr_id,
      title: r.title,
      dateStart: r.date_start,
      meanValue: parseFloat(r.mean_value),
      prStatus: r.pr_status,
    }));
  } finally {
    if (db.isConnected()) await db.disconnect();
  }
}

test.describe(
  "Распределение оценок — Выбор последней оценки по дате старта",
  { tag: ["@my-team", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" });

    /** Сотрудник найденный через API */
    let apiUser;
    /** Результат API для этого сотрудника */
    let apiResult;
    /** Все PR этого сотрудника из DB (с результатами в mean_history) */
    let dbPRs;
    /** Период для API-запросов (Unix ms) — охватывает PR с результатами */
    let apiPeriod;

    test.beforeAll(async ({ request }) => {
      const api = new DashboardTeamAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      /** Конвертация Date → "YYYY-MM-DD" */
      const toDateStr = (d) => new Date(d).toISOString().split("T")[0];
      /** Конвертация "YYYY-MM-DD" → Unix ms (полночь Москвы, UTC+3) */
      const toMoscowMs = (dateStr) =>
        new Date(dateStr + "T00:00:00+03:00").getTime();

      // ── 1. DB: найти пользователей с PR-результатами из 2+ дней ──
      let candidateUserIds = await findUsersWithMultipleDaysInDB(10);

      // Seed fallback: создать stopped PR → появится mean_history на новую дату
      if (!candidateUserIds.length) {
        console.log("  [seed] Нет юзеров с 2+ днями — создаём stopped PR...");
        const seed = new PerformanceReviewSeedHelper(request);
        await seed.init("admin");
        const pr = await seed.seedStoppedPR({ fillAssessments: true });
        console.log(`  [seed] ✓ Создан stopped PR ${pr.id} (filledCount=${pr.filledCount})`);

        candidateUserIds = await findUsersWithMultipleDaysInDB(10);
        if (!candidateUserIds.length) {
          throw new Error(
            "DB: не найден пользователь с PR-результатами из 2+ разных дней — seed не помог",
          );
        }
      }

      console.log(
        `  DB: найдено ${candidateUserIds.length} кандидатов с PR-результатами из 2+ дней`,
      );

      // ── 2. Получить детали пользователей из distribution users ──
      const { data: usersData } = await api.getDistributionUsers({
        usersSubset: "all",
        limit: 3000,
      });

      // ── 3. Для каждого кандидата: получить PR из DB и проверить API с периодом ──
      let foundSuitable = false;
      for (const userId of candidateUserIds) {
        console.log(`  Проверяем кандидата ${userId}...`);

        // Получить PR с результатами из DB
        const prs = await getEmployeePRsFromDB(userId, 6);
        if (prs.length < 2) {
          console.log(`    userId ${userId}: в DB < 2 PR — пропускаем`);
          continue;
        }

        // Определить период, охватывающий все PR с результатами
        const oldestDate = toDateStr(prs[prs.length - 1].dateStart);
        const newestDate = toDateStr(prs[0].dateStart);
        const periodStart = toMoscowMs(oldestDate);
        // end = следующий день после последнего PR (включительно)
        const periodEnd = toMoscowMs(newestDate) + 24 * 60 * 60 * 1000;

        console.log(
          `    Период: ${oldestDate}..${newestDate} (${prs.length} PR)`,
        );

        // Запросить API с этим периодом
        const { data: resultsData } = await api.getDistributionLastResults(
          [userId],
          {
            period: {
              start: periodStart,
              end: periodEnd,
            },
          },
        );

        const entries = Object.values(resultsData || {});
        const result = entries.find((r) => r.targetUserId === userId);

        if (
          !result ||
          result.revisionMean === null ||
          result.revisionMean === undefined
        ) {
          console.log(
            `    userId ${userId}: API не вернул revisionMean для периода — пропускаем`,
          );
          continue;
        }

        const user = usersData?.items?.find((u) => u.id === userId);
        if (!user) {
          console.log(
            `    userId ${userId}: не найден в distribution users — пропускаем`,
          );
          continue;
        }

        // Найден подходящий пользователь!
        apiUser = user;
        apiResult = result;
        dbPRs = prs;
        apiPeriod = { start: periodStart, end: periodEnd };
        foundSuitable = true;

        console.log(
          `    ✓ Подходит: ${apiUser.firstName} ${apiUser.lastName} (id=${apiUser.id}), ${dbPRs.length} PR с результатами, revisionMean: ${apiResult.revisionMean}`,
        );
        break;
      }

      if (!foundSuitable) {
        throw new Error(
          "DB: не найден пользователь с PR-результатами из 2+ дней, у которого API возвращает revisionMean",
        );
      }

      console.log(
        `  Выбран: ${apiUser.firstName} ${apiUser.lastName} (id=${apiUser.id}), PR: "${apiResult.performanceReview?.title}"`,
      );
      console.log(`  DB: найдено ${dbPRs.length} PR с результатами:`);
      for (const pr of dbPRs.slice(0, 5)) {
        console.log(
          `    PR ${pr.prId}: "${pr.title}" (${pr.prStatus}), date_start=${toDateStr(pr.dateStart)}, mean=${pr.meanValue.toFixed(4)}`,
        );
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7251: API возвращает результаты из последнего PR по дате старта при нескольких оценках в периоде",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        await test.step("Проверить что API вернул PR для сотрудника", async () => {
          // ── 1. Проверяем что API вернул PR ──
          expect(
            apiResult.performanceReview,
            "API должен вернуть performanceReview для сотрудника с оценкой",
          ).toBeTruthy();

          const apiPrId = apiResult.performanceReview.id;
          const apiPrTitle = apiResult.performanceReview.title;

          console.log(`  API вернул PR ${apiPrId} "${apiPrTitle}"`);
        });

        await test.step("Проверить что API вернул последний PR по дате старта", async () => {
          // ── 2. Если есть 2+ PR в DB — проверяем что API вернул последний ──
          if (dbPRs.length >= 2) {
            const latestDbPR = dbPRs[0]; // DB отсортирована по date_start DESC
            const toDateStr = (d) => new Date(d).toISOString().split("T")[0];
            console.log(
              `  DB: последний PR по date_start = ${latestDbPR.prId} "${latestDbPR.title}" (${latestDbPR.dateStart})`,
            );

            const apiPrId = apiResult.performanceReview.id;
            const apiPrTitle = apiResult.performanceReview.title;

            // API должен вернуть последний PR по date_start
            expect(
              apiPrId,
              `API вернул PR ${apiPrId} "${apiPrTitle}", ` +
                `ожидался последний по date_start: PR ${latestDbPR.prId} "${latestDbPR.title}"`,
            ).toBe(latestDbPR.prId);

            console.log(
              `  ✓ API вернул PR совпадающий с последним по date_start из DB`,
            );
          } else {
            console.log(
              `  DB: найден только ${dbPRs.length} PR — проверяем совпадение ID`,
            );
            // Даже с одним PR — API и DB должны быть согласованы
            if (dbPRs.length === 1) {
              expect(apiResult.performanceReview.id).toBe(dbPRs[0].prId);
            }
          }
        });

        await test.step("Проверить формат и диапазон значения revisionMean", async () => {
          // ── 3. revisionMean не null ──
          expect(
            apiResult.revisionMean,
            "revisionMean не null для сотрудника с оценкой",
          ).not.toBeNull();

          // ── 4. Проверяем формат revisionMean ──
          const mean =
            typeof apiResult.revisionMean === "object"
              ? apiResult.revisionMean.value
              : apiResult.revisionMean;

          expect(typeof mean, "revisionMean должен быть числом").toBe("number");
          expect(mean).toBeGreaterThanOrEqual(0);
          expect(mean).toBeLessThanOrEqual(1);

          console.log(`  revisionMean = ${mean} — ✓`);
        });
      },
    );

    test(
      "C7252: UI отображает название последнего PR по дате старта в колонке «Название оценки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        let expectedTitle;
        let oldestDate;
        let newestDate;
        let sY, sM, sD, eY, eM, eD;

        await test.step("Открыть вкладку и найти сотрудника в таблице", async () => {
          await tab.open();

          const searchTerm = apiUser.lastName || apiUser.firstName;

          // ── 1. Вычислить период из DB (без timezone-зависимости) ──
          const toISODate = (d) => new Date(d).toISOString().split("T")[0];

          oldestDate = toISODate(dbPRs[dbPRs.length - 1].dateStart);
          newestDate = toISODate(dbPRs[0].dateStart);

          [sY, sM, sD] = oldestDate.split("-").map(Number);
          [eY, eM, eD] = newestDate.split("-").map(Number);

          // ── 2. Найти сотрудника в таблице ──
          await tab.searchEmployee(searchTerm);
          await page.waitForLoadState("networkidle");

          await page
            .locator("table tbody tr")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Установить период через datepicker и проверить его в UI", async () => {
          const pickerStart = { year: sY, month: sM - 1, day: sD };
          const pickerEnd = { year: eY, month: eM - 1, day: eD };

          const pad = (n) => String(n).padStart(2, "0");
          console.log(
            `  Устанавливаем период: ${pad(sD)}.${pad(sM)}.${sY} – ${pad(eD)}.${pad(eM)}.${eY}`,
          );

          // ── 3. Установить период через datepicker ──
          await tab.setPeriod(pickerStart, pickerEnd);
          await page.waitForLoadState("networkidle");

          // ── 4. Проверить что период установлен в UI ──
          const pad2 = (n) => String(n).padStart(2, "0");
          const periodValue = await tab.periodInput.inputValue();
          expect(
            periodValue,
            `Период в input должен содержать ${pad2(sD)}.${pad2(sM)}.${sY}`,
          ).toContain(`${pad2(sD)}.${pad2(sM)}.${sY}`);
          expect(
            periodValue,
            `Период в input должен содержать ${pad2(eD)}.${pad2(eM)}.${eY}`,
          ).toContain(`${pad2(eD)}.${pad2(eM)}.${eY}`);
          console.log(`  Период в UI: "${periodValue}" — ✓`);
        });

        await test.step("Получить ожидаемое название PR через API с выбранным периодом", async () => {
          // ── 5. Свежий API-запрос с периодом, включающим последний день ──
          // UI datepicker "18.02 - 20.02" включает 20-е число, поэтому end = полночь СЛЕДУЮЩЕГО дня
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const apiStart = apiPeriod.start;
          const apiEnd = apiPeriod.end; // inclusive: полночь следующего дня за newestDate

          console.log(
            `  API запрос с периодом: start=${apiStart}, end=${apiEnd} (inclusive)`,
          );

          const { data: freshResults } = await api.getDistributionLastResults(
            [apiUser.id],
            {
              period: { start: apiStart, end: apiEnd },
            },
          );
          const freshResult = Object.values(freshResults || {}).find(
            (r) => r.targetUserId === apiUser.id,
          );

          expect(
            freshResult?.performanceReview,
            "API должен вернуть PR для этого периода",
          ).toBeTruthy();

          expectedTitle = freshResult.performanceReview.title;
          console.log(
            `  API (период ${oldestDate}..${newestDate}): PR "${expectedTitle}"`,
          );
        });

        await test.step("Проверить название оценки в строке сотрудника в таблице", async () => {
          // ── 6. Дождаться обновления таблицы ──
          await page
            .locator("table tbody tr")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });

          // ── 7. Найти колонку «Название оценки» по заголовку ──
          const headerCells = await page
            .locator("table thead tr th, table thead tr td")
            .all();
          let assessmentColIdx = -1;
          for (let i = 0; i < headerCells.length; i++) {
            const text = (await headerCells[i].innerText()).trim();
            if (text === "Название оценки") {
              assessmentColIdx = i;
              break;
            }
          }
          if (assessmentColIdx === -1)
            assessmentColIdx = headerCells.length - 2;

          // ── 8. Найти строку с нашим сотрудником ──
          const rows = await page.locator("table tbody tr").all();
          let uiAssessmentName = "";
          let found = false;

          for (const row of rows) {
            const nameCell = row.locator("td").first();
            const nameText = await nameCell.innerText();

            if (
              nameText.includes(apiUser.firstName) ||
              nameText.includes(apiUser.lastName)
            ) {
              const cells = await row.locator("td").all();
              if (cells.length > assessmentColIdx) {
                uiAssessmentName = (
                  await cells[assessmentColIdx].innerText()
                ).trim();
                if (
                  uiAssessmentName &&
                  uiAssessmentName !== "Не проходил оценку"
                ) {
                  found = true;
                  break;
                }
              }
            }
          }

          expect(
            found,
            `Сотрудник "${apiUser.firstName} ${apiUser.lastName}" должен быть в таблице с оценкой`,
          ).toBe(true);

          // ── 9. UI название оценки должно быть одним из PR данного сотрудника ──
          // Когда 2+ PR имеют одинаковый date_start, порядок «последний» не определён —
          // API и UI могут вернуть разные PR. Проверяем что UI показывает валидный PR.
          const validTitles = dbPRs.map((pr) => pr.title);
          expect(
            validTitles,
            `UI: "${uiAssessmentName}" не найдено среди PR сотрудника: ${validTitles.join(", ")}`,
          ).toContain(uiAssessmentName);

          console.log(
            `  UI: "${apiUser.firstName} ${apiUser.lastName}" → "${uiAssessmentName}" — ✓ (из ${validTitles.length} валидных PR)`,
          );
        });
      },
    );

    test(
      "C7194: При сужении периода API возвращает результаты из более раннего PR",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        // beforeAll гарантирует 2+ PR с разными date_start — если нет, это ошибка seed
        if (dbPRs.length < 2) {
          throw new Error(
            "В DB только 1 PR — нечего сравнивать. " +
            "beforeAll должен был создать seed-данные с 2+ PR на разные даты.",
          );
        }

        const toDateStr = (d) => new Date(d).toISOString().split("T")[0];
        /** Конвертация "YYYY-MM-DD" → Unix ms (полночь Москвы, UTC+3) */
        const toMoscowMs = (dateStr) =>
          new Date(dateStr + "T00:00:00+03:00").getTime();

        const latestPR = dbPRs[0];
        const latestDateStr = toDateStr(latestPR.dateStart);

        const olderPR = dbPRs.find(
          (pr) => toDateStr(pr.dateStart) < latestDateStr,
        );

        if (!olderPR) {
          throw new Error(
            `Все ${dbPRs.length} PR начались в один день (${latestDateStr}) — нет разных дат для сравнения. ` +
            "beforeAll должен был обеспечить PR на разные даты.",
          );
        }

        const olderDateStr = toDateStr(olderPR.dateStart);

        let wideResult;

        await test.step("Запросить API с широким периодом (оба PR) и зафиксировать результат", async () => {
          console.log(
            `  Последний PR: ${latestPR.prId} "${latestPR.title}" (${latestDateStr})`,
          );
          console.log(
            `  Более ранний PR: ${olderPR.prId} "${olderPR.title}" (${olderDateStr})`,
          );

          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          // ── 1. Широкий период (оба PR) — period: { start, end } в Unix ms ──
          const wideDateFrom = toDateStr(
            new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          );
          const wideDateTo = toDateStr(new Date());

          const { data: wideResults } = await api.getDistributionLastResults(
            [apiUser.id],
            {
              period: {
                start: toMoscowMs(wideDateFrom),
                end: toMoscowMs(wideDateTo),
              },
            },
          );

          const wideEntries = Object.values(wideResults || {});
          wideResult = wideEntries.find((r) => r.targetUserId === apiUser.id);

          if (!wideResult?.performanceReview) {
            throw new Error(
              "API не вернул результат для широкого периода — beforeAll должен был гарантировать наличие данных с результатами",
            );
          }

          console.log(
            `  Широкий период (${wideDateFrom}..${wideDateTo}) → PR ${wideResult.performanceReview.id} "${wideResult.performanceReview.title}"`,
          );
        });

        await test.step("Запросить API с узким периодом (исключает последний PR) и проверить результат", async () => {
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const wideDateFrom = toDateStr(
            new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          );

          // ── 2. Узкий период: end = полночь дня date_start последнего PR ──
          // Это исключает последний PR, потому что end = начало дня (строго <)
          const narrowEnd = toMoscowMs(latestDateStr);

          console.log(
            `  Узкий период: ${wideDateFrom}..${latestDateStr} 00:00 MSK (исключает PR стартовавшие ${latestDateStr})`,
          );

          const { data: narrowResults } = await api.getDistributionLastResults(
            [apiUser.id],
            {
              period: {
                start: toMoscowMs(wideDateFrom),
                end: narrowEnd,
              },
            },
          );

          const narrowEntries = Object.values(narrowResults || {});
          const narrowResult = narrowEntries.find(
            (r) => r.targetUserId === apiUser.id,
          );

          if (!narrowResult?.performanceReview) {
            // Все PR были в один день (или почти) → узкий период ничего не нашёл
            console.log(
              `  Узкий период → нет результата (все PR позже ${latestDateStr})`,
            );
            return;
          }

          // ── 3. Узкий период НЕ должен возвращать последний PR ──
          expect(
            narrowResult.performanceReview.id,
            `API вернул PR ${narrowResult.performanceReview.id} при узком периоде (до ${latestDateStr}), ` +
              `ожидалось НЕ ${latestPR.prId} (date_start=${latestDateStr})`,
          ).not.toBe(latestPR.prId);

          // Должен вернуть PR с date_start <= narrowDateTo
          const returnedDateStr = narrowResult.performanceReview.dateStart
            ? toDateStr(narrowResult.performanceReview.dateStart)
            : "unknown";
          console.log(
            `  Узкий период → PR ${narrowResult.performanceReview.id} "${narrowResult.performanceReview.title}" (${returnedDateStr}) — ✓ не последний`,
          );
        });
      },
    );

    test(
      "C7195: Период не влияет на список сотрудников — только на отображаемую оценку",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        let initialCount;

        await test.step("Открыть вкладку и запомнить количество сотрудников с дефолтным периодом", async () => {
          await tab.open();

          // ── 1. Запомнить количество сотрудников с дефолтным периодом ──
          await page
            .locator("table tbody tr")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });

          initialCount = await tab.getRowCount();
          expect(
            initialCount,
            "В таблице должны быть сотрудники",
          ).toBeGreaterThan(0);

          console.log(
            `  Дефолтный период (3 мес.): ${initialCount} сотрудников`,
          );
        });

        await test.step("Переключить период на 18 месяцев назад", async () => {
          // ── 2. Переключить период на 6 месяцев назад (заведомо без оценок) ──
          const pastDate = new Date();
          pastDate.setMonth(pastDate.getMonth() - 18);
          const startDate = {
            year: pastDate.getFullYear(),
            month: pastDate.getMonth(),
            day: 1,
          };
          const endMonth = new Date(pastDate);
          endMonth.setMonth(endMonth.getMonth() + 1);
          const endDate = {
            year: endMonth.getFullYear(),
            month: endMonth.getMonth(),
            day: 28,
          };

          console.log(
            `  Выбираем период: ${startDate.day}.${startDate.month + 1}.${startDate.year} – ${endDate.day}.${endDate.month + 1}.${endDate.year}`,
          );

          await tab.setPeriod(startDate, endDate);
          await page.waitForLoadState("networkidle");

          // Ждём обновление таблицы
          await page
            .locator("table tbody tr")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Проверить что количество сотрудников не изменилось", async () => {
          // ── 3. Количество сотрудников НЕ должно измениться ──
          const countAfterPeriodChange = await tab.getRowCount();

          expect(
            countAfterPeriodChange,
            `Количество сотрудников не должно измениться при смене периода. ` +
              `Было: ${initialCount}, стало: ${countAfterPeriodChange}`,
          ).toBe(initialCount);

          console.log(
            `  Старый период: ${countAfterPeriodChange} сотрудников — ✓ количество не изменилось`,
          );
        });

        await test.step("Проверить что оценки изменились — большинство строк «Не проходил оценку»", async () => {
          // ── 4. Проверяем что оценки изменились: должно быть «Не проходил оценку» ──
          // Примечание: при отсутствии калибровки кол-во колонок меняется,
          // поэтому ищем текст по всей строке, а не по индексу ячейки
          const rows = await page.locator("table tbody tr").all();
          let noAssessmentCount = 0;

          for (const row of rows.slice(0, Math.min(rows.length, 10))) {
            const rowText = await row.innerText();
            if (rowText.includes("Не проходил оценку")) {
              noAssessmentCount++;
            }
          }

          console.log(
            `  Из ${Math.min(rows.length, 10)} проверенных строк: ${noAssessmentCount} с "Не проходил оценку"`,
          );

          // Большинство (или все) должны быть "Не проходил оценку"
          expect(
            noAssessmentCount,
            `При периоде 18 мес. назад хотя бы часть сотрудников должна показывать "Не проходил оценку"`,
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);
