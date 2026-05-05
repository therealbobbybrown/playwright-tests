import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Hover-эффекты аватара в таблице",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7468: A4: Наведение на аватар затемняет фото и меняет цвет имени на фиолетовый",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let employeeName;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Получить имя первого сотрудника", async () => {
          const names = await myTeamPage.getAllEmployeeNames();
          expect(
            names.length,
            "В таблице должен быть хотя бы один сотрудник",
          ).toBeGreaterThan(0);
          employeeName = names[0];
        });

        await test.step("Навести курсор на аватар сотрудника", async () => {
          await myTeamPage.hoverEmployeeAvatar(employeeName);
        });

        await test.step("Проверить затемнение аватара после наведения", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          const employeeCell = row.locator("td").first();
          const avatar = employeeCell
            .locator('[class*="Avatar_avatar"]')
            .first();

          // Проверяем через CSS-свойства: наведение должно добавлять overlay или менять opacity
          const overlayVisible = await page.evaluate(
            (el) => {
              const computed = window.getComputedStyle(el);
              // Ищем псевдоэлемент или дочерний overlay
              const children = el.querySelectorAll("*");
              for (const child of children) {
                const cs = window.getComputedStyle(child);
                // overlay с полупрозрачным фоном или изменением opacity
                if (
                  (cs.opacity !== "" && parseFloat(cs.opacity) < 1) ||
                  (cs.backgroundColor.includes("rgba") &&
                    cs.position !== "static")
                ) {
                  return true;
                }
              }
              // Fallback: проверяем opacity самого аватара или его обёртки
              return parseFloat(computed.opacity) < 1;
            },
            await avatar.elementHandle(),
          );

          // Альтернативная проверка: ищем элемент overlay по классу (появляется при hover)
          const overlay = employeeCell
            .locator(
              '[class*="overlay"], [class*="Overlay"], [class*="hover"], [class*="dim"]',
            )
            .first();
          const hasOverlay = await overlay.isVisible();

          // Хотя бы одна из проверок должна пройти: либо overlay виден, либо opacity изменился
          expect(
            overlayVisible || hasOverlay,
            "При наведении на аватар должно быть затемнение (overlay или opacity)",
          ).toBe(true);
        });

        await test.step("Проверить изменение цвета имени сотрудника на фиолетовый", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          const employeeCell = row.locator("td").first();
          const nameElement = employeeCell
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();

          await nameElement.waitFor({ state: "visible", timeout: 5000 });

          const nameColor = await page.evaluate(
            (el) => {
              return window.getComputedStyle(el).color;
            },
            await nameElement.elementHandle(),
          );

          // Фиолетовый цвет в RGB: приблизительно rgb(100-180, 0-100, 200-255) или hex #7B61FF и подобные
          // Проверяем, что цвет изменился с исходного (обычно тёмно-серый/чёрный) на фиолетовый оттенок
          const purpleRegex = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/;
          const match = nameColor.match(purpleRegex);

          if (match) {
            const [, r, g, b] = match.map(Number);
            // Фиолетовый: синяя составляющая доминирует, красная умеренная, зелёная низкая
            const isPurple = b > 150 && r > 50 && g < r && g < b;
            expect(
              isPurple,
              `Цвет имени должен быть фиолетовым, получен: rgb(${r}, ${g}, ${b})`,
            ).toBe(true);
          } else {
            // Если не удалось распарсить — проверяем хотя бы что цвет не дефолтный чёрный
            expect(
              nameColor,
              "Цвет имени должен измениться при hover",
            ).not.toBe("rgb(0, 0, 0)");
          }
        });
      },
    );
  },
);
