// Router answers -> snapshots, on the shapes real firmwares send (captures of
// the tplinkrouterc6u tests: Archer C6U, AX, BE; Mercusys).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMac,
  normalizeIp,
  normalizeIpv6,
  normalizeName,
  percentOf,
  onOf,
  connectionOf,
  readWan,
  readWifi,
  readStatus,
  readPerf,
  readSmartNetwork,
  readIpv4,
  readFirmware,
  mergeClients,
} from '../src/read.js';
import { defaultState, PHONE_MAC, NAS_MAC, TV_MAC, PLUG_MAC } from './helpers/fixtures.js';

test('MAC, IP and names: the shapes and placeholders of the firmwares', () => {
  assert.equal(normalizeMac('A4-83-E7-12-34-56'), 'a4:83:e7:12:34:56');
  assert.equal(normalizeMac('a4:83:e7:12:34:56'), 'a4:83:e7:12:34:56');
  assert.equal(normalizeMac('00-00-00-00-00-00'), null);
  assert.equal(normalizeMac('nope'), null);
  assert.equal(normalizeIp('192.168.0.23'), '192.168.0.23');
  assert.equal(normalizeIp('0.0.0.0'), null);
  assert.equal(normalizeIp('Unknown'), null);
  assert.equal(normalizeIpv6('2a01:cb00::1/64'), '2a01:cb00::1');
  assert.equal(normalizeIpv6('::'), null);
  assert.equal(normalizeName('UNKNOWN'), null);
  assert.equal(normalizeName('---'), null);
  assert.equal(normalizeName(' Pixel-8 '), 'Pixel-8');
});

test('loads: a fraction on most firmwares, a percentage on a few', () => {
  assert.equal(percentOf(0.28), 28);
  assert.equal(percentOf('0.075'), 7.5);
  assert.equal(percentOf(43), 43);
  assert.equal(percentOf(null), null);
  assert.equal(percentOf(''), null);
  assert.equal(onOf('on'), true);
  assert.equal(onOf('Off'), false);
  assert.equal(onOf(undefined), null);
});

test('connections: wired, bands, IoT and MLO', () => {
  assert.deepEqual(connectionOf('wired'), { band: 'wired', iot: false });
  assert.deepEqual(connectionOf('2.4G'), { band: '2g', iot: false });
  assert.deepEqual(connectionOf('5G'), { band: '5g', iot: false });
  assert.deepEqual(connectionOf('6G'), { band: '6g', iot: false });
  assert.deepEqual(connectionOf('iot_2.4G'), { band: '2g', iot: true });
  assert.deepEqual(connectionOf('mlo'), { band: 'mlo', iot: false });
  assert.deepEqual(connectionOf(undefined), { band: null, iot: false });
});

test('the status: loads, internet link, Wi-Fi networks and clients', () => {
  const status = readStatus(defaultState().status);
  assert.equal(status.cpu, 28);
  assert.equal(status.memory, 43);
  assert.equal(status.lanIp, '192.168.0.1');
  assert.equal(status.lanMac, '50:91:e3:00:00:01');
  assert.deepEqual(status.wan, {
    status: 'connected',
    ip: '90.12.34.56',
    gateway: '90.12.34.1',
    uptimeSeconds: 93600,
    connType: 'pppoe',
    dns1: '80.10.246.2',
    dns2: '80.10.246.129',
    ipv6: '2a01:cb00:1234:5600::1',
  });
  assert.deepEqual(
    status.wifi.map((w) => [w.id, w.enabled]),
    [
      ['host_2g', true],
      ['host_5g', true],
      ['guest_2g', false],
      ['guest_5g', false],
    ],
  );
  assert.deepEqual(
    status.clients.map((c) => [c.mac, c.name, c.connection, c.network]),
    [
      [NAS_MAC, 'DS220', 'wired', 'host'],
      [PHONE_MAC, 'Pixel-8', '5g', 'host'],
      [TV_MAC, null, '2g', 'host'],
    ],
  );
  // Never the Wi-Fi keys the status carries.
  assert.doesNotMatch(JSON.stringify(status), /do-not-leak/);
});

test('the internet link: down without address, absent in access point mode', () => {
  assert.equal(readWan({ wan_ipv4_ipaddr: '0.0.0.0', wan_ipv4_uptime: 0 }).status, 'disconnected');
  assert.equal(readWan({ wan_ipv4_ipaddr: '0.0.0.0', wan_ipv4_uptime: 5 }).uptimeSeconds, null);
  assert.equal(readWan({ conn_type: '1', lan_ipv4_ipaddr: '192.168.0.2' }), null);
  assert.equal(readWan({ wan_ipv4_ipaddr: '1.2.3.4', wan_ipv6_enable: 'off' }).ipv6, null);
  assert.equal(readWan({ wan_ipv4_ipaddr: '1.2.3.4', conn_type: '1' }).connType, null);
});

test('Wi-Fi networks: only the ones the router reports, IoT and 6 GHz included', () => {
  assert.deepEqual(
    readWifi({ wireless_6g_enable: 'on', iot_2g_enable: 'off' }).map((w) => w.id),
    ['host_6g', 'iot_2g'],
  );
  assert.deepEqual(readWifi({}), []);
});

test('the guest list makes guests; perf, smart network, internet settings and firmware', () => {
  const status = readStatus({
    access_devices_wireless_guest: [{ macaddr: '6E-11-22-33-44-55', wire_type: '5G' }],
  });
  assert.equal(status.clients[0].network, 'guest');
  assert.equal(status.wan, null);
  assert.deepEqual(readPerf({ cpu_usage: 0.11, mem_usage: 0.5 }), { cpu: 11, memory: 50 });
  const smart = readSmartNetwork(defaultState().smart);
  assert.deepEqual(
    smart.map((c) => [c.mac, c.connection, c.network, c.signal]),
    [
      [PHONE_MAC, '5g', 'host', -52],
      [PLUG_MAC, '2g', 'iot', null],
    ],
  );
  assert.deepEqual(readSmartNetwork({ list: [{ mac: PLUG_MAC }] }).length, 1);
  assert.deepEqual(readSmartNetwork(null), []);
  assert.deepEqual(readIpv4(defaultState().ipv4), {
    gateway: '90.12.34.1',
    dns1: '80.10.246.2',
    dns2: '80.10.246.129',
    connType: 'pppoe',
    netmask: '255.255.255.255',
  });
  assert.deepEqual(readFirmware(defaultState().firmware), {
    model: 'Archer AX55 v1.0',
    hardware: 'Archer AX55',
    firmware: '1.1.3 Build 20230411 rel.48593(5553)',
  });
  assert.equal(readFirmware({ hardware_version: 'MR80X' }).model, 'MR80X');
});

test('merging: the status wins, the smart network adds the clients it misses', () => {
  const merged = mergeClients(
    readStatus(defaultState().status).clients,
    readSmartNetwork(defaultState().smart),
  );
  assert.equal(merged.length, 4);
  assert.equal(merged.find((c) => c.mac === PHONE_MAC).signal, -52);
  assert.equal(merged.find((c) => c.mac === PLUG_MAC).network, 'iot');
});
