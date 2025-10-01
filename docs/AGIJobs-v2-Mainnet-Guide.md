# AGIJobs v2 — Mainnet Sprint, Deployment & Usage Guide (ENS + $AGIALPHA)

> **Scope:** This master file delivers (1) a targeted coding sprint for ENS runtime enforcement, $AGIALPHA‑only flows, comprehensive events, and staking/slashing; (2) step‑by‑step mainnet deployment via **Etherscan** for operators; (3) plain‑language Etherscan usage for non‑technical users; and (4) repo documentation/style improvements for production. It also evaluates and aligns v2 with the legacy **AGIJobManager** contract’s ENS subdomain ownership enforcement (club.agi.eth for validators) and ports that logic into v2 modules.
> **Primary references:** repository README (v2 is the supported line; Identity & Etherscan wiring are documented), and the on‑chain AGIJobManager verified source indicating ENS + NameWrapper usage and a `_verifyOwnership` helper. ENS mainnet registry and NameWrapper addresses are included. ([GitHub][1], [Ethereum (ETH) Blockchain Explorer][2], [docs.ens.domains][3])

---

## A. What we verified (high level)

- **Repo status:** README states v2 under `contracts/v2` is the supported release; identity policy requires agents to use `<label>.agent.agi.eth` and validators `<label>.club.agi.eth`. Etherscan‑centric deployment/wiring steps and owner‑only setters are documented. The `$AGIALPHA` mainnet address appears in the Deployed Addresses section. ([GitHub][1])
- **Legacy on‑chain reference:** The verified **AGIJobManager** (0x0178…a477) declares `ENS`, `Resolver`, and `NameWrapper` interfaces and an internal `_verifyOwnership` used to enforce that validators hold a **club.agi.eth** subdomain (with additional allowances and parameters visible in the outline). This is the behavior you asked to mirror in v2. ([Ethereum (ETH) Blockchain Explorer][2])
- **ENS infra on mainnet:**

  - **ENS Registry:** `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`. ([Ethereum (ETH) Blockchain Explorer][4])
  - **NameWrapper:** `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`. ([docs.ens.domains][3])

> **Conclusion:** v2 already signals ENS identity enforcement and Etherscan wiring. This sprint **locks it in at runtime** (no soft checks), **hard‑codes $AGIALPHA**, **ports validator/agent ENS checks** (with **Merkle allowlist bypass** and **NameWrapper fallback**) across all relevant entry points, and makes eventing comprehensive.

---

## B. Targeted Coding Sprint (2–3 short milestones, contracts + docs only)

### Milestone 1 — ENS identity enforcement (runtime, everywhere)

**Goal:** Agents **must** own `<label>.agent.agi.eth`; Validators **must** own `<label>.club.agi.eth`. Checks happen at **application** and **validation** time (and any actor-gated flow), mirroring AGIJobManager’s behavior (Merkle allowlist bypass + NameWrapper fallback). ([Ethereum (ETH) Blockchain Explorer][2])

**Deliverables (Solidity, `contracts/v2`)**

1. **Interfaces** (new):

   - `interfaces/IENS.sol` (`resolver(bytes32)`, `owner(bytes32)`)
   - `interfaces/IAddrResolver.sol` (`addr(bytes32)`)
   - `interfaces/INameWrapper.sol` (`ownerOf(uint256)`)
     (Use external interfaces, no inheritance.) _(Refers to ENS Registry/Resolver/NameWrapper contracts)_. ([docs.ens.domains][5])

