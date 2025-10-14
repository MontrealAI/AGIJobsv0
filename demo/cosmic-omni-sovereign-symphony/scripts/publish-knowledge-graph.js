const fs = require("fs");
const path = require("path");

const ledgerPath = process.argv[2] || path.join(__dirname, "..", "logs", "ledger-latest.json");

if (!fs.existsSync(ledgerPath)) {
  console.error(`[knowledge-graph] ledger file not found at ${ledgerPath}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
console.log("[knowledge-graph] Broadcasting payload to data mesh:");
console.log(JSON.stringify(payload, null, 2));
