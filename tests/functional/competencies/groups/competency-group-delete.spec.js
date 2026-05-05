// tests/functional/competencies/groups/competency-group-delete.spec.js
import { test } from '../../../fixtures/auth.js';
import { CompetenciesLibraryPage } from '../../../../pages/CompetenciesLibraryPage.js';
import { CompetenciesAPI } from '../../../utils/api/CompetenciesAPI.js';
import { getCredentials } from '../../../utils/credentials.js';
import { markAsUITest, MODULES, setSeverity } from '../../../utils/allure-helpers.js';

test.describe(
  'Компетенции — Группы компетенций',
  { tag: ['@competencies', '@regression', '@ui'] },
  () => {
    let api;
    let groupId = null;
    let groupName = null;
    let deleted = false;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials('admin');
      api = new CompetenciesAPI(request);
      await api.signIn(email, password);

      groupName = `Test Group Delete ${Date.now()}`;
      const { data } = await api.createCompetenceGroup(groupName);
      if (!data?.id) {
        throw new Error('Не удалось создать группу компетенций для теста удаления');
      }
      groupId = data.id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.COMPETENCIES, 'Группы компетенций');
    });

    test.afterAll(async () => {
      // Удаляем группу через API только если тест не удалил её через UI
      if (!deleted && groupId && api) {
        try {
          await api.deleteCompetenceGroup(groupId);
        } catch {
          // Группа уже удалена или не существует — игнорируем
        }
      }
    });

    test('C9188: Удалить пустую группу компетенций', async ({ adminAuth: page }, testInfo) => {
      setSeverity('normal');

      const libraryPage = new CompetenciesLibraryPage(page, testInfo);

      await test.step('Открыть библиотеку компетенций', async () => {
        await libraryPage.goto();
      });

      await test.step('Проверить, что группа присутствует в списке', async () => {
        await libraryPage.assertItemVisible(groupName);
      });

      await test.step('Открыть контекстное меню и выбрать «Удалить»', async () => {
        await libraryPage.deleteGroup(groupName);
        deleted = true;
      });

      await test.step('Проверить, что группа исчезла из списка', async () => {
        await libraryPage.clearSearch();
        await libraryPage.assertItemNotVisible(groupName);
      });

      // Примечание: API getCompetenceGroups может возвращать удалённые группы (soft delete),
      // поэтому API-верификация удаления не добавляется — UI-проверка достаточна
    });
  },
);
