// The router client against the fake router: the four login flavours, the
// session lifecycle, and the errors the app turns into messages.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTplinkClient, loginRefusal, sysauthOf, AUTH_PAUSE_MS } from '../src/tplink-api.js';
import { tplinkRouter, NOW, PASSWORD } from './helpers/fixtures.js';

const CONFIG = {
  url: 'http://192.168.0.1',
  username: 'admin',
  password: PASSWORD,
  verifyTls: false,
};

/**
 * @description A client of a fake router.
 * @param {object} [options] - `{ fake, config, clock }`.
 * @returns {object} `{ api, fake, clock, config }`.
 */
function clientOf({ fake = tplinkRouter(), config = { ...CONFIG }, clock = { now: NOW } } = {}) {
  const api = createTplinkClient({ getConfig: () => config, request: fake, now: () => clock.now });
  return { api, fake, clock, config };
}

const readStatus = (api) => api.session((session) => session.read('admin/status', 'all'));

for (const scheme of ['standard', 'ax72', 'sg', 'rsa_only']) {
  test(`the ${scheme} flavour logs in, reads, and logs out`, async () => {
    const { api, fake } = clientOf({ fake: tplinkRouter({ scheme }) });
    const status = await readStatus(api);
    assert.equal(status.wan_ipv4_ipaddr, '90.12.34.56');
    assert.equal(api.scheme(), scheme);
    assert.equal(fake.logins, 1);
    assert.equal(fake.sessions(), 0, 'logged out: the web page is free');
    // The flavour is remembered: the next session goes straight to it.
    const before = fake.requests.length;
    await readStatus(api);
    const paths = fake.requests.slice(before).map((r) => r.path);
    assert.ok(!paths.some((path) => path.includes('device_config')), 'no detection again');
    // The password never travels in clear, and never in an URL.
    assert.ok(fake.requests.every((r) => !r.path.includes(PASSWORD) && !r.body.includes(PASSWORD)));
  });
}

test('a write goes in the parameters of the flavour, and is applied', async () => {
  for (const scheme of ['standard', 'sg', 'rsa_only']) {
    const { api, fake } = clientOf({ fake: tplinkRouter({ scheme }) });
    await api.session((session) => session.write('admin/wireless', 'guest_5g', { enable: 'on' }));
    assert.deepEqual(fake.writes, [{ form: 'guest_5g', enable: 'on' }], scheme);
  }
});

test('a firmware older than the JSON bodies is read with form bodies, remembered', async () => {
  const { api, fake } = clientOf({ fake: tplinkRouter({ legacyForm: true }) });
  const status = await readStatus(api);
  assert.equal(status.lan_ipv4_ipaddr, '192.168.0.1');
  const before = fake.requests.length;
  await readStatus(api);
  // login keys, auth, login, status, logout: no JSON attempt any more.
  assert.equal(fake.requests.length - before, 5);
});

test('a refused password stops at once and pauses the logins for 15 minutes', async () => {
  const { api, fake, clock } = clientOf({ fake: tplinkRouter({ password: 'other' }) });
  await assert.rejects(
    readStatus(api),
    (err) => err.kind === 'auth' && /9 attempt/.test(err.message),
  );
  assert.equal(fake.logins, 1);
  await assert.rejects(readStatus(api), { kind: 'auth' });
  assert.equal(fake.logins, 1, 'no second attempt during the pause');
  clock.now += AUTH_PAUSE_MS + 1;
  await assert.rejects(readStatus(api), { kind: 'auth' });
  assert.equal(fake.logins, 2);
});

test('a refused password on a guessed flavour lets the next one try, then pauses', async () => {
  // A 512-bit signature key: ax72 is tried first, then standard.
  const fake = tplinkRouter({ scheme: 'ax72', password: 'other' });
  const { api } = clientOf({ fake });
  await assert.rejects(readStatus(api), { kind: 'auth' });
  // ax72 refused the password; standard did not fit; the refusal stands.
  assert.equal(fake.logins, 1);
  await assert.rejects(readStatus(api), { kind: 'auth' });
  assert.equal(fake.logins, 1, 'paused like any refusal');
});

