import { selectSyncedSettings, SYNCED_SETTING_KEYS, validatedSettings } from './settings.js';

/** Owns one client's debounced setting patches and the latest server snapshot. */
export class SettingsSynchronizer {
  #pending = {};
  #flight = null;
  #remote = null;
  #previous;
  #timer;
  #unsubscribe;
  #applying = false;
  #disposed = false;

  constructor({ client, role, store, apply, onError, delayMs = 300 }) {
    Object.assign(this, { client, role, store, apply, onError, delayMs });
    this.#previous = selectSyncedSettings(store.getState());
    this.#unsubscribe = store.subscribe(state => {
      const next = selectSyncedSettings(state);
      const changes = Object.fromEntries(SYNCED_SETTING_KEYS
        .filter(key => !Object.is(next[key], this.#previous[key])).map(key => [key, next[key]]));
      this.#previous = next;
      if (this.#applying || !Object.keys(changes).length) return;
      Object.assign(this.#pending, changes);
      this.#schedule();
    });
  }

  receive(settings) {
    if (this.#disposed || !Number.isSafeInteger(settings?.timestamp) || settings.timestamp < 0 ||
        (this.#remote && settings.timestamp <= this.#remote.timestamp)) return;
    this.#remote = { ...validatedSettings(settings), timestamp: settings.timestamp };
    this.#applyRemote();
  }

  #applyRemote() {
    if (!this.#remote || this.#disposed) return;
    const protectedKeys = { ...this.#flight?.settings, ...this.#pending };
    const current = this.store.getState();
    const patch = Object.fromEntries(SYNCED_SETTING_KEYS.filter(key =>
      Object.hasOwn(this.#remote, key) && !Object.hasOwn(protectedKeys, key) &&
      !Object.is(current[key], this.#remote[key])).map(key => [key, this.#remote[key]]));
    if (!Object.keys(patch).length) return;
    this.#applying = true;
    try { this.apply(patch); }
    finally {
      this.#previous = selectSyncedSettings(this.store.getState());
      this.#applying = false;
    }
  }

  #schedule() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { void this.flush(); }, this.delayMs);
  }

  async flush() {
    clearTimeout(this.#timer);
    if (this.#disposed || this.#flight || !Object.keys(this.#pending).length) return;
    const settings = this.#pending;
    this.#pending = {};
    const controller = new AbortController();
    this.#flight = { settings, controller };
    let retryQueued = false;
    try {
      const party = await this.client.send('updateSettings', { sender: this.role, settings }, { signal: controller.signal });
      if (!this.#disposed) this.receive(party.settings);
      retryQueued = true;
    } catch (error) {
      if (!this.#disposed) {
        // Keep the failed patch for the next interaction, without a retry loop.
        retryQueued = Object.keys(this.#pending).length > 0;
        this.#pending = { ...settings, ...this.#pending };
        this.onError(error);
      }
    } finally {
      this.#flight = null;
      if (!this.#disposed) {
        // Revisit fields protected during the request against the newest SSE
        // snapshot, even if its revision preceded the HTTP acknowledgment.
        this.#applyRemote();
        if (retryQueued && Object.keys(this.#pending).length) this.#schedule();
      }
    }
  }

  dispose() {
    this.#disposed = true;
    clearTimeout(this.#timer);
    this.#unsubscribe();
    this.#flight?.controller.abort();
    this.#pending = {};
  }
}
