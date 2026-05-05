// tests/org-structure-constructor.spec.js
import { test } from "../../fixtures/auth.js";
import { StructureConstructorPage } from "../../../pages/StructureConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — конструктор",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test('C3997: Админ открывает "Структура компании" и видит основные элементы (без учета данных дерева)', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const structurePage = new StructureConstructorPage(page, testInfo);

      await test.step('Открыть страницу "Структура компании" через боковое меню', async () => {
        await structurePage.openFromSideMenu();
      });

      await test.step("Проверить каркас страницы", async () => {
        await structurePage.assertMainElementsVisible();
      });
    });
  },
);
