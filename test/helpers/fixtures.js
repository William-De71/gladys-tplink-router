// A fake TP-Link router for the tests: the server side of the web interface
// login (RSA keys, AES, signatures) for the four flavours, and the answers of
// its forms as the captures of real routers in the tplinkrouterc6u tests show
// them (Archer C6U / AX), with the values of a small home network, served
// through the `request` transport of the client. Tests never touch the
// network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateKeyPairSync,
  privateDecrypt,
  constants,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { modPow } from '../../src/crypto.js';

const NOW = Date.parse('2026-10-18T18:00:00Z');
const MINUTE = 60000;
const ROUTER_MAC = '50:91:e3:00:00:01';
const PHONE_MAC = 'a4:83:e7:12:34:56';
const NAS_MAC = '00:11:32:aa:bb:cc';
const TV_MAC = '3c:2a:f4:01:02:03';
const GUEST_MAC = '6e:11:22:33:44:55';
const PLUG_MAC = 'fb:90:b8:2a:8a:b1';
const USERNAME = 'admin';
const PASSWORD = 'secret';
const STOK = 'stok-1';
const SYSAUTH = 'sysauth-1';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary file path for the known MAC addresses.
 * @returns {string} The path (its directory exists, the file does not).
 */
const knownPath = () => join(mkdtempSync(join(tmpdir(), 'tplink-')), 'known-hosts.json');

// RSA key pairs are slow to make: one per size for every test.
const KEYS = new Map();

/**
 * @description An RSA key pair as the router hands it out.
 * @param {number} bits - 512, 1024, 2048.
 * @returns {{ n: string, e: string, d: bigint, nBig: bigint, size: number, privateKey: object }} The key.
 */
function keyPair(bits) {
  if (!KEYS.has(bits)) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: bits });
    const jwk = privateKey.export({ format: 'jwk' });
    const hex = (b64) => Buffer.from(b64, 'base64url').toString('hex');
    const n = hex(jwk.n);
    KEYS.set(bits, {
      n,
      e: hex(jwk.e),
      nBig: BigInt(`0x${n}`),
      d: BigInt(`0x${hex(jwk.d)}`),
      size: bits / 8,
      privateKey,
    });
  }
  return KEYS.get(bits);
}

/**
 * @description Decrypt PKCS#1 v1.5 blocks (hex), as the router does.
 * @param {string} hex - The concatenated blocks.
 * @param {object} key - keyPair().
 * @returns {string|null} The clear text, null when a block is not PKCS#1 v1.5.
 */
function decryptPkcs1(hex, key) {
  let out = '';
  for (let i = 0; i < hex.length; i += key.size * 2) {
    const m = modPow(BigInt(`0x${hex.slice(i, i + key.size * 2)}`), key.d, key.nBig);
    const em = Buffer.from(m.toString(16).padStart(key.size * 2, '0'), 'hex');
    const zero = em.indexOf(0, 2);
    if (em[0] !== 0 || em[1] !== 2 || zero < 10) {
      return null;
    }
    out += em.subarray(zero + 1).toString('utf8');
  }
  return out;
}

/**
 * @description Decrypt OAEP blocks (hex).
 * @param {string} hex - The concatenated blocks.
 * @param {object} key - keyPair().
 * @returns {string|null} The clear text, null when a block is not OAEP.
 */
function decryptOaep(hex, key) {
  let out = '';
  try {
    for (let i = 0; i < hex.length; i += key.size * 2) {
      out += privateDecrypt(
        { key: key.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING },
        Buffer.from(hex.slice(i, i + key.size * 2), 'hex'),
      ).toString('utf8');
    }
  } catch {
    return null;
  }
  return out;
}

