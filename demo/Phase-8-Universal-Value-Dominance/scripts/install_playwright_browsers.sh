#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright browser binaries are available for the Phase 8 dashboard tests.
# This script is idempotent and safe to run multiple times.

npx playwright install --with-deps chromium
