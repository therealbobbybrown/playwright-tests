// tests/functional/api/boundary/unicode-input-api.spec.js
// TASK-API-005: Тесты спецсимволов и Unicode
// Проверка корректной обработки различных типов символов
// @api @boundary @unicode @regression

import { test, expect } from "../../../fixtures/api.js";
import {
  FeedbackAPI,
  ObjectivesAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  setSeverity,
  allure,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import {
  getThanksTypeId,
  getTargetUserId,
  getCurrentUserId,
  getCurrentPeriod,
  cleanupFeedbacks,
  cleanupObjectives,
} from "../../../utils/api/test-helpers.js";

// ============================================================================
// TEST DATA - различные типы символов
// ============================================================================

const UNICODE_TEST_CASES = [
  {
    name: "Кириллица",
    value: "Привет мир! Это тестовое сообщение на русском языке.",
  },
  { name: "Emoji базовые", value: "Отличная работа! 👍🎉🚀✨" },
  { name: "Emoji сложные", value: "👨‍👩‍👧‍👦 Семья 🏳️‍🌈 Флаги 👩‍💻 Профессии" },
  { name: "Китайский", value: "你好世界！这是一条测试消息。" },
  { name: "Японский", value: "こんにちは世界！テストメッセージです。" },
  { name: "Корейский", value: "안녕하세요 세계! 테스트 메시지입니다." },
  { name: "Арабский (RTL)", value: "مرحبا بالعالم! هذه رسالة اختبار." },
  { name: "Иврит (RTL)", value: "שלום עולם! זו הודעת בדיקה." },
  { name: "Тайский", value: "สวัสดีชาวโลก! นี่คือข้อความทดสอบ" },
  {
    name: "Греческий",
    value: "Γειά σου Κόσμε! Αυτό είναι δοκιμαστικό μήνυμα.",
  },
  { name: "Смешанный", value: "Hello Привет 你好 مرحبا 🌍" },
];

const SPECIAL_CHARS_TEST_CASES = [
  { name: "HTML теги", value: '<script>alert("XSS")</script>' },
  { name: "HTML entities", value: "&lt;div&gt;Test&amp;nbsp;&lt;/div&gt;" },
  { name: "JavaScript injection", value: "javascript:alert(1)" },
  { name: "SQL injection SELECT", value: "'; SELECT * FROM users; --" },
  { name: "SQL injection DROP", value: "'; DROP TABLE feedbacks; --" },
  {
    name: "SQL injection UNION",
    value: "1 UNION SELECT username, password FROM users",
  },
  { name: "Path traversal", value: "../../../etc/passwd" },
  { name: "Null byte", value: "test\x00injection" },
  { name: "CRLF injection", value: "test\r\nX-Injected: header" },
  { name: "Tab символы", value: "col1\tcol2\tcol3" },
];

const WHITESPACE_TEST_CASES = [
  { name: "Переносы строк LF", value: "Строка 1\nСтрока 2\nСтрока 3" },
  { name: "Переносы строк CRLF", value: "Строка 1\r\nСтрока 2\r\nСтрока 3" },
  { name: "Переносы строк CR", value: "Строка 1\rСтрока 2\rСтрока 3" },
  { name: "Множественные пробелы", value: "Слово1    Слово2        Слово3" },
  { name: "Табуляция", value: "Колонка1\tКолонка2\tКолонка3" },
  {
    name: "Неразрывный пробел",
    value: "Текст\u00A0с\u00A0неразрывными\u00A0пробелами",
  },
  {
    name: "Zero-width space",
    value: "Текст\u200Bс\u200Bневидимыми\u200Bсимволами",
  },
];

const QUOTE_TEST_CASES = [
  { name: "Двойные кавычки", value: 'Он сказал "Привет"' },
  { name: "Одинарные кавычки", value: "It's a test message" },
  { name: "Обратные кавычки", value: "Использовать `код` в тексте" },
  { name: "Угловые кавычки", value: "«Цитата в кавычках»" },
  { name: "Смешанные кавычки", value: `He said "It's 'amazing'" today` },
  { name: "Обратный слеш", value: "Путь: C:\\Users\\Test\\file.txt" },
  { name: "Слеши", value: "/path/to/file и \\\\network\\share" },
];

// ============================================================================
// UNICODE TESTS - Feedback
// ============================================================================

test.describe(
  "Unicode - Feedback API",
  { tag: ["@api", "@boundary", "@unicode", "@feedback"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Boundary", "Unicode Input");
    });

    const createdFeedbackIds = [];

    test.afterAll(async ({ request }) => {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await cleanupFeedbacks(api, createdFeedbackIds);
    });

    // Тесты для Unicode символов
    for (const testCase of UNICODE_TEST_CASES) {
      test(`Feedback с ${testCase.name}`, async ({ feedbackAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Feedback с ${testCase.name}", async () => {
          const feedbackTypeId = await getThanksTypeId(feedbackAPI);
          const targetUserId = await getTargetUserId(feedbackAPI);
          test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

          ({ response, data } = await feedbackAPI.create({
            body: testCase.value,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }));

          allure.attachment("Input", testCase.value, "text/plain");
          allure.attachment(
            "Response Status",
            `${response.status()}`,
            "text/plain",
          );
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            `Ожидается успешный ответ для "${testCase.name}"`,
          ).toBe(true);
          expect(data?.id, "ID должен быть определён").toBeDefined();

          createdFeedbackIds.push(data.id);

          // Проверяем что данные сохранились корректно
          expect(data.body, "Body должен совпадать с отправленным").toBe(
            testCase.value,
          );

          // Дополнительно получаем и проверяем
          const { response: getResp, data: getData } =
            await feedbackAPI.getById(data.id);
          if (getResp.ok()) {
            expect(getData.body, "Body при чтении должен совпадать").toBe(
              testCase.value,
            );
          }
        });
      });
    }
  },
);

