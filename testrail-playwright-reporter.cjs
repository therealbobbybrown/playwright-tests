/**
 * Enhanced TestRail Playwright Reporter
 *
 * Standalone reporter (no @zealteam/testrail-reporter dependency).
 * Uses scripts/testrail/client.cjs directly for full control.
 *
 * Features:
 * 1. Pre-flight validation: confirms run exists and is open before tests start
 * 2. Retry with exponential backoff on transient failures (429, 5xx, network)
 * 3. Per-test logging: [TestRail] C1234: passed / FAILED to upload
 * 4. Results written IMMEDIATELY after each test (critical for long runs)
 * 5. onEnd summary: uploaded/failed/skipped counts + run URL
 * 6. Reads run ID from .testrail-run-id file (fallback to TESTRAIL_RUN_ID env)
 */

const fs = require("fs");
const path = require("path");
const client = require("./scripts/testrail/client.cjs");

const C_ID_REGEX = /C(\d{1,9})/g;
const RUN_ID_FILE = path.resolve(__dirname, ".testrail-run-id");

const STATUS_MAP = {
  passed: 1,
  failed: 5,
  skipped: null, // Don't upload — leave as Untested in TestRail (status 3 = Untested, can't be set via API)
  timedOut: 5,
  interrupted: null, // Don't upload — leave as Untested
};

class TestRailReporter {
  constructor() {
    this.runId = null;
    this.runUrl = "";
    this.enabled = true;

    // Counters
    this.uploadedCount = 0;
    this.failedUploads = [];
    this.skippedNoCid = 0;
    this.totalTests = 0;

    // Promise tracking (wait all onTestEnd before onEnd)
    this._testEndPromises = [];

    // Load config
    try {
      this.config = require(path.resolve(process.cwd(), "testrail.config.js"));
    } catch {
      console.warn("[TestRail] testrail.config.js not found, using defaults");
      this.config = {};
    }
  }

  /**
   * Resolve run ID from multiple sources (priority order):
   * 1. .testrail-run-id file
   * 2. TESTRAIL_RUN_ID env var (via config)
   * 3. null (will need to create new run)
   */
  _resolveRunId() {
    // 1. File
    if (fs.existsSync(RUN_ID_FILE)) {
      const content = fs.readFileSync(RUN_ID_FILE, "utf8").trim();
      const id = parseInt(content, 10);
      if (id > 0) {
        console.log(`[TestRail] Run ID from .testrail-run-id: ${id}`);
        return id;
      }
    }

    // 2. Env / config
    const configId = this.config?.use_existing_run?.id;
    if (configId && configId > 0) {
      console.log(`[TestRail] Run ID from config/env: ${configId}`);
      return configId;
    }

    return null;
  }

  /**
   * Extract C-IDs from test title
   */
  _extractCaseIds(title) {
    const ids = [];
    let match;
    // Reset lastIndex for global regex
    C_ID_REGEX.lastIndex = 0;
    while ((match = C_ID_REGEX.exec(title)) !== null) {
      ids.push(parseInt(match[1], 10));
    }
    return ids;
  }

  /**
   * Format elapsed time: ms -> "1m 23s" for TestRail
   */
  _formatElapsed(ms) {
    if (!ms || ms < 1000) return "1s";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }

  /**
   * Build comment from test result
   */
  _buildComment(test, result) {
    const parts = [];

    if (result.status === "failed" || result.status === "timedOut") {
      // Include error message
      if (result.error) {
        const msg = result.error.message || String(result.error);
        parts.push(`Error: ${msg.substring(0, 1000)}`);
      }
    }

    if (result.status === "skipped") {
      parts.push("Test was skipped");
    }

    // Add retry info if retried
    if (result.retry > 0) {
      parts.push(`Retry #${result.retry}`);
    }

    return parts.join("\n\n") || undefined;
  }

  /**
   * Create a new run with all C-IDs found in the suite
   */
  async _createNewRun(suite) {
    const caseIds = new Set();
    for (const test of suite.allTests()) {
      for (const id of this._extractCaseIds(test.title)) {
        caseIds.add(id);
      }
    }

    if (caseIds.size === 0) {
      console.warn(
        "[TestRail] No C-IDs found in test titles, cannot create run",
      );
      return null;
    }

    const name =
      this.config?.create_new_run?.run_name || "Playwright Automated Run";
    const now = new Date();
    const dateStr = now.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const runName = `${name} ${dateStr}`;

    const projectId = this.config?.project_id || client.PROJECT_ID;
    const suiteId = this.config?.suite_id || client.SUITE_ID;
    const milestoneId = this.config?.create_new_run?.milestone_id;

    const runData = {
      suite_id: parseInt(suiteId, 10),
      name: runName,
      description: "Created by Playwright Enhanced Reporter",
      include_all: false,
      case_ids: [...caseIds],
    };
    if (milestoneId && milestoneId > 0) {
      runData.milestone_id = milestoneId;
    }

    try {
      const run = await client.addRun(parseInt(projectId, 10), runData);
      console.log(
        `[TestRail] Created new run #${run.id}: ${runName} (${caseIds.size} cases)`,
      );
      console.log(`[TestRail] URL: ${run.url}`);

      // Save to file for future reference
      fs.writeFileSync(RUN_ID_FILE, String(run.id), "utf8");

      return run;
    } catch (err) {
      console.error(`[TestRail] Failed to create run: ${err.message}`);
      return null;
    }
  }

