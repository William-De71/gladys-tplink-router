// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildRouterDevice,
  buildRouterStates,
  buildWifiDevice,
  buildWifiStates,
  buildClientDevice,
  idFromExternalId,
  routerName,
  clientName,
  macId,
  macOf,
} from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, PHONE_MAC } from './helpers/fixtures.js';

const ALL = ['cpu', 'memory', 'internet_uptime'];
const router = { identity: { model: 'Archer AX55 v1.0', firmware: '1.1.3 Build 20230411' } };
const guest = { id: 'guest_5g', network: 'guest', band: '5g', enabled: false };
const client = { mac: PHONE_MAC, name: 'Pixel-8' };

/**
 * @description Every device, in a language.
 * @param {string} language - The language.
 * @returns {Array<object>} The devices.
 */
const devices = (language) => [
  buildRouterDevice(fakeGladys, router, ALL, language),
  buildWifiDevice(fakeGladys, { id: 'host_2g', network: 'host', band: '2g' }, null, language),
  buildWifiDevice(fakeGladys, guest, router.identity, language),
  buildWifiDevice(fakeGladys, { id: 'iot_6g', network: 'iot', band: '6g' }, null, language),
  buildClientDevice(fakeGladys, client, language),
];

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core (server/utils/constants.js,
// master of 2026-10-14), for the categories used here.
const UNITS = {
  'level-sensor': [DEVICE_FEATURE_UNITS.PERCENT],
  duration: [
    DEVICE_FEATURE_UNITS.MILLISECONDS,
    DEVICE_FEATURE_UNITS.SECONDS,
    DEVICE_FEATURE_UNITS.MINUTES,
    DEVICE_FEATURE_UNITS.HOURS,
    DEVICE_FEATURE_UNITS.DAYS,
  ],
};
// Pairs with an icon in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER],
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT],
  [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY],
  [DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.PUSH],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(typeof feature.read_only, 'boolean', feature.external_id);
        assert.equal(typeof feature.has_feedback, 'boolean', feature.external_id);
        assert.ok(feature.name, feature.external_id);
      }
    }
  }
});

test('every category / type pair has an icon in Gladys, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (feature.unit) {
        assert.ok(
          UNITS[feature.category]?.includes(feature.unit),
          `${feature.external_id}: ${feature.unit}`,
        );
      }
    }
  }
});

test('only the Wi-Fi network switches are commands', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      const command = feature.category === DEVICE_FEATURE_CATEGORIES.SWITCH;
      assert.equal(feature.read_only, !command, feature.external_id);
      assert.equal(feature.has_feedback, command, feature.external_id);
    }
  }
});

test('names tell the devices apart; a client without a name shows its MAC', () => {
  assert.deepEqual(
    devices('fr').map((device) => device.name),
    [
      'TP-Link Archer AX55 v1.0',
      'Wi-Fi 2,4 GHz',
      'Wi-Fi invité 5 GHz',
      'Wi-Fi IoT 6 GHz',
      'Pixel-8',
    ],
  );
  assert.deepEqual(
    devices('de')
      .slice(1, 4)
      .map((device) => device.name),
    ['WLAN 2,4 GHz', 'Gast-WLAN 5 GHz', 'IoT-WLAN 6 GHz'],
  );
  assert.equal(clientName({ mac: PHONE_MAC, name: null }), PHONE_MAC);
  assert.equal(routerName({ model: 'Mercusys MR80X v2.0' }, 'en'), 'Mercusys MR80X v2.0');
  assert.equal(routerName({ model: 'TP-Link Archer C6' }, 'en'), 'TP-Link Archer C6');
  assert.equal(routerName(null, 'fr'), 'Routeur TP-Link');
  // Distinct feature names on the router: the dashboard shows them.
  const names = devices('en')[0].features.map((feature) => feature.name);
  assert.equal(new Set(names).size, names.length);
});

test('the router offers the optional features once it reported them', () => {
  const bare = buildRouterDevice(fakeGladys, router, [], 'en');
  assert.deepEqual(
    bare.features.map((feature) => feature.external_id.split(':').pop()),
    ['internet', 'wan_ip', 'clients', 'clients_wifi', 'clients_wired', 'clients_guest', 'firmware'],
  );
  assert.equal(
    buildRouterDevice(fakeGladys, router, ALL, 'en').features.length,
    bare.features.length + 3,
  );
  assert.equal(buildRouterDevice(fakeGladys, null, [], 'en').name, 'TP-Link router');
  assert.equal(buildRouterDevice(fakeGladys, null, [], 'en').model, 'TP-Link');
});

test('external ids are built on stable platform ids and read back', () => {
  const ids = devices('en').map((device) => device.external_id);
  assert.deepEqual(ids, [
    'ext:tplink-router:router:main',
    'ext:tplink-router:wifi:host_2g',
    'ext:tplink-router:wifi:guest_5g',
    'ext:tplink-router:wifi:iot_6g',
    'ext:tplink-router:client:a483e7123456',
  ]);
  assert.equal(idFromExternalId(`${ids[4]}:presence`, 'client'), 'a483e7123456');
  assert.equal(idFromExternalId(`${ids[2]}:enabled`, 'wifi'), 'guest_5g');
  assert.equal(idFromExternalId(ids[2], 'client'), null);
  assert.equal(idFromExternalId('ext:tplink-router:wifi:guest_7g', 'wifi'), null);
  assert.equal(macOf(macId(PHONE_MAC)), PHONE_MAC);
});

test('unknown values are not published; texts follow the language', () => {
  const states = buildRouterStates(
    fakeGladys,
    {
      cpu: 12.5,
      memory: null,
      wan: { status: 'connected', ip: '90.12.34.56' },
      internetUptimeHours: 26,
      clientsOnline: 4,
      counts: { wifi: 2, wired: 1, guest: 1 },
      identity: { firmware: '1.1.3' },
    },
    'fr',
  );
  const id = (key) => `ext:tplink-router:router:main:${key}`;
  assert.deepEqual(states, [
    { device_feature_external_id: id('cpu'), state: 12.5 },
    { device_feature_external_id: id('internet'), text: 'Connecté' },
    { device_feature_external_id: id('wan_ip'), text: '90.12.34.56' },
    { device_feature_external_id: id('internet_uptime'), state: 26 },
    { device_feature_external_id: id('clients'), state: 4 },
    { device_feature_external_id: id('clients_wifi'), state: 2 },
    { device_feature_external_id: id('clients_wired'), state: 1 },
    { device_feature_external_id: id('clients_guest'), state: 1 },
    { device_feature_external_id: id('firmware'), text: '1.1.3' },
  ]);
  assert.deepEqual(buildWifiStates(fakeGladys, guest), [
    { device_feature_external_id: 'ext:tplink-router:wifi:guest_5g:enabled', state: 0 },
  ]);
  assert.deepEqual(buildWifiStates(fakeGladys, { ...guest, enabled: null }), []);
});
