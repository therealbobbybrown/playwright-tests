import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";
// pages/SurveyPublicationSettingsPage.js

export class SurveyPublicationSettingsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Маркеры страницы
    this.whoGetsSurveyLabel = page
      .getByText("Кто получит опрос", { exact: false })
      .first();

    this.currentStatusTitle = page
      .locator('[class*="CurrentStatus_title"]')
      .first();

    // Карточка аудитории "Все, у кого ссылка"
    this.audiencePublicLinkCard = page.getByText("Все, у кого ссылка", {
      exact: false,
    });

    // Заголовок блока "Кто участвует в опросе" (только на странице, не в модальном окне)
    this.participantsTitle = page
      .getByText("Кто участвует в опросе", { exact: false })
      .first();

    this.participantsBlock = page
      .locator("section, div")
      .filter({ has: this.participantsTitle })
      .first();

    // Карточка аудитории "Моя команда" (для сотрудников компании, внутренний опрос)
    // Может быть как кнопкой, так и текстом в карточке
    this.audienceInternalCard = page
      .getByRole("button", { name: /Моя команда/i })
      .or(page.locator("button").filter({ hasText: /Моя команда/i }))
      .or(page.getByText("Моя команда", { exact: false }));

    // Кнопка "Редактировать" для открытия модального окна выбора получателей
    // Находится рядом с заголовком "Кто участвует в опросе"
    this.receiversEditButton = this.participantsBlock
      .getByRole("button", { name: /Редактировать/i })
      .first();

    // UserQuerySelect для выбора получателей (отделы, группы, пользователи)
    this.receiversSelect = this.receiversEditButton;
    this.receiversSelectInput = page
      .locator('input[name="receivers"], textarea[name="receivers"]')
      .or(
        page.locator(
          '[class*="UserQuerySelect"] input, [class*="UserQuerySelect"] textarea',
        ),
      )
      .first();

    this.allDepartmentsRow = page
      .locator('[class*="AllOption_row"]')
      .filter({ hasText: /Все отделы/i })
      .first();

    this.clearAllDepartmentsButton = page
      .locator("button")
      .filter({ hasText: /(Сбросить все|Очистить все|Снять выбор)/i })
      .first();

    this.confirmModalButton = page
      .getByRole("button", { name: /^Подтвердить$/i })
      .or(page.locator("button").filter({ hasText: /^Подтвердить$/i }))
      .first();

    this._allEmployeesCleared = false;

    // Вкладки в UserQuerySelect (если есть)
    this.departmentsTab = page.getByRole("button", { name: /отделы/i }).first();
    this.groupsTab = page.getByRole("button", { name: /группы/i }).first();
    this.usersTab = page
      .getByRole("button", { name: /сотрудники|пользователи/i })
      .first();

    // Кнопка закрытия модального окна UserQuerySelect
    this.userQuerySelectCloseButton = page
      .locator('button[class*="UserQuerySelect_closeButton__"]')
      .or(
        page
          .locator("button")
          .filter({ has: page.locator('svg use[href*="icon-close"]') }),
      )
      .first();

    // Кнопка «Опубликовать опрос»
    this.publishButton = page.getByRole("button", {
      name: /Опубликовать опрос/i,
    });

    // Блок с публичной ссылкой + инпут
    this.shareLinkContainer = page.getByText("Опрос доступен по ссылке", {
      exact: false,
    });
  }

  // ---------------------------------------------------------------------------
  // Проверка открытия страницы
  // ---------------------------------------------------------------------------

  async assertOpened() {
    await this._step('Открыта страница "Настройки публикации"', async () => {
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});

      // Также ждём URL вида /surveys/{id}/publication
      await this.page
        .waitForURL(URL_PATTERNS.SURVEY_PUBLICATION, { timeout: TIMEOUTS.LONG })
        .catch(() => {});

      const candidates = [
        this.whoGetsSurveyLabel,
        this.currentStatusTitle,
        this.receiversEditButton,
        this.publishButton,
      ];
      let anyVisible = false;

      for (const locator of candidates) {
        try {
          await locator.waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
          anyVisible = true;
          break;
        } catch {
          // пробуем следующий
        }
      }

      if (!anyVisible) {
        throw new Error(
          'Не удалось определить, что открыта страница "Настройки публикации": ни заголовок "Кто получит опрос", ни статус текущего опроса не появились.',
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Аудитория
  // ---------------------------------------------------------------------------

  async selectAudiencePublicLink() {
    await this._step('Выбрать аудиторию "Все, у кого ссылка"', async () => {
      await this.assertOpened();

      const card = this.audiencePublicLinkCard.first();

      const visible = await card.isVisible().catch(() => false);
      if (!visible) {
        throw new Error(
          'Не нашли карточку аудитории "Все, у кого ссылка" на странице настроек публикации.',
        );
      }

      await card.scrollIntoViewIfNeeded().catch(() => {});
      try {
        await card.click();
      } catch {
        // если по какой-то причине клик не проходит (оверлей и т.п.) — жмём с force
        await card.click({ force: true });
      }

      // Никаких строгих ожиданий по хинтам/текстам — шаг считается успешным,
      // если карточка вообще была и по ней смогли кликнуть.
    });
  }

  async assertParticipantsBlockHidden() {
    await this._step(
      'Проверить, что блок "Кто участвует в опросе" не отображается',
      async () => {
        const visible = await this.participantsTitle
          .isVisible()
          .catch(() => false);

        if (visible) {
          throw new Error(
            'Ожидали, что блок "Кто участвует в опросе" скрыт при аудитории "Все, у кого ссылка", но его заголовок всё ещё виден.',
          );
        }
      },
    );
  }

  /** Выбрать аудиторию "Моя команда" (внутренний опрос) */
  async selectAudienceInternal() {
    await this._step('Выбрать аудиторию "Моя команда"', async () => {
      await this.assertOpened();

      // Пробуем разные варианты селекторов
      let card = this.page
        .getByRole("button", { name: /Моя команда/i })
        .first();

      // Если не нашли кнопку, пробуем найти по тексту
      const buttonVisible = await card.isVisible().catch(() => false);
      if (!buttonVisible) {
        card = this.page
          .locator("button")
          .filter({ hasText: /Моя команда/i })
          .first();
        const cardVisible = await card.isVisible().catch(() => false);
        if (!cardVisible) {
          card = this.page.getByText("Моя команда", { exact: false }).first();
        }
      }

      // Ждём появления карточки
      await card
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .catch(() => {
          throw new Error(
            'Не нашли карточку аудитории "Моя команда" на странице настроек публикации. Убедитесь, что опрос в статусе "Черновик".',
          );
        });

      await card.scrollIntoViewIfNeeded().catch(() => {});
      try {
        await card.click();
      } catch {
        await card.click({ force: true });
      }

      // Ждём появления блока "Кто участвует в опросе"
      await this.participantsTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить, что блок "Кто участвует в опросе" отображается */
  async assertParticipantsBlockVisible() {
    await this._step(
      'Проверить, что блок "Кто участвует в опросе" отображается',
      async () => {
        const titleVisible = await this.participantsTitle
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        const editVisible = await this.receiversEditButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (!titleVisible && !editVisible) {
          throw new Error(
            'Не нашли блок "Кто участвует в опросе" или кнопку "Редактировать". Возможно, опрос уже опубликован.',
          );
        }
      },
    );
  }

  _escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _normalizeName(name) {
    return String(name || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  _getAllOptionRow(modal, labelRegex) {
    return modal
      .locator('[class*="AllOption_row"]')
      .filter({ hasText: labelRegex })
      .first();
  }

  _getAllOptionContainer(row) {
    return row
      .locator('xpath=ancestor::*[contains(@class,"AllOption_container")]')
      .first();
  }

  _getReceiversFooter(_modal) {
    // Tags_container может рендериться через React portal — НЕ внутри modal DOM.
    // Ищем на уровне страницы, а не внутри modal-локатора.
    return this.page.locator('[class*="Tags_container"]').first();
  }

  async _ensureReceiversFooter(modal) {
    const footer = this._getReceiversFooter(modal);
    await footer
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .catch(() => {});
    return footer;
  }

  async _clearAllFooterTags(modal) {
    const footer = await this._ensureReceiversFooter(modal);
    for (let i = 0; i < 12; i += 1) {
      const tags = footer.locator('[class*="Tag_tag"]');
      const count = await tags.count();
      if (!count) return;

      const tag = tags.first();
      const deleteIcon = tag.locator('[class*="Tag_deleteIcon"]').first();
      if (await deleteIcon.isVisible().catch(() => false)) {
        await deleteIcon.click({ force: true }).catch(() => {});
      } else {
        await tag.click({ force: true }).catch(() => {});
      }

      await tag.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
      await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry delay in loop
    }
  }

  async _isAllEmployeesChipVisible(modal) {
    const footer = await this._ensureReceiversFooter(modal);
    const chipTitle = footer
      .locator('[class*="Tag_title"]')
      .filter({ hasText: /Все (сотрудники|пользователи)/i })
      .first();
    if (await chipTitle.isVisible().catch(() => false)) return true;

    const chip = footer
      .locator('[class*="Tag_tag"]')
      .filter({ hasText: /Все (сотрудники|пользователи)/i })
      .first();
    return await chip.isVisible().catch(() => false);
  }

  async _removeAllEmployeesChip(_modal) {
    // На странице может быть несколько одинаковых чипов в разных контейнерах и состояниях.
    // Важно удалить именно ВИДИМЫЙ чип в Footer_tags (портал модала), иначе React state
    // может не обновиться и при переходе на "Отделы" снова автоселектится "Все отделы".
    const chipRegex = /Все\s+(сотрудники|пользователи)/i;
    const footerChips = this.page
      .locator('[class*="Footer_tags"] [class*="Tag_tag"]')
      .filter({ hasText: chipRegex });

    const getVisibleFooterChip = async () => {
      const count = await footerChips.count();
      for (let i = 0; i < count; i += 1) {
        const chip = footerChips.nth(i);
        if (await chip.isVisible().catch(() => false)) {
          return chip;
        }
      }
      return null;
    };

    const hasVisibleFooterChip = async () => {
      const chip = await getVisibleFooterChip();
      return Boolean(chip);
    };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const footerChip = await getVisibleFooterChip();
      if (!footerChip) return true;

      await footerChip.scrollIntoViewIfNeeded().catch(() => {});
      await footerChip.hover().catch(() => {});

      // Предпочитаем клик по интерактивному контейнеру delete-контрола (button/role=button),
      // а не по сырому svg-узлу. Это ближе к ручному клику пользователя.
      const deleteControl = footerChip
        .locator(
          'button:has([class*="Tag_deleteIcon"]), [role="button"]:has([class*="Tag_deleteIcon"])',
        )
        .first();
      const deleteIcon = footerChip
        .locator('[class*="Tag_deleteIcon"]')
        .first();

      const controlVisible = await deleteControl.isVisible().catch(() => false);
      if (controlVisible) {
        await deleteControl.click({ timeout: TIMEOUTS.SHORT });
      } else {
        await deleteIcon
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() =>
            deleteIcon.click({ force: true, timeout: TIMEOUTS.SHORT }),
          );
      }

      const disappeared = await this.page
        .waitForFunction(
          ({ selector, re }) => {
            const regex = new RegExp(re, "i");
            const chips = Array.from(document.querySelectorAll(selector));
            return !chips.some((chip) => {
              const text = (chip.textContent || "").replace(/\s+/g, " ").trim();
              const style = window.getComputedStyle(chip);
              const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                chip.getClientRects().length > 0;
              return visible && regex.test(text);
            });
          },
          {
            selector: '[class*="Footer_tags"] [class*="Tag_tag"]',
            re: "Все\\s+(сотрудники|пользователи)",
          },
          { timeout: 2_500 },
        )
        .then(() => true)
        .catch(() => false);

      if (disappeared && !(await hasVisibleFooterChip())) {
        return true;
      }

      await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry between attempts
    }

    return false;
  }

  async _removeAllEmployeesChipFromFooter(modal) {
    return await this._removeAllEmployeesChip(modal);
  }

  async _openReceiversModal() {
    await this.page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});
    this._allEmployeesCleared = false;

    const editVisible = await this.receiversEditButton
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);
    if (!editVisible) {
      throw new Error(
        'Кнопка "Редактировать" для участников опроса не доступна. Проверьте, что опрос в черновике.',
      );
    }

    await this.receiversEditButton.click();
    await this.page
      .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
      .catch(() => {});

    const modal = this.page
      .locator(
        `${SELECTORS.SHEET_MODAL_CONTAINER}, ${SELECTORS.SHEET_MODAL}, [role="dialog"]`,
      )
      .first();
    await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    return modal;
  }

  async _switchReceiversTab(modal, nameRegex) {
    const tab = modal
      .getByRole("button", { name: nameRegex })
      .or(
        modal
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: nameRegex }),
      )
      .first();

    await tab.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    await tab.click();

    // Wait for tab content to load
    await this.page
      .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
      .catch(() => {});
  }

  async _primeReceiversData(modal) {
    const waitForList = async (rowLocator, emptyLocator) => {
      const rowVisible = await rowLocator
        .first()
        .isVisible()
        .catch(() => false);
      if (rowVisible) return;
      await emptyLocator
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    };

    const departmentsTab = modal
      .getByRole("button", { name: /^Отделы$/i })
      .or(
        modal
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /^Отделы$/i }),
      )
      .first();
    const groupsTab = modal
      .getByRole("button", { name: /^Группы$/i })
      .or(
        modal
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /^Группы$/i }),
      )
      .first();

    if (await departmentsTab.isVisible().catch(() => false)) {
      await departmentsTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
      await waitForList(
        modal.locator('[class*="DepartmentOption_row"]'),
        modal.getByText("Отделы ещё не созданы", { exact: false }),
      );
    }

    if (await groupsTab.isVisible().catch(() => false)) {
      await groupsTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
      await waitForList(
        modal.locator('[class*="GroupOption_row"]'),
        modal.getByText("Группы ещё не созданы", { exact: false }),
      );
    }

    // НЕ возвращаемся на вкладку "Сотрудники" — это приводит к перемонтированию компонента,
    // который заново читает глобальный стор и восстанавливает "Все сотрудники" как selected.
    // После этого переход на "Отделы" вызывает авто-выбор "Все отделы".
    // Вызывающий код (_clearAllEmployeesIfNeeded уже выполнен) сам переключится на нужную вкладку.
  }

  async _applyReceiversModal(modal) {
    const applyButton = modal
      .getByRole("button", { name: /^Применить$/i })
      .or(modal.locator('button[class*="Footer_saveButton"]'))
      .first();

    await applyButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });

    // Кнопка "Применить" становится enabled только после того, как сделан выбор.
    // waitFor({ state: 'visible' }) НЕ проверяет disabled — ждём enabled явно.
    const wasDisabledInitially = await applyButton
      .isDisabled()
      .catch(() => false);
    const deadline = Date.now() + TIMEOUTS.MEDIUM;
    while (Date.now() < deadline) {
      const isDisabled = await applyButton.isDisabled().catch(() => false);
      if (!isDisabled) break;
      await this.page.waitForTimeout(200);
    }
    const isStillDisabled = await applyButton.isDisabled().catch(() => false);
    console.log(
      `[_applyReceiversModal] кнопка была disabled=${wasDisabledInitially}, сейчас disabled=${isStillDisabled}`,
    );

    await applyButton.click();

    // Wait for modal to close
    await modal
      .waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_OPEN })
      .catch(() => {});
  }

  async _clearAllEmployeesIfNeeded(modal) {
    if (this._allEmployeesCleared) return;

    // НЕ вызываем _switchReceiversTab — вызывающий код уже на вкладке Сотрудники
    // (или обязан переключиться сам). Лишний клик по вкладке вызывает ре-рендер,
    // который может сбрасывать или задерживать отрисовку AllOption_row.

    const allRow = this._getAllOptionRow(
      modal,
      /Все (сотрудники|пользователи)/i,
    );

    const rowVisible = await allRow
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);

    if (!rowVisible) {
      // Вкладка Сотрудники может быть не открыта — переключаемся явно
      await this._switchReceiversTab(modal, /Сотрудники|Пользователи/i);
      await allRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    }

    // Опрашиваем до 2s: после переключения вкладок React может применить
    // класс rowChecked с задержкой (аналогично _waitForAllGroupsAutoCleared).
    let isAllChecked = false;
    const checkDeadline = Date.now() + 2_000;
    while (Date.now() < checkDeadline) {
      isAllChecked = await this._isOptionChecked(allRow);
      if (isAllChecked) break;
      await this.page.waitForTimeout(200); // Legitimate: polling for React class update
    }
    console.log(`[_clearAllEmployeesIfNeeded] isAllChecked=${isAllChecked}`);

    if (!isAllChecked) {
      this._allEmployeesCleared = true;
      return;
    }

    // Нажимаем × на чипе "Все сотрудники" в нижней части модала —
    // это единственный способ корректно обновить React state.
    // allRow.click() и "Сбросить все" обновляют DOM визуально, но state не коммитится.
    const removed = await this._removeAllEmployeesChip(modal);
    if (!removed) {
      throw new Error(
        'Не удалось удалить чип "Все сотрудники" из футера модального окна.',
      );
    }

    // Ждём, пока строка потеряет класс rowChecked (дополнительное подтверждение)
    await this._waitForOptionUnchecked(allRow, "Все сотрудники", 8_000);

    // Commit-check: быстрый round-trip вкладок. Если после этого "Все сотрудники"
    // вернётся в selected, пробуем удалить ещё раз до перехода на "Отделы".
    const departmentsTab = modal
      .getByRole("button", { name: /^Отделы$/i })
      .or(
        modal
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /^Отделы$/i }),
      )
      .first();
    const usersTab = modal
      .getByRole("button", { name: /Сотрудники|Пользователи/i })
      .or(
        modal
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /Сотрудники|Пользователи/i }),
      )
      .first();

    const canRoundTrip =
      (await departmentsTab.isVisible().catch(() => false)) &&
      (await usersTab.isVisible().catch(() => false));

    if (canRoundTrip) {
      await departmentsTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
      await usersTab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      let rechecked = false;
      const recheckDeadline = Date.now() + 2_000;
      while (Date.now() < recheckDeadline) {
        rechecked = await this._isOptionChecked(allRow);
        if (rechecked) break;
        await this.page.waitForTimeout(200); // Legitimate: polling for React class update
      }

      if (rechecked) {
        const removedAgain = await this._removeAllEmployeesChip(modal);
        if (!removedAgain) {
          throw new Error(
            'После переключения вкладок "Все сотрудники" снова выбран и не удаляется из футера.',
          );
        }
        await this._waitForOptionUnchecked(allRow, "Все сотрудники", 8_000);
      }
    }

    this._allEmployeesCleared = true;
  }

  async _getDepartmentRows(modal) {
    const rows = modal.locator('[class*="DepartmentOption_row"]');
    await rows
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});

    const items = [];
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const nameEl = row.locator('[class*="DepartmentOption_name"]').first();
      let name = (await nameEl.textContent().catch(() => "")).trim();
      if (!name) {
        name = (await row.textContent().catch(() => "")).trim();
        name = name.replace(/\s+\d+\s+сотрудник.*/i, "").trim();
      }
      const normalized = this._normalizeName(name);
      if (!normalized) continue;
      items.push({ row, name, normalized });
    }
    return items;
  }

  async _getGroupRows(modal) {
    const rows = modal.locator('[class*="GroupOption_row"]');
    await rows
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});

    const items = [];
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const nameEl = row.locator('[class*="GroupOption_name"]').first();
      let name = (await nameEl.textContent().catch(() => "")).trim();
      if (!name) {
        name = (await row.textContent().catch(() => "")).trim();
        name = name.replace(/\s+\d+\s+сотрудник.*/i, "").trim();
      }
      const normalized = this._normalizeName(name);
      if (!normalized) continue;
      items.push({ row, name, normalized });
    }
    return items;
  }

  async _ensureExactDepartmentSelection(modal, departmentNames = []) {
    const desiredRaw = Array.from(
      new Set(departmentNames.map((name) => name.trim())),
    ).filter(Boolean);
    const desired = desiredRaw.map((name) => this._normalizeName(name));

    const rows = await this._getDepartmentRows(modal);
    if (!rows.length)
      throw new Error("Не нашли список отделов в модальном окне");

    for (let i = 0; i < desired.length; i += 1) {
      const normalized = desired[i];
      const item = rows.find((row) => row.normalized === normalized);
      if (!item) {
        throw new Error(`Отдел "${desiredRaw[i]}" не найден в списке`);
      }
      const checked = await this._isOptionChecked(item.row);
      if (!checked) {
        const checkBox = item.row
          .locator('[class*="DepartmentOption_checkBox"]')
          .first();
        await item.row
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() => checkBox.click({ force: true }).catch(() => {}));
        await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry delay in loop
      }
    }

    const collectChecked = async () => {
      const checked = [];
      for (const item of rows) {
        if (await this._isOptionChecked(item.row)) {
          checked.push(item.normalized);
        }
      }
      return Array.from(new Set(checked));
    };

    let checked = await collectChecked();
    checked = await collectChecked();
    const missing = desired.filter((name) => !checked.includes(name));
    // Не проверяем лишние отделы: при выборе корневого отдела все его
    // дочерние отделы автоматически выбираются — это ожидаемое поведение.
    if (missing.length) {
      const checkedNames = checked
        .map(
          (name) => rows.find((row) => row.normalized === name)?.name || name,
        )
        .filter(Boolean);
      throw new Error(
        `Не все нужные отделы выбраны. Ожидали: ${desiredRaw.join(", ")}. ` +
          `Фактически: ${checkedNames.join(", ") || "ничего"}.`,
      );
    }
  }

  async _ensureExactGroupSelection(modal, groupNames = []) {
    const desiredRaw = Array.from(
      new Set(groupNames.map((name) => name.trim())),
    ).filter(Boolean);
    const desired = desiredRaw.map((name) => this._normalizeName(name));

    const rows = await this._getGroupRows(modal);
    if (!rows.length) throw new Error("Не нашли список групп в модальном окне");

    // Снимаем выбор с групп, которые НЕ должны быть выбраны (чтобы убрать лишние после Все группы)
    for (const item of rows) {
      const isExtra = await this._isOptionChecked(item.row);
      if (isExtra && !desired.includes(item.normalized)) {
        const checkBox = item.row
          .locator('[class*="GroupOption_checkBox"]')
          .first();
        await item.row
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() => checkBox.click({ force: true }).catch(() => {}));
        await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry delay in loop
      }
    }

    for (let i = 0; i < desired.length; i += 1) {
      const normalized = desired[i];
      const item = rows.find((row) => row.normalized === normalized);
      if (!item) {
        throw new Error(`Группа "${desiredRaw[i]}" не найдена в списке`);
      }
      const checked = await this._isOptionChecked(item.row);
      if (!checked) {
        const checkBox = item.row
          .locator('[class*="GroupOption_checkBox"]')
          .first();
        await item.row
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() => checkBox.click({ force: true }).catch(() => {}));
        await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry delay in loop
      }
    }

    const collectChecked = async () => {
      const checked = [];
      for (const item of rows) {
        if (await this._isOptionChecked(item.row)) {
          checked.push(item.normalized);
        }
      }
      return Array.from(new Set(checked));
    };

    let checked = await collectChecked();
    checked = await collectChecked();
    const missing = desired.filter((name) => !checked.includes(name));
    const stillExtra = checked.filter((name) => !desired.includes(name));
    if (missing.length || stillExtra.length) {
      const checkedNames = checked
        .map(
          (name) => rows.find((row) => row.normalized === name)?.name || name,
        )
        .filter(Boolean);
      throw new Error(
        `Выбраны не те группы. Ожидали: ${desiredRaw.join(", ")}. ` +
          `Фактически: ${checkedNames.join(", ") || "ничего"}.`,
      );
    }
  }

  async _isOptionChecked(option) {
    const rowClass = (await option.getAttribute("class")) || "";
    if (/rowChecked|row--checked/i.test(rowClass)) return true;

    const ariaChecked = await option
      .getAttribute("aria-checked")
      .catch(() => null);
    if (ariaChecked === "true") return true;

    const inputChecked = await option
      .locator('input[type="checkbox"]:checked')
      .first()
      .isVisible()
      .catch(() => false);
    if (inputChecked) return true;

    return await option
      .locator('svg use[href*="ok"], svg use[xlink\\:href*="ok"]')
      .isVisible()
      .catch(() => false);
  }

  async _waitForOptionUnchecked(option, label, timeout = 8_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const checked = await this._isOptionChecked(option);
      if (!checked) return;
      await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry delay in loop
    }

    if (await this._isOptionChecked(option)) {
      throw new Error(`Не удалось снять выбор "${label}" в модальном окне.`);
    }
  }

  async _waitForAllDepartmentsAutoCleared(modal) {
    const allDepartmentsRow = this._getAllOptionRow(modal, /Все отделы/i);
    const visible = await allDepartmentsRow
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);
    if (!visible) return;

    // Опрашиваем до 2s: React может применить класс rowChecked с задержкой после смены вкладки
    let isChecked = false;
    const checkDeadline = Date.now() + 2_000;
    while (Date.now() < checkDeadline) {
      isChecked = await this._isOptionChecked(allDepartmentsRow);
      if (isChecked) break;
      await this.page.waitForTimeout(200); // Legitimate: polling loop
    }
    console.log(`[_waitForAllDepartmentsAutoCleared] isChecked=${isChecked}`);

    if (isChecked) {
      // Ищем чип "Все отделы" в футере модала и удаляем через Playwright .click()
      // (НЕ через _removeAllEmployeesChipFromFooter — та ищет "Все сотрудники")
      const footerAllDepsChip = this.page
        .locator('[class*="Footer_tags"] [class*="Tag_tag"]')
        .filter({ hasText: /Все\s+отделы/i })
        .first();

      const footerChipVisible = await footerAllDepsChip
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (footerChipVisible) {
        // Hover триггерит CSS :hover → × становится видимым. force: true — страховка.
        await footerAllDepsChip.hover().catch(() => {});
        const deleteIcon = footerAllDepsChip
          .locator('[class*="Tag_deleteIcon"]')
          .first();
        await deleteIcon
          .click({ force: true, timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      } else {
        // Fallback: кликаем чекбокс строки "Все отделы" напрямую
        const checkBox = allDepartmentsRow
          .locator('[class*="AllOption_checkBox"], [class*="checkBox"]')
          .first();
        await checkBox
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() =>
            allDepartmentsRow.click({ force: true }).catch(() => {}),
          );
      }

      await this._waitForOptionUnchecked(
        allDepartmentsRow,
        "Все отделы",
        6_000,
      );
    }
  }

  async _waitForAllGroupsAutoCleared(modal) {
    const allGroupsRow = this._getAllOptionRow(modal, /Все группы/i);
    const visible = await allGroupsRow
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);
    if (!visible) return;

    // Опрашиваем до 2s: React может применить класс rowChecked с задержкой после смены вкладки
    let isChecked = false;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      isChecked = await this._isOptionChecked(allGroupsRow);
      if (isChecked) break;
      await this.page.waitForTimeout(200); // Legitimate: polling loop
    }

    if (isChecked) {
      // Кликаем по кнопке "Сбросить все" рядом с "Все группы"
      const resetBtn = allGroupsRow
        .locator("xpath=ancestor::*[contains(@class,'AllOption')]")
        .first()
        .getByText(/Сбросить все/i)
        .first();
      const resetVisible = await resetBtn
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (resetVisible) {
        await resetBtn.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      } else {
        // Fallback: кликаем по чекбоксу "Все группы"
        const checkBox = allGroupsRow
          .locator('[class*="AllOption_checkBox"], [class*="checkBox"]')
          .first();
        await checkBox
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() => allGroupsRow.click({ force: true }));
      }

      await this._waitForOptionUnchecked(allGroupsRow, "Все группы", 6_000);
    }
  }

  async _selectDepartmentsInModal(modal, departmentNames = []) {
    await this._ensureExactDepartmentSelection(modal, departmentNames);
  }

  async _selectGroupsInModal(modal, groupNames = []) {
    const rows = modal.locator('[class*="GroupOption_row"]');
    await rows
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});

    for (const groupName of groupNames) {
      const safeName = this._escapeRegExp(groupName);
      const option = rows
        .filter({ hasText: new RegExp(safeName, "i") })
        .first();
      const optionCount = await option.count();
      if (!optionCount) {
        console.warn(`Группа "${groupName}" не найдена в списке`);
        continue;
      }

      await option.scrollIntoViewIfNeeded().catch(() => {});
      const checked = await this._isOptionChecked(option);
      if (!checked) {
        const checkBox = option
          .locator('[class*="GroupOption_checkBox"]')
          .first();
        await checkBox
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() => option.click({ force: true }));
        await this.page.waitForTimeout(TIMEOUTS.TINY); // Legitimate: retry delay in loop
      }
    }
  }

  /** Выбрать отделы для опроса */
  async selectDepartments(departmentNames = []) {
    await this._step(
      `Выбрать отделы для опроса: ${departmentNames.join(", ")}`,
      async () => {
        if (!departmentNames?.length) return;

        const modal = await this._openReceiversModal();
        // ВАЖНО: снимаем "Все сотрудники" ПЕРВЫМ — до _primeReceiversData.
        // _primeReceiversData заходит на вкладку "Отделы", и если "Все сотрудники"
        // ещё активны, происходит авто-выбор "Все отделы". После снятия — безопасно.
        await this._clearAllEmployeesIfNeeded(modal);
        await this._primeReceiversData(modal);
        await this._switchReceiversTab(modal, /^Отделы$/i);
        await this._waitForAllDepartmentsAutoCleared(modal);
        await this._selectDepartmentsInModal(modal, departmentNames);
        await this._applyReceiversModal(modal);
      },
    );
  }

  /** Выбрать отделы для опроса (обновленный модал) */
  async selectDepartmentsV2(departmentNames = []) {
    await this.selectDepartments(departmentNames);
  }

  /** Выбрать группы для опроса */
  async selectGroups(groupNames = []) {
    await this._step(
      `Выбрать группы для опроса: ${groupNames.join(", ")}`,
      async () => {
        if (!groupNames?.length) return;

        const modal = await this._openReceiversModal();
        // ВАЖНО: снимаем "Все сотрудники" ПЕРВЫМ — до _primeReceiversData.
        await this._clearAllEmployeesIfNeeded(modal);
        await this._primeReceiversData(modal);
        await this._switchReceiversTab(modal, /^Группы$/i);
        await this._selectGroupsInModal(modal, groupNames);
        await this._applyReceiversModal(modal);
      },
    );
  }

  async selectGroupsExact(groupNames = []) {
    await this._step(
      `Выбрать группы для опроса (точный список): ${groupNames.join(", ")}`,
      async () => {
        if (!groupNames?.length) return;

        const modal = await this._openReceiversModal();

        // 0. Снимаем "Все сотрудники" ПЕРВЫМ — до прогрева данных.
        //    _primeReceiversData заходит на вкладку "Группы", и если "Все сотрудники"
        //    ещё активны, происходит авто-выбор "Все группы". После снятия — безопасно.
        await this._clearAllEmployeesIfNeeded(modal);

        // 1. Прогреваем данные: обходим вкладки Отделы → Группы → Сотрудники,
        //    теперь это безопасно — "Все сотрудники" уже снят.
        await this._primeReceiversData(modal);

        // 2. Переходим на Группы
        await this._switchReceiversTab(modal, /^Группы$/i);

        // 3. Ждём загрузки списка групп
        await modal
          .locator('[class*="GroupOption_row"]')
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // 4. Выбираем нужные группы
        await this._ensureExactGroupSelection(modal, groupNames);
        await this._applyReceiversModal(modal);
      },
    );
  }

  /** Выбрать отделы и группы для опроса */
  async selectDepartmentsAndGroups(departmentNames = [], groupNames = []) {
    await this._step("Выбрать отделы и группы для опроса", async () => {
      if (!departmentNames?.length && !groupNames?.length) return;

      const modal = await this._openReceiversModal();
      // ВАЖНО: снимаем "Все сотрудники" ПЕРВЫМ — до _primeReceiversData.
      await this._clearAllEmployeesIfNeeded(modal);
      await this._primeReceiversData(modal);

      if (departmentNames?.length) {
        await this._switchReceiversTab(modal, /^Отделы$/i);
        await this._waitForAllDepartmentsAutoCleared(modal);
        await this._selectDepartmentsInModal(modal, departmentNames);
      }

      if (groupNames?.length) {
        await this._switchReceiversTab(modal, /^Группы$/i);
        await this._selectGroupsInModal(modal, groupNames);
      }

      await this._applyReceiversModal(modal);
    });
  }

  // ---------------------------------------------------------------------------
  // Публикация
  // ---------------------------------------------------------------------------

  async _clickPublishConfirmButton({ timeout = 3_000, required = false } = {}) {
    const publishDialogText = this.page
      .getByText(/Вы отправляете опрос|You are sending.*survey/i)
      .first();

    const dialogVisible = await publishDialogText
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);

    if (!dialogVisible) {
      if (required) {
        throw new Error(
          'После клика "Опубликовать опрос" не появилась модалка подтверждения публикации.',
        );
      }
      return false;
    }

    // Берём ближайший контейнер модалки, в котором есть кнопки.
    const dialogContainer = publishDialogText
      .locator("xpath=ancestor::*[.//button][1]")
      .first();
    const confirmButton = dialogContainer
      .getByRole("button", { name: /Подтвердить|Confirm/i })
      .or(
        dialogContainer
          .locator("button")
          .filter({ hasText: /Подтвердить|Confirm/i }),
      )
      .first();

    await confirmButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    await confirmButton.scrollIntoViewIfNeeded().catch(() => {});

    const enableDeadline = Date.now() + TIMEOUTS.SHORT;
    while (Date.now() < enableDeadline) {
      const disabled = await confirmButton.isDisabled().catch(() => false);
      if (!disabled) break;
      await this.page.waitForTimeout(150); // Legitimate: polling for enabled state
    }

    const waitDialogClosed = async (timeout = 2_500) =>
      await publishDialogText
        .waitFor({ state: "hidden", timeout })
        .then(() => true)
        .catch(() => false);

    let dialogClosed = await waitDialogClosed(300);
    if (!dialogClosed) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (attempt === 1) {
          await confirmButton
            .click({ timeout: TIMEOUTS.SHORT })
            .catch(() => {});
        } else if (attempt === 2) {
          await confirmButton
            .click({ force: true, timeout: TIMEOUTS.SHORT })
            .catch(() => {});
        } else {
          await confirmButton.focus().catch(() => {});
          await this.page.keyboard.press("Enter").catch(() => {});
        }

        dialogClosed = await waitDialogClosed(
          attempt === 3 ? TIMEOUTS.MEDIUM : 2_500,
        );
        if (dialogClosed) break;
      }
    }

    if (!dialogClosed && required) {
      throw new Error(
        'Кнопка "Подтвердить" нажата, но модалка публикации не закрылась.',
      );
    }

    await this.page
      .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
      .catch(() => {});
    return true;
  }

  /** Подтвердить модалку отправки опроса, если появляется */
  async _confirmPublishIfModal() {
    return await this._clickPublishConfirmButton({
      timeout: 3_000,
      required: false,
    });
  }

  /** Подождать кнопку "Подтвердить" где угодно на странице и кликнуть */
  async _waitAndClickConfirmButton(timeout = 30_000, required = false) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      // Кликаем только целевой confirm модалки публикации опроса.
      const clickedPublishConfirm = await this._clickPublishConfirmButton({
        timeout: 1_000,
        required: false,
      });
      if (clickedPublishConfirm) {
        if (required) {
          const stillVisible = await this.page
            .getByText(/Вы отправляете опрос|You are sending.*survey/i)
            .first()
            .isVisible()
            .catch(() => false);
          if (stillVisible) {
            throw new Error(
              'Кнопка "Подтвердить" нажата, но модалка публикации не закрылась.',
            );
          }
        }
        return true;
      }

      await this.page.waitForTimeout(TIMEOUTS.SMALL); // Legitimate: retry delay in loop
    }

    if (required) {
      throw new Error(
        'Не удалось найти и нажать кнопку "Подтвердить" при публикации.',
      );
    }
    return false;
  }

  /** Дождаться блока с публичной ссылкой, подталкивая клики по "Подтвердить" если нужно */
  async _waitForShareLinkBlock(timeoutMs = 60_000) {
    const shareBlock = this.page
      .locator("div.BlockShadow_block__t61Gm")
      .filter({ hasText: /Ссылка на опрос/i })
      .first();

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const visible = await shareBlock.isVisible().catch(() => false);
      if (visible) return shareBlock;

      // Подтолкнуть подтверждение, если висит экран
      await this._confirmPublishIfModal().catch(() => {});
      await this._waitAndClickConfirmButton(3_000).catch(() => {});

      await this.page.waitForTimeout(TIMEOUTS.ANIMATION); // Legitimate: retry delay in loop
    }

    // Финальная попытка дождаться, чтобы выбросить понятную ошибку
    await shareBlock.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    return shareBlock;
  }

  async publishSurvey() {
    await this._step('Нажать кнопку "Опубликовать опрос"', async () => {
      const button = this.publishButton;

      await button.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click();

      // Диалог подтверждения появляется не всегда (зависит от аудитории опроса).
      // required=false: не бросаем ошибку если диалог не появился.
      await this._waitAndClickConfirmButton(20_000, false);
      // На части окружений может быть второй confirm-step.
      await this._confirmPublishIfModal();
    });
  }

  async assertSurveyStartedAndCollecting() {
    await this._step(
      "Проверить, что опрос запущен и собирает ответы",
      async () => {
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});

        // Ждём появления статуса до 40 секунд, допускаем разные формулировки
        const statusText = await this.page
          .waitForFunction(
            () => {
              const el =
                document.querySelector('[class*="CurrentStatus_title"]') ||
                Array.from(document.querySelectorAll("*")).find((node) =>
                  /опрос.+(запущен|опубликован)/i.test(node.textContent || ""),
                );
              return el?.textContent?.trim();
            },
            { timeout: TIMEOUTS.EXTRA_LONG },
          )
          .catch(() => "");

        const normalized = String(statusText || "").toLowerCase();
        const ok =
          normalized.includes("запущен") ||
          normalized.includes("собирает ответы") ||
          normalized.includes("опубликован") ||
          normalized.includes("опубликовано");

        if (!ok) {
          throw new Error(
            `Не дождались статуса публикации. Текст статуса: "${statusText || "пусто"}".`,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Публичная ссылка
  // ---------------------------------------------------------------------------

  async openSurveyShareLink() {
    await this._step(
      "Скопировать публичную ссылку на опрос и открыть её",
      async () => {
        let input = this.shareLinkContainer
          .locator("xpath=ancestor::div[1]")
          .locator("input")
          .first();

        if (!(await input.count())) {
          input = this.page
            .locator(
              'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
            )
            .first();
        }

        const url = (await input.inputValue()).trim();

        if (!url) {
          throw new Error(
            "Не удалось прочитать публичную ссылку на опрос из поля ввода.",
          );
        }

        await this.page.goto(url);
      },
    );
  }

  /** Получить публичную ссылку на опрос (без открытия) */
  async getSurveyShareLink() {
    return await this._step("Получить публичную ссылку на опрос", async () => {
      // Убедимся, что модалка публикации закрыта
      await this._confirmPublishIfModal();
      // На всякий случай повторим попытку закрыть модалку, если она ещё на экране
      await this._confirmPublishIfModal();
      // Дополнительно пробуем кликнуть "Подтвердить" через evaluate (на случай нестандартной разметки)
      try {
        await this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("*")).find((el) =>
            /подтвердить/i.test(el.textContent || ""),
          );
          btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
      } catch {}

      // Ждём появления блока с ссылкой (ShareLink), кликая "Подтвердить" если нужно
      const shareBlock = await this._waitForShareLinkBlock(60_000);

      let input = shareBlock.locator('input[readonly][type="text"]').first();

      if (!(await input.count())) {
        input = this.page.locator('input[readonly][type="text"]').first();
      }

      // Если ссылка ещё не подставилась - подождём value с http
      await this.page
        .waitForFunction(
          (el) => el && /^https?:\/\//i.test(el.value || ""),
          input,
          { timeout: TIMEOUTS.ELEMENT_VISIBLE },
        )
        .catch(() => {});

      const url = (await input.inputValue()).trim();

      if (!url) {
        throw new Error(
          "Не удалось прочитать публичную ссылку на опрос из поля ввода.",
        );
      }

      return url;
    });
  }

  /** Дождаться статуса публикации (запущен/опубликован/собирает ответы) */
  async waitForPublishedStatus() {
    await this._step("Дождаться статуса опубликованного опроса", async () => {
      await this._waitAndClickConfirmButton(10_000).catch(() => {});
      await this._confirmPublishIfModal().catch(() => {});

      const statusText = await this.page
        .waitForFunction(
          () => {
            const el =
              document.querySelector('[class*="CurrentStatus_title"]') ||
              Array.from(document.querySelectorAll("*")).find((node) =>
                /опрос.+(запущен|опубликован|собирает ответы)/i.test(
                  node.textContent || "",
                ),
              );
            return el?.textContent?.trim();
          },
          { timeout: TIMEOUTS.EXTRA_LONG },
        )
        .catch(() => "");

      const normalized = String(statusText || "").toLowerCase();
      const ok =
        normalized.includes("запущен") ||
        normalized.includes("собирает ответы") ||
        normalized.includes("опубликован") ||
        normalized.includes("опубликовано");

      if (!ok) {
        // Фолбэк: если нет статуса, но появился блок со ссылкой — считаем ок
        const shareInput = this.page
          .locator('input[readonly][type="text"]')
          .filter({ hasText: undefined })
          .first();
        const hasLink = await this.page
          .waitForFunction(
            (el) => !!el && /^https?:\/\//i.test(el.value || ""),
            shareInput,
            { timeout: 8_000 },
          )
          .then(() => true)
          .catch(() => false);

        if (!hasLink) {
          throw new Error(
            `Не дождались статуса публикации. Текст статуса: "${statusText || "пусто"}".`,
          );
        }
      }
    });
  }

  /**
   * Удалить чип "Все сотрудники" прямо на странице настроек публикации
   * (вне модального окна — в секции "Кто участвует в опросе").
   */
  async removeAllEmployeesChipFromPage() {
    await this._step(
      'Удалить чип "Все сотрудники" на странице публикации',
      async () => {
        const chip = this.page
          .locator('[class*="Tag_tag"]')
          .filter({ hasText: /Все сотрудники/i })
          .first();

        await chip.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const deleteIcon = chip.locator('[class*="Tag_deleteIcon"]').first();
        await deleteIcon.click({ force: true });

        await chip.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT });
      },
    );
  }

  /**
   * Убедиться, что опрос НЕ анонимный (выключить анонимность если включена).
   * Ищет checkbox `input[name="isAnonim"]` и кликает по родительскому Toggler,
   * если чекбокс checked.
   */
  async ensureAnonymousOff() {
    await this._step("Выключить анонимность опроса (если включена)", async () => {
      const anonCheckbox = this.page
        .locator('input[name="isAnonim"]')
        .first();
      await anonCheckbox.waitFor({
        state: "attached",
        timeout: TIMEOUTS.MEDIUM,
      });

      const isChecked = await anonCheckbox.isChecked();
      if (isChecked) {
        const toggler = this.page
          .locator('[class*="Toggler_toggler"]')
          .filter({ has: anonCheckbox })
          .first();
        await toggler.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => {});
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Вспомогательное
  // ---------------------------------------------------------------------------
}
