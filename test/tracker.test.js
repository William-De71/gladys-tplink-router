import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextPresence, internetUp, diffInternet, diffWanIp } from '../src/tracker.js';

const MIN = 60000;

test('presence: the baseline fires nothing, arriving is immediate, leaving waits', () => {
  assert.deepEqual(nextPresence(undefined, true, 0, 5 * MIN), {
    present: true,
    lastSeen: 0,
    event: null,
  });
  assert.deepEqual(nextPresence(undefined, false, 0, 5 * MIN), {
    present: false,
    lastSeen: null,
    event: null,
  });
  const here = { present: true, lastSeen: 0 };
  assert.equal(nextPresence(here, false, 4 * MIN, 5 * MIN).event, null);
  assert.equal(nextPresence(here, false, 4 * MIN, 5 * MIN).present, true);
  assert.equal(nextPresence(here, false, 5 * MIN, 5 * MIN).event, 'left');
  assert.equal(nextPresence({ present: false, lastSeen: 0 }, false, 9 * MIN, 5 * MIN).event, null);
  assert.equal(
    nextPresence({ present: false, lastSeen: 0 }, true, 9 * MIN, 5 * MIN).event,
    'arrived',
  );
});

test('internet: a change between up and down, connecting counts as down', () => {
  assert.equal(diffInternet(undefined, { status: 'disconnected' }), null, 'baseline');
  assert.deepEqual(diffInternet({ status: 'connected' }, { status: 'disconnected' }), {
    status: 'disconnected',
    previous: 'connected',
  });
  assert.deepEqual(diffInternet({ status: 'connecting' }, { status: 'connected' }), {
    status: 'connected',
    previous: 'disconnected',
  });
  assert.equal(diffInternet({ status: 'connecting' }, { status: 'disconnected' }), null);
  assert.equal(diffInternet({ status: 'connected' }, { status: 'unknown' }), null);
  assert.equal(internetUp('connected'), true);
  assert.equal(internetUp('unknown'), null);
});

test('public address: a change between two known addresses only', () => {
  assert.equal(diffWanIp(undefined, { ip: '90.1.2.3' }), null, 'baseline');
  assert.equal(diffWanIp({ ip: null }, { ip: '90.1.2.3' }), null, 'back from no address');
  assert.equal(diffWanIp({ ip: '90.1.2.3' }, { ip: null }), null, 'internet down');
  assert.equal(diffWanIp({ ip: '90.1.2.3' }, { ip: '90.1.2.3' }), null);
  assert.deepEqual(diffWanIp({ ip: '90.1.2.3' }, { ip: '90.1.2.4' }), {
    ip: '90.1.2.4',
    previous: '90.1.2.3',
  });
});
