// Section: Supabase application data sync
// Function: Keep prototype customer state and Admin-managed catalogs in shared Supabase storage.
import { createRecoveryQueue, stopPortalRecovery, syncFailureMessage } from './sync-recovery.js';
import { marketplaceOrderChangeId, mergeMarketplaceOrderSnapshot, readMarketplaceOrderSnapshot } from './marketplace-order-reconciliation.js';
import { supabase } from './supabase.js';
import { uploadMarketplaceLegacySnapshots } from './marketplace-legacy-recovery.js';

const marketplaceOrdersKey = 'furgo-demo-marketplace-orders';

const marketplaceProductsKey = 'furgo-demo-marketplace-products';
const versionedSharedKeys = new Set([
  'furgo-demo-hotel-settings',
  'furgo-demo-daycare-settings',
  'furgo-demo-pet-taxi-settings',
  'furgo-demo-service-banners',
  'furgo-demo-marketplace-offers',
  'furgo-demo-promotions',
  'furgo-demo-help-center-details',
  'furgo-demo-home-service-shortcuts',
]);
const sharedKeys = new Set([...versionedSharedKeys, marketplaceProductsKey]);

const customerKeys = new Set([
  'furgo-demo-addresses',
  'furgo-demo-payment-methods',
  'furgo-demo-marketplace-cart',
  'furgo-demo-marketplace-favorites',
  'furgo-demo-local-finder-favorites',
  'furgo-demo-credit-balance',
  'furgo-demo-credit-transactions',
  'furgo-demo-daycare-passes',
  'furgo-demo-pet-assistant-preferences',
  'furgo-demo-pet-reminders',
  'furgo-demo-pet-records',
  'furgo-pet-assistant-preview-history',
  'furgo-demo-marketplace-subscription-cart',
  'furgo-demo-marketplace-active-subscriptions',
]);

const operationKeys = new Set([
  marketplaceOrdersKey,
  'furgo-demo-hotel-bookings',
  'furgo-demo-daycare-bookings',
  'furgo-demo-daycare-orders',
  'furgo-demo-check-in-tokens',
  'furgo-demo-driver-locations',
]);
const receiptOrderKeys = new Set([
  marketplaceOrdersKey,
  'furgo-demo-grooming-bookings',
  'furgo-demo-hotel-bookings',
  'furgo-demo-daycare-bookings',
  'furgo-demo-pet-daycare-bookings',
  'furgo-demo-daycare-orders',
]);
const operationObjectKeys = new Set(['furgo-demo-check-in-tokens', 'furgo-demo-driver-locations']);
const dedicatedOperationKeys = new Set([
  marketplaceOrdersKey,
  'furgo-demo-hotel-bookings',
  'furgo-demo-daycare-bookings',
]);
const elevatedOrderRoles = new Set(['admin', 'staff', 'executive', 'manager', 'director']);
const fullAdminRoles = new Set(['admin', 'director']);
const updateOnlyOrderRoles = new Set(['staff', 'executive', 'manager']);

const allSyncedKeys = new Set([...sharedKeys, ...customerKeys, ...operationKeys]);
const marketplaceSupplierContactsKey = 'furgo-demo-marketplace-suppliers';
const personalCustomerKeys = new Set([
  'furgo-demo-pet-assistant-preferences',
  'furgo-demo-pet-reminders',
  'furgo-demo-pet-records',
  'furgo-pet-assistant-preview-history',
  'furgo-demo-marketplace-subscription-cart',
  'furgo-demo-marketplace-active-subscriptions',
]);
let originalGetItem;
let originalSetItem;
let stopMainRecovery;
let legacyReady = false;
let legacyWriteRevision = 0;
const tabBusinessKeys = new Set([...customerKeys, ...operationKeys, ...receiptOrderKeys,
  marketplaceSupplierContactsKey, 'furgo-demo-customer-records', 'furgo-demo-admin-customer-pet-profiles',
  'furgo-demo-pet-profiles']);
const tabBusinessData = new Map();
const guestShoppingKeys = new Set(['furgo-demo-marketplace-cart', 'furgo-demo-marketplace-favorites']);
const guestShoppingData = new Map();

function setCacheItem(key, value) {
  if (tabBusinessKeys.has(key)) {
    if (activeUserId) tabBusinessData.set(key, String(value));
  }
  else originalSetItem.call(localStorage, key, value);
}

export function captureCloudSession() {
  const session = sharedSession;
  return () => session === sharedSession;
}

export function reportSyncIssue(message) {
  window.dispatchEvent(new CustomEvent('furgo-sync-status', { detail: message }));
}
let originalRemoveItem;
let activeUserId = '';
let activeRole = 'customer';
let applyingRemoteData = false;
let realtimeChannel;
let dedicatedTablesReady = false;
let catalogRefreshSequence = 0;
let sharedSession = 0;
let sharedWrites = 0;
let sharedRefreshTimer;
let sharedRefreshPending = false;
let sharedRefreshAgain = false;
const sharedSettings = new Map();
const sharedRecordIds = [...versionedSharedKeys].map((key) => rowId('shared', key, null));
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function readSharedAppData(key) {
  return sharedSettings.get(key)?.serialized ?? null;
}

