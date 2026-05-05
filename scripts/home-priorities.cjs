/**
 * Update TestRail case priorities for Home module
 * P0 = Critical smoke tests (4 tests)
 * P1 = Other tests
 */

const https = require("https");

const TESTRAIL_URL = "testrail.example.org";
const USERNAME = "qaadmin@example.org";
const API_KEY = "(i;%+0u9*8wcTf6;&d>f=g#_M";

const SECTION_ID = 674; // home section

// P0 test titles (partial match) - 4 critical tests
const P0_TITLES = [
  "админ открывает главную через меню",
  "главная страница загружается напрямую по URL",
  "админ видит все блоки страницы",
  "badge показывает количество задач", // основной контент главной страницы
];

function makeRequest(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${USERNAME}:${API_KEY}`).toString("base64");

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
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function isP0(title) {
  const lower = title.toLowerCase();
  return P0_TITLES.some((p) => lower.includes(p.toLowerCase()));
}

async function main() {
  console.log("=== Updating Home module priorities ===\n");

  // Get all cases
  const response = await makeRequest(
    `get_cases/2&suite_id=2&section_id=${SECTION_ID}`,
  );
  const cases = response.cases || response;
  console.log(`Found ${cases.length} cases\n`);

  let p0Count = 0,
    p1Count = 0,
    updated = 0;

  for (const c of cases) {
    const shouldBeP0 = isP0(c.title);
    const newPriority = shouldBeP0 ? 4 : 3; // 4=Critical (P0), 3=High (P1)

    if (c.priority_id !== newPriority) {
      console.log(
        `C${c.id}: "${c.title.substring(0, 50)}..." -> ${shouldBeP0 ? "P0" : "P1"}`,
      );
      await makeRequest(`update_case/${c.id}`, "POST", {
        priority_id: newPriority,
      });
      updated++;
    }

    if (shouldBeP0) p0Count++;
    else p1Count++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`P0: ${p0Count}`);
  console.log(`P1: ${p1Count}`);
  console.log(`Updated: ${updated}`);
}

main().catch(console.error);
