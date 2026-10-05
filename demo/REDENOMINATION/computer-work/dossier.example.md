# Synthetic redenomination dossier

This is a checked-in example, not output from a live worker or a token migration.
The source is `ledger.json`, SHA-256 `a71726a9a1c4966bd0d4812fc21ae1a12cc56a4b365712086ca9ee7debc07e67`.

The proposal uses 1,000 old tokens per new token and changes precision from 18 to 6.
Each account is rounded down individually. The allocated total is 3501900 new
base units. Pending escrow and withdrawal liabilities are included as separate
synthetic accounts; neither represents additional circulating supply.

The residual is 1200000000000000000000/1000000000000000000000 of a new base unit, or 1.2 base units.
Flooring the aggregate yields 3501901 units, one more than the sum of the
account allocations. That extra unit is not silently distributed. A real migration
requires an approved residual-allocation policy and reconciliation of every claim.
The fixture deliberately exposes this difference. Zero balances remain zero.

An independent checker verifies arithmetic and structure. Human review of the
sources, legal obligations, economic design and proposed residual allocation
remains required. No balances, permissions, contracts or settlement are changed.
