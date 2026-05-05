// tests/functional/competencies/library/competency-edit.spec.js
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
    let competencyId = null;
    let competencyTitle = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      competencyTitle = `Test Competency Edit ${Date.now()}`;
      const { data } = await api.createCompetency({
        title: competencyTitle,
        description: 'Исходное описание для теста редактирования',
        emoji: '⭐',
      });
      const id = data?.id || data?.competency?.id;
      if (!id) {
        throw new Error('Не удалось создать компетенцию для теста редактирования');
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

    test('C9193: Редактировать описание компетенции через форму редактирования',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        if (!competencyId) throw new Error('competencyId не создан в beforeAll');

        const libraryPage = new CompetenciesLibraryPage(page, testInfo);
        const formPage = new CompetencyFormPage(page, testInfo);
        const updatedDescription = `Обновлённое описание ${Date.now()}`;

        await test.step('Открыть библиотеку компетенций', async () => {
          await libraryPage.goto();
        });

        await test.step('Убедиться, что компетенция присутствует в списке', async () => {
          await libraryPage.assertItemVisible(competencyTitle);
        });

        await test.step('Открыть контекстное меню и выбрать «Редактировать»', async () => {
          await libraryPage.openCompetencyContextMenu(competencyTitle);
          await libraryPage.clickContextMenuItem('Редактировать');
        });

        await test.step('Убедиться, что открылась страница карточки компетенции', async () => {
          await page.waitForURL(/\/ru\/manager\/competencies\/\d+\//);
          await formPage.assertViewOpened();
        });

        await test.step('Изменить описание и сохранить', async () => {
          await formPage.descriptionInput.clear();
          await formPage.descriptionInput.pressSequentially(updatedDescription, { delay: 10 });
          await formPage.saveButton.click();
        });

        await test.step('Проверить, что изменения отобразились на странице', async () => {
          await expect(page.getByText(updatedDescription)).toBeVisible({ timeout: 15_000 });
        });

        await test.step('Проверить через API, что описание компетенции обновлено', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(competencyId);
          expect(
            data?.description,
            `Ожидалось description содержит "${updatedDescription}" для компетенции ID=${competencyId}, получено: ${data?.description}`,
          ).toContain(updatedDescription);
        });
      },
    );
  },
);
