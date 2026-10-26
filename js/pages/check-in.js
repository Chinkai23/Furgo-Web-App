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
      const status = String(order.adminStatus || order.status || '').trim().toLowerCase().replace(/[-_]/g, ' ');
      const terminalStatus = /^(cancelled?|completed|delivered|checked out)$/.test(status);
      const active = !terminalStatus && order.taxiProgress?.status !== 'Completed';
      return owned && order.petName && order.type !== 'pass-purchase' && active;
    })
    .sort((a, b) => {
      const serviceDate = (order) => order._service === 'hotel'
        ? order.checkIn || order.startDate || order.date || order.createdAt
        : order.date || order.bookingDate || order.createdAt;
      const dateA = new Date(serviceDate(a) || 0).getTime();
      const dateB = new Date(serviceDate(b) || 0).getTime();
      const normalizedA = Number.isFinite(dateA) ? dateA : 0;
      const normalizedB = Number.isFinite(dateB) ? dateB : 0;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      const timeInMinutes = (order) => {
        const match = String(order.time || order.dropoffTime || '').match(/(\d{1,2}):(\d{2})\s*([ap])?m?/i);
        if (!match) return 0;
        let hour = Number(match[1]) % 12;
        if (match[3]?.toLowerCase() === 'p') hour += 12;
        return hour * 60 + Number(match[2]);
      };
      return timeInMinutes(a) - timeInMinutes(b);
    });
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

function serviceDisplayName(order) {
  if (order._service === 'grooming') return order.packageName || 'Grooming';
  if (order._service === 'hotel') return order.roomName || 'Pet Hotel Stay';
  return order.type === 'pass-purchase' ? order.planName || 'Daycare Pass' : order.passName || 'Pet Daycare Visit';
}

function orderPetNames(order) {
  const sources = Array.isArray(order.pets) && order.pets.length
    ? order.pets.map((pet) => typeof pet === 'string' ? pet : pet?.name)
    : Array.isArray(order.petNames) && order.petNames.length
      ? order.petNames.map((pet) => typeof pet === 'string' ? pet : pet?.name)
      : [order.pet?.name || order.petName];
  return [...new Set(sources.map((name) => String(name || '').trim()).filter(Boolean))].join(' | ');
}

function formatOrderReference(reference) {
  const value = String(reference || '');
  const match = value.match(/^([A-Z]+)-(\d{5,})$/i);
  return match ? `${match[1]}-${match[2].slice(0, 4)}-${match[2].slice(4)}` : value;
}

function petDetailsCards(order) {
  let pets = [];
  try {
    const saved = JSON.parse(localStorage.getItem('furgo-demo-pet-profiles') || '[]');
    if (Array.isArray(saved)) pets = saved;
  } catch { pets = []; }
  const split = (value) => String(value ?? '').split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  const snapshots = Array.isArray(order.pets) && order.pets.length
    ? order.pets
    : (Array.isArray(order.petNames) ? order.petNames : split(order.petName)).map((name, index) => ({
      id: Array.isArray(order.petIds) ? order.petIds[index] : order.petId,
      name: typeof name === 'string' ? name : name?.name,
      species: split(order.petSpecies)[index],
      breed: split(order.petBreed || order.breed)[index],
      weight: split(order.petWeight || order.weight)[index],
      sex: split(order.petSex || order.gender)[index],
      photo: index === 0 ? order.petPhoto || order.pet?.photo : '',
    }));
  const cards = snapshots.map((snapshot, index) => {
    const pet = pets.find((item) => String(item.id) === String(snapshot.id))
      || pets.find((item) => item.name === snapshot.name)
      || (index === 0 ? order.pet : null)
      || {};
    const image = snapshot.photo || pet.photo || (index === 0 ? order.petPhoto || order.pet?.photo : '') || '';
    const safeImage = /^(data:image\/(png|jpeg|webp|gif);base64,|https:\/\/|Image\/)/i.test(String(image)) ? image : 'Image/Other%20Image/Pet%20Profile%20Picture.png';
    const name = snapshot.name || pet.name || `Pet ${index + 1}`;
    const breed = snapshot.breed || pet.breed || '';
    const sex = snapshot.sex || snapshot.gender || pet.sex || pet.gender || '';
    const weight = snapshot.weight ?? pet.weight;
    const species = snapshot.species || pet.species || '';
    const details = [species, breed, sex, weight !== '' && weight != null ? `${weight} kg` : ''].filter(Boolean).join(' · ');
    return `<section class="check-in-pet-card"><img src="${escapeHTML(safeImage)}" alt="${escapeHTML(name)} profile" /><div><strong>${escapeHTML(name)}</strong><span>${escapeHTML(details || 'Pet profile')}</span></div></section>`;
  }).join('');
  return cards ? `<div class="check-in-pet-cards">${cards}</div>` : '';
}