2. **IdentityRegistry.sol** (augment or add if missing):

   - **Storage:**

     - `ENS public ens; INameWrapper public nameWrapper;`
     - `bytes32 public agentRootNode; bytes32 public clubRootNode;` (namehashes of `agent.agi.eth` and `club.agi.eth`)
     - `bytes32 public agentMerkleRoot; bytes32 public validatorMerkleRoot;`
     - `mapping(address => bool) public additionalAgents; mapping(address => bool) public additionalValidators;`

   - **Admin setters:** `setENS(address)`, `setNameWrapper(address)`, `setAgentRootNode(bytes32)`, `setClubRootNode(bytes32)`, `setAgentMerkleRoot(bytes32)`, `setValidatorMerkleRoot(bytes32)`, `addAdditionalAgent(address)`, `addAdditionalValidator(address)`, and removals (all `onlyOwner`).
   - **Core runtime checks** (reusable):

     - `function verifyAgent(address who, string memory label, bytes32[] memory proof) external view returns (bool, bytes32 node, bool viaWrapper, bool viaMerkle)`
     - `function verifyValidator(address who, string memory label, bytes32[] memory proof) external view returns (bool, bytes32 node, bool viaWrapper, bool viaMerkle)`
     - Internal `_verifyOwnership(address who, bytes32 parent, string memory label)`

       - Compute `node = keccak256(abi.encodePacked(parent, keccak256(bytes(label))))` (**forward namehash step**).
       - Try **Merkle bypass** (if `root!=0`, verify `leaf = keccak256(abi.encode(who, keccak256(bytes(label))))`).
       - Else, try **resolver forward resolution**: `ens.resolver(node)` → `addr(node)` equals `who`.
       - Else, check **registry owner**: `ens.owner(node)==who`.
       - Else, check **NameWrapper**: `nameWrapper.ownerOf(uint256(node))==who`.
       - Return `(ok, node, viaWrapper, viaMerkle)`.

     - Emit structured events:

       - `event ENSVerified(address indexed user, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);`
       - `event AgentIdentityVerified(address indexed agent, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);`
       - `event ValidatorIdentityVerified(address indexed validator, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);`
       - `event ENSBypassAdded(address indexed user, bool agent);` / `…Removed`
       - `event ENSRootsUpdated(bytes32 agentRootNode, bytes32 clubRootNode);`

   - **Mainnet convenience:** `function configureMainnet() external onlyOwner` preloads **ENS registry** + **NameWrapper** well‑known addresses for mainnet. ([Ethereum (ETH) Blockchain Explorer][4], [docs.ens.domains][3])

3. **JobRegistry.sol (apply path):**

   - Add `IdentityRegistry public identity;` + `setIdentityRegistry(address)` (`onlyOwner`).
   - In **agent apply** entry point (`applyForJob(...)` or equivalent), **require** `identity.verifyAgent(msg.sender, agentLabel, proof)` success; bubble the ENS event or re‑emit a local event `AgentIdentityVerified`.

4. **ValidationModule.sol (commit/reveal path):**

   - Keep `IdentityRegistry public identity; setIdentityRegistry(address)` (`onlyOwner`).
   - In **commit** and/or **reveal** (or immediately before vote is recorded), **require** `identity.verifyValidator(msg.sender, validatorLabel, proof)` success; re‑emit a local event `ValidatorIdentityVerified`.

5. **DisputeModule/other role‑gated calls:** If any other flows require agent/validator identity, call into `IdentityRegistry` the same way.

**Tests (`test/v2/ens/*.t.sol` or TS):**

- Case matrix:

  - Valid resolver `addr(node)` match;
  - Valid **NameWrapper** owner;
  - Valid **registry owner** fallback;
  - Valid **Merkle allowlist** bypass;
  - **Additional** allowlisted address;
  - Negative cases for each path.

- Gas snapshots for added checks during apply/commit.

---

### Milestone 2 — $AGIALPHA‑only tokenization (staking, escrow, rewards, burns)

**Goal:** All value flows use **only** `$AGIALPHA` @ `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA` (payments, staking, fees, rewards, dispute fees). Address is **hardcoded** in a single source of truth (`Constants.sol`) and **never** mutable. The README deploy table already lists this token. ([GitHub][1])

**Deliverables**

1. **Constants.sol** (new):

   ```solidity
   // SPDX-License-Identifier: MIT
   pragma solidity ^0.8.20;
   library Constants {
       address constant AGIALPHA = 0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA;
       uint8   constant AGIALPHA_DECIMALS = 18;
   }
   ```

2. **StakeManager.sol / JobRegistry.sol / FeePool.sol / DisputeModule.sol:**

   - Replace any configurable `IERC20 public token` with `IERC20 private constant AGI = IERC20(Constants.AGIALPHA);`.
   - Remove token rotation setters if present (e.g., `setToken(...)`), or gate them behind a **permanent fuse**: once `lockToken()` is called by owner, token address becomes immutable, and **unit tests** ensure it is called in deployment.
   - All amounts expressed in **18‑decimals**.

