// tests/functional/competencies/scales/competence-scale-create-with-widget.spec.js
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

    test('C9317: Создать шкалу с виджетом Звезды',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('normal');

        const formPage = new CompetenceScaleFormPage(page, testInfo);
        const scaleName = `A_Stars ${Date.now()}`;

        await test.step('Открыть страницу создания шкалы', async () => {
          await formPage.gotoCreate();
        });

        await test.step('Заполнить название шкалы', async () => {
          await formPage.titleInput.fill(scaleName);
        });

        await test.step('Выбрать виджет "Звезды"', async () => {
          await formPage.selectWidget('Звезды');
        });

        await test.step('Нажать "Создать"', async () => {
          await formPage.createButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить через API, что шкала создана с виджетом stars', async () => {
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
            found.widget,
            `Ожидался widget="stars", получено: ${found.widget}`,
          ).toBe('stars');
          createdScaleId = found.id;
        });
      },
    );
  },
);
