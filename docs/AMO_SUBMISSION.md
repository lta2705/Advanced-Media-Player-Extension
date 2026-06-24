# AMO Submission Guide — Advanced Media Player

## 1. Pre-Submission Checklist

- [ ] `cargo build --target wasm32-unknown-unknown --release` succeeds
- [ ] `wasm-bindgen` has generated output in `extension/pkg/`
- [ ] All tests pass: `cargo test`
- [ ] Icons present at `extension/icons/icon.svg`
- [ ] `manifest.json` is valid (validate via about:debugging)
- [ ] Extension loads and functions correctly in a clean Firefox profile

## 2. WASM Code Review Requirements

Mozilla's AMO review team requires source code for any compiled binaries:

### Required Uploads
1. **Source code**: The entire `src/` directory (Rust source)
2. **Build instructions**: Reference `build.sh` in the submission notes
3. **Reproducible build info**: Rust compiler version (`rustc --version`), wasm-bindgen version, target triple (`wasm32-unknown-unknown`)

### Submission Notes Template
```
This extension uses a Rust WebAssembly module for audio DSP processing.

Source code: https://github.com/your-repo/advanced-media-player
Build toolchain:
- Rust: <version>
- Target: wasm32-unknown-unknown
- wasm-bindgen: <version>
- wasm-opt (Binaryen): <version>

Build steps:
1. Run ./build.sh
2. Output is placed in extension/pkg/
3. Package with: web-ext build -s extension/

The WASM module provides:
- apply_gain() — volume boost with soft clipping
- Equalizer — multi-band parametric EQ via biquad filters
- apply_compressor() — dynamics compressor/limiter
- time_stretch() — WSOLA-based time stretching
- compute_spectrum() — FFT for visualization
```

## 3. Packaging

```bash
# Ensure WASM build is done
./build.sh

# Package using web-ext
web-ext build -s extension/ --overwrite-dest
# Output: web-ext-artifacts/advanced_media_player-1.0.0.zip
```

Or manually:
```bash
cd extension
zip -r ../advanced_media_player-1.0.0.zip . -x "*.git*" -x "*.DS_Store"
```

## 4. Common AMO Rejection Reasons & Mitigations

| Rejection Reason | Mitigation |
|---|---|
| **WASM binary without source** | Include `src/` dir and build script in submission notes |
| **`eval()` or unsafe CSP** | CSP in manifest already uses `'wasm-unsafe-eval'` only; no `eval()` in JS code |
| **Remote code** | All code is local; no external CDN scripts |
| **Excessive permissions** | Uses `tabs`, `scripting`, `storage` — minimal set |
| **Host permissions `<all_urls>`** | Required for script injection on any page with media |

## 5. Post-Submission

1. Upload the `.zip` to [addons.mozilla.org](https://addons.mozilla.org/)
2. Select "Source Code Submission" and upload the Rust source
3. Expect review within 1-2 weeks (signed add-ons) or longer for fully reviewed
4. For updates: bump version in `manifest.json`, rebuild WASM, re-zip, upload
