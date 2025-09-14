# 🚀 Sprint: Meta‑Agentic α‑AGI ⇄ AGIJobsv0 (on‑chain, gas‑tight, zero‑deps)

**Goals**

* Let α‑AGI businesses and sub‑agents **register**, **stake**, **apply**, **validate**, **compose** work, and **earn** on AGIJobs.
* Implement **thermodynamic rewards** (Boltzmann/Gibbs) fully in Solidity with fixed‑point math (no external libs), using **on‑chain Energy Receipts + challenge game** rather than external oracles.
* Provide **foundational simulations** and **property tests** (Foundry) that show reward dynamics converge to **low‑energy equilibria** under repeated play.
* Maintain **defensive security posture** and **gas efficiency** (storage packing, no unbounded loops over attacker‑controlled sets, safe math w/ unchecked micro‑sections).

**Labels**: `epic`, `security`, `gas`, `simulation`, `protocol`, `breaking-change(flagged)`

**Point scale**: 1,2,3,5,8,13 (Fibonacci). Complexity ≈ effort + risk.

---

## EPIC 0 — Upgrade Frame & Feature Flags

**Files**: `contracts/upgrade/FeatureFlags.sol`, `contracts/upgrade/AccessRoles.sol`, `script/Deploy_FeatureToggle.s.sol`
**Points**: 3

### Issue 0.1 — Add Feature Flags (Thermo, Receipts, DAG)

**Description**: Introduce gated booleans for `THERMO_V2`, `ENERGY_RECEIPTS`, `JOB_DAG` to enable staged rollout.
**Acceptance**:

* Owner can toggle flags (time‑locked 48h).
* All new code paths guard on flags.
  **Security/Gas**: Roles via `AccessRoles`; toggles read packed into a single storage word.
  **Points**: 2

### Issue 0.2 — Role Registry

**Description**: Minimal role manager with constants: `OWNER`, `GOV`, `TREASURY`, `PAUSER`.
**Acceptance**: granular modifiers; events; no unbounded role iteration.
**Points**: 1

---

## EPIC 1 — Internal Identity: AlphaNameRegistry (no ENS dependency)

**Files**: `contracts/identity/AlphaNameRegistry.sol`
**Points**: 5

### Issue 1.1 — Register α‑Business & Sub‑Agents

**Description**: On‑chain registry mapping `bytes32 label → address owner`, role = `{BUSINESS, AGENT, VALIDATOR, OPERATOR}`; optional parent business.
**Acceptance**:

* `register(label, role, parent)` mints entry; uniqueness enforced.
* `prove(label)`: returns canonical agent id `keccak256(label|role|parent)`.
* Emissions: `Registered`, `Transferred`, `Revoked`.
  **Security/Gas**: Storage packing: label hash + role + parent packed; no strings stored.
  **Points**: 3

### Issue 1.2 — Reputation Vector Seed

**Description**: Initialize `rep[label] = (wins, losses, slash, energyEMA)` small packed struct.
**Acceptance**: constant‑time reads; bounded update.
**Points**: 2

---

## EPIC 2 — Staking & Participation Bindings

**Files**: `contracts/stake/StakeManager.sol` (extend), `contracts/jobs/JobRegistry.sol` (extend)
**Points**: 8

### Issue 2.1 — Stake Slots per Role

**Description**: Distinct collateral buckets for AGENT/VALIDATOR/OPERATOR with separate slash params.
**Acceptance**:

* `stake(role, amount)`, `unstake(role, amount)`, per‑role min stake.
* Events & invariant: total >= Σ active allocations.
  **Points**: 3

### Issue 2.2 — Job Application Binding to Identity

**Description**: `applyForJob(jobId, labelHash)` now checks AlphaNameRegistry and role=AGENT, stake ≥ min.
**Acceptance**: application stored as `(jobId, agentId)`; no strings.
**Points**: 2

### Issue 2.3 — Validator Enrollment

**Description**: `enrollValidator(labelHash)` gating; ensures stake & role.
**Acceptance**: emits `ValidatorEnrolled`.
**Points**: 1

### Issue 2.4 — Operator Enrollment

**Description**: similar gating; required for Energy Receipts submission.
**Points**: 2

---

## EPIC 3 — Energy Receipts & Challenge Game (on‑chain, zero oracle)

