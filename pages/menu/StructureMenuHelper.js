// pages/menu/StructureMenuHelper.js
// Хелпер для работы с меню "Орг. структура"
import { BaseMenuHelper } from "./BaseMenuHelper.js";
import { TIMEOUTS } from "../../tests/utils/constants.js";
import { SELECTORS } from "../../tests/utils/selectors.js";

/**
 * Хелпер для работы с пунктом меню "Орг. структура"
 */
export class StructureMenuHelper extends BaseMenuHelper {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Главный пункт меню
    this.orgStructureMenuItem = this.page
      .locator(
        `li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Орг. структура")), ` +
          `a:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Орг. структура"))`,
      )
      .first();

    // Ссылки в подменю
    this.structureConstructorLink = this.page
      .locator(
        'a[href*="/structure/constructor/"], a[href*="/structure/constructor"]',
      )
      .filter({ hasText: /Структура компании/i });

    this.structureUsersLink = this.page
      .locator('a[href*="/structure/users/"], a[href*="/structure/users"]')
      .filter({ hasText: /Список сотрудников/i })
      .first();

    this.structureUsersAddLink = this.page
      .locator(
        'a[href*="/structure/users/add/"], a[href*="/structure/users/add"]',
      )
      .filter({ hasText: /Добавить сотрудника/i })
      .first();

    this.structureInviteLinksLink = this.page
      .locator(
        'a[href*="/structure/invite-links/"], a[href*="/structure/invite-links"]',
      )
      .filter({ hasText: /Пригласить по ссылке/i })
      .first();

    this.structureImportLink = this.page
      .locator('a[href*="/structure/import/"], a[href*="/structure/import"]')
      .filter({ hasText: /Загрузить таблицу/i })
      .first();

    this.structureUserGroupsLink = this.page
      .locator(
        'a[href*="/structure/user-groups/"], a[href*="/structure/user-groups"]',
      )
      .filter({ hasText: /групп/i })
      .first();

