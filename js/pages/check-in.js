import { bottomNavigation, escapeHTML } from '../shared.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { supabase } from '../supabase.js';

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

// Refresh customer-generated one-time codes from Supabase before staff validate them.
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

// Makes a short, order-specific single-use code for the requested visit stage.
export function ensureCheckInToken(orderKey, orderId, stage) {
  const tokens = readTokenMap();
  const existing = Object.values(tokens).find((record) => record.orderKey === orderKey && String(record.orderId) === String(orderId) && record.stage === stage && !record.usedAt);
  if (existing) return existing.token;
  let token = makeToken();
  while (tokens[token]) token = makeToken();
  tokens[token] = { token, orderKey, orderId: String(orderId), stage, createdAt: new Date().toISOString() };
  writeTokenMap(tokens);
  return token;
}

// QR version 1-L generator for the 10-character random check-in tokens used by this prototype.
export function makeCheckInQrSvg(token) {
  const bytes = [...new TextEncoder().encode(String(token))];
  if (bytes.length > 17) throw new Error('Check-in token is too long for this QR code.');
  const bits = [];
  const appendBits = (value, length) => { for (let shift = length - 1; shift >= 0; shift -= 1) bits.push((value >>> shift) & 1); };
  appendBits(0b0100, 4);
  appendBits(bytes.length, 8);
  bytes.forEach((byte) => appendBits(byte, 8));
  for (let i = 0; i < 4 && bits.length < 152; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let offset = 0; offset < bits.length; offset += 8) data.push(bits.slice(offset, offset + 8).reduce((value, bit) => (value << 1) | bit, 0));
  for (let pad = 0; data.length < 19; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);

  const multiply = (left, right) => {
    let result = 0;
    for (let i = 7; i >= 0; i -= 1) {
      result = (result << 1) ^ (((result >>> 7) & 1) * 0x11d);
      result ^= ((right >>> i) & 1) * left;
    }
    return result;
  };
  const generator = [87, 229, 146, 149, 238, 102, 21];
  const ecc = Array(7).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ ecc[0];
    ecc.shift(); ecc.push(0);
    generator.forEach((coefficient, index) => { ecc[index] ^= multiply(coefficient, factor); });
  });
  const codewords = [...data, ...ecc];
  const size = 21;
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const setFunction = (x, y, dark) => { matrix[y][x] = dark; reserved[y][x] = true; };

  [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([centerX, centerY]) => {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx; const y = centerY + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const edge = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(x, y, edge !== 2 && edge !== 4);
    }
  });
  for (let index = 8; index < size - 8; index += 1) {
    setFunction(6, index, index % 2 === 0);
    setFunction(index, 6, index % 2 === 0);
  }
  for (let index = 0; index < 15; index += 1) {
    const first = index < 6 ? [8, index] : index < 8 ? [8, index + 1] : [14 - index, 8];
    const second = index < 8 ? [size - 1 - index, 8] : [8, size - 15 + index];
    setFunction(first[0], first[1], false);
    setFunction(second[0], second[1], false);
  }
  setFunction(8, size - 8, true);

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        const bit = bitIndex < codewords.length * 8 ? (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1 : 0;
        matrix[y][x] = Boolean(bit ^ ((x + y) % 2 === 0 ? 1 : 0));
        bitIndex += 1;
      }
    }
  }

  let format = 0b01000;
  let remainder = format << 10;
  for (let bit = 14; bit >= 10; bit -= 1) if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10);
  format = ((format << 10) | remainder) ^ 0x5412;
  for (let index = 0; index < 15; index += 1) {
    const dark = ((format >>> index) & 1) !== 0;
    const first = index < 6 ? [8, index] : index < 8 ? [8, index + 1] : [14 - index, 8];
    const second = index < 8 ? [size - 1 - index, 8] : [8, size - 15 + index];
    matrix[first[1]][first[0]] = dark;
    matrix[second[1]][second[0]] = dark;
  }
  matrix[size - 8][8] = true;
  const path = matrix.map((row, y) => row.map((dark, x) => dark ? `M${x + 4} ${y + 4}h1v1h-1z` : '').join('')).join('');
  return `<svg class="check-in-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" role="img" aria-label="Order check-in QR code"><rect width="29" height="29" fill="#fff"/><path d="${path}" fill="#202024"/></svg>`;
}

