// tests/functional/competencies/indicators/competency-indicator-options.spec.js
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

      const title = `A_IndicatorOptions ${Date.now()}`;
      const { data } = await api.createCompetency({ title, emoji: '⚙️' });
      const id = data?.id || data?.competency?.id;
      if (!id) throw new Error('Не удалось создать компетенцию для теста опций индикатора');
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

    test(
      'C9324: Настроить опции вопроса-индикатора',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);
        const questionText = `Индикатор опции ${Date.now()}`;

        // Вспомогательная функция: кликнуть кастомный toggle-чекбокс по его label-тексту.
        // Каждый toggle имеет структуру:
        //   .Toggler_toggler__* [cursor=pointer]  ← кликабельная обёртка
        //     img
        //     input[checkbox]
        //   span[cursor=pointer]: "Label text"   ← текстовая метка
        // Кликаем по тексту-метке (span), который всегда доступен и не заблокирован.
        const clickToggleLabel = async (labelText) => {
          const label = page
            .locator('[class*="Toggler_toggler-wrapper"] [class*="Toggler"]')
            .filter({ hasText: labelText })
            .locator('[cursor=pointer]')
            .last();
          const fallback = page.locator('[class*="Toggler"]').filter({ hasText: labelText }).last();

          const found = await label
            .waitFor({ state: 'visible', timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (found) {
            await label.click({ force: true });
          } else {
            await fallback.click({ force: true });
          }
        };

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
          await formPage.assertViewOpened();
        });

        await test.step('Добавить индикатор и заполнить текст вопроса', async () => {
          await formPage.addIndicatorButton.click();
          await formPage.indicatorTitleInput.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorTitleInput.fill(questionText);
        });

        await test.step('Проверить начальное состояние: "Обязательный" включён по умолчанию', async () => {
          await expect(page.getByRole('checkbox', { name: 'Обязательный' })).toBeChecked();
          await expect(
            page.getByRole('checkbox', { name: 'Разрешить комментарии к ответу' }),
          ).not.toBeChecked();
        });

        await test.step('Снять чекбокс "Обязательный"', async () => {
          // Кликаем по toggle-оболочке с class Toggler_toggler__* которая содержит checkbox input.
          // Прямой .check()/.uncheck() не работает — input перехватывается вышестоящим элементом.
          // Надёжный способ: click({ force: true }) на родителе input (.locator('..'))
          await page
            .getByRole('checkbox', { name: 'Обязательный' })
            .locator('..')
            .click({ force: true });
          await expect(page.getByRole('checkbox', { name: 'Обязательный' })).not.toBeChecked();
        });

        await test.step('Включить "Начинать шкалу с нуля"', async () => {
          await page
            .getByRole('checkbox', { name: 'Начинать шкалу с нуля' })
            .locator('..')
            .click({ force: true });
          await expect(
            page.getByRole('checkbox', { name: 'Начинать шкалу с нуля' }),
          ).toBeChecked();
        });

        await test.step('Сохранить индикатор', async () => {
          await formPage.indicatorSaveButton.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorSaveButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Убедиться, что индикатор добавлен', async () => {
          await expect(page.getByText(questionText).first()).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Перезагрузить страницу', async () => {
          await page.reload();
          await formPage.assertViewOpened();
        });

        await test.step('Открыть форму редактирования индикатора через overlay', async () => {
          // Question_overlay-edit — прозрачная кнопка поверх индикатора
          const overlay = page.locator('[class*="Question_overlay-edit"]').first();
          await overlay.scrollIntoViewIfNeeded();
          await overlay.click({ force: true });
          await formPage.indicatorTitleInput.waitFor({ state: 'visible', timeout: 5000 });
        });

        await test.step('Проверить, что изменённые опции сохранились после перезагрузки', async () => {
          // "Обязательный" должен быть снят
          await expect(page.getByRole('checkbox', { name: 'Обязательный' })).not.toBeChecked();
          // "Начинать шкалу с нуля" должен быть включён
          await expect(
            page.getByRole('checkbox', { name: 'Начинать шкалу с нуля' }),
          ).toBeChecked();
        });
      },
    );
  },
);
