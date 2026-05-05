// tests/functional/competencies/library/competency-move-to-group.spec.js
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
    let groupAId = null;
    let groupBId = null;
    let groupAName = null;
    let groupBName = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      // Создаём две группы
      groupAName = `Group A ${Date.now()}`;
      groupBName = `Group B ${Date.now()}`;

      const { data: groupAData } = await api.createCompetenceGroup(groupAName);
      groupAId = groupAData?.id;
      if (!groupAId) throw new Error('Не удалось создать группу A');

      const { data: groupBData } = await api.createCompetenceGroup(groupBName);
      groupBId = groupBData?.id;
      if (!groupBId) throw new Error('Не удалось создать группу B');

      // Создаём компетенцию в группе A
      competencyTitle = `Move Test ${Date.now()}`;
      const { data: compData } = await api.createCompetency({
        title: competencyTitle,
        emoji: '🔄',
        groupId: groupAId,
      });
      competencyId = compData?.id || compData?.competency?.id;
      if (!competencyId) throw new Error('Не удалось создать компетенцию для теста переноса');
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Library');
    });

    test.afterAll(async () => {
      if (!api) return;
      try {
        if (competencyId) await api.deleteCompetency(competencyId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить компетенцию ${competencyId}: ${e.message}`);
      }
      try {
        if (groupAId) await api.deleteCompetenceGroup(groupAId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить группу A ${groupAId}: ${e.message}`);
      }
      try {
        if (groupBId) await api.deleteCompetenceGroup(groupBId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить группу B ${groupBId}: ${e.message}`);
      }
    });

    test('C9258: Перенести компетенцию в другую группу',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        if (!competencyId) throw new Error('competencyId не создан в beforeAll');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Перенести компетенцию в группу B', async () => {
          await libraryPage.moveCompetency(competencyTitle, groupBName);
        });

        await test.step('Проверить через API, что groupId обновлён на группу B', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(competencyId);
          expect(
            data?.groupId,
            `Ожидалось groupId=${groupBId} (группа B), получено: ${data?.groupId}`,
          ).toBe(groupBId);
        });
      },
    );
  },
);
