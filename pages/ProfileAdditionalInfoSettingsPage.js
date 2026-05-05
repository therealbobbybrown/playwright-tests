import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/ProfileAdditionalInfoSettingsPage.js

/**
 * Страница редактирования профиля: вкладка "Дополнительная информация".
 * Открывается после клика по кнопке "Настроить профиль" на вкладке "Главное".
 */
export class ProfileAdditionalInfoSettingsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Активная вкладка "Дополнительная информация"
    this.additionalInfoTabActive = this.page.locator(
      'button[class*="Tabs_button--active__"]:has(span[class*="Tabs_label__"]:has-text("Дополнительная информация"))',
    );

    // Верхняя плашка режима настройки
    this.templateEditBanner = this.page
      .getByText(/вы настраиваете шаблон профиля сотрудника/i)
      .first();

    // ----------------- Кнопки режима редактирования -----------------

    this.saveChangesButtonExact = this.page
      .locator('button[class*="Button_button--color-warning__"]:visible')
      .filter({ hasText: /сохранить изменения/i })
      .first();

    this.saveChangesButton = this.page
      .getByRole("button", { name: /сохранить изменения/i })
      .first();

    this.cancelEditingButton = this.page
      .getByRole("button", { name: /отменить редактирование/i })
      .first();

    // ----------------- Возврат к профилю после сохранения -----------------

    this.returnToProfileButton = this.page
      .getByRole("button", { name: /вернуться к профилю/i })
      .first();

    // ----------------- Добавление вкладки -----------------

    this.addTabButton = this.page
      .getByRole("button", { name: /добавить вкладку/i })
      .or(this.page.getByRole("link", { name: /добавить вкладку/i }))
      .or(
        this.page
          .locator("text=Добавить вкладку")
          .locator("xpath=ancestor::button[1] | ancestor::a[1]"),
      )
      .first();

    // Кнопки "три точки" (управление вкладкой)
    this.tabHandleButtons = this.page.locator(
      'span[class*="HandleButton_button__"]:visible',
    );

    // ----------------- Добавление блоков -----------------

    this.addBlockButtonExact = this.page
      .locator('button[class*="AddBlockButton_button__"]:visible')
      .filter({
        has: this.page.locator(
          'span[class*="AddBlockButton_label__"]:has-text("Добавить блок")',
        ),
      })
      .first();

    this.addBlockButton = this.page
      .getByRole("button", { name: /добавить блок/i })
      .or(this.page.locator('button:has-text("Добавить блок")'))
      .first();

    // ----------------- Блоки/поля -----------------

    this.blocks = this.page.locator('[class*="Block_block__"]');

    // Кнопки "Добавить поле" внутри блоков
    this.addFieldButtons = this.page
      .locator("button:visible")
      .filter({ hasText: /добавить поле/i });

    // Храним ID созданной вкладки (tab=<uuid>)
    this.lastCreatedTabId = null;
  }

  async assertOpened() {
    await this._step(
      'Профиль (настройка): открыта вкладка "Дополнительная информация"',
      async () => {
        await this.page.waitForLoadState("domcontentloaded");

        if (!(await this._isVisible(this.addBlockButtonExact))) {
          await this.addBlockButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        } else {
          await this.addBlockButtonExact.waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        }

        await this.additionalInfoTabActive
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => null);
        await this.templateEditBanner
          .waitFor({ state: "visible", timeout: 3_000 })
          .catch(() => null);

        await this.saveChangesButtonExact
          .waitFor({ state: "visible", timeout: 3_000 })
          .catch(() => null);
        await this.saveChangesButton
          .waitFor({ state: "visible", timeout: 3_000 })
          .catch(() => null);
      },
    );
  }

  async assertBlocksCountAtLeast(minCount) {
    await this._step(
      `Профиль (настройка): блоков минимум ${minCount}`,
      async () => {
        await this.page.waitForFunction(
          (min) =>
            document.querySelectorAll('[class*="Block_block__"]').length >= min,
          minCount,
          { timeout: TIMEOUTS.PAGE_LOAD },
        );
      },
    );
  }

  async getBlocksCount() {
    return this._step(
      "Профиль (настройка): получить количество блоков",
      async () => {
        return this.blocks.count();
      },
    );
  }

  async getBlockAt(index) {
    return this._step(
      `Профиль (настройка): получить блок #${index + 1}`,
      async () => {
        const block = this.blocks.nth(index);
        await block.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
        return block;
      },
    );
  }

  /**
   * Попытаться создать новую вкладку.
   * В реальном UI вкладка создаётся как "Вкладка" и получает UUID в URL (?tab=<uuid>).
   * Возвращает true/false. UUID кладём в this.lastCreatedTabId.
   */
  async createTabIfPossible(tabNameIgnored) {
    return this._step(
      "Профиль (настройка): создать вкладку (если доступно)",
      async () => {
        const canClick = await this._isVisible(this.addTabButton);
        if (!canClick) return false;

        const beforeHandleCount = await this.tabHandleButtons.count();
        const beforeTabId = this._getTabIdFromUrl();

        await this.addTabButton.click();

        // Ждём либо прироста "три точки", либо смены tab=... в URL
        await Promise.race([
          this.page
            .waitForFunction(
              (before) =>
                document.querySelectorAll(
                  'span[class*="HandleButton_button__"]',
                ).length > before,
              beforeHandleCount,
              { timeout: TIMEOUTS.MEDIUM },
            )
            .catch(() => null),
          this.page
            .waitForFunction(
              (before) => {
                const t = new URL(window.location.href).searchParams.get("tab");
                return !!t && t !== before;
              },
              beforeTabId,
              { timeout: TIMEOUTS.MEDIUM },
            )
            .catch(() => null),
        ]);

        // Фиксируем текущий tabId
        const tabId = this._getTabIdFromUrl();
        this.lastCreatedTabId = tabId || null;

        // Если ни handle не прибавился, ни tabId не появился — считаем, что вкладка не создалась
        const afterHandleCount = await this.tabHandleButtons.count();
        if (afterHandleCount <= beforeHandleCount && !this.lastCreatedTabId) {
          return false;
        }

        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
        return true;
      },
    );
  }

  /** Добавить новый блок и вернуть locator нового блока */
  async addBlock() {
    return this._step("Профиль (настройка): добавить блок", async () => {
      const addBtn = (await this._isVisible(this.addBlockButtonExact))
        ? this.addBlockButtonExact
        : this.addBlockButton;

      await addBtn.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      await this._scrollToCenter(addBtn);

      const before = await this.blocks.count();

      // Один DOM-click (без ретраев Playwright)
      await addBtn.evaluate((el) => el.click());

      await this.page.waitForFunction(
        (prev) =>
          document.querySelectorAll('[class*="Block_block__"]').length > prev,
        before,
        { timeout: TIMEOUTS.PAGE_LOAD },
      );

      const after = await this.blocks.count();
      if (after !== before + 1) {
        throw new Error(
          `Добавление блока сработало некорректно: было ${before}, стало ${after}`,
        );
      }

      const newBlock = this.blocks.nth(before);
      await newBlock.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

      const addFieldBtn = this._addFieldButtonInBlock(newBlock);
      await addFieldBtn.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });

      return newBlock;
    });
  }

  /**
   * Добавить в блок поле выбранного типа.
   * @param {import('@playwright/test').Locator} block
   * @param {"Текст"|"Число"|"Дата"} typeLabel
   */
  async addFieldToBlock(block, typeLabel) {
    await this._step(
      `Профиль (настройка): добавить поле "${typeLabel}"`,
      async () => {
        const addFieldBtn = this._addFieldButtonInBlock(block);
        await addFieldBtn.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        await this._scrollToCenter(addFieldBtn);
        await addFieldBtn.click();

        const optionRe = new RegExp(
          `^\\s*${this._escapeRe(typeLabel)}\\s*$`,
          "i",
        );

        // Берём то меню, которое реально содержит нужный пункт (а не first/last наугад)
        const menu = this._fieldTypeMenuContaining(optionRe);
        await menu.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const optionTitle = menu
          .locator('span[class*="AddBlockContentButton_title__"]')
          .filter({ hasText: optionRe })
          .first();

        await optionTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Кликаем по кликабельному предку, если он есть (button/li/a), иначе — по title
        const clickableAncestor = optionTitle.locator(
          "xpath=ancestor::button[1] | ancestor::li[1] | ancestor::a[1]",
        );
        const clickTarget =
          (await clickableAncestor.count()) > 0
            ? clickableAncestor.first()
            : optionTitle;

        await clickTarget.scrollIntoViewIfNeeded().catch(() => null);
        await this._scrollToCenter(clickTarget);

        try {
          await clickTarget.click({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
        } catch {
          // fallback на редкие "outside viewport" / overlay
          await clickTarget.evaluate((el) => {
            try {
              el.scrollIntoView({
                block: "center",
                inline: "center",
                behavior: "instant",
              });
            } catch {}
          });
          await clickTarget.click({
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
            force: true,
          });
        }

        // Проверяем, что поле появилось в блоке
        const typePrefix = this._fieldTypeClassPrefix(typeLabel);

        if (typePrefix) {
          const byClassTitle = block
            .locator(`[class*="${typePrefix}Field_title__"]`)
            .filter({ hasText: optionRe })
            .first();

          const byClassRoot = block
            .locator(`[class*="${typePrefix}Field_"]`)
            .first();

          const hasByTitle = await byClassTitle.isVisible().catch(() => false);
          const hasByRoot = await byClassRoot.isVisible().catch(() => false);

          if (hasByTitle || hasByRoot) return;
        }

        await block
          .getByText(optionRe)
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      },
    );
  }

  /** Идемпотентно: не добавлять поле, если оно уже есть */
  async ensureFieldInBlock(block, typeLabel) {
    return this._step(
      `Профиль (настройка): убедиться, что поле "${typeLabel}" есть в блоке`,
      async () => {
        const re = new RegExp(`^\\s*${this._escapeRe(typeLabel)}\\s*$`, "i");
        const exists = await block
          .getByText(re)
          .first()
          .isVisible()
          .catch(() => false);
        if (exists) return false;

        await this.addFieldToBlock(block, typeLabel);
        return true;
      },
    );
  }

  async saveChanges() {
    await this._step("Профиль (настройка): сохранить изменения", async () => {
      const saveBtn = (await this._isVisible(this.saveChangesButtonExact))
        ? this.saveChangesButtonExact
        : this.saveChangesButton;

      await saveBtn.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      await this._scrollToCenter(saveBtn);
      await saveBtn.click();

      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);

      const toast = this.page
        .getByText(/изменения сохранены|сохранено|успешно сохран/i)
        .first();
      await toast
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => null);
    });
  }

  async clickReturnToProfile() {
    await this._step(
      'Профиль (настройка): нажать "Вернуться к профилю"',
      async () => {
        await this.returnToProfileButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this._scrollToCenter(this.returnToProfileButton);
        await this.returnToProfileButton.click();

        await this.templateEditBanner
          .waitFor({ state: "hidden", timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
      },
    );
  }

  /**
   * Удалить ВСЕ вкладки, у которых есть кнопка с "тремя точками".
   * (это и есть ваши созданные "Вкладка", чтобы не копились между прогонами)
   */
  async deleteAllTabsWithHandleButtons() {
    await this._step(
      'Профиль (настройка): удалить все вкладки с "тремя точками"',
      async () => {
        let count = await this.tabHandleButtons.count();
        if (!count) return;

        while (count > 0) {
          await this._deleteFirstTabByHandle();
          const newCount = await this.tabHandleButtons.count();
          if (newCount >= count) {
            throw new Error(
              `Ожидали уменьшение количества вкладок с "тремя точками" (было ${count}, стало ${newCount})`,
            );
          }
          count = newCount;
        }
      },
    );
  }

  // алиас под альтернативное имя в тестах
  async deleteAllCustomTabsWithHandleButtons() {
    return this.deleteAllTabsWithHandleButtons();
  }

  async _deleteFirstTabByHandle() {
    const before = await this.tabHandleButtons.count();
    const handle = this.tabHandleButtons.first();

    await handle.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
    await this._scrollToCenter(handle);
    await handle.click();

    // 1) В поповере нажимаем "Удалить"
    const popover = this.page
      .locator("div")
      .filter({ has: this.page.locator("input") })
      .filter({ has: this.page.getByRole("button", { name: /^удалить$/i }) })
      .first();

    await popover.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const deleteInPopover = popover
      .getByRole("button", { name: /^удалить$/i })
      .first();
    await deleteInPopover.click();

    // 2) В модалке подтверждаем удаление — кнопка "Удалить вкладку"
    // (текст содержит "удалить", точное совпадение не подходит — текст "Удалить вкладку")
    const dialog = this.page.getByRole("dialog").first();
    await dialog
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => null);

    let confirmDelete = dialog
      .locator('button[class*="BorderedButton_button--color-primary__"]')
      .filter({ hasText: /удалить/i })
      .first()
      .or(dialog.getByRole("button", { name: /удалить/i }).first());

    if (!(await confirmDelete.isVisible().catch(() => false))) {
      confirmDelete = this.page
        .locator("button:visible")
        .filter({ hasText: /удалить вкладку/i })
        .first();
    }

    await confirmDelete.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await confirmDelete.click();

    // ждём, что число handle уменьшилось
    await this.page.waitForFunction(
      (prev) =>
        document.querySelectorAll('span[class*="HandleButton_button__"]')
          .length < prev,
      before,
      { timeout: TIMEOUTS.PAGE_LOAD },
    );

    await this.page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
      .catch(() => null);
  }

  // ----------------- helpers -----------------

  _addFieldButtonInBlock(block) {
    return block
      .getByRole("button", { name: /добавить поле/i })
      .or(block.locator('button:has-text("Добавить поле")'))
      .or(
        block
          .locator('span:has-text("Добавить поле")')
          .locator("xpath=ancestor::button[1]"),
      )
      .first();
  }

  _fieldTypeMenuContaining(optionRe) {
    // меню, в котором есть нужный title
    return this.page
      .locator('div[class*="AddBlockContentButton_menu__"]:visible')
      .filter({
        has: this.page
          .locator('span[class*="AddBlockContentButton_title__"]')
          .filter({ hasText: optionRe }),
      })
      .first();
  }

  _fieldTypeClassPrefix(typeLabel) {
    switch (typeLabel) {
      case "Текст":
        return "Text";
      case "Число":
        return "Number";
      case "Дата":
        return "Date";
      default:
        return "";
    }
  }

  _getTabIdFromUrl() {
    try {
      const u = new URL(this.page.url());
      return u.searchParams.get("tab");
    } catch {
      return null;
    }
  }

  async _scrollToCenter(locator) {
    await locator.evaluate((el) => {
      try {
        el.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: "instant",
        });
      } catch {
        // ignore
      }
    });
  }

  async _isVisible(locator) {
    try {
      return (await locator.count()) > 0 && (await locator.first().isVisible());
    } catch {
      return false;
    }
  }

  _escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
