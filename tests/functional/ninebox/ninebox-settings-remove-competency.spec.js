// tests/functional/ninebox/ninebox-settings-remove-competency.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "NineBox — удаление компетенции с оси",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9386: Удалить компетенцию с оси — чип исчезает",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Открыть страницу настроек NineBox", async () => {
          await settingsPage.goto();
        });

        const competencies = await settingsPage.getYAxisCompetencies();

        await test.step(
          "Проверить что на оси Y есть минимум 2 компетенции",
          async () => {
            expect(
              competencies.length,
              "Для удаления нужно минимум 2 компетенции на оси Y",
            ).toBeGreaterThanOrEqual(2);
          },
        );

        const competencyToRemove = competencies[0];
        const originalCount = competencies.length;

        await test.step(
          `Удалить компетенцию "${competencyToRemove}"`,
          async () => {
            await settingsPage.removeCompetencyChip(competencyToRemove);
          },
        );

        await test.step(
          "Проверить что количество чипов уменьшилось на 1",
          async () => {
            const updatedCompetencies =
              await settingsPage.getYAxisCompetencies();
            expect(updatedCompetencies.length).toBe(originalCount - 1);
            expect(updatedCompetencies).not.toContain(competencyToRemove);
          },
        );

        await test.step(
          "Перезагрузить страницу для сброса несохранённых изменений",
          async () => {
            await settingsPage.goto();
          },
        );
      },
    );
  },
);
