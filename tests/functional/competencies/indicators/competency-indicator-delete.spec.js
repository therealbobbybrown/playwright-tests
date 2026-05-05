// tests/functional/competencies/indicators/competency-indicator-delete.spec.js
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

      const title = `A_IndicatorDelete ${Date.now()}`;
      const { data } = await api.createCompetency({ title, emoji: '🗑️' });
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

    test('C9321: Удалить вопрос-индикатор',
      { tag: ['@critical'] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);
        const questionText = `Индикатор для удаления ${Date.now()}`;

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
        });

        await test.step('Добавить новый индикатор', async () => {
          await formPage.addIndicatorButton.click();
          await formPage.indicatorTitleInput.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorTitleInput.fill(questionText);
          await formPage.indicatorSaveButton.waitFor({ state: 'visible', timeout: 5000 });
          await formPage.indicatorSaveButton.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Убедиться, что индикатор добавлен', async () => {
          await expect(page.getByText(questionText).first()).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Открыть форму редактирования нашего индикатора', async () => {
          // Найти overlay нашего индикатора — он содержит текст questionText
          // Overlay — кнопка Question_overlay-edit, расположена в том же контейнере что heading
          // Находим heading с нашим текстом, потом ищем overlay в parent контейнере
          const heading = page.getByRole('heading', { name: questionText });
          await heading.scrollIntoViewIfNeeded();
          // Overlay — sibling/adjacent element к контейнеру heading
          // Кликаем force на сам heading — overlay перехватит клик
          await heading.click({ force: true });
          // Ждём появления textbox
          const editInput = page.getByRole('textbox', { name: 'Вопрос' });
          await editInput.waitFor({ state: 'visible', timeout: 5000 });
        });

        await test.step('Нажать кнопку удаления индикатора', async () => {
          // delete = первая кнопка-иконка с trash в раскрытой форме
          // Наш индикатор — последний, ищем последнюю trash-кнопку
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button[class*="Question_footerButton__"]');
            // Находим trash-кнопки (содержат svg с href включающим "trash")
            const trashBtns = Array.from(buttons).filter(b => {
              const use = b.querySelector('svg use');
              const href = use?.getAttribute('xlink:href') || use?.getAttribute('href') || '';
              return href.includes('trash');
            });
            if (trashBtns.length === 0) throw new Error('Не найдены кнопки удаления');
            // Кликаем последнюю (наш индикатор добавлен последним)
            trashBtns[trashBtns.length - 1].click();
          });
          // Подтвердить удаление в диалоге "Вы уверены?"
          const confirmBtn = page.getByRole('button', { name: /Да, удалить|Удалить/i }).last();
          await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
          await confirmBtn.click();
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить, что индикатор удалён из списка', async () => {
          // Ждём исчезновения текста
          await expect(page.getByText(questionText)).toHaveCount(0, { timeout: 10_000 });
        });

        await test.step('Перезагрузить и убедиться, что удаление сохранено', async () => {
          await page.reload();
          await formPage.assertViewOpened();
          await expect(page.getByText(questionText)).toHaveCount(0, { timeout: 10_000 });
        });
      },
    );
  },
);
