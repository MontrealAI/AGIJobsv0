import { readFile, stat } from "fs/promises";
import path from "path";
import { createHash } from "crypto";

interface ManifestEntry {
  path: string;
  sha256: string;
}

interface Manifest {
  generatedAt: string;
  files: ManifestEntry[];
}

interface RecapContractAddresses {
  novaSeed: string;
  foresightExchange: string;
  settlementToken: string;
}

interface RecapMintedScenario {
  sector: string;
  ruptureYear: number;
  thesis: string;
  confidence: number;
  forecastValue: string;
  sealedURI: string;
  fusionURI: string;
}

interface RecapSaleRecord {
  buyer: string;
  price: string;
  fee: string;
  netPayout: string;
  transactionHash: string;
}

interface RecapMintedEntry {
  tokenId: string;
  status: string;
  fusionRevealed: boolean;
  onchainVerified: boolean;
  scenario: RecapMintedScenario;
  mintedBy: string;
  mintedTo: string;
  finalCustodian: string;
  ownerActions: string[];
  listingPrice?: string;
  sale?: RecapSaleRecord;
  fusionURI: string;
  disruptionTimestamp: string;
}

interface RecapStats {
  minted: number;
  mintedByOwner: number;
  mintedByDelegates: number;
  sold: number;
  listed: number;
  forceDelisted: number;
  sealed: number;
  revealed: number;
  averageConfidencePercent: number;
  capabilityIndexPercent: number;
  confidenceFloorPercent: number;
  confidencePeakPercent: number;
  forecastValueTrillions: number;
  telemetryEntries: number;
}

interface TelemetryEntry {
  agent: string;
  message: string;
  timestamp: string;
}

interface RecapFile {
  generatedAt: string;
  network: { chainId: string; name: string };
  contracts: RecapContractAddresses;
  scenarioSource: { path: string; sha256: string };
  operator: string;
  oracle: string;
  systemPause: string;
  treasury: string;
  feeBps: number;
  stats?: RecapStats;
  minted: RecapMintedEntry[];
  telemetry: TelemetryEntry[];
}

const baseDir = path.join(__dirname, "..");
const reportsDir = path.join(baseDir, "reports");
const manifestPath = path.join(reportsDir, "insight-manifest.json");
const recapPath = path.join(reportsDir, "insight-recap.json");
const markdownPath = path.join(reportsDir, "insight-report.md");
const htmlPath = path.join(reportsDir, "insight-report.html");
const matrixPath = path.join(reportsDir, "insight-control-matrix.json");
const mermaidSuperintelligencePath = path.join(reportsDir, "insight-superintelligence.mmd");
const mermaidControlMapPath = path.join(reportsDir, "insight-control-map.mmd");
const mermaidGovernancePath = path.join(reportsDir, "insight-governance.mmd");
const mermaidConstellationPath = path.join(reportsDir, "insight-constellation.mmd");
const mermaidLifecyclePath = path.join(reportsDir, "insight-lifecycle.mmd");
const telemetryPath = path.join(reportsDir, "insight-telemetry.log");
const ownerBriefPath = path.join(reportsDir, "insight-owner-brief.md");
const csvPath = path.join(reportsDir, "insight-market-matrix.csv");

function hashBuffer(buffer: Buffer): string {
  const hash = createHash("sha256");
  hash.update(buffer);
  return hash.digest("hex");
}

async function ensureExists(targetPath: string, label: string) {
  try {
    await stat(targetPath);
  } catch (error) {
    throw new Error(`${label} not found at ${path.relative(baseDir, targetPath)}`);
  }
}

function parseForecastValueTrillions(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*([TtMmBb]?)$/);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2]?.toUpperCase() ?? "";
  switch (unit) {
    case "T":
      return amount;
    case "B":
      return amount / 1000;
    case "M":
      return amount / 1_000_000;
    default:
      return amount;
  }
}

function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function shortenAddress(address: string, prefix = 6, suffix = 4): string {
  if (!address || address.length <= prefix + suffix + 1) {
    return address;
  }
  return `${address.slice(0, prefix)}…${address.slice(-suffix)}`;
}

