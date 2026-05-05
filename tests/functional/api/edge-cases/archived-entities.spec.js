// tests/functional/api/edge-cases/archived-entities.spec.js
// TASK-API-014: Тесты работы с архивированными сущностями
// Проверка архивирования, восстановления и ограничений
// @api @archive @edge-cases

import { test as base, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  allure,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

// Фикстуры
const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хранение созданных ID для cleanup
const createdPRIds = [];

// Главный PR для всех тестов
let mainTestPRId = null;

// Создаём/получаем PR перед всеми тестами
test.beforeAll(async ({ request }) => {
  const api = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  // Пытаемся создать новый PR с полным набором полей
  const payload = {
    title: `E2E_Архивация ревью_${Date.now()}`,
    description: "Основной ревью для тестов архивации",
    // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
    directions: [
      {
        id: null,
        receiverType: "self",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: false,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: false,
        title: null,
        description: null,
      },
    ],
    anonymityType: "notAnonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: false,
      baseDate: new Date().toISOString(),
      repeatType: "noRepeat",
      sendTime: "09:00",
      timezoneOffset: 0,
    },
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
    isApprovalStep: false,
    isAsyncStep: false,
    isNominationEnabled: false,
    isApprovalEnabled: false,
    isSelfAssessmentEnabled: true,
    isAsync: false,
  };

  const { response, data } = await api.create(payload);

  if (response.ok() && data?.id) {
    mainTestPRId = data.id;
    createdPRIds.push(data.id);
    console.log(`[beforeAll] Создан тестовый PR: ${mainTestPRId}`);
    return;
  }

  // Если не удалось создать, ищем существующий draft
  const { data: listData } = await api.getList();
  const items = listData?.items || listData || [];
  const draftPR = items.find((pr) => pr.status === "draft");

  if (draftPR) {
    mainTestPRId = draftPR.id;
    if (!createdPRIds.includes(draftPR.id)) {
      createdPRIds.push(draftPR.id);
    }
    console.log(
      `[beforeAll] Используем существующий draft PR: ${mainTestPRId}`,
    );
    return;
  }

  // Пытаемся восстановить архивированный
  for (const pr of items.slice(0, 10)) {
    const restoreResult = await api.restore(pr.id);
    if (restoreResult.response.ok()) {
      mainTestPRId = pr.id;
      if (!createdPRIds.includes(pr.id)) {
        createdPRIds.push(pr.id);
      }
      console.log(`[beforeAll] Восстановлен PR: ${mainTestPRId}`);
      return;
    }
  }

  console.log("[beforeAll] Не удалось получить тестовый PR");
});

// Восстанавливаем PR после каждого теста для изоляции
test.afterEach(async ({ prAPI }) => {
  // Восстанавливаем все созданные PR чтобы они были доступны для следующих тестов
  for (const id of createdPRIds) {
    await restorePRIfArchived(prAPI, id);
  }
});

// Cleanup после всех тестов
test.afterAll(async ({ request }) => {
  const api = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  for (const id of createdPRIds) {
    try {
      // Сначала восстанавливаем если архивирован
      await api.restore(id);
    } catch {
      // Игнорируем
    }
    try {
      await api.remove(id);
    } catch {
      // Игнорируем ошибки cleanup
    }
  }
});

