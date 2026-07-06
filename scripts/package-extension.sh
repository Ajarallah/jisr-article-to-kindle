#!/usr/bin/env bash
# Package the extension into a Chrome Web Store-ready zip.
# The zip has manifest.json at its ROOT (what the store expects).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/extension"
DIST="$ROOT/dist"

VERSION="$(node -p "require('$EXT/manifest.json').version")"
OUT="$DIST/article-to-kindle-extension-v$VERSION.zip"

mkdir -p "$DIST"
rm -f "$OUT"

cd "$EXT"
zip -r -q "$OUT" . \
  -x '*.DS_Store' \
  -x '__MACOSX/*'

echo "Packaged: $OUT"
unzip -l "$OUT" | tail -n +2 | head -n 40
