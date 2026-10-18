// -----------------------------------------------------------------------------
// The devices of the TP-Link / Mercusys Router integration, offered on the
// Discovery screen.
//
// Category / type pairs come from DEVICE_FEATURE_CATEGORIES of the SDK, with
// an icon and a unit list in the Gladys front (front/src/utils/consts.js,
// server/utils/constants.js). Gladys has no CPU nor memory category:
// `level-sensor` / `decimal` in % is its plain numeric level, the name of
// each feature tells them apart.
//
// One router, "TP-Link <model>":
//   - cpu, memory          level-sensor / decimal, % (when the router reports them)
//   - internet             text / text (connected, disconnected)
//   - wan_ip               text / text
//   - internet_uptime      duration / decimal, hours: time since the internet
//                          link came up (when the router reports it)
//   - clients              counter-sensor / integer: clients connected now
//   - clients_wifi,        counter-sensor / integer: on the main Wi-Fi, wired,
//     clients_wired,       on the guest Wi-Fi
//     clients_guest
//   - firmware             text / text
// One device per Wi-Fi network, "Guest Wi-Fi 5 GHz":
//   - enabled              switch / binary, a command (turns the network on
//                          or off)
// One device per client of the network, "<client name>":
//   - presence             presence-sensor / push, as the Bluetooth presence
//                          of Gladys: 1 while it is connected, 0 once it left
//
// External ids: the router is "main" (one per integration), a Wi-Fi network
// its network and band ("guest_5g"), a client its MAC address without
// separators. Never a name.
//
// The router is read on the integration's own timer (one session for all
// devices), so `should_poll` is false.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPES = { ROUTER: 'router', WIFI: 'wifi', CLIENT: 'client' };
const ROUTER_ID = 'main';
const MAX_CLIENTS = 10000;
const DEFAULT_MODEL = 'TP-Link';

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};
const percent = {
  ...sensor,
  category: CATEGORIES.LEVEL_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.PERCENT,
  min: 0,
  max: 100,
};
const counter = {
  ...sensor,
  category: CATEGORIES.COUNTER_SENSOR,
  type: TYPES.SENSOR.INTEGER,
  min: 0,
  max: MAX_CLIENTS,
};

const INTERNET_STATUSES = ['connected', 'disconnected'];

// The features of the router: key, name (TEXTS key), shape, and the state of
// a snapshot (a number, `{ text }`, or null when unknown: not published).
// `optional`: only offered once the router reported it (watcher capabilities).
const ROUTER_FEATURES = [
  { key: 'cpu', name: 'featureCpu', optional: 'cpu', shape: percent, state: (s) => s.cpu },
  {
    key: 'memory',
    name: 'featureMemory',
    optional: 'memory',
    shape: percent,
    state: (s) => s.memory,
  },
  {
    key: 'internet',
    name: 'featureInternet',
    shape: text,
    state: (s, language) =>
      INTERNET_STATUSES.includes(s.wan?.status)
        ? { text: t(`internet_${s.wan.status}`, language) }
        : null,
  },
  {
    key: 'wan_ip',
    name: 'featureWanIp',
    shape: text,
    state: (s) => (s.wan?.ip ? { text: s.wan.ip } : null),
  },
  {
    key: 'internet_uptime',
    name: 'featureInternetUptime',
    optional: 'internet_uptime',
    shape: {
      ...sensor,
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.HOURS,
      min: 0,
      max: 1000000,
    },
    state: (s) => s.internetUptimeHours,
  },
  {
    key: 'clients',
    name: 'featureClients',
    shape: counter,
    state: (s) => s.clientsOnline ?? null,
  },
  {
    key: 'clients_wifi',
    name: 'featureClientsWifi',
    shape: counter,
    state: (s) => s.counts?.wifi ?? null,
  },
  {
    key: 'clients_wired',
    name: 'featureClientsWired',
    shape: counter,
    state: (s) => s.counts?.wired ?? null,
  },
  {
    key: 'clients_guest',
    name: 'featureClientsGuest',
    shape: counter,
    state: (s) => s.counts?.guest ?? null,
  },
  {
    key: 'firmware',
    name: 'featureFirmware',
    shape: text,
    state: (s) => (s.identity?.firmware ? { text: s.identity.firmware } : null),
  },
];

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id (see macId for a client).
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'wifi', 'guest_5g').device; // -> 'ext:tplink-router:wifi:guest_5g'
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, id);
}

/**
 * @description The platform id of a client: its MAC address without separators.
 * @param {string} mac - 'aa:bb:cc:dd:ee:ff'.
 * @returns {string} 'aabbccddeeff'.
 */
const macId = (mac) => mac.replace(/:/g, '');

/**
 * @description The MAC address of a client id.
 * @param {string} id - 'aabbccddeeff'.
 * @returns {string} 'aa:bb:cc:dd:ee:ff'.
 */
const macOf = (id) => id.match(/../g).join(':');

const ID_PATTERNS = {
  [DEVICE_TYPES.ROUTER]: '[a-z]+',
  [DEVICE_TYPES.WIFI]: '(?:host|guest|iot)_[256]g',
  [DEVICE_TYPES.CLIENT]: '[0-9a-f]{12}',
};

/**
 * @description The platform id a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @param {string} type - A DEVICE_TYPES value.
 * @returns {string|null} The id.
 * @example
 * idFromExternalId('ext:tplink-router:client:aabbccddeeff:presence', 'client'); // -> 'aabbccddeeff'
 */
