import { readFile } from "fs/promises";
import path from "path";

interface OwnerMatrixEntry {
  parameter: string;
  value: unknown;
  description: string;
}

async function main() {
  const recapPath = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
  const raw = await readFile(recapPath, "utf8");
  const recap = JSON.parse(raw);

  if (!Array.isArray(recap.ownerParameterMatrix)) {
    throw new Error("ownerParameterMatrix not found in recap. Run the demo first.");
  }

  const entries: OwnerMatrixEntry[] = recap.ownerParameterMatrix;

  console.log("α-AGI MARK — Owner Parameter Matrix\n");
  console.table(
    entries.map((entry) => ({
      Parameter: entry.parameter,
      Value: typeof entry.value === "object" ? JSON.stringify(entry.value) : String(entry.value),
      Description: entry.description,
    })),
  );
}

main().catch((error) => {
  console.error("Failed to render owner parameter matrix:", error);
  process.exitCode = 1;
});
