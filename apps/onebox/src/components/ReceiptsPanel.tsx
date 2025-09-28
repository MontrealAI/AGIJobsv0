'use client';

import type { ExecutionReceipt } from './receiptTypes';

type ReceiptsPanelProps = {
  receipts: ExecutionReceipt[];
};

const formatCid = (cid: string) => cid.trim();
const formatHash = (hash: string) =>
  hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;

const formatTimestamp = (timestamp: number | undefined) =>
  typeof timestamp === 'number' ? new Date(timestamp).toLocaleString() : undefined;

export function ReceiptsPanel({ receipts }: ReceiptsPanelProps) {
  if (receipts.length === 0) {
    return (
      <aside
        className="chat-receipts"
        aria-live="polite"
        aria-label="Recent receipts"
      >
        <h2 className="chat-receipts-title">Recent jobs</h2>
        <p className="chat-receipts-empty">
          Execute a plan to see job details here.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="chat-receipts"
      aria-live="polite"
      aria-label="Recent receipts"
    >
      <h2 className="chat-receipts-title">Recent jobs</h2>
      <ul className="chat-receipts-list">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="chat-receipts-item">
            {receipt.jobId !== undefined ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Job ID</span>
                <span className="chat-receipt-value">#{receipt.jobId}</span>
              </div>
            ) : null}
            {receipt.planHash ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Plan</span>
                <span className="chat-receipt-value chat-receipt-monospace">
                  {formatHash(receipt.planHash)}
                </span>
              </div>
            ) : null}
            {receipt.specCid ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Spec CID</span>
                <span className="chat-receipt-value chat-receipt-monospace">
                  {receipt.specUrl ? (
                    <a
                      href={receipt.specUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatCid(receipt.specCid)}
                    </a>
                  ) : (
                    formatCid(receipt.specCid)
                  )}
                </span>
              </div>
            ) : null}
            {receipt.deliverableCid ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Deliverable</span>
                <span className="chat-receipt-value chat-receipt-monospace">
                  {receipt.deliverableUrl ? (
                    <a
                      href={receipt.deliverableUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatCid(receipt.deliverableCid)}
                    </a>
                  ) : (
                    formatCid(receipt.deliverableCid)
                  )}
                </span>
              </div>
            ) : null}
            {receipt.reward && receipt.token ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Reward</span>
                <span className="chat-receipt-value">
                  {receipt.reward} {receipt.token}
                </span>
              </div>
            ) : null}
            {receipt.netPayout ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Net payout</span>
                <span className="chat-receipt-value">{receipt.netPayout}</span>
              </div>
            ) : null}
            {receipt.txHash ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Tx hash</span>
                <span className="chat-receipt-value chat-receipt-monospace">
                  {formatHash(receipt.txHash)}
                </span>
              </div>
            ) : null}
            {formatTimestamp(receipt.createdAt) ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Timestamp</span>
                <span className="chat-receipt-value">
                  {formatTimestamp(receipt.createdAt)}
                </span>
              </div>
            ) : null}
            {receipt.explorerUrl ? (
              <a
                className="chat-receipt-link"
                href={receipt.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                View on explorer
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
