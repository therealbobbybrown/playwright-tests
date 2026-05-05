// tests/functional/performance-review/filling/pr-colleague-selection-manual-110-113.spec.js
// E2E тест: PR-110..113 (ручной выбор коллег оцениваемым)

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
  getVisibleNamesCountFromModal,
  isCandidateAvailableInModal,
  getSelectionModal,
  openColleagueSelectionPageByPrId,
  openSelectionModal,
  prepareManualSelectionReview,
  selectCandidatesFromModal,
} from "./pr-colleague-selection-manual.helpers.js";

test.describe(
  "PR - Ручной выбор коллег: открытие и выбор",
  { tag: ["@performance-review", "@filling", "@e2e", "@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Filling");
    });

    test(
      "C4202: Открыть страницу и выбрать минимальное/максимальное число коллег",
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
        let selectedMinNames = [];
        let revisionAlias = null;
        let nominationId = null;

        await test.step("Подготовить PR с ручным выбором коллег", async () => {
          const setup = await prepareManualSelectionReview({
            adminPage,
            testInfo,
            request,
            minColleagues,
            maxColleagues,
            requiredCandidates: 6,
          });

          baseUrl = setup.baseUrl;
          prId = setup.prId;
          prTitle = setup.prTitle;
          evaluatedUser = setup.evaluatedUser;
          candidateColleagues = setup.candidateColleagues;
          revisionAlias = setup.revisionAlias;
          nominationId = setup.nominationId;
          console.log("✓ Подготовлен тестовый PR для PR-110..113");
        });

        await userSession.runAs(evaluatedUser, async (userPage) => {
          await test.step("PR-110: Оцениваемый открывает страницу выбора коллег", async () => {
            await openColleagueSelectionPageByPrId({
              page: userPage,
              baseUrl,
              prId,
              prTitle,
              revisionAlias,
              nominationId,
            });

            const isNominationUrl =
              /\/performance-reviews\/\d+\/[^/]+\/nomination\/\d+/.test(
                userPage.url(),
              );
            let selectButtonVisible = false;
            try {
              await userPage
              .getByRole("button", { name: /^выбрать$/i })
              .first()
              .waitFor({ state: "visible", timeout: 10_000 })
              selectButtonVisible = true;
            } catch {}

            expect(
              isNominationUrl || selectButtonVisible,
              'Страница выбора коллег должна быть открыта (URL nomination или кнопка "Выбрать")',
            ).toBe(true);
          });

          await test.step("PR-111: Оцениваемый видит список доступных коллег", async () => {
            const modal = await openSelectionModal(userPage);
            const visibleNamesCount =
              await getVisibleNamesCountFromModal(modal);
            const probeCandidate = candidateColleagues[0];
            const probeCandidateVisible = await isCandidateAvailableInModal({
              page: userPage,
              modal,
              candidate: probeCandidate,
            });

            expect(
              visibleNamesCount > 0 || probeCandidateVisible,
              "Список доступных коллег должен быть непустым",
            ).toBe(true);
          });

          await test.step("PR-112: Оцениваемый выбирает минимальное количество коллег", async () => {
            const modal = await getSelectionModal(userPage);

            selectedMinNames = await selectCandidatesFromModal({
              page: userPage,
              modal,
              candidates: candidateColleagues,
              targetCount: minColleagues,
            });

            await applySelection(modal, userPage);

            const visibleMinSelected = await countVisibleNames(
              userPage,
              selectedMinNames,
            );
            expect(visibleMinSelected).toBeGreaterThanOrEqual(minColleagues);
          });

          await test.step("PR-113: Оцениваемый выбирает максимальное количество коллег", async () => {
            const modal = await openSelectionModal(userPage);

            const additionallyNeeded = maxColleagues - selectedMinNames.length;
            const selectedAdditionalNames = await selectCandidatesFromModal({
              page: userPage,
              modal,
              candidates: candidateColleagues,
              targetCount: additionallyNeeded,
              skipNames: selectedMinNames,
            });

            await applySelection(modal, userPage);

            const allSelectedNames = [
              ...selectedMinNames,
              ...selectedAdditionalNames,
            ];
            const visibleMaxSelected = await countVisibleNames(
              userPage,
              allSelectedNames,
            );
            expect(visibleMaxSelected).toBeGreaterThanOrEqual(maxColleagues);
          });
        });
      },
    );
  },
);
