// Synthetic in-memory regression; no network or database connection.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness({ legacy = true } = {}) {
  let source = fs.readFileSync(require('node:path').join(__dirname, '../../js/app-data-sync.js'), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const recovery = fs.readFileSync(require('node:path').join(__dirname, '../../js/sync-recovery.js'), 'utf8').replace(/^export /gm, '');
  const orders = fs.readFileSync(require('node:path').join(__dirname, '../../js/marketplace-order-reconciliation.js'), 'utf8').replace(/^export /gm, '');
  source = recovery + '\n' + orders + '\n' + source;
  source += '\n;globalThis.testApi = { ready: () => { legacyReady = true; }, applyLegacyRows, reconcileMarketplaceOrders, readMarketplaceOrderCache, cacheSyncedRecords, loadCloudAppData, captureCloudSession, installStorageMirror, stopCloudAppData, createSharedAppDataSaver, loadSharedSettings, readSharedAppData, reconcile: () => scheduleSharedSettingsRefresh(sharedSession), refreshMarketplaceCatalogFromDatabase, setOwner: owner => { marketplaceCacheOwner = owner; }, setChannel: channel => { realtimeChannel = channel; }, state: () => ({ activeUserId, activeRole, dedicatedTablesReady, marketplaceCacheOwner }) };';
  class Storage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }
  const calls = [];
  const emitted = [];
  const supabase = {
    removeChannel: channel => { calls.push(['remove', channel]); return Promise.resolve(); },
    from: table => ({ upsert: async payload => { calls.push(['upsert', table, payload]); return { error: null }; } }),
  };
  const context = { Storage, localStorage: new Storage(), supabase, structuredClone, console, setTimeout, clearTimeout, window: { dispatchEvent(event) { emitted.push(event); }, addEventListener() {}, removeEventListener() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    StorageEvent: class {}, uploadMarketplaceLegacySnapshots() {} };
  vm.runInNewContext(source, context);
  if (legacy) context.testApi.ready();
  return { ...context, calls, emitted };
}

test('stopping a session removes its channel and prevents subsequent mirror writes', async () => {
  const h = harness();
  h.testApi.installStorageMirror('synthetic-user', 'customer');
  h.testApi.setChannel('synthetic-channel');
  h.testApi.stopCloudAppData();
  h.localStorage.setItem('furgo-demo-addresses', '[]');
  await Promise.resolve();
  assert.deepEqual(h.calls, [['remove', 'synthetic-channel']]);
  assert.equal(h.testApi.state().activeUserId, '');
  assert.equal(h.testApi.state().marketplaceCacheOwner, '');
  h.testApi.stopCloudAppData();
  assert.equal(h.calls.length, 1);
});

test('a new session writes only with its own identity', async () => {
  const h = harness();
  h.testApi.installStorageMirror('first', 'customer');
  h.testApi.stopCloudAppData();
  h.testApi.installStorageMirror('second', 'customer');
  h.testApi.ready();
  h.localStorage.setItem('furgo-demo-addresses', '[]');
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][2].owner_id, 'second');
  assert.equal(h.calls[0][2].record_id, 'customer:furgo-demo-addresses:second');
});


test('a late catalog response cannot populate a different account cache', async () => {
  const h = harness();
  let resolveQuery;
  h.supabase.from = () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, maybeSingle() { return new Promise(resolve => { resolveQuery = resolve; }); } });
  h.testApi.setOwner('first');
  const pending = h.testApi.refreshMarketplaceCatalogFromDatabase({ expectedOwner: 'first' });
  h.testApi.setOwner('second');
  resolveQuery({ data: { payload: [{ id: 'synthetic-product' }] }, error: null });
  assert.equal(await pending, null);
  assert.equal(h.localStorage.getItem('furgo-demo-marketplace-products'), null);
});

test('out-of-order catalog refresh responses do not replace a newer response', async () => {
  const h = harness();
  const pending = [];
  h.supabase.from = () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, maybeSingle() { return new Promise(resolve => pending.push(resolve)); } });
  h.testApi.setOwner('first');
  const older = h.testApi.refreshMarketplaceCatalogFromDatabase({ expectedOwner: 'first' });
  const newer = h.testApi.refreshMarketplaceCatalogFromDatabase({ expectedOwner: 'first' });
  pending[1]({ data: { payload: [{ id: 'new' }] }, error: null });
  await newer;
  pending[0]({ data: { payload: [{ id: 'old' }] }, error: null });
  assert.equal(await older, null);
  assert.equal(h.localStorage.getItem('furgo-demo-marketplace-products'), '[{"id":"new"}]');
});


