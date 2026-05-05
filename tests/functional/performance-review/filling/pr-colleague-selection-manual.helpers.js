// tests/functional/performance-review/filling/pr-colleague-selection-manual.helpers.js
// Хелперы для тестов ручного выбора коллег в Performance Review

import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import { filterValidUsers } from "../../../utils/UserSessionHelper.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";

const BASE_URL = process.env.BASE_URL;

/**
 * Создать PR с ручным выбором коллег и вернуть данные для тестирования.
 * @param {Object} params
 * @param {import('@playwright/test').Page} params.adminPage - страница администратора
 * @param {import('@playwright/test').TestInfo} params.testInfo
 * @param {import('@playwright/test').APIRequestContext} [params.request] - Playwright request context для API
 * @param {number} [params.minColleagues=2]
 * @param {number} [params.maxColleagues=5]
 * @param {number} [params.requiredCandidates=6] - минимальное количество пользователей для коллег
 * @returns {Promise<{baseUrl: string, prId: string, prTitle: string, evaluatedUser: Object, candidateColleagues: Object[], revisionAlias: string|null}>}
 */
export async function prepareManualSelectionReview({
  adminPage,
  testInfo,
  request = null,
  minColleagues = 2,
  maxColleagues = 5,
  requiredCandidates = 6,
}) {
  const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
  const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
  const orgHelper = new OrgStructureHelper(adminPage, testInfo);

  // Получаем пользователей для ролей
  const totalUsersNeeded = requiredCandidates + 3; // evaluatedUser + manager + subordinate + candidates
  const rawUsers = await orgHelper.getUsersList(totalUsersNeeded + 5);
  const users = await filterValidUsers(rawUsers);
  if (users.length < requiredCandidates + 3) {
    throw new Error(
      `Недостаточно валидных пользователей: нужно ${requiredCandidates + 3}, найдено ${users.length}`,
    );
  }

  const evaluatedUser = users[0];
  const managerUser = users[1];
  const subordinateUser = users[2];
  const candidateColleagues = users.slice(3, 3 + requiredCandidates);

  console.log(`Оцениваемый: ${evaluatedUser.name}`);
  console.log(`Руководитель: ${managerUser.name}`);
  console.log(
    `Кандидаты коллеги: ${candidateColleagues.map((u) => u.name).join(", ")}`,
  );

  // Создаём PR через UI
  await adminPage.goto(
    new URL("/ru/manager/performance-reviews/", BASE_URL).toString(),
  );
  await listPage.assertOpened();
  await listPage.openCreateModal();
  await listPage.performanceReviewType.click();
  await configPage.assertOpened();

  // Настраиваем направления оценки
  await configPage.configureDirections({
    self: true,
    manager: true,
    colleagues: true,
    subordinates: false,
  });

  // Настраиваем ручной выбор коллег
  await configPage.configureColleaguesSelection({
    askEmployees: true,
    minColleagues,
    maxColleagues,
    managerApproval: false,
    earlyAccess: false,
  });

  // Добавляем участника (оцениваемого)
  await configPage.addTargetUsers({ count: 1 });

  // Редактируем респондентов
  await configPage.editRespondentsTable({
    managers: [managerUser],
  });

  // Настраиваем анкеты и запускаем
  await configPage.disableReminders();
  await configPage.addAssessmentsForAllDirections();
  await configPage.goToStep("launch");
  await configPage.launch();

  // Извлекаем prId из URL
  const currentUrl = adminPage.url();
  const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
  const prId = match?.[1];
  if (!prId) {
    throw new Error(`Не удалось извлечь PR ID из URL: ${currentUrl}`);
  }

  // Получаем название PR
  let prTitle = `PR-${prId}`;
  try {
    prTitle = await adminPage.locator('h1, [class*="title"]').first().textContent();
  } catch {}

  console.log(`✓ PR создан: ID=${prId}, title=${prTitle.trim()}`);

  // Получаем revision, alias, nomination и фактического target user через API
  let revisionAlias = null;
  let revisionId = null;
  let nominationId = null;
  let actualEvaluatedUser = evaluatedUser;
  if (request) {
    try {
      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);

      // Получаем revision alias для прямой навигации
      const { data: revision } = await prAPI.getLastRevision(prId);
      revisionAlias = revision?.alias || null;
      revisionId = revision?.id || null;
      if (revisionAlias) {
        console.log(
          `✓ Revision alias получен: ${revisionAlias}, revisionId: ${revisionId}`,
        );
      } else {
        console.log(
          "⚠️ Revision alias не найден — навигация через alias недоступна",
        );
      }

      // Получаем nomination ID для прямого URL
      if (revisionId) {
        try {
          const { data: nominationData } = await prAPI.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          nominationId = nominationData?.id || null;
          if (nominationId) {
            console.log(`✓ Nomination ID получен: ${nominationId}`);
          } else {
            console.log("⚠️ Nomination не найдена для данной ревизии");
          }
        } catch (nomErr) {
          console.log(`⚠️ Ошибка при получении nomination: ${nomErr.message}`);
        }
      }

      // Получаем фактического target user (который был добавлен через UI)
      const { data: targetUsersData } = await prAPI.getTargetUsers(prId, {});
      const targetItems = targetUsersData?.items || targetUsersData || [];
      if (targetItems.length > 0) {
        const tu = targetItems[0];
        const tuUserId = tu.userId || tu.id || tu.user?.id;
        const tuName = tu.user
          ? `${tu.user.firstName || ""} ${tu.user.lastName || ""}`.trim()
          : tu.name || tu.fullName || `User ${tuUserId}`;

        // Ищем пользователя по имени среди оригинальных users (getUsersList возвращает { name, email })
        if (tuName) {
          const matchedUser = users.find((u) => u.name === tuName);
          if (matchedUser) {
            actualEvaluatedUser = { ...matchedUser, userId: tuUserId };
            console.log(
              `✓ Фактический target user: ${matchedUser.name} (ID: ${tuUserId}, email: ${matchedUser.email})`,
            );
          } else {
            console.log(
              `⚠️ Target user "${tuName}" (ID=${tuUserId}) не найден среди пользователей. evaluatedUser="${evaluatedUser.name}"`,
            );
          }
        }
      } else {
        console.log(
          "⚠️ API не вернул target users — используем evaluatedUser из getUsersList",
        );
      }
    } catch (err) {
      console.log(`⚠️ Ошибка при получении данных PR: ${err.message}`);
    }
  }

  return {
    baseUrl: BASE_URL,
    prId,
    prTitle: prTitle.trim(),
    evaluatedUser: actualEvaluatedUser,
    candidateColleagues,
    revisionAlias,
    nominationId,
  };
}

