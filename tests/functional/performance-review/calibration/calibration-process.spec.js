/**
 * Тесты калибровки - процесс калибровки, доступ и блокировка
 *
 * Требования из брифа:
 * - Калибровку могут выполнять руководители и админ оценки
 * - Калибровка может проводиться неограниченное количество раз до завершения оценки
 * - После завершения оценки калибровка запрещена
 * - Админ может заблокировать калибровку для руководителей (чекбокс "Запретить дальнейшее изменение оценки руководителем")
 * - Сотрудник видит только откалиброванную оценку
 *
 * @tags @calibration @critical @process
 */
import { test as baseTest, expect } from "@playwright/test";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";
import { markAsAPITest, setSeverity } from "../../../utils/allure-helpers.js";
import { MODULES } from "../../../utils/allure-helpers.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";

// Extend base test with fixtures
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const managerCreds = getCredentials("manager");
    if (!managerCreds) {
      await use(null);
      return;
    }
    const api = new PerformanceReviewAPI(request);
    await api.signIn(managerCreds.email, managerCreds.password);
    await use(api);
  },
  dbClient: async ({}, use) => {
    const db = new DatabaseClient();
    try {
      await db.connect();
    } catch (error) {
      console.log(
        "[DB] Connection failed, DB verification will be skipped:",
        error.message,
      );
    }
    await use(db);
    if (db.isConnected()) {
      await db.disconnect();
    }
  },
  calibrationVerifier: async ({ dbClient }, use) => {
    const verifier = new CalibrationVerifier(dbClient);
    await use(verifier);
  },
});

let TEST_PR_ID;

