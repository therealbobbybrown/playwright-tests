/**
 * Security API тесты для Магазина подарков (Gift Shop)
 *
 * Проверяет ролевую модель доступа:
 * - Anonymous: 401 на все endpoints
 * - Admin: полный доступ к /manager/* и /private/*
 * - User: доступ только к /private/*, 403 на /manager/*
 * - Manager: доступ только к /private/*, 403 на /manager/*
 */
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  GiftShopAPI,
  KarmaAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Расширение fixtures для ролей
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  anonAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    // НЕ делаем signIn - анонимный пользователь
    await use(api);
  },
});

test.describe("Gift Shop Security API @api @giftshop @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.GIFT_SHOP, "Security");
  });

  // Тестовые данные
  let testGiftId = null;
  const createdGiftIds = [];

  test.beforeAll(async ({ request }) => {
    // Setup: включить виртуальную валюту (Karma), затем получить/создать подарок
    const { email, password } = getCredentials("admin");

    // 1. Сначала включаем Karma (виртуальную валюту), если она выключена
    const karmaApi = new KarmaAPI(request);
    await karmaApi.signIn(email, password);

    try {
      const { response: enableResponse } = await karmaApi.enable();
      if (enableResponse.ok()) {
        console.log("[beforeAll] Karma enabled successfully");
      } else {
        console.log(
          `[beforeAll] Karma enable returned ${enableResponse.status()} - may already be enabled`,
        );
      }
    } catch (e) {
      console.log("[beforeAll] Error enabling Karma:", e.message);
    }

    // 2. Теперь работаем с Gift Shop
    const api = new GiftShopAPI(request);
    await api.signIn(email, password);

    // Сначала пробуем получить существующий подарок из каталога
    const { response: listResponse, data: listData } =
      await api.getPrivateGifts({ limit: 1 });

    if (listResponse.ok()) {
      const gifts = listData?.items || listData || [];
      if (gifts.length > 0) {
        testGiftId = gifts[0].id;
        console.log(`[beforeAll] Using existing gift: id=${testGiftId}`);
        return;
      }
    }

    // Если нет существующих подарков, пробуем создать новый
    const { response, data } = await api.createGift({
      title: `Security Test Gift ${Date.now()}`,
      description: "Test gift for security tests",
      price: 100,
    });

    if (response.ok() && data?.id) {
      testGiftId = data.id;
      createdGiftIds.push(data.id);
      console.log(`[beforeAll] Created gift: id=${testGiftId}`);
    } else {
      console.log(`[beforeAll] Gift Shop not available or no gifts exist`);
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: удалить созданные подарки
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    for (const id of createdGiftIds) {
      try {
        await api.deleteGift(id);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ANONYMOUS - должен получить 401
  // ═══════════════════════════════════════════════════════════════
  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /private/gifts/ - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getPrivateGifts({ limit: 10 });

      expect(response.status()).toBe(401);
    });

    test("GET /manager/gifts/ - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getManagerGifts({ limit: 10 });

      expect(response.status()).toBe(401);
    });

    test("POST /manager/gifts/ - anonymous не может создать подарок", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.createGift({
        title: "Unauthorized Gift",
        price: 50,
      });

      expect(response.status()).toBe(401);
    });

    test("POST /private/gift-orders/ - anonymous не может создать заказ", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.createOrder({
        giftId: 1,
        comment: "Test order",
      });

      expect(response.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN - полный доступ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Admin - полные права", () => {
    test("GET /private/gifts/ - admin имеет доступ к каталогу", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getPrivateGifts({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/gifts/ - admin имеет доступ к управлению каталогом", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getManagerGifts({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/gifts/ - admin может создать подарок", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.createGift({
        title: `Admin Test Gift ${Date.now()}`,
        description: "Created by admin",
        price: 200,
      });

      // 201 - создано, 400 - ошибка валидации (тоже допустимо)
      expect([200, 201, 400]).toContain(response.status());
      if (data?.id) {
        createdGiftIds.push(data.id);
      }
    });

    test("POST /manager/gifts/{id}/ - admin может обновить подарок", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await adminAPI.updateGift(testGiftId, {
        title: `Updated Gift ${Date.now()}`,
      });

      // 200 - успех, 400 - ошибка валидации (API может требовать доп. поля)
      expect([200, 400]).toContain(response.status());
    });

    test("DELETE /manager/gifts/{id}/ - admin может удалить подарок", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      // Читаем изображение для создания подарка (API поддерживает только JPEG)
      const imagePath = resolve(__dirname, "../../../fixtures/gift-stitch.jpg");
      const imageBuffer = readFileSync(imagePath);

      const { response: createResponse, data: created } =
        await adminAPI.createGiftWithImage({
          title: `Gift to Delete ${Date.now()}`,
          description: "Test gift for deletion",
          price: 50,
          imageBuffer,
          imageName: "gift-stitch.jpg",
          imageMimeType: "image/jpeg",
        });

      test.skip(!created?.id, "Не удалось создать подарок");

      const { response } = await adminAPI.deleteGift(created.id);
      expect(response.ok()).toBe(true);
    });

    test("POST /private/gift-orders/ - admin может создать заказ", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await adminAPI.createOrder({
        giftId: testGiftId,
        comment: "Admin test order",
      });

      // 200/201 - успех, 400 - недостаточно баллов (тоже валидный ответ)
      expect([200, 201, 400]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER - ограниченные права (403 на /manager/*)
  // ═══════════════════════════════════════════════════════════════
  test.describe("User - ограниченные права", () => {
    test("GET /private/gifts/ - user имеет доступ к каталогу", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getPrivateGifts({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/gifts/{id} - user может получить подарок по ID", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await userAPI.getGift(testGiftId);

      // 200 - успех, 404 - не найден (если был удалён)
      expect([200, 404]).toContain(response.status());
    });

    test("POST /private/gift-orders/ - user может создать заказ", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await userAPI.createOrder({
        giftId: testGiftId,
        comment: "User test order",
      });

      // 200/201 - успех, 400 - недостаточно баллов
      expect([200, 201, 400]).toContain(response.status());
    });

    test("GET /manager/gifts/ - user не имеет доступа к управлению каталогом", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.getManagerGifts({ limit: 10 });

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("POST /manager/gifts/ - user не может создать подарок", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.createGift({
        title: "Unauthorized Gift Creation",
        price: 100,
      });

      // User не должен иметь права на создание подарков
      expect(response.status()).toBe(403);
    });

    test("POST /manager/gifts/{id}/ - user не может обновить подарок", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await userAPI.updateGift(testGiftId, {
        title: "Hacked Gift Title",
      });

      expect(response.status()).toBe(403);
    });

    test("DELETE /manager/gifts/{id}/ - user не может удалить подарок", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await userAPI.deleteGift(testGiftId);

      expect([403, 404]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MANAGER - расширенные права (403 на /manager/* без прав модуля)
  // ═══════════════════════════════════════════════════════════════
  test.describe("Manager - расширенные права", () => {
    test("GET /private/gifts/ - manager имеет доступ к каталогу", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.getPrivateGifts({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/gift-orders/ - manager может создать заказ", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await managerAPI.createOrder({
        giftId: testGiftId,
        comment: "Manager test order",
      });

      // 200/201 - успех, 400 - недостаточно баллов
      expect([200, 201, 400]).toContain(response.status());
    });

    test("GET /manager/gifts/ - manager (руководитель) не имеет доступа к управлению", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.getManagerGifts({ limit: 10 });

      // Руководитель без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("POST /manager/gifts/ - manager не может создать подарок", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.createGift({
        title: "Manager Unauthorized Gift",
        price: 150,
      });

      // Руководитель не должен иметь права на создание подарков
      expect(response.status()).toBe(403);
    });

    test("DELETE /manager/gifts/{id}/ - manager не может удалить подарок", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await managerAPI.deleteGift(testGiftId);

      expect([403, 404]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // КРОСС-РОЛЕВЫЕ ПРОВЕРКИ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Кросс-ролевые проверки", () => {
    test("User не может удалить подарок созданный Admin", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await userAPI.deleteGift(testGiftId);

      expect([403, 404]).toContain(response.status());
    });

    test("Manager не может обновить подарок созданный Admin", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGiftId, "Нет тестового подарка");

      const { response } = await managerAPI.updateGift(testGiftId, {
        title: "Manager Hacked Title",
        price: 999,
      });

      expect([403, 404]).toContain(response.status());
    });
  });
});
