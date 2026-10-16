'use strict';
// Deliberately does not import the root config, dotenv, external networks, or
// credential/account overrides. Only this demo's explicit execution uses it.
require('ts-node/register/transpile-only');
require('@nomicfoundation/hardhat-toolbox');
const path = require('node:path');
const fs = require('node:fs/promises');
const { keccak256 } = require('ethers');
const { subtask } = require('hardhat/config');
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require('hardhat/builtin-tasks/task-names');
const { getCompilersDir } = require('hardhat/internal/util/global-dir');
const {
  CompilerDownloader,
  CompilerPlatform,
} = require('hardhat/internal/solidity/compiler/downloader');
const { localEndpoint } = require('../../aurora/bin/local-rpc.cjs');
const root = path.resolve(__dirname, '../../..');
const { url } = localEndpoint();
const version = '0.8.37';
const longVersion = '0.8.37+commit.f401782d';

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }) => {
    if (solcVersion !== version)
      throw new Error(`Only Solidity ${version} is supported.`);
    const cache = await getCompilersDir();
    // Native or WASM cache entries are acceptable; nothing downloads a compiler.
    for (const platform of new Set([
      CompilerDownloader.getCompilerPlatform(),
      CompilerPlatform.WASM,
    ])) {
      const list = await fs
        .readFile(path.join(cache, platform, 'list.json'), 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      const build = list?.builds?.find(
        (item) => item.version === version && !item.prerelease
      );
      if (
        !build ||
        !/^0x[0-9a-fA-F]{64}$/.test(build.keccak256) ||
        build.longVersion !== longVersion ||
        typeof build.path !== 'string' ||
        path.basename(build.path) !== build.path
      )
        continue;
      const downloader = CompilerDownloader.getConcurrencySafeDownloader(
        platform,
        cache
      );
      if (!(await downloader.isCompilerDownloaded(version))) continue;
      const compiler = await downloader.getCompiler(version);
      if (!compiler) continue;
      if (
        keccak256(await fs.readFile(compiler.compilerPath)).toLowerCase() !==
        build.keccak256.toLowerCase()
      ) {
        throw new Error(
          'Cached Solidity compiler checksum mismatch; refusing execution.'
        );
      }
      return compiler;
    }
    throw new Error(
      `A verified cached Solidity ${version} compiler is required. No download fallback is permitted; provision the compiler separately.`
    );
  }
);

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: {
    compilers: [
      {
        version,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: 'cancun',
          outputSelection: { '*': { '*': ['storageLayout'] } },
        },
      },
    ],
  },
  paths: {
    root,
    sources: path.join(root, 'contracts'),
    tests: path.join(root, 'test'),
    cache: path.join(root, 'cache/cosmic-local'),
    artifacts: path.join(root, 'artifacts/cosmic-local'),
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: false,
      gas: 'auto',
      blockGasLimit: 30000000,
    },
    localhost: { url, chainId: 31337, accounts: 'remote' },
  },
  mocha: { require: ['ts-node/register', path.join(root, 'test/setup.js')] },
};
