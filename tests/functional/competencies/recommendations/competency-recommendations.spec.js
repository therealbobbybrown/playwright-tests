// tests/functional/competencies/recommendations/competency-recommendations.spec.js
import { expect } from '@playwright/test';
import { test } from '../../../fixtures/auth.js';
import { CompetencyFormPage } from '../../../../pages/CompetencyFormPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Рекомендации',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let competencyId = null;
    const goodText = 'Рекомендация сильная сторона автотест';
    const badText = 'Рекомендация зона роста автотест';

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      // Создаём компетенцию с рекомендациями через API
      const title = `A_Recommendations ${Date.now()}`;
      const { data } = await api.createCompetency({ title, emoji: '💡' });
      const id = data?.id || data?.competency?.id;
      if (!id) throw new Error('Не удалось создать компетенцию');
      competencyId = id;

      // Устанавливаем рекомендации через API
      await api.updateCompetency(competencyId, {
        goodRecommendation: goodText,
        badRecommendation: badText,
      });
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Recommendations');
    });

    test.afterAll(async () => {
      if (competencyId && api) {
        try {
          await api.deleteCompetency(competencyId);
        } catch (e) {
          console.warn(`[afterAll] cleanup: ${e.message}`);
        }
      }
    });

    test('C9320: Проверить отображение рекомендаций на вкладке карточки компетенции',
      { tag: ['@critical'] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity('critical');
        const formPage = new CompetencyFormPage(page, testInfo);

        await test.step('Открыть карточку компетенции', async () => {
          await formPage.gotoView(competencyId);
        });

        await test.step('Перейти на вкладку "Рекомендации"', async () => {
          await formPage.recommendationsTab.waitFor({ state: 'visible', timeout: 10_000 });
          await formPage.recommendationsTab.click();
        });

        await test.step('Проверить, что рекомендация "сильная сторона" отображается', async () => {
          await expect(page.getByText(goodText).first()).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Проверить, что рекомендация "зона роста" отображается', async () => {
          await expect(page.getByText(badText).first()).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Проверить заголовки секций', async () => {
          await expect(page.getByText('Если компетенция является сильной стороной')).toBeVisible();
          await expect(page.getByText('Если компетенция является зоной роста')).toBeVisible();
        });

        await test.step('Проверить данные через API', async () => {
          const { email, password } = getCredentials('admin');
          const testApi = new CompetenciesAPI(request);
          await testApi.signIn(email, password);
          const { data } = await testApi.getCompetency(competencyId);
          expect(data?.goodRecommendation, 'goodRecommendation должен совпадать').toBe(goodText);
          expect(data?.badRecommendation, 'badRecommendation должен совпадать').toBe(badText);
        });
      },
    );
  },
);
