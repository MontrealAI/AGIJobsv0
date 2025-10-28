#!/usr/bin/env ts-node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runDemoOrchestration } from "../src/demoOrchestrator";

async function main() {
  const result = await runDemoOrchestration();
  const report = {
    generatedAt: new Date().toISOString(),
    allowlistFingerprint: result.allowlistFingerprint,
    validators: result.committee.map((validator) => ({
      ensName: validator.ensName,
      address: validator.address,
      domain: validator.domain,
    })),
    finalization: result.finalization,
    zkProof: {
      batchId: result.zkProof.batchId,
      digest: result.zkProof.digest,
      batchSize: result.zkProof.batchSize,
      publicKey: result.zkProof.publicKey,
    },
    sentinelAlerts: result.sentinelAlerts,
    eventLogTail: result.eventLog.slice(-20),
    configuration: result.configuration,
  };

  const outPath = resolve(process.cwd(), "validator-constellation-audit.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Audit report written to ${outPath}`);
}

main().catch((error) => {
  console.error("Audit report generation failed", error);
  process.exitCode = 1;
});
