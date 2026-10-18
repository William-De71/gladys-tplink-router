// -----------------------------------------------------------------------------
// Dashboard widgets of the TP-Link / Mercusys Router integration.
//
//   - `overview`  the router at a glance: CPU and memory gauges, connected
//                 clients and guests tiles, the internet link, firmware and
//                 readings, and two buttons (pause the readings to use the
//                 web page of the router, or resume them; reboot, with a
//                 confirmation);
//   - `internet`  the internet link: time connected, status, WAN address,
//                 gateway, DNS servers, IPv6 address;
//   - `wifi`      the Wi-Fi networks and their state, with a button to turn
//                 the guest (and IoT) Wi-Fi on or off on every band;
//   - `network`   the clients connected now (or the ones gone), with their
//                 connection (wired, Wi-Fi band, guest).
//
// The contents come from the snapshots of the last reading: a widget never
// costs a router call. Every text exists in the four languages (the content
// is cached per language and units). Content budget of a card: 8
// components, 1 main one (card-list), 6 tiles, 2 texts, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { t, hasText, ago } from './i18n.js';
import { clientName, modelOf, wifiName } from './device.js';

const WIDGETS = { OVERVIEW: 'overview', INTERNET: 'internet', WIFI: 'wifi', NETWORK: 'network' };
const WIDGET_ACTIONS = {
  PAUSE: 'pause',
  RESUME: 'resume',
  REBOOT: 'reboot',
  GUEST_WIFI: 'guest_wifi',
  IOT_WIFI: 'iot_wifi',
};

const NETWORK_SHOW = ['present', 'absent', 'all'];
const DEFAULT_SHOW = 'present';
const MAX_LIST_ITEMS = 8;
const MAX_STATUS_ROWS = 9;
const TTL = { min: 10, max: 3600, message: 60 };