**Files**: `contracts/energy/EnergyReceipts.sol`, `contracts/energy/Challenges.sol`
**Points**: 13

**Rationale**: Replace external “oracle” with cryptoeconomic commitment: **agent posts energy claim**, **operators/validators can challenge** within window; dispute burns liar. Aggregates feed Thermo engine.

### Issue 3.1 — Receipt Format & Post

**Description**: `postReceipt(jobId, energyQ16_16, proofHash)` by AGENT; binds to (job, agent).
**Acceptance**:

* One active receipt per (job, agent).
* Window params: `POST_DEADLINE`, `CHALLENGE_DEADLINE`.
  **Points**: 3

### Issue 3.2 — Challenge‑Response

**Description**: `challenge(jobId, agentId, reasonCode, bond)` by VALIDATOR/OPERATOR; `respond(jobId, agentId, responseHash)`.
**Acceptance**:

* If **no** challenge: receipt becomes `FINAL`.
* If challenged and unresponded: **agent slashed** % on `StakeManager`.
* If responded and challenger does not escalate: **challenger slashed**.
* Finalization emits `ReceiptFinalized(jobId, agentId, energy)`.
  **Points**: 5

### Issue 3.3 — Escalation Mini‑Game (bounded)

**Description**: Single‑round commit‑reveal voting by enrolled validators: approve agent or challenger.
**Acceptance**:

* Commit (salted hash), Reveal (bit).
* Quorum = min( N, Q\_MAX ); if tie→burn both small %.
  **Security**: bounded voters by **allowlist snapshot** at job creation to avoid gas bombs.
  **Points**: 5

---

## EPIC 4 — Thermodynamic Rewards V2 (Boltzmann / Gibbs)

**Files**: `contracts/rewards/ThermoEngine.sol`, `contracts/lib/FixedMath.sol`
**Points**: 13

**Design**

* Epoch budget split: **Agents 65% / Validators 15% / Operators 15% / Employers 5%** (configurable).
* Per‑job agent reward uses **Boltzmann weight**:
  $w_i = \exp(-E_i / T)$, $p_i = w_i / \sum_j w_j$ within the job (or epoch pool).
* **Gibbs free energy proxy** used to throttle emissions: $G = \sum_i E_i - T S$, estimate $S$ via discrete Shannon entropy over $p_i$; burn if G>threshold.

### Issue 4.1 — Fixed‑Point Math (no deps)

**Description**: Implement `FixedMath` with:

* Q64.64 or Q32.96 fixed point
* `expNeg(x)`, `ln(x)`, `divWad`, `mulWad`, saturation & bounds
  **Acceptance**:
* Max rel. error < 1e‑6 for domain x ∈ \[0, 40] (covers practical E/T).
* Gas budget: `expNeg` ≤ \~700 gas (approx poly + range reduction).
  **Points**: 5

### Issue 4.2 — Weighting & Normalization

**Description**: For a job’s finalist set `i∈F`, compute `w_i`, `Z=Σw_i`, `share_i = agentPool * w_i / Z`.
**Acceptance**: No unbounded loops—bound F ≤ K (K small, e.g., finalists).
**Points**: 3

### Issue 4.3 — Entropy Guard & Emission Throttle

**Description**: Compute discrete `S = -Σ p_i ln p_i` in fixed‑point; compute `G`; if `G>Gmax` → reduce epoch budget by α, burn to treasury.
**Acceptance**: Governance‑tunable T, Gmax, α; events.
**Points**: 3

### Issue 4.4 — Role Pool Distribution

**Description**: Pay **validators/operators/employers** from their pools using similar weights: validators by accuracy (commit/reveal success), operators by approved receipt participation, employers by spec quality (no disputes).
**Acceptance**: All payouts O(K).
**Points**: 2

---

## EPIC 5 — Validation v2 (Commit‑Reveal, bounded)

**Files**: `contracts/validate/ValidationModule.sol` (extend)
**Points**: 5

### Issue 5.1 — Compact Commit‑Reveal

**Description**: Rework storage to pack commitments; add labelHash instead of strings; salt guidance.
**Acceptance**: Reveal mismatch slashes voter; finalizes result.
**Security**: No reentrancy; pull‑payment.
**Points**: 3

### Issue 5.2 — Cross‑Hook to ThermoEngine

