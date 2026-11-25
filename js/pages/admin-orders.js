import { escapeHTML } from '../shared.js';
import { marketplaceOrdersKey, loadMarketplaceOrders, marketplacePaymentLabel } from './marketplace-data.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { applyCheckInScan, extractCheckInCode, formatCheckInToken, previewCheckInScan, refreshCheckInTokens, setupCheckInCodeInput } from './check-in.js';
import { mountDriverLocation } from './driver-location.js';
import { recordAdminAction } from '../admin-audit.js';
import { startQRScanner } from '../qr-scanner.js';
import { saveOrderRecords, updateMarketplaceOrder } from '../app-data-sync.js';
import { supabase } from '../supabase.js';
import { customerOrderStatus, statusCategory } from '../order-status.js';
import { adminOrderProgressMarkup, adminOrderStatusControl, canMarkOrderNoShow, isOrderCurrentToday } from '../admin-order-ui.js';
import { makeReceiptPdf } from '../receipt-pdf.js';

const daycareKeys = ['furgo-demo-daycare-bookings', 'furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders'];
let adminOrderLocationCleanups = [];
const orderSources = [
  { id: 'marketplace', label: 'Marketplace', key: marketplaceOrdersKey, load: loadMarketplaceOrders },
  { id: 'grooming', label: 'Grooming', key: groomingBookingsKey, load: loadGroomingBookings },
  { id: 'hotel', label: 'Pet Hotel', key: hotelBookingsKey, load: loadHotelBookings },
  ...daycareKeys.map((key) => ({ id: 'daycare', label: 'Pet Daycare', key, load: () => readOrders(key) })),
];