const INTERNET_COLORS = {
  connected: 'success',
  disconnected: 'danger',
  unknown: 'neutral',
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('The router has not been read yet');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

const ttlOf = (pollSeconds) => Math.min(TTL.max, Math.max(TTL.min, Math.round(pollSeconds)));

/**
 * @description A tile color for a load in %.
 * @param {number|null} value - The load.
 * @returns {string} The color.
 */
function loadColor(value) {
  if (typeof value !== 'number') {
    return 'neutral';
  }
  if (value >= 90) {
    return 'danger';
  }
  return value >= 75 ? 'warning' : 'success';
}

/**
 * @description "3 d 4 h", or "5 h 12 min" below a day, out of hours.
 * @param {number|null} hours - The duration.
 * @param {string} language - The language.
 * @returns {string} The text, "?" when unknown.
 */
function formatDuration(hours, language) {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) {
    return '?';
  }
  const minutes = Math.floor(hours * 60);
  if (minutes < 24 * 60) {
    return t('durationHours', language, { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  }
  return t('durationDays', language, {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
  });
}

/**
 * @description "Connected · 90.12.34.56" for the internet link.
 * @param {object|null} wan - The internet link snapshot.
 * @param {string} language - The language.
 * @returns {string} The value.
 */
function internetValue(wan, language) {
  const status = t(`internet_${wan?.status ?? 'unknown'}`, language);
  return wan?.status === 'connected' && wan.ip ? `${status} · ${wan.ip}` : status;
}

/**
 * @description The name of a connection type ("dhcp" -> "Dynamic IP").
 * @param {string|null} type - The type the router reports.
 * @param {string} language - The language.
 * @returns {string} The name, the raw type upper-cased when unknown.
 */
function connTypeName(type, language) {
  if (!type) {
    return '?';
  }
  return hasText(`connType_${type}`) ? t(`connType_${type}`, language) : type.toUpperCase();
}

/**
 * @description The minutes left of a pause.
 * @param {number|null} pausedUntil - The end of the pause, in ms.
 * @param {number} now - Now, in ms.
 * @returns {number} Minutes, at least 1.
 */
const minutesLeft = (pausedUntil, now) => Math.max(1, Math.ceil((pausedUntil - now) / 60000));

/**
 * @description The `overview` widget.
 * @param {object} options - Options.
 * @param {object} options.router - The router snapshot.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.fetchedAt - Time of the reading, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {number|null} [options.pausedUntil] - End of a pause of the readings.
 * @param {number} [options.pauseMinutes] - Length of a pause.
 * @returns {object} The content.
 * @example
 * buildOverviewWidget({ router, language: 'fr', now, fetchedAt, pollSeconds: 60 });
 */
function buildOverviewWidget({
  router,
  language,
  now,
  fetchedAt,
  pollSeconds,
  pausedUntil = null,
  pauseMinutes = 20,
}) {
  const identity = router.identity ?? {};
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('overviewCaption', language, {
          model: modelOf(identity),
          ip: identity.lanIp ?? '?',
          ago: ago(fetchedAt, now, language),
        }),
        80,
      ),
    },
  ];
  // An unknown load is no gauge at all rather than a misleading 0 %.
  [
    [router.cpu, 'tileCpu', 'cpu'],
    [router.memory, 'tileMemory', 'layers'],
  ]
    .filter(([value]) => typeof value === 'number')
    .forEach(([value, label, icon]) =>
      components.push({
        type: 'gauge',
        value,
        min: 0,
        max: 100,
        unit: '%',
        label: t(label, language),
        icon,
        color: loadColor(value),
      }),
    );
  components.push(
    {
      type: 'value',
      value: String(router.clientsOnline ?? 0),
      label: t('tileClients', language),
      icon: 'smartphone',
      color: 'primary',
    },
    {
      type: 'value',
      value: String(router.counts?.guest ?? 0),
      label: t('tileGuests', language),
      icon: 'users',
      color: router.counts?.guest ? 'info' : 'neutral',
    },
  );

  components.push({
    type: 'status',
    items: [
      {
        label: t('rowInternet', language),
        value: clip(internetValue(router.wan, language), 40),
        icon: 'globe',
        color: INTERNET_COLORS[router.wan?.status ?? 'unknown'],
      },
      ...(typeof router.internetUptimeHours === 'number'
        ? [
            {
              label: t('rowConnectedFor', language),
              value: clip(formatDuration(router.internetUptimeHours, language), 40),
              icon: 'clock',
            },
          ]
        : []),
      {
        label: t('rowFirmware', language),
        value: clip(identity.firmware ?? '?', 40),
        icon: 'cpu',
      },
      {
        label: t('rowReadings', language),
        value: clip(
          pausedUntil
            ? t('readingsPaused', language, { minutes: minutesLeft(pausedUntil, now) })
            : t('readingsActive', language, { seconds: pollSeconds }),
          40,
        ),
        icon: pausedUntil ? 'pause-circle' : 'activity',
        color: pausedUntil ? 'warning' : 'success',
      },
    ],
  });

  components.push(
    pausedUntil
      ? {
          type: 'button',
          label: t('buttonResume', language),
          icon: 'play',
          style: 'primary',
          action: { key: WIDGET_ACTIONS.RESUME },
        }
      : {
          type: 'button',
          label: t('buttonPause', language, { minutes: pauseMinutes }),
          icon: 'pause',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.PAUSE },
        },
    {
      type: 'button',
      label: t('buttonReboot', language),
      icon: 'power',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.REBOOT, confirm: true },
    },
  );
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The `internet` widget.
 * @param {object} options - Options.
 * @param {object} options.router - The router snapshot.
 * @param {string} options.language - The user language.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 */
function buildInternetWidget({ router, language, pollSeconds }) {
  const wan = router.wan;
  if (!wan) {
    return messageContent(t('noWan', language), ttlOf(pollSeconds));
  }
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('internetCaption', language, {
          type: connTypeName(wan.connType, language),
        }),
        80,
      ),
    },
  ];
  if (typeof router.internetUptimeHours === 'number') {
    components.push({
      type: 'value',
      value: formatDuration(router.internetUptimeHours, language),
      label: t('tileConnectedFor', language),
      icon: 'clock',
      color: 'info',
    });
  }
  const rows = [
    {
      label: t('rowInternet', language),
      value: t(`internet_${wan.status}`, language),
      icon: 'globe',
      color: INTERNET_COLORS[wan.status] ?? 'neutral',
    },
    ['rowWanIp', wan.ip, 'map-pin'],
    ['rowGateway', wan.gateway, 'git-commit'],
    ['rowDns1', wan.dns1, 'server'],
    ['rowDns2', wan.dns2, 'server'],
    ['rowIpv6', wan.ipv6, 'hash'],
  ]
    .map((row) =>
      Array.isArray(row)
        ? row[1]
          ? { label: t(row[0], language), value: clip(row[1], 40), icon: row[2] }
          : null
        : row,
    )
    .filter(Boolean);
  components.push({ type: 'status', items: rows });
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The `wifi` widget.
 * @param {object} options - Options.
 * @param {Array<object>} options.wifi - The Wi-Fi network snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 */
