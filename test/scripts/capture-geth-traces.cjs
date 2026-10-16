'use strict';
// Manual integration test only: starts an explicitly supplied, already verified
// official Geth binary in a disposable, peerless dev chain. Never accepts an RPC
// URL, wallet or private key. No production compiler/qualification evidence.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const ethers = require('ethers');
const solc = require('solc');
const {
  validateCreationTraces,
} = require('../../scripts/verification/trace-evidence.cjs');
const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Leaf { constructor(bool fail) { if (fail) revert(); assembly { mstore(0, 0) return(31, 1) } } }
contract Nested { constructor() { new Leaf(false); assembly { mstore(0, 0) return(31, 1) } } }
contract Oversized { constructor() { assembly { return(0, 24577) } } }
contract Factory {
  constructor() { new Leaf(false); }
  function success() external { new Leaf(false); }
  function salted() external { new Leaf{salt: bytes32(uint256(12))}(false); }
  function nested() external { new Nested(); }
  function failed() external { try new Leaf(true) {} catch {} }
  function scope() external { new Leaf(false); revert(); }
  function revertedAncestor() external { try this.scope() {} catch {} }
  function codeDeposit() external { try new Oversized() {} catch {} }
  function collision() external { try new Leaf{salt: bytes32(uint256(13))}(false) {} catch {} try new Leaf{salt: bytes32(uint256(13))}(false) {} catch {} }
}`;
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, '127.0.0.1', resolve).once('error', reject)
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function main() {
  const [binary, output, canonicalArchive] = process.argv.slice(2);
  if (!binary || !path.isAbsolute(binary) || !output || fs.existsSync(output))
    throw Error(
      'Usage: node capture-geth-traces.cjs ABSOLUTE_VERIFIED_GETH NEW_OUTPUT_JSON'
    );
  const input = {
    language: 'Solidity',
    sources: { 'TraceFixture.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
  if (compiled.errors?.some((e) => e.severity === 'error'))
    throw Error('Fixture compilation failed');
  const contract = compiled.contracts['TraceFixture.sol'].Factory;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geth-verification-dev-'));
  const port = await freePort(),
    authPort = await freePort();
  const args = [
    '--dev',
    '--datadir',
    dir,
    '--ipcdisable',
    '--http',
    '--http.addr',
    '127.0.0.1',
    '--http.port',
    String(port),
    '--http.api',
    'eth,net,web3,debug',
    '--authrpc.addr',
    '127.0.0.1',
    '--authrpc.port',
    String(authPort),
    '--port',
    '0',
    '--nodiscover',
    '--maxpeers',
    '0',
    '--nat',
    'none',
    '--verbosity',
    '1',
  ];
  const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stopped = false,
    spawnError,
    stderr = '';
  child.on('exit', () => {
    stopped = true;
  });
  child.on('error', (e) => {
    spawnError = e;
    stopped = true;
  });
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-8192);
  });
  const rpc = async (method, params = []) => {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(60000),
    });
    const body = await response.json();
    if (body.error)
      throw Error(`${method}: ${body.error.code} ${body.error.message}`);
    return body.result;
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (stopped)
        throw Error(
          'Local Geth exited before startup: ' + (spawnError?.code || stderr)
        );
      try {
        await rpc('web3_clientVersion');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!ready) throw Error('Local Geth did not become ready');
    const chainId = await rpc('eth_chainId');
    if (chainId !== '0x539' || (await rpc('net_peerCount')) !== '0x0')
      throw Error('Local peerless development chain assertion failed');
    const account = (await rpc('eth_accounts'))[0];
    const evidence = {
      schemaVersion: 1,
      localOnly: true,
      clientVersion: await rpc('web3_clientVersion'),
      chainId,
      peers: 0,
      compiler: {
        actualVersion: solc.version(),
        diagnosticFixtureOnly: true,
        input,
      },
      cases: [],
    };
    async function capture(name, data, to, supported) {
      const hash = await rpc('eth_sendTransaction', [
        { from: account, ...(to ? { to } : {}), data, gas: '0x989680' },
      ]);
      let receipt;
      for (let i = 0; i < 100; i++) {
        try {
          receipt = await rpc('eth_getTransactionReceipt', [hash]);
        } catch (error) {
          if (!error.message.includes('transaction indexing is in progress'))
            throw error;
        }
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!receipt || receipt.status !== '0x1')
        throw Error('Fixture root failed: ' + name);
      const rawTransaction = await rpc('eth_getTransactionByHash', [hash]);
      const transaction = { ...rawTransaction, data: rawTransaction.input };
      const callTrace = await rpc('debug_traceTransaction', [
        hash,
        { tracer: 'callTracer', tracerConfig: { onlyTopCall: false } },
      ]);
      const opcodeTrace = await rpc('debug_traceTransaction', [
        hash,
        {
          disableStorage: true,
          disableStack: false,
          enableMemory: true,
          enableReturnData: false,
        },
      ]);
      const fixture = {
        name,
        expectedSupported: supported,
        transaction,
        receipt,
        callTrace,
        opcodeTrace,
      };
      try {
        const creations = validateCreationTraces(fixture);
        for (const creation of creations) {
          const runtime = await rpc('eth_getCode', [
            creation.address,
            receipt.blockNumber,
          ]);
          if (runtime.toLowerCase() !== creation.traceRuntime.toLowerCase())
            throw Error('Captured runtime differs from constructor output');
        }
        fixture.validation = {
          accepted: true,
          creations,
          canonicalRuntimeMatches: true,
        };
      } catch (e) {
        fixture.validation = { accepted: false, error: e.message };
      }
      evidence.cases.push(fixture);
      console.log(
        JSON.stringify({
          name,
          accepted: fixture.validation.accepted,
          expectedSupported: supported,
          error: fixture.validation.error,
          creations: fixture.validation.creations?.length,
        })
      );
      return receipt;
    }
    const root = await capture(
      'direct-root-with-constructor-child',
      '0x' + contract.evm.bytecode.object,
      undefined,
      true
    );
    const abi = new ethers.Interface(contract.abi);
    for (const name of [
      'success',
      'salted',
      'nested',
      'failed',
      'revertedAncestor',
      'codeDeposit',
      'collision',
    ])
      await capture(
        name,
        abi.encodeFunctionData(name),
        root.contractAddress,
        !['codeDeposit', 'collision'].includes(name)
      );
    if (canonicalArchive) {
      const E = require('../../scripts/verification/evidence.cjs');
      const { reconcile } = require('../../scripts/verification/reconcile.cjs');
      const indexHash = E.sha256(
        fs.readFileSync(path.join(canonicalArchive, 'index.json'))
      );
      const archive = E.readArchive(canonicalArchive, indexHash);
      const fq = 'contracts/test/RevertsWithoutData.sol:RevertsWithoutData';
      const artifact = archive.contracts.get(fq);
      if (!artifact) throw Error('Missing canonical local-test artifact');
      const orphan = await capture(
        'canonical-orphan',
        artifact.artifact.bytecode,
        undefined,
        true
      );
      const retained = await capture(
        'canonical-retained',
        artifact.artifact.bytecode,
        undefined,
        true
      );
      const provider = new ethers.JsonRpcProvider(
        `http://127.0.0.1:${port}`,
        undefined,
        { cacheTimeout: -1 }
      );
      try {
        const tx = await provider.getTransaction(retained.transactionHash);
        const manifest = {
          schema: 'agijobsv0/verification-manifest/1',
          chainId: '1337',
          releaseId: 'local-test-d01b2774',
          archiveSha256: indexHash,
          scanFromBlock: Number(BigInt(orphan.blockNumber)),
          minConfirmations: 1,
          senders: [account],
          coordinators: [],
          transactions: [
            {
              hash: tx.hash,
              from: tx.from,
              nonce: tx.nonce,
              chainId: '1337',
              input: tx.data,
              fullyQualified: fq,
              constructorArguments: '0x',
            },
          ],
          reused: [],
        };
        // Explorer responses below are deliberately simulated. No external API
        // is contacted, and these reports cannot establish public verification.
        const metadata = {
          SourceCode: JSON.stringify(artifact.input),
          ABI: '[]',
          CompilerVersion: 'v' + artifact.build.solcLongVersion,
          ContractName: artifact.contract,
          ConstructorArguments: '',
          OptimizationUsed: '1',
          Runs: '200',
          EVMVersion: 'cancun',
        };
        const pending = await reconcile({
          provider,
          archive,
          manifest,
          explorer: { read: async () => null },
        });
        const exact = await reconcile({
          provider,
          archive,
          manifest,
          explorer: { read: async () => metadata },
        });
        if (
          exact.blockers.length ||
          exact.creations.length !== 2 ||
          !pending.blockers.length
        )
          throw Error('Canonical orphan reconciliation integration failed');
        evidence.canonicalIntegration = {
          localOnly: true,
          explorerSimulated: true,
          publicVerificationClaim: false,
          compiler: artifact.build.solcLongVersion,
          archiveSha256: indexHash,
          manifest,
          pending,
          exact,
        };
        console.log(
          JSON.stringify({
            canonicalReconciliation: 'passed',
            actualAddresses: exact.creations.length,
            orphanRecovered: exact.transactions.some(
              (t) => t.hash === orphan.transactionHash
            ),
            pendingBlocked: pending.blockers.length > 0,
            explorerSimulated: true,
          })
        );
      } finally {
        provider.destroy();
      }
    }
    fs.writeFileSync(output, JSON.stringify(evidence) + '\n', { flag: 'wx' });
    if (
      evidence.cases.some((f) => f.validation.accepted !== f.expectedSupported)
    )
      throw Error(
        'Genuine client validation expectations differ; preserved raw evidence'
      );
  } finally {
    child.kill('SIGTERM');
    for (let i = 0; i < 100 && !stopped; i++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    if (!stopped) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
