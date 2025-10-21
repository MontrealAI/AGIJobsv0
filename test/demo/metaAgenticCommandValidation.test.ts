import path from "path";
import { expect } from "chai";

import {
  evaluateOwnerScripts,
  inspectCommand,
  loadPackageScripts,
} from "../../demo/Meta-Agentic-Program-Synthesis-v0/scripts/commandValidation";

describe("Meta-Agentic owner command validation", function () {
  this.timeout(10000);

  let scripts: Record<string, string | undefined>;

  before(async function () {
    const repoRoot = path.resolve(__dirname, "..", "..");
    scripts = await loadPackageScripts(repoRoot);
  });

  it("recognises available npm scripts", function () {
    expect(inspectCommand("npm run owner:system-pause -- --action status", scripts)).to.equal(true);
    expect(inspectCommand("npm run demo:meta-agentic-program-synthesis", scripts)).to.equal(true);
  });

  it("detects missing npm scripts", function () {
    expect(inspectCommand("npm run owner:non-existent", scripts)).to.equal(false);
  });

  it("treats direct executables as available", function () {
    expect(inspectCommand("node scripts/v2/ownerControlDoctor.ts", scripts)).to.equal(true);
    expect(inspectCommand("ts-node demo/Meta-Agentic-Program-Synthesis-v0/scripts/runSynthesis.ts", scripts)).to.equal(true);
  });

  it("evaluates declared owner scripts", function () {
    const commands = [
      "npm run owner:system-pause -- --action pause",
      "npm run owner:non-existent",
    ];
    const statuses = evaluateOwnerScripts(commands, scripts);
    expect(statuses).to.have.lengthOf(commands.length);
    expect(statuses[0].available).to.equal(true);
    expect(statuses[1].available).to.equal(false);
  });
});