function buildWifiWidget({ wifi, language, pollSeconds }) {
  if (wifi.length === 0) {
    return messageContent(t('noWifi', language), ttlOf(pollSeconds));
  }
  const on = wifi.filter((network) => network.enabled).length;
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(t('wifiCaption', language, { on, total: wifi.length }), 80),
    },
    {
      type: 'status',
      items: wifi.slice(0, MAX_STATUS_ROWS).map((network) => ({
        label: clip(wifiName(network, language), 28),
        value: t(network.enabled ? 'stateOn' : 'stateOff', language),
        icon: network.network === 'guest' ? 'users' : network.network === 'iot' ? 'cpu' : 'wifi',
        color: network.enabled ? 'success' : 'neutral',
      })),
    },
  ];
  for (const [kind, key] of [
    ['guest', WIDGET_ACTIONS.GUEST_WIFI],
    ['iot', WIDGET_ACTIONS.IOT_WIFI],
  ]) {
    const networks = wifi.filter((network) => network.network === kind);
    if (networks.length > 0) {
      // Any band on: the button turns them all off; all off: all on.
      const enable = !networks.some((network) => network.enabled);
      components.push({
        type: 'button',
        label: t(`button_${kind}_${enable ? 'on' : 'off'}`, language),
        icon: enable ? 'toggle-left' : 'toggle-right',
        style: enable ? 'primary' : 'secondary',
        action: { key, params: { enabled: enable } },
      });
    }
  }
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The settings of the `network` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ show: string }} The settings.
 */
const readNetworkSettings = (settings = {}) => ({
  show: NETWORK_SHOW.includes(settings.show) ? settings.show : DEFAULT_SHOW,
});

/**
 * @description The badge text of a client's connection.
 * @param {object} client - The client snapshot.
 * @param {string} language - The language.
 * @returns {string} "Wired", "5 GHz", "Guest 5 GHz".
 */
function connectionBadge(client, language) {
  if (client.connection === 'wired') {
    return t('badgeWired', language);
  }
  const band = client.connection ? t(`band_${client.connection}`, language) : '';
  if (client.network === 'guest' || client.network === 'iot') {
    return `${t(`badge_${client.network}`, language)} ${band}`.trim();
  }
  return band || t('badgeHere', language);
}

/**
 * @description The `network` widget: clients with a name first, then by name.
 * @param {object} options - Options.
 * @param {Array<object>} options.clients - The client snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.show] - present, absent or all.
 * @param {Set<string>} [options.created] - MACs of the clients created in Gladys.
 * @returns {object} The content.
 */
function buildNetworkWidget({
  clients,
  language,
  now,
  pollSeconds,
  show = DEFAULT_SHOW,
  created = new Set(),
}) {
  const present = clients.filter((client) => client.present);
  const listed = clients
    .filter((client) =>
      show === 'all' ? true : show === 'present' ? client.present : !client.present,
    )
    .filter((client) => show !== 'absent' || client.lastSeen)
    .sort((a, b) => {
      if (show === 'absent') {
        return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
      }
      if (Boolean(a.name) !== Boolean(b.name)) {
        return a.name ? -1 : 1;
      }
      return clientName(a).localeCompare(clientName(b), language);
    });
  const caption = t('networkCaption', language, {
    present: present.length,
    total: clients.length,
  });
  if (listed.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [
        { type: 'text', variant: 'caption', text: clip(caption, 80) },
        { type: 'text', variant: 'body', text: t(`networkEmpty_${show}`, language) },
      ],
    };
  }
  const extra = listed.length - MAX_LIST_ITEMS;
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          extra > 0 ? `${caption} · ${t('networkMore', language, { count: extra })}` : caption,
          80,
        ),
      },
      {
        type: 'card-list',
        display: 'list',
        items: listed.slice(0, MAX_LIST_ITEMS).map((client) => ({
          title: clip(clientName(client), 60),
          // The IP first: the line is cut to one line by the front.
          subtitle: clip(
            [
              client.ip,
              client.present
                ? client.name
                  ? client.mac
                  : null
                : client.lastSeen && ago(client.lastSeen, now, language),
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: client.present
            ? {
                text: clip(connectionBadge(client, language), 16),
                color: created.has(client.mac) ? 'success' : 'info',
              }
            : { text: clip(t('badgeGone', language), 16), color: 'neutral' },
        })),
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  NETWORK_SHOW,
  clip,
  messageContent,
  formatDuration,
  connectionBadge,
  readNetworkSettings,
  buildOverviewWidget,
  buildInternetWidget,
  buildWifiWidget,
  buildNetworkWidget,
};
