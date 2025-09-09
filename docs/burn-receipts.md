# Burn receipts

Employers must burn their own $AGIALPHA and provide proof before validators can approve a job. The platform never initiates the burn. Employers must also acknowledge the active tax policy before submitting any burn evidence.

## Steps

1. From the employer wallet call `burn(uint256)` on the $AGIALPHA token contract using Etherscan or a compatible wallet.
2. Copy the resulting transaction hash and block number.
3. Acknowledge the current tax policy if you have not already.
4. Call `JobRegistry.submitBurnReceipt(jobId, txHash, amount, blockNumber)` from the same employer address.
5. Confirm the burn by calling `JobRegistry.confirmEmployerBurn(jobId, txHash)`.
6. Validators include `burnTxHash` in their commit‑reveal cycle. The `ValidationModule` rejects any reveal that does not match a submitted receipt.

This flow keeps token destruction fully on the employer while providing an auditable on‑chain record for validators and observers.
