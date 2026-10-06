import { families, templates, energySource } from './catalog.mjs';
export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export async function sha256(text) {
  const bytes = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}
export async function makeTask(templateId = 'energy', familyId = 'foundation') {
  const template = templates.find((t) => t.id === templateId);
  const family = families.find((f) => f.id === familyId);
  if (!template || !family)
    throw new Error('Select a known workflow and demo.');
  const source = json(energySource);
  return {
    schemaVersion: 1,
    workerProfile: 'kardashev-business',
    goal: `${family.title}: ${template.goal}`,
    inputText:
      (templateId === 'energy'
        ? `Source SHA-256: ${await sha256(
            source
          )}\nExact source JSON (including final newline):\n${source}`
        : template.input) +
      '\nWork only on this authorized synthetic exercise in an isolated workspace. Network access is unnecessary. Do not operate infrastructure, publish, contact others, purchase, use credentials or sign transactions. Browser/desktop tools are optional and require separately granted permissions. Return the requested deliverable as text; do not claim unperformed work.',
    dataClass: 'synthetic',
    allowedOrigins: ['http://127.0.0.1:4188'],
    acceptanceCriteria: [
      ...template.criteria,
      'Deliver reviewable evidence. An automated check is not independent operator review or payment authorization.',
    ],
    deliverables: [
      {
        name: template.artifact,
        mediaType: template.artifact.endsWith('.json')
          ? 'application/json'
          : 'text/markdown',
      },
    ],
  };
}
export async function taskDigest(task) {
  return sha256(JSON.stringify(task));
}
export function capacity(input) {
  const bounds = {
    agents: [0, 1e9],
    jobsPerAgentDay: [0, 1e4],
    usefulPercent: [0, 100],
    reviewHoursDay: [0, 1e9],
    minutesPerJob: [0.1, 1e6],
    priceUsdc: [0.01, 1e9],
  };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const n = input[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      throw new Error(`Invalid ${key}: use a number from ${min} to ${max}.`);
  }
  const workerCapacity =
    (input.agents * input.jobsPerAgentDay * input.usefulPercent) / 100;
  const reviewerCapacity = (input.reviewHoursDay * 60) / input.minutesPerJob;
  const assumption = 40_000_000_000_000;
  const demandCapacity = assumption / input.priceUsdc / 365;
  const jobsDay = Math.min(workerCapacity, reviewerCapacity, demandCapacity);
  const bottleneck =
    jobsDay === 0
      ? 'No available capacity'
      : jobsDay === demandCapacity
      ? 'Chosen market ceiling'
      : jobsDay === reviewerCapacity
      ? 'Independent review'
      : 'Useful worker output';
  return {
    jobsDay,
    annualVolumeUsdc: jobsDay * 365 * input.priceUsdc,
    workerCapacity,
    reviewerCapacity,
    bottleneck,
    tamAssumptionUsdYear: assumption,
    usdPerUsdcAssumption: 1,
    forecast: false,
  };
}
export async function createExample(familyId = 'foundation') {
  const task = await makeTask('energy', familyId);
  const rows = energySource.rows.map((row) => ({
    id: row.id,
    netKwh: String(BigInt(row.generatedKwh) - BigInt(row.consumedKwh)),
  }));
  const candidate = {
    schemaVersion: 1,
    kind: energySource.kind,
    sourceSha256: await sha256(json(energySource)),
    rows,
    summary: {
      netKwh: String(rows.reduce((sum, row) => sum + BigInt(row.netKwh), 0n)),
      deficits: rows
        .filter((row) => BigInt(row.netKwh) < 0n)
        .map((row) => row.id),
    },
    productionApproved: false,
    settlementApproved: false,
  };
  const content = json(candidate);
  return {
    schemaVersion: 1,
    mode: 'deterministic-local',
    actualProvider: false,
    actualChain: false,
    task,
    taskSha256: await taskDigest(task),
    artifacts: [
      {
        ...task.deliverables[0],
        content,
        bytes: new TextEncoder().encode(content).length,
        sha256: await sha256(content),
      },
    ],
    productionApproved: false,
    settlementApproved: false,
  };
}
export async function reviewEvidence(receipt, expectedTask) {
  const checks = [];
  const check = (label, passed) => {
    checks.push({ label, passed: Boolean(passed) });
    if (!passed) throw new Error(label);
  };
  try {
    check(
      'Evidence is a bounded object',
      receipt &&
        typeof receipt === 'object' &&
        !Array.isArray(receipt) &&
        JSON.stringify(receipt).length <= 262144
    );
    check(
      'Energy acceptance contract selected',
      expectedTask.deliverables[0].name === 'analysis.json'
    );
    check(
      'Exact admitted task digest',
      receipt.taskSha256 === (await taskDigest(expectedTask)) &&
        JSON.stringify(receipt.task) === JSON.stringify(expectedTask)
    );
    check(
      'No automatic production or payment approval',
      receipt.productionApproved === false &&
        receipt.settlementApproved === false
    );
    check(
      'Exactly one expected artifact',
      Array.isArray(receipt.artifacts) &&
        receipt.artifacts.length === 1 &&
        receipt.artifacts[0].name === 'analysis.json' &&
        receipt.artifacts[0].mediaType === 'application/json'
    );
    const artifact = receipt.artifacts[0];
    check(
      'Artifact size is bounded',
      typeof artifact.content === 'string' && artifact.content.length <= 128000
    );
    check(
      'Artifact hash and byte count match',
      artifact.sha256 === (await sha256(artifact.content)) &&
        artifact.bytes === new TextEncoder().encode(artifact.content).length
    );
    const result = JSON.parse(artifact.content);
    check(
      'Source identity and result schema',
      result.schemaVersion === 1 &&
        result.kind === 'energy-balance' &&
        result.sourceSha256 === (await sha256(json(energySource))) &&
        result.productionApproved === false &&
        result.settlementApproved === false
    );
    check(
      'Complete, unique rows',
      Array.isArray(result.rows) &&
        result.rows.length === energySource.rows.length &&
        new Set(result.rows.map((r) => r.id)).size === energySource.rows.length
    );
    let generated = 0n,
      consumed = 0n;
    const deficits = [];
    // Recompute from the original inputs, not from creator summaries or candidate totals.
    for (const source of energySource.rows) {
      const row = result.rows.find((r) => r.id === source.id);
      const g = BigInt(source.generatedKwh),
        c = BigInt(source.consumedKwh);
      check(`Exact balance: ${source.id}`, row && row.netKwh === String(g - c));
      generated += g;
      consumed += c;
      if (c > g) deficits.push(source.id);
    }
    check(
      'Total and deficit set are correct',
      result.summary?.netKwh === String(generated - consumed) &&
        JSON.stringify(result.summary?.deficits) === JSON.stringify(deficits)
    );
    return {
      accepted: true,
      checks,
      artifactSha256: artifact.sha256,
      independentReview: 'required',
      provenance: 'not authenticated by this checker',
      productionApproved: false,
      settlementApproved: false,
    };
  } catch {
    if (checks.every((check) => check.passed))
      checks.push({ label: 'Evidence schema is valid', passed: false });
    return {
      accepted: false,
      checks,
      independentReview: 'required',
      provenance: 'not authenticated by this checker',
      productionApproved: false,
      settlementApproved: false,
    };
  }
}