function loadSharedSettings(rows, { notify = false } = {}) {
  const byId = new Map(rows.map((row) => [row.record_id, row]));
  const changed = [];
  for (const key of versionedSharedKeys) {
    const row = byId.get(rowId('shared', key, null));
    const valid = row?.scope === 'shared' && row.storage_key === key && row.owner_id === null;
    let version = row ? undefined : null;
    if (valid && uuidPattern.test(row.sync_version)) version = row.sync_version;
    const serialized = valid ? JSON.stringify(row.payload) : null;
    if (sharedSettings.get(key)?.serialized !== serialized) changed.push(key);
    sharedSettings.set(key, { version, serialized });
  }
  if (notify && !fullAdminRoles.has(activeRole)) {
    for (const key of changed) window.dispatchEvent(new StorageEvent('storage', { key }));
  }
}

function selectSharedSettings() {
  // The targeted read cannot lose a canonical setting to the general row limit.
  return supabase.from('app_data').select('*').in('record_id', sharedRecordIds);
}

function scheduleSharedSettingsRefresh(session) {
  if (session !== sharedSession) return;
  if (sharedRefreshPending) {
    sharedRefreshAgain = true;
    return;
  }
  if (sharedRefreshTimer) return;
  sharedRefreshTimer = setTimeout(async () => {
    sharedRefreshTimer = undefined;
    sharedRefreshPending = true;
    const writes = sharedWrites;
    try {
      const { data, error } = await selectSharedSettings();
      if (session !== sharedSession) return;
      if (error) throw error;
      if (writes !== sharedWrites) sharedRefreshAgain = true;
      else loadSharedSettings(data || [], { notify: true });
    } catch {
      if (session === sharedSession) console.warn('Shared settings could not be refreshed. Reload when connected to retry.');
    } finally {
      if (session === sharedSession) {
        sharedRefreshPending = false;
        if (sharedRefreshAgain) {
          sharedRefreshAgain = false;
          scheduleSharedSettingsRefresh(session);
        }
      }
    }
  }, 120);
}

function resetSharedSettings() {
  sharedSession += 1;
  clearTimeout(sharedRefreshTimer);
  sharedRefreshTimer = undefined;
  sharedRefreshPending = false;
  sharedRefreshAgain = false;
  sharedSettings.clear();
}

// Generated receipts are reconstructed from receipt.document at download time.
// Keep their PDF out of Supabase JSON and the browser order cache.
function compactReceiptOrder(order) {
  const receipt = order?.receipt;
  if (!Object.prototype.hasOwnProperty.call(receipt || {}, 'data')) return order;
  if (receipt.source === 'upload' && !receipt.document) return order;
  const hasPdfPayload = receipt.document
    || /^data:application\/pdf(?:;|,)/i.test(String(receipt.data || ''))
    || /\.pdf$/i.test(String(receipt.name || ''));
  if (!hasPdfPayload) return order;
  const { data: _discardedPdf, ...receiptDetails } = receipt;
  return { ...order, receipt: receiptDetails };
}

function compactReceiptRecords(key, records) {
  return receiptOrderKeys.has(key) && Array.isArray(records)
    ? records.map(compactReceiptOrder)
    : records;
}

function rowId(scope, key, ownerId) {
  return `${scope}:${key}:${ownerId || 'shared'}`;
}

function getScope(key) {
  if (sharedKeys.has(key)) return 'shared';
  if (customerKeys.has(key)) return 'customer';
  if (operationKeys.has(key)) return 'operation';
  return '';
}

function readLocal(key) {
  if (key === marketplaceOrdersKey) return readMarketplaceOrderCache();
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function writeRemote(key, value) {
  const current = captureCloudSession();
  // The Marketplace order cache is read-only outside the order RPCs.
  if (key === marketplaceOrdersKey || sharedKeys.has(key)) return;
  value = compactReceiptRecords(key, value);
  const scope = getScope(key);
  if (!scope || !activeUserId) return;
  if (!dedicatedOperationKeys.has(key) && !legacyReady) throw new Error('Cloud data has not been confirmed. Reload before saving.');
  if (scope === 'customer' && fullAdminRoles.has(activeRole) && !personalCustomerKeys.has(key)) return;

  if (dedicatedOperationKeys.has(key)) {
    if (!dedicatedTablesReady) throw new Error('Booking data is unavailable. Reload before saving.');
    await writeDedicatedOperations(key, value);
    return;
  }

  legacyWriteRevision += 1;
  const records = scope === 'operation' && elevatedOrderRoles.has(activeRole) && Array.isArray(value)
    ? groupOperationsByOwner(value)
    : scope === 'operation' && elevatedOrderRoles.has(activeRole) && operationObjectKeys.has(key) && value && typeof value === 'object'
      ? groupOperationObjectByOwner(value)
      : [{ ownerId: activeUserId, value }];
  for (const record of records) {
    const payload = record.value;
    const ownerId = record.ownerId;
    const { error } = await supabase.from('app_data').upsert({
      record_id: rowId(scope, key, ownerId),
      scope,
      storage_key: key,
      owner_id: ownerId,
      payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'record_id' });
    if (error) throw error;
    if (!current()) return;
  }
}

function safeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;
}

// Marketplace order snapshots live only for the current authenticated tab.
let marketplaceCacheOwner = '';
let marketplaceOrderCache = [];
let marketplaceCacheRevision = 0;
let marketplaceLegacyHistory = [];