test('explicit generic catalog save rejects instead of reporting success', async () => {
  const h = harness();
  h.testApi.installStorageMirror('director', 'director');
  await assert.rejects(h.testApi.createSharedAppDataSaver('furgo-demo-marketplace-products')([]), /catalog controls/);
  assert.equal(h.calls.length, 0);
});

const key = 'furgo-demo-help-center-details';
const firstVersion = '10000000-0000-4000-8000-000000000001';
const nextVersion = '10000000-0000-4000-8000-000000000002';
const sharedRow = (version, payload) => ({
  record_id: `shared:${key}:shared`, scope: 'shared', storage_key: key,
  owner_id: null, sync_version: version, payload,
});

test('save submits the rendered baseline and updates the view only after confirmed persistence', async () => {
  const h = harness();
  h.testApi.installStorageMirror('director', 'director');
  h.testApi.loadSharedSettings([sharedRow(firstVersion, { old: true })]);
  const save = h.testApi.createSharedAppDataSaver(key);
  let resolveRpc;
  h.supabase.rpc = (rpc, args) => {
    assert.equal(rpc, 'save_versioned_shared_app_data');
    assert.equal(args.p_expected_version, firstVersion);
    assert.equal(args.p_actor, 'director');
    return new Promise(resolve => { resolveRpc = resolve; });
  };
  const pending = save({ new: true });
  assert.equal(h.testApi.readSharedAppData(key), '{"old":true}');
  resolveRpc({ data: nextVersion, error: null });
  await pending;
  assert.equal(h.testApi.readSharedAppData(key), '{"new":true}');
});

test('a server conflict rejects the save and preserves the baseline', async () => {
  const h = harness();
  h.testApi.installStorageMirror('director', 'director');
  h.testApi.loadSharedSettings([sharedRow(firstVersion, { old: true })]);
  h.supabase.rpc = async () => ({ error: { code: 'PT409' } });
  await assert.rejects(h.testApi.createSharedAppDataSaver(key)({ stale: true }), /Reload to review/);
  assert.equal(h.testApi.readSharedAppData(key), '{"old":true}');
});

test('a desktop editor never silently substitutes a version loaded after rendering', async () => {
  const h = harness();
  h.testApi.installStorageMirror('director', 'director');
  h.testApi.loadSharedSettings([sharedRow(firstVersion, { old: true })]);
  const save = h.testApi.createSharedAppDataSaver(key);
  h.testApi.loadSharedSettings([sharedRow(nextVersion, { other: true })]);
  let writes = 0;
  h.supabase.rpc = async () => { writes += 1; return { data: nextVersion }; };
  await assert.rejects(save({ stale: true }), /changed while you were editing/);
  assert.equal(writes, 0);
});

test('a lost save response requires reload and does not resend the draft', async () => {
  const h = harness();
  h.testApi.installStorageMirror('director', 'director');
  h.testApi.loadSharedSettings([sharedRow(firstVersion, { old: true })]);
  const save = h.testApi.createSharedAppDataSaver(key);
  let writes = 0;
  h.supabase.rpc = async () => { writes += 1; throw Error('synthetic connection loss'); };
  await assert.rejects(save({ proposed: true }), /could not be confirmed/);
  await assert.rejects(save({ proposed: true }), /Reload when connected/);
  assert.equal(writes, 1);
  assert.equal(h.testApi.readSharedAppData(key), '{"old":true}');
});

test('a prior session draft cannot submit or cache a response after an account switch', async () => {
  const h = harness();
  h.testApi.installStorageMirror('first', 'director');
  h.testApi.loadSharedSettings([sharedRow(firstVersion, { old: true })]);
  const save = h.testApi.createSharedAppDataSaver(key);
  let resolveRpc;
  let writes = 0;
  h.supabase.rpc = () => { writes += 1; return new Promise(resolve => { resolveRpc = resolve; }); };
  const pending = save({ proposed: true });
  h.testApi.stopCloudAppData();
  h.testApi.installStorageMirror('second', 'director');
  h.testApi.loadSharedSettings([sharedRow(nextVersion, { other: true })]);
  resolveRpc({ data: nextVersion });
  await assert.rejects(pending, /session changed/);
  await assert.rejects(save({ proposed: true }), /session changed/);
  assert.equal(writes, 1);
  assert.equal(h.testApi.readSharedAppData(key), '{"other":true}');
});

