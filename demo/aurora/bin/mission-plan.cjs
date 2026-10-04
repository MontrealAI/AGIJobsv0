'use strict';
const fs = require('node:fs');
const path = require('node:path');
function quorum(value, label = 'Job') {
  const { k, n } = value || {};
  if (
    !Number.isSafeInteger(k) ||
    !Number.isSafeInteger(n) ||
    k < 1 ||
    n < 3 ||
    k > n ||
    n > 5
  )
    throw new Error(
      label +
        ': validation must use integer 1 <= k <= n and 3 <= n <= 5 for the local fixture.'
    );
  return { k, n };
}
function missionPlan(file, base = process.cwd()) {
  const mission = JSON.parse(fs.readFileSync(path.resolve(base, file), 'utf8'));
  if (!Array.isArray(mission.jobs) || !mission.jobs.length)
    throw new Error('Mission must contain at least one job.');
  const seen = new Set();
  return mission.jobs.map((job, index) => {
    if (
      typeof job.name !== 'string' ||
      !job.name.trim() ||
      typeof job.specPath !== 'string'
    )
      throw new Error('Every mission job requires a name and specPath.');
    const slug =
      job.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'job-' + (index + 1);
    if (seen.has(slug))
      throw new Error('Mission job names collide in receipt path: ' + slug);
    seen.add(slug);
    const spec = JSON.parse(
      fs.readFileSync(path.resolve(base, job.specPath), 'utf8')
    );
    return { name: job.name, slug, ...quorum(spec.validation, job.name) };
  });
}
module.exports = { quorum, missionPlan };
if (require.main === module) {
  try {
    if (process.argv.length !== 3)
      throw new Error(
        'Usage: node demo/aurora/bin/mission-plan.cjs <mission.json>'
      );
    const jobs = missionPlan(process.argv[2]);
    console.log(
      'Mission preflight: ' +
        jobs.length +
        ' jobs; validator committees ' +
        jobs.map((job) => job.k + '-of-' + job.n).join(', ')
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
