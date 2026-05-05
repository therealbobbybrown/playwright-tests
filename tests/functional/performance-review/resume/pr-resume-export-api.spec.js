// tests/functional/performance-review/resume/pr-resume-export-api.spec.js
// API тест: Экспорт результатов (PPTX/PDF) после resume — форматы и статусы корректны

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { TestDataHelper } from "../../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * Скачать файл по токену через API request context.
 * Возвращает { ok, status, contentType, size } — без сохранения на диск.
 */
async function downloadReportViaToken(request, downloadUrl) {
  const response = await request.get(downloadUrl, { timeout: 120_000 });
  const status = response.status();
  const contentType = response.headers()["content-type"] || "";
  let size = 0;
  let ok = response.ok();

  if (ok) {
    const buffer = await response.body();
    size = buffer.length;
  }

  console.log(
    `  Скачивание: status=${status}, content-type=${contentType}, size=${size} байт`,
  );
  return { ok, status, contentType, size };
}

/**
 * Получить export token и скачать индивидуальный отчёт.
 * Возвращает null если токен не получен (с пояснением в логе).
 */
async function getTokenAndDownload(
  prAPI,
  request,
  prId,
  revisionId,
  targetUserId,
  format,
) {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "API_BASE_URL не задан в .env — невозможно построить URL для скачивания",
    );
  }

  const { response: tokenResp, data: tokenData } = await prAPI.getExportToken(
    prId,
    {
      revisionId,
      targetUserId,
      userDate: new Date().toISOString(),
    },
  );

  if (!tokenResp.ok() || !tokenData?.token) {
    console.log(
      `  Токен экспорта не получен: status=${tokenResp.status()}, data=${JSON.stringify(tokenData).substring(0, 200)}`,
    );
    return null;
  }
  console.log(`  Токен получен для userId=${targetUserId}, format=${format}`);

  const downloadUrl = `${baseUrl}/public/performance-reviews/${prId}/statistics/export/target-user-details/${format}?token=${tokenData.token}`;
  const result = await downloadReportViaToken(request, downloadUrl);
  return result;
}

/**
 * Получить первый доступный targetUserId из PR
 */
