// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The four widgets on a made-up home network (fixed date): an Archer AX55
// connected for two days, its Wi-Fi networks with the guest Wi-Fi off, and
// the devices connected right now, one of them on the guest Wi-Fi.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildInternetWidget, buildWifiWidget, buildNetworkWidget } =
  await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Sunday 18 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-18T18:00:00Z');
const MINUTE = 60000;

const router = {
  identity: {
    model: 'Archer AX55 v1.0',
    firmware: '1.1.3 Build 20230411',
    lanIp: '192.168.0.1',
  },
  cpu: 14,
  memory: 52.5,
  wan: {
    status: 'connected',
    ip: '90.12.34.56',
    gateway: '90.12.34.1',
    connType: 'pppoe',
    dns1: '80.10.246.2',
    dns2: '80.10.246.129',
    ipv6: '2a01:cb00:1234:5600::1',
  },
  internetUptimeHours: 50.4,
  clientsOnline: 12,
  counts: { wifi: 8, wired: 3, guest: 1 },
};
const wifi = [
  { id: 'host_2g', network: 'host', band: '2g', enabled: true },
  { id: 'host_5g', network: 'host', band: '5g', enabled: true },
  { id: 'guest_2g', network: 'guest', band: '2g', enabled: false },
  { id: 'guest_5g', network: 'guest', band: '5g', enabled: false },
];
const client = (mac, name, ip, connection, network, minutes, present = true) => ({
  mac,
  name,
  ip,
  connection,
  network,
  present,
  lastSeen: NOW - minutes * MINUTE,
});
const clients = [
  client('a4:83:e7:12:34:56', 'Pixel-8', '192.168.0.23', '5g', 'host', 0),
  client('3c:2a:f4:01:02:03', 'Living-room-TV', '192.168.0.40', 'wired', 'host', 0),
  client('00:11:32:aa:bb:cc', 'DS220', '192.168.0.10', 'wired', 'host', 0),
  client('f0:18:98:44:55:66', 'MacBook-Claire', '192.168.0.31', '5g', 'host', 0),
  client('b8:27:eb:77:88:99', 'gladys', '192.168.0.5', 'wired', 'host', 0),
  client('24:0a:c4:10:20:30', 'Boiler-ESP32', '192.168.0.62', '2g', 'host', 0),
  client('6e:11:22:33:44:55', 'iPhone-Tom', '192.168.0.120', '2g', 'guest', 0),
  client('44:65:0d:ab:cd:ef', null, '192.168.0.88', '2g', 'host', 0),
  client('9c:b6:d0:11:22:33', 'iPad', '192.168.0.27', '5g', 'host', 95, false),
];
const created = new Set(['a4:83:e7:12:34:56', '9c:b6:d0:11:22:33', 'f0:18:98:44:55:66']);

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    overview: buildOverviewWidget({
      router,
      language,
      now: NOW,
      fetchedAt: NOW - 20000,
      pollSeconds: 60,
      pauseMinutes: 20,
    }),
    internet: buildInternetWidget({ router, language, pollSeconds: 60 }),
    wifi: buildWifiWidget({ wifi, language, pollSeconds: 60 }),
    network: buildNetworkWidget({ clients, language, now: NOW, pollSeconds: 60, created }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
