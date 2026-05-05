/**
 * Closes Playwright MCP browser by killing browser processes from Playwright cache.
 * Only targets browsers from ms-playwright directory, not user's own Chrome.
 * Used as a Claude Code hook on Stop/SubagentStop events.
 */
const { execSync } = require("child_process");

try {
  execSync(
    `powershell.exe -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*ms-playwright*' } | Stop-Process -Force -ErrorAction SilentlyContinue"`,
    { stdio: "ignore", timeout: 5000 },
  );
} catch (e) {}
