// tests/functional/competencies/scales/competence-scale-step-labels.spec.js
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

    test('C9318: Создать шкалу с подписями шагов',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('normal');

        const formPage = new CompetenceScaleFormPage(page, testInfo);
        const scaleName = `A_Labels ${Date.now()}`;

        await test.step('Открыть страницу создания шкалы', async () => {
          await formPage.gotoCreate();
        });

        await test.step('Заполнить название шкалы', async () => {
          await formPage.titleInput.fill(scaleName);
        });

        await test.step('Заполнить подписи шагов "Начальный" и "Экспертный"', async () => {
          await formPage.fillStepLabels('Начальный', 'Экспертный');
        });

        await test.step('Нажать "Создать"', async () => {
          await formPage.createButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить через API, что шкала создана с корректными подписями шагов', async () => {
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
            found.rangeMinLabel,
            `Ожидался rangeMinLabel="Начальный", получено: ${found.rangeMinLabel}`,
          ).toBe('Начальный');
          expect(
            found.rangeMaxLabel,
            `Ожидался rangeMaxLabel="Экспертный", получено: ${found.rangeMaxLabel}`,
          ).toBe('Экспертный');
          createdScaleId = found.id;
        });
      },
    );
  },
);
