// Every widget content through validateWidgetContent (the checks of the core,
// which only run in debug mode in production) and the content budget of a
// card, in the four languages and in the edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildOverviewWidget,
  buildInternetWidget,
  buildWifiWidget,
  buildNetworkWidget,
  readNetworkSettings,
  formatDuration,
  connectionBadge,
  messageContent,
  WIDGET_ACTIONS,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, MINUTE, PHONE_MAC, NAS_MAC, TV_MAC, GUEST_MAC } from './helpers/fixtures.js';

const types = (content) => content.components.map((component) => component.type);

/**
 * @description Assert a content is valid and within the budget of a card.
 * @param {object} content - The content.
 * @param {string} label - For the messages.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const count = (list) => types(content).filter((type) => list.includes(type)).length;
  assert.ok(content.components.length <= 8, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['text']) <= 2, label);
  assert.ok(count(['status']) <= 1, label);
  assert.ok(count(['button']) <= 4, label);
  assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600, label);
  const keys = content.components.filter((c) => c.type === 'button').map((c) => c.action.key);
  assert.equal(new Set(keys).size, keys.length, `${label}: a duplicate button key is dropped`);
  for (const component of content.components) {
    if (component.type === 'button') {
      assert.ok(component.label.length <= 24, `${label}: ${component.label}`);
    }
    for (const item of component.items ?? []) {
      if (component.type === 'status') {
        assert.ok(item.value, `${label}: a status row without value is dropped`);
        assert.ok(
          item.label.length + item.value.length <= 40,
          `${label}: ${item.label} ${item.value}`,
        );
      }
    }
  }
}

const router = {
  identity: { model: 'Archer AX55 v1.0', firmware: '1.1.3 Build 20230411', lanIp: '192.168.0.1' },
  cpu: 23.5,
  memory: 77.5,
  wan: {
    status: 'connected',
    ip: '90.12.34.56',
    gateway: '90.12.34.1',
    connType: 'pppoe',
    dns1: '80.10.246.2',
    dns2: '80.10.246.129',
    ipv6: '2a01:cb00:1234:5600::1',
  },
  internetUptimeHours: 50.5,
  clientsOnline: 17,
  counts: { wifi: 12, wired: 3, guest: 2 },
};
const wifi = [
  { id: 'host_2g', network: 'host', band: '2g', enabled: true },
  { id: 'host_5g', network: 'host', band: '5g', enabled: true },
  { id: 'host_6g', network: 'host', band: '6g', enabled: false },
  { id: 'guest_2g', network: 'guest', band: '2g', enabled: false },
  { id: 'guest_5g', network: 'guest', band: '5g', enabled: false },
  { id: 'iot_2g', network: 'iot', band: '2g', enabled: true },
];
const clients = [
  {
    mac: PHONE_MAC,
    name: 'Pixel-8',
    ip: '192.168.0.23',
    present: true,
    connection: '5g',
    network: 'host',
    lastSeen: NOW,
  },
  {
    mac: NAS_MAC,
    name: 'DS220',
    ip: '192.168.0.10',
    present: true,
    connection: 'wired',
    network: 'host',
    lastSeen: NOW,
  },
  {
    mac: GUEST_MAC,
    name: 'iPhone',
    ip: '192.168.0.120',
    present: true,
    connection: '2g',
    network: 'guest',
    lastSeen: NOW,
  },
  {
    mac: TV_MAC,
    name: null,
    ip: '192.168.0.40',
    present: false,
    connection: '2g',
    network: 'host',
    lastSeen: NOW - 30 * MINUTE,
  },
];

test('overview: gauges, tiles, status, buttons, in every language', () => {
  for (const language of LANGUAGES) {
    for (const pausedUntil of [null, NOW + 12 * MINUTE]) {
      const content = buildOverviewWidget({
        router,
        language,
        now: NOW,
        fetchedAt: NOW - 30000,
        pollSeconds: 60,
        pausedUntil,
        pauseMinutes: 20,
      });
      assertValid(content, `overview ${language} ${pausedUntil}`);
      assert.deepEqual(types(content), [
        'text',
        'gauge',
        'gauge',
        'value',
        'value',
        'status',
        'button',
        'button',
      ]);
    }
  }
  const fr = buildOverviewWidget({
    router,
    language: 'fr',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 60,
  });
  assert.equal(fr.components[0].text, 'Archer AX55 v1.0 · 192.168.0.1 · à l’instant');
  assert.equal(fr.components[2].color, 'warning', 'memory at 77.5 %');
  const rows = fr.components[5].items;
  assert.deepEqual(
    rows.map((row) => row.value),
    ['Connecté · 90.12.34.56', '2 j 2 h', '1.1.3 Build 20230411', 'toutes les 60 s'],
  );
  assert.deepEqual(fr.components[6].action, { key: WIDGET_ACTIONS.PAUSE });
  assert.equal(fr.components[6].label, 'Pause de 20 min');
  assert.deepEqual(fr.components[7].action, { key: WIDGET_ACTIONS.REBOOT, confirm: true });
  const paused = buildOverviewWidget({
    router,
    language: 'en',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 60,
    pausedUntil: NOW + 12 * MINUTE,
  });
  assert.equal(paused.components[5].items[3].value, 'paused (12 min left)');
  assert.deepEqual(paused.components[6].action, { key: WIDGET_ACTIONS.RESUME });
});

test('overview: unknown values make no gauge, rather than a misleading 0', () => {
  const content = buildOverviewWidget({
    router: { identity: {}, cpu: null, memory: null, wan: null, internetUptimeHours: null },
    language: 'en',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 60,
  });
  assertValid(content, 'bare overview');
  assert.deepEqual(types(content), ['text', 'value', 'value', 'status', 'button', 'button']);
  assert.equal(content.components[3].items[0].value, 'Unknown');
});

test('internet: time connected, link, addresses; access point mode', () => {
  for (const language of LANGUAGES) {
    const content = buildInternetWidget({ router, language, pollSeconds: 60 });
    assertValid(content, `internet ${language}`);
    assert.deepEqual(types(content), ['text', 'value', 'status']);
    assert.equal(content.components[2].items.length, 6);
  }
  const de = buildInternetWidget({ router, language: 'de', pollSeconds: 60 });
  assert.equal(de.components[0].text, 'Internet · PPPoE');
  assert.equal(de.components[1].value, '2 T. 2 Std.');
  const dhcp = buildInternetWidget({
    router: {
      ...router,
      internetUptimeHours: null,
      wan: { status: 'disconnected', connType: 'dhcp' },
    },
    language: 'fr',
    pollSeconds: 60,
  });
  assertValid(dhcp, 'internet down');
  assert.equal(dhcp.components[0].text, 'Internet · IP dynamique');
  assert.deepEqual(types(dhcp), ['text', 'status']);
  assert.equal(dhcp.components[1].items[0].color, 'danger');
  const odd = buildInternetWidget({
    router: { wan: { status: 'connected', connType: 'dslite' } },
    language: 'en',
    pollSeconds: 60,
  });
  assert.equal(odd.components[0].text, 'Internet · DSLITE');
  const ap = buildInternetWidget({ router: { wan: null }, language: 'en', pollSeconds: 60 });
  assertValid(ap, 'access point');
  assert.match(ap.components[0].text, /access point/);
});

test('wifi: one row per network, a button for the guest and IoT Wi-Fi', () => {
  for (const language of LANGUAGES) {
    const content = buildWifiWidget({ wifi, language, pollSeconds: 60 });
    assertValid(content, `wifi ${language}`);
    assert.deepEqual(types(content), ['text', 'status', 'button', 'button']);
  }
  const fr = buildWifiWidget({ wifi, language: 'fr', pollSeconds: 60 });
  assert.equal(fr.components[0].text, '3 réseau(x) Wi-Fi activé(s) sur 6');
  assert.equal(fr.components[1].items[3].label, 'Wi-Fi invité 2,4 GHz');
  assert.equal(fr.components[1].items[3].value, 'Désactivé');
  // Guest Wi-Fi all off: the button turns it on; IoT on: the button turns it off.
  assert.deepEqual(fr.components[2].action, {
    key: WIDGET_ACTIONS.GUEST_WIFI,
    params: { enabled: true },
  });
  assert.equal(fr.components[2].label, 'Activer le Wi-Fi invité');
  assert.deepEqual(fr.components[3].action, {
    key: WIDGET_ACTIONS.IOT_WIFI,
    params: { enabled: false },
  });
  const hostOnly = buildWifiWidget({ wifi: wifi.slice(0, 2), language: 'en', pollSeconds: 60 });
  assert.deepEqual(types(hostOnly), ['text', 'status']);
  const none = buildWifiWidget({ wifi: [], language: 'es', pollSeconds: 60 });
  assertValid(none, 'no wifi');
});

test('network: present, absent, all, empty; connection badges', () => {
  for (const language of LANGUAGES) {
    for (const show of ['present', 'absent', 'all']) {
      const content = buildNetworkWidget({
        clients,
        language,
        now: NOW,
        pollSeconds: 60,
        show,
        created: new Set([PHONE_MAC]),
      });
      assertValid(content, `network ${language} ${show}`);
    }
  }
  const present = buildNetworkWidget({
    clients,
    language: 'fr',
    now: NOW,
    pollSeconds: 60,
    created: new Set([PHONE_MAC]),
  });
  assert.equal(present.components[0].text, '3 connecté(s) sur 4 connu(s)');
  const items = present.components[1].items;
  assert.deepEqual(
    items.map((item) => [item.title, item.badge.text, item.badge.color]),
    [
      ['DS220', 'Filaire', 'info'],
      ['iPhone', 'Invité 2,4 GHz', 'info'],
      ['Pixel-8', '5 GHz', 'success'],
    ],
  );
  assert.equal(items[2].subtitle, `192.168.0.23 · ${PHONE_MAC}`);
  const absent = buildNetworkWidget({
    clients,
    language: 'en',
    now: NOW,
    pollSeconds: 60,
    show: 'absent',
  });
  assert.equal(absent.components[1].items[0].subtitle, '192.168.0.40 · 30 min ago');
  assert.equal(absent.components[1].items[0].badge.text, 'Gone');
  const empty = buildNetworkWidget({ clients: [], language: 'de', now: NOW, pollSeconds: 60 });
  assertValid(empty, 'empty');
  assert.deepEqual(types(empty), ['text', 'text']);
  const many = Array.from({ length: 12 }, (_, i) => ({
    mac: `00:00:00:00:00:${String(i + 10)}`,
    name: `Device ${i}`,
    present: true,
    connection: 'wired',
    network: 'host',
    lastSeen: NOW,
  }));
  const capped = buildNetworkWidget({ clients: many, language: 'en', now: NOW, pollSeconds: 60 });
  assert.equal(capped.components[1].items.length, 8);
  assert.match(capped.components[0].text, /4 more/);
});

test('helpers', () => {
  assert.equal(formatDuration(0.5, 'en'), '0 h 30 min');
  assert.equal(formatDuration(26, 'fr'), '1 j 2 h');
  assert.equal(formatDuration(null, 'en'), '?');
  assert.equal(connectionBadge({ connection: null, network: 'host' }, 'en'), 'Here');
  assert.equal(connectionBadge({ connection: null, network: 'iot' }, 'en'), 'IoT');
  assert.equal(connectionBadge({ connection: 'mlo', network: 'host' }, 'de'), 'MLO');
  assert.deepEqual(readNetworkSettings({ show: 'nope' }), { show: 'present' });
  assertValid(messageContent('x'.repeat(400)), 'message');
});
