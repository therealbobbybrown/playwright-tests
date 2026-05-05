// pages/StructureDepartmentsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class StructureDepartmentsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.topMenu = this.page.locator(SELECTORS.ORG_STRUCTURE_TOP_MENU).first();
    this.leftColumn = this.page
      .locator('div[class*="Departments_leftside"]')
      .first();
    this.companyTitle = this.leftColumn
      .locator('div[class*="Departments_company-title"] a')
      .first();
    this.outsideUsersLink = this.leftColumn
      .locator('a[href*="/structure/departments/outside"]')
      .first();
    this.treeMenu = this.leftColumn.locator(SELECTORS.TREE_MENU).first();
    this.addDepartmentButton = this.leftColumn
      .getByRole("button", { name: /Добавить отдел/i })
      .first();

    this.mainArea = this.page.locator("#structure-departments-main").first();
    this.backButton = this.mainArea
      .locator('button:has(svg use[href*="arrowBack"])')
      .first();
    this.rootTitle = this.mainArea
      .locator('div[class*="DetailsTitle_title"]')
      .first();
    this.headsSection = this.mainArea
      .locator('div[class*="HeadsUsers_users"]')
      .first();
    this.employeesSection = this.mainArea
      .locator('section:has(h3:has-text("Сотрудники"))')
      .first();
    this.departmentsSection = this.mainArea
      .locator('section:has(h3:has-text("Отделы"))')
      .first();
    this.createDepartmentButton = this.departmentsSection
      .getByRole("button", { name: /Создать новый отдел/i })
      .first();

    // Детали конкретного отдела
    this.departmentDetailsTitle = this.mainArea
      .locator(
        'div[class*="DepartmentDetails_title"], div[class*="RootDetails_title"]',
      )
      .first();
    this.departmentTitleText = this.departmentDetailsTitle
      .locator(
        'h1, h2, div[class*="NoWrap_text"], span[class*="NoWrap_text"], [class*="DetailsTitle_title"]',
      )
      .first();
    this.departmentTitleEditButton = this.departmentDetailsTitle
      .locator('span[class*="NoWrap_icon__"]')
      .first();
    this.departmentTitleInput = this.departmentDetailsTitle
      .locator('input, textarea, [contenteditable="true"]')
      .first();
    this.departmentEmployeesSection = this.mainArea
      .locator('section:has(h3:has-text("Сотрудники"))')
      .first();
    this.departmentAddEmployeeButton = this.departmentEmployeesSection
      .getByRole("button", { name: /Добавить сотрудников/i })
      .first();
    this.departmentEmployeeCards = this.departmentEmployeesSection.locator(
      'div[class*="SectionUsers_item"]',
    );
    this.departmentSubDepartmentsSection = this.mainArea
      .locator('section:has(h3:has-text("Отделы"))')
      .first();
    this.departmentCreateSubButton = this.departmentSubDepartmentsSection
      .getByRole("button", { name: /Создать новый отдел/i })
      .first();

    this.departmentMenuOpener = this.mainArea
      .locator('div[class*="DepartmentDetails_menu-opener"]')
      .first();

    this.departmentOptionsButton = this.departmentMenuOpener
      .locator(
        [
          'button[class*="MenuPopupToggle_button__"]',
          'button:has(svg use[href*="optionsVert"])',
          'button:has(svg use[xlink\\:href*="optionsVert"])',
        ].join(", "),
      )
      .first();
    this.departmentDeleteMenuItem = this.page
      .locator(SELECTORS.MENU_POPUP_ITEM)
      .filter({
        hasText: /Удалить/i,
        has: this.page.locator(
          'svg use[href*="trash"], svg use[xlink\\:href*="trash"]',
        ),
      })
      .first()
      .or(this.page.getByRole("button", { name: /Удалить/i }).first());
    this.confirmDeleteButton = this.page
      .getByRole("button", { name: /Да, удалить/i })
      .first();

    // Модалка выбора сотрудников
    this.addUserSheet = this.page
      .locator(SELECTORS.SHEET_MODAL_CONTENT)
      .first();
    this.addUserModal = this.page
      .locator(SELECTORS.SHEET_MODAL_CONTAINER)
      .first();
    this.addUserOptions = this.addUserSheet
      .locator('[class*="Option_option-item__"] button.Option_option__K_CL1')
      .filter({ has: this.page.locator('[class*="Option_name__"]') });
    this.addUserConfirmButton = this.page
      .getByRole("button", { name: /^Подтвердить$/i })
      .first();
  }

  /** Получить список email сотрудников в текущем открытом отделе */
  async getDepartmentEmployeeEmails() {
    const texts = await this.departmentEmployeeCards
      .allTextContents()
      .catch(() => []);
    const emails = [];
    for (const text of texts) {
      const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match?.[0]) {
        const email = match[0].trim();
        if (!emails.includes(email)) {
          emails.push(email);
        }
      }
    }
    return emails;
  }

  async openFromSideMenu() {
    await this._step(
      'Открыть "Настройка отделов" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureDepartments();
        await this.assertOpened();
      },
    );
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Настройка отделов"',
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);

        await this.topMenu.waitFor({
          state: "visible",
          timeout: TIMEOUTS.EXTRA_LONG,
        });
        await this.leftColumn.waitFor({
          state: "visible",
          timeout: TIMEOUTS.EXTRA_LONG,
        });
        await this.mainArea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.EXTRA_LONG,
        });

        await expect(this.companyTitle).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.treeMenu).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.addDepartmentButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(this.rootTitle).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await this.headsSection
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => null);
        await expect(this.employeesSection).toBeVisible({
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await expect(this.departmentsSection).toBeVisible({
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_DEPARTMENTS, {
            timeout: TIMEOUTS.SHORT,
          })
          .catch(() => null);
      },
    );
  }

  async assertMainElementsVisible() {
    await this._step(
      'Проверить основные элементы "Настройка отделов"',
      async () => {
        await this.topMenu
          .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(() => null);
        await this.leftColumn.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.companyTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.treeMenu.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.addDepartmentButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.addDepartmentButton).toContainText(/добавить отдел/i);

        await this.mainArea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.rootTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.headsSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.employeesSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentsSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.createDepartmentButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.createDepartmentButton).toContainText(
          /создать новый отдел/i,
        );
      },
    );
  }

  async createDepartmentAndOpen() {
    return this._step(
      "Создать новый отдел и открыть его карточку",
      async () => {
        await this.addDepartmentButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Запоминаем текущее количество элементов в дереве, чтобы найти появившийся отдел
        const treeItems = this.treeMenu.locator(
          'div[class*="TreeItem_item"], a[href*="/departments/department/"]',
        );
        const beforeCount = await treeItems.count().catch(() => 0);

        await this.addDepartmentButton.click();

        // Ждём появления нового элемента в дереве (не завязываемся на текст, так как он может быть локализован)
        await expect
          .poll(async () => treeItems.count(), {
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
          })
          .toBeGreaterThan(beforeCount);

        const newTreeItem = treeItems.nth((await treeItems.count()) - 1);
        await newTreeItem.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const overlayLink = newTreeItem
          .locator(
            'a[class*="TreeItem_overlay-link__"], a[href*="/departments/department/"]',
          )
          .first();
        await overlayLink
          .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(async () => {
            // запасной вариант: кликнуть по самому элементу, если ссылка не появилась
            await newTreeItem.click({ force: true });
          });

        const prevTitle = await this.departmentTitleText
          .textContent()
          .then((t) => t?.trim() ?? "")
          .catch(() => "");

        await Promise.all([
          this.page
            .waitForURL(URL_PATTERNS.STRUCTURE_DEPARTMENT_CARD, {
              timeout: 25_000,
            })
            .catch(() => null),
          (async () => {
            const visible = await overlayLink.isVisible().catch(() => false);
            if (visible) {
              await overlayLink
                .click({ timeout: TIMEOUTS.MEDIUM })
                .catch(async () => {
                  await overlayLink
                    .click({ force: true, timeout: TIMEOUTS.SHORT })
                    .catch(() => null);
                });
            } else {
              await newTreeItem.click({ force: true }).catch(() => null);
            }
          })(),
        ]);

        await this.departmentDetailsTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.departmentTitleText
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => null);

        await expect
          .poll(
            async () => {
              const rawTitle = await this.departmentTitleText
                .textContent()
                .then((t) => t?.trim() ?? "")
                .catch(() => "");
              const normalized = rawTitle.replace(/\s+/g, " ").trim();
              // возвращаем пустую строку, пока заголовок не изменился и не стал непустым
              if (!normalized || normalized === prevTitle) return "";
              return normalized;
            },
            {
              timeout: TIMEOUTS.MEDIUM,
              message: "Ожидали заголовок нового отдела",
            },
          )
          .not.toBe("");
      },
    );
  }

  async renameOpenedDepartment(newName) {
    await this._step(`Переименовать отдел в "${newName}"`, async () => {
      await this.departmentTitleEditButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.departmentTitleEditButton.click();

      const input = this.departmentTitleInput.first();
      await input.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      await input.fill(newName);
      await input.press("Enter").catch(() => null);

      await expect(this.departmentTitleText).toHaveText(newName, {
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async assertDepartmentDetailsElements() {
    await this._step(
      "Проверить ключевые элементы карточки отдела",
      async () => {
        await this.departmentDetailsTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentTitleText.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.departmentEmployeesSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentAddEmployeeButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.departmentSubDepartmentsSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentCreateSubButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  async addFirstEmployeeToDepartment() {
    await this._step(
      "Добавить первого доступного сотрудника в отдел",
      async () => {
        await this.departmentAddEmployeeButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentAddEmployeeButton.click();

        await this.addUserSheet.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.addUserOptions
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const firstOption = this.addUserOptions.first();
        await firstOption.click();

        await this.addUserConfirmButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await Promise.all([
          this.addUserSheet
            .waitFor({ state: "hidden", timeout: TIMEOUTS.ELEMENT_VISIBLE })
            .catch(() => null),
          this.addUserConfirmButton.click(),
        ]);

        const firstCard = this.departmentEmployeeCards.first();
        await firstCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        // Проверяем, что карточка содержит текст (имя сотрудника), а не пустая
        const cardText = await firstCard
          .textContent()
          .then((t) => t?.trim() ?? "")
          .catch(() => "");
        if (!cardText) {
          throw new Error(
            "Карточка добавленного сотрудника не содержит текст (имя/email)",
          );
        }
      },
    );
  }

  /** Открыть отдел по названию */
  async openDepartmentByName(departmentName) {
    await this._step(`Открыть отдел "${departmentName}"`, async () => {
      await this.assertOpened();

      // Ищем отдел в дереве отделов - кликаем по ссылке, а не по тексту
      // Ссылка имеет класс TreeItem_overlay-link__7tvGe и находится рядом с текстом
      const departmentText = this.treeMenu
        .getByText(departmentName, { exact: false })
        .first();

      await departmentText.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Находим ссылку рядом с текстом (она перехватывает клики)
      const departmentLink = departmentText
        .locator('xpath=ancestor::*[contains(@class, "TreeItem")][1]')
        .locator(
          'a[class*="TreeItem_overlay-link"], a[href*="/departments/department/"]',
        )
        .first();

      await departmentLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Запоминаем текущий URL (до клика) — чтобы определить, произошла ли навигация
      const urlBefore = this.page.url();

      await departmentLink.click();

      // Ждём изменения URL относительно предыдущего (обрабатывает случай,
      // когда мы уже на /departments/department/ другого отдела)
      await this.page
        .waitForFunction((prev) => window.location.href !== prev, urlBefore, {
          timeout: TIMEOUTS.MEDIUM,
        })
        .catch(() => {});

      // Убеждаемся, что URL содержит /departments/department/
      await this.page
        .waitForURL(/\/departments\/department\//, {
          timeout: TIMEOUTS.MEDIUM,
        })
        .catch(() => {});

      const currentUrl = this.page.url();
      if (!currentUrl.includes("/departments/department/")) {
        throw new Error(
          `Не удалось открыть отдел "${departmentName}". URL: ${currentUrl}`,
        );
      }

      // Ждём загрузки основного контента нового отдела
      await Promise.race([
        this.departmentEmployeesSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        }),
        this.departmentSubDepartmentsSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        }),
      ]).catch(() => {});
    });
  }

  /** Добавить пользователей в отдел по email */
  async addUsersToDepartmentByEmails(emails) {
    await this._step(
      `Добавить пользователей в отдел по email: ${emails.join(", ")}`,
      async () => {
        const existingEmails = (await this.getDepartmentEmployeeEmails()).map(
          (e) => e.toLowerCase(),
        );

        const toAdd = emails.filter(
          (email) => !existingEmails.includes(email.toLowerCase()),
        );
        if (toAdd.length === 0) {
          console.log(
            "Все указанные пользователи уже в отделе, добавлять никого не нужно",
          );
          return;
        }

        const closeAddUserModal = async () => {
          const isOpen = await this.addUserModal.isVisible().catch(() => false);
          if (isOpen) {
            // Escape не закрывает react-modal-sheet — кликаем кнопку ×
            const closeButton = this.addUserModal
              .locator('button[class*="SheetModal_close"]')
              .first();
            await closeButton.click().catch(() => {});
          }
          // Безусловно ждём полного исчезновения модала (мгновенно если уже закрыт)
          await this.addUserModal
            .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        };

        // Добавляем пользователей по одному, открывая модальное окно для каждого
        for (const email of toAdd) {
          // Убеждаемся, что предыдущий модал полностью закрыт (waitFor hidden мгновенен если уже закрыт)
          await closeAddUserModal();
          // Ждём кнопки "Добавить сотрудников"
          await this.departmentAddEmployeeButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await this.departmentAddEmployeeButton.click();

          // Ждём появления модального окна
          await this.addUserModal.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await this.addUserSheet.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Находим поле поиска в модальном окне по id или name
          const searchInput = this.page
            .locator(
              'input#AddUserToDepartmentDialog__userId__seach-input, input[name="q"]',
            )
            .first();
          await searchInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Очищаем поле поиска и вводим email
          await searchInput.click(); // Фокусируемся на поле
          await searchInput.fill(""); // Очищаем

          // Вводим email посимвольно для более надёжного поиска
          await searchInput.type(email, { delay: 100 }); // Вводим с задержкой между символами

          // Ждём появления результатов поиска
          await this.page
            .locator(".Options_options__cFO9S .Option_option-item__pLwvi")
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .catch(() => {});

          // Ждём результатов поиска (поиск автоматический при вводе)
          // После ввода email должен остаться только один пользователь
          let userOption = null;

          // Ждём появления опций в списке
          try {
            await this.page
              .locator(".Options_options__cFO9S .Option_option-item__pLwvi")
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE });

            userOption = this.page
              .locator(".Options_options__cFO9S button.Option_option__K_CL1")
              .first();

            await userOption.waitFor({
              state: "visible",
              timeout: TIMEOUTS.SHORT,
            });
            console.log(`[DEBUG] Результаты поиска появились для ${email}`);
          } catch (e) {
            console.log(
              `[DEBUG] Не удалось найти результаты поиска для ${email}, пробуем подождать ещё`,
            );

            // Пробуем найти кнопку пользователя напрямую
            userOption = this.page
              .locator("button.Option_option__K_CL1")
              .first();

            const isVisible = await userOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            if (!isVisible) {
              // Последняя попытка - проверяем, может быть список пустой или другой формат
              const optionsCount = await this.page
                .locator(".Options_options__cFO9S .Option_option-item__pLwvi")
                .count();
              console.log(`[DEBUG] Количество опций в списке: ${optionsCount}`);
              console.warn(
                `[DEBUG] Пропускаем email ${email} - опций не найдено`,
              );
              await closeAddUserModal();
              continue;
            }
            console.log(
              `[DEBUG] Кнопка пользователя найдена для ${email} после дополнительного ожидания`,
            );
          }

          // Проверяем, не выбран ли уже пользователь
          const isSelected = await userOption
            .locator(
              'svg use[href*="icon-ok"], svg use[xlink\\:href*="icon-ok"]',
            )
            .isVisible()
            .catch(() => false);

          if (!isSelected) {
            await userOption.click();
            // Ждём обновления состояния после клика (появления галочки)
            await userOption
              .locator(
                'svg use[href*="icon-ok"], svg use[xlink\\:href*="icon-ok"]',
              )
              .waitFor({ state: "visible", timeout: TIMEOUTS.ANIMATION })
              .catch(() => {});
          } else {
            console.log(`Пользователь ${email} уже выбран`);
          }
          // Подтверждаем выбор для этого пользователя
          await this.addUserConfirmButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await Promise.all([
            this.addUserModal
              .waitFor({ state: "hidden", timeout: TIMEOUTS.ELEMENT_VISIBLE })
              .catch(() => null),
            this.addUserConfirmButton.click(),
          ]);

          // Ждём обновления списка сотрудников после добавления
          await this.departmentEmployeeCards
            .filter({ hasText: email })
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MODAL_CLOSE })
            .catch(() => {});
        }
      },
    );
  }

  /**
   * Открыть меню отдела и нажать «Удалить» — без подтверждения.
   * Используется для тестов, которые должны проверить диалог подтверждения.
   * После вызова метода диалог с кнопкой «Да, удалить» будет открыт и виден.
   */
  async openDeleteDialog() {
    await this._step(
      "Открыть меню отдела и нажать кнопку «Удалить»",
      async () => {
        const menuOpener = this.departmentMenuOpener;
        const overlayButton = menuOpener
          .locator('button[class*="MenuPopupToggle_overlay-button__"]')
          .first();
        const optionsButton = this.departmentOptionsButton;

        await menuOpener.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // если кнопка опций не видна, пробуем кликнуть оверлей
        try {
          await optionsButton.waitFor({ state: "visible", timeout: 4_000 });
        } catch {
          await overlayButton.click({ timeout: TIMEOUTS.SHORT });
          await optionsButton.waitFor({ state: "visible", timeout: 6_000 });
        }

        await optionsButton.scrollIntoViewIfNeeded();
        await optionsButton.click();

        await this.departmentDeleteMenuItem.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentDeleteMenuItem.click();

        await this.confirmDeleteButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  async deleteOpenedDepartment() {
    await this._step("Удалить открытый отдел", async () => {
      const menuOpener = this.departmentMenuOpener;
      const overlayButton = menuOpener
        .locator('button[class*="MenuPopupToggle_overlay-button__"]')
        .first();
      const optionsButton = this.departmentOptionsButton;

      await menuOpener.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // если кнопка опций не видна, пробуем кликнуть оверлей
      try {
        await optionsButton.waitFor({ state: "visible", timeout: 4_000 });
      } catch {
        await overlayButton
          .click({ timeout: TIMEOUTS.SHORT })
          .catch(() => null);
        await optionsButton.waitFor({ state: "visible", timeout: 6_000 });
      }

      await optionsButton.scrollIntoViewIfNeeded().catch(() => null);
      await optionsButton.click();

      await this.departmentDeleteMenuItem.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.departmentDeleteMenuItem.click();

      await this.confirmDeleteButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await Promise.all([
        this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null),
        this.confirmDeleteButton.click(),
      ]);
    });
  }
}
