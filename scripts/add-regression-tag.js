// scripts/add-regression-tag.js
// Добавляет @regression к позитивным функциональным тестам для регресс-прогона
import fs from "fs";

// Позитивные тесты для регресс-прогона (ключевые сценарии модулей)
const regressionTests = [
  // Account
  "tests/functional/account/management.spec.js",

  // Development Plans
  "tests/functional/development-plans/development-plan-create-from-template.spec.js",
  "tests/functional/development-plans/development-plan-templates.spec.js",

  // Feedback - ключевые сценарии
  "tests/functional/feedback/request-from-colleague.spec.js",
  "tests/functional/feedback/send-feedback-with-karma-and-gif.spec.js",
  "tests/functional/feedback/send-thanks-public.spec.js",

  // Gift Shop
  "tests/functional/gift-shop/create-gift.spec.js",

  // My Team
  "tests/functional/my-team/my-team.spec.js",

  // Objectives - ключевые сценарии
  "tests/functional/objectives/create.spec.js",
  "tests/functional/objectives/create-company-objective.spec.js",
  "tests/functional/objectives/create-team-objective.spec.js",
  "tests/functional/objectives/objective-edit.spec.js",
  "tests/functional/objectives/objective-delete.spec.js",
  "tests/functional/objectives/objective-multiple-kr.spec.js",

  // Org Structure - ключевые сценарии
  "tests/functional/org-structure/departments/departments-create.spec.js",
  "tests/functional/org-structure/users/users-add.spec.js",
  "tests/functional/org-structure/import.spec.js",

  // Performance Review - ключевые сценарии
  "tests/functional/performance-review/creation/create-with-colleagues-options.spec.js",
  "tests/functional/performance-review/participants/pr-multiple-participants.spec.js",
  "tests/functional/performance-review/results/view-pr-results-e2e.spec.js",

  // Profile
  "tests/functional/profile/additional-info-config-add-blocks.spec.js",

  // Surveys - ключевые сценарии
  "tests/functional/surveys/creation/create-blank-all-question-types.spec.js",
  "tests/functional/surveys/creation/create-from-template.spec.js",
  "tests/functional/surveys/management/survey-copy.spec.js",
  "tests/functional/surveys/publication/create-and-pass-with-departments-full.spec.js",
  "tests/functional/surveys/publication/surveys-create-and-pass-with-groups-full.spec.js",

  // Virtual Currency
  "tests/functional/virtual-currency/settings.spec.js",
];

let updated = 0;

regressionTests.forEach((file) => {
  try {
    let content = fs.readFileSync(file, "utf8");

    // Пропускаем если уже есть @regression
    if (content.includes("@regression")) {
      console.log("Skip (already has @regression):", file);
      return;
    }

    // Добавляем @regression после @functional
    const newContent = content.replace(
      /@functional(?!\s+@regression)/g,
      "@functional @regression",
    );

    if (newContent !== content) {
      fs.writeFileSync(file, newContent);
      console.log("Added @regression:", file);
      updated++;
    }
  } catch (e) {
    console.error("Error:", file, e.message);
  }
});

console.log(`\nTotal updated: ${updated} files`);