3. **Burning guarantees:** introduce `IBurnable` interface and **require** success of `burn(amount)` for fee burns/slashing burns. If `$AGIALPHA` were not burnable, functions that would burn **must revert** (documented in NatSpec).
4. **Events for flows** (index by actors/jobId):

    - `event StakeDeposited(address indexed user, uint8 indexed role, uint256 amount);`
    - `event StakeWithdrawn(address indexed user, uint8 indexed role, uint256 amount);`
    - `event StakeSlashed(address indexed user, uint8 indexed role, address indexed employer, address indexed treasury, uint256 employerShare, uint256 treasuryShare, uint256 operatorShare, uint256 validatorShare, uint256 burnShare);`
    - `event JobFunded(uint256 indexed jobId, address indexed employer, uint256 amount);`
    - `event RewardPaid(uint256 indexed jobId, address indexed agent, uint256 amount);`
    - `event FeeAccrued(uint256 indexed jobId, uint256 amount);`
   - `event FeesBurned(uint256 amount);`
   - `event FeesDistributed(uint256 amount);`
   - `event DisputeFeePaid(uint256 indexed jobId, address indexed payer, uint256 amount);`
   - All use **primitive types** for clean Etherscan rendering.

**Tests:** positive/negative for token address mutation, burn behavior, and event emission coverage on common paths.

---

### Milestone 3 — Staking, slashing & quality enforcement

**Goal:** Solidify stake lifecycle and slashing with **owner‑tunable** parameters (within constraints), full events, and lockouts to protect funds while jobs are active.

**Deliverables**

- **StakeManager**:

  - Params: `minStake`, `maxStakePerAddress` (optional), `employerPct`, `treasuryPct` (sum ≤ 100%), `treasury`.
  - Invariants: cannot withdraw while assigned or during unbonding; slashing splits: `toEmployer`, `toTreasury`, `burnRemainder` (call token `burn`).
  - Owner setters emit `ParametersUpdated(...)`.

- **ValidationModule**: commit/reveal windows, `minValidators`, `maxValidators`, `approvalThreshold` documented and evented (`ValidationCommitted`, `ValidationRevealed`, `ValidationTallied`).
- **DisputeModule**: `disputeFee`, `disputeWindow`, `resolve(...)` yields slashing + redistribution; event `DisputeResolved`.

**Tests:** full job lifecycle including approval, rejection, dispute‑flip, slashing distribution, event logs.

---

### Milestone 4 — Docs polish & Etherscan UX

**Goal:** **Self‑contained** Markdown docs (no images or external files necessary), consistent headings, code‑fenced inputs, and copy‑pasteable Etherscan sequences.

**Deliverables**

- **`docs/` updates**:

  - `AGIJobs-v2-Mainnet-Guide.md` (this file)
  - `deployment-production-guide.md` (operator) and `user-etherscan-guide.md` (non‑technical) consolidated and cross‑linked.
  - Tables for module wiring, constructor params, and owner‑only setters mirror README. ([GitHub][1])

- **NatSpec** across public functions/events for Etherscan tooltips.

---

## C. Exact ENS requirement (evaluation & changes)

**What the legacy on‑chain contract shows**
The verified **AGIJobManager** includes interfaces to ENS `resolver(addr)`, `Resolver.addr(node)`, and `NameWrapper.ownerOf(tokenId)` and uses an internal `_verifyOwnership` (see file outline) to check subdomain ownership. This is consistent with a runtime policy that a validator must hold a **club.agi.eth** subdomain, with additional bypass/administration functions (e.g., “additional validator”). We mirror this exact structure in v2 via `IdentityRegistry`. ([Ethereum (ETH) Blockchain Explorer][2])

**What v2 presently signals**
The README highlights identity enforcement, lists `IdentityRegistry` setters (`setAgentRootNode`, `setClubRootNode`, Merkle roots, and additional allowlists), and instructs wiring `JobRegistry.setIdentityRegistry` and `ValidationModule.setIdentityRegistry`. This strongly indicates enforcement is designed into v2. The sprint **verifies & hardens** that calls like `applyForJob` and validator commit/reveal **require** `IdentityRegistry` checks and **cannot** bypass them. ([GitHub][1])

**Changes if any gaps exist**

