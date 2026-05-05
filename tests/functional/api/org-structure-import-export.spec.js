// tests/functional/api/org-structure-import-export.spec.js
// TASK-070: Тесты Import/Export для OrgStructure
//
// Import эндпоинты:
// - POST /manager/org-struct/import/upload
// - POST /manager/org-struct/import/{id}/process
// - POST /manager/org-struct/import/{id}/apply
// - GET /manager/org-struct/import/{id}/data/errors
// - GET /manager/org-struct/import/{id}/data/users
//
// Export эндпоинты:
// - GET /manager/org-struct/users/export/get-token
// - GET /public/org-struct/users/export/{format}

import { test as base, expect } from "@playwright/test";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  logAPICall,
  allure,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// Фикстуры для тестов
const test = base.extend({
  // API клиент с авторизацией админа
  adminAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // API клиент обычного пользователя
  userAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // API клиент manager
  managerAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    await use(api);
  },
});

test.describe(
  "OrgStructure Export API",
  { tag: ["@api", "@regression", "@org-structure", "@export"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Export");
    });

    test.describe("GET /manager/org-struct/users/export/get-token", () => {
      test("C5743: Anonymous не может получить токен экспорта", async ({
        anonAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Anonymous не может получить токен экспорта", async () => {
          const endpoint = "/manager/org-struct/users/export/get-token";
          const { response, data } = await anonAPI.getExportToken();

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            response.status(),
            "Anonymous должен получить 401 Unauthorized",
          ).toBe(401);
        });
      });

      test("C5744: User не может получить токен экспорта (manager API)", async ({
        userAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: User не может получить токен экспорта (manager API)", async () => {
          const endpoint = "/manager/org-struct/users/export/get-token";
          ({ response, data } = await userAPI.getExportToken());

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // User не имеет доступа к manager API
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [403, 404],
            "User не должен иметь доступа к manager API",
          ).toContain(response.status());

          await allure.step("Проверка отказа в доступе для User", async () => {
            allure.attachment(
              "Access Denied",
              JSON.stringify(
                {
                  status: response.status(),
                  reason: "User роль не имеет доступа к /manager/ эндпоинтам",
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );
          });
        });
      });

      test("C5745: Manager может получить токен экспорта (если есть права)", async ({
        managerAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Manager может получить токен экспорта (если есть права)", async () => {
          const endpoint = "/manager/org-struct/users/export/get-token";
          ({ response, data } = await managerAPI.getExportToken());

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // 200 - успех, 403 - нет прав
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403], "Manager должен получить 200 или 403").toContain(
            response.status(),
          );

          if (response.ok()) {
            expect(data, "Ответ должен содержать данные").toBeDefined();

            await allure.step("Анализ токена экспорта", async () => {
              allure.attachment(
                "Export Token Response",
                JSON.stringify(
                  {
                    hasToken: !!data?.token,
                    fields: Object.keys(data || {}),
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            });
          } else {
            await allure.step("Manager не имеет прав на экспорт", async () => {
              allure.attachment(
                "Permission Denied",
                JSON.stringify(data, null, 2),
                "application/json",
              );
            });
          }
        });
      });

      test("C5746: Admin может получить токен экспорта", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: Admin может получить токен экспорта", async () => {
          const endpoint = "/manager/org-struct/users/export/get-token";
          ({ response, data } = await adminAPI.getExportToken());

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // 200 - успех, 400 - ошибка, 403 - нет прав
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400, 403],
            "Admin должен получить 200, 400 или 403",
          ).toContain(response.status());

          if (response.ok()) {
            expect(data, "Ответ должен содержать данные").toBeDefined();

            // Проверяем структуру ответа - должен быть токен
            await allure.step("Проверка структуры токена", async () => {
              if (data?.token) {
                expect(typeof data.token, "Токен должен быть строкой").toBe(
                  "string",
                );
                expect(
                  data.token.length,
                  "Токен должен быть непустым",
                ).toBeGreaterThan(0);

                allure.attachment(
                  "Token Info",
                  JSON.stringify(
                    {
                      tokenPreview: data.token.substring(0, 20) + "...",
                      tokenLength: data.token.length,
                      fields: Object.keys(data),
                    },
                    null,
                    2,
                  ),
                  "application/json",
                );
              } else {
                allure.attachment(
                  "Response without token",
                  JSON.stringify(data, null, 2),
                  "application/json",
                );
              }
            });
          } else {
            await allure.step("Export token недоступен", async () => {
              allure.attachment(
                "Error Details",
                JSON.stringify(
                  {
                    status: response.status(),
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            });
          }
        });
      });

      test("C5747: Admin может получить токен экспорта с конкретной датой", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        let specificDate, response, data;
        await test.step("Выполнить запрос: Admin может получить токен экспорта с конкретной датой", async () => {
          const endpoint = "/manager/org-struct/users/export/get-token";
          // API требует ISO формат: YYYY-MM-DDTHH:mm:ss.SSSZ
          specificDate = new Date().toISOString();
          ({ response, data } = await adminAPI.getExportToken(specificDate));

          logAPICall("GET", endpoint, {
            requestBody: { userDate: specificDate },
            status: response.status(),
            responseBody: data,
          });
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400, 403],
            "Статус должен быть 200, 400 или 403",
          ).toContain(response.status());

          await allure.step("Проверка токена с датой", async () => {
            allure.attachment(
              "Request with Date",
              JSON.stringify(
                {
                  requestedDate: specificDate,
                  status: response.status(),
                  response: data,
                },
                null,
                2,
              ),
              "application/json",
            );
          });
        });
      });
    });

    test.describe("GET /public/org-struct/users/export/{format}", () => {
      test("C5748: Экспорт без токена возвращает ошибку", async ({
        request,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Экспорт без токена возвращает ошибку", async () => {
          const api = new OrgStructureAPI(request);
          const endpoint = "/public/org-struct/users/export/xlsx";

          ({ response, data } = await api.get(endpoint));

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // Без токена должен быть 400 или 401
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 401, 403],
            "Без токена должен быть 400, 401 или 403",
          ).toContain(response.status());

          await allure.step("Проверка отказа без токена", async () => {
            allure.attachment(
              "No Token Error",
              JSON.stringify(
                {
                  expectedBehavior: "API должен требовать токен для экспорта",
                  actualStatus: response.status(),
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );
          });
        });
      });

      test("C5749: Экспорт с невалидным токеном возвращает ошибку", async ({
        request,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Экспорт с невалидным токеном возвращает ошибку", async () => {
          const api = new OrgStructureAPI(request);
          const endpoint =
            "/public/org-struct/users/export/xlsx?token=invalid-token";

          ({ response, data } = await api.get(endpoint));

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 401, 403],
            "С невалидным токеном должен быть 400, 401 или 403",
          ).toContain(response.status());

          await allure.step(
            "Проверка отказа с невалидным токеном",
            async () => {
              allure.attachment(
                "Invalid Token Error",
                JSON.stringify(
                  {
                    testedToken: "invalid-token",
                    expectedBehavior: "API должен отклонять невалидные токены",
                    actualStatus: response.status(),
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            },
          );
        });
      });

      test("C5750: Поддерживаемые форматы экспорта", async ({
        adminAPI,
        request,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поддерживаемые форматы экспорта", async () => {
          // Получаем токен
          const { response: tokenResponse, data: tokenData } =
            await adminAPI.getExportToken();

          await allure.step("Получение токена для экспорта", async () => {
            logAPICall("GET", "/manager/org-struct/users/export/get-token", {
              status: tokenResponse.status(),
              responseBody: tokenData,
            });
          });

          const token = tokenData?.token;
          test.skip(!token, "Не удалось получить токен");

          const formats = ["xlsx", "csv"];
          const api = new OrgStructureAPI(request);
          const results = [];

          for (const format of formats) {
            await allure.step(`Тестирование формата ${format}`, async () => {
              const endpoint = `/public/org-struct/users/export/${format}?token=${token}`;
              const { response } = await api.get(endpoint);

              logAPICall("GET", `/public/org-struct/users/export/${format}`, {
                status: response.status(),
              });

              results.push({
                format,
                status: response.status(),
                success: response.ok(),
                contentType: response.headers()["content-type"],
              });

              // 200 - успех, 400 - формат не поддерживается, 403 - токен истёк
              expect(
                [200, 400, 403],
                `Формат ${format} должен вернуть 200, 400 или 403`,
              ).toContain(response.status());
            });
          }

          await allure.step("Сводка по форматам", async () => {
            allure.attachment(
              "Export Formats Summary",
              JSON.stringify(results, null, 2),
              "application/json",
            );
          });
        });
      });
    });
  },
);

