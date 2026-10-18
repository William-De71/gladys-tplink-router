// -----------------------------------------------------------------------------
// Client of the web interface of TP-Link and Mercusys routers (Archer, Archer
// BE, Mercusys MR/Halo… with the "LuCI" interface: the address shows
// /webpages/index.html and the API lives under /cgi-bin/luci/).
//
// The protocol was learned from the tplinkrouterc6u Python library (the
// library of the Home Assistant "TP-Link Router" integration, see NOTICE);
// this is a new implementation, no code was copied. Four flavours of the same
// login exist, by firmware:
//
//   standard   Archer C6/AX/BE…: the password is RSA (PKCS#1 v1.5) encrypted
//              with the key of /login?form=keys; every request is AES-128-CBC
//              encrypted with a key the client makes up, and signed with RSA
//              chunks of "h=md5(user+password)&s=seq+length" (the login
//              signature also announces the AES key: "k=…&i=…&").
//   ax72       the same with SHA-256 instead of MD5 and OAEP chunks
//              (Archer AX72, 512-bit signature key), no `confirm`.
//   sg         routers certified "SG CLS L1 STAGE2" or "EU CE RED" (Archer
//              BE3600, BE230…): SHA-256, OAEP login signature, HMAC-SHA256
//              request signatures over SHA-256(encrypted body).
//   rsa_only   firmware 1.11+ of some models: the password is RSA encrypted
//              (2048-bit key), the requests are plain JSON.
//
// The web interface admits one administrator at a time: every reading opens
// a session (login with `confirm=true`, which takes over), reads, and closes
// it, like the Home Assistant integration. `session()` queues the callers so
// that two sessions never overlap. After a refused password, no login is
// tried for 15 minutes: the router locks the account after a few failures.
//
// node:http(s) rather than fetch: the HTTPS certificate of the router is
// self-signed, and only node:https lets the user skip its check without a
// dependency. Errors carry a `kind` the app turns into a message:
//   auth         wrong password (or user name)
//   locked       too many failed logins, `retryAfter` seconds
//   unsupported  a TP-Link login page, but none of the flavours logs in
//   tls          the certificate is refused (verify_tls on)
//   not_found    404: no TP-Link login page at this address
//   unreachable  network error, timeout
//   http         any other status or answer
// -----------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import {
  rsaPkcs1,
  rsaOaep,
  oaepStep,
  aesEncrypt,
  aesDecrypt,
  md5,
  sha256,
  hmacSha256,
  chunks,
} from './crypto.js';

const TIMEOUT_MS = 15000;
const SCHEMES = { STANDARD: 'standard', AX72: 'ax72', SG: 'sg', RSA_ONLY: 'rsa_only' };
// Chunk length of the signatures, sized for PKCS#1 v1.5 on the router side.
const SIGN_CHUNK = 53;
// Certifications that switch the router to the "sg" flavour.
const SG_CERTIFICATIONS = ['SG CLS L1 STAGE2', 'EU CE RED'];
// A password key this long (2048 bits) is the "rsa_only" firmware; a signature
// key this short (512 bits) the "ax72" one.
const RSA_ONLY_KEY_HEX = 512;
const AX72_KEY_HEX = 128;
// No new login after a refused password for this long.
const AUTH_PAUSE_MS = 15 * 60 * 1000;
// A lock without a stated duration.
const DEFAULT_LOCK_SECONDS = 30 * 60;
// Operations that only read: the "sg" flavour sends them in the URL.
const READ_OPERATIONS = new Set(['read', 'load', 'loadDevice']);

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

