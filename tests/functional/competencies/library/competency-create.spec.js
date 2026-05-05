// tests/functional/competencies/library/competency-create.spec.js
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
    let createdTitle = null;
    let createdId = null;

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Library');
    });

    test.afterAll(async ({ request }) => {
      if (!createdId) return;
      try {
        const { email, password } = getCredentials('admin');
        const api = new CompetenciesAPI(request);
        await api.signIn(email, password);
        await api.deleteCompetency(createdId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить компетенцию ${createdId}: ${e.message}`);
      }
    });

    test('C9191: Создать компетенцию с названием и описанием',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);
        const formPage = new CompetencyFormPage(page, testInfo);

        createdTitle = `Test Competency ${Date.now()}`;
        const description = 'Автотест: описание компетенции для проверки создания';

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Нажать "+ Создать компетенцию"', async () => {
          await libraryPage.clickCreateCompetency();
          await formPage.assertCreateOpened();
        });

        await test.step('Убедиться, что открылась страница /ru/manager/competencies/add/', async () => {
          await expect(page).toHaveURL(/\/ru\/manager\/competencies\/add\//);
        });

        await test.step('Заполнить название и описание, нажать "Создать"', async () => {
          await formPage.fillAndCreate({ title: createdTitle, description });
        });

        await test.step('Проверить, что компетенция создана (URL содержит competenceId)', async () => {
          await page.waitForURL(/competenceId=\d+/, { timeout: 30_000 });
          const url = page.url();
          const match = url.match(/competenceId=(\d+)/);
          if (!match) throw new Error(`Ожидался URL с competenceId, получено: ${url}`);
          createdId = Number(match[1]);
        });

        await test.step('Вернуться в библиотеку и убедиться, что компетенция видна в списке', async () => {
          await libraryPage.goto();
          await libraryPage.assertItemVisible(createdTitle);
        });

        await test.step('Проверить через API, что компетенция сохранена с корректным названием', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(createdId);
          expect(
            data?.title,
            `Ожидалось title="${createdTitle}" для компетенции ID=${createdId}, получено: ${data?.title}`,
          ).toBe(createdTitle);
        });
      },
    );
  },
);
