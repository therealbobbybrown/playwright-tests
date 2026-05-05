// tests/functional/competencies/indicators/competency-indicator-add.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetencyFormPage } from '../../../../pages/CompetencyFormPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Вопросы-индикаторы',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let competencyId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      const title = `Indicator Test Competency ${Date.now()}`;
      const { data } = await api.createCompetency({ title, emoji: '⭐' });
      const id = data?.id || data?.competency?.id;
      if (!id) throw new Error('Не удалось создать компетенцию для теста индикаторов');
      competencyId = id;
    });

    test.afterAll(async () => {
      if (competencyId) {
        await api.deleteCompetency(competencyId).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Indicators');
    });

    test('C9190: Добавить вопрос-индикатор к компетенции',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);
        const questionText = `Индикатор ${Date.now()}`;

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
          await formPage.assertViewOpened();
        });

        await test.step('Перейти на вкладку "Вопросы-индикаторы"', async () => {
          await formPage.switchToIndicatorsTab();
        });

        await test.step('Нажать "Добавить" и заполнить вопрос', async () => {
          await formPage.addIndicatorButton.click();
          // Вопрос — textarea с placeholder "Вопрос"
          await formPage.indicatorTitleInput.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorTitleInput.fill(questionText);
        });

        await test.step('Сохранить индикатор', async () => {
          await formPage.indicatorSaveButton.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorSaveButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить что вопрос-индикатор добавлен', async () => {
          await expect(page.getByText(questionText).first()).toBeVisible({ timeout: 10_000 });
        });
      },
    );
  },
);
