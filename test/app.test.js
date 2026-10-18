// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake TP-Link router.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  tplinkRouter,
  clientEntry,
  silent,
  knownPath,
  NOW,
  MINUTE,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
  GUEST_MAC,
  PLUG_MAC,
} from './helpers/fixtures.js';

const CONFIG = { url: '192.168.0.1', password: 'secret' };
const PREFIX = 'ext:test-integration';
const ROUTER = `${PREFIX}:router:main`;
const HOST_2G = `${PREFIX}:wifi:host_2g`;
const HOST_5G = `${PREFIX}:wifi:host_5g`;
const GUEST_2G = `${PREFIX}:wifi:guest_2g`;
const GUEST_5G = `${PREFIX}:wifi:guest_5g`;
const id = (mac) => `${PREFIX}:client:${mac.replace(/:/g, '')}`;
const PHONE = id(PHONE_MAC);
const NAS = id(NAS_MAC);

/**
 * @description The integration, connected to a fake Gladys and a fake router.
 * @param {object} [options] - `{ config, fake, path }`.
 * @returns {Promise<object>} `{ gladys, app, fake, clock, path }`.
 */
async function startApp({ config = CONFIG, fake = tplinkRouter(), path = knownPath() } = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    request: fake,
    knownHostsPath: path,
    now: () => clock.now,
    logger: silent,
  });
  await gladys.connect();
  return { gladys, app, fake, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

/**
 * @description The next reading, `seconds` later.
 * @param {object} context - `{ app, clock }`.
 * @param {number} seconds - Seconds to move the clock.
 * @returns {Promise<void>}
 */
async function nextRound({ app, clock }, seconds = 60) {
  clock.now += seconds * 1000;
  await app.watcher.round();
}

test('the router, its Wi-Fi networks and the named clients are offered, accepted by the host API checks', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  // Clients with a name only (default): NAS, phone, plug; not the TV ("UNKNOWN").
  assert.deepEqual(ids, [ROUTER, HOST_2G, HOST_5G, GUEST_2G, GUEST_5G, NAS, PHONE, id(PLUG_MAC)]);
  assert.ok(gladys.fake.discoveredDevices.every((device) => device.should_poll === false));
  const router = gladys.fake.discoveredDevices[0];
  assert.equal(router.name, 'TP-Link Archer AX55 v1.0');
  assert.deepEqual(
    router.features.map((f) => f.external_id.split(':').pop()),
    [
      'cpu',
      'memory',
      'internet',
      'wan_ip',
      'internet_uptime',
      'clients',
      'clients_wifi',
      'clients_wired',
      'clients_guest',
      'firmware',
    ],
  );
  assert.equal(gladys.fake.discoveredDevices[3].name, 'Guest Wi-Fi 2.4 GHz');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Archer AX55 v1.0 : Internet connecté, 4 appareil(s) sur le réseau.',
  );
  assert.equal(gladys.fake.states.length, 0, 'nothing before a device exists');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
  assert.equal(fake.logins, 1, 'one session for the whole reading');
  assert.equal(fake.sessions(), 0, 'logged out after the reading: the web page is free');
});

