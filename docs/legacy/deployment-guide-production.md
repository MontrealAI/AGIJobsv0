# AGI Jobs Production Deployment Guide

This document provides a quick checklist and summarizes each core module before deploying AGI Jobs on Ethereum.

## Prerequisite Checklist

- **Ethereum wallet** with enough ETH for gas; the deploying wallet becomes owner of every module.
- **$AGIALPHA token** address and balance for any fee or staking actions.
- **ENS information** such as namehashes for restricted subdomains and the addresses of the ENS registry and name wrapper (use `0x00` for open access).
- **Contract source code** available for verification on Etherscan.
- **Basic familiarity with Etherscan** to use the _Write_ and _Read_ contract tabs.

## Module Roles

- **StakeManager** – Escrows job rewards, manages staking for roles, and handles slashing/burning.
- **JobRegistry** – Central registry tracking job creation, applications, validations, disputes, and payouts.
- **ValidationModule** – Runs commit–reveal validation rounds and selects validators.
- **DisputeModule** – Provides dispute escalation and resolution.
- **ReputationEngine** – Maintains reputation scores and blacklists.
- **CertificateNFT** – Issues NFTs certifying completed jobs.
- **IdentityRegistry** – Optional ENS gating and allowlist checks.
- **FeePool** – Collects protocol fees and can burn a configured percentage.
- **PlatformRegistry** _(optional)_ – Records approved front-end platforms.
- **JobRouter** _(optional)_ – Routes jobs to registered platforms.
- **PlatformIncentives** _(optional)_ – Helper that manages platform staking and registration.
- **TaxPolicy** _(optional)_ – On-chain acknowledgement of terms or tax obligations.
