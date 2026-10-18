// -----------------------------------------------------------------------------
// Scene trigger payloads and scene action outputs.
//
// Event data is flat (at most 30 keys, scalar values, strings of at most
// 1,000 characters); a field of a trigger filters on the data key of the same
// name (`device`, `event`, `status`, `medium`, `network`). Outputs are the
// declared ones only, never null: -1 for an unknown number, "" for an unknown
// text.
// -----------------------------------------------------------------------------

import { idsOf, macId, clientName, modelOf, DEVICE_TYPES } from './device.js';
import { t, formatNumber } from './i18n.js';

const TRIGGERS = {
  INTERNET_STATUS_CHANGED: 'internet_status_changed',
  WAN_IP_CHANGED: 'wan_ip_changed',
  NETWORK_DEVICE_PRESENCE: 'network_device_presence',
  NEW_NETWORK_DEVICE: 'new_network_device',
};

const MAX_STRING = 1000;
const text = (value) => String(value ?? '').slice(0, MAX_STRING);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : -1);
const mediumOf = (connection) =>
  connection === 'wired' ? 'wired' : connection ? 'wifi' : 'unknown';

/**
 * @description The short name of a connection: "Guest Wi-Fi 5 GHz", "Wired".
 * @param {string|null} connection - wired, 2g, 5g, 6g, mlo.
 * @param {string} network - host, guest or iot.
 * @param {string} language - The language.
 * @returns {string} The name, "" when unknown.
 */
function connectionName(connection, network, language) {
  if (connection === 'wired') {
    return t('connectionWired', language);
  }
  const kind = ['guest', 'iot'].includes(network) ? network : 'host';
  if (!connection) {
    return kind === 'host' ? '' : t(`connectionNetwork_${kind}`, language);
  }
  return t(`wifiDeviceName_${kind}`, language, { band: t(`band_${connection}`, language) });
}

/**
 * @description The event of the internet link that went down or came back.
 * @param {{ status: string, previous: string }} change - The transition.
 * @param {object|null} wan - The internet link of now.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function internetEvent(change, wan, language) {
  return {
    key: TRIGGERS.INTERNET_STATUS_CHANGED,
    data: {
      status: change.status,
      previous_status: change.previous,
      wan_ip: text(wan?.ip),
      summary: text(t(`summaryInternet_${change.status}`, language, { ip: wan?.ip ?? '?' })),
    },
  };
}

/**
 * @description The event of a new public address.
 * @param {{ ip: string, previous: string }} change - The transition.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function wanIpEvent(change, language) {
  return {
    key: TRIGGERS.WAN_IP_CHANGED,
    data: {
      wan_ip: text(change.ip),
      previous_wan_ip: text(change.previous),
      summary: text(t('summaryWanIp', language, { ip: change.ip, previous: change.previous })),
    },
  };
}

/**
 * @description The event of a client that arrived or left.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ client: object, event: string }} change - The transition.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function presenceEvent(gladys, { client, event }, language) {
  const name = clientName(client);
  return {
    key: TRIGGERS.NETWORK_DEVICE_PRESENCE,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.CLIENT, macId(client.mac)).device,
      device_name: text(name),
      event,
      mac: client.mac,
      ip: text(client.ip),
      connection: text(connectionName(client.connection, client.network, language)),
      summary: text(t(`summaryPresence_${event}`, language, { name })),
    },
  };
}

/**
 * @description The event of a MAC address never met before.
 * @param {{ client: object }} change - The new client.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function newClientEvent({ client }, language) {
  const connection = connectionName(client.connection, client.network, language);
  return {
    key: TRIGGERS.NEW_NETWORK_DEVICE,
    data: {
      mac: client.mac,
      ip: text(client.ip),
      name: text(client.name),
      medium: mediumOf(client.connection),
      network: ['guest', 'iot'].includes(client.network) ? client.network : 'host',
      connection: text(connection),
      summary: text(
        t('summaryNewClient', language, {
          name: clientName(client),
          ip: client.ip ?? '?',
          connection: connection || '?',
        }),
      ),
    },
  };
}

/**
 * @description The outputs of the "read the status" scene action.
 * @param {{ router: object, clients: Array<object> }} snapshot - The snapshots.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function statusOutputs({ router, clients }, language) {
  const present = clients.filter((c) => c.present).length;
  const status = router?.wan?.status ?? 'unknown';
  const load =
    typeof router?.cpu === 'number' || typeof router?.memory === 'number'
      ? t('summaryStatus', language, {
          cpu: formatNumber(router?.cpu, language, 0),
          memory: formatNumber(router?.memory, language, 0),
        })
      : '';
  const summary = [
    load,
    t(`summaryStatusInternet_${status}`, language, { ip: router?.wan?.ip ?? '?' }),
    t('summaryStatusClients', language, {
      count: present,
      guests: router?.counts?.guest ?? 0,
    }),
  ]
    .filter(Boolean)
    .join(' ');
  return {
    cpu: number(router?.cpu),
    memory: number(router?.memory),
    internet: status,
    wan_ip: text(router?.wan?.ip),
    internet_uptime_hours: number(router?.internetUptimeHours),
    devices_present: present,
    guests: number(router?.counts?.guest),
    model: text(modelOf(router?.identity)),
    firmware: text(router?.identity?.firmware),
    summary: text(summary),
  };
}

/**
 * @description The outputs of the "switch Wi-Fi networks" scene action.
 * @param {Array<object>} switched - The networks switched.
 * @param {boolean} enabled - On or off.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function wifiOutputs(switched, enabled, language) {
  return {
    switched: switched.length,
    summary: text(
      t(enabled ? 'summaryWifiOn' : 'summaryWifiOff', language, {
        count: switched.length,
      }),
    ),
  };
}

export {
  TRIGGERS,
  connectionName,
  mediumOf,
  internetEvent,
  wanIpEvent,
  presenceEvent,
  newClientEvent,
  statusOutputs,
  wifiOutputs,
};
