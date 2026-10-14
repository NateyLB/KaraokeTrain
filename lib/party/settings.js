const BOOLEAN_SETTINGS = new Set(['isPlaying', 'vocalsEnabled', 'micEnabled', 'echoOn', 'autoTuneOn', 'isVideoVisible']);
const NUMBER_SETTINGS = { vocalsVolume: [0, 1], micVolume: [0, 1], lyricsOffset: [-7200, 7200], firstValidTime: [0, 7200] };
export const REMOTE_COMMANDS = new Set(['togglePlay', 'nextSong', 'next', 'previousSong', 'previous', 'alignStart', 'toggleMic', 'toggleVideo']);
export const SYNCED_SETTING_KEYS = [...BOOLEAN_SETTINGS, ...Object.keys(NUMBER_SETTINGS)];
export const selectSyncedSettings = state => Object.fromEntries(SYNCED_SETTING_KEYS.map(key => [key, state[key]]));

export function validatedSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new TypeError('Settings must be an object');
  const result = {};
  for (const [key, value] of Object.entries(settings)) {
    if (BOOLEAN_SETTINGS.has(key)) {
      if (typeof value !== 'boolean') throw new TypeError(`Invalid ${key}`);
      result[key] = value;
    } else if (Object.hasOwn(NUMBER_SETTINGS, key)) {
      const [min, max] = NUMBER_SETTINGS[key];
      if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`Invalid ${key}`);
      result[key] = value;
    }
  }
  return result;
}
