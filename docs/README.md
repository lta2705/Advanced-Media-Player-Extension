# Advanced Media Player — WASM Firefox Extension

## Table of Contents

- [1. High-Level Architecture](#1-high-level-architecture)
- [2. Build & Deployment Workflow](#2-build--deployment-workflow)
- [3. Component Deep Dive](#3-component-deep-dive)
  - [3.1 Rust Source (`src/`)](#31-rust-source-src)
  - [3.2 `wasm-bindgen` & the JS Glue Layer](#32-wasm-bindgen--the-js-glue-layer)
  - [3.3 `.wasm` Binary](#33-wasm-binary)
  - [3.4 Firefox Extension Shell (`extension/`)](#34-firefox-extension-shell-extension)
  - [3.5 Build System & Toolchain](#35-build-system--toolchain)
- [4. Data Flow at Runtime](#4-data-flow-at-runtime)
- [5. Key Technical Concepts](#5-key-technical-concepts)
  - [5.1 Linear Memory & FFI](#51-linear-memory--ffi)
  - [5.2 DOM Access via `web-sys`](#52-dom-access-via-web-sys)
  - [5.3 Async in Wasm](#53-async-in-wasm)
  - [5.4 Code Size & Streaming Compilation](#54-code-size--streaming-compilation)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Firefox Browser                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              Extension Process                  │  │
│  │  ┌──────────┐   ┌───────────────┐             │  │
│  │  │popup.html│──▶│  popup.js     │             │  │
│  │  │ (UI)     │   │ (UI logic)    │             │  │
│  │  └──────────┘   └───────┬───────┘             │  │
│  │                         │                     │  │
│  │  ┌──────────────────────▼──────────────────┐  │  │
│  │  │         wasm-bindgen JS glue             │  │  │
│  │  │  (my_wasm_module.js)                     │  │  │
│  │  │  - Memory management                     │  │  │
│  │  │  - Type marshalling                      │  │  │
│  │  │  - Function binding                      │  │  │
│  │  └──────────────────────┬──────────────────┘  │  │
│  │                         │                     │  │
│  │  ┌──────────────────────▼──────────────────┐  │  │
│  │  │         WebAssembly.Instance             │  │  │
│  │  │  (my_wasm_module_bg.wasm)               │  │  │
│  │  │  - Audio decode / process                │  │  │
│  │  │  - Filter pipeline DSP                   │  │  │
│  │  │  - Metadata parsing                      │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │                         │                     │  │
│  │  ┌──────────────────────▼──────────────────┐  │  │
│  │  │       background.js (Service Worker)     │  │  │
│  │  │  - Tab management                        │  │  │
│  │  │  - Message routing                       │  │  │
│  │  │  - Long-lived audio context              │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                          │          │
│  ┌───────────────────────────────────────▼────────┐ │
│  │            Native Browser APIs                  │ │
│  │  Media Source Extensions (MSE)                  │ │
│  │  Web Audio API                                  │ │
│  │  WebCodecs API                                  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

The project is divided into two distinct layers:

1. **The WASM module** (Rust → `.wasm`) — contains all computation-heavy logic: audio decoding, filtering, metadata extraction.
2. **The Firefox extension shell** (JavaScript/HTML) — handles browser integration, UI rendering, and acts as a bridge between the WASM module and browser APIs.

---

## 2. Build & Deployment Workflow

```
┌──────────┐   cargo build --target wasm32-unknown-unknown   ┌──────────────┐
│ Rust     │ ──────────────────────────────────────────────▶ │ .wasm binary │
│ src/     │                                                 │ (Linear mem) │
│ lib.rs   │ ◀────────────────────────────────────────────── │              │
│          │   wasm-bindgen (JS binding generation)          │   JS glue    │
└──────────┘                                                 └──────┬───────┘
                                                                     │
                            ┌────────────────────────────────────────┘
                            ▼
              ┌──────────────────────────┐
              │    extension/pkg/        │
              │  ├── my_module.js        │
              │  ├── my_module_bg.wasm   │
              │  └── my_module.d.ts      │
              └──────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │  web-ext build / zip     │
              │  → .xpi extension        │
              └──────────────────────────┘
```

### Step-by-step

| Step | Command | What happens |
|------|---------|-------------|
| 1 | `cargo build --target wasm32-unknown-unknown --release` | Rust compiler emits a `.wasm` binary using the LLVM backend targetting the WASM instruction set |
| 2 | `wasm-bindgen target/.../advanced_media_player.wasm --out-dir extension/pkg` | Post-processing tool that generates JavaScript glue code, handles memory management, and re-exports typed functions |
| 3 | `wasm-opt -Oz extension/pkg/*.wasm -o extension/pkg/opt.wasm` | Binaryen optimizer shrinks the WASM binary (optional, recommended for production) |
| 4 | `web-ext build` / `zip -r extension.zip extension/` | Packages the extension for Firefox |

---

## 3. Component Deep Dive

### 3.1 Rust Source (`src/`)

**`Cargo.toml`**

```toml
[package]
name = "advanced-media-player"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = ["console", "AudioContext", "MediaSource", ...] }
```

- `crate-type = ["cdylib"]` — instructs Rust to build a dynamic library, which for the `wasm32-unknown-unknown` target produces a `.wasm` binary. Without this, cargo would produce a `.rlib` (Rust library) unusable in the browser.
- `wasm-bindgen` — the core bridge. It provides `#[wasm_bindgen]` procedural macros that expose Rust functions to JavaScript and import JS functions into Rust with correct type marshalling.
- `web-sys` — generated bindings for every Web API. Each feature flag (e.g., `"AudioContext"`) corresponds to a raw JS API surface. Activating only needed features keeps compile times and binary sizes down.

**`src/lib.rs` pattern**

```rust
use wasm_bindgen::prelude::*;

// Exported to JS: can be called directly from popup.js / background.js
#[wasm_bindgen]
pub fn decode_audio(data: &[u8]) -> Vec<f32> {
    // ...
}

// Imported from JS: calls back into browser API
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}
```

- `#[wasm_bindgen]` on a `pub fn` generates both a Rust shim and a corresponding JS export in the glue code. The function becomes callable as `wasm.decode_audio(...)` from JavaScript.
- `#[wasm_bindgen] extern "C"` blocks declare JS functions that Rust can call. These are resolved at runtime through the JS glue's import object.
- Types crossing the boundary must implement `wasm_bindgen::convert::FromWasmAbi` / `IntoWasmAbi`. Primitive types (`i32`, `f64`, `bool`) pass directly; strings, slices, and `Vec<T>` are copied through linear memory.

### 3.2 `wasm-bindgen` & the JS Glue Layer

`wasm-bindgen` is the most critical piece of the toolchain. After compilation, it rewrites the WASM binary and generates a companion JS file. The JS glue layer serves several functions:

**Memory management**

WASM has a single linear memory (`WebAssembly.Memory`). The glue layer owns this memory and exposes allocator functions (`__wbindgen_malloc`, `__wbindgen_free`) that Rust's allocator (usually `wee_alloc` or the default dlmalloc) calls into.

When JavaScript passes a string or an `ArrayBuffer` to a WASM function:
1. The glue copies the data into WASM's linear memory via `TextEncoder` or `Uint8Array` setter.
2. A pointer (i32) and length (i32) are passed to the Rust function.
3. Rust reads the data from memory through the pointer.
4. After the call, the glue frees the temporary allocation.

Conversely, when Rust returns a `String` or `Vec<u8>`:
1. Rust allocates the data in linear memory and returns a pointer + length.
2. The glue reads the data out into a JS typed array or string.
3. The glue calls `__wbindgen_free` to release Rust's allocation.

**Type marshalling**

| Rust type | JS type | Mechanism |
|-----------|---------|-----------|
| `i32`/`u32`/`f64` | `number` | Passed directly in WASM stack |
| `bool` | `boolean` | Converted to/from 0/1 |
| `String` | `string` | Copied through linear memory via UTF-8 encoding |
| `&[u8]` / `Vec<u8>` | `Uint8Array` | Copied through linear memory |
| `JsValue` | `any` | Passed as a reference via a table (see below) |
| `Closure<dyn Fn()>` | `Function` | Stored in a reference table, passed as integer handle |

**Reference counting & the table**

JS objects (e.g., an `AudioContext` obtained from `web-sys`) cannot live in WASM linear memory. Instead, `wasm-bindgen` maintains a side table (a JS array) of live references. When Rust holds a `JsValue`, it stores an integer index into this table. When the Rust value is dropped, the glue removes the reference from the table. This prevents the JS object from being garbage-collected while Rust holds a handle.

### 3.3 `.wasm` Binary

The `.wasm` file is a binary-encoded sequence of sections:

| Section | Purpose |
|---------|---------|
| Type | Function signatures (param/return types) |
| Import | Declarations of functions/memories imported from JS |
| Function | Index of function bodies in the code section |
| Memory | Initial memory size (in 64KiB pages) |
| Export | Functions, memories, tables exposed to JS |
| Code | WASM bytecode instructions for each function |
| Custom (`name`) | Debug symbol names |
| Custom (`producers`) | Toolchain metadata (Rust version, LLVM version) |
| Custom (`wasm-bindgen`) | Version info used by the glue |

**Execution model**

- WASM is a stack-based virtual machine. Instructions pop values from and push values onto an operand stack.
- There is no garbage collector. Memory management is manual (Rust's ownership model handles this at compile time; at runtime it maps to simple alloc/free).
- WASM has no direct access to the DOM. All DOM interaction must go through JS imports (the `web-sys` externs).

**Streaming compilation**

Firefox supports `WebAssembly.instantiateStreaming()` which compiles the WASM module as the bytes arrive over the network, overlapping download with compilation. This significantly reduces startup time.

```js
const { instance } = await WebAssembly.instantiateStreaming(
  fetch(chrome.runtime.getURL("pkg/module_bg.wasm")),
  imports
);
```

### 3.4 Firefox Extension Shell (`extension/`)

**`manifest.json` (Manifest V3)**

```json
{
  "manifest_version": 3,
  "name": "Advanced Media Player",
  "version": "1.0",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Media Player"
  },
  "web_accessible_resources": [{
    "resources": ["pkg/*"],
    "matches": ["<all_urls>"]
  }]
}
```

Key points:
- `"type": "module"` in background allows ES module imports, needed to `import` the WASM glue.
- `web_accessible_resources` must expose `pkg/*` so that URLs inside the extension can load the `.wasm` and `.js` files.
- `content_security_policy` may need adjustment: `"script-src 'self' 'wasm-unsafe-eval';"` — Firefox requires `'wasm-unsafe-eval'` in CSP for WASM instantiation.

**`background.js` — Service Worker**

```js
let audioCtx = null;
let wasmModule = null;

async function initWasm() {
  const wasm = await import(chrome.runtime.getURL("pkg/module.js"));
  await wasm.default(); // asynchronously initializes memory & instantiates
  wasmModule = wasm;
}

// Message handler: forwards decode requests to WASM
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "DECODE") {
    const decoded = wasmModule.decode_audio(new Uint8Array(msg.data));
    sendResponse({ frames: decoded });
  }
});
```

The service worker:
- Instantiates the WASM module once at startup.
- Maintains long-lived state (e.g., an `AudioContext` or decoded frame cache).
- Routes messages between the popup/content scripts and the WASM module.

**`popup.html` + `popup.js` — UI Layer**

```js
import init, { get_metadata, get_visualizer_data } from "./pkg/module.js";

async function main() {
  await init(); // instantiate wasm
  // ...
}
```

- The popup is a transient document (it loads when the user clicks the toolbar icon and unloads when focus is lost). For persistent playback, the service worker must own the `AudioContext`.
- The popup imports the WASM init function as an ES module (the glue code is generated as a module by `wasm-bindgen`).

### 3.5 Build System & Toolchain

**LLVM → WASM backend**

The Rust compiler (`rustc`) uses the LLVM backend with target `wasm32-unknown-unknown`. LLVM emits WASM bytecode directly (not JavaScript or asm.js). This produces pure `.wasm` files with no runtime dependency on a JavaScript engine for execution.

**`wasm-bindgen` (the CLI tool)**

Usage:
```
cargo install wasm-bindgen-cli
wasm-bindgen target/wasm32-unknown-unknown/release/module.wasm --out-dir extension/pkg
```

What it does:
1. Reads the `.wasm` and its custom `wasm-bindgen` sections that contain metadata about the Rust-level API.
2. Rewrites the `.wasm` to remove internal ABI details and replace them with a stable ABI interface.
3. Generates `module.js` — the JavaScript glue with typed wrappers for every exported function.
4. Generates `module.d.ts` — TypeScript declarations (useful for editor autocompletion).
5. Generates `module_bg.wasm` — the final optimized `.wasm`.

**`wasm-opt` (Binaryen)**

Binaryen is a compiler toolchain for WebAssembly. `wasm-opt` applies peephole optimizations, dead code elimination, and instruction simplification that LLVM cannot perform because LLVM optimizes for general architectures, not WASM specifically.

Typical savings: 15–30% size reduction.

---

## 4. Data Flow at Runtime

```
User clicks play on popup
        │
        ▼
popup.js sends DECODE message
        │
        ▼
background.js receives message
        │
        ▼
background.js reads audio file via fetch() or browser.tabs API
        │
        ▼
ArrayBuffer is transferred (or copied) into WASM linear memory
  via the glue layer: __wbindgen_malloc → memcpy
        │
        ▼
Rust decode_audio(buffer) executes in WASM:
  1. Parse container (MP4, WebM, etc.)
  2. Demux audio track
  3. Decode codec (Opus, AAC, FLAC via Rust crates)
  4. Return Vec<f32> PCM samples
        │
        ▼
PCM data is copied from WASM memory → JS Float32Array
        │
        ▼
background.js creates AudioBuffer via Web Audio API
  (audioCtx.createBuffer → buffer.copyToChannel)
        │
        ▼
AudioBufferSourceNode → audioCtx.destination
        │
        ▼
Sound reaches the user's speakers
```

## 5. Key Technical Concepts

### 5.1 Linear Memory & FFI

WASM's memory is a contiguous `ArrayBuffer` accessible from both JS and WASM. Rust's ownership model maps naturally:

- Rust `Vec<u8>` → WASM memory array → JS can read via `Uint8Array(wasm.memory.buffer, ptr, len)`
- JS `Uint8Array` → copy into WASM memory → Rust `&[u8]` temporarily borrows it

The key cost is **copying**. Passing a 10 MB audio file across the boundary requires a full `memcpy` into WASM memory (and another `memcpy` for the decoded PCM data back). For real-time processing, zero-copy can sometimes be achieved by having Rust directly write into a shared `AudioBuffer` via `web-sys` bindings.

### 5.2 DOM Access via `web-sys`

`web-sys` is a crate generated by `wasm-bindgen` that provides raw bindings to every Web API. Each function is an `extern` block wrapped in safe Rust abstractions:

```rust
use web_sys::AudioContext;

let ctx = AudioContext::new().unwrap();
// Internally calls:  JS: new AudioContext()
//                    Returned JsValue is tracked in the reference table
```

There is no async Rust involved in the WASM-side DOM calls themselves — they call the underlying synchronous JS functions. However, many Web APIs are promise-based (e.g., `AudioContext.decodeAudioData`). To handle these, you need one of the approaches in §5.3.

### 5.3 Async in Wasm

WASM does not natively support async/await. `wasm-bindgen` provides `wasm_bindgen_futures` to bridge the gap:

```rust
use wasm_bindgen_futures::JsFuture;

let promise = ctx.decode_audio_data(&buffer); // returns a Promise
let audio_buffer = JsFuture::from(promise).await.unwrap();
```

Under the hood:
1. The Rust future is represented as a JS Promise.
2. The glue layer uses `queueMicrotask` / `Promise.then` to poll the Rust future.
3. When the JS promise resolves, it calls back into WASM to wake the Rust future.
4. This requires Rust's WASM target to support multithreading (via `wasm-bindgen`'s `--weak-refs` or with a polyfill).

For Firefox extensions, keep async usage minimal inside WASM — prefer doing the async work (I/O, fetching) in the JS layer and passing the resulting data to WASM synchronously.

### 5.4 Code Size & Streaming Compilation

**Why size matters**

Firefox extensions are loaded from disk or fetched from `moz-extension://` URLs. A large `.wasm` binary (e.g., 5+ MB with a full codec library) increases:
- Install time (for packed `.xpi`)
- Startup latency (compilation time scales with bytecode size)
- Memory usage (the compiled machine code lives in the code cache)

**Strategies to keep the binary small**

| Strategy | How |
|----------|-----|
| `wee_alloc` | A tiny (~1 KB) allocator instead of dlmalloc (~10 KB) |
| LTO | `lto = true` in `Cargo.toml` enables link-time optimization across crate boundaries |
| `wasm-pack` / `wasm-opt` | Post-link optimization (Binaryen) |
| Feature flags | Only enable the `web-sys` features you actually use |
| Codec selection | Use a lightweight Rust decoder (e.g., `lewton` for Vorbis) rather than pulling in `ffmpeg` |
| `#![no_std]` | For extreme minimalism, drop the standard library entirely and use `core` + `alloc` |

**Streaming instantiation**

```js
// Fast path — Firefox supports this in MV3 service workers
const init = async () => {
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(chrome.runtime.getURL("pkg/module_bg.wasm")),
    wasm_bindgen.__wbg_instanceof_Window
  );
  // ...
};
```

This downloads and compiles in a pipelined fashion. Without streaming, the entire `.wasm` file must be downloaded first (as an `ArrayBuffer`), then compiled — roughly doubling perceived load time.

---

## References

- [MDN: WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly)
- [wasm-bindgen Guide](https://rustwasm.github.io/docs/wasm-bindgen/)
- [MDN: Firefox WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [WebAssembly Specification](https://webassembly.github.io/spec/core/)
- [Binaryen](https://github.com/WebAssembly/binaryen)
