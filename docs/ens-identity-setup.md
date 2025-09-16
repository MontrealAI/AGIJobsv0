# ENS Identity Setup

Agents and validators must prove ownership of specific ENS subdomains before interacting with the AGIJobs platform. This guide walks through obtaining a name, configuring records, and optionally delegating access.

## Agent gateway automation

The agent gateway now provisions ENS identities automatically whenever the
agent factory materialises a new blueprint. The helper in
`agent-gateway/ensRegistrar.ts` claims a subdomain under `agent.agi.eth`,
`club.agi.eth`, or `a.agi.eth`, sets the resolver `addr` record, updates the
reverse registrar, and verifies the result with `provider.lookupAddress`. The
verification result is appended to the structured audit log so auditors can
confirm the chain of custody for every identity file.

### Configuration

- Set `ENS_REGISTRY_ADDRESS` and `ENS_REVERSE_REGISTRAR_ADDRESS` in
  `agent-gateway/.env` so the registrar knows which contracts to call.
- Provide `ENS_OWNER_KEY`, the private key that controls the parent ENS nodes.
- Update `config/ens.json` with the resolver addresses for `agent.agi.eth`,
  `club.agi.eth`, and `a.agi.eth`. The helper reads the node hashes and
  resolver addresses from this file when claiming subdomains.

When the gateway claims a label it normalises the name, updates the stored
blueprint (and any persisted JSON file), and persists the resulting identity to
`config/agents/<label>.json`. The identity file now includes the parent name,
resolver, and registration transaction hashes so the provenance of the ENS
record is auditable.

## Manual registration with `scripts/registerEns.ts`

The repository ships with `scripts/registerEns.ts`, a utility that mints a
fresh keypair, registers the ENS subdomain, updates the resolver, and writes a
keystore entry that the agent gateway can consume. The script verifies the
reverse record on-chain so the stored metadata always matches what
`provider.lookupAddress` reports.

### Prerequisites

- Set `ENS_OWNER_KEY` to the private key that controls `agent.agi.eth` or
  `club.agi.eth`.
- Provide an RPC endpoint via `RPC_URL` (defaults to `http://localhost:8545`).
- Install project dependencies so `ts-node` and `ethers` are available.

### Register a new agent or validator

```bash
RPC_URL=https://mainnet.infura.io/v3/<key> \
ENS_OWNER_KEY=0xYourOwnerKey \
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/registerEns.ts <label>
```

Add `--club` (or `--role=validator`) to create `<label>.club.agi.eth`. The
script accepts `--rpc`, `--owner-key`, and `--force` to override defaults or
overwrite an existing record.

### Example session

```bash
$ npx ts-node --compiler-options '{"module":"commonjs"}' scripts/registerEns.ts demo
Registering demo.agent.agi.eth for 0x0A1b2C3d4E5f6789012345678901234567890123
setSubnodeRecord tx: 0xabc...123
setAddr tx: 0xdef...456
setName tx: 0x987...654
Verified reverse record demo.agent.agi.eth
Saved identity file to config/agents/demo.json
```

### Generated configuration file

Each run creates `config/agents/<label>.json` with the registered address and
private key:

```json
{
  "label": "demo",
  "ens": "demo.agent.agi.eth",
  "address": "0x0A1b2C3d4E5f6789012345678901234567890123",
  "privateKey": "0xabc123...",
  "role": "agent",
  "parent": "agent.agi.eth",
  "resolver": "0x1234...beef",
  "chainId": 1,
  "network": "homestead",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

The gateway loads every file in `config/agents/`, hydrates an `ethers.Wallet`
when a private key is present, and verifies the reverse lookup matches the
recorded ENS name. The orchestrator caches these wallets by ENS label so
multiple agents can be managed simultaneously.

### Verify ENS resolution

After registration you can confirm both the forward and reverse lookups:

```bash
# Reverse lookup
node -e "const { ethers } = require('ethers');(async () => { const provider = new ethers.JsonRpcProvider(process.env.RPC_URL); console.log(await provider.lookupAddress('0x0A1b2C3d4E5f6789012345678901234567890123')); })();"