class TplinkError extends Error {
  /**
   * @param {string} kind - auth, locked, unsupported, tls, not_found, unreachable, http.
   * @param {string} message - The message (never carries the password).
   * @param {object} [extra] - `{ status, retryAfter }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'TplinkError';
    this.kind = kind;
    this.status = extra.status;
    this.retryAfter = extra.retryAfter;
  }
}

// A login answer that does not fit the flavour tried (403, not JSON, cannot
// be decrypted): the next flavour may fit.
class SchemeMismatch extends Error {}

/**
 * @description The error of a failed connection.
 * @param {Error} err - The socket error.
 * @returns {Error} The error.
 */
function networkError(err) {
  if (err instanceof TplinkError || err instanceof SchemeMismatch) {
    return err;
  }
  if (TLS_CODES.has(err.code)) {
    return new TplinkError('tls', `HTTPS certificate refused: ${err.code}`);
  }
  return new TplinkError('unreachable', `Router unreachable: ${err.code ?? err.message}`);
}

/**
 * @description The default transport: one HTTP(S) request, its whole body.
 * @param {object} options - `{ url, method, headers, body, rejectUnauthorized, timeoutMs }`.
 * @returns {Promise<{ status: number, headers: object, body: string }>} The answer.
 */
function nodeRequest({ url, method, headers, body, rejectUnauthorized, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      target,
      { method, headers, rejectUnauthorized, timeout: timeoutMs },
      (res) => {
        const parts = [];
        res.on('data', (chunk) => parts.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(parts).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * @description Parse a JSON answer, null when it is not JSON.
 * @param {string} body - The answer.
 * @returns {object|null} The value.
 */
function parseJson(body) {
  try {
    const value = JSON.parse(body);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/**
 * @description `a=1&b=2` out of an object, values URL-encoded.
 * @param {object} params - The parameters.
 * @returns {string} The query.
 */
const formOf = (params) =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');

/**
 * @description The sysauth cookie of a login answer.
 * @param {object} headers - The answer headers.
 * @returns {string|null} The cookie value.
 */
function sysauthOf(headers = {}) {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const cookie of list) {
    const match = /sysauth=([^;]+)/.exec(cookie);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * @description The error of a refused login, out of the router's answer
 * (`{ success: false, errorcode, data: { errorcode, failureCount,
 * attemptsAllowed, … } }`; the wording varies by firmware).
 * @param {object} answer - The decoded answer.
 * @returns {TplinkError} The error.
 */
function loginRefusal(answer) {
  const data = answer?.data && typeof answer.data === 'object' ? answer.data : {};
  const code = String(data.errorcode ?? answer?.errorcode ?? '');
  const attemptsLeft = Number(data.attemptsAllowed);
  const locked =
    /exceed|lock|max/i.test(code) || (Number.isFinite(attemptsLeft) && attemptsLeft <= 0);
  if (locked) {
    const seconds = Number(data.remainingTime ?? data.lockTime);
    const retryAfter = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_LOCK_SECONDS;
    return new TplinkError('locked', `The router locked the login (${code || 'locked'})`, {
      retryAfter,
    });
  }
  const left = Number.isFinite(attemptsLeft) ? `, ${attemptsLeft} attempt(s) left` : '';
  return new TplinkError('auth', `The router refused the password (${code || 'refused'}${left})`);
}

/**
 * @description Create the router client.
 * @param {object} options - Options.
 * @param {Function} options.getConfig - `() => ({ url, username, password, verifyTls })`.
 * @param {Function} [options.request] - Transport (tests): same contract as nodeRequest.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.random] - `(length) => Buffer` (tests).
 * @param {object} [options.logger] - Logger (debug only).
 * @returns {object} The client.
 * @example
 * const api = createTplinkClient({ getConfig: () => config });
 * const status = await api.session((s) => s.read('admin/status', 'all'));
 */
function createTplinkClient({
  getConfig,
  request = nodeRequest,
  now = () => Date.now(),
  random = randomBytes,
  logger = null,
}) {
  // The flavour that logged in, for the account it logged in with.
  let scheme = null;
  let schemeFor = null;
  let queue = Promise.resolve();
  // No login before this instant (a lock, or a refused password).
  let blockedUntil = 0;
  let blockedError = null;
  // Firmwares older than the JSON bodies (standard flavour) read form bodies.
  let formPayload = false;

  const accountOf = (config) => `${config.url}\n${config.username}\n${config.password}`;
  const hex16 = () => random(8).toString('hex');
  const digits16 = () => Array.from({ length: 16 }, () => randomInt(10)).join('');

  /**
   * @description Send one POST to the router.
   * @param {string} path - Path after the host, query included.
   * @param {string} body - The body.
   * @param {object} [headers] - Headers.
   * @returns {Promise<{ status: number, headers: object, body: string }>} The answer.
   */
  async function send(path, body, headers = {}) {
    const { url, verifyTls } = getConfig();
    try {
      return await request({
        url: `${url}${path}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
        body,
        rejectUnauthorized: verifyTls,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (err) {
      throw networkError(err);
    }
  }

  /**
   * @description A form of the login page (no session yet).
   * @param {string} form - keys, auth…
   * @returns {Promise<object>} The `data` of the answer.
   */
  async function loginPage(form) {
    const answer = await send(`/cgi-bin/luci/;stok=/login?form=${form}&operation=read`, '');
    if (answer.status === 404) {
      throw new TplinkError('not_found', 'No TP-Link login page at this address (404)', {
        status: 404,
      });
    }
    const json = parseJson(answer.body);
    if (answer.status !== 200 || !json?.data) {
      throw new TplinkError(
        'not_found',
        `No TP-Link login page at this address (${answer.status})`,
        {
          status: answer.status,
        },
      );
    }
    return json.data;
  }

  /**
   * @description Whether the router carries a certification of the "sg" flavour.
   * @returns {Promise<boolean>} True for sg.
   */
  async function sgCertified() {
    const { url } = getConfig();
    try {
      const answer = await send(
        '/cgi-bin/luci/;stok=/device_config?form=config',
        'operation=read',
        {
          Referer: `${url}/webpages/index.html`,
        },
      );
      const certifications = parseJson(answer.body)?.data?.certification;
      return (
        Array.isArray(certifications) && certifications.some((c) => SG_CERTIFICATIONS.includes(c))
      );
    } catch (err) {
      if (err.kind === 'unreachable' || err.kind === 'tls') {
        throw err;
      }
      return false;
    }
  }

  /**
   * @description The keys of a login: password key, signature key and sequence.
   * @param {boolean} withAuth - Read the signature key too.
   * @returns {Promise<object>} `{ pwdN, pwdE, n, e, seq }`.
   */
  async function readKeys(withAuth) {
    const keys = await loginPage('keys');
    const [pwdN, pwdE] = Array.isArray(keys.password) ? keys.password : [];
    if (!pwdN || !pwdE) {
      throw new TplinkError('not_found', 'The login page gives no password key');
    }
    if (!withAuth) {
      return { pwdN, pwdE };
    }
    const auth = await loginPage('auth');
    const [n, e] = Array.isArray(auth.key) ? auth.key : [];
    const seq = Number(auth.seq);
    if (!n || !e || !Number.isFinite(seq)) {
      throw new SchemeMismatch('The login page gives no signature key');
    }
    return { pwdN, pwdE, n, e, seq };
  }

  // --- The flavours ----------------------------------------------------------------
  // Each one: `login(config, keys)` -> session, `call(session, path, params)` ->
  // decoded answer. A session is { scheme, stok, sysauth, … }.

  /**
   * @description The AES-encrypted flavours (standard, ax72, sg).
   * @param {string} name - A SCHEMES value.
   * @returns {object} `{ login, call }`.
   */
  function encryptedFlavour(name) {
    const hashOf = (config) =>
      name === SCHEMES.STANDARD
        ? md5(config.username + config.password)
        : sha256(config.username + config.password);

    /**
     * @description The signature of a body.
     * @param {object} s - The session.
     * @param {number} length - Length of the encrypted body.
     * @param {boolean} login - A login request.
     * @returns {string} The hex signature.
     */
    function sign(s, length, login) {
      const aes = `k=${s.key}&i=${s.iv}`;
      if (name === SCHEMES.SG && !login) {
        return chunks(`h=${s.hash}&s=${s.seq + length}`, SIGN_CHUNK)
          .map((chunk) => hmacSha256(aes, chunk))
          .join('');
      }
      const text = `${login || name === SCHEMES.AX72 ? `${aes}&` : ''}h=${s.hash}&s=${s.seq + length}`;
      if (name === SCHEMES.STANDARD) {
        return chunks(text, SIGN_CHUNK)
          .map((chunk) => rsaPkcs1(chunk, s.n, s.e, random))
          .join('');
      }
      const step = oaepStep(s.n, SIGN_CHUNK);
      // ax72: 53-character pieces cut again to what OAEP takes; sg: flat.
      const pieces =
        name === SCHEMES.AX72
          ? chunks(text, SIGN_CHUNK).flatMap((piece) => chunks(piece, step))
          : chunks(text, step);
      return pieces.map((chunk) => rsaOaep(chunk, s.n, s.e, random)).join('');
    }

    /**
     * @description Encrypt and sign a body.
     * @param {object} s - The session.
     * @param {string} clear - The clear body.
     * @param {boolean} login - A login request.
     * @returns {string} The form body.
     */
    function seal(s, clear, login) {
      const data = aesEncrypt(s.key, s.iv, clear);
      if (name === SCHEMES.SG && !login) {
        // Every request signs the hash of its own encrypted body.
        s.hash = sha256(data);
      }
      return `sign=${sign(s, data.length, login)}&data=${encodeURIComponent(data)}`;
    }

    /**
     * @description Decrypt an answer `{ data: base64 }`.
     * @param {object} s - The session.
     * @param {{ status: number, body: string }} answer - The answer.
     * @returns {object|null} The decoded answer, null when it cannot be.
     */
    function open(s, answer) {
      const json = parseJson(answer.body);
      if (!json || typeof json.data !== 'string') {
        return null;
      }
      try {
        return parseJson(aesDecrypt(s.key, s.iv, json.data));
      } catch {
        return null;
      }
    }

    return {
      async login(config, keys) {
        const sg = name === SCHEMES.SG;
        const s = {
          scheme: name,
          key: sg ? digits16() : hex16(),
          iv: sg ? digits16() : hex16(),
          hash: hashOf(config),
          seq: keys.seq,
          n: keys.n,
          e: keys.e,
          stok: null,
          sysauth: null,
          payload: formPayload ? 'form' : 'json',
        };
        const password = rsaPkcs1(config.password, keys.pwdN, keys.pwdE, random);
        const clear = `operation=login&password=${password}${name === SCHEMES.AX72 ? '' : '&confirm=true'}`;
        const { url } = getConfig();
        const answer = await send(
          '/cgi-bin/luci/;stok=/login?form=login',
          seal(s, clear, true),
          sg ? { Referer: `${url}/webpages/index.html` } : {},
        );
        const decoded = answer.status === 200 ? open(s, answer) : null;
        if (!decoded) {
          throw new SchemeMismatch(`Login answer ${answer.status} not readable as ${name}`);
        }
        if (!decoded.success || !decoded.data?.stok) {
          throw loginRefusal(decoded);
        }
        // The login hash of sg is replaced by the body hashes from now on.
        s.stok = decoded.data.stok;
        s.sysauth = sysauthOf(answer.headers);
        return s;
      },

      async call(s, path, form, params) {
        const { url } = getConfig();
        const operation = String(params.operation ?? '');
        let query;
        let clear;
        if (name === SCHEMES.SG) {
          const read = READ_OPERATIONS.has(operation);
          query = `form=${form}${read ? `&operation=${operation}` : ''}`;
          clear = read ? '' : formOf(params);
        } else if (s.payload === 'form') {
          query = `form=${form}`;
          clear = formOf(params);
        } else {
          query = `form=${form}&${formOf(params)}`;
          clear = JSON.stringify(params);
        }
        const answer = await send(
          `/cgi-bin/luci/;stok=${s.stok}/${path}?${query}`,
          seal(s, clear, false),
          {
            ...(s.sysauth ? { Cookie: `sysauth=${s.sysauth}` } : {}),
            ...(name === SCHEMES.SG ? { Referer: `${url}/webpages/index.html`, Origin: url } : {}),
          },
        );
        return { status: answer.status, decoded: answer.status === 200 ? open(s, answer) : null };
      },
    };
  }

  /**
   * @description The plain JSON flavour of firmware 1.11+ (rsa_only).
   * @returns {object} `{ login, call }`.
   */
  function rsaOnlyFlavour() {
    return {
      async login(config, keys) {
        const { url } = getConfig();
        const password = rsaPkcs1(config.password, keys.pwdN, keys.pwdE, random);
        const answer = await send(
          '/cgi-bin/luci/;stok=/login?form=login',
          `operation=login&password=${password}`,
          { Referer: `${url}/webpages/index.html` },
        );
        const json = answer.status === 200 ? parseJson(answer.body) : null;
        if (!json || typeof json.data === 'string' || !('success' in json)) {
          throw new SchemeMismatch(`Login answer ${answer.status} not readable as rsa_only`);
        }
        if (!json.success || !json.data?.stok) {
          throw loginRefusal(json);
        }
        return {
          scheme: SCHEMES.RSA_ONLY,
          stok: json.data.stok,
          sysauth: sysauthOf(answer.headers),
        };
      },

      async call(s, path, form, params) {
        const { url } = getConfig();
        const answer = await send(
          `/cgi-bin/luci/;stok=${s.stok}/${path}?form=${form}&${formOf(params)}`,
          JSON.stringify(params),
          {
            'Content-Type': 'application/json',
            Referer: `${url}/webpages/index.html`,
            Origin: url,
            ...(s.sysauth ? { Cookie: `sysauth=${s.sysauth}` } : {}),
          },
        );
        return {
          status: answer.status,
          decoded: answer.status === 200 ? parseJson(answer.body) : null,
        };
      },
    };
  }

  const FLAVOURS = {
    [SCHEMES.STANDARD]: encryptedFlavour(SCHEMES.STANDARD),
    [SCHEMES.AX72]: encryptedFlavour(SCHEMES.AX72),
    [SCHEMES.SG]: encryptedFlavour(SCHEMES.SG),
    [SCHEMES.RSA_ONLY]: rsaOnlyFlavour(),
  };

  /**
   * @description The flavours worth a login, most specific first.
   * @returns {Promise<string[]>} SCHEMES values.
   */
  async function candidates() {
    if (await sgCertified()) {
      return [SCHEMES.SG];
    }
    const keys = await readKeys(false);
    const list = [];
    if (keys.pwdN.length >= RSA_ONLY_KEY_HEX) {
      list.push(SCHEMES.RSA_ONLY);
    }
    try {
      const auth = await readKeys(true);
      if (auth.n.length === AX72_KEY_HEX) {
        list.push(SCHEMES.AX72);
      }
      list.push(SCHEMES.STANDARD);
    } catch (err) {
      if (!(err instanceof SchemeMismatch)) {
        throw err;
      }
    }
    return list;
  }

  /**
   * @description Log in with one flavour: fresh keys each time (the sequence
   * moves), one retry when the answer does not fit (as the web page does).
   * @param {string} name - A SCHEMES value.
   * @returns {Promise<object>} The session.
   */
  async function loginWith(name) {
    const config = getConfig();
    let lastMismatch = null;
    for (let attempt = 0; attempt < (name === SCHEMES.RSA_ONLY ? 1 : 2); attempt += 1) {
      const keys = await readKeys(name !== SCHEMES.RSA_ONLY);
      try {
        return await FLAVOURS[name].login(config, keys);
      } catch (err) {
        if (!(err instanceof SchemeMismatch)) {
          throw err;
        }
        lastMismatch = err;
      }
    }
    throw lastMismatch;
  }

  /**
   * @description Open a session: the known flavour, else each candidate until
   * one logs in. A refused password stops at once (no other attempt).
   * @returns {Promise<object>} The session.
   */
  async function login() {
    const config = getConfig();
    if (!config.url || !config.password) {
      throw new TplinkError('auth', 'No router address or password configured');
    }
    if (now() < blockedUntil && blockedError) {
      throw blockedError;
    }
    const account = accountOf(config);
    const known = schemeFor === account ? scheme : null;
    const list = known ? [known] : await candidates();
    // A refusal from a flavour that is only a guess may be its own way of
    // saying "not me": the next one gets its chance before giving up.
    let refusal = null;
    for (const [index, name] of list.entries()) {
      try {
        const s = await loginWith(name);
        if (scheme !== name) {
          logger?.info?.(`Router login: ${name} flavour`);
        }
        scheme = name;
        schemeFor = account;
        blockedUntil = 0;
        blockedError = null;
        return s;
      } catch (err) {
        if (err.kind === 'auth' && !known && index < list.length - 1) {
          refusal = err;
          continue;
        }
        if (err.kind === 'auth' || err.kind === 'locked') {
          blockedUntil = now() + (err.kind === 'locked' ? err.retryAfter * 1000 : AUTH_PAUSE_MS);
          blockedError = err;
          throw err;
        }
        if (!(err instanceof SchemeMismatch)) {
          throw err;
        }
        logger?.debug?.(`Router login: ${name} does not fit (${err.message})`);
      }
    }
    if (refusal) {
      blockedUntil = now() + AUTH_PAUSE_MS;
      blockedError = refusal;
      throw refusal;
    }
    if (known) {
      // A firmware update may have changed the flavour: detect it next time.
      scheme = null;
      schemeFor = null;
    }
    throw new TplinkError(
      'unsupported',
      'This TP-Link interface did not accept any known login flavour',
    );
  }

  /**
   * @description One request of an open session.
   * @param {object} s - The session.
   * @param {string} path - admin/status…
   * @param {string} form - all, perf…
   * @param {object} params - `{ operation, … }`.
   * @returns {Promise<unknown>} The `data` of the answer.
   */
  async function call(s, path, form, params) {
    let { status, decoded } = await FLAVOURS[s.scheme].call(s, path, form, params);
    if (
      s.scheme === SCHEMES.STANDARD &&
      s.payload === 'json' &&
      status === 200 &&
      decoded &&
      !decoded.success
    ) {
      // Maybe a firmware older than the JSON bodies: try the form body once.
      s.payload = 'form';
      const retry = await FLAVOURS[s.scheme].call(s, path, form, params);
      if (retry.decoded?.success) {
        formPayload = true;
        ({ status, decoded } = retry);
      } else {
        s.payload = 'json';
      }
    }
    if (status === 404) {
      throw new TplinkError('not_found', `The router has no ${path}?form=${form} (404)`, {
        status: 404,
      });
    }
    if (status === 401 || status === 403) {
      throw new TplinkError('http', `The router refused the session on ${path} (${status})`, {
        status,
      });
    }
    if (!decoded) {
      throw new TplinkError('http', `Unreadable answer ${status} on ${path}?form=${form}`, {
        status,
      });
    }
    if (!decoded.success) {
      const code = decoded.errorcode ?? decoded.data?.errorcode ?? 'error';
      throw new TplinkError('not_found', `The router refused ${path}?form=${form} (${code})`);
    }
    return 'data' in decoded ? decoded.data : decoded;
  }

  /**
   * @description Log in, run `work` with the session, log out. Callers are
   * queued: never two sessions at a time.
   * @param {Function} work - `async (session) => value`; the session has
   * `read(path, form, operation?)` and `write(path, form, params?)`.
   * @returns {Promise<unknown>} What `work` returns.
   */
  function session(work) {
    const run = queue.then(async () => {
      const s = await login();
      const handle = {
        scheme: s.scheme,
        read: (path, form, operation = 'read') => call(s, path, form, { operation }),
        write: (path, form, params = {}) => call(s, path, form, { operation: 'write', ...params }),
        /**
         * @description A request whose answer does not matter (the router
         * reboots before answering, or closes the session).
         * @param {string} path - The path.
         * @param {string} form - The form.
         * @returns {Promise<void>}
         */
        fire: async (path, form) => {
          await FLAVOURS[s.scheme].call(s, path, form, { operation: 'write' }).catch(() => {});
          s.closed = true;
        },
      };
      try {
        return await work(handle);
      } finally {
        if (!s.closed) {
          // Free the only administrator seat for the web page.
          await FLAVOURS[s.scheme]
            .call(s, 'admin/system', 'logout', { operation: 'write' })
            .catch(() => {});
        }
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    session,
    /** @description Forget the flavour and the login pause (configuration changed). */
    reset() {
      formPayload = false;
      scheme = null;
      schemeFor = null;
      blockedUntil = 0;
      blockedError = null;
    },
    scheme: () => scheme,
  };
}

export {
  createTplinkClient,
  TplinkError,
  SCHEMES,
  SG_CERTIFICATIONS,
  nodeRequest,
  loginRefusal,
  sysauthOf,
  AUTH_PAUSE_MS,
};
