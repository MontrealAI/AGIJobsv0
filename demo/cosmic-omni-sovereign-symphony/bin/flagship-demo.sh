#!/usr/bin/env bash
set -euo pipefail
COSMIC_BIN="${BASH_SOURCE[0]%/*}"
[[ "$COSMIC_BIN" != "${BASH_SOURCE[0]}" ]] || COSMIC_BIN=.
# shellcheck source=modes.sh
source "$COSMIC_BIN/modes.sh"
cosmic_parse "$@"
cosmic_launch flagship-demo