function expectedMarketState(entry: RecapMintedEntry): string {
  if (entry.sale) {
    return `${entry.sale.price} AIC → ${entry.sale.netPayout} AIC`;
  }
  if (entry.status === "LISTED") {
    return entry.listingPrice ? `Listed @ ${entry.listingPrice} AIC` : "Listed";
  }
  if (entry.status === "FORCE_DELISTED") {
    return `Force delisted → ${shortenAddress(entry.finalCustodian)}`;
  }
  return "Held";
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function assertWithinTolerance(value: number, expected: number, tolerance: number, label: string) {
  if (Number.isNaN(value) || Number.isNaN(expected)) {
    throw new Error(`${label} comparison received NaN values.`);
  }
  const delta = Math.abs(value - expected);
  if (delta > tolerance) {
    throw new Error(`${label} mismatch – expected ${expected}, received ${value} (delta ${delta} > ${tolerance}).`);
  }
}

async function loadManifest(): Promise<Manifest> {
  await ensureExists(manifestPath, "Manifest");
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error("Manifest structure invalid – expected `files` array.");
  }
  return parsed;
}

async function verifyManifest(manifest: Manifest) {
  const requiredFiles = [
    path.relative(baseDir, recapPath).replace(/\\/g, "/"),
    path.relative(baseDir, markdownPath).replace(/\\/g, "/"),
    path.relative(baseDir, htmlPath).replace(/\\/g, "/"),
    path.relative(baseDir, matrixPath).replace(/\\/g, "/"),
    path.relative(baseDir, mermaidSuperintelligencePath).replace(/\\/g, "/"),
    path.relative(baseDir, mermaidControlMapPath).replace(/\\/g, "/"),
    path.relative(baseDir, mermaidLifecyclePath).replace(/\\/g, "/"),
    path.relative(baseDir, telemetryPath).replace(/\\/g, "/"),
    path.relative(baseDir, ownerBriefPath).replace(/\\/g, "/"),
    path.relative(baseDir, csvPath).replace(/\\/g, "/"),
  ];

  const missingRequired = requiredFiles.filter(
    (file) => !manifest.files.some((entry) => entry.path === file)
  );
  if (missingRequired.length > 0) {
    throw new Error(`Manifest missing required artefacts: ${missingRequired.join(", ")}`);
  }

  for (const entry of manifest.files) {
    const resolved = path.resolve(baseDir, entry.path);
    if (!resolved.startsWith(baseDir)) {
      throw new Error(`Manifest entry escapes demo directory: ${entry.path}`);
    }
    await ensureExists(resolved, `Manifest entry ${entry.path}`);
    const buffer = await readFile(resolved);
    const computedHash = hashBuffer(buffer);
    if (computedHash !== entry.sha256) {
      throw new Error(`Hash mismatch for ${entry.path} – expected ${entry.sha256}, got ${computedHash}`);
    }
  }
}

async function verifyRecap(): Promise<RecapFile> {
  await ensureExists(recapPath, "Recap dossier");
  const raw = await readFile(recapPath, "utf8");
  const recap = JSON.parse(raw) as RecapFile;
  if (!recap.contracts?.novaSeed || !recap.contracts.foresightExchange || !recap.contracts.settlementToken) {
    throw new Error("Recap dossier missing contract addresses.");
  }
  if (!Array.isArray(recap.minted) || recap.minted.length < 3) {
    throw new Error("Recap dossier expected at least three minted insights.");
  }
  for (const minted of recap.minted) {
    if (!minted.onchainVerified) {
      throw new Error(`Minted token ${minted.tokenId} missing on-chain verification flag.`);
    }
  }
  if (!Array.isArray(recap.telemetry) || recap.telemetry.length === 0) {
    throw new Error("Recap telemetry is empty.");
  }
  return recap;
}