test('legacy browser data and failed version reads never seed a setting', async () => {
  const h = harness();
  h.localStorage.values.set(key, '{"legacy":true}');
  h.testApi.installStorageMirror('director', 'director');
  h.localStorage.setItem(key, '{"attempt":true}');
  h.localStorage.removeItem(key);
  assert.equal(h.localStorage.getItem(key), '{"legacy":true}');
  assert.equal(h.testApi.readSharedAppData(key), null);
  h.testApi.loadSharedSettings([sharedRow(undefined, { original: true })]);
  assert.equal(h.testApi.readSharedAppData(key), '{"original":true}');
  await assert.rejects(h.testApi.createSharedAppDataSaver(key)({ stale: true }), /Online settings are unavailable/);
  assert.deepEqual(h.calls, []);
});

test('duplicate refresh requests coalesce and a missed notification is reconciled by a cloud read', async () => {
  const h = harness();
  h.testApi.installStorageMirror('customer', 'customer');
  h.testApi.loadSharedSettings([sharedRow(firstVersion, { old: true })]);
  const reconciled = new Promise(resolve => {
    h.window.dispatchEvent = resolve;
  });
  let reads = 0;
  h.supabase.from = () => ({
    select() { return this; },
    async in() { reads += 1; return { data: [sharedRow(nextVersion, { fresh: true })] }; },
  });
  h.testApi.reconcile();
  h.testApi.reconcile();
  await reconciled;
  assert.equal(reads, 1);
  assert.equal(h.testApi.readSharedAppData(key), '{"fresh":true}');
});

test('Pet Taxi save form displays the conflict and does not run its success audit', async () => {
  const h = harness();
  const taxiKey = 'furgo-demo-pet-taxi-settings';
  h.testApi.installStorageMirror('director', 'director');
  h.testApi.loadSharedSettings([{
    ...sharedRow(firstVersion, {}), record_id: `shared:${taxiKey}:shared`, storage_key: taxiKey,
  }]);
  h.supabase.rpc = async () => ({ error: { code: 'PT409' } });
  const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/pages/admin-pet-taxi.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const handlers = new Map();
  const feedback = {};
  const route = { querySelector: (selector) => ({
    value: { '[data-taxi-area]': 'Synthetic', '[data-taxi-outlet]': 'Fixture', '[data-taxi-fare]': '15' }[selector],
  }) };
  const form = {
    querySelector: (selector) => ({
      '[data-taxi-schedule-list]': { querySelectorAll: () => [] },
      '[data-taxi-route-list]': { querySelectorAll: (sel) => sel === '.admin-pet-taxi-route-row' ? [route] : [] },
      '[data-admin-pet-taxi-feedback]': feedback,
    }[selector]),
    querySelectorAll: () => [{ value: '10:00' }],
    addEventListener: (event, handler) => handlers.set(event, handler),
    reportValidity: () => true,
  };
  let audits = 0;
  vm.runInNewContext(source + '\nsetupAdminPetTaxi();', {
    document: { querySelector: () => form }, petTaxiSettingsKey: taxiKey,
    loadGroomingSettings: () => ({ outlets: [] }), loadPetTaxiSettings: () => ({}),
    createSharedAppDataSaver: h.testApi.createSharedAppDataSaver,
    recordAdminAction: () => { audits += 1; },
  });
  await handlers.get('submit')({ preventDefault() {} });
  assert.match(feedback.textContent, /Reload to review/);
  assert.doesNotMatch(feedback.textContent, /settings saved/);
  assert.equal(audits, 0);
});

test('business storage excludes legacy disk data and drops the previous account view', () => {
  const h = harness();
  const key = 'furgo-demo-hotel-bookings';
  h.localStorage.values.set(key, '[{"private":"old disk"}]');
  h.testApi.installStorageMirror('first', 'customer');
  assert.equal(h.localStorage.getItem(key), null);
  h.localStorage.setItem(key, '[{"private":"first session"}]');
  assert.match(h.localStorage.getItem(key), /first session/);
  h.testApi.stopCloudAppData();
  h.testApi.installStorageMirror('second', 'customer');
  assert.equal(h.localStorage.getItem(key), null);
  assert.match(h.localStorage.values.get(key), /old disk/);
});

