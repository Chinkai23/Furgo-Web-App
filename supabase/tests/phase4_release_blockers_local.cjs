// Synthetic Supabase responses with a configurable server row cap.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../js/marketplace-order-reconciliation.js');

function mockReads(tables, { cap = 7, intercept } = {}) {
  const requests = [];
  return {
    requests,
    from(table) {
      let exact = false;
      const order = [];
      const filters = [];
      return {
        select(_columns, options) { exact = options.count === 'exact'; return this; },
        eq(field, value) { filters.push([field, [value]]); return this; },
        in(field, values) { filters.push([field, values]); return this; },
        order(field) { order.push(field); return this; },
        async range(start, end) {
          const rows = (tables[table] || []).filter((row) => filters.every(([field, values]) => values.includes(row[field])))
            .sort((a, b) => {
              for (const field of order) {
                if (a[field] < b[field]) return -1;
                if (a[field] > b[field]) return 1;
              }
              return 0;
            });
          const request = { table, start, end, filters };
          requests.push(request);
          return intercept?.(request) || { data: rows.slice(start, Math.min(end + 1, start + cap)), count: exact ? rows.length : null };
        },
      };
    },
  };
}

test('paginates order headers, items and returns below an enforced cap, with bounded ID filters', async () => {
  const { readMarketplaceOrderSnapshot } = await modulePromise;
  const orders = Array.from({ length: 63 }, (_, i) => ({ id: String(i).padStart(3, '0'), user_id: 'owner' }));
  const items = orders.flatMap((order) => [1, 2].map((line) => ({
    order_id: order.id, line_number: line, item: { allocated: line },
  })));
  const returns = orders.map((order) => ({ order_id: order.id, line_number: 2, status: 'Requested' }));
  const client = mockReads({
    marketplace_orders: [...orders, { id: 'other', user_id: 'other' }],
    marketplace_order_items: items, marketplace_item_returns: returns,
  });
  const snapshot = await readMarketplaceOrderSnapshot(client, { ownerId: 'owner', current: () => true });
  assert.equal(snapshot.orders.length, 63);
  assert.equal(snapshot.items.length, 126);
  assert.equal(snapshot.returns.length, 63);
  assert.equal(snapshot.items.find((row) => row.order_id === '062' && row.line_number === 2).item.allocated, 2);
  assert.ok(client.requests.filter((request) => request.table !== 'marketplace_orders')
    .every((request) => request.filters.some(([field, ids]) => field === 'order_id' && ids.length <= 25)));
  for (const table of ['marketplace_orders', 'marketplace_order_items', 'marketplace_item_returns']) {
    assert.ok(client.requests.some((request) => request.table === table && request.start > 0), table);
  }
});

test('rejects an empty intermediate page, missing count, and a failed return query', async () => {
  const { readMarketplaceOrderSnapshot } = await modulePromise;
  const tables = {
    marketplace_orders: [{ id: 'a' }, { id: 'b' }],
    marketplace_order_items: [{ order_id: 'a', line_number: 1 }, { order_id: 'b', line_number: 1 }],
  };
  for (const [intercept, message] of [
    [({ table, start }) => table === 'marketplace_order_items' && start === 1 && { data: [] }, /incomplete/],
    [({ table }) => table === 'marketplace_orders' && { data: [{ id: 'a' }] }, /incomplete/],
    [({ table }) => table === 'marketplace_item_returns' && { error: Error('return query failed') }, /return query failed/],
  ]) {
    await assert.rejects(readMarketplaceOrderSnapshot(mockReads(tables, { cap: 1, intercept }), { current: () => true }), message);
  }
});

test('duplicate notices use one scoped ID and refresh merges leave unrelated records unchanged', async () => {
  const { marketplaceOrderChangeId, readMarketplaceOrderSnapshot, mergeMarketplaceOrderSnapshot } = await modulePromise;
  const ids = [
    marketplaceOrderChangeId('marketplace_orders', { eventType: 'UPDATE', new: { id: 'a', order_version: 4 } }),
    marketplaceOrderChangeId('marketplace_order_items', { eventType: 'UPDATE', new: { order_id: 'a' } }),
    marketplaceOrderChangeId('marketplace_orders', { eventType: 'UPDATE', new: { id: 'a', order_version: 2 } }),
  ];
  assert.equal(marketplaceOrderChangeId('marketplace_item_returns', { eventType: 'DELETE', old: { id: 'return-id' } }), null);
  const client = mockReads({ marketplace_orders: [{ id: 'a' }, { id: 'b' }] });
  const snapshot = await readMarketplaceOrderSnapshot(client, { current: () => true, ids });
  assert.deepEqual(snapshot.orders.map((order) => order.id), ['a']);
  assert.deepEqual(client.requests[0].filters, [['id', ['a']]]);
  const other = { id: 'b', _orderVersion: 40, items: [{ payment: 'Paid' }] };
  const previous = [{ id: 'a', _orderVersion: 3 }, other];
  assert.equal(mergeMarketplaceOrderSnapshot(previous, [{ id: 'a', _orderVersion: 2 }], ['a']), null);
  const replaced = mergeMarketplaceOrderSnapshot(previous, [{ id: 'a', _orderVersion: 4 }], ['a']);
  assert.equal(replaced[0]._orderVersion, 4);
  assert.strictEqual(replaced[1], other);
  assert.deepEqual(mergeMarketplaceOrderSnapshot(previous, [], ['a']), [other]);
});
