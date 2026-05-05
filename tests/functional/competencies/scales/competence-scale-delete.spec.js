// tests/functional/competencies/scales/competence-scale-delete.spec.js
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
    let scaleId = null;
    let scaleName = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      scaleName = `Test Scale Delete ${Date.now()}`;
      const { data } = await api.createCompetenceScale({
        title: scaleName, rangeMin: 1, rangeMax: 5,
        widget: 'slider', rangeMinLabel: 'Низкий', rangeMaxLabel: 'Высокий', disallowStepNumbers: false,
      });
      const id = data?.id || data?.scale?.id;
      if (!id) {
        throw new Error('Не удалось создать шкалу компетенций для теста удаления');
      }
      scaleId = id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Scales');
    });

    test.afterAll(async () => {
      if (!scaleId || !api) return;
      // Попытка удалить на случай если тест не завершил удаление
      try {
        await api.deleteCompetenceScale(scaleId);
      } catch {
        // Шкала уже удалена тестом — игнорируем ошибку
      }
    });

    test('C9198: Удалить шкалу оценки компетенций',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');

        const scalesPage = new CompetenceScalesPage(page, testInfo);

        await test.step('Открыть страницу шкал оценки компетенций', async () => {
          await scalesPage.goto();
        });

        await test.step('Убедиться, что шкала присутствует в списке', async () => {
          await scalesPage.assertScaleVisible(scaleName);
        });

        await test.step('Открыть боковую панель шкалы', async () => {
          await scalesPage.openScalePreview(scaleName);
        });

        await test.step('Нажать «Удалить» в боковой панели и подтвердить', async () => {
          await scalesPage.clickDeleteInPanel();
        });

        await test.step('Проверить, что шкала больше не отображается в списке', async () => {
          await scalesPage.assertScaleNotVisible(scaleName);
        });

        await test.step('Проверить через API, что шкала возвращает 404', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const deletedId = scaleId;
          // Сбросить ID — шкала уже удалена, afterAll не должен пытаться удалить повторно
          scaleId = null;
          const { response } = await testApi.getCompetenceScale(deletedId);
          expect(
            response.status(),
            `Ожидался статус 404 для удалённой шкалы ID=${deletedId}, получено: ${response.status()}`,
          ).toBe(404);
        });
      },
    );
  },
);