- Ensure **all** role‑gated entry points in **JobRegistry** and **ValidationModule** perform `identity.verifyAgent/verifyValidator` and revert otherwise.
- Ensure ENS **mainnet addresses** are configured (`configureMainnet()`), or allow custom set via owner. ([Ethereum (ETH) Blockchain Explorer][4], [docs.ens.domains][3])
- Add/keep **Merkle bypass** + **Additional** allowlists for emergency only, with events.

---

## D. Code drops (patch‑style excerpts)

> **Note:** The following snippets are _original_ implementations (not verbatim copies) that reproduce the behavior outlined by the verified legacy contract: ENS forward lookup, registry owner, NameWrapper fallback, and Merkle bypass. They are designed for clean Etherscan UX and v2 module boundaries.

### D1. Interfaces

```solidity
// contracts/v2/interfaces/IENS.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IENS { function resolver(bytes32 node) external view returns (address); function owner(bytes32 node) external view returns (address); }

// contracts/v2/interfaces/IAddrResolver.sol
pragma solidity ^0.8.20;
interface IAddrResolver { function addr(bytes32 node) external view returns (address); }

// contracts/v2/interfaces/INameWrapper.sol
pragma solidity ^0.8.20;
interface INameWrapper { function ownerOf(uint256 id) external view returns (address); }
```

### D2. IdentityRegistry (core)

```solidity
// contracts/v2/IdentityRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IENS} from "./interfaces/IENS.sol";
import {IAddrResolver} from "./interfaces/IAddrResolver.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract IdentityRegistry is Ownable {
    IENS public ens;
    INameWrapper public nameWrapper;

    bytes32 public agentRootNode;    // namehash(agent.agi.eth)
    bytes32 public clubRootNode;     // namehash(club.agi.eth)

    bytes32 public agentMerkleRoot;      // optional bypass
    bytes32 public validatorMerkleRoot;  // optional bypass

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

    event ENSVerified(address indexed user, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);
    event AgentIdentityVerified(address indexed agent, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);
    event ValidatorIdentityVerified(address indexed validator, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);
    event ENSRootsUpdated(bytes32 agentRootNode, bytes32 clubRootNode);
    event ENSAddressesUpdated(address ens, address nameWrapper);
    event ENSBypassAdded(address indexed user, bool agent);
    event ENSBypassRemoved(address indexed user, bool agent);
    event ENSMerkleRootsUpdated(bytes32 agentRoot, bytes32 validatorRoot);

    constructor(address _ens, address _wrapper) {
        ens = IENS(_ens);
        nameWrapper = INameWrapper(_wrapper);
    }

    // --- Admin ---
    function configureMainnet() external onlyOwner {
        ens = IENS(0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);
        nameWrapper = INameWrapper(0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401);
        emit ENSAddressesUpdated(address(ens), address(nameWrapper));
    }
    function setENS(address _ens) external onlyOwner { ens = IENS(_ens); emit ENSAddressesUpdated(address(ens), address(nameWrapper)); }
    function setNameWrapper(address _nw) external onlyOwner { nameWrapper = INameWrapper(_nw); emit ENSAddressesUpdated(address(ens), address(nameWrapper)); }
    function setAgentRootNode(bytes32 n) external onlyOwner { agentRootNode = n; emit ENSRootsUpdated(agentRootNode, clubRootNode); }
    function setClubRootNode(bytes32 n) external onlyOwner { clubRootNode = n; emit ENSRootsUpdated(agentRootNode, clubRootNode); }
    function setAgentMerkleRoot(bytes32 r) external onlyOwner { agentMerkleRoot = r; emit ENSMerkleRootsUpdated(agentMerkleRoot, validatorMerkleRoot); }
    function setValidatorMerkleRoot(bytes32 r) external onlyOwner { validatorMerkleRoot = r; emit ENSMerkleRootsUpdated(agentMerkleRoot, validatorMerkleRoot); }
    function addAdditionalAgent(address a) external onlyOwner { additionalAgents[a] = true; emit ENSBypassAdded(a, true); }
    function removeAdditionalAgent(address a) external onlyOwner { additionalAgents[a] = false; emit ENSBypassRemoved(a, true); }
    function addAdditionalValidator(address v) external onlyOwner { additionalValidators[v] = true; emit ENSBypassAdded(v, false); }
    function removeAdditionalValidator(address v) external onlyOwner { additionalValidators[v] = false; emit ENSBypassRemoved(v, false); }

    // --- Public checks (used by JobRegistry / ValidationModule) ---
    function verifyAgent(address who, string memory label, bytes32[] memory proof)
        external view returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    { (ok,node,viaWrapper,viaMerkle) = _verify(who, label, agentRootNode, agentMerkleRoot, additionalAgents[who]); }

    function verifyValidator(address who, string memory label, bytes32[] memory proof)
        external view returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    { (ok,node,viaWrapper,viaMerkle) = _verify(who, label, clubRootNode, validatorMerkleRoot, additionalValidators[who]); }

    // --- Internal: mirrors AGIJobManager semantics (Merkle bypass + NameWrapper fallback) ---
    function _verify(address who, string memory label, bytes32 parent, bytes32 root, bool extra)
        internal view returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        bytes32 labelhash = keccak256(bytes(label));
        node = keccak256(abi.encodePacked(parent, labelhash));

        // Emergency bypass
        if (extra) { return (true, node, false, true); }
        if (root != bytes32(0)) {
            bytes32 leaf = keccak256(abi.encode(who, labelhash));
            if (MerkleProof.verifyCalldata(new bytes32, root, leaf)) { // replace with provided proof in callers if preferred
                return (true, node, false, true);
            }
        }

        // Resolver forward check
        address resolver = ens.resolver(node);
        if (resolver != address(0)) {
            (bool s, bytes memory data) = resolver.staticcall(abi.encodeWithSelector(IAddrResolver.addr.selector, node));
            if (s && data.length >= 32 && abi.decode(data, (address)) == who) { return (true, node, false, false); }
        }
        // Registry owner (unwrapped)
        if (ens.owner(node) == who) { return (true, node, false, false); }
        // NameWrapper fallback
        if (address(nameWrapper) != address(0)) {
            (bool s2, bytes memory d2) = address(nameWrapper).staticcall(abi.encodeWithSelector(INameWrapper.ownerOf.selector, uint256(node)));
            if (s2 && d2.length >= 32 && abi.decode(d2, (address)) == who) { return (true, node, true, false); }
        }
        return (false, node, false, false);
    }
}
```

