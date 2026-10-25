import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, NETWORK_SHOW } from '../src/widgets.js';
import { NETWORKS, BANDS } from '../src/read.js';
import {
  POLL_INTERVAL,
  PAUSE_MINUTES,
  ABSENCE_DELAY,
  NETWORK_DEVICES,
  AUTO_LANGUAGE,
} from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  // The name of the Home Assistant integration: the tracker of the community matches it.
  assert.equal(manifest.name, 'TP-Link / Mercusys Router');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-tplink-router:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-tplink-router/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-tplink-router');
});

test('declares the local transport only: the web interface of the router, on the LAN', () => {
  assert.deepEqual(manifest.transports, ['local']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  // No outside host in the code (comments aside): only the address the user typed.
  const code = [source('../src/tplink-api.js'), source('../src/crypto.js')]
    .join('\n')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
  assert.doesNotMatch(code, /https:\/\/[a-z]/);
});

test('requires Gladys 5.3.0 (catalog keywords); no extra permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['network']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // No widget button with a form: those need Gladys 5.2.0.
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('mirrors the bounds and values of the code', () => {
  const config = byKey(manifest.config_schema);
  ['min', 'max', 'default'].forEach((bound) => {
    assert.equal(config.get('poll_interval')[bound], POLL_INTERVAL[bound]);
    assert.equal(config.get('pause_minutes')[bound], PAUSE_MINUTES[bound]);
    assert.equal(config.get('absence_delay')[bound], ABSENCE_DELAY[bound]);
  });
  assert.equal(config.get('password').type, 'secret');
  assert.equal(config.get('username').type, 'string');
  assert.equal(config.get('username').required, false, 'admin when empty');
  assert.equal(config.get('verify_tls').default, false);
  assert.deepEqual(values(config.get('network_devices')), NETWORK_DEVICES);
  const network = byKey(byKey(manifest.widgets).get(WIDGETS.NETWORK).settings);
  assert.deepEqual(values(network.get('show')), NETWORK_SHOW);
  const wifi = byKey(byKey(manifest.scene_actions).get('set_wifi').fields);
  assert.deepEqual(values(wifi.get('network')), NETWORKS);
  assert.deepEqual(values(wifi.get('band')), ['all', ...BANDS]);
  assert.deepEqual(values(wifi.get('state')), ['on', 'off']);
  const fresh = byKey(byKey(manifest.scene_triggers).get('new_network_device').fields);
  assert.deepEqual(values(fresh.get('network')), NETWORKS);
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of manifest.scene_actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  // The store refuses a manifest of 100 KB or more.
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  // The cover: 800 x 534 JPEG under 150 KB (dimensions checked in i18n.test.js).
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog fields of Gladys 5.3: search keywords, available worldwide', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.ok(Array.isArray(manifest.keywords), 'keywords');
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10, '1 to 10 keywords');
  for (const keyword of manifest.keywords) {
    assert.ok(keyword.length <= 30 && keyword.trim().length >= 2, keyword);
  }
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'the name is already searched');
  // No `countries`: usable anywhere, the catalog shows it in every country.
  assert.equal(manifest.countries, undefined);
});
