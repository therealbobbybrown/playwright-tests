/**
 * Общие CSS селекторы для Page Objects
 *
 * Селекторы с CSS-modules (class*=) вынесены сюда для:
 * - Единообразия при изменении стилей
 * - Избежания дублирования
 * - Удобного поиска и замены
 *
 * Использование:
 * import { SELECTORS } from '../tests/utils/selectors.js';
 * this.page.locator(SELECTORS.MENU_ITEM_TITLE);
 */

export const SELECTORS = {
  // ========================
  // Меню и навигация
  // ========================
  /** Заголовок пункта меню в боковом меню */
  MENU_ITEM_TITLE: '[class*="Menu_menu-item-title__"]',
  /** Пункт popup-меню (контекстное меню) */
  MENU_POPUP_ITEM: '[class*="MenuPopup_item__"]',
  /** Кнопка открытия popup-меню */
  MENU_POPUP_TOGGLE: '[class*="MenuPopupToggle_button__"]',

  // ========================
  // Модальные окна
  // ========================
  /** Sheet-модалка (нижняя выезжающая панель) */
  SHEET_MODAL: '[class*="SheetModal"]',
  /** Контент sheet-модалки */
  SHEET_MODAL_CONTENT: ".react-modal-sheet-content",
  /** Контейнер sheet-модалки */
  SHEET_MODAL_CONTAINER: ".react-modal-sheet-container",

  // ========================
  // Орг. структура
  // ========================
  /** Верхнее меню на страницах орг. структуры */
  ORG_STRUCTURE_TOP_MENU: 'div[class*="OrgStructure_layout-top-menu"]',
  /** Селектор вида (Структура компании / Список сотрудников) */
  VIEW_SELECT: 'div[class*="ViewSelect_view-select"]',
  /** Кнопка экспорта пользователей */
  USERS_EXPORT_BUTTON: 'button[class*="UsersExportButton_users-export-button"]',

  // ========================
  // Опции и выбор
  // ========================
  /** Опция в списке выбора (role=option) */
  ROLE_OPTION: '[role="option"]',
  /** Пункт меню (role=menuitem) */
  ROLE_MENUITEM: '[role="menuitem"]',
  /** Опция в списке (CSS-модули) */
  OPTION_ITEM: '[class*="Option_option"]',

  // ========================
  // Тосты и уведомления
  // ========================
  /** Тост-уведомление */
  TOAST: '[class*="Toast_toast"], [class*="Toastify"]',

  // ========================
  // Кнопки и иконки
  // ========================
  /** Иконка удаления в теге */
  TAG_DELETE_ICON: '[class*="Tag_deleteIcon"]',
  /** Тег (chip) */
  TAG: '[class*="Tag_tag"]',

  // ========================
  // Таблицы
  // ========================
  /** Таблица пользователей */
  USERS_TABLE: 'table[class*="UsersTable_table__"]',

  // ========================
  // Секции и блоки
  // ========================
  /** Секция настроек */
  SETTINGS_BLOCK: "div.SettingsBlock_container___Acoc",
  /** Заголовок секции */
  SECTION_TITLE: "div.Section_section-title__",

  // ========================
  // Футер модалки
  // ========================
  /** Контейнер футера */
  FOOTER_CONTAINER: '[class*="Footer_container"]',
  /** Кнопка сохранения в футере */
  FOOTER_SAVE_BUTTON: 'button[class*="Footer_saveButton"]',

  // ========================
  // Дерево и списки
  // ========================
  /** Элемент дерева */
  TREE_ITEM: '[class*="TreeItem_item"]',
  /** Меню дерева */
  TREE_MENU: 'div[class*="TreeMenu_menu"]',

  // ========================
  // Формы
  // ========================
  /** Чекбокс отдела */
  DEPARTMENT_CHECKBOX: '[class*="DepartmentOption_checkBox"]',
  /** Чекбокс группы */
  GROUP_CHECKBOX: '[class*="GroupOption_checkBox"]',

  // ========================
  // Модалка результатов сотрудника
  // ========================
  /** Заголовок модалки с именем сотрудника */
  EMPLOYEE_RESULTS_HEADER:
    '[class*="ResultsModal_header"], [class*="EmployeeHeader"]',
  /** Секция участников оценки */
  PARTICIPANTS_SECTION:
    '[class*="Participants_section"], [class*="ParticipantsSection"]',
  /** Круговая диаграмма участников */
  PARTICIPANTS_DONUT: '[class*="Donut"], [class*="ParticipantsChart"]',
  /** Контент AI саммари */
  AI_SUMMARY_CONTENT:
    '[class*="AiSummary_content"], [class*="AiSummaryContent"]',
  /** Секция результатов оценки */
  ASSESSMENT_RESULTS:
    '[class*="Results_container"], [class*="AssessmentResults"]',

  // ========================
  // Роли и разрешения
  // ========================
  /** Таблица ролей */
  ROLES_TABLE: '[class*="RolesTable"], table[class*="Table"]',
  /** Строка таблицы ролей */
  ROLES_TABLE_ROW: '[class*="RolesTable"] tbody tr, table tbody tr',
  /** Ячейка с названием роли */
  ROLE_NAME_CELL: '[class*="RoleCell_name"], td:first-child',
  /** Ячейка с разрешениями */
  ROLE_PERMISSIONS_CELL: '[class*="RoleCell_permissions"], td:nth-child(2)',
  /** Кнопка создания роли */
  CREATE_ROLE_BUTTON:
    'button:has-text("Создать роль"), button:has-text("Добавить роль")',
  /** Форма роли (модалка) */
  ROLE_FORM: '[class*="RoleForm"], [class*="RightSheetModal"]',
  /** Поле названия роли */
  ROLE_TITLE_INPUT: 'input[name="title"], input#title',
  /** Секция разрешений */
  PERMISSIONS_SECTION: '[class*="Permissions"], [class*="permissions"]',
};
