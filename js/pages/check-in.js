import { bottomNavigation, escapeHTML } from '../shared.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { supabase } from '../supabase.js';
import { cacheSyncedRecords } from '../app-data-sync.js';
import qrcode from '../vendor/qrcode-generator.mjs';

export const checkInTokensKey = 'furgo-demo-check-in-tokens';
const daycareKeys = ['furgo-demo-daycare-bookings', 'furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders'];

function readOrders(key, load = null) {
  if (load) return load();
  try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function getBookingSources() {
  return [
    { service: 'grooming', label: 'Pet Grooming', key: groomingBookingsKey, load: loadGroomingBookings },
    { service: 'hotel', label: 'Pet Hotel', key: hotelBookingsKey, load: loadHotelBookings },
    ...daycareKeys.map((key) => ({ service: 'daycare', label: 'Pet Daycare', key, load: null })),
  ];
}

function readTokenMap() {
  try { const tokens = JSON.parse(localStorage.getItem(checkInTokensKey) || '{}'); return tokens && typeof tokens === 'object' ? tokens : {}; } catch { return {}; }
}

function writeTokenMap(tokens) {
  localStorage.setItem(checkInTokensKey, JSON.stringify(tokens));
}

function revokeOrderTokens(orderKey, orderId, reason = 'order_completed') {
  const tokens = readTokenMap();
  const revokedAt = new Date().toISOString();
  let changed = false;
  for (const record of Object.values(tokens)) {
    if (record.orderKey !== orderKey || String(record.orderId) !== String(orderId) || record.revokedAt) continue;
    record.revokedAt = revokedAt;
    record.revokedReason = reason;
    changed = true;
  }
  if (changed) writeTokenMap(tokens);
}

// Refresh customer-generated check-in codes from Supabase before staff validate them.
// The customer and admin portals often run in separate browsers, so localStorage alone
// cannot be the source of truth for a code created on the customer's device.
export async function refreshCheckInTokens() {
  const { data, error } = await supabase.from('app_data')
    .select('owner_id,payload')
    .eq('scope', 'operation')
    .eq('storage_key', checkInTokensKey);
  if (error) throw error;

  const localTokens = readTokenMap();
  const merged = { ...localTokens };
  for (const row of data || []) {
    for (const [token, record] of Object.entries(row.payload || {})) {
      if (!record || typeof record !== 'object') continue;
      const local = merged[token];
      merged[token] = {
        ...record,
        // Preserve a locally completed scan if its write is still in flight.
        ...(local?.usedAt && !record.usedAt ? { usedAt: local.usedAt } : {}),
        ...(local?.revokedAt && !record.revokedAt ? { revokedAt: local.revokedAt, revokedReason: local.revokedReason } : {}),
        _cloudOwnerId: row.owner_id,
      };
    }
  }
  writeTokenMap(merged);
  return merged;
}

function makeToken() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return [...bytes].map((byte) => alphabet[byte & 31]).join('');
}

// Makes a short, order-specific code for the requested visit stage.
export function ensureCheckInToken(orderKey, orderId, stage) {
  const tokens = readTokenMap();
  // Taxi bookings use one reusable QR for customer pickup and home delivery.
  const tokenStage = ['check-in', 'check-out'].includes(stage) ? 'check-in' : stage;
  const existing = Object.values(tokens).find((record) => record.orderKey === orderKey && String(record.orderId) === String(orderId) && record.stage === tokenStage);
  if (existing) return existing.token;
  let token = makeToken();
  while (tokens[token]) token = makeToken();
  tokens[token] = { token, orderKey, orderId: String(orderId), stage: tokenStage, createdAt: new Date().toISOString() };
  writeTokenMap(tokens);
  return token;
}

function checkInScanUrl(token) {
  const current = new URL(window.location.href);
  const base = current.hostname === 'localhost' || current.hostname === '127.0.0.1'
    ? new URL('https://chinkai23.github.io/Furgo-Web-App/')
    : current;
  base.search = '';
  base.hash = `admin-orders?code=${encodeURIComponent(formatCheckInToken(token))}`;
  return base.toString();
}

// Create a standards-based QR containing a URL so phone camera apps recognize it.
export function makeCheckInQrSvg(token) {
  const qr = qrcode(0, 'M');
  qr.addData(checkInScanUrl(token), 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 32, scalable: true, alt: { text: 'Order check-in link', id: `check-in-qr-description-${token}` } })
    .replace('<svg ', '<svg class="check-in-qr" ');
}

