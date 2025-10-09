# DEPLOYED_ADDRESSES.md — AGIJobs v2

> **Purpose:** Canonical registry of contract addresses and deployment metadata. Commit this file to the repo after each environment deployment.

---

## Release
- **Protocol:** AGIJobs **v2**
- **Release tag:** v2.x.x
- **Network:** <mainnet | sepolia | holesky>
- **Chain ID:** <1 | 11155111 | 17000>
- **Deployment date (UTC):** <YYYY-MM-DD>
- **$AGIALPHA token:** `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`
- **Governance (Safe) address:** <0x...>
- **Safe threshold:** <e.g., 2-of-3>
- **Defender Relayer ID / name:** <relayer-id-or-name>
- **Deployer (EOA/Relayer):** <address if used>
- **Etherscan org:** <link to org/verification page>

---

## Contracts (v2)

| Module/Contract      | Address        | Proxy | Impl Address   | Tx Hash      | Block # | Verified | Notes |
|---|---|:--:|---|---|---:|:--:|---|
| StakeManager         | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| ReputationEngine     | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| IdentityRegistry     | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| ValidationModule     | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| DisputeModule        | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| CertificateNFT       | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| JobRegistry          | <0x...>        | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |
| FeePool *(if separate)* | <0x...>     | <Y/N>| <0x...>        | <0x...>      | <#>    | <Y/N>    |       |

> If a contract is upgradeable, ensure **Proxy** is `Y` and **Impl Address** is filled. Use explorer "Read/Write as Proxy".

---

## Parameters snapshot (post‑init)

- **Fee %:** <e.g., 2%>
- **Burn %:** <e.g., 50% of fees>
- **Treasury address:** <0x... or “unset”> *(must be on allowlist before setting)*
- **Treasury allowlist entries:** <addresses>
- **Operators/Oracles:** <addresses and roles>
- **Paused modules at T0:** <list or “none”>

---

## Owner & roles snapshot

```json
{
  "owner": "<0x... (Safe)>",
  "role_holders": {
    "PAUSER": ["<0x...>"],
    "OPERATOR": ["<0x...>"],
    "ORACLE": ["<0x...>"]
  }
}
```

---

## Explorer links

- StakeManager: <https://etherscan.io/address/0x...>
- ReputationEngine: <https://etherscan.io/address/0x...>
- IdentityRegistry: <https://etherscan.io/address/0x...>
- ValidationModule: <https://etherscan.io/address/0x...>
- DisputeModule: <https://etherscan.io/address/0x...>
- CertificateNFT: <https://etherscan.io/address/0x...>
- JobRegistry: <https://etherscan.io/address/0x...>
- FeePool (if separate): <https://etherscan.io/address/0x...>

---

## Artifacts

- **Proxy/Impl verification receipts:** `./reports/<network>/*verification*.json`
- **Safe transaction hashes:** `./reports/<network>/*safe*.json`
- **Owner plan outputs:** `./reports/<network>/owner-plan.json`
- **Subgraph (if used):** <URL/commit>

---

## Change history

- YYYY‑MM‑DD — initial v2 deployment on <network> by <Safe tx link>.
- YYYY‑MM‑DD — parameter update (fee %, treasury, allowlists) via <Safe tx link>.
