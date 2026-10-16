import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createOmniphoenixDownloader,
  OMNIPHOENIX_DOWNLOAD_INTERVAL_MS,
  OMNIPHOENIX_DOWNLOAD_BURST_LIMIT,
} from '../../scripts/pages/omniphoenix-download-qa.mjs';

function harness(
  t,
  {
    enabled = true,
    failure = null,
    eventError = null,
    onPause = () => {},
    onClick = () => {},
  } = {}
) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'omniphoenix-download-qa-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'source.json');
  const bytes = Buffer.from('{\r\n  "exact":true\r}\r\n');
  fs.writeFileSync(file, bytes);
  const calls = [];
  const page = {
    locator(id) {
      return {
        async isEnabled() {
          calls.push(['enabled', id]);
          return enabled;
        },
        async click() {
          calls.push(['click', id]);
          onClick();
        },
      };
    },
    async waitForEvent(name) {
      calls.push(['event', name]);
      if (eventError) throw eventError;
      return {
        async failure() {
          calls.push(['failure']);
          return failure;
        },
        async path() {
          calls.push(['path']);
          return file;
        },
      };
    },
  };
  const download = createOmniphoenixDownloader(page, {
    pause: async (ms) => {
      calls.push(['pause', ms]);
      onPause(ms);
    },
  });
  return { bytes, calls, download };
}

test('QA download batches respect the Chromium limit with bounded waits and unchanged bytes', async (t) => {
  const h = harness(t);
  assert.ok(OMNIPHOENIX_DOWNLOAD_INTERVAL_MS > 1000);
  // Cover the full 29-download scenario without opening a browser or sleeping.
  for (let i = 0; i < 29; i++) {
    const id = i % 2 ? '#download-recovery' : '#download-source';
    const start = h.calls.length;
    assert.deepEqual(await h.download(id), h.bytes);
    assert.deepEqual(h.calls.slice(start), [
      ...(i % OMNIPHOENIX_DOWNLOAD_BURST_LIMIT === 0
        ? [['pause', OMNIPHOENIX_DOWNLOAD_INTERVAL_MS]]
        : []),
      ['enabled', id],
      ['event', 'download'],
      ['click', id],
      ['failure'],
      ['path'],
    ]);
  }
  assert.equal(h.calls.filter(([name]) => name === 'pause').length, 3);
});

test('disabled export fails before a click or event wait rather than hiding a UI failure', async (t) => {
  const h = harness(t, { enabled: false });
  await assert.rejects(h.download('#download-source'), (error) => {
    assert.match(error.message, /download 1 \(#download-source\)/);
    assert.match(error.cause.message, /must be enabled/);
    return true;
  });
  assert.deepEqual(h.calls, [
    ['pause', 1100],
    ['enabled', '#download-source'],
  ]);
});

test('a missing browser download propagates once with its sequence and original cause, without retry', async (t) => {
  const cause = new Error('download event timeout');
  const h = harness(t, { eventError: cause });
  await assert.rejects(h.download('#download-recovery'), (error) => {
    assert.match(error.message, /download 1 \(#download-recovery\)/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(h.calls.filter(([name]) => name === 'click').length, 1);
  assert.equal(h.calls.filter(([name]) => name === 'pause').length, 1);
});

test('failed download completion never reads a file or substitutes application bytes', async (t) => {
  const h = harness(t, { failure: 'canceled' });
  await assert.rejects(h.download('#download-source'), (error) => {
    assert.match(error.cause.message, /download must finish/);
    return true;
  });
  assert.equal(
    h.calls.some(([name]) => name === 'path'),
    false
  );
});

test('mandatory browser QA uses paced real downloads and retains newline/source/recovery assertions', () => {
  const qa = fs.readFileSync(
    new URL('../../scripts/pages/omniphoenix-qa.mjs', import.meta.url),
    'utf8'
  );
  assert.match(qa, /const download = createOmniphoenixDownloader\(page\)/);
  assert.match(qa, /for \(const separator of \['\\r\\n', '\\r'\]\)/);
  assert.match(qa, /for \(const recoveryImport of \[false, true\]\)/);
  assert.match(
    qa,
    /assert\.deepEqual\(await download\('#download-source'\), exact\)/
  );
  assert.match(
    qa,
    /desk\.importRecovery\(await download\('#download-recovery'\)\)/
  );
});

test('fake-clock Chromium burst model accepts all 29 clicks even with inherited frame counters', async (t) => {
  // Mirrors the cited LocalFrame::ShouldThrottleDownload branching, including
  // its strict > 1000 reset and counter reset only when the limit is reached.
  const chromiumLimiter = (initial) => {
    let now = 0,
      started = 0,
      count = initial;
    return {
      tick(ms) {
        now += ms;
      },
      click() {
        if (count === 0) started = now;
        else if (count >= 10) {
          if (now - started > 1000) {
            count = 1;
            started = now;
            return true;
          }
          return false;
        }
        count++;
        return true;
      },
    };
  };
  const unpaced = chromiumLimiter(0);
  for (let i = 0; i < 10; i++) assert.equal(unpaced.click(), true);
  assert.equal(
    unpaced.click(),
    false,
    'the model must reject an unpaced eleventh click'
  );
  unpaced.tick(1000);
  assert.equal(unpaced.click(), false, 'the reset boundary is strict');
  unpaced.tick(1);
  assert.equal(unpaced.click(), true);
  for (let inherited = 0; inherited <= 10; inherited++) {
    const limiter = chromiumLimiter(inherited);
    const h = harness(t, {
      onPause: (ms) => limiter.tick(ms),
      onClick: () =>
        assert.equal(
          limiter.click(),
          true,
          `inherited frame count ${inherited}`
        ),
    });
    for (let i = 0; i < 29; i++)
      assert.deepEqual(await h.download('#download-source'), h.bytes);
    assert.equal(h.calls.filter(([name]) => name === 'pause').length, 3);
  }
});
