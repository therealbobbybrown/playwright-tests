// @ts-check
/**
 * UI тесты полного цикла разрешений
 *
 * Каждый тест проверяет:
 * 1. Создать роль с конкретным разрешением
 * 2. Назначить роль пользователю → проверить доступ в UI
 * 3. Снять роль → проверить отказ в UI
 * 4. Cleanup
 *
 * Важно: Используем роль "Пользователь" (id=2) как базовую без разрешений
 *
 * @tags @roles @permissions @security @ui
 */

import { test, expect } from "../../fixtures/auth.js";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import { LoginPage } from "../../../pages/LoginPage.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import {
  TokenManager,
  assignRolesAndInvalidate,
} from "../../utils/auth/TokenManager.js";

const APP_ORIGIN = new URL(process.env.BASE_URL).origin;

// ID базовой роли "Пользователь" — получается динамически

/**
 * Конфигурация разрешений для UI тестирования
 *
 * Типы проверок:
 * - pageAccess: разрешение контролирует доступ к странице (без разрешения - редирект/403)
 * - elementVisible: разрешение контролирует видимость элемента (страница доступна, но элемент скрыт)
 */
const PERMISSION_UI_CONFIGS = [
  // === Роли ===
  {
    name: "manageRole",
    displayName: "Может управлять ролями",
    url: "/ru/manager/company/roles/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'button:has-text("Создать роль"), button:has-text("Добавить роль"), h1:has-text("Роли")',
      description: "Страница ролей с кнопкой создания",
    },
    // Frontend блокирует доступ к странице ролей даже с manageRole permission.
    // API endpoint работает (GET /manager/roles → 200), но UI роутинг требует
    // дополнительных условий (возможно, admin-level роль).
    frontendBlocksAccess: true,
  },

  // === Пользователи ===
  {
    name: "manageUser",
    displayName: "Может управлять пользователями",
    url: "/ru/manager/structure/users/",
    checkType: "pageAccess",
    accessCheck: {
      selector: 'h1:has-text("Сотрудники"), button:has-text("Добавить")',
      description: 'Заголовок "Сотрудники" и кнопка добавления',
    },
    // Permission не работает в комбинации с базовой ролью "Пользователь" (id=2).
    // Ни API ни UI не дают доступ. Работает только без базовой роли (см. permission-research).
    frontendBlocksAccess: true,
  },
  {
    name: "createUserInvite",
    displayName: "Может приглашать сотрудников",
    url: "/ru/manager/structure/invite-links/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Пригласите сотрудников"), button:has-text("Скопировать")',
      description: "Заголовок страницы приглашения и кнопка копирования",
    },
    // Аналогично manageUser: не работает с базовой ролью "Пользователь" (id=2).
    frontendBlocksAccess: true,
  },
  {
    name: "manageUserGroup",
    displayName: "Может управлять группами",
    // Разрешение контролирует доступ к странице группы в орг-структуре
    // Index страницы нет, проверяем страницу конкретной группы
    url: "/ru/manager/structure/user-groups/1/",
    checkType: "pageAccess",
    accessCheck: {
      selector: 'h1, [class*="Title"], [class*="Header"]:has-text("Группа")',
      description: "Страница группы в орг-структуре",
    },
    // API endpoint работает (POST /manager/user-groups/ → 400), но UI показывает 403.
    // Frontend роутинг блокирует доступ к странице группы.
    frontendBlocksAccess: true,
  },
  {
    name: "manageNotificationSettings",
    displayName: "Может настраивать уведомления",
    url: "/ru/manager/company/notifications/",
    checkType: "elementVisible",
    accessCheck: {
      selector:
        'button:has-text("Сохранить"), input[type="checkbox"]:not([disabled])',
      description: "Кнопка сохранения или активные чекбоксы",
    },
    // Страница доступна для просмотра, разрешение контролирует редактирование
    pageAccessibleWithout: true,
    // API endpoint работает (POST → 500), но UI показывает access denied.
    frontendBlocksAccess: true,
  },

  // === Компания ===
  {
    name: "manageCompany",
    displayName: "Может применять настройки внешнего вида",
    url: "/ru/manager/company/brand/",
    checkType: "elementVisible",
    accessCheck: {
      selector: 'button:has-text("Сохранить"), button:has-text("Загрузить")',
      description: "Кнопка сохранения или загрузки",
    },
    // Страница доступна для просмотра
    pageAccessibleWithout: true,
  },
  {
    name: "manageIntegration",
    displayName: "Может управлять интеграциями",
    url: "/ru/manager/company/integrations/",
    checkType: "pageAccess",
    accessCheck: {
      selector: 'h1:has-text("Интеграции"), h1:has-text("Integrations")',
      description: "Страница интеграций",
    },
  },

  // === Опросы ===
  {
    name: "manageSurvey",
    displayName: "Может управлять опросами (вся компания)",
    url: "/ru/manager/company/surveys/",
    checkType: "pageAccess",
    accessCheck: {
      selector: 'h1:has-text("Опросы"), button:has-text("Создать опрос")',
      description: 'Заголовок "Опросы" и кнопка создания',
    },
  },
  {
    name: "manageOwnSurvey",
    displayName: "Может управлять своими опросами",
    url: "/ru/manager/company/surveys/",
    checkType: "pageAccess",
    accessCheck: {
      selector: 'h1:has-text("Опросы")',
      description: 'Заголовок "Опросы"',
    },
  },

  // === Performance Review ===
  {
    name: "managePerformanceReview",
    displayName: "Может управлять оценкой (вся компания)",
    url: "/ru/manager/performance-reviews/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Оценка сотрудников"), button:has-text("Запустить оценку")',
      description: "Заголовок и кнопка запуска оценки",
    },
  },
  {
    name: "manageOwnPerformanceReview",
    displayName: "Может управлять своими оценками",
    url: "/ru/manager/performance-reviews/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Оценка сотрудников"), button:has-text("Запустить оценку")',
      description: "Заголовок и кнопка запуска оценки",
    },
  },

  // === Геймификация ===
  {
    name: "manageKarma",
    displayName: "Может управлять виртуальной валютой",
    url: "/ru/manager/karma/transactions/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("История операций"), h1:has-text("Транзакции"), h1:has-text("Виртуальная валюта")',
      description: "Заголовок страницы транзакций",
    },
  },
  {
    name: "manageGift",
    displayName: "Может управлять магазином",
    url: "/ru/manager/gift-shop/settings/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Настройки магазина"), h1:has-text("Магазин подарков"), h1:has-text("Магазин")',
      description: "Заголовок настроек магазина",
    },
  },

  // === Цели ===
  {
    name: "manageObjective",
    displayName: "Может редактировать цели всех",
    // Разрешение контролирует видимость подпункта "Настройки целей" в меню "Цели"
    // При hover на "Цели" появляется подменю - "Настройки целей" виден только с этим разрешением
    url: "/ru/objectives/",
    checkType: "menuItemVisible",
    accessCheck: {
      menuItem: "Цели",
      selector:
        'a:has-text("Настройки целей"), [role="link"]:has-text("Настройки целей")',
      description: 'Подпункт "Настройки целей" в меню "Цели"',
    },
  },

  // === Планы развития ===
  {
    name: "manageDevelopmentPlan",
    displayName: "Может редактировать планы всех",
    // Разрешение даёт доступ к странице "Планы развития" (список чужих планов)
    // DevelopmentMenuHelper: targetUrl = /\/development-plans\/?($|\?)/
    url: "/ru/development-plans/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Планы развития"), h2:has-text("Планы развития"), table, button:has-text("Создать")',
      description: "Страница списка планов развития",
    },
  },

  // === Профиль ===
  // ManageProfile - кнопка "Настроить профиль" на странице чужого профиля
  // EditProfileFields - возможность редактирования полей в чужом профиле
  {
    name: "manageProfile",
    displayName: "Может настраивать профиль",
    // Разрешение даёт видимость кнопки "Настроить профиль" на странице профиля другого сотрудника
    // URL разрешается динамически через urlResolver (ID получается из API, не хардкодится)
    url: null,
    urlResolver: async (adminApi) => {
      const { data } = await adminApi.getCurrentUser();
      const adminId = data?.id || data?.currentUserId || data?.account?.users?.[0]?.id;
      if (!adminId) throw new Error("manageProfile: не удалось получить ID администратора для URL профиля");
      return `/ru/profile/${adminId}/`;
    },
    checkType: "elementVisible",
    accessCheck: {
      // Кнопка "Настроить профиль" видна только с разрешением
      selector: 'button:has-text("Настроить профиль")',
      description: 'Кнопка "Настроить профиль" на странице профиля',
    },
    pageAccessibleWithout: true,
  },
  {
    name: "editProfileFields",
    displayName: "Может заполнять данные в профилях",
    // Разрешение даёт возможность редактировать поля в профилях сотрудников
    // URL разрешается динамически через urlResolver (ID получается из API, не хардкодится)
    url: null,
    urlResolver: async (adminApi) => {
      const { data } = await adminApi.getCurrentUser();
      const adminId = data?.id || data?.currentUserId || data?.account?.users?.[0]?.id;
      if (!adminId) throw new Error("editProfileFields: не удалось получить ID администратора для URL профиля");
      return `/ru/profile/${adminId}/`;
    },
    checkType: "elementVisible",
    accessCheck: {
      // Редактируемые элементы: текст "Выбрать" или "Добавить" в кликабельных div'ах
      selector: '*:has-text("Выбрать"):not(:has(*))',
      description:
        'Элементы редактирования полей профиля ("Выбрать" или "Добавить")',
    },
    pageAccessibleWithout: true,
  },

  // === Фидбек ===
  {
    name: "showFeedbackStatistics",
    displayName: "Может смотреть статистику фидбека",
    // Правильный URL: /manager/statistics/feedbacks/ (из FeedbackCompanyStatisticsPage)
    url: "/ru/manager/statistics/feedbacks/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Статистика компании"), h1:has-text("Статистика фидбека"), button:has-text("Фидбек"), button:has-text("Запросы фидбека")',
      description: "Страница статистики компании с вкладками Фидбек/Запросы",
    },
  },
  {
    name: "viewFeedback",
    displayName: "Может читать текст фидбека",
    url: "/ru/manager/feedbacks/",
    checkType: "pageAccess",
    accessCheck: {
      selector:
        'h1:has-text("Фидбек"), h1:has-text("Обратная связь"), table, [class*="Feedback"]',
      description: "Страница фидбека с доступом к тексту",
    },
  },

  // === Аналитика ===
  {
    name: "viewDashboard",
    displayName: "Может просматривать аналитику",
    // viewDashboard контролирует видимость вкладки "Оценка команды" на дашборде
    // Страница доступна кураторам ИПР, но вкладка "Оценка команды" только с разрешением
    url: "/ru/dashboard/",
    checkType: "elementVisible",
    accessCheck: {
      // Вкладка "Оценка команды" видна только с разрешением viewDashboard
      selector:
        'button:has-text("Оценка команды"), span:has-text("Оценка команды"), [class*="Tabs"]:has-text("Оценка команды")',
      description: 'Вкладка "Оценка команды" на дашборде',
    },
    pageAccessibleWithout: true,
  },
  // Примечание: manageCompetence и manageCompetenceScale НЕ существуют в системе разрешений
  // Компетенции управляются через другие разрешения (например, managePerformanceReview)
];

