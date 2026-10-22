import { escapeHTML } from '../shared.js';
import { applyTaxiScan } from './check-in.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { daycareBookingsKey, loadDaycareBookings } from './daycare-data.js';
import { startQRScanner } from '../qr-scanner.js';

export const driverLocationsKey = 'furgo-demo-driver-locations';
const DRIVER_EMAIL = 'driver@gmail.com';

function readLocations() {
  try { const value = JSON.parse(localStorage.getItem(driverLocationsKey) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}

function locationKey(orderKey, orderId) { return `${orderKey}|${orderId}`; }

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Provides the latest location shared for this particular taxi booking to Admin and Customer pages.
export function driverLocationForOrder(orderKey, orderId) {
  return readLocations()[locationKey(orderKey, orderId)] || null;
}

// Shared route data powers the Driver Portal and the Admin dashboard taxi section.
export function loadPetTaxiJobs({ includeCompleted = false } = {}) {
  const jobs = [];
  const add = (source, order, details) => {
    if (!details || !details.enabled) return;
    if (/cancel/i.test(String(order.status || ''))) return;
    jobs.push({ ...order, ...details, orderKey: source.key, serviceLabel: source.label, taxiStatus: order.taxiProgress?.status || 'Scheduled' });
  };
  loadGroomingBookings().forEach((order) => add({ key: groomingBookingsKey, label: 'Grooming' }, order, {
    enabled: order.includeTaxi,
    scheduledDate: order.date,
    scheduledTime: order.taxiSchedule || order.time,
    pickupAddress: order.pickup,
    dropoffAddress: order.dropoff || order.outlet,
    journey: 'Customer pickup and service drop-off',
  }));
  loadHotelBookings().forEach((order) => add({ key: hotelBookingsKey, label: 'Pet Hotel' }, order, {
    enabled: Boolean(order.taxi?.pickup || order.taxi?.dropoff),
    scheduledDate: order.taxi?.pickup ? order.checkIn : order.checkOut,
    scheduledTime: order.taxi?.schedule,
    pickupAddress: order.taxi?.pickup ? order.taxi.address : order.outlet,
    dropoffAddress: order.taxi?.pickup ? order.outlet : order.taxi?.address,
    journey: order.taxi?.pickup && order.taxi?.dropoff ? 'Check-in pickup & check-out drop-off' : order.taxi?.pickup ? 'Check-in pickup' : 'Check-out drop-off',
  }));
  loadDaycareBookings().forEach((order) => {
    const type = String(order.taxiTrip || '').toLowerCase();
    const pickupOnly = type === 'pickup';
    const dropoffOnly = type === 'dropoff';
    add({ key: daycareBookingsKey, label: 'Pet Daycare' }, order, {
      enabled: order.includeTaxi && ['pickup', 'dropoff', 'both'].includes(type),
      scheduledDate: order.date,
      scheduledTime: order.taxiSchedule,
      pickupAddress: dropoffOnly ? order.outlet : order.taxiAddress,
      dropoffAddress: pickupOnly ? order.outlet : dropoffOnly ? order.taxiAddress : `${order.outlet} / return`,
      journey: pickupOnly ? 'Customer pickup' : dropoffOnly ? 'Customer drop-off' : 'Pickup & drop-off',
    });
  });
  return jobs.filter((job) => job.type !== 'pass-purchase' && job.petName && (includeCompleted || job.taxiStatus !== 'Dropped Off'))
    .sort((a, b) => new Date(a.scheduledDate || 0) - new Date(b.scheduledDate || 0) || String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
}

function mapLink(location) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return '';
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=16/${encodeURIComponent(location.latitude)}/${encodeURIComponent(location.longitude)}`;
}

function jobCard(job) {
  const taxiStatus = job.taxiStatus;
  const nextStage = taxiStatus === 'Picked Up' ? 'Drop-off' : 'Pickup';
  const latest = driverLocationForOrder(job.orderKey, job.id);
  const href = mapLink(latest);
  const pickupMap = job.pickupAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.pickupAddress)}` : '';
  const dropoffMap = job.dropoffAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.dropoffAddress)}` : '';
  const isToday = job.scheduledDate === localDateKey();
  return `<article class="driver-job-card"><header><div><span>${escapeHTML(job.serviceLabel)} · ${escapeHTML(job.reference || job.id)}</span><h2>${escapeHTML(job.petName)} · ${escapeHTML(job.customerName || 'Customer')}</h2></div><b class="driver-job-status">${escapeHTML(taxiStatus)}</b></header><div class="driver-job-details"><div><small>Schedule</small><strong>${isToday ? 'Today · ' : ''}${escapeHTML(job.scheduledDate || 'Date pending')} · ${escapeHTML(job.scheduledTime || 'Time pending')}</strong></div><div><small>Journey</small><strong>${escapeHTML(job.journey)}</strong></div><div><small>Pickup address</small><strong>${escapeHTML(job.pickupAddress || 'Address not provided')}</strong>${pickupMap ? `<a href="${pickupMap}" target="_blank" rel="noopener">Open pickup navigation</a>` : ''}</div><div><small>Drop-off address</small><strong>${escapeHTML(job.dropoffAddress || 'Address not provided')}</strong>${dropoffMap ? `<a href="${dropoffMap}" target="_blank" rel="noopener">Open drop-off navigation</a>` : ''}</div><div><small>Customer</small><strong>${escapeHTML(job.customerName || '—')} · ${escapeHTML(job.customerPhone || 'Phone not provided')}</strong></div><div><small>Pet</small><strong>${escapeHTML([job.petBreed, job.petWeight ? `${job.petWeight} kg` : ''].filter(Boolean).join(' · ') || 'Details not provided')}</strong>${job.redFlags ? `<span class="driver-job-alert">Care notes: ${escapeHTML(job.redFlags)}</span>` : ''}</div></div><footer><button class="button button-primary" type="button" data-driver-track="${escapeHTML(`${job.orderKey}|${job.id}`)}">Share live location</button>${href ? `<a class="button button-light" href="${href}" target="_blank" rel="noopener">View last shared location</a>` : ''}<span class="driver-job-next">Next scan: ${nextStage}</span>${latest ? `<small class="driver-location-time">Location updated ${escapeHTML(new Date(latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</small>` : ''}</footer></article>`;
}

// Driver Portal: assigned prototype taxi visits for today and future dates, with customer/pet details and QR tools.
export function driverPortalPage() {
  const jobs = loadPetTaxiJobs();
  const today = localDateKey();
  const upcoming = jobs.filter((job) => !job.scheduledDate || job.scheduledDate >= today);
  return `<main class="admin-portal-page driver-portal-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#driver"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Driver Portal</span></a><div class="admin-portal-account"><span>${DRIVER_EMAIL}</span><button type="button" data-logout>Log out</button></div></header><section class="driver-portal-welcome"><span>Pet Taxi operations</span><h1>My Routes</h1><p>Review today’s and upcoming trips, pickup details, and pet care notes.</p></section><section class="driver-portal-summary"><article><span>Today’s trips</span><strong>${upcoming.filter((job) => job.scheduledDate === today).length}</strong></article><article><span>Upcoming trips</span><strong>${upcoming.filter((job) => job.scheduledDate !== today).length}</strong></article><article><span>Waiting for pickup</span><strong>${upcoming.filter((job) => job.taxiStatus === 'Scheduled').length}</strong></article><article><span>In progress</span><strong>${upcoming.filter((job) => job.taxiStatus === 'Picked Up').length}</strong></article></section><section class="driver-jobs-section" id="driver-trips"><div class="driver-section-heading"><div><span>Assigned Pet Taxi orders</span><h2>Today & Future Trips</h2></div></div><div class="driver-job-list">${upcoming.map(jobCard).join('') || '<div class="driver-empty"><h2>No Upcoming Pet Taxi Orders</h2><p>Taxi requests from Grooming, Pet Hotel, and Pet Daycare will appear here.</p></div>'}</div></section></main><nav class="driver-bottom-nav" aria-label="Driver actions"><button type="button" data-driver-open-scanner aria-label="Scan customer QR code"><img src="Image/Icon/Icon-09.png" alt="" /><span>Scan QR</span></button></nav><dialog class="driver-scan-dialog" data-driver-scan-dialog aria-labelledby="driver-scan-title"><header><h2 id="driver-scan-title">Scan Customer Order QR</h2><button type="button" data-driver-close-scan aria-label="Close scanner">×</button></header><video data-driver-scan-video playsinline muted hidden></video><p data-driver-scan-feedback role="status" aria-live="polite">Use the camera or enter the customer’s code.</p><form data-driver-manual-scan><label>QR code<input name="token" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="17" minlength="10" pattern="[2-9A-HJ-NP-Z]{5}-?[2-9A-HJ-NP-Z]{5}|[2-9A-HJ-NP-Z]{17}" placeholder="e.g. 7K4MR-9TX2C" required /></label><button class="button button-primary" type="submit">Apply pickup / drop-off scan</button></form></dialog>`;
}

// Driver interactions: camera/manual QR scan advances a taxi trip; GPS sharing is limited to an active job.
export function setupDriverPortal() {
  const dialog = document.querySelector('[data-driver-scan-dialog]');
  const video = document.querySelector('[data-driver-scan-video]');
  const feedback = document.querySelector('[data-driver-scan-feedback]');
  if (!dialog || !video || !feedback) return;
  let cameraScanner = null;
  let watchId = null;
  let activeLocationJob = '';
  const stopCamera = () => { cameraScanner?.stop(); cameraScanner = null; video.pause(); video.srcObject = null; video.hidden = true; };
  const stopLocation = () => { if (watchId !== null) navigator.geolocation?.clearWatch(watchId); watchId = null; activeLocationJob = ''; };
  dialog.querySelector('[data-driver-close-scan]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stopCamera);
  const applyScan = (rawCode) => {
    const result = applyTaxiScan(rawCode);
    feedback.textContent = result.ok ? result.message : result.message;
    if (result.ok) window.setTimeout(() => { if (dialog.open) dialog.close(); window.dispatchEvent(new Event('hashchange')); }, 900);
    return result.ok;
  };
  document.querySelector('[data-driver-manual-scan]')?.addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; if (form.reportValidity()) applyScan(form.elements.token.value); });

  document.querySelectorAll('[data-driver-track]').forEach((button) => button.addEventListener('click', () => {
    if (!navigator.geolocation) { feedback.textContent = 'Location sharing is unavailable in this browser.'; return; }
    stopLocation();
    activeLocationJob = button.dataset.driverTrack;
    button.textContent = 'Sharing location…';
    const locationStatus = button.parentElement.querySelector('.driver-job-next');
    if (locationStatus) locationStatus.textContent = 'Requesting location permission…';
    watchId = navigator.geolocation.watchPosition((position) => {
      const [orderKey, orderId] = activeLocationJob.split('|');
      const locations = readLocations();
      locations[locationKey(orderKey, orderId)] = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: new Date(position.timestamp || Date.now()).toISOString(), driverEmail: DRIVER_EMAIL };
      localStorage.setItem(driverLocationsKey, JSON.stringify(locations));
      if (locationStatus) locationStatus.textContent = `Live location shared · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      document.dispatchEvent(new CustomEvent('furgo-driver-location-updated', { detail: { orderKey, orderId } }));
    }, (error) => {
      if (locationStatus) locationStatus.textContent = error.code === 1 ? 'Location permission was denied.' : 'Unable to read the current location.';
      button.textContent = 'Share live location';
      stopLocation();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }));

  document.querySelectorAll('[data-driver-open-scanner]').forEach((button) => button.addEventListener('click', async () => {
    feedback.textContent = 'Use the camera or enter the customer’s code.';
    dialog.showModal();
    if (cameraScanner) return;
    try {
      feedback.textContent = 'Starting camera…'; video.hidden = false;
      cameraScanner = await startQRScanner({
        video,
        shouldRun: () => dialog.open,
        onStatus: (message) => { feedback.textContent = message; },
        onCode: (code) => { applyScan(code); return true; },
      });
    } catch (error) { stopCamera(); feedback.textContent = `${error.message} Enter the code below instead.`; }
  }));
  window.addEventListener('hashchange', () => { stopCamera(); stopLocation(); }, { once: true });
}
