const pageSize = 100;
const orderBatchSize = 25;

// Use the exact visible count and advance by rows actually returned. A server
// cap can be smaller than our requested range, even on the first page.
async function readComplete(makeQuery, identify, current) {
  const records = [];
  const seen = new Set();
  let expected;
  do {
    if (!current()) return null;
    const first = expected === undefined;
    const offset = records.length;
    const { data, error, count } = await makeQuery(first).range(offset, offset + pageSize - 1);
    if (!current()) return null;
    if (error) throw error;
    if (first) expected = count;
    if (!Number.isSafeInteger(expected) || expected < 0 || !Array.isArray(data)
        || offset + data.length > expected || (!data.length && offset < expected)) {
      throw new Error('Marketplace order refresh was incomplete. Retry to confirm the latest orders.');
    }
    for (const row of data) {
      const identity = identify(row);
      if (seen.has(identity)) throw new Error('Marketplace orders changed while loading. Retry the refresh.');
      seen.add(identity);
      records.push(row);
    }
  } while (records.length < expected);
  return records;
}

function batches(ids) {
  const output = [];
  for (let index = 0; index < ids.length; index += orderBatchSize) {
    output.push(ids.slice(index, index + orderBatchSize));
  }
  return output;
}

export function marketplaceOrderChangeId(table, change) {
  const row = change?.eventType === 'DELETE' ? change.old : change?.new;
  const id = table === 'marketplace_orders' ? row?.id : row?.order_id;
  return typeof id === 'string' && id ? id : null;
}

// A scoped read has the same completeness requirements as a reconnect.
export async function readMarketplaceOrderSnapshot(client, { ids, ownerId, current }) {
  const requested = ids == null ? null : [...new Set(ids)];
  const orders = [];
  const items = [];
  const returns = [];
  const select = (table, columns, count) => client.from(table).select(columns, count ? { count: 'exact' } : {});
  for (const batch of requested === null ? [null] : batches(requested)) {
    const rows = await readComplete((count) => {
      let query = select('marketplace_orders', '*', count).order('id');
      if (ownerId) query = query.eq('user_id', ownerId);
      if (batch) query = query.in('id', batch);
      return query;
    }, (row) => row.id, current);
    if (!rows) return null;
    orders.push(...rows);
  }
  for (const batch of batches(orders.map((order) => order.id))) {
    const lineKey = (row) => JSON.stringify([row.order_id, row.line_number]);
    const [itemRows, returnRows] = await Promise.all([
      readComplete((count) => select('marketplace_order_items', 'order_id,line_number,item', count)
        .in('order_id', batch).order('order_id').order('line_number'), lineKey, current),
      readComplete((count) => select('marketplace_item_returns', '*', count)
        .in('order_id', batch).order('order_id').order('line_number'), lineKey, current),
    ]);
    if (!itemRows || !returnRows) return null;
    items.push(...itemRows);
    returns.push(...returnRows);
  }
  return { orders, items, returns };
}

export function mergeMarketplaceOrderSnapshot(previous, incoming, ids) {
  const byId = new Map(previous.map((order) => [String(order.id), order]));
  const next = new Map();
  if (ids) {
    const requested = new Set(ids);
    for (const [id, order] of byId) if (!requested.has(id)) next.set(id, order);
  }
  for (const record of incoming) {
    const id = String(record.id);
    const prior = byId.get(id);
    if (prior && Number(prior._orderVersion) > Number(record._orderVersion)) return null;
    next.set(id, record);
  }
  return [...next.values()].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
}