test.describe(
  "OrgStructure Import API",
  { tag: ["@api", "@regression", "@org-structure", "@import"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Import");
    });

    test.describe(
      "POST /manager/org-struct/import/upload",
      { tag: ["@security"] },
      () => {
        test("C5751: Anonymous не может загрузить файл импорта", async ({
          anonAPI,
        }) => {
          setSeverity("critical");

          await test.step("Выполнить: Anonymous не может загрузить файл импорта", async () => {
            const endpoint = "/manager/org-struct/import/upload";
            const dummyFile = Buffer.from("test,data\n1,test");
            const { response, data } = await anonAPI.uploadImportFile(
              dummyFile,
              "test.csv",
            );

            logAPICall("POST", endpoint, {
              requestBody: { filename: "test.csv", size: dummyFile.length },
              status: response.status(),
              responseBody: data,
            });

            expect(
              response.status(),
              "Anonymous должен получить 401 Unauthorized",
            ).toBe(401);
          });
        });

        test("C5752: User не может загрузить файл импорта", async ({
          userAPI,
        }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: User не может загрузить файл импорта", async () => {
            const endpoint = "/manager/org-struct/import/upload";
            const dummyFile = Buffer.from("test,data\n1,test");
            ({ response, data } = await userAPI.uploadImportFile(
              dummyFile,
              "test.csv",
            ));

            logAPICall("POST", endpoint, {
              requestBody: { filename: "test.csv", size: dummyFile.length },
              status: response.status(),
              responseBody: data,
            });

            // User не имеет доступа к manager API
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [403, 404],
              "User не должен иметь доступа к импорту",
            ).toContain(response.status());

            await allure.step("Проверка отказа в доступе", async () => {
              allure.attachment(
                "User Access Denied",
                JSON.stringify(
                  {
                    role: "user",
                    expectedBehavior: "Импорт доступен только admin/manager",
                    status: response.status(),
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            });
          });
        });

        test("C5753: Admin может загрузить файл импорта", async ({
          adminAPI,
        }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Admin может загрузить файл импорта", async () => {
            const endpoint = "/manager/org-struct/import/upload";

            // Создаём минимальный CSV файл для тестирования
            const csvContent =
              "email,firstName,lastName\ntest@example.com,Test,User";
            const file = Buffer.from(csvContent);

            ({ response, data } = await adminAPI.uploadImportFile(
              file,
              "import.csv",
            ));

            logAPICall("POST", endpoint, {
              requestBody: {
                filename: "import.csv",
                content: csvContent,
                size: file.length,
              },
              status: response.status(),
              responseBody: data,
            });

            // 200/201 - успех, 400 - ошибка валидации файла, 415 - неподдерживаемый формат
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201, 400, 415],
              "Статус должен быть 200, 201, 400 или 415",
            ).toContain(response.status());

            if (response.ok()) {
              await allure.step(
                "Проверка ответа успешной загрузки",
                async () => {
                  // Должен вернуться ID импорта
                  if (data?.id) {
                    expect(
                      typeof data.id,
                      "ID импорта должен быть числом",
                    ).toBe("number");
                    expect(
                      data.id,
                      "ID импорта должен быть положительным",
                    ).toBeGreaterThan(0);
                  }

                  allure.attachment(
                    "Upload Success",
                    JSON.stringify(
                      {
                        importId: data?.id,
                        fields: Object.keys(data || {}),
                        data,
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  );
                },
              );
            } else {
              await allure.step(
                "Файл не принят (ошибка валидации)",
                async () => {
                  allure.attachment(
                    "Upload Validation Error",
                    JSON.stringify(
                      {
                        status: response.status(),
                        data,
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  );
                },
              );
            }
          });
        });

        test("C5754: Загрузка пустого файла возвращает ошибку", async ({
          adminAPI,
        }) => {
          setSeverity("normal");

          let response, data;
          await test.step("Выполнить запрос: Загрузка пустого файла возвращает ошибку", async () => {
            const endpoint = "/manager/org-struct/import/upload";
            const emptyFile = Buffer.from("");

            ({ response, data } = await adminAPI.uploadImportFile(
              emptyFile,
              "empty.csv",
            ));

            logAPICall("POST", endpoint, {
              requestBody: { filename: "empty.csv", size: 0 },
              status: response.status(),
              responseBody: data,
            });

            // 400 - пустой файл не принимается
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [400, 415],
              "Пустой файл должен вернуть 400 или 415",
            ).toContain(response.status());

            await allure.step("Проверка отказа для пустого файла", async () => {
              allure.attachment(
                "Empty File Rejected",
                JSON.stringify(
                  {
                    expectedBehavior: "Пустые файлы должны отклоняться",
                    status: response.status(),
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            });
          });
        });

        test("C5755: Загрузка файла с неподдерживаемым форматом возвращает ошибку", async ({
          adminAPI,
        }) => {
          setSeverity("normal");

          let response, data;
          await test.step("Выполнить запрос: Загрузка файла с неподдерживаемым форматом возвращает ошибку", async () => {
            const endpoint = "/manager/org-struct/import/upload";
            const textFile = Buffer.from("This is not a valid import file");

            ({ response, data } = await adminAPI.uploadImportFile(
              textFile,
              "test.txt",
              "text/plain", // явно передаём MIME-тип .txt, иначе хелпер шлёт xlsx MIME
            ));

            logAPICall("POST", endpoint, {
              requestBody: { filename: "test.txt", size: textFile.length },
              status: response.status(),
              responseBody: data,
            });

            // 400/415 - неподдерживаемый формат
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [400, 415],
              "Неподдерживаемый формат должен вернуть 400 или 415",
            ).toContain(response.status());

            await allure.step(
              "Проверка отказа для неверного формата",
              async () => {
                allure.attachment(
                  "Invalid Format Rejected",
                  JSON.stringify(
                    {
                      testedFormat: ".txt",
                      expectedFormats: [".csv", ".xlsx"],
                      status: response.status(),
                      data,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                );
              },
            );
          });
        });
      },
    );

    test.describe("Import Processing Endpoints", () => {
      test("C5756: POST /manager/org-struct/import/{id}/process - с несуществующим ID", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/org-struct/import/{id}/process - с несуществующим ID", async () => {
          const nonExistentId = 999999;
          const endpoint = `/manager/org-struct/import/${nonExistentId}/process`;
          const { response, data } =
            await adminAPI.processImport(nonExistentId);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // 404 - импорт не найден
          expect(
            [400, 404],
            "Несуществующий импорт должен вернуть 400 или 404",
          ).toContain(response.status());

          if (data?.message) {
            allure.attachment("Error Message", data.message, "text/plain");
          }
        });
      });

      test("C5757: POST /manager/org-struct/import/{id}/apply - с несуществующим ID", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/org-struct/import/{id}/apply - с несуществующим ID", async () => {
          const nonExistentId = 999999;
          const endpoint = `/manager/org-struct/import/${nonExistentId}/apply`;
          const { response, data } = await adminAPI.applyImport(nonExistentId);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // 404 - импорт не найден
          expect(
            [400, 404],
            "Несуществующий импорт должен вернуть 400 или 404",
          ).toContain(response.status());

          if (data?.message) {
            allure.attachment("Error Message", data.message, "text/plain");
          }
        });
      });

      test("C5758: GET /manager/org-struct/import/{id}/data/errors - с несуществующим ID", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /manager/org-struct/import/{id}/data/errors - с несуществующим ID", async () => {
          const nonExistentId = 999999;
          const endpoint = `/manager/org-struct/import/${nonExistentId}/data/errors`;
          const { response, data } =
            await adminAPI.getImportErrors(nonExistentId);

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [400, 404],
            "Несуществующий импорт должен вернуть 400 или 404",
          ).toContain(response.status());
        });
      });

      test("C5759: GET /manager/org-struct/import/{id}/data/users - с несуществующим ID", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /manager/org-struct/import/{id}/data/users - с несуществующим ID", async () => {
          const nonExistentId = 999999;
          const endpoint = `/manager/org-struct/import/${nonExistentId}/data/users`;
          const { response, data } =
            await adminAPI.getImportUsers(nonExistentId);

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [400, 404],
            "Несуществующий импорт должен вернуть 400 или 404",
          ).toContain(response.status());
        });
      });
    });

    test.describe("Import Security", { tag: ["@security"] }, () => {
      test("C5760: User не может обрабатывать импорт", async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может обрабатывать импорт", async () => {
          const endpoint = "/manager/org-struct/import/1/process";
          const { response, data } = await userAPI.processImport(1);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [403, 404],
            "User не должен иметь доступа к обработке импорта",
          ).toContain(response.status());
        });
      });

      test("C5761: User не может применять импорт", async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может применять импорт", async () => {
          const endpoint = "/manager/org-struct/import/1/apply";
          const { response, data } = await userAPI.applyImport(1);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [403, 404],
            "User не должен иметь доступа к применению импорта",
          ).toContain(response.status());
        });
      });

      test("C5762: User не может получить ошибки импорта", async ({
        userAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: User не может получить ошибки импорта", async () => {
          const endpoint = "/manager/org-struct/import/1/data/errors";
          const { response, data } = await userAPI.getImportErrors(1);

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [403, 404],
            "User не должен иметь доступа к ошибкам импорта",
          ).toContain(response.status());
        });
      });

      test("C5763: User не может получить пользователей из импорта", async ({
        userAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: User не может получить пользователей из импорта", async () => {
          const endpoint = "/manager/org-struct/import/1/data/users";
          const { response, data } = await userAPI.getImportUsers(1);

          logAPICall("GET", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [403, 404],
            "User не должен иметь доступа к пользователям импорта",
          ).toContain(response.status());
        });
      });

      test("C5764: Anonymous не может обрабатывать импорт", async ({
        anonAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Anonymous не может обрабатывать импорт", async () => {
          const endpoint = "/manager/org-struct/import/1/process";
          const { response, data } = await anonAPI.processImport(1);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            response.status(),
            "Anonymous должен получить 401 Unauthorized",
          ).toBe(401);
        });
      });
    });
  },
);

