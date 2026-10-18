// -----------------------------------------------------------------------------
// Configuration of the TP-Link / Mercusys Router integration.
//
// Fields of the config_schema:
//   - `url`              address of the router web interface (192.168.0.1,
//                        http:// by default, https:// when "Local Management
//                        via HTTPS" is on);
//   - `password`         its local password, the one of the web page (a
//                        `secret`: never sent back to the UI, never logged);
//   - `username`         `admin` by default; `user` on some EX models (the
//                        web page of most models asks no user name);
//   - `verify_tls`       check the HTTPS certificate (off by default: the
//                        router ships with a self-signed one);
//   - `poll_interval`    how often the router is read, in seconds;
//   - `pause_minutes`    how long the "pause" button stops the readings, so
//                        that the web page of the router can be used;
//   - `network_devices`  which clients are offered as presence devices:
//                        `named` (a name known to the router), `all`, `none`;
//   - `absence_delay`    minutes a client must be gone before it is absent;
//   - `language`         language of the texts Gladys does not ask for in a
//                        language (feature names, scene summaries): `auto`
//                        follows the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`    language of the last widget request, kept for the
//                        texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

// A round is a login, three to five reads and a logout, and logs the web page
// out: one minute follows a link that drops without getting in the way.
const POLL_INTERVAL = { min: 30, max: 600, default: 60 };
const PAUSE_MINUTES = { min: 5, max: 120, default: 20 };
const DEFAULT_USERNAME = 'admin';
// A phone asleep on Wi-Fi leaves the client list of the router for a while.
const ABSENCE_DELAY = { min: 1, max: 60, default: 5 };
const NETWORK_DEVICES = ['named', 'all', 'none'];
const DEFAULT_NETWORK_DEVICES = 'named';
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('60', POLL_INTERVAL); // -> 60
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description The base URL of the web interface: http by default (the
 * router's LAN access), no path, no trailing slash. Null when it cannot be an
 * URL.
 * @param {unknown} raw - What the user typed.
 * @returns {string|null} The URL.
 * @example
 * normalizeUrl('192.168.0.1/'); // -> 'http://192.168.0.1'
 */
function normalizeUrl(raw) {
  const text = readString(raw);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * @description Read a boolean field (the form can send strings).
 * @param {unknown} raw - The raw value.
 * @param {boolean} fallback - The default.
 * @returns {boolean} The value.
 */
function readBoolean(raw, fallback) {
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (raw === 'true' || raw === '1' || raw === 1) {
    return true;
  }
  if (raw === 'false' || raw === '0' || raw === 0) {
    return false;
  }
  return fallback;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The config: `{ url, username, password, verifyTls,
 * pollInterval (s), pauseMinutes, networkDevices, absenceDelay (min), language }`.
 * @example
 * normalizeConfig({ url: '192.168.0.1', password: 'p' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    url: normalizeUrl(config.url),
    username: readString(config.username) || DEFAULT_USERNAME,
    // A secret is kept as typed.
    password: typeof config.password === 'string' ? config.password : '',
    verifyTls: readBoolean(config.verify_tls, false),
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    pauseMinutes: readNumber(config.pause_minutes, PAUSE_MINUTES),
    networkDevices: NETWORK_DEVICES.includes(config.network_devices)
      ? config.network_devices
      : DEFAULT_NETWORK_DEVICES,
    absenceDelay: readNumber(config.absence_delay, ABSENCE_DELAY),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Whether the router can be read.
 * @param {object} config - A normalized config.
 * @returns {boolean} True with an address and a password.
 */
const hasCredentials = (config) => Boolean(config.url && config.password);

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  POLL_INTERVAL,
  PAUSE_MINUTES,
  DEFAULT_USERNAME,
  ABSENCE_DELAY,
  NETWORK_DEVICES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeUrl,
  normalizeConfig,
  hasCredentials,
  readLanguage,
};