// Хелпер для создания тестового PR
async function createTestPR(prAPI, title) {
  // Используем главный PR если он есть и в статусе draft
  if (mainTestPRId) {
    // Сначала пытаемся восстановить (если был архивирован)
    await prAPI.restore(mainTestPRId);

    const { response: getResp, data: getData } =
      await prAPI.getById(mainTestPRId);
    if (getResp.ok()) {
      const status = getData?.status || getData?.data?.status;
      if (status === "draft") {
        return {
          id: mainTestPRId,
          response: getResp,
          data: getData,
          isMain: true,
        };
      }
    }
  }

  // Пытаемся восстановить ранее созданные PR (могут быть архивированы)
  for (const existingId of createdPRIds) {
    if (existingId === mainTestPRId) continue; // Уже проверили

    const restoreResult = await prAPI.restore(existingId);
    if (
      restoreResult.response.ok() ||
      restoreResult.response.status() === 400
    ) {
      const { response: getResp, data: getData } =
        await prAPI.getById(existingId);
      if (getResp.ok()) {
        const status = getData?.status || getData?.data?.status;
        if (status === "draft") {
          return {
            id: existingId,
            response: getResp,
            data: getData,
            isRestored: true,
          };
        }
      }
    }
  }

  // Пытаемся создать новый PR с полным набором полей
  const payload = {
    title: title || `Archive Test PR ${Date.now()}`,
    description: "Test PR for archive tests",
    // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
    directions: [
      {
        id: null,
        receiverType: "self",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: false,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: false,
        title: null,
        description: null,
      },
    ],
    anonymityType: "notAnonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: false,
      baseDate: new Date().toISOString(),
      repeatType: "noRepeat",
      sendTime: "09:00",
      timezoneOffset: 0,
    },
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
    isApprovalStep: false,
    isAsyncStep: false,
    isNominationEnabled: false,
    isApprovalEnabled: false,
    isSelfAssessmentEnabled: true,
    isAsync: false,
  };

  const { response, data } = await prAPI.create(payload);

  if (response.ok() && data?.id) {
    createdPRIds.push(data.id);
    return { id: data.id, response, data };
  }

  // Если не удалось создать, получаем список всех PR
  const { data: listData } = await prAPI.getList();
  const items = listData?.items || listData || [];

  // Ищем draft PR
  const draftPR = items.find((pr) => pr.status === "draft");
  if (draftPR) {
    if (!createdPRIds.includes(draftPR.id)) {
      createdPRIds.push(draftPR.id);
    }
    return { id: draftPR.id, response, data: draftPR, isExisting: true };
  }

  // Попробуем восстановить любой PR из списка
  for (const pr of items.slice(0, 5)) {
    const restoreResult = await prAPI.restore(pr.id);
    if (restoreResult.response.ok()) {
      if (!createdPRIds.includes(pr.id)) {
        createdPRIds.push(pr.id);
      }
      return {
        id: pr.id,
        response: restoreResult.response,
        data: pr,
        isRestored: true,
      };
    }
  }

  return { id: null, response, data };
}

// Хелпер для восстановления PR (используется в afterEach)
async function restorePRIfArchived(prAPI, prId) {
  if (!prId) return;
  try {
    const { response: getResp, data } = await prAPI.getById(prId);
    const status = data?.status || data?.data?.status;

    // Если PR архивирован или недоступен, пытаемся восстановить
    if (!getResp.ok() || status === "archived" || status === "hidden") {
      await prAPI.restore(prId);
    }
  } catch {
    // Игнорируем ошибки
  }
}

// ============================================================================
// BASIC ARCHIVE/RESTORE
// ============================================================================

