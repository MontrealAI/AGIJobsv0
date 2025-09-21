# Meta-Agent Gateway & Validator Quickstart

1. Copy `examples/agentic/gateway.config.json` and fill in the deployed module addresses, RPC endpoint, and ENS roots for your network.
2. Export credentials:
   ```bash
   export MNEMONIC="twelve word seed ..."
   export RPC_MAINNET="https://mainnet.infura.io/v3/<key>"
   export RPC_SEPOLIA="https://sepolia.infura.io/v3/<key>"
   export GOV_SAFE="0xYourSafe..."
   export TIMELOCK_ADDR="0xYourTimelock..."
   export AGENT_ENS="alice.agent.agi.eth"
   export VALIDATOR_ENS="validator.club.agi.eth"
   ```
3. Normalise ENS roots (optional but recommended) using the bundled helper:
   ```bash
   npm run namehash:mainnet
   # or for sepolia deployments
   npm run namehash:sepolia
   ```
4. Run the hardened wiring guard before interacting with production contracts:
   ```bash
   NETWORK=development npm run wire:verify
   NETWORK=mainnet npm run wire:verify
   ```
5. Start the event-driven gateway and validator loops:
   ```bash
   npm run agent:gateway
   npm run agent:validator
   ```

The gateway listens for `JobCreated` events, validates stake requirements, and auto-applies using the configured ENS subdomain. The validator listens for committee selections, commits with a salted hash, and reveals within the configured window. Runtime energy metrics and quarantine events are appended to `examples/agentic/runtime-agentic.jsonl` for post-mortem analysis or future telemetry pipelines.

> **Mainnet safety:** the wiring guard enforces the canonical `$AGIALPHA` staking token (`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`) whenever `NETWORK=mainnet` and aborts on mismatches or missing module wiring.