/**
 * Перейти на страницу выбора коллег по PR ID.
 * @param {Object} params
 * @param {import('@playwright/test').Page} params.page
 * @param {string} params.baseUrl
 * @param {string} params.prId
 * @param {string} [params.prTitle]
 * @param {string} [params.revisionAlias] - Alias ревизии для прямой навигации (предпочтительный путь)
 * @param {string|number} [params.nominationId] - ID номинации для прямого URL
 */
export async function openColleagueSelectionPageByPrId({
  page,
  baseUrl,
  prId,
  prTitle,
  revisionAlias,
  nominationId,
}) {
  const url = baseUrl || BASE_URL;

  // Путь 0 (самый надёжный): прямой URL на nomination, если есть alias + nominationId
  if (revisionAlias && nominationId) {
    const nominationUrl = new URL(
      `/ru/performance-reviews/${prId}/${revisionAlias}/nomination/${nominationId}`,
      url,
    ).toString();
    console.log(
      `📍 Переход к выбору коллег через nomination URL: ${nominationUrl}`,
    );

    const MAX_RETRIES = 8;
    const RETRY_DELAY = 8000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        console.log(
          `⏳ Retry ${attempt}/${MAX_RETRIES}: ожидание ${RETRY_DELAY}ms...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }

      await page.goto(nominationUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 });

      // Проверяем 404
      let is404 = false;
      try {
        await page
        .locator("h1")
        .filter({ hasText: "404" })
        .first()
        .waitFor({ state: "visible", timeout: 2000 })
        is404 = true;
      } catch {}

      if (is404) {
        console.log(
          `⚠️ Nomination URL вернул 404 (попытка ${attempt}/${MAX_RETRIES})`,
        );
        continue;
      }

      if (page.url().includes("/login")) {
        throw new Error(
          `Редирект на login — пользователь не авторизован (${page.url()})`,
        );
      }

      // Проверяем: на странице выбора коллег (кнопка "Выбрать" видна)
      let hasSelectButton = false;
      try {
        await page
        .getByRole("button", { name: /^выбрать$/i })
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        hasSelectButton = true;
      } catch {}

      if (hasSelectButton) {
        console.log(
          `✓ На странице выбора коллег (nomination URL): ${page.url()}`,
        );
        return;
      }

      console.log(`✓ Перешли к nomination: ${page.url()}`);
      return;
    }

    console.log(
      "⚠️ Nomination URL вернул 404 после всех попыток, пробуем alias URL...",
    );
  }

  // Путь 1: Alias URL — корректно работает даже для admin
  // toAssessments URL показывает manager view для admin, кнопка "Выбрать" отсутствует
  if (revisionAlias) {
    const aliasUrl = new URL(
      `/ru/performance-reviews/${prId}/${revisionAlias}/`,
      url,
    ).toString();
    console.log(`📍 Переход к выбору коллег через alias URL: ${aliasUrl}`);

    // Retry: сразу после запуска PR alias URL может вернуть 404 (SSR ещё не готов)
    // Увеличено: при высокой нагрузке на стенд SSR может готовиться до 60с
    const MAX_RETRIES = 8;
    const RETRY_DELAY = 8000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        console.log(
          `⏳ Retry ${attempt}/${MAX_RETRIES}: ожидание ${RETRY_DELAY}ms...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }

      await page.goto(aliasUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 });

      // Проверяем 404
      let is404 = false;
      try {
        await page
        .locator("h1")
        .filter({ hasText: "404" })
        .first()
        .waitFor({ state: "visible", timeout: 2000 })
        is404 = true;
      } catch {}

      if (is404) {
        console.log(
          `⚠️ Alias URL вернул 404 (попытка ${attempt}/${MAX_RETRIES})`,
        );
        continue;
      }

      const currentUrl = page.url();
      if (currentUrl.includes("/login")) {
        throw new Error(
          `Редирект на login — пользователь не авторизован (${currentUrl})`,
        );
      }

      // Проверяем: уже на странице выбора коллег (кнопка "Выбрать" видна)
      let hasSelectButton = false;
      try {
        await page
        .getByRole("button", { name: /^выбрать$/i })
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        hasSelectButton = true;
      } catch {}

      if (hasSelectButton) {
        console.log(`✓ На странице выбора коллег (alias): ${currentUrl}`);
        return;
      }

      // Ищем ссылку на nomination
      const nominationLink = page.locator('a[href*="/nomination/"]').first();
      let hasNominationLink = false;
      try {
        await nominationLink
        .waitFor({ state: "visible", timeout: 5000 })
        hasNominationLink = true;
      } catch {}

      if (hasNominationLink) {
        await nominationLink.click();
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 });
        console.log(
          `✓ Перешли к странице выбора коллег (alias → nomination): ${page.url()}`,
        );
        return;
      }

      console.log(`✓ Перешли к PR через alias URL: ${currentUrl}`);
      return;
    }

    console.log(
      "⚠️ Alias URL вернул 404 после всех попыток, пробуем fallback...",
    );
  }

  // Путь 2 (fallback): toAssessments URL — может не работать для admin (manager view)
  const prPageUrl = new URL(
    `/ru/staff/performance-reviews/${prId}/?toAssessments=true`,
    url,
  ).toString();
  console.log(`📍 Переход к PR ${prId} для выбора коллег: ${prPageUrl}`);
  await page.goto(prPageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 });

  const currentUrl = page.url();
  if (currentUrl.includes("/login")) {
    throw new Error(
      `Редирект на login — пользователь не авторизован (${currentUrl})`,
    );
  }

  // Проверяем: уже на странице выбора коллег (кнопка "Выбрать" видна)
  let hasSelectButton = false;
  try {
    await page
    .getByRole("button", { name: /^выбрать$/i })
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    hasSelectButton = true;
  } catch {}

  if (hasSelectButton) {
    console.log(`✓ На странице выбора коллег: ${currentUrl}`);
    return;
  }

  // Ищем ссылку на nomination
  const nominationLink = page.locator('a[href*="/nomination/"]').first();
  let hasNominationLink = false;
  try {
    await nominationLink
    .waitFor({ state: "visible", timeout: 5000 })
    hasNominationLink = true;
  } catch {}

  if (hasNominationLink) {
    await nominationLink.click();
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 });
    console.log(`✓ Перешли к странице выбора коллег: ${page.url()}`);
    return;
  }

  // Fallback: главная страница → карточка PR
  console.log("⚠️ Ссылка на nomination не найдена, пробуем через главную...");
  await page.goto(new URL("/ru/", url).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 });

  // Ищем карточку с текстом "выберите коллег" или ссылку на PR
  const colleagueCard = page
    .locator('a[href*="/nomination/"], a[href*="/performance-reviews/"]')
    .filter({ hasText: /коллег|nomination/i })
    .first();
  let hasCard = false;
  try {
    await colleagueCard
    .waitFor({ state: "visible", timeout: 5000 })
    hasCard = true;
  } catch {}

  if (hasCard) {
    await colleagueCard.click();
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 });
    console.log(`✓ Перешли через карточку: ${page.url()}`);
  } else {
    console.log(
      `⚠️ Карточка выбора коллег не найдена, текущий URL: ${page.url()}`,
    );
  }
}