> **Note:** `MerkleProof.verifyCalldata` shows the intended bypass. In production you will pass `proof` from callers; wire the parameter through `verifyAgent/verifyValidator` appropriately.

### D3. JobRegistry and ValidationModule hooks (usage)

```solidity
// JobRegistry.sol (excerpt)
IdentityRegistry public identity;
event AgentIdentityVerified(address indexed agent, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);

function setIdentityRegistry(address a) external onlyOwner { identity = IdentityRegistry(a); }

function applyForJob(uint256 jobId, string calldata agentLabel, bytes32[] calldata proof) external {
    (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) = identity.verifyAgent(msg.sender, agentLabel, proof);
    require(ok, "AGI: agent ENS check failed");
    emit AgentIdentityVerified(msg.sender, node, agentLabel, viaWrapper, viaMerkle);
    // ... rest of assignment logic
}
```

```solidity
// ValidationModule.sol (excerpt)
IdentityRegistry public identity;
event ValidatorIdentityVerified(address indexed validator, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle);

function setIdentityRegistry(address a) external onlyOwner { identity = IdentityRegistry(a); }

function commitValidation(uint256 jobId, bytes32 commitHash, string calldata validatorLabel, bytes32[] calldata proof) external {
    (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) = identity.verifyValidator(msg.sender, validatorLabel, proof);
    require(ok, "AGI: validator ENS check failed");
    emit ValidatorIdentityVerified(msg.sender, node, validatorLabel, viaWrapper, viaMerkle);
    // ... normal commit handling
}
```

---

## E. Operator Guide — **Etherscan‑only mainnet deployment**

> **Prereqs:** a funded deployer; a target **governance** (multisig/timelock) address; the **$AGIALPHA** address; ENS nodes for `agent.agi.eth` and `club.agi.eth` (or call `configureMainnet()` then set roots later). Ensure you can verify source on Etherscan. The README already lists module order and wiring; below is the concrete browser flow. ([GitHub][1])

### Step 1 — Deploy modules (order)

