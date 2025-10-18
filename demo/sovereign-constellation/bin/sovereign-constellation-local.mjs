#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "../..", "..");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", cwd: repoRoot, ...options });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(null);
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

function spawnPersist(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", cwd: repoRoot, ...options });
  return child;
}

async function main() {
  console.log("🚀 Preparing Sovereign Constellation local constellation...");
  await run("npx", ["hardhat", "run", "--no-compile", "demo/sovereign-constellation/scripts/deployConstellation.ts"]);
  await run("npx", ["hardhat", "run", "--no-compile", "demo/sovereign-constellation/scripts/seedConstellation.ts"]);
  await run("node", ["demo/sovereign-constellation/scripts/generateOwnerAtlas.mjs"]);

  console.log("✅ Contracts ready. Launching orchestrator and console...");
  const server = spawnPersist("npm", ["run", "dev", "--", "--host", "0.0.0.0", "--port", "8090"], {
    cwd: path.join(repoRoot, "demo/sovereign-constellation/server")
  });
  const app = spawnPersist("npm", ["run", "dev", "--", "--host", "0.0.0.0", "--port", "5179"], {
    cwd: path.join(repoRoot, "demo/sovereign-constellation/app")
  });

  const shutdown = () => {
    console.log("\n🛑 Shutting down Sovereign Constellation processes...");
    server.kill("SIGTERM");
    app.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
