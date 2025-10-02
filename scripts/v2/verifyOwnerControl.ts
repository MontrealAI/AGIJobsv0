import { summariseResults, verifyOwnerControl, type ModuleCheck } from './lib/ownerControlVerification';

type CliOptions = {
  json: boolean;
  strict: boolean;
  configNetwork?: string;
  modules?: string[];
  skip?: string[];
  addressBookPath?: string;
  addressOverrides: Record<string, string>;
};

type CliFlags = {
  jsonSetByCli: boolean;
  strictSetByCli: boolean;
  modulesSetByCli: boolean;
  addressBookSetByCli: boolean;
};

function parseBooleanEnv(value?: string | null): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) {
    return false;
  }
  return undefined;
}

function parseListEnv(value?: string | null): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

function parseOverridesEnv(value?: string | null): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    return undefined;
  }
  const overrides: Record<string, string> = {};
  for (const entry of entries) {
    const [key, addr] = entry.split('=');
    if (!key || !addr) {
      throw new Error(
        `OWNER_VERIFY_ADDRESS_OVERRIDES entries must be <module>=<address>; received "${entry}"`
      );
    }
    overrides[key.trim()] = addr.trim();
  }
  return overrides;
}

function parseArgs(argv: string[]): { options: CliOptions; flags: CliFlags } {
  const options: CliOptions = {
    json: false,
    strict: false,
    addressOverrides: {},
  };
  const flags: CliFlags = {
    jsonSetByCli: false,
    strictSetByCli: false,
    modulesSetByCli: false,
    addressBookSetByCli: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        options.json = true;
        flags.jsonSetByCli = true;
        break;
      case '--strict':
      case '--require':
        options.strict = true;
        flags.strictSetByCli = true;
        break;
      case '--config-network':
      case '--network-config': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.configNetwork = value;
        i += 1;
        break;
      }
      case '--modules':
      case '--include': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a comma-separated value`);
        }
        options.modules = value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        flags.modulesSetByCli = true;
        i += 1;
        break;
      }
      case '--skip':
      case '--exclude': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a comma-separated value`);
        }
        options.skip = value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        i += 1;
        break;
      }
      case '--address-book': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--address-book requires a file path');
        }
        options.addressBookPath = value;
        flags.addressBookSetByCli = true;
        i += 1;
        break;
      }
      case '--address':
      case '--module-address': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires <module>=<address>`);
        }
        const [key, addr] = value.split('=');
        if (!key || !addr) {
          throw new Error(`${arg} expects <module>=<address>`);
        }
        options.addressOverrides[key.trim()] = addr.trim();
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { options, flags };
}

function formatStatus(status: ModuleCheck['status']): string {
  switch (status) {
    case 'ok':
      return '✅ ok';
    case 'mismatch':
      return '❌ mismatch';
    case 'missing-address':
      return '⚠️ missing-address';
    case 'missing-expected':
      return '⚠️ missing-expected';
    case 'skipped':
      return '⏭️ skipped';
    case 'error':
    default:
      return '❌ error';
  }
}

function printHumanReadable(
  header: {
    chainId: bigint;
    networkName: string;
    hardhatNetwork: string;
    signer?: string | null;
    configPath: string;
    addressBookPath: string;
  },
  results: ModuleCheck[]
) {
  console.log('AGIJobs Owner Control Verification');
  console.log('-----------------------------------');
  console.log(`Runtime network: ${header.networkName} (chainId ${header.chainId})`);
  console.log(`Hardhat network: ${header.hardhatNetwork}`);
  console.log(`Config path: ${header.configPath}`);
  console.log(`Address book: ${header.addressBookPath}`);
  if (header.signer) {
    console.log(`Signer:       ${header.signer}`);
  }
  console.log('');

  for (const result of results) {
    console.log(`${formatStatus(result.status)}  ${result.label}`);
    if (result.address) {
      console.log(
        `    Address:   ${result.address}${
          result.addressSource ? ` (${result.addressSource})` : ''
        }`
      );
    }
    if (result.currentOwner) {
      console.log(`    Owner:     ${result.currentOwner}`);
    }
    if (result.pendingOwner) {
      console.log(`    Pending:   ${result.pendingOwner}`);
    }
    if (result.expectedOwner) {
      console.log(
        `    Expected:  ${result.expectedOwner}${
          result.expectedSource ? ` (${result.expectedSource})` : ''
        }`
      );
    }
    if (result.error) {
      console.log(`    Error:     ${result.error}`);
    }
    if (result.notes.length > 0) {
      for (const note of result.notes) {
        console.log(`    Note:      ${note}`);
      }
    }
    console.log('');
  }

  const summary = summariseResults(results);
  console.log('Summary');
  console.log('-------');
  console.log(`  ✅ ok:                 ${summary.ok}`);
  console.log(`  ❌ mismatch:          ${summary.mismatch}`);
  console.log(`  ⚠️ missing address:   ${summary.missingAddress}`);
  console.log(`  ⚠️ missing expected:  ${summary.missingExpected}`);
  console.log(`  ⏭️ skipped:            ${summary.skipped}`);
  console.log(`  ❌ errors:            ${summary.error}`);
  console.log('');
}

async function main() {
  const { options: cliOptions, flags } = parseArgs(process.argv.slice(2));
  const resolvedOptions: CliOptions = { ...cliOptions };

  const envJson = parseBooleanEnv(process.env.OWNER_VERIFY_JSON);
  if (!flags.jsonSetByCli && envJson !== undefined) {
    resolvedOptions.json = envJson;
  }

  const envStrict = parseBooleanEnv(process.env.OWNER_VERIFY_STRICT);
  if (!flags.strictSetByCli && envStrict !== undefined) {
    resolvedOptions.strict = envStrict;
  }

  if (!resolvedOptions.configNetwork && process.env.OWNER_VERIFY_CONFIG_NETWORK) {
    resolvedOptions.configNetwork = process.env.OWNER_VERIFY_CONFIG_NETWORK.trim();
  }

  const envModules = parseListEnv(process.env.OWNER_VERIFY_MODULES);
  if (!flags.modulesSetByCli && envModules) {
    resolvedOptions.modules = envModules;
  }

  const envSkip = parseListEnv(process.env.OWNER_VERIFY_SKIP);
  if (envSkip && envSkip.length > 0) {
    const existing = new Set(resolvedOptions.skip ?? []);
    envSkip.forEach((entry) => existing.add(entry));
    resolvedOptions.skip = Array.from(existing);
  }

  if (!flags.addressBookSetByCli && process.env.OWNER_VERIFY_ADDRESS_BOOK) {
    resolvedOptions.addressBookPath = process.env.OWNER_VERIFY_ADDRESS_BOOK.trim();
  }

  const envOverrides = parseOverridesEnv(process.env.OWNER_VERIFY_ADDRESS_OVERRIDES);
  if (envOverrides) {
    const merged: Record<string, string> = { ...envOverrides };
    for (const [key, value] of Object.entries(resolvedOptions.addressOverrides)) {
      merged[key] = value;
    }
    resolvedOptions.addressOverrides = merged;
  }

  const verification = await verifyOwnerControl({
    configNetwork: resolvedOptions.configNetwork,
    modules: resolvedOptions.modules,
    skip: resolvedOptions.skip,
    addressBookPath: resolvedOptions.addressBookPath,
    addressOverrides: resolvedOptions.addressOverrides,
  });

  const jsonOutput = {
    network: {
      chainId: verification.metadata.chainId.toString(),
      name: verification.metadata.networkName,
      hardhat: verification.metadata.hardhatNetwork,
    },
    signer: verification.metadata.signer,
    configPath: verification.metadata.configPath,
    addressBookPath: verification.metadata.addressBookPath,
    results: verification.results.map((result) => ({
      key: result.key,
      label: result.label,
      type: result.type,
      address: result.address,
      addressSource: result.addressSource,
      expectedOwner: result.expectedOwner,
      expectedSource: result.expectedSource,
      currentOwner: result.currentOwner,
      pendingOwner: result.pendingOwner,
      status: result.status,
      notes: result.notes,
      error: result.error,
    })),
    summary: verification.summary,
  };

  if (resolvedOptions.json) {
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    printHumanReadable(
      {
        chainId: verification.metadata.chainId,
        networkName: verification.metadata.networkName,
        hardhatNetwork: verification.metadata.hardhatNetwork,
        signer: verification.metadata.signer,
        configPath: verification.metadata.configPath,
        addressBookPath: verification.metadata.addressBookPath,
      },
      verification.results
    );
  }

  if (resolvedOptions.strict) {
    const { mismatch, missingAddress, missingExpected, error } = verification.summary;
    const failures = mismatch + missingAddress + missingExpected + error;
    if (failures > 0) {
      throw new Error('Owner control verification failed.');
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