test('a locked login waits for the time the router gives', async () => {
  const fake = tplinkRouter();
  fake.lock = true;
  const { api, clock } = clientOf({ fake });
  await assert.rejects(readStatus(api), (err) => err.kind === 'locked' && err.retryAfter === 1800);
  fake.lock = false;
  await assert.rejects(readStatus(api), { kind: 'locked' });
  clock.now += 1800 * 1000 + 1;
  await readStatus(api);
});

test('an address without TP-Link login page, or without answer', async () => {
  const notTplink = async () => ({ status: 404, headers: {}, body: 'Not found' });
  const { api } = clientOf({ fake: notTplink });
  await assert.rejects(readStatus(api), { kind: 'not_found' });

  const down = tplinkRouter();
  down.down = true;
  const second = clientOf({ fake: down });
  await assert.rejects(readStatus(second.api), { kind: 'unreachable' });
});

test('a firmware no flavour fits is reported as unsupported', async () => {
  // A login page whose login answers 403 to everything.
  const fake = tplinkRouter();
  const strict = async (options) => {
    if (options.url.includes('form=login')) {
      return { status: 403, headers: {}, body: '<html></html>' };
    }
    return fake(options);
  };
  const { api } = clientOf({ fake: strict });
  await assert.rejects(readStatus(api), { kind: 'unsupported' });
});

test('sessions never overlap: the second waits for the logout of the first', async () => {
  const { api, fake } = clientOf();
  const order = [];
  await Promise.all([
    api.session(async (session) => {
      order.push('a-start');
      await session.read('admin/status', 'all');
      order.push('a-end');
    }),
    api.session(async () => {
      order.push('b-start');
    }),
  ]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start']);
  assert.equal(fake.sessions(), 0);
});

test('a form the model does not have is a not_found error, the session goes on', async () => {
  const fake = tplinkRouter();
  fake.state.unsupported.add('admin/status?form=perf');
  const { api } = clientOf({ fake });
  const status = await api.session(async (session) => {
    await assert.rejects(session.read('admin/status', 'perf'), { kind: 'not_found' });
    return session.read('admin/status', 'all');
  });
  assert.ok(status);
});

test('reboot: fired without waiting for the answer, no logout after it', async () => {
  const { api, fake } = clientOf();
  await api.session((session) => session.fire('admin/system', 'reboot'));
  assert.equal(fake.rebooted, 1);
  assert.equal(fake.count('admin/system?form=logout'), 0);
});

test('reset forgets the flavour and the login pause', async () => {
  const fake = tplinkRouter({ password: 'other' });
  const { api, config } = clientOf({ fake });
  await assert.rejects(readStatus(api), { kind: 'auth' });
  config.password = 'other';
  api.reset();
  await readStatus(api);
  assert.equal(api.scheme(), 'standard');
});

test('login refusals and cookies, as the firmwares word them', () => {
  assert.equal(loginRefusal({ errorcode: 'login failed', data: {} }).kind, 'auth');
  assert.equal(
    loginRefusal({ data: { errorcode: 'invalid password', attemptsAllowed: 0 } }).kind,
    'locked',
  );
  const locked = loginRefusal({ errorcode: 'exceeded max attempts', data: { remainingTime: 600 } });
  assert.equal(locked.kind, 'locked');
  assert.equal(locked.retryAfter, 600);
  assert.equal(sysauthOf({ 'set-cookie': ['a=b', 'sysauth=xyz; path=/'] }), 'xyz');
  assert.equal(sysauthOf({ 'set-cookie': 'sysauth=abc;' }), 'abc');
  assert.equal(sysauthOf({}), null);
});