function readOrders(key) {
  if (key === marketplaceOrdersKey) return loadMarketplaceOrders();
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

const getAdminStatus = customerOrderStatus;

function allAdminOrders() {
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  return orderSources.flatMap((source) => {
    const records = source.load();
    return (Array.isArray(records) ? records : []).filter((order) => order && typeof order === 'object' && !Array.isArray(order))
      .map((order) => ({ ...order, serviceId: source.id, serviceLabel: source.label, storageKey: source.key, adminStatus: getAdminStatus({ ...order, serviceId: source.id }) }));
  })
    .filter((order) => ['director', 'admin'].includes(profile.role)
      || (profile.outletName && String(order.outlet || '').trim().toLowerCase() === String(profile.outletName).trim().toLowerCase()))
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
}

export function countNewAdminOrders() {
  return allAdminOrders().filter((order) => orderStage(order) === 'new').length;
}

// Dashboard service notification: count only new orders from the requested service.
export function countNewAdminOrdersFor(serviceId) {
  return allAdminOrders().filter((order) => order.serviceId === serviceId && orderStage(order) === 'new').length;
}

export function adminOrderCard({ order, serviceLabel, title, summary, details, reference, total, date }) {
  const status = customerOrderStatus(order);
  const category = status.toLowerCase().includes('cancel') ? 'is-canceled'
    : status.toLowerCase().includes('complete') || status.toLowerCase() === 'delivered' ? 'is-complete' : '';
  const amount = Number(total ?? order.totalAmount ?? order.total);
  const formattedDate = date ? new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const orderRef = reference || order.reference || order.id || '';
  return `<details class="my-order-card admin-my-order-card"><summary class="my-order-card-summary"><div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(serviceLabel)}</span><b class="my-order-status ${category}">${escapeHTML(status)}</b></div><h2>${escapeHTML(title || 'Order')}</h2><p class="my-order-summary">${escapeHTML(summary || 'Order details will appear here.')}</p><div class="my-order-card-bottom"><small>${[orderRef, formattedDate].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}</strong></div><span class="my-order-expand-hint">View Order Details <span aria-hidden="true">⌄</span></span></summary><div class="my-order-expanded">${details}</div></details>`;
}

function receiptStatusLabel(order) {
  if (!order.receipt) return 'Not Uploaded';
  if (order.receipt.document) return `${order.receipt.type || 'Payment'} Receipt Generated`;
  if (/deposit/i.test(order.receipt.type || order.paymentStatus || '')) return 'Deposit Receipt Uploaded';
  if (/full/i.test(order.receipt.type || order.paymentStatus || '')) return 'Full Payment Receipt Uploaded';
  return 'Deposit Receipt Uploaded';
}

function orderStage(order) {
  const status = customerOrderStatus(order);
  if (['completed', 'canceled', 'no-show'].includes(statusCategory(status))) return 'completed';
  if (order.serviceId === 'marketplace') return ['Received Order', 'Shipped'].includes(status) ? 'progressing' : 'new';
  return order.receipt ? 'progressing' : 'new';
}

function statusProgressMarkup(order) {
  return adminOrderProgressMarkup(order);
}

function importantOrderRows(order) {
  const serviceDetails = order.serviceId === 'marketplace'
    ? [(Array.isArray(order.items) ? order.items : []).filter((item) => item && typeof item === 'object').map((item) => `${item.name || item.productName || 'Product'} × ${Number(item.quantity) || 1}`).join(', '), order.address?.street, order.address?.city, order.address?.state].filter(Boolean).join(' · ')
    : order.serviceId === 'hotel'
      ? [order.roomName, order.checkIn || order.startDate, order.checkOut || order.endDate, order.outlet].filter(Boolean).join(' · ')
      : [order.packageName || order.planName, order.date || order.bookingDate, order.time || order.dropoffTime, order.pickupTime && `Pick-up ${order.pickupTime}`, order.outlet].filter(Boolean).join(' · ');
  const payment = [order.paymentStatus || 'Pending Payment', order.serviceId === 'marketplace' ? marketplacePaymentLabel(order) : order.paymentMethod].filter(Boolean).join(' · ');
  const pets = Array.isArray(order.petNames) && order.petNames.length ? order.petNames.join(' | ') : order.petName || order.pet?.name;
  return [
    ['Customer', order.customerName || order.name || order.customer?.name],
    ['Contact', order.customerPhone || order.phone || order.customer?.phone || order.customerEmail || order.email],
    ['Pet', pets],
    ['Service Details', serviceDetails],
    ['Payment', payment],
    ['Receipt Status', receiptStatusLabel(order)],
    ['Total', `MYR ${Number(order.totalAmount ?? order.total ?? 0).toFixed(2)}`],
  ].filter(([, value]) => value != null && String(value).trim());
}

function receiptDateInputValue(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return receiptDateInputValue(new Date());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function receiptItemLines(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items.filter((item) => item && typeof item === 'object').map((item) => {
    const quantity = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    return `${item.name || item.productName || 'Product'}${item.variantLabel ? ` · ${item.variantLabel}` : ''} × ${quantity}  |  MYR ${(unitPrice * quantity).toFixed(2)}`;
  }).join('\n');
  const name = order.packageName || order.roomName || order.planName || order.productName || order.bookingType || order.serviceLabel || 'Service';
  const amount = Number(order.totalAmount ?? order.total ?? 0);
  return `${name}  |  MYR ${amount.toFixed(2)}`;
}

function normalizeMarketplaceReceiptItems(order, saved = {}) {
  if (Array.isArray(saved.marketplaceItems) && saved.marketplaceItems.length) {
    return saved.marketplaceItems.map((item) => ({
      description: String(item.description || 'Product'),
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Math.max(0, Number(item.price) || 0),
    }));
  }
  const savedLines = String(saved.items || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsedSaved = savedLines.map((line) => {
    const columns = line.split('|').map((value) => value.trim());
    if (columns.length >= 3 && Number.isFinite(Number(columns[1])) && Number.isFinite(Number(columns[2]))) {
      return { description: columns[0] || 'Product', quantity: Math.max(1, Number(columns[1]) || 1), price: Math.max(0, Number(columns[2]) || 0) };
    }
    const legacy = line.match(/^(.*?)\s*[×x]\s*(\d+)\s*\|\s*MYR\s*([\d,.]+)/i);
    return legacy ? { description: legacy[1].trim() || 'Product', quantity: Math.max(1, Number(legacy[2]) || 1), price: Math.max(0, Number(legacy[3].replace(/,/g, '')) || 0) } : null;
  }).filter(Boolean);
  if (parsedSaved.length) return parsedSaved;
  return (Array.isArray(order.items) ? order.items : []).filter((item) => item && typeof item === 'object').map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    return {
      description: `${item.name || item.productName || 'Product'}${item.variantLabel ? ` · ${item.variantLabel}` : ''}`,
      quantity,
      price: Math.max(0, unitPrice * quantity),
    };
  });
}

function marketplaceReceiptItemLines(order, saved) {
  return normalizeMarketplaceReceiptItems(order, saved)
    .map((item) => `${item.description} | ${item.quantity} | ${item.price.toFixed(2)}`).join('\n');
}

function receiptEditorMarkup(order, reference, receiptType) {
  const saved = order.receipt?.document || {};
  const isMarketplace = order.serviceId === 'marketplace';
  const total = Number(order.totalAmount ?? order.total ?? saved.total ?? 0);
  const subtotal = Number(saved.subtotal ?? order.subtotal ?? total);
  const discount = Number(saved.discount ?? order.discountAmount ?? order.voucherDiscount ?? 0);
  const delivery = Number(saved.delivery ?? order.deliveryFee ?? order.shippingFee ?? 0);
  const customerName = saved.customerName ?? order.customerName ?? order.name ?? order.customer?.name ?? '';
  const customerPhone = saved.customerPhone ?? order.customerPhone ?? order.phone ?? order.customer?.phone ?? '';
  const customerEmail = saved.customerEmail ?? order.customerEmail ?? order.email ?? order.customer?.email ?? '';
  const receiptTypeField = isMarketplace
    ? '<input type="hidden" name="receiptType" value="Full Payment" />'
    : `<label>Receipt type<select name="receiptType"><option ${receiptType === 'Deposit' ? 'selected' : ''}>Deposit</option><option ${receiptType === 'Full Payment' ? 'selected' : ''}>Full Payment</option></select></label>`;
  const itemsLabel = isMarketplace ? 'Items (Description | Quantity | Price MYR)' : 'Items and amounts';
  const itemsValue = isMarketplace ? marketplaceReceiptItemLines(order, saved) : saved.items || receiptItemLines(order);
  return `<div class="admin-generated-receipt"><div class="admin-generated-receipt-toolbar"><button class="button button-primary admin-generated-receipt-open" type="button" data-open-generated-receipt data-has-generated-receipt="${order.receipt?.document ? 'true' : 'false'}">${order.receipt?.document ? 'Edit Generated Receipt' : 'Generate Receipt'}</button>${order.receipt?.document ? '<button class="button button-primary" type="button" data-download-generated-receipt>Download Receipt</button>' : ''}</div><form class="admin-generated-receipt-form" data-generated-receipt-form data-marketplace-receipt="${isMarketplace ? 'true' : 'false'}" hidden>
    <div class="admin-generated-receipt-fields">
      <label>Receipt number<input name="receiptNo" value="${escapeHTML(saved.receiptNo || `RCP-${reference}`)}" maxlength="80" required /></label>
      <label>Receipt date<input name="receiptDate" type="date" value="${escapeHTML(saved.receiptDate || receiptDateInputValue())}" required /></label>
      ${receiptTypeField}
      <label>Customer name<input name="customerName" value="${escapeHTML(customerName)}" maxlength="140" required /></label>
      <label>Phone<input name="customerPhone" value="${escapeHTML(customerPhone)}" maxlength="80" /></label>
      <label class="admin-generated-receipt-wide">Email<input name="customerEmail" type="email" value="${escapeHTML(customerEmail)}" maxlength="180" /></label>
      <label class="admin-generated-receipt-wide">Order number<input name="orderNo" value="${escapeHTML(saved.orderNo || reference)}" maxlength="100" required /></label>
      <label class="admin-generated-receipt-wide">${itemsLabel}<textarea name="items" rows="4" maxlength="1800" required>${escapeHTML(itemsValue)}</textarea></label>
      <label>Subtotal (MYR)<input name="subtotal" type="number" min="0" step="0.01" value="${subtotal.toFixed(2)}" required /></label>
      <label>Discount (MYR)<input name="discount" type="number" min="0" step="0.01" value="${discount.toFixed(2)}" required /></label>
      <label>Delivery (MYR)<input name="delivery" type="number" min="0" step="0.01" value="${delivery.toFixed(2)}" required /></label>
      <label>Total paid (MYR)<input name="total" type="number" min="0" step="0.01" value="${total.toFixed(2)}" required /></label>
      <label>Payment method<input name="paymentMethod" value="${escapeHTML(saved.paymentMethod ?? (isMarketplace ? marketplacePaymentLabel(order) : order.paymentMethod) ?? '—')}" maxlength="100" /></label>
      <label>Payment status<input name="paymentStatus" value="${escapeHTML(saved.paymentStatus ?? order.paymentStatus ?? 'Paid')}" maxlength="100" /></label>
      <label class="admin-generated-receipt-wide">Issued by<input name="issuedBy" value="${escapeHTML(saved.issuedBy || 'Furgo')}" maxlength="120" /></label>
    </div>
    <div class="admin-generated-receipt-actions"><button class="button button-primary" type="button" data-generate-receipt>Generate Receipt</button></div>
    <p class="admin-generated-receipt-feedback" data-generated-receipt-feedback role="status" aria-live="polite"></p>
  </form></div>`;
}

function checkInPreviewMarkup(preview) {
  const order = preview.order || {};
  const source = orderSources.find((item) => item.key === preview.orderKey);
  const service = order.serviceLabel || order.service || source?.label || 'Service';
  const pet = order.pet || null;
  const petName = order.petName || order.pet?.name || pet?.name || 'Pet';
  const breed = order.petBreed || order.breed || order.pet?.breed || pet?.breed || '';
  const weight = order.petWeight || order.weight || order.pet?.weight || pet?.weight || '';
  const image = pet?.photo || order.petPhoto || order.pet?.photo || '';
  const safeImage = /^(data:image\/(png|jpeg|webp|gif);base64,|https:\/\/|Image\/)/i.test(String(image)) ? image : '';
  const fields = [
    ['Order Reference', order.reference || order.id],
    ['Customer', order.customerName || order.name || order.customer?.name],
    ['Contact', order.customerPhone || order.phone || order.customer?.phone || order.customerEmail || order.email],
    ['Breed', breed],
    ['Weight', weight ? `${weight} kg` : ''],
    ['Booking', order.packageName || order.roomName || order.productName || order.itemName || order.bookingType],
    ['Date', order.date || order.checkIn || order.bookingDate],
    ['Time', order.time || order.slot],
    ['Outlet / Location', order.outlet || order.location || order.address],
    ['Payment', order.paymentStatus || order.paymentMethod || order.payment?.status],
    ['Total', order.total || order.totalAmount || order.amount],
    ['Current Status', order.status || order.adminStatus],
    ['Vaccination Cards', (pet?.vaccinationCards || order.vaccinationCards || []).length ? 'Uploaded' : (order.vaccinationStatus || '')],
    ['Notes', order.notes || order.remark || order.specialRequests],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  const rows = fields.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(Array.isArray(value) ? value.join(', ') : String(value))}</dd></div>`).join('');
  const action = preview.stage === 'check-in' ? 'Check In' : preview.stage === 'check-out' ? 'Check Out' : preview.stage === 'taxi-pickup' ? 'Confirm Taxi Pickup' : 'Confirm Taxi Drop-Off';
  const title = `Review Order Before ${action}`;
  const message = `Confirming will update this order to ${preview.nextStatus}. ${preview.stage === 'check-in' ? 'The same QR code stays active for check-out.' : 'The order will be marked complete.'}`;
  const confirmButton = `<button type="button" class="button button-primary" data-confirm-checkin-preview>${escapeHTML(action)}</button>`;
  const petImage = safeImage || 'Image/Other%20Image/Pet%20Profile%20Picture.png';
  return `<div class="admin-checkin-preview-heading"><span>${escapeHTML(service)}</span><h2 id="checkin-preview-title">${escapeHTML(title)}</h2></div><div class="admin-checkin-preview-pet"><img src="${escapeHTML(petImage)}" alt="${escapeHTML(petName)} profile" /><div><strong>${escapeHTML(petName)}</strong><span>${escapeHTML([breed, order.petSex || order.sex || pet?.sex || pet?.gender].filter(Boolean).join(' · ') || 'Pet profile')}</span></div></div><dl class="admin-checkin-preview-details">${rows}</dl><p class="admin-checkin-preview-message">${escapeHTML(message)}</p><footer><button type="button" class="button button-light" data-cancel-checkin-preview>Cancel</button>${confirmButton}</footer>`;
}

function adminCheckInScanPanelMarkup() {
  return `<section class="admin-market-panel admin-checkin-scan-panel"><div class="admin-market-panel-heading"><div><span>Visit check-in</span><h2>Scan Customer QR Code</h2></div><p>Scan a QR code or enter its manual code to review the matching order. The order updates only after you confirm.</p></div><div class="admin-checkin-scan-controls"><button class="button button-light" type="button" data-start-checkin-scan>Start camera scan</button><video class="admin-checkin-video" data-checkin-video playsinline muted hidden></video><p class="admin-checkin-scan-feedback" data-checkin-scan-feedback role="status" aria-live="polite">Camera access requires HTTPS and permission. You can also enter the scanned code below.</p><form class="admin-checkin-manual-form" data-checkin-manual-form><label>QR code<input name="token" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="17" minlength="10" pattern="[2-9A-HJ-NP-Z]{5}-?[2-9A-HJ-NP-Z]{5}|[2-9A-HJ-NP-Z]{17}" placeholder="e.g. 7K4MR-9TX2C" required /></label><button class="button button-primary" type="submit">Review Order</button></form></div></section><dialog class="admin-checkin-preview-dialog" data-checkin-preview-dialog aria-labelledby="checkin-preview-title"></dialog>`;
}

// Furgo Order board: service details, status updates, and customer receipts.
function renderAdminOrdersPage(routeParams = new URLSearchParams()) {
  const role = sessionStorage.getItem('furgo-demo-user-role') || 'executive';
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  const isDirector = ['admin', 'director'].includes(role);
  const homeHref = isDirector ? '#admin' : '#admin-access';
  const portalName = role === 'manager' ? 'Manager Portal' : role === 'executive' || role === 'staff' ? 'Executive Portal' : 'Director Portal';
  const allOrders = allAdminOrders();
  const serviceFilters = [...orderSources.filter((source, index, sources) => sources.findIndex((item) => item.id === source.id) === index).map(({ id, label }) => ({ id, label }))];
  const selectedService = serviceFilters.some((item) => item.id === routeParams.get('service')) ? routeParams.get('service') : 'all';
  const currentOrderView = selectedService === 'all' && routeParams.get('view') !== 'all';
  const orders = selectedService === 'all' ? allOrders : allOrders.filter((order) => order.serviceId === selectedService);
  const stageFilters = selectedService === 'marketplace'
    ? [{ id: 'all', label: 'All Orders' }, { id: 'new', label: 'New Order' }, { id: 'received', label: 'Received Order' }, { id: 'shipped', label: 'Shipped' }, { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' }]
    : selectedService === 'all'
      ? [{ id: 'all', label: 'All Orders' }, { id: 'new', label: 'New Order' }, { id: 'received', label: 'Received Order' }, { id: 'checked-in', label: 'Checked-In' }, { id: 'in-progress', label: 'In Progress' }, { id: 'pet-taxi', label: 'Pet Taxi' }, { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'no-show', label: 'No-Show' }]
    : [{ id: 'all', label: 'All Orders' }, { id: 'new', label: 'New Order' }, { id: 'received', label: 'Received Order' }, { id: 'checked-in', label: 'Checked-In' }, { id: 'pet-taxi', label: 'Pet Taxi' }, { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'no-show', label: 'No-Show' }];
  const requestedStage = routeParams.get('status') || routeParams.get('stage') || (currentOrderView ? '' : 'all');
  const selectedStage = stageFilters.some((item) => item.id === requestedStage) ? requestedStage : 'all';
  const matchesStage = (order) => {
    const status = customerOrderStatus(order);
    if (selectedStage === 'all') return true;
    if (selectedStage === 'new') return ['New Order', 'Pending Payment'].includes(status);
    if (selectedStage === 'received') return status === 'Received Order';
    if (selectedStage === 'shipped') return status === 'Shipped';
    if (selectedStage === 'checked-in') return status === 'Checked-In';
    if (selectedStage === 'pet-taxi') return ['Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup'].includes(status);
    if (selectedStage === 'in-progress') return status === 'In Progress';
    if (selectedStage === 'completed') return statusCategory(status) === 'completed';
    if (selectedStage === 'cancelled') return statusCategory(status) === 'canceled';
    if (selectedStage === 'no-show') return statusCategory(status) === 'no-show';
    return true;
  };
  const visibleOrders = currentOrderView ? orders.filter(isOrderCurrentToday) : orders.filter(matchesStage);
  const serviceName = serviceFilters.find((item) => item.id === selectedService)?.label;
  const orderSectionTitle = `Furgo Orders (${selectedService === 'all' ? 'All' : serviceName})`;
  const newCount = orders.filter((order) => ['New Order', 'Pending Payment'].includes(customerOrderStatus(order))).length;
  const receivedCount = orders.filter((order) => customerOrderStatus(order) === 'Received Order').length;
  const orderSummaryStats = `<section class="admin-market-stats admin-order-summary-stats"><article><span>New Order</span><strong>${newCount}</strong></article><article><span>Received Order</span><strong>${receivedCount}</strong></article></section>`;
  const cards = visibleOrders.map((order) => {
    try {
    const receipt = order.receipt;
    const taxiStage = order.taxiProgress?.status || 'Scheduled';
    const isTaxiInTransit = order.status === 'Pet Taxi Delivering...' && ['Picked Up', 'Returning to Customer'].includes(taxiStage);
    const taxiTracking = isTaxiInTransit
      ? `<div class="admin-orders-driver-location"><strong>Pet Taxi Driver Location</strong><div class="live-driver-location" data-live-driver-location data-order-key="${escapeHTML(order.storageKey)}" data-order-id="${escapeHTML(order.id)}"><p class="live-driver-location-waiting">Waiting for the driver to share their location…</p></div></div>`
      : '';
    const reference = order.reference || order.id || 'Order';
    const date = order.createdAt || order.date || order.checkIn || '';
    const category = statusCategory(order.adminStatus);
    const statusTone = category === 'completed' ? 'is-complete' : category === 'canceled' ? 'is-canceled' : category === 'no-show' ? 'is-no-show' : '';
    const taxiAction = taxiStage === 'Picked Up' ? 'Checked-In'
      : taxiStage === 'Checked-In' ? 'Done'
        : taxiStage === 'Service Complete · Awaiting Pickup' ? 'Check Out' : '';
    const taxiActionMarkup = taxiAction
      ? `<div class="admin-order-taxi-actions"><strong>Pet Taxi Progress</strong><button class="button button-primary" type="button" data-admin-taxi-action="${escapeHTML(taxiAction)}">${escapeHTML(taxiAction)}</button><small data-admin-taxi-feedback role="status"></small></div>`
      : '';
    const title = order.title || (order.serviceId === 'marketplace' ? `Order ${reference}` : `${order.petName || order.pet?.name || 'Pet'} · ${order.packageName || order.roomName || order.serviceLabel}`);
    const summary = order.summary || [order.packageName || order.roomName || order.productName, order.date || order.checkIn || order.bookingDate, order.time, order.outlet || order.location].filter(Boolean).join(' · ');
    const receiptSummary = currentOrderView ? '' : `<p class="admin-order-receipt-summary">Receipt: ${escapeHTML(receiptStatusLabel(order))}</p>`;
    const commonSummary = `<div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(order.serviceLabel)}</span><b class="my-order-status admin-orders-status-pill ${statusTone}">${escapeHTML(order.adminStatus)}</b></div><h2>${escapeHTML(title)}</h2><p class="my-order-summary">${escapeHTML(summary || 'Order details will appear here.')}</p>${receiptSummary}<div class="my-order-card-bottom"><small>${[reference, date ? new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${Number(order.totalAmount || order.total || 0).toFixed(2)}</strong></div>`;
    const dataAttributes = `data-order-key="${escapeHTML(order.storageKey)}" data-order-id="${escapeHTML(order.id)}"${order.serviceId === 'marketplace' ? ` data-order-version="${escapeHTML(order._orderVersion ?? '')}"` : ''}`;
    if (currentOrderView) {
      const target = `#admin-orders?service=${encodeURIComponent(order.serviceId)}&status=all&order=${encodeURIComponent(order.id)}&key=${encodeURIComponent(order.storageKey)}`;
      return `<a class="my-order-card admin-orders-card admin-current-order-card" href="${target}" ${dataAttributes}><div class="my-order-card-summary">${commonSummary}<span class="my-order-expand-hint">Open Order Details <span aria-hidden="true">→</span></span></div></a>`;
    }
    const paymentStatus = order.paymentStatus || 'Pending Payment';
    const receiptType = order.serviceId === 'marketplace' || /full/i.test(order.receipt?.type || '') ? 'Full Payment' : 'Deposit';
    const importantRows = importantOrderRows(order).map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
    const savedReceiptLink = receipt?.data
      ? `<a class="admin-order-receipt-link" href="${escapeHTML(receipt.data)}" target="_blank" rel="noopener" download="${escapeHTML(receipt.name || 'receipt')}">View uploaded receipt: ${escapeHTML(receipt.name || 'Receipt')}</a>`
      : receipt?.document ? '<span class="admin-order-receipt-link">Receipt details ready for customer download</span>' : '';
    const uploadSection = `<section class="admin-order-receipt-section"><h3>Receipt</h3>${receiptEditorMarkup(order, reference, receiptType)}<p class="admin-order-payment-status">${escapeHTML(paymentStatus)}</p><p class="admin-order-receipt-status">${escapeHTML(receiptStatusLabel(order))}</p>${receipt ? `<div class="admin-order-receipt-file-actions">${savedReceiptLink}<button class="admin-orders-delete-receipt" type="button" data-delete-order-receipt>Delete Receipt</button></div>` : ''}</section>`;
    const statusSection = `<section class="admin-order-status-section"><h3>Order Status</h3>${statusProgressMarkup(order)}${adminOrderStatusControl(order)}</section>`;
    const openOrder = routeParams.get('order') === String(order.id) && routeParams.get('key') === order.storageKey;
    return `<details class="my-order-card admin-orders-card" ${dataAttributes} data-order-stage="${orderStage(order)}"${openOrder ? ' open' : ''}><summary class="my-order-card-summary">${commonSummary}<span class="my-order-expand-hint">View Order Details <span aria-hidden="true">⌄</span></span></summary><div class="my-order-expanded admin-orders-detail">${uploadSection}${statusSection}${taxiActionMarkup}<dl class="admin-order-important-details">${importantRows}</dl>${taxiTracking}</div></details>`;
    } catch (error) {
      console.error('Admin order could not be rendered:', order?.id || order?.reference || 'unknown order', error);
      return `<article class="my-order-card admin-orders-card admin-order-render-error"><p>This order could not be displayed. Refresh the page or contact support if it continues.</p><strong>${escapeHTML(order?.reference || order?.id || 'Order')}</strong></article>`;
    }
  }).join('');
  const serviceTabs = `<a class="my-orders-tab ${selectedService === 'all' && !currentOrderView ? 'is-active' : ''}" href="#admin-orders?view=all" ${selectedService === 'all' && !currentOrderView ? 'aria-current="page"' : ''}>All Orders</a>${serviceFilters.map((item) => `<a class="my-orders-tab ${selectedService === item.id && !currentOrderView ? 'is-active' : ''}" href="#admin-orders?service=${encodeURIComponent(item.id)}" ${selectedService === item.id && !currentOrderView ? 'aria-current="page"' : ''}>${escapeHTML(item.label)}</a>`).join('')}`;
  const stageTabs = currentOrderView ? '' : `<nav class="my-orders-status-tabs admin-order-stage-tabs" aria-label="Filter orders by status">${stageFilters.map((item) => `<a class="my-orders-status-tab ${selectedStage === item.id ? 'is-active' : ''}" href="#admin-orders?service=${encodeURIComponent(selectedService)}${selectedService === 'all' ? '&view=all' : ''}&status=${encodeURIComponent(item.id)}" ${selectedStage === item.id ? 'aria-current="page"' : ''}>${escapeHTML(item.label)}<span>${orders.filter((order) => {
    if (item.id === 'all') return true;
    const status = customerOrderStatus(order);
    if (item.id === 'new') return ['New Order', 'Pending Payment'].includes(status);
    if (item.id === 'received') return status === 'Received Order';
    if (item.id === 'shipped') return status === 'Shipped';
    if (item.id === 'checked-in') return status === 'Checked-In';
    if (item.id === 'pet-taxi') return ['Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup'].includes(status);
    if (item.id === 'in-progress') return status === 'In Progress';
    if (item.id === 'completed') return statusCategory(status) === 'completed';
    if (item.id === 'cancelled') return statusCategory(status) === 'canceled';
    return statusCategory(status) === 'no-show';
  }).length}</span></a>`).join('')}</nav>`;
  return `<main class="admin-portal-page admin-orders-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="${homeHref}"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>${portalName}</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}${profile.outletShortform ? ` · ${escapeHTML(profile.outletShortform)}` : ''}</span><a href="${homeHref}">${isDirector ? 'Dashboard' : 'Admin'}</a><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Admin Home">‹</a><div><span>Customer operations${!isDirector && profile.outletShortform ? ` · ${escapeHTML(profile.outletShortform)}` : ''}</span><h1>${escapeHTML(orderSectionTitle)}</h1></div></header>${currentOrderView ? '<p class="admin-order-subtitle">Received orders scheduled for today and orders currently checked in.</p>' : ''}<nav class="my-orders-tabs admin-order-service-tabs" aria-label="Filter all orders by service">${serviceTabs}</nav>${stageTabs}${orderSummaryStats}<section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Order management</span><h2>${escapeHTML(orderSectionTitle)}</h2></div><p>${!isDirector && !profile.outletName ? 'No outlet is assigned to this account yet. Ask a Director to assign one before managing orders.' : currentOrderView ? 'Showing Received Orders scheduled for today and all orders currently Checked-In. Select an order to open its full details.' : 'Review receipts, update order status, and view customer and booking details.'}</p></div><div class="admin-orders-list">${visibleOrders.length ? cards : '<p class="admin-market-empty">No orders in this section.</p>'}</div></section></main>`;
}

