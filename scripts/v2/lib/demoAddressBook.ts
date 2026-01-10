import { promises as fs } from 'fs';
import path from 'path';

export interface DemoAddressBookPayload {
  generatedAt: string;
  network: string;
  taxPolicy: string;
  rewardEngine: string;
  thermostat: string;
}

const DEMO_ADDRESS_BOOK_ENV = 'OWNER_MATRIX_DEMO_ADDRESS_BOOK';
const DEFAULT_DEMO_ADDRESS_BOOK = path.join(
  process.cwd(),
  'deployment-config',
  'generated',
  'demo-hardhat-addresses.json'
);

export function resolveDemoAddressBookOutputPath(): string {
  const override = process.env[DEMO_ADDRESS_BOOK_ENV];
  if (!override || override.trim().length === 0) {
    return DEFAULT_DEMO_ADDRESS_BOOK;
  }
  const trimmed = override.trim();
  return path.isAbsolute(trimmed) ? trimmed : path.join(process.cwd(), trimmed);
}

export async function writeDemoAddressBook(
  payload: DemoAddressBookPayload,
  outputPath: string = resolveDemoAddressBookOutputPath()
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