function validateRecapStats(recap: RecapFile) {
  if (!recap.stats) {
    throw new Error("Recap stats block missing.");
  }
  const stats = recap.stats;
  const minted = recap.minted;
  if (stats.minted !== minted.length) {
    throw new Error(`Recap stats minted count mismatch: expected ${minted.length}, found ${stats.minted}.`);
  }
  const operatorLower = recap.operator?.toLowerCase?.() ?? "";
  const mintedByOwner = minted.filter((entry) => entry.mintedBy?.toLowerCase() === operatorLower).length;
  const mintedByDelegates = minted.length - mintedByOwner;
  if (stats.mintedByOwner !== mintedByOwner) {
    throw new Error(`Recap stats mintedByOwner mismatch: expected ${mintedByOwner}, found ${stats.mintedByOwner}.`);
  }
  if (stats.mintedByDelegates !== mintedByDelegates) {
    throw new Error(`Recap stats mintedByDelegates mismatch: expected ${mintedByDelegates}, found ${stats.mintedByDelegates}.`);
  }
  const soldCount = minted.filter((entry) => entry.status === "SOLD").length;
  const listedCount = minted.filter((entry) => entry.status === "LISTED").length;
  const forceDelistedCount = minted.filter((entry) => entry.status === "FORCE_DELISTED").length;
  const sealedCount = minted.filter((entry) => !entry.fusionRevealed).length;
  const revealedCount = minted.filter((entry) => entry.fusionRevealed).length;

  if (stats.sold !== soldCount) {
    throw new Error(`Recap stats sold mismatch: expected ${soldCount}, found ${stats.sold}.`);
  }
  if (stats.listed !== listedCount) {
    throw new Error(`Recap stats listed mismatch: expected ${listedCount}, found ${stats.listed}.`);
  }
  if (stats.forceDelisted !== forceDelistedCount) {
    throw new Error(`Recap stats forceDelisted mismatch: expected ${forceDelistedCount}, found ${stats.forceDelisted}.`);
  }
  if (stats.sealed !== sealedCount) {
    throw new Error(`Recap stats sealed mismatch: expected ${sealedCount}, found ${stats.sealed}.`);
  }
  if (stats.revealed !== revealedCount) {
    throw new Error(`Recap stats revealed mismatch: expected ${revealedCount}, found ${stats.revealed}.`);
  }
  if (stats.sealed + stats.revealed !== minted.length) {
    throw new Error("Recap stats sealed/revealed counts do not total minted count.");
  }

  const totalConfidence = minted.reduce((acc, entry) => acc + (entry.scenario?.confidence ?? 0), 0);
  const averageConfidence = minted.length ? totalConfidence / minted.length : 0;
  const peakConfidence = minted.reduce(
    (acc, entry) => Math.max(acc, entry.scenario?.confidence ?? 0),
    minted.length ? minted[0].scenario?.confidence ?? 0 : 0,
  );
  const floorConfidence = minted.reduce(
    (acc, entry) => Math.min(acc, entry.scenario?.confidence ?? 0),
    minted.length ? minted[0].scenario?.confidence ?? 0 : 0,
  );
  const capabilityIndex = averageConfidence * 0.6 + peakConfidence * 0.4;

  assertWithinTolerance(stats.averageConfidencePercent, Number((averageConfidence * 100).toFixed(2)), 0.15, "Average confidence percent");
  assertWithinTolerance(stats.capabilityIndexPercent, Number((capabilityIndex * 100).toFixed(2)), 0.2, "Capability index percent");
  assertWithinTolerance(stats.confidencePeakPercent, Number((peakConfidence * 100).toFixed(2)), 0.15, "Peak confidence percent");
  assertWithinTolerance(stats.confidenceFloorPercent, Number((floorConfidence * 100).toFixed(2)), 0.2, "Floor confidence percent");

  const forecastTotal = minted.reduce(
    (acc, entry) => acc + parseForecastValueTrillions(entry.scenario?.forecastValue ?? "0"),
    0,
  );
  assertWithinTolerance(stats.forecastValueTrillions, Number(forecastTotal.toFixed(2)), 0.2, "Forecast value trillions");

  if (stats.telemetryEntries !== recap.telemetry.length) {
    throw new Error(
      `Recap stats telemetryEntries mismatch: expected ${recap.telemetry.length}, found ${stats.telemetryEntries}.`,
    );
  }
}

