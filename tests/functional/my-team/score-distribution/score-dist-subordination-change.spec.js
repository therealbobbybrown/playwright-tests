import { test, expect } from "../../../fixtures/full.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { OrgStructureAPI } from "../../../utils/api/OrgStructureAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe.serial(
  "Распределение оценок — изменение подчинения",
  { tag: ["@api", "@my-team", "@regression"] },
  () => {
    let managerUserId;
    let employeeUserId;
    let originalHeadUserId;
    const cleanup = {
      needed: false,
      employeeId: null,
      originalHeadId: null,
    };

    test.beforeAll(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test.afterAll(
      "Cleanup: восстановить исходное подчинение",
      async ({ request, db }) => {
        if (!cleanup.needed) {
          return;
        }

        const orgApi = new OrgStructureAPI(request);
        const { email, password } = getCredentials("admin");
        await orgApi.signIn(email, password);

        console.log(
          `Восстанавливаем подчинение: сотрудник ${cleanup.employeeId} → руководитель ${cleanup.originalHeadId}`,
        );
        await orgApi.addTreeUser(
          cleanup.employeeId,
          cleanup.originalHeadId,
          "move",
        );

        // Верификация через БД
        const [restored] = await db.query(
          `SELECT head_user_id FROM org_struct_users_heads WHERE user_id = ?`,
          [cleanup.employeeId],
        );
        expect(restored?.head_user_id).toBe(cleanup.originalHeadId);
        console.log("✓ Подчинение восстановлено");
      },
    );

    test(
      "C7217: Добавление сотрудника в подчинение руководителя — сотрудник появляется в распределении оценок",
      { tag: ["@api", "@critical"] },
      async ({ request, db }) => {
        setSeverity("critical");

        let baselineIds;

        await test.step("Получить базовое состояние подчинённых менеджера и найти сотрудника вне подчинения", async () => {
          // === 1. Получить базовое состояние: список подчинённых менеджера ===
          const managerApi = new DashboardTeamAPI(request);
          const { email: mgrEmail, password: mgrPassword } =
            getCredentials("manager");
          await managerApi.signIn(mgrEmail, mgrPassword);

          // Получаем userId и company_id менеджера через БД (accounts → users)
          const [managerAccount] = await db.query(
            `SELECT u.id, u.company_id
           FROM accounts a
           JOIN users u ON u.account_id = a.id
           WHERE a.email = ?`,
            [mgrEmail],
          );
          managerUserId = managerAccount.id;
          const companyId = managerAccount.company_id;
          expect(managerUserId).toBeGreaterThan(0);

          const { data: baseline } = await managerApi.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 500,
          });
          baselineIds = baseline.items.map((u) => u.id);
          console.log(
            `Менеджер ${managerUserId} имеет ${baselineIds.length} прямых подчинённых`,
          );
          expect(baselineIds.length).toBeGreaterThan(0);

          // === 2. Найти сотрудника НЕ в подчинении менеджера (в той же компании, с существующим руководителем) ===
          const [outsideEmployee] = await db.query(
            `
          SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) as full_name, h.head_user_id as current_head
          FROM users u
          INNER JOIN org_struct_users_heads h ON h.user_id = u.id
          WHERE u.id NOT IN (
            SELECT user_id FROM org_struct_users_heads WHERE head_user_id = ?
          )
          AND u.is_active = 1
          AND u.company_id = ?
          AND u.id != ?
          AND u.id != 1
          AND h.head_user_id IS NOT NULL
          AND h.head_user_id != u.id
          ORDER BY RAND()
          LIMIT 1
        `,
            [managerUserId, companyId, managerUserId],
          );

          if (!outsideEmployee) {
            throw new Error(
              "Не найден ни один сотрудник вне подчинения менеджера",
            );
          }

          employeeUserId = outsideEmployee.id;
          console.log(
            `Найден сотрудник вне подчинения: ${employeeUserId} (${outsideEmployee.full_name})`,
          );

          // Запоминаем оригинального руководителя для cleanup
          originalHeadUserId = outsideEmployee.current_head;
          if (!originalHeadUserId) {
            throw new Error(
              `Сотрудник ${employeeUserId} не имеет руководителя — невозможно провести тест`,
            );
          }
          console.log(`Оригинальный руководитель: ${originalHeadUserId}`);

          cleanup.needed = true;
          cleanup.employeeId = employeeUserId;
          cleanup.originalHeadId = originalHeadUserId;
        });

        await test.step("Добавить сотрудника в подчинение менеджера и проверить через БД", async () => {
          // === 3. Добавить сотрудника в подчинение менеджера (как админ) ===
          const adminApi = new OrgStructureAPI(request);
          const { email: admEmail, password: admPassword } =
            getCredentials("admin");
          await adminApi.signIn(admEmail, admPassword);

          const { response: addResponse, data: addData } =
            await adminApi.addTreeUser(employeeUserId, managerUserId, "move");
          if (![200, 201].includes(addResponse.status())) {
            console.log(
              `Ошибка API (${addResponse.status()}):`,
              JSON.stringify(addData),
            );
          }
          expect([200, 201]).toContain(addResponse.status());
          console.log(
            `Сотрудник ${employeeUserId} добавлен к менеджеру ${managerUserId}`,
          );

          // Верификация через БД
          const [newHead] = await db.query(
            `SELECT head_user_id FROM org_struct_users_heads WHERE user_id = ?`,
            [employeeUserId],
          );
          expect(newHead.head_user_id).toBe(managerUserId);
        });

        await test.step("Проверить, что сотрудник появился в распределении оценок менеджера", async () => {
          // === 4. Проверить, что сотрудник появился в распределении оценок ===
          const managerApi = new DashboardTeamAPI(request);
          const { email: mgrEmail, password: mgrPassword } =
            getCredentials("manager");
          await managerApi.signIn(mgrEmail, mgrPassword);
          const { data: afterAdd } = await managerApi.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 500,
          });
          const afterAddIds = afterAdd.items.map((u) => u.id);

          expect(afterAddIds).toContain(employeeUserId);
          expect(afterAddIds.length).toBe(baselineIds.length + 1);
          console.log(
            `✓ Сотрудник ${employeeUserId} появился в распределении оценок`,
          );
        });
      },
    );

    test(
      "C7218: Удаление сотрудника из подчинения руководителя — сотрудник исчезает из распределения оценок",
      { tag: ["@api", "@critical"] },
      async ({ request, db }) => {
        setSeverity("critical");

        // Проверяем, что cleanup-данные доступны
        if (!cleanup.needed) {
          throw new Error("Предыдущий тест не подготовил данные — пропускаем");
        }

        let beforeIds;

        await test.step("Убедиться, что сотрудник находится в подчинении менеджера", async () => {
          // === 1. Убедиться, что сотрудник в подчинении ===
          const managerApi = new DashboardTeamAPI(request);
          const { email: mgrEmail, password: mgrPassword } =
            getCredentials("manager");
          await managerApi.signIn(mgrEmail, mgrPassword);

          const { data: beforeRemove } = await managerApi.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 500,
          });
          beforeIds = beforeRemove.items.map((u) => u.id);
          expect(beforeIds).toContain(employeeUserId);
          console.log(`Сотрудник ${employeeUserId} в подчинении менеджера`);
        });

        await test.step("Переместить сотрудника обратно к оригинальному руководителю и верифицировать через БД", async () => {
          // === 2. Восстановить оригинального руководителя (как админ) ===
          const adminApi = new OrgStructureAPI(request);
          const { email: admEmail, password: admPassword } =
            getCredentials("admin");
          await adminApi.signIn(admEmail, admPassword);

          const { response: restoreResponse } = await adminApi.addTreeUser(
            employeeUserId,
            originalHeadUserId,
            "move",
          );
          expect([200, 201]).toContain(restoreResponse.status());
          console.log(
            `Сотрудник ${employeeUserId} перемещён обратно к ${originalHeadUserId}`,
          );

          // Верификация через БД
          const [verifyHead] = await db.query(
            `SELECT head_user_id FROM org_struct_users_heads WHERE user_id = ?`,
            [employeeUserId],
          );
          expect(verifyHead.head_user_id).toBe(originalHeadUserId);
        });

        await test.step("Проверить, что сотрудник исчез из распределения оценок менеджера", async () => {
          // === 3. Проверить, что сотрудник исчез из распределения оценок ===
          const managerApi = new DashboardTeamAPI(request);
          const { email: mgrEmail, password: mgrPassword } =
            getCredentials("manager");
          await managerApi.signIn(mgrEmail, mgrPassword);
          const { data: afterRemove } = await managerApi.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 500,
          });
          const afterIds = afterRemove.items.map((u) => u.id);

          expect(afterIds).not.toContain(employeeUserId);
          expect(afterIds.length).toBe(beforeIds.length - 1);
          console.log(
            `✓ Сотрудник ${employeeUserId} исчез из распределения оценок`,
          );

          // Cleanup уже выполнен в тесте
          cleanup.needed = false;
        });
      },
    );
  },
);