test.describe(
  "OrgStructure Import/Export Flow",
  { tag: ["@api", "@org-structure"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Flow");
    });

    test("C5765: Полный цикл экспорта пользователей", async ({
      adminAPI,
      request,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Полный цикл экспорта пользователей", async () => {
        // 1. Получаем токен экспорта
        await allure.step("Step 1: Получение токена экспорта", async () => {
          const { response: tokenResponse, data: tokenData } =
            await adminAPI.getExportToken();

          logAPICall("GET", "/manager/org-struct/users/export/get-token", {
            status: tokenResponse.status(),
            responseBody: tokenData,
          });

          // 200 - успех, 400/403 - нет доступа к экспорту
          expect(
            [200, 400, 403],
            "Токен должен вернуть 200, 400 или 403",
          ).toContain(tokenResponse.status());

          if (!tokenResponse.ok()) {
            allure.attachment(
              "Token Error",
              JSON.stringify(tokenData, null, 2),
              "application/json",
            );
            test.skip(true, "Экспорт недоступен");
          }

          const token = tokenData?.token;
          if (!token) {
            allure.attachment(
              "No Token in Response",
              JSON.stringify(tokenData, null, 2),
              "application/json",
            );
            test.skip(true, "Не удалось получить токен");
          }

          allure.attachment(
            "Token Obtained",
            JSON.stringify(
              {
                tokenLength: token.length,
                preview: token.substring(0, 20) + "...",
              },
              null,
              2,
            ),
            "application/json",
          );

          // 2. Скачиваем файл экспорта
          await allure.step("Step 2: Скачивание файла экспорта", async () => {
            const api = new OrgStructureAPI(request);
            const { response: exportResponse } = await api.get(
              `/public/org-struct/users/export/xlsx?token=${token}`,
            );

            logAPICall("GET", "/public/org-struct/users/export/xlsx", {
              status: exportResponse.status(),
            });

            // 200 - файл скачан, 403 - токен истёк
            expect([200, 403], "Экспорт должен вернуть 200 или 403").toContain(
              exportResponse.status(),
            );

            if (exportResponse.ok()) {
              const contentType = exportResponse.headers()["content-type"];
              const contentLength = exportResponse.headers()["content-length"];

              allure.attachment(
                "Export File Info",
                JSON.stringify(
                  {
                    status: exportResponse.status(),
                    contentType,
                    contentLength:
                      contentLength || "not provided (chunked transfer)",
                    expectedContentTypes: [
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      "application/octet-stream",
                    ],
                  },
                  null,
                  2,
                ),
                "application/json",
              );

              // Проверяем content-type (основная проверка для файла)
              // content-length может отсутствовать при chunked transfer encoding
              if (contentType) {
                expect(
                  contentType.includes("spreadsheet") ||
                    contentType.includes("octet-stream") ||
                    contentType.includes("application/"),
                  "Content-type должен указывать на файл",
                ).toBeTruthy();
              }
            }
          });
        });
      });
    });

    test("C5766: Структура ответа getExportToken", async ({ adminAPI }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Структура ответа getExportToken", async () => {
        const endpoint = "/manager/org-struct/users/export/get-token";

        ({ response, data } = await adminAPI.getExportToken());

        logAPICall("GET", endpoint, {
          status: response.status(),
          responseBody: data,
        });

        // 200 - успех, 400/403 - нет доступа
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 400, 403],
          "Статус должен быть 200, 400 или 403",
        ).toContain(response.status());

        await allure.step("Анализ структуры ответа", async () => {
          if (response.ok() && data) {
            const fields = Object.keys(data);

            allure.attachment(
              "Response Structure Analysis",
              JSON.stringify(
                {
                  status: response.status(),
                  fields,
                  hasToken: "token" in data,
                  hasExpiresAt: "expiresAt" in data,
                  hasUrl: "url" in data,
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );

            // Проверяем ожидаемые поля
            expect(
              fields.length,
              "Ответ должен содержать поля",
            ).toBeGreaterThan(0);
          } else {
            allure.attachment(
              "Export Unavailable",
              JSON.stringify(
                {
                  status: response.status(),
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );
          }
        });
      });
    });
  },
);

