import "dotenv/config";
import { chromium } from "@playwright/test";

const baseURL = process.env.BASE_URL;

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture API requests
  page.on("request", (req) => {
    if (
      req.url().includes("/manager/assessments/") &&
      req.method() === "POST"
    ) {
      try {
        const body = req.postData();
        if (body) {
          console.log("\n========== API REQUEST ==========");
          console.log("URL:", req.url());
          console.log("Body:");
          console.log(JSON.stringify(JSON.parse(body), null, 2));
          console.log("=================================\n");
        }
      } catch (e) {
        console.log("Could not parse body:", e.message);
      }
    }
  });

  // Go to assessment 223
  console.log("Opening assessment 223...");
  console.log("Please:");
  console.log("1. Login if needed");
  console.log("2. Add a SCALE question with answer options");
  console.log("3. Save the assessment");
  console.log("4. I will capture the API request\n");

  await page.goto(`${baseURL}/ru/manager/assessments/223/`);

  // Wait for user to interact
  console.log("Waiting for API requests... Press Ctrl+C to exit.");

  // Keep alive
  await new Promise(() => {});
}

main().catch(console.error);
