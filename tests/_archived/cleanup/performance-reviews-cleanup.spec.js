// tests/cleanup/performance-reviews-cleanup.spec.js
import { test, expect } from "../fixtures/auth.js";

function inferApiBase(baseUrl) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (url.host.startsWith("client.")) {
      return `${url.protocol}//api.${url.host.slice("client.".length)}`;
    }
    return url.origin;
  } catch {
    return "";
  }
}

const apiBase = inferApiBase(process.env.BASE_URL);
const RUN_CLEANUP = process.env.RUN_CLEANUP === "1";

test.describe("Cleanup - performance reviews", () => {
  test.skip(
    !RUN_CLEANUP,
    "RUN_CLEANUP=1 не задан, пропускаем очистку performance reviews",
  );

  test('удалить отчеты с "Тест" в названии (любой статус)', async ({
    adminAuth: page,
  }, testInfo) => {
    test.skip(!apiBase, "Не удалось вычислить API base из BASE_URL");

    const request = page.context().request;
    let totalRemoved = 0;

    const fetchTestReports = async () => {
      const res = await request.get(`${apiBase}/manager/performance-reviews/`, {
        params: { q: "Тест", limit: 50, offset: 0 },
      });
      expect(res.ok(), "Список performance-reviews").toBeTruthy();

      const data = (await res.json().catch(() => null)) ?? {};
      const items = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : [];

      return items.filter(
        (item) => typeof item.title === "string" && /тест/i.test(item.title),
      );
    };

    const deleteReport = async (id, title) => {
      const deleteOnce = () =>
        request.delete(
          `${apiBase}/manager/performance-reviews/${encodeURIComponent(id)}/`,
        );

      let res = await deleteOnce();
      if (!res.ok()) {
        await request
          .post(
            `${apiBase}/manager/performance-reviews/${encodeURIComponent(id)}/archive`,
          )
          .catch(() => null);
        res = await deleteOnce();
      }

      expect(res.ok(), `Удаление отчета ${id} (${title})`).toBeTruthy();
      totalRemoved += 1;
    };

    // Удаляем пачками, пока не останется отчетов с "Тест" в названии
    // limit=50, поэтому после каждой пачки пересчитываем с offset=0
    /* eslint-disable no-constant-condition */
    while (true) {
      const reports = await fetchTestReports();
      if (!reports.length) break;

      for (const report of reports) {
        const id = report.id ?? report.performanceReviewId ?? report.uuid;
        if (!id) {
          console.warn("[cleanup] Пропуск отчета без ID", report);
          continue;
        }

        await testInfo.step(
          `Удалить отчет "${report.title}" (${id})`,
          async () => {
            await deleteReport(id, report.title);
          },
        );
      }
    }
    /* eslint-enable no-constant-condition */

    console.log(`[cleanup] Удалено отчетов: ${totalRemoved}`);
  });
});
