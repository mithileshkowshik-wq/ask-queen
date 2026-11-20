#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
version=$(node -p 'require("./manifest.json").version')
mkdir -p dist

set -- manifest.json background.js options.html options.js LICENSE \
  content/chess.js content/common.js content/lichess.js content/chesscom.js content/panel.js \
  icons/16.png icons/32.png icons/48.png icons/128.png
if [ -d _locales ]; then
  set -- "$@" _locales/*/messages.json
fi

temp=$(mktemp -d dist/.package.XXXXXX)
trap 'rm -rf "$temp"' EXIT
for file do
  if [ ! -f "$file" ]; then
    printf 'Missing package file: %s\n' "$file" >&2
    exit 1
  fi
done
archive="dist/ask-queen-$version.zip"
zip -q -X "$temp/extension.zip" "$@"
mv "$temp/extension.zip" "$archive"
printf '%s\n' "$archive"
