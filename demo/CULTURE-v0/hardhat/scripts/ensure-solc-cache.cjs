const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { keccak256 } = require("ethereum-cryptography/keccak");
const { bytesToHex } = require("ethereum-cryptography/utils");
const envPaths = require("env-paths");

const SOLC_VERSION = "0.8.25";
const PRIMARY_REPO = "https://binaries.soliditylang.org";
const FALLBACK_REPO = "https://solc-bin.ethereum.org";

function platformFolder() {
  switch (os.platform()) {
    case "win32":
      return "windows-amd64";
    case "darwin":
      return "macosx-amd64";
    case "linux":
      return "linux-amd64";
    default:
      return "wasm";
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const agent = proxyAgent();
    https
      .get(url, { agent }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Failed to fetch ${url} (status ${res.statusCode})`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchJsonWithFallback(pathname) {
  try {
    return await requestJson(`${PRIMARY_REPO}/${pathname}`);
  } catch (error) {
    return await requestJson(`${FALLBACK_REPO}/${pathname}`);
  }
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const agent = proxyAgent();
    https
      .get(url, { agent }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Failed to download ${url} (status ${res.statusCode})`));
          return;
        }

        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const tempPath = `${destination}.tmp`;
        const file = fs.createWriteStream(tempPath);

        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(tempPath, destination);
            resolve();
          });
        });
        file.on("error", (err) => {
          reject(err);
        });
      })
      .on("error", reject);
  });
}

async function downloadWithFallback(pathname, destination) {
  try {
    await downloadFile(`${PRIMARY_REPO}/${pathname}`, destination);
  } catch (error) {
    await downloadFile(`${FALLBACK_REPO}/${pathname}`, destination);
  }
}

function compilerHashMatches(filePath, expectedHash) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const buffer = fs.readFileSync(filePath);
  const actual = `0x${bytesToHex(keccak256(buffer))}`;
  return actual === expectedHash;
}

function proxyAgent() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) {
    return undefined;
  }

  return new HttpsProxyAgent(proxyUrl);
}

async function ensureCompilerCache() {
  const platform = platformFolder();
  const cacheDir = envPaths("hardhat").cache;
  const compilersDir = path.join(cacheDir, "compilers-v2", platform);
  const listPath = path.join(compilersDir, "list.json");
  let list;

  if (fs.existsSync(listPath)) {
    list = JSON.parse(fs.readFileSync(listPath, "utf8"));
  }

  if (!list || !list.builds.some((build) => build.version === SOLC_VERSION)) {
    list = await fetchJsonWithFallback(`${platform}/list.json`);
    fs.mkdirSync(compilersDir, { recursive: true });
    fs.writeFileSync(listPath, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  }

  const build = list.builds.find(
    (entry) => entry.version === SOLC_VERSION && entry.prerelease === undefined
  );

  if (!build) {
    throw new Error(`Unable to locate solc ${SOLC_VERSION} in compiler list`);
  }

  const compilerPath = path.join(compilersDir, build.path);
  if (!compilerHashMatches(compilerPath, build.keccak256)) {
    await downloadWithFallback(`${platform}/${build.path}`, compilerPath);
    if (!compilerHashMatches(compilerPath, build.keccak256)) {
      throw new Error(`solc ${SOLC_VERSION} download failed integrity check`);
    }
  }

  fs.chmodSync(compilerPath, 0o755);
}

ensureCompilerCache().catch((error) => {
  console.error("Failed to cache solc compiler:", error);
  process.exitCode = 1;
});
