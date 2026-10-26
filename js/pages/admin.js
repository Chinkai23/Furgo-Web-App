import { escapeHTML } from '../shared.js';
import { loadPromotions, maximumPromotions } from './admin-promotions.js';
import { loadGroomingBookings } from './grooming-data.js';
import { loadHotelBookings } from './hotel-data.js';
import { loadDaycareBookings } from './daycare-data.js';
import { countNewAdminOrders, countNewAdminOrdersFor } from './admin-orders.js';
import { loadPetTaxiJobs } from './driver.js';
import { mountDriverLocation } from './driver-location.js';

let taxiLocationCleanups = [];

// Admin dashboard: show live order and booking counts with quick links to each management window.
export function adminPortalPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const isExecutive = ['executive', 'staff'].includes(profile.role);
  const canManageServices = ['manager', 'director', 'admin'].includes(profile.role);
  const activePromotions = loadPromotions().length;
  const groomingBookings = loadGroomingBookings();
  const hotelBookings = loadHotelBookings();
  const daycareBookings = loadDaycareBookings();
  const newOrders = countNewAdminOrders();
  const newMarketplaceOrders = countNewAdminOrdersFor('marketplace');
  const adminEmail = `${profile.name || profile.email || 'admin@gmail.com'}${profile.outletShortform ? ` · ${profile.outletShortform}` : ''}`;
  const taxiJobs = loadPetTaxiJobs({ includeCompleted: true })
    .filter((job) => ['director', 'admin'].includes(profile.role) || (profile.outletName && String(job.outlet || '').trim().toLowerCase() === String(profile.outletName).trim().toLowerCase()));
  const taxiCards = taxiJobs.map((job) => {
    const inTransit = job.status === 'Pet Taxi Delivering...' && ['Picked Up', 'Returning to Customer'].includes(job.taxiStatus);
    const locationContent = inTransit
      ? `<div class="live-driver-location" data-live-driver-location data-order-key="${escapeHTML(job.orderKey)}" data-order-id="${escapeHTML(job.id)}"><p class="live-driver-location-waiting">Waiting for the driver to share their location…</p></div>`
      : '<p class="live-driver-location-waiting">Live tracking is available while the driver is travelling.</p>';
    return `<article class="admin-pet-taxi-card"><header><div><span>${escapeHTML(job.serviceLabel)} · ${escapeHTML(job.reference || job.id)}</span><h3>${escapeHTML(job.petName)} <small>With ${escapeHTML(job.customerName || 'Customer')}</small></h3></div><b>${escapeHTML(job.taxiStatus)}</b></header><dl><div><dt>Schedule</dt><dd>${escapeHTML(job.scheduledDate || 'Date pending')} · ${escapeHTML(job.scheduledTime || 'Time pending')}</dd></div><div><dt>Journey</dt><dd>${escapeHTML(job.journey || 'Pet Taxi')}</dd></div><div><dt>Pickup</dt><dd>${escapeHTML(job.pickupAddress || 'Address not provided')}</dd></div><div><dt>Drop-off</dt><dd>${escapeHTML(job.dropoffAddress || 'Address not provided')}</dd></div><div><dt>Customer</dt><dd>${escapeHTML(job.customerPhone || 'Phone not provided')}</dd></div><div><dt>Pet details</dt><dd>${escapeHTML([job.petBreed, job.petWeight ? `${job.petWeight} kg` : ''].filter(Boolean).join(' · ') || 'Details not provided')}${job.redFlags ? `<small>Care notes: ${escapeHTML(job.redFlags)}</small>` : ''}</dd></div><div><dt>Driver location</dt><dd>${locationContent}</dd></div></dl></article>`;
  }).join('');
  const stat = (label, value, href, executiveCanOpen = false) => isExecutive && !executiveCanOpen
    ? `<article class="admin-portal-stat-link is-static"><span>${label}</span><strong>${value}</strong></article>`
    : `<a class="admin-portal-stat-link" href="${href}"><span>${label}</span><strong>${value}</strong></a>`;
  const serviceCard = (name, description, artwork, href) => `<article class="admin-service-window"><img class="admin-service-window-artwork" src="${artwork}" alt="" /><div><h2>${name}</h2><p>${description}</p></div><a class="button button-primary" href="${href}">View Order <span aria-hidden="true">→</span></a></article>`;

  return `<main class="admin-portal-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(adminEmail)}</span><button type="button" data-logout>Log out</button></div></header>
    <section class="admin-portal-welcome"><span>Furgo management</span><h1>Admin Home</h1><p>Manage customer-facing content for the Furgo portal.</p></section>
    <section class="admin-portal-stats" aria-label="Admin dashboard summary">${stat('New orders · All services', newOrders, '#admin-orders', true)}${stat('Active promotions', `${activePromotions} <small>/ ${maximumPromotions}</small>`, '#admin-promotions')}${stat('Marketplace new orders', newMarketplaceOrders, '#admin-orders', true)}${stat('Grooming bookings', groomingBookings.length, '#admin-grooming')}${stat('Hotel reservations', hotelBookings.length, '#admin-hotel')}${stat('Daycare bookings & passes', daycareBookings.length, '#admin-daycare')}</section>
    <section class="admin-portal-tools" aria-label="Admin tools"><article class="admin-portal-tool"><div class="admin-tool-icon" aria-hidden="true">▤</div><div><h2>Order Management</h2><p>Review every new order, update its status, and upload customer receipts or invoices.</p></div><a class="button button-primary" href="#admin-orders">Manage Order <span aria-hidden="true">→</span></a></article>
      <!-- Service management uses a dashboard window grid for quick access to each portal. -->
      <section class="admin-service-windows" aria-label="Service management windows">${serviceCard('Marketplace', 'View products, supplier mappings, incoming orders, and shipping updates.', 'Image/Icon/MVP Icon-01.png', '#admin-marketplace')}${serviceCard('Grooming', 'View bookings, safety notes, service availability, and receipt updates.', 'Image/Icon/MVP Icon-02.png', '#admin-grooming')}${serviceCard('Pet Hotel', 'View room availability, reservations, care add-ons, and boarding updates.', 'Image/Icon/MVP Icon-04.png', '#admin-hotel')}${serviceCard('Pet Daycare', 'View rates, pass bookings, daily capacity, care add-ons, and the live roster.', 'Image/Icon/MVP Icon-03.png', '#admin-daycare')}</section>
      ${canManageServices ? '<section class="admin-manage-service-section"><div class="admin-manage-service-heading"><div><span>Service configuration</span><h2>Manage Service</h2><p>Update Grooming, Pet Hotel, Pet Daycare, and shared Pet Taxi settings.</p></div></div><div class="admin-manage-service-grid"><a class="button button-primary" href="#admin-grooming?manage=1">Manage Grooming</a><a class="button button-primary" href="#admin-hotel?manage=1">Manage Pet Hotel</a><a class="button button-primary" href="#admin-daycare?manage=1">Manage Pet Daycare</a><a class="button button-primary" href="#admin-addons">Manage Add-on</a><a class="button button-primary" href="#admin-pet-taxi">Manage Pet Taxi</a><a class="button button-primary" href="#admin-promotions">Manage Promotions</a></div></section>' : ''}
      <section class="admin-pet-taxi-section" aria-labelledby="admin-pet-taxi-title"><div class="admin-pet-taxi-heading"><div><span>Driver operations</span><h2 id="admin-pet-taxi-title">Pet Taxi</h2><p>Review taxi routes, customer and pet details, pickup status, and the driver’s latest shared location.</p></div><a class="button button-light" href="#admin-orders">View all orders</a></div><div class="admin-pet-taxi-list">${taxiCards || '<p class="admin-pet-taxi-empty">No Pet Taxi bookings yet. Taxi requests from Grooming, Pet Hotel, and Pet Daycare will appear here.</p>'}</div></section>
    </section>
    ${isExecutive ? '<dialog class="admin-restricted-dialog" data-restricted-dialog><div><h2>Higher Admin Level Required</h2><p data-restricted-dialog-copy></p><button class="button button-primary" type="button" data-close-restricted-dialog>OK</button></div></dialog>' : ''}
    <a class="admin-portal-customer-link" href="#home">Open Customer Portal</a>
  </main>`;
}

export function setupAdminPortal() {
  taxiLocationCleanups.forEach((cleanup) => cleanup());
  taxiLocationCleanups = [...document.querySelectorAll('[data-live-driver-location]')].map(mountDriverLocation);
  const dialog = document.querySelector('[data-restricted-dialog]');
  const copy = dialog?.querySelector('[data-restricted-dialog-copy]');
  document.querySelectorAll('[data-restricted-feature]').forEach((button) => button.addEventListener('click', () => {
    if (!dialog || !copy) return;
    copy.textContent = `Manager or Director admin access is required to manage ${button.dataset.restrictedFeature}.`;
    dialog.showModal();
  }));
  dialog?.querySelector('[data-close-restricted-dialog]')?.addEventListener('click', () => dialog.close());
}
