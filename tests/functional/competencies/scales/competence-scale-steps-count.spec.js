// tests/functional/competencies/scales/competence-scale-steps-count.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetenceScaleFormPage } from '../../../../pages/CompetenceScaleFormPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Шкалы оценки',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let createdScaleId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Scales');
    });

    test.afterAll(async () => {
      if (!createdScaleId || !api) return;
      try {
        await api.deleteCompetenceScale(createdScaleId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить шкалу ${createdScaleId}: ${e.message}`);
      }
    });

    test('C9319: Создать шкалу с 3 шагами',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('normal');

        const formPage = new CompetenceScaleFormPage(page, testInfo);
        const scaleName = `A_Steps3 ${Date.now()}`;

        await test.step('Открыть страницу создания шкалы', async () => {
          await formPage.gotoCreate();
        });

        await test.step('Заполнить название шкалы', async () => {
          await formPage.titleInput.fill(scaleName);
        });

        await test.step('Выбрать 3 шага', async () => {
          await formPage.selectStepsCount(3);
        });

        await test.step('Нажать "Создать"', async () => {
          await formPage.createButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить через API, что шкала создана с rangeMax=3 и rangeMin=1', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetenceScales({ limit: 1000 });
          const scales = Array.isArray(data) ? data : (data?.items ?? data?.results ?? []);
          const found = scales.find((s) => s.title === scaleName);
          expect(
            found,
            `Ожидалась шкала с названием "${scaleName}" в API, но она не найдена`,
          ).toBeTruthy();
          expect(
            found.rangeMax,
            `Ожидался rangeMax=3, получено: ${found.rangeMax}`,
          ).toBe(3);
          expect(
            found.rangeMin,
            `Ожидался rangeMin=1, получено: ${found.rangeMin}`,
          ).toBe(1);
          createdScaleId = found.id;
        });
      },
    );
  },
);