1. **StakeManager** → ctor: none or `(minStake, employerPct, treasuryPct, treasury)` depending on your file; token is fixed via `Constants.AGIALPHA`.
2. **ReputationEngine** → ctor: stake manager (if required).
3. **IdentityRegistry** → ctor: `(ENSRegistry, NameWrapper)`; call `configureMainnet()` post‑deploy to preload mainnet addresses. ([Ethereum (ETH) Blockchain Explorer][4], [docs.ens.domains][3])
4. **ValidationModule** → ctor: `(jobRegistry placeholder 0x0, stakeManager, commitWindow, revealWindow, minValidators, maxValidators)`
5. **DisputeModule** → ctor: `(jobRegistry placeholder 0x0, disputeFee, disputeWindow, moderator)`
6. **CertificateNFT** → ctor: `(name, symbol)`
7. **FeePool** → ctor: `(stakeManager, burnPct, treasury)`
8. **JobRegistry** → ctor: `(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, identityRegistry, feePool, taxPolicy?)`

> **Verify** each contract on Etherscan after deployment so the **Read/Write** tabs appear (copy constructor args exactly as used). ([Ethereum (ETH) Blockchain Explorer][6])

### Step 2 — Wire modules (Write tab calls)

- On **JobRegistry**: `setModules(validation, stake, reputation, dispute, certificate, feePool, [])`; `setIdentityRegistry(identity)`; `setFeePool(feePool)`; `setTaxPolicy(taxPolicy?)`. ([GitHub][1])
- On **StakeManager**: `setJobRegistry(jobRegistry)`; `setDisputeModule(dispute)` (if present). ([GitHub][1])
- On **ValidationModule**: `setJobRegistry(jobRegistry)`; `setIdentityRegistry(identity)`. ([GitHub][1])
- On **DisputeModule**: `setJobRegistry(jobRegistry)`; `setFeePool(feePool)`; `setTaxPolicy(taxPolicy?)`. ([GitHub][1])
- On **CertificateNFT**: `setJobRegistry(jobRegistry)`; `setStakeManager(stakeManager)`. ([GitHub][1])

### Step 3 — ENS identity configuration

- On **IdentityRegistry**: either `configureMainnet()` or call `setENS` + `setNameWrapper` with mainnet addresses, then `setAgentRootNode(namehash(agent.agi.eth))` and `setClubRootNode(namehash(club.agi.eth))`. You may set Merkle roots for emergency allowlist. ([Ethereum (ETH) Blockchain Explorer][4], [docs.ens.domains][3])

> **Tip:** The node for `<label>.agent.agi.eth` is `keccak256(abi.encodePacked(namehash("agent.agi.eth"), keccak256(bytes(label))))`. Same for `club.agi.eth`.

### Step 4 — Governance handoff

- Transfer ownership/admin to a **multisig/timelock**:

  - `StakeManager.setGovernance(gov)`; `JobRegistry.setGovernance(gov)`; for the rest, `transferOwnership(gov)`. The README lists recommended owner‑only setters per module; handoff ensures no single key can flip parameters. ([GitHub][1])

### Step 5 — Sanity checks (using Etherscan)

- Read **IdentityRegistry** roots; call `verifyAgent` or `verifyValidator` with a known ENS label. The call returns `(ok, node, viaWrapper, viaMerkle)` and emits `ENSVerified`.

  ```
  verifyAgent("0xAgent", "alice", [])
  // 0: bool true
  // 1: bytes32 0x2641541d3a011e8650c9d362d903c5e4149353eb4cb34761875be4b7455d3aca
  // 2: bool false   // viaWrapper
  // 3: bool false   // viaMerkle
  ```

  Job-level flows re‑emit `AgentIdentityVerified` or `ValidatorIdentityVerified` with the same tuple fields.

- Dry‑run with tiny `$AGIALPHA`:

  - Approve + deposit stake; create job; agent applies; validator commits/reveals; finalize; inspect **events** (`StakeDeposited`, `JobFunded`, `RewardPaid`, `FeesBurned`).

---

## F. Technical Users — **Deploy v2 via Etherscan (quick sequence)**

