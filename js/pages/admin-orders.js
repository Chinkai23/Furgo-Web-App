import { escapeHTML } from '../shared.js';
import { marketplaceOrdersKey, loadMarketplaceOrders } from './marketplace-data.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { applyCheckInScan, extractCheckInCode, formatCheckInToken, previewCheckInScan, refreshCheckInTokens, setupCheckInCodeInput } from './check-in.js';
import { driverLocationForOrder } from './driver.js';
import { recordAdminAction } from '../admin-audit.js';
import { startQRScanner } from '../qr-scanner.js';

const daycareKeys = ['furgo-demo-daycare-bookings', 'furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders'];
const orderSources = [
  { id: 'marketplace', label: 'Marketplace', key: marketplaceOrdersKey, load: loadMarketplaceOrders },
  { id: 'grooming', label: 'Grooming', key: groomingBookingsKey, load: loadGroomingBookings },
  { id: 'hotel', label: 'Pet Hotel', key: hotelBookingsKey, load: loadHotelBookings },
  ...daycareKeys.map((key) => ({ id: 'daycare', label: 'Pet Daycare', key, load: () => readOrders(key) })),
];

function readOrders(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

function getAdminStatus(order) {
  const rawStatus = String(order.status || order.adminStatus || '').trim();
  const normalized = rawStatus.toLowerCase().replace(/[-_]/g, ' ');
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (/cancel/.test(normalized)) return 'Cancelled';
  if (/complete|delivered|checked out/.test(normalized)) return 'Completed';
  if (/checked in/.test(normalized)) return 'Checked-In';
  if (order.receipt) return 'Received Order';
  const stored = String(order.adminStatus || '').toLowerCase();
  if (['new order', 'pending payment', 'received order', 'checked-in', 'completed', 'cancelled'].includes(stored)) {
    return stored === 'checked-in' ? 'Checked-In' : stored.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  if (/paid|successful|succeeded/.test(paymentStatus)) return 'New Order';
  if (/failed|declined|pending|awaiting|verification|unpaid/.test(paymentStatus) || /failed|declined|pending payment/.test(normalized)) return 'Pending Payment';
  if (/successful|succeeded/.test(normalized)) return 'New Order';
  return 'Pending Payment';
}

function allAdminOrders() {
  return orderSources.flatMap((source) => source.load().map((order) => ({ ...order, serviceId: source.id, serviceLabel: source.label, storageKey: source.key, adminStatus: getAdminStatus(order) })))
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
}

export function countNewAdminOrders() {
  return allAdminOrders().filter((order) => ['New Order', 'New'].includes(order.adminStatus)).length;
}

// Dashboard service notification: count only new orders from the requested service.
export function countNewAdminOrdersFor(serviceId) {
  return allAdminOrders().filter((order) => order.serviceId === serviceId && ['New Order', 'New'].includes(order.adminStatus)).length;
}

const labelize = (key) => key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
function displayValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? Object.entries(item).filter(([key]) => !['data', 'image', 'photo'].includes(key)).map(([key, entry]) => `${labelize(key)}: ${displayValue(entry)}`).join(' · ') : String(item)).join('; ') || '—';
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => !['data', 'image', 'photo'].includes(key)).map(([key, entry]) => `${labelize(key)}: ${displayValue(entry)}`).join(' · ') || '—';
  return String(value);
}

function detailRows(order) {
  const hidden = new Set(['receipt', 'paymentProof', 'transferSlip', 'mediaLogs', 'statusHistory', 'serviceId', 'serviceLabel', 'storageKey', 'adminStatus']);
  return Object.entries(order).filter(([key, value]) => !hidden.has(key) && value !== undefined && value !== null && value !== '').map(([key, value]) => `<div><dt>${escapeHTML(labelize(key))}</dt><dd>${escapeHTML(displayValue(value))}</dd></div>`).join('');
}

function petProfileForOrder(order) {
  try {
    const pets = JSON.parse(localStorage.getItem('furgo-demo-pet-profiles') || '[]');
    const petId = order.petId || order.pet?.id;
    return Array.isArray(pets) ? pets.find((pet) => String(pet.id) === String(petId) || (!petId && pet.name === order.petName)) || null : null;
  } catch { return null; }
}

