# α-AGI MARK — Operator Runbook

This runbook is written for the platform owner / operator. Every command is
idempotent and produces receipts in `reports/<network>/agimark/`.

---

## 0. Prerequisites

- Node.js LTS (the repo ships `.nvmrc`).
- Hardhat toolchain installed via `npm install` in the repo root.
- (Optional) IPFS API endpoint (local daemon or pinning service token).
- For testnet/mainnet: funded signer (or Safe) with $AGIALPHA / stablecoins.

---

## 1. Local rehearsal

```bash
npm run demo:agimark:local
```

What happens:

1. Starts a private Hardhat node (auto-terminated afterwards).
2. Deploys AGI Jobs v0 (v2) defaults with a governance Safe placeholder.
3. Configures environment variables for the ethers quickstart helper.
4. Posts a foresight market job, stakes agents/validators, submits a result,
   runs K-of-N commit→reveal, finalizes, and emits a Nova-Seed credential.
5. Writes JSON receipts + `mission.md` summary.

Inspect receipts:

```bash
ls reports/localhost/agimark/receipts
cat reports/localhost/agimark/mission.md
```

---

## 2. Launch the Web3 control room

```bash
cd demo/alpha-agi-mark/webapp
npm install
npm run dev
```

- Connect your wallet via MetaMask.
- Use the chat box to describe a foresight market (it pins to IPFS + creates the
  job on-chain).
- Validators commit/reveal from the **Validate** panel.
- Owners use the **Owner Controls** panel to pause/unpause or initiate a
  thermostat proposal (the buttons invoke scripts that already live under
  `scripts/v2/`).

---

## 3. Testnet execution (Sepolia)

```bash
export RPC_URL="https://sepolia.infura.io/v3/<api-key>"
export PRIVATE_KEY="0x..."  # the signer or Safe delegate
npm run demo:agimark:sepolia
```

- `reports/sepolia/agimark/receipts` captures every transaction hash.
- Review `mission.md` for a summary and to feed downstream analytics.

---

## 4. Owner controls & governance

Pause/unpause or update thermostat parameters exactly as production would:

```bash
# Verify we control the owner account (prints role + permissions)
npm run owner:verify-control

# Pause the entire system (if needed)
PRIVATE_KEY="0x..." RPC_URL="..." \
  npx hardhat run scripts/v2/pauseSystem.ts --network <net>

# Thermostat dry-run (no state change) then Safe execution
THERMOSTAT_PROPOSAL=demo/alpha-agi-mark/config/thermodynamics.demo.json \
  npx hardhat run scripts/v2/updateThermodynamics.ts --network <net>
```

The UI mirrors these actions with guard rails so that non-technical operators
know which script to run after reviewing on-screen instructions.

---

## 5. Mainnet playbook

Mainnet interactions are opt-in and require an explicit acknowledgement:

```bash
export RPC_URL="https://mainnet.infura.io/v3/<api-key>"
export PRIVATE_KEY="0x..."          # Safe delegate or hardware wallet key
export MAINNET_ACK=I_KNOW_WHAT_I_AM_DOING
npx ts-node --transpile-only demo/alpha-agi-mark/scripts/deploy.mainnet.mark.ts
```

The script only prints the plan (contracts already deployed by governance)
and refuses to broadcast unless the acknowledgement is present.

---

## 6. CI / observability

`.github/workflows/demo-alpha-agi-mark.yml` runs on every PR touching this demo:

1. Installs dependencies.
2. Boots a local node + deploys defaults.
3. Executes the orchestration script.
4. Builds the Web3 UI.
5. Uploads receipts as build artifacts.

A green check guarantees the demo is fully reproducible by the operator.

---

## 7. Incident response

- **Emergency pause**: invoke `scripts/v2/pauseSystem.ts` as above; UI provides a
  direct link and instructions.
- **Disputes**: use the CLI helper to `raiseDispute(jobId, evidenceURI)`; the
  quickstart already exposes this function and the script wraps it.
- **Rollbacks**: redeploy using saved configs and receipts — the deploy summary
  includes every contract address and parameter used.

This runbook, combined with the receipts and UI, gives operators complete,
measurable control of α-AGI MARK in high-stakes environments.