async function verifyOwnerBrief(minted: RecapMintedEntry[], stats: RecapStats) {
  await ensureExists(ownerBriefPath, "Owner brief");
  const content = await readFile(ownerBriefPath, "utf8");
  const requiredSections = [
    "# α-AGI Insight MARK – Owner Command Brief",
    "## Rapid Command Checklist",
    "## Sector Timeline",
    "## Intelligence Signals",
  ];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      throw new Error(`Owner brief missing section: ${section}`);
    }
  }
  const mintedLine = content
    .split(/\r?\n/)
    .find((line) => line.includes("Minted Nova-Seeds:"));
  if (!mintedLine) {
    throw new Error("Owner brief missing Minted Nova-Seeds line.");
  }
  if (!mintedLine.includes(String(stats.minted))) {
    throw new Error("Owner brief minted count does not match stats block.");
  }
  const marketLine = content
    .split(/\r?\n/)
    .find((line) => line.includes("Live market activity:"));
  if (!marketLine) {
    throw new Error("Owner brief missing Live market activity line.");
  }
  if (!marketLine.includes(`${stats.sold}`) || !marketLine.includes(`${stats.listed}`) || !marketLine.includes(`${stats.forceDelisted}`)) {
    throw new Error("Owner brief market activity line does not match stats block.");
  }

  const tableRows = content
    .split(/\r?\n/)
    .filter((line) => line.startsWith("| #"));
  if (tableRows.length !== minted.length) {
    throw new Error(`Owner brief table expected ${minted.length} rows, found ${tableRows.length}.`);
  }
  for (const entry of minted) {
    const row = tableRows.find((line) => line.includes(`#${entry.tokenId}`));
    if (!row) {
      throw new Error(`Owner brief table missing token ${entry.tokenId}.`);
    }
    if (!row.includes(entry.scenario.sector)) {
      throw new Error(`Owner brief row for token ${entry.tokenId} missing sector ${entry.scenario.sector}.`);
    }
  }
}

async function verifyCsv(minted: RecapMintedEntry[]) {
  await ensureExists(csvPath, "Market matrix CSV");
  const content = await readFile(csvPath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < minted.length + 1) {
    throw new Error("Market matrix CSV has fewer rows than minted entries.");
  }
  const header = splitCsvLine(lines[0]);
  const expectedHeader = [
    "tokenId",
    "sector",
    "ruptureYear",
    "confidence",
    "status",
    "marketState",
    "custodian",
    "mintedTo",
    "mintedBy",
    "fusionURI",
    "sealedURI",
    "disruptionTimestamp",
    "forecastValue",
    "ownerActions",
  ];
  if (header.join(",") !== expectedHeader.join(",")) {
    throw new Error("Market matrix CSV header mismatch.");
  }
  const records = new Map<string, Record<string, string>>();
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    if (values.length !== header.length) {
      throw new Error(`CSV row has unexpected column count: ${line}`);
    }
    const record: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) {
      record[header[i]] = values[i];
    }
    if (records.has(record.tokenId)) {
      throw new Error(`Duplicate token ${record.tokenId} detected in CSV.`);
    }
    records.set(record.tokenId, record);
  }
  if (records.size !== minted.length) {
    throw new Error(`CSV records (${records.size}) do not match minted count (${minted.length}).`);
  }
  for (const entry of minted) {
    const record = records.get(entry.tokenId);
    if (!record) {
      throw new Error(`CSV missing record for token ${entry.tokenId}.`);
    }
    if (record.status !== entry.status) {
      throw new Error(`CSV status mismatch for token ${entry.tokenId}.`);
    }
    if (record.fusionURI !== entry.fusionURI) {
      throw new Error(`CSV fusionURI mismatch for token ${entry.tokenId}.`);
    }
    if (record.sealedURI !== entry.scenario.sealedURI) {
      throw new Error(`CSV sealedURI mismatch for token ${entry.tokenId}.`);
    }
    if (record.disruptionTimestamp !== entry.disruptionTimestamp) {
      throw new Error(`CSV disruptionTimestamp mismatch for token ${entry.tokenId}.`);
    }
    if (record.forecastValue !== entry.scenario.forecastValue) {
      throw new Error(`CSV forecastValue mismatch for token ${entry.tokenId}.`);
    }
    const expectedConfidence = formatPercent(entry.scenario.confidence);
    if (record.confidence !== expectedConfidence) {
      throw new Error(`CSV confidence mismatch for token ${entry.tokenId}: expected ${expectedConfidence}, got ${record.confidence}.`);
    }
    const expectedCustodian = shortenAddress(entry.finalCustodian);
    if (record.custodian !== expectedCustodian) {
      throw new Error(`CSV custodian mismatch for token ${entry.tokenId}.`);
    }
    const expectedMintedTo = shortenAddress(entry.mintedTo);
    const expectedMintedBy = shortenAddress(entry.mintedBy);
    if (record.mintedTo !== expectedMintedTo) {
      throw new Error(`CSV mintedTo mismatch for token ${entry.tokenId}.`);
    }
    if (record.mintedBy !== expectedMintedBy) {
      throw new Error(`CSV mintedBy mismatch for token ${entry.tokenId}.`);
    }
    const expectedState = expectedMarketState(entry);
    if (record.marketState !== expectedState) {
      throw new Error(`CSV marketState mismatch for token ${entry.tokenId}.`);
    }
    const expectedOwnerActions = entry.ownerActions.join("; ");
    if (record.ownerActions !== expectedOwnerActions) {
      throw new Error(`CSV ownerActions mismatch for token ${entry.tokenId}.`);
    }
  }
}

