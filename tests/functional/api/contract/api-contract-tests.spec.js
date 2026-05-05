// tests/functional/api/contract/api-contract-tests.spec.js
// TASK-072: Contract тесты - валидация ответов API по JSON Schema
// @api @contract @regression

import { test, expect } from "../../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  logAPICall,
  allure,
} from "../../../utils/allure-helpers.js";
import {
  SCHEMAS,
  assertMatchesSchema,
  assertArrayMatchesSchema,
  validateWithAllure,
} from "../../../utils/api/schema-validator.js";
import { extractItems } from "../../../utils/api/common-assertions.js";

// ============================================================================
// USER CONTRACT TESTS
// ============================================================================

test.describe("User API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PROFILE, "Contract");
  });

  test("C4786: GET /private/users/current - соответствует схеме User", async ({
    adminAPI,
  }) => {
    setSeverity("critical");

    await test.step("Выполнить: GET /private/users/current - соответствует схеме User", async () => {
      const endpoint = "/private/users/current";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта User", async () => {
          const { valid, errors } = await validateWithAllure(
            data,
            SCHEMAS.User,
            "Current User",
          );
          expect(
            valid,
            `User не соответствует контракту: ${JSON.stringify(errors)}`,
          ).toBe(true);
        });
      } else {
        // Для негативных случаев проверяем ErrorResponse
        if (data) {
          assertMatchesSchema(data, SCHEMAS.ErrorResponse, "Error Response");
        }
      }
    });
  });

  test("C4787: POST /private/users/get - массив User соответствует схеме", async ({
    adminAPI,
  }) => {
    setSeverity("critical");

    await test.step("Выполнить: POST /private/users/get - массив User соответствует схеме", async () => {
      const endpoint = "/private/users/get";

      const { response, data } = await adminAPI.post(endpoint, { limit: 5 });

      logAPICall("POST", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта массива Users", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.User, "User");
            allure.attachment(
              "Validated Users Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// FEEDBACK CONTRACT TESTS
// ============================================================================

test.describe("Feedback API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.FEEDBACK, "Contract");
  });

  test("C4788: POST /private/feedbacks/get - соответствует схеме Feedback", async ({
    adminAPI,
  }) => {
    setSeverity("critical");

    await test.step("Выполнить: POST /private/feedbacks/get - соответствует схеме Feedback", async () => {
      const endpoint = "/private/feedbacks/get";

      const { response, data } = await adminAPI.post(endpoint, { limit: 5 });

      logAPICall("POST", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта Feedbacks", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.Feedback, "Feedback");
            allure.attachment(
              "Validated Feedbacks Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });

  test("C4789: POST /private/feedback-types/get - соответствует схеме FeedbackType", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: POST /private/feedback-types/get - соответствует схеме FeedbackType", async () => {
      const endpoint = "/private/feedback-types/get";

      const { response, data } = await adminAPI.post(endpoint, {});

      logAPICall("POST", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта FeedbackTypes", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(
              items,
              SCHEMAS.FeedbackType,
              "FeedbackType",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// OBJECTIVES CONTRACT TESTS
// ============================================================================

test.describe("Objectives API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.OBJECTIVES, "Contract");
  });

  test("C4790: POST /private/objectives/get - соответствует схеме Objective", async ({
    adminAPI,
  }) => {
    setSeverity("critical");

    await test.step("Выполнить: POST /private/objectives/get - соответствует схеме Objective", async () => {
      const endpoint = "/private/objectives/get";

      const { response, data } = await adminAPI.post(endpoint, { limit: 5 });

      logAPICall("POST", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта Objectives", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.Objective, "Objective");
            allure.attachment(
              "Validated Objectives Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// PERFORMANCE REVIEW CONTRACT TESTS
// ============================================================================

test.describe(
  "Performance Review API Contract",
  { tag: ["@api", "@contract"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Contract");
    });

    test("C4791: POST /private/performance-reviews/get - соответствует схеме", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /private/performance-reviews/get - соответствует схеме", async () => {
        const endpoint = "/private/performance-reviews/get";

        const { response, data } = await adminAPI.post(endpoint, { limit: 5 });

        logAPICall("POST", endpoint, {
          status: response.status(),
          responseBody: data,
        });

        if (response.ok() && data) {
          await allure.step(
            "Валидация контракта PerformanceReviews",
            async () => {
              const items = extractItems(data);
              if (items.length > 0) {
                assertArrayMatchesSchema(
                  items,
                  SCHEMAS.PerformanceReview,
                  "PerformanceReview",
                );
                allure.attachment(
                  "Validated PRs Count",
                  String(items.length),
                  "text/plain",
                );
              }
            },
          );
        }
      });
    });
  },
);

// ============================================================================
// SURVEY CONTRACT TESTS
// ============================================================================

test.describe("Survey API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEYS, "Contract");
  });

  test("C4792: POST /private/surveys/get - соответствует схеме Survey", async ({
    adminAPI,
  }) => {
    setSeverity("critical");

    await test.step("Выполнить: POST /private/surveys/get - соответствует схеме Survey", async () => {
      const endpoint = "/private/surveys/get";

      const { response, data } = await adminAPI.post(endpoint, { limit: 5 });

      logAPICall("POST", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта Surveys", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.Survey, "Survey");
            allure.attachment(
              "Validated Surveys Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// DEVELOPMENT PLANS CONTRACT TESTS
// ============================================================================

test.describe(
  "Development Plans API Contract",
  { tag: ["@api", "@contract"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Contract");
    });

    test("C4793: POST /private/development-plans/get - соответствует схеме", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /private/development-plans/get - соответствует схеме", async () => {
        const endpoint = "/private/development-plans/get";

        const { response, data } = await adminAPI.post(endpoint, { limit: 5 });

        logAPICall("POST", endpoint, {
          status: response.status(),
          responseBody: data,
        });

        if (response.ok() && data) {
          await allure.step(
            "Валидация контракта DevelopmentPlans",
            async () => {
              const items = extractItems(data);
              if (items.length > 0) {
                assertArrayMatchesSchema(
                  items,
                  SCHEMAS.DevelopmentPlan,
                  "DevelopmentPlan",
                );
                allure.attachment(
                  "Validated Plans Count",
                  String(items.length),
                  "text/plain",
                );
              }
            },
          );
        }
      });
    });
  },
);

// ============================================================================
// ORG STRUCTURE CONTRACT TESTS
// ============================================================================

test.describe(
  "Org Structure API Contract",
  { tag: ["@api", "@contract"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Contract");
    });

    test("C4794: POST /manager/org-struct/departments/get - соответствует схеме", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /manager/org-struct/departments/get - соответствует схеме", async () => {
        const endpoint = "/manager/org-struct/departments/get";

        const { response, data } = await adminAPI.post(endpoint, {});

        logAPICall("POST", endpoint, {
          status: response.status(),
          responseBody: data,
        });

        if (response.ok() && data) {
          await allure.step("Валидация контракта Departments", async () => {
            const items = extractItems(data);
            if (items.length > 0) {
              assertArrayMatchesSchema(items, SCHEMAS.Department, "Department");
              allure.attachment(
                "Validated Departments Count",
                String(items.length),
                "text/plain",
              );
            }
          });
        }
      });
    });
  },
);

// ============================================================================
// COMPETENCIES CONTRACT TESTS
// ============================================================================

test.describe(
  "Competencies API Contract",
  { tag: ["@api", "@contract"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Competencies", "Contract");
    });

    test("C4795: POST /private/competencies/get - соответствует схеме Competency", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/competencies/get - соответствует схеме Competency", async () => {
        const endpoint = "/private/competencies/get";

        const { response, data } = await adminAPI.post(endpoint, { limit: 10 });

        logAPICall("POST", endpoint, {
          status: response.status(),
          responseBody: data,
        });

        if (response.ok() && data) {
          await allure.step("Валидация контракта Competencies", async () => {
            const items = extractItems(data);
            if (items.length > 0) {
              assertArrayMatchesSchema(items, SCHEMAS.Competency, "Competency");
              allure.attachment(
                "Validated Competencies Count",
                String(items.length),
                "text/plain",
              );
            }
          });
        }
      });
    });
  },
);

// ============================================================================
// ERROR RESPONSE CONTRACT TESTS
// ============================================================================

test.describe("Error Response Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.AUTH, "Contract");
  });

  test("C4796: 401 Unauthorized - соответствует схеме ErrorResponse", async ({
    apiClient,
  }) => {
    setSeverity("normal");

    let response, data;
    await test.step("Выполнить запрос: 401 Unauthorized - соответствует схеме ErrorResponse", async () => {
      const endpoint = "/private/users/current";

      // Запрос без авторизации
      ({ response, data } = await apiClient.get(endpoint));

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });
    });

    await test.step("Проверить ответ", async () => {
      expect(
        response.status(),
        "Неавторизованный запрос должен вернуть 401",
      ).toBe(401);

      if (data) {
        await allure.step("Валидация контракта ErrorResponse", async () => {
          expect(
            data.message !== undefined ||
              data.error !== undefined ||
              data.statusCode !== undefined,
            "Error response должен содержать message, error или statusCode",
          ).toBe(true);
        });
      }
    });
  });

  test("C4797: 404 Not Found - соответствует схеме ErrorResponse", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: 404 Not Found - соответствует схеме ErrorResponse", async () => {
      const endpoint = "/private/users/999999999";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (!response.ok() && data) {
        await allure.step(
          "Валидация контракта ErrorResponse для ошибки",
          async () => {
            expect(
              data.message !== undefined ||
                data.error !== undefined ||
                data.statusCode !== undefined,
              "Error response должен содержать message, error или statusCode",
            ).toBe(true);
          },
        );
      }
    });
  });
});

