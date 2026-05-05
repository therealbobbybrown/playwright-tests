// tests/functional/competencies/library/competency-inline-edit-name.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
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
    let originalTitle = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      originalTitle = `Inline Edit ${Date.now()}`;
      const { data } = await api.createCompetency({
        title: originalTitle,
        description: 'Компетенция для теста inline-редактирования названия',
        emoji: '✏️',
      });
      competencyId = data?.id || data?.competency?.id;
      if (!competencyId) throw new Error('Не удалось создать компетенцию для теста inline-редактирования');
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

    test('C9257: Редактировать название компетенции inline на карточке',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        if (!competencyId) throw new Error('competencyId не создан в beforeAll');

        const formPage = new CompetencyFormPage(page, testInfo);
        const newTitle = `Inline Edited ${Date.now()}`;

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
        });

        await test.step('Проверить, что исходное название отображается', async () => {
          await expect(page.getByText(originalTitle).first()).toBeVisible();
        });

        await test.step('Кликнуть на название, ввести новое и сохранить через Enter', async () => {
          const titleInput = page.locator('input[id*="competence"][id*="title"]');

          // Кликаем по элементам с текстом title, пока не появится input
          const titleElements = page.getByText(originalTitle);
          const count = await titleElements.count();
          for (let i = 0; i < count; i++) {
            await titleElements.nth(i).click();
            const appeared = await titleInput
              .waitFor({ state: 'visible', timeout: 2000 })
              .then(() => true)
              .catch(() => false);
            if (appeared) break;
          }

          await titleInput.waitFor({ state: 'visible', timeout: 5000 });
          await titleInput.fill(newTitle);
          await expect(titleInput).toHaveValue(newTitle, { timeout: 5000 });

          // Enter — триггер сохранения (подтверждено через MCP network analysis)
          await page.keyboard.press('Enter');
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить через API, что название обновлено', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(competencyId);
          expect(
            data?.title,
            `Ожидалось title="${newTitle}", получено: ${data?.title}`,
          ).toBe(newTitle);
        });
      },
    );
  },
);