export function adminOrdersPage(routeParams = new URLSearchParams()) {
  try {
    return renderAdminOrdersPage(routeParams);
  } catch (error) {
    console.error('Admin Orders failed to render:', error);
    return `<main class="admin-portal-page admin-orders-page"><section class="admin-market-panel"><h1>Orders could not be loaded</h1><p>${escapeHTML(error?.message || 'Unexpected page error')}</p><a class="button button-primary" href="#admin-orders?service=all&view=all">Reload Orders</a></section></main>`;
  }
}

export function adminCurrentOrderPage(routeParams = new URLSearchParams()) {
  const role = sessionStorage.getItem('furgo-demo-user-role') || 'executive';
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  const isDirector = ['admin', 'director'].includes(role);
  const homeHref = isDirector ? '#admin' : '#admin-access';
  const portalName = role === 'manager' ? 'Manager Portal' : role === 'executive' || role === 'staff' ? 'Executive Portal' : 'Director Portal';
  const selectedTab = routeParams.get('tab') === 'checked-in' ? 'checked-in' : 'today';
  const orders = allAdminOrders();
  const todaysReceivedOrders = orders.filter((order) => order.adminStatus === 'Received Order' && isOrderCurrentToday(order));
  const checkedInOrders = orders.filter((order) => order.adminStatus === 'Checked-In');
  const visibleOrders = selectedTab === 'checked-in' ? checkedInOrders : todaysReceivedOrders;
  const orderCards = visibleOrders.map((order) => {
    const reference = order.reference || order.id || 'Order';
    const title = order.title || (order.serviceId === 'marketplace'
      ? `Order ${reference}`
      : `${order.petName || order.pet?.name || 'Pet'} · ${order.packageName || order.roomName || order.serviceLabel}`);
    const summary = order.summary || [order.packageName || order.roomName || order.productName || order.itemName,
      order.date || order.checkIn || order.bookingDate, order.time || order.slot, order.outlet || order.location].filter(Boolean).join(' · ');
    const scheduledDate = order.serviceId === 'hotel'
      ? order.checkIn || order.startDate || order.date || order.bookingDate
      : order.date || order.visitDate || order.bookingDate || order.checkIn;
    const createdDate = order.createdAt || order.created_at || scheduledDate || '';
    const dateLabel = createdDate && !Number.isNaN(new Date(createdDate).getTime())
      ? new Date(createdDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const amount = Number(order.totalAmount || order.total || order.amount || 0);
    const target = `#admin-orders?service=${encodeURIComponent(order.serviceId)}&view=all&status=all&order=${encodeURIComponent(order.id)}&key=${encodeURIComponent(order.storageKey)}`;
    const statusTone = statusCategory(order.adminStatus) === 'completed' ? 'is-complete' : '';
    return `<a class="my-order-card admin-orders-card admin-current-order-card" href="${target}"><div class="my-order-card-summary"><div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(order.serviceLabel)}</span><b class="my-order-status admin-orders-status-pill ${statusTone}">${escapeHTML(order.adminStatus)}</b></div><h2>${escapeHTML(title)}</h2><p class="my-order-summary">${escapeHTML(summary || 'Order details will appear here.')}</p><div class="my-order-card-bottom"><small>${[reference, dateLabel].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}</strong></div><span class="my-order-expand-hint">Open in Furgo Order <span aria-hidden="true">→</span></span></div></a>`;
  }).join('');
  const tabs = `<nav class="my-orders-status-tabs admin-current-order-tabs" aria-label="Current order lists"><a class="my-orders-status-tab ${selectedTab === 'today' ? 'is-active' : ''}" href="#admin-current-order?tab=today" ${selectedTab === 'today' ? 'aria-current="page"' : ''}>Today’s Order <span>${todaysReceivedOrders.length}</span></a><a class="my-orders-status-tab ${selectedTab === 'checked-in' ? 'is-active' : ''}" href="#admin-current-order?tab=checked-in" ${selectedTab === 'checked-in' ? 'aria-current="page"' : ''}>Checked-In Order <span>${checkedInOrders.length}</span></a></nav>`;
  const emptyMessage = selectedTab === 'today' ? 'No received orders are scheduled for today.' : 'No orders are currently checked in.';
  return `<main class="admin-portal-page admin-orders-page admin-current-order-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="${homeHref}"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>${portalName}</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}${profile.outletShortform ? ` · ${escapeHTML(profile.outletShortform)}` : ''}</span><a href="${homeHref}">${isDirector ? 'Dashboard' : 'Admin'}</a><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header><header class="admin-market-heading"><a href="${homeHref}" aria-label="Admin Home">‹</a><div><span>Customer operations</span><h1>Current Order</h1></div></header>${adminCheckInScanPanelMarkup()}${tabs}<section class="admin-market-panel admin-current-order-list-panel"><div class="admin-market-panel-heading"><div><span>${selectedTab === 'today' ? 'Today' : 'Checked-In'}</span><h2>${selectedTab === 'today' ? 'Today’s Order' : 'Checked-In Order'}</h2></div><p>Select an order to open its details in Furgo Order.</p></div><div class="admin-orders-list">${orderCards || `<p class="admin-market-empty">${emptyMessage}</p>`}</div></section></main>`;
}

function readGeneratedReceipt(form) {
  const fields = form.elements;
  const isMarketplace = form.dataset.marketplaceReceipt === 'true';
  const items = fields.items.value.trim();
  const marketplaceItems = isMarketplace ? items.split(/\r?\n/).map((line) => {
    const [description = '', quantity = '', price = ''] = line.split('|').map((value) => value.trim());
    return { description, quantity: Math.max(1, Number(quantity) || 1), price: Math.max(0, Number(price) || 0) };
  }).filter((item) => item.description) : [];
  return {
    receiptNo: fields.receiptNo.value.trim(),
    receiptDate: fields.receiptDate.value,
    receiptType: isMarketplace ? 'Full Payment' : fields.receiptType.value,
    isMarketplace,
    customerName: fields.customerName.value.trim(),
    customerPhone: fields.customerPhone.value.trim(),
    customerEmail: fields.customerEmail.value.trim(),
    orderNo: fields.orderNo.value.trim(),
    items,
    marketplaceItems,
    subtotal: Number(fields.subtotal.value),
    discount: Number(fields.discount.value),
    delivery: Number(fields.delivery.value),
    total: Number(fields.total.value),
    paymentMethod: fields.paymentMethod.value.trim(),
    paymentStatus: fields.paymentStatus.value.trim(),
    issuedBy: fields.issuedBy.value.trim(),
  };
}


// Saves admin status changes and receipt files into the same storage records read by My Orders.
export function setupAdminOrders() {
  adminOrderLocationCleanups.forEach((cleanup) => cleanup());
  adminOrderLocationCleanups = [...document.querySelectorAll('[data-live-driver-location]')].map(mountDriverLocation);
  const openedOrder = document.querySelector('.admin-orders-card[open]');
  if (openedOrder && new URLSearchParams(window.location.hash.split('?')[1] || '').has('order')) {
    window.setTimeout(() => openedOrder.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  const scanStatus = document.querySelector('[data-checkin-scan-feedback]');
  const video = document.querySelector('[data-checkin-video]');
  const startScanButton = document.querySelector('[data-start-checkin-scan]');
  const codeInput = document.querySelector('[data-checkin-manual-form] input[name="token"]');
  const previewDialog = document.querySelector('[data-checkin-preview-dialog]');
  setupCheckInCodeInput(codeInput);
  const routeParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const scannedCode = routeParams.get('code');
  if (scannedCode && codeInput) {
    codeInput.value = formatCheckInToken(scannedCode.trim().toUpperCase().replace(/[\s-]/g, ''));
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (scanStatus) scanStatus.textContent = 'QR code scanned. Review the order details and confirm to continue.';
    codeInput.focus({ preventScroll: true });
  }
  let cameraScanner = null;
  const stopCamera = () => {
    cameraScanner?.stop();
    cameraScanner = null;
    if (video) { video.pause(); video.srcObject = null; video.hidden = true; }
  };
  const showScanResult = async (rawCode) => {
    const normalizedToken = extractCheckInCode(rawCode);
    const { data: outletCheck, error: outletError } = await supabase.rpc('check_admin_qr_outlet', { p_token: normalizedToken });
    if (outletError || !outletCheck?.ok) {
      if (scanStatus) scanStatus.textContent = outletError?.message || outletCheck?.message || 'Could not verify the order outlet. Apply migration 0026 in Supabase and try again.';
      return false;
    }
    if (!outletCheck.allowed) {
      if (scanStatus) scanStatus.textContent = outletCheck.message;
      return false;
    }
    const result = applyCheckInScan(rawCode);
    if (scanStatus) scanStatus.textContent = result.message;
    if (!result.ok) return false;
    if (result.alreadyProcessed) return true;
    void recordAdminAction('customer_check_in_updated', 'order', result.order.reference || result.order.id, { status: result.nextStatus });
    const card = [...document.querySelectorAll('.admin-orders-card')].find((item) => item.dataset.orderKey === result.orderKey && item.dataset.orderId === String(result.order.id));
    if (card) {
      const pill = card.querySelector('.admin-orders-status-pill');
      if (pill) pill.textContent = result.nextStatus;
      const currentStatus = card.querySelector('.admin-order-current-status');
      if (currentStatus) currentStatus.textContent = result.nextStatus;
      const statusRow = [...card.querySelectorAll('.admin-orders-detail dt')].find((label) => label.textContent.trim().toLowerCase() === 'status')?.parentElement;
      if (statusRow?.querySelector('dd')) statusRow.querySelector('dd').textContent = result.nextStatus;
    }
    try {
      const records = readOrders(result.orderKey);
      const updatedOrder = records.find((item) => String(item.id) === String(result.order.id)) || result.order;
      await saveOrderRecords(result.orderKey, updatedOrder, records);
    } catch (error) {
      if (scanStatus) scanStatus.textContent = `Order marked ${result.nextStatus}, but the shared status could not be updated: ${error.message}`;
      return false;
    }
    return true;
  };
  const showPreviewForCode = async (rawCode) => {
    const code = extractCheckInCode(rawCode);
    if (!code) return false;
    if (scanStatus) scanStatus.textContent = 'Looking up the code…';
    try { await refreshCheckInTokens(); }
    catch (error) {
      if (scanStatus) scanStatus.textContent = `Could not refresh shared check-in codes: ${error.message}`;
      return false;
    }
    const { data: outletCheck, error: outletError } = await supabase.rpc('check_admin_qr_outlet', { p_token: code });
    if (outletError || !outletCheck?.ok) {
      if (scanStatus) scanStatus.textContent = outletError?.message || outletCheck?.message || 'Could not verify the order outlet. Apply migration 0026 in Supabase and try again.';
      return false;
    }
    if (!outletCheck.allowed) {
      stopCamera();
      if (previewDialog) {
        previewDialog.dataset.checkinCode = '';
        previewDialog.innerHTML = `<div class="admin-checkin-preview-heading"><span>Outlet Assignment</span><h2 id="checkin-preview-title">Order Is From Another Outlet</h2></div><p class="admin-checkin-preview-message">${escapeHTML(outletCheck.message || 'This order is not assigned to your outlet.')}</p><footer><button type="button" class="button button-light" data-cancel-checkin-preview>Close</button><button type="button" class="button button-primary" disabled>Check In</button></footer>`;
        if (!previewDialog.open) previewDialog.showModal();
      }
      if (scanStatus) scanStatus.textContent = outletCheck.message || 'This order is not assigned to your outlet.';
      return false;
    }
    const preview = previewCheckInScan(code);
    if (!preview.ok) {
      if (scanStatus) scanStatus.textContent = preview.message;
      return false;
    }
    if (!previewDialog) {
      if (scanStatus) scanStatus.textContent = 'Order details are ready, but the confirmation window could not be opened. Reload the page and try again.';
      return false;
    }
    stopCamera();
    previewDialog.dataset.checkinCode = code;
    previewDialog.innerHTML = checkInPreviewMarkup(preview);
    if (!previewDialog.open) previewDialog.showModal();
    if (scanStatus) scanStatus.textContent = `Order found. Review the details and confirm ${preview.stage === 'check-out' ? 'check-out' : 'check-in'}.`;
    return true;
  };
  const fillCodeFromScan = (rawCode) => {
    const code = extractCheckInCode(rawCode);
    if (!codeInput || !code) {
      if (scanStatus) scanStatus.textContent = 'The QR code did not contain a manual check-in code.';
      return false;
    }
    codeInput.value = formatCheckInToken(code);
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    void showPreviewForCode(code);
    return true;
  };
  startScanButton?.addEventListener('click', async () => {
    if (cameraScanner) return;
    try {
      if (scanStatus) scanStatus.textContent = 'Starting camera…';
      try { await refreshCheckInTokens(); }
      catch (error) {
        if (scanStatus) scanStatus.textContent = `Could not refresh shared check-in codes: ${error.message}`;
      }
      cameraScanner = await startQRScanner({
        video,
        shouldRun: () => video.isConnected,
        onStatus: (message) => { if (scanStatus) scanStatus.textContent = message; },
        onCode: fillCodeFromScan,
      });
    } catch (error) {
      stopCamera();
      if (scanStatus) scanStatus.textContent = `${error.message} Allow camera permission, or enter the scanned code below.`;
    }
  });
  if (startScanButton) window.addEventListener('hashchange', stopCamera, { once: true });
  document.querySelector('[data-checkin-manual-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await showPreviewForCode(new FormData(event.currentTarget).get('token'));
  });
  previewDialog?.addEventListener('click', async (event) => {
    if (event.target.closest('[data-cancel-checkin-preview]')) previewDialog.close();
    if (!event.target.closest('[data-confirm-checkin-preview]')) return;
    const confirmButton = event.target.closest('[data-confirm-checkin-preview]');
    confirmButton.disabled = true;
    if (await showScanResult(previewDialog.dataset.checkinCode)) {
      previewDialog.close();
      if (codeInput) codeInput.value = '';
    } else {
      confirmButton.disabled = false;
    }
  });
  previewDialog?.addEventListener('click', (event) => {
    if (event.target === previewDialog) previewDialog.close();
  });
  if (scannedCode) void showPreviewForCode(scannedCode);

  document.querySelectorAll('[data-admin-order-status]').forEach((select) => select.addEventListener('change', async () => {
    const [key, id] = select.dataset.adminOrderStatus.split('|');
    const nextStatus = select.value;
    const serviceId = key.includes('marketplace') ? 'marketplace' : key.includes('hotel') ? 'hotel' : key.includes('daycare') ? 'daycare' : 'grooming';
    const records = readOrders(key);
    const order = records.find((item) => String(item.id) === id);
    if (!order) { window.alert('This order could not be found. Refresh the page and try again.'); return; }
    if (nextStatus === 'No-Show') {
      if (!canMarkOrderNoShow({ ...order, serviceId })) {
        window.alert('No-Show is available only after the scheduled service time has passed and before check-in.');
        window.dispatchEvent(new Event('hashchange'));
        return;
      }
      if (!window.confirm('Mark this order as No-Show? This status does not issue a refund.')) {
        window.dispatchEvent(new Event('hashchange'));
        return;
      }
    }
    const previousStatus = customerOrderStatus({ ...order, serviceId });
    select.disabled = true;
    try {
      if (key === marketplaceOrdersKey) {
        await updateMarketplaceOrder(id, select.closest('[data-order-version]')?.dataset.orderVersion, 'status', { status: nextStatus });
      } else {
        const now = new Date().toISOString();
        order.status = nextStatus;
        order.adminStatus = nextStatus;
        if (nextStatus === 'No-Show') order.noShowAt = now;
        if (nextStatus === 'Checked-In') order.checkedInAt = order.checkedInAt || now;
        if (nextStatus === 'Completed') order.completedAt = now;
        if (nextStatus === 'Cancelled') order.cancelledAt = now;
        let actor = 'Admin';
        try { const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); if (profile.name) actor = `${profile.name} (${profile.role || 'Admin'})`; } catch { /* keep generic admin label */ }
        order.statusHistory = [...(order.statusHistory || []), { status: nextStatus, previousStatus, changedAt: now, changedBy: actor }];
        await saveOrderRecords(key, order, records);
      }
      void recordAdminAction('order_status_updated', 'order', order.reference || id, { previousStatus, status: nextStatus });
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      select.disabled = false;
      window.alert(`The order status could not be saved: ${error.message}`);
      window.dispatchEvent(new Event('hashchange'));
    }
  }));

  document.querySelectorAll('[data-admin-taxi-action]').forEach((button) => button.addEventListener('click', async () => {
    const card = button.closest('.admin-orders-card');
    if (!card) return;
    const key = card.dataset.orderKey;
    const id = card.dataset.orderId;
    const records = readOrders(key);
    const order = records.find((item) => String(item.id) === id);
    if (!order) return;
    const action = button.dataset.adminTaxiAction;
    const expectedProgress = { 'Checked-In': 'Picked Up', Done: 'Checked-In', 'Check Out': 'Service Complete · Awaiting Pickup' }[action];
    if (!expectedProgress || (order.taxiProgress?.status || 'Scheduled') !== expectedProgress) {
      window.alert('The Pet Taxi status changed. Refresh the order and try again.');
      return;
    }
    const now = new Date().toISOString();
    const nextStatus = action === 'Checked-In' ? 'Checked-In'
      : action === 'Done' ? 'Service Complete · Awaiting Pickup' : 'Pet Taxi Delivering...';
    const nextTaxiProgress = action === 'Checked-In' ? 'Checked-In'
      : action === 'Done' ? 'Service Complete · Awaiting Pickup' : 'Returning to Customer';
    const previousStatus = order.status || order.adminStatus || 'Pet Taxi Delivering...';
    order.status = nextStatus;
    order.adminStatus = nextStatus;
    order.taxiProgress = { ...(order.taxiProgress || {}), status: nextTaxiProgress,
      ...(action === 'Checked-In' ? { checkedInAt: now } : {}),
      ...(action === 'Done' ? { serviceCompletedAt: now } : {}),
      ...(action === 'Check Out' ? { returningAt: now } : {}),
    };
    order.statusHistory = [...(order.statusHistory || []), { status: nextStatus, previousStatus, changedAt: now, changedBy: 'Admin' }];
    button.disabled = true;
    const feedback = card.querySelector('[data-admin-taxi-feedback]');
    try {
      await saveOrderRecords(key, order, records);
      void recordAdminAction('order_status_updated', 'order', order.reference || id, { status: nextStatus });
      if (feedback) feedback.textContent = `Status updated to ${nextStatus}.`;
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      button.disabled = false;
      if (feedback) feedback.textContent = `Could not update status: ${error.message}`;
      window.alert(`Could not update the Pet Taxi status: ${error.message}`);
    }
  }));

  document.querySelectorAll('[data-open-order-receipt]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const card = button.closest('.admin-orders-card');
    if (card) card.open = true;
    card?.querySelector('[data-admin-order-receipt]')?.click();
  }));

  document.querySelectorAll('[data-open-generated-receipt]').forEach((button) => button.addEventListener('click', () => {
    const form = button.closest('.admin-generated-receipt')?.querySelector('[data-generated-receipt-form]');
    if (!form) return;
    form.hidden = !form.hidden;
    button.textContent = form.hidden ? (button.dataset.hasGeneratedReceipt === 'true' ? 'Edit Generated Receipt' : 'Generate Receipt') : 'Close Receipt Editor';
  }));

  document.querySelectorAll('[data-download-generated-receipt]').forEach((button) => button.addEventListener('click', async () => {
    const card = button.closest('.admin-orders-card');
    const order = readOrders(card?.dataset.orderKey).find((item) => String(item.id) === String(card?.dataset.orderId));
    if (!order?.receipt?.document) {
      window.alert('Receipt details are not available yet.');
      return;
    }
    button.disabled = true;
    try {
      const pdf = await makeReceiptPdf(order.receipt.document);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = order.receipt.name || 'furgo-receipt.pdf';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(error.message || 'The receipt could not be generated. Please try again.');
    } finally {
      button.disabled = false;
    }
  }));

  document.querySelectorAll('[data-generate-receipt]').forEach((button) => button.addEventListener('click', async () => {
    const form = button.closest('[data-generated-receipt-form]');
    const card = button.closest('.admin-orders-card');
    if (!form?.reportValidity() || !card) return;
    const receiptDocument = readGeneratedReceipt(form);
    const key = card.dataset.orderKey;
    const id = card.dataset.orderId;
    const orders = readOrders(key);
    const order = orders.find((item) => String(item.id) === id);
    if (!order) { window.alert('The order could not be found. Refresh and try again.'); return; }
    const receipt = {
      name: `${receiptDocument.receiptNo.replace(/[^a-z0-9-_]+/gi, '-') || 'furgo-receipt'}.pdf`,
      type: receiptDocument.receiptType,
      document: receiptDocument,
    };
    button.disabled = true;
    const feedback = form.querySelector('[data-generated-receipt-feedback]');
    if (feedback) feedback.textContent = 'Saving receipt details…';
    try {
      if (key === marketplaceOrdersKey) {
        await updateMarketplaceOrder(id, card.dataset.orderVersion, 'save_receipt', receipt);
      } else {
        const previousStatus = order.receipt?.previousStatus || getAdminStatus(order);
        const previousPaymentStatus = order.receipt?.previousPaymentStatus ?? order.paymentStatus;
        const uploadedAt = new Date().toISOString();
        order.receipt = { ...receipt, uploadedAt, previousStatus, previousPaymentStatus };
        const taxiTripStarted = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff)
          && !['Scheduled', 'Assigned'].includes(order.taxiProgress?.status || 'Scheduled');
        if (!taxiTripStarted && !['Checked-In', 'Completed', 'Cancelled', 'Shipped'].includes(previousStatus)) {
          order.status = 'Received Order';
          order.adminStatus = 'Received Order';
          order.statusHistory = [...(order.statusHistory || []), { status: 'Received Order', previousStatus, changedAt: uploadedAt, changedBy: 'Generated receipt' }];
        }
        await saveOrderRecords(key, order, orders);
      }
      void recordAdminAction('receipt_generated', 'order', order.reference || id, { generated: true, receiptNo: receiptDocument.receiptNo });
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      button.disabled = false;
      if (feedback) feedback.textContent = `Receipt details could not be saved: ${error.message || 'Please try again.'}`;
    }
  }));

  document.querySelectorAll('[data-delete-order-receipt]').forEach((button) => button.addEventListener('click', async () => {
    const card = button.closest('.admin-orders-card');
    if (!card || !window.confirm('Delete the uploaded receipt for this order?')) return;
    const key = card.dataset.orderKey;
    const id = card.dataset.orderId;
    const orders = readOrders(key);
    const order = orders.find((item) => String(item.id) === id);
    if (!order?.receipt) return;
    if (key === marketplaceOrdersKey) button.disabled = true;
    try {
      if (key === marketplaceOrdersKey) {
        await updateMarketplaceOrder(id, card.dataset.orderVersion, 'remove_receipt');
      } else {
        const previousStatus = order.receipt.previousStatus;
        const previousPaymentStatus = order.receipt.previousPaymentStatus;
        delete order.receipt;
        if (previousPaymentStatus !== undefined) order.paymentStatus = previousPaymentStatus;
        if (getAdminStatus({ ...order, receipt: null }) === 'Received Order' && previousStatus) {
          order.status = previousStatus;
          order.adminStatus = previousStatus;
          order.statusHistory = [...(order.statusHistory || []), { status: previousStatus, previousStatus: 'Received Order', changedAt: new Date().toISOString(), changedBy: 'Admin receipt removal' }];
        }
        await saveOrderRecords(key, order, orders);
      }
      void recordAdminAction('receipt_removed', 'order', order.reference || id);
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      if (key === marketplaceOrdersKey) button.disabled = false;
      window.alert(`The receipt could not be synced: ${error.message}`);
    }
  }));
}