**Description**: On finalize, pipe (jobId → finalists, E\_i) to ThermoEngine; mint or transfer.
**Points**: 2

---

## EPIC 6 — Job DAG (Employer Composition)

**Files**: `contracts/jobs/JobDAG.sol`
**Points**: 8

### Issue 6.1 — Minimal DAG

**Description**: Create jobs with dependencies: `createJob(meta, deps[])`.
**Acceptance**: A job becomes “available” when all deps finalized; cycle check.
**Points**: 5

### Issue 6.2 — Aggregator Completion

**Description**: Parent job finalization aggregates child outputs (hash concat → Merkle root stored).
**Acceptance**: On parent finalize, thermodynamic accounting over child energy vector (optional).
**Points**: 3

---

## EPIC 7 — Operator Role (telemetry participation)

**Files**: `contracts/operator/OperatorRegistry.sol`
**Points**: 3

### Issue 7.1 — Operator Participation Score

**Description**: Track per‑epoch operator score = receipts serviced, challenges issued (normalized).
**Acceptance**: Weighted payout from operator pool.
**Points**: 3

---

## EPIC 8 — Security Hardening & Invariants

**Files**: `contracts/security/Guards.sol`, `test/invariants/*.t.sol`
**Points**: 8

### Issue 8.1 — Reentrancy & Pull‑Payments

**Description**: All sends via withdrawals; `nonReentrant` guard macro inlined (no deps).
**Points**: 2

### Issue 8.2 — Access Control Invariants

**Description**: Foundry invariant tests:

* Only role may toggle flags
* Reward sum conservation per epoch
  **Points**: 2

### Issue 8.3 — Slash Accounting Invariant

**Description**: Never slash > staked; treasury balance monotone inc.
**Points**: 2

### Issue 8.4 — Finalization Once

**Description**: Job cannot finalize twice; receipts single‑final.
**Points**: 2

---

## EPIC 9 — Gas Optimization Pass

**Files**: project‑wide
**Points**: 5

### Issue 9.1 — Storage Packing & Calldata

**Description**: Pack small ints; prefer `calldata`; unchecked arithmetic where safe; custom errors.
**Acceptance**: Gas report shows ≥15% savings vs baseline.
**Points**: 3

### Issue 9.2 — Loop Bounds & Early Exits

**Description**: Bound finalists K; micro‑opt exp via range reduction; inline functions.
**Points**: 2

---

## EPIC 10 — Foundry Tests & On‑Chain Simulations

**Files**: `test/unit/*.t.sol`, `test/sim/*.t.sol`
**Points**: 13

### Issue 10.1 — Unit: FixedMath Correctness

**Description**: Compare `expNeg`, `ln` vs high‑precision constants; bound errors.
**Points**: 2

### Issue 10.2 — Unit: Energy Receipts Challenge Paths

**Description**: Cover: no challenge → finalize; honest agent vs dishonest challenger; dishonest agent vs challenger; tie.
**Points**: 3

### Issue 10.3 — Unit: Thermo Weights & Entropy

**Description**: Construct small sets E = {e1..ek}; verify p\_i sum 1, monotone in E\_i, entropy bounds.
**Points**: 2

### Issue 10.4 — Sim: Repeated Play → Low‑Energy Equilibrium

**Description**: **On‑chain simulation** contract `ThermoSim.t.sol`:

* N agents with initial energy E\_i \~ U\[a,b]
* For epochs: pay using Boltzmann; update E\_i := max(E\_i – η\*(reward\_i – avg), E\_min) (toy adaptive rule on‑chain).
* **Assertions**: mean(E) decreases; variance contracts to band; KL(p\_t || p\_{t+1}) small; entropy approaches target S\*.
  **Points**: 4

### Issue 10.5 — Attack Sims

**Description**: Collusion of k agents to under‑report energy → challenged/slashed; replay and double finalization attempts; stake‑drain resistance.
**Points**: 2

---

## EPIC 11 — Developer Docs & Runbooks

**Files**: `/docs/*.md`
**Points**: 3

### Issue 11.1 — Protocol Walkthrough

**Description**: Identity → Stake → Apply → Receipt → Challenge → Validation → Thermo Payout (sequence diagram).
**Points**: 1

### Issue 11.2 — Parameter Tuning Guide

**Description**: Guidance for T, Gmax, α, K; effect on efficiency/dispersion.
**Points**: 1

