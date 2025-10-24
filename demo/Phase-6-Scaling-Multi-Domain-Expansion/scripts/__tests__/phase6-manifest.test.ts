import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function runValidate() {
  const script = join(ROOT, "scripts", "validate-phase6-config.ts");
  const command = `npx ts-node --compiler-options '{"module":"commonjs"}' ${script}`;
  const output = execSync(command, { cwd: ROOT, stdio: "pipe" }).toString();
  return output;
}

test("phase 6 manifest passes validation", () => {
  const output = runValidate();
  assert.match(output, /Phase 6 manifest validated successfully/);
  assert.match(output, /Domains: 3/);
});
