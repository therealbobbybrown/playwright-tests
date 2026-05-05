/**
 * TestRail API Client
 * Universal module for interacting with TestRail API
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Load environment variables from .env
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      // Always overwrite: dotenv/config (used in playwright.config.js) truncates values
      // at `;` and other special chars — our manual parser reads the full raw value
      if (match) {
        let val = match[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[match[1].trim()] = val;
      }
    });
  }
}

loadEnv();

const TESTRAIL_URL = process.env.TESTRAIL_URL || "testrail.example.org";
const TESTRAIL_USER = process.env.TESTRAIL_USER || "qaadmin@example.org";
const TESTRAIL_API_KEY = process.env.TESTRAIL_API_KEY;
const PROJECT_ID = process.env.TESTRAIL_PROJECT_ID || 2;
const SUITE_ID = process.env.TESTRAIL_SUITE_ID || 2;

if (!TESTRAIL_API_KEY) {
  console.warn("Warning: TESTRAIL_API_KEY not set in .env");
}

/**
 * Make HTTP request to TestRail API
 */
function request(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${TESTRAIL_USER}:${TESTRAIL_API_KEY}`).toString(
      "base64",
    );

    const options = {
      hostname: TESTRAIL_URL,
      path: `/index.php?/api/v2/${endpoint}`,
      method: method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (e) {
            reject(
              new Error(`Failed to parse response: ${data.substring(0, 200)}`),
            );
          }
        } else {
          reject(
            new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`),
          );
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Get all sections with pagination
 */
async function getSections(projectId = PROJECT_ID, suiteId = SUITE_ID) {
  let allSections = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await request(
      `get_sections/${projectId}&suite_id=${suiteId}&limit=${limit}&offset=${offset}`,
    );
    const sections = response.sections || response;
    if (!sections || sections.length === 0) break;
    allSections = allSections.concat(sections);
    if (sections.length < limit) break;
    offset += limit;
  }

  return allSections;
}

/**
 * Get cases from a specific section
 */
async function getCases(sectionId, projectId = PROJECT_ID, suiteId = SUITE_ID) {
  let allCases = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await request(
      `get_cases/${projectId}&suite_id=${suiteId}&section_id=${sectionId}&limit=${limit}&offset=${offset}`,
    );
    const cases = response.cases || response;
    if (!cases || cases.length === 0) break;
    allCases = allCases.concat(cases);
    if (cases.length < limit) break;
    offset += limit;
  }

  return allCases;
}

/**
 * Get all cases with pagination (no section filter)
 */
async function getAllCases(projectId = PROJECT_ID, suiteId = SUITE_ID) {
  let allCases = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await request(
      `get_cases/${projectId}&suite_id=${suiteId}&limit=${limit}&offset=${offset}`,
    );
    const cases = response.cases || response;
    if (!cases || cases.length === 0) break;
    allCases = allCases.concat(cases);
    if (cases.length < limit) break;
    offset += limit;
  }

  return allCases;
}

/**
 * Update a test case
 */
async function updateCase(caseId, data) {
  return request(`update_case/${caseId}`, "POST", data);
}

/**
 * Delete a test case
 */
async function deleteCase(caseId) {
  return request(`delete_case/${caseId}`, "POST");
}

/**
 * Add a test case
 */
async function addCase(sectionId, data) {
  return request(`add_case/${sectionId}`, "POST", data);
}

/**
 * Add a section
 */
async function addSection(projectId, data) {
  return request(`add_section/${projectId}`, "POST", data);
}

// ============ Rate Limiter ============
// TestRail API limit: 180 requests/minute.
// We throttle to ~2 req/sec (120/min) to stay under the limit with margin.
// Uses a promise chain to serialize slot acquisition even with concurrent callers.

const RATE_LIMIT_INTERVAL_MS = 500; // minimum ms between requests
let _slotChain = Promise.resolve();

/**
 * Acquire a rate-limit slot. Serializes concurrent callers via promise chain.
 */
function acquireSlot() {
  _slotChain = _slotChain.then(
    () => delay(RATE_LIMIT_INTERVAL_MS),
    () => delay(RATE_LIMIT_INTERVAL_MS), // recover from rejected chain
  );
  return _slotChain;
}

/**
 * Retry wrapper with exponential backoff and rate-limit awareness.
 * Retries on: HTTP 429, 5xx, network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND).
 * Does NOT retry on: 400, 401, 403, 404 (client errors).
 *
 * For HTTP 429, parses "Retry after N seconds" from the response body
 * and waits at least that long before retrying.
 *
 * @param {Function} fn - async function to call
 * @param {number} maxAttempts - default 6
 * @param {number} baseDelayMs - default 2000 (doubles: 2s, 4s, 8s, 16s, 32s)
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxAttempts = 6, baseDelayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await acquireSlot();
      return await fn();
    } catch (err) {
      const msg = err.message || "";
      const isRetryable =
        /HTTP 429/i.test(msg) ||
        /HTTP 5\d{2}/i.test(msg) ||
        /ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|EAI_AGAIN/i.test(msg);

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }

      // For 429, parse "Retry after N seconds" from response body
      let delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const retryAfterMatch = msg.match(/Retry after (\d+)/i);
      if (retryAfterMatch) {
        const serverDelaySec = parseInt(retryAfterMatch[1], 10);
        delayMs = Math.max(delayMs, (serverDelaySec + 1) * 1000);
      }

      console.warn(
        `[TestRail] Retry ${attempt}/${maxAttempts} after ${delayMs}ms: ${msg}`,
      );
      await delay(delayMs);
    }
  }
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============ Run Management ============

/**
 * Get a single run by ID
 * @param {number} runId
 * @returns {Promise<Object>} Run object (id, name, is_completed, url, passed_count, failed_count, untested_count, ...)
 */
