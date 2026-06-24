#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_DIR="$PROJECT_ROOT/extension"
PKG_DIR="$EXTENSION_DIR/pkg"

echo "==> Building Rust WASM module (release)..."
cargo build --target wasm32-unknown-unknown --release

echo "==> Generating JS glue with wasm-bindgen..."
mkdir -p "$PKG_DIR"
wasm-bindgen \
  "target/wasm32-unknown-unknown/release/advanced_media_player.wasm" \
  --out-dir "$PKG_DIR" \
  --target web

echo "==> Optimizing WASM binary with wasm-opt..."
if command -v wasm-opt &> /dev/null; then
  wasm-opt -Oz "$PKG_DIR/advanced_media_player_bg.wasm" \
    -o "$PKG_DIR/advanced_media_player_bg.wasm"
  echo "    wasm-opt complete"
else
  echo "    wasm-opt not found — skipping optimization (install binaryen)"
fi

echo "==> Build complete!"
echo "    WASM module: $PKG_DIR/"
echo "    Extension:    $EXTENSION_DIR/"
echo ""
echo "    To package for Firefox:  web-ext build -s extension/"
echo "    Or load unpacked in about:debugging"
