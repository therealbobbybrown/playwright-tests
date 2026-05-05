// tests/functional/competencies/library/competency-create-with-group-toggle.spec.js
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

      // Создаём группу для привязки через тоггл
      groupName = `Toggle Group ${Date.now()}`;
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

    test('C9256: Создать компетенцию с привязкой к группе через тоггл',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        if (!groupId) throw new Error('groupId не создан в beforeAll');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);
        const formPage = new CompetencyFormPage(page, testInfo);
        const competencyTitle = `Toggle Comp ${Date.now()}`;

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Нажать "+ Создать компетенцию"', async () => {
          await libraryPage.clickCreateCompetency();
          await formPage.assertCreateOpened();
        });

        await test.step('Включить тоггл "Компетенция входит в группу"', async () => {
          await formPage.groupToggle.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Выбрать группу из выпадающего списка', async () => {
          // React-select: кликнуть на стрелку-индикатор чтобы раскрыть dropdown
          const dropdownArrow = page.locator('.react-select__indicator').first();
          await dropdownArrow.waitFor({ state: 'visible', timeout: 5000 });
          await dropdownArrow.click();
          // Выбрать группу из listbox options
          const groupOption = page.locator('.react-select__option').filter({ hasText: groupName });
          await groupOption.waitFor({ state: 'visible', timeout: 10_000 });
          await groupOption.click();
        });

        await test.step('Заполнить название компетенции', async () => {
          await formPage.titleInput.click();
          await formPage.titleInput.pressSequentially(competencyTitle, { delay: 30 });
        });

        await test.step('Нажать "Создать" и дождаться создания', async () => {
          const createBtn = page.getByRole('button', { name: 'Создать' }).last();
          await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
          await createBtn.click();
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
