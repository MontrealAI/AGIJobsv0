import { promises as fs } from "fs";
import path from "path";
import { artifacts } from "hardhat";

type AbiExport = {
  abiPath: string;
  bytecode: string;
  deployedBytecode: string;
};

const CONTRACTS = [
  { name: "AlphaMarkEToken", source: "AlphaMarkEToken.sol" },
  { name: "AlphaMarkRiskOracle", source: "AlphaMarkRiskOracle.sol" },
  { name: "AlphaSovereignVault", source: "AlphaSovereignVault.sol" },
  { name: "NovaSeedNFT", source: "NovaSeedNFT.sol" },
];

async function main() {
  const outputDir = path.join(__dirname, "..", "reports", "abi");
  await fs.mkdir(outputDir, { recursive: true });

  const index: Record<string, AbiExport> = {};

  for (const contract of CONTRACTS) {
    const artifact = await artifacts.readArtifact(contract.name);
    const abiFile = `${contract.name}.abi.json`;
    const outPath = path.join(outputDir, abiFile);
    await fs.writeFile(outPath, JSON.stringify(artifact.abi, null, 2));
    index[contract.name] = {
      abiPath: `./${abiFile}`,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
    };
  }

  const indexPath = path.join(outputDir, "index.json");
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(`ABI exports written to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
