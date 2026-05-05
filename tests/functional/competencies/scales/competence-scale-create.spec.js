// tests/functional/competencies/scales/competence-scale-create.spec.js
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
    let createdScaleName = null;
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

    test('C9196: Создать шкалу оценки компетенций',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');

        const scalesPage = new CompetenceScalesPage(page, testInfo);
        const formPage = new CompetenceScaleFormPage(page, testInfo);
        createdScaleName = `Test Scale ${Date.now()}`;

        await test.step('Открыть страницу шкал оценки компетенций', async () => {
          await scalesPage.goto();
        });

        await test.step('Нажать кнопку «Создать шкалу»', async () => {
          await scalesPage.clickCreateScale();
        });

        await test.step('Убедиться, что перешли на страницу создания шкалы', async () => {
          await formPage.assertOpened();
          await expect(page).toHaveURL(/competence-scales\/add\//);
        });

        await test.step('Заполнить название и создать шкалу', async () => {
          await formPage.fillAndCreate({ title: createdScaleName });
        });

        await test.step('Убедиться, что перешли обратно на список или на страницу шкалы', async () => {
          await expect(page).toHaveURL(/competence-scales/);
        });

        await test.step('Проверить, что созданная шкала отображается в списке', async () => {
          // Если после создания попали на страницу шкалы (/{id}/), вернуться в список
          if (!page.url().match(/competence-scales\/?$/)) {
            await scalesPage.goto();
          }
          await scalesPage.assertScaleVisible(createdScaleName);
        });

        await test.step('Проверить через API, что шкала сохранена с корректным названием', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetenceScales({ limit: 1000 });
          const scales = Array.isArray(data) ? data : (data?.items ?? data?.results ?? []);
          const found = scales.find((s) => s.title === createdScaleName);
          expect(
            found,
            `Ожидалась шкала с названием "${createdScaleName}" в API, но она не найдена`,
          ).toBeTruthy();
          createdScaleId = found.id;
        });
      },
    );
  },
);