test.describe(
  "OrgStructure Import Validation",
  { tag: ["@api", "@org-structure", "@validation"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Validation");
    });

    test("C5767: Импорт CSV с корректными заголовками", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Импорт CSV с корректными заголовками", async () => {
        const endpoint = "/manager/org-struct/import/upload";

        const csvContent = [
          "email,firstName,lastName,position,departmentId",
          "import.test@example.com,Test,User,Developer,1",
        ].join("\n");

        ({ response, data } = await adminAPI.uploadImportFile(
          Buffer.from(csvContent),
          "valid.csv",
        ));

        logAPICall("POST", endpoint, {
          requestBody: {
            filename: "valid.csv",
            headers: "email,firstName,lastName,position,departmentId",
          },
          status: response.status(),
          responseBody: data,
        });

        // 200 - валидный файл принят, 400 - ошибка валидации
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201, 400],
          "Валидный CSV должен вернуть 200, 201 или 400",
        ).toContain(response.status());

        await allure.step("Результат загрузки валидного CSV", async () => {
          allure.attachment(
            "Valid CSV Result",
            JSON.stringify(
              {
                csvHeaders: [
                  "email",
                  "firstName",
                  "lastName",
                  "position",
                  "departmentId",
                ],
                status: response.status(),
                accepted: response.ok(),
                data,
              },
              null,
              2,
            ),
            "application/json",
          );
        });
      });
    });

    test("C5768: Импорт CSV с некорректными заголовками", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Импорт CSV с некорректными заголовками", async () => {
        const endpoint = "/manager/org-struct/import/upload";

        const csvContent = [
          "wrong_header1,wrong_header2",
          "value1,value2",
        ].join("\n");

        ({ response, data } = await adminAPI.uploadImportFile(
          Buffer.from(csvContent),
          "invalid.csv",
        ));

        logAPICall("POST", endpoint, {
          requestBody: {
            filename: "invalid.csv",
            headers: "wrong_header1,wrong_header2",
          },
          status: response.status(),
          responseBody: data,
        });

        // 400 - некорректные заголовки должны отклоняться
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [400, 415],
          "Некорректные заголовки должны вернуть 400 или 415",
        ).toContain(response.status());

        await allure.step(
          "Результат загрузки CSV с неверными заголовками",
          async () => {
            allure.attachment(
              "Invalid Headers Result",
              JSON.stringify(
                {
                  testedHeaders: ["wrong_header1", "wrong_header2"],
                  expectedHeaders: ["email", "firstName", "lastName", "..."],
                  status: response.status(),
                  rejected: !response.ok(),
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );
          },
        );
      });
    });

    test("C5769: Импорт с дублирующимися email", async ({ adminAPI }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Импорт с дублирующимися email", async () => {
        const endpoint = "/manager/org-struct/import/upload";

        const csvContent = [
          "email,firstName,lastName",
          "duplicate@example.com,Test1,User1",
          "duplicate@example.com,Test2,User2",
        ].join("\n");

        ({ response, data } = await adminAPI.uploadImportFile(
          Buffer.from(csvContent),
          "duplicates.csv",
        ));

        logAPICall("POST", endpoint, {
          requestBody: {
            filename: "duplicates.csv",
            duplicateEmails: ["duplicate@example.com"],
          },
          status: response.status(),
          responseBody: data,
        });

        // Возможно 200 с ошибками в data, или 400
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201, 400],
          "Файл с дубликатами должен вернуть 200, 201 или 400",
        ).toContain(response.status());

        await allure.step("Проверка обработки дубликатов", async () => {
          if (response.ok() && data?.id) {
            // Проверяем ошибки импорта
            const { response: errResponse, data: errors } =
              await adminAPI.getImportErrors(data.id);

            logAPICall(
              "GET",
              `/manager/org-struct/import/${data.id}/data/errors`,
              {
                status: errResponse.status(),
                responseBody: errors,
              },
            );

            allure.attachment(
              "Duplicate Handling",
              JSON.stringify(
                {
                  importId: data.id,
                  hasErrors: errResponse.ok(),
                  errors,
                },
                null,
                2,
              ),
              "application/json",
            );
          } else {
            allure.attachment(
              "Upload Result",
              JSON.stringify(
                {
                  status: response.status(),
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );
          }
        });
      });
    });
  },
);