async function verifyTelemetry(expected: TelemetryEntry[]) {
  await ensureExists(telemetryPath, "Telemetry log");
  const content = await readFile(telemetryPath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length !== expected.length) {
    throw new Error(`Telemetry log length mismatch: expected ${expected.length} entries, found ${lines.length}.`);
  }
  const requiredAgents = ["Meta-Sentinel", "Thermodynamic Oracle", "Guardian Auditor"];
  for (const agent of requiredAgents) {
    if (!lines.some((line) => line.includes(`[${agent}]`))) {
      throw new Error(`Telemetry log missing agent transcript for ${agent}.`);
    }
  }
}

async function verifyMarkdown() {
  await ensureExists(markdownPath, "Markdown report");
  const content = await readFile(markdownPath, "utf8");
  const requiredSections = [
    "# α-AGI Insight MARK Recap",
    "## Superintelligent Engine Summary",
    "## Operational Command Metrics",
    "## Owner Command Hooks",
    "## Telemetry Snapshot",
  ];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      throw new Error(`Markdown report missing section: ${section}`);
    }
  }
}

async function verifyHtml() {
  await ensureExists(htmlPath, "Executive HTML report");
  const content = await readFile(htmlPath, "utf8");
  const snippets = [
    "α-AGI Insight MARK Executive Report",
    "Superintelligent Engine Pulse",
    "Operational Command Metrics",
    "Disruption Timeline",
    "Nova-Seed Market Matrix",
    "Owner Command Hooks",
  ];
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      throw new Error(`Executive HTML report missing snippet: ${snippet}`);
    }
  }
}

async function verifyControlMatrix() {
  await ensureExists(matrixPath, "Control matrix");
  const content = await readFile(matrixPath, "utf8");
  const parsed = JSON.parse(content) as { contracts?: Array<{ name: string }> };
  const expectedNames = ["InsightAccessToken", "AlphaInsightNovaSeed", "AlphaInsightExchange"];
  const contracts = parsed.contracts ?? [];
  for (const name of expectedNames) {
    if (!contracts.some((entry) => entry.name === name)) {
      throw new Error(`Control matrix missing contract entry: ${name}`);
    }
  }
}

