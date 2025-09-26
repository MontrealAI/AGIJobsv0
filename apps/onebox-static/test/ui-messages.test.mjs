import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPinnedSummaryMessage } from '../app.mjs';

test('formatPinnedSummaryMessage lists all pinned CIDs in summary', () => {
  const summary = formatPinnedSummaryMessage([
    { label: 'Attachment (scope.pdf)', cid: 'bafy-att-0001' },
    { label: 'Attachment (examples.csv)', cid: 'bafy-att-0002' },
    { label: 'Job JSON', cid: 'bafy-payload-0003' },
  ]);

  assert.match(summary, /Pinned 3 items?/);
  assert.match(summary, /scope\.pdf/);
  assert.match(summary, /bafy-att-0001/);
  assert.match(summary, /bafy-payload-0003/);
  const bulletCount = summary.split('\n').filter((line) => line.trim().startsWith('•')).length;
  assert.equal(bulletCount, 3);
});
