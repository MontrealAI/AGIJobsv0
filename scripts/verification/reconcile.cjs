'use strict';
const ethers = require('ethers');
const {
  digest,
  lower,
  insist,
  safeError,
  expectedCreation,
  exactRuntime,
  traceCreate,
  verifyExplorer,
} = require('./evidence.cjs');
const COORDINATOR_ABI = [
  'function deployComponent(bytes32 componentId,bytes creationCode,bool pauseUntilWired)',
  'function components(bytes32) view returns(address)',
  'function componentCodeHashes(bytes32) view returns(bytes32)',
  'event ComponentDeployed(bytes32 indexed componentId,address indexed component,bytes32 creationCodeHash)',
];
const coordinatorInterface = new ethers.Interface(COORDINATOR_ABI);
function matchCreation(input, archive, libraries = {}) {
  const matches = [];
  for (const [fullyQualified, artifact] of archive.contracts) {
    if (!artifact.artifact.bytecode || artifact.artifact.bytecode === '0x')
      continue;
    try {
      const prefix = require('./evidence.cjs').linkedCode(
        artifact.artifact.bytecode,
        artifact.compiled.evm.bytecode.linkReferences,
        libraries
      ).code;
      if (!lower(input).startsWith(prefix)) continue;
      const used = [
        ...new Set(
          [
            artifact.compiled.evm.bytecode.linkReferences,
            artifact.compiled.evm.deployedBytecode.linkReferences,
          ].flatMap((ref) =>
            Object.entries(ref || {}).flatMap(([file, names]) =>
              Object.keys(names).map((name) => `${file}:${name}`)
            )
          )
        ),
      ];
      const entry = {
        fullyQualified,
        constructorArguments: '0x' + input.slice(prefix.length),
        libraries: Object.fromEntries(
          used.map((name) => [name, libraries[name]])
        ),
      };
      if (expectedCreation(entry, artifact) === lower(input))
        matches.push(entry);
    } catch {
      /* Another artifact, unresolved library or noncanonical constructor. */
    }
  }
  insist(
    matches.length === 1,
    `Creation must match exactly one archived contract (matched ${matches.length})`
  );
  return matches[0];
}
function journalTransactions(snapshots) {
  const txs = new Map(),
    records = [];
  for (const p of snapshots) {
    for (const tx of p.transactions || [])
      txs.set(lower(tx.hash), { ...txs.get(lower(tx.hash)), ...tx });
    if (p.coordinatorTransaction)
      txs.set(lower(p.coordinatorTransaction), {
        name: 'Deployer',
        hash: p.coordinatorTransaction,
        ...txs.get(lower(p.coordinatorTransaction)),
      });
    for (const key of ['configurationTransaction', 'finalizationTransaction'])
      if (p[key])
        txs.set(lower(p[key]), {
          name: key,
          hash: p[key],
          ...txs.get(lower(p[key])),
        });
    for (const tx of p.ownershipTransactions || [])
      txs.set(lower(tx.hash), { ...txs.get(lower(tx.hash)), ...tx });
    for (const record of p.creationAttempts || []) records.push(record);
  }
  return { transactions: [...txs.values()], creationAttempts: records };
}
async function canonicalReceipt(provider, hash, minConfirmations, head) {
  const receipt = await provider.getTransactionReceipt(hash);
  if (!receipt) return null;
  const block = await provider.getBlock(receipt.blockNumber);
  insist(
    block && lower(block.hash) === lower(receipt.blockHash),
    'Receipt is not canonical (possible reorg)'
  );
  insist(
    head - receipt.blockNumber + 1 >= minConfirmations,
    'Creation lacks required confirmations'
  );
  return receipt;
}
async function callAt(provider, address, data, blockTag) {
  return provider.call({ to: address, data, blockTag });
}
async function reconcile({
  provider,
  archive,
  manifest,
  explorer,
  submit = false,
}) {
  insist(
    manifest.schema === 'agijobsv0/verification-manifest/1',
    'Unsupported manifest schema'
  );
  insist(
    typeof manifest.releaseId === 'string' && manifest.releaseId.length >= 7,
    'Missing release identity'
  );
  insist(
    manifest.archiveSha256 === archive.indexSha256,
    'Manifest/archive identity mismatch'
  );
  insist(
    String((await provider.getNetwork()).chainId) === String(manifest.chainId),
    'Wrong chain'
  );
  insist(
    Number.isSafeInteger(manifest.minConfirmations) &&
      manifest.minConfirmations >= 1,
    'Set a positive finality confirmation policy'
  );
  const head = await provider.getBlockNumber(),
    block = await provider.getBlock(head);
  const report = {
    schema: 'agijobsv0/verification-result/1',
    chainId: String(manifest.chainId),
    releaseId: manifest.releaseId,
    manifestSha256: digest(manifest),
    archiveSha256: archive.indexSha256,
    observedBlock: { number: head, hash: block.hash },
    transactions: [],
    creations: [],
    reused: [],
    blockers: [],
    productionQualified: false,
  };
  const submitted = new Map(
    (manifest.transactions || []).map((tx) => [lower(tx.hash), tx])
  );
  insist(submitted.size > 0, 'No submitted transactions retained');
  const knownAddresses = new Set(),
    senders = new Set(),
    coordinators = new Set((manifest.coordinators || []).map(lower));
  let firstBlock = Infinity;
  // A bounded block sweep reconciles missing callbacks and catches orphan delegate CREATEs.
  // It includes all creation transactions from every recorded sender, not only active component names.
  for (const tx of submitted.values()) {
    const actual = await provider.getTransaction(tx.hash);
    if (actual) senders.add(lower(actual.from));
    const receipt = await provider.getTransactionReceipt(tx.hash);
    if (receipt) firstBlock = Math.min(firstBlock, receipt.blockNumber);
  }
  insist(
    Number.isSafeInteger(manifest.scanFromBlock) &&
      manifest.scanFromBlock >= 0 &&
      manifest.scanFromBlock <= firstBlock,
    'Missing or late creation-history scan boundary'
  );
  for (const sender of manifest.senders || []) senders.add(lower(sender));
  insist(senders.size > 0, 'No creation sender identities');
  for (let number = manifest.scanFromBlock; number <= head; number++) {
    const scanned = await provider.getBlock(number, true);
    insist(scanned, 'Missing block during creation reconciliation');
    let blockTransactions;
    try {
      blockTransactions = scanned.prefetchedTransactions;
    } catch {
      /* RPC omitted prefetch. */
    }
    for (const hash of blockTransactions || scanned.transactions) {
      const tx =
        typeof hash === 'string' ? await provider.getTransaction(hash) : hash;
      insist(tx, 'Missing transaction during creation reconciliation');
      if (
        senders.has(lower(tx.from)) ||
        (tx.to && coordinators.has(lower(tx.to)))
      ) {
        if (!submitted.has(lower(tx.hash)))
          submitted.set(lower(tx.hash), {
            hash: tx.hash,
            recoveredBy: 'canonical-block-scan',
          });
      }
    }
  }
  for (const [key, record] of submitted) {
    const row = { hash: key, status: 'unresolved' };
    report.transactions.push(row);
    try {
      let tx = await provider.getTransaction(key),
        receipt = await canonicalReceipt(
          provider,
          key,
          manifest.minConfirmations,
          head
        );
      if (!receipt) {
        const replacement = (manifest.replacements || []).find(
          (r) => lower(r.originalHash) === key
        );
        if (replacement) {
          const replacementTx = await provider.getTransaction(
            replacement.replacementHash
          );
          const replacementReceipt = await canonicalReceipt(
            provider,
            replacement.replacementHash,
            manifest.minConfirmations,
            head
          );
          insist(
            replacementTx && replacementReceipt,
            'Replacement is unresolved'
          );
          const from = tx?.from || record.from,
            nonce = tx?.nonce ?? record.nonce;
          insist(
            from &&
              nonce !== undefined &&
              lower(replacementTx.from) === lower(from) &&
              replacementTx.nonce === Number(nonce),
            'Replacement sender/nonce mismatch'
          );
          insist(
            submitted.has(lower(replacement.replacementHash)),
            'Replacement transaction missing from inventory'
          );
          row.status = 'replaced';
          row.replacementHash = replacement.replacementHash;
          continue;
        }
        row.status = tx ? 'pending' : 'unresolved';
        report.blockers.push(`${key}: ${row.status}`);
        continue;
      }
      insist(tx, 'Canonical transaction is missing');
      insist(
        String(tx.chainId) === String(manifest.chainId),
        'Transaction chain mismatch'
      );
      if (record.from)
        insist(
          lower(record.from) === lower(tx.from),
          'Journal sender mismatch'
        );
      if (record.nonce !== undefined)
        insist(Number(record.nonce) === tx.nonce, 'Journal nonce mismatch');
      if (record.input)
        insist(
          lower(record.input) === lower(tx.data),
          'Journal input mismatch'
        );
      if (record.chainId)
        insist(
          String(record.chainId) === String(tx.chainId),
          'Journal chain mismatch'
        );
      row.sender = tx.from;
      row.nonce = tx.nonce;
      row.inputSha256 = digest(lower(tx.data));
      row.receipt = {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        status: receipt.status,
        transactionHash: key,
      };
      if (Number(receipt.status) !== 1) {
        row.status = 'canonical-revert';
        continue;
      }
      row.status = 'canonical-success';
      const creations = [];
      if (!tx.to) {
        insist(receipt.contractAddress, 'CREATE receipt lacks contractAddress');
        creations.push({
          address: receipt.contractAddress,
          input: tx.data,
          kind: 'direct',
        });
      } else if (coordinators.has(lower(tx.to))) {
        let parsed;
        try {
          parsed = coordinatorInterface.parseTransaction({ data: tx.data });
        } catch {}
        const events = (receipt.logs || [])
          .filter((log) => lower(log.address) === lower(tx.to))
          .map((log) => {
            try {
              return coordinatorInterface.parseLog(log);
            } catch {
              return null;
            }
          })
          .filter((log) => log?.name === 'ComponentDeployed');
        if (parsed?.name === 'deployComponent') {
          const componentId = parsed.args[0],
            initcode = parsed.args[1];
          const current = await callAt(
            provider,
            tx.to,
            coordinatorInterface.encodeFunctionData('components', [
              componentId,
            ]),
            head
          );
          const address = coordinatorInterface.decodeFunctionResult(
            'components',
            current
          )[0];
          const commitment = await callAt(
            provider,
            tx.to,
            coordinatorInterface.encodeFunctionData('componentCodeHashes', [
              componentId,
            ]),
            head
          );
          insist(
            coordinatorInterface.decodeFunctionResult(
              'componentCodeHashes',
              commitment
            )[0] === ethers.keccak256(initcode),
            'Coordinator initcode commitment mismatch'
          );
          if (events.length === 0) {
            // An idempotent no-op has no creation; it still must reference an inventoried creation later.
            row.componentReference = address;
          } else {
            insist(
              events.length === 1 &&
                events[0].args[0] === componentId &&
                lower(events[0].args[1]) === lower(address) &&
                events[0].args[2] === ethers.keccak256(initcode),
              'Coordinator creation event/mapping mismatch'
            );
            creations.push({
              address,
              input: initcode,
              kind: 'coordinator',
              coordinator: tx.to,
              componentId,
            });
          }
        } else
          insist(
            events.length === 0,
            'Unrecognized internal creation transaction; trace reconciliation required'
          );
      }
      {
        // Every successful scoped transaction is traced, including calls into
        // optional factories/installers whose top-level receipt has no address.
        // Canonical execution traces enumerate constructor-created children too;
        // a top-level receipt alone cannot establish internal CREATE completeness.
        const trace = await provider.send('debug_traceTransaction', [
          key,
          { tracer: 'callTracer', tracerConfig: { onlyTopCall: false } },
        ]);
        const opcodeTrace = await provider.send('debug_traceTransaction', [
          key,
          {
            disableStorage: true,
            disableStack: false,
            enableMemory: true,
            enableReturnData: false,
          },
        ]);
        let emptyCodeCall = false;
        if (tx.to && opcodeTrace?.structLogs?.length === 0) {
          emptyCodeCall =
            (await provider.getCode(tx.to, receipt.blockNumber)) === '0x' &&
            (await provider.getCode(
              tx.to,
              Math.max(0, receipt.blockNumber - 1)
            )) === '0x';
        }
        const traced = require('./trace-evidence.cjs').validateCreationTraces({
          callTrace: trace,
          opcodeTrace,
          transaction: tx,
          receipt,
          emptyCodeCall,
        });
        for (const creation of creations) {
          const matched = traced.find(
            (c) =>
              lower(c.address) === lower(creation.address) &&
              lower(c.input) === lower(creation.input)
          );
          insist(
            matched,
            'Receipt/event creation missing from canonical trace'
          );
          creation.traceRuntime = matched.traceRuntime;
        }
        for (const creation of traced)
          if (
            !creations.some((c) => lower(c.address) === lower(creation.address))
          )
            creations.push(creation);
      }
      for (const creation of creations) {
        insist(
          !knownAddresses.has(lower(creation.address)),
          'Duplicate mined address in creation inventory'
        );
        knownAddresses.add(lower(creation.address));
        const entry = {
          ...matchCreation(creation.input, archive, manifest.libraries || {}),
          address: creation.address,
          transactionHash: key,
          kind: creation.kind,
          ...(creation.coordinator
            ? {
                coordinator: creation.coordinator,
                componentId: creation.componentId,
              }
            : {}),
        };
        const item = { ...entry, status: 'unresolved', receipt: row.receipt };
        report.creations.push(item);
        try {
          const artifact = archive.contracts.get(entry.fullyQualified);
          if (creation.kind !== 'internal-trace' && record.fullyQualified)
            insist(
              record.fullyQualified === entry.fullyQualified,
              'Journal artifact identity mismatch'
            );
          if (creation.kind !== 'internal-trace' && record.constructorArguments)
            insist(
              lower(record.constructorArguments) === entry.constructorArguments,
              'Journal constructor mismatch'
            );
          const runtime = await provider.getCode(entry.address, head);
          const traceRuntime = creation.traceRuntime;
          insist(
            lower(runtime) === lower(traceRuntime),
            'Constructor trace runtime differs from canonical current code'
          );
          Object.assign(
            item,
            exactRuntime(entry, artifact, runtime, traceRuntime),
            {
              artifactSha256: artifact.artifactSha256,
              buildSha256: artifact.buildSha256,
              standardInputSha256: artifact.standardInputSha256,
              compiler: artifact.build.solcLongVersion,
              initcodeSha256: digest(lower(creation.input)),
            }
          );
          item.explorer = await verifyExplorer(
            explorer,
            manifest.chainId,
            entry,
            artifact,
            { submit }
          );
          item.status =
            item.explorer.status === 'verified' ? 'verified' : 'unverified';
          if (item.status !== 'verified')
            report.blockers.push(
              `${entry.address}: explorer ${item.explorer.status}`
            );
        } catch (error) {
          item.error = safeError(error);
          report.blockers.push(`${entry.address}: ${safeError(error).message}`);
        }
      }
    } catch (error) {
      row.status = 'unresolved';
      row.error = safeError(error);
      report.blockers.push(`${key}: ${safeError(error).message}`);
    }
  }
  for (const coordinator of coordinators) {
    if (
      !report.creations.some(
        (c) =>
          lower(c.address) === coordinator &&
          c.fullyQualified === 'contracts/v2/Deployer.sol:Deployer' &&
          c.status === 'verified'
      )
    )
      report.blockers.push(
        coordinator + ': coordinator creation/source evidence missing'
      );
  }
  for (const tx of report.transactions)
    if (
      tx.componentReference &&
      !knownAddresses.has(lower(tx.componentReference))
    )
      report.blockers.push(
        `${tx.componentReference}: component creation was not recovered`
      );
  for (const entry of manifest.expectedCreations || [])
    if (
      !report.creations.some(
        (c) =>
          lower(c.address) === lower(entry.address) &&
          c.fullyQualified === entry.fullyQualified
      )
    )
      report.blockers.push(
        `${entry.address}: expected creation absent or wrong artifact`
      );
  // External/reused contracts are never relabelled as this release's deployments.
  for (const entry of manifest.reused || []) {
    const item = { ...entry, status: 'unreviewed' };
    report.reused.push(item);
    try {
      insist(
        !knownAddresses.has(lower(entry.address)),
        'Reused address is also a new creation'
      );
      insist(
        entry.reviewed === true && entry.reviewEvidenceSha256 && entry.role,
        'Unreviewed reused dependency'
      );
      const code = await provider.getCode(entry.address, head);
      insist(
        code !== '0x' && digest(lower(code)) === entry.runtimeDigest,
        'Reused dependency runtime mismatch'
      );
      item.status = 'reviewed';
    } catch (error) {
      item.error = safeError(error);
      report.blockers.push(`${entry.address}: unreviewed reused dependency`);
    }
  }
  const addressSet = new Set([
    ...knownAddresses,
    ...report.reused
      .filter((r) => r.status === 'reviewed')
      .map((r) => lower(r.address)),
  ]);
  for (const entry of report.creations)
    for (const [source, library] of Object.entries(entry.libraries || {}))
      if (
        !report.creations.some(
          (c) =>
            lower(c.address) === lower(library) &&
            c.fullyQualified === source &&
            c.status === 'verified'
        )
      )
        report.blockers.push(
          `${library}: linked library ${source} missing from exact verified creation inventory`
        );
  if (report.creations.length === 0)
    report.blockers.push('No actual mined creations recovered');
  const finalBlock = await provider.getBlock(head);
  if (!finalBlock || lower(finalBlock.hash) !== lower(block.hash))
    report.blockers.push('Observation block reorged during reconciliation');
  report.creationSetSha256 = digest(
    report.creations
      .map((c) => ({
        address: lower(c.address),
        fullyQualified: c.fullyQualified,
        transactionHash: c.transactionHash,
        runtimeSha256: c.runtimeSha256,
        librariesSha256: c.librariesSha256,
        immutableSha256: c.immutableSha256,
      }))
      .sort((a, b) => a.address.localeCompare(b.address))
  );
  return report;
}
module.exports = {
  reconcile,
  journalTransactions,
  matchCreation,
  canonicalReceipt,
  COORDINATOR_ABI,
};
