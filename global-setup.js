// global-setup.js
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium, request } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage.js";
import { TokenManager } from "./tests/utils/auth/TokenManager.js";
import {
  SurveySeedHelper,
  PerformanceReviewSeedHelper,
  FeedbackSeedHelper,
  DashboardStatusSeed,
  AssessmentSeedHelper,
} from "./tests/utils/seed/index.js";

const ALLURE_RESULTS_DIR = "allure-results";
const ALLURE_HISTORY_DIR = "allure-history";
const MAX_RUNS_TO_KEEP = 10; // Сколько последних прогонов хранить

const storageStates = [
  {
    role: "admin",
    login: process.env.ADMIN_LOGIN,
    password: process.env.ADMIN_PASSWORD,
    path: "test-results/.auth/admin.json",
  },
  // Второй админ для параллельного воркера (опционально)
  ...(process.env.ADMIN2_LOGIN
    ? [
        {
          role: "admin2",
          login: process.env.ADMIN2_LOGIN,
          password: process.env.ADMIN2_PASSWORD,
          path: "test-results/.auth/admin2.json",
        },
      ]
    : []),
  {
    role: "user",
    login: process.env.USER_LOGIN,
    password: process.env.USER_PASSWORD,
    path: "test-results/.auth/user.json",
  },
  {
    role: "manager",
    login: process.env.MANAGER_LOGIN,
    password: process.env.MANAGER_PASSWORD,
    path: "test-results/.auth/manager.json",
  },
  // Второй админ для параллельного воркера (опционально)
  ...(process.env.ADMIN2_LOGIN
    ? [
        {
          role: "admin2",
          login: process.env.ADMIN2_LOGIN,
          password: process.env.ADMIN2_PASSWORD,
          path: "test-results/.auth/admin2.json",
        },
      ]
    : []),
];