export function clearMarketplaceOrderCache() {
  marketplaceCacheOwner = '';
  marketplaceOrderCache = [];
  marketplaceCacheRevision += 1;
  marketplaceLegacyHistory = [];
}

// Stop the old session before another identity can use its storage mirror.
export function stopCloudAppData() {
  resetSharedSettings();
  stopPortalRecovery();
  stopMainRecovery?.();
  stopMainRecovery = undefined;
  tabBusinessData.clear();
  guestShoppingData.clear();
  catalogRefreshSequence += 1;
  activeUserId = '';
  activeRole = 'customer';
  dedicatedTablesReady = false;
  legacyReady = false;
  clearMarketplaceOrderCache();
  const channel = realtimeChannel;
  realtimeChannel = undefined;
  if (channel) void supabase.removeChannel(channel).catch(() => console.warn('The previous data subscription could not be removed.'));
}

export function readMarketplaceOrderCache(archiveOwner) {
  if (!archiveOwner) return structuredClone(marketplaceOrderCache);
  if (archiveOwner !== marketplaceCacheOwner) return [];
  const ids = new Set(marketplaceOrderCache.map((record) => String(record.id)));
  return structuredClone([...marketplaceOrderCache, ...marketplaceLegacyHistory.filter((record) => !ids.has(String(record.id)))]);
}

// Upload encrypted evidence as-is. The intake RPC cannot grant history
// ownership and acknowledges an identical retry without storing it twice.
export async function preserveBrowserMarketplaceHistory() {
  try {
    await uploadMarketplaceLegacySnapshots(async (envelope) => {
      const { data, error } = await supabase.rpc('preserve_marketplace_legacy_snapshot', { p_snapshot: envelope });
      if (error) throw error;
      return data;
    });
  } catch {
    console.warn('Encrypted Marketplace history will retry on the next authenticated load.');
  }
}

async function writeDedicatedRecord(key, record, ownerId) {
  if (!record || !ownerId || !record.id) return;
  record = compactReceiptOrder(record);
  const id = String(record.id);
  const createdAt = safeTimestamp(record.createdAt);
  const { _cloudOwnerId, userId, ...details } = record;
  if (key === 'furgo-demo-hotel-bookings') {
    const payload = {
      id,
      user_id: ownerId,
      reference: String(record.reference || id),
      status: String(record.status || 'Pending / Confirmed'),
      outlet: String(record.outlet || ''),
      room_id: String(record.roomId || ''),
      check_in: safeDate(record.checkIn),
      check_out: safeDate(record.checkOut),
      assigned_unit: String(record.assignedUnit || ''),
      details,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    };
    const query = updateOnlyOrderRoles.has(activeRole)
      ? supabase.from('pet_hotel_bookings').update(payload).eq('id', id)
      : supabase.from('pet_hotel_bookings').upsert(payload, { onConflict: 'id' });
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('The booking save could not be confirmed. Reload and check your access.');
    return;
  }

  const payload = {
    id,
    user_id: ownerId,
    reference: String(record.reference || id),
    status: String(record.status || 'Pending / Confirmed'),
    outlet: String(record.outlet || ''),
    visit_date: safeDate(record.date),
    dropoff_time: String(record.dropoffTime || ''),
    pickup_time: String(record.pickupTime || ''),
    details,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  };
  const query = updateOnlyOrderRoles.has(activeRole)
    ? supabase.from('pet_daycare_bookings').update(payload).eq('id', id)
    : supabase.from('pet_daycare_bookings').upsert(payload, { onConflict: 'id' });
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('The booking save could not be confirmed. Reload and check your access.');
}

async function writeDedicatedOperations(key, value) {
  const current = captureCloudSession();
  const records = elevatedOrderRoles.has(activeRole) && Array.isArray(value)
    ? groupOperationsByOwner(value)
    : [{ ownerId: activeUserId, value: Array.isArray(value) ? value : [] }];
  for (const group of records) {
    for (const record of group.value) {
      if (!current()) return;
      await writeDedicatedRecord(key, record, group.ownerId);
    }
  }
}

