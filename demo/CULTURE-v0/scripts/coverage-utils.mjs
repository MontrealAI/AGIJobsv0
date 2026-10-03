import { readFile } from 'node:fs/promises';

const requiredContracts = [
  'contracts/CultureRegistry.sol',
  'contracts/SelfPlayArena.sol',
];

export function parseContractCoverage(raw) {
  const records = new Map();
  for (const block of raw.split('end_of_record')) {
    const lines = block.split(/\r?\n/);
    const source = lines
      .find((line) => line.startsWith('SF:'))
      ?.slice(3)
      .replaceAll('\\', '/');
    if (!source || /(^|\/)node_modules\//.test(source)) continue;
    const name = requiredContracts.find(
      (contract) => source === contract || source.endsWith(`/${contract}`)
    );
    if (!name) continue;
    if (records.has(name))
      throw new Error(`Duplicate coverage record for ${name}`);
    const hits = lines
      .filter((line) => line.startsWith('DA:'))
      .map((line) => {
        const [lineNumber, count] = line.slice(3).split(',').map(Number);
        if (
          !Number.isInteger(lineNumber) ||
          lineNumber <= 0 ||
          !Number.isInteger(count) ||
          count < 0
        ) {
          throw new Error(`Invalid coverage entry for ${name}`);
        }
        return { lineNumber, count };
      });
    const unique = new Map(
      hits.map((entry) => [entry.lineNumber, entry.count])
    );
    if (unique.size !== hits.length)
      throw new Error(`Duplicate coverage line for ${name}`);
    const found =
      hits.length ||
      Number(lines.find((line) => line.startsWith('LF:'))?.slice(3));
    const hit = hits.length
      ? hits.filter((entry) => entry.count > 0).length
      : Number(lines.find((line) => line.startsWith('LH:'))?.slice(3));
    if (
      !Number.isInteger(found) ||
      found <= 0 ||
      !Number.isInteger(hit) ||
      hit < 0 ||
      hit > found
    ) {
      throw new Error(`Invalid or empty coverage record for ${name}`);
    }
    records.set(name, { name: `Foundry ${name}`, pct: (hit / found) * 100 });
  }
  for (const name of requiredContracts) {
    if (!records.has(name))
      throw new Error(`Coverage artifact missing production contract: ${name}`);
  }
  return [...records.values()];
}

export async function readContractCoverage(file) {
  return parseContractCoverage(await readFile(file, 'utf8'));
}

export async function readSummaryPct(file) {
  const json = JSON.parse(await readFile(file, 'utf8'));
  const pct = json.total?.lines?.pct;
  if (
    typeof pct !== 'number' ||
    !Number.isFinite(pct) ||
    pct < 0 ||
    pct > 100
  ) {
    throw new Error(`Invalid coverage percentage in ${file}`);
  }
  return pct;
}
