import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import { inferNetworkKey } from '../config';

const ZERO_ADDRESS = ethers.ZeroAddress;

const ROLE_KEYS = ['agent', 'validator', 'operator', 'employer'] as const;
type RoleKey = (typeof ROLE_KEYS)[number];
const ROLE_LABEL: Record<RoleKey, string> = {
  agent: 'Agent',
  validator: 'Validator',
  operator: 'Operator',
  employer: 'Employer',
};

const ROLE_INDEX: Record<RoleKey, number> = {
  agent: 0,
  validator: 1,
  operator: 2,
  employer: 3,
};

type Format = 'markdown' | 'json';

type Status =
  | 'match'
  | 'drift'
  | 'config-missing'
  | 'contract-missing'
  | 'skipped'
  | 'error';

type CheckResult = {
  parameter: string;
  configValue?: string | null;
  onChainValue?: string | null;
  status: Status;
  notes?: string[];
};

type SectionResult = {
  name: string;
  checks: CheckResult[];
};

type CliOptions = {
  format: Format;
  outPath?: string;
  addressBookPath?: string;
  configNetwork?: string;
};

type AddressBook = Record<string, string>;

type AddressField = {
  defined: boolean;
  value?: string | null;
  raw?: unknown;
};

type BigIntField = {
  defined: boolean;
  value?: bigint | null;
  raw?: unknown;
};

type BooleanField = {
  defined: boolean;
  value?: boolean | null;
  raw?: unknown;
};