function idFromExternalId(externalId, type) {
  const match = new RegExp(`:${type}:(${ID_PATTERNS[type]})(?::[a-z0-9_]+)?$`).exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : null;
}

/**
 * @description A feature of a spec.
 * @param {object} ids - The ids of the device.
 * @param {object} spec - The feature spec.
 * @param {string} language - Language of the name.
 * @returns {object} The feature.
 */
const featureOf = (ids, spec, language) => ({
  name: t(spec.name, language),
  external_id: ids.feature(spec.key),
  ...spec.shape,
});

/**
 * @description The features of the router, given what it reported so far.
 * @param {string[]} capabilities - Optional keys the router reported.
 * @returns {Array<object>} The specs.
 */
const routerSpecs = (capabilities = []) =>
  ROUTER_FEATURES.filter((spec) => !spec.optional || capabilities.includes(spec.optional));

/**
 * @description The model of the router, "Archer AX55 v1.0".
 * @param {object|null} identity - The identity snapshot.
 * @returns {string} The model.
 */
const modelOf = (identity) => identity?.model ?? DEFAULT_MODEL;

/**
 * @description The name of the router device.
 * @param {object|null} identity - The identity snapshot.
 * @param {string} language - The language.
 * @returns {string} "TP-Link Archer AX55 v1.0".
 */
function routerName(identity, language) {
  const model = identity?.model;
  if (!model) {
    return t('routerDeviceNameUnknown', language);
  }
  // Mercusys models carry their own brand; "MR80X" alone does not.
  return /^(tp-?link|mercusys)\b/i.test(model) ? model : t('routerDeviceName', language, { model });
}

/**
 * @description The router device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot (watcher.router()).
 * @param {string[]} capabilities - Optional features met so far.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * buildRouterDevice(gladys, { identity: { model: 'Archer AX55 v1.0' } }, ['cpu'], 'fr');
 */
function buildRouterDevice(gladys, router, capabilities, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
  const identity = router?.identity ?? null;
  return {
    name: routerName(identity, language),
    external_id: ids.device,
    model: modelOf(identity),
    should_poll: false,
    params: [
      ...(identity?.lanMac ? [{ name: 'MAC', value: identity.lanMac }] : []),
      ...(identity?.firmware ? [{ name: 'FIRMWARE', value: identity.firmware }] : []),
    ],
    features: routerSpecs(capabilities).map((spec) => featureOf(ids, spec, language)),
  };
}

/**
 * @description The states of the router.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildRouterStates(gladys, router, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
  return ROUTER_FEATURES.flatMap((spec) => {
    const value = spec.state(router, language);
    if (value === null || value === undefined) {
      return [];
    }
    const id = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    ];
  });
}

/**
 * @description The name of a Wi-Fi network: "Guest Wi-Fi 5 GHz".
 * @param {{ network: string, band: string }} wifi - The network snapshot.
 * @param {string} language - The language.
 * @returns {string} The name.
 */
const wifiName = (wifi, language) =>
  t(`wifiDeviceName_${wifi.network}`, language, { band: t(`band_${wifi.band}`, language) });

/**
 * @description The device of a Wi-Fi network.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} wifi - The network snapshot (readWifi).
 * @param {object|null} identity - The identity of the router.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildWifiDevice(gladys, wifi, identity, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.WIFI, wifi.id);
  return {
    name: wifiName(wifi, language),
    external_id: ids.device,
    model: modelOf(identity),
    should_poll: false,
    params: [{ name: 'WIFI_NETWORK', value: wifi.id }],
    features: [
      {
        name: t('featureWifi', language),
        external_id: ids.feature('enabled'),
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.BINARY,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ],
  };
}

const buildWifiStates = (gladys, wifi) =>
  typeof wifi.enabled === 'boolean'
    ? [
        {
          device_feature_external_id: idsOf(gladys, DEVICE_TYPES.WIFI, wifi.id).feature('enabled'),
          state: wifi.enabled ? 1 : 0,
        },
      ]
    : [];

/**
 * @description The name of a client: its name on the router, else its MAC.
 * @param {object} client - The client snapshot.
 * @returns {string} The name.
 */
const clientName = (client) => client.name ?? client.mac;

/**
 * @description The device of a client of the network.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} client - The client snapshot.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildClientDevice(gladys, client, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.CLIENT, macId(client.mac));
  return {
    name: clientName(client),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'MAC', value: client.mac }],
    features: [
      {
        name: t('featurePresence', language),
        external_id: ids.feature('presence'),
        category: CATEGORIES.PRESENCE_SENSOR,
        type: TYPES.SENSOR.PUSH,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ],
  };
}

const presenceFeatureId = (gladys, mac) =>
  idsOf(gladys, DEVICE_TYPES.CLIENT, macId(mac)).feature('presence');

export {
  DEVICE_TYPES,
  ROUTER_ID,
  ROUTER_FEATURES,
  INTERNET_STATUSES,
  idsOf,
  macId,
  macOf,
  idFromExternalId,
  routerSpecs,
  routerName,
  modelOf,
  wifiName,
  clientName,
  buildRouterDevice,
  buildRouterStates,
  buildWifiDevice,
  buildWifiStates,
  buildClientDevice,
  presenceFeatureId,
};