test('permission failure on app_data loads no disk fallback and prevents unconfirmed writes', async () => {
  const h = harness({ legacy: false });
  const key = 'furgo-demo-addresses';
  h.localStorage.values.set(key, '[{"private":"legacy"}]');
  const reads = [];
  h.supabase.from = (table) => {
    reads.push(table);
    const result = (data, error = null, status = 200) => ({ data, error, status });
    return {
      select() { return this; }, eq() { return this; }, order() { return this; }, is() { return this; },
      maybeSingle() { return Promise.resolve(result(null)); },
      in() { return Promise.resolve(result([])); },
      range() { return Promise.resolve({ data: [], count: 0 }); },
      not() { return Promise.resolve(result(null, { code: '42501', message: 'synthetic private detail' }, 403)); },
      then(resolve) { resolve(result([])); },
      upsert() { throw Error('unconfirmed cloud record was written'); },
    };
  };
  h.supabase.channel = () => ({ on() { return this; }, subscribe() { return this; } });
  h.supabase.rpc = async () => ({ data: [] });
  await h.testApi.loadCloudAppData('second', 'customer');
  assert.equal(h.localStorage.getItem(key), null);
  assert.ok(reads.includes('grooming_bookings'));
  assert.ok(h.emitted.some(event => /could not access/.test(event.detail)));
  assert.ok(!h.emitted.some(event => /synthetic private/.test(event.detail)));
  h.localStorage.setItem(key, '[]');
  await Promise.resolve();
  assert.ok(h.emitted.some(event => /save could not be confirmed/i.test(event.detail)));
});

test('failed legacy save emits visible recovery guidance', async () => {
  const h = harness();
  h.testApi.installStorageMirror('current', 'customer');
  h.supabase.from = () => ({ upsert: async () => ({ error: { code: '42501' } }) });
  h.localStorage.setItem('furgo-demo-addresses', '[]');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.emitted.some(event => event.type === 'furgo-sync-status' && /could not access/.test(event.detail)));
});

test('signed-out cart starts empty and stays separate from authenticated cart data', () => {
  const h = harness();
  const key = 'furgo-demo-marketplace-cart';
  h.localStorage.values.set(key, '["legacy cart"]');
  assert.equal(h.localStorage.getItem(key), null);
  h.localStorage.setItem(key, '["guest cart"]');
  assert.equal(h.localStorage.getItem(key), '["guest cart"]');
  h.testApi.stopCloudAppData();
  h.testApi.installStorageMirror('new-user', 'customer');
  assert.equal(h.localStorage.getItem(key), null);
  assert.equal(h.localStorage.values.get(key), '["legacy cart"]');
});

test('a failed snapshot and a late overlapping read leave the confirmed Marketplace cache intact', async () => {
  const h = harness();
  const key = 'furgo-demo-marketplace-orders';
  h.testApi.installStorageMirror('first', 'customer');
  h.testApi.setOwner('first');
  h.testApi.cacheSyncedRecords(key, [
    { id: 'a', _orderVersion: 1, items: [{ allocation: 'original' }] },
    { id: 'b', _orderVersion: 4, paymentStatus: 'Paid' },
  ]);
  let oldRead;
  let failReturns = false;
  let orderReads = 0;
  const order = (version) => ({ id: 'a', order_version: version, payment_status: 'Paid' });
  h.supabase.from = (table) => ({
    select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
    range() {
      if (table === 'marketplace_orders') {
        if (++orderReads === 1) return new Promise(resolve => { oldRead = resolve; });
        return Promise.resolve({ data: [order(3)], count: 1 });
      }
      if (table === 'marketplace_item_returns' && failReturns) return Promise.resolve({ error: Error('partial result') });
      if (table === 'marketplace_item_returns') {
        return Promise.resolve({ data: [{ order_id: 'a', line_number: 1, id: 'return-a', status: 'Requested' }], count: 1 });
      }
      return Promise.resolve({ data: [{ order_id: 'a', line_number: 1, item: { allocation: 'confirmed' } }], count: 1 });
    },
  });
  const older = h.testApi.reconcileMarketplaceOrders('first', 'customer', ['a']);
  assert.equal(await h.testApi.reconcileMarketplaceOrders('first', 'customer', ['a']), true);
  oldRead({ data: [order(2)], count: 1 });
  assert.equal(await older, false);
  const confirmed = h.testApi.readMarketplaceOrderCache();
  const changed = confirmed.find((row) => row.id === 'a');
  assert.equal(changed._orderVersion, 3);
  assert.equal(changed.paymentStatus, 'Paid');
  assert.equal(changed.items[0].allocation, 'confirmed');
  assert.equal(changed.items[0].returnRequest.id, 'return-a');
  assert.equal(confirmed.find((row) => row.id === 'b').paymentStatus, 'Paid');
  failReturns = true;
  await assert.rejects(h.testApi.reconcileMarketplaceOrders('first', 'customer'), /partial result/);
  assert.deepEqual(h.testApi.readMarketplaceOrderCache(), confirmed);
});
