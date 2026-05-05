// tests/smoke/api/auth.api.spec.js
// Smoke тесты для аутентификации

import { test, expect } from "../../fixtures/api.js";
import { getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

test.describe(
  "API Authentication",
  { tag: ["@api", "@critical", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "Authentication Smoke");
    });

    test(
      "C4498: POST /auth/account/signin - успешная авторизация админа",
      { tag: ["@smoke", "@critical"] },
      async ({ authAPI }) => {
        setSeverity("critical");

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
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие accessToken в ответе", async () => {
          expect(data, "Тело ответа должно существовать").toBeTruthy();
          expect(data).toHaveProperty("accessToken");
          expect(
            data.accessToken,
            "accessToken не должен быть пустым",
          ).toBeTruthy();
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
      "C4499: POST /auth/account/signin - успешная авторизация пользователя",
      { tag: ["@critical"] },
      async ({ authAPI }) => {
        setSeverity("critical");

        const { email, password } = getCredentials("user");
        let response, data;

        await test.step(`Отправить POST /auth/account/signin с email=${email} (роль: user)`, async () => {
          const result = await authAPI.signIn(email, password);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие accessToken в ответе", async () => {
          expect(data).toHaveProperty("accessToken");
          expect(
            data.accessToken,
            "accessToken не должен быть пустым",
          ).toBeTruthy();
        });
      },
    );

    test(
      "C4500: POST /auth/account/signin - успешная авторизация менеджера",
      { tag: ["@critical"] },
      async ({ authAPI }) => {
        setSeverity("critical");

        const { email, password } = getCredentials("manager");
        let response, data;

        await test.step(`Отправить POST /auth/account/signin с email=${email} (роль: manager)`, async () => {
          const result = await authAPI.signIn(email, password);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие accessToken в ответе", async () => {
          expect(data).toHaveProperty("accessToken");
          expect(
            data.accessToken,
            "accessToken не должен быть пустым",
          ).toBeTruthy();
        });
      },
    );

    test(
      "C4501: POST /auth/account/signin - неверный пароль",
      { tag: ["@negative"] },
      async ({ authAPI }) => {
        setSeverity("critical");

        const { email } = getCredentials("admin");
        const wrongPassword = "wrongpassword123";
        let response;

        await test.step(`Отправить POST /auth/account/signin с email=${email} и неверным паролем`, async () => {
          const result = await authAPI.signIn(email, wrongPassword);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/401/403 (отказ в авторизации)", async () => {
          expect([400, 401, 403]).toContain(response.status());
        });
      },
    );

    test(
      "C4502: POST /auth/account/signin - несуществующий email",
      { tag: ["@negative"] },
      async ({ authAPI }) => {
        setSeverity("critical");

        const fakeEmail = "nonexistent@test.com";
        let response;

        await test.step(`Отправить POST /auth/account/signin с несуществующим email=${fakeEmail}`, async () => {
          const result = await authAPI.signIn(fakeEmail, "password123");
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/401/403/404 (пользователь не найден)", async () => {
          expect([400, 401, 403, 404]).toContain(response.status());
        });
      },
    );

    test(
      "C4503: POST /auth/account/signin - пустые креды",
      { tag: ["@negative"] },
      async ({ authAPI }) => {
        setSeverity("normal");

        let response;

        await test.step('Отправить POST /auth/account/signin с пустыми email="" и паролем=""', async () => {
          const result = await authAPI.signIn("", "");
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/401/422 (ошибка валидации)", async () => {
          expect([400, 401, 422]).toContain(response.status());
        });
      },
    );
  },
);

test.describe(
  "API Authorization Check",
  { tag: ["@api", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.AUTH, "Authorization Check");
    });

    test(
      "C4504: GET /private/accounts/me - получение данных текущего пользователя",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /private/accounts/me (авторизован как admin)", async () => {
          const result = await adminAPI.get("/private/accounts/me");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить наличие объекта account в ответе", async () => {
          expect(data, "Тело ответа должно существовать").toBeTruthy();
          expect(data).toHaveProperty("account");
        });

        await test.step("Проверить структуру данных аккаунта: email присутствует", async () => {
          expect(data.account).toHaveProperty("email");
          expect(
            data.account.email,
            "Email не должен быть пустым",
          ).toBeTruthy();
        });
      },
    );

    test(
      "C4505: GET /private/accounts/me - без токена возвращает 401",
      { tag: ["@smoke", "@critical"] },
      async ({ apiClient }) => {
        setSeverity("critical");

        let response;

        await test.step("Отправить GET /private/accounts/me без авторизационного токена", async () => {
          const result = await apiClient.get("/private/accounts/me");
          response = result.response;
        });

        await test.step("Проверить статус ответа: 401 Unauthorized", async () => {
          expect(response.status(), "Без токена должен быть 401").toBe(401);
        });
      },
    );

    test(
      "C4506: POST /auth/account/signout - выход из системы",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Проверить начальное состояние: admin авторизован (isAuthenticated=true)", async () => {
          expect(
            adminAPI.isAuthenticated(),
            "Admin должен быть авторизован перед выходом",
          ).toBe(true);
        });

        let response;

        await test.step("Отправить POST /auth/account/signout", async () => {
          const result = await adminAPI.signOut();
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/201/204 (успешный выход)", async () => {
          expect([200, 201, 204]).toContain(response.status());
        });
      },
    );
  },
);
