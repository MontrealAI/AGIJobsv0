# Alpha-Meta Consistency Audit

Generated at: 2025-10-20T18:38:18.557Z

## Baseline invariants

- Gibbs free energy (kJ): 222153.726000
- Jarzynski expectation (log): -38.414394
- Jarzynski theoretical (log): -37.911526
- Equilibrium profile: 3.0667172e-1, 3.3282790e-1, 3.6050038e-1

## Iteration comparisons

| Iteration | Duration (ms) | Δ Gibbs (kJ) | Δ Jarzynski (expectation) | Δ Jarzynski (theoretical) | Δ Equilibrium (L∞) |
| --- | --- | --- | --- | --- | --- |
| 1 | 9717.9918 | 0.00000e+0 | 0.00000e+0 | 0.00000e+0 | 0.00000e+0 |
| 2 | 9331.5218 | 0.00000e+0 | 0.00000e+0 | 0.00000e+0 | 0.00000e+0 |
| 3 | 9650.9015 | 0.00000e+0 | 0.00000e+0 | 0.00000e+0 | 0.00000e+0 |

## Manifest verification

All key artefacts are present with matching digests and byte lengths.

## Verdict

✅ Alpha-Meta invariants are deterministic across repeated computations and manifest integrity is intact.

### Tolerances

- Gibbs free energy Δ ≤ 1.00000e-6 kJ (observed 0.00000e+0)
- Jarzynski log Δ ≤ 1.00000e-9 (observed max expectation Δ 0.00000e+0, theoretical Δ 0.00000e+0)
- Equilibrium Δ ≤ 1.00000e-9 (observed 0.00000e+0)
