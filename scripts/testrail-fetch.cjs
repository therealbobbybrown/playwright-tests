/**
 * Script to fetch test cases from TestRail - Jinn section (excluding Регресс репорта)
 */

const https = require("https");
const fs = require("fs");

const TESTRAIL_URL = "testrail.example.org";
const USERNAME = "qaadmin@example.org";
const API_KEY = "(i;%+0u9*8wcTf6;&d>f=g#_M";

const PROJECT_ID = 2;
const SUITE_ID = 2;
const JINN_SECTION_ID = 628;
const EXCLUDE_SECTION_ID = 619; // Регресс репорта

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${USERNAME}:${API_KEY}`).toString("base64");

    const options = {
      hostname: TESTRAIL_URL,
      path: `/index.php?/api/v2/${endpoint}`,
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function getAllSections() {
  let allSections = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await makeRequest(
      `get_sections/${PROJECT_ID}&suite_id=${SUITE_ID}&limit=${limit}&offset=${offset}`,
    );
    const sections = response.sections || response;
    if (!sections || sections.length === 0) break;
    allSections = allSections.concat(sections);
    if (sections.length < limit) break;
    offset += limit;
  }

  return allSections;
}

async function getAllCases(sectionIds) {
  let allCases = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await makeRequest(
      `get_cases/${PROJECT_ID}&suite_id=${SUITE_ID}&limit=${limit}&offset=${offset}`,
    );
    const cases = response.cases || response;
    if (!cases || cases.length === 0) break;

    // Filter by section IDs
    const filteredCases = cases.filter((c) => sectionIds.has(c.section_id));
    allCases = allCases.concat(filteredCases);

    console.log(
      `Fetched ${offset + cases.length} cases, ${allCases.length} match Jinn sections...`,
    );

    if (cases.length < limit) break;
    offset += limit;
  }

  return allCases;
}

async function main() {
  try {
    console.log("Fetching Jinn test cases (excluding Регресс репорта)...\n");

    // Get all sections
    console.log("1. Fetching sections...");
    const allSections = await getAllSections();
    console.log(`   Total sections: ${allSections.length}`);

    // Build section map
    const sectionMap = new Map();
    allSections.forEach((s) => sectionMap.set(s.id, s));

    // Find sections to exclude (Регресс репорта and its children)
    const excludeSectionIds = new Set();
    function findExcludeChildren(parentId) {
      allSections
        .filter((s) => s.parent_id === parentId)
        .forEach((s) => {
          excludeSectionIds.add(s.id);
          findExcludeChildren(s.id);
        });
    }
    excludeSectionIds.add(EXCLUDE_SECTION_ID);
    findExcludeChildren(EXCLUDE_SECTION_ID);
    console.log(
      `   Excluding ${excludeSectionIds.size} sections (Регресс репорта)`,
    );

    // Find Jinn sections (including nested, excluding Регресс репорта)
    const jinnSectionIds = new Set();
    function findJinnChildren(parentId) {
      allSections
        .filter((s) => s.parent_id === parentId)
        .forEach((s) => {
          if (!excludeSectionIds.has(s.id)) {
            jinnSectionIds.add(s.id);
            findJinnChildren(s.id);
          }
        });
    }
    jinnSectionIds.add(JINN_SECTION_ID);
    findJinnChildren(JINN_SECTION_ID);
    console.log(`   Including ${jinnSectionIds.size} Jinn sections`);

    // Get all cases
    console.log("\n2. Fetching test cases...");
    const allCases = await getAllCases(jinnSectionIds);
    console.log(`\n   Total Jinn test cases: ${allCases.length}`);

    // Group by section
    const casesBySection = new Map();
    allCases.forEach((c) => {
      if (!casesBySection.has(c.section_id)) {
        casesBySection.set(c.section_id, []);
      }
      casesBySection.get(c.section_id).push(c);
    });

    // Build section path
    function getSectionPath(sectionId) {
      const parts = [];
      let currentId = sectionId;
      while (currentId && sectionMap.has(currentId)) {
        const section = sectionMap.get(currentId);
        parts.unshift(section.name);
        currentId = section.parent_id;
      }
      return parts.join(" > ");
    }

    // Output results
    console.log("\n=== JINN TEST CASES ===\n");

    const output = [];
    let caseNum = 0;

    for (const [sectionId, cases] of casesBySection) {
      const sectionPath = getSectionPath(sectionId);
      output.push(`\n## ${sectionPath}\n`);
      console.log(`\n## ${sectionPath} (${cases.length} cases)`);

      for (const tc of cases) {
        caseNum++;
        output.push(`### C${tc.id}: ${tc.title}`);
        output.push(`Section: ${sectionPath}`);
        output.push(`Priority: ${tc.priority_id}`);

        if (tc.custom_preconds) {
          output.push(`\n**Preconditions:**\n${tc.custom_preconds}`);
        }

        if (tc.custom_steps_separated && tc.custom_steps_separated.length > 0) {
          output.push(`\n**Steps:**`);
          tc.custom_steps_separated.forEach((step, i) => {
            output.push(`${i + 1}. ${step.content || step.step || ""}`);
            if (step.expected) {
              output.push(`   Expected: ${step.expected}`);
            }
          });
        } else if (tc.custom_steps) {
          output.push(`\n**Steps:**\n${tc.custom_steps}`);
        }

        if (tc.custom_expected) {
          output.push(`\n**Expected Result:**\n${tc.custom_expected}`);
        }

        output.push("\n---\n");
      }
    }

    // Save to file
    const outputFile =
      "c:/Users/Polarfox/playwright-tests/docs/testrail-jinn-cases.md";
    fs.writeFileSync(outputFile, output.join("\n"), "utf8");
    console.log(`\n\nSaved ${caseNum} test cases to ${outputFile}`);

    // Also save as JSON for easier processing
    const jsonOutput = {
      totalCases: allCases.length,
      sections: Array.from(casesBySection.entries()).map(
        ([sectionId, cases]) => ({
          sectionId,
          sectionPath: getSectionPath(sectionId),
          cases: cases.map((tc) => ({
            id: tc.id,
            title: tc.title,
            priority: tc.priority_id,
            preconditions: tc.custom_preconds,
            steps: tc.custom_steps_separated || tc.custom_steps,
            expected: tc.custom_expected,
          })),
        }),
      ),
    };

    const jsonFile =
      "c:/Users/Polarfox/playwright-tests/docs/testrail-jinn-cases.json";
    fs.writeFileSync(jsonFile, JSON.stringify(jsonOutput, null, 2), "utf8");
    console.log(`Saved JSON to ${jsonFile}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
