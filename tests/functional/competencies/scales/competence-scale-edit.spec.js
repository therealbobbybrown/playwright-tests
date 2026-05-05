// tests/functional/competencies/scales/competence-scale-edit.spec.js
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
    let scaleId = null;
    let originalScaleName = null;
    let updatedScaleName = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      originalScaleName = `Test Scale Edit ${Date.now()}`;
      const { data } = await api.createCompetenceScale({
        title: originalScaleName, rangeMin: 1, rangeMax: 5,
        widget: 'slider', rangeMinLabel: 'Низкий', rangeMaxLabel: 'Высокий', disallowStepNumbers: false,
      });
      const id = data?.id || data?.scale?.id;
      if (!id) {
        throw new Error('Не удалось создать шкалу компетенций для теста редактирования');
      }
      scaleId = id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Scales');
    });

    test.afterAll(async () => {
      if (!scaleId || !api) return;
      try {
        await api.deleteCompetenceScale(scaleId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить шкалу ${scaleId}: ${e.message}`);
      }
    });

    test('C9199: Редактировать название шкалы оценки компетенций',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');

        const scalesPage = new CompetenceScalesPage(page, testInfo);
        const formPage = new CompetenceScaleFormPage(page, testInfo);
        updatedScaleName = `Renamed Scale ${Date.now()}`;

        await test.step('Открыть страницу редактирования шкалы напрямую', async () => {
          await formPage.gotoEdit(scaleId);
          await expect(page).toHaveURL(new RegExp(`competence-scales/${scaleId}`));
        });

        await test.step('Изменить название шкалы и сохранить', async () => {
          await formPage.updateTitle(updatedScaleName);
        });

        await test.step('Вернуться на список шкал и проверить новое название', async () => {
          await scalesPage.goto();
          await scalesPage.assertScaleVisible(updatedScaleName);
        });

        await test.step('Убедиться, что старое название больше не отображается', async () => {
          await scalesPage.assertScaleNotVisible(originalScaleName);
        });
      },
    );
  },
);