/** API fast path: signIn → cookie injection → storageState (~0.3s vs 6-8s UI) */
async function loginAndSaveViaApi(
  browser,
  requestContext,
  { role, login, password, path: filePath },
) {
  if (!login || !password) {
    throw new Error(`Missing credentials for ${role} in .env`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tokenData = await TokenManager.getToken(
    requestContext,
    login,
    password,
  );
  const context = await browser.newContext();
  await TokenManager.injectAuth(context, tokenData);
  await context.storageState({ path: filePath });
  await context.close();
  console.log(`[global-setup] ${role}: API login OK`);
}

/** UI fallback: полный браузерный логин (6-8s), с retry */
async function loginAndSaveViaUI(
  browser,
  { role, login, password, path: filePath },
) {
  if (!login || !password) {
    throw new Error(`Missing credentials for ${role} in .env`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const loginPage = new LoginPage(page, {
        step: async (_title, fn) => fn(),
      });
      await loginPage.goto();
      await loginPage.login(login, password);
      await loginPage.assertLoggedIn();

      await context.storageState({ path: filePath });
      console.log(`[global-setup] ${role}: UI login OK`);
      return;
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      console.warn(
        `[global-setup] ${role}: UI attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e.message}, retrying…`,
      );
    } finally {
      await context.close();
    }
  }
}

function isApiAuthEnabled() {
  const flag = process.env.AUTH_FAST_LOGIN;
  return flag !== "0" && flag !== "false" && !!process.env.API_BASE_URL;
}

/**
 * Создание тестовых данных через API
 */
async function seedTestData() {
  const baseURL = process.env.API_BASE_URL || process.env.BASE_URL;
  if (!baseURL) {
    console.log("[global-setup] API_BASE_URL не задан, пропускаем seed");
    return;
  }

  const requestContext = await request.newContext({ baseURL });

  try {
    // Survey seed
    const surveySeed = new SurveySeedHelper(requestContext);
    await surveySeed.init("admin");
    const { hasData: hasSurveyData } = await surveySeed.checkExistingData();

    if (!hasSurveyData) {
      console.log("[global-setup] Создание тестовых данных для Survey...");
      await surveySeed.seedAll();
      console.log("[global-setup] Survey данные созданы");
    } else {
      console.log("[global-setup] Survey данные уже существуют");
    }

    // Assessment seed (стандартная анкета для PR тестов)
    try {
      const assessmentSeed = new AssessmentSeedHelper(requestContext);
      await assessmentSeed.init();
      const { hasData: hasAssessment } = await assessmentSeed.checkExistingData();

      if (!hasAssessment) {
        console.log("[global-setup] Создание стандартной анкеты для PR...");
        await assessmentSeed.seedAssessment();
        console.log("[global-setup] Стандартная анкета создана");
      } else {
        console.log("[global-setup] Стандартная анкета уже существует");
        // Всё равно сохраняем имя в файл для воркеров
        await assessmentSeed._saveAssessmentName();
      }
    } catch (assessmentError) {
      console.warn(
        "[global-setup] Assessment seed пропущен:",
        assessmentError.message,
      );
    }

    // Performance Review seed
    const prSeed = new PerformanceReviewSeedHelper(requestContext);
    await prSeed.init("admin");
    const { hasData: hasPRData } = await prSeed.checkExistingData();

    if (!hasPRData) {
      console.log(
        "[global-setup] Создание тестовых данных для Performance Review...",
      );
      await prSeed.seedAll();
      console.log("[global-setup] Performance Review данные созданы");
    } else {
      console.log("[global-setup] Performance Review данные уже существуют");
    }

    // Feedback seed
    const feedbackSeed = new FeedbackSeedHelper(requestContext);
    await feedbackSeed.init("admin");
    const { hasData: hasFeedbackData } = await feedbackSeed.checkExistingData();

    if (!hasFeedbackData) {
      console.log("[global-setup] Создание тестовых данных для Feedback...");
      await feedbackSeed.seedAll();
      console.log("[global-setup] Feedback данные созданы");
    } else {
      console.log("[global-setup] Feedback данные уже существуют");
    }

    // Dashboard Status seed (для тестов статусов дашборда "Моя команда")
    // Опционально - не прерывает тесты если не удалось создать
    try {
      const dashboardSeed = new DashboardStatusSeed(requestContext);
      await dashboardSeed.init();
      const { hasData: hasDashboardData } =
        await dashboardSeed.checkExistingData();

      if (!hasDashboardData) {
        console.log(
          "[global-setup] Создание тестовых данных для Dashboard Status...",
        );
        await dashboardSeed.seedAllStatusScenarios();
        console.log("[global-setup] Dashboard Status данные созданы");
      } else {
        console.log("[global-setup] Dashboard Status данные уже существуют");
      }
    } catch (dashError) {
      console.warn(
        "[global-setup] Dashboard Status seed пропущен:",
        dashError.message,
      );
    }
  } catch (error) {
    console.warn(
      "[global-setup] Ошибка при создании seed данных:",
      error.message,
    );
    // Не прерываем тесты если seed не удался
  } finally {
    await requestContext.dispose();
  }
}

/**
 * Архивирует предыдущие результаты Allure перед новым прогоном
 * Сохраняет в allure-history/run_YYYY-MM-DD_HH-mm-ss/
 */
async function archiveAllureResults() {
  try {
    // Проверяем, есть ли что архивировать
    const resultsExist = await fs
      .access(ALLURE_RESULTS_DIR)
      .then(() => true)
      .catch(() => false);
    if (!resultsExist) {
      console.log(
        "[global-setup] Нет предыдущих результатов Allure для архивации",
      );
      return;
    }

    const files = await fs.readdir(ALLURE_RESULTS_DIR);
    if (files.length === 0) {
      console.log(
        "[global-setup] Папка allure-results пуста, пропускаем архивацию",
      );
      return;
    }

    // Создаём папку для истории
    await fs.mkdir(ALLURE_HISTORY_DIR, { recursive: true });

    // Генерируем имя папки с timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/T/, "_")
      .replace(/:/g, "-")
      .replace(/\..+/, "");
    const archiveDir = path.join(ALLURE_HISTORY_DIR, `run_${timestamp}`);

    // Перемещаем результаты в архив
    await fs.rename(ALLURE_RESULTS_DIR, archiveDir);
    console.log(
      `[global-setup] Предыдущие результаты сохранены в ${archiveDir}`,
    );

    // Удаляем старые прогоны, оставляем только MAX_RUNS_TO_KEEP
    await cleanupOldRuns();
  } catch (error) {
    console.warn(
      "[global-setup] Ошибка при архивации Allure результатов:",
      error.message,
    );
  }
}

/**
 * Удаляет старые прогоны, оставляя только последние MAX_RUNS_TO_KEEP
 */
async function cleanupOldRuns() {
  try {
    const entries = await fs.readdir(ALLURE_HISTORY_DIR, {
      withFileTypes: true,
    });
    const runDirs = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("run_"))
      .map((e) => e.name)
      .sort()
      .reverse(); // Новые первыми

    if (runDirs.length <= MAX_RUNS_TO_KEEP) {
      return;
    }

    const toDelete = runDirs.slice(MAX_RUNS_TO_KEEP);
    for (const dir of toDelete) {
      const dirPath = path.join(ALLURE_HISTORY_DIR, dir);
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`[global-setup] Удалён старый прогон: ${dir}`);
    }
  } catch (error) {
    console.warn(
      "[global-setup] Ошибка при очистке старых прогонов:",
      error.message,
    );
  }
}

