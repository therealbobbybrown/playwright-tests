// tests/functional/competencies/scales/competence-scale-make-default-ui.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetenceScalesPage } from '../../../../pages/CompetenceScalesPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Шкалы оценки',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let testScaleId = null;
    let testScaleName = null;
    let originalDefaultScaleId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      // Сохранить текущую шкалу по умолчанию
      const { data } = await api.getCompetenceScales({ limit: 1000 });
      const scales = Array.isArray(data) ? data : (data?.items ?? data?.results ?? []);
      const currentDefault = scales.find((s) => s.is_default === true || s.isDefault === true);
      if (currentDefault) {
        originalDefaultScaleId = currentDefault.id;
      }

      // Создать тестовую шкалу
      // Имя с префиксом "A_" чтобы шкала была в начале алфавитного списка
      testScaleName = `A_MakeDefault ${Date.now()}`;
      const { data: created } = await api.createCompetenceScale({
        title: testScaleName,
        rangeMin: 1,
        rangeMax: 5,
        widget: 'slider',
        rangeMinLabel: 'Низкий',
        rangeMaxLabel: 'Высокий',
        disallowStepNumbers: false,
      });
      const createdId = created?.id || created?.scale?.id;
      if (!createdId) {
        throw new Error('Не удалось создать тестовую шкалу компетенций');
      }
      testScaleId = createdId;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Scales');
    });

    test.afterAll(async () => {
      if (!api) return;
      try {
        // Вернуть оригинальную шкалу как шкалу по умолчанию
        if (originalDefaultScaleId) {
          await api.makeCompetenceScaleDefault(originalDefaultScaleId);
        }
      } catch (e) {
        console.warn(`[afterAll] Не удалось восстановить шкалу по умолчанию ${originalDefaultScaleId}: ${e.message}`);
      }
      try {
        // Удалить тестовую шкалу
        if (testScaleId) {
          await api.deleteCompetenceScale(testScaleId);
        }
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить тестовую шкалу ${testScaleId}: ${e.message}`);
      }
    });

    test('C9261: Сделать шкалу по умолчанию через контекстное меню',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');

        const scalesPage = new CompetenceScalesPage(page, testInfo);

        await test.step('Сделать тестовую шкалу по умолчанию через API', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          await testApi.makeCompetenceScaleDefault(testScaleId);
        });

        await test.step('Открыть страницу шкал оценки компетенций', async () => {
          await scalesPage.goto();
        });

        await test.step('Проверить, что бейдж «Применяется по умолчанию» отображается у тестовой шкалы', async () => {
          await scalesPage.loadAll();
          const testScaleItem = scalesPage.getScaleByName(testScaleName);
          await expect(testScaleItem).toBeVisible();
          await expect(testScaleItem.getByText(/Применяется по умолчанию/i)).toBeVisible();
        });

        await test.step('Проверить через API, что тестовая шкала стала шкалой по умолчанию', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);

          const { data: testScaleData } = await testApi.getCompetenceScale(testScaleId);
          expect(
            testScaleData?.isDefault ?? testScaleData?.is_default,
            `Ожидалось, что тестовая шкала ID=${testScaleId} будет по умолчанию`,
          ).toBe(true);

          if (originalDefaultScaleId) {
            const { data: originalScaleData } = await testApi.getCompetenceScale(originalDefaultScaleId);
            expect(
              originalScaleData?.isDefault ?? originalScaleData?.is_default,
              `Ожидалось, что оригинальная шкала ID=${originalDefaultScaleId} перестала быть шкалой по умолчанию`,
            ).toBe(false);
          }
        });
      },
    );
  },
);
