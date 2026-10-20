import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadMarketplaceOrders } from './marketplace-data.js';
import { loadGroomingBookings } from './grooming-data.js';
import { driverLocationForOrder } from './driver.js';

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

// Formats saved ISO timestamps and prototype date strings for compact order cards.
function formatOrderDate(value = '') {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
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
    _storageKey: 'furgo-demo-grooming-bookings',
    totalAmount: Number(order.total) || 0,
  }));
  const hotels = loadLocalOrders('furgo-demo-hotel-bookings', ['furgo-demo-pet-hotel-bookings', 'furgo-demo-hotel-orders']).filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order, serviceId: 'hotel', serviceLabel: 'Pet Hotel',
    _storageKey: 'furgo-demo-hotel-bookings',
    title: order.petName ? `${order.petName} · Pet Hotel` : order.reference ? `Stay ${order.reference}` : 'Pet Hotel booking',
    summary: [order.checkIn || order.startDate, order.checkOut || order.endDate, order.outlet].filter(Boolean).join(' · '),
    dateLabel: order.createdAt || order.checkIn || order.startDate || '', totalAmount: Number(order.total) || 0,
  }));
  const daycare = loadLocalOrders('furgo-demo-daycare-bookings', ['furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders']).filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order, serviceId: 'daycare', serviceLabel: 'Pet Daycare',
    _storageKey: 'furgo-demo-daycare-bookings',
    title: order.type === 'pass-purchase' ? `${order.planName || 'Daycare Pass'} · ${order.petName || 'Pet'}` : order.petName ? `${order.petName} · Pet Daycare` : order.reference ? `Daycare ${order.reference}` : 'Pet Daycare booking',
    summary: order.type === 'pass-purchase' ? `${Number(order.sessions || 0)} sessions · valid through ${order.expiresOn || 'expiry not set'}` : [order.date, order.time, order.outlet, order.passName ? `Pass · ${order.passName}` : ''].filter(Boolean).join(' · '),
    dateLabel: order.createdAt || order.date || '', totalAmount: Number(order.total) || 0,
  }));

  const allOrders = [...marketplace, ...grooming, ...hotels, ...daycare].sort((a, b) => new Date(b.createdAt || b.dateLabel) - new Date(a.createdAt || a.dateLabel));
  const serviceOrders = allOrders.filter((order) => service === 'all' || order.serviceId === service);
  const visibleOrders = serviceOrders.filter((order) => status === 'all' || statusCategory(order.status) === status);
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const tabHref = (nextService, nextStatus) => `#orders?service=${encodeURIComponent(nextService)}&status=${encodeURIComponent(nextStatus)}&from=${encodeURIComponent(returnTo)}`;
  const serviceTabs = orderServices.map((item) => {
    const count = item.id === 'all' ? allOrders.length : allOrders.filter((order) => order.serviceId === item.id).length;
    return `<a class="my-orders-tab ${service === item.id ? 'is-active' : ''}" href="${tabHref(item.id, status)}" ${service === item.id ? 'aria-current="page"' : ''}>${item.label}<span>${count}</span></a>`;
  }).join('');
  const statusTabs = orderStatuses.map((item) => `<a class="my-orders-status-tab ${status === item.id ? 'is-active' : ''}" href="${tabHref(service, item.id)}" ${status === item.id ? 'aria-current="page"' : ''}>${item.label}</a>`).join('');

  const orderCard = (order) => {
    const serviceName = order.serviceLabel;
    const isCanceled = statusCategory(order.status) === 'canceled';
    const statusLabel = order.status || 'Pending';
    const summary = order.summary || order.description || 'Order details will appear here.';
    const marketplaceDetails = order.serviceId === 'marketplace' && order.trackingNumber
      ? `<p class="my-order-extra">${escapeHTML(order.courier || 'Courier')}: ${escapeHTML(order.trackingNumber)}</p>` : '';
    const groomingDetails = order.serviceId === 'grooming' && order.includeTaxi
      ? `<p class="my-order-extra">Pet taxi: ${escapeHTML(order.taxiSchedule || 'Pickup time pending')} · MYR ${Number(order.taxiTotal || 0).toFixed(2)}</p>` : '';
    const hotelDetails = order.serviceId === 'hotel'
      ? `${order.roomName ? `<p class="my-order-extra">${escapeHTML(order.roomName)} · ${Number(order.nights || 0)} night(s) · ${escapeHTML(order.outlet || '')}</p>` : ''}${order.mediaLogs?.length ? `<div class="my-order-media-feed"><strong>My Stay · Care updates</strong>${order.mediaLogs.map((entry) => entry.type?.startsWith('video/') ? `<video controls preload="metadata" src="${escapeHTML(entry.data)}" aria-label="Pet Hotel update from ${escapeHTML(entry.date || '')}"></video>` : `<a href="${escapeHTML(entry.data)}" target="_blank" rel="noopener"><img src="${escapeHTML(entry.data)}" alt="Pet Hotel care update from ${escapeHTML(entry.date || '')}" loading="lazy" /><span>${escapeHTML(entry.date || '')} · ${escapeHTML(entry.name)}</span></a>`).join('')}</div>` : ''}` : '';
    const daycareDetails = order.serviceId === 'daycare' ? `<p class="my-order-extra">${order.type === 'pass-purchase' ? `${Number(order.sessions || 0)} sessions · valid through ${escapeHTML(order.expiresOn || '—')}` : `${Number(order.hours || 0)} hour visit · Drop-off ${escapeHTML(order.dropoffTime || '—')} · Pick-up ${escapeHTML(order.pickupTime || '—')}${order.passName ? ` · Pass ${escapeHTML(order.passName)}` : ''}`}</p>${order.addOns?.length ? `<p class="my-order-extra">Care: ${order.addOns.map((item) => escapeHTML(item.name)).join(', ')}</p>` : ''}` : '';
    const taxiEnabled = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
    const taxiLocation = taxiEnabled && order._storageKey ? driverLocationForOrder(order._storageKey, order.id) : null;
    const taxiMapLink = taxiLocation && Number.isFinite(Number(taxiLocation.latitude)) && Number.isFinite(Number(taxiLocation.longitude))
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(taxiLocation.latitude)}&mlon=${encodeURIComponent(taxiLocation.longitude)}#map=16/${encodeURIComponent(taxiLocation.latitude)}/${encodeURIComponent(taxiLocation.longitude)}` : '';
    const taxiProgress = order.taxiProgress?.status || 'Scheduled';
    const taxiCheckInHref = `#check-in?order=${encodeURIComponent(`${order.serviceId}:${order.id}`)}`;
    const taxiTracking = taxiEnabled ? `<section class="my-order-taxi-tracking"><strong>Pet Taxi · ${escapeHTML(taxiProgress)}</strong>${taxiMapLink ? `<a href="${taxiMapLink}" target="_blank" rel="noopener noreferrer">View driver’s latest location</a><small>Updated ${escapeHTML(new Date(taxiLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</small>` : '<small>Driver location will appear here after the trip starts.</small>'}${taxiProgress !== 'Dropped Off' ? `<a href="${taxiCheckInHref}">Open Pet Taxi QR code</a>` : ''}</section>` : '';
    const reference = order.reference || order.id || '';
    const date = formatOrderDate(order.dateLabel);
    return `<article class="my-order-card"><div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(serviceName)}</span><b class="my-order-status ${isCanceled ? 'is-canceled' : statusCategory(statusLabel) === 'completed' ? 'is-complete' : ''}">${escapeHTML(statusLabel)}</b></div><h2>${escapeHTML(order.title)}</h2><p class="my-order-summary">${escapeHTML(summary)}</p><div class="my-order-card-bottom"><small>${[reference, date].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${order.totalAmount.toFixed(2)}</strong></div>${marketplaceDetails}${groomingDetails}${hotelDetails}${daycareDetails}${taxiTracking}${order.receipt ? `<a class="my-order-tracking" href="${escapeHTML(order.receipt.data)}" download="${escapeHTML(order.receipt.name || 'receipt')}">View / download receipt or invoice</a>` : ''}${order.trackingUrl ? `<a class="my-order-tracking" href="${escapeHTML(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track delivery</a>` : ''}</article>`;
  };

  const groups = service === 'all'
    ? orderServices.filter((item) => item.id !== 'all').map((item) => {
      const orders = visibleOrders.filter((order) => order.serviceId === item.id);
      return `<section class="my-orders-group"><div class="my-orders-group-heading"><h2>${item.label}</h2><span>${orders.length} ${orders.length === 1 ? 'order' : 'orders'}</span></div>${orders.length ? orders.map(orderCard).join('') : `<p class="my-orders-empty-category">No ${item.label.toLowerCase()} orders here yet.</p>`}</section>`;
    }).join('')
    : visibleOrders.length ? visibleOrders.map(orderCard).join('') : `<section class="my-orders-empty"><h2>No ${orderServices.find((item) => item.id === service)?.label || ''} orders found</h2><p>Try another service or status filter.</p></section>`;

  return `<main class="my-orders-page"><header class="my-orders-header"><a href="#${encodeURIComponent(returnTo)}" aria-label="Back">‹</a><h1>My Orders</h1><span aria-hidden="true"></span></header><nav class="my-orders-tabs" aria-label="Filter orders by service">${serviceTabs}</nav><nav class="my-orders-status-tabs" aria-label="Filter orders by status">${statusTabs}</nav><p class="my-orders-count">${visibleOrders.length} ${visibleOrders.length === 1 ? 'order' : 'orders'}</p><div class="my-orders-content">${groups}</div>${bottomNavigation('activity', icon)}</main>`;
}
