import { test, expect } from '../../fixtures/auth.js';
import { markAsUITest, MODULES } from '../../utils/allure-helpers.js';
import { SideMenu } from '../../../pages/SideMenu.js';
import { VirtualCurrencySettingsPage } from '../../../pages/VirtualCurrencySettingsPage.js';
import xlsx from 'xlsx';

const DEBUG = process.env.VC_DEBUG === '1';
const log = DEBUG ? console.log.bind(console) : () => {};

test.describe('Виртуальная валюта — сверка балансов и истории', { tag: ['@ui', '@virtualcurrency', '@regression'] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.VIRTUAL_CURRENCY);
  });

  test(
    'Скачивание балансов и сверка с историей операций',
    { tag: ['@api'] },
    async ({ adminAuth, page }, testInfo) => {
      const sideMenu = new SideMenu(page, testInfo);
      const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
      /** @type {Record<string, number>} */
      let reportBalances = {};

      await test.step('Скачать отчет балансов сотрудников', async () => {
        log('[VC] Старт скачивания отчета');
        await sideMenu.openVirtualCurrencySettings();
        await vcSettingsPage.assertOpened();

        // Используем метод из Page Object для скачивания через токен
        const downloadPath = await vcSettingsPage.downloadBalancesReportViaToken(testInfo, { debug: DEBUG });

        // Парсим XLSX и собираем балансы по ФИО
        const workbook = xlsx.readFile(downloadPath, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

        reportBalances = rows.reduce((acc, row) => {
          const name =
            String(row['ФИО'] ?? row['Фио'] ?? row['фио'] ?? '').trim();
          const shopRaw =
            row['Валюта для трат в магазине'] ?? row['Валюта для трат'];
          const thanksRaw =
            row['Валюта для благодарности'] ??
            row['Валюта для благодарности/дарения'];

          const shop = Number(String(shopRaw).replace(/\s+/g, '')) || 0;
          const thanks = Number(String(thanksRaw).replace(/\s+/g, '')) || 0;

          if (name) {
            acc[name] = (acc[name] ?? 0) + shop + thanks;
          }
          return acc;
        }, /** @type {Record<string, number>} */ ({}));

        expect(Object.keys(reportBalances).length).toBeGreaterThan(0);
        log('[VC] В отчете сотрудников:', Object.keys(reportBalances).length);
      });

      /** @type {Record<string, number>} */
      let historyBalances = {};

      await test.step('Собрать историю операций через UI (проскроллить таблицу)', async () => {
        await vcSettingsPage.assertOpened();
        await vcSettingsPage.openOperationsHistory();

        // Используем локатор из Page Object для проверки пагинации
        const pagination = vcSettingsPage.paginationLocator;
        await expect(pagination).toBeVisible();

        // Используем метод из Page Object для сбора данных с пагинацией
        historyBalances = await vcSettingsPage.collectHistoryBalances({ maxPages: 3, debug: DEBUG });

        expect(Object.keys(historyBalances).length).toBeGreaterThan(0);
      });

      await test.step('Проверить что получатели из истории есть в отчёте', async () => {
        // Исключаем не-сотрудников (компании, системные записи)
        const excludeFromCheck = ['uzum1'];

        // Проверяем, что найденные в истории получатели есть в отчёте
        const historyNames = Object.keys(historyBalances)
          .filter(name => !excludeFromCheck.includes(name.toLowerCase()));
        const reportNames = Object.keys(reportBalances);

        // Нормализация: сортируем слова по алфавиту для сравнения
        // "Имя Фамилия" и "Фамилия Имя" дадут одинаковый результат
        const normalize = (name) => {
          return name
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .sort()
            .join(' ');
        };

        // Находим получателей из истории, которые есть в отчёте
        const matched = [];
        const notInReport = [];

        for (const histName of historyNames) {
          const histNorm = normalize(histName);

          const found = reportNames.some(reportName => {
            return normalize(reportName) === histNorm;
          });

          if (found) {
            matched.push(histName);
          } else {
            notInReport.push(histName);
          }
        }

        log(`[VC] Найдено в истории: ${historyNames.length}, совпадает с отчётом: ${matched.length}`);

        // Все сотрудники из истории должны быть в отчёте
        expect(matched.length).toBe(historyNames.length);

        // Логируем тех, кто не найден (для отладки)
        if (notInReport.length > 0) {
          log(`[VC] Не найдены в отчёте (${notInReport.length}):`, notInReport);
        }

        log('[VC] Сверка получателей завершена');
      });
    }
  );
});