const aes = (k, i) => [Buffer.from(k, 'latin1'), Buffer.from(i, 'latin1')];
const aesEncrypt = (k, i, text) => {
  const cipher = createCipheriv('aes-128-cbc', ...aes(k, i));
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
};
const aesDecrypt = (k, i, b64) => {
  const decipher = createDecipheriv('aes-128-cbc', ...aes(k, i));
  return Buffer.concat([decipher.update(Buffer.from(b64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
};
const md5 = (text) => createHash('md5').update(text).digest('hex');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const query = (text) => Object.fromEntries(new URLSearchParams(text));

/**
 * @description A client entry of a status list.
 * @param {string} mac - The MAC (dashes, upper case, as many firmwares write it).
 * @param {object} values - The fields.
 * @returns {object} The entry.
 */
const clientEntry = (mac, values) => ({
  macaddr: mac.toUpperCase().replace(/:/g, '-'),
  ipaddr: '',
  hostname: '',
  wire_type: 'wired',
  ...values,
});

/**
 * @description The default state of the router.
 * @returns {object} The state.
 */
function defaultState() {
  return {
    status: {
      cpu_usage: 0.28,
      mem_usage: 0.43,
      lan_macaddr: ROUTER_MAC.toUpperCase().replace(/:/g, '-'),
      lan_ipv4_ipaddr: '192.168.0.1',
      wan_macaddr: '50:91:e3:00:00:02',
      wan_ipv4_ipaddr: '90.12.34.56',
      wan_ipv4_gateway: '90.12.34.1',
      wan_ipv4_conntype: 'pppoe',
      wan_ipv4_pridns: '80.10.246.2',
      wan_ipv4_snddns: '80.10.246.129',
      wan_ipv4_uptime: 93600,
      wan_ipv6_enable: 'on',
      wan_ipv6_ip6addr: '2a01:cb00:1234:5600::1/64',
      conn_type: '1',
      // A real status carries the Wi-Fi keys too: never logged, never kept.
      wireless_2g_psk_key: 'do-not-leak',
      wireless_2g_enable: 'on',
      wireless_5g_enable: 'on',
      guest_2g_enable: 'off',
      guest_5g_enable: 'off',
      access_devices_wired: [
        clientEntry(NAS_MAC, { ipaddr: '192.168.0.10', hostname: 'DS220', wire_type: 'wired' }),
      ],
      access_devices_wireless_host: [
        clientEntry(PHONE_MAC, { ipaddr: '192.168.0.23', hostname: 'Pixel-8', wire_type: '5G' }),
        clientEntry(TV_MAC, { ipaddr: '192.168.0.40', hostname: 'UNKNOWN', wire_type: '2.4G' }),
      ],
      access_devices_wireless_guest: [],
    },
    smart: [
      {
        mac: PHONE_MAC,
        deviceTag: '5G',
        isGuest: false,
        ip: '192.168.0.23',
        deviceName: 'Pixel-8',
        signal: -52,
      },
      {
        mac: PLUG_MAC,
        deviceTag: 'iot_2.4G',
        isGuest: false,
        ip: '192.168.0.50',
        deviceName: 'Tapo-Plug',
      },
    ],
    firmware: {
      hardware_version: 'Archer AX55',
      model: 'Archer AX55 v1.0',
      firmware_version: '1.1.3 Build 20230411 rel.48593(5553)',
    },
    ipv4: {
      wan_ipv4_gateway: '90.12.34.1',
      wan_ipv4_pridns: '80.10.246.2',
      wan_ipv4_snddns: '80.10.246.129',
      wan_ipv4_conntype: 'pppoe',
      wan_ipv4_netmask: '255.255.255.255',
    },
    // Forms answering "not supported" on this model.
    unsupported: new Set(),
  };
}

/**
 * @description The keys of a flavour: password key and signature key sizes.
 * @param {string} scheme - standard, ax72, sg, rsa_only.
 * @returns {{ pwd: object, auth: object }} The keys.
 */
function keysOf(scheme) {
  return {
    pwd: keyPair(scheme === 'rsa_only' ? 2048 : 1024),
    auth: keyPair(scheme === 'ax72' ? 512 : 1024),
  };
}

/**
 * @description A fake TP-Link router behind the `request` transport.
 * @param {object} [options] - `{ scheme, state, legacyForm, password }`: the
 * login flavour the router speaks, overrides of the state, a firmware that
 * reads form bodies only.
 * @returns {Function} The transport, with `state`, `calls`, `logins`,
 * `failures`, `writes`, `rebooted`, `sessions()`, `down`, `lock`.
 */
function tplinkRouter({
  scheme = 'standard',
  state: overrides = {},
  legacyForm = false,
  password = PASSWORD,
} = {}) {
  const state = { ...defaultState(), ...overrides };
  const keys = keysOf(scheme);
  let seq = 900000;
  // stok -> { k, i } of a session.
  const sessions = new Map();

  const json = (status, value, headers = {}) => ({
    status,
    headers,
    body: JSON.stringify(value),
  });
  const html403 = () => ({ status: 403, headers: {}, body: '<html>403 Forbidden</html>' });

  /**
   * @description The answer of a form, `null` for an unknown one.
   * @param {string} path - admin/status…
   * @param {object} params - The decoded parameters.
   * @returns {object} `{ success, data }` or `{ success: false, errorcode }`.
   */
  function form(path, params) {
    const name = `${path}?form=${params.form}`;
    request.calls.push({ form: name, operation: params.operation });
    if (state.unsupported.has(name)) {
      return { success: false, errorcode: 'not support' };
    }
    switch (name) {
      case 'admin/status?form=all':
        return { success: true, data: state.status };
      case 'admin/status?form=perf':
        return { success: true, data: { cpu_usage: 0.11, mem_usage: 0.5 } };
      case 'admin/smart_network?form=game_accelerator':
        return { success: true, data: state.smart, timeout: false };
      case 'admin/network?form=status_ipv4':
        return { success: true, data: state.ipv4 };
      case 'admin/firmware?form=upgrade':
        return { success: true, data: state.firmware };
      case 'admin/system?form=reboot':
        request.rebooted += 1;
        return { success: true, data: {} };
      case 'admin/system?form=logout':
        return { success: true, data: {} };
      default:
        if (path === 'admin/wireless' && params.operation === 'write') {
          request.writes.push({ form: params.form, enable: params.enable });
          state.status[`${params.form}_enable`] = params.enable;
          return { success: true, data: {} };
        }
        return { success: false, errorcode: 'unknown form' };
    }
  }

  /**
   * @description Check a login: user hash and password.
   * @param {string} hash - The hash the signature carries.
   * @param {string} encryptedPassword - The hex password.
   * @param {Function} hashOf - md5 or sha256.
   * @returns {boolean} True when right.
   */
  function rightLogin(hash, encryptedPassword, hashOf) {
    return (
      hash === hashOf(USERNAME + password) && decryptPkcs1(encryptedPassword, keys.pwd) === password
    );
  }

  const refusal = () => {
    request.failures += 1;
    return request.failures >= 10
      ? { success: false, errorcode: 'exceeded max attempts', data: { remainingTime: 1800 } }
      : {
          success: false,
          errorcode: 'login failed',
          data: { failureCount: request.failures, attemptsAllowed: 10 - request.failures },
        };
  };

  /**
   * @description The login of the encrypted flavours.
   * @param {object} body - `{ sign, data }`.
   * @returns {object} The HTTP answer.
   */
  function encryptedLogin(body) {
    const signed =
      scheme === 'standard'
        ? decryptPkcs1(body.sign, keys.auth)
        : decryptOaep(body.sign, keys.auth);
    const fields = signed ? query(signed) : null;
    if (!fields?.k || Number(fields.s) !== seq + body.data.length) {
      return html403();
    }
    let clear;
    try {
      clear = query(aesDecrypt(fields.k, fields.i, body.data));
    } catch {
      return html403();
    }
    const seal = (value, headers) =>
      json(200, { data: aesEncrypt(fields.k, fields.i, JSON.stringify(value)) }, headers);
    if (request.lock) {
      return seal({ success: false, errorcode: 'exceeded max attempts', data: {} });
    }
    request.logins += 1;
    const hashOf = scheme === 'standard' ? md5 : sha256;
    if (!rightLogin(fields.h, clear.password, hashOf)) {
      return seal(refusal());
    }
    if ((scheme === 'ax72') !== (clear.confirm === undefined)) {
      return html403();
    }
    sessions.set(STOK, { k: fields.k, i: fields.i, hash: fields.h });
    return seal(
      { success: true, data: { stok: STOK } },
      {
        'set-cookie': [`sysauth=${SYSAUTH}; path=/cgi-bin/luci/`],
      },
    );
  }

  /**
   * @description An authenticated request of the encrypted flavours.
   * @param {object} s - The session.
   * @param {string} path - The form path.
   * @param {object} urlParams - The URL parameters.
   * @param {object} body - `{ sign, data }`.
   * @returns {object} The HTTP answer.
   */
  function encryptedCall(s, path, urlParams, body) {
    const length = body.data.length;
    if (scheme === 'sg') {
      const hash = sha256(body.data);
      const text = `h=${hash}&s=${seq + length}`;
      const expected = [text.slice(0, 53), text.slice(53)]
        .filter(Boolean)
        .map((chunk) => createHmac('sha256', `k=${s.k}&i=${s.i}`).update(chunk).digest('hex'))
        .join('');
      if (body.sign !== expected) {
        return html403();
      }
    } else {
      const signed =
        scheme === 'standard'
          ? decryptPkcs1(body.sign, keys.auth)
          : decryptOaep(body.sign, keys.auth);
      const fields = signed ? query(signed) : {};
      if (fields.h !== s.hash || Number(fields.s) !== seq + length) {
        return html403();
      }
    }
    const clear = aesDecrypt(s.k, s.i, body.data);
    let params;
    if (scheme === 'sg') {
      params = { ...urlParams, ...query(clear) };
    } else if (clear.startsWith('{')) {
      if (legacyForm) {
        return json(200, {
          data: aesEncrypt(s.k, s.i, JSON.stringify({ success: false, errorcode: 'bad body' })),
        });
      }
      params = { form: urlParams.form, ...JSON.parse(clear) };
    } else {
      params = { form: urlParams.form, ...query(clear) };
    }
    return json(200, { data: aesEncrypt(s.k, s.i, JSON.stringify(form(path, params))) });
  }

  const request = async ({ url, headers = {}, body = '' }) => {
    const target = new URL(url);
    const match = /^\/cgi-bin\/luci\/;stok=([^/]*)\/(.+)$/.exec(target.pathname);
    request.requests.push({ path: `${target.pathname}${target.search}`, headers, body });
    if (request.down) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (!match) {
      return { status: 404, headers: {}, body: '' };
    }
    const [, stok, path] = match;
    const urlParams = Object.fromEntries(target.searchParams);
    if (!stok) {
      if (path === 'login' && urlParams.form === 'keys') {
        return json(200, {
          success: true,
          data: { password: [keys.pwd.n, keys.pwd.e], mode: 'router', username: '' },
        });
      }
      if (path === 'login' && urlParams.form === 'auth') {
        seq += 7;
        return json(200, { success: true, data: { key: [keys.auth.n, keys.auth.e], seq } });
      }
      if (path === 'device_config') {
        return json(200, {
          success: true,
          data: { certification: scheme === 'sg' ? ['SG CLS L1 STAGE2'] : [] },
        });
      }
      if (path === 'login' && urlParams.form === 'login') {
        const fields = query(body);
        if (scheme === 'rsa_only') {
          if (!fields.password || fields.sign) {
            return html403();
          }
          request.logins += 1;
          if (decryptPkcs1(fields.password, keys.pwd) !== password) {
            return json(200, refusal());
          }
          sessions.set(STOK, {});
          return json(
            200,
            { success: true, data: { stok: STOK } },
            {
              'set-cookie': `sysauth=${SYSAUTH}; path=/`,
            },
          );
        }
        if (!fields.sign || !fields.data) {
          return json(200, { success: false, errorcode: 'invalid request' });
        }
        return encryptedLogin(fields);
      }
      return { status: 404, headers: {}, body: '' };
    }
    const s = sessions.get(stok);
    if (!s || headers.Cookie !== `sysauth=${SYSAUTH}`) {
      return html403();
    }
    if (scheme === 'rsa_only') {
      const answer = json(200, form(path, { ...urlParams, ...JSON.parse(body || '{}') }));
      if (urlParams.form === 'logout') {
        sessions.delete(stok);
      }
      return answer;
    }
    const answer = encryptedCall(s, path, urlParams, query(body));
    if (urlParams.form === 'logout' || urlParams.form === 'reboot') {
      sessions.delete(stok);
    }
    return answer;
  };
  request.state = state;
  request.calls = [];
  request.requests = [];
  request.writes = [];
  request.logins = 0;
  request.failures = 0;
  request.rebooted = 0;
  request.down = false;
  request.lock = false;
  request.sessions = () => sessions.size;
  request.count = (formName) => request.calls.filter((call) => call.form === formName).length;
  return request;
}

// A Gladys-like object for the pure builders.
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:tplink-router:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  NOW,
  MINUTE,
  ROUTER_MAC,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
  GUEST_MAC,
  PLUG_MAC,
  USERNAME,
  PASSWORD,
  silent,
  knownPath,
  keyPair,
  decryptPkcs1,
  clientEntry,
  defaultState,
  tplinkRouter,
  fakeGladys,
};
