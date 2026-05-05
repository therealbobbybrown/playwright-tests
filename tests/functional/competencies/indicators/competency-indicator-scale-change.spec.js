// tests/functional/competencies/indicators/competency-indicator-scale-change.spec.js
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
    let testScaleId = null;
    let testScaleName = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      // Создаём компетенцию
      const compTitle = `A_ScaleChange ${Date.now()}`;
      const compResult = await api.createCompetency({ title: compTitle, emoji: '📐' });
      const id = compResult.data?.id || compResult.data?.competency?.id;
      if (!id) throw new Error('Не удалось создать компетенцию для теста смены шкалы');
      competencyId = id;

      // Создаём тестовую шкалу для переключения
      testScaleName = `A_ScaleForSwitch ${Date.now()}`;
      const scaleResult = await api.createCompetenceScale({
        title: testScaleName,
        rangeMin: 1,
        rangeMax: 4,
        widget: 'slider',
        rangeMinLabel: 'Низкий',
        rangeMaxLabel: 'Высокий',
        disallowStepNumbers: false,
      });
      const scaleId = scaleResult.data?.id || scaleResult.data?.scale?.id;
      if (!scaleId) throw new Error('Не удалось создать шкалу для теста смены шкалы');
      testScaleId = scaleId;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Indicators');
    });

    test.afterAll(async () => {
      if (competencyId && api) {
        await api.deleteCompetency(competencyId).catch(() => {});
      }
      if (testScaleId && api) {
        await api.deleteCompetenceScale(testScaleId).catch(() => {});
      }
    });

    test(
      'C9325: Изменить шкалу для индикаторов компетенции',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);

        await test.step('Открыть карточку компетенции на вкладке "Вопросы-индикаторы"', async () => {
          await formPage.gotoView(competencyId);
          await formPage.assertViewOpened();
          // Вкладка "Вопросы-индикаторы" открыта по умолчанию
          await page
            .getByRole('button')
            .filter({ hasText: 'Шкала для оценки компетенций' })
            .waitFor({ state: 'visible', timeout: 10_000 });
        });

        await test.step('Нажать кнопку смены шкалы (карандаш рядом с названием шкалы)', async () => {
          // DOM-структура в секции шкалы:
          //   generic (контейнер строки шкалы)
          //     generic > img + button "Шкала для оценки компетенций <name>"
          //     button (карандаш — без текста, класс IndicatorQuestions_scaleIconEdit)
          // Кликаем безымянную кнопку с классом scaleIconEdit
          const pencilButton = page.locator('[class*="scaleIconEdit"]');
          await pencilButton.waitFor({ state: 'visible', timeout: 5000 });
          await pencilButton.click();
        });

        await test.step('Пройти через диалог подтверждения (если есть)', async () => {
          // Если у компетенции уже есть индикаторы — показывается диалог подтверждения
          // "Заменить шкалу для оценки компетенции?" с кнопкой "Изменить шкалу".
          // Если индикаторов нет — диалог пропускается и сразу открывается выбор шкалы.
          const confirmButton = page.getByRole('button', { name: 'Изменить шкалу' });
          const hasConfirmDialog = await confirmButton
            .waitFor({ state: 'visible', timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          if (hasConfirmDialog) {
            await confirmButton.click();
          }
        });

        await test.step(`Выбрать шкалу "${testScaleName}" из списка`, async () => {
          // Открывается диалог/панель "Выбрать шкалу для оценки компетенции"
          await page.getByText('Выбрать шкалу для оценки компетенции').waitFor({
            state: 'visible',
            timeout: 10_000,
          });
          // Шкалы отображаются как кнопки с именем
          const scaleOptionButton = page.getByRole('button', { name: testScaleName });
          await scaleOptionButton.waitFor({ state: 'visible', timeout: 10_000 });
          await scaleOptionButton.click();
        });

        await test.step('Нажать "Выбрать" для применения новой шкалы', async () => {
          await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
          // Ждём закрытия диалога выбора шкалы
          await page
            .getByText('Выбрать шкалу для оценки компетенции')
            .waitFor({ state: 'hidden', timeout: 10_000 });
          await page.waitForLoadState('networkidle');
        });

        await test.step('Проверить, что новая шкала отображается в карточке компетенции', async () => {
          // Кнопка шкалы на вкладке индикаторов содержит текст новой шкалы
          await expect(
            page.getByRole('button').filter({ hasText: testScaleName }).first(),
          ).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Подтвердить смену шкалы через API', async () => {
          // Используем отдельный API-клиент с request из теста (не из beforeAll)
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(competencyId);
          expect(data?.scaleId, 'scaleId компетенции должен совпадать с ID новой шкалы').toBe(
            testScaleId,
          );
        });
      },
    );
  },
);