function checkInPreviewMarkup(preview) {
  const order = preview.order || {};
  const source = orderSources.find((item) => item.key === preview.orderKey);
  const service = order.serviceLabel || order.service || source?.label || 'Service';
  const pet = petProfileForOrder(order);
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
export function adminOrdersPage() {
  const role = sessionStorage.getItem('furgo-demo-user-role') || 'executive';
  const isDirector = ['admin', 'director'].includes(role);
  const homeHref = isDirector ? '#admin' : '#admin-access';
  const portalName = role === 'manager' ? 'Manager Portal' : role === 'executive' || role === 'staff' ? 'Executive Portal' : 'Director Portal';
  const orders = allAdminOrders();
  const newCount = orders.filter((order) => ['New Order', 'New'].includes(order.adminStatus)).length;
  const cards = orders.map((order) => {
    const receipt = order.receipt;
    const driverLocation = driverLocationForOrder(order.storageKey, order.id);
    const locationHref = driverLocation && Number.isFinite(Number(driverLocation.latitude)) && Number.isFinite(Number(driverLocation.longitude))
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(driverLocation.latitude)}&mlon=${encodeURIComponent(driverLocation.longitude)}#map=16/${encodeURIComponent(driverLocation.latitude)}/${encodeURIComponent(driverLocation.longitude)}` : '';
    const taxiTracking = locationHref ? `<div class="admin-orders-driver-location"><strong>Pet Taxi driver location</strong><a href="${locationHref}" target="_blank" rel="noopener noreferrer">View latest location</a><small>Shared by ${escapeHTML(driverLocation.driverEmail || 'driver')} · ${escapeHTML(new Date(driverLocation.timestamp).toLocaleString())}</small></div>` : '';
    const reference = order.reference || order.id || 'Order';
    const customer = order.customerName || order.name || order.customer?.name || 'Customer';
    const date = order.createdAt || order.date || order.checkIn || '';
    const statuses = ['New Order', 'Pending Payment', 'Received Order', 'Checked-In', 'Completed', 'Cancelled'];
    const statusButtons = statuses.map((status) => `<button class="button ${order.adminStatus === status ? 'button-primary is-active' : 'button-light'}" type="button" data-order-lifecycle-status="${escapeHTML(status)}" ${order.adminStatus === status ? 'aria-current="step"' : ''} disabled aria-pressed="${order.adminStatus === status}">${escapeHTML(status)}</button>`).join('');
    return `<details class="admin-orders-card" data-order-key="${escapeHTML(order.storageKey)}" data-order-id="${escapeHTML(order.id)}"><summary><span class="admin-orders-reference"><strong>${escapeHTML(reference)}</strong><small>${escapeHTML(order.serviceLabel)} · ${escapeHTML(customer)}${date ? ` · ${escapeHTML(new Date(date).toLocaleDateString('en-MY'))}` : ''}</small></span><span class="admin-orders-status-pill">${escapeHTML(order.adminStatus)}</span><span class="admin-orders-receipt ${receipt ? 'has-receipt' : 'missing-receipt'}" aria-label="${receipt ? 'Receipt uploaded' : 'Receipt not uploaded'}" title="${receipt ? 'Receipt uploaded' : 'Receipt not uploaded'}">${receipt ? '✓' : '×'}</span></summary><div class="admin-orders-detail"><div class="admin-orders-actions"><div class="admin-order-status-control"><strong>Order Status</strong><div class="admin-order-status-buttons" role="group" aria-label="Order status lifecycle">${statusButtons}</div><small>Status updates automatically from payment, receipt upload, customer cancellation, and QR check-in/check-out.</small></div><label class="admin-orders-upload">Upload Receipt / Invoice<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" data-admin-order-receipt="${escapeHTML(order.storageKey)}|${escapeHTML(order.id)}" /></label></div><div class="admin-orders-receipt-preview">${receipt ? `<a href="${escapeHTML(receipt.data)}" target="_blank" rel="noopener" download="${escapeHTML(receipt.name || 'receipt')}">Current receipt: ${escapeHTML(receipt.name || 'View receipt')}</a>` : '<span>No receipt uploaded yet.</span>'}</div><dl>${detailRows(order)}</dl>${taxiTracking}</div></details>`;
  }).join('');
  return `<main class="admin-portal-page admin-orders-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="${homeHref}"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>${portalName}</span></a><div class="admin-portal-account"><a href="${homeHref}">${isDirector ? 'Dashboard' : 'Admin'}</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="${homeHref}" aria-label="Back to ${portalName}">‹</a><div><span>Customer operations</span><h1>Orders</h1></div></header><section class="admin-market-stats"><article><span>New orders</span><strong>${newCount}</strong></article><article><span>All orders</span><strong>${orders.length}</strong></article><article><span>Receipts uploaded</span><strong>${orders.filter((order) => order.receipt).length}</strong></article></section><section class="admin-market-panel admin-checkin-scan-panel"><div class="admin-market-panel-heading"><div><span>Visit check-in</span><h2>Scan Customer QR Code</h2></div><p>Scan a QR code or enter its manual code to review the matching order. The order updates only after you confirm.</p></div><div class="admin-checkin-scan-controls"><button class="button button-light" type="button" data-start-checkin-scan>Start camera scan</button><video class="admin-checkin-video" data-checkin-video playsinline muted hidden></video><p class="admin-checkin-scan-feedback" data-checkin-scan-feedback role="status" aria-live="polite">Camera access requires HTTPS and permission. You can also enter the scanned code below.</p><form class="admin-checkin-manual-form" data-checkin-manual-form><label>QR code<input name="token" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="17" minlength="10" pattern="[2-9A-HJ-NP-Z]{5}-?[2-9A-HJ-NP-Z]{5}|[2-9A-HJ-NP-Z]{17}" placeholder="e.g. 7K4MR-9TX2C" required /></label><button class="button button-primary" type="submit">Review Order</button></form></div></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Order management</span><h2>All Customer Orders</h2></div><p>Open an order to review its saved customer, service, pet, payment, and booking details. Update its status or upload a receipt/invoice for the customer.</p></div><div class="admin-orders-columns"><span>Order</span><span>Status</span><span>Receipt</span></div><div class="admin-orders-list">${cards || '<p class="admin-market-empty">No customer orders have been placed yet.</p>'}</div></section><dialog class="admin-checkin-preview-dialog" data-checkin-preview-dialog aria-labelledby="checkin-preview-title"></dialog></main>`;
}

