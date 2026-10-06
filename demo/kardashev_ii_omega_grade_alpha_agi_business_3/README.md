# Kardashev Business 3 — Foundation

This is the ASCII-safe entry point for the **Foundation simulation engine**. AGI Jobs coordinates authorized, lawful screen-based work with specialized agents, reviewable evidence, independent verification and separate settlement authority.

## Start here

- [Open the shared website](https://montrealai.github.io/AGIJobsv0/experiments/kardashev-business/) after deployment.
- [Read the complete workbench guide](../kardashev_ii_omega_grade_alpha_agi_business_3/workbench/README.md): ten job templates, local artifact checks, approved OpenClaw dispatch, capacity assumptions and qualification limits.
- From the repository root, run `npm run demo:kardashev-business:serve` for the local explorer. No dependency installation is needed for that command.

## Run this simulation

Use Python 3.12 from the repository root:

```sh
python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3 --max-cycles 3 --no-resume
```

This bounded command produces synthetic orchestration state. It does not invoke OpenAI, operate a real desktop or submit blockchain transactions. `npm run demo:kardashev-business:smoke` checks all five engines using isolated temporary state.

The original implementations and flowcharts remain available through the [demo catalog](../README.md). The shared website adds a practical work-order and evidence path; simulation output is not production qualification.
