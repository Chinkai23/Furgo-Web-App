const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, '../../', name), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness(rpc = () => Promise.resolve({ error: null })) {
  let now = 1000, nextId = 0, authCallback, owner = 'a', routeListeners = 0, authListeners = 0;
  const timers = new Map(), listeners = {}, calls = [];
  const setTimer = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  const window = { location: { hash: '#admin' }, addEventListener: (event, fn) => { if (event === 'hashchange') routeListeners++; listeners[event] = fn; } };
  const client = { auth: {
    getSession: async () => ({ data: { session: owner ? { user: { id: owner } } : null }, error: null }),
    onAuthStateChange: cb => { authListeners++; authCallback = cb; },
  }, rpc: name => { calls.push(name); return rpc(name); } };
  const source = read('js/pages/local-finder.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const context = { window, URLSearchParams, Date: { now: () => now }, Promise, AbortController,
    setTimeout: setTimer, clearTimeout: id => timers.delete(id), console };
  vm.runInNewContext(source + '\nsetupLocalFinderSearch = () => { globalThis.searches++; }; globalThis.api = { setupLocalFinder, startLocalFinderCoordinateExpiry };', context);
  context.searches = 0;
  return { context, client, calls, timers, listenerCounts: () => ({ routeListeners, authListeners }),
    route(hash) { window.location.hash = hash; listeners.hashchange?.(); },
    auth(id) { owner = id; authCallback(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null); },
    async tick(ms) {
      const end = now + ms;
      while (true) {
        await flush();
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      now = end; await flush();
    },
    async start(hash = '#local-finder-search') { this.route(hash); context.api.startLocalFinderCoordinateExpiry(client); await flush(); await this.tick(0); },
  };
}

test('unrelated startup never invokes expiry and Local Finder initializes', async () => {
  const h = harness(); h.context.api.setupLocalFinder(h.client); await h.tick(0);
  assert.equal(h.calls.length, 0);
  h.route('#local-finder-search?q=cat'); h.context.api.setupLocalFinder(h.client); await flush(); await h.tick(0);
  assert.equal(h.context.searches, 1); assert.equal(h.calls.length, 1);
});

test('failure automatically retries and success repeats after ten minutes without a render', async () => {
  let n = 0; const h = harness(() => Promise.resolve({ error: ++n === 1 ? {} : null }));
  await h.start(); assert.equal(n, 1);
  await h.tick(29999); assert.equal(n, 1);
  await h.tick(1); assert.equal(n, 2);
  await h.tick(599999); assert.equal(n, 2);
  await h.tick(1); assert.equal(n, 3);
});

test('rejected RPC retries and every customer route can start maintenance', async () => {
  for (const route of ['local-finder', 'local-finder-search', 'local-finder-list', 'local-finder-place', 'local-finder-favourites']) {
    const h = harness(() => Promise.reject(new Error('offline')));
    await h.start(`#${route}`); assert.equal(h.calls.length, 1);
    await h.tick(30000); assert.equal(h.calls.length, 2);
  }
});

test('a never-settling RPC times out, aborts, and retries', async () => {
  let signal; const h = harness(() => ({ abortSignal(s) { signal = s; return new Promise(() => {}); } }));
  await h.start(); assert.equal(h.calls.length, 1);
  await h.tick(15000); assert.equal(signal.aborted, true);
  await h.tick(30000); assert.equal(h.calls.length, 2);
});

test('admin list loads while expiry hangs', async () => {
  const h = harness(() => new Promise(() => {})); await h.start('#admin-local-finder');
  const source = read('js/pages/admin-local-finder.js');
  const body = source.slice(source.indexOf('  const load = async () => {'), source.indexOf('\n  const syncReviewSelection ='));
  let selected = false;
  const supabase = { from: () => ({ select: () => ({ order: () => { selected = true; return Promise.resolve({ data: [] }); } }) }), rpc: async () => ({ data: [] }) };
  const context = { supabase, Promise, Map, document: { querySelector: () => null }, edits: null, editCount: null, pending: null, published: null,
    quotaUsed: null, applyReviewPlaceTypeFilter() {}, syncReviewSelection() {}, applyCategoryFilter() {}, editTypeFilter: null, editFilterEmpty: null, publishedTypeFilter: null, publishedFilterEmpty: null };
  vm.runInNewContext(body + '\nglobalThis.load = load;', context); await context.load();
  assert.equal(h.calls.length, 1); assert.equal(selected, true);
  assert.match(source, /startLocalFinderCoordinateExpiry\(supabase\)/);
});

test('logout and account switch invalidate pending attempts; late responses cannot affect the new session', async () => {
  const requests = []; const h = harness(() => { const d = deferred(); requests.push(d); return d.promise; });
  await h.start(); h.auth(null); await h.tick(600000); assert.equal(requests.length, 1);
  h.auth('b'); await h.tick(0); assert.equal(requests.length, 2);
  requests[0].resolve({ error: null }); await flush();
  requests[1].resolve({ error: {} }); await flush();
  await h.tick(30000); assert.equal(requests.length, 3);
});

test('a direct account switch starts a fresh attempt', async () => {
  const h = harness(() => new Promise(() => {})); await h.start();
  h.auth('b'); await h.tick(0); assert.equal(h.calls.length, 2);
});

test('route exit cancels timers and late completions cannot restart them', async () => {
  const d = deferred(); const h = harness(() => d.promise); await h.start();
  h.route('#home'); d.resolve({ error: null }); await flush(); await h.tick(1200000);
  assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
});

test('concurrent view setup coalesces attempts and timers', async () => {
  const d = deferred(); const h = harness(() => d.promise); await h.start();
  h.context.api.startLocalFinderCoordinateExpiry(h.client); h.context.api.startLocalFinderCoordinateExpiry(h.client); await h.tick(0);
  assert.equal(h.calls.length, 1); d.resolve({ error: null }); await flush();
  assert.equal(h.timers.size, 1);
});

test('transient session error recovers without another render and retries are bounded', async () => {
  const h = harness(); let lookups = 0;
  h.client.auth.getSession = async () => ++lookups < 3
    ? { data: null, error: { message: 'temporary' } }
    : { data: { session: { user: { id: 'a' } } }, error: null };
  await h.start(); assert.equal(lookups, 1); assert.equal(h.calls.length, 0);
  h.context.api.startLocalFinderCoordinateExpiry(h.client);
  await h.tick(29999); assert.equal(lookups, 1);
  await h.tick(1); assert.equal(lookups, 2); assert.equal(h.timers.size, 1);
  await h.tick(30000); assert.equal(lookups, 3); assert.equal(h.calls.length, 1);
});

test('rejected session lookup retries and recovers', async () => {
  const h = harness(); let lookups = 0;
  h.client.auth.getSession = async () => { if (++lookups === 1) throw new Error('offline'); return { data: { session: { user: { id: 'a' } } }, error: null }; };
  await h.start(); await h.tick(30000);
  assert.equal(lookups, 2); assert.equal(h.calls.length, 1);
});

test('confirmed signed-out lookup does not schedule repeated lookups', async () => {
  const h = harness(); let lookups = 0;
  h.client.auth.getSession = async () => { lookups++; return { data: { session: null }, error: null }; };
  await h.start(); await h.tick(120000);
  h.context.api.startLocalFinderCoordinateExpiry(h.client); await h.tick(120000);
  assert.equal(lookups, 1); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
  h.auth('a'); await h.tick(0); assert.equal(h.calls.length, 1);
});

test('route exit cancels a delayed session lookup retry', async () => {
  const h = harness(); let lookups = 0;
  h.client.auth.getSession = async () => { lookups++; return { error: {} }; };
  await h.start(); h.route('#home'); await h.tick(120000);
  assert.equal(lookups, 1); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
});

test('logout or account switch invalidates a pending lookup and its late response', async () => {
  for (const nextOwner of [null, 'b']) {
    const h = harness(); const d = deferred(); let lookups = 0;
    h.client.auth.getSession = () => { lookups++; return d.promise; };
    await h.start(); h.context.api.startLocalFinderCoordinateExpiry(h.client); await flush();
    assert.equal(lookups, 1);
    h.auth(nextOwner); await h.tick(0);
    d.resolve({ data: { session: { user: { id: 'old' } } }, error: null }); await flush();
    await h.tick(30000);
    assert.equal(lookups, 1); assert.equal(h.calls.length, nextOwner ? 1 : 0);
  }
});

test('a hung lookup stays bounded across retry intervals and route re-entry', async () => {
  const h = harness(); const held = deferred(); let calls = 0, pending = 0;
  h.client.auth.getSession = () => { calls++; pending++; return held.promise.finally(() => { pending--; }); };
  await h.start();
  for (let i = 0; i < 20; i++) {
    await h.tick(45000);
    h.route('#home'); h.route('#local-finder-search');
    h.context.api.startLocalFinderCoordinateExpiry(h.client); await flush();
    assert.equal(calls, 1); assert.equal(pending, 1); assert.equal(h.timers.size, 0);
  }
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.listenerCounts(), { routeListeners: 1, authListeners: 1 });
});

