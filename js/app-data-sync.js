// Section: Supabase application data sync
// Function: Keep prototype customer state and Admin-managed catalogs in shared Supabase storage.
import { supabase } from './supabase.js';

const sharedKeys = new Set([
  'furgo-demo-hotel-settings',
  'furgo-demo-daycare-settings',
  'furgo-demo-pet-taxi-settings',
  'furgo-demo-service-banners',
  'furgo-demo-marketplace-products',
  'furgo-demo-marketplace-offers',
  'furgo-demo-promotions',
  'furgo-demo-help-center-details',
]);

const customerKeys = new Set([
  'furgo-demo-addresses',
  'furgo-demo-payment-methods',
  'furgo-demo-marketplace-cart',
  'furgo-demo-marketplace-favorites',
  'furgo-demo-credit-balance',
  'furgo-demo-credit-transactions',
  'furgo-demo-daycare-passes',
]);

const operationKeys = new Set([
  'furgo-demo-marketplace-orders',
  'furgo-demo-hotel-bookings',
  'furgo-demo-daycare-bookings',
  'furgo-demo-daycare-orders',
  'furgo-demo-check-in-tokens',
  'furgo-demo-driver-locations',
]);
const operationObjectKeys = new Set(['furgo-demo-check-in-tokens', 'furgo-demo-driver-locations']);
const dedicatedOperationKeys = new Set([
  'furgo-demo-marketplace-orders',
  'furgo-demo-hotel-bookings',
  'furgo-demo-daycare-bookings',
]);
const elevatedOrderRoles = new Set(['admin', 'staff', 'executive', 'manager', 'director']);
const fullAdminRoles = new Set(['admin', 'director']);
const managerSharedSettingsKeys = new Set([
  'furgo-demo-hotel-settings',
  'furgo-demo-daycare-settings',
  'furgo-demo-pet-taxi-settings',
  'furgo-demo-service-banners',
  'furgo-demo-marketplace-products',
  'furgo-demo-marketplace-offers',
  'furgo-demo-promotions',
]);
const executiveMarketplaceKeys = new Set(['furgo-demo-marketplace-products']);
const updateOnlyOrderRoles = new Set(['staff', 'executive', 'manager']);
const staffLegacyOrderKeys = new Set(['furgo-demo-marketplace-orders', 'furgo-demo-hotel-bookings', 'furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders']);

const allSyncedKeys = new Set([...sharedKeys, ...customerKeys, ...operationKeys]);
let originalSetItem;
let originalRemoveItem;
let activeUserId = '';
let activeRole = 'customer';
let applyingRemoteData = false;
let realtimeChannel;
let dedicatedTablesReady = false;

function rowId(scope, key, ownerId) {
  return `${scope}:${key}:${ownerId || 'shared'}`;
}

function getScope(key) {
  if (sharedKeys.has(key)) return 'shared';
  if (customerKeys.has(key)) return 'customer';
  if (operationKeys.has(key)) return 'operation';
  return '';
}

function canManageSharedKey(role, key) {
  return fullAdminRoles.has(role)
    || (role === 'manager' && managerSharedSettingsKeys.has(key))
    || (role === 'executive' && executiveMarketplaceKeys.has(key));
}

function readLocal(key) {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function writeRemote(key, value) {
  const scope = getScope(key);
  if (!scope || !activeUserId) return;
  if (scope === 'shared' && !canManageSharedKey(activeRole, key)) return;
  if (scope !== 'shared' && fullAdminRoles.has(activeRole) && scope === 'customer') return;

  if (dedicatedTablesReady && dedicatedOperationKeys.has(key)) {
    await writeDedicatedOperations(key, value);
    return;
  }

  const records = scope === 'operation' && elevatedOrderRoles.has(activeRole) && Array.isArray(value)
    ? groupOperationsByOwner(value)
    : scope === 'operation' && elevatedOrderRoles.has(activeRole) && operationObjectKeys.has(key) && value && typeof value === 'object'
      ? groupOperationObjectByOwner(value)
      : [{ ownerId: scope === 'shared' ? null : activeUserId, value }];
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
  }
}

function safeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;
}

async function writeDedicatedRecord(key, record, ownerId) {
  if (!record || !ownerId || !record.id) return;
  const id = String(record.id);
  const createdAt = safeTimestamp(record.createdAt);
  if (key === 'furgo-demo-marketplace-orders') {
    const { _cloudOwnerId, userId, items = [], ...details } = record;
    const payload = {
      id,
      user_id: ownerId,
      reference: String(record.reference || id),
      status: String(record.status || 'New'),
      payment_status: String(record.paymentStatus || 'Pending'),
      total: Number(record.total) || 0,
      outlet: String(record.outlet || record.fulfillmentOutlet || ''),
      details,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    };
    let writeResult;
    if (activeRole === 'customer') {
      const { data: existing, error: lookupError } = await supabase.from('marketplace_orders').select('id').eq('id', id).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return; // Marketplace orders become immutable to customers after checkout.
      writeResult = await supabase.from('marketplace_orders').insert(payload);
    } else if (updateOnlyOrderRoles.has(activeRole)) {
      writeResult = await supabase.from('marketplace_orders').update(payload).eq('id', id);
    } else {
      writeResult = await supabase.from('marketplace_orders').upsert(payload, { onConflict: 'id' });
    }
    const { error } = writeResult;
    if (error) throw error;
    if (updateOnlyOrderRoles.has(activeRole)) return;
    const { error: removeItemsError } = await supabase.from('marketplace_order_items').delete().eq('order_id', id);
    if (removeItemsError) throw removeItemsError;
    if (Array.isArray(items) && items.length) {
      const { error: itemError } = await supabase.from('marketplace_order_items').insert(items.map((item, index) => ({
        order_id: id,
        line_number: index + 1,
        item,
      })));
      if (itemError) throw itemError;
    }
    return;
  }

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
    const { error } = updateOnlyOrderRoles.has(activeRole)
      ? await supabase.from('pet_hotel_bookings').update(payload).eq('id', id)
      : await supabase.from('pet_hotel_bookings').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
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
  const { error } = updateOnlyOrderRoles.has(activeRole)
    ? await supabase.from('pet_daycare_bookings').update(payload).eq('id', id)
    : await supabase.from('pet_daycare_bookings').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
}

async function writeDedicatedOperations(key, value) {
  const records = elevatedOrderRoles.has(activeRole) && Array.isArray(value)
    ? groupOperationsByOwner(value)
    : [{ ownerId: activeUserId, value: Array.isArray(value) ? value : [] }];
  for (const group of records) {
    for (const record of group.value) await writeDedicatedRecord(key, record, group.ownerId);
  }
}