// Saves admin status changes and receipt files into the same storage records read by My Orders.
export function setupAdminOrders() {
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
  const showScanResult = (rawCode) => {
    const result = applyCheckInScan(rawCode);
    if (scanStatus) scanStatus.textContent = result.message;
    if (!result.ok) return false;
    if (result.alreadyProcessed) return true;
    void recordAdminAction('customer_check_in_updated', 'order', result.order.reference || result.order.id, { status: result.nextStatus });
    const card = [...document.querySelectorAll('.admin-orders-card')].find((item) => item.dataset.orderKey === result.orderKey && item.dataset.orderId === String(result.order.id));
    if (card) {
      const pill = card.querySelector('.admin-orders-status-pill');
      if (pill) pill.textContent = result.nextStatus;
      card.querySelectorAll('[data-order-lifecycle-status]').forEach((button) => {
        const active = button.dataset.orderLifecycleStatus === result.nextStatus;
        button.classList.toggle('button-primary', active);
        button.classList.toggle('button-light', !active);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        if (active) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      const statusRow = [...card.querySelectorAll('.admin-orders-detail dt')].find((label) => label.textContent.trim().toLowerCase() === 'status')?.parentElement;
      if (statusRow?.querySelector('dd')) statusRow.querySelector('dd').textContent = result.nextStatus;
    }
    // Grooming bookings are synced through a dedicated Supabase table, so include the
    // source key expected by the shared cloud-update listener.
    document.dispatchEvent(new CustomEvent('furgo-order-status-updated', { detail: { ...result.order, orderKey: result.orderKey } }));
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
  previewDialog?.addEventListener('click', (event) => {
    if (event.target.closest('[data-cancel-checkin-preview]')) previewDialog.close();
    if (!event.target.closest('[data-confirm-checkin-preview]')) return;
    const confirmButton = event.target.closest('[data-confirm-checkin-preview]');
    confirmButton.disabled = true;
    if (showScanResult(previewDialog.dataset.checkinCode)) {
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

  document.querySelectorAll('[data-admin-order-receipt]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024 || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) { window.alert('Choose a receipt image or PDF no larger than 1.5 MB.'); input.value = ''; return; }
    const [key, id] = input.dataset.adminOrderReceipt.split('|');
    const data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
    const orders = readOrders(key);
    const order = orders.find((item) => String(item.id) === id);
    if (!order || !data) { window.alert('The receipt could not be read. Please choose it again.'); return; }
    const previousStatus = getAdminStatus(order);
    order.receipt = { name: file.name, data, uploadedAt: new Date().toISOString() };
    if (!['Checked-In', 'Completed', 'Cancelled'].includes(previousStatus)) {
      order.status = 'Received Order';
      order.adminStatus = 'Received Order';
      order.statusHistory = [...(order.statusHistory || []), { status: 'Received Order', previousStatus, changedAt: order.receipt.uploadedAt, changedBy: 'Admin receipt upload' }];
    }
    localStorage.setItem(key, JSON.stringify(orders));
    void recordAdminAction('receipt_uploaded', 'order', order.reference || id);
    window.dispatchEvent(new Event('hashchange'));
  }));
}
