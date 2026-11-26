// Real form and production click/submit/refresh functions in an isolated DOM.
// Supabase is replaced with local fixtures. No cloud endpoint is contacted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.FURGO_TEST_PLAYWRIGHT || 'playwright');

function source(name) {
  return fs.readFileSync(path.join(__dirname, '../../js', name), 'utf8');
}

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b).replace(/^export /gm, '');
}

test('Store tracking protects actual input during Realtime reads, failed save, confirmed save and cancel', async () => {
  const app = source('app.js');
  const guard = source('sync-recovery.js').split('export function createTrackingRefreshGuard()')[1];
  const browser = await chromium.launch({ executablePath: process.env.FURGO_TEST_CHROMIUM });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.setContent('<main id="portal"><p id="status"></p><section id="packaging"></section></main>');
    await page.addScriptTag({ content: `
      const escapeHTML = (input) => String(input);
      const savedDefaultCourier = () => '';
      ${between(source('pages/marketplace-supplier.js'), 'export function supplierTrackingForm(', 'export function supplierOrderRows(')}
      function createTrackingRefreshGuard()${guard}
      const trackingRefresh = createTrackingRefreshGuard();
      const root = document.querySelector('#portal');
      const packagingTarget = document.querySelector('#packaging');
      const packagingPanelTarget = packagingTarget;
      const storeCurrent = () => root.isConnected;
      const supplierProfile = { directorStoreView: false };
      let supplierCatalog = [], supplierSubmissions = [];
      let packagingStatusFilter;
      const matchesSupplierOrderStatus = () => false;
      const applyPackagingStatusFilter = () => {};
      let db = [
        { id: 'a', paymentStatus: 'Paid', supplierShipment: { courier: 'Original', trackingNumber: 'A-1' } },
        { id: 'b', paymentStatus: 'Paid', supplierShipment: { courier: 'Other', trackingNumber: 'B-1' } },
      ];
      let supplierOrders = structuredClone(db);
      let hold = false;
      let fail = false;
      const pending = [];
      const writes = [];
      const setShipmentFeedback = (text) => { document.querySelector('#status').textContent = text; };
      const supabase = {
        async rpc(name, args) {
          if (name === 'get_marketplace_supplier_catalog') return { data: [] };
          if (name === 'get_marketplace_supplier_orders') {
            const data = structuredClone(db);
            if (hold) return new Promise(resolve => pending.push(() => resolve({ data })));
            return { data };
          }
          if (name !== 'update_marketplace_supplier_shipment') throw Error('Unexpected RPC ' + name);
          writes.push(args);
          if (fail) return { error: Error('Synthetic save rejection') };
          db.find((row) => row.id === args.p_order_id).supplierShipment = {
            courier: args.p_courier, trackingNumber: args.p_tracking_number, trackingUrl: args.p_tracking_url,
          };
          return {};
        },
      };
      function renderPackagingOrders() {
        if (trackingRefresh.active()) return;
        packagingTarget.innerHTML = supplierOrders.map((order) =>
          '<article class="supplier-packaging-order" id="order-' + order.id + '">' +
          '<p data-summary>' + order.supplierShipment.trackingNumber + '</p>' +
          '<button data-supplier-edit-tracking>Edit</button>' +
          supplierTrackingForm(order, order.supplierShipment, order.id === 'a' ? 'edit_tracking' : 'ship') + '</article>').join('');
      }
      ${between(app, '  let supplierPortalRead = 0;', '  const setPackagingFeedback')}
      ${between(app, "  packagingTarget?.addEventListener('input',", "  packagingPanelTarget?.addEventListener('change',")}
      ${between(app, "  packagingPanelTarget?.addEventListener('click',", "  if (storeRoot && (supplierForm")}
      renderPackagingOrders();
      window.fixture = {
        refreshSupplierPortal, setHold: (value) => { hold = value; }, setFail: (value) => { fail = value; },
        refresh: () => { window.inFlight = refreshSupplierPortal(); },
        pendingCount: () => pending.length, finish: () => pending.shift()(),
        setNumber: (number) => { db[0].supplierShipment.trackingNumber = number; },
        writes: () => structuredClone(writes),
      };
    ` });
    const order = page.locator('#order-a');
    const input = order.locator('[name=trackingNumber]');
    await page.evaluate(() => { fixture.setHold(true); fixture.refresh(); });
    await page.waitForFunction(() => fixture.pendingCount() === 1);
    await order.getByRole('button', { name: 'Edit', exact: true }).click();
    await input.fill('draft-1');
    await page.evaluate(async () => { fixture.finish(); await inFlight; fixture.setHold(false); });
    assert.equal(await input.inputValue(), 'draft-1');
    await page.evaluate(() => fixture.refreshSupplierPortal());
    assert.equal(await input.inputValue(), 'draft-1');

    await page.evaluate(() => fixture.setFail(true));
    await order.getByRole('button', { name: 'Save Tracking Changes' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Synthetic save rejection');
    assert.equal(await input.inputValue(), 'draft-1');
    await page.evaluate(() => { fixture.setFail(false); fixture.setHold(true); fixture.refresh(); });
    await page.waitForFunction(() => fixture.pendingCount() === 1);
    await page.evaluate(() => fixture.setHold(false));
    await order.getByRole('button', { name: 'Save Tracking Changes' }).click();
    await page.waitForFunction(() => document.querySelector('#order-a [data-summary]').textContent === 'draft-1');
    await page.evaluate(async () => { fixture.finish(); await inFlight; });
    assert.equal(await order.locator('[data-summary]').textContent(), 'draft-1');

    await order.getByRole('button', { name: 'Edit', exact: true }).click();
    await input.fill('discard-me');
    await page.evaluate(() => fixture.setNumber('server-update'));
    await order.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForFunction(() => document.querySelector('#order-a [data-summary]').textContent === 'server-update');
    assert.equal(await page.locator('#order-b [data-summary]').textContent(), 'B-1');
    const otherForm = page.locator('#order-b form');
    await otherForm.locator('[name=trackingNumber]').fill('unsaved-first-tracking');
    await page.evaluate(() => fixture.refreshSupplierPortal());
    assert.equal(await otherForm.locator('[name=trackingNumber]').inputValue(), 'unsaved-first-tracking');
    await otherForm.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await otherForm.locator('[name=trackingNumber]').inputValue(), 'B-1');
    const writes = await page.evaluate(() => fixture.writes());
    assert.deepEqual(writes.map(({ p_order_id, p_action, p_tracking_number }) =>
      [p_order_id, p_action, p_tracking_number]), [['a', 'edit_tracking', 'draft-1'], ['a', 'edit_tracking', 'draft-1']]);
  } finally {
    await browser.close();
  }
});
