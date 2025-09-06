# Attestation Registry

`AttestationRegistry` lets ENS subdomain owners pre-authorize other addresses
to act as agents or validators. Once attested, addresses skip the expensive ENS
ownership check performed by `IdentityRegistry` and can participate using the
delegated wallet. For setting up the base ENS records and issuing
subdomains see [ens-identity-setup.md](ens-identity-setup.md).

## Deployment

Deploy the registry and wire it into `IdentityRegistry` so that consumer modules
can consult attestations:

```bash
IDENTITY_REGISTRY=<identity> npx hardhat run scripts/v2/deployAttestation.ts --network <network> [ens nameWrapper]
```

If the ENS registry or NameWrapper addresses are omitted the script uses the
mainnet defaults. After deployment it automatically calls
`IdentityRegistry.setAttestationRegistry(address)`.

`JobRegistry` and `ValidationModule` cache successful lookups for around
24 hours to save gas, but entries automatically expire or invalidate when ENS
data changes.

## Granting and revoking

1. Compute the ENS node for the subdomain:

   ```js
   const node = ethers.namehash('alice.agent.agi.eth');
   ```

2. From the ENS name owner's wallet call:

   ```bash
   npx hardhat console --network <network>
   > const att = await ethers.getContractAt('AttestationRegistry', process.env.ATTESTATION_REGISTRY);
   > const node = ethers.namehash('alice.agent.agi.eth');
   > await att.attest(node, 0, '0xDelegate'); // 0 = Agent, 1 = Validator
   ```

3. To revoke the authorization:

   ```bash
   > await att.revoke(node, 0, '0xDelegate');
   ```

Instead of using the console, operators can run the helper script which
computes the node, verifies ownership and submits the transaction in one
command:

```bash
ATTESTATION_REGISTRY=<address> npx hardhat run scripts/v2/attestEns.ts --network <network> alice agent 0xDelegate
```

Replace `alice` with the desired subdomain and pass `validator` to attest a
validator address. The transaction consumes roughly 55k gas and revoking an
attestation later costs about 33k gas.

## Verifying before use

Delegated addresses should confirm that an attestation exists before using the
platform:

```bash
npx hardhat console --network <network>
> await att.isAttested(node, 0, '0xDelegate');
```

If the call returns `true` the address may interact with `JobRegistry` and
`ValidationModule`.

Full CLI example:

```bash
# Attest a delegate for alice.agent.agi.eth
ATTESTATION_REGISTRY=<address> npx hardhat run scripts/v2/attestEns.ts --network <network> alice agent 0xDelegate

# Check cached authorization
npx hardhat console --network <network>
> const att = await ethers.getContractAt('AttestationRegistry', process.env.ATTESTATION_REGISTRY);
> const node = ethers.namehash('alice.agent.agi.eth');
> await att.isAttested(node, 0, '0xDelegate');
```

## Script helpers

`examples/ethers-quickstart.js` exports convenience helpers:

```bash
node -e "require('./examples/ethers-quickstart').attest('alice.agent.agi.eth', 0, '0xDelegate')"
node -e "require('./examples/ethers-quickstart').revoke('alice.agent.agi.eth', 0, '0xDelegate')"
```

Set `ATTESTATION_REGISTRY` in your environment to the deployed contract address
before running these commands.
