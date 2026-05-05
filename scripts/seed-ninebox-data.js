/**
 * Скрипт для создания тестовых данных NineBox
 * Запуск: node scripts/seed-ninebox-data.js
 *
 * Этот скрипт настраивает NineBox в системе:
 * 1. Проверяет/создаёт шкалу компетенций
 * 2. Проверяет/создаёт компетенции для осей X и Y
 * 3. Настраивает и включает NineBox
 */

import { request } from "@playwright/test";
import { createHash } from "crypto";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL;
const API_BASE =
  process.env.API_BASE_URL || BASE_URL.replace("/ru/", "").replace(/\/$/, "");

// Креденшелы из .env
const ADMIN_EMAIL = process.env.ADMIN_LOGIN || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌ Необходимо установить ADMIN_LOGIN и ADMIN_PASSWORD в .env");
  process.exit(1);
}

function generateFingerPrint() {
  return createHash("md5").update(Date.now().toString()).digest("hex");
}

async function seedNineBoxData() {
  console.log("🔧 Настройка NineBox...\n");
  console.log(`   API: ${API_BASE}`);

  const context = await request.newContext({
    baseURL: API_BASE,
  });

  let token = null;

  try {
    // Авторизация
    console.log("📝 Авторизация...");
    const authResponse = await context.post("/auth/account/signin", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        fingerPrint: generateFingerPrint(),
        permissions: [],
      },
    });

    if (!authResponse.ok()) {
      const error = await authResponse.text();
      throw new Error(
        `Ошибка авторизации: ${authResponse.status()} - ${error}`,
      );
    }

    const authData = await authResponse.json();
    token = authData.accessToken;
    console.log("   ✅ Авторизация успешна");

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // Проверяем текущие настройки NineBox
    console.log("🔍 Проверка текущих настроек NineBox...");
    const settingsResponse = await context.get("/manager/ninebox-settings", {
      headers,
    });

    if (settingsResponse.ok()) {
      const settings = await settingsResponse.json();
      if (settings && settings.isEnabled) {
        console.log("✅ NineBox уже настроен и включён");
        console.log(`   ID: ${settings.id}`);
        console.log(
          `   X компетенции: ${JSON.stringify(settings.xCompetenciesIds)}`,
        );
        console.log(
          `   Y компетенции: ${JSON.stringify(settings.yCompetenciesIds)}`,
        );
        return;
      }
    }

    // Получаем компетенции
    console.log("📋 Получение списка компетенций...");
    const compResponse = await context.get("/manager/competencies", {
      headers,
    });

    if (!compResponse.ok()) {
      throw new Error("Не удалось получить список компетенций");
    }

    const compData = await compResponse.json();
    let competencies = Array.isArray(compData)
      ? compData
      : compData.items || [];
    console.log(`   Найдено компетенций: ${competencies.length}`);

    if (competencies.length < 2) {
      console.log("⚠️  Недостаточно компетенций. Создаём новые...");

      // Проверяем/создаём шкалу
      const scalesResponse = await context.get("/manager/competence-scales", {
        headers,
      });
      const scalesData = await scalesResponse.json();
      const scales = Array.isArray(scalesData)
        ? scalesData
        : scalesData.items || [];
      let scaleId;

      if (scales.length === 0) {
        console.log("   Создаём шкалу компетенций...");
        const createScaleResponse = await context.post(
          "/manager/competence-scales",
          {
            headers,
            data: {
              title: `Шкала для NineBox (seed ${Date.now()})`,
              levels: [
                { title: "Низкий", value: 1 },
                { title: "Средний", value: 2 },
                { title: "Высокий", value: 3 },
              ],
            },
          },
        );

        if (!createScaleResponse.ok()) {
          const error = await createScaleResponse.text();
          throw new Error(`Не удалось создать шкалу: ${error}`);
        }

        const scaleData = await createScaleResponse.json();
        scaleId = scaleData.id;
        console.log(`   ✅ Шкала создана: ${scaleId}`);
      } else {
        scaleId = scales[0].id;
        console.log(`   Используем существующую шкалу: ${scaleId}`);
      }

      // Создаём компетенции
      console.log("   Создаём компетенции...");

      const comp1Response = await context.post("/manager/competencies", {
        headers,
        data: {
          title: `Потенциал (seed ${Date.now()})`,
          competenceScaleId: scaleId,
        },
      });

      if (!comp1Response.ok()) {
        const error = await comp1Response.text();
        throw new Error(`Не удалось создать компетенцию 1: ${error}`);
      }

      const comp1 = await comp1Response.json();
      console.log(`   ✅ Компетенция Y: ${comp1.id}`);

      const comp2Response = await context.post("/manager/competencies", {
        headers,
        data: {
          title: `Результативность (seed ${Date.now()})`,
          competenceScaleId: scaleId,
        },
      });

      if (!comp2Response.ok()) {
        const error = await comp2Response.text();
        throw new Error(`Не удалось создать компетенцию 2: ${error}`);
      }

      const comp2 = await comp2Response.json();
      console.log(`   ✅ Компетенция X: ${comp2.id}`);

      competencies = [comp1, comp2];
    }

    // Настраиваем NineBox
    console.log("⚙️  Настройка NineBox...");
    const xCompetenciesIds = [competencies[0].id];
    const yCompetenciesIds = [competencies[1]?.id || competencies[0].id];

    const updateResponse = await context.post("/manager/ninebox-settings", {
      headers,
      data: {
        matrixSize: 3,
        xCompetenciesIds,
        yCompetenciesIds,
        cellsTitles: [
          ["Звезда", "Растущая звезда", "Потенциальный работник"],
          [
            "Опытный профессионал",
            "Ключевой работник",
            "Противоречивый работник",
          ],
          [
            "Эффективный специалист",
            "Средний работник",
            "Неэффективный работник",
          ],
        ],
      },
    });

    if (!updateResponse.ok()) {
      const error = await updateResponse.text();
      throw new Error(`Не удалось обновить настройки NineBox: ${error}`);
    }

    console.log("   ✅ Настройки обновлены");

    // Включаем NineBox
    console.log("🚀 Включение NineBox...");
    const enableResponse = await context.post(
      "/manager/ninebox-settings/enable",
      { headers },
    );

    if (!enableResponse.ok()) {
      const error = await enableResponse.text();
      throw new Error(`Не удалось включить NineBox: ${error}`);
    }

    console.log("   ✅ NineBox включён");

    // Проверяем результат
    const finalResponse = await context.get("/manager/ninebox-settings", {
      headers,
    });
    const finalSettings = finalResponse.ok()
      ? await finalResponse.json()
      : null;

    console.log("\n✅ NineBox успешно настроен!");
    console.log(`   ID: ${finalSettings?.id || "N/A"}`);
    console.log(`   Включён: ${finalSettings?.isEnabled}`);
    console.log(`   X компетенции: ${JSON.stringify(xCompetenciesIds)}`);
    console.log(`   Y компетенции: ${JSON.stringify(yCompetenciesIds)}`);
  } catch (error) {
    console.error("❌ Ошибка при настройке NineBox:", error.message);
    process.exit(1);
  } finally {
    await context.dispose();
  }
}

seedNineBoxData();