// ============================================================================
// PAGINATION CONTRACT TESTS
// ============================================================================

test.describe("Pagination Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Common", "Contract");
  });

  test("C4798: Пагинированный ответ содержит метаданные", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: Пагинированный ответ содержит метаданные", async () => {
      const endpoint = "/private/feedbacks/get";

      const { response, data } = await adminAPI.post(endpoint, {
        limit: 2,
        offset: 0,
      });

      logAPICall("POST", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Проверка структуры пагинации", async () => {
          const hasTotal = data.total !== undefined;
          const hasItems = data.items !== undefined || Array.isArray(data);

          allure.attachment(
            "Pagination Meta",
            JSON.stringify(
              {
                hasTotal,
                hasItems,
                total: data.total,
                itemsCount:
                  data.items?.length || (Array.isArray(data) ? data.length : 0),
              },
              null,
              2,
            ),
            "application/json",
          );

          expect(
            hasTotal || hasItems,
            "Ответ должен содержать total или items",
          ).toBe(true);
        });
      }
    });
  });
});

// ============================================================================
// NOTIFICATION CONTRACT TESTS
// ============================================================================

test.describe(
  "Notification API Contract",
  { tag: ["@api", "@contract"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("Notifications", "Contract");
    });

    test("C4799: GET /private/notifications - соответствует схеме Notification", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications - соответствует схеме Notification", async () => {
        const endpoint = "/private/notifications";

        const { response, data } = await adminAPI.get(endpoint);

        logAPICall("GET", endpoint, {
          status: response.status(),
          responseBody: data,
        });

        if (response.ok() && data) {
          await allure.step("Валидация контракта Notifications", async () => {
            const items = extractItems(data);
            if (items.length > 0) {
              assertArrayMatchesSchema(
                items,
                SCHEMAS.Notification,
                "Notification",
              );
              allure.attachment(
                "Validated Notifications Count",
                String(items.length),
                "text/plain",
              );
            }
          });
        }
      });
    });
  },
);