// Looks up a scanned one-time token and advances only its matching service order.
export function applyCheckInScan(rawValue) {
  const token = String(rawValue || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const tokens = readTokenMap();
  const record = tokens[token];
  if (!record) return { ok: false, message: 'This code is not in the shared check-in records. Refresh the customer QR code and try again. Codes from another device require Supabase migration 0017.' };
  if (record.usedAt) return { ok: false, message: 'This QR code has already been used.' };
  const orders = readOrders(record.orderKey);
  const order = orders.find((item) => String(item.id) === record.orderId);
  if (!order) return { ok: false, message: 'The order for this QR code could not be found in this prototype.' };
  const currentStatus = String(order.status || '').toLowerCase();
  if (record.stage === 'taxi-pickup' || record.stage === 'taxi-dropoff') {
    const hasTaxi = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
    if (!hasTaxi) return { ok: false, message: 'This order does not include Pet Taxi.' };
    if (/cancel/.test(currentStatus)) return { ok: false, message: 'This taxi order has been cancelled.' };
    const expectedStage = order.taxiProgress?.status === 'Picked Up' ? 'taxi-dropoff' : 'taxi-pickup';
    if (record.stage !== expectedStage) return { ok: false, message: `Scan the customer’s ${expectedStage === 'taxi-pickup' ? 'pickup' : 'drop-off'} QR code next.` };
    const now = new Date().toISOString();
    const previousTaxiStatus = order.taxiProgress?.status || 'Scheduled';
    const nextStatus = record.stage === 'taxi-pickup' ? 'Picked Up' : 'Dropped Off';
    order.taxiProgress = { ...(order.taxiProgress || {}), status: nextStatus, driverEmail: 'driver@gmail.com', ...(record.stage === 'taxi-pickup' ? { pickedUpAt: now } : { droppedOffAt: now }) };
    order.statusHistory = [...(order.statusHistory || []), { status: `Taxi ${nextStatus}`, previousStatus: previousTaxiStatus, changedAt: now, changedBy: 'Pet Taxi Driver QR scan' }];
    localStorage.setItem(record.orderKey, JSON.stringify(orders));
    if (record.stage === 'taxi-dropoff') {
      try {
        const locationKey = 'furgo-demo-driver-locations';
        const locations = JSON.parse(localStorage.getItem(locationKey) || '{}');
        delete locations[`${record.orderKey}|${record.orderId}`];
        localStorage.setItem(locationKey, JSON.stringify(locations));
      } catch { /* Taxi completion must still be saved if an old location record is malformed. */ }
    }
    record.usedAt = now;
    tokens[token] = record;
    writeTokenMap(tokens);
    return { ok: true, message: `${order.petName || 'Pet'} taxi ${nextStatus.toLowerCase()}.`, order, orderKey: record.orderKey, nextStatus };
  }
  if (/cancel|complete|deliver/.test(currentStatus)) return { ok: false, message: 'This order is already completed or cancelled.' };
  const expectedStage = currentStatus === 'checked in' ? 'check-out' : 'check-in';
  if (record.stage !== expectedStage) return { ok: false, message: `This order needs its ${expectedStage === 'check-in' ? 'check-in' : 'check-out'} QR code.` };
  const now = new Date().toISOString();
  const nextStatus = record.stage === 'check-in' ? 'Checked In' : 'Completed';
  order.status = nextStatus;
  order.adminStatus = nextStatus;
  if (record.stage === 'check-in') order.checkedInAt = now;
  else order.completedAt = now;
  order.statusHistory = [...(order.statusHistory || []), { status: nextStatus, previousStatus: currentStatus, changedAt: now, changedBy: 'Admin QR scan' }];
  localStorage.setItem(record.orderKey, JSON.stringify(orders));
  record.usedAt = now;
  tokens[token] = record;
  writeTokenMap(tokens);
  return { ok: true, message: `${order.petName || 'Pet'} marked ${nextStatus.toLowerCase()}.`, order, orderKey: record.orderKey, nextStatus };
}

// Driver scanner guard: accept only taxi pickup/drop-off codes, never the service check-in code.
export function applyTaxiScan(rawValue) {
  const token = String(rawValue || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const record = readTokenMap()[token];
  if (!record || !['taxi-pickup', 'taxi-dropoff'].includes(record.stage)) return { ok: false, message: 'This is not a Pet Taxi pickup or drop-off QR code.' };
  return applyCheckInScan(rawValue);
}

function bookingOrders(profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const phone = String(profile.phone || '').replace(/\D/g, '');
  return getBookingSources().flatMap((source) => readOrders(source.key, source.load).map((order) => ({ ...order, _service: source.service, _serviceLabel: source.label, _storageKey: source.key })))
    .filter((order) => {
      const orderEmail = String(order.customerEmail || order.email || '').trim().toLowerCase();
      const orderPhone = String(order.customerPhone || order.phone || '').replace(/\D/g, '');
      const owned = (email && orderEmail === email) || (phone && orderPhone === phone);
      const taxiInProgress = Boolean((order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff) && order.taxiProgress?.status !== 'Dropped Off');
      return owned && order.petName && order.type !== 'pass-purchase' && (!/cancel|complete|deliver/i.test(order.status || '') || taxiInProgress);
    })
    .sort((a, b) => new Date(a.createdAt || a.date || a.checkIn || 0) - new Date(b.createdAt || b.date || b.checkIn || 0));
}

function orderSummary(order) {
  if (order._service === 'grooming') return [order.packageName, order.date, order.time, order.outlet].filter(Boolean).join(' · ');
  if (order._service === 'hotel') return [order.roomName, order.checkIn, order.checkOut, order.outlet].filter(Boolean).join(' · ');
  return [order.date, order.time, order.outlet].filter(Boolean).join(' · ');
}

function formatCheckInToken(token) {
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
  const phase = String(order.status || '').toLowerCase() === 'checked in' ? 'check-out' : 'check-in';
  const token = ensureCheckInToken(order._storageKey, order.id, phase);
  const hasTaxi = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
  const taxiStatus = order.taxiProgress?.status || 'Scheduled';
  const taxiPhase = taxiStatus === 'Picked Up' ? 'taxi-dropoff' : 'taxi-pickup';
  const taxiToken = hasTaxi && taxiStatus !== 'Dropped Off' ? ensureCheckInToken(order._storageKey, order.id, taxiPhase) : '';
  const taxiQr = taxiToken ? `<section class="check-in-taxi-qr"><div><span>Pet Taxi · ${escapeHTML(taxiStatus)}</span><h3>${taxiPhase === 'taxi-pickup' ? 'Driver Pickup QR' : 'Driver Drop-Off QR'}</h3><p>Show this order-specific code to your driver to confirm ${taxiPhase === 'taxi-pickup' ? 'pickup' : 'drop-off'}.</p><small class="check-in-manual-code">Manual code: <strong>${escapeHTML(formatCheckInToken(taxiToken))}</strong></small></div>${makeCheckInQrSvg(taxiToken)}</section>` : hasTaxi ? '<p class="check-in-taxi-complete">Pet Taxi drop-off is complete.</p>' : '';
  const heading = phase === 'check-in' ? 'Check-In QR Code' : 'Check-Out QR Code';
  const action = phase === 'check-in' ? 'Ask staff to scan this code when you arrive.' : 'Your pet is checked in. Ask staff to scan this code when you are ready to check out.';
  return `<section class="check-in-detail"><div class="check-in-detail-heading"><div><span>${escapeHTML(order._serviceLabel)}</span><h2>${escapeHTML(order.petName)} · ${escapeHTML(order.reference || order.id)}</h2></div><b class="check-in-status ${phase === 'check-out' ? 'is-checked-in' : ''}">${phase === 'check-out' ? 'Checked In' : escapeHTML(order.status || 'In Progress')}</b></div><div class="check-in-qr-layout">${makeCheckInQrSvg(token)}<div><h3>${heading}</h3><p>${escapeHTML(action)}</p><small>Reference: ${escapeHTML(order.reference || order.id)}</small><small class="check-in-manual-code">Manual code: <strong>${escapeHTML(formatCheckInToken(token))}</strong></small></div></div>${taxiQr}<dl class="check-in-order-details"><div><dt>Pet</dt><dd>${escapeHTML(order.petName)}</dd></div><div><dt>Service</dt><dd>${escapeHTML(order._serviceLabel)}</dd></div><div><dt>Details</dt><dd>${escapeHTML(orderSummary(order) || 'Booking details are being prepared.')}</dd></div><div><dt>Current status</dt><dd>${escapeHTML(order.status || 'In Progress')}</dd></div>${hasTaxi ? `<div><dt>Pet Taxi status</dt><dd>${escapeHTML(taxiStatus)}</dd></div>` : ''}</dl><p class="check-in-demo-note">Visit and Pet Taxi QR codes are single-use in this browser prototype.</p></section>`;
}

// Customer Check In: shows upcoming service bookings and the current one-time visit QR.
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
