// tests/functional/competencies/groups/competency-group-edit.spec.js
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
    let groupId = null;
    let originalGroupName = null;
    let renamedGroupName = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      originalGroupName = `Test Group Edit ${Date.now()}`;
      const { data } = await api.createCompetenceGroup(originalGroupName);
      if (!data?.id) {
        throw new Error('Не удалось создать группу компетенций для теста редактирования');
      }
      groupId = data.id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Группы компетенций');
    });

    test.afterAll(async () => {
      if (!groupId || !api) return;
      try {
        await api.deleteCompetenceGroup(groupId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить группу ${groupId}: ${e.message}`);
      }
    });

    test('C9189: Редактировать название группы компетенций', async ({ adminAuth: page, request }, testInfo) => {
      setSeverity('normal');

      const libraryPage = new CompetenciesLibraryPage(page, testInfo);
      renamedGroupName = `Renamed Group ${Date.now()}`;

      await test.step('Открыть библиотеку компетенций', async () => {
        await libraryPage.goto();
      });

      await test.step('Проверить, что исходная группа присутствует в списке', async () => {
        await libraryPage.assertItemVisible(originalGroupName);
      });

      await test.step('Открыть контекстное меню и выбрать «Редактировать»', async () => {
        await libraryPage.editGroup(originalGroupName, renamedGroupName);
      });

      await test.step('Проверить, что новое название отображается в списке', async () => {
        await libraryPage.assertItemVisible(renamedGroupName);
      });

      await test.step('Проверить, что старое название больше не отображается', async () => {
        await libraryPage.clearSearch();
        await libraryPage.assertItemNotVisible(originalGroupName);
      });

      await test.step('Проверить через API, что группа сохранена с новым названием', async () => {
        const { email, password } = getCredentials('admin');
        const testApi = new CompetenciesAPI(request);
        await testApi.signIn(email, password);
        const { data } = await testApi.getCompetenceGroups({ limit: 1000 });
        const groups = Array.isArray(data) ? data : (data?.items ?? []);
        const found = groups.find((g) => g.id === groupId);
        expect(
          found?.title,
          `Ожидалось title="${renamedGroupName}" для группы ID=${groupId}, получено: ${found?.title}`,
        ).toBe(renamedGroupName);
      });
    });
  },
);
