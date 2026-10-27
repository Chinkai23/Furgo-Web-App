import { escapeHTML } from '../shared.js';
import { marketplaceOrdersKey, loadMarketplaceOrders } from './marketplace-data.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { applyCheckInScan, extractCheckInCode, formatCheckInToken, previewCheckInScan, refreshCheckInTokens, setupCheckInCodeInput } from './check-in.js';
import { mountDriverLocation } from './driver-location.js';
import { recordAdminAction } from '../admin-audit.js';
import { startQRScanner } from '../qr-scanner.js';
import { saveOrderRecords } from '../app-data-sync.js';
import { supabase } from '../supabase.js';
import { customerOrderStatus, statusCategory } from '../order-status.js';
import { adminOrderProgressMarkup, adminOrderStatusControl, canMarkOrderNoShow, isOrderCurrentToday } from '../admin-order-ui.js';

const daycareKeys = ['furgo-demo-daycare-bookings', 'furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders'];
let adminOrderLocationCleanups = [];
const orderSources = [
  { id: 'marketplace', label: 'Marketplace', key: marketplaceOrdersKey, load: loadMarketplaceOrders },
  { id: 'grooming', label: 'Grooming', key: groomingBookingsKey, load: loadGroomingBookings },
  { id: 'hotel', label: 'Pet Hotel', key: hotelBookingsKey, load: loadHotelBookings },
  ...daycareKeys.map((key) => ({ id: 'daycare', label: 'Pet Daycare', key, load: () => readOrders(key) })),
];

