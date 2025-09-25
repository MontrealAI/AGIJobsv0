import type { ICSType } from "../router.js";
import { loadContracts, getSignerForUser } from "../chain/deps.js";
import { formatError, pinToIpfs } from "./common.js";

export async function* raise(ics: ICSType) {
  const jobIdInput = (ics.params as any)?.jobId;
  const dispute = ((ics.params as any)?.dispute ?? {}) as Record<string, unknown>;
  const userId = ics.meta?.userId;

  if (!jobIdInput) {
    yield "Missing jobId.\n";
    return;
  }
  if (dispute.reason === undefined) {
    yield "Missing dispute reason.\n";
    return;
  }
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const jobId = normalizeJobId(jobIdInput);
    const signer = await getSignerForUser(userId);
    const { disputeModule } = loadContracts(signer);

    const { reasonUri, packaged } = await prepareReason(dispute);
    if (!reasonUri) {
      throw new Error("Unable to resolve dispute reason");
    }

    if (packaged) {
      yield "📦 Packaging dispute evidence…\n";
      yield `📨 Evidence pinned: ${reasonUri}\n`;
    }

    yield "⚖️ Raising dispute…\n";
    const tx = await disputeModule.raiseDispute(jobId, reasonUri);
    yield `⛓️ Dispute tx submitted: ${tx.hash}\n`;
    await tx.wait();

    yield `✅ Dispute submitted for job #${jobId.toString()}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

function normalizeJobId(input: unknown): bigint {
  if (typeof input === "bigint") {
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Invalid jobId");
    return BigInt(Math.floor(input));
  }
  if (typeof input === "string") {
    const trimmed = input.trim().replace(/^#/, "");
    if (!trimmed) throw new Error("Invalid jobId");
    return BigInt(trimmed);
  }
  throw new Error("Invalid jobId");
}

async function prepareReason(
  dispute: Record<string, unknown>
): Promise<{ reasonUri: string | null; packaged: boolean }> {
  const rawReason = dispute.reason;
  const reasonText = typeof rawReason === "string" ? rawReason.trim() : "";
  const reasonObject =
    rawReason && typeof rawReason === "object" ? (rawReason as Record<string, unknown>) : undefined;
  const uri = typeof dispute.uri === "string" ? dispute.uri.trim() : "";
  const evidence = dispute.evidence;
  const attachments = dispute.attachments;
  const payload = dispute.payload;

  if (uri) {
    return { reasonUri: uri, packaged: false };
  }

  const needsPackaging =
    reasonObject !== undefined ||
    !reasonText ||
    evidence !== undefined ||
    attachments !== undefined ||
    payload !== undefined;

  if (needsPackaging) {
    const bundle: Record<string, unknown> = {};
    if (reasonObject !== undefined) {
      bundle.reason = reasonObject;
    } else if (reasonText) {
      bundle.reason = reasonText;
    }
    if (payload !== undefined) {
      bundle.payload = payload;
    }
    if (evidence !== undefined) {
      bundle.evidence = evidence;
    }
    if (attachments !== undefined) {
      bundle.attachments = attachments;
    }
    const uriValue = await pinToIpfs(bundle);
    return { reasonUri: uriValue, packaged: true };
  }

  if (!reasonText) {
    return { reasonUri: null, packaged: false };
  }
  return { reasonUri: reasonText, packaged: false };
}