async function verifyMermaidFiles(minted: RecapMintedEntry[]) {
  await ensureExists(mermaidSuperintelligencePath, "Superintelligence mermaid");
  await ensureExists(mermaidGovernancePath, "Governance mermaid");
  await ensureExists(mermaidConstellationPath, "Constellation mermaid");
  await ensureExists(mermaidControlMapPath, "Control map mermaid");
  await ensureExists(mermaidLifecyclePath, "Lifecycle mermaid");

  const superintelligence = await readFile(mermaidSuperintelligencePath, "utf8");
  const governance = await readFile(mermaidGovernancePath, "utf8");
  const constellation = await readFile(mermaidConstellationPath, "utf8");
  const controlMap = await readFile(mermaidControlMapPath, "utf8");
  const lifecycle = await readFile(mermaidLifecyclePath, "utf8");

  const superTokens = ["Meta-Agentic Tree Search", "Thermodynamic Rupture Trigger", "AGI Capability Index"];
  for (const token of superTokens) {
    if (!superintelligence.includes(token)) {
      throw new Error(`Superintelligence mermaid missing token: ${token}`);
    }
  }

  if (!governance.includes("System Pause Sentinel")) {
    throw new Error("Governance mermaid missing sentinel reference.");
  }
  if (!controlMap.includes("System Pause Sentinel")) {
    throw new Error("Control map mermaid missing sentinel node.");
  }
  const requiredControlNodes = ["Insight Exchange", "Insight Access Token", "α-AGI Nova-Seed"];
  for (const label of requiredControlNodes) {
    if (!controlMap.includes(label)) {
      throw new Error(`Control map mermaid missing ${label} node.`);
    }
  }
  if (!constellation.includes("Insight Exchange")) {
    throw new Error("Constellation mermaid missing Insight Exchange node.");
  }
  if (!constellation.includes("pause sweep")) {
    throw new Error("Constellation mermaid missing pause sweep annotations.");
  }
  const lifecycleTokens = [
    "Meta-Agentic Swarm",
    "α-AGI Nova-Seed Forge",
    "α-AGI MARK Exchange",
    "System Pause Sentinel",
    "Treasury Governance",
  ];
  for (const token of lifecycleTokens) {
    if (!lifecycle.includes(token)) {
      throw new Error(`Lifecycle mermaid missing ${token} participant.`);
    }
  }
  for (const entry of minted) {
    const tokenNode = `token${entry.tokenId}`;
    if (!constellation.includes(tokenNode)) {
      throw new Error(`Constellation mermaid missing node for token ${entry.tokenId}.`);
    }
  }
}

async function main() {
  console.log("🔍 Validating α-AGI Insight MARK dossiers…\n");
  const manifest = await loadManifest();
  console.log("✅ Manifest loaded.");

  await verifyManifest(manifest);
  console.log("✅ Manifest hashes verified.");

  const recap = await verifyRecap();
  console.log(
    `✅ Recap dossier valid – ${recap.minted.length} insights minted on ${recap.network.name} (chainId ${recap.network.chainId}).`
  );

  validateRecapStats(recap);
  console.log("✅ Recap stats block cross-checked against minted ledger.");

  await verifyMarkdown();
  console.log("✅ Markdown executive summary verified.");

  await verifyHtml();
  console.log("✅ Executive HTML dashboard verified.");

  await verifyControlMatrix();
  console.log("✅ Owner control matrix verified.");

  await verifyMermaidFiles(recap.minted);
  console.log("✅ Mermaid schematics verified.");

  if (!recap.stats) {
    throw new Error("Recap stats unexpectedly missing after validation.");
  }

  await verifyOwnerBrief(recap.minted, recap.stats);
  console.log("✅ Owner command brief aligned with minted inventory.");

  await verifyCsv(recap.minted);
  console.log("✅ Market matrix CSV synchronised with minted ledger.");

  await verifyTelemetry(recap.telemetry);
  console.log("✅ Telemetry log matches orchestrator transcript.");

  console.log("\n🎖️ All α-AGI Insight MARK dossiers passed verification.");
}

main().catch((error) => {
  console.error(`❌ Verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