/**
 * Проверяет актуальность кода перед запуском тестов.
 * - Логирует текущий git commit (всегда видно, с какой версией запустились)
 * - Предупреждает о незакоммиченных изменениях в pages/ и tests/
 * - GIT_CHECK_STRICT=1 — падает если есть незакоммиченные изменения в критичных файлах
 */
function verifyGitState() {
  const separator = "─".repeat(60);
  console.log(`\n${separator}`);
  console.log("[git-check] Проверка актуальности кода...");

  try {
    const commitHash = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
    const commitMsg = execSync("git log -1 --format=%s", {
      encoding: "utf8",
    }).trim();
    const commitDate = execSync("git log -1 --format=%ci", {
      encoding: "utf8",
    }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();

    console.log(`[git-check] Branch: ${branch}`);
    console.log(`[git-check] HEAD:   ${commitHash} — ${commitMsg}`);
    console.log(`[git-check] Date:   ${commitDate}`);

    // Проверяем незакоммиченные изменения в критичных директориях
    const status = execSync(
      "git status --porcelain -- pages/ tests/ global-setup.js",
      { encoding: "utf8" },
    ).trim();

    if (status) {
      const changedFiles = status
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      console.log(
        `[git-check] ⚠️  UNCOMMITTED CHANGES (${changedFiles.length} файлов):`,
      );
      changedFiles.forEach((f) => console.log(`  ${f}`));

      if (process.env.GIT_CHECK_STRICT === "1") {
        console.log(`${separator}\n`);
        throw new Error(
          `[git-check] STRICT MODE: Есть незакоммиченные изменения в pages/tests/. ` +
            `Закоммитьте изменения или отключите проверку (GIT_CHECK_STRICT=0).`,
        );
      }

      console.log("[git-check] Тесты запустятся с НЕЗАКОММИЧЕННЫМ кодом!");
    } else {
      console.log("[git-check] ✓ Рабочая директория чистая (pages/, tests/)");
    }
  } catch (err) {
    if (err.message.includes("STRICT MODE")) throw err;
    // git не доступен или не git-репо — не блокируем запуск
    console.warn(`[git-check] Не удалось проверить git: ${err.message}`);
  }

  console.log(`${separator}\n`);
}

export default async function globalSetup() {
  if (process.env.SKIP_GLOBAL_SETUP === "1") {
    console.log(
      "[global-setup] SKIP_GLOBAL_SETUP=1, пропускаем логин и создание данных",
    );
    return;
  }

  // Проверяем актуальность кода — логируем commit, предупреждаем о незакоммиченных изменениях
  verifyGitState();

  // Архивируем предыдущие результаты перед новым прогоном
  await archiveAllureResults();

  const browser = await chromium.launch();

  if (isApiAuthEnabled()) {
    // Быстрый путь: API login параллельно (~0.3s на все роли вместо ~28s)
    // Per-role fallback: если API не сработал для конкретной роли, только она идёт через UI
    const requestContext = await request.newContext({
      baseURL: process.env.API_BASE_URL,
    });
    try {
      const results = await Promise.allSettled(
        storageStates.map((state) =>
          loginAndSaveViaApi(browser, requestContext, state),
        ),
      );
      // Обработка отдельных провалов — fallback на UI только для упавших ролей
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          const state = storageStates[i];
          console.warn(
            `[global-setup] ${state.role}: API failed (${results[i].reason?.message}), fallback to UI`,
          );
          await loginAndSaveViaUI(browser, state);
        }
      }
    } finally {
      await requestContext.dispose();
    }
  } else {
    // UI fallback: последовательный браузерный логин
    for (const state of storageStates) {
      await loginAndSaveViaUI(browser, state);
    }
  }

  await browser.close();

  // Создаём тестовые данные после авторизации (если не отключено)
  if (process.env.SKIP_SEED === "1") {
    console.log(
      "[global-setup] SKIP_SEED=1, пропускаем создание тестовых данных",
    );
  } else {
    await seedTestData();
  }
}
