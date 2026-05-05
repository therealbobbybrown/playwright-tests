#!/usr/bin/env node
/**
 * Build Knowledge Base PDF from docs/01-14 markdown files.
 * Adds: title page, TOC, page breaks between sections, glossary.
 *
 * Usage: node scripts/build-kb-pdf.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_MD = path.join(DOCS_DIR, '_kb_combined.md');
const OUTPUT_PDF = path.join(DOCS_DIR, 'Apprs_Knowledge_Base.pdf');

const FILES = [
  '01_OVERVIEW.md',
  '02_PERFORMANCE_REVIEW.md',
  '03_SURVEYS.md',
  '04_FEEDBACK.md',
  '05_OBJECTIVES.md',
  '06_ORG_STRUCTURE.md',
  '07_VIRTUAL_CURRENCY.md',
  '08_MAPS_AND_FLOWS.md',
  '09_HOME_PROFILE.md',
  '10_MY_TEAM_DASHBOARD.md',
  '11_DEVELOPMENT_PLANS.md',
  '12_SCENARIOS.md',
  '13_COMPETENCIES_ASSESSMENTS.md',
  '14_SETTINGS.md',
];

const SECTION_NAMES = {
  '01_OVERVIEW.md': 'Обзор системы',
  '02_PERFORMANCE_REVIEW.md': 'Performance Review',
  '03_SURVEYS.md': 'Опросы (Surveys)',
  '04_FEEDBACK.md': 'Обратная связь (Feedback)',
  '05_OBJECTIVES.md': 'Цели (Objectives / OKR)',
  '06_ORG_STRUCTURE.md': 'Организационная структура',
  '07_VIRTUAL_CURRENCY.md': 'Виртуальная валюта и Магазин подарков',
  '08_MAPS_AND_FLOWS.md': 'Карты переходов и взаимного влияния',
  '09_HOME_PROFILE.md': 'Главная страница и Профиль сотрудника',
  '10_MY_TEAM_DASHBOARD.md': 'Моя команда (дашборд руководителя)',
  '11_DEVELOPMENT_PLANS.md': 'Индивидуальные планы развития (ИПР)',
  '12_SCENARIOS.md': 'Сценарии (автоматизация)',
  '13_COMPETENCIES_ASSESSMENTS.md': 'Компетенции и анкеты',
  '14_SETTINGS.md': 'Настройки администратора',
};

const GLOSSARY = `
# Глоссарий

| Термин | Описание |
|--------|----------|
| **PR (Performance Review)** | Оценка сотрудников методом 360 градусов |
| **Ревизия (Revision)** | Версия PR или опроса. Каждый новый цикл создает новую ревизию с отдельными данными |
| **Цикл (Cycle)** | Один прогон оценки в рамках одного PR. Новый цикл = новая ревизия |
| **Направление оценки** | Категория респондентов: самооценка, руководитель, коллеги, подчиненные |
| **Номинация** | Этап, на котором сотрудники сами предлагают коллег для своей оценки |
| **Калибровка** | Ручная корректировка итоговых баллов администратором для выравнивания оценок |
| **ScoreOnly** | Режим доступа к результатам: сотрудник видит только итоговый балл без детализации |
| **Полный доступ (finalAndResults)** | Режим доступа: сотрудник видит итоговый балл + детализацию по компетенциям + комментарии |
| **Resume (Возобновление)** | Повторное открытие завершенной оценки для сбора дополнительных ответов |
| **Компетенция** | Навык или качество, оцениваемое в PR (например, "Коммуникация", "Лидерство") |
| **Шкала оценки** | Диапазон значений для оценки компетенции (например, 1-5, с именованными ступенями) |
| **Анкета (Assessment)** | Набор вопросов для оценки, привязанных к компетенциям |
| **Опросник (Questionnaire)** | Структура вопросов внутри анкеты: страницы, вопросы, варианты ответов |
| **NPS (Net Promoter Score)** | Индекс лояльности: шкала 0-10, формула: % промоутеров - % критиков |
| **ИПР (Индивидуальный план развития)** | План профессионального роста с целями, вехами и сроками |
| **Веха (Milestone)** | Конкретная задача в ИПР с измеримым показателем (процент, число, да/нет) |
| **Куратор** | Сотрудник, назначенный контролировать выполнение ИПР |
| **Сценарий** | Автоматизация HR-процессов по принципу "N-й день" (например, онбординг) |
| **Действие (Action)** | Конкретная задача в сценарии, привязанная к определенному дню |
| **Исполнитель (Performer)** | Сотрудник, назначенный на сценарий |
| **Виртуальная валюта (Karma)** | Система баллов: начисление, перевод между сотрудниками, покупка в магазине |
| **NineBox** | Матрица 3x3 для классификации сотрудников по двум осям (результат x потенциал) |
| **Порог конфиденциальности** | Минимум уникальных респондентов для показа статистики по сегменту (мин. 3) |
| **Кастомная роль** | Роль с произвольным набором прав, созданная администратором (type=custom в БД) |
| **Тепловая карта (Heatmap)** | Визуализация оценок цветом: зеленый=высокий, красный=низкий |
| **Текстовая характеристика** | Словесная категория вместо числа (напр. "Превышает ожидания", "Соответствует") |
| **result_access** | Поле БД: \`head\` = только руководитель видит, \`user\` = сотрудник тоже видит |
| **content_access** | Поле БД: \`final\` = только балл, \`finalAndResults\` = балл + детализация |
| **meanOverwrite** | Перезаписанная итоговая оценка после калибровки |
| **Lock (Блокировка)** | Фиксация калиброванной оценки, чтобы другие руководители не могли ее изменить |
`;

// --- Build ---

const today = new Date().toISOString().slice(0, 10);

let combined = '';

// Title page
combined += `<div style="text-align:center; padding-top: 200px;">

# Apprs — База знаний

### HR-платформа для управления персоналом

---

**Версия:** ${today}

**Верифицировано:** лимиты полей по БД, enum-значения статусов, структуры таблиц

**Содержание:** 14 разделов, глоссарий

</div>

<div style="page-break-after: always;"></div>

`;

// TOC
combined += `# Содержание\n\n`;
FILES.forEach((file, i) => {
  const num = String(i + 1).padStart(2, ' ');
  const name = SECTION_NAMES[file] || file;
  combined += `${num}. ${name}\n`;
});
combined += `\n15. Глоссарий терминов\n`;
combined += `\n<div style="page-break-after: always;"></div>\n\n`;

// Sections
FILES.forEach((file, i) => {
  const filePath = path.join(DOCS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing: ${file}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf-8');

  // Remove "Дальнейшее чтение" sections (links don't work in PDF)
  content = content.replace(/## Дальнейшее чтение[\s\S]*?(?=\n#|$)/, '');

  combined += content.trim();
  combined += '\n\n';

  // Page break after each section except the last
  if (i < FILES.length - 1) {
    combined += `<div style="page-break-after: always;"></div>\n\n`;
  }
});

// Glossary
combined += `<div style="page-break-after: always;"></div>\n\n`;
combined += GLOSSARY.trim();
combined += '\n';

fs.writeFileSync(OUTPUT_MD, combined, 'utf-8');
console.log(`Combined markdown: ${OUTPUT_MD} (${combined.split('\n').length} lines)`);

// Generate PDF using md-to-pdf API (avoids Windows shell quoting issues)
async function generatePdf() {
  const { mdToPdf } = require('md-to-pdf');

  try {
    const pdf = await mdToPdf(
      { path: OUTPUT_MD },
      {
        pdf_options: {
          format: 'A4',
          margin: { top: '20mm', bottom: '25mm', left: '15mm', right: '15mm' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#888;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        },
      }
    );

    if (pdf && pdf.content) {
      try { fs.unlinkSync(OUTPUT_PDF); } catch {}
      fs.writeFileSync(OUTPUT_PDF, pdf.content);
      const size = (fs.statSync(OUTPUT_PDF).size / 1024 / 1024).toFixed(1);
      console.log(`PDF generated: ${OUTPUT_PDF} (${size} MB)`);
    }
  } catch (err) {
    console.error('PDF generation failed:', err.message);
  } finally {
    try { fs.unlinkSync(OUTPUT_MD); } catch {}
  }
}

generatePdf();
