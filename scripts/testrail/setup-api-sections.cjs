#!/usr/bin/env node
/**
 * One-time script to create API test sections in TestRail.
 *
 * Creates:
 *   Jinn (628)
 *     └── API тесты (parent)
 *           ├── P0 - Критичные
 *           └── P1 - Регрессия
 *
 * Usage:
 *   node scripts/testrail/setup-api-sections.cjs [--dry-run]
 *
 * After running, update MODULES in config.cjs with the printed IDs.
 */

const client = require("./client.cjs");
const config = require("./config.cjs");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const projectId = client.PROJECT_ID;
  const suiteId = client.SUITE_ID;
  const jinnSectionId = config.JINN_SECTION_ID;

  console.log(
    `Project: ${projectId}, Suite: ${suiteId}, Jinn section: ${jinnSectionId}`,
  );
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  // Check if 'api' module already exists
  if (config.getModule("api")) {
    console.log(
      'Module "api" already exists in MODULES config. Nothing to create.',
    );
    const mod = config.getModule("api");
    console.log(`  parent: ${mod.parent}, p0: ${mod.p0}, p1: ${mod.p1}`);
    return;
  }

  // Step 1: Create parent section "API тесты"
  console.log('Step 1: Creating parent section "API тесты"...');
  let parentId;
  if (DRY_RUN) {
    parentId = "<PARENT_ID>";
    console.log(
      `  [DRY] Would create section "API тесты" under Jinn (${jinnSectionId})`,
    );
  } else {
    const parent = await client.addSection(projectId, {
      name: "API тесты",
      parent_id: jinnSectionId,
      suite_id: suiteId,
    });
    parentId = parent.id;
    console.log(`  Created parent: ID = ${parentId}`);
  }

  // Step 2: Create P0 section
  console.log('Step 2: Creating P0 section "P0 - Критичные"...');
  let p0Id;
  if (DRY_RUN) {
    p0Id = "<P0_ID>";
    console.log(
      `  [DRY] Would create section "P0 - Критичные" under parent (${parentId})`,
    );
  } else {
    await client.delay(200);
    const p0 = await client.addSection(projectId, {
      name: "P0 - Критичные",
      parent_id: parentId,
      suite_id: suiteId,
    });
    p0Id = p0.id;
    console.log(`  Created P0: ID = ${p0Id}`);
  }

  // Step 3: Create P1 section
  console.log('Step 3: Creating P1 section "P1 - Регрессия"...');
  let p1Id;
  if (DRY_RUN) {
    p1Id = "<P1_ID>";
    console.log(
      `  [DRY] Would create section "P1 - Регрессия" under parent (${parentId})`,
    );
  } else {
    await client.delay(200);
    const p1 = await client.addSection(projectId, {
      name: "P1 - Регрессия",
      parent_id: parentId,
      suite_id: suiteId,
    });
    p1Id = p1.id;
    console.log(`  Created P1: ID = ${p1Id}`);
  }

  // Summary
  console.log("\n=== Done! ===\n");
  console.log("Add to MODULES in scripts/testrail/config.cjs:\n");
  console.log(`  api: {`);
  console.log(`    name: 'API тесты',`);
  console.log(`    parent: ${parentId},`);
  console.log(`    p0: ${p0Id},`);
  console.log(`    p1: ${p1Id},`);
  console.log(`  },`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
