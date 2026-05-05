require("dotenv").config();
const https = require("https");
const auth = Buffer.from(
  process.env.TESTRAIL_USER + ":" + process.env.TESTRAIL_API_KEY,
).toString("base64");

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "testrail.example.org",
        path: "/index.php?/api/v2/" + path,
        method: "GET",
        headers: {
          Authorization: "Basic " + auth,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(JSON.parse(data)));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  const runId = process.argv[2] || "24";

  // Get run info
  const run = await apiGet("get_run/" + runId);
  console.log("Run: " + run.name);
  console.log(
    "Passed: " +
      run.passed_count +
      " | Failed: " +
      run.failed_count +
      " | Blocked: " +
      run.blocked_count +
      " | Untested: " +
      run.untested_count,
  );
  console.log("");

  // Get all failed tests (status_id=5)
  const tests = await apiGet("get_tests/" + runId + "&status_id=5");
  const items = tests.tests || tests;
  console.log("Total failed: " + items.length);
  console.log("");

  // Group by section
  const sections = {};
  for (const t of items) {
    const secId = t.section_id || "unknown";
    if (!sections[secId]) sections[secId] = [];
    sections[secId].push(t);
  }

  // Get section names
  const sectionNames = {};
  for (const sid of Object.keys(sections)) {
    try {
      const sec = await apiGet("get_section/" + sid);
      sectionNames[sid] = sec.name;
    } catch (e) {
      sectionNames[sid] = "Section " + sid;
    }
  }

  for (const [sid, tests] of Object.entries(sections)) {
    console.log(
      "=== " + sectionNames[sid] + " (" + tests.length + " failed) ===",
    );
    for (const t of tests) {
      const comment = (t.custom_comment || t.comment || "")
        .substring(0, 150)
        .replace(/\n/g, " ");
      console.log("  C" + t.case_id + ": " + t.title);
      if (comment) console.log("    -> " + comment);
    }
    console.log("");
  }

  // Also get untested
  const untested = await apiGet("get_tests/" + runId + "&status_id=3");
  const untestedItems = untested.tests || untested;
  if (untestedItems.length > 0) {
    console.log("=== UNTESTED (" + untestedItems.length + ") ===");
    for (const t of untestedItems) {
      console.log("  C" + t.case_id + ": " + t.title);
    }
  }
})();
