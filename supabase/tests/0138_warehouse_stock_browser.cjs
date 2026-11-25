// Use the existing checkout harness environment variables for Playwright and Chrome.
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require(process.env.FURGO_TEST_PLAYWRIGHT || 'playwright');

const origin = 'https://furgo-warehouse.test';
const modulePath = path.resolve(__dirname, '../../js/warehouse-stock.js');
const receipt = { warehouse_product_id: 'warehouse', variant_id: 'small', quantity: 5 };
const adjustment = { p_lot_id: 'lot', p_quantity: 2, p_reason: 'Stock correction', p_notes: null };

const pageSource = `<script type="module">
  import { submitWarehouseStockRequest, recoverWarehouseStockRequest } from '/warehouse-stock.js';
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: window.actor } } }) },
    rpc: async (operation, fields) => {
      try {
        return await (await fetch('/rpc', { method: 'POST', body: JSON.stringify({ operation, fields }) })).json();
      } catch {
        return { error: { code: '' } };
      }
    },
  };
  window.actor = new URLSearchParams(location.search).get('actor') || 'store';
  window.submit = (operation, input) => submitWarehouseStockRequest(client, window.actor, operation, input);
  window.recover = () => recoverWarehouseStockRequest(client, window.actor);
</script>`;

for (const scenario of [
  { operation: 'receive', fields: receipt, commitBeforeLoss: true },
  { operation: 'adjust', fields: adjustment, commitBeforeLoss: false },
]) {
  test(`${scenario.operation} recovers the same request after reload`, async () => {
    const browser = await chromium.launch({ executablePath: process.env.FURGO_TEST_CHROMIUM });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      const ledger = new Map();
      let lost = false;
      await context.route(`${origin}/**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/warehouse-stock.js') {
          return route.fulfill({ contentType: 'text/javascript', body: await readFile(modulePath, 'utf8') });
        }
        if (pathname !== '/rpc') return route.fulfill({ contentType: 'text/html', body: pageSource });
        const request = route.request().postDataJSON();
        requests.push(request);
        const requestId = request.fields.p_request_id;
        if (!lost && !scenario.commitBeforeLoss) {
          lost = true;
          return route.abort();
        }
        if (!ledger.has(requestId)) ledger.set(requestId, { lot_id: 'lot', quantity_after: 3 });
        if (!lost) {
          lost = true;
          return route.abort();
        }
        return route.fulfill({ json: { data: ledger.get(requestId) } });
      });
      await page.goto(origin);
      await page.waitForFunction(() => window.submit);
      const first = await page.evaluate(({ operation, fields }) =>
        window.submit(operation, fields).catch((error) => error.message), scenario);
      assert.match(first, /confirmation is pending/);
      assert.equal(ledger.size, scenario.commitBeforeLoss ? 1 : 0);

      const changed = await page.evaluate(({ operation, fields }) =>
        window.submit(operation, { ...fields, changed: true }).catch((error) => error.message), scenario);
      assert.match(changed, /previous stock movement/);
      assert.equal(requests.length, 1);

      const other = await context.newPage();
      await other.goto(`${origin}/?actor=other`);
      await other.waitForFunction(() => window.recover);
      assert.equal(await other.evaluate(() => window.recover()), null);
      assert.equal(requests.length, 1);

      await page.reload();
      await page.waitForFunction(() => window.recover);
      assert.equal(await page.evaluate(() => window.recover()), scenario.operation);
      assert.deepEqual(requests, [requests[0], requests[0]]);
      assert.equal(ledger.size, 1);
      assert.equal(await page.evaluate(() => window.recover()), null);
    } finally {
      await browser.close();
    }
  });
}