// Saves a service booking to Supabase before updating the browser cache, matching Grooming's submit flow.
export async function saveDedicatedBooking(key, booking, records) {
  if (key === marketplaceOrdersKey || !dedicatedOperationKeys.has(key) || !booking?.id || !Array.isArray(records)) throw new Error('This booking type cannot be synchronized.');
  const current = captureCloudSession();
  if (!activeUserId || !dedicatedTablesReady) throw new Error('Booking data is unavailable. Reload before saving.');
  await writeDedicatedRecord(key, booking, booking.userId || activeUserId);
  if (!current()) throw new Error('The sign-in session changed. Reload to verify the save.');
  const serialized = JSON.stringify(records);
  applyingRemoteData = true;
  try {
    if (originalSetItem) setCacheItem(key, serialized);
    else localStorage.setItem(key, serialized);
  } finally {
    applyingRemoteData = false;
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

export function marketplaceCheckoutOwner() {
  return marketplaceCacheOwner;
}

export async function quoteMarketplaceOrder(items, voucherCode) {
  const { data, error } = await supabase.rpc('quote_marketplace_order', { p_items: items, p_voucher_code: voucherCode });
  if (error) throw error;
  if (!Number.isSafeInteger(data?.totalCents)) throw new Error('The checkout total could not be confirmed.');
  return data;
}

function confirmedMarketplaceCheckout(owner, requestId, result) {
  if (owner !== marketplaceCacheOwner) throw new Error('The checkout account changed. Sign in to the original account to recover the order.');
  if (result?.requestId !== requestId || !result.order?.id || result.order.user_id !== owner || !Array.isArray(result.items) || !result.items.length) {
    throw new Error('The order response could not be confirmed.');
  }
  try { applyDedicatedRow(marketplaceOrdersKey, result.order, result.items); }
  catch (error) { console.warn('The committed Marketplace order could not be cached:', error); }
  return dedicatedRecordFromRow(marketplaceOrdersKey, result.order, result.items);
}

export async function findMarketplaceCheckout(owner, requestId) {
  if (!owner || owner !== marketplaceCacheOwner) throw new Error('Please sign in to recover your order.');
  const { data, error } = await supabase.rpc('get_marketplace_checkout', { p_request_id: requestId });
  if (error) throw error;
  return data == null ? null : confirmedMarketplaceCheckout(owner, requestId, data);
}

export async function saveMarketplaceOrder(owner, { id, payload, totalCents }) {
  if (!owner || owner !== marketplaceCacheOwner) throw new Error('Please sign in before placing your order.');
  const { data, error } = await supabase.rpc('create_marketplace_order', {
    p_request_id: id, p_checkout: payload, p_expected_total_cents: totalCents,
  });
  if (error) throw error;
  if (data?.outcome === 'quote_changed' && Number.isSafeInteger(data.quote?.totalCents)) return { quote: data.quote };
  return { order: confirmedMarketplaceCheckout(owner, id, data) };
}

export async function syncConfirmedMarketplaceCart(owner, cart) {
  if (!owner || owner !== marketplaceCacheOwner) throw new Error('Sign in to finish updating your cart.');
  await writeRemote('furgo-demo-marketplace-cart', cart);
}

export async function refreshMarketplaceDemoCredit(owner) {
  const current = captureCloudSession();
  const keys = ['furgo-demo-credit-balance', 'furgo-demo-credit-transactions'];
  const { data, error } = await supabase.from('app_data').select('storage_key,payload')
    .eq('owner_id', owner).eq('scope', 'customer').in('record_id', keys.map((key) => rowId('customer', key, owner)));
  if (error) throw error;
  if (!current() || owner !== marketplaceCacheOwner) return;
  for (const row of data || []) {
    setCacheItem(row.storage_key, JSON.stringify(row.payload));
  }
}

// Admin actions submit only the intended change and the version rendered in the UI.
export async function updateMarketplaceOrder(orderId, expectedVersion, action, payload = {}) {
  const version = Number(expectedVersion);
  if (expectedVersion == null || expectedVersion === '' || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('Refresh the order before making changes.');
  }
  const current = captureCloudSession();
  const owner = marketplaceCacheOwner;
  const { data, error } = await supabase.rpc('update_admin_marketplace_order', {
    p_order_id: orderId,
    p_expected_version: version,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  const confirmedVersion = Number(data?.order_version);
  if (data?.id !== orderId || data?.order_version == null || !Number.isSafeInteger(confirmedVersion) || confirmedVersion < version) {
    throw new Error('The order update could not be confirmed. Refresh the order before trying again.');
  }
  if (!current() || owner !== marketplaceCacheOwner) return;
  try { applyDedicatedRow(marketplaceOrdersKey, data); }
  catch (cacheError) { console.warn('The Marketplace order was saved, but its local cache could not be updated:', cacheError); }
}

// Writes service order status/receipt changes before refreshing this browser's cache.
export async function saveOrderRecords(key, order, records) {
  if (!key || key === marketplaceOrdersKey || !order?.id || !Array.isArray(records)) throw new Error('This order update cannot be synchronized.');
  if (!activeUserId) throw new Error('Sign in and reload before saving this order.');
  const current = captureCloudSession();
  order = compactReceiptOrder(order);
  records = compactReceiptRecords(key, records);
  if (activeUserId) {
    if (key === 'furgo-demo-grooming-bookings') {
      const { data, error } = await supabase.from('grooming_bookings').update({ status: order.status, details: order }).eq('id', order.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error('This order update could not be confirmed. Reload and check your access.');
    } else if (dedicatedOperationKeys.has(key)) {
      const ownerId = order._cloudOwnerId || order.userId || activeUserId;
      if (!dedicatedTablesReady) throw new Error('Booking data is unavailable. Reload before saving.');
      await writeDedicatedRecord(key, order, ownerId);
    } else {
      if (!operationKeys.has(key)) throw new Error('This order type cannot be saved online.');
      await writeRemote(key, records);
    }
  }
  if (!current()) throw new Error('The sign-in session changed. Reload to verify the save.');
  const serialized = JSON.stringify(records);
  applyingRemoteData = true;
  try {
    if (originalSetItem) setCacheItem(key, serialized);
    else localStorage.setItem(key, serialized);
  } finally {
    applyingRemoteData = false;
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

// Updates a browser cache from a trusted RPC/realtime response without mirroring it back as a new client write.
export function cacheSyncedRecords(key, records, { notify = true } = {}) {
  if (!key || !Array.isArray(records)) return;
  records = compactReceiptRecords(key, records);
  if (key === marketplaceOrdersKey) {
    if (!marketplaceCacheOwner) return;
    marketplaceOrderCache = structuredClone(records);
    marketplaceCacheRevision += 1;
  } else {
    if (!originalSetItem) originalSetItem = Storage.prototype.setItem;
    applyingRemoteData = true;
    try { setCacheItem(key, JSON.stringify(records)); }
    finally { applyingRemoteData = false; }
  }
  if (notify) window.dispatchEvent(new StorageEvent('storage', { key }));
}

// Refresh Marketplace quantities after database-side warehouse batch changes.
export async function refreshMarketplaceCatalogFromDatabase({ notify = true, expectedOwner = '' } = {}) {
  const sequence = ++catalogRefreshSequence;
  const { data, error } = await supabase.from('app_data')
    .select('payload')
    .eq('record_id', 'shared:furgo-demo-marketplace-products:shared')
    .eq('scope', 'shared').eq('storage_key', 'furgo-demo-marketplace-products').is('owner_id', null)
    .maybeSingle();
  if (error) throw error;
  if (sequence !== catalogRefreshSequence || (expectedOwner && expectedOwner !== marketplaceCacheOwner)) return null;
  if (!data) {
    cacheSyncedRecords(marketplaceProductsKey, [], { notify });
    return [];
  }
  if (!Array.isArray(data.payload)) throw new Error('Invalid Marketplace catalog response.');
  cacheSyncedRecords('furgo-demo-marketplace-products', data.payload, { notify });
  return data.payload;
}

function dedicatedRecordFromRow(key, row, items = []) {
  const record = { ...(row.details || {}), id: row.id, userId: row.user_id, reference: row.reference, status: row.status, createdAt: row.created_at };
  if (key === marketplaceOrdersKey) {
    record._orderVersion = row.order_version;
    record.paymentStatus = row.payment_status;
    record.paymentChannel = row.payment_channel;
    record.total = Number(row.total) || 0;
    record.outlet = row.outlet || record.outlet || '';
    record.items = items;
  } else if (key === 'furgo-demo-hotel-bookings') {
    record.outlet = row.outlet;
    record.roomId = row.room_id;
    record.checkIn = row.check_in || record.checkIn || '';
    record.checkOut = row.check_out || record.checkOut || '';
    record.assignedUnit = row.assigned_unit;
  } else {
    record.outlet = row.outlet;
    record.date = row.visit_date || record.date || '';
    record.dropoffTime = row.dropoff_time || record.dropoffTime || '';
    record.pickupTime = row.pickup_time || record.pickupTime || '';
  }
  if (elevatedOrderRoles.has(activeRole)) record._cloudOwnerId = row.user_id;
  return compactReceiptOrder(record);
}

async function reconcileMarketplaceOrders(userId, role, ids = null) {
  const current = captureCloudSession();
  const revision = marketplaceCacheRevision;
  const snapshot = await readMarketplaceOrderSnapshot(supabase, {
    ids,
    ownerId: elevatedOrderRoles.has(role) || role === 'driver' ? null : userId,
    current: () => current() && revision === marketplaceCacheRevision,
  });
  if (!current() || marketplaceCacheOwner !== userId) return true;
  if (!snapshot || revision !== marketplaceCacheRevision) return false;
  const { orders, items: itemRows, returns: returnRows } = snapshot;
  const itemsByOrder = new Map();
  for (const row of itemRows) {
    if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
    itemsByOrder.get(row.order_id).push({ ...row.item, lineNumber: Number(row.line_number) });
  }
  const returnsByLine = new Map(returnRows.map((itemReturn) => [`${itemReturn.order_id}:${itemReturn.line_number}`, {
    id: itemReturn.id,
    status: itemReturn.status,
    reason: itemReturn.reason,
    photoPath: itemReturn.photo_path,
    paidAmount: Number(itemReturn.paid_amount) || 0,
    shippingRefund: Number(itemReturn.shipping_refund) || 0,
    refundAmount: Number(itemReturn.refund_amount) || 0,
    supplierResponse: itemReturn.supplier_response || '',
    decisionReason: itemReturn.decision_reason || '',
    requestedAt: itemReturn.requested_at,
    refundedAt: itemReturn.refunded_at,
  }]));
  for (const [orderId, items] of itemsByOrder) {
    items.forEach((item) => { item.returnRequest = returnsByLine.get(`${orderId}:${item.lineNumber}`) || null; });
  }
  const normalized = orders.map((row) => dedicatedRecordFromRow(marketplaceOrdersKey, row, itemsByOrder.get(row.id) || []));
  const records = mergeMarketplaceOrderSnapshot(marketplaceOrderCache, normalized, ids);
  if (!records) throw new Error('A newer Marketplace order is already displayed. Retry to confirm the latest orders.');
  cacheSyncedRecords(marketplaceOrdersKey, records, { notify: false });
  return true;
}

async function loadDedicatedBookings(userId, role) {
  const current = captureCloudSession();
  const ownQuery = (query) => elevatedOrderRoles.has(role) || role === 'driver' ? query : query.eq('user_id', userId);
  const bookings = await Promise.all([
    ownQuery(supabase.from('pet_hotel_bookings').select('*').order('created_at', { ascending: false })),
    ownQuery(supabase.from('pet_daycare_bookings').select('*').order('created_at', { ascending: false })),
  ]);
  for (const result of bookings) if (result.error) throw result.error;
  if (!current() || marketplaceCacheOwner !== userId) return;
  for (const [index, key] of ['furgo-demo-hotel-bookings', 'furgo-demo-daycare-bookings'].entries()) {
    cacheSyncedRecords(key, (bookings[index].data || []).map((row) => dedicatedRecordFromRow(key, row)), { notify: false });
  }
}

function applyDedicatedRow(key, row, items, removed = false) {
  if (!row?.id) return;
  const cached = readLocal(key);
  const records = Array.isArray(cached) ? cached : [];
  const index = records.findIndex((item) => String(item.id) === String(row.id));
  const previous = records[index];
  if (key === marketplaceOrdersKey && !removed && Number(previous?._orderVersion) > Number(row.order_version)) return;
  if (removed) {
    if (index === -1) return;
    records.splice(index, 1);
  } else {
    const record = dedicatedRecordFromRow(key, row, items ?? previous?.items);
    if (index === -1) records.push(record);
    else records[index] = record;
  }
  cacheSyncedRecords(key, records);
}

function groupOperationsByOwner(items) {
  const groups = new Map();
  for (const item of items) {
    const ownerId = item?.userId || item?._cloudOwnerId;
    if (!ownerId) continue;
    if (!groups.has(ownerId)) groups.set(ownerId, []);
    const { _cloudOwnerId, ...record } = item;
    groups.get(ownerId).push(record);
  }
  return [...groups].map(([ownerId, value]) => ({ ownerId, value }));
}

function groupOperationObjectByOwner(value) {
  const groups = new Map();
  for (const [entryKey, entryValue] of Object.entries(value || {})) {
    const ownerId = entryValue?._cloudOwnerId || activeUserId;
    if (!groups.has(ownerId)) groups.set(ownerId, {});
    const { _cloudOwnerId, ...record } = entryValue || {};
    groups.get(ownerId)[entryKey] = record;
  }
  return [...groups].map(([ownerId, value]) => ({ ownerId, value }));
}

function installStorageMirror(userId, role) {
  activeUserId = userId;
  activeRole = role;
  if (!originalSetItem) originalSetItem = Storage.prototype.setItem;
  if (!originalRemoveItem) originalRemoveItem = Storage.prototype.removeItem;
  if (!originalGetItem) originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function(key) {
    if (this === localStorage && tabBusinessKeys.has(key)) {
      const cache = !activeUserId && guestShoppingKeys.has(key) ? guestShoppingData : tabBusinessData;
      return cache.get(key) ?? null;
    }
    return originalGetItem.call(this, key);
  };
  Storage.prototype.setItem = function(key, value) {
    if (this === localStorage && (key === marketplaceOrdersKey || versionedSharedKeys.has(key))) return;
    if (this === localStorage && receiptOrderKeys.has(key)) {
      try { value = JSON.stringify(compactReceiptRecords(key, JSON.parse(value))); } catch { /* Keep invalid JSON for the existing error path. */ }
    }
    if (this === localStorage && tabBusinessKeys.has(key)) {
      if (activeUserId) tabBusinessData.set(key, String(value));
      else if (guestShoppingKeys.has(key)) guestShoppingData.set(key, String(value));
    } else originalSetItem.call(this, key, value);
    if (this === localStorage && key === marketplaceSupplierContactsKey) {
      if (['manager', 'director', 'admin'].includes(activeRole)) {
        let contacts = value;
        try { contacts = JSON.parse(value); } catch { /* Invalid JSON is rejected by Supabase. */ }
        void writeMarketplaceSupplierContacts(contacts).catch((error) => console.warn('Could not sync marketplace store contacts to Supabase:', error));
      }
      return;
    }
    if (this !== localStorage || key === marketplaceOrdersKey || !allSyncedKeys.has(key)) return;
    let parsed = value;
    try { parsed = JSON.parse(value); } catch { /* Keep ordinary string values as strings. */ }
    const current = captureCloudSession();
    void writeRemote(key, parsed).catch((error) => {
      if (current()) reportSyncIssue('A save could not be confirmed. ' + syncFailureMessage(error));
    });
  };
  Storage.prototype.removeItem = function(key) {
    if (this === localStorage && versionedSharedKeys.has(key)) return;
    if (this === localStorage && tabBusinessKeys.has(key)) {
      const cache = !activeUserId && guestShoppingKeys.has(key) ? guestShoppingData : tabBusinessData;
      cache.delete(key);
    }
    else originalRemoveItem.call(this, key);
    if (this === localStorage && key === marketplaceSupplierContactsKey && ['manager', 'director', 'admin'].includes(activeRole) && activeUserId) {
      void writeMarketplaceSupplierContacts([]).catch((error) => console.warn('Could not clear marketplace store contacts in Supabase:', error));
      return;
    }
    if (this !== localStorage || key === marketplaceOrdersKey || key === 'furgo-demo-marketplace-products' || !allSyncedKeys.has(key) || !activeUserId || applyingRemoteData) return;
    if (dedicatedOperationKeys.has(key)) return;
    if (!legacyReady) { reportSyncIssue('Cloud data has not been confirmed. Reload before removing records.'); return; }
    const scope = getScope(key);
    const ownerId = activeUserId;
    const current = captureCloudSession();
    void supabase.from('app_data').delete().eq('record_id', rowId(scope, key, ownerId)).select('record_id')
      .then(({ data, error }) => {
        if (current() && (error || !data?.length)) reportSyncIssue('The removal could not be confirmed. ' + syncFailureMessage(error));
      }).catch((error) => { if (current()) reportSyncIssue(syncFailureMessage(error)); });
  };
}

async function writeMarketplaceSupplierContacts(contacts) {
  if (!activeUserId || !['manager', 'director', 'admin'].includes(activeRole)) return;
  const normalized = Array.isArray(contacts) ? contacts : [];
  const { error } = await supabase.from('marketplace_supplier_contacts').upsert({
    id: true,
    contacts: normalized,
    updated_by: activeUserId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function loadMarketplaceSupplierContacts(role) {
  if (!['executive', 'manager', 'director', 'admin'].includes(role)) return;
  const current = captureCloudSession();
  const { data, error } = await supabase.from('marketplace_supplier_contacts').select('contacts').eq('id', true).maybeSingle();
  if (error) throw error;
  if (current()) setCacheItem(marketplaceSupplierContactsKey, JSON.stringify(data?.contacts || []));
}

export async function refreshGroomingBookings(userId, role) {
  if (activeUserId !== userId) return;
  const current = captureCloudSession();
  let query = supabase.from('grooming_bookings').select('*').order('created_at', { ascending: false });
  if (!elevatedOrderRoles.has(role) && role !== 'driver') query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  if (!current()) return;
  cacheSyncedRecords('furgo-demo-grooming-bookings', (data || []).map((row) => compactReceiptOrder({
    ...(row.details || {}), id: row.id, userId: row.user_id, reference: row.reference,
    outlet: row.outlet, date: row.appointment_date, time: row.appointment_time,
    status: row.status, createdAt: row.created_at,
  })), { notify: false });
}

function readLegacyRows() {
  return supabase.from('app_data').select('record_id,scope,storage_key,owner_id,payload')
    .not('record_id', 'in', '(' + [...sharedRecordIds, rowId('shared', marketplaceProductsKey, null)].join(',') + ')');
}

function applyLegacyRows(rows, userId, role) {
  for (const key of allSyncedKeys) {
    if (sharedKeys.has(key) || dedicatedOperationKeys.has(key) || key === 'furgo-demo-daycare-orders') continue;
    const scope = getScope(key);
    const owned = rows.filter((row) => row.scope === scope && row.storage_key === key
      && row.owner_id && row.record_id === rowId(scope, key, row.owner_id));
    if (scope === 'operation' && elevatedOrderRoles.has(role)) {
      const merged = operationObjectKeys.has(key)
        ? Object.assign({}, ...owned.map((row) => Object.fromEntries(Object.entries(row.payload || {}).map(([id, value]) => [id, { ...value, _cloudOwnerId: row.owner_id }]))))
        : owned.flatMap((row) => Array.isArray(row.payload)
          ? compactReceiptRecords(key, row.payload).map((value) => ({ ...value, userId: row.owner_id, _cloudOwnerId: row.owner_id })) : []);
      setCacheItem(key, JSON.stringify(merged));
    } else if (!fullAdminRoles.has(role) || personalCustomerKeys.has(key)) {
      const own = owned.find((row) => row.owner_id === userId);
      if (own) setCacheItem(key, JSON.stringify(own.payload));
      else tabBusinessData.delete(key);
    }
  }
}

// Load cloud-owned values before rendering and reconcile with reads only.
export async function loadCloudAppData(userId, role) {
  stopCloudAppData();
  const session = sharedSession;
  marketplaceCacheOwner = userId;
  if (!originalSetItem) originalSetItem = Storage.prototype.setItem;
  if (!originalRemoveItem) originalRemoveItem = Storage.prototype.removeItem;
  activeUserId = userId;
  activeRole = role;
  dedicatedTablesReady = false;
  const current = captureCloudSession();
  installStorageMirror(userId, role);
  const refresh = async (groups, valid) => {
    const all = groups.includes('all');
    const jobs = [];
    if (all || groups.includes('legacy')) jobs.push((async () => {
      const revision = legacyWriteRevision;
      const result = await readLegacyRows();
      if (!valid()) return;
      legacyReady = !result.error;
      if (result.error) throw Object.assign(new Error(result.error.message), result.error, { status: result.status });
      if (revision === legacyWriteRevision) applyLegacyRows(result.data || [], userId, role);
    })());
    if (all || groups.includes('catalog')) jobs.push(refreshMarketplaceCatalogFromDatabase({ notify: false, expectedOwner: userId }));
    const orderIds = groups.filter((group) => group.startsWith('marketplace:')).map((group) => group.slice(12));
    const fullOrders = all || groups.includes('marketplace');
    if (fullOrders || orderIds.length) jobs.push(reconcileMarketplaceOrders(userId, role, fullOrders ? null : orderIds).then((applied) => {
      if (valid() && !applied) queue.invalidate(...(fullOrders ? ['marketplace'] : orderIds.map((id) => `marketplace:${id}`)));
    }));
    if (all || groups.includes('bookings')) jobs.push(loadDedicatedBookings(userId, role).then(() => {
      if (valid()) dedicatedTablesReady = true;
    }));
    if (all || groups.includes('grooming')) jobs.push(refreshGroomingBookings(userId, role));
    if (all || groups.includes('contacts')) jobs.push(loadMarketplaceSupplierContacts(role));
    const results = await Promise.allSettled(jobs);
    if (!valid()) return;
    if (!groups.includes('initial')) window.dispatchEvent(new Event('furgo-cloud-reconciled'));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    reportSyncIssue('');
  };
  const onError = (error) => reportSyncIssue(syncFailureMessage(error));
  const queue = createRecoveryQueue({ isCurrent: current, refresh, onError });
  const wake = () => queue.invalidate('all');
  window.addEventListener('online', wake);
  stopMainRecovery = () => { queue.stop(); window.removeEventListener('online', wake); };
  const [initial, settings] = await Promise.allSettled([refresh(['all', 'initial'], current), selectSharedSettings()]);
  if (!current()) return;
  if (initial.status === 'rejected') onError(initial.reason);
  if (settings.status === 'fulfilled' && !settings.value.error) loadSharedSettings(settings.value.data || []);
  else onError(settings.reason || settings.value?.error);

  const tables = {
    app_data: 'legacy', grooming_bookings: 'grooming', marketplace_orders: 'marketplace',
    marketplace_order_items: 'marketplace', marketplace_item_returns: 'marketplace',
    pet_hotel_bookings: 'bookings', pet_daycare_bookings: 'bookings', marketplace_supplier_contacts: 'contacts',
  };
  realtimeChannel = supabase.channel(`app-data:${session}`);
  for (const [table, group] of Object.entries(tables)) {
    if (group === 'contacts' && !elevatedOrderRoles.has(role)) continue;
    realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table }, (change) => {
      if (!current()) return;
      if (group === 'marketplace') {
        const id = marketplaceOrderChangeId(table, change);
        queue.invalidate(id ? `marketplace:${id}` : 'marketplace');
        return;
      }
      if (table !== 'app_data') { queue.invalidate(group); return; }
      const recordId = change.new?.record_id || change.old?.record_id;
      if (sharedRecordIds.includes(recordId)) scheduleSharedSettingsRefresh(session);
      else if (recordId === rowId('shared', marketplaceProductsKey, null)) queue.invalidate('catalog');
      else queue.invalidate('legacy');
    });
  }
  realtimeChannel.subscribe((status) => {
    queue.status(status, () => reportSyncIssue('Live updates are disconnected. Reconnect or reload to refresh.'));
    if (current() && status === 'SUBSCRIBED') scheduleSharedSettingsRefresh(session);
  });
  void preserveBrowserMarketplaceHistory();
  if (role === 'customer') {
    const { data, error } = await supabase.rpc('get_marketplace_legacy_history');
    if (current() && !error && Array.isArray(data)) marketplaceLegacyHistory = data;
  }
  return { recordsLoaded: tabBusinessData.size };
}

// Bind the version to the rendered editor. Reading the latest version at
// submit time would let a stale form overwrite another Director's changes.
export function createSharedAppDataSaver(key) {
  const session = sharedSession;
  const owner = activeUserId;
  let expectedVersion = sharedSettings.get(key)?.version;
  let saving = false;
  const assertReady = () => {
    if (key === marketplaceProductsKey) throw new Error('Marketplace products must be saved using the catalog controls.');
    if (!versionedSharedKeys.has(key)) throw new Error('This is not a shared setting.');
    if (!owner || session !== sharedSession || activeUserId !== owner) throw new Error('The sign-in session changed. Reload before saving.');
    if (!fullAdminRoles.has(activeRole)) throw new Error('Director access is required to save global settings.');
    if (saving) throw new Error('A save is already in progress. Wait for its result.');
    if (expectedVersion === undefined) throw new Error('Online settings are unavailable. Reload when connected before saving.');

    if (sharedSettings.get(key)?.version !== expectedVersion) {
      throw new Error('These settings changed while you were editing. Reload to review the latest version, then reapply your changes.');
    }
  };
  const save = async (value, { notify = false } = {}) => {
    assertReady();
    const submittedVersion = expectedVersion;
    let result;
    saving = true;
    try {
      result = await supabase.rpc('save_versioned_shared_app_data', {
        p_actor: owner,
        p_key: key,
        p_expected_version: submittedVersion,
        p_payload: value,
      });
    } catch {
      // The server may have committed before the connection was lost.
    } finally {
      saving = false;
    }
    if (session !== sharedSession || activeUserId !== owner) throw new Error('The sign-in session changed. Reload to verify the save.');
    if (result?.error?.code === 'PT409') throw new Error('These settings changed while you were editing. Reload to review the latest version, then reapply your changes.');
    if (result?.error?.code === '42501') throw new Error('Director access is required to save global settings.');
    if (result?.error && ['22023', 'PGRST202'].includes(result.error.code)) {
      throw new Error('The settings could not be saved. Check the settings and reload before trying again.');
    }
    if (!uuidPattern.test(result?.data)) {
      expectedVersion = undefined;
      throw new Error('The save could not be confirmed. Reload when connected and check the saved settings before trying again.');
    }

    expectedVersion = result.data;
    sharedWrites += 1;
    const currentVersion = sharedSettings.get(key)?.version;
    if (currentVersion === submittedVersion || currentVersion === result.data) {
      sharedSettings.set(key, { version: result.data, serialized: JSON.stringify(value) });
      if (notify) window.dispatchEvent(new StorageEvent('storage', { key }));
    }
  };
  return Object.assign(save, { assertReady });
}

if (globalThis.Storage) installStorageMirror('', 'customer');