function orderDetailRows(order, taxiStatus) {
  const values = [
    ['Order Number', order.reference || order.id],
    ['Service', order._serviceLabel],
    ['Appointment', orderSummary(order)],
    ['Customer', order.customerName],
    ['Contact', order.customerPhone || order.customerEmail],
    ['Payment', [order.paymentStatus, order.paymentMethod].filter(Boolean).join(' · ')],
    ['Total', Number.isFinite(Number(order.total)) ? `MYR ${Number(order.total).toFixed(2)}` : ''],
    ['Add-on services', Array.isArray(order.addOns) ? order.addOns.map((item) => item.name).filter(Boolean).join(', ') : ''],
    ['Pet Taxi', order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff ? taxiStatus : ''],
    ['Customer notes', order.notes || order.specialRequests],
  ].filter(([, value]) => value != null && String(value).trim());
  return values.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
}

function appointmentDetailsMarkup(order) {
  const formatDate = (value) => {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
      : text;
  };
  const formatTime = (value) => String(value || '').replace(/\b(\d{1,2}):(\d{2})(\s*([ap])m)?\b/gi, (match, rawHour, minutes, suffix, period) => {
    const hour = Number(rawHour);
    if (period) return `${hour}:${minutes} ${period.toUpperCase()}M`;
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  });
  const date = order._service === 'hotel'
    ? [order.checkIn, order.checkOut].filter(Boolean).map(formatDate).join(' – ')
    : formatDate(order.date || order.bookingDate || '');
  const time = order._service === 'daycare'
    ? [order.dropoffTime, order.pickupTime].filter(Boolean).map(formatTime).join(' – ')
    : formatTime(order.time || '');
  const petNames = orderPetNames(order);
  const highlight = (value) => value ? `<span>${escapeHTML(value)}</span>` : '';
  const dateAndTime = [date, time].filter(Boolean).join(' | ');
  return `<section class="check-in-appointment"><p class="check-in-appointment-number">${escapeHTML(dateAndTime)}</p><div class="check-in-appointment-highlights">${highlight(petNames)}</div></section>`;
}

