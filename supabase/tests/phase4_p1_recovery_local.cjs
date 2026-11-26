const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness() {
  const timers = new Map();
  const intervals = new Map();
  const channels = [];
  const events = new Map();
  let next = 0;
  const client = {
    channel(topic) {
      const channel = {
        topic, handlers: new Map(),
        on(_type, filter, run) { this.handlers.set(filter.table, run); return this; },
        subscribe(status) { this.status = status; return this; },
      };
      channels.push(channel);
      return channel;
    },
    async removeChannel(channel) { channel.removed = true; },
  };
  const window = {
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type) { events.delete(type); },
  };
  const document = { hidden: false };
  const context = {
    window, document, navigator: { onLine: true },
    setTimeout(run) { timers.set(++next, run); return next; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(run) { intervals.set(++next, run); return next; },
    clearInterval(id) { intervals.delete(id); },
    Error, TypeError,
  };
  const source = fs.readFileSync(path.join(__dirname, '../../js/sync-recovery.js'), 'utf8').replace(/^export /gm, '');
  vm.runInNewContext(source + '\nthis.api = { createRecoveryQueue, watchPortalData, stopPortalRecovery, syncFailureMessage };', context);
  const flush = async () => {
    const work = [...timers.values()];
    timers.clear();
    await Promise.all(work.map(fn => fn()));
  };
  return { ...context.api, client, channels, intervals, events, document, flush };
}

test('disconnect and rejoin reconcile a missed event once, ignoring stale notification content', async () => {
  const h = harness();
  const values = [];
  const issues = [];
  let authority = 1;
  const queue = h.createRecoveryQueue({
    isCurrent: () => true, refresh: async () => { values.push(authority); },
    onError: (error) => issues.push(error),
  });
  queue.status('SUBSCRIBED');
  queue.status('SUBSCRIBED');
  await h.flush();
  queue.status('TIMED_OUT', () => issues.push('disconnect'));
  authority = 2;
  queue.status('SUBSCRIBED');
  queue.invalidate('orders', 'orders');
  queue.invalidate('orders');
  await h.flush();
  assert.deepEqual(values, [1, 2]);
  assert.deepEqual(issues, ['disconnect']);
});

test('Store inventory reconciles a warehouse-only change on a visible stock tick', async () => {
  const h = harness();
  let dbLots = 3;
  const rendered = [];
  const root = { isConnected: true };
  h.watchPortalData({
    client: h.client, root, isCurrent: () => true, needsStockRefresh: () => true,
    tables: ['app_data', 'portal_notifications'], report: () => {},
    refresh: async (_groups, current) => { if (current()) rendered.push(dbLots); },
  });
  await h.flush();
  dbLots = 5;
  h.document.hidden = true;
  [...h.intervals.values()][0]();
  await h.flush();
  assert.deepEqual(rendered, [3]);
  h.document.hidden = false;
  [...h.intervals.values()][0]();
  await h.flush();
  assert.deepEqual(rendered, [3, 5]);
});

test('Seller product notifications coalesce and portal replacement discards its pending response', async () => {
  const h = harness();
  const values = [];
  let resolveRead;
  let reads = 0;
  const root = { isConnected: true };
  h.watchPortalData({
    client: h.client, root, isCurrent: () => true, tables: ['app_data'], report: () => {},
    refresh: async (_groups, current) => {
      reads++;
      const latest = await new Promise(resolve => { resolveRead = resolve; });
      if (current()) values.push(latest);
    },
  });
  const seller = h.channels[0];
  seller.status('SUBSCRIBED');
  seller.handlers.get('app_data')({ new: { stock: 90 } });
  seller.handlers.get('app_data')({ old: { stock: 100 } });
  const inFlight = h.flush();
  assert.equal(reads, 1);
  h.stopPortalRecovery();
  resolveRead('previous seller');
  await inFlight;
  assert.deepEqual(values, []);
  assert.equal(seller.removed, true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.events.size, 0);
  h.watchPortalData({
    client: h.client, root, isCurrent: () => true, tables: ['app_data'], report: () => {},
    refresh: async () => values.push('new seller products'),
  });
  await h.flush();
  assert.deepEqual(values, ['new seller products']);
  assert.notEqual(h.channels[1].topic, seller.topic);
  h.stopPortalRecovery();
});

test('cloud errors distinguish auth, permission, network and other failures without leaking payloads', () => {
  const h = harness();
  assert.match(h.syncFailureMessage({ status: 401 }), /Sign in/);
  assert.match(h.syncFailureMessage({ code: '42501' }), /portal access/);
  assert.match(h.syncFailureMessage(new TypeError('private URL')), /Reconnect/);
  assert.match(h.syncFailureMessage({ status: 400, message: 'private row' }), /contact Furgo Support/);
  assert.doesNotMatch(h.syncFailureMessage({ status: 400, message: 'private row' }), /private row/);
});
