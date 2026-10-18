// -----------------------------------------------------------------------------
// Router answers -> plain snapshots. Pure functions, no I/O.
//
// The answers are the `data` of the LuCI forms of the web interface:
//   admin/status?form=all          system, internet link, Wi-Fi networks and
//                                  the clients (wired, Wi-Fi, guest Wi-Fi);
//   admin/status?form=perf         CPU and memory, on firmwares that keep them
//                                  out of `all`;
//   admin/smart_network?form=game_accelerator   the clients again, with the
//                                  ones `all` misses (IoT, MLO) and their signal;
//   admin/network?form=status_ipv4 gateway, DNS, connection type;
//   admin/firmware?form=upgrade    model and firmware version.
//
// Fields vary by model and firmware: an absent value is null, never 0, so
// that nothing is published for it. MAC addresses come in any case and with
// dashes or colons: they are kept as "aa:bb:cc:dd:ee:ff".
// -----------------------------------------------------------------------------

const NETWORKS = ['host', 'guest', 'iot'];
const BANDS = ['2g', '5g', '6g'];
// The key of a Wi-Fi network in the status form, and the form that switches it.
const WIFI_FORM = { host: 'wireless', guest: 'guest', iot: 'iot' };

/**
 * @description A MAC address as "aa:bb:cc:dd:ee:ff", null when it is not one
 * (or is all zeros).
 * @param {unknown} raw - "AA-BB-CC-DD-EE-FF", "aa:bb:…", "aabbcc…".
 * @returns {string|null} The address.
 * @example
 * normalizeMac('A4-83-E7-12-34-56'); // -> 'a4:83:e7:12:34:56'
 */
function normalizeMac(raw) {
  const hex = String(raw ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12 || /^0+$/.test(hex)) {
    return null;
  }
  return hex.match(/../g).join(':');
}

/**
 * @description An IPv4 address, null when absent or 0.0.0.0.
 * @param {unknown} raw - The value.
 * @returns {string|null} The address.
 */
function normalizeIp(raw) {
  const text = String(raw ?? '').trim();
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) && text !== '0.0.0.0' ? text : null;
}

/**
 * @description An IPv6 address without its prefix length, null when absent.
 * @param {unknown} raw - "2a01:…/64".
 * @returns {string|null} The address.
 */
function normalizeIpv6(raw) {
  const text = String(raw ?? '')
    .split('/')[0]
    .trim();
  return text.includes(':') && !/^[:0]*$/.test(text) ? text : null;
}

/**
 * @description A host name the router knows, null for its placeholders.
 * @param {unknown} raw - The name.
 * @returns {string|null} The name.
 */
function normalizeName(raw) {
  const text = String(raw ?? '').trim();
  return text && !/^(-+|\*|unknown|anonymous|n\/a)$/i.test(text) ? text.slice(0, 100) : null;
}

/**
 * @description A number of the answer, null when absent.
 * @param {unknown} raw - The value (number or numeric string).
 * @returns {number|null} The number.
 */
function numberOf(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * @description A load in % out of the router's value (a fraction 0..1 on most
 * firmwares, already a percentage on a few).
 * @param {unknown} raw - The value.
 * @returns {number|null} The load in %, one decimal.
 * @example
 * percentOf(0.07); // -> 7
 */
function percentOf(raw) {
  const value = numberOf(raw);
  if (value === null || value < 0) {
    return null;
  }
  const percent = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.round(percent * 10) / 10);
}

/**
 * @description An "on" / "off" switch of the answer.
 * @param {unknown} raw - "on", "off", true, "yes"…
 * @returns {boolean|null} The state, null when absent.
 */
function onOf(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  return ['on', 'yes', 'true', '1'].includes(String(raw).toLowerCase());
}

/**
 * @description The connection of a client out of its `wire_type` /
 * `deviceTag`: "wired", "2.4G", "5G", "6G", "iot_2.4G", "mlo"…
 * @param {unknown} raw - The value.
 * @returns {{ band: string|null, iot: boolean }} `band`: wired, 2g, 5g, 6g,
 * mlo, or null when unknown.
 */
