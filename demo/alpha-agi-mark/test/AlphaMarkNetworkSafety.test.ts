import { expect } from "chai";
import { spawnSync } from "node:child_process";
import path from "node:path";

describe("α-AGI MARK network isolation", function () {
  this.timeout(30000);
  const sampleKey = `0x${"11".repeat(32)}`;
  function inspect(overrides: Record<string, string> = {}) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("ALPHA_MARK_") || key.startsWith("HARDHAT_")) delete env[key];
    Object.assign(env, overrides, { HARDHAT_CONFIG: path.resolve(__dirname, "../hardhat.config.ts") });
    return spawnSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", `
      const hre = require("hardhat");
      const local = hre.config.networks.hardhat;
      const external = hre.config.networks.sepolia;
      process.stdout.write(JSON.stringify({ defaultNetwork: hre.config.defaultNetwork,
        localChainId: local.chainId, localHasUrl: Boolean(local.url), externalChainId: external?.chainId }));
    `], { cwd: path.resolve(__dirname, "../../.."), env, encoding: "utf8", timeout: 15000 });
  }

  it("cannot replace the in-memory hardhat network using external credentials", function () {
    const result = inspect({ ALPHA_MARK_RPC_URL: "https://example.invalid", ALPHA_MARK_OWNER_KEY: sampleKey });
    expect(result.status).to.equal(1);
    expect(result.stderr).to.contain("requires an explicit ALPHA_MARK_NETWORK other than hardhat");
  });

  it("rejects missing, malformed, and unsafe external chain IDs before connecting", function () {
    for (const chainId of ["", "-1", "1.5", "9007199254740992"]) {
      const result = inspect({ ALPHA_MARK_NETWORK: "sepolia", ALPHA_MARK_RPC_URL: "https://example.invalid",
        ALPHA_MARK_OWNER_KEY: sampleKey, ALPHA_MARK_CHAIN_ID: chainId });
      expect(result.status).to.equal(1);
      expect(result.stderr).to.contain("positive safe integer ALPHA_MARK_CHAIN_ID");
    }
  });

  it("keeps the default network local even with a fully configured external network", function () {
    const result = inspect({ ALPHA_MARK_NETWORK: "sepolia", ALPHA_MARK_RPC_URL: "https://example.invalid",
      ALPHA_MARK_OWNER_KEY: sampleKey, ALPHA_MARK_CHAIN_ID: "11155111" });
    expect(result.status, result.stderr).to.equal(0);
    expect(JSON.parse(result.stdout.slice(result.stdout.lastIndexOf("{")))).to.deep.equal({
      defaultNetwork: "hardhat", localChainId: 31337, localHasUrl: false, externalChainId: 11155111,
    });
  });
});
