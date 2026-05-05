import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/VirtualCurrencySettingsPage.js

export class VirtualCurrencySettingsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // h1 "Виртуальная валюта"
    this.heading = this.page
      .getByRole("heading", { level: 1, name: "Виртуальная валюта" })
      .first();

    // Основные кнопки-тогглы на странице
    this.disableButton = this.page.getByRole("button", {
      name: "Выключить виртуальную валюту",
    });
    this.enableButton = this.page.getByRole("button", {
      name: "Включить виртуальную валюту",
    });

    // Кнопки подтверждения в модалках
    this.confirmDisableButton = this.page.getByRole("button", {
      name: "Да, отключить",
    });
    this.confirmEnableButton = this.page.getByRole("button", {
      name: "Подтвердить и включить виртуальную валюту",
    });

    // Кнопка-ссылка "Перейти в магазин" в настройках магазина подарков
    this.goToGiftShopButton = this.page.getByRole("link", {
      name: "Перейти в магазин",
    });

    // Секция уведомлений о заказах - кнопка "Добавить"
    this.addNotificationRecipientButton = this.page.getByRole("button", {
      name: "Добавить",
    });

    // Ссылка "Начислить виртуальную валюту" (переход на страницу начисления)
    this.depositVirtualCurrencyLink = this.page
      .getByRole("link", { name: "Начислить виртуальную валюту" })
      .first();

    // Header / popup
    this._header = this.page.locator("header").first();

    // ВАЖНО: не "header img" (там логотип), а именно img внутри аватарки
    this._headerAvatarImg = this._header
      .locator('span[class*="Avatar_avatar__"] img')
      .first();

    this._headerPopup = this.page
      .locator('div[class*="PopupWidget_popup"]')
      .first();
    this._headerPopupUserName = this._headerPopup.locator("b").first();

    // Балансы в хедере (оба числа)
    this._headerBalanceLabels = this._header.locator(
      'span[class*="HeaderButton_label"]',
    );
  }

  /** Открыть страницу начисления виртуальной валюты */
  async openDepositVirtualCurrency() {
    await this._step(
      'Открыть страницу "Начислить виртуальную валюту"',
      async () => {
        await this.depositVirtualCurrencyLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.depositVirtualCurrencyLink.click();
        await this.page.waitForURL(URL_PATTERNS.VIRTUAL_CURRENCY_DEPOSIT, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
      },
    );
  }

  /**
   * Получить имя текущего пользователя из шапки.
   * В текущем UI имя надежно читается из попапа, который открывается по клику на аватар.
   */
  async getCurrentUserFullNameFromHeader() {
    return this._step(
      "Считать ФИО текущего пользователя из шапки",
      async () => {
        await this._openHeaderUserPopup();

        const name = await this._headerPopupUserName
          .innerText()
          .then((x) => x.trim())
          .catch(() => "");

        await this._closeHeaderUserPopup();

        if (!name) {
          throw new Error(
            "Не удалось считать ФИО пользователя из попапа в шапке",
          );
        }

        return name;
      },
    );
  }

  /**
   * Старое поведение (вчера): "виртуальная валюта" = валюта для благодарности/дарения (левое число).
   * Оставляем для старых тестов.
   */
  async getHeaderVirtualCurrencyBalance() {
    return this.getHeaderThanksBalance();
  }

  /** Валюта для благодарности/дарения (обычно левое число в хедере) */
  async getHeaderThanksBalance() {
    return this._step(
      "Считать баланс (для благодарности) из шапки",
      async () => {
        // чаще всего это "первое число" в хедере
        const byIndex = await this._readHeaderBalanceByIndex(0).catch(
          () => null,
        );
        if (typeof byIndex === "number") return byIndex;

        // fallback: любое число в header
        return this._readAnyHeaderNumber();
      },
    );
  }

  /** Валюта для магазина (обычно число рядом с 💎 / diamond, часто второе) */
  async getHeaderShopBalance() {
    return this._step("Считать баланс (для магазина) из шапки", async () => {
      // 1) попытка найти по иконке diamond/gem в кнопке
      const byIcon = await this._readHeaderBalanceByIcon(
        /diamond|gem|brilliant|crystal/i,
      ).catch(() => null);
      if (typeof byIcon === "number") return byIcon;

      // 2) fallback: "второе число" (или последнее числовое)
      const byLast = await this._readHeaderBalanceLast().catch(() => null);
      if (typeof byLast === "number") return byLast;

      return this._readAnyHeaderNumber();
    });
  }

  // --- Backward compatibility for old tests ---
  async getHeaderGiftBalance() {
    return this.getHeaderThanksBalance();
  }

  /**
   * Скачать отчёт "Балансы сотрудников" в формате XLSX.
   * Скачивание происходит в новой вкладке.
   * @param {import('@playwright/test').TestInfo} testInfo - для сохранения файла в артефакты
   * @returns {Promise<string>} путь к скачанному файлу
   */
  async downloadBalancesReport(testInfo) {
    return this._step('Скачать отчёт "Балансы сотрудников"', async () => {
      const downloadButton = this.page
        .getByRole('button', { name: /скачать балансы сотрудников/i })
        .first();

      await downloadButton.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });

      const context = this.page.context();

      // Скачивание открывается в новой вкладке
      const newPagePromise = context.waitForEvent('page', { timeout: TIMEOUTS.EXTRA_LONG });
      await downloadButton.click();

      const newPage = await newPagePromise;
      const download = await newPage.waitForEvent('download', { timeout: TIMEOUTS.EXTRA_LONG });

      // Сохраняем файл в артефакты теста
      const downloadPath = testInfo.outputPath('balances.xlsx');
      await download.saveAs(downloadPath);

      await newPage.close();

      return downloadPath;
    });
  }

  /**
   * Скачать отчёт "Балансы сотрудников" через API-токен.
   * Используется для тестов, где нужен контроль над процессом скачивания.
   * @param {import('@playwright/test').TestInfo} testInfo - для сохранения файла в артефакты
   * @param {object} [options] - опции
   * @param {boolean} [options.debug=false] - выводить отладочную информацию
   * @returns {Promise<string>} путь к скачанному файлу
   */
  async downloadBalancesReportViaToken(testInfo, options = {}) {
    const debug = options.debug || process.env.VC_DEBUG === '1';
    const log = debug ? console.log.bind(console) : () => {};

    return this._step('Скачать отчёт "Балансы сотрудников" через токен', async () => {
      const downloadButton = this.page
        .getByRole('button', { name: /скачать балансы сотрудников/i })
        .first();

      await downloadButton.click();

      // Ждём ответ с токеном экспорта
      const tokenResponse = await this.page.waitForResponse(
        res =>
          res.status() === 200 &&
          /karma\/wallet\/balances\/export\/get-token/i.test(res.url()),
        { timeout: TIMEOUTS.EXTRA_LONG }
      );

      const tokenJson = await tokenResponse.json().catch(() => ({}));
      const token =
        tokenJson?.token ||
        tokenJson?.data?.token ||
        tokenJson?.result?.token ||
        tokenJson?.value ||
        null;

      if (!token) {
        throw new Error(`Не получили токен экспорта, ответ: ${JSON.stringify(tokenJson)}`);
      }

      log('[VC] Токен получен, url:', tokenResponse.url(), 'body:', tokenJson);

      const tokenUrl = new URL(tokenResponse.url());
      const apiBase = tokenUrl.origin;
      const clientBase = new URL(process.env.BASE_URL || process.env.STAND_URL || apiBase).origin;
      const userDate = tokenUrl.searchParams.get('userDate') || '';
      const userDateParam = userDate ? `&userDate=${encodeURIComponent(userDate)}` : '';

      const candidates = [
        `${apiBase}/public/karma/wallet/balances/export/xlsx/?token=${token}${userDateParam}`,
        `${apiBase}/public/karma/wallet/balances/export/xlsx?token=${token}${userDateParam}`,
        `${clientBase}/public/karma/wallet/balances/export/xlsx/?token=${token}${userDateParam}`,
        `${clientBase}/public/karma/wallet/balances/export/xlsx?token=${token}${userDateParam}`,
      ];

      let saved = false;
      const downloadPath = testInfo.outputPath('balances.xlsx');
      const fs = await import('node:fs');

      for (const url of candidates) {
        const resp = await this.page.request.get(url, { timeout: TIMEOUTS.EXTRA_LONG });
        const ct = (resp.headers()['content-type'] || '').toLowerCase();
        log('[VC] Запрос за отчетом:', url, 'status', resp.status(), 'ct', ct);

        const ok =
          resp.status() === 200 &&
          (ct.includes('spreadsheet') ||
            ct.includes('excel') ||
            ct.includes('sheet') ||
            ct.includes('octet-stream'));

        if (ok) {
          const buffer = await resp.body();
          fs.writeFileSync(downloadPath, buffer);
          log('[VC] Отчет скачан в', downloadPath, 'из', url);
          saved = true;
          break;
        }
      }

      if (!saved) {
        throw new Error('Не удалось скачать файл балансов по token');
      }

      return downloadPath;
    });
  }

  /**
   * Открыть страницу "История операций".
   * Кнопка находится на странице настроек виртуальной валюты.
   */
  async openOperationsHistory() {
    await this._step('Открыть "История операций"', async () => {
      const historyButton = this.page.getByRole('button', { name: /история операций/i });
      await historyButton.waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
      await historyButton.click();

      // Ждём появления таблицы с историей
      const table = this.page.locator('table');
      await table.waitFor({ state: 'visible', timeout: TIMEOUTS.LONG });
    });
  }

  /**
   * Собрать данные из таблицы истории операций с пагинацией.
   * @param {object} [options] - опции
   * @param {number} [options.maxPages=3] - максимальное количество страниц для сбора
   * @param {boolean} [options.debug=false] - выводить отладочную информацию
   * @returns {Promise<Record<string, number>>} словарь {имя_получателя: сумма}
   */
  async collectHistoryBalances(options = {}) {
    const maxPages = options.maxPages ?? 3;
    const debug = options.debug || process.env.VC_DEBUG === '1';
    const log = debug ? console.log.bind(console) : () => {};

    return this._step(`Собрать историю операций (до ${maxPages} страниц)`, async () => {
      const table = this.page.locator('table');
      /** @type {Record<string, number>} */
      const balances = {};
      let pagesVisited = 0;

      const collectCurrentPage = async () => {
        const rows = table.locator('tbody tr');
        const totalRows = await rows.count();
        /** @type {Array<{amountText: string, receiver: string, parsed: number}>} */
        const samples = [];

        for (let i = 0; i < totalRows; i++) {
          const cols = rows.nth(i).locator('td');
          const amountText = (await cols.nth(1).innerText()).trim();
          const receiverTextRaw = (await cols.nth(4).innerText()).trim();

          const raw = amountText.match(/[-+]?\d[\d\s]*/)?.[0] || '';
          const amountNum = raw ? Number(raw.replace(/\s+/g, '')) : 0;

          // Нормализуем получателя: убираем букву-инициал в начале и лишние пробелы
          const receiverClean = receiverTextRaw
            .replace(/\s+/g, ' ')
            .replace(/^[A-ZА-ЯЁa-zа-яё]\s+/, '')
            .trim();

          if (samples.length < 5) {
            samples.push({ amountText, receiver: receiverClean, parsed: amountNum });
          }

          if (!receiverClean) continue;
          balances[receiverClean] = (balances[receiverClean] ?? 0) + amountNum;
        }
        pagesVisited += 1;

        if (samples.length > 0) {
          log('[VC][UI] примеры строк страницы:', samples);
        }
      };

      // Собираем первую страницу
      await collectCurrentPage();

      // Листаем по стрелке "вперёд"
      const nextArrow = this.paginationNextArrow;
      for (let p = 2; p <= maxPages; p++) {
        if (!(await nextArrow.count()) || !(await nextArrow.isVisible())) {
          break;
        }
        await nextArrow.click({ timeout: TIMEOUTS.LONG });
        await this.page.waitForLoadState('networkidle', { timeout: TIMEOUTS.LONG });
        await table.locator('tbody tr').first().waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
        await collectCurrentPage();
      }

      log('[VC][UI] страниц обработано:', pagesVisited);
      log('[VC] В истории получателей (UI):', Object.keys(balances).length);

      return balances;
    });
  }

  /**
   * Локатор пагинации (используется на странице истории операций).
   * Использует частичное совпадение класса для устойчивости к изменениям CSS Modules.
   */
  get paginationLocator() {
    return this.page.locator('[class*="Pagination_pagination"]');
  }

  /**
   * Локатор стрелки "вперёд" в пагинации.
   * Стрелка — это последняя ссылка с SVG-иконкой (после номеров страниц).
   */
  get paginationNextArrow() {
    return this.paginationLocator.locator('a:has(svg)').last();
  }

  /**
   * Локатор стрелки "назад" в пагинации.
   * Стрелка — это первая ссылка с SVG-иконкой (перед номерами страниц).
   * На первой странице не видна.
   */
  get paginationPrevArrow() {
    return this.paginationLocator.locator('a:has(svg)').first();
  }

  /** Страница настроек виртуальной валюты открыта */
  async assertOpened() {
    await this._step('Открыта страница "Настройка виртуальной валюты"', async () => {
      await this.page.waitForLoadState('networkidle', {
        timeout: TIMEOUTS.EXTRA_LONG,
      });

      await this.heading.waitFor({
        state: 'visible',
        timeout: TIMEOUTS.EXTRA_LONG,
      });

      const hasDisable = await this.disableButton.isVisible().catch(() => false);
      const hasEnable = await this.enableButton.isVisible().catch(() => false);

      if (!hasDisable && !hasEnable) {
        throw new Error(
          "Не найдены кнопки включения/выключения виртуальной валюты",
        );
      }
    });
  }

  /**
   * Текущее состояние модуля:
   *  - 'enabled'  — видна кнопка "Выключить виртуальную валюту"
   *  - 'disabled' — видна кнопка "Включить виртуальную валюту"
   */
  async getCurrencyState() {
    return this._step(
      "Определить состояние модуля виртуальной валюты",
      async () => {
        if (await this.disableButton.isVisible().catch(() => false))
          return "enabled";
        if (await this.enableButton.isVisible().catch(() => false))
          return "disabled";
        throw new Error("Не удалось определить состояние виртуальной валюты");
      },
    );
  }

  /** Выключить виртуальную валюту (с подтверждением) */
  async clickDisable() {
    await this._step("Выключить виртуальную валюту", async () => {
      const state = await this.getCurrencyState();
      if (state === "disabled") return;

      await this._moveCursorAwayFromSideMenu();

      await this.disableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.disableButton.click();

      await this.confirmDisableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.confirmDisableButton.click();
    });
  }

  /** Включить виртуальную валюту (с подтверждением) */
  async clickEnable() {
    await this._step("Включить виртуальную валюту", async () => {
      const state = await this.getCurrencyState();
      if (state === "enabled") return;

      await this._moveCursorAwayFromSideMenu();

      // Проверяем, не disabled ли кнопка (нужен получатель уведомлений)
      const isDisabled = await this.enableButton
        .isDisabled()
        .catch(() => false);
      if (isDisabled) {
        console.log(
          'Кнопка "Включить виртуальную валюту" заблокирована, добавляем получателя уведомлений',
        );
        await this.addNotificationRecipient();
      }

      await this.enableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.enableButton.click();

      await this.confirmEnableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.confirmEnableButton.click();
    });
  }

  /** Добавить получателя уведомлений о заказах в магазине подарков */
  async addNotificationRecipient() {
    await this._step("Добавить получателя уведомлений", async () => {
      // Нажимаем кнопку "Добавить" в секции уведомлений
      await this.addNotificationRecipientButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.addNotificationRecipientButton.click();

      // Ждём открытия модалки с заголовком "Получатели уведомления о заказах"
      const modalTitle = this.page.locator(
        "text=Получатели уведомления о заказах",
      );
      await modalTitle.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // В модалке кастомные чекбоксы (UserOption компонент)
      // Клик должен быть на всю строку пользователя (div с классом UserOption_row__)
      // Пробуем несколько вариантов:

      // 1) div с классом, содержащим UserOption_row
      const userRow = this.page.locator('div[class*="UserOption_row"]').first();

      // 2) fallback: строка с именем пользователя
      const userByName = this.page.getByText("Elena Shapoval").first();

      // 3) ещё один fallback: div с cursor:pointer внутри списка
      const userByCursor = this.page
        .locator('div[class*="UserQuerySelect"]')
        .locator('div[style*="cursor"], div[class*="row"]')
        .filter({ hasText: /[А-Яа-яA-Za-z]/ })
        .first();

      // Ждём появления хотя бы одного варианта
      await Promise.race([
        userRow
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {}),
        userByName
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {}),
        userByCursor
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {}),
      ]);

      // Кликаем на первый видимый вариант
      if (await userRow.isVisible().catch(() => false)) {
        await userRow.click({ timeout: TIMEOUTS.MEDIUM });
      } else if (await userByName.isVisible().catch(() => false)) {
        await userByName.click({ timeout: TIMEOUTS.MEDIUM });
      } else if (await userByCursor.isVisible().catch(() => false)) {
        await userByCursor.click({ timeout: TIMEOUTS.MEDIUM });
      } else {
        throw new Error(
          "Не найден ни один пользователь в модалке выбора получателя уведомлений",
        );
      }

      // Ждём обновления списка выбранных пользователей
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Нажимаем кнопку "Применить"
      const applyButton = this.page.getByRole("button", { name: "Применить" });
      await applyButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await applyButton.click({ timeout: TIMEOUTS.MEDIUM });

      // Ждём закрытия модалки
      await modalTitle
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /** Дождаться состояния "включено" */
  async waitForEnabled() {
    await this._step("Дождаться включённой виртуальной валюты", async () => {
      await this.disableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /** Дождаться состояния "выключено" */
  async waitForDisabled() {
    await this._step("Дождаться выключенной виртуальной валюты", async () => {
      await this.enableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /** Кнопка "Перейти в магазин" отображается при включённой валюте */
  async assertGoToGiftShopButtonVisible() {
    await this._step(
      'Кнопка "Перейти в магазин" отображается в настройках магазина подарков',
      async () => {
        const button = this.goToGiftShopButton.first();

        await button.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const href = await button.getAttribute("href");
        if (!href || !href.startsWith("/ru/gift-shop")) {
          throw new Error(
            `Ожидали ссылку "Перейти в магазин" на /ru/gift-shop, получили "${href}"`,
          );
        }
      },
    );
  }

  /** Кнопка "Перейти в магазин" не отображается при выключенной валюте */
  async assertGoToGiftShopButtonNotVisible() {
    await this._step(
      'Кнопка "Перейти в магазин" скрыта в настройках магазина подарков',
      async () => {
        const count = await this.goToGiftShopButton.count();

        if (count === 0) return;

        const isVisible = await this.goToGiftShopButton
          .first()
          .isVisible()
          .catch(() => false);

        if (isVisible) {
          throw new Error(
            'Кнопка "Перейти в магазин" не должна отображаться при выключенной виртуальной валюте',
          );
        }
      },
    );
  }

  // -------------------- helpers --------------------

  async _openHeaderUserPopup() {
    // попап открывается по клику на аватар (img внутри Avatar_avatar)
    await this._headerAvatarImg.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });

    if (await this._headerPopup.isVisible().catch(() => false)) return;

    await this._headerAvatarImg.click({ timeout: TIMEOUTS.MEDIUM });
    await this._headerPopup.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });
  }

  async _closeHeaderUserPopup() {
    // закрывается повторным кликом по аватару (как ты и просил)
    if (!(await this._headerPopup.isVisible().catch(() => false))) return;

    await this._headerAvatarImg
      .click({ timeout: TIMEOUTS.MEDIUM })
      .catch((e) => {
        console.warn(
          "Failed to click header avatar to close popup:",
          e.message,
        );
      });
    await this._headerPopup
      .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
      .catch((e) => {
        console.warn("Header popup did not hide:", e.message);
      });
  }

  async _readHeaderBalanceByIndex(index) {
    const labels = this._headerBalanceLabels;
    const count = await labels.count();

    // берём только те, что выглядят как число
    const numbers = [];
    for (let i = 0; i < count; i += 1) {
      const t = await labels
        .nth(i)
        .innerText()
        .then((x) => x.trim())
        .catch(() => "");
      if (/^\d+$/.test(t)) numbers.push(Number(t));
    }

    if (numbers.length === 0)
      throw new Error("Не нашли числовые лейблы в header");
    if (index < 0 || index >= numbers.length)
      throw new Error("Нет нужного индекса баланса");

    return numbers[index];
  }

  async _readHeaderBalanceLast() {
    // последнее число в header (обычно 💎)
    const labels = this._headerBalanceLabels;
    const count = await labels.count();

    const numbers = [];
    for (let i = 0; i < count; i += 1) {
      const t = await labels
        .nth(i)
        .innerText()
        .then((x) => x.trim())
        .catch(() => "");
      if (/^\d+$/.test(t)) numbers.push(Number(t));
    }

    if (numbers.length === 0)
      throw new Error("Не нашли числовые лейблы в header");
    return numbers[numbers.length - 1];
  }

  async _readHeaderBalanceByIcon(iconRe) {
    // ищем кнопку/ссылку в header с нужной иконкой и берём число из её label
    const iconUse = this._header.locator("use[href], use[xlink\\:href]");

    // кнопка/ссылка, внутри которой есть use с нужным href
    const target = this._header
      .locator("button, a")
      .filter({
        has: iconUse.filter({
          hasText: iconRe, // иногда href попадает как текст в снапшотах не всегда; оставляем как доп. фильтр
        }),
      })
      .first();

    // если выше не сработало (часто), делаем более прямой поиск по атрибутам
    const byAttr = this._header
      .locator("button, a")
      .filter({
        has: this._header.locator(
          [
            `use[href*="diamond" i]`,
            `use[xlink\\:href*="diamond" i]`,
            `use[href*="gem" i]`,
            `use[xlink\\:href*="gem" i]`,
          ].join(", "),
        ),
      })
      .first();

    const candidate =
      (await byAttr.count().catch(() => 0)) > 0 ? byAttr : target;

    const t = await candidate
      .locator('span[class*="HeaderButton_label"]')
      .filter({ hasText: /^\d+$/ })
      .first()
      .innerText()
      .then((x) => x.trim())
      .catch(() => "");

    if (!/^\d+$/.test(t))
      throw new Error("Не удалось прочитать баланс по иконке");
    return Number(t);
  }

  async _readAnyHeaderNumber() {
    const anyNumber = await this._header
      .locator("span")
      .filter({ hasText: /^\d+$/ })
      .first()
      .innerText()
      .then((x) => x.trim())
      .catch(() => "");

    if (/^\d+$/.test(anyNumber)) return Number(anyNumber);

    throw new Error(
      "Не удалось найти баланс в шапке (не нашли видимый span с числом)",
    );
  }

  /** Увести курсор в область контента, чтобы любая шторка меню свернулась */
  async _moveCursorAwayFromSideMenu() {
    if (await this.heading.isVisible().catch(() => false)) {
      await this.heading.hover();
    } else {
      await this.page.mouse.move(600, 100);
    }
    // Ждём анимации сворачивания меню
    await this.page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
      .catch(() => {});
  }
}
