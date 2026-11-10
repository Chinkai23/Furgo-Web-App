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

export function marketplaceShipmentSummary(order = {}, items = order.items || [], products = []) {
  const lines = Array.isArray(items) ? items : [];
  const supplierShipment = order.supplierShipment;
  const shippedStatus = (value) => ['shipped', 'delivered'].includes(String(value || '').toLowerCase());
  const shippedCount = lines.filter((item) => {
    if (supplierShipment) return shippedStatus(supplierShipment.status);
    const product = products.find((entry) => String(entry.id) === String(item.productId || ''));
    const variant = product?.variants?.find((entry) => String(entry.id) === String(item.variantId || ''));
    const supplier = String(item.supplierId || item.supplier || item.shopName || variant?.supplierId || variant?.supplier || product?.supplierName || '').trim().toLowerCase();
    const shipment = Object.entries(order.supplierShipments || {}).find(([key, value]) =>
      key.trim().toLowerCase() === supplier || String(value?.supplierName || '').trim().toLowerCase() === supplier
    )?.[1];
    return Boolean(supplier && shippedStatus(shipment?.status));
  }).length;
  if (!shippedCount) return 'No products shipped out';
  if (shippedCount === lines.length) return 'All products shipped out';
  return `${shippedCount}/${lines.length} products shipped out`;
}
