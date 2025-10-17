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

interface RecapMintedEntry {
  tokenId: string;
  status: string;
  fusionRevealed: boolean;
  onchainVerified: boolean;
}

interface RecapFile {
  generatedAt: string;
  network: { chainId: string; name: string };
  contracts: RecapContractAddresses;
  scenarioSource: { path: string; sha256: string };
  minted: RecapMintedEntry[];
  telemetry: Array<{ agent: string; message: string; timestamp: string }>;
}

const baseDir = path.join(__dirname, "..");
const reportsDir = path.join(baseDir, "reports");
const manifestPath = path.join(reportsDir, "insight-manifest.json");
const recapPath = path.join(reportsDir, "insight-recap.json");
const markdownPath = path.join(reportsDir, "insight-report.md");
const htmlPath = path.join(reportsDir, "insight-report.html");
const matrixPath = path.join(reportsDir, "insight-control-matrix.json");
const mermaidSuperintelligencePath = path.join(reportsDir, "insight-superintelligence.mmd");
const mermaidGovernancePath = path.join(reportsDir, "insight-governance.mmd");
const mermaidConstellationPath = path.join(reportsDir, "insight-constellation.mmd");
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

async function verifyMarkdown() {
  await ensureExists(markdownPath, "Markdown report");
  const content = await readFile(markdownPath, "utf8");
  const requiredSections = [
    "# α-AGI Insight MARK Recap",
    "## Superintelligent Engine Summary",
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

async function verifyMermaidFiles() {
  await ensureExists(mermaidSuperintelligencePath, "Superintelligence mermaid");
  await ensureExists(mermaidGovernancePath, "Governance mermaid");
  await ensureExists(mermaidConstellationPath, "Constellation mermaid");

  const superintelligence = await readFile(mermaidSuperintelligencePath, "utf8");
  const governance = await readFile(mermaidGovernancePath, "utf8");
  const constellation = await readFile(mermaidConstellationPath, "utf8");

  const superTokens = ["Meta-Agentic Tree Search", "Thermodynamic Rupture Trigger", "AGI Capability Index"];
  for (const token of superTokens) {
    if (!superintelligence.includes(token)) {
      throw new Error(`Superintelligence mermaid missing token: ${token}`);
    }
  }

  if (!governance.includes("System Pause Sentinel")) {
    throw new Error("Governance mermaid missing sentinel reference.");
  }
  if (!constellation.includes("Insight Exchange")) {
    throw new Error("Constellation mermaid missing Insight Exchange node.");
  }
}

async function verifyOperationalFiles() {
  await ensureExists(telemetryPath, "Telemetry log");
  const telemetry = await readFile(telemetryPath, "utf8");
  if (!telemetry.trim()) {
    throw new Error("Telemetry log is empty.");
  }

  await ensureExists(ownerBriefPath, "Owner brief");
  const brief = await readFile(ownerBriefPath, "utf8");
  if (!brief.includes("Owner Command Brief")) {
    throw new Error("Owner brief missing title.");
  }

  await ensureExists(csvPath, "Market matrix CSV");
  const csv = await readFile(csvPath, "utf8");
  if (!csv.split("\n").some((line) => line.trim().startsWith("tokenId")) && !csv.includes("Token")) {
    throw new Error("Market matrix CSV missing header row.");
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

  await verifyMarkdown();
  console.log("✅ Markdown executive summary verified.");

  await verifyHtml();
  console.log("✅ Executive HTML dashboard verified.");

  await verifyControlMatrix();
  console.log("✅ Owner control matrix verified.");

  await verifyMermaidFiles();
  console.log("✅ Mermaid schematics verified.");

  await verifyOperationalFiles();
  console.log("✅ Operational dossiers validated (telemetry, owner brief, CSV).");

  console.log("\n🎖️ All α-AGI Insight MARK dossiers passed verification.");
}

main().catch((error) => {
  console.error(`❌ Verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