test('auth event resumes maintenance during a hung lookup, without duplicate expiry', async () => {
  const h = harness(() => new Promise(() => {})); const held = deferred(); let calls = 0, pending = 0;
  h.client.auth.getSession = () => { calls++; pending++; return held.promise.finally(() => { pending--; }); };
  await h.start(); await h.tick(90000); h.auth('b'); await h.tick(0);
  h.context.api.startLocalFinderCoordinateExpiry(h.client); await h.tick(0);
  assert.equal(calls, 1); assert.equal(pending, 1); assert.equal(h.calls.length, 1);
  held.resolve({ data: { session: { user: { id: 'old' } } }, error: null }); await flush();
  assert.equal(pending, 0); assert.equal(h.calls.length, 1);
});

test('a hung lookup that eventually succeeds resumes without another render', async () => {
  const h = harness(); const held = deferred(); let calls = 0, pending = 0;
  h.client.auth.getSession = () => { calls++; pending++; return held.promise.finally(() => { pending--; }); };
  await h.start(); await h.tick(180000);
  assert.equal(calls, 1); assert.equal(pending, 1);
  held.resolve({ data: { session: { user: { id: 'a' } } }, error: null }); await flush(); await h.tick(0);
  assert.equal(pending, 0); assert.equal(h.calls.length, 1);
});

