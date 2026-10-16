'use strict';

const { createHash } = require('node:crypto');

// These fixed no-compile demos use historical v2 Engine/Registry/Dispute
// artifacts and the v1 implementation bundle. A different generation needs an
// explicit migration, never a fallback that silently skips terminal-v3 wiring.
const historicalArtifactHashes = {
  ReputationEngine:
    'aa70e6071ef92f4f648919d78c79154ad0a66727b3ab208c808f9f2f4158ba38',
  JobRegistry:
    '31fa57f9c182c9b3bdc0766b3cf53a2844b959940eb6f8c0ff523f9644690866',
  DisputeModule:
    'a0df9ebebebc209c868f3f8d59d6be268720efa605a3fea5d62c2169c1aa4825',
};

function assertHistoricalDemoArtifacts(reputation, registry, dispute) {
  for (const [name, artifact] of [
    ['ReputationEngine', reputation],
    ['JobRegistry', registry],
    ['DisputeModule', dispute],
  ]) {
    const hash = createHash('sha256')
      .update(
        JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode })
      )
      .digest('hex');
    if (hash !== historicalArtifactHashes[name]) {
      throw new Error(
        `Unsupported ${name} artifact generation: historical demo requires the pinned prebuilt v2 ABI and bytecode`
      );
    }
  }
}

module.exports = { assertHistoricalDemoArtifacts };
