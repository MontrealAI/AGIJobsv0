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
  confidenceBps?: number;
  confidenceDecimal?: number;
  confidencePercent?: number;
  forecastValue?: string;
  mintTxHash?: string;
  listingTxHash?: string | null;
  repricingTxHashes?: string[];
  forceDelistTxHash?: string | null;
  resolutionTxHash?: string | null;
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

interface LedgerMintEntry {
  tokenId: string;
  sector: string;
  status: string;
  mintedBy: string;
  mintedTo: string;
  finalCustodian: string;
  mintTxHash: string;
  listingTxHash?: string | null;
  repricingTxHashes?: string[];
  saleTxHash?: string | null;
  forceDelistTxHash?: string | null;
  resolutionTxHash?: string | null;
  listingPrice?: string | null;
  sale?: RecapSaleRecord | null;
  ownerActions?: string[];
  fusion?: {
    revealed: boolean;
    uri: string;
    sealedURI?: string;
  };
  disruptionTimestamp: string;
  confidenceBps: number;
  confidencePercent: number;
  forecastValue: string;
}

interface LedgerFile {
  generatedAt: string;
  network: { chainId: string; name: string };
  contracts: RecapContractAddresses;
  scenario: { path: string; sha256: string };
  stats?: RecapStats;
  feeBps?: number;
  treasury?: string;
  minted: LedgerMintEntry[];
  sentinelPause: Array<{ contract: string; address: string; hash: string }>;
  ownerResume: Array<{ contract: string; address: string; hash: string }>;
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
const mermaidAgencyOrbitPath = path.join(reportsDir, "insight-agency-orbit.mmd");
const mermaidLifecyclePath = path.join(reportsDir, "insight-lifecycle.mmd");
const telemetryPath = path.join(reportsDir, "insight-telemetry.log");
const ownerBriefPath = path.join(reportsDir, "insight-owner-brief.md");
const safetyChecklistPath = path.join(reportsDir, "insight-safety-checklist.md");
const csvPath = path.join(reportsDir, "insight-market-matrix.csv");
const ledgerPath = path.join(reportsDir, "insight-ledger.json");

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

function formatTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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

function entryConfidenceBps(entry: RecapMintedEntry): number {
  if (typeof entry.confidenceBps === "number") {
    return entry.confidenceBps;
  }
  const scenarioConfidence = entry.scenario?.confidence ?? 0;
  return Math.round(scenarioConfidence * 10_000);
}

function entryConfidenceDecimal(entry: RecapMintedEntry): number {
  return entryConfidenceBps(entry) / 10_000;
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
    path.relative(baseDir, mermaidAgencyOrbitPath).replace(/\\/g, "/"),
    path.relative(baseDir, mermaidLifecyclePath).replace(/\\/g, "/"),
    path.relative(baseDir, telemetryPath).replace(/\\/g, "/"),
    path.relative(baseDir, ownerBriefPath).replace(/\\/g, "/"),
    path.relative(baseDir, safetyChecklistPath).replace(/\\/g, "/"),
    path.relative(baseDir, csvPath).replace(/\\/g, "/"),
    path.relative(baseDir, ledgerPath).replace(/\\/g, "/"),
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

  const totalConfidenceDecimal = minted.reduce((acc, entry) => acc + entryConfidenceDecimal(entry), 0);
  const averageConfidence = minted.length ? totalConfidenceDecimal / minted.length : 0;
  const peakConfidence = minted.reduce(
    (acc, entry) => Math.max(acc, entryConfidenceDecimal(entry)),
    minted.length ? entryConfidenceDecimal(minted[0]) : 0,
  );
  const floorConfidence = minted.reduce(
    (acc, entry) => Math.min(acc, entryConfidenceDecimal(entry)),
    minted.length ? entryConfidenceDecimal(minted[0]) : 0,
  );
  const capabilityIndex = averageConfidence * 0.6 + peakConfidence * 0.4;

  assertWithinTolerance(stats.averageConfidencePercent, Number((averageConfidence * 100).toFixed(2)), 0.15, "Average confidence percent");
  assertWithinTolerance(stats.capabilityIndexPercent, Number((capabilityIndex * 100).toFixed(2)), 0.2, "Capability index percent");
  assertWithinTolerance(stats.confidencePeakPercent, Number((peakConfidence * 100).toFixed(2)), 0.15, "Peak confidence percent");
  assertWithinTolerance(stats.confidenceFloorPercent, Number((floorConfidence * 100).toFixed(2)), 0.2, "Floor confidence percent");

  for (const entry of minted) {
    const scenarioConfidenceBps = Math.round((entry.scenario?.confidence ?? 0) * 10_000);
    if (entryConfidenceBps(entry) !== scenarioConfidenceBps) {
      throw new Error(`Confidence basis points mismatch for recap token ${entry.tokenId}.`);
    }
    const scenarioForecast = entry.scenario?.forecastValue ?? "";
    if (!entry.forecastValue) {
      throw new Error(`Forecast value missing for recap token ${entry.tokenId}.`);
    }
    if (scenarioForecast && entry.forecastValue !== scenarioForecast) {
      throw new Error(`Forecast value divergence for recap token ${entry.tokenId}.`);
    }
  }

  const forecastTotal = minted.reduce(
    (acc, entry) =>
      acc + parseForecastValueTrillions(entry.forecastValue ?? entry.scenario?.forecastValue ?? "0"),
    0,
  );
  assertWithinTolerance(stats.forecastValueTrillions, Number(forecastTotal.toFixed(2)), 0.2, "Forecast value trillions");

  if (stats.telemetryEntries !== recap.telemetry.length) {
    throw new Error(
      `Recap stats telemetryEntries mismatch: expected ${recap.telemetry.length}, found ${stats.telemetryEntries}.`,
    );
  }
}

function addressesEqual(a?: string, b?: string): boolean {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

async function verifyLedger(recap: RecapFile): Promise<LedgerFile> {
  await ensureExists(ledgerPath, "Ledger dataset");
  const raw = await readFile(ledgerPath, "utf8");
  const ledger = JSON.parse(raw) as LedgerFile;

  if (!ledger || !Array.isArray(ledger.minted)) {
    throw new Error("Ledger structure invalid – expected minted array.");
  }
  if (ledger.minted.length !== recap.minted.length) {
    throw new Error(
      `Ledger minted count mismatch: expected ${recap.minted.length}, found ${ledger.minted.length}.`,
    );
  }

  if (!Array.isArray(ledger.sentinelPause) || !Array.isArray(ledger.ownerResume)) {
    throw new Error("Ledger missing sentinelPause/ownerResume arrays.");
  }

  if (!ledger.scenario || ledger.scenario.path !== recap.scenarioSource.path) {
    throw new Error("Ledger scenario path mismatch compared to recap.");
  }
  if (!ledger.scenario || ledger.scenario.sha256 !== recap.scenarioSource.sha256) {
    throw new Error("Ledger scenario hash mismatch compared to recap.");
  }

  if (typeof ledger.feeBps === "number" && ledger.feeBps !== recap.feeBps) {
    throw new Error(`Ledger feeBps (${ledger.feeBps}) does not match recap feeBps (${recap.feeBps}).`);
  }
  if (ledger.treasury && !addressesEqual(ledger.treasury, recap.treasury)) {
    throw new Error("Ledger treasury address does not match recap treasury.");
  }

  const recapByToken = new Map(recap.minted.map((entry) => [entry.tokenId, entry]));
  for (const entry of ledger.minted) {
    const recapEntry = recapByToken.get(entry.tokenId);
    if (!recapEntry) {
      throw new Error(`Ledger references unknown token ${entry.tokenId}.`);
    }
    if (!entry.mintTxHash || entry.mintTxHash.length < 10) {
      throw new Error(`Ledger mintTxHash missing or invalid for token ${entry.tokenId}.`);
    }
    if (!addressesEqual(entry.mintedBy, recapEntry.mintedBy)) {
      throw new Error(`Ledger mintedBy mismatch for token ${entry.tokenId}.`);
    }
    if (!addressesEqual(entry.mintedTo, recapEntry.mintedTo)) {
      throw new Error(`Ledger mintedTo mismatch for token ${entry.tokenId}.`);
    }
    if (!addressesEqual(entry.finalCustodian, recapEntry.finalCustodian)) {
      throw new Error(`Ledger finalCustodian mismatch for token ${entry.tokenId}.`);
    }
    if (entry.status !== recapEntry.status) {
      throw new Error(`Ledger status mismatch for token ${entry.tokenId}.`);
    }
    if (entry.confidenceBps !== entryConfidenceBps(recapEntry)) {
      throw new Error(`Ledger confidenceBps mismatch for token ${entry.tokenId}.`);
    }
    if (entry.confidencePercent !== Math.round(entryConfidenceDecimal(recapEntry) * 10000) / 100) {
      throw new Error(`Ledger confidencePercent mismatch for token ${entry.tokenId}.`);
    }
    if (entry.forecastValue !== (recapEntry.forecastValue ?? recapEntry.scenario?.forecastValue ?? "")) {
      throw new Error(`Ledger forecastValue mismatch for token ${entry.tokenId}.`);
    }
    if (recapEntry.status !== "HELD" && (!entry.listingTxHash || entry.listingTxHash.length < 10)) {
      throw new Error(`Ledger missing listingTxHash for active market token ${entry.tokenId}.`);
    }
    const repricingNotes = (recapEntry.ownerActions ?? []).filter((action) =>
      action.toLowerCase().includes("repriced"),
    ).length;
    const repricingHashes = entry.repricingTxHashes ?? [];
    if (repricingHashes.length < repricingNotes) {
      throw new Error(
        `Ledger repricingTxHashes count ${repricingHashes.length} lower than repricing actions ${repricingNotes} for token ${entry.tokenId}.`,
      );
    }
    const ledgerSaleHash = entry.sale?.transactionHash ?? entry.saleTxHash ?? null;
    const recapSaleHash = recapEntry.sale?.transactionHash ?? null;
    if (ledgerSaleHash || recapSaleHash) {
      if (!ledgerSaleHash || !recapSaleHash || ledgerSaleHash !== recapSaleHash) {
        throw new Error(`Ledger sale hash mismatch for token ${entry.tokenId}.`);
      }
    }
    if (recapEntry.sale && entry.sale) {
      if (entry.sale.price !== recapEntry.sale.price || entry.sale.netPayout !== recapEntry.sale.netPayout) {
        throw new Error(`Ledger sale details mismatch for token ${entry.tokenId}.`);
      }
    } else if (!!recapEntry.sale !== !!entry.sale) {
      throw new Error(`Ledger sale presence mismatch for token ${entry.tokenId}.`);
    }
    if (recapEntry.status === "FORCE_DELISTED" && (!entry.forceDelistTxHash || entry.forceDelistTxHash.length < 10)) {
      throw new Error(`Ledger missing forceDelistTxHash for token ${entry.tokenId}.`);
    }
    if (recapEntry.status === "SOLD" && (!entry.resolutionTxHash || entry.resolutionTxHash.length < 10)) {
      throw new Error(`Ledger missing resolutionTxHash for sold token ${entry.tokenId}.`);
    }
    if (entry.fusion) {
      if (entry.fusion.revealed !== recapEntry.fusionRevealed) {
        throw new Error(`Ledger fusion.revealed mismatch for token ${entry.tokenId}.`);
      }
      if (entry.fusion.uri !== recapEntry.fusionURI) {
        throw new Error(`Ledger fusion.uri mismatch for token ${entry.tokenId}.`);
      }
    }
  }

  const requiredPauseContracts = [
    { name: "AlphaInsightExchange", address: recap.contracts.foresightExchange },
    { name: "AlphaInsightNovaSeed", address: recap.contracts.novaSeed },
    { name: "InsightAccessToken", address: recap.contracts.settlementToken },
  ];

  if (ledger.sentinelPause.length < requiredPauseContracts.length) {
    throw new Error("Ledger sentinelPause section missing entries for pause drill.");
  }
  for (const contract of requiredPauseContracts) {
    const pauseRecord = ledger.sentinelPause.find(
      (entry) => entry.contract === contract.name && addressesEqual(entry.address, contract.address),
    );
    if (!pauseRecord || !pauseRecord.hash || pauseRecord.hash.length < 10) {
      throw new Error(`Ledger missing sentinel pause transaction for ${contract.name}.`);
    }
    const resumeRecord = ledger.ownerResume.find(
      (entry) => entry.contract === contract.name && addressesEqual(entry.address, contract.address),
    );
    if (!resumeRecord || !resumeRecord.hash || resumeRecord.hash.length < 10) {
      throw new Error(`Ledger missing owner resume transaction for ${contract.name}.`);
    }
  }

  return ledger;
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

async function verifySafetyChecklist(recap: RecapFile) {
  await ensureExists(safetyChecklistPath, "Safety checklist");
  const content = await readFile(safetyChecklistPath, "utf8");
  const requiredSections = [
    "# α-AGI Insight MARK – Safety & Control Checklist",
    "## Contract Command Matrix",
    "## Sentinel Drills",
    "## Parameter Overrides",
    "## Integrity Assertions",
  ];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      throw new Error(`Safety checklist missing section: ${section}`);
    }
  }

  const lines = content.split(/\r?\n/);
  const tableRows = lines.filter(
    (line) => line.startsWith("| ") && !line.startsWith("| Contract ") && !line.startsWith("| ---")
  );
  const expectedContracts = [
    { name: "InsightAccessToken", address: recap.contracts.settlementToken },
    { name: "AlphaInsightNovaSeed", address: recap.contracts.novaSeed },
    { name: "AlphaInsightExchange", address: recap.contracts.foresightExchange },
  ];
  if (tableRows.length !== expectedContracts.length) {
    throw new Error(
      `Safety checklist expected ${expectedContracts.length} contract rows, found ${tableRows.length}.`
    );
  }
  for (const contract of expectedContracts) {
    const row = tableRows.find((line) => line.includes(`| ${contract.name} |`));
    if (!row) {
      throw new Error(`Safety checklist table missing contract ${contract.name}.`);
    }
    if (!row.includes(contract.address)) {
      throw new Error(`Safety checklist row for ${contract.name} missing address ${contract.address}.`);
    }
  }

  const addressTokens = [
    recap.operator,
    recap.oracle,
    recap.systemPause,
    recap.treasury,
    recap.contracts.novaSeed,
    recap.contracts.foresightExchange,
    recap.contracts.settlementToken,
  ];
  for (const token of addressTokens) {
    if (!content.includes(token)) {
      throw new Error(`Safety checklist missing critical address ${token}.`);
    }
  }

  if (!recap.stats) {
    throw new Error("Safety checklist validation requires stats block.");
  }
  const stats = recap.stats;
  const mintedLine = `Nova-Seeds minted: ${stats.minted} (owner ${stats.mintedByOwner}, delegates ${stats.mintedByDelegates}).`;
  const marketLine = `Market custody positions: ${stats.sold} sold • ${stats.listed} listed • ${stats.forceDelisted} sentinel custody.`;
  const fusionLine = `Fusion dossiers: ${stats.revealed} revealed • ${stats.sealed} sealed.`;
  const floorSummary = stats.confidenceFloorPercent.toFixed(1);
  const peakSummary = stats.confidencePeakPercent.toFixed(1);
  const capabilitySummary = stats.capabilityIndexPercent.toFixed(1);
  const capabilityLine = `Confidence envelope: floor ${floorSummary}% → peak ${peakSummary}% (capability ${capabilitySummary}%).`;
  const opportunityLine = `Opportunity magnitude: ${stats.forecastValueTrillions.toFixed(2)}T.`;
  const scenarioLine = `Scenario dataset sha256 ${recap.scenarioSource.sha256}.`;
  const checklistLines = [mintedLine, marketLine, fusionLine, capabilityLine, opportunityLine, scenarioLine];
  for (const line of checklistLines) {
    if (!content.includes(line)) {
      throw new Error(`Safety checklist missing integrity assertion: ${line}`);
    }
  }

  const treasuryLine = `Exchange treasury routed to \`${recap.treasury}\`; retarget via \`setTreasury(address)\`.`;
  if (!content.includes(treasuryLine)) {
    throw new Error("Safety checklist missing treasury override line.");
  }
  const oracleLine = `Exchange oracle anchored to \`${recap.oracle}\`; rotate via \`setOracle(address)\`.`;
  if (!content.includes(oracleLine)) {
    throw new Error("Safety checklist missing oracle override line.");
  }
  const feePercentDisplay = (recap.feeBps / 100).toFixed(2);
  const feeLine = `- Trading fee configured at ${feePercentDisplay}% (\`${recap.feeBps} bps\`); adjust with \`setFeeBps(uint96)\`.`;
  if (!content.includes(feeLine)) {
    throw new Error("Safety checklist missing fee override line.");
  }
  const tokenLine = `- Settlement token \`${recap.contracts.settlementToken}\` remains owner-mintable and can be rotated with \`setPaymentToken(address)\`.`;
  if (!content.includes(tokenLine)) {
    throw new Error("Safety checklist missing settlement token override line.");
  }
  const sentinelLine = `- System sentinel handshake enforced across modules via \`setSystemPause(address)\` (current \`${recap.systemPause}\`).`;
  if (!content.includes(sentinelLine)) {
    throw new Error("Safety checklist missing sentinel override line.");
  }
  const drillLine = `- Delegated sentinel \`${recap.systemPause}\` executed pause() across Insight Access Token, α-AGI Nova-Seed, and Insight Exchange before owner \`${recap.operator}\` restored operations.`;
  if (!content.includes(drillLine)) {
    throw new Error("Safety checklist missing sentinel drill summary.");
  }
  if (!content.includes("Liquidity reserve minted via `mint(address,uint256)`")) {
    throw new Error("Safety checklist missing liquidity reserve drill line.");
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
    "confidenceBps",
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
    if (record.forecastValue !== (entry.forecastValue ?? entry.scenario.forecastValue)) {
      throw new Error(`CSV forecastValue mismatch for token ${entry.tokenId}.`);
    }
    const expectedConfidence = formatPercent(entryConfidenceDecimal(entry));
    if (record.confidence !== expectedConfidence) {
      throw new Error(`CSV confidence mismatch for token ${entry.tokenId}: expected ${expectedConfidence}, got ${record.confidence}.`);
    }
    const expectedConfidenceBps = entryConfidenceBps(entry).toString();
    if (record.confidenceBps !== expectedConfidenceBps) {
      throw new Error(`CSV confidenceBps mismatch for token ${entry.tokenId}.`);
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
  await ensureExists(mermaidAgencyOrbitPath, "Agency orbit mermaid");
  await ensureExists(mermaidLifecyclePath, "Lifecycle mermaid");

  const superintelligence = await readFile(mermaidSuperintelligencePath, "utf8");
  const governance = await readFile(mermaidGovernancePath, "utf8");
  const constellation = await readFile(mermaidConstellationPath, "utf8");
  const controlMap = await readFile(mermaidControlMapPath, "utf8");
  const agencyOrbit = await readFile(mermaidAgencyOrbitPath, "utf8");
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
  const agentOrbitLabels = [
    "Meta-Agent Constellation",
    "Meta-Sentinel",
    "MATS Engine",
    "Thermodynamic Oracle",
    "FusionSmith",
    "Guardian Auditor",
    "Venture Cartographer",
    "System Sentinel",
    "α-AGI MARK Market Grid",
  ];
  for (const label of agentOrbitLabels) {
    if (!agencyOrbit.includes(label)) {
      throw new Error(`Agency orbit mermaid missing ${label} annotation.`);
    }
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
    const nodeId = `seed${entry.tokenId}`;
    if (!agencyOrbit.includes(nodeId)) {
      throw new Error(`Agency orbit mermaid missing node ${nodeId}.`);
    }
    if (!agencyOrbit.includes(entry.scenario.sector)) {
      throw new Error(`Agency orbit mermaid missing sector label ${entry.scenario.sector}.`);
    }
  }
  for (const entry of minted) {
    const tokenSnippet = `Token #${entry.tokenId}`;
    if (!governance.includes(tokenSnippet)) {
      throw new Error(`Governance mermaid missing token snippet for #${entry.tokenId}.`);
    }
    const mintedShort = shortenAddress(entry.mintedTo);
    if (!governance.includes(mintedShort)) {
      throw new Error(`Governance mermaid missing minted custodian ${mintedShort} for token ${entry.tokenId}.`);
    }
    const finalShort = shortenAddress(entry.finalCustodian);
    if (!governance.includes(finalShort)) {
      throw new Error(`Governance mermaid missing final custodian ${finalShort} for token ${entry.tokenId}.`);
    }
    const statusParts = [formatTitleCase(entry.status)];
    if (entry.sale) {
      statusParts.push(`${entry.sale.price} AIC`);
    }
    for (const snippet of statusParts) {
      if (!governance.includes(snippet)) {
        throw new Error(
          `Governance mermaid missing status snippet "${snippet}" for token ${entry.tokenId}.`,
        );
      }
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

  await verifyLedger(recap);
  console.log("✅ Foresight ledger validated against recap and transaction hashes.");

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

  await verifySafetyChecklist(recap);
  console.log("✅ Safety and control checklist validated.");

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
