import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

export const REQUEST_WINDOW_MS = 60_000;
export const REQUESTS_PER_PEER = 240;
export const REQUESTS_PER_PROCESS = 2400;

/** Derive a quota identity from the transport peer, never a client header. */
export function peerAddressKey(address?: string): string {
  let candidate = address ?? '';
  if (candidate.startsWith('::ffff:') && isIP(candidate.slice(7)) === 4)
    candidate = candidate.slice(7);
  return isIP(candidate) ? ipKeyGenerator(candidate, 56) : 'unknown-peer';
}

/** gRPC getPeer() includes a transport prefix and ephemeral source port. */
export function grpcPeerAddress(peer?: string): string {
  if (!peer || !/^(ipv4|ipv6):/.test(peer)) return '';
  const addressWithPort = peer.slice(peer.indexOf(':') + 1);
  const end = addressWithPort.lastIndexOf(':');
  if (end < 0 || !/^\d+$/.test(addressWithPort.slice(end + 1))) return '';
  return addressWithPort.slice(0, end).replace(/^\[|\]$/g, '');
}

export interface BudgetDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * A fixed-window process budget for non-HTTP transports. The process ceiling
 * runs before peer allocation, so at most processLimit peer keys can exist.
 * Replicas require a shared ingress limit in addition to these local budgets.
 */
export class GatewayRequestBudget {
  private readonly peers = new Map<string, number>();
  private total = 0;
  private resetAt: number;

  constructor(
    private readonly peerLimit = REQUESTS_PER_PEER,
    private readonly processLimit = REQUESTS_PER_PROCESS,
    private readonly windowMs = REQUEST_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {
    for (const limit of [peerLimit, processLimit, windowMs]) {
      if (!Number.isSafeInteger(limit) || limit <= 0)
        throw new Error('Request budget limits must be positive safe integers');
    }
    this.resetAt = this.now() + windowMs;
  }

  consume(peerAddress?: string): BudgetDecision {
    const current = this.now();
    if (current >= this.resetAt) {
      this.total = 0;
      this.peers.clear();
      this.resetAt = current + this.windowMs;
    }
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((this.resetAt - current) / 1000)
    );
    if (this.total >= this.processLimit)
      return { allowed: false, retryAfterSeconds };
    this.total++;
    const key = peerAddressKey(peerAddress);
    const count = this.peers.get(key) ?? 0;
    if (count >= this.peerLimit) return { allowed: false, retryAfterSeconds };
    this.peers.set(key, count + 1);
    return { allowed: true, retryAfterSeconds };
  }
}