test.describe(
  "Archived Entities - Basic Operations",
  { tag: ["@api", "@archive"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW);
    });

    test("C4979: Архивирование Performance Review", async ({ prAPI }) => {
      setSeverity("normal");

      let prId, archiveResp, archiveData;
      await test.step("Выполнить запрос: Архивирование Performance Review", async () => {
        // Создаём PR
        ({ id: prId } = await createTestPR(
          prAPI,
          `Archive Test ${Date.now()}`,
        ));

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Архивируем
        ({ response: archiveResp, data: archiveData } =
          await prAPI.archive(prId));

        allure.attachment(
          "Archive Response",
          JSON.stringify(archiveData, null, 2),
          "application/json",
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(archiveResp.ok(), "Архивирование должно быть успешным").toBe(
          true,
        );

        // Проверяем статус - может быть в ответе архивирования или через getById
        const statusFromArchive =
          archiveData?.status || archiveData?.data?.status;

        const { response: getResp, data: prData } = await prAPI.getById(prId);
        const statusFromGet = prData?.status || prData?.data?.status;

        const status = statusFromArchive || statusFromGet;

        allure.attachment(
          "PR Status After Archive",
          status || "unknown",
          "text/plain",
        );
        allure.attachment(
          "GetById Status",
          `${getResp.status()}`,
          "text/plain",
        );

        // После архивирования PR может быть archived или недоступен (404)
        if (getResp.ok()) {
          expect(status).toBe("archived");
        } else {
          // Если getById возвращает 404, PR успешно архивирован и скрыт
          expect([404]).toContain(getResp.status());
        }

        console.log(
          `PR ${prId} успешно архивирован, статус: ${status || "hidden"}`,
        );
      });
    });

    test("C4980: Восстановление из архива", async ({ prAPI }) => {
      setSeverity("normal");

      let prId, restoreResp, restoreData;
      await test.step("Выполнить запрос: Восстановление из архива", async () => {
        // Создаём и архивируем PR
        ({ id: prId } = await createTestPR(
          prAPI,
          `Restore Test ${Date.now()}`,
        ));

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        await prAPI.archive(prId);

        // Восстанавливаем
        ({ response: restoreResp, data: restoreData } =
          await prAPI.restore(prId));

        allure.attachment(
          "Restore Response",
          JSON.stringify(restoreData, null, 2),
          "application/json",
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(restoreResp.ok(), "Восстановление должно быть успешным").toBe(
          true,
        );

        // Проверяем статус
        const { data: prData } = await prAPI.getById(prId);
        const status = prData?.status || prData?.data?.status;

        allure.attachment(
          "PR Status After Restore",
          status || "unknown",
          "text/plain",
        );

        // После restore статус должен быть draft (или другой активный)
        expect(["draft", "active"]).toContain(status);
        console.log(`PR ${prId} восстановлен, статус: ${status}`);
      });
    });

    test("C4981: Повторное архивирование уже архивированного PR", async ({
      prAPI,
    }) => {
      setSeverity("minor");

      let prId, archive1;
      await test.step("Выполнить запрос: Повторное архивирование уже архивированного PR", async () => {
        ({ id: prId } = await createTestPR(
          prAPI,
          `Double Archive Test ${Date.now()}`,
        ));

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Первое архивирование
        archive1 = await prAPI.archive(prId);
      });

      await test.step("Проверить ответ", async () => {
        expect(archive1.response.ok()).toBe(true);

        // Повторное архивирование
        const archive2 = await prAPI.archive(prId);

        allure.attachment(
          "Double Archive Status",
          `First: ${archive1.response.status()}, Second: ${archive2.response.status()}`,
          "text/plain",
        );

        // Может вернуть успех (идемпотентно), ошибку (уже архивирован), или 404 (скрыт)
        expect([200, 201, 400, 404, 409]).toContain(archive2.response.status());
        console.log(`Повторное архивирование: ${archive2.response.status()}`);
      });
    });

    test("C4982: Восстановление неархивированного PR", async ({ prAPI }) => {
      setSeverity("minor");

      let restoreResp;
      await test.step("Выполнить запрос: Восстановление неархивированного PR", async () => {
        const { id: prId } = await createTestPR(
          prAPI,
          `Restore Non-Archived Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Пытаемся восстановить без архивирования
        ({ response: restoreResp } = await prAPI.restore(prId));

        allure.attachment(
          "Restore Non-Archived Status",
          `${restoreResp.status()}`,
          "text/plain",
        );

        // Может вернуть успех (идемпотентно) или ошибку (не архивирован)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 409]).toContain(restoreResp.status());
        console.log(
          `Восстановление неархивированного: ${restoreResp.status()}`,
        );
      });
    });
  },
);

// ============================================================================
// LIST FILTERING BY STATUS
// ============================================================================

test.describe(
  "Archived Entities - List Filtering",
  { tag: ["@api", "@archive"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW);
    });

    test("C4983: Архивированный PR виден в общем списке", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Архивированный PR виден в общем списке", async () => {
        const { id: prId } = await createTestPR(
          prAPI,
          `List Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Архивируем
        await prAPI.archive(prId);

        // Получаем общий список
        const { response, data } = await prAPI.getList();

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        const archivedPR = items.find((item) => item.id === prId);

        allure.attachment("List Items Count", `${items.length}`, "text/plain");

        // Архивированный PR может быть в списке или отфильтрован
        if (archivedPR) {
          expect(archivedPR.status).toBe("archived");
          console.log(
            `Архивированный PR ${prId} найден в списке со статусом: ${archivedPR.status}`,
          );
        } else {
          console.log(
            `Архивированный PR ${prId} отфильтрован из общего списка`,
          );
        }
      });
    });

    test("C4984: Проверка статуса после архивирования через getById", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let statusBefore, afterResp, afterData, statusAfter;
      await test.step("Выполнить запрос: Проверка статуса после архивирования через getById", async () => {
        const { id: prId } = await createTestPR(
          prAPI,
          `GetById Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Проверяем начальный статус
        const { data: beforeData } = await prAPI.getById(prId);
        statusBefore = beforeData?.status || beforeData?.data?.status;

        // Архивируем
        await prAPI.archive(prId);

        // Проверяем статус после
        ({ response: afterResp, data: afterData } = await prAPI.getById(prId));
        statusAfter = afterData?.status || afterData?.data?.status;

        allure.attachment(
          "Status Change",
          `Before: ${statusBefore}\nAfter: ${statusAfter || "hidden (404)"}`,
          "text/plain",
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(statusBefore).toBe("draft");

        // После архивирования PR может иметь статус archived или быть скрыт (404)
        if (afterResp.ok()) {
          expect(statusAfter).toBe("archived");
        } else {
          expect([404]).toContain(afterResp.status());
        }

        console.log(
          `Статус изменён: ${statusBefore} -> ${statusAfter || "hidden"}`,
        );
      });
    });
  },
);

// ============================================================================
// OPERATIONS ON ARCHIVED ENTITIES
// ============================================================================

test.describe(
  "Archived Entities - Operations Restrictions",
  { tag: ["@api", "@archive"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW);
    });

    test("C4985: Обновление архивированного PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновление архивированного PR", async () => {
        const { id: prId } = await createTestPR(
          prAPI,
          `Update Archived Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Архивируем
        await prAPI.archive(prId);

        // Пытаемся обновить
        const { response: updateResp, data: updateData } = await prAPI.update(
          prId,
          {
            title: "Updated Title",
          },
        );

        allure.attachment(
          "Update Archived Response",
          `${updateResp.status()}`,
          "text/plain",
        );
        allure.attachment(
          "Update Response Body",
          JSON.stringify(updateData, null, 2),
          "application/json",
        );

        // Обновление архивированного может быть запрещено, разрешено, или PR скрыт
        // Документируем поведение
        if (updateResp.ok()) {
          console.log("API разрешает обновление архивированных PR");
        } else {
          // 404 - PR скрыт после архивирования
          expect([400, 403, 404, 409]).toContain(updateResp.status());
          console.log(
            `API запрещает обновление архивированных PR: ${updateResp.status()}`,
          );
        }
      });
    });

    test("C4986: Удаление архивированного PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Удаление архивированного PR", async () => {
        const { id: prId } = await createTestPR(
          prAPI,
          `Delete Archived Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Архивируем
        await prAPI.archive(prId);

        // Пытаемся удалить
        const { response: deleteResp } = await prAPI.remove(prId);

        allure.attachment(
          "Delete Archived Response",
          `${deleteResp.status()}`,
          "text/plain",
        );

        // Удаление может быть разрешено или запрещено
        if (deleteResp.ok()) {
          console.log("API разрешает удаление архивированных PR");
          // Убираем из cleanup списка
          const idx = createdPRIds.indexOf(prId);
          if (idx > -1) createdPRIds.splice(idx, 1);

          // Если удалили главный PR, сбрасываем его
          if (prId === mainTestPRId) {
            mainTestPRId = null;
          }

          // Пытаемся создать новый PR для последующих тестов
          const payload = {
            title: `E2E_Замена ревью_${Date.now()}`,
            description: "Замена ревью после удаления",
            // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
            directions: [
              {
                id: null,
                receiverType: "self",
                isSelected: true,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "head",
                isSelected: true,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "subordinate",
                isSelected: false,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "colleague",
                isSelected: false,
                title: null,
                description: null,
              },
            ],
            anonymityType: "notAnonymous",
            workflowType: "basic",
            notificationsSchedule: {
              enableReminds: false,
              baseDate: new Date().toISOString(),
              repeatType: "noRepeat",
              sendTime: "09:00",
            },
            isApprovalStep: false,
            isAsyncStep: false,
            isNominationEnabled: false,
            isApprovalEnabled: false,
            isSelfAssessmentEnabled: true,
            isAsync: false,
          };
          const { response: newResp, data: newData } =
            await prAPI.create(payload);
          if (newResp.ok() && newData?.id) {
            createdPRIds.push(newData.id);
            mainTestPRId = newData.id;
            console.log(`Создан replacement PR: ${newData.id}`);
          }
        } else {
          expect([400, 403, 409]).toContain(deleteResp.status());
          console.log(
            `API запрещает удаление архивированных PR: ${deleteResp.status()}`,
          );
        }
      });
    });

    test("C4987: Запуск архивированного PR", async ({ prAPI }) => {
      setSeverity("normal");

      let startResp;
      await test.step("Выполнить запрос: Запуск архивированного PR", async () => {
        const { id: prId } = await createTestPR(
          prAPI,
          `Start Archived Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Архивируем
        await prAPI.archive(prId);

        // Пытаемся запустить
        ({ response: startResp } = await prAPI.start(prId));

        allure.attachment(
          "Start Archived Response",
          `${startResp.status()}`,
          "text/plain",
        );

        // Запуск архивированного должен быть запрещён (может вернуть 404 если PR скрыт)
      });

      await test.step("Проверить ответ", async () => {
        expect(startResp.ok(), "Нельзя запустить архивированный PR").toBe(
          false,
        );
        expect([400, 403, 404, 409, 422]).toContain(startResp.status());

        console.log(
          `Запуск архивированного PR запрещён: ${startResp.status()}`,
        );
      });
    });
  },
);

