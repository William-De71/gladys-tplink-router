// -----------------------------------------------------------------------------
// The TP-Link / Mercusys Router integration: every handler, registered on a
// Gladys client.
//
// Brings a TP-Link (Archer…) or Mercusys router into Gladys, over the web
// interface of the router on the LAN:
//   - devices (device.js): the router (CPU, memory, internet link, WAN
//     address, time connected, clients, firmware), its Wi-Fi networks (main,
//     guest, IoT, per band) as switches, and the clients of the network as
//     presence sensors;
//   - scene triggers (tracker.js, events.js): internet down or back, public
//     IP address changed, device arrived or left, new device on the network;
//   - scene actions: read the status, turn Wi-Fi networks on or off, reboot;
//   - dashboard widgets (widgets.js): overview, internet, Wi-Fi, network
//     devices.
//
// The web interface admits one administrator at a time: each reading logs
// in and out, and logs the web page out. The readings can be paused from the
// overview widget or the configuration screen to use the web page.
//
// Transport: local only. Nothing leaves the network.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasCredentials,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createTplinkClient } from './tplink-api.js';
import { createKnownHosts, DEFAULT_PATH } from './store.js';
import { createWatcher, FORMS } from './watcher.js';
import { readFirmware, WIFI_FORM, BANDS, NETWORKS } from './read.js';
import {
  DEVICE_TYPES,
  ROUTER_ID,
  idsOf,
  macId,
  idFromExternalId,
  routerName,
  modelOf,
  buildRouterDevice,
  buildRouterStates,
  buildWifiDevice,
  buildWifiStates,
  buildClientDevice,
  presenceFeatureId,
} from './device.js';
import {
  internetEvent,
  wanIpEvent,
  presenceEvent,
  newClientEvent,
  statusOutputs,
  wifiOutputs,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  readNetworkSettings,
  buildOverviewWidget,
  buildInternetWidget,
  buildWifiWidget,
  buildNetworkWidget,
} from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  PAUSE: 'pause_readings',
  RESUME: 'resume_readings',
  FORGET_DEVICES: 'forget_network_devices',
};
const SCENE_ACTIONS = { GET_STATUS: 'get_status', SET_WIFI: 'set_wifi', REBOOT: 'reboot' };
// A present client is dated again in Gladys this often (the "check presence"
// action of Gladys reads the date of the last value, as for Bluetooth).
const PRESENCE_HEARTBEAT_MS = 60000;
// The Discovery list never exceeds what the host API accepts in one batch.
const MAX_DISCOVERED = 2000;

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.request] - HTTP transport of the router client (tests).
 * @param {Function} [options.random] - Random bytes of the router client (tests).
 * @param {string} [options.knownHostsPath] - File of the known MAC addresses.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, known: object, api: object, getConfig: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    request,
    random,
    knownHostsPath = DEFAULT_PATH,
    now = () => Date.now(),
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let configLoaded = false;
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status and Discovery list sent, to send them again only
  // when they change.
  let lastStatus = null;
  let lastDiscovery = null;

  const api = createTplinkClient({
    getConfig: () => config,
    now,
    logger,
    ...(request ? { request } : {}),
    ...(random ? { random } : {}),
  });
  const known = createKnownHosts({ path: knownHostsPath, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (feature names, states, scene summaries and outputs).
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The multi-language message of a failed call.
   * @param {Error} err - A TplinkError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    switch (err.kind) {
      case 'auth':
        return all('statusAuth');
      case 'locked':
        return all('statusLocked', {
          minutes: Math.max(1, Math.ceil((err.retryAfter ?? 1800) / 60)),
        });
      case 'unsupported':
        return all('statusUnsupported');
      case 'tls':
        return all('statusTls');
      case 'not_found':
        return all('statusNotFound');
      case 'unreachable':
        return all('statusUnreachable', { url: config.url });
      default:
        return all('statusError');
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (type, id) => createdDevices.has(idsOf(gladys, type, id).device);

  /**
   * @description Publish the states of the created devices. The SDK remembers
   * what it sent (publishChangedStates) and forgets a device when the user
   * creates it: its states then go out again in full.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = [];
    const router = watcher.router();
    if (router && isCreated(DEVICE_TYPES.ROUTER, ROUTER_ID)) {
      states.push(...buildRouterStates(gladys, router, lang));
    }
    watcher
      .wifi()
      .filter((wifi) => isCreated(DEVICE_TYPES.WIFI, wifi.id))
      .forEach((wifi) => states.push(...buildWifiStates(gladys, wifi)));
    const clients = watcher
      .clients()
      .filter((client) => isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)));
    const absent = clients
      .filter((client) => !client.present)
      .map((client) => ({
        device_feature_external_id: presenceFeatureId(gladys, client.mac),
        state: 0,
      }));
    const present = clients
      .filter((client) => client.present)
      .map((client) => ({
        device_feature_external_id: presenceFeatureId(gladys, client.mac),
        state: 1,
      }));
    if (states.length + absent.length > 0) {
      await gladys.publishChangedStates([...states, ...absent]);
    }
    if (present.length > 0) {
      await gladys.publishChangedStates(present, { heartbeat: PRESENCE_HEARTBEAT_MS });
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Ask the dashboards to read the widgets again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`Scene event ${key}: ${data.summary}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  /**
   * @description The devices offered on the Discovery screen.
   * @returns {Array<object>} The devices.
   */
  function discoveredDevices() {
    const router = watcher.router();
    if (!hasCredentials(config) || !router) {
      return [];
    }
    const lang = textLanguage();
    const devices = [
      buildRouterDevice(gladys, router, watcher.capabilities(), lang),
      ...watcher.wifi().map((wifi) => buildWifiDevice(gladys, wifi, router.identity, lang)),
    ];
    const clients = watcher
      .clients()
      .filter(
        (client) =>
          isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)) ||
          config.networkDevices === 'all' ||
          (config.networkDevices === 'named' && client.name),
      );
    devices.push(...clients.map((client) => buildClientDevice(gladys, client, lang)));
    return devices.slice(0, MAX_DISCOVERED);
  }

  /**
   * @description Offer the devices, only when the list changed.
   * @param {boolean} [force] - Send it even when unchanged.
   * @returns {Promise<number>} How many devices are offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = discoveredDevices();
    const signature = JSON.stringify(
      devices.map((d) => [d.external_id, d.name, d.features.length]),
    );
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description The connection status of a successful reading.
   * @returns {object} The multi-language message.
   */
  function connectedMessage() {
    const router = watcher.router();
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        t('statusConnected', l, {
          model: modelOf(router?.identity),
          internet: t(`internet_${router?.wan?.status ?? 'unknown'}`, l).toLowerCase(),
          clients: router?.clientsOnline ?? 0,
        }),
      ]),
    );
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    api,
    known,
    getConfig: () => config,
    isEnabled: () => hasCredentials(config),
    onRound: async (round) => {
      const lang = textLanguage();
      const router = watcher.router();
      if (!round.baseline) {
        if (round.internet) {
          await publishEvent(internetEvent(round.internet, router?.wan, lang));
        }
        if (round.wanIp) {
          await publishEvent(wanIpEvent(round.wanIp, lang));
        }
        for (const change of round.presence) {
          await publishEvent(presenceEvent(gladys, change, lang));
        }
        for (const change of round.newClients) {
          await publishEvent(newClientEvent(change, lang));
        }
      }
      await publishQuietly();
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      refreshWidgets();
      await reportStatus(true, connectedMessage());
    },
    onError: async (err) => {
      await reportStatus(false, errorMessage(err));
    },
    now,
    logger,
  });

  /**
   * @description Read the router if it never was, before an answer that needs it.
   * @returns {Promise<void>}
   */
  async function ensureRead() {
    if (!hasCredentials(config)) {
      throw new Error('No router address or password is configured');
    }
    if (watcher.fetchedAt() === null) {
      await watcher.round({ force: true });
    }
    if (watcher.fetchedAt() === null) {
      throw new Error('The router could not be read: see the connection status');
    }
  }

  /**
   * @description Turn Wi-Fi networks on or off, in one session.
   * @param {Array<object>} networks - Snapshots of the networks (readWifi).
   * @param {boolean} enabled - On or off.
   * @returns {Promise<Array<object>>} The networks switched.
   */
  async function switchWifi(networks, enabled) {
    await api.session(async (session) => {
      for (const wifi of networks) {
        await session.write('admin/wireless', `${WIFI_FORM[wifi.network]}_${wifi.band}`, {
          enable: enabled ? 'on' : 'off',
        });
      }
    });
    networks.forEach((wifi) => watcher.patchWifi(wifi.id, enabled));
    logger.info(`Wi-Fi ${networks.map((w) => w.id).join(', ')} turned ${enabled ? 'on' : 'off'}`);
    await publishQuietly();
    gladys.requestWidgetRefresh(WIDGETS.WIFI);
    return networks;
  }

  /**
   * @description The Wi-Fi networks of a kind, on a band or all of them.
   * @param {string} network - host, guest or iot.
   * @param {string} band - 2g, 5g, 6g or all.
   * @returns {Array<object>} The networks.
   */
  const wifiOf = (network, band) =>
    watcher
      .wifi()
      .filter((wifi) => wifi.network === network && (band === 'all' || wifi.band === band));

  /**
   * @description Reboot the router.
   * @returns {Promise<void>}
   */
  async function reboot() {
    await api.session((session) => session.fire('admin/system', 'reboot'));
    logger.info('Reboot of the router asked from Gladys');
  }

  /**
   * @description Pause the readings, so that the web page of the router can be used.
   * @returns {object} The multi-language message.
   */
  async function pause() {
    watcher.pause(config.pauseMinutes);
    const message = all('paused', { minutes: config.pauseMinutes });
    await reportStatus(true, message);
    refreshWidgets();
    logger.info(`Readings paused for ${config.pauseMinutes} min`);
    return message;
  }

  /**
   * @description Resume the readings now.
   * @returns {Promise<object>} The multi-language message.
   */
  async function resume() {
    watcher.resume();
    await watcher.round();
    refreshWidgets();
    return all('resumed');
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description Common checks of a widget request.
   * @param {string} lang - The user language.
   * @returns {object|null} A message content, null when the widget can be built.
   */
  function widgetProblem(lang) {
    if (!hasCredentials(config)) {
      return messageContent(t('noCredentials', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildOverviewWidget({
        router: watcher.router(),
        language: lang,
        now: now(),
        fetchedAt: watcher.fetchedAt(),
        pollSeconds: config.pollInterval,
        pausedUntil: watcher.pausedUntil(),
        pauseMinutes: config.pauseMinutes,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.INTERNET, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildInternetWidget({
        router: watcher.router(),
        language: lang,
        pollSeconds: config.pollInterval,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.WIFI, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildWifiWidget({ wifi: watcher.wifi(), language: lang, pollSeconds: config.pollInterval })
    );
  });

  gladys.onWidgetGet(WIDGETS.NETWORK, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildNetworkWidget({
        clients: watcher.clients(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
        show: readNetworkSettings(settings).show,
        created: new Set(
          watcher
            .clients()
            .filter((client) => isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)))
            .map((client) => client.mac),
        ),
      })
    );
  });

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      if (actionKey === WIDGET_ACTIONS.PAUSE) {
        return await pause();
      }
      if (actionKey === WIDGET_ACTIONS.RESUME) {
        return await resume();
      }
      if (actionKey === WIDGET_ACTIONS.REBOOT) {
        await reboot();
        return all('rebooting');
      }
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return errorMessage(err);
    }
    return all('unknownAction');
  });

  gladys.onWidgetAction(WIDGETS.WIFI, async (actionKey, params = {}) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    const kind = { [WIDGET_ACTIONS.GUEST_WIFI]: 'guest', [WIDGET_ACTIONS.IOT_WIFI]: 'iot' }[
      actionKey
    ];
    if (!kind) {
      return all('unknownAction');
    }
    const networks = wifiOf(kind, 'all');
    if (networks.length === 0) {
      return all('noSuchWifi');
    }
    const enabled = params.enabled === true;
    try {
      await switchWifi(networks, enabled);
      return Object.fromEntries(
        LANGUAGES.map((l) => [l, wifiOutputs(networks, enabled, l).summary]),
      );
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return errorMessage(err);
    }
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_STATUS, async () => {
    await ensureRead();
    return statusOutputs({ router: watcher.router(), clients: watcher.clients() }, textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_WIFI, async (fields) => {
    await ensureRead();
    const network = String(fields.network ?? '');
    const band = fields.band ? String(fields.band) : 'all';
    if (!NETWORKS.includes(network) || (band !== 'all' && !BANDS.includes(band))) {
      throw new Error(`Unknown Wi-Fi network: ${network} ${band}`);
    }
    const networks = wifiOf(network, band);
    if (networks.length === 0) {
      throw new Error(`The router has no ${network} Wi-Fi network on ${band}`);
    }
    const enabled = String(fields.state) === 'on';
    await switchWifi(networks, enabled);
    return wifiOutputs(networks, enabled, textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.REBOOT, async () => {
    await ensureRead();
    await reboot();
  });

  // --- Device commands (the Wi-Fi network switches) ----------------------------------
  gladys.onSetValue(async (device, deviceFeature, value) => {
    const id = idFromExternalId(device.external_id, DEVICE_TYPES.WIFI);
    if (
      !id ||
      deviceFeature.external_id !== idsOf(gladys, DEVICE_TYPES.WIFI, id).feature('enabled')
    ) {
      throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
    }
    const [network, band] = id.split('_');
    await switchWifi([{ id, network, band }], Number(value) === 1);
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      const identity = readFirmware(
        await api.session((session) => session.read(...FORMS.FIRMWARE)),
      );
      return Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          t('testOk', l, { model: routerName(identity, l), firmware: identity.firmware ?? '?' }),
        ]),
      );
    } catch (err) {
      return errorMessage(err);
    }
  });

  gladys.onAction(ACTIONS.PAUSE, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    return pause();
  });

  gladys.onAction(ACTIONS.RESUME, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    return resume();
  });

  gladys.onAction(ACTIONS.FORGET_DEVICES, async () => {
    await known.clear();
    return all('forgotten');
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round({ slow: true, force: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} TP-Link device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read the router now; report missing settings.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    if (!hasCredentials(config)) {
      await reportStatus(false, all('noCredentials'));
      return;
    }
    await watcher.round({ slow: true });
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousUrl = config.url;
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: router read every ${config.pollInterval} s`);
    // New password, address or interval: log in again, start from a fresh baseline.
    api.reset();
    watcher.reset();
    lastDiscovery = null;
    if (configLoaded && config.url !== previousUrl) {
      // Maybe another router: its network is new.
      await known.clear();
    }
    configLoaded = true;
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await loadConfig();
    configLoaded = true;
    await known.load();
    await refreshCreatedDevices();
    lastStatus = null;
    lastDiscovery = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
  });

  return { watcher, known, api, getConfig: () => config };
}

export { createApp, ACTIONS, SCENE_ACTIONS, PRESENCE_HEARTBEAT_MS };
