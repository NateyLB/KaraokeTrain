import { getAudioRuntime } from './runtime.js';

const sources = new WeakMap();

/** Routes instrumental/vocal channels to stereo output and the recording sink. */
export class MultiplexGraph {
  constructor(runtime = getAudioRuntime) { this.runtime = runtime; this.nodes = []; }

  attach(element) {
    if (this.element === element) return;
    this.detach();
    if (!element) return;
    const { context, recordingDestination } = this.runtime();
    const source = sources.get(element) || context.createMediaElementSource(element);
    sources.set(element, source);
    this.element = element;
    this.context = context;
    this.nodes.push(source);
    try {
      const splitter = context.createChannelSplitter(2);
      const instrumental = context.createGain();
      const vocal = context.createGain();
      const merger = context.createChannelMerger(2);
      this.nodes.push(splitter, instrumental, vocal, merger);
      source.connect(splitter);
      splitter.connect(instrumental, 0);
      splitter.connect(vocal, 1);
      for (const gain of [instrumental, vocal]) {
        gain.connect(merger, 0, 0);
        gain.connect(merger, 0, 1);
      }
      merger.connect(context.destination);
      merger.connect(recordingDestination);
      this.vocal = vocal;
    } catch (error) { this.detach(); throw error; }
  }

  setVocals(enabled, volume) {
    this.vocal?.gain.setTargetAtTime(enabled ? Math.max(0, Math.min(1, volume)) : 0, this.context.currentTime, 0.05);
  }

  detach() {
    for (const node of this.nodes) { try { node.disconnect(); } catch { /* disconnected */ } }
    this.nodes = [];
    this.element = this.vocal = null;
  }
}
