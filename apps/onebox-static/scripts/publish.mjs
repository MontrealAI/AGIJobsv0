#!/usr/bin/env node
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CarReader } from "@ipld/car";
import namehashModule from "eth-ens-namehash";
import { ethers } from "ethers";
import contentHash from "content-hash";
import { packToFs } from "ipfs-car/pack/fs";
import PinataClientModule from "@pinata/sdk";
import { Web3Storage } from "web3.storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const distDir = path.join(appDir, "dist");
const manifestPath = path.join(distDir, "manifest.json");
const configModuleUrl = pathToFileURL(path.join(appDir, "config.mjs"));
const repoRoot = path.resolve(appDir, "..", "..");
const deploymentConfigPath = path.join(
  repoRoot,
  "deployment-config",
  "onebox-static.json",
);
const carOutputPath = path.join(distDir, "onebox.car");

const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--skip-build");
const skipWeb3 = args.has("--skip-web3");
const skipPinata = args.has("--skip-pinata");
const skipEns = args.has("--skip-ens");
const dryRun = args.has("--dry-run");
const skipHealth = args.has("--skip-health");

const MAX_HISTORY_ENTRIES = 20;

const log = (...messages) => console.log("[onebox:publish]", ...messages);

function formatError(message) {
  return new Error(`[onebox:publish] ${message}`);
}

async function runNodeScript(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: appDir,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          formatError(`${scriptName} failed with exit code ${code ?? "unknown"}`),
        );
      }
    });
  });
}

