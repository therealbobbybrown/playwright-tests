#!/usr/bin/env python3
"""
Массовое добавление test.step() во все необработанные тесты файла objectives-crud-api.spec.js.
Обрабатывает тесты начиная с секции "Pagination & Filtering" (строка 1277).

Стратегия:
1. Читаем файл
2. Находим все test('...', async (...) => { ... }); которые ещё не содержат test.step
3. Для каждого теста анализируем структуру и добавляем test.step обёртки
"""

import re
import sys

def has_test_steps(test_body):
    """Проверяет содержит ли тело теста уже test.step"""
    return 'await test.step(' in test_body or 'test.step(' in test_body

def count_tests_without_steps(content, start_pos):
    """Подсчитывает количество тестов без test.step начиная с позиции"""
    pattern = r"test\(['\"]([^'\"]+)['\"].*?\{(.*?)\n  \}\);"
    matches = list(re.finditer(pattern, content[start_pos:], re.DOTALL))

    without_steps = 0
    for match in matches:
        test_name = match.group(1)
        test_body = match.group(2)
        if not has_test_steps(test_body):
            without_steps += 1
            print(f"Тест без steps: {test_name}")

    return without_steps

def main():
    file_path = '../tests/functional/api/objectives-crud-api.spec.js'

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Файл не найден: {file_path}")
        sys.exit(1)

    # Находим начало необработанной секции
    start_marker = "test.describe('Objectives API - Pagination & Filtering'"
    start_pos = content.find(start_marker)

    if start_pos == -1:
        print("Маркер начала необработанной секции не найден")
        sys.exit(1)

    print(f"Начало необработанной секции найдено на позиции: {start_pos}")

    # Подсчитываем тесты без steps
    count = count_tests_without_steps(content, start_pos)
    print(f"\nВсего тестов без test.step: {count}")

    # TODO: Добавить логику обработки тестов

if __name__ == '__main__':
    main()
