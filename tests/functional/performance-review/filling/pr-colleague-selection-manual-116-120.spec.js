// tests/functional/performance-review/filling/pr-colleague-selection-manual-116-120.spec.js
// E2E тест: PR-116..120 (отправка списка коллег и post-submit поведение)

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { createUserSession } from "../../../utils/UserSessionHelper.js";
import {
  applySelection,
  countVisibleNames,
  getEditButton,
  getSelectButton,
  getSubmitButton,
  isLocatorDisabled,
  openColleagueSelectionPageByPrId,
  openSelectionModal,
  prepareManualSelectionReview,
  selectCandidatesFromModal,
} from "./pr-colleague-selection-manual.helpers.js";

test.describe(
  "PR - Ручной выбор коллег: отправка и post-submit",
  { tag: ["@performance-review", "@filling", "@e2e", "@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Filling");
    });

    test(
      "C4204: Отправить список коллег и проверить поведение после отправки",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        testInfo.setTimeout(600_000);

        const userSession = createUserSession(browser, testInfo);
        const minColleagues = 2;
        const maxColleagues = 5;
        let baseUrl;
        let prId;
        let prTitle;
        let evaluatedUser;
        let candidateColleagues = [];
        let selectedNames = [];
        let revisionAlias = null;
        let nominationId = null;

        await test.step("Подготовить PR для проверки отправки и post-submit поведения", async () => {
          const setup = await prepareManualSelectionReview({
            adminPage,
            testInfo,
            request,
            minColleagues,
            maxColleagues,
            requiredCandidates: 3,
          });

          baseUrl = setup.baseUrl;
          prId = setup.prId;
          prTitle = setup.prTitle;
          evaluatedUser = setup.evaluatedUser;
          candidateColleagues = setup.candidateColleagues;
          revisionAlias = setup.revisionAlias;
          nominationId = setup.nominationId;
          console.log("✓ Подготовлен тестовый PR для PR-116..120");
        });

        await userSession.runAs(evaluatedUser, async (userPage) => {
          await test.step("Открыть страницу выбора коллег и выбрать минимум коллег", async () => {
            await openColleagueSelectionPageByPrId({
              page: userPage,
              baseUrl,
              prId,
              prTitle,
              revisionAlias,
              nominationId,
            });

            const modal = await openSelectionModal(userPage);
            selectedNames = await selectCandidatesFromModal({
              page: userPage,
              modal,
              candidates: candidateColleagues,
              targetCount: minColleagues,
            });

            await applySelection(modal, userPage);
          });

          await test.step('PR-119: кнопка "Редактировать" доступна до финальной отправки', async () => {
            const editButton = await getEditButton(userPage);
            let editVisible = false;
            try {
              await editButton
              .waitFor({ state: "visible", timeout: 5000 })
              editVisible = true;
            } catch {}
            expect(editVisible).toBe(true);

            const editDisabled = await isLocatorDisabled(editButton);
            expect(editDisabled).toBe(false);
          });

          await test.step("PR-116 + PR-117: отправить список коллег и увидеть подтверждение", async () => {
            const submitButton = await getSubmitButton(userPage);
            await submitButton.waitFor({ state: "visible", timeout: 10_000 });

            const submitDisabled = await isLocatorDisabled(submitButton);
            expect(submitDisabled).toBe(false);

            await submitButton.click();

            // Подтверждение может быть полной страницей (не модалкой) с кнопками
            // "Вернуться к редактированию" и "Отправить"
            const confirmPageMarker = userPage
              .getByText(/вернуться к редактированию/i)
              .first();
            let isConfirmPage = false;
            try {
              await confirmPageMarker
              .waitFor({ state: "visible", timeout: 10_000 })
              isConfirmPage = true;
            } catch {}

            // Также проверяем наличие модалки подтверждения (альтернативная реализация)
            const confirmModal = userPage
              .locator('[role="dialog"], [class*="Modal"], [class*="Sheet"]')
              .filter({ hasText: /вы уверены|подтвердите|отправить/i })
              .last();
            let isConfirmModal = false;
            try {
              await confirmModal
              .waitFor({ state: "visible", timeout: 3000 })
              isConfirmModal = true;
            } catch {}

            expect(
              isConfirmPage || isConfirmModal,
              "Подтверждение отправки (страница или модалка) должно быть видно",
            ).toBe(true);
          });

          await test.step("PR-118: после подтверждения отображается страница с выбранными коллегами", async () => {
            // Кнопка "Отправить" на странице подтверждения
            let confirmButton = userPage
              .locator("button")
              .filter({ hasText: /^Отправить$/i })
              .last();
            let _visible1 = false;
            try {
              await confirmButton.waitFor({ state: "visible", timeout: 3000 });
              _visible1 = true;
            } catch {}
            if (!_visible1) {
              confirmButton = userPage
                .locator("button")
                .filter({ hasText: /да|отправить|подтвердить|ок/i })
                .last();
            }

            await confirmButton.waitFor({ state: "visible", timeout: 10_000 });
            await confirmButton.click();

            // Ждём появления подтверждающего текста "Вы уже выбрали коллег"
            const confirmationText = userPage
              .getByText(/вы уже выбрали коллег/i)
              .first();
            await confirmationText.waitFor({
              state: "visible",
              timeout: 15_000,
            });

            // Проверяем: заголовок подтверждения виден
            await expect(
              confirmationText,
              'Должен отображаться текст "Вы уже выбрали коллег"',
            ).toBeVisible();

            // Проверяем: секция "Вы выбрали:" с именами коллег
            const selectedSection = userPage.getByText(/вы выбрали:/i).first();
            await expect(
              selectedSection,
              'Должна быть секция "Вы выбрали:"',
            ).toBeVisible();

            // Проверяем: выбранные коллеги видны на странице
            const visibleSelected = await countVisibleNames(
              userPage,
              selectedNames,
            );
            expect(
              visibleSelected,
              `Выбранные коллеги (${selectedNames.join(", ")}) должны быть видны на странице`,
            ).toBeGreaterThanOrEqual(1);
          });

          await test.step("PR-120: после финальной отправки редактирование недоступно", async () => {
            // После отправки страница read-only: нет кнопок "Редактировать", "Выбрать", "Отправить"
            const editButton = userPage
              .locator("button")
              .filter({ hasText: /редактировать|изменить/i })
              .first();
            await expect(
              editButton,
              'Кнопка "Редактировать" не должна быть видна после отправки',
            ).not.toBeVisible();

            const selectButton = userPage
              .getByRole("button", { name: /^выбрать$/i })
              .first();
            await expect(
              selectButton,
              'Кнопка "Выбрать" не должна быть видна после отправки',
            ).not.toBeVisible();

            const submitButton = userPage
              .locator("button")
              .filter({ hasText: /^отправить$/i })
              .first();
            await expect(
              submitButton,
              'Кнопка "Отправить" не должна быть видна после отправки',
            ).not.toBeVisible();
          });
        });
      },
    );
  },
);