### Issue 11.3 — Simulation How‑To

**Description**: How to run Foundry sims and interpret convergence plots (stdout tables).
**Points**: 1

---

# 🔧 Key Solidity Interfaces (sketch)

```solidity
// contracts/identity/AlphaNameRegistry.sol
struct IdInfo { address owner; bytes32 parent; uint8 role; uint64 repWins; uint64 repLoss; uint32 slashes; uint64 energyEMA; }
function register(bytes32 label, uint8 role, bytes32 parent) external;
function transfer(bytes32 label, address to) external;
function get(bytes32 label) external view returns (IdInfo memory);
function agentId(bytes32 label, uint8 role, bytes32 parent) public pure returns (bytes32);

// contracts/energy/EnergyReceipts.sol
enum Status { NONE, POSTED, CHALLENGED, FINAL }
struct Receipt { bytes32 agentId; uint128 eQ; uint40 postedAt; Status st; }
function postReceipt(uint256 jobId, bytes32 agentLabel, uint128 eQ16_16, bytes32 proofHash) external;
function challenge(uint256 jobId, bytes32 agentId, uint8 reason, uint256 bond) external;
function respond(uint256 jobId, bytes32 agentId, bytes32 responseHash) external;
function finalize(uint256 jobId, bytes32 agentId) external; // after windows

// contracts/rewards/ThermoEngine.sol
function settleJob(uint256 jobId, bytes32[] calldata finalistIds) external; // called by ValidationModule
function setParams(uint128 TQ, uint128 GmaxQ, uint16 alphaBP) external onlyGov;

// contracts/lib/FixedMath.sol (Q64.64)
function expNeg(uint128 xQ) internal pure returns (uint128);
function ln(uint128 xQ) internal pure returns (uint128);
function mulQ(uint128 a, uint128 b) internal pure returns (uint128);
function divQ(uint128 a, uint128 b) internal pure returns (uint128);
```

> **Gas notes**: finalists `K` bounded (e.g., ≤ 8); all loops capped; receipts keyed by `(jobId, agentId)`; payouts via pull pattern; math uses **range‑reduced polynomial** approximations for `expNeg`, `ln` (no external math libs).

---

# ✅ Acceptance Gates (Definition of Done)

* **DoD‑A**: All Epics merged behind flags; default off; all legacy flows preserved.
* **DoD‑B**: Foundry **gas snapshot** shows ≤ **120k** gas per `settleJob` with `K≤8`.
* **DoD‑C**: Invariant tests pass (conservation, single finalization, slash ≤ stake).
* **DoD‑D**: Sim test demonstrates **mean energy ↓ ≥ 25%** over 100 epochs under default T; entropy approaches target band.
* **DoD‑E**: Attack sims: collusion, receipt forgery, replay → economically unprofitable (≥ challengers’ EV positive).
* **DoD‑F**: Docs published with parameter tuning guide.

---

# 🛡️ Security Checklist

* No external calls during state mutation → use pull‑payments.
* All role‑gated setters time‑locked; pausability on critical modules.
* Challenge game **single escalation** round → bounded gas.
* All arithmetic uses **checked** by default, `unchecked` only in micro‑hotpaths with pre‑guards.
* Storage packing for structs; hash‑based ids avoid string manipulation.

---

# 📊 Simulation Design (on‑chain, Foundry)

* **ThermoSim.t.sol** creates N synthetic agents with random `E_i`.
* Epoch loop:

  1. Compute Boltzmann weights on‑chain (ThermoEngine internal).
  2. Distribute rewards; update `E_i` by policy `E_i := max(E_i - η*(r_i - r̄), Emin)` (toy rational adaptation).
  3. Record `mean(E)`, `var(E)`, `H(p)`.
* **Assertions**: monotone decrease (up to noise), bounded `H`, convergence within 100–200 epochs across seeds.

---

# 🧭 Rollout Plan

1. **Phase 0**: Deploy FeatureFlags + Identity + Stake (flags off).
2. **Phase 1**: Enable EnergyReceipts (shadow mode, no payouts).
3. **Phase 2**: Enable ThermoEngine (low T, low α), cap K=4.
4. **Phase 3**: Enable JobDAG + Operator scoring; raise K to 8 after stability.
5. **Phase 4**: Parameter tune via governance (T, Gmax, α) informed by sims.
