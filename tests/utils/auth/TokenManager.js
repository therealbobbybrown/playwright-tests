// tests/utils/auth/TokenManager.js
// API-based auth: signIn → cookie injection → single navigation
// Kill switch: AUTH_FAST_LOGIN=0 disables API path, falls back to UI

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Custom error for invalid password (non-retryable via UI fallback)
// ---------------------------------------------------------------------------

export class InvalidPasswordError extends Error {
  constructor(email) {
    super(
      `[TokenManager] Неверный пароль для ${email}. ` +
        `Проверьте TEST_USER_PASSWORD в .env или пароль аккаунта в БД.`,
    );
    this.name = "InvalidPasswordError";
    this.email = email;
  }
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** @type {Map<string, {accessToken: string, refreshToken: string, fingerPrint: string, expiresAt: number}>} */
const cache = new Map();

const SESSION_BUFFER = 2 * 60 * 1000; // 2 min before expiry → re-auth

// ---------------------------------------------------------------------------
// Auth config (computed once from ENV)
// ---------------------------------------------------------------------------

function buildAuthConfig() {
  const cookiePrefix = process.env.AUTH_COOKIE_PREFIX || "staging_auth";
  const baseUrl = process.env.BASE_URL;
  const parsed = new URL(baseUrl);
  const isSecure = parsed.protocol === "https:";
  const cookieUrl = process.env.AUTH_COOKIE_URL || parsed.origin;

  // Guard: cookie origin must match app origin
  if (new URL(cookieUrl).origin !== parsed.origin) {
    console.warn(
      `[TokenManager] AUTH_COOKIE_URL origin (${new URL(cookieUrl).origin}) ≠ BASE_URL origin (${parsed.origin})`,
    );
  }

  const cookieDomain = "." + new URL(cookieUrl).hostname;

  return {
    cookiePrefix,
    cookieUrl,
    cookieDomain,
    isSecure,
    sameSite: isSecure ? "None" : "Lax",
  };
}

const AUTH_CONFIG = buildAuthConfig();

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/** base64url-safe JWT exp decoding → ms timestamp or null */
function decodeJwtExp(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(Buffer.from(b64, "base64").toString());
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Kill switch: API_BASE_URL must exist + AUTH_FAST_LOGIN !== '0'/'false' */
function isEnabled() {
  const flag = process.env.AUTH_FAST_LOGIN;
  return flag !== "0" && flag !== "false" && !!process.env.API_BASE_URL;
}

function isValid(entry) {
  return entry && entry.expiresAt - Date.now() > SESSION_BUFFER;
}

// ---------------------------------------------------------------------------
// API calls (internal)
// ---------------------------------------------------------------------------

async function signIn(request, email, password) {
  const apiBaseUrl = process.env.API_BASE_URL;
  const fingerPrint = createHash("md5")
    .update(Date.now().toString())
    .digest("hex");

  const response = await request.post(`${apiBaseUrl}/auth/account/signin`, {
    data: { email, password, fingerPrint, permissions: [] },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });

  if (!response.ok()) {
    // Parse response body for specific error diagnosis
    let errorName = "";
    try {
      const errBody = await response.json();
      errorName = errBody?.name || errBody?.message || "";
    } catch {
      // ignore parse errors
    }
    if (
      errorName === "invalidPassword" ||
      (typeof errorName === "string" &&
        errorName.toLowerCase().includes("invalid password"))
    ) {
      throw new InvalidPasswordError(email);
    }
    throw new Error(`signIn failed: ${response.status()} ${errorName}`);
  }

  const data = await response.json();
  if (!data?.accessToken || !data?.refreshToken) {
    throw new Error("signIn: missing tokens in response");
  }

  const tokenData = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    fingerPrint,
    expiresAt: decodeJwtExp(data.accessToken) || Date.now() + 5 * 3600_000,
  };
  cache.set(email, tokenData);
  return tokenData;
}

async function refresh(request, email, cached) {
  const apiBaseUrl = process.env.API_BASE_URL;
  const response = await request.post(`${apiBaseUrl}/auth/account/refresh`, {
    data: {
      refreshToken: cached.refreshToken,
      accessToken: cached.accessToken,
    },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });

  if (!response.ok()) return null;

  const data = await response.json();
  if (!data?.accessToken) return null;

  const tokenData = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || cached.refreshToken,
    fingerPrint: cached.fingerPrint,
    expiresAt: decodeJwtExp(data.accessToken) || Date.now() + 5 * 3600_000,
  };
  cache.set(email, tokenData);
  return tokenData;
}