/**
 * Открыть модальное окно выбора коллег (кликнуть "Выбрать").
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} modal locator
 */
export async function openSelectionModal(page) {
  let selectButton = page.getByRole("button", { name: /^выбрать$/i }).first();
  try {
    await selectButton.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    selectButton = page
      .locator("button")
      .filter({ hasText: /выбрать/i })
      .first();
    await selectButton.waitFor({ state: "visible", timeout: 5000 });
  }

  // Re-locate кнопку перед кликом — React может перерендерить DOM
  selectButton = page.getByRole("button", { name: /^выбрать$/i }).first();
  await selectButton.waitFor({ state: "visible", timeout: 5_000 });
  await selectButton.click();
  console.log("✓ Открыто модальное окно выбора коллег");

  const modal = page.locator(".react-modal-sheet-container").last();
  await modal.waitFor({ state: "visible", timeout: 15_000 });

  // Ждём загрузки списка пользователей
  const rows = modal.locator('[class*="UserOption_row"]');
  await rows.first().waitFor({ state: "visible", timeout: 10_000 });

  return modal;
}

/**
 * Получить локатор модалки выбора коллег (без открытия).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function getSelectionModal(page) {
  const modal = page.locator(".react-modal-sheet-container").last();
  await modal.waitFor({ state: "visible", timeout: 10_000 });
  return modal;
}

/**
 * Посчитать видимые имена пользователей в модалке.
 * @param {import('@playwright/test').Locator} modal
 * @returns {Promise<number>}
 */