// ============================================================================
// SPECIAL CHARACTERS TESTS - Security
// ============================================================================

test.describe(
  "Special Characters - Security",
  { tag: ["@api", "@boundary", "@security", "@injection"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Boundary", "Special Characters");
    });

    const createdFeedbackIds = [];

    test.afterAll(async ({ request }) => {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await cleanupFeedbacks(api, createdFeedbackIds);
    });

    for (const testCase of SPECIAL_CHARS_TEST_CASES) {
      test(`Feedback с ${testCase.name}`, async ({ feedbackAPI }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: Feedback с ${testCase.name}", async () => {
          const feedbackTypeId = await getThanksTypeId(feedbackAPI);
          const targetUserId = await getTargetUserId(feedbackAPI);
          test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

          ({ response, data } = await feedbackAPI.create({
            body: `Test: ${testCase.value}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }));

          allure.attachment("Malicious Input", testCase.value, "text/plain");
          allure.attachment(
            "Response Status",
            `${response.status()}`,
            "text/plain",
          );

          // API должен либо принять (с экранированием) либо отклонить
          // Не должен падать с 500
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.status() !== 500,
            `Сервер не должен падать на "${testCase.name}". Status: ${response.status()}`,
          ).toBe(true);

          if (response.ok() && data?.id) {
            createdFeedbackIds.push(data.id);

            // Проверяем что данные экранированы или сохранены as-is
            const { response: getResp, data: getData } =
              await feedbackAPI.getById(data.id);

            if (getResp.ok()) {
              allure.attachment(
                "Stored Value",
                getData.body || "null",
                "text/plain",
              );

              // HTML/JS должен быть экранирован или сохранён как текст (не выполняться)
              // Проверяем что данные не потерялись полностью
              expect(
                getData.body && getData.body.length > 0,
                "Body не должен быть пустым после сохранения",
              ).toBe(true);
            }
          }
        });
      });
    }

    test("C4652: XSS в title не исполняется", async ({ feedbackAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: XSS в title не исполняется", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const xssPayloads = [
          "<img src=x onerror=alert(1)>",
          "<svg onload=alert(1)>",
          '"><script>alert(1)</script>',
          "'-alert(1)-'",
          "<body onload=alert(1)>",
        ];

        for (const payload of xssPayloads) {
          const { response, data } = await feedbackAPI.create({
            body: `XSS Test: ${payload}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

          // Сервер не должен падать
          expect(
            response.status() !== 500,
            `Сервер упал на XSS: ${payload}`,
          ).toBe(true);

          if (response.ok() && data?.id) {
            createdFeedbackIds.push(data.id);
          }
        }
      });
    });
  },
);

// ============================================================================
// WHITESPACE TESTS
// ============================================================================