// ---------------------------------------------------------------------------
// Switch user profile (multi-company accounts)
// ---------------------------------------------------------------------------

/**
 * Switch to a different user profile within the same account.
 * Uses POST /auth/account/refresh/ with changeUserId parameter.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} email - account email (for cache key)
 * @param {{accessToken: string, refreshToken: string, fingerPrint: string}} tokenData
 * @param {number} targetUserId - userId to switch to
 * @returns {Promise<{accessToken: string, refreshToken: string, fingerPrint: string, expiresAt: number}|null>}
 */
async function changeUserProfile(request, email, tokenData, targetUserId) {
  const apiBaseUrl = process.env.API_BASE_URL;
  const response = await request.post(`${apiBaseUrl}/auth/account/refresh/`, {
    data: {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      changeUserId: targetUserId,
    },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });

  if (!response.ok()) {
    console.warn(
      `[TokenManager] changeUser(${targetUserId}) failed: ${response.status()}`,
    );
    return null;
  }

  const data = await response.json();
  if (!data?.accessToken) return null;

  const newTokenData = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || tokenData.refreshToken,
    fingerPrint: tokenData.fingerPrint,
    expiresAt: decodeJwtExp(data.accessToken) || Date.now() + 5 * 3600_000,
  };
  // Cache under composite key so we don't mix up default vs switched tokens
  const cacheKey = `${email}::uid=${targetUserId}`;
  cache.set(cacheKey, newTokenData);
  return newTokenData;
}

// ---------------------------------------------------------------------------
// getAppRoot (exported, cached)
// ---------------------------------------------------------------------------

let _appRoot;