// ============================================================================
// USER GROUP CONTRACT TESTS
// ============================================================================

test.describe("UserGroup API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Org Structure", "Contract");
  });

  test("C4800: GET /manager/user-groups/ - соответствует схеме UserGroup", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /manager/user-groups/ - соответствует схеме UserGroup", async () => {
      const endpoint = "/manager/user-groups/";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта UserGroups", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.UserGroup, "UserGroup");
            allure.attachment(
              "Validated UserGroups Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// INVITE LINK CONTRACT TESTS
// ============================================================================

test.describe("InviteLink API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Org Structure", "Contract");
  });

  test("C4801: GET /manager/invite-links/ - соответствует схеме InviteLink", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /manager/invite-links/ - соответствует схеме InviteLink", async () => {
      const endpoint = "/manager/invite-links/";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта InviteLinks", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.InviteLink, "InviteLink");
            allure.attachment(
              "Validated InviteLinks Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// ASSESSMENT CONTRACT TESTS
// ============================================================================

test.describe("Assessment API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Assessments", "Contract");
  });

  test("C4802: GET /manager/assessments/ - соответствует схеме Assessment", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /manager/assessments/ - соответствует схеме Assessment", async () => {
      const endpoint = "/manager/assessments/";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта Assessments", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.Assessment, "Assessment");
            allure.attachment(
              "Validated Assessments Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// GIFT CONTRACT TESTS
// ============================================================================

test.describe("Gift API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Gift Shop", "Contract");
  });

  test("C4803: GET /manager/gifts/ - соответствует схеме Gift", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /manager/gifts/ - соответствует схеме Gift", async () => {
      const endpoint = "/manager/gifts/";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта Gifts", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.Gift, "Gift");
            allure.attachment(
              "Validated Gifts Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });

  test("C4804: GET /private/gift-orders/ - соответствует схеме GiftOrder", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /private/gift-orders/ - соответствует схеме GiftOrder", async () => {
      const endpoint = "/private/gift-orders/";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта GiftOrders", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.GiftOrder, "GiftOrder");
            allure.attachment(
              "Validated GiftOrders Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// ROLE CONTRACT TESTS
// ============================================================================

test.describe("Role API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Roles", "Contract");
  });

  test("C4805: GET /manager/roles - соответствует схеме Role", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /manager/roles - соответствует схеме Role", async () => {
      const endpoint = "/manager/roles";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта Roles", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(items, SCHEMAS.Role, "Role");
            allure.attachment(
              "Validated Roles Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// KARMA CONTRACT TESTS
// ============================================================================

test.describe("Karma API Contract", { tag: ["@api", "@contract"] }, () => {
  test.beforeEach(() => {
    markAsAPITest("Karma", "Contract");
  });

  test("C4806: GET /private/karma/transactions/ - соответствует схеме KarmaTransaction", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    await test.step("Выполнить: GET /private/karma/transactions/ - соответствует схеме KarmaTransaction", async () => {
      const endpoint = "/private/karma/transactions/";

      const { response, data } = await adminAPI.get(endpoint);

      logAPICall("GET", endpoint, {
        status: response.status(),
        responseBody: data,
      });

      if (response.ok() && data) {
        await allure.step("Валидация контракта KarmaTransactions", async () => {
          const items = extractItems(data);
          if (items.length > 0) {
            assertArrayMatchesSchema(
              items,
              SCHEMAS.KarmaTransaction,
              "KarmaTransaction",
            );
            allure.attachment(
              "Validated Transactions Count",
              String(items.length),
              "text/plain",
            );
          }
        });
      }
    });
  });
});

// ============================================================================
// NINEBOX CONTRACT TESTS
// ============================================================================

test.describe("NineBox API Contract", { tag: ["@api", "@contract", "@ninebox"] }, () => {
  test.beforeEach(async ({ nineBoxAPI }) => {
    markAsAPITest(MODULES.NINE_BOX, "Contract");
    // Гарантировать что NineBox включён для валидации контракта
    await nineBoxAPI.ensureEnabled();
  });

  test("C4807: GET /manager/ninebox-settings/ - соответствует схеме NineBoxSettings", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    let response, data;
    await test.step("Выполнить запрос: GET /manager/ninebox-settings/", async () => {
      ({ response, data } = await adminAPI.get("/manager/ninebox-settings/"));

      logAPICall("GET", "/manager/ninebox-settings/", {
        status: response.status(),
        responseBody: data,
      });
    });

    await test.step("Проверить ответ: статус 200 и валидация контракта NineBoxSettings", async () => {
      expect(response.status(), "Settings endpoint должен вернуть 200").toBe(200);
      expect(data, "Ответ должен содержать данные").toBeDefined();

      const { valid, errors } = await validateWithAllure(
        data,
        SCHEMAS.NineBoxSettings,
        "NineBoxSettings",
      );
      expect(
        valid,
        `NineBoxSettings не соответствует контракту: ${JSON.stringify(errors)}`,
      ).toBe(true);
    });
  });

  test("C4808: POST /manager/ninebox/get/ - соответствует схеме NineBoxMatrix", async ({
    adminAPI,
  }) => {
    setSeverity("normal");

    let response, data;
    await test.step("Выполнить запрос: POST /manager/ninebox/get/", async () => {
      ({ response, data } = await adminAPI.post("/manager/ninebox/get/", {}));

      logAPICall("POST", "/manager/ninebox/get/", {
        status: response.status(),
        responseBody: data,
      });
    });

    await test.step("Проверить ответ: статус 200 и валидация контракта NineBoxMatrix", async () => {
      expect(response.status(), "Matrix endpoint должен вернуть 200").toBe(200);
      expect(data, "Ответ должен содержать данные").toBeDefined();

      const { valid, errors } = await validateWithAllure(
        data,
        SCHEMAS.NineBoxMatrix,
        "NineBoxMatrix",
      );
      expect(
        valid,
        `NineBoxMatrix не соответствует контракту: ${JSON.stringify(errors)}`,
      ).toBe(true);
    });
  });
});