async function getRun(runId) {
  return request(`get_run/${runId}`);
}

/**
 * List runs for a project
 * @param {number} projectId
 * @param {Object} filters - { is_completed, suite_id, limit, offset }
 * @returns {Promise<Object[]>}
 */
async function getRuns(projectId = PROJECT_ID, filters = {}) {
  let query = `get_runs/${projectId}`;
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && val !== "") {
      query += `&${key}=${val}`;
    }
  }
  const response = await request(query);
  return response.runs || response;
}

/**
 * Create a new test run
 * @param {number} projectId
 * @param {Object} data - { suite_id, name, description, include_all, case_ids, milestone_id }
 * @returns {Promise<Object>} Created Run object with id, url
 */
async function addRun(projectId = PROJECT_ID, data) {
  return request(`add_run/${projectId}`, "POST", data);
}

/**
 * Update an existing run
 * @param {number} runId
 * @param {Object} data - { name, description, case_ids, include_all, milestone_id }
 * @returns {Promise<Object>}
 */
async function updateRun(runId, data) {
  return request(`update_run/${runId}`, "POST", data);
}

/**
 * Close a run (no more results can be added)
 * @param {number} runId
 * @returns {Promise<Object>}
 */
async function closeRun(runId) {
  return request(`close_run/${runId}`, "POST");
}

/**
 * Get tests in a run with pagination
 * @param {number} runId
 * @param {Object} filters - { status_id, limit, offset }
 * @returns {Promise<Object[]>}
 */
async function getTests(runId, filters = {}) {
  let allTests = [];
  let offset = filters.offset || 0;
  const limit = filters.limit || 250;

  while (true) {
    let query = `get_tests/${runId}&limit=${limit}&offset=${offset}`;
    if (filters.status_id) query += `&status_id=${filters.status_id}`;
    const response = await request(query);
    const tests = response.tests || response;
    if (!tests || tests.length === 0) break;
    allTests = allTests.concat(tests);
    if (tests.length < limit) break;
    offset += limit;
  }

  return allTests;
}

/**
 * Add a result for a specific case in a run
 * @param {number} runId
 * @param {number} caseId
 * @param {Object} data - { status_id, comment, elapsed, defects }
 * @returns {Promise<Object>}
 */
async function addResultForCase(runId, caseId, data) {
  return request(`add_result_for_case/${runId}/${caseId}`, "POST", data);
}

/**
 * Get results for a run with pagination
 * @param {number} runId
 * @param {Object} filters - { status_id, limit, offset }
 * @returns {Promise<Object[]>}
 */
async function getResultsForRun(runId, filters = {}) {
  let allResults = [];
  let offset = filters.offset || 0;
  const limit = filters.limit || 250;

  while (true) {
    let query = `get_results_for_run/${runId}&limit=${limit}&offset=${offset}`;
    if (filters.status_id) query += `&status_id=${filters.status_id}`;
    const response = await request(query);
    const results = response.results || response;
    if (!results || results.length === 0) break;
    allResults = allResults.concat(results);
    if (results.length < limit) break;
    offset += limit;
  }

  return allResults;
}

/**
 * Build section hierarchy map
 */
function buildSectionMap(sections) {
  const map = new Map();
  sections.forEach((s) => map.set(s.id, s));
  return map;
}

/**
 * Get full path for a section
 */
function getSectionPath(sectionId, sectionMap) {
  const parts = [];
  let currentId = sectionId;
  while (currentId && sectionMap.has(currentId)) {
    const section = sectionMap.get(currentId);
    parts.unshift(section.name);
    currentId = section.parent_id;
  }
  return parts.join(" > ");
}

/**
 * Find child sections recursively
 */
function findChildSections(parentId, sections) {
  const children = new Set();

  function findChildren(id) {
    sections
      .filter((s) => s.parent_id === id)
      .forEach((s) => {
        children.add(s.id);
        findChildren(s.id);
      });
  }

  children.add(parentId);
  findChildren(parentId);
  return children;
}

module.exports = {
  request,
  getSections,
  getCases,
  getAllCases,
  updateCase,
  deleteCase,
  addCase,
  addSection,
  delay,
  withRetry,
  buildSectionMap,
  getSectionPath,
  findChildSections,
  // Run management
  getRun,
  getRuns,
  addRun,
  updateRun,
  closeRun,
  getTests,
  addResultForCase,
  getResultsForRun,
  // Constants
  PROJECT_ID,
  SUITE_ID,
  TESTRAIL_URL,
};