export function getAppRoot() {
  if (_appRoot) return _appRoot;
  const parsed = new URL(process.env.BASE_URL);
  const match = parsed.pathname.match(/^\/([a-z]{2})\//);
  _appRoot = `${parsed.origin}/${match ? match[1] : "ru"}/`;
  return _appRoot;
}

// ---------------------------------------------------------------------------
// Auth failure detection
// ---------------------------------------------------------------------------

// Detect auth failure by checking if SPA redirected to /login after page load.
// Only pathname is checked (not full URL) to avoid false positives from query
// params like ?next=/ru/dashboard/ that contain logged-in page names.
const LOGIN_PATH_RE = /\/login(\/|$)/;

// ---------------------------------------------------------------------------
// TokenManager (exported object)
// ---------------------------------------------------------------------------

export const TokenManager = {
  /**
   * Get a valid token for email (from cache, refresh, or fresh signIn)
   * @param {import('@playwright/test').APIRequestContext} request
   * @param {string} email
   * @param {string} password
   */
  async getToken(request, email, password) {
    const cached = cache.get(email);
    if (isValid(cached)) return cached;

    // Try refresh if we have tokens
    if (cached?.refreshToken && cached?.accessToken) {
      try {
        const refreshed = await refresh(request, email, cached);
        if (refreshed) return refreshed;
      } catch {
        // fallthrough to signIn
      }
    }

    return signIn(request, email, password);
  },

  /**
   * Inject auth cookies into browser context
   * @param {import('@playwright/test').BrowserContext} context
   * @param {{accessToken: string, refreshToken: string}} tokenData
   */
  async injectAuth(context, tokenData) {
    const { cookiePrefix, cookieDomain, isSecure, sameSite } = AUTH_CONFIG;
    const cookieBase = {
      domain: cookieDomain,
      path: "/",
      secure: isSecure,
      sameSite,
    };
    await context.addCookies([
      {
        ...cookieBase,
        name: `${cookiePrefix}_access_token`,
        value: tokenData.accessToken,
      },
      {
        ...cookieBase,
        name: `${cookiePrefix}_refresh_token`,
        value: tokenData.refreshToken,
      },
      {
        ...cookieBase,
        name: `${cookiePrefix}_user_token`,
        value: String(Date.now()),
      },
    ]);
  },

  /**
   * Full API login: getToken → cookies → navigate → verify
   * Returns true on success, false if SPA redirected to /login (caller should use UI fallback)
   * @param {import('@playwright/test').Page} page
   * @param {string} email
   * @param {string} password
   * @param {object} [options]
   * @param {number} [options.targetUserId] - switch to specific user profile after signIn (multi-company accounts)
   * @returns {Promise<boolean>}
   */
  async loginViaApi(page, email, password, options = {}) {
    if (!isEnabled()) return false;

    const context = page.context();
    let tokenData = await this.getToken(context.request, email, password);

    // Switch to a specific user profile if needed (multi-company accounts)
    if (options.targetUserId) {
      const cacheKey = `${email}::uid=${options.targetUserId}`;
      const cachedSwitch = cache.get(cacheKey);
      if (isValid(cachedSwitch)) {
        tokenData = cachedSwitch;
      } else {
        const switched = await changeUserProfile(
          context.request,
          email,
          tokenData,
          options.targetUserId,
        );
        if (switched) {
          tokenData = switched;
        } else {
          console.warn(
            `[TokenManager] ${email}: changeUser(${options.targetUserId}) failed, using default profile`,
          );
        }
      }
    }

    // 1. Inject cookies
    await this.injectAuth(context, tokenData);

    // 2. Set fingerPrint BEFORE navigation via addInitScript so it's available
    //    when SPA boots and makes its first API calls
    await context.addInitScript((fp) => {
      try {
        localStorage.setItem("fingerPrint", fp);
      } catch {}
    }, tokenData.fingerPrint);

    // 3. Listen for 401 responses BEFORE navigation — catches server-side token
    //    rejection even if SPA delays the /login redirect
    let authRejected = false;
    const on401 = (resp) => {
      if (resp.status() === 401) authRejected = true;
    };
    page.on("response", on401);

    // 4. Navigate to app root (domcontentloaded is sufficient — networkidle below
    //    subsumes the remaining wait for JS init + SPA API calls)
    const appRoot = getAppRoot();
    await page.goto(appRoot, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // 5. Wait for SPA to complete initial auth check + API calls
    //    networkidle fires after 500ms of no network activity — by this point
    //    the SPA has loaded, checked cookies, made initial API calls, and routed.
    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      // networkidle may not fire (WebSocket, long-polling) — acceptable
    }

    page.off("response", on401);

    // 6. Auth failed if: server returned 401 OR SPA redirected to /login
    //    Pathname-only check avoids ?next=/ru/dashboard/ false positives
    //    Poll a few times — SPA auth redirect can happen slightly after networkidle
    if (authRejected) {
      console.warn(
        `[TokenManager] ${email}: auth rejected (401 received), falling back to UI`,
      );
      this.invalidate(email);
      return false;
    }

    for (let i = 0; i < 3; i++) {
      const pathname = new URL(page.url()).pathname;
      if (!LOGIN_PATH_RE.test(pathname)) return true;
      // SPA may still be redirecting — wait a bit and re-check
      await page.waitForTimeout(500);
    }

    // Still on /login after 3 checks → auth failed — log diagnostics
    const finalUrl = page.url();
    const cookies = await context.cookies();
    const { cookiePrefix } = AUTH_CONFIG;
    const hasAccess = cookies.some(
      (c) => c.name === `${cookiePrefix}_access_token`,
    );
    const hasRefresh = cookies.some(
      (c) => c.name === `${cookiePrefix}_refresh_token`,
    );
    console.warn(
      `[TokenManager] ${email}: API login failed — still on /login after polling.\n` +
        `  URL: ${finalUrl}\n` +
        `  Cookies: access=${hasAccess}, refresh=${hasRefresh} (total: ${cookies.length})\n` +
        `  Token expiry: ${tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : "unknown"}`,
    );
    this.invalidate(email);
    return false;
  },

  /** Invalidate cached token for a specific email */
  invalidate(email) {
    cache.delete(email);
  },

  /** Invalidate all cached tokens (use after role changes) */
  invalidateAll() {
    cache.clear();
  },
};

// ---------------------------------------------------------------------------
// Shared utility for role-change tests
// ---------------------------------------------------------------------------

/**
 * Assign roles + invalidate token cache in one call.
 * Drop-in replacement for `api.assignRolesToUser(userId, roleIds)` in role tests.
 * @param {Object} api - API client with assignRolesToUser method
 * @param {number} userId
 * @param {number[]} roleIds
 * @param {string} [targetEmail] - email of the user whose roles changed;
 *   if provided, only that user's token is invalidated (other sessions stay intact);
 *   if omitted, falls back to invalidateAll() for backward compatibility
 */
export async function assignRolesAndInvalidate(
  api,
  userId,
  roleIds,
  targetEmail,
) {
  const result = await api.assignRolesToUser(userId, roleIds);
  if (targetEmail) {
    TokenManager.invalidate(targetEmail);
  } else {
    TokenManager.invalidateAll();
  }
  return result;
}
