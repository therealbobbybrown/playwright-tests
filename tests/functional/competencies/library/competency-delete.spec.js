// tests/functional/competencies/library/competency-delete.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetenciesLibraryPage } from '../../../../pages/CompetenciesLibraryPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Библиотека',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let competencyId = null;
    let competencyTitle = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      competencyTitle = `Test Competency Delete ${Date.now()}`;
      const { data } = await api.createCompetency({
        title: competencyTitle,
        description: 'Компетенция для теста удаления',
        emoji: '⭐',
      });
      const id = data?.id || data?.competency?.id;
      if (!id) {
        throw new Error('Не удалось создать компетенцию для теста удаления');
      }
      competencyId = id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Library');
    });

    test.afterAll(async () => {
      if (!competencyId || !api) return;
      // Попытка удалить на случай, если тест не выполнил удаление (cleanup)
      try {
        await api.deleteCompetency(competencyId);
      } catch {
        // Ожидаемо: компетенция уже удалена в ходе теста
      }
    });

    test('C9192: Удалить компетенцию через контекстное меню',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        if (!competencyId) throw new Error('competencyId не создан в beforeAll');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Убедиться, что компетенция присутствует в списке', async () => {
          await libraryPage.assertItemVisible(competencyTitle);
        });

        await test.step('Открыть контекстное меню и выбрать «Удалить», подтвердить', async () => {
          await libraryPage.deleteCompetency(competencyTitle);
        });

        await test.step('Проверить, что компетенция удалена из списка', async () => {
          await libraryPage.assertItemNotVisible(competencyTitle);
        });

        await test.step('Проверить через API, что компетенция возвращает 404', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const deletedId = competencyId;
          // После успешного удаления сбрасываем ID, чтобы afterAll не пытался удалить повторно
          competencyId = null;
          const { response } = await testApi.getCompetency(deletedId);
          expect(
            response.status(),
            `Ожидался статус 404 для удалённой компетенции ID=${deletedId}, получено: ${response.status()}`,
          ).toBe(404);
        });
      },
    );
  },
);
