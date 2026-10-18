// -----------------------------------------------------------------------------
// The reading loop: every `poll_interval` seconds, the state of the router.
//
// Each round is one session (login, reads, logout: the web interface admits a
// single administrator). It reads what moves (status: CPU, memory, internet
// link, Wi-Fi networks, clients; the smart network list of clients); what
// hardly moves (model, firmware, gateway and DNS) is read every
// SLOW_INTERVAL_MS only.
//
// It keeps the snapshots the devices, widgets and scene actions read, and
// hands each round to the app with its transitions (tracker.js). A round never
// overlaps another one. The status read is the probe of the round: when the
// session or the status fails, the round fails (onError); any other read
// failing keeps its previous snapshot.
//
// Readings can be paused for a while, so that the user can open the web page
// of the router (it would log them out at every round otherwise).
// -----------------------------------------------------------------------------

import {
  readStatus,
  readPerf,
  readSmartNetwork,
  readIpv4,
  readFirmware,
  mergeClients,
} from './read.js';
import { nextPresence, diffInternet, diffWanIp } from './tracker.js';

const SLOW_INTERVAL_MS = 10 * 60 * 1000;
// A form missing on this model is not asked again before this delay.
const RETRY_MISSING_MS = 60 * 60 * 1000;

const FORMS = {
  STATUS: ['admin/status', 'all'],
  PERF: ['admin/status', 'perf'],
  SMART: ['admin/smart_network', 'game_accelerator', 'loadDevice'],
  IPV4: ['admin/network', 'status_ipv4'],
  FIRMWARE: ['admin/firmware', 'upgrade'],
};

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.api - The router client (tplink-api.js).
 * @param {object} options.known - The known MAC addresses (store.js).
 * @param {Function} options.getConfig - `() => normalized config`.
 * @param {Function} options.isEnabled - `() => boolean`: address and password known.
 * @param {Function} options.onRound - `async (round) => void`.
 * @param {Function} options.onError - `async (err) => void`.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ api, known, getConfig, isEnabled, onRound, onError, logger });
 * watcher.start();
 */