  // ==================== Playwright Lifecycle ====================

  /**
   * Called before test execution starts.
   * Validates or creates the run.
   */
  async onBegin(config, suite) {
    this.totalTests = suite.allTests().length;

    const runId = this._resolveRunId();

    if (runId) {
      // Validate existing run
      try {
        const run = await client.withRetry(() => client.getRun(runId));
        if (run.is_completed) {
          console.error(
            `[TestRail] Run #${runId} is CLOSED. Results will NOT be uploaded.`,
          );
          console.error(
            `[TestRail] Create a new run or update .testrail-run-id`,
          );
          this.enabled = false;
          return;
        }
        this.runId = run.id;
        this.runUrl =
          run.url ||
          `https://${client.TESTRAIL_URL}/index.php?/runs/view/${run.id}`;
        console.log(
          `[TestRail] Run #${run.id} validated (open, ${run.untested_count || "?"} untested)`,
        );
        console.log(`[TestRail] URL: ${this.runUrl}`);
      } catch (err) {
        console.error(
          `[TestRail] Failed to validate run #${runId}: ${err.message}`,
        );
        console.error(`[TestRail] Results will NOT be uploaded.`);
        this.enabled = false;
        return;
      }
    } else {
      // No run ID — don't auto-create (blind C-ID collection fails with unvalidated IDs)
      console.error("[TestRail] No run ID found. Create a run first:");
      console.error(
        "[TestRail]   node scripts/testrail/cli.cjs create-run <module>",
      );
      console.error("[TestRail] Results will NOT be uploaded.");
      this.enabled = false;
    }
  }

  /**
   * Called after each test completes.
   * Immediately uploads result to TestRail with retry.
   */
  async onTestEnd(test, result) {
    if (!this.enabled || !this.runId) return;

    const promise = this._handleTestEnd(test, result);
    this._testEndPromises.push(promise);
    return promise;
  }

  async _handleTestEnd(test, result) {
    const caseIds = this._extractCaseIds(test.title);

    if (caseIds.length === 0) {
      this.skippedNoCid++;
      return;
    }

    for (const caseId of caseIds) {
      const statusId = STATUS_MAP[result.status];
      const statusLabel = result.status;

      // null status = don't upload (skipped/interrupted stay as Untested in TestRail)
      if (statusId === null || statusId === undefined) {
        this.skippedNoCid++;
        console.log(
          `[TestRail] C${caseId}: ${statusLabel} (not uploaded, stays untested)`,
        );
        continue;
      }

      const data = {
        status_id: statusId,
        elapsed: this._formatElapsed(result.duration),
        comment: this._buildComment(test, result),
      };

      try {
        await client.withRetry(
          () => client.addResultForCase(this.runId, caseId, data),
          6,
          2000,
        );
        this.uploadedCount++;

        const icon =
          statusId === 1 ? "\u2713" : statusId === 5 ? "\u2717" : "\u2192";
        console.log(`[TestRail] C${caseId}: ${statusLabel} ${icon}`);
      } catch (err) {
        this.failedUploads.push({
          caseId,
          error: err.message,
          status: statusLabel,
        });
        console.error(
          `[TestRail] C${caseId}: UPLOAD FAILED (3/3): ${err.message}`,
        );
      }
    }
  }

  /**
   * Called after all tests complete.
   * Waits for all uploads, prints summary.
   */
  async onEnd(result) {
    if (!this.enabled || !this.runId) {
      if (!this.enabled) {
        console.log("[TestRail] Reporter was disabled (run validation failed)");
      }
      return;
    }

    // Wait for ALL onTestEnd promises to complete
    await Promise.all(this._testEndPromises);

    // Summary
    const total = this.uploadedCount + this.failedUploads.length;
    console.log("");
    console.log("[TestRail] === Summary ===");
    console.log(`[TestRail] Uploaded:  ${this.uploadedCount}/${total}`);

    if (this.failedUploads.length > 0) {
      console.log(`[TestRail] Failed:    ${this.failedUploads.length} uploads`);
      for (const f of this.failedUploads) {
        console.log(`[TestRail]   C${f.caseId} (${f.status}): ${f.error}`);
      }
    }

    if (this.skippedNoCid > 0) {
      console.log(
        `[TestRail] Skipped:   ${this.skippedNoCid} tests (no C-ID in title)`,
      );
    }

    console.log(`[TestRail] Run URL:   ${this.runUrl}`);
    console.log(`[TestRail] Run ID:    ${this.runId}`);
    console.log("");
  }
}

module.exports = TestRailReporter;
