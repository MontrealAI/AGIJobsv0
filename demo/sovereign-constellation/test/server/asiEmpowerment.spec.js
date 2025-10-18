const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const empowermentPath = path.join(root, "config/asiTakesOffEmpowerment.json");
const matrixPath = path.join(root, "config/asiTakesOffOwnerMatrix.json");

const empowerment = JSON.parse(fs.readFileSync(empowermentPath, "utf8"));
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

assert.ok(empowerment.summary, "Empowerment summary required");
assert.ok(empowerment.summary.headline, "Summary needs headline");
assert.ok(/unstoppable/i.test(empowerment.summary.unstoppable), "Summary must highlight unstoppable execution");
assert.ok(/owner/i.test(empowerment.summary.ownerSovereignty), "Summary should emphasise owner sovereignty");
assert.ok(Array.isArray(empowerment.summary.immediateActions) && empowerment.summary.immediateActions.length >= 3, "Immediate actions must guide non-technical users");

assert.ok(Array.isArray(empowerment.sections), "Sections must be defined");
assert.equal(empowerment.sections.length, 5, "Five flagship empowerment sections expected");

const matrixIds = new Set(matrix.map((entry) => entry.id));

empowerment.sections.forEach((section) => {
  assert.ok(section.id && section.title, "Section requires id/title");
  assert.ok(section.promise && section.empowerment, `Section ${section.id} needs promise/empowerment narratives`);
  assert.ok(Array.isArray(section.operatorJourney) && section.operatorJourney.length >= 3, `Section ${section.id} must guide operators`);
  assert.ok(Array.isArray(section.ownerPowers) && section.ownerPowers.length >= 1, `Section ${section.id} must expose owner power`);
  section.ownerPowers.forEach((power) => {
    assert.ok(power.matrixId && matrixIds.has(power.matrixId), `Owner power ${power.matrixId} must map to owner matrix entry`);
    assert.ok(power.description && power.expectation, `Owner power ${power.matrixId} requires description/expectation`);
  });
  assert.ok(Array.isArray(section.automation) && section.automation.length >= 2, `Section ${section.id} should have automation commands`);
  assert.ok(Array.isArray(section.verification) && section.verification.length >= 2, `Section ${section.id} should list verification cues`);
  assert.ok(section.unstoppableSignal && /unstoppable/i.test(section.unstoppableSignal), `Section ${section.id} unstoppable signal should mention unstoppable readiness`);
});

console.log("✅ asiTakesOffEmpowerment.json validated");
