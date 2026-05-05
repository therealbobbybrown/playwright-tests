// tests/functional/competencies/indicators/competency-indicator-edit.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetencyFormPage } from '../../../../pages/CompetencyFormPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Вопросы-индикаторы',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let competencyId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      const title = `A_IndicatorEdit ${Date.now()}`;
      const { data } = await api.createCompetency({ title, emoji: '📝' });
      const id = data?.id || data?.competency?.id;
      if (!id) throw new Error('Не удалось создать компетенцию');
      competencyId = id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Indicators');
    });

    test.afterAll(async () => {
      if (competencyId && api) {
        await api.deleteCompetency(competencyId).catch(() => {});
      }
    });

    test('C9322: Редактировать текст вопроса-индикатора',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);
        const originalText = `Оригинальный индикатор ${Date.now()}`;
        const updatedText = `Обновлённый индикатор ${Date.now()}`;

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
        });

        await test.step('Добавить новый индикатор', async () => {
          await formPage.addIndicatorButton.click();
          await formPage.indicatorTitleInput.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorTitleInput.fill(originalText);
          await formPage.indicatorSaveButton.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorSaveButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Убедиться, что индикатор добавлен', async () => {
          await expect(page.getByText(originalText).first()).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Кликнуть overlay-кнопку для редактирования индикатора', async () => {
          // Question_overlay-edit — прозрачная кнопка поверх индикатора
          const overlay = page.locator('[class*="Question_overlay-edit"]').first();
          await overlay.scrollIntoViewIfNeeded();
          await overlay.click({ force: true });
          await formPage.indicatorTitleInput.waitFor({ state: 'visible', timeout: 5000 });
        });

        await test.step('Изменить текст индикатора и сохранить', async () => {
          await formPage.indicatorTitleInput.click();
          await formPage.indicatorTitleInput.fill(updatedText);
          await expect(formPage.indicatorTitleInput).toHaveValue(updatedText, { timeout: 3000 });
          await formPage.indicatorSaveButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить, что обновлённый текст отображается', async () => {
          await expect(page.getByText(updatedText).first()).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Перезагрузить и убедиться, что изменение сохранено', async () => {
          await page.reload();
          await formPage.assertViewOpened();
          await expect(page.getByText(updatedText).first()).toBeVisible({ timeout: 10_000 });
        });
      },
    );
  },
);