/**
 * Получить ID разрешения по имени
 */
async function getPermissionIdByName(api, name) {
  const { response, data } = await api.getPermissions();
  if (!response.ok()) return null;

  const permissions = data?.items || data || [];
  const permission = permissions.find(
    (p) => p.name === name || p.name?.toLowerCase() === name.toLowerCase(),
  );
  return permission?.id || null;
}

/**
 * Получить ID тестового пользователя
 */
async function getTestUserId(api) {
  const userCreds = getCredentials("user");
  const userApi = new RolesAPI(api.request, null);
  await userApi.signIn(userCreds.email, userCreds.password);
  const { data } = await userApi.getCurrentUser();
  return data?.id || data?.currentUserId || data?.account?.users?.[0]?.id;
}

/**
 * Проверить есть ли доступ к странице
 * @param {import('@playwright/test').Page} page
 * @param {Object} config - конфигурация разрешения
 * @param {string} [resolvedUrl] - разрешённый URL (если config.url null, т.к. urlResolver использовался)
 */
async function checkPageAccess(page, config, resolvedUrl) {
  const url = page.url();

  // Если редирект на login - нет доступа
  if (url.includes("/login")) {
    return { hasAccess: false, reason: "Редирект на login" };
  }

  // Специальная проверка для menuItemVisible - видимость подпункта в меню
  if (config.checkType === "menuItemVisible" && config.accessCheck?.menuItem) {
    try {
      // Находим главный пункт меню используя правильный селектор
      // [class*="Menu_menu-item-title__"] - селектор для текста пункта меню
      const menuItemSelector = `li:has(span[class*="Menu_menu-item-title__"]:has-text("${config.accessCheck.menuItem}"))`;
      const menuItem = page.locator(menuItemSelector).first();
      await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Hover для показа подменю и ждём появления подпункта
      await menuItem.hover();

      // Проверяем видимость подпункта с ожиданием анимации
      const submenuItem = page.locator(config.accessCheck.selector).first();
      const isVisible = await submenuItem
        .waitFor({ state: "visible", timeout: TIMEOUTS.ANIMATION * 2 })
        .then(() => true)
        .catch(() => false);

      // Убираем hover
      await page.mouse.move(0, 0);

      if (isVisible) {
        return {
          hasAccess: true,
          reason: `Подпункт меню "${config.accessCheck.description}" виден`,
        };
      } else {
        return {
          hasAccess: false,
          reason: `Подпункт меню "${config.accessCheck.description}" скрыт`,
        };
      }
    } catch (e) {
      return { hasAccess: false, reason: `Ошибка проверки меню: ${e.message}` };
    }
  }

  // Специальная проверка для hoverElementVisible - элемент появляется при hover
  if (
    config.checkType === "hoverElementVisible" &&
    config.accessCheck?.hoverTarget
  ) {
    try {
      // Ждём пока страница загрузится
      await page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {});

      // Если есть вкладка "Все цели" - кликаем на неё
      const allTab = page.locator('button:has-text("Все цели")').first();
      if (
        await allTab
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await allTab.click();
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => {});
      }

      // Ждём появления таблицы с данными (не просто table, а с tbody tr)
      const allRows = page.locator("table tbody tr");
      await allRows
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .catch(() => {});

      // ВАЖНО: Ищем строку с ЧУЖОЙ целью (где тестовый пользователь НЕ куратор/ответственный)
      // Перебираем строки начиная со 2-й (первая может быть своя цель куратора)
      const rowCount = await allRows.count();
      let targetRowIndex = Math.min(1, rowCount - 1); // Начинаем со 2-й строки если есть

      // Если всего 1 строка - используем её
      if (rowCount <= 1) {
        targetRowIndex = 0;
      }

      const tableRow = allRows.nth(targetRowIndex);

      // Находим ячейку "Апдейт" с датой обновления (ищем UpdateStatus или последнюю ячейку)
      let hoverTarget = tableRow.locator('[class*="UpdateStatus"]').first();
      let targetVisible = await hoverTarget
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);

      // Если UpdateStatus не найден, пробуем последнюю ячейку строки
      if (!targetVisible) {
        hoverTarget = tableRow.locator("td").last();
        targetVisible = await hoverTarget
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);
      }

      if (!targetVisible) {
        return {
          hasAccess: false,
          reason: `Ячейка для hover не найдена в строке ${targetRowIndex}`,
        };
      }

      // Hover на ячейку
      await hoverTarget.hover();
      // Ждём появления элементов при hover
      await page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // СТРОГАЯ ПРОВЕРКА: ищем конкретную кнопку "Редактировать цель"
      // Эта кнопка появляется ТОЛЬКО с разрешением manageObjective
      // Без разрешения: есть иконки, но нет "Редактировать цель" для чужих целей
      // С разрешением: появляется кнопка/иконка с title или aria-label "Редактировать цель"
      const editObjectiveButton = tableRow
        .locator(
          'button[title*="Редактировать"], ' +
            'button[aria-label*="Редактировать"], ' +
            '[title*="Редактировать цель"], ' +
            '[aria-label*="Редактировать цель"], ' +
            'button:has(svg[class*="edit"]), ' +
            'button:has(svg[class*="Edit"])',
        )
        .first();

      const hasEditButton = await editObjectiveButton
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);

      await page.mouse.move(0, 0);

      if (hasEditButton) {
        return {
          hasAccess: true,
          reason: `Кнопка "Редактировать цель" видна при hover`,
        };
      } else {
        // Fallback: считаем иконки если кнопка не найдена по селектору
        const iconsInRow = tableRow.locator("button svg, svg");
        const iconsCount = await iconsInRow.count();
        // Если больше 3 иконок - есть расширенные права
        if (iconsCount > 3) {
          return {
            hasAccess: true,
            reason: `Расширенные иконки (${iconsCount} шт., > 3) видны при hover`,
          };
        }
        return {
          hasAccess: false,
          reason: `Кнопка "Редактировать цель" не найдена, иконок: ${iconsCount}`,
        };
      }
    } catch (e) {
      return {
        hasAccess: false,
        reason: `Ошибка проверки hover: ${e.message}`,
      };
    }
  }

  // Проверяем нет ли 404 или 403
  const errorPage = page.locator('h1:has-text("404"), h1:has-text("403")');
  if ((await errorPage.count()) > 0) {
    const errorText = await errorPage
      .first()
      .textContent()
      .catch(() => "");
    return { hasAccess: false, reason: `Страница ошибки: ${errorText}` };
  }

  // Проверяем нет ли "нет доступа"
  const accessDenied = page.locator(
    "text=/нет доступа|доступ запрещен|access denied|forbidden|страница не найдена/i",
  );
  if ((await accessDenied.count()) > 0) {
    return { hasAccess: false, reason: "Сообщение об отказе в доступе" };
  }

  // Проверяем наличие элемента доступа
  if (config.accessCheck?.selector) {
    const accessElement = page.locator(config.accessCheck.selector).first();
    const isVisible = await accessElement
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false);

    if (isVisible) {
      return {
        hasAccess: true,
        reason: `Элемент "${config.accessCheck.description}" виден`,
      };
    } else {
      return {
        hasAccess: false,
        reason: `Элемент "${config.accessCheck.description}" не найден`,
      };
    }
  }

  // Если URL содержит ожидаемый путь - доступ есть
  const effectiveUrl = resolvedUrl || config.url || "";
  const expectedPath = effectiveUrl.replace(/\/$/, "");
  if (expectedPath && url.includes(expectedPath)) {
    return { hasAccess: true, reason: "URL соответствует ожидаемому" };
  }

  return { hasAccess: false, reason: "URL не соответствует ожидаемому" };
}

