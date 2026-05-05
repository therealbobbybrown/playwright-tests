// pages/StructureUserGroupsPage.js
// Page Object для работы со страницей управления группами пользователей
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class StructureUserGroupsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Левая колонка с меню групп
    this.leftSide = this.page
      .locator('[class*="StructureUserGroups_leftside"]')
      .first();
    this.menuTitle = this.leftSide
      .locator('[class*="StructureUserGroups_menuTitle"]')
      .first();
    this.menu = this.leftSide
      .locator('[class*="Menu_menu"]')
      .first();

    // Кнопка "Создать группу"
    this.createGroupButton = this.menu
      .getByRole("button", { name: /создать группу/i })
      .first();

    // Список групп в меню
    this.groupItems = this.menu.locator(
      '[class*="MenuItem_item"], a[href*="/user-groups/"]',
    );

    // Основная область с деталями группы
    this.mainArea = this.page.locator("#structure-user-groups-main").first();

    // Заголовок группы (редактируемый)
    this.groupTitle = this.mainArea
      .locator('[class*="EditableTitle"], h1, h2')
      .first();
    this.groupTitleInput = this.mainArea
      .locator('input, textarea, [contenteditable="true"]')
      .filter({ has: this.groupTitle })
      .first();

    // Кнопка меню группы (три точки)
    this.groupMenuButton = this.mainArea
      .locator(
        'button:has(svg use[href*="optionsVert"]), button[class*="MenuPopupToggle"]',
      )
      .first();

    // Пункты меню группы
    this.addUsersMenuItem = this.page
      .getByRole("button", { name: /добавить участников/i })
      .first();
    this.removeGroupMenuItem = this.page
      .getByRole("button", { name: /удалить/i })
      .filter({ has: this.page.locator('svg use[href*="trash"]') })
      .first();

    // Секция сотрудников в группе
    this.usersSection = this.mainArea
      .locator(
        '[class*="Section_items"], [class*="UserGroupUsers"], section:has-text("Сотрудники")',
      )
      .first();
    this.userCards = this.mainArea.locator('[class*="UserItem_user"]');
    // Email в карточках пользователей
    this.userEmails = this.mainArea.locator(
      '[class*="UserItem_footer"], [class*="UserItem_email"]',
    );

    // Кнопка "Добавить участников" в секции
    this.addUsersButton = this.usersSection
      .getByRole("button", { name: /добавить участников/i })
      .first();

    // Модальное окно добавления пользователей
    // Используем несколько вариантов локаторов для надёжности
    this.addUsersModal = this.page
      .locator(
        `${SELECTORS.SHEET_MODAL_CONTAINER}, ${SELECTORS.SHEET_MODAL}, [role="dialog"], [class*="Modal_modal"]`,
      )
      .filter({ hasText: /добавить.*участник/i })
      .first();
    this.addUsersOptions = this.addUsersModal.locator(
      '[role="option"], button[class*="Option"]',
    );
    // Поле поиска в модальном окне - ищем по placeholder
    this.addUsersSearchInput = this.page
      .getByPlaceholder(/имя.*фамилия.*почта|поиск/i)
      .first();
    this.addUsersConfirmButton = this.page
      .getByRole("button", { name: /подтвердить/i })
      .first();

    // Диалог подтверждения удаления группы
    this.removeGroupDialog = this.page
      .locator('[role="dialog"]')
      .filter({ hasText: /удалить.*групп/i });
    this.confirmRemoveButton = this.removeGroupDialog
      .getByRole("button", { name: /да, удалить/i })
      .first();

    // Пустое состояние (когда групп нет)
    this.emptyState = this.mainArea
      .locator('[class*="StructureUserGroups_empty"]')
      .first();
  }

  /** Открыть страницу групп через боковое меню */
  async openFromSideMenu() {
    await this._step(
      'Открыть "Группы пользователей" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureUserGroups();
        await this.assertOpened();
      },
    );
  }

  /** Проверить, что страница открыта */
  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Группы пользователей"',
      async () => {
        await this.page.waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.LONG,
        });
        await this.leftSide.waitFor({
          state: "visible",
          timeout: TIMEOUTS.EXTRA_LONG,
        });
        await this.menu.waitFor({
          state: "visible",
          timeout: TIMEOUTS.EXTRA_LONG,
        });

        // Ждём загрузки элементов меню - проверяем наличие хотя бы одного элемента или пустого состояния
        const hasGroups = await this.groupItems
          .count()
          .then((count) => count > 0)
          .catch(() => false);

        if (hasGroups) {
          // Если есть группы, ждём появления первого элемента
          await this.groupItems
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
            .catch(() => {
              console.warn("Элементы групп в меню загружаются медленно");
            });
        } else {
          // Если групп нет, это нормально - возможно, это новая система
          console.log("Группы в меню не найдены (возможно, список пуст)");
        }

        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_USER_GROUPS, {
            timeout: TIMEOUTS.SHORT,
          })
          .catch(() => null);
      },
    );
  }

  /**
   * Создать новую группу
   * @param {string} groupName - название группы
   * @returns {Promise<string>} - название созданной группы
   */
  async createGroup(groupName) {
    return this._step(`Создать группу "${groupName}"`, async () => {
      await this.assertOpened();
      await this.createGroupButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.createGroupButton.click();

      // Новая группа появляется в списке с названием "Новая группа"
      // Ждём появления в меню, но не слишком долго
      const newGroupItem = this.groupItems
        .filter({ hasText: /новая группа/i })
        .last();

      await newGroupItem.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      // Кликаем по ссылке группы, если она есть
      const overlayLink = newGroupItem
        .locator('a[href*="/user-groups/"]')
        .first();
      const hasLink = await overlayLink
        .waitFor({ state: "visible", timeout: 1_000 })
        .then(() => true)
        .catch(() => false);

      if (hasLink) {
        await overlayLink.click();
      } else {
        await newGroupItem.click();
      }

      // Ждём открытия деталей группы
      await this.groupTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      // Ждём стабилизации DOM после открытия группы
      await this.groupTitleInput
        .or(
          this.mainArea
            .locator('input, textarea, [contenteditable="true"]')
            .first(),
        )
        .waitFor({ state: "attached", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Переименовываем группу
      await this.renameGroup(groupName);

      // Ждём сохранения названия (проверяем что инпут скрылся)
      await this.groupTitleInput
        .or(
          this.mainArea
            .locator('input, textarea, [contenteditable="true"]')
            .first(),
        )
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      return groupName;
    });
  }

  /**
   * Переименовать открытую группу
   * @param {string} newName - новое название
   */
  async renameGroup(newName) {
    await this._step(`Переименовать группу в "${newName}"`, async () => {
      // Находим текущий (активный) элемент группы в списке
      const currentItem = this.page
        .locator('[class*="MenuItem_item--is-current"]')
        .first();

      const currentItemVisible = await currentItem
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (currentItemVisible) {
        // Кликаем три точки на текущем элементе
        const menuOpener = currentItem
          .locator('[class*="MenuItem_menu-opener"], button:has(svg)')
          .last();
        await menuOpener.click();

        // Ждём popup и кликаем "Переименовать"
        const renameBtn = this.page
          .getByRole("button", { name: /переименовать/i })
          .first();
        await renameBtn.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await renameBtn.click();
      } else {
        // Фолбэк: кликаем по заголовку в mainArea
        await this.groupTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.groupTitle.click();
      }

      // После "Переименовать" появляются 2 textbox inline:
      // первый — эмодзи, второй — название группы
      const nameInput = this.page
        .locator('[class*="MenuItem_item"] input, [class*="MenuItem_item"] textarea')
        .nth(1)
        .or(
          this.page
            .locator('[class*="EditableTitle"] input, [class*="EditableTitle"] textarea')
            .first(),
        );

      await nameInput.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await nameInput.fill(newName);
      await nameInput.press("Enter").catch(() => null);

      // Ждём сохранения (textbox скрывается)
      await nameInput
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Ждём обновления UI
      await this.page.waitForTimeout(500);
    });
  }

  /**
   * Открыть группу по названию
   * @param {string} groupName - название группы
   */
  async openGroupByName(groupName) {
    await this._step(`Открыть группу "${groupName}"`, async () => {
      await this.assertOpened();

      // Если уже открыта нужная группа - выходим
      const currentTitle = await this.groupTitle.textContent().catch(() => "");
      if (
        currentTitle &&
        currentTitle.toLowerCase().includes(groupName.toLowerCase())
      ) {
        return;
      }

      // Ждём загрузки меню групп
      await this.menu.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Ждём появления хотя бы одного элемента группы
      await this.groupItems
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .catch(() => {
          console.warn("Элементы групп в меню загружаются медленно");
        });

      // Получаем список всех групп для отладки
      const groupsList = await this.getGroupsList();
      console.log(
        `Поиск группы "${groupName}" среди доступных: ${groupsList.join(", ")}`,
      );

      // Ищем точное совпадение или частичное
      const normalizedGroupName = groupName.toLowerCase().trim();
      let foundGroup = groupsList.find((g) => {
        const normalized = g.toLowerCase().trim();
        return (
          normalized === normalizedGroupName ||
          normalized.includes(normalizedGroupName) ||
          normalizedGroupName.includes(normalized)
        );
      });

      if (!foundGroup) {
        // Если не нашли точное совпадение, пробуем найти по части названия
        foundGroup = groupsList.find((g) => {
          const normalized = g.toLowerCase().trim();
          // Проверяем, содержит ли название группы ключевые слова из искомого названия
          const keywords = normalizedGroupName
            .split(/\s+/)
            .filter((k) => k.length > 2);
          return keywords.some((keyword) => normalized.includes(keyword));
        });
      }

      if (!foundGroup) {
        throw new Error(
          `Группа "${groupName}" не найдена. Доступные группы: ${groupsList.join(", ")}`,
        );
      }

      console.log(`Найдена группа: "${foundGroup}" (искали "${groupName}")`);

      const safeName = foundGroup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nameRegex = new RegExp(safeName, "i");

      // Стратегия навигации: находим href группы → goto → ждём конкретный URL + заголовок
      let targetHref = null;

      // 1) Через page.evaluate — ищем ссылку по названию группы в DOM
      targetHref = await this.page
        .evaluate((name) => {
          const lowerName = String(name || "").toLowerCase();
          const links = Array.from(
            document.querySelectorAll('a[href*="/user-groups/"]'),
          );
          for (const link of links) {
            const container =
              link.closest("div, li, button") || link.parentElement;
            const text = container?.textContent || "";
            if (text.toLowerCase().includes(lowerName)) {
              return link.getAttribute("href");
            }
          }
          // Фолбэк: поиск по всем элементам документа
          const allElements = Array.from(document.querySelectorAll("*"));
          const node = allElements.find((el) => {
            const text = el.textContent || "";
            return (
              text.toLowerCase().includes(lowerName) &&
              el.children.length < 5
            );
          });
          if (node) {
            const container =
              node.closest("div, li, button") || node.parentElement;
            const link =
              container?.querySelector('a[href*="/user-groups/"]') ||
              node.querySelector('a[href*="/user-groups/"]') ||
              node.closest('a[href*="/user-groups/"]');
            if (link) return link.getAttribute("href");
          }
          return null;
        }, foundGroup)
        .catch(() => null);

      // 2) Если evaluate не нашёл — через Playwright locator
      if (!targetHref) {
        const nameNode = this.menu.getByText(nameRegex).first();
        const nameVisible = await nameNode
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false);

        if (nameVisible) {
          const containerWithLink = nameNode
            .locator(
              'xpath=ancestor::*[.//a[contains(@href,"/user-groups/")]]',
            )
            .first();
          const link = containerWithLink
            .locator('a[href*="/user-groups/"]')
            .first();
          targetHref = await link.getAttribute("href").catch(() => null);
        }
      }

      // 3) Если нашли href — навигация через goto
      if (targetHref) {
        const targetUrl = new URL(targetHref, this.page.url()).toString();
        await this.page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      } else {
        // Крайний фолбэк: клик по элементу меню
        let groupItem = this.menu
          .locator('a[href*="/user-groups/"]')
          .filter({ hasText: nameRegex })
          .first();

        const linkVisible = await groupItem
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false);
        if (!linkVisible) {
          groupItem = this.menu
            .locator("div, li, button")
            .filter({ hasText: nameRegex })
            .first();
        }

        await groupItem.scrollIntoViewIfNeeded().catch(() => {});
        await groupItem.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await groupItem.click({ force: true });
      }

      // Ждём загрузки: конкретный URL группы + заголовок с нужным текстом
      const groupIdMatch = targetHref?.match(/\/user-groups\/(\d+)/);
      if (groupIdMatch) {
        // Ждём URL с конкретным ID группы
        await this.page
          .waitForURL(new RegExp(`/user-groups/${groupIdMatch[1]}`), {
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
          })
          .catch(() => {});
      }

      // Ждём, что заголовок содержит название нужной группы
      const normalizedFound = foundGroup.toLowerCase().trim();
      await this.groupTitle
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .catch(() => {});

      // Polling: ждём, пока заголовок обновится на нужную группу (SPA может перерисовывать с задержкой)
      const titleMatched = await this.page
        .waitForFunction(
          ({ selector, expected }) => {
            const el = document.querySelector(selector);
            if (!el) return false;
            const text = el.textContent?.toLowerCase().trim() || "";
            return (
              text.includes(expected) || expected.includes(text.split("\n").pop()?.trim() || "")
            );
          },
          {
            selector: "h2",
            expected: normalizedFound,
          },
          { timeout: TIMEOUTS.MEDIUM },
        )
        .then(() => true)
        .catch(() => false);

      // Ждём загрузки содержимого группы
      await this.usersSection
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Финальная проверка заголовка
      const titleText = await this.groupTitle.textContent();
      const normalizedTitle = titleText.toLowerCase().trim();

      if (
        !normalizedTitle.includes(normalizedFound) &&
        !normalizedFound.includes(normalizedTitle)
      ) {
        throw new Error(
          `Группа "${foundGroup}" не открыта. Текущий заголовок: "${titleText}"`,
        );
      }
    });
  }

  /**
   * Добавить пользователей в группу
   * @param {number} count - количество пользователей для добавления
   */
  async addUsersToGroup(count = 1) {
    await this._step(`Добавить ${count} пользователей в группу`, async () => {
      // Текущие участники (по именам) чтобы не добавлять повторно
      const existingNames = await this.getGroupUserNames();

      // Открываем модалку добавления участников через основную кнопку в группе
      if (await this.addUsersButton.isVisible().catch(() => false)) {
        await this.addUsersButton.click();
      } else {
        // fallback через меню группы
        await this.groupMenuButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        const overlayBtn = this.mainArea
          .locator("button.MenuPopupToggle_overlay-button__yMqbb")
          .first();
        const overlayVisible = await overlayBtn.isVisible().catch(() => false);
        if (overlayVisible) {
          await overlayBtn.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        }
        await this.groupMenuButton
          .click({ timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(async () => {
            await this.groupMenuButton.click({
              force: true,
              timeout: TIMEOUTS.ELEMENT_VISIBLE,
            });
          });
        await this.addUsersMenuItem.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await this.addUsersMenuItem.click();
      }

      // Ждём открытия модального окна
      await this.addUsersModal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MODAL_OPEN,
      });

      // Модальное окно уже должно быть открыто после клика
      const modal = this.addUsersModal;

      // Ищем список элементов с учётом разных версий верстки
      const candidates = [
        modal.locator(".Options_options__cFO9S button.Option_option__K_CL1"),
        modal.locator(".Option_option-item__pLwvi button"),
        modal.locator("button.Option_option__K_CL1"),
        modal.locator("button:has(.Option_name__WGdjN)"),
        modal.locator('button[class*="Option_option"]'),
      ];

      let optionButtons = candidates.find((loc) => true);
      for (const loc of candidates) {
        const cnt = await loc.count().catch(() => 0);
        if (cnt > 0) {
          optionButtons = loc;
          break;
        }
      }

      await optionButtons
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      let selected = 0;
      let processed = 0;

      while (selected < count) {
        const total = await optionButtons.count();

        for (let i = processed; i < total && selected < count; i++) {
          const option = optionButtons.nth(i);
          const name = (
            (await option
              .locator(".Option_name__WGdjN")
              .textContent()
              .catch(() => "")) || (await option.textContent().catch(() => ""))
          )
            .trim()
            .toLowerCase();

          if (!name || existingNames.includes(name)) {
            continue;
          }

          await option.click();
          existingNames.push(name);
          selected++;
        }

        if (selected >= count) break;

        const loadMoreButton = this.addUsersModal
          .locator(".Modal_next-load__SIeCs button")
          .first();
        const canLoadMore = await loadMoreButton.isVisible().catch(() => false);

        if (canLoadMore) {
          await loadMoreButton.click();
          // Ждём появления новых опций после подгрузки
          await optionButtons
            .nth(total)
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
          processed = total;
          continue;
        }

        break;
      }

      if (selected === 0) {
        throw new Error("Не удалось выбрать участников в модалке добавления");
      }

      // Подтверждаем выбор
      await this.addUsersConfirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.addUsersConfirmButton.click();

      // Ждём закрытия модального окна
      await this.addUsersModal
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_CLOSE })
        .catch(() => {});
    });
  }

  /**
   * Удалить открытую группу
   */
  async deleteGroup() {
    await this._step("Удалить группу", async () => {
      // Используем три точки на текущем элементе в списке (надёжнее, чем mainArea)
      const currentItem = this.page
        .locator('[class*="MenuItem_item--is-current"]')
        .first();
      const currentItemVisible = await currentItem
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (currentItemVisible) {
        const menuOpener = currentItem
          .locator('[class*="MenuItem_menu-opener"], button:has(svg)')
          .last();
        await menuOpener.click();
      } else {
        // Фолбэк: через mainArea
        await this.groupMenuButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.groupMenuButton.click();
      }

      // Кликаем "Удалить" в popup
      const deleteBtn = this.page
        .getByRole("button", { name: /удалить/i })
        .first();
      await deleteBtn.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await deleteBtn.click();

      // Подтверждаем удаление — ищем кнопку "Да, удалить" на странице или в диалоге
      const confirmBtn = this.page
        .getByRole("button", { name: /да, удалить/i })
        .first()
        .or(this.confirmRemoveButton);

      await confirmBtn.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await confirmBtn.click();

      // Ждём что подтверждение исчезло (страница перерендерится)
      await confirmBtn
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_CLOSE })
        .catch(() => {});

      // Ждём стабилизации после удаления
      await this.page.waitForTimeout(500);
    });
  }

  /**
   * Получить список всех групп
   * @returns {Promise<string[]>}
   */
  async getGroupsList() {
    return this._step("Получить список всех групп", async () => {
      await this.assertOpened();
      await this.menu.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Ждём появления хотя бы одного элемента группы в меню
      await this.groupItems
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .catch(() => {
          console.warn(
            "Элементы групп в меню не загрузились, пробуем получить список другим способом",
          );
        });

      // Пробуем получить список через evaluate
      let groups = await this.page
        .evaluate(() => {
          const nodes = Array.from(
            document.querySelectorAll('span[class*="MenuItem_title"]'),
          );
          return nodes.map((n) => (n.textContent || "").trim()).filter(Boolean);
        })
        .catch(() => []);

      // Если список пустой, пробуем альтернативный способ
      if (groups.length === 0) {
        console.log("Список групп пуст через evaluate, пробуем через локаторы");
        const count = await this.groupItems.count();
        groups = [];
        for (let i = 0; i < count; i++) {
          const text = await this.groupItems
            .nth(i)
            .locator('span[class*="MenuItem_title"]')
            .textContent()
            .catch(() => "");
          if (text && text.trim()) {
            groups.push(text.trim());
          }
        }
      }

      console.log(`Получено групп из меню: ${groups.length}`);
      return groups;
    });
  }

  /**
   * Получить имена участников открытой группы (lowercase)
   * @returns {Promise<string[]>}
   */
  async getGroupUserNames() {
    return this._step("Получить имена участников группы", async () => {
      const names = await this.usersSection
        .locator(
          '[class*="UserItem_name"], [class*="UserCard_name"], [class*="Card_name"], a[href*="/profile/"]',
        )
        .allTextContents()
        .catch(() => []);
      return names.map((t) => t.trim().toLowerCase()).filter(Boolean);
    });
  }

  /**
   * Получить emails участников группы (с прокруткой для загрузки всех)
   * @returns {Promise<string[]>}
   */
  async getGroupUserEmails() {
    return this._step("Получить emails участников группы", async () => {
      // Ждём загрузки списка пользователей
      const loadingIndicator = this.mainArea
        .locator("text=/загрузка/i")
        .first();
      await loadingIndicator
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
      // Ждём появления хотя бы одного email элемента (если есть пользователи)
      await this.mainArea
        .locator('[class*="UserItem_email"]')
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Контейнер списка пользователей для прокрутки (UserGroupUsers_content — прокручиваемый контейнер)
      const usersContainer = this.mainArea
        .locator('[class*="UserGroupUsers_content"]')
        .first();
      const containerExists = await usersContainer
        .isVisible()
        .catch(() => false);

      // Прокручиваем список для загрузки всех пользователей (API отдаёт постранично)
      let prevCount = 0;
      let currentCount = 0;
      const maxScrollAttempts = 15;

      for (let i = 0; i < maxScrollAttempts; i++) {
        // Считаем текущее количество email-элементов
        currentCount = await this.mainArea
          .locator('[class*="UserItem_email"]')
          .count();

        // Если количество не изменилось после прокрутки — все данные загружены
        if (currentCount === prevCount && i > 0) {
          console.log(
            `[SCROLL] Прокрутка завершена на итерации ${i}, загружено ${currentCount} email-ов`,
          );
          break;
        }
        prevCount = currentCount;

        // Прокручиваем контейнер вниз
        if (containerExists) {
          await usersContainer.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
        } else {
          // Fallback: прокрутка последнего email-элемента во viewport
          const lastEmail = this.mainArea
            .locator('[class*="UserItem_email"]')
            .last();
          if (await lastEmail.isVisible().catch(() => false)) {
            await lastEmail.scrollIntoViewIfNeeded().catch(() => {});
          }
        }

        // Ждём загрузки новых данных (retry delay в цикле прокрутки - legitimate use)
        await this.page.waitForTimeout(800);
      }

      // Извлекаем все email-ы
      const emails = await this.mainArea.evaluate((container) => {
        const emailElements = container.querySelectorAll(
          '[class*="UserItem_email"]',
        );
        return Array.from(emailElements).map((el) =>
          (el.textContent || "").trim().toLowerCase(),
        );
      });

      const result = emails.filter(Boolean);
      console.log(`Найдено ${result.length} email-ов в группе`);
      return result;
    });
  }

  /**
   * Добавить пользователей в группу по email (через UI)
   * @param {string[]} emails
   */
  async addUsersToGroupByEmails(emails = []) {
    if (!emails.length) return;

    await this._step(
      `Добавить пользователей ${emails.join(", ")} в текущую группу (UI)`,
      async () => {
        // Получаем текущих пользователей в группе
        const existingEmails = (await this.getGroupUserEmails()).map((e) =>
          e.toLowerCase(),
        );

        const toAdd = emails.filter(
          (email) => !existingEmails.includes(email.toLowerCase()),
        );
        if (toAdd.length === 0) {
          console.log(
            "Все указанные пользователи уже в группе, добавлять никого не нужно",
          );
          return;
        }

        const closeAddUserModal = async () => {
          if (await this.addUsersModal.isVisible().catch(() => false)) {
            await this.page.keyboard.press("Escape").catch(() => {});
            await this.addUsersModal
              .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          }
        };

        // Добавляем пользователей по одному через UI
        for (const email of toAdd) {
          // Открываем модальное окно для добавления участника
          if (await this.addUsersButton.isVisible().catch(() => false)) {
            await closeAddUserModal();
            await this.addUsersButton.click();
          } else {
            // fallback через меню группы
            await this.groupMenuButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            const overlayBtn = this.mainArea
              .locator("button.MenuPopupToggle_overlay-button__yMqbb")
              .first();
            const overlayVisible = await overlayBtn
              .isVisible()
              .catch(() => false);
            if (overlayVisible) {
              await overlayBtn
                .click({ timeout: TIMEOUTS.SHORT })
                .catch(() => {});
            }
            // Ждём закрытия любых открытых выпадающих списков Option_option
            const optionOverlay = this.page
              .locator('[class*="Option_option"]')
              .first();
            await optionOverlay
              .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            await this.groupMenuButton
              .click({ timeout: TIMEOUTS.ELEMENT_VISIBLE })
              .catch(async () => {
                await this.groupMenuButton.click({
                  force: true,
                  timeout: TIMEOUTS.ELEMENT_VISIBLE,
                });
              });
            await this.addUsersMenuItem.waitFor({
              state: "visible",
              timeout: TIMEOUTS.SHORT,
            });
            // Используем force: true так как Option_option может перехватывать клик
            await this.addUsersMenuItem.click({ force: true });
          }

          // Ждём открытия модального окна (ждём заголовок "Добавить участников")
          const modalTitle = this.page
            .locator("b")
            .filter({ hasText: "Добавить участников" });
          await modalTitle.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });

          // Модальное окно — ближайший родительский .react-modal-sheet-container
          const modalContainer = this.page
            .locator(".react-modal-sheet-container")
            .filter({ has: modalTitle });
          await modalContainer.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Поле поиска внутри модалки
          const searchInput = modalContainer.locator('input[name="q"]').first();
          await searchInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Карточки пользователей в модалке
          const allOptions = modalContainer.locator(
            'button[class*="Option_option"]',
          );

          // Ждём загрузки карточек (до ввода email модалка показывает всех доступных пользователей)
          await allOptions
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
          const initialCount = await allOptions.count().catch(() => 0);
          console.log(`[DEBUG] Карточек в модалке до поиска: ${initialCount}`);

          // Фокусируемся на поле и вводим email
          await searchInput.focus();
          await searchInput.fill("");

          // Вводим email посимвольно для триггера поиска
          await searchInput.pressSequentially(email, { delay: 20 });

          // Проверяем что email введён
          const newValue = await searchInput.inputValue();
          console.log(`[DEBUG] Введён: "${newValue}"`);

          if (newValue !== email) {
            console.warn(`[DEBUG] Email не введён корректно!`);
            await closeAddUserModal();
            continue;
          }

          // Ждём пока поиск отфильтрует результаты (retry delay в цикле поиска)
          let count = await allOptions.count().catch(() => 0);
          const maxWaitAttempts = 20; // 20 * 500ms = 10 секунд макс
          for (let attempt = 0; attempt < maxWaitAttempts; attempt++) {
            await this.page.waitForTimeout(500); // retry delay - legitimate use
            count = await allOptions.count().catch(() => 0);
            console.log(
              `[DEBUG] Поиск по "${email}", попытка ${attempt + 1}: ${count} результат(ов)`,
            );
            // Если количество уменьшилось или стало 1-3 - поиск сработал
            if (count > 0 && count < initialCount) {
              console.log(
                `[DEBUG] Поиск отфильтровал: было ${initialCount}, стало ${count}`,
              );
              break;
            }
            if (count > 0 && count <= 3) {
              break;
            }
          }

          let userOption = null;

          try {
            if (count === 0) {
              console.warn(`[DEBUG] Нет результатов для ${email}, пропускаем`);
              await closeAddUserModal();
              continue;
            }

            // Берём первый результат - при точном поиске по email он должен быть нужным
            userOption = allOptions.first();
            console.log(
              `[DEBUG] Выбираем первый результат из ${count} для ${email}`,
            );
          } catch (e) {
            console.log(
              `[DEBUG] Не удалось найти результаты для ${email}: ${e.message}`,
            );
            await closeAddUserModal();
            continue;
          }

          // Проверяем, не выбран ли уже пользователь
          const isSelected = await userOption
            .locator('svg use[href*="icon-ok"], svg use[xlink:href*="icon-ok"]')
            .isVisible()
            .catch(() => false);

          if (!isSelected) {
            await userOption.click();
            // Ждём что чекмарк появится (пользователь выбран)
            await userOption
              .locator(
                'svg use[href*="icon-ok"], svg use[xlink:href*="icon-ok"]',
              )
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          } else {
            console.log(`Пользователь ${email} уже выбран`);
          }

          // Подтверждаем выбор
          const confirmButton = this.page
            .getByRole("button", { name: /подтвердить/i })
            .first();

          await confirmButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await confirmButton.click();

          // Ждём закрытия модального окна
          await modalTitle
            .waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_CLOSE })
            .catch(() => {});
        }

        // Верификация: проверяем что все пользователи реально добавлены
        // Перезагружаем страницу чтобы увидеть обновлённый список
        await this.page.reload({ waitUntil: "networkidle" });
        // Ждём загрузки списка пользователей после перезагрузки
        const loadingIndicator = this.mainArea
          .locator("text=/загрузка/i")
          .first();
        await loadingIndicator
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        await this.mainArea
          .locator('[class*="UserItem_email"]')
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
        const updatedEmails = (await this.getGroupUserEmails()).map((e) =>
          e.toLowerCase(),
        );
        const notAdded = toAdd.filter(
          (email) => !updatedEmails.includes(email.toLowerCase()),
        );
        if (notAdded.length > 0) {
          throw new Error(
            `Пользователи НЕ были добавлены в группу: ${notAdded.join(", ")}. ` +
              `Текущий состав группы (${updatedEmails.length}): ${updatedEmails.slice(0, 5).join(", ")}...`,
          );
        }
        console.log(
          `✓ Верификация: все ${toAdd.length} пользователей успешно добавлены в группу`,
        );
      },
    );
  }

  /**
   * Получить количество пользователей в открытой группе
   * @returns {Promise<number>}
   */
  async getUsersCountInGroup() {
    return this._step(
      "Получить количество пользователей в группе",
      async () => {
        // Ждём загрузки основной области
        await this.mainArea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Пробуем найти секцию пользователей разными способами
        const sectionLocators = [
          this.mainArea.locator('[class*="UserGroupUsers"]').first(),
          this.mainArea.locator('section:has-text("Сотрудники")').first(),
          this.mainArea.locator('[class*="Users"]').first(),
          this.mainArea.locator('[class*="user"]').first(), // альтернативный вариант
        ];

        let sectionFound = false;
        for (const locator of sectionLocators) {
          const visible = await locator
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (visible) {
            sectionFound = true;
            // Обновляем локатор секции
            this.usersSection = locator;
            break;
          }
        }

        if (!sectionFound) {
          // Если секция не найдена, пробуем найти карточки пользователей напрямую
          const cardsCount = await this.mainArea
            .locator(
              'a[href*="/profile/"], [class*="UserCard"], [class*="UserItem_user"]',
            )
            .count()
            .catch(() => 0);

          if (cardsCount > 0) {
            console.log(
              `Найдено ${cardsCount} пользователей напрямую (без секции)`,
            );
            return cardsCount;
          }

          console.warn("Секция пользователей не найдена, возвращаем 0");
          return 0;
        }

        // Ждём появления карточек пользователей (может быть 0)
        // Даём время на загрузку, но не падаем если карточек нет
        await this.userCards
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
        const count = await this.userCards.count();
        return count;
      },
    );
  }
}
