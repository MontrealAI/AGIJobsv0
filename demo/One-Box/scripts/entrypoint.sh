#!/bin/sh
set -eu

# Runtime configuration is read by the server, never written with bearer tokens
# into public JavaScript. PORT is parsed by Node rather than a JSON CMD shell.
exec "$@"
