// tests/functional/competencies/library/competency-create-in-group.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetenciesLibraryPage } from '../../../../pages/CompetenciesLibraryPage.js';
import { CompetencyFormPage } from '../../../../pages/CompetencyFormPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Библиотека',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let groupId = null;
    let groupName = null;
    let createdId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      // Создаём группу для теста
      groupName = `Group InCreate ${Date.now()}`;
      const { data: groupData } = await api.createCompetenceGroup(groupName);
      groupId = groupData?.id;
      if (!groupId) throw new Error('Не удалось создать группу для теста');
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Library');
    });

    test.afterAll(async () => {
      if (!api) return;
      try {
        if (createdId) await api.deleteCompetency(createdId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить компетенцию ${createdId}: ${e.message}`);
      }
      try {
        if (groupId) await api.deleteCompetenceGroup(groupId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить группу ${groupId}: ${e.message}`);
      }
    });

    test('C9255: Создать компетенцию внутри группы',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        if (!groupId) throw new Error('groupId не создан в beforeAll');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);
        const formPage = new CompetencyFormPage(page, testInfo);
        const competencyTitle = `InGroup Comp ${Date.now()}`;

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Найти группу и нажать "Создать компетенцию" внутри неё', async () => {
          await libraryPage.search(groupName);
          const groupItem = libraryPage.getItemByName(groupName);
          const createLink = groupItem.locator('a[href*="groupId="]').first();
          await createLink.waitFor({ state: 'visible', timeout: 10_000 });
          await createLink.click();
        });

        await test.step('Убедиться, что открылась страница создания с привязкой к группе', async () => {
          await expect(page).toHaveURL(/groupId=\d+/);
          await formPage.assertCreateOpened();
        });

        await test.step('Заполнить название и нажать "Создать"', async () => {
          await formPage.fillAndCreate({ title: competencyTitle });
        });

        await test.step('Извлечь ID созданной компетенции из URL', async () => {
          await page.waitForURL(/competenceId=\d+/, { timeout: 30_000 });
          const url = page.url();
          const match = url.match(/competenceId=(\d+)/);
          if (!match) throw new Error(`Ожидался URL с competenceId, получено: ${url}`);
          createdId = Number(match[1]);
        });

        await test.step('Проверить через API, что компетенция привязана к группе', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(createdId);
          expect(
            data?.title,
            `Ожидалось title="${competencyTitle}", получено: ${data?.title}`,
          ).toBe(competencyTitle);
          expect(
            data?.groupId,
            `Ожидалось groupId=${groupId}, получено: ${data?.groupId}`,
          ).toBe(groupId);
        });
      },
    );
  },
);
