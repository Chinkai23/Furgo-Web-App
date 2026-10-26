import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadMarketplaceOrders } from './marketplace-data.js';
import { loadGroomingBookings } from './grooming-data.js';
import { mountDriverLocation } from './driver-location.js';
import { saveOrderRecords } from '../app-data-sync.js';
import { marketplaceOrdersKey } from './marketplace-data.js';
import { groomingBookingsKey } from './grooming-data.js';
import { hotelBookingsKey } from './hotel-data.js';
import { daycareBookingsKey } from './daycare-data.js';

const orderServices = [
  { id: 'all', label: 'All' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'grooming', label: 'Grooming' },
  { id: 'hotel', label: 'Pet Hotel' },
  { id: 'daycare', label: 'Pet Daycare' },
];
const orderStatuses = [
  { id: 'all', label: 'All statuses' },
  { id: 'completed', label: 'Completed' },
  { id: 'canceled', label: 'Canceled' },
];
let myOrderLocationCleanups = [];

// Loads future Pet Hotel and Pet Daycare records from the local prototype storage keys.
function loadLocalOrders(key, alternateKeys = []) {
  const records = [];
  const seen = new Set();
  for (const storageKey of [key, ...alternateKeys]) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved)) saved.filter((record) => record && typeof record === 'object').forEach((record) => {
        const identity = String(record.id || record.reference || `${record.createdAt || ''}|${record.customerEmail || ''}|${record.petName || ''}`);
        if (!seen.has(identity)) { seen.add(identity); records.push(record); }
      });
    } catch { /* Continue to another known demo storage key. */ }
  }
  return records;
}

// Restricts order history to the signed-in demo account using its email or phone number.
function belongsToCurrentUser(order, profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const phone = String(profile.phone || '').replace(/\D/g, '');
  const orderEmail = String(order.customerEmail || order.email || order.customer?.email || '').trim().toLowerCase();
  const orderPhone = String(order.customerPhone || order.phone || order.customer?.phone || '').replace(/\D/g, '');
  return Boolean((email && orderEmail === email) || (phone && orderPhone === phone));
}

// Provides a consistent status category for completed and canceled records across services.
function statusCategory(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['completed', 'delivered'].includes(normalized)) return 'completed';
  if (['canceled', 'cancelled'].includes(normalized)) return 'canceled';
  return 'active';
}

function customerOrderStatus(order) {
  const rawStatus = String(order.adminStatus || order.status || '').trim();
  const taxiLifecycle = ['Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup', 'Checked-In'];
  const matchedTaxiLifecycle = taxiLifecycle.find((status) => status.toLowerCase() === rawStatus.toLowerCase());
  if (matchedTaxiLifecycle) return matchedTaxiLifecycle;
  const normalized = rawStatus.toLowerCase().replace(/[-_]/g, ' ');
  if (/cancel/.test(normalized)) return 'Cancelled';
  if (/complete|delivered|checked out/.test(normalized)) return 'Completed';
  if (/checked in/.test(normalized)) return 'Checked-In';
  if (/received order/.test(normalized) || order.receipt) return 'Received Order';
  if (/pending payment/.test(normalized) || /pending|failed|declined|awaiting|unpaid/.test(String(order.paymentStatus || '').toLowerCase())) return 'Pending Payment';
  if (/paid|successful|succeeded/.test(String(order.paymentStatus || '').toLowerCase()) && !/shipped|delivered/.test(normalized)) return 'New Order';
  return order.status || 'Pending';
}