// Saves a service booking to Supabase before updating the browser cache, matching Grooming's submit flow.
export async function saveDedicatedBooking(key, booking, records) {
  if (!dedicatedOperationKeys.has(key) || !Array.isArray(records)) throw new Error('This booking type cannot be synchronized.');
  if (activeUserId) {
    if (dedicatedTablesReady) await writeDedicatedRecord(key, booking, booking.userId || activeUserId);
    else await writeRemote(key, records);
  }
  const serialized = JSON.stringify(records);
  applyingRemoteData = true;
  try {
    if (originalSetItem) originalSetItem.call(localStorage, key, serialized);
    else localStorage.setItem(key, serialized);
  } finally {
    applyingRemoteData = false;
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

// Writes order status/receipt changes to the shared order source before refreshing this browser's cache.
export async function saveOrderRecords(key, order, records) {
  if (!key || !order?.id || !Array.isArray(records)) throw new Error('This order update cannot be synchronized.');
  if (activeUserId) {
    if (key === 'furgo-demo-grooming-bookings') {
      const { error } = await supabase.from('grooming_bookings').update({ status: order.status, details: order }).eq('id', order.id);
      if (error) throw error;
    } else {
      await writeRemote(key, records);
    }
  }
  const serialized = JSON.stringify(records);
  applyingRemoteData = true;
  try {
    if (originalSetItem) originalSetItem.call(localStorage, key, serialized);
    else localStorage.setItem(key, serialized);
  } finally {
    applyingRemoteData = false;
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

// Updates a browser cache from a trusted RPC/realtime response without mirroring it back as a new client write.
export function cacheSyncedRecords(key, records) {
  if (!key || !Array.isArray(records)) return;
  if (!originalSetItem) originalSetItem = Storage.prototype.setItem;
  applyingRemoteData = true;
  try { originalSetItem.call(localStorage, key, JSON.stringify(records)); }
  finally { applyingRemoteData = false; }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

function dedicatedRecordFromRow(key, row, items = []) {
  const record = { ...(row.details || {}), id: row.id, userId: row.user_id, reference: row.reference, status: row.status, createdAt: row.created_at };
  if (key === 'furgo-demo-marketplace-orders') {
    record.paymentStatus = row.payment_status;
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
  return record;
}

async function loadDedicatedOperations(userId, role) {
  const localValues = new Map([...dedicatedOperationKeys].map((key) => [key, readLocal(key)]));
  // Driver SELECT policies expose only Pet Taxi bookings; let Postgres apply that filter.
  const ownQuery = (query) => elevatedOrderRoles.has(role) || role === 'driver' ? query : query.eq('user_id', userId);
  const [marketResult, hotelResult, daycareResult] = await Promise.all([
    ownQuery(supabase.from('marketplace_orders').select('*').order('created_at', { ascending: false })),
    ownQuery(supabase.from('pet_hotel_bookings').select('*').order('created_at', { ascending: false })),
    ownQuery(supabase.from('pet_daycare_bookings').select('*').order('created_at', { ascending: false })),
  ]);
  for (const result of [marketResult, hotelResult, daycareResult]) if (result.error) throw result.error;
  const orderIds = (marketResult.data || []).map((order) => order.id);
  let itemRows = [];
  if (orderIds.length) {
    const { data, error } = await supabase.from('marketplace_order_items').select('order_id,line_number,item').in('order_id', orderIds).order('line_number');
    if (error) throw error;
    itemRows = data || [];
  }
  const itemsByOrder = new Map();
  for (const row of itemRows) {
    if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
    itemsByOrder.get(row.order_id).push({ ...row.item, lineNumber: Number(row.line_number) });
  }
  let returnRows = [];
  if (orderIds.length) {
    const { data, error } = await supabase.from('marketplace_item_returns').select('*').in('order_id', orderIds);
    // Keep existing portal data usable until the return-workflow migration is applied.
    if (!error) returnRows = data || [];
    else if (!['42P01', 'PGRST205'].includes(error.code)) throw error;
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
  const values = new Map([
    ['furgo-demo-marketplace-orders', (marketResult.data || []).map((row) => dedicatedRecordFromRow('furgo-demo-marketplace-orders', row, itemsByOrder.get(row.id) || []))],
    ['furgo-demo-hotel-bookings', (hotelResult.data || []).map((row) => dedicatedRecordFromRow('furgo-demo-hotel-bookings', row))],
    ['furgo-demo-daycare-bookings', (daycareResult.data || []).map((row) => dedicatedRecordFromRow('furgo-demo-daycare-bookings', row))],
  ]);
  if (role === 'customer') {
    let profile = {};
    try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
    const email = String(profile.email || '').trim().toLowerCase();
    const phone = String(profile.phone || '').replace(/\D/g, '');
    const belongsToCustomer = (record) => {
      const recordEmail = String(record.customerEmail || '').trim().toLowerCase();
      const recordPhone = String(record.customerPhone || '').replace(/\D/g, '');
      return Boolean((email && recordEmail === email) || (phone && recordPhone === phone));
    };
    for (const [key, records] of values) {
      if (records.length) continue;
      const localRecords = Array.isArray(localValues.get(key)) ? localValues.get(key).filter(belongsToCustomer) : [];
      for (const record of localRecords) await writeDedicatedRecord(key, record, userId);
      if (localRecords.length) values.set(key, localRecords.map((record) => ({ ...record, userId })));
    }
  }
  for (const [key, records] of values) {
    originalSetItem.call(localStorage, key, JSON.stringify(records));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }
  for (const key of ['furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders']) {
    originalSetItem.call(localStorage, key, '[]');
  }
  return values;
}

function applyDedicatedRow(key, row, items = [], removed = false) {
  if (!row?.id) return;
  const current = readLocal(key);
  const records = (Array.isArray(current) ? current : []).filter((item) => String(item.id) !== String(row.id));
  if (!removed) records.push(dedicatedRecordFromRow(key, row, items));
  applyingRemoteData = true;
  originalSetItem.call(localStorage, key, JSON.stringify(records));
  applyingRemoteData = false;
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

async function refreshDedicatedMarketplaceOrder(orderId, removed = false) {
  const { data: order, error } = await supabase.from('marketplace_orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!order) {
    applyDedicatedRow('furgo-demo-marketplace-orders', { id: orderId }, [], true);
    return;
  }
  const { data: items, error: itemsError } = await supabase.from('marketplace_order_items').select('line_number,item').eq('order_id', orderId).order('line_number');
  if (itemsError) throw itemsError;
  const { data: returns, error: returnsError } = await supabase.from('marketplace_item_returns').select('*').eq('order_id', orderId);
  if (returnsError && !['42P01', 'PGRST205'].includes(returnsError.code)) throw returnsError;
  const returnByLine = new Map((returns || []).map((itemReturn) => [Number(itemReturn.line_number), {
    id: itemReturn.id, status: itemReturn.status, reason: itemReturn.reason, photoPath: itemReturn.photo_path,
    paidAmount: Number(itemReturn.paid_amount) || 0, shippingRefund: Number(itemReturn.shipping_refund) || 0,
    refundAmount: Number(itemReturn.refund_amount) || 0, supplierResponse: itemReturn.supplier_response || '',
    decisionReason: itemReturn.decision_reason || '', requestedAt: itemReturn.requested_at, refundedAt: itemReturn.refunded_at,
  }]));
  applyDedicatedRow('furgo-demo-marketplace-orders', order, (items || []).map((row) => ({ ...row.item, lineNumber: Number(row.line_number), returnRequest: returnByLine.get(Number(row.line_number)) || null })), removed);
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
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this !== localStorage || !allSyncedKeys.has(key)) return;
    let parsed = value;
    try { parsed = JSON.parse(value); } catch { /* Keep ordinary string values as strings. */ }
    void writeRemote(key, parsed).catch((error) => console.warn(`Could not sync ${key} to Supabase:`, error));
  };
  Storage.prototype.removeItem = function(key) {
    originalRemoveItem.call(this, key);
    if (this !== localStorage || !allSyncedKeys.has(key) || !activeUserId || applyingRemoteData) return;
    if (dedicatedTablesReady && dedicatedOperationKeys.has(key)) return;
    const scope = getScope(key);
    if (scope === 'shared' && !canManageSharedKey(activeRole, key)) return;
    const ownerId = scope === 'shared' ? null : activeUserId;
    void supabase.from('app_data').delete().eq('record_id', rowId(scope, key, ownerId))
      .then(({ error }) => { if (error) console.warn(`Could not remove ${key} from Supabase:`, error); });
  };
}

function applyRealtimeRow(row, removed = false) {
  const key = row?.storage_key;
  if (!allSyncedKeys.has(key) || dedicatedTablesReady && (dedicatedOperationKeys.has(key) || key === 'furgo-demo-daycare-orders')) return;
  const scope = row.scope || getScope(key);
  if (scope === 'shared' && !fullAdminRoles.has(activeRole)) {
    applyingRemoteData = true;
    if (removed) originalRemoveItem.call(localStorage, key);
    else originalSetItem.call(localStorage, key, JSON.stringify(row.payload));
    applyingRemoteData = false;
    window.dispatchEvent(new StorageEvent('storage', { key }));
    return;
  }
  if (row.owner_id === activeUserId && !fullAdminRoles.has(activeRole)) {
    applyingRemoteData = true;
    if (removed) originalRemoveItem.call(localStorage, key);
    else originalSetItem.call(localStorage, key, JSON.stringify(row.payload));
    applyingRemoteData = false;
    window.dispatchEvent(new StorageEvent('storage', { key }));
    return;
  }
  if (!elevatedOrderRoles.has(activeRole) || scope !== 'operation') return;

  if (operationObjectKeys.has(key)) {
    const current = readLocal(key) || {};
    for (const [entryKey, item] of Object.entries(current)) if (item?._cloudOwnerId === row.owner_id) delete current[entryKey];
    if (!removed) for (const [entryKey, item] of Object.entries(row.payload || {})) current[entryKey] = { ...item, _cloudOwnerId: row.owner_id };
    applyingRemoteData = true;
    originalSetItem.call(localStorage, key, JSON.stringify(current));
    applyingRemoteData = false;
  } else {
    const current = (readLocal(key) || []).filter((item) => item?._cloudOwnerId !== row.owner_id);
    if (!removed && Array.isArray(row.payload)) current.push(...row.payload.map((item) => ({ ...item, userId: row.owner_id, _cloudOwnerId: row.owner_id })));
    applyingRemoteData = true;
    originalSetItem.call(localStorage, key, JSON.stringify(current));
    applyingRemoteData = false;
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

function applyGroomingRealtimeRow(row, removed = false) {
  if (!row?.id) return;
  let bookings = readLocal('furgo-demo-grooming-bookings');
  if (!Array.isArray(bookings)) bookings = [];
  bookings = bookings.filter((item) => String(item.id) !== String(row.id));
  if (!removed) bookings.push({
    ...(row.details || {}), id: row.id, userId: row.user_id, reference: row.reference,
    outlet: row.outlet, date: row.appointment_date, time: row.appointment_time,
    status: row.status, createdAt: row.created_at,
  });
  applyingRemoteData = true;
  originalSetItem.call(localStorage, 'furgo-demo-grooming-bookings', JSON.stringify(bookings));
  applyingRemoteData = false;
  window.dispatchEvent(new StorageEvent('storage', { key: 'furgo-demo-grooming-bookings' }));
}

// Loads cloud-owned values before the portal renders and seeds missing rows from this browser's saved prototype data.
export async function loadCloudAppData(userId, role) {
  if (!originalSetItem) originalSetItem = Storage.prototype.setItem;
  if (!originalRemoveItem) originalRemoveItem = Storage.prototype.removeItem;
  activeUserId = userId;
  activeRole = role;
  dedicatedTablesReady = false;
  const { data, error } = await supabase.from('app_data').select('record_id,scope,storage_key,owner_id,payload');
  if (error) throw error;
  const rows = data || [];
  const byRecordId = new Map(rows.map((row) => [row.record_id, row]));
  let dedicatedDataReady = false;
  applyingRemoteData = true;
  try {
    try {
      await loadDedicatedOperations(userId, role);
      dedicatedDataReady = true;
      dedicatedTablesReady = true;
    } catch (dedicatedError) {
      console.warn('Dedicated order tables are not ready yet; loading legacy order data:', dedicatedError);
    }
    for (const key of allSyncedKeys) {
      if (role === 'executive' && !staffLegacyOrderKeys.has(key) && key !== 'furgo-demo-check-in-tokens' && !executiveMarketplaceKeys.has(key)) continue;
      if (dedicatedDataReady && (dedicatedOperationKeys.has(key) || key === 'furgo-demo-daycare-orders')) continue;
      const scope = getScope(key);
      if (scope === 'shared') {
        if (role === 'manager' && !managerSharedSettingsKeys.has(key)) continue;
        const shared = byRecordId.get(rowId('shared', key, null));
        if (shared) originalSetItem.call(localStorage, key, JSON.stringify(shared.payload));
        else if (canManageSharedKey(role, key)) await writeRemote(key, readLocal(key));
        continue;
      }

      const ownedRows = rows.filter((row) => row.storage_key === key && row.scope === scope && row.owner_id);
      if (elevatedOrderRoles.has(role) && scope === 'operation') {
        const merged = operationObjectKeys.has(key)
          ? Object.assign({}, ...ownedRows.map((row) => Object.fromEntries(Object.entries(row.payload || {}).map(([entryKey, entryValue]) => [entryKey, { ...entryValue, _cloudOwnerId: row.owner_id }]))))
          : ownedRows.flatMap((row) => Array.isArray(row.payload)
            ? row.payload.map((item) => ({ ...item, userId: row.owner_id, _cloudOwnerId: row.owner_id }))
            : []);
        originalSetItem.call(localStorage, key, JSON.stringify(merged));
      } else if (!fullAdminRoles.has(role)) {
        const own = byRecordId.get(rowId(scope, key, userId));
        if (own) originalSetItem.call(localStorage, key, JSON.stringify(own.payload));
        else {
          const localValue = readLocal(key);
          if (localValue != null) await writeRemote(key, localValue);
        }
      }
    }
  } finally {
    applyingRemoteData = false;
  }
  installStorageMirror(userId, role);
  if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`app-data:${userId}:${role}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_data' }, (change) => {
      const row = change.new?.record_id ? change.new : change.old;
      if (row) applyRealtimeRow(row, change.eventType === 'DELETE');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grooming_bookings' }, (change) => {
      const row = change.new?.id ? change.new : change.old;
      if (row) applyGroomingRealtimeRow(row, change.eventType === 'DELETE');
    });
  if (dedicatedDataReady) {
    realtimeChannel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_orders' }, (change) => {
        const row = change.new?.id ? change.new : change.old;
        if (row) void refreshDedicatedMarketplaceOrder(row.id, change.eventType === 'DELETE').catch((syncError) => console.warn('Could not refresh Marketplace order:', syncError));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_order_items' }, (change) => {
        const row = change.new?.order_id ? change.new : change.old;
        if (row?.order_id) void refreshDedicatedMarketplaceOrder(row.order_id).catch((syncError) => console.warn('Could not refresh Marketplace order items:', syncError));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_item_returns' }, (change) => {
        const row = change.new?.order_id ? change.new : change.old;
        if (row?.order_id) void refreshDedicatedMarketplaceOrder(row.order_id).then(() => {
          document.querySelector('[data-marketplace-return-cases]')?.dispatchEvent(new Event('marketplace-return-change'));
          document.querySelector('[data-marketplace-return-notification]')?.dispatchEvent(new Event('marketplace-return-change'));
        }).catch((syncError) => console.warn('Could not refresh Marketplace return status:', syncError));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pet_hotel_bookings' }, (change) => {
        const row = change.new?.id ? change.new : change.old;
        if (row) applyDedicatedRow('furgo-demo-hotel-bookings', row, [], change.eventType === 'DELETE');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pet_daycare_bookings' }, (change) => {
        const row = change.new?.id ? change.new : change.old;
        if (row) applyDedicatedRow('furgo-demo-daycare-bookings', row, [], change.eventType === 'DELETE');
      });
  }
  realtimeChannel.subscribe();
  return { recordsLoaded: rows.length };
}

// Explicit Save actions need to await the shared Supabase write. The generic
// localStorage mirror is intentionally fire-and-forget for prototype settings.
export async function saveSharedAppData(key, value) {
  if (!sharedKeys.has(key)) throw new Error('This is not a shared setting.');
  if (!activeUserId) throw new Error('Please sign in again before saving.');
  if (!canManageSharedKey(activeRole, key)) throw new Error('Manager or Director access is required to save these settings.');
  await writeRemote(key, value);
  if (!originalSetItem) originalSetItem = Storage.prototype.setItem;
  applyingRemoteData = true;
  try {
    originalSetItem.call(localStorage, key, JSON.stringify(value));
  } finally {
    applyingRemoteData = false;
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}