test('creating the router publishes its states; a round reads only what moves', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  assert.equal(gladys.fake.lastState(`${ROUTER}:cpu`), 28);
  assert.equal(gladys.fake.lastState(`${ROUTER}:memory`), 43);
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Connected');
  assert.equal(gladys.fake.lastState(`${ROUTER}:wan_ip`), '90.12.34.56');
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet_uptime`), 26);
  assert.equal(gladys.fake.lastState(`${ROUTER}:clients`), 4);
  assert.equal(gladys.fake.lastState(`${ROUTER}:clients_wifi`), 2);
  assert.equal(gladys.fake.lastState(`${ROUTER}:clients_wired`), 1);
  assert.equal(gladys.fake.lastState(`${ROUTER}:clients_guest`), 0);
  assert.equal(gladys.fake.lastState(`${ROUTER}:firmware`), '1.1.3 Build 20230411 rel.48593(5553)');
  const firmwareReads = fake.count('admin/firmware?form=upgrade');
  await nextRound(context);
  assert.equal(fake.count('admin/firmware?form=upgrade'), firmwareReads, 'the slow forms wait');
  await nextRound(context, 600);
  assert.equal(fake.count('admin/firmware?form=upgrade'), firmwareReads + 1);
  // The perf form is only read when the status lacks the loads.
  assert.equal(fake.count('admin/status?form=perf'), 0);
});

test('a firmware without loads in the status reads the perf form', async (t) => {
  const fake = tplinkRouter();
  delete fake.state.status.cpu_usage;
  delete fake.state.status.mem_usage;
  const { gladys } = await startApp({ fake });
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  assert.equal(gladys.fake.lastState(`${ROUTER}:cpu`), 11);
  assert.equal(gladys.fake.lastState(`${ROUTER}:memory`), 50);
});

test('internet down then back, and a new public address, fire one event per transition', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  fake.state.status.wan_ipv4_ipaddr = '0.0.0.0';
  await nextRound(context);
  await nextRound(context);
  fake.state.status.wan_ipv4_ipaddr = '90.12.34.99';
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.INTERNET_STATUS_CHANGED);
  assert.deepEqual(
    events.map((event) => event.data.status),
    ['disconnected', 'connected'],
  );
  assert.equal(events[1].data.wan_ip, '90.12.34.99');
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Connected');
  // Down then back with another address: no "address changed" (no known pair).
  assert.equal(eventsOf(gladys, TRIGGERS.WAN_IP_CHANGED).length, 0);
  fake.state.status.wan_ipv4_ipaddr = '90.12.34.100';
  await nextRound(context);
  const changed = eventsOf(gladys, TRIGGERS.WAN_IP_CHANGED);
  assert.equal(changed.length, 1);
  assert.deepEqual(
    [changed[0].data.wan_ip, changed[0].data.previous_wan_ip],
    ['90.12.34.100', '90.12.34.99'],
  );
});

test('presence: arrival at once, departure after the absence delay, heartbeat while present', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  const removePhone = () => {
    fake.state.status.access_devices_wireless_host =
      fake.state.status.access_devices_wireless_host.filter(
        (entry) => entry.macaddr !== PHONE_MAC.toUpperCase().replace(/:/g, '-'),
      );
    fake.state.smart = fake.state.smart.filter((entry) => entry.mac !== PHONE_MAC);
  };
  removePhone();
  await nextRound(context, 120);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1, 'within the absence delay');
  await nextRound(context, 240);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 0);
  fake.state.status.access_devices_wireless_host.push(
    clientEntry(PHONE_MAC, { ipaddr: '192.168.0.23', hostname: 'Pixel-8', wire_type: '5G' }),
  );
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  const events = eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE);
  assert.deepEqual(
    events.map((event) => [event.data.device, event.data.event]),
    [
      [PHONE, 'left'],
      [PHONE, 'arrived'],
    ],
  );
  assert.equal(events[1].data.connection, 'Wi-Fi 5 GHz');
});

test('a never-seen MAC fires "new device", once, never after a restart', async (t) => {
  const path = knownPath();
  const context = await startApp({ path });
  const { gladys, fake } = context;
  fake.state.status.access_devices_wireless_guest.push(
    clientEntry(GUEST_MAC, { ipaddr: '192.168.0.120', hostname: 'iPhone', wire_type: '2.4G' }),
  );
  await nextRound(context);
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.NEW_NETWORK_DEVICE);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.mac, GUEST_MAC);
  assert.equal(events[0].data.network, 'guest');
  assert.equal(events[0].data.medium, 'wifi');
  assert.equal(events[0].data.connection, 'Guest Wi-Fi 2.4 GHz');
  await gladys.fake.shutdown();

  const again = await startApp({ path, fake });
  t.after(() => again.gladys.fake.shutdown());
  await nextRound(again);
  assert.equal(eventsOf(again.gladys, TRIGGERS.NEW_NETWORK_DEVICE).length, 0);
});

test('a Wi-Fi switch turns the network on, and its state follows', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = await created(gladys, GUEST_5G);
  assert.equal(gladys.fake.lastState(`${GUEST_5G}:enabled`), 0);
  const ack = await gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(fake.writes, [{ form: 'guest_5g', enable: 'on' }]);
  assert.equal(gladys.fake.lastState(`${GUEST_5G}:enabled`), 1);
  const router = await created(gladys, ROUTER);
  const refused = await gladys.fake.setValue(router, router.features[0], 1);
  assert.equal(refused.success, false);
});

test('scene actions: read the status, switch the guest Wi-Fi on every band, reboot', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const status = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_STATUS, {});
  assert.equal(status.success, true, status.error);
  assert.equal(status.data.outputs.wan_ip, '90.12.34.56');
  assert.equal(status.data.outputs.devices_present, 4);
  assert.equal(status.data.outputs.model, 'Archer AX55 v1.0');

  const on = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_WIFI, {
    network: 'guest',
    state: 'on',
  });
  assert.equal(on.success, true, on.error);
  assert.equal(on.data.outputs.switched, 2);
  assert.deepEqual(
    fake.writes.map((write) => write.form),
    ['guest_2g', 'guest_5g'],
  );
  const one = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_WIFI, {
    network: 'host',
    band: '5g',
    state: 'off',
  });
  assert.equal(one.data.outputs.switched, 1);
  const missing = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_WIFI, {
    network: 'iot',
    state: 'on',
  });
  assert.equal(missing.success, false, 'no IoT network on this router');

  const reboot = await gladys.fake.sceneAction(SCENE_ACTIONS.REBOOT, {});
  assert.equal(reboot.success, true, reboot.error);
  assert.equal(fake.rebooted, 1);
});

test('widgets: valid contents in every language; actions pause, resume, reboot, guest Wi-Fi', async (t) => {
  const context = await startApp();
  const { gladys, fake, app } = context;
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const content = await gladys.fake.widgetGet(key, { language });
      assert.equal(content.success, true, content.error);
      assert.deepEqual(validateWidgetContent(content.data.content), [], `${key} ${language}`);
    }
  }
  const paused = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.PAUSE);
  assert.match(paused.data.message.en, /paused for 20 min/);
  assert.match(gladys.fake.connectionStatus.message.fr, /en pause/);
  const logins = fake.logins;
  await nextRound(context);
  assert.equal(fake.logins, logins, 'no reading during the pause');
  assert.ok(app.watcher.pausedUntil());
  const resumed = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.RESUME);
  assert.equal(resumed.data.message.en, 'Readings resumed.');
  assert.equal(fake.logins, logins + 1);

  const guest = await gladys.fake.widgetAction(WIDGETS.WIFI, WIDGET_ACTIONS.GUEST_WIFI, {
    enabled: true,
  });
  assert.equal(guest.data.message.fr, '2 réseau(x) Wi-Fi activé(s).');
  const iot = await gladys.fake.widgetAction(WIDGETS.WIFI, WIDGET_ACTIONS.IOT_WIFI, {
    enabled: true,
  });
  assert.match(iot.data.message.en, /no such Wi-Fi/);
  const reboot = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.REBOOT);
  assert.match(reboot.data.message.en, /rebooting/);
  assert.equal(fake.rebooted, 1);
});

test('a pause ends by itself, without marking the present clients absent', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  await gladys.fake.action(ACTIONS.PAUSE);
  const logins = fake.logins;
  context.clock.now += 25 * MINUTE;
  await context.app.watcher.round();
  assert.equal(fake.logins, logins + 1, 'read again after the pause');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  assert.equal(eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE).length, 0);
  assert.equal(context.app.watcher.pausedUntil(), null);
});

test('configuration actions: test the connection, pause and resume, forget the devices', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const tested = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(tested.success, true, tested.error);
  assert.equal(
    tested.data.message.fr,
    'Connecté à TP-Link Archer AX55 v1.0 (micrologiciel 1.1.3 Build 20230411 rel.48593(5553)).',
  );
  const paused = await gladys.fake.action(ACTIONS.PAUSE);
  assert.match(paused.data.message.de, /pausiert/);
  const resumed = await gladys.fake.action(ACTIONS.RESUME);
  assert.equal(resumed.data.message.es, 'Lecturas reanudadas.');
  const forgotten = await gladys.fake.action(ACTIONS.FORGET_DEVICES);
  assert.match(forgotten.data.message.en, /forgotten/);
});

test('a wrong password: a clear status, no second login for 15 minutes', async (t) => {
  const fake = tplinkRouter({ password: 'other' });
  const context = await startApp({ fake });
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the password/);
  await nextRound(context);
  await nextRound(context);
  assert.equal(fake.logins, 1);
  const widget = await gladys.fake.widgetGet(WIDGETS.OVERVIEW, { language: 'en' });
  assert.match(widget.data.content.components[0].text, /not been read yet/);
});

test('an unreachable router, then back', async (t) => {
  const fake = tplinkRouter();
  fake.down = true;
  const context = await startApp({ fake });
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /does not answer at http:\/\/192\.168\.0\.1/,
  );
  fake.down = false;
  await nextRound(context);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('no credentials: a message, no request', async (t) => {
  const fake = tplinkRouter();
  const { gladys } = await startApp({ config: {}, fake });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /address of the router/);
  assert.equal(fake.requests.length, 0);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('a configuration change logs in again and starts from a new baseline', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.configUpdated({ ...CONFIG, network_devices: 'all' });
  assert.ok(gladys.fake.discoveredDevices.some((device) => device.external_id === id(TV_MAC)));
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.ok(fake.logins >= 2);
});

test('the language of the texts follows the dashboard, or the setting', async (t) => {
  const { gladys, app } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.widgetGet(WIDGETS.OVERVIEW, { language: 'de' });
  await gladys.fake.scanRequest();
  assert.equal(
    gladys.fake.discoveredDevices.find((d) => d.external_id === GUEST_2G).name,
    'Gast-WLAN 2,4 GHz',
  );
  assert.equal(app.getConfig().language, 'auto');
});
