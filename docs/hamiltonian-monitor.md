# Hamiltonian Monitor

This script computes a simple Hamiltonian metric for reward epochs.

It queries `EpochSettled` events from `RewardEngineMB` and reports the
value

\[ H = \Delta H - \lambda R \]

where `\Delta H` is the enthalpy change emitted by the contract,
`R` is the reward budget and `\lambda` is a scaling coefficient passed on
the command line. A free‑energy estimate is also shown using the epoch's
entropy data.

## Usage

```
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/hamiltonian-tracker.ts \
  --engine <reward_engine_address> [--from <block>] [--to <block>] [--lambda <scale>]
```

Each matching epoch prints a line:

```
epoch 1 h=123 free=45
```

The output can be ingested by monitoring systems or governance dashboards
to track approach toward equilibrium.
