import { jest } from "@jest/globals";
import { mkdtemp, readdir, stat } from "fs/promises";
import os from "os";
import path from "path";

import { generateGovernanceDemo } from "../../../scripts/executeDemo";

const missionFile = path.resolve(__dirname, "../../config/mission@v17.json");

jest.setTimeout(180_000);

describe("alpha-v17 runMission", () => {
  it("honors --dry-run by avoiding disk writes", async () => {
    const tempDir = await fsSafeTempDir();

    await generateGovernanceDemo({
      missionFile,
      reportDir: tempDir,
      reportFile: path.join(tempDir, "dry-run-report.md"),
      summaryFile: path.join(tempDir, "dry-run-summary.json"),
      dashboardFile: path.join(tempDir, "dry-run-dashboard.html"),
      ownerMatrixJsonFile: path.join(tempDir, "dry-run-owner.json"),
      ownerMatrixMarkdownFile: path.join(tempDir, "dry-run-owner.md"),
      dryRun: true,
    });

    const contents = await readdir(tempDir);
    expect(contents).toHaveLength(0);
  });
});

async function fsSafeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agi-governance-dry-run-"));
  const stats = await stat(dir);

  if (!stats.isDirectory()) {
    throw new Error(`Expected temp path to be a directory: ${dir}`);
  }

  return dir;
}
