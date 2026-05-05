/**
 * Shared utilities for TestRail step generation.
 * Used by cli.cjs (push-steps, sync-steps) and upload-*.cjs scripts.
 */

/**
 * Очистить текст шага от Playwright-локаторов и кодовых артефактов.
 * Превращает raw-локаторы (class*=..., locator(...), .filter({...})) в читаемый текст.
 */
function sanitizeStepContent(content) {
  return (
    content
      // locator('[class*="SomeComponent"]') → ''
      .replace(/locator\(['"][^'"]*['"]\)/g, "")
      // .filter({ has: locator(...) }) → ''
      .replace(/\.filter\(\{[^}]*\}\)/g, "")
      // .first(), .last(), .nth(N) → ''
      .replace(/\.(first|last|nth)\(\d*\)/g, "")
      // [class*="..."], a[href*="..."], [role="..."] → ''
      .replace(/\[(?:class|href|role|data-[\w-]+)\*?="[^"]*"\]/g, "")
      // CSS-селекторы вида div.ClassName, span.ClassName → ''
      .replace(/(?:div|span|button|input|a)\.[A-Z][\w_-]+/g, "")
      // page.locator(...), page.getByRole(...) → ''
      .replace(/page\.\w+\([^)]*\)/g, "")
      // Удаляем осиротевшие скобки и лишние пробелы
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Сгенерировать человекочитаемый ожидаемый результат по названию шага.
 * Извлекает суть из "Проверить что X" → "X", использует паттерны для типовых действий.
 */
function generateExpected(stepName) {
  const s = stepName.toLowerCase();

  // ========== ФАЗА 1: Извлечение сути из структурированных шагов ==========

  // "Шаг N: X" → рекурсия на X (убираем нумерацию)
  const stepNumMatch = stepName.match(/^шаг\s+\d+:\s*(.+)/i);
  if (stepNumMatch) {
    return generateExpected(stepNumMatch[1]);
  }

  // "Проверить что X" → "X"
  const checkThatMatch = stepName.match(/проверить,?\s+что\s+(.+)/i);
  if (checkThatMatch) {
    return capitalizeFirst(checkThatMatch[1].trim());
  }

  // "Убедиться что X" → "X"
  const ensureMatch = stepName.match(/убедиться,?\s+что\s+(.+)/i);
  if (ensureMatch) {
    return capitalizeFirst(ensureMatch[1].trim());
  }

  // "Проверить наличие X" → "X отображается"
  const presenceMatch = stepName.match(
    /проверить\s+(?:наличие|отображение)\s+(.+)/i,
  );
  if (presenceMatch) {
    return `${capitalizeFirst(presenceMatch[1])} отображается`;
  }

  // "Проверить отсутствие X" → "X не отображается"
  const absenceMatch = stepName.match(/проверить\s+отсутствие\s+(.+)/i);
  if (absenceMatch) {
    return `${capitalizeFirst(absenceMatch[1])} не отображается`;
  }

  // "Проверить через API: X" / "Проверить в PDF: X" / "Проверить в БД: X" / "Проверить XLSX: X" / "Проверить: X"
  // Любой текст между "Проверить" и ":" — контекст, после ":" — суть проверки
  const colonCheckMatch = stepName.match(/проверить[^:]*:\s*(.+)/i);
  if (colonCheckMatch) {
    return capitalizeFirst(colonCheckMatch[1].trim());
  }

  // "DB: X" → "X" (шаги с префиксом DB:)
  const dbPrefixMatch = stepName.match(/^DB:\s*(.+)/i);
  if (dbPrefixMatch) {
    return capitalizeFirst(dbPrefixMatch[1].trim());
  }

  // ========== ФАЗА 2: Формат-специфичные действия ==========

  // "Скачать ... PDF/PPTX/XLSX/CSV ..." → "PDF-файл скачан и доступен для проверки"
  const downloadFormatMatch = s.match(/скачать\s+.*?\b(pdf|pptx|xlsx|csv)\b/i);
  if (downloadFormatMatch) {
    return `${downloadFormatMatch[1].toUpperCase()}-файл скачан и доступен для проверки`;
  }

  // ========== ФАЗА 2.5: API-специфичные паттерны ==========

  // HTTP method + endpoint: "Отправить POST /survey/create" → "POST запрос выполнен успешно"
  if (
    s.includes("отправить") ||
    s.includes("выполнить запрос") ||
    s.includes("send")
  ) {
    if (s.includes("post")) return "POST запрос выполнен успешно";
    if (s.includes("put")) return "PUT запрос выполнен успешно";
    if (s.includes("patch")) return "PATCH запрос выполнен успешно";
    if (s.includes("delete")) return "DELETE запрос выполнен успешно";
    if (s.includes("get")) return "GET запрос выполнен успешно";
    return "API запрос выполнен успешно";
  }

  // Status code patterns: "Проверить статус 200" → "Ответ содержит статус 200 OK"
  if (s.includes("статус") || s.includes("status")) {
    if (s.includes("200")) return "Ответ содержит статус 200 OK";
    if (s.includes("201")) return "Ответ содержит статус 201 Created";
    if (s.includes("204")) return "Ответ содержит статус 204 No Content";
    if (s.includes("400"))
      return "Ответ содержит ошибку валидации — 400 (ожидаемо)";
    if (s.includes("401"))
      return "Запрос отклонён — 401 Unauthorized (ожидаемо)";
    if (s.includes("403")) return "Запрос отклонён — 403 Forbidden (ожидаемо)";
    if (s.includes("404")) return "Ресурс не найден — 404 (ожидаемо)";
    if (s.includes("409")) return "Конфликт — 409 (ожидаемо)";
    if (s.includes("422")) return "Ошибка валидации — 422 (ожидаемо)";
    if (s.includes("429")) return "Rate limit — 429 (ожидаемо)";
    if (s.includes("500")) return "Серверная ошибка — 500";
  }

  // API verification layers: "Проверить через API: ..." and "Проверить в БД: ..."
  // (handled by ФАЗА 1 "Проверить через X: ..." pattern already)

  // RBAC / permission step patterns
  if (s.includes("авториз") && (s.includes("как") || s.includes("под")))
    return "Авторизация выполнена под указанной ролью";
  if (
    s.includes("без авториз") ||
    s.includes("без токен") ||
    s.includes("without auth")
  )
    return "Запрос выполнен без авторизации";
  if (s.includes("невалидн") && s.includes("токен"))
    return "Запрос выполнен с невалидным токеном";

  // Response body patterns
  if (
    s.includes("проверить тело") ||
    s.includes("проверить ответ") ||
    s.includes("verify response")
  )
    return "Тело ответа соответствует ожиданиям";
  if (s.includes("проверить структур") || s.includes("verify structure"))
    return "Структура ответа соответствует контракту";
  if (s.includes("проверить пагинац") || s.includes("pagination"))
    return "Пагинация работает корректно";
  if (s.includes("проверить сортировк") || s.includes("sorting"))
    return "Сортировка работает корректно";
  if (s.includes("проверить фильтрац") || s.includes("filtering"))
    return "Фильтрация работает корректно";

  // Seed / data preparation
  if (s.includes("seed") || s.includes("создать тестов"))
    return "Тестовые данные подготовлены";
  if (s.includes("подготовить payload") || s.includes("prepare payload"))
    return "Payload подготовлен";
  if (s.includes("cleanup") || s.includes("очист")) return "Данные очищены";

  // ========== ФАЗА 3: Specific patterns (object-aware) ==========

  if (s.includes("открыть") && s.includes("страниц")) return "Страница открыта";
  if (s.includes("открыть") && s.includes("модал"))
    return "Модальное окно открыто";
  if (s.includes("создать") && s.includes("pr")) return "PR создан";
  if (s.includes("создать") && s.includes("оценк")) return "Оценка создана";
  if (s.includes("создать") && s.includes("цел")) return "Цель создана";
  if (s.includes("создать") && s.includes("опрос")) return "Опрос создан";
  if (s.includes("создать") && s.includes("благодарность"))
    return "Благодарность создана";
  if (s.includes("заполнить") && s.includes("самооценк"))
    return "Самооценка заполнена и отправлена";
  if (s.includes("заполнить") && s.includes("анкет"))
    return "Анкета заполнена и отправлена";
  if (s.includes("заполнить") && s.includes("форм")) return "Форма заполнена";
  if (s.includes("запустить") && s.includes("pr"))
    return "PR запущен, анкеты отправлены";
  if (s.includes("утверд") && s.includes("коллег")) return "Коллеги утверждены";
  if (s.includes("выбрать") && s.includes("коллег")) return "Коллеги выбраны";
  if (s.includes("получить") && s.includes("пользовател"))
    return "Список пользователей получен";
  if (s.includes("добавить") && s.includes("участник"))
    return "Участники добавлены";

  // Negative/permission: "пытается/попытка" + "отказ/403" — ПЕРЕД калибровочными, чтобы не поглотились
  if (
    (s.includes("пытается") || s.includes("попытка")) &&
    (s.includes("403") || s.includes("отказ"))
  )
    return "Запрос отклонён с ошибкой доступа (ожидаемо)";
  if (
    (s.includes("пытается") || s.includes("попытка")) &&
    s.includes("ожидаем")
  )
    return "Запрос отклонён (ожидаемо)";

  // Blocking/locking — ПЕРЕД калибровочными (содержат слово "калибровк")
  if (s.includes("снимает блокировк") || s.includes("разблокиро"))
    return "Блокировка снята";
  if (s.includes("блокиру") || s.includes("islocked"))
    return "Блокировка калибровки установлена";

  // UI actions — ПЕРЕД калибровочными (содержат "калибровк" в контексте)
  if (s.includes("найти") && s.includes("карандаш"))
    return "Сотрудник найден, карандаш виден";
  if (s.includes("переоткрыть") && s.includes("модалк"))
    return "Модалка переоткрыта";
  if (s.includes("закрыть") && s.includes("модал"))
    return "Модальное окно закрыто";
  if (s.includes("дождаться")) return "Ожидание завершено, данные обновлены";

  // Settings/config — ПЕРЕД калибровочными (слово "калибровку" в контексте включения/выключения)
  if (s.includes("включить") && s.includes("дропдаун"))
    return "Дропдаун режим активирован";
  if (s.includes("включить") && s.includes("калибровк") && s.includes("настр"))
    return "Калибровка включена, настройки применены";
  if (
    s.includes("включить") &&
    (s.includes("калибровк") || s.includes("режим"))
  )
    return "Режим включён";
  if (
    s.includes("выключить") &&
    (s.includes("калибровк") || s.includes("режим"))
  )
    return "Режим выключен";
  if (s.includes("переключить")) return "Режим переключён";
  if (s.includes("вернуть") && s.includes("режим")) return "Режим восстановлен";
  if (s.includes("настроить") || s.includes("настройк"))
    return "Настройки применены";

  // Calibration action — только когда "откалибровать" = главный глагол
  if (s.includes("откалибровать")) return "Калибровка выполнена";

  // Data prep / infrastructure
  if (s.includes("запомнить") || s.includes("зафиксировать"))
    return "Данные зафиксированы для сравнения";
  if (s.includes("прогре") && s.includes("статистик"))
    return "Статистика прогрета (кеш заполнен)";
  if (s.includes("прогре")) return "Данные прогреты";
  if (s.includes("получить") && s.includes("revis")) return "Ревизия получена";
  if (
    s.includes("получить") &&
    (s.includes("target") || s.includes("оцениваем"))
  )
    return "Список оцениваемых получен";
  if (s.includes("получить") && s.includes("вопрос"))
    return "Вопросы и характеристики получены";
  if (s.includes("получить") && s.includes("данн")) return "Данные получены";

  // Export/download (fallback after format-specific)
  if (s.includes("экспорт") || s.includes("скачать"))
    return "Файл экспортирован/скачан";

  // PR lifecycle
  if (s.includes("завершить") && s.includes("pr")) return "PR завершён";
  if (s.includes("создани") && s.includes("pr")) return "PR создан";

  // ========== ФАЗА 4: Action verbs (generic) ==========

  if (s.includes("создани") || (s.includes("создать") && s.includes("pr")))
    return "PR создан";
  if (s.includes("открыть") || s.includes("перейти"))
    return "Страница/раздел открыт";
  if (s.includes("нажать") || s.includes("кликнуть"))
    return "Действие выполнено";
  if (
    s.includes("ввести") &&
    (s.includes("значени") || s.includes("оценк") || s.includes("поле"))
  )
    return "Значение введено в поле";
  if (s.includes("заполнить") || s.includes("ввести")) return "Данные введены";
  if (s.includes("очистить") && s.includes("поле")) return "Поле очищено";
  if (s.includes("изменить") && s.includes("компетенци"))
    return "Оценка компетенции изменена";
  if (s.includes("изменить") && s.includes("порог")) return "Пороги изменены";
  if (s.includes("изменить")) return "Значение изменено";
  if (s.includes("удалить") && s.includes("характеристик"))
    return "Характеристика удалена из настроек";
  if (s.includes("проверить") || s.includes("убедиться"))
    return "Проверка пройдена";
  if (s.includes("создать") || s.includes("добавить")) return "Объект создан";
  if (s.includes("сохранить")) return "Изменения сохранены";
  if (s.includes("удалить")) return "Объект удалён";
  if (s.includes("выбрать") && s.includes("характеристик"))
    return "Характеристика выбрана";
  if (s.includes("выбрать")) return "Выбор выполнен";
  if (s.includes("фильтр")) return "Фильтр применён";
  if (s.includes("загрузить") || s.includes("подгрузить"))
    return "Данные загружены";
  if (s.includes("авторизоваться") || s.includes("войти"))
    return "Авторизация выполнена";
  if (s.includes("выйти") || s.includes("logout")) return "Выход выполнен";
  if (s.includes("получить")) return "Данные получены";
  if (s.includes("подготовить")) return "Данные подготовлены";

  // Паттерны "Субъект + глагол" → переформулируем как результат
  if (s.includes("утвержда") && s.includes("коллег"))
    return "Коллеги утверждены";
  if (s.includes("заполня") && s.includes("самооценк"))
    return "Самооценка заполнена";
  if (s.includes("заполня") && s.includes("анкет")) return "Анкеты заполнены";
  if (s.includes("выбира") && s.includes("коллег")) return "Коллеги выбраны";
  if (s.includes("открывает") || s.includes("переходит"))
    return "Страница/раздел открыт";
  if (s.includes("калибрует")) return "Калибровка выполнена";
  if (s.includes("запуска")) return "Запуск выполнен";
  if (s.includes("отправля")) return "Отправка выполнена";

  // "Получение X" / "Создание X" / "Настройка X" — отглагольные существительные
  if (s.startsWith("получение") || s.startsWith("получени"))
    return "Данные получены";
  if (s.startsWith("создание") || s.startsWith("создани"))
    return "Объект создан";
  if (s.startsWith("настройка") || s.startsWith("настройк"))
    return "Настройки применены";

  return `Выполнено: ${stepName.substring(0, 80)}`;
}

/** Capitalize first letter (preserving rest) */
function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Build TestRail steps array from raw step titles.
 * Applies sanitization + readable expected generation.
 * @param {string[]} stepTitles - Raw step titles from test.step()
 * @param {RegExp[]} [excludePatterns=[]] - Patterns to exclude
 * @returns {{ content: string, expected: string, additional_info: string, refs: string }[]}
 */
function buildTestRailSteps(stepTitles, excludePatterns = []) {
  return stepTitles
    .filter((s) => !excludePatterns.some((p) => p.test(s)))
    .map((stepTitle) => {
      const cleaned = sanitizeStepContent(stepTitle);
      return {
        content: cleaned || stepTitle,
        expected: generateExpected(cleaned || stepTitle),
        additional_info: "",
        refs: "",
      };
    })
    .filter((s) => s.content); // skip empty after sanitization
}

module.exports = {
  sanitizeStepContent,
  generateExpected,
  capitalizeFirst,
  buildTestRailSteps,
};