function selectedOrderDetail(order, showMore = false) {
  if (!order) return '';
  const currentStatus = String(order.adminStatus || order.status || '');
  if (/^(completed|cancelled|canceled|delivered|checked out)$/i.test(currentStatus.trim())) return '';
  const phase = String(order.adminStatus || order.status || '').toLowerCase().replace(/[-_]/g, ' ') === 'checked in' ? 'check-out' : 'check-in';
  const hasTaxi = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
  const taxiStatus = order.taxiProgress?.status || 'Scheduled';
  const token = hasTaxi ? '' : ensureCheckInToken(order._storageKey, order.id, phase);
  const taxiToken = hasTaxi && taxiStatus !== 'Completed' ? ensureCheckInToken(order._storageKey, order.id, 'taxi-trip') : '';
  const qrButton = (value, label) => `<button type="button" class="check-in-qr-trigger" data-open-check-in-qr aria-label="Enlarge ${escapeHTML(label)}">${makeCheckInQrSvg(value)}</button>`;
  const orderRef = `${order._service}:${order.id}`;
  const detailsHref = `#check-in?order=${encodeURIComponent(orderRef)}&details=1`;
  const detailsLink = `<a class="button button-primary check-in-more-button" href="${detailsHref}">More Details</a>`;
  const taxiQr = taxiToken ? `<section class="check-in-taxi-qr">${showMore ? '' : appointmentDetailsMarkup(order)}${qrButton(taxiToken, 'Pet Taxi QR code')}<div><span>Pet Taxi · ${escapeHTML(taxiStatus)}</span><h3>Driver Trip QR Code</h3><p>Show this code to staff when you arrive.</p><small class="check-in-manual-code">Manual code: <strong>${escapeHTML(formatCheckInToken(taxiToken))}</strong></small>${showMore ? '' : detailsLink}</div></section>` : hasTaxi ? '<p class="check-in-taxi-complete">Pet Taxi delivery is complete.</p>' : '';
  const heading = phase === 'check-in' ? 'Check-In QR Code' : 'Check-Out QR Code';
  const action = phase === 'check-in' ? 'Show this code to staff when you arrive.' : 'Show this code to staff when you are ready to check out.';
  const qrLayout = hasTaxi ? taxiQr : `<section class="check-in-qr-layout">${showMore ? '' : appointmentDetailsMarkup(order)}${qrButton(token, 'order QR code')}<div><h3>${heading}</h3><p>${escapeHTML(action)}</p><small class="check-in-manual-code">Manual code: <strong>${escapeHTML(formatCheckInToken(token))}</strong></small>${showMore ? '' : detailsLink}</div></section>`;
  const serviceName = serviceDisplayName(order);
  const serviceHeading = `${serviceName} (${formatOrderReference(order.reference || order.id)})`;
  if (showMore) return `<section class="check-in-detail check-in-more-details"><div class="check-in-detail-heading"><h2>${escapeHTML(serviceHeading)}</h2><b class="check-in-status">${escapeHTML(currentStatus || 'In Progress')}</b></div>${petDetailsCards(order)}${qrLayout}<dl class="check-in-order-details">${orderDetailRows(order, taxiStatus)}</dl></section>`;
  return `<section class="check-in-detail"><div class="check-in-detail-heading"><h2>${escapeHTML(serviceHeading)}</h2><b class="check-in-status ${phase === 'check-out' ? 'is-checked-in' : ''}">${escapeHTML(currentStatus || 'In Progress')}</b></div>${qrLayout}</section>`;
}

export function setupCheckInInteractions() {
  if (document.documentElement.dataset.checkInQrInteractionsReady === 'true') return;
  document.documentElement.dataset.checkInQrInteractionsReady = 'true';
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-check-in-qr]');
    const closer = event.target.closest('[data-close-check-in-qr]');
    const modal = document.querySelector('[data-check-in-qr-modal]');
    if (!modal) return;
    if (opener) {
      const svg = opener.querySelector('svg');
      if (!svg) return;
      modal.innerHTML = `<div class="check-in-qr-modal-content"><button type="button" class="check-in-qr-modal-close" data-close-check-in-qr aria-label="Close full-size QR code">×</button><button type="button" class="check-in-qr-modal-image" data-close-check-in-qr aria-label="Close full-size QR code">${svg.outerHTML}</button></div>`;
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.classList.add('check-in-qr-modal-open');
      modal.querySelector('[data-close-check-in-qr]')?.focus();
    } else if (closer || event.target === modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = '';
      document.body.classList.remove('check-in-qr-modal-open');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const modal = document.querySelector('[data-check-in-qr-modal]');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '';
    document.body.classList.remove('check-in-qr-modal-open');
  });
}

// Customer Check In: shows upcoming service bookings and the current visit QR.
export function checkInPage(routeParams = new URLSearchParams()) {
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  const orders = bookingOrders(profile);
  const selectedRef = routeParams.get('order') || '';
  const selected = orders.find((order) => `${order._service}:${order.id}` === selectedRef) || orders[0] || null;
  const showMore = routeParams.get('details') === '1';
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const headerBack = showMore && selected ? `#check-in?order=${encodeURIComponent(`${selected._service}:${selected.id}`)}` : showMore ? '#check-in' : '#home';
  const activeQrSections = orders.map((order) => selectedOrderDetail(order)).join('');
  return `<main class="check-in-page"><header class="profile-heading check-in-heading"><a class="profile-back" href="${headerBack}" aria-label="${showMore ? 'Back to Check In' : 'Back to Home'}">‹</a><h1>${showMore ? 'Order Details' : 'Check In'}</h1></header>${showMore ? selectedOrderDetail(selected, true) : activeQrSections || '<div class="check-in-empty"><h2>No Active Bookings</h2><p>Orders for grooming, pet hotel, or pet daycare will appear here until they are completed.</p></div>'}<div class="check-in-qr-modal" data-check-in-qr-modal hidden aria-hidden="true"></div>${bottomNavigation('check-in', icon)}</main>`;
}
