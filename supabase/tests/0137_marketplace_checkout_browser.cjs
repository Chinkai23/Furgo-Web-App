// Run with Node and Playwright. Optionally set FURGO_TEST_PLAYWRIGHT to an
// existing Playwright installation and FURGO_TEST_CHROMIUM to a browser binary.
const assert = require('node:assert/strict');
const { createDecipheriv, generateKeyPairSync, privateDecrypt } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test, after } = require('node:test');
const { chromium } = require(process.env.FURGO_TEST_PLAYWRIGHT || 'playwright');

const root = path.resolve(__dirname, '../..');
const origin = 'https://furgo-checkout.test';
const owner = '00000000-0137-4000-8000-000000000001';
const otherOwner = '00000000-0137-4000-8000-000000000002';
const cartKey = 'furgo-demo-marketplace-cart';
const historyKey = 'furgo-demo-marketplace-orders';
const selectionKey = 'furgo-demo-marketplace-checkout-selection';
const cart = [
  { productId: 'selected', variantId: 'standard', quantity: 1 },
  { productId: 'keep', variantId: 'standard', quantity: 2 },
];
const products = cart.map(({ productId }) => ({
  id: productId, name: productId,
  variants: [{ id: 'standard', label: 'Standard', stock: 10, price: 20 }],
}));
const { publicKey: testPublicKey, privateKey: testPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048, publicKeyEncoding: { format: 'der', type: 'spki' },
});
const protocol = 'furgo-marketplace-legacy-v1';

function decryptTestEnvelope(envelope) {
  const [version, wrapped, iv, encoded, extra] = envelope.split('.');
  assert.equal(version, protocol);
  assert.equal(extra, undefined);
  const key = privateDecrypt({ key: testPrivateKey, oaepHash: 'sha256' }, Buffer.from(wrapped, 'base64'));
  const ciphertext = Buffer.from(encoded, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(protocol));
  decipher.setAuthTag(ciphertext.subarray(-16));
  return Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString();
}
const address = { name: 'Test Buyer', phone: '0123456789', street: 'Test Road', postcode: '50000', city: 'KL', state: 'KL' };

const browser = chromium.launch({
  executablePath: process.env.FURGO_TEST_CHROMIUM || undefined,
  headless: true,
});

after(async () => { await (await browser).close(); });

const stub = `
  const call = async (body) => {
    try {
      const response = await fetch('/test-api', { method: 'POST', body: JSON.stringify({ user: window.testOwner, ...body }) });
      return await response.json();
    } catch { return { data: null, error: { message: 'Network request interrupted.' } }; }
  };
  export const supabase = {
    rpc: (name, args) => call({ name, args }),
    from(table) {
      let upsert;
      const filters = {};
      const query = {
        select() { return query; }, order() { return query; }, in() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        is(key, value) { filters[key] = value; return query; },
        maybeSingle() { return call({ table, filters, single: true }); },
        upsert(value) { upsert = value; return query; },
        then(resolve, reject) { return call({ table, filters, upsert }).then(resolve, reject); },
      };
      return query;
    },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    async removeChannel() {},
  };
`;

const fixture = `<!doctype html><html><body><div id="app"></div><script type="module">
  import { marketplaceCheckoutPage } from '/js/pages/cart.js';
  import { setupMarketplaceCheckout, readCheckoutAttempt } from '/js/marketplace-checkout.js';
  import { loadCloudAppData } from '/js/app-data-sync.js';
  import { loadMarketplaceOrders } from '/js/pages/marketplace-data.js';
  window.testOwner = new URLSearchParams(location.search).get('owner') || '${owner}';
  window.confirmations = [];
  window.confirmAnswers = [];
  window.confirm = (message) => { window.confirmations.push(message); return window.confirmAnswers.shift() ?? false; };
  sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify({ id: window.testOwner, email: window.testOwner+'@example.test' }));
  if (!localStorage.getItem('${selectionKey}') && !localStorage.getItem('test-seeded')) {
    localStorage.setItem('${selectionKey}', JSON.stringify(['selected::standard']));
    localStorage.setItem('test-seeded', 'yes');
    localStorage.setItem('furgo-marketplace-order-archive:unassigned', 'original malformed evidence');
    localStorage.setItem('${historyKey}', JSON.stringify([
      { id: 'unassigned', userId: '${otherOwner}', customerEmail: window.testOwner+'@example.test', reference: 'FG-UNASSIGNED', items: [] },
    ]));
  }
  await loadCloudAppData(window.testOwner, 'customer');
  window.testAttempt = () => readCheckoutAttempt(window.testOwner);
  window.testOrders = () => loadMarketplaceOrders({ archiveOwner: window.testOwner });
  document.querySelector('#app').innerHTML = marketplaceCheckoutPage();
  setupMarketplaceCheckout();
  window.ready = true;
</script></body></html>`;