// Accept both the printed code and the URL payload used by the QR image.
export function extractCheckInCode(rawValue) {
  const value = String(rawValue || '').trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const scannedUrl = new URL(value);
      const hashQuery = scannedUrl.hash.includes('?') ? scannedUrl.hash.slice(scannedUrl.hash.indexOf('?') + 1) : '';
      const params = new URLSearchParams(hashQuery);
      const code = scannedUrl.searchParams.get('code') || params.get('code');
      return String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
    } catch { return ''; }
  }
  return value.toUpperCase().replace(/[\s-]/g, '');
}

// Resolves a scan to an order without changing the order or consuming the token.
export function previewCheckInScan(rawValue) {
  const token = String(rawValue || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const tokens = readTokenMap();
  const record = tokens[token];
  if (!record) return { ok: false, message: 'This code is not in the shared check-in records. Apply Supabase migration 0019, then refresh the customer QR code and try again.' };
  const orders = readOrders(record.orderKey);
  const order = orders.find((item) => String(item.id) === record.orderId);
  if (!order) return { ok: false, message: 'The order for this QR code could not be found in this prototype.' };
  if (record.revokedAt) return { ok: false, message: 'This order is completed and its QR/manual code has been retired.' };
  const currentStatus = String(order.adminStatus || order.status || '').toLowerCase().replace(/[-_]/g, ' ');
  if (record.stage === 'taxi-trip') return { ok: false, message: 'This Pet Taxi QR must be scanned from the Driver Portal.' };
  if (record.stage === 'taxi-pickup' || record.stage === 'taxi-dropoff') {
    const hasTaxi = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
    if (!hasTaxi) return { ok: false, message: 'This order does not include Pet Taxi.' };
    if (/cancel/.test(currentStatus)) return { ok: false, message: 'This taxi order has been cancelled.' };
    const taxiProgress = order.taxiProgress?.status || 'Scheduled';
    const returning = taxiProgress === 'Returning to Customer';
    if (!returning && taxiProgress !== 'Scheduled' && taxiProgress !== 'Assigned') {
      return { ok: false, message: `Pet Taxi QR scan is not available while the trip is ${taxiProgress}.` };
    }
    return { ok: true, message: returning ? 'Ready to confirm pet delivery at home.' : 'Ready to confirm pet pickup.', order, orderKey: record.orderKey, orderId: record.orderId, token, stage: record.stage, nextStatus: returning ? 'Completed' : 'Pet Taxi Delivering...' };
  }
  if (/cancel|complete|deliver/.test(currentStatus)) return { ok: false, message: 'This order is already completed or cancelled.' };
  const checkedIn = currentStatus === 'checked in';
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (!checkedIn && /failed|declined|pending payment|pending online|awaiting verification|pending payment verification|unpaid/.test(paymentStatus)) {
    return { ok: false, message: 'This order is not ready for check-in because its payment is still pending or failed.' };
  }
  if (!['check-in', 'check-out'].includes(record.stage)) return { ok: false, message: 'This code is not a service check-in or check-out code.' };
  const nextStatus = checkedIn ? 'Completed' : 'Checked-In';
  return { ok: true, message: `Ready to confirm ${checkedIn ? 'check-out' : 'check-in'}.`, order, orderKey: record.orderKey, orderId: record.orderId, token, stage: checkedIn ? 'check-out' : 'check-in', nextStatus };
}

// Advances the order only after staff confirms the preview; the visit QR stays reusable for checkout.
export function applyCheckInScan(rawValue) {
  const preview = previewCheckInScan(rawValue);
  if (!preview.ok) return preview;
  if (preview.alreadyProcessed) return preview;
  const { token, orderKey, orderId, stage, nextStatus } = preview;
  const tokens = readTokenMap();
  const record = tokens[token];
  const orders = readOrders(orderKey);
  const order = orders.find((item) => String(item.id) === String(orderId));
  if (!record || !order) return { ok: false, message: 'This order or check-in code is no longer available. Refresh and try again.' };
  const now = new Date().toISOString();
  if (stage === 'taxi-trip' || stage === 'taxi-pickup' || stage === 'taxi-dropoff') return { ok: false, message: 'Pet Taxi QR scans must be completed from the Driver Portal.' };
  const currentStatus = String(order.adminStatus || order.status || '').toLowerCase().replace(/[-_]/g, ' ');
  order.status = nextStatus;
  order.adminStatus = nextStatus;
  if (stage === 'check-in') order.checkedInAt = now;
  else order.completedAt = now;
  order.statusHistory = [...(order.statusHistory || []), { status: nextStatus, previousStatus: currentStatus, changedAt: now, changedBy: 'Admin QR scan' }];
  localStorage.setItem(orderKey, JSON.stringify(orders));
  // The same QR remains valid so a staff member can scan it again at checkout.
  if (stage === 'check-out') revokeOrderTokens(orderKey, orderId);
  return { ok: true, message: `${order.petName || 'Pet'} marked ${nextStatus.toLowerCase()}.`, order, orderKey, nextStatus };
}

// Driver scans reuse one order QR at customer pickup and at the return destination.
export async function applyTaxiScan(rawValue) {
  const token = extractCheckInCode(rawValue);
  if (!/^[2-9A-HJ-NP-Z]{10}$/.test(token)) return { ok: false, message: 'This is not a valid Pet Taxi QR code.' };
  const { data, error } = await supabase.rpc('apply_pet_taxi_qr_scan', { p_token: token });
  if (error) return { ok: false, message: error.message || 'The Pet Taxi scan could not be saved.' };
  if (!data?.ok) return { ok: false, message: data?.message || 'This Pet Taxi scan could not be confirmed.' };
  const orderKey = data.orderKey;
  const orderId = String(data.orderId);
  const records = readOrders(orderKey);
  const index = records.findIndex((item) => String(item.id) === orderId);
  const updatedOrder = { ...(index >= 0 ? records[index] : {}), ...(data.details || {}), id: orderId, userId: data.userId || records[index]?.userId, status: data.status, adminStatus: data.status, taxiProgress: data.taxiProgress };
  if (index >= 0) records[index] = updatedOrder;
  else records.push(updatedOrder);
  cacheSyncedRecords(orderKey, records);
  return { ok: true, message: data.message, order: updatedOrder, orderKey, nextStatus: data.status };
}

function bookingOrders(profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const phone = String(profile.phone || '').replace(/\D/g, '');
  return getBookingSources().flatMap((source) => readOrders(source.key, source.load).map((order) => ({ ...order, _service: source.service, _serviceLabel: source.label, _storageKey: source.key })))
    .filter((order) => {
      const orderEmail = String(order.customerEmail || order.email || '').trim().toLowerCase();
      const orderPhone = String(order.customerPhone || order.phone || '').replace(/\D/g, '');
      const owned = (email && orderEmail === email) || (phone && orderPhone === phone);
      const taxiInProgress = Boolean((order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff) && order.taxiProgress?.status !== 'Completed');
      const active = !/cancel/i.test(order.status || '') && (!/complete|deliver/i.test(order.status || '') || taxiInProgress);
      return owned && order.petName && order.type !== 'pass-purchase' && active;
    })
    .sort((a, b) => new Date(b.createdAt || b.date || b.checkIn || 0) - new Date(a.createdAt || a.date || a.checkIn || 0));
}

function orderSummary(order) {
  if (order._service === 'grooming') return [order.packageName, order.date, order.time, order.outlet].filter(Boolean).join(' · ');
  if (order._service === 'hotel') return [order.roomName, order.checkIn, order.checkOut, order.outlet].filter(Boolean).join(' · ');
  return [order.date, order.time, order.outlet].filter(Boolean).join(' · ');
}

export function formatCheckInToken(token) {
  const value = String(token || '');
  return value.length === 10 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
}

// Format ten-character manual codes as people type them, while accepting pasted codes with or without a hyphen.
export function setupCheckInCodeInput(input) {
  if (!input || input.dataset.codeFormatReady === 'true') return;
  input.dataset.codeFormatReady = 'true';
  input.addEventListener('input', () => {
    const cursor = input.selectionStart ?? input.value.length;
    const beforeCursor = input.value.slice(0, cursor).toUpperCase().replace(/[\s-]/g, '');
    const normalized = input.value.toUpperCase().replace(/[\s-]/g, '');
    const format = (value) => value.length > 10 ? value : value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
    input.value = format(normalized);
    const nextCursor = Math.min(format(beforeCursor).length, input.value.length);
    input.setSelectionRange(nextCursor, nextCursor);
  });
}

function selectedOrderDetail(order) {
  if (!order) return '<section class="check-in-detail check-in-detail-empty"><h2>Choose An Order To Continue</h2><p>Select an active booking above to show its check-in QR code and details.</p></section>';
  const currentStatus = String(order.adminStatus || order.status || '');
  if (/^completed$/i.test(currentStatus) || /^cancelled$/i.test(currentStatus)) return '<section class="check-in-detail check-in-detail-empty"><h2>Order Completed</h2><p>This order has been completed. Its QR and manual codes are no longer available.</p></section>';
  const phase = String(order.adminStatus || order.status || '').toLowerCase().replace(/[-_]/g, ' ') === 'checked in' ? 'check-out' : 'check-in';
  const hasTaxi = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
  const taxiStatus = order.taxiProgress?.status || 'Scheduled';
  const token = hasTaxi ? '' : ensureCheckInToken(order._storageKey, order.id, phase);
  const taxiToken = hasTaxi && taxiStatus !== 'Completed' ? ensureCheckInToken(order._storageKey, order.id, 'taxi-trip') : '';
  const taxiQr = taxiToken ? `<section class="check-in-taxi-qr"><div><span>Pet Taxi · ${escapeHTML(taxiStatus)}</span><h3>Driver Trip QR Code</h3><p>Show this same order QR to the driver at pickup and again when your pet arrives home.</p><small class="check-in-manual-code">Manual code: <strong>${escapeHTML(formatCheckInToken(taxiToken))}</strong></small></div>${makeCheckInQrSvg(taxiToken)}</section>` : hasTaxi ? '<p class="check-in-taxi-complete">Pet Taxi delivery is complete.</p>' : '';
  const heading = phase === 'check-in' ? 'Check-In QR Code' : 'Check-Out QR Code';
  const action = phase === 'check-in' ? 'Ask staff to scan this code when you arrive.' : 'Your pet is checked in. Ask staff to scan this same code again when you are ready to check out.';
  const scanNote = phase === 'check-in' ? 'Scanning opens a review first. Staff check-in only completes after confirmation.' : 'Scanning opens a review first. Staff check-out only completes after confirmation.';
  const qrLayout = hasTaxi ? taxiQr : `<div class="check-in-qr-layout">${makeCheckInQrSvg(token)}<div><h3>${heading}</h3><p>${escapeHTML(action)}</p><small>Reference: ${escapeHTML(order.reference || order.id)}</small><small class="check-in-manual-code">Manual code: <strong>${escapeHTML(formatCheckInToken(token))}</strong></small></div></div>`;
  return `<section class="check-in-detail"><div class="check-in-detail-heading"><div><span>${escapeHTML(order._serviceLabel)}</span><h2>${escapeHTML(order.petName)} · ${escapeHTML(order.reference || order.id)}</h2></div><b class="check-in-status ${phase === 'check-out' ? 'is-checked-in' : ''}">${escapeHTML(order.status || 'In Progress')}</b></div>${qrLayout}<dl class="check-in-order-details"><div><dt>Pet</dt><dd>${escapeHTML(order.petName)}</dd></div><div><dt>Service</dt><dd>${escapeHTML(order._serviceLabel)}</dd></div><div><dt>Details</dt><dd>${escapeHTML(orderSummary(order) || 'Booking details are being prepared.')}</dd></div><div><dt>Current status</dt><dd>${escapeHTML(order.status || 'In Progress')}</dd></div>${hasTaxi ? `<div><dt>Pet Taxi status</dt><dd>${escapeHTML(taxiStatus)}</dd></div>` : ''}</dl><p class="check-in-demo-note">${escapeHTML(hasTaxi ? 'This code remains valid for pickup and the final delivery scan.' : scanNote)}</p></section>`;
}

// Customer Check In: shows upcoming service bookings and the current visit QR.
export function checkInPage(routeParams = new URLSearchParams()) {
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  const orders = bookingOrders(profile);
  const selectedRef = routeParams.get('order') || '';
  const selected = orders.find((order) => `${order._service}:${order.id}` === selectedRef) || null;
  const cards = orders.map((order) => {
    const ref = `${order._service}:${order.id}`;
    const chosen = selected && `${selected._service}:${selected.id}` === ref;
    return `<a class="check-in-order-choice ${chosen ? 'is-selected' : ''}" href="#check-in?order=${encodeURIComponent(ref)}" ${chosen ? 'aria-current="true"' : ''}><span><strong>${escapeHTML(order.petName)}</strong><small>${escapeHTML(order._serviceLabel)} · ${escapeHTML(order.reference || order.id)}</small><small>${escapeHTML(orderSummary(order) || 'Booking details available')}</small></span><b class="check-in-status ${String(order.status || '').toLowerCase() === 'checked in' ? 'is-checked-in' : ''}">${escapeHTML(order.status || 'In Progress')}</b><span class="check-in-order-arrow" aria-hidden="true">›</span></a>`;
  }).join('');
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  return `<main class="check-in-page"><header class="profile-heading check-in-heading"><a class="profile-back" href="#home" aria-label="Back to Home">‹</a><h1>Check In</h1></header><section class="check-in-intro"><span>Service visits</span><h2>Your Active Orders</h2><p>Choose a booking to show its check-in or check-out QR code to Furgo staff.</p></section><section class="check-in-order-list" aria-label="Active bookings">${cards || '<div class="check-in-empty"><h2>No Active Bookings</h2><p>Orders for grooming, pet hotel, or pet daycare will appear here until they are completed.</p></div>'}</section>${selectedOrderDetail(selected)}${bottomNavigation('check-in', icon)}</main>`;
}