export async function getVisibleNamesCountFromModal(modal) {
  const rows = modal.locator('[class*="UserOption_row"]');
  await rows
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
  return await rows.count();
}

/**
 * Проверить, доступен ли кандидат в модалке.
 * @param {Object} params
 * @param {import('@playwright/test').Page} params.page
 * @param {import('@playwright/test').Locator} params.modal
 * @param {Object} params.candidate - { name, email }
 * @returns {Promise<boolean>}
 */
export async function isCandidateAvailableInModal({ page, modal, candidate }) {
  const rows = modal.locator(
    '[class*="UserOption_row"]:not([class*="disabled"])',
  );
  const candidateRow = rows
    .filter({ has: page.locator(`text=${candidate.name}`) })
    .first();

  return (await candidateRow.count()) > 0;
}

/**
 * Выбрать кандидатов в модалке и вернуть их имена.
 * @param {Object} params
 * @param {import('@playwright/test').Page} params.page
 * @param {import('@playwright/test').Locator} params.modal
 * @param {Object[]} params.candidates - [{ name, email }]
 * @param {number} params.targetCount - сколько выбрать
 * @param {string[]} [params.skipNames=[]] - имена для пропуска
 * @returns {Promise<string[]>} имена выбранных кандидатов
 */
export async function selectCandidatesFromModal({
  page,
  modal,
  candidates,
  targetCount,
  skipNames = [],
}) {
  const selectedNames = [];
  const clickableRows = modal.locator(
    '[class*="UserOption_row"]:not([class*="disabled"])',
  );

  // Сначала пробуем найти указанных кандидатов
  for (const candidate of candidates) {
    if (selectedNames.length >= targetCount) break;
    if (skipNames.includes(candidate.name)) continue;

    const candidateRow = clickableRows
      .filter({ has: page.locator(`text=${candidate.name}`) })
      .first();

    if ((await candidateRow.count()) === 0) {
      console.log(`⚠️ Кандидат ${candidate.name} не найден в списке`);
      continue;
    }

    await candidateRow.click();
    selectedNames.push(candidate.name);
    console.log(`✓ Выбран: ${candidate.name}`);
  }

  // Fallback: если заданные кандидаты не найдены, выбираем первых доступных
  if (selectedNames.length === 0 && targetCount > 0) {
    console.log(
      "⚠️ Указанные кандидаты не найдены, выбираем первых доступных...",
    );
    const availableCount = await clickableRows.count();
    for (
      let i = 0;
      i < availableCount && selectedNames.length < targetCount;
      i++
    ) {
      const row = clickableRows.nth(i);
      let name = "";
      try { name = await row.textContent(); } catch {}
      name = name.trim();
      if (skipNames.some((skip) => name.includes(skip))) continue;
      await row.click();
      selectedNames.push(name.split("\n")[0].trim()); // Берём первую строку (имя)
      console.log(`✓ Выбран (fallback): ${name.slice(0, 50)}`);
    }
  }

  if (selectedNames.length === 0) {
    throw new Error("Не удалось выбрать ни одного кандидата");
  }

  console.log(`✓ Выбрано ${selectedNames.length}/${targetCount} кандидатов`);
  return selectedNames;
}