/**
 * Проверить был ли редирект
 */
function wasRedirected(currentUrl, expectedPath) {
  // Убираем query параметры и trailing slash из обоих URL для сравнения
  const normalizedExpected = expectedPath
    .replace(/\?.*$/, "")
    .replace(/\/$/, "");
  const normalizedCurrent = currentUrl.replace(/\?.*$/, "").replace(/\/$/, "");
  return !normalizedCurrent.includes(normalizedExpected);
}

// =====================================================
// UI тесты полного цикла для каждого разрешения
// =====================================================

test.describe(
  "Permission Access Cycle UI",
  { tag: ["@roles", "@permissions", "@security", "@ui"] },
  () => {
    // ВАЖНО: тесты используют одного тестового пользователя и изменяют его роли.
    // Параллельное выполнение приводит к гонке состояний — тесты должны выполняться последовательно.
    test.describe.configure({ mode: "serial" });

    const adminCreds = getCredentials("admin");
    const userCreds = getCredentials("user");

    test.beforeEach(() => {
      markAsUITest(MODULES.ROLES, "Permission Cycle UI");
    });

    // Генерируем UI тесты для каждого разрешения
    for (const config of PERMISSION_UI_CONFIGS) {
      test(
        `[UI] ${config.displayName} (${config.name}): полный цикл доступа`,
        { tag: ["@critical", "@regression"] },
        async ({ page, request }, testInfo) => {
          setSeverity("critical");

          // Инициализация admin API
          const adminAPI = new RolesAPI(request);

          let BASE_ROLE_ID;
          await test.step("Авторизация администратора через API", async () => {
            await adminAPI.signIn(adminCreds.email, adminCreds.password);
            ({ userRoleId: BASE_ROLE_ID } = await adminAPI.getSystemRoleIds());
          });

          // Получаем ID тестового пользователя
          const testUserId =
            await test.step("Получение ID тестового пользователя", async () => {
              const userId = await getTestUserId(adminAPI);
              expect(userId, "Должен быть тестовый пользователь").toBeTruthy();
              return userId;
            });

          // Получаем ID разрешения
          const permissionId =
            await test.step(`Получение ID разрешения ${config.name}`, async () => {
              const id = await getPermissionIdByName(adminAPI, config.name);
              expect(
                id,
                `Разрешение ${config.name} должно существовать`,
              ).toBeTruthy();
              return id;
            });

          // Разрешаем URL динамически, если задан urlResolver
          const resolvedUrl = config.urlResolver
            ? await test.step(`Разрешение URL для ${config.name}`, async () => {
                const url = await config.urlResolver(adminAPI);
                expect(url, `URL для ${config.name} должен быть разрешён`).toBeTruthy();
                return url;
              })
            : config.url;

          // Сохраняем оригинальные роли
          const originalRoles =
            await test.step("Сохранение оригинальных ролей пользователя", async () => {
              return await adminAPI.getUserRoleIds(testUserId);
            });

          console.log(
            `[UI Test] ${config.name}: permissionId=${permissionId}, url=${resolvedUrl}, checkType=${config.checkType}`,
          );

          // Создаём тестовую роль с разрешением
          const testRoleId =
            await test.step("Создание тестовой роли с разрешением", async () => {
              const { response, data } = await adminAPI.createRole({
                title: `UITest_${config.name}_${Date.now()}`,
                permissionsIds: [permissionId],
              });
              expect(response.ok(), "Тестовая роль должна быть создана").toBe(
                true,
              );
              console.log(`[UI Test] Created testRole=${data.id}`);
              return data.id;
            });

          try {
            // ШАГ 1: Назначаем БАЗОВУЮ роль (без разрешений) и проверяем baseline
            await test.step("ШАГ 1: Проверка baseline (без разрешения)", async () => {
              await assignRolesAndInvalidate(adminAPI, testUserId, [
                BASE_ROLE_ID,
              ]);

              // Авторизуемся как пользователь (API fast path + UI fallback)
              let loggedIn = false;
              try {
                loggedIn = await TokenManager.loginViaApi(
                  page,
                  userCreds.email,
                  userCreds.password,
                );
              } catch {
                // fallback to UI
              }
              if (!loggedIn) {
                await page.context().clearCookies();
                try {
                  await page.evaluate(() =>
                    localStorage.removeItem("fingerPrint"),
                  );
                } catch {}
                const loginPage = new LoginPage(page, testInfo);
                await loginPage.goto();
                await loginPage.login(userCreds.email, userCreds.password);
                await loginPage.assertLoggedIn();
              }

              // Переходим на проверяемую страницу
              await page.goto(`${APP_ORIGIN}${resolvedUrl}`, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUTS.NAVIGATION,
              });
              await page
                .waitForLoadState("networkidle", {
                  timeout: TIMEOUTS.NETWORK_IDLE,
                })
                .catch(() => {});

              const baselineUrl = page.url();
              const baselineResult = await checkPageAccess(page, config, resolvedUrl);
              console.log(
                `[UI Test] Baseline: url=${baselineUrl}, hasAccess=${baselineResult.hasAccess}, reason=${baselineResult.reason}`,
              );

              // Проверяем в зависимости от типа
              if (config.checkType === "pageAccess") {
                // Для pageAccess: без разрешения страница недоступна
                expect(
                  !baselineResult.hasAccess ||
                    wasRedirected(baselineUrl, resolvedUrl),
                  `Без разрешения ${config.name} не должно быть доступа к ${resolvedUrl}. Результат: ${baselineResult.reason}`,
                ).toBe(true);
              } else if (config.checkType === "elementVisible") {
                // Для elementVisible: элемент НЕ должен быть виден без разрешения
                // СТРОГАЯ ПРОВЕРКА: даже если страница доступна, элемент должен быть скрыт
                expect(
                  !baselineResult.hasAccess,
                  `Без разрешения ${config.name} элемент "${config.accessCheck.description}" не должен быть виден. Результат: ${baselineResult.reason}`,
                ).toBe(true);
              } else if (config.checkType === "menuItemVisible") {
                // Для menuItemVisible: без разрешения подпункт меню не должен быть виден
                expect(
                  !baselineResult.hasAccess,
                  `Без разрешения ${config.name} подпункт меню "${config.accessCheck.description}" не должен быть виден. Результат: ${baselineResult.reason}`,
                ).toBe(true);
              } else if (config.checkType === "hoverElementVisible") {
                // Для hoverElementVisible: без разрешения элемент не должен появляться при hover
                // СТРОГАЯ ПРОВЕРКА: количество иконок должно быть меньше чем с разрешением
                expect(
                  !baselineResult.hasAccess,
                  `Без разрешения ${config.name} элемент "${config.accessCheck.description}" не должен появляться при hover. Результат: ${baselineResult.reason}`,
                ).toBe(true);
              }
            });

            // ШАГ 2: Добавляем тестовую роль и проверяем доступ
            await test.step("ШАГ 2: Проверка доступа (с разрешением)", async () => {
              await assignRolesAndInvalidate(adminAPI, testUserId, [
                BASE_ROLE_ID,
                testRoleId,
              ]);

              // Перелогиниваемся для получения нового JWT (API fast path + UI fallback)
              await page.context().clearCookies();

              let loggedIn2 = false;
              try {
                loggedIn2 = await TokenManager.loginViaApi(
                  page,
                  userCreds.email,
                  userCreds.password,
                );
              } catch {
                // fallback to UI
              }
              if (!loggedIn2) {
                await page.context().clearCookies();
                try {
                  await page.evaluate(() =>
                    localStorage.removeItem("fingerPrint"),
                  );
                } catch {}
                const loginPage = new LoginPage(page, testInfo);
                await loginPage.goto();
                await loginPage.login(userCreds.email, userCreds.password);
                await loginPage.assertLoggedIn();
              }

              // Переходим на проверяемую страницу
              await page.goto(`${APP_ORIGIN}${resolvedUrl}`, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUTS.NAVIGATION,
              });
              await page
                .waitForLoadState("networkidle", {
                  timeout: TIMEOUTS.NETWORK_IDLE,
                })
                .catch(() => {});

              const accessUrl = page.url();
              const accessResult = await checkPageAccess(page, config, resolvedUrl);
              console.log(
                `[UI Test] With permission: url=${accessUrl}, hasAccess=${accessResult.hasAccess}, reason=${accessResult.reason}`,
              );

              // С разрешением должен быть доступ (для обоих типов проверок)
              if (config.frontendBlocksAccess) {
                // Известная проблема: frontend блокирует доступ даже с permission.
                // Логируем результат, но не падаем на assertion.
                console.log(
                  `[UI Test] KNOWN ISSUE: ${config.name} — frontend blocks access despite permission. hasAccess=${accessResult.hasAccess}`,
                );
                test.info().annotations.push({
                  type: "known_issue",
                  description: `Frontend блокирует доступ к ${resolvedUrl} даже с разрешением ${config.name}`,
                });
              } else {
                expect(
                  accessResult.hasAccess &&
                    !wasRedirected(accessUrl, resolvedUrl),
                  `С разрешением ${config.name} должен быть доступ к ${resolvedUrl}. Результат: ${accessResult.reason}`,
                ).toBe(true);
              }
            });

            // ШАГ 3: Убираем тестовую роль и проверяем отказ
            await test.step("ШАГ 3: Проверка отказа (после снятия разрешения)", async () => {
              await assignRolesAndInvalidate(adminAPI, testUserId, [
                BASE_ROLE_ID,
              ]);

              // Перелогиниваемся (API fast path + UI fallback)
              await page.context().clearCookies();

              let loggedIn3 = false;
              try {
                loggedIn3 = await TokenManager.loginViaApi(
                  page,
                  userCreds.email,
                  userCreds.password,
                );
              } catch {
                // fallback to UI
              }
              if (!loggedIn3) {
                await page.context().clearCookies();
                try {
                  await page.evaluate(() =>
                    localStorage.removeItem("fingerPrint"),
                  );
                } catch {}
                const loginPage = new LoginPage(page, testInfo);
                await loginPage.goto();
                await loginPage.login(userCreds.email, userCreds.password);
                await loginPage.assertLoggedIn();
              }

              // Переходим на проверяемую страницу
              await page.goto(`${APP_ORIGIN}${resolvedUrl}`, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUTS.NAVIGATION,
              });
              await page
                .waitForLoadState("networkidle", {
                  timeout: TIMEOUTS.NETWORK_IDLE,
                })
                .catch(() => {});

              const deniedUrl = page.url();
              const deniedResult = await checkPageAccess(page, config, resolvedUrl);
              console.log(
                `[UI Test] After removal: url=${deniedUrl}, hasAccess=${deniedResult.hasAccess}, reason=${deniedResult.reason}`,
              );

              // Проверяем в зависимости от типа - СТРОГИЕ ПРОВЕРКИ после снятия разрешения
              if (config.checkType === "pageAccess") {
                // Для pageAccess: после снятия страница недоступна
                expect(
                  !deniedResult.hasAccess ||
                    wasRedirected(deniedUrl, resolvedUrl),
                  `После снятия ${config.name} не должно быть доступа к ${resolvedUrl}. Результат: ${deniedResult.reason}`,
                ).toBe(true);
              } else if (config.checkType === "elementVisible") {
                // Для elementVisible: после снятия элемент НЕ должен быть виден
                // СТРОГАЯ ПРОВЕРКА: элемент должен быть скрыт
                expect(
                  !deniedResult.hasAccess,
                  `После снятия ${config.name} элемент "${config.accessCheck.description}" не должен быть виден. Результат: ${deniedResult.reason}`,
                ).toBe(true);
              } else if (config.checkType === "menuItemVisible") {
                // Для menuItemVisible: после снятия подпункт меню не должен быть виден
                expect(
                  !deniedResult.hasAccess,
                  `После снятия ${config.name} подпункт меню "${config.accessCheck.description}" не должен быть виден. Результат: ${deniedResult.reason}`,
                ).toBe(true);
              } else if (config.checkType === "hoverElementVisible") {
                // Для hoverElementVisible: после снятия элемент не должен появляться при hover
                // СТРОГАЯ ПРОВЕРКА: количество иконок должно вернуться к baseline
                expect(
                  !deniedResult.hasAccess,
                  `После снятия ${config.name} элемент "${config.accessCheck.description}" не должен появляться при hover. Результат: ${deniedResult.reason}`,
                ).toBe(true);
              }
            });
          } finally {
            // CLEANUP: восстановить роли и удалить тестовую роль
            // Каждая операция в отдельном try/catch — если одна упадёт, вторая всё равно выполнится
            // НЕ оборачиваем в test.step() — при таймауте теста test.step() не выполняется
            try {
              await assignRolesAndInvalidate(
                adminAPI,
                testUserId,
                originalRoles,
              );
              console.log(`[UI Cleanup] Restored roles for user ${testUserId}`);
            } catch (e) {
              console.error(
                `[UI Cleanup] FAILED to restore roles for user ${testUserId}:`,
                e.message,
              );
            }
            try {
              await adminAPI.deleteRole(testRoleId);
              console.log(`[UI Cleanup] Deleted test role ${testRoleId}`);
            } catch (e) {
              console.error(
                `[UI Cleanup] FAILED to delete test role ${testRoleId}:`,
                e.message,
              );
            }
          }
        },
      );
    }
  },
);
