// tests/functional/competencies/scales/competence-scale-with-description.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetenceScalesPage } from '../../../../pages/CompetenceScalesPage.js';
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

    test('C9262: Создать шкалу оценки с описанием',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('normal');

        const scalesPage = new CompetenceScalesPage(page, testInfo);
        const formPage = new CompetenceScaleFormPage(page, testInfo);
        const scaleName = `Test Scale Desc ${Date.now()}`;
        const descriptionText = 'Автотест: описание шкалы для проверки создания с описанием';

        await test.step('Открыть страницу шкал оценки компетенций', async () => {
          await scalesPage.goto();
        });

        await test.step('Нажать кнопку «Создать шкалу»', async () => {
          await scalesPage.clickCreateScale();
        });

        await test.step('Заполнить название шкалы', async () => {
          await formPage.titleInput.fill(scaleName);
        });

        await test.step('Включить "Добавить описание" и заполнить описание', async () => {
          await formPage.descriptionToggle.click();
          await formPage.descriptionInput.fill(descriptionText);
        });

        await test.step('Нажать "Создать"', async () => {
          await formPage.createButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить через API, что шкала создана с описанием', async () => {
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
            found.description,
            `Ожидалось description="${descriptionText}", получено: ${found.description}`,
          ).toBe(descriptionText);
          createdScaleId = found.id;
        });
      },
    );
  },
);
