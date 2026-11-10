import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadMarketplaceOrders, loadMarketplaceProducts, loadMarketplaceSuppliers, marketplaceProductsKey, safeMarketplaceImage } from './marketplace-data.js';
import { loadGroomingBookings } from './grooming-data.js';
import { mountDriverLocation } from './driver-location.js';
import { cacheSyncedRecords } from '../app-data-sync.js';
import { marketplaceOrdersKey } from './marketplace-data.js';
import { groomingBookingsKey } from './grooming-data.js';
import { hotelBookingsKey } from './hotel-data.js';
import { daycareBookingsKey, daycarePassesKey } from './daycare-data.js';
import { customerOrderStatus, marketplaceShipmentSummary, statusCategory } from '../order-status.js';
import { petProfilesStorageKeyForCurrentUser } from './home.js';
import { supabase } from '../supabase.js';

const orderServices = [
  { id: 'all', label: 'All' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'grooming', label: 'Grooming' },
  { id: 'hotel', label: 'Pet Hotel' },
  { id: 'daycare', label: 'Pet Daycare' },
];
const orderServiceIcons = {
  marketplace: 'MVP Icon-01.png',
  grooming: 'MVP Icon-02.png',
  daycare: 'MVP Icon-03.png',
  hotel: 'MVP Icon-04.png',
};
const orderStatuses = [
  { id: 'new', label: 'New Order' },
  { id: 'progressing', label: 'Progressing Order' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'returns', label: 'Return or Refund' },
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
function canCancelServiceOrder(order) {
  if (!['grooming', 'hotel', 'daycare'].includes(order.serviceId) || order.type === 'pass-purchase') return false;
  if (statusCategory(customerOrderStatus(order)) !== 'active') return false;
  if (order.receipt) return false;
  const statuses = [customerOrderStatus(order), order.status, order.adminStatus].filter(Boolean).join(' ').toLowerCase();
  return !/(received order|in progress|pet taxi|checked.?in|service complete|completed|no.?show|cancel|checked.?out)/.test(statuses);
}

// Marketplace orders may be cancelled only before Furgo confirms receipt or a supplier ships.
function canCancelMarketplaceOrder(order) {
  if (order.serviceId !== 'marketplace' || statusCategory(customerOrderStatus(order)) === 'canceled') return false;
  if (order.receipt || order.adminReceiptUploadedAt) return false;
  const shipments = Object.values(order.supplierShipments || {});
  if (shipments.some((shipment) => ['shipped', 'delivered', 'in transit'].includes(String(shipment?.status || '').toLowerCase()))) return false;
  if (/received order|shipped|delivered|completed/i.test(String(order.status || ''))) return false;
  return true;
}

function hasReturnOrRefund(order) {
  const hasItemReturn = order.serviceId === 'marketplace' && (order.items || []).some((item) => item?.returnRequest);
  const refundStatus = String(order.refundStatus || '').trim().toLowerCase();
  return hasItemReturn || Boolean(refundStatus && !['not required', 'none'].includes(refundStatus));
}

function isProgressingOrder(order) {
  const statuses = [customerOrderStatus(order), order.status, order.adminStatus].filter(Boolean).join(' ').toLowerCase();
  return /(checked.?in|pet taxi|service complete|in progress|shipped|in transit|out for delivery)/.test(statuses);
}

function matchesOrderStatusTab(order, tab) {
  const category = statusCategory(customerOrderStatus(order));
  if (tab === 'returns') return hasReturnOrRefund(order);
  if (tab === 'cancelled') return category === 'canceled' && !hasReturnOrRefund(order);
  if (tab === 'completed') return category === 'completed' || category === 'no-show';
  if (tab === 'progressing') return category === 'active' && isProgressingOrder(order);
  return category === 'active' && !isProgressingOrder(order);
}

function onlinePaymentActions(order) {
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const paid = /paid|successful|succeeded|completed/.test(paymentStatus);
  const deadline = order.paymentDeadlineAt ? new Date(order.paymentDeadlineAt) : null;
  const pendingPayment = paymentStatus === 'pending payment' && deadline && !Number.isNaN(deadline.getTime()) && deadline.getTime() > Date.now();
  const onlinePaymentAction = pendingPayment
    ? `<div class="marketplace-online-payment"><strong>Payment due in <span data-payment-countdown="${escapeHTML(deadline.toISOString())}">—</span></strong><small>Payment has not completed yet; this does not mean it failed.</small><button class="button button-primary" type="button" data-complete-online-payment="${escapeHTML(order.serviceId)}|${escapeHTML(order.id)}">Retry Payment</button><small>Demo payment only. No charge is made in this prototype.</small></div>`
    : '';
  const refundMarkup = order.refundStatus
    ? `<p class="marketplace-cancellation-refund"><strong>Refund status: ${escapeHTML(order.refundStatus)}</strong>${Number(order.refundAmount) > 0 ? ` · MYR ${Number(order.refundAmount).toFixed(2)} to your original payment method` : ''}</p>`
    : '';
  const cancellationMarkup = order.cancellationReason || order.customerCancellationReason
    ? `<p class="marketplace-payment-pending"><strong>Cancellation reason:</strong> ${escapeHTML(order.customerCancellationReason || order.cancellationReason)}</p>`
    : '';
  const failedPaymentMarkup = paymentStatus === 'failed payment'
    ? '<p class="marketplace-payment-pending"><strong>Payment failed.</strong> The one-hour payment window expired, so this order was cancelled. Place a new order to try again.</p>'
    : '';
  const retryMarkup = order.serviceId === 'marketplace' && /payment rejected|failed payment/.test(paymentStatus) && /bank transfer|manual/i.test(String(order.paymentMethod || '')) && statusCategory(customerOrderStatus(order)) !== 'canceled'
    ? `<form class="marketplace-payment-retry" data-retry-marketplace-payment="${escapeHTML(order.id)}"><strong>Payment needs attention</strong><p>${escapeHTML(order.paymentRejectionReason || 'Upload a new bank transfer slip to retry payment.')}</p><label>New transfer slip<input type="file" name="transferSlip" accept="image/png,image/jpeg,image/webp,application/pdf" required /></label><button class="button button-primary" type="submit">Resubmit Payment</button><span data-payment-retry-feedback role="status" aria-live="polite"></span></form>`
    : '';
  const transferPending = order.paymentStatus === 'Pending Payment Verification'
    ? '<p class="marketplace-payment-pending">Your transfer slip is awaiting verification. Furgo will confirm your order after payment is approved.</p>'
    : '';
  return `${refundMarkup}${cancellationMarkup}${failedPaymentMarkup}${onlinePaymentAction}${transferPending}${retryMarkup}${paid && !order.refundStatus && statusCategory(customerOrderStatus(order)) === 'canceled' ? '<p class="marketplace-cancellation-refund">Your cancellation is being reviewed for a refund to the original payment method.</p>' : ''}`;
}

function marketplaceCancelControl(order) {
  return canCancelMarketplaceOrder(order)
    ? `<button class="marketplace-cancel-order" type="button" data-cancel-marketplace-order="${escapeHTML(order.id)}">Cancel Order</button>`
    : '';
}

const marketplaceCancelReasons = [
  'Changed my mind',
  'Ordered the wrong product',
  'Ordered the wrong quantity',
  'Found a better option',
  'Delivery details are incorrect',
  'I placed this order by mistake',
  'Other',
];

function marketplaceCancelDialog() {
  return `<dialog class="marketplace-cancel-dialog" data-marketplace-cancel-dialog aria-labelledby="marketplace-cancel-title"><form data-marketplace-cancel-form><header><span data-marketplace-cancel-kind>Marketplace order</span><h2 id="marketplace-cancel-title">Are you sure you want to cancel this order?</h2></header><fieldset><legend>Please choose a reason</legend>${marketplaceCancelReasons.map((reason, index) => `<label class="marketplace-cancel-reason"><input type="radio" name="reason" value="${escapeHTML(reason)}" ${index === 0 ? 'required' : ''} /><span>${escapeHTML(reason)}</span></label>`).join('')}<label class="marketplace-cancel-other" data-marketplace-cancel-other hidden><span>Tell us the reason</span><textarea name="otherReason" rows="3" maxlength="500" placeholder="Enter your reason"></textarea></label></fieldset><p class="marketplace-cancel-dialog-note" data-marketplace-cancel-note></p><p class="marketplace-cancel-error" data-marketplace-cancel-error role="alert" hidden></p><div class="marketplace-cancel-dialog-actions"><button class="button button-light" type="button" data-close-marketplace-cancel>Keep Order</button><button class="button button-primary" type="submit">Confirm Cancel</button></div></form></dialog>`;
}

function openServiceCancelDialog(dialog, { order, serviceId, key }) {
  const form = dialog?.querySelector('[data-marketplace-cancel-form]');
  if (!dialog || !form) return;
  form.reset();
  form.querySelector('[data-marketplace-cancel-other]').hidden = true;
  form.elements.otherReason.required = false;
  form.querySelector('[data-marketplace-cancel-error]').hidden = true;
  dialog.dataset.orderType = 'service';
  dialog.dataset.orderId = String(order.id);
  dialog.dataset.serviceId = serviceId;
  dialog.dataset.storageKey = key;
  form.querySelector('[data-marketplace-cancel-kind]').textContent = `${order.serviceLabel || serviceId} booking`;
  form.querySelector('#marketplace-cancel-title').textContent = 'Are you sure you want to cancel this booking?';
  const paid = /paid|successful|succeeded|credit|receipt uploaded/.test(String(order.paymentStatus || '').toLowerCase());
  const refund = Number(order.total || order.totalAmount || 0);
  form.querySelector('[data-marketplace-cancel-note]').textContent = paid
    ? `After confirmation, MYR ${refund.toFixed(2)} will be returned to your Furgo Credit balance.`
    : 'This booking has not been paid. Confirming will cancel it without a refund.';
  dialog.showModal();
}

function marketplaceReturnSection(order, products = loadMarketplaceProducts(), receiptAction = '') {
  const grouped = new Map();
  (order.items || []).forEach((item) => {
    const product = products.find((entry) => String(entry.id) === String(item.productId || ''));
    const variant = product?.variants?.find((entry) => String(entry.id) === String(item.variantId || ''));
    const supplier = String(item.supplierId || item.supplier || item.shopName || variant?.supplierId || variant?.supplier || product?.supplierName || 'Shop details unavailable').trim();
    if (!grouped.has(supplier)) grouped.set(supplier, []);
    grouped.get(supplier).push(item);
  });
  return `<section class="my-order-marketplace-lines"><h3>Products Purchased &amp; Delivery</h3><div class="marketplace-order-reference-row"><p class="marketplace-order-reference">Order No: ${escapeHTML(order.reference || order.id || '')}</p><div class="marketplace-receipt-control">${receiptAction}</div></div>${[...grouped.entries()].map(([supplier, items]) => {
    const shipment = order.supplierShipments?.[supplier.toLowerCase()] || Object.entries(order.supplierShipments || {}).find(([key, value]) => key.toLowerCase() === supplier.toLowerCase() || String(value?.supplierName || '').toLowerCase() === supplier.toLowerCase())?.[1] || {};
    const deliveredAt = shipment.deliveredAt ? new Date(shipment.deliveredAt) : null;
    const returnWindowOpen = shipment.status === 'Delivered' && deliveredAt && !Number.isNaN(deliveredAt.getTime()) && Date.now() <= deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000;
    const trackingMarkup = marketplaceTrackingForSupplier(shipment);
    return `<section class="my-order-supplier-group"><header><strong>Shop: ${escapeHTML(supplier)}</strong><span>${escapeHTML(shipment.status || 'Preparing order')}</span></header>${items.map((item) => {
      const line = Number(item.lineNumber);
      const returnRequest = item.returnRequest;
      const statusMarkup = returnRequest
        ? `<div class="my-order-return-status"><strong>Return status: ${escapeHTML(returnRequest.status)}</strong><span>Refund amount: MYR ${Number(returnRequest.refundAmount || 0).toFixed(2)} (product MYR ${Number(returnRequest.paidAmount || 0).toFixed(2)} + shipping MYR ${Number(returnRequest.shippingRefund || 0).toFixed(2)})</span>${returnRequest.supplierResponse ? `<span>${escapeHTML(returnRequest.supplierResponse)}</span>` : ''}${returnRequest.decisionReason ? `<span>Review decision: ${escapeHTML(returnRequest.decisionReason)}</span>` : ''}</div>`
        : returnWindowOpen && Number.isInteger(line) ? `<button class="button button-light my-order-return-open" type="button" data-open-marketplace-return data-order-id="${escapeHTML(order.id)}" data-line-number="${line}">Request Return &amp; Refund</button><form class="my-order-return-form" data-marketplace-return-form data-order-id="${escapeHTML(order.id)}" data-line-number="${line}" hidden><label>Reason for return<textarea name="reason" maxlength="2000" required></textarea></label><label>Product photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></label><small>One clear product photo, up to 5 MB. Your return request is available for 7 days after delivery.</small><button class="button button-primary" type="submit">Submit Return Request</button><span data-marketplace-return-feedback role="status" aria-live="polite"></span></form>`
        : shipment.status === 'Delivered' ? '<small class="my-order-return-expired">The 7-day return window has ended.</small>' : '';
      const product = products.find((entry) => String(entry.id) === String(item.productId || ''));
      const imageSources = [
        ...(Array.isArray(item.images) ? item.images : item.image ? [item.image] : []),
        ...(Array.isArray(product?.images) ? product.images : []),
        item.imageUrl,
        product?.imageUrl,
      ];
      const productImage = imageSources.map(safeMarketplaceImage).find(Boolean);
      const imageMarkup = productImage
        ? `<img class="my-order-product-image" src="${escapeHTML(productImage)}" alt="${escapeHTML(item.name || 'Product')}" loading="lazy" />`
        : `<span class="my-order-product-image is-placeholder" aria-hidden="true">${escapeHTML(product?.emoji || '🐾')}</span>`;
      return `<article class="my-order-marketplace-line">${imageMarkup}<div class="my-order-marketplace-copy"><strong>${escapeHTML(item.name || product?.name || 'Product')}</strong><span>${escapeHTML(item.variantLabel || 'Variant')} × ${Number(item.quantity) || 1}</span><b>MYR ${Number(item.paidAmount ?? item.total ?? 0).toFixed(2)}</b></div>${statusMarkup}</article>`;
    }).join('')}${trackingMarkup}</section>`;
  }).join('')}</section>`;
}

function marketplaceOrderPreview(order, products) {
  const item = order.items?.[0];
  if (!item) return '<div class="marketplace-order-preview">Marketplace order</div>';
  const product = products.find((entry) => String(entry.id) === String(item.productId || ''));
  const imageSources = [
    ...(Array.isArray(item.images) ? item.images : item.image ? [item.image] : []),
    ...(Array.isArray(product?.images) ? product.images : []),
    item.imageUrl,
    product?.imageUrl,
  ];
  const image = imageSources.map(safeMarketplaceImage).find(Boolean);
  const imageMarkup = image
    ? `<img class="marketplace-order-preview-image" src="${escapeHTML(image)}" alt="${escapeHTML(item.name || product?.name || 'Product')}" loading="lazy" />`
    : `<span class="marketplace-order-preview-image is-placeholder" aria-hidden="true">${escapeHTML(product?.emoji || '🐾')}</span>`;
  const additionalProducts = Math.max(0, order.items.length - 1);
  const quantity = Number(item.quantity) || 1;
  const amount = Number(item.paidAmount ?? item.total ?? (Number(item.unitPrice) || 0) * quantity);
  return `<div class="marketplace-order-preview"><span>${imageMarkup}<span class="marketplace-order-preview-copy"><strong>${escapeHTML(item.name || product?.name || 'Product')}</strong><span class="marketplace-order-preview-detail"><span>${escapeHTML(item.variantLabel || 'Variant')} × ${quantity}</span><b>MYR ${amount.toFixed(2)}</b></span></span></span>${additionalProducts ? `<small class="marketplace-order-more">and ${additionalProducts} ${additionalProducts === 1 ? 'Product' : 'Products'} More</small>` : ''}</div>`;
}

function marketplaceTrackingForSupplier(shipment = {}) {
  if (!shipment || typeof shipment !== 'object') shipment = {};
  const isShipped = ['shipped', 'delivered'].includes(String(shipment.status || '').toLowerCase());
  const supplierTrackingUrl = validTrackingUrl(shipment.trackingUrl);
  const trackingUrl = supplierTrackingUrl || courierTrackingPage(shipment.courier);
  const copyTrackingNumber = !supplierTrackingUrl && shipment.trackingNumber;
  const courierDetails = `Courier: ${shipment.courier || '—'} · Tracking Number: ${shipment.trackingNumber || '—'}`;
  const canTrack = isShipped && Boolean(trackingUrl);
  const trackingMessage = isShipped ? courierDetails : 'Tracking details will appear after this shop ships the product.';
  const button = canTrack
    ? `<a class="marketplace-order-track-button" href="${escapeHTML(trackingUrl)}" data-track-order ${copyTrackingNumber ? `data-copy-tracking-number="${escapeHTML(shipment.trackingNumber)}"` : ''}>Track Order</a>`
    : '<button class="marketplace-order-track-button" type="button" disabled>Track Order</button>';
  return `<section class="marketplace-order-tracking ${canTrack ? '' : 'is-pending'}"><h3>Delivery Tracking</h3><div class="marketplace-order-tracking-row"><span>${escapeHTML(trackingMessage)}</span>${button}</div></section>`;
}

function courierTrackingPage(courier) {
  const name = String(courier || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (name.includes('spx') || name.includes('shopeeexpress')) return 'https://spx.com.my/en';
  if (name.includes('jtexpress') || name === 'jt') return 'https://jtexpress.my/tracking/';
  if (name.includes('poslaju') || name.includes('posmalaysia')) return 'https://tracking.pos.com.my/tracking';
  if (name.includes('ninjavan')) return 'https://www.ninjavan.co/en-my/tracking';
  if (name.includes('gdex') || name.includes('gdexpress')) return 'https://gdexpress.com/tracking/';
  if (name.includes('citylink')) return 'https://www.citylinkexpress.com/track-your-shipment/';
  if (name.includes('abx')) return 'https://www.abxexpress.com.my/tracking';
  if (name.includes('bestexpress') || name.includes('bestcargo')) return 'https://www.best-inc.my/track';
  if (name.includes('dhl')) return 'https://www.dhl.com/my-en/home/tracking.html';
  if (name.includes('fedex')) return 'https://www.fedex.com/en-my/tracking.html';
  return name ? 'https://www.tracking.my/' : '';
}

function validTrackingUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

// Formats saved ISO timestamps and prototype date strings for compact order cards.
function formatOrderDate(value = '') {
  if (!value) return '';
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const dayFirstDate = String(value).match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dayFirstDate) {
    const [, day, month, year] = dayFirstDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatOrderDateTime(value = '') {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatOrderDate(value);
  return parsed.toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    const saved = JSON.parse(localStorage.getItem(petProfilesStorageKeyForCurrentUser()) || '[]');
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
  const addOns = Array.isArray(order.addOns)
    ? order.addOns.map((item) => typeof item === 'string' ? item : item.name).filter(Boolean).join(', ')
    : '';
  const payment = [order.paymentStatus, order.paymentMethod, order.paymentReference && `Ref ${order.paymentReference}`].filter(Boolean).join(' · ');
  const total = Number(order.totalAmount ?? order.total);
  const rows = [
    [order.serviceId === 'marketplace' ? '' : 'Service', order.serviceId === 'marketplace' ? '' : order.serviceLabel],
    [order.serviceId === 'marketplace' ? '' : 'Appointment', order.serviceId === 'marketplace' ? '' : appointment || order.summary],
    ['Add-On Services', addOns],
    ['Pet Taxi', order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff ? [order.taxiSchedule, order.taxi?.pickup, order.taxi?.dropoff].filter(Boolean).join(' · ') || 'Included' : ''],
    ['Payment', payment],
    ['Refund Status', order.refundStatus],
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

  const requestedServices = (routeParams.get('service') || 'all').split(',').filter((id) => orderServices.some((item) => item.id === id && id !== 'all'));
  const selectedServices = requestedServices.length ? [...new Set(requestedServices)] : [];
  const service = selectedServices.length ? selectedServices.join(',') : 'all';
  const serviceName = selectedServices.length ? selectedServices.map((id) => orderServices.find((item) => item.id === id)?.label).filter(Boolean).join(', ') : 'All';
  const status = orderStatuses.some((item) => item.id === routeParams.get('status')) ? routeParams.get('status') : 'new';
  const returnTo = ['home', 'marketplace', 'grooming', 'hotel', 'daycare', 'profile'].includes(routeParams.get('from')) ? routeParams.get('from') : 'home';
  const marketplace = loadMarketplaceOrders().filter((order) => belongsToCurrentUser(order, profile)).map((order) => ({
    ...order,
    serviceId: 'marketplace',
    _storageKey: marketplaceOrdersKey,
    serviceLabel: 'Marketplace',
    title: order.reference ? `Order ${order.reference}` : 'Marketplace order',
    summary: (order.items || []).map((item) => `${item.name || 'Product'} × ${Number(item.quantity) || 1}`).join(', ') || 'Marketplace purchase',
    dateLabel: order.createdAt || order.date || '',
    totalAmount: Number(order.total) || 0,
  }));
  const marketplaceProducts = loadMarketplaceProducts();
  const marketplaceSuppliers = loadMarketplaceSuppliers(marketplaceProducts);
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
  const serviceOrders = allOrders.filter((order) => !selectedServices.length || selectedServices.includes(order.serviceId));
  const visibleOrders = serviceOrders.filter((order) => matchesOrderStatusTab(order, status));
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const tabHref = (nextService, nextStatus) => `#orders?service=${encodeURIComponent(nextService)}&status=${encodeURIComponent(nextStatus)}&from=${encodeURIComponent(returnTo)}`;
  const serviceFilter = `<div class="my-orders-service-filter"><button class="my-orders-service-filter-trigger" type="button" data-my-orders-filter-toggle aria-expanded="false" aria-controls="my-orders-service-filter-panel" aria-label="Filter orders by service"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4" /></svg><span class="my-orders-filter-badge" data-my-orders-filter-badge ${selectedServices.length ? '' : 'hidden'}>${selectedServices.length}</span></button><div class="my-orders-service-filter-panel" id="my-orders-service-filter-panel" data-my-orders-filter-panel hidden><strong>Filter by service</strong><label><input type="checkbox" data-order-service-option="all" ${selectedServices.length ? '' : 'checked'} />All</label>${orderServices.filter((item) => item.id !== 'all').map((item) => `<label><input type="checkbox" data-order-service-option="${item.id}" ${selectedServices.includes(item.id) ? 'checked' : ''} />${item.label}</label>`).join('')}<button class="button button-primary" type="button" data-my-orders-filter-apply>Apply Filters</button></div></div>`;
  const statusTabs = orderStatuses.map((item) => `<a class="my-orders-status-tab ${status === item.id ? 'is-active' : ''}" href="${tabHref(service, item.id)}" ${status === item.id ? 'aria-current="page"' : ''}>${item.label}</a>`).join('');
  const orderCount = `${visibleOrders.length} ${visibleOrders.length === 1 ? 'order' : 'orders'}`;
  const orderCountSummary = `${serviceName} Orders - ${orderCount}`;

  const orderCard = (order) => {
    const serviceName = order.serviceLabel;
    const serviceIcon = orderServiceIcons[order.serviceId] ? icon(orderServiceIcons[order.serviceId]) : '';
    const statusLabel = customerOrderStatus(order);
    const isCanceled = statusCategory(statusLabel) === 'canceled';
    const isNoShow = statusCategory(statusLabel) === 'no-show';
    const summary = order.summary || order.description || 'Order details will appear here.';
    const supplierShipments = Object.values(order.supplierShipments || {}).filter((shipment) => shipment && typeof shipment === 'object');
    let marketplaceDetails = '';
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
    const orderDateDisplay = order.serviceId === 'marketplace'
      ? formatOrderDateTime(order.createdAt || order.dateLabel || order.date)
      : date;
    const orderDetails = orderDetailRows(order);
    const orderDetailsMarkup = order.serviceId === 'marketplace'
      ? `<section class="marketplace-order-info">${orderDetails ? `<dl class="my-order-detail-list">${orderDetails}</dl>` : ''}</section>`
      : `<dl class="my-order-detail-list">${orderDetails}</dl>`;
    const petsDetails = orderPetCards(order);
    const orderActions = onlinePaymentActions(order);
    const serviceCancelControl = order.serviceId !== 'marketplace' && canCancelServiceOrder(order)
      ? `<button class="marketplace-cancel-order" type="button" data-cancel-customer-order="${escapeHTML(order.serviceId)}|${escapeHTML(order._storageKey)}|${escapeHTML(order.id)}">Cancel Order</button>`
      : '';
    const receiptAction = order.receipt?.data
      ? `<a class="button button-primary my-order-receipt-button" href="${escapeHTML(order.receipt.data)}" download="${escapeHTML(order.receipt.name || 'receipt')}">Download Receipt</a>`
      : `<button class="button button-light my-order-receipt-button" type="button" data-show-receipt-message>Download Receipt</button><p class="my-order-receipt-empty" data-receipt-unavailable-message hidden>Your receipt will be available to download once the outlet has received your order.</p>`;
    if (order.serviceId === 'marketplace') marketplaceDetails = marketplaceReturnSection(order, marketplaceProducts, receiptAction);
    const firstItem = order.items?.[0];
    const firstProduct = marketplaceProducts.find((product) => String(product.id) === String(firstItem?.productId || ''));
    const firstVariant = firstProduct?.variants?.find((variant) => String(variant.id) === String(firstItem?.variantId || ''));
    const sellerName = String(firstItem?.supplierId || firstItem?.supplier || firstItem?.shopName || firstVariant?.supplierId || firstVariant?.supplier || firstProduct?.supplierName || '').trim();
    const seller = marketplaceSuppliers.find((entry) => entry.name.toLowerCase() === sellerName.toLowerCase());
    const sellerLink = validTrackingUrl(seller?.orderLink);
    const sellerPhone = String(seller?.phone || '').replace(/[^\d+]/g, '');
    const contactSellerHref = sellerLink || (sellerPhone ? `tel:${sellerPhone}` : `#seller?name=${encodeURIComponent(sellerName)}`);
    const contactSellerTarget = sellerLink ? ' target="_blank" rel="noopener noreferrer"' : '';
    const sellerContactAction = order.serviceId === 'marketplace'
      ? `<a class="button my-order-support-button my-order-contact-seller-button" href="${escapeHTML(contactSellerHref)}"${contactSellerTarget}>Contact Seller</a>`
      : '';
    const customerServiceAction = `<a class="button my-order-support-button my-order-customer-service-button" href="#help-center?from=orders">Customer Service</a>`;
    const orderCancelControl = order.serviceId === 'marketplace' ? marketplaceCancelControl(order) : serviceCancelControl;
    const orderSupportActions = order.serviceId === 'marketplace'
      ? `<div class="marketplace-order-support-actions">${sellerContactAction}${customerServiceAction}</div>`
      : `<div class="marketplace-order-support-actions"><div class="marketplace-receipt-control">${receiptAction}</div>${customerServiceAction}</div>`;
    const orderControlRow = `<div class="marketplace-order-actions-row${order.serviceId === 'marketplace' ? ' is-marketplace' : ''}">${orderCancelControl}${orderSupportActions}</div>`;
    const legacyTrackingUrl = !supplierShipments.length ? validTrackingUrl(order.trackingUrl) : '';
    const marketplacePreview = order.serviceId === 'marketplace' ? marketplaceOrderPreview(order, marketplaceProducts) : `<h2>${escapeHTML(order.title)}</h2>`;
    const marketplaceShipment = order.serviceId === 'marketplace' ? marketplaceShipmentSummary(order, order.items, marketplaceProducts) : summary;
    const collapsedReference = order.serviceId === 'marketplace' ? '' : reference;
    return `<details class="my-order-card"><summary class="my-order-card-summary"><div class="my-order-card-top"><span class="my-order-service-label">${serviceIcon ? `<img src="${serviceIcon}" alt="" />` : ''}${escapeHTML(serviceName)}</span><b class="my-order-status ${isCanceled ? 'is-canceled' : isNoShow ? 'is-no-show' : statusCategory(statusLabel) === 'completed' ? 'is-complete' : ''}">${escapeHTML(statusLabel)}</b></div>${marketplacePreview}<p class="my-order-summary">${escapeHTML(marketplaceShipment)}</p><div class="my-order-card-bottom"><small>${[collapsedReference, orderDateDisplay].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${order.totalAmount.toFixed(2)}</strong></div><span class="my-order-expand-hint">View Order Details <span aria-hidden="true">⌄</span></span></summary><div class="my-order-expanded">${marketplaceDetails}${orderDetailsMarkup}${petsDetails}${groomingDetails}${hotelDetails}${daycareDetails}${taxiTracking}${order.serviceId === 'marketplace' ? orderActions : ''}${orderControlRow}${legacyTrackingUrl ? `<a class="my-order-tracking" href="${escapeHTML(legacyTrackingUrl)}" target="_blank" rel="noopener noreferrer">Track Delivery</a>` : ''}</div></details>`;
  };

  const groups = !selectedServices.length
    ? visibleOrders.length ? visibleOrders.map(orderCard).join('') : `<section class="my-orders-empty"><h2>No Orders Found</h2><p>Your orders will appear here.</p></section>`
    : visibleOrders.length ? visibleOrders.map(orderCard).join('') : `<section class="my-orders-empty"><h2>No ${escapeHTML(serviceName)} Orders Found</h2><p>Try another service or status filter.</p></section>`;

  return `<main class="my-orders-page"><header class="my-orders-header"><a href="#${encodeURIComponent(returnTo)}" aria-label="Back">‹</a><h1>My Orders</h1><span aria-hidden="true"></span></header><div class="my-orders-filter-row">${serviceFilter}<nav class="my-orders-status-tabs" aria-label="Filter orders by status">${statusTabs}</nav></div><p class="my-orders-count">${escapeHTML(orderCountSummary)}</p><div class="my-orders-content">${groups}</div>${bottomNavigation('activity', icon)}${marketplaceCancelDialog()}</main>`;
}

// Customer cancellations are limited to orders that have not reached Received Order.
export function setupMyOrders() {
  myOrderLocationCleanups.forEach((cleanup) => cleanup());
  myOrderLocationCleanups = document.querySelector('.my-orders-page')
    ? [...document.querySelectorAll('[data-live-driver-location]')].map(mountDriverLocation)
    : [];
  const refreshCountdowns = () => document.querySelectorAll('[data-payment-countdown]').forEach((node) => {
    const remaining = new Date(node.dataset.paymentCountdown).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) { node.textContent = '00:00:00'; return; }
    const seconds = Math.floor(remaining / 1000);
    node.textContent = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });
  refreshCountdowns();
  if (document.documentElement.dataset.customerOrderServiceFilterReady !== 'true') {
    document.documentElement.dataset.customerOrderServiceFilterReady = 'true';
    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-my-orders-filter-toggle]');
      const panel = document.querySelector('[data-my-orders-filter-panel]');
      const filter = document.querySelector('.my-orders-service-filter');
      if (toggle) {
        const shouldOpen = panel?.hidden;
        if (panel) {
          panel.hidden = !shouldOpen;
          if (shouldOpen) {
            const bounds = toggle.getBoundingClientRect();
            panel.style.position = 'fixed';
            panel.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - 272))}px`;
            panel.style.top = `${Math.max(12, bounds.bottom + 8)}px`;
          }
        }
        toggle.setAttribute('aria-expanded', String(Boolean(shouldOpen)));
        return;
      }
      if (panel && filter && !filter.contains(event.target)) {
        panel.hidden = true;
        filter.querySelector('[data-my-orders-filter-toggle]')?.setAttribute('aria-expanded', 'false');
      }
      const apply = event.target.closest('[data-my-orders-filter-apply]');
      if (!apply) return;
      const selected = [...(panel?.querySelectorAll('[data-order-service-option]:checked') || [])]
        .map((input) => input.dataset.orderServiceOption)
        .filter((id) => orderServices.some((item) => item.id === id && id !== 'all'));
      const currentParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const nextService = selected.length ? selected.join(',') : 'all';
      const nextStatus = orderStatuses.some((item) => item.id === currentParams.get('status')) ? currentParams.get('status') : 'new';
      const nextReturn = ['home', 'marketplace', 'grooming', 'hotel', 'daycare', 'profile'].includes(currentParams.get('from')) ? currentParams.get('from') : 'home';
      window.location.hash = `#orders?service=${encodeURIComponent(nextService)}&status=${encodeURIComponent(nextStatus)}&from=${encodeURIComponent(nextReturn)}`;
    });
    document.addEventListener('change', (event) => {
      const option = event.target.closest('[data-order-service-option]');
      if (!option) return;
      const panel = option.closest('[data-my-orders-filter-panel]');
      const all = panel?.querySelector('[data-order-service-option="all"]');
      const specific = [...(panel?.querySelectorAll('[data-order-service-option]:not([data-order-service-option="all"])') || [])];
      if (option.dataset.orderServiceOption === 'all' && option.checked) specific.forEach((input) => { input.checked = false; });
      else if (option.dataset.orderServiceOption !== 'all' && option.checked && all) all.checked = false;
      if (!specific.some((input) => input.checked) && all) all.checked = true;
    });
  }
  if (document.querySelector('.my-orders-page') && document.documentElement.dataset.customerPaymentTimers !== 'true') {
    document.documentElement.dataset.customerPaymentTimers = 'true';
    window.setInterval(refreshCountdowns, 1000);
    window.setInterval(async () => {
      const orders = [
        ...loadMarketplaceOrders().map((order) => ({ ...order, serviceId: 'marketplace' })),
        ...loadGroomingBookings().map((order) => ({ ...order, serviceId: 'grooming' })),
        ...loadLocalOrders(hotelBookingsKey, ['furgo-demo-pet-hotel-bookings']).map((order) => ({ ...order, serviceId: 'hotel' })),
        ...loadLocalOrders(daycareBookingsKey, ['furgo-demo-daycare-bookings']).map((order) => ({ ...order, serviceId: 'daycare' })),
      ].filter((order) => order.paymentStatus === 'Pending Payment' && order.paymentDeadlineAt && new Date(order.paymentDeadlineAt).getTime() <= Date.now());
      for (const order of orders) {
        try {
          const { data, error } = order.serviceId === 'marketplace'
            ? await supabase.rpc('expire_marketplace_pending_payment', { p_order_id: order.id })
            : await supabase.rpc('expire_service_pending_payment', { p_service: order.serviceId, p_order_id: String(order.id) });
          if (!error && data) {
            const storageKey = ({ marketplace: marketplaceOrdersKey, grooming: groomingBookingsKey, hotel: hotelBookingsKey, daycare: daycareBookingsKey })[order.serviceId];
            const cachedRecords = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; } })();
            const cachedOrder = Array.isArray(cachedRecords) ? cachedRecords.find((record) => String(record.id) === String(order.id)) : null;
            if (cachedOrder) {
              cachedOrder.status = 'Cancelled';
              cachedOrder.adminStatus = 'Cancelled';
              cachedOrder.paymentStatus = 'Failed Payment';
              cachedOrder.refundStatus = 'Not Required';
              cachedOrder.cancellationReason = 'Payment window expired';
              cachedOrder.cancelledAt = new Date().toISOString();
              cacheSyncedRecords(storageKey, cachedRecords);
            }
            if (order.serviceId === 'daycare' && order.type === 'pass-purchase') {
              const passes = (() => { try { return JSON.parse(localStorage.getItem(daycarePassesKey) || '[]'); } catch { return []; } })();
              localStorage.setItem(daycarePassesKey, JSON.stringify(passes.filter((pass) => String(pass.id) !== String(order.id))));
            }
            window.dispatchEvent(new Event('hashchange'));
          }
        } catch { /* The RPC enforces expiry again when a payment is attempted. */ }
      }
    }, 15_000);
  }
  if (document.documentElement.dataset.customerOrderCancellationReady === 'true') return;
  document.documentElement.dataset.customerOrderCancellationReady = 'true';
  document.addEventListener('click', async (event) => {
    const trackingLink = event.target.closest('[data-track-order]');
    if (trackingLink) {
      event.preventDefault();
      if (trackingLink.dataset.redirectPending === 'true') return;
      trackingLink.dataset.redirectPending = 'true';
      const trackingNumber = trackingLink.dataset.copyTrackingNumber || '';
      let copied = false;
      if (trackingNumber) {
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable.');
          await navigator.clipboard.writeText(trackingNumber);
          copied = true;
        } catch {
          const field = document.createElement('textarea');
          field.value = trackingNumber;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.append(field);
          field.select();
          copied = document.execCommand('copy');
          field.remove();
        }
      }
      let toast = document.querySelector('[data-tracking-copy-toast]');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'tracking-copy-toast';
        toast.dataset.trackingCopyToast = '';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.append(toast);
      }
      toast.textContent = trackingNumber
        ? (copied ? 'Tracking number copied. Opening courier tracking…' : 'Could not copy the tracking number. Opening courier tracking…')
        : 'Opening courier tracking…';
      toast.classList.add('is-visible');
      window.clearTimeout(toast.hideTimer);
      toast.hideTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
      window.setTimeout(() => window.location.assign(trackingLink.href), 2000);
      return;
    }
    const openReturn = event.target.closest('[data-open-marketplace-return]');
    if (openReturn) {
      const form = openReturn.parentElement?.querySelector('[data-marketplace-return-form]');
      if (form) { form.hidden = false; openReturn.hidden = true; }
      return;
    }
    const receiptButton = event.target.closest('[data-show-receipt-message]');
    if (receiptButton) {
      const message = receiptButton.closest('.my-order-expanded')?.querySelector('[data-receipt-unavailable-message]');
      if (message) message.hidden = false;
      return;
    }
    const marketplaceCancel = event.target.closest('[data-cancel-marketplace-order]');
    if (marketplaceCancel) {
      const orderId = marketplaceCancel.dataset.cancelMarketplaceOrder;
      const orders = loadMarketplaceOrders();
      const order = orders.find((record) => String(record.id) === orderId);
      if (!order || !canCancelMarketplaceOrder({ ...order, serviceId: 'marketplace' })) {
        window.alert('This order can no longer be cancelled. Furgo may already have confirmed it or a supplier may have shipped it.');
        window.dispatchEvent(new Event('hashchange'));
        return;
      }
      const dialog = document.querySelector('[data-marketplace-cancel-dialog]');
      const form = dialog?.querySelector('[data-marketplace-cancel-form]');
      if (!dialog || !form) return;
      form.reset();
      form.querySelector('[data-marketplace-cancel-other]').hidden = true;
      form.elements.otherReason.required = false;
      form.querySelector('[data-marketplace-cancel-error]').hidden = true;
      const paid = /paid|successful|succeeded|completed/i.test(String(order.paymentStatus || ''));
      const refund = Number(order.total) || 0;
      dialog.dataset.orderType = 'marketplace';
      dialog.dataset.orderId = orderId;
      form.querySelector('[data-marketplace-cancel-kind]').textContent = 'Marketplace order';
      form.querySelector('#marketplace-cancel-title').textContent = 'Are you sure you want to cancel this order?';
      form.querySelector('[data-marketplace-cancel-note]').textContent = paid
        ? `After confirmation, MYR ${refund.toFixed(2)} will be recorded for refund to your original payment method. The refund is not sent automatically.`
        : 'This order has not been paid. Confirming will cancel it.';
      dialog.showModal();
      return;
    }
    if (event.target.closest('[data-close-marketplace-cancel]')) {
      document.querySelector('[data-marketplace-cancel-dialog]')?.close();
      return;
    }
    const completePayment = event.target.closest('[data-complete-online-payment]');
    if (completePayment) {
      const [serviceId, orderId] = completePayment.dataset.completeOnlinePayment.split('|');
      const storageKey = ({ marketplace: marketplaceOrdersKey, grooming: groomingBookingsKey, hotel: hotelBookingsKey, daycare: daycareBookingsKey })[serviceId];
      let records = [];
      try { records = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { records = []; }
      const order = Array.isArray(records) ? records.find((record) => String(record.id) === orderId) : null;
      if (!order || !window.confirm(`Complete the demo payment of MYR ${Number(order.total || 0).toFixed(2)}? No real charge will be made.`)) return;
      completePayment.disabled = true;
      try {
        const { data, error } = serviceId === 'marketplace'
          ? await supabase.rpc('complete_marketplace_demo_payment', { p_order_id: orderId })
          : await supabase.rpc('complete_service_demo_payment', { p_service: serviceId, p_order_id: orderId });
        if (error) throw error;
        if (data === 'expired') {
          order.status = 'Cancelled';
          order.adminStatus = 'Cancelled';
          order.paymentStatus = 'Failed Payment';
          order.refundStatus = 'Not Required';
          order.cancellationReason = 'Payment window expired';
          order.cancelledAt = new Date().toISOString();
          cacheSyncedRecords(storageKey, records);
          if (serviceId === 'daycare' && order.type === 'pass-purchase') {
            const passes = (() => { try { return JSON.parse(localStorage.getItem(daycarePassesKey) || '[]'); } catch { return []; } })();
            localStorage.setItem(daycarePassesKey, JSON.stringify(passes.filter((pass) => String(pass.id) !== String(orderId))));
          }
          window.alert('The one-hour payment window has expired. This order has been cancelled. Place a new order to try again.');
        } else if (data === 'paid') {
          order.status = 'New Order';
          order.adminStatus = 'New Order';
          order.paymentStatus = 'Paid';
          cacheSyncedRecords(storageKey, records);
          if (serviceId === 'marketplace') {
            const products = loadMarketplaceProducts();
            order.items.forEach((item) => {
              const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
              if (variant) variant.stock = Math.max(0, Number(variant.stock) - Number(item.quantity || 0));
            });
            localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
          }
        }
        window.dispatchEvent(new Event('hashchange'));
      } catch (error) {
        completePayment.disabled = false;
        window.alert(error.message || 'Payment could not be completed. Please try again.');
      }
      return;
    }
    const button = event.target.closest('[data-cancel-customer-order]');
    if (!button) return;
    const [serviceId, key, id] = button.dataset.cancelCustomerOrder.split('|');
    let records;
    try { records = JSON.parse(localStorage.getItem(key) || '[]'); } catch { records = []; }
    const order = Array.isArray(records) ? records.find((item) => String(item.id) === id) : null;
    if (!order) { window.alert('This booking could not be found. Refresh My Orders and try again.'); return; }
    const serviceLabel = { grooming: 'Grooming', hotel: 'Pet Hotel', daycare: 'Pet Daycare' }[serviceId];
    const decorated = { ...order, serviceId, serviceLabel };
    if (!canCancelServiceOrder(decorated)) { window.alert('This booking can only be cancelled before it reaches Received Order.'); window.dispatchEvent(new Event('hashchange')); return; }
    openServiceCancelDialog(document.querySelector('[data-marketplace-cancel-dialog]'), { order: decorated, serviceId, key });
  });
  document.addEventListener('submit', async (event) => {
    const cancelForm = event.target.closest('[data-marketplace-cancel-form]');
    if (cancelForm) {
      event.preventDefault();
      const dialog = cancelForm.closest('[data-marketplace-cancel-dialog]');
      const selected = cancelForm.querySelector('input[name="reason"]:checked');
      const otherReason = cancelForm.elements.otherReason.value.trim();
      const errorMessage = cancelForm.querySelector('[data-marketplace-cancel-error]');
      if (!selected || (selected.value === 'Other' && !otherReason)) {
        errorMessage.textContent = selected?.value === 'Other' ? 'Enter your reason to continue.' : 'Choose a reason to continue.';
        errorMessage.hidden = false;
        return;
      }
      const orderId = dialog.dataset.orderId;
      const order = loadMarketplaceOrders().find((record) => String(record.id) === orderId);
      const reason = selected.value === 'Other' ? `Other: ${otherReason}` : selected.value;
      const submit = cancelForm.querySelector('[type="submit"]');
      submit.disabled = true;
      errorMessage.hidden = true;
      if (dialog.dataset.orderType === 'service') {
        const { serviceId, storageKey } = dialog.dataset;
        let records;
        try { records = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { records = []; }
        const serviceOrder = Array.isArray(records) ? records.find((record) => String(record.id) === orderId) : null;
        if (!serviceOrder || !canCancelServiceOrder({ ...serviceOrder, serviceId })) {
          submit.disabled = false;
          errorMessage.textContent = 'This booking can only be cancelled before it reaches Received Order.';
          errorMessage.hidden = false;
          return;
        }
        try {
          const { data, error } = await supabase.rpc('cancel_service_booking', {
            p_service: serviceId,
            p_order_id: orderId,
            p_reason: reason,
          });
          if (error) throw error;
          const changedAt = new Date().toISOString();
          const previousStatus = customerOrderStatus({ ...serviceOrder, serviceId });
          const refund = Number(data?.refundAmount || 0);
          serviceOrder.status = 'Cancelled';
          serviceOrder.adminStatus = 'Cancelled';
          serviceOrder.paymentStatus = refund > 0 ? 'Refunded to Furgo Credit' : 'Cancelled';
          serviceOrder.refundStatus = data?.refundStatus || (refund > 0 ? 'Refunded to Furgo Credit' : 'Not Required');
          serviceOrder.refundAmount = refund;
          serviceOrder.customerCancellationReason = reason;
          serviceOrder.cancelledAt = changedAt;
          serviceOrder.statusHistory = [...(serviceOrder.statusHistory || []), { status: 'Cancelled', previousStatus, changedAt, changedBy: 'Customer', reason, refundAmount: refund }];
          cacheSyncedRecords(storageKey, records);
          if (refund > 0) {
            const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0) + refund;
            const transactions = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]'); } catch { return []; } })();
            transactions.unshift({ id: `refund-${serviceOrder.id}-${Date.now()}`, type: 'Order cancellation refund', label: `Refund for ${serviceOrder.reference || serviceOrder.id}`, amount: refund, timestamp: changedAt, date: new Date(changedAt).toLocaleDateString() });
            localStorage.setItem('furgo-demo-credit-balance', balance.toFixed(2));
            localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
          }
          dialog.close();
          window.dispatchEvent(new Event('hashchange'));
        } catch (error) {
          submit.disabled = false;
          errorMessage.textContent = error.message || 'The booking could not be cancelled. Please try again.';
          errorMessage.hidden = false;
        }
        return;
      }
      if (!order || !canCancelMarketplaceOrder({ ...order, serviceId: 'marketplace' })) {
        submit.disabled = false;
        errorMessage.textContent = 'This order can no longer be cancelled.';
        errorMessage.hidden = false;
        return;
      }
      try {
        const { error } = await supabase.rpc('cancel_marketplace_order', { p_order_id: orderId, p_reason: reason });
        if (error) throw error;
        if (order.paymentStatus !== 'Pending Payment' && !order.inventoryRestoredAt) {
          const products = loadMarketplaceProducts();
          order.items?.forEach((item) => {
            const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
            if (variant) variant.stock = Number(variant.stock || 0) + Number(item.quantity || 0);
          });
          localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
        }
        dialog.close();
        window.dispatchEvent(new Event('hashchange'));
      } catch (error) {
        submit.disabled = false;
        errorMessage.textContent = error.message || 'The order could not be cancelled. Please try again.';
        errorMessage.hidden = false;
      }
      return;
    }
    const form = event.target.closest('[data-marketplace-return-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const feedback = form.querySelector('[data-marketplace-return-feedback]');
    const submit = form.querySelector('[type="submit"]');
    const file = form.elements.photo.files?.[0];
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      feedback.textContent = 'Choose a JPG, PNG, or WebP product photo up to 5 MB.';
      return;
    }
    submit.disabled = true;
    feedback.textContent = 'Submitting return request…';
    let photoPath = '';
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in again before requesting a return.');
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
      photoPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('marketplace-return-evidence').upload(photoPath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc('request_marketplace_item_return', {
        p_order_id: form.dataset.orderId,
        p_line_number: Number(form.dataset.lineNumber),
        p_reason: form.elements.reason.value.trim(),
        p_photo_path: photoPath,
      });
      if (error) throw error;
      feedback.textContent = 'Return request submitted to the supplier.';
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      if (photoPath) await supabase.storage.from('marketplace-return-evidence').remove([photoPath]);
      submit.disabled = false;
      feedback.textContent = error.message || 'The return request could not be submitted.';
    }
  });
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-retry-marketplace-payment]');
    if (!form) return;
    event.preventDefault();
    const file = form.elements.transferSlip.files?.[0];
    const feedback = form.querySelector('[data-payment-retry-feedback]');
    if (!file || file.size > 1.5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) {
      feedback.textContent = 'Choose a transfer slip image or PDF no larger than 1.5 MB.';
      return;
    }
    const slip = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, data: reader.result });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!slip) { feedback.textContent = 'The transfer slip could not be read. Choose it again.'; return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Submitting your new payment slip…';
    try {
      const { error } = await supabase.rpc('resubmit_marketplace_payment', {
        p_order_id: form.dataset.retryMarketplacePayment,
        p_transfer_slip: slip,
      });
      if (error) throw error;
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      submit.disabled = false;
      feedback.textContent = error.message || 'The payment could not be resubmitted.';
    }
  });
  document.addEventListener('change', (event) => {
    const reasonInput = event.target.closest('.marketplace-cancel-dialog input[name="reason"]');
    if (!reasonInput) return;
    const form = reasonInput.closest('[data-marketplace-cancel-form]');
    const other = form.querySelector('[data-marketplace-cancel-other]');
    const isOther = reasonInput.value === 'Other' && reasonInput.checked;
    other.hidden = !isOther;
    form.elements.otherReason.required = isOther;
    if (!isOther) form.elements.otherReason.value = '';
    form.querySelector('[data-marketplace-cancel-error]').hidden = true;
  });
}
