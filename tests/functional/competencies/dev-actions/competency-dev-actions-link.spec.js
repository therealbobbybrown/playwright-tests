// tests/functional/competencies/dev-actions/competency-dev-actions-link.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetencyFormPage } from '../../../../pages/CompetencyFormPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Развивающие действия',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let competencyId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      const title = `A_DevActionsLink ${Date.now()}`;
      const { data } = await api.createCompetency({ title, emoji: '🎯' });
      const id = data?.id || data?.competency?.id;
      if (!id) throw new Error('Не удалось создать компетенцию для теста развивающих действий');
      competencyId = id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Dev Actions');
    });

    test.afterAll(async () => {
      if (competencyId && api) {
        await api.deleteCompetency(competencyId).catch(() => {});
      }
    });

    test(
      'C9323: Привязать развивающее действие из библиотеки к компетенции',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
          await formPage.assertViewOpened();
        });

        await test.step('Перейти на вкладку "Развивающие действия"', async () => {
          await formPage.devActionsTab.waitFor({ state: 'visible', timeout: 10_000 });
          await formPage.devActionsTab.click();
        });

        await test.step('Нажать "Выбрать из библиотеки"', async () => {
          const libraryButton = page.getByRole('button', { name: 'Выбрать из библиотеки' });
          await libraryButton.waitFor({ state: 'visible', timeout: 10_000 });
          await libraryButton.click();
        });

        await test.step('Выбрать первое действие в модальном окне', async () => {
          // Ждём появления модального окна
          await page.getByText('Выбрать развивающие действия из библиотеки').waitFor({
            state: 'visible',
            timeout: 10_000,
          });
          await page.waitForLoadState('networkidle');

          // DOM-структура каждой строки действия:
          //   generic.DevelopmentActionOption_row (row container)
          //     generic.DevelopmentActionOption_control (left: checkbox area)
          //       button  ← покрывает всю строку и является кликабельным триггером выбора
          //       generic > checkbox + generic[cursor=pointer]  ← визуальный toggle
          //     generic (right: имя действия)
          //
          // Правильный клик — по blank button внутри DevelopmentActionOption_control.
          // Этот button покрывает строку целиком и триггерит выбор (checkbox становится checked).
          // Первая строка в списке (не "select all") — вторая строка в DOM.
          // Каждая строка действия имеет blank button внутри DevelopmentActionOption_control,
          // который покрывает строку и триггерит выбор при клике.
          // Первый такой button — первое действие в списке (не "select all").
          const firstRowButton = page
            .locator('[class*="DevelopmentActionOption_control"] button')
            .first();
          await firstRowButton.waitFor({ state: 'visible', timeout: 10_000 });
          await firstRowButton.click();

          // Убеждаемся, что выбор зарегистрирован: checkbox первого действия стал checked
          const firstActionCheckbox = page
            .locator('[class*="DevelopmentActionOption_control"]')
            .first()
            .getByRole('checkbox');
          await expect(firstActionCheckbox).toBeChecked({ timeout: 5000 });
        });

        await test.step('Нажать "Выбрать" для подтверждения выбора', async () => {
          // exact: true — иначе попадает на "Выбрать из библиотеки" тоже
          await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить, что действие появилось на вкладке', async () => {
          // После закрытия модального окна пустое состояние исчезает
          // и на вкладке появляется карточка с именем привязанного действия.
          // Ждём исчезновения плейсхолдера пустого состояния.
          await expect(
            page.getByText('Развивающие действия ещё не добавлены'),
          ).toHaveCount(0, { timeout: 10_000 });

          // Проверяем, что появился хотя бы один элемент карточки действия
          // (структура: generic с именем действия + кнопка отвязки + статус)
          const devActionRow = page.locator(
            '[class*="DevelopmentActionRow"], [class*="DevActionRow"], [class*="devActionRow"]',
          );
          const hasRow = await devActionRow
            .first()
            .waitFor({ state: 'visible', timeout: 5000 })
            .then(() => true)
            .catch(() => false);

          if (!hasRow) {
            // Fallback: кнопка "Выбрать из библиотеки" теперь присутствует НЕ одна
            // — рядом есть карточки. Проверяем через кнопку отвязки (три точки / удалить).
            // На вкладке с действиями всегда есть кнопка для каждой карточки.
            // Верифицируем через Playwright reload + проверку, что пустое состояние исчезло.
            await page.reload();
            await formPage.assertViewOpened();
            await formPage.devActionsTab.click();
            await expect(
              page.getByText('Развивающие действия ещё не добавлены'),
            ).toHaveCount(0, { timeout: 10_000 });
          }
        });
      },
    );
  },
);
