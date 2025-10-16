import { readFile } from "fs/promises";
import path from "path";

import { renderDashboard } from "./renderDashboard";

async function main() {
  const recapPath = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
  const raw = await readFile(recapPath, "utf8");
  const recap = JSON.parse(raw);
  const output = await renderDashboard(recap);
  console.log(`Rendered α-AGI MARK dashboard to ${output}`);
}

main().catch((error) => {
  console.error("Failed to render α-AGI MARK dashboard:", error);
  process.exitCode = 1;
});
