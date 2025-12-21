#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright browser binaries are available for the Phase 8 dashboard tests.
# This script is idempotent and safe to run multiple times.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-"$ROOT_DIR/.cache/ms-playwright"}"

# Avoid repeated multi-hundred-MB downloads and system package installs when
# Chromium is already available. Playwright caches binaries under
# PLAYWRIGHT_BROWSERS_PATH; probe that location before attempting installation.
if PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH" node - <<'NODE' >/dev/null 2>&1; then
  const { chromium } = require('@playwright/test');
  const fs = require('node:fs');
  const cachePath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const executable = chromium.executablePath();
  if (executable && fs.existsSync(executable)) {
    console.log(`✅ Playwright Chromium already available at: ${executable}`);
    process.exit(0);
  }
  console.log(
    `⚙️  Playwright browsers cache missing executable at ${cachePath}; proceeding to install.`,
  );
  process.exit(1);
NODE
then
  exit 0
fi

mkdir -p "$BROWSERS_PATH"
PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH" npx playwright install --with-deps chromium