type RoleShareField = {
  defined: boolean;
  value?: bigint | null;
  raw?: unknown;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { format: 'markdown' };

  const envFormat =
    process.env.THERMO_REPORT_FORMAT ?? process.env.THERMODYNAMICS_REPORT_FORMAT;
  if (envFormat) {
    const lower = envFormat.trim().toLowerCase();
    if (lower === 'markdown' || lower === 'json') {
      options.format = lower;
    } else {
      throw new Error(
        `Invalid THERMO_REPORT_FORMAT value "${envFormat}". Use "markdown" or "json".`
      );
    }
  }

  const envOut = process.env.THERMO_REPORT_OUT ?? process.env.THERMODYNAMICS_REPORT_OUT;
  if (envOut && envOut.trim()) {
    options.outPath = envOut.trim();
  }

  const envAddressBook =
    process.env.THERMO_REPORT_ADDRESS_BOOK ?? process.env.THERMODYNAMICS_REPORT_ADDRESS_BOOK;
  if (envAddressBook && envAddressBook.trim()) {
    options.addressBookPath = envAddressBook.trim();
  }

  const envConfigNetwork =
    process.env.THERMO_REPORT_CONFIG_NETWORK ??
    process.env.THERMODYNAMICS_REPORT_CONFIG_NETWORK;
  if (envConfigNetwork && envConfigNetwork.trim()) {
    options.configNetwork = envConfigNetwork.trim();
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.format = 'json';
    } else if (arg === '--format') {
      const value = argv[i + 1];
      if (!value) throw new Error('--format requires a value');
      if (value !== 'markdown' && value !== 'json') {
        throw new Error('--format must be markdown or json');
      }
      options.format = value;
      i += 1;
    } else if (arg === '--out' || arg === '--output') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a file path`);
      options.outPath = value;
      i += 1;
    } else if (arg === '--address-book' || arg === '--addresses') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a file path`);
      options.addressBookPath = value;
      i += 1;
    } else if (arg === '--config-network') {
      const value = argv[i + 1];
      if (!value) throw new Error('--config-network requires a value');
      options.configNetwork = value;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Thermodynamics report
Usage: hardhat run scripts/v2/thermodynamicsReport.ts --network <network> [--] [options]

Options:
  --format <markdown|json>   Output format (default: markdown)
  --json                     Shortcut for --format json
  --out <file>               Write output to file
  --address-book <file>      Override deployment address book (default: docs/deployment-addresses.json)
  --config-network <name>    Override config network resolution when reading manifests

Environment overrides:
  THERMO_REPORT_FORMAT          Default output format
  THERMO_REPORT_OUT             Default output path
  THERMO_REPORT_ADDRESS_BOOK    Override deployment address book path
  THERMO_REPORT_CONFIG_NETWORK  Override config network resolution
`);
}

function loadAddressBook(addressBookPath?: string): AddressBook | null {
  const resolvedPath =
    addressBookPath ?? path.join(process.cwd(), 'docs', 'deployment-addresses.json');
  try {
    const raw = fsSync.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (addressBookPath) {
      throw new Error(`Failed to read address book at ${resolvedPath}: ${String(error)}`);
    }
    return null;
  }
}

function resolveThermodynamicsPath(networkKey?: string): string {
  const configDir = path.join(process.cwd(), 'config');
  if (networkKey) {
    const candidate = path.join(configDir, `thermodynamics.${networkKey}.json`);
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(configDir, 'thermodynamics.json');
}

function normaliseAddress(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return ethers.getAddress(trimmed);
  }
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const str = (value as { toString(): string }).toString().trim();
    if (!str) return null;
    return ethers.getAddress(str);
  }
  throw new Error(`Invalid address value: ${String(value)}`);
}

function readAddressField(obj: Record<string, unknown>, key: string): AddressField {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    return { defined: false };
  }
  const raw = obj[key];
  if (raw === undefined || raw === null || raw === '') {
    return { defined: true, value: null, raw };
  }
  return { defined: true, value: normaliseAddress(raw), raw };
}

function readBigIntField(
  obj: Record<string, unknown>,
  key: string,
  { signed = false }: { signed?: boolean } = {}
): BigIntField {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    return { defined: false };
  }
  const raw = obj[key];
  if (raw === undefined || raw === null || raw === '') {
    return { defined: true, value: null, raw };
  }
  const str = typeof raw === 'string' ? raw.trim() : String(raw);
  if (!str) {
    return { defined: true, value: null, raw };
  }
  if (!/^[-+]?\d+$/.test(str)) {
    throw new Error(`Expected integer for ${key}, received ${raw}`);
  }
  const value = BigInt(str);
  if (!signed && value < 0n) {
    throw new Error(`${key} cannot be negative`);
  }
  return { defined: true, value, raw };
}

function readBooleanField(obj: Record<string, unknown>, key: string): BooleanField {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    return { defined: false };
  }
  const raw = obj[key];
  if (raw === undefined || raw === null || raw === '') {
    return { defined: true, value: null, raw };
  }
  if (typeof raw === 'boolean') {
    return { defined: true, value: raw, raw };
  }
  if (typeof raw === 'number') {
    return { defined: true, value: raw !== 0, raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return { defined: true, value: null, raw };
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) {
      return { defined: true, value: true, raw };
    }
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) {
      return { defined: true, value: false, raw };
    }
  }
  throw new Error(`Invalid boolean value for ${key}: ${String(raw)}`);
}

function readRoleShareField(value: unknown): RoleShareField {
  if (value === undefined) {
    return { defined: false };
  }
  if (value === null || value === '') {
    return { defined: true, value: null, raw: value };
  }
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    const maybeObject = value as Record<string, unknown>;
    if (maybeObject.wad !== undefined && maybeObject.wad !== null && maybeObject.wad !== '') {
      const str = String(maybeObject.wad).trim();
      if (!/^[-+]?\d+$/.test(str)) {
        throw new Error(`Invalid wad role share: ${maybeObject.wad}`);
      }
      return { defined: true, value: BigInt(str), raw: value };
    }
    if (
      maybeObject.percent !== undefined &&
      maybeObject.percent !== null &&
      maybeObject.percent !== ''
    ) {
      return readRoleShareField(maybeObject.percent);
    }
  }
  const str = typeof value === 'string' ? value.trim() : String(value);
  if (!str) {
    return { defined: true, value: null, raw: value };
  }
  const percent = Number(str);
  if (!Number.isFinite(percent)) {
    throw new Error(`Invalid percent role share: ${value}`);
  }
  if (percent < 0 || percent > 100) {
    throw new Error(`Role share percent must be between 0 and 100: ${percent}`);
  }
  const wad = ethers.parseUnits(percent.toString(), 16);
  return { defined: true, value: wad, raw: value };
}

function formatPercent(value: bigint | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const formatted = ethers.formatUnits(value, 16);
  return `${formatted}% (${value.toString()} wad)`;
}

function formatWad(value: bigint | null | undefined, unit = 'AGIALPHA'): string | null {
  if (value === undefined || value === null) return null;
  return `${ethers.formatUnits(value, 18)} ${unit} (${value.toString()})`;
}

function formatSignedWad(value: bigint | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const formatted = ethers.formatUnits(value, 18);
  return `${formatted} (${value.toString()})`;
}

function formatInteger(value: bigint | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.toString();
}

function formatAddress(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return ethers.getAddress(value);
}

function compareAddresses(
  section: SectionResult,
  label: string,
  configField: AddressField,
  onChain: string | null,
  { treatZeroAsValue = true, notes }: { treatZeroAsValue?: boolean; notes?: string[] } = {}
): void {
  const result: CheckResult = {
    parameter: label,
    configValue: configField.defined
      ? configField.value
        ? formatAddress(configField.value)
        : treatZeroAsValue
        ? formatAddress(ZERO_ADDRESS)
        : null
      : undefined,
    onChainValue: onChain ? formatAddress(onChain) : null,
    status: 'skipped',
    notes,
  };

  if (!configField.defined) {
    result.status = 'config-missing';
  } else if (!onChain) {
    result.status = 'contract-missing';
  } else {
    const configAddress = configField.value ?? (treatZeroAsValue ? ZERO_ADDRESS : null);
    if (configAddress === null) {
      result.status = 'config-missing';
    } else if (ethers.getAddress(configAddress) === ethers.getAddress(onChain)) {
      result.status = 'match';
    } else {
      result.status = 'drift';
    }
  }

  section.checks.push(result);
}

function compareBigInts(
  section: SectionResult,
  label: string,
  configField: BigIntField,
  onChain: bigint | null,
  formatter: (value: bigint | null | undefined) => string | null = formatInteger,
  { allowNullMatch = false, notes }: { allowNullMatch?: boolean; notes?: string[] } = {}
): void {
  const result: CheckResult = {
    parameter: label,
    configValue: configField.defined ? formatter(configField.value) : undefined,
    onChainValue: formatter(onChain),
    status: 'skipped',
    notes,
  };

  if (!configField.defined) {
    result.status = 'config-missing';
  } else if (onChain === null) {
    result.status = 'contract-missing';
  } else if (configField.value === null) {
    result.status = allowNullMatch ? 'match' : 'config-missing';
  } else if (configField.value === onChain) {
    result.status = 'match';
  } else {
    result.status = 'drift';
  }

  section.checks.push(result);
}

function compareRoleShare(
  section: SectionResult,
  role: RoleKey,
  configField: RoleShareField,
  onChain: bigint | null
): void {
  const label = `${ROLE_LABEL[role]} role share`;
  const result: CheckResult = {
    parameter: label,
    configValue: configField.defined ? formatPercent(configField.value) : undefined,
    onChainValue: formatPercent(onChain),
    status: 'skipped',
  };

  if (!configField.defined) {
    result.status = 'config-missing';
  } else if (onChain === null) {
    result.status = 'contract-missing';
  } else if (configField.value === null) {
    result.status = 'config-missing';
  } else if (configField.value === onChain) {
    result.status = 'match';
  } else {
    result.status = 'drift';
  }

  section.checks.push(result);
}

function compareBoolean(
  section: SectionResult,
  label: string,
  configField: BooleanField,
  onChain: boolean | null
): void {
  const result: CheckResult = {
    parameter: label,
    configValue: configField.defined
      ? configField.value === null
        ? null
        : configField.value
        ? 'true'
        : 'false'
      : undefined,
    onChainValue:
      onChain === null ? null : onChain ? 'true' : 'false',
    status: 'skipped',
  };

  if (!configField.defined) {
    result.status = 'config-missing';
  } else if (onChain === null) {
    result.status = 'contract-missing';
  } else if (configField.value === null) {
    result.status = 'config-missing';
  } else if (configField.value === onChain) {
    result.status = 'match';
  } else {
    result.status = 'drift';
  }

  section.checks.push(result);
}

async function fetchRewardEngine(
  address: string
): Promise<import('ethers').Contract> {
  return ethers.getContractAt('RewardEngineMB', address);
}

async function fetchThermostat(
  address: string
): Promise<import('ethers').Contract> {
  return ethers.getContractAt('Thermostat', address);
}

function aggregateSummary(sections: SectionResult[]) {
  return sections.map((section) => {
    const counts: Record<Status, number> = {
      match: 0,
      drift: 0,
      'config-missing': 0,
      'contract-missing': 0,
      skipped: 0,
      error: 0,
    };
    for (const check of section.checks) {
      counts[check.status] += 1;
    }
    return {
      section: section.name,
      counts,
      total: section.checks.length,
    };
  });
}

function renderMarkdown(
  networkName: string,
  sections: SectionResult[],
  notes: string[]
): string {
  const summary = aggregateSummary(sections);
  const lines: string[] = [];
  lines.push(`# Thermodynamics Verification Report`);
  lines.push('');
  lines.push(`- **Network:** ${networkName}`);
  if (notes.length) {
    lines.push(`- **Notes:** ${notes.join('; ')}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Section | Checks | ✅ Match | ❌ Drift | ⚠️ Config missing | 🚫 Contract missing | ⏭️ Skipped |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const item of summary) {
    lines.push(
      `| ${item.section} | ${item.total} | ${item.counts.match} | ${item.counts.drift} | ${item.counts['config-missing']} | ${item.counts['contract-missing']} | ${item.counts.skipped} |`
    );
  }
  lines.push('');

  for (const section of sections) {
    lines.push(`## ${section.name}`);
    lines.push('');
    if (section.checks.length === 0) {
      lines.push('_No parameters evaluated._');
      lines.push('');
      continue;
    }
    lines.push('| Parameter | Config | On-chain | Status | Notes |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const check of section.checks) {
      const statusIcon =
        check.status === 'match'
          ? '✅ match'
          : check.status === 'drift'
          ? '❌ drift'
          : check.status === 'config-missing'
          ? '⚠️ config missing'
          : check.status === 'contract-missing'
          ? '🚫 contract missing'
          : check.status === 'error'
          ? '❌ error'
          : '⏭️ skipped';
      const noteText = check.notes && check.notes.length ? check.notes.join('<br>') : '';
      lines.push(
        `| ${check.parameter} | ${check.configValue ?? ''} | ${check.onChainValue ?? ''} | ${statusIcon} | ${noteText} |`
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderJson(
  networkName: string,
  sections: SectionResult[],
  notes: string[]
): string {
  const payload = {
    network: networkName,
    generatedAt: new Date().toISOString(),
    summary: aggregateSummary(sections),
    sections,
    notes,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const notes: string[] = [];
  const configNetwork =
    options.configNetwork || inferNetworkKey(network.name) || network.name || 'unknown';

  const thermoConfigPath = resolveThermodynamicsPath(configNetwork);
  if (!fsSync.existsSync(thermoConfigPath)) {
    throw new Error(`Thermodynamics config not found at ${thermoConfigPath}`);
  }
  let thermoConfigRaw: any;
  try {
    const raw = fsSync.readFileSync(thermoConfigPath, 'utf8');
    thermoConfigRaw = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse thermodynamics config at ${thermoConfigPath}: ${String(error)}`);
  }

  const thermoConfig =
    thermoConfigRaw && typeof thermoConfigRaw === 'object' ? (thermoConfigRaw as Record<string, any>) : {};
  notes.push(`Loaded thermodynamics config from ${path.relative(process.cwd(), thermoConfigPath)}`);
  const addressBook = loadAddressBook(options.addressBookPath);

  const sections: SectionResult[] = [];

  const rewardSection: SectionResult = { name: 'RewardEngineMB', checks: [] };
  const thermostatSection: SectionResult = { name: 'Thermostat', checks: [] };

  sections.push(rewardSection, thermostatSection);

  const rewardAddressField = readAddressField(thermoConfig.rewardEngine ?? {}, 'address');
  const thermostatAddressField = readAddressField(thermoConfig.thermostat ?? {}, 'address');

  let rewardAddress: string | null = null;
  if (rewardAddressField.defined) {
    rewardAddress = rewardAddressField.value ?? null;
  } else if (addressBook?.rewardEngine) {
    try {
      rewardAddress = normaliseAddress(addressBook.rewardEngine);
    } catch (error) {
      notes.push(`Invalid rewardEngine address in address book: ${String(error)}`);
    }
  }

  let thermostatAddress: string | null = null;
  if (thermostatAddressField.defined) {
    thermostatAddress = thermostatAddressField.value ?? null;
  } else if (addressBook?.thermostat) {
    try {
      thermostatAddress = normaliseAddress(addressBook.thermostat);
    } catch (error) {
      notes.push(`Invalid thermostat address in address book: ${String(error)}`);
    }
  }

  if (!rewardAddressField.defined && rewardAddress) {
    notes.push('RewardEngine address sourced from deployment-addresses.json');
  }
  if (!thermostatAddressField.defined && thermostatAddress) {
    notes.push('Thermostat address sourced from deployment-addresses.json');
  }

  let rewardContract: import('ethers').Contract | null = null;
  if (rewardAddress && rewardAddress !== ZERO_ADDRESS) {
    try {
      rewardContract = await fetchRewardEngine(rewardAddress);
    } catch (error) {
      notes.push(`Failed to instantiate RewardEngineMB at ${rewardAddress}: ${String(error)}`);
    }
  }

  let thermostatContract: import('ethers').Contract | null = null;
  if (thermostatAddress && thermostatAddress !== ZERO_ADDRESS) {
    try {
      thermostatContract = await fetchThermostat(thermostatAddress);
    } catch (error) {
      notes.push(`Failed to instantiate Thermostat at ${thermostatAddress}: ${String(error)}`);
    }
  }

  compareAddresses(
    rewardSection,
    'RewardEngine address',
    rewardAddressField,
    rewardContract ? await rewardContract.getAddress() : rewardAddress
  );
  compareAddresses(
    rewardSection,
    'Thermostat (linked via RewardEngine)',
    readAddressField(thermoConfig.rewardEngine ?? {}, 'thermostat'),
    rewardContract ? (await rewardContract.thermostat()).toString() : thermostatAddress,
    { notes: rewardContract ? undefined : ['RewardEngine contract unavailable; falling back to address book'] }
  );
  compareAddresses(
    rewardSection,
    'Treasury',
    readAddressField(thermoConfig.rewardEngine ?? {}, 'treasury'),
    rewardContract ? (await rewardContract.treasury()).toString() : null
  );
  compareAddresses(
    rewardSection,
    'Energy oracle',
    readAddressField(thermoConfig.rewardEngine ?? {}, 'energyOracle'),
    rewardContract ? (await rewardContract.energyOracle()).toString() : null
  );
  compareAddresses(
    rewardSection,
    'Fee pool',
    readAddressField(thermoConfig.rewardEngine ?? {}, 'feePool'),
    rewardContract ? (await rewardContract.feePool()).toString() : null
  );
  compareAddresses(
    rewardSection,
    'Reputation engine',
    readAddressField(thermoConfig.rewardEngine ?? {}, 'reputation'),
    rewardContract ? (await rewardContract.reputation()).toString() : null
  );

  compareBigInts(
    rewardSection,
    'Kappa (scaling)',
    readBigIntField(thermoConfig.rewardEngine ?? {}, 'kappa'),
    rewardContract ? (await rewardContract.kappa()) : null,
    formatWad
  );
  compareBigInts(
    rewardSection,
    'Fallback temperature',
    readBigIntField(thermoConfig.rewardEngine ?? {}, 'temperature', { signed: true }),
    rewardContract ? (await rewardContract.temperature()) : null,
    formatSignedWad
  );
  compareBigInts(
    rewardSection,
    'Max proofs per role',
    readBigIntField(thermoConfig.rewardEngine ?? {}, 'maxProofs'),
    rewardContract ? (await rewardContract.maxProofs()) : null
  );

  const configRoleShares: Array<bigint | null> = [];
  const chainRoleShares: Array<bigint | null> = [];
  let missingRoleShare = false;
  for (const role of ROLE_KEYS) {
    const roleShares = readRoleShareField(
      (thermoConfig.rewardEngine?.roleShares ?? {})[role]
    );
    configRoleShares.push(roleShares.value ?? null);
    if (!roleShares.defined || roleShares.value === null) {
      missingRoleShare = true;
    }
    let onChainValue: bigint | null = null;
    if (rewardContract) {
      onChainValue = await rewardContract.roleShare(ROLE_INDEX[role]);
    }
    chainRoleShares.push(onChainValue);
    compareRoleShare(rewardSection, role, roleShares, onChainValue);
  }

  for (const role of ROLE_KEYS) {
    const muField = readBigIntField(
      thermoConfig.rewardEngine?.mu ?? {},
      role,
      { signed: true }
    );
    const muOnChain = rewardContract
      ? await rewardContract.mu(ROLE_INDEX[role])
      : null;
    compareBigInts(
      rewardSection,
      `${ROLE_LABEL[role]} μ`,
      muField,
      muOnChain,
      formatSignedWad
    );
  }

  for (const role of ROLE_KEYS) {
    const baselineField = readBigIntField(
      thermoConfig.rewardEngine?.baselineEnergy ?? {},
      role,
      { signed: true }
    );
    const baselineOnChain = rewardContract
      ? await rewardContract.baselineEnergy(ROLE_INDEX[role])
      : null;
    compareBigInts(
      rewardSection,
      `${ROLE_LABEL[role]} baseline energy`,
      baselineField,
      baselineOnChain,
      formatSignedWad
    );
  }

  if (thermoConfig.rewardEngine?.settlers) {
    for (const [addressKey, desired] of Object.entries(
      thermoConfig.rewardEngine.settlers
    )) {
      const settlerField = readBooleanField(
        { desired },
        'desired'
      );
      let onChain: boolean | null = null;
      let formattedAddress: string | null = null;
      try {
        formattedAddress = formatAddress(normaliseAddress(addressKey));
      } catch (error) {
        rewardSection.checks.push({
          parameter: `Settler ${addressKey}`,
          status: 'error',
          configValue: String(desired),
          onChainValue: undefined,
          notes: [`Invalid settler address: ${String(error)}`],
        });
        continue;
      }
      if (rewardContract && formattedAddress) {
        onChain = await rewardContract.settlers(formattedAddress);
      }
      const result: CheckResult = {
        parameter: `Settler ${formattedAddress ?? addressKey}`,
        configValue:
          settlerField.defined && settlerField.value !== null
            ? settlerField.value
              ? 'true'
              : 'false'
            : settlerField.defined
            ? null
            : undefined,
        onChainValue:
          onChain === null ? null : onChain ? 'true' : 'false',
        status: 'skipped',
      };
      if (!settlerField.defined) {
        result.status = 'config-missing';
      } else if (onChain === null) {
        result.status = 'contract-missing';
      } else if (settlerField.value === null) {
        result.status = 'config-missing';
      } else if (settlerField.value === onChain) {
        result.status = 'match';
      } else {
        result.status = 'drift';
      }
      rewardSection.checks.push(result);
    }
  }

  const totalShare = configRoleShares.reduce((acc, value) => acc + (value ?? 0n), 0n);
  const onChainSum = chainRoleShares.reduce((acc, value) => acc + (value ?? 0n), 0n);
  const shareSumCheck: CheckResult = {
    parameter: 'Role share sum',
    configValue: formatPercent(totalShare),
    onChainValue: rewardContract ? formatPercent(onChainSum) : null,
    status: missingRoleShare
      ? 'config-missing'
      : rewardContract
      ? totalShare === onChainSum
        ? 'match'
        : 'drift'
      : 'contract-missing',
    notes: ['Ensure total equals 100% (1.0 wad)'],
  };
  rewardSection.checks.push(shareSumCheck);

  compareAddresses(
    thermostatSection,
    'Thermostat address',
    thermostatAddressField,
    thermostatContract ? await thermostatContract.getAddress() : thermostatAddress
  );

  compareBigInts(
    thermostatSection,
    'System temperature',
    readBigIntField(thermoConfig.thermostat ?? {}, 'systemTemperature', {
      signed: true,
    }),
    thermostatContract ? (await thermostatContract.systemTemperature()) : null,
    formatSignedWad
  );
  const bounds = thermoConfig.thermostat?.bounds ?? {};
  compareBigInts(
    thermostatSection,
    'Min temperature',
    readBigIntField(bounds, 'min', { signed: true }),
    thermostatContract ? (await thermostatContract.minTemp()) : null,
    formatSignedWad
  );
  compareBigInts(
    thermostatSection,
    'Max temperature',
    readBigIntField(bounds, 'max', { signed: true }),
    thermostatContract ? (await thermostatContract.maxTemp()) : null,
    formatSignedWad
  );

  const pid = thermoConfig.thermostat?.pid ?? {};
  compareBigInts(
    thermostatSection,
    'PID kp',
    readBigIntField(pid, 'kp', { signed: true }),
    thermostatContract ? (await thermostatContract.kp()) : null,
    formatSignedWad
  );
  compareBigInts(
    thermostatSection,
    'PID ki',
    readBigIntField(pid, 'ki', { signed: true }),
    thermostatContract ? (await thermostatContract.ki()) : null,
    formatSignedWad
  );
  compareBigInts(
    thermostatSection,
    'PID kd',
    readBigIntField(pid, 'kd', { signed: true }),
    thermostatContract ? (await thermostatContract.kd()) : null,
    formatSignedWad
  );

  const kpiWeights = thermoConfig.thermostat?.kpiWeights ?? {};
  compareBigInts(
    thermostatSection,
    'KPI weight (emission)',
    readBigIntField(kpiWeights, 'emission', { signed: true }),
    thermostatContract ? (await thermostatContract.wEmission()) : null,
    formatSignedWad
  );
  compareBigInts(
    thermostatSection,
    'KPI weight (backlog)',
    readBigIntField(kpiWeights, 'backlog', { signed: true }),
    thermostatContract ? (await thermostatContract.wBacklog()) : null,
    formatSignedWad
  );
  compareBigInts(
    thermostatSection,
    'KPI weight (SLA)',
    readBigIntField(kpiWeights, 'sla', { signed: true }),
    thermostatContract ? (await thermostatContract.wSla()) : null,
    formatSignedWad
  );

  const integralBounds = thermoConfig.thermostat?.integralBounds ?? {};
  compareBigInts(
    thermostatSection,
    'Integral min',
    readBigIntField(integralBounds, 'min', { signed: true }),
    thermostatContract ? (await thermostatContract.integralMin()) : null,
    formatSignedWad
  );
  compareBigInts(
    thermostatSection,
    'Integral max',
    readBigIntField(integralBounds, 'max', { signed: true }),
    thermostatContract ? (await thermostatContract.integralMax()) : null,
    formatSignedWad
  );

  if (thermoConfig.thermostat?.roleTemperatures) {
    for (const [roleKey, raw] of Object.entries(
      thermoConfig.thermostat.roleTemperatures
    )) {
      if (!ROLE_KEYS.includes(roleKey as RoleKey)) {
        thermostatSection.checks.push({
          parameter: `Role temperature ${roleKey}`,
          configValue: String(raw),
          onChainValue: undefined,
          status: 'error',
          notes: ['Unknown role key'],
        });
        continue;
      }
      const field = readBigIntField(
        thermoConfig.thermostat.roleTemperatures,
        roleKey,
        { signed: true }
      );
      const onChainValue = thermostatContract
        ? await thermostatContract.getRoleTemperature(ROLE_INDEX[roleKey as RoleKey])
        : null;
      compareBigInts(
        thermostatSection,
        `${ROLE_LABEL[roleKey as RoleKey]} role temperature`,
        field,
        onChainValue,
        formatSignedWad
      );
    }
  }

  const output =
    options.format === 'json'
      ? renderJson(configNetwork, sections, notes)
      : renderMarkdown(configNetwork, sections, notes);

  if (options.outPath) {
    await fs.writeFile(options.outPath, output, 'utf8');
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error('Thermodynamics report failed:', error);
  process.exitCode = 1;
});
