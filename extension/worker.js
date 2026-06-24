let wasmModule = null;
let wasmReady = false;

async function initWasm() {
  try {
    const mod = await import(browser.runtime.getURL("pkg/advanced_media_player.js"));
    await mod.default();
    wasmModule = mod;
    wasmReady = true;
  } catch (err) {
    console.warn("[Worker] WASM not available, using JS fallback:", err);
  }
}

function processInJS(samples) {
  return samples;
}

self.onmessage = async (e) => {
  const { type, samples, config } = e.data;

  if (type === "INIT") {
    await initWasm();
    return;
  }

  if (type === "PROCESS_AUDIO") {
    const floatSamples = new Float32Array(samples);
    let processed;

    if (wasmReady && wasmModule) {
      if (config?.gain && config.gain !== 1.0) {
        processed = wasmModule.apply_gain(floatSamples, config.gain);
      }
      if (config?.eq && config.eq.length > 0) {
        const eq = new wasmModule.Equalizer();
        for (const band of config.eq) {
          if (band.type === "peaking") {
            eq.add_peaking_band(band.freq, band.gain_db, band.q, config.sampleRate || 44100);
          } else if (band.type === "lowshelf") {
            eq.add_low_shelf(band.freq, band.gain_db, band.s || 0.707, config.sampleRate || 44100);
          } else if (band.type === "highshelf") {
            eq.add_high_shelf(band.freq, band.gain_db, band.s || 0.707, config.sampleRate || 44100);
          }
        }
        const eqInput = processed || floatSamples;
        processed = eq.process(eqInput);
        eq.free();
      }
      if (config?.compressor && config.compressor.enabled) {
        const comp = config.compressor;
        const compInput = processed || floatSamples;
        processed = wasmModule.apply_compressor(
          compInput,
          comp.threshold || -24,
          comp.ratio || 4,
          comp.knee || 6,
          comp.attack || 0.002,
          comp.release || 0.1,
          config.sampleRate || 44100
        );
      }
      if (config?.timeStretch && config.timeStretch !== 1.0) {
        const tsInput = processed || floatSamples;
        processed = wasmModule.time_stretch(tsInput, config.timeStretch, config.sampleRate || 44100);
      }
      if (config?.visualize) {
        const visInput = processed || floatSamples;
        const spectrum = wasmModule.compute_spectrum(visInput);
        self.postMessage({ type: "SPECTRUM", data: spectrum }, [spectrum.buffer]);
        return;
      }
    } else {
      processed = processInJS(floatSamples);
    }

    const output = processed || floatSamples;
    self.postMessage({ type: "PROCESSED_AUDIO", data: output.buffer }, [output.buffer]);
  }
};

self.postMessage({ type: "WORKER_READY" });