function quote(items, totalCents) {
  const shippingCents = 800;
  return {
    subtotalCents: totalCents - shippingCents, shippingCents, shippingDiscountCents: 0,
    discountCents: 0, totalCents,
    items: items.map((item, index) => ({
      inputIndex: index + 1, quantity: item.quantity,
      lineTotalCents: totalCents - shippingCents, unitPriceCents: totalCents - shippingCents,
    })),
  };
}

async function harness(t) {
  const context = await (await browser).newContext();
  t.after(() => context.close());
  const committed = new Map();
  const carts = new Map([[owner, cart], [otherOwner, []]]);
  const state = { creates: [], quotes: [], finds: [], cents: 2800, changeTo: null, interrupt: '', failCart: false, failPreservation: false, preserved: new Set(), envelopes: [], blockedAppImports: 0 };
  const legacy = { record_id: `operation:${historyKey}:${owner}`, scope: 'operation', storage_key: historyKey, owner_id: owner,
    payload: [{ id: 'historic', customerEmail: owner + '@example.test', reference: 'FG-OLD', items: [] }] };
  const catalog = { record_id: 'shared:furgo-demo-marketplace-products:shared', scope: 'shared',
    storage_key: 'furgo-demo-marketplace-products', owner_id: null, payload: products };

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (url.pathname === '/') { await route.fulfill({ contentType: 'text/html', body: fixture }); return; }
    if (url.pathname === '/offline-shell') {
      const blocked = url.searchParams.has('storage-blocked');
      const seed = `<script>
        localStorage.setItem('test-seeded', 'yes');
        localStorage.setItem('${historyKey}', '[{"id":"offline-only-dummy","private":"synthetic contact"}]');
        ${blocked ? "indexedDB.open = () => { throw new Error('Synthetic IndexedDB failure'); };" : ''}
      </script>`;
      const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
      await route.fulfill({ contentType: 'text/html', body: html.replace('<head>', '<head>' + seed) });
      return;
    }
    if (url.pathname.startsWith('/js/')) {
      if (url.pathname === '/js/app.js') {
        state.blockedAppImports += 1;
        await route.abort();
        return;
      }
      let body = url.pathname === '/js/supabase.js' ? stub : await fs.readFile(path.join(root, url.pathname.slice(1)), 'utf8');
      if (url.pathname === '/js/marketplace-legacy-recovery.js') {
        body = body.replace(/const recoveryPublicKey = '[A-Za-z0-9+/=]+';/,
          `const recoveryPublicKey = '${testPublicKey.toString('base64')}';`);
      }
      await route.fulfill({ contentType: 'text/javascript', body });
      return;
    }
    if (url.pathname !== '/test-api') { await route.fulfill({ status: 404, body: '' }); return; }
    const request = route.request().postDataJSON();
    const { name, args, table, user, filters, upsert } = request;
    const key = args && `${user}:${args.p_request_id}`;
    const respond = (data, error = null) => route.fulfill({ json: { data, error } });
    if (name === 'preserve_marketplace_legacy_snapshot') {
      state.envelopes.push(args.p_snapshot);
      assert.ok(!args.p_snapshot.includes('FG-UNASSIGNED'));
      assert.ok(!args.p_snapshot.includes('synthetic contact'));
      if (state.failPreservation) { await respond(null, { code: 'PT500', message: 'Private history intake unavailable.' }); return; }
      state.preserved.add(decryptTestEnvelope(args.p_snapshot));
      await respond(true);
      return;
    }
    if (name === 'get_marketplace_legacy_history') {
      await respond(user === owner ? [{ ...legacy.payload[0], userId: owner, _legacyArchive: true }] : []);
      return;
    }
    if (name === 'quote_marketplace_order') {
      state.quotes.push(args);
      if (args.p_voucher_code === 'INVALID') { await respond(null, { code: 'PT422', message: 'That voucher is unavailable.' }); return; }
      await respond(quote(args.p_items, state.cents));
      return;
    }
    if (name === 'get_marketplace_checkout') {
      state.finds.push(args.p_request_id);
      await respond(committed.get(key) || null);
      return;
    }
    if (name === 'create_marketplace_order') {
      state.creates.push(args);
      const interrupt = state.interrupt;
      state.interrupt = '';
      if (interrupt === 'before') { await route.abort(); return; }
      const { p_checkout, p_expected_total_cents, p_request_id } = args;
      if (state.changeTo != null) { state.cents = state.changeTo; state.changeTo = null; }
      if (p_expected_total_cents !== state.cents) {
        await respond({ outcome: 'quote_changed', quote: quote(p_checkout.items, state.cents) });
        return;
      }
      const bank = p_checkout.payment === 'bank-transfer';
      const snapshot = {
        requestId: p_request_id,
        order: { id: 'server-order', user_id: user, reference: 'FG-SERVER', status: bank ? 'Pending Payment Verification' : 'Pending Payment',
          payment_status: bank ? 'Pending Payment Verification' : 'Pending Payment', payment_channel: bank ? 'bank_transfer' : 'demo_online',
          order_version: bank ? 1 : 0, total: state.cents / 100, details: { customerEmail: user + '@example.test' } },
        items: p_checkout.items.map((item) => ({ ...item, name: 'Authoritative product', unitPrice: (state.cents - 800) / 100 })),
      };
      committed.set(key, snapshot);
      if (interrupt === 'after') { await route.abort(); return; }
      await respond(snapshot);
      return;
    }
    if (table === 'app_data') {
      if (upsert) {
        if (upsert.storage_key === cartKey && state.failCart) { await respond(null, { message: 'Cart sync unavailable.' }); return; }
        if (upsert.storage_key === cartKey) carts.set(user, upsert.payload);
        assert.notEqual(upsert.storage_key, historyKey, 'legacy history must not be written');
        await respond(null);
        return;
      }
      if (filters.record_id === catalog.record_id) { await respond(catalog); return; }
      const cartRow = { scope: 'customer', storage_key: cartKey, owner_id: user,
        record_id: `customer:${cartKey}:${user}`, payload: carts.get(user) || [] };
      await respond([catalog, cartRow]);
      return;
    }
    assert.ok(!upsert || !['marketplace_orders', 'marketplace_order_items'].includes(table), 'direct order write');
    await respond(request.single ? null : []);
  });

  async function open(user = owner) {
    const page = await context.newPage();
    await page.goto(`${origin}/?owner=${user}#checkout`);
    await page.waitForFunction(() => window.ready);
    return page;
  }

  return { state, open, committed, carts, context };
}