function deriveReleaseLabel() {
  if (process.env.ONEBOX_RELEASE_LABEL) return process.env.ONEBOX_RELEASE_LABEL;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolvePinataConfig() {
  const jwt = process.env.PINATA_JWT || process.env.PINATA_JWT_KEY;
  if (jwt) {
    return { pinataJWTKey: jwt };
  }
  const apiKey = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_SECRET_API_KEY;
  if (apiKey && secret) {
    return { pinataApiKey: apiKey, pinataSecretApiKey: secret };
  }
  return null;
}

function sanitizeHostNodes(raw) {
  if (!raw) return undefined;
  const nodes = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return nodes.length ? nodes : undefined;
}

async function ensureBuildArtifacts() {
  if (!skipBuild && !dryRun) {
    log("Running static build...");
    await runNodeScript("build.mjs");
    log("Verifying subresource integrity...");
    await runNodeScript("verify-sri.mjs");
  }
  try {
    await fs.access(manifestPath);
  } catch {
    throw formatError(
      "Static manifest missing. Run the build step or pass --skip-build only after generating dist/.",
    );
  }
}

async function loadDeploymentConfig() {
  try {
    const raw = await fs.readFile(deploymentConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { latest: null, history: [] };
    }
    const history = Array.isArray(parsed.history) ? parsed.history : [];
    return {
      latest: parsed.latest ?? null,
      history,
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { latest: null, history: [] };
    }
    if (err instanceof SyntaxError) {
      throw formatError(
        `Failed to parse ${path.relative(appDir, deploymentConfigPath)}: ${err.message}`,
      );
    }
    throw formatError(
      `Failed to read ${path.relative(appDir, deploymentConfigPath)}: ${err.message ?? err}`,
    );
  }
}

function summariseAvailability(checks) {
  if (!checks || typeof checks !== "object") {
    return { skipped: true };
  }
  if (checks.skipped) {
    return { skipped: true };
  }
  return {
    skipped: false,
    successCount: checks.successCount ?? 0,
    total: checks.total ?? 0,
    sloTarget: checks.sloTarget ?? "99.9% availability across two pinning providers",
    results: Array.isArray(checks.results) ? checks.results : [],
  };
}

function summarisePins(web3Result, pinataResult) {
  const web3Summary = web3Result
    ? {
        cid: web3Result.cid ?? null,
        pins: web3Result.status?.pins ?? null,
      }
    : null;
  const pinataSummary = pinataResult
    ? {
        requestId: pinataResult.requestId ?? null,
        status: pinataResult.status ?? null,
        hostNodes: pinataResult.hostNodes ?? null,
      }
    : null;
  return { web3: web3Summary, pinata: pinataSummary };
}

async function updateDeploymentConfig({
  release,
  cid,
  createdAt,
  gateways,
  web3Result,
  pinataResult,
  ensResult,
  availability,
  car,
}) {
  if (dryRun) {
    log(
      "Skipping deployment-config update (dry run). dist/release.json still captures the metadata.",
    );
    return;
  }
  const current = await loadDeploymentConfig();
  const entry = {
    release,
    cid,
    createdAt,
    car,
    gateways,
    pins: summarisePins(web3Result, pinataResult),
    ens: ensResult
      ? {
          name: ensResult.name ?? null,
          resolver: ensResult.resolver ?? null,
          txHash: ensResult.txHash ?? null,
          gateway: ensResult.gateway ?? null,
          contenthash: ensResult.contenthash ?? null,
        }
      : null,
    availability: summariseAvailability(availability),
  };
  const historyWithoutDupes = (current.history || []).filter(
    (item) => item && item.cid !== cid,
  );
  const nextHistory = [entry, ...historyWithoutDupes].slice(0, MAX_HISTORY_ENTRIES);
  await fs.mkdir(path.dirname(deploymentConfigPath), { recursive: true });
  await fs.writeFile(
    deploymentConfigPath,
    `${JSON.stringify({ latest: entry, history: nextHistory }, null, 2)}\n`,
  );
  log(
    `Updated ${path.relative(appDir, deploymentConfigPath)} with latest release metadata.`,
  );
}

async function createCarArchive() {
  log("Packing dist/ directory into CAR archive...");
  await fs.rm(carOutputPath, { force: true });
  const { root } = await packToFs({
    input: distDir,
    output: carOutputPath,
    wrapWithDirectory: true,
  });
  const rootCid = root.toString();
  log(`CAR archive ready: ${path.relative(appDir, carOutputPath)} (cid=${rootCid})`);
  return rootCid;
}

async function uploadToWeb3Storage(rootCid, releaseName) {
  if (dryRun || skipWeb3) {
    log("Skipping web3.storage upload (dry run or --skip-web3)");
    return null;
  }
  const token = process.env.WEB3_STORAGE_TOKEN || process.env.W3S_TOKEN;
  if (!token) {
    throw formatError(
      "WEB3_STORAGE_TOKEN (or W3S_TOKEN) must be set to upload to web3.storage",
    );
  }
  log("Uploading CAR to web3.storage...");
  const client = new Web3Storage({ token });
  const carBytes = await fs.readFile(carOutputPath);
  const carReader = await CarReader.fromBytes(carBytes);
  const uploadCid = await client.putCar(carReader, { name: releaseName });
  if (uploadCid !== rootCid) {
    throw formatError(
      `CID mismatch from web3.storage upload (expected ${rootCid}, received ${uploadCid})`,
    );
  }
  const status = await client.status(rootCid).catch((err) => {
    log("Warning: unable to fetch web3.storage status", err.message ?? err);
    return null;
  });
  log("web3.storage upload complete.");
  return {
    cid: uploadCid,
    status: status
      ? {
          cid: status.cid,
          dagSize: status.dagSize,
          pins: status.pins?.map(({ region, status: pinStatus }) => ({
            region,
            status: pinStatus,
          })),
        }
      : null,
  };
}

function normalizeGateway(base) {
  if (typeof base !== "string") return "";
  return base.endsWith("/") ? base : `${base}/`;
}

async function probeGateway(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const duration = performance.now() - startedAt;
    return {
      url,
      ok: response.ok,
      status: response.status,
      durationMs: Math.round(duration),
      error: response.ok ? null : response.statusText || null,
    };
  } catch (err) {
    const duration = performance.now() - startedAt;
    return {
      url,
      ok: false,
      status: null,
      durationMs: Math.round(duration),
      error: err?.message ?? String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkGatewayAvailability(rootCid, gateways, ensGateway) {
  if (dryRun || skipHealth) {
    log("Skipping gateway availability checks (dry run or --skip-health)");
    return { skipped: true, results: [] };
  }

  const checks = [];
  const targets = [];

  for (const gateway of gateways ?? []) {
    if (typeof gateway !== "string" || !gateway.trim()) continue;
    const normalized = normalizeGateway(gateway.trim());
    targets.push(`${normalized}${rootCid}/index.html`);
  }

  if (ensGateway) {
    targets.push(`${normalizeGateway(ensGateway)}index.html`);
  }

  if (!targets.length) {
    return { skipped: true, results: [] };
  }

  log("Checking gateway availability...");
  for (const targetUrl of targets) {
    const result = await probeGateway(targetUrl);
    checks.push(result);
    if (result.ok) {
      log(`Gateway OK (${result.status}) -> ${targetUrl}`);
    } else {
      log(
        `Gateway FAILED${result.status ? ` (${result.status})` : ""} -> ${targetUrl} (${result.error ?? "unknown error"})`,
      );
    }
  }

  const successCount = checks.filter((entry) => entry.ok).length;
  return {
    skipped: false,
    successCount,
    total: checks.length,
    sloTarget: "99.9% availability across two pinning providers",
    results: checks,
  };
}

async function pinWithPinata(rootCid, releaseName) {
  if (dryRun || skipPinata) {
    log("Skipping Pinata pin (dry run or --skip-pinata)");
    return null;
  }
  const config = resolvePinataConfig();
  if (!config) {
    throw formatError(
      "Pinata credentials missing. Provide PINATA_JWT or PINATA_API_KEY/PINATA_SECRET_API_KEY",
    );
  }
  const PinataClient = PinataClientModule.default || PinataClientModule;
  const pinata = new PinataClient(config);
  log("Requesting Pinata to pin existing CID...");
  const hostNodes = sanitizeHostNodes(process.env.PINATA_HOST_NODES);
  const result = await pinata.pinByHash(rootCid, {
    pinataMetadata: { name: releaseName },
    ...(hostNodes ? { pinataOptions: { hostNodes } } : {}),
  });
  let jobs = null;
  try {
    jobs = await pinata.pinJobs({
      sort: "ASC",
      ipfs_pin_hash: rootCid,
    });
  } catch (err) {
    log("Warning: unable to query Pinata pin jobs", err.message ?? err);
  }
  log("Pinata pin requested.");
  return {
    requestId: result?.id ?? null,
    status: result?.status ?? null,
    hostNodes: hostNodes ?? null,
    jobs: jobs?.rows ?? null,
  };
}

const { hash: namehash } = namehashModule;

async function updateEnsContenthash(rootCid) {
  if (dryRun || skipEns) {
    log("Skipping ENS contenthash update (dry run or --skip-ens)");
    return null;
  }
  const ensName = process.env.ENS_NAME || process.env.ONEBOX_ENS_NAME;
  if (!ensName) {
    log("No ENS_NAME provided; skipping contenthash update.");
    return null;
  }
  const privateKey = process.env.ENS_PRIVATE_KEY || process.env.ONEBOX_ENS_PRIVATE_KEY;
  const rpcUrl = process.env.ENS_RPC_URL || process.env.ONEBOX_ENS_RPC_URL;
  if (!privateKey || !rpcUrl) {
    throw formatError("ENS_PRIVATE_KEY and ENS_RPC_URL are required to update contenthash");
  }
  const registryAddress =
    process.env.ENS_REGISTRY || "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const registry = new ethers.Contract(
    registryAddress,
    ["function resolver(bytes32 node) view returns (address)"],
    wallet,
  );
  const node = namehash(ensName);
  const resolverAddress =
    process.env.ENS_RESOLVER || (await registry.resolver(node));
  if (!resolverAddress || resolverAddress === ethers.ZeroAddress) {
    throw formatError(
      `Resolver not configured for ${ensName}. Provide ENS_RESOLVER or set one on-chain.`,
    );
  }
  const resolver = new ethers.Contract(
    resolverAddress,
    [
      "function contenthash(bytes32 node) view returns (bytes)",
      "function setContenthash(bytes32 node, bytes hash) external",
    ],
    wallet,
  );
  const encoded = `0x${contentHash.fromIpfs(rootCid)}`;
  const current = await resolver
    .contenthash(node)
    .catch(() => "0x");
  if (current === encoded) {
    log(`ENS contenthash already set for ${ensName}.`);
    return {
      name: ensName,
      resolver: resolverAddress,
      txHash: null,
      contenthash: encoded,
      gateway: `https://${ensName}.limo`,
    };
  }
  log(`Updating ENS contenthash for ${ensName} -> ${rootCid}...`);
  const tx = await resolver.setContenthash(node, encoded);
  const receipt = await tx.wait();
  log("ENS contenthash update transaction mined.");
  return {
    name: ensName,
    resolver: resolverAddress,
    txHash: receipt?.hash || tx.hash,
    contenthash: encoded,
    gateway: `https://${ensName}.limo`,
  };
}

async function main() {
  const releaseLabel = deriveReleaseLabel();
  const releaseName = `agi-onebox-${releaseLabel}`;
  await ensureBuildArtifacts();
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const rootCid = await createCarArchive();
  const web3Result = await uploadToWeb3Storage(rootCid, releaseName);
  const pinataResult = await pinWithPinata(rootCid, releaseName);
  const ensResult = await updateEnsContenthash(rootCid);
  const { IPFS_GATEWAYS = [] } = await import(configModuleUrl.href);
  const gatewayChecks = await checkGatewayAvailability(
    rootCid,
    IPFS_GATEWAYS,
    ensResult?.gateway,
  );
  const releaseMetadata = {
    createdAt: new Date().toISOString(),
    release: releaseName,
    cid: rootCid,
    car: path.relative(appDir, carOutputPath),
    manifest,
    ipfsGateways: IPFS_GATEWAYS,
    web3Storage: web3Result,
    pinata: pinataResult,
    ens: ensResult,
    availability: gatewayChecks,
    skipped: {
      build: skipBuild,
      web3: skipWeb3 || dryRun,
      pinata: skipPinata || dryRun,
      ens: skipEns || dryRun || !ensResult,
      health: skipHealth || dryRun || gatewayChecks?.skipped,
    },
  };
  await fs.writeFile(
    path.join(distDir, "release.json"),
    `${JSON.stringify(releaseMetadata, null, 2)}\n`,
  );
  await updateDeploymentConfig({
    release: releaseName,
    cid: rootCid,
    createdAt: releaseMetadata.createdAt,
    gateways: IPFS_GATEWAYS,
    web3Result,
    pinataResult,
    ensResult,
    availability: gatewayChecks,
    car: releaseMetadata.car,
  });
  log("Release metadata written to dist/release.json");
  log(`Root CID: ${rootCid}`);
  if (ensResult?.gateway) {
    log(`Gateway preview: ${ensResult.gateway}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
