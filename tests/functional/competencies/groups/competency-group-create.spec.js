// tests/functional/competencies/groups/competency-group-create.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetenciesLibraryPage } from '../../../../pages/CompetenciesLibraryPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Группы компетенций',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let createdGroupName = null;
    let createdGroupId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Группы компетенций');
    });

    test.afterAll(async () => {
      if (!createdGroupId || !api) return;
      try {
        await api.deleteCompetenceGroup(createdGroupId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить группу ${createdGroupId}: ${e.message}`);
      }
    });

    test('C9187: Создать группу компетенций', async ({ adminAuth: page, request }, testInfo) => {
      setSeverity('normal');

      const libraryPage = new CompetenciesLibraryPage(page, testInfo);
      createdGroupName = `Test Group ${Date.now()}`;

      await test.step('Открыть библиотеку компетенций', async () => {
        await libraryPage.goto();
      });

      await test.step('Создать группу через диалог', async () => {
        await libraryPage.createGroup(createdGroupName);
      });

      await test.step('Проверить, что группа появилась в списке', async () => {
        await libraryPage.assertItemVisible(createdGroupName);
      });

      await test.step('Проверить через API, что группа сохранена с корректным названием', async () => {
        const { email, password } = getCredentials('admin');
        const testApi = new CompetenciesAPI(request);
        await testApi.signIn(email, password);
        const { data } = await testApi.getCompetenceGroups({ limit: 1000 });
        const groups = Array.isArray(data) ? data : (data?.items ?? []);
        const found = groups.find((g) => g.title === createdGroupName);
        expect(
          found,
          `Ожидалась группа с названием "${createdGroupName}" в API, но она не найдена`,
        ).toBeTruthy();
        createdGroupId = found.id;
      });
    });
  },
);
