// tests/utils/api/GiftShopAPI.js
// API клиент для работы с магазином подарков (Gift Shop)

import { createHash } from "crypto";
import { APIClient } from "./APIClient.js";

/**
 * Генерация fingerPrint как MD5 хеш
 * @returns {string}
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * API клиент для работы с Gift Shop
 * Endpoints: /manager/gifts/*, /private/gifts/*, /private/gift-orders/*
 */
export class GiftShopAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    this.fingerPrint = generateFingerPrint();
  }

  /**
   * Авторизация пользователя
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async signIn(email, password) {
    const { data } = await this.post(
      "/auth/account/signin",
      {
        email,
        password,
        fingerPrint: this.fingerPrint,
        permissions: [],
      },
      { timeout: 60_000 },
    );
    if (data?.accessToken) {
      this.setToken(data.accessToken);
    }
    return data;
  }

  // ==================== GIFTS (Manager) ====================

  /**
   * Получить список подарков (manager)
   * GET /manager/gifts/
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.q] - Поисковый запрос
   * @param {string} [params.orderBy] - Сортировка
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getManagerGifts(params = {}) {
    return this.get("/manager/gifts/", params);
  }

  /**
   * Создать подарок
   * POST /manager/gifts/
   * @param {Object} data - Данные подарка
   * @param {string} data.title - Название
   * @param {string} [data.description] - Описание
   * @param {number} data.price - Цена
   * @param {string} [data.coverMediaType] - Тип обложки
   * @param {string} [data.coverMedia] - Медиа обложки
   * @param {Object} [data.coverSettings] - Настройки обложки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createGift({
    title,
    description,
    price,
    coverMediaType,
    coverMedia,
    coverSettings,
  } = {}) {
    return this.post("/manager/gifts/", {
      title,
      description,
      price,
      coverMediaType,
      coverMedia,
      coverSettings,
    });
  }

  /**
   * Загрузить обложку для подарка
   * POST /manager/gifts/upload/cover
   * @param {Buffer} imageBuffer - Buffer изображения
   * @param {string} [imageName] - Имя файла изображения
   * @param {string} [imageMimeType] - MIME тип изображения
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async uploadCover(
    imageBuffer,
    imageName = "cover.png",
    imageMimeType = "image/png",
  ) {
    return this.postMultipart("/manager/gifts/upload/cover", {
      file: {
        name: imageName,
        mimeType: imageMimeType,
        buffer: imageBuffer,
      },
    });
  }

  /**
   * Создать подарок с загрузкой изображения (двухшаговый процесс)
   * 1. Загрузка обложки POST /manager/gifts/upload/cover
   * 2. Создание подарка POST /manager/gifts/
   * @param {Object} data - Данные подарка
   * @param {string} data.title - Название
   * @param {string} [data.description] - Описание
   * @param {number} data.price - Цена
   * @param {Buffer} data.imageBuffer - Buffer изображения
   * @param {string} [data.imageName] - Имя файла изображения
   * @param {string} [data.imageMimeType] - MIME тип изображения
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createGiftWithImage({
    title,
    description,
    price,
    imageBuffer,
    imageName = "cover.png",
    imageMimeType = "image/png",
  } = {}) {
    // Шаг 1: Загрузить обложку
    const { response: uploadResponse, data: uploadData } =
      await this.uploadCover(imageBuffer, imageName, imageMimeType);

    if (!uploadResponse.ok()) {
      return { response: uploadResponse, data: uploadData };
    }

    // coverMedia должен быть объектом (uploadData целиком)
    const coverMedia = uploadData;

    // Шаг 2: Создать подарок со ссылкой на загруженную обложку
    return this.post("/manager/gifts/", {
      title,
      description: description || "",
      price: String(price), // API ожидает строку для currency
      coverMediaType: "upload",
      coverMedia,
    });
  }

  /**
   * Обновить подарок
   * POST /manager/gifts/{giftId}/
   * @param {number} giftId - ID подарка
   * @param {Object} data - Данные для обновления
   * @param {string} [data.title] - Название
   * @param {string} [data.description] - Описание
   * @param {number} [data.price] - Цена
   * @param {string} [data.coverMediaType] - Тип обложки
   * @param {string} [data.coverMedia] - Медиа обложки
   * @param {Object} [data.coverSettings] - Настройки обложки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateGift(
    giftId,
    {
      title,
      description,
      price,
      coverMediaType,
      coverMedia,
      coverSettings,
    } = {},
  ) {
    return this.post(`/manager/gifts/${giftId}/`, {
      title,
      description,
      price,
      coverMediaType,
      coverMedia,
      coverSettings,
    });
  }

  /**
   * Удалить подарок
   * DELETE /manager/gifts/{giftId}/
   * @param {number} giftId - ID подарка
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteGift(giftId) {
    return this.delete(`/manager/gifts/${giftId}/`);
  }

  // ==================== GIFTS (Private) ====================

  /**
   * Получить список подарков (private)
   * GET /private/gifts/
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.q] - Поисковый запрос
   * @param {string} [params.orderBy] - Сортировка
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateGifts(params = {}) {
    return this.get("/private/gifts/", params);
  }

  /**
   * Получить подарок по ID
   * GET /private/gifts/{giftId}
   * @param {number} giftId - ID подарка
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getGift(giftId) {
    return this.get(`/private/gifts/${giftId}`);
  }

  // ==================== ORDERS ====================

  /**
   * Создать заказ подарка
   * POST /private/gift-orders/
   * @param {Object} data - Данные заказа
   * @param {number} data.giftId - ID подарка
   * @param {string} [data.comment] - Комментарий
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createOrder({ giftId, comment } = {}) {
    return this.post("/private/gift-orders/", {
      giftId,
      comment,
    });
  }
}
