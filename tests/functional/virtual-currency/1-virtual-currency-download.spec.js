import { test, expect } from '../../fixtures/auth.js';
import { SideMenu } from '../../../pages/SideMenu.js';
import { VirtualCurrencySettingsPage } from '../../../pages/VirtualCurrencySettingsPage.js';
import { markAsUITest, MODULES } from '../../utils/allure-helpers.js';
import xlsx from 'xlsx';
import fs from 'node:fs';

test.describe('Виртуальная валюта — скачивание балансов сотрудников', { tag: ['@ui', '@virtualcurrency', '@regression'] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.VIRTUAL_CURRENCY);
  });

  test('Скачать файл и проверить структуру', async ({ adminAuth, page }, testInfo) => {
    const sideMenu = new SideMenu(page, testInfo);
    const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
    let downloadPath;

    await test.step('Открыть настройки виртуальной валюты и скачать отчёт', async () => {
      await sideMenu.openVirtualCurrencySettings();
      await vcSettingsPage.assertOpened();

      // Используем метод из Page Object
      downloadPath = await vcSettingsPage.downloadBalancesReport(testInfo);

      expect(downloadPath).toBeTruthy();
      expect(fs.existsSync(downloadPath)).toBeTruthy();
    });

    await test.step('Проверить структуру XLSX', async () => {
      const workbook = xlsx.readFile(downloadPath, { cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      console.log(`[VC] Скачано строк: ${rows.length}`);
      expect(rows.length).toBeGreaterThan(0);

      const requiredColumns = [
        'ФИО',
        'E-mail',
        'Отдел',
        'Валюта для трат в магазине',
        'Валюта для благодарности',
      ];

      for (const col of requiredColumns) {
        expect(Object.keys(rows[0])).toContain(col);
      }

      // Проверяем каждую строку
      for (const row of rows) {
        const fio = String(row['ФИО'] || '').trim();
        const dept = row['Отдел'];
        const shopCurrency = row['Валюта для трат в магазине'];
        const thanksCurrency = row['Валюта для благодарности'];

        // ФИО должно быть заполнено
        expect(fio.length).toBeGreaterThan(0);

        // Отдел: строка (пустая допустима, но не undefined/null — проверяем что поле присутствует)
        expect(dept).toBeDefined();

        // Валюта: должно быть неотрицательное целое число (0 если нет валюты)
        const shopNum = Number(String(shopCurrency).replace(/\s+/g, '')) || 0;
        const thanksNum = Number(String(thanksCurrency).replace(/\s+/g, '')) || 0;
        expect(shopNum).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(shopNum)).toBe(true);
        expect(thanksNum).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(thanksNum)).toBe(true);
      }

      console.log(`[VC] Все ${rows.length} строк прошли валидацию`);
    });
  });
});
