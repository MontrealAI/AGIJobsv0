"use strict";

const fs = require("fs");
const path = require("path");

const workflowRoot = path.join(__dirname, "..", "..", ".github", "workflows");
const unquotedHexPattern = /:\s*0x[0-9a-fA-F]{16,}\b/;
const quotedHexPattern = /:\s*['"]0x[0-9a-fA-F]{16,}\b/;

const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".yml")) {
      const contents = fs.readFileSync(fullPath, "utf8");
      const lines = contents.split(/\r?\n/);
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          return;
        }
        if (unquotedHexPattern.test(line) && !quotedHexPattern.test(line)) {
          violations.push({
            file: fullPath,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }
  }
}

walk(workflowRoot);

if (violations.length > 0) {
  console.error("Found unquoted hex values in workflow YAML:");
  for (const violation of violations) {
    console.error(
      `- ${path.relative(process.cwd(), violation.file)}:${violation.line}: ${violation.text}`
    );
  }
  process.exit(1);
}

console.log("Workflow YAML hex values are properly quoted.");