    this.structureDepartmentsLink = this.page
      .locator(
        'a[href*="/structure/departments/root/"], a[href*="/structure/departments/department"]',
      )
      .filter({ hasText: /Настройка отделов/i })
      .first();
  }

  /** Открыть "Структура компании" через пункт "Орг. структура" */
  async openStructureConstructor() {
    await this._step(
      'Открыть "Структура компании" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/constructor(\/|\?|$)/;
        if (targetUrl.test(this.page.url())) return;

        const item = this.orgStructureMenuItem;
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // открываем панель, иногда достаточно hover, иногда нужен клик
        await item.hover().catch(() => null);
        const link = this.structureConstructorLink.first();

        try {
          await link.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await item.hover().catch(() => null);
          await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }

        await Promise.all([
          this.page
            .waitForURL(targetUrl, { timeout: TIMEOUTS.URL_CHANGE })
            .catch(() => null),
          link.click(),
        ]);

        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
        await this._moveCursorToContent();
      },
    );
  }

  /** Открыть "Список сотрудников" через пункт "Орг. структура" */
  async openStructureUsers() {
    await this._step(
      'Открыть "Список сотрудников" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/users(\/|\?|$)/;
        if (targetUrl.test(this.page.url())) return;

        await this._openStructureSubLinkWithFallback(
          this.structureUsersLink,
          targetUrl,
          "/ru/manager/structure/users/",
        );
      },
    );
  }

  /** Открыть "Добавить сотрудника" через пункт "Орг. структура" */
  async openStructureUsersAdd() {
    await this._step(
      'Открыть "Добавить сотрудника" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/users\/add(\/|\?|$)/;
        if (targetUrl.test(this.page.url())) return;

        await this._openStructureSubLink(this.structureUsersAddLink, targetUrl);
      },
    );
  }

  /** Открыть "Пригласить по ссылке" через пункт "Орг. структура" */
  async openStructureInviteLinks() {
    await this._step(
      'Открыть "Пригласить по ссылке" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/invite-links(\/|\?|$)/;
        if (targetUrl.test(this.page.url())) return;

        await this._openStructureSubLink(
          this.structureInviteLinksLink,
          targetUrl,
        );
      },
    );
  }

  /** Открыть "Загрузить таблицу" через пункт "Орг. структура" */
  async openStructureImport() {
    await this._step(
      'Открыть "Загрузить таблицу" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/import(\/|\?|$)/;
        if (targetUrl.test(this.page.url())) return;

        await this._openStructureSubLink(this.structureImportLink, targetUrl);
      },
    );
  }

  /** Открыть "Группы пользователей" через пункт "Орг. структура" */
  async openStructureUserGroups() {
    await this._step(
      'Открыть "Группы пользователей" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/user-groups/;
        if (targetUrl.test(this.page.url())) return;

        const item = this.orgStructureMenuItem;
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Сначала кликаем на пункт меню, чтобы открыть подменю
        await item.click().catch(() => null);
        await item.hover().catch(() => null);

        // Пробуем найти ссылку разными способами
        let link = this.structureUserGroupsLink;

        // Если не нашли по основному локатору, пробуем альтернативные варианты
        const linkVisible = await link
          .waitFor({ state: "visible", timeout: TIMEOUTS.MODAL_CLOSE })
          .then(() => true)
          .catch(() => false);
        if (!linkVisible) {
          // Пробуем найти по более широкому паттерну
          link = this.page
            .locator('a[href*="/structure/user-groups"]')
            .filter({ hasText: /групп/i })
            .first();

          const altLinkVisible = await link
            .waitFor({ state: "visible", timeout: TIMEOUTS.MODAL_CLOSE })
            .then(() => true)
            .catch(() => false);
          if (!altLinkVisible) {
            // Последняя попытка - найти любую ссылку на user-groups
            link = this.page
              .locator('a[href*="/structure/user-groups"]')
              .first();
          }
        }

        await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await Promise.all([
          this.page
            .waitForURL(targetUrl, { timeout: TIMEOUTS.URL_CHANGE })
            .catch(() => null),
          link.click(),
        ]);

        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
        await this._moveCursorToContent();
      },
    );
  }

  /** Открыть "Настройка отделов" через пункт "Орг. структура" */
  async openStructureDepartments() {
    await this._step(
      'Открыть "Настройка отделов" через боковое меню',
      async () => {
        const targetUrl = /\/manager\/structure\/departments(\/|\?|$)/;
        if (targetUrl.test(this.page.url())) return;

        await this._openStructureSubLink(
          this.structureDepartmentsLink,
          targetUrl,
        );
      },
    );
  }

  /** Внутренний метод для открытия ссылок из подменю "Орг. структура" */
  async _openStructureSubLink(linkLocator, targetUrlRe) {
    // Альтернативный способ: напрямую перейти по URL если меню свёрнуто
    // Сначала пробуем через меню, если не получится — переходим напрямую

    const item = this.orgStructureMenuItem;

    // Проверяем видимость пункта меню по тексту
    const menuVisible = await item
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);

    if (!menuVisible) {
      // Меню свёрнуто — пробуем навести на сайдбар для раскрытия
      const sidebar = this.page
        .locator('nav[class*="Menu"], aside, [class*="SideMenu"]')
        .first();
      await sidebar.hover().catch(() => null);
      // Ждём раскрытия меню после hover
      await item
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Проверяем ещё раз
      const menuVisibleAfterHover = await item
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (!menuVisibleAfterHover) {
        // Меню не раскрылось — переходим напрямую по ссылке
        const link = linkLocator;
        const href = await link.getAttribute("href").catch(() => null);

        if (href) {
          await this.page.goto(href, { waitUntil: "domcontentloaded" });
          await this.page
            .waitForLoadState("domcontentloaded", {
              timeout: TIMEOUTS.PAGE_LOAD,
            })
            .catch(() => null);
          return;
        }
      }
    }

    await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    // Кликаем на пункт меню, затем наводим — так надёжнее раскрывается подменю
    await item.click().catch(() => null);
    await item.hover().catch(() => null);

    const link = linkLocator;

    try {
      await link.waitFor({ state: "visible", timeout: TIMEOUTS.MODAL_CLOSE });
    } catch {
      // Повторная попытка раскрыть подменю
      await item.click().catch(() => null);
      await item.hover().catch(() => null);

      try {
        await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      } catch {
        // Последняя попытка — переходим напрямую
        const href = await link.getAttribute("href").catch(() => null);
        if (href) {
          await this.page.goto(href, { waitUntil: "domcontentloaded" });
          await this.page
            .waitForLoadState("domcontentloaded", {
              timeout: TIMEOUTS.PAGE_LOAD,
            })
            .catch(() => null);
          return;
        }
        throw new Error("Не удалось открыть ссылку из подменю Орг. структура");
      }
    }

    await Promise.all([
      this.page
        .waitForURL(targetUrlRe, { timeout: TIMEOUTS.URL_CHANGE })
        .catch(() => null),
      link.click(),
    ]);

    await this.page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
      .catch(() => null);
    await this._moveCursorToContent();
  }

  /**
   * Открыть ссылку из подменю с fallback на прямой URL
   * @param {import('@playwright/test').Locator} linkLocator
   * @param {RegExp} targetUrlRe
   * @param {string} fallbackUrl - прямой URL для перехода если меню не работает
   */
  async _openStructureSubLinkWithFallback(
    linkLocator,
    targetUrlRe,
    fallbackUrl,
  ) {
    // Проверяем видимость ТЕКСТА "Орг. структура" (не самого элемента li)
    // Когда меню свёрнуто, li виден, но текст скрыт
    const menuTextLocator = this.page
      .locator(`span${SELECTORS.MENU_ITEM_TITLE}`)
      .filter({ hasText: /Орг\.\s*структура/i })
      .first();
    const menuTextVisible = await menuTextLocator
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);

    if (!menuTextVisible) {
      // Меню свёрнуто — переходим напрямую
      // Строим абсолютный URL из текущего page.url()
      const currentUrl = new URL(this.page.url());
      const absoluteUrl = `${currentUrl.origin}${fallbackUrl}`;
      await this.page.goto(absoluteUrl, { waitUntil: "domcontentloaded" });
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
      return;
    }

    const item = this.orgStructureMenuItem;

    // Кликаем на пункт меню, затем наводим
    await item.click().catch(() => null);
    await item.hover().catch(() => null);

    const link = linkLocator;

    try {
      await link.waitFor({ state: "visible", timeout: TIMEOUTS.MODAL_CLOSE });
    } catch {
      // Подменю не раскрылось — переходим напрямую
      const currentUrl = new URL(this.page.url());
      const absoluteUrl = `${currentUrl.origin}${fallbackUrl}`;
      await this.page.goto(absoluteUrl, { waitUntil: "domcontentloaded" });
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
      return;
    }

    await Promise.all([
      this.page
        .waitForURL(targetUrlRe, { timeout: TIMEOUTS.URL_CHANGE })
        .catch(() => null),
      link.click(),
    ]);

    await this.page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
      .catch(() => null);
    await this._moveCursorToContent();
  }
}
