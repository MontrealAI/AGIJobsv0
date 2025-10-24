require("ts-node/register/transpile-only");

const { describe, it, expect } = require("@jest/globals");
const { existsSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const tar = require("tar");

const { bundleOperatorKit } = require("../bundle-phase8-kit");

describe("Phase 8 operator kit bundler", () => {
  it("packages governance assets into a single operator tarball", async () => {
    const baseDir = join(__dirname, "..", "..", ".");
    const outputDir = mkdtempSync(join(baseDir, "output-test-"));

    try {
      const result = await bundleOperatorKit({
        outputDir,
        bundleFileName: "phase8-test-kit.tar.gz",
      });

      expect(existsSync(result.bundlePath)).toBe(true);
      expect(result.bundlePath.endsWith("phase8-test-kit.tar.gz")).toBe(true);
      expect(existsSync(result.kitManifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(result.kitManifestPath, "utf-8"));
      expect(manifest.generatedAt).toBeDefined();
      expect(manifest.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: expect.stringMatching(/phase8-governance-calldata\.json$/) }),
          expect.objectContaining({ path: expect.stringMatching(/phase8-safe-transaction-batch\.json$/) }),
        ]),
      );
      expect(Array.isArray(manifest.instructions)).toBe(true);
      expect(manifest.instructions).toHaveLength(4);

      const entries = [];
      await tar.t({
        file: result.bundlePath,
        onentry(entry) {
          entries.push(entry.path);
        },
      });

      expect(entries).toEqual(
        expect.arrayContaining([
          "config/universal.value.manifest.json",
        ]),
      );
      expect(entries.some((item) => item.endsWith("phase8-telemetry-report.md"))).toBe(true);
      expect(entries.some((item) => item.endsWith("phase8-mermaid-diagram.mmd"))).toBe(true);
      expect(entries.some((item) => item.endsWith("phase8-operator-kit-manifest.json"))).toBe(true);
      expect(entries.some((item) => item.endsWith("README.md"))).toBe(true);
      expect(entries.some((item) => item.endsWith("index.html"))).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
