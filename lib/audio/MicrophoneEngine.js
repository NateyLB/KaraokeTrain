import { getAudioRuntime } from './runtime.js';
import { detectPitch, frequencyToNote } from './pitch.js';

/** Owns microphone tracks, effect nodes and its animation loop. */
export class MicrophoneEngine {
  #generation = 0;
  #nodes = new Set();
  #stream = null;
  #pending = null;
  #frame = null;
  #history = [];
  #gain = 0.8;
  #echo = false;
  #frequency = 0;

  constructor({ onChange, getMedia = constraints => navigator.mediaDevices.getUserMedia(constraints),
    runtime = getAudioRuntime, requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = id => cancelAnimationFrame(id) } = {}) {
    Object.assign(this, { onChange, getMedia, runtime, requestFrame, cancelFrame });
  }

  #own(node) { this.#nodes.add(node); return node; }
  #emit(value) { this.onChange?.(value); }

  start(echoCancellation = true) {
    if (this.#stream) return Promise.resolve();
    if (this.#pending) return this.#pending;
    const generation = ++this.#generation;
    const pending = this.#start(generation, echoCancellation);
    this.#pending = pending;
    pending.finally(() => { if (this.#pending === pending) this.#pending = null; });
    return pending;
  }

  async #start(generation, echoCancellation) {
    try {
      const stream = await this.getMedia({ audio: { echoCancellation, noiseSuppression: true, autoGainControl: true } });
      if (generation !== this.#generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.#stream = stream;
      this.echoCancellation = echoCancellation;
      const { context, recordingDestination } = this.runtime();
      this.context = context;
      await context.resume();
      if (generation !== this.#generation) return;
      this.analyser = this.#own(context.createAnalyser());
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.master = this.#own(context.createGain());
      this.master.connect(context.destination);
      this.master.connect(recordingDestination);
      this.gain = this.#own(context.createGain());
      this.gain.gain.value = this.#gain;
      this.source = this.#own(context.createMediaStreamSource(stream));
      this.source.connect(this.analyser);
      this.source.connect(this.gain);
      this.gain.connect(this.master);

      this.delay = this.#own(context.createDelay(1));
      this.delay.delayTime.value = 0.3;
      this.feedback = this.#own(context.createGain());
      this.feedback.gain.value = 0.4;
      this.wet = this.#own(context.createGain());
      this.wet.gain.value = this.#echo ? 0.4 : 0;
      this.gain.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wet);
      this.wet.connect(this.master);

      this.oscillator = this.#own(context.createOscillator());
      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.value = this.#frequency;
      const filter = this.#own(context.createBiquadFilter());
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      this.synthGain = this.#own(context.createGain());
      this.synthGain.gain.value = 0;
      this.oscillator.connect(filter);
      filter.connect(this.synthGain);
      this.synthGain.connect(this.master);
      this.oscillator.start();
      this.#emit({ isListening: true, error: null });
      this.#analyse();
    } catch {
      if (generation !== this.#generation) return;
      this.stop();
      this.#emit({ error: 'Could not start the microphone. Check microphone access and audio settings.' });
    }
  }

  #analyse = () => {
    if (!this.#stream || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const { frequency, rms } = detectPitch(this.buffer, this.context.sampleRate);
    const volume = Math.min(100, Math.max(0, rms * 350));
    let pitch = null;
    if (frequency > 60 && frequency < 1500) {
      const note = frequencyToNote(frequency);
      this.#history.push(note.midi);
      if (this.#history.length > 5) this.#history.shift();
      const sorted = [...this.#history].sort((a, b) => a - b);
      if (sorted[Math.floor(sorted.length / 2)] === note.midi) pitch = note;
    } else this.#history = [];
    this.synthGain.gain.setTargetAtTime(this.#frequency > 0 ? volume / 100 * 0.4 : 0, this.context.currentTime, 0.02);
    this.#emit({ volume, pitch });
    this.#frame = this.requestFrame(this.#analyse);
  };

  setVolume(level) {
    if (!Number.isFinite(level)) return;
    this.#gain = Math.max(0, Math.min(5, level));
    if (this.gain) this.gain.gain.value = this.#gain;
  }
  setEcho(enabled) { this.#echo = enabled; if (this.wet) this.wet.gain.value = enabled ? 0.4 : 0; }
  setFrequency(frequency) {
    this.#frequency = Number.isFinite(frequency) && frequency > 0 ? frequency : 0;
    this.oscillator?.frequency.setTargetAtTime(this.#frequency, this.context.currentTime, 0.05);
  }

  async setEchoCancellation(enabled) {
    const stream = this.#stream;
    if (!stream || this.echoCancellation === enabled) return;
    try {
      await Promise.all(stream.getAudioTracks().map(track => track.applyConstraints({ echoCancellation: enabled })));
      if (stream === this.#stream) this.echoCancellation = enabled;
    } catch { this.#emit({ error: 'This microphone does not support changing noise cancellation.' }); }
  }

  stop() {
    this.#generation++;
    this.#pending = null;
    if (this.#frame !== null) this.cancelFrame(this.#frame);
    this.#frame = null;
    this.#stream?.getTracks().forEach(track => track.stop());
    this.#stream = null;
    try { this.oscillator?.stop(); } catch { /* already stopped */ }
    for (const node of this.#nodes) { try { node.disconnect(); } catch { /* disconnected */ } }
    this.#nodes.clear();
    this.#history = [];
    this.analyser = this.gain = this.wet = this.oscillator = this.synthGain = this.source = this.master = this.delay = this.feedback = null;
    this.buffer = null;
    this.#emit({ isListening: false, volume: 0, pitch: null });
  }

  dispose() { this.onChange = null; this.stop(); }
}
