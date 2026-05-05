// tests/utils/ResultsVerificationHelper.js
/**
 * Хелпер для проверки результатов Performance Review
 * Открывает страницу результатов от админа и проверяет корректность расчётов через API
 */

import { PerformanceReviewAPI, getCredentials } from "./api/index.js";
import { PerformanceReviewResultsPage } from "../../pages/PerformanceReviewResultsPage.js";
import { PerformanceReviewConfigPage } from "../../pages/PerformanceReviewConfigPage.js";

/**
 * Проверить результаты Performance Review
 * @param {Object} params - Параметры
 * @param {import('@playwright/test').Page} params.page - Playwright страница (админа)
 * @param {import('@playwright/test').APIRequestContext} params.request - API контекст
 * @param {import('@playwright/test').TestInfo} params.testInfo - Информация о тесте
 * @param {string} params.baseUrl - Базовый URL
 * @param {string|number} params.prId - ID Performance Review
 * @param {string} [params.evaluatedUserName] - Имя оцениваемого (для открытия доступа)
 * @param {boolean} [params.openAccess=true] - Открыть доступ к результатам
 * @returns {Promise<Object>} - Результаты проверки {summary, calculations, isValid}
 */
export async function verifyPRResults({
  page,
  request,
  testInfo,
  baseUrl,
  prId,
  evaluatedUserName = null,
  openAccess = true,
}) {
  const results = {
    prId,
    targetUserId: null,
    revisionId: null,
    summary: null,
    calculations: [],
    directions: [],
    isValid: false,
  };

  // 1. Получаем данные через API
  const prAPI = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await prAPI.signIn(email, password);

  // Получаем targetUserId
  const { data: targetUsers } = await prAPI.getTargetUsers(prId, {});
  results.targetUserId =
    targetUsers?.items?.[0]?.user?.id ?? targetUsers?.items?.[0]?.userId;

  // Получаем revisionId
  const { data: revisions } = await prAPI.getRevisions(prId);
  results.revisionId = revisions?.items?.[0]?.id;

  console.log(`📊 Проверка результатов PR #${prId}`);
  console.log(
    `   targetUserId: ${results.targetUserId}, revisionId: ${results.revisionId}`,
  );

  if (!results.targetUserId || !results.revisionId) {
    console.log("⚠️ Не удалось получить targetUserId или revisionId");
    return results;
  }

  // 2. Открываем доступ к результатам (если требуется)
  if (openAccess && evaluatedUserName) {
    const configPage = new PerformanceReviewConfigPage(page, testInfo);

    await page.goto(
      new URL(`/ru/manager/performance-reviews/${prId}/`, baseUrl).toString(),
    );
    await page.waitForTimeout(2000);

    await configPage.openResultsAccessForUser({
      userName: evaluatedUserName,
      accessMode: "full",
    });

    console.log("✓ Доступ к результатам открыт");
  }

  // 3. Получаем summary статистику через API
  const { response, data: summaryData } = await prAPI.getStatisticsSummary(
    prId,
    {
      revisionId: results.revisionId,
      targetUserId: results.targetUserId,
    },
  );

  if (response.status() !== 200) {
    console.log(`⚠️ API вернул статус ${response.status()}`);
    return results;
  }

  results.summary = summaryData;

  // 4. Проверяем расчёты для каждого вопроса
  console.log("\n📋 Проверка расчётов:");

  const { assessments = [] } = summaryData;
  let allCalculationsValid = true;

  for (const assessment of assessments) {
    console.log(`\n  📝 Секция: ${assessment.title}`);

    for (const question of assessment.questions || []) {
      const questionTitle = question.question?.title || "Без названия";
      const answers = question.answers || [];

      if (answers.length === 0) {
        continue;
      }

      // Считаем средние для каждого направления
      const directionAverages = {};
      let totalSum = 0;
      let totalCount = 0;

      for (const answer of answers) {
        const direction = answer.direction || "unknown";
        const value = parseFloat(answer.answer);

        if (!isNaN(value)) {
          if (!directionAverages[direction]) {
            directionAverages[direction] = { sum: 0, count: 0 };
          }
          directionAverages[direction].sum += value;
          directionAverages[direction].count += 1;
          totalSum += value;
          totalCount += 1;
        }
      }

      // Рассчитываем средние
      const overallAvg =
        totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : 0;

      // Проверяем summary из API
      const apiSummary = question.summary?.all;
      let apiAvg = null;

      if (apiSummary?.answers?.length > 0) {
        const apiSum = apiSummary.answers.reduce(
          (acc, a) => acc + a.total * a.answer,
          0,
        );
        const apiTotal = apiSummary.answers.reduce(
          (acc, a) => acc + a.total,
          0,
        );
        apiAvg = apiTotal > 0 ? Math.round((apiSum / apiTotal) * 10) / 10 : 0;
      }

      const calculation = {
        question: questionTitle,
        totalAnswers: totalCount,
        calculatedAvg: overallAvg,
        apiAvg: apiAvg,
        directions: {},
      };

      // Средние по направлениям
      for (const [dir, data] of Object.entries(directionAverages)) {
        const avg = Math.round((data.sum / data.count) * 10) / 10;
        calculation.directions[dir] = {
          count: data.count,
          avg: avg,
        };
      }

      results.calculations.push(calculation);

      // Логируем
      console.log(`     "${questionTitle}":`);
      console.log(`       - Ответов: ${totalCount}`);
      console.log(`       - Среднее (расчёт): ${overallAvg}`);
      if (apiAvg !== null) {
        console.log(`       - Среднее (API): ${apiAvg}`);
        if (Math.abs(overallAvg - apiAvg) > 0.2) {
          console.log(
            `       ⚠️ Расхождение: ${Math.abs(overallAvg - apiAvg).toFixed(1)}`,
          );
          allCalculationsValid = false;
        }
      }

      // Направления
      for (const [dir, data] of Object.entries(calculation.directions)) {
        const directionName = getDirectionName(dir);
        console.log(
          `       - ${directionName}: ${data.count} отв., avg=${data.avg}`,
        );
        results.directions.push({
          direction: dir,
          name: directionName,
          avg: data.avg,
          count: data.count,
        });
      }
    }
  }

  results.isValid = allCalculationsValid;

  // 5. Открываем страницу результатов и делаем скриншот
  const resultsPage = new PerformanceReviewResultsPage(page, testInfo);
  await resultsPage.open(
    baseUrl,
    results.targetUserId,
    results.revisionId,
    prId,
  );

  try {
    await resultsPage.assertOpened();
    await resultsPage.assertResultsAvailable();
    await resultsPage.takeScreenshot(`pr-${prId}-results`);
    console.log(
      `\n✓ Скриншот результатов сохранён: test-results/pr-${prId}-results.png`,
    );
  } catch (error) {
    console.log(`⚠️ Не удалось открыть страницу результатов: ${error.message}`);
  }

  // 6. Итоговый вывод
  console.log("\n" + "=".repeat(60));
  console.log("📊 ИТОГОВАЯ СТАТИСТИКА:");
  console.log(`   PR ID: ${prId}`);
  console.log(`   Секций: ${assessments.length}`);
  console.log(`   Вопросов: ${results.calculations.length}`);

  if (results.directions.length > 0) {
    console.log("   Направления:");
    const uniqueDirections = [
      ...new Set(results.directions.map((d) => d.direction)),
    ];
    for (const dir of uniqueDirections) {
      const dirData = results.directions.filter((d) => d.direction === dir);
      const avgOfAvgs =
        dirData.reduce((acc, d) => acc + d.avg, 0) / dirData.length;
      console.log(
        `     - ${getDirectionName(dir)}: avg=${avgOfAvgs.toFixed(1)}`,
      );
    }
  }

  console.log(
    `   Расчёты корректны: ${results.isValid ? "✓ Да" : "✗ Есть расхождения"}`,
  );
  console.log("=".repeat(60) + "\n");

  return results;
}

/**
 * Получить название направления
 */
function getDirectionName(direction) {
  const names = {
    self: "Самооценка",
    manager: "Руководитель",
    colleagues: "Коллеги",
    subordinates: "Подчинённые",
    unknown: "Неизвестно",
  };
  return names[direction] || direction;
}

export default { verifyPRResults };
