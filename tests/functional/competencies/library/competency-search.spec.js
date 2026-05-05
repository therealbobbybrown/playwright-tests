// tests/functional/competencies/library/competency-search.spec.js
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

      // Уникальный суффикс для исключения случайных совпадений при поиске
      competencyTitle = `UniqueSearch_${Date.now()}`;
      const { data } = await api.createCompetency({
        title: competencyTitle,
        description: 'Компетенция для теста поиска',
        emoji: '⭐',
      });
      const id = data?.id || data?.competency?.id;
      if (!id) {
        throw new Error('Не удалось создать компетенцию для теста поиска');
      }
      competencyId = id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Library');
    });

    test.afterAll(async () => {
      if (!competencyId || !api) return;
      try {
        await api.deleteCompetency(competencyId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить компетенцию ${competencyId}: ${e.message}`);
      }
    });

    test('C9195: Искать компетенцию по уникальному названию в библиотеке',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');
        if (!competencyId) throw new Error('competencyId не создан в beforeAll');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Ввести уникальное название в поле поиска', async () => {
          await libraryPage.search(competencyTitle);
        });

        await test.step('Проверить, что компетенция отображается в результатах поиска', async () => {
          await libraryPage.assertItemVisible(competencyTitle);
        });

        await test.step('Поиск несуществующего названия — ранее найденная компетенция не видна', async () => {
          const nonExistentQuery = `NONEXISTENT_${Date.now()}`;
          await libraryPage.search(nonExistentQuery);

          // Проверяем что ранее найденная компетенция больше не отображается
          await libraryPage.assertItemNotVisible(competencyTitle);
        });

        await test.step('Очистить поиск — компетенция снова отображается в списке', async () => {
          await libraryPage.clearSearch();
          await libraryPage.assertItemVisible(competencyTitle);
        });
      },
    );
  },
);