async function fill(page, payment = 'gateway') {
  for (const [field, value] of Object.entries({ ...address, recipient: address.name })) {
    if (field !== 'name') await page.locator(`[name="${field}"]`).fill(value);
  }
  if (payment === 'bank-transfer') {
    await page.locator('[value="bank-transfer"]').check();
    await page.locator('[name="transferSlip"]').setInputFiles({ name: 'payment.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  }
}

const submit = (page) => page.locator('[data-market-checkout] button[type="submit"]');
const localCart = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), cartKey);
test('explicitly confirms repricing at preview and commit, then reconciles the confirmed selection', async (t) => {
  const { open, state, committed, carts } = await harness(t);
  const page = await open();
  await fill(page);
  state.cents = 3100;
  await submit(page).click();
  await page.waitForFunction(() => window.confirmations.length === 1);
  assert.equal(state.creates.length, 0);
  assert.deepEqual(await localCart(page), cart);

  await page.evaluate(() => window.confirmAnswers.push(true));
  state.changeTo = 3200;
  await submit(page).click();
  await page.waitForFunction(() => location.hash === '#orders?from=marketplace');
  const prompts = await page.evaluate(() => window.confirmations);
  assert.deepEqual(prompts.map((value) => value.match(/MYR \d+\.\d+/g)), [['MYR 28.00', 'MYR 31.00'], ['MYR 31.00', 'MYR 32.00']]);
  assert.deepEqual(state.creates.map((args) => args.p_expected_total_cents), [3100, 3200]);
  assert.equal(state.creates[0].p_request_id, state.creates[1].p_request_id);
  assert.equal(committed.size, 1);
  assert.deepEqual(carts.get(owner), [cart[1]]);
  assert.deepEqual(await localCart(page), [cart[1]]);
  assert.equal(await page.evaluate(async () => (await window.testAttempt()) === null), true);
  const orders = await page.evaluate(() => window.testOrders());
  assert.equal(orders.find((order) => order.id === 'server-order').items[0].name, 'Authoritative product');
  assert.equal(orders.find((order) => order.id === 'historic')._legacyArchive, true);
  assert.ok(!orders.some((order) => order.id === 'unassigned'));
  assert.ok([...state.preserved].some((snapshot) => snapshot.includes('FG-UNASSIGNED')));
  assert.ok(state.preserved.has('original malformed evidence'));
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), historyKey), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('furgo-marketplace-order-archive:unassigned')), null);
});