# Forward lookup
node -e "const { ethers } = require('ethers');(async () => { const provider = new ethers.JsonRpcProvider(process.env.RPC_URL); console.log(await provider.resolveName('demo.agent.agi.eth')); })();"
```

You should see `demo.agent.agi.eth` from the reverse query and the agent
address from the forward lookup. Any mismatch means the resolver has not been
updated or the transaction has not yet been mined.

## Manual workflow (advanced)

### Required subdomains

- **Agents:** `<name>.agent.agi.eth`
- **Validators:** `<name>.club.agi.eth`

### Register and configure

1. **Request a subdomain** from the AGI operators or the provided registration dApp.
2. **Point the name to your address** by either:
   - Setting the resolver `addr` record, or
   - Wrapping the name with the ENS NameWrapper so the subdomain NFT is held by your wallet.
3. **Verify ownership** off-chain using an ENS lookup or on-chain by calling `IdentityRegistry.verifyAgent` or `verifyValidator`. Each call returns `(ok, node, viaWrapper, viaMerkle)` and emits `ENSVerified`; successful job or validation actions re‑emit `AgentIdentityVerified` or `ValidatorIdentityVerified`.

Transactions will revert if the calling address does not own the claimed subdomain. Owner‑controlled allowlists and Merkle proofs exist only for emergencies and should not be relied on for normal operation.

In the event of an ENS outage or other emergency, governance may
temporarily allowlist addresses using
`IdentityRegistry.addAdditionalAgent` or `addAdditionalValidator`.
Such entries must be short‑lived and are tracked by the
`AdditionalAgentUsed` and `AdditionalValidatorUsed` events which include
the claimed subdomain. Governance should remove the allowlisted address
once a proper ENS name is registered.

### Issuing subdomains

Project operators create subdomains under `agent.agi.eth` or `club.agi.eth` and assign them to participant addresses. Example using the Hardhat console:

```bash
npx hardhat console --network <network>
> const wrapper = await ethers.getContractAt('INameWrapper', process.env.NAME_WRAPPER);
> const resolver = process.env.PUBLIC_RESOLVER; // typically the PublicResolver
> const parent = ethers.namehash('agent.agi.eth'); // or 'club.agi.eth'
> const label = ethers.keccak256(ethers.toUtf8Bytes('alice'));
> await wrapper.setSubnodeRecord(parent, label, '0xAgent', resolver, 0);
```

#### Setting resolver records

Once the subdomain token is minted, the owner must update the resolver so the name resolves to their wallet address. This can be done in the ENS Manager or directly from the command line.

**ENS Manager UI**

1. Visit <https://app.ens.domains> and search for the new subdomain.
2. Open the **Records** tab and locate the **Address** section.
3. Enter your wallet address and press **Save**.
4. Confirm the transaction in your wallet. After it is mined, the name resolves to your address.

**CLI example**

```bash
npx hardhat console --network <network>
> const res = await ethers.getContractAt('IAddrResolver', resolver);
> const node = ethers.namehash('alice.agent.agi.eth');
> await res['setAddr(bytes32,address)'](node, '0xAgent');
> await res['addr(bytes32)'](node); // verify
```

To confirm ownership on-chain:

```bash
> const id = await ethers.getContractAt('IdentityRegistry', process.env.IDENTITY_REGISTRY);
> const [ok, node, viaWrapper, viaMerkle] = await id.verifyAgent('0xAgent', 'alice', []); // use verifyValidator for validators
> // Etherscan lists: 0: ok, 1: node, 2: viaWrapper, 3: viaMerkle
```

Example Etherscan call:

```
verifyAgent("0xAgent", "alice", [])
0: bool true
1: bytes32 0x2641541d3a011e8650c9d362d903c5e4149353eb4cb34761875be4b7455d3aca
2: bool false   // viaWrapper
3: bool false   // viaMerkle
```

Similarly for a validator:

```
verifyValidator("0xValidator", "alice", [])
0: bool true
1: bytes32 0xc8c2499427432d9c12ca7e3507602b8f6992a6cee02be12755678f99b17d7e76
2: bool false   // viaWrapper
3: bool false   // viaMerkle
```

### Delegating with attestations

An ENS name owner may authorize another address to act on their behalf through the `AttestationRegistry`:

```bash
npx hardhat console --network <network>
> const att = await ethers.getContractAt('AttestationRegistry', process.env.ATTESTATION_REGISTRY);
> const node = ethers.namehash('alice.agent.agi.eth');
> await att.attest(node, 0, '0xDelegate'); // 0 = Agent, 1 = Validator
```

The delegated address may then interact with `JobRegistry` or `ValidationModule` without holding the ENS name directly. See [docs/attestation.md](attestation.md) for detailed commands.

### Keep records current

If a subdomain is transferred or its resolver changes, the new owner must update the platform by re‑attesting or letting the cache expire. Otherwise subsequent actions will fail the identity check.
