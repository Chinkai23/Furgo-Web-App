// Shared customer-visible order status rules. Admin lists use the same mapping.
export function statusCategory(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['completed', 'delivered'].includes(normalized)) return 'completed';
  if (['canceled', 'cancelled'].includes(normalized)) return 'canceled';
  if (['no-show', 'no show'].includes(normalized)) return 'no-show';
  return 'active';
}

export function customerOrderStatus(order = {}) {
  const rawStatus = String(order.adminStatus || order.status || '').trim();
  const normalized = rawStatus.toLowerCase().replace(/[-_]/g, ' ');
  const payment = String(order.paymentStatus || '').toLowerCase();
  const taxiLifecycle = ['Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup', 'Checked-In'];
  const matchedTaxiLifecycle = taxiLifecycle.find((status) => status.toLowerCase() === rawStatus.toLowerCase());
  if (matchedTaxiLifecycle) return matchedTaxiLifecycle;
  if (/^no\s*show$/.test(normalized)) return 'No-Show';
  if (/cancel/.test(normalized)) return 'Cancelled';
  if (/service complete/.test(normalized)) return 'Service Complete · Awaiting Pickup';
  if (/pet taxi|returning to customer|picked up/.test(normalized)) return 'Pet Taxi Delivering...';
  if (/complete|delivered|checked out/.test(normalized)) return 'Completed';
  if (/checked in/.test(normalized)) return 'Checked-In';
  if (/shipped|in progress/.test(normalized)) return order.serviceId === 'marketplace' ? 'In Progress' : 'Received Order';
  if (/received order/.test(normalized)) return 'Received Order';
  if (/^new order$/.test(normalized)) return 'New Order';
  if (/^pending payment$/.test(normalized)) return 'Pending Payment';
  if (/^(pending \/ confirmed|paid \/ processing)$/.test(normalized)) return /pending|failed|declined|rejected|awaiting|unpaid/.test(payment) ? 'Pending Payment' : 'New Order';
  if (/pending payment|awaiting verification|payment verification|failed|declined|rejected|unpaid/.test(normalized)
    || /pending|failed|declined|rejected|awaiting|unpaid/.test(payment)) return 'Pending Payment';
  if (order.receipt && order.serviceId !== 'marketplace') return 'Received Order';
  if (/paid|successful|succeeded/.test(payment) || /^(new|pending \/ confirmed|paid \/ processing)$/.test(normalized)) return 'New Order';
  if (/delivered/.test(normalized)) return 'Completed';
  return rawStatus || 'Pending Payment';
}
