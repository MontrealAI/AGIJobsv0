'use client';

import type { ExecutionReceipt } from './receiptTypes';

type ReceiptsPanelProps = {
  receipts: ExecutionReceipt[];
};

const formatCid = (cid: string) => cid.trim();

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
            {receipt.specCid ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">CID</span>
                <span className="chat-receipt-value chat-receipt-monospace">
                  {formatCid(receipt.specCid)}
                </span>
              </div>
            ) : null}
            {receipt.netPayout ? (
              <div className="chat-receipt-field">
                <span className="chat-receipt-label">Net payout</span>
                <span className="chat-receipt-value">{receipt.netPayout}</span>
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
