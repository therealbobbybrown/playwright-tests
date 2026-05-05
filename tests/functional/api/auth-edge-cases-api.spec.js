// tests/functional/api/auth-edge-cases-api.spec.js
// TASK-API-008: Auth Edge Cases Tests
// Тесты крайних случаев аутентификации
// @api @auth @security @regression

import { test, expect } from "../../fixtures/api.js";
import { AuthAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  setSeverity,
  allure,
  MODULES,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// ============================================================================
// SIGN IN EDGE CASES
// ============================================================================

test.describe(
  "Auth - SignIn Edge Cases",
  { tag: ["@api", "@auth", "@signin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "SignIn Edge Cases");
    });

    test("C4591: SignIn с правильными credentials возвращает токены", async ({
      authAPI,
    }) => {
      setSeverity("blocker");

      const { email, password } = getCredentials("admin");

      await test.step("Подготовить credentials администратора", async () => {
        test.info().annotations.push({
          type: "credentials",
          description: `admin: ${email}`,
        });
        expect(
          email,
          "Email администратора должен быть определён",
        ).toBeTruthy();
        expect(
          password,
          "Пароль администратора должен быть определён",
        ).toBeTruthy();
      });

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        response = result.response;
        data = result.data;
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(
          response.ok(),
          `Ожидается 200, получен ${response.status()}`,
        ).toBe(true);
      });

      await test.step("Проверить наличие accessToken в ответе", async () => {
        expect(
          data.accessToken,
          "accessToken должен быть в ответе",
        ).toBeDefined();
        expect(typeof data.accessToken).toBe("string");
      });

      await test.step("Проверить наличие refreshToken в ответе", async () => {
        expect(
          data.refreshToken,
          "refreshToken должен быть в ответе",
        ).toBeDefined();
        expect(typeof data.refreshToken).toBe("string");
      });
    });

    test("C4592: SignIn с неправильным паролем возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("critical");

      const { email } = getCredentials("admin");
      const wrongPassword = "wrong-password-12345";

      await test.step("Подготовить credentials с неверным паролем", async () => {
        test.info().annotations.push({
          type: "credentials",
          description: `email: ${email}, password: ${wrongPassword}`,
        });
      });

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с email=${email} и неверным паролем`, async () => {
        const result = await authAPI.signIn(email, wrongPassword);
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Добавить Response Body в Allure attachment", async () => {
        allure.attachment(
          "Response Body",
          JSON.stringify(data, null, 2),
          "application/json",
        );
      });

      await test.step("Проверить статус ответа: 400/401 (отказ в авторизации)", async () => {
        expect(
          [400, 401].includes(response.status()),
          `Неправильный пароль должен вернуть ошибку. Получен: ${response.status()}`,
        ).toBe(true);
      });

      await test.step("Проверить отсутствие accessToken в ответе", async () => {
        expect(
          data.accessToken,
          "accessToken не должен быть в ответе",
        ).toBeUndefined();
      });
    });

    test("C4593: SignIn с несуществующим email возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("critical");

      const fakeEmail = `nonexistent-${Date.now()}@test-domain.invalid`;
      const anyPassword = "any-password";

      await test.step("Подготовить несуществующий email", async () => {
        test.info().annotations.push({
          type: "credentials",
          description: `email: ${fakeEmail}`,
        });
      });

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с несуществующим email=${fakeEmail}`, async () => {
        const result = await authAPI.signIn(fakeEmail, anyPassword);
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/404 (пользователь не найден)", async () => {
        expect(
          [400, 401, 404].includes(response.status()),
          `Несуществующий email должен вернуть ошибку. Получен: ${response.status()}`,
        ).toBe(true);
      });

      await test.step("Проверить отсутствие accessToken в ответе", async () => {
        expect(
          data.accessToken,
          "accessToken не должен быть в ответе",
        ).toBeUndefined();
      });
    });

    test("C4594: SignIn с пустым email возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step('Отправить POST /auth/account/signin с пустым email="" и паролем="some-password"', async () => {
        const result = await authAPI.signIn("", "some-password");
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
        expect(
          [400, 401, 422].includes(response.status()),
          `Пустой email должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4595: SignIn с пустым паролем возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const { email } = getCredentials("admin");

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с email=${email} и пустым паролем=""`, async () => {
        const result = await authAPI.signIn(email, "");
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
        expect(
          [400, 401, 422].includes(response.status()),
          `Пустой пароль должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4596: SignIn с невалидным форматом email", async ({ authAPI }) => {
      setSeverity("normal");

      const invalidEmails = [
        "not-an-email",
        "@no-local-part.com",
        "missing-domain@",
        "spaces in@email.com",
        "двойная@@собака.ru",
      ];

      await test.step("Подготовить список невалидных email форматов", async () => {
        test.info().annotations.push({
          type: "data",
          description: `Тестируемых форматов: ${invalidEmails.length}`,
        });
      });

      for (const invalidEmail of invalidEmails) {
        let response;
        await test.step(`Отправить POST /auth/account/signin с невалидным email="${invalidEmail}"`, async () => {
          const result = await authAPI.signIn(invalidEmail, "password");
          response = result.response;
          allure.attachment(
            `Email: ${invalidEmail}`,
            `Status: ${response.status()}`,
            "text/plain",
          );
        });

        await test.step(`Проверить статус ответа для email="${invalidEmail}": 400/401/422 (ошибка валидации)`, async () => {
          expect(
            [400, 401, 422].includes(response.status()),
            `Невалидный email "${invalidEmail}" должен быть отклонён. Получен: ${response.status()}`,
          ).toBe(true);
        });
      }
    });

    test("C4597: SignIn с SQL injection в email", async ({ authAPI }) => {
      setSeverity("critical");

      const injectionPayloads = [
        "' OR '1'='1",
        "admin'--",
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users --",
      ];

      await test.step("Подготовить SQL injection payload список", async () => {
        test.info().annotations.push({
          type: "security",
          description: `SQL injection тестов: ${injectionPayloads.length}`,
        });
      });

      for (const payload of injectionPayloads) {
        let response;
        await test.step(`Отправить POST /auth/account/signin с SQL injection payload="${payload}"`, async () => {
          const result = await authAPI.signIn(payload, "password");
          response = result.response;
          allure.attachment(
            `Payload: ${payload}`,
            `Status: ${response.status()}`,
            "text/plain",
          );
        });

        await test.step(`Проверить отклонение SQL injection payload="${payload}"`, async () => {
          expect(
            response.status() !== 200,
            `SQL injection не должен приводить к успешной авторизации: ${payload}`,
          ).toBe(true);
          expect(
            [400, 401, 422].includes(response.status()),
            `Должен вернуть ошибку клиента, получен: ${response.status()}`,
          ).toBe(true);
        });
      }
    });

    test("C4598: SignIn с очень длинным email (1000+ символов)", async ({
      authAPI,
    }) => {
      setSeverity("minor");

      const longEmail = "a".repeat(1000) + "@test.com";

      await test.step("Подготовить очень длинный email (1000+ символов)", async () => {
        test.info().annotations.push({
          type: "data",
          description: `Email length: ${longEmail.length} chars`,
        });
      });

      await test.step("Добавить Email Length в Allure attachment", async () => {
        allure.attachment(
          "Email Length",
          `${longEmail.length} chars`,
          "text/plain",
        );
      });

      let response;
      await test.step(`Отправить POST /auth/account/signin с очень длинным email (${longEmail.length} символов)`, async () => {
        const result = await authAPI.signIn(longEmail, "password");
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/413/422 (ошибка валидации или слишком большой запрос)", async () => {
        expect(
          [400, 401, 413, 422].includes(response.status()),
          `Слишком длинный email должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4599: SignIn с очень длинным паролем (10000+ символов)", async ({
      authAPI,
    }) => {
      setSeverity("minor");

      const { email } = getCredentials("admin");
      const longPassword = "x".repeat(10000);

      await test.step("Подготовить очень длинный пароль (10000+ символов)", async () => {
        test.info().annotations.push({
          type: "data",
          description: `Password length: ${longPassword.length} chars`,
        });
      });

      await test.step("Добавить Password Length в Allure attachment", async () => {
        allure.attachment(
          "Password Length",
          `${longPassword.length} chars`,
          "text/plain",
        );
      });

      let response;
      await test.step(`Отправить POST /auth/account/signin с email=${email} и очень длинным паролем (${longPassword.length} символов)`, async () => {
        const result = await authAPI.signIn(email, longPassword);
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/413/422 (ошибка валидации или слишком большой запрос)", async () => {
        expect(
          [400, 401, 413, 422].includes(response.status()),
          `Слишком длинный пароль должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });
  },
);

// ============================================================================
// TOKEN REFRESH EDGE CASES
// ============================================================================

test.describe(
  "Auth - Token Refresh Edge Cases",
  { tag: ["@api", "@auth", "@refresh"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "Token Refresh");
    });

    test("C4600: Refresh с валидными токенами возвращает новые токены", async ({
      authAPI,
    }) => {
      setSeverity("blocker");

      const { email, password } = getCredentials("admin");

      let signInResp, signInData;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        signInResp = result.response;
        signInData = result.data;
      });

      await test.step("Проверить успешность SignIn: статус 200 OK", async () => {
        expect(signInResp.ok(), "SignIn должен быть успешным").toBe(true);
      });

      await test.step("Проверить наличие accessToken в ответе SignIn", async () => {
        expect(signInData.accessToken, "accessToken должен быть").toBeDefined();
      });

      await test.step("Проверить наличие refreshToken в ответе SignIn", async () => {
        expect(
          signInData.refreshToken,
          "refreshToken должен быть",
        ).toBeDefined();
      });

      const { accessToken, refreshToken } = signInData;
      let response, data;
      await test.step("Отправить POST /auth/account/refresh с валидными токенами", async () => {
        const result = await authAPI.refresh(refreshToken, accessToken);
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(
          response.ok(),
          `Refresh должен быть успешным, получен ${response.status()}`,
        ).toBe(true);
      });

      await test.step("Проверить наличие нового accessToken в ответе", async () => {
        expect(
          data.accessToken,
          "Новый accessToken должен быть в ответе",
        ).toBeDefined();
      });
    });

    test("C4601: Refresh с невалидным refreshToken возвращает 401", async ({
      authAPI,
    }) => {
      setSeverity("critical");

      const { email, password } = getCredentials("admin");

      let signInData;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        signInData = result.data;
      });

      const { accessToken } = signInData;
      const invalidRefreshToken = "invalid-refresh-token-12345";

      await test.step("Подготовить невалидный refreshToken", async () => {
        test.info().annotations.push({
          type: "data",
          description: `refreshToken: ${invalidRefreshToken}`,
        });
      });

      let response, data;
      await test.step("Отправить POST /auth/account/refresh с невалидным refreshToken", async () => {
        const result = await authAPI.refresh(invalidRefreshToken, accessToken);
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 401 Unauthorized", async () => {
        expect(response.status(), "Должен вернуть 401 Unauthorized").toBe(401);
      });

      await test.step("Проверить отсутствие accessToken в ответе", async () => {
        expect(
          data.accessToken,
          "accessToken не должен быть в ответе",
        ).toBeUndefined();
      });
    });

    test("C4602: Refresh с невалидным accessToken", async ({ authAPI }) => {
      setSeverity("critical");

      const { email, password } = getCredentials("admin");

      let signInData;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        signInData = result.data;
      });

      const { refreshToken } = signInData;
      const invalidAccessToken = "invalid-access-token-12345";

      await test.step("Подготовить невалидный accessToken", async () => {
        test.info().annotations.push({
          type: "data",
          description: `accessToken: ${invalidAccessToken}`,
        });
      });

      let response, data;
      await test.step("Отправить POST /auth/account/refresh с валидным refreshToken и невалидным accessToken", async () => {
        const result = await authAPI.refresh(refreshToken, invalidAccessToken);
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200 OK или 401 Unauthorized (зависит от реализации)", async () => {
        expect(
          [200, 401].includes(response.status()),
          `Неожиданный статус: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4603: Refresh без refreshToken возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      let signInData;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        signInData = result.data;
      });

      const { accessToken } = signInData;

      let response;
      await test.step('Отправить POST /auth/account/refresh с пустым refreshToken="" и валидным accessToken', async () => {
        const result = await authAPI.refresh("", accessToken);
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
        expect(
          [400, 401, 422].includes(response.status()),
          `Пустой refreshToken должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4604: Refresh без accessToken возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      let signInData;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        signInData = result.data;
      });

      const { refreshToken } = signInData;

      let response;
      await test.step('Отправить POST /auth/account/refresh с валидным refreshToken и пустым accessToken=""', async () => {
        const result = await authAPI.refresh(refreshToken, "");
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
        expect(
          [400, 401, 422].includes(response.status()),
          `Пустой accessToken должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4605: Refresh с malformed JWT токеном", async ({ authAPI }) => {
      setSeverity("normal");

      const malformedTokens = [
        "not.a.jwt",
        "eyJhbGciOiJIUzI1NiJ9", // Только header
        "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ", // Без подписи
        "malformed-token",
        "....",
      ];

      await test.step("Подготовить список malformed JWT токенов", async () => {
        test.info().annotations.push({
          type: "data",
          description: `Malformed токенов: ${malformedTokens.length}`,
        });
      });

      for (const malformed of malformedTokens) {
        let response;
        await test.step(`Отправить POST /auth/account/refresh с malformed токеном="${malformed.substring(0, 30)}..."`, async () => {
          const result = await authAPI.refresh(malformed, malformed);
          response = result.response;
          allure.attachment(
            `Malformed: ${malformed.substring(0, 30)}...`,
            `Status: ${response.status()}`,
            "text/plain",
          );
        });

        await test.step(`Проверить статус ответа для malformed токена: 400/401/422 (ошибка валидации)`, async () => {
          expect(
            [400, 401, 422].includes(response.status()),
            `Malformed токен должен быть отклонён. Получен: ${response.status()}`,
          ).toBe(true);
        });
      }
    });
  },
);

// ============================================================================
// SIGN OUT EDGE CASES
// ============================================================================

test.describe(
  "Auth - SignOut Edge Cases",
  { tag: ["@api", "@auth", "@signout"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "SignOut Edge Cases");
    });

    test("C4606: SignOut после успешного SignIn", async ({ authAPI }) => {
      setSeverity("critical");

      const { email, password } = getCredentials("admin");

      let signInResp;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        signInResp = result.response;
      });

      await test.step("Проверить успешность SignIn: статус 200 OK", async () => {
        expect(signInResp.ok(), "SignIn должен быть успешным").toBe(true);
      });

      let response;
      await test.step("Отправить POST /auth/account/signout", async () => {
        const result = await authAPI.signOut();
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200/204 (успешный выход)", async () => {
        expect(
          [200, 204].includes(response.status()),
          `SignOut должен быть успешным. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4607: Повторный SignOut возвращает ошибку или успех", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        await authAPI.signIn(email, password);
      });

      let firstSignOut;
      await test.step("Отправить первый POST /auth/account/signout", async () => {
        const result = await authAPI.signOut();
        firstSignOut = result.response;
      });

      await test.step("Добавить First SignOut Status в Allure attachment", async () => {
        allure.attachment(
          "First SignOut Status",
          `${firstSignOut.status()}`,
          "text/plain",
        );
      });

      let secondSignOut;
      await test.step("Отправить второй POST /auth/account/signout (повторный)", async () => {
        const result = await authAPI.signOut();
        secondSignOut = result.response;
      });

      await test.step("Добавить Second SignOut Status в Allure attachment", async () => {
        allure.attachment(
          "Second SignOut Status",
          `${secondSignOut.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200/204/401 (идемпотентность или отказ)", async () => {
        expect(
          [200, 204, 401].includes(secondSignOut.status()),
          `Повторный SignOut: неожиданный статус ${secondSignOut.status()}`,
        ).toBe(true);
      });
    });

    test("C4608: SignOut без предварительного SignIn", async ({ authAPI }) => {
      setSeverity("normal");

      let response;
      await test.step("Отправить POST /auth/account/signout без предварительной авторизации", async () => {
        const result = await authAPI.signOut();
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200/204/401 (идемпотентность или отказ)", async () => {
        expect(
          [200, 204, 401].includes(response.status()),
          `SignOut без авторизации: неожиданный статус ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4609: Запрос к protected endpoint после SignOut возвращает 401", async ({
      authAPI,
    }) => {
      setSeverity("critical");

      const { email, password } = getCredentials("admin");

      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        await authAPI.signIn(email, password);
      });

      let beforeSignOut;
      await test.step("Отправить GET /private/notifications (до SignOut)", async () => {
        const result = await authAPI.get("/private/notifications");
        beforeSignOut = result.response;
      });

      await test.step("Добавить Before SignOut Status в Allure attachment", async () => {
        allure.attachment(
          "Before SignOut Status",
          `${beforeSignOut.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить доступность protected endpoint до SignOut (статус < 500)", async () => {
        expect(
          beforeSignOut.status() < 500,
          `До SignOut protected endpoint должен быть доступен. Получен: ${beforeSignOut.status()}`,
        ).toBe(true);
      });

      await test.step("Отправить POST /auth/account/signout", async () => {
        await authAPI.signOut();
      });

      let afterSignOut;
      await test.step("Отправить GET /private/notifications (после SignOut)", async () => {
        const result = await authAPI.get("/private/notifications");
        afterSignOut = result.response;
      });

      await test.step("Добавить After SignOut Status в Allure attachment", async () => {
        allure.attachment(
          "After SignOut Status",
          `${afterSignOut.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 401 Unauthorized (доступ запрещён после SignOut)", async () => {
        expect(
          afterSignOut.status(),
          "После SignOut protected endpoint должен вернуть 401",
        ).toBe(401);
      });
    });
  },
);

// ============================================================================
// RATE LIMITING / BRUTE FORCE PROTECTION
// ============================================================================

test.describe(
  "Auth - Rate Limiting",
  { tag: ["@api", "@auth", "@security", "@ratelimit"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "Rate Limiting");
    });

    test("C4610: Множественные неудачные попытки входа", async ({
      authAPI,
    }) => {
      setSeverity("critical");

      const testEmail = `rate-limit-test-${Date.now()}@test-domain.invalid`;
      const attempts = 10;

      await test.step("Подготовить параметры для теста rate limiting", async () => {
        test.info().annotations.push({
          type: "data",
          description: `Email: ${testEmail}, Attempts: ${attempts}`,
        });
      });

      const results = [];
      await test.step(`Отправить ${attempts} последовательных запросов POST /auth/account/signin с неверными credentials`, async () => {
        for (let i = 0; i < attempts; i++) {
          const { response } = await authAPI.signIn(
            testEmail,
            "wrong-password",
          );
          results.push(response.status());
        }
      });

      await test.step("Добавить Attempt Results в Allure attachment", async () => {
        allure.attachment(
          "Attempt Results",
          JSON.stringify(results),
          "application/json",
        );
      });

      let rateLimited, clientErrors;
      await test.step("Подсчитать количество 429 (Too Many Requests)", async () => {
        rateLimited = results.filter((status) => status === 429).length;
      });

      await test.step("Подсчитать количество ошибок клиента (4xx)", async () => {
        clientErrors = results.filter(
          (status) => status >= 400 && status < 500,
        ).length;
      });

      await test.step("Добавить Rate Limited Count в Allure attachment", async () => {
        allure.attachment(
          "Rate Limited Count",
          `${rateLimited}/${attempts}`,
          "text/plain",
        );
      });

      await test.step("Добавить Client Errors Count в Allure attachment", async () => {
        allure.attachment(
          "Client Errors Count",
          `${clientErrors}/${attempts}`,
          "text/plain",
        );
      });

      await test.step("Проверить что все попытки вернули ошибку клиента (401/429)", async () => {
        expect(clientErrors, "Все попытки должны вернуть ошибку клиента").toBe(
          attempts,
        );
      });

      await test.step("Документировать наличие/отсутствие rate limiting", async () => {
        if (rateLimited > 0) {
          console.log(
            `Rate limiting активен: ${rateLimited} из ${attempts} попыток заблокированы`,
          );
        } else {
          console.log("Rate limiting не обнаружен для неудачных попыток входа");
        }
      });
    });

    test("C4611: Успешный вход после неудачных попыток", async ({
      authAPI,
    }) => {
      setSeverity("critical");

      const { email, password } = getCredentials("user");

      await test.step("Отправить 3 неудачные попытки входа с неверным паролем", async () => {
        for (let i = 0; i < 3; i++) {
          await authAPI.signIn(email, "wrong-password-" + i);
        }
      });

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с email=${email} и правильным паролем`, async () => {
        const result = await authAPI.signIn(email, password);
        response = result.response;
        data = result.data;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 200 OK или 429 Too Many Requests", async () => {
        expect(
          [200, 429].includes(response.status()),
          `После неудачных попыток: неожиданный статус ${response.status()}`,
        ).toBe(true);
      });

      await test.step("Проверить наличие accessToken при успешном входе (если 200)", async () => {
        if (response.ok()) {
          expect(
            data.accessToken,
            "accessToken должен быть при успешном входе",
          ).toBeDefined();
        }
      });
    });
  },
);

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

test.describe(
  "Auth - Session Management",
  { tag: ["@api", "@auth", "@session"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "Session Management");
    });

    test("C4612: Параллельные сессии с одного аккаунта", async ({
      request,
    }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      let authAPI1, authAPI2;
      await test.step("Создать два независимых API-клиента для параллельных сессий", async () => {
        authAPI1 = new AuthAPI(request);
        authAPI2 = new AuthAPI(request);
      });

      let session1, session2;
      await test.step(`Отправить параллельно два запроса POST /auth/account/signin с email=${email}`, async () => {
        [session1, session2] = await Promise.all([
          authAPI1.signIn(email, password),
          authAPI2.signIn(email, password),
        ]);
      });

      await test.step("Добавить Session 1 Status в Allure attachment", async () => {
        allure.attachment(
          "Session 1 Status",
          `${session1.response.status()}`,
          "text/plain",
        );
      });

      await test.step("Добавить Session 2 Status в Allure attachment", async () => {
        allure.attachment(
          "Session 2 Status",
          `${session2.response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить успешность первой сессии: статус 200 OK", async () => {
        expect(
          session1.response.ok(),
          "Первая сессия должна быть успешной",
        ).toBe(true);
      });

      await test.step("Проверить статус второй сессии: 200/403/409 (успех или блокировка политикой)", async () => {
        expect(
          [200, 403, 409].includes(session2.response.status()),
          `Вторая сессия: неожиданный статус ${session2.response.status()}`,
        ).toBe(true);
      });
    });

    test("C4613: SignIn с разными fingerPrint", async ({ authAPI }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      let resp1;
      await test.step(`Отправить первый POST /auth/account/signin с email=${email} (стандартный fingerPrint)`, async () => {
        const result = await authAPI.signIn(email, password);
        resp1 = result.response;
      });

      await test.step("Проверить успешность первого SignIn: статус 200 OK", async () => {
        expect(resp1.ok(), "Первый signIn должен быть успешным").toBe(true);
      });

      const differentFingerPrint = "different-fingerprint-12345";
      let resp2;
      await test.step(`Отправить второй POST /auth/account/signin с email=${email} и другим fingerPrint="${differentFingerPrint}"`, async () => {
        const result = await authAPI.signIn(email, password, {
          fingerPrint: differentFingerPrint,
        });
        resp2 = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment("Response Status", `${resp2.status()}`, "text/plain");
      });

      await test.step("Проверить статус ответа: 200/400/401/403 (новая сессия или защита от подмены)", async () => {
        expect(
          [200, 400, 401, 403].includes(resp2.status()),
          `SignIn с другим fingerPrint: неожиданный статус ${resp2.status()}`,
        ).toBe(true);
      });
    });

    test("C4614: Использование токена после истечения", async ({ authAPI }) => {
      setSeverity("normal");

      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid";

      await test.step("Установить истёкший JWT токен в клиент", async () => {
        authAPI.setToken(expiredToken);
        test
          .info()
          .annotations.push({ type: "data", description: `Expired token set` });
      });

      let response;
      await test.step("Отправить GET /private/users/current/ с истёкшим токеном", async () => {
        const result = await authAPI.get("/private/users/current/");
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 401 Unauthorized", async () => {
        expect(response.status(), "Истёкший токен должен вернуть 401").toBe(
          401,
        );
      });
    });
  },
);

// ============================================================================
// SIGN IN BY CODE
// ============================================================================

test.describe(
  "Auth - SignIn By Code",
  { tag: ["@api", "@auth", "@code"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "SignIn By Code");
    });

    test("C4615: SignIn с невалидным кодом возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const invalidCode = "invalid-code-12345";

      let response;
      await test.step(`Отправить POST /auth/account/signin-by-code с невалидным кодом="${invalidCode}"`, async () => {
        const result = await authAPI.signInByCode(invalidCode);
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/404 (код не найден или невалиден)", async () => {
        expect(
          [400, 401, 404].includes(response.status()),
          `Невалидный код должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4616: SignIn с пустым кодом возвращает ошибку", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step('Отправить POST /auth/account/signin-by-code с пустым кодом=""', async () => {
        const result = await authAPI.signInByCode("");
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
        expect(
          [400, 401, 422].includes(response.status()),
          `Пустой код должен быть отклонён. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });

    test("C4617: GetCodeInfo с невалидным кодом", async ({ authAPI }) => {
      setSeverity("minor");

      const invalidCode = "invalid-code-info-12345";

      let response;
      await test.step(`Отправить GET /auth/account/code-info?code=${invalidCode}`, async () => {
        const result = await authAPI.getCodeInfo(invalidCode);
        response = result.response;
      });

      await test.step("Добавить Response Status в Allure attachment", async () => {
        allure.attachment(
          "Response Status",
          `${response.status()}`,
          "text/plain",
        );
      });

      await test.step("Проверить статус ответа: 400/401/404 (код не найден или требуется авторизация)", async () => {
        expect(
          [400, 401, 404].includes(response.status()),
          `Невалидный код должен вернуть ошибку. Получен: ${response.status()}`,
        ).toBe(true);
      });
    });
  },
);

// ============================================================================
// TOKEN STRUCTURE VALIDATION
// ============================================================================

test.describe(
  "Auth - Token Structure",
  { tag: ["@api", "@auth", "@token"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "Token Structure");
    });

    test("C4618: AccessToken имеет корректную JWT структуру", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить успешность SignIn: статус 200 OK", async () => {
        expect(response.ok(), "SignIn должен быть успешным").toBe(true);
      });

      const { accessToken } = data;
      let parts;
      await test.step("Проверить структуру JWT: 3 части, разделённые точками", async () => {
        parts = accessToken.split(".");
        expect(parts.length, "JWT должен иметь 3 части").toBe(3);
      });

      const [header, payload] = parts;
      let decodedHeader, decodedPayload;
      await test.step("Декодировать JWT header и payload из base64", async () => {
        try {
          decodedHeader = JSON.parse(Buffer.from(header, "base64").toString());
          decodedPayload = JSON.parse(
            Buffer.from(payload, "base64").toString(),
          );
        } catch (e) {
          throw new Error(`JWT декодирование не удалось: ${e.message}`);
        }
      });

      await test.step("Добавить JWT Header в Allure attachment", async () => {
        allure.attachment(
          "JWT Header",
          JSON.stringify(decodedHeader, null, 2),
          "application/json",
        );
      });

      await test.step("Добавить JWT Payload в Allure attachment", async () => {
        allure.attachment(
          "JWT Payload",
          JSON.stringify(decodedPayload, null, 2),
          "application/json",
        );
      });

      await test.step("Проверить JWT header: наличие поля alg", async () => {
        expect(
          decodedHeader.alg,
          "JWT header должен содержать alg",
        ).toBeDefined();
      });

      await test.step('Проверить JWT header: значение typ="JWT"', async () => {
        expect(decodedHeader.typ, "JWT header должен содержать typ").toBe(
          "JWT",
        );
      });

      await test.step("Проверить JWT payload: наличие exp (expiration)", async () => {
        expect(
          decodedPayload.exp,
          "JWT payload должен содержать exp (expiration)",
        ).toBeDefined();
      });
    });

    test("C4619: RefreshToken присутствует и не пустой", async ({
      authAPI,
    }) => {
      setSeverity("normal");

      const { email, password } = getCredentials("admin");

      let response, data;
      await test.step(`Отправить POST /auth/account/signin с email=${email}`, async () => {
        const result = await authAPI.signIn(email, password);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить успешность SignIn: статус 200 OK", async () => {
        expect(response.ok(), "SignIn должен быть успешным").toBe(true);
      });

      const { refreshToken } = data;

      await test.step("Проверить наличие refreshToken в ответе", async () => {
        expect(
          refreshToken,
          "refreshToken должен быть определён",
        ).toBeDefined();
      });

      await test.step("Проверить тип refreshToken: string", async () => {
        expect(typeof refreshToken, "refreshToken должен быть строкой").toBe(
          "string",
        );
      });

      await test.step("Проверить что refreshToken не пустой (length > 0)", async () => {
        expect(
          refreshToken.length,
          "refreshToken не должен быть пустым",
        ).toBeGreaterThan(0);
      });

      await test.step("Добавить RefreshToken Length в Allure attachment", async () => {
        allure.attachment(
          "RefreshToken Length",
          `${refreshToken.length} chars`,
          "text/plain",
        );
      });
    });
  },
);
