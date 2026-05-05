// scripts/fix-tags.js
// Заменяет @regression на @functional @negative в негативных тестах
import fs from "fs";
import { globSync } from "glob";

// Негативные тесты (валидация, ошибки) - заменяем @regression на @functional @negative
const negativeTests = [
  "tests/functional/development-plans/development-plan-empty-name-validation.spec.js",
  "tests/functional/feedback/feedback-cannot-send-to-self.spec.js",
  "tests/functional/feedback/feedback-invalid-karma-points.spec.js",
  "tests/functional/feedback/feedback-text-length-limit.spec.js",
  "tests/functional/feedback/feedback-validation-empty-body.spec.js",
  "tests/functional/feedback/feedback-validation-no-recipient.spec.js",
  "tests/functional/objectives/objective-empty-kr-validation.spec.js",
  "tests/functional/objectives/objective-empty-title-validation.spec.js",
  "tests/functional/objectives/objective-without-kr-validation.spec.js",
  "tests/functional/org-structure/department-empty-name-validation.spec.js",
  "tests/functional/org-structure/users/users-add-duplicate-email.spec.js",
  "tests/functional/org-structure/users/users-add-empty-email.spec.js",
  "tests/functional/org-structure/users/users-add-empty-name.spec.js",
  "tests/functional/org-structure/users/users-add-invalid-email.spec.js",
  "tests/functional/performance-review/validation/pr-validation.spec.js",
  "tests/functional/performance-review/validation/pr-without-participants-validation.spec.js",
  "tests/functional/surveys/creation/survey-empty-answer-option-validation.spec.js",
  "tests/functional/surveys/creation/survey-empty-question-text-validation.spec.js",
];

// Позитивные тесты с @regression - добавляем @functional
const positiveRegressionTests = [
  "tests/functional/surveys/results/survey-results-view.spec.js",
];

let updated = 0;

// Обрабатываем негативные тесты
negativeTests.forEach((file) => {
  try {
    let content = fs.readFileSync(file, "utf8");

    // Заменяем @regression на @functional @negative
    const newContent = content.replace(/@regression/g, "@functional @negative");

    if (newContent !== content) {
      fs.writeFileSync(file, newContent);
      console.log("Negative:", file);
      updated++;
    }
  } catch (e) {
    console.error("Error:", file, e.message);
  }
});

// Обрабатываем позитивные тесты с @regression
positiveRegressionTests.forEach((file) => {
  try {
    let content = fs.readFileSync(file, "utf8");

    // Заменяем @regression на @functional @regression
    const newContent = content.replace(
      /@regression/g,
      "@functional @regression",
    );

    if (newContent !== content) {
      fs.writeFileSync(file, newContent);
      console.log("Positive regression:", file);
      updated++;
    }
  } catch (e) {
    console.error("Error:", file, e.message);
  }
});

console.log(`\nTotal updated: ${updated} files`);
