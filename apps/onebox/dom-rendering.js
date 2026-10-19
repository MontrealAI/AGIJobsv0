// Only application code constructs elements. Server, user and persisted values
// are always appended as text, including strings that look like markup.
export function element(tag, text = '', className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(text ?? '');
  return node;
}

export function fragment(...children) {
  const node = document.createDocumentFragment();
  node.append(...children);
  return node;
}

export function httpsLink(value, label) {
  if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    const link = element('a', label);
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch {
    return null;
  }
}

function confirmation(kind, label) {
  const row = element('div', '', 'pill-row pill-row-confirm');
  for (const [suffix, text, className] of [
    ['approve', label, 'primary-btn'], ['cancel', 'NO', 'ghost-btn'],
  ]) {
    const button = element('button', text, className);
    button.type = 'button';
    button.id = `${kind}-${suffix}`;
    row.append(button);
  }
  return row;
}

function latencyRow(label, latency) {
  const row = element('div', '', 'meta-row');
  if (latency) row.append(element('span', `${label} ${latency}`, 'meta-chip'));
  return row;
}

export function planPreview(summary, latency) {
  return fragment(latencyRow('Plan ready in', latency), String(summary ?? ''), confirmation('plan', 'YES — simulate'));
}

export function missingFields(fields) {
  return fragment('I still need a few details before we can simulate: ', element('strong', fields.join(', ')), '.');
}

export function simulationPreview(sim, latency) {
  const content = fragment(latencyRow('Checks ready in', latency), 'Est. budget ',
    element('strong', sim.estimatedBudget ? `${sim.estimatedBudget} AGIALPHA` : '—'), '.');
  const fees = [];
  for (const [label, amount, pct] of [['protocol fee', sim.feeAmount, sim.feePct], ['burn', sim.burnAmount, sim.burnPct]]) {
    if (amount) fees.push(`${label} ${amount} AGIALPHA${pct != null ? ` (${pct}%)` : ''}`);
    else if (pct != null) fees.push(`${label} ${pct}%`);
  }
  if (fees.length) content.append(` Fee projections: ${fees.join('; ')}.`);
  const badges = element('div', '', 'risk-badges');
  if (Array.isArray(sim.risks) && sim.risks.length) {
    for (const risk of sim.risks) badges.append(element('span', risk, 'risk-badge'));
  } else badges.append(element('span', 'No blockers detected', 'risk-badge ok'));
  content.append(badges, confirmation('sim', 'YES — execute'));
  return content;
}

export function receiptMessage(receipt) {
  const content = fragment('🧾 ', element('strong', 'Receipt ready.'), element('br'), 'Plan: ',
    element('code', receipt.planHash ?? receipt.planId ?? '—'));
  if (receipt.jobId) content.append(element('br'), `Job: #${receipt.jobId}`);
  if (receipt.cid) content.append(element('br'), 'CID: ', element('code', receipt.cid));
  const link = httpsLink(receipt.url, 'Verify on chain');
  if (link) content.append(element('br'), link);
  else if (receipt.tx) content.append(element('br'), `Tx: ${receipt.tx}`);
  return content;
}

export function truncate(value) {
  const text = String(value ?? '');
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

export function receiptCard(receipt) {
  const item = element('li', '', 'receipt-card');
  const meta = element('div', '', 'receipt-meta');
  meta.append(element('span', new Date(receipt.timestamp).toLocaleString()),
    element('span', `Reward: ${receipt.reward ?? '—'} ${receipt.token ?? 'AGIALPHA'}`));
  const tx = element('div', 'Tx: ');
  tx.append(httpsLink(receipt.url, truncate(receipt.tx || 'View')) ?? truncate(receipt.tx || '—'));
  item.append(element('strong', `Job #${receipt.jobId ?? '?'} · ${receipt.status ?? 'posted'}`), meta, tx);
  if (receipt.cid) {
    const cid = element('div', 'CID: ');
    cid.append(element('code', receipt.cid));
    item.append(cid);
  }
  return item;
}

export function runSteps(status) {
  const list = element('ul', '', 'step-status');
  if (!Array.isArray(status?.steps)) return list;
  const states = new Set(['pending', 'running', 'succeeded', 'failed', 'skipped']);
  for (const step of status.steps) {
    list.append(element('li', `[${step.kind}] ${step.name}`, `state-${states.has(step.state) ? step.state : 'pending'}`));
  }
  return list;
}

export function errorMessage(message) {
  return element('span', `⚠️ ${message}`, 'error-text');
}
