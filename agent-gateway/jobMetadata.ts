/** Decode JobRegistryBase's packed metadata without changing uint64 precision.
 * Compatibility is checked against the deployed contract decoder in the gateway
 * registry regression suite.
 */
export function decodeJobMetadata(packed: bigint | string) {
  const value = BigInt(packed);
  if (value < 0n || value >= 1n << 256n)
    throw new Error('Invalid packed job metadata');
  const field = (offset: bigint, mask: bigint) => (value >> offset) & mask;
  return {
    state: Number(field(0n, 7n)),
    success: field(3n, 1n) === 1n,
    burnConfirmed: field(4n, 1n) === 1n,
    agentTypes: Number(field(5n, 255n)),
    feePct: Number(field(13n, 0xffffffffn)),
    agentPct: Number(field(45n, 0xffffffffn)),
    deadline: field(77n, 0xffffffffffffffffn),
    assignedAt: field(141n, 0xffffffffffffffffn),
  };
}