async function getFirstTargetUserId(prAPI, prId) {
  const { data: tuData } = await prAPI.getTargetUsers(prId, { limit: 50 });
  const items = tuData?.items || tuData || [];
  const first = items[0];
  return first?.userId || first?.user?.id || first?.id || null;
}

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Export API (PPTX/PDF)",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.setTimeout(240000);

    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Export");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      if (createdReviewId) {
        try {
          await prAPI.stop(createdReviewId);
        } catch {
          /* ignore */
        }
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch {
          /* ignore */
        }
        createdReviewId = null;
      }
    });

    test(
      "C7422: Экспорт PPTX и PDF работает после resume остановленного PR",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed, request }) => {
        setSeverity("normal");

        const { seedHelper } = prSeed;
        let prId;
        let revisionId;
        let targetUserId;

        await test.step("Создать PR с заполненными анкетами и остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Экспорт возобновления"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          expect(prId, "PR ID должен быть получен").toBeTruthy();
          expect(revisionId, "Revision ID должен быть получен").toBeTruthy();

          const { data: prData } = await prAPI.getById(prId);
          expect(
            ["stopped", "complete"],
            `PR должен быть остановлен, статус: ${prData.status}`,
          ).toContain(prData.status);
          console.log(
            `PR создан и остановлен: id=${prId}, revision=${revisionId}`,
          );
        });

        await test.step("Получить target user для экспорта", async () => {
          targetUserId = await getFirstTargetUserId(prAPI, prId);
          expect(
            targetUserId,
            "Должен быть доступен хотя бы один target user",
          ).toBeTruthy();
          console.log(`Target user для экспорта: ${targetUserId}`);
        });

        await test.step("Resume PR → статус active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("PR успешно возобновлён (active)");
        });

        await test.step("Экспорт PPTX после resume — ответ OK, content-type корректен", async () => {
          const result = await getTokenAndDownload(
            prAPI,
            request,
            prId,
            revisionId,
            targetUserId,
            "pptx",
          );

          expect(
            result,
            "Токен экспорта PPTX должен быть получен и файл скачан",
          ).toBeTruthy();

          expect(
            result.ok,
            `PPTX экспорт должен вернуть успешный статус, получен ${result.status}`,
          ).toBe(true);

          expect(
            result.contentType,
            "Content-Type PPTX должен содержать 'application/vnd.openxmlformats' или 'application/octet-stream' или 'application/vnd.ms-powerpoint'",
          ).toMatch(
            /application\/(vnd\.openxmlformats|octet-stream|vnd\.ms-powerpoint|zip)/i,
          );

          expect(
            result.size,
            "PPTX файл не должен быть пустым (размер > 0)",
          ).toBeGreaterThan(0);

          console.log(
            `PPTX после resume: status=${result.status}, content-type=${result.contentType}, size=${result.size} байт`,
          );
        });

        await test.step("Экспорт PDF после resume — ответ OK, content-type корректен", async () => {
          const result = await getTokenAndDownload(
            prAPI,
            request,
            prId,
            revisionId,
            targetUserId,
            "pdf",
          );

          expect(
            result,
            "Токен экспорта PDF должен быть получен и файл скачан",
          ).toBeTruthy();

          expect(
            result.ok,
            `PDF экспорт должен вернуть успешный статус, получен ${result.status}`,
          ).toBe(true);

          expect(
            result.contentType,
            "Content-Type PDF должен содержать 'application/pdf' или 'application/octet-stream'",
          ).toMatch(/application\/(pdf|octet-stream)/i);

          expect(
            result.size,
            "PDF файл не должен быть пустым (размер > 0)",
          ).toBeGreaterThan(0);

          console.log(
            `PDF после resume: status=${result.status}, content-type=${result.contentType}, size=${result.size} байт`,
          );
        });

        await test.step("Остановить PR повторно", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(
            ["stopped", "complete"],
            `PR должен быть остановлен, статус: ${prData.status}`,
          ).toContain(prData.status);
          console.log("PR повторно остановлен");
        });

        await test.step("Экспорт PPTX работает после повторной остановки — ответ OK", async () => {
          const result = await getTokenAndDownload(
            prAPI,
            request,
            prId,
            revisionId,
            targetUserId,
            "pptx",
          );

          expect(
            result,
            "Токен экспорта PPTX должен быть получен после второй остановки",
          ).toBeTruthy();

          expect(
            result.ok,
            `PPTX экспорт после второй остановки должен вернуть успешный статус, получен ${result.status}`,
          ).toBe(true);

          expect(
            result.size,
            "PPTX файл не должен быть пустым после второй остановки",
          ).toBeGreaterThan(0);

          console.log(
            `PPTX после второй остановки: status=${result.status}, size=${result.size} байт`,
          );
        });

        await test.step("Экспорт PDF работает после повторной остановки — ответ OK", async () => {
          const result = await getTokenAndDownload(
            prAPI,
            request,
            prId,
            revisionId,
            targetUserId,
            "pdf",
          );

          expect(
            result,
            "Токен экспорта PDF должен быть получен после второй остановки",
          ).toBeTruthy();

          expect(
            result.ok,
            `PDF экспорт после второй остановки должен вернуть успешный статус, получен ${result.status}`,
          ).toBe(true);

          expect(
            result.size,
            "PDF файл не должен быть пустым после второй остановки",
          ).toBeGreaterThan(0);

          console.log(
            `PDF после второй остановки: status=${result.status}, size=${result.size} байт`,
          );
        });
      },
    );

    test(
      "C7423: Токен экспорта доступен на активном PR после resume",
      { tag: ["@normal"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("normal");

        const { seedHelper } = prSeed;
        let prId;
        let revisionId;
        let targetUserId;

        await test.step("Создать PR с заполненными анкетами, остановить, возобновить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Токен экспорта возобновления"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          targetUserId = await getFirstTargetUserId(prAPI, prId);
          expect(
            targetUserId,
            "Должен быть доступен хотя бы один target user",
          ).toBeTruthy();

          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log(
            `PR id=${prId} возобновлён. Target user=${targetUserId}, revision=${revisionId}`,
          );
        });

        await test.step("Получить токен экспорта на активном PR после resume", async () => {
          const { response: tokenResp, data: tokenData } =
            await prAPI.getExportToken(prId, {
              revisionId,
              targetUserId,
              userDate: new Date().toISOString(),
            });

          expect(
            tokenResp.ok(),
            `Запрос токена экспорта должен быть успешным, получен статус ${tokenResp.status()}`,
          ).toBe(true);

          expect(
            tokenData?.token,
            "Ответ должен содержать непустой токен экспорта",
          ).toBeTruthy();

          expect(typeof tokenData.token, "Токен должен быть строкой").toBe(
            "string",
          );

          expect(
            tokenData.token.length,
            "Токен не должен быть пустой строкой",
          ).toBeGreaterThan(0);

          console.log(
            `Токен экспорта получен на активном PR: ${tokenData.token.substring(0, 30)}...`,
          );
        });
      },
    );

    test(
      "C7424: Экспорт PPTX доступен на stopped PR без resume",
      { tag: ["@normal"] },
      async ({ prAPI, prSeed, request }) => {
        setSeverity("normal");

        const { seedHelper } = prSeed;
        let prId;
        let revisionId;
        let targetUserId;

        await test.step("Создать stopped PR с заполненными анкетами", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Экспорт остановленного ревью"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          targetUserId = await getFirstTargetUserId(prAPI, prId);
          expect(
            targetUserId,
            "Должен быть доступен хотя бы один target user",
          ).toBeTruthy();

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(
            `Stopped PR: id=${prId}, status=${prData.status}, revision=${revisionId}, targetUser=${targetUserId}`,
          );
        });

        await test.step("Экспорт PPTX на stopped PR — ответ OK, файл не пустой", async () => {
          const result = await getTokenAndDownload(
            prAPI,
            request,
            prId,
            revisionId,
            targetUserId,
            "pptx",
          );

          expect(
            result,
            "Токен экспорта PPTX должен быть получен для stopped PR",
          ).toBeTruthy();

          expect(
            result.ok,
            `PPTX экспорт stopped PR должен вернуть успешный статус, получен ${result.status}`,
          ).toBe(true);

          expect(
            result.size,
            "PPTX файл stopped PR не должен быть пустым",
          ).toBeGreaterThan(0);

          expect(
            result.contentType,
            "Content-Type PPTX должен быть корректным",
          ).toMatch(
            /application\/(vnd\.openxmlformats|octet-stream|vnd\.ms-powerpoint|zip)/i,
          );

          console.log(
            `PPTX stopped PR: status=${result.status}, content-type=${result.contentType}, size=${result.size} байт`,
          );
        });
      },
    );
  },
);
