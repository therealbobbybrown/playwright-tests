// tests/cleanup/surveys-cleanup.spec.js
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
const SEARCH_TERMS = ["Тест", "Новый опрос"];
const TITLE_REGEX = /(тест|новый\s+опрос)/i;
const RUN_CLEANUP = process.env.RUN_CLEANUP === "1";

async function getAuthHeaders(page) {
  const storage = await page.evaluate(() => {
    const entries = (store) => Object.fromEntries(Object.entries(store));
    return {
      local: entries(window.localStorage),
      session: entries(window.sessionStorage),
    };
  });

  const cookies = await page.context().cookies();

  const pickToken = (record) => {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;

      if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(trimmed)) {
        return trimmed;
      }

      if (key.toLowerCase().includes("token")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed === "string") return parsed;
          if (parsed?.accessToken) return parsed.accessToken;
          if (parsed?.token) return parsed.token;
        } catch {
          // ignore JSON parse errors
        }
      }
    }
    return null;
  };

  const token =
    pickToken(storage.local) ??
    pickToken(storage.session) ??
    cookies
      .map((cookie) => {
        if (
          cookie.name.toLowerCase().includes("access_token") &&
          /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(cookie.value)
        ) {
          return cookie.value;
        }
        return null;
      })
      .find(Boolean);

  const cookieHeader = cookies.length
    ? cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
    : null;

  if (!token && !cookieHeader) return {};

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };
}

test.describe("Cleanup - surveys", () => {
  test.skip(!RUN_CLEANUP, "RUN_CLEANUP=1 не задан, пропускаем очистку опросов");

  test('удалить опросы с "Тест" или "Новый опрос" в названии (любой статус)', async ({
    adminAuth: page,
  }) => {
    test.skip(!apiBase, "Не удалось вычислить API base из BASE_URL");

    const request = page.context().request;
    let totalRemoved = 0;

    const fetchTestSurveys = async () => {
      const headers = await getAuthHeaders(page);
      const collected = new Map();

      for (const term of SEARCH_TERMS) {
        const res = await request.get(`${apiBase}/manager/surveys/`, {
          params: { q: term, limit: 50, offset: 0 },
          headers,
        });
        expect(res.ok(), `Список опросов (${term})`).toBeTruthy();

        const data = (await res.json().catch(() => null)) ?? {};
        const items = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.results)
            ? data.results
            : Array.isArray(data)
              ? data
              : [];

        for (const item of items) {
          if (
            !item ||
            typeof item.title !== "string" ||
            !TITLE_REGEX.test(item.title)
          )
            continue;
          const id = item.id ?? item.surveyId ?? item.uuid;
          if (!id) continue;
          if (!collected.has(id)) collected.set(id, item);
        }
      }

      return Array.from(collected.values());
    };

    const stopSurvey = async (id) => {
      const headers = await getAuthHeaders(page);
      await request
        .post(`${apiBase}/manager/surveys/${encodeURIComponent(id)}/stop/`, {
          headers,
        })
        .catch(() => null);
    };

    const deleteSurvey = async (id, title) => {
      await stopSurvey(id);

      const headers = await getAuthHeaders(page);
      const res = await request.delete(
        `${apiBase}/manager/surveys/${encodeURIComponent(id)}/`,
        {
          headers,
        },
      );

      expect(res.ok(), `Удаление опроса ${id} (${title})`).toBeTruthy();
      totalRemoved += 1;
    };

    /* eslint-disable no-constant-condition */
    while (true) {
      const surveys = await fetchTestSurveys();
      if (!surveys.length) break;

      for (const survey of surveys) {
        const id = survey.id ?? survey.surveyId ?? survey.uuid;
        if (!id) {
          console.warn("[cleanup] Пропуск опроса без ID", survey);
          continue;
        }

        await test.step(`Удалить опрос "${survey.title}" (${id})`, async () => {
          await deleteSurvey(id, survey.title);
        });
      }
    }
    /* eslint-enable no-constant-condition */

    console.log(`[cleanup] Удалено опросов: ${totalRemoved}`);
  });
});