test('lost response after commit recovers the same order on reload without another submission', async (t) => {
  const { open, state, committed } = await harness(t);
  const page = await open();
  await fill(page, 'bank-transfer');
  state.interrupt = 'after';
  await page.evaluate(() => {
    const form = document.querySelector('[data-market-checkout]');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
  await page.locator('.form-feedback').getByText(/could not confirm/).waitFor();
  assert.equal(state.creates.length, 1);
  assert.equal(committed.size, 1);
  assert.deepEqual(await localCart(page), cart);

  await page.reload();
  await page.waitForFunction(() => location.hash === '#orders?from=marketplace');
  assert.deepEqual(state.finds, [state.creates[0].p_request_id]);
  assert.equal(state.creates.length, 1);
  assert.deepEqual(await localCart(page), [cart[1]]);
});

test('interruption before commit preserves the exact bank checkout across reload and retry', async (t) => {
  const { open, state, committed } = await harness(t);
  const page = await open();
  await fill(page, 'bank-transfer');
  state.interrupt = 'before';
  await submit(page).click();
  await page.locator('.form-feedback').getByText(/could not confirm/).waitFor();
  assert.equal(committed.size, 0);
  assert.deepEqual(await localCart(page), cart);

  await page.reload();
  await page.locator('.form-feedback').getByText(/Retry to finish/).waitFor();
  await submit(page).click();
  await page.waitForFunction(() => location.hash === '#orders?from=marketplace');

  assert.equal(committed.size, 1);
  assert.equal(state.creates.length, 2);
  assert.deepEqual(state.creates[0], state.creates[1]);
  assert.equal(state.creates[1].p_checkout.transferSlip.data, 'data:application/pdf;base64,JVBERg==');
});

test('confirmed order survives a failed cart sync and resolves the cart after reload', async (t) => {
  const { open, state, committed, carts } = await harness(t);
  const page = await open();
  await fill(page);
  state.failCart = true;
  await submit(page).click();
  await page.locator('.form-feedback').getByText(/Order placed/).waitFor();
  assert.equal(committed.size, 1);
  assert.equal(await page.evaluate(async () => Boolean((await window.testAttempt()).resolution)), true);
  assert.deepEqual(carts.get(owner), cart);

  state.failCart = false;
  await page.reload();
  await page.waitForFunction(() => location.hash === '#orders?from=marketplace');
  assert.equal(state.creates.length, 1);
  assert.deepEqual(carts.get(owner), [cart[1]]);
});

test('an account switch cannot recover another customer’s pending checkout or archive', async (t) => {
  const { open, state } = await harness(t);
  const page = await open();
  await fill(page);
  state.interrupt = 'before';
  await submit(page).click();
  await page.locator('.form-feedback').getByText(/could not confirm/).waitFor();
  const originalRequest = state.creates[0].p_request_id;
  const otherPage = await open(otherOwner);
  assert.equal(await otherPage.evaluate(() => window.testAttempt()), null);
  assert.deepEqual(await otherPage.evaluate(() => window.testOrders()), []);
  assert.ok(!state.finds.includes(originalRequest));
});

test('voucher application sends only the code and selection to the server', async (t) => {
  const { open, state } = await harness(t);
  const page = await open();
  await page.locator('[data-market-coupon]').fill('invalid');
  await page.locator('[data-apply-coupon]').click();
  await page.locator('[data-coupon-feedback]').getByText(/unavailable/).waitFor();
  assert.deepEqual(state.quotes, [{ p_items: [cart[0]], p_voucher_code: 'INVALID' }]);
  assert.deepEqual(await localCart(page), cart);
  assert.equal(state.creates.length, 0);
});

test('keeps undelivered legacy evidence sealed across accounts and retries the same ciphertext', async (t) => {
  const { open, state } = await harness(t);
  state.failPreservation = true;
  const ownerPage = await open();
  assert.equal(await ownerPage.evaluate((key) => localStorage.getItem(key), historyKey), null);
  const interruptedEnvelope = state.envelopes[0];
  assert.ok(interruptedEnvelope.startsWith(protocol + '.'));
  const otherPage = await open(otherOwner);
  assert.deepEqual(await otherPage.evaluate(() => window.testOrders()), []);
  assert.equal(await otherPage.evaluate((key) => localStorage.getItem(key), historyKey), null);
  assert.equal(state.envelopes[1], interruptedEnvelope);

  state.failPreservation = false;
  await otherPage.reload();
  await otherPage.waitForFunction(() => window.ready);
  assert.equal(state.envelopes[2], interruptedEnvelope);
  assert.ok([...state.preserved].some((snapshot) => snapshot.includes('FG-UNASSIGNED')));
  assert.deepEqual(await otherPage.evaluate(() => window.testOrders()), []);
  const completedUploads = state.envelopes.length;
  await otherPage.reload();
  await otherPage.waitForFunction(() => window.ready);
  assert.equal(state.envelopes.length, completedUploads);
});

test('the production entrypoint seals old history before a blocked app import and before sign-in', async (t) => {
  const { open, state, context } = await harness(t);
  const offlinePage = await context.newPage();
  await offlinePage.goto(origin + '/offline-shell');
  await offlinePage.getByText(/could not start safely/).waitFor();
  assert.equal(state.blockedAppImports, 1);
  assert.equal(state.envelopes.length, 0);
  assert.equal(await offlinePage.evaluate((key) => localStorage.getItem(key), historyKey), null);

  const connectedPage = await open(otherOwner);
  assert.ok([...state.preserved].some((snapshot) => snapshot.includes('synthetic contact')));
  assert.deepEqual(await connectedPage.evaluate(() => window.testOrders()), []);
});

test('a failed local seal preserves the original and blocks startup', async (t) => {
  const { state, context } = await harness(t);
  const page = await context.newPage();
  await page.goto(origin + '/offline-shell?storage-blocked');
  await page.getByText(/could not start safely/).waitFor();
  assert.equal(state.blockedAppImports, 0);
  assert.equal(state.envelopes.length, 0);
  assert.ok((await page.evaluate((key) => localStorage.getItem(key), historyKey)).includes('offline-only-dummy'));
});
