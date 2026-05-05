const fs = require("fs");
const data = JSON.parse(
  fs.readFileSync(
    "c:/Users/Polarfox/playwright-tests/docs/testrail-jinn-cases.json",
    "utf8",
  ),
);

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function formatSteps(steps) {
  if (!steps) return "Шаги не указаны";
  if (typeof steps === "string") return stripHtml(steps);
  if (!Array.isArray(steps)) return "Шаги не указаны";

  return steps
    .map((step, i) => {
      const content = stripHtml(step.content || step.step || "");
      const expected = stripHtml(step.expected || "");
      let result = `${i + 1}. ${content}`;
      if (expected) {
        result += `\n   **Ожидаемый результат:** ${expected}`;
      }
      return result;
    })
    .join("\n\n");
}

function generateModuleDoc(moduleName, filterFn, filename) {
  const cases = [];
  data.sections.forEach((section) => {
    if (filterFn(section.sectionPath.toLowerCase())) {
      section.cases.forEach((c) => {
        cases.push({
          id: c.id,
          title: c.title,
          priority: c.priority,
          section: section.sectionPath,
          preconditions: stripHtml(c.preconditions),
          steps: formatSteps(c.steps),
          expected: stripHtml(c.expected),
        });
      });
    }
  });

  let output = `# Модуль: ${moduleName} - TestRail Test Cases\n\n`;
  output += `**Всего кейсов:** ${cases.length}\n\n`;
  output += "---\n\n";

  cases.forEach((tc) => {
    output += `## C${tc.id}: ${tc.title}\n\n`;
    output += `**Секция:** ${tc.section}\n`;
    output += `**Приоритет:** P${5 - tc.priority}\n\n`;
    if (tc.preconditions) {
      output += `### Предусловия\n${tc.preconditions}\n\n`;
    }
    output += `### Шаги\n${tc.steps}\n\n`;
    if (tc.expected) {
      output += `### Ожидаемый результат\n${tc.expected}\n\n`;
    }
    output += "---\n\n";
  });

  fs.writeFileSync(
    `c:/Users/Polarfox/playwright-tests/docs/${filename}`,
    output,
  );
  console.log(`Created: ${filename} (${cases.length} cases)`);
}

// Generate docs for each module
generateModuleDoc(
  "Сценарии",
  (p) => p.includes("сценарии"),
  "testrail-cases-scenarios.md",
);
generateModuleDoc(
  "Развитие (ИПР)",
  (p) => p.includes("развитие") || p.includes("ипр"),
  "testrail-cases-ipr.md",
);
generateModuleDoc(
  "Цели (OKR)",
  (p) => p.includes("цели") || p.includes("okr"),
  "testrail-cases-okr.md",
);
generateModuleDoc(
  "Опросы",
  (p) => p.includes("опрос"),
  "testrail-cases-surveys.md",
);
generateModuleDoc(
  "Оценка",
  (p) => p.includes("оценка"),
  "testrail-cases-assessment.md",
);
generateModuleDoc(
  "Фидбек",
  (p) => p.includes("фидбек"),
  "testrail-cases-feedback.md",
);
generateModuleDoc(
  "Бэкофис",
  (p) => p.includes("бэкофис"),
  "testrail-cases-backoffice.md",
);
generateModuleDoc(
  "Оргструктура",
  (p) => p.includes("оргструктура"),
  "testrail-cases-orgstructure.md",
);
generateModuleDoc(
  "Права пользователей",
  (p) => p.includes("права") || p.includes("настройка. права"),
  "testrail-cases-permissions.md",
);

console.log("\nAll docs generated!");