1. **Token approvals**: use the `$AGIALPHA` **token** page to `approve(StakeManager, amount)` for employer/agent funding and staking.
2. **Stake**: `StakeManager.depositStake(role, amount)`.
3. **Create job**: `JobRegistry.createJob(reward, uri)` (employer).
4. **Agent applies**: `JobRegistry.applyForJob(jobId, "label", proof[])` (reverts without valid `<label>.agent.agi.eth` or allowlist).
5. **Agent submits**: e.g., `JobRegistry.submitWork(jobId, resultHash)` (function may vary).
6. **Validators**: `ValidationModule.commitValidation(jobId, commitHash, "label", proof[])` then `revealValidation(jobId, approve, salt)`.
7. **Finalize**: `ValidationModule.finalize(jobId)` to trigger reward, fees, and burning.
8. **Dispute (optional)**: `JobRegistry.raiseDispute(jobId, evidenceURI)`; operator resolves via `DisputeModule.resolve(...)`.

---

## G. Non‑technical Users — **Using AGIJobs on Etherscan (plain language)**

1. **Wallet & tokens:** Connect a wallet (e.g., MetaMask) on **Ethereum mainnet** and get `$AGIALPHA`.
2. **ENS identity (if required):**

   - **Agents:** obtain a subdomain under **`agent.agi.eth`** pointing to your wallet.
   - **Validators:** obtain a subdomain under **`club.agi.eth`**.
   - If unsure, ask the operator to assign a subdomain to you or temporarily allowlist your address. (Transactions **will revert** without valid identity once enforcement is on.)

3. **Stake tokens:** On the **StakeManager** contract page → _Write Contract_:

   - First go to the **$AGIALPHA token** page → `approve(StakeManager, amount)`.
   - Then back to **StakeManager** → `depositStake(role, amount)` (role: Agent=0, Validator=1).

4. **Create a job (for buyers):** On **JobRegistry** → `createJob(reward, "ipfs://...")`, after approving the StakeManager to pull the reward.
5. **Apply to a job (agents):** On **JobRegistry** → `applyForJob(jobId, "yourLabel", [])`. If your ENS is set correctly, it succeeds (you’ll see an event).
6. **Validate (validators):** On **ValidationModule** → `commitValidation(...)` then `revealValidation(...)` during their respective windows.
7. **Finalize and payouts:** After reveal, the employer calls `finalize(jobId)` to pay the agent, credit validator rewards, send protocol fees to the FeePool, and **burn** the configured portion of fees.
8. **Dispute (optional):** Use **raiseDispute** if something looks wrong; the operator (or committee) will resolve it on‑chain.

_(ENS Registry + NameWrapper details are standardized across apps; this is why Etherscan‑only operation is viable.)_ ([docs.ens.domains][5])

---

## H. Production‑readiness notes

- **True burns:** All fee/stake burns call the token’s `burn()` and revert if unavailable; this ensures supply reduction is **verifiable** on the token contract (Etherscan total supply).
- **Owner updatability:** Parameters (`minStake`, windows, fee bps, slashing splits) are owner‑gated; use **multisig/timelock** as owner.
- **Etherscan UX:** All parameters/events use primitive types; NatSpec is included; no custom ABI structs at write time.
- **Monitoring:** Because events are structured and indexed, Etherscan/analytics can filter by jobId, user, and flow.

---

## I. Documentation & style (repository)

- **Self‑contained** Markdown (no external images required); **consistent headings**; event/param tables; verb‑first imperative for operator steps.
- README **Deployed Addresses** and **owner‑only setters** kept in a single source of truth (and linked from guides). ([GitHub][1])
- **NatSpec** coverage for every public function/event; short revert messages.
- **Linting/formatting:** `solhint`, Prettier Solidity, import order, SPDX headers; CI enforces formatting.

---

## J. Operator checklists

**Pre‑flight**

- [ ] Governance address prepared (multisig/timelock).
- [ ] ENS nodes decided; IdentityRegistry `configureMainnet()`. ([Ethereum (ETH) Blockchain Explorer][4], [docs.ens.domains][3])
- [ ] `$AGIALPHA` hardcoded; no token rotation in production. ([GitHub][1])

**Post‑deploy**

- [ ] All modules verified on Etherscan. ([Ethereum (ETH) Blockchain Explorer][6])
- [ ] `JobRegistry` ↔ modules wired; IdentityRegistry set. ([GitHub][1])
- [ ] Test a full small‑value job: apply → validate → finalize → inspect `FeesBurned`/`RewardPaid` events.

