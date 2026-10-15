import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as pauseFor } from 'node:timers/promises';

// QA exercises 29 actual downloads in one frame. Chromium's renderer drops
// burst downloads before emitting the browser download IPC: limit 10, reset
// after strictly more than one second. Pace batches of at most ten clicks, with
// an initial quiet window because the shared frame may have earlier downloads.
// The 29-download verifier adds exactly three waits (3.3 seconds), not retries.
// Do not bypass browser protections, retry missing downloads, or replace the
// downloaded-byte assertions with direct access to application state.
// Source: LocalFrame::ShouldThrottleDownload and LocalFrame::DownloadURL:
// https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/frame/local_frame.cc
export const OMNIPHOENIX_DOWNLOAD_INTERVAL_MS = 1100;
export const OMNIPHOENIX_DOWNLOAD_BURST_LIMIT = 10;
export function createOmniphoenixDownloader(page, { pause = pauseFor } = {}) {
  let sequence = 0;
  return async (id) => {
    const attempt = ++sequence;
    try {
      if ((attempt - 1) % OMNIPHOENIX_DOWNLOAD_BURST_LIMIT === 0)
        await pause(OMNIPHOENIX_DOWNLOAD_INTERVAL_MS);
      assert.equal(
        await page.locator(id).isEnabled(),
        true,
        `${id} must be enabled`
      );
      const [item] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(id).click(),
      ]);
      assert.equal(await item.failure(), null, `${id} download must finish`);
      return fs.readFileSync(await item.path());
    } catch (cause) {
      throw new Error(
        `Omniphoenix download ${attempt} (${id}) failed after pacing`,
        { cause }
      );
    }
  };
}
