// Patch the Playwright downloader to tolerate mirrors that do not expose a
// Content-Length header (e.g., some corporate proxies). Without this guard the
// default downloader rejects a successful download because it compares the
// streamed byte count with an expected size of zero.
const fs = require('fs');
const path = require('path');

function patchPlaywrightDownloader() {
  let targetPath;
  try {
    const playwrightCoreRoot = path.dirname(require.resolve('playwright-core/package.json'));
    targetPath = path.join(playwrightCoreRoot, 'lib', 'server', 'registry', 'oopDownloadBrowserMain.js');
  } catch (error) {
    console.warn('Playwright core was not found; skipping downloader patch.', error);
    return;
  }

  const originalSource = fs.readFileSync(targetPath, 'utf8');
  if (originalSource.includes('empty payload received')) {
    console.log('Playwright downloader already patched; skipping.');
    return;
  }

  const legacySnippet = [
    '    totalBytes = parseInt(response.headers["content-length"] || "0", 10);',
    '    log(`-- total bytes: ${totalBytes}`);',
    '    const file = import_fs.default.createWriteStream(options.zipPath);',
    '    file.on("finish", () => {',
    '      if (downloadedBytes !== totalBytes) {',
    '        log(`-- download failed, size mismatch: ${downloadedBytes} != ${totalBytes}`);',
    '        promise.reject(new Error(`Download failed: size mismatch, file size: ${downloadedBytes}, expected size: ${totalBytes} URL: ${options.url}`));',
    '      } else {',
    '        log(`-- download complete, size: ${downloadedBytes}`);',
    '        promise.resolve();',
    '      }',
    '    });',
  ].join('\n');

  const patchedSnippet = [
    '    const contentLengthHeader = response.headers["content-length"];',
    '    totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;',
    '    log(`-- total bytes: ${totalBytes}`);',
    '    const file = import_fs.default.createWriteStream(options.zipPath);',
    '    file.on("finish", () => {',
    '      if (totalBytes && downloadedBytes !== totalBytes) {',
    '        log(`-- download failed, size mismatch: ${downloadedBytes} != ${totalBytes}`);',
    '        promise.reject(new Error(`Download failed: size mismatch, file size: ${downloadedBytes}, expected size: ${totalBytes} URL: ${options.url}`));',
    '        return;',
    '      }',
    '      if (!downloadedBytes) {',
    '        log(`-- download failed, empty payload received`);',
    '        promise.reject(new Error(`Download failed: empty download from ${options.url}`));',
    '        return;',
    '      }',
    '      log(`-- download complete, size: ${downloadedBytes}`);',
    '      promise.resolve();',
    '    });',
  ].join('\n');

  const updatedSource = originalSource.replace(legacySnippet, patchedSnippet);

  if (originalSource === updatedSource) {
    throw new Error('Playwright downloader patch could not be applied; pattern not found.');
  }

  fs.writeFileSync(targetPath, updatedSource);
  console.log(`Patched Playwright downloader at ${path.relative(process.cwd(), targetPath)}.`);
}

patchPlaywrightDownloader();
