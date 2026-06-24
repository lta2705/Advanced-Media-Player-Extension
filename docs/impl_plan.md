Act as a Senior Browser Extension Architect and Systems Engineer with deep expertise in WebExtensions (Manifest V3), Web Audio API, WebGL, and WebAssembly (Wasm) compiling from Rust/C++.

I am building a Firefox extension named "Advanced Media Player". The core architecture relies on capturing HTML5 video/audio streams via Content Scripts, offloading the raw data to a Web Worker, and processing high-performance audio/video manipulations (DSP, Graphic Equalizer, Custom Time-Stretching, Shaders) using a local WebAssembly module.

Please generate a comprehensive, production-ready implementation plan and technical blueprint for this project. The plan must include:

1. **Architecture & Data Flow Diagram (Text-based/Mermaid):** Clearly mapping the communication between Popup UI, Background Script, Content Script, Web Worker, and the Wasm module via postMessage and SharedArrayBuffer.
2. **Project Directory Structure:** A clean layout showing where manifests, scripts, icons, assets, and raw/compiled Wasm files reside.
3. **Core Configurations:**
    - A complete `manifest.json` (Manifest V3 for Firefox) with strict Content Security Policy (CSP) allowing `'wasm-unsafe-eval'` and defining necessary permissions (`tabs`, `activeTab`, `web_accessible_resources`).
4. **Step-by-Step Technical Implementation:** Broken down from Phase 1 to Phase 5:
    - *Phase 1:* Setting up the Wasm core toolchain (Rust/wasm-pack or C++/Emscripten) and exporting DSP functions.
    - *Phase 2:* Audio capturing via Web Audio API (`AudioContext`, `createMediaElementSource`) and Web Worker bridging.
    - *Phase 3:* Building the UI (Popup) and integrating the Media Session API for global hardware media key control.
    - *Phase 4:* Implementing advanced features (e.g., Volume Booster > 100% with a safety dynamics compressor limiter, parametric EQ).
5. **Mozilla AMO Submission & Review Guidelines:** Specific steps required to handle Wasm code review, including source code submission requirements for obfuscated/compiled binaries to avoid rejection.

Keep the tone highly professional, precise, and practical. Provide code snippets for the foundational connection blocks where necessary.