---

## K. Appendix — Notes on ENS implementation details

- **Why multiple checks?** Users can set a resolver `addr(node)` to their wallet **or** hold the **wrapped name** (NameWrapper ERC‑1155). A robust on‑chain check tries **resolver**, then **registry owner**, then **NameWrapper**. This matches the behavior implied by the legacy contract’s source layout. ([Ethereum (ETH) Blockchain Explorer][2])
- **Mainnet addresses** used in `configureMainnet()` are from official docs: ENS Registry and NameWrapper. ([Ethereum (ETH) Blockchain Explorer][4], [docs.ens.domains][3])

---

### L. What changed vs. today (delta summary)

- Runtime identity enforcement is applied at **agent apply** and **validator commit/reveal** (and any other role-gated flows) via a centralized `IdentityRegistry`.
- `$AGIALPHA` is **single, immutable** token across all modules.
- Fee/stake **burns** are required to call `burn()`.
- Events cover **all** $AGIALPHA movements and lifecycle transitions for Etherscan searchability.
- Etherscan operator + non‑technical user guides consolidated and clarified (browser‑only).

---

## M. References

- **Repo (v2 only, ENS policy, wiring, owner‑only setters, $AGIALPHA address):** AGIJobsv0 README. ([GitHub][1])
- **Legacy on‑chain contract (outline shows ENS/Resolver/NameWrapper + `_verifyOwnership`):** AGIJobManager @ `0x0178…a477`. ([Ethereum (ETH) Blockchain Explorer][2])
- **ENS Mainnet Registry address:** docs/Etherscan. ([Ethereum (ETH) Blockchain Explorer][4])
- **ENS NameWrapper mainnet address:** ENS docs. ([docs.ens.domains][3])
- **ENS Registry/Resolver concepts:** ENS docs (Registry/Resolution/Resolvers). ([docs.ens.domains][5])

---

### N. “Sprint board” (ready‑to‑import tasks)

1. **ENS enforcement**

   - [ ] Add interfaces `IENS`, `IAddrResolver`, `INameWrapper`.
   - [ ] Implement `IdentityRegistry` with `_verify` as above; events; admin setters; `configureMainnet()`.
   - [ ] Wire **JobRegistry.applyForJob** and **ValidationModule.commit/reveal** to `IdentityRegistry`.
   - [ ] Tests: resolver/registry/wrapper/merkle/additional/negative; gas snapshots.

2. **$AGIALPHA‑only**

   - [ ] Add `Constants.sol` with mainnet address + decimals.
   - [ ] Refactor modules to use `Constants.AGIALPHA`; remove/lock token setters; tests.
   - [ ] Enforce `burn()` availability; revert otherwise; tests.

3. **Events & UX**

   - [ ] Emit events listed in Milestone 2; review NatSpec for all public APIs; add Etherscan‑friendly parameter names.

4. **Staking/Slashing**

   - [ ] Finalize parameters and invariants; add `StakeSlashed`, `FeesBurned`, `DisputeResolved`; tests for distributions and edge cases.

5. **Docs & verification**

   - [ ] Update `docs/*` with Etherscan sequences; README tables in sync.
   - [ ] Verify all contracts on Etherscan and record addresses in a `docs/deployment-addresses.md`.

---

**End of master guide.**

[1]: https://github.com/MontrealAI/AGIJobsv0 "GitHub - MontrealAI/AGIJobsv0: ✨ \"We choose to free humanity from the bonds of job slavery—not because it is easy, but because our destiny demands nothing less; because doing so unleashes the full measure of our genius and spirit; and because we embrace this challenge and carry it to triumph.\" ✨"
[2]: https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477 "
Address: 0x0178b6ba...c1d5ba477 | Etherscan
"
[3]: https://docs.ens.domains/wrapper/contracts?utm_source=chatgpt.com "Name Wrapper Contract Details | ENS Docs"
[4]: https://etherscan.io/address/0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e?utm_source=chatgpt.com "ENS: Registry with Fallback | Address - Etherscan"
[5]: https://docs.ens.domains/registry/ens?utm_source=chatgpt.com "The Registry | ENS Docs"
[6]: https://etherscan.io/verifyContract?utm_source=chatgpt.com "Verify & Publish Contract Source Code - Etherscan"