function createWatcher({
  api,
  known,
  getConfig,
  isEnabled,
  onRound,
  onError,
  now = () => Date.now(),
  logger,
}) {
  let router = null;
  let identity = null;
  let ipv4 = null;
  let slowAt = null;
  let clients = new Map();
  // Features met since the start: one the router stops reporting for a round
  // must not vanish from the Discovery list.
  let capabilities = new Set();
  let fetchedAt = null;
  let pausedUntil = null;
  // form -> time it was found missing
  let missing = new Map();
  let timer = null;
  let running = null;
  let started = false;

  /**
   * @description Read an optional form: undefined when it fails.
   * @param {object} session - The open session.
   * @param {string} name - A name for the logs and the missing map.
   * @param {Array<string>} form - `[path, form, operation?]`.
   * @returns {Promise<unknown>} The `data` of the answer.
   */
  async function readOptional(session, name, [path, form, operation]) {
    const since = missing.get(name);
    if (since !== undefined && now() - since < RETRY_MISSING_MS) {
      return undefined;
    }
    try {
      const answer = await session.read(path, form, operation);
      missing.delete(name);
      return answer;
    } catch (err) {
      if (err.kind === 'unreachable' || err.kind === 'tls') {
        throw err;
      }
      if (since === undefined) {
        logger.info(`Router ${name}: ${err.message}, skipped for an hour`);
      }
      missing.set(name, now());
      return undefined;
    }
  }

  /**
   * @description Every read of a round, in one session.
   * @param {boolean} forceSlow - Read the slow forms too.
   * @returns {Promise<object>} The raw answers.
   */
  function readRouter(forceSlow) {
    return api.session(async (session) => {
      const answers = { status: await session.read(...FORMS.STATUS) };
      const status = readStatus(answers.status);
      if (status.cpu === null || status.memory === null) {
        answers.perf = await readOptional(session, 'performance', FORMS.PERF);
      }
      answers.smart = await readOptional(session, 'smart network', FORMS.SMART);
      const at = now();
      if (forceSlow || slowAt === null || at - slowAt >= SLOW_INTERVAL_MS) {
        answers.firmware = await readOptional(session, 'firmware', FORMS.FIRMWARE);
        answers.ipv4 = await readOptional(session, 'internet settings', FORMS.IPV4);
        answers.slow = true;
      }
      return answers;
    });
  }

  /**
   * @description One reading of the router.
   * @param {boolean} forceSlow - Read the slow parts too.
   * @returns {Promise<void>}
   */
  async function readAll(forceSlow) {
    const answers = await readRouter(forceSlow);
    const at = now();
    const baseline = fetchedAt === null;
    const config = getConfig();
    const round = { baseline, presence: [], newClients: [], internet: null, wanIp: null };

    // --- system -----------------------------------------------------------------
    const status = readStatus(answers.status);
    const perf = answers.perf ? readPerf(answers.perf) : { cpu: null, memory: null };
    const cpu = status.cpu ?? perf.cpu;
    const memory = status.memory ?? perf.memory;
    if (answers.slow) {
      slowAt = at;
      if (answers.firmware !== undefined) {
        identity = readFirmware(answers.firmware);
      }
      if (answers.ipv4 !== undefined) {
        ipv4 = readIpv4(answers.ipv4);
      }
    }

    // --- internet link ----------------------------------------------------------
    const wan = status.wan
      ? {
          ...status.wan,
          gateway: status.wan.gateway ?? ipv4?.gateway ?? null,
          connType: status.wan.connType ?? ipv4?.connType ?? null,
          dns1: status.wan.dns1 ?? ipv4?.dns1 ?? null,
          dns2: status.wan.dns2 ?? ipv4?.dns2 ?? null,
        }
      : null;
    if (!baseline) {
      round.internet = diffInternet(router?.wan ?? undefined, wan);
      round.wanIp = diffWanIp(router?.wan ?? undefined, wan);
    }
    if (cpu !== null) {
      capabilities.add('cpu');
    }
    if (memory !== null) {
      capabilities.add('memory');
    }
    if (typeof wan?.uptimeSeconds === 'number') {
      capabilities.add('internet_uptime');
    }

    // --- clients and presence ---------------------------------------------------
    const absenceMs = config.absenceDelay * 60000;
    const read = new Map(
      mergeClients(status.clients, answers.smart ? readSmartNetwork(answers.smart) : [])
        .filter((client) => client.mac !== status.lanMac)
        .map((client) => [client.mac, client]),
    );
    const next = new Map();
    for (const mac of new Set([...clients.keys(), ...read.keys()])) {
      const before = clients.get(mac);
      const fresh = read.get(mac);
      const client = { ...(before ?? {}), ...(fresh ?? {}), online: Boolean(fresh) };
      // A name, an address once known stays known.
      client.mac = mac;
      client.name = fresh?.name ?? before?.name ?? null;
      client.ip = fresh?.ip ?? before?.ip ?? null;
      client.connection = fresh ? fresh.connection : (before?.connection ?? null);
      client.network = fresh ? fresh.network : (before?.network ?? 'host');
      client.signal = fresh ? fresh.signal : null;
      const presence = nextPresence(baseline ? undefined : before, client.online, at, absenceMs);
      client.present = presence.present;
      client.lastSeen = presence.lastSeen;
      if (presence.event) {
        round.presence.push({ client, event: presence.event });
      }
      next.set(mac, client);
    }
    clients = next;
    const online = [...read.keys()];
    const unknown = online.filter((mac) => !known.has(mac));
    if (unknown.length > 0) {
      if (known.initialized()) {
        unknown.forEach((mac) => round.newClients.push({ client: clients.get(mac) }));
      }
      await known.add(unknown);
    } else if (!known.initialized()) {
      await known.add([]);
    }

    const connected = [...clients.values()].filter((c) => c.online);
    router = {
      identity: { ...(identity ?? {}), lanIp: status.lanIp, lanMac: status.lanMac },
      cpu,
      memory,
      wan,
      internetUptimeHours:
        typeof wan?.uptimeSeconds === 'number'
          ? Math.round((wan.uptimeSeconds / 3600) * 100) / 100
          : null,
      wifi: status.wifi,
      clientsOnline: connected.length,
      counts: {
        wired: connected.filter((c) => c.connection === 'wired').length,
        wifi: connected.filter(
          (c) => c.connection !== 'wired' && c.network !== 'guest' && c.network !== 'iot',
        ).length,
        guest: connected.filter((c) => c.network === 'guest').length,
        iot: connected.filter((c) => c.network === 'iot').length,
      },
    };
    fetchedAt = at;
    await onRound(round);
  }

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getConfig().pollInterval * 1000);
      timer.unref?.();
    }
  }

  const isPaused = () => pausedUntil !== null && now() < pausedUntil;

  /**
   * @description Read the router now; joins a round already running.
   * @param {object} [options] - `{ slow, force }`: read the slow parts too;
   * read even while the readings are paused (an explicit request).
   * @returns {Promise<void>} Never rejects: failures go to onError.
   */
  function round({ slow: forceSlow = false, force = false } = {}) {
    if (running) {
      return running;
    }
    if (!isEnabled()) {
      return Promise.resolve();
    }
    if (isPaused() && !force) {
      return Promise.resolve();
    }
    if (pausedUntil !== null && !isPaused()) {
      resume();
    }
    running = readAll(forceSlow)
      .catch(async (err) => {
        logger.warn(`Router reading failed: ${err.message}`);
        await onError(err);
      })
      .catch((err) => logger.error('Unable to report a reading failure', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  /**
   * @description End a pause: the clients present before it get a fresh
   * absence delay (nobody was looked at meanwhile).
   */
  function resume() {
    if (pausedUntil === null) {
      return;
    }
    pausedUntil = null;
    const at = now();
    for (const client of clients.values()) {
      if (client.present) {
        client.lastSeen = at;
      }
    }
  }

  return {
    round,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    /** @description Forget everything: the next round is a new baseline. */
    reset: () => {
      router = null;
      identity = null;
      ipv4 = null;
      slowAt = null;
      clients = new Map();
      capabilities = new Set();
      fetchedAt = null;
      missing = new Map();
    },
    /**
     * @description Stop reading for a while.
     * @param {number} minutes - How long.
     * @returns {number} The end of the pause, in ms.
     */
    pause: (minutes) => {
      pausedUntil = now() + minutes * 60000;
      return pausedUntil;
    },
    resume,
    pausedUntil: () => (isPaused() ? pausedUntil : null),
    router: () => router,
    wifi: () => router?.wifi ?? [],
    clients: () => [...clients.values()],
    client: (mac) => clients.get(mac) ?? null,
    capabilities: () => [...capabilities],
    fetchedAt: () => fetchedAt,
    /**
     * @description Apply a Wi-Fi network switched from Gladys: no event.
     * @param {string} id - "guest_5g".
     * @param {boolean} enabled - Its new state.
     * @returns {object|null} The new snapshot.
     */
    patchWifi: (id, enabled) => {
      const current = router?.wifi?.find((wifi) => wifi.id === id);
      if (!current) {
        return null;
      }
      const updated = { ...current, enabled };
      router = { ...router, wifi: router.wifi.map((wifi) => (wifi.id === id ? updated : wifi)) };
      return updated;
    },
  };
}

export { createWatcher, SLOW_INTERVAL_MS, RETRY_MISSING_MS, FORMS };
