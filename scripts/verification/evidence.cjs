'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ethers = require('ethers');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function stable(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  return value;
}
const digest = (value) => sha256(JSON.stringify(stable(value)));
const lower = (value) => String(value).toLowerCase();
function insist(condition, message) {
  if (!condition) {
    const error = Error(message);
    error.verificationInvariant = true;
    throw error;
  }
}
function safeError(error) {
  // Do not copy provider messages, request bodies, URLs or stack traces into evidence.
  if (error?.verificationInvariant)
    return { code: 'VERIFICATION_INVARIANT', message: error.message };
  const code = String(error?.code || 'VERIFICATION_ERROR');
  return {
    code: /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'VERIFICATION_ERROR',
    message:
      'Verification could not be completed. Inspect the provider privately and retry with the retained inputs.',
  };
}
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function exclusiveJSON(file, value) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function readArchive(directory, expectedHash) {
  const root = path.resolve(directory),
    indexBytes = fs.readFileSync(path.join(root, 'index.json'));
  insist(sha256(indexBytes) === expectedHash, 'Archive index hash mismatch');
  const index = JSON.parse(indexBytes);
  const cache = new Map();
  const read = (name) => {
    if (cache.has(name)) return cache.get(name);
    const file = path.resolve(root, name);
    insist(
      file.startsWith(root + path.sep),
      'Archive path escapes its directory'
    );
    const bytes = fs.readFileSync(file);
    insist(
      sha256(bytes) === index.files[name],
      `Archive file hash mismatch: ${name}`
    );
    const parsed = JSON.parse(bytes);
    cache.set(name, parsed);
    return parsed;
  };
  // Check every archived byte, including sources not selected for deployment.
  for (const name of Object.keys(index.files)) read(name);
  insist(
    index.developmentInventory?.sources?.length > 0,
    'Archive lacks complete development inventory'
  );
  const contracts = new Map();
  const checkedBuilds = new Map();
  for (const item of index.contracts) {
    const artifact = read(item.artifact),
      build = read(item.buildInfo),
      input = read(item.standardInput);
    if (!checkedBuilds.has(item.buildInfo)) {
      require('../ci/solidity-policy.cjs').checkCompiler(build);
      require('../ci/solidity-policy.cjs').checkDiagnostics(build);
      insist(
        digest(input) === digest(build.input),
        'Archived standard input differs from build input'
      );
      checkedBuilds.set(item.buildInfo, item.standardInput);
    } else {
      insist(
        checkedBuilds.get(item.buildInfo) === item.standardInput,
        'One build cannot reference different standard input files'
      );
    }
    const compiled = build.output?.contracts?.[item.source]?.[item.contract];
    insist(
      compiled &&
        `0x${compiled.evm.bytecode.object}` === artifact.bytecode &&
        `0x${compiled.evm.deployedBytecode.object}` ===
          artifact.deployedBytecode &&
        digest(compiled.abi) === digest(artifact.abi),
      'Archived artifact differs from compiler output'
    );
    contracts.set(item.fullyQualified, {
      ...item,
      artifact,
      build,
      compiled,
      input,
      artifactSha256: index.files[item.artifact],
      buildSha256: index.files[item.buildInfo],
      standardInputSha256: index.files[item.standardInput],
    });
  }
  for (const source of index.developmentInventory.sources) {
    insist(
      Array.isArray(source.contracts),
      'Malformed development source inventory'
    );
    for (const fullyQualified of source.contracts)
      insist(
        contracts.has(fullyQualified),
        'Archive omitted required definition: ' + fullyQualified
      );
  }
  return { root, index, indexSha256: expectedHash, contracts };
}
function linkedCode(code, references, libraries = {}) {
  let result = code.startsWith('0x') ? code.slice(2) : code;
  const used = [];
  for (const [source, names] of Object.entries(references || {}))
    for (const [name, positions] of Object.entries(names)) {
      const fq = `${source}:${name}`,
        address = libraries[fq];
      insist(
        ethers.isAddress(address),
        `Missing linked library address: ${fq}`
      );
      used.push(fq);
      for (const { start, length } of positions) {
        insist(length === 20, 'Invalid library link width');
        result =
          result.slice(0, start * 2) +
          address.slice(2).toLowerCase() +
          result.slice((start + length) * 2);
      }
    }
  insist(/^(?:[0-9a-fA-F]{2})*$/.test(result), 'Unresolved bytecode link');
  return { code: '0x' + result.toLowerCase(), used };
}
function expectedCreation(entry, artifact) {
  const args = entry.constructorArguments || '0x';
  insist(
    /^0x(?:[a-fA-F0-9]{2})*$/.test(args),
    'Malformed original constructor bytes'
  );
  const iface = new ethers.Interface(artifact.artifact.abi);
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
    iface.deploy.inputs,
    args
  );
  insist(
    lower(iface.encodeDeploy(decoded)) === lower(args),
    'Noncanonical constructor encoding'
  );
  return (
    linkedCode(
      artifact.artifact.bytecode,
      artifact.compiled.evm.bytecode.linkReferences,
      entry.libraries
    ).code + args.slice(2).toLowerCase()
  );
}
function exactRuntime(entry, artifact, runtime, traceRuntime) {
  insist(
    /^0x(?:[a-fA-F0-9]{2})+$/.test(runtime),
    'Absent or malformed runtime code'
  );
  let expected = linkedCode(
    artifact.artifact.deployedBytecode,
    artifact.compiled.evm.deployedBytecode.linkReferences,
    entry.libraries
  ).code;
  const substitutions = {};
  const isLibrary = artifact.build.output?.sources?.[
    artifact.source
  ]?.ast?.nodes?.some(
    (node) =>
      node.nodeType === 'ContractDefinition' &&
      node.name === artifact.contract &&
      node.contractKind === 'library'
  );
  if (isLibrary && expected.startsWith('0x73' + '0'.repeat(40) + '3014')) {
    insist(ethers.isAddress(entry.address), 'Missing deployed library address');
    expected =
      '0x73' + entry.address.slice(2).toLowerCase() + expected.slice(44);
    substitutions.librarySelfAddress = entry.address.toLowerCase();
  }
  const refs = artifact.compiled.evm.deployedBytecode.immutableReferences || {};
  if (Object.keys(refs).length) {
    insist(
      traceRuntime && lower(traceRuntime) === lower(runtime),
      'Immutable runtime requires canonical constructor trace output matching deployed code'
    );
    for (const [id, positions] of Object.entries(refs)) {
      let value;
      for (const { start, length } of positions) {
        const current = runtime.slice(2 + start * 2, 2 + (start + length) * 2);
        insist(current.length === length * 2, 'Truncated immutable');
        insist(
          value === undefined || value === current,
          'Inconsistent immutable substitutions'
        );
        value = current;
        expected =
          expected.slice(0, 2 + start * 2) +
          current +
          expected.slice(2 + (start + length) * 2);
      }
      substitutions[id] = '0x' + value;
    }
  }
  insist(
    lower(expected) === lower(runtime),
    'Runtime bytecode mismatch (including links/immutables/metadata)'
  );
  return {
    runtimeSha256: sha256(lower(runtime)),
    immutableSubstitutions: substitutions,
    immutableSha256: digest(substitutions),
    libraries: entry.libraries || {},
    librariesSha256: digest(entry.libraries || {}),
  };
}
function traceCreate(trace, address, initcode) {
  if (!trace || trace.error) return undefined;
  if (
    ['CREATE', 'CREATE2'].includes(trace.type) &&
    lower(trace.to) === lower(address) &&
    lower(trace.input) === lower(initcode)
  )
    return trace.output;
  for (const call of trace.calls || []) {
    const result = traceCreate(call, address, initcode);
    if (result) return result;
  }
}
function parseExplorerInput(source) {
  if (typeof source !== 'string') throw Error('Explorer source input missing');
  return JSON.parse(
    source.startsWith('{{') && source.endsWith('}}')
      ? source.slice(1, -1)
      : source
  );
}
function explorerInput(entry, artifact) {
  const input = structuredClone(artifact.input);
  if (Object.keys(entry.libraries || {}).length) {
    input.settings.libraries ||= {};
    for (const [fullyQualified, address] of Object.entries(entry.libraries)) {
      const cut = fullyQualified.lastIndexOf(':');
      insist(
        cut > 0 && ethers.isAddress(address),
        'Invalid explorer library identity'
      );
      const source = fullyQualified.slice(0, cut),
        name = fullyQualified.slice(cut + 1);
      input.settings.libraries[source] ||= {};
      input.settings.libraries[source][name] = address;
    }
  }
  return input;
}
function compareExplorer(entry, artifact, metadata) {
  insist(
    metadata &&
      metadata.SourceCode &&
      metadata.ABI !== 'Contract source code not verified',
    'Explorer source is not verified'
  );
  const input = parseExplorerInput(metadata.SourceCode);
  insist(
    digest(input) === digest(explorerInput(entry, artifact)),
    'Explorer source/settings are not the exact archived input and library bindings'
  );
  insist(
    String(metadata.CompilerVersion).replace(/^v/, '') ===
      artifact.build.solcLongVersion.replace(/\.Emscripten\.clang$/, ''),
    'Explorer compiler mismatch'
  );
  insist(
    metadata.ContractName === entry.fullyQualified ||
      metadata.ContractName === artifact.contract,
    'Explorer contract identity mismatch'
  );
  insist(
    lower(metadata.ConstructorArguments || '').replace(/^0x/, '') ===
      lower(entry.constructorArguments || '0x').slice(2),
    'Explorer constructor mismatch'
  );
  insist(
    String(metadata.OptimizationUsed) === '1' &&
      Number(metadata.Runs) === artifact.input.settings.optimizer.runs,
    'Explorer optimizer mismatch'
  );
  insist(
    (metadata.EVMVersion || '').toLowerCase() ===
      artifact.input.settings.evmVersion,
    'Explorer EVM version mismatch'
  );
  return {
    status: 'verified',
    identitySha256: digest({
      fullyQualified: entry.fullyQualified,
      compiler: artifact.build.solcLongVersion,
      input: artifact.input,
      constructorArguments: lower(entry.constructorArguments || '0x'),
      libraries: entry.libraries || {},
    }),
  };
}
function explorerClient({
  apiKey,
  fetchImpl = fetch,
  endpoint = 'https://api.etherscan.io/v2/api',
}) {
  insist(
    endpoint === 'https://api.etherscan.io/v2/api',
    'Only the official Etherscan v2 endpoint is supported'
  );
  async function request(parameters, post = false) {
    insist(apiKey, 'Explorer API key required for exact metadata verification');
    const body = new URLSearchParams({ ...parameters, apikey: apiKey });
    const response = await fetchImpl(
      post ? endpoint : `${endpoint}?${body}`,
      post
        ? { method: 'POST', body, signal: AbortSignal.timeout(30000) }
        : { signal: AbortSignal.timeout(30000) }
    );
    insist(response.ok, 'Explorer HTTP error');
    return response.json();
  }
  return {
    async read(chainId, address) {
      const result = await request({
        chainid: String(chainId),
        module: 'contract',
        action: 'getsourcecode',
        address,
      });
      insist(
        result.status === '1' &&
          Array.isArray(result.result) &&
          result.result.length === 1,
        'Explorer metadata unavailable'
      );
      return result.result[0];
    },
    async submit(chainId, entry, artifact) {
      const result = await request(
        {
          chainid: String(chainId),
          module: 'contract',
          action: 'verifysourcecode',
          contractaddress: entry.address,
          sourceCode: JSON.stringify(explorerInput(entry, artifact)),
          codeformat: 'solidity-standard-json-input',
          contractname: entry.fullyQualified,
          compilerversion:
            'v' +
            artifact.build.solcLongVersion.replace(/\.Emscripten\.clang$/, ''),
          constructorArguements: (entry.constructorArguments || '0x').slice(2),
        },
        true
      );
      // A GUID, already-verified response or successful submission is never qualification.
      return {
        status: 'submitted-unconfirmed',
        accepted: result.status === '1',
      };
    },
  };
}
async function verifyExplorer(
  client,
  chainId,
  entry,
  artifact,
  { submit = false } = {}
) {
  try {
    const metadata = await client.read(chainId, entry.address);
    if (!metadata.SourceCode) {
      if (submit) return await client.submit(chainId, entry, artifact);
      return { status: 'unverified' };
    }
    return compareExplorer(entry, artifact, metadata);
  } catch (error) {
    return { status: 'failed', error: safeError(error) };
  }
}
module.exports = {
  sha256,
  stable,
  digest,
  lower,
  insist,
  safeError,
  readJSON,
  exclusiveJSON,
  readArchive,
  linkedCode,
  expectedCreation,
  exactRuntime,
  traceCreate,
  compareExplorer,
  explorerInput,
  explorerClient,
  verifyExplorer,
};