function readOrders(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

const getAdminStatus = customerOrderStatus;

function allAdminOrders() {
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  return orderSources.flatMap((source) => source.load().map((order) => ({ ...order, serviceId: source.id, serviceLabel: source.label, storageKey: source.key, adminStatus: getAdminStatus(order) })))
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
  if (/deposit/i.test(order.receipt.type || order.paymentStatus || '')) return 'Deposit Receipt Uploaded';
  if (/full/i.test(order.receipt.type || order.paymentStatus || '')) return 'Full Payment Receipt Uploaded';
  return 'Deposit Receipt Uploaded';
}

function orderStage(order) {
  const status = customerOrderStatus(order);
  if (['completed', 'canceled', 'no-show'].includes(statusCategory(status))) return 'completed';
  if (order.serviceId === 'marketplace') return status === 'In Progress' ? 'progressing' : 'new';
  return order.receipt ? 'progressing' : 'new';
}

function statusProgressMarkup(order) {
  return adminOrderProgressMarkup(order);
}

function importantOrderRows(order) {
  const serviceDetails = order.serviceId === 'marketplace'
    ? [order.items?.map((item) => `${item.name || item.productName || 'Product'} × ${Number(item.quantity) || 1}`).join(', '), order.address?.street, order.address?.city, order.address?.state].filter(Boolean).join(' · ')
    : order.serviceId === 'hotel'
      ? [order.roomName, order.checkIn || order.startDate, order.checkOut || order.endDate, order.outlet].filter(Boolean).join(' · ')
      : [order.packageName || order.planName, order.date || order.bookingDate, order.time || order.dropoffTime, order.pickupTime && `Pick-up ${order.pickupTime}`, order.outlet].filter(Boolean).join(' · ');
  const payment = [order.paymentStatus || 'Pending Payment', order.paymentMethod].filter(Boolean).join(' · ');
  const pets = order.petNames?.length ? order.petNames.join(' | ') : order.petName || order.pet?.name;
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

// Admin order board: one place for new orders, service details, status updates, and customer receipts.
export function adminOrdersPage(routeParams = new URLSearchParams()) {
  const role = sessionStorage.getItem('furgo-demo-user-role') || 'executive';
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  const isDirector = ['admin', 'director'].includes(role);
  const homeHref = isDirector ? '#admin' : '#admin-access';
  const portalName = role === 'manager' ? 'Manager Portal' : role === 'executive' || role === 'staff' ? 'Executive Portal' : 'Director Portal';
  const allOrders = allAdminOrders();
  const serviceFilters = [{ id: 'all', label: 'Current Order' }, ...orderSources.filter((source, index, sources) => sources.findIndex((item) => item.id === source.id) === index).map(({ id, label }) => ({ id, label }))];
  const selectedService = serviceFilters.some((item) => item.id === routeParams.get('service')) ? routeParams.get('service') : 'all';
  const orders = allOrders.filter((order) => selectedService === 'all' ? isOrderCurrentToday(order) : order.serviceId === selectedService);
  const stageFilters = [
    { id: 'new', label: 'New Order' },
    { id: 'progressing', label: 'Progressing Order' },
    { id: 'completed', label: 'Completed Order' },
  ];
  const selectedStage = stageFilters.some((item) => item.id === routeParams.get('stage')) ? routeParams.get('stage') : 'new';
  const visibleOrders = selectedService === 'all' ? orders : orders.filter((order) => orderStage(order) === selectedStage);
  const orderSectionTitle = selectedService !== 'all' ? `${serviceFilters.find((item) => item.id === selectedService)?.label} Orders` : 'Current Order';
  const newCount = orders.filter((order) => orderStage(order) === 'new').length;
  const cards = visibleOrders.map((order) => {
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
    const receiptSummary = selectedService === 'all' ? '' : `<p class="admin-order-receipt-summary">Receipt: ${escapeHTML(receiptStatusLabel(order))}</p>`;
    const commonSummary = `<div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(order.serviceLabel)}</span><b class="my-order-status admin-orders-status-pill ${statusTone}">${escapeHTML(order.adminStatus)}</b></div><h2>${escapeHTML(title)}</h2><p class="my-order-summary">${escapeHTML(summary || 'Order details will appear here.')}</p>${receiptSummary}<div class="my-order-card-bottom"><small>${[reference, date ? new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${Number(order.totalAmount || order.total || 0).toFixed(2)}</strong></div>`;
    const dataAttributes = `data-order-key="${escapeHTML(order.storageKey)}" data-order-id="${escapeHTML(order.id)}"`;
    if (selectedService === 'all') return `<article class="my-order-card admin-orders-card admin-current-order-card" ${dataAttributes}><div class="my-order-card-summary">${commonSummary}</div>${adminOrderStatusControl(order)}</article>`;
    const paymentStatus = order.paymentStatus || 'Pending Payment';
    const receiptType = /full/i.test(order.receipt?.type || '') ? 'Full Payment' : 'Deposit';
    const importantRows = importantOrderRows(order).map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
    const uploadSection = `<section class="admin-order-receipt-section"><h3>Upload Receipt</h3><div class="admin-order-receipt-controls"><label>Receipt Type<select name="receiptType"><option ${receiptType === 'Deposit' ? 'selected' : ''}>Deposit</option><option ${receiptType === 'Full Payment' ? 'selected' : ''}>Full Payment</option></select></label><label class="admin-orders-upload">Choose Receipt<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" data-admin-order-receipt="${escapeHTML(order.storageKey)}|${escapeHTML(order.id)}" /></label></div><p class="admin-order-payment-status">${escapeHTML(paymentStatus)}</p><p class="admin-order-receipt-status">${escapeHTML(receiptStatusLabel(order))}</p>${receipt ? `<a class="admin-order-receipt-link" href="${escapeHTML(receipt.data)}" target="_blank" rel="noopener" download="${escapeHTML(receipt.name || 'receipt')}">View uploaded receipt: ${escapeHTML(receipt.name || 'Receipt')}</a><button class="admin-orders-delete-receipt" type="button" data-delete-order-receipt>Delete Receipt</button>` : ''}</section>`;
    const statusSection = `<section class="admin-order-status-section"><h3>Order Status</h3>${statusProgressMarkup(order)}${adminOrderStatusControl(order)}</section>`;
    return `<details class="my-order-card admin-orders-card" ${dataAttributes} data-order-stage="${orderStage(order)}"><summary class="my-order-card-summary">${commonSummary}<span class="my-order-expand-hint">View Order Details <span aria-hidden="true">⌄</span></span></summary><div class="my-order-expanded admin-orders-detail">${uploadSection}${statusSection}${taxiActionMarkup}<dl class="admin-order-important-details">${importantRows}</dl>${taxiTracking}</div></details>`;
  }).join('');
  const serviceTabs = serviceFilters.filter((item) => item.id !== 'marketplace').map((item) => `<a class="my-orders-tab ${selectedService === item.id ? 'is-active' : ''}" href="#admin-orders${item.id === 'all' ? '' : `?service=${encodeURIComponent(item.id)}`}" ${selectedService === item.id ? 'aria-current="page"' : ''}>${escapeHTML(item.label)}<span>${item.id === 'all' ? orders.length : allOrders.filter((order) => order.serviceId === item.id).length}</span></a>`).join('');
  const stageTabs = selectedService === 'all' ? '' : `<nav class="my-orders-status-tabs admin-order-stage-tabs" aria-label="Filter orders by status">${stageFilters.map((item) => `<a class="my-orders-status-tab ${selectedStage === item.id ? 'is-active' : ''}" href="#admin-orders?service=${encodeURIComponent(selectedService)}&stage=${encodeURIComponent(item.id)}" ${selectedStage === item.id ? 'aria-current="page"' : ''}>${escapeHTML(item.label)}<span>${orders.filter((order) => orderStage(order) === item.id).length}</span></a>`).join('')}</nav>`;
  return `<main class="admin-portal-page admin-orders-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="${homeHref}"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>${portalName}</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}${profile.outletShortform ? ` · ${escapeHTML(profile.outletShortform)}` : ''}</span><a href="${homeHref}">${isDirector ? 'Dashboard' : 'Admin'}</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Admin Home">‹</a><div><span>Customer operations${!isDirector && profile.outletShortform ? ` · ${escapeHTML(profile.outletShortform)}` : ''}</span><h1>${selectedService === 'all' ? 'Current Order' : `${escapeHTML(serviceFilters.find((item) => item.id === selectedService)?.label)} Orders`}</h1></div></header><nav class="my-orders-tabs admin-order-service-tabs" aria-label="Open a service order page">${serviceTabs}</nav>${stageTabs}<section class="admin-market-stats"><article><span>New orders</span><strong>${newCount}</strong></article><article><span>${selectedService === 'all' ? 'Current Orders' : 'All Orders'}</span><strong>${orders.length}</strong></article><article><span>Receipts uploaded</span><strong>${orders.filter((order) => order.receipt).length}</strong></article></section><section class="admin-market-panel admin-checkin-scan-panel"><div class="admin-market-panel-heading"><div><span>Visit check-in</span><h2>Scan Customer QR Code</h2></div><p>Scan a QR code or enter its manual code to review the matching order. The order updates only after you confirm.</p></div><div class="admin-checkin-scan-controls"><button class="button button-light" type="button" data-start-checkin-scan>Start camera scan</button><video class="admin-checkin-video" data-checkin-video playsinline muted hidden></video><p class="admin-checkin-scan-feedback" data-checkin-scan-feedback role="status" aria-live="polite">Camera access requires HTTPS and permission. You can also enter the scanned code below.</p><form class="admin-checkin-manual-form" data-checkin-manual-form><label>QR code<input name="token" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="17" minlength="10" pattern="[2-9A-HJ-NP-Z]{5}-?[2-9A-HJ-NP-Z]{5}|[2-9A-HJ-NP-Z]{17}" placeholder="e.g. 7K4MR-9TX2C" required /></label><button class="button button-primary" type="submit">Review Order</button></form></div></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Order management</span><h2>${escapeHTML(orderSectionTitle)}</h2></div><p>${!isDirector && !profile.outletName ? 'No outlet is assigned to this account yet. Ask a Director to assign one before managing orders.' : selectedService === 'all' ? 'Current order overview. Choose a service above to manage receipts and review full order details.' : 'Upload the outlet receipt, review the order status timeline, and check key customer and booking information.'}</p></div><div class="admin-orders-list">${visibleOrders.length ? cards : '<p class="admin-market-empty">No orders in this section.</p>'}</div></section><dialog class="admin-checkin-preview-dialog" data-checkin-preview-dialog aria-labelledby="checkin-preview-title"></dialog></main>`;
}

// Saves admin status changes and receipt files into the same storage records read by My Orders.
export function setupAdminOrders() {
  adminOrderLocationCleanups.forEach((cleanup) => cleanup());
  adminOrderLocationCleanups = [...document.querySelectorAll('[data-live-driver-location]')].map(mountDriverLocation);
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
    select.disabled = true;
    try {
      await saveOrderRecords(key, order, records);
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

  document.querySelectorAll('[data-admin-order-receipt]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024 || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) { window.alert('Choose a receipt image or PDF no larger than 1.5 MB.'); input.value = ''; return; }
    const [key, id] = input.dataset.adminOrderReceipt.split('|');
    const data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
    const orders = readOrders(key);
    const order = orders.find((item) => String(item.id) === id);
    if (!order || !data) { window.alert('The receipt could not be read. Please choose it again.'); return; }
    const previousStatus = order.receipt?.previousStatus || getAdminStatus(order);
    const previousPaymentStatus = order.receipt?.previousPaymentStatus ?? order.paymentStatus;
    const uploadedAt = new Date().toISOString();
    const receiptType = input.closest('.admin-order-receipt-section')?.querySelector('[name="receiptType"]')?.value || '';
    order.receipt = { name: file.name, data, type: receiptType, uploadedAt, previousStatus, previousPaymentStatus };
    const taxiTripStarted = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff)
      && !['Scheduled', 'Assigned'].includes(order.taxiProgress?.status || 'Scheduled');
    if (key !== marketplaceOrdersKey && !taxiTripStarted && !['Checked-In', 'Completed', 'Cancelled'].includes(previousStatus)) {
      order.status = 'Received Order';
      order.adminStatus = 'Received Order';
      order.statusHistory = [...(order.statusHistory || []), { status: 'Received Order', previousStatus, changedAt: order.receipt.uploadedAt, changedBy: 'Admin receipt upload' }];
    }
    try { await saveOrderRecords(key, order, orders); }
    catch (error) { window.alert(`The receipt could not be saved or synced: ${error.message}`); return; }
    void recordAdminAction('receipt_uploaded', 'order', order.reference || id);
    window.dispatchEvent(new Event('hashchange'));
  }));

  document.querySelectorAll('[data-delete-order-receipt]').forEach((button) => button.addEventListener('click', async () => {
    const card = button.closest('.admin-orders-card');
    if (!card || !window.confirm('Delete the uploaded receipt for this order?')) return;
    const key = card.dataset.orderKey;
    const id = card.dataset.orderId;
    const orders = readOrders(key);
    const order = orders.find((item) => String(item.id) === id);
    if (!order?.receipt) return;
    const previousStatus = order.receipt.previousStatus;
    const previousPaymentStatus = order.receipt.previousPaymentStatus;
    delete order.receipt;
    if (previousPaymentStatus !== undefined) order.paymentStatus = previousPaymentStatus;
    if (getAdminStatus({ ...order, receipt: null }) === 'Received Order' && previousStatus) {
      order.status = previousStatus;
      order.adminStatus = previousStatus;
      order.statusHistory = [...(order.statusHistory || []), { status: previousStatus, previousStatus: 'Received Order', changedAt: new Date().toISOString(), changedBy: 'Admin receipt removal' }];
    }
    try {
      await saveOrderRecords(key, order, orders);
      void recordAdminAction('receipt_removed', 'order', order.reference || id);
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      window.alert(`The receipt could not be synced: ${error.message}`);
    }
  }));
}