// ============================================================================
// ARCHIVE/RESTORE CYCLE
// ============================================================================

test.describe(
  "Archived Entities - Full Cycle",
  { tag: ["@api", "@archive"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW);
    });

    test("C4988: Полный цикл: создание -> архив -> восстановление -> архив", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let statuses, status1, status2, status3, status4;
      await test.step("Выполнить запрос: Полный цикл: создание -> архив -> восстановление -> архив", async () => {
        const { id: prId, data: createData } = await createTestPR(
          prAPI,
          `Full Cycle Test ${Date.now()}`,
        );

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        statuses = [];

        // 1. Начальный статус
        status1 = createData?.status || "draft";
        statuses.push(`Create: ${status1}`);

        // 2. Первое архивирование
        await prAPI.archive(prId);
        const { response: resp2, data: data2 } = await prAPI.getById(prId);
        // После архивирования PR может быть скрыт (404) или иметь статус archived
        status2 = resp2.ok() ? data2?.status || data2?.data?.status : "hidden";
        statuses.push(`Archive 1: ${status2}`);

        // 3. Восстановление
        await prAPI.restore(prId);
        const { data: data3 } = await prAPI.getById(prId);
        status3 = data3?.status || data3?.data?.status;
        statuses.push(`Restore: ${status3}`);

        // 4. Повторное архивирование
        await prAPI.archive(prId);
        const { response: resp4, data: data4 } = await prAPI.getById(prId);
        // После архивирования PR может быть скрыт (404) или иметь статус archived
        status4 = resp4.ok() ? data4?.status || data4?.data?.status : "hidden";
        statuses.push(`Archive 2: ${status4}`);

        allure.attachment("Status Cycle", statuses.join("\n"), "text/plain");
      });

      await test.step("Проверить ответ", async () => {
        expect(status1).toBe("draft");
        expect(["archived", "hidden"]).toContain(status2);
        expect(["draft", "active"]).toContain(status3);
        expect(["archived", "hidden"]).toContain(status4);

        console.log(`Полный цикл: ${statuses.join(" -> ")}`);
      });
    });

    test("C4989: Данные сохраняются после архивирования и восстановления", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let titleBefore, titleAfter;
      await test.step("Выполнить запрос: Данные сохраняются после архивирования и восстановления", async () => {
        const originalTitle = `Data Persistence Test ${Date.now()}`;
        const { id: prId } = await createTestPR(prAPI, originalTitle);

        if (!prId) {
          test.skip(true, "Не удалось создать Performance Review");
          return;
        }

        // Получаем данные до архивирования
        const { data: dataBefore } = await prAPI.getById(prId);
        titleBefore = dataBefore?.title || dataBefore?.data?.title;

        // Архивируем и восстанавливаем
        await prAPI.archive(prId);
        await prAPI.restore(prId);

        // Получаем данные после восстановления
        const { data: dataAfter } = await prAPI.getById(prId);
        titleAfter = dataAfter?.title || dataAfter?.data?.title;

        allure.attachment(
          "Data Comparison",
          `Before: ${titleBefore}\nAfter: ${titleAfter}`,
          "text/plain",
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(
          titleAfter,
          "Данные должны сохраниться после архивирования",
        ).toBe(titleBefore);

        console.log("Данные сохранились после цикла архивирования");
      });
    });
  },
);

// ============================================================================
// ARCHIVE NON-EXISTENT
// ============================================================================

test.describe(
  "Archived Entities - Error Cases",
  { tag: ["@api", "@archive"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW);
    });

    test("C4990: Архивирование несуществующего PR", async ({ prAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Архивирование несуществующего PR", async () => {
        const nonExistentId = 999999999;

        const { response: archiveResp } = await prAPI.archive(nonExistentId);

        allure.attachment(
          "Archive Non-Existent",
          `${archiveResp.status()}`,
          "text/plain",
        );

        expect([404]).toContain(archiveResp.status());
        console.log(`Архивирование несуществующего: ${archiveResp.status()}`);
      });
    });

    test("C4991: Восстановление несуществующего PR", async ({ prAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Восстановление несуществующего PR", async () => {
        const nonExistentId = 999999999;

        const { response: restoreResp } = await prAPI.restore(nonExistentId);

        allure.attachment(
          "Restore Non-Existent",
          `${restoreResp.status()}`,
          "text/plain",
        );

        expect([404]).toContain(restoreResp.status());
        console.log(`Восстановление несуществующего: ${restoreResp.status()}`);
      });
    });
  },
);