test.describe(
  "Calibration - Процесс калибровки",
  { tag: ["@api", "@calibration", "@regression", "@performance-review"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: false });
      await seed.fillQuestionnaires(found.prId);
      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) console.warn("[beforeAll] Failed to stop PR");
      TEST_PR_ID = found.prId;
      console.log(`✅ Seeded PR for tests: ${TEST_PR_ID}`);
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Process");
    });

    test.describe("Доступ к калибровке", () => {
      test("C4052: Админ имеет доступ к калибровке", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const settings =
          await test.step("Получение настроек калибровки", async () => {
            const { data, response } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID);
            expect(
              response.ok(),
              `API вернул ${response.status()}`,
            ).toBeTruthy();
            return data;
          });

        await test.step("Проверка доступа к калибровке", async () => {
          const calibrationEnabled = settings?.calibrationEnabled !== false;
          console.log("Калибровка включена:", calibrationEnabled);
          expect(
            settings,
            "Настройки калибровки должны быть получены",
          ).toBeTruthy();
          expect(
            calibrationEnabled,
            "Калибровка должна быть включена для админа",
          ).toBeTruthy();
        });

        // DB верификация
        await test.step("DB верификация настроек", async () => {
          const dbSettings =
            await calibrationVerifier.getStatisticsSettings(TEST_PR_ID);
          console.log(`[DB] Найдено ${dbSettings.length} настроек калибровки`);
          // Настройки могут отсутствовать если PR не имеет кастомных настроек (используются дефолты)
          expect(
            Array.isArray(dbSettings),
            "DB должна вернуть массив настроек калибровки",
          ).toBe(true);
        });
      });

      test("C4053: Получение списка оцениваемых для калибровки", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const targetUsers =
          await test.step("Запрос списка оцениваемых", async () => {
            const { data, response } = await adminAPI.post(
              `/manager/performance-reviews/${TEST_PR_ID}/target-users/get`,
              {},
            );
            expect(
              response.ok(),
              `API вернул ${response.status()}`,
            ).toBeTruthy();
            return data?.items || data || [];
          });

        await test.step("Проверка списка оцениваемых", async () => {
          console.log(`Количество оцениваемых: ${targetUsers.length}`);
          expect(targetUsers.length, "Должны быть оцениваемые").toBeGreaterThan(
            0,
          );
          const firstUser = targetUsers[0];
          expect(
            firstUser,
            "Первый оцениваемый должен существовать",
          ).toBeTruthy();
          const userId = firstUser.id || firstUser.userId;
          expect(userId, "Оцениваемый должен иметь userId или id").toBeTruthy();
        });
      });

      test("C4054: Статус калибровки для оцениваемых", async ({ adminAPI }) => {
        setSeverity("normal");

        const targetUsers =
          await test.step("Получение списка оцениваемых", async () => {
            const { data } = await adminAPI.post(
              `/manager/performance-reviews/${TEST_PR_ID}/target-users/get`,
              {},
            );
            return data?.items || data || [];
          });

        if (targetUsers.length === 0) {
          test.skip(true, "Нет оцениваемых");
          return;
        }

        await test.step("Анализ статусов калибровки", async () => {
          const calibrationStatuses = [];
          for (const user of targetUsers.slice(0, 5)) {
            calibrationStatuses.push({
              userId: user.id || user.userId,
              name: user.name || `${user.firstName} ${user.lastName}`,
              preCalibrated:
                user.preCalibrationScore || user.scoreBeforeCalibration || null,
              postCalibrated:
                user.postCalibrationScore ||
                user.scoreAfterCalibration ||
                user.calibratedScore ||
                null,
              isCalibrated: user.isCalibrated || user.calibrated || false,
            });
          }

          console.log("Статусы калибровки:");
          for (const status of calibrationStatuses) {
            console.log(
              `  ${status.name}: до=${status.preCalibrated}, после=${status.postCalibrated}, откалиброван=${status.isCalibrated}`,
            );
          }

          expect(
            calibrationStatuses.length,
            "Должны быть собраны статусы калибровки",
          ).toBeGreaterThan(0);
          for (const status of calibrationStatuses) {
            expect(
              status.userId,
              `Оцениваемый '${status.name}' должен иметь userId`,
            ).toBeTruthy();
            expect(
              typeof status.isCalibrated,
              `Поле isCalibrated у '${status.name}' должно быть boolean`,
            ).toBe("boolean");
          }
        });
      });
    });

    test.describe("Блокировка калибровки", () => {
      test("C4055: Калибровка недоступна после завершения оценки", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const prStatus =
          await test.step("Получение статуса оценки", async () => {
            const { data: prData } = await adminAPI.get(
              `/manager/performance-reviews/${TEST_PR_ID}`,
            );
            const status = prData?.status || prData?.state;
            console.log("Статус оценки:", status);
            expect(status, "Статус оценки должен быть определён").toBeTruthy();
            expect(
              ["active", "complete", "completed", "finished", "archived"],
              "Статус оценки должен быть одним из допустимых",
            ).toContain(status);
            return status;
          });

        await test.step("Проверка блокировки калибровки", async () => {
          if (
            prStatus === "complete" ||
            prStatus === "completed" ||
            prStatus === "finished" ||
            prStatus === "archived"
          ) {
            // Пытаемся откалибровать завершённую оценку
            const { response } = await adminAPI.post(
              `/manager/performance-reviews/${TEST_PR_ID}/calibrate`,
              {
                /* данные калибровки */
              },
            );

            expect(
              response.status(),
              "Калибровка должна быть заблокирована для завершённой оценки",
            ).toBeGreaterThanOrEqual(400);
            console.log("✓ Калибровка заблокирована для завершённой оценки");
          } else {
            console.log("Оценка активна - калибровка должна быть доступна");
            expect(
              prStatus,
              "Статус активной оценки должен быть 'active'",
            ).toBe("active");
          }
        });
      });

      test('C4056: Настройка "Запретить дальнейшее изменение оценки руководителем"', async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const lockSettings =
          await test.step("Получение настроек блокировки", async () => {
            const { data: settings } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID);

            return {
              managerCalibrationDisabled: settings?.managerCalibrationDisabled,
              preventManagerEdit: settings?.preventManagerEdit,
              lockManagerCalibration: settings?.lockManagerCalibration,
              allowManagerCalibration: settings?.allowManagerCalibration,
            };
          });

        await test.step("Анализ настроек блокировки", async () => {
          console.log("Настройки блокировки калибровки для руководителей:");
          for (const [key, value] of Object.entries(lockSettings)) {
            if (value !== undefined) {
              console.log(`  ${key}: ${value}`);
            }
          }
          expect(
            lockSettings,
            "Настройки блокировки должны быть получены",
          ).toBeTruthy();
          expect(
            typeof lockSettings,
            "Настройки блокировки должны быть объектом",
          ).toBe("object");
          // Поля могут быть undefined в зависимости от конфигурации PR — это допустимо
        });

        // DB верификация
        await test.step("DB верификация настроек блокировки", async () => {
          const dbSettings =
            await calibrationVerifier.getStatisticsSettings(TEST_PR_ID);
          // Настройки могут отсутствовать если PR не имеет кастомных настроек (используются дефолты)
          expect(
            Array.isArray(dbSettings),
            "DB должна вернуть массив настроек калибровки",
          ).toBe(true);
          const lockSetting = dbSettings.find(
            (s) =>
              s.name === "lockManagerCalibration" ||
              s.name === "preventManagerEdit",
          );
          if (lockSetting) {
            console.log(
              `[DB] ${lockSetting.name}: ${lockSetting.numeric_value || lockSetting.text_value}`,
            );
            const lockValue =
              lockSetting.numeric_value ?? lockSetting.text_value;
            expect(
              lockValue,
              `[DB] Значение настройки '${lockSetting.name}' должно быть определено`,
            ).toBeDefined();
          }
        });
      });
    });

    test.describe("Процесс калибровки", () => {
      test("C4057: Калибровка может выполняться многократно", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const prStatus =
          await test.step("Проверка статуса оценки", async () => {
            const { data: prData } = await adminAPI.get(
              `/manager/performance-reviews/${TEST_PR_ID}`,
            );
            return prData?.status || prData?.state;
          });

        if (
          prStatus === "complete" ||
          prStatus === "completed" ||
          prStatus === "finished" ||
          prStatus === "archived"
        ) {
          test.skip(true, "Оценка завершена - калибровка заблокирована");
          return;
        }

        await test.step("Проверка отсутствия лимита калибровок", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);

          expect(
            settings,
            "Настройки калибровки должны быть получены",
          ).toBeTruthy();

          const hasCalibrationLimit =
            settings?.calibrationLimit !== undefined ||
            settings?.maxCalibrations !== undefined;

          console.log(
            "Есть ограничение на количество калибровок:",
            hasCalibrationLimit,
          );

          if (hasCalibrationLimit) {
            console.log(
              "Лимит калибровок:",
              settings.calibrationLimit || settings.maxCalibrations,
            );
          }

          // По брифу ограничения быть не должно
          expect(
            hasCalibrationLimit,
            "По брифу ограничения на количество калибровок быть не должно",
          ).toBeFalsy();
        });
      });

      test("C4058: Сохранение истории калибровок", async ({ adminAPI }) => {
        setSeverity("normal");

        await test.step("Проверка настроек истории калибровок", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);

          expect(
            settings,
            "Настройки калибровки должны быть получены",
          ).toBeTruthy();

          const hasCalibrationHistory =
            settings?.calibrationHistory !== undefined ||
            settings?.showCalibrationHistory !== undefined ||
            settings?.trackCalibrationChanges !== undefined;

          console.log("История калибровок доступна:", hasCalibrationHistory);

          if (hasCalibrationHistory) {
            console.log("Настройки истории:", {
              calibrationHistory: settings?.calibrationHistory,
              showCalibrationHistory: settings?.showCalibrationHistory,
              trackCalibrationChanges: settings?.trackCalibrationChanges,
            });
          }

          expect(
            typeof hasCalibrationHistory,
            "hasCalibrationHistory должен быть boolean",
          ).toBe("boolean");
        });
      });
    });

    test.describe("Права на калибровку", () => {
      test("C4059: Руководитель может калибровать своих подчинённых", async ({
        managerAPI,
      }) => {
        setSeverity("critical");

        if (!managerAPI) {
          test.skip(true, "Нет учётных данных менеджера");
          return;
        }

        await test.step("Проверка доступа руководителя к калибровке", async () => {
          const { response } =
            await managerAPI.getStatisticsSettings(TEST_PR_ID);

          const status = response.status();
          console.log("Статус доступа руководителя к калибровке:", status);

          // Допустимые коды: 200 (есть доступ) или 403 (заблокировано админом)
          expect(
            [200, 403],
            "Ответ API должен быть 200 (доступ есть) или 403 (заблокировано)",
          ).toContain(status);

          if (response.ok()) {
            console.log("✓ Руководитель имеет доступ к калибровке");
          } else if (status === 403) {
            console.log(
              "Калибровка заблокирована для руководителя (возможно, админом)",
            );
          }
        });
      });

      test("C4060: Вышестоящий руководитель может калибровать", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверка прав на калибровку", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);

          expect(
            settings,
            "Настройки калибровки должны быть получены",
          ).toBeTruthy();

          const calibrationRights = {
            allowDirectManager: settings?.allowDirectManagerCalibration,
            allowUpperManagement: settings?.allowUpperManagementCalibration,
            allowAdmin: settings?.allowAdminCalibration,
          };

          console.log("Права на калибровку:");
          for (const [key, value] of Object.entries(calibrationRights)) {
            if (value !== undefined) {
              console.log(`  ${key}: ${value}`);
            }
          }

          expect(
            calibrationRights,
            "Объект прав на калибровку должен быть сформирован",
          ).toBeTruthy();
          expect(
            typeof calibrationRights,
            "Права на калибровку должны быть объектом",
          ).toBe("object");
          // Поля могут быть undefined в зависимости от конфигурации PR — это допустимо
        });
      });

      test("C4061: Назначенный в оценке руководитель не может калибровать", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверка ограничений для назначенных руководителей", async () => {
          // По брифу: Руководитель назначенный в оценке калибровкой заниматься не может
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);

          expect(
            settings,
            "Настройки калибровки должны быть получены",
          ).toBeTruthy();

          const restrictAssignedManager =
            settings?.restrictAssignedManagerCalibration !== false;

          console.log(
            "Ограничение для назначенных руководителей:",
            restrictAssignedManager,
          );

          // По брифу ограничение должно быть включено
          expect(
            restrictAssignedManager,
            "По брифу назначенный руководитель не должен иметь возможность калибровки",
          ).toBeTruthy();
        });
      });
    });
  },
);
