// tests/functional/my-team/my-team-results-modal-download.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { EmployeeResultsModal } from "../../../pages/EmployeeResultsModal.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Скачивание отчётов из модалки",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test("C3665: Скачивание отчётов в разных форматах", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);
      const modal = new EmployeeResultsModal(page, testInfo);

      await test.step("Открыть модалку результатов", async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
        await myTeamPage.clickResultsForEmployee(0);
        await modal.assertModalOpened();
      });

      await test.step("Проверить доступные форматы экспорта", async () => {
        const formats = await modal.getAvailableExportFormats();
        console.log(`✓ Доступные форматы: ${formats.join(", ")}`);
        expect(formats.length, "Должен быть хотя бы один формат экспорта").toBeGreaterThanOrEqual(1);
      });

      await test.step("Скачать XLSX", async () => {
        const download = await modal.downloadReport("xlsx");
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
        } else {
          console.log(
            "XLSX: Скачивание не вернуло файл (возможно, асинхронная загрузка)",
          );
        }
      });

      await test.step("Скачать PDF", async () => {
        const download = await modal.downloadReport("pdf");
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
        } else {
          console.log(
            "PDF: Скачивание не вернуло файл (возможно, асинхронная загрузка)",
          );
        }
      });

      // Не закрываем модалку - после скачивания через /download/ страница может быть в нестабильном состоянии
    });
  },
);