function connectionOf(raw) {
  const text = String(raw ?? '').toLowerCase();
  const iot = text.startsWith('iot');
  const rest = iot ? text.replace(/^iot_?/, '') : text;
  if (rest === 'wired' || rest === 'wire' || rest === 'lan') {
    return { band: 'wired', iot };
  }
  if (rest.startsWith('2')) {
    return { band: '2g', iot };
  }
  if (rest.startsWith('5')) {
    return { band: '5g', iot };
  }
  if (rest.startsWith('6')) {
    return { band: '6g', iot };
  }
  if (rest === 'mlo') {
    return { band: 'mlo', iot };
  }
  return { band: null, iot };
}

/**
 * @description One client of a status list.
 * @param {object} item - `{ macaddr, ipaddr, hostname, wire_type }`.
 * @param {string} network - host or guest (the list it comes from).
 * @returns {object|null} `{ mac, ip, name, connection, network, signal }`.
 */
function clientOf(item, network) {
  const mac = normalizeMac(item?.macaddr ?? item?.mac);
  if (!mac) {
    return null;
  }
  const { band, iot } = connectionOf(item.wire_type ?? item.type);
  return {
    mac,
    ip: normalizeIp(item.ipaddr ?? item.ip),
    name: normalizeName(item.hostname ?? item.name),
    connection: band,
    network: iot ? 'iot' : band === 'wired' ? 'host' : network,
    signal: null,
  };
}

/**
 * @description The internet link out of the status.
 * @param {object} data - The status `data`.
 * @returns {object|null} `{ status, ip, gateway, uptimeSeconds, connType,
 * dns1, dns2, ipv6 }`, null when the router reports no WAN at all (access
 * point).
 */
function readWan(data) {
  // `conn_type` is a numeric code, not the type: wan_ipv4_conntype is.
  const keys = ['wan_ipv4_ipaddr', 'wan_ipv4_uptime', 'wan_ipv4_conntype'];
  if (!keys.some((key) => key in data)) {
    return null;
  }
  const ip = normalizeIp(data.wan_ipv4_ipaddr);
  return {
    status: ip ? 'connected' : 'disconnected',
    ip,
    gateway: normalizeIp(data.wan_ipv4_gateway),
    uptimeSeconds: ip ? numberOf(data.wan_ipv4_uptime) : null,
    connType: String(data.wan_ipv4_conntype ?? '').toLowerCase() || null,
    dns1: normalizeIp(data.wan_ipv4_pridns),
    dns2: normalizeIp(data.wan_ipv4_snddns),
    ipv6: onOf(data.wan_ipv6_enable) ? normalizeIpv6(data.wan_ipv6_ip6addr) : null,
  };
}

/**
 * @description The Wi-Fi networks the status reports: one entry per
 * `<wireless|guest|iot>_<band>_enable` present.
 * @param {object} data - The status `data`.
 * @returns {Array<{ id: string, network: string, band: string, enabled: boolean }>}
 * The networks, `id` like "guest_5g".
 */
function readWifi(data) {
  const list = [];
  for (const network of NETWORKS) {
    for (const band of BANDS) {
      const enabled = onOf(data[`${WIFI_FORM[network]}_${band}_enable`]);
      if (enabled !== null) {
        list.push({ id: `${network}_${band}`, network, band, enabled });
      }
    }
  }
  return list;
}

/**
 * @description The status snapshot (admin/status?form=all).
 * @param {object} data - The `data` of the answer.
 * @returns {object} `{ cpu, memory, wan, lanIp, lanMac, wifi, clients }`.
 */
