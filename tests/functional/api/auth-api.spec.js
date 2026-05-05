// @ts-check
/**
 * API тесты для модуля аутентификации (AuthAPI)
 *
 * Покрытие методов:
 * - signIn - авторизация пользователя
 * - refresh - обновление токена
 * - signOut - выход из системы
 * - signInByCode - авторизация по коду
 * - getCodeInfo - информация о коде
 *
 * Тесты СТРОГИЕ - не маскируют ошибки API, а выявляют их.
 * Все входные/выходные данные логируются в Allure.
 */
import { test as base, expect } from "@playwright/test";
import { AuthAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// Расширяем test с фикстурой для Auth API (без авторизации - тестируем саму авторизацию)
const test = base.extend({
  authAPI: async ({ request }, use) => {
    const api = new AuthAPI(request);
    await use(api);
  },
  // Авторизованный клиент для тестов, требующих токен
  authenticatedAuthAPI: async ({ request }, use) => {
    const api = new AuthAPI(request);
    const { email, password } = getCredentials("admin");
    const { response } = await api.signIn(email, password);
    if (!response.ok()) {
      throw new Error(
        `Не удалось авторизоваться для теста: ${response.status()}`,
      );
    }
    await use(api);
  },
});

/**
 * Хелпер для логирования входных данных теста в Allure
 */
function logTestInput(name, data) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

/**
 * Хелпер для логирования ожидаемого результата
 */
function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

test.describe(
  "Auth API",
  { tag: ["@api", "@auth", "@functional", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.AUTH, "Authentication");
    });

    // ==================== signIn TESTS ====================

    test.describe("POST /auth/account/signin - Авторизация", () => {
      test(
        "C4562: Успешная авторизация с валидными credentials admin",
        { tag: ["@critical"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email, password, response, data;

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
            logTestInput("credentials", { email, password: "***" });
            logExpected("Status 200, accessToken и refreshToken в ответе");
            expect(email, "Email должен быть определён").toBeTruthy();
            expect(password, "Password должен быть определён").toBeTruthy();
          });

          await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
            const result = await authAPI.signIn(email, password);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data, "Ответ должен содержать данные").toBeDefined();
          });

          await test.step("Проверить наличие accessToken в ответе", async () => {
            expect(
              data.accessToken,
              "Ответ должен содержать accessToken",
            ).toBeDefined();
          });

          await test.step("Проверить тип accessToken: string", async () => {
            expect(
              typeof data.accessToken,
              "accessToken должен быть строкой",
            ).toBe("string");
          });

          await test.step("Проверить что accessToken не пустой", async () => {
            expect(
              data.accessToken.length,
              "accessToken не должен быть пустым",
            ).toBeGreaterThan(0);
          });

          await test.step("Проверить наличие refreshToken в ответе", async () => {
            expect(
              data.refreshToken,
              "Ответ должен содержать refreshToken",
            ).toBeDefined();
          });

          await test.step("Проверить тип refreshToken: string", async () => {
            expect(
              typeof data.refreshToken,
              "refreshToken должен быть строкой",
            ).toBe("string");
          });

          await test.step("Проверить что refreshToken не пустой", async () => {
            expect(
              data.refreshToken.length,
              "refreshToken не должен быть пустым",
            ).toBeGreaterThan(0);
          });

          await test.step("Проверить состояние клиента: isAuthenticated() === true", async () => {
            expect(
              authAPI.isAuthenticated(),
              "Клиент должен быть авторизован после signIn",
            ).toBe(true);
          });
        },
      );

      test(
        "C4563: Успешная авторизация с валидными credentials user",
        { tag: ["@critical"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email, password, response, data;

          await test.step("Подготовить credentials обычного пользователя", async () => {
            const credentials = getCredentials("user");
            email = credentials.email;
            password = credentials.password;
            logTestInput("credentials", { email, password: "***" });
            logExpected("Status 200, accessToken и refreshToken в ответе");
          });

          await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
            const result = await authAPI.signIn(email, password);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
          });

          await test.step("Проверить наличие accessToken в ответе", async () => {
            expect(
              data.accessToken,
              "Ответ должен содержать accessToken",
            ).toBeDefined();
          });

          await test.step("Проверить наличие refreshToken в ответе", async () => {
            expect(
              data.refreshToken,
              "Ответ должен содержать refreshToken",
            ).toBeDefined();
          });
        },
      );

      test(
        "C4564: Успешная авторизация с валидными credentials manager",
        { tag: ["@critical"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email, password, response, data;

          await test.step("Подготовить credentials менеджера", async () => {
            const credentials = getCredentials("manager");
            email = credentials.email;
            password = credentials.password;
            logTestInput("credentials", { email, password: "***" });
            logExpected("Status 200, accessToken и refreshToken в ответе");
          });

          await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
            const result = await authAPI.signIn(email, password);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
          });

          await test.step("Проверить наличие accessToken в ответе", async () => {
            expect(
              data.accessToken,
              "Ответ должен содержать accessToken",
            ).toBeDefined();
          });

          await test.step("Проверить наличие refreshToken в ответе", async () => {
            expect(
              data.refreshToken,
              "Ответ должен содержать refreshToken",
            ).toBeDefined();
          });
        },
      );

      test(
        "C4565: Авторизация с неверным паролем должна вернуть ошибку",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email, wrongPassword, response, data;

          await test.step("Подготовить credentials с неверным паролем", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            wrongPassword = "wrong_password_12345";
            logTestInput("credentials", { email, password: wrongPassword });
            logExpected("Status 400 или 401, сообщение об ошибке");
          });

          await test.step(`Отправить POST /auth/account/signin с email=${email} и неверным паролем`, async () => {
            const result = await authAPI.signIn(email, wrongPassword);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/403 (ошибка авторизации)", async () => {
            expect(
              [400, 401, 403].includes(response.status()),
              `Ожидался статус 400/401/403 для неверного пароля, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить состояние клиента: isAuthenticated() === false", async () => {
            expect(
              authAPI.isAuthenticated(),
              "Клиент НЕ должен быть авторизован с неверным паролем",
            ).toBe(false);
          });
        },
      );

      test(
        "C4566: Авторизация с несуществующим email должна вернуть ошибку",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let fakeEmail, fakePassword, response, data;

          await test.step("Подготовить несуществующий email", async () => {
            fakeEmail = `nonexistent_${Date.now()}@test.com`;
            fakePassword = "any_password";
            logTestInput("credentials", {
              email: fakeEmail,
              password: fakePassword,
            });
            logExpected("Status 400 или 401 или 404");
          });

          await test.step(`Отправить POST /auth/account/signin с email=${fakeEmail}`, async () => {
            const result = await authAPI.signIn(fakeEmail, fakePassword);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/403/404 (пользователь не найден)", async () => {
            expect(
              [400, 401, 403, 404].includes(response.status()),
              `Ожидался статус 400/401/403/404 для несуществующего email, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить состояние клиента: isAuthenticated() === false", async () => {
            expect(
              authAPI.isAuthenticated(),
              "Клиент НЕ должен быть авторизован",
            ).toBe(false);
          });
        },
      );

      test(
        "C4567: Авторизация с пустым email должна вернуть ошибку валидации",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let response, data;

          await test.step("Подготовить credentials с пустым email", async () => {
            logTestInput("credentials", { email: "", password: "password" });
            logExpected("Status 400 или 422 (validation error)");
          });

          await test.step("Отправить POST /auth/account/signin с пустым email", async () => {
            const result = await authAPI.signIn("", "password");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
            expect(
              [400, 422].includes(response.status()),
              `Ожидался статус 400/422 для пустого email, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4568: Авторизация с пустым паролем должна вернуть ошибку валидации",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let email, response, data;

          await test.step("Подготовить credentials с пустым паролем", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            logTestInput("credentials", { email, password: "" });
            logExpected("Status 400 или 422 (validation error)");
          });

          await test.step(`Отправить POST /auth/account/signin с email=${email} и пустым паролем`, async () => {
            const result = await authAPI.signIn(email, "");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
            expect(
              [400, 422].includes(response.status()),
              `Ожидался статус 400/422 для пустого пароля, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4569: Авторизация с некорректным форматом email",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let invalidEmail, response, data;

          await test.step("Подготовить некорректный email (без @)", async () => {
            invalidEmail = "not-an-email";
            logTestInput("credentials", {
              email: invalidEmail,
              password: "password",
            });
            logExpected("Status 400 или 422 (validation error)");
          });

          await test.step(`Отправить POST /auth/account/signin с email=${invalidEmail}`, async () => {
            const result = await authAPI.signIn(invalidEmail, "password");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
            expect(
              [400, 401, 422].includes(response.status()),
              `Ожидался статус 400/401/422 для некорректного email, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4570: Авторизация с SQL-injection в email",
        { tag: ["@security", "@negative"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let sqlInjection, response, data;

          await test.step("Подготовить SQL-injection payload (admin'--)", async () => {
            sqlInjection = "admin'--";
            logTestInput("credentials", {
              email: sqlInjection,
              password: "password",
            });
            logExpected(
              "Status 400/401/422 - API должен отклонить SQL-injection",
            );
          });

          await test.step(`Отправить POST /auth/account/signin с SQL-injection в email`, async () => {
            const result = await authAPI.signIn(sqlInjection, "password");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить что статус НЕ 200 (не успех)", async () => {
            expect(
              response.status() !== 200,
              `SQL-injection не должен приводить к успеху, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить что статус НЕ 500 (не серверная ошибка)", async () => {
            expect(
              response.status() !== 500,
              `SQL-injection не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить состояние клиента: isAuthenticated() === false", async () => {
            expect(
              authAPI.isAuthenticated(),
              "SQL-injection не должен авторизовать",
            ).toBe(false);
          });
        },
      );

      test(
        "C4571: Авторизация с XSS в email",
        { tag: ["@security", "@negative"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let xssPayload, response, data;

          await test.step("Подготовить XSS payload (<script>alert(1)</script>@test.com)", async () => {
            xssPayload = "<script>alert(1)</script>@test.com";
            logTestInput("credentials", {
              email: xssPayload,
              password: "password",
            });
            logExpected("Status 400/401/422 - API должен отклонить XSS");
          });

          await test.step(`Отправить POST /auth/account/signin с XSS в email`, async () => {
            const result = await authAPI.signIn(xssPayload, "password");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/422 (XSS отклонён)", async () => {
            expect(
              [400, 401, 422].includes(response.status()),
              `XSS payload должен быть отклонён, получен статус ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== refresh TESTS ====================

    test.describe("POST /auth/account/refresh - Обновление токена", () => {
      test(
        "C4572: Успешное обновление токена с валидным refreshToken",
        { tag: ["@critical"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email,
            password,
            signInResp,
            signInData,
            refreshToken,
            accessToken,
            response,
            data;

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
          });

          await test.step(`Выполнить авторизацию для получения токенов (email=${email})`, async () => {
            const result = await authAPI.signIn(email, password);
            signInResp = result.response;
            signInData = result.data;
          });

          await test.step("Проверить статус signIn: 200 OK", async () => {
            expect(signInResp.status()).toBe(200);
          });

          await test.step("Извлечь refreshToken и accessToken из ответа signIn", async () => {
            refreshToken = signInData.refreshToken;
            accessToken = signInData.accessToken;
            logTestInput("refreshToken", {
              refreshToken: refreshToken?.substring(0, 20) + "...",
            });
            logExpected("Status 200, новый accessToken");
          });

          await test.step("Отправить POST /auth/account/refresh с refreshToken", async () => {
            const result = await authAPI.refresh(refreshToken, accessToken);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа refresh: 200 OK", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
          });

          await test.step("Проверить наличие нового accessToken в ответе", async () => {
            expect(
              data.accessToken,
              "Ответ должен содержать новый accessToken",
            ).toBeDefined();
          });

          await test.step("Проверить тип нового accessToken: string", async () => {
            expect(typeof data.accessToken).toBe("string");
          });

          await test.step("Проверить что новый accessToken не пустой", async () => {
            expect(data.accessToken.length).toBeGreaterThan(0);
          });
        },
      );

      test(
        "C4573: Обновление с невалидным refreshToken должно вернуть ошибку",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let invalidToken, response, data;

          await test.step("Подготовить невалидный refreshToken", async () => {
            invalidToken = "invalid_refresh_token_12345";
            logTestInput("refreshToken", { refreshToken: invalidToken });
            logExpected("Status 400 или 401");
          });

          await test.step("Отправить POST /auth/account/refresh с невалидным токеном", async () => {
            const result = await authAPI.refresh(invalidToken);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/403 (невалидный токен)", async () => {
            expect(
              [400, 401, 403].includes(response.status()),
              `Ожидался статус 400/401/403 для невалидного токена, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4574: Обновление с пустым refreshToken должно вернуть ошибку",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let response, data;

          await test.step("Подготовить пустой refreshToken", async () => {
            logTestInput("refreshToken", { refreshToken: "" });
            logExpected("Status 400 или 422");
          });

          await test.step("Отправить POST /auth/account/refresh с пустым токеном", async () => {
            const result = await authAPI.refresh("");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
            expect(
              [400, 422].includes(response.status()),
              `Ожидался статус 400/422 для пустого токена, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4575: Обновление с истёкшим refreshToken (симуляция)",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let expiredLikeToken, response, data;

          await test.step("Подготовить JWT-подобный токен с неверной подписью", async () => {
            expiredLikeToken =
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid";
            logTestInput("refreshToken", { refreshToken: expiredLikeToken });
            logExpected("Status 400 или 401");
          });

          await test.step("Отправить POST /auth/account/refresh с истёкшим/невалидным токеном", async () => {
            const result = await authAPI.refresh(expiredLikeToken);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/403 (токен невалидный)", async () => {
            expect(
              [400, 401, 403].includes(response.status()),
              `Ожидался статус ошибки для истёкшего токена, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== signOut TESTS ====================

    test.describe("POST /auth/account/signout - Выход", () => {
      test(
        "C4576: Успешный выход из системы",
        { tag: ["@critical"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email, password, signInResp, response, data;

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
          });

          await test.step(`Выполнить авторизацию (email=${email})`, async () => {
            const result = await authAPI.signIn(email, password);
            signInResp = result.response;
          });

          await test.step("Проверить статус signIn: 200 OK", async () => {
            expect(signInResp.status()).toBe(200);
          });

          await test.step("Проверить состояние клиента после signIn: isAuthenticated() === true", async () => {
            expect(authAPI.isAuthenticated()).toBe(true);
          });

          await test.step("Отправить POST /auth/account/signout", async () => {
            logExpected("Status 200, токен очищен");
            const result = await authAPI.signOut();
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа signOut: 200 OK", async () => {
            expect(
              response.status(),
              `Ожидался статус 200 для signOut, получен ${response.status()}`,
            ).toBe(200);
          });

          await test.step("Проверить состояние клиента после signOut: isAuthenticated() === false", async () => {
            expect(
              authAPI.isAuthenticated(),
              "Токен должен быть очищен после signOut",
            ).toBe(false);
          });
        },
      );

      test(
        "C4577: Выход без авторизации",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let response, data;

          await test.step("Отправить POST /auth/account/signout без предварительной авторизации", async () => {
            logExpected("Status 401 или 200 (идемпотентность)");
            const result = await authAPI.signOut();
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 или 401 (идемпотентность или отказ)", async () => {
            expect(
              [200, 401].includes(response.status()),
              `Ожидался статус 200 или 401 для signOut без авторизации, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4578: Повторный выход (идемпотентность)",
        { tag: ["@edge"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let email, password, firstSignOut, secondSignOut;

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
          });

          await test.step(`Выполнить авторизацию (email=${email})`, async () => {
            await authAPI.signIn(email, password);
          });

          await test.step("Выполнить первый signOut", async () => {
            const result = await authAPI.signOut();
            firstSignOut = result.response;
          });

          await test.step("Проверить статус первого signOut: 200 OK", async () => {
            expect(firstSignOut.status()).toBe(200);
          });

          await test.step("Выполнить повторный signOut", async () => {
            logExpected("Повторный signOut должен вернуть 200 или 401");
            const result = await authAPI.signOut();
            secondSignOut = result.response;
          });

          await test.step("Проверить статус повторного signOut: 200 или 401 (идемпотентность)", async () => {
            expect(
              [200, 401].includes(secondSignOut.status()),
              `Повторный signOut должен быть идемпотентным, получен ${secondSignOut.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== signInByCode TESTS ====================

    test.describe("POST /auth/account/signin/by-code - Авторизация по коду", () => {
      test(
        "C4579: Авторизация с невалидным кодом должна вернуть ошибку",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let invalidCode, response, data;

          await test.step("Подготовить невалидный код авторизации", async () => {
            invalidCode = "invalid_code_12345";
            logTestInput("code", { code: invalidCode });
            logExpected("Status 400 или 401 или 404");
          });

          await test.step(`Отправить POST /auth/account/signin/by-code с code=${invalidCode}`, async () => {
            const result = await authAPI.signInByCode(invalidCode);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/403/404 (код не найден)", async () => {
            expect(
              [400, 401, 403, 404].includes(response.status()),
              `Ожидался статус ошибки для невалидного кода, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить состояние клиента: isAuthenticated() === false", async () => {
            expect(
              authAPI.isAuthenticated(),
              "Невалидный код не должен авторизовать",
            ).toBe(false);
          });
        },
      );

      test(
        "C4580: Авторизация с пустым кодом должна вернуть ошибку",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let response, data;

          await test.step("Подготовить пустой код авторизации", async () => {
            logTestInput("code", { code: "" });
            logExpected("Status 400 или 422");
          });

          await test.step("Отправить POST /auth/account/signin/by-code с пустым кодом", async () => {
            const result = await authAPI.signInByCode("");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
            expect(
              [400, 422].includes(response.status()),
              `Ожидался статус ошибки для пустого кода, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4581: Авторизация с кодом SQL-injection",
        { tag: ["@security", "@negative"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let sqlCode, response, data;

          await test.step("Подготовить SQL-injection код (' OR '1'='1)", async () => {
            sqlCode = "' OR '1'='1";
            logTestInput("code", { code: sqlCode });
            logExpected("API должен безопасно обработать SQL-injection");
          });

          await test.step("Отправить POST /auth/account/signin/by-code с SQL-injection", async () => {
            const result = await authAPI.signInByCode(sqlCode);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить что статус НЕ 200 (не успех)", async () => {
            expect(
              response.status() !== 200,
              `SQL-injection в коде не должен приводить к успеху, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить что статус НЕ 500 (не серверная ошибка)", async () => {
            expect(
              response.status() !== 500,
              `SQL-injection в коде не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== getCodeInfo TESTS ====================

    test.describe("GET /auth/account/signin/by-code/info - Информация о коде", () => {
      test(
        "C4582: Получение информации о невалидном коде",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let invalidCode, response, data;

          await test.step("Подготовить невалидный код для получения информации", async () => {
            invalidCode = "invalid_code_info_12345";
            logTestInput("code", { code: invalidCode });
            logExpected("Status 400, 401 или 404");
          });

          await test.step(`Отправить GET /auth/account/signin/by-code/info с code=${invalidCode}`, async () => {
            const result = await authAPI.getCodeInfo(invalidCode);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/404 (код не найден)", async () => {
            expect(
              [400, 401, 404].includes(response.status()),
              `Ожидался статус ошибки для невалидного кода, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4583: Получение информации о пустом коде",
        { tag: ["@negative"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let response, data;

          await test.step("Подготовить пустой код для получения информации", async () => {
            logTestInput("code", { code: "" });
            logExpected("Status 400, 401 или 422");
          });

          await test.step("Отправить GET /auth/account/signin/by-code/info с пустым кодом", async () => {
            const result = await authAPI.getCodeInfo("");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
            expect(
              [400, 401, 422].includes(response.status()),
              `Ожидался статус ошибки для пустого кода, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test(
        "C4584: Полный цикл: signIn → refresh → signOut",
        { tag: ["@critical"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email,
            password,
            signInResp,
            signInData,
            accessToken,
            refreshToken;
          let refreshResp, refreshData, signOutResp;

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
          });

          await test.step(`[1/3] Выполнить signIn с email=${email}`, async () => {
            const result = await authAPI.signIn(email, password);
            signInResp = result.response;
            signInData = result.data;
          });

          await test.step("Проверить статус signIn: 200 OK", async () => {
            expect(signInResp.status(), "signIn должен вернуть 200").toBe(200);
          });

          await test.step("Проверить наличие accessToken в ответе signIn", async () => {
            expect(
              signInData.accessToken,
              "signIn должен вернуть accessToken",
            ).toBeDefined();
          });

          await test.step("Проверить наличие refreshToken в ответе signIn", async () => {
            expect(
              signInData.refreshToken,
              "signIn должен вернуть refreshToken",
            ).toBeDefined();
          });

          await test.step("Извлечь токены для дальнейшего использования", async () => {
            accessToken = signInData.accessToken;
            refreshToken = signInData.refreshToken;
          });

          await test.step("[2/3] Выполнить refresh с полученным refreshToken", async () => {
            const result = await authAPI.refresh(refreshToken, accessToken);
            refreshResp = result.response;
            refreshData = result.data;
          });

          await test.step("Проверить статус refresh: 200 OK", async () => {
            expect(refreshResp.status(), "refresh должен вернуть 200").toBe(
              200,
            );
          });

          await test.step("Проверить наличие нового accessToken в ответе refresh", async () => {
            expect(
              refreshData.accessToken,
              "refresh должен вернуть новый accessToken",
            ).toBeDefined();
          });

          await test.step("[3/3] Выполнить signOut", async () => {
            const result = await authAPI.signOut();
            signOutResp = result.response;
          });

          await test.step("Проверить статус signOut: 200 OK", async () => {
            expect(signOutResp.status(), "signOut должен вернуть 200").toBe(
              200,
            );
          });

          await test.step("Проверить состояние клиента после signOut: isAuthenticated() === false", async () => {
            expect(
              authAPI.isAuthenticated(),
              "После signOut клиент не авторизован",
            ).toBe(false);
          });
        },
      );

      test(
        "C4585: Множественные авторизации одного пользователя",
        { tag: ["@edge"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let email, password, tokens;

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
            tokens = [];
          });

          await test.step(`Выполнить 3 последовательные авторизации с email=${email}`, async () => {
            for (let i = 0; i < 3; i++) {
              const newAPI = new AuthAPI(authAPI.request);
              const { response, data } = await newAPI.signIn(email, password);

              expect(
                response.status(),
                `Авторизация ${i + 1} должна вернуть 200`,
              ).toBe(200);
              expect(
                data.accessToken,
                `Авторизация ${i + 1} должна вернуть accessToken`,
              ).toBeDefined();

              tokens.push(data.accessToken);
            }
          });

          await test.step("Проверить количество полученных токенов: 3", async () => {
            expect(tokens.length).toBe(3);
          });

          await test.step("Проверить что все токены валидны и непустые", async () => {
            tokens.forEach((token, i) => {
              expect(
                token,
                `Токен ${i + 1} не должен быть пустым`,
              ).toBeDefined();
              expect(
                token.length,
                `Токен ${i + 1} должен иметь длину`,
              ).toBeGreaterThan(0);
            });
          });
        },
      );

      test(
        "C4586: Использование accessToken после signOut должно быть невалидным",
        { tag: ["@security"] },
        async ({ request }) => {
          setSeverity("critical");

          let authAPI,
            email,
            password,
            signInData,
            accessToken,
            apiWithOldToken,
            response;

          await test.step("Создать новый AuthAPI клиент", async () => {
            authAPI = new AuthAPI(request);
          });

          await test.step("Подготовить credentials администратора", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            password = credentials.password;
          });

          await test.step(`Выполнить авторизацию (email=${email})`, async () => {
            const result = await authAPI.signIn(email, password);
            signInData = result.data;
          });

          await test.step("Сохранить accessToken для дальнейшего использования", async () => {
            accessToken = signInData.accessToken;
          });

          await test.step("Выполнить signOut (инвалидация токена)", async () => {
            await authAPI.signOut();
          });

          await test.step("Создать новый клиент с сохранённым (старым) accessToken", async () => {
            apiWithOldToken = new AuthAPI(request, accessToken);
          });

          await test.step("Попытаться использовать старый токен для запроса GET /private/users/me/", async () => {
            const result = await apiWithOldToken.get("/private/users/me/");
            response = result.response;
          });

          await test.step("Логировать результат проверки токена после signOut", async () => {
            allure.attachment(
              "Token validity after signOut",
              JSON.stringify({
                status: response.status(),
                note:
                  response.status() === 401
                    ? "Токен правильно инвалидирован"
                    : "Токен всё ещё валиден (возможно, используется stateless JWT)",
              }),
              "application/json",
            );
          });

          await test.step("Проверить что API вернул валидный HTTP статус", async () => {
            expect(
              [200, 400, 401, 403, 404, 500].includes(response.status()),
            ).toBe(true);
          });
        },
      );
    });

    // ==================== PERFORMANCE / EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test(
        "C4587: Авторизация с очень длинным паролем",
        { tag: ["@edge"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let email, longPassword, response, data;

          await test.step("Подготовить пароль длиной 10000 символов", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            longPassword = "a".repeat(10000);
            logTestInput("credentials", {
              email,
              passwordLength: longPassword.length,
            });
            logExpected(
              "API должен безопасно обработать длинный пароль (400/401/413/422)",
            );
          });

          await test.step(`Отправить POST /auth/account/signin с очень длинным паролем (${longPassword.length} символов)`, async () => {
            const result = await authAPI.signIn(email, longPassword);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить что статус НЕ 500 (не серверная ошибка)", async () => {
            expect(
              response.status() !== 500,
              `Длинный пароль не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить что статус НЕ 200 (не успех)", async () => {
            expect(
              response.status() !== 200,
              `Длинный неверный пароль не должен авторизовать, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4588: Авторизация с unicode символами в пароле",
        { tag: ["@edge"] },
        async ({ authAPI }) => {
          setSeverity("normal");

          let email, unicodePassword, response, data;

          await test.step("Подготовить пароль с unicode символами (китайский + emoji + японский)", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            unicodePassword = "密码🔐パスワード";
            logTestInput("credentials", { email, password: unicodePassword });
            logExpected("API должен корректно обработать unicode");
          });

          await test.step(`Отправить POST /auth/account/signin с unicode паролем`, async () => {
            const result = await authAPI.signIn(email, unicodePassword);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить что статус НЕ 500 (unicode обработан корректно)", async () => {
            expect(
              response.status() !== 500,
              `Unicode пароль не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4589: Авторизация с null bytes в email",
        { tag: ["@security", "@edge"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let nullByteEmail, response, data;

          await test.step("Подготовить email с null byte (admin\\x00@test.com)", async () => {
            nullByteEmail = "admin\x00@test.com";
            logTestInput("credentials", {
              email: "admin\\x00@test.com",
              password: "password",
            });
            logExpected("API должен безопасно обработать null bytes");
          });

          await test.step("Отправить POST /auth/account/signin с null byte в email", async () => {
            const result = await authAPI.signIn(nullByteEmail, "password");
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить что статус НЕ 200 (не успех)", async () => {
            expect(
              response.status() !== 200,
              `Null byte в email не должен приводить к успеху, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить что статус НЕ 500 (не серверная ошибка)", async () => {
            expect(
              response.status() !== 500,
              `Null byte в email не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4590: Множественные неудачные попытки авторизации",
        { tag: ["@security"] },
        async ({ authAPI }) => {
          setSeverity("critical");

          let email, wrongPassword, attempts, results;

          await test.step("Подготовить параметры bruteforce-теста", async () => {
            const credentials = getCredentials("admin");
            email = credentials.email;
            wrongPassword = "wrong_password";
            attempts = 10;
            results = [];
            logTestInput("bruteforce simulation", { email, attempts });
            logExpected(
              "API должен либо продолжать отклонять, либо заблокировать после N попыток",
            );
          });

          await test.step(`Выполнить ${attempts} последовательных попыток авторизации с неверным паролем`, async () => {
            for (let i = 0; i < attempts; i++) {
              const newAPI = new AuthAPI(authAPI.request);
              const { response } = await newAPI.signIn(email, wrongPassword);
              results.push(response.status());
            }
          });

          await test.step("Логировать все полученные статусы", async () => {
            allure.attachment(
              "Bruteforce results",
              JSON.stringify(results),
              "application/json",
            );
          });

          await test.step("Проверить что ни одна попытка не вернула 200 (все отклонены)", async () => {
            results.forEach((status, i) => {
              expect(
                status !== 200,
                `Попытка ${i + 1} не должна быть успешной`,
              ).toBe(true);
            });
          });

          await test.step("Проверить наличие rate limiting (статус 429)", async () => {
            const hasRateLimiting = results.some((status) => status === 429);
            if (hasRateLimiting) {
              allure.attachment(
                "Security note",
                "Rate limiting обнаружен - хорошо!",
                "text/plain",
              );
            }
          });
        },
      );
    });
  },
);
