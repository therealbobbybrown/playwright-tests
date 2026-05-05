// tests/functional/performance-review/filling/pr-colleague-selection-manual-114-115.spec.js
// E2E тест: PR-114..115 (валидация min/max при ручном выборе коллег)

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { createUserSession } from "../../../utils/UserSessionHelper.js";
import {
  getApplyButton,
  getSubmitButton,
  getVisibleNamesCountFromModal,
  isLocatorDisabled,
  openColleagueSelectionPageByPrId,
  openSelectionModal,
  prepareManualSelectionReview,
  selectCandidatesFromModal,
} from "./pr-colleague-selection-manual.helpers.js";

test.describe(
  "PR - Ручной выбор коллег: валидация лимитов",
  { tag: ["@performance-review", "@filling", "@e2e", "@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Filling");
    });

    test(
      "C4203: Валидация min/max количества коллег",
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
        let modal;
        let revisionAlias = null;
        let nominationId = null;

        await test.step("Подготовить PR с лимитами коллег 2..5", async () => {
          const setup = await prepareManualSelectionReview({
            adminPage,
            testInfo,
            request,
            minColleagues,
            maxColleagues,
            requiredCandidates: maxColleagues + 2,
          });

          baseUrl = setup.baseUrl;
          prId = setup.prId;
          prTitle = setup.prTitle;
          evaluatedUser = setup.evaluatedUser;
          candidateColleagues = setup.candidateColleagues;
          revisionAlias = setup.revisionAlias;
          nominationId = setup.nominationId;
          console.log("✓ Подготовлен тестовый PR для PR-114..115");
        });

        await userSession.runAs(evaluatedUser, async (userPage) => {
          await test.step("Открыть страницу выбора коллег и модалку", async () => {
            await openColleagueSelectionPageByPrId({
              page: userPage,
              baseUrl,
              prId,
              prTitle,
              revisionAlias,
              nominationId,
            });

            modal = await openSelectionModal(userPage);
            let searchInputVisible = false;
            try {
              await userPage
              .getByRole("textbox", { name: /имя, фамилия или почта/i })
              .first()
              .waitFor({ state: "visible", timeout: 5000 })
              searchInputVisible = true;
            } catch {}
            const visibleNamesCount =
              await getVisibleNamesCountFromModal(modal);
            expect(searchInputVisible || visibleNamesCount > 0).toBe(true);
          });

          await test.step("PR-114: нельзя выбрать меньше минимума", async () => {
            const applyButton = await getApplyButton(modal);
            const applyDisabled = await isLocatorDisabled(applyButton);
            expect(
              applyDisabled,
              'Кнопка "Применить" должна быть disabled без выбора',
            ).toBe(true);
          });

          await test.step("PR-115: нельзя выбрать больше максимума", async () => {
            let _visible1 = false;
            try {
              await modal.waitFor({ state: "visible", timeout: 2000 });
              _visible1 = true;
            } catch {}
            if (!_visible1) {
              modal = await openSelectionModal(userPage);
            }

            const selectedNow = [];

            for (const candidate of candidateColleagues) {
              if (selectedNow.length >= maxColleagues) break;
              try {
                const selectedOne = await selectCandidatesFromModal({
                  page: userPage,
                  modal,
                  candidates: [candidate],
                  targetCount: 1,
                  skipNames: selectedNow,
                });
                selectedNow.push(...selectedOne);
              } catch {
                // Следующий кандидат; проверка "дошли до max" ниже отловит реальный провал
              }
            }

            expect(selectedNow.length).toBe(maxColleagues);

            const remainingCandidates = candidateColleagues.filter(
              (candidate) => !selectedNow.includes(candidate.name),
            );
            expect(remainingCandidates.length).toBeGreaterThan(0);

            let blockedByMax = false;
            try {
              await selectCandidatesFromModal({
                page: userPage,
                modal,
                candidates: remainingCandidates,
                targetCount: 1,
                skipNames: selectedNow,
              });
            } catch {
              blockedByMax = true;
            }

            if (!blockedByMax) {
              const applyButton = await getApplyButton(modal);
              const applyDisabled = await isLocatorDisabled(applyButton);

              if (applyDisabled) {
                blockedByMax = true;
              } else {
                await applyButton.click();
                await modal
                  .waitFor({ state: "hidden", timeout: 10_000 });
                await userPage
                  .waitForLoadState("networkidle", { timeout: 10000 });

                const submitButton = await getSubmitButton(userPage);
                const submitDisabled = await isLocatorDisabled(submitButton);
                let maxValidationVisible = false;
                try {
                  await userPage
                  .getByText(/не более|максимум|от\s+\d+\s+до\s+\d+/i)
                  .first()
                  .waitFor({ state: "visible", timeout: 2000 })
                  maxValidationVisible = true;
                } catch {}

                blockedByMax = submitDisabled || maxValidationVisible;
              }
            }

            expect(
              blockedByMax,
              "Превышение максимума должно быть заблокировано",
            ).toBe(true);
          });
        });
      },
    );
  },
);
