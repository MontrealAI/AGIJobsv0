import { computerReceiptCopy } from '../../website/assets/computer-receipt-copy.mjs';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
export function renderComputerReceipt(language = 'en', base = './') {
  const t = computerReceiptCopy[language];
  const file = (id, label) =>
    `<div class="cm-field"><label for="cr-${id}">${esc(
      label
    )}</label><input id="cr-${id}" type="file" accept="application/json,.json"></div>`;
  const button = (id, label) =>
    `<button type="button" id="cr-${id}" class="cm-button cm-secondary" disabled>${esc(
      label
    )}</button>`;
  const confirm = (id, label) =>
    `<label class="cr-confirm"><input id="cr-${id}" type="checkbox"> ${esc(
      label
    )}</label>`;
  return `<section class="cm-section cr-section" id="computer-project" data-computer-receipt aria-labelledby="cr-title"><h2 id="cr-title">${esc(
    t.title
  )}</h2><p>${esc(t.intro)}</p><p class="cm-help">${esc(t.limits)}</p>${confirm(
    'public',
    t.public
  )}<div class="cm-card"><h3>${esc(
    t.forward
  )}</h3><div class="cm-input-grid">${file('project', t.project)}${file(
    'report',
    t.report
  )}</div><div class="cm-actions">${button(
    'read',
    t.read
  )}</div><pre id="cr-forward-summary" tabindex="0" class="cr-summary"></pre>${confirm(
    'approve-handoff',
    t.approveHandoff
  )}<div class="cm-actions">${button('prepare', t.prepare)}${button(
    'handoff-download',
    t.handoff
  )}${button(
    'report-download',
    t.reportDownload
  )}</div></div><div class="cm-card"><h3>${esc(
    t.back
  )}</h3><div class="cm-input-grid">${file(
    'native-handoff',
    t.nativeHandoff
  )}${file('native-return', t.returned)}${file(
    'native-report',
    t.returnedReport
  )}${file(
    'native-history',
    t.nativeHistory
  )}<div class="cm-field"><label for="cr-amount">${esc(
    t.amount
  )}</label><input id="cr-amount" type="text" inputmode="decimal" maxlength="31" autocomplete="off" placeholder="7.0"></div><div class="cm-field"><label for="cr-network">${esc(
    t.network
  )}</label><select id="cr-network"><option value="">${esc(
    t.choose
  )}</option><option value="1">${esc(
    t.networkName
  )}</option></select></div></div><p class="cm-help">${esc(
    t.token
  )}: <code id="cr-token"></code></p>${confirm(
    'approve-draft',
    t.approveDraft
  )}<div class="cm-actions">${button('create', t.create)}${button(
    'draft-download',
    t.draft
  )}${button('archive-download', t.archive)}${button(
    'history-download',
    t.history
  )}</div><pre id="cr-summary" tabindex="0" class="cr-summary"></pre><details class="cm-detail"><summary>${esc(
    t.details
  )}</summary><pre tabindex="0"><code id="cr-details">{}</code></pre></details>${file(
    'reopen',
    t.reopen
  )}</div><p id="cr-status" class="cm-status" role="status" tabindex="-1">${esc(
    t.ready
  )}</p><p class="cm-help">Alpha native inspector · Apache-2.0 · <a href="${esc(
    base
  )}assets/alpha-computer-LICENSE.txt">License</a> · <a href="${esc(
    base
  )}assets/alpha-computer-source.json">Source inventory</a></p></section>`;
}
