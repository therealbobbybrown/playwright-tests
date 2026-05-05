#!/usr/bin/env node
/**
 * Автоматическое добавление test.step() во все необработанные тесты objectives-crud-api.spec.js
 *
 * Стратегия:
 * 1. Читаем файл
 * 2. Находим все тесты которые ещё НЕ содержат test.step
 * 3. Для каждого теста анализируем структуру:
 *    - Объявления переменных → await test.step('Подготовить...', ...)
 *    - API вызовы → await test.step('Отправить POST/GET...', ...)
 *    - Проверки expect/assert → await test.step('Проверить...', ...)
 * 4. Сохраняем результат
 */

const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "..",
  "tests",
  "functional",
  "api",
  "objectives-crud-api.spec.js",
);

// Читаем файл
let content = fs.readFileSync(filePath, "utf-8");

console.log("Начало автоматической обработки тестов...\n");

// Паттерн для поиска всех test(...) блоков
const testPattern = /test\((['"`])([^'"`]+)\1[^{]*\{([\s\S]*?)\n  \}\);/g;

let processedCount = 0;
let skippedCount = 0;

content = content.replace(
  testPattern,
  (fullMatch, quote, testName, testBody) => {
    // Пропускаем тесты которые уже содержат test.step
    if (
      testBody.includes("await test.step(") ||
      testBody.includes("test.step(")
    ) {
      skippedCount++;
      return fullMatch;
    }

    console.log(`Обработка теста: "${testName}"`);

    // Анализируем тело теста и оборачиваем в test.step
    let wrappedBody = wrapTestBody(testBody, testName);

    processedCount++;

    // Возвращаем обновлённый тест
    return `test(${quote}${testName}${quote}${fullMatch.substring(fullMatch.indexOf(testName) + testName.length + 2, fullMatch.indexOf("{"))}{\n${wrappedBody}\n  });`;
  },
);

// Сохраняем результат
fs.writeFileSync(filePath, content, "utf-8");

console.log(`\nГотово!`);
console.log(`Обработано тестов: ${processedCount}`);
console.log(`Пропущено (уже с test.step): ${skippedCount}`);

/**
 * Оборачивает тело теста в test.step блоки
 */
function wrapTestBody(body, testName) {
  const lines = body.split("\n");
  const steps = [];
  let currentStep = null;
  let stepLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Пропускаем пустые строки и комментарии
    if (!trimmed || trimmed.startsWith("//")) {
      if (currentStep) {
        stepLines.push(line);
      }
      continue;
    }

    // Определяем тип строки и создаём step
    if (trimmed.startsWith("setSeverity(")) {
      // setSeverity остаётся вне steps
      steps.push({ type: "raw", lines: [line] });
    } else if (trimmed.startsWith("const ") || trimmed.startsWith("let ")) {
      // Начало нового step для подготовки данных
      if (currentStep) {
        steps.push(finishStep(currentStep, stepLines));
        stepLines = [];
      }
      currentStep = "prepare";
      stepLines.push(line);
    } else if (
      trimmed.includes("= await ") &&
      (trimmed.includes("API.") ||
        trimmed.includes("objectivesAPI.") ||
        trimmed.includes("objectivesUserAPI.") ||
        trimmed.includes("objectivesManagerAPI."))
    ) {
      // API вызов
      if (currentStep && currentStep !== "api") {
        steps.push(finishStep(currentStep, stepLines));
        stepLines = [];
      }
      currentStep = "api";
      stepLines.push(line);
    } else if (trimmed.startsWith("expect(") || trimmed.startsWith("assert")) {
      // Проверка
      if (currentStep && currentStep !== "assert") {
        steps.push(finishStep(currentStep, stepLines));
        stepLines = [];
      }
      currentStep = "assert";
      stepLines.push(line);
    } else {
      // Продолжение текущего step
      if (currentStep) {
        stepLines.push(line);
      } else {
        // Неопределённая строка - оставляем как есть
        steps.push({ type: "raw", lines: [line] });
      }
    }
  }

  // Завершаем последний step
  if (currentStep && stepLines.length > 0) {
    steps.push(finishStep(currentStep, stepLines));
  }

  // Формируем итоговый код
  let result = [];
  for (const step of steps) {
    if (step.type === "raw") {
      result.push(...step.lines);
    } else {
      result.push(`    await test.step('${step.description}', async () => {`);
      result.push(...step.lines);
      result.push(`    });`);
      result.push("");
    }
  }

  return result.join("\n");
}

/**
 * Завершает текущий step и возвращает объект
 */
function finishStep(type, lines) {
  let description = "";

  switch (type) {
    case "prepare":
      description = "Подготовить данные для теста";
      break;
    case "api":
      // Пытаемся извлечь метод API
      const apiLine = lines.find((l) => l.includes("await"));
      if (apiLine) {
        if (apiLine.includes(".get")) description = "Отправить GET запрос";
        else if (apiLine.includes(".post") || apiLine.includes(".save"))
          description = "Отправить POST запрос";
        else if (apiLine.includes(".delete"))
          description = "Отправить DELETE запрос";
        else if (apiLine.includes(".patch") || apiLine.includes(".update"))
          description = "Отправить PATCH/PUT запрос";
        else description = "Выполнить API запрос";
      }
      break;
    case "assert":
      // Пытаемся извлечь что проверяется
      const firstAssert = lines.find(
        (l) => l.trim().startsWith("expect(") || l.trim().startsWith("assert"),
      );
      if (firstAssert) {
        if (firstAssert.includes(".status()"))
          description = "Проверить статус ответа";
        else if (firstAssert.includes(".toBeDefined()"))
          description = "Проверить наличие данных";
        else if (firstAssert.includes(".id")) description = "Проверить ID";
        else description = "Проверить результат";
      }
      break;
  }

  // Оборачиваем строки в правильные отступы
  const wrappedLines = lines.map((l) => {
    if (!l.trim()) return l;
    // Добавляем 2 дополнительных пробела для вложенности внутри step
    return "  " + l;
  });

  return {
    type: "step",
    description,
    lines: wrappedLines,
  };
}