function readStatus(data) {
  const source = data && typeof data === 'object' ? data : {};
  const list = (key) => (Array.isArray(source[key]) ? source[key] : []);
  const clients = [
    ...list('access_devices_wired').map((item) => clientOf(item, 'host')),
    ...list('access_devices_wireless_host').map((item) => clientOf(item, 'host')),
    ...list('access_devices_wireless_guest').map((item) => clientOf(item, 'guest')),
  ].filter(Boolean);
  return {
    cpu: percentOf(source.cpu_usage),
    memory: percentOf(source.mem_usage),
    wan: readWan(source),
    lanIp: normalizeIp(source.lan_ipv4_ipaddr),
    lanMac: normalizeMac(source.lan_macaddr),
    wifi: readWifi(source),
    clients,
  };
}

/**
 * @description CPU and memory (admin/status?form=perf).
 * @param {object} data - The `data` of the answer.
 * @returns {{ cpu: number|null, memory: number|null }} The loads.
 */
const readPerf = (data) => ({
  cpu: percentOf(data?.cpu_usage),
  memory: percentOf(data?.mem_usage),
});

/**
 * @description The clients of the smart network form, the ones the status
 * misses included.
 * @param {unknown} data - The `data` of the answer (an array).
 * @returns {Array<object>} The clients, as clientOf.
 */
function readSmartNetwork(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];
  return list
    .map((item) => {
      const mac = normalizeMac(item?.mac);
      if (!mac) {
        return null;
      }
      const { band, iot } = connectionOf(item.deviceTag);
      const signal = numberOf(item.signal);
      return {
        mac,
        ip: normalizeIp(item.ip),
        name: normalizeName(item.deviceName),
        connection: band,
        network: iot ? 'iot' : item.isGuest && band !== 'wired' ? 'guest' : 'host',
        signal: signal !== null && signal !== 0 ? signal : null,
      };
    })
    .filter(Boolean);
}

/**
 * @description The internet settings (admin/network?form=status_ipv4).
 * @param {object} data - The `data` of the answer.
 * @returns {{ gateway, dns1, dns2, connType, netmask }} The settings.
 */
const readIpv4 = (data) => ({
  gateway: normalizeIp(data?.wan_ipv4_gateway),
  dns1: normalizeIp(data?.wan_ipv4_pridns),
  dns2: normalizeIp(data?.wan_ipv4_snddns),
  connType: String(data?.wan_ipv4_conntype ?? '').toLowerCase() || null,
  netmask: normalizeIp(data?.wan_ipv4_netmask),
});

/**
 * @description Model and firmware (admin/firmware?form=upgrade).
 * @param {object} data - The `data` of the answer.
 * @returns {{ model: string|null, hardware: string|null, firmware: string|null }}
 * `model` like "Archer AX55 v1.0".
 */
function readFirmware(data) {
  const text = (value) => (String(value ?? '').trim() ? String(value).trim().slice(0, 100) : null);
  return {
    model: text(data?.model) ?? text(data?.hardware_version),
    hardware: text(data?.hardware_version),
    firmware: text(data?.firmware_version),
  };
}

/**
 * @description Merge the smart network clients into the status ones: the
 * status wins for what it knows, the smart network adds the clients it misses
 * and the signal.
 * @param {Array<object>} status - Clients of the status.
 * @param {Array<object>} smart - Clients of the smart network.
 * @returns {Array<object>} The clients.
 */
function mergeClients(status, smart) {
  const byMac = new Map(status.map((client) => [client.mac, { ...client }]));
  for (const client of smart) {
    const known = byMac.get(client.mac);
    if (!known) {
      byMac.set(client.mac, { ...client });
      continue;
    }
    known.ip = known.ip ?? client.ip;
    known.name = known.name ?? client.name;
    known.connection = known.connection ?? client.connection;
    known.signal = client.signal ?? known.signal;
  }
  return [...byMac.values()];
}

export {
  NETWORKS,
  BANDS,
  WIFI_FORM,
  normalizeMac,
  normalizeIp,
  normalizeIpv6,
  normalizeName,
  numberOf,
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
};
