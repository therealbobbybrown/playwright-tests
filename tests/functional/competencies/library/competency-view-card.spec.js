// tests/functional/competencies/library/competency-view-card.spec.js
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
    let competencyTitle = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      competencyTitle = `View Card Test ${Date.now()}`;
      const { data } = await api.createCompetency({
        title: competencyTitle,
        description: 'Описание для теста просмотра карточки',
        emoji: '🎯',
        forFeedback: true,
      });
      const id = data?.id || data?.competency?.id;
      if (!id) {
        throw new Error('Не удалось создать компетенцию для теста просмотра карточки');
      }
      competencyId = id;

      // Обновить рекомендации
      await api.updateCompetency(competencyId, {
        goodRecommendation: 'Рекомендация при сильной стороне',
        badRecommendation: 'Рекомендация при зоне роста',
      });
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

    test('C9259: Просмотреть карточку компетенции со всеми данными',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');

        const formPage = new CompetencyFormPage(page, testInfo);

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
        });

        await test.step('Проверить, что название компетенции отображается', async () => {
          await expect(page.getByText(competencyTitle).first()).toBeVisible();
        });

        await test.step('Проверить, что описание отображается', async () => {
          await expect(page.getByText('Описание для теста просмотра карточки')).toBeVisible();
        });

        await test.step('Проверить наличие вкладки "Вопросы-индикаторы"', async () => {
          await expect(formPage.indicatorsTab).toBeVisible();
        });

        await test.step('Проверить наличие вкладки "Развивающие действия"', async () => {
          await expect(formPage.devActionsTab).toBeVisible();
        });

        await test.step('Проверить наличие вкладки "Рекомендации"', async () => {
          await expect(formPage.recommendationsTab).toBeVisible();
        });

        await test.step('Перейти на вкладку "Рекомендации" и проверить тексты', async () => {
          await formPage.recommendationsTab.click();
          await expect(page.getByText('Рекомендация при сильной стороне')).toBeVisible();
          await expect(page.getByText('Рекомендация при зоне роста')).toBeVisible();
        });

        await test.step('Проверить данные через API', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(competencyId);
          expect(
            data?.title,
            `Ожидалось title="${competencyTitle}", получено: ${data?.title}`,
          ).toBe(competencyTitle);
          expect(
            data?.description,
            `Ожидалось description="Описание для теста просмотра карточки", получено: ${data?.description}`,
          ).toBe('Описание для теста просмотра карточки');
          expect(
            data?.forFeedback,
            `Ожидалось forFeedback=true, получено: ${data?.forFeedback}`,
          ).toBe(true);
          expect(
            data?.goodRecommendation,
            `Ожидалось goodRecommendation="Рекомендация при сильной стороне", получено: ${data?.goodRecommendation}`,
          ).toBe('Рекомендация при сильной стороне');
          expect(
            data?.badRecommendation,
            `Ожидалось badRecommendation="Рекомендация при зоне роста", получено: ${data?.badRecommendation}`,
          ).toBe('Рекомендация при зоне роста');
        });
      },
    );
  },
);