function cancellationDeadlineDate(order) {
  const raw = order.serviceId === 'hotel' ? order.checkIn || order.startDate : order.date || order.bookingDate;
  if (!raw) return null;
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function canCancelServiceOrder(order) {
  if (!['grooming', 'hotel', 'daycare'].includes(order.serviceId) || order.type === 'pass-purchase') return false;
  if ((order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff) && !['Scheduled', 'Assigned'].includes(order.taxiProgress?.status || 'Scheduled')) return false;
  if (!/paid|successful|succeeded|credit/.test(String(order.paymentStatus || '').toLowerCase())) return false;
  if (statusCategory(customerOrderStatus(order)) !== 'active') return false;
  const serviceDate = cancellationDeadlineDate(order);
  if (!serviceDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((serviceDate.getTime() - today.getTime()) / 86400000) >= 7;
}

// Formats saved ISO timestamps and prototype date strings for compact order cards.
function formatOrderDate(value = '') {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function orderPetCards(order) {
  if (order.serviceId === 'marketplace' || order.type === 'pass-purchase') return '';
  const split = (value) => String(value ?? '').split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  const snapshots = Array.isArray(order.pets) && order.pets.length
    ? order.pets
    : (Array.isArray(order.petNames) ? order.petNames : split(order.petName)).map((pet, index) => ({
      id: Array.isArray(order.petIds) ? order.petIds[index] : order.petId,
      name: typeof pet === 'string' ? pet : pet?.name,
      species: split(order.petSpecies || order.species)[index],
      breed: split(order.petBreed || order.breed)[index],
      sex: split(order.petSex || order.gender)[index],
      weight: split(order.petWeight || order.weight)[index],
      colour: split(order.petColour || order.colour)[index],
    }));
  if (!snapshots.length) return '';
  let profiles = [];
  try {
    const saved = JSON.parse(localStorage.getItem('furgo-demo-pet-profiles') || '[]');
    if (Array.isArray(saved)) profiles = saved;
  } catch { profiles = []; }
  return `<div class="my-order-pet-list">${snapshots.map((snapshot, index) => {
    const profile = profiles.find((item) => String(item.id) === String(snapshot.id))
      || profiles.find((item) => item.name === snapshot.name)
      || (index === 0 ? order.pet : null)
      || {};
    const name = snapshot.name || profile.name || `Pet ${index + 1}`;
    const facts = [
      ['Species', snapshot.species || profile.species],
      ['Breed', snapshot.breed || profile.breed],
      ['Gender', snapshot.sex || snapshot.gender || profile.sex || profile.gender],
      ['Weight', (snapshot.weight ?? profile.weight) !== '' && (snapshot.weight ?? profile.weight) != null ? `${snapshot.weight ?? profile.weight} kg` : ''],
      ['Colour', snapshot.colour || snapshot.color || profile.colour || profile.color],
      ['Vaccination Cards', snapshot.vaccinationCards?.length ? 'Uploaded' : snapshot.vaccinationOnFile ? 'Uploaded' : ''],
      ['Care Notes', snapshot.redFlags || (Array.isArray(profile.remarks) ? profile.remarks.join(' · ') : profile.redFlagRemark)],
    ].filter(([, value]) => value != null && String(value).trim());
    return `<section class="my-order-pet-card"><h3>${escapeHTML(name)}</h3>${facts.length ? `<dl>${facts.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>` : '<p>Pet profile details are not available.</p>'}</section>`;
  }).join('')}</div>`;
}

function orderDetailRows(order) {
  const appointment = order.serviceId === 'hotel'
    ? [order.roomName, order.checkIn || order.startDate, order.checkOut || order.endDate, order.outlet].filter(Boolean).join(' · ')
    : [order.packageName || order.planName, order.date || order.bookingDate, order.time, order.dropoffTime && `Drop-off ${order.dropoffTime}`, order.pickupTime && `Pick-up ${order.pickupTime}`, order.outlet].filter(Boolean).join(' · ');
  const items = Array.isArray(order.items)
    ? order.items.map((item) => `${item.name || item.productName || 'Product'} × ${Number(item.quantity) || 1}`).join(', ')
    : '';
  const addOns = Array.isArray(order.addOns)
    ? order.addOns.map((item) => typeof item === 'string' ? item : item.name).filter(Boolean).join(', ')
    : '';
  const payment = [order.paymentStatus, order.paymentMethod, order.paymentReference && `Ref ${order.paymentReference}`].filter(Boolean).join(' · ');
  const total = Number(order.totalAmount ?? order.total);
  const rows = [
    ['Service', order.serviceLabel],
    [order.serviceId === 'marketplace' ? 'Items' : 'Appointment', order.serviceId === 'marketplace' ? items || order.summary : appointment || order.summary],
    ['Add-On Services', addOns],
    ['Pet Taxi', order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff ? [order.taxiSchedule, order.taxi?.pickup, order.taxi?.dropoff].filter(Boolean).join(' · ') || 'Included' : ''],
    ['Payment', payment],
    ['Total Paid', Number.isFinite(total) ? `MYR ${total.toFixed(2)}` : ''],
    ['Delivery Address', order.shippingAddress || order.deliveryAddress || order.address],
    ['Order Notes', order.notes || order.specialRequests],
  ].filter(([, value]) => value != null && String(value).trim());
  return rows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
}

// My Orders: combines marketplace, grooming, hotel, and daycare orders with service/status tabs.
export function myOrdersPage(routeParams = new URLSearchParams()) {
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }

  const service = orderServices.some((item) => item.id === routeParams.get('service')) ? routeParams.get('service') : 'all';
  const status = orderStatuses.some((item) => item.id === routeParams.get('status')) ? routeParams.get('status') : 'all';
  const returnTo = ['home', 'marketplace', 'grooming', 'hotel', 'daycare', 'profile'].includes(routeParams.get('from')) ? routeParams.get('from') : 'home';
  const marketplace = loadMarketplaceOrders().filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order,
    serviceId: 'marketplace',
    _storageKey: marketplaceOrdersKey,
    serviceLabel: 'Marketplace',
    title: order.reference ? `Order ${order.reference}` : 'Marketplace order',
    summary: (order.items || []).map((item) => `${item.name || 'Product'} × ${Number(item.quantity) || 1}`).join(', ') || 'Marketplace purchase',
    dateLabel: order.date || order.createdAt || '',
    totalAmount: Number(order.total) || 0,
  }));
  const grooming = loadGroomingBookings().filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order,
    serviceId: 'grooming',
    serviceLabel: 'Grooming',
    title: `${order.petName || 'Pet'} · ${order.packageName || 'Grooming'}`,
    summary: [order.date, order.time, order.outlet].filter(Boolean).join(' · '),
    dateLabel: order.createdAt || order.date || '',
    _storageKey: groomingBookingsKey,
    totalAmount: Number(order.total) || 0,
  }));
  const hotels = loadLocalOrders('furgo-demo-hotel-bookings', ['furgo-demo-pet-hotel-bookings', 'furgo-demo-hotel-orders']).filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order, serviceId: 'hotel', serviceLabel: 'Pet Hotel',
    _storageKey: hotelBookingsKey,
    title: order.petName ? `${order.petName} · Pet Hotel` : order.reference ? `Stay ${order.reference}` : 'Pet Hotel booking',
    summary: [order.checkIn || order.startDate, order.checkOut || order.endDate, order.outlet].filter(Boolean).join(' · '),
    dateLabel: order.createdAt || order.checkIn || order.startDate || '', totalAmount: Number(order.total) || 0,
  }));
  const daycare = loadLocalOrders('furgo-demo-daycare-bookings', ['furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders']).filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order, serviceId: 'daycare', serviceLabel: 'Pet Daycare',
    _storageKey: daycareBookingsKey,
    title: order.type === 'pass-purchase' ? `${order.planName || 'Daycare Pass'} · ${order.petName || 'Pet'}` : order.petName ? `${order.petName} · Pet Daycare` : order.reference ? `Daycare ${order.reference}` : 'Pet Daycare booking',
    summary: order.type === 'pass-purchase' ? `${Number(order.sessions || 0)} sessions · valid through ${order.expiresOn || 'expiry not set'}` : [order.date, order.time, order.outlet, order.passName ? `Pass · ${order.passName}` : ''].filter(Boolean).join(' · '),
    dateLabel: order.createdAt || order.date || '', totalAmount: Number(order.total) || 0,
  }));

  const orderCreatedAt = (order) => {
    const timestamp = new Date(order.createdAt || order.dateLabel || order.date || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const allOrders = [...marketplace, ...grooming, ...hotels, ...daycare].sort((a, b) => orderCreatedAt(b) - orderCreatedAt(a));
  const serviceOrders = allOrders.filter((order) => service === 'all' || order.serviceId === service);
  const visibleOrders = serviceOrders.filter((order) => status === 'all' || statusCategory(customerOrderStatus(order)) === status);
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const tabHref = (nextService, nextStatus) => `#orders?service=${encodeURIComponent(nextService)}&status=${encodeURIComponent(nextStatus)}&from=${encodeURIComponent(returnTo)}`;
  const serviceTabs = orderServices.map((item) => {
    const count = item.id === 'all' ? allOrders.length : allOrders.filter((order) => order.serviceId === item.id).length;
    return `<a class="my-orders-tab ${service === item.id ? 'is-active' : ''}" href="${tabHref(item.id, status)}" ${service === item.id ? 'aria-current="page"' : ''}>${item.label}<span>${count}</span></a>`;
  }).join('');
  const statusTabs = orderStatuses.map((item) => `<a class="my-orders-status-tab ${status === item.id ? 'is-active' : ''}" href="${tabHref(service, item.id)}" ${status === item.id ? 'aria-current="page"' : ''}>${item.label}</a>`).join('');

  const orderCard = (order) => {
    const serviceName = order.serviceLabel;
    const statusLabel = customerOrderStatus(order);
    const isCanceled = statusCategory(statusLabel) === 'canceled';
    const summary = order.summary || order.description || 'Order details will appear here.';
    const marketplaceDetails = order.serviceId === 'marketplace' && order.trackingNumber
      ? `<p class="my-order-extra">${escapeHTML(order.courier || 'Courier')}: ${escapeHTML(order.trackingNumber)}</p>` : '';
    const groomingDetails = order.serviceId === 'grooming' && order.includeTaxi
      ? `<p class="my-order-extra">Pet taxi: ${escapeHTML(order.taxiSchedule || 'Pickup time pending')} · MYR ${Number(order.taxiTotal || 0).toFixed(2)}</p>` : '';
    const hotelDetails = order.serviceId === 'hotel'
      ? `${order.roomName ? `<p class="my-order-extra">${escapeHTML(order.roomName)} · ${Number(order.nights || 0)} night(s) · ${escapeHTML(order.outlet || '')}${order.roomArrangement === 'shared' ? ' · Pets sharing one room' : ''}</p>` : ''}${order.mediaLogs?.length ? `<div class="my-order-media-feed"><strong>My Stay · Care updates</strong>${order.mediaLogs.map((entry) => entry.type?.startsWith('video/') ? `<video controls preload="metadata" src="${escapeHTML(entry.data)}" aria-label="Pet Hotel update from ${escapeHTML(entry.date || '')}"></video>` : `<a href="${escapeHTML(entry.data)}" target="_blank" rel="noopener"><img src="${escapeHTML(entry.data)}" alt="Pet Hotel care update from ${escapeHTML(entry.date || '')}" loading="lazy" /><span>${escapeHTML(entry.date || '')} · ${escapeHTML(entry.name)}</span></a>`).join('')}</div>` : ''}` : '';
    const daycareDetails = order.serviceId === 'daycare' ? `<p class="my-order-extra">${order.type === 'pass-purchase' ? `${Number(order.sessions || 0)} sessions · valid through ${escapeHTML(order.expiresOn || '—')}` : `${Number(order.hours || 0)} hour visit · Drop-off ${escapeHTML(order.dropoffTime || '—')} · Pick-up ${escapeHTML(order.pickupTime || '—')}${order.passName ? ` · Pass ${escapeHTML(order.passName)}` : ''}`}</p>${order.addOns?.length ? `<p class="my-order-extra">Care: ${order.addOns.map((item) => escapeHTML(item.name)).join(', ')}</p>` : ''}` : '';
    const taxiEnabled = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
    const taxiProgress = order.taxiProgress?.status || 'Scheduled';
    const taxiCheckInHref = `#check-in?order=${encodeURIComponent(`${order.serviceId}:${order.id}`)}`;
    const inTransit = customerOrderStatus(order) === 'Pet Taxi Delivering...'
      && ['Picked Up', 'Returning to Customer'].includes(taxiProgress);
    const taxiLocationContent = inTransit
      ? `<div class="live-driver-location" data-live-driver-location data-order-key="${escapeHTML(order._storageKey || '')}" data-order-id="${escapeHTML(order.id)}"><p class="live-driver-location-waiting">Waiting for the driver to share their location…</p></div>`
      : '<small>Live map appears while the driver is travelling to or from the outlet.</small>';
    const taxiTracking = taxiEnabled ? `<section class="my-order-taxi-tracking"><strong>Pet Taxi · ${escapeHTML(taxiProgress)}</strong>${taxiLocationContent}${taxiProgress !== 'Completed' ? `<a href="${taxiCheckInHref}">Open Pet Taxi QR code</a>` : ''}</section>` : '';
    const reference = order.reference || order.id || '';
    const date = formatOrderDate(order.dateLabel);
    const orderDetails = orderDetailRows(order);
    const petsDetails = orderPetCards(order);
    const cancelAction = canCancelServiceOrder(order) ? `<button class="button button-light my-order-cancel" type="button" data-cancel-customer-order="${escapeHTML(order.serviceId)}|${escapeHTML(order._storageKey)}|${escapeHTML(order.id)}">Cancel Booking</button>` : '';
    const receiptAction = order.receipt?.data
      ? `<a class="button button-primary my-order-receipt-button" href="${escapeHTML(order.receipt.data)}" download="${escapeHTML(order.receipt.name || 'receipt')}">Download Receipt</a>`
      : `<button class="button button-light my-order-receipt-button" type="button" data-show-receipt-message>Download Receipt</button><p class="my-order-receipt-empty" data-receipt-unavailable-message hidden>Your receipt will be available to download once the outlet has received your order.</p>`;
    return `<details class="my-order-card"><summary class="my-order-card-summary"><div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(serviceName)}</span><b class="my-order-status ${isCanceled ? 'is-canceled' : statusCategory(statusLabel) === 'completed' ? 'is-complete' : ''}">${escapeHTML(statusLabel)}</b></div><h2>${escapeHTML(order.title)}</h2><p class="my-order-summary">${escapeHTML(summary)}</p><div class="my-order-card-bottom"><small>${[reference, date].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${order.totalAmount.toFixed(2)}</strong></div><span class="my-order-expand-hint">View Order Details <span aria-hidden="true">⌄</span></span></summary><div class="my-order-expanded"><dl class="my-order-detail-list">${orderDetails}</dl>${petsDetails}${marketplaceDetails}${groomingDetails}${hotelDetails}${daycareDetails}${taxiTracking}${receiptAction}${order.trackingUrl ? `<a class="my-order-tracking" href="${escapeHTML(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track Delivery</a>` : ''}${cancelAction}</div></details>`;
  };

  const groups = service === 'all'
    ? visibleOrders.length ? visibleOrders.map(orderCard).join('') : `<section class="my-orders-empty"><h2>No Orders Found</h2><p>Your orders will appear here.</p></section>`
    : visibleOrders.length ? visibleOrders.map(orderCard).join('') : `<section class="my-orders-empty"><h2>No ${orderServices.find((item) => item.id === service)?.label || ''} Orders Found</h2><p>Try another service or status filter.</p></section>`;

  return `<main class="my-orders-page"><header class="my-orders-header"><a href="#${encodeURIComponent(returnTo)}" aria-label="Back">‹</a><h1>My Orders</h1><span aria-hidden="true"></span></header><nav class="my-orders-tabs" aria-label="Filter orders by service">${serviceTabs}</nav><nav class="my-orders-status-tabs" aria-label="Filter orders by status">${statusTabs}</nav><p class="my-orders-count">${visibleOrders.length} ${visibleOrders.length === 1 ? 'order' : 'orders'}</p><div class="my-orders-content">${groups}</div>${bottomNavigation('activity', icon)}</main>`;
}

// Customer cancellation follows the existing seven-day cutoff and refunds the paid total to Furgo Credit.
export function setupMyOrders() {
  myOrderLocationCleanups.forEach((cleanup) => cleanup());
  myOrderLocationCleanups = document.querySelector('.my-orders-page')
    ? [...document.querySelectorAll('[data-live-driver-location]')].map(mountDriverLocation)
    : [];
  if (document.documentElement.dataset.customerOrderCancellationReady === 'true') return;
  document.documentElement.dataset.customerOrderCancellationReady = 'true';
  document.addEventListener('click', async (event) => {
    const receiptButton = event.target.closest('[data-show-receipt-message]');
    if (receiptButton) {
      const message = receiptButton.closest('.my-order-expanded')?.querySelector('[data-receipt-unavailable-message]');
      if (message) message.hidden = false;
      return;
    }
    const button = event.target.closest('[data-cancel-customer-order]');
    if (!button) return;
    const [serviceId, key, id] = button.dataset.cancelCustomerOrder.split('|');
    let records;
    try { records = JSON.parse(localStorage.getItem(key) || '[]'); } catch { records = []; }
    const order = Array.isArray(records) ? records.find((item) => String(item.id) === id) : null;
    if (!order) { window.alert('This booking could not be found. Refresh My Orders and try again.'); return; }
    const decorated = { ...order, serviceId };
    if (!canCancelServiceOrder(decorated)) { window.alert('This booking can no longer be cancelled online. Cancellations are available at least 7 days before the service date.'); window.dispatchEvent(new Event('hashchange')); return; }
    const refund = Number(order.total || order.totalAmount || 0);
    if (!window.confirm(`Cancel this booking? MYR ${refund.toFixed(2)} will be returned to your Furgo Credit balance.`)) return;
    const previousStatus = customerOrderStatus(order);
    const changedAt = new Date().toISOString();
    order.status = 'Cancelled';
    order.adminStatus = 'Cancelled';
    order.paymentStatus = 'Refunded to Furgo Credit';
    order.cancelledAt = changedAt;
    order.statusHistory = [...(order.statusHistory || []), { status: 'Cancelled', previousStatus, changedAt, changedBy: 'Customer', refundAmount: refund }];
    button.disabled = true;
    try {
      await saveOrderRecords(key, order, records);
      if (refund > 0) {
        const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0) + refund;
        const transactions = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]'); } catch { return []; } })();
        transactions.unshift({ id: `refund-${order.id}-${Date.now()}`, type: 'Order cancellation refund', label: `Refund for ${order.reference || order.id}`, amount: refund, timestamp: changedAt, date: new Date(changedAt).toLocaleDateString() });
        localStorage.setItem('furgo-demo-credit-balance', balance.toFixed(2));
        localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
      }
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      button.disabled = false;
      window.alert(`The cancellation could not be synced: ${error.message}`);
    }
  });
}
