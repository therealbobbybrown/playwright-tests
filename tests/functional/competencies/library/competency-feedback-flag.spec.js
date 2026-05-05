// tests/functional/competencies/library/competency-feedback-flag.spec.js
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
    let createdTitle = null;
    let createdId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Library');
    });

    test.afterAll(async () => {
      if (!createdId || !api) return;
      try {
        await api.deleteCompetency(createdId);
      } catch (e) {
        console.warn(`[afterAll] Не удалось удалить компетенцию ${createdId}: ${e.message}`);
      }
    });

    test('C9194: Создать компетенцию с включённым флагом "Показывать в форме фидбека"',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);
        const formPage = new CompetencyFormPage(page, testInfo);

        createdTitle = `Test Feedback Flag ${Date.now()}`;

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Нажать "+ Создать компетенцию" и перейти к форме создания', async () => {
          await libraryPage.clickCreateCompetency();
          await formPage.assertCreateOpened();
        });

        await test.step('Заполнить название компетенции', async () => {
          // pressSequentially для корректного триггера React onChange
          await formPage.titleInput.click();
          await formPage.titleInput.pressSequentially(createdTitle, { delay: 30 });
        });

        await test.step('Включить тоггл "Показывать компетенцию в форме фидбека"', async () => {
          await formPage.enableFeedback();
        });

        await test.step('Нажать "Создать" и дождаться создания компетенции', async () => {
          const createBtn = page.getByRole('button', { name: 'Создать' }).last();
          await createBtn.waitFor({ state: 'visible', timeout: 5000 });
          await createBtn.click();
          await page.waitForURL(/competenceId=\d+/, { timeout: 30_000 });
          const url = page.url();
          const match = url.match(/competenceId=(\d+)/);
          if (!match) throw new Error(`Ожидался URL с competenceId, получено: ${url}`);
          createdId = Number(match[1]);
        });

        await test.step('Проверить через API, что forFeedback === true', async () => {
          // Используем тест-скопный request, не beforeAll-скопный api
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(createdId);
          expect(
            data?.forFeedback,
            `Ожидалось forFeedback=true для компетенции ID=${createdId}, получено: ${data?.forFeedback}`,
          ).toBe(true);
        });
      },
    );
  },
);
