// scripts/rename-tests.js
// Переименовывает тестовые файлы в формат {модуль}-{суть-проверки}.spec.js
import fs from "fs";
import path from "path";

// Карта переименований: старое имя -> новое имя (относительно директории)
const renames = [
  // === AUTH ===
  [
    "tests/functional/auth/login.spec.js",
    "tests/functional/auth/auth-login.spec.js",
  ],

  // === HOME ===
  [
    "tests/functional/home/home-page.spec.js",
    "tests/functional/home/home-page-view.spec.js",
  ],

  // === BRAND ===
  [
    "tests/functional/brand/settings.spec.js",
    "tests/functional/brand/brand-settings.spec.js",
  ],
  [
    "tests/functional/brand/upload-logo.spec.js",
    "tests/functional/brand/brand-upload-logo.spec.js",
  ],
  [
    "tests/functional/brand/language.spec.js",
    "tests/functional/brand/brand-language.spec.js",
  ],

  // === OBJECTIVES ===
  [
    "tests/functional/objectives/settings.spec.js",
    "tests/functional/objectives/objectives-settings.spec.js",
  ],
  [
    "tests/functional/objectives/create.spec.js",
    "tests/functional/objectives/objectives-create.spec.js",
  ],
  [
    "tests/functional/objectives/all.spec.js",
    "tests/functional/objectives/objectives-all-list.spec.js",
  ],
  [
    "tests/functional/objectives/all-update-kr.spec.js",
    "tests/functional/objectives/objectives-all-update-kr.spec.js",
  ],

  // === VIRTUAL CURRENCY ===
  [
    "tests/functional/virtual-currency/settings.spec.js",
    "tests/functional/virtual-currency/virtual-currency-settings.spec.js",
  ],
  [
    "tests/functional/virtual-currency/deposit.spec.js",
    "tests/functional/virtual-currency/virtual-currency-deposit.spec.js",
  ],
  [
    "tests/functional/virtual-currency/deposit-shop.spec.js",
    "tests/functional/virtual-currency/virtual-currency-deposit-shop.spec.js",
  ],

  // === FEEDBACK ===
  [
    "tests/functional/feedback/of-employees.spec.js",
    "tests/functional/feedback/feedback-of-employees.spec.js",
  ],
  [
    "tests/functional/feedback/review.spec.js",
    "tests/functional/feedback/feedback-review.spec.js",
  ],
  [
    "tests/functional/feedback/send-thanks.spec.js",
    "tests/functional/feedback/feedback-send-thanks.spec.js",
  ],
  [
    "tests/functional/feedback/history-and-statistics.spec.js",
    "tests/functional/feedback/feedback-history-and-statistics.spec.js",
  ],
  [
    "tests/functional/feedback/company-statistics.spec.js",
    "tests/functional/feedback/feedback-company-statistics.spec.js",
  ],
  [
    "tests/functional/feedback/request-from-colleague.spec.js",
    "tests/functional/feedback/feedback-request-from-colleague.spec.js",
  ],

  // === GIFT SHOP ===
  [
    "tests/functional/gift-shop/create-gift.spec.js",
    "tests/functional/gift-shop/gift-shop-create-gift.spec.js",
  ],
  [
    "tests/functional/gift-shop/open-from-menu.spec.js",
    "tests/functional/gift-shop/gift-shop-open-from-menu.spec.js",
  ],

  // === MY TEAM ===
  [
    "tests/functional/my-team/my-team.spec.js",
    "tests/functional/my-team/my-team-view.spec.js",
  ],

  // === PROFILE ===
  [
    "tests/functional/profile/main-blocks.spec.js",
    "tests/functional/profile/profile-main-blocks.spec.js",
  ],
  [
    "tests/functional/profile/employee-review-blocks.spec.js",
    "tests/functional/profile/profile-employee-review-blocks.spec.js",
  ],
  [
    "tests/functional/profile/development-plans-blocks.spec.js",
    "tests/functional/profile/profile-development-plans-blocks.spec.js",
  ],
  [
    "tests/functional/profile/additional-info-config-add-blocks.spec.js",
    "tests/functional/profile/profile-additional-info-config-add-blocks.spec.js",
  ],

  // === SETTINGS ===
  [
    "tests/functional/settings/development-plans-settings.spec.js",
    "tests/functional/settings/settings-development-plans.spec.js",
  ],

  // === ACCOUNT ===
  [
    "tests/functional/account/management.spec.js",
    "tests/functional/account/account-management.spec.js",
  ],

  // === ORG STRUCTURE ===
  [
    "tests/functional/org-structure/constructor.spec.js",
    "tests/functional/org-structure/org-structure-constructor.spec.js",
  ],
  [
    "tests/functional/org-structure/import.spec.js",
    "tests/functional/org-structure/org-structure-import.spec.js",
  ],
  [
    "tests/functional/org-structure/invite-links.spec.js",
    "tests/functional/org-structure/org-structure-invite-links.spec.js",
  ],
  [
    "tests/functional/org-structure/departments/departments-basic.spec.js",
    "tests/functional/org-structure/departments/org-structure-departments-basic.spec.js",
  ],
  [
    "tests/functional/org-structure/departments/departments-create.spec.js",
    "tests/functional/org-structure/departments/org-structure-departments-create.spec.js",
  ],
  [
    "tests/functional/org-structure/users/users.spec.js",
    "tests/functional/org-structure/users/org-structure-users-list.spec.js",
  ],
  [
    "tests/functional/org-structure/users/users-add.spec.js",
    "tests/functional/org-structure/users/org-structure-users-add.spec.js",
  ],

  // === SURVEYS ===
  [
    "tests/functional/surveys/creation/create-blank-from-list.spec.js",
    "tests/functional/surveys/creation/survey-create-blank-from-list.spec.js",
  ],
  [
    "tests/functional/surveys/creation/create-from-template.spec.js",
    "tests/functional/surveys/creation/survey-create-from-template.spec.js",
  ],
  [
    "tests/functional/surveys/creation/create-blank-all-question-types.spec.js",
    "tests/functional/surveys/creation/survey-create-blank-all-question-types.spec.js",
  ],
  [
    "tests/functional/surveys/creation/open-templates-from-list.spec.js",
    "tests/functional/surveys/creation/survey-open-templates-from-list.spec.js",
  ],
  [
    "tests/functional/surveys/management/open-draft-from-list.spec.js",
    "tests/functional/surveys/management/survey-open-draft-from-list.spec.js",
  ],
  [
    "tests/functional/surveys/publication/create-and-pass-with-departments-full.spec.js",
    "tests/functional/surveys/publication/survey-create-and-pass-with-departments-full.spec.js",
  ],

  // === PERFORMANCE REVIEW ===
  [
    "tests/functional/performance-review/list/open-list.spec.js",
    "tests/functional/performance-review/list/pr-open-list.spec.js",
  ],
  [
    "tests/functional/performance-review/creation/create-and-launch-complete.spec.js",
    "tests/functional/performance-review/creation/pr-create-and-launch-complete.spec.js",
  ],
  [
    "tests/functional/performance-review/creation/create-and-launch-smoke.spec.js",
    "tests/functional/performance-review/creation/pr-create-and-launch-smoke.spec.js",
  ],
  [
    "tests/functional/performance-review/creation/create-with-colleagues-options.spec.js",
    "tests/functional/performance-review/creation/pr-create-with-colleagues-options.spec.js",
  ],
  [
    "tests/functional/performance-review/results/view-pr-results-e2e.spec.js",
    "tests/functional/performance-review/results/pr-view-results-e2e.spec.js",
  ],

  // === DEVELOPMENT PLANS ===
  [
    "tests/functional/development-plans/development-plan-comments.spec.js",
    "tests/functional/development-plans/dev-plan-comments.spec.js",
  ],
  [
    "tests/functional/development-plans/development-plan-create-from-template.spec.js",
    "tests/functional/development-plans/dev-plan-create-from-template.spec.js",
  ],
  [
    "tests/functional/development-plans/development-plan-empty-name-validation.spec.js",
    "tests/functional/development-plans/dev-plan-empty-name-validation.spec.js",
  ],
  [
    "tests/functional/development-plans/development-plan-template-goals.spec.js",
    "tests/functional/development-plans/dev-plan-template-goals.spec.js",
  ],
  [
    "tests/functional/development-plans/development-plan-templates.spec.js",
    "tests/functional/development-plans/dev-plan-templates.spec.js",
  ],

  // === SECURITY ===
  [
    "tests/security/e2e/admin-access.spec.js",
    "tests/security/e2e/security-admin-access.spec.js",
  ],

  // === API TESTS (унификация: точки -> дефисы) ===
  [
    "tests/functional/api/health.smoke.api.spec.js",
    "tests/functional/api/api-health-smoke.spec.js",
  ],
  [
    "tests/functional/api/auth.smoke.api.spec.js",
    "tests/functional/api/api-auth-smoke.spec.js",
  ],
  [
    "tests/functional/api/manager.smoke.api.spec.js",
    "tests/functional/api/api-manager-smoke.spec.js",
  ],
  [
    "tests/functional/api/private.smoke.api.spec.js",
    "tests/functional/api/api-private-smoke.spec.js",
  ],
  [
    "tests/functional/api/feedback.api.spec.js",
    "tests/functional/api/feedback-crud-api.spec.js",
  ],
  [
    "tests/functional/api/feedback.negative.api.spec.js",
    "tests/functional/api/feedback-negative-api.spec.js",
  ],
  [
    "tests/functional/api/feedback.requests.api.spec.js",
    "tests/functional/api/feedback-requests-api.spec.js",
  ],
  [
    "tests/functional/api/feedback.statistics.api.spec.js",
    "tests/functional/api/feedback-statistics-api.spec.js",
  ],
  [
    "tests/functional/api/survey.api.spec.js",
    "tests/functional/api/survey-crud-api.spec.js",
  ],
  [
    "tests/functional/api/survey.negative.api.spec.js",
    "tests/functional/api/survey-negative-api.spec.js",
  ],
  [
    "tests/functional/api/survey.answer-flow.api.spec.js",
    "tests/functional/api/survey-answer-flow-api.spec.js",
  ],
  [
    "tests/functional/api/survey.group-codes.api.spec.js",
    "tests/functional/api/survey-group-codes-api.spec.js",
  ],
  [
    "tests/functional/api/survey.personal.api.spec.js",
    "tests/functional/api/survey-personal-api.spec.js",
  ],
  [
    "tests/functional/api/survey.reminds.api.spec.js",
    "tests/functional/api/survey-reminds-api.spec.js",
  ],
  [
    "tests/functional/api/survey.statistics.api.spec.js",
    "tests/functional/api/survey-statistics-api.spec.js",
  ],
  [
    "tests/functional/api/survey.validation.api.spec.js",
    "tests/functional/api/survey-validation-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.crud.api.spec.js",
    "tests/functional/api/pr-crud-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.negative.api.spec.js",
    "tests/functional/api/pr-negative-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.workflow.api.spec.js",
    "tests/functional/api/pr-workflow-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.async-workflow.api.spec.js",
    "tests/functional/api/pr-async-workflow-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.cleanup.spec.js",
    "tests/functional/api/pr-cleanup-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.export.api.spec.js",
    "tests/functional/api/pr-export-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.extended.api.spec.js",
    "tests/functional/api/pr-extended-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.receivers.api.spec.js",
    "tests/functional/api/pr-receivers-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.responses.api.spec.js",
    "tests/functional/api/pr-responses-api.spec.js",
  ],
  [
    "tests/functional/api/performance-review.statistics.api.spec.js",
    "tests/functional/api/pr-statistics-api.spec.js",
  ],
  [
    "tests/functional/api/objectives.api.spec.js",
    "tests/functional/api/objectives-crud-api.spec.js",
  ],

  // === SECURITY API ===
  [
    "tests/security/api/survey.security.spec.js",
    "tests/security/api/survey-security-api.spec.js",
  ],
  [
    "tests/security/api/performance-review.security.spec.js",
    "tests/security/api/pr-security-api.spec.js",
  ],
];

let renamed = 0;
let skipped = 0;
let errors = 0;

renames.forEach(([oldPath, newPath]) => {
  try {
    if (!fs.existsSync(oldPath)) {
      console.log("SKIP (not found):", oldPath);
      skipped++;
      return;
    }

    if (fs.existsSync(newPath)) {
      console.log("SKIP (target exists):", newPath);
      skipped++;
      return;
    }

    fs.renameSync(oldPath, newPath);
    console.log(
      "RENAMED:",
      path.basename(oldPath),
      "->",
      path.basename(newPath),
    );
    renamed++;
  } catch (e) {
    console.error("ERROR:", oldPath, e.message);
    errors++;
  }
});

console.log(
  `\nTotal: ${renamed} renamed, ${skipped} skipped, ${errors} errors`,
);