test('route re-entry waits for obsolete lookup settlement and ignores its result', async () => {
  const h = harness(); const held = deferred(); let calls = 0, pending = 0, maxPending = 0;
  h.client.auth.getSession = () => {
    calls++; pending++; maxPending = Math.max(maxPending, pending);
    return (calls === 1 ? held.promise : Promise.resolve({ data: { session: { user: { id: 'new' } } }, error: null }))
      .finally(() => { pending--; });
  };
  await h.start(); h.route('#home'); h.route('#local-finder-search');
  h.context.api.startLocalFinderCoordinateExpiry(h.client); await flush();
  assert.equal(calls, 1); assert.equal(pending, 1);
  held.resolve({ data: { session: { user: { id: 'old' } } }, error: null }); await flush(); await h.tick(0);
  assert.equal(calls, 2); assert.equal(maxPending, 1); assert.equal(h.calls.length, 1);
});

test('logout or account switch prevents a hung lookup from spawning more lookups', async () => {
  for (const nextOwner of [null, 'b']) {
    const h = harness(); const held = deferred(); let calls = 0, pending = 0;
    h.client.auth.getSession = () => { calls++; pending++; return held.promise.finally(() => { pending--; }); };
    await h.start(); h.auth(nextOwner); await h.tick(900000);
    assert.equal(calls, 1); assert.equal(pending, 1);
    assert.equal(h.calls.length, nextOwner ? 2 : 0);
    held.resolve({ data: { session: { user: { id: 'old' } } }, error: null }); await flush();
    assert.equal(pending, 0); assert.equal(calls, 1);
  }
});

test('empty browser recovery storage does not upload a legacy snapshot', async () => {
  const source = read('js/marketplace-legacy-recovery.js').replace(/^export /gm, '');
  const indexedDB = { open() {
    const request = {};
    request.result = { transaction() {
      const transaction = { objectStore: () => ({ getAll: () => ({ result: [] }) }) };
      queueMicrotask(() => transaction.oncomplete()); return transaction;
    } };
    queueMicrotask(() => request.onsuccess()); return request;
  } };
  const context = { indexedDB, localStorage: {}, TextEncoder, Promise, console };
  vm.runInNewContext(source + '\nglobalThis.upload = uploadMarketplaceLegacySnapshots;', context);
  let uploads = 0; await context.upload(async () => { uploads++; return true; }); assert.equal(uploads, 0);
});