/**
 * Нажать "Применить" в модалке выбора.
 * @param {import('@playwright/test').Locator} modal
 * @param {import('@playwright/test').Page} page
 */
export async function applySelection(modal, page) {
  const applyButton = modal
    .locator("button")
    .filter({ hasText: /применить|сохранить/i })
    .first();
  await applyButton.waitFor({ state: "visible", timeout: 5000 });
  await applyButton.click();
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 });
  console.log("✓ Выбор коллег применён");
}

/**
 * Посчитать, сколько из указанных имён видны на странице.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} names
 * @returns {Promise<number>}
 */
export async function countVisibleNames(page, names) {
  let count = 0;
  for (const name of names) {
    const el = page.getByText(name, { exact: false }).first();
    let visible = false;
    try { visible = await el.isVisible(); } catch {}
    if (visible) count++;
  }
  return count;
}

/**
 * Получить кнопку "Применить" из модалки.
 * @param {import('@playwright/test').Locator} modal
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function getApplyButton(modal) {
  return modal
    .locator("button")
    .filter({ hasText: /применить|сохранить/i })
    .first();
}

/**
 * Получить кнопку "Отправить" на странице.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function getSubmitButton(page) {
  return page
    .locator("button")
    .filter({ hasText: /^отправить$/i })
    .or(
      page
        .locator("button")
        .filter({ hasText: /отправить предложение|предложить/i }),
    )
    .first();
}

/**
 * Получить кнопку "Редактировать" на странице.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function getEditButton(page) {
  let button = page.getByRole("button", { name: /редактировать/i }).first();
  let _buttonVisible = false;
  try { _buttonVisible = await button.isVisible(); } catch {}
  if (!_buttonVisible) {
    button = page
      .locator("button")
      .filter({ hasText: /редактировать|изменить/i })
      .first();
  }
  return button;
}

/**
 * Получить кнопку "Выбрать" на странице.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function getSelectButton(page) {
  return page.getByRole("button", { name: /^выбрать$/i }).first();
}

/**
 * Проверить, является ли элемент disabled.
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<boolean>}
 */
export async function isLocatorDisabled(locator) {
  // Проверяем атрибут disabled
  let disabled = false;
  try { disabled = await locator.isDisabled(); } catch {}
  if (disabled) return true;

  // Проверяем aria-disabled
  let ariaDisabled = null;
  try { ariaDisabled = await locator.getAttribute("aria-disabled"); } catch {}
  if (ariaDisabled === "true") return true;

  // Проверяем CSS-класс disabled
  let className = "";
  try { className = (await locator.getAttribute("class")) || ""; } catch {}
  return className.includes("disabled");
}