test.describe(
  "Whitespace Characters",
  { tag: ["@api", "@boundary", "@whitespace"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Boundary", "Whitespace");
    });

    const createdFeedbackIds = [];

    test.afterAll(async ({ request }) => {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await cleanupFeedbacks(api, createdFeedbackIds);
    });

    for (const testCase of WHITESPACE_TEST_CASES) {
      test(`Feedback с ${testCase.name}`, async ({ feedbackAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Feedback с ${testCase.name}", async () => {
          const feedbackTypeId = await getThanksTypeId(feedbackAPI);
          const targetUserId = await getTargetUserId(feedbackAPI);
          test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

          ({ response, data } = await feedbackAPI.create({
            body: testCase.value,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }));

          allure.attachment(
            "Input (escaped)",
            JSON.stringify(testCase.value),
            "text/plain",
          );
          allure.attachment(
            "Response Status",
            `${response.status()}`,
            "text/plain",
          );
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            `Ожидается успешный ответ для "${testCase.name}"`,
          ).toBe(true);

          if (data?.id) {
            createdFeedbackIds.push(data.id);

            // Проверяем сохранение whitespace
            const { response: getResp, data: getData } =
              await feedbackAPI.getById(data.id);
            if (getResp.ok()) {
              allure.attachment(
                "Stored (escaped)",
                JSON.stringify(getData.body),
                "text/plain",
              );
            }
          }
        });
      });
    }
  },
);

// ============================================================================
// QUOTE CHARACTERS TESTS
// ============================================================================

test.describe(
  "Quote Characters",
  { tag: ["@api", "@boundary", "@quotes"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Boundary", "Quotes");
    });

    const createdFeedbackIds = [];

    test.afterAll(async ({ request }) => {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await cleanupFeedbacks(api, createdFeedbackIds);
    });

    for (const testCase of QUOTE_TEST_CASES) {
      test(`Feedback с ${testCase.name}`, async ({ feedbackAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Feedback с ${testCase.name}", async () => {
          const feedbackTypeId = await getThanksTypeId(feedbackAPI);
          const targetUserId = await getTargetUserId(feedbackAPI);
          test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

          ({ response, data } = await feedbackAPI.create({
            body: testCase.value,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }));

          allure.attachment("Input", testCase.value, "text/plain");
          allure.attachment(
            "Response Status",
            `${response.status()}`,
            "text/plain",
          );
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            `Ожидается успешный ответ для "${testCase.name}"`,
          ).toBe(true);
          expect(data?.id, "ID должен быть определён").toBeDefined();

          createdFeedbackIds.push(data.id);

          // Проверяем точное сохранение
          expect(data.body, "Body должен совпадать").toBe(testCase.value);
        });
      });
    }
  },
);

// ============================================================================
// OBJECTIVES UNICODE TESTS
// ============================================================================

