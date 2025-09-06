# ENS Identity Setup

Agents and validators must prove ownership of specific ENS subdomains before interacting with the AGIJobs platform. This guide walks through obtaining a name, configuring records, and optionally delegating access.

## Required subdomains

- **Agents:** `<name>.agent.agi.eth`
- **Validators:** `<name>.club.agi.eth`

## Register and configure

1. **Request a subdomain** from the AGI operators or the provided registration dApp.
2. **Point the name to your address** by either:
   - Setting the resolver `addr` record, or
   - Wrapping the name with the ENS NameWrapper so the subdomain NFT is held by your wallet.
3. **Verify ownership** off-chain using an ENS lookup or on-chain by calling `IdentityRegistry.verifyAgent` or `verifyValidator`.

Transactions will revert if the calling address does not own the claimed subdomain. Owner‑controlled allowlists and Merkle proofs exist only for emergencies and should not be relied on for normal operation.

## Issuing subdomains

Project operators create subdomains under `agent.agi.eth` or `club.agi.eth` and assign them to participant addresses. Example using the Hardhat console:

```bash
npx hardhat console --network <network>
> const wrapper = await ethers.getContractAt('INameWrapper', process.env.NAME_WRAPPER);
> const resolver = process.env.PUBLIC_RESOLVER; // typically the PublicResolver
> const parent = ethers.namehash('agent.agi.eth'); // or 'club.agi.eth'
> const label = ethers.keccak256(ethers.toUtf8Bytes('alice'));
> await wrapper.setSubnodeRecord(parent, label, '0xAgent', resolver, 0);
```

After issuing the subdomain, set the resolver `addr` record to the participant’s wallet:

```bash
> const res = await ethers.getContractAt('IResolver', resolver);
> const node = ethers.namehash('alice.agent.agi.eth');
> await res['setAddr(bytes32,address)'](node, '0xAgent');
```

To confirm ownership on-chain:

```bash
> const id = await ethers.getContractAt('IdentityRegistry', process.env.IDENTITY_REGISTRY);
> await id.verifyAgent('0xAgent', 'alice', []); // use verifyValidator for validators
```

## Delegating with attestations

An ENS name owner may authorize another address to act on their behalf through the `AttestationRegistry`:

```bash
npx hardhat console --network <network>
> const att = await ethers.getContractAt('AttestationRegistry', process.env.ATTESTATION_REGISTRY);
> const node = ethers.namehash('alice.agent.agi.eth');
> await att.attest(node, 0, '0xDelegate'); // 0 = Agent, 1 = Validator
```

The delegated address may then interact with `JobRegistry` or `ValidationModule` without holding the ENS name directly. See [docs/attestation.md](attestation.md) for detailed commands.

## Keep records current

If a subdomain is transferred or its resolver changes, the new owner must update the platform by re‑attesting or letting the cache expire. Otherwise subsequent actions will fail the identity check.
