import { escapeHTML } from '../shared.js';
import { marketplaceOrdersKey, loadMarketplaceOrders } from './marketplace-data.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { applyCheckInScan } from './check-in.js';
import { driverLocationForOrder } from './driver.js';

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
  if (order.adminStatus) return order.adminStatus;
  if (/cancel/i.test(order.status || '')) return 'Cancelled';
  if (/complete|delivered/i.test(order.status || '')) return 'Completed';
  return 'New';
}

function allAdminOrders() {
  return orderSources.flatMap((source) => source.load().map((order) => ({ ...order, serviceId: source.id, serviceLabel: source.label, storageKey: source.key, adminStatus: getAdminStatus(order) })))
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
}

export function countNewAdminOrders() {
  return allAdminOrders().filter((order) => order.adminStatus === 'New').length;
}

// Dashboard service notification: count only new orders from the requested service.
export function countNewAdminOrdersFor(serviceId) {
  return allAdminOrders().filter((order) => order.serviceId === serviceId && order.adminStatus === 'New').length;
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

// Admin order board: one place for new orders, service details, status updates, and customer receipts.
export function adminOrdersPage() {
  const orders = allAdminOrders();
  const newCount = orders.filter((order) => order.adminStatus === 'New').length;
  const cards = orders.map((order) => {
    const receipt = order.receipt;
    const driverLocation = driverLocationForOrder(order.storageKey, order.id);
    const locationHref = driverLocation && Number.isFinite(Number(driverLocation.latitude)) && Number.isFinite(Number(driverLocation.longitude))
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(driverLocation.latitude)}&mlon=${encodeURIComponent(driverLocation.longitude)}#map=16/${encodeURIComponent(driverLocation.latitude)}/${encodeURIComponent(driverLocation.longitude)}` : '';
    const taxiTracking = locationHref ? `<div class="admin-orders-driver-location"><strong>Pet Taxi driver location</strong><a href="${locationHref}" target="_blank" rel="noopener noreferrer">View latest location</a><small>Shared by ${escapeHTML(driverLocation.driverEmail || 'driver')} · ${escapeHTML(new Date(driverLocation.timestamp).toLocaleString())}</small></div>` : '';
    const reference = order.reference || order.id || 'Order';
    const customer = order.customerName || order.name || order.customer?.name || 'Customer';
    const date = order.createdAt || order.date || order.checkIn || '';
    return `<details class="admin-orders-card"><summary><span class="admin-orders-reference"><strong>${escapeHTML(reference)}</strong><small>${escapeHTML(order.serviceLabel)} · ${escapeHTML(customer)}${date ? ` · ${escapeHTML(new Date(date).toLocaleDateString('en-MY'))}` : ''}</small></span><span class="admin-orders-status-pill">${escapeHTML(order.adminStatus)}</span><span class="admin-orders-receipt ${receipt ? 'has-receipt' : 'missing-receipt'}" aria-label="${receipt ? 'Receipt uploaded' : 'Receipt not uploaded'}" title="${receipt ? 'Receipt uploaded' : 'Receipt not uploaded'}">${receipt ? '✓' : '×'}</span></summary><div class="admin-orders-detail"><dl>${detailRows(order)}</dl>${taxiTracking}<div class="admin-orders-receipt-preview">${receipt ? `<a href="${escapeHTML(receipt.data)}" target="_blank" rel="noopener" download="${escapeHTML(receipt.name || 'receipt')}">Current receipt: ${escapeHTML(receipt.name || 'View receipt')}</a>` : '<span>No receipt uploaded yet.</span>'}</div><div class="admin-orders-actions"><label>Order status<select data-admin-order-status="${escapeHTML(order.storageKey)}|${escapeHTML(order.id)}">${['New', 'Recorded', 'In Progress', 'Checked In', 'Completed', 'Cancelled'].map((status) => `<option ${order.adminStatus === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button class="button button-light" type="button" data-save-admin-order-status="${escapeHTML(order.storageKey)}|${escapeHTML(order.id)}">Save status</button><label class="admin-orders-upload">Upload receipt / invoice<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" data-admin-order-receipt="${escapeHTML(order.storageKey)}|${escapeHTML(order.id)}" /></label></div></div></details>`;
  }).join('');
  return `<main class="admin-portal-page admin-orders-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Customer operations</span><h1>Orders</h1></div></header><section class="admin-market-stats"><article><span>New orders</span><strong>${newCount}</strong></article><article><span>All orders</span><strong>${orders.length}</strong></article><article><span>Receipts uploaded</span><strong>${orders.filter((order) => order.receipt).length}</strong></article></section><section class="admin-market-panel admin-checkin-scan-panel"><div class="admin-market-panel-heading"><div><span>Visit check-in</span><h2>Scan customer QR code</h2></div><p>Scan the customer's check-in or check-out QR code. Their booking status will update immediately.</p></div><div class="admin-checkin-scan-controls"><button class="button button-light" type="button" data-start-checkin-scan>Start camera scan</button><video class="admin-checkin-video" data-checkin-video playsinline muted hidden></video><p class="admin-checkin-scan-feedback" data-checkin-scan-feedback role="status" aria-live="polite">Camera access requires HTTPS and permission. You can also enter a QR code below.</p><form class="admin-checkin-manual-form" data-checkin-manual-form><label>QR code<input name="token" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="17" minlength="17" pattern="[2-9A-HJ-NP-Z]{17}" placeholder="17-character code" required /></label><button class="button button-primary" type="submit">Apply scan</button></form></div></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Order management</span><h2>All customer orders</h2></div><p>Open an order to review its saved customer, service, pet, payment, and booking details. Update its status or upload a receipt/invoice for the customer.</p></div><div class="admin-orders-columns"><span>Order</span><span>Status</span><span>Receipt</span></div><div class="admin-orders-list">${cards || '<p class="admin-market-empty">No customer orders have been placed yet.</p>'}</div></section></main>`;
}

// Saves admin status changes and receipt files into the same storage records read by My Orders.
export function setupAdminOrders() {
  const scanStatus = document.querySelector('[data-checkin-scan-feedback]');
  const video = document.querySelector('[data-checkin-video]');
  const startScanButton = document.querySelector('[data-start-checkin-scan]');
  let cameraStream = null;
  let scanActive = false;
  const stopCamera = () => {
    scanActive = false;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    if (video) { video.pause(); video.srcObject = null; video.hidden = true; }
  };
  const showScanResult = (rawCode) => {
    const result = applyCheckInScan(rawCode);
    if (scanStatus) scanStatus.textContent = result.message;
    if (!result.ok) return false;
    const card = [...document.querySelectorAll('.admin-orders-card')].find((item) => {
      const selector = item.querySelector('[data-admin-order-status]');
      const [orderKey, orderId] = String(selector?.dataset.adminOrderStatus || '|').split('|');
      return orderKey === result.orderKey && orderId === String(result.order.id);
    });
    if (card) {
      const pill = card.querySelector('.admin-orders-status-pill');
      const select = card.querySelector('[data-admin-order-status]');
      if (pill) pill.textContent = result.nextStatus;
      if (select) select.value = result.nextStatus;
      const statusRow = [...card.querySelectorAll('.admin-orders-detail dt')].find((label) => label.textContent.trim().toLowerCase() === 'status')?.parentElement;
      if (statusRow?.querySelector('dd')) statusRow.querySelector('dd').textContent = result.nextStatus;
    }
    document.dispatchEvent(new CustomEvent('furgo-order-status-updated', { detail: result.order }));
    return true;
  };
  startScanButton?.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) { if (scanStatus) scanStatus.textContent = 'Camera scanning is unavailable here. Enter the scanned code below.'; return; }
    if (!('BarcodeDetector' in window)) { if (scanStatus) scanStatus.textContent = 'This browser cannot scan QR codes directly. Use a supported browser or enter the scanned code below.'; return; }
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = cameraStream;
      video.hidden = false;
      await video.play();
      scanActive = true;
      if (scanStatus) scanStatus.textContent = 'Point the camera at the customer’s QR code.';
      const scanFrame = async () => {
        if (!scanActive || !video.isConnected) { stopCamera(); return; }
        try {
          const codes = await detector.detect(video);
          const code = codes.find((item) => item.rawValue)?.rawValue;
          if (code && showScanResult(code)) { stopCamera(); return; }
        } catch { /* Wait for another frame while the camera is active. */ }
        window.setTimeout(scanFrame, 250);
      };
      scanFrame();
    } catch {
      stopCamera();
      if (scanStatus) scanStatus.textContent = 'Camera access was blocked or unavailable. Allow camera permission, or enter the scanned code below.';
    }
  });
  if (startScanButton) window.addEventListener('hashchange', stopCamera, { once: true });
  document.querySelector('[data-checkin-manual-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (showScanResult(new FormData(form).get('token'))) form.reset();
  });

  document.querySelectorAll('[data-save-admin-order-status]').forEach((button) => button.addEventListener('click', () => {
    const [key, id] = button.dataset.saveAdminOrderStatus.split('|');
    const status = button.closest('.admin-orders-detail')?.querySelector('[data-admin-order-status]')?.value;
    const orders = readOrders(key);
    const order = orders.find((item) => String(item.id) === id);
    if (!order || !status) return;
    const previousStatus = order.status;
    order.status = status;
    order.adminStatus = status;
    order.statusHistory = [...(order.statusHistory || []), { status, previousStatus, changedAt: new Date().toISOString(), changedBy: 'Admin' }];
    localStorage.setItem(key, JSON.stringify(orders));
    window.dispatchEvent(new Event('hashchange'));
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
    order.receipt = { name: file.name, data, uploadedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(orders));
    window.dispatchEvent(new Event('hashchange'));
  }));
}