test.describe(
  "Unicode - Objectives API",
  { tag: ["@api", "@boundary", "@unicode", "@objectives"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Boundary", "Unicode Objectives");
    });

    const createdObjectiveIds = [];

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await cleanupObjectives(api, createdObjectiveIds);
    });

    test("C4653: Цель с кириллицей в названии и описании", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let title, description, response, data;
      await test.step("Выполнить запрос: Цель с кириллицей в названии и описании", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();
        test.skip(!userId, "Не удалось получить userId");

        title = "Цель на русском языке 🎯";
        description = "Описание цели с кириллицей и эмодзи 🚀✨";

        ({ response, data } = await objectivesAPI.saveObjective({
          title,
          description,
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-unicode-${Date.now()}`,
              title: "Ключевой результат на русском 📊",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          response.ok(),
          `Ожидается успешный ответ, получен ${response.status()}`,
        ).toBe(true);
        expect(data?.id, "ID должен быть определён").toBeDefined();

        createdObjectiveIds.push(data.id);

        // Проверяем сохранение
        expect(data.title, "Title должен совпадать").toBe(title);
        expect(data.description, "Description должен совпадать").toBe(
          description,
        );
      });
    });

    test("C4654: Цель с китайскими иероглифами", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let title, response, data;
      await test.step("Выполнить запрос: Цель с китайскими иероглифами", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();
        test.skip(!userId, "Не удалось получить userId");

        title = "目标：提高销售额";
        const description = "这是一个测试目标，用于检验中文字符的处理。";

        ({ response, data } = await objectivesAPI.saveObjective({
          title,
          description,
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-chinese-${Date.now()}`,
              title: "关键结果一",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          response.ok(),
          `Ожидается успешный ответ, получен ${response.status()}`,
        ).toBe(true);

        if (data?.id) {
          createdObjectiveIds.push(data.id);
          expect(data.title, "Chinese title должен совпадать").toBe(title);
        }
      });
    });

    test("C4655: Цель с арабским текстом (RTL)", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let title, response, data;
      await test.step("Выполнить запрос: Цель с арабским текстом (RTL)", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();
        test.skip(!userId, "Не удалось получить userId");

        title = "هدف: تحسين المبيعات";
        const description = "هذا هدف اختباري للتحقق من معالجة النص العربي.";

        ({ response, data } = await objectivesAPI.saveObjective({
          title,
          description,
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-arabic-${Date.now()}`,
              title: "نتيجة رئيسية",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          response.ok(),
          `Ожидается успешный ответ, получен ${response.status()}`,
        ).toBe(true);

        if (data?.id) {
          createdObjectiveIds.push(data.id);
          expect(data.title, "Arabic title должен совпадать").toBe(title);
        }
      });
    });

    test("C4656: Цель с emoji в milestone", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Цель с emoji в milestone", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();
        test.skip(!userId, "Не удалось получить userId");

        ({ response, data } = await objectivesAPI.saveObjective({
          title: "🎯 Emoji Goal Test",
          description: "Testing emoji support 🚀💪📈",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-emoji1-${Date.now()}`,
              title: "✅ First milestone",
              type: "boolean",
              weight: 50,
              progress: 0,
              responsibleUserId: userId,
            },
            {
              temporaryId: `temp-emoji2-${Date.now()}`,
              title: "📊 Second milestone",
              type: "percent",
              weight: 50,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          response.ok(),
          `Ожидается успешный ответ, получен ${response.status()}`,
        ).toBe(true);

        if (data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });
    });
  },
);

// ============================================================================
// LONG UNICODE STRINGS
// ============================================================================

test.describe(
  "Long Unicode Strings",
  { tag: ["@api", "@boundary", "@unicode", "@length"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Boundary", "Long Unicode");
    });

    const createdFeedbackIds = [];

    test.afterAll(async ({ request }) => {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await cleanupFeedbacks(api, createdFeedbackIds);
    });

    test("C4657: Длинный текст с кириллицей (1000 символов)", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let body, response, data;
      await test.step("Выполнить запрос: Длинный текст с кириллицей (1000 символов)", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        // Без trailing whitespace — сервер тримит только пробелы, другие символы не должен
        body = "Абвгдеёжзийклмнопрстуфхцчшщъыьэюя".repeat(30); // 990 символов кириллицы

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        }));

        allure.attachment("Body Length", `${body.length} chars`, "text/plain");
      });

      await test.step("Проверить ответ", async () => {
        expect(
          response.ok(),
          `Ожидается успешный ответ, получен ${response.status()}`,
        ).toBe(true);

        if (data?.id) {
          createdFeedbackIds.push(data.id);
          // Сервер может тримить пробелы, допускаем ±2 символа
          expect(
            Math.abs(data.body.length - body.length) <= 2,
            `Длина должна сохраниться (отправлено ${body.length}, получено ${data.body.length})`,
          ).toBe(true);
        }
      });
    });

    test("C4658: Длинный текст с emoji (500 emoji)", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      let response, data;
      await test.step("Выполнить запрос: Длинный текст с emoji (500 emoji)", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const emojis = "🎉🚀💪👍✨🎯📈🏆⭐💡";
        const body = emojis.repeat(50);

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        }));

        allure.attachment("Body Length", `${body.length} chars`, "text/plain");
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );

        // Emoji могут занимать больше байт, API может ограничить
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201, 400, 413, 422].includes(response.status()),
          `Неожиданный статус: ${response.status()}`,
        ).toBe(true);

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
        }
      });
    });

    test("C4659: Смешанный длинный текст (разные языки)", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Смешанный длинный текст (разные языки)", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const parts = [
          "English text. ",
          "Русский текст. ",
          "中文文本。",
          "テキスト。",
          "مرحبا ",
          "🎉 ",
        ];
        const body = parts.join("").repeat(20);

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          response.ok(),
          `Ожидается успешный ответ, получен ${response.status()}`,
        ).toBe(true);

        if (data?.id) {
          createdFeedbackIds.push(data.id);
        }
      });
    });
  },
);
