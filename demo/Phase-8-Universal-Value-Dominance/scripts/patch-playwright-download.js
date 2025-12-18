// Patch the Playwright downloader to tolerate mirrors that do not expose a
// Content-Length header (e.g., some corporate proxies). Without this guard the
// default downloader rejects a successful download because it compares the
// streamed byte count with an expected size of zero.
const fs = require('fs');
const path = require('path');

function replaceOrNull(source, search, replacement) {
  if (!source.includes(search)) {
    return null;
  }
  return source.replace(search, replacement);
}

function patchPlaywrightDownloader() {
  let targetPath;
  try {
    const playwrightCoreRoot = path.dirname(
      require.resolve('playwright-core/package.json'),
    );
    targetPath = path.join(
      playwrightCoreRoot,
      'lib',
      'server',
      'registry',
      'oopDownloadBrowserMain.js',
    );
  } catch (error) {
    console.warn('Playwright core was not found; skipping downloader patch.', error);
    return;
  }

  const originalSource = fs.readFileSync(targetPath, 'utf8');
  if (originalSource.includes('empty payload received')) {
    console.log('Playwright downloader already patched; skipping.');
    return;
  }

  const patchers = [
    // Playwright v1.49+ downloader includes chunked transfer detection.
    (source) => {
      const headerSnippet = [
        '    chunked = response.headers["transfer-encoding"] === "chunked";',
        '    log(`-- is chunked: ${chunked}`);',
        '    totalBytes = parseInt(response.headers["content-length"] || "0", 10);',
      ].join('\n');

      const headerReplacement = [
        '    const contentLengthHeader = response.headers["content-length"];',
        '    chunked = response.headers["transfer-encoding"] === "chunked";',
        '    log(`-- is chunked: ${chunked}`);',
        '    totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;',
      ].join('\n');

      const finishSnippet = [
        '    const file = import_fs.default.createWriteStream(options.zipPath);',
        '    file.on("finish", () => {',
        '      if (!chunked && downloadedBytes !== totalBytes) {',
        '        log(`-- download failed, size mismatch: ${downloadedBytes} != ${totalBytes}`);',
        '        promise.reject(new Error(`Download failed: size mismatch, file size: ${downloadedBytes}, expected size: ${totalBytes} URL: ${options.url}`));',
        '      } else {',
        '        log(`-- download complete, size: ${downloadedBytes}`);',
        '        promise.resolve();',
        '      }',
        '    });',
      ].join('\n');

      const finishReplacement = [
        '    const file = import_fs.default.createWriteStream(options.zipPath);',
        '    file.on("finish", () => {',
        '      if (!chunked && totalBytes && downloadedBytes !== totalBytes) {',
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

      const headerPatched = replaceOrNull(source, headerSnippet, headerReplacement);
      if (!headerPatched) {
        return null;
      }
      const finishPatched = replaceOrNull(
        headerPatched,
        finishSnippet,
        finishReplacement,
      );
      return finishPatched;
    },
    // Legacy downloader layout without chunked handling.
    (source) => {
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

      return replaceOrNull(source, legacySnippet, patchedSnippet);
    },
  ];

  for (const patch of patchers) {
    const updated = patch(originalSource);
    if (updated && updated !== originalSource) {
      fs.writeFileSync(targetPath, updated);
      console.log(
        `Patched Playwright downloader at ${path.relative(process.cwd(), targetPath)}.`,
      );
      return;
    }
  }

  throw new Error('Playwright downloader patch could not be applied; pattern not found.');
}

patchPlaywrightDownloader();